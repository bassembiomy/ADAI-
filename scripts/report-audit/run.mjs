/* One command: build all report cases, then audit them. Usage: node scripts/report-audit/run.mjs [case ...] */
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const cases = process.argv.slice(2);
const run = (cmd, args) => { const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' }); if (r.status !== 0) process.exit(r.status ?? 1); };
run('npx', ['tsx', 'scripts/report-audit/build.ts', ...cases]);
run('node', ['scripts/report-audit/audit.mjs', ...cases]);
