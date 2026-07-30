# Agent — Storefront API, Customer Account API, Hydrogen

You own the customer-facing GraphQL surfaces: the **Storefront API**, the **Customer Account API**, and Hydrogen/headless clients. Read `shopify-upgrade-plan.md` first, then this file.

These are separate APIs from Admin with separate versions, separate tokens, separate schemas, and separate breaking changes. A repo can and often does run Admin and Storefront on different versions — that is not a mistake to normalize.

> Examples are illustrative. Verify against the target version's schema and docs.

## What makes this surface different

**The blast radius is customers, not staff.** An Admin break shows up as a failed background job someone notices. A Storefront break shows up as a product page that won't add to cart, at whatever hour it deploys. Weight your risk assessment accordingly and say so in the plan: `BEHAVIOR` rows here deserve more scrutiny than the same row on Admin.

**Caching hides breakage.** Hydrogen/Oxygen and CDN caching mean a broken query may surface gradually as caches expire, not immediately at deploy. Never conclude "it works" from a single post-deploy page load.

**Public tokens are visible.** Storefront access tokens ship to the browser by design. If you touch token handling, do not "fix" a public token into a private one, and never move a *private* Storefront token into client-visible code.

## 1. Inventory

Per surface, find every operation. Same rules as Admin GraphQL — resolve fragments, chase codegen inputs, flag dynamically-built queries — plus:

- **Hydrogen**: `storefrontApiVersion` in the storefront client config, `createStorefrontClient`, loaders/actions issuing queries, and cache strategies attached to them. The Hydrogen framework version and the Storefront API version are different things; check both.

### Resolving an unpinned Hydrogen app — the default case, not an edge case

`storefrontApiVersion` is optional and every Shopify template omits it, so **most Hydrogen apps contain no version literal at all**. The sweep will correctly report zero pins; that is not the answer, it is the start of the question. The version comes from the release, and Shopify publishes the mapping as npm dist-tags:

```bash
npm view @shopify/hydrogen version       # → 2026.4.4   → Storefront API 2026-04
npm view @shopify/hydrogen dist-tags     # → "2025-01": "2025.1.5", "2025-05": "2025.5.1", "latest": "2026.4.4"
```

The rule that does the work: Hydrogen `YYYY.M.x` **is** Storefront API `YYYY-MM`, so the release number alone answers the question.

**Do not treat the dist-tag map as a complete per-version index.** It is useful for older releases but Shopify stopped adding date-shaped tags — at the time of writing they stop at `2025-05` while `latest` is `2026.4.4`. A missing `2026-04` tag therefore proves nothing about whether that version exists. Read the version number and apply the rule; use the tag map only to confirm what it does contain. Read the **lockfile**, not the `^` range in `package.json` — `^2025.1.1` and a resolved `2025.1.1` are different facts, and only one of them is running. Record the resolved API version as this surface's pinned version and price the ladder from it.

### One app can run several versions at once — check for per-call overrides

A Hydrogen app does not have *a* version. The client has a default, and **individual calls can override it**, so "this repo pins nothing" is a conclusion you can only reach after looking for the overrides. Shopify's own template ships them: `app/lib/sitemap.ts` passes `storefrontApiVersion: 'unstable'` on its sitemap loaders. Grep before concluding anything:

```bash
grep -rn "storefrontApiVersion\|apiVersion:" app/ src/
```

Each override is its own inventory row with its own ladder, and an `unstable` override is a `HAZARD`: it tracks a version Shopify may change without notice, so those call sites can break on a day nobody deployed. **Validate each overriding call at the version it actually runs at**, not at the app's default and not at the target — a document that fails at the target may be perfectly fine at `unstable`, and tiering it `BREAKING` on that basis is a false alarm that costs real work.

### Check the ceiling before you validate anything

**The target may be unreachable, and this surface is where that normally happens.** Hydrogen ships weeks to months after each API release, so "newest Hydrogen trails newest stable API" is the steady state. At the time of writing, newest stable is `2026-07` while `npm view @shopify/hydrogen version` returns `2026.4.4` — API `2026-04`. There is no release that gets you to 2026-07.

