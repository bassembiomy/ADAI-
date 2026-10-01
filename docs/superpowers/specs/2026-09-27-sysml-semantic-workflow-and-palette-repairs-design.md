# SysML Semantic Workflow and Palette Repairs Design

**Status:** Approved design awaiting written-spec review  
**Date:** 2026-09-27  
**Scope:** Remaining SysML diagram-interaction repairs, repository correctness, executable compliance evidence, end-to-end persistence, and presentation consistency

## 1. Objective

Complete the remaining SysML v1.6 and Cameo-benchmark interaction work so that tree, canvas, import, script, migration, and AI entry points operate on one repository-first semantic model. Every visible operation must have a command, validation, persistence, projection, undo/redo, and automated-test path. New and restored presentations must use the centralized ADIA semantic color palette, particularly for Port creation and State-to-Requirement traceability.

## 2. Normative Boundaries

- `Port` is a UML Foundation concept and is not automatically stereotyped as a ProxyPort or FullPort.
- `ProxyPort`, `FullPort`, legacy FlowPort representation, Requirement, TestCase, Satisfy, Verify, Refine, Derive Requirement, Trace, and Allocate retain their declared semantic authorities.
- Cameo interaction patterns are tooling benchmarks, not OMG requirements.
- ADIA palette behavior, AI approval, and workflow conveniences are ADIA extensions unless independently required by UML or SysML.
- Compliance is evaluated separately at element, property, relationship, and constraint levels.
- No feature is `COMPLIANT` unless its declared automated semantic evidence ran and passed.

## 3. Architecture

### 3.1 Repository-first command path

All mutation surfaces call the same semantic command gateway:

```text
Tree / Canvas / Import / Script / Migration / AI
                    |
                    v
          Semantic command gateway
                    |
          admission + staged validation
                    |
          atomic repository transaction
                    |
     persistence + history + presentation projection
```

The UI may request an operation and collect required choices, but it must not manufacture semantic elements, relationships, usages, or types directly. Diagram nodes and edges are presentations that reference canonical semantic IDs. Multiple presentations never duplicate their semantic elements.

### 3.2 Shared type-selection contract

Port and Property creation uses a shared type-selection request containing owner identity, requested feature kind, compatible candidate IDs, and an explicit `CreateNewType` action. The workflow applies equally to tree and canvas commands.

- Standard UML Port may remain untyped where UML permits; it is never silently converted into a SysML Port stereotype.
- ProxyPort requires an explicitly selected InterfaceBlock and must satisfy ProxyPort nesting and exclusivity constraints.
- FullPort requires an explicitly selected legal type and must not simultaneously be a ProxyPort.
- Legacy FlowPort uses its compatibility representation and declared direction/type rules.
- PartProperty and ReferenceProperty require an explicitly selected compatible Block type.
- ValueProperty requires an explicitly selected compatible ValueType.
- When no requested type exists, the command returns `TYPE_NOT_FOUND`, compatible candidates, and an explicit `CreateNewType` action. It does not select the first candidate or create a type automatically.

### 3.3 Atomic owned-feature creation

Owned-feature creation stages all affected records before mutation: feature identity, usage identity, ownership, type reference, layout metadata, and any initial presentation. Both generated and caller-provided IDs are checked across every repository namespace. The staged repository receives complete semantic validation before store, history, persistence, or projection is updated.

Any error returns `committed: false` and leaves repository, history, and presentations unchanged. A successful result cannot contain error-severity diagnostics.

### 3.4 Cross-domain endpoint context

State Machine elements that participate in SysML relationships are resolved by stable semantic identity through the shared endpoint index. The same endpoint context is supplied during command admission, staged validation, post-command validation, persistence hydration, import, undo, redo, and reload.

A legal State-to-Requirement relationship remains valid after any later repository mutation. Invalid direction or relationship-kind combinations return a structured error containing relationship kind, source identity and family, target identity and family, reason code, and legal corrective actions.

### 3.5 Presentation and semantic palette separation

Color is presentation metadata and never controls semantic validation. A centralized semantic-style resolver maps semantic role and interaction state to ADIA design tokens. Tree icons, canvas nodes, ports, relationship previews, committed edges, dialogs, editors, exports, and hydrated presentations consume this resolver instead of introducing hard-coded workflow colors.

The default palette roles are:

| Presentation role | ADIA palette family |
|---|---|
| Block | Existing SysML block blue |
| Requirement | Existing requirement neutral/light |
| State | Existing state-machine orange |
| Standard UML Port | Neutral application accent |
| ProxyPort | Blue accent |
| FullPort | Green accent |
| Legacy FlowPort | Amber accent |
| Valid requirement relationship | Requirement relationship accent |
| Selection/focus | Application orange |
| Validation warning | Application amber |
| Validation error | Application red |

User-customized presentation colors remain intact when valid. Missing or invalid presentation styles resolve to palette defaults. A semantic element shown in multiple diagrams resolves the same default role style while allowing presentation-specific user overrides.

## 4. Required Workflows

### 4.1 Tree and canvas creation parity

Creating a Port or Property from the Model Explorer or diagram canvas opens the same type-selection workflow, submits the same command intent, produces the same repository records, and uses the same projection/style resolver. Canceling selection performs no mutation. `CreateNewType` is a separate explicit command followed by resumption of the original creation request.

