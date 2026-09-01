# VLab Schematic Component Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the outer card/block wrappers from VLab components so they render as clean schematic symbols with pinned terminal ports and instance labels directly on the canvas.

**Architecture:** Update ReactFlow node container styles in CSS to be completely transparent/borderless for VLab nodes, and refactor `VLabNode.tsx` to streamline the layout to pure SVG symbols, perimeter port handles, and instance labels without outer cards or redundant type headers.

**Tech Stack:** React, TypeScript, ReactFlow, Tailwind / CSS, Vitest, React Testing Library.

## Global Constraints
- Do not affect standard non-VLab nodes if any exist elsewhere in the application.
- Preserve full interactive capability: node dragging, selection, rotation, handle connection hitboxes, and hover feedback.
- Clean high-contrast typography in both dark and light modes.

---

### Task 1: Add Unit Tests for VLab Schematic Node Presentation

**Files:**
- Create: `src/components/vlab/VLabNode.test.tsx`

**Interfaces:**
- Consumes: `VLabNode` from `src/components/vlab/VLabNode.tsx`
- Produces: Test suite verifying transparent schematic node rendering and label structure

- [ ] **Step 1: Write the failing test**

```tsx
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ReactFlowProvider } from 'reactflow';
import { VLabNode } from './VLabNode';

describe('VLabNode Schematic Presentation', () => {
  it('renders schematic symbol and instance label without upper type header', () => {
    const data = {
      type: 'resistor',
      label: 'R1',
      color: '#3b82f6',
      rotation: 0,
      ports: [
        { id: 'p1', pos: 'left', label: '+' },
        { id: 'p2', pos: 'right', label: '-' }
      ]
    };

    const { container, queryByText, getByText } = render(
      <ReactFlowProvider>
        <VLabNode id="node_1" data={data} selected={false} />
      </ReactFlowProvider>
    );

    // Instance label should be rendered
    expect(getByText('R1')).toBeDefined();

    // Redundant uppercase type header should not be present
    expect(queryByText('RESISTOR')).toBeNull();

    // The node root element has vlab-node class
    const nodeRoot = container.querySelector('.vlab-node');
    expect(nodeRoot).toBeDefined();
  });

  it('applies symbol-bright highlighting when selected', () => {
    const data = {
      type: 'dc_voltage',
      label: 'V1',
      color: '#ef4444',
      rotation: 0,
      ports: []
    };

    const { container } = render(
      <ReactFlowProvider>
        <VLabNode id="node_2" data={data} selected={true} />
      </ReactFlowProvider>
    );

    expect(container.querySelector('.symbol-bright')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/vlab/VLabNode.test.tsx`
Expected: FAIL (because type header `'RESISTOR'` is currently rendered in `VLabNode.tsx`)

---

### Task 2: Refactor VLabNode Component for Pure Schematic Presentation

**Files:**
- Modify: `src/components/vlab/VLabNode.tsx`

**Interfaces:**
- Consumes: `SymbolRenderer`, `getBlockDimensions`, `VLAB_LIBRARY`
- Produces: `VLabNode` component rendering clean schematic symbol and label

- [ ] **Step 1: Update `VLabNode.tsx`**

Remove the upper redundant type caption header and bulky pill styling from the instance label:

