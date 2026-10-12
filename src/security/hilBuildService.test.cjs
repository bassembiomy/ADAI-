'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { HilBuildService } = require('./hilBuildService.cjs');

async function runTests() {
  console.log('Running hilBuildService tests...');

  const service = new HilBuildService();

  const validWorkspace = {
    buildId: 'BUILD_12345678',
    sourceManifestHash: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
    targetSelection: {
      targetId: 'stm32f407vgt6',
      packVersion: '1.0.0',
      driverMode: 'vendor',
      boardRevision: 'A',
    },
    flashBlocked: false,
    files: [
      'sm_mapping.c', 'sm_core.c', 'sm_safety.c', 'sm_user_logic.c', 'hal_drivers.c',
      'hil_interface.c', 'mcal_dio_hil.c', 'adia_mcal.c', 'adia_component.c',
      'main_hil.c',
    ],
  };

  const validRequest = {
    buildId: 'BUILD_12345678',
    sourceManifestHash: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
    targetSelection: {
      targetId: 'stm32f407vgt6',
      packVersion: '1.0.0',
      driverMode: 'vendor',
      boardRevision: 'A',
    },
  };

  // Test 1: Rejects request with unexpected field (e.g. flags: ['-DATTACK'])
  await assert.rejects(
    () => service.build({ ...validRequest, flags: ['-DATTACK'] }, validWorkspace),
    error => error.code === 'UNEXPECTED_BUILD_FIELD'
  );

  // Test 2: Rejects build request when target selection does not match workspace
  await assert.rejects(
    () => service.build({
      ...validRequest,
      targetSelection: { ...validRequest.targetSelection, targetId: 'stm32f103c8t6' },
    }, validWorkspace),
    error => error.code === 'TARGET_MISMATCH'
  );

  const crypto = require('node:crypto');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hil-service-test-'));
  try {
    const contents = validWorkspace.files.map(name => ({name, content: '// generated'}));
    contents.forEach(file => fs.writeFileSync(path.join(dir, file.name), file.content));
    const canonical = contents.sort((a,b) => a.name.localeCompare(b.name)).map(f => f.name+'\0'+f.content.length+'\0'+f.content).join('\0');
    const sourceManifestHash = 'sha256:'+crypto.createHash('sha256').update(canonical).digest('hex');
    const saved = {...validWorkspace, buildDir: dir, sourceManifestHash};
    const req = {...validRequest, sourceManifestHash};
    let received;
    const production = new HilBuildService({buildProductionProject: async options => {
      received = options;
      return {success: true, elfPath: path.join(dir,'firmware.elf'), hexPath: path.join(dir,'firmware.hex'), flashImages: [{path: path.join(dir,'firmware.hex'),sha256:'a'.repeat(64)}], inspection: {valid:true, evidence:'tool-output', hashes:{elf:'sha256:'+'a'.repeat(64)},memory:{flashUsed:32}},logs:[]};
    }});
    const record = await production.build(req, saved, {repoRoot:'/repo'});
    assert.equal(received.projectDir, dir);
    assert.equal(received.repoRoot, '/repo');
    assert.deepEqual(received.files, saved.files);
    assert.notEqual(received.files, saved.files, 'runtime gets an independent exact source snapshot');
    assert.equal(record.status, 'LINKED_IMAGE_VERIFIED');
    assert.equal(record.artifacts.hexPath, path.join(dir,'firmware.hex'));
    assert.equal(record.artifacts.flashImages.length, 1);
    const failed = new HilBuildService({buildProductionProject: async () => ({success:true,inspection:{valid:false},logs:[]})});
    const failedRecord = await failed.build(req,saved);
    assert.equal(failedRecord.status,'BUILD_FAILED');
    assert.equal(failedRecord.flashBlocked,true);
    const injected = new HilBuildService({buildProductionProject: async () => ({success:true,elfPath:'firmware.elf',flashImages:[{path:'firmware.hex'}],inspection:{valid:true,evidence:'injected'},logs:[]})});
    const injectedRecord = await injected.build(req,saved);
    assert.equal(injectedRecord.status,'BUILD_FAILED');
    assert.equal(injectedRecord.flashBlocked,true);
    const hostSaved={...saved,targetSelection:{...saved.targetSelection,targetId:'generic-host'},flashBlocked:true};
    let hostOptions;
    const hostService=new HilBuildService({buildHostSimulation:async options=>{hostOptions=options;return {success:true,hostSimulationVerified:true,exePath:'firmware.exe',inspection:{valid:true,evidence:'tool-output',hashes:{elf:'sha256:'+'c'.repeat(64)},memory:{flashUsed:42}},logs:[]};},buildProductionProject:async()=>{throw new Error('must not build host with vendor runtime');}});
    const hostRecord=await hostService.build({...req,targetSelection:hostSaved.targetSelection},hostSaved);
    assert.equal(hostRecord.status,'HOST_SIMULATION_VERIFIED');
    assert.equal(hostRecord.flashBlocked,true);
    assert.equal(hostRecord.artifacts.exePath,'firmware.exe');
    assert.equal(hostRecord.artifacts.flashImages.length,0);
    assert.deepEqual(hostOptions.files,hostSaved.files);
    fs.writeFileSync(path.join(dir,'sm_core.c'),'changed source');
    await assert.rejects(() => production.build(req,saved), error => error.code === 'STALE_SOURCE_MANIFEST');
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
  console.log('hilBuildService tests passed!');
}

runTests().catch(err => {
  console.error('hilBuildService tests failed:', err);
  process.exit(1);
});
