# ADIA Styled Engineering Report Generator (.pdf & .docx) Design Specification

## Overview & Objective
This specification defines the architecture, styling standards, data models, and multi-format exporters (Vector PDF, Word `.docx`, and In-App Live Preview) for ADIA engineering reports. The design directly replicates the visual layout, typography, section hierarchy, callout boxes, and decision matrix structures defined in the reference standard (`BLDC_Fan_Test_and_Decision_Matrix.pdf`).

## Visual Style & Typography Tokens
- **Primary Headers & Document Title**: Deep Navy Blue (`#0f3b57` / `#163b5c`), bold sans-serif.
- **Section Dividers & Accents**: Teal Accent (`#2b7a9e` / `#0e637a`).
- **Test Card Badges (`[T01]`, `[T02]`...)**: Solid `#0e637a` rounded badge with white bold text.
- **Objective / Informational Callout Box**: Light Sky Blue (`#f0f7fc`) background, `#2b7a9e` border (1.5px), `#0f3b57` text.
- **Stop-Test / Decision Warning Callout Box**: Pale Cream/Amber (`#fff9e6`) background, Golden Amber (`#c89234`) border, `#734c00` bold heading and dark text.
- **Data & Decision Tables**:
  - Header Row: Dark Navy (`#0f3b57`) background, `#ffffff` bold text.
  - Body Rows: Alternating zebra background (`#ffffff` / `#f8fafc`), subtle grey borders (`#cbd5e1`), crisp cell padding.
- **Header & Footer**:
  - Running header: Muted grey document title with thin separator rule.
  - Running footer: `Page N` right-aligned in muted grey.

## Document Hierarchy & Sections
Every generated ADIA report follows a standardized 5-tier engineering structure:
1. **Title & Document Status Header**:
   - System title & document title.
   - Primary objective callout box.
   - Document status (`Test-ready draft`, `Formal Verification Passed`, etc.) and safety classification.
2. **Test Logic & Safety Gate**:
   - Sequence rules and pre-execution prerequisites.
   - Stop-test safety rule callout box.
   - Potential root causes / hypothesis list.
3. **Required Equipment, Preconditions & Signals Table**:
   - Instrumentation and equipment list.
   - Parameter prerequisites.
   - Synchronous signal logging table (`Signal group` vs `Signals to log synchronously`).
   - Signal/Rating convention rule callout box.
4. **Detailed Test Procedures (Modular Test Cards)**:
   - Unique test ID badge (`T01`, `T02`, etc.) and test title.
   - Sub-sections: `Purpose`, `Procedure` (numbered steps), `Record` (bulleted signals), and `Acceptance criteria` (bulleted pass/fail criteria).
   - Dedicated `Decision rule` callout box.
5. **Fault-Isolation Decision Matrix & Sign-off Criteria**:
   - Multi-column decision matrix (`Observed result` | `Most probable cause` | `Confirm with` | `Required action`).
   - Causal classification criteria.
   - Formal release condition callout box.

## Architecture & Modules

### 1. Unified Report Data Model (`src/features/reporting/reportDocumentModel.ts`)
Defines TypeScript interfaces for `ReportDocument`, `ReportTestProcedure`, `ReportDecisionMatrixRow`, `ReportSignalGroup`, and `ReportCalloutBox`.

### 2. Live In-App Preview Modal (`src/components/reporting/ReportViewerModal.tsx`)
- Renders pixel-accurate A4 pages with page margins, zoom controls, and print-ready CSS (`@media print`).
- Action toolbar:
  - **Download PDF (`.pdf`)**
  - **Download Word (`.docx`)**
  - **Print**
  - **Close**

### 3. Vector PDF Exporter (`src/features/reporting/exportReportToPdf.ts`)
- Generates high-fidelity, multi-page vector PDFs using standard PDF page flow / jsPDF with custom styling.
- Ensures selectable text, exact margins, correct page breaks, running headers, and footers.

### 4. Word Document Exporter (`src/features/reporting/exportReportToDocx.ts`)
- Generates `.docx` files using the `docx` library.
- Exports matching typography styles, headers/footers with Word page number fields, styled tables with navy headers, and callout callouts.

### 5. Report Generators for ADIA Domains
- `src/features/reporting/generators/createStateMachineVerificationReport.ts`: Generates full verification report from State Machine IR and test analysis.
- `src/features/reporting/generators/createMotorDriveTestReport.ts`: Generates motor drive and fault-isolation report from VLab / simulation results.

## Verification Plan
1. **Unit Tests**:
   - Verify report data model validation.
   - Verify PDF and Docx buffer generation without runtime errors.
   - Verify all required sections, badges, and decision matrix rows are generated.
2. **Visual & UI Verification**:
   - Test in-app preview modal rendering across sample test suites.
   - Verify exported PDF layout against `BLDC_Fan_Test_and_Decision_Matrix.pdf`.
   - Verify exported `.docx` document opens in Word/Office with correct formatting.
