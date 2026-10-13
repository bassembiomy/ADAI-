# ADIA SysML v1.6 Backend-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Track every step with its checkbox.

**Goal:** Make ADIA's BDD, IBD, ports/flows, properties, requirements, traceability, model browser, validation, persistence, and presentation conform as closely as practical to OMG SysML v1.6 while providing Cameo-style workflows over one authoritative semantic repository.

**Architecture:** The canonical repository is the only writable semantic source. UI, AI, scripts, importers, and migrations submit commands through one transaction and validation boundary; diagrams and the browser consume immutable projections. Legacy arrays remain temporary read-only compatibility DTOs until migration and parity gates pass.

**Tech stack:** TypeScript 5, React 18, Vitest, Playwright, normalized repository, versioned JSON/chunk persistence, Electron/Vite.

## Global constraints

- Authority: OMG SysML v1.6 formal/19-11-01 plus inherited UML semantics. Cameo is a tooling reference only.
- Every feature declares `OMG_SYSML_1_6`, `UML_FOUNDATION`, `CAMEO_TOOLING`, or `ADIA_EXTENSION`.
- No editable UI feature ships before its domain type, repository lifecycle, command, validator, persistence mapping, projection, and semantic tests.
- Canvas and React state never own SysML semantics.
- Unknown types return `TYPE_NOT_FOUND`, candidates, and an explicit `CreateNewType` action. UI, AI, import, migration, and scripts have no bypass.
- Standard UML Port, ProxyPort, FullPort, and legacy FlowPort are distinct. Generic Port receives no implicit stereotype.
- `TestCase` is normative. Existing `VerificationCase` data is mapped to TestCase or labeled `ADIA_EXTENSION`.
- Compliance has four levels: Element, Properties, Relationships, Constraints. `COMPLIANT` requires all applicable levels and automated semantic evidence.
- Preserve saved projects and unaffected State Machine, XBridges, simulation, HIL/SIL, reporting, and code generation behavior.
- Complete Activity, Sequence, Parametric, Package, and Use Case modules are outside this program.

## Target modules

Create focused modules under `src/engine/sysml/domain`, `services`, `commands`, `validation`, `projection`, `compliance`, and `persistence`. Keep `src/engine/sysml/model.ts` as a compatibility export barrel during migration. Split command handlers out of `src/services/sysmlCommandGateway.ts` while retaining its public entry point. Convert `src/App.tsx` from SysML state owner to projection consumer.

---

### Task 1: Baseline and architecture guardrails

**Files:** Create `src/engine/sysml/architectureGuards.test.ts`, `scripts/verify_sysml_architecture.ts`; modify `package.json`, `scripts/verify_sysml_release.ts`.

**Produces:** `verifySysmlArchitecture(rootDir): ArchitectureViolation[]`; `npm run test:sysml:architecture`.

- [ ] Write a failing scanner test for direct UI/AI writes to legacy semantic arrays and command bypasses.
- [ ] Implement stable diagnostics `SYSML_ARCH_DIRECT_MUTATION`, `SYSML_ARCH_UI_SEMANTIC_STORAGE`, `SYSML_ARCH_SILENT_CREATION` with a temporary compatibility allowlist.
- [ ] Add the architecture check to the full release script.
- [ ] Run `npm run test:sysml:architecture` and `npm run test:sysml -- --reporter=dot`.
- [ ] Commit `test(sysml): add repository-first architecture guardrails`.

### Task 2: Provenance and four-level compliance

**Files:** Create `src/engine/sysml/compliance/types.ts`, `evaluator.ts`, `evaluator.test.ts`; modify `src/engine/sysml/conformanceManifest.ts` and its tests.

**Produces:** `SemanticAuthority`; `ComplianceEvidence`; `evaluateCompliance(definition): ComplianceResult`.

- [ ] Test that ProxyPort with three passing levels and failed Constraints is `PARTIAL`, never `COMPLIANT`.
- [ ] Test that missing automated tests or specification section blocks `COMPLIANT`.
- [ ] Implement Element/Properties/Relationships/Constraints results with `PASS | FAIL | NOT_APPLICABLE`.
- [ ] Require specification source/section, source file, domain type, command, validator, persistence, projection, and test evidence.
- [ ] Migrate existing rows and downgrade claims that lack evidence.
- [ ] Run the compliance and conformance-manifest tests.
- [ ] Commit `feat(sysml): enforce provenance and four-level compliance`.

### Task 3: Canonical schema v4 metamodel

**Files:** Create `src/engine/sysml/domain/{base,classifiers,properties,ports,requirements,relationships,presentations,index}.ts`; modify `model.ts`, `normalizedStore.ts`.

