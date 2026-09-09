# Task Checklist: SysML BDD, IBD, Requirements, and RTM Remaining-Conformance

## Task 1: Make the canonical repository the only mutation and persistence authority
- [x] Step 1: Write failing authority tests (`src/services/sysmlCommandGateway.test.ts`).
- [x] Step 2: Run focused tests to verify RED.
- [x] Step 3: Implement the command contract in `src/services/sysmlCommandGateway.ts`.
- [x] Step 4: Route BDD/IBD/requirement/relationship mutations through `executeSysmlCommand`.
- [x] Step 5: Make persistence canonical-only with schema/checksum migration in `src/utils/adiaProjectPersistence.ts` & `src/App.tsx`.
- [x] Step 6: Verify all SysML tests and commit `refactor(sysml): make canonical repository authoritative`.

## Task 2: Finish BDD feature, inheritance, port, and association-end workflows
- [x] Step 1: Add failing BDD tests (`src/engine/sysml/bdd.test.ts`, `BlockFeatureEditor.test.tsx`, `RelationshipEndEditor.test.tsx`).
- [x] Step 2: Run RED.
- [x] Step 3: Implement association-end validation.
- [x] Step 4: Complete BDD inspector in `src/components/sysml/BlockFeatureEditor.tsx` & `RelationshipEndEditor.tsx`.
- [x] Step 5: Complete BDD rendering and reporting in `src/App.tsx` and `src/features/reporting/reportDiagrams.ts`.
- [x] Step 6: Verify and commit `feat(sysml): qualify complete bdd editing workflow`.

## Task 3: Finish canonical IBD ownership, boundary, binding, and item-flow workflows
- [x] Step 1: Add failing IBD tests (`src/engine/sysml/ibd.test.ts`, `IbdConnectorEditor.test.tsx`, `reportDiagrams.ibd.test.ts`).
- [x] Step 2: Run RED.
- [x] Step 3: Implement endpoint semantics for connector ends.
- [x] Step 4: Implement binding and flow detail validation and structures.
- [x] Step 5: Complete IBD UI and navigation in `src/components/sysml/IbdConnectorEditor.tsx` & `src/App.tsx`.
- [x] Step 6: Complete render and report parity for IBD diagrams.
- [x] Step 7: Verify and commit `feat(sysml): qualify complete ibd connector workflow`.

## Task 4: Complete requirement baselines, suspect links, copy synchronization, and evidence history
- [x] Step 1: Write failing governance tests (`src/engine/sysml/requirements.test.ts`, `RequirementGovernancePanel.test.tsx`).
- [x] Step 2: Run RED.
- [x] Step 3: Implement governed operations in `src/engine/sysml/requirements.ts` and `src/engine/sysml/evidence.ts`.
- [x] Step 4: Build governance UI in `src/components/sysml/RequirementGovernancePanel.tsx` and `src/App.tsx`.
- [x] Step 5: Qualify relationship direction and notation across toolbar, canvas, inspector, and report.
- [x] Step 6: Verify and commit `feat(sysml): complete requirement governance workflows`.

## Task 5: Finish RTM change-set controls, scalable rendering, and navigation
- [x] Step 1: Add failing RTM tests (`src/engine/sysml/rtm.test.ts`, `TraceabilityMatrix.test.tsx`, `VirtualizedTraceabilityGrid.test.tsx`).
- [x] Step 2: Run RED.
- [x] Step 3: Implement baseline/change-set projection.
- [x] Step 4: Implement two-axis virtualization in `src/components/sysml/VirtualizedTraceabilityGrid.tsx`.
- [x] Step 5: Complete navigation and export parity.
- [x] Step 6: Verify performance and commit `feat(sysml): qualify scalable baseline-aware rtm`.

## Task 6: Add real-browser end-to-end qualification
- [x] Step 1: Add Playwright and failing smoke flow (`playwright.config.ts`, `tests/e2e/sysml-bdd-ibd-requirements-rtm.spec.ts`).
- [x] Step 2: Run RED.
- [x] Step 3: Add deletion lifecycle scenarios in `tests/e2e/sysml-deletion-lifecycle.spec.ts`.
- [x] Step 4: Add persistence and report scenarios in `tests/e2e/sysml-persistence-report.spec.ts`.
- [x] Step 5: Stabilize accessibility selectors.
- [x] Step 6: Verify and commit `test(sysml): add browser conformance qualification`.

## Task 7: Add normative model fixtures and interchange diagnostics
- [x] Step 1: Build fixture test first (`src/engine/sysml/profileFixture.test.ts`).
- [x] Step 2: Run RED.
- [x] Step 3: Add the fixture `src/engine/sysml/fixtures/representative-profile.json`.
- [x] Step 4: Qualify loss diagnostics in `src/engine/sysml/opmAdapter.test.ts`.
- [x] Step 5: Document interoperability boundaries in `docs/SYSML_INTERCHANGE_LIMITATIONS.md`.
- [x] Step 6: Verify and commit `test(sysml): add normative representative model fixture`.

## Task 8: Turn the conformance matrix into an executable release manifest
- [x] Step 1: Write failing completeness test (`src/engine/sysml/conformanceManifest.test.ts`).
- [x] Step 2: Run RED.
- [x] Step 3: Implement executable evidence mapping in `src/engine/sysml/conformanceManifest.ts`.
- [x] Step 4: Generate `docs/SYSML_PROFILE_CONFORMANCE_MATRIX.md` with exact evidence mapping.
- [x] Step 5: Verify and commit `chore(sysml): enforce evidence-backed conformance claims`.

## Task 9: Final release qualification and professional-tool acceptance
- [x] Step 1: Define the aggregate gate `npm run test:sysml:full-release` in `package.json` and `scripts/verify_sysml_release.ts`.
- [x] Step 2: Restore and pin required compiler in script.
- [x] Step 3: Run all gates.
- [x] Step 4: Perform acceptance audit across every matrix row.
- [x] Step 5: Produce release report in `docs/SYSML_RELEASE_REPORT.md`.
- [x] Step 6: Final commit and summary.
