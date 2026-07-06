// src/security/inputValidator.cjs
// Centralized inputs/arguments validation to mitigate injection & directory traversal

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

module.exports = {
  validateString,
  validateUrl,
  validateFilename,
  sanitizeShellArg
};
