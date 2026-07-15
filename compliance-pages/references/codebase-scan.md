# Codebase Scan Procedure

Produce `compliance-scan.md` — the single source of truth consumed by all generation agents. Write it at the project root unless the user objected (then use a temp path) — and tell the user it exists so they can gitignore or delete it after the run. Be thorough but time-boxed: aim for breadth over reading every file. Grep is your friend.

**Scan scope**: source dirs + `public`/`static` HTML + config files at the root. Exclude `node_modules`, build output (`dist/`, `build/`, `.next/`, `.output/`), lockfiles, and directories unrelated to the deployed site — and say in Uncertainties what you excluded.

## 1. Framework & conventions

Inspect `package.json` (or `composer.json`, `Gemfile`, `go.mod`, plain `index.html`) and config files to record:

- Stack — not only JS frameworks: Next.js App/Pages router, Nuxt, SvelteKit, Astro, Remix, static-site generators (Hugo, Jekyll, Eleventy), server-template stacks (Django, Rails, Laravel, Go templates), WordPress or another CMS theme, plain HTML
- Where pages live and the file naming convention for a new route — or, when pages live in a CMS/database rather than the repo, how content gets added (generation agents then produce paste-ready content instead of route files)
- Styling system (Tailwind config? CSS modules? styled-components? theme/template CSS? UI library?)
- Primary language(s) — TS/JS, PHP, Ruby, Python, Go, plain HTML all count
- Build/typecheck/lint commands from `package.json` scripts or the stack's equivalent (Makefile, `hugo`, `bundle exec`, …) — the integration pass needs these; "none" is a valid answer for static files
- Existing layout/footer components (or partials/includes/theme templates) and how nav links are declared
- i18n setup, if any (generated pages may need locale placement)

## 2. Site profile (drives right-sizing)

Classify the site — this determines how much legal text is actually warranted:

- **Type**: static/brochure · content/blog · SaaS/app with accounts · e-commerce. Signals: auth code, checkout flows, CMS content collections, upload handlers.
- **Audience signals** (feeds the GDPR/CCPA decision, confirmed with the user in intake):
  - i18n locales (a `de`/`fr` locale strongly implies EU users), `hreflang` tags
  - Currency/pricing code (EUR handling, VAT logic), shipping regions
  - ccTLD or EU-specific pages, imprint/Impressum page, existing legal mentions
- Record what you found and what it implies — do not decide jurisdictional scope yourself; the main agent confirms it with the user.

## 3. Tracking & third-party scripts (feeds cookie banner + privacy)

The goal is to account for **every third party the site talks to** — not to tick off a list. The table below is a head start of common signatures, nothing more; sites routinely use vendors that aren't on it, and an unlisted vendor still sets cookies and still belongs in the privacy policy. Record for each hit: **vendor, purpose category, where it's loaded (file:line), and how (script tag / npm package / tag manager / config)**.

### 3a. Generic discovery sweep (do this regardless of the table)

Hunt down every external hostname referenced by the site, whatever the vendor:

- **All external URLs** in source, public/static HTML, and layout/head components: `<script src>`, `<link>` (stylesheets, `preconnect`, `dns-prefetch` — resource hints betray third-party hosts even when the loader is elsewhere), `<iframe>`, `<img>` pointing off-domain (tracking pixels are often 1×1 images), CSS `@import`/`url()` to external hosts.
- **Outbound calls in code**: `fetch(`/`axios`/`XMLHttpRequest`/`navigator.sendBeacon` to non-first-party hosts, `new Image().src = "https://…`.
- **Dependency manifests**: skim `package.json` (or `composer.json`, `Gemfile`, plugin lists) for SDK-shaped packages — names containing analytics, pixel, tag, track, ads, chat, widget, consent, session, or a vendor brand — even ones you don't recognize.
- **Framework/platform config**: analytics often hide in `astro.config.*`, `nuxt.config.*` modules, Gatsby/Next plugins, Vercel/Cloudflare/Netlify analytics settings, WordPress plugin lists — with no script tag in sight.
- **Other tag managers** besides GTM: Tealium, Adobe Launch, Segment as a loader — a container means unaudited vendors inside it.
- **CDN-served assets** that phone home: Google Fonts (an IP transfer to Google — EU courts have cared; note self-hosting as the fix), CDN-hosted JS libraries. Usually "necessary-ish" but they belong in the disclosure.

