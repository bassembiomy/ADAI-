'use strict';
const { app } = require('electron');
const { handleSquirrelLifecycle } = require('./projectFiles/squirrelLifecycle.cjs');

if (!handleSquirrelLifecycle({ app, argv: process.argv, execPath: process.execPath })) {
  require('./main.cjs');
}
