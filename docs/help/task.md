# ADIA Help upgrade checklist

- [x] Read the complete attached request.
- [x] Inspect existing Help, architecture entry points and domain catalogs.
- [x] Capture initial source-derived UI and registry inventories.
- [x] Record confirmed gaps, support limits and existing test baseline.
- [x] Present reviewable design options and recommended architecture.
- [x] Obtain approval of the proposed design under the brainstorming workflow.
- [x] Finish semantic UI/feature reconciliation and detailed implementation plan.
- [x] Implement typed documentation mappings and maintain existing topic compatibility.
- [x] Complete source-verified module documentation and examples.
- [x] Add structured visual diagrams.
- [x] Complete block/component instructional references from live catalogs.
- [x] Add full-text search, navigation and contextual Help.
- [x] Implement and exercise automated coverage checks/reporting.
- [x] Run affected tests, TypeScript and UI verification.
- [x] Produce the final Help Coverage Report with remaining gaps/exclusions disclosed.

## 2026-10-13 reference extension (existing approved MATLAB-style Help design)

- [x] Audit the live block, diagram and State Machine runtime/code-generation sources; identify contextual-routing and symbol gaps.
- [x] Test and document every palette/factory block with its live palette glyph (or its actual generic fallback), default terminals, connection rules, parameter reference and conditional embedded eligibility (including unavailable palette-only entries).
- [x] Route F1 on a qualified block node to its exact reference and test the Help UI.
- [x] Add shapes/notation to all cataloged diagram items, semantic elements, relationships and behavior items without claiming unsupported execution.
- [x] Add a cross-workspace modeling guide, concrete diagram construction recipes, and source-backed simulation/embedded priority and scheduling diagrams.
- [x] Run Help/catalog tests, coverage audit, TypeScript and UI verification; record any constraints.

Verification: `npm run test:help` (80 passed), `npm run help:coverage` (2,091/2,091 registered destinations, zero unreviewed live UI handler sites), `npx tsc --noEmit --pretty false`, `npm run lint:theme` and `git diff --check` passed. The Vite preview served HTTP 200 through the proxied host and Help navigation was exercised in jsdom; a browser screenshot/E2E run was not possible because Chromium is not installed. Catalog glyphs and terminal positions describe defaults, not edited instances. The coverage audit measures instructional mapping, not simulation accuracy, generated-code parity or hardware qualification.
