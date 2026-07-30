# Agent — App Bridge and UI extensions

You own App Bridge and the UI extension surfaces: admin extensions, checkout UI extensions, POS UI extensions, and their `shopify.extension.toml` files. Read `shopify-upgrade-plan.md` first, then this file.

> Examples are illustrative. Verify component names, APIs, and targets against the target version's docs.

## App Bridge

### Establish which App Bridge the project uses

There are two eras, and they are configured completely differently:

| Era | How it loads | Versioning |
|---|---|---|
| **Legacy npm** | `@shopify/app-bridge` / `@shopify/app-bridge-react` as dependencies, initialized in app code with an API key and host | Pinned in `package.json` — the app decides when to move |
| **Current CDN** | a script tag loading App Bridge from Shopify's CDN | Auto-updating — Shopify decides; types come from a separate `@shopify/app-bridge-types` package |

Detect which one is in play before changing anything. Finding `@shopify/app-bridge` in `package.json` is the signal for the legacy path.

### Migrating legacy → current

Only if the plan approved it. This is a rewrite of the app's embedding layer, not a version bump:

- **Initialization changes fundamentally** — the explicit `createApp({apiKey, host})` client is replaced by the CDN script plus configuration. The host/apiKey plumbing the app carries around may become dead code; remove it deliberately, not incidentally.
- **The action/dispatch model is replaced by direct APIs.** Legacy App Bridge dispatched typed actions (Toast, Modal, Redirect, ResourcePicker, TitleBar) through a client object. The current model exposes these differently. Every call site must be translated individually, and there is no mechanical mapping — check each against the current docs.
- **Session token retrieval changes**, and session tokens are the app's authentication. Get this wrong and the app fails to authenticate for every merchant. Treat any session-token change as the highest-risk item in your slice and verify it against a running app, not by reading.
- **Navigation and redirects** behave differently inside the embedded admin frame; test them in-frame, never standalone.
- **React bindings**: `@shopify/app-bridge-react` hooks and providers have different shapes across eras. If the app wraps everything in a legacy `Provider`, that wrapper is part of the migration.

Auto-updating is a real trade-off worth stating in the report: the CDN path means Shopify can change behavior without a deploy on the app's side. That is the supported direction and it removes a class of version debt, but the team should know their embedding layer is no longer pinned.

## UI extensions

### Inventory

For each `shopify.extension.toml` that is **not** a Function (Functions belong to the functions agent):

- extension `type` and `api_version`
- every **target** / extension point it registers
- the UI component library and version it imports
- declared capabilities, settings, and any `[[extensions.targeting]]` blocks

### Check against the target version

### First: does the target cross the Polaris web components boundary?

Answer this before estimating anything, because it decides whether the job is a bump or a rewrite.

Checkout, customer-account and admin UI extensions moved from **React components + granular hooks** to **Preact + Polaris web components**. Shopify's own migration docs label the two sides `Pre-Polaris (2025-07)` and `Latest (Preact)`, so an extension on **2025-07 or earlier** is on the far side of that line and every version above it is a different programming model:

```jsx
// Pre-Polaris (2025-07)
import { reactExtension, Checkbox } from '@shopify/ui-extensions-react/checkout';
export default reactExtension('purchase.checkout.block.render', () => <Extension />);

// Latest (Preact)
import '@shopify/ui-extensions/preact';
import { render } from 'preact';
export default function extension() { render(<Extension />, document.body); }
// …and <Checkbox> becomes <s-checkbox>, <Disclosure> becomes <s-details>, etc.
```

What changes together: the runtime package (`@shopify/ui-extensions-react` → `@shopify/ui-extensions` + `preact`), the entry point (`reactExtension(target, …)` → a default-exported function that calls `render`), every component name (`s-` prefixed custom elements), and the hook surface. **Props are not just renamed, they are re-specified** — the Polaris `checkbox` repurposes `value` as the form submission value rather than the checked state, and `details` narrows `defaultOpen` from `boolean | string | string[]` to `boolean`. A mechanical find-and-replace produces an extension that builds and behaves differently.

Shopify publishes a per-component guide at `https://shopify.dev/docs/apps/build/checkout/migrate-to-web-components/<component>` and a top-level one at `…/migrate-to-web-components`. **Read the top-level guide before writing a line**, then the per-component page for each component the extension actually uses.

If the source version is at or before 2025-07, **say in the plan, in those words, that this is a rewrite and not a version bump.** The user's mental model is "change the number", and correcting it is the most valuable thing this agent does.

### Then: does the module ↔ target binding still hold?

Older extensions register several targets from one file — named exports plus an `export = "…"` key in each `[[extensions.targeting]]` block. That is no longer valid at recent versions: a single-target extension default-exports its root, and **multiple targets require a separate module per target, each with its own default export.**

