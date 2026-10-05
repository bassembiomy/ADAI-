# SysML Connection Policy Hardening Design

**Date:** 2026-09-14

**Status:** Approved design

## Objective

Make BDD and related SysML connection behavior deterministic and consistent with the application's OMG SysML 1.6 baseline. Every invalid new connection, relationship-type change, or stereotype change must be rejected before model state changes and must show a clear popup error. Existing invalid relationships loaded from older projects must be preserved and reported rather than silently deleted.

## Scope

This change covers:

- BDD relationships: association, composition, shared aggregation, generalization, dependency, and allocation.
- Requirement relationships: requirement containment, deriveReqt, copy, satisfy, verify, refine, and trace.
- IBD relationships and connectors currently exposed by shared UI: binding, assembly, and delegation.
- Built-in endpoint types: Block, Interface Block, Interface, ValueType, Enumeration, Requirement, Verification Case, Part/usage, Port, and constraint/value parameters where represented.
- Custom stereotypes whose metaclass family is not currently declared.
- Connection creation, relationship editing, element stereotype changes, canonical gateway commands, imports, persistence validation, UI choices, and error presentation.

This change does not redesign diagram notation, migrate the entire UI to canonical repository state, add SysML v2 support, or silently repair/delete legacy relationships.

## Normative Baseline

The policy follows OMG SysML 1.6 / ISO/IEC 19514:2017 and its UML 2.5.1 foundation. The implementation must preserve the project's explicit SysML 1.6 conformance boundary and must not claim SysML v2 equivalence.

## Architectural Decision

Introduce one pure, typed connection-policy module as the single source of truth. Legacy UI validation and canonical repository validation will translate their model elements into the same endpoint taxonomy and call the same evaluator. Diagram-specific adapters may add context checks, but they must not redefine endpoint compatibility.

The evaluator accepts a relationship kind, source endpoint descriptor, target endpoint descriptor, and validation context. It returns a structured decision with stable diagnostic codes and corrective guidance. It performs no UI work and no model mutation.

Suggested interface:

```ts
export type SysmlEndpointFamily =
  | 'block'
  | 'interfaceBlock'
  | 'interface'
  | 'valueType'
  | 'enumeration'
  | 'requirement'
  | 'verificationCase'
  | 'part'
  | 'port'
  | 'valueParameter'
  | 'unknown';

export interface ConnectionEndpoint {
  id: string;
  name: string;
  family: SysmlEndpointFamily;
  ownerId?: string;
}

export interface ConnectionPolicyDecision {
  allowed: boolean;
  diagnostics: Array<{
    code: string;
    message: string;
    correctiveAction: string;
  }>;
}

export function evaluateSysmlConnection(input: {
  relationshipKind: string;
  source: ConnectionEndpoint;
  target: ConnectionEndpoint;
  diagram: 'bdd' | 'ibd' | 'requirements' | 'rtm';
}): ConnectionPolicyDecision;
```

## Endpoint Compatibility Rules

### BDD relationships

| Relationship | Allowed | Rejected |
|---|---|---|
| Association | Compatible classifier endpoints: Block family, Interface family, ValueType, and Enumeration. | Requirement, Verification Case, Part, Port, parameter, or unknown endpoints in BDD. |
| Composition | Block-family whole to Block-family part type. Direction is whole to part. | ValueType, Enumeration, Interface, Requirement, Verification Case, Port, parameter, or unknown endpoints. Self-links, ownership cycles, and a second composite owner are rejected. |
| Shared aggregation | Block-family whole to Block-family shared type. Direction is whole to shared member. | ValueType, Enumeration, Interface, Requirement, Verification Case, Port, parameter, or unknown endpoints. Self-links are rejected. |
| Generalization | Compatible families only: Block/InterfaceBlock within the Block family; Interface to Interface; ValueType to ValueType; Enumeration to Enumeration. Direction is specific to general. | Cross-family inheritance, self-links, missing endpoints, leaf targets, and inheritance cycles. |
| Dependency | Any resolved NamedElement supported by the repository. Direction is client to supplier. | Missing endpoints and self-links. Reciprocal or cyclic dependency graphs are allowed. |
| Allocation | Any resolved model element supported by the repository when source and target are distinct. Direction is allocated-from to allocated-to. | Missing endpoints and self-links. Reciprocal or cyclic allocation graphs are allowed. |

