// src/security/hilSerialHelpers.test.cjs
// Tests for hilSerialHelpers.cjs — run with: node src/security/hilSerialHelpers.test.cjs

'use strict';

const assert = require('assert');
const { normalizeHilPayload, createLineSplitter, HIL_MAX_PAYLOAD, HIL_MAX_LINE } = require('./hilSerialHelpers.cjs');

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

console.log('hilSerialHelpers');

test('normalizeHilPayload rejects non-string payloads', () => {
  for (const bad of [undefined, null, 42, {}, [], true]) {
    assert.strictEqual(normalizeHilPayload(bad), null);
  }
});

test('normalizeHilPayload strips CR and surrounding whitespace, returns a single line', () => {
  assert.strictEqual(normalizeHilPayload('speed=3.5\r\n'), 'speed=3.5');
  assert.strictEqual(normalizeHilPayload('  a_release=1\n'), 'a_release=1');
});

test('normalizeHilPayload rejects empty, over-long, embedded newline and control payloads', () => {
  assert.strictEqual(normalizeHilPayload(''), null);
  assert.strictEqual(normalizeHilPayload('\r\n'), null);
  assert.strictEqual(normalizeHilPayload('a'.repeat(HIL_MAX_PAYLOAD + 1)), null);
  assert.strictEqual(normalizeHilPayload('a'.repeat(HIL_MAX_PAYLOAD)), 'a'.repeat(HIL_MAX_PAYLOAD));
  assert.strictEqual(normalizeHilPayload('a=1\nb=2'), null);
  assert.strictEqual(normalizeHilPayload('a=1\u0000'), null);
});

test('createLineSplitter splits complete lines and keeps the partial remainder', () => {
  const s = createLineSplitter(64);
  assert.deepStrictEqual(s.push('a=1\nb='), ['a=1']);
  assert.deepStrictEqual(s.push('2\n\nc=3\n'), ['b=2', 'c=3']);
});

test('createLineSplitter drops an overflowing line up to the next newline', () => {
  const s = createLineSplitter(8);
  assert.deepStrictEqual(s.push('x'.repeat(20)), []);
  assert.deepStrictEqual(s.push('yyyy\nok=1\n'), ['ok=1']);
});

test('createLineSplitter drops a single over-long complete line', () => {
  const s = createLineSplitter(8);
  assert.deepStrictEqual(s.push(`${'x'.repeat(30)}\nok=1\n`), ['ok=1']);
});

test('default line cap is 4096', () => {
  assert.strictEqual(HIL_MAX_LINE, 4096);
  const s = createLineSplitter();
  assert.deepStrictEqual(s.push(`${'x'.repeat(5000)}\nok\n`), ['ok']);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
