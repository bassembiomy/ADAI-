# X-Bridges Subsystem C Code Generation Design

## 1. Executive Summary

This design specification details the architecture, AST model transformation, edge rewiring algorithm, capability updates, and conformance testing plan to enable C code generation for X-Bridges models containing **`Subsystem`** blocks.

Currently, `Subsystem` blocks are classified as unsupported (`codegen: false`) in [xbCapabilities.ts](file:///g:/adia%20project/src/utils/stateMachine/xbCapabilities.ts). This specification introduces an AST model pre-pass (`flattenXBSubsystems`) that recursively dissolves subsystem boundary nodes into internal primitive blocks (`Gain`, `Sum`, `PID_BASIC`, etc.) and boundary pass-through ports (`Inport`, `Outport`), allowing standard C codegen to emit MISRA-C compliant code without function call overhead.

---

## 2. Architecture & Component Updates

### 2.1 Capability Registration ([xbCapabilities.ts](file:///g:/adia%20project/src/utils/stateMachine/xbCapabilities.ts))
- Reclassify `'Subsystem'`, `'Inport'`, and `'Outport'` from `UNCLASSIFIED_HOST_ONLY` to supported capabilities (`codegen: true`).
- `Inport` and `Outport` serve as boundary pass-through operations emitting standard C signal assignments via existing emitters (`emitInport`, `emitOutport`).

### 2.2 Subsystem Flattener Module (`src/utils/stateMachine/xbSubsystemFlattener.ts`)
A dedicated, pure transformation function:
```typescript
export function flattenXBSubsystems(model: XBPersistedModelV1): XBPersistedModelV1;
```

**Responsibilities**:
1. Traverses the node list to identify all nodes of `type: 'Subsystem'`.
2. Promotes child nodes inside subsystems (`node.parentId === subsystemId`) to the parent level.
3. Rewires incoming and outgoing edges targeting or originating from the subsystem boundary.
4. Removes container `Subsystem` nodes from the node array.
5. Operates recursively to support nested multi-level subsystems.

### 2.3 Semantic Builder Integration (`src/utils/stateMachine/xbSemanticBuilder.ts`)
- `buildXBSemanticModel` invokes `flattenXBSubsystems(input.model)` at entry before state boundary resolution, shape inference, and schedule generation.

---

## 3. Data Flow & Edge Rewiring Algorithm

### 3.1 Node Promotion Algorithm
For each `Subsystem` node $S$:
1. Locate all child nodes $N$ where $N.parentId = S.id$.
2. Update $N.parentId$ to match $S.parentId$ (e.g., `'root'` or target state ID).
3. If $N$ is itself a `Subsystem`, recursively unroll $N$.

### 3.2 Edge Rewiring Rules
Given an edge $E$:
- **Incoming to Subsystem**:
  If $E.targetId = S.id$, find the internal `Inport` block $I$ inside $S$ matching port identifier $E.targetPort$.
  Set $E.targetId = I.id$.
- **Outgoing from Subsystem**:
  If $E.sourceId = S.id$, find the internal `Outport` block $O$ inside $S$ matching port identifier $E.sourcePort$.
  Set $E.sourceId = O.id$.

### 3.3 Node Cleanup
Remove all `Subsystem` container nodes $S$ from `model.nodes`.

---

## 4. Verification & Conformance Testing Plan

### 4.1 Unit Tests (`src/utils/stateMachine/xbSubsystemFlattener.test.ts`)
- Verify single-level subsystem flattening and edge rewiring.
- Verify nested multi-level subsystem flattening.
- Verify preservation of non-subsystem nodes and edges.

### 4.2 C Conformance Case (`src/utils/stateMachine/xbCConformanceCases.ts`)
- Register a new conformance case: `subsystem_gain_sum`.
- Model structure: Input $\rightarrow$ Subsystem (Inport $\rightarrow$ Gain $\rightarrow$ Sum $\rightarrow$ Outport) $\rightarrow$ Output.
- Verify:
  1. C code generation succeeds.
  2. Host C harness compiles generated code cleanly.
  3. Reference interpreter and compiled C output match exactly.

### 4.3 Automated Verification
- Run `npm test` across all `stateMachine` test suites.
