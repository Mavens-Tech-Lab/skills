#!/usr/bin/env node
/**
 * changelog-scan.mjs — extract and filter the Shopify developer changelog.
 *
 * NO NETWORK. Reads HTML from a file or stdin; you do the fetching.
 * Fetch the index yourself first, e.g.:
 *
 *   curl -sSL https://shopify.dev/changelog -o changelog.html
 *   node changelog-scan.mjs changelog.html --since 2024-10-01 --status breaking
 *
 * Why the HTML index and not https://shopify.dev/changelog.md:
 *   - The .md endpoint serves only a short rolling window (~50 recent entries).
 *   - ?page= is applied by CLIENT-SIDE JS only: the server returns the same
 *     entries for ?page=2, ?page=5 and no params at all, so curl pagination
 *     silently does nothing.
 *   - ?api_type= DOES filter server-side, but it also truncates the history
 *     (measured: 95 entries / ~7 months, vs 783 / ~2 years unfiltered). Filter
 *     locally with --surface instead and keep the whole ladder.
 *   - The HTML index server-renders the WHOLE history (~770 entries, ~2 years)
 *     in one response, including a status marker per entry.
 *
 * Drill into any entry with its .md form, which does work:
 *   curl -sSL https://shopify.dev/changelog/<slug>.md
 *
 * Usage:
 *   node changelog-scan.mjs <file.html> [options]
 *   curl -sSL https://shopify.dev/changelog | node changelog-scan.mjs [options]
 *
 * Options:
 *   --since <YYYY-MM-DD>   only entries on/after this date (e.g. the day your
 *                          currently-pinned API version was released)
 *   --until <YYYY-MM-DD>   only entries on/before this date
 *   --status <s>           breaking | action | note | update | all   (default: all)
 *                          repeatable; "breaking" also implies nothing else
 *   --surface <s>          case-insensitive substring, repeatable
 *                          e.g. --surface "admin graphql" --surface functions
 *   --grep <s>             match the title, ignoring case and separators, so
 *                          `cartTransformCreate` finds "Cart transform create...".
 *                          Repeatable; matches any (OR).
 *   --json                 emit JSON instead of a text report
 *   --urls                 emit only the .md URLs, one per line (feed to a fetcher)
 *
 * Exit codes: 0 ok, 1 usage/parse error.
 */

import { readFileSync } from "node:fs";

const ENTITIES = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
  "&#39;": "'", "&apos;": "'", "&nbsp;": " ", "&#x27;": "'", "&#x2F;": "/",
};
const decode = (s) =>
  s.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39|#x27|#x2F);/g, (m) => ENTITIES[m] ?? m)
   .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d));

const stripTags = (s) => decode(s.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();

const STATUS_ALIASES = {
  breaking: "Breaking change",
  action: "Action required",
  note: "Note",
  update: "Update",
};

function parseArgs(argv) {
  const o = { files: [], status: [], surface: [], grep: [], since: null, until: null, json: false, urls: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} requires a value`);
      return v;
    };
    if (a === "--since") o.since = next();
    else if (a === "--until") o.until = next();
    else if (a === "--status") o.status.push(next().toLowerCase());
    else if (a === "--surface") o.surface.push(next().toLowerCase());
    else if (a === "--grep") o.grep.push(next().toLowerCase());
    else if (a === "--json") o.json = true;
    else if (a === "--urls") o.urls = true;
    else if (a === "-h" || a === "--help") o.help = true;
    else if (a.startsWith("-")) throw new Error(`unknown option: ${a}`);
    else o.files.push(a);
  }
  return o;
}

function readInput(files) {
  if (files.length) return readFileSync(files[0], "utf8");
  try {
    return readFileSync(0, "utf8");
  } catch {
    throw new Error("no input: pass an HTML file path or pipe HTML on stdin");
  }
}

/** Parse the server-rendered changelog index into structured entries. */
export function parseChangelog(html) {
  const blocks = html.split(/<li class="_RowItem/).slice(1);
  const seen = new Set();
  const entries = [];

  for (const b of blocks) {
    const slug = b.match(/href="\/changelog\/([A-Za-z0-9._-]+)"/)?.[1];
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);

    const date = b.match(/dateTime="(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;

    // Title lives inside the RowTitleContent wrapper and may contain inline
    // markup (<code>, <em>), so strip tags rather than matching text directly.
    let title = null;
    const tIdx = b.indexOf("_RowTitleContent");
    if (tIdx !== -1) {
      const after = b.slice(tIdx);
      const inner = after.match(/_RowTitle_[^"]*"[^>]*>([\s\S]*?)<\/div>/);
      if (inner) title = stripTags(inner[1]);
    }
    if (!title) {
      // Fallback: derive a readable title from the slug.
      title = slug.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
    }

    const status = b.match(/aria-label="([^"]+)"/)?.[1] ?? "Update";
    const surfaces = [...b.matchAll(/_RowSurface_[^"]*">([\s\S]*?)<\/span>/g)]
      .map((m) => stripTags(m[1]))
      .filter(Boolean);

    // Version tags (2026-10) are not reliably chipped; harvest any that appear
    // in the title as a hint. The entry's own page is the authority.
    const versions = [...new Set((title.match(/\b20\d{2}-(?:01|04|07|10)\b/g) ?? []))];

    entries.push({
      slug,
      date,
      title,
      status,
      surfaces,
      versions,
      url: `https://shopify.dev/changelog/${slug}`,
      md: `https://shopify.dev/changelog/${slug}.md`,
    });
  }
  return entries;
}

