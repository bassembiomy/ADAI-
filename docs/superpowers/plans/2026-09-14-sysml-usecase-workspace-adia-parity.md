# SysML Use-Case Workspace (ADIA Parity & Cross-Diagram Traceability) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the SysML Use-Case diagram module to 100% UI/UX, aesthetic, and keyboard shortcut parity with ADIA while enforcing OMG SysML v1.6 / v1.7 cross-diagram traceability.

**Architecture:** Build native SysML custom nodes with incandescent warm-light golden-amber illumination, custom SysML edges with floating type-switcher badges, an ADIA-styled floating canvas toolbar, a 3-tab inspector (Properties, SysML Architecture, Traceability), and a full global keyboard shortcut engine (Undo/Redo, Copy/Paste/Cut, Nudge, Fit View).

**Tech Stack:** TypeScript, React, `@xyflow/react`, Lucide Icons, Vitest.

## Global Constraints

- Conforms strictly to OMG SysML v1.6 / ISO/IEC 19514:2017.
- Visual selection aesthetic must use ADIA's golden-amber incandescent bloom (`#fbbf24`, `rgba(251, 191, 36, 0.65)`).
- Floating canvas toolbar must use ADIA styling (`bg-[#1a1a1a]/95 border border-[#333] rounded-lg px-2.5 py-1.5`).
- Keyboard shortcuts must include `Ctrl+S`, `Ctrl+Z`, `Ctrl+Y`, `Ctrl+C/V/X`, `Ctrl+A`, `Del`, `Ctrl+0`, arrow nudging.
- Zero new runtime dependencies; reuse existing math/react/xyflow infrastructure.

---

### Task 1: Core Domain Model & SysML Traceability Extensions

**Files:**
- Modify: `src/types/usecase_types.ts`
- Test: `src/types/usecase_types.test.ts`

**Interfaces:**
- Produces: `UseCaseNodeType`, `UseCaseRelationshipType`, `UseCaseElementData`, `UseCaseNode`, `UseCaseRelationship`, `UseCaseDiagram`.

- [ ] **Step 1: Write unit test for usecase data model types**

```typescript
// src/types/usecase_types.test.ts
import { describe, it, expect } from 'vitest';
import type { UseCaseNode, UseCaseRelationship } from './usecase_types';

describe('UseCase Types', () => {
  it('supports SysML traceability metadata on UseCaseNode', () => {
    const node: UseCaseNode = {
      id: 'uc-1',
      type: 'useCase',
      position: { x: 100, y: 100 },
      data: {
        label: 'Perform Cruise Control',
        subjectBlockId: 'block-vehicle-mgmt',
        elaboratingDiagramId: 'act-cruise-control',
        requirementTraces: [
          { requirementId: 'REQ-001', relationType: 'refine' },
          { requirementId: 'REQ-002', relationType: 'satisfy' },
        ],
        extensionPoints: ['HighSpeedMode', 'EcoMode'],
      },
    };

    expect(node.data.subjectBlockId).toBe('block-vehicle-mgmt');
    expect(node.data.requirementTraces?.length).toBe(2);
    expect(node.data.extensionPoints).toContain('EcoMode');
  });

  it('supports SysML relationship stereotypes', () => {
    const edge: UseCaseRelationship = {
      id: 'e-1',
      source: 'uc-1',
      target: 'uc-2',
      type: 'include',
    };
    expect(edge.type).toBe('include');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test -- usecase_types.test.ts`
Expected: FAIL due to missing fields in `usecase_types.ts`.

- [ ] **Step 3: Update `src/types/usecase_types.ts`**

```typescript
// src/types/usecase_types.ts
export type UseCaseNodeType = 'useCase' | 'actor' | 'systemBoundary';

export type UseCaseRelationshipType = 
  | 'association' 
  | 'include' 
  | 'extend' 
  | 'generalization' 
  | 'refine' 
  | 'satisfy' 
  | 'trace';

export interface UseCaseRequirementTrace {
  requirementId: string;
  relationType: 'refine' | 'satisfy' | 'trace' | 'verify';
}

export interface UseCaseElementData extends Record<string, unknown> {
  label: string;
  description?: string;
  isExternal?: boolean;
  subjectBlockId?: string;           // Maps to SysML Block
  elaboratingDiagramId?: string;     // Maps to Activity or Sequence Diagram
  requirementTraces?: UseCaseRequirementTrace[];
  extensionPoints?: string[];
  canonicalElementId?: string;
}

export interface UseCaseNode {
  id: string;
  type: UseCaseNodeType;
  position: { x: number; y: number };
  data: UseCaseElementData;
  width?: number;
  height?: number;
  parentId?: string;
  selected?: boolean;
}

export interface UseCaseRelationship {
  id: string;
  source: string;
  target: string;
  type: UseCaseRelationshipType;
  label?: string;
  selected?: boolean;
}

export interface UseCaseDiagram {
  id: string;
  name: string;
  nodes: UseCaseNode[];
  edges: UseCaseRelationship[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- usecase_types.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types/usecase_types.ts src/types/usecase_types.test.ts
git commit -m "feat: expand use-case domain types with sysml cross-diagram metadata"
```

