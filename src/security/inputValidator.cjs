// src/security/inputValidator.cjs
// Centralized inputs/arguments validation to mitigate injection & directory traversal

const ALLOWED_TOOLCHAIN_KEYS = ['Generic', 'Arduino', 'STM32', 'ESP32'];
const ALLOWED_SERVICE_NAMES = ['gemini', 'openai', 'local', 'n8n'];

function validateString(value, maxLength = 1000) {
  if (typeof value !== 'string') return '';
  return value.slice(0, maxLength);
}

function validateUrl(url, allowedProtocols = ['https:']) {
  try {
    const parsed = new URL(url);
    return allowedProtocols.includes(parsed.protocol) ? url : null;
  } catch {
    return null;
  }
}

function validateFilename(name) {
  if (typeof name !== 'string') return '_';
  // Strip path separators and null bytes to prevent traversal/obfuscation
  return name.replace(/[/\\:\0*?"<>|]/g, '_').slice(0, 255);
}

function sanitizeShellArg(arg) {
  if (typeof arg !== 'string') return '';
  // Strip characters commonly used to chain or inject shell commands
  return arg.replace(/[;&|`$(){}!#<>]/g, '');
}

/**
 * Validates a toolchain key against the allowlist.
 * @param {string} key - The toolchain key to validate.
 * @returns {string} The key if valid.
 * @throws {Error} If the key is not in the allowlist.
 */
function validateToolchainKey(key) {
  if (!ALLOWED_TOOLCHAIN_KEYS.includes(key)) {
    throw new Error(`Invalid toolchain key: "${key}". Allowed: ${ALLOWED_TOOLCHAIN_KEYS.join(', ')}`);
  }
  return key;
}

/**
 * Validates a service name against the allowlist.
 * @param {string} service - The service name to validate.
 * @returns {string} The service if valid.
 * @throws {Error} If the service is not in the allowlist.
 */
function validateServiceName(service) {
  if (!ALLOWED_SERVICE_NAMES.includes(service)) {
    throw new Error(`Invalid service name: "${service}". Allowed: ${ALLOWED_SERVICE_NAMES.join(', ')}`);
  }
  return service;
}

/**
 * Validates a redirect URL against an allowlist of trusted hosts.
 * Only HTTPS redirects to explicitly trusted hosts are permitted.
 * @param {string} url - The redirect URL to validate.
 * @param {string[]} allowedHosts - Trusted hostnames (e.g. ['github.com', 'developer.arm.com']).
 * @returns {string|null} The url if valid, null otherwise.
 */
function validateRedirectUrl(url, allowedHosts) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
    const hostname = parsed.hostname.toLowerCase();
    const trusted = allowedHosts.some(
      (host) => hostname === host.toLowerCase() || hostname.endsWith('.' + host.toLowerCase())
    );
    return trusted ? url : null;
  } catch {
    return null;
  }
}

module.exports = {
  validateString,
  validateUrl,
  validateFilename,
  sanitizeShellArg,
  validateToolchainKey,
  validateServiceName,
  validateRedirectUrl,
};
