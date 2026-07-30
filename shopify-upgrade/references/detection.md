# Phase 1 — Detect what this codebase pins today

Goal: a complete, per-surface inventory of which Shopify API version this codebase actually uses — including the surfaces the user has forgotten about. Output is the `## Surface inventory` section of `shopify-upgrade-plan.md`.

Do not accept the user's answer to "what version are you on?" as the inventory. It is a useful hint and it is wrong often enough to matter: they will name the version in their main client config and not know that webhooks, a Function, and one hardcoded URL are on three other versions.

## 1. Sweep for version literals

```bash
node scripts/detect-versions.mjs /path/to/project
```

The script is language-agnostic on purpose. A Shopify API version is always `YYYY-MM` with MM ∈ {01,04,07,10}, so one pattern finds a TypeScript constant, a TOML key, a `.env` value, a Python positional argument, and a raw URL string in any language. It groups hits by surface, flags multi-version repos, separates prose mentions from real pins, and lists the SDKs it recognized.

Read its output critically — it is a lead generator, not the inventory:

- **`(medium)` confidence** means the classification came from nearby keywords. Open the file and confirm.
- **`Admin API (REST/GraphQL undetermined)`** means an SDK session/client was configured but the protocol is decided at the call sites. Go find them.
- **`Unclassified`** rows need a human read.
- **Zero pins found** is a real result with several causes — see §4. Read the deprecated-features section before concluding there is no work.
- **`Manifests:`** names the shallowest manifest per language, so a repo listed as `composer.json (PHP)` with no SDK is making raw HTTP calls — go read the client. Manifests are found at any depth, so a monorepo's nested app is included; if the SDK list looks longer than you expected, check whether the repo contains **more than one app** (two different Shopify app frameworks in one tree is a real and easily-missed shape).

### The `## Excluded` section is evidence, not noise

Real repos are full of version literals that are *not* pins, and on live client codebases they outnumber the real ones roughly six to one. The script separates them rather than dropping them silently, because a filter you can't see is indistinguishable from a bug. Six buckets, each worth a different reaction:

| Bucket | Why it isn't a pin | React by |
|---|---|---|
| **Commented out** | Inert config | Reading it — a commented `api_version` is often the previous value, or a rollback someone left behind |
| **Calendar dates** | `YYYY-MM-DD`, whose first seven characters are indistinguishable from a version: `--created_at_min=2022-07-10`, a `"updatedAt": "2025-04-24T…"` in a webhook fixture, a countdown timer's `default: '2024-01-01'` | Ignoring. Counted as a pin, each one invents a version the repo doesn't have — and then an age warning for it |
| **Another vendor's API version** | Recharge, Stripe and Klaviyo also version on `YYYY-MM`, in the same files: `RECHARGE_API_VERSION = '2021-01'` | Ignoring for this upgrade — but note that a *very* old one is often a second migration nobody has scheduled |
| **Prose inside code** | A sentence in a schema description or doc comment ("in API versions 2023-10 and beyond…") | Ignoring |
| **shopify.dev doc links** | A citation in a comment, e.g. `// see …/api/storefront/2022-04/objects/collection` | Ignoring — though a link to a long-dead version hints the code around it is equally old |
| **Build artifacts** | Minified bundles, content-hashed assets, `.shopify/` deploy manifests, `.history/` snapshots, and codegen output like `worker-configuration.d.ts` or anything headed `@generated` | Ignoring the artifact — but if its version differs from source, the build is stale and needs a rebuild after the upgrade |

If a bucket is unexpectedly large, look at it before trusting the pin list: it usually means the repo commits build output, which is worth knowing before Phase 5 edits anything.

### The `## Deprecated platform features` section

A second, independent question: not "which version is pinned" but "which retired features does this repo still use". Nothing here is a version pin, and the section is frequently populated in repos where the pin list is **empty** — which is exactly why it exists. Rows are tiered:

