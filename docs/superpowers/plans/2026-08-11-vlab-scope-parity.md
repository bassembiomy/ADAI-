# VLab Scope Feature & Specification Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement full feature and specification parity for VLab Scope based on XBridges Scope (dynamic 1–8 input ports, signal auto-detection in legend, CSV data export, live settings popover, buffer/decimation parameters).

**Architecture:** Create a shared scope helper module `src/utils/scopeUtils.ts` to manage signal metadata resolution, parameter normalization, and CSV formatting. Update `vlabLibrary.ts` and `VLabWorkspace.tsx` to handle dynamic port generation and edge cleanup. Upgrade `VLabScopeWindow` and `ScopeView` to include interactive controls, settings popover, and CSV export.

**Tech Stack:** React, TypeScript, Lucide React, Recharts, Vitest/Jest.

## Global Constraints

- Preserve VLab's existing dark theme visual aesthetics (glossy overlay & grid).
- Clamped 1 to 8 multi-channel ports for Scope.
- Cleanly filter out orphaned edges when port count decreases.

---

### Task 1: Create Shared Scope Utilities (`scopeUtils.ts`) and Unit Tests

**Files:**
- Create: `src/utils/scopeUtils.ts`
- Create: `src/utils/scopeUtils.test.ts`

**Interfaces:**
- Consumes: Node & Edge data arrays from workspace state.
- Produces: `getVLabSignalInfo(nodeId, channelIndex, nodes, edges, history)`, `exportScopeToCSV(title, displayData, signalInfos)`.

- [ ] **Step 1: Write failing test for `getVLabSignalInfo` and `exportScopeToCSV`**

```ts
// src/utils/scopeUtils.test.ts
import { describe, it, expect } from 'vitest';
import { getVLabSignalInfo, exportScopeToCSV } from './scopeUtils';

describe('scopeUtils', () => {
  it('resolves connected source block, port label, and data type', () => {
    const nodes = [
      { id: 'sensor1', data: { label: 'Voltage Sensor', outputs: [{ id: 'v_s', name: 'v_s', dataType: 'double' }] } },
      { id: 'scope1', data: { type: 'scope' } }
    ];
    const edges = [
      { id: 'e1', source: 'sensor1', target: 'scope1', sourceHandle: 'v_s', targetHandle: 'in1' }
    ];

    const info = getVLabSignalInfo('scope1', 0, nodes, edges, []);
    expect(info.connected).toBe(true);
    expect(info.blockLabel).toBe('Voltage Sensor');
    expect(info.portName).toBe('v_s');
    expect(info.dataType).toBe('double');
    expect(info.fullName).toBe('Channel 1: Voltage Sensor.v_s (double)');
  });

  it('formats scope data into CSV string', () => {
    const signalInfos = [
      { connected: true, fullName: 'Channel 1: Sensor.out (double)' }
    ];
    const displayData = [
      { time: 0, in1: 5.0 },
      { time: 0.1, in1: 10.0 }
    ];

    const csv = exportScopeToCSV('TestScope', displayData, signalInfos);
    expect(csv).toContain('Time (s),"Channel 1: Sensor.out (double)"');
    expect(csv).toContain('0.000,5');
    expect(csv).toContain('0.100,10');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test src/utils/scopeUtils.test.ts`
Expected: FAIL with module not found or functions undefined.

- [ ] **Step 3: Implement `src/utils/scopeUtils.ts`**

```ts
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
  history: any[]
): VLabSignalInfo {
  const targetPortId = `in${channelIndex + 1}`;
  const edge = edges?.find(
    (e: any) => e.target === scopeNodeId && (e.targetHandle === targetPortId || (channelIndex === 0 && (e.targetHandle === 'in1_t' || e.targetHandle === 'in1')))
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
  const sourceBlockLabel = sourceNode ? (sourceNode.data?.label || sourceNode.data?.name || sourceNode.data?.type || edge.source) : edge.source;

  const sourcePortObj = sourceNode?.data?.outputs?.find((p: any) => p.id === edge.sourceHandle || p.name === edge.sourceHandle);
  const portName = sourcePortObj?.name || sourcePortObj?.label || edge.sourceHandle || 'out';

  let baseType = sourcePortObj?.dataType || 'double';
  return {
    connected: true,
    name: `Channel ${channelIndex + 1}`,
    dataType: baseType,
    portName,
    blockLabel: sourceBlockLabel,
    fullName: `Channel ${channelIndex + 1}: ${sourceBlockLabel}.${portName} (${baseType})`
  };
}

export function exportScopeToCSV(
  title: string,
  displayData: any[],
  signalInfos: VLabSignalInfo[]
): string {
  const headers = ['Time (s)', ...signalInfos.map(s => `"${s.fullName}"`)].join(',');
  const rows = displayData.map(pt => {
    const timeVal = (pt.time !== undefined ? pt.time : pt.t || 0).toFixed(3);
    const signalVals = signalInfos.map((_, i) => {
      const key = `in${i + 1}`;
      const val = pt[key] !== undefined ? pt[key] : (i === 0 && pt.value !== undefined ? pt.value : 0);
      return val;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test src/utils/scopeUtils.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/scopeUtils.ts src/utils/scopeUtils.test.ts
git commit -m "feat(vlab): add scopeUtils helper module for signal inspection and CSV export"
```

