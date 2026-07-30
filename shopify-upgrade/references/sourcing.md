# Phase 2 — Sourcing: where change facts come from

Every claim this skill makes about a field, endpoint, or behavior must trace to something fetched **this run**. This file is the sourcing contract. Read it before building the ledger.

> **Two sections decide more answers than the rest of this file combined.** If you read nothing else first, read them: **"A retired version's doc page redirects"** — because the standard old-vs-new doc diff silently returns *identical* content for a retired version, which reads as "nothing changed" and inverts your finding; and **"A date is not a liveness claim — `effectiveApiVersion` is"** — because it decides whether a row describes production today or risk you are choosing to take on later. Everything else here is how to fetch things correctly. Those two are how to not be confidently wrong.

## The hierarchy

| Rank | Source | Use it for | Trust |
|---|---|---|---|
| 1 | **Schema validation** at the target version (Dev MCP `validate_graphql_codeblocks`, `version: <target>`) | Does this exact query still parse against the target schema? Which field is gone? | Authoritative. It runs against the real schema. |
| 2 | **Changelog entry page** (`/changelog/<slug>.md`) | Why it changed, what to do instead, exact migration steps | Authoritative for behavior + migration |
| 3 | **Versioned reference docs** on shopify.dev | REST endpoint shapes, Liquid objects, scope names | Authoritative, but read the version selector |
| 4 | **Model memory** | Nothing. | Zero. Not a source. |

Rank 4 is not a fallback. If ranks 1–3 are unreachable, the answer is "unverified", and it goes in the report as such.

## Resolving the target version

1. Versions are `YYYY-MM` with MM ∈ {01, 04, 07, 10} — quarterly, released at the start of the quarter, 5pm UTC.
2. Each stable version is supported **at least 12 months**, with **at least 9 months of overlap** between consecutive versions.
3. A **release candidate** publishes on the same date as the stable one and "may include backwards-incompatible changes, so not recommended for production."
4. **Shopify has no LTS.** If the user says "upgrade to LTS", they mean the newest stable — confirm that reading rather than inventing a designation Shopify doesn't have.

Resolve stable-vs-RC from the live changelog, never by assuming the newest number you see is safe: the newest version tag in the feed is usually the RC. Cross-check against a versioned doc page's version selector, which marks the stable one.

Then enumerate the **version ladder**: every quarterly release from each pinned version through the target inclusive. `2024-10 → 2026-07` crosses `2025-01, 2025-04, 2025-07, 2025-10, 2026-01, 2026-04, 2026-07` — seven releases of accumulated change. The ladder defines the changelog date window (`--since` = the release date of the currently pinned version) and tells the user how far they're actually jumping.

## Fetching the changelog — the part that goes wrong

**Fetch this URL, and only this one:**

```bash
curl -sSL https://shopify.dev/changelog -o changelog.html
```

That single HTML response server-renders the **entire** changelog — roughly 780 entries covering about two years — with a status marker and surface label on each. Then filter locally:

```bash
node scripts/changelog-scan.mjs changelog.html \
  --since 2024-10-01 --status breaking --status action \
  --surface "admin graphql"
```

**Three traps, each of which returns data that looks complete and isn't:**

| Trap | What happens | Why |
|---|---|---|
| `https://shopify.dev/changelog.md` | Returns only ~50 recent entries (~6 weeks) | The `.md` endpoint serves a short rolling window, not the archive |
| `?page=2`, `?page=5` | Returns the same ~780 entries as page 1 | Pagination is applied by client-side JS; the server ignores the param. The bodies differ only in a build-asset hash, so a byte-diff says "changed" while the content is identical |
| `?api_type=admin-graphql` | **Filters, and silently truncates the history** | This one *does* work server-side — and it is still the wrong fetch. Measured: 95 entries covering ~7 months, against 783 covering ~2 years unfiltered. You lose most of the version ladder to gain a filter you can apply locally for free |

None of these error. Each returns a page that looks like the changelog and is missing most of it, which is the single easiest way to produce a confidently incomplete upgrade plan — so fetch the bare URL above, once, and do all filtering locally.

The `.md` suffix **does** work on individual entries, and that is where the real content is:

```bash
curl -sSL https://shopify.dev/changelog/<slug>.md
```

An entry page carries what changed, who's affected, why, and concrete migration steps — roughly 15× the index one-liner. `changelog-scan.mjs --urls` emits exactly these URLs for the filtered set, ready to feed a fetcher.

### A retired version's doc page redirects, and the redirect is silent

