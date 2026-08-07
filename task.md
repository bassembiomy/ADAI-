# Task Checklist: ADIA SysML Module Architecture Update

- [x] **Task 1: Core SysML Type Definitions & Schema Hydration Migration**
  - [x] Write failing test for schema hydration (`src/services/sysmlIntegrityService.test.ts`)
  - [x] Confirm RED failure
  - [x] Create `src/types/sysml_types.ts` & implement `migrateSysMLState` in `src/services/sysmlIntegrityService.ts`
  - [x] Run test and confirm GREEN pass
  - [x] Commit Task 1 changes

- [x] **Task 2: Transactional Cascade Deletion & Impact Preview (BR-01, BR-02, BR-08)**
  - [x] Write failing tests for cascade deletion & deletion impact preview
  - [x] Confirm RED failure
  - [x] Implement `previewDeletionImpact`, `cascadeDeleteBlock`, and `cascadeDeletePort`
  - [x] Run test and confirm GREEN pass
  - [x] Commit Task 2 changes

- [x] **Task 3: Semantic Connector & Port Direction Validation (BR-03, BR-05)**
  - [x] Write failing tests for port direction compatibility & duplicate connector validation
  - [x] Confirm RED failure
  - [x] Implement `validateConnectorConnection`
  - [x] Run test and confirm GREEN pass
  - [x] Commit Task 3 changes

- [x] **Task 4: Traceability Governance & Requirement Canonicalization (BR-04, BR-07, BR-10)**
  - [x] Write failing tests for traceability relations & unique requirement IDs
  - [x] Confirm RED failure
  - [x] Implement `validateTraceabilityRelation` & `validateUniqueRequirementIds`
  - [x] Run test, full suite, and `npx tsc --noEmit`
  - [x] Commit Task 4 changes
