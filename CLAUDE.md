# Mavens Tech Lab — Agent Skills

Public repo: a Claude Code plugin marketplace of Agent Skills. Overview, install command, and the skill index live in [README.md](./README.md) — don't duplicate them here.

Working rules that aren't derivable from the code:

- **Slugs are permanent.** One folder per skill at the repo root, folder name == slug. The slug is the public install id, the marketplace plugin name, and the URL at `mavenslab.tech/skills/<slug>` — never rename after release.
- **`marketplace.json`** must stay aligned with the current plugin-marketplace spec: https://code.claude.com/docs/en/plugin-marketplaces. Check with `claude plugin validate .` after edits.
- **Test before registering.** Run the skill on a real task and confirm it does what its `description` claims. The `description` is the trigger an agent reads to decide whether to load the skill — make it precise, not marketing copy.
- **Releases**: bump the plugin `version` in `marketplace.json`, commit, tag `<slug>-v<version>`.
- **No secrets and no network side effects** in skill scripts — skill directories run automated security scans, and users read the source before installing.
- **READMEs earn attention**: problem → before/after → install → usage.
- **License**: MIT for everything unless a skill has a specific reason to differ.
