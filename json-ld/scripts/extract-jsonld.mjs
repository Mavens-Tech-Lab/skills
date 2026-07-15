#!/usr/bin/env node
/**
 * extract-jsonld.mjs — extract and parse every <script type="application/ld+json">
 * block from an HTML document. No dependencies, no network access: reads a local
 * file argument or stdin (pipe curl into it yourself).
 *
 *   node extract-jsonld.mjs path/to/page.html
 *   curl -s http://localhost:3000/page | node extract-jsonld.mjs
 *
 * Prints each block pretty-printed with a summary of @types found.
 * Exit codes: 0 = all blocks parse, 1 = no JSON-LD found, 2 = parse error(s).
 */
import { readFileSync } from 'node:fs';

const html = process.argv[2]
  ? readFileSync(process.argv[2], 'utf8')
  : readFileSync(0, 'utf8');

const SCRIPT_RE =
  /<script\b[^>]*type\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json'|application\/ld\+json\b)[^>]*>([\s\S]*?)<\/script\s*>/gi;

const blocks = [...html.matchAll(SCRIPT_RE)].map((m) => m[1].trim());

if (blocks.length === 0) {
  console.error('NO JSON-LD: no <script type="application/ld+json"> blocks found.');
  console.error('If this page should have markup, it is either not rendered server-side');
  console.error('or the emitting code did not run for this route.');
  process.exit(1);
}

const typesOf = (node) => {
  if (Array.isArray(node)) return node.flatMap(typesOf);
  if (node && typeof node === 'object') {
    const own = node['@type'] ? [node['@type']].flat() : [];
    const graph = node['@graph'] ? typesOf(node['@graph']) : [];
    return [...own, ...graph];
  }
  return [];
};

let failures = 0;
blocks.forEach((raw, i) => {
  console.log(`\n--- block ${i + 1} of ${blocks.length} ---`);
  try {
    const data = JSON.parse(raw);
    console.log(JSON.stringify(data, null, 2));
    const types = typesOf(data);
    console.log(`\nOK: parsed. @types: ${types.length ? types.join(', ') : '(none found!)'}`);
  } catch (err) {
    failures += 1;
    console.error(`PARSE ERROR: ${err.message}`);
    console.error(`Raw content (first 500 chars):\n${raw.slice(0, 500)}`);
  }
});

console.log(`\n${blocks.length} block(s), ${failures} parse failure(s).`);
process.exit(failures > 0 ? 2 : 0);
