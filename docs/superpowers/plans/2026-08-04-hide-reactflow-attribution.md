# Remove React Flow Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide/remove the React Flow attribution badge ("React Flow" square) from the bottom-right corner of workspace diagram canvases in ADIA Stateflow.

**Architecture:** Use React Flow's `proOptions={{ hideAttribution: true }}` prop on `<ReactFlow>` components and enforce global CSS suppression (`.react-flow__attribution { display: none !important; }`) in `src/index.css`.

**Tech Stack:** React 18, React Flow v11 (`reactflow`), Vanilla CSS, Vite.

## Global Constraints
- Target File 1: `src/components/xbridges/XbridgesWorkspace.tsx`
- Target File 2: `src/components/vlab/VLabWorkspace.tsx`
- Target File 3: `src/components/entropy/EntropyWorkspace.tsx`
- Target File 4: `src/index.css`
- No new UI controls or external website links are to be introduced.

---

### Task 1: Hide React Flow Attribution in XBridges, VLab, and Entropy Workspaces

**Files:**
- Modify: `src/components/xbridges/XbridgesWorkspace.tsx:3274`
- Modify: `src/components/vlab/VLabWorkspace.tsx:4097`
- Modify: `src/components/entropy/EntropyWorkspace.tsx:1432`
- Modify: `src/index.css:166`

**Interfaces:**
- Consumes: ReactFlow prop `proOptions={{ hideAttribution: true }}`
- Produces: Clean canvas without bottom-right React Flow watermark badge

- [ ] **Step 1: Update `XbridgesWorkspace.tsx`**

In `src/components/xbridges/XbridgesWorkspace.tsx`:
Add `proOptions={{ hideAttribution: true }}` to `<ReactFlow ...>` around line 3274:
```tsx
<ReactFlow
  proOptions={{ hideAttribution: true }}
  onInit={setReactFlowInstance}
  nodes={...}
```

- [ ] **Step 2: Update `VLabWorkspace.tsx` and `EntropyWorkspace.tsx`**

In `src/components/vlab/VLabWorkspace.tsx`:
Add `proOptions={{ hideAttribution: true }}` to `<ReactFlow ...>` around line 4097.

In `src/components/entropy/EntropyWorkspace.tsx`:
Add `proOptions={{ hideAttribution: true }}` to `<ReactFlow ...>` around line 1432.

- [ ] **Step 3: Add CSS rule to `src/index.css`**

Add at the end of `src/index.css`:
```css
/* Hide ReactFlow Attribution Badge */
.react-flow__attribution {
  display: none !important;
}
```

- [ ] **Step 4: Verify build and test**

Run: `npx tsc --noEmit`
Expected: 0 TypeScript errors.

- [ ] **Step 5: Commit changes**

```bash
git add src/components/xbridges/XbridgesWorkspace.tsx src/components/vlab/VLabWorkspace.tsx src/components/entropy/EntropyWorkspace.tsx src/index.css docs/superpowers
git commit -m "style: remove React Flow attribution badge from workspace canvases"
```