---

### Task 2: Standardize Scope Block Specs & Dynamic Multi-Channel Input Handling

**Files:**
- Modify: `src/utils/vlabLibrary.ts:222-235`
- Modify: `src/components/vlab/VLabWorkspace.tsx:3677-3686`

**Interfaces:**
- Consumes: Node parameter update callbacks in VLabWorkspace.
- Produces: Dynamic input ports (`in1`..`inN`) and safe edge removal on port count reduction.

- [ ] **Step 1: Write test for dynamic scope port generation**

```ts
// src/components/vlab/vlabScopeDynamicPorts.test.ts
import { describe, it, expect } from 'vitest';
import { vlabLibrary } from '../../utils/vlabLibrary';

describe('vlabLibrary scope spec', () => {
  it('contains full XBridges parameter suite', () => {
    const scopeItem = vlabLibrary.find(cat => cat.category === 'Sinks')?.items.find(i => i.id === 'scope');
    expect(scopeItem).toBeDefined();
    expect(scopeItem?.params.numSignals).toBeDefined();
    expect(scopeItem?.params.buffer_size).toBeDefined();
    expect(scopeItem?.params.limit_data_points).toBeDefined();
    expect(scopeItem?.params.decimation).toBeDefined();
    expect(scopeItem?.params.sample_time).toBeDefined();
    expect(scopeItem?.params.show_grid).toBeDefined();
    expect(scopeItem?.params.show_legend).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify status**

Run: `npm test src/components/vlab/vlabScopeDynamicPorts.test.ts`

- [ ] **Step 3: Update `vlabLibrary.ts` and `VLabWorkspace.tsx`**

In `src/utils/vlabLibrary.ts`:
Ensure `scope` block definition includes all scope params.

In `src/components/vlab/VLabWorkspace.tsx`:
Update param change handler for scope `numSignals` / `numPorts`:
```ts
if (n.data.type === 'scope' && (paramKey === 'numSignals' || paramKey === 'numPorts')) {
  const num = Math.max(1, Math.min(8, Number(value) || 1));
  updatedData.ports = Array.from({ length: num }, (_, i) => ({
    id: `in${i + 1}`,
    pos: 'left',
    label: `${i + 1}`,
    domain: 'Physical'
  }));

  // Clean up edges targeting removed ports if channel count decreased
  setEdges(prevEdges => prevEdges.filter(e => {
    if (e.target !== n.id) return true;
    const targetIdx = parseInt(e.targetHandle?.replace('in', '') || '1', 10);
    return targetIdx <= num;
  }));
}
```

- [ ] **Step 4: Verify tests pass**

Run: `npm test src/components/vlab/vlabScopeDynamicPorts.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/vlabLibrary.ts src/components/vlab/VLabWorkspace.tsx src/components/vlab/vlabScopeDynamicPorts.test.ts
git commit -m "feat(vlab): dynamic multi-channel ports and edge cleanup for scope block"
```

---

### Task 3: Implement Interactive Settings Popover, Signal Inspection & CSV Export in `VLabScopeWindow` & `ScopeView`

**Files:**
- Modify: `src/components/vlab/VLabWorkspace.tsx` (around lines 1876–2250)

**Interfaces:**
- Consumes: Scope history data, node & edge definitions, parameter change callbacks (`onUpdate`).
- Produces: Live Scope Settings Modal, CSV Export Button, Signal Metadata Inspection Legend, and Zoom/Autoscale controls.

- [ ] **Step 1: Add Scope Settings Modal & CSV Download logic to `VLabScopeWindow` & `ScopeView`**

In `src/components/vlab/VLabWorkspace.tsx`:

1. Import `getVLabSignalInfo`, `exportScopeToCSV`, `VLAB_SIGNAL_COLORS` from `../../utils/scopeUtils`.
2. Add Scope Settings Dialog component (`ScopeSettingsPopover` / modal inside `VLabScopeWindow`).
3. Add CSV Export button to toolbar:
```tsx
const handleDownloadCSV = () => {
  const csvContent = exportScopeToCSV(title || 'VLabScope', displayData, signalInfos);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${title || 'scope'}_data_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
```
4. Render connected block source names and types in the Legend bar using `signalInfos`.
5. Support multi-line area/line rendering for up to 8 channels using `VLAB_SIGNAL_COLORS`.

- [ ] **Step 2: Verify build and test suite**

Run: `npm test`

- [ ] **Step 3: Commit**

```bash
git add src/components/vlab/VLabWorkspace.tsx
git commit -m "feat(vlab): add scope settings modal, signal metadata legend, and CSV export"
```

---

### Task 4: End-to-End Verification & Walkthrough

**Files:**
- Test workspace: VLab canvas with Scope block.

- [ ] **Step 1: Verify dev server build**

Check running dev server terminal output for zero TypeScript/compilation errors.

- [ ] **Step 2: Create walkthrough summary**

Document all completed scope parity features in `walkthrough.md`.
