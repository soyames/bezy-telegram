import { spawn } from 'node:child_process';
import { testSql, closeTestDb, testDatabaseUrl } from './database.mjs';

testDatabaseUrl();
await testSql('SELECT 1');
process.env.BEZY_TEST_SERIALIZED = '1';
const kind = process.argv[2] || 'all';
const suites = kind === 'e2e' ? [] : kind === 'all'
  ? ['contract', 'profileText', 'localization', 'discovery', 'backend', 'security', 'db'] : [kind];
let failed = false;
async function run(args) {
  const code = await new Promise(resolve => {
    const child = spawn(process.execPath, args, { stdio: 'inherit', env: process.env, windowsHide: true });
    child.on('exit', resolve);
    child.on('error', () => resolve(1));
  });
  failed ||= code !== 0;
}
try {
  for (const suite of suites) await run([`tests/${suite}.test.mjs`]);
  if (kind === 'all' || kind === 'e2e') await run(['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(3)]);
} finally { await closeTestDb(); }
process.exitCode = failed ? 1 : 0;
