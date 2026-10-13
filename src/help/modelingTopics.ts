import type { HelpSection, HelpTopic } from './helpTypes';

const workflow: NonNullable<HelpSection['diagram']> = {
  kind: 'flow',
  nodes: [
    { id: 'need', label: 'Need / measurable requirement', x: 100, y: 110 },
    { id: 'structure', label: 'Reusable definitions and usages', x: 330, y: 110 },
    { id: 'behavior', label: 'Interactions and constraints', x: 560, y: 110 },
    { id: 'handoff', label: 'Explicit execution handoff', x: 790, y: 110 },
    { id: 'engine', label: 'Chosen domain model and solver', x: 790, y: 290 },
    { id: 'trace', label: 'Validation and trace', x: 560, y: 290 },
    { id: 'evidence', label: 'Compare to requirement / evidence', x: 330, y: 290 },
    { id: 'target', label: 'Conditional target test', x: 100, y: 290 },
  ],
  edges: [
    { from: 'need', to: 'structure', label: 'define' },
    { from: 'structure', to: 'behavior', label: 'elaborate' },
    { from: 'behavior', to: 'handoff', label: 'choose executor' },
    { from: 'handoff', to: 'engine', label: 'build, not automatic conversion' },
    { from: 'engine', to: 'trace', label: 'run supported subset' },
    { from: 'trace', to: 'evidence', label: 'evaluate' },
    { from: 'evidence', to: 'target', label: 'only if required' },
  ],
  caption: 'Engineering workflow, not a single compiled model. Each domain has its own source of truth and validation; only a deliberately built and supported executable model can produce a trace.',
};