**Produces:** `SemanticElement`, `SemanticRelationship`, `SysmlRepositoryV4`, normalized owner/type/namespace/endpoint/diagram indexes.

- [ ] Test stable IDs, explicit ownership, namespaces, metaclass discrimination, and global ID collision rejection.
- [ ] Add first-class Block, InterfaceBlock, ConstraintBlock, AssociationBlock, ValueType, DataType, Enumeration, Signal, QuantityKind, Unit, Operation, Parameter, Reception, Constraint, Comment, Rationale, Requirement, and TestCase.
- [ ] Add first-class PartProperty, ReferenceProperty, ValueProperty, ConstraintProperty, FlowProperty, and typed ValueSpecification variants.
- [ ] Add typed Diagram and DiagramPresentation entities; do not store semantic compartment content as strings.
- [ ] Retain deprecated v3 compatibility exports until migration completes.
- [ ] Run model, normalized-store tests, and `npx tsc --noEmit`.
- [ ] Commit `feat(sysml): add canonical v4 semantic metamodel`.

### Task 4: UML and SysML Port hierarchy

**Files:** Modify `domain/ports.ts`, `ibd.ts`, `profile.ts`; create `services/portSemantics.ts`, `validation/portRules.ts`, `portRules.test.ts`.

**Produces:** `PortKind = 'umlPort' | 'proxyPort' | 'fullPort' | 'flowPort'`; `validatePort`; `effectiveFlowDirection`.

- [ ] Test that generic `CreatePort` creates `umlPort` with no implicit SysML stereotype.
- [ ] Test mutual exclusion of ProxyPort and FullPort.
- [ ] Reject ProxyPort typed by Block; accept InterfaceBlock.
- [ ] Test nested ProxyPort rules and recursive conjugation without UI.
- [ ] Implement provided/required semantic references and legacy FlowPort representation.
- [ ] Add diagnostics `PROXY_PORT_TYPE_NOT_INTERFACE_BLOCK`, `PORT_SPECIALIZATION_CONFLICT`, `INVALID_NESTED_PROXY_PORT`.
- [ ] Run port, IBD, and profile tests.
- [ ] Commit `feat(sysml): implement UML and SysML port semantics`.

### Task 5: Global type resolution and no silent creation

**Files:** Create `services/typeResolution.ts` and tests, `commands/commandResult.ts`; modify gateway, creation rules, AI adapter, persistence.

**Produces:** `resolveType`; `TypeNotFoundResult { code: 'TYPE_NOT_FOUND', candidates, actions }`; explicit `CreateNewTypeCommand`.

- [ ] Test UI, AI, import, migration, and script paths: unknown type creates zero entities and returns the same typed result.
- [ ] Rank candidates by qualified-name exact match, simple-name exact match, then normalized prefix.
- [ ] Route every typed property/port/connector command through the resolver.
- [ ] Remove placeholder type synthesis from import and migration.
- [ ] Ensure AI surfaces `CreateNewType` through normal approval and command handling.
- [ ] Run resolver, creation-rule, AI-adapter, and persistence tests.
- [ ] Commit `feat(sysml): reject silent semantic type creation`.

### Task 6: Repository-owned presentations

**Files:** Modify `domain/presentations.ts`, `normalizedStore.ts`, `persistence.ts`, gateway; create `commands/presentationCommands.ts` and tests.

**Produces:** `DisplayExistingElement`, `RemovePresentation`, `MovePresentation`, `ResizePresentation`.

- [ ] Test one Block displayed on two diagrams: one definition, two presentations.
- [ ] Test `RemovePresentation` preserves semantics and `DeleteModelElement` requires impact handling.
- [ ] Move coordinate and membership side maps into typed presentation collections.
- [ ] Add deterministic v3-to-v4 migration for coordinates and diagram membership.
- [ ] Keep legacy getters as read-only adapters until React migration.
- [ ] Run presentation, persistence, and normalized-store tests.
- [ ] Commit `feat(sysml): persist typed diagram presentations`.

### Task 7: Command and transaction boundary

**Files:** Create `commands/{types,dispatcher,elementCommands,relationshipCommands}.ts` and tests; modify gateway, `mutations.ts`, `patches.ts`.

**Produces:** `dispatchSysmlCommand(state, command, context): CommandResult` with atomic revision, audit record, diagnostics, patches, and change set.

