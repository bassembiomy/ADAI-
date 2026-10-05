# SysML Owned Diagram Workspace Design

## Purpose

Make each SysML diagram an owned, persistent repository element whose tree node,
canvas view, and tab all resolve to the same diagram ID. This prevents multiple
BDDs, Requirements Diagrams, or State Machine Diagrams from being redirected to
a generic module screen.

## Authority and scope

- `OMG_SYSML_1_6`: SysML model elements and their ownership remain semantic
  repository data; a diagram does not duplicate those elements.
- `UML_FOUNDATION`: a diagram is an owned presentation/view of model content.
- `CAMEO_TOOLING`: create diagrams from the selected Containment-tree owner,
  open the resulting diagram, and distinguish tree containment from diagram
  presentation. Cameo behavior is a tooling benchmark, not an OMG requirement.
- `ADIA_EXTENSION`: project bootstrap defaults, tab restoration, legacy-tab
  migration, and the exact UI commands described here.

The work covers BDD, Requirements Diagram, and State Machine Diagram. An IBD
is intentionally contextual: it is opened for an owning Block rather than
created as a root-level default diagram.

## Repository model

`ModelDiagramDefinition` remains the semantic source of truth. Every diagram
has an immutable ID, a `diagramKind`, an owner ID, and, where required, a
context element ID. Its presentation collection is keyed by that exact ID.

New-project bootstrap and project-load migration ensure that each project has
the following diagrams if, and only if, an equivalent default is missing:

| Owner area | Default name | Diagram kind |
| --- | --- | --- |
| Structural | Main SysML BDD | `bdd` |
| Requirements | Main Requirements Diagram | `requirements` |
| Behavior | Main State Machine Diagram | `stateMachine` |

Migration never deletes, renames, or replaces user-created diagrams. It creates
only missing defaults, emits one auditable migration result, and is idempotent.

The Structural and Requirements diagram owners are canonical package/model
owners. The Behavior default is backed by the application's root state-machine
context and its state-machine diagram record; it is not a visual-only tree
placeholder.

## Tree commands and navigation

The explorer projects every diagram underneath its repository owner. The
Structural, Requirements, Behavior, Model, and Package contexts advertise only
legal `New Diagram` choices.

Selecting `New Diagram` must:

1. validate the requested diagram kind and owner before mutation;
2. create the owned `ModelDiagramDefinition` and an empty presentation store in
   one command transaction;
3. insert the resulting node under the selected owner in the containment tree;
4. open a tab for that exact diagram ID and make it active.

Double-clicking any diagram node follows the same exact-ID open path. It must
not select the first diagram with the same kind. IBD node activation remains
Block-context navigation, including a return stack to its origin diagram.

## Tabs and persistence

Replace mode-only entries such as `bdd` and `requirements` with discriminated
workspace tab records. A SysML diagram tab contains `kind: 'sysmlDiagram'` and
the exact `diagramId`; State Machine tabs likewise include their exact diagram
ID and context. Module/tool tabs remain distinct records.

The unified save payload stores the ordered tab records, active tab, active
diagram ID, and IBD return context. On load:

- invalid or deleted diagram tabs are discarded with a diagnostic;
- legacy mode-only tabs resolve once to the corresponding default diagram;
- duplicate entries for the same exact diagram are normalized;
- the active valid diagram is restored, otherwise the Structural default BDD is
  opened.

Closing a tab changes only workspace state. It never deletes a semantic diagram
or its presentations. Deleting a diagram continues through semantic impact
analysis and removes only its own presentation store.

## Validation and error handling

The command gateway rejects duplicate diagram IDs, absent owners, owners that
cannot contain the requested diagram kind, and context owners that do not
exist. All checks run before mutation. UI handlers surface the returned
diagnostic and do not synthesize a tab for a failed command.

## Acceptance tests

Automated repository and browser tests must prove:

1. empty and legacy projects receive exactly one missing default diagram per
   designated area, and repeated migration does not add more;
2. a right-click creation under Structural, Requirements, Behavior, and a
   package persists the correct owner and immediately opens that exact diagram;
3. BDD-A and BDD-B can remain open at once, retain separate presentations, and
   tree double-click opens the requested one;
4. save/load restores ordered diagram tabs and the active exact diagram;
5. an IBD opens only through its Block context and Root/Back returns to the
   originating exact diagram;
6. rejected creation produces no repository, presentation, or workspace-tab
   mutation.

## Non-goals

This change does not add a root IBD, duplicate semantic elements per diagram,
or make Cameo-specific interface behavior an OMG SysML compliance claim.
