# Task Checklist: SysML Requirement Containment Implementation

## Task 1: Add the canonical Requirement Containment metamodel kind
- [x] Step 1: Write failing type and round-trip tests (`src/engine/sysml/model.test.ts`, `src/engine/sysml/persistence.test.ts`).
- [x] Step 2: Run RED.
- [x] Step 3: Extend the canonical and compatibility unions.
- [x] Step 4: Add a one-time migration (`LEGACY_REQUIREMENT_COMPOSITION_MIGRATED`).
- [x] Step 5: Run GREEN and commit `feat(sysml): add requirement containment relationship kind`.

## Task 2: Implement validation, ownership, and lifecycle semantics
- [x] Step 1: Write failing semantic tests (`src/engine/sysml/requirements.test.ts`, `src/engine/sysml/validation.test.ts`, `src/services/sysmlCreationRules.test.ts`).
- [x] Step 2: Run RED.
- [x] Step 3: Implement validation with exact diagnostic codes.
- [x] Step 4: Replace overloaded checks.
- [x] Step 5: Implement deterministic traversal (`getNestedRequirementIds`).
- [x] Step 6: Run GREEN and commit `feat(sysml): enforce requirement containment semantics`.

## Task 3: Add correct deletion, impact-preview, and undo behavior
- [x] Step 1: Write failing lifecycle tests (`src/engine/sysml/mutations.test.ts`, `src/services/sysmlTransactionAdapter.test.ts`, `src/services/sysmlCommandGateway.test.ts`).
- [x] Step 2: Add non-cascade tests.
- [x] Step 3: Add confirmation and transaction tests.
- [x] Step 4: Run RED.
- [x] Step 5: Extend the deletion closure.
- [x] Step 6: Run GREEN and commit `fix(sysml): enforce requirement containment deletion lifecycle`.

## Task 4: Add contextual Requirement Diagram creation and notation
- [x] Step 1: Write failing component/report tests (`src/components/sysml/RelationshipEndEditor.test.tsx`, `src/features/reporting/reportDiagrams.sysml.test.ts`).
- [x] Step 2: Run RED.
- [x] Step 3: Add contextual creation choice in `src/App.tsx`.
- [x] Step 4: Update the inspector (`RelationshipEndEditor.tsx`).
- [x] Step 5: Render SysML notation (circle-plus/crosshair marker).
- [x] Step 6: Add accessible guidance.
- [x] Step 7: Run GREEN and commit `feat(sysml): add requirement containment diagram tooling`.

## Task 5: Separate diagram removal from semantic model deletion
- [x] Step 1: Write failing distinction tests (`src/services/sysmlCommandGateway.test.ts`, `src/utils/adiaProjectPersistence.test.ts`).
- [x] Step 2: Run RED.
- [x] Step 3: Add presentation membership (`diagramPresentations[diagramId].elementIds`).
- [x] Step 4: Add explicit UI actions (`Remove from Diagram` and `Delete from Model…`).
- [x] Step 5: Verify save/load and undo.
- [x] Step 6: Run GREEN and commit `feat(sysml): separate diagram removal from model deletion`.

## Task 6: Integrate RTM, reports, fixture, conformance evidence, and browser qualification
- [ ] Step 1: Add failing RTM and fixture tests (`src/engine/sysml/rtm.test.ts`, `src/engine/sysml/profileFixture.test.ts`).
- [ ] Step 2: Add failing browser creation test.
- [ ] Step 3: Add failing browser lifecycle test.
- [ ] Step 4: Implement fixture/profile evidence (`req.containment` in `src/engine/sysml/profile.ts` & `src/engine/sysml/conformanceManifest.ts`).
- [ ] Step 5: Run the full qualification gate (`npm run test:sysml:full-release`).
- [ ] Step 6: Audit and promote in `docs/SYSML_PROFILE_CONFORMANCE_MATRIX.md`.
- [ ] Step 7: Commit `test(sysml): qualify requirement containment lifecycle`.
