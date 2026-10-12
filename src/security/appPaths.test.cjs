'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { resolveAppPaths } = require('./appPaths.cjs');

// Packaged shape: read-only resources, writable userData, never cwd.
{
  const p = resolveAppPaths({
    isPackaged: true,
    resourcesPath: path.join('C:', 'Program Files', 'ADIA', 'resources'),
    userDataPath: path.join('C:', 'Users', 'u', 'AppData', 'Roaming', 'ADIA'),
    cwd: path.join('C:', 'Windows', 'System32'),
  });
  const res = path.join('C:', 'Program Files', 'ADIA', 'resources');
  const ud = path.join('C:', 'Users', 'u', 'AppData', 'Roaming', 'ADIA');
  assert.equal(p.bundledToolchainsDir, path.join(res, 'toolchains'));
  assert.equal(p.targetPacksDir, path.join(res, 'target-packs'));
  assert.equal(p.vendorDir, path.join(res, 'vendor'));
  assert.equal(p.userToolchainsDir, path.join(ud, 'toolchains'));
  assert.equal(p.hilBuildDir, path.join(ud, 'hil_build'));
  for (const v of Object.values(p)) assert.ok(!v.includes('System32'), `cwd leaked into ${v}`);
}

// Dev shape: repo-relative read-only assets, userData for writable ones.
{
  const cwd = path.resolve('/repo');
  const ud = path.resolve('/home/u/.config/ADIA');
  const p = resolveAppPaths({ isPackaged: false, resourcesPath: '/ignored', userDataPath: ud, cwd });
  assert.equal(p.bundledToolchainsDir, path.join(cwd, 'toolchains'));
  assert.equal(p.targetPacksDir, path.join(cwd, 'target-packs'));
  assert.equal(p.vendorDir, path.join(cwd, 'vendor'));
  assert.equal(p.userToolchainsDir, path.join(ud, 'toolchains'));
  assert.equal(p.hilBuildDir, path.join(ud, 'hil_build'));
}

// hil_build is never derived from cwd, even in dev.
{
  const p = resolveAppPaths({ isPackaged: false, resourcesPath: '', userDataPath: '/ud', cwd: '/cwd' });
  assert.ok(!p.hilBuildDir.startsWith(path.resolve('/cwd')));
}

// Result is frozen and inputs are validated.
{
  const p = resolveAppPaths({ isPackaged: false, resourcesPath: '', userDataPath: '/ud', cwd: '/cwd' });
  assert.ok(Object.isFrozen(p));
  assert.throws(() => resolveAppPaths({ isPackaged: true, resourcesPath: '', userDataPath: '/ud', cwd: '/c' }), /resourcesPath/);
  assert.throws(() => resolveAppPaths({ isPackaged: false, resourcesPath: '', userDataPath: '', cwd: '/c' }), /userDataPath/);
  assert.throws(() => resolveAppPaths({ isPackaged: false, resourcesPath: '', userDataPath: '/ud', cwd: '' }), /cwd/);
}

console.log('appPaths tests passed!');
