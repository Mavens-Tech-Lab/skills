---
name: shopify-upgrade
description: Upgrade a Shopify integration to a newer API version — any language (JS/TS, PHP, Python, Ruby, Go, .NET, raw HTTP) and every surface (Admin GraphQL, Admin REST, Storefront, Customer Account, Functions, App Bridge, admin/checkout/POS extensions, webhooks, Liquid themes, Hydrogen). Detects every version the repo actually pins (surfaces routinely differ) plus dated platform deprecations that carry no version string at all, resolves the newest stable target (Shopify has no LTS), builds a per-call-site change ledger validated against the target version's schema and the live shopify.dev changelog instead of model memory, presents a risk-tiered plan for approval, then migrates each surface with a specialist agent and verifies the result. Use this skill whenever the user asks to upgrade/bump/migrate a Shopify API version or a Shopify SDK/gem/package (a dependency bump moves the API version silently), move to a version like 2026-07, migrate Admin REST to GraphQL, port checkout.liquid or checkout Additional Scripts to Checkout Extensibility, port Shopify Scripts to Functions, upgrade Hydrogen, App Bridge or a checkout/admin UI extension, fix Shopify deprecation warnings or X-Shopify-API-Deprecated-Reason headers, resolve a Shopify breaking change or sunset notice, check whether a pinned version is still supported or which new access scopes will force merchants to re-authorize, or asks "which Shopify version are we on and what breaks if we upgrade".
license: MIT
---

# Shopify Version Upgrade

Move a Shopify integration to a newer API version, grounded in three sources of truth:

1. **The codebase's real call sites** — every field, endpoint, mutation, filter, and webhook topic the code actually uses
2. **The live schema and changelog** — fetched this run from shopify.dev, never recalled from memory
3. **A verified build** — the migration is done when the validators and the project's own build/tests pass, not when the version string changes

The workflow is: **install tooling → detect current versions → build the change ledger → plan → STOP for approval → parallel migration agents → verify and report**.

## Critical framing (read before editing a single file)

