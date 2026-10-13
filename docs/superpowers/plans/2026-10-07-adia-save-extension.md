# ADIA Save Extension Implementation Plan

**Goal:** Project and model saves use .adia.
**Architecture:** Reuse normalizeAdiaPath and writeProjectFile.
**Tech Stack:** Electron, React, Node tests, Vitest.

- [x] Write backup and snapshot extension regressions and confirm failures.
- [x] Normalize legacy desktop, folder and snapshot save paths; update backup suffix.
- [x] Update module and cloud export names and import UI.
- [x] Run project-file and SysML persistence tests, syntax checks and scoped diff review.

Validation: project-file suite and 40 targeted persistence tests passed; CommonJS syntax and scoped whitespace checks passed. Full TypeScript check was started and is still pending.
