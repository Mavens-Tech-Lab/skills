#!/usr/bin/env node
/**
 * detect-versions.mjs — find every Shopify API version pin in a codebase, plus
 * the deprecated platform features it still depends on.
 *
 * NO NETWORK. Reads local files only.
 *
 * Language-agnostic by design. A Shopify API version is always `YYYY-MM` with
 * MM in {01,04,07,10}, so one regex catches a typed SDK constant, a TOML key, a
 * .env value, and a raw URL string like "/admin/api/2024-10/graphql.json" in
 * any language — JS/TS, PHP, Python, Ruby, Go, C#, Java, Liquid, shell, YAML.
 *
 * Two questions are answered, because a codebase can be dangerously out of date
 * in either direction:
 *   1. Which versions are pinned, on which surface, and how old are they?
 *   2. Which *features* it uses that Shopify has announced the end of. A Liquid
 *      theme pins no API version at all, yet a theme still shipping
 *      checkout.liquid has a hard deadline. Reporting only (1) tells that repo
 *      it has nothing to do.
 *
 * Usage:
 *   node detect-versions.mjs [rootDir] [--json] [--all] [--context N]
 *
 * Options:
 *   --json        machine-readable output
 *   --all         include files with no Shopify signal nearby (noisy; a bare
 *                 date like 2024-04 in a CHANGELOG is not an API pin)
 *   --context N   characters of surrounding source to show (default 90)
 *
 * Exit codes: 0 found something, 1 error, 2 nothing found.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, extname, basename } from "node:path";

const VERSION_RE = /\b(20\d{2})-(01|04|07|10)\b/g;

/**
 * Symbolic version constants — the second, equally common way to pin.
 *
 * Modern Shopify Node apps rarely write the date. They write
 * `apiVersion: ApiVersion.October25`, which no date regex can see. Missing
 * these means missing an app's PRIMARY Admin version while still reporting
 * its extension TOMLs, which reads as a complete answer and isn't one.
 */