- **A long-dead pin may not be running the version it names.** A request naming an unsupported version does not simply fail — Shopify serves it from a supported version instead. **Verify this rather than assuming it**, because it inverts how the entire plan reads: for a pin inside the support window the ledger describes **future** risk the user chooses when to take on, while for a pin years past it the ledger may be describing **current** production behaviour, in which case "we haven't upgraded yet" is not the safe option but the unexamined one. Establish which situation the repo is in before writing the plan, and say so in the first line of it. Two ways to settle it: the `publicApiVersions` query returns every version with a `supported` boolean straight from the store (needs credentials — ask the user to run it if you can't), and a live response's `X-Shopify-API-Version` header names the version actually served, which is the only fully authoritative answer. If neither is available, say the question is open rather than assuming either way.
- **A version pin is not the only deadline.** Some of the most exposed Shopify codebases pin no API version at all. A Liquid theme still shipping `layout/checkout.liquid`, or an app still carrying Ruby Shopify Scripts, has a dated obligation that no version string expresses — and a report that stops at "no version pins found" tells that repo it has nothing to do. The sweep reports these separately as **deprecated platform features**; they are ledger rows like any other, and a `SUNSET` row outranks every version bump in the plan.
- **Bumping the version string is the LAST edit, never the first.** The dominant failure mode in Shopify upgrades is changing `2024-10` to `2026-07` in one constant, watching the build pass, and shipping a runtime outage — because the code still asks for fields that no longer exist. Nothing in the type system catches this: GraphQL is validated by the server at request time, and REST returns a 200 with a different body. **Migrate every call site first. The version constant is flipped by the orchestrator in Phase 6, once all surfaces report clear — never by a specialist agent, and never for a surface with an unresolved row.**
- **Live schema or stop.** Shopify ships a new version every quarter and the schema changes in every one. Model memory about which fields exist in a given version is stale by construction and confidently wrong. Every claim that a field/endpoint/argument is removed, deprecated, renamed, or safe MUST come from a source fetched this run (`references/sourcing.md`). **With no network at all, stop** — there is no honest way to proceed. With network but no Dev MCP, continue on versioned docs alone and label every "removed" claim *inferred, not verified*. Note that for **REST, Liquid and extension runtime APIs there is no validator to begin with**, so docs-only is the normal mode there and not a degraded one — see each surface's reference for what counts as proof instead.
- **There is no LTS.** Versions are date-based quarterly releases (`YYYY-01/04/07/10`), each stable for **at least 12 months** with at least 9 months of overlap. The target is the newest **stable** version. The release candidate published alongside it (e.g. `2026-10` shipping beside stable `2026-07`) "may include backwards-incompatible changes" and is **not** a valid target unless the user explicitly asks and accepts that. Resolve both from the live changelog — never hardcode, and never assume this file's examples are current.
- **A new required access scope is an operational event, not a code change.** If the target version requires a scope the app doesn't hold, every already-installed merchant must **re-authorize** — code alone cannot fix it. Surface this in the plan as its own line item with a merchant-comms note. Silently adding a scope to the TOML produces an app that fails for existing installs only.
- **REST→GraphQL is a separate decision from a version bump.** The REST Admin API has been legacy since 2024-10-01 and new public apps have been GraphQL-only since 2025-04-01, but a version bump and a protocol migration are different-sized changes. Never fold one into the other silently — offer it as its own scoped item in the plan and let the user choose.
- **Report coverage honestly.** The changelog index covers roughly the last two years, which is deep enough for most jumps and not deep enough for all of them — and it is only reachable one specific way (`references/sourcing.md`; the obvious ways silently return partial data). Every report states which versions were covered by schema validation, which by changelog, and which by neither. A silent gap reads as "all clear" when it isn't — and for a feature deprecated *before* the changelog window, a zero-hit search is the most misleading result the tooling can return.

## Phase 0 — Tooling (do this before anything else)

Shopify's own toolkit is what makes this skill accurate — it validates GraphQL, Liquid, and component code **against a named API version**, which is the only way to answer "does this call site survive the target?" without guessing. **Insist on it.** Check whether it's connected; if not, ask the user to install it and wait:

```
claude plugin install shopify-ai-toolkit@claude-plugins-official
```

Cross-runtime fallback (Codex, Cursor, VS Code, Antigravity, or any MCP client) — the Dev MCP server directly:

```
claude mcp add --transport stdio shopify-dev-mcp -- npx -y @shopify/dev-mcp@latest
```

**Disclose before they install:** the toolkit and MCP are on-by-default instrumented — they send usage events to `shopify.dev/mcp/usage`, and on some surfaces that payload includes **the user's most recent prompt verbatim** (truncated to 2000 chars) along with validated code. Users on client work or private repos should know this. Opting out is one env var, and offering it is not optional:

```
OPT_OUT_INSTRUMENTATION=true
```

**The MCP has exactly five tools, and the first call is mandatory.** `learn_shopify_api` mints a `conversationId` that **every** other tool requires — without it they all error. Call it once per API surface you touch (`admin`, `storefront-graphql`, `customer`, `functions`, `liquid`, `pos-ui`, `polaris-*`, …), passing the same `conversationId` to keep one session:

| Tool | Use it for |
|---|---|
| `learn_shopify_api` | **First, always.** Returns the `conversationId`; also echoes the version it will scope to. |
| `search_docs_chunks` | Versioned docs — accepts `api_name` and `version`, so ask it about the *target*, not "latest". |
| `validate_graphql_codeblocks` | The schema oracle. Feed it a real query from the codebase with `version: <target>`; it answers with the actual schema error (`Cannot query field "priceRule" on type "LineItem"`). |
| `validate_theme` | Liquid and theme files, against a theme directory. |
| `validate_component_codeblocks` | Polaris / UI-extension / POS component code, per `extensionTarget`. |

There is **no introspection tool**, and asking for one is a documented dead end: the MCP's own instructions say *"ONLY use `search_docs_chunks` and `validate_graphql_codeblocks`. Do NOT use `fetch_full_docs` or `introspect_graphql_schema`."* So validation *is* the introspection substitute — and a better fit, because you validate the query the codebase actually sends rather than reading a type in isolation.

`validate_graphql_codeblocks` accepts only a fixed set of versions. Treat that as an **indicator, not the authority** — a pin it refuses is a pin you cannot verify against, which belongs in the plan, but the enum can lag the real support table and the two do disagree. The dated accessibility table in Shopify's versioning docs is more specific; a live `X-Shopify-API-Version` header beats both.

If the user declines the tooling entirely, continue with WebFetch-only sourcing per `references/sourcing.md`, and state in the plan and the final report that no call site could be validated against the target schema — which downgrades every "field removed" claim from verified to inferred.

## Phase 1 — Detect what this codebase pins today

Read `references/detection.md` and follow it to produce `shopify-upgrade-plan.md` at the **target** project's root (the codebase being upgraded, not the cwd; in a monorepo, the workspace package). If that repo isn't yours to write to, use a scratch path and say where.

Run `scripts/detect-versions.mjs` first — it sweeps for the universal marker `20\d\d-(01|04|07|10)` plus known config keys across every language, so raw URL strings like `/admin/api/2024-10/graphql.json` are caught the same as a typed SDK constant. Then read the reference to interpret and complete the sweep by hand.

The sweep answers two questions, and the second one is easy to skim past: which versions are pinned, **and** which deprecated platform features the repo still uses. Read both sections. For a theme, the second is usually the entire upgrade — and it is the only section that will have anything in it.

The output is a **surface inventory**: for each Shopify surface present — Admin GraphQL, Admin REST, Storefront, Customer Account, Functions, App Bridge, extensions, webhooks, theme, Hydrogen — record the pinned version (or "unpinned/implicit"), where it's declared (file:line), which SDK and SDK version mediates it, and how many call sites it has. **Versions are frequently inconsistent across surfaces in one repo** (webhooks and Functions are the usual stragglers, because they're declared in a TOML nobody edits). Inconsistency is a finding, not an error to normalize away.

