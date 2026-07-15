---
name: compliance-pages
description: Generate the legal/compliance pages every website needs — Privacy Policy, Terms of Use, Support, Contact Us — plus a compliant cookie consent banner, all grounded in an actual scan of the codebase. Conditionally also an accessibility statement (EU/EAA) and refund/shipping policies (e-commerce). Use this skill whenever the user asks for a privacy policy, terms of service/use, legal pages, footer pages, support or contact page, cookie banner, cookie consent, GDPR/CCPA compliance, an accessibility statement, a refund or shipping policy, "make my site launch-ready", or says anything like "add the boring pages" or "I need compliance pages before launch". Also trigger when the user asks to gate analytics/tracking scripts behind consent or to audit what data their site collects.
license: MIT
---

# Compliance Pages

Generate the compliance pages a website needs — grounded in what the codebase *actually does* (not generic boilerplate) and sized to what the site actually is:

1. **Privacy Policy** — reflects the real data collection found in the code
2. **Terms of Use** — clauses matched to what the site is (a SaaS is not a blog)
3. **Support page** — scaffolded from the product's actual features
4. **Contact Us page** — wired to existing form/email infrastructure if present
5. **Cookie consent banner** — correctly gates the tracking scripts found in the codebase; skipped entirely when nothing needs consent

Two more deliverables exist only when their trigger fires (right-sizing applies — never generate them without it):

6. **Accessibility statement** — EU/UK audience (the European Accessibility Act has applied since June 2025) or explicit request
7. **Refund & shipping policies** — payments/e-commerce detected (card networks require a visible refund policy; EU distance-selling adds withdrawal rights)

The workflow is: **one shared codebase scan → one short intake round with the user → parallel agents for the agreed deliverables → integration pass**. The shared scan is what keeps the outputs consistent — the cookie banner must gate exactly the trackers the privacy policy discloses.

## Critical framing (read before generating anything)

- **You are not a lawyer and neither is this skill.** Every legal page generated MUST carry a prominent developer-facing comment and a visible-on-page note that the document is a template requiring attorney review. Never present output as legally sufficient.
- **Ground everything in the scan.** A privacy policy that claims "we don't use analytics" while `gtag.js` sits in the layout is worse than no policy — it's a misrepresentation. If the scan found it, disclose it. If the scan didn't find it, don't invent it.
- **Right-sized by default.** Legal text is a liability the user must read, maintain, and answer for — more of it is not more compliance. Generate the *shortest* documents the scan findings justify. Every section beyond the core set must be traceable to a concrete trigger: a scan finding, an intake answer, or an explicit user request. If you can't name the trigger, leave the section out and note the omission (with its reason) in the final report. A static portfolio with no forms and no trackers gets a one-page privacy notice and short-form terms, not a 13-section GDPR/CCPA treatise. Produce comprehensive/maximal documents only when the user asks for them.
- **Defensive is not maximal.** When uncertain whether the site collects something the scan hints at (server logs almost certainly capture IPs), disclose it with hedged language ("may collect") rather than omitting it. Defensiveness is about honest scope on things the site *does* — never a reason to bolt on clauses for things it doesn't.
- **Ask before placeholding, placehold before inventing.** Facts the user confirms in intake are filled in for real. Anything still unknown uses the exact token format `[[FILL: description]]` so it is greppable and visually loud. Never silently invent a company name or governing-law jurisdiction.

## Phase 1 — Codebase scan (do this first, single agent)

Read `references/codebase-scan.md` and follow it to produce `compliance-scan.md` at the project root (or a temp path if the user objects to writing there). This file is the single source of truth for all generation agents.

The scan detects: framework & routing conventions, styling system, analytics/marketing/tracking scripts, forms and the personal data they collect, auth providers, payment processors, third-party APIs and embeds, cookie/localStorage usage, existing contact/email infrastructure — and classifies the site (static/brochure, content, SaaS, e-commerce) with audience signals. It ends with a **Recommended scope**: which deliverables are warranted and at what depth.

Do not skip or abbreviate the scan even if the user seems rushed — a 2-minute scan is what differentiates this output from generic boilerplate.

