# Agent — Admin REST API

You own Admin REST call sites. You have **two possible jobs**, and the plan says which one was approved:

- **Job A — version bump only.** Keep REST, move it to the target version, fix what broke.
- **Job B — migrate REST → GraphQL.** Only when the plan explicitly approved it.

Never do Job B when only Job A was approved. Read `shopify-upgrade-plan.md` first, then this file.

> **The two lines below decided the scope and the headline of every real REST run so far.** Both are further down; know them before you start. **(1)** If your `/admin/api/` grep hits cluster in one file, you have found the *routing table*, not the callers — that turned a "219-endpoint surface" into 12 actual call sites. **(2)** A field that stops being returned has four possible endings and only one of them is loud; the dangerous one is a **write** into a `NOT NULL` column, which passes every test against existing data and fails on the first genuinely new record.

> Examples here are illustrative. Verify endpoint shapes against the target version's REST reference before acting.

## Context you must carry into the report

The REST Admin API is a **legacy** API as of 2024-10-01, and since 2025-04-01 all new public apps must be built exclusively with the GraphQL Admin API. It is still versioned and still served — legacy is not removed — but it receives no new capability, and some resources have GraphQL-only successors. If the project is on REST and the user hasn't decided about GraphQL, the report should say this plainly once, without turning the upgrade into a campaign.

## Job A — version bump

### 1. Find every call site

REST is harder to inventory than GraphQL because a call site can be a bare string. Sweep for:

- `/admin/api/<version>/<resource>.json` in any language
- SDK REST helpers (`shopify.rest.Product.all()`, `ShopifySharp` services, `ShopifyAPI::Product`, Laravel package REST calls)
- Path builders that assemble the URL from parts — the version and resource may never appear adjacent in source
- Anything reading `Link` headers for pagination, or `X-Shopify-*` response headers

### 2. Determine each endpoint's fate in the target version

**Count the call sites before you research anything.** A REST client that is constructed and exported but never invoked carries no risk at all, whatever version it pins — and this is common, because the client factory outlives the code that used it. Grep for actual invocations (`client.rest`, `.get(`/`.post(` on that handle, `/admin/api/` URLs, raw `fetch` to the shop domain) and count them. **Zero is a first-class result**: it retires the entire surface, turns "seven releases of unvalidatable REST change" into "dead code, no exposure", and it costs one grep.

**Those greps are JavaScript-shaped, and outside JS they return noise or nothing.** Check what you actually caught before trusting the count:

- A **URL grep can be all declaration and no call.** A Guzzle service description or any table-driven client declares every endpoint in one array — 219 `admin/api/{version}/…` lines that are zero call sites. If your `/admin/api/` hits cluster in one file, you have found the routing table, not the callers. Find the *consumers* of that table instead.
- **Magic dispatch hides the verb and the path.** PHP (`__call`/`__get`, `$shopify->Order->count()`), Ruby `method_missing`, and Python `__getattr__` produce call sites containing no URL, no HTTP verb and no `.json`. Grep for the **resource names** and the client handle, not for the shapes above.
- **Operation names can be data.** Subclasses returning `'get_products'` from a method, config arrays, and string constants are all real call sites that no code-shaped pattern matches.
- **The version literal in source can be dead.** `env('SHOPIFY_API_VERSION', '2022-04')` is a *fallback* — the deployed value may be neither, and a framework config cache (`php artisan config:cache` → `bootstrap/cache/config.php`) can freeze a third value entirely. Report the resolution order, not just the literal.

Then, for a non-zero count, the number is not the finding — **who calls it** is. For each call site record whether it runs on request or unattended (a cron, a scheduled job, a queue worker), because an unattended sync that writes to storage is where a silent field change does damage nobody watches. Report count **and** entry points.

