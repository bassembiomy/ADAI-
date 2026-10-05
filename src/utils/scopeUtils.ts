import { blockTypeOf, libraryBlock, portIdFromHandle } from '../engine/vlab/vlabConnectionRules';
import { portShape, scopeTraceKey, traceLabel } from '../engine/vlab/vlabVectorPorts';

// src/utils/scopeUtils.ts

export interface VLabSignalInfo {
  connected: boolean;
  name: string;
  dataType: string;
  portName: string;
  blockLabel: string;
  fullName: string;
  /** exact id of the source port the channel is wired to */
  portId?: string;
  /** measured quantity / SI unit of that port (library metadata, WP-09b) */
  quantity?: string;
  unit?: string;
  /** `<block name>.<port label> - <quantity> [<unit>]` */
  channelLabel: string;
  /**
   * Traces this channel draws (WP-09c). A scalar channel has one trace keyed `in<k>`; a width-N signal has N traces keyed
   * `in<k>[<channel name>]` (a, b, c / d, q, 0 / alpha, beta, 0), labelled `<block>.<port>[<name>] - <quantity> [<unit>]`.
   */
  width: number;
  channelNames: string[];
  traceKeys: string[];
  traceLabels: string[];
}

export interface SignalStatistics {
  min: number;
  max: number;
  peakToPeak: number;
  mean: number;
  rms: number;
  count: number;
}

export interface CursorDelta {
  deltaT: number;
  deltaY: number;
  frequency: number;
  slope: number;
}

// Official MATLAB/Simulink Scope phosphor trace palette
export const SIMULINK_SCOPE_COLORS = [
  '#FFFF00', // 1: Yellow (Simulink Primary Trace)
  '#FF00FF', // 2: Magenta
  '#00FFFF', // 3: Cyan
  '#FF3333', // 4: Bright Red
  '#00FF66', // 5: Neon Green
  '#3399FF', // 6: Cobalt Blue
  '#FF9900', // 7: Amber Orange
  '#FFFFFF'  // 8: Pure White
];

// Fallback compatibility export
export const VLAB_SIGNAL_COLORS = SIMULINK_SCOPE_COLORS;

/**
 * Scope channel caption: `<block name>.<port label> - <quantity> [<unit>]` (user section 9). `unit` `*` marks a
 * unit-polymorphic block (the channel has the unit of the signal wired to the block's input), `1` is dimensionless.
 */
export function formatChannelLabel(blockName: string, portLabel: string, quantity?: string, unit?: string): string {
  const base = `${blockName}.${portLabel}`;
  if (!quantity) return base;
  const u = !unit ? '' : unit === '*' ? ' [unit of input]' : ` [${unit}]`;
  return `${base} — ${quantity}${u}`;
}

export function getVLabSignalInfo(
  scopeNodeId: string,
  channelIndex: number,
  nodes: any[],
  edges: any[],
  history: any[] = []
): VLabSignalInfo {
  const targetPortId = `in${channelIndex + 1}`;
  // The scope port behind an edge handle is resolved by its EXACT port id (the same portIdFromHandle path the
  // assembler uses), never by stripping a `_s`/`_t` suffix.
  const scopeNode = nodes?.find((n: any) => n.id === scopeNodeId) ?? { id: scopeNodeId, data: { type: 'scope' } };
  const edge = edges?.find((e: any) => e.target === scopeNodeId && portIdFromHandle(scopeNode, e.targetHandle) === targetPortId);

  if (!edge) {
    return {
      connected: false,
      name: `Channel ${channelIndex + 1}`,
      dataType: 'auto',
      portName: targetPortId,
      blockLabel: 'Unconnected',
      fullName: `Channel ${channelIndex + 1}: Unconnected (auto)`,
      channelLabel: `Channel ${channelIndex + 1}: Unconnected`,
      width: 1,
      channelNames: [],
      traceKeys: [targetPortId],
      traceLabels: [`Channel ${channelIndex + 1}: Unconnected`],
    };
  }

  const sourceNode = nodes?.find((n: any) => n.id === edge.source);
  const sourceBlockLabel = sourceNode
    ? sourceNode.data?.label || sourceNode.data?.name || sourceNode.data?.type || edge.source
    : edge.source;

  // The source port is the exact port the wire is attached to: instance metadata first, then the library definition.
  const sourcePortId = sourceNode ? portIdFromHandle(sourceNode, edge.sourceHandle) : undefined;
  const instancePort = Array.isArray(sourceNode?.data?.ports) ? sourceNode.data.ports.find((p: any) => p?.id === sourcePortId) : undefined;
  const libPort = sourceNode ? libraryBlock(blockTypeOf(sourceNode))?.ports.find(p => p.id === sourcePortId) : undefined;
  const legacyPort = sourceNode?.data?.outputs?.find((p: any) => p.id === edge.sourceHandle || p.name === edge.sourceHandle);
  const portName: string = legacyPort?.name || legacyPort?.label || instancePort?.label || libPort?.label || sourcePortId || edge.sourceHandle || 'out';
  const quantity: string | undefined = libPort?.quantity ?? instancePort?.quantity;
  const unit: string | undefined = libPort?.quantity !== undefined ? libPort.unit : instancePort?.unit;

  let baseType = legacyPort?.dataType || 'double';

  // Check dimension info if history exists
  let dimensionsStr = '';
  if (history && history.length > 0) {
    const lastSample = history[history.length - 1];
    const key = `in${channelIndex + 1}`;
    const rawVal = lastSample[key] !== undefined ? lastSample[key] : (channelIndex === 0 ? lastSample.value : undefined);
    if (typeof rawVal === 'boolean') {
      baseType = 'boolean';
    }
    if (Array.isArray(rawVal)) {
      dimensionsStr = ` [${rawVal.length}]`;
    }
  }

  const dataType = `${baseType}${dimensionsStr}`;
  // width / channel names come from the library port (an instance copy only for a block the library does not know)
  let shape = { width: 1, channelNames: [] as string[] };
  try { shape = portShape(libPort ?? instancePort); } catch { /* malformed metadata: draw it as a scalar */ }
  const channelLabel = formatChannelLabel(sourceBlockLabel, portName, quantity, unit);
  const traceKeys = shape.width > 1 ? shape.channelNames.map(n => scopeTraceKey(targetPortId, n)) : [targetPortId];
  const traceLabels = shape.width > 1
    ? shape.channelNames.map(n => formatChannelLabel(sourceBlockLabel, traceLabel(portName, n), quantity, unit))
    : [channelLabel];

  return {
    connected: true,
    name: `Channel ${channelIndex + 1}`,
    dataType,
    portName,
    blockLabel: sourceBlockLabel,
    fullName: `Channel ${channelIndex + 1}: ${sourceBlockLabel}.${portName} (${dataType})`,
    portId: sourcePortId,
    quantity,
    unit,
    channelLabel,
    width: shape.width,
    channelNames: shape.channelNames,
    traceKeys,
    traceLabels,
  };
}


