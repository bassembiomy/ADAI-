// src/security/opmCodeVerifier.test.cjs
// Security tests for opmCodeVerifier.cjs — run with: node src/security/opmCodeVerifier.test.cjs
// OPM scope only: allowlisted OPM artifact names, bounded UTF-8, traversal,
// oversized payloads, non-string content, renderer execution-control smuggling,
// and concurrency/rate-limit guard.
'use strict';

const assert = require('assert');
const {
  ALLOWED_FILES,
  TOOLCHAIN_VERSION,
  validatePayload,
  verifyOpmCode,
} = require('./opmCodeVerifier.cjs');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (e) {
    console.error(`  \u2717 ${name}: ${e.message}`);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (e) {
    console.error(`  \u2717 ${name}: ${e.message}`);
    failed++;
  }
}

function opmFile(name, content = '/* stub */') {
  return { name, content };
}

console.log('\n[opmCodeVerifier security tests]');

test('allowlist covers exactly the OPM generator outputs', () => {
  const expected = [
    'opm_types.h', 'opm_config.h', 'opm_model.h', 'opm_model.c',
    'opm_runtime.h', 'opm_runtime.c', 'opm_io.h', 'opm_io.c',
    'opm_trace.h', 'opm_trace.c', 'opm_manifest.json', 'main_example.c',
  ];
  assert.strictEqual(ALLOWED_FILES.size, expected.length);
  for (const name of expected) assert.ok(ALLOWED_FILES.has(name), `missing ${name}`);
});

test('rejects unknown filenames', () => {
  assert.throws(
    () => validatePayload({ files: [opmFile('evil.c')] }),
    (err) => err.message.includes('Filename not allowed'),
  );
  assert.throws(
    () => validatePayload({ files: [opmFile('sm_core.c')] }),
    (err) => err.message.includes('Filename not allowed'),
  );
});

test('rejects duplicate filenames', () => {
  assert.throws(
    () => validatePayload({ files: [opmFile('opm_model.c', 'a'), opmFile('opm_model.c', 'b')] }),
    (err) => err.message.includes('Duplicate filename'),
  );
});

test('rejects traversal and separator filenames', () => {
  const escapes = ['../opm_model.c', 'sub/opm_model.c', 'sub\\opm_model.c', 'opm_model.c\0.exe', '.', '..'];
  for (const filename of escapes) {
    assert.throws(
      () => validatePayload({ files: [{ name: filename, content: 'x' }] }),
      (err) => /Invalid filename|Path traversal|Filename not allowed/.test(err.message),
      `expected rejection for ${JSON.stringify(filename)}`,
    );
  }
});

test('rejects non-string content', () => {
  assert.throws(
    () => validatePayload({ files: [{ name: 'opm_model.c', content: 12345 }] }),
    (err) => err.message.includes('must be strings'),
  );
  assert.throws(
    () => validatePayload({ files: [{ name: 'opm_model.c', content: null }] }),
    (err) => err.message.includes('must be strings'),
  );
});

test('rejects single file over 2 MiB', () => {
  const oversized = 'x'.repeat(2 * 1024 * 1024 + 1);
  assert.throws(
    () => validatePayload({ files: [opmFile('opm_model.c', oversized)] }),
    (err) => err.message.includes('exceeds size limit'),
  );
});

test('rejects oversized total package', () => {
  const chunk = 'x'.repeat(2 * 1024 * 1024 - 10);
  const files = ['opm_model.c', 'opm_runtime.c', 'opm_io.c', 'opm_trace.c', 'main_example.c']
    .map((name) => opmFile(name, chunk));
  assert.throws(
    () => validatePayload({ files }),
    (err) => err.message.includes('Total payload size exceeds limit'),
  );
});