## Phase 2 — Build the change ledger

Read `references/sourcing.md`. Resolve the current stable target, enumerate the **version ladder** (every quarterly release between each pinned version and the target — breaking changes accumulate across the ladder, so a two-year jump crosses eight of them), then for every call site in the inventory determine its fate in the target version.

Two detectors, because neither alone is sufficient:

| Detector | Catches | Misses |
|---|---|---|
| **Schema validation** at the target version (`validate_graphql_codeblocks`, `version: <target>`) | removed/renamed fields, arguments, types and enum values — as the exact error the server would raise on that query | anything not expressed in the schema; REST entirely; Liquid entirely; *why* it changed |
| **Changelog + versioned docs** | behavior changes at identical shape (errors where there was silence, changed defaults, pagination and rate-limit changes), REST endpoint removals, new required scopes, Liquid and extension changes, migration steps | anything older than the index's ~2-year coverage |

Fetch the changelog index **once**, then filter it locally with `scripts/changelog-scan.mjs` — it tags every entry `Breaking change` / `Action required` / `Update` / `Note` and labels its surface, which turns ~780 entries into the handful that touch this codebase. `references/sourcing.md` has the exact fetch (getting it wrong returns a truncated feed that looks complete).

The ledger is one row per affected call site: `file:line → what it uses → fate in target → source URL → fix`. **Traceability rule: a call site may only be edited in Phase 5 if it has a ledger row with a source fetched this run.** Call sites that are fine get no row; the ledger is the work list.

## Phase 3 — Risk-tier the plan

Classify every ledger row and write the plan into `shopify-upgrade-plan.md`:

| Tier | Meaning | Example |
|---|---|---|
| `BREAKING` | Fails at runtime in the target version. Must fix before the bump. | Field removed from the schema; REST endpoint returning 404 |
| `BEHAVIOR` | Same shape, different result. Compiles and passes types; changes production behavior. | Invalid filter now errors instead of returning nothing; changed default page size |
| `DEPRECATED` | Works in the target, scheduled for removal. Fix now or accept a known debt with a date. | Field marked `@deprecated` with a removal version |
| `SCOPE` | Requires merchant re-authorization. Code alone cannot complete it. | New access scope required by a mutation the app calls. **Sourced, not guessed:** the sweep prints the scopes the app declares, `validate_graphql_codeblocks` prints the scopes each operation requires at the target — the difference is the row |
| `OPPORTUNITY` | Optional. New capability that simplifies existing code. **Off by default.** | A bulk mutation replacing an N+1 loop |
| `BLOCKED` | The target cannot be reached from here yet. Not a risk to weigh — a fact that changes the deliverable. | A Hydrogen app whose newest framework release maps to an older API version than the target |

`BLOCKED` exists because "upgrade to the newest stable version" is not always possible. A framework can gate the API version (Hydrogen is the common case, `references/storefront.md`), and an SDK can gate it too. **Find the ceiling before validating against the target**, or a clean validation run at an unreachable version reads as "ready to ship".

