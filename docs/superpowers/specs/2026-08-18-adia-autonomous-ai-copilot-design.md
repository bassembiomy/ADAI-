# ADIA Autonomous Engineering AI Copilot - System Design Document

**Date**: 2026-08-18  
**Status**: Approved by User  
**Scope**: Full ADIA AI Assistant Enhancement (Local LLM / Free Tier + DuckDuckGo Free Search + 100% Module Action Dispatcher + X-Bridges Topology Synthesis)

---

## 1. Executive Summary & Goals
The goal of this enhancement is to elevate the AI Assistant inside ADIA from a basic chat interface into a fully autonomous, zero-cost **Universal Engineering Copilot**. The copilot will:
1. Understand natural language requests from users (e.g., *"Build me a 220V 50Hz SPWM Inverter with LC filter and scope"* or *"Create a thermal regulation SysML subsystem with state machine"*).
2. Autonomously fetch domain schematics, component values, and formulas via free internet search (DuckDuckGo scraping / free endpoints) without requiring paid API keys or subscriptions.
3. Support local LLMs (Ollama / LM Studio with models like DeepSeek-R1, Qwen 2.5 Coder, Llama 3.3) and free cloud tiers (Google Gemini 2.0 Flash Free Tier).
4. Control and automate **100% of ADIA's modules** via a unified, schema-validated tool-dispatching engine:
   - **X-Bridges**: Full block diagram creation, auto-wiring, parameter tuning, ODE simulation control, Scope & Root Locus inspection.
   - **SysML**: BDD & IBD creation, port & item flow routing, integrity verification.
   - **Stateflow**: State machines, hierarchical substates, variables, transitions, actions, entropy & reachability verification.
   - **DOE (Design of Experiments)**: Factor setup, RSM, GMDH neural networks, Taguchi orthogonal arrays, optimization.
   - **3D Digital Twin & V-Lab**: Asset binding, kinematics, sensor/actuator signal mapping.
   - **HIL & Hardware Integration**: Pin mapping, serial/Modbus streaming, Factory I/O gateway.
   - **Code Generation & Export**: C code, Arduino firmware build, Simulink .m / .slx, PDF engineering reports.

---

## 2. System Architecture

```
+-------------------------------------------------------------------------+
|                         ADIA User Interface                             |
|  +-------------------------------------------------------------------+  |
|  |                 AI Architect Sidebar / Copilot Chat               |  |
|  +-------------------------------------------------------------------+  |
+------------------------------------+------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                         AI Core Services Layer                          |
|  +-------------------------------------------------------------------+  |
|  |  aiService.ts (Local Ollama / LM Studio / Gemini / OpenRouter)    |  |
|  +---------------------------------+---------------------------------+  |
|                                    |                                    |
|             +----------------------+----------------------+             |
|             v                                             v             |
|  +----------------------+                     +----------------------+  |
|  | DuckDuckGo Free      |                     | Domain Engineering   |  |
|  | Web Search Service   |                     | Knowledge Injection  |  |
|  | (Electron IPC)       |                     | (Prompts & Topologies)| |
|  +----------------------+                     +----------------------+  |
+------------------------------------+------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                  Universal Action Dispatcher Layer                      |
|                  (src/utils/aiActionProcessor.ts)                       |
+------------------------------------+------------------------------------+
       |              |              |              |              |
       v              v              v              v              v
+-------------+ +-------------+ +-------------+ +-------------+ +-------------+
|  X-Bridges  | |    SysML    | |  Stateflow  | |     DOE     | | 3D / HIL /  |
|  Workspace  | |  Integrity  | |    Engine   | |  Analytics  | |  Code Gen   |
+-------------+ +-------------+ +-------------+ +-------------+ +-------------+
```

---

## 3. Detailed Component Specifications

### 3.1. Zero-Cost Free Web Search Service (`webSearchService.ts` & Electron IPC)
- **Mechanism**: Invokes DuckDuckGo HTML / Instant Answer free endpoints via Electron `ipcRenderer.invoke('search-duckduckgo', { query })`.
- **Zero Cost**: No external billing, API keys, or accounts required.
- **Workflow**:
  1. AI recognizes if it requires external specs (e.g. topology of a 3-phase inverter, resonant frequency equations).
  2. Electron performs the request, extracts clean text snippets / markdown, and injects it into the prompt context.
  3. AI synthesizes the structured response and actions.

