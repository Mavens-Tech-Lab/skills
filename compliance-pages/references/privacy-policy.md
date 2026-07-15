# Privacy Policy Agent

Read `compliance-scan.md` first, then the intake answers block in your prompt. Your policy must disclose exactly what the scan found — no more, no less, except for the defensive catch-alls noted below.

## Non-negotiables

- Top of file: code comment AND a small visible notice: *"This privacy policy was generated from an automated review of this site's code. It is a template, not legal advice — have it reviewed by a qualified attorney before relying on it."*
- Facts answered in intake (entity name, contact email, jurisdictions) are filled in for real. Anything still unknown uses `[[FILL: description]]` tokens: registered address, DPO email, retention periods where not inferable, effective date.
- Never claim "we do not sell your data" or "we do not use tracking" unless the scan supports it. If marketing pixels exist, include the CCPA "sale/share" framing honestly.
- Match the site's page conventions and styling from the scan.

## Right-sizing rule

The policy's length tracks the scan, not a template. A site with no accounts, no analytics, and a single contact form should produce a policy of roughly 400–600 words — the core sections below and nothing else. Every conditional section you include must name its trigger (a scan finding or an intake answer); if the trigger isn't there, the section isn't either. When intake set depth to **comprehensive**, include all conditional sections, still worded honestly against the scan.

## Core sections (always present, kept tight)

1. **Who we are** — entity (from intake or `[[FILL]]`), what the site/product does (one sentence from README/landing copy).
2. **Information we collect** — only the subsections the scan populates:
   - *You provide*: every form field found (contact forms, signup, checkout, uploads).
   - *Collected automatically*: IP address, user-agent, pages visited via server logs, and each detected analytics tool by name. If session recording (Hotjar/Clarity/FullStory/LogRocket) was found, disclose it explicitly and prominently — regulators treat undisclosed session replay harshly.
   - *From third parties*: OAuth providers (name the profile fields), payment processors.
   An empty subsection is omitted, not padded.
3. **How we use it** — map each collected data type to purposes (provide the service, respond to inquiries, analytics, marketing, security/fraud, legal compliance). Only purposes the data actually serves.
4. **Who we share with** — the processors table from the scan (hosting provider, analytics vendors, email provider, payment processor, auth provider). Note payment card data is handled by the processor and never stored on our servers, if the scan confirmed hosted checkout/Elements.
5. **Security** — one honest, hedged paragraph: reasonable measures, no method is 100% secure. Never promise absolute security.
6. **Your rights & contact** — the rights users have and how to exercise them (see the conditional GDPR/CCPA sections for the expanded versions), contact email.
7. **Changes to this policy** — right to update, material changes flagged on the site, `Last updated:` line.

## Conditional sections (include only when triggered — name the trigger)

| Section | Trigger |
|---|---|
| **Legal bases (GDPR)** — simple table: consent (marketing/analytics cookies), contract (accounts, orders), legitimate interest (security, logs), legal obligation | EU/UK audience confirmed in intake, or intake unanswered (hedged default), or EU signals in the scan's site profile |
| **Cookies & tracking** — categories, each vendor by name, consent-before-load statement, link to the cookie-preferences reopen mechanism. **Must list the same vendors the cookie banner gates.** | Any tracker or non-essential first-party cookie in the scan |
| **CCPA/CPRA rights** — know, delete, correct, opt out of sale/share, non-discrimination; "Do Not Sell or Share My Personal Information" mention | Marketing pixels in the scan, or California audience confirmed in intake, or intake unanswered (hedged default) |
| **International transfers** — SCC/DPF hedged language | US-based processors found AND EU audience applies (per the GDPR trigger) |
| **Retention** — table for account/order data; otherwise a single sentence (logs per host defaults) + `[[FILL]]` for the rest | Accounts or database-stored personal data in the scan; without them, fold one retention sentence into core section 3 |
| **GDPR rights (expanded)** — access, rectification, erasure, portability, objection, withdraw consent, complain to a supervisory authority; EU/UK representative `[[FILL]]` note | Same trigger as Legal bases |
| **Children (COPPA)** — not directed at children under 13 (16 for GDPR consent-age hedge), no knowing collection, contact for removal | Accounts/signup or UGC in the scan, or the product could plausibly appeal to minors |
| **Other named regimes (PIPEDA, LGPD, …)** — one short hedged paragraph per regime naming the rights and contact route, not a duplicated full section | The user named that market in intake — never by default |

When intake explicitly ruled a trigger out ("no EU users, we geo-block"), drop the section and report the omission with its reason.

## Defensive disclaimers to weave in (honesty of scope, not extra clauses)

- "May collect" phrasing for anything in the scan's Uncertainties section.
- Vendors the scan flagged `unknown`: disclose them by hostname with what they appear to do, hedged ("may set cookies or receive usage data"), and carry the `[[FILL: classify vendor]]` token into the policy so the user can't miss it.
- Server logs / IP disclosure even if no explicit logging code found (hosting platforms log by default).
- If GTM was found but its container tags couldn't be audited: disclose that tag management may load additional vendors and `[[FILL: audit GTM container and list tags]]`.

Report back: file path created, vendor list you disclosed (for the integration cross-check), which conditional sections you included/omitted and their triggers, and all `[[FILL]]` tokens used.
