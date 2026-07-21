# Fuzzy Surface Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to link a Fuzzy Inference System (FIS) block to a Fuzzy Surface Viewer in the properties panel, resolve the linked config at simulation compile time, validate the configuration, and halt simulation with descriptive errors if it is unconfigured.

---

### Task 1: Add Compile Validation in XbridgesEngine

**Files:**
- Modify: `src/engine/xbridges/XbridgesEngine.ts`
- Modify: `src/engine/xbridges/BlockDefinitions.test.ts`

- [ ] **Step 1: Write a failing unit test in test suite**

Add the following unit test case in `src/engine/xbridges/BlockDefinitions.test.ts` inside the `X-Bridges Learning Models Block Tests` describe block (around line 945):

```typescript
  it('should return error diagnostic during compile if FUZZY_SURFACE_VIEWER is unconfigured', () => {
    const model = {
      blocks: [
        { id: 'fsv1', type: 'FUZZY_SURFACE_VIEWER', params: { fisConfig: null } }
      ],
      connections: []
    };

    const engine = new XbridgesEngine(model as any);
    const diagnostics = engine.compile();

    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0].code).toBe('MISSING_FIS_CONFIG');
    expect(diagnostics[0].severity).toBe('error');
    expect(diagnostics[0].message).toContain("has no FIS configuration linked");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx.cmd vitest run src/engine/xbridges/BlockDefinitions.test.ts --exclude "**/.kilo/**"`
Expected: FAIL (diagnostics length is 0)

- [ ] **Step 3: Implement validation checking in XbridgesEngine.ts**

Open `src/engine/xbridges/XbridgesEngine.ts`. In the `compile` method (around line 208), iterate over flat blocks and check for empty `fisConfig`:

```typescript
  public compile(startTime = 0): ModelDiagnostic[] {
    this.diagnostics = [];
    this.flatten();
    this.validateConnections();

    // Validate parameters of Fuzzy Surface Viewer blocks
    this.flatBlocks.forEach(b => {
      if (b.type === 'FUZZY_SURFACE_VIEWER' && (!b.params || !b.params.fisConfig)) {
        this.diagnostics.push({
          severity: 'error',
          code: 'MISSING_FIS_CONFIG',
          message: `Fuzzy Surface Viewer block '${b.label || b.id}' has no FIS configuration linked. Select a valid Fuzzy Inference System block in the properties panel.`,
          blockIds: [b.id]
        });
      }
    });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx.cmd vitest run src/engine/xbridges/BlockDefinitions.test.ts --exclude "**/.kilo/**"`
Expected: 89 passed

- [ ] **Step 5: Commit Task 1 changes**

```bash
git add src/engine/xbridges/XbridgesEngine.ts src/engine/xbridges/BlockDefinitions.test.ts
git commit -m "feat: add compile-time parameter validation for FUZZY_SURFACE_VIEWER block"
```

---

### Task 2: Resolve Linked FIS Config at Compile Time

