# Comprehensive ADIA Tool Help, Module Capabilities, and Illustrated Block Explorer Design

**Date**: 2026-09-01  
**Status**: Proposed / Under Review  
**Topic**: Comprehensive In-Tool Help Documentation, Interactive Step-by-Step UI Button Guides with Illustrations, and Complete Multi-Domain Block Catalog for ADIA

---

## 1. Overview & Objectives

The goal of this feature is to deliver an exhaustive, user-friendly, and beautifully illustrated in-tool Help and Reference system for the ADIA Model-Based Design (MBD) engineering suite.

The system will provide:
1. **Module-by-Module Comprehensive Guides**: Step-by-step walkthroughs for every module in ADIA, explicitly naming every button to press, toolbar action, sidebar control, keyboard shortcut, and workflow phase, accompanied by visual ASCII/diagram flowcharts and component illustrations.
2. **Dedicated Hardware-in-the-Loop (HIL) Suite Guide**: Detailed step-by-step instructions on setting up MCU targets (STM32, Arduino, ESP32, Generic), configuring driver channels (GPIO, ADC, DAC, PWM), using the Signal Mapper to bind variables with scaling math formulas, streaming live telemetry and oscilloscope charts, executing real-time Fault Injection, and generating & flashing deterministic C99 embedded firmware.
3. **Illustrated Multi-Domain Component & Block Explorer**: Complete documentation of 100% of physical plant blocks (`VLAB_LIBRARY`) and signal-flow control blocks (`XBRIDGES_LIBRARY`) with domain filtering, visual terminal pinouts, mathematical equations, configurable parameter sheets, and usage examples.

---

## 2. Architecture & Modules Detailed Breakdown

### 2.1 System Architecture (SysML & OPM)
* **BDD (Block Definition Diagrams)**:
  * **Buttons & Controls**: `+ Add Block`, Stereotype dropdown (`Block`, `Interface`, `Interface Block`, `ValueType`, `Enumeration`), `Add Port` (Kind: `Std`, `Flow`, `Proxy`; Direction: `In`, `Out`, `I/O`; Unit), Value Properties input, Operations input, Constraints input, Satisfied Requirements selector.
  * **Connectors**: Association, Generalization, Composition, Aggregation, Allocation with source/target multiplicities.
  * **Visual Illustration**: Diagram hierarchy showing block composition, port anchors, and inheritance links.
* **IBD (Internal Block Diagrams)**:
  * **Buttons & Controls**: Double-click BDD block to enter internal layer, `Add Part`, `Select Block Definition`, `Connect Ports` (wiring drag-and-drop), `Set Item Flow` (e.g., `PWM_Signal`).
* **Requirements Diagrams & RTM (Requirements Traceability Matrix)**:
  * **Buttons & Controls**: `Add Requirement`, `Requirement ID`, `Text` (enforcing the INCOSE/IEEE 29148 binding **shall** rule), `Verify Method` (`Test`, `Analysis`, `Inspection`, `Demonstration`).
  * **Traceability Links**: `Satisfy` (to BDD/IBD block), `Verify` (to test/HIL case), `Derive`, `Refine`, `Trace`.
  * **RTM Grid**: Click `RTM` in dashboard to view real-time coverage matrix.
* **OPM (Object-Process Methodology / ISO 19450)**:
  * **Buttons & Controls**: `Add Object`, `Add Process`, `Add State`, `Generate OPL Text`.

### 2.2 Stateflow / Hierarchical State Machines
* **States & Hierarchies**:
  * **Buttons & Controls**: `Add State`, `Name`, `Entry Action` (`entry: ...`), `During Action` (`during: ...`), `Exit Action` (`exit: ...`), `Set Autostart` toggle (initial state marker), `Is Safe State` toggle, `Is X-Bridges State` toggle (sub-diagram co-simulation).
  * **Decomposition**: `OR` (exclusive single-active state) vs `AND` (parallel orthogonal regions).
* **Transitions & Routing**:
  * **Buttons & Controls**: Drag transition arrow between states, click label to edit: `Trigger [Condition] / Action`, set Priority number (1..N), add Connective Junction, add Shallow History ($H$) or Deep History ($H^*$) junction.
