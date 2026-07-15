# Support Page Agent

Read `compliance-scan.md` first, then the intake answers block in your prompt. This page is product-facing, not legal — its quality comes from reflecting the *actual product* rather than generic FAQ filler.

## Structure

1. **Header** — "Support" / "How can we help?" matching the site's voice.
2. **Contact channels** — from the scan's existing infra and intake: support email (intake answer or `[[FILL: support email]]`), link to the Contact page, chat widget if one was detected (mention its hours as `[[FILL]]`), social links if present. State an expected response time as `[[FILL: e.g. 1–2 business days]]`.
3. **FAQ** — 4–8 questions, and only ones the codebase can actually answer:
   - Auth detected → password reset, account deletion (and note account deletion links to privacy rights), changing email.
   - Payments detected → billing questions, how to cancel, refunds (link Terms), updating payment method.
   - Uploads/limits detected → supported formats, size limits (read them from code if findable).
   - Always: "How is my data handled?" → link Privacy Policy; plus "How do I manage cookies?" → link cookie preferences, **only if a consent banner exists**.
   - If the scan found existing docs/README feature descriptions, derive 2–3 product-specific questions from them.
   Mark any answer you had to guess with `[[FILL: verify]]`. Do not pad to a count — four grounded questions beat eight invented ones.
4. **Troubleshooting basics** — only if the product type warrants it (web app: clear cache, supported browsers; static content site: skip).
5. **Escalation** — "Still stuck?" → contact form link.

## Conventions

- Use an accessible accordion/details pattern for FAQs if the styling system supports it easily (`<details>` is fine for plain HTML); otherwise simple headings.
- Match site styling and page conventions from the scan.
- No legal disclaimers needed here beyond linking Privacy/Terms where relevant.

Report back: file path created, FAQ topics chosen, `[[FILL]]` tokens used.
