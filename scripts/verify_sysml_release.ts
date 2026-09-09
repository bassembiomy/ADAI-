import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyConformanceManifest } from '../src/engine/sysml/conformanceManifest';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(__dirname, '..');
const EXPECTED_GCC_SHA256 = 'aebe586bbc45e6b46c8388a55fe5eb00a2314d6f474ca8aedec4176246568935';

function log(section: string, msg: string) {
  console.log(`\x1b[36m[SYSML-RELEASE]\x1b[0m \x1b[1m${section}\x1b[0m: ${msg}`);
}

function fail(msg: string): never {
  console.error(`\x1b[31m[SYSML-RELEASE-FAIL]\x1b[0m ${msg}`);
  process.exit(1);
}

function runCommand(cmd: string, args: string[]) {
  log('RUN', `${cmd} ${args.join(' ')}`);
  const isWindows = process.platform === 'win32';
  const executable = isWindows && (cmd === 'npm' || cmd === 'npx') ? `${cmd}.cmd` : cmd;
  const res = spawnSync(executable, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: isWindows,
  });
  if (res.status !== 0) {
    fail(`Command failed with exit code ${res.status}: ${cmd} ${args.join(' ')}`);
  }
}

async function verifyRelease() {
  console.log('\n================================================================');
  console.log('       ADIA SysML Full Conformance Release Qualification Gate    ');
  console.log('================================================================\n');

  // 1. Pinned compiler verification
  log('TOOLCHAIN', 'Verifying pinned w64devkit GCC compiler...');
  const gccPath = resolve(repoRoot, 'toolchains/w64devkit/w64devkit/bin/gcc.exe');
  if (!existsSync(gccPath)) {
    fail(`Pinned GCC compiler not found at: ${gccPath}`);
  }
  const gccBuf = readFileSync(gccPath);
  const gccSha256 = createHash('sha256').update(gccBuf).digest('hex').toLowerCase();
  log('TOOLCHAIN', `gcc.exe SHA-256: ${gccSha256}`);
  if (gccSha256 !== EXPECTED_GCC_SHA256) {
    fail(`Pinned GCC hash mismatch! Expected ${EXPECTED_GCC_SHA256}, got ${gccSha256}`);
  }
  const gccVer = execFileSync(gccPath, ['--version'], { encoding: 'utf-8' }).split('\n')[0];
  log('TOOLCHAIN', `gcc.exe version: ${gccVer}`);

  // 2. Conformance Manifest verification
  log('MANIFEST', 'Verifying SysML Conformance Manifest and evidence files...');
  const manifestReport = verifyConformanceManifest(repoRoot);
  if (!manifestReport.valid) {
    fail(`Conformance manifest validation failed: ${manifestReport.missingFiles.join(', ')}`);
  }
  log(
    'MANIFEST',
    `Manifest verified: ${manifestReport.totalRows} rows (${manifestReport.supportedRows} supported, ${manifestReport.unsupportedRows} unsupported), zero missing evidence files.`
  );

  // 3. SysML Unit & Integration Gate
  log('TEST:SYSML', 'Executing unit and integration suites...');
  runCommand('npm', ['run', 'test:sysml']);

  // 4. SysML Release Gate (SysML + Reporting + TypeScript)
  log('TEST:SYSML:RELEASE', 'Executing release gate (SysML + Reporting + TypeScript)...');
  runCommand('npm', ['run', 'test:sysml:release']);

  // 5. OPM Qualification & Codegen Gate
  log('TEST:OPM', 'Executing OPM qualification and compiled C host gates...');
  runCommand('npm', ['run', 'test:opm:qualification']);
  runCommand('npm', ['run', 'test:opm:codegen']);

  // 6. Playwright End-to-End Real Browser Gate
  log('TEST:E2E', 'Executing Playwright real-browser end-to-end tests...');
  runCommand('npm', ['run', 'test:e2e:sysml']);

  // 7. Production Build Gate
  log('BUILD', 'Executing production bundle and protected electron packaging build...');
  runCommand('npm', ['run', 'build']);

  console.log('\n================================================================');
  console.log('       ALL SYSML FULL CONFORMANCE GATES PASSED CLEANLY!         ');
  console.log('================================================================\n');
}

verifyRelease().catch(err => {
  console.error(err);
  process.exit(1);
});