Splitting a shared module is real work — new files, new TOML entries, a shared component extracted — and **it is invisible to every validator**: the build passes and the extra targets simply never mount. Check `https://shopify.dev/docs/api/checkout-ui-extensions/<target-version>/targets` for the rule at your target before counting the targets as migrated.

### Checking components

**Prove every removal before you act on it.** This surface has no schema, so "the `loading` prop is gone" and "`useExtensionCapability` no longer exists" are the easiest false beliefs to form and the most expensive to act on — each one rewrites working code around something that never happened. A docs search that comes back empty proves nothing. Instead, put the prop or hook **in** a code block and run `validate_component_codeblocks` at the target: a failure is evidence of removal, a pass is proof it still exists. If neither the validator nor a changelog entry will say so, the row is **unresolved** — leave the code as it is and report it.

Watch the other direction too: a capability can be deprecated **as a whole** while the hook that reads it still validates, and a TOML still declaring it passes every build and every validator.

**Searching for the capability by name will not find it.** `--grep` matches titles, and Shopify titles these entries after the *API*, not the capability — so the capability appears only in the entry body. Grepping `block_progress` returns nothing; grepping the hook returns the entry that says, verbatim:

> *Starting in version `2026-07`, the `useBuyerJourneyIntercept` hook on checkout UI extensions, and the `block_progress` capability it depends on, are deprecated.*

So work from the TOML **inwards**: for each `[extensions.capabilities]` key, identify the API that depends on it and grep for **that** — the hook name, the component, the target. Then read the entry body for the capability name and check `effectiveApiVersion` against your target before tiering it. A capability whose API is deprecated is a row even when the extension still builds, renders and validates perfectly.

No schema to query, but component code **is** checkable: `validate_component_codeblocks` takes `api` (`polaris-admin-extensions`, `polaris-checkout-extensions`, `polaris-customer-account-extensions`, `pos-ui`, `polaris-app-home`), a `version`, and — required for extension surfaces — the `extensionTarget`. That catches renamed props and removed components, which is most of what breaks here. Everything else is versioned extension docs plus changelog entries tagged `Admin Extensions`, `Checkout UI`, `POS Extensions`, `App Bridge`.

If the extension's config file is named `shopify.ui.extension.toml`, that is the **pre-unified** format and a finding in its own right — record it before migrating the version, because the file it should become has a different shape (`[[extensions]]`), not just a different number.

Per extension:

- **Does every target still exist?** Targets are renamed and retired between versions; a retired target means the extension stops rendering, with no error in your build.
- **Have components changed?** UI extension component sets are versioned alongside the API. Props get renamed, components get replaced, and some are removed outright.
- **Have APIs available to the extension changed?** What an extension can read from and do to its host surface is version-gated.
- **Have capabilities or permissions changed?** New capability declarations may be required for behavior that used to be implicit — and a missing capability fails at runtime, in the merchant's admin or checkout. **A deprecated extension API can also push work onto a new access scope**: when the replacement for a removed hook reads data the extension used to receive for free, that is a `SCOPE` row and an operational event — every already-installed merchant re-authorizes — not a code change.

**Check the replacement's own requirements *and* where it actually runs — not just its signature.** A replacement API can be unavailable in some checkout modes (accelerated / express checkouts are the usual exception), or need a declaration the old one didn't — moving from checkout metafields to cart metafields, for instance, requires an `[[extensions.metafields]]` block or the read silently returns nothing. A migration that compiles, validates and renders can still be a behaviour regression in the mode you didn't test. Whatever the replacement's own docs list as preconditions, put each one in the ledger as its own row, because none of them will fail your build.
- **Checkout UI specifically**: what extensions may do at checkout is tightly governed and changes with the platform. Validation, discounts, and delivery-affecting behavior deserve individual ledger rows.

### Rewriting

- Update `api_version` per extension only when the plan approved that extension and all its rows are resolved. Like Functions, the version here is per-extension and yours to set — say which ones you moved.
- Translate component and API changes from the docs, one target at a time.
- **A UI extension that builds is not a UI extension that renders.** Nothing in the type system knows whether the host surface still offers your target.

## Validate

1. Validate extension code with the Dev MCP's extension validation tooling at the target version.
2. Build every changed extension. A build failure blocks.
3. **Render-check** through `shopify app dev` against a dev store wherever possible — for each changed target, confirm the extension actually appears and functions in its host surface. This is the only check that catches a retired target.
4. If you could not render-check, say so per extension. Do not report a rendering surface as verified on a build alone.

## Report back

Per extension: path, type, target(s), old → new `api_version`, component/API changes made, source URL, build status, render-check status. Then, called out separately:

- Session-token or authentication changes (App Bridge) — top of the report
- Retired or renamed targets, and extensions that may silently stop rendering
- New capability declarations required
- Extensions left on their old version and why
- Whether the app moved to auto-updating CDN App Bridge, and what that means for future pinning
