# VLab Constant Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `constant` as a first-class block and alias alongside `ps_constant` in the VLab physics engine, component definitions, library, and UI rendering.

**Architecture:** Extend the block library `VLAB_LIBRARY` with a `constant` entry, link it to `VLAB_EQUATIONS` and `vlabComponentDefinitions`, and ensure symbols (`VLabSymbols`), nodes (`VLabNode`), and canvas layout (`VLabWorkspace`, `blockDimensions`) render and size it properly.

**Tech Stack:** TypeScript, React, Vitest / Node test runner

## Global Constraints
- Target Files: `src/utils/vlabLibrary.ts`, `src/engine/vlab/vlabComponentDefinitions.ts`, `src/engine/vlab/vlabEquations.ts`, `src/components/vlab/VLabSymbols.tsx`, `src/components/vlab/VLabNode.tsx`, `src/components/vlab/blockDimensions.ts`, `src/components/vlab/VLabWorkspace.tsx`.
- Keep full backwards compatibility with existing `ps_constant` usage.

---

### Task 1: Engine & Library Support for Constant Block

**Files:**
- Modify: `src/utils/vlabLibrary.ts`
- Modify: `src/engine/vlab/vlabComponentDefinitions.ts`
- Modify: `src/engine/vlab/vlabEquations.ts`
- Test: `src/engine/vlab/vlab.test.ts`

**Interfaces:**
- Consumes: `branch: number[]`, `params: Record<string, any>`
- Produces: `constant` entry in `VLAB_LIBRARY`, `VLAB_EQUATIONS['constant']`, `VLAB_COMPONENT_DEFS['constant']`

- [ ] **Step 1: Write test for constant block equation & component definition**

Add to `src/engine/vlab/vlab.test.ts`:
```typescript
it('evaluates constant block equation correctly', () => {
  const eq = VLAB_EQUATIONS.constant({ branch: [5.0], params: { value: 5.0 } } as any);
  expect(eq).toEqual([0]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/vlab/vlab.test.ts`

- [ ] **Step 3: Implement engine & library changes**

In `src/utils/vlabLibrary.ts`, add to the `Physical` domain blocks:
```typescript
{
  "id": "constant",
  "name": "Constant",
  "color": "#92400e",
  "icon": "ps_const",
  "category": "Sources",
  "params": {
    "value": {
      "value": 1,
      "unit": "1",
      "label": "Constant Value"
    }
  },
  "ports": [
    {
      "id": "y",
      "pos": "right",
      "label": "C",
      "domain": "Physical"
    }
  ],
  "equation": "y(t) = Value",
  "description": "Outputs a steady constant scalar value across all simulation time."
}
```

In `src/engine/vlab/vlabComponentDefinitions.ts`:
```typescript
constant: {
  equations: ['y = value'],
  latex: ['y(t) = C'],
  across: 'None', through: 'Signal',
  description: 'Generates a constant physical signal. Use to set fixed setpoints or parameters in control loops.'
},
```

In `src/engine/vlab/vlabEquations.ts`:
```typescript
constant: ({ branch, params }) => {
  const val = params.value !== undefined ? params.value : 1.0;
  return [branch[0] - val];
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/vlab/vlab.test.ts`

---

### Task 2: UI & Canvas Integration for Constant Block

**Files:**
- Modify: `src/components/vlab/VLabSymbols.tsx`
- Modify: `src/components/vlab/VLabNode.tsx`
- Modify: `src/components/vlab/blockDimensions.ts`
- Modify: `src/components/vlab/VLabWorkspace.tsx`

- [ ] **Step 1: Update UI symbol & node rendering**

In `src/components/vlab/VLabSymbols.tsx`:
Add `case 'constant':` to the SVG symbol render for `ps_constant`.

In `src/components/vlab/VLabNode.tsx`:
Support `type === 'constant'` in subtitle formatting.

In `src/components/vlab/blockDimensions.ts`:
Add `constant: { width: 40, height: 40 }`.

In `src/components/vlab/VLabWorkspace.tsx`:
Add `case 'constant':` in dimension resolution switch statements.

- [ ] **Step 2: Run simulation benchmark tests to verify integration**

Run: `npx vitest run src/engine/vlab/vlab_connected_models.test.ts`
