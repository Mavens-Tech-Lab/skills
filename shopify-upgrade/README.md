<!-- ┌───────────────────────────────────────────────────────────┐ -->
<!-- │  shopify-upgrade · an Agent Skill by Mavens Tech Lab       │ -->
<!-- │  Skill page: https://mavenslab.tech/skills/shopify-upgrade │ -->
<!-- └───────────────────────────────────────────────────────────┘ -->

<div align="center">

# shopify-upgrade

**Every call site checked. Every claim sourced. The version string moves last.**

Finds what you actually pin · diffs it against the live schema · plans before it edits · any language, every surface

<br />

[![Skill page](https://img.shields.io/badge/skill_page-mavenslab.tech-121619?style=for-the-badge&logo=googlechrome&logoColor=FCFF56)](https://mavenslab.tech/skills/shopify-upgrade) [![Tested on](https://img.shields.io/badge/tested_on-Claude_Code-121619?style=for-the-badge&logo=claude&logoColor=FCFF56)](https://code.claude.com/docs/en/skills) [![Version](https://img.shields.io/badge/version-1.0.0-FCFF56?style=for-the-badge&labelColor=121619)](../.claude-plugin/marketplace.json) [![License](https://img.shields.io/badge/license-MIT-FCFF56?style=for-the-badge&labelColor=121619)](../LICENSE)

</div>

<br />

```text
you    ▸ upgrade us to the latest Shopify API

sweep  ▸ 4 versions pinned in one repo:
         admin graphql 2024-10 · storefront 2025-04
         functions 2025-01 · webhooks 2024-10  ← nobody knew
target ▸ 2026-07 stable (2026-10 is RC — not a target)
ladder ▸ 7 releases to cross

source ▸ changelog archive fetched today · ~2 years of entries
         breaking + action-required → 11 touch this repo
schema ▸ 42 operations validated @ 2026-07 · 3 fail, 6 deprecated

plan   ▸ BREAKING 4 · BEHAVIOR 3 · DEPRECATED 6 · SCOPE 1 · OPPORTUNITY 5
  ⚠      SCOPE: read_all_orders now required → every merchant re-authorizes
         ── waiting for your approval ──

fix    ▸ 4 agents in parallel · 23 call sites · each cites its source
flip   ▸ version bumped for 3 of 4 surfaces
         functions stays on 2025-01 — 1 breaking row unresolved
check  ▸ graphql validated · build ✓ · re-swept: no stale literals
```

---

## `01`  The problem

Shopify ships a new API version every quarter, each supported for about a year. So upgrading isn't optional — it's a recurring tax. And it's where agents fail in a specific, expensive way:

- 🎯 **The one-line "upgrade"** — change `2024-10` to `2026-07` in a config constant, watch the build pass, ship an outage. Nothing in your type system knows the field is gone: GraphQL validates server-side at request time, and REST happily returns `200` with a different body;
- 🧠 **Confident wrong schemas** — a model recalling which fields exist in a given Shopify version is recalling training data. It's stale by construction and it never says so;
- 🕳️ **The versions nobody knew about** — webhooks pinned in a TOML two years ago, one Function on its own version, a hardcoded URL in a handler. The upgrade "succeeds" and half the app stays behind;
- 🔑 **The scope that breaks only existing installs** — a new required access scope means every already-installed merchant must re-authorize. Works perfectly in dev. Fails for every real customer.

<br />

---

## `02`  What this skill does instead

> **Before** — the version constant changes, the build goes green, and you find out what broke from your error tracker.
>
> **After** — every Shopify call site in the repo is inventoried, validated against the target schema *that day*, priced by risk, and shown to you as a plan before a single file is touched.

| Phase | What happens |
| :-- | :-- |
| **0 · Tooling** | Insists on Shopify's own AI Toolkit / Dev MCP — the versioned validators are what make the rest accurate. There is no introspection tool; you validate the query your code actually sends, against the version you are moving to. Discloses its on-by-default telemetry and how to opt out, *before* you install it. |
| **1 · Detect** | Sweeps for `YYYY-MM` version literals in **any language** — TS constant, TOML key, `.env` value, Python positional arg, raw URL string — then resolves each SDK's implicit default. A repo with four different versions is the normal case, and it says so. Also flags **deprecated platform features**, because the codebases most exposed to a Shopify deadline often pin no version at all: a theme still shipping `checkout.liquid`, an app still carrying Ruby Scripts. |
| **2 · Source** | Fetches the changelog archive in one request (**~2 years**, pre-tagged `Breaking change` / `Action required`) and validates every operation against the target schema. Every ledger row names a URL and a fetch date. Model memory is not a source. |
| **3 · Plan** | One row per affected call site, tiered `BREAKING` / `BEHAVIOR` / `DEPRECATED` / `SCOPE` / `OPPORTUNITY` / `BLOCKED`. `SCOPE` rows are sourced, not guessed — the scopes your app declares, diffed against the ones the validator reports each operation now requires. `BLOCKED` means the target isn't reachable yet (a Hydrogen app whose framework trails the newest API): an answer, not a failure. Opportunities are opt-in — an upgrade PR that also refactors is a PR nobody can review. |
| **4 · Approve** | **Stops.** Nothing in your project has been edited yet. Narrow the surfaces, step to an intermediate version, accept specific deprecations as debt, decide on REST→GraphQL. Non-interactive runs stop here permanently. |
| **5 · Migrate** | One specialist agent per surface, in parallel, each loading only its own playbook. No call site is edited without a ledger row; no replacement field is invented; each validates its own output. |
| **6 · Verify** | The version flips **last**, and only for surfaces whose rows are all resolved — a surface with an unresolved breaking row stays behind and is reported as such. Sometimes the right answer is not to flip at all — on a long-dead pin the bump is itself what activates changes you aren't exposed to yet, and the plan says so rather than flipping because a checklist said to. Then re-sweep for stale literals, validate, build, and render-check. |

<br />

---

## `03`  Install

**Claude Code** (plugin marketplace):

```
/plugin marketplace add Mavens-Tech-Lab/skills
/plugin install shopify-upgrade@mavens-skills
```

**Any other agent** — Cursor, Codex, GitHub Copilot, Windsurf, and [dozens more](https://github.com/vercel-labs/skills#supported-agents), via [skills.sh](https://skills.sh):

```
npx skills add Mavens-Tech-Lab/skills --skill shopify-upgrade
```

Degrades gracefully: without subagents the surfaces migrate sequentially; without the Dev MCP every "field removed" claim is downgraded to *inferred* and labeled as such; without a dev store, verification is static-only — and the report says so instead of implying more.

<br />

---

## `04`  Usage

**Call it explicitly** — in Claude Code the skill is a slash command:

```
/shopify-upgrade
```

In any other agent, name the skill in your prompt:

> Use the **shopify-upgrade** skill to move this app to the latest API version.

**Or just describe the job** — the skill triggers on its own description:

- *"Upgrade our Shopify app to 2026-07"*
- *"What breaks if we bump the Shopify API version?"* — a valid stop-at-the-plan run
- *"Migrate our Admin REST calls to GraphQL"*
- *"Fix these Shopify deprecation warnings"*
- *"Which Shopify version are we even on?"*

**Languages** — detection is deliberately language-agnostic: a Shopify version is always `YYYY-MM` with the month in `{01,04,07,10}`, so one sweep catches **JS/TS, PHP, Python, Ruby, Go, .NET** and raw HTTP in anything else. Recognized clients include `@shopify/shopify-api`, `shopify-app-remix` / `-react-router`, Hydrogen, `shopify/shopify-api` and `phpclassic/php-shopify` (PHP), Laravel Shopify, `ShopifyAPI` (Python), `shopify_api` / `shopify_app` (Ruby), `go-shopify`, and `ShopifySharp`.

**Surfaces** — Admin GraphQL · Admin REST (+ REST→GraphQL migration) · Storefront · Customer Account · Webhooks · Functions · App Bridge · admin/checkout/POS UI extensions · Liquid themes · Hydrogen.

<br />

---

## `05`  What's inside

```
shopify-upgrade/
├── SKILL.md                      # orchestration: detect → source → plan → APPROVE → migrate → verify
├── references/
│   ├── detection.md              # language-agnostic sweep + per-SDK implicit versions + surface checklist
│   ├── sourcing.md               # the source hierarchy, version ladder, changelog traps, the ledger contract
│   ├── admin-graphql.md          # selection-set extraction, validator triage, webhook payloads
│   ├── admin-rest.md             # version bump · or REST→GraphQL (GID, error-model and rate-limit traps)
│   ├── storefront.md             # Storefront + Customer Account + Hydrogen · cart, markets, cache keys
│   ├── functions.md              # per-extension TOMLs, target/export naming, input queries, typegen
│   ├── extensions.md             # the React → Preact/Polaris boundary, targets, capabilities, App Bridge
│   ├── themes-liquid.md          # checkout.liquid & Scripts sunsets, deprecated Liquid, theme-check triage
│   └── verification.md           # conditional per-surface flip, re-sweep, runtime checks, report shape
└── scripts/
    ├── detect-versions.mjs       # zero-dep, no network: find every version pin in any language
    └── changelog-scan.mjs        # zero-dep, no network: filter the changelog archive by status/surface/date
```

Both scripts are dependency-free, read-only, and **make no network calls** — you fetch, they parse.

<br />

<div align="center">

<sub>An [Agent Skill](https://mavenslab.tech/skills) by **Mavens Tech Lab** &nbsp;·&nbsp; [mavenslab.tech](https://mavenslab.tech) &nbsp;·&nbsp; MIT — see [LICENSE](../LICENSE)</sub>

</div>
