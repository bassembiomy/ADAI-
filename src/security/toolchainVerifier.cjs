// src/security/toolchainVerifier.cjs
// SHA-256 Checksum verification for downloaded binary toolchains
const crypto = require('crypto');

/**
 * Expected SHA-256 hashes for allowed toolchain archives.
 * If set to null or empty, hash check requires explicit hash specification.
 */
const TOOLCHAIN_SHA256_HASHES = {
  // w64devkit v1.23.0 official release archive sha256 hash
  Generic: '5c7dce6762be3e0dba648a9317790444c0e2f1ef3e677315c115727d7a549539',
  // avr-gcc 15.2.0 official release archive sha256 hash
  Arduino: '3bcfdbdbff6e3576ef0bef9e119b16f7012657d30f002d6d9d4848a7efd4f8b7',
  // arm-none-eabi 10.3-2021.10 official release archive sha256 hash
  STM32: 'd287439b3090843f3f4e29c7c41f81d958a5323aecefcf705c203bfd8ae3f2e7',
  ESP32: 'fad96cffef900b4898bc89d5a11c16c581bddb88f25fc83eccbbc126cd9a4f41',
  'esp32-xtensa-gcc-13.2.0-win64': 'fad96cffef900b4898bc89d5a11c16c581bddb88f25fc83eccbbc126cd9a4f41',
  avrdude: 'f4aa811042ef95b52c68531f6e5044c5b5a8711bcd4b495d6b9af20f9ac41325',
  'avrdude-v8.0-windows-x64': 'f4aa811042ef95b52c68531f6e5044c5b5a8711bcd4b495d6b9af20f9ac41325',
  openocd: '94b51be5e5b38ac1c5814972eee9b062f0805bcd3ecc3bad5190fd659f6a3ab3',
  'xpack-openocd-0.12.0-3-win32-x64': '94b51be5e5b38ac1c5814972eee9b062f0805bcd3ecc3bad5190fd659f6a3ab3',
  esptool: '2483d409e241d8826ae0ff023eecf31a7d4de6c10ca5ee855b1420cdfd53aaf6',
  'esptool-v4.8.1-windows-amd64': '2483d409e241d8826ae0ff023eecf31a7d4de6c10ca5ee855b1420cdfd53aaf6',
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
