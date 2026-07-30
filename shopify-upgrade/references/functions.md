# Agent — Shopify Functions

You own Shopify Functions: their `api_version`, input queries, target schemas, and the compiled artifacts. Read `shopify-upgrade-plan.md` first, then this file.

> Examples are illustrative. Verify target names and schemas against the target version's Functions docs.

## What makes Functions different

**A Function runs inside Shopify's checkout, not in your app.** There is no retry, no log you can tail after the fact, and a runtime failure degrades a live purchase path. The bar for "verified" here is higher than anywhere else in this upgrade.

**The version lives per-extension.** Each `extensions/*/shopify.extension.toml` has its own `api_version`. A repo with four Functions can have four versions. There is no global constant to fix — enumerate every TOML.

**The input query is a contract with the target schema.** A Function declares what data it receives via a GraphQL input query run against a *target-specific* schema. When the API version moves, that schema moves, and an input query selecting a removed field breaks the Function — often at build time if you are lucky, at runtime if you are not.

**The compiled artifact is versioned too.** Functions ship as Wasm. Bumping `api_version` without rebuilding and redeploying leaves the old artifact live. The version change is not real until the Function is rebuilt.

**A discount, delivery or payment Function is usually half of a pair.** The other half is a UI extension or admin block that writes the Function's configuration into a metafield, and it is declared in a different TOML — often with a different `api_version`. Change the Function's input or configuration shape without changing the writer and the Function reads a metafield it can no longer parse, in production, on a live cart. When the plan hands these to two different agents, that coupling is exactly what gets dropped: **name it in the ledger as one row spanning both files**, and say in the report that they must ship together.

## 1. Inventory

For every `shopify.extension.toml` under `extensions/`:

- `api_version`
- extension `type` and every **target** it registers — **extract the target string verbatim and put it in the inventory.** This is the single most important field in the file and the one most often skipped, because the sweep reports the version and not the target. The target determines the input query's root type, the export name the runtime looks for, and the result shape you must return; if a target was renamed or retired, all four change together and the "version bump" is a rewrite. A repo whose Function targets a retired identifier does not fail your build — it stops being invoked.
- the **export/handler name** and the file it lives in, and whether they follow the convention the target requires for the version you are moving to. Resolve that convention from the docs, not from the existing code: the existing code follows the convention of the version it was written for.

  **The TOML and the source use different casings of the same name, and getting this wrong fails the build.** The `export` in `shopify.extension.toml` must be **kebab-case**; the JavaScript/TypeScript export must be **camelCase**. The CLI maps one to the other:

  ```toml
  export = "cart-lines-discounts-generate-run"     # TOML: kebab-case
  ```
  ```ts
  export function cartLinesDiscountsGenerateRun(input) { … }   // source: camelCase
  ```

  Writing the camelCase name in the TOML fails with *"Invalid export names: 'cartLinesDiscountsGenerateRun'. The TOML's exports must be kebab-case (lowercase, hyphen or numbers) to comply with WebAssembly's Component Model."* The docs' naming section describes the **source** export, so applying it to the TOML is the easy mistake — and `shopify app function run --export=…` takes the **kebab-case** form too.
- the generated target schema beside the input query (often `schema.graphql`, whose first line is a `# api_version:` header the sweep now reports as a Functions pin). **If that header disagrees with the TOML, the input query is being validated against a stale contract** — regenerate it before drawing any conclusion from a passing build.
- any checked-in typegen output (`generated/api.ts` and similar). It is derived from the schema above and goes stale silently; regeneration is a required step, not a cleanup.
- the input query file (commonly `input.graphql` or `run.graphql` beside the source)
- the implementation language — Rust and JavaScript are the common paths; also check for a build toolchain pinned in `Cargo.toml`, `package.json`, or a Makefile
- any `.wasm` artifacts committed to the repo, and whether the build is reproducible

Record all of it in the ledger, one row per Function per problem.

**A target change is a rename, and renames fan out.** Changing the target renames the input query file, the source file, and the exported symbol — so every importer of those files breaks, and importers are not call sites, so they get no ledger row of their own. `src/index.ts` re-exporting `./run` is the usual one; a test file is the other. Sweep for importers of anything you rename **while writing the ledger**, and give them rows. An agent that finds an unresolvable import mid-migration has to choose between breaking the build and breaking the traceability rule, and neither is a choice it should be handed.

