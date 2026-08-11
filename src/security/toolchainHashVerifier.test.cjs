const assert = require('assert');
const crypto = require('crypto');
const { verifyToolchainHash, TOOLCHAIN_SHA256_HASHES } = require('./toolchainVerifier.cjs');

console.log('[toolchainHashVerifier security tests]');

// Test 1: Known valid hash passes
(() => {
  const dummyZipContent = Buffer.from('mock-zip-content-for-testing-sha256');
  const expectedHash = crypto.createHash('sha256').update(dummyZipContent).digest('hex');
  
  // Set temporary hash for testing
  TOOLCHAIN_SHA256_HASHES['TestKey'] = expectedHash;

  const result = verifyToolchainHash('TestKey', dummyZipContent);
  assert.strictEqual(result.valid, true, 'Valid buffer matching SHA-256 hash should pass');
  console.log('  ✓ valid buffer matching expected SHA-256 hash passes verification');
  delete TOOLCHAIN_SHA256_HASHES['TestKey'];
})();

// Test 2: Tampered zip content fails
(() => {
  const dummyZipContent = Buffer.from('mock-zip-content-for-testing-sha256');
  TOOLCHAIN_SHA256_HASHES['TestKey'] = '0000000000000000000000000000000000000000000000000000000000000000';

  const result = verifyToolchainHash('TestKey', dummyZipContent);
  assert.strictEqual(result.valid, false, 'Tampered buffer should fail verification');
  assert.strictEqual(result.code, 'HASH_MISMATCH', 'Should return HASH_MISMATCH error code');
  console.log('  ✓ tampered buffer with mismatched SHA-256 hash fails verification');
  delete TOOLCHAIN_SHA256_HASHES['TestKey'];
})();

// Test 3: Unknown toolchain key fails
(() => {
  const dummyZipContent = Buffer.from('some-data');
  const result = verifyToolchainHash('UnknownKey', dummyZipContent);
  assert.strictEqual(result.valid, false, 'Unknown toolchain key should fail verification');
  assert.strictEqual(result.code, 'UNKNOWN_TOOLCHAIN', 'Should return UNKNOWN_TOOLCHAIN error code');
  console.log('  ✓ unknown toolchain key fails verification');
})();

console.log('\n──────────────────────────────────────────────────');
console.log('✅ All toolchainHashVerifier tests passed!\n');
