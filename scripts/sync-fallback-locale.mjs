#!/usr/bin/env node
/**
 * Regenerates the built-in English fallback catalogue in app.js from locales/en.json.
 *
 * The fallback exists so a locale outage still renders a fully translated app instead of
 * raw `app.*` keys. Keeping it in sync by hand failed exactly once — the degraded-state
 * e2e spec caught it — so it is generated and pinned: tests/localization.test.mjs fails
 * when the fallback drifts, and this script fixes it.
 *
 *   node scripts/sync-fallback-locale.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.slice(1)), '..');
const appPath = path.join(root, 'app.js');
const en = JSON.parse(fs.readFileSync(path.join(root, 'locales/en.json'), 'utf8')).app;

const BEGIN = '// BEGIN fallback catalogue — generated from locales/en.json by scripts/sync-fallback-locale.mjs';
const END = '// END fallback catalogue';

const source = fs.readFileSync(appPath, 'utf8');
const start = source.indexOf(BEGIN);
const end = source.indexOf(END);
if (start < 0 || end < 0) {
  console.error(`Markers not found in app.js (${start}, ${end}).`);
  process.exit(1);
}

const replacement = `${BEGIN}\n      app: ${JSON.stringify(en)},\n      ${END}`;
const updated = source.slice(0, start) + replacement + source.slice(end + END.length);
fs.writeFileSync(appPath, updated);
console.log(`Fallback catalogue synced: ${Object.keys(en).length} keys.`);
