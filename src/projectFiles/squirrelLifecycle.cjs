'use strict';

const path = require('path');
const { cp } = require('child_process');
const {
  registerAdiaAssociation,
  unregisterOwnedAdiaAssociation,
} = require('./windowsFileAssociation.cjs');

function defaultSpawnUpdate(execPath, args) {
  return new Promise((resolve) => {
    try {
      const updateDotExe = path.resolve(path.dirname(execPath), '..', 'Update.exe');
      const { spawn } = require('child_process');
      const child = spawn(updateDotExe, args, { detached: true });
      child.on('close', () => resolve());
      child.on('error', () => resolve());
    } catch {
      resolve();
    }
  });
}

function handleSquirrelLifecycle(options = {}) {
  const argv = options.argv || process.argv;
  const execPath = options.execPath || process.execPath;
  const app = options.app;

  if (!Array.isArray(argv) || argv.length < 2) return false;

  const event = argv[1];
  const target = path.basename(execPath);

  const register = options.register || registerAdiaAssociation;
  const unregister = options.unregister || unregisterOwnedAdiaAssociation;
  const spawnUpdate = options.spawnUpdate || ((args) => defaultSpawnUpdate(execPath, args));

  const routes = {
    '--squirrel-install': async () => {
      await register(execPath);
      await spawnUpdate([`--createShortcut=${target}`]);
    },
    '--squirrel-updated': async () => {
      await register(execPath);
      await spawnUpdate([`--createShortcut=${target}`]);
    },
    '--squirrel-uninstall': async () => {
      await unregister(execPath);
      await spawnUpdate([`--removeShortcut=${target}`]);
    },
    '--squirrel-obsolete': async () => {},
  };

  if (typeof routes[event] === 'function') {
    (async () => {
      try {
        await routes[event]();
      } catch (err) {
        console.error(`Squirrel event ${event} error:`, err);
      } finally {
        if (app && typeof app.quit === 'function') {
          app.quit();
        }
      }
    })();
    return true;
  }

  return false;
}

module.exports = {
  handleSquirrelLifecycle,
};
