'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_EXTENSION = '.adia';
const MAX_PROJECT_BYTES = 50 * 1024 * 1024;

function normalizeAdiaPath(inputPath) {
  if (typeof inputPath !== 'string' || inputPath.trim() === '') {
    throw new TypeError('Project path must be a non-empty string');
  }
  if (inputPath.includes('\0')) {
    throw new Error('Project path cannot contain null bytes');
  }
  const parsed = path.parse(inputPath);
  if (parsed.ext.toLowerCase() === PROJECT_EXTENSION) return inputPath;
  const fileName = `${parsed.name || parsed.base}${PROJECT_EXTENSION}`;
  return parsed.dir ? path.join(parsed.dir, fileName) : fileName;
}

function extractAdiaPath(argv, deps = {}) {
  const resolvePath = deps.resolvePath || path.resolve;
  const existsSync = deps.existsSync || fs.existsSync;
  const statSync = deps.statSync || fs.statSync;
  for (const raw of Array.isArray(argv) ? argv : []) {
    if (typeof raw !== 'string' || raw.startsWith('--') || raw.includes('\0')) continue;
    const candidate = raw.replace(/^"|"$/g, '');
    if (path.extname(candidate).toLowerCase() !== PROJECT_EXTENSION) continue;
    const resolved = resolvePath(candidate);
    try {
      if (existsSync(resolved) && statSync(resolved).isFile()) return resolved;
    } catch {}
  }
  return null;
}

function readProjectFile(filePath, options = {}) {
  if (typeof filePath !== 'string' || filePath.trim() === '' || filePath.includes('\0')) {
    throw new Error('Project path must be a valid non-empty string');
  }
  const fsImpl = options.fsImpl || fs;
  const resolved = path.resolve(filePath);
  const extension = path.extname(resolved).toLowerCase();
  const allowed = extension === PROJECT_EXTENSION || (options.allowLegacyJson && extension === '.json');
  if (!allowed) throw new Error('Unsupported ADIA project extension');
  const stats = fsImpl.statSync(resolved);
  if (!stats.isFile()) throw new Error('Project path is not a regular file');
  if (stats.size === 0) throw new Error('Project file is empty (0 bytes)');
  if (stats.size > MAX_PROJECT_BYTES) throw new Error('Project file exceeds the 50 MB limit');
  let raw = fsImpl.readFileSync(resolved, 'utf8');
  if (raw.charCodeAt(0) === 0xFEFF) {
    raw = raw.slice(1);
  }
  const content = raw.trim();
  if (!content) throw new Error('Project file content is empty');
  return { filePath: resolved, data: JSON.parse(content) };
}

function writeProjectFile(filePath, data, deps = {}) {
  if (typeof filePath !== 'string' || filePath.trim() === '' || filePath.includes('\0')) {
    throw new Error('Project path must be a valid non-empty string');
  }
  const fsImpl = deps.fsImpl || fs;
  const resolved = path.resolve(filePath);
  const target = normalizeAdiaPath(resolved);
  const temporary = `${target}.tmp-${process.pid}-${deps.randomId ? deps.randomId() : Date.now()}`;
  try {
    const serialized = `${JSON.stringify(data, null, 2)}\n`;
    if (Buffer.byteLength(serialized, 'utf8') > MAX_PROJECT_BYTES) {
      throw new Error('Project file exceeds the 50 MB limit');
    }
    fsImpl.writeFileSync(temporary, serialized, 'utf8');
    fsImpl.renameSync(temporary, target);
    return target;
  } catch (error) {
    try {
      if (fsImpl.existsSync(temporary)) fsImpl.unlinkSync(temporary);
    } catch {}
    throw error;
  }
}

const UPGRADE_BACKUP_SUFFIX = '.v3-backup.json';
const CURRENT_SYSML_FORMAT = 5;

/**
 * Model format of the SysML repository inside a project file: 1 for flat legacy
 * payloads that carry parts, 2 or 3 for repositories that still hold part and
 * port usage records, and null when the file needs no upgrade (format 4 or 5,
 * no SysML data, or something unreadable).
 */
function detectSysmlRepositoryFormat(data) {
  if (!data || typeof data !== 'object') return null;
  let repository = data.sysmlRepository !== undefined ? data.sysmlRepository : data.canonicalSysmlRepository;
  if (repository === undefined || repository === null) {
    const hasParts = Array.isArray(data.parts) && data.parts.length > 0;
    const hasConnectors = Array.isArray(data.connectors) && data.connectors.length > 0;
    return hasParts || hasConnectors ? 1 : null;
  }
  if (typeof repository === 'string') {
    try {
      repository = JSON.parse(repository);
    } catch {
      return null;
    }
  }
  if (!repository || typeof repository !== 'object') return null;
  const inner = repository.format === 'ADIA-SysML' && repository.repository && typeof repository.repository === 'object'
    ? repository.repository
    : repository;
  const version = Number(inner.schemaVersion !== undefined ? inner.schemaVersion : repository.schemaVersion);
  return version === 2 || version === 3 ? version : null;
}

function upgradeBackupPathFor(filePath) {
  const parsed = path.parse(path.resolve(filePath));
  return path.join(parsed.dir, `${parsed.name}${UPGRADE_BACKUP_SUFFIX}`);
}

/**
 * Keeps the original JSON of a project file next to it as `<name>.v3-backup.json`
 * before the file is upgraded. An existing backup is never overwritten: the
 * first one is the original. Returns null when the data needs no upgrade.
 */
function ensureUpgradeBackup(filePath, data, deps = {}) {
  const formatVersion = detectSysmlRepositoryFormat(data);
  if (formatVersion === null) return null;
  const fsImpl = deps.fsImpl || fs;
  const resolved = path.resolve(filePath);
  if (resolved.toLowerCase().endsWith(UPGRADE_BACKUP_SUFFIX)) {
    return { formatVersion, backupPath: resolved, backupCreated: false, backupError: null };
  }
  const backupPath = upgradeBackupPathFor(resolved);
  try {
    if (fsImpl.existsSync(backupPath)) return { formatVersion, backupPath, backupCreated: false, backupError: null };
    const original = fsImpl.readFileSync(resolved);
    fsImpl.writeFileSync(backupPath, original, { flag: 'wx' });
    return { formatVersion, backupPath, backupCreated: true, backupError: null };
  } catch (error) {
    if (error && error.code === 'EEXIST') return { formatVersion, backupPath, backupCreated: false, backupError: null };
    return { formatVersion, backupPath: null, backupCreated: false, backupError: error && error.message ? error.message : String(error) };
  }
}

module.exports = {
  PROJECT_EXTENSION,
  MAX_PROJECT_BYTES,
  UPGRADE_BACKUP_SUFFIX,
  CURRENT_SYSML_FORMAT,
  normalizeAdiaPath,
  extractAdiaPath,
  readProjectFile,
  writeProjectFile,
  detectSysmlRepositoryFormat,
  upgradeBackupPathFor,
  ensureUpgradeBackup,
};
