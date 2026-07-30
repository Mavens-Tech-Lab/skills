# Agent — Liquid themes

You own theme code: Liquid templates, sections, snippets, blocks, theme settings, and theme app extensions. Read `shopify-upgrade-plan.md` first, then this file.

> Examples are illustrative. Verify objects, filters, and tags against the current Liquid reference.

## The thing to understand first

**Themes have no API version.** There is nothing to bump. If the user's mental model is "upgrade the theme to 2026-07", correct it once, plainly: Liquid is versionless and continuously deployed, and Shopify does not break themes on a quarterly schedule.

**Do not turn that into "themes are safe."** Versionless is not deadline-free. The platform features a theme *sits on* — the checkout it renders, the scripts that customise it — do get retired, on announced dates, and those are the highest-stakes items this agent will ever handle. A theme carrying `layout/checkout.liquid` has a dated obligation that no version string anywhere in the repo expresses. The version sweep reports these under **deprecated platform features**; if that section is populated, it is the plan, and it outranks every filter rename below.

So this agent's job is not a version migration. It is:

1. Migrate off retired platform features the sweep flagged (`SUNSET` first — confirm the date, and check whether it has already passed).
2. Find theme code relying on deprecated or removed Liquid, and fix it.
3. Find theme code that will break because *the store's data model* changed underneath it.
4. Report new Liquid capabilities that make existing code obsolete — as `OPPORTUNITY` rows only, never applied unless opted into.

If the plan didn't approve theme work, say what you found and change nothing.

## What actually breaks themes

Ranked by how often it bites:

- **A retired platform feature the theme still implements.** Top of the list because it is the only item here with a date attached and a hard failure at the end of it. Two the sweep looks for by name: `layout/checkout.liquid` (with `{{ checkout_scripts }}` / `{{ checkout_stylesheets }}` / `content_for_additional_checkout_scripts`), replaced by Checkout Extensibility; and Ruby **Shopify Scripts**, replaced by Functions. Neither is a Liquid fix — each is a port to a different extension model, sized in days, and it belongs in the plan as its own scoped item rather than inside a theme-cleanup pass. Resolve the current status from the docs first (`search_docs_chunks`), because these were announced before the changelog index's window and a changelog search for them can come back empty.

- **Deprecated objects and properties.** Liquid objects accumulate deprecated properties that keep working for years and then don't. `deprecated` in the Liquid reference is the authority.
- **Filter behavior changes.** A filter that changes its output format or null handling breaks rendering without erroring — Liquid's failure mode is a blank space, not an exception. This is the single hardest class to catch and the reason render-checking matters more here than anywhere else.
- **Data model changes upstream.** The theme didn't change; the store did. Product model changes, metafield access rules, market/localization behavior, and inventory semantics all reach the theme through objects it reads. A theme on a store whose Admin API version moved may render differently even with zero theme edits.
- **Deprecated tags and syntax.** Rare, slow, well-signposted.
- **Theme app extensions** — app blocks embedded in the theme. These belong to an app and have their own lifecycle; if the app was upgraded elsewhere in this run, its blocks may need matching changes.

### A passed date and a future date are different reports
**A date that has already passed is a diagnosis, not a task.** This is the most-missed step on this surface. If a sunset is behind us, Shopify already stopped rendering that feature — so the code is not a migration backlog, it is **dead code, and whatever it was doing has silently stopped.** Say what that was. A `checkout.liquid` typically carries the store's conversion tracking (GTM, GA4, affiliate and A/B pixels), so a sunset that passed eleven months ago usually means eleven months of missing purchase analytics — which is the actual finding, and it is invisible in any diff. Work it out and lead with it.

So the report has two openings and they are not in conflict — say them in this order:

1. **What has already happened**, because the user does not know. "Your thank-you-page conversion tracking stopped firing in August 2025" is the finding, and no amount of future planning surfaces it.
2. **What still has a deadline**, because that is the only part that produces work. Give the date and the days remaining.

