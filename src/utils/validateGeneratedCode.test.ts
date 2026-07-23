import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  parseCEnum,
  parseCStruct,
  parseCMacros,
  parseFunctionSignatures,
  extractFunctionCalls,
  validateTR01,
  validateTR02,
  validateTR03,
  validateTR04,
  validateTR05,
  validateTR07,
  runValidationPipeline
} from '../../scripts/validate_generated_code';

const TEMP_TEST_DIR = path.join(__dirname, '../../scratch/test_validator_output');

const mockModel = {
  states: [
    { name: 'Idle' },
    { name: 'Active' }
  ],
  variables: [
    { name: 'in_sensor', type: 'float', isInput: true },
    { name: 'out_led', type: 'bool', isOutput: true },
    { name: 'counter', type: 'uint16_t' }
  ]
};

describe('ADIA C-Code Validator Pipeline', () => {
  beforeEach(() => {
    if (!fs.existsSync(TEMP_TEST_DIR)) {
      fs.mkdirSync(TEMP_TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(TEMP_TEST_DIR)) {
      fs.rmSync(TEMP_TEST_DIR, { recursive: true, force: true });
    }
  });

  it('should parse C enums, structs, macros, and signatures correctly', () => {
    const enumStr = `
      typedef enum {
          SM_NODE_INVALID = 0U,
          SM_ST_IDLE = 1U,
          SM_ST_ACTIVE = 2U
      } SM_Node_t;
    `;
    const enumMap = parseCEnum(enumStr, 'SM_Node_t');
    expect(enumMap.get('SM_ST_IDLE')).toBe(1);
    expect(enumMap.get('SM_ST_ACTIVE')).toBe(2);

    const structStr = `
      typedef struct {
          volatile float in_sensor;
          volatile bool out_led;
          volatile uint16_t counter;
      } SM_Data_t;
    `;
    const structMembers = parseCStruct(structStr, 'SM_Data_t');
    expect(structMembers).toHaveLength(3);
    expect(structMembers[0]).toEqual({ type: 'float', name: 'in_sensor' });

    const macroStr = `
      #define SM_ST_IDLE_IDX (1U)
      #define SM_ST_ACTIVE_IDX 2U
    `;
    const macroMap = parseCMacros(macroStr);
    expect(macroMap.get('SM_ST_IDLE_IDX')).toBe('1U');
    expect(macroMap.get('SM_ST_ACTIVE_IDX')).toBe('2U');

    const signatureStr = `
      void SM_Init(ADIA_Instance_t* instance);
      void SM_ST_IDLE_Entry(ADIA_Instance_t* instance);
      void SM_Step(ADIA_Instance_t* instance, uint32_t delta_ms);
    `;
    const sigs = parseFunctionSignatures(signatureStr);
    expect(sigs).toHaveLength(3);
    expect(sigs[0].name).toBe('SM_Init');
    expect(sigs[0].params[0]).toBe('ADIA_Instance_t* instance');
  });

  it('TR-01: should validate duplicate macro/guard definitions', () => {
    // Correct file
    fs.writeFileSync(path.join(TEMP_TEST_DIR, 'sm_config.h'), `
      #ifndef SM_CONFIG_H
      #define SM_CONFIG_H
      #define SM_NUM_STATES (2U)
      #endif
    `);
    let res = validateTR01(TEMP_TEST_DIR);
    expect(res.success).toBe(true);

    // Duplicate macro definition
    fs.writeFileSync(path.join(TEMP_TEST_DIR, 'sm_config.h'), `
      #ifndef SM_CONFIG_H
      #define SM_CONFIG_H
      #define SM_NUM_STATES (2U)
      #define SM_NUM_STATES (3U)
      #endif
    `);
    res = validateTR01(TEMP_TEST_DIR);
    expect(res.success).toBe(false);
    expect(res.errors[0]).toContain('Duplicate macro definitions');
  });

  it('TR-02: should validate enum index alignment', () => {
    // Aligned
    fs.writeFileSync(path.join(TEMP_TEST_DIR, 'sm_config.h'), `
      typedef enum {
          SM_NODE_INVALID = 0,
          SM_ST_IDLE = 1,
          SM_ST_ACTIVE = 2
      } SM_Node_t;
      #define SM_ST_IDLE_IDX 1U
      #define SM_ST_ACTIVE_IDX 2U
    `);
    let res = validateTR02(TEMP_TEST_DIR, mockModel);
    expect(res.success).toBe(true);

    // Misaligned
    fs.writeFileSync(path.join(TEMP_TEST_DIR, 'sm_config.h'), `
      typedef enum {
          SM_NODE_INVALID = 0,
          SM_ST_IDLE = 1,
          SM_ST_ACTIVE = 2
      } SM_Node_t;
      #define SM_ST_IDLE_IDX 0U
      #define SM_ST_ACTIVE_IDX 2U
    `);
    res = validateTR02(TEMP_TEST_DIR, mockModel);
    expect(res.success).toBe(false);
    expect(res.errors[0]).toContain('Mismatched value');
  });

  it('TR-03: should validate signature pointer consistency', () => {
    // Consistent pointers
    fs.writeFileSync(path.join(TEMP_TEST_DIR, 'sm_core.h'), `
      void SM_Init(ADIA_Instance_t* instance);
    `);
    fs.writeFileSync(path.join(TEMP_TEST_DIR, 'sm_core.c'), `
      void SM_Init(ADIA_Instance_t* instance) {}
    `);
    fs.writeFileSync(path.join(TEMP_TEST_DIR, 'sm_safety.h'), `
      void SM_Safety_Check(ADIA_Instance_t* instance);
      void SM_Watchdog_Kick(ADIA_Instance_t* instance);
      SM_Error_t SM_Validate_State_Consistency(const ADIA_Instance_t* instance);
    `);
    fs.writeFileSync(path.join(TEMP_TEST_DIR, 'sm_safety.c'), `
      void SM_Safety_Check(ADIA_Instance_t* instance) {}
      void SM_Watchdog_Kick(ADIA_Instance_t* instance) {}
      SM_Error_t SM_Validate_State_Consistency(const ADIA_Instance_t* instance) { return 0; }
    `);
    let res = validateTR03(TEMP_TEST_DIR);
    expect(res.success).toBe(true);

    // Mismatched signature: pass-by-value in sm_safety.c
    fs.writeFileSync(path.join(TEMP_TEST_DIR, 'sm_safety.c'), `
      void SM_Safety_Check(ADIA_Instance_t instance) {}
      void SM_Watchdog_Kick(ADIA_Instance_t* instance) {}
      SM_Error_t SM_Validate_State_Consistency(const ADIA_Instance_t* instance) { return 0; }
    `);
    res = validateTR03(TEMP_TEST_DIR);
    expect(res.success).toBe(false);
    expect(res.errors[0]).toContain('does not use pass-by-pointer');
  });

  it('TR-04: should validate phantom variables', () => {
    // Correct variables
    fs.writeFileSync(path.join(TEMP_TEST_DIR, 'sm_config.h'), `
      typedef struct {
          volatile float in_sensor;
          volatile bool out_led;
          volatile uint16_t counter;
      } SM_Data_t;
    `);
    let res = validateTR04(TEMP_TEST_DIR, mockModel);
    expect(res.success).toBe(true);

    // Struct contains phantom variable 'x'
    fs.writeFileSync(path.join(TEMP_TEST_DIR, 'sm_config.h'), `
      typedef struct {
          volatile float in_sensor;
          volatile bool out_led;
          volatile uint16_t counter;
          volatile int32_t x;
      } SM_Data_t;
    `);
    res = validateTR04(TEMP_TEST_DIR, mockModel);
    expect(res.success).toBe(false);
    expect(res.errors.some(e => e.includes('phantom variable'))).toBe(true);
  });

  it('TR-05: should validate I/O binding safety', () => {
    // Safe binding
    fs.writeFileSync(path.join(TEMP_TEST_DIR, 'sm_core.c'), `
      SM_Error_t SM_Sync_IO(ADIA_Instance_t* instance) {
          instance->data.in_sensor = (float)MCAL_Dio_ReadChannel(MCAL_PIN_INPUT_0);
          MCAL_Dio_WriteChannel(MCAL_PIN_OUTPUT_0, instance->data.out_led);
          return SM_ERR_NONE;
      }
    `);
    let res = validateTR05(TEMP_TEST_DIR, mockModel);
    expect(res.success).toBe(true);

    // Unsafe LHS binding: writing input to internal variable 'counter'
    fs.writeFileSync(path.join(TEMP_TEST_DIR, 'sm_core.c'), `
      SM_Error_t SM_Sync_IO(ADIA_Instance_t* instance) {
          instance->data.counter = (uint16_t)MCAL_Dio_ReadChannel(MCAL_PIN_INPUT_0);
          return SM_ERR_NONE;
      }
    `);
    res = validateTR05(TEMP_TEST_DIR, mockModel);
    expect(res.success).toBe(false);
    expect(res.errors[0]).toContain('is not flagged as input');
  });

  it('TR-07: should validate MCAL interface contract', () => {
    // Matching declarations
    fs.writeFileSync(path.join(TEMP_TEST_DIR, 'sm_core.c'), `
      void SM_Step(ADIA_Instance_t* instance) {
          MCAL_Dio_ReadChannel(1);
      }
    `);
    fs.writeFileSync(path.join(TEMP_TEST_DIR, 'mcal_dio.h'), `
      bool MCAL_Dio_ReadChannel(uint32_t channel);
    `);
    let res = validateTR07(TEMP_TEST_DIR);
    expect(res.success).toBe(true);

    // Undefined MCAL function call
    fs.writeFileSync(path.join(TEMP_TEST_DIR, 'sm_core.c'), `
      void SM_Step(ADIA_Instance_t* instance) {
          MCAL_Unregistered_Call();
      }
    `);
    res = validateTR07(TEMP_TEST_DIR);
    expect(res.success).toBe(false);
    expect(res.errors[0]).toContain('missing a prototype declaration');
  });

  it('should run the entire validation pipeline successfully on a valid mock generated setup', () => {
    fs.writeFileSync(path.join(TEMP_TEST_DIR, 'sm_config.h'), `
      #ifndef SM_CONFIG_H
      #define SM_CONFIG_H
      #include <stdint.h>
      #include <stdbool.h>
      typedef enum {
          SM_ERR_NONE = 0
      } SM_Error_t;
      typedef enum {
          SM_NODE_INVALID = 0,
          SM_ST_IDLE = 1,
          SM_ST_ACTIVE = 2
      } SM_Node_t;
      #define SM_ST_IDLE_IDX 1U
      #define SM_ST_ACTIVE_IDX 2U
      typedef struct {
          volatile float in_sensor;
          volatile bool out_led;
          volatile uint16_t counter;
      } SM_Data_t;
      typedef struct {
          SM_Data_t data;
      } ADIA_Instance_t;
      #endif
    `);
    fs.writeFileSync(path.join(TEMP_TEST_DIR, 'sm_core.h'), `
      #ifndef SM_CORE_H
      #define SM_CORE_H
      #include "sm_config.h"
      void SM_Init(ADIA_Instance_t* instance);
      SM_Error_t SM_Sync_IO(ADIA_Instance_t* instance);
      #endif
    `);
    fs.writeFileSync(path.join(TEMP_TEST_DIR, 'sm_core.c'), `
      #include "sm_core.h"
      #include "mcal_dio.h"
      void SM_Init(ADIA_Instance_t* instance) {
          (void)instance;
      }
      SM_Error_t SM_Sync_IO(ADIA_Instance_t* instance) {
          instance->data.in_sensor = (float)MCAL_Dio_ReadChannel(0);
          MCAL_Dio_WriteChannel(1, instance->data.out_led);
          return SM_ERR_NONE;
      }
    `);
    fs.writeFileSync(path.join(TEMP_TEST_DIR, 'mcal_dio.h'), `
      #ifndef MCAL_DIO_H
      #define MCAL_DIO_H
      #include <stdint.h>
      #include <stdbool.h>
      bool MCAL_Dio_ReadChannel(uint32_t channel);
      void MCAL_Dio_WriteChannel(uint32_t channel, bool level);
      #endif
    `);
    fs.writeFileSync(path.join(TEMP_TEST_DIR, 'sm_user_logic.h'), '');
    fs.writeFileSync(path.join(TEMP_TEST_DIR, 'sm_user_logic.c'), '');

    const modelPath = path.join(TEMP_TEST_DIR, 'model.json');
    fs.writeFileSync(modelPath, JSON.stringify(mockModel));

    const pipelineRes = runValidationPipeline(modelPath, TEMP_TEST_DIR);
    expect(pipelineRes.success).toBe(true);
  });
});