### 4.2 Port workflow

The user chooses Standard Port, ProxyPort, FullPort, or legacy FlowPort before choosing a compatible type where required. The candidate list is filtered by semantic rules but the repository validator remains authoritative. Successful creation adds one owned semantic feature and, when initiated from a diagram, one presentation. Adding an existing Port to another compatible diagram creates only another presentation.

### 4.3 Property relationships

Properties may participate only in relationships legal for their semantic kind and endpoint context. Association, Dependency, Allocate, and connector workflows use explicit endpoint resolution; they do not substitute the owning Block unless the selected command explicitly requests that meaning. Relationship creation, rename propagation, undo/redo, save, and reload preserve endpoint IDs.

### 4.4 State-to-Requirement traceability

The relationship tool collects a State and Requirement endpoint, validates kind and direction, commits one canonical semantic relationship, and projects it with the approved requirement relationship palette. Double-clicking or selecting either endpoint navigates to or exposes the referenced semantic element without creating a duplicate. Subsequent unrelated mutations must not invalidate the relationship.

### 4.5 TestCase deletion

Deleting a TestCase always performs impact analysis before semantic deletion. If presentations or relationships are affected, confirmation is mandatory. Cancel preserves all records. Confirm removes the canonical element and dependent references according to deletion policy, updates every open projection, persists the result, and records one undoable transaction.

## 5. Compliance Evidence

Each compliance claim records authority, specification section, implementation file, domain type, command, validator, persistence mapping, projection, automated test ID, and status. Test IDs are bound to machine-readable test results rather than a static name registry.

The evaluator applies these rules:

- Missing, skipped, failed, stale, or unexecuted evidence cannot produce `COMPLIANT`.
- Element, Properties, Relationships, and Constraints are evaluated independently.
- Overall status is no stronger than the weakest mandatory level.
- Evidence artifacts include source revision and test-run identity so results from another revision cannot certify the current code.

## 6. Persistence and History

End-to-end verification uses the application's actual save and hydration paths. JSON stringify/parse in one page is not reload evidence. Tests must save, reload the application, hydrate the repository, reopen relevant diagrams, and assert canonical identities, presentation references, endpoint IDs, palette roles, and user overrides.

Undo and redo operate on atomic semantic transactions. They restore or remove semantic records and all transaction-created presentations without generating replacement IDs.

## 7. Error Handling

Structured failures include a stable code, human-readable message, semantic source and target details when applicable, candidate elements, and legal next actions. Required cases include:

- `TYPE_NOT_FOUND`
- `TYPE_SELECTION_REQUIRED`
- `DUPLICATE_SEMANTIC_ID`
- `DUPLICATE_USAGE_ID`
- `INVALID_PORT_TYPE`
- `INVALID_PROXY_PORT_NESTING`
- `INVALID_RELATIONSHIP_DIRECTION`
- `MISSING_RELATIONSHIP_ENDPOINT`
- `VALIDATION_FAILED`

Errors use the ADIA error palette but remain accessible through text and iconography; color is not the sole indicator.

## 8. Automated Verification

### 8.1 Semantic tests

- Tree and canvas intents require explicit types and never select the first candidate.
- Standard Port remains distinct from ProxyPort and FullPort.
- ProxyPort constraints are tested at repository level independently of UI.
- Caller-provided feature and usage ID collisions reject without mutation.
- Valid State-to-Requirement relationships remain valid during later mutations and after hydration.
- Invalid endpoint direction produces the correct structured diagnostic.
- Compliance status depends on an actual passing test result for the current revision.

### 8.2 Integration tests

- Tree and canvas creation produce equivalent semantic repository states.
- Creating a new type is explicit and resumes the pending feature request only after success.
- Property-to-Block Association, Dependency, and Allocate preserve explicit endpoints.
- Rename, undo, redo, save, and reload preserve identity and presentation references.
- TestCase deletion cannot bypass impact confirmation.

### 8.3 Browser release gates

- Create every Port kind from both tree and canvas, including wrong-type rejection.
- Create and reload a valid State-to-Requirement relationship.
- Verify State, Requirement, Port, preview, committed relationship, selection, warning, and error colors resolve from approved tokens.
- Create typed Properties and legal relationships, then rename, undo, redo, save, reload, and reopen diagrams.
- Delete a TestCase through mandatory impact confirmation and verify undo/redo.
- Run the existing semantic identity release gate: one Motor definition, multiple presentations, one `leftMotor` PartProperty, one Requirement, one Satisfy relationship, and rename propagation to `BLDCMotor` without semantic duplication.

## 9. Completion Criteria

The repair is complete only when:

1. Every previously unchecked repair-plan requirement is implemented or explicitly superseded by this specification.
2. No production creation path silently selects or creates a semantic type.
3. Repository commands are atomic and cannot commit with error diagnostics.
4. Cross-domain relationships survive unrelated mutations and real application reload.
5. Compliance is derived from current, passing executable evidence.
6. Required browser workflows contain no optional assertions for core behavior.
7. Every affected presentation surface uses centralized semantic palette roles.
8. TypeScript, semantic tests, integration tests, browser tests, and the semantic identity release gate pass from a clean worktree.