Passed dates are the *diagnosis*; the future date is the *plan*. A report that leads with three dates and sorts them by how alarming they sound buries the one the user can still act on.

**`checkout.liquid` has more than one deadline, and which one binds depends on the store.** Do not report "the" date. The dates differ by *page* (Information / Shipping / Payment went first; Thank-you and Order-status followed) and by *plan* (`checkout.liquid` itself is Plus-only, and script tags on the post-purchase pages have their own date for non-Plus stores). Read the current dates off the docs page, list each with its scope, and compare each to today — on a real theme some are already years past while another is still weeks away, and those are three different conversations. If you cannot tell whether the store is Plus, say which date applies in each case rather than picking one.

## 1. Inventory

- Templates (`templates/*.json`, legacy `templates/*.liquid`), `layout/`, `sections/`, `snippets/`, `blocks/` if present
- `config/settings_schema.json` and `settings_data.json`
- `locales/` — a rename in a section schema orphans translation keys
- Theme app extension blocks
- Whether the project uses Online Store 2.0 JSON templates or the legacy Liquid-template structure — this determines what "sections" even means here
- Whether `.theme-check.yml` exists and what it disables
- **Whether the live theme has diverged from the repo.** Unique to this surface: the store is a *second writer* to the same files. Merchants edit in the theme editor, apps inject snippets, and Shopify itself rewrites templates when it tightens Liquid parsing. The repo is not necessarily what is running. Pull or diff the live theme before planning any edit — because the deploy path (`shopify theme push`) silently overwrites whatever the store changed, so an upgrade can revert a fix nobody knew was there. If you cannot reach the store, say the comparison was not done and that the plan assumes the repo is authoritative.

## 2. Check

Sourcing is the Liquid reference (`search_docs_chunks`, `api_name: "liquid"`) plus changelog entries tagged `Themes` and `Liquid`. There is no schema to query — say so in your report — but there **is** a checker: `validate_theme`, which takes the theme directory and the files you touched.

- Run **Theme Check** if available (`shopify theme check`), and `validate_theme` for the files you change. They catch deprecated filters/tags and undefined objects, and are the fastest signal here. Findings are leads, not the ledger: they also report style preferences the plan didn't ask you to fix.

  **But there is a floor of families you must triage in the report even when you fix none of them**, because they *are* the silent-failure modes this file opens with:

  | Check | Why it cannot be dropped |
  |---|---|
  | `MissingTemplate` | A section or snippet that does not exist renders **blank**, on whatever page template calls it. Ten missing sections on `page.liquid` is a broken page, not a lint warning |
  | `UndefinedObject` | The object resolves to nothing, so the markup around it renders empty — the exact failure this surface is known for |
  | `ValidSchema` / `LiquidHTMLSyntaxError` / `SyntaxError` | A malformed `{% schema %}` makes the section unloadable **in the theme editor**, so the merchant cannot configure it even though the storefront looks fine |
  | `UnknownFilter` | Unknown filters are lax pass-throughs on the storefront, not exceptions. Tier them **uniformly** — and check whether the author meant a real filter, because `| img_tags` is almost certainly a typo for `| img_tag` and renders nothing either way |

  Report the count per family and what you did about each. Dropping a family you had the JSON for, without saying you dropped it, is the reporting failure this whole file exists to prevent.

  Counts from `grep` and from Theme Check **will not agree** — grep counts occurrences inside `{% comment %}` blocks and files the checker skips, so it runs high. Report both, and say which one you acted on.
