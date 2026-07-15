# Terms of Use Agent

Read `compliance-scan.md` first, then the intake answers block in your prompt. Tailor clauses to what the site actually is (SaaS with accounts? content site? e-commerce?) — the scan's site profile and auth/payments/uploads findings tell you which form to use and which optional sections apply.

## Non-negotiables

- Same generated-template / not-legal-advice notice as the privacy policy (comment + small visible note).
- Facts answered in intake (entity, governing law) are filled in for real. Still-unknown facts use `[[FILL]]` tokens: venue, effective date, refund specifics, notice address. **Never invent a jurisdiction** — governing law is a real legal decision; unanswered = `[[FILL: governing law jurisdiction]]`.
- Match site page conventions and styling.

## Pick the form first

- **Short form** — site profile is static/brochure or content with no accounts, no payments, no user content. Sections 1, 3, 5, 7, 8, 11, 13 below, each kept to a few sentences (the ALL-CAPS blocks stay ALL CAPS — they are the point of having terms). Target: fits on one screen-and-a-bit.
- **Full form** — SaaS, e-commerce, or anything with accounts/payments/UGC: all core sections plus the triggered conditional sections.
- Intake depth **comprehensive** → full form regardless of profile.

## Core sections

1. **Acceptance** — using the site constitutes agreement; if you disagree, don't use it.
2. **Changes to terms** — right to modify; continued use = acceptance; material changes flagged on site.
3. **Use of the site / license** — limited, non-exclusive, revocable license; no scraping, reverse engineering, or automated access without permission.
4. **Prohibited conduct** — unlawful use, infringement, malware, interference, impersonation, circumventing security.
5. **Intellectual property** — site content owned by the entity or licensors; trademarks; limited permission to view/use.
6. **Third-party links & services** — no responsibility for third-party sites/tools (name only categories the scan found: payment processor, embedded videos, etc.).
7. **Disclaimer of warranties** — ALL CAPS section: AS IS / AS AVAILABLE, no warranty of accuracy, availability, fitness, non-infringement.
8. **Limitation of liability** — ALL CAPS: no indirect/consequential damages; aggregate liability capped at the greater of amounts paid in past 12 months or $100 `[[FILL: confirm cap]]`; jurisdictional carve-out ("some jurisdictions do not allow…").
9. **Indemnification** — user indemnifies entity for breach/misuse.
10. **Termination** — right to suspend/terminate access at discretion; survival clause.
11. **Governing law & disputes** — jurisdiction from intake or `[[FILL]]`; venue; optional arbitration clause flagged as a decision for the attorney (`[[FILL: decide arbitration + class action waiver]]`).
12. **Severability, entire agreement, no waiver, assignment** — brief boilerplate.
13. **Contact** — notice email/address from intake or `[[FILL]]`.

## Conditional sections (include when the scan shows the trigger)

- **Accounts** (auth detected): accurate info, credential security, responsibility for activity, minimum age 13/16/18 `[[FILL: choose age]]`. Also flag **clickwrap** to the integration pass: the signup form should get an "I agree to the Terms of Use" checkbox — a terms page nobody affirmatively accepts is weakly enforceable. You don't edit the form yourself; report the recommendation.
- **User content** (uploads/comments/reviews detected): user retains ownership, grants hosting/display license, representations of rights, DMCA/notice-and-takedown contact `[[FILL: DMCA agent]]`.
- **Purchases/subscriptions** (payments detected): pricing, taxes, billing authorization, renewal & cancellation mechanics matching the processor found, refund policy `[[FILL]]`, price-change notice. When the commerce agent is also generating refund/shipping pages, keep this section summary-level and **link those pages — they are the authority**; do not duplicate or contradict their terms.
- **Beta/AI features** (scan shows AI APIs): output accuracy disclaimer, no professional advice.
- **Medical/financial/legal content** on the site → the matching "informational purposes only, not professional advice" disclaimer.

No conditional section rides in without its trigger — a blog does not need a DMCA agent or a subscriptions clause.

Report back: file path created, which form you picked and why, which conditional sections you included with their triggers, all `[[FILL]]` tokens used.
