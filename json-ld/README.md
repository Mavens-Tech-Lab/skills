<!-- ┌────────────────────────────────────────────────────┐ -->
<!-- │  json-ld · an Agent Skill by Mavens Tech Lab        │ -->
<!-- │  Skill page: https://mavenslab.tech/skills/json-ld  │ -->
<!-- └────────────────────────────────────────────────────┘ -->

<div align="center">

# json-ld

**Fresh definitions. Real data. Whole-site entity graphs.**

Discovers every entity worth marking up · verifies against *live* schema.org + Google docs · wires values to your actual data flow

<br />

[![Skill page](https://img.shields.io/badge/skill_page-mavenslab.tech-121619?style=for-the-badge&logo=googlechrome&logoColor=FCFF56)](https://mavenslab.tech/skills/json-ld) [![Tested on](https://img.shields.io/badge/tested_on-Claude_Code-121619?style=for-the-badge&logo=claude&logoColor=FCFF56)](https://code.claude.com/docs/en/skills) [![Version](https://img.shields.io/badge/version-1.1.1-FCFF56?style=for-the-badge&labelColor=121619)](../.claude-plugin/marketplace.json) [![License](https://img.shields.io/badge/license-MIT-FCFF56?style=for-the-badge&labelColor=121619)](../LICENSE)

</div>

<br />

```text
you    ▸ add structured data to my shop

scan   ▸ Next.js App Router (SSR) · Prisma: Product, Review, Category
scan   ▸ 3 page types · existing markup: 1 hand-rolled Organization (stale name)
fetch  ▸ schema.org v30.0 (live) · Google gallery: Product ✓ eligible
map    ▸ offers.price ← products.sale_price · availability ← stock > 0
ask    ▸ 1 round: brand vs legalName · expose prices? · sameAs profiles

gen    ▸ lib/jsonld.ts · @graph per page · stable @ids · </script>-safe
check  ▸ rendered HTML re-parsed · required 4/4 · recommended 9/11
gap    ▸ no updatedAt column → dateModified unlocked when you add it
```

---

## `01`  The problem

Structured data is where LLM-generated code fails quietly:

- 🧠 **Stale vocabulary** — models emit property names from training data. schema.org is at v30.0 (March 2026); Google retired FAQ/HowTo rich results in 2023. Memory-based markup fails validators — or worse, passes while missing today's required properties;
- 🎭 **Fabricated values** — tutorials teach `"aggregateRating": {"ratingValue": "4.8"}`. Fake review markup is a documented Google manual-action trigger;
- 🏝️ **Generic islands** — a bare `{"@type": "Organization", "name": "..."}` hardcoded in a layout: no `@id`, no graph, no connection to the pages, drifting from the database from day one.

<br />

---

## `02`  What this skill does instead

> **Before** — you ask for "Product schema" and get a tutorial snippet with invented values pasted into one template.
>
> **After** — every entity in your data model is found, every property is verified against the schema.org release *fetched that day*, and every value is wired to the same query your page renders.

| Phase | What happens |
| :-- | :-- |
| **1 · Discover** | Scans data models (Prisma, Django, CMS content types, frontmatter…), routes, and existing markup into an entity inventory: what deserves markup, where it renders, what's already there and whether it's wrong. |
| **2 · Fetch** | Pulls the **live** schema.org type definitions and Google's **current** rich-results requirements. Hard rule: a property that wasn't verified this run doesn't get emitted. No network → it stops and says so. |
| **3 · Map** | Traces every property to a real source — DB column, CMS field, frontmatter key — with named transforms and per-property empty-handling. No source → omitted and reported, never invented. |
| **4 · Ask** | One round of questions for what code can't know: ambiguous types (Product vs Service — with consequences), org identity, `sameAs` profiles, data-exposure choices. |
| **5 · Implement** | One shared builder module, framework-idiomatic injection (Next/Astro/Nuxt/SvelteKit/SSGs/Django/Rails/WordPress-plugin-aware), stable `@id`s, one connected `@graph` per page, `\u003c`-escaped serialization. Fixes and deepens existing markup instead of duplicating it. |
| **6 · Verify** | Re-parses the JSON-LD from **rendered HTML** (what crawlers actually get), checks Google-required coverage, runs live validators when browser tooling exists — and reports the gaps as actions: *"add `updatedAt` → unlocks `dateModified`"*. |

<br />

---

## `03`  Install

**Claude Code** (plugin marketplace):

```
/plugin marketplace add Mavens-Tech-Lab/skills
/plugin install json-ld@mavens-skills
```

**Any other agent** — Cursor, Codex, GitHub Copilot, Windsurf, and [dozens more](https://github.com/vercel-labs/skills#supported-agents), via [skills.sh](https://skills.sh):

```
npx skills add Mavens-Tech-Lab/skills --skill json-ld
```

Degrades gracefully: without subagents the implementation runs sequentially; without interactive question tools, intake becomes a numbered list; without browser tooling, validation is local-only and says so.

<br />

---

## `04`  Usage

**Call it explicitly** — in Claude Code the skill is a slash command:

```
/json-ld
```

In any other agent, name the skill in your prompt:

> Use the **json-ld** skill to add structured data to this site.

**Or just describe the job** — the skill triggers on its own description:

- *"Add schema.org markup to my product pages"*
- *"Fix the structured data errors Search Console is showing"*
- *"Convert our microdata to JSON-LD"*
- *"Audit what structured data this site has"*
- *"Make our articles eligible for rich results"*

Works with **Next.js** (App/Pages router), **Astro**, **Nuxt**, **SvelteKit**, static-site generators (**Hugo**, **Jekyll**, **Eleventy**), server-template stacks (**Django**, **Rails**, **Laravel**), **WordPress** (extends Yoast/Rank Math/WooCommerce graphs through their filters instead of fighting them), and **Shopify Liquid themes** — any theme, not just the reference ones: it greps the actual theme for emitters, audits the rendered storefront for SEO-app markup, uses the native `structured_data` filter where it fits, hand-builds the rest per property with `| json`, handles cents→price conversion, and queries the **Shopify Dev MCP** (`@shopify/dev-mcp`) for Liquid data structures — recommending its install when missing.

<br />

---

## `05`  What's inside

```
json-ld/
├── SKILL.md                          # orchestration: scan → fetch → map → ask → implement → verify
├── references/
│   ├── entity-discovery.md           # data-model / route / existing-markup sweep → entity inventory
│   ├── fresh-definitions.md          # live schema.org + Google fetch procedure + traceability rule
│   ├── data-mapping.md               # property maps, @id scheme, page graphs, the gap list
│   ├── implementation-patterns.md    # builder module + per-framework injection + WordPress/Shopify playbooks
│   └── validation.md                 # static checks → rendered-HTML re-parse → live validators → report
└── scripts/
    └── extract-jsonld.mjs            # zero-dep: extract & parse JSON-LD blocks from rendered HTML
```

<br />

<div align="center">

<sub>An [Agent Skill](https://mavenslab.tech/skills) by **Mavens Tech Lab** &nbsp;·&nbsp; [mavenslab.tech](https://mavenslab.tech) &nbsp;·&nbsp; MIT — see [LICENSE](../LICENSE)</sub>

</div>
