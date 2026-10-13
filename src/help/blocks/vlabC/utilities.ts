import type { BlockHelpEntry } from '../../types';
import { SIM_DAE, EMB_NONE, acausal, signalChar, placeSteps } from './common';

export const UTILITIES: Record<string, BlockHelpEntry> = {
  solver_config: {
    id: 'solver_config',
    summary: 'Solver Configuration block: defines the run time, step limits, tolerances and diagnostics of the physical network.',
    description:
      'Every physical network is meant to have one Solver Configuration block, as in Simscape. It stores the simulation time span (startTime, stopTime), the choice of numerical solver (auto, bdf, rk4, rk_adaptive, euler), the step limits, the relative, absolute and nonlinear tolerances, the Newton iteration limit and two diagnostic switches. ' +
      'In the interactive workspace the block is read for its stopTime: when the End Time field in the top bar is empty, the workspace takes the end of the run from stopTime, and typing a value in the End Time field writes it back into the block. The block itself contributes no equation to the DAE. ' +
      'The kernel pipeline in src/engine/vlab/kernel (SolverManager, SystemAnalyzer) consumes the solver, tolerance and step settings; the live workspace loop (VLabPhysicsEngine.simulateStep) uses its own adaptive BDF/SDIRK-3 controller and reads only the stop time from this block.',
    shape:
      'A small rounded rectangle (60 by 40 px) with the text "f(x) = 0" in the centre. A single port A sits on the right edge; wire it to any node of the physical network to associate the solver with it.',
    ports: [
      { id: 'a', description: 'Connection port A on the right edge. Wire it to a node of the physical network (any domain) to bind the solver settings to that network; it carries no signal and contributes no equation.' },
    ],
    params: [
      { key: 'solver', description: 'Numerical solver: "auto" lets the stiffness and constraint analyzer pick; "bdf" is the variable-step implicit DAE solver; "rk4" fixed-step Runge-Kutta; "rk_adaptive" Runge-Kutta-Fehlberg 4/5; "euler" forward Euler.', range: "{'auto','bdf','rk4','rk_adaptive','euler'}" },
      { key: 'startTime', description: 'Simulation start time in s.', range: '>= 0 (default 0)' },
      { key: 'stopTime', description: 'Simulation stop time in s. Used by the workspace as the run limit when the End Time field is empty, and synchronised with that field.', range: '> startTime (default 10 s)' },
      { key: 'initialStep', description: 'First step size attempted by variable-step solvers, in s.', range: '> 0 (default 0.001 s)' },
      { key: 'minimumStep', description: 'Smallest step the solver may take, in s; the run fails if it is reached without convergence.', range: '> 0 (default 1e-6 s)' },
      { key: 'maximumStep', description: 'Largest step the solver may take, in s.', range: '>= initialStep (default 0.05 s)' },
      { key: 'relativeTolerance', description: 'Relative error tolerance for step-size control (dimensionless).', range: '> 0 (default 1e-3)' },
      { key: 'absoluteTolerance', description: 'Absolute error tolerance for step-size control, in the units of each state.', range: '> 0 (default 1e-6)' },
      { key: 'nonlinearTolerance', description: 'Residual norm below which the Newton iteration of an implicit step is accepted.', range: '> 0 (default 1e-8)' },
      { key: 'maximumIterations', description: 'Maximum number of Newton iterations per implicit step.', range: 'integer >= 1 (default 50)' },
      { key: 'enableDiagnostics', description: 'Switch for solver diagnostics (stored as the enableDiagnostics flag of the solver configuration).', range: "{'on','off'}" },
      { key: 'enableLogging', description: 'Switch for logging solver statistics (stored as the enableLogging flag of the solver configuration).', range: "{'on','off'}" },
    ],
    algorithm:
      'DAE system:  F(x, dx/dt, u, t) = 0,  t in [startTime, stopTime]\n' +
      'solver = auto: SystemAnalyzer picks bdf if the network has algebraic constraints (DAE) or is stiff, otherwise rk_adaptive\n' +
      'accept implicit step when ||F|| < nonlinearTolerance within maximumIterations Newton iterations\n' +
      'step size h kept inside [minimumStep, maximumStep], error test with relativeTolerance and absoluteTolerance',
    usage: [
      'Drag "Solver Configuration" from the Utilities palette group onto the canvas; one per diagram is enough.',
      'Wire its port A to any node of the physical network (for example the ground node).',
      'Select the block. The parameters panel has four tabs: General (Start Time, Stop Time), Numerical (Numerical Solver), Tolerances (Initial/Min/Max Step, Relative/Absolute Tolerance, Nonlinear Residual Tol, Max Newton Iterations) and Diagnostics (Diagnostics, Log Stats).',
      'Set Stop Time to the length of the experiment in seconds. Leave the End Time field in the top bar empty to use it, or type a number there to override it (the block is updated to match).',
      'Click RUN SIMULATION. Reduce Maximum Step for fast dynamics, and tighten tolerances only if results change with the setting.',
    ],
    characteristics: {
      directFeedthrough: 'n/a',
      sampleTime: 'Not applicable (configuration block; defines the continuous-time span)',
      states: 'none',
      zeroCrossing: false,
      dataTypes: 'Configuration only; port A accepts any physical node',
      codeGeneration: 'Simulation only (no C code generation)',
    },
    simulationExecution:
      'The block adds no equation: the assembler gives it an empty residual and the physical-network extractor (PhysicalNetworkExtractor) removes it from the physical component set and treats it as a solver-configuration element. ' +
      'The workspace reads stopTime to bound the run and mirrors the End Time field into it. ' + SIM_DAE,
    embeddedExecution:
      'Not code-generated. Solver Configuration is a desktop-simulation setting; no C generator (HIL, embedded, state machine or X-Bridges) reads it. For embedded targets the step period is defined by the target pack / rate settings of the HIL or embedded layer, not by this block.',
    tips: [
      'Auto is the safest choice; select bdf explicitly for networks with very different time constants (for example electrical plus thermal).',
      'A run that stops with a convergence error can often be fixed by lowering Maximum Step or checking that a reference block (ground) exists.',
    ],
    seeAlso: ['scope', 'ground', 'ps_constant'],
  },

  ps_simulink_conv: {
    id: 'ps_simulink_conv',
    summary: 'PS-Simulink Converter: passes a physical-signal value to the signal domain unchanged.',
    description:
      'Corresponds to the PS-Simulink Converter of Simscape: it marks the boundary where a physical-signal (PS) value leaves the acausal physical network and becomes a plain signal for scopes and controllers. ' +
      'In V-Lab the physical signals and plain signals share one node type, so the block implements the identity out = in. It lets you keep Simscape-style diagrams and makes the intent of the boundary explicit; it does not rescale or sample the signal.',
    shape:
      'A square glyph (60 by 60 px) with the text "PS->SL" (PS arrow SL) in the centre. Input In on the left edge and output Out on the right edge.',
    ports: [
      { id: 'in', description: 'Physical-signal input on the left edge (domain Any; the value keeps the unit of its source).' },
      { id: 'out', description: 'Signal output on the right edge; equals the input at every instant.' },
    ],
    params: [],
    algorithm: 'out = in   (identity, no scaling)',
    usage: placeSteps('PS-Simulink Converter', 'Utilities', [
      'Wire the physical-signal output of a sensor or PS block (for example Pressure Sensor out) to the In port.',
      'Wire Out to a Scope or to a downstream PS block.',
      'The block has no parameters.',
    ]),
    characteristics: signalChar('none', 'Real-valued signal, Any domain (unit follows the source)'),
    simulationExecution:
      SIM_DAE + ' The block is classed as a signal block: its ports are treated as the Physical (signal) domain and one signal branch is allocated for Out with the residual out - in = 0. It therefore forms an algebraic path with direct feedthrough that the implicit solver resolves together with the rest.',
    embeddedExecution: EMB_NONE,
    seeAlso: ['simulink_ps_conv', 'vlab_probe', 'scope'],
  },

  simulink_ps_conv: {
    id: 'simulink_ps_conv',
    summary: 'Simulink-PS Converter: passes a plain signal into the physical-signal domain unchanged.',
    description:
      'Corresponds to the Simulink-PS Converter of Simscape: it marks the boundary where a plain signal (for example from a controller block or a constant) enters the physical network as a physical-signal input. ' +
      'In V-Lab both sides use the same signal node type, so the block implements the identity out = in. No filtering or unit conversion is applied.',
    shape:
      'A square glyph (60 by 60 px) with the text "SL->PS" in the centre. Input In on the left edge and output Out on the right edge.',
    ports: [
      { id: 'in', description: 'Signal input on the left edge (domain Any).' },
      { id: 'out', description: 'Physical-signal output on the right edge; equals the input at every instant.' },
    ],
    params: [],
    algorithm: 'out = in   (identity, no scaling)',
    usage: placeSteps('Simulink-PS Converter', 'Utilities', [
      'Wire a signal source (for example PS Constant or a controller output) to the In port.',
      'Wire Out to the control port of a physical block such as the S port of Pressure Source (MA).',
      'The block has no parameters.',
    ]),
    characteristics: signalChar('none', 'Real-valued signal, Any domain (unit follows the source)'),
    simulationExecution:
      SIM_DAE + ' The block is classed as a signal block: ports are Physical (signal) domain, one signal branch is allocated for Out and the residual is out - in = 0 (direct feedthrough resolved by the solver).',
    embeddedExecution: EMB_NONE,
    seeAlso: ['ps_simulink_conv', 'vlab_probe', 'ps_constant'],
  },

  vlab_probe: {
    id: 'vlab_probe',
    summary: 'Probe: taps a signal or node value and re-exposes it on output x without loading the circuit.',
    description:
      'A measurement point for a physical-signal value. The output x equals the value at input In, so the Probe can be inserted into a signal path to give the value a label and a second branch to a Scope without changing the dynamics. ' +
      'It draws no through quantity and adds no state.',
    shape:
      'A square glyph (60 by 60 px) with the text PROBE in the centre (the palette symbol shows a small circle with a cross). Input In on the left edge and output x on the right edge.',
    ports: [
      { id: 'in', description: 'Signal input on the left edge: the value to observe.' },
      { id: 'out', description: 'Output port labelled x on the right edge: a copy of the observed value.' },
    ],
    params: [],
    algorithm: 'x = in   (identity, no loading)',
    usage: placeSteps('Probe', 'Utilities', [
      'Wire the signal or sensor output you want to observe to In.',
      'Wire x to a Scope input (you may also continue to the next block from the same source).',
      'The block has no parameters.',
    ]),
    characteristics: signalChar('none', 'Real-valued signal (unit follows the source)'),
    simulationExecution:
      SIM_DAE + ' The Probe is classed as a signal block; one signal branch is allocated for the output with the residual x - in = 0.',
    embeddedExecution: EMB_NONE,
    seeAlso: ['scope', 'ps_simulink_conv', 'conn_label'],
  },

  conn_label: {
    id: 'conn_label',
    summary: 'Connection Label: a named tap on a wire that documents a net and exposes its value.',
    description:
      'Marks a net with a short text tag so a long or crowded diagram stays readable. The block has a single port A, which you wire to the net to annotate. ' +
      'The tag text is a display annotation: the solver does not join separate nets by equal tag (there is no goto/from behaviour), so you must still draw the wire. ' +
      'Mathematically the label contributes the identity signal branch = value at A and adds nothing to the network.',
    shape:
      'A small glyph (40 by 40 px) with a circle at the left, a thin line leaving it to the right and a faint cross inside the circle. The single port A sits on the left edge.',
    ports: [
      { id: 'a', description: 'Connection port A on the left edge. Wire it to the net to be labelled; it draws no through quantity.' },
    ],
    params: [
      { key: 'tag', description: 'Text of the label shown for this net. Display annotation only; tags are not matched across nets.', range: 'short text (default "A")' },
    ],
    algorithm: 'signal_a = value(A)    (identity; no effect on the network)',
    usage: placeSteps('Connection Label', 'Utilities', [
      'Wire port A to the net you want to annotate (a signal line or a physical node).',
      'Select the block and type the label into the "tag" field of the parameters panel.',
      'Remember that equal tags do not connect nets; draw explicit wires between blocks.',
    ]),
    characteristics: signalChar('none', 'Any net; value is mirrored as a real signal'),
    simulationExecution:
      SIM_DAE + ' The Connection Label is classed as a signal block, so its port A is treated as a Physical (signal) port and it allocates one signal branch with the identity residual branch - value = 0.',
    embeddedExecution: EMB_NONE,
    seeAlso: ['vlab_probe', 'scope', 'subsystem'],
  },

  subsystem: {
    id: 'subsystem',
    summary: 'Subsystem: a hierarchical container that encapsulates a nested sub-network behind Inport and Outport blocks.',
    description:
      'Groups part of a diagram into a single block. The inside of the subsystem is a separate canvas layer containing ordinary V-Lab blocks plus Inport and Outport blocks; the ports of the subsystem block on the parent canvas are created automatically from those Inports (left edge) and Outports (right edge), ordered by their Port Index and labelled with their Name. ' +
      'Subsystem ports are signal ports (Physical domain). At run time the hierarchy is flattened: the subsystem and its Inport/Outport blocks are removed and the external wires are re-attached to the blocks inside, so a subsystem has no effect on the numerical solution.',
    shape:
      'A rounded rectangle (70 by 60 px) containing a small input bar on the left, two short internal lines ending in dots and an arrow leaving to the right. Its ports are not fixed: one port per Inport on the left edge and one per Outport on the right edge, added automatically.',
    ports: [],
    params: [
      { key: 'name', description: 'Display name of the subsystem block.', range: 'text (default "Subsystem")' },
    ],
    algorithm: 'Flattening: external wire -> Inport -> internal block   becomes   external wire -> internal block\ninternal block -> Outport -> external wire   becomes   internal block -> external wire',
    usage: [
      'Drag "Subsystem" from the Utilities group onto the canvas.',
      'Double-click the subsystem to open it; the breadcrumb path in the workspace shows the current layer and lets you go back to the parent.',
      'Inside, drop Inport blocks for inputs and Outport blocks for outputs and build the sub-network between them.',
      'Alternatively, select existing blocks and drag them onto the subsystem block: they move inside and Inport/Outport blocks are created automatically for every wire that crossed the boundary.',
      'Back on the parent canvas wire the new left-hand (input) and right-hand (output) ports as usual, then run the simulation.',
    ],
    characteristics: {
      directFeedthrough: 'n/a',
      sampleTime: 'Not applicable (flattened before solving)',
      states: 'none (contained blocks keep their own states)',
      zeroCrossing: false,
      dataTypes: 'Signals (Physical domain) across the boundary',
      codeGeneration: 'Simulation only (no C code generation)',
    },
    simulationExecution:
      'Before assembly, DAEAssembler.flattenSubsystems() repeatedly removes the outermost subsystem together with its Inport/Outport children and rewires the external edges to the inner blocks (up to 100 levels). The contained blocks are then assembled as one flat network. ' + SIM_DAE,
    embeddedExecution: EMB_NONE,
    seeAlso: ['inport', 'outport', 'conn_label'],
  },

  inport: {
    id: 'inport',
    summary: 'Inport: the input boundary of a subsystem; creates an input port on the parent subsystem block.',
    description:
      'Place an Inport inside a subsystem layer to receive a signal from the parent diagram. The block creates a matching input port (left edge) on the parent Subsystem block, named after its Name parameter and ordered by Port Index. ' +
      'Inside the subsystem the Inport output Out feeds the internal blocks. After flattening the Inport disappears and the wire from the parent goes directly to the blocks connected to Out.',
    shape:
      'A circle (60 by 40 px bounding box) with a lead entering from the left, a lead leaving to the right and an arrow-head inside the circle pointing right. Output port Out on the right edge.',
    ports: [
      { id: 'out', description: 'Output Out on the right edge: the signal arriving from the parent diagram; connect it to the inner blocks.' },
    ],
    params: [
      { key: 'name', description: 'Name shown as the label of the matching input port on the parent Subsystem block.', range: 'text (default "In1")' },
      { key: 'port_index', description: 'Position of the parent port among the Inports; lower indices are placed first (top).', range: 'integer >= 1 (default 1)' },
      { key: 'data_type', description: 'Declared data type of the signal crossing the boundary; "auto" inherits it from the connection.', range: "'auto' (default)" },
    ],
    algorithm: 'y = u_external    (identity; removed by flattening)',
    usage: [
      'Double-click a Subsystem block to open its inner layer.',
      'Drag an "Inport" from the Utilities group onto the inner canvas and set Name and Port Index in the parameters panel.',
      'Wire Out to the inner block that should receive the signal.',
      'Return to the parent layer: the Subsystem block now shows a new input port on its left edge to wire to the source.',
    ],
    characteristics: signalChar('none', 'Signal (Physical domain); data_type auto'),
    simulationExecution:
      'The Inport has an empty residual and is removed during flattening: DAEAssembler.flattenOneLevel() connects the parent wire straight to the blocks that were wired to Out. ' + SIM_DAE,
    embeddedExecution: EMB_NONE,
    seeAlso: ['outport', 'subsystem'],
  },

  outport: {
    id: 'outport',
    summary: 'Outport: the output boundary of a subsystem; creates an output port on the parent subsystem block.',
    description:
      'Place an Outport inside a subsystem layer to send a signal to the parent diagram. The block creates a matching output port (right edge) on the parent Subsystem block, named after its Name parameter and ordered by Port Index. ' +
      'Inside the subsystem the inner block driving In is what appears at the parent output. After flattening the Outport disappears and the parent wire is attached directly to the driving block.',
    shape:
      'A circle (60 by 40 px bounding box) with a lead entering from the left, a lead leaving to the right and an arrow-head at the right edge pointing out. Input port In on the left edge.',
    ports: [
      { id: 'in', description: 'Input In on the left edge: the signal to deliver to the parent diagram.' },
    ],
    params: [
      { key: 'name', description: 'Name shown as the label of the matching output port on the parent Subsystem block.', range: 'text (default "Out1")' },
      { key: 'port_index', description: 'Position of the parent port among the Outports; lower indices are placed first (top).', range: 'integer >= 1 (default 1)' },
      { key: 'data_type', description: 'Declared data type of the signal crossing the boundary; "auto" inherits it from the connection.', range: "'auto' (default)" },
    ],
    algorithm: 'y_external = u    (identity; removed by flattening)',
    usage: [
      'Double-click a Subsystem block to open its inner layer.',
      'Drag an "Outport" from the Utilities group onto the inner canvas and set Name and Port Index in the parameters panel.',
      'Wire the inner block output (for example a sensor Physical output) to In.',
      'Return to the parent layer: the Subsystem block now shows a new output port on its right edge to wire to the consumer.',
    ],
    characteristics: signalChar('none', 'Signal (Physical domain); data_type auto'),
    simulationExecution:
      'The Outport has an empty residual and is removed during flattening: DAEAssembler.flattenOneLevel() connects the driving inner block straight to the parent wire. ' + SIM_DAE,
    embeddedExecution: EMB_NONE,
    seeAlso: ['inport', 'subsystem'],
  },

  doe_custom: {
    id: 'doe_custom',
    summary: 'DOE Model Block: a data-driven surrogate model (RSM, GMDH or Taguchi) from a Design of Experiments run, used as a behavioural block.',
    description:
      'Embeds the regression model fitted in the DOE Manager as a block, so a V-Lab diagram can use measured or simulated experiment results instead of a physical equation. The block has one input port per factor (in1 ... inN, in factor order) and one output port out for the response. ' +
      'The ports are not fixed in the library: they are created when you export a model from the DOE Manager with "Export to V-Lab", together with the model payload stored in a deploymentModel parameter (JSON). Evaluation is strict: if any input is missing or non-finite, or the payload is invalid, the output is NaN and a diagnostic is recorded instead of silently using 0. ' +
      'For blocks that only carry an equation string, the legacy path evaluates the equation text with the variables X1, X2, ... mapped to the input ports in order.',
    shape:
      'A gold (#c9a86c) rounded square (60 by 60 px) with a faint fill, a faint X cross, a dashed inner circle and the text DOE in the centre. Input ports in1...inN on the left edge, output out on the right edge (the response name is used as the label).',
    ports: [],
    params: [
      { key: 'modelType', description: 'Model family used for evaluation: RSM (response-surface polynomial), GMDH (layered pairwise polynomial network) or Taguchi (additive main-effect model).', range: "{'RSM','GMDH','Taguchi'} (default 'RSM')" },
      { key: 'equation', description: 'Human-readable model equation, for example Y = f(X1, X2). Used as the evaluated expression only when no structured deploymentModel is present (legacy blocks); otherwise informational.', range: 'text (default "Y = f(X1, X2, ...)")' },
    ],
    algorithm:
      'out = f(in1, ..., inN)\n' +
      'RSM:     Y = b0 + sum_i b_i*x_i + sum_i b_ii*x_i^2 + sum_{i<j} b_ij*x_i*x_j   (terms taken from the deployment payload)\n' +
      'GMDH:    each neuron: z = c0 + c1*xi + c2*xj + c3*xi^2 + c4*xj^2 + c5*xi*xj, layer by layer, output of last layer\n' +
      'Taguchi: Y = grand mean + sum of factor-level effects\n' +
      'Errors (missing input, non-finite coefficient, bad payload) -> out = NaN + diagnostic',
    usage: [
      'Run a Design of Experiments in the DOE Manager and fit a model (RSM, GMDH or Taguchi) so that it reports a valid deployment model.',
      'In the DOE Manager choose "Export to V-Lab". A "DOE Model Block" with one input per factor and one output is added to the V-Lab canvas.',
      'In V-Lab, wire each input in1...inN to a signal source in factor order (PS Constant, PS Step, PS Sine or any physical sensor output).',
      'Wire out to a Scope (or to the control port of another block) and click RUN SIMULATION.',
      'If the scope shows NaN, check that every input port is connected and that the factor count matches the model. The evaluator records a diagnostic code on the node (for example INSUFFICIENT_INPUTS or MISSING_MODEL_PAYLOAD).',
      'Keep factor values inside the experimental design range; surrogate models extrapolate poorly outside it.',
    ],
    characteristics: {
      directFeedthrough: true,
      sampleTime: 'Continuous (algebraic evaluation at every solver step), no sample time',
      states: 'none',
      zeroCrossing: false,
      dataTypes: 'Real-valued signals (domain "General"/Physical); inputs and output are dimensionless numbers in the units of the DOE factors',
      codeGeneration: 'Simulation only (no C code generation)',
    },
    simulationExecution:
      SIM_DAE + ' The DOE block is classed as a signal block: its ports are Physical signals, one signal branch is allocated for out and the residual is out - f(in1, ..., inN), evaluated by the DOE model evaluator (src/engine/doe/modelEvaluator.ts). The result depends on the current inputs at every Newton iteration, so it is an algebraic (direct feedthrough) path. If the DAE assembly fails, the workspace falls back to a simple direct evaluation of the model.',
    embeddedExecution: EMB_NONE + ' The DOE deployment model can be exported to an X-Bridges DOE block (see the DOE Manager) for embedded use.',
    examples: [
      {
        title: 'Use a fitted RSM as a plant model',
        steps: [
          'Export a two-factor RSM from the DOE Manager to V-Lab (ports in1, in2, out).',
          'Wire two PS Constant blocks (set to values inside the design range) to in1 and in2.',
          'Wire out to a Scope and run; the scope shows the predicted response Y.',
        ],
      },
    ],
    tips: [
      'Library parameters list only modelType and equation; blocks exported from the DOE Manager also carry deploymentModel (a JSON string with the structured model) and the dynamic ports.',
      'Dragging the block from the palette gives an unconfigured block with no ports and no payload; export from the DOE Manager instead.',
    ],
    seeAlso: ['scope', 'ps_constant', 'ps_step', 'ps_simulink_conv'],
  },
};

// Keep the acausal helper referenced for configuration-style entries that may extend this file.
void acausal;
