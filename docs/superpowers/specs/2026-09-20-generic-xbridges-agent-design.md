# Design Specification: Generic & Intelligent X-Bridges Agent

- **Date:** 2026-09-20
- **Status:** Proposed / Under Review
- **Target Area:** `src/agent/`, `src/services/ai/`

---

## 1. Overview & Objectives

### 1.1 Problem Statement
Currently, the ADIA agent is constrained by narrow, hardcoded expectations. The clarification engine assumes any non-filter model is a power converter requiring an inverter DC bus voltage and motor load. Furthermore, graph planning relies on a handful of rigid archetypes, and physical circuit demands (such as an RLC circuit) fail without clear guidance to the user.

### 1.2 Target Vision
Transform the X-Bridges agent into a **generic, intelligent systems engineering assistant** capable of:
1. **Universal Model Synthesis**: Comprehending and synthesizing any engineering model representable in causal block-diagram / ODE form (control loops, dynamic plants, signal filters, arithmetic/logic pipelines, energy converters).
2. **Domain-Aware Intelligence**: Instantly detecting requests that lie outside X-Bridges' 1D block simulation scope (such as physical across/through schematic circuits in V-Lab, 3D CFD/FEA, or non-engineering queries) and explaining *why* with constructive alternative guidance.
3. **Context-Sensitive Dynamic Clarification**: Eliminating hardcoded inverter/air-fryer questions in favor of an ontology-driven clarification engine that only asks for parameters natural to the target mathematical structure.
4. **Catalog-Grounded Topological Generation**: Leveraging the full X-Bridges block capability index so that either deterministic canonical patterns or LLM-guided composition can wire valid, executable topologies for novel demands.

---

## 2. Core Architectural Components

```
User Input
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│ 1. Domain Boundary Guard (requestCollaborator.ts)            │
│    • Checks engineering feasibility & domain applicability   │
│    • Physical schematic circuit? -> Explain V-Lab vs X-Bridges│
│    • 3D FEA/CFD? -> Explain 1D lumped parameter boundary     │
│    • Non-engineering? -> Refocus on MBSE capabilities        │
└──────────────────────────────┬───────────────────────────────┘
                               │ (In-Domain X-Bridges Request)
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ 2. General Engineering Ontology & Intent Classifier          │
│    • Dynamic Plant (1st/2nd/nth-order ODE, Transfer Function)│
│    • Control System (Feedback PID, Cascade, Feedforward)     │
│    • Signal Processing (Filtering, Modulation, Conditioning) │
│    • Logic & Mathematics (Arithmetic graphs, State machines) │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ 3. Dynamic Clarification Engine (requirementResolver.ts)      │
│    • Evaluates completeness based on identified structure    │
│    • Extracts inline parameters & units (e.g. 10mH, 100uF)   │
│    • Solicits only missing structural parameters             │
└──────────────────────────────┬───────────────────────────────┘
                               │ (Requirements Complete)
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ 4. Specification & User Approval Gate (approvalGate.ts)      │
│    • Generates formal EngineeringSpecification               │
│    • Presents visual summary to user for confirmation        │
└──────────────────────────────┬───────────────────────────────┘
                               │ (Specification Approved)
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ 5. Dual-Tier Graph Planner (generalGraphPlanner.ts)          │
│    ├── Tier 1: Canonical Mathematical Archetypes (Fast/Exact)│
│    └── Tier 2: LLM Catalog-Grounded Synthesis (Open-ended)   │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ 6. Isolated Sandbox Proof Engine (xbridgesProofRunner.ts)    │
│    • Verifies port compatibility & solver convergence        │
│    • Catches algebraic loops and dangling pins               │
└──────────────────────────────┬───────────────────────────────┘
                               │ (Proof Passed)
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ 7. Live Execution Gate -> Canvas Mutation                    │
│    • Dispatches approved actions to XbridgesApplicationDelegate
└──────────────────────────────────────────────────────────────┘
```

---

## 3. Detailed Component Specifications

### 3.1 Domain Boundary Guard
Integrated within `RequestCollaborator.classifyRequest`:
- **Physical Circuit Recognition**:
  - Detects requests referring to physical component wiring (`resistor`, `capacitor`, `inductor`, `rlc circuit`, `transistor`, `ground`, `schematic`).
  - Response Strategy: Explains that physical acausal networks belong in **V-Lab**. Offers the equivalent **X-Bridges causal block representation** (e.g., continuous transfer function $H(s) = \frac{1}{LC s^2 + RC s + 1}$ or dual-integrator state-space formulation) while giving the user the option to proceed with the mathematical block model or switch to V-Lab.
- **Out-of-Scope Physical Modeling (3D / FEA / CFD)**:
  - Explains that X-Bridges operates in the 1D lumped-parameter differential equation domain, offering lumped approximations when appropriate.
- **Non-Engineering Refusal**:
  - Gracefully refuses non-engineering queries and outlines the supported system engineering capabilities.

### 3.2 Generic Engineering Ontology & Archetypes
Classification is structured by mathematical role rather than hardcoded product names:

