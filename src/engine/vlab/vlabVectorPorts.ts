/**
 * Vector / composite port infrastructure (WP-09c, F-046). One shared mechanism for every block that has a port wider
 * than one scalar, designed like Simscape:
 *
 *  1. Physical-signal vectors. A signal port declares `width: N` (default 1) in vlabLibrary.ts. A width-N net allocates N
 *     solver variables (`Across_<net>_ch0 .. ch<N-1>_(physical)`); a width-N OUTPUT port allocates N signal branches
 *     (`signal_<port>[k]`) with one residual row each. The equation receives the port as an N-element array, located by
 *     port id (`vectorInput`), never by position.
 *  2. Composite three-phase electrical port. `composite: 'three_phase'` on an Electrical port ("Electrical, three-phase")
 *     expands into three scalar electrical nodes a, b, c (`Across_<net>_pha|phb|phc_(electrical)`), each with its own KCL.
 *     Connecting two composite ports connects all three phases. A composite port connects ONLY to a composite port; the
 *     Phase Splitter is the bridge composite <-> scalar phases.
 *  3. Connection rules (vlabConnectionRules.ts): widths must match exactly, composite only to composite, diagnostics
 *     carry expected vs actual width. A width-agnostic sink (scope / probe) accepts any width.
 *  4. Scope: a width-N signal on a scope channel shows N traces, `<port>[<channelName>]` (`in1[a]`, `in1[d]`, ...).
 *
 * The metadata comes from the LIBRARY (`libPort ?? instance port`), so a model saved before a port became a vector loads
 * with a width-mismatch diagnostic instead of crashing.
 */
import type { VLabPort } from '../../utils/vlabLibrary';

/** Phase names of a composite three-phase port (Simscape order). */
export const THREE_PHASE_CHANNELS: readonly string[] = ['a', 'b', 'c'];

export interface PortShape {
  /** number of channels / phases; 1 for an ordinary scalar port */
  width: number;
  /** one name per channel (empty for width 1) */
  channelNames: string[];
  composite?: 'three_phase';
}

type ShapeSource = Pick<VLabPort, 'width' | 'channelNames' | 'composite'> | undefined | null;

/** Resolve the shape a library / instance port declares. Throws on an inconsistent declaration (a library bug). */
export function portShape(port: ShapeSource, label = 'port'): PortShape {
  if (!port) return { width: 1, channelNames: [] };
  if (port.composite !== undefined) {
    if (port.composite !== 'three_phase') throw new Error(`${label}: unknown composite kind "${String(port.composite)}"`);
    if (port.width !== undefined && port.width !== 3) throw new Error(`${label}: a three-phase composite port has width 3, not ${port.width}`);
    const names = port.channelNames ?? [...THREE_PHASE_CHANNELS];
    if (names.length !== 3) throw new Error(`${label}: a three-phase composite port needs 3 channel names, got ${names.length}`);
    return { width: 3, channelNames: [...names], composite: 'three_phase' };
  }
  const width = port.width ?? 1;
  if (!Number.isInteger(width) || width < 1) throw new Error(`${label}: width must be a positive integer, got ${String(width)}`);
  if (width === 1) return { width: 1, channelNames: [] };
  const names = port.channelNames ?? Array.from({ length: width }, (_, k) => String(k + 1));
  if (names.length !== width) throw new Error(`${label}: ${names.length} channel names for a width-${width} port`);
  return { width, channelNames: [...names] };
}

/** Width of a port, 1 for scalar / unknown. Tolerant (never throws): used on the hot paths. */
export function widthOf(port: ShapeSource): number {
  if (!port) return 1;
  if (port.composite) return 3;
  const w = port.width;
  return typeof w === 'number' && Number.isInteger(w) && w > 1 ? w : 1;
}

/** Scope data key of channel `k` of scope input `in<channel>`: `in1[a]`. */
export const scopeTraceKey = (channelKey: string, channelName: string): string => `${channelKey}[${channelName}]`;

/** Display label of one trace: `<port label>[<channel name>]`. */
export const traceLabel = (portLabel: string, channelName: string): string => `${portLabel}[${channelName}]`;

/** Suffix of the variable name of channel k of a vector net / composite node. */
export const channelVariableSuffix = (k: number, composite: boolean): string =>
  composite ? `ph${THREE_PHASE_CHANNELS[k] ?? k}` : `ch${k}`;

/** Port ids: a width-N signal OUTPUT port allocates branches `signal_<port>[k]`. */
export const vectorBranchName = (portId: string, k: number): string => `signal_${portId}[${k}]`;

export type PortWidthCode = 'width-mismatch' | 'composite-mismatch';

export interface PortWidthDiagnostic {
  code: PortWidthCode;
  /** the port whose width is expected (the signal input, or the composite port) */
  blockId: string;
  portId: string;
  expectedWidth: number;
  actualWidth: number;
  otherBlockId?: string;
  otherPortId?: string;
  reason: string;
}

/**
 * Raised by the assembler when two ports of different width / composite-ness share one net although the pre-solve
 * topology validation (vlabConnectionRules) was bypassed. Never padded, broadcast or truncated.
 */
export class PortWidthMismatchError extends Error {
  readonly diagnostics: PortWidthDiagnostic[];
  constructor(diagnostics: PortWidthDiagnostic[]) {
    super(`Port width mismatch: ${diagnostics.map(d => d.reason).join(' | ')}`);
    this.name = 'PortWidthMismatchError';
    this.diagnostics = diagnostics;
  }
}

interface VectorArgs { across: any[]; ports: string[] }

/**
 * The N-element value of port `portId`, located by id. Throws (a diagnostic naming the port) when the port does not
 * exist or the solver did not hand over a vector of exactly `width` elements; never reads position, never pads.
 */
export function vectorInput(args: VectorArgs, portId: string, width: number): number[] {
  const i = args.ports.indexOf(portId);
  if (i < 0) throw new Error(`port "${portId}" does not exist on this block (ports: ${args.ports.join(', ')})`);
  const v = args.across[i];
  if (!Array.isArray(v) || v.length !== width) {
    throw new Error(`port "${portId}" expects a ${width}-element vector, got ${Array.isArray(v) ? `a vector of ${v.length}` : typeof v}`);
  }
  return v as number[];
}

/** The scalar value of port `portId`, located by id (a vector there is an error, never silently channel 0). */
export function scalarInput(args: VectorArgs, portId: string): number {
  const i = args.ports.indexOf(portId);
  if (i < 0) throw new Error(`port "${portId}" does not exist on this block (ports: ${args.ports.join(', ')})`);
  const v = args.across[i];
  if (typeof v !== 'number') throw new Error(`port "${portId}" expects a scalar, got ${Array.isArray(v) ? `a vector of ${v.length}` : typeof v}`);
  return v;
}
