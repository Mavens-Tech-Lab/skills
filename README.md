<!-- ┌────────────────────────────────────────────────────────────┐ -->
<!-- │  Mavens Tech Lab · Agent Skills                             │ -->
<!-- │  Skill pages & docs: https://mavenslab.tech/skills          │ -->
<!-- └────────────────────────────────────────────────────────────┘ -->

<div align="center">

# Agent Skills

**Open-source [Agent Skills](https://code.claude.com/docs/en/skills) that read your codebase before they write a single line.**

<br />

[![Website](https://img.shields.io/badge/mavenslab.tech%2Fskills-121619?style=for-the-badge&logo=googlechrome&logoColor=FCFF56)](https://mavenslab.tech/skills) [![Claude Code](https://img.shields.io/badge/Claude_Code-plugin_marketplace-121619?style=for-the-badge&logo=claude&logoColor=FCFF56)](https://code.claude.com/docs/en/plugin-marketplaces) [![skills.sh](https://img.shields.io/badge/skills.sh-cross--agent_installs-121619?style=for-the-badge&logoColor=FCFF56)](https://skills.sh) [![License](https://img.shields.io/badge/license-MIT-FCFF56?style=for-the-badge&labelColor=121619)](./LICENSE)

</div>

<br />

---

## `01`  Skills

| Skill | What it does |
| :-- | :-- |
| **[compliance-pages](./compliance-pages/)** | Generates Privacy Policy, Terms of Use, Support, and Contact pages plus a compliant cookie consent banner (and, when warranted, accessibility and refund/shipping policies) — grounded in a real scan of your codebase and right-sized to what your site actually does. |

Every skill is a self-contained folder with a `SKILL.md` and its own README — portable to Claude Code and any agent runtime that supports the Agent Skills format. More on the way; detailed pages live at [mavenslab.tech/skills](https://mavenslab.tech/skills).

<br />

---

## `02`  Install

**Claude Code** (plugin marketplace):

```
/plugin marketplace add Mavens-Tech-Lab/skills
/plugin install <skill-name>@mavens-skills
```

**Any other agent** — Cursor, Codex, GitHub Copilot, Windsurf, and [dozens more](https://github.com/vercel-labs/skills#supported-agents), via [skills.sh](https://skills.sh):

```
npx skills add Mavens-Tech-Lab/skills --skill <skill-name>
```

<br />

---

## `03`  Principles

| Principle | What it means in practice |
| :-- | :-- |
| **🔍  Grounded, not generic** | Skills scan the actual codebase before generating anything — every claim in the output is traceable to something found in your code. |
| **📏  Right-sized output** | No walls of boilerplate the project doesn't need. Every section beyond the core requires a named trigger; deliberate omissions are reported with reasons. |
| **🗣  Interactive where it counts** | One short round of questions with sane defaults — never an interrogation, never silent guessing. Unknown facts become loud `[[FILL: …]]` placeholders, not inventions. |
| **🔓  Nothing to hide** | No secrets, no network side effects in skill scripts. The source is short — read it before installing. |

<br />

---

## `04`  Need a custom skill?

Mavens Tech Lab builds, deploys, and maintains custom agent skills — the skill, plus a team that acts on it.

<div align="center">

<br />

[![Talk to us](https://img.shields.io/badge/%E2%9C%89_Talk_to_us-FCFF56?style=for-the-badge&labelColor=121619)](mailto:info@mavenslab.tech)

<br />

</div>

<div align="center">

<sub>Operated by **MAVENS TECH LAB INC.** &nbsp;·&nbsp; [mavenslab.tech](https://mavenslab.tech) &nbsp;·&nbsp; [info@mavenslab.tech](mailto:info@mavenslab.tech) &nbsp;·&nbsp; MIT — see [LICENSE](./LICENSE)</sub>

</div>
