# V-Lab Scope Simulation Speed Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable users to accelerate V-Lab simulation up to 5x faster directly from the Scope ribbon toolbar while preserving mathematical model accuracy, DAE governing equations, and integration step size (dt = 0.05 s).

**Architecture:** Add `simSpeed` (1-5x) state in `VLabWorkspace` and wire it to a `⚡ 1x ▾` dropdown button in `VLabSimulinkScope`. Inside the simulation loop, evaluate `N = simSpeed` sub-steps of fixed step size `dt = 0.05 s` per 50 ms wall-clock interval so simulation time advances up to 5x faster without changing numerical physics behavior.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Lucide Icons, Vitest.

## Global Constraints

- Never increase the physics solver step size `DT = 0.05 s` (doing so would cause solver instability on stiff systems).
- Available speeds must be 1x, 2x, 3x, 4x, 5x.
- Scope downsampling and buffer constraints must be respected across all sub-steps.

---

### Task 1: Scope UI Speed Dropdown (`VLabSimulinkScope`)

**Files:**
- Modify: `src/components/vlab/VLabSimulinkScope.tsx`
- Test: `src/components/vlab/VLabSimulinkScope.test.tsx`

**Interfaces:**
- Props: `simSpeed?: number; onSpeedChange?: (speed: number) => void;`

- [ ] **Step 1: Write failing tests in `VLabSimulinkScope.test.tsx`**
  Verify the Scope renders the speed badge button (`⚡ 1x` or `1x`) and dropdown with options 1x, 2x, 3x, 4x, 5x.
- [ ] **Step 2: Run test to confirm failure**
  `npx vitest run src/components/vlab/VLabSimulinkScope.test.tsx`
- [ ] **Step 3: Implement speed badge button and dropdown in `VLabSimulinkScope.tsx`**
  Add `simSpeed`, `onSpeedChange`, `showSpeedMenu` state, and Zap icon badge next to Layout.
- [ ] **Step 4: Run test to confirm pass**
  `npx vitest run src/components/vlab/VLabSimulinkScope.test.tsx`
- [ ] **Step 5: Commit Task 1**
  `git commit -am "feat(vlab): add simulation speed dropdown to scope toolbar"`

---

### Task 2: Multi-Step Evaluation in `VLabWorkspace`

**Files:**
- Modify: `src/components/vlab/VLabWorkspace.tsx`
- Test: `src/components/vlab/VLabSimulinkScope.test.tsx`

**Interfaces:**
- Workspace state: `simSpeed` (1..5), `simSpeedRef`
- Integration: executes `N = simSpeedRef.current` sub-steps of `DT = 0.05` per 50 ms tick.

- [ ] **Step 1: Update `VLabWorkspace.tsx` with `simSpeed` state and ref**
  `const [simSpeed, setSimSpeed] = useState<number>(1);`
  `const simSpeedRef = useRef<number>(1);`
  Keep `simSpeedRef.current = simSpeed;` in sync.
- [ ] **Step 2: Update simulation loop to evaluate N sub-steps per tick**
  In the `interval` callback, loop from `0` to `simSpeedRef.current`, checking stop limits and collecting scope values.
- [ ] **Step 3: Connect `simSpeed` and `onSpeedChange` to `VLabSimulinkScope`**
  Pass `simSpeed={simSpeed}` and `onSpeedChange={setSimSpeed}` to `<VLabSimulinkScope>`.
- [ ] **Step 4: Run tests and type check**
  `npx vitest run src/components/vlab/VLabSimulinkScope.test.tsx`
  `npx tsc --noEmit`
- [ ] **Step 5: Commit Task 2**
  `git commit -am "feat(vlab): execute multi-step simulation loop for scope speed control"`

---

### Task 3: Full Regression Verification

**Files:**
- None (verification phase)

- [ ] **Step 1: Run full test suites**
  - `npm run test:vlab`
  - `npm run test:vlab:connected`
  - `npm run test:vlab:full`
  - `npx tsc --noEmit`
- [ ] **Step 2: Verify zero warnings and clean working directory**
