#!/usr/bin/env node
// Verifies that a pulled Vercel environment points at the Bezy Firebase project and is
// complete enough for Telegram Stars. Prints pass/fail per variable and never a value.
//
//   vercel env pull .env.production.local --environment=production
//   node scripts/verify-env.mjs .env.production.local
import fs from 'node:fs';

const EXPECTED_PROJECT = 'bezydating';
const file = process.argv[2] || '.env.production.local';

if (!fs.existsSync(file)) {
  console.error(`Cannot read ${file}. Pull it first:\n  vercel env pull ${file} --environment=production`);
  process.exit(1);
}

const env = {};
for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
  const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (!match) continue;
  let value = match[2].trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  env[match[1]] = value;
}

let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -> ${detail}` : ''}`);
};

console.log(`\n=== ${file} ===\n`);
console.log('Required by the code:');
check('FIREBASE_PROJECT_ID is set', Boolean(env.FIREBASE_PROJECT_ID));
check(`FIREBASE_PROJECT_ID is "${EXPECTED_PROJECT}"`, env.FIREBASE_PROJECT_ID === EXPECTED_PROJECT,
  env.FIREBASE_PROJECT_ID ? `found "${env.FIREBASE_PROJECT_ID}"` : 'missing');

// A Firebase service-account address is always <name>@<project-id>.iam.gserviceaccount.com,
// so the domain proves the credential belongs to the same project as FIREBASE_PROJECT_ID.
const emailDomain = (env.FIREBASE_CLIENT_EMAIL || '').split('@')[1] || '';
check('FIREBASE_CLIENT_EMAIL is set', Boolean(env.FIREBASE_CLIENT_EMAIL));
check('FIREBASE_CLIENT_EMAIL belongs to the same project',
  emailDomain === `${EXPECTED_PROJECT}.iam.gserviceaccount.com`,
  emailDomain ? `domain is "${emailDomain}"` : 'missing');

const key = env.FIREBASE_PRIVATE_KEY || '';
check('FIREBASE_PRIVATE_KEY is set', Boolean(key));
check('FIREBASE_PRIVATE_KEY is a PEM private key', key.includes('BEGIN PRIVATE KEY'), key ? 'header not found' : 'missing');
check('FIREBASE_PRIVATE_KEY newlines are usable',
  key.includes('\n') || key.includes('\\n'),
  'needs real newlines or \\n escapes (the code un-escapes \\n)');

check('TELEGRAM_BOT_TOKEN is set', Boolean(env.TELEGRAM_BOT_TOKEN));
check('TELEGRAM_BOT_TOKEN has the <id>:<secret> shape', /^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(env.TELEGRAM_BOT_TOKEN || ''));
check('BEZY_MINI_APP_URL is an https origin without a path',
  /^https:\/\/[^/]+$/.test(env.BEZY_MINI_APP_URL || ''),
  env.BEZY_MINI_APP_URL ? `found "${env.BEZY_MINI_APP_URL}"` : 'missing — defaults to the production URL');

console.log('\nOptional:');
console.log(`  ${env.TELEGRAM_WEBHOOK_SECRET ? 'SET  ' : 'unset'} TELEGRAM_WEBHOOK_SECRET` +
  (env.TELEGRAM_WEBHOOK_SECRET ? '  -> the same value must be passed to setWebhook, or Telegram gets 401' : '  -> webhook accepts unauthenticated posts'));
for (const [name, note] of [
  ['BEZY_PREMIUM_STARS_MONTHLY', 'default 250'],
  ['BEZY_PREMIUM_STARS_QUARTERLY', 'default 600'],
  ['BEZY_PREMIUM_STARS_YEARLY', 'default 1900']
]) {
  console.log(`  ${env[name] ? `SET   ${name}  -> overrides the ${note}` : `unset ${name}  -> using ${note}`}`);
}

// Variables that are commonly copied from the service-account JSON but that Bezy never reads.
const unused = ['FIREBASE_CLIENT_ID', 'FIREBASE_PRIVATE_KEY_ID', 'FIREBASE_AUTH_URI', 'FIREBASE_TOKEN_URI', 'FIREBASE_API_KEY', 'FIREBASE_APP_ID']
  .filter((name) => env[name]);
if (unused.length) {
  console.log(`\nSet but never read by api/ (harmless, safe to delete): ${unused.join(', ')}`);
}

console.log(`\n=== ${failures ? `${failures} check(s) FAILED` : 'all required checks passed'} ===\n`);
process.exit(failures ? 1 : 0);
