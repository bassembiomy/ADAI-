# ADIA Help Reference Implementation Plan

**Goal:** Complete reference structure, diagram coverage and theme integration for existing Help.

**Architecture:** Enrich existing topics with a focused reference module, keeping live catalogs and inspector schemas authoritative. Extend the current Help dialog and retain stable contextual destinations.

**Tech Stack:** React, TypeScript, theme CSS variables, Vitest, Playwright.

- [x] Add completeness tests for all supported elements, relationships and diagram references; verify failures before implementing reference enrichment.
- [x] Implement `src/help/referenceTopics.ts`: authored examples, live property tables, behavior symbol entries and a diagram index; attach through `src/HelpData.ts` without removing stable sections.
- [x] Extend `src/components/help/HelpModal.tsx`: element reference mode, compact documentation index, block contents links and semantic selected states. Verify navigation with component tests.
- [x] Replace fixed colors and undefined variables in HelpModal, HelpDiagram and SoftwareArchitectureExplorer with the application theme contract; verify light/dark rendering.
- [x] Review unresolved current-source callbacks, author precise instructions, preserve previous reviews and regenerate source coverage after all UI edits.
- [x] Run Help tests, TypeScript and browser flows, inspect screenshots, write an audit report with counts and limitations.