test('rejects renderer-supplied compiler path/flags/dest', () => {
  const smuggled = [
    { compiler: 'gcc; rm -rf /' },
    { flags: ['-O2', '-lmalicious'] },
    { exe: '/tmp/evil' },
    { path: '/tmp/evil' },
    { dest: '/tmp/evil' },
    { command: 'evil' },
    { cwd: '/tmp' },
    { shell: true },
  ];
  for (const extra of smuggled) {
    assert.throws(
      () => validatePayload({ files: [opmFile('opm_model.c')], ...extra }),
      (err) => err.message.includes('must not supply execution control'),
      `expected rejection for ${JSON.stringify(extra)}`,
    );
  }
  assert.throws(
    () => validatePayload({ files: [{ name: 'opm_model.c', content: 'x', flags: ['-O2'] }] }),
    (err) => err.message.includes('must not supply execution control'),
  );
});

(async () => {
  await asyncTest('rate limit: rejects concurrent verification requests', async () => {
    let releaseFirst;
    const fakeDeps = {
      fs: { mkdtempSync: () => '/tmp/adia-opm-fake', writeFileSync: () => {}, rmSync: () => {} },
      os: { tmpdir: () => '/tmp' },
      spawn: () => ({
        stdout: { on: () => {} },
        stderr: { on: () => {} },
        on: (event, cb) => { if (event === 'close') releaseFirst = () => cb(0); },
        kill: () => {},
      }),
    };
    const payload = { files: [opmFile('main_example.c', 'int main(){return 0;}'), opmFile('opm_model.c', 'int x;')] };
    const firstP = verifyOpmCode(payload, fakeDeps);
    const second = await verifyOpmCode(payload, fakeDeps);
    assert.strictEqual(second.success, false);
    assert.strictEqual(second.error, 'Verification already in progress');
    if (releaseFirst) releaseFirst();
    await firstP;
  });

  await asyncTest('executes bundled gcc with fixed flags and shell:false', async () => {
    const spawned = [];
    const fakeDeps = {
      fs: { mkdtempSync: () => '/tmp/adia-opm-test', writeFileSync: () => {}, rmSync: () => {} },
      os: { tmpdir: () => '/tmp' },
      spawn: (cmd, args, opts) => {
        spawned.push({ cmd, args, opts });
        return {
          stdout: { on: (event, cb) => { if (event === 'data') cb(Buffer.from('')); } },
          stderr: { on: (event, cb) => { if (event === 'data') cb(Buffer.from('')); } },
          on: (event, cb) => { if (event === 'close') setTimeout(() => cb(0), 5); },
          kill: () => {},
        };
      },
    };
    const payload = {
      files: [
        opmFile('opm_model.c', 'int x;'),
        opmFile('opm_runtime.c', 'int y;'),
        opmFile('main_example.c', 'int main(){return 0;}'),
      ],
    };
    const res = await verifyOpmCode(payload, fakeDeps);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.toolchainVersion, TOOLCHAIN_VERSION);
    assert.strictEqual(res.evidence.hostCompile, 'pass');
    assert.strictEqual(res.evidence.hostRuntime, 'pass');
    assert.ok(spawned.length >= 2, 'expected compile + conformance exec');
    const compileCall = spawned[0];
    assert.strictEqual(compileCall.cmd, 'gcc');
    assert.deepStrictEqual(compileCall.args.slice(0, 4), ['-Wall', '-Wextra', '-pedantic', '-std=c99']);
    assert.ok(!compileCall.args.some((a) => String(a).includes('evil')));
    for (const item of spawned) assert.strictEqual(item.opts.shell, false);
  });

  await asyncTest('fails cleanly without conformance entry point', async () => {
    const res = await verifyOpmCode({ files: [opmFile('opm_model.c', 'int x;')] });
    assert.strictEqual(res.success, false);
    assert.ok(res.error.includes('main_example.c'));
  });

  console.log(`\n${'\u2500'.repeat(50)}`);
  if (failed === 0) {
    console.log(`\u2705 All ${passed} opmCodeVerifier tests passed!`);
  } else {
    console.error(`\u274C ${failed} test(s) failed, ${passed} passed.`);
    process.exit(1);
  }
})();
