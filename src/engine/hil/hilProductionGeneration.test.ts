import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { validateProductionConfigurationFiles } = require('../../security/hilRuntime.cjs');
import { generateMISRACCode } from '../../utils/stateMachineCodeGenerator';
import { generateHALCode } from './hilCodeGenerator';
import type { HILConfig, TargetMCU } from './hilTypes';
const config = (target: TargetMCU): HILConfig => ({ enabled: true, target, baudRate: 115200, clockSpeed:16, commPort:'', channels:[], mappings:[] });
describe('production HIL projects', () => {
  it.each([['Arduino_Uno','atmelavr@5.1.0'],['Arduino_Mega','atmelavr@5.1.0'],['ESP32','espressif32@6.9.0'],['STM32F1','ststm32@19.0.0'],['STM32F4','ststm32@19.0.0']] as const)('pins %s runtime and selects root production sources', (target, platform) => {
    const files = generateHALCode(config(target), []);
    const ini = files.find(f => f.name === 'platformio.ini')!.content;
    const ids = { Arduino_Uno:'atmega328p', Arduino_Mega:'atmega2560', ESP32:'esp32-wroom-32', STM32F1:'stm32f103c8t6', STM32F4:'stm32f407vgt6' };
    expect(() => validateProductionConfigurationFiles(files, ids[target])).not.toThrow();
    expect(ini).toContain(platform);
    expect(ini).toContain('src_dir = .');
    expect(ini).toContain('build_src_filter = -<*>');
    expect(ini).not.toContain('+<main.c>');
    expect(files.find(f => f.name === 'hal_drivers.h')!.content).toContain('extern "C"');
  });
  it.each(['STM32F1','STM32F4'] as const)('provides %s system tick and clock', target => {
    const files=generateHALCode(config(target), []);
    expect(files.find(f=>f.name==='stm32_runtime.c')?.content).toContain('SysTick_Handler');
    expect(files.find(f=>f.name==='stm32_runtime.c')?.content).toContain('SystemClock_Config');
  });
});

it('exports firmware I/O across the C boundary', () => {
 const result=generateMISRACCode({ states: [{id:'s1',name:'Idle',parentId:'root',children:[],autostart:true,entry:'',during:'',exit:'',isParallel:false,regionId:'MAIN',priority:1}], transitions: [], junctions: [], variables: [], layers: [{id:'root',name:'root',parentStateId:null,stateIds:['s1'],transitionIds:[],junctionIds:[]}], hilConfig:config('Arduino_Uno'), safetyMode:false, tickMs:10 } as any);
 expect(result.errors).toEqual([]);
 const header=result.files.find(f=>f.name==='sm_core.h')!.content;
 expect(header).toContain('SM_Error_t SM_ReadInputs(');
 expect(header).toContain('extern "C"');
});


it('identifies real generated scalar drivers even for legacy bare-metal selections', () => {
 const selected={...config('STM32F4'),targetSelection:{targetId:'stm32f407vgt6',packVersion:'1.0.0',driverMode:'bare-metal',boardRevision:'A'},channels:[{id:'led',name:'led',peripheral:'GPIO',pin:'PD12',direction:'Out',dataType:'bool',rangeMin:0,rangeMax:1,scalingFactor:1,unit:''}]} as HILConfig;
 const manifest=JSON.parse(generateHALCode(selected,[]).find(f=>f.name==='integration_manifest.json')!.content);
 expect(manifest.flashBlocked).toBe(false);
 expect(manifest.targetSelection.driverMode).toBe('vendor');
});
it('rejects fake peripheral operations in production', () => {
 const cfg={...config('Arduino_Uno'),channels:[{id:'dac',name:'dac',peripheral:'DAC',pin:'3',direction:'Out',dataType:'uint8_t',rangeMin:0,rangeMax:255,scalingFactor:1,unit:''}]} as HILConfig;
 const errors:string[]=[];
 expect(generateHALCode(cfg,[],[],errors)).toEqual([]);
 expect(errors.join(' ')).toContain('Unsupported production peripheral');
});

it.each([['STM32F4','GPIO','PA2','Out'],['STM32F1','PWM','PB0','Out'],['Arduino_Uno','PWM','4','Out'],['ESP32','DAC','27','Out'],['STM32F4','ADC','PD12','In'],['ESP32','ADC','2','Out']] as const)('rejects unsupported %s %s pin %s direction %s', (target,peripheral,pin,direction) => {
 const errors:string[]=[];
 const files=generateHALCode({...config(target),channels:[{id:'ch',name:'ch',peripheral,pin,direction,dataType:'uint16_t',rangeMin:0,rangeMax:255,scalingFactor:1,unit:''}]},[],[],errors);
 expect(files).toEqual([]);
 expect(errors.length).toBeGreaterThan(0);
});

it('blocks flashing explicitly requested simulation shims even for supported channels', () => {
 const result=generateMISRACCode({states:[{id:'s1',name:'Idle',parentId:'root',children:[],autostart:true,entry:'',during:'',exit:'',isParallel:false,regionId:'MAIN',priority:1}],transitions:[],junctions:[],variables:[],layers:[{id:'root',name:'root',parentStateId:null,stateIds:['s1'],transitionIds:[],junctionIds:[]}],hilConfig:config('Arduino_Uno'),safetyMode:false,tickMs:10} as any,{includeTestShims:true});
 const manifest=JSON.parse(result.files.find(f=>f.name==='integration_manifest.json')!.content);
 expect(manifest.flashBlocked).toBe(true);
 expect(manifest.blockReasons).toContain('SIMULATION_TEST_SHIMS');
});

it('uses converted Arduino entrypoints and family-specific ADC sampling constants', () => {
 expect(generateHALCode(config('Arduino_Uno'),[]).find(f=>f.name==='platformio.ini')!.content).toContain('+<main_hil.ino.cpp>');
});
it('uses the real F1 ADC sampling constant', () => {
 expect(generateHALCode(config('STM32F1'),[]).find(f=>f.name==='hal_drivers.c')!.content).toContain('ADC_SAMPLETIME_71CYCLES_5');
});

it('links AVR float telemetry support', () => {
 const ini=generateHALCode(config('Arduino_Uno'),[]).find(f=>f.name==='platformio.ini')!.content;
 expect(ini).toContain('-Wl,-u,vfprintf');
 expect(ini).toContain('-lprintf_flt');
});

it('parses serial numeric commands with portable libc conversion on AVR', () => {
 const parser=generateHALCode(config('Arduino_Uno'),[]).find(f=>f.name==='hil_interface.c')!.content;
 expect(parser).toContain('strtod(');
 expect(parser).not.toContain('%63[^=]=%f');
});

it.each(['STM32F1','STM32F4'] as const)('links %s newlib nano float telemetry', target => {
 expect(generateHALCode(config(target),[]).find(f=>f.name==='platformio.ini')!.content).toContain('-Wl,-u,_printf_float');
});
