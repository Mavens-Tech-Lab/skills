# Phase 6 — Flip, verify, report

The upgrade is done when it is proven, not when the diff is written. This phase is the orchestrator's, after every agent reports back.

## 1. Shared-file edits

Make the edits held back from parallel agents — shared client wrappers, `shopify.app.toml`, a common config module. These were deferred to avoid two agents writing one file; do them now, informed by every agent's report.

## 2. Flip the version — conditionally, per surface

**There is a third branch, and it is easy to miss: don't flip, on purpose.** The two obvious outcomes are flip-if-every-row-resolved and hold-if-something-is-unresolved. But for an app already running on fall-forward, **the bump is itself the trigger** for every change whose `effectiveApiVersion` sits between where it is served today and where you are moving it. Those rows are not broken now; flipping is what breaks them.

So before flipping, list the rows whose `effectiveApiVersion` is greater than the **served** version and less than or equal to the target. If that list is non-empty, the flip is not the safe closing move — it is the change with the largest blast radius in the run, and the user gets to decide whether to take it this quarter or fix those rows first. Say so explicitly rather than flipping because the checklist said flip. Staying put is a legitimate, sometimes correct, outcome — and note that for an out-of-support pin it is only *temporarily* available, because fall-forward will deliver the same changes on Shopify's schedule with no deploy at all. Give the date if you can.

This is the first moment any version constant may change.

**Rule: a surface's version moves only when every ledger row for that surface is resolved.** Resolved means fixed, or explicitly accepted as debt by the user in Phase 4. An unresolved `BREAKING` row means that surface **stays on its old version** and is reported as not upgraded.

A partial upgrade, honestly reported, is a good outcome. A complete version flip with an unresolved breaking row is an outage with a clean git history.

Move each surface's version at its own declaration site: client config, `.env`, `shopify.app.toml` `[webhooks] api_version`, and — already done by their agents, under the same rule — per-extension TOMLs.

## 3. Static verification

In order, cheapest first:

1. **Re-run the sweep.** `node scripts/detect-versions.mjs <project>` and read every remaining pin. Confirm each is either the target or a surface deliberately left behind. **This is the step that catches the hardcoded URL in one webhook handler** that no config change touched. A stale literal here is the most common way an "upgrade" ships half-done. Four things to re-read, not just the version list:
   - **Deprecated platform features** — did any row get resolved, and is any `SUNSET` row still open? A version bump that leaves a passed deadline in place is not done.
   - **Extension library drift** — `@shopify/ui-extensions` must land on the same version as the TOML you just bumped. Bumping one of the two is the default failure here.
   - **Function target schemas** — a `# api_version:` header still on the old version means the input query was validated against a stale contract, and the build passing means nothing.
   - **Excluded buckets** — a build artifact whose version now differs from source is a stale bundle that needs rebuilding before deploy.
2. **Dev MCP validators, at the target version.** Call `learn_shopify_api` first for the `conversationId`, then: `validate_graphql_codeblocks` (`version: <target>`) on every rewritten document — including Function input queries under their own per-target `api`; `validate_theme` on the theme directory and changed files; `validate_component_codeblocks` on extension/Polaris code with its `extensionTarget`. Every agent should have done this already; re-running centrally is cheap and catches cross-agent conflicts. Read the status, not just pass/fail: `⚠️ INFORM` means the document parses **and** selects something deprecated, and it names the field and links the changelog entry — that closes a `DEPRECATED` row rather than leaving one open. A plain `✅ SUCCESS` is a deprecation all-clear for the fields that document selects. What neither tells you is the **removal version**, which comes from the linked entry, and neither covers a deprecated field no document in the codebase selects.
3. **The project's own toolchain** — typecheck, build, lint, tests. Run what exists. Do not add a build system. If the scripts exist but the dependencies are not installed, **do not install them just to typecheck**: report the check as not-run, say why, and state what the change touched so a reviewer can judge the compile risk themselves. Never report a check as passing when it did not run — and never let "not run" appear without its reason, because the two are indistinguishable in a report and only one of them is acceptable.
4. **Regenerate codegen** if the project generates types from a Shopify schema, and confirm the diff is only what the upgrade implies.

