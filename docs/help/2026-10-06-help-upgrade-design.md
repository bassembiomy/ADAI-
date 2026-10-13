# ADIA Help upgrade design

Date: 2026-10-06. Status: proposed for approval.

## Goal

Complete the existing ADIA Help system using inspected application behavior and existing domain catalogs. Preserve working modeling, simulation, persistence, AI and code-generation paths. Provide visual examples, searchable navigation, contextual Help, automated coverage checks and an evidence-backed final report.

## Approach choices

1. **Recommended: extend existing Help with catalog-derived references.** Retain topic IDs and reuse HELP_DATA, the current block catalogs and Architecture Explorer. Extract HelpModal from App.tsx into the existing Help component area so navigation, search and coverage can be tested without mounting the application. Use authored workflow chapters and metadata-backed references together.
2. **Keep everything in App.tsx.** Smaller initial file move, but expands an already large component and makes isolated navigation/context tests harder. Suitable only for a narrow documentation edit, not this request.
3. **Separate external documentation site.** Can provide rich documentation but duplicates navigation/integration and complicates offline desktop/contextual Help. Unnecessary for the requested in-application system.

## Content and source ownership

- Keep HELP_DATA as the compatibility entry point for existing topic consumers. Use typed topic, section, related-link and diagram definitions, split into focused module files where appropriate.
- Add complete chapters for Sequence, Use Case, Model Browser/repository, State Machine execution, AI and MBSE tools. Expand existing Code Generation, Software Architecture, simulation, HIL, DOE, reporting, settings and import/export chapters rather than creating duplicate topics.
- Each chapter records representative implementation sources and exact support limits. Each workflow explains prerequisites, control/action, result, validation failures and next steps.
- Preserve the existing English Help language and existing topic links. No product translation is included unless requested.
- Sequence example: User -> Controller -> Service -> Repository with calls, replies, a self call and guarded alternative. Explicitly distinguish inferred activation display from editable UML execution specifications.
- Use Case example: actor, system subject/boundary, primary use case, included reuse, conditional extension and specialization, with correct endpoint direction checked against command validation.
- Document actual repository authority per domain. SysML semantic repository, chart semantic/codegen model, X-Bridges graph, V-Lab graph and persistence adapters must remain distinguishable. Do not introduce a universal repository for Help.
- Describe current generated C artifacts and their scheduler/validation contract. C++ output and MISRA certification must not be promised unless implemented and evidenced.
- Describe actual AI schemas, planner routing, clarification, repair, domain commands, transaction validation and rollback. If an existing route bypasses required domain integration, record the discrepancy; any resulting behavioral repair requires a focused design and regression test rather than an undocumented architecture rewrite.

## Block and component references

- Derive X-Bridges types, aliases, categories, ports and parameter defaults from BLOCK_LIBRARY and the existing capability index/palette definitions.
- Derive V-Lab components, port domain/direction/vector/composite properties, parameters and validity bounds from VLAB_LIBRARY; join existing component equation metadata where useful.
- Write reviewed missing descriptions, behavior and examples against actual block execution/equation implementations. Keep domain metadata close to the existing registry where it benefits current consumers; keep purely instructional examples in documentation keyed to canonical IDs.
- Each visible reference provides purpose, inputs/outputs or conserving ports, parameters, behavior, a practical example and a structured connection/port diagram.
- Avoid generic name-based descriptions masquerading as reviewed coverage. Missing instructional content is a coverage gap. Logical blocks may use truth tables/behavior instead of fabricated equations.
- Normalize aliases and distinguish palette entries, factories and unique executable capabilities. Flag COSEC until insertion/factory behavior is verified and corrected or accurately explained.

## Feature coverage

- Compose a documentation feature inventory from existing module/diagram IDs, SysML capability/relationship catalogs, inspector schemas, context-menu command definitions, AI tools, block catalogs and reachable application actions.
- Add stable action/context identifiers only where no suitable existing ID exists. Use a small authored mapping for actions defined inline in UI; preserve a single implementation source for their behavior.
- Map `Feature ID -> Topic ID + optional Section ID` with source evidence. Generated metadata references and authored topics share the same resolver.
- Validate uniqueness, topic/section existence, required content, diagram definitions and related links. Negative tests must prove a new feature with no mapping is reported or fails the coverage gate.
- Reconcile the source-derived UI candidates with stable feature IDs, including dynamically expanded controls. Require a documented reason for non-user-facing/excluded sites. Source line IDs remain audit artifacts only.
- Generate machine-readable and Markdown reports with registered/documented/missing counts, content gaps, coverage percentage and unregistered/unreviewed UI sites. Never declare 100% whole-application coverage by counting only a selectively curated registry.

## Navigation and contextual Help

- Extract and reuse the existing HelpModal presentation and block reference, preserving current launch behavior and Architecture Explorer.
- Add full-text topic/section and block search, module categories, section table of contents, previous/next, related topics and section anchors.
- Use one context-to-topic resolver and Help launch mechanism. Add F1 for the active workspace/focused registered control, module Help buttons and contextual links on relevant property/dialog/menu surfaces.
- Use source-qualified block IDs so X-Bridges/V-Lab ID collisions cannot select the wrong reference.
- Help is read-only with respect to engineering models. It must work in the desktop/offline application and have accessible keyboard navigation and theme-compatible visuals.

## Visual documentation

Reuse the Architecture Explorer and existing source-defined diagram/layout infrastructure where practical. Add structured SVG/React diagrams for workflows, model/browser ownership, state execution, sequence interactions, use cases, BDD/IBD, requirements, data flow, simulation and generated artifacts. Diagrams include text labels/descriptions and fit the Help viewport; use structured data instead of unmaintainable bitmap screenshots for conceptual diagrams.

## Execution stages

1. Complete semantic reconciliation of source/UI/catalog inventory and update gap analysis.
2. Establish typed topic/section/feature mapping and extract current Help UI with parity tests.
3. Author and verify missing/corrected workflow chapters and structured diagrams.
4. Complete registry-driven X-Bridges/V-Lab instructional references without changing numerical execution.
5. Add full-text navigation and contextual routing across registered actions/properties/modules.
6. Add coverage checks/reporting, prove missing-feature detection and reconcile all UI sites.
7. Run Help and affected module checks, TypeScript, build checks appropriate to frontend changes, and browser/desktop Help flows. Compare baseline failures and fix task-related regressions.

## Acceptance checklist

- All requested Sequence and Use Case concepts explained, with implemented limits and complete visual examples.
- State Machine authority, validation, execution cycle and generated scheduler documented against code.
- AI and Software Architecture chapters explain actual command/model boundaries.
- MBSE/MBD, blocks/components, commands, properties, UI actions and workflows have useful valid Help mappings.
- Search, categories, table of contents, previous/next, related links and contextual launch work.
- Automated coverage detects missing mappings and missing content; final report reaches 100% registered coverage with UI reconciliation evidence.
- Existing functionality remains operational and task-related tests pass.

## Decisions requested

Approve the recommended extension of the existing in-application Help system with catalog-derived references, source-verified chapters, structured visuals and automated coverage. This approves documentation/UI/coverage changes; it does not silently authorize replacing domain repositories or changing simulation/execution semantics.