`OPPORTUNITY` rows are never bundled into an upgrade without the user explicitly opting in — an upgrade PR that also refactors is an upgrade PR nobody can review.

## Phase 4 — Approval gate (STOP HERE)

Present the plan and **wait**. This is the one mandatory interruption, and **no file in the target project may be edited before the user responds.**

Show: current → target per surface, the version ladder being crossed, counts per risk tier, every `SCOPE` row called out individually, the REST→GraphQL question if REST was found, the `OPPORTUNITY` list as opt-in, and — explicitly — **coverage gaps** ("versions 2025-01 through 2026-04 predate the changelog window; those call sites were checked by schema validation only, so behaviour changes at identical shape would not have been caught").

**Lead with what has already expired, then with support status, then with the diff.** In that order, because they are three different conversations:

1. **Deadlines already passed.** A `SUNSET` feature whose date is behind us is not an upgrade — it is an incident with a delayed trigger. Confirm each date from the changelog entry (`--status action` finds these; they are titled with the date, e.g. *"Shopify Scripts will be deprecated on June 30, 2026"*), compare it to today, and say plainly which ones are in the past.
2. **Support status per pinned version.** Whether each is still inside Shopify's 12-month minimum window (the sweep flags versions past it; more than four quarters behind is at or beyond that floor). An upgrade from a supported version is planned work the user can schedule; a surface already outside the window is unplanned risk they are carrying right now and probably don't know about.
3. **The change ledger itself.**

The user cannot tell these apart from a list of file paths, and the ordering is the advice.

Offer these adjustments: narrow the surfaces, step to an intermediate version instead of the newest, include/exclude the REST migration, accept specific `DEPRECATED` rows as known debt, opt into individual `OPPORTUNITY` rows.

If the environment is non-interactive: do **not** proceed to Phase 5. Write the plan, report that approval is required, and stop. An unattended agent must never rewrite a payment or fulfillment call path unreviewed.

## Phase 5 — Migrate (parallel specialist agents)

**These rules bind whoever does the work — you, or an agent you spawn. Read them before anything else in this phase.**

- **Never edit a call site without a ledger row.**
- **Never invent a replacement** field, endpoint, target, component or prop — resolve it from the schema, the docs, or the changelog entry's migration steps, and cite the source.
- **"X was removed" is a positive claim and needs positive evidence.** This is the failure mode that survives every other rule, because it does not look like invention — it looks like diligence. An agent searches for a prop, hook, field or endpoint, finds nothing, concludes it is gone, and rewrites working code around an absence that was never there. **A search that returns nothing is not evidence of removal; it is evidence of a search.** Prove it the other way round, by trying to *use* the thing at the target version:

| Claim | What proves it |
|---|---|
| Field/argument/enum removed | `validate_graphql_codeblocks` at the target on a document that selects it → `❌ FAILED` is proof. A pass proves it still exists. |
| Component/prop removed | `validate_component_codeblocks` at the target with the prop present → a failure is proof. A pass proves it still exists. |
| Hook/API removed | The versioned docs page for that surface **listing its replacement**, or a changelog entry that says so. |
| **REST endpoint/field removed** | No validator exists. Fetch the versioned REST reference at **both** versions and diff the documented fields — `references/admin-rest.md` has the procedure and the redirect trap that silently defeats it. |

If none of those produce evidence, the row is **unresolved, not removed** — leave the code alone and report it. Rewriting working code around an imagined removal is worse than shipping the deprecation: it is a regression you introduced, in a diff labelled "upgrade".

- **Validate your own output** with the relevant validator before reporting done.
- **The version constant is not yours to flip** — the orchestrator does it in Phase 6, once all surfaces report clear. **One exception:** a *per-extension* `api_version` in a Function's or UI extension's own TOML belongs to that surface's agent, because there is no shared constant to arbitrate; set it last, only when every row for that extension is resolved, and report that you did.

**Now: if the inventory has one surface, stop reading this phase.** You are the specialist — apply your own reference, make the approved edits, and go to Phase 6. The table, the dispatch rules and the shared-file arbitration below exist for multi-surface repos and are dead weight on a theme, a Function, or a REST-only backend, which is most of them.

Otherwise, spawn one agent per surface **in the approved scope**, in a single message so they run concurrently. Each agent prompt must include: the absolute path to `shopify-upgrade-plan.md` (read first) and to its reference file (read second), its slice of the ledger verbatim, the target version, the detected language/SDK conventions, and the approved disposition of every row it owns.

