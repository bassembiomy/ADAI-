'use strict';

const assert = require('assert');
const {
  buildAssociationValues,
  createRegRunner,
  registerAdiaAssociation,
  unregisterOwnedAdiaAssociation,
} = require('./windowsFileAssociation.cjs');

console.log('Running windowsFileAssociation tests...');

(async () => {
  const execPath = 'C:\\Apps\\ADIA\\adia.exe';
  const expected = {
    extensionKey: 'HKCU\\Software\\Classes\\.adia',
    progIdKey: 'HKCU\\Software\\Classes\\ADIA.Project',
    icon: '"C:\\Apps\\ADIA\\adia.exe",0',
    command: '"C:\\Apps\\ADIA\\adia.exe" "%1"',
  };

  assert.deepStrictEqual(buildAssociationValues(execPath), expected);

  // Test 1: Registration issues expected reg commands as arrays without shell invocation
  const calls = [];
  const fakeRunReg = async (args) => {
    calls.push(args);
    return { stdout: '' };
  };

  await registerAdiaAssociation(execPath, { runReg: fakeRunReg });

  assert.ok(calls.length >= 4);
  assert.ok(calls.every(Array.isArray));
  assert.ok(calls.every((args) => !args.join(' ').includes('cmd.exe')));

  // Verify specific reg ADD calls
  assert.ok(calls.some(args => args.includes('HKCU\\Software\\Classes\\.adia') && args.includes('ADIA.Project')));
  assert.ok(calls.some(args => args.includes('HKCU\\Software\\Classes\\ADIA.Project\\shell\\open\\command') && args.includes('"C:\\Apps\\ADIA\\adia.exe" "%1"')));

  // Test 2: Unregistration deletes owned association
  const unregisterCalls = [];
  const ownedRegState = new Map([
    ['HKCU\\Software\\Classes\\.adia', 'ADIA.Project'],
    ['HKCU\\Software\\Classes\\ADIA.Project\\shell\\open\\command', '"C:\\Apps\\ADIA\\adia.exe" "%1"'],
  ]);

  const fakeOwnedRunReg = async (args) => {
    unregisterCalls.push(args);
    const [action, key] = args;
    if (action === 'QUERY') {
      if (ownedRegState.has(key)) {
        return { stdout: `    (Default)    REG_SZ    ${ownedRegState.get(key)}` };
      }
      const err = new Error('The system was unable to find the specified registry key or value.');
      err.code = 1;
      throw err;
    }
    return { stdout: '' };
  };

  await unregisterOwnedAdiaAssociation(execPath, { runReg: fakeOwnedRunReg });

  assert.ok(unregisterCalls.some(args => args[0] === 'DELETE' && args.includes('HKCU\\Software\\Classes\\.adia')));
  assert.ok(unregisterCalls.some(args => args[0] === 'DELETE' && args.includes('HKCU\\Software\\Classes\\ADIA.Project')));

  // Test 3: Unregistration preserves non-owned association
  const preservedCalls = [];
  const foreignRegState = new Map([
    ['HKCU\\Software\\Classes\\.adia', 'Other.App'],
    ['HKCU\\Software\\Classes\\ADIA.Project\\shell\\open\\command', '"C:\\OtherApp\\other.exe" "%1"'],
  ]);

  const fakeForeignRunReg = async (args) => {
    preservedCalls.push(args);
    const [action, key] = args;
    if (action === 'QUERY') {
      if (foreignRegState.has(key)) {
        return { stdout: `    (Default)    REG_SZ    ${foreignRegState.get(key)}` };
      }
    }
    return { stdout: '' };
  };

  await unregisterOwnedAdiaAssociation(execPath, { runReg: fakeForeignRunReg });

  assert.strictEqual(preservedCalls.some(args => args[0] === 'DELETE'), false);

  // Test 4: Missing key cleanup gracefully succeeds
  const missingCalls = [];
  const fakeMissingRunReg = async (args) => {
    missingCalls.push(args);
    const err = new Error('Missing');
    err.code = 1;
    throw err;
  };

  await unregisterOwnedAdiaAssociation(execPath, { runReg: fakeMissingRunReg });
  // No deletion calls if query fails with missing
  assert.strictEqual(missingCalls.some(args => args[0] === 'DELETE'), false);

  // Test 5: Safe runner creates execFile wrapper
  let execFileArgs = null;
  const fakeExecFile = (cmd, args, opts, cb) => {
    execFileArgs = { cmd, args, opts };
    cb(null, 'OK', '');
  };
  const runner = createRegRunner(fakeExecFile);
  const result = await runner(['QUERY', 'HKCU\\Test']);
  assert.strictEqual(result.stdout, 'OK');
  assert.strictEqual(execFileArgs.cmd, 'reg.exe');
  assert.deepStrictEqual(execFileArgs.args, ['QUERY', 'HKCU\\Test']);
  assert.strictEqual(execFileArgs.opts.windowsHide, true);

  console.log('All windowsFileAssociation tests PASSED successfully.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