REST has **no schema and no validator** — `validate_graphql_codeblocks` cannot help here, and a clean GraphQL validation run says nothing about REST. Sourcing is `search_docs_chunks` (**omit `api_name`** — `"admin"` means Admin GraphQL and returns no REST at all; then read the version out of each result's URL, because without `api_name` the results span versions) plus the changelog. Your report must say which method backed each claim.

### Proving a removal without a validator

SKILL.md's rule — *"X was removed" needs positive evidence* — has no validator to lean on here, so it needs its own instrument. Do not settle for "I searched and found no removal notice": that is the absence of evidence the rule exists to reject. Instead build the positive comparison yourself:

1. Fetch the versioned REST reference for the resource at **both** the current pin and the target — the URL carries the version: `https://shopify.dev/docs/api/admin-rest/<version>/resources/<resource>`.
2. Diff the documented field lists and endpoint lists between the two. A field present at the old version and absent at the target is **evidence**. Identical lists are evidence of *no* change, which is a finding worth stating with its scope ("Order: 30 documented field paths, both versions, no difference").
3. Report the comparison, not the conclusion — "two resources diffed, 0 differences" is checkable; "REST looks fine" is not.

Note that **Shopify no longer publishes versioned API release notes**: `release-notes/<version>` 404s, and `release-notes/latest` serves an old page whose own text says they stopped and to use the developer changelog instead. So the most natural place to look for "what changed in REST between two versions" does not exist any more, and its absence is not evidence either.

For each endpoint that is actually called:

- Does it still exist at the target version? Check the versioned REST reference for that resource.
- Have request/response fields been added, removed, or retyped?
- Has it acquired a GraphQL-only successor (i.e. the REST version is frozen while the real functionality moved)?
- Have pagination, filtering, or rate-limit semantics changed?

### 2b. Grep the changelog for the field names, not just the surface

A surface sweep (`--surface "admin rest"`) tells you what changed in REST. It does **not** reliably tell you what changed in *the fields this code reads*, because a removal is usually titled after the field and filed under a surface label you may not have filtered for. Take the identifiers straight out of your call-site inventory — every response field the code consumes, every query parameter it sends — and grep each one:

```bash
node scripts/changelog-scan.mjs changelog.html --grep pre_tax_price --grep total_spent --grep orders_count
```

That single query surfaces *"Removal of `pre_tax_price` from the Order REST Admin API"* — a `Breaking change` on a resource a reporting app calls constantly, and one that a surface-only pass reported as `BREAKING 0`. REST has no validator to catch what you fail to look up, so this is not a refinement here the way it is on GraphQL: **it is the only mechanism that finds a removed REST field at all.**

### 3. Behavior changes that survive an unchanged URL

- **Pagination** — cursor (`Link` header) vs. legacy page params; default and max `limit` changes
- **Rate limits** — REST uses a separate leaky-bucket budget from GraphQL; `Retry-After` handling matters
- **Field presence** — a field that stops being returned does not 404. What happens next is language- and storage-dependent, and "it becomes `undefined`" is only the JavaScript answer. Trace each vanished field to what consumes it, because there are four different endings and only one of them is loud:
  - **Silently stale.** A mass-assignment write (`updateOrCreate`, `fill`, `**payload`, `Object.assign`) simply omits the absent key, so the **previous stored value survives** — not null, not undefined, just quietly wrong and indistinguishable from correct. This is the most common outcome in ORM-backed code and the hardest to detect after the fact.
  - **Silently skipped.** A guard like `if (!array_key_exists('tags', $c)) return;` turns the whole routine into a no-op. A mark-and-sweep that never sweeps looks exactly like one with nothing to do.
  - **Hard failure on write.** If the value lands in a `NOT NULL` column with no default, it fires only when inserting a genuinely *new* record — so it passes every test against existing data and breaks weeks later on a row nobody was watching.
  - **Loud null dereference** — the case people expect, and the rarest.

  Read the schema and the write path, not just the read. And when you trace the failure, follow it through the framework: whether the layer above throws, no-ops, or persists decides which of these four you actually have, and asserting the wrong one produces a confident, checkable, wrong finding.
- **Truncated collections** — the endpoint exists, returns `200`, and returns a **shorter array** than it used to. Page-size ceilings differ between REST and the platform, so a resource that outgrew the REST cap comes back complete-looking and partial. This is more dangerous than a missing field, because a missing field usually surfaces as an error somewhere while a short array looks like valid data — and a sync that reconciles "what I fetched" against "what I stored" will happily delete the difference. For any code that fetches a collection and then writes based on what came back, check the ceiling against the real cardinality before you touch anything.
- **Deprecation headers** — `X-Shopify-API-Deprecated-Reason` on a response is the platform naming a specific problem. If you can make a live call, capture it; it is the highest-signal source available for REST.

### 4. Rewrite and validate

Update field access, pagination, and error handling per the ledger. There is no schema validator for REST, so verification leans on the project's own tests and, where possible, a real call against a dev store. State plainly which endpoints were verified live and which were changed on documentation alone.

## Job B — migrate REST → GraphQL

Only with explicit approval. This is a rewrite, not a bump.

### Ground rules

- **One resource at a time**, each independently reviewable and revertible. Do not convert the whole surface in one diff.
- **Behavior parity first, idiomatic GraphQL second.** The goal is identical observable behavior. Resist restructuring while translating — a reviewer must be able to check equivalence.
- **Every mapping is verified against the target schema**: write the candidate GraphQL operation and run it through `validate_graphql_codeblocks` at the target version before it goes in the diff. REST field → GraphQL field mappings are not always same-named, and are never guessable. `search_docs_chunks` resolves the intended replacement; the validator proves the query is real.

### The traps

- **IDs change form.** REST numeric IDs become GraphQL GIDs (`gid://shopify/Product/123`). Anything that stores, compares, logs, or round-trips an ID is affected — including your database. Converting *at the boundary* and leaving storage alone is usually right; decide explicitly and say which you did.
- **Errors move.** REST signals failure with HTTP status codes; GraphQL returns `200` with `userErrors`. Error handling must be rewritten, not adapted. A migrated call path that still branches on HTTP status will treat every failure as success.
- **Rate limiting is a different model.** REST's request-count bucket becomes GraphQL's query-cost budget. Code tuned for one will misbehave on the other; check the cost of the new queries.
- **Nested data changes the shape of everything.** GraphQL's big win — fetching related data in one call — changes the response shape your consumers read. Either preserve the old shape at the boundary or update consumers in the same commit.
- **N+1 gets worse, or much better.** A REST loop often maps to a single GraphQL query with a connection. Taking that win is fine; note it, because it changes performance characteristics reviewers may be measuring.
- **Not everything has moved.** Some REST functionality has no GraphQL equivalent yet, and some has an equivalent with different semantics. If you find one, stop, leave the REST call in place, and report it as a blocked row. Do not approximate.

### Validate

Every generated GraphQL document goes through the Dev MCP validator at the target version. Then run the project's tests. A REST→GraphQL migration without passing tests or a live dev-store check is reported as **unverified**, prominently.

## Report back

Which job you did. Per call site: file:line, ledger row, old endpoint → new endpoint or query, source URL, verification status. Then: endpoints changed on documentation alone (no live call), blocked rows with no GraphQL equivalent, ID-format decisions and their blast radius, and error-handling rewrites a reviewer should look at closely.
