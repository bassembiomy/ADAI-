# Comprehensive ADIA Tool Help, Module Capabilities, and Illustrated Block Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide an exhaustive, user-friendly, and illustrated in-tool Help documentation and interactive Block Reference explorer covering all ADIA modules, step-by-step button actions, full HIL capabilities, and all physical/control blocks.

**Architecture:** 
- Expand `src/HelpData.ts` with comprehensive topic records containing rich multi-section documentation, step-by-step UI button instructions, equations, lists, and visual diagrams for every module.
- Upgrade the `HelpModal` in `src/App.tsx` with enhanced domain category filtering, full text/equation search, dynamic SVG schematic pinout rendering, parameter specs tables, and direct deep links between theoretical guides and block components.
- Validate through comprehensive automated unit tests in `src/HelpData.test.ts` and verify build stability.

**Tech Stack:** TypeScript, React, Lucide Icons, Tailwind CSS, Vitest.

## Global Constraints
- Do not break existing Help topics or keys referenced elsewhere in the application.
- All code and doc updates must strictly adhere to desktop security guidelines (no unescaped dynamic HTML execution).
- TypeScript compilation must pass cleanly.

---

### Task 1: Comprehensive Help Data Content Update (`src/HelpData.ts`)

**Files:**
- Modify: `src/HelpData.ts`
- Test: `src/HelpData.test.ts`

**Interfaces:**
- Consumes: `HELP_DATA` structure (`Record<string, { title, category, description, content, image?, sections?, related? }>`).
- Produces: Fully populated, exhaustive help topics for Architecture/SysML, Stateflow, V-Lab, X-Bridges, HIL Suite, DOE/AI Discovery, Industrial Automation, Code Generation Gatekeeper, and Digital Twin Learning Labs with step-by-step UI actions.

- [ ] **Step 1: Write the failing test for HelpData completeness**

```typescript
import { describe, it, expect } from 'vitest';
import { HELP_DATA } from './HelpData';

describe('HELP_DATA catalog completeness and integrity', () => {
  it('contains all essential module guide keys', () => {
    const requiredKeys = [
      'getting-started',
      'architecture-guide',
      'state-machine-fundamentals',
      'state-machine-transitions',
      'state-machine-simulation',
      'state-machine-tutorial',
      'vlab-fundamentals',
      'vlab-physics',
      'vlab-fluid-dynamics',
      'vlab-blocks-reference',
      'motor-models',
      'vfd-control',
      'xbridges-ref',
      'hil-fundamentals',
      'hil-configuration',
      'hil-dashboard',
      'hil-code-generation',
      'doe-discovery',
      'code-generation',
      'industrial-automation',
      'learning-labs',
      'robot-vacuum-digital-twin'
    ];

    for (const key of requiredKeys) {
      expect(HELP_DATA[key]).toBeDefined();
      expect(HELP_DATA[key].title).toBeTruthy();
      expect(HELP_DATA[key].category).toBeTruthy();
      expect(HELP_DATA[key].sections?.length).toBeGreaterThan(0);
    }
  });

  it('ensures each guide topic contains step-by-step instructions and button actions', () => {
    Object.entries(HELP_DATA).forEach(([key, topic]) => {
      expect(topic.content.length).toBeGreaterThan(20);
      expect(topic.sections).toBeDefined();
      topic.sections?.forEach(sec => {
        expect(sec.title).toBeTruthy();
        expect(sec.body).toBeTruthy();
      });
    });
  });
});
```

- [ ] **Step 2: Run test to verify initial state or failure**

Run: `npx vitest run src/HelpData.test.ts`

- [ ] **Step 3: Update `src/HelpData.ts` with comprehensive module guides, button action steps, and illustrations**

Add comprehensive, step-by-step UI button instructions (e.g. `+ Add Block`, `Add Port`, `Signal Mapper`, `Fault Injection`, `Start Simulation`, `Generate HIL Code`, etc.) and visual layout diagrams across all categories in `src/HelpData.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/HelpData.test.ts`
Expected: PASS

---

### Task 2: Enhance Illustrated Block Reference & Help Explorer (`src/App.tsx`)

**Files:**
- Modify: `src/App.tsx:5360-5740`
- Test: `src/HelpData.test.ts`

**Interfaces:**
- Consumes: `VLAB_LIBRARY`, `XBRIDGES_LIBRARY`, `HELP_DATA`.
- Produces: Enhanced `HelpModal` with domain filtering, search, interactive SVG block schematic rendering, port pin positions and types, equation display, parameter tables, and direct "How to use" guidance.

- [ ] **Step 1: Write test validating block library integration for HelpModal**

Add unit tests to `src/HelpData.test.ts` checking that `VLAB_LIBRARY` and `XBRIDGES_LIBRARY` blocks are correctly transformed into searchable reference items with valid names, domains, ports, and equations.

- [ ] **Step 2: Update `HelpModal` in `src/App.tsx`**

Enhance the component explorer in `HelpModal`:
- Add Domain category filter pills (All, Electrical, Mechanical, Thermal, Fluid/Gas, Control, Logic, Power, AI).
- Add Engine source filter (All, V-Lab, X-Bridges).
- Enhance search to filter across block names, domains, parameter keys, and descriptions.
- Enhance SVG block schematic visualizer with color-coded port pins (`In`, `Out`, `Across`, `Through`, `Bidirectional`) and terminal labels.
- Render parameter sheets with descriptions, default values, and units.
- Render mathematical formulations with clear syntax.
- Add "How to Use & Button Steps" section for selected blocks.

- [ ] **Step 3: Run Vitest tests**

Run: `npx vitest run src/HelpData.test.ts`
Expected: PASS

---

### Task 3: Full End-to-End Build & Visual Verification

**Files:**
- Verify: `src/App.tsx`, `src/HelpData.ts`, `src/HelpData.test.ts`

- [ ] **Step 1: Run complete test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 2: Run TypeScript build check**

Run: `npm run build` or `npx tsc --noEmit`
Expected: Zero compilation errors.

---