## 4. Runtime verification

Static checks cannot see the Shopify platform. Do as much of this as the environment allows, and record exactly which parts ran:

- **`shopify app dev` / `shopify theme dev`** against a development store — the highest-value check available. Exercise each changed surface: load an admin page, render each changed template, trigger a Function through a real checkout, open each extension in its host surface.
- **Watch for `X-Shopify-API-Deprecated-Reason` response headers.** This header is the platform naming a specific call site that is still on borrowed time. Anything it reports is a ledger row you missed — treat it as authoritative and add it.
- **Check response `extensions.cost`** on GraphQL calls if query shapes changed materially; a query that now exceeds its budget throttles under load, not in dev.
- **Integration tests against a dev store**, if the project has them.

If none of this is possible — no dev store, no credentials, headless environment — say so once, clearly, at the top of the report. "Verified statically only" is a legitimate result. Implying more is not.

## 5. The report

Structure it so a reviewer can act on it without reading the diff:

```markdown
## Result
Upgraded: <surface> 2024-10 → 2026-07, <surface> ...
NOT upgraded: <surface> — <unresolved rows / reason>
Verification: <what actually ran>

## Requires action before or at deploy
- SCOPE: <scope> now required by <call site>.
  Every installed merchant must re-authorize. Not fixable in code.
- Cache keys to invalidate: ...
- Webhook subscriptions to re-register: ...
- Migrations / data changes: ...

## Changed
| Surface | File:line | Ledger row | What changed | Source |

## Accepted as debt
| Row | Deprecated thing | Removed in | Why accepted |

## Not verified
- <what, and why it could not be verified>

## Verified clear (the negatives, with their scope)
- <method, exact scope checked, and the nil result — e.g. "Deprecation: 31 field paths
  across 11 type pages @ 2026-07, per-field marker check, 0 deprecated">

**A negative result needs its scope and sources attached or it isn't a finding.** "No deprecated
fields" and "I did not look for deprecated fields" read identically in a report, and a plan whose
Coverage block says `UNVERIFIED` can only be corrected by a statement that says what was checked,
against what, and how many. State the count even when the count is zero — especially then.

## Coverage
Ladder: <from> → <to> (<n> releases)
Changelog index: fetched <date>, covers <first> → <last>
Schema-validated: <surfaces>   Docs-only: <surfaces>
Unverified claims: <n>

## Coverage delta (what this run closed or opened)
- <plan line that said UNVERIFIED, and what it now says>

## Follow-ups (code cannot do these)
- Deploy behind a flag; watch error rates on <the riskiest paths>
- Monitor the Partner Dashboard's deprecated API usage report
- Verify live webhook subscription versions against the store
- Re-check at the next quarterly release (<date>)
```

### Non-negotiables for the report

- **`SCOPE` rows go at the top, in plain language.** A new required access scope means every already-installed merchant must re-authorize. If this is buried under a table of file paths, it will be missed, and the app will work perfectly in dev and fail for every existing install.
- **Name what was not verified.** Every surface has a check it may not have been possible to run. Silence reads as success.
- **Restate coverage gaps** from Phase 2 even though they were in the plan. The plan was read before the work; the report is read at deploy time, by someone who may not have read the plan.
- **Distinguish "left behind deliberately" from "failed".** Both mean a surface didn't move; only one is a problem.

## 6. Commits

Suggest a split that survives review:

- one commit per surface, per risk tier — `BREAKING` fixes separate from `DEPRECATED` cleanups
- version-constant flips in their own commit, last, so a revert is one commit
- codegen output in its own commit, labeled as generated
- `OPPORTUNITY` work in its own commit or its own PR — never mixed into an upgrade a reviewer needs to check line by line

Do not commit or push unless asked.
