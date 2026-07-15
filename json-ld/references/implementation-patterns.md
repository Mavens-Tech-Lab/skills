# Phase 5 — Implementation patterns

You are writing production code that emits the property maps from `jsonld-scan.md`. Match the codebase's conventions (language, module style, naming, test patterns). The non-negotiables:

## Architecture: one builder module, thin call sites

Create a single shared module (`src/lib/jsonld.ts` or the codebase's equivalent location/language) that owns:

- the site URL + `@id` constants (one definition of `ORG_ID`, `WEBSITE_ID`, …)
- `organizationNode()`, `webSiteNode()` — called by every page, so the site-wide nodes stay byte-identical
- per-entity builders (`productNode(product)`, `articleNode(post)`, `breadcrumbNode(items)`) that take the **same data object the template renders** and return plain objects
- `pageGraph(...nodes)` → `{"@context": "https://schema.org", "@graph": [...]}`
- one serializer used by every call site (see safety below)

Pages/templates compose builders and render one script tag. No page hand-writes JSON. In TypeScript projects, type the builders with `schema-dts` (`import type { Product, WithContext } from 'schema-dts'`) **if adding a dev dependency fits the project's habits** — it catches property typos at compile time; otherwise plain objects are fine because Phase 6 validates against fetched definitions anyway.

Builders implement the property map literally: the documented transforms, the documented "if empty" behavior (a null source ⇒ the key is *absent*, not `null`/`""`).

## Serialization safety (XSS)

JSON-LD blocks frequently carry user- or CMS-authored strings. A description containing `</script><script>...` breaks out of the tag if serialized naively. The shared serializer must escape after stringify:

```js
const safeJsonLd = (data) =>
  JSON.stringify(data).replace(/</g, '\\u003c');
```

(`<` is valid inside JSON strings, so the payload stays parseable while the raw HTML can no longer terminate the script element. Escaping `>` and `&` too is harmless if the codebase prefers.) Every injection pattern below assumes the string went through this.

## Framework injection patterns

JSON-LD must be in the **server-rendered HTML response** (head or body — both valid; follow the codebase's head-management pattern). Client-only injection is a last resort for client-only apps, flagged in the report.

- **Next.js (App Router)**: render in the page/layout component: `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(graph) }} />`. The Metadata API does not cover JSON-LD; this inline pattern is the documented approach. Server components: build the graph next to the data fetch.
- **Next.js (Pages Router)**: same script tag inside `next/head`.
- **Astro**: `<script type="application/ld+json" is:inline set:html={safeJsonLd(graph)} />` — `is:inline` stops Astro processing it, `set:html` avoids double-escaping.
- **Nuxt 3**: `useHead({ script: [{ type: 'application/ld+json', innerHTML: safeJsonLd(graph) }] })`. If `nuxt-schema-org`/`@unhead/schema-org` is already installed, use it instead of parallel plumbing — configure it to emit the same graph.
- **SvelteKit**: inside `<svelte:head>`: `{@html `<script type="application/ld+json">${safeJsonLd(graph)}</script>`}` (the serializer is what makes `@html` acceptable here).
- **SSGs (Hugo/Jekyll/Eleventy)**: a partial/include that builds the object from page params + site config and emits via the engine's safe-JSON filter (`jsonify`, etc.).
- **Django/Rails/Laravel/PHP**: build the structure server-side, serialize with the framework's JSON encoder, escape `<` to `\u003c` (Django `json_script` handles this natively — reuse it; PHP: `JSON_HEX_TAG`), emit in the layout/view.
- **WordPress** and **Shopify Liquid themes**: full playbooks below — these two platforms have pre-existing emitters (plugins/apps/theme) that make "just add a script tag" the wrong move.

## Platform playbook: WordPress

Decide by what's already emitting:

- **SEO plugin present (Yoast, Rank Math, AIOSEO…)** — extend its graph through its documented API; never emit a parallel graph beside it. Yoast's filters (verify current names at `https://developer.yoast.com/features/schema/api/`): `wpseo_schema_graph_pieces` to add/remove pieces, `wpseo_schema_<class>` to modify one piece (organization, webpage, article…), `wpseo_schema_graph` for whole-graph operations, `wpseo_json_ld_output` to disable entirely. Rank Math has an equivalent single filter (`rank_math/json_ld`) — confirm on its current developer docs before use. If the plugin fundamentally can't express what's needed, disabling its output and owning the graph is an **intake decision**, not a silent workaround.
- **WooCommerce** — it emits its own `Product` markup; deepen through its `woocommerce_structured_data_*` filters (product, breadcrumb, …; verify names in the current Woo docs) with values from the `WC_Product` getters. Never add a second Product node next to Woo's.
- **No plugin** — hook `wp_head` and print the graph. Serialize with `wp_json_encode( $graph, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_SLASHES )` — `JSON_HEX_TAG` is PHP's native escaping of `<`/`>` to `\u003C`/`\u003E`, satisfying the serializer rule with no custom code.
- **Where the code lives**: a small site-specific plugin (or mu-plugin) when the theme is third-party — it survives theme updates; the child theme's `functions.php` when a child theme already carries site logic. Never edit a parent/purchased theme directly.
- **Data sources for the property map**: post fields, `get_post_meta`, ACF `get_field()`, taxonomy terms, `WC_Product` getters, site options (`get_bloginfo`, customizer settings) — same traceability rules; dates via `get_the_date('c')` / `get_the_modified_date('c')` for ISO 8601.

## Platform playbook: Shopify (Liquid themes)

**Themes vary — never assume one.** Shopify's reference themes change (Dawn, then Horizon), stores run countless third-party and heavily customized themes, and even the reference themes put their structured data in differently named section files. Everything below is discovered by grepping *this* theme and auditing *this* storefront's rendered HTML — never by assuming file paths or patterns from any specific theme.

- **Use the Shopify Dev MCP as the platform's documentation source.** Check whether the Shopify Dev MCP (`@shopify/dev-mcp`) is connected (look for its tools, e.g. via ToolSearch). If it is, query it for everything platform-specific: Liquid object fields and their types, filter behavior, theme architecture best practices — it is to Shopify what the live schema.org fetch is to the vocabulary, and it's what lets the property map cite real Liquid data structures instead of remembered ones. If it's not connected, **recommend the user install it** before Shopify implementation work:

  ```json
  "mcpServers": {
    "shopify-dev-mcp": {
      "command": "npx",
      "args": ["-y", "@shopify/dev-mcp@latest"]
    }
  }
  ```

  (In Claude Code: `claude mcp add shopify-dev-mcp -- npx -y @shopify/dev-mcp@latest`.) Proceeding without it is allowed — fall back to fetching `https://shopify.dev/docs/api/liquid` pages — but say which mode you're in.
- **Native filter first**: Shopify maintains `{{ product | structured_data }}` (emits `Product`, or `ProductGroup` for multi-variant products) and `{{ article | structured_data }}` (emits `Article`) — both current reference themes emit exactly this from their product/article sections. Prefer it for those two objects: it's platform-maintained and variant-aware. Hand-build everything else (`Organization`, `WebSite`, `BreadcrumbList`, `CollectionPage`/`ItemList`, `LocalBusiness` for retail…) and anything the filter's output is missing for the store's needs (check its rendered output first — and verify current filter behavior via the Dev MCP).
- **Hand-built pattern**: one snippet per node group (`snippets/jsonld-organization.liquid`, …), rendered from `layout/theme.liquid` or the relevant section via `{% render %}`. Build **per property** with `{{ value | json }}` — it quotes and escapes for you; never hand-quote values, never dump whole objects (`{{ product | json }}` both over-exposes data and deliberately omits inventory fields).
- **Escaping caveat**: `| json` escapes quotes but is not documented to escape `<`, so `</script>` breakout via merchant-authored content is possible. For rich-text fields use `{{ field | strip_html | json }}` — JSON-LD wants plain text anyway, and stripping removes the risk.
- **Money is in minor units**: `variant.price` is cents — emit `{{ variant.price | divided_by: 100.0 }}`, never the `money*` filters (locale formatting breaks the bare-number rule). Currency from `cart.currency.iso_code`; availability from `variant.available` mapped to the schema.org URL.
- **Three emitter layers — audit all before adding a fourth**: (a) the theme itself — reference themes ship Organization/WebSite JSON-LD from header/section files and product/article markup via `structured_data`, but locations and coverage differ per theme, so grep `layout/`, `sections/`, and `snippets/` for `application/ld+json` and `structured_data`; (b) **SEO apps** injecting markup at runtime, invisible in the repo — only the rendered storefront HTML shows them; (c) leftovers from past developers. One source of truth per entity: theme markup you can edit or remove; app markup you can't — either the app's settings turn its types off, or the theme yields. This conflict is an intake question when both exist.
- **Data sources**: Liquid objects (`shop`, `product`, `collection`, `article`, `page` — verify available fields via the Dev MCP, not memory), theme settings (`settings.*` — themes commonly keep logo and social links there; read this theme's `config/settings_schema.json` for its actual setting ids, e.g. `settings.social_*_link` → `sameAs`), and metafields (`product.metafields.<ns>.<key>`) for what the base objects lack (GTIN, brand overrides). OS 2.0 note: `templates/*.json` only wire sections — the emitters and data access live in `sections/` and `snippets/`.
- **Rendered check**: `shopify theme dev` and curl the preview URL through `scripts/extract-jsonld.mjs` — on Shopify this is doubly mandatory because it's the only way to see app-injected markup next to yours.

## Fixing and converting existing markup

- **`fix` action**: correct in place — wrong property names, wrong value types, stale values (rewire to live data rather than re-hardcoding a fresh value that will go stale again).
- **`deepen` action**: keep what's valid, add missing required/recommended properties, connect loose nodes into the `@graph` with proper `@id`s.
- **`convert` action** (microdata/RDFa → JSON-LD; only with intake approval): build the JSON-LD equivalent from the *data source* (not by transliterating the old markup — it may be wrong), verify parity, then strip the old `itemprop`/`itemscope`/RDFa attributes in the same change. Leaving both formats live means two sources of truth that will disagree.
- **Deduplication**: one node per `@id` per page. When two emitters exist (hand-rolled + library), consolidate into the builder module and delete the loser.

## Templates vs one-off pages

For templated routes, the builder runs on the route's real data at render time — every product page gets its markup for free, including future ones. Never generate per-instance static JSON files for templated content. Hardcoded graphs are acceptable only for genuinely static one-off pages (the homepage's Organization/WebSite layer may be constants — but still built through the shared module).
