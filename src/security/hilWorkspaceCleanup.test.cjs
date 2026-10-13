'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const {removeLegacyTestShims} = require('./hilWorkspaceCleanup.cjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(),'hil-cleanup-test-'));
try {
 fs.copyFileSync(path.resolve(__dirname,'../../hil_build/Arduino.h'),path.join(dir,'Arduino.h'));
 fs.writeFileSync(path.join(dir,'Arduino.cpp'),'// user-authored file');
 fs.writeFileSync(path.join(dir,'notes.txt'),'keep');
 removeLegacyTestShims(dir);
 assert.equal(fs.existsSync(path.join(dir,'Arduino.h')),false);
 assert.equal(fs.readFileSync(path.join(dir,'Arduino.cpp'),'utf8'),'// user-authored file');
 assert.equal(fs.existsSync(path.join(dir,'notes.txt')),true);
 console.log('hilWorkspaceCleanup tests passed');
} finally {fs.rmSync(dir,{recursive:true,force:true});}
