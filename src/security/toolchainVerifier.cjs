// src/security/toolchainVerifier.cjs
// SHA-256 Checksum verification for downloaded binary toolchains
const crypto = require('crypto');

/**
 * Expected SHA-256 hashes for allowed toolchain archives.
 * If set to null or empty, hash check requires explicit hash specification.
 */
const TOOLCHAIN_SHA256_HASHES = {
  // w64devkit v1.23.0 official release archive sha256 hash
  Generic: 'f403932e652a9ae63c1ddbe4a2c9be0152cb5b78f44d1809072a39dd1ce1909a',
  // avr-gcc 15.2.0 official release archive sha256 hash
  Arduino: '7a195dfb0cebfbe3d7bd6205edcefcb4aa5ebce45a7bb918451152a55faed102',
  // arm-none-eabi 10.3-2021.10 official release archive sha256 hash
  STM32: 'd27f8372baf26bc6f62e843c080cb0c07c6f092780e8c057edc460d3d5786a51',
};

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