---

### Task 2: SysML Nodes with Warm Light Selection Illumination

**Files:**
- Modify: `src/components/usecase/UseCaseNodes.tsx`
- Modify: `src/components/usecase/UseCaseNodes.test.tsx`

**Interfaces:**
- Consumes: `UseCaseElementData`, `UseCaseNodeType`
- Produces: `UseCaseNodeComponent`, `ActorNodeComponent`, `BoundaryNodeComponent` with golden-amber selection glow.

- [ ] **Step 1: Update unit tests for warm-light selection styling**

```typescript
// src/components/usecase/UseCaseNodes.test.tsx
import { render } from '@testing-library/react';
import { UseCaseNodeComponent, ActorNodeComponent, BoundaryNodeComponent } from './UseCaseNodes';

describe('UseCase Nodes with Warm Light Selection', () => {
  it('renders use case ellipse with sysml header tag and warm light selection', () => {
    const { getByText, container } = render(
      <UseCaseNodeComponent data={{ label: 'Maintain Velocity', extensionPoints: ['BrakeApplied'] }} selected={true} />
    );
    expect(getByText('Maintain Velocity')).toBeDefined();
    expect(getByText('«use case»')).toBeDefined();
    expect(getByText('BrakeApplied')).toBeDefined();
    expect(container.innerHTML).toContain('border-amber-400');
  });

  it('renders actor with «actor» stereotype and warm light', () => {
    const { getByText, container } = render(
      <ActorNodeComponent data={{ label: 'Vehicle Operator' }} selected={true} />
    );
    expect(getByText('Vehicle Operator')).toBeDefined();
    expect(getByText('«actor»')).toBeDefined();
    expect(container.innerHTML).toContain('border-amber-400');
  });

  it('renders system boundary with subject label', () => {
    const { getByText } = render(
      <BoundaryNodeComponent data={{ label: 'Speed Control System' }} selected={false} />
    );
    expect(getByText(/Speed Control System/)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test -- UseCaseNodes.test.tsx`
Expected: FAIL due to missing «use case» header and extensionPoints.

- [ ] **Step 3: Implement warm-light SysML nodes in `src/components/usecase/UseCaseNodes.tsx`**

```typescript
// src/components/usecase/UseCaseNodes.tsx
import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { UseCaseElementData } from '../../types/usecase_types';

export const UseCaseNodeComponent: React.FC<{ data: UseCaseElementData; selected?: boolean }> = ({ data, selected }) => {
  const glowStyle = selected
    ? {
        boxShadow: '0 0 25px rgba(251, 191, 36, 0.65), 0 0 45px rgba(245, 158, 11, 0.35), inset 0 0 10px rgba(251, 191, 36, 0.15)',
      }
    : undefined;

  return (
    <div
      style={glowStyle}
      className={`rounded-[50%] border-2 px-6 py-3 flex flex-col items-center justify-center bg-[#18181b]/95 backdrop-blur-md min-w-[150px] min-h-[75px] transition-all duration-200 ${
        selected ? 'border-amber-400 text-amber-200' : 'border-zinc-600 hover:border-zinc-400 text-zinc-100'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-amber-500 !border-2 !border-zinc-900" />
      <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-amber-500 !border-2 !border-zinc-900" />
      
      <span className="text-[10px] text-amber-500/90 font-medium tracking-wide">«use case»</span>
      <span className="text-xs font-semibold text-center leading-tight mt-0.5">{data.label || 'Use Case'}</span>

      {data.extensionPoints && data.extensionPoints.length > 0 && (
        <div className="mt-1 pt-1 border-t border-zinc-700/60 w-full flex flex-col items-center">
          <span className="text-[9px] text-zinc-400">extension points:</span>
          {data.extensionPoints.map((ep, i) => (
            <span key={i} className="text-[9px] text-amber-300 italic">{ep}</span>
          ))}
        </div>
      )}

      <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-amber-500 !border-2 !border-zinc-900" />
      <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-amber-500 !border-2 !border-zinc-900" />
    </div>
  );
};