## Phase 2 — Intake: one consolidated round of questions (main agent)

With scan findings in hand, ask the user **one** round of questions — informed by what you found, not generic. Use the AskUserQuestion tool if available; otherwise a compact numbered list in chat.

Rules:

- **At most 4 questions, one round.** Do not re-prompt per deliverable later; this is the only planned interruption.
- **Never ask what the scan already answered.** Confirm candidates instead: "The footer says © Acme Labs — is 'Acme Labs LLC' the legal entity?"
- **Every question carries a recommended default** so the user can wave the whole round through.

What to ask (pick only the ones that matter for this site):

1. **Scope** — present the scan's Recommended scope and let them adjust: "No trackers found, so the cookie banner isn't needed — generate privacy, terms, support, contact?" When the scan found **existing pages**, ask their disposition per page: **keep** (don't touch), **refresh** (audit against the scan, minimal corrections in place — the recommended default), or **regenerate** (replace). An existing page may be attorney-reviewed prose — replacing it is never the silent default.
2. **Entity & contact** — legal entity name and contact/support email, offering scan candidates as defaults.
3. **Audience** — meaningful EU/UK users? California users? Other markets they care about (Canada → PIPEDA, Brazil → LGPD, …)? This decides which rights sections are included — and whether the accessibility statement is warranted (EU/UK → yes). Default when unanswered: include GDPR + CCPA in hedged form (a public website generally can't exclude those visitors) and say that's what you did; other regimes only when the user names the market.
4. **Governing law** — jurisdiction for the Terms. Never invent it; unanswered = `[[FILL: governing law jurisdiction]]`.

If the environment is non-interactive (headless run, no user available): skip intake, adopt the scan's Recommended scope, use `[[FILL]]` for every unanswered fact, and state in the final report that intake was skipped.

## Phase 3 — Spawn parallel agents for the agreed deliverables

**In Claude Code / any environment with subagents (Task tool):** spawn the agreed agents in a single message so they run concurrently. Each agent prompt must include:

- The absolute path to `compliance-scan.md` (tell it to read this first)
- The absolute path to its reference file in this skill (tell it to read this second)
- An **intake answers block**: entity name, contact email, audience/jurisdiction decisions, and depth — so agents fill real values instead of placeholders, and include/omit conditional sections per the user's actual answers
- The **disposition of any existing page** (keep / refresh / regenerate). Hard rule for every agent: **never overwrite an existing page unless its disposition is regenerate.** In refresh mode, read the existing page first, check it against the scan (undisclosed vendors, stale claims, missing links), and make the minimal edits that fix real discrepancies — preserve the page's existing prose, tone, and structure. Report what was corrected and what was already accurate.
- The detected framework/output conventions (file locations, extension, styling approach) copied from the scan summary
- Instruction to write its output files and report back the file paths it created

Agent → reference file mapping:

| Agent | Reference | Deliverable |
|---|---|---|
| privacy | `references/privacy-policy.md` | Privacy Policy page |
| terms | `references/terms-of-use.md` | Terms of Use page |
| support | `references/support-page.md` | Support page |
| contact | `references/contact-page.md` | Contact Us page |
| cookie-banner | `references/cookie-banner.md` | Consent banner component + script re-wiring |
| accessibility | `references/accessibility-statement.md` | Accessibility statement page (conditional) |
| commerce | `references/refund-shipping-policy.md` | Refund & shipping policy pages (conditional) |

Only spawn agents for deliverables in the agreed scope. The cookie-banner agent is the only one that **modifies existing files** (re-wiring script tags). All others only create new files. If two agents would touch the same file (e.g., adding footer links), do NOT let them — collect footer-link updates yourself in Phase 4 instead.

**Environments without subagents (claude.ai, single-agent contexts):** run the same jobs sequentially in the order privacy → cookie-banner → terms → commerce → support → contact → accessibility, reading each reference file as you reach it. The deliverables are identical; only the parallelism is lost. Tell the user this is happening sequentially.

## Phase 4 — Integration pass (main agent, after all agents finish)

1. **Cross-check consistency**: the trackers gated by the cookie banner must exactly match the third parties disclosed in the privacy policy's cookies section; the Terms' purchases section must not contradict the refund/shipping pages (they are the authority). Fix mismatches now.
2. **Wire navigation**: add footer links to the generated pages and a "Cookie Preferences" re-open link (if a banner was built), following the site's existing footer/nav pattern — adding only links that are missing, never duplicating ones already there. Link the refund policy near checkout too, if a checkout page exists. Add the new pages to the sitemap if the project maintains one manually (or confirm the framework generates it). If auth was detected and the terms agent flagged clickwrap: add an "I agree to the Terms of Use" checkbox to the signup form when the edit is straightforward; otherwise put it on the checklist. This is the only step that edits shared layout files, and it happens once, here, to avoid parallel-write conflicts.
3. **Verify the build** if the project has a build/typecheck command (found during scan) — run it and fix errors introduced by generated files.
4. **Runtime-verify consent gating** (when a banner was built or audited): if browser tooling is available (Claude in Chrome, Playwright, or the project's dev server), load a page with cleared storage and confirm **zero** gated-vendor network requests fire before consent — then accept and confirm they do fire. This catches what grep can't: a tracker loading through a path the static check missed. If no tooling is available, state in the report that verification was static-only.
5. **Report to the user**:
   - every file created/modified;
   - every `[[FILL: ...]]` placeholder that still needs their input (grep for them);
   - **what was deliberately omitted and why** ("no cookie banner — no non-essential cookies found"; "no CCPA sale/share section — no marketing pixels and you confirmed no meaningful California audience"), so the lean output reads as a decision, not a gap;
   - accessibility fix candidates from the accessibility agent's automated pass (file:line), if that agent ran;
   - a short compliance checklist of things code cannot do for them (attorney review, DPA agreements with processors, GTM container consent settings, etc.) — including the adjacent artifacts this skill deliberately does NOT produce (B2B DPAs and subprocessor lists, age verification, industry regimes like HIPAA, automated DSAR tooling), so those omissions are visible decisions too.

## Output conventions

- Match the codebase — whatever the stack is, not just JS frameworks: Next.js App Router → `app/privacy/page.tsx`; Pages Router → `pages/privacy.tsx`; Vue/Nuxt → `pages/privacy.vue`; Astro → `src/pages/privacy.astro`; SvelteKit → `src/routes/privacy/+page.svelte`; Hugo/Jekyll/Eleventy → `content/privacy.md` (or the SSG's content dir) with the right front matter; Django/Rails/Laravel → a template plus the route/view wiring the codebase uses; plain static site → `privacy.html` beside existing pages. When ambiguous, mirror how an existing simple page (like an about page) is built.
- If pages live in a CMS/database rather than the repo (WordPress, Webflow, headless CMS): generate paste-ready HTML or markdown files in a `compliance-pages/` folder at the project root instead, and tell the user exactly where to paste each one. The cookie-banner agent still edits the theme/template files it can reach.
- Match the styling system found in the scan (Tailwind classes, CSS modules, plain CSS, component library). Legal pages should look like they belong to the site, not pasted from elsewhere.
- Every generated page gets a `Last updated: [[FILL: date]]` line (or the real date if the user confirmed it) and the not-legal-advice notice described in its reference file.
- Use the site's existing metadata/SEO pattern for page titles and descriptions.
- **i18n sites**: generate each page once, in the default locale, placed per the i18n routing convention (e.g. `app/[locale]/privacy/page.tsx` under the default locale), and link it from the default-locale footer. Flag other locales as `[[FILL: translate <page> to <locale>]]` — never machine-translate legal text.

## When the user only wants a subset — or wants everything

If the user asks for only some deliverables ("just the privacy policy and cookie banner"), still run the full Phase 1 scan, then confirm scope in intake and spawn only the requested agents. The scan cost is shared and the consistency requirements between privacy policy and cookie banner still apply when both are requested.

If the user explicitly asks for **comprehensive/maximal coverage** ("cover everything", "worst-case compliance"), flip the conditional sections in the privacy and terms references to include-by-default (still honestly worded against the scan) and say in the report that depth was raised at their request.
