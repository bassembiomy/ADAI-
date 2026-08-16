'use strict';

const fs = require('fs');
const path = require('path');

const PROJECT_EXTENSION = '.adia';
const MAX_PROJECT_BYTES = 50 * 1024 * 1024;

function normalizeAdiaPath(inputPath) {
  if (typeof inputPath !== 'string' || inputPath.trim() === '') {
    throw new TypeError('Project path must be a non-empty string');
  }
  const parsed = path.parse(inputPath);
  if (parsed.ext.toLowerCase() === PROJECT_EXTENSION) return inputPath;
  return path.join(parsed.dir, `${parsed.name || parsed.base}${PROJECT_EXTENSION}`);
}

function extractAdiaPath(argv, deps = {}) {
  const resolvePath = deps.resolvePath || path.resolve;
  const existsSync = deps.existsSync || fs.existsSync;
  const statSync = deps.statSync || fs.statSync;
  for (const raw of Array.isArray(argv) ? argv : []) {
    if (typeof raw !== 'string' || raw.startsWith('--')) continue;
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
  const fsImpl = deps.fsImpl || fs;
  const target = normalizeAdiaPath(path.resolve(filePath));
  const temporary = `${target}.tmp-${process.pid}-${deps.randomId ? deps.randomId() : Date.now()}`;
  try {
    fsImpl.writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    fsImpl.renameSync(temporary, target);
    return target;
  } catch (error) {
    try {
      if (fsImpl.existsSync(temporary)) fsImpl.unlinkSync(temporary);
    } catch {}
    throw error;
  }
}

module.exports = {
  PROJECT_EXTENSION,
  MAX_PROJECT_BYTES,
  normalizeAdiaPath,
  extractAdiaPath,
  readProjectFile,
  writeProjectFile,
};