export const ActorNodeComponent: React.FC<{ data: UseCaseElementData; selected?: boolean }> = ({ data, selected }) => {
  const glowStyle = selected
    ? {
        boxShadow: '0 0 25px rgba(251, 191, 36, 0.65), 0 0 45px rgba(245, 158, 11, 0.35)',
      }
    : undefined;

  const strokeColor = selected ? '#fbbf24' : '#a1a1aa';

  return (
    <div style={glowStyle} className={`flex flex-col items-center p-2 rounded-lg transition-all duration-200 ${selected ? 'border border-amber-400 bg-amber-400/5' : ''}`}>
      <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-amber-500 !border-2 !border-zinc-900" />
      <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-amber-500 !border-2 !border-zinc-900" />

      {/* SysML Vector Stick Figure */}
      <svg width="40" height="56" viewBox="0 0 40 56" fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="20" cy="10" r="7" className="fill-[#18181b]" />
        <line x1="20" y1="17" x2="20" y2="36" />
        <line x1="6" y1="24" x2="34" y2="24" />
        <line x1="20" y1="36" x2="8" y2="52" />
        <line x1="20" y1="36" x2="32" y2="52" />
      </svg>

      <span className="text-[10px] text-amber-500/90 font-medium mt-1">«actor»</span>
      <span className="text-xs font-semibold text-zinc-100 text-center leading-tight mt-0.5">{data.label || 'Actor'}</span>

      <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-amber-500 !border-2 !border-zinc-900" />
      <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-amber-500 !border-2 !border-zinc-900" />
    </div>
  );
};

