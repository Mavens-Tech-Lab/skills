# Refund & Shipping Policy Agent (conditional)

**Trigger**: payments or e-commerce detected in the scan. Card networks (via Stripe/PayPal/processor terms) require a clearly visible refund policy, and EU distance-selling law adds withdrawal rights — for a site that charges money this is not optional padding. Do not generate without the trigger.

Read `compliance-scan.md` first, then the intake answers block in your prompt.

## Decide which pages

- **Digital products / SaaS subscriptions** → **Refund & Cancellation Policy** only.
- **Physical goods** (shipping-address forms, shipping-rate code, fulfillment integrations in the scan) → also a **Shipping Policy**.

## Non-negotiables

- Same generated-template / not-legal-advice notice as the other legal pages.
- **Never invent commercial terms**: refund windows, restocking fees, shipping costs, delivery times are all `[[FILL]]` unless read from code or answered in intake.
- These pages are the **authority** on refunds/shipping — the Terms' purchases section must summarize and link here, not contradict. Report your key parameters back so the integration pass can cross-check.
- Tell the integration pass to link the refund policy in the footer **and near checkout** if a checkout page exists (card-network visibility requirement).
- Match site page conventions and styling.

## Refund & cancellation sections

1. **Scope** — what's sold, per the scan (one-time products, subscriptions, digital access) and which processor handles it.
2. **Refund window & conditions** — `[[FILL: window]]`, condition/eligibility rules.
3. **How to request** — contact route, required info (order id), processing time `[[FILL]]`, refunds go to the original payment method via the detected processor.
4. **Subscriptions** (when detected) — cancellation mechanics matching the processor found (e.g. Stripe billing portal), timing of effect (end of billing period), trial terms if the scan found trials `[[FILL: confirm]]`.
5. **EU/UK right of withdrawal** (when the EU audience trigger applies) — the 14-day distance-selling right; for digital content, the standard exemption: the right lapses once download/streaming begins with the buyer's express consent — state it plainly and make sure checkout actually collects that consent (`[[FILL: verify checkout consent checkbox]]` if not found in code).
6. **Chargebacks** — a "contact us first" note.
7. **Contact** — from intake or `[[FILL]]`.

## Shipping sections (physical goods only)

1. Regions served (from shipping code if findable, else `[[FILL]]`)
2. Costs & methods (read rate tables from code where possible)
3. Handling time + delivery estimates `[[FILL]]`
4. Customs/duties on international orders (buyer's responsibility note)
5. Lost/damaged parcels — claim route
6. Address changes/order cancellation cutoff

Report back: file path(s) created, which pages you generated and why, key commercial parameters (refund window, cancellation mechanics) for the Terms cross-check, `[[FILL]]` tokens used.
