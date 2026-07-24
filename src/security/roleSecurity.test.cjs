// src/security/roleSecurity.test.cjs
// Automated tests for roleSecurity.cjs — run with: node src/security/roleSecurity.test.cjs

'use strict';

const assert = require('assert');
const { ROLES, checkPermission, getEffectiveRole, rlsDenied } = require('./roleSecurity.cjs');

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

// ─── getEffectiveRole ─────────────────────────────────────────────────────────
console.log('\n[getEffectiveRole]');
test('null credentials => guest', () => {
  assert.strictEqual(getEffectiveRole(null), ROLES.GUEST);
});
test('empty object => guest', () => {
  assert.strictEqual(getEffectiveRole({}), ROLES.GUEST);
});
test('credentials with only apiKeys => engineer', () => {
  assert.strictEqual(getEffectiveRole({ apiKeys: { gemini: 'key' } }), ROLES.ENGINEER);
});
test('credentials with tenantUrl but no token => engineer', () => {
  assert.strictEqual(getEffectiveRole({ tenantUrl: 'https://t.3ds.com', userEmail: 'a@b.com' }), ROLES.ENGINEER);
});
test('credentials with valid (non-expired) 3DX token => admin', () => {
  const creds = {
    tenantUrl: 'https://t.3ds.com',
    userEmail: 'a@b.com',
    accessToken: 'token123',
    expiresAt: Date.now() + 3600_000, // 1 hour from now
  };
  assert.strictEqual(getEffectiveRole(creds), ROLES.ADMIN);
});
test('credentials with expired 3DX token => engineer', () => {
  const creds = {
    tenantUrl: 'https://t.3ds.com',
    userEmail: 'a@b.com',
    accessToken: 'token123',
    expiresAt: Date.now() - 1000, // expired
  };
  assert.strictEqual(getEffectiveRole(creds), ROLES.ENGINEER);
});

// ─── checkPermission — guest ─────────────────────────────────────────────────
console.log('\n[checkPermission — guest]');
test('guest cannot use AI', () => {
  const r = checkPermission(ROLES.GUEST, 'ai', 'use');
  assert.strictEqual(r.allowed, false);
  assert.ok(r.reason.includes('guest'));
});
test('guest cannot compile HIL', () => {
  const r = checkPermission(ROLES.GUEST, 'hil', 'compile');
  assert.strictEqual(r.allowed, false);
});
test('guest cannot start 3DX OAuth', () => {
  const r = checkPermission(ROLES.GUEST, 'threeDX', 'oauthStart');
  assert.strictEqual(r.allowed, false);
});
test('guest cannot view audit log', () => {
  const r = checkPermission(ROLES.GUEST, 'audit', 'view');
  assert.strictEqual(r.allowed, false);
});

// ─── checkPermission — engineer ───────────────────────────────────────────────
console.log('\n[checkPermission — engineer]');
test('engineer can use AI', () => {
  assert.strictEqual(checkPermission(ROLES.ENGINEER, 'ai', 'use').allowed, true);
});
test('engineer can compile HIL', () => {
  assert.strictEqual(checkPermission(ROLES.ENGINEER, 'hil', 'compile').allowed, true);
});
test('engineer can flash HIL', () => {
  assert.strictEqual(checkPermission(ROLES.ENGINEER, 'hil', 'flash').allowed, true);
});
test('engineer can start 3DX OAuth', () => {
  assert.strictEqual(checkPermission(ROLES.ENGINEER, 'threeDX', 'oauthStart').allowed, true);
});
test('engineer cannot view audit log', () => {
  assert.strictEqual(checkPermission(ROLES.ENGINEER, 'audit', 'view').allowed, false);
});
test('engineer can import project', () => {
  assert.strictEqual(checkPermission(ROLES.ENGINEER, 'project', 'import').allowed, true);
});

// ─── checkPermission — admin ──────────────────────────────────────────────────
console.log('\n[checkPermission — admin]');
test('admin can use AI', () => {
  assert.strictEqual(checkPermission(ROLES.ADMIN, 'ai', 'use').allowed, true);
});
test('admin can view audit log', () => {
  assert.strictEqual(checkPermission(ROLES.ADMIN, 'audit', 'view').allowed, true);
});
test('admin can flash HIL', () => {
  assert.strictEqual(checkPermission(ROLES.ADMIN, 'hil', 'flash').allowed, true);
});

// ─── checkPermission — edge cases ─────────────────────────────────────────────
console.log('\n[checkPermission — edge cases]');
test('unknown module returns not allowed', () => {
  const r = checkPermission(ROLES.ADMIN, 'unknownModule', 'action');
  assert.strictEqual(r.allowed, false);
  assert.ok(r.reason.includes('Unknown module'));
});
test('unknown action returns not allowed', () => {
  const r = checkPermission(ROLES.ADMIN, 'hil', 'unknownAction');
  assert.strictEqual(r.allowed, false);
  assert.ok(r.reason.includes('Unknown action'));
});

// ─── rlsDenied ────────────────────────────────────────────────────────────────
console.log('\n[rlsDenied]');
test('returns structured denial with code RLS_DENIED', () => {
  const result = rlsDenied('hil', 'flash', 'Role "guest" requires "engineer"');
  assert.strictEqual(result.code, 'RLS_DENIED');
  assert.ok(result.error.includes('Permission denied'));
  assert.strictEqual(result.module, 'hil');
  assert.strictEqual(result.action, 'flash');
});

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
if (failed === 0) {
  console.log(`✅ All ${passed} roleSecurity tests passed!`);
} else {
  console.error(`❌ ${failed} test(s) failed, ${passed} passed.`);
  process.exit(1);
}
