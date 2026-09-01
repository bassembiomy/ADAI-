// src/security/inputValidator.test.cjs
// Automated tests for inputValidator.cjs — run with: node src/security/inputValidator.test.cjs

'use strict';

const assert = require('assert');
const {
  validateString,
  validateUrl,
  validateFilename,
  sanitizeShellArg,
  validateToolchainKey,
  validateServiceName,
  validateRedirectUrl,
} = require('./inputValidator.cjs');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}: ${e.message}`);
    failed++;
  }
}

// ─── validateString ────────────────────────────────────────────────────────────
console.log('\n[validateString]');
test('returns string unchanged within limit', () => {
  assert.strictEqual(validateString('hello', 100), 'hello');
});
test('truncates strings over maxLength', () => {
  assert.strictEqual(validateString('abcdef', 3), 'abc');
});
test('returns empty string for non-string', () => {
  assert.strictEqual(validateString(42), '');
  assert.strictEqual(validateString(null), '');
});

// ─── validateUrl ───────────────────────────────────────────────────────────────
console.log('\n[validateUrl]');
test('accepts https URL', () => {
  assert.strictEqual(validateUrl('https://api.openai.com/v1'), 'https://api.openai.com/v1');
});
test('rejects http URL', () => {
  assert.strictEqual(validateUrl('http://evil.com'), null);
});
test('rejects non-URL string', () => {
  assert.strictEqual(validateUrl('not-a-url'), null);
});

// ─── validateFilename ──────────────────────────────────────────────────────────
console.log('\n[validateFilename]');
test('strips path separators from traversal attempt', () => {
  assert.strictEqual(validateFilename('../etc/passwd'), '.._etc_passwd');
});
test('allows normal filename unchanged', () => {
  assert.strictEqual(validateFilename('main.c'), 'main.c');
});
test('strips null bytes', () => {
  assert.strictEqual(validateFilename('evil\0file'), 'evil_file');
});
test('returns _ for non-string', () => {
  assert.strictEqual(validateFilename(null), '_');
});

// ─── sanitizeShellArg ──────────────────────────────────────────────────────────
console.log('\n[sanitizeShellArg]');
test('passes clean string unchanged', () => {
  assert.strictEqual(sanitizeShellArg('hello world'), 'hello world');
});
test('strips shell injection characters', () => {
  assert.strictEqual(sanitizeShellArg('evil; rm -rf /'), 'evil rm -rf /');
  assert.strictEqual(sanitizeShellArg('$(whoami)'), 'whoami');
  assert.strictEqual(sanitizeShellArg('cmd | evil'), 'cmd  evil');
});
test('returns empty string for non-string', () => {
  assert.strictEqual(sanitizeShellArg(123), '');
});

// ─── validateToolchainKey ─────────────────────────────────────────────────────
console.log('\n[validateToolchainKey]');
test('accepts Generic', () => {
  assert.strictEqual(validateToolchainKey('Generic'), 'Generic');
});
test('accepts Arduino', () => {
  assert.strictEqual(validateToolchainKey('Arduino'), 'Arduino');
});
test('accepts STM32', () => {
  assert.strictEqual(validateToolchainKey('STM32'), 'STM32');
});
test('accepts ESP32', () => {
  assert.strictEqual(validateToolchainKey('ESP32'), 'ESP32');
});
test('rejects shell injection in toolchain key', () => {
  assert.throws(() => validateToolchainKey('evil; rm -rf /'), /Invalid toolchain key/);
});
test('rejects empty string', () => {
  assert.throws(() => validateToolchainKey(''), /Invalid toolchain key/);
});
test('rejects unknown toolchain', () => {
  assert.throws(() => validateToolchainKey('UnknownTC'), /Invalid toolchain key/);
});

// ─── validateServiceName ──────────────────────────────────────────────────────
console.log('\n[validateServiceName]');
test('accepts gemini', () => {
  assert.strictEqual(validateServiceName('gemini'), 'gemini');
});
test('accepts openai', () => {
  assert.strictEqual(validateServiceName('openai'), 'openai');
});
test('accepts local', () => {
  assert.strictEqual(validateServiceName('local'), 'local');
});
test('accepts n8n', () => {
  assert.strictEqual(validateServiceName('n8n'), 'n8n');
});
test('rejects arbitrary service name', () => {
  assert.throws(() => validateServiceName('evil'), /Invalid service name/);
});
test('rejects empty string', () => {
  assert.throws(() => validateServiceName(''), /Invalid service name/);
});

// ─── validateRedirectUrl ──────────────────────────────────────────────────────
console.log('\n[validateRedirectUrl]');
test('accepts https redirect to trusted host', () => {
  assert.strictEqual(
    validateRedirectUrl('https://github.com/releases/file.zip', ['github.com']),
    'https://github.com/releases/file.zip'
  );
});
test('accepts redirect to subdomain of trusted host', () => {
  assert.strictEqual(
    validateRedirectUrl('https://objects.githubusercontent.com/file', ['github.com', 'objects.githubusercontent.com']),
    'https://objects.githubusercontent.com/file'
  );
});
test('blocks http redirect even to trusted host', () => {
  assert.strictEqual(
    validateRedirectUrl('http://github.com/file', ['github.com']),
    null
  );
});
test('blocks redirect to untrusted host', () => {
  assert.strictEqual(
    validateRedirectUrl('https://evil.com/file', ['github.com']),
    null
  );
});
test('blocks SSRF via look-alike domain', () => {
  assert.strictEqual(
    validateRedirectUrl('https://evil-github.com/file', ['github.com']),
    null
  );
});
test('blocks malformed URL', () => {
  assert.strictEqual(
    validateRedirectUrl('not-a-url', ['github.com']),
    null
  );
});

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
if (failed === 0) {
  console.log(`✅ All ${passed} inputValidator tests passed!`);
} else {
  console.error(`❌ ${failed} test(s) failed, ${passed} passed.`);
  process.exit(1);
}
