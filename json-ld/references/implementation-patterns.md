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
- **Django/Rails/Laravel/PHP**: build the structure server-side, serialize with the framework's JSON encoder, escape `<` (Django `json_script` handles this natively — reuse it), emit in the layout/view.
- **WordPress / sites with an SEO plugin already emitting JSON-LD**: extend the plugin's graph through its API (Yoast `wpseo_schema_*` filters, RankMath equivalents). Never emit a second parallel graph next to a plugin's — conflicting nodes are worse than shallow ones. If the plugin can't express what's needed, that's an intake/report conversation, not a silent workaround.

## Fixing and converting existing markup

- **`fix` action**: correct in place — wrong property names, wrong value types, stale values (rewire to live data rather than re-hardcoding a fresh value that will go stale again).
- **`deepen` action**: keep what's valid, add missing required/recommended properties, connect loose nodes into the `@graph` with proper `@id`s.
- **`convert` action** (microdata/RDFa → JSON-LD; only with intake approval): build the JSON-LD equivalent from the *data source* (not by transliterating the old markup — it may be wrong), verify parity, then strip the old `itemprop`/`itemscope`/RDFa attributes in the same change. Leaving both formats live means two sources of truth that will disagree.
- **Deduplication**: one node per `@id` per page. When two emitters exist (hand-rolled + library), consolidate into the builder module and delete the loser.

## Templates vs one-off pages

For templated routes, the builder runs on the route's real data at render time — every product page gets its markup for free, including future ones. Never generate per-instance static JSON files for templated content. Hardcoded graphs are acceptable only for genuinely static one-off pages (the homepage's Organization/WebSite layer may be constants — but still built through the shared module).