export const MODELING_HELP_TOPICS: Record<string, HelpTopic> = {
  'modeling-philosophy': {
    title: 'Modeling Philosophy: From Intent to Evidence', category: 'Fundamentals',
    description: 'Decide what a diagram asserts, which model owns it and what independent evidence would test it.',
    content: 'A useful model is a chain of explicit claims, reusable identities, compatible interfaces, supported execution and observed evidence — not a collection of drawings presumed to run. Choose the representation by the engineering question before choosing a canvas.',
    sections: [
      {
        id: 'questions', title: 'One question per representation',
        body: 'Use Requirements to state what must hold; BDD and Packages to define reusable types and ownership; IBD to show uses of those types and structural connections; Use Case for external goals; Sequence for interaction order; Activity for control/object-flow intent; Parametric for equality constraints; RTM to audit relationships. ENTROPY OPM models objects/processes in a separate language. A State Machine specifies executable reactive behavior; X-Bridges defines directed numerical signals; V-Lab models conserving physical networks. The HMI stages operator input and displays committed states, while HIL connects supported generated artifacts to hardware. Diagram placement does not imply repository identity, execution priority, signal transfer or a passing verification result.',
        sources: ['src/features/modelExplorer/modelExplorerCapabilities.ts', 'src/engine/sysml/capabilities/catalog.ts', 'src/utils/stateMachine/smInterpreter.ts'],
      },
      {
        id: 'model-to-evidence', title: 'From statement to measured result',
        body: 'Start with a falsifiable requirement (threshold, conditions and units). Type the design, represent behavior, then explicitly construct an executable model in the appropriate workspace. Run its own validation, solver/interpreter and trace; compare the actual result with the requirement. Preserve model revision, settings, samples and result. Only then decide whether the supported C/HIL path adds evidence. Never infer hardware correctness from a line in a SysML diagram.',
        diagram: workflow, sources: ['src/engine/sysml/evidence.ts', 'src/utils/stateMachine/smPipelineOrchestrator.ts', 'src/engine/vlab/DAEAssembler.ts'],
      },
      {
        id: 'handoffs', title: 'What crosses a workspace boundary?',
        body: 'The models are distinct, and translations are not automatic. Carry intent using explicit typed variables, port contracts, units, sample times, model IDs, assumptions and checked test results; where no direct integration exists, build the equivalent behavior manually and compare outputs. A link in the architecture repository is not the runtime signal graph. An exported report or image is not a second editable model.',
        table: { columns: ['Workspace', 'Owns', 'Handoff and limit'], rows: [
          ['SysML', 'Definitions, usages, diagram presentations, requirements and relationships.', 'Use requirement/test links for traceability. No universal SysML-diagram-to-executable conversion.'],
          ['OPM (ENTROPY)', 'Objects, processes, object states and supported OPM relations.', 'Its own compiler/interpreter and limited codegen path; OPM and SysML are separate repositories.'],
          ['State Machine', 'Chart states, variables, actions, layers and ordered transitions.', 'Dedicated semantic builder/interpreter and conditional embedded C; SysML presentations do not drive its tick.'],
          ['X-Bridges', 'Causal signal blocks, parameters, ports and directed edges.', 'Workspace simulation; only a validated capability subset can run embedded in a State Machine and generate C.'],
          ['V-Lab', 'Coupled conserving physical networks and physical signals.', 'DAE assembly, initialization and solver. Not a generic State Machine embedded-code library.'],
          ['HMI', 'Operator widgets, bindings, staged commands and committed displays.', 'Input is applied at tick boundaries; the dashboard is not a separate simulator.'],
          ['HIL', 'Target pack, HAL/channel mappings, build/flash and live telemetry.', 'Compilation and observed target traces add evidence; code export alone proves neither.'],
        ] },
        sources: ['src/features/modelExplorer/unifiedModelExplorerProjection.ts', 'src/utils/stateMachine/smAppAdapter.ts', 'src/components/hil/HILWorkspace.tsx'],
      },
      {
        id: 'contracts', title: 'Keep semantics, units and time honest',
        body: 'A classifier and its typed Part Property are different IDs; Add Existing presents the same element, while cloning makes a different one. A SysML connector is structural, a parametric binding asserts equality, an X-Bridges edge has a directed driver, and a V-Lab conserving link couples across/through quantities. Matching labels do not ensure matching units or numerical conversion. Distinguish logical State Machine tick (and timer thresholds), X-Bridges solver substeps/sample periods, V-Lab numerical solver steps, UI animation and real target scheduling. Validate each boundary before interpreting a plotted trace.',
        sources: ['src/engine/sysml/ibd.ts', 'src/utils/stateMachine/smTiming.ts', 'src/utils/stateMachine/xbSemanticBuilder.ts', 'src/engine/vlab/kernel/PhysicalSystemCompiler.ts'],
      },
      {
        id: 'worked-project', title: 'Worked project: pump interlock and physical plant',
        body: 'This is a design-to-evidence example, not an automatic generator. Choose the appropriate subset for your project and compare an observation with a declared requirement.',
        list: [
          'Create REQ-PUMP-01: when a declared high-temperature input persists for a specified interval, command the pump off within the specified bound. Record units, measurement location and test conditions.',
          'In BDD define reusable Controller, Sensor and Pump types; in the Controller IBD place sensor: Sensor and pump: Pump, type their ports and connect compatible usages. A structural connector is not yet a sample stream.',
          'Use a Use Case to show Operator / Start Pump, a Sequence to show request, check and reply order, an Activity to split accepted/rejected paths, and a parametric relation for any declared physical constraint. Trace these design items to the requirement.',
          'Build a separate State Machine (Idle, Running, Fault), explicit autostart and typed request/temperature variables with guards and actions. For numerical control, connect supported X-Bridges blocks in an embedded state only after checking capability and sample-time validation.',
          'Assemble a V-Lab plant with compatible physical domains, references, a sensor output and Scope. Treat V-Lab results as a separately simulated plant; manually check signal contracts where linking it to the controller model.',
          'Step/reset and examine State Machine traces and V-Lab scope results. Add Satisfy and Verify links and attach an actual measured or simulated test record; review the RTM, then compile/deploy through HIL only with supported target configuration and additional measured evidence.',
        ],
        sources: ['src/engine/sysml/evidence.ts', 'src/utils/stateMachine/smInterpreter.ts', 'src/engine/vlab/DAEAssembler.ts'],
      },
    ],
    related: ['diagram-reference', 'execution-boundaries', 'model-browser', 'state-machine-execution', 'code-generation', 'reports-guide'],
  },
  'execution-boundaries': {
    title: 'Diagram, Simulation and Code Boundaries', category: 'Fundamentals',
    description: 'Check which representation is conceptual, which engine can simulate it and what code/hardware evidence requires another step.',
    content: 'The presence of a symbol or palette entry is not proof of executable semantics. These statements describe implemented paths in this version, not a blanket promise that any arbitrary model will validate, converge, compile or pass hardware tests.',
    sections: [
      { id: 'matrix', title: 'Capability by view or workspace', body: 'Read the runtime and code columns separately. “Conditional” requires semantic validation and supported constructs; where no direct path is claimed, create and test the executable model explicitly in its own workspace.',
        table: { columns: ['View or workspace', 'Model intent', 'Runtime/simulation', 'Generated code / deployment'], rows: [
          ['BDD', 'Reusable definitions and type relationships.', 'Conceptual SysML view; not a signal solver.', 'No code from drawing alone.'],
          ['IBD', 'Typed usages, ports and structural connectors.', 'Conceptual SysML view; no automatic signal transfer.', 'No code from connector alone.'],
          ['Requirements', 'Measurable claims and traceability links.', 'Links do not run a test.', 'No code or passing result from relationship alone.'],
          ['RTM', 'Review requirement relationship cells and baselines.', 'Review only; no independent execution.', 'Export matrix/report, not controller code.'],
          ['Package', 'Semantic ownership and namespace imports.', 'No solver.', 'No code from the package diagram.'],
          ['Activity', 'Modeled control tokens, object flows and lanes.', 'Validate activity semantics; not an automatic engineering runtime.', 'No generic generated controller from the drawing.'],
          ['Sequence', 'Interactions, ordered typed messages and fragments.', 'Supported interaction subset only; modeled assertions can exceed runtime.', 'Do not assume complete application code from the interaction.'],
          ['Use Case', 'Actors, subject scope and goals.', 'Conceptual goal model.', 'No executable functions generated from goals.'],
          ['Parametric', 'Typed equality constraints and bindings.', 'Constraint expression is not automatically an X-Bridges/V-Lab solver.', 'No generic generated numerical code from binding.'],
          ['State Machine (dedicated editor)', 'Reactive chart, actions and logical ticks.', 'Semantic interpreter supports validated constructs and embedded graph subset.', 'Conditional C generation and differential/target verification; actual deployment separate.'],
          ['OPM (ENTROPY)', 'Objects, processes, states and typed links.', 'Supported compiled OPM subset with its own runtime.', 'Separate limited OPM C path; validate constructs and compilation.'],
          ['X-Bridges', 'Causal numerical blocks and directed signal wires.', 'Workspace simulator/solver for supported blocks.', 'Conditional embedded State Machine C subset only; workspace run is not a code guarantee.'],
          ['V-Lab', 'Acausal physical networks and directed physical signals.', 'Supported DAE compiler, initialization and numerical solver.', 'Not a general State Machine embedded C code path.'],
          ['HMI dashboard', 'Operator input and status visualization.', 'Staged inputs and committed display frames from State Machine.', 'No independent simulation or controller code.'],
          ['HIL', 'Configured target, channels and telemetry.', 'Observed physical session, not a substitute for prior model validation.', 'Target-specific HAL/build/flash; inspect toolchain and on-target evidence.'],
        ] },
        sources: ['src/features/modelExplorer/modelExplorerCapabilities.ts', 'src/utils/stateMachine/xbCapabilities.ts', 'src/engine/vlab/kernel/PhysicalSystemCompiler.ts', 'src/engine/opm/cRuntimeGenerator.ts'],
      },
      { id: 'gate', title: 'A reusable evidence gate', body: 'For every claim: inspect semantic diagnostics, configure the actual engine and timing, run a bounded experiment, record inputs and outputs with model version, compare expected/actual outcomes, then keep the report and any code-build or hardware traces together. A green status in one phase cannot certify the next phase.', sources: ['src/utils/stateMachine/smPipelineOrchestrator.ts', 'src/components/hil/HILWorkspace.tsx'] },
    ],
    related: ['modeling-philosophy', 'diagram-reference', 'state-machine-execution', 'xbridges-ref', 'vlab-fundamentals'],
  },
};