1. **Dynamic Plants**:
   - Covers: $n$-th order physical ODEs (RLC circuits, mass-spring-damper, thermal chambers, hydraulic volumes, flywheels).
   - Core blocks: `TRANSFER_FUNCTION`, `INTEGRATOR_CONTINUOUS`, `Gain`, `Sum`.
2. **Closed-Loop Control**:
   - Covers: Feedback loops, PID controllers, feedforward compensation, anti-windup, cascaded loops.
   - Core blocks: `PID_CONTROLLER`, `Sum`, `Constant` (setpoint), `Scope` (feedback observer).
3. **Signal Processing & Conditioning**:
   - Covers: Lowpass, highpass, bandpass, notch filters, signal generators, deadband, saturation.
   - Core blocks: `Sine`, `Step`, `PulseGenerator`, `TRANSFER_FUNCTION`, `Saturation`, `Scope`.
4. **Mathematical & Logical Computation**:
   - Covers: Arithmetic pipelines, algebraic equations, state transitions, threshold triggers.
   - Core blocks: `Add`, `Product`, `Gain`, `RelationalOperator`, `DFlipFlop`, `SWITCH`.
5. **Power Conversion & Drives**:
   - Covers: Inverter bridges, PWM modulators, electrical machines.
   - Core blocks: `THREE_PHASE_INVERTER`, `THREE_PHASE_PWM`, `AC_INDUCTION_MOTOR`.

### 3.3 Dynamic Clarification & Parameter Extraction
The hardcoded power-conversion fallback in `requirementResolver.ts` is replaced:
- **Entity & Unit Parser**:
  - Automatically parses values such as `10mH`, `100uF`, `50Hz`, `24V`, `100 Ohm`, `zeta=0.7`.
  - If the user's initial prompt contains the necessary parameters, questions are skipped entirely.
- **Archetype-Driven Requirements**:
  - For Dynamic Plants: Asks only for input excitation (Step/Sine), system order/parameters, and observation sink.
  - For Controllers: Asks for setpoint and performance criteria.
  - For Filters: Asks for cutoff frequency and filter type.
  - For Pure Math/Logic: Requires 0 questions if the operations are defined.

### 3.4 Dual-Tier Graph Planner
Located in `src/services/ai/planner/generalGraphPlanner.ts`:
- **Tier 1 (Canonical Mathematical Synthesizer)**:
  - Deterministically maps standard archetypes (including 2nd-order / RLC transfer functions, PID feedback, cascaded loops, and multi-stage filters) into exact block and port wiring.
  - Instantaneous, zero-token, and 100% reliable offline.
- **Tier 2 (Catalog-Grounded LLM Topology Generator)**:
  - For arbitrary, novel, or complex compound demands.
  - System prompt provides the active `XbridgesCapabilityIndex` (available blocks, input/output port IDs, parameter definitions).
  - The LLM outputs an `EngineeringModelPlanV2` action list (`add_block`, `connect_ports`, `set_parameter`).
  - Arranges blocks logically along the horizontal canvas axis ($X = 100, 350, 600, 850$).

### 3.5 Isolated Sandbox Proof & Safety Validation
Every generated plan passes through `XbridgesProofRunner`:
1. Validates that every target block exists in the catalog.
2. Validates port compatibility (e.g. connecting an output port to an input port).
3. Executes a virtual simulation step to verify that the solver compiles and runs without NaN or algebraic deadlocks.
4. If proof fails, diagnostic feedback triggers an auto-correction pass before the user is ever presented with an invalid plan.

---

## 4. Verification & Testing Plan

### 4.1 Automated Test Suite
1. **Domain Boundary Guard Tests**:
   - Physical circuit requests (`"create rlc circuit"`, `"resistor and capacitor"`) $\rightarrow$ Verified to explain V-Lab boundary and offer X-Bridges transfer function alternative.
   - Out-of-domain requests (`"write a poem"`, `"simulate aerodynamic airflow"`) $\rightarrow$ Verified to produce structured, informative rejection diagnostics.
2. **Dynamic Clarification Tests**:
   - Test that an RLC / 2nd-order request asks only for dynamic parameters (R, L, C or cutoff) and NEVER asks for an inverter DC bus voltage.
   - Test that pre-parameterized prompts (`"create lowpass filter with fc=100Hz"`) require zero clarification questions.
3. **Graph Synthesis & Proof Tests**:
   - Test synthesis of 2nd-order dynamic plants, PID loops, and arithmetic signal chains.
   - Test isolated proof execution and topology validation.
4. **End-to-End Orchestrator Integration Tests**:
   - Full flow from user prompt through clarification, specification approval, planning, proof, and execution token generation.

---

## 5. Success Criteria
- User typing `"create rlc circuit"` is properly understood, clarified (if parameters are missing), and synthesized into a valid, working X-Bridges simulation model.
- Non-inverter requests are never prompted with inverter-specific questions.
- Out-of-domain physical/non-engineering queries receive clear, educational explanations of tool boundaries.
- 100% of existing tests in `src/agent/` and `src/services/ai/` continue to pass.
