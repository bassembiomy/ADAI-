# ADIA Engineering Agent: User and Operator Guide

The **ADIA Engineering Agent** is an offline-first, prompt-driven engineering assistant integrated directly into the ADIA Engineering Suite. It clarifies design requirements, drafts formal engineering specifications, validates designs against the existing ADIA block catalog, and orchestrates real engineering tool adapters—all governed by strict, interactive user approval gates and immutable audit trails.

---

## 1. Core Principles & Safety Architecture

1. **Strict Offline & Loopback Operation:**
   - Designed for offline operation using a local CPU-capable 7B–8B 4-bit quantized LLM (Ollama or llama.cpp) over local loopback (`http://127.0.0.1:11434`).
   - Rejects non-loopback URLs in offline mode.
   - No external internet access, telemetry, or third-party cloud APIs are required or used.

2. **Existing ADIA Catalog Blocks Only:**
   - The agent strictly constructs proposals from existing, validated ADIA blocks (`AdiaBlockCatalog.isExistingBlockId`).
   - It **never** creates or invents new ADIA block definitions. If a component is absent from the live catalog, the proposal is stopped and reports a blocked state detailing the missing capability.

3. **Truthful Engineering Evidence & Real Adapters:**
   - Never reports simulation, model generation, compilation, or test success unless a real tool adapter produced actual evidence.
   - Simulation adapters fail explicitly if no real simulator runner (e.g. V-Lab engine, Simulink) is configured; they **never** return fake or hard-coded temperatures, rise times, or overshoots.
   - Actions execute sequentially: each action must succeed with verifiable evidence before the next change approval token is created.

4. **Multi-Stage User Approval Gates:**
   - **Specification Gate:** Formal specification must be approved by the engineer before an execution plan can be generated.
   - **Plan Gate:** The ordered execution plan must be reviewed and approved before any tool actions are prepared.
   - **Per-Change Action Gate:** Every model alteration or tool execution requires an explicit, one-time approval token.
   - **Token Invalidation:** Approval tokens cannot cross application restart boundaries, cannot be reused, and are invalidated if parameters or project contexts change.

5. **Deterministic Validation & Immutable Audit:**
   - LLMs are used only for intent extraction and conversational clarification.
   - Schema validation, port compatibility, parameter boundaries, and state transitions are strictly deterministic TypeScript algorithms.
   - Interrupted executions are marked `requires_review` and are never resumed automatically.
   - All actions, approvals, adapter invocations, and artifact hashes are captured in an immutable, append-only audit trail.

---

## 2. Local LLM Runtime Setup & Model Selection

### Prerequisites
- 8–16 GB system RAM.
- Local inference server: **Ollama** (recommended) or compatible OpenAI-compatible loopback endpoint.

### Running with Ollama
```bash
# 1. Start Ollama on loopback
ollama serve

# 2. Pull a recommended 7B or 8B 4-bit quantized model
ollama pull llama3:8b
# or
ollama pull qwen2.5:7b
```

### Model Discovery and UI Selection
- In the ADIA Agent panel header, click the **Model** selector dropdown.
- The agent queries `GET /api/tags` on `http://127.0.0.1:11434` and lists all detected local models.
- When no model has been selected, the agent displays a warning badge: `Select Ollama Model`.
- Click **"Test Ollama"** to run a live ping against the loopback server.
- The connection status badge updates dynamically:
  - `Ollama connected`: Local server reachable and active model validated.
  - `Ollama unavailable`: Server is down or unreachable.
  - `Deterministic inspection-only mode`: Fallback mode active.

### Deterministic Fallback Mode
When Ollama is unavailable or unconfigured, the agent enters **Deterministic inspection-only mode**:
- It permits deterministic project inspection, catalog browsing, and rule-based requirement extraction.
- **Safety guarantee:** Fallback mode will **never** fabricate engineering results, mock simulation curves, or generate synthetic model definitions.

---

## 3. Real Tool Adapters & Execution Boundary

The central `ToolGateway` dispatches approved actions strictly to registered `ToolAdapter` instances:

| Adapter | Responsibility & Execution Boundary |
|---|---|
| **ADIA Project Adapter** (`adiaProjectAdapter`) | Reads and updates real project persistence, diagram workspace states, and block counts. |
| **X-BRIDGES Adapter** (`xbridgesAdapter`) | Dispatches verified topology mutations through the X-BRIDGES workspace and worker command boundary using existing catalog blocks. |
| **V-Lab Adapter** (`vlabAdapter`) | Dispatches thermal and fluid simulation queries through the V-Lab worker gateway. Fails cleanly if simulation backend is unconfigured. |
| **SysML Adapter** (`sysmlAdapter`) | Interacts with SysML BDD/IBD model structures through existing model command gateways. |
| **Local Process Adapter** (`localProcessAdapter`) | Executes external validation tools using an explicit executable allowlist, argument arrays (no shell interpolation), execution timeouts, and captured stdout/stderr evidence. |

