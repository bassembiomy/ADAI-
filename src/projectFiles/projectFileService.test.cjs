'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  normalizeAdiaPath,
  extractAdiaPath,
  readProjectFile,
  writeProjectFile,
  PROJECT_EXTENSION,
  MAX_PROJECT_BYTES,
} = require('./projectFileService.cjs');

console.log('Running projectFileService tests...');

// 1. Normalization tests
assert.strictEqual(normalizeAdiaPath('C:\\work\\Pump'), 'C:\\work\\Pump.adia');
assert.strictEqual(normalizeAdiaPath('C:\\work\\Pump.JSON'), 'C:\\work\\Pump.adia');
assert.strictEqual(normalizeAdiaPath('C:\\work\\Pump.ADIA'), 'C:\\work\\Pump.ADIA');

// 2. Argument extraction tests
const existing = new Set(['C:\\work\\Pump.adia']);
const deps = {
  resolvePath: (value) => value,
  existsSync: (value) => existing.has(value),
  statSync: () => ({ isFile: () => true }),
};
assert.strictEqual(
  extractAdiaPath(['adia.exe', '--squirrel-firstrun', 'C:\\work\\Pump.adia'], deps),
  'C:\\work\\Pump.adia'
);
assert.strictEqual(extractAdiaPath(['adia.exe', 'C:\\work\\Pump.json'], deps), null);

// 3. Read and atomic write tests using temp directory
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adia-project-test-'));

try {
  const sampleData = { version: '1.0', states: [] };
  const savedPath = writeProjectFile(path.join(tempDir, 'Pump.json'), sampleData);
  assert.strictEqual(path.extname(savedPath), '.adia');
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(savedPath, 'utf8')), sampleData);
  assert.deepStrictEqual(readProjectFile(savedPath).data, sampleData);

  // Legacy JSON handling
  const legacyPath = path.join(tempDir, 'legacy.json');
  fs.writeFileSync(legacyPath, JSON.stringify({ projectName: 'Legacy' }), 'utf8');
  assert.throws(() => readProjectFile(legacyPath), /extension/i);
  assert.deepStrictEqual(
    readProjectFile(legacyPath, { allowLegacyJson: true }).data,
    { projectName: 'Legacy' }
  );

  // Size limit check
  const hugePath = path.join(tempDir, 'huge.adia');
  const fakeHugeStatsFs = {
    statSync: () => ({ isFile: () => true, size: MAX_PROJECT_BYTES + 1 }),
    readFileSync: () => '{}',
  };
  assert.throws(
    () => readProjectFile(hugePath, { fsImpl: fakeHugeStatsFs }),
    /50 MB limit/i
  );

  // Atomic write failure cleanup test
  const targetPath = path.join(tempDir, 'failing.adia');
  const failingFs = {
    writeFileSync: fs.writeFileSync,
    existsSync: fs.existsSync,
    unlinkSync: fs.unlinkSync,
    renameSync: () => {
      throw new Error('Disk error during rename');
    },
  };
  assert.throws(
    () => writeProjectFile(targetPath, sampleData, { fsImpl: failingFs }),
    /Disk error/i
  );
  assert.strictEqual(fs.existsSync(targetPath), false);
  const remainingFiles = fs.readdirSync(tempDir);
  assert.strictEqual(remainingFiles.some((f) => f.includes('.tmp-')), false);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('All projectFileService tests PASSED successfully.');