function applyFilters(entries, o) {
  let out = entries;
  if (o.since) out = out.filter((e) => e.date && e.date >= o.since);
  if (o.until) out = out.filter((e) => e.date && e.date <= o.until);
  if (o.status.length && !o.status.includes("all")) {
    const want = o.status.map((s) => (STATUS_ALIASES[s] ?? s).toLowerCase());
    out = out.filter((e) => want.includes(e.status.toLowerCase()));
  }
  if (o.surface.length) {
    out = out.filter((e) =>
      e.surfaces.some((s) => o.surface.some((f) => s.toLowerCase().includes(f))),
    );
  }
  if (o.grep.length) out = out.filter((e) => o.grep.some((g) => titleMatches(e.title, g)));
  return out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

/**
 * Match a search term against an entry title, tolerating the gap between how
 * developers name things and how Shopify writes headlines.
 *
 * You grep for the identifier in your code — `cartTransformCreate`. The title
 * says "Cart transform create...". A literal substring test misses every one of
 * those, which silently reports "no changelog entry affects this call site".
 * So compare with separators and case stripped from both sides as well.
 */
function titleMatches(title, term) {
  const t = title.toLowerCase();
  if (t.includes(term)) return true;
  const squash = (s) => s.replace(/[^a-z0-9]/g, "");
  return squash(t).includes(squash(term));
}

const RANK = { "breaking change": 0, "action required": 1, note: 2, update: 3 };

function report(all, hits, o) {
  const lines = [];
  const range = all.map((e) => e.date).filter(Boolean).sort();
  lines.push(`Shopify changelog — parsed ${all.length} entries`);
  if (range.length) lines.push(`Coverage: ${range[0]} → ${range[range.length - 1]}`);
  const filters = [
    o.since && `since ${o.since}`,
    o.until && `until ${o.until}`,
    o.status.length && `status ${o.status.join("|")}`,
    o.surface.length && `surface ${o.surface.join("|")}`,
    o.grep.length && `grep "${o.grep.join('", "')}"`,
  ].filter(Boolean);
  lines.push(`Filters: ${filters.length ? filters.join(", ") : "none"}`);
  lines.push(`Matched: ${hits.length}`);

  const byStatus = {};
  for (const e of hits) byStatus[e.status] = (byStatus[e.status] || 0) + 1;
  const tally = Object.entries(byStatus).sort(
    (a, b) => (RANK[a[0].toLowerCase()] ?? 9) - (RANK[b[0].toLowerCase()] ?? 9),
  );
  if (tally.length) lines.push(tally.map(([k, v]) => `  ${k}: ${v}`).join("\n"));
  lines.push("");

  const sorted = [...hits].sort((a, b) => {
    const r = (RANK[a.status.toLowerCase()] ?? 9) - (RANK[b.status.toLowerCase()] ?? 9);
    return r !== 0 ? r : String(b.date).localeCompare(String(a.date));
  });
  for (const e of sorted) {
    lines.push(`[${e.status}] ${e.date}  ${e.surfaces.join(", ") || "—"}`);
    lines.push(`  ${e.title}`);
    if (e.versions.length) lines.push(`  versions mentioned: ${e.versions.join(", ")}`);
    lines.push(`  ${e.md}`);
    lines.push("");
  }
  if (!hits.length) {
    lines.push("No entries matched. Widen --since or drop --surface;");
    lines.push("surface names are Shopify's own labels (e.g. 'Admin GraphQL API',");
    lines.push("'Storefront API', 'Customer Account API', 'Functions', 'Themes',");
    lines.push("'App Bridge', 'Admin Extensions', 'Events & webhooks').");
  }
  return lines.join("\n");
}

const HELP = `changelog-scan.mjs — filter the Shopify developer changelog (no network)

  curl -sSL https://shopify.dev/changelog -o changelog.html
  node changelog-scan.mjs changelog.html --since 2024-10-01 --status breaking

Options: --since --until --status(breaking|action|note|update|all) --surface
         --grep --json --urls`;

function main() {
  let o;
  try {
    o = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`error: ${e.message}\n\n${HELP}`);
    process.exit(1);
  }
  if (o.help) return console.log(HELP);

  let html;
  try {
    html = readInput(o.files);
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exit(1);
  }

  const all = parseChangelog(html);
  if (!all.length) {
    console.error(
      "error: no changelog entries found.\n" +
      "Did you fetch https://shopify.dev/changelog (the HTML index)?\n" +
      "The .md endpoint and ?page= params will NOT work here — see the header comment.",
    );
    process.exit(1);
  }

  const hits = applyFilters(all, o);
  if (o.urls) return console.log(hits.map((e) => e.md).join("\n"));
  if (o.json) {
    const range = all.map((e) => e.date).filter(Boolean).sort();
    return console.log(JSON.stringify(
      { parsed: all.length, coverage: { from: range[0], to: range[range.length - 1] }, matched: hits.length, entries: hits },
      null, 2,
    ));
  }
  console.log(report(all, hits, o));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
