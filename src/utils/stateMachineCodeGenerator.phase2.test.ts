import { describe, expect, it } from 'vitest';
import { generateMISRACCode } from './stateMachineCodeGenerator';
import {
  historyFixture,
  interpreterFixture,
  nestedAndFixture,
  parallelHistoryFixture,
} from './stateMachine/smFixtures';

const generated = (
  model: Parameters<typeof generateMISRACCode>[0],
  name: string,
): string => {
  const result = generateMISRACCode(model);
  expect(result.errors).toEqual([]);
  return result.files.find((file) => file.name === name)!.content;
};

describe('StateMachineCodeGenerator structured backend remediation', () => {
  it('uses the semantic active-slot allocation for layer constants', () => {
    const config = generated(nestedAndFixture(), 'sm_config.h');
    expect(config).toContain('#define SM_LYR_ROOT_IDX 0U');
    expect(config).toContain('#define SM_LYR_PARALLEL_IDX 1U');
    expect(config).toContain('#define SM_NUM_ACTIVE_SLOTS 1U');
  });

  it('emits deterministic transition priority order', () => {
    const core = generated(
      interpreterFixture('transition-priority'),
      'sm_core.c',
    );
    const first = core.indexOf('(instance->active_states[0U] != SM_ST_C)');
    expect(first).toBeGreaterThan(-1);
    expect(core).not.toContain('(instance->active_states[0U] != SM_ST_B)');
  });

  it('distinguishes external self-transition and internal action-only code', () => {
    const external = generated(interpreterFixture('external-self'), 'sm_core.c');
    expect(external).toContain('SM_Exit_State(instance, SM_ST_A, true);');
    expect(external).toContain('SM_ST_A_Entry(instance);');

    const internal = generated(interpreterFixture('internal-action'), 'sm_core.c');
    expect(internal).toContain(
      'instance->data.counter = (double)((instance->data.counter + 1.0));',
    );
    const action = internal.indexOf('instance->data.counter =');
    expect(internal.slice(Math.max(0, action - 300), action)).not.toContain(
      'SM_Exit_State(instance, SM_ST_A',
    );
  });

  it('renders explicit shallow and deep history storage and restoration', () => {
    const shallow = generated(historyFixture('shallow'), 'sm_core.c');
    const deep = generated(historyFixture('deep'), 'sm_core.c');
    expect(shallow).toContain('instance->history_states[');
    expect(shallow).toContain('SM_Enter_Layer_Default');
    expect(deep).toContain('instance->deep_history[');
    expect(deep).toContain('SM_Restore_State_');
  });

  it('enters AND children forward and exits them in reverse priority', () => {
    const core = generated(
      parallelHistoryFixture('parallel-parent-exit'),
      'sm_core.c',
    );
    const enterR1 = core.indexOf('SM_ST_R1_Entry(instance);');
    const enterR2 = core.indexOf('SM_ST_R2_Entry(instance);');
    const enterR3 = core.indexOf('SM_ST_R3_Entry(instance);');
    expect(enterR1).toBeLessThan(enterR2);
    expect(enterR2).toBeLessThan(enterR3);

    const exitLayer = core.indexOf('case SM_LYR_PARALLEL_REGIONS_IDX:');
    const exitR3 = core.indexOf('SM_Exit_State(instance, SM_ST_R3, false);', exitLayer);
    const exitR2 = core.indexOf('SM_Exit_State(instance, SM_ST_R2, false);', exitLayer);
    const exitR1 = core.indexOf('SM_Exit_State(instance, SM_ST_R1, false);', exitLayer);
    expect(exitR3).toBeLessThan(exitR2);
    expect(exitR2).toBeLessThan(exitR1);
  });

  it('clears active slots, timers, activity, deep history, and error on reset', () => {
    const core = generated(historyFixture('deep'), 'sm_core.c');
    const reset = core.slice(core.indexOf('SM_Error_t SM_Reset'));
    expect(reset).toContain('instance->active_states[layer_index] = SM_NODE_INVALID;');
    expect(reset).toContain('instance->history_states[layer_index] = SM_NODE_INVALID;');
    expect(reset).toContain('instance->deep_history[layer_index][state_index] = false;');
    expect(reset).toContain('instance->state_active[state_index] = false;');
    expect(reset).toContain('instance->state_timers[state_index] = 0U;');
    expect(reset).toContain('instance->error_status = SM_ERR_NONE;');
  });

  it('keeps MCAL declarations visible and Sync_IO as a compatibility wrapper', () => {
    const mcal = generated(nestedAndFixture(), 'mcal_dio.h');
    const core = generated(nestedAndFixture(), 'sm_core.c');
    expect(mcal).toContain('bool MCAL_Dio_ReadChannel(uint32_t channel);');
    expect(mcal).toContain('void MCAL_Dio_WriteChannel(uint32_t channel, bool level);');
    expect(mcal).toContain('void MCAL_ApplySafeOutputs(void);');
    expect(mcal).toContain('void MCAL_Watchdog_Kick(void);');
    expect(core).toContain('SM_Error_t error = SM_ReadInputs(instance);');
    expect(core).toContain('error = SM_WriteOutputs(instance);');
  });

  it('contains no terminal-driven reset or generated-text repair markers', () => {
    const core = generated(
      parallelHistoryFixture('parallel-terminal'),
      'sm_core.c',
    );
    expect(core).not.toContain('Terminal / End State: auto-reset');
    expect(core).not.toContain('Syntactic Auto-Repair');
    expect(core).not.toMatch(/SM_Is_Terminal_State[\s\S]*SM_Reset/);
  });
});
