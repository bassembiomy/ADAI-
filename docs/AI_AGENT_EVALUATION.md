# ADIA Local AI Engineering Agent Evaluation & Architecture Report

## 1. Executive Summary

This report evaluates ADIA's local AI Engineering Agent infrastructure, extending the agent framework into a controlled, validated three-phase inverter engineering workflow without duplicating model engines, registries, validators, persistence, or undo/transaction mechanisms.

The system is fully local, offline-capable, and operates within strict security and engineering invariants:
- The LLM acts strictly as a reasoner/planner and never directly alters ADIA model state.
- All blocks, ports, parameters, and connections resolve against canonical catalog registries (`AdiaBlockCatalog`).
- Mutations occur through narrow adapter operations wrapped inside atomic, journaled, rollback-capable transactions.
- Model validation distinguishes schema, topology, parameters, engineering rules, compile, and simulation outcomes.
- Automated repair is strictly bounded to three attempts and reports truthful outcomes without false positives.

---

## 2. Invariants & Security Boundaries

| Invariant | Enforcement Mechanism | Security & Integrity Property |
|---|---|---|
| **Local-Only LLM Loopback** | `LocalOllamaProvider`, `isValidLoopbackUrl` | Restricts API endpoints strictly to loopback addresses (`127.0.0.1`, `localhost`, `::1`). Blocks internet egress. |
| **No Arbitrary Execution** | Tool Gateway, `EngineeringToolDispatcher` | No shell, file-write, `eval`, or unrestricted mutation tools are exposed to the model. |
| **Fail-Closed Preflight** | `PlanPreflight`, `PlanValidator` | Unknown block definitions, nonexistent ports, stale revisions, or unbridged cross-domain connections fail before transaction creation. |
| **Atomic Transactions & Undo** | `TransactionManager`, `EngineeringModelAdapter` | Captures before-state snapshots and state hashes. Rolls back on any fault. Revision increments only on commit. UI supports complete transaction undo. |
| **Separation of Validation & Simulation** | `ModelValidator`, `SimulationTools` | Model validity (topology, parameters) is evaluated and reported distinctly from dynamic solver simulation. Unsupported simulation domains (e.g. SysML) report capability limits explicitly. |
| **Bounded Repair** | `RepairLoop`, `DiagnosticClassifier` | Classifies diagnostics into repairable vs unrepairable. Maximum 3 attempts with re-validation. Halts with full diagnostic trail if errors persist. |

---

3. **Benchmark: Three-Phase Inverter Vertical Slice**

The benchmark (`src/services/ai/benchmarks/threePhaseInverterScenario.ts`) exercises the entire workflow lifecycle:

1. **Request & Intent Matching:** "Create a three-phase inverter model" triggers template-driven requirement analysis (`ThreePhaseInverterTemplate`), extracting DC bus voltage, frequency, and modulation parameters.
2. **Catalog Resolution:** Candidate blocks (`DC_VOLTAGE_SOURCE`, `VOLTAGE_REFERENCE_GENERATOR`, `THREE_PHASE_PWM`, `THREE_PHASE_INVERTER`, `THREE_PHASE_LOAD`) resolve directly from canonical libraries with real input/output ports (`v_pos`, `v_neg`, `va`, `vb`, `vc`, `va_ref`, `vb_ref`, `vc_ref`, `ga`, `gb`, `gc`, `vdc_p`, `vdc_n`).
3. **Hallucination Rejection:** Synthetic/unknown block definitions (`FANTASY_QUANTUM_INVERTER_9000`) and fake ports are rejected fail-closed during preflight without mutating the workspace.
4. **Atomic Build:** Executed through `TransactionManager` with `EngineeringModelAdapter`, logging `PREPARED`, `EXECUTED`, and `COMMITTED` journal records and incrementing project revision.
5. **Post-Build Validation:** `ModelValidator` evaluates schema, topology (no floating critical DC rails or gates, complete return path), and positive parameter values (`Ron > 0`).
6. **Bounded Repair:** Intentional negative resistance is detected and deterministically repaired within the 3-attempt bound.
7. **Simulation Gating:** Dynamic simulation runs via `SimulationTools.simulateModel`, returning real `engineRunId` with honest measured metrics (zero fabricated traces).
8. **Live Application Adapter Realization:** Verified against `LiveXbridgesModelAdapter` connected to a live application delegate; verifies creation of exact 5 ReactFlow nodes and 11 edges.
9. **Transaction Undo:** Calls `tm.undoTransaction()` to restore the initial empty state and verifies zero residual blocks.

### Benchmark Metrics

| Metric | Target | Result | Status |
|---|---|---|---|
| **Registry Resolution Rate** | 100% | 100% (5/5 canonical inverter blocks resolved) | PASS |
| **Invalid Plan Rejection Rate** | 100% | 100% (Hallucinated IDs and invalid ports blocked before mutation) | PASS |
| **Validation Correctness** | 100% | 100% (Zero false successes on broken topology) | PASS |
| **Repair Attempt Bounding** | <= 3 | 1 attempt taken; bounded loop | PASS |
| **Truthful Reporting** | 100% | Genuine `engineRunId` returned; zero fabricated data | PASS |
| **Live Adapter Realization** | 100% | 5 nodes and 11 edges realized in live ReactFlow state | PASS |
| **Transaction Undo** | 100% | Clean rollback to pre-transaction snapshot; 0 residual blocks | PASS |

---

## 4. Verification Suite

The implementation is verified through unit, integration, and security test suites:

```powershell
# 1. Benchmark & Contract Tests
npx vitest run src/services/ai/benchmarks/threePhaseInverterScenario.test.ts src/services/ai/benchmarks/inverterBenchmark.test.ts

# 2. Agent, Services, & Validation Suite
npx vitest run src/agent src/services/ai src/services/localLlmService.test.ts src/components/agent

# 3. Static Security Analysis (SAST)
npm run scan:sast

# 4. Production TypeScript Build
npm run build
```
