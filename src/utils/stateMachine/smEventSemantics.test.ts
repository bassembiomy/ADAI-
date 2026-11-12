import { describe, expect, it } from 'vitest';
import { flatOrFixture, type DifferentialFixture, type DifferentialScenarioStep } from './smFixtures';
import { compileAndRunCTrace, runInterpreterTrace } from './smCHarness';
import { compareSemanticTraces } from './smTrace';
import { buildSemanticModel } from './smSemanticBuilder';
import { generateCArtifacts } from './smCGenerator';
import type { StateMachineModelV5 } from './smModel';

/*
 * Events (Stateflow-style triggers, SysML/UML run-to-completion for local events).
 *
 * Model
 *   model.events: [{ id, name, scope: 'input' | 'local' }]  (declaration order matters)
 *   transition.event: event id or null. A transition with an event is enabled only in a
 *   chart execution where that event is current, and only if its condition/timer part
 *   (if any) also holds. A transition without an event behaves as before: it is enabled
 *   in every chart execution.
 *   Action language: `send(NAME);` queues a local event.
 *
 * Execution of one tick (SM_Step / stepRuntime)
 *   1. State timers advance once per tick (after() counts ticks, not executions).
 *   2. The pending input events are taken (snapshot and clear). If there are none, the
 *      chart executes once with no current event. Otherwise it executes once per pending
 *      input event, in declaration order, with that event current.
 *   3. After each execution, queued local events are processed one at a time (FIFO), each
 *      as a chart execution with that event current, until the queue is empty.
 *   4. At most SM_MAX_EXECUTIONS_PER_STEP (16) executions run per tick, and the local
 *      queue holds at most SM_EVENT_QUEUE_LEN (8) events; exceeding either latches the
 *      error 'EVENT_OVERFLOW' (trace text 'EVENT_OVERFLOW: event overflow') and enters
 *      the fault configuration at the end of the tick, like other errors.
 *
 * Generated C
 *   SM_PostEvent(instance, SM_EVENT_<NAME>) marks an input event pending; it may be called
 *   from an interrupt. It uses SM_ENTER_CRITICAL()/SM_EXIT_CRITICAL(), which default to
 *   nothing and are #ifndef-guarded so the integrator can map them to interrupt masking.
 *   Event ids are `SM_EVENT_<NAME>` constants in sm_config.h. At most 32 input events.
 *
 * Differential stimulus: { kind: 'step', events: ['NAME', ...] } posts input events
 * before the tick (simulation and C alike).
 */

const st = (id: string, o: Record<string, unknown> = {}) => ({
  id, name: id, x: 0, y: 0, width: 100, height: 60, entry: '', during: '', exit: '',
  isActive: false, color: '#000000', parentId: null, children: [], priority: 1,
  isParallel: false, regionId: null, autostart: false, ...o,
});
const tr = (id: string, sourceId: string, targetId: string, o: Record<string, unknown> = {}) => ({
  id, sourceId, targetId, condition: '', action: '', afterTicks: null, type: 'condition',
  hasControlPoint: false, order: 1, event: null, ...o,
});

const chart = (): StateMachineModelV5 => {
  const model = flatOrFixture();
  model.variables = [
    { id: 'n', name: 'n', type: 'int32', initialValue: '0', currentValue: 0, visibleInScope: true },
    { id: 'trace', name: 'trace', type: 'int32', initialValue: '0', currentValue: 0, visibleInScope: true },
  ];
  (model as unknown as { events: unknown[] }).events = [
    { id: 'ev_go', name: 'GO', scope: 'input' },
    { id: 'ev_tickle', name: 'TICKLE', scope: 'input' },
    { id: 'ev_ping', name: 'PING', scope: 'local' },
  ];
  model.states = [
    st('A', { autostart: true, during: 'n = n + 1;' }),
    st('B', { priority: 2, entry: 'trace = trace * 10 + 1; send(PING);' }),
    st('C', { priority: 3, entry: 'trace = trace * 10 + 2;' }),
  ] as never;
  model.transitions = [
    tr('t_ab', 'A', 'B', { event: 'ev_go' }),
    tr('t_bc', 'B', 'C', { event: 'ev_ping' }),
    tr('t_ca', 'C', 'A', { event: 'ev_go', condition: 'n > 5' }),
  ] as never;
  model.layers = [{ id: 'root', name: 'root', parentStateId: null, decomposition: 'OR', stateIds: ['A', 'B', 'C'], transitionIds: ['t_ab', 't_bc', 't_ca'], junctionIds: [] }] as never;
  return model;
};

const run = (model: StateMachineModelV5, steps: DifferentialScenarioStep[]) => {
  const fx: DifferentialFixture = { name: 'flat-priority', model, steps };
  const expected = runInterpreterTrace(fx);
  const actual = compileAndRunCTrace(fx);
  expect(compareSemanticTraces(expected, actual)).toBeNull();
  return expected;
};

const step = (events?: string[]): DifferentialScenarioStep =>
  (events ? { kind: 'step', events } : { kind: 'step' }) as DifferentialScenarioStep;