**Check the toolchain can actually run before you plan on it.** `npm run typegen` and `shopify app function build` are how rows 9–10 get done, and a Function's `package.json` frequently declares the scripts without declaring the dependencies they need (`@graphql-codegen/cli` and its plugins are the common absentees, listed under `codegen:` config but not in `devDependencies`). Find that out in Phase 1, not halfway through Phase 5 — and if you install them to complete the migration, install without saving and say so, because adding them to `package.json` is a dependency change no ledger row authorized.

## 2. Check against the target version

Functions are **not** covered by the Admin schema, but each Function target has its own input schema that the validator does know. `validate_graphql_codeblocks` takes a per-target `api` value — `functions_discount`, `functions_cart_transform`, `functions_delivery_customization`, `functions_payment_customization`, `functions_cart_checkout_validation`, `functions_order_discounts`, `functions_product_discounts`, `functions_shipping_discounts`, `functions_discounts_allocator`, `functions_fulfillment_constraints`, `functions_order_routing_location_rule`, `functions_local_pickup_delivery_option_generator`, `functions_pickup_point_delivery_option_generator` — so **run each `run.graphql` input query through the validator for its own target, at the target version.** Pick the `api` that matches the Function's declared target, not the closest-sounding one.

What the validator does *not* cover: the Function's **output/result** shape, the target names themselves, and the runtime API. Those come from the versioned Functions documentation (`search_docs_chunks`, `api_name: "functions"`) plus changelog entries tagged `Functions`. Say in your report which of the two backed each claim — an input query that validates says nothing about the return value.

For each Function:

- **Does its target still exist at the target version?** A retired or renamed target is `BREAKING` and cannot be worked around in code.
- **Does the input query still validate against the target's schema at the target version?** Every selected field must be checked.
- **Has the output/result shape changed?** The value a Function returns is schema-defined; a changed discount, delivery, or validation result shape is `BREAKING`.
- **Have the runtime limits changed?** Instruction limits, input size caps, and execution budgets change between versions. A Function that ran fine may exceed a tightened limit — this is the failure mode that looks like an intermittent checkout bug.
- **Has the semantics of a result changed?** The POS/discount space in particular has changed how amounts are interpreted (per-unit vs. total, for example). A Function that returns the same number under different semantics silently computes wrong money. Read every `Functions`-tagged changelog entry in the ladder for this class of change; it is invisible to any validator.

## 3. Rewriting

- Update the input query first, validate it, then update the implementation to match.
- **Discount, delivery, and payment-customization Functions handle money and eligibility.** Any change to how a value is computed or interpreted must be called out in the report in plain language ("this Function now returns a per-unit amount where it previously returned a total"), because no reviewer will catch it from the diff alone.
- Keep each Function's change independently revertible — one commit per Function.
- **Rebuild.** Run the project's build for each changed Function so the artifact matches the source. If the toolchain is missing or the build fails, that is a blocking finding, not a warning: an un-rebuilt Function is an unchanged Function.
- Update `api_version` in that Function's TOML **only if** the plan approved moving that Function and all its rows are resolved. Unlike other surfaces, the version here is per-extension and is yours to set — but only under those conditions, and say which ones you moved.

## 4. Validate

1. Validate each input query against the target schema with the Dev MCP's validation tooling.
2. Build every changed Function. A build failure blocks.
3. Run the project's Function tests if any exist. Functions are unusually testable — pure input→output — so if there are no tests and you changed money-affecting logic, say that the change is unverified and recommend a test before deploy.
4. Where possible, exercise the Function against a dev store through `shopify app dev`.

## 5. Report back

Per Function: path, old → new `api_version`, target(s), what changed in the input query and implementation, source URL, build status, validation status. Then, called out separately:

- Functions whose **result semantics** changed (money/eligibility) — always the top of your report
- Functions left on their old version and why
- Retired or renamed targets with no migration path
- Any Function you changed but could not rebuild or test
