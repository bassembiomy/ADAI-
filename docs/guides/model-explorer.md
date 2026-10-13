# ADIA Model Explorer User Guide

The **Model Explorer** is a Cameo-style semantic tree explorer for ADIA that unifies SysML and State Machine authoring. It represents the canonical containment hierarchy of your engineering model independently of visual diagram layouts, providing high-performance tree navigation, authoring, and cross-domain synchronization.

---

## 1. Core Architecture & Mental Model

### Semantic Containment vs Diagram Presentation
- **The Containment Tree is the Single Source of Truth:**
  Elements in the Model Explorer represent true semantic ownership (SysML Schema 3 / State Machine hierarchical containment).
- **Creating Elements in the Tree:**
  Adding an element via the Model Explorer creates the underlying semantic definition. It does not automatically pollute active diagram canvases with visual symbols.
- **Drag-and-Drop to Diagrams:**
  Dragging an element from the Model Explorer onto an active diagram canvas projects a diagram symbol that references the existing semantic element by stable ID—never duplicating the semantic element.
- **Presentation Deletion vs Semantic Deletion:**
  Deleting a shape on a diagram canvas removes only its visual representation. Deleting an element from the Model Explorer destroys the semantic element (and all owned children/references) across the entire model.

---

## 2. Views & Navigation

The explorer toolbar provides instant switching across three operational views:

| View | Mode | Purpose |
| :--- | :--- | :--- |
| **Containment** | Hierarchical Tree | Shows the complete semantic containment tree from root packages/regions downwards. |
| **Diagram** | Context-Filtered | Restricts visible tree items to elements currently instantiated or referenced in the active diagram. |
| **Search** | Filtered Flat/Subtree | Live substring search filtering across labels and stereotypes with ancestor preservation. |

### Quick Actions Toolbar
- **Expand All / Collapse All:** Quickly unfold or collapse deep containment trees.
- **Favorites Filter:** Star high-frequency elements and filter the explorer down to starred elements with a single click.
- **Active Diagram Indicator:** Displays the name of the currently active diagram context.

---

## 3. Keyboard & Mouse Controls

| Action | Shortcut / Gesture | Behavior |
| :--- | :--- | :--- |
| **Select** | Left Click | Selects element and synchronizes diagram selection. |
| **Multi-Select Toggle** | `Ctrl + Click` / `Cmd + Click` | Adds/removes individual nodes to/from selection set. |
| **Contiguous Range Select** | `Shift + Click` | Selects all visible rows between last selected node and clicked node. |
| **Activate / Open** | Double Click / `Enter` | Opens diagram or focuses element in canvas/properties panel. |
| **Inline Rename** | `F2` or Context Menu | Starts inline name editing directly in the tree row. Press `Enter` to commit, `Escape` to cancel. |
| **Context Menu** | Right Click / `Shift + F10` | Opens searchable context menu with available capabilities. |
| **Navigate** | `Up` / `Down` Arrow | Moves focus row-by-row through visible virtualized tree. |
| **Expand / Collapse** | `Right` / `Left` Arrow | Expands or collapses currently focused branch. |

---

## 4. Authoring & Capabilities

Right-clicking any element displays only the capabilities valid for that metatype under the active domain:

### Creating Child Elements
- **SysML:** Create Blocks, Packages, ValueTypes, Interfaces, Parts, Ports, Operations, Constraints, and Usages.
- **State Machine:** Create States, Sub-regions, Initial Pseudostates, Choice, Junction, History (shallow/deep), and Final States.

### Creating Diagrams
- Create Block Definition Diagrams (BDD), Internal Block Diagrams (IBD), Requirement Trees, or State Machine Transition diagrams scoped directly under the target package or block.

### Relationship Wizard
Right-click an element and choose **Add Relationship...** to launch the guided Relationship Wizard:
1. Choose relationship type (e.g. Composition, Association, Generalization, Transition).
2. Filter and search candidate targets across the entire repository.
3. Automatically inspects type compatibility and directional constraints before committing.

---

## 5. Structural Moves, Reparenting & Safety Gates

### Drag-and-Drop Reparenting
- Drag any node onto a valid container to reparent the semantic element.
- **Cycle Prevention:** Reparenting an element into its own descendant hierarchy is forbidden and rejected immediately.
- **Containment Rules:** Metatype constraints prevent invalid parent-child containment (e.g., states cannot contain packages).

### Impact Confirmation Gate
For operations that invalidate or cascade across other elements (such as moving an element with incoming connections, or deleting a block referenced by parts):
1. A **Move / Delete Impact Dialog** displays an exact breakdown of affected descendants, broken relationships, and invalidated diagram symbols.
2. A deterministic cryptographic **impact hash** is calculated.
3. The user must confirm the operation with the matching hash before changes are committed atomically.

---

## 6. Multi-Selection, Clipboard & Duplication

- **Ownership Forest Pruning:** When copying or duplicating multiple selected elements, any node whose ancestor is also selected is automatically pruned from the root list to prevent duplicate copies of nested children.
- **ID Remapping & Relationship Rewriting:** Pasting or duplicating re-generates unique IDs while automatically rewriting internal references, transitions, and parent-child links.
- **Single Reversible Undo Step:** All batch operations, duplications, and moves execute atomically as one undo step in the history stack.

---

## 7. Performance & Scalability

- **Fixed-Row Virtualization:** The Model Explorer uses fixed-row (26px) virtualization capable of rendering 10,000+ elements with smooth 60 FPS scrolling and low memory footprint.
- **Sub-50ms Projection:** Tree flattening, search filtering, and multi-selection forest operations complete in under 50ms even on large-scale models.
- **Per-Project State Persistence:** Tree expansion states, active view mode, and starred favorites are automatically persisted per project in local storage.

---

## 8. Theme Architecture & Accessibility Contract

- **Zero Hard-Coded Palette Colors:** All Model Explorer components strictly consume ADIA CSS design tokens (`var(--surface-panel)`, `var(--surface-canvas)`, `var(--surface-raised)`, `var(--text-primary)`, `var(--text-secondary)`, `var(--text-muted)`, `var(--border-default)`, `var(--focus-ring)`, `var(--diagram-node-selected)`).
- **Dynamic Dark/Light Mode:** Seamlessly adapts to theme toggles without hard-coded Slate, Gray, or Zinc classes.
- **WAI-ARIA Tree Compliance:** Complete `role="tree"` and `role="treeitem"` semantic markup with `aria-expanded`, `aria-selected`, `aria-level`, and keyboard roving tabIndex navigation.
- **Deterministic E2E Verification:** Automated Playwright authoring and theme verification suites guarantee zero regressions.