| Agent | Reference | Owns |
|---|---|---|
| admin-graphql | `references/admin-graphql.md` | Admin GraphQL queries, mutations, bulk operations (+ webhook payloads **only if** this repo has GraphQL — see below) |
| admin-rest | `references/admin-rest.md` | Admin REST call sites; REST→GraphQL migration when approved |
| storefront | `references/storefront.md` | Storefront API, Customer Account API, Hydrogen/headless clients |
| functions | `references/functions.md` | Shopify Functions — TOML `api_version`, input queries, target schemas |
| extensions | `references/extensions.md` | App Bridge, admin/checkout/POS UI extensions, extension TOMLs |
| themes-liquid | `references/themes-liquid.md` | Liquid themes — objects, filters, tags, theme-check |

**Webhooks have no agent of their own.** Assign them to whichever agent owns the code that *handles* them — which is the admin-graphql agent only when the repo has GraphQL. A REST-only app still receives webhooks, and their payloads are snake_case JSON, not GraphQL documents. Paste this into that agent's prompt, because it lives in `references/detection.md` and a spawned specialist never reads that file:

> Verify each HMAC-verified route's handler against the payload of the topic Shopify actually sends it, and check whether REST responses and webhook payloads for the same resource write the same storage. Both are versioned, they can diverge, and when they do the stored value depends on which one ran last.

**When a surface's ledger contains nothing but version constants, that agent has no edits to make.** It verifies every call site against the target, reports "clear, 0 edits", and stops. This is the normal outcome for a surface that really is just a bump, and it is not a failed run — say so in the dispatch, or the agent is left choosing between doing nothing and breaking the rule it was given. A shared wrapper holding two clients (`createAdminApiClient` and `createAdminRestApiClient` in one file) is the same case twice over: one file, two surfaces, one owner — you.

**Environments without subagents:** run the same jobs sequentially in the order admin-graphql → admin-rest → storefront → functions → extensions → themes-liquid, reading each reference as you reach it. Say that it's sequential.

## Phase 6 — Flip, verify, report

Read `references/verification.md`. In order:

1. **Shared-file edits** — the ones held back from parallel agents.
2. **Flip the version** — now, and only for surfaces whose ledger rows are all resolved. A surface with unresolved `BREAKING` rows stays on its old version and is reported as such; a partial upgrade honestly reported beats a complete one that fails in production.
3. **Static verification** — the toolkit's GraphQL/Liquid/extension validators against the target version, then the project's own typecheck, build, lint, and tests. Also re-run `scripts/detect-versions.mjs` and confirm no stale version literal survives anywhere (the constant is easy; the hardcoded URL in one webhook handler is what gets missed).
4. **Runtime verification** where possible — a dev store, `shopify app dev`, or the project's integration tests. Watch for `X-Shopify-API-Deprecated-Reason` response headers: they are the platform telling you a call site is still on borrowed time.
5. **Report**: per surface, the old → new version; every file changed with its ledger row; `SCOPE` items requiring merchant re-authorization (with the comms note); `DEPRECATED` rows deliberately accepted as debt and their removal dates; **what could not be verified and why**; coverage gaps restated; and the follow-ups code cannot do — deploy behind a flag, monitor the Partner Dashboard's deprecated-API-usage report, re-check after the next quarterly release.

## Output conventions

- **Match the codebase.** Version constants stay wherever the project already keeps them (`.env`, `shopify.app.toml`, a config module, a Docker env). Never introduce a new configuration mechanism as part of an upgrade.
- **One concern per commit.** Suggest commits split by surface and by risk tier, so a reviewer can read the `BREAKING` fixes without wading through opportunistic refactors.
- **Leave the receipts.** Where a non-obvious rewrite happened, a short comment citing the changelog slug or deprecation reason is worth more than the diff — the next person to touch it will ask why.
- **Never widen scope silently.** Unrelated bugs, style issues, and dependency bumps found along the way go in the report as observations, not into the diff.

## When the user asks for a subset

"Just tell me what breaks" stops after Phase 4 — that's a valid, complete deliverable, and the plan is the product. "Just bump Storefront" still gets the full Phase 1 sweep (an inconsistent webhook version is exactly the kind of thing the user doesn't know they have), then narrows Phases 2–6 to that surface. The detection cost is shared and cheap; skipping it is what turns a scoped upgrade into an outage.