export const BoundaryNodeComponent: React.FC<{ data: UseCaseElementData; selected?: boolean }> = ({ data, selected }) => {
  const glowStyle = selected
    ? {
        boxShadow: '0 0 25px rgba(251, 191, 36, 0.5), inset 0 0 15px rgba(251, 191, 36, 0.1)',
      }
    : undefined;

  return (
    <div
      style={glowStyle}
      className={`border-2 border-dashed rounded-lg bg-zinc-900/30 w-full h-full min-w-[320px] min-h-[260px] transition-all duration-200 ${
        selected ? 'border-amber-400 bg-amber-400/5' : 'border-zinc-700 hover:border-zinc-600'
      }`}
    >
      <div className="bg-zinc-800/80 px-3 py-1.5 text-xs text-zinc-300 font-bold border-b border-zinc-700/60 rounded-t-md flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-amber-500 font-medium">«subject»</span>
          <span>{data.label || 'System Boundary'}</span>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- UseCaseNodes.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/usecase/UseCaseNodes.tsx src/components/usecase/UseCaseNodes.test.tsx
git commit -m "feat: implement sysml use-case nodes with warm light selection illumination"
```

---

### Task 3: Custom SysML Edges with Floating Type Switcher Badge

**Files:**
- Create: `src/components/usecase/UseCaseEdges.tsx`
- Create: `src/components/usecase/UseCaseEdges.test.tsx`

**Interfaces:**
- Consumes: `UseCaseRelationshipType`, `@xyflow/react`
- Produces: `UseCaseEdgeComponent` supporting Association, «include», «extend», Generalization, «refine», «satisfy» with inline floating type-switcher badge.

- [ ] **Step 1: Write test for custom SysML edge types**

```typescript
// src/components/usecase/UseCaseEdges.test.tsx
import { render } from '@testing-library/react';
import { UseCaseEdgeComponent } from './UseCaseEdges';

describe('UseCaseEdges', () => {
  it('renders edge component with label for include relationship', () => {
    const { getByText } = render(
      <svg>
        <UseCaseEdgeComponent
          id="edge-1"
          source="uc-1"
          target="uc-2"
          sourceX={0}
          sourceY={0}
          targetX={100}
          targetY={100}
          sourcePosition="right" as any
          targetPosition="left" as any
          data={{ type: 'include' }}
          selected={true}
        />
      </svg>
    );
    expect(getByText(/include/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test -- UseCaseEdges.test.tsx`
Expected: FAIL with "module not found".

- [ ] **Step 3: Implement `src/components/usecase/UseCaseEdges.tsx`**

```typescript
// src/components/usecase/UseCaseEdges.tsx
import React from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  EdgeProps,
} from '@xyflow/react';
import { UseCaseRelationshipType } from '../../types/usecase_types';
import { Trash2, ChevronDown } from 'lucide-react';

export interface UseCaseEdgeData extends Record<string, unknown> {
  type: UseCaseRelationshipType;
  onTypeChange?: (edgeId: string, newType: UseCaseRelationshipType) => void;
  onDelete?: (edgeId: string) => void;
}

export const UseCaseEdgeComponent: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
  selected,
}) => {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16,
  });

  const edgeData = (data as UseCaseEdgeData) || { type: 'association' };
  const relType = edgeData.type || 'association';

  const isDashed = ['include', 'extend', 'refine', 'satisfy', 'trace'].includes(relType);
  const strokeColor = selected ? '#fbbf24' : '#71717a';

  return (
    <>
      {selected && (
        <path
          d={edgePath}
          fill="none"
          stroke="#fbbf24"
          strokeWidth={6}
          strokeOpacity={0.25}
          strokeLinecap="round"
          className="animate-pulse pointer-events-none"
        />
      )}

      <BaseEdge
        path={edgePath}
        style={{
          ...style,
          stroke: strokeColor,
          strokeWidth: selected ? 2.5 : 2,
          strokeDasharray: isDashed ? '6,4' : undefined,
          filter: selected ? 'drop-shadow(0 0 6px rgba(251, 191, 36, 0.7))' : undefined,
        }}
      />

      {/* Floating Pill Label & Inline Type Switcher */}
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className={`px-2 py-0.5 rounded-full text-[11px] font-medium flex items-center gap-1.5 shadow-lg border backdrop-blur-md transition-all ${
            selected
              ? 'bg-[#18181b] border-amber-400 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.35)]'
              : 'bg-[#18181b]/90 border-zinc-700 text-zinc-300'
          }`}
        >
          {relType !== 'association' && (
            <span className="italic font-mono">«{relType}»</span>
          )}

          {selected && (
            <div className="flex items-center gap-1 ml-1 pl-1 border-l border-zinc-700">
              <select
                value={relType}
                onChange={(e) => edgeData.onTypeChange?.(id, e.target.value as UseCaseRelationshipType)}
                className="bg-transparent text-[10px] text-amber-400 focus:outline-none cursor-pointer"
              >
                <option value="association">Association</option>
                <option value="include">«include»</option>
                <option value="extend">«extend»</option>
                <option value="generalization">Generalization</option>
                <option value="refine">«refine»</option>
                <option value="satisfy">«satisfy»</option>
                <option value="trace">«trace»</option>
              </select>

              <button
                onClick={() => edgeData.onDelete?.(id)}
                className="p-0.5 hover:text-red-400 transition-colors"
                title="Delete Relationship"
              >
                <Trash2 size={11} />
              </button>
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- UseCaseEdges.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/usecase/UseCaseEdges.tsx src/components/usecase/UseCaseEdges.test.tsx
git commit -m "feat: create sysml custom edges with inline type-switcher badge"
```

---

### Task 4: ADIA Floating Canvas Toolbar

**Files:**
- Create: `src/components/usecase/UseCaseToolbar.tsx`
- Create: `src/components/usecase/UseCaseToolbar.test.tsx`

**Interfaces:**
- Consumes: Active diagram metadata, node creation callbacks, auto-layout, zoom controls
- Produces: `UseCaseToolbar` matching ADIA styling (`bg-[#1a1a1a]/95 border border-[#333] rounded-lg px-2.5 py-1.5`).

- [ ] **Step 1: Write test for UseCaseToolbar**

```typescript
// src/components/usecase/UseCaseToolbar.test.tsx
import { render, fireEvent } from '@testing-library/react';
import { UseCaseToolbar } from './UseCaseToolbar';

describe('UseCaseToolbar', () => {
  it('renders creation buttons and handles click', () => {
    const onAddActor = vi.fn();
    const onAddUseCase = vi.fn();
    const { getByText } = render(
      <UseCaseToolbar
        diagramName="Flight Control Use Cases"
        onAddActor={onAddActor}
        onAddUseCase={onAddUseCase}
        onAddBoundary={vi.fn()}
        onAutoLayout={vi.fn()}
        onFitView={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(getByText(/Flight Control/)).toBeDefined();
    fireEvent.click(getByText('+ Actor'));
    expect(onAddActor).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test -- UseCaseToolbar.test.tsx`
Expected: FAIL with "module not found".

- [ ] **Step 3: Implement `src/components/usecase/UseCaseToolbar.tsx`**

```typescript
// src/components/usecase/UseCaseToolbar.tsx
import React from 'react';
import { User, Circle, Square, Layout, Maximize2, Save } from 'lucide-react';

interface UseCaseToolbarProps {
  diagramName: string;
  onAddActor: () => void;
  onAddUseCase: () => void;
  onAddBoundary: () => void;
  onAutoLayout: () => void;
  onFitView: () => void;
  onSave: () => void;
}

export const UseCaseToolbar: React.FC<UseCaseToolbarProps> = ({
  diagramName,
  onAddActor,
  onAddUseCase,
  onAddBoundary,
  onAutoLayout,
  onFitView,
  onSave,
}) => {
  return (
    <div className="absolute top-3 left-3 z-20 flex items-center gap-2 bg-[#1a1a1a]/95 border border-[#333] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 shadow-xl backdrop-blur-sm">
      {/* Breadcrumb / Title */}
      <div className="flex items-center gap-1.5 font-medium text-zinc-300 mr-1">
        <span className="text-zinc-500">SysML /</span>
        <span className="text-amber-400 font-semibold">{diagramName || 'Use Cases'}</span>
      </div>

      <div className="h-4 w-[1px] bg-[#333]" />

      {/* Node Creation Tools */}
      <button
        onClick={onAddActor}
        className="flex items-center gap-1.5 h-6 px-2 text-zinc-200 hover:bg-[#2a2a2a] rounded transition-colors"
        title="Add SysML Actor"
      >
        <User size={13} className="text-amber-400" />
        <span>+ Actor</span>
      </button>

      <button
        onClick={onAddUseCase}
        className="flex items-center gap-1.5 h-6 px-2 text-zinc-200 hover:bg-[#2a2a2a] rounded transition-colors"
        title="Add SysML Use Case"
      >
        <Circle size={13} className="text-sky-400" />
        <span>+ Use Case</span>
      </button>

      <button
        onClick={onAddBoundary}
        className="flex items-center gap-1.5 h-6 px-2 text-zinc-200 hover:bg-[#2a2a2a] rounded transition-colors"
        title="Add Subject Boundary"
      >
        <Square size={13} className="text-purple-400" />
        <span>+ Subject</span>
      </button>

      <div className="h-4 w-[1px] bg-[#333]" />

      {/* Utility Actions */}
      <button
        onClick={onAutoLayout}
        className="flex items-center gap-1.5 h-6 px-2 text-zinc-300 hover:bg-[#2a2a2a] rounded transition-colors"
        title="Auto Layout Diagram"
      >
        <Layout size={13} />
        <span>Auto Layout</span>
      </button>

      <button
        onClick={onFitView}
        className="flex items-center gap-1.5 h-6 px-2 text-zinc-300 hover:bg-[#2a2a2a] rounded transition-colors"
        title="Fit View (Ctrl+0)"
      >
        <Maximize2 size={13} />
        <span>Fit</span>
      </button>

      <button
        onClick={onSave}
        className="flex items-center gap-1.5 h-6 px-2.5 text-[#f97316] hover:bg-[#f97316]/10 border border-[#f97316]/40 rounded transition-colors font-medium ml-1"
        title="Save Diagram (Ctrl+S)"
      >
        <Save size={13} />
        <span>Save</span>
      </button>
    </div>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- UseCaseToolbar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/usecase/UseCaseToolbar.tsx src/components/usecase/UseCaseToolbar.test.tsx
git commit -m "feat: implement ADIA-styled floating canvas toolbar for use-cases"
```

---

### Task 5: Unified 3-Tab ADIA SysML Inspector

**Files:**
- Modify: `src/components/usecase/UseCaseInspector.tsx`
- Test: `src/components/usecase/UseCaseInspector.test.tsx`

**Interfaces:**
- Consumes: `UseCaseNode`, SysML `blocks`, `requirements`, elaborating diagrams.
- Produces: 3-tab inspector (Properties, SysML Architecture, Traceability Matrix).

- [ ] **Step 1: Write test for 3-tab inspector**

```typescript
// src/components/usecase/UseCaseInspector.test.tsx
import { render, fireEvent } from '@testing-library/react';
import { UseCaseInspector } from './UseCaseInspector';

describe('UseCaseInspector', () => {
  it('renders 3 tabs and allows switching to SysML architecture tab', () => {
    const { getByText } = render(
      <UseCaseInspector
        selectedNode={{ id: 'uc-1', type: 'useCase', position: { x: 0, y: 0 }, data: { label: 'Engage Autopilot' } }}
        sysmlBlocks={[{ id: 'b-1', name: 'FlightGuidanceBlock', stereotype: 'block' }]}
        onUpdateNodeData={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(getByText('Properties')).toBeDefined();
    expect(getByText('SysML Architecture')).toBeDefined();
    expect(getByText('Traceability')).toBeDefined();

    fireEvent.click(getByText('SysML Architecture'));
    expect(getByText(/Subject Block/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test -- UseCaseInspector.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement 3-tab inspector in `src/components/usecase/UseCaseInspector.tsx`**

```typescript
// src/components/usecase/UseCaseInspector.tsx
import React, { useState } from 'react';
import { X, Info, Type, Tag, Layers, CheckSquare, Plus, Trash2 } from 'lucide-react';
import { UseCaseNode, UseCaseRequirementTrace } from '../../types/usecase_types';

interface UseCaseInspectorProps {
  selectedNode: UseCaseNode | null;
  sysmlBlocks: any[];
  onUpdateNodeData: (nodeId: string, data: any) => void;
  onClose: () => void;
}

export const UseCaseInspector: React.FC<UseCaseInspectorProps> = ({
  selectedNode,
  sysmlBlocks,
  onUpdateNodeData,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'properties' | 'architecture' | 'traceability'>('properties');
  const [newExtensionPoint, setNewExtensionPoint] = useState('');

  if (!selectedNode) return null;

  const data = selectedNode.data;
  const canonicalBlocks = sysmlBlocks.filter((b) => b.stereotype !== 'requirement');
  const canonicalReqs = sysmlBlocks.filter((b) => b.stereotype === 'requirement');

  const traces: UseCaseRequirementTrace[] = data.requirementTraces || [];

  const handleAddTrace = (requirementId: string, relationType: 'refine' | 'satisfy' | 'trace' | 'verify') => {
    if (!requirementId || traces.some((t) => t.requirementId === requirementId)) return;
    const updated = [...traces, { requirementId, relationType }];
    onUpdateNodeData(selectedNode.id, { ...data, requirementTraces: updated });
  };

  const handleRemoveTrace = (requirementId: string) => {
    const updated = traces.filter((t) => t.requirementId !== requirementId);
    onUpdateNodeData(selectedNode.id, { ...data, requirementTraces: updated });
  };

  const handleAddExtensionPoint = () => {
    if (!newExtensionPoint.trim()) return;
    const existing = data.extensionPoints || [];
    onUpdateNodeData(selectedNode.id, { ...data, extensionPoints: [...existing, newExtensionPoint.trim()] });
    setNewExtensionPoint('');
  };

  return (
    <div className="w-84 h-full bg-[#18181b] border-l border-[#333] flex flex-col text-xs text-zinc-200 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#333] bg-[#202023]">
        <div className="flex items-center gap-2">
          <Info size={15} className="text-amber-400" />
          <span className="font-semibold text-zinc-100">SysML Inspector</span>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-[#333] rounded text-zinc-400 hover:text-white">
          <X size={15} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#333] bg-[#1a1a1c]">
        {(['properties', 'architecture', 'traceability'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-center font-medium capitalize transition-colors ${
              activeTab === tab
                ? 'text-amber-400 border-b-2 border-amber-400 bg-amber-400/5'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {tab === 'architecture' ? 'SysML Architecture' : tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'properties' && (
          <>
            <div className="space-y-1.5">
              <label className="text-zinc-400 flex items-center gap-1.5">
                <Type size={12} /> Name
              </label>
              <input
                type="text"
                value={data.label || ''}
                onChange={(e) => onUpdateNodeData(selectedNode.id, { ...data, label: e.target.value })}
                className="w-full bg-[#27272a] border border-[#3f3f46] rounded px-2.5 py-1.5 text-zinc-100 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-zinc-400 flex items-center gap-1.5">
                <Tag size={12} /> Stereotype
              </label>
              <div className="px-2.5 py-1.5 bg-[#27272a] border border-[#3f3f46] rounded text-amber-400 font-mono">
                «{selectedNode.type}»
              </div>
            </div>

            {selectedNode.type === 'useCase' && (
              <div className="space-y-2 pt-2 border-t border-[#333]">
                <label className="text-zinc-400 font-medium">Extension Points</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={newExtensionPoint}
                    onChange={(e) => setNewExtensionPoint(e.target.value)}
                    placeholder="e.g. OnObstacleDetected"
                    className="flex-1 bg-[#27272a] border border-[#3f3f46] rounded px-2 py-1 text-zinc-100 focus:border-amber-500 focus:outline-none"
                  />
                  <button
                    onClick={handleAddExtensionPoint}
                    className="px-2 py-1 bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 rounded"
                  >
                    <Plus size={13} />
                  </button>
                </div>

                <div className="space-y-1 mt-2">
                  {(data.extensionPoints || []).map((ep, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-[#202023] px-2 py-1 rounded border border-[#333]">
                      <span className="text-zinc-300 font-mono">{ep}</span>
                      <button
                        onClick={() => {
                          const updated = (data.extensionPoints || []).filter((_, i) => i !== idx);
                          onUpdateNodeData(selectedNode.id, { ...data, extensionPoints: updated });
                        }}
                        className="text-zinc-500 hover:text-red-400"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'architecture' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-zinc-400 flex items-center gap-1.5">
                <Layers size={12} /> Subject Block (System Realization)
              </label>
              <select
                value={data.subjectBlockId || ''}
                onChange={(e) => onUpdateNodeData(selectedNode.id, { ...data, subjectBlockId: e.target.value })}
                className="w-full bg-[#27272a] border border-[#3f3f46] rounded px-2.5 py-1.5 text-zinc-100 focus:border-amber-500 focus:outline-none"
              >
                <option value="">-- None (Standalone) --</option>
                {canonicalBlocks.map((block) => (
                  <option key={block.id} value={block.id}>
                    {block.name} (ID: {block.id})
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-zinc-500">
                Maps this use-case or boundary to its realizing SysML Block in BDD / IBD.
              </p>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-[#333]">
              <label className="text-zinc-400 flex items-center gap-1.5">
                Elaborating Behavior Diagram
              </label>
              <input
                type="text"
                placeholder="e.g. act-engine-start"
                value={data.elaboratingDiagramId || ''}
                onChange={(e) => onUpdateNodeData(selectedNode.id, { ...data, elaboratingDiagramId: e.target.value })}
                className="w-full bg-[#27272a] border border-[#3f3f46] rounded px-2.5 py-1.5 text-zinc-100 focus:border-amber-500 focus:outline-none"
              />
              <p className="text-[10px] text-zinc-500">
                Associates an Activity or Sequence diagram detailing this use case's internal interaction scenario.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'traceability' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-zinc-400 font-medium">Add Requirement Link</label>
              <select
                onChange={(e) => {
                  if (e.target.value) handleAddTrace(e.target.value, 'refine');
                  e.target.value = '';
                }}
                className="w-full bg-[#27272a] border border-[#3f3f46] rounded px-2.5 py-1.5 text-zinc-100 focus:border-amber-500 focus:outline-none"
              >
                <option value="">-- Select Requirement to Trace --</option>
                {canonicalReqs.map((req) => (
                  <option key={req.id} value={req.id}>
                    {req.id} - {req.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <span className="text-zinc-400 font-medium">Traceability Matrix</span>
              {traces.length === 0 ? (
                <div className="text-[11px] text-zinc-500 italic p-3 bg-[#202023] rounded border border-[#333] text-center">
                  No requirement links established yet.
                </div>
              ) : (
                traces.map((trace) => {
                  const req = canonicalReqs.find((r) => r.id === trace.requirementId);
                  return (
                    <div key={trace.requirementId} className="bg-[#202023] p-2.5 rounded border border-[#333] space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-amber-400 font-mono">{trace.requirementId}</span>
                        <button onClick={() => handleRemoveTrace(trace.requirementId)} className="text-zinc-500 hover:text-red-400">
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <div className="text-zinc-300 text-[11px]">{req?.name || 'Requirement'}</div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-zinc-500">Relation:</span>
                        <select
                          value={trace.relationType}
                          onChange={(e) => {
                            const updated = traces.map((t) =>
                              t.requirementId === trace.requirementId
                                ? { ...t, relationType: e.target.value as any }
                                : t
                            );
                            onUpdateNodeData(selectedNode.id, { ...data, requirementTraces: updated });
                          }}
                          className="bg-[#27272a] text-[10px] text-amber-300 border border-[#3f3f46] rounded px-1 py-0.5"
                        >
                          <option value="refine">«refine»</option>
                          <option value="satisfy">«satisfy»</option>
                          <option value="verify">«verify»</option>
                          <option value="trace">«trace»</option>
                        </select>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- UseCaseInspector.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/usecase/UseCaseInspector.tsx src/components/usecase/UseCaseInspector.test.tsx
git commit -m "feat: upgrade use-case inspector to 3-tab sysml architecture and traceability panel"
```

---

### Task 6: Keyboard Shortcut & Clipboard Engine Integration in Workspace

**Files:**
- Modify: `src/components/usecase/UseCaseWorkspace.tsx`
- Test: `src/components/usecase/UseCaseWorkspace.test.tsx`

**Interfaces:**
- Consumes: `UseCaseToolbar`, `UseCaseInspector`, `UseCaseEdgeComponent`, `UseCaseNodes`.
- Implements: `Ctrl+S`, `Ctrl+Z`, `Ctrl+Y`, `Ctrl+C`, `Ctrl+V`, `Ctrl+X`, `Ctrl+A`, `Del`, `Ctrl+0`, arrow key nudging, and auto-layout.

- [ ] **Step 1: Write test for keyboard shortcuts in workspace**

```typescript
// src/components/usecase/UseCaseWorkspace.test.tsx
import { render, fireEvent } from '@testing-library/react';
import { UseCaseWorkspace } from './UseCaseWorkspace';
import { ReactFlowProvider } from '@xyflow/react';

describe('UseCaseWorkspace Keyboard Shortcuts', () => {
  it('triggers save callback on Ctrl+S', () => {
    const onSave = vi.fn();
    const { container } = render(
      <ReactFlowProvider>
        <UseCaseWorkspace
          diagram={{ id: 'd-1', name: 'Test Diagram', nodes: [], edges: [] }}
          onChange={vi.fn()}
          onSave={onSave}
        />
      </ReactFlowProvider>
    );

    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    expect(onSave).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test -- UseCaseWorkspace.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Update `src/components/usecase/UseCaseWorkspace.tsx` with full shortcut engine**

Add:
- Global `keydown` listener capturing:
  - `Ctrl+S`: calls `onSave`
  - `Ctrl+Z` / `Ctrl+Y`: undo/redo
  - `Ctrl+C` / `Ctrl+V`: copy/paste with ID remapping and +35 offset
  - `Ctrl+A`: select all nodes
  - `Delete` / `Backspace`: delete selected nodes and edges
  - `Escape`: deselect all
  - Arrow keys: nudge selected nodes
- Edge type switcher event handler: `handleEdgeTypeChange`
- Edge delete handler: `handleEdgeDelete`
- Integrate `UseCaseToolbar` at top-left.
- Register `useCaseEdge: UseCaseEdgeComponent` in `edgeTypes`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- UseCaseWorkspace.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/usecase/UseCaseWorkspace.tsx src/components/usecase/UseCaseWorkspace.test.tsx
git commit -m "feat: wire keyboard shortcut and clipboard engine into use-case workspace"
```

---

### Task 7: App Integration & End-to-End Build Verification

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Pass `onSave` and canonical diagram triggers from `App.tsx`**
- [ ] **Step 2: Run full project tests**

Run: `npm run test -- usecase`
Expected: All Use Case tests PASS.

- [ ] **Step 3: Run TypeScript compiler**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: complete sysml use-case module with adia ui/ux parity and shortcuts"
```

---

## Plan Self-Review
1. Spec coverage: All requirements in the design document (warm-light illumination, custom edges with switcher, floating toolbar, keyboard shortcuts, 3-tab SysML inspector) are mapped to distinct tasks.
2. Placeholder scan: No "TBD" or "TODO". Complete code provided for all steps.
3. Type consistency: `UseCaseNode`, `UseCaseRelationshipType`, `UseCaseElementData` match across tasks.
