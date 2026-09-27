# Requirements Diagram BDD Visibility

## Goal

Ensure the SysML requirements diagram displays BDD test cases and blocks when, and only when, they participate in a requirement traceability relationship.

## Behavior

- Include every requirement in the active requirements-diagram layer.
- Include non-requirement BDD elements only when they are endpoints of a supported requirement relationship.
- Supported relationships are the existing requirement traceability and structure kinds: `satisfy`, `verify`, `refine`, `trace`, `derive`, `deriveReqt`, `copy`, and `requirementContainment`.
- Connected BDD elements retain their actual stereotypes, including `testCase` and `block`, so their SysML notation remains visible.
- Display the relationship edge when both endpoints are visible.
- Exclude unrelated BDD elements and BDD-only relationships.
- Apply the same scope rules to the live canvas, persisted diagram state, and report/export diagram generation.

## Implementation shape

Introduce one shared scope predicate/helper for requirements-diagram membership. Use it wherever requirements mode chooses blocks or filters relationships. Keep the existing layer rule for requirements and connected elements, defaulting missing legacy `layerId` values to `root`.

The helper should derive membership from relationship endpoints rather than from element type alone. This preserves support for future BDD stereotypes while explicitly validating the requested `testCase` and `block` cases in tests.

## Testing

Add unit coverage for:

1. A requirement linked with `verify` to a test case includes both nodes and the edge.
2. A requirement linked with `satisfy` or `refine` to a block includes both nodes and the edge.
3. An unrelated test case/block and a BDD-only edge remain excluded.
4. The active-layer rule continues to exclude endpoints from another layer.

Run the focused unit tests, then the relevant requirements/BDD end-to-end test and the project typecheck/build checks.