---

## 4. Supported Engineering Workflows & General Intents

The General X-Bridges Agent supports 6 core intent modes across all catalog domains:
- **`create`**: Interactive requirements clarification, deterministic graph planning, isolated plan proof (`proveXbridgesPlan`), and atomic per-action approvals.
- **`inspect`**: Non-destructive topological and parameter inspection without workspace mutations.
- **`modify`**: Targeted parameter adjustments, block replacements, or wiring updates.
- **`diagnose`**: Topological and engineering constraint analysis (detects floating rails, missing grounds, invalid parameters).
- **`repair`**: Automated, bounded repair (up to 3 iterations) restoring valid topology with complete diagnostic trail.
- **`optimize`**: Deterministic grid/gradient parameter tuning driven by honest simulation evidence without fabricating metrics.

### Air-Fryer Thermal Control System
- **Prompt:** *"I want to design an air fryer heating and temperature control system."*
- **Clarification Turn:**
  1. Target cooking temperature (e.g., `200°C`)
  2. Heating power rating (e.g., `1800W`)
  3. Electrical supply (e.g., `230V AC`)
  4. Temperature sensor type (e.g., `NTC 100k`)
  5. Control strategy (e.g., `PID` or `Bang-Bang`)
  6. Maximum safety temperature (e.g., `240°C`)
  7. Success criteria (e.g., `Rise time < 4 min, steady-state error < 2°C`)
- **Outcome:** Generates a formal specification, maps requirements to validated catalog components, and schedules verified simulation/test steps.

### X-BRIDGES BLDC Motor Drive & Power Electronics
- **Prompt:** *"Create an X-BRIDGES model for a BLDC motor with three-phase inverter."*
- **Catalog Verification:** Verifies all requested blocks against the live catalog (`DC_VOLTAGE_SOURCE`, `THREE_PHASE_INVERTER`, `THREE_PHASE_LOAD`, `THREE_PHASE_PWM`).
- **Isolated Plan Proof Card:** Displays isolated background worker run status, compilation state, and genuine `engineRunId` before prompting for plan approval.
- **Atomic Transaction & Per-Action Approvals:** Each mutation step displays a change approval card inside a single atomic transaction. Rejection or mid-plan faults restore the exact initial snapshot.

---

## 5. UI Navigation & Project Context

- **Floating Toggle:** Click the **"ADIA Agent"** tab on the right side of the main workspace to toggle the panel.
- **Live Context Bar:** Header displays the active project name, active workspace (`vlab`, `xbridges`, `sysml`), block count, node count, connection count, and diagram state.
- **Isolated Plan Proof Card (`.adia-plan-proof-card`):**
  - Appears during plan review before approvals.
  - Highlights isolated engine run ID, catalog hash, compilation proof status, and verified simulation observables.
- **Transaction Status Card (`.adia-transaction-card`):**
  - Displays transaction progress, phase, and observed deltas between pre-mutation snapshot and current workspace.
- **Action Approval Cards:**
  - Displays the action kind (`instantiate_block`, `connect_ports`, `configure_parameters`, `run_simulation`, etc.).
  - Shows exact parameters and affected project artifacts.
  - Buttons: **Approve Action** and **Reject**.
  - Automatically disabled if proposal is stale, blocked, references non-catalog blocks, or lacks a real adapter.
- **Tabs:**
  - **Workflow:** Conversational prompt, clarification Q&A, proof cards, and interactive approval gates.
  - **Specification:** Formal parameters, safety constraints, and acceptance criteria.
  - **ADIA Blocks:** Real-time catalog browser showing verified blocks and port definitions.
  - **Audit Trail:** Immutable, cryptographically hashed event stream.

---

## 6. Troubleshooting & Recovery

| Diagnostic | Root Cause | Safety Action & Resolution |
|---|---|---|
| `Ollama unavailable` | Ollama service not running or port 11434 blocked | Start Ollama (`ollama serve`). Agent safely switches to deterministic inspection-only mode. |
| `requires_review` on restart | Session was restored after an unexpected shutdown during tool execution | Interrupted executions are never resumed automatically. Inspect the Audit Trail tab, review current model state, and re-issue the command. |
| `Approval token expired / invalidated` | Application restarted or action parameters modified while an approval was pending | Safety policy invalidates tokens across sessions. Re-approve the action in the active session. |
| `Block ID '<name>' not found in catalog` | Proposed topology requested a component absent from the ADIA block registry | The agent halts and blocks. Check the ADIA Blocks tab for available catalog components. |
| `Simulation adapter error: No real simulator configured` | Attempted simulation without a connected V-Lab/Simulink engine | The agent refuses to fabricate mock results. Connect a live solver backend or inspect static model constraints. |
| `Rollback triggered: Transaction aborted` | User clicked Reject on an action or an adapter operation failed | The atomic transaction manager restores exact pre-mutation node/edge snapshots. No partial state persists. |
