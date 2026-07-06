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

// Fallback encrypted file location
function getFallbackPath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'adia_vault.bin');
}

// Fallback encryption using app safeStorage, or custom AES-256-GCM using machine specific/random key
function encryptString(plainText) {
  if (safeStorage && safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(plainText).toString('base64');
  }
  
  // Derive key from machine-specific entropy (hostname + user + userData path)
  const machineEntropy = `${require('os').hostname()}:${require('os').userInfo().username}:${app.getPath('userData')}`;
  const salt = crypto.createHash('sha256').update(machineEntropy).digest();
  const key = crypto.scryptSync(salt, crypto.createHash('sha256').update('adia-vault-2026').digest(), 32, { N: 16384, r: 8, p: 1 });
  
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
    
    // Derive same key from machine-specific entropy
    const machineEntropy = `${require('os').hostname()}:${require('os').userInfo().username}:${app.getPath('userData')}`;
    const salt = crypto.createHash('sha256').update(machineEntropy).digest();
    const key = crypto.scryptSync(salt, crypto.createHash('sha256').update('adia-vault-2026').digest(), 32, { N: 16384, r: 8, p: 1 });

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

// Append-only audit logger
function logAuditEvent(action, details) {
  try {
    const logDir = path.dirname(getFallbackPath());
    const logPath = path.join(logDir, 'audit.log');
    const logEntry = JSON.stringify({
      timestamp: new Date().toISOString(),
      action,
      ...details
    }) + '\n';
    fs.appendFileSync(logPath, logEntry, 'utf8');
  } catch (err) {
    console.error('Audit logging failed:', err.message);
  }
}

module.exports = {
  storeCredentials,
  loadCredentials,
  deleteCredentials,
  logAuditEvent
};
