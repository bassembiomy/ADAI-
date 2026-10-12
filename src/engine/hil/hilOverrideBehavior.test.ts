import { it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { generateMISRACCode } from '../../utils/stateMachineCodeGenerator';

it('applies serial overrides after semantic input reads, persists, and releases to hardware', () => {
  const result = generateMISRACCode({tickMs:10,safetyMode:false,
    states:[{id:'s1',name:'Monitor',parentId:'root',children:[],entry:'',during:'output_value = input_value;',exit:'',isParallel:false,regionId:'MAIN',priority:1,autostart:true}],
    layers:[{id:'root',name:'root',parentStateId:null,stateIds:['s1'],transitionIds:[],junctionIds:[]}],transitions:[],junctions:[],
    variables:[{id:'v1',name:'input_value',type:'uint16',initialValue:'0',currentValue:0,visibleInScope:true},{id:'v2',name:'output_value',type:'uint16',initialValue:'0',currentValue:0,visibleInScope:true}],
    hilConfig:{enabled:true,target:'Generic',clockSpeed:1,commPort:'',baudRate:115200,
      channels:[{id:'adc',name:'adc',peripheral:'ADC',pin:'0',direction:'In',dataType:'uint16_t',rangeMin:0,rangeMax:1023,scalingFactor:1,unit:''},{id:'pwm',name:'pwm',peripheral:'PWM',pin:'1',direction:'Out',dataType:'uint16_t',rangeMin:0,rangeMax:1023,scalingFactor:1,unit:''}],
      mappings:[{id:'read',adiaVarId:'input_value',channelId:'adc',direction:'read'},{id:'write',adiaVarId:'output_value',channelId:'pwm',direction:'write',safeValue:0}]},
  } as any, {legacyFlatLayout:true});
  expect(result.errors).toEqual([]);
  const main = result.files.find(file => file.name === 'main_hil.c')!.content;
  expect(main).toContain('HIL_ApplyOverrides(&sm_instance);');
  expect(main.indexOf('HIL_ApplyOverrides')).toBeGreaterThan(main.indexOf('SM_ReadInputs'));
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'adia-override-'));
  try {
    for(const file of result.files) if(!file.name.includes('/')) fs.writeFileSync(path.join(dir,file.name),file.content);
    fs.writeFileSync(path.join(dir,'harness.c'), `#include "sm_core.h"
#include "hil_interface.h"
#include <stdio.h>
static unsigned output;
uint32_t HAL_ADC_Read(const char* pin,const char* name) { (void)pin;(void)name;return 7U; }
void HAL_PWM_Write(const char* pin,const char* name,uint32_t value) { (void)pin;(void)name;output=value; }
void HIL_SendString(const char* str) { (void)str; }
static void tick(ADIA_Instance_t* instance) { (void)SM_ReadInputs(instance);HIL_ApplyOverrides(instance);(void)SM_Step(instance,SM_TICK_MS);(void)SM_WriteOutputs(instance);printf("%u ",output); }
int main(void) { ADIA_Instance_t instance; (void)SM_Init(&instance);tick(&instance);HIL_ProcessMessage("adc=321");tick(&instance);tick(&instance);HIL_ProcessMessage("adc_release=1");tick(&instance);return 0; }
`);
    const compiler=path.resolve('toolchains/w64devkit/w64devkit/bin/gcc.exe');
    execFileSync(compiler,['-B'+path.dirname(compiler)+path.sep,'-std=c99','-Wall','-Wextra','-Werror','-I.','sm_mapping.c','sm_core.c','sm_safety.c','sm_user_logic.c','mcal_dio_hil.c','hil_interface.c','harness.c','-o','harness.exe'],{cwd:dir});
    expect(execFileSync(path.join(dir,'harness.exe'),[],{encoding:'utf8'}).trim()).toBe('7 321 321 7');
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
},30000);
