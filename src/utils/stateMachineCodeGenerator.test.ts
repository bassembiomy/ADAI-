import { describe, expect, it } from 'vitest';
import {
  generateMISRACCode,
  validateInitialValue,
} from './stateMachineCodeGenerator';
import {
  flatOrFixture,
  parallelHistoryFixture,
} from './stateMachine/smFixtures';

describe('StateMachineCodeGenerator compatibility facade', () => {
  it('preserves the embedded integration file set', () => {
    const result = generateMISRACCode(flatOrFixture());
    expect(result.errors).toEqual([]);
    expect(result.files.map((file) => file.name)).toEqual([
      'sm_config.h',
      'sm_core.h',
      'sm_core.c',
      'sm_safety.h',
      'sm_safety.c',
      'sm_user_logic.h',
      'sm_user_logic.c',
      'mcal_dio.h',
      'sm_testing_report.md',
    ]);
  });

  it('keeps the public lifecycle and query API', () => {
    const result = generateMISRACCode(flatOrFixture());
    const header = result.files.find((file) => file.name === 'sm_core.h')!.content;
    expect(header).toContain('SM_Error_t SM_Init(ADIA_Instance_t *instance);');
    expect(header).toContain('SM_Error_t SM_Reset(ADIA_Instance_t *instance);');
    expect(header).toContain('SM_Error_t SM_ReadInputs(ADIA_Instance_t *instance);');
    expect(header).toContain('SM_Error_t SM_Step(ADIA_Instance_t *instance, uint32_t delta_ms);');
    expect(header).toContain('SM_Error_t SM_WriteOutputs(ADIA_Instance_t *instance);');
    expect(header).toContain('SM_Error_t SM_Sync_IO(ADIA_Instance_t *instance);');
    expect(header).toContain('SM_Node_t SM_GetActive(');
    expect(header).toContain('SM_Error_t SM_GetError(');
  });

  it('preserves validateInitialValue compatibility', () => {
    expect(validateInitialValue({ type: 'uint8', initialValue: '255' })).toBe('255');
    expect(validateInitialValue({ type: 'uint8', initialValue: '-1' })).toBeNull();
    expect(validateInitialValue({ type: 'bool', initialValue: '1' })).toBe('true');
    expect(validateInitialValue({ type: 'bool', initialValue: 'false' })).toBe('false');
    expect(validateInitialValue({ type: 'float', initialValue: '1e3' })).toBe('1e3');
    expect(validateInitialValue({ type: 'float', initialValue: 'bad' })).toBeNull();
  });

  it('returns semantic diagnostics in the legacy result shape', () => {
    const chart = flatOrFixture();
    chart.variables[0].initialValue = 'not-a-bool';
    const result = generateMISRACCode(chart);
    expect(result.files).toEqual([]);
    expect(result.errors[0]).toMatchObject({
      id: 'VARIABLE_INITIAL_VALUE_INVALID',
      type: 'error',
      source: 'state-machine-semantic-model',
      elementId: 'go',
    });
    expect(result.errors[0].timestamp).toBeInstanceOf(Date);
  });

  it('rejects safety mode without a modeled safe state', () => {
    const chart = flatOrFixture();
    chart.safetyMode = true;
    const result = generateMISRACCode(chart);
    expect(result.files).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].id).toBe('SAFE_STATE_REQUIRED');
  });

  it('does not mutate the caller model', () => {
    const chart = flatOrFixture();
    const before = JSON.stringify(chart);
    generateMISRACCode(chart);
    expect(JSON.stringify(chart)).toBe(before);
  });

  it('honors the existing includeTestShims option', () => {
    const result = generateMISRACCode(flatOrFixture(), {
      includeTestShims: true,
    });
    const mcal = result.files.find((file) => file.name === 'mcal_dio.h')!.content;
    expect(mcal).toContain('#ifdef MCAL_TEST_STUBS');
    expect(mcal).toContain('MCAL_Test_ReadChannel');
    expect(mcal).toContain('MCAL_Test_WriteChannel');
  });

  it('generates typed data fields and AST-rendered actions', () => {
    const result = generateMISRACCode(flatOrFixture());
    const config = result.files.find((file) => file.name === 'sm_config.h')!.content;
    const core = result.files.find((file) => file.name === 'sm_core.c')!.content;
    expect(config).toContain('bool go;');
    expect(config).toContain('double total;');
    expect(core).toContain(
      'instance->data.ratio = (double)((instance->data.total / instance->data.count));',
    );
  });

  it('makes terminal states quiescent instead of resetting the chart', () => {
    const result = generateMISRACCode(
      parallelHistoryFixture('parallel-terminal'),
    );
    const core = result.files.find((file) => file.name === 'sm_core.c')!.content;
    expect(core).not.toContain('Terminal / End State: auto-reset');
    expect(core).not.toMatch(/SM_Is_Terminal_State[\s\S]*SM_Reset/);
    expect(core).toContain('static bool SM_Execute_State_2');
  });

  it('labels report claims by evidence level without claiming certification', () => {
    const result = generateMISRACCode(flatOrFixture());
    const report = result.files.find(
      (file) => file.name === 'sm_testing_report.md',
    )!.content;
    expect(report).toContain('## Structural validation');
    expect(report).toContain('## Semantic validation');
    expect(report).toContain('Host compilation: pending external build gate');
    expect(report).toContain('Formal MISRA compliance and safety certification are not claimed');
  });
});
