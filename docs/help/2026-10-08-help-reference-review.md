# ADIA Help reference review — 2026-10-08

Implemented the reference organization approved in chat: documentation, element reference and block reference, using ADIA theme colors.

## Reference coverage

- 13 diagram/workspace families have workflows, symbol/connection tables and visual examples.
- 36 supported semantic element kinds have ownership context, inspector property tables, worked examples and context diagrams.
- 27 relationship kinds have endpoint instructions, examples and diagrams.
- 24 additional behavior symbols have individual usage and worked-example entries, including every Activity palette node.
- 485 executable/catalog block references expose 1,736 ports and 1,012 parameters with live defaults, units, bounds, equations, behavior and examples. Physical reference pages also expose documented across/through quantities.
- 583 structured diagrams are attached across the reference topics and block catalog.
- No duplicate section IDs or unresolved related-topic links were found.

The structure follows the purpose/ports/parameters/examples organization of the [MathWorks block reference](https://www.mathworks.com/help/simulink/slref/block-parameters-and-properties.html); ADIA content and theme remain application-specific.

## Current-source audit

The maintained coverage reports now resolve 2,047/2,047 registered instructional destinations. The current scan covers 1,479 handler sites in 94 production TSX files: 1,332 documented, 146 explicitly excluded callback/structural sites, one mapped site, zero unreviewed sites. Source fingerprints remain checked by tests; new unmapped controls fail rather than receiving a generic chapter fallback.

Reviewed new toolbar scrolling, Snap controls, V-Lab run diagnostics and migration notices against their handlers. The authoring tool preserves earlier review entries and existing stable feature IDs when adding reviews.

## Validation

- Full Help, catalog integrity and theme suite: 14 files, 81 tests passed.
- Current-source coverage generation passed with no missing destinations.
- Theme literal check passed for all three Help TSX components.
- Existing browser workflow verification passed: F1, full-text sections, sequence and use-case notation, block bounds, execution diagrams, mobile and Escape.
- Additional browser verification passed seven scenarios: element/property/example navigation; behavior search; compact guide and 13-family index; qualified physical parameters; dark theme; light theme; mobile and Escape. No page errors.
- Inspected desktop dark, desktop light and mobile light screenshots under `docs/help/audit/`.
- Read-only code review found no material issues in the Help implementation.

## Scope and limits

Mapping coverage measures instructional destinations, not numerical model qualification. Physical parameter explanations retain runtime relations and explicit ignored-parameter notes. COSEC remains documented as a palette-only entry without an executable factory. General inspector sample values are labeled as samples, not universal creation defaults; specialized feature fields remain in their contextual editors. Existing unrelated workspace changes were preserved.
