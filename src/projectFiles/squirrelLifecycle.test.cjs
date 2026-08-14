'use strict';

const assert = require('assert');
const { handleSquirrelLifecycle } = require('./squirrelLifecycle.cjs');

console.log('Running squirrelLifecycle tests...');

(async () => {
  const runTest = (argv) => {
    const actions = [];
    let completionResolve;
    const completion = new Promise((resolve) => {
      completionResolve = resolve;
    });

    const mockApp = {
      quit: () => {
        actions.push('quit');
        if (completionResolve) completionResolve();
      },
    };

    const mockRegister = async (execPath) => {
      actions.push('register');
    };

    const mockUnregister = async (execPath) => {
      actions.push('unregister');
    };

    const mockSpawnUpdate = async (args) => {
      if (args.some((a) => a.startsWith('--createShortcut'))) {
        actions.push('shortcut:create');
      } else if (args.some((a) => a.startsWith('--removeShortcut'))) {
        actions.push('shortcut:remove');
      }
    };

    const handled = handleSquirrelLifecycle({
      app: mockApp,
      argv: ['adia.exe', ...argv],
      execPath: 'C:\\Apps\\ADIA\\adia.exe',
      register: mockRegister,
      unregister: mockUnregister,
      spawnUpdate: mockSpawnUpdate,
    });

    return { handled, actions, completion };
  };

  // Test 1: --squirrel-install
  const t1 = runTest(['--squirrel-install']);
  assert.strictEqual(t1.handled, true);
  await t1.completion;
  assert.deepStrictEqual(t1.actions, ['register', 'shortcut:create', 'quit']);

  // Test 2: --squirrel-updated
  const t2 = runTest(['--squirrel-updated']);
  assert.strictEqual(t2.handled, true);
  await t2.completion;
  assert.deepStrictEqual(t2.actions, ['register', 'shortcut:create', 'quit']);

  // Test 3: --squirrel-uninstall
  const t3 = runTest(['--squirrel-uninstall']);
  assert.strictEqual(t3.handled, true);
  await t3.completion;
  assert.deepStrictEqual(t3.actions, ['unregister', 'shortcut:remove', 'quit']);

  // Test 4: --squirrel-obsolete
  const t4 = runTest(['--squirrel-obsolete']);
  assert.strictEqual(t4.handled, true);
  await t4.completion;
  assert.deepStrictEqual(t4.actions, ['quit']);

  // Test 5: Normal app startup (e.g. adia.exe Pump.adia)
  const t5 = runTest(['Pump.adia']);
  assert.strictEqual(t5.handled, false);
  assert.deepStrictEqual(t5.actions, []);

  console.log('All squirrelLifecycle tests PASSED successfully.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
