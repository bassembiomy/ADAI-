#!/usr/bin/env node
'use strict';
const path = require('node:path');
const { verifyRuntimeBundle } = require('../src/security/hilRuntime.cjs');
const index = process.argv.indexOf('--resources-path');
const resources = index >= 0 ? process.argv[index + 1] : path.resolve(__dirname, '..');
try {
  const result = verifyRuntimeBundle(path.join(resources, 'toolchains/hil-runtime'), { deep: true });
  console.log(`Production vendor runtime verified: ${result.files.length} files, ${result.targets.join(', ')}`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
