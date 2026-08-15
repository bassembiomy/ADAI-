'use strict';
const assert = require('assert');
const { resolveTargetExecutable } = require('./register_file_association.cjs');

console.log('Running register_file_association tests...');

// 1. Packaged or specified executable override
assert.strictEqual(
  resolveTargetExecutable({ execPath: 'C:\\Program Files\\ADIA\\ADIA.exe', isPackaged: true }),
  'C:\\Program Files\\ADIA\\ADIA.exe'
);

// 2. Fallback to electron or local executable in dev
const devTarget = resolveTargetExecutable({
  execPath: 'C:\\Node\\node.exe',
  electronPath: 'C:\\Project\\node_modules\\electron\\dist\\electron.exe',
  projectDir: 'C:\\Project',
  isPackaged: false,
});
assert.ok(
  typeof devTarget === 'string' && (devTarget.includes('electron.exe') || devTarget.includes('ADIA.exe') || devTarget.includes('node.exe')),
  `Expected valid executable path, got: ${devTarget}`
);

console.log('All register_file_association tests PASSED.');
