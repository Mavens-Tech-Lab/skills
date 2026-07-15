<!-- ┌────────────────────────────────────────────────────────────┐ -->
<!-- │  compliance-pages · an Agent Skill by Mavens Tech Lab       │ -->
<!-- │  Skill page: https://mavenslab.tech/skills/compliance-pages │ -->
<!-- └────────────────────────────────────────────────────────────┘ -->

<div align="center">

# compliance-pages

**Scan first. Ask once. Generate only what's warranted.**

Privacy Policy · Terms of Use · Support · Contact · a cookie banner that *actually* gates your trackers

<br />

[![Skill page](https://img.shields.io/badge/skill_page-mavenslab.tech-121619?style=for-the-badge&logo=googlechrome&logoColor=FCFF56)](https://mavenslab.tech/skills/compliance-pages) [![Tested on](https://img.shields.io/badge/tested_on-Claude_Code-121619?style=for-the-badge&logo=claude&logoColor=FCFF56)](https://code.claude.com/docs/en/skills) [![Version](https://img.shields.io/badge/version-1.0.0-FCFF56?style=for-the-badge&labelColor=121619)](../.claude-plugin/marketplace.json) [![License](https://img.shields.io/badge/license-MIT-FCFF56?style=for-the-badge&labelColor=121619)](../LICENSE)

</div>

<br />

```text
you   ▸ make my site launch-ready

scan  ▸ Astro + Tailwind · fully static
scan  ▸ trackers: GA4 · forms: none · payments: none
warn  ▸ GA4 fires before any consent

gen   ▸ Privacy · Terms · Support · Contact · Consent banner
ok    ▸ gtag gated · Consent Mode v2 · Reject = same prominence

done  ▸ 5 pages · right-sized · governing law left as [[FILL]]
```

---

## `01`  The problem

Every site launch ends with the same chore: the "boring pages." The usual outcomes are all bad —

- 📋 a generic template that claims *"we don't use analytics"* while `gtag.js` sits in your layout — that's a misrepresentation, worse than no policy;
- 🍪 a cookie banner that pops up *after* the trackers already fired — decorative, not compliant;
- 📚 a 13-section GDPR/CCPA treatise for a two-page portfolio site that collects nothing.

<br />

---

## `02`  What this skill does instead

> **Before** — you ask for "a privacy policy" and get 2,000 words of legalese untethered from your code.
>
> **After** — every claim is traceable to a scan finding, and every unknown becomes a loud, greppable `[[FILL: …]]` token instead of an invented fact.

| Phase | What happens |
| :-- | :-- |
| **1 · Scan** | Reads your codebase — trackers, forms, auth, payments, cookies, email infrastructure, site type, audience signals — and writes the findings to `compliance-scan.md`. |
| **2 · Ask** | One short round of questions informed by the scan (legal entity, audience, governing law, which pages you actually want) — with sane defaults you can wave through. |
| **3 · Generate** | Only what's warranted, in parallel, matching your framework and styling. No trackers → no cookie banner. No EU audience and no pixels → no GDPR/CCPA padding. When triggers fire, it also covers the pages most generators forget: an **accessibility statement** (EU/EAA audiences) and **refund & shipping policies** (payments detected — card networks require a visible refund policy). |
| **4 · Verify** | Footer links wired, sitemap updated, banner vendors cross-checked against the privacy policy, build run — and when browser tooling is available, a **runtime check** that zero tracker requests fire before consent (grep can't prove that; a network capture can). The final report lists every file, every remaining `[[FILL: …]]`, and everything deliberately omitted, with the reason. |

> **⚖️ Honesty note:** the output is a well-grounded *template*, not legal advice. Every generated legal page carries a visible notice that it needs attorney review.

<br />

---

## `03`  Install

**Claude Code** (plugin marketplace):

```
/plugin marketplace add Mavens-Tech-Lab/skills
/plugin install compliance-pages@mavens-skills
```

**Any other agent** — Cursor, Codex, GitHub Copilot, Windsurf, and [dozens more](https://github.com/vercel-labs/skills#supported-agents), via [skills.sh](https://skills.sh):

```
npx skills add Mavens-Tech-Lab/skills --skill compliance-pages
```

The skill degrades gracefully outside Claude Code: without subagents it runs the generation jobs sequentially, and without interactive question tools it asks intake questions as a plain numbered list.

<br />

---

## `04`  Usage

**Call it explicitly** — in Claude Code the skill is a slash command:

```
/compliance-pages
```

In any other agent, name the skill in your prompt:

> Use the **compliance-pages** skill to make this site launch-ready.

**Or just describe the job** — the skill triggers on its own description when your request matches:

- *"Make my site launch-ready"*
- *"I need a privacy policy and cookie banner before launch"*
- *"Add the boring pages"*
- *"Gate my analytics behind a consent banner"*
- *"What data does my site actually collect?"*

Works with **Next.js** (App/Pages router), **React Router / Remix**, **Nuxt**, **SvelteKit**, **Astro**, static-site generators (**Hugo**, **Jekyll**, **Eleventy**), server-template stacks (**Laravel**, **Django**, **Rails**), and plain HTML sites — generated pages follow whatever conventions your codebase already uses. Sites whose pages live in a CMS (WordPress, Webflow, headless) get paste-ready files in a `compliance-pages/` folder with instructions on where each one goes.

<br />

---

## `05`  What's inside

```
compliance-pages/
├── SKILL.md                     # orchestration: scan → intake → parallel agents → integration
└── references/
    ├── codebase-scan.md         # the scan procedure + compliance-scan.md format
    ├── privacy-policy.md        # core + conditional sections, each with a named trigger
    ├── terms-of-use.md          # short-form vs full-form terms, conditional clauses
    ├── support-page.md          # FAQ grounded in real product features
    ├── contact-page.md          # wires into existing form/email infra + security.txt
    ├── cookie-banner.md         # consent model + per-script gating patterns
    ├── accessibility-statement.md  # conditional: EU/EAA audience or on request
    └── refund-shipping-policy.md   # conditional: payments/e-commerce detected
```

<br />

<div align="center">

<sub>An [Agent Skill](https://mavenslab.tech/skills) by **Mavens Tech Lab** &nbsp;·&nbsp; [mavenslab.tech](https://mavenslab.tech) &nbsp;·&nbsp; MIT — see [LICENSE](../LICENSE)</sub>

</div>