| Tier | Means | Treat as |
|---|---|---|
| `SUNSET` | Shopify has announced an end to it | Deadline work, ahead of every version bump. **Confirm the date and compare it to today — some have already passed.** |
| `HAZARD` | Works now, can change without notice (e.g. `api_version = "unstable"` in a shipped extension) | A `BEHAVIOR` row: it isn't broken, and it isn't safe |
| `LEGACY` | Superseded, still functioning | Migrate when you touch the file; count it as scope, not as urgency |

The script asserts **no dates** — deliberately, since it never touches the network. It names the feature and gives you both search terms. Resolve the status from the docs *first*: these were mostly announced before the changelog index's ~2-year window, so a changelog search can come back empty for a deprecation whose deadline is behind us. `references/sourcing.md` has the procedure.

### What the sweep deliberately does not read, and why you should

`.shopify/` is skipped, because its deploy bundle restates `api_version` from a past deploy and reporting that as a pin sends you editing a generated artifact. But it is skipped, not audited — and it is the one place that records **what was last deployed**, which is a different fact from what the source declares:

```bash
ls .shopify/ ; cat .shopify/project.json 2>/dev/null
grep -o '"handle":"[^"]*"' .shopify/deploy-bundle/manifest.json 2>/dev/null | sort -u
```

Read it by hand and compare the extension list against the ones you found in source. An extension in the manifest with no source in this repo means either it was deleted without being undeployed, or **it lives in another repo** — and if the manifest names more extensions than the tree does, the inventory you are about to write is incomplete for a reason no amount of scanning this repo will reveal. `.shopify/project.json` also tells you which `shopify.app.*.toml` is the *linked* one, which is the one whose versions are live when several disagree.

Same reasoning for anything else the repo cannot see: a `CLAUDE.md`/`README` pointing at a sibling backend, an `[app_proxy]` block, or scopes declaring write access the code in front of you never exercises. Each is evidence that a surface exists outside the scan. Say so in the plan rather than writing "not present".

## 2. Resolve each SDK's implicit version

The most dangerous version is the one nobody wrote down. Most SDKs default to a `LATEST_API_VERSION`-style constant baked into the **library release**, so the API version silently moves when someone bumps the dependency — and silently *doesn't* move when they don't.

For every SDK the sweep found, determine: does this call site pin a version explicitly, or inherit the SDK default? If inherited, what is that default in the installed version? Check the installed package, not the newest published one.

| Language | Where to look | Notes |
|---|---|---|
| JS/TS | `@shopify/shopify-api` (`apiVersion` in `shopifyApi({})`, `ApiVersion.*`), `@shopify/shopify-app-remix` / `-react-router`, `@shopify/admin-api-client`, `@shopify/storefront-api-client`, `@shopify/hydrogen` (`storefrontApiVersion`) | Check `node_modules/<pkg>/package.json` for the installed version, then its exported latest-version constant |
| PHP | `shopify/shopify-api` (`Context::initialize(... apiVersion ...)`), `osiset`/`kyon147` Laravel packages (`config/shopify-app.php` → `api_version`) | Laravel config is frequently env-driven — check `.env` too |
| Python | `ShopifyAPI` — `shopify.Session(shop_url, api_version, token)`, often a module constant | Version is a positional arg; easy to miss in a grep for `api_version` |
| Ruby | `shopify_api` (`ShopifyAPI::Context.setup(api_version:)`), `shopify_app` initializer | `config/initializers/shopify_app.rb` |
| Go | `bold-commerce/go-shopify` — `App{ApiVersion:}` or client option | |
| .NET | `ShopifySharp` — service constructors, sometimes a global default | |
| Raw HTTP | any language — URL string literals | The sweep is the only reliable finder here |

**Record the SDK's own version too.** Some upgrades are gated on it: a target API version may require an SDK release the project doesn't have, which turns a config change into a dependency upgrade with its own breaking changes. That is a plan item, not a surprise for Phase 5.

## 3. Enumerate surfaces explicitly

Walk this list and record a row for each, even to write "not present" — an absent row is indistinguishable from an overlooked one.

