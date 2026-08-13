# Adia Unified Project Layout Redesign

## Objective

Redesign the diagram coordinates in `adia_project_unified_bdd_no_dangling_links.json` so the project opens cleanly in Adia while preserving its engineering content and traceability.

The redesign covers three workspace views:

- System Architecture BDD
- System Requirements & Traceability
- System Internal Block Diagram

All other workspaces and engineering data remain unchanged.

## Constraints

- Preserve every existing object ID, object name, property, operation, constraint, stereotype, requirement description, state-machine element, X-Bridges element, V-Lab element, HIL setting, ENTROPY element, HMI element, and DOE value.
- Preserve all 46 BDD architecture blocks and 45 BDD composition relationships.
- Preserve all 38 requirements, the 29 architecture blocks present in the Requirements workspace, and all 38 satisfy relationships.
- Preserve all 13 IBD parts and 14 IBD connectors.
- Do not add duplicate blocks, synthetic routing nodes, new relationships, or new connectors.
- Keep `default_bdd` as the active file and retain the existing open tabs.
- Keep BDD block ports and `satisfiedReqIds` empty so the BDD does not render non-BDD traces or misleading dangling lines.

## Selected Layout Direction

The approved direction for all three views is a compact, flow-oriented layout designed for Adia's straight-line connector renderer.

### BDD: Compact Centered Tree

The BDD uses four visible hierarchy levels:

1. `Smart Induction Coffee Heater`
2. `Mechanical System`, `Hardware System`, and `Software System`
3. The subsystem groups owned by each domain
4. The component blocks owned by each subsystem group

Layout rules:

- Center the root above the entire diagram.
- Place the three domain blocks on one evenly spaced row.
- Give each domain a non-overlapping horizontal band.
- Place subsystem groups within their owning domain band.
- Place each component close to and below its direct parent subsystem.
- Center sibling sets beneath their parent where space permits.
- Use additional vertical spacing for large sibling sets instead of allowing block overlap.
- Prevent a connector from crossing an unrelated block.
- Keep the composition source at the owning block and the target at the owned block.
- Keep the BDD workspace free of requirements, satisfy relationships, allocation relationships, ports, and requirement-satisfaction metadata.

The layout may use more than one component row when required, but a lower-row component must be positioned so its direct line from the parent does not pass through an upper-row component.

### Requirements: Paired Category Groups

The Requirements workspace keeps both the 38 requirement blocks and the 29 architecture blocks needed to resolve all satisfy links.

Layout rules:

- Organize requirements into coherent engineering categories using spatial grouping.
- Within each category, place requirement blocks in a consistent column or compact cluster.
- Place each satisfying architecture block directly opposite or adjacent to the requirements it satisfies.
- Align related requirement and architecture blocks to minimize diagonal lines.
- When one architecture block satisfies multiple requirements, place it centrally beside that local requirement group.
- Keep categories separated by enough whitespace that trace lines do not cross into neighboring categories.
- Preserve all 38 satisfy relationships and ensure both endpoints are present in the Requirements workspace.
- Do not copy composition relationships into this workspace.

The resulting view is a traceability diagram rather than a duplicate of the BDD hierarchy.

### IBD: Layered Engineering Flow

The IBD uses three functional layers:

- Control and sensing
- Main power and heating flow
- Feedback, inter-board communication, and cooling

Layout rules:

- Arrange the primary energy path from left to right: power cord, AC protection, rectifier/DC bus, lower power PCB, resonant network, induction coil, and pot/boiler.
- Place the auxiliary PSU, upper control PCB, MCU, and IR sensor above the main flow near the parts they interact with.
- Place the upper/lower link and cooling parts below their associated control or power parts.
- Prefer horizontal connectors for the primary flow.
- Keep vertical or short diagonal connectors for control, feedback, and thermal paths.
- Prevent parts from overlapping connectors or one another.
- Preserve every connector's existing part and port endpoints.

## Data Synchronization

Adia imports both unified root data and per-workspace data. The corrected file must therefore keep them consistent:

- The root architecture blocks and relationships remain a complete unified project representation.
- `workspaceFiles.default_bdd.data` receives the approved BDD coordinates and BDD-only relationship set.
- `workspaceFiles.default_requirements.data` receives the approved traceability coordinates and the existing satisfy relationship set.
- `workspaceFiles.default_ibd.data` receives the approved part coordinates and existing connector set.
- Shared IDs remain unchanged across root and workspace representations.
- No unrelated workspace data is reformatted semantically or removed.

## Output

Create a corrected JSON copy in the project workspace with a descriptive filename. Preserve the supplied source file unchanged unless the user explicitly requests overwriting it.

The output JSON must remain UTF-8 encoded and valid for Adia's existing project importer.

## Validation

Before delivery, run automated checks that verify:

1. The output parses as JSON.
2. BDD counts remain 46 blocks and 45 relationships.
3. Every BDD relationship is `composition` and resolves to two BDD blocks.
4. No BDD block contains ports or non-empty `satisfiedReqIds`.
5. Requirements counts remain 67 visible blocks and 38 satisfy relationships.
6. Every Requirements relationship resolves to two blocks in the Requirements workspace.
7. IBD counts remain 13 parts and 14 connectors.
8. Every IBD connector resolves to existing source and target parts.
9. Every connector port resolves through the referenced part type where the source data provides a type block.
10. Root IDs and workspace IDs remain unique within their respective collections.
11. `default_bdd` remains the active file.
12. All non-target workspace data is semantically unchanged.

Visual verification in Adia should confirm that blocks do not overlap, connectors do not terminate in empty space, and the three selected layout patterns are recognizable.

## Error Handling

If an existing relationship or connector endpoint fails validation, do not silently delete it. Report the invalid endpoint and stop producing the corrected file until the inconsistency is resolved.

If a compact placement would force a connector through an unrelated node, expand the local category or branch spacing rather than altering the relationship topology.
