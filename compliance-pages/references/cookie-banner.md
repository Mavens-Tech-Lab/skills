# Cookie Consent Banner Agent

Read `compliance-scan.md` first, then the intake answers block in your prompt. You have two jobs: (A) build the consent UI + state management, (B) **re-wire every non-essential script found in the scan so it does not execute before consent**. Job B is the compliance-critical part — a banner that shows while trackers already fired is decorative, not compliant.

## Existing consent tooling case

If the scan found a consent banner/manager already in place, do NOT build a second one. Audit the existing one instead: does it gate every non-essential vendor the scan found (including newly added ones)? Are its defaults denied? Is Reject as prominent as Accept? Fix gaps within the existing implementation's patterns, and if the site added a tracker the banner doesn't know about, wire that tracker into the existing gating. Only replace the whole mechanism if the user chose "regenerate" in intake.

## Zero-tracker case

If the scan found no non-essential scripts and no non-essential first-party cookies: do NOT build a full banner. Report that no consent banner is legally required, and (optionally, if the site sets necessary cookies like sessions) add a one-line footer notice "This site uses only essential cookies." Stop there. A consent manager with nothing to manage is dead weight the user has to maintain.

## Consent model (GDPR + ePrivacy + CCPA-safe defaults)

- Categories: `necessary` (always on, not toggleable), plus only the categories the scan actually found among `analytics`, `marketing`, `preferences`. Vendors the scan flagged `unknown` are gated under the strictest applicable category (treat as `marketing`) and keep their `[[FILL: classify vendor]]` token — reclassify or ungate only after the user answers.
- **Default = denied** for everything non-essential. Nothing loads before an explicit choice.
- Banner buttons: **Accept all**, **Reject all**, **Customize** — Reject must be same-prominence as Accept (equal styling, same screen, no dark patterns, no pre-checked boxes).
- Consent record stored in a first-party cookie (or localStorage for static sites) named `cookie_consent`:
  ```json
  {"v":1,"ts":"ISO-date","categories":{"necessary":true,"analytics":false,"marketing":false}}
  ```
  Cookie: `Path=/; Max-Age=15552000 (180 days); SameSite=Lax; Secure` when served over https. Bump `v` to re-prompt after banner changes.
- A persistent re-open mechanism: expose a function (e.g. `window.openCookiePreferences()`) and tell the integration pass to link "Cookie Preferences" in the footer. Withdrawing consent must be as easy as giving it.
- On **withdrawal** of a previously granted category: update the record, then best-effort delete that vendor's known cookies (e.g. `_ga*`, `_gid`, `_fbp`) and reload the page so gated scripts don't persist in the running session.
- Banner copy: brief, plain-language, links to the Privacy Policy cookies section. No wall blocking the whole page content (avoid cookie walls), but the banner may be a fixed bottom bar/modal.
- Customize view: one toggle per category with a 1-line description and the vendor names in that category (from the scan).

## Script gating — pick per script based on how it loads

For **every** non-necessary row in the scan's tracker table:

**1. Inline/`<script src>` tags in HTML or layout files** — convert to the type-gate pattern:
```html
<!-- before -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXX"></script>
<script>window.dataLayer=...</script>

<!-- after -->
<script type="text/plain" data-consent="analytics" data-src="https://www.googletagmanager.com/gtag/js?id=G-XXXX" async></script>
<script type="text/plain" data-consent="analytics">window.dataLayer=...</script>
```
The consent manager activates them on grant: for each matching `script[type="text/plain"][data-consent]`, create a real `<script>` (copying `data-src`→`src` or inline text + async/defer attrs) and insert it. Browsers ignore `type="text/plain"`, so nothing runs pre-consent.

**2. npm-package SDKs initialized in app code** (Mixpanel, PostHog, Amplitude, `ReactGA.initialize`, `fbq` wrappers): wrap the init call in a consent check + subscribe to consent changes. Provide a tiny event API in the consent manager:
```js
onConsent('analytics', () => initAnalytics()); // fires immediately if already granted, and on future grants
```
Move each vendor init into such a callback. Also guard track/pageview calls so they no-op pre-consent (queue-then-flush is a nice-to-have, not required).

**3. Next.js `<Script>` / framework script components**: conditionally render them only when the consented state (from the consent context/store you create) includes their category.

**4. Google Tag Manager / gtag present** — use **Google Consent Mode v2** *in addition to* gating:
```js
gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
// on user choice:
gtag('consent','update',{analytics_storage: granted?'granted':'denied', ...});
```
If GTM is the loader for everything, prefer loading GTM itself with consent defaults denied (Consent Mode) rather than blocking gtm.js entirely, and flag `[[FILL: configure tag-level consent settings inside the GTM container]]` — container tags can't be edited from the repo.

**5. Embeds (YouTube/Vimeo/Maps)**: replace with a click-to-load placeholder ("Click to load — loads content from YouTube and sets cookies") OR gate under `marketing` consent; use `youtube-nocookie.com` where a lighter fix suffices. Choose the least invasive option that fits the site's UX and say which you chose.

**Never gate**: strictly necessary items — session/auth cookies, CSRF, load balancing, captcha on forms. Error tracking *can* arguably be necessary (Sentry without session replay: treat as necessary but disclose; LogRocket/replay tools: NOT necessary, gate them).

## Implementation form

- Match the framework: React/Next → a `CookieConsent` component + small context/store, mounted in the root layout; Vue/Nuxt → plugin + component; plain HTML → one dependency-free `cookie-consent.js` + CSS, included on every page (or in the shared header include).
- No third-party CMP dependency unless the user asks — keep it self-contained, dependency-free, and small.
- Accessible: focus trap in the modal, buttons are `<button>`, `aria-label`s, works without JS-heavy frameworks on static sites.
- SSR-safe: no `document`/`window` access during server render.
- Style to match the site (scan's styling system).

## Verify before reporting

- Grep the repo again for every vendor signature from the scan and confirm each is now gated, conditionally rendered, or consent-moded. List file:line of each modification.
- Confirm nothing fires pre-consent: no remaining bare `<script src>` for gated vendors, no unconditional SDK init.

Report back: files created + every file modified with what changed, the category→vendor mapping used (integration pass cross-checks this against the privacy policy), leftovers you could not gate (e.g. GTM container internals) as `[[FILL]]` items.
