# Task Checklist – X-Bridges Subsystem C Code Generation

- [x] **Task 1: Model Pre-Flattening AST Transformation (`flattenXBSubsystems`)**
  - [x] Implement pure transformation function `flattenXBSubsystems` in `xbSubsystemFlattener.ts` to recursively expand `Subsystem` nodes, promote contained child blocks to parent container scope, and rewire connected edges.
  - [x] Create comprehensive unit tests in `xbSubsystemFlattener.test.ts` (100% PASS).

- [x] **Task 2: Capability & Model Adapter Integration**
  - [x] Update `xbCapabilities.ts` to mark `Subsystem` block as `codegen: true`, shape `scalar`, and paired conformance case `subsystem_gain_sum`.
  - [x] Integrate `flattenXBSubsystems` into `adaptXBModel` in `xbModelAdapter.ts`, `buildXBSemanticModel` in `xbSemanticBuilder.ts`, and `validateXBModel` in `xbSemanticValidator.ts`.
  - [x] Update `xbCapabilities.test.ts` to assert `Subsystem` capability registration.

- [x] **Task 3: Conformance Case & C Codegen E2E Verification**
  - [x] Add `subsystem_gain_sum` conformance case in `xbCConformanceCases.ts`.
  - [x] Add `generates C code for a model containing Subsystem blocks` end-to-end unit test in `xbCGenerator.test.ts`.
  - [x] Fix edge port handle mapping so rewired edges target `Inport` port `'in'` (`targetPortId: 'in'`) and `Outport` port `'out'` (`sourcePortId: 'out'`).
  - [x] Fix `adaptNode` in `xbModelAdapter.ts` to preserve `parentId` on `XBNodeV1`.
  - [x] Verify generated C code compiles and passes C host execution harness.