- [ ] Test create, update, rename, owner move, relationship creation, deletion impact, undo, redo, and rejected-command atomicity.
- [ ] Move gateway switch branches into focused handlers without breaking its public API.
- [ ] Validate before commit; rejected commands preserve revision and state.
- [ ] Record caller source (`ui`, `ai`, `import`, `migration`, `script`) without semantic privilege differences.
- [ ] Run command, gateway, mutation, and patch tests.
- [ ] Commit `refactor(sysml): centralize semantic transactions`.

### Task 8: Property, value, and inheritance semantics

**Files:** Create `services/propertySemantics.ts`, `services/inheritance.ts`, `validation/propertyRules.ts` and tests; modify property rules/sync and BlockFeatureEditor.

**Produces:** `createTypedProperty`, `resolveInheritedFeatures`, `createPropertySpecificType`, `validateProperty`.

- [ ] Test distinctions and legal owner/type combinations for all property kinds.
- [ ] Test structured multiplicity and typed ValueSpecification variants.
- [ ] Resolve inherited features without cloning and reject inheritance cycles.
- [ ] Preserve property-specific type links to the owning property and general type.
- [ ] Replace string operations/constraints and legacy property writes with commands.
- [ ] Make the editor render generated notation and dispatch commands only.
- [ ] Run property, sync, editor, and type-check tests.
- [ ] Commit `feat(sysml): implement typed property semantics`.

### Task 9: Relationship, connector-end, flow, and allocation foundations

**Files:** Modify `domain/relationships.ts`, `ibd.ts`, `bdd.ts`; create `services/relationshipSemantics.ts`, `connectorPath.ts`, `allocationQueries.ts`, `validation/relationshipRules.ts` and tests.

**Produces:** typed AssociationEnd, ConnectorEnd, NestedConnectorEndPath, ItemFlow, InformationFlow, BindingConnector, Allocate; allocation queries.

- [ ] Test Association versus Connector ownership and endpoint rules.
- [ ] Resolve nested connector paths across properties and ports; reject broken/context-invalid paths.
- [ ] Store ItemFlow independently with realizing relationship and conveyed classifier IDs.
- [ ] Keep BindingConnector distinct from Connector and InformationFlow.
- [ ] Test Allocate endpoint indexing and derived `allocatedFrom`/`allocatedTo` results.
- [ ] Reserve a typed `AllocateActivityPartition` extension point; do not build its UI.
- [ ] Run relationship, BDD, and IBD tests.
- [ ] Commit `feat(sysml): add connector flow and allocation semantics`.

### Task 10: Requirement and TestCase normalization

**Files:** Modify domain requirements, `requirements.ts`, validation, RTM, persistence, RequirementGovernancePanel.

**Produces:** normative `TestCase`; optional `AdiaVerificationCaseExtension` with `ADIA_EXTENSION` authority.

- [ ] Test migration of `verificationCases` to `testCases` without losing evidence links.
- [ ] Enforce unique human-facing requirement IDs independently of UUIDs.
- [ ] Test direction, endpoints, ownership, and persistence for containment, deriveReqt, satisfy, verify, refine, trace, and copy.
- [ ] Use TestCase wording in normative UI/reporting and label extensions explicitly.
- [ ] Preserve baseline, suspect-link, evidence-revision, and RTM behavior.
- [ ] Run requirement, RTM, persistence, and governance-panel tests.
- [ ] Commit `feat(sysml): align verification semantics with TestCase`.

### Task 11: Canonical projections

**Files:** Create `projection/{bddProjection,ibdProjection,requirementsProjection,modelBrowserProjection}.ts` and parity tests; modify unified explorer projection and gateway.

**Produces:** immutable view models containing semantic IDs, generated notation, and presentation geometry.

- [ ] Test compartments, inherited features, IBD context, nested paths, requirement hierarchy, and browser ownership.
- [ ] Compare canonical projections with legacy output for supported fixtures.
- [ ] Resolve labels dynamically so rename never rewrites presentation semantics.
- [ ] Make legacy projections wrappers around canonical selectors.
- [ ] Run projection and model-explorer tests.
- [ ] Commit `feat(sysml): add repository-native projections`.

### Task 12: Cameo-style command-only UI workflows

**Files:** Modify `App.tsx`, SysML editors, model explorer, and drag/drop; update component and Playwright tests.

**Consumes:** dispatcher commands and canonical projections. **Produces:** UI-local selection, viewport, dialog, and draft state only.

