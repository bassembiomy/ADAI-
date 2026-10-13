// Shared schema for the ADIA reference documentation (MATLAB-style block & item help).
// Every block in VLAB_LIBRARY and BLOCK_LIBRARY (X-Bridges) has one BlockHelpEntry;
// every drawable item of the diagram editors has one ItemHelpEntry.

export interface PortHelp {
  /** Port id exactly as declared by the library (VLabPort.id / XPort.id). */
  id: string;
  /** What flows through the port: meaning, units, data type / physical domain. */
  description: string;
}

export interface ParamHelp {
  /** Parameter key exactly as declared by the library. */
  key: string;
  /** What the parameter does, its unit and its effect on behaviour. */
  description: string;
  /** Valid range / allowed values, e.g. "> 0", "{'forward','backward'}". */
  range?: string;
}

export interface BlockCharacteristics {
  /** X-Bridges: whether an output depends on the current-step input (algebraic path). 'n/a' for acausal V-Lab. */
  directFeedthrough: boolean | 'n/a';
  /** e.g. "Continuous", "Discrete (Ts parameter)", "Inherited", "Acausal (DAE)". */
  sampleTime: string;
  /** Internal states, e.g. "1 continuous", "none", "2 discrete". */
  states: string;
  /** Whether the block produces zero-crossing / event detection. */
  zeroCrossing: boolean;
  /** Supported signal data types or physical domain(s). */
  dataTypes: string;
  /** Code generation support, e.g. "Embedded C99 (fixed-step)", "Simulation only". */
  codeGeneration: string;
}

export interface HelpExample {
  title: string;
  steps: string[];
}

export interface BlockHelpEntry {
  /** Library key (X-Bridges BLOCK_LIBRARY key or V-Lab block id). */
  id: string;
  /** One-line purpose statement (MATLAB "Description" lead sentence). */
  summary: string;
  /** Full description: behaviour, physics/algorithm context, when to use it. */
  description: string;
  /** Visual description of the block shape on the canvas (glyph, port sides). */
  shape: string;
  ports: PortHelp[];
  params: ParamHelp[];
  /** Governing equations / algorithm / pseudo-code. */
  algorithm: string;
  /** Step-by-step instructions for using the block on the canvas. */
  usage: string[];
  characteristics: BlockCharacteristics;
  /** How the block is scheduled and evaluated inside the desktop simulation. */
  simulationExecution: string;
  /** How the block behaves in generated embedded code (or why it is simulation-only). */
  embeddedExecution: string;
  examples?: HelpExample[];
  tips?: string[];
  /** Other block ids (same library) worth reading. */
  seeAlso?: string[];
}

export type ItemModule =
  | 'statemachine'
  | 'opm'
  | 'sysml-bdd'
  | 'sysml-ibd'
  | 'requirements'
  | 'plantuml'
  | 'hil'
  | 'vlab-canvas'
  | 'xbridges-canvas';

export interface ItemHelpEntry {
  /** Unique id, prefixed by module, e.g. "statemachine.state". */
  id: string;
  module: ItemModule;
  name: string;
  /** Visual appearance on the canvas. */
  shape: string;
  /** Optional ASCII / box-drawing sketch of the shape, rendered monospaced. */
  shapeSketch?: string;
  summary: string;
  description: string;
  /** How to create / edit it in the editor (buttons, gestures, panels). */
  usage: string[];
  /** Connection rules: what it may connect to, what is forbidden, and why. */
  connections: string[];
  /** Formal semantics: meaning in the model, execution rules, priority. */
  semantics: string;
  simulationExecution?: string;
  embeddedExecution?: string;
  examples?: HelpExample[];
  tips?: string[];
  /** Other item ids worth reading. */
  seeAlso?: string[];
}

export interface HelpSection {
  title: string;
  body: string;
  code?: string;
  list?: string[];
  /** ASCII / box-drawing diagram rendered monospaced. */
  diagram?: string;
}

export interface HelpTopic {
  title: string;
  category: string;
  description: string;
  content: string;
  image?: string;
  sections?: HelpSection[];
  related?: string[];
}