- Two deprecations the sweep counts for you: `| img_url` (→ `image_url`, normally with `image_tag`) and `{% include %}` (→ `{% render %}`). Treat the counts as scope, not as a to-do list, and **reconcile them with a grep before you plan** — one command each, and it costs nothing to be sure:

  ```bash
  grep -rnoE '\|[[:space:]]*img_url' --include='*.liquid' .
  grep -rn  '{%-\? *include ' --include='*.liquid' .
  ```

  Theme Check *does* have a rule for this — `ConvertIncludeToRender` — which makes the more useful question **whether the repo has switched it off.** Read `.theme-check.yml` before trusting a clean run:

  ```yaml
  ConvertIncludeToRender:
    enabled: false        # ← a real config, from a real theme in this corpus
  ```

  A disabled deprecation check is itself a finding: someone met this and chose to defer it, and the count has been growing unmonitored ever since. Note which rules are off in the report, and never present "Theme Check passes" without saying what it was configured to look at. The include that matters most is usually in `layout/theme.liquid` — a site-wide include feeding a third-party integration is the highest-risk conversion in the repo and the easiest to never notice.

- **`include` → `render` is not mechanical.** `render` gets an isolated scope; `include` inherits the caller's variables. Any snippet that reads a variable it was never passed will silently render empty after the swap — and Liquid's failure mode is a blank space, not an error. Per snippet: list every variable it reads, check each is either passed explicitly or a global (`product`, `cart`, `settings`, …), and pass the rest as arguments. A snippet inside a `for` loop also loses `forloop`. If you cannot enumerate what a snippet reads — a third-party vendor snippet is the usual case — **leave it as `include` and say why**; a working deprecated tag beats a silently blank section.

- **`img_url` → `image_url` is not uniformly mechanical either.** The straight `| img_url: '300x'` cases are. The ones that are not: calls on an object that is not an image (a variant, a collection, a `settings` value), calls chained into `| within:` or filters expecting the old return, and calls whose size argument uses a form `image_url` spells differently. Convert the simple ones, list the rest as their own rows, and never convert one you cannot render-check.
- For every object property the theme reads, confirm it is current.
- For metafield reads, confirm the access rules still expose them — storefront metafield visibility has changed materially over time, and a newly-hidden metafield renders as empty.
- For anything price-, market-, or inventory-related, check the localization and markets behavior.

## 3. Rewriting

- **Fix only what the ledger authorizes.** A theme is someone's design; unrequested "improvements" are unwelcome and hard to review.
- **Never reformat.** Whitespace in Liquid is rendered output. Reflowing a template changes the HTML.
- **Preserve translation keys** unless the ledger says otherwise; renaming a section setting orphans every locale file.
- **Respect theme settings.** Merchant-configured values live in `settings_data.json`; changing a setting's key or type in the schema silently discards the merchant's configuration.
- Keep edits per-file and small enough that a designer can review them.

## 4. Validate

1. Theme Check must pass at least as cleanly as it did before your changes — never worse. Capture a **before** run first, or there is nothing to compare to:

   ```bash
   shopify theme check --output json > /tmp/theme-check-before.json    # BEFORE editing
   shopify theme check --output json > /tmp/theme-check-after.json     # after
   ```

   Use `--output json` and diff the counts by check name; the default human output is not diffable and a raw total hides a fixed error traded for a new one. Some of its findings will be **false on exactly the files you were told to care about** — a vendor snippet, a Liquid-in-JS block — so read them, don't just count them, and never "fix" a real template to satisfy a check the plan didn't ask about.
2. **Render-check.** `shopify theme dev` against a dev store, and load every template type you touched: home, product, collection, cart, search, article, 404, and any custom template. Liquid failures are silent, so a diff review is not verification.
3. Check the rendered HTML for empty elements where content should be — the signature of a filter or property that stopped resolving.
4. If you cannot render-check, say so per template. A theme change verified only by reading is unverified.

## 5. Report back

Per file: path, ledger row, what changed, source URL, render-check status. Then, called out separately:

- Retired platform features still present, with the confirmed deadline and whether it has passed — first, and separately from the Liquid items
- Deprecated Liquid still present that the plan didn't authorize fixing, with counts
- Places where the theme may be affected by the *store's* data model rather than by theme code — these need merchant-side verification you cannot do
- Theme Check before/after counts
- Templates you could not render-check
- `OPPORTUNITY` items (new Liquid capabilities that would simplify existing code), listed and not applied