const SYMBOLIC_RE = /\bApiVersion\s*[.\[]\s*["']?([A-Za-z]+?)(\d{2})\b/g;
const MONTHS = { january: "01", april: "04", july: "07", october: "10" };

/**
 * Constants that resolve to whatever the installed SDK ships. Not a date —
 * the version silently moves when the dependency is bumped, and silently
 * doesn't when it isn't. Tracked separately because "unpinned" is the finding.
 */
const IMPLICIT_RE = /\b(LATEST_API_VERSION|RELEASE_CANDIDATE_API_VERSION|ApiVersion\s*[.\[]\s*["']?(?:Unstable|Latest|ReleaseCandidate))\b/g;

const SKIP_DIRS = new Set([
  "node_modules", ".git", "vendor", "dist", "build", "out", ".next", ".nuxt",
  ".svelte-kit", "target", "bin", "obj", "__pycache__", ".venv", "venv",
  "coverage", ".turbo", ".cache", "tmp", ".yarn", "Pods", ".gradle",
  // Tooling caches and build artifacts that carry stale copies of real config.
  // `.shopify/deploy-bundle/manifest.json` in particular restates api_version
  // from a past deploy — reporting it as a pin sends you editing an artifact.
  ".shopify", ".history", ".parcel-cache", ".wrangler", ".astro", ".vercel",
  ".netlify", ".serverless", ".output",
  // Local dev containers and editor state. `.ddev` alone is routinely >100MB of
  // vendored images and DB snapshots in a working tree.
  ".ddev", ".idea", ".vscode", ".fleet", ".devcontainer/.cache",
  // Other ecosystems' dependency and cache dirs.
  "bower_components", "jspm_packages", ".terraform", ".pytest_cache",
  ".mypy_cache", ".tox", ".bundle", ".expo", ".dart_tool", ".docusaurus",
]);

// The skill writes `shopify-upgrade-plan.md` into the project root, and Phase 6
// re-runs this sweep to prove no stale version literal survives. Reading our own
// plan back as evidence would make that check meaningless.
const SKIP_FILES = /^(shopify-upgrade-plan\.md|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|composer\.lock|Gemfile\.lock|poetry\.lock|go\.sum|Cargo\.lock)$/;

const TEXT_EXT = new Set([
  ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".mts", ".cts", ".vue", ".svelte",
  ".php", ".py", ".rb", ".go", ".cs", ".java", ".kt", ".rs", ".swift", ".dart",
  ".liquid", ".json", ".jsonc", ".toml", ".yaml", ".yml", ".xml", ".csproj",
  ".graphql", ".gql", ".sh", ".bash", ".zsh", ".env", ".ini", ".cfg", ".conf",
  ".tf", ".md", ".txt", ".html", ".erb", ".ejs", ".hbs", ".gradle", ".properties",
  ".gemspec", ".mod",
]);

/**
 * Shopify's first dated API version. Anything earlier is not a Shopify version,
 * whatever its shape — `2012-04` and `2000-01` both match `YYYY-MM` with a
 * quarterly month and both turn up in real repos (a copyright line, a legacy
 * vendor's version, a seeded date). Reported as their own bucket rather than
 * dropped, and never counted as a pin: an impossible version in the list drags
 * the "oldest pinned" headline back a decade and invents an emergency.
 */
const FIRST_SHOPIFY_VERSION = "2019-04";

/** Prose, not configuration: scanned but reported separately from real pins. */
const DOC_EXT = new Set([".md", ".txt"]);

/** A link into shopify.dev's versioned docs — a citation, never a pin. */
const DOC_URL_RE = /shopify\.dev\/(?:docs\/)?api\/[^\s"'`)]*20\d{2}-(?:01|04|07|10)/i;

/** Leading comment markers across the languages this scans. */
const COMMENT_RE = /^\s*(?:#|\/\/|\/\*|\*(?!\/)|<!--|;|--)/;

/**
 * Lines that assign a version to a recognized key, in any config syntax.
 *
 * The key is quoted in most languages that aren't JS — PHP `'api_version' =>`,
 * Python/JSON `"api_version":`, Ruby `'api_version' =>`. Allowing an optional
 * closing quote or bracket before the operator is what makes this rule work
 * outside JavaScript; without it the single most common way a PHP or Python app
 * pins its version is invisible to the classifier.
 */
const VERSION_KEY_RE = /\b(api[_-]?version|apiVersion|API_VERSION)\b["'\]]*\s*(?:=>|[:=])/i;

/**
 * Any identifier ending in `version` that is being assigned.
 *
 * The canonical key is `apiVersion`, but raw HTTP clients name it whatever they
 * like — `const SHOPIFY_VERSION = "2025-01"` at the top of a Cloudflare Worker
 * is the same pin, and there are 15 of them in one repo in this corpus. The
 * captured identifier decides whether it is ours; see `identOwner`.
 */
const VERSION_IDENT_RE = /\b([\w$]*version)\b["'\]]*\s*(?:=>|[:=])/i;

/**
 * Whose API version is this identifier naming?
 *
 * Other vendors version their APIs on the same YYYY-MM shape, in the same files
 * as Shopify's — `RECHARGE_API_VERSION = '2021-01'` sits four lines above
 * `SHOPIFY_VERSION` in this corpus. A foreign version reported as a Shopify pin
 * is worse than silence: it invents a surface, and an age warning, for an API
 * this skill does not cover.
 *
 * Returns "shopify", "foreign", or "unknown" (a bare `version` — decided by
 * whether the line itself mentions Shopify).
 */
const OURS_RE = /^(api|shopify|admin|storefront|sf|sfapi|customer|checkout|graphql|gql|store)$/i;
function identOwner(ident) {
  const s = ident.toLowerCase();
  if (/^api[_-]?version$/.test(s)) return "shopify"; // the canonical SDK key
  if (/shopify|storefront/.test(s)) return "shopify";
  const prefix = s.match(/^([a-z][a-z0-9]*)_/)?.[1];
  if (prefix) return OURS_RE.test(prefix) ? "shopify" : "foreign";
  return "unknown";
}

/**
 * A version key assigned the literal `unstable` — a pin, but not a dated one.
 *
 * Matches the same identifier family as VERSION_IDENT_RE rather than just the
 * canonical key, because the riskiest instance of this in the wild is a
 * *per-call* override on another name: Shopify's own Hydrogen template ships
 * `storefrontApiVersion: 'unstable'` in its sitemap loaders. A rule anchored to
 * `api_version` alone reports that repo as pinning nothing at all.
 */
const UNSTABLE_PIN_RE = /\b[\w$]*version\b["'\]]*\s*(?:=>|[:=])\s*["']?(unstable|release[_-]?candidate)\b/i;

const ADMIN_UNDETERMINED = "Admin API (REST/GraphQL undetermined)";

/**
 * Is this version literal a *pin*, or just a word in a sentence?
 *
 * Generated GraphQL schemas embed prose like "In API versions 2023-10 and
 * beyond, this type is deprecated" — a real sentence, not configuration. A pin
 * is always a delimited token: quoted, inside a URL path, or right of an `=`
 * or `:`. Prose has whitespace on both sides and no assignment on the line.
 */
function isDelimitedPin(line, index, version) {
  if (VERSION_KEY_RE.test(line)) return true;
  const before = line[index - 1] ?? " ";
  const after = line[index + version.length] ?? " ";
  return /["'`\/=:(\[,]/.test(before) || /["'`\/]/.test(after);
}

/**
 * Is this `YYYY-MM` actually the front of a calendar date?
 *
 * Shopify versions are `YYYY-MM` and stop there, so anything followed by `-DD`
 * is an ISO date: `--created_at_min=2022-07-10`, a SQL literal, a log line, a
 * migration timestamp. Every one of those sits right of an `=` or inside
 * quotes, so the delimiter test above happily accepts it, and it then appears
 * in the report as a pinned version the codebase does not have.
 */
function isCalendarDate(line, index) {
  return /^-\d\d/.test(line.slice(index + 7, index + 10));
}

/**
 * Is this file a build artifact rather than source?
 *
 * Path-based skipping is not enough: Shopify themes commit compiled bundles
 * into `assets/`, which is a directory that also holds real source. So detect
 * generated content by its shape instead. A version literal inside a bundle is
 * never editable — you change the source and rebuild.
 */
function isGeneratedFile(rel, content) {
  const base = basename(rel).toLowerCase();
  // A Liquid template is hand-written source, always. Themes routinely paste an
  // inline vendor pixel (TriplePixel, GTM, VWO) into <head>, which puts a
  // 1800-character line in `layout/theme.liquid` and trips the minified-code
  // test below — silently discarding the single most important file in a theme.
  if (base.endsWith(".liquid")) return false;
  if (/\.min\.(js|css)$/.test(base)) return true;
  if (/-[0-9a-f]{8,}\.(js|css)$/.test(base)) return true; // content-hashed bundle
  if (/^\/\/# sourceMappingURL=/m.test(content)) return true;
  if (base.endsWith(".map")) return true;
  // Codegen output that mirrors a real config file. `worker-configuration.d.ts`
  // is wrangler's typed echo of wrangler.toml: reporting its version as a pin
  // sends you editing a file the next `wrangler types` run overwrites.
  if (base === "worker-configuration.d.ts") return true;
  if (/@generated|generated by wrangler|auto-?generated|do not edit|code generated by|automatically generated/i
        .test(content.slice(0, 4000))) return true;
  // Minified code: one very long line is the reliable tell.
  let longest = 0;
  for (const line of content.split("\n", 400)) {
    if (line.length > longest) longest = line.length;
    if (longest > 600) return true;
  }
  return false;
}

const EXTRA_FILES = new Set([
  "Gemfile", "Dockerfile", "Makefile", "Procfile", "requirements.txt", ".env",
  "go.mod", "Pipfile", "packages.config",
]);

/** A version literal only counts as a Shopify pin if Shopify context is near. */
const SHOPIFY_HINT = /shopify|admin\/api|storefront|graphql\.json|myshopify|api[_-]?version|apiVersion|X-Shopify|customer_account|checkout/i;

/** Files where any version literal is almost certainly an API pin. */
const HIGH_SIGNAL_FILE = /^(shopify\.app.*\.toml|shopify(\.[a-z0-9]+)*\.extension\.toml|shopify\.theme\.toml|\.env.*|shopify\.server\..*)$/i;

const SDK_MARKERS = [
  // [display name, manifest basename(s), regex over manifest content, language]
  ["@shopify/shopify-api (Node)", ["package.json"], /"@shopify\/shopify-api"\s*:\s*"([^"]+)"/, "JS/TS"],
  ["@shopify/shopify-app-remix", ["package.json"], /"@shopify\/shopify-app-remix"\s*:\s*"([^"]+)"/, "JS/TS"],
  ["@shopify/shopify-app-react-router", ["package.json"], /"@shopify\/shopify-app-react-router"\s*:\s*"([^"]+)"/, "JS/TS"],
  ["@shopify/shopify-app-express", ["package.json"], /"@shopify\/shopify-app-express"\s*:\s*"([^"]+)"/, "JS/TS"],
  ["@shopify/admin-api-client", ["package.json"], /"@shopify\/admin-api-client"\s*:\s*"([^"]+)"/, "JS/TS"],
  ["@shopify/storefront-api-client", ["package.json"], /"@shopify\/storefront-api-client"\s*:\s*"([^"]+)"/, "JS/TS"],
  ["@shopify/graphql-client", ["package.json"], /"@shopify\/graphql-client"\s*:\s*"([^"]+)"/, "JS/TS"],
  ["@shopify/ui-extensions", ["package.json"], /"@shopify\/ui-extensions"\s*:\s*"([^"]+)"/, "JS/TS"],
  ["@shopify/ui-extensions-react", ["package.json"], /"@shopify\/ui-extensions-react"\s*:\s*"([^"]+)"/, "JS/TS"],
  ["@shopify/checkout-ui-extensions (renamed → @shopify/ui-extensions)", ["package.json"], /"@shopify\/checkout-ui-extensions(?:-react)?"\s*:\s*"([^"]+)"/, "JS/TS"],
  ["@shopify/app-bridge (legacy npm)", ["package.json"], /"@shopify\/app-bridge"\s*:\s*"([^"]+)"/, "JS/TS"],
  ["@shopify/app-bridge-react", ["package.json"], /"@shopify\/app-bridge-react"\s*:\s*"([^"]+)"/, "JS/TS"],
  ["@shopify/hydrogen", ["package.json"], /"@shopify\/hydrogen"\s*:\s*"([^"]+)"/, "JS/TS"],
  ["@shopify/hydrogen-react", ["package.json"], /"@shopify\/hydrogen-react"\s*:\s*"([^"]+)"/, "JS/TS"],
  ["@shopify/remix-oxygen", ["package.json"], /"@shopify\/remix-oxygen"\s*:\s*"([^"]+)"/, "JS/TS"],
  ["@shopify/cli", ["package.json"], /"@shopify\/cli"\s*:\s*"([^"]+)"/, "JS/TS"],
  ["shopify/shopify-api (PHP, official)", ["composer.json"], /"shopify\/shopify-api"\s*:\s*"([^"]+)"/, "PHP"],
  ["phpclassic/php-shopify", ["composer.json"], /"phpclassic\/php-shopify"\s*:\s*"([^"]+)"/, "PHP"],
  ["slince/shopify-api-php", ["composer.json"], /"slince\/shopify-api-php"\s*:\s*"([^"]+)"/, "PHP"],
  ["laravel-shopify", ["composer.json"], /"(?:osiset|kyon147)\/laravel-shopify"\s*:\s*"([^"]+)"/, "PHP"],
  ["ShopifyAPI (Python)", ["requirements.txt", "pyproject.toml", "Pipfile", "setup.py"], /ShopifyAPI[=~><\s"']*([\d.]*)/i, "Python"],
  ["shopify_api (Ruby)", ["Gemfile", "*.gemspec"], /gem\s+["']shopify_api["'][^\n]*/, "Ruby"],
  ["shopify_app (Ruby)", ["Gemfile"], /gem\s+["']shopify_app["'][^\n]*/, "Ruby"],
  ["go-shopify", ["go.mod"], /(github\.com\/[\w-]+\/go-shopify[^\s]*)/, "Go"],
  ["ShopifySharp (.NET)", ["*.csproj", "packages.config"], /ShopifySharp["\s\S]{0,40}?Version="([^"]+)"/, ".NET"],
];

/** Manifest basename -> language, for reporting what kind of project this is. */
const MANIFEST_LANG = [
  [/^package\.json$/, "JS/TS"],
  [/^composer\.json$/, "PHP"],
  [/^(requirements.*\.txt|pyproject\.toml|Pipfile|setup\.py)$/, "Python"],
  [/^(Gemfile|.*\.gemspec)$/, "Ruby"],
  [/^go\.mod$/, "Go"],
  [/^(.*\.csproj|packages\.config)$/, ".NET"],
  [/^(pom\.xml|build\.gradle.*)$/, "JVM"],
];

/**
 * Deprecated platform features, detected by their physical trace in the repo.
 *
 * These are *not* version pins, and that is the point: the codebases most
 * exposed to a Shopify deadline are often the ones with no version string
 * anywhere. A theme still shipping checkout.liquid has migration work whose
 * deadline has nothing to do with which API version it names.
 *
 * Deliberately no dates here. Announced timelines move, and this script never
 * touches the network, so it names the feature and the search term that
 * resolves the current status from the changelog. Asserting a sunset date from
 * memory is exactly the failure the sourcing rules exist to prevent.
 *
 *   tier: SUNSET  — Shopify has announced an end to this. Deadline-bearing.
 *         LEGACY  — superseded; still functions, but no longer the way.
 *         HAZARD  — works today and can break without notice.
 *
 * Matching: `ext` and `file` are gates, `content` is the test. With both `file`
 * and `content` the default is AND — `either: true` says the rule fires on
 * whichever one hits, for features identifiable by filename *or* by contents.
 */
const LEGACY_RULES = [
  {
    id: "checkout-liquid",
    tier: "SUNSET",
    label: "checkout.liquid / checkout Additional Scripts",
    replacement: "Checkout Extensibility — checkout UI extensions + Customer Events (web pixels)",
    clTerm: "checkout",
    docsQuery: "migrate from checkout.liquid to checkout extensibility",
    either: true,
    file: /(^|\/)layout\/checkout\.liquid$/,
    content: /\{\{\s*(?:checkout_scripts|checkout_stylesheets)\s*\}\}|content_for_additional_checkout_scripts/,
  },
  {
    id: "shopify-scripts",
    tier: "SUNSET",
    label: "Shopify Scripts (Ruby) / Script Editor",
    replacement: "Shopify Functions (discount, delivery and payment customization)",
    clTerm: "scripts",
    docsQuery: "migrate Shopify Scripts to Functions",
    either: true,
    file: /(^|\/)_?shopify[-_]scripts?\//,
    content: /^\s*(?:Input|Output)\.cart\b/m,
    ext: [".rb"],
  },
  {
    id: "legacy-extension-toml",
    tier: "LEGACY",
    label: "shopify.ui.extension.toml (pre-unified extension config)",
    replacement: "shopify.extension.toml with an [[extensions]] block",
    clTerm: "extension",
    docsQuery: "extension configuration file shopify.extension.toml",
    file: /(^|\/)shopify\.ui\.extension\.toml$/,
  },
  {
    id: "checkout-ui-extensions-pkg",
    tier: "LEGACY",
    label: "@shopify/checkout-ui-extensions dependency",
    replacement: "@shopify/ui-extensions (the package was renamed and re-scoped)",
    clTerm: "ui extensions",
    docsQuery: "@shopify/ui-extensions package migration",
    file: /(^|\/)package\.json$/,
    content: /"@shopify\/checkout-ui-extensions(?:-react)?"/,
  },
  {
    id: "rest-product-endpoints",
    // LEGACY, not SUNSET, and the distinction is the whole point: the published
    // deadlines for these endpoints are scoped to PUBLIC apps. A custom or
    // private app on REST is explicitly outside them. Tiering this SUNSET told
    // such a repo it was overdue when it was not — and the tier word lands long
    // before the "no dates are asserted here" hedge at the bottom of the section.
    tier: "LEGACY",
    label: "REST Admin product / variant / inventory endpoints (deadlines apply to PUBLIC apps — check which this is)",
    replacement: "the GraphQL Admin API equivalents",
    clTerm: "rest",
    docsQuery: "migrate REST product endpoints to GraphQL",
    // Two shapes, both unambiguous. The path form does NOT require a leading
    // slash — a Guzzle service description writes `admin/api/{version}/products.json`
    // as a relative URI, which is how a 219-endpoint REST client hides from a
    // rule anchored to "/admin/api/". The SDK form requires the `.json` suffix on
    // a resource name, which no router path shares.
    content: /\badmin\/api\/[^\s"'`]*\/(?:products|variants|inventory_items|inventory_levels)\b|->\s*(?:get|post|put|delete)\(\s*['"](?:products|variants|inventory_items|inventory_levels)\.json/,
  },
  {
    id: "unstable-api-version",
    tier: "HAZARD",
    label: 'api_version pinned to "unstable"',
    replacement: "a dated stable version",
    clTerm: "api version",
    docsQuery: "unstable API version release candidate",
    content: UNSTABLE_PIN_RE,
  },
  {
    id: "liquid-img-url",
    tier: "LEGACY",
    label: "Liquid `img_url` filter",
    replacement: "`image_url` (with `image_tag`)",
    clTerm: "liquid",
    docsQuery: "img_url filter deprecated image_url",
    ext: [".liquid"],
    content: /\|\s*img_url\b/,
  },
  {
    id: "liquid-include",
    tier: "LEGACY",
    label: "Liquid `{% include %}` tag",
    replacement: "`{% render %}` (isolated scope)",
    clTerm: "liquid",
    docsQuery: "include tag deprecated use render",
    ext: [".liquid"],
    content: /\{%-?\s*include\s/,
  },
];

const TIER_RANK = { SUNSET: 0, HAZARD: 1, LEGACY: 2 };

/**
 * `@shopify/ui-extensions` is versioned on the API's own calendar: `2025.4.x`
 * *is* the 2025-04 API. So an extension declares its version twice — once as
 * `api_version` in its TOML, once as a dependency range — and the two are meant
 * to move together. When they disagree, the extension is built against one
 * version of the component library and declared against another, which is a
 * real defect that no `YYYY-MM` regex can see because the dependency never
 * writes a hyphen.
 */
const UI_EXT_DEP_RE = /"@shopify\/ui-extensions(?:-react)?"\s*:\s*"[^\d"]*(\d{4})\.(\d{1,2})/g;

function scanUiExtensionPins(root, files) {
  const tomlByDir = new Map();
  for (const f of files) {
    if (!/shopify(?:\.[a-z0-9]+)*\.extension\.toml$/.test(f)) continue;
    try {
      const v = readFileSync(f, "utf8").match(/api_version\s*=\s*["']([^"']+)["']/);
      if (v) tomlByDir.set(f.slice(0, f.lastIndexOf("/")), v[1]);
    } catch { /* unreadable */ }
  }
  const out = [];
  for (const f of files) {
    if (basename(f) !== "package.json") continue;
    let content;
    try { content = readFileSync(f, "utf8"); } catch { continue; }
    const dir = f.slice(0, f.lastIndexOf("/"));
    UI_EXT_DEP_RE.lastIndex = 0;
    const seen = new Set();
    let m;
    while ((m = UI_EXT_DEP_RE.exec(content)) !== null) {
      const version = `${m[1]}-${String(m[2]).padStart(2, "0")}`;
      if (seen.has(version)) continue;
      seen.add(version);
      out.push({
        file: relative(root, f) || basename(f),
        version,
        declared: tomlByDir.get(dir) ?? null,
      });
    }
  }
  return out;
}

/**
 * Access scopes the app declares, straight from its TOML.
 *
 * On its own this is inventory. Its value is as the left-hand side of a diff:
 * `validate_graphql_codeblocks` reports the scopes each operation *requires* at
 * the target version, and a scope that is required but not declared is the
 * `SCOPE` risk tier — every already-installed merchant must re-authorize, which
 * no code change can do for them. Without the declared set there is nothing to
 * compare the required set against, so the tier had no input at all.
 */
function scanScopes(root, files) {
  const out = [];
  for (const f of files) {
    if (!/shopify\.app.*\.toml$/.test(f)) continue;
    let content;
    try { content = readFileSync(f, "utf8"); } catch { continue; }
    const rel = relative(root, f) || basename(f);
    const line = (re) => {
      const m = content.match(re);
      if (!m) return null;
      return m[1].split(/[,\s"']+/).map((x) => x.trim()).filter(Boolean);
    };
    const required = line(/^\s*scopes\s*=\s*"([^"]*)"/m);
    const optional = line(/^\s*optional_scopes\s*=\s*\[([^\]]*)\]/m);
    if (required || optional) out.push({ file: rel, scopes: required ?? [], optionalScopes: optional ?? [] });
  }
  return out;
}

/**
 * Map a pin to the Shopify surface that owns it.
 *
 * Evidence is ranked, and rank matters. `line` is the line the version literal
 * was actually found on; `near` also includes its neighbours. Neighbour text is
 * a hint, never an authority — a `// storefront` comment on the next line must
 * not reclassify an /admin/api/ URL, and a `'webhook_secret' =>` on the next
 * line must not reclassify the line that assigns the app's api_version. So all
 * definitive tests, and the line's own assignment, are settled before `near` is
 * consulted at all.
 */
function surfaceOf(rel, line, near, fileContent) {
  const p = rel.toLowerCase();
  const l = line.toLowerCase();
  const n = (near ?? line).toLowerCase();
  // Whole-file context. Required for TOMLs: `api_version` sits at line 1 while
  // `type = "function"` is several lines down, outside any neighbour window.
  const f = (fileContent ?? near ?? line).toLowerCase();

  // 1. Definitive — the URL shape on THIS line. Admin is checked before
  //    Storefront because /admin/api/.../graphql.json also matches a looser
  //    graphql test, and misrouting Admin work to the storefront agent is the
  //    single most damaging classification error this script can make.
  if (/\/admin\/api\//.test(l)) {
    return /graphql\.json|graphql/.test(l) ? "Admin GraphQL" : "Admin REST";
  }
  // SDK REST resource imports pin the REST version independently of the client:
  //   import { restResources } from "@shopify/shopify-api/rest/admin/2025-10"
  // A very common Remix-app line, and it is unambiguously Admin REST.
  if (/shopify-api\/rest\/admin\//.test(l) || /restresources/.test(l)) return "Admin REST";
  if (/\/customer\/api\/|customer[_-]?account/.test(l)) return "Customer Account API";
  // The Storefront endpoint is /api/<version>/graphql.json. The version is
  // usually interpolated — `/api/${version}/graphql.json` — so match the path
  // shape rather than a literal date, which the previous rule required and
  // therefore missed on every templated call. Safe to be loose here: every
  // Admin and Customer Account path has already returned above.
  if (/\/api\/[^\s"'`)]*graphql/.test(l)) return "Storefront API";

  // 2. Definitive — the file this pin lives in.
  //    Matches shopify.extension.toml and its older siblings
  //    (shopify.ui.extension.toml, shopify.theme.extension.toml).
  if (/shopify(?:\.[a-z0-9]+)*\.extension\.toml$/.test(p)) {
    // The TOML's own `type` is the authority; a Functions repo also holds
    // ui_extensions, so the directory name proves nothing.
    if (/type\s*=\s*"function"/.test(f)) return "Functions";
    if (/type\s*=\s*"[a-z_]*extension"/.test(f)) return "Extensions";
    return /\bfunction/.test(f) ? "Functions" : "Extensions";
  }
  // A Function's generated target schema carries an `# api_version:` header.
  if (/extensions?\/.*\.graphql$/.test(p) || /(^|\/)schema\.graphql$/.test(p)) {
    return /extensions?\//.test(p) ? "Functions" : "Admin GraphQL";
  }
  if (/shopify\.app.*\.toml$/.test(p)) return /webhook/.test(n) ? "Webhooks" : "App config";
  if (/shopify\.theme\.toml$/.test(p)) return "Theme (Liquid)";
  if (/\.liquid$/.test(p) || /(^|\/)(sections|snippets|templates|layout)\//.test(p)) {
    return "Theme (Liquid)";
  }

  // 3. Keywords on THIS line, or in the path. Path evidence is strong: a file
  //    under storefront/ pins a storefront version whatever the line says.
  const byKeyword = (scope) => {
    if (/hydrogen|oxygen/.test(scope) || /hydrogen|oxygen/.test(p)) return "Storefront (Hydrogen)";
    if (/customer[_-]?account/.test(scope)) return "Customer Account API";
    if (/storefront/.test(scope) || /storefront/.test(p)) return "Storefront API";
    if (/app[_-]?bridge/.test(scope) || /app[_-]?bridge/.test(p)) return "App Bridge";
    if (/webhook/.test(scope) || /webhook/.test(p)) return "Webhooks";
    if (/graphql/.test(scope)) {
      // "graphql" alone does not mean Admin. Storefront and Customer Account
      // are GraphQL too, so look for their endpoint shape before defaulting.
      // (`(?<!admin)` because /admin/api/…/graphql also contains /api/…/graphql.)
      if (/(?<!admin)\/api\/[^\s"'`)]*graphql/.test(scope)) return "Storefront API";
      return "Admin GraphQL";
    }
    return null;
  };
  const onLine = byKeyword(l);
  if (onLine) return onLine;

  // 4. The `ApiVersion` enum ships with @shopify/shopify-api, which is an Admin
  //    client — Storefront and Customer Account use their own clients and plain
  //    version strings. So a symbolic pin with no storefront signal is Admin.
  //    REST vs GraphQL is still decided at the call sites, so say only that.
  if (/apiversion\s*[.\[]/.test(l)) return ADMIN_UNDETERMINED;

  // 5. An assignment to a version-shaped identifier, anywhere. Apps park this in
  //    constants.ts as often as in shopify.server.ts, so the filename proves
  //    nothing — but the assignment itself is the app's client version. This
  //    outranks neighbour keywords deliberately: in a PHP config block the line
  //    after `'api_version' =>` is often `'webhook_secret' =>`, and the app's
  //    primary Admin version was being filed under Webhooks because of it.
  const ident = line.match(VERSION_IDENT_RE)?.[1];
  const owner = ident ? identOwner(ident) : null;
  if (owner === "shopify" || (owner === "unknown" && /shopify/i.test(line))) {
    // A declaration names no surface — the call sites in the same file do. Use
    // that only when the file speaks with one voice: a worker that builds both
    // an admin and a storefront client from one constant cannot be resolved
    // here, and "undetermined" is the truthful answer.
    const picks = [];
    if (/\/admin\/api\/|createadminapiclient/.test(f)) {
      picks.push(/\/admin\/api\/[^\s"'`]*graphql|createadminapiclient/.test(f) ? "Admin GraphQL" : "Admin REST");
    }
    if (/\/customer\/api\/|createcustomeraccountclient/.test(f)) picks.push("Customer Account API");
    // The lookbehind matters: `/admin/api/…/graphql.json` also contains
    // `/api/…/graphql`, so without it every Admin file looks like a Storefront
    // file too, the two cancel out, and the surface is reported as unknown.
    if (/createstorefrontapiclient|(?<!admin)\/api\/[^\s"'`)]*graphql/.test(f)) picks.push("Storefront API");
    if (new Set(picks).size === 1) return picks[0];
    return ADMIN_UNDETERMINED;
  }

  // 6. Last resort — keywords anywhere in the neighbourhood.
  const nearby = byKeyword(n);
  if (nearby) return nearby;

  // 7. Recognizable SDK session/client setup with no surface keyword: these are
  //    Admin clients in every SDK that has this shape, but REST vs GraphQL is
  //    decided at the call site, not here. Say so rather than guessing.
  if (/shopify\.session|shopifyapi|shopify_api|shopifysharp|new shopify|session\(/.test(n)) {
    return ADMIN_UNDETERMINED;
  }
  return "Unclassified";
}

/**
 * How many quarterly releases old is this version, as of today?
 *
 * Versions are quarterly (01/04/07/10), so the arithmetic is exact — no
 * calendar library and no network needed. Used only to flag age, never to
 * assert a sunset date: Shopify's guarantee is a 12-month *minimum*, and the
 * real removal date comes from the changelog.
 */
function quartersOld(version) {
  const [y, m] = version.split("-").map(Number);
  const now = new Date();
  const nowQ = now.getFullYear() * 4 + Math.floor(now.getMonth() / 3);
  return nowQ - (y * 4 + Math.floor((m - 1) / 3));
}

function walk(dir, root, out, depth = 0) {
  if (depth > 12) return out;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(full, root, out, depth + 1);
    } else if (e.isFile()) {
      if (SKIP_FILES.test(e.name)) continue;
      const ext = extname(e.name);
      const ok = TEXT_EXT.has(ext) || EXTRA_FILES.has(e.name) || e.name.startsWith(".env") || ext === "";
      if (!ok) continue;
      try {
        if (statSync(full).size > 2_000_000) continue;
      } catch {
        continue;
      }
      out.push(full);
    }
  }
  return out;
}

/**
 * Which Shopify SDKs does this project depend on, and what kind of project is it?
 *
 * Manifests are found anywhere in the tree, not just at the root: a monorepo
 * parks the real app in a subdirectory, and reading only ./package.json reports
 * "no SDK recognized" for a repo whose app imports @shopify/shopify-app-remix
 * one level down.
 */
function detectSdks(root, files) {
  const manifests = files.filter((f) => {
    const b = basename(f);
    return b === "package.json" || b === "composer.json" || b === "go.mod" ||
      b === "Gemfile" || b === "Pipfile" || b === "setup.py" || b === "pyproject.toml" ||
      b === "packages.config" || /^requirements.*\.txt$/.test(b) ||
      b.endsWith(".gemspec") || b.endsWith(".csproj");
  });

  const cache = new Map();
  const read = (path) => {
    if (!cache.has(path)) {
      try {
        cache.set(path, readFileSync(path, "utf8"));
      } catch {
        cache.set(path, "");
      }
    }
    return cache.get(path);
  };

  const found = [];
  for (const [name, wanted, re, lang] of SDK_MARKERS) {
    const patterns = wanted.map((w) =>
      w.includes("*") ? new RegExp(`${w.replace(/\./g, "\\.").replace("*", ".*")}$`) : null,
    );
    let hitRow = null;
    for (const path of manifests) {
      const b = basename(path);
      const eligible = wanted.some((w, i) => (patterns[i] ? patterns[i].test(b) : w === b));
      if (!eligible) continue;
      const hit = read(path).match(re);
      if (!hit) continue;
      hitRow = {
        sdk: name,
        lang,
        version: (hit[1] ?? "").trim() || "present",
        file: relative(root, path) || b,
      };
      break;
    }
    if (hitRow) found.push(hitRow);
  }

  // One representative manifest per language, and it has to be the shallowest
  // one: naming a random nested package.json as "the" manifest misdescribes the
  // project, and in a monorepo the first one walked is arbitrary.
  const depth = (p) => p.split(/[\\/]/).length;
  const langs = new Map();
  for (const path of manifests) {
    const b = basename(path);
    for (const [re, lang] of MANIFEST_LANG) {
      if (!re.test(b)) continue;
      const rel = relative(root, path) || b;
      const prev = langs.get(lang);
      if (!prev || depth(rel) < depth(prev)) langs.set(lang, rel);
      break;
    }
  }
  return { sdks: found, langs: [...langs.entries()].map(([lang, file]) => ({ lang, file })) };
}

/** Collect deprecated-feature traces for one file. */
function scanLegacy(rel, content, ext, into) {
  for (const rule of LEGACY_RULES) {
    if (rule.ext && !rule.ext.includes(ext)) continue;
    const pathHit = rule.file ? rule.file.test(rel) : true;
    const contentHit = rule.content ? rule.content.test(content) : false;
    if (rule.either) {
      // Identifiable by name OR by contents: checkout.liquid is usually called
      // checkout.liquid, but the same deprecated tags turn up in a theme that
      // renamed it, and vice versa.
      if (!(rule.file && rule.file.test(rel)) && !contentHit) continue;
    } else if (rule.content) {
      if (!pathHit || !contentHit) continue; // path is a gate, content is the test
    } else if (!pathHit) {
      continue; // filename is the whole rule
    }

    const bucket = (into[rule.id] ??= { rule, files: [], count: 0 });
    let where = rel;
    if (rule.content && contentHit) {
      // Count every occurrence, not every matching line: a developer sizing the
      // work from "17 occurrences" needs the number of edits, and two img_url
      // filters on one line are two edits.
      const counter = new RegExp(rule.content.source, rule.content.flags.replace("g", "") + "g");
      let n = 0;
      let firstLine = 0;
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        counter.lastIndex = 0;
        const found = lines[i].match(counter);
        if (!found) continue;
        n += found.length;
        if (!firstLine) firstLine = i + 1;
      }
      // A multiline pattern can match the file while no single line does.
      if (firstLine) where = `${rel}:${firstLine}`;
      bucket.count += n || 1;
    } else {
      bucket.count += 1;
    }
    if (bucket.files.length < 4) bucket.files.push(where);
    else bucket.more = (bucket.more ?? 0) + 1;
  }
}

function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  const all = argv.includes("--all");
  const ctxIdx = argv.indexOf("--context");
  const CTX = ctxIdx !== -1 ? Math.max(20, parseInt(argv[ctxIdx + 1], 10) || 90) : 90;
  const root = argv.find((a) => !a.startsWith("--") && (ctxIdx === -1 || a !== argv[ctxIdx + 1])) ?? process.cwd();

  if (!existsSync(root)) {
    console.error(`error: no such directory: ${root}`);
    process.exit(1);
  }

  const files = walk(root, root, []);
  const hits = [];
  const docMentions = [];
  const docRefs = [];
  const commented = [];
  const prose = [];
  const dates = [];
  const foreign = [];
  const impossible = [];
  const implicit = [];
  const generatedFiles = [];
  const legacy = {};

  for (const f of files) {
    let content;
    try {
      content = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    if (content.includes(String.fromCharCode(0))) continue; // skip binary
    const rel = relative(root, f) || basename(f);
    const ext = extname(f).toLowerCase();
    const highSignal = HIGH_SIGNAL_FILE.test(basename(f));
    // A high-signal config file is hand-authored by definition, so it can never
    // be a build artifact — and it must never be tested as one. `shopify.app.toml`
    // routinely carries a `scopes = "..."` line past 600 characters, which trips
    // the minified-code heuristic and discards the file that declares the app's
    // webhook api_version. Losing that is silent and total: the surface then gets
    // its version from whatever else happened to mention one.
    const generated = !highSignal && isGeneratedFile(rel, content);

    // Deprecated-feature traces are independent of version pins: run this
    // before every gate below, because the files that carry them (a Liquid
    // layout, a Ruby script) often contain no version literal at all — and
    // ungated by the build-artifact heuristic, because a false positive there
    // removed a file from this scan leaving NO trace in the output at all. The
    // rules below are each specific enough to stand on their own.
    scanLegacy(rel, content, ext, legacy);

    // Prose files mention versions constantly (release notes, READMEs) and
    // pin none of them. Counted separately so a post-upgrade docs sweep is
    // still possible, but kept out of the pin list unless --all.
    const isDoc = DOC_EXT.has(ext);
    if (isDoc && !all) {
      if (SHOPIFY_HINT.test(content) && VERSION_RE.test(content)) docMentions.push(rel);
      VERSION_RE.lastIndex = 0;
      continue;
    }
    if (!highSignal && !SHOPIFY_HINT.test(content) && !all) continue;

    // Build artifacts restate real versions but are never the thing you edit.
    if (!all && generated) {
      if (VERSION_RE.test(content)) generatedFiles.push(rel);
      VERSION_RE.lastIndex = 0;
      continue;
    }

    const lines = content.split(/\r?\n/);
    let importDepth = 0; // >0 while inside a multi-line import / destructure
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      VERSION_RE.lastIndex = 0;
      let m;
      while ((m = VERSION_RE.exec(line)) !== null) {
        const version = `${m[1]}-${m[2]}`;
        const near = line + " " + (lines[i - 1] ?? "") + " " + (lines[i + 1] ?? "");
        const contextual = highSignal || SHOPIFY_HINT.test(near);
        if (!contextual && !all) continue;

        const snippet = line.trim().slice(0, CTX);
        // Older than Shopify's first dated version: shaped like one, cannot be one.
        if (!all && version < FIRST_SHOPIFY_VERSION) {
          impossible.push({ file: rel, line: i + 1, version, snippet });
          continue;
        }
        // A link into shopify.dev's versioned docs cites a version, it doesn't
        // pin one. Left in the pin list it reads as work that doesn't exist.
        if (DOC_URL_RE.test(line)) {
          docRefs.push({ file: rel, line: i + 1, version, snippet });
          continue;
        }
        // `2022-07-10` is a calendar date whose first seven characters look
        // exactly like a version. Checked before the comment and prose tests so
        // the date is filed as a date wherever it appears.
        if (!all && isCalendarDate(line, m.index)) {
          dates.push({ file: rel, line: i + 1, version, snippet });
          continue;
        }
        // Another vendor's API version, named as such on the line. Recharge,
        // Stripe and Klaviyo all use YYYY-MM, and their constants sit in the
        // same files as Shopify's. Reported, because "we ignored this" has to
        // be visible, but never counted as a Shopify pin.
        const idOwner = (() => {
          const id = line.match(VERSION_IDENT_RE)?.[1];
          return id ? identOwner(id) : null;
        })();
        // …and only when the line itself offers no Shopify evidence. An
        // abbreviated name plus a surface comment — `SF_VERSION = "2025-04"
        // // storefront` — is ours, whatever the prefix vocabulary thinks.
        const saysShopify = /shopify|myshopify|storefront|admin\/api|graphql\.json/i.test(line);
        if (!all && idOwner === "foreign" && !saysShopify) {
          foreign.push({ file: rel, line: i + 1, version, snippet });
          continue;
        }
        // Commented-out config is inert. Still worth surfacing — a commented
        // api_version is often the previous value someone meant to restore.
        // `#` is GraphQL's only comment syntax, so a generated Function target
        // schema states its contract as `# api_version: 2025-01`. That is the
        // version the input query is validated against — filing it under
        // "commented out, probably the previous value" inverts its meaning.
        const isSchemaHeader = /\.(?:graphql|gql)$/.test(rel) && VERSION_KEY_RE.test(line);
        if (COMMENT_RE.test(line) && !isDoc && !isSchemaHeader) {
          commented.push({ file: rel, line: i + 1, version, snippet });
          continue;
        }
        // Prose inside code (schema descriptions, doc comments) mentions
        // versions without pinning them.
        if (!all && !isDelimitedPin(line, m.index, version)) {
          prose.push({ file: rel, line: i + 1, version, snippet });
          continue;
        }

        hits.push({
          file: rel,
          line: i + 1,
          version,
          surface: isDoc ? "Docs (not a pin)" : surfaceOf(rel, line, near, content),
          confidence: highSignal ? "high" : contextual ? "medium" : "low",
          snippet,
          form: "date",
        });
      }

      if (isDoc) continue;
      const near2 = line + " " + (lines[i - 1] ?? "") + " " + (lines[i + 1] ?? "");
      const snippet2 = line.trim().slice(0, CTX);

      // Symbolic: ApiVersion.October25 -> 2025-10
      SYMBOLIC_RE.lastIndex = 0;
      let s;
      while ((s = SYMBOLIC_RE.exec(line)) !== null) {
        const mm = MONTHS[s[1].toLowerCase()];
        if (!mm) continue;
        hits.push({
          file: rel,
          line: i + 1,
          version: `20${s[2]}-${mm}`,
          surface: surfaceOf(rel, line, near2, content),
          confidence: "high", // an explicit SDK enum is unambiguous
          snippet: snippet2,
          form: "symbolic",
        });
      }

      // Implicit: LATEST_API_VERSION and friends resolve at install time.
      // An import only brings the symbol into scope — the *usage* is the pin.
      // Import lists routinely span several lines, so track the block: a bare
      // `LATEST_API_VERSION,` inside `import { … } from …` is not a client.
      const opensBlock =
        /^\s*(?:import\b|export\b[^;]*\bfrom\b|(?:const|let|var)\s+\{)/.test(line) &&
        line.includes("{") && !line.includes("}");
      const isImportLine =
        importDepth > 0 ||
        /^\s*(?:import\b|from\s+["']|(?:const|let|var)\s+\{[^}]*\}\s*=\s*require\()/.test(line);
      if (opensBlock) importDepth = 1;
      else if (importDepth > 0 && line.includes("}")) importDepth = 0;

      IMPLICIT_RE.lastIndex = 0;
      let im;
      while (!isImportLine && (im = IMPLICIT_RE.exec(line)) !== null) {
        implicit.push({
          file: rel,
          line: i + 1,
          constant: im[0],
          surface: surfaceOf(rel, line, near2, content),
          snippet: snippet2,
        });
      }
    }
  }

  const { sdks, langs } = detectSdks(root, files);
  const uiExt = scanUiExtensionPins(root, files);
  const scopes = scanScopes(root, files);
  for (const u of uiExt) {
    hits.push({
      file: u.file, line: 1, version: u.version, surface: "Extensions",
      confidence: "high", form: "package",
      snippet: `@shopify/ui-extensions resolves to ${u.version}` +
               (u.declared ? `  (TOML declares ${u.declared})` : ""),
    });
  }
  const legacyRows = Object.values(legacy).sort(
    (a, b) => TIER_RANK[a.rule.tier] - TIER_RANK[b.rule.tier] || a.rule.id.localeCompare(b.rule.id),
  );

  if (json) {
    console.log(JSON.stringify({
      root, sdks, manifests: langs, pins: hits, implicitVersions: implicit,
      uiExtensionVersions: uiExt, declaredScopes: scopes,
      deprecatedFeatures: legacyRows.map((r) => ({
        id: r.rule.id, tier: r.rule.tier, feature: r.rule.label,
        replacement: r.rule.replacement, confirmChangelog: r.rule.clTerm, confirmDocs: r.rule.docsQuery,
        occurrences: r.count, examples: r.files, moreFiles: r.more ?? 0,
      })),
      excluded: {
        docUrlRefs: docRefs,
        calendarDates: dates,
        commentedOut: commented,
        proseInCode: prose,
        foreignVendorVersions: foreign,
        beforeShopifyVersioning: impossible,
        generatedFiles: [...new Set(generatedFiles)],
        proseMentions: [...new Set(docMentions)],
      },
    }, null, 2));
    process.exit(hits.length || legacyRows.length ? 0 : 2);
  }

  const out = [];
  out.push(`Shopify version sweep — ${root}`);
  out.push(`Files scanned: ${files.length}   Version pins found: ${hits.length}`);
  out.push("");

  out.push("## SDKs / clients detected");
  if (sdks.length) {
    for (const s of sdks) out.push(`  ${s.lang.padEnd(7)} ${s.sdk} @ ${s.version}   (${s.file})`);
  } else {
    out.push("  none recognized — raw HTTP client, an unlisted SDK, or a pure theme.");
    out.push("  Confirm by hand; the version pins below are still authoritative.");
  }
  if (langs.length) {
    out.push(`  Manifests: ${langs.map((l) => `${l.file} (${l.lang})`).join(", ")}`);
    if (!sdks.length) {
      out.push("  A manifest with no Shopify SDK usually means direct HTTP calls —");
      out.push("  grep the client (curl/guzzle/requests/fetch) for the version string.");
    }
  }
  out.push("");

  const versions = [...new Set(hits.map((h) => h.version))].sort();
  out.push("## Distinct versions pinned");
  out.push(versions.length ? `  ${versions.join(", ")}` : "  none");

  // Age check. Shopify supports each stable version for a *minimum* of 12
  // months, so anything older than four quarters is at or past the floor of
  // that guarantee. This is the finding users most often don't know they have:
  // not "an upgrade is available" but "you are already outside the window".
  // Four quarters IS twelve months, so a version four quarters old has exhausted
  // the guarantee — not "approaching" it. Off by one here inverts the urgency the
  // approval gate is built on, for exactly the versions closest to the edge.
  const stale = versions.filter((v) => quartersOld(v) >= 4);
  const aging = versions.filter((v) => quartersOld(v) === 3);
  if (stale.length) {
    out.push("");
    out.push(`  ⚠ AT OR PAST THE 12-MONTH SUPPORT MINIMUM: ${stale.join(", ")}`);
    for (const v of stale) out.push(`      ${v} is ~${quartersOld(v)} quarters old`);
    out.push("    Shopify guarantees each stable version for at least 12 months.");
    out.push("    These are at or beyond that floor — they may already be unsupported.");
    out.push("    A request naming an unsupported version is not simply rejected, so this");
    out.push("    code may not be receiving the payload shape it asks for TODAY — making");
    out.push("    the breakage current rather than pending. Settle which it is before");
    out.push("    planning: the `publicApiVersions` query reports each version\'s");
    out.push("    `supported` boolean, and a live response\'s X-Shopify-API-Version header");
    out.push("    names the version actually served. Urgent either way, not routine.");
  }
  if (aging.length) {
    out.push(`  ⚠ Reaches the 12-month floor next quarter: ${aging.join(", ")}`);
  }
  const drift = uiExt.filter((u) => u.declared && u.declared !== u.version);
  if (drift.length) {
    out.push("");
    out.push("  ⚠ EXTENSION LIBRARY AND DECLARED VERSION DISAGREE:");
    for (const u of drift) {
      out.push(`      ${u.file}`);
      out.push(`        @shopify/ui-extensions ${u.version}  vs  api_version ${u.declared}`);
    }
    out.push("    The component library and the TOML are meant to move together.");
    out.push("    Bump both, or the extension builds against components the");
    out.push("    declared version does not serve.");
  }
  if (versions.length > 1) {
    out.push("  ⚠ MORE THAN ONE VERSION IS PINNED. This is a finding, not an error to");
    out.push("    normalize away — record each surface's real version in the inventory.");
  }
  out.push("");

  if (implicit.length) {
    out.push("## Unpinned — resolved from the installed SDK, not from your code");
    for (const c of implicit) {
      out.push(`  ${c.file}:${c.line}  ${c.constant}  [${c.surface}]`);
      out.push(`      ${c.snippet}`);
    }
    out.push("  These move when the SDK is upgraded and stay put when it isn't.");
    out.push("  Resolve each against the INSTALLED package version, then treat");
    out.push("  the result as this surface's real pinned version.");
    out.push("");
  }
  out.push("## Pins by surface");
  const bySurface = {};
  for (const h of hits) (bySurface[h.surface] ??= []).push(h);
  for (const [surface, rows] of Object.entries(bySurface).sort()) {
    const vs = [...new Set(rows.map((r) => r.version))].sort().join(", ");
    out.push(`\n### ${surface}  —  ${vs}`);
    for (const r of rows.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
      out.push(`  ${r.file}:${r.line}  [${r.version}] (${r.confidence})`);
      out.push(`      ${r.snippet}`);
    }
  }
  if (!hits.length) out.push("  none");
  out.push("");

  // Deprecated features. Deliberately printed after the pins and before the
  // exclusions: for a theme this is usually the entire upgrade, and a report
  // that ends at "no version pins found" tells that repo it has nothing to do.
  if (scopes.length) {
    out.push("## Access scopes declared");
    for (const s2 of scopes) {
      out.push(`  ${s2.file}`);
      out.push(`    required: ${s2.scopes.join(", ") || "(none)"}`);
      if (s2.optionalScopes.length) out.push(`    optional: ${s2.optionalScopes.join(", ")}`);
    }
    out.push("  Diff this against the scopes the target version REQUIRES — the GraphQL");
    out.push("  validator reports them per operation. A scope required but not declared");
    out.push("  is a SCOPE row: every installed merchant has to re-authorize, and no");
    out.push("  code change can do that for them.");
    out.push("");
  }
  if (legacyRows.length) {
    out.push("## Deprecated platform features in use");
    out.push("  Not version pins — these carry their own Shopify deadlines.");
    for (const r of legacyRows) {
      out.push(`\n### [${r.rule.tier}] ${r.rule.label}  —  ${r.count} occurrence${r.count === 1 ? "" : "s"}`);
      out.push(`  Replaced by: ${r.rule.replacement}`);
      for (const file of r.files) out.push(`  ${file}`);
      if (r.more) out.push(`  … and ${r.more} more file${r.more === 1 ? "" : "s"}`);
      out.push(`  Confirm:  changelog --grep "${r.rule.clTerm}"   |   docs: "${r.rule.docsQuery}"`);
    }
    out.push("");
    out.push("  SUNSET = an end has been announced, so this is deadline work.");
    out.push("  HAZARD = works today, can change without notice.");
    out.push("  LEGACY = superseded; migrate when you touch the file.");
    out.push("  No dates are asserted here — resolve each before planning. Note that");
    out.push("  the changelog index only reaches back about two years, so anything");
    out.push("  announced earlier is docs-only: a 0-hit grep is NOT an all-clear.");
    out.push("");
  }

  // Everything below is deliberately NOT a pin. Listed, never silently dropped:
  // a filter you can't see is indistinguishable from a bug.
  const docs = [...new Set(docMentions)];
  const gen = [...new Set(generatedFiles)];
  if (docs.length || gen.length || docRefs.length || commented.length || prose.length ||
      dates.length || foreign.length || impossible.length) {
    out.push("## Excluded — found, and deliberately not counted as pins");
  }
  if (commented.length) {
    out.push(`\n### Commented out (${commented.length}) — inert, but often the previous value`);
    for (const c of commented.slice(0, 10)) out.push(`  ${c.file}:${c.line}  [${c.version}]  ${c.snippet}`);
    if (commented.length > 10) out.push(`  … and ${commented.length - 10} more`);
  }
  if (dates.length) {
    out.push(`\n### Calendar dates (${dates.length}) — YYYY-MM-DD, not a YYYY-MM version`);
    for (const c of dates.slice(0, 5)) out.push(`  ${c.file}:${c.line}  [${c.version}…]  ${c.snippet.slice(0, 70)}`);
    if (dates.length > 5) out.push(`  … and ${dates.length - 5} more`);
  }
  if (impossible.length) {
    out.push(`\n### Before Shopify versioning began (${impossible.length}) — earlier than ${FIRST_SHOPIFY_VERSION}`);
    for (const c of impossible.slice(0, 5)) out.push(`  ${c.file}:${c.line}  [${c.version}]  ${c.snippet.slice(0, 70)}`);
    if (impossible.length > 5) out.push(`  … and ${impossible.length - 5} more`);
  }
  if (foreign.length) {
    out.push(`\n### Another vendor's API version (${foreign.length}) — same YYYY-MM shape, not Shopify`);
    for (const c of foreign.slice(0, 5)) out.push(`  ${c.file}:${c.line}  [${c.version}]  ${c.snippet.slice(0, 70)}`);
    if (foreign.length > 5) out.push(`  … and ${foreign.length - 5} more`);
  }
  if (prose.length) {
    out.push(`\n### Prose inside code (${prose.length}) — a sentence, not a pin`);
    for (const c of prose.slice(0, 5)) out.push(`  ${c.file}:${c.line}  [${c.version}]  ${c.snippet.slice(0, 70)}`);
    if (prose.length > 5) out.push(`  … and ${prose.length - 5} more`);
  }
  if (docRefs.length) {
    out.push(`\n### shopify.dev doc links (${docRefs.length}) — cite a version, don't pin one`);
    for (const c of docRefs.slice(0, 5)) out.push(`  ${c.file}:${c.line}  [${c.version}]`);
    if (docRefs.length > 5) out.push(`  … and ${docRefs.length - 5} more`);
  }
  if (gen.length) {
    out.push(`\n### Build artifacts (${gen.length}) — edit the source and rebuild instead`);
    for (const g of gen.slice(0, 5)) out.push(`  ${g}`);
    if (gen.length > 5) out.push(`  … and ${gen.length - 5} more`);
  }
  if (docs.length) {
    out.push(`\n### Prose mentions (${docs.length}) — nothing to migrate`);
    out.push(`  ${docs.slice(0, 6).join(", ")}${docs.length > 6 ? ", …" : ""}`);
    out.push("  Worth refreshing after the upgrade so docs don't contradict the code.");
  }

  if (!hits.length) {
    out.push("");
    out.push("No version pins found. Possible reasons — check each:");
    out.push("  • The SDK defaults to its own LATEST_API_VERSION constant (unpinned:");
    out.push("    the version moves when the SDK is upgraded). Grep the SDK version.");
    out.push("  • It's a Liquid theme — themes carry no API version at all. That is");
    out.push("    not the same as having no upgrade work: see deprecated features above.");
    out.push("  • The version is injected at runtime from an env var or secret store.");
    out.push("  • Re-run with --all to include matches without nearby Shopify context.");
  }

  console.log(out.join("\n"));
  process.exit(hits.length || legacyRows.length ? 0 : 2);
}

main();