**Files:**
- Modify: `src/components/xbridges/XbridgesWorkspace.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Resolve fisConfig in XbridgesWorkspace.tsx**

Open `src/components/xbridges/XbridgesWorkspace.tsx`. Locate the `useEffect` simulation loop (around line 1650). Update the block builder:

```typescript
      const model = {
        blocks: nodes.map(n => {
          const d = n.data as any;
          // Try to rebuild via BLOCK_LIBRARY to get live execute() function
          if (BLOCK_LIBRARY[d.type]) {
            try {
              let freshParams = { ...d.params };
              if (d.type === 'FUZZY_SURFACE_VIEWER' && typeof d.params.fisConfig === 'string') {
                const targetNode = nodes.find(x => x.id === d.params.fisConfig);
                if (targetNode && targetNode.data.type === 'FUZZY_INFERENCE_SYSTEM') {
                  freshParams.fisConfig = targetNode.data.params;
                } else {
                  freshParams.fisConfig = null;
                }
              }
              const freshBlock = BLOCK_LIBRARY[d.type](d.id, freshParams || {});
              // Always start with fresh state on Play - never resume trained/stale state
              return { ...freshBlock, id: d.id, state: freshBlock.state, params: { ...freshParams, ...freshBlock.params } };
            } catch (e) {
              return d; // fallback to raw data if rebuild fails
            }
          }
          return d;
        }),
```

- [ ] **Step 2: Resolve fisConfig in App.tsx**

Open `src/App.tsx`. Locate the co-simulation builder (around line 9520). Update the blocks builder:

```typescript
            blocks: state.xBridgesModel.nodes.map(n => {
              const d = n.data as any;
              if (XBRIDGES_LIBRARY[d.type]) {
                try {
                  let freshParams = { ...d.params };
                  if (d.type === 'FUZZY_SURFACE_VIEWER' && typeof d.params.fisConfig === 'string') {
                    const targetNode = state.xBridgesModel.nodes.find(x => x.id === d.params.fisConfig);
                    if (targetNode && targetNode.data.type === 'FUZZY_INFERENCE_SYSTEM') {
                      freshParams.fisConfig = targetNode.data.params;
                    } else {
                      freshParams.fisConfig = null;
                    }
                  }
                  const freshBlock = XBRIDGES_LIBRARY[d.type](d.id, freshParams || {});
                  return { 
                    ...freshBlock, 
                    id: d.id, 
                    state: d.state || freshBlock.state, 
                    params: { ...freshBlock.params, ...freshParams } 
                  };
                } catch (e) {
                  return d;
                }
              }
              return d;
            }),
```

- [ ] **Step 3: Commit Task 2 changes**

```bash
git add src/components/xbridges/XbridgesWorkspace.tsx src/App.tsx
git commit -m "feat: resolve linked fuzzy inference systems at simulation compile time"
```

---

### Task 3: Halt Simulation on Compile Errors & Properties UI link

**Files:**
- Modify: `src/components/xbridges/XbridgesPropertiesPanel.tsx`
- Modify: `src/components/xbridges/XbridgesWorkspace.tsx`

- [ ] **Step 1: Update properties panel selectors for fisConfig**

Open `src/components/xbridges/XbridgesPropertiesPanel.tsx`. Update the `Props` interface and parameter mapping loop:

1. Interface update:
```typescript
interface Props {
  block: XBlock | null;
  availableVariables?: any[];
  availableFisBlocks?: Array<{ id: string; label: string; params: any }>;
  onUpdate: (blockId: string, data: Partial<XBlock>) => void;
  onLaunchDoe?: () => void;
  onClose: () => void;
  isCollapsed?: boolean;
  onCollapseToggle?: (collapsed: boolean) => void;
}
```

2. Render loop update:
Before line 805, handle `key === 'fisConfig'`:
```typescript
              if (key === 'fisConfig') {
                return (
                  <div key={key}>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Fuzzy Inference System (FIS)</label>
                    <select
                      value={typeof displayValue === 'string' ? displayValue : ''}
                      onChange={(e) => onUpdate(block.id, { params: { ...block.params, [key]: e.target.value } })}
                      className="w-full text-sm px-2.5 py-1.5 border border-[#333] bg-[#0a0a0a] text-purple-400 font-bold rounded focus:border-[#c9a86c] outline-none transition-all cursor-pointer"
                    >
                      <option value="">-- Select FIS Block --</option>
                      {availableFisBlocks?.map(fis => (
                        <option key={fis.id} value={fis.id}>{fis.label}</option>
                      ))}
                    </select>
                  </div>
                );
              }
```

- [ ] **Step 2: Pass availableFisBlocks prop in XbridgesWorkspace.tsx**

Open `src/components/xbridges/XbridgesWorkspace.tsx`.
1. Compute `availableFisBlocks`:
```typescript
  const availableFisBlocks = useMemo(() => {
    return nodes
      .filter(n => n.data && n.data.type === 'FUZZY_INFERENCE_SYSTEM')
      .map(n => ({ id: n.id, label: n.data.label || n.id, params: n.data.params }));
  }, [nodes]);
```
2. Pass it to `XbridgesPropertiesPanel` around line 3430:
```typescript
            <XbridgesPropertiesPanel
              block={selectedNode.data as any}
              availableVariables={availableVariables}
              availableFisBlocks={availableFisBlocks}
              onUpdate={updateBlock}
              onLaunchDoe={onLaunchDoe}
              onClose={() => setSelectedNodeId(null)}
              isCollapsed={isPropsCollapsed}
              onCollapseToggle={setIsPropsCollapsed}
            />
```

- [ ] **Step 3: Halt simulation execution on compiler errors**

Open `src/components/xbridges/XbridgesWorkspace.tsx`. Inside the `useEffect` simulation loop (around line 1670):
```typescript
      engineRef.current = new XbridgesEngine(model);
      const compileDiagnostics = engineRef.current.compile();
      setDiagnostics(compileDiagnostics);

      const hasErrors = compileDiagnostics.some(d => d.severity === 'error');
      if (hasErrors) {
        setIsSimulating(false);
        setShowDiagnostics(true);
        return;
      }
```

- [ ] **Step 4: Run all core tests to verify no regressions**

Run: `npx.cmd vitest run src/ --exclude "**/.kilo/**"`
Expected: 500 passed

- [ ] **Step 5: Commit Task 3 changes**

```bash
git add src/components/xbridges/XbridgesPropertiesPanel.tsx src/components/xbridges/XbridgesWorkspace.tsx
git commit -m "feat: link FIS block in properties panel and halt simulation on compiler errors"
```