**Unknown vendor rule**: when you find a third-party host you can't identify, do not drop it. Record it with category `unknown — [[FILL: classify vendor <host>]]`, note what it appears to do (sets cookies? receives request data? serves static assets only?), and tell downstream agents to treat it as **non-essential (consent-gated) by default** until the user classifies it — the safe failure mode is over-disclosure, not omission.

**Completeness criterion**: section 3 is done when every external hostname found anywhere in the scan scope appears in the tracker table — classified or flagged unknown. An unaccounted-for hostname means the sweep isn't finished.

### 3b. Known signatures (accelerator for the sweep)

| Vendor / signature | Grep hints | Category |
|---|---|---|
| Google Analytics / gtag | `gtag`, `googletagmanager.com/gtag`, `G-[A-Z0-9]{8,}`, `UA-[0-9]+-` | analytics |
| Google Tag Manager | `GTM-`, `googletagmanager.com/gtm.js` | container (audit inner tags if possible) |
| Meta/Facebook Pixel | `fbq(`, `connect.facebook.net` | marketing |
| TikTok Pixel | `ttq.`, `analytics.tiktok.com` | marketing |
| LinkedIn Insight | `linkedin.com/insight`, `_linkedin_partner_id` | marketing |
| Google Ads / remarketing | `AW-[0-9]+`, `googleadservices` | marketing |
| Hotjar / Clarity / FullStory | `hotjar`, `clarity.ms`, `fullstory` | analytics (session recording — flag specially, higher privacy risk) |
| Mixpanel / Amplitude / Segment / PostHog / Heap | package names or CDN urls | analytics |
| Plausible / Fathom / Umami | script srcs | analytics (often cookieless — note it) |
| Sentry / LogRocket / Datadog | package names | necessary-ish error tracking (LogRocket = session recording, flag) |
| Intercom / Crisp / Zendesk / Drift / Tawk | widget snippets | functional/preferences (chat sets cookies) |
| YouTube / Vimeo embeds | `youtube.com/embed`, `player.vimeo` | marketing/embedded (third-party cookies; note youtube-nocookie alternative) |
| Google Maps embed | `maps.googleapis`, `google.com/maps/embed` | functional |
| reCAPTCHA / hCaptcha / Turnstile | script srcs | necessary (still disclose) |

Also grep for framework-specific injection vectors that the 3a sweep can miss: `next/script`, `dangerouslySetInnerHTML` containing script text, Astro's `is:inline` and `set:html`, and `data-src` on `type="text/plain"` script templates (the signature of an already-consent-gated tracker — record it as **gated**, not missing).

## 4. Personal data collection (feeds privacy policy)

- **Forms**: find `<form`, form libraries (react-hook-form, Formik), and API routes/handlers receiving POST bodies. List every field that is personal data: email, name, phone, address, DOB, payment info, free-text messages.
- **Auth**: next-auth/Auth.js, Clerk, Auth0, Firebase Auth, Supabase Auth, Cognito, custom sessions. Record providers (Google OAuth → profile data), and what's stored (email, avatar, OAuth tokens).
- **Payments**: Stripe, PayPal, Paddle, LemonSqueezy. Note whether card data touches the server (almost never — Stripe Elements/Checkout keeps it off-server; say so in the policy) vs. hosted checkout. Also note **digital vs. physical goods**: shipping-address forms, shipping-rate code, or fulfillment integrations mean physical goods — that warrants a shipping policy on top of the refund policy.
- **Databases/ORMs**: skim schema files (Prisma schema, migrations, models) for tables/columns holding personal data.
- **Email/CRM**: SendGrid, Mailchimp, Resend, Postmark, ConvertKit, HubSpot — newsletter signups and transactional email are processor disclosures.
- **Cookies & storage set by first-party code**: grep `document.cookie`, `localStorage.setItem`, `sessionStorage`, cookie helpers in server code, session middleware. Record names and purposes where discernible. Cookies a third-party script sets *on the first-party domain* (e.g. `_ga*` after consent) go in the same table, flagged as third-party-set.
- **Server-side logging**: hosting platform (Vercel/Netlify/Cloudflare config files) and any logging middleware — assume IP + user-agent in logs and disclose defensively. When logging config is ambiguous or contradictory, assume logging exists.
- **File uploads, geolocation APIs, contact-book/notification permissions** — anything invoking browser permission APIs.

