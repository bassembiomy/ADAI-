// src/utils/scopeUtils.ts

export interface VLabSignalInfo {
  connected: boolean;
  name: string;
  dataType: string;
  portName: string;
  blockLabel: string;
  fullName: string;
}

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

export const VLAB_SIGNAL_COLORS = [
  '#10b981', // Emerald
  '#3b82f6', // Blue
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#8b5cf6', // Purple
  '#06b6d4', // Cyan
  '#ef4444', // Red
  '#84cc16'  // Lime
];