Association between a Block and a ValueType is not used as a substitute for a value property. The UI must guide the user to create a value property typed by the ValueType. Composition and aggregation involving a ValueType must be blocked.

### Requirement relationships

| Relationship | Required direction |
|---|---|
| Requirement containment | Parent Requirement to child Requirement; one parent per child; acyclic. |
| deriveReqt | Derived/client Requirement to source/supplier Requirement; acyclic under the application's governed hierarchy rule. |
| copy | Copy Requirement to source Requirement; acyclic. |
| satisfy | Block-family definition or Part usage to Requirement. |
| verify | Verification Case to Requirement. |
| refine | Non-Requirement model element to Requirement. |
| trace | At least one endpoint is a Requirement; endpoints are distinct. |

Generic BDD composition, aggregation, association, and generalization must not be offered for Requirement endpoints.

### IBD and parametric connections

- Assembly connects compatible ports on two internal parts in the same IBD context.
- Delegation connects exactly one context-boundary port to a compatible internal-part port.
- Binding connects compatible value/constraint parameters in the appropriate IBD or parametric context; it is not a generic BDD classifier relationship.
- Port direction, type, unit, context ownership, duplicate, and self-connection checks remain mandatory.
- Binding must be removed from generic BDD relationship choices.

### Unknown custom stereotypes

Until a custom stereotype declares its endpoint/metaclass family, it receives family `unknown`. It may participate only in dependency and allocation, or in trace/refine when the requirement-direction rule is satisfied. Structural ownership, association, and generalization are rejected with guidance to declare a supported family or use a built-in stereotype.

## Validation Flow

### Creating a connection

1. Resolve both endpoint descriptors.
2. Evaluate the central endpoint compatibility policy.
3. Apply relationship-specific duplicate, ownership, context, multiplicity, and cycle checks.
4. If any error exists, show the popup and return without calling history or state mutation functions.
5. If valid, add history and create the relationship.

### Changing a relationship kind

The editor evaluates the proposed kind against the unchanged endpoints before updating state. Invalid choices are excluded from the dropdown. Defensive validation still rejects programmatic or stale-UI updates and displays the popup.

### Changing an element stereotype

Before applying a stereotype change, the application projects the candidate endpoint family and evaluates every connected relationship. If any relationship becomes invalid, the entire stereotype change is rejected atomically. The popup lists the first invalid relationship and summarizes any additional affected relationships. No relationship is silently removed or converted.

### Loading older projects

Persistence preserves resolvable legacy relationships. Post-load validation marks relationships that violate the new rules and reports stable diagnostic codes. The user may edit or delete them, but export/release qualification remains blocked until errors are corrected. Missing endpoints continue to use the existing quarantine behavior.

## Popup Error Experience

Rejected operations use a dedicated modal dialog rather than `window.alert`. The modal must include:

- Title: `Invalid SysML connection` or `Invalid stereotype change`.
- Attempted relationship and direction.
- Source display name and endpoint family.
- Target display name and endpoint family.
- Plain-language reason.
- Corrective action, such as `Create a value property typed by Temperature instead.`
- A single `Close` action that restores focus to the initiating control.

Example:

```text
Invalid SysML connection

Composition cannot connect Controller (Block) to Temperature (ValueType).
Composition requires a Block-family whole and a Block-family part type.

Create a value property on Controller typed by Temperature instead.
```

All rejections also remain available in the application's error log for diagnostics and automated test visibility.

## UI Behavior

