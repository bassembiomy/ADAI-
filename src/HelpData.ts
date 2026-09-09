export const adia_architecture_diagram = new URL('./assets/adia_architecture_diagram_1778580699379.png', import.meta.url).href;
export const adia_vlab_simulation = new URL('./assets/adia_vlab_simulation_1778580716413.png', import.meta.url).href;
export const adia_doe_analysis = new URL('./assets/adia_doe_analysis_1778580732166.png', import.meta.url).href;
export const air_fryer_sysml = new URL('./assets/air_fryer_sysml_diagram_1778581647915.png', import.meta.url).href;
export const state_machine_guide_diagram = new URL('./assets/state_machine_guide_diagram.png', import.meta.url).href;
export const state_machine_simulation_diagram = new URL('./assets/state_machine_simulation_diagram.png', import.meta.url).href;
export const hil_architecture_diagram = new URL('./assets/hil_architecture_diagram.png', import.meta.url).href;
export const entropy_opm_architecture_diagram = new URL('./assets/entropy_opm_architecture_diagram.svg', import.meta.url).href;

export const HELP_DATA: Record<string, {
  title: string;
  category: string;
  description: string;
  content: string;
  image?: string;
  sections?: { title: string; body: string; code?: string; list?: string[] }[];
  related?: string[];
}> = {
  "software-architecture": {
    title: "Software Architecture Explorer",
    category: "System",
    description: "Explore ADIA's layered architecture, shared data types, execution paths, and safeguards that protect engineering work.",
    content: "The interactive explorer maps the read-only flow from editing through validation, persistence, execution, deployment, and telemetry feedback.",
    sections: [
      { title: "Explore the architecture", body: "Select **Open Architecture Explorer** to inspect layers, component responsibilities, source locations, data types, and protection mechanisms." },
      { title: "Protection model", body: "The map highlights validation, integrity, bounded work, recoverable errors, verification gates, and deny-by-default HIL policies." }
    ]
  },
  "getting-started": {
    title: "Getting Started with ADIA",
    category: "Fundamentals",
    description: "Master the complete ADIA Model-Based Design (MBD) engineering suite, from system architecture and state machines to physical plant modeling, signal-flow control, and Hardware-in-the-Loop (HIL) deployment.",
    content: "ADIA is an integrated, next-generation Model-Based Design (MBD) environment for multi-disciplinary systems engineering. It bridges structural SysML architecture, hierarchical Stateflow behavior, causal signal-flow controls (X-Bridges), multi-domain acausal physical plant dynamics (V-Lab), and real-time Hardware-in-the-Loop (HIL) testing into a single unified canvas.",
    sections: [
      {
        title: "The Unified ADIA Engineering Workflow",
        body: "ADIA structures systems engineering into a continuous 6-phase V-model development lifecycle:\n\n```\n  [ 1. ARCHITECTURE (SysML) ]  ---------------------->  [ 6. HIL & VERIFICATION ]\n     BDD / IBD / Requirements                               Hardware Validation / C99\n           │                                                           ▲\n           ▼                                                           │\n  [ 2. BEHAVIOR (Stateflow) ]  ───►  [ 3. CONTROLS (X-Bridges) ]  ───►  [ 4. PLANT (V-Lab) ]\n     Hierarchical State Logic          Feedback Loops & MPC               Acausal DAE Physics\n```\n\n1. **Architect**: Capture system requirements, decompose system blocks (BDD), and route internal parts and flows (IBD).\n2. **Design Logic**: Construct hierarchical reactive logic, discrete states, guards, and temporal timers in Stateflow.\n3. **Model the Plant**: Assemble multi-domain acausal physical networks (electrical, mechanical, thermal, fluid) in V-Lab.\n4. **Design Control Loops**: Implement feedback controllers (PID, FOC, MPC) and signal filters in X-Bridges.\n5. **Analyze & Optimize**: Run Design of Experiments (DOE) and GMDH polynomial neural network discovery.\n6. **Validate on Hardware (HIL)**: Map variables to MCU pins, stream live telemetry, inject faults, and deploy deterministic C99 firmware."
      },
      {
        title: "Top Navigation Bar & Module Switcher",
        body: "The top navigation bar allows you to switch between engineering workspaces with a single click. Every module maintains persistent bidirectional synchronization with the shared variable table:",
        list: [
          "**Architecture**: Opens SysML diagrams (BDD, IBD, Requirements, and OPM).",
          "**Stateflow**: Opens the hierarchical State Machine designer, visual simulator, and transition editor.",
          "**V-Lab**: Opens the acausal physical plant modeling canvas, solver settings, and multi-channel scopes.",
          "**X-Bridges**: Opens the causal block-diagram signal-flow simulator and control system workspace.",
          "**HIL**: Opens the Hardware-in-the-Loop configuration, Signal Mapper, live oscilloscope telemetry, and fault injector.",
          "**DOE**: Opens Design of Experiments sampling tools and AI model discovery engines.",
          "**Reports**: Opens automated verification reporting, traceability matrices (RTM), and C99 code generators.",
          "**Help (Docs)**: Click the **Help** button (book icon) or press `F1` at any time to open this comprehensive guide and block reference."
        ]
      },
      {
        title: "Global Keyboard Shortcuts & Productivity Controls",
        body: "Speed up your workflow using these primary hotkeys and editor actions:",
        list: [
          "**Space + Drag / Middle Mouse**: Pan the canvas smoothly in any direction.",
          "**Ctrl + Scroll / Pinch**: Zoom in and zoom out of the active diagram.",
          "**Ctrl + Z / Ctrl + Y**: Undo and Redo diagram modifications.",
          "**Ctrl + S**: Save the active project file (`.adia` format with all domains).",
          "**Delete / Backspace**: Remove selected blocks, states, or connection wires.",
          "**Double Click on Block**: Opens the internal layer (e.g., opens IBD for a BDD block, or opens sub-diagram for an X-Bridges state).",
          "**Right Click on Canvas**: Opens the quick-add component and context menu."
        ]
      }
    ],
    related: ["architecture-guide", "entropy-opm", "state-machine-fundamentals", "vlab-fundamentals", "xbridges-ref", "hil-fundamentals"]
  },

  "architecture-guide": {
    title: "System Architecture (SysML & OPM)",
    category: "Architecture",
    description: "Structural design using Block Definition Diagrams (BDD), Internal Block Diagrams (IBD), Requirements Diagrams, Traceability Matrices (RTM), and Object-Process Methodology (OPM).",
    content: "The Architecture module is built on ENTROPY — a native OPM (Object-Process Methodology, ISO 19450) modeling environment. Instead of authoring SysML BDD, IBD, State Machine, and Requirements diagrams separately, you author a single OPM model of objects, processes, and states; the Smart Show panel derives the structure view (BDD-equivalent), internal view (IBD-equivalent), behavior view (state-machine-equivalent), and requirements traceability view automatically, and the event-driven simulation engine executes the model with trigger/condition/enabler semantics, conflict resolution, and animation detection. Existing SysML models can be migrated with one click via 'Import SysML → OPM'.",
    image: adia_architecture_diagram,
    sections: [
      {
        title: "Block Definition Diagram (BDD) - Elements & Properties",
        body: "A BDD models the structural taxonomy, type definitions, and composition hierarchies of your system. To build a BDD, follow these step-by-step UI actions:\n\n1. Click **+ Add Block** in the architecture toolbar or drag from the left sidebar.\n2. Select the block on the canvas to open the **Properties Panel** on the right sidebar:\n\n```\n┌────────────────────────────────────────┐\n│         «Block» MotorDrive             │\n├────────────────────────────────────────┤\n│  - maxRpm: float = 3000.0              │\n│  - ratedPower: float = 1500.0          │\n├────────────────────────────────────────┤\n│  + setSpeed(rpm: float): void          │\n│  + emergencyStop(): void               │\n├────────────────────────────────────────┤\n│  constraints:                          │\n│    torque <= maxTorque                 │\n└────────────────────────────────────────┘\n```",
        list: [
          "**Stereotype Selector**: Choose the block classification: (1) `Block` - structural component, (2) `Interface` - software port contract, (3) `Interface Block` - reusable port definition, (4) `ValueType` - physical dimension (e.g. speed in rad/s, voltage in V), and (5) `Enumeration` - set of named constants.",
          "**Block Name**: Enter a unique PascalCase name for the block class.",
          "**Add Port (+ Button)**: Define interface ports: (1) `Std` (Standard) - service invocation ports, (2) `Flow` - physical energy/matter flow (specify Direction `In`, `Out`, `I/O`, and physical `Unit`), and (3) `Proxy` - interfaces pointing to external block contracts.",
          "**Value Properties**: Add typed properties with default values (e.g. `mass:float=12.5`, `supplyVoltage:float=24.0`).",
          "**Operations**: Define callable member methods (e.g. `startPump(pressure:float):bool`).",
          "**Constraints**: Define mathematical parametric constraints (e.g. `power == voltage * current`).",
          "**Satisfied Requirements**: Multi-select requirements from the project pool that this structural block fulfills."
        ]
      },
      {
        title: "BDD Structural Relationships & Connectors",
        body: "To connect blocks in BDD, select the **Relationship Tool** in the top toolbar, click the source block anchor, and drag to the target block. In the connection dialog, select the relationship type:",
        list: [
          "**Association**: Standard bidirectional or directed reference between independent blocks.",
          "**Generalization (Inheritance)**: Sub-block inherits all value properties, operations, constraints, and ports from the super-block.",
          "**Composition (Strong Part-Whole)**: Black diamond connector. The child part belongs exclusively to the parent whole; deleting the parent deletes the child.",
          "**Aggregation (Weak Part-Whole)**: White diamond connector. The child part is shared and can exist independently of the parent.",
          "**Allocation**: Dashed arrow with `«allocate»` stereotype mapping logical functions to hardware execution units.",
          "**Multiplicity Settings**: Set cardinality on source and target ends (e.g., `1`, `0..1`, `1..*`, `*`)."
        ]
      },
      {
        title: "Internal Block Diagram (IBD) - Parts & Flow Routing",
        body: "An IBD models the internal topology and interconnected part instances encapsulated inside a parent BDD block.\n\n**How to Use IBD**:\n1. **Double-click** any BDD block on the canvas to drill down into its internal IBD layer.\n2. Click **+ Add Part** to instantiate internal subsystem blocks.\n3. In the Part Properties panel, assign its **Block Definition** (the part automatically inherits all ports defined on its type).\n4. Drag connector lines between port pins of different parts to route signals, energy, or fluids.\n5. Click on the connector line to specify the **Item Flow** (e.g. `PWM_Control_Signal`, `Coolant_Flow`) and set the transmission protocol.",
        list: [
          "**Part Instances**: Named instances of block types with multiplicity bounds (e.g. `motorLeft: MotorDrive [1]`, `motorRight: MotorDrive [1]`).",
          "**Port Connectors**: Signal and physical flow channels linking matching port types.",
          "**Interface Realization**: Binds abstract interface ports to concrete internal part pins."
        ]
      },
      {
        title: "Requirements Diagrams & Strict Writing Rules (IEEE 29148 / INCOSE)",
        body: "Requirements Diagrams define the functional, safety, and physical specifications of the system. To create a requirement:\n1. Click **+ Add Requirement** in the toolbar.\n2. Enter the unique **ID** (e.g., `REQ-PUMP-01`) and select the **Verify Method** (`Test`, `Analysis`, `Inspection`, `Demonstration`).\n3. Write the specification text according to standard active-voice rules:\n\n```\n[Condition/Trigger] + [Subject/System] + SHALL + [Action/Verb] + [Object/Response] + [Constraint/Tolerance]\n```\n*Example*: *'When the coolant temperature exceeds 95°C, the safety supervisor SHALL de-energize the heater within 50 milliseconds.'*",
        list: [
          "**The Binding 'SHALL' Rule**: Mandatory requirements MUST use the keyword **shall**. Never use ambiguous words like 'should', 'might', 'will', or 'user-friendly'.",
          "**Singular & Atomic**: Exactly one requirement contract per block. Do not combine multiple behaviors with 'and' or 'or'.",
          "**Quantifiable Metrics**: Always include verifiable numbers, tolerances, and time bounds (e.g. `within ±0.5°C`, `<= 100ms`).",
          "**Verification Method**: Select `Test` (HIL or software test runner), `Analysis` (simulation solver), `Inspection` (code/circuit review), or `Demonstration`."
        ]
      },
      {
        title: "Requirements Traceability & RTM Grid",
        body: "Traceability guarantees that every requirement is satisfied by architectural blocks and validated by tests:\n1. Drag a relationship line from a requirement to a target element, and select the relationship type:\n   - **Satisfy (`«satisfy»`)**: Links a Requirement to a BDD Block or IBD Part that implements it.\n   - **Verify (`«verify»`)**: Links a Requirement to a Test Script, Simulation Benchmark, or HIL Test Case.\n   - **Derive (`«deriveReqt»`)**: Relates a low-level child requirement to a high-level system requirement.\n   - **Refine (`«refine»`)**: Connects a requirement to a state machine diagram detailing its behavior.\n2. Click the **RTM (Requirements Traceability Matrix)** button in the top bar to open the full matrix view. Green cells confirm satisfied & verified requirements; amber/red cells highlight orphaned or untested requirements.",
        list: [
          "**Bidirectional Navigation**: Click any requirement ID in the RTM table to jump directly to its satisfying block on the canvas.",
          "**Export Matrix**: Click **Export RTM** to download the traceability matrix in CSV, HTML, or PDF formats."
        ]
      },
      {
        title: "Object-Process Methodology (OPM / ISO 19450)",
        body: "OPM provides a dual conceptual modeling approach using Object-Process Diagrams (OPD) and Object-Process Language (OPL) text:\n\n1. Click **+ Add Object** (rectangular node) to represent physical or informatical entities.\n2. Click **+ Add Process** (oval node) to represent transformations that create, consume, or change the state of objects.\n3. Connect objects and processes using procedural links (consumption, effect, instrument, agent) or structural links.\n4. Click **View OPL** to inspect automatically generated formal English specifications matching ISO 19450 standards."
      }
    ],
    related: ["getting-started", "entropy-opm", "air-fryer-sysml", "state-machine-fundamentals"]
  },

  "entropy-opm": {
    title: "OPM (ISO 19450) & ENTROPY Embedded C Engine",
    category: "Architecture",
    description: "Master Object-Process Methodology (ISO 19450) single-model systems engineering, dual conceptual/executable layers, 10-phase deterministic simulation, and MISRA-compliant safety-critical C99 code generation.",
    content: "Entropy is the name of ADIA's diagramming module that implements Object-Process Methodology (ISO 19450) — a single-model systems-engineering notation where structure (objects), behavior (processes/states), and requirements all live on one diagram instead of separate SysML views. It is exposed as the 'OPM (ISO 19450)' tab in the top navigation bar.",
    image: entropy_opm_architecture_diagram,
    sections: [
      {
        title: "1. What 'OPM Entropy' Actually Is (Dual-Layer Architecture)",
        body: "Entropy is built as two stacked layers with clear separation of responsibilities:\n\n• **Conceptual OPM**: Free-form ISO 19450 diagramming: Objects, Processes, States, Requirements, structural/procedural/event/traceability links. Always valid, never blocks editing.\n• **Executable OPM**: An optional, strict superset: typed attributes, guards, priorities, timeouts, and hardware I/O mapping. Only active once you explicitly enable execution on a block.\n\nThe core design principle is: **'conceptual is permissive, executable is strict, and the boundary between them is explicit and reversible.'** Editing never forces you into the strict model; only Simulate and Generate-Code do.",
        list: [
          "**Conceptual Layer Files**: `EntropyWorkspace.tsx`, `OPMNodeComponents.tsx`, `OPMEdgeComponents.tsx`, `OplParser.ts` (OPD ⇄ OPL text bidirectional synchronization).",
          "**Executable Layer Engine**: `src/engine/opm/*` (`compileExecutableOpm`, deterministic runtime, `semanticValidator`, C99 code generator).",
          "**Permissive vs Strict Boundary**: Canvas editing is completely permissive and never blocks rapid sketching; semantic validation and strict execution gates only engage during simulation and firmware generation."
        ]
      },
      {
        title: "2. The Core Design Concept & Execution Pipeline",
        body: "The end-to-end pipeline routes canvas elements through deterministic normalization and semantic validation before executing in the TypeScript runtime or emitting MISRA-compliant C99 firmware:",
        code: `OPM Editor Canvas (React Flow)
        │  Objects / Processes / States / Requirements + typed Links
        ▼
Deterministic Normalization  (stable ordinal IDs, C-safe identifiers)
        ▼
Restricted Expression Parser (safe guard/assignment language: +,-,*,/,%,&&,||,abs/min/max/clamp)
        ▼
Semantic Validator  (one initial state per object, reachability, write-conflict detection)
        ▼
   ┌─────────────────────┐        ┌────────────────────────────┐
   │ TypeScript Runtime   │        │  C99 Code Generator         │
   │ 10-phase tick cycle  │        │  12 static files, no malloc │
   └─────────────────────┘        └────────────────────────────┘`,
        list: [
          "**ISO 19450 Fidelity First**: Node and edge visuals follow the standard's notation exactly: filled vs hollow arrowheads (agent vs instrument), double arrowheads for 'effect', dashed lines for event links (trigger/condition), and triangle/circle glyphs for structural links (aggregation/generalization/exhibition). The live legend (`OpmLegend.tsx`) provides continuous visual guidance.",
          "**Single Canonical Model**: Whether sketching or generating firmware, everything funnels through one `compileExecutableOpm()` pipeline — no separate 'diagram' vs 'code' model to keep in sync.",
          "**Deterministic, MISRA-Friendly Execution**: The runtime and generated C share the exact same 10-phase tick (sample inputs ──► advance timers ──► activate ──► evaluate on frozen snapshot ──► stage writes ──► resolve conflicts by priority ──► commit ──► run entry/exit actions ──► publish outputs ──► advance clock). Zero heap allocation, no recursion, no function pointers, bounded arrays.",
          "**Strict Isolation**: OPM's engine and generator are deliberately walled off from other engines (Stateflow, X-Bridges) with enforced architectural boundary tests.",
          "**Fail-Closed UX**: Invalid connections are rejected before being added to the canvas; invalid models cannot be simulated or exported; editing a model invalidates previously verified C artifacts via cryptographic fingerprinting."
        ]
      },
      {
        title: "3. Block Types & Port Catalogues (ISO 19450)",
        body: "Four primary block types represent structure, behavior, and traceability in ISO 19450:\n\n• **Object**: Rounded rectangle, green, thick border if `physical`. Represents an entity that exists and can hold nested States.\n• **Process**: Ellipse, blue, orange pulse when firing. Represents a transformation or action.\n• **State**: Small capsule nested inside an Object. Represents one value/mode of that object; a filled dot marks the ISO initial state.\n• **Requirement**: Purple dashed card. Non-executable traceability node (`satisfies`/`verifies` only).\n\nEach block gets an automatic default port catalogue upon creation, and custom ports can be added from the right-side inspector.",
        list: [
          "**Object Default Ports**: Outputs: `Agent`, `Instrument`, generic `Out`; Inputs: `Result`, `Effect`.",
          "**Process Default Ports**: Inputs: `Consume`, `Agent`, `Instrument`, `Trigger`, `Condition`; Outputs: `Result`, `Effect`.",
          "**Physicality Toggle**: Marks real-world hardware objects and processes with a thicker border, unlocking physical MCU pin and register mappings in C code generation.",
          "**Custom Port Inspector**: Add custom ports with Name, Direction (`In`/`Out`), Side (`Left`/`Right`/`Top`/`Bottom`), and Role (`Standard`, `Agent`, `Instrument`, `Trigger`, `Condition`, `Consume`, `Result`, `Effect`)."
        ]
      },
      {
        title: "4. Link Types & Legal Connection Rulebook",
        body: "Links are validated by `OpmLinkRules.ts` (`validateOpmConnection`) on every drag. Self-connections and duplicate same-type links are rejected with on-canvas error alerts and Diagnostics Badge entries.",
        list: [
          "**Agent (Object ──► Process)**: An object or human executes the process (solid line, filled arrowhead).",
          "**Instrument (Object ──► Process)**: An object enables the process without being consumed (solid line, hollow arrowhead).",
          "**Consumption (Object/State ──► Process)**: The process consumes and destroys the source entity (solid line, filled arrowhead).",
          "**Result (Process ──► Object/State)**: The process creates the target object or enters the target state (solid line, filled arrowhead).",
          "**Effect (Process ◄──► Object/State)**: The process changes the target's state (bidirectional allowed, double filled arrowheads).",
          "**Trigger (State ──► State or Object/State ──► Process)**: Event-based: entering a state triggers a process or transition (dashed line, filled arrowhead).",
          "**Condition (Object/State ──► Process)**: Process fires only while this state holds without consumption (dashed line, hollow arrowhead).",
          "**Aggregation / Generalization / Exhibition (Object ──► Object)**: Structural links representing 'consists-of', 'is-a', and 'exhibits' hierarchies.",
          "**Satisfies / Verifies (Requirement ──► Object/Process)**: Non-executable traceability connecting requirements to architectural implementations."
        ]
      },
      {
        title: "5. How to Design a System with OPM Entropy (Step-by-Step)",
        body: "Follow this 11-step engineering workflow to construct, verify, simulate, and export firmware from an OPM model:",
        list: [
          "**1. Open ENTROPY OPM**: Navigate to the 'OPM (ISO 19450)' tab from the top workspace switcher.",
          "**2. Place Blocks**: Pick a tool (Object / Process / State / Requirement) in the left toolbar and click the canvas. Add States by selecting the State tool and clicking inside an existing Object.",
          "**3. Mark Physicality**: Toggle 'Physical' on Objects/Processes representing real hardware to get a thicker border and unlock C hardware-mapping options.",
          "**4. Wire the Behavior**: Select the Link Mode dropdown before dragging (Agent, Instrument, Trigger, Condition, Result, Effect).",
          "**5. Add Structure (Optional)**: Use Aggregation to model composition ('System consists of Sensor and Actuator') and Generalization for inheritance hierarchies.",
          "**6. Attach Requirements (Optional)**: Place Requirement nodes and connect them with Satisfies/Verifies links to fulfilling Objects/Processes.",
          "**7. Check OPL Text**: Inspect the synchronized natural-language Object-Process Language sentences (`OplParser.ts`). Full worked templates (Smart Home, Cruise Control, Steam Air Fryer) can be loaded from `EntropyExamples.ts`.",
          "**8. Make It Executable (Optional)**: Select an element and open the 'C Exec' inspector tab to add typed attributes (bool/int32/uint32/float32/enum), hardware mappings, guards, assignments, timeouts, and execution priorities.",
          "**9. Simulate**: Open the in-canvas Live Trace HUD to observe active states, firing processes, and variable scopes tick-by-tick using the OPM-owned tick configuration.",
          "**10. Fix Diagnostics**: Click any warning or error in the Diagnostics Badge (bottom-left) to navigate directly to the offending block or property.",
          "**11. Generate Embedded C**: Open Target Settings, choose an MCU target pack (STM32F103/F407, ATmega328P/2560, ESP32), and export the verified 12-file MISRA-C package (`opm_runtime.c/h`, `opm_model.c/h`, `opm_io.c/h`, `opm_trace.c/h`, `main_example.c`)."
        ]
      },
      {
        title: "6. How to Connect Ports (The Actual Mechanics & Wiring Patterns)",
        body: "Port connection mechanics in ADIA Entropy provide real-time visual feedback, magnetic snapping, and fail-closed validation:",
        list: [
          "**1. Pick Link Type First**: Select the link mode in the left toolbar before dragging to highlight only valid target ports.",
          "**2. Hover Source Port**: Ports appear as colored circular handles (Agent: sky blue, Instrument: dark sky, Trigger: amber, Condition: purple, Effect: pink, Result: emerald, Consumption: slate) with text pill labels.",
          "**3. Drag with Visual Feedback**: The connection line glows amber and magnetically snaps to compatible ports within ~30px while non-compatible targets remain unhighlighted.",
          "**4. Drop & Validation**: `isValidConnection` and `onConnect` run `validateOpmPortConnection` to verify endpoints exist, prevent self-loops, prevent duplicates, and ensure role/direction legality.",
          "**5. Add Custom Ports**: Open the inspector for any block, click 'Add Custom Port', and specify name, direction, side, and role.",
          "**6. Inline Edge Switcher**: Select an edge to display a floating pill badge with an icon, link name, delete button, and inline type-switcher dropdown.",
          "**7. Cascade Deletion**: Deleting a port automatically removes all connected edges to prevent dangling references.",
          "**'X does Y'**: `Agent` (Object ──► Process).",
          "**'Y uses X'**: `Instrument` (Object ──► Process).",
          "**'Y consumes X'**: `Consumption` (Object/State ──► Process).",
          "**'Y creates X'**: `Result` (Process ──► Object/State).",
          "**'Y changes X'**: `Effect` (Process ◄──► Object/State).",
          "**'When X, do Y'**: `Trigger` (State ──► Process or State ──► State).",
          "**'While X, allow Y'**: `Condition` (Object/State ──► Process).",
          "**'X is part of Y'**: `Aggregation` (Object ──► Object).",
          "**'Requirement R is met by X'**: `Satisfies` / `Verifies` (Requirement ──► Object/Process)."
        ]
      }
    ],
    related: ["architecture-guide", "getting-started", "code-generation"]
  },

  "air-fryer-sysml": {
    title: "Tutorial: SysML Air Fryer System Design",
    category: "Tutorials",
    description: "A complete, step-by-step walkthrough modeling a multi-physics consumer appliance from requirements to BDD, IBD, and physical plant allocation.",
    content: "This tutorial illustrates how to model an intelligent forced-air cooking appliance using a rigorous requirement-driven systems engineering approach in ADIA.",
    image: air_fryer_sysml,
    sections: [
      {
        title: "Step 1: Capture Requirements",
        body: "1. Navigate to the **Architecture** tab.\n2. Click **+ Add Requirement** three times and configure:\n   - `[REQ-AF-01]`: *'The system shall maintain basket air temperature within ±2.5°C of user setpoint.'* (Verify: `Test`).\n   - `[REQ-AF-02]`: *'When the cooking basket is removed, the controller shall disable the heater element within 20 milliseconds.'* (Verify: `Test`).\n   - `[REQ-AF-03]`: *'The preheat cycle shall heat the chamber from 25°C to 200°C in less than 180 seconds.'* (Verify: `Analysis`)."
      },
      {
        title: "Step 2: Structural Decomposition (BDD)",
        body: "1. Click **+ Add Block** to create the top-level block: `AirFryerSystem`.\n2. Create 4 sub-blocks: `ControlUnit`, `HeatingElement`, `ConvectionBlower`, and `UserInterface`.\n3. Connect `AirFryerSystem` to the sub-blocks using **Composition** connectors with multiplicity `1`.\n4. Add ports to `ControlUnit`:\n   - `tempSensorIn`: Flow Port (In, Unit: °C)\n   - `basketInterlock`: Flow Port (In, Unit: bool)\n   - `heaterPwm`: Flow Port (Out, Unit: PWM%)\n   - `fanEnable`: Flow Port (Out, Unit: bool)"
      },
      {
        title: "Step 3: Internal Connectivity (IBD)",
        body: "1. Double-click the `AirFryerSystem` block to open its **IBD**.\n2. Instantiate parts for each block.\n3. Draw connections between ports:\n   - Connect `ControlUnit.heaterPwm` to `HeatingElement.powerCommand` (Item Flow: `PWM_Duty`).\n   - Connect `ConvectionBlower.airOutlet` to `CookingChamber.airInlet` (Item Flow: `Forced_Air_m3s`).\n   - Connect `CookingChamber.tempSensor` to `ControlUnit.tempSensorIn` (Item Flow: `Temp_Feedback`)."
      },
      {
        title: "Step 4: Trace Requirements (Satisfy)",
        body: "1. Return to the BDD view.\n2. Draw a **Satisfy** relationship from `[REQ-AF-01]` to `ControlUnit` (PID controller satisfies temperature stability).\n3. Draw a **Satisfy** relationship from `[REQ-AF-02]` to `SafetyInterlock` state logic.\n4. Draw a **Satisfy** relationship from `[REQ-AF-03]` to `HeatingElement` (1800W rated element)."
      }
    ],
    related: ["architecture-guide", "vlab-fundamentals", "learning-labs"]
  },

  "state-machine-fundamentals": {
    title: "State Machine (Stateflow) Fundamentals",
    category: "Stateflow (State Machine)",
    description: "Build deterministic, hierarchical, and parallel state machines with entry/during/exit actions, orthogonal regions, and variable management.",
    content: "The ADIA Stateflow module implements hierarchical finite state machines (Statecharts). It is designed to model reactive event-driven supervisory logic, mode managers, and sequential control algorithms that seamlessly integrate with continuous physical plants.",
    image: state_machine_guide_diagram,
    sections: [
      {
        title: "Anatomy of a State & Action Blocks",
        body: "A State represents an operating condition or operational mode (e.g., `Idle`, `Preheating`, `Cooking`, `Fault`). To add and configure a state:\n\n1. Click **+ Add State** on the Stateflow toolbar, or drag a state box onto the canvas.\n2. Double-click the state header to set its name.\n3. Click inside the state body or open the right sidebar to configure its three lifecycle action blocks:\n\n```\n┌────────────────────────────────────────┐\n│               Preheating               │\n├────────────────────────────────────────┤\n│  entry:                                │\n│    heaterPower = 100;                  │\n│    fanSpeed = 80;                      │\n│  during:                               │\n│    heatTimer = heatTimer + 1;          │\n│    error = targetTemp - currentTemp;   │\n│  exit:                                 │\n│    heaterPower = 0;                    │\n└────────────────────────────────────────┘\n```",
        list: [
          "**Entry Action (`entry: <statement>;`)**: Executes exactly once on the simulation step when the state is entered.",
          "**During Action (`during: <statement>;`)**: Executes on every simulation tick as long as the state remains active and no outgoing transition fires.",
          "**Exit Action (`exit: <statement>;`)**: Executes exactly once when the state is exited before entering the destination state."
        ]
      },
      {
        title: "Hierarchical (Nested) & Parallel (Orthogonal) Decomposition",
        body: "Stateflow supports structured nested states and multi-threaded parallel state logic:\n\n1. **Hierarchical (Nested) States**: Drag sub-states inside a parent state container. Entering the parent state automatically activates its child **Autostart** state. If an outer transition leaves the parent, all active child states execute their `exit` actions recursively.\n2. **Decomposition Modes (OR vs. AND)**:\n   - **OR Decomposition (Exclusive)**: Exactly one child state can be active at any given time.\n   - **AND Decomposition (Parallel/Orthogonal)**: Sub-regions are separated by dashed boundary lines. Every orthogonal region is active concurrently and scheduled in deterministic priority order (Region 1, Region 2, Region 3)."
      },
      {
        title: "Special State Properties & Controls",
        body: "Select any state on the canvas to toggle these specialized properties in the sidebar panel:",
        list: [
          "**Autostart State (Initial)**: Click the **Set Initial** toggle to designate the default state entered when the chart or parent layer activates.",
          "**Safe State (`isSafeState: true`)**: Designates an emergency fallback state. If any runtime exception (e.g., division by zero, invalid sensor read) occurs in any action, the simulator immediately halts normal execution and redirects safely into this state.",
          "**X-Bridges State (`isXBridges: true`)**: Embeds a continuous signal-flow block diagram model inside the state. When active, the sub-diagram executes during the state's `during` phase for hybrid control.",
          "**Terminal State (Quiescent)**: Designates a final state. Once entered, the state remains active indefinitely, executes no `during` actions, and generates no implicit resets."
        ]
      },
      {
        title: "Variables Manager (Inputs, Outputs & Locals)",
        body: "Click the **Variables** button in the left sidebar to manage the state machine's context memory table:\n\n1. Click **+ Add Variable**.\n2. Specify the **Name**, **Data Type** (`bool`, `int`, `float`, `enum`), **Initial Value**, and **Scope**:\n   - **Input (Read-Only)**: Read from physical sensors, V-Lab plant signals, X-Bridges controllers, or HIL hardware pins.\n   - **Output (Write-Only)**: Drives physical actuators, PWM channels, indicator LEDs, or plant inputs.\n   - **Local (Read/Write)**: Internal state machine variables used for counters, elapsed timers, and intermediate calculations."
      }
    ],
    related: ["state-machine-transitions", "state-machine-simulation", "state-machine-tutorial", "code-generation"]
  },

  "state-machine-transitions": {
    title: "Transitions, Triggers & Junctions",
    category: "Stateflow (State Machine)",
    description: "Master transition syntax, condition guards, temporal logic after(N), execution priorities, connective junctions, and history junctions.",
    content: "Transitions are directed paths that define how and when the system moves from an active state to a new state or decision junction.",
    sections: [
      {
        title: "Transition Syntax & Configuration",
        body: "To create a transition, hover over the border of a source state, click on the **Port Anchor**, and drag an arrow to the target state or junction. Click the transition label on the canvas to edit its standard syntax:\n\n```\nTrigger [Condition] / Action\n```\n*Example*: `after(50) [tempSensor > 180 && doorClosed == true] / alarmBeep = 1; fanSpeed = 100;`",
        list: [
          "**Trigger**: An event name or temporal logic operator (e.g., `after(50)`, `btnPressEvent`).",
          "**Condition (Guard)**: A Boolean expression enclosed in square brackets `[ ... ]`. The transition will only fire if this expression evaluates to `true`.",
          "**Action**: Imperative assignment statements written after a forward slash `/`. Executes instantaneously when the transition fires."
        ]
      },
      {
        title: "Temporal Logic Operators: after(N) & every(N)",
        body: "ADIA provides built-in temporal operators that monitor time spent inside the source state without requiring manual timers:\n\n1. **`after(N)`**: Evaluates to `true` once the source state has been continuously active for at least `N` simulation ticks (where `1 tick = tickMs` milliseconds). Example: `after(100)` at a 10ms tick rate creates an exact 1.0-second delay.\n2. **`every(N)`**: Fires periodically on every $N$-th tick while remaining in the state.",
        code: "after(50) [batteryLevel < 20] / lowBatteryWarning = true;"
      },
      {
        title: "Deterministic Execution Priorities (1..N)",
        body: "When multiple transitions depart from the same state, ADIA guarantees deterministic behavior by assigning an explicit integer priority to each transition:\n\n1. Click on a transition to open its properties in the right sidebar.\n2. Set the **Priority** number (e.g. `1`, `2`, `3`).\n3. The simulator evaluates outgoing transitions in ascending priority order. The first transition whose guard evaluates to `true` immediately fires; subsequent transitions are ignored for that step.",
        list: [
          "**Priority 1**: Reserved for emergency safety interlocks and fault escapes.",
          "**Priority 2+**: Sequential normal operation branches."
        ]
      },
      {
        title: "Connective & History Junctions",
        body: "Junctions act as dynamic decision nodes that route execution without creating persistent states:\n\n1. Click **+ Add Junction** on the toolbar and select the type:\n   - **Connective Junction (Circle Node)**: Used to build multi-way branch decisions (if/else if/else). Evaluated instantaneously in zero simulation time.\n   - **Shallow History Junction (H)**: Placed inside a parent state. When the parent state is re-entered, it restores the exact child state that was active when previously exited.\n   - **Deep History Junction (H*)**: Recursively restores active states at all descendant sub-levels of the hierarchy."
      },
      {
        title: "Internal State Transitions",
        body: "Internal transitions execute actions while keeping the state active, without triggering the state's `exit` or `entry` actions:\n1. Select a state on the canvas.\n2. In the sidebar, click **+ Add Internal Transition**.\n3. Format as `[Condition] / Action`. Example: `[tickCount > 10] / tickCount = 0; pingHeartbeat();`."
      }
    ],
    related: ["state-machine-fundamentals", "state-machine-simulation", "code-generation"]
  },

  "state-machine-simulation": {
    title: "Stateflow Simulation & Execution Solvers",
    category: "Stateflow (State Machine)",
    description: "Run live deterministic simulations, monitor state activations, inspect variables, co-simulate with X-Bridges and V-Lab, and verify scheduler contracts.",
    content: "The ADIA State Machine Simulator runs on a deterministic fixed-step execution engine that coordinates state updates, signal routing, and physical plant solvers.",
    image: state_machine_simulation_diagram,
    sections: [
      {
        title: "Top Simulation Controls & Toolbar",
        body: "Control simulation execution using the dedicated top playback toolbar:\n\n```\n[ ▶ Start ]   [ ❚❚ Pause ]   [ ⏭ Step (1 Tick) ]   [ ↺ Reset ]   [ Speed: 100ms ──────●── ]\n```",
        list: [
          "**Start (Play Icon)**: Starts continuous real-time simulation at the configured tick rate.",
          "**Pause (Pause Icon)**: Freezes execution to inspect active states and variable values.",
          "**Step (Step Icon)**: Advances the simulation by exactly one single clock tick ($1\\Delta t$).",
          "**Reset (Reset Icon)**: Restores all variables to default initial values and returns the state machine to initial autostart states.",
          "**Tick Rate Slider**: Adjust simulation step time dynamically from 1ms up to 1000ms."
        ]
      },
      {
        title: "The 6-Phase Simulation Execution Step Loop",
        body: "At every simulation step (tick), the engine executes the following fixed sequence:\n\n1. **Synchronize Inputs**: Sample external input values from Factory I/O, V-Lab sensors, X-Bridges outputs, and HIL hardware pins.\n2. **Increment Timers**: Advance active state duration timers by 1 tick (evaluating `after(N)`).\n3. **Evaluate Transitions**: Check outgoing transitions from active states in priority order. If valid: (a) Execute source state `exit` action, (b) Execute transition `/ action`, (c) Activate target state and execute its `entry` action.\n4. **Execute During Actions**: If no transition fires, execute the `during` action of all currently active states.\n5. **Process Internal Transitions**: Check and execute any valid internal state transitions.\n6. **Synchronize Outputs**: Write updated output variables to physical plant actuators, scopes, and HIL MCU output pins."
      },
      {
        title: "Live Visual State Inspection & Breakpoints",
        body: "During active simulation:\n- Currently active states glow with an animated orange/emerald border.\n- The **Variables Table** on the left displays live real-time values, color-coded by variable type.\n- You can manually override any input variable value in real-time to test edge cases."
      },
      {
        title: "MCU Scheduler Integration Contract",
        body: "When exporting to embedded C99 firmware, the generated scheduler strictly replicates the simulation step loop:\n\n```c\n/* Deterministic Embedded Execution Contract */\nSM_ReadInputs(&instance);    /* 1. Sample ADC / GPIO / MCAL channels */\nSM_Step(&instance, 10U);     /* 2. Advance state logic by 10ms */\nSM_WriteOutputs(&instance);  /* 3. Commit PWM / DAC / Actuator commands */\n```"
      }
    ],
    related: ["state-machine-fundamentals", "state-machine-transitions", "hil-fundamentals", "code-generation"]
  },

  "state-machine-tutorial": {
    title: "Tutorial: Building a Smart Timer Switch",
    category: "Stateflow (State Machine)",
    description: "Step-by-step hands-on guide to create a push-button smart light switch that automatically powers off after 5 seconds.",
    content: "This tutorial takes you through creating states, variables, transitions, temporal logic triggers, and verifying execution in the simulator.",
    sections: [
      {
        title: "Step 1: Create Variables",
        body: "1. Open the **Variables** panel on the left sidebar.\n2. Click **+ Add Variable** three times and create:\n   - `btnPress` (Type: `bool`, Initial: `false`, Scope: `Input`)\n   - `lightState` (Type: `int`, Initial: `0`, Scope: `Output`)\n   - `onCounter` (Type: `int`, Initial: `0`, Scope: `Local`)"
      },
      {
        title: "Step 2: Add States",
        body: "1. Click **+ Add State** on the toolbar and name it `Off`.\n   - Set `entry: lightState = 0;`\n   - Click **Set Initial** to make `Off` the autostart state.\n2. Click **+ Add State** again and name it `On`.\n   - Set `entry: lightState = 1; onCounter = 0;`\n   - Set `during: onCounter = onCounter + 1;`\n   - Set `exit: lightState = 0;`"
      },
      {
        title: "Step 3: Connect Transitions",
        body: "1. Drag a transition from `Off` to `On`.\n   - Double-click the label and enter: `[btnPress == true]`\n2. Drag a return transition from `On` to `Off`.\n   - Double-click the label and enter: `after(50)` (50 ticks at 100ms = 5.0 seconds)."
      },
      {
        title: "Step 4: Run and Test",
        body: "1. Click **Start** in the top simulation toolbar.\n2. In the Variables panel, click `btnPress` to toggle it to `true`.\n3. Observe the active state transition to `On` and `lightState` switch to `1`.\n4. Watch `onCounter` increment on each tick.\n5. After 5 seconds, watch the state return automatically to `Off`."
      }
    ],
    related: ["state-machine-fundamentals", "state-machine-transitions", "state-machine-simulation"]
  },

  "vlab-fundamentals": {
    title: "V-Lab Physical Plant Modeling",
    category: "V-Lab (Plant Modeling)",
    description: "Learn the principles of acausal physical modeling, across and through variables, conservation laws, multi-domain routing, and reference grounds.",
    content: "V-Lab is a high-fidelity physical plant modeling environment built on the principle of acausal physical modeling. Unlike causal signal-flow simulators where blocks compute unidirectional output values from inputs, acausal components represent physical devices connected by bidirectional energy terminals.",
    image: adia_vlab_simulation,
    sections: [
      {
        title: "Acausal vs. Causal Modeling Principles",
        body: "In acausal networks, connections enforce physical conservation laws at every junction, assembling a simultaneous system of Differential Algebraic Equations (DAEs):\n\n```\n           Acausal Terminal Junction\n                     │\n      ┌──────────────┼──────────────┐\n      ▼              ▼              ▼\n  Component A    Component B    Component C\n\n  1. Across Potential:  V_A = V_B = V_C (Equal at junction)\n  2. Through Flow:      I_A + I_B + I_C = 0 (Conserved to zero)\n```",
        list: [
          "**Across Variables (Potentials)**: Measured between a node and reference ground. Equal at every connected pin (e.g. Voltage $V$, Angular Velocity $\\omega$, Translational Velocity $v$, Temperature $T$, Pressure $P$).",
          "**Through Variables (Flows)**: Rates of flow passing through a branch. Conserved so the sum entering any junction is zero (e.g. Current $I$, Torque $\\tau$, Force $F$, Heat Flow $Q$, Mass Flow $\\dot{m}$)."
        ]
      },
      {
        title: "The 7 Coupled Physical Domains in V-Lab",
        body: "V-Lab seamlessly couples 7 physical domains across shared electromechanical and thermodynamic boundaries:",
        list: [
          "**Electrical**: Across = Voltage ($V$), Through = Current ($A$). Circuit components, transformers, switched bridges.",
          "**Mechanical Rotational**: Across = Angular Velocity (rad/s), Through = Torque (N-m). Shafts, inertia, gearboxes.",
          "**Mechanical Translational**: Across = Velocity (m/s), Through = Force (N). Mass, linear springs, dampers.",
          "**Thermal**: Across = Temperature (K), Through = Heat Flow (W). Conduction, convection, Stefan-Boltzmann radiation.",
          "**Magnetic Reluctance**: Across = Magnetomotive Force (A-t), Through = Magnetic Flux (Wb). Reluctance paths, coils.",
          "**Gas Network**: Across = Pressure (Pa), Temperature (K); Through = Mass Flow (kg/s). Compressible pneumatic air.",
          "**Moist Air (MA)**: Across = Pressure (Pa), Temp (K), Humidity Ratio (kg/kg); Through = Mixture Mass Flow, Moisture Flow."
        ]
      },
      {
        title: "Acausal Connection Rules & Mandatory Reference Grounds",
        body: "To build valid physical circuits in V-Lab without singular matrix errors, follow these structural rules:\n\n1. **Mandatory Ground / Reference Node**: Every independent physical network MUST connect to at least one reference node (e.g. `Electrical Ground`, `Rotational Reference`, `Translational Reference`, `Gas Reference`, `Moist Air Reference`) to define the zero-potential benchmark ($V=0$, $\\omega=0$, $P=0$).\n2. **Domain Port Matching**: Connect ports of identical physical domain types. Use cross-domain converter blocks (e.g. `Rotational Electromechanical Converter`, `Reluctance Force`, `Convective Heat Transfer`) to bridge domains."
      },
      {
        title: "Step-by-Step: Assembling a Circuit in V-Lab",
        body: "1. Navigate to the **V-Lab** tab.\n2. In the left component library, expand the desired domain (e.g. `Electrical`).\n3. Click and drag a `DC Voltage Source`, `Resistor`, `Capacitor`, and `Electrical Ground` onto the canvas.\n4. Hover over port pins (orange/blue circles) and drag connection wires between matching terminals.\n5. Double-click any component to configure parameters (e.g., set `R = 1000 Ohms`, `C = 10uF`).\n6. Click the **Scope** button on a component to view real-time across/through variable plots.\n7. Click **Start Simulation** in the top bar to run the physical solver."
      }
    ],
    related: ["vlab-physics", "vlab-fluid-dynamics", "vlab-blocks-reference", "motor-models"]
  },

  "vlab-physics": {
    title: "V-Lab Physics Engine & Numerical Solvers",
    category: "V-Lab (Plant Modeling)",
    description: "Detailed mathematical mechanics of the V-Lab solver: Modified Nodal Analysis (MNA), BDF implicit integration, Newton-Raphson line-search, and zero-crossing detection.",
    content: "V-Lab solves stiff, non-linear physical Differential Algebraic Equations (DAEs) in the general implicit form: $f(x, \\dot{x}, t) = 0$ using industrial-grade numerical integration methods.",
    sections: [
      {
        title: "Modified Nodal Analysis (MNA) Topology Assembly",
        body: "Before simulation begins, the DAE Assembler processes the diagram topology to construct the state vector $x$ (node potentials and branch flows) and assembles the residual equations vector $f(x, \\dot{x}, t)$:\n\n1. **Conserving Equations**: Node balance enforcing $\\sum Through = 0$ at all electrical, mechanical, and fluid junctions.\n2. **Constitutive Equations**: Component governing equations (e.g., $V_p - V_n - I \\cdot R = 0$ for resistors; $I - C \\cdot \\frac{dV}{dt} = 0$ for capacitors; $\\tau - J \\cdot \\frac{d\\omega}{dt} - B\\omega = 0$ for mechanical inertia)."
      },
      {
        title: "Implicit Multi-Step Integration (BDF-1 & BDF-2)",
        body: "To solve continuous state derivatives $\\dot{x} = \\frac{dx}{dt}$ with unconditional stability for stiff networks, V-Lab utilizes Backward Differentiation Formulas:\n\n1. **BDF-1 (Backward Euler)**: 1st-order implicit method used during startup initialization and immediately after discontinuities:\n   $$\\dot{x}_k = \\frac{x_k - x_{k-1}}{h}$$\n2. **BDF-2**: 2nd-order high-precision implicit method used during smooth continuous execution:\n   $$\\dot{x}_k = a_0 x_k + a_1 x_{k-1} + a_2 x_{k-2}$$"
      },
      {
        title: "Newton-Raphson Non-linear Solver with Line Search",
        body: "At each time step, non-linear algebraic equations are solved iteratively using Newton-Raphson with backtracking line search damping:\n\n$$x^{(k+1)} = x^{(k)} - \\alpha \\cdot J^{-1} \\cdot f(x^{(k)})$$\n\n- **Numerical Jacobian ($J$)**: Evaluated by perturbing state vector components: $J_{ij} = \\frac{\\partial f_i}{\\partial x_j}$.\n- **Backtracking Line Search ($\\alpha$)**: The step damping factor $\\alpha \\in (0, 1]$ is dynamically scaled down if a candidate step increases the residual norm $\\|f(x)\\|$, preventing divergence on sharp non-linearities (e.g. diodes, switches, hard stops)."
      },
      {
        title: "Adaptive Time-Stepping & Zero-Crossing Event Rewind",
        body: "1. **Local Truncation Error (LTE)**: The solver computes error estimates between candidate BDF-2 and BDF-1 solutions. If LTE exceeds tolerance, the step is rejected, step size $h$ is halved, and the solver retries.\n2. **Zero-Crossing Event Detection**: For components with discrete switching states (e.g. saturation limits, hard stops, ideal switches), indicator functions $g(x) = v_{ctrl} - v_{thresh}$ are monitored for sign changes. When detected, the solver rewinds time to the exact root $g(x) = 0$, commits the discrete transition, and restarts BDF-1 integration smoothly."
      }
    ],
    related: ["vlab-fundamentals", "vlab-blocks-reference", "vlab-fluid-dynamics"]
  },

  "vlab-fluid-dynamics": {
    title: "V-Lab Fluid Dynamics & Moist Air Flow",
    category: "V-Lab (Plant Modeling)",
    description: "Simulate Gas networks and Moist Air (MA) psychrometric mixtures, constant volume chambers, pneumatic pipes, and convective heat transfer.",
    content: "V-Lab provides specialized acausal domains for compressible pure Gas (G) networks and Moist Air (MA) psychrometric mixtures for HVAC, pneumatic actuators, and appliance thermal management.",
    sections: [
      {
        title: "Gas (G) Domain Fundamentals",
        body: "The Gas domain models compressible ideal gas flow where Across variables are Pressure ($P$ in Pa) and Temperature ($T$ in K), and the Through variable is Mass Flow Rate ($\\dot{m}$ in kg/s):\n\n$$P = \\rho R T, \\quad \\dot{m} = \\frac{P \\cdot D}{R \\cdot T} \\omega$$\n\n- **Ideal Gas Constant ($R$)**: Configured in the `Gas Properties (G)` block (default 287 J/kg/K for air).\n- **Conservation of Mass**: In a constant volume gas chamber: $\\frac{dP}{dt} = \\frac{R T}{V} \\sum \\dot{m}_{in}$."
      },
      {
        title: "Moist Air (MA) Psychrometric Mixtures",
        body: "The Moist Air domain tracks psychrometric mixtures of dry air and water vapor, solving 3 simultaneous potential balances:\n\n1. **Pressure ($P$)**: Governs total bulk mixture mass flow $\\dot{m}$.\n2. **Temperature ($T$)**: Governs thermal enthalpy and convective heat transfer: $Q_{in} - Q_{out} = C_{chamber} \\frac{dT}{dt}$.\n3. **Humidity Ratio ($H = \\frac{m_w}{m_a}$)**: Governs water vapor species mass balance: $\\sum \\dot{m}_w = 0$."
      },
      {
        title: "Step-by-Step: Building a Fluid / Pneumatic System",
        body: "1. Place a `Gas Properties (G)` or `Moist Air Properties (MA)` block in your network to establish atmospheric baseline constants ($P_{std} = 101325$ Pa, $T_{std} = 293.15$ K).\n2. Connect a `Gas Reference` or `Absolute Reference (MA)` to define the $P=0$ potential.\n3. Connect flow lines to a `Constant Volume Chamber` (provides volume buffering states $\\frac{dP}{dt}$).\n4. Connect valves, pipes, and convective heat exchangers to model heating, pressure drops, or air blowers."
      }
    ],
    related: ["vlab-fundamentals", "vlab-physics", "vlab-blocks-reference", "air-fryer-sysml"]
  },

  "vlab-blocks-reference": {
    title: "V-Lab Complete Physical Catalog Reference",
    category: "V-Lab (Plant Modeling)",
    description: "Exhaustive catalog of physical components across electrical, mechanical, thermal, magnetic, gas, moist air, and control libraries.",
    content: "This reference details the governing differential and algebraic equations, terminal ports, and configurable parameters for all acausal blocks in the V-Lab library.",
    sections: [
      {
        title: "Electrical Domain Library",
        body: "Passive, active, switching, and source components:",
        list: [
          "**Resistor**: $V_p - V_n = I \\cdot R$. Linear electrical dissipation. Params: `resistance` (Ohms).",
          "**Variable Resistor**: $V_p - V_n = I \\cdot \\max(R_{ctrl}, R_{min})$. Controlled thermistor or potentiometer.",
          "**Capacitor**: $I = C \\cdot \\frac{d(V_p - V_n)}{dt}$. Electric charge accumulation and energy storage. Params: `capacitance` (Farads).",
          "**Inductor**: $V_p - V_n = L \\cdot \\frac{dI}{dt}$. Magnetic field storage and current inertia. Params: `inductance` (Henries).",
          "**Transformer**: $V_2 = N \\cdot V_1, \\; I_1 = -N \\cdot I_2$. Ideal mutual magnetic coupling. Params: `turnsRatio`.",
          "**Switch**: $V = I \\cdot (V_{ctrl} > V_{thresh} ? R_{on} : R_{off})$. Power converter semiconductor switch.",
          "**DC Voltage Source**: $V_p - V_n = V_{const}$. Constant voltage battery cell / power supply.",
          "**AC Voltage Source**: $V_p - V_n = V_{pk} \\sin(2\\pi f t + \\phi) + I \\cdot R_{int}$. Grid mains generator.",
          "**Three-Phase Source**: Balanced 3-phase AC voltage with 120° phase displacements for motor drives."
        ]
      },
      {
        title: "Mechanical Rotational & Translational Libraries",
        body: "Newtonian mechanical dynamics and kinematics:",
        list: [
          "**Inertia**: $\\tau = J \\frac{d\\omega}{dt} + B\\omega$. Rotational rotor mass and damping. Params: `inertia` ($kg\\cdot m^2$), `damping` ($N\\cdot m\\cdot s/rad$).",
          "**Mass**: $F = m \\frac{dv}{dt} + Bv$. Translational mass inertia. Params: `mass` (kg), `damping` (N-s/m).",
          "**Rotational / Linear Spring**: $\\tau = k \\theta$, $F = k(x_r - x_c)$. Elastic compliance and springback.",
          "**Rotational / Linear Damper**: $\\tau = D \\cdot \\Delta\\omega$, $F = D \\cdot \\Delta v$. Viscous shock absorption.",
          "**Gear Box**: $\\omega_2 = N \\cdot \\omega_1, \\; \\tau_1 = N \\cdot \\tau_2$. Mechanical speed scaling and torque multiplication.",
          "**Hard Stop**: Non-linear spring-damper barrier preventing mechanical position from exceeding $[x_{min}, x_{max}]$.",
          "**Lever**: Rigid force amplification linkage arm: $v_a = -\\frac{L_2}{L_1} v_b, \\; F_a = \\frac{L_2}{L_1} F_b$."
        ]
      },
      {
        title: "Thermal & Magnetic Libraries",
        body: "Thermodynamic heat transfer and electromagnetic reluctance:",
        list: [
          "**Thermal Mass**: $Q = C \\frac{dT}{dt}$. Heat storage capacity. Params: `mass` (kg), `specificHeat` (J/kg/K).",
          "**Thermal Conduction**: $Q = \\frac{k \\cdot A}{L} (T_a - T_b)$. Fourier heat conduction through solids.",
          "**Thermal Convection**: $Q = h \\cdot A (T_a - T_b)$. Newton convective heat transfer to fluid boundary.",
          "**Thermal Radiation**: $Q = \\epsilon \\sigma A (T_a^4 - T_b^4)$. Stefan-Boltzmann high-temperature radiation.",
          "**Reluctance**: $\\mathcal{F} = \\Phi \\cdot \\mathcal{R}$. Magnetic reluctance path in ferromagnetic cores.",
          "**Permanent Magnet**: Constant magnetomotive force source $\\mathcal{F} = H_c \\cdot L$.",
          "**Electromechanical Converter**: $V = N \\frac{d\\Phi}{dt}, \\; \\mathcal{F} = N \\cdot I$. Bridges electrical circuits to magnetic coils."
        ]
      },
      {
        title: "Control & Physical Signals (PS Math)",
        body: "Causal-to-physical signal bridges, feedback loops, and signal math:",
        list: [
          "**Discrete PI / PID Controller**: $u = K_p e + K_i \\int e \\, dt + K_d \\frac{de}{dt}$ with anti-windup clamping.",
          "**Clarke & Park Transforms**: 3-phase $abc$ to stationary $\\alpha\\beta$ and rotating $dq0$ coordinates for FOC.",
          "**Space Vector PWM (SVPWM)**: Inverter gate switching time calculations.",
          "**PS Math Operators**: Sum, Subtract, Gain, Product, Divide, Saturation, Integrator, Transfer Function, Dead Zone."
        ]
      }
    ],
    related: ["vlab-fundamentals", "vlab-physics", "motor-models", "vfd-control"]
  },

  "motor-models": {
    title: "Electric Machine Reference",
    category: "V-Lab (Plant Modeling)",
    description: "Detailed documentation and mathematical formulations for AC Induction Motors, BLDC Motors, and DC Machine drives.",
    content: "ADIA provides industrial-grade electromechanical machine models parameterized for automotive, robotics, and industrial appliance applications.",
    sections: [
      {
        title: "Three-Phase Induction Motor (AC Motor)",
        body: "Models a squirrel-cage induction motor in $dq$ stationary/rotating reference frames:\n\n$$V_{ds} = R_s I_{ds} + \\frac{d\\psi_{ds}}{dt} - \\omega_e \\psi_{qs}$$\n$$V_{qs} = R_s I_{qs} + \\frac{d\\psi_{qs}}{dt} + \\omega_e \\psi_{ds}$$\n$$T_e = \\frac{3}{2} p (\\psi_{ds} I_{qs} - \\psi_{qs} I_{ds})$$",
        list: [
          "**Inputs**: 3-Phase electrical terminals ($A, B, C$).",
          "**Outputs**: Mechanical rotational shaft port ($R$ - angular velocity $\\omega$, torque $\\tau$).",
          "**Parameters**: Stator resistance $R_s$, Rotor resistance $R_r$, Stator inductance $L_s$, Rotor inductance $L_r$, Mutual inductance $L_m$, Pole pairs $p$."
        ]
      },
      {
        title: "Brushless DC (BLDC) Motor",
        body: "Models a permanent-magnet brushless motor with trapezoidal back-EMF waveform:\n\n$$V_{abc} = R_s I_{abc} + L_s \\frac{dI_{abc}}{dt} + E_{abc}(\\theta)$$\n$$T_e = \\frac{E_a I_a + E_b I_b + E_c I_c}{\\omega}$$\n\nRequires Hall sensor feedback or sensorless observer for six-step electronic commutation."
      },
      {
        title: "Permanent Magnet Synchronous Motor (PMSM)",
        body: "High-efficiency sinusoidal PMSM for Field-Oriented Control:\n\n$$T_e = \\frac{3}{2} p [\\psi_{pm} I_q + (L_d - L_q) I_d I_q]$$\n\nSupports Maximum Torque Per Ampere (MTPA) and Field Weakening algorithms for high-speed operation."
      }
    ],
    related: ["vfd-control", "vlab-fundamentals", "xbridges-ref"]
  },

  "vfd-control": {
    title: "Variable Frequency Drive (VFD) & FOC Control",
    category: "Control Systems",
    description: "Design and validate Field-Oriented Control (FOC), Space Vector PWM (SVPWM), and closed-loop speed/current control.",
    content: "Variable Frequency Drives (VFD) regulate AC motor speed and torque with optimal efficiency using decoupled vector control in ADIA.",
    sections: [
      {
        title: "Field-Oriented Control (FOC) Architecture",
        body: "FOC transforms 3-phase AC stator currents into two DC orthogonal components ($I_d$ for magnetic flux, $I_q$ for torque):\n\n```\n  [ Stator Currents Ia, Ib, Ic ] ──► [ Clarke Transform (α, β) ] ──► [ Park Transform (d, q) ]\n                                                                           │\n                                    [ Desired Id, Iq Setpoints ] ──────────┤\n                                                                           ▼\n  [ Gate Drive Signals ] ◄── [ SVPWM ] ◄── [ Inv. Park ] ◄── [ PI Current Regulators ]\n```"
      },
      {
        title: "Space Vector PWM (SVPWM) Modulation",
        body: "SVPWM synthesizes continuous voltage space vectors by switching between 8 discrete inverter voltage states (6 active vectors $V_1..V_6$, 2 zero vectors $V_0, V_7$), maximizing DC bus voltage utilization by 15.5% compared to sinusoidal PWM."
      },
      {
        title: "Step-by-Step: Setting Up FOC in ADIA",
        body: "1. Navigate to **X-Bridges**.\n2. Add `Clarke Transform`, `Park Transform`, two `PI Controller` blocks (for $I_d$ and $I_q$), `Inverse Park Transform`, and `SVPWM`.\n3. Feed motor phase currents to Clarke, motor angle $\\theta$ to Park.\n4. Connect PI outputs to Inverse Park, and Inverse Park outputs to SVPWM.\n5. Route SVPWM gate duty cycles to the V-Lab Inverter Bridge component."
      }
    ],
    related: ["motor-models", "xbridges-ref", "vlab-blocks-reference"]
  },

  "xbridges-ref": {
    title: "X-Bridges Signal-Flow & Control Solver",
    category: "Control Systems",
    description: "Causal block-diagram design, Kahn's topological compilation, continuous/discrete solvers, Model Predictive Control (MPC), and online AI.",
    content: "X-Bridges is the primary causal signal-flow modeling environment in ADIA. Unlike acausal V-Lab networks, X-Bridges is a directed block simulator where blocks compute explicit output signals from input signals in topologically sorted order.",
    sections: [
      {
        title: "Topological Compilation & Algebraic Loop Resolution",
        body: "Before execution, the X-Bridges compiler flattens subsystems and constructs an execution list using Kahn's topological sorting algorithm:\n\n1. **Topological Execution Ordering**: Computes block outputs sequentially from inputs.\n2. **Algebraic Loops (Error)**: A direct cyclic connection without a stateful memory block (e.g. `Unit Delay`, `Integrator`) prevents ordering. To fix, insert a `Unit Delay` ($z^{-1}$) or `Integrator` ($\\frac{1}{s}$) into the feedback branch."
      },
      {
        title: "Continuous & Discrete Solvers",
        body: "1. **Euler Explicit (ODE1)**: First-order fixed-step integration: $x(t + dt) = x(t) + dt \\cdot \\dot{x}(t)$.\n2. **Runge-Kutta 4th Order (ODE4/RK4)**: High-precision four-stage continuous numerical integrator computing weighted slope estimates $(k_1, k_2, k_3, k_4)$ per step.\n3. **Discrete Multi-rate Updating**: Evaluates discrete registers, counters, and digital filters at designated sample periods."
      },
      {
        title: "Model Predictive Control (MPC) Solver",
        body: "The `MPC Controller` block implements an online quadratic programming solver using the Fast Gradient Method (FGM) to solve constrained optimal control trajectories in real time:\n\n$$U(k+1) = \\text{clamp}\\left(Y(k) - \\frac{1}{L} (H Y(k) + f), \\, u_{min}, \\, u_{max}\\right)$$\n\n- Predicts system response over prediction horizon $N_p$ and control horizon $N_c$.\n- Clamps candidate controls within physical actuator limits $[u_{min}, u_{max}]$."
      },
      {
        title: "Online Adaptive Learning & Neural Blocks",
        body: "1. **LMS Adaptive Filter**: Least Mean Squares online weight update for active noise cancellation: $w(k+1) = w(k) + \\mu \\cdot e(k) \\cdot x(k)$.\n2. **Online Neural Neuron**: Single-neuron gradient descent using tanh activation.\n3. **Q-Learning RL Controller**: Discrete Q-table agent with $\\epsilon$-greedy exploration for adaptive control under model uncertainty."
      }
    ],
    related: ["vfd-control", "code-generation", "motor-models", "hil-fundamentals"]
  },

  "hil-fundamentals": {
    title: "Hardware-in-the-Loop (HIL) Fundamentals",
    category: "Hardware-in-the-Loop (HIL)",
    description: "Learn core HIL principles, supported MCU hardware architectures, real-time serial co-simulation, and verification workflows.",
    content: "Hardware-in-the-Loop (HIL) simulation connects ADIA directly to physical microcontroller targets (MCUs) via high-speed serial links, executing state machines on real hardware clock cycles while validating electrical I/O, noise tolerances, and safety interlocks.",
    image: hil_architecture_diagram,
    sections: [
      {
        title: "What is HIL Simulation & Why Use It?",
        body: "Instead of running purely in a software simulation, HIL runs the compiled state machine directly on physical silicon (e.g. ARM Cortex-M or ESP32) while the ADIA PC host monitors inputs, drives virtual plant signals, and graphs real-time telemetry:\n\n```\n  ┌─────────────────────────────────┐        USB / UART Serial        ┌─────────────────────────────────┐\n  │         ADIA PC HOST            │ ◄─────────────────────────────► │        PHYSICAL MCU TARGET      │\n  │  - Virtual Plant Simulation     │       115200 / 921600 Baud      │  - Compiled C99 State Machine   │\n  │  - Live Telemetry & Scope       │                                 │  - Real GPIO / ADC / PWM Pins   │\n  │  - Real-Time Fault Injection    │ ── Overrides / Virtual Sensors ─►│  - Hardware Clock Cycles (10ms) │\n  │  - Signal Mapper Scaling Math   │ ◄── Telemetry / Pin Readings ───│  - Emergency Hardware Shutdown  │\n  └─────────────────────────────────┘                                 └─────────────────────────────────┘\n```",
        list: [
          "**Real Hardware Timing Validation**: Verifies that state execution steps finish within strict hardware timer interrupt periods without watchdog timeouts.",
          "**Electrical Pin I/O Validation**: Tests real ADC quantization noise, pull-up/pull-down resistors, and DAC/PWM driver characteristics.",
          "**Safety Verification**: Validates emergency shutdown states under injected physical faults before deploying to full production machinery."
        ]
      },
      {
        title: "Supported MCU Target Platforms",
        body: "ADIA provides automated Hardware Abstraction Layer (HAL) generation for 4 primary target families:",
        list: [
          "**STM32F4 / STM32F1 (ARM Cortex-M)**: Industry standard for automotive and safety-critical industrial controls. Generates STM32 HAL drivers.",
          "**Arduino Uno / Mega (AVR 8-bit)**: Ideal for educational labs and rapid hardware prototyping. Generates standard Arduino C++ code.",
          "**ESP32 (Tensilica Xtensa)**: Dual-core 240MHz MCU with Wi-Fi/BLE for IoT control applications. Generates ESP-IDF / Arduino ESP32 code.",
          "**Generic ANSI C99**: Portable HAL abstraction designed for integration into any custom MCU SDK, RTOS (FreeRTOS/Zephyr), or DSP."
        ]
      }
    ],
    related: ["hil-configuration", "hil-dashboard", "hil-code-generation", "state-machine-simulation"]
  },

  "hil-configuration": {
    title: "Configuring HIL Channels & Signal Mapper",
    category: "Hardware-in-the-Loop (HIL)",
    description: "Step-by-step guide to configure physical MCU driver channels, map state variables to hardware pins, and define inline scaling math.",
    content: "The HIL Configuration and Signal Mapper tools establish explicit bindings between physical microcontroller pins and ADIA state machine variables.",
    sections: [
      {
        title: "Step 1: Define Driver Channels",
        body: "1. Navigate to the **HIL** tab in the top navigation bar.\n2. In the **Hardware Configuration** panel, select your **Target MCU** (e.g., `STM32F401RE`, `ESP32`, `Arduino Uno`).\n3. Click **+ Add Driver Channel** to declare a physical pin interface:\n\n```\n┌──────────────┬──────────────┬──────────────┬──────────────┬──────────────┐\n│ Peripheral   │ Pin ID       │ Direction    │ Data Type    │ Sampling     │\n├──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤\n│ ADC          │ PA0 (A0)     │ In           │ uint16_t     │ 10 ms        │\n│ GPIO         │ PA5 (D13)    │ Out          │ bool         │ Event        │\n│ PWM          │ PB6 (TIM4)   │ Out          │ uint16_t     │ 10 ms        │\n└──────────────┴──────────────┴──────────────┴──────────────┴──────────────┘\n```",
        list: [
          "**Peripheral Type**: Select `GPIO` (Digital Pin), `ADC` (Analog In), `DAC` (Analog Out), or `PWM` (Pulse-Width Modulation Out).",
          "**Pin ID**: Enter the target hardware pin identifier (e.g., `A0`, `PA0`, `D13`, `GPIO25`).",
          "**Direction**: `In` (read from sensor into state machine) or `Out` (driven by state machine to actuator).",
          "**Data Type**: Select the C data type (`bool`, `uint8_t`, `uint16_t`, `int32_t`, `float`)."
        ]
      },
      {
        title: "Step 2: Bind Signals in the Signal Mapper",
        body: "1. Switch to the **Signal Mapper** tab.\n2. Click **+ Add Mapping Binding**.\n3. Select the **Driver Channel** and map it to a **State Machine Variable**:\n   - **Read Binding (Hardware $\\to$ SM)**: Physical pin reads are transferred to the input variable prior to every state step.\n   - **Write Binding (SM $\\to$ Hardware)**: State machine output variables are committed to physical output pins after every step."
      },
      {
        title: "Step 3: Inline Signal Scaling Math Expressions",
        body: "Sensors and software variables frequently use different units and scaling. In the Signal Mapper, enter an inline conversion expression using variable `x` (representing the raw hardware reading):\n\n- **10-bit ADC (0-1023) to Voltage (0-5V)**: `x * (5.0 / 1023.0)`\n- **12-bit ADC (0-4095) to Temperature (°C)**: `x * (3.3 / 4095.0) * 100.0`\n- **PWM Duty (0-100%) to 16-bit Timer Register (0-65535)**: `x * (65535.0 / 100.0)`\n- **ADC with Offset Calibration**: `(x - 512) * 0.25`"
      }
    ],
    related: ["hil-fundamentals", "hil-dashboard", "hil-code-generation"]
  },

  "hil-dashboard": {
    title: "HIL Live Telemetry & Real-Time Fault Injection",
    category: "Hardware-in-the-Loop (HIL)",
    description: "Stream live MCU telemetry, plot multi-channel oscilloscope waveforms, and inject real-time sensor faults to test safety resilience.",
    content: "The HIL Dashboard provides a real-time mission control center to monitor hardware execution, log telemetry packets, and stress-test safety logic.",
    sections: [
      {
        title: "Connecting to Hardware & Streaming Telemetry",
        body: "1. Connect your MCU to your computer using a USB cable.\n2. In the HIL Dashboard, select the detected **Serial COM Port** (e.g. `COM3` on Windows or `/dev/ttyUSB0` on Linux).\n3. Set the **Baud Rate** (default `115200`).\n4. Click **Connect** (green button).\n5. The status indicator changes to **CONNECTED**, and the live multi-channel oscilloscope starts plotting incoming pin and variable waveforms in real-time."
      },
      {
        title: "Real-Time Fault Injection Engine",
        body: "Verify that safety interlocks trigger under hardware failure conditions without modifying physical wiring using the **Fault Injection** panel:\n\n1. In the active channels list, locate the target input channel (e.g., `tempSensor_ADC`).\n2. Select the fault injection mode:\n   - **Manual Override**: Force the channel value to a static override number (e.g. force temperature to `250.0°C`).\n   - **Noise Injection**: Add random Gaussian or uniform noise (adjust amplitude slider) to test filter stability against electromagnetic interference.\n   - **Signal Clamping**: Restrict channel values to simulate sensor saturation or a degraded resistor.\n3. Click **Inject Fault** and verify that the state machine immediately transitions to its `Fault` safe state and disables physical PWM outputs."
      }
    ],
    related: ["hil-fundamentals", "hil-configuration", "hil-code-generation"]
  },

  "hil-code-generation": {
    title: "HIL Embedded C Driver Code Generation",
    category: "Hardware-in-the-Loop (HIL)",
    description: "Generate deterministic C99 HAL firmware packages for STM32, Arduino, ESP32, or Generic MCU toolchains.",
    content: "ADIA automatically exports validated HIL configurations as a clean, deterministic C99 firmware project ready to build and flash to your microcontroller.",
    sections: [
      {
        title: "Step 1: Generate & Download Firmware Package",
        body: "1. In the HIL workspace, click the **Generate HIL Code** button in the toolbar.\n2. ADIA generates and packages the complete embedded source code into a `.zip` archive:\n   - `hal_config.h`: Pin definitions, clock speeds, and baud rates.\n   - `hal_drivers.c / .h`: Peripheral initialization (GPIO, ADC, PWM, UART).\n   - `hil_interface.c / .h`: Telemetry serial packet serialization and signal scaling.\n   - `main_hil.c`: The real-time deterministic scheduler loop."
      },
      {
        title: "Step 2: The Generated Deterministic Main Loop",
        body: "The generated `main_hil.c` runs a strict, non-blocking periodic scheduler loop:\n\n```c\nint main(void) {\n    HAL_Drivers_Init();          /* 1. Initialize clock, GPIO, ADC, PWM, UART */\n    SM_Init(&sm_instance);       /* 2. Initialize Stateflow variables & autostart states */\n    \n    while (1) {\n        HIL_Receive_Poll();      /* Process incoming host override packets */\n        \n        if (SM_ReadInputs(&sm_instance) == SM_ERR_NONE) {\n            if (SM_Step(&sm_instance, 10U) == SM_ERR_NONE) {\n                (void)SM_WriteOutputs(&sm_instance);\n            }\n        }\n        \n        HIL_SendTelemetry(&sm_instance);  /* Stream packet back to ADIA PC host */\n        HAL_Delay_Ms(10U);                /* Enforce 10ms real-time tick period */\n    }\n}\n```"
      },
      {
        title: "Step 3: Flashing to Target MCU",
        body: "1. **STM32**: Open the generated folder in STM32CubeIDE, click **Build Project**, then click **Run / Flash**.\n2. **Arduino**: Open `main_hil.ino` in Arduino IDE, select board & COM port, and click **Upload**.\n3. **ESP32**: Build and flash using ESP-IDF or PlatformIO (`pio run --target upload`).\n4. Once flashed, return to the ADIA HIL Dashboard and click **Connect** to start real-time testing."
      }
    ],
    related: ["hil-fundamentals", "hil-configuration", "hil-dashboard", "code-generation"]
  },

  "doe-discovery": {
    title: "Design of Experiments (DOE) & AI Model Discovery",
    category: "DOE & Analysis",
    description: "Perform parameter sweeps, Latin Hypercube sampling, Taguchi designs, and discover inductive GMDH polynomial neural network models.",
    content: "The DOE & AI Model Discovery module automates the identification and optimization of complex system behaviors through statistical sampling and polynomial neural networks.",
    image: adia_doe_analysis,
    sections: [
      {
        title: "Statistical Sampling Methods",
        body: "1. **Full Factorial**: Evaluates all combinations of parameter discrete levels.\n2. **Latin Hypercube Sampling (LHS)**: Multi-dimensional stratified random sampling ensuring uniform space-filling coverage with minimal sample runs.\n3. **Taguchi Orthogonal Arrays**: Robust design method minimizing variance against environmental noise factors."
      },
      {
        title: "GMDH Polynomial Neural Networks",
        body: "Group Method of Data Handling (GMDH) is an inductive self-organizing learning algorithm that discovers optimal mathematical models from simulation data without predefined assumptions:\n\n$$y = a + \\sum_{i=1}^n b_i x_i + \\sum_{i=1}^n \\sum_{j=1}^n c_{ij} x_i x_j$$\n\n- Automatically builds polynomial layers, eliminates non-significant terms, and prevents overfitting using external validation criteria."
      },
      {
        title: "Step-by-Step: Running DOE in ADIA",
        body: "1. Navigate to the **DOE** tab.\n2. Click **Select Parameters** to pick plant or controller variables to sweep.\n3. Choose the **Sampling Method** (e.g. Latin Hypercube) and set the sample count (e.g. 50 runs).\n4. Click **Run DOE Batch**.\n5. Click **Train GMDH Model** to generate a polynomial surrogate function.\n6. Click **Export Surrogate Function** to integrate the learned equation directly into X-Bridges or V-Lab."
      }
    ],
    related: ["getting-started", "vlab-fundamentals", "xbridges-ref"]
  },

  "code-generation": {
    title: "Embedded C Code Generation & Verification Gatekeeper",
    category: "Software Engineering",
    description: "Export validated state-machine designs to deterministic C99 with structural checks, semantic validation, and evidence labels.",
    content: "ADIA generates MISRA-aligned, deterministic C99 source code from validated semantic intermediate representations (IR), providing strict integration contracts and automated verification evidence.",
    sections: [
      {
        title: "Model Validation Gatekeeper",
        body: "Before code generation, the engine executes automated structural and semantic validation checks:\n\n- **Structural Check**: Verifies that every state has valid entry points, no dangling transitions exist, and all orthogonal regions have valid initial states.\n- **Semantic Validation**: Verifies variable types, resolves expression syntax, and guarantees deterministic transition priority ordering.\n- Any critical structural or semantic defect blocks code generation immediately."
      },
      {
        title: "Runtime Integration Scheduler Contract",
        body: "The generated C code is strictly modular and free of dynamic memory allocation (`malloc`):\n\n```c\n/* Initialize State Machine */\nSM_Init(&sm_instance);\n\n/* Main Cyclic Task (e.g., 10ms timer interrupt) */\nvoid Task_10ms(void) {\n    SM_ReadInputs(&sm_instance);\n    if (SM_Step(&sm_instance, 10U) == SM_ERR_NONE) {\n        SM_WriteOutputs(&sm_instance);\n    }\n}\n```"
      },
      {
        title: "Verification Evidence Labels",
        body: "Generated reports clearly categorize verification statuses:\n- **Structural PASS**: Topology and hierarchy validated.\n- **Semantic PASS**: IR expressions and state behaviors validated.\n- **Host Runtime PASS**: Verified in local PC test harness.\n- **Embedded Target PENDING**: Target MCU validation required on physical hardware."
      }
    ],
    related: ["getting-started", "state-machine-simulation", "hil-code-generation"]
  },

  "industrial-automation": {
    title: "3D Industrial Simulator & Factory I/O Gateway",
    category: "Industrial Integration",
    description: "Connect ADIA state machines and control models to external 3D real-time industrial factory simulators.",
    content: "The Industrial Automation Gateway connects ADIA via TCP/UDP communication to Factory I/O and industrial 3D digital twins for virtual commissioning (SIL/HIL).",
    sections: [
      {
        title: "Real-Time Automation Gateway",
        body: "1. Navigate to **Industrial Gateway** in the navigation bar.\n2. Enter the **Host IP Address** and **Port** of the external Factory I/O instance.\n3. Click **Auto-Discover Tags** to fetch all digital sensors (conveyor photo-eyes, push buttons) and actuator coils (motors, pneumatic pushers).\n4. Click **Connect & Synchronize** to run live co-simulation."
      }
    ],
    related: ["getting-started", "state-machine-simulation", "hil-fundamentals"]
  },

  "learning-labs": {
    title: "Digital Twin Learning Labs & Demonstrators",
    category: "Tutorials",
    description: "Explore pre-built interactive multiphysics digital twins and industrial control learning labs.",
    content: "ADIA includes a library of complete, open-box digital twin demonstrators demonstrating cross-domain engineering.",
    sections: [
      {
        title: "1. Differential Drive LiDAR Robot Vacuum Twin",
        body: "A complete 9-block modular co-simulation of a differential-drive robot vacuum with 3DoF chassis kinematics, 8-beam LiDAR raycasting, collision boundary physics, encoder odometry drift, complementary sensor fusion, and 30x30 occupancy grid SLAM."
      },
      {
        title: "2. Multiphysics Air Fryer Oven",
        body: "Coupled acausal thermal, electrical heating element, forced convection air blower, and PID safety logic."
      },
      {
        title: "3. Three-Phase VFD Induction Motor Drive",
        body: "Field-Oriented Control (FOC), Clarke/Park transformations, Space Vector PWM (SVPWM), and closed-loop speed regulation."
      },
      {
        title: "4. Industrial Washing Machine",
        body: "Drum rotational inertia with unbalance mass, fluid sloshing drag equations, and multi-speed spin cycle control."
      },
      {
        title: "5. Microwave Inverter & Cavity",
        body: "High-voltage inverter drive, magnetron tube power output, and cavity thermal dissipation."
      },
      {
        title: "6. High-Speed Food Blender",
        body: "Universal motor dynamics coupled to non-linear fluid vortex resistance and pulse control."
      }
    ],
    related: ["robot-vacuum-digital-twin", "air-fryer-sysml", "vfd-control"]
  },

  "robot-vacuum-digital-twin": {
    title: "LiDAR Robot Vacuum Digital Twin Reference",
    category: "Tutorials",
    description: "Mathematical models, 9-block architecture, and subsystem equations for the modular differential-drive robot vacuum digital twin.",
    content: "The LiDAR Robot Vacuum Digital Twin demonstrates feedback control, motor dynamics, dead reckoning, sensor fusion, and occupancy grid SLAM mapping.",
    sections: [
      {
        title: "1. 9-Block System Architecture",
        body: "The system is structured into 9 modular connected blocks in a closed-loop co-simulation:\n\n```\n[ Navigation Planner ] ──► [ Inverse Kinematics ] ──► [ Wheel Speed PI ] ──► [ Left & Right DC Motors ]\n        ▲                                                                                │\n        │                                                                                ▼\n[ SLAM 2D Grid ] ◄── [ Sensor Fusion ] ◄── [ Odometry ] ◄── [ Simulation Canvas ] ◄── [ 3DoF Robot Dynamics ]\n```"
      },
      {
        title: "2. Continuous 3DoF Chassis Kinematics & Motor Dynamics",
        body: "The **Robot Dynamics** block solves continuous kinematic equations:\n\n$$\\frac{dX}{dt} = V \\cos(\\theta), \\quad \\frac{dY}{dt} = V \\sin(\\theta), \\quad \\frac{d\\theta}{dt} = \\omega$$\n\nThe DC motor blocks solve electrical armature dynamics and rotor acceleration:\n\n$$L_m \\frac{di}{dt} = V_{in} - R_m i - K_e \\omega_{wheel}, \\quad J \\frac{d\\omega}{dt} = K_t i - B \\omega$$"
      },
      {
        title: "3. Spatial Canvas & 8-Beam LiDAR Raycasting",
        body: "The **Simulation Canvas** simulates a 5.7m x 5.7m room with 3 circle and 2 box obstacles, calculates 8-beam LiDAR raycasting intersections, and detects 15cm chassis collisions."
      },
      {
        title: "4. Encoder Odometry, Sensor Fusion & SLAM",
        body: "The **Odometry** block integrates wheel encoder pulses with simulated drift. The **Sensor Fusion** complementary filter ($gain = 0.06$) corrects pose estimates, and the **SLAM** block maps LiDAR range returns into a 30x30 occupancy probability grid."
      }
    ],
    related: ["learning-labs", "xbridges-ref", "vlab-fundamentals"]
  }
};