* **Execution & Simulation**:
  * **Buttons & Controls**: `Start Simulation` (Play icon in top bar), `Pause`, `Step` (single tick), `Reset`, `Tick Rate Slider` (1ms to 1000ms), `Live State Inspection` (glowing active state border).
* **MCU Scheduler Order**:
  * Step loop order: `SM_ReadInputs()` $\to$ `SM_Step()` $\to$ `SM_WriteOutputs()`.

### 2.3 V-Lab Physical Plant Modeling (Acausal DAE)
* **Physics Principles**:
  * Across variables (potentials equal at junctions: Voltage, Velocity, Temperature, Pressure) vs. Through variables (flows sum to zero: Current, Force, Torque, Heat Flow, Mass Flow).
* **Solvers & Math Engine**:
  * Modified Nodal Analysis (MNA), BDF-1 (Backward Euler) & BDF-2 implicit integration, Newton-Raphson non-linear solver with line-search damping, Local Truncation Error (LTE) adaptive time-stepping, Zero-Crossing detection with step rewind.
* **Buttons & Controls**:
  * `V-Lab Canvas Toolbar`: `Add Component` from library panel, drag connection wires between matching domain ports, `Add Ground/Reference` (mandatory for each circuit), `Configure Parameters` (sidebar double-click), `Open Scope` (Simulink-style multi-channel scope), `Start Physical Simulation`.

### 2.4 X-Bridges Signal-Flow & Control Engineering (Causal)
* **Execution Principles**:
  * Directed causal block diagram execution, Kahn's topological sort execution list, algebraic loop breaking with Unit Delays / Integrators, continuous RK4/Euler and discrete multi-rate updating.
* **Advanced Control Blocks**:
  * Fast Gradient Method (FGM) Model Predictive Control (MPC), Space Vector PWM (SVPWM), Field-Oriented Control (FOC Clarke/Park), MTPA & Field Weakening, LMS Adaptive Filter, Online Neural Neuron, Q-Learning RL.
* **Buttons & Controls**:
  * `Add Block` from X-Bridges palette, connect output pins to input pins, `Set Block Parameters`, `Run Continuous Solver`, `Tune PID Gains` in real time.

### 2.5 Hardware-in-the-Loop (HIL) Real-Time Suite
* **Target MCU Platforms**:
  * STM32F4/F1 (ARM Cortex-M), Arduino Uno/Mega (AVR), ESP32 (Tensilica Xtensa), Generic ANSI C SDK.
* **Driver Channels Configuration**:
  * `Add Channel` button: Set `Peripheral Type` (`GPIO`, `ADC`, `DAC`, `PWM`), `Pin ID` (e.g. `A0`, `PA5`, `D13`, `GPIO25`), `Direction` (`In` / `Out`), `Data Type` (`bool`, `uint16_t`, `float`).
* **Signal Mapper Workspace**:
  * Connect driver channel to state machine variable with direction (`Hardware -> SM` for reads, `SM -> Hardware` for writes).
  * Inline Scaling Math Formula editor: enter expressions like `x * (3.3 / 4095.0) * 100.0` or `(x - 512) * 0.1`.
* **HIL Live Dashboard & Telemetry**:
  * `COM Port Dropdown`, `Baud Rate Selector` (`115200`), `Connect / Disconnect` button.
  * Live Rolling Oscilloscope waveform display and digital gauges.
* **Real-time Fault Injection Engine**:
  * `Override Value` slider/input (force manual signal value).
  * `Add Noise` (Gaussian/uniform jitter injection).
  * `Signal Clamping` (simulate sensor saturation).
* **Embedded C99 Code Generation & Deployment**:
  * `Generate HIL Code` button: downloads ZIP containing `hal_config.h`, `hal_drivers.c`, `hil_interface.c`, `main_hil.c`.
  * Step-by-step firmware build & flash instructions for STM32CubeIDE, Arduino IDE, PlatformIO, and ESP-IDF.

### 2.6 Design of Experiments (DOE) & AI Model Discovery
* **Sampling & Sensitivity**:
  * Full Factorial, Latin Hypercube Sampling (LHS), Taguchi Orthogonal Arrays.