export function calculateSignalStatistics(data: any[], signalKey: string): SignalStatistics {
  if (!data || data.length === 0) {
    return { min: 0, max: 0, peakToPeak: 0, mean: 0, rms: 0, count: 0 };
  }

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let sumSquares = 0;
  let count = 0;

  for (let i = 0; i < data.length; i++) {
    const pt = data[i];
    const val = pt[signalKey] !== undefined ? pt[signalKey] : (signalKey === 'in1' && pt.value !== undefined ? pt.value : undefined);
    if (typeof val === 'number' && Number.isFinite(val)) {
      if (val < min) min = val;
      if (val > max) max = val;
      sum += val;
      sumSquares += val * val;
      count++;
    }
  }

  if (count === 0) {
    return { min: 0, max: 0, peakToPeak: 0, mean: 0, rms: 0, count: 0 };
  }

  const mean = sum / count;
  const rms = Math.sqrt(sumSquares / count);
  const peakToPeak = max - min;

  return { min, max, peakToPeak, mean, rms, count };
}

export function calculateCursorDeltas(
  cursor1: { t: number; val?: number },
  cursor2: { t: number; val?: number }
): CursorDelta {
  const deltaT = Math.abs(cursor2.t - cursor1.t);
  const v1 = cursor1.val ?? 0;
  const v2 = cursor2.val ?? 0;
  const deltaY = Math.abs(v2 - v1);
  const frequency = deltaT > 1e-9 ? 1 / deltaT : 0;
  const slope = deltaT > 1e-9 ? (v2 - v1) / (cursor2.t - cursor1.t) : 0;

  return { deltaT, deltaY, frequency, slope };
}

export function calculateAutoScaleRange(
  data: any[],
  signalKeys: string[],
  headroomFactor = 0.1
): [number, number] {
  if (!data || data.length === 0 || !signalKeys || signalKeys.length === 0) {
    return [-10, 10];
  }

  let globalMin = Infinity;
  let globalMax = -Infinity;

  for (const pt of data) {
    for (const key of signalKeys) {
      const val = pt[key] !== undefined ? pt[key] : (key === 'in1' && pt.value !== undefined ? pt.value : undefined);
      if (typeof val === 'number' && Number.isFinite(val)) {
        if (val < globalMin) globalMin = val;
        if (val > globalMax) globalMax = val;
      }
    }
  }

  if (!Number.isFinite(globalMin) || !Number.isFinite(globalMax)) {
    return [-10, 10];
  }

  if (Math.abs(globalMax - globalMin) < 1e-6) {
    const center = globalMin;
    const span = Math.abs(center) > 1e-3 ? Math.abs(center) * 0.5 : 1.0;
    return [center - span, center + span];
  }

  const span = globalMax - globalMin;
  const padding = span * headroomFactor;
  return [globalMin - padding, globalMax + padding];
}

export function exportScopeToCSV(
  title: string,
  displayData: any[],
  signalInfos: VLabSignalInfo[]
): string {
  // one column per trace: a width-N channel contributes N columns `in<k>[<name>]` (WP-09c)
  const columns = signalInfos.flatMap((s, i) => (s.traceKeys && s.traceKeys.length > 1
    ? s.traceKeys.map((key, k) => ({ key, label: s.traceLabels[k], scalarFirst: false }))
    : [{ key: `in${i + 1}`, label: s.channelLabel || s.fullName, scalarFirst: i === 0 }]));
  const headers = ['Time (s)', ...columns.map(c => `"${c.label.replace(/"/g, '""')}"`)].join(',');
  const rows = displayData.map(pt => {
    const timeVal = (pt.time !== undefined ? pt.time : pt.t || 0).toFixed(3);
    const signalVals = columns.map(col => {
      const key = col.key;
      const val = pt[key] !== undefined ? pt[key] : (col.scalarFirst && pt.value !== undefined ? pt.value : undefined);
      // A missing channel sample is an empty cell, never a fabricated 0.
      return typeof val === 'number' ? val : (val === undefined || val === null ? '' : (val ? 1 : 0));
    });
    return [timeVal, ...signalVals].join(',');
  });

  return [headers, ...rows].join('\n');
}
