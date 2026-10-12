// src/security/toolchainVerifier.cjs
// SHA-256 Checksum verification for downloaded binary toolchains
const crypto = require('crypto');

const TOOLCHAIN_LOCK = require('../../toolchains.lock.json');

/**
 * Expected SHA-256 hashes for allowed toolchain archives, derived from
 * toolchains.lock.json (single source of truth). Entries with a null sha256 are
 * omitted, so they fail verification with UNKNOWN_TOOLCHAIN.
 */
const TOOLCHAIN_SHA256_HASHES = {};
for (const [key, entry] of Object.entries(TOOLCHAIN_LOCK.entries || {})) {
  if (!entry.sha256) continue;
  TOOLCHAIN_SHA256_HASHES[key] = entry.sha256;
  if (entry.hashKey) TOOLCHAIN_SHA256_HASHES[entry.hashKey] = entry.sha256;
}

/**
 * Verifies that a buffer or file content matches the expected SHA-256 hash for a given toolchain key.
 * @param {string} key - Toolchain identifier ('Generic', 'Arduino', 'STM32', etc.)
 * @param {Buffer} buffer - Binary content of the downloaded zip archive
 * @returns {{ valid: boolean, code?: string, actualHash?: string, expectedHash?: string }}
 */
function verifyToolchainHash(key, buffer) {
  const expectedHash = TOOLCHAIN_SHA256_HASHES[key];
  if (!expectedHash) {
    return {
      valid: false,
      code: 'UNKNOWN_TOOLCHAIN',
      message: `No SHA-256 hash registered for toolchain key: ${key}`
    };
  }

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return {
      valid: false,
      code: 'INVALID_BUFFER',
      message: 'Invalid or empty buffer provided for SHA-256 hash calculation'
    };
  }

  const actualHash = crypto.createHash('sha256').update(buffer).digest('hex');

  if (actualHash.toLowerCase() !== expectedHash.toLowerCase()) {
    return {
      valid: false,
      code: 'HASH_MISMATCH',
      actualHash,
      expectedHash,
      message: `SHA-256 checksum mismatch for '${key}'. Expected: ${expectedHash}, Got: ${actualHash}`
    };
  }

  return {
    valid: true,
    actualHash
  };
}

module.exports = {
  verifyToolchainHash,
  TOOLCHAIN_SHA256_HASHES
};