So before validating a single document:

```bash
npm view @shopify/hydrogen version      # newest release → its API version is your ceiling
```

If the ceiling is below the requested target, that gap is its own ledger row — tier it `BLOCKED` — and it changes what you are delivering: not an API-version bump, but a framework upgrade with a lower ceiling and a wait. **Validate at the ceiling as well as at the requested target, and report both.** A clean validation run at an unreachable target reads as "ready to upgrade" and is the most confidently wrong output this surface can produce.

Do not close the gap by hand-setting `storefrontApiVersion` past the framework. Hydrogen's own client docs say it "should almost always be the same as the version Hydrogen React was built for": the compiled cart and product documents inside the framework are the older shape, so raising the string alone gives you a client asking a new version for old fields.
- **Customer Account API**: newest of the three and the most likely to be unpinned or on an old version. Auth flows (OAuth, session handling) are part of this surface — a change there is a login outage.
- **Cart**: cart operations are the highest-risk area on this surface. Enumerate every cart mutation separately in the ledger, no matter how small the change looks.

## 2. Check against the target

Validate the operations themselves — `validate_graphql_codeblocks` with `api: "storefront-graphql"` or `api: "customer"`, and `version: <target>`. These are **separate schemas from Admin**, so they need their own validation pass and their own `learn_shopify_api` call: a clean Admin run proves nothing here, and reporting it as if it did is the mistake this section exists to prevent. Fall back to the versioned Storefront / Customer Account references via `search_docs_chunks` where an operation can't be validated, and say per surface which method backed each claim.

Classify exactly as the Admin GraphQL agent does (absent → `BREAKING`, deprecated → `DEPRECATED` with reason and removal version, argument now required → `BREAKING`, and so on).

## 3. Change categories worth checking explicitly

- **Cart and checkout** — the Cart API evolves continuously; checkout-related types have been progressively replaced. Anything touching checkout URLs, cart lines, discounts, delivery, or buyer identity gets read carefully.
- **Customer accounts** — legacy customer accounts vs. new customer accounts are genuinely different models with different APIs. Confirm which one the code targets before changing anything.
- **Selling plans, subscriptions, bundles** — composite product models change shape.
- **Markets, localization, currency** — `@inContext` directive arguments (country, language) and their effects on prices and availability. A dropped or changed context argument silently returns the wrong market's prices, which is a correctness bug no test may catch.
- **Metafields on storefront** — visibility rules and access changed materially over time; a metafield that used to render may now require explicit exposure.
- **Media and images** — image transformation parameters and media types.
- **Search and filtering** — predictive search and filter inputs.

## 4. Rewriting

- Replacement fields come from the schema or the changelog entry. Never inferred.
- **Update the rendering code in the same edit.** A storefront query is consumed by a template; a shape change that stops at the query layer produces a blank price rather than an error.
- **Preserve `@inContext` semantics exactly.** If the arguments change, the market/locale behavior must be verified, not assumed.
- **Cache keys**: if a query changes and the project caches by query hash or an explicit key, stale entries can serve the old shape to new code. Check the cache strategy and note any key that needs invalidating at deploy — this belongs in the report as a deploy step.
- Don't touch the version constant; the orchestrator does that in Phase 6.

## 5. Validate

1. Validate every rewritten document against the target version with the Dev MCP validator.
2. Typecheck/build the storefront. For Hydrogen, a successful build is the minimum bar, not the finish line.
3. **Render-level check where possible** — run the dev server and load one real page per template type that changed (product, collection, cart, account). A passing build with an empty price element is the exact failure this step exists to catch.
4. Exercise the cart path end to end if any cart operation changed. If you cannot, say so loudly.

## 6. Report back

Per surface: old → new version, which verification method backed each claim (schema validation vs. docs), and per call site file:line + ledger row + source URL. Then, called out separately: cart/checkout changes, auth or customer-account changes, `@inContext`/market behavior touched, cache keys needing invalidation at deploy, and anything verified only by build rather than by render.
