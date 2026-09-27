# BDD/IBD Property and Usage Synchronization

## Goal

Make the legacy BDD and IBD views behave like Cameo/MagicDraw for structural
properties while keeping one consistent semantic model across the UI, backend
adapter, persistence, undo/redo, validation, and rendering.

## SysML behavior

- A `part` property typed by a Block is a composite structural usage and is
  represented in the owning Block's IBD.
- A `reference` property typed by a Block is a non-composite structural usage
  and is represented in the owning Block's IBD with reference/shared semantics.
- `value`, `flow`, and `constraint` properties remain BDD features and do not
  create ordinary IBD part nodes.
- BDD property creation and IBD shape display are separate in Cameo, but ADIA
  will automatically display eligible usages because its IBD canvas is the
  active structural editor. Coordinates and diagram visibility remain
  presentation data, not semantic identity.

## Canonical synchronization

Introduce one pure synchronization service that reconciles a Block's property
features with its owned IBD usages. It will:

- match existing usages by stable property identity;
- create missing usages for eligible `part` and `reference` properties;
- update usage name, type, multiplicity, owner, and aggregation when the
  property changes;
- remove generated usages when the property is deleted or changes to a
  non-structural kind;
- preserve layout, connectors, and user-owned presentation data when identity
  is retained;
- avoid creating usages for invalid or unresolved types and surface validation
  diagnostics instead.

The reverse direction will project eligible IBD usages back into BDD properties
using the same stable identity. The service must be idempotent and must not
duplicate properties or usages when called repeatedly.

## Aggregation mapping

| BDD property kind | Type | IBD usage | Aggregation |
|---|---|---|---|
| `part` | Block | visible structural usage | `composite` |
| `reference` | Block | visible structural usage | `reference` |
| `value` | ValueType/scalar | no ordinary part usage | none |
| `flow` | flow/item classifier | no ordinary part usage | none |
| `constraint` | constraint classifier | no ordinary part usage | none |

## UI behavior

- BDD property editor remains the entry point for creating and editing
  properties.
- IBD part editor remains the entry point for editing usage layout and, when
  allowed, usage name/multiplicity/type.
- Both editors call the same synchronization boundary, so edits from either
  view produce the same model result.
- IBD renders all eligible usages owned by the current context, including
  reference usages, while connectors continue to target port usages only.
- Deleting a property removes its generated usage and dependent connectors
  according to the existing deletion policy.

## Validation and persistence

- Validate type existence, block-kind compatibility, valid identifiers,
  multiplicity, abstract-block instantiation, and one composite owner rule.
- Keep BDD property and IBD usage changes in the same undo/redo transaction.
- Persist and reload stable identity and aggregation without reconstructing
  semantic elements from canvas coordinates.
- Keep unresolved typed usages visible as diagnostics rather than silently
  converting them to generic properties.

## Testing

Add unit and integration coverage for:

1. BDD `part` property creates one IBD composite usage.
2. BDD `reference` property creates one IBD reference usage.
3. Value/flow/constraint properties do not create IBD usages.
4. Renaming, retyping, and multiplicity edits synchronize both views.
5. Removing a property removes its generated usage and connectors safely.
6. Editing an IBD usage updates its BDD property.
7. Reconciliation is idempotent and preserves layout/connectors.
8. Save/load and undo/redo preserve the synchronized result.

## Scope boundary

This work covers BDD properties, IBD usages, ports/connectors affected by
usage lifecycle, validation, persistence, and the legacy-to-canonical adapter.
It does not redesign unrelated requirements, state-machine, or V-Lab models.