- [ ] Test browser drag emits `DisplayExistingElement` and creates no duplicate semantic element.
- [ ] Implement explicit “Use Existing Type” and “Create New Type” workflows with `TYPE_NOT_FOUND` candidates.
- [ ] Separate “Remove from Diagram” from “Delete from Model” with impact preview.
- [ ] Route property, port, relationship, connector, and requirement editors through commands.
- [ ] Remove direct semantic `setBlocks`, `setParts`, `setConnectors`, and `setRelationships` writes from migrated flows.
- [ ] Run component tests, `npx tsc --noEmit`, and SysML/model-explorer E2E tests.
- [ ] Commit `refactor(sysml): make UI a command-driven projection`.

### Task 13: Schema v4 persistence and migration

**Files:** Create `persistence/schemaV4.ts`, `migrateV3ToV4.ts` and tests; modify persistence, interchange report, JSON import validator.

**Produces:** deterministic migration and semantic-loss diagnostics. Unknown types are quarantined with `TYPE_NOT_FOUND`.

- [ ] Add fixtures for legacy definitions, usages, ports, connectors, requirements, verification cases, coordinates, and memberships.
- [ ] Migrate generic ports to UML Port unless explicit evidence identifies a SysML specialization.
- [ ] Map VerificationCase to TestCase or a labeled extension based on source metadata.
- [ ] Persist provenance, presentations, connector paths, ItemFlows, allocations, and evidence.
- [ ] Verify deterministic serialization, checksums, chunks, abort rollback, and identity-preserving round trips.
- [ ] Run persistence/migration/import tests.
- [ ] Commit `feat(sysml): migrate projects to canonical schema v4`.

### Task 14: One writable model across all integrations

**Files:** Modify App, AI adapter, transaction/property adapters, reporting snapshots/diagrams, representative fixture script, architecture checker.

- [ ] Test that UI, AI, reports, and scripts observe the same revision and IDs.
- [ ] Replace bidirectional legacy merges with one-way compatibility projections.
- [ ] Empty the production architecture-guard allowlist.
- [ ] Remove duplicated writable BDD/IBD/Requirement semantic arrays.
- [ ] Run architecture, SysML release, reporting, and type-check suites.
- [ ] Commit `refactor(sysml): enforce one writable semantic repository`.

### Task 15: Mandatory semantic identity release gate

**Files:** Create `src/engine/sysml/semanticIdentityReleaseGate.test.ts`; modify release script and conformance manifest.

- [ ] Through public commands, create Motor and Vehicle Blocks plus BDD-A, BDD-B, Vehicle IBD, and a Requirement Diagram.
- [ ] Display the same Motor ID on both BDDs.
- [ ] Create one `leftMotor : Motor` PartProperty owned by Vehicle and display it on the Vehicle IBD.
- [ ] Create one Requirement with requirement ID `REQ-001`.
- [ ] Create one `Motor «satisfy» REQ-001` relationship and display it on the Requirement Diagram.
- [ ] Assert exactly one Motor definition, one leftMotor property, one REQ-001, and one satisfy relationship; allow multiple presentations.
- [ ] Rename Motor to BLDCMotor and assert every projection resolves the new name with unchanged IDs and counts.
- [ ] Serialize/reload and repeat every assertion.
- [ ] Add the test as blocking release and compliance evidence.
- [ ] Commit `test(sysml): gate release on semantic identity`.

### Task 16: Remove compatibility semantics and close compliance

**Files:** Modify `src/types/sysml_types.ts`, gateway, transaction adapter, compliance Markdown/JSON, profile matrix, interchange limitations.

- [ ] Delete legacy mutation branches only after Tasks 12–15 pass.
- [ ] Rename retained import/export shapes with `Legacy...Dto` and prohibit domain dependencies on them.
- [ ] Re-evaluate every feature at all four compliance levels.
- [ ] Assign `COMPLIANT` only with complete source/type/command/validator/persistence/projection/test evidence.
- [ ] Publish unsupported and ADIA-extension behavior without inflating compliance.
- [ ] Run the complete release verification.
- [ ] Commit `docs(sysml): publish evidence-backed v1.6 compliance`.

## Final release verification

```powershell
npm run test:sysml:architecture
npm run test:sysml
npm run test:sysml:release
npm run test:sysml:release-gate
npm run test:e2e:sysml
npx tsc --noEmit
npm run build
```

Release is blocked if the semantic identity gate fails, a supported compliance row lacks four-level evidence, any path silently creates a type, any caller bypasses commands, or migration changes semantic identity.

## Checkpoints

- **A — Tasks 1–5:** provenance, metamodel, port rules, and no-silent-creation operational.
- **B — Tasks 6–10:** presentations, commands, properties, relationships/allocation, and TestCase repository-backed.
- **C — Tasks 11–14:** target UI/integrations are read-only projections over one writable repository.
- **D — Tasks 15–16:** semantic identity release gate passes and compliance evidence is complete.

