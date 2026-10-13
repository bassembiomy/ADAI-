# ADIA Local AI Engineering Agent Evaluation & Architecture Report

> 2026-09-19 update: The general X-Bridges engineering agent now replaces single-purpose inverter routes with a general capability-indexed architecture across all 8 catalog domains: electrical, control, signal processing, robotics, thermal, hydraulic, logic, and mixed-rate. Provenance-controlled pattern stores, lawful public ingestion, quarantine for foreign imports, bounded repair, deterministic optimization, isolated plan compilation/simulation proof, atomic per-action transactions, verified persistence, and one-step undo are fully certified.

## 1. Executive Summary

This report evaluates ADIA's local AI Engineering Agent infrastructure, certifying the transition from specialized inverter planning to a general, catalog-derived engineering capability across any model expressible in X-Bridges.

The system is fully local, offline-capable, and operates within strict security and engineering invariants:
- **Zero Hallucinated Blocks, Ports, or Parameters**: Model proposals strictly reference canonical definitions from `BLOCK_LIBRARY` via `buildXbridgesCapabilityIndex()`.
- **Isolated Plan Proof Before Approval**: Every execution plan undergoes offline compilation and simulation proof (`proveXbridgesPlan`) using an isolated background worker. No plan approval is requested unless proof succeeds.
- **Zero Synthetic Fallbacks**: Incomplete or missing solver metrics output explicit `OBSERVABLE_UNAVAILABLE` rather than synthetic or hardcoded numbers.
- **Per-Action Approvals Inside One Atomic Transaction**: Execution runs within `XbridgesAgentTransaction`, capturing snapshots and guaranteeing 100% rollback on user rejection, fault injection, or cancellation.
- **Verified Persistence & Restarts**: Models saved via atomic temp-and-rename retain sha256 content hashes and graph fingerprints (`canonicalJson`). Disk reload mismatches fail-closed.
- **Offline Pattern Knowledge Base & Ingestion**: Provenance-tracked pattern storage and lawful public ingestion (clean-room parsing into quarantined read-only models without code execution).
- **Deterministic Repair & Optimization**: Up to 3 iterations for bounded topological repairs; deterministic Pareto-driven optimization with truthful simulation evidence.

---

## 2. Invariants & Security Boundaries

| Invariant | Enforcement Mechanism | Security & Integrity Property |
|---|---|---|
| **Local-Only LLM Loopback** | `LocalOllamaProvider`, `isValidLoopbackUrl` | Restricts API endpoints strictly to loopback addresses (`127.0.0.1`, `localhost`, `::1`). Blocks internet egress. |
| **No Arbitrary Execution** | Tool Gateway, `EngineeringToolDispatcher` | No shell, file-write, `eval`, or unrestricted mutation tools are exposed to the model. |
| **Fail-Closed Preflight & Proof** | `proveXbridgesPlan`, `PlanPreflight` | Unknown block definitions, nonexistent ports, or unbridgeable connections fail in isolated worker before any UI mutation. |
| **Atomic Transactions & Undo** | `XbridgesAgentTransaction`, `LiveXbridgesModelAdapter` | Captures before-state snapshots and state hashes. Rolls back on any fault. Revision increments only on commit. UI supports complete transaction undo. |
| **Truthful Simulation Observables** | `SimulationTools`, `proveXbridgesPlan` | Produces real `engineRunId` and measured ODE execution. Returns `OBSERVABLE_UNAVAILABLE` when measurements are not captured. |
| **Bounded Repair** | `DiagnosticClassifier`, `boundedRepairLoop` | Classifies diagnostics into repairable vs unrepairable. Maximum 3 attempts with re-validation. Halts with full diagnostic trail if errors persist. |
| **Quarantine of Foreign Imports** | `quarantineModelImport` | Simulink and Scilab imports load in quarantined, read-only state until explicit user review and promotion. |

---

## 3. Cross-Domain Acceptance Corpus Benchmark

The cross-domain acceptance corpus (`src/services/ai/benchmarks/generalXbridgesCorpus.ts`) evaluates all 8 catalog-supported domains alongside 10 negative/fault-injection scenarios:

### Positive Domain Matrix

