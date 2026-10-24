// Runs the API tests against a throw-away local Worker + D1 (port 8788, temp
// state dir), so tests never touch your `npm run dev` data. Usage: npm run test:api
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const state = mkdtempSync(join(tmpdir(), 'repdle-test-'));
const PORT = 8788;
const wrangler = join(root, 'node_modules/.bin/wrangler');
execFileSync(wrangler, ['d1', 'migrations', 'apply', 'repdle', '--local', '--persist-to', state], { cwd: root, stdio: 'ignore', env: { ...process.env, CI: '1' } });
const dev = spawn(wrangler, ['dev', '--port', String(PORT), '--ip', '127.0.0.1', '--persist-to', state, '--var', 'DEV:1'], { cwd: root, stdio: 'ignore', env: { ...process.env, CI: '1' } });
const stop = () => { dev.kill(); rmSync(state, { recursive: true, force: true }); };
process.on('SIGINT', () => { stop(); process.exit(130); });

const url = `http://127.0.0.1:${PORT}`;
for (let i = 0; ; i++) {
  try { if ((await fetch(`${url}/api/health`)).ok) break; } catch {}
  if (i > 60) { stop(); throw new Error('wrangler dev did not start'); }
  await new Promise((r) => setTimeout(r, 500));
}
const files = process.argv.slice(2).length ? process.argv.slice(2) : ['test/api/api.test.mjs'];
const test = spawn(process.execPath, ['--test', '--test-concurrency=1', ...files], { cwd: root, stdio: 'inherit', env: { ...process.env, REPDLE_URL: url } });
test.on('exit', (code) => { stop(); process.exit(code ?? 1); });