```tsx
import React, { useCallback, useEffect } from 'react';
import { Handle, Position, useUpdateNodeInternals, useStore } from 'reactflow';
import { Activity } from 'lucide-react';
import { SymbolRenderer } from './VLabSymbols';
import { getBlockDimensions } from './blockDimensions';

export const getRotatedPosition = (originalPos: Position, rotation: number): Position => {
  const normRot = ((rotation % 360) + 360) % 360;
  if (normRot === 0) return originalPos;
  const posOrder = [Position.Top, Position.Right, Position.Bottom, Position.Left];
  const origIdx = posOrder.indexOf(originalPos);
  if (origIdx === -1) return originalPos;
  const shift = Math.round(normRot / 90);
  return posOrder[(origIdx + shift) % 4];
};

export const NodeErrorBoundary = class extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: any) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: any, errorInfo: any) { console.error('VLab Node Error:', error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 border border-red-500/50 bg-red-900/20 text-red-400 rounded-lg flex flex-col items-center justify-center text-center">
          <Activity size={24} className="mb-2 opacity-50" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Rendering Failure</span>
          <span className="text-[8px] opacity-70">Check console for details</span>
        </div>
      );
    }
    return this.props.children;
  }
};

export const VLabNode = ({ id, data, selected }: { id: string; data: any; selected: boolean }) => {
  const updateNodeInternals = useUpdateNodeInternals();
  const rotation = data.rotation || 0;

  useEffect(() => { updateNodeInternals(id); }, [id, rotation, updateNodeInternals]);

  const rawPorts = data.ports || [
    ...(data.inputs || []).map((p: any) => ({ ...p, pos: p.pos || p.position || 'left' })),
    ...(data.outputs || []).map((p: any) => ({ ...p, pos: p.pos || p.position || 'right' }))
  ];

  const portsBySide = rawPorts.reduce((acc: any, port: any) => {
    if (!port) return acc;
    const side = port.pos || port.position || 'left';
    if (!acc[side]) acc[side] = [];
    acc[side].push(port);
    return acc;
  }, {});

  const { width, height } = getBlockDimensions(data.type);

  // Handles referenced by an edge -> solid fill feedback ("connected dot")
  const connectedHandles = useStore(useCallback((s: any) => {
    const set = new Set<string>();
    for (const e of s.edges) {
      if (e.source === id && e.sourceHandle) set.add(e.sourceHandle);
      if (e.target === id && e.targetHandle) set.add(e.targetHandle);
    }
    return set;
  }, [id]));

  return (
    <div
      data-selected={selected ? 'true' : 'false'}
      className={`vlab-node relative group flex flex-col items-center transition-all ${selected ? 'z-50' : 'z-10'}`}
      onMouseDown={(e) => data.onNodeMouseDown && data.onNodeMouseDown(e)}
    >
      {/* Symbol & Port Container */}
      <div className="relative flex items-center justify-center" style={{ width, height, transform: `rotate(${rotation}deg)` }}>
        {Object.entries(portsBySide).map(([side, sidePorts]: [any, any]) =>
          sidePorts.map((port: any, index: number) => {
            const totalOnSide = sidePorts.length;
            const offset = totalOnSide > 1 ? (index - (totalOnSide - 1) / 2) * 20 : 0;
            const position = side === 'left' ? Position.Left :
              side === 'right' ? Position.Right :
                side === 'top' ? Position.Top : Position.Bottom;
            const rotatedPos = getRotatedPosition(position, rotation);
            const handleId = `${id}-${port.id}`;
            const isConnected = connectedHandles.has(handleId);
            const pc = data.color || '#3b82f6';

            return (
              <div key={port.id} className="absolute"
                style={{
                  width: 12, height: 12,
                  top: (side === 'left' || side === 'right') ? `calc(50% + ${offset}px - 6px)` : (side === 'top' ? '-6px' : 'calc(100% - 6px)'),
                  left: (side === 'top' || side === 'bottom') ? `calc(50% + ${offset}px - 6px)` : (side === 'left' ? '-6px' : 'calc(100% - 6px)')
                }}>
                <Handle
                  type="source"
                  position={rotatedPos}
                  id={handleId}
                  className={isConnected ? 'vlab-handle vlab-handle-connected' : 'vlab-handle'}
                  style={{ ['--pc' as any]: pc }}
                />
                {/* Port label */}
                <div className="absolute text-[8px] font-bold select-none pointer-events-none uppercase whitespace-nowrap"
                  style={{
                    color: isConnected ? pc : '#9a9aac',
                    top: side === 'top' ? -16 : side === 'bottom' ? 16 : 0,
                    left: side === 'left' ? -14 : side === 'right' ? 14 : 0,
                    transform: (side === 'left' || side === 'right') ? `translateY(-50%) rotate(${-rotation}deg)` : `translateX(-50%) rotate(${-rotation}deg)`
                  }}>
                  {port.label}
                </div>
              </div>
            );
          })
        )}

        {/* The SVG Symbol */}
        <div className={selected ? 'symbol-bright' : ''}>
          <SymbolRenderer type={data.type} color={data.color} />
        </div>
      </div>

      {/* Clean instance label beneath the symbol */}
      {data.label && (
        <div className={`mt-1.5 text-[11px] font-medium tracking-wide transition-colors select-none pointer-events-none max-w-[140px] truncate text-center ${
          selected
            ? 'text-purple-300 font-semibold drop-shadow-[0_0_8px_rgba(168,85,247,0.4)]'
            : 'text-zinc-400'
        }`}>
          {data.label}
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Run unit test to verify it passes**

Run: `npx vitest run src/components/vlab/VLabNode.test.tsx`
Expected: PASS

---

### Task 3: Update CSS for Seamless Schematic Canvas Presentation

**Files:**
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `.react-flow__node` selectors
- Produces: Transparent container rules scoped to VLab nodes

- [ ] **Step 1: Add transparent node styling in `src/index.css`**

Add rules ensuring `.react-flow__node:has(.vlab-node)` and `.react-flow__node-vlabNode` have transparent background, zero border, and zero box shadow:

```css
/* VLab Schematic Node Styling: Clean floating symbols without card/board wrappers */
.react-flow__node:has(.vlab-node),
.react-flow__node-vlabNode,
.vlab-node {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  padding: 0 !important;
}
```

- [ ] **Step 2: Run all VLab test suites**

Run: `npx vitest run src/components/vlab/`
Expected: PASS (all tests pass)

---

### Task 4: Full Verification and Visual Sanity Check

- [ ] **Step 1: Run comprehensive tests**
Run: `npx vitest run src/components/vlab/`
Expected: All suites green.

- [ ] **Step 2: Build validation**
Run: `npm run build` or `npx tsc --noEmit`
Expected: Clean compilation with 0 errors.