- After selecting two endpoints, show only relationship kinds allowed for that endpoint pair and current diagram.
- Requirement relationships appear only for endpoint pairs that can legally use them.
- Binding appears only in the relevant IBD/parametric context.
- If no legal relationship exists, do not create a default association; immediately show an explanatory popup.
- The default relationship may remain association only when association is legal for the selected pair.
- Relationship names and direction labels must be explicit in popup messages.

## Error Codes

Reuse established codes where their meaning is correct. Add focused codes for missing cases:

- `INCOMPATIBLE_RELATIONSHIP_ENDPOINTS`
- `CROSS_FAMILY_GENERALIZATION`
- `VALUE_TYPE_REQUIRES_VALUE_PROPERTY`
- `INVALID_AGGREGATION_ENDPOINTS`
- `INVALID_RELATIONSHIP_DIAGRAM`
- `UNKNOWN_STEREOTYPE_FAMILY`
- `STEREOTYPE_CHANGE_BREAKS_RELATIONSHIP`

Existing codes for missing endpoints, self-links, duplicates, composition cycles, multiple composite owners, requirement direction, port direction/type/unit, and connector context remain authoritative.

## Test Strategy

### Policy unit tests

Use table-driven tests covering the Cartesian product of built-in endpoint families for every relationship kind. Every row asserts allowed/rejected status and the exact primary diagnostic code. Include both directions when direction changes legality.

Explicit regression cases include:

- Block to ValueType composition and aggregation are rejected.
- Block to ValueType association is allowed only as classifier association, while the UI guidance recommends a value property.
- ValueType to ValueType generalization is accepted.
- Block to ValueType generalization is rejected.
- Interface to Interface and Enumeration to Enumeration generalization are accepted.
- Requirement endpoints reject generic BDD structural relationships.
- Reciprocal association, dependency, and allocation do not trigger cycle errors.
- Composition, inheritance, requirement containment, deriveReqt, and copy cycles are rejected where governed.
- Unknown custom stereotypes follow the conservative policy.

### Validator parity tests

For each matrix row, build equivalent legacy and canonical endpoints and assert that both adapters return the same `allowed` result and primary diagnostic code. These tests prevent the current legacy/canonical drift.

### UI component tests

- The relationship dropdown contains only valid kinds for the selected endpoints.
- Invalid relationship updates leave state unchanged and display the modal.
- Invalid stereotype changes leave the element and all relationships unchanged and display the modal.
- Popup content contains the relationship, endpoint names/types, reason, and corrective action.
- Closing the popup restores focus.

### Application integration tests

- Canvas Block-to-ValueType creation follows the permitted default or prompts for a valid choice without creating an illegal structural relationship.
- Composition from Block to ValueType is rejected before history/state mutation.
- Changing a composed Block to ValueType is rejected atomically.
- Requirement and IBD relationship choices are isolated to their diagram contexts.
- Valid connections continue to create, edit, persist, reload, and export.

### Persistence and release tests

- Imported invalid-but-resolvable relationships are preserved with diagnostics.
- Missing endpoints remain quarantined.
- A newly created model cannot persist an invalid relationship through the command gateway.
- The SysML release suite, TypeScript check, focused component tests, and applicable Playwright scenarios pass.

## Acceptance Criteria

1. No invalid new connection can mutate model state through canvas creation, relationship editing, canonical commands, or adapters.
2. Every rejected user operation displays a modal with actionable endpoint-specific guidance.
3. Changing an element stereotype cannot leave an invalid connected relationship.
4. Legacy and canonical validation agree for every supported endpoint/relationship pair.
5. Relationship choices are filtered by endpoint types and diagram context.
6. Existing imported invalid relationships are preserved and diagnosed, never silently deleted.
7. Reciprocal association, dependency, and allocation relationships are not falsely rejected as cycles.
8. Exhaustive matrix, parity, UI, integration, persistence, and release-gate tests pass.

