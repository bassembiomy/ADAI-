import type { ReportDocument } from '../reportDocumentModel';

export interface SMReportOptions {
  modelName: string;
  reachabilityPercent: number;
  stateCount: number;
  transitionCount: number;
  reachableStates: string[];
  unreachableStates: string[];
  hasDeadlocks: boolean;
}

export function createStateMachineVerificationReport(options: SMReportOptions): ReportDocument {
  return {
    header: {
      systemTitle: `ADIA State Machine Suite — ${options.modelName}`,
      documentTitle: 'C-Code Generation & Model Verification Report',
      subtitle: 'Deterministic AST Analysis, Dynamic Traceability & Safety Verification',
      primaryObjective: 'Formally verify finite state machine reachability, absence of deadlock, and equivalence between semantic model and emitted C code.',
      status: options.hasDeadlocks ? 'Verification Blocked' : 'Formal Verification Passed',
      safetyClassification: 'ISO 26262 / IEC 61508 Verification Suite',
      runningHeader: `ADIA Verification Suite — ${options.modelName}`,
    },
    safetyGate: {
      title: '1. Test Logic and Safety Gate',
      description: 'C code generation and binary execution shall be halted immediately upon detection of unreachable safety states or unconditional self-loops.',
      stopTestRule: 'Stop execution and block artifact flashing if any safety invariant or deadlocked state is triggered during simulation or differential test execution.',
      rootCauses: [
        'Unreachable state definitions due to contradictory guard conditions.',
        'Deadlock or terminal trap state without escape transition.',
        'Variable type overflow or fixed-point scaling mismatch.',
      ],
    },
    requiredDataAndSignals: {
      requiredEquipment: [
        'Host GCC Toolchain (C99 compliant)',
        'ADIA Differential Trace Harness',
        'Hardware In the Loop (HIL) Probe & UART Monitor',
      ],
      requiredPreconditions: [
        'Immutable Semantic IR generated and validated',
        'Fixed step tick interval configured (100ms)',
      ],
      signalsTable: [
        { signalGroup: 'State Flow', signalsToLog: 'Active state ID, previous state, active slot configuration' },
        { signalGroup: 'Signals & Events', signalsToLog: 'Trigger events, guard evaluation booleans, action variables' },
        { signalGroup: 'Safety Metrics', signalsToLog: 'Error status code, anti-windup flags, watchdog ticks' },
      ],
    },
    testProcedures: [
      {
        id: 'T01',
        badgeLabel: 'T01',
        title: 'Static Reachability & AST Completeness',
        purpose: 'Verify that 100% of defined operational and safety states are reachable from initial transition.',
        procedure: [
          'Parse AST graph into immutable Semantic Model IR.',
          'Execute Dijkstra / BFS reachability traversal from root initial state.',
          'Verify all states are visited and no orphan nodes exist.',
        ],
        record: ['Reachable state list', 'Unreachable state list', 'Reachability percentage'],
        acceptanceCriteria: [
          `Reachability equals ${options.reachabilityPercent.toFixed(1)}% (100% required for release).`,
          'Zero orphan states detected.',
        ],
        decisionRule: 'If reachability < 100%, halt code deployment and inspect state transition guards.',
      },
      {
        id: 'T02',
        badgeLabel: 'T02',
        title: 'Differential Execution Trace Equivalence',
        purpose: 'Ensure generated C code binary produces identical execution traces to reference model.',
        procedure: [
          'Compile sm_host_test.c with host GCC compiler.',
          'Execute compiled binary with randomized test stimulus vectors.',
          'Compare JSONL execution logs with reference model trace.',
        ],
        record: ['First divergence step', 'State sequence', 'Variable transition history'],
        acceptanceCriteria: [
          'Zero trace divergences across all executed test vectors.',
          'Deterministic exit on terminal states without unexpected reset.',
        ],
        decisionRule: 'Any divergence indicates a code generation compiler bug or misaligned timing tick.',
      },
    ],
    decisionMatrix: {
      title: '4. Fault-Isolation Decision Matrix',
      rows: [
        {
          observedResult: 'State marked unreachable',
          probableCause: 'Conflicting transition guards or missing event trigger',
          confirmWith: 'T01',
          requiredAction: 'Refactor transition conditions in state chart editor.',
        },
        {
          observedResult: 'Host GCC compilation failure',
          probableCause: 'Missing header include or syntax mismatch in user action code',
          confirmWith: 'T02',
          requiredAction: 'Inspect sm_user_logic.c and verify variable declarations.',
        },
        {
          observedResult: 'Trace divergence between C and simulation',
          probableCause: 'Order of execution discrepancy in during actions vs active children',
          confirmWith: 'T02',
          requiredAction: 'Rebuild runtime bundle with latest ADIA pipeline orchestrator.',
        },
      ],
    },
    finalDecisionCriteria: {
      title: '5. Final Engineering Decision Criteria',
      classifications: [
        {
          title: 'Classify model as verified and production-ready when all conditions hold:',
          criteria: [
            'Static AST reachability is 100%.',
            'Zero deadlocks or non-terminating traps detected.',
            'Differential trace equivalence confirmed across all test vectors.',
          ],
        },
      ],
      releaseCondition: 'Do not flash generated C firmware to target MCU hardware until all T01–T02 tests have recorded PASS evidence in this verification log.',
    },
  };
}
