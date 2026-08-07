# Task Checklist: ADIA SysML Module Architecture Update

- [x] **Task 1: Core SysML Type Definitions & Schema Hydration Migration**
  - [x] Write failing test for schema hydration (`src/services/sysmlIntegrityService.test.ts`)
  - [x] Confirm RED failure
  - [x] Create `src/types/sysml_types.ts` & implement `migrateSysMLState` in `src/services/sysmlIntegrityService.ts`
  - [x] Run test and confirm GREEN pass
  - [x] Commit Task 1 changes

- [ ] **Task 2: Transactional Cascade Deletion & Impact Preview (BR-01, BR-02, BR-08)**
  - [ ] Write failing tests for cascade deletion & deletion impact preview
  - [ ] Confirm RED failure
  - [ ] Implement `previewDeletionImpact`, `cascadeDeleteBlock`, and `cascadeDeletePort`
  - [ ] Run test and confirm GREEN pass
  - [ ] Commit Task 2 changes

- [ ] **Task 3: Semantic Connector & Port Direction Validation (BR-03, BR-05)**
  - [ ] Write failing tests for port direction compatibility & duplicate connector validation
  - [ ] Confirm RED failure
  - [ ] Implement `validateConnectorConnection`
  - [ ] Run test and confirm GREEN pass
  - [ ] Commit Task 3 changes

- [ ] **Task 4: Traceability Governance & Requirement Canonicalization (BR-04, BR-07, BR-10)**
  - [ ] Write failing tests for traceability relations & unique requirement IDs
  - [ ] Confirm RED failure
  - [ ] Implement `validateTraceabilityRelation` & `validateUniqueRequirementIds`
  - [ ] Run test, full suite, and `npx tsc --noEmit`
  - [ ] Commit Task 4 changes
