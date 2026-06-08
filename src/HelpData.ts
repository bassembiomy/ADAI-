export const adia_architecture_diagram = new URL('./assets/adia_architecture_diagram_1778580699379.png', import.meta.url).href;
export const adia_vlab_simulation = new URL('./assets/adia_vlab_simulation_1778580716413.png', import.meta.url).href;
export const adia_doe_analysis = new URL('./assets/adia_doe_analysis_1778580732166.png', import.meta.url).href;
export const air_fryer_sysml = new URL('./assets/air_fryer_sysml_diagram_1778581647915.png', import.meta.url).href;

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
    description: "Structural design using Block Definition Diagrams (BDD) and Internal Block Diagrams (IBD).",
    content: "The Architecture module follows SysML standards to define system hierarchy and internal connectivity.",
    image: adia_architecture_diagram,
    sections: [
      {
        title: "Block Definition Diagram (BDD)",
        body: "Defines 'What' the system is. Use blocks to represent components and relationships like Composition (Part-Whole) or Generalization (Inheritance).",
        list: [
          "**Block**: The primary structural unit.",
          "**Composition**: Strong whole-part relationship.",
          "**Generalization**: Inheritance relationship."
        ]
      },
      {
        title: "Internal Block Diagram (IBD)",
        body: "Defines 'How' it is connected internally. Use Ports and Connectors to model flow between parts.",
        list: [
          "**Proxy Port**: Typed interaction point.",
          "**Full Port**: Physical interaction point.",
          "**Connector**: Link between ports."
        ]
      },
      {
        title: "Requirement Diagram",
        body: "Defines system constraints and performance targets. Use the 'Satisfy' relationship to link requirements to the blocks that fulfill them.",
        list: [
          "**Requirement**: A text-based constraint with a unique ID.",
          "**Satisfy**: A relationship from a block to a requirement.",
          "**Verify**: A relationship from a test case to a requirement."
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
    description: "Multi-domain physical simulation using an acausal network approach.",
    content: "V-Lab solves Differential Algebraic Equations (DAE) representing physical systems. Energy is conserved at every connection point.",
    image: adia_vlab_simulation,
    sections: [
      {
        title: "Domains of Operation",
        body: "V-Lab supports multiple physical domains that can be coupled in a single simulation.",
        list: [
          "**Electrical**: RLC circuits, machines, power electronics.",
          "**Mechanical**: Rotational and translational dynamics.",
          "**Thermal**: Heat transfer and cooling.",
          "**Magnetic**: Magnetic circuits and actuators.",
          "**Fluid/Moist Air**: Pneumatics and psychrometrics."
        ]
      }
    ],
    related: ["vlab-physics", "motor-models"]
  },
  "vlab-physics": {
    title: "V-Lab Physics Engine",
    category: "V-Lab (Plant Modeling)",
    description: "Advanced simulation concepts and domain-specific modeling.",
    content: "The V-Lab engine employs a modified nodal analysis (MNA) to solve for across (voltage/velocity) and through (current/force) variables.",
    sections: [
      {
        title: "Electrical Domain",
        body: "Key blocks: Resistors, Capacitors, Transformers, Op-Amps, 3-Phase Sources.",
        code: "V = I * R\nI = C * dV/dt"
      },
      {
        title: "Mechanical Dynamics",
        body: "Key blocks: Inertia, Mass, Spring, Damper, Friction, Gearbox.",
        code: "Torque = J * d(omega)/dt\nForce = m * dv/dt"
      }
    ],
    related: ["vlab-fundamentals", "motor-models"]
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
    title: "X-Bridges Block Reference",
    category: "Control Systems",
    description: "Signal-flow block library for logic and math.",
    content: "X-Bridges is the primary environment for control logic and signal processing.",
    sections: [
      {
        title: "Logic Gates",
        body: "Standard boolean logic: AND, OR, NOT, XOR, NAND, NOR.",
        code: "Out = A & B"
      },
      {
        title: "Sequential Logic",
        body: "Stateful elements: D-FlipFlop, JK-FlipFlop, Registers, Counters.",
        code: "Q(t+1) = D"
      },
      {
        title: "Arithmetic & Math",
        body: "Gain, Sum, Product, Integrator, Transfer Function, Lookup Tables.",
        code: "Y = G * U"
      }
    ],
    related: ["vfd-control", "code-generation"]
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
    title: "C-Code Generation (MISRA)",
    category: "Software Engineering",
    description: "Export verified designs to production-ready embedded C code.",
    content: "Generate MISRA-C:2012 compliant code from Stateflow and X-Bridges models.",
    sections: [
      {
        title: "Compliance Patterns",
        body: "Strict adherence to safety standards, including deterministic execution and memory safety."
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
      }
    ],
    related: ["vlab-fundamentals", "vfd-control"]
  }
};
