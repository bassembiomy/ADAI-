# SysML Human-Readable Labels Design

## Purpose

ADIA will show human-readable SysML names instead of internal semantic IDs on every user-facing SysML surface. A user-assigned `name` is the primary label for blocks, other elements, relationships, connector ends, and item flows. When a name is empty, the UI shows a friendly metaclass label such as `Block`, `Association`, `Connector`, or `Item Flow`; it never falls back to an internal ID.

Stable IDs remain unchanged inside the repository, commands, persistence format, React keys, and selection/navigation state.

## Scope

The rule applies to SysML content in:

- diagram symbols and connection labels;
- Model Explorer and hierarchy rows, including secondary endpoint text;
- Properties panel titles and fields;
- source, target, owner, type, connector-end, realizing-connector, and conveyed-classifier references;
- selectors, menus, breadcrumbs, tabs, dialogs, notifications, and validation messages that identify SysML elements.

Non-SysML technical diagnostics, exported machine-readable data, developer tooling, and persistence files may retain IDs where identity information is required. This change does not rename IDs or modify repository identity semantics.

## Display Contract

A shared presentation helper resolves labels consistently:

1. Resolve the referenced semantic object from the canonical SysML repository.
2. If its trimmed `name` is non-empty, return that name exactly as the user-facing label.
3. Otherwise return its friendly metaclass label.
4. If a reference is stale or unresolved, return a neutral type label such as `Element` or `Relationship`; do not reveal the unresolved ID.

Metaclass formatting converts implementation forms into readable labels, for example `ItemFlow` to `Item Flow` and `SharedAggregation` to `Shared Aggregation`.

For relationships, the Properties title is `<Metaclass>: <display label>`. If the relationship is unnamed, the title is simply the friendly metaclass label rather than a duplicated value such as `Association: Association`.

## Name Editing

The Properties panel retains an editable `Name` field for every SysML object whose domain model supports naming, including relationships. Committing a new name uses the existing typed command and canonical repository flow. After a successful rename, all visible projections refresh immediately and show the new name.

Clearing a name is allowed where current domain validation permits it. The UI then switches to the metaclass fallback. A name is presentation text, not identity: renaming never changes an ID or breaks references.

## Properties and References

Raw identity fields such as `ID`, `Source ID`, and `Target ID` are removed from user-facing SysML property schemas. Reference fields are labeled by their semantic role, such as `Source`, `Target`, `Owner`, or `Type`, and display resolved names or metaclass fallbacks.

Where a reference is editable, it uses the existing reference-selection behavior with human-readable choices while commands continue to submit the selected internal ID. A free-text field must not expose or require an ID. Read-only references use the same name resolver.

## Model Explorer and Diagrams

Model Explorer nodes use names or friendly metaclass fallbacks for primary labels. Relationship endpoint summaries resolve both endpoints and render `<source label> -> <target label>`. Connector ends display the role element's name or metaclass fallback. Item-flow conveyed classifiers and realizing connectors are likewise resolved before display.

Diagram elements and relationships follow the same contract. An assigned SysML name is shown without replacing it with a generated ID. An unnamed object receives only the friendly metaclass fallback. Internal IDs may remain in DOM attributes used for automation and selection, but they must not appear as visible text, accessible labels intended for users, or tooltips.

## Architecture

The implementation adds one repository-aware display-name resolver and reuses it from inspector-schema, Model Explorer, and diagram presentation adapters. Surface-specific components consume already-resolved labels and do not implement independent `name || id` fallbacks.

This is a projection-only change. The canonical repository remains the single source of truth, and command payloads continue to use stable IDs. No migration is needed because stored identities and names do not change.

## Error Handling

Missing or dangling references never leak their raw ID into the normal UI. They display a neutral friendly fallback and may expose a separate non-identifying warning such as `Referenced element is unavailable`. Domain validation and developer logs retain enough internal context to diagnose repository corruption.

Name-update failures leave the canonical model and every projection unchanged and show the existing actionable validation message.

## Verification

Implementation follows test-driven development. Tests first demonstrate the current ID leakage, then verify:

- named and unnamed elements resolve to the assigned name and friendly metaclass respectively;
- named and unnamed relationships follow the same rule;
- Properties schemas contain no visible raw-ID identity field;
- source and target references render endpoint names or metaclass fallbacks while commands still carry IDs;
- Model Explorer primary and secondary labels contain no internal IDs;
- connector ends and item flows resolve referenced names consistently;
- diagram labels update after a rename and fall back after a name is cleared;
- save/reload preserves stable IDs and restores the same visible names;
- UUID-like and generated internal IDs do not appear in representative SysML user workflows.

Focused unit tests cover the resolver and schema/projection behavior. React integration tests cover Properties and hierarchy rendering. A Playwright regression reproduces the BDD relationship scenario from the reported screen and asserts that the relationship, source, target, and block labels are human-readable.

## Definition of Done

The change is complete when every supported user-facing SysML surface uses the shared naming contract; assigned names propagate across the diagram, hierarchy, and Properties panel; unnamed objects show friendly metaclasses; reference editing remains functional through internal IDs; and automated tests find no visible ID fallback in representative SysML workflows.
