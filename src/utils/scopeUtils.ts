// src/utils/scopeUtils.ts

export interface VLabSignalInfo {
  connected: boolean;
  name: string;
  dataType: string;
  portName: string;
  blockLabel: string;
  fullName: string;
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

export function getVLabSignalInfo(
  scopeNodeId: string,
  channelIndex: number,
  nodes: any[],
  edges: any[],
  history: any[] = []
): VLabSignalInfo {
  const targetPortId = `in${channelIndex + 1}`;
  const edge = edges?.find(
    (e: any) =>
      e.target === scopeNodeId &&
      (e.targetHandle === targetPortId ||
        (channelIndex === 0 && (e.targetHandle === 'in1_t' || e.targetHandle === 'in1')))
  );

  if (!edge) {
    return {
      connected: false,
      name: `Channel ${channelIndex + 1}`,
      dataType: 'auto',
      portName: targetPortId,
      blockLabel: 'Unconnected',
      fullName: `Channel ${channelIndex + 1}: Unconnected (auto)`
    };
  }

  const sourceNode = nodes?.find((n: any) => n.id === edge.source);
  const sourceBlockLabel = sourceNode
    ? sourceNode.data?.label || sourceNode.data?.name || sourceNode.data?.type || edge.source
    : edge.source;

  const sourcePortObj = sourceNode?.data?.outputs?.find(
    (p: any) => p.id === edge.sourceHandle || p.name === edge.sourceHandle
  );
  const portName = sourcePortObj?.name || sourcePortObj?.label || edge.sourceHandle || 'out';

  let baseType = sourcePortObj?.dataType || 'double';

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

  return {
    connected: true,
    name: `Channel ${channelIndex + 1}`,
    dataType,
    portName,
    blockLabel: sourceBlockLabel,
    fullName: `Channel ${channelIndex + 1}: ${sourceBlockLabel}.${portName} (${dataType})`
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
  const headers = ['Time (s)', ...signalInfos.map(s => `"${s.fullName.replace(/"/g, '""')}"`)].join(',');
  const rows = displayData.map(pt => {
    const timeVal = (pt.time !== undefined ? pt.time : pt.t || 0).toFixed(3);
    const signalVals = signalInfos.map((_, i) => {
      const key = `in${i + 1}`;
      const val = pt[key] !== undefined ? pt[key] : (i === 0 && pt.value !== undefined ? pt.value : 0);
      return typeof val === 'number' ? val : (val ? 1 : 0);
    });
    return [timeVal, ...signalVals].join(',');
  });

  return [headers, ...rows].join('\n');
}