Fetching the same doc page at two versions and diffing them is the standard way to prove a field was removed. It has a trap that inverts the result: **a retired version has no doc page, and its URL `301`s to `/latest/`.** With `curl -L` — or any fetcher that follows redirects, which is all of them — you get a `200` and a body, and the body is *current* content wearing the URL you asked for.

```bash
curl -sI .../api/storefront/2025-01/enums/SitemapType.md   # → HTTP/2 301
curl -sI .../api/storefront/2026-04/enums/SitemapType.md   # → HTTP/2 200
```

So the old-vs-new diff comes back **identical**, and identical reads as "nothing changed" — the exact opposite of the finding. Two habits close it: check the status code before following (`curl -sI`, or `-w '%{http_code} %{url_effective}'`), and treat a version whose doc page redirects as evidence in itself — that version is retired, which is usually a bigger finding than whatever field you were checking. Anchor removal claims on a version that actually serves a page, and say which versions you compared.

### A date is not a liveness claim — `effectiveApiVersion` is

The index gives every entry a **date**, and the date is when Shopify announced or shipped the change. It is **not** when the change starts affecting a given app. That is carried separately, in the entry page's own frontmatter:

```yaml
metadata:
  effectiveApiVersion: 2026-04
```

So an entry dated `2026-03-23` flagged `effectiveApiVersion: 2026-04` does nothing at all to code being served `2025-10`. Reading the date alone and concluding "this field has been null since March" is a fabricated production incident — it reverses the actual finding, and it is convincing because the date is real.

**The index does not carry this field.** `changelog-scan.mjs` reports `versions: []` for these entries, because the flag only exists on the entry page. So before writing any row that claims something is *already* broken:

1. Fetch the entry's `.md` and read `metadata.effectiveApiVersion`. Not every entry has one — an entry without it is not version-gated.
2. Compare it to the version the app is **actually served** (which for an out-of-support pin is not the version it names — see SKILL.md on fall-forward).
3. Partition accordingly: `effectiveApiVersion` ≤ served version → **already live, this is current behaviour**. Greater than served → **not yet live, this is upgrade risk**. Those are two different tiers, two different urgencies, and two different conversations with the user.

### Status markers

Shopify labels each entry, and the labels are the triage:

| Marker | Meaning for the ledger |
|---|---|
| `Breaking change` | Read the entry page. Almost always a `BREAKING` or `BEHAVIOR` row if the codebase touches it. |
| `Action required` | Read the entry page. Often a `SCOPE` row or a deadline. |
| `Update` | Skim titles. Usually `OPPORTUNITY`, occasionally a quiet default change. |
| `Note` | Informational. |

Surface labels are Shopify's own strings — `Admin GraphQL API`, `Admin REST API`, `Storefront API`, `Customer Account API`, `Functions`, `Themes`, `Liquid`, `App Bridge`, `Admin Extensions`, `Checkout UI`, `POS Extensions`, `Events & webhooks`, `Hydrogen`, `Payments Apps API`. Match loosely (`--surface "admin graphql"`); don't assume a label exists because a surface does.

**Do not filter by surface alone.** Cross-surface entries exist (a webhook payload change is tagged Admin GraphQL API), and platform-wide changes carry generic labels. For any jump, also run an unfiltered `--status breaking` pass over the full ladder window and skim every title.

### Cross-reference by identifier, not just by surface

Surface filtering answers "what changed in Admin GraphQL?" — usually dozens of entries. The question you actually need answered is "what changed in the *fields this code calls*?" So take the identifiers out of the inventory — root fields, mutations, REST resources, Function targets, webhook topics — and search for them directly:

```bash
node scripts/changelog-scan.mjs changelog.html --since 2025-07-01 \
  --grep cartTransform --grep shopifyFunctions --grep functionHandle
```

`--grep` is repeatable (matches any) and ignores case and separators, so the identifier as written in your code finds the headline as written by Shopify — `cartTransformCreate` matches "Cart transform create…". Without that normalization the search silently returns nothing and reads as "no entry affects this call site."

Three limits to respect:

- **It searches titles only.** A title is a headline, not an index — an entry can change a field it never names. Identifier search *adds* precision to the surface sweep; it does not replace it.
- **A zero result is not an all-clear.** It means no *title* mentioned it. For anything on the critical path, the schema is the authority, not the changelog.
- **Broad beats specific.** Shopify's headlines are prose, so a guessed phrase usually returns nothing while the single word it is about returns plenty: `--grep "checkout extensibility"` → 0, `--grep checkout` → 36. Start with one word per surface, read the titles, then narrow.

