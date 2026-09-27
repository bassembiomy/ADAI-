# SysML Use-Case and Port Integration Design

## Goal

Make the use-case diagram semantically correct, eliminate invalid navigation and relationship behavior, define ports only in the appropriate SysML structural diagrams, and provide stable traceability to BDD, IBD, Requirements, Activity, Sequence, and State Machine diagrams.

## Design

The canonical SysML repository remains the single source of truth. A use-case diagram contains actors, subjects, use cases, extension points, and legal use-case relationships. It does not own BDD/IBD ports. A use case may reference the subject block that realizes it and may reference elaborating behavior diagrams. BDD owns `PortDefinition`; IBD owns `PortUsage` and connector usages. Navigation uses stable canonical IDs and diagram-kind-qualified references, so a missing target is reported as a diagnostic rather than silently opening the wrong diagram.

Use-case relationship validation is fail-closed: association, include, extend, generalization, refine, satisfy, verify, and trace each have explicit endpoint rules. Presentation coordinates are stored separately from semantic elements. Semantic edits go through the SysML command gateway; diagram movement updates presentation state only.

The implementation will add a typed cross-diagram reference resolver, a port ownership/compatibility validator, migration diagnostics for legacy use-case nodes and edges, and end-to-end tests proving creation, connection, persistence, navigation, and round-trip export/import.

## Acceptance Criteria

1. Every use-case node and relationship has a valid canonical identity.
2. No use-case diagram creates, duplicates, or edits ports.
3. Every port is owned by exactly one BDD definition or IBD usage according to its metamodel type.
4. Invalid relationship endpoints, dangling references, duplicate names, self-links, and illegal port connections are blocked with actionable diagnostics.
5. Navigation resolves to the correct diagram and element, or shows an explicit unresolved-reference diagnostic.
6. Save/load, legacy migration, report generation, and PlantUML export preserve supported semantics and report loss explicitly.