* **GMDH Polynomial Networks**:
  * Self-organizing quadratic polynomial network identification: $y = a + bx_1 + cx_2 + dx_1^2 + ex_2^2 + fx_1x_2$.
* **Buttons & Controls**:
  * `Select Parameters for DOE`, `Choose Sampling Method`, `Run DOE Batch`, `Train GMDH Model`, `Export Surrogate Function`.

### 2.7 Industrial 3D Gateway & Factory I/O
* **Co-Simulation**:
  * Real-time TCP/UDP bridge streaming sensor and actuator states between ADIA state machines and virtual industrial factory environments.
* **Buttons & Controls**:
  * `Open Industrial Gateway`, `Set IP & Port`, `Auto-Discover Tag Mappings`, `Connect to Factory I/O`, `Live Synchronization`.

### 2.8 Verification, Traceability & Code Generation Gatekeeper
* **Deterministic C99 Code Generator**:
  * Structural checks, semantic checks, IR validation.
  * Explicit scheduler contract: `SM_ReadInputs()` $\to$ `SM_Step()` $\to$ `SM_WriteOutputs()`.
* **Verification Evidence Labels**:
  * `Structural PASS`, `Semantic PASS`, `Host Compilation PASS`, `Embedded Compilation NOT RUN / PASS`, `Target Hardware PENDING`.
* **Buttons & Controls**:
  * `Generate Embedded C99`, `Run Model Verification Report`, `Export Verification Summary (PDF/HTML)`.

### 2.9 Digital Twin Learning Labs
* **Demonstrators**:
  1. 9-Block Differential Drive LiDAR Robot Vacuum Twin with continuous 3DoF kinematics, 8-beam LiDAR raycasting, collision boundary physics, odometry drift, sensor fusion filter, and occupancy grid SLAM.
  2. Air Fryer Multiphysics Model (thermal convection, heater element, fan blower, PID controller).
  3. VFD Three-Phase Induction Motor Drive with Field-Oriented Control.
  4. Washing Machine Drum Dynamics & Fluid Sloshing.
  5. Microwave Inverter Magnetron & Heating Cavity.
  6. High-Speed Food Blender with non-linear fluid drag.

---

## 3. Illustrated Block Reference Explorer UI

The Help Modal in `src/App.tsx` will feature:
1. **Interactive Domain Filter Tabs**:
   - `All Domains`, `Electrical`, `Mechanical Rotational`, `Mechanical Translational`, `Thermal`, `Magnetic`, `Gas & Moist Air`, `Control & Modulation`, `Math & Signal Routing`, `Power & Drives`, `AI & Learning`.
2. **Engine Toggle**:
   - Filter by `All`, `V-Lab (Acausal Physical)`, `X-Bridges (Causal Signal Flow)`.
3. **Visual Component Terminal Schematics**:
   - Dynamic SVG rendering of block symbol with color-coded domain pins, pin positions (Left, Right, Top, Bottom), and variable type indicators (`Across`, `Through`, `Signal In`, `Signal Out`).
4. **Mathematical Formulation**:
   - Full mathematical differential/algebraic equations and transfer functions.
5. **Parameter Sheet**:
   - Table of parameters with symbol, default value, engineering units, and physical description.
6. **"How to Use & Button Steps" Guide for Each Block**:
   - Exact instructions on how to instantiate the block, connect its terminals, configure its parameters, and link it to scopes or state machines.

---

## 4. Verification & Testing Plan

1. **Build Verification**: Run `npm run build` or typecheck to ensure all TypeScript types, exports, and React components compile cleanly with zero errors.
2. **Help Modal Functional Testing**:
   - Open Help Modal across all topics: Architecture, Stateflow, V-Lab, X-Bridges, HIL, DOE, Industrial Automation, Code Gen, Learning Labs.
   - Test search query filtering across documentation topics and all 250+ blocks.
   - Test domain category filtering and component pinout rendering.
   - Verify every topic contains clear "How to Use", button action steps, and diagrams.
3. **Automated Test Suite**:
   - Run existing unit test suites (`npm test`) to ensure no regressions across physics engines, state machine code generators, or HIL validation contracts.
