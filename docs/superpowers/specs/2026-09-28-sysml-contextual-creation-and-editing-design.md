# SysML Contextual Creation and Editing Design

## Goal

Make port creation, semantic-property editing, and element ownership predictable across BDD, IBD, Requirements, Package, and Model Explorer views, with one repository-backed behavior regardless of where the user acts.

## User-visible behavior

- Remove the separate `Port` canvas-placement menu. In a BDD, selecting a Block and invoking a port-kind action creates that port on the selected Block. The same semantic creation command is used from Model Explorer.
- Derive the owner of a newly created element from the active semantic diagram context. In an IBD, the active Block is the owner for new Parts and owned properties; if there is no valid active Block context, reject creation with a clear diagnostic rather than opening an owner picker. In a Package Diagram, use the diagram's owning Package. In root BDD and Requirements diagrams, use the root Model unless the active diagram has an explicit semantic owner. Do not ask the user to choose an owner when the context determines it.
- Continue to require explicit selection of a semantic type when the requested item requires one. Never silently create or choose a type; report `TYPE_NOT_FOUND` and offer an explicit `CreateNewType` action when no compatible type exists.
- Expose editable fields that apply to the selected semantic element and relationship. For example, relationship end role names and multiplicities are editable when supported by that relationship kind. Validate edits with the existing SysML semantic rules and surface diagnostics rather than persisting invalid values silently.
- Use common semantic commands for canvas and tree actions. Repository identity/ownership remains authoritative; diagrams and tree nodes are projections/presentations of that semantic state.
- Keep relationship legality diagram-aware: BDD, IBD, Requirements, and Package diagrams may present different legal relationship kinds and endpoints. Editing endpoint metadata must not change or reverse relationship identity/endpoints unintentionally.

## Architecture and data flow

1. A shared diagram-context resolver identifies the active diagram, contextual Block/Package/Requirement, and default semantic owner.
2. Canvas and Model Explorer actions submit creation intents to the same feature/command layer. The layer validates the owner, metaclass, required type, and diagram presentation before repository mutation.
3. Property inspectors edit supported semantic fields using update commands. Parsing and validation happen before commit; rejected edits preserve the prior repository state and expose actionable diagnostics.
4. Diagram projections and the model tree re-read the committed repository state, so an edit or creation is reflected consistently without creating a second semantic element.

## Constraints and failure behavior

- No canvas-only semantic objects or direct UI mutation that bypasses the command gateway.
- No silent type creation or automatic first-candidate selection.
- No owner picker. Use the owner rules above; reject with a diagnostic only when required contextual ownership is missing or invalid.
- Validate multiplicity syntax and relationship-specific constraints before persistence. Fields that are not defined for a relationship kind are not shown as editable fields for that relationship.
- Preserve current user data and unrelated local changes; avoid broad migration or repository redesign.

## Test strategy and acceptance criteria

- Port command tests prove selected-Block ownership, type/constraint validation, no implicit candidate selection, and parity between tree and canvas command paths.
- Context/creation tests prove that creating a Part/property inside a Block IBD uses that Block as owner without an owner prompt, and that creation outside a contextual IBD follows the explicit default/missing-context policy.
- Inspector tests prove role name and multiplicity edits persist through semantic commands, valid values survive reload/serialization, and invalid values are rejected with no partial commit.
- Integration tests prove the same semantic element is represented consistently in repository, tree, and relevant diagram projections, including Requirements and Package views where legal.
- Run focused tests, the relevant SysML suite, TypeScript checking, and a production build before reporting completion.

## Scope boundaries

- This work does not add new SysML metaclasses or relax SysML v1.6 relationship/port constraints.
- It does not make every field applicable to every relationship; only semantically supported properties are editable.
- It does not redesign diagram styling or unrelated navigation behavior.
