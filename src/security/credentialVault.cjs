const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, safeStorage } = require('electron');

let keytarLib = null;
try {
  keytarLib = require('keytar');
} catch (_) {
  // keytar not installed, will use safeStorage fallback
}

const KEYTAR_SERVICE = 'ADIA-3DEXPERIENCE';
const KEYTAR_ACCOUNT = 'default';

// Audit log configuration
const AUDIT_LOG_MAX_BYTES = 1 * 1024 * 1024; // 1 MB before rotation
const AUDIT_LOG_KEEP_ROTATIONS = 3;            // keep audit.log.1, .2, .3

// Fallback encrypted file location
function getFallbackPath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'adia_vault.bin');
}

// Derive machine-specific key (shared between encryptString and decryptString)
function deriveMachineKey() {
  const machineEntropy = `${require('os').hostname()}:${require('os').userInfo().username}:${app.getPath('userData')}`;
  const salt = crypto.createHash('sha256').update(machineEntropy).digest();
  return crypto.scryptSync(salt, crypto.createHash('sha256').update('adia-vault-2026').digest(), 32, { N: 16384, r: 8, p: 1 });
}

// Fallback encryption using app safeStorage, or custom AES-256-GCM using machine specific/random key
function encryptString(plainText) {
  if (safeStorage && safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(plainText).toString('base64');
  }
  
  const key = deriveMachineKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return JSON.stringify({
    iv: iv.toString('hex'),
    content: encrypted,
    tag: authTag
  });
}