### 3.2. Universal Action Schema & Tool Definitions
The AI outputs a structured JSON response containing:
```json
{
  "thought": "Analysis of the requested system and chosen topology...",
  "message": "User-facing summary of created components and steps taken.",
  "actions": [
    {
      "type": "XB_CREATE_BLOCK",
      "blockType": "WaveformGen",
      "id": "ref_sine",
      "name": "Reference Sine (50Hz)",
      "position": { "x": 100, "y": 200 },
      "params": { "type": "Sine", "freq": 50, "amp": 1 }
    },
    {
      "type": "XB_CONNECT_BLOCKS",
      "sourceId": "ref_sine",
      "sourcePort": "out",
      "targetId": "pwm_comparator",
      "targetPort": "in_ref"
    },
    {
      "type": "SYSML_CREATE_BLOCK",
      "name": "InverterSubsystem",
      "ports": ["DC_In", "AC_Out", "PWM_Control"]
    },
    {
      "type": "STATEFLOW_CREATE_STATE",
      "name": "OperatingState",
      "entry": "pwm_enable = 1;",
      "during": "regulate_voltage();"
    },
    {
      "type": "DOE_RUN_OPTIMIZATION",
      "modelType": "RSM"
    },
    {
      "type": "XB_RUN_SIMULATION"
    }
  ]
}
```

### 3.3. X-Bridges Topology Synthesis Engine
- **Inverter Synthesis Pattern**:
  1. **Modulation Stage**: `WaveformGen` (Sine $50\text{Hz}$) + `CarrierGen` (Triangle $10\text{kHz}$) into a comparator or SPWM generator block.
  2. **Power Switching Stage**: `H-Bridge / Switching Converter` receiving PWM gate signals + DC Voltage Source ($V_{dc} = 311\text{V}$ for $220\text{V}_{rms}$).
  3. **Harmonic Filter Stage**: Second-order $LC$ Low-Pass Filter (`Series Inductor` $L$ + `Parallel Capacitor` $C$) with tuned cutoff frequency $f_c \approx 1\text{kHz}$.
  4. **Load & Monitoring**: Load Resistor $R_{load}$ connected to `Scope` block.
- **Smart Auto-Layout Engine**: Automatically calculates progressive $(X, Y)$ grid coordinates for clean, non-overlapping block arrangements.

### 3.4. Module Coverage Matrix
| Module | Supported Actions |
|---|---|
| **X-Bridges** | `XB_CREATE_BLOCK`, `XB_CONNECT_BLOCKS`, `XB_SET_PARAM`, `XB_DELETE_BLOCK`, `XB_RUN_SIMULATION`, `XB_PAUSE_SIMULATION`, `XB_ATTACH_SCOPE`, `XB_OPEN_ROOT_LOCUS` |
| **SysML** | `SYSML_CREATE_BLOCK`, `SYSML_ADD_PORT`, `SYSML_CONNECT_PORTS`, `SYSML_CREATE_IBD`, `SYSML_VALIDATE_INTEGRITY` |
| **Stateflow** | `STATE_CREATE`, `STATE_CONNECT_TRANSITION`, `VARIABLE_CREATE`, `JUNCTION_CREATE`, `RUN_ENTROPY_ANALYSIS` |
| **DOE** | `DOE_CONFIGURE_FACTORS`, `DOE_RUN_RSM`, `DOE_RUN_GMDH`, `DOE_RUN_TAGUCHI`, `DOE_EXPORT_TO_XB` |
| **3D & V-Lab** | `VLAB_LOAD_ASSET`, `VLAB_BIND_ACTUATOR`, `VLAB_TRIGGER_PHYSICS` |
| **HIL & Code Gen**| `GENERATE_C_CODE`, `BUILD_ARDUINO`, `EXPORT_SIMULINK_SLX`, `SYNC_HIL_PINS` |
| **Reports** | `GENERATE_ENGINEERING_REPORT` (PDF / Markdown summary with equations and charts) |

---

## 5. Testing & Verification Strategy
- **Unit Tests**: Test the action parser `aiActionProcessor.test.ts` for all action types and topology generators.
- **Integration Tests**: Verify that dispatched actions properly mutate the state of X-Bridges (ReactFlow nodes/edges), Stateflow (states/transitions/variables), SysML, and DOE.
- **IPC Tests**: Verify DuckDuckGo free search endpoint in Electron main process.
- **E2E Simulation Verification**: Verify that generated Inverter circuit simulates with stable AC waveform output on the Scope.