describe('events (simulation and generated C agree)', () => {
  it('runs once without events, once per input event, and processes local events to completion', () => {
    const frames = run(chart(), [
      step(),                       // no event: one execution, A during -> n = 1
      step(['TICKLE']),             // one execution with TICKLE: nothing fires, n = 2
      step(['TICKLE', 'GO']),       // GO first (declaration order): A -> B, B sends PING -> C; then TICKLE in C
      step(['GO']),                 // C -> A needs n > 5: stays in C
    ]);
    expect(frames[1].activeStateIds).toEqual(['A']);
    expect(frames[1].data.n).toBe(1);
    expect(frames[2].data.n).toBe(2);
    expect(frames[3].activeStateIds).toEqual(['C']);
    expect(frames[3].data.trace).toBe(12);
    expect(frames[3].data.n).toBe(2);
    expect(frames[4].activeStateIds).toEqual(['C']);
    for (const frame of frames) expect(frame.error).toBeNull();
  }, 120_000);

  it('event-free transitions still fire in every execution', () => {
    const model = chart();
    model.transitions.push(tr('t_a_free', 'A', 'C', { condition: 'n >= 3', order: 2 }) as never);
    model.layers[0].transitionIds.push('t_a_free');
    const frames = run(model, [step(), step(), step(['TICKLE']), step()]);
    // n: 1, 2, then in the TICKLE execution the guard n >= 3 is false before during (n=2) -> n = 3,
    // next tick the event-free transition fires.
    expect(frames[3].activeStateIds).toEqual(['A']);
    expect(frames[4].activeStateIds).toEqual(['C']);
  }, 120_000);

  it('a local event loop is stopped with EVENT_OVERFLOW and the chart faults', () => {
    const model = chart();
    model.states.push(st('D', { priority: 4, during: 'send(PING);' }) as never);
    model.states = model.states.map((state) => ({ ...state, autostart: state.id === 'D' }));
    model.transitions.push(tr('t_dd', 'D', 'D', { event: 'ev_ping', action: 'send(PING);' }) as never);
    model.layers[0].stateIds.push('D');
    model.layers[0].transitionIds.push('t_dd');
    const frames = run(model, [step()]);
    expect(frames[1].error).toBe('EVENT_OVERFLOW: event overflow');
    expect(frames[1].activeStateIds).toEqual([]);
  }, 120_000);
});

describe('event declarations are validated', () => {
  const codes = (model: StateMachineModelV5) =>
    buildSemanticModel(model).diagnostics.filter((item) => item.severity === 'error').map((item) => item.code);

  it('accepts the reference chart', () => {
    expect(codes(chart())).toEqual([]);
  });

  it('rejects an unknown transition event, sending an input event and duplicate names', () => {
    const unknown = chart();
    (unknown.transitions[0] as unknown as { event: string }).event = 'ev_missing';
    expect(codes(unknown)).toContain('SM_UNKNOWN_EVENT');

    const sendInput = chart();
    sendInput.states[1].entry = 'send(GO);';
    expect(codes(sendInput)).toContain('SM_SEND_NON_LOCAL_EVENT');

    const duplicate = chart();
    (duplicate as unknown as { events: Array<{ id: string; name: string; scope: string }> }).events.push({ id: 'ev_go2', name: 'GO', scope: 'local' });
    expect(codes(duplicate)).toContain('SM_DUPLICATE_EVENT');
  });

  it('allows at most 32 input events', () => {
    const many = chart();
    (many as unknown as { events: Array<{ id: string; name: string; scope: string }> }).events.push(
      ...Array.from({ length: 31 }, (_, index) => ({ id: `ev_x${index}`, name: `X${index}`, scope: 'input' })),
    );
    expect(codes(many)).toContain('SM_TOO_MANY_INPUT_EVENTS');
  });
});

describe('generated C event interface', () => {
  it('exposes ISR-safe posting with overridable critical-section hooks', () => {
    const built = buildSemanticModel(chart());
    const files = generateCArtifacts(built.ir!).files;
    const config = files.find((file) => file.name === 'sm_config.h')!.content;
    const core = files.find((file) => file.name === 'sm_core.h')!.content;
    expect(config).toMatch(/SM_EVENT_GO\b/);
    expect(config).toMatch(/SM_EVENT_TICKLE\b/);
    expect(config).toMatch(/SM_EVENT_PING\b/);
    expect(core).toMatch(/SM_Error_t\s+SM_PostEvent\s*\(\s*ADIA_Instance_t\s*\*\s*\w+\s*,\s*\w+\s+\w+\s*\)/);
    expect(config + core).toMatch(/#ifndef\s+SM_ENTER_CRITICAL/);
    expect(config + core).toMatch(/#ifndef\s+SM_EXIT_CRITICAL/);
  });

  it('charts without events generate no event machinery', () => {
    const model = chart();
    (model as unknown as { events: unknown[] }).events = [];
    model.states[1].entry = 'trace = 1;';
    model.transitions = model.transitions.map((transition) => ({ ...transition, event: null, condition: 'n > 1' })) as never;
    const files = generateCArtifacts(buildSemanticModel(model).ir!).files;
    const all = files.map((file) => file.content).join('\n');
    expect(all).not.toMatch(/SM_EVENT_QUEUE_LEN|pending_events/);
  });
});