function decryptString(cipherText) {
  if (safeStorage && safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(Buffer.from(cipherText, 'base64'));
  }

  try {
    const data = JSON.parse(cipherText);
    const key = deriveMachineKey();
    const iv = Buffer.from(data.iv, 'hex');
    const authTag = Buffer.from(data.tag, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(data.content, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Failed to decrypt fallback vault data:', err.message);
    return null;
  }
}

// Store credentials
async function storeCredentials(creds) {
  const dataStr = JSON.stringify(creds);
  
  // Log security audit event
  logAuditEvent('store_credentials', {
    userEmail: creds.userEmail || creds.userId || 'unknown',
    tenantUrl: creds.tenantUrl
  });

  if (keytarLib) {
    try {
      await keytarLib.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT, dataStr);
      return;
    } catch (err) {
      console.warn('keytar setPassword failed, using safeStorage fallback:', err.message);
    }
  }

  // Fallback
  try {
    const encrypted = encryptString(dataStr);
    fs.writeFileSync(getFallbackPath(), encrypted, 'utf8');
  } catch (err) {
    console.error('Failed to write credentials to vault fallback:', err);
  }
}

// Load credentials
async function loadCredentials() {
  if (keytarLib) {
    try {
      const raw = await keytarLib.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
      if (raw) return JSON.parse(raw);
    } catch (err) {
      console.warn('keytar getPassword failed, trying safeStorage fallback:', err.message);
    }
  }

  // Fallback
  try {
    const filePath = getFallbackPath();
    if (fs.existsSync(filePath)) {
      const encrypted = fs.readFileSync(filePath, 'utf8');
      const decrypted = decryptString(encrypted);
      return decrypted ? JSON.parse(decrypted) : null;
    }
  } catch (err) {
    console.error('Failed to load credentials from vault fallback:', err);
  }
  return null;
}

// Delete credentials
async function deleteCredentials() {
  logAuditEvent('delete_credentials', {});
  if (keytarLib) {
    try {
      await keytarLib.deletePassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
      return;
    } catch (err) {
      console.warn('keytar deletePassword failed, removing safeStorage fallback:', err.message);
    }
  }

  // Fallback
  try {
    const filePath = getFallbackPath();
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error('Failed to delete credentials from vault fallback:', err);
  }
}

// ─── Audit Log ────────────────────────────────────────────────────────────────
// Append-only audit logger with HMAC integrity and log rotation.
// Each log line is JSON + a tab-separated HMAC so tampering can be detected.

function getAuditLogPath() {
  const logDir = path.dirname(getFallbackPath());
  return path.join(logDir, 'audit.log');
}

/**
 * Derives the HMAC key for audit log integrity from the machine key.
 * Uses a different derivation than the vault key to ensure separation.
 */
function deriveHmacKey() {
  const machineEntropy = `${require('os').hostname()}:${require('os').userInfo().username}:${app.getPath('userData')}`;
  return crypto.createHash('sha256').update('adia-audit-hmac-2026:' + machineEntropy).digest();
}

/**
 * Rotates the audit log if it exceeds the size limit.
 * Keeps up to AUDIT_LOG_KEEP_ROTATIONS old logs.
 */
function rotateAuditLogIfNeeded(logPath) {
  try {
    if (!fs.existsSync(logPath)) return;
    const { size } = fs.statSync(logPath);
    if (size < AUDIT_LOG_MAX_BYTES) return;

    // Rotate: audit.log.3 -> delete, audit.log.2 -> .3, ..., audit.log -> .1
    for (let i = AUDIT_LOG_KEEP_ROTATIONS; i >= 1; i--) {
      const older = `${logPath}.${i}`;
      const newer = i === 1 ? logPath : `${logPath}.${i - 1}`;
      if (fs.existsSync(newer)) {
        if (i === AUDIT_LOG_KEEP_ROTATIONS) {
          fs.unlinkSync(older); // discard oldest
        }
        try { fs.renameSync(newer, older); } catch (_) { /* best-effort */ }
      }
    }
  } catch (err) {
    console.error('Audit log rotation failed:', err.message);
  }
}

/**
 * Append-only audit logger with HMAC integrity.
 * Each line format: <JSON payload>\t<HMAC-SHA256-hex>
 *
 * @param {string} action - The audit action name (e.g. 'store_credentials').
 * @param {object} details - Additional context to log.
 */
function logAuditEvent(action, details) {
  try {
    const logPath = getAuditLogPath();
    rotateAuditLogIfNeeded(logPath);

    const payload = JSON.stringify({
      timestamp: new Date().toISOString(),
      action,
      ...details,
    });

    // Compute HMAC over the payload for tamper detection
    const hmacKey = deriveHmacKey();
    const hmac = crypto.createHmac('sha256', hmacKey).update(payload).digest('hex');
    const logEntry = `${payload}\t${hmac}\n`;

    fs.appendFileSync(logPath, logEntry, 'utf8');
  } catch (err) {
    console.error('Audit logging failed:', err.message);
  }
}

/**
 * Verifies the HMAC integrity of all entries in the audit log.
 * @returns {{ valid: number, tampered: number, errors: string[] }}
 */
function verifyAuditLog() {
  const logPath = getAuditLogPath();
  if (!fs.existsSync(logPath)) {
    return { valid: 0, tampered: 0, errors: ['Audit log file not found'] };
  }

  const hmacKey = deriveHmacKey();
  const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
  let valid = 0;
  let tampered = 0;
  const errors = [];

  for (const line of lines) {
    const tabIdx = line.lastIndexOf('\t');
    if (tabIdx === -1) {
      tampered++;
      errors.push(`Entry missing HMAC: ${line.slice(0, 80)}...`);
      continue;
    }
    const payload = line.slice(0, tabIdx);
    const storedHmac = line.slice(tabIdx + 1);
    const expectedHmac = crypto.createHmac('sha256', hmacKey).update(payload).digest('hex');
    if (storedHmac === expectedHmac) {
      valid++;
    } else {
      tampered++;
      errors.push(`Tampered entry detected at: ${JSON.parse(payload)?.timestamp || 'unknown time'}`);
    }
  }

  return { valid, tampered, errors };
}

module.exports = {
  storeCredentials,
  loadCredentials,
  deleteCredentials,
  logAuditEvent,
  verifyAuditLog,
};
