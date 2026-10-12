'use strict';
const assert=require('node:assert/strict');
const {validateProductionConfigurationFiles,buildHostSimulation}=require('./hilRuntime.cjs');
const sources=['sm_core.c','sm_mapping.c','sm_user_logic.c','sm_safety.c','adia_mcal.c','adia_component.c','hal_drivers.c','hil_interface.c','mcal_dio_hil.c','main_hil.c'];
const ini='[platformio]\nsrc_dir = .\ninclude_dir = .\n[env:generic]\nplatform = native\nbuild_flags =\n-I.\n-Wl,-Map,firmware.map\nbuild_src_filter = -<*> '+sources.map(name=>'+<'+name+'>').join(' ')+'\n';
assert.doesNotThrow(()=>validateProductionConfigurationFiles([{name:'platformio.ini',content:ini}],'generic-host'));
assert.throws(()=>validateProductionConfigurationFiles([{name:'platformio.ini',content:ini+'extra_scripts = evil.py\n'}],'generic-host'),/UNTRUSTED_BUILD_CONFIGURATION/);
assert.equal(typeof buildHostSimulation,'function');
buildHostSimulation({targetId:'atmega328p'}).then(result=>{assert.equal(result.success,false);assert.equal(result.code,'HIL_UNSUPPORTED_HOST_TARGET');console.log('hilHostSimulation tests passed');}).catch(error=>{console.error(error);process.exitCode=1;});

const ui=require('node:fs').readFileSync(require('node:path').resolve(__dirname,'../components/hil/HILWorkspace.tsx'),'utf8');
assert.match(ui,/compileRes\.hostSimulationVerified/);
assert.doesNotMatch(ui,/Checked 14 static variables|MISRA Rule 20\.1 .*Passed|MISRA Rule 8\.4 .*Passed/);

