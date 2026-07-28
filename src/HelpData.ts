export const adia_architecture_diagram = new URL('./assets/adia_architecture_diagram_1778580699379.png', import.meta.url).href;
export const adia_vlab_simulation = new URL('./assets/adia_vlab_simulation_1778580716413.png', import.meta.url).href;
export const adia_doe_analysis = new URL('./assets/adia_doe_analysis_1778580732166.png', import.meta.url).href;
export const air_fryer_sysml = new URL('./assets/air_fryer_sysml_diagram_1778581647915.png', import.meta.url).href;
export const state_machine_guide_diagram = new URL('./assets/state_machine_guide_diagram.png', import.meta.url).href;
export const state_machine_simulation_diagram = new URL('./assets/state_machine_simulation_diagram.png', import.meta.url).href;
export const hil_architecture_diagram = new URL('./assets/hil_architecture_diagram.png', import.meta.url).href;

export const HELP_DATA: Record<string, {
  title: string;
  category: string;
  description: string;
  content: string;
  image?: string;
  sections?: { title: string; body: string; code?: string; list?: string[] }[];
  related?: string[];
}> = {
  "getting-started": {
    title: "Getting Started with ADIA",
    category: "Fundamentals",
    description: "Learn the basics of the ADIA engineering suite, from system architecture to physical simulation.",
    content: "ADIA is a comprehensive Model-Based Design (MBD) environment. It integrates structural architecture (SysML), behavioral logic (Stateflow), signal-flow control (X-Bridges), and physical plant modeling (V-Lab).",
    sections: [
      {
        title: "The ADIA Workflow",
        body: "1. **Architect**: Define your system hierarchy in the Architecture module.\n2. **Design Logic**: Implement reactive behavior using hierarchical state machines.\n3. **Model the Plant**: Build high-fidelity physical models in V-Lab.\n4. **Control**: Design feedback loops in X-Bridges.\n5. **Analyze**: Use DOE to optimize parameters and identify system bottlenecks."
      }
    ],
    related: ["architecture-guide", "air-fryer-sysml"]
  },
  "architecture-guide": {
    title: "System Architecture (SysML)",
    category: "Architecture",
    description: "Structural design using Block Definition Diagrams (BDD), Internal Block Diagrams (IBD), and Requirements Diagrams.",
    content: "The Architecture module implements key SysML (Systems Modeling Language) diagrams to define the structural hierarchy, internal connectivity, constraints, and requirements of a complex system. Use BDD to model classifications and block definitions, IBD to connect system parts, and Requirements Diagrams to trace functional constraints.",
    image: adia_architecture_diagram,
    sections: [
      {
        title: "Block Definition Diagram (BDD) - Elements & Properties",
        body: "A BDD defines block types, classifications, and system hierarchies. Select any block in the diagram to configure these detailed property settings in the sidebar panel:",
        list: [
          "**Stereotype Selector**: Determines the block's classification: (1) `Block` - structural component, (2) `Requirement` - text-based design target, (3) `Interface` - software port contract, (4) `Interface Block` - reusable port definition, (5) `ValueType` - physical dimension (e.g., speed, voltage), and (6) `Enumeration` - set of constant tags.",
          "**Block Name**: Unique name defining the block type class.",
          "**Ports Manager**: Add and configure ports of three kinds: (1) `Std` (Standard) - service-based interaction points, (2) `Flow` - represents material/energy flow (requires direction `In`, `Out`, `I/O`, and physical `Unit`), and (3) `Proxy` - interfaces pointing to external block contracts.",
          "**Value Properties**: Attributes or parameters specified as name:type=defaultValue (comma/newline separated, e.g., `mass:float=12.5`, `voltage:int=24`).",
          "**Operations**: Callable block functions (one per line, e.g., `readSensor(pin:int):float`).",
          "**Constraints**: Parametric rules and mathematical equations (one per line, e.g., `force = mass * accel`).",
          "**Nested Classes / Parts**: Sub-components or inner classifications nested under this block.",
          "**Satisfied Requirements**: Links this block to specific Requirement elements it fulfills."
        ]
      },
      {
        title: "BDD Structural Relationships",
        body: "Select relationship connectors in BDD to model structural dependencies and specify the following details:",
        list: [
          "**Relationship Type**: Choose from: (1) `Association` - standard bidirectional link, (2) `Generalization` - inheritance (child inherits ports/properties), (3) `Composition` - strong part-whole (part cannot exist without whole), (4) `Aggregation` - weak part-whole (shared part can exist independently), and (5) `Allocation` - maps logical blocks to hardware.",
          "**Label**: Custom descriptive text displayed along the relationship line.",
          "**Multiplicities**: Define cardinality on both ends (Source and Target Multiplicities, e.g., `0..1` to `*`)."
        ]
      },
      {
        title: "Internal Block Diagram (IBD) - Parts & Connections",
        body: "An IBD models how instances of blocks (parts) connect internally within a parent block context. Double-click a block on a BDD to open its internal layer and use IBD elements:",
        list: [
          "**Parts**: Instances of blocks in this context. Specify: (1) `Part Name` - instance label, (2) `Block Definition` - typing BDD block (part inherits all ports defined on the block type), and (3) `Multiplicity` - concurrent part count.",
          "**Connectors**: Signal, energy, or material paths linking ports. Set `Item Flow` to define what flows (e.g., `PWM_Signal`) and `Label` for descriptive text.",
          "**Interface Realization**: Direct connection bindings mapping a generic interface block to a specific part port."
        ]
      },
      {
        title: "Requirements Diagrams & Writing Rules",
        body: "Requirements Diagrams define the functional, behavioral, and physical constraints of a system. To write a well-formed, verifiable requirement, follow these standards (IEEE 29148 / INCOSE):",
        list: [
          "**The Binding 'Shall' Rule**: Mandatory requirements MUST use the word **shall** (e.g., 'The system shall...'). Avoid weaker words like 'should', 'must', 'will', or 'may' in functional specifications.",
          "**Sentence Structure Template**: Use the standard active voice formula: `[Condition/Trigger] + [Subject/System] + shall + [Action/Verb] + [Object/Response] + [Constraint/Refinement]`.",
          "**Structure Example**: *'When the temperature exceeds 200°C, the controller shall disable the heater output within 100 milliseconds.'*",
          "**Singular & Atomic**: A requirement should express exactly one contract. Avoid using conjunctions like 'and', 'or', 'but' to couple separate requirements.",
          "**Unambiguous & Quantifiable**: Avoid subjective words (e.g., 'fast', 'safe', 'efficient', 'user-friendly'). Use exact metrics (e.g., 'within 5 seconds', 'with efficiency >= 95%').",
          "**Verify Method**: Every requirement must specify how it is tested: `Test` (physical HIL/run-time tests), `Analysis` (using math or simulation engines), `Inspection` (visual review of code/drawings), or `Demonstration` (walkthrough of basic operations)."
        ]
      },
      {
        title: "Requirements Traceability & Mapping",
        body: "Traceability links requirements to structural design blocks, verification tests, and other requirements. Use the properties panel or connect nodes via relationship lines to build a bidirectional matrix:",
        list: [
          "**Satisfy (Satisfies)**: Links a structural block (BDD Block or IBD Part) to the requirement it fulfills. For example, a PID Controller block satisfies a 'Temp Stability' requirement.",
          "**Verify (Verifies)**: Links a test case, test script, or HIL configuration to the requirement it validates.",
          "**Derive (Derives)**: Relates a low-level, detailed requirement to a high-level parent system requirement from which it originates.",
          "**Refine (Refines)**: Connects a requirement to another model element (like a state machine or use case) that provides a more detailed, behavior-specific specification.",
          "**Trace (Traces)**: A general evolutionary or dependency relationship between design elements showing historical or logical correlation.",
          "**Requirements Traceability Matrix (RTM)**: Select the **RTM** window from the dashboard to view a complete grid of all requirement IDs mapped directly to their satisfying Blocks, verifying Test Cases, and statuses."
        ]
      }
    ],
    related: ["getting-started", "air-fryer-sysml"]
  },
  "air-fryer-sysml": {
    title: "Air Fryer System Design",
    category: "Tutorials",
    description: "A complete SysML walkthrough for a modern forced-air cooking system.",
    content: "This tutorial illustrates how to model a complex consumer appliance using a requirement-driven architecture approach.",
    image: air_fryer_sysml,
    sections: [
      {
        title: "1. Defining Requirements",
        body: "Start by capturing the essential performance targets for the Air Fryer. These are represented in the **Requirement Diagram**.",
        list: [
          "**[REQ-01] Temp Stability**: The system shall maintain temperature within ±2°C of the setpoint.",
          "**[REQ-02] Safety Interlock**: The heater shall be disabled if the basket is removed.",
          "**[REQ-03] Rapid Preheat**: Reach 200°C in less than 180 seconds."
        ]
      },
      {
        title: "2. Structural Breakdown (BDD)",
        body: "The **Block Definition Diagram** decomposes the Air Fryer into its logical and physical parts.",
        list: [
          "**Control Unit**: The brain of the system, running the PID and safety logic.",
          "**Heating Element**: A high-wattage resistive load (modeled in V-Lab).",
          "**Fan System**: Provides forced convection for even heat distribution.",
          "**User Interface**: Touch panel for time/temp settings."
        ]
      },
      {
        title: "3. Connectivity & Flow (IBD)",
        body: "The **Internal Block Diagram** shows how these parts interact. We use Proxy Ports for signals (Control Unit to Fan) and Full Ports for physical energy flow (Power Supply to Heater).",
        list: [
          "**PWM Signal**: From Controller to Heater Driver.",
          "**Temperature Feedback**: From Thermocouple to Controller.",
          "**Air Flow**: From Fan to Cavity."
        ]
      },
      {
        title: "4. Assigning Requirements (Satisfy)",
        body: "Finally, we map our requirements to the architectural blocks using the **Satisfy** relationship. This ensures traceability.",
        list: [
          "**Control Unit** satisfies **[REQ-01] Temp Stability** (via PID logic).",
          "**Door Sensor** satisfies **[REQ-02] Safety Interlock**.",
          "**1500W Heater** satisfies **[REQ-03] Rapid Preheat**."
        ]
      }
    ],
    related: ["architecture-guide", "vlab-physics"]
  },
  "vlab-fundamentals": {
    title: "V-Lab Plant Modeling",
    category: "V-Lab (Plant Modeling)",
    description: "Learn the principles of acausal physical modeling, across and through variables, conservation laws, and multi-domain routing.",
    content: "V-Lab is an advanced physical plant modeling environment built on the principle of acausal physical modeling. Unlike causal signal-flow environments (where outputs are computed directly from inputs, like in X-Bridges), acausal networks model physical connections where energy flows in both directions. The engine determines the system-wide distribution of energy by solving a set of simultaneous Differential Algebraic Equations (DAEs) that satisfy conservation laws at every node.",
    image: adia_vlab_simulation,
    sections: [
      {
        title: "Acausal vs. Causal Modeling",
        body: "In causal modeling, signals are directional: a block reads an input, computes a function, and writes an output. In acausal physical modeling, components are connected by terminals (ports) representing physical interfaces. There is no predefined direction of calculation. Instead, connections enforce physical constraints:",
        list: [
          "**Across Variables**: Potentials or states measured between a node and a reference (e.g., voltage, angular velocity, translational velocity, temperature, pressure). Across variables must be equal at any connected junction.",
          "**Through Variables**: Rates of flow or forces acting through a branch (e.g., current, torque, force, heat flow, mass flow). The sum of all through variables entering any junction must equal zero (Kirchhoff's Current Law equivalent)."
        ]
      },
      {
        title: "The Physical Domains",
        body: "V-Lab supports multiple coupled physical domains. Each domain specifies its unique Across and Through variables:",
        list: [
          "**Electrical**: Across = Voltage (V), Through = Current (I). Equations model electrical potential differences, charge conservation, and magnetic coupling.",
          "**Mechanical Rotational**: Across = Angular Velocity (rad/s), Through = Torque (N-m). Equations conserve angular momentum and model shaft dynamics.",
          "**Mechanical Translational**: Across = Linear Velocity (m/s), Through = Force (N). Equations follow Newton's laws to conserve linear momentum.",
          "**Thermal**: Across = Temperature (K), Through = Heat Flow (W). Equations govern heat conduction, convection, radiation, and thermal storage.",
          "**Magnetic**: Across = Magnetomotive Force (A-t), Through = Magnetic Flux (Wb). Reluctance circuits direct magnetic flux.",
          "**Fluid / Moist Air**: Across = Pressure (Pa), Temperature (K), Humidity Ratio (H); Through = Mass flow (kg/s), Heat flow (W), Water vapor flow (kg/s). Models pneumatics and moist air thermodynamics."
        ]
      },
      {
        title: "Acausal Connection Rules",
        body: "To build valid physical networks in V-Lab, you must adhere to these structural constraints:",
        list: [
          "**Reference Node (Ground)**: Every independent network must contain at least one reference node (e.g., Electrical Ground, Rotational/Translational Reference, Gas Reference, or Absolute Reference (MA)) representing the zero-potential benchmark.",
          "**Compatible Connections**: Connect ports of the same domain type. You cannot connect an electrical port directly to a mechanical port; instead, use a coupling block (such as an electromechanical converter) that implements cross-domain physics."
        ]
      }
    ],
    related: ["vlab-physics", "vlab-fluid-dynamics", "vlab-blocks-reference", "motor-models"]
  },
  "vlab-physics": {
    title: "V-Lab Physics Engine & Solver",
    category: "V-Lab (Plant Modeling)",
    description: "Understand the mathematical mechanics of the V-Lab solver, including Modified Nodal Analysis (MNA), BDF implicit integration, Newton-Raphson iterations, and zero-crossing detection.",
    content: "V-Lab simulates physical networks in real-time by assembling a coupled system of Differential Algebraic Equations (DAEs) in the general implicit form: f(x, dx/dt, t) = 0. The solver uses state-of-the-art numerical integration methods to guarantee stability, even when modeling stiff systems.",
    sections: [
      {
        title: "System Assembly: Modified Nodal Analysis (MNA)",
        body: "Before the simulation starts, the DAE Assembler processes the diagram topology (nodes and edges) to construct the mathematical system. Using Modified Nodal Analysis (MNA), it defines a state vector x containing node potentials (across variables) and selected branch flows (through variables). It then constructs a residual function vector f(x, dx/dt, t) representing:",
        list: [
          "**Conserving Equations**: Node-balance equations enforcing that the sum of through variables entering each junction is zero (sum of current, force, or mass flow is zero).",
          "**Constitutive Equations**: Element-specific equations (e.g., V - I * R = 0 for resistors, I - C * dV/dt = 0 for capacitors, or T - J * dw/dt - B * w = 0 for inertia)."
        ]
      },
      {
        title: "Implicit Numerical Integration (BDF-1 and BDF-2)",
        body: "To solve the differential equations, the solver approximates derivatives (dx/dt) using Backward Differentiation Formulas (BDF), converting the DAEs into algebraic equations at each time step:",
        list: [
          "**BDF-1 (Backward Euler)**: A first-order implicit method used for initialization and immediately after discontinuities. The derivative is approximated as: dx/dt = (x_k - x_{k-1}) / h (where h is the time step).",
          "**BDF-2**: A second-order implicit method used during smooth continuous execution to achieve high accuracy. It uses the current and two previous steps: dx/dt = a0 * x_k + a1 * x_{k-1} + a2 * x_{k-2}, where the coefficients depend on the current and previous time steps."
        ]
      },
      {
        title: "Implicit Non-linear Solver: Newton-Raphson with Damping",
        body: "At each step, the implicit algebraic equations are solved iteratively using the Newton-Raphson method:",
        code: "x^(k+1) = x^(k) - alpha * J^(-1) * f(x^(k))",
        list: [
          "**Numerical Jacobian (J)**: Computed at each iteration by perturbing the state vector: J_ij = df_i/dx_j.",
          "**Backtracking Line Search**: A damping factor alpha is dynamically scaled (halved) if a trial step increases the residual error. This prevents divergence when dealing with sharp non-linearities (such as switches or hard stops)."
        ]
      },
      {
        title: "Adaptive Step-Size & Zero-Crossing Event Detection",
        body: "To optimize execution speed and capture events accurately, the engine utilizes adaptive time-stepping and zero-crossing monitoring:",
        list: [
          "**Local Truncation Error (LTE)**: The solver compares the BDF-2 solution with a candidate BDF-1 step. If the estimated LTE exceeds the tolerance, the step is rejected, the time step h is halved, and the solver retries.",
          "**Zero-Crossing Detectors**: Blocks like switches, saturation, and hard stops define indicator functions (e.g., g(x) = v_ctrl - v_thresh). The solver checks if the indicator changes sign during a step.",
          "**Rewind & Restart**: If an event is triggered, the solver rewinds time to the exact fraction when g(x) = 0, processes the discrete transition (e.g., switch status), and restarts integration using BDF-1 to avoid step failure."
        ]
      }
    ],
    related: ["vlab-fundamentals", "vlab-blocks-reference", "vlab-fluid-dynamics", "motor-models"]
  },
  "vlab-fluid-dynamics": {
    title: "V-Lab Fluid Dynamics & Moist Air Flow",
    category: "V-Lab (Plant Modeling)",
    description: "Master the simulation of Gas networks and Moist Air (MA) flow systems. Learn the physical equations and how to model fluid chambers, pipes, and psychrometric properties.",
    content: "V-Lab provides dual domains for modeling fluid dynamics: the Gas (G) domain for pure gas networks (e.g., compressed air or pneumatics) and the Moist Air (MA) domain for modeling atmospheric mixtures of dry air and water vapor. These acausal domains solve conservation of mass, energy, and moisture species, enabling high-fidelity modeling of heating, ventilation, and thermodynamic systems (such as the Air Fryer preheat or convective heat transfer).",
    sections: [
      {
        title: "Gas Domain Physics",
        body: "The Gas domain uses Pressure (P in Pascals) and Temperature (T in Kelvin) as Across variables, and Mass Flow Rate (mdot in kg/s) as the Through variable. It assumes an ideal gas model:",
        code: "P = rho * R * T\nmdot = (P * D / (R * T)) * omega",
        list: [
          "**Gas Constant (R)**: Characterizes the fluid medium (default is 287 J/kg/K for air), configured in the Gas Properties block.",
          "**Conservation of Mass**: In a constant volume gas chamber, pressure changes depend on net mass flow: dP/dt = (R * T / V) * sum(mdot_in)."
        ]
      },
      {
        title: "Moist Air Domain Physics",
        body: "The Moist Air domain extends fluid simulation by tracking psychrometric mixtures. It tracks three across potentials at each node: Pressure (P), Temperature (T), and Humidity Ratio (H or phi, representing kg water vapor per kg dry air). The through flows are Mixture Mass Flow (mdot), Heat Flow (Q), and Water Vapor Flow (mdot_w):",
        list: [
          "**Mass Balance**: Total mixture mass and individual vapor mass are conserved at each node: sum(mdot) = 0 and sum(mdot_w) = 0.",
          "**Energy Balance**: Heat flow is coupled to fluid flow: Q_in - Q_out = C_chamber * dT/dt, where the thermal capacity depends on moist air density and volume: C_chamber = rho * Cp * V.",
          "**Moisture Tracking**: Trace moisture separator blocks remove vapor based on efficiency: mdot_w,rem = efficiency * mdot_w,in."
        ]
      },
      {
        title: "How to Use V-Lab Fluid/Flow Effectively",
        body: "To build stable and physically correct fluid networks, follow these design rules:",
        list: [
          "**1. Set Properties**: Place a Gas Properties (G) or Moist Air Properties (MA) block in each independent network. This block sets the standard atmospheric constants (e.g., standard pressure P_std = 101325 Pa, standard temperature T_std = 293.15 K).",
          "**2. Establish Potential Reference**: Every circuit must be connected to a reference node (Gas Reference or Absolute Reference (MA)). This acts as the mathematical reference (P = 0, T = 0, H = 0). Without a reference, the pressure values will float, leading to a singular Jacobian error.",
          "**3. Use Chambers for Storage**: Connect flow paths to a Constant Volume Chamber (ma_chamber or gas_chamber) to model storage volume. Chambers provide the necessary differential states (dP/dt and dT/dt) that buffer pressures; direct connection of two flow sources will cause simulation failure.",
          "**4. Handle Boundary Dynamics**: Use Controlled Reservoirs to set boundary pressures, and Convective Heat blocks to exchange thermal energy between the gas and pipe walls or external heating components (such as a heater element in an air fryer)."
        ]
      }
    ],
    related: ["vlab-fundamentals", "vlab-physics", "vlab-blocks-reference", "air-fryer-sysml"]
  },
  "vlab-blocks-reference": {
    title: "V-Lab Block Catalog & Mathematical Reference",
    category: "V-Lab (Plant Modeling)",
    description: "A complete catalog of all physical and control blocks in the V-Lab library, detailing their equations, variables, and parameters.",
    content: "This reference provides the physical governing equations and parameters for all blocks across the electrical, mechanical, thermal, magnetic, gas, moist air, and control libraries in V-Lab.",
    sections: [
      {
        title: "Electrical Domain Blocks",
        body: "Passive, active, and source blocks for electrical circuits. Connect these components by matching electrical terminal pins (V+ and V-):",
        list: [
          "**Resistor**: Governing equation: Vp - Vn = I * R. Models linear electrical resistance and energy dissipation. Use to limit current, model internal wire/winding losses, or form passive dividers.",
          "**Variable Resistor**: Governing equation: Vp - Vn = I * R_ctrl, where R_ctrl >= R_min to prevent numerical division by zero. Use to model physical temperature-sensitive thermistors, sensors, or sliding potentiometers modulated by a control signal.",
          "**Capacitor**: Governing equation: I = C * d(Vp - Vn)/dt. Models transient charge accumulation and electric field energy storage. Use to smooth DC bus ripples, filter high-frequency noise, or model thermal/leakage capacitance.",
          "**Inductor**: Governing equation: Vp - Vn = L * dI/dt. Models magnetic field energy storage and current inertia. Use in LC filters, switching regulator models, or to represent motor windings.",
          "**Memristor**: Governing equation: V = M(w) * I where M(w) = M0 + 10 * w and dw/dt = I. Models non-volatile memory and resistive state storage. Use to simulate resistive RAM (ReRAM) or neuromorphic synaptic components.",
          "**Transformer**: Governing equations: V2 = N * V1 and I1 = -N * I2. Models mutual magnetic coupling between two circuits. Use to step up/down AC voltages or provide galvanic isolation between high-power and low-power circuits.",
          "**Gyrator**: Governing equations: I1 = g * V2 and I2 = -g * V1. Converts an impedance to its dual (e.g., converts a capacitor into an inductor). Use to model active filters, transducer couplings, or non-reciprocal networks.",
          "**Op-Amp**: Governing equation: Vout = clamp(Gain * (Vp - Vn), -Vsat, Vsat). Models operational amplifier voltage amplification with saturation clipping. Use to build active summers, integrators, amplifiers, and buffers.",
          "**Switch**: Governing equation: V = I * R_sw, where R_sw = Ron if V_ctrl > Threshold else Roff. Models ideal gate-controlled switching. Use to build power converter topologies such as buck, boost, or inverter bridges.",
          "**DC Voltage Source**: Governing equation: Vp - Vn = V_const. Provides a stable voltage potential. Use to represent battery cells, DC buses, or stable reference voltages.",
          "**AC Voltage Source**: Governing equation: Vp - Vn = Vpk * sin(2*pi*f*t + pi/4) + I * R_int. Shifted by pi/4 to prevent discrete sampling phase aliasing. Use to represent grid mains or AC generator outputs with internal resistance.",
          "**Three-Phase Source**: Governing equations: Va = Vpk * sin(w*t + pi/4), Vb = Vpk * sin(w*t - 2*pi/3 + pi/4), Vc = Vpk * sin(w*t + 2*pi/3 + pi/4). Models balanced three-phase potential. Use to feed multi-phase rectifiers and three-phase motor drives."
        ]
      },
      {
        title: "Mechanical Domain Blocks",
        body: "Elements for modeling linear (translational) and rotational motion. Ensure torque/force variables are properly referenced:",
        list: [
          "**Inertia**: Governing equation: Torque = J * d(omega)/dt + B * omega. Models rotational mass and viscous damping. Use for motor rotors, gear shafts, and high-speed mechanical loads.",
          "**Mass**: Governing equation: Force = m * dv/dt + B * v. Models translational mass inertia and viscous resistance. Use for moving pistons, linear actuators, or vehicle dynamics.",
          "**Rotational Spring**: Governing equations: Torque = k * theta and dtheta/dt = omega_r - omega_c. Models compliance and torsional springback. Use for flexible drive shafts, couplings, or torsion bars.",
          "**Translational Spring**: Governing equations: Force = k * (x_r - x_c) and dx/dt = v_r - v_c. Models linear stiffness. Use for mechanical suspensions, structural spring mounts, or elastic bumpers.",
          "**Rotational Friction**: Governing equation: Torque = Ts * tanh(10 * omega) + Tv * omega. Models Coulomb and viscous friction characteristics. Use to simulate motor bearing drag or mechanical transmission losses.",
          "**Hard Stop (Rot & Trans)**: Restricts compliance range: Force/Torque spikes dramatically using spring-damping penalty equations when position exceeds [lower, upper] boundaries. Use to model physical cylinder ends, stop-pins, or mechanical constraints.",
          "**Gear Box**: Governing equations: omega2 = ratio * omega1 and Torque1 = ratio * Torque2. Models torque amplification and speed scaling. Use for mechanical gear reduction or matching motor output to loads.",
          "**Lever**: Governing equations: va = -(L2/L1) * vb and Fa = (L2/L1) * Fb. Models rigid force amplification arm. Use to model brake linkages, pivots, and mechanical hand-controls."
        ]
      },
      {
        title: "Magnetic & Thermal Domain Blocks",
        body: "Blocks coupling mechanical, electrical, magnetic, and thermal energy domains:",
        list: [
          "**Reluctance**: Governing equation: MMF = Phi * R. Represents magnetic resistance to flux propagation. Use for modeling core paths, transformer laminations, or variable-reluctance sensors.",
          "**Permanent Magnet**: Governing equation: MMF = Hc * L. Constant Magnetomotive Force source. Use for permanent magnet rotors (BLDC/PMSM) or magnetic latches.",
          "**Electromagnetic Converter**: Governing equations: V = N * dPhi/dt and MMF = N * I. Bridges electrical and magnetic networks. Use to model solenoids, relay coils, or stator winding flux coupling.",
          "**Reluctance Force**: Governing equations: MMF = Phi * R(x) and Force = 0.5 * Phi^2 * dR/dx. Converts magnetic flux into linear mechanical pull. Use to model relays, solenoids, or magnetic actuators.",
          "**Thermal Conduction / Convection**: Governing equations: Conduction Q = k * dT; Convection Q = h * A * dT. Models thermal energy flow. Use for heatsinks, enclosure losses, or convective air heating.",
          "**Thermal Radiation**: Governing equation: Q = eps * sigma * A * (Ta^4 - Tb^4). Models Stefan-Boltzmann radiative transfer. Use for high-temperature radiation modeling (e.g., microwave cavities, industrial ovens).",
          "**Thermal Mass**: Governing equation: Q = C * dT/dt. Models heat storage capacity. Use to represent heating elements, air chambers, or load items (e.g., food) in thermal networks."
        ]
      },
      {
        title: "Gas & Fluid Domain Blocks",
        body: "Governing physics for pneumatic, psychrometric, and air flow modeling:",
        list: [
          "**Constant Volume Chamber (MA & Gas)**: Gas: dP/dt = (R * T / V) * sum(mdot). Moist Air: models mixture mass, vapor mass, and energy balances (Q - Q_loss = C_chamber * dT/dt). Use for pressure tanks, manifold volumes, or oven cavities.",
          "**Flow Resistance & Restrictions**: Gas Flow: mdot = k * (Pa - Pb). Restriction: mdot = Cd * A * dP / sqrt(T). Models orifice restriction. Use for valves, exhaust ports, or flow control limits.",
          "**Gas Pipe**: Governing equation: Delta P = R_friction * mdot where R_friction = (f * L / D) * 10. Models pipeline friction pressure drop. Use for pneumatic routing.",
          "**Moisture Separator**: Governing equation: mdot_w,rem = efficiency * mdot_w,in. Removes water vapor. Use to model condensers or air dryers.",
          "**Rotational & Translational Converters**: Governing equations: mdot = (P * D / (R * T)) * omega and torque = D * (Pa - Ph). Converts fluid potential to mechanical motion. Use to simulate air motors or pneumatic pistons."
        ]
      },
      {
        title: "Physical Signals (PS) & Math Block Library",
        body: "Manipulate physical signals (causal control values) within the V-Lab diagram:",
        list: [
          "**PS Sources (Constant, Step, Ramp, Sine)**: Generates control signals: y = C, y = step(t), y = slope * (t - start), y = A * sin(2*pi*f*t). Use to specify setpoints, test steps, or disturbance profiles.",
          "**PS Math Operators**: Sum (y = u1 + u2), Subtract (y = u1 - u2), Gain (y = K * u), Product (y = u1 * u2), Divide (y = u1 / u2), Abs (y = |u|). Use for basic signal arithmetic.",
          "**PS Saturation / Dead Zone**: Saturation clips y inside [lower, upper]. Dead Zone outputs 0 if input lies inside [lower, upper]. Use to model physical limits or friction dead-bands.",
          "**PS Integrator / Transfer Function**: Integrator: dy/dt = u. Transfer Function: T * dy/dt + y = u. Models signal dynamics. Use for sensors, lag elements, or custom controller filters.",
          "**PS Lookup Table (1D)**: Interpolates y = f(x). Use for empirical data, motor maps, or calibration curves.",
          "**PS RMS Estimator**: Computes sliding RMS: y = sqrt(avg(u^2)). Use for measuring AC signal magnitudes."
        ]
      },
      {
        title: "Control Systems Library Blocks",
        body: "Common control and signal processing blocks used for closed-loop regulation:",
        list: [
          "**Discrete PI / PID Controllers**: Governing equation: u = Kp * e + Ki * integral(e) + Kd * deriv, with anti-windup clamping to prevent integrator saturation. Use to control motor speed, voltage outputs, or heating levels.",
          "**Low-Pass Filter (LPF)**: Discrete lag: y_k = alpha * u_k + (1 - alpha) * y_{k-1} where alpha = dt / (T + dt). Use to suppress high-frequency noise from sensors (e.g., ADCs).",
          "**Clarke & Park Transforms**: Clarke: abc to alpha-beta-0. Park: alpha-beta to dq. Use for Field-Oriented Control (FOC) motor vector control.",
          "**Motor Drives (DC & BLDC)**: Regulates motor phase currents using discrete PI speed loops and six-step Hall commutation. Use for low-voltage brushless drives.",
          "**PMSM Control & MTPA**: Speed-torque control for Permanent Magnet Synchronous Motors using Maximum Torque Per Ampere (MTPA) vector mapping. Use for high-efficiency electric vehicle powertrains.",
          "**Induction Motor (AC) Control**: Implements V/f scalar speed control or high-performance Direct Torque Control (DTC). Use for heavy industrial fan, pump, and conveyor controllers.",
          "**Observers**: Luenberger Observer: dx_hat/dt = A * x_hat + u + L * (y - C * x_hat) and Rotor Flux Observer. Use to estimate internal states that cannot be physically measured (e.g., rotor flux angle)."
        ]
      },
      {
        title: "Advanced Special Components & AI Blocks",
        body: "Pedagogical system demonstrators and online learning models:",
        list: [
          "**Washing Machine Drum & Fluid Slosh**: Basket inertia J = J_basket + (load_mass + unbalance) * radius^2. Sloshing torque: Torque = drag_coeff * (water_level/10) * omega^2. Use to simulate imbalance dynamics and vibration control.",
          "**Microwave Magnetron & Inverter**: Inverter: V_hv = V_ac * (v_out / v_in) * V_ctrl. Magnetron: Q_heat = V * I * efficiency. Use to model microwave high-voltage drive and heating output.",
          "**Microwave Cavity**: Governing equation: d(Temp)/dt = (Q_in - Q_loss) / (volume * Cp). Models oven cavity thermal characteristics. Use for cooking simulation.",
          "**LMS Adaptive Filter**: 2-tap online LMS filter: dw1/dt = lr * error * x, dw2/dt = lr * error * x_prev. Use for active noise cancellation or online system identification (requires dt < 2 / (R * lr) for stability).",
          "**Online Neural Neuron**: Single-neuron gradient descent: dw_i/dt = lr * error * (1 - y^2) * x_i. Use to teach backpropagation concepts and fit basic curves online.",
          "**Reinforcement Learning (Q-learning)**: Online Q-table agent: Q(s, a) += alpha * (reward + gamma * max_q(s') - Q(s, a)). Use for adaptive decision-making control under high plant model uncertainty (requires slower sampling times, e.g., 20ms to 100ms)."
        ]
      }
    ],
    related: ["vlab-fundamentals", "vlab-physics", "vlab-fluid-dynamics", "motor-models"]
  },
  "motor-models": {
    title: "Electric Machine Reference",
    category: "V-Lab (Plant Modeling)",
    description: "Detailed documentation for AC, DC, and BLDC machine models.",
    content: "ADIA includes high-fidelity machine models with parameterization for industrial applications.",
    sections: [
      {
        title: "Induction Motor (AC Motor)",
        body: "Models a 3-phase squirrel-cage motor. Inputs are A-B-C phases; output is a rotational mechanical port.",
        code: "Vs = Rs*Is + d(Psi_s)/dt"
      },
      {
        title: "BLDC Motor",
        body: "Models a brushless DC motor with trapezoidal back-EMF. Requires a commutation controller.",
        code: "Te = sum(E_i * I_i) / omega"
      }
    ],
    related: ["vfd-control", "vlab-physics"]
  },
  "vfd-control": {
    title: "VFD & Control Systems",
    category: "Control Systems",
    description: "Control strategies for motor drives and power converters.",
    content: "Design and test control loops for industrial drives using X-Bridges and V-Lab.",
    sections: [
      {
        title: "Field Oriented Control (FOC)",
        body: "Uses Clarke and Park transforms to control torque and flux independently.",
        list: [
          "**Clarke Transform**: abc to alpha-beta.",
          "**Park Transform**: alpha-beta to dq.",
          "**DQ Controllers**: PI regulators for current loops."
        ]
      }
    ],
    related: ["motor-models", "xbridges-ref"]
  },
  "xbridges-ref": {
    title: "X-Bridges Signal-Flow & Solver Reference",
    category: "Control Systems",
    description: "Causal signal-flow model design, continuous & discrete solver integration, and advanced control blocks library.",
    content: "X-Bridges is the primary signal-flow modeling and simulation environment in ADIA. Unlike V-Lab's physical, acausal networks (where energy flows dynamically based on conservation laws), X-Bridges is a causal (directed signal) block-diagram simulator. Each block receives explicit input values, computes equations, and drives output signals. The X-Bridges engine compiles diagrams by sorting blocks topologically and solves continuous and discrete equations in real time.",
    sections: [
      {
        title: "Module Architecture & Compilation",
        body: "Signals flow along directed links from output ports to input ports. Before simulating, the compiler flattens subsystems and constructs an execution list using Kahn's topological sorting algorithm:",
        list: [
          "**Topological Sorting**: Kahn's algorithm resolves dependent computations. Stateful blocks (e.g., Integrators, Unit Delays) act as boundaries to break algebraic dependencies.",
          "**Signal Type Mismatch (Warning)**: The compiler warns if incompatible ports (e.g., power vs. logical, matrix vs. continuous) are directly connected.",
          "**Algebraic Loops (Error)**: A cyclic dependency without a stateful block to break it prevents execution ordering. Introduce a Unit Delay or Integrator to break the loop.",
          "**Closed-Loop Co-Simulation**: Seamlessly integrates with Stateflow (via X-Bridges States running models during `during` steps) and V-Lab (driving actuators and reading plant sensors)."
        ]
      },
      {
        title: "Continuous and Discrete Solvers",
        body: "X-Bridges uses fixed-step integration methods to simulate continuous states, alongside a discrete state updating loop:",
        list: [
          "**Euler Integration (ODE1)**: A first-order explicit integration method: x(t + dt) = x(t) + dt * dx/dt. It provides high execution speed but can become unstable for stiff systems.",
          "**Runge-Kutta 4th Order (ODE4/RK4)**: A high-precision four-step numerical integrator. Computes four slope estimates (k1, k2, k3, k4) per time step to minimize local truncation error.",
          "**Discrete State Updating**: Non-continuous block states (like D flip-flops, registers, counters, delays) are evaluated once per simulation step inside the discrete execution loop."
        ]
      },
      {
        title: "Advanced Model Predictive Control (MPC) Solver",
        body: "The MPC Controller block uses an online solver to compute optimal control inputs in real-time:",
        code: "U(k+1) = Y(k) - (1/L) * (H * Y(k) + f)\nY(k) = U(k) + ((t-1)/(t_next)) * (U(k) - U(k-1))",
        list: [
          "**Predictive Optimization**: Formulates predictions using discrete state-space matrices (A, B, C, D) to compute output trajectories over prediction horizon Np and control horizon Nc.",
          "**Fast Gradient Method (FGM)**: Employs a real-time iterative optimization loop (typically 20 iterations) to solve the quadratic cost minimization problem with state weighting Q and input effort weighting R.",
          "**Physical Constraints**: Projects/clamps candidate inputs U at each iteration to satisfy physical safety bounds [u_min, u_max] configured in the block parameters."
        ]
      },
      {
        title: "Core Control & Modulation Blocks",
        body: "Industrial feedback loop and inverter modulation components:",
        list: [
          "**PI/PID Controllers**: Basic and advanced controllers with anti-windup clamping to prevent integrator saturation, and derivative filtering.",
          "**Space Vector PWM (SVPWM)**: Integrates SVPWM Core, Sector Selector, and Switching Time Calculators to generate optimized duty cycles and gate drive signals.",
          "**Reference Frame Transforms**: Clarke (abc to alpha-beta), Park (alpha-beta to dq), and their inverse transforms to map three-phase physical variables to rotating d-q coordinates."
        ]
      },
      {
        title: "Motor Control & Torque Optimization Blocks",
        body: "High-performance motor drive and efficiency management algorithms:",
        list: [
          "**Induction Motor Scalar & FOC**: Implements speed/current regulation and Field-Oriented Control (FOC) for three-phase AC induction motors.",
          "**Torque Maximization (MTPA)**: Maximum Torque Per Ampere speed-torque trajectory managers to maximize stator current efficiency.",
          "**Field Weakening**: Decreases flux current (id) at high speeds to keep stator voltage within inverter voltage bounds (vMax).",
          "**Flux & Position Observers**: Luenberger flux observers and rotor position/speed estimators."
        ]
      },
      {
        title: "Machine Learning & Adaptive Blocks",
        body: "Pedagogical and intelligent learning systems with online adaptation. The choice of sampling rate (dt) is critical to prevent weight divergence or poor convergence:",
        list: [
          "**LMS Adaptive Filter**: 2-tap Least Mean Squares filter that updates weights dynamically online. Suggested sampling rate: 100 Hz to 1 kHz (dt = 1ms to 10ms).",
          "**Neural Neuron Learner**: Online gradient descent neuron using tanh activation and backpropagation to learn weights and bias. Suggested sampling rate: 50 Hz to 500 Hz (dt = 2ms to 20ms).",
          "**RL Q-Learning Controller**: Discrete Q-table update agent with epsilon-greedy exploration. Suggested sampling rate: 10 Hz to 50 Hz (dt = 20ms to 100ms). Too high of a frequency results in poor credit assignment."
        ]
      },
      {
        title: "Core Math & Sequential Library",
        body: "Standard signal-routing and mathematical components:",
        list: [
          "**Bitwise & Logic Gates**: Boolean (AND, OR, NOT, NAND, NOR, XOR) and Bitwise operations.",
          "**Reductions & Linear Algebra**: Matrix multiplication, matrix transpose, determinant, matrix inversion, and vector/array reductions (Sum, Mean, Max).",
          "**Sequential Elements**: D Flip-Flop, JK Flip-Flop, Counters, Registers, and unit delays."
        ]
      }
    ],
    related: ["vfd-control", "code-generation", "motor-models"]
  },
  "doe-discovery": {
    title: "DOE & AI Model Discovery",
    category: "DOE & Analysis",
    description: "Advanced system identification and statistical analysis.",
    content: "The DOE module automates the process of characterizing complex systems.",
    image: adia_doe_analysis,
    sections: [
      {
        title: "GMDH Neural Networks",
        body: "Group Method of Data Handling for inductive model generation.",
        code: "y = a + b*x1 + c*x2 + d*x1*x2 + ..."
      },
      {
        title: "Sampling Methods",
        body: "Full Factorial, Latin Hypercube (LHS), and Taguchi designs."
      }
    ],
    related: ["getting-started", "reporting"]
  },
  "code-generation": {
    title: "Embedded C Code Generation",
    category: "Software Engineering",
    description: "Export validated state-machine designs to deterministic C99 for MCU integration.",
    content: "ADIA generates C99 from one validated semantic model. Generated reports identify exactly which structural, semantic, host, differential, embedded, and target-hardware checks were run; they do not claim MISRA compliance or safety certification.",
    sections: [
      {
        title: "Model Migration & Semantic Validation",
        body: "Older project schemas are migrated before analysis, simulation, or code generation. Migration warnings describe deterministic compatibility choices; ambiguous OR/AND decomposition, invalid hierarchy, unsupported expressions, and other errors block generation instead of being guessed."
      },
      {
        title: "Runtime Integration Contract",
        body: "Integrate the generated lifecycle in the fixed scheduler order `SM_ReadInputs(&instance)` -> `SM_Step(&instance, delta_ms)` -> `SM_WriteOutputs(&instance)`. Only variables explicitly connected in the HIL Signal Mapper are read from or written to MCAL channels."
      },
      {
        title: "Verification Evidence Labels",
        body: "Structural PASS means the model and generated structure passed automated checks. Semantic PASS means generation consumed validated IR. Host compilation/runtime and differential PASS apply only when those gates were run. Embedded compilation NOT RUN and Target hardware PENDING mean those activities still belong to the MCU integration and validation team."
      }
    ],
    related: ["getting-started", "industrial-automation"]
  },
  "industrial-automation": {
    title: "Factory I/O & Automation",
    category: "Industrial Integration",
    description: "Connecting virtual models to real-time industrial 3D simulators.",
    content: "Synchronize ADIA variables with Factory I/O for full system HIL/SIL testing.",
    sections: [
      {
        title: "Automation Gateway",
        body: "Handles TCP/UDP communication between ADIA and external simulations."
      }
    ],
    related: ["getting-started", "code-generation"]
  },
  "learning-labs": {
    title: "Tutorials & Examples",
    category: "Tutorials",
    description: "Hands-on projects to master the ADIA suite.",
    content: "Detailed walkthroughs of pre-built learning labs.",
    sections: [
      {
        title: "Air Fryer System",
        body: "Coupled thermal, electrical, and pneumatic modeling."
      },
      {
        title: "VFD Drive Control",
        body: "Implementing FOC for an induction motor."
      },
      {
        title: "Differential Drive LiDAR Robot Vacuum Twin",
        body: "A complete, modular co-simulation of a differential-drive robot vacuum. The system is split into 9 separate connected blocks (similar to Simulink): \n1. **Robot Vacuum Navigation**: Selects targets, executes waypoints, and reacts to obstacles.\n2. **Inverse Kinematics**: Translates linear/angular reference velocities to wheel speed references.\n3. **Wheel Speed PI**: Implements closed-loop speed control for left/right motors.\n4. **Robot Vacuum Motor**: Simulates the DC motor armature winding and rotor inertia (instantiated twice: Left and Right).\n5. **Robot Dynamics (Plant)**: Computes 3DoF continuous chassis kinematics: dX/dt = V * cos(θ), dY/dt = V * sin(θ), dθ/dt = ω.\n6. **Simulation Environment (Canvas)**: Models the physical room boundary walls, 3 circle obstacles, and 2 box obstacles, calculates mathematically precise 8-beam LiDAR raycasting, checks for physical collisions (within 15cm radius), and renders the live visual digital twin.\n7. **Odometry**: Tracks encoder counts to estimate raw robot coordinates.\n8. **Sensor Fusion**: Implements a complementary filter to correct odometry drift with true references.\n9. **SLAM Map**: Integrates LiDAR range vectors to build a 2D occupancy grid."
      }
    ],
    related: ["vlab-fundamentals", "vfd-control", "robot-vacuum-digital-twin"]
  },
  "robot-vacuum-digital-twin": {
    title: "LiDAR Robot Vacuum Digital Twin Reference",
    category: "Tutorials",
    description: "Comprehensive subsystem reference and mathematical models for the modular differential-drive robot vacuum.",
    content: "The LiDAR Robot Vacuum Digital Twin is a modular signal-flow co-simulation demonstrating feedback control, motor dynamics, dead reckoning, sensor fusion, and occupancy grid SLAM mapping.",
    sections: [
      {
        title: "1. Block Diagram Architecture",
        body: "Unlike standard black-box simulations, the digital twin is fully transparent, consisting of separate blocks connected in a feedback loop:\n- **Navigation Planner** -> **Inverse Kinematics** -> **Wheel speed PID** -> **Left/Right Motor Plants** -> **Robot Dynamics (Plant)** -> **Simulation Environment (Canvas)** -> **Encoder Odometry** -> **Sensor Fusion Filter** -> **SLAM Map Builder**."
      },
      {
        title: "2. Physical Dynamics & Motors",
        body: "The **Robot Dynamics (Plant)** block solves continuous equations representing 3DoF chassis kinematics: dX/dt = V * cos(θ), dY/dt = V * sin(θ), dθ/dt = ω. The motor blocks simulate DC winding inductance L_m and resistance R_m: di/dt = (V_in - R_m * i - K_e * ω_wheel) / L_m, and rotor acceleration: dω/dt = (K_t * i - damping * ω) / J."
      },
      {
        title: "3. Spatial Simulation Environment",
        body: "The **Simulation Environment (Canvas)** block models the physical space containing 3 circle obstacles and 2 box obstacles within a 5.7m x 5.7m room. It performs mathematically rigorous 2D intersection calculations to simulate 8 LiDAR distance sensors raycasting outward from the robot chassis. It also checks if the robot's physical boundary (15cm radius) intersects with any walls or obstacles, generating a binary `collision` signal and incrementing the total collision count."
      },
      {
        title: "4. Odometry, Fusion & SLAM",
        body: "The **Odometry** block integrates encoder pulses, which simulates slippage and drift. The **Sensor Fusion** block applies a complementary filter (gain = 0.06) to drift-correct the estimate towards the true position. The **SLAM** block projects the 8 raycasted LiDAR ranges from the estimated pose to update a 30x30 occupancy probability grid."
      }
    ],
    related: ["learning-labs", "xbridges-ref"]
  },
  "state-machine-fundamentals": {
    title: "State Machine (Stateflow) Fundamentals",
    category: "Stateflow (State Machine)",
    description: "Learn the core elements of hierarchical state machines, entry/during/exit actions, and execution rules in ADIA.",
    content: "A State Machine (Stateflow) is used to design reactive systems that transition between discrete states (or modes of operation) based on input events or logical conditions. In ADIA, state machine logic coordinates control algorithms, manages safety limits, and schedules sequential processes.",
    image: state_machine_guide_diagram,
    sections: [
      {
        title: "Anatomy of a State",
        body: "States define a specific behavior or mode of the system (e.g., Idle, Running, Fault). While a state is active, it runs its associated actions. States can have three types of action blocks:",
        list: [
          "**Entry Action (entry: <statement>;)**: Executed once when the state becomes active.",
          "**During Action (during: <statement>;)**: Executed on every simulation tick while the state remains active.",
          "**Exit Action (exit: <statement>;)**: Executed once when the state is transitioned out of."
        ]
      },
      {
        title: "Hierarchical & Parallel States",
        body: "Every layer has explicit decomposition. OR layers keep exactly one active child; AND layers activate and schedule every orthogonal region in deterministic order:",
        list: [
          "**Hierarchical (Nested) States**: A parent state can enclose sub-states. Entering a parent state enters its autostart sub-state. If an outer transition fires, all child states exit recursively.",
          "**Parallel (Orthogonal) States**: Multiple states can be active simultaneously in different regions, allowing parallel execution of concurrent tasks."
        ]
      },
      {
        title: "Connective & History Junctions",
        body: "Junctions are decision nodes that route transitions dynamically without creating persistent states:",
        list: [
          "**Connective Junction**: A node to branch paths. It evaluates conditions and executes target actions instantaneously.",
          "**Shallow History Junction (H)**: Remembers the last active child state at its current hierarchical level when the parent state is exited, resuming it upon re-entry.",
          "**Deep History Junction (H*)**: Recursively remembers and restores the active states at all descendant levels of the hierarchy."
        ]
      },
      {
        title: "Terminal State Semantics",
        body: "A terminal state is quiescent: after entry it remains active, does not execute `during` or internal transitions, and never resets the chart implicitly. In an AND layer, a terminal region remains quiescent while sibling regions continue. Call `SM_Reset` explicitly when the application requires a new run."
      },
      {
        title: "State Machine Variables",
        body: "Variables store the state machine's context. They can be defined as:",
        list: [
          "**Inputs (Read-Only)**: Linked to X-Bridges or V-Lab sensors to control transition logic.",
          "**Outputs (Write-Only)**: Drive physical outputs (actuators, HIL pins, display values).",
          "**Local (Read/Write)**: Internal variables for counters, timers, and intermediate calculations."
        ]
      }
    ],
    related: ["state-machine-transitions", "state-machine-simulation", "code-generation"]
  },
  "state-machine-transitions": {
    title: "Transitions & Trigger Rules",
    category: "Stateflow (State Machine)",
    description: "Master transition guards, temporal operators, execution priorities, and internal state loops.",
    content: "Transitions are directed lines connecting a source state to a target state (or junction). They define the path of execution through the model when triggers or conditions are met.",
    sections: [
      {
        title: "Transition Labels Syntax",
        body: "Transition labels format: `Trigger [Condition] / Action`. All parts are optional. The simulator parses these segments as follows:",
        list: [
          "**Trigger**: An event or temporal logic expression (e.g., `after(50)`).",
          "**Condition (Guard)**: A Boolean expression enclosed in brackets (e.g., `[temperature > 200]`). Must evaluate to true for the transition to fire.",
          "**Action**: Action code executed when the transition fires, written after a slash (e.g., `/ fanSpeed = 100;`)."
        ]
      },
      {
        title: "Temporal Logic: after(N)",
        body: "Temporal triggers track state duration in simulation ticks. The operator `after(N)` returns true if the source state has been active for at least `N` ticks (where `1 tick = tickMs` milliseconds). This is ideal for timeout limits, delays, and state scheduling.",
        code: "after(50) [btnPressed == true] / counter = 0;"
      },
      {
        title: "Transition Execution Order",
        body: "Multiple transitions can depart from a single state. To ensure deterministic behavior, each transition has a unique execution order (priority, e.g., 1, 2, 3). The simulator evaluates transitions in order, and the first valid transition fires, ignoring the rest.",
        list: [
          "**Priority 1**: Evaluated first. Usually reserved for safety overrides or high-priority interrupts.",
          "**Priority 2+**: Evaluated sequentially if preceding conditions are false."
        ]
      },
      {
        title: "Internal Transitions",
        body: "Internal transitions are evaluated while remaining inside a state. They execute actions without triggers, entry/exit executions, or changing the active state. Formatted as `[Condition] / Action` in the internal transitions property of a state.",
        code: "[tickCount > 10] / tickCount = 0; logStatus();"
      }
    ],
    related: ["state-machine-fundamentals", "state-machine-simulation", "vfd-control"]
  },
  "state-machine-simulation": {
    title: "Simulator Execution & Solvers",
    category: "Stateflow (State Machine)",
    description: "Learn how the simulation loop evaluates state machine actions, updates variables, and integrates with other domains.",
    content: "The ADIA State Machine Simulator runs on a deterministic fixed-step execution loop. In each step (tick), the simulator evaluates active states, processes incoming and outgoing signals, and updates the physical plant.",
    image: state_machine_simulation_diagram,
    sections: [
      {
        title: "The Step Execution Loop",
        body: "At each simulation step (tick), the engine performs these operations in order:",
        list: [
          "**1. Synchronize Inputs**: Read the latest variables from Factory I/O, V-Lab, or X-Bridges.",
          "**2. Increment State Timers**: Add 1 tick to the active timers of all currently active states.",
          "**3. Evaluate Transitions**: Check outgoing transitions from active states in priority order. If a transition fires: (a) Execute source state's `exit` action, (b) Execute transition action, (c) Enter target state and execute its `entry` action.",
          "**4. Execute During Actions**: If no transitions fire, execute the `during` action of the active state.",
          "**5. Process Internal Transitions**: Check and execute any valid internal state transitions.",
          "**6. Synchronize Outputs**: Write updated variable values back to drivers, X-Bridges, and V-Lab."
        ]
      },
      {
        title: "Generated MCU Scheduler",
        body: "The generated MCU contract is explicit and matches simulation boundaries: call `SM_ReadInputs`, then `SM_Step`, then `SM_WriteOutputs`. Do not call the combined synchronization helper around `SM_Step`, because outputs must be committed only after the step succeeds."
      },
      {
        title: "Safe States & Error Catching",
        body: "If a runtime error occurs during action evaluation (such as a variable reference error or mathematical division by zero), the simulator immediately logs an error message. If a state has the `isSafeState` flag enabled, the simulation automatically redirects to this state to halt the process safely."
      },
      {
        title: "X-Bridges State Integration",
        body: "A state in ADIA can be designated as an **X-Bridges State** (`isXBridges: true`). When active, this state executes a local block diagram model (a signal flow model) during its `during` phase, enabling hybrid co-simulation of state logic and feedback loop controls."
      },
      {
        title: "Hardware-in-the-Loop (HIL) Binding",
        body: "Variables reach hardware only through explicit HIL Signal Mapper entries. Names such as `sensor_x`, `x`, or `led_out` do not create implicit driver access. Read mappings sample physical inputs before the step; write mappings commit outputs after a successful step."
      }
    ],
    related: ["state-machine-fundamentals", "state-machine-transitions", "learning-labs"]
  },
  "state-machine-tutorial": {
    title: "Tutorial: Building a Timer Switch",
    category: "Stateflow (State Machine)",
    description: "A step-by-step tutorial to create a smart push-button light switch that turns off automatically after 5 seconds.",
    content: "This hands-on guide will take you through creating a simple state machine with variables, transitions, actions, and temporal logic.",
    sections: [
      {
        title: "Step 1: Set Up Variables",
        body: "Open the Variables workspace on the left and create the following variables:",
        list: [
          "**btnPress** (Type: `bool`, Initial: `false`) - Simulation button input.",
          "**lightMode** (Type: `int`, Initial: `0`) - Output mode (0 = Off, 1 = On).",
          "**counter** (Type: `int`, Initial: `0`) - Internal tick counter."
        ]
      },
      {
        title: "Step 2: Create the States",
        body: "Drag two states onto the workspace:",
        list: [
          "**State 1**: Name it `Off`. Set its actions:\n`entry: lightMode = 0;`",
          "**State 2**: Name it `On`. Set its actions:\n`entry: lightMode = 1;`"
        ]
      },
      {
        title: "Step 3: Add Transitions & Conditions",
        body: "Draw transitions between the states and configure their triggers:",
        list: [
          "**Off to On Transition**: Draw a line from `Off` to `On`. Double-click and set condition: `[btnPress == true]`",
          "**On to Off Transition**: Draw a line from `On` to `Off`. Double-click and set condition: `after(50)` (Assuming tick rate is 100ms, this creates a 5-second delay)."
        ]
      },
      {
        title: "Step 4: Simulate and Monitor",
        body: "Click the **Start** button in the top toolbar to run the simulator. In the Variables panel, manually toggle `btnPress` to `true`. Observe the state transition to `On`. After 50 ticks (5 seconds), watch the state return to `Off` automatically."
      }
    ],
    related: ["state-machine-fundamentals", "state-machine-transitions", "state-machine-simulation"]
  },
  "hil-fundamentals": {
    title: "Hardware-in-the-Loop (HIL) Fundamentals",
    category: "Hardware-in-the-Loop (HIL)",
    description: "Learn the core concepts of HIL testing in ADIA, including target microcontrollers, serial communication, and peripheral drivers.",
    content: "Hardware-in-the-Loop (HIL) simulation is a technique used in the development and test of complex real-time embedded systems. By connecting the ADIA design suite directly to a physical microcontroller target, you can validate your state machines and control logic on real hardware pins under real-time constraints.",
    image: hil_architecture_diagram,
    sections: [
      {
        title: "What is HIL Testing?",
        body: "Instead of running your state machine entirely in a virtual computer simulation, HIL runs the compiled state machine directly on physical hardware (e.g. a microcontroller) while the PC monitors inputs, outputs, and telemetry. This provides several critical advantages:",
        list: [
          "**Real-Time Execution**: Verifies that the logic executes within the MCU's hardware clock cycles.",
          "**Electrical I/O Validation**: Tests the actual physical interfaces (voltage levels, pull-ups/pull-downs, ADC noise).",
          "**Safety Critical Logic**: Validates failure handling and emergency states on real hardware before final deployment."
        ]
      },
      {
        title: "Supported MCU Targets",
        body: "ADIA includes built-in hardware abstraction layers (HAL) and drivers for several popular MCU architectures:",
        list: [
          "**STM32F4 / STM32F1**: ARM Cortex-M microcontrollers. Standard for automotive and industrial safety-critical applications.",
          "**Arduino Uno / Mega**: Simple 8-bit AVR microcontrollers. Excellent for rapid prototyping and educational labs.",
          "**ESP32**: Dual-core Tensilica MCUs with integrated Wi-Fi and Bluetooth, ideal for IoT and wireless control designs.",
          "**Generic**: Standard ANSI C abstraction suitable for integration with any custom MCU SDK."
        ]
      },
      {
        title: "HIL Co-Simulation Loop",
        body: "In an ADIA HIL setup, the PC and MCU operate in a tight, synchronized serial communication loop (typically UART over USB). The PC streams virtual inputs and override actions, while the MCU runs the state machine steps, drives its physical pins, and sends back real-time pin telemetry."
      }
    ],
    related: ["state-machine-simulation", "hil-configuration", "hil-dashboard"]
  },
  "hil-configuration": {
    title: "Configuring HIL & Signal Mapping",
    category: "Hardware-in-the-Loop (HIL)",
    description: "Step-by-step instructions to configure hardware driver channels and map variables to physical microcontroller pins.",
    content: "To establish a HIL connection, you must define the hardware channels (pins) available on your target MCU, and map them to variables inside the ADIA State Machine.",
    sections: [
      {
        title: "Defining Driver Channels",
        body: "In the HIL Workspace Configuration, define each physical channel by specifying:",
        list: [
          "**Peripheral Type**: Choose from GPIO (Digital Input/Output), ADC (Analog Input), DAC (Analog Output), or PWM (Pulse-Width Modulated Output).",
          "**Pin ID**: Specify the physical pin identifier relative to the target MCU (e.g., `A0`, `D13`, `PA5`, `GPIO25`).",
          "**Direction**: `In` (sensor read, input to state machine) or `Out` (actuator drive, output from state machine).",
          "**Data Type**: Select the C variable type (e.g., `bool`, `uint16_t`, `float`)."
        ]
      },
      {
        title: "Mapping Signals to Variables",
        body: "Use the **Signal Mapper** to create explicit bindings between defined Driver Channels and State Machine Variables. Unmapped variables remain internal model data, regardless of their names. A mapping operates in one of two directions:",
        list: [
          "**Read Binding (Hardware -> SM)**: The physical MCU reads a pin (e.g., ADC sensor) and automatically writes the value to a State Machine input variable before the step ticks.",
          "**Write Binding (SM -> Hardware)**: The State Machine writes a value to an output variable, which the MCU automatically translates to a physical pin output (e.g., PWM signal)."
        ]
      },
      {
        title: "Signal Scaling & Conversion Expressions",
        body: "Physical sensors and logical state variables often use different scales. ADIA supports custom math conversion expressions to scale values inline. For example, to map a 10-bit Arduino ADC read (0-1023) to a temperature variable in Celsius (0-100°C), you can write: `x * (5.0 / 1023.0) * 20.0` where `x` represents the raw hardware read."
      }
    ],
    related: ["state-machine-fundamentals", "hil-fundamentals", "hil-code-generation"]
  },
  "hil-dashboard": {
    title: "Live Control, Telemetry & Fault Injection",
    category: "Hardware-in-the-Loop (HIL)",
    description: "Monitor live MCU signals, analyze real-time plots, and inject faults to validate system robustness.",
    content: "Once your MCU is programmed and connected, the HIL Dashboard acts as the mission control center to monitor execution, stream telemetry, and stress-test the system.",
    sections: [
      {
        title: "Connecting and Telemetry Streaming",
        body: "Select your target serial COM port and baud rate (e.g. `115200`), and click **Connect**. Once established, the dashboard will display live gauges and a rolling chart plotting all mapped analog and digital channels in real-time."
      },
      {
        title: "Fault Injection Engine",
        body: "To verify that your safety logic works under hardware failure conditions, you can inject faults directly from the dashboard into any active input channel without modifying your physical wiring:",
        list: [
          "**Manual Override**: Force an input variable to a fixed static value, ignoring the actual physical sensor reading.",
          "**Noise Injection**: Add random Gaussian or uniform noise to a sensor channel to test filter stability (e.g., testing PID responsiveness to noisy thermocouple readings).",
          "**Clamping**: Cap the channel values within a specific range to simulate sensor saturation or a degraded physical component."
        ]
      },
      {
        title: "Safety Verification Example",
        body: "To test a heating chamber's safety interlock: while running the system, use Fault Injection to force the `temperature` input to a dangerous value (e.g., 250°C). Verify that the state machine immediately transitions to the `Fault` state and shuts off the physical heater PWM pin."
      }
    ],
    related: ["state-machine-simulation", "hil-fundamentals", "hil-configuration"]
  },
  "hil-code-generation": {
    title: "Embedded C Driver Generation",
    category: "Hardware-in-the-Loop (HIL)",
    description: "Export and deploy deterministic HIL C99 integration code to run the state machine directly on target microcontrollers.",
    content: "ADIA generates deterministic C99 and target integration scaffolding from validated HIL mappings. The output is intended for embedded-engineer review and target-toolchain validation; no MISRA or safety-certification claim is implied.",
    sections: [
      {
        title: "Generated File Structure",
        body: "When you click **Generate HIL Code**, ADIA creates a set of C/C++ files designed to be compiled in your target MCU IDE (such as STM32CubeIDE, Arduino IDE, or VS Code):",
        list: [
          "**hal_config.h**: Defines peripheral pin names, system clock speed, and UART baud rates.",
          "**hal_drivers.h / .c**: Implements hardware-specific pin configuration and serial communication handlers.",
          "**hil_interface.h / .c**: Manages telemetry packets, serial override commands, and scales/maps signals to the state machine instance variables.",
          "**main_hil.c**: Implements the main real-time loop executing the tick scheduler."
        ]
      },
      {
        title: "The HIL Main Loop Protocol",
        body: "The generated `main_hil.c` runs a deterministic scheduling loop:",
        code: "void main(void) {\n    HAL_Drivers_Init();\n    SM_Init(&sm_instance);\n    while (1) {\n        HIL_Receive_Poll();\n        if (SM_ReadInputs(&sm_instance) == SM_ERR_NONE) {\n            if (SM_Step(&sm_instance, 10U) == SM_ERR_NONE) {\n                (void)SM_WriteOutputs(&sm_instance);\n            }\n        }\n        HIL_SendTelemetry(&sm_instance);\n        HAL_Delay_Ms(10U);\n    }\n}"
      },
      {
        title: "Deployment Workflow",
        body: "1. Click **Generate HIL Code** and download the ZIP package.\n2. Copy the files into your MCU firmware project folder.\n3. Build the firmware using your target compiler.\n4. Flash the binary to the microcontroller.\n5. Keep the board connected via USB, return to the ADIA HIL Dashboard, and click **Connect** to begin testing."
      }
    ],
    related: ["code-generation", "hil-fundamentals", "hil-dashboard"]
  }
};
