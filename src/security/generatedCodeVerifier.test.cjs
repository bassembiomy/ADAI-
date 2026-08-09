// src/security/generatedCodeVerifier.test.cjs
// Automated security tests for generatedCodeVerifier.cjs — run with: node src/security/generatedCodeVerifier.test.cjs

'use strict';

const assert = require('assert');
const { ALLOWED_FILES, validatePayload, verifyGeneratedCode } = require('./generatedCodeVerifier.cjs');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ` + `✗ ${name}: ${e.message}`);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ` + `✗ ${name}: ${e.message}`);
    failed++;
  }
}

console.log('\n[generatedCodeVerifier security tests]');

test('rejects malicious escape filenames', () => {
  const escapes = ['../escape.c', 'x/escape.c', 'x\\escape.c', 'sm_core.c\0.exe', 'invalid_name.c'];
  for (const filename of escapes) {
    assert.throws(
      () => validatePayload({ files: [{ name: filename, content: 'int x;' }] }),
      (err) => err.message.includes('Invalid filename') || err.message.includes('Filename not allowed') || err.message.includes('Path traversal'),
    );
  }
});

test('rejects file count over 32', () => {
  const files = Array.from({ length: 33 }, (_, i) => ({ name: 'sm_core.c', content: `// file ${i}` }));
  assert.throws(
    () => validatePayload({ files }),
    (err) => err.message.includes('File count exceeds limit'),
  );
});

test('rejects single file size over 2 MiB', () => {
  const oversized = 'x'.repeat(2 * 1024 * 1024 + 1);
  assert.throws(
    () => validatePayload({ files: [{ name: 'sm_core.c', content: oversized }] }),
    (err) => err.message.includes('exceeds size limit'),
  );
});

test('rejects duplicate filenames', () => {
  assert.throws(
    () => validatePayload({ files: [{ name: 'sm_core.c', content: 'a' }, { name: 'sm_core.c', content: 'b' }] }),
    (err) => err.message.includes('Duplicate filename'),
  );
});

test('rejects unknown filenames', () => {
  assert.throws(
    () => validatePayload({ files: [{ name: 'unknown.c', content: 'int x;' }] }),
    (err) => err.message.includes('Filename not allowed'),
  );
});

test('rejects non-string content', () => {
  assert.throws(
    () => validatePayload({ files: [{ name: 'sm_core.c', content: 12345 }] }),
    (err) => err.message.includes('must be strings'),
  );
});

(async () => {
  await asyncTest('rejects concurrent verification requests', async () => {
    let resolveFirst;
    const fakeDeps = {
      fs: {
        mkdtempSync: () => '/tmp/adia-fake',
        writeFileSync: () => {},
        rmSync: () => {},
      },
      os: { tmpdir: () => '/tmp' },
      spawn: () => {
        const listeners = {};
        return {
          stdout: { on: () => {} },
          stderr: { on: () => {} },
          on: (event, cb) => {
            listeners[event] = cb;
            if (event === 'close') {
              resolveFirst = () => cb(0);
            }
          },
          kill: () => {},
        };
      },
    };

    const validPayload = { files: [{ name: 'sm_core.c', content: 'int main() {}' }] };

    const firstP = verifyGeneratedCode(validPayload, fakeDeps);
    const secondResult = await verifyGeneratedCode(validPayload, fakeDeps);

    assert.strictEqual(secondResult.success, false);
    assert.strictEqual(secondResult.error, 'Verification already in progress');

    if (resolveFirst) resolveFirst();
    await firstP;
  });

  await asyncTest('executes mock gcc with fixed flags and shell: false', async () => {
    const spawnedCommands = [];
    const fakeDeps = {
      fs: {
        mkdtempSync: () => '/tmp/adia-verify-test',
        writeFileSync: () => {},
        rmSync: () => {},
      },
      os: { tmpdir: () => '/tmp' },
      spawn: (cmd, args, opts) => {
        spawnedCommands.push({ cmd, args, opts });
        return {
          stdout: { on: (event, cb) => { if (event === 'data') cb(Buffer.from('')); } },
          stderr: { on: (event, cb) => { if (event === 'data') cb(Buffer.from('')); } },
          on: (event, cb) => { if (event === 'close') setTimeout(() => cb(0), 5); },
          kill: () => {},
        };
      },
    };

    const validPayload = {
      files: [
        { name: 'sm_mapping.c', content: 'int mapping;' },
        { name: 'sm_core.c', content: 'int x;' },
        { name: 'sm_safety.c', content: 'int y;' },
        { name: 'sm_user_logic.c', content: 'int z;' },
        { name: 'sm_host_test.c', content: 'int main() { return 0; }' },
      ],
    };

    const res = await verifyGeneratedCode(validPayload, fakeDeps);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.evidence.hostCompile, 'pass');
    assert.strictEqual(res.evidence.hostRuntime, 'pass');

    for (const item of spawnedCommands) {
      assert.strictEqual(item.opts.shell, false);
    }
  });

  console.log(`\n${'─'.repeat(50)}`);
  if (failed === 0) {
    console.log(`✅ All ${passed} generatedCodeVerifier tests passed!`);
  } else {
    console.error(`❌ ${failed} test(s) failed, ${passed} passed.`);
    process.exit(1);
  }
})();