### The window is a hard floor, and it bites deprecations hardest

Print the coverage line and look at it. The index reaches back roughly **two years** — so a feature deprecated before that is *invisible here, at every search term*. This is the trap: the version ladder for an old codebase reaches further back than the changelog does, exactly where the oldest and most urgent obligations live.

So for anything the sweep reports under **deprecated platform features**, the changelog is the *second* source, not the first:

1. `search_docs_chunks` for the migration guide — docs carry the whole history, the changelog does not.
2. Then `--grep <broad term> --status action` for a *dated* notice. When one exists it is usually titled with the date (*"Shopify Scripts will be deprecated on June 30, 2026"*), which is the single most useful string in the whole feed: compare it to today's date before writing the plan. **Some of these dates are already in the past.**

Never let a 0-hit grep on an old deprecation reach the plan as "no action required".

## Using the Dev MCP

The MCP is what makes rank 1 possible. It has **five tools**, and the order is not optional.

**Before any of it: what you send leaves the machine.** Every validator call ships the code block to Shopify, and `learn_shopify_api` ships the user's prompt verbatim. That is the deal the skill discloses at Phase 0, and it is fine for a GraphQL document — it is not fine for a credential. Real codebases keep access tokens (`shpat_…`, `shppa_…`, `shpss_…`), shop domains and API secrets inline, sometimes on the same line as the client that issues the query. **Redact before you validate**: send the operation, not the client construction, and replace any token, secret or customer identifier with a placeholder. A validator answers exactly the same for `shpat_REDACTED`. This is the one place where the skill can create a side effect it cannot undo.

**Step 0, mandatory: `learn_shopify_api`.** It returns a `conversationId` that every other tool requires; skip it and they all error. Call it once per API surface (`admin`, `storefront-graphql`, `customer`, `functions`, `liquid`, `pos-ui`, `polaris-*`, `payments-apps`, …), reusing the same `conversationId` so it stays one session. Pass `version: <target>` so searches and validations scope to the version you are migrating *to*.

Then, per surface:

- **`validate_graphql_codeblocks`** — the rank-1 check. Paste a real query or mutation **from the codebase**, set `version` to the target, and read the error verbatim into the ledger row: *`Cannot query field "priceRule" on type "LineItem"`* is a sourced `BREAKING` row. Batch several code blocks per call. Re-validate the rewrite with the same `artifactId` and an incremented `revision`.

  **It also reports required scopes, and that is the `SCOPE` tier's only real source.** A successful validation comes back as, for example, `Successfully validated GraphQL mutation against schema. Required scopes: write_order_edits, read_orders, read_marketplace_orders, read_quick_sale`. Collect those per operation, union them, and diff against the `scopes` the app declares in `shopify.app*.toml` (the sweep prints them under **Access scopes declared**). Anything required but not declared is a `SCOPE` row — every already-installed merchant must re-authorize, and no code change can do that for them. Do this at the **target** version specifically: an operation that needed one scope last year can need three now, and that change is invisible in the diff.
- **`search_docs_chunks`** — versioned docs. Resolve *why* it changed and what replaces it, confirm scope names, and answer what the changelog entry left open. Pass `api_name` and `version`; an unversioned search silently answers for "latest".

  **Two traps, and they pull in opposite directions.** `api_name: "admin"` means *Admin GraphQL*, so passing it on a REST question returns GraphQL chunks and zero REST content — a REST search must **omit `api_name` entirely**. But omitting it removes the version scoping too: the same query then comes back with pages from several different versions at once (`/admin-rest/2026-01`, `/admin-rest/latest`, unversioned). So for REST, **read the URL of every result and discard the ones that aren't your version** — the answer is only as versioned as the URL it came from, and nothing in the response says which version it is other than that path.
- **`validate_theme`** — Liquid and theme files, given the theme directory.
- **`validate_component_codeblocks`** — Polaris, checkout/admin/customer-account UI extension and POS component code. Needs `extensionTarget` for extension surfaces.

**There is no introspection tool, and reaching for one is a documented dead end.** The MCP's own instructions state: *"ONLY use the `search_docs_chunks` and `validate_graphql_codeblocks` MCP tools. Do NOT use `fetch_full_docs` or `introspect_graphql_schema`."* Any older instruction to introspect a schema — including in an agent's own memory — is stale. Validation replaces it, and is the better instrument here: it tests the query the codebase actually sends, not a type read in isolation.