## 5. Existing infrastructure (feeds support + contact — and detects re-runs)

- **Existing compliance pages and consent tooling**: privacy/terms/support/contact routes, refund/shipping/accessibility/imprint pages, a consent banner component, `/.well-known/security.txt`, a committed `compliance-scan.md`. If found, this is a re-run or partially-covered site — the Recommended scope should propose a *verification/refresh pass* (re-check disclosures against current findings) instead of regeneration, and flag anything the existing pages no longer cover.
- Existing contact form endpoint, `mailto:` links, support email addresses in the code or README
- Existing FAQ/docs/help content
- Company/product name, logo alt text, existing footer text (copyright line often has the legal entity name — record it as a *candidate* for the intake round, still placeholder it if never confirmed)
- Social links

## 6. Write `compliance-scan.md`

Use exactly this structure so downstream agents can parse it predictably:

```markdown
# Compliance Scan — [project name]
Scanned: [date]

## Conventions
- Stack: (framework/CMS/SSG + router flavor — e.g. Next.js App Router, Astro, Rails/Django/Laravel templates, WordPress theme, Hugo, plain HTML)
- How to add a page: (path pattern — e.g. app/<slug>/page.tsx, src/pages/<slug>.astro, content/<slug>.md, templates/<slug>.html + route/view; or "via CMS admin — generate paste-ready content")
- Styling: (Tailwind / CSS modules / theme or template CSS / component library / …)
- Language(s): (TS, JS, PHP, Ruby, Python, Go templates, plain HTML, …)
- Build/typecheck commands: (or "none — static files")
- Footer/nav file(s): (layout component, partial/include, theme template — wherever links are declared)

## Site profile
- Type: static/brochure | content | SaaS | e-commerce
- Audience signals: (locales, currency, imprint, … — and what they imply)

## Trackers & third-party scripts
| Vendor | Category | Loaded from (file:line) | Load method | Notes |

## Personal data collected
| Data | Source (form/auth/api) | File | Sent to / stored in |

## Third-party processors
| Service | Purpose | Data shared |

## First-party cookies & storage
| Name/key | Type | Purpose | Set in |

## Existing infra
- Existing compliance pages / consent banner: (none | list what exists)
- Contact email/endpoint:
- Support content:
- Candidate legal entity name:
- Footer pattern:

## Uncertainties
- (things you could not determine — downstream agents hedge these)

## Recommended scope
- Deliverables warranted: (e.g. privacy, terms, contact — cookie banner NOT needed: no non-essential cookies. Include the conditional deliverables when triggered: refund/shipping policies when payments/e-commerce found; accessibility statement pending the intake audience answer)
- Depth: (lean | standard | comprehensive) — one line of justification per deliverable dropped or section class skipped
- Already satisfied: (when existing pages/banner were found — "recommend refresh-only pass" + what drifted)
```

The Recommended scope is a recommendation for the intake round, not a decision — the main agent confirms it with the user. Base it on findings, not caution: recommend the *smallest* set that covers what the site actually does.

If the codebase genuinely has **no** trackers, say so explicitly — the cookie-banner agent (if still requested) will then produce a minimal necessary-cookies-only notice, or the scope should recommend skipping the banner entirely, since a consent banner is only required for non-essential cookies.
