# Agent — Admin GraphQL API

You own every Admin GraphQL call site in the approved ledger, plus webhook **payload** shape (the payload follows the webhook's own version — see the webhooks note below).

Read `shopify-upgrade-plan.md` first, then this file. Edit only call sites that have a ledger row.

> **Every concrete example in this file is illustrative, not authoritative.** Field names, deprecations, and limits change every quarter. Verify each one against the target version's schema before acting on it. A confident memory of the Shopify schema is the main way this job goes wrong.

## 1. Extract every call site's real selection set

Before checking anything, know exactly what the code asks for. GraphQL documents hide in more places than a grep for `query {` finds:

- Template literals (`gql\`…\``, `#graphql` -tagged strings), `.graphql`/`.gql` files, codegen inputs
- Fragments defined apart from their use — **resolve them**; a removed field inside a shared fragment breaks every operation that spreads it
- Dynamically assembled query strings (concatenation, interpolation) — these cannot be statically validated and must be flagged in the report as verify-by-hand
- Variables typed against input objects — input fields get removed too, and a removed **input** field is as breaking as a removed output field
- `userErrors` selections — the error type on a mutation changes shape between versions more often than the payload does

- Operations declared as **module-level constants** (`const MUTATION_X = \`mutation …\``) far from the `.request()` that sends them. These are what inventories miss, because grepping near the call site finds a variable name, not a document. Extract by matching every template literal whose body contains `query <name>` or `mutation <name>`, then deduplicate on whitespace-normalised text.

Produce, per call site: the operation, every field path it selects, every argument it passes, every enum value it sends, and every input type it constructs.

Report **unique operations and total occurrences**, with every file:line. Two constants differing by one selected field are two operations, and collapsing them hides which line a fix belongs on. Then **reconcile your extraction against the plan's inventory and report any discrepancy** — the plan was written by a sweep, and a sweep indexes definitions, not sends. A plan that lists one `getCustomer` where the code has three is not wrong about the fate of the operation, but it is wrong about where a reviewer will find it.

## 2. Validate each operation against the target version

There is no introspection tool — the MCP forbids it (`references/sourcing.md`). Instead send the operations themselves to `validate_graphql_codeblocks` with `api: "admin"` and `version: <target>`, batching several code blocks per call:

| Validator result | Tier | Action |
|---|---|---|
| `Cannot query field "X" on type "Y"` | `BREAKING` | Field is gone in the target. Quote the error into the ledger row. |
| `Unknown argument` / `Field "X" argument "Y" of type "Z!" is required` | `BREAKING` | Signature changed; add or drop the argument |
| `Value "X" does not exist in "SomeEnum" enum` | `BREAKING` | Map to the replacement — resolve the name from docs, never guess |
| `Unknown type` / `Field "X" is not defined by type "SomeInput"` | `BREAKING` | An input field was removed; as breaking as an output field |
| `⚠️ INFORM` — "the field X is deprecated…" | `DEPRECATED` | The note carries the reason and links the changelog entry. Quote it; take the removal version from the linked entry |
| `✅ SUCCESS` | — | No row. For the fields **this document selects**, it is also a deprecation all-clear — say so rather than re-deriving it from the docs |
| Valid, with `Required scopes: …` | maybe `SCOPE` | Record the scopes. Union them across all operations and diff against the app's declared `scopes`; anything missing is a `SCOPE` row |

Send the query **as the codebase sends it**, variables and fragments resolved. A validator pass on a hand-simplified query proves nothing about the real one.

**What the validator still does not cover.** It reports deprecations for the fields a document *selects* (`⚠️ INFORM`), so it will not tell you about a deprecated field nothing in the codebase asks for — which is fine, because that is not your problem — and it gives a reason without a removal date. Close those two gaps:

- Follow the changelog link in the `INFORM` note for the **removal version**. "Will be removed in a future version" is not a date, and a `DEPRECATED` row without one cannot be accepted as debt.
- Use `search_docs_chunks` (`api_name: "admin"`, `version: <target>`) when a replacement is unnamed, or when the MCP was unreachable and you are working from docs alone.
- If the app is live, the `X-Shopify-API-Deprecated-Reason` response header names deprecated call sites in production traffic — the only source that tells you which ones actually *run*.

The deprecation reason string is still the highest-value text in this process: Shopify usually names the replacement in it. Quote it into the ledger row rather than paraphrasing, and cite where you got it.

## 3. Change categories worth checking explicitly

Validation catches shape changes. These are the ones that hide **behind** an unchanged shape — check each against the changelog entries for your ladder:

- **Connections and pagination** — default and maximum page sizes change; code that relies on an implicit default silently returns a different set. Anything reading `edges` without following `pageInfo.hasNextPage` is a latent bug the upgrade may expose.
- **Query cost / throttling** — cost per field and bucket restore rates change between versions. A query that fit the budget may now throttle. Check `extensions.cost` in a real response if you can run one.
- **Mutation error surfaces** — `userErrors` gaining fields or being replaced by a typed error union; codes added or renamed. Code that string-matches on an error message is fragile by construction — flag it.
- **Async/bulk operations** — bulk mutations and operations change status enums and polling contracts.
- **Metafields and metaobjects** — the most-churned area of the schema. Type/definition/owner semantics, filter validity, and access controls all shift. Filters that used to fail silently may now error.
- **IDs** — anything that parses, builds, or stores a GID by string manipulation. Never construct GIDs by hand; if the code does, that is a finding regardless of whether this version breaks it.
- **Money, taxes, and units** — currency and measurement field shapes change; a silently different unit is worse than an error.

## 4. Rewriting

- **The replacement comes from the versioned docs or the changelog entry — never from inference.** The schema is not readable here; `search_docs_chunks` is where the field's deprecation notice lives, and the notice usually names the replacement. If it doesn't, fetch the changelog entry page and read the migration steps. Then prove the candidate: write the rewritten operation and run it through `validate_graphql_codeblocks` at the target before it goes in the diff. If nothing resolves it, leave the row unresolved and report it; do not invent a plausible field name.
- **Preserve the operation's contract.** Downstream code reads a specific shape. If the replacement field returns a different shape, update the consumers in the same edit and say so — a query that compiles while its consumer reads a now-missing property is the worst possible outcome.
- **Aliases are your friend** when a rename would otherwise ripple: `oldName: newField` keeps consumers working. Use it deliberately and comment why, not as a way to avoid touching consumers you should have updated.
- **Codegen**: if the project generates types from the schema, regenerate against the target version and let the type errors find the consumers for you. Note in your report that codegen ran — reviewers need to know which diff hunks are generated.
- **Don't touch the version constant.** The orchestrator flips it in Phase 6 — including when the constant is the *only* thing in your ledger. A ledger whose rows are all version constants means your job is verification, not editing: check every operation against the target, report **"clear, 0 edits"**, and stop. That is a successful run, not an empty one.
- **Don't edit a file another surface also owns**, even for a row that is yours. A shared client wrapper often constructs the Admin GraphQL *and* the Admin REST client side by side; the REST client's version is not yours to change, and the file is the orchestrator's to edit. Hand back both rows with their file:line.

## 5. Webhooks

Webhook payloads follow the **webhook subscription's** version, which is independent of your client's version. Two distinct jobs:

1. **Payload consumers** — handlers parsing webhook bodies. If the webhook version is moving, their expected fields must be checked against that version's payload shape, not the Admin client's.
2. **Topic changes** — topics get added, renamed, and retired. A subscription to a retired topic stops delivering, silently.

If the webhook version is *not* moving in this upgrade, say so explicitly in your report — a reviewer seeing Admin GraphQL go to the target will otherwise assume webhooks came along.

## 6. Validate before reporting done

1. Validate every rewritten document with the Dev MCP's GraphQL validation tool **against the target version**. Not optional.
2. Re-resolve fragments and confirm no operation still selects a removed field.
3. If the project has typecheck/lint, run it.
4. For dynamically-built queries you could not validate, list them explicitly as unverified.

## 7. Report back

Per call site: file:line, ledger row, what changed, the source URL that justified it, and whether it validated. Then: unresolved rows and why, dynamically-built queries needing manual review, consumers updated alongside a shape change, and any `DEPRECATED` rows left in place with their removal versions.