| Surface | Where the version lives | Commonly missed because |
|---|---|---|
| **Admin GraphQL** | client config; `/admin/api/<v>/graphql.json` | — |
| **Admin REST** | `/admin/api/<v>/<resource>.json` | Often a legacy corner of an otherwise-GraphQL app |
| **Storefront API** | client config; `/api/<v>/graphql.json`; Hydrogen `storefrontApiVersion` | Separate version from Admin, separate token |
| **Customer Account API** | client config; `/customer/api/<v>/graphql` | Newest surface; frequently unpinned |
| **Webhooks** | `shopify.app.toml` `[webhooks] api_version`; per-subscription version set at registration time | **Set once at registration and never revisited.** Payload shape follows *this* version, not the client's |
| **Functions** | each `extensions/*/shopify.extension.toml` → `api_version` | One TOML per extension; a repo can have several on different versions |
| **Extensions** (admin/checkout/POS UI) | each `shopify.extension.toml`; sometimes an `api_version` per target | Same as above |
| **App Bridge** | CDN script tag vs. `@shopify/app-bridge` npm dependency | The npm package is the legacy path; the CDN script auto-updates |
| **Theme (Liquid)** | nothing — themes carry no API version | Still breaks on Liquid/object changes; needs the themes agent anyway |
| **Hydrogen / headless** | `@shopify/hydrogen` version + `storefrontApiVersion` | Framework version and API version are different things |

**Webhooks deserve special attention.** A subscription created two years ago still delivers its original payload shape. Registration-time versions cannot be found by scanning source alone — check the registration code *and* say plainly in the plan that live subscriptions should be verified against the Partner Dashboard or `webhookSubscriptions` query, which the skill cannot do without store credentials.

**"No Shopify webhooks here" is a claim about the code, so check it against the router**, not against path names or the absence of a `[webhooks]` block. Grep the route table for Shopify's own HMAC verification — `X-Shopify-Hmac-Sha256`, `X-Shopify-Shop-Domain`, `X-Shopify-Topic` — because a Shopify-authenticated endpoint can sit behind a path named for something else entirely. Then confirm each verified endpoint's handler actually parses the payload of the topic Shopify sends it: a handler wired to a Shopify-verified route while reading another vendor's payload shape is a live defect, invisible to schema validation because no GraphQL is involved, and invisible to the sweep because it contains no version literal. Report it even though it gets no ledger row.

## 4. When the sweep finds nothing

Every one of these is a real scenario, and none of them means "no upgrade needed":

- **Fully SDK-default (unpinned).** The version tracks the installed SDK. The upgrade is a dependency bump plus whatever that changes. Find the SDK's default and treat it as the pinned version.
- **A Liquid theme.** No API version exists. Skip to the themes agent.
- **Runtime injection.** Version comes from an env var, secret manager, or platform config not in the repo. Ask; do not assume a default.
- **An unrecognized SDK or a wrapper.** Grep for `myshopify.com`, `X-Shopify-Access-Token`, `graphql.json` and read the client wrapper by hand.

## 5. Output

Write into `shopify-upgrade-plan.md`:

```markdown
# Shopify upgrade — <project> — <date>

## Surface inventory
| Surface | Pinned version | Pinned where (file:line) | Explicit or SDK default | SDK + version | Call sites | Notes |
|---|---|---|---|---|---|---|
...one row per surface present, plus explicit "not present" rows.

## Version spread
Distinct versions in this repo: ...
Oldest: ...   Newest: ...   Proposed target: ... (resolved in Phase 2)

## Open detection questions
numbered — runtime-injected versions, unverifiable live webhook subscriptions,
SDK upgrades the target version may require

## Change ledger
(empty — Phase 2 fills this)
```

A **version spread** — different surfaces on different versions — is the normal case, not an anomaly. Never silently normalize it: each surface's ladder is different, and a surface that is three releases behind carries more risk than one that is current. The plan prices each separately.
