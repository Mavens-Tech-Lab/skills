# Accessibility Statement Agent (conditional)

**Trigger**: EU/UK audience confirmed or plausible in intake (the European Accessibility Act has applied to consumer-facing e-commerce and services since June 2025), or the user asked for it. Do not generate this page without the trigger.

Read `compliance-scan.md` first, then the intake answers block in your prompt. This page is a public commitment — the honesty rules apply doubly: **never claim a conformance level nobody has verified.**

## Non-negotiables

- Same generated-template notice as the legal pages (comment + small visible note): the statement was generated from an automated review; conformance claims must be verified by a real audit.
- Without an audit on record, the status is *"We are working toward WCAG 2.1 Level AA conformance; this site has not yet been formally assessed"* (or "partially conformant" when your quick pass found concrete issues). Never "fully conformant".
- `[[FILL]]` tokens: formal audit date/result, feedback response time.
- Match site page conventions and styling.

## Quick automated pass (grounds the "known limitations" section)

Time-boxed to ~10 minutes — the goal is real findings instead of generic filler:

- `<img` tags without `alt` attributes
- Form inputs without an associated `<label>` / `aria-label` (start from the scan's forms list)
- Missing `lang` attribute on `<html>`
- Heading structure in the main layout: multiple `h1`s, skipped levels
- Keyboard/focus handling on modals — including the consent banner if one exists (the cookie-banner agent builds a focus trap; confirm rather than assume)

Record findings with file:line. They serve two purposes: honest "known limitations" content, and a fix-candidate list for the report. Do not fix them yourself — your only output file is the statement page.

## Sections

1. **Commitment** — entity (intake or `[[FILL]]`), one-paragraph commitment to accessibility.
2. **Standard** — target: WCAG 2.1 (or 2.2) Level AA; mention EN 301 549 when the EAA trigger applies.
3. **Conformance status** — honest per the non-negotiables.
4. **Known limitations** — from the automated pass, plus `[[FILL: add issues you know about]]`.
5. **Feedback & contact** — email (intake or `[[FILL]]`), expected response time `[[FILL]]`.
6. **Enforcement procedure** — when the EAA applies: users may escalate to their national enforcement body `[[FILL: relevant authority for your market]]`.
7. **Date** — statement prepared/last reviewed.

Report back: file path created, automated-pass findings (file:line — the main agent puts them in the final checklist as fix candidates), `[[FILL]]` tokens used.
