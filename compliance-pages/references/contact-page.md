# Contact Us Page Agent

Read `compliance-scan.md` first, then the intake answers block in your prompt. The key decision: wire into existing infrastructure or scaffold new.

## Decision tree

1. **Existing form endpoint / email API found** (API route, serverless function, Formspree/Netlify Forms, Resend/SendGrid usage): build the form posting to it, matching its expected fields exactly. Do not invent new backend code if a working handler exists.
2. **Email service configured but no contact endpoint**: create the form AND a minimal matching handler following the codebase's existing API-route pattern, using the already-configured email service. Never hardcode API keys — read from the env var pattern already used in the repo.
3. **No backend at all (static site)**: use a `mailto:` link presented cleanly, plus the visible address (intake answer or `[[FILL: contact email]]`). Optionally note in a comment that Formspree/Netlify Forms are drop-in upgrades — but don't sign the user up for a service.

## Form requirements (cases 1–2)

- Fields: name, email, message (subject optional). Keep it minimal — every extra field is extra personal data the privacy policy must cover.
- Client-side validation + accessible labels/aria; success and error states; disable submit while sending.
- **Privacy notice under the form**: "By submitting, you agree to our Privacy Policy" with a link — this ties consent to the data collection the privacy agent disclosed.
- If reCAPTCHA/hCaptcha already exists in the repo, reuse it; do not add a new captcha service unprompted.
- Basic spam honeypot field is fine (hidden input) — cheap and dependency-free.

## Optional add-on: security.txt

When a contact or security email is known (intake or scan), also create `/.well-known/security.txt` per RFC 9116 — `Contact:` (the email as `mailto:`) and `Expires:` (about a year out, `[[FILL: confirm expiry]]`). Place it in the static/public dir the scan identified. Two minutes of work that signals maturity to security researchers. Skip silently when no suitable email exists.

## Page content

- Heading + one friendly sentence.
- The form (or mailto block).
- Alternative channels from the scan: support email, social links, physical address `[[FILL: address — required for some jurisdictions' imprint rules]]`.
- Match site styling and page conventions.

Report back: file path(s) created, which decision-tree case applied, any new personal-data fields introduced (the integration pass must confirm the privacy policy covers the contact form), `[[FILL]]` tokens used.