Be ready for the server to contradict itself on this. `learn_shopify_api(api: "functions")` ends with *"You can use the `introspect_graphql_schema` tool before fixing an invalid input query"* — advice the `admin` context explicitly forbids, for a tool the server does not expose in either. **Trust the tool list, not the prose.** If a returned instruction names a tool you cannot see, it does not exist for you: use `validate_graphql_codeblocks` to find the error and `search_docs_chunks` to find the fix, and do not spend turns hunting for the tool.

**The validator has three outcomes, not two**, and the third is the one people miss:

| Status | Means | Do |
|---|---|---|
| `✅ SUCCESS` | Parses, and selects nothing deprecated | Record it. For the fields **that document selects**, this *is* a deprecation all-clear — count it as one rather than re-deriving it by hand |
| `⚠️ INFORM` | Parses, but selects a deprecated field | Most of a `DEPRECATED` row, free: it names the field, gives the reason, and links the changelog entry inline |
| `❌ FAILED` | Does not parse at the target | A `BREAKING` row, with the exact error |

An `⚠️ INFORM` looks like this, verbatim:

> *Successfully validated GraphQL query against schema. Note: The field `CartCost.totalDutyAmount` is deprecated. Tax and duty amounts are no longer available and will be removed in a future version. Please see [the changelog](https://shopify.dev/changelog/tax-and-duties-are-deprecated-in-storefront-cart-api) for more information.*

Take the reason from the note and the **removal version** from the linked entry — the note says "a future version", which is not a date.

So the older advice to derive every deprecation by hand from the docs is wrong, and expensive: it re-does work the validator already did on exactly the fields you care about. Go to the docs for the two cases the validator cannot cover — a field **no document in the codebase selects**, and any run where the MCP is unreachable. There, read the page the right way: **the per-field deprecation marker is the index, not the page's "deprecated fields" summary block.** Type pages carrying deprecated fields sometimes render no summary at all, so a check aimed at the summary returns "none" and reads exactly like a real all-clear. Drive off the per-field marker, and probe your own extractor with a field name you know is on the page — if the probe misses, "no deprecations found" is an extraction failure, not a finding.

Two more limits to state in the report rather than paper over:

- Coverage is **GraphQL only** — Admin, Storefront, Customer Account, Partner, Payments Apps, and per-target Function input schemas (`api: "functions_discount"`, `functions_cart_transform`, …). It does **not** cover Admin REST, Liquid semantics, or extension runtime APIs. Never let a clean GraphQL run imply those were checked.
- The validator accepts only a fixed set of versions. Treat that enum as an **indicator, not the authority**: a pin it will not accept cannot be validated, which is worth recording — but the enum can lag the real support table, and the two do disagree. The dated accessibility table in Shopify's versioning docs is the more specific statement, and a live response's `X-Shopify-API-Version` header beats both. When they conflict, say which you used and why rather than quietly picking one.

If the MCP is unavailable, fall back to versioned reference docs via WebFetch, and mark every "field removed" claim in the ledger as **inferred, not verified**. Say so in the plan and the report.

## The ledger

One row per affected call site. Rows with no source do not exist.

```markdown
| # | file:line | Uses | Fate in <target> | Tier | Source (fetched <date>) | Fix |
|---|---|---|---|---|---|---|
| 1 | app/orders.ts:42 | `order.lineItems.priceRule` | removed in 2026-10 | BREAKING | changelog/remove-pricerule-from-draft-order-discount-warning.md | use `discountApplication` |
```

Rules:

- **A call site with no ledger row is not edited in Phase 5.** The ledger is the work list and the authorization.
- Every row names a source **URL** and the date fetched. "The schema says so" is not a source; the validator's verbatim error, or a changelog entry URL, is.
- A call site that is fine gets no row. The ledger is not an inventory.
- When a fix is uncertain, the row says so and becomes a question for Phase 4, not a guess in Phase 5.
- Deprecations carry their **removal version** when the schema or entry states one; that date is what makes "accept as debt" a real choice in Phase 4.

## Coverage statement (required output)

Phase 2 ends by writing, into the plan:

```
Coverage
  Ladder: 2024-10 → 2026-07 (7 releases)
  Changelog index: fetched <date>, covers <first> → <last>
    → versions before <first> are NOT covered by changelog
  Schema validation: Admin GraphQL @ 2026-07 — <n> operations validated, <n> failed
  NOT validatable, docs-only: Admin REST, Liquid, extension runtime APIs
  Deprecated features found: <n> (<n> with a date already past)
    → announced before <first>, so docs-only: <list>
  Unverified claims: <n> (listed in the ledger)
```

If any line of that block would be embarrassing to show the user, that is the signal it needs to be in the report — not the signal to omit it.