| Domain | Case ID | Canonical Blocks Verified | Prohibited Hallucinations Blocked | Proof & Simulation | Persistence Fingerprint |
|---|---|---|---|---|---|
| **Electrical** | `corpus_electrical_inverter` | `DC_VOLTAGE_SOURCE`, `THREE_PHASE_INVERTER`, `THREE_PHASE_LOAD`, `THREE_PHASE_PWM` | `FANTASY_QUANTUM_INVERTER`, `MAGIC_AC_SOURCE` | Real `engineRunId`, ODE simulation | Verified sha256 state hash |
| **Control** | `corpus_control_closed_loop_pid` | `Constant`, `Sum`, `PID_CONTROLLER`, `INTEGRATOR_CONTINUOUS`, `Scope` | `NEURAL_BRAIN_CONTROLLER`, `QUANTUM_FEEDBACK_GATE` | Real `engineRunId`, ODE simulation | Verified sha256 state hash |
| **Signal Processing** | `corpus_signal_processing_filter` | `TRANSFER_FUNCTION`, `Scope` | `TELEPATHIC_NOISE_REMOVER` | Real `engineRunId`, ODE simulation | Verified sha256 state hash |
| **Robotics** | `corpus_robotics_vacuum_motion` | `ROBOT_VACUUM_ODOMETRY_SENSOR`, `ROBOT_VACUUM_VELOCITY_PID` | `ANTIGRAVITY_HOVER_DRIVE`, `TACHYON_ODOMETRY` | Real `engineRunId`, ODE simulation | Verified sha256 state hash |
| **Thermal** | `corpus_thermal_air_fryer_loop` | `Constant`, `AIR_FRYER_LEARNING_MODEL`, `Scope` | `PERPETUAL_HEAT_PUMP`, `COLD_FUSION_ELEMENT` | Real `engineRunId`, ODE simulation | Verified sha256 state hash |
| **Hydraulic** | `corpus_hydraulic_fluid_coupling` | `CFD_SPH_WATER_SOLVER`, `DEM_FLUID_COUPLING` | `INFINITE_PRESSURE_INJECTOR` | Real `engineRunId`, ODE simulation | Verified sha256 state hash |
| **Logic** | `corpus_logic_safety_interlock` | `Constant`, `DFlipFlop`, `Scope` | `QUANTUM_ENTANGLED_GATE` | Real `engineRunId`, ODE simulation | Verified sha256 state hash |
| **Mixed-Rate** | `corpus_mixed_rate_continuous_discrete` | `Step`, `Gain`, `Integrator`, `Scope` | `NON_CAUSAL_TIME_WARP_SAMPLER` | Real `engineRunId`, ODE simulation | Verified sha256 state hash |

### Negative & Fault-Injection Invariants

| Category | Injected Fault / Prompt | Expected Behavior | Verification Status |
|---|---|---|---|
| **Unknown Blocks / Ports** | Request referencing nonexistent blocks | Blocked fail-closed; zero workspace mutations | PASS |
| **Unsupported Physics** | Perpetual motion / infinite energy | Explicit refusal; zero mutations | PASS |
| **Insufficient Requirements** | Vague input ("make it better") | Halts at clarification; zero mutations | PASS |
| **Stale / Replayed Token** | Resubmitting consumed approval ID | Throws / rejects fail-closed; no duplicate execution | PASS |
| **Provider Offline** | Ollama endpoint down / unreachable | Fail-closed error reporting; workspace intact | PASS |
| **Malformed Model Output** | Non-JSON / corrupted LLM response | Safe parser recovery; zero unhandled errors | PASS |
| **Fault in `addBlock`** | Injected failure during node addition | Transaction aborted; snapshot restored to 0 blocks | PASS |
| **Fault in `connectPorts`** | Injected failure during wiring | Transaction aborted; partial edges rolled back | PASS |
| **Fault in Simulation Proof** | Malformed ODE solver parameters | Proof fails in worker; plan approval gate blocked | PASS |
| **Disk Save / Reload Fault** | Checksum mismatch on project file | Integrity error flagged; corrupt load rejected | PASS |

---

## 4. Release Verification Matrix

```powershell
# 1. Full General X-Bridges Unit & Benchmark Suite
npx vitest run src/agent src/services/ai src/components/agent src/engine/xbridges src/services/xbridgesWorkerClient.test.ts src/services/localLlmService.test.ts

# 2. End-to-End Playwright Automation
npx playwright test tests/e2e/agent-approval-flow.spec.ts tests/e2e/agent-real-adapter-contract.spec.ts tests/e2e/agent-general-xbridges.spec.ts tests/e2e/agent-xbridges-persistence.spec.ts

# 3. Static Security Analysis (SAST)
npm run scan:sast

# 4. Project File Structure Verification
npm run test:project-files

# 5. Production TypeScript Type Check & Build
npx tsc --noEmit
npm run build
```