/** Extend, rather than replace, the existing source-reviewed interpreter chapter. */
export function attachStateMachineExecutionGuide(topics: Record<string, HelpTopic>): void {
  const chapter = topics['state-machine-execution'];
  if (!chapter) return;
  chapter.sections = [...(chapter.sections ?? []),
    {
      id: 'priority', title: 'Transition priority and phase precedence',
      body: 'At an active state, outer/external-self routes are tried before During Action, embedded X-Bridges, inner/internal-action routes and child layers. Only the first enabled complete route in a phase is selected; selecting an outer route returns immediately (no During/embedded/inner/child work for that state this tick), and selecting an inner route returns without visiting its children. Priorities are ascending numeric priority, with lexicographic ID as the tie breaker. A lower numeric value runs first. Drawing position, creation order and label do not select a transition.',
      table: { columns: ['Order', 'Interpreter', 'Generated C'], rows: [
        ['1 · Logical tick', 'normalizeLogicalTick validates observed delta; increment active timers by configured logicalMs before evaluating routes.', 'SM_Step validates delta/state; advances active timers by SM_TICK_MS before root-layer execution.'],
        ['2 · Layer selection', 'OR executes the active child. AND visits active children by ascending state priority, then ID. Child layers of a state are visited in stable layer-ID order.', 'Builder orders layer children by state priority/ID; emitted SM_Execute_Layer visits in that order.'],
        ['3 · Outer phase', 'Sort outer and external-self candidates by ascending transition priority, then ID; take the first enabled complete junction route.', 'Emitted outer tests in sorted order return on first enabled route. Exit → transition actions → Entry as applicable.'],
        ['4 · No outer route', 'Run During Action then step the state’s embedded X-Bridges graph, if present.', 'Generated state function calls During, then the embedded graph Step if configured.'],
        ['5 · Inner phase', 'Sort inner and internal-action candidates by priority/ID; first enabled route commits and returns. Internal-action runs effects without exit/entry.', 'Emitted inner tests follow the same order and return when selected.'],
        ['6 · No route', 'Visit child layers; stop if their parent ceased to be active.', 'Generated child-layer calls follow this state function only when neither transition phase returned.'],
      ] },
      sources: ['src/utils/stateMachine/smInterpreter.ts', 'src/utils/stateMachine/smSemanticBuilder.ts', 'src/utils/stateMachine/smCGenerator.ts'],
    },
    {
      id: 'embedded', title: 'Ordering inside an embedded X-Bridges state',
      body: 'Embedded control is stepped after During and before inner transitions in an active State Machine state. The embedded semantic builder requires an X-Bridges solver step that divides the chart base tick exactly, rejects pure direct-feedthrough algebraic loops and builds a deterministic topological execution order with stable ID ties. The graph may perform multiple solver substeps per logical chart tick. Stateful blocks update on their validated sample schedule; do not infer block execution order from canvas position. Separate X-Bridges workspace simulation accepts a broader library than the embedded capability profile; each graph and target must pass its own checks.',
      table: { columns: ['Gate', 'Check before claiming equivalence'], rows: [
        ['Graph topology', 'Use compatible typed ports. Resolve direct-feedthrough cycles or add supported state, then inspect the computed execution order.'],
        ['Timing', 'Example: 10 ms chart tick with a 2 ms validated solver step yields five substeps; a noninteger ratio is rejected. Match block sample periods and initial state.'],
        ['Numerics and target', 'Inspect dimensions, units, frames, data types, numeric-fault policy, target capabilities, mapping and differential trace evidence before target use.'],
      ] },
      sources: ['src/utils/stateMachine/xbSemanticBuilder.ts', 'src/utils/stateMachine/xbInterpreter.ts', 'src/utils/stateMachine/xbCGenerator.ts', 'src/utils/stateMachine/xbCapabilities.ts'],
    },
    {
      id: 'generated-c', title: 'Embedded C scheduler and I/O are separate',
      body: 'The State Machine interpreter step is a semantic tick, not the board scheduler. Generated C exposes SM_Init, SM_ReadInputs, SM_Step and SM_WriteOutputs separately. The caller supplies the observed elapsed milliseconds (within generated tolerance), while SM_TICK_MS advances logical timers; check each error before continuing. SM_ReadInputs copies mapped external inputs; SM_Step validates observed delta and runs the ordered state/embedded-graph functions; SM_WriteOutputs applies mapped outputs. SM_Step does not itself read or write target I/O. SM_Init establishes the default configuration and may write initial outputs. HAL mapping, compiler success, timing deadlines and device behavior require separate verification. For trace equivalence compare the interpreter and emitted C for validated supported models, not every unsupported diagram or fault path.',
      code: '/* After successful SM_Init(&instance), on each external scheduler tick: */\nSM_Error_t err = SM_ReadInputs(&instance);\nif (err == SM_ERR_NONE) err = SM_Step(&instance, observed_delta_ms);\nif (err == SM_ERR_NONE) err = SM_WriteOutputs(&instance);\nif (err != SM_ERR_NONE) { /* record evidence and handle the fault */ }\n/* observed_delta_ms comes from the scheduler; SM_TICK_MS is model logical time. */',
      sources: ['src/utils/stateMachine/smCGenerator.ts', 'src/utils/stateMachine/smInterpreter.ts', 'src/utils/stateMachine/smPipelineOrchestrator.ts'],
    },
    {
      id: 'fault-parity', title: 'Fault behavior is a separate verification case',
      body: 'INVALID_ELAPSED_MS rejects nonfinite or negative interpreter input without entering the normal state execution path. Out-of-tolerance TIMING ticks enter the interpreter fault configuration. Configured embedded numeric escalation latches XBRIDGES_NUMERIC and enters the fault configuration; other evaluation errors latch but can take different entry paths. Emitted SM_Step rejects a delta outside its generated tick interval and enters SM_Enter_Fault for an error status. Verify the selected safety mode, safe state, output policy and target build with fault injection; this guide does not promise identical handling for every unsupported or hardware-only fault.',
      sources: ['src/utils/stateMachine/smInterpreter.ts', 'src/utils/stateMachine/smCGenerator.ts'],
    },
  ];
  chapter.related = [...new Set([...(chapter.related ?? []), 'modeling-philosophy', 'execution-boundaries'])];
  const code = topics['code-generation'];
  if (code) code.related = [...new Set([...(code.related ?? []), 'state-machine-execution', 'execution-boundaries'])];
}
