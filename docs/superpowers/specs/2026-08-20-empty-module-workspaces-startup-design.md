# Design Spec: Blank Workspace Startup & Zero Assigned Variables

**Date**: 2026-08-20  
**Status**: Approved  
**Topic**: Empty Module Workspaces and Zero Assigned Variables on Application Startup  

---

## 1. Overview & Objective
When launching the ADIA application or initializing a fresh session, all module workspaces must start in a clean, empty state with zero pre-populated variables, states, blocks, or sample matrices. Users should begin with a clean canvas across all modeling suites while maintaining full fidelity when loading or importing saved projects.

---

## 2. Requirements & Scope

### 2.1 Scope of Modules & Defaults
1. **State Machine Workspace**:
   - `variables`: Empty array (`[]`). No default variables (`counter`, `flag`, `value`).
   - `states`: Empty array (`[]`). No default states (`s1`, `s2`, `slp`).
   - `transitions`: Empty array (`[]`). No default transitions (`t1`, `t2`).
   - `junctions`: Empty array (`[]`).
   - `layers`: Root layer initialized with empty ID sets:
     ```ts
     [{
       id: 'root',
       name: 'Root',
       parentStateId: null,
       stateIds: [],
       transitionIds: [],
       junctionIds: []
     }]
     ```
2. **X-Bridges Block Diagram Suite**:
   - `globalXBridgesNodes`: Empty array (`[]`). Remove pre-populated AC motor controller demo blocks.
   - `globalXBridgesEdges`: Empty array (`[]`). Remove pre-populated demo connections.
3. **Design of Experiments (DOE)**:
   - `headers`: Empty array (`[]`).
   - `data`: Empty 2D array (`[]`).
   - `results`: `null`.
4. **SysML Workspaces (BDD, IBD, Requirements)**:
   - `blocks`: `[]`
   - `relationships`: `[]`
   - `parts`: `[]`
   - `connectors`: `[]`
   - `interfaceRealizations`: `[]`
   - `customStereotypes`: `[]`
5. **Physical & Conceptual Simulators**:
   - **V-Lab**: `vlabNodes = []`, `vlabEdges = []`
   - **Entropy OPM**: `entropyNodes = []`, `entropyEdges = []`
   - **HMI Dashboard**: `hmiComponents = []`
   - **HIL**: Clean default disconnected configuration.

### 2.2 Project Loading & File Import Invariance
- Importing `.json` or opening `.adia` projects must continue to deserialize saved variables, states, blocks, and connections accurately.
- `loadStateForFile` and `applyStateMachineSnapshot` functions remain unchanged in behavior when reading populated project structures.

---

## 3. Architecture & State Modifications

### Modified Files:
* `src/App.tsx`:
  - Update default `useState` initial values for `variables`, `states`, `transitions`, `layers`, `globalXBridgesNodes`, `globalXBridgesEdges`, `data`, and `headers`.
  - Remove unused static demo definitions (`defaultXBridgesNodes`, `defaultXBridgesEdges`) from global state declaration.

---

## 4. Verification & Testing Strategy
1. **Automated Unit Tests**:
   - Run Vitest suite (`npm test`) to ensure all test suites pass without regression.
   - Verify that state machine, serialization, and adapter tests that provide their own fixtures are unaffected.
2. **Manual / Runtime Verification**:
   - Launch the application and confirm:
     - State Machine canvas is empty.
     - Variables panel shows 0 variables.
     - X-Bridges canvas contains 0 nodes.
     - DOE workspace starts without pre-filled data table.
     - Project import still populates variables and workspace elements correctly.
