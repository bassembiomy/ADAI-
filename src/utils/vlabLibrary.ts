export interface VLabPort {
  id: string;
  pos: 'left' | 'right' | 'top' | 'bottom';
  label?: string;
  domain?: string;
}

export interface VLabBlock {
  id: string;
  name: string;
  color: string;
  icon: string;
  params: Record<string, { value: number | string; unit: string; label: string }>;
  category?: string;
  ports: VLabPort[];
  equation?: string;
  description?: string;
}

export interface VLabDomain {
  type: string;
  blocks: VLabBlock[];
}

export const VLAB_LIBRARY: VLabDomain[] = [
  {
    "type": "Electrical",
    "blocks": [
      {
        "id": "resistor",
        "name": "Resistor",
        "color": "#3b82f6",
        "icon": "resistor",
        "category": "Passive",
        "params": {
          "R": {
            "value": 100,
            "unit": "Ω",
            "label": "Resistance"
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "left",
            "label": "+"
          },
          {
            "id": "n",
            "pos": "right",
            "label": "-"
          }
        ],
        "equation": "V = I * R",
        "description": "Linear resistor obeying Ohm's law relating terminal voltage drop to electric current."
      },
      {
        "id": "variable_resistor",
        "name": "Variable Resistor",
        "color": "#3b82f6",
        "icon": "variable_resistor",
        "category": "Passive",
        "params": {
          "R_min": {
            "value": 0,
            "unit": "Ω",
            "label": "Min Resistance"
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "left",
            "label": "+"
          },
          {
            "id": "n",
            "pos": "right",
            "label": "-"
          },
          {
            "id": "r",
            "pos": "top",
            "label": "R"
          }
        ],
        "equation": "V = I * R(t)",
        "description": "A resistor whose value is controlled by an external physical signal. Useful for modeling sensors or variable loads."
      },
      {
        "id": "infinite_resistance",
        "name": "Infinite Resistance",
        "color": "#60a5fa",
        "icon": "infinite_resistance",
        "category": "Passive",
        "params": {},
        "ports": [
          {
            "id": "p",
            "pos": "left",
            "label": "+"
          },
          {
            "id": "n",
            "pos": "right",
            "label": "-"
          }
        ],
        "equation": "I = 0 (R -> ∞)",
        "description": "Models an ideal open branch with zero electrical conductance (infinite resistance)."
      },
      {
        "id": "capacitor",
        "name": "Capacitor",
        "color": "#3b82f6",
        "icon": "capacitor",
        "category": "Passive",
        "params": {
          "C": {
            "value": 0.000001,
            "unit": "F",
            "label": "Capacitance"
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "left",
            "label": "+"
          },
          {
            "id": "n",
            "pos": "right",
            "label": "-"
          }
        ],
        "equation": "I = C * dV/dt",
        "description": "Electrostatic charge storage element with through current proportional to voltage derivative."
      },
      {
        "id": "inductor",
        "name": "Inductor",
        "color": "#3b82f6",
        "icon": "inductor",
        "category": "Passive",
        "params": {
          "L": {
            "value": 0.001,
            "unit": "H",
            "label": "Inductance"
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "left",
            "label": "+"
          },
          {
            "id": "n",
            "pos": "right",
            "label": "-"
          }
        ],
        "equation": "V = L * dI/dt",
        "description": "Magnetic energy storage inductor with branch voltage proportional to current rate of change."
      },
      {
        "id": "memristor",
        "name": "Memristor",
        "color": "#3b82f6",
        "icon": "memristor",
        "category": "Passive",
        "params": {
          "M0": {
            "value": 100,
            "unit": "Ω",
            "label": "Initial Memristance"
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "left",
            "label": "+"
          },
          {
            "id": "n",
            "pos": "right",
            "label": "-"
          }
        ],
        "equation": "V(t) = M(q) * I(t)\ndM/dt = f(I, M)",
        "description": "Two-terminal non-volatile memory resistor whose resistance varies with past charge flow."
      },
      {
        "id": "gyrator",
        "name": "Gyrator",
        "color": "#818cf8",
        "icon": "gyrator",
        "category": "Passive",
        "params": {
          "g": {
            "value": 0.01,
            "unit": "S",
            "label": "Gyration Conductance"
          }
        },
        "ports": [
          {
            "id": "p1",
            "pos": "left",
            "label": "1+"
          },
          {
            "id": "n1",
            "pos": "left",
            "label": "1-"
          },
          {
            "id": "p2",
            "pos": "right",
            "label": "2+"
          },
          {
            "id": "n2",
            "pos": "right",
            "label": "2-"
          }
        ],
        "equation": "i1 = g * v2\ni2 = -g * v1",
        "description": "Ideal non-reciprocal two-port network that inverts voltage and current characteristics."
      },
      {
        "id": "transformer",
        "name": "Ideal Transformer",
        "color": "#818cf8",
        "icon": "transformer",
        "category": "Passive",
        "params": {
          "N": {
            "value": 10,
            "unit": "1",
            "label": "Turns Ratio"
          }
        },
        "ports": [
          {
            "id": "p1",
            "pos": "left",
            "label": "1+"
          },
          {
            "id": "n1",
            "pos": "left",
            "label": "1-"
          },
          {
            "id": "p2",
            "pos": "right",
            "label": "2+"
          },
          {
            "id": "n2",
            "pos": "right",
            "label": "2-"
          }
        ],
        "equation": "V2 = N * V1\\nI1 = N * I2",
        "description": "An ideal transformer that scales voltage and current according to the turns ratio N. It preserves power (V1*I1 = V2*I2)."
      },
      {
        "id": "opamp",
        "name": "Op-Amp",
        "color": "#60a5fa",
        "icon": "opamp",
        "category": "Active",
        "params": {
          "Gain": {
            "value": 100000,
            "unit": "1",
            "label": "Open-Loop Gain"
          }
        },
        "ports": [
          {
            "id": "in_p",
            "pos": "left",
            "label": "+"
          },
          {
            "id": "in_n",
            "pos": "left",
            "label": "-"
          },
          {
            "id": "out",
            "pos": "right",
            "label": "Out"
          }
        ],
        "equation": "Vout = A * (V+ - V-)\\n(Ideal: V+ = V-)",
        "description": "High-gain differential operational amplifier with negative feedback virtual short behavior."
      },
      {
        "id": "switch",
        "name": "Switch",
        "color": "#60a5fa",
        "icon": "switch",
        "category": "Active",
        "params": {
          "Ron": {
            "value": 0.01,
            "unit": "Ω",
            "label": "On Resistance"
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "left",
            "label": "+"
          },
          {
            "id": "n",
            "pos": "right",
            "label": "-"
          },
          {
            "id": "v",
            "pos": "top",
            "label": "v"
          }
        ],
        "equation": "V = I * R_sw\\nR_sw = (v > 0) ? Ron : Roff",
        "description": "An ideal switch controlled by a physical signal. When the control signal is positive, the switch is closed with a low resistance Ron."
      },
      {
        "id": "diode",
        "name": "Diode",
        "color": "#60a5fa",
        "icon": "diode",
        "category": "Semiconductors",
        "params": {
          "Ron": {
            "value": 0.01,
            "unit": "Ω",
            "label": "On Resistance"
          },
          "Roff": {
            "value": 1000000,
            "unit": "Ω",
            "label": "Off Resistance"
          },
          "Vf": {
            "value": 0.7,
            "unit": "V",
            "label": "Forward Voltage"
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "left",
            "label": "A"
          },
          {
            "id": "n",
            "pos": "right",
            "label": "K"
          }
        ],
        "equation": "V = I * Ron + Vf",
        "description": "An ideal diode with piecewise-linear behavior and forward voltage drop."
      },
      {
        "id": "nmos",
        "name": "N-MOSFET",
        "color": "#60a5fa",
        "icon": "nmos",
        "category": "Semiconductors",
        "params": {
          "kn": {
            "value": 0.5,
            "unit": "A/V²",
            "label": "Transconductance"
          },
          "Vth": {
            "value": 2,
            "unit": "V",
            "label": "Threshold Voltage"
          },
          "lambda": {
            "value": 0.01,
            "unit": "1/V",
            "label": "Channel Mod."
          }
        },
        "ports": [
          {
            "id": "d",
            "pos": "top",
            "label": "D"
          },
          {
            "id": "s",
            "pos": "bottom",
            "label": "S"
          },
          {
            "id": "g",
            "pos": "left",
            "label": "G",
            "domain": "physical"
          }
        ],
        "equation": "Id = f(Vgs, Vds)",
        "description": "N-channel MOSFET Level-1 model with physical signal gate input."
      },
      {
        "id": "igbt",
        "name": "IGBT",
        "color": "#60a5fa",
        "icon": "igbt",
        "category": "Semiconductors",
        "params": {
          "Vge_th": {
            "value": 5.5,
            "unit": "V",
            "label": "Gate Threshold"
          },
          "Vce_sat": {
            "value": 1.5,
            "unit": "V",
            "label": "Saturation Vce"
          },
          "Rd": {
            "value": 0.05,
            "unit": "Ω",
            "label": "On Resistance"
          }
        },
        "ports": [
          {
            "id": "c",
            "pos": "top",
            "label": "C"
          },
          {
            "id": "e",
            "pos": "bottom",
            "label": "E"
          },
          {
            "id": "g",
            "pos": "left",
            "label": "G",
            "domain": "physical"
          }
        ],
        "equation": "Ic = (Vce - Vce_sat)/Rd",
        "description": "Insulated Gate Bipolar Transistor modeled as a voltage-controlled switch with Saturation Voltage."
      },
      {
        "id": "rotational_electromechanical_converter",
        "name": "Rotational EM Converter",
        "color": "#f59e0b",
        "icon": "rotational_em",
        "category": "Couplings",
        "params": {
          "K": {
            "value": 1,
            "unit": "V-s/rad",
            "label": "Motor Constant"
          },
          "R": {
            "value": 1,
            "unit": "Ω",
            "label": "Armature Res"
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "left",
            "label": "+",
            "domain": "Electrical"
          },
          {
            "id": "n",
            "pos": "left",
            "label": "-",
            "domain": "Electrical"
          },
          {
            "id": "r",
            "pos": "right",
            "label": "R",
            "domain": "Rotational"
          },
          {
            "id": "c",
            "pos": "right",
            "label": "C",
            "domain": "Rotational"
          }
        ],
        "equation": "V = K * ω\\nτ = K * I",
        "description": "Converts electrical power to mechanical rotational power based on back-EMF and motor constant K."
      },
      {
        "id": "translational_electromechanical_converter",
        "name": "Translational EM Converter",
        "color": "#f59e0b",
        "icon": "translational_em",
        "category": "Couplings",
        "params": {
          "Bl": {
            "value": 1,
            "unit": "N/A",
            "label": "Magnetic Flux"
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "left",
            "label": "+"
          },
          {
            "id": "n",
            "pos": "left",
            "label": "-"
          },
          {
            "id": "r",
            "pos": "right",
            "label": "R"
          },
          {
            "id": "c",
            "pos": "right",
            "label": "C"
          }
        ],
        "equation": "V = Bl * v\nF = Bl * I",
        "description": "Converts electrical power to mechanical linear force via Lorentz force (Bl product)."
      },
      {
        "id": "pmsm",
        "name": "Permanent Magnet Synchronous Motor",
        "color": "#10b981",
        "icon": "pmsm",
        "category": "Couplings",
        "params": {
          "pole_pairs": {
            "value": 4,
            "unit": "",
            "label": "Pole Pairs"
          },
          "Rs": {
            "value": 0.1,
            "unit": "Ω",
            "label": "Stator Res"
          },
          "Kt": {
            "value": 0.2,
            "unit": "N-m/A",
            "label": "Torque Const"
          }
        },
        "ports": [
          {
            "id": "g",
            "pos": "left",
            "label": "G",
            "domain": "Electrical"
          },
          {
            "id": "r",
            "pos": "right",
            "label": "R",
            "domain": "Rotational"
          }
        ],
        "equation": "Vdq = Rs*Idq + Ldq*dIdq/dt + ω*Ψdq\\nτ_e = 1.5*P*(Ψf*Iq + (Ld-Lq)*Id*Iq)",
        "description": "Permanent Magnet Synchronous Motor model with sinusoidal back-EMF and d-q coordinate equations."
      },
      {
        "id": "dc_motor",
        "name": "DC Motor",
        "color": "#10b981",
        "icon": "dc_motor",
        "category": "Machines",
        "params": {
          "Ra": {
            "value": 2,
            "unit": "Ω",
            "label": "Armature Res"
          },
          "La": {
            "value": 0.01,
            "unit": "H",
            "label": "Armature Ind"
          },
          "Ke": {
            "value": 0.05,
            "unit": "V/rad/s",
            "label": "Back EMF Const"
          },
          "J": {
            "value": 0.001,
            "unit": "kg-m^2",
            "label": "Inertia"
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "left",
            "label": "+",
            "domain": "Electrical"
          },
          {
            "id": "n",
            "pos": "left",
            "label": "-",
            "domain": "Electrical"
          },
          {
            "id": "r",
            "pos": "right",
            "label": "R",
            "domain": "Rotational"
          }
        ],
        "equation": "V = Ra*I + La*dI/dt + Ke*ω\\nT = Ke*I = J*dω/dt + B*ω",
        "description": "DC motor coupling armature electrical circuit with rotor shaft mechanics."
      },
      {
        "id": "ac_motor",
        "name": "AC Motor",
        "color": "#10b981",
        "icon": "ac_motor",
        "category": "Machines",
        "params": {
          "Rs": {
            "value": 0.1,
            "unit": "Ω",
            "label": "Stator Res"
          },
          "Rr": {
            "value": 0.08,
            "unit": "Ω",
            "label": "Rotor Res"
          },
          "Lm": {
            "value": 0.05,
            "unit": "H",
            "label": "Mutual Ind"
          },
          "P": {
            "value": 2,
            "unit": "",
            "label": "Pole Pairs"
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A",
            "domain": "Electrical"
          },
          {
            "id": "b",
            "pos": "left",
            "label": "B",
            "domain": "Electrical"
          },
          {
            "id": "c",
            "pos": "left",
            "label": "C",
            "domain": "Electrical"
          },
          {
            "id": "n",
            "pos": "bottom",
            "label": "N",
            "domain": "Electrical"
          },
          {
            "id": "r",
            "pos": "right",
            "label": "R",
            "domain": "Rotational"
          }
        ],
        "equation": "Vs = Rs*Is + dΨs/dt\\n0 = Rr*Ir + dΨr/dt - j*ω*Ψr\\nτ = 1.5*P*Im(Ψs* · Is)",
        "description": "Three-phase induction motor modeled with stator/rotor flux linkages and slip torque generation."
      },
      {
        "id": "bldc_motor",
        "name": "BLDC Motor",
        "color": "#10b981",
        "icon": "bldc_motor",
        "category": "Machines",
        "params": {
          "Rs": {
            "value": 0.2,
            "unit": "Ω",
            "label": "Phase Res"
          },
          "Ls": {
            "value": 0.002,
            "unit": "H",
            "label": "Phase Ind"
          },
          "Ke": {
            "value": 0.1,
            "unit": "V/rad/s",
            "label": "Back EMF Const"
          },
          "P": {
            "value": 4,
            "unit": "",
            "label": "Pole Pairs"
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A",
            "domain": "Electrical"
          },
          {
            "id": "b",
            "pos": "left",
            "label": "B",
            "domain": "Electrical"
          },
          {
            "id": "c",
            "pos": "left",
            "label": "C",
            "domain": "Electrical"
          },
          {
            "id": "g",
            "pos": "left",
            "label": "G",
            "domain": "Electrical"
          },
          {
            "id": "r",
            "pos": "right",
            "label": "R",
            "domain": "Rotational"
          }
        ],
        "equation": "V_ph = Rs*I_ph + Ls*dI_ph/dt + e_ph(θ)\\nτ = (e_a*i_a + e_b*i_b + e_c*i_c) / ω",
        "description": "Brushless DC motor with trapezoidal back-EMF profile and electronic rotor commutation."
      },
      {
        "id": "thermal_resistor",
        "name": "Thermal Resistor",
        "color": "#ef4444",
        "icon": "thermal_resistor",
        "category": "Thermal",
        "params": {
          "Rth": {
            "value": 10,
            "unit": "K/W",
            "label": "Thermal Resistance"
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A",
            "domain": "Electrical"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "B",
            "domain": "Electrical"
          },
          {
            "id": "h",
            "pos": "top",
            "label": "H",
            "domain": "Thermal"
          }
        ],
        "equation": "V = I * R(T)\nR(T) = R0 * (1 + α * (T - T0))\nQ_gen = I² * R(T)",
        "description": "Temperature-dependent electrical resistor dissipating Joule heating into the thermal domain."
      },
      {
        "id": "scope",
        "name": "Scope",
        "color": "#fbbf24",
        "icon": "scope",
        "category": "Sinks",
        "params": {
          "numSignals": {
            "value": 1,
            "unit": "channels",
            "label": "Number of Input Ports"
          },
          "time_range": {
            "value": 10,
            "unit": "s",
            "label": "Time Range"
          },
          "limit_data_points": {
            "value": "on",
            "unit": "",
            "label": "Limit data points to last"
          },
          "buffer_size": {
            "value": 1000,
            "unit": "points",
            "label": "Max Points"
          },
          "decimation": {
            "value": 1,
            "unit": "",
            "label": "Decimation"
          },
          "sample_time": {
            "value": -1,
            "unit": "s",
            "label": "Sample Time"
          },
          "show_grid": {
            "value": "on",
            "unit": "",
            "label": "Show Grid"
          },
          "show_legend": {
            "value": "on",
            "unit": "",
            "label": "Show Legend"
          }
        },
        "ports": [
          {
            "id": "in1",
            "pos": "left",
            "label": "1",
            "domain": "Physical"
          }
        ],
        "equation": "y(t) = u(t)",
        "description": "Time-domain visual scope sink displaying dynamic simulated variables across simulation time."
      },
      {
        "id": "v_sensor",
        "name": "Voltage Sensor",
        "color": "#fbbf24",
        "icon": "v_sensor",
        "category": "Sensors",
        "params": {
          "R_int": {
            "value": 100000000,
            "unit": "Ω",
            "label": "Internal Res"
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "top",
            "label": "+",
            "domain": "Electrical"
          },
          {
            "id": "n",
            "pos": "bottom",
            "label": "-",
            "domain": "Electrical"
          },
          {
            "id": "v",
            "pos": "right",
            "label": "V",
            "domain": "Physical"
          }
        ],
        "equation": "V_out = V_p - V_n",
        "description": "Measures the potential difference between two electrical nodes and outputs it as a physical signal."
      },
      {
        "id": "i_sensor",
        "name": "Current Sensor",
        "color": "#fbbf24",
        "icon": "i_sensor",
        "category": "Sensors",
        "params": {
          "R_int": {
            "value": 0.000001,
            "unit": "Ω",
            "label": "Internal Res"
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "left",
            "label": "+",
            "domain": "Electrical"
          },
          {
            "id": "n",
            "pos": "right",
            "label": "-",
            "domain": "Electrical"
          },
          {
            "id": "i",
            "pos": "top",
            "label": "I",
            "domain": "Physical"
          }
        ],
        "equation": "I_out = I_branch\n(V_p - V_n = 0)",
        "description": "Measures through electric current with zero insertion impedance and outputs a physical signal."
      },
      {
        "id": "dc_voltage",
        "name": "DC Voltage Source",
        "color": "#ef4444",
        "icon": "dc_voltage",
        "category": "Sources",
        "params": {
          "V": {
            "value": 12,
            "unit": "V",
            "label": "Voltage"
          },
          "R_int": {
            "value": 0.001,
            "unit": "Ω",
            "label": "Internal Res"
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "top",
            "label": "+",
            "domain": "Electrical"
          },
          {
            "id": "n",
            "pos": "bottom",
            "label": "-",
            "domain": "Electrical"
          }
        ],
        "equation": "V = V_source - I * R_int",
        "description": "Constant DC voltage source with series internal source resistance."
      },
      {
        "id": "ac_voltage",
        "name": "AC Voltage Source",
        "color": "#ef4444",
        "icon": "ac_voltage",
        "category": "Sources",
        "params": {
          "Vpk": {
            "value": 230,
            "unit": "V",
            "label": "Peak Voltage"
          },
          "f": {
            "value": 50,
            "unit": "Hz",
            "label": "Frequency"
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "top",
            "label": "+",
            "domain": "Electrical"
          },
          {
            "id": "n",
            "pos": "bottom",
            "label": "-",
            "domain": "Electrical"
          }
        ],
        "equation": "V(t) = Vpk * sin(2*π*f*t + φ)",
        "description": "Sinusoidal AC voltage source generating harmonic electrical potential."
      },
      {
        "id": "three_phase_source",
        "name": "3-Phase Source",
        "color": "#ef4444",
        "icon": "three_phase_source",
        "category": "Sources",
        "params": {
          "Vrms": {
            "value": 400,
            "unit": "V",
            "label": "Line Voltage"
          },
          "f": {
            "value": 50,
            "unit": "Hz",
            "label": "Frequency"
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "right",
            "label": "A"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "B"
          },
          {
            "id": "c",
            "pos": "right",
            "label": "C"
          }
        ],
        "equation": "Va = Vpk*sin(ωt)\nVb = Vpk*sin(ωt - 2π/3)\nVc = Vpk*sin(ωt + 2π/3)",
        "description": "Balanced 3-phase AC voltage source with 120-degree phase separation."
      },
      {
        "id": "controlled_voltage",
        "name": "Controlled Voltage Source",
        "color": "#ef4444",
        "icon": "controlled_voltage",
        "category": "Sources",
        "params": {},
        "ports": [
          {
            "id": "p",
            "pos": "top",
            "label": "+",
            "domain": "Electrical"
          },
          {
            "id": "n",
            "pos": "bottom",
            "label": "-",
            "domain": "Electrical"
          },
          {
            "id": "s",
            "pos": "left",
            "label": "S",
            "domain": "Physical"
          }
        ],
        "equation": "V_p - V_n = s(t)",
        "description": "Voltage source whose output terminal potential is commanded by a physical signal s(t)."
      },
      {
        "id": "dc_current",
        "name": "DC Current Source",
        "color": "#ef4444",
        "icon": "dc_current",
        "category": "Sources",
        "params": {
          "I": {
            "value": 1,
            "unit": "A",
            "label": "Current"
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "top",
            "label": "+"
          },
          {
            "id": "n",
            "pos": "bottom",
            "label": "-"
          }
        ],
        "equation": "I = I_source",
        "description": "Ideal DC current source delivering constant through current independent of voltage."
      },
      {
        "id": "vcvs",
        "name": "Voltage-Controlled Voltage Source",
        "color": "#ef4444",
        "icon": "vcvs",
        "category": "Sources",
        "params": {
          "gain": {
            "value": 1,
            "unit": "1",
            "label": "Gain"
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "top",
            "label": "+"
          },
          {
            "id": "n",
            "pos": "bottom",
            "label": "-"
          },
          {
            "id": "cp",
            "pos": "left",
            "label": "C+"
          },
          {
            "id": "cn",
            "pos": "left",
            "label": "C-"
          }
        ],
        "equation": "V_out = Gain * (V_cp - V_cn)",
        "description": "Voltage-Controlled Voltage Source producing an output voltage proportional to control voltage."
      },
      {
        "id": "vccs",
        "name": "Voltage-Controlled Current Source",
        "color": "#ef4444",
        "icon": "vccs",
        "category": "Sources",
        "params": {
          "gain": {
            "value": 1,
            "unit": "S",
            "label": "Transconductance"
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "top",
            "label": "+"
          },
          {
            "id": "n",
            "pos": "bottom",
            "label": "-"
          },
          {
            "id": "cp",
            "pos": "left",
            "label": "C+"
          },
          {
            "id": "cn",
            "pos": "left",
            "label": "C-"
          }
        ],
        "equation": "I_out = Gm * (V_cp - V_cn)",
        "description": "Voltage-Controlled Current Source producing an output current proportional to control voltage."
      },
      {
        "id": "cccs",
        "name": "Current-Controlled Current Source",
        "color": "#ef4444",
        "icon": "cccs",
        "category": "Sources",
        "params": {
          "gain": {
            "value": 1,
            "unit": "1",
            "label": "Current Gain"
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "top",
            "label": "+"
          },
          {
            "id": "n",
            "pos": "bottom",
            "label": "-"
          },
          {
            "id": "cp",
            "pos": "left",
            "label": "C+"
          },
          {
            "id": "cn",
            "pos": "left",
            "label": "C-"
          }
        ],
        "equation": "I_out = Gain * I_control",
        "description": "Current-Controlled Current Source producing an output current proportional to input current."
      },
      {
        "id": "ccvs",
        "name": "Current-Controlled Voltage Source",
        "color": "#ef4444",
        "icon": "ccvs",
        "category": "Sources",
        "params": {
          "gain": {
            "value": 1,
            "unit": "Ω",
            "label": "Transresistance"
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "top",
            "label": "+"
          },
          {
            "id": "n",
            "pos": "bottom",
            "label": "-"
          },
          {
            "id": "cp",
            "pos": "left",
            "label": "C+"
          },
          {
            "id": "cn",
            "pos": "left",
            "label": "C-"
          }
        ],
        "equation": "V_out = Rm * I_control",
        "description": "Current-Controlled Voltage Source producing an output voltage proportional to input current."
      },
      {
        "id": "ground",
        "name": "Electrical Reference",
        "color": "#3b82f6",
        "icon": "ground",
        "category": "Connections",
        "params": {},
        "ports": [
          {
            "id": "a",
            "pos": "top",
            "label": ""
          }
        ],
        "equation": "V = 0",
        "description": "The zero-potential reference for the electrical circuit. All voltage measurements are relative to this node."
      },
      {
        "id": "busbar",
        "name": "Busbar",
        "color": "#3b82f6",
        "icon": "busbar",
        "category": "Connections",
        "params": {
          "nodes": {
            "value": 4,
            "unit": "",
            "label": "Terminals"
          }
        },
        "ports": [
          {
            "id": "1",
            "pos": "left",
            "label": "1"
          },
          {
            "id": "2",
            "pos": "right",
            "label": "2"
          }
        ],
        "equation": "V_1 = V_2 = ... = V_n\nΣ I_k = 0",
        "description": "Ideal electrical distribution busbar maintaining equipotential connection across all attached nodes."
      },
      {
        "id": "phase_splitter",
        "name": "Phase Splitter",
        "color": "#3b82f6",
        "icon": "phase_splitter",
        "category": "Three-Phase",
        "params": {},
        "ports": [
          {
            "id": "abc",
            "pos": "left",
            "label": "abc"
          },
          {
            "id": "a",
            "pos": "right",
            "label": "a"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "b"
          },
          {
            "id": "c",
            "pos": "right",
            "label": "c"
          }
        ],
        "equation": "Va = Vabc[0], Vb = Vabc[1], Vc = Vabc[2]",
        "description": "Splits a multiplexed 3-phase bus into individual phase lines A, B, and C."
      },
      {
        "id": "delta_ref",
        "name": "Delta Reference",
        "color": "#3b82f6",
        "icon": "delta_ref",
        "category": "Three-Phase",
        "params": {},
        "ports": [
          {
            "id": "a",
            "pos": "top",
            "label": ""
          }
        ],
        "equation": "Va + Vb + Vc = 0",
        "description": "Reference node for balanced delta-connected electrical topologies."
      },
      {
        "id": "open_circuit",
        "name": "Open Circuit",
        "color": "#3b82f6",
        "icon": "open_circuit",
        "category": "Connections",
        "params": {},
        "ports": [
          {
            "id": "a",
            "pos": "top",
            "label": ""
          }
        ],
        "equation": "I = 0 A",
        "description": "Maintains open-circuit condition with zero current flow at the connected port."
      },
      {
        "id": "ps_demux_3",
        "name": "PS Three-Element Demux",
        "color": "#92400e",
        "icon": "ps_demux",
        "category": "Utilities",
        "params": {},
        "ports": [
          {
            "id": "in",
            "pos": "left",
            "label": "abc"
          },
          {
            "id": "a",
            "pos": "right",
            "label": "a"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "b"
          },
          {
            "id": "c",
            "pos": "right",
            "label": "c"
          }
        ],
        "equation": "y1 = u[0], y2 = u[1], y3 = u[2]",
        "description": "Demultiplexes a 3-element physical signal vector into three individual scalar signals."
      }
    ]
  },
  {
    "type": "Gas",
    "blocks": [
      {
        "id": "gas_ref",
        "name": "Absolute Reference (G)",
        "color": "#d946ef",
        "icon": "gas_ref",
        "category": "Elements",
        "params": {},
        "ports": [
          {
            "id": "g",
            "pos": "bottom",
            "label": "G"
          }
        ],
        "equation": "P = 101325 Pa (1 atm)\nT = 293.15 K",
        "description": "Absolute reference node for gas networks representing standard ambient atmospheric conditions."
      },
      {
        "id": "gas_cap",
        "name": "Cap (G)",
        "color": "#d946ef",
        "icon": "gas_cap",
        "category": "Elements",
        "params": {},
        "ports": [
          {
            "id": "a",
            "pos": "bottom",
            "label": "A"
          }
        ],
        "equation": "mdot = 0 kg/s",
        "description": "Hermetic pneumatic end cap blocking gas mass flow at a conduit termination."
      },
      {
        "id": "gas_chamber",
        "name": "Constant Volume Chamber (G)",
        "color": "#d946ef",
        "icon": "gas_chamber",
        "category": "Elements",
        "params": {
          "V": {
            "value": 0.01,
            "unit": "m^3",
            "label": "Volume"
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "top",
            "label": "A"
          },
          {
            "id": "b",
            "pos": "top",
            "label": "B"
          }
        ],
        "equation": "dP/dt = (R*T/V) * Σ(mdot_in)",
        "description": "A rigid container that stores gas. The pressure changes according to the net mass flow rate into the chamber."
      },
      {
        "id": "gas_reservoir",
        "name": "Controlled Reservoir (G)",
        "color": "#d946ef",
        "icon": "gas_res",
        "category": "Elements",
        "params": {
          "P": {
            "value": 101325,
            "unit": "Pa",
            "label": "Pressure"
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "bottom",
            "label": "A"
          },
          {
            "id": "s",
            "pos": "left",
            "label": "S"
          }
        ],
        "equation": "P_node = P_param (or P_ctrl)",
        "description": "Infinite-capacity gas reservoir maintaining constant regulated pressure at its port."
      },
      {
        "id": "gas_resistance",
        "name": "Flow Resistance (G)",
        "color": "#d946ef",
        "icon": "gas_resistance",
        "category": "Elements",
        "params": {
          "k": {
            "value": 1,
            "unit": "kg/s/Pa",
            "label": "Conductance"
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "B"
          }
        ],
        "equation": "mdot = k * (Pa - Pb)",
        "description": "Models a pressure drop across a component. The mass flow rate is proportional to the pressure difference."
      },
      {
        "id": "gas_inf_resistance",
        "name": "Infinite Flow Resistance (G)",
        "color": "#d946ef",
        "icon": "gas_inf_res",
        "category": "Elements",
        "params": {},
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "B"
          }
        ],
        "equation": "mdot = 0 (R_gas -> ∞)",
        "description": "Pneumatic isolator providing infinite resistance to gas mass flow."
      },
      {
        "id": "gas_restriction",
        "name": "Local Restriction (G)",
        "color": "#d946ef",
        "icon": "gas_restriction",
        "category": "Elements",
        "params": {
          "area": {
            "value": 0.0001,
            "unit": "m^2",
            "label": "Area"
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "B"
          },
          {
            "id": "ar",
            "pos": "top",
            "label": "AR"
          }
        ],
        "equation": "mdot = Cd * A * √(2*ρ*|ΔP|) * sign(ΔP)",
        "description": "Orifice restriction calculating compressible gas flow from discharge coefficient and opening area."
      },
      {
        "id": "gas_pipe",
        "name": "Pipe (G)",
        "color": "#d946ef",
        "icon": "gas_pipe",
        "category": "Elements",
        "params": {
          "L": {
            "value": 1,
            "unit": "m",
            "label": "Length"
          },
          "D": {
            "value": 0.05,
            "unit": "m",
            "label": "Diameter"
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "B"
          },
          {
            "id": "h",
            "pos": "top",
            "label": "H"
          }
        ],
        "equation": "ΔP = f * (L/D) * (ρv²/2)",
        "description": "Models gas flow through a cylindrical conduit, accounting for friction-induced pressure drop and heat transfer."
      },
      {
        "id": "gas_fixed_res",
        "name": "Reservoir (G)",
        "color": "#d946ef",
        "icon": "gas_fixed_res",
        "category": "Elements",
        "params": {
          "P": {
            "value": 101325,
            "unit": "Pa",
            "label": "Pressure"
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "top",
            "label": "A"
          }
        ],
        "equation": "P = P_fixed, T = T_ambient",
        "description": "Fixed-pressure pneumatic boundary reservoir providing steady gas supply or exhaust."
      },
      {
        "id": "gas_rotational_conv",
        "name": "Rotational Mechanical Converter (G)",
        "color": "#10b981",
        "icon": "gas_rot_conv",
        "category": "Couplings",
        "params": {
          "D": {
            "value": 0.01,
            "unit": "m^3/rad",
            "label": "Displacement"
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A"
          },
          {
            "id": "h",
            "pos": "left",
            "label": "H"
          },
          {
            "id": "r",
            "pos": "right",
            "label": "R"
          },
          {
            "id": "c",
            "pos": "right",
            "label": "C"
          }
        ],
        "equation": "mdot = D * ω * ρ\nτ = D * (Pa - Pb)",
        "description": "Pneumatic rotary motor/compressor converting gas pressure differentials into shaft torque."
      },
      {
        "id": "gas_translational_conv",
        "name": "Translational Mechanical Converter (G)",
        "color": "#10b981",
        "icon": "gas_trans_conv",
        "category": "Couplings",
        "params": {
          "A": {
            "value": 0.001,
            "unit": "m^2",
            "label": "Piston Area"
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A"
          },
          {
            "id": "h",
            "pos": "left",
            "label": "H"
          },
          {
            "id": "r",
            "pos": "right",
            "label": "R"
          },
          {
            "id": "c",
            "pos": "right",
            "label": "C"
          }
        ],
        "equation": "mdot = A * v * ρ\nF = A * (Pa - Pb)",
        "description": "Pneumatic cylinder converting differential gas pressure into translational piston force."
      },
      {
        "id": "gas_flow_source",
        "name": "Flow Rate Source (G)",
        "color": "#d946ef",
        "icon": "gas_flow_src",
        "category": "Sources",
        "params": {
          "mdot": {
            "value": 0.1,
            "unit": "kg/s",
            "label": "Mass Flow Rate"
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "B"
          },
          {
            "id": "m",
            "pos": "top",
            "label": "M"
          }
        ],
        "equation": "mdot = mdot_cmd",
        "description": "Ideal mass flow rate source supplying a commanded mass flow rate of gas."
      },
      {
        "id": "gas_pressure_source",
        "name": "Pressure Source (G)",
        "color": "#d946ef",
        "icon": "gas_pres_src",
        "category": "Sources",
        "params": {
          "P": {
            "value": 200000,
            "unit": "Pa",
            "label": "Pressure"
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "B"
          },
          {
            "id": "p",
            "pos": "top",
            "label": "P"
          }
        ],
        "equation": "Pb - Pa = P_source",
        "description": "Ideal pneumatic pressure source maintaining a specified pressure differential across ports."
      },
      {
        "id": "gas_properties",
        "name": "Gas Properties (G)",
        "color": "#d946ef",
        "icon": "gas_props",
        "category": "Utilities",
        "params": {
          "R": {
            "value": 287,
            "unit": "J/kg/K",
            "label": "Gas Constant"
          },
          "gamma": {
            "value": 1.4,
            "unit": "1",
            "label": "Specific Heat Ratio"
          }
        },
        "ports": [],
        "equation": "P = ρ * R * T\\nγ = Cp / Cv",
        "description": "Defines working gas thermodynamic parameters including specific gas constant R and specific heat ratio γ."
      }
    ]
  },
  {
    "type": "Magnetic",
    "blocks": [
      {
        "id": "mag_ref",
        "name": "Magnetic Reference",
        "color": "#ec4899",
        "icon": "mag_ref",
        "category": "Elements",
        "params": {},
        "ports": [
          {
            "id": "n",
            "pos": "bottom",
            "label": "N"
          }
        ],
        "equation": "MMF = 0 A-t",
        "description": "Magnetic ground reference providing zero magnetomotive force potential."
      },
      {
        "id": "reluctance",
        "name": "Reluctance",
        "color": "#ec4899",
        "icon": "reluctance",
        "category": "Elements",
        "params": {
          "R": {
            "value": 1000000,
            "unit": "A-t/Wb",
            "label": "Reluctance"
          }
        },
        "ports": [
          {
            "id": "n",
            "pos": "left",
            "label": "N"
          },
          {
            "id": "s",
            "pos": "right",
            "label": "S"
          }
        ],
        "equation": "MMF = Φ * R",
        "description": "Magnetic reluctance relating magnetomotive force drop to magnetic flux Φ (Hopkinson's law)."
      },
      {
        "id": "fundamental_reluctance",
        "name": "Fundamental Reluctance",
        "color": "#ec4899",
        "icon": "reluctance_f",
        "category": "Elements",
        "params": {
          "R": {
            "value": 1000000,
            "unit": "A-t/Wb",
            "label": "Reluctance"
          }
        },
        "ports": [
          {
            "id": "n",
            "pos": "left",
            "label": "N"
          },
          {
            "id": "s",
            "pos": "right",
            "label": "S"
          }
        ],
        "equation": "MMF = Φ * (l / (μ * A))",
        "description": "Reluctance of a magnetic core segment calculated from length l, area A, and permeability μ."
      },
      {
        "id": "variable_reluctance",
        "name": "Variable Reluctance",
        "color": "#ec4899",
        "icon": "var_reluctance",
        "category": "Elements",
        "params": {
          "Rmin": {
            "value": 100000,
            "unit": "A-t/Wb",
            "label": "Min Reluctance"
          }
        },
        "ports": [
          {
            "id": "n",
            "pos": "left",
            "label": "N"
          },
          {
            "id": "s",
            "pos": "right",
            "label": "S"
          },
          {
            "id": "ctrl",
            "pos": "top",
            "label": "C"
          }
        ],
        "equation": "MMF = Φ * R(ctrl)",
        "description": "Magnetic reluctance modulated dynamically by an external physical control signal."
      },
      {
        "id": "permanent_magnet",
        "name": "Permanent Magnet",
        "color": "#ec4899",
        "icon": "perm_magnet",
        "category": "Elements",
        "params": {
          "Hc": {
            "value": 1000,
            "unit": "A/m",
            "label": "Coercivity"
          }
        },
        "ports": [
          {
            "id": "n",
            "pos": "left",
            "label": "N"
          },
          {
            "id": "s",
            "pos": "right",
            "label": "S"
          }
        ],
        "equation": "MMF = Hc * Lm - Φ * Rm",
        "description": "Permanent magnet source modeled with coercive force Hc, length Lm, and internal reluctance Rm."
      },
      {
        "id": "em_converter",
        "name": "Electromagnetic Converter",
        "color": "#3b82f6",
        "icon": "em_conv",
        "category": "Couplings",
        "params": {
          "N": {
            "value": 100,
            "unit": "1",
            "label": "Number of Turns"
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "left",
            "label": "+"
          },
          {
            "id": "n",
            "pos": "left",
            "label": "-"
          },
          {
            "id": "mag_n",
            "pos": "right",
            "label": "N"
          },
          {
            "id": "mag_s",
            "pos": "right",
            "label": "S"
          }
        ],
        "equation": "MMF = N * I\nV = N * dΦ/dt",
        "description": "Electromagnetic coil converting electric current to MMF and rate of magnetic flux to induced EMF."
      },
      {
        "id": "reluctance_force",
        "name": "Reluctance Force Actuator",
        "color": "#f59e0b",
        "icon": "rel_force",
        "category": "Couplings",
        "params": {
          "K": {
            "value": 1,
            "unit": "N-m/Wb^2",
            "label": "Force Constant"
          }
        },
        "ports": [
          {
            "id": "n",
            "pos": "left",
            "label": "N"
          },
          {
            "id": "s",
            "pos": "left",
            "label": "S"
          },
          {
            "id": "r",
            "pos": "right",
            "label": "R"
          },
          {
            "id": "c",
            "pos": "right",
            "label": "C"
          }
        ],
        "equation": "F = 0.5 * Φ² * (dR/dx)",
        "description": "Calculates electromagnetic Maxwell attraction force generated by spatial reluctance variation."
      },
      {
        "id": "mag_flux_sensor",
        "name": "Flux Sensor",
        "color": "#ec4899",
        "icon": "flux_sensor",
        "category": "Sensors",
        "params": {},
        "ports": [
          {
            "id": "n",
            "pos": "left",
            "label": "N"
          },
          {
            "id": "s",
            "pos": "right",
            "label": "S"
          },
          {
            "id": "phi",
            "pos": "top",
            "label": "Φ"
          }
        ],
        "equation": "Φ_out = Φ_branch",
        "description": "Measures total magnetic flux flowing through a magnetic core circuit branch."
      },
      {
        "id": "mag_mmf_sensor",
        "name": "MMF Sensor",
        "color": "#ec4899",
        "icon": "mmf_sensor",
        "category": "Sensors",
        "params": {},
        "ports": [
          {
            "id": "n",
            "pos": "top",
            "label": "N"
          },
          {
            "id": "s",
            "pos": "bottom",
            "label": "S"
          },
          {
            "id": "f",
            "pos": "right",
            "label": "F"
          }
        ],
        "equation": "MMF_out = MMF_n - MMF_s",
        "description": "Measures magnetomotive force potential difference across two magnetic terminals."
      },
      {
        "id": "mag_mmf_source",
        "name": "MMF Source",
        "color": "#ec4899",
        "icon": "mmf_source",
        "category": "Sources",
        "params": {
          "MMF": {
            "value": 10,
            "unit": "A-t",
            "label": "Magnetomotive Force"
          }
        },
        "ports": [
          {
            "id": "n",
            "pos": "top",
            "label": "N"
          },
          {
            "id": "s",
            "pos": "bottom",
            "label": "S"
          }
        ],
        "equation": "MMF = N * I",
        "description": "An ideal source of magnetomotive force. Drives magnetic flux through a reluctant circuit."
      },
      {
        "id": "mag_flux_source",
        "name": "Flux Source",
        "color": "#ec4899",
        "icon": "flux_source",
        "category": "Sources",
        "params": {
          "phi": {
            "value": 0.001,
            "unit": "Wb",
            "label": "Magnetic Flux"
          }
        },
        "ports": [
          {
            "id": "n",
            "pos": "top",
            "label": "N"
          },
          {
            "id": "s",
            "pos": "bottom",
            "label": "S"
          }
        ],
        "equation": "Φ = Φ_source",
        "description": "Ideal source of magnetic flux delivering constant magnetic flux through a branch."
      },
      {
        "id": "mag_controlled_mmf",
        "name": "Controlled MMF Source",
        "color": "#ec4899",
        "icon": "ctrl_mmf",
        "category": "Sources",
        "params": {},
        "ports": [
          {
            "id": "n",
            "pos": "top",
            "label": "N"
          },
          {
            "id": "s",
            "pos": "bottom",
            "label": "S"
          },
          {
            "id": "src",
            "pos": "left",
            "label": "S"
          }
        ],
        "equation": "Controlled MMF Source governing physical equation",
        "description": "Physical component model for Controlled MMF Source."
      }
    ]
  },
  {
    "type": "Mechanical",
    "blocks": [
      {
        "id": "force_sensor",
        "name": "Ideal Force Sensor",
        "color": "#10b981",
        "icon": "force_sensor",
        "category": "Sensors",
        "params": {
          "k": {
            "value": 100000000,
            "unit": "N/m",
            "label": "Stiffness"
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A",
            "domain": "Translational"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "B",
            "domain": "Translational"
          },
          {
            "id": "f",
            "pos": "top",
            "label": "F",
            "domain": "Physical"
          }
        ],
        "equation": "f_out = F_branch",
        "description": "Measures through-force transmitted between two translational mechanical connection points."
      },
      {
        "id": "rot_motion_sensor",
        "name": "Ideal Rotational Motion Sensor",
        "color": "#10b981",
        "icon": "rot_motion",
        "category": "Sensors",
        "params": {
          "b": {
            "value": 0,
            "unit": "N-m-s/rad",
            "label": "Damping"
          }
        },
        "ports": [
          {
            "id": "r",
            "pos": "left",
            "label": "R",
            "domain": "Rotational"
          },
          {
            "id": "c",
            "pos": "right",
            "label": "C",
            "domain": "Rotational"
          },
          {
            "id": "w",
            "pos": "top",
            "label": "W",
            "domain": "Physical"
          },
          {
            "id": "a",
            "pos": "top",
            "label": "A",
            "domain": "Physical"
          }
        ],
        "equation": "w_out = ω, a_out = θ",
        "description": "Ideal rotational sensor measuring angular velocity ω and angular position θ."
      },
      {
        "id": "torque_sensor",
        "name": "Ideal Torque Sensor",
        "color": "#10b981",
        "icon": "torque_sensor",
        "category": "Sensors",
        "params": {
          "k": {
            "value": 100000000,
            "unit": "N-m/rad",
            "label": "Stiffness"
          }
        },
        "ports": [
          {
            "id": "r",
            "pos": "left",
            "label": "R",
            "domain": "Rotational"
          },
          {
            "id": "c",
            "pos": "right",
            "label": "C",
            "domain": "Rotational"
          },
          {
            "id": "t",
            "pos": "top",
            "label": "T",
            "domain": "Physical"
          }
        ],
        "equation": "t_out = τ_branch",
        "description": "Measures through-torque transmitted between two rotating mechanical shafts."
      },
      {
        "id": "trans_motion_sensor",
        "name": "Ideal Translational Motion Sensor",
        "color": "#10b981",
        "icon": "trans_motion",
        "category": "Sensors",
        "params": {
          "b": {
            "value": 0,
            "unit": "N-s/m",
            "label": "Damping"
          }
        },
        "ports": [
          {
            "id": "r",
            "pos": "left",
            "label": "R",
            "domain": "Translational"
          },
          {
            "id": "c",
            "pos": "right",
            "label": "C",
            "domain": "Translational"
          },
          {
            "id": "v",
            "pos": "top",
            "label": "V",
            "domain": "Physical"
          },
          {
            "id": "p",
            "pos": "top",
            "label": "P",
            "domain": "Physical"
          }
        ],
        "equation": "v = dx/dt",
        "description": "Measures position and velocity of a mechanical translational node relative to a reference."
      },
      {
        "id": "force_source",
        "name": "Ideal Force Source",
        "color": "#10b981",
        "icon": "force_source",
        "category": "Sources",
        "params": {
          "F": {
            "value": 10,
            "unit": "N",
            "label": "Force"
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A",
            "domain": "Translational"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "B",
            "domain": "Translational"
          },
          {
            "id": "s",
            "pos": "top",
            "label": "S",
            "domain": "Physical"
          }
        ],
        "equation": "F = F_param (or F_cmd)",
        "description": "Ideal force actuator delivering commanded linear force between two translational nodes."
      },
      {
        "id": "torque_source",
        "name": "Ideal Torque Source",
        "color": "#10b981",
        "icon": "torque_source",
        "category": "Sources",
        "params": {
          "T": {
            "value": 5,
            "unit": "N-m",
            "label": "Torque"
          }
        },
        "ports": [
          {
            "id": "r",
            "pos": "left",
            "label": "R",
            "domain": "Rotational"
          },
          {
            "id": "c",
            "pos": "right",
            "label": "C",
            "domain": "Rotational"
          },
          {
            "id": "s",
            "pos": "top",
            "label": "S",
            "domain": "Physical"
          }
        ],
        "equation": "τ = τ_param (or τ_cmd)",
        "description": "Ideal torque actuator delivering commanded rotational torque between two shaft nodes."
      },
      {
        "id": "ang_vel_source",
        "name": "Ideal Angular Velocity Source",
        "color": "#10b981",
        "icon": "vel_source",
        "category": "Sources",
        "params": {
          "omega": {
            "value": 10,
            "unit": "rad/s",
            "label": "Angular Velocity"
          }
        },
        "ports": [
          {
            "id": "r",
            "pos": "left",
            "label": "R",
            "domain": "Rotational"
          },
          {
            "id": "c",
            "pos": "right",
            "label": "C",
            "domain": "Rotational"
          },
          {
            "id": "s",
            "pos": "top",
            "label": "S",
            "domain": "Physical"
          }
        ],
        "equation": "ω = ω_input",
        "description": "Drives a rotational node at a specified angular velocity, regardless of the load torque."
      },
      {
        "id": "gear_box",
        "name": "Gear Box",
        "color": "#10b981",
        "icon": "gear_box",
        "category": "Mechanisms",
        "params": {
          "ratio": {
            "value": 2,
            "unit": "1",
            "label": "Gear Ratio"
          }
        },
        "ports": [
          {
            "id": "s1",
            "pos": "left",
            "label": "S1",
            "domain": "Rotational"
          },
          {
            "id": "s2",
            "pos": "right",
            "label": "S2",
            "domain": "Rotational"
          }
        ],
        "equation": "ω1 = ratio * ω2\\nτ2 = ratio * τ1",
        "description": "An ideal mechanical gear transmission that scales angular velocity and torque."
      },
      {
        "id": "lever",
        "name": "Lever",
        "color": "#10b981",
        "icon": "lever",
        "category": "Mechanisms",
        "params": {
          "L1": {
            "value": 0.5,
            "unit": "m",
            "label": "Length 1"
          },
          "L2": {
            "value": 0.5,
            "unit": "m",
            "label": "Length 2"
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A",
            "domain": "Translational"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "B",
            "domain": "Translational"
          },
          {
            "id": "c",
            "pos": "bottom",
            "label": "C",
            "domain": "Translational"
          }
        ],
        "equation": "F1 * L1 = F2 * L2\nv1 / L1 = v2 / L2",
        "description": "Ideal mechanical lever transforming displacement and force according to leverage arm lengths."
      },
      {
        "id": "wheel_axle",
        "name": "Wheel and Axle",
        "color": "#10b981",
        "icon": "wheel_axle",
        "category": "Mechanisms",
        "params": {
          "Rw": {
            "value": 0.3,
            "unit": "m",
            "label": "Wheel Radius"
          },
          "Ra": {
            "value": 0.05,
            "unit": "m",
            "label": "Axle Radius"
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A",
            "domain": "Rotational"
          },
          {
            "id": "p",
            "pos": "right",
            "label": "P",
            "domain": "Translational"
          }
        ],
        "equation": "v_trans = R * ω_rot\nτ_rot = R * F_trans",
        "description": "Wheel and axle mechanism coupling vehicle linear road speed to axle rotational velocity."
      },
      {
        "id": "rot_multibody_interface",
        "name": "Rotational Multibody Interface",
        "color": "#10b981",
        "icon": "rot_multibody",
        "category": "Multibody Interfaces",
        "params": {},
        "ports": [
          {
            "id": "t",
            "pos": "left",
            "label": "T"
          },
          {
            "id": "c",
            "pos": "left",
            "label": "C"
          },
          {
            "id": "w",
            "pos": "right",
            "label": "W"
          },
          {
            "id": "r",
            "pos": "right",
            "label": "R"
          }
        ],
        "equation": "Rotational Multibody Interface governing physical equation",
        "description": "Physical component model for Rotational Multibody Interface."
      },
      {
        "id": "trans_multibody_interface",
        "name": "Translational Multibody Interface",
        "color": "#10b981",
        "icon": "trans_multibody",
        "category": "Multibody Interfaces",
        "params": {},
        "ports": [
          {
            "id": "f",
            "pos": "left",
            "label": "F"
          },
          {
            "id": "c",
            "pos": "left",
            "label": "C"
          },
          {
            "id": "v",
            "pos": "right",
            "label": "V"
          },
          {
            "id": "r",
            "pos": "right",
            "label": "R"
          }
        ],
        "equation": "Translational Multibody Interface governing physical equation",
        "description": "Physical component model for Translational Multibody Interface."
      },
      {
        "id": "inertia",
        "name": "Inertia",
        "color": "#10b981",
        "icon": "inertia",
        "category": "Rotational Elements",
        "params": {
          "J": {
            "value": 0.01,
            "unit": "kg-m^2",
            "label": "Inertia"
          }
        },
        "ports": [
          {
            "id": "r",
            "pos": "top",
            "label": "R",
            "domain": "Rotational"
          }
        ],
        "equation": "τ = J * dω/dt",
        "description": "Rotational flywheel inertia relating net torque to angular acceleration via moment of inertia J."
      },
      {
        "id": "rot_ref",
        "name": "Mechanical Rotational Reference",
        "color": "#10b981",
        "icon": "rot_ref",
        "category": "Rotational Elements",
        "params": {},
        "ports": [
          {
            "id": "r",
            "pos": "top",
            "label": "R",
            "domain": "Rotational"
          }
        ],
        "equation": "ω = 0 rad/s, θ = 0 rad",
        "description": "Mechanical rotational ground reference fixing zero angular velocity and position."
      },
      {
        "id": "rot_spring",
        "name": "Rotational Spring",
        "color": "#10b981",
        "icon": "rot_spring",
        "category": "Rotational Elements",
        "params": {
          "k": {
            "value": 100,
            "unit": "N-m/rad",
            "label": "Spring Rate"
          }
        },
        "ports": [
          {
            "id": "r",
            "pos": "left",
            "label": "R"
          },
          {
            "id": "c",
            "pos": "right",
            "label": "C"
          }
        ],
        "equation": "τ = k * (θ - θ0)",
        "description": "Torsional spring resisting angular twist with restoring torque proportional to relative angle."
      },
      {
        "id": "rot_damper",
        "name": "Rotational Damper",
        "color": "#10b981",
        "icon": "rot_damper",
        "category": "Rotational Elements",
        "params": {
          "b": {
            "value": 0.1,
            "unit": "N-m/rad/s",
            "label": "Damping Coefficient"
          }
        },
        "ports": [
          {
            "id": "r",
            "pos": "left",
            "label": "R",
            "domain": "Rotational"
          },
          {
            "id": "c",
            "pos": "right",
            "label": "C",
            "domain": "Rotational"
          }
        ],
        "equation": "τ = c * (ω1 - ω2)",
        "description": "Rotational viscous damper generating resistive torque proportional to relative angular velocity."
      },
      {
        "id": "rot_friction",
        "name": "Rotational Friction",
        "color": "#10b981",
        "icon": "rot_friction",
        "category": "Rotational Elements",
        "params": {
          "Ts": {
            "value": 0.5,
            "unit": "N-m",
            "label": "Static Friction"
          }
        },
        "ports": [
          {
            "id": "r",
            "pos": "left",
            "label": "R",
            "domain": "Rotational"
          },
          {
            "id": "c",
            "pos": "right",
            "label": "C",
            "domain": "Rotational"
          }
        ],
        "equation": "Rotational Friction governing physical equation",
        "description": "Physical component model for Rotational Friction."
      },
      {
        "id": "rot_hard_stop",
        "name": "Rotational Hard Stop",
        "color": "#10b981",
        "icon": "rot_hard_stop",
        "category": "Rotational Elements",
        "params": {
          "upper": {
            "value": 1,
            "unit": "rad",
            "label": "Upper Limit"
          },
          "lower": {
            "value": -1,
            "unit": "rad",
            "label": "Lower Limit"
          }
        },
        "ports": [
          {
            "id": "r",
            "pos": "left",
            "label": "R",
            "domain": "Rotational"
          },
          {
            "id": "c",
            "pos": "right",
            "label": "C",
            "domain": "Rotational"
          }
        ],
        "equation": "τ_stop = k_c * (θ - θ_limit) + c_c * ω",
        "description": "Rotational mechanical stop limiting angular travel with contact stiffness and damping."
      },
      {
        "id": "mass",
        "name": "Mass",
        "color": "#10b981",
        "icon": "mass",
        "category": "Translational Elements",
        "params": {
          "m": {
            "value": 1,
            "unit": "kg",
            "label": "Mass"
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "top",
            "label": "P",
            "domain": "Translational"
          }
        ],
        "equation": "F = m * dv/dt",
        "description": "Translational rigid mass governed by Newton's second law relating net force to acceleration."
      },
      {
        "id": "trans_ref",
        "name": "Mechanical Translational Reference",
        "color": "#10b981",
        "icon": "trans_ref",
        "category": "Translational Elements",
        "params": {},
        "ports": [
          {
            "id": "p",
            "pos": "top",
            "label": "P",
            "domain": "Translational"
          }
        ],
        "equation": "v = 0 m/s, x = 0 m",
        "description": "Mechanical translational ground reference fixing zero velocity and position."
      },
      {
        "id": "trans_spring",
        "name": "Translational Spring",
        "color": "#10b981",
        "icon": "trans_spring",
        "category": "Translational Elements",
        "params": {
          "k": {
            "value": 1000,
            "unit": "N/m",
            "label": "Spring Rate"
          }
        },
        "ports": [
          {
            "id": "r",
            "pos": "left",
            "label": "R",
            "domain": "Translational"
          },
          {
            "id": "c",
            "pos": "right",
            "label": "C",
            "domain": "Translational"
          }
        ],
        "equation": "F = k * (x_r - x_c)",
        "description": "Physical component model for Translational Spring."
      },
      {
        "id": "trans_damper",
        "name": "Translational Damper",
        "color": "#10b981",
        "icon": "trans_damper",
        "category": "Translational Elements",
        "params": {
          "b": {
            "value": 10,
            "unit": "N/m/s",
            "label": "Damping Coefficient"
          }
        },
        "ports": [
          {
            "id": "r",
            "pos": "left",
            "label": "R",
            "domain": "Translational"
          },
          {
            "id": "c",
            "pos": "right",
            "label": "C",
            "domain": "Translational"
          }
        ],
        "equation": "Translational Damper governing physical equation",
        "description": "Physical component model for Translational Damper."
      },
      {
        "id": "trans_friction",
        "name": "Translational Friction",
        "color": "#10b981",
        "icon": "trans_friction",
        "category": "Translational Elements",
        "params": {
          "Fs": {
            "value": 5,
            "unit": "N",
            "label": "Static Friction"
          }
        },
        "ports": [
          {
            "id": "r",
            "pos": "left",
            "label": "R",
            "domain": "Translational"
          },
          {
            "id": "c",
            "pos": "right",
            "label": "C",
            "domain": "Translational"
          }
        ],
        "equation": "Translational Friction governing physical equation",
        "description": "Physical component model for Translational Friction."
      },
      {
        "id": "trans_hard_stop",
        "name": "Translational Hard Stop",
        "color": "#10b981",
        "icon": "trans_hard_stop",
        "category": "Translational Elements",
        "params": {
          "upper": {
            "value": 0.1,
            "unit": "m",
            "label": "Upper Limit"
          },
          "lower": {
            "value": -0.1,
            "unit": "m",
            "label": "Lower Limit"
          }
        },
        "ports": [
          {
            "id": "r",
            "pos": "left",
            "label": "R",
            "domain": "Translational"
          },
          {
            "id": "c",
            "pos": "right",
            "label": "C",
            "domain": "Translational"
          }
        ],
        "equation": "F_stop = k_c * (x - x_limit) + c_c * v",
        "description": "Translational mechanical stop with contact stiffness and damping at stroke limits."
      }
    ]
  },
  {
    "type": "Fluid",
    "blocks": [
      {
        "id": "ma_ref",
        "name": "Absolute Reference (MA)",
        "color": "#8b5cf6",
        "icon": "ma_ref",
        "category": "Elements",
        "params": {},
        "ports": [
          {
            "id": "g",
            "pos": "bottom",
            "label": "G"
          }
        ],
        "equation": "Absolute Reference (MA) governing physical equation",
        "description": "Physical component model for Absolute Reference (MA)."
      },
      {
        "id": "ma_chamber",
        "name": "Constant Volume Chamber (MA)",
        "color": "#8b5cf6",
        "icon": "ma_chamber",
        "category": "Elements",
        "params": {
          "V": {
            "value": 0.1,
            "unit": "m^3",
            "label": "Volume"
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "top",
            "label": "A",
            "domain": "Fluid"
          },
          {
            "id": "b",
            "pos": "top",
            "label": "B",
            "domain": "Fluid"
          },
          {
            "id": "h",
            "pos": "left",
            "label": "H",
            "domain": "Thermal"
          }
        ],
        "equation": "dP/dt = (R*T/V) * (mdot_in - mdot_out)",
        "description": "Represents a constant volume of moist air. Calculates pressure and temperature based on mass and energy balance."
      },
      {
        "id": "ma_pipe",
        "name": "Pipe (MA)",
        "color": "#8b5cf6",
        "icon": "ma_pipe",
        "category": "Elements",
        "params": {
          "L": {
            "value": 2,
            "unit": "m",
            "label": "Length"
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "B"
          },
          {
            "id": "h",
            "pos": "top",
            "label": "H",
            "domain": "Thermal"
          },
          {
            "id": "wd",
            "pos": "bottom",
            "label": "WD"
          }
        ],
        "equation": "ΔP = f(L, D, Re) * (ρv²/2)",
        "description": "Models the pressure drop and heat transfer of moist air flowing through a pipe."
      },
      {
        "id": "ma_separator",
        "name": "Moisture Separator (MA)",
        "color": "#8b5cf6",
        "icon": "ma_separator",
        "category": "Elements",
        "params": {
          "efficiency": {
            "value": 0.9,
            "unit": "1",
            "label": "Efficiency"
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "B"
          },
          {
            "id": "w",
            "pos": "top",
            "label": "W"
          },
          {
            "id": "d",
            "pos": "top",
            "label": "D"
          }
        ],
        "equation": "Moisture Separator (MA) governing physical equation",
        "description": "Physical component model for Moisture Separator (MA)."
      },
      {
        "id": "ma_rot_conv",
        "name": "Rotational Mechanical Converter (MA)",
        "color": "#10b981",
        "icon": "ma_rot_conv",
        "category": "Couplings",
        "params": {
          "D": {
            "value": 0.001,
            "unit": "m^3/rad",
            "label": "Displacement"
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A"
          },
          {
            "id": "h",
            "pos": "left",
            "label": "H"
          },
          {
            "id": "r",
            "pos": "right",
            "label": "R"
          },
          {
            "id": "c",
            "pos": "right",
            "label": "C"
          },
          {
            "id": "wd",
            "pos": "bottom",
            "label": "WD"
          }
        ],
        "equation": "Rotational Mechanical Converter (MA) governing physical equation",
        "description": "Physical component model for Rotational Mechanical Converter (MA)."
      },
      {
        "id": "ma_trans_conv",
        "name": "Translational Mechanical Converter (MA)",
        "color": "#10b981",
        "icon": "ma_trans_conv",
        "category": "Couplings",
        "params": {
          "A": {
            "value": 0.01,
            "unit": "m^2",
            "label": "Area"
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A"
          },
          {
            "id": "h",
            "pos": "left",
            "label": "H",
            "domain": "Thermal"
          },
          {
            "id": "r",
            "pos": "right",
            "label": "R",
            "domain": "Translational"
          },
          {
            "id": "c",
            "pos": "right",
            "label": "C",
            "domain": "Translational"
          },
          {
            "id": "wd",
            "pos": "bottom",
            "label": "WD"
          }
        ],
        "equation": "Translational Mechanical Converter (MA) governing physical equation",
        "description": "Physical component model for Translational Mechanical Converter (MA)."
      },
      {
        "id": "ma_flow_sensor",
        "name": "Flow Rate Sensor (MA)",
        "color": "#8b5cf6",
        "icon": "ma_flow_sensor",
        "category": "Sensors",
        "params": {},
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "B"
          },
          {
            "id": "m",
            "pos": "top",
            "label": "M"
          }
        ],
        "equation": "Flow Rate Sensor (MA) governing physical equation",
        "description": "Physical component model for Flow Rate Sensor (MA)."
      },
      {
        "id": "ma_selector",
        "name": "Measurement Selector (MA)",
        "color": "#8b5cf6",
        "icon": "ma_selector",
        "category": "Sensors",
        "params": {},
        "ports": [
          {
            "id": "in",
            "pos": "left",
            "label": "F"
          },
          {
            "id": "t",
            "pos": "right",
            "label": "T"
          },
          {
            "id": "p",
            "pos": "right",
            "label": "P"
          },
          {
            "id": "w",
            "pos": "right",
            "label": "W"
          }
        ],
        "equation": "Measurement Selector (MA) governing physical equation",
        "description": "Physical component model for Measurement Selector (MA)."
      },
      {
        "id": "ma_moisture_sensor",
        "name": "Moisture & Trace Gas Sensor (MA)",
        "color": "#8b5cf6",
        "icon": "ma_moisture",
        "category": "Sensors",
        "params": {},
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A"
          },
          {
            "id": "w",
            "pos": "right",
            "label": "W"
          }
        ],
        "equation": "Moisture & Trace Gas Sensor (MA) governing physical equation",
        "description": "Physical component model for Moisture & Trace Gas Sensor (MA)."
      },
      {
        "id": "ma_pt_sensor",
        "name": "Pressure & Temperature Sensor (MA)",
        "color": "#8b5cf6",
        "icon": "ma_pt_sensor",
        "category": "Sensors",
        "params": {},
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A"
          },
          {
            "id": "p",
            "pos": "right",
            "label": "Pa"
          }
        ],
        "equation": "Pressure & Temperature Sensor (MA) governing physical equation",
        "description": "Physical component model for Pressure & Temperature Sensor (MA)."
      },
      {
        "id": "ma_thermo_sensor",
        "name": "Thermodynamic Properties Sensor (MA)",
        "color": "#8b5cf6",
        "icon": "ma_thermo",
        "category": "Sensors",
        "params": {},
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A"
          },
          {
            "id": "rho",
            "pos": "right",
            "label": "ρ"
          }
        ],
        "equation": "Thermodynamic Properties Sensor (MA) governing physical equation",
        "description": "Physical component model for Thermodynamic Properties Sensor (MA)."
      },
      {
        "id": "ma_moisture_source",
        "name": "Moisture Source (MA)",
        "color": "#8b5cf6",
        "icon": "ma_moisture_src",
        "category": "Sources",
        "params": {
          "rate": {
            "value": 0.01,
            "unit": "kg/s",
            "label": "Moisture Rate"
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "bottom",
            "label": "A"
          },
          {
            "id": "s",
            "pos": "top",
            "label": "S",
            "domain": "Physical"
          }
        ],
        "equation": "Moisture Source (MA) governing physical equation",
        "description": "Physical component model for Moisture Source (MA)."
      },
      {
        "id": "ma_flow_source",
        "name": "Flow Rate Source (MA)",
        "color": "#8b5cf6",
        "icon": "ma_flow_src",
        "category": "Sources",
        "params": {
          "rate": {
            "value": 0.1,
            "unit": "kg/s",
            "label": "Mass Flow Rate"
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "B"
          },
          {
            "id": "s",
            "pos": "top",
            "label": "S",
            "domain": "Physical"
          }
        ],
        "equation": "Flow Rate Source (MA) governing physical equation",
        "description": "Physical component model for Flow Rate Source (MA)."
      },
      {
        "id": "ma_pressure_source",
        "name": "Pressure Source (MA)",
        "color": "#8b5cf6",
        "icon": "ma_pres_src",
        "category": "Sources",
        "params": {
          "P": {
            "value": 100000,
            "unit": "Pa",
            "label": "Pressure Difference"
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A",
            "domain": "Fluid"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "B",
            "domain": "Fluid"
          },
          {
            "id": "s",
            "pos": "top",
            "label": "S",
            "domain": "Physical"
          }
        ],
        "equation": "Pressure Source (MA) governing physical equation",
        "description": "Physical component model for Pressure Source (MA)."
      },
      {
        "id": "ma_properties",
        "name": "Moist Air Properties (MA)",
        "color": "#8b5cf6",
        "icon": "ma_props",
        "category": "Utilities",
        "params": {
          "P_std": {
            "value": 101325,
            "unit": "Pa",
            "label": "Std Pressure"
          },
          "T_std": {
            "value": 293.15,
            "unit": "K",
            "label": "Std Temperature"
          }
        },
        "ports": [],
        "equation": "P_total = P_dry + P_vapor\\nRH = P_vapor / P_sat(T)",
        "description": "Defines thermodynamic properties of moist air including psychrometric constants and relative humidity relations."
      }
    ]
  },
  {
    "type": "Physical",
    "blocks": [
      {
        "id": "ps_delay",
        "name": "PS Constant Delay",
        "color": "#92400e",
        "icon": "ps_delay",
        "category": "Delays",
        "params": {
          "delay": {
            "value": 1,
            "unit": "s",
            "label": "Delay"
          }
        },
        "ports": [
          {
            "id": "u",
            "pos": "left",
            "label": "U"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "Y"
          }
        ],
        "equation": "PS Constant Delay governing physical equation",
        "description": "Physical component model for PS Constant Delay."
      },
      {
        "id": "ps_add",
        "name": "PS Add",
        "color": "#92400e",
        "icon": "ps_add",
        "category": "Functions",
        "params": {},
        "ports": [
          {
            "id": "u1",
            "pos": "left",
            "label": "+"
          },
          {
            "id": "u2",
            "pos": "left",
            "label": "+"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "Y"
          }
        ],
        "equation": "PS Add governing physical equation",
        "description": "Physical component model for PS Add."
      },
      {
        "id": "ps_subtract",
        "name": "PS Subtract",
        "color": "#92400e",
        "icon": "ps_subtract",
        "category": "Functions",
        "params": {},
        "ports": [
          {
            "id": "u1",
            "pos": "left",
            "label": "+"
          },
          {
            "id": "u2",
            "pos": "left",
            "label": "-"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "Y"
          }
        ],
        "equation": "y = u1 - u2",
        "description": "Subtracts input signal u2 from input signal u1."
      },
      {
        "id": "ps_gain",
        "name": "PS Gain",
        "color": "#92400e",
        "icon": "ps_gain",
        "category": "Functions",
        "params": {
          "gain": {
            "value": 1,
            "unit": "1",
            "label": "Gain"
          }
        },
        "ports": [
          {
            "id": "u",
            "pos": "left",
            "label": "U"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "Y"
          }
        ],
        "equation": "Y = Gain * U",
        "description": "Multiplies the input physical signal by a constant gain factor."
      },
      {
        "id": "ps_product",
        "name": "PS Product",
        "color": "#92400e",
        "icon": "ps_product",
        "category": "Functions",
        "params": {},
        "ports": [
          {
            "id": "u1",
            "pos": "left",
            "label": "*"
          },
          {
            "id": "u2",
            "pos": "left",
            "label": "*"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "Y"
          }
        ],
        "equation": "y = u1 * u2",
        "description": "Computes the product of two physical signals."
      },
      {
        "id": "ps_divide",
        "name": "PS Divide",
        "color": "#92400e",
        "icon": "ps_divide",
        "category": "Functions",
        "params": {},
        "ports": [
          {
            "id": "u1",
            "pos": "left",
            "label": "num"
          },
          {
            "id": "u2",
            "pos": "left",
            "label": "den"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "Y"
          }
        ],
        "equation": "y = u1 / (u2 != 0 ? u2 : ε)",
        "description": "Divides input signal u1 by u2 with zero-divisor protection."
      },
      {
        "id": "ps_math",
        "name": "PS Math Function",
        "color": "#92400e",
        "icon": "ps_math",
        "category": "Functions",
        "params": {
          "func": {
            "value": "exp",
            "unit": "",
            "label": "Function"
          }
        },
        "ports": [
          {
            "id": "u",
            "pos": "left",
            "label": "U"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "Y"
          }
        ],
        "equation": "PS Math Function governing physical equation",
        "description": "Physical component model for PS Math Function."
      },
      {
        "id": "ps_sum",
        "name": "PS Sum of Elements",
        "color": "#92400e",
        "icon": "ps_sum",
        "category": "Functions",
        "params": {},
        "ports": [
          {
            "id": "u",
            "pos": "left",
            "label": "U"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "Σ"
          }
        ],
        "equation": "y = u1 + u2",
        "description": "Adds two physical signals together to produce their algebraic sum."
      },
      {
        "id": "ps_integrator",
        "name": "PS Integrator",
        "color": "#92400e",
        "icon": "ps_integrator",
        "category": "Linear Operators",
        "params": {
          "initial": {
            "value": 0,
            "unit": "",
            "label": "Initial State"
          }
        },
        "ports": [
          {
            "id": "u",
            "pos": "left",
            "label": "U"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "Y"
          }
        ],
        "equation": "y(t) = ∫u(τ)dτ + y(0)",
        "description": "Integrates the input physical signal over time."
      },
      {
        "id": "ps_transfer_fcn",
        "name": "PS Transfer Function",
        "color": "#92400e",
        "icon": "ps_tf",
        "category": "Linear Operators",
        "params": {
          "T": {
            "value": 1,
            "unit": "s",
            "label": "Time Constant"
          }
        },
        "ports": [
          {
            "id": "u",
            "pos": "left",
            "label": "U"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "Y"
          }
        ],
        "equation": "PS Transfer Function governing physical equation",
        "description": "Physical component model for PS Transfer Function."
      },
      {
        "id": "ps_lookup_1d",
        "name": "PS Lookup Table (1D)",
        "color": "#92400e",
        "icon": "ps_lookup_1d",
        "category": "Lookup Tables",
        "params": {},
        "ports": [
          {
            "id": "u",
            "pos": "left",
            "label": "U"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "Y"
          }
        ],
        "equation": "PS Lookup Table (1D) governing physical equation",
        "description": "Physical component model for PS Lookup Table (1D)."
      },
      {
        "id": "ps_lookup_2d",
        "name": "PS Lookup Table (2D)",
        "color": "#92400e",
        "icon": "ps_lookup_2d",
        "category": "Lookup Tables",
        "params": {},
        "ports": [
          {
            "id": "u1",
            "pos": "left",
            "label": "U1"
          },
          {
            "id": "u2",
            "pos": "left",
            "label": "U2"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "Y"
          }
        ],
        "equation": "PS Lookup Table (2D) governing physical equation",
        "description": "Physical component model for PS Lookup Table (2D)."
      },
      {
        "id": "ps_abs",
        "name": "PS Abs",
        "color": "#92400e",
        "icon": "ps_abs",
        "category": "Nonlinear Operators",
        "params": {},
        "ports": [
          {
            "id": "u",
            "pos": "left",
            "label": "U"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "Y"
          }
        ],
        "equation": "y = |u|",
        "description": "Outputs the absolute (magnitude) value of the input physical signal."
      },
      {
        "id": "ps_saturation",
        "name": "PS Saturation",
        "color": "#92400e",
        "icon": "ps_sat",
        "category": "Nonlinear Operators",
        "params": {
          "upper": {
            "value": 1,
            "unit": "",
            "label": "Upper Limit"
          },
          "lower": {
            "value": -1,
            "unit": "",
            "label": "Lower Limit"
          }
        },
        "ports": [
          {
            "id": "u",
            "pos": "left",
            "label": "U"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "Y"
          }
        ],
        "equation": "y = min(upper, max(lower, u))",
        "description": "Limits input signal within upper and lower threshold saturation bounds."
      },
      {
        "id": "ps_dead_zone",
        "name": "PS Dead Zone",
        "color": "#92400e",
        "icon": "ps_dead",
        "category": "Nonlinear Operators",
        "params": {
          "start": {
            "value": 0.5,
            "unit": "",
            "label": "Start"
          },
          "end": {
            "value": -0.5,
            "unit": "",
            "label": "End"
          }
        },
        "ports": [
          {
            "id": "u",
            "pos": "left",
            "label": "U"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "Y"
          }
        ],
        "equation": "PS Dead Zone governing physical equation",
        "description": "Physical component model for PS Dead Zone."
      },
      {
        "id": "ps_switch",
        "name": "PS Switch",
        "color": "#92400e",
        "icon": "ps_switch",
        "category": "Nonlinear Operators",
        "params": {
          "threshold": {
            "value": 0,
            "unit": "",
            "label": "Threshold"
          }
        },
        "ports": [
          {
            "id": "u1",
            "pos": "left",
            "label": "1"
          },
          {
            "id": "ctrl",
            "pos": "left",
            "label": "C"
          },
          {
            "id": "u2",
            "pos": "left",
            "label": "2"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "Y"
          }
        ],
        "equation": "PS Switch governing physical equation",
        "description": "Physical component model for PS Switch."
      },
      {
        "id": "ps_min",
        "name": "PS Min",
        "color": "#92400e",
        "icon": "ps_min",
        "category": "Nonlinear Operators",
        "params": {
          "limit": {
            "value": 100,
            "unit": "",
            "label": "Saturation"
          }
        },
        "ports": [
          {
            "id": "u1",
            "pos": "left",
            "label": "1"
          },
          {
            "id": "u2",
            "pos": "left",
            "label": "2"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "MIN"
          }
        ],
        "equation": "y = min(u1, u2)",
        "description": "Selects the minimum value among the input physical signals."
      },
      {
        "id": "ps_max",
        "name": "PS Max",
        "color": "#92400e",
        "icon": "ps_max",
        "category": "Nonlinear Operators",
        "params": {
          "limit": {
            "value": -100,
            "unit": "",
            "label": "Saturation"
          }
        },
        "ports": [
          {
            "id": "u1",
            "pos": "left",
            "label": "1"
          },
          {
            "id": "u2",
            "pos": "left",
            "label": "2"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "MAX"
          }
        ],
        "equation": "y = max(u1, u2)",
        "description": "Selects the maximum value among the input physical signals."
      },
      {
        "id": "ps_rms",
        "name": "PS RMS Estimator",
        "color": "#92400e",
        "icon": "ps_rms",
        "category": "Periodic Operators",
        "params": {
          "window": {
            "value": 0.02,
            "unit": "s",
            "label": "Window"
          }
        },
        "ports": [
          {
            "id": "u",
            "pos": "left",
            "label": "U"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "RMS"
          }
        ],
        "equation": "PS RMS Estimator governing physical equation",
        "description": "Physical component model for PS RMS Estimator."
      },
      {
        "id": "bldc_commutation",
        "name": "BLDC Commutation Logic",
        "color": "#4b5563",
        "icon": "bldc_logic",
        "category": "BLDC Control",
        "params": {},
        "ports": [
          {
            "id": "hall",
            "pos": "left",
            "label": "Hall"
          },
          {
            "id": "dir",
            "pos": "left",
            "label": "Direction"
          },
          {
            "id": "abc",
            "pos": "right",
            "label": "abc"
          }
        ],
        "equation": "BLDC Commutation Logic governing physical equation",
        "description": "Physical component model for BLDC Commutation Logic."
      },
      {
        "id": "bldc_current_ctrl",
        "name": "BLDC Current Controller",
        "color": "#4b5563",
        "icon": "bldc_ctrl",
        "category": "BLDC Control",
        "params": {
          "Kp": {
            "value": 1,
            "unit": "",
            "label": "Prop Gain"
          },
          "Ki": {
            "value": 10,
            "unit": "",
            "label": "Int Gain"
          }
        },
        "ports": [
          {
            "id": "is_ref",
            "pos": "left",
            "label": "IsRef"
          },
          {
            "id": "is",
            "pos": "left",
            "label": "Is"
          },
          {
            "id": "reset",
            "pos": "left",
            "label": "Reset"
          },
          {
            "id": "hall",
            "pos": "left",
            "label": "Hall"
          },
          {
            "id": "dir",
            "pos": "left",
            "label": "Direction"
          },
          {
            "id": "vabc",
            "pos": "right",
            "label": "vabcRef"
          }
        ],
        "equation": "BLDC Current Controller governing physical equation",
        "description": "Physical component model for BLDC Current Controller."
      },
      {
        "id": "bldc_pwm_ctrl",
        "name": "BLDC Current Controller with PWM",
        "color": "#4b5563",
        "icon": "bldc_pwm",
        "category": "BLDC Control",
        "params": {
          "freq": {
            "value": 20000,
            "unit": "Hz",
            "label": "PWM Freq"
          }
        },
        "ports": [
          {
            "id": "is_ref",
            "pos": "left",
            "label": "IsRef"
          },
          {
            "id": "is",
            "pos": "left",
            "label": "Is"
          },
          {
            "id": "reset",
            "pos": "left",
            "label": "Reset"
          },
          {
            "id": "hall",
            "pos": "left",
            "label": "Hall"
          },
          {
            "id": "dir",
            "pos": "left",
            "label": "Direction"
          },
          {
            "id": "g",
            "pos": "right",
            "label": "G"
          }
        ],
        "equation": "BLDC Current Controller with PWM governing physical equation",
        "description": "Physical component model for BLDC Current Controller with PWM."
      },
      {
        "id": "dcdc_ctrl",
        "name": "DC-DC Voltage Controller",
        "color": "#4b5563",
        "icon": "dcdc_ctrl",
        "category": "Converter Control",
        "params": {
          "v_ref": {
            "value": 48,
            "unit": "V",
            "label": "Ref Voltage"
          }
        },
        "ports": [
          {
            "id": "v_ref",
            "pos": "left",
            "label": "vRef"
          },
          {
            "id": "v",
            "pos": "left",
            "label": "v"
          },
          {
            "id": "ff",
            "pos": "left",
            "label": "FF"
          },
          {
            "id": "reset",
            "pos": "left",
            "label": "Reset"
          },
          {
            "id": "ctrl",
            "pos": "right",
            "label": "Control"
          }
        ],
        "equation": "DC-DC Voltage Controller governing physical equation",
        "description": "Physical component model for DC-DC Voltage Controller."
      },
      {
        "id": "pfc_rectifier_ctrl",
        "name": "PFC Rectifier Controller",
        "color": "#4b5563",
        "icon": "pfc_ctrl",
        "category": "Converter Control",
        "params": {
          "Kp_v": {
            "value": 0.1,
            "unit": "",
            "label": "Volt Prop"
          },
          "Ki_v": {
            "value": 2,
            "unit": "",
            "label": "Volt Int"
          },
          "Kp_i": {
            "value": 1,
            "unit": "",
            "label": "Curr Prop"
          }
        },
        "ports": [
          {
            "id": "vdc_ref",
            "pos": "left",
            "label": "VdcRef (V)"
          },
          {
            "id": "q_ref",
            "pos": "left",
            "label": "QRef (pu)"
          },
          {
            "id": "vdc_sens",
            "pos": "left",
            "label": "VdcSens (V)"
          },
          {
            "id": "vabc_sens",
            "pos": "left",
            "label": "VabcSens (pu)"
          },
          {
            "id": "iabc_sens",
            "pos": "left",
            "label": "IabcSens (pu)"
          },
          {
            "id": "vabc_ref",
            "pos": "right",
            "label": "VabcRef (pu)"
          },
          {
            "id": "vis",
            "pos": "right",
            "label": "Visualization"
          }
        ],
        "equation": "PFC Rectifier Controller governing physical equation",
        "description": "Physical component model for PFC Rectifier Controller."
      },
      {
        "id": "cycloconverter_ctrl",
        "name": "Cycloconverter Controller",
        "color": "#4b5563",
        "icon": "cyclo_ctrl",
        "category": "Converter Control",
        "params": {
          "m": {
            "value": 0.8,
            "unit": "",
            "label": "Mod Index"
          },
          "bank_limit": {
            "value": 0.1,
            "unit": "s",
            "label": "Bank Delay"
          }
        },
        "ports": [
          {
            "id": "v_ref",
            "pos": "left",
            "label": "VRef"
          },
          {
            "id": "f_ref",
            "pos": "left",
            "label": "fRef"
          },
          {
            "id": "vabc",
            "pos": "left",
            "label": "vabc"
          },
          {
            "id": "vcyc",
            "pos": "left",
            "label": "Vcyc"
          },
          {
            "id": "icyc",
            "pos": "left",
            "label": "Icyc"
          },
          {
            "id": "p",
            "pos": "right",
            "label": "P"
          },
          {
            "id": "vis",
            "pos": "right",
            "label": "Visualization"
          }
        ],
        "equation": "Cycloconverter Controller governing physical equation",
        "description": "Physical component model for Cycloconverter Controller."
      },
      {
        "id": "ps_pi_ctrl",
        "name": "Discrete PI Controller",
        "color": "#4b5563",
        "icon": "pi_ctrl",
        "category": "General Control",
        "params": {
          "Kp": {
            "value": 1,
            "unit": "",
            "label": "Prop Gain"
          },
          "Ki": {
            "value": 10,
            "unit": "",
            "label": "Int Gain"
          },
          "limit": {
            "value": 1,
            "unit": "",
            "label": "Saturation"
          }
        },
        "ports": [
          {
            "id": "e",
            "pos": "left",
            "label": "e"
          },
          {
            "id": "reset",
            "pos": "left",
            "label": "Reset"
          },
          {
            "id": "u",
            "pos": "right",
            "label": "u"
          }
        ],
        "equation": "Discrete PI Controller governing physical equation",
        "description": "Physical component model for Discrete PI Controller."
      },
      {
        "id": "ps_pid_ctrl",
        "name": "Discrete PID Controller",
        "color": "#4b5563",
        "icon": "pid_ctrl",
        "category": "General Control",
        "params": {
          "Kp": {
            "value": 1,
            "unit": "",
            "label": "Prop Gain"
          },
          "Ki": {
            "value": 2,
            "unit": "",
            "label": "Int Gain"
          },
          "Kd": {
            "value": 0.1,
            "unit": "",
            "label": "Deriv Gain"
          },
          "N": {
            "value": 100,
            "unit": "",
            "label": "Filter Coeff"
          },
          "limit": {
            "value": 240,
            "unit": "",
            "label": "Saturation"
          }
        },
        "ports": [
          {
            "id": "e",
            "pos": "left",
            "label": "e"
          },
          {
            "id": "reset",
            "pos": "left",
            "label": "Reset"
          },
          {
            "id": "u",
            "pos": "right",
            "label": "u"
          }
        ],
        "equation": "u = PI + D",
        "description": "Standard discrete-time PID controller with derivative filtering and saturation limits."
      },
      {
        "id": "ps_lpf",
        "name": "Low-Pass Filter",
        "color": "#4b5563",
        "icon": "lpf",
        "category": "General Control",
        "params": {
          "f_cut": {
            "value": 100,
            "unit": "Hz",
            "label": "Cutoff Freq"
          }
        },
        "ports": [
          {
            "id": "u",
            "pos": "left",
            "label": "u"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "y"
          }
        ],
        "equation": "Low-Pass Filter governing physical equation",
        "description": "Physical component model for Low-Pass Filter."
      },
      {
        "id": "ps_integrator_gen",
        "name": "Integrator",
        "color": "#4b5563",
        "icon": "integrator",
        "category": "General Control",
        "params": {
          "initial": {
            "value": 0,
            "unit": "",
            "label": "Initial"
          }
        },
        "ports": [
          {
            "id": "u",
            "pos": "left",
            "label": "u"
          },
          {
            "id": "reset",
            "pos": "left",
            "label": "Reset"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "y"
          }
        ],
        "equation": "Integrator governing physical equation",
        "description": "Physical component model for Integrator."
      },
      {
        "id": "ps_moving_avg",
        "name": "Moving Average",
        "color": "#4b5563",
        "icon": "mov_avg",
        "category": "General Control",
        "params": {
          "window": {
            "value": 10,
            "unit": "samples",
            "label": "Window"
          }
        },
        "ports": [
          {
            "id": "u",
            "pos": "left",
            "label": "u"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "Mean"
          }
        ],
        "equation": "Moving Average governing physical equation",
        "description": "Physical component model for Moving Average."
      },
      {
        "id": "ps_sr_flipflop",
        "name": "SR Flip-Flop",
        "color": "#4b5563",
        "icon": "sr_ff",
        "category": "General Control",
        "params": {},
        "ports": [
          {
            "id": "s",
            "pos": "left",
            "label": "Set"
          },
          {
            "id": "r",
            "pos": "left",
            "label": "Reset"
          },
          {
            "id": "q",
            "pos": "right",
            "label": "Q"
          },
          {
            "id": "nq",
            "pos": "right",
            "label": "!Q"
          }
        ],
        "equation": "SR Flip-Flop governing physical equation",
        "description": "Physical component model for SR Flip-Flop."
      },
      {
        "id": "ps_sample_hold",
        "name": "Sample and Hold",
        "color": "#4b5563",
        "icon": "s_h",
        "category": "General Control",
        "params": {},
        "ports": [
          {
            "id": "u",
            "pos": "left",
            "label": "u"
          },
          {
            "id": "s",
            "pos": "left",
            "label": "S"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "y"
          }
        ],
        "equation": "Sample and Hold governing physical equation",
        "description": "Physical component model for Sample and Hold."
      },
      {
        "id": "ps_smith_predictor",
        "name": "Smith Predictor",
        "color": "#4b5563",
        "icon": "smith",
        "category": "General Control",
        "params": {
          "tau": {
            "value": 0.1,
            "unit": "s",
            "label": "Dead Time"
          }
        },
        "ports": [
          {
            "id": "r",
            "pos": "left",
            "label": "r"
          },
          {
            "id": "y",
            "pos": "left",
            "label": "y"
          },
          {
            "id": "u",
            "pos": "right",
            "label": "u"
          }
        ],
        "equation": "Smith Predictor governing physical equation",
        "description": "Physical component model for Smith Predictor."
      },
      {
        "id": "ps_sine_3phase",
        "name": "Sine Generator (3-Phase)",
        "color": "#4b5563",
        "icon": "sine_3ph",
        "category": "General Control",
        "params": {
          "amp": {
            "value": 1,
            "unit": "pu",
            "label": "Amplitude"
          },
          "freq": {
            "value": 50,
            "unit": "Hz",
            "label": "Frequency"
          }
        },
        "ports": [
          {
            "id": "m",
            "pos": "left",
            "label": "m"
          },
          {
            "id": "ang",
            "pos": "left",
            "label": "ang"
          },
          {
            "id": "abc",
            "pos": "right",
            "label": "abc"
          },
          {
            "id": "wt",
            "pos": "right",
            "label": "wt"
          }
        ],
        "equation": "Sine Generator (3-Phase) governing physical equation",
        "description": "Physical component model for Sine Generator (3-Phase)."
      },
      {
        "id": "ps_second_order_filter",
        "name": "Second-Order Filter",
        "color": "#4b5563",
        "icon": "second_order",
        "category": "General Control",
        "params": {
          "zeta": {
            "value": 0.707,
            "unit": "",
            "label": "Damping"
          },
          "wn": {
            "value": 100,
            "unit": "rad/s",
            "label": "Nat Freq"
          }
        },
        "ports": [
          {
            "id": "u",
            "pos": "left",
            "label": "u"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "y"
          }
        ],
        "equation": "d²y/dt² + 2*ζ*ωn*dy/dt + ωn²*y = ωn²*u",
        "description": "Second-order low-pass filter characterized by natural frequency ωn and damping ratio ζ."
      },
      {
        "id": "ps_state_feedback",
        "name": "State-Feedback Controller",
        "color": "#4b5563",
        "icon": "state_fb",
        "category": "General Control",
        "params": {
          "K": {
            "value": "[1 2]",
            "unit": "",
            "label": "Gain K"
          }
        },
        "ports": [
          {
            "id": "r",
            "pos": "left",
            "label": "r"
          },
          {
            "id": "x",
            "pos": "left",
            "label": "x"
          },
          {
            "id": "u",
            "pos": "right",
            "label": "u"
          },
          {
            "id": "reset",
            "pos": "left",
            "label": "Reset"
          }
        ],
        "equation": "State-Feedback Controller governing physical equation",
        "description": "Physical component model for State-Feedback Controller."
      },
      {
        "id": "ps_sliding_mode",
        "name": "Sliding Mode Controller",
        "color": "#4b5563",
        "icon": "smc",
        "category": "General Control",
        "params": {
          "lambda": {
            "value": 1,
            "unit": "",
            "label": "Surface"
          },
          "k": {
            "value": 10,
            "unit": "",
            "label": "Gain K"
          }
        },
        "ports": [
          {
            "id": "r",
            "pos": "left",
            "label": "r"
          },
          {
            "id": "y",
            "pos": "left",
            "label": "y"
          },
          {
            "id": "u",
            "pos": "right",
            "label": "u"
          }
        ],
        "equation": "Sliding Mode Controller governing physical equation",
        "description": "Physical component model for Sliding Mode Controller."
      },
      {
        "id": "ps_stair_gen",
        "name": "Stair Generator",
        "color": "#4b5563",
        "icon": "stair",
        "category": "General Control",
        "params": {
          "steps": {
            "value": "[0 1 2 1 0]",
            "unit": "",
            "label": "Steps"
          },
          "ts": {
            "value": 0.1,
            "unit": "s",
            "label": "Sample"
          }
        },
        "ports": [
          {
            "id": "y",
            "pos": "right",
            "label": "y"
          }
        ],
        "equation": "Stair Generator governing physical equation",
        "description": "Physical component model for Stair Generator."
      },
      {
        "id": "ps_washout",
        "name": "Washout Filter",
        "color": "#4b5563",
        "icon": "washout",
        "category": "General Control",
        "params": {
          "T": {
            "value": 0.1,
            "unit": "s",
            "label": "Time Const"
          }
        },
        "ports": [
          {
            "id": "u",
            "pos": "left",
            "label": "u"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "y"
          }
        ],
        "equation": "Washout Filter governing physical equation",
        "description": "Physical component model for Washout Filter."
      },
      {
        "id": "dc_current_ctrl",
        "name": "DC Current Controller",
        "color": "#4b5563",
        "icon": "dc_curr_ctrl",
        "category": "Machine Control",
        "params": {
          "Kp": {
            "value": 1,
            "unit": "",
            "label": "Prop Gain"
          },
          "Ki": {
            "value": 10,
            "unit": "",
            "label": "Int Gain"
          },
          "v_max": {
            "value": 240,
            "unit": "V",
            "label": "Max Voltage"
          }
        },
        "ports": [
          {
            "id": "i_ref",
            "pos": "left",
            "label": "iRef"
          },
          {
            "id": "i",
            "pos": "left",
            "label": "i"
          },
          {
            "id": "v_max",
            "pos": "left",
            "label": "vMax"
          },
          {
            "id": "reset",
            "pos": "left",
            "label": "Reset"
          },
          {
            "id": "v_ref",
            "pos": "right",
            "label": "vRef"
          }
        ],
        "equation": "DC Current Controller governing physical equation",
        "description": "Physical component model for DC Current Controller."
      },
      {
        "id": "dc_voltage_ctrl",
        "name": "DC Voltage Controller",
        "color": "#4b5563",
        "icon": "dc_volt_ctrl",
        "category": "Machine Control",
        "params": {
          "Kp": {
            "value": 0.5,
            "unit": "",
            "label": "Prop Gain"
          },
          "Ki": {
            "value": 5,
            "unit": "",
            "label": "Int Gain"
          }
        },
        "ports": [
          {
            "id": "v_ref",
            "pos": "left",
            "label": "vRef"
          },
          {
            "id": "v",
            "pos": "left",
            "label": "v"
          },
          {
            "id": "reset",
            "pos": "left",
            "label": "Reset"
          },
          {
            "id": "ctrl",
            "pos": "right",
            "label": "Control"
          }
        ],
        "equation": "DC Voltage Controller governing physical equation",
        "description": "Physical component model for DC Voltage Controller."
      },
      {
        "id": "hysteresis_ctrl_3ph",
        "name": "Hysteresis Current Controller (3-Ph)",
        "color": "#4b5563",
        "icon": "hyst_ctrl",
        "category": "Machine Control",
        "params": {
          "band": {
            "value": 0.1,
            "unit": "A",
            "label": "Hyst Band"
          }
        },
        "ports": [
          {
            "id": "iabc_ref",
            "pos": "left",
            "label": "iabc*"
          },
          {
            "id": "iabc",
            "pos": "left",
            "label": "iabc"
          },
          {
            "id": "s",
            "pos": "right",
            "label": "S"
          }
        ],
        "equation": "Hysteresis Current Controller (3-Ph) governing physical equation",
        "description": "Physical component model for Hysteresis Current Controller (3-Ph)."
      },
      {
        "id": "velocity_ctrl",
        "name": "Velocity Controller",
        "color": "#4b5563",
        "icon": "vel_ctrl",
        "category": "Machine Control",
        "params": {
          "Kp": {
            "value": 1,
            "unit": "",
            "label": "Prop Gain"
          },
          "Ki": {
            "value": 2,
            "unit": "",
            "label": "Int Gain"
          }
        },
        "ports": [
          {
            "id": "w_ref",
            "pos": "left",
            "label": "wRef"
          },
          {
            "id": "w_mech",
            "pos": "left",
            "label": "wMechanical"
          },
          {
            "id": "tq_sat",
            "pos": "left",
            "label": "TqRefSat"
          },
          {
            "id": "reset",
            "pos": "left",
            "label": "Reset"
          },
          {
            "id": "tq_unsat",
            "pos": "right",
            "label": "TqRefUnsat"
          }
        ],
        "equation": "Velocity Controller governing physical equation",
        "description": "Physical component model for Velocity Controller."
      },
      {
        "id": "im_scalar_ctrl",
        "name": "Induction Machine Scalar Control",
        "color": "#4b5563",
        "icon": "im_scalar",
        "category": "Induction Machine Control",
        "params": {
          "v_f_ratio": {
            "value": 4.4,
            "unit": "",
            "label": "V/f Ratio"
          }
        },
        "ports": [
          {
            "id": "f_ref",
            "pos": "left",
            "label": "fRef"
          },
          {
            "id": "vabc",
            "pos": "right",
            "label": "Vabc"
          }
        ],
        "equation": "Induction Machine Scalar Control governing physical equation",
        "description": "Physical component model for Induction Machine Scalar Control."
      },
      {
        "id": "im_foc_ctrl",
        "name": "Induction Machine FOC",
        "color": "#4b5563",
        "icon": "im_foc",
        "category": "Induction Machine Control",
        "params": {
          "Lm": {
            "value": 0.05,
            "unit": "H",
            "label": "Mutual Ind"
          },
          "Rr": {
            "value": 0.1,
            "unit": "Ohm",
            "label": "Rotor Res"
          },
          "mode": {
            "value": 1,
            "unit": "",
            "label": "Mode (0:V/f, 1:FOC)"
          },
          "v_f_ratio": {
            "value": 4.4,
            "unit": "",
            "label": "V/f Ratio"
          },
          "target_rpm": {
            "value": 1500,
            "unit": "RPM",
            "label": "Target Speed"
          }
        },
        "ports": [
          {
            "id": "imr_ref",
            "pos": "left",
            "label": "imrRef",
            "domain": "Physical"
          },
          {
            "id": "wr_ref",
            "pos": "left",
            "label": "wrRef",
            "domain": "Physical"
          },
          {
            "id": "iabc",
            "pos": "left",
            "label": "iabc",
            "domain": "Physical"
          },
          {
            "id": "wr",
            "pos": "left",
            "label": "wr",
            "domain": "Physical"
          },
          {
            "id": "vdc",
            "pos": "left",
            "label": "Vdc",
            "domain": "Physical"
          },
          {
            "id": "g",
            "pos": "right",
            "label": "G",
            "domain": "Physical"
          },
          {
            "id": "vabc",
            "pos": "right",
            "label": "Vabc",
            "domain": "Physical"
          },
          {
            "id": "vis",
            "pos": "right",
            "label": "Visualization",
            "domain": "Physical"
          }
        ],
        "equation": "Is_d = Ψr_ref / Lm\\nIs_q = (2/3)*(2/P)*(Lr/Lm)*(τ_ref/Ψr_ref)",
        "description": "Rotor flux-oriented Field Oriented Control (FOC) decoupled torque and flux regulator for Induction Machines."
      },
      {
        "id": "im_dtc_ctrl",
        "name": "Induction Machine DTC",
        "color": "#4b5563",
        "icon": "im_dtc",
        "category": "Induction Machine Control",
        "params": {
          "flux_ref": {
            "value": 0.8,
            "unit": "Wb",
            "label": "Flux Ref"
          }
        },
        "ports": [
          {
            "id": "flux_ref",
            "pos": "left",
            "label": "FluxRef"
          },
          {
            "id": "tq_ref",
            "pos": "left",
            "label": "TqRef"
          },
          {
            "id": "vabc",
            "pos": "left",
            "label": "vabc"
          },
          {
            "id": "iabc",
            "pos": "left",
            "label": "iabc"
          },
          {
            "id": "g",
            "pos": "right",
            "label": "G"
          }
        ],
        "equation": "Induction Machine DTC governing physical equation",
        "description": "Physical component model for Induction Machine DTC."
      },
      {
        "id": "im_curr_ctrl",
        "name": "Induction Machine Current Controller",
        "color": "#4b5563",
        "icon": "im_curr",
        "category": "Induction Machine Control",
        "params": {
          "Kp": {
            "value": 1,
            "unit": "",
            "label": "Prop Gain"
          }
        },
        "ports": [
          {
            "id": "idq_ref",
            "pos": "left",
            "label": "idqRef"
          },
          {
            "id": "idq",
            "pos": "left",
            "label": "idq"
          },
          {
            "id": "vdq_ff",
            "pos": "left",
            "label": "vdqFF"
          },
          {
            "id": "v_max",
            "pos": "left",
            "label": "VphMax"
          },
          {
            "id": "reset",
            "pos": "left",
            "label": "Reset"
          },
          {
            "id": "vdq_ref",
            "pos": "right",
            "label": "vdqRef"
          }
        ],
        "equation": "Induction Machine Current Controller governing physical equation",
        "description": "Physical component model for Induction Machine Current Controller."
      },
      {
        "id": "clarke_transform",
        "name": "Clarke Transform",
        "color": "#4b5563",
        "icon": "clarke",
        "category": "Math Transforms",
        "params": {
          "convention": {
            "value": "Peak Amp Preserved",
            "unit": "",
            "label": "Convention"
          }
        },
        "ports": [
          {
            "id": "abc",
            "pos": "left",
            "label": "abc"
          },
          {
            "id": "ab0",
            "pos": "right",
            "label": "ab0"
          }
        ],
        "equation": "I_alpha = I_a\nI_beta = (I_a + 2*I_b) / √3",
        "description": "Converts 3-phase stationary coordinates (abc) to 2-phase stationary frame (αβ)."
      },
      {
        "id": "inv_clarke_transform",
        "name": "Inverse Clarke Transform",
        "color": "#4b5563",
        "icon": "inv_clarke",
        "category": "Math Transforms",
        "params": {
          "convention": {
            "value": "Peak Amp Preserved",
            "unit": "",
            "label": "Convention"
          }
        },
        "ports": [
          {
            "id": "ab0",
            "pos": "left",
            "label": "ab0"
          },
          {
            "id": "abc",
            "pos": "right",
            "label": "abc"
          }
        ],
        "equation": "I_a = I_alpha\nI_b = -0.5*I_alpha + (√3/2)*I_beta\nI_c = -0.5*I_alpha - (√3/2)*I_beta",
        "description": "Converts 2-phase stationary coordinates (αβ) back to 3-phase frame (abc)."
      },
      {
        "id": "park_transform",
        "name": "Park Transform",
        "color": "#4b5563",
        "icon": "park",
        "category": "Math Transforms",
        "params": {
          "alignment": {
            "value": "90 deg behind A",
            "unit": "",
            "label": "Alignment"
          }
        },
        "ports": [
          {
            "id": "abc",
            "pos": "left",
            "label": "abc"
          },
          {
            "id": "theta",
            "pos": "left",
            "label": "theta"
          },
          {
            "id": "dq0",
            "pos": "right",
            "label": "dq0"
          }
        ],
        "equation": "I_d = I_alpha*cos(θ) + I_beta*sin(θ)\nI_q = -I_alpha*sin(θ) + I_beta*cos(θ)",
        "description": "Transforms stationary 2-phase frame (αβ) into rotating rotor reference frame (dq)."
      },
      {
        "id": "inv_park_transform",
        "name": "Inverse Park Transform",
        "color": "#4b5563",
        "icon": "inv_park",
        "category": "Math Transforms",
        "params": {
          "alignment": {
            "value": "90 deg behind A",
            "unit": "",
            "label": "Alignment"
          }
        },
        "ports": [
          {
            "id": "dq0",
            "pos": "left",
            "label": "dq0"
          },
          {
            "id": "theta",
            "pos": "left",
            "label": "theta"
          },
          {
            "id": "abc",
            "pos": "right",
            "label": "abc"
          }
        ],
        "equation": "I_alpha = I_d*cos(θ) - I_q*sin(θ)\nI_beta = I_d*sin(θ) + I_q*cos(θ)",
        "description": "Transforms rotating reference frame (dq) back into stationary 2-phase frame (αβ)."
      },
      {
        "id": "sym_comp_transform",
        "name": "Symmetrical-Components",
        "color": "#4b5563",
        "icon": "sym_comp",
        "category": "Math Transforms",
        "params": {
          "freq": {
            "value": 50,
            "unit": "Hz",
            "label": "Base Freq"
          }
        },
        "ports": [
          {
            "id": "abc",
            "pos": "left",
            "label": "abc"
          },
          {
            "id": "seq",
            "pos": "right",
            "label": "+-0"
          }
        ],
        "equation": "Symmetrical-Components governing physical equation",
        "description": "Physical component model for Symmetrical-Components."
      },
      {
        "id": "inv_sym_comp_transform",
        "name": "Inverse Symmetrical-Components",
        "color": "#4b5563",
        "icon": "inv_sym_comp",
        "category": "Math Transforms",
        "params": {
          "freq": {
            "value": 50,
            "unit": "Hz",
            "label": "Base Freq"
          }
        },
        "ports": [
          {
            "id": "seq",
            "pos": "left",
            "label": "+-0"
          },
          {
            "id": "abc",
            "pos": "right",
            "label": "abc"
          }
        ],
        "equation": "Inverse Symmetrical-Components governing physical equation",
        "description": "Physical component model for Inverse Symmetrical-Components."
      },
      {
        "id": "im_flux_observer",
        "name": "Induction Machine Flux Observer",
        "color": "#4b5563",
        "icon": "flux_obs",
        "category": "Observers & Sensors",
        "params": {
          "Rs": {
            "value": 0.1,
            "unit": "Ohm",
            "label": "Stator Res"
          },
          "Lm": {
            "value": 0.05,
            "unit": "H",
            "label": "Mutual Ind"
          }
        },
        "ports": [
          {
            "id": "iabc",
            "pos": "left",
            "label": "iabc"
          },
          {
            "id": "wr",
            "pos": "left",
            "label": "wr"
          },
          {
            "id": "idqsef",
            "pos": "right",
            "label": "idqseF"
          },
          {
            "id": "imr",
            "pos": "right",
            "label": "imr"
          },
          {
            "id": "theta",
            "pos": "right",
            "label": "theta"
          },
          {
            "id": "we",
            "pos": "right",
            "label": "we"
          }
        ],
        "equation": "Induction Machine Flux Observer governing physical equation",
        "description": "Physical component model for Induction Machine Flux Observer."
      },
      {
        "id": "luenberger_observer",
        "name": "Luenberger Observer",
        "color": "#4b5563",
        "icon": "luenberger",
        "category": "Observers & Sensors",
        "params": {
          "A": {
            "value": "[0 1; -1 -1]",
            "unit": "",
            "label": "System A"
          },
          "L": {
            "value": "[10; 10]",
            "unit": "",
            "label": "Gain L"
          }
        },
        "ports": [
          {
            "id": "u",
            "pos": "left",
            "label": "u"
          },
          {
            "id": "y",
            "pos": "left",
            "label": "y"
          },
          {
            "id": "xhat",
            "pos": "right",
            "label": "xhat"
          }
        ],
        "equation": "Luenberger Observer governing physical equation",
        "description": "Physical component model for Luenberger Observer."
      },
      {
        "id": "quad_decoder",
        "name": "Quadrature Shaft Decoder",
        "color": "#4b5563",
        "icon": "quad_dec",
        "category": "Observers & Sensors",
        "params": {
          "ppr": {
            "value": 1024,
            "unit": "",
            "label": "Pulses/Rev"
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A"
          },
          {
            "id": "b",
            "pos": "left",
            "label": "B"
          },
          {
            "id": "z",
            "pos": "left",
            "label": "Z"
          },
          {
            "id": "vel",
            "pos": "right",
            "label": "Velocity"
          },
          {
            "id": "pos",
            "pos": "right",
            "label": "Position"
          }
        ],
        "equation": "Quadrature Shaft Decoder governing physical equation",
        "description": "Physical component model for Quadrature Shaft Decoder."
      },
      {
        "id": "resolver_to_digital",
        "name": "Resolver-to-Digital Converter",
        "color": "#4b5563",
        "icon": "rtd",
        "category": "Observers & Sensors",
        "params": {
          "freq": {
            "value": 10000,
            "unit": "Hz",
            "label": "Excitation"
          }
        },
        "ports": [
          {
            "id": "vp",
            "pos": "left",
            "label": "Vp"
          },
          {
            "id": "vx",
            "pos": "left",
            "label": "Vx"
          },
          {
            "id": "vy",
            "pos": "left",
            "label": "Vy"
          },
          {
            "id": "vel",
            "pos": "right",
            "label": "Velocity"
          },
          {
            "id": "ang",
            "pos": "right",
            "label": "Angle"
          }
        ],
        "equation": "Resolver-to-Digital Converter governing physical equation",
        "description": "Physical component model for Resolver-to-Digital Converter."
      },
      {
        "id": "pmsm_curr_ctrl",
        "name": "PMSM Current Controller",
        "color": "#4b5563",
        "icon": "pmsm_curr",
        "category": "PMSM Control",
        "params": {
          "Kp": {
            "value": 2,
            "unit": "",
            "label": "Prop Gain"
          }
        },
        "ports": [
          {
            "id": "idq_ref",
            "pos": "left",
            "label": "idqRef"
          },
          {
            "id": "idq",
            "pos": "left",
            "label": "idq"
          },
          {
            "id": "vdq_ff",
            "pos": "left",
            "label": "vdqFF"
          },
          {
            "id": "v_max",
            "pos": "left",
            "label": "VphMax"
          },
          {
            "id": "reset",
            "pos": "left",
            "label": "Reset"
          },
          {
            "id": "vdq_ref",
            "pos": "right",
            "label": "vdqRef"
          }
        ],
        "equation": "PMSM Current Controller governing physical equation",
        "description": "Physical component model for PMSM Current Controller."
      },
      {
        "id": "pmsm_ref_gen",
        "name": "PMSM Current Reference Generator",
        "color": "#4b5563",
        "icon": "pmsm_ref",
        "category": "PMSM Control",
        "params": {
          "Ld": {
            "value": 0.005,
            "unit": "H",
            "label": "Ld Ind"
          },
          "Lq": {
            "value": 0.005,
            "unit": "H",
            "label": "Lq Ind"
          },
          "flux": {
            "value": 0.1,
            "unit": "Wb",
            "label": "PM Flux"
          }
        },
        "ports": [
          {
            "id": "tq_ref",
            "pos": "left",
            "label": "TqRef"
          },
          {
            "id": "w_mech",
            "pos": "left",
            "label": "wMechanical"
          },
          {
            "id": "vdc",
            "pos": "left",
            "label": "Vdc"
          },
          {
            "id": "idq_ref",
            "pos": "right",
            "label": "idqRef"
          },
          {
            "id": "tq_ref_sat",
            "pos": "right",
            "label": "TqRefSat"
          },
          {
            "id": "tq_lim",
            "pos": "right",
            "label": "TqLim"
          }
        ],
        "equation": "PMSM Current Reference Generator governing physical equation",
        "description": "Physical component model for PMSM Current Reference Generator."
      },
      {
        "id": "pmsm_foc",
        "name": "PMSM Field-Oriented Control",
        "color": "#4b5563",
        "icon": "pmsm_foc",
        "category": "PMSM Control",
        "params": {
          "Rs": {
            "value": 0.1,
            "unit": "Ohm",
            "label": "Stator Res"
          },
          "Kp": {
            "value": 5,
            "unit": "",
            "label": "Proportional Gain (Kp)"
          },
          "Ki": {
            "value": 100,
            "unit": "",
            "label": "Integral Gain (Ki)"
          }
        },
        "ports": [
          {
            "id": "ref",
            "pos": "left",
            "label": "Reference"
          },
          {
            "id": "iabc_s",
            "pos": "left",
            "label": "iabcSens"
          },
          {
            "id": "w_s",
            "pos": "left",
            "label": "wSens"
          },
          {
            "id": "th_s",
            "pos": "left",
            "label": "thSens"
          },
          {
            "id": "vdc_s",
            "pos": "left",
            "label": "vdcSens"
          },
          {
            "id": "g",
            "pos": "right",
            "label": "G"
          },
          {
            "id": "vis",
            "pos": "right",
            "label": "Visualization"
          }
        ],
        "equation": "Id_ref = 0 (or MTPA)\\nIq_ref = τ_ref / (1.5 * P * Ψf)",
        "description": "Field Oriented Control vector current regulator for Permanent Magnet Synchronous Motors."
      },
      {
        "id": "pmsm_field_weakening",
        "name": "PMSM Field-Weakening Controller",
        "color": "#4b5563",
        "icon": "pmsm_fw",
        "category": "PMSM Control",
        "params": {
          "v_margin": {
            "value": 0.95,
            "unit": "",
            "label": "Volt Margin"
          }
        },
        "ports": [
          {
            "id": "idq_ref",
            "pos": "left",
            "label": "idqRef"
          },
          {
            "id": "vdq",
            "pos": "left",
            "label": "vdq"
          },
          {
            "id": "v_max",
            "pos": "left",
            "label": "VphMax"
          },
          {
            "id": "idq_ref_fw",
            "pos": "right",
            "label": "idqRefFW"
          }
        ],
        "equation": "PMSM Field-Weakening Controller governing physical equation",
        "description": "Physical component model for PMSM Field-Weakening Controller."
      },
      {
        "id": "pmsm_tq_est",
        "name": "PMSM Torque Estimator",
        "color": "#4b5563",
        "icon": "pmsm_tq",
        "category": "PMSM Control",
        "params": {
          "pole_pairs": {
            "value": 4,
            "unit": "",
            "label": "Pole Pairs"
          }
        },
        "ports": [
          {
            "id": "idq",
            "pos": "left",
            "label": "idq"
          },
          {
            "id": "tq_est",
            "pos": "right",
            "label": "TqEst"
          }
        ],
        "equation": "PMSM Torque Estimator governing physical equation",
        "description": "Physical component model for PMSM Torque Estimator."
      },
      {
        "id": "pwm_3ph_2level",
        "name": "3-Phase Inverter Bridge",
        "color": "#4b5563",
        "icon": "pwm_3ph",
        "category": "Power Electronics",
        "params": {
          "f_sw": {
            "value": 5000,
            "unit": "Hz",
            "label": "Switch Freq"
          }
        },
        "ports": [
          {
            "id": "vabc",
            "pos": "left",
            "label": "Vabc",
            "domain": "Physical"
          },
          {
            "id": "p",
            "pos": "top",
            "label": "DC+",
            "domain": "Electrical"
          },
          {
            "id": "n",
            "pos": "bottom",
            "label": "DC-",
            "domain": "Electrical"
          },
          {
            "id": "a",
            "pos": "right",
            "label": "A",
            "domain": "Electrical"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "B",
            "domain": "Electrical"
          },
          {
            "id": "c",
            "pos": "right",
            "label": "C",
            "domain": "Electrical"
          }
        ],
        "equation": "3-Phase Inverter Bridge governing physical equation",
        "description": "Physical component model for 3-Phase Inverter Bridge."
      },
      {
        "id": "pwm_3ph_3level",
        "name": "PWM Generator (3-Phase, 3-Level)",
        "color": "#4b5563",
        "icon": "pwm_npc",
        "category": "PWM & Gate Generation",
        "params": {
          "f_sw": {
            "value": 2000,
            "unit": "Hz",
            "label": "Switch Freq"
          }
        },
        "ports": [
          {
            "id": "vabc",
            "pos": "left",
            "label": "Vabc"
          },
          {
            "id": "vdc",
            "pos": "left",
            "label": "Vdc"
          },
          {
            "id": "vneut",
            "pos": "left",
            "label": "vNeutral"
          },
          {
            "id": "g",
            "pos": "right",
            "label": "g"
          },
          {
            "id": "mod",
            "pos": "right",
            "label": "ModWave"
          }
        ],
        "equation": "PWM Generator (3-Phase, 3-Level) governing physical equation",
        "description": "Physical component model for PWM Generator (3-Phase, 3-Level)."
      },
      {
        "id": "pwm_vienna",
        "name": "PWM Generator (Vienna Rectifier)",
        "color": "#4b5563",
        "icon": "pwm_vienna",
        "category": "PWM & Gate Generation",
        "params": {
          "f_sw": {
            "value": 10000,
            "unit": "Hz",
            "label": "Switch Freq"
          }
        },
        "ports": [
          {
            "id": "vabc",
            "pos": "left",
            "label": "Vabc"
          },
          {
            "id": "iabc",
            "pos": "left",
            "label": "Iabc"
          },
          {
            "id": "vdc",
            "pos": "left",
            "label": "Vdc"
          },
          {
            "id": "vneut",
            "pos": "left",
            "label": "vNeutral"
          },
          {
            "id": "g",
            "pos": "right",
            "label": "g"
          }
        ],
        "equation": "PWM Generator (Vienna Rectifier) governing physical equation",
        "description": "Physical component model for PWM Generator (Vienna Rectifier)."
      },
      {
        "id": "thyristor_6pulse",
        "name": "Thyristor 6-Pulse Generator",
        "color": "#4b5563",
        "icon": "thy_6p",
        "category": "PWM & Gate Generation",
        "params": {
          "freq": {
            "value": 50,
            "unit": "Hz",
            "label": "Freq"
          }
        },
        "ports": [
          {
            "id": "theta",
            "pos": "left",
            "label": "theta"
          },
          {
            "id": "alpha",
            "pos": "left",
            "label": "alpha"
          },
          {
            "id": "p",
            "pos": "right",
            "label": "P"
          }
        ],
        "equation": "Thyristor 6-Pulse Generator governing physical equation",
        "description": "Physical component model for Thyristor 6-Pulse Generator."
      },
      {
        "id": "thyristor_12pulse",
        "name": "Thyristor 12-Pulse Generator",
        "color": "#4b5563",
        "icon": "thy_12p",
        "category": "PWM & Gate Generation",
        "params": {
          "freq": {
            "value": 50,
            "unit": "Hz",
            "label": "Freq"
          }
        },
        "ports": [
          {
            "id": "theta",
            "pos": "left",
            "label": "theta"
          },
          {
            "id": "alpha",
            "pos": "left",
            "label": "alpha"
          },
          {
            "id": "pdelta",
            "pos": "right",
            "label": "Pdelta"
          },
          {
            "id": "pwye",
            "pos": "right",
            "label": "Pwye"
          }
        ],
        "equation": "Thyristor 12-Pulse Generator governing physical equation",
        "description": "Physical component model for Thyristor 12-Pulse Generator."
      },
      {
        "id": "belt_properties",
        "name": "Belt-Cable Properties",
        "color": "#4b5563",
        "icon": "belt_props",
        "category": "Belts & Cables",
        "params": {
          "density": {
            "value": 1.1,
            "unit": "kg/m",
            "label": "Linear Dens"
          },
          "youngs": {
            "value": 1000000000,
            "unit": "Pa",
            "label": "Young Mod"
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "left",
            "label": "P"
          }
        ],
        "equation": "Belt-Cable Properties governing physical equation",
        "description": "Physical component model for Belt-Cable Properties."
      },
      {
        "id": "belt_end",
        "name": "Belt-Cable End",
        "color": "#4b5563",
        "icon": "belt_end",
        "category": "Belts & Cables",
        "params": {
          "stiffness": {
            "value": 1000000,
            "unit": "N/m",
            "label": "Stiffness"
          }
        },
        "ports": [
          {
            "id": "r",
            "pos": "left",
            "label": "R"
          },
          {
            "id": "e",
            "pos": "right",
            "label": "E"
          }
        ],
        "equation": "Belt-Cable End governing physical equation",
        "description": "Physical component model for Belt-Cable End."
      },
      {
        "id": "belt_spool",
        "name": "Belt-Cable Spool",
        "color": "#4b5563",
        "icon": "belt_spool",
        "category": "Belts & Cables",
        "params": {
          "radius": {
            "value": 0.1,
            "unit": "m",
            "label": "Radius"
          }
        },
        "ports": [
          {
            "id": "r",
            "pos": "left",
            "label": "R"
          },
          {
            "id": "a",
            "pos": "right",
            "label": "A"
          }
        ],
        "equation": "Belt-Cable Spool governing physical equation",
        "description": "Physical component model for Belt-Cable Spool."
      },
      {
        "id": "pulley",
        "name": "Pulley",
        "color": "#4b5563",
        "icon": "pulley",
        "category": "Belts & Cables",
        "params": {
          "radius": {
            "value": 0.1,
            "unit": "m",
            "label": "Radius"
          },
          "inertia": {
            "value": 0.01,
            "unit": "kg-m2",
            "label": "Inertia"
          }
        },
        "ports": [
          {
            "id": "r",
            "pos": "left",
            "label": "R"
          },
          {
            "id": "a",
            "pos": "right",
            "label": "A"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "B"
          }
        ],
        "equation": "Pulley governing physical equation",
        "description": "Physical component model for Pulley."
      },
      {
        "id": "world_frame",
        "name": "World Frame",
        "color": "#4b5563",
        "icon": "world_frame",
        "category": "Frames & Transforms",
        "params": {},
        "ports": [
          {
            "id": "w",
            "pos": "right",
            "label": "W"
          }
        ],
        "equation": "World Frame governing physical equation",
        "description": "Physical component model for World Frame."
      },
      {
        "id": "ref_frame",
        "name": "Reference Frame",
        "color": "#4b5563",
        "icon": "ref_frame",
        "category": "Frames & Transforms",
        "params": {},
        "ports": [
          {
            "id": "r",
            "pos": "right",
            "label": "R"
          }
        ],
        "equation": "Reference Frame governing physical equation",
        "description": "Physical component model for Reference Frame."
      },
      {
        "id": "rigid_transform",
        "name": "Rigid Transform",
        "color": "#4b5563",
        "icon": "rigid_trans",
        "category": "Frames & Transforms",
        "params": {
          "offset": {
            "value": "[0 0 0]",
            "unit": "m",
            "label": "Offset"
          },
          "rotation": {
            "value": "[0 0 0]",
            "unit": "deg",
            "label": "Rotation"
          }
        },
        "ports": [
          {
            "id": "b",
            "pos": "left",
            "label": "B"
          },
          {
            "id": "f",
            "pos": "right",
            "label": "F"
          }
        ],
        "equation": "Rigid Transform governing physical equation",
        "description": "Physical component model for Rigid Transform."
      },
      {
        "id": "dist_constraint",
        "name": "Distance Constraint",
        "color": "#4b5563",
        "icon": "dist_cons",
        "category": "Constraints",
        "params": {
          "dist": {
            "value": 1,
            "unit": "m",
            "label": "Distance"
          }
        },
        "ports": [
          {
            "id": "b",
            "pos": "left",
            "label": "B"
          },
          {
            "id": "f",
            "pos": "right",
            "label": "F"
          }
        ],
        "equation": "Distance Constraint governing physical equation",
        "description": "Physical component model for Distance Constraint."
      },
      {
        "id": "angle_constraint",
        "name": "Angle Constraint",
        "color": "#4b5563",
        "icon": "angle_cons",
        "category": "Constraints",
        "params": {
          "angle": {
            "value": 0,
            "unit": "deg",
            "label": "Angle"
          }
        },
        "ports": [
          {
            "id": "b",
            "pos": "left",
            "label": "B"
          },
          {
            "id": "f",
            "pos": "right",
            "label": "F"
          }
        ],
        "equation": "Angle Constraint governing physical equation",
        "description": "Physical component model for Angle Constraint."
      },
      {
        "id": "grav_field",
        "name": "Gravitational Field",
        "color": "#4b5563",
        "icon": "grav",
        "category": "Forces & Torques",
        "params": {
          "g": {
            "value": 9.81,
            "unit": "m/s2",
            "label": "Gravity"
          }
        },
        "ports": [
          {
            "id": "b",
            "pos": "left",
            "label": "B"
          },
          {
            "id": "f",
            "pos": "right",
            "label": "F"
          }
        ],
        "equation": "Gravitational Field governing physical equation",
        "description": "Physical component model for Gravitational Field."
      },
      {
        "id": "spring_damper_force",
        "name": "Spring and Damper Force",
        "color": "#4b5563",
        "icon": "spring_damper",
        "category": "Forces & Torques",
        "params": {
          "k": {
            "value": 1000,
            "unit": "N/m",
            "label": "Stiffness"
          },
          "b": {
            "value": 10,
            "unit": "N-s/m",
            "label": "Damping"
          }
        },
        "ports": [
          {
            "id": "b",
            "pos": "left",
            "label": "B"
          },
          {
            "id": "f",
            "pos": "right",
            "label": "F"
          }
        ],
        "equation": "Spring and Damper Force governing physical equation",
        "description": "Physical component model for Spring and Damper Force."
      },
      {
        "id": "external_force",
        "name": "External Force and Torque",
        "color": "#4b5563",
        "icon": "ext_force",
        "category": "Forces & Torques",
        "params": {
          "force_scale": {
            "value": 1,
            "unit": "1",
            "label": "Force Scale"
          },
          "torque_scale": {
            "value": 1,
            "unit": "1",
            "label": "Torque Scale"
          }
        },
        "ports": [
          {
            "id": "f",
            "pos": "left",
            "label": "F"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "B"
          }
        ],
        "equation": "External Force and Torque governing physical equation",
        "description": "Physical component model for External Force and Torque."
      },
      {
        "id": "revolute_joint",
        "name": "Revolute Joint",
        "color": "#4b5563",
        "icon": "rev_joint",
        "category": "Joints",
        "params": {
          "damping": {
            "value": 0.1,
            "unit": "N-m-s/rad",
            "label": "Damping"
          }
        },
        "ports": [
          {
            "id": "b",
            "pos": "left",
            "label": "B"
          },
          {
            "id": "f",
            "pos": "right",
            "label": "F"
          }
        ],
        "equation": "Revolute Joint governing physical equation",
        "description": "Physical component model for Revolute Joint."
      },
      {
        "id": "prismatic_joint",
        "name": "Prismatic Joint",
        "color": "#4b5563",
        "icon": "prism_joint",
        "category": "Joints",
        "params": {
          "damping": {
            "value": 1,
            "unit": "N-s/m",
            "label": "Damping"
          }
        },
        "ports": [
          {
            "id": "b",
            "pos": "left",
            "label": "B"
          },
          {
            "id": "f",
            "pos": "right",
            "label": "F"
          }
        ],
        "equation": "Prismatic Joint governing physical equation",
        "description": "Physical component model for Prismatic Joint."
      },
      {
        "id": "spherical_joint",
        "name": "Spherical Joint",
        "color": "#4b5563",
        "icon": "sphere_joint",
        "category": "Joints",
        "params": {
          "damping": {
            "value": 0.05,
            "unit": "N-m-s/rad",
            "label": "Damping"
          }
        },
        "ports": [
          {
            "id": "b",
            "pos": "left",
            "label": "B"
          },
          {
            "id": "f",
            "pos": "right",
            "label": "F"
          }
        ],
        "equation": "Spherical Joint governing physical equation",
        "description": "Physical component model for Spherical Joint."
      },
      {
        "id": "universal_joint",
        "name": "Universal Joint",
        "color": "#4b5563",
        "icon": "univ_joint",
        "category": "Joints",
        "params": {
          "damping": {
            "value": 0.05,
            "unit": "N-m-s/rad",
            "label": "Damping"
          }
        },
        "ports": [
          {
            "id": "b",
            "pos": "left",
            "label": "B"
          },
          {
            "id": "f",
            "pos": "right",
            "label": "F"
          }
        ],
        "equation": "Universal Joint governing physical equation",
        "description": "Physical component model for Universal Joint."
      },
      {
        "id": "weld_joint",
        "name": "Weld Joint",
        "color": "#4b5563",
        "icon": "weld_joint",
        "category": "Joints",
        "params": {
          "stiffness": {
            "value": 1000000000,
            "unit": "N/m",
            "label": "Stiffness"
          }
        },
        "ports": [
          {
            "id": "b",
            "pos": "left",
            "label": "B"
          },
          {
            "id": "f",
            "pos": "right",
            "label": "F"
          }
        ],
        "equation": "Weld Joint governing physical equation",
        "description": "Physical component model for Weld Joint."
      },
      {
        "id": "common_gear",
        "name": "Common Gear Constraint",
        "color": "#4b5563",
        "icon": "gear_cons",
        "category": "Gears",
        "params": {
          "ratio": {
            "value": 2,
            "unit": "",
            "label": "Ratio"
          }
        },
        "ports": [
          {
            "id": "b",
            "pos": "left",
            "label": "B"
          },
          {
            "id": "f",
            "pos": "right",
            "label": "F"
          }
        ],
        "equation": "Common Gear Constraint governing physical equation",
        "description": "Physical component model for Common Gear Constraint."
      },
      {
        "id": "rack_pinion",
        "name": "Rack and Pinion Constraint",
        "color": "#4b5563",
        "icon": "rack_pinion",
        "category": "Gears",
        "params": {
          "radius": {
            "value": 0.1,
            "unit": "m",
            "label": "Radius"
          }
        },
        "ports": [
          {
            "id": "b",
            "pos": "left",
            "label": "B"
          },
          {
            "id": "f",
            "pos": "right",
            "label": "F"
          }
        ],
        "equation": "v = r * ω\nτ = r * F",
        "description": "Converts rotary motion and torque into linear velocity and force via pinion radius r."
      },
      {
        "id": "mech_config",
        "name": "Mechanism Configuration",
        "color": "#4b5563",
        "icon": "mech_cfg",
        "category": "Multibody Utilities",
        "params": {
          "gravity": {
            "value": "[0 0 -9.81]",
            "unit": "m/s2",
            "label": "Gravity"
          }
        },
        "ports": [
          {
            "id": "c",
            "pos": "right",
            "label": "C"
          }
        ],
        "equation": "Mechanism Configuration governing physical equation",
        "description": "Physical component model for Mechanism Configuration."
      },
      {
        "id": "ps_terminator",
        "name": "PS Terminator",
        "color": "#92400e",
        "icon": "ps_term",
        "category": "Sinks",
        "params": {},
        "ports": [
          {
            "id": "u",
            "pos": "left",
            "label": ""
          }
        ],
        "equation": "Terminal unconnected (sink)",
        "description": "Terminates unused physical signal outputs to prevent solver floating port warnings."
      },
      {
        "id": "constant",
        "name": "Constant",
        "color": "#92400e",
        "icon": "ps_const",
        "category": "Sources",
        "params": {
          "value": {
            "value": 1,
            "unit": "1",
            "label": "Constant Value"
          }
        },
        "ports": [
          {
            "id": "y",
            "pos": "right",
            "label": "C",
            "domain": "Physical"
          }
        ],
        "equation": "y(t) = Value",
        "description": "Outputs a steady constant scalar value across all simulation time."
      },
      {
        "id": "ps_constant",
        "name": "PS Constant",
        "color": "#92400e",
        "icon": "ps_const",
        "category": "Sources",
        "params": {
          "value": {
            "value": 1,
            "unit": "1",
            "label": "Constant"
          }
        },
        "ports": [
          {
            "id": "y",
            "pos": "right",
            "label": "C",
            "domain": "Physical"
          }
        ],
        "equation": "y(t) = Value",
        "description": "Outputs a steady constant scalar value across all simulation time."
      },
      {
        "id": "ps_sine",
        "name": "PS Sine Wave",
        "color": "#92400e",
        "icon": "ps_sine",
        "category": "Sources",
        "params": {
          "amp": {
            "value": 1,
            "unit": "1",
            "label": "Amplitude"
          },
          "freq": {
            "value": 1,
            "unit": "Hz",
            "label": "Frequency"
          }
        },
        "ports": [
          {
            "id": "y",
            "pos": "right",
            "label": "y"
          }
        ],
        "equation": "PS Sine Wave governing physical equation",
        "description": "Physical component model for PS Sine Wave."
      },
      {
        "id": "ps_step",
        "name": "PS Step",
        "color": "#92400e",
        "icon": "ps_step",
        "category": "Sources",
        "params": {
          "time": {
            "value": 1,
            "unit": "s",
            "label": "Step Time"
          },
          "initial": {
            "value": 0,
            "unit": "1",
            "label": "Initial"
          },
          "final": {
            "value": 1,
            "unit": "1",
            "label": "Final"
          }
        },
        "ports": [
          {
            "id": "y",
            "pos": "right",
            "label": "y"
          }
        ],
        "equation": "y(t) = (t >= StepTime) ? (InitialValue + StepSize) : InitialValue",
        "description": "Heaviside step input transitioning abruptly at the specified step time."
      },
      {
        "id": "ps_ramp",
        "name": "PS Ramp",
        "color": "#92400e",
        "icon": "ps_ramp",
        "category": "Sources",
        "params": {
          "slope": {
            "value": 1,
            "unit": "1/s",
            "label": "Slope"
          },
          "start": {
            "value": 0,
            "unit": "s",
            "label": "Start Time"
          }
        },
        "ports": [
          {
            "id": "y",
            "pos": "right",
            "label": "y"
          }
        ],
        "equation": "y(t) = (t >= StartTime) ? Slope * (t - StartTime) + Offset : Offset",
        "description": "Linear ramp generator increasing signal value at constant slope rate."
      },
      {
        "id": "lms_adaptive_filter",
        "name": "LMS Adaptive Filter",
        "color": "#c9a86c",
        "icon": "graduation-cap",
        "category": "Learning Models",
        "params": {
          "lr": {
            "value": 0.05,
            "unit": "1",
            "label": "Learning Rate"
          }
        },
        "ports": [
          {
            "id": "x",
            "pos": "left",
            "label": "x",
            "domain": "Physical"
          },
          {
            "id": "d",
            "pos": "left",
            "label": "d",
            "domain": "Physical"
          },
          {
            "id": "lr",
            "pos": "bottom",
            "label": "lr",
            "domain": "Physical"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "y",
            "domain": "Physical"
          },
          {
            "id": "err",
            "pos": "right",
            "label": "err",
            "domain": "Physical"
          },
          {
            "id": "w1",
            "pos": "right",
            "label": "w1",
            "domain": "Physical"
          },
          {
            "id": "w2",
            "pos": "right",
            "label": "w2",
            "domain": "Physical"
          }
        ],
        "equation": "y = w1*x + w2*x_prev\\nerr = d - y\\nw = w + lr*err*x_vec",
        "description": "A 2-tap Least Mean Squares (LMS) Adaptive Filter. Automatically learns to predict a target signal d from an input x by updating filter weights w1 and w2."
      },
      {
        "id": "neural_neuron_learning",
        "name": "Neural Neuron Learner",
        "color": "#c9a86c",
        "icon": "graduation-cap",
        "category": "Learning Models",
        "params": {
          "lr": {
            "value": 0.1,
            "unit": "1",
            "label": "Learning Rate"
          },
          "initW1": {
            "value": 0.5,
            "unit": "1",
            "label": "Init Weight 1"
          },
          "initW2": {
            "value": -0.5,
            "unit": "1",
            "label": "Init Weight 2"
          },
          "initBias": {
            "value": 0,
            "unit": "1",
            "label": "Init Bias"
          }
        },
        "ports": [
          {
            "id": "x1",
            "pos": "left",
            "label": "x1",
            "domain": "Physical"
          },
          {
            "id": "x2",
            "pos": "left",
            "label": "x2",
            "domain": "Physical"
          },
          {
            "id": "target",
            "pos": "left",
            "label": "target",
            "domain": "Physical"
          },
          {
            "id": "lr",
            "pos": "bottom",
            "label": "lr",
            "domain": "Physical"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "y",
            "domain": "Physical"
          },
          {
            "id": "err",
            "pos": "right",
            "label": "err",
            "domain": "Physical"
          },
          {
            "id": "w1",
            "pos": "right",
            "label": "w1",
            "domain": "Physical"
          },
          {
            "id": "w2",
            "pos": "right",
            "label": "w2",
            "domain": "Physical"
          },
          {
            "id": "bias",
            "pos": "right",
            "label": "bias",
            "domain": "Physical"
          }
        ],
        "equation": "y = tanh(w1*x1 + w2*x2 + bias)\\nerr = target - y\\ndw = lr*err*(1-y^2)*x",
        "description": "A Single-Neuron Online Gradient Descent Learner using a tanh activation function. Trains weights and bias via online backpropagation."
      },
      {
        "id": "rl_q_learning_controller",
        "name": "RL Q-Learning Agent",
        "color": "#c9a86c",
        "icon": "graduation-cap",
        "category": "Learning Models",
        "params": {
          "alpha": {
            "value": 0.1,
            "unit": "1",
            "label": "Alpha (Learning Rate)"
          },
          "gamma": {
            "value": 0.9,
            "unit": "1",
            "label": "Gamma (Discount Factor)"
          },
          "epsilon": {
            "value": 0.1,
            "unit": "1",
            "label": "Epsilon (Exploration Rate)"
          },
          "numStates": {
            "value": 5,
            "unit": "1",
            "label": "Number of States"
          },
          "numActions": {
            "value": 3,
            "unit": "1",
            "label": "Number of Actions"
          }
        },
        "ports": [
          {
            "id": "error",
            "pos": "left",
            "label": "error",
            "domain": "Physical"
          },
          {
            "id": "reward",
            "pos": "left",
            "label": "reward",
            "domain": "Physical"
          },
          {
            "id": "reset",
            "pos": "bottom",
            "label": "reset",
            "domain": "Physical"
          },
          {
            "id": "action",
            "pos": "right",
            "label": "action",
            "domain": "Physical"
          },
          {
            "id": "max_q",
            "pos": "right",
            "label": "max_q",
            "domain": "Physical"
          }
        ],
        "equation": "Q(s,a) += α*(R + γ*max_q(s') - Q(s,a))",
        "description": "Discrete Q-learning control agent. Maps continuous system error into a configurable number of state bins, selects control actions spaced between [-1, 1], and updates Q-values online."
      },
      {
        "id": "ac_motor_pid_control",
        "name": "AC Motor PID Control",
        "color": "#c9a86c",
        "icon": "graduation-cap",
        "category": "Learning Models",
        "params": {
          "Kp": {
            "value": 2.5,
            "unit": "1",
            "label": "Prop Gain"
          },
          "Ki": {
            "value": 1.2,
            "unit": "1",
            "label": "Int Gain"
          },
          "Kd": {
            "value": 0.1,
            "unit": "1",
            "label": "Deriv Gain"
          },
          "w_ref": {
            "value": 157,
            "unit": "rad/s",
            "label": "Ref Speed"
          },
          "tl": {
            "value": 0,
            "unit": "N-m",
            "label": "Load Torque"
          },
          "Rs": {
            "value": 0.5,
            "unit": "Ω",
            "label": "Stator Res"
          },
          "Ls": {
            "value": 0.1,
            "unit": "H",
            "label": "Stator Ind"
          },
          "Rr": {
            "value": 0.4,
            "unit": "Ω",
            "label": "Rotor Res"
          },
          "Lr": {
            "value": 0.1,
            "unit": "H",
            "label": "Rotor Ind"
          },
          "Lm": {
            "value": 0.09,
            "unit": "H",
            "label": "Mutual Ind"
          },
          "P": {
            "value": 2,
            "unit": "1",
            "label": "Pole Pairs"
          },
          "J": {
            "value": 0.01,
            "unit": "kg-m^2",
            "label": "Inertia"
          },
          "B": {
            "value": 0.001,
            "unit": "N-m-s/rad",
            "label": "Damping"
          },
          "N": {
            "value": 100,
            "unit": "1",
            "label": "Filter Coeff"
          }
        },
        "ports": [
          {
            "id": "w_ref",
            "pos": "left",
            "label": "w_ref",
            "domain": "Physical"
          },
          {
            "id": "tl",
            "pos": "bottom",
            "label": "tl",
            "domain": "Physical"
          },
          {
            "id": "omega",
            "pos": "right",
            "label": "omega",
            "domain": "Physical"
          },
          {
            "id": "error",
            "pos": "right",
            "label": "error",
            "domain": "Physical"
          },
          {
            "id": "te",
            "pos": "right",
            "label": "te",
            "domain": "Physical"
          }
        ],
        "equation": "Pedagogical model for PID Speed Control of an Induction Motor.",
        "description": "A complete pedagogical model for PID Speed Control of an Induction Motor. It integrates the motor dynamics and the speed regulator into one block for easy analysis of tuning effects."
      }
    ]
  },
  {
    "type": "Thermal",
    "blocks": [
      {
        "id": "conductive_heat",
        "name": "Conductive Heat Transfer",
        "color": "#f97316",
        "icon": "conductive",
        "category": "Elements",
        "params": {
          "k": {
            "value": 1,
            "unit": "W/K",
            "label": "Conductance"
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "B"
          }
        ],
        "equation": "Q = (k * A / L) * (T1 - T2)",
        "description": "Fourier conductive heat transfer through a solid medium with conductivity k and area A."
      },
      {
        "id": "convective_heat",
        "name": "Convective Heat Transfer",
        "color": "#f97316",
        "icon": "convective",
        "category": "Elements",
        "params": {
          "h": {
            "value": 10,
            "unit": "W/m^2/K",
            "label": "Heat Coeff"
          },
          "A": {
            "value": 1,
            "unit": "m^2",
            "label": "Area"
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "B"
          }
        ],
        "equation": "Q = h * A * (T_solid - T_fluid)",
        "description": "Newton convective heat transfer between solid surface and fluid with convection coefficient h."
      },
      {
        "id": "radiative_heat",
        "name": "Radiative Heat Transfer",
        "color": "#f97316",
        "icon": "radiative",
        "category": "Elements",
        "params": {
          "eps": {
            "value": 0.9,
            "unit": "1",
            "label": "Emissivity"
          },
          "A": {
            "value": 1,
            "unit": "m^2",
            "label": "Area"
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "B"
          }
        ],
        "equation": "Q = ε * σ * A * (T1⁴ - T2⁴)",
        "description": "Stefan-Boltzmann radiative heat transfer between radiating surface and surroundings."
      },
      {
        "id": "thermal_mass",
        "name": "Thermal Mass",
        "color": "#f97316",
        "icon": "thermal_mass",
        "category": "Elements",
        "params": {
          "C": {
            "value": 1000,
            "unit": "J/K",
            "label": "Thermal Capacity"
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "top",
            "label": "A"
          }
        ],
        "equation": "Q = m * c_p * dT/dt",
        "description": "Lumped heat capacity element storing thermal energy proportional to temperature derivative."
      },
      {
        "id": "thermal_ref",
        "name": "Thermal Reference",
        "color": "#f97316",
        "icon": "thermal_ref",
        "category": "Elements",
        "params": {},
        "ports": [
          {
            "id": "a",
            "pos": "top",
            "label": "A"
          }
        ],
        "equation": "T = 293.15 K (20 °C)",
        "description": "Ambient temperature thermal reference representing fixed-temperature environment boundary."
      },
      {
        "id": "heat_flow_sensor",
        "name": "Heat Flow Rate Sensor",
        "color": "#f97316",
        "icon": "heat_sensor",
        "category": "Sensors",
        "params": {},
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "B"
          },
          {
            "id": "h",
            "pos": "top",
            "label": "H",
            "domain": "Physical"
          }
        ],
        "equation": "Q_out = Q_branch",
        "description": "Measures heat flow rate passing through a thermal branch without introducing thermal resistance."
      },
      {
        "id": "temp_sensor",
        "name": "Temperature Sensor",
        "color": "#f97316",
        "icon": "temp_sensor",
        "category": "Sensors",
        "params": {},
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "B"
          },
          {
            "id": "t",
            "pos": "top",
            "label": "T",
            "domain": "Physical"
          }
        ],
        "equation": "T_out = T_a - T_b",
        "description": "Measures temperature difference between two thermal nodes and outputs a physical signal."
      },
      {
        "id": "heat_src",
        "name": "Heat Flow Rate Source",
        "color": "#f97316",
        "icon": "heat_src",
        "category": "Sources",
        "params": {
          "Q": {
            "value": 10,
            "unit": "W",
            "label": "Heat Flow Rate"
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "bottom",
            "label": "A"
          },
          {
            "id": "b",
            "pos": "top",
            "label": "B"
          }
        ],
        "equation": "Heat Flow Rate Source governing physical equation",
        "description": "Physical component model for Heat Flow Rate Source."
      },
      {
        "id": "temp_src",
        "name": "Temperature Source",
        "color": "#f97316",
        "icon": "temp_src",
        "category": "Sources",
        "params": {
          "T": {
            "value": 293.15,
            "unit": "K",
            "label": "Temperature"
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "top",
            "label": "A"
          }
        ],
        "equation": "T_node = T_param (or T_cmd)",
        "description": "Ideal temperature source maintaining commanded temperature at its thermal port."
      },
      {
        "id": "ctrl_heat_src",
        "name": "Controlled Heat Flow Rate Source",
        "color": "#f97316",
        "icon": "ctrl_heat_src",
        "category": "Sources",
        "params": {},
        "ports": [
          {
            "id": "a",
            "pos": "bottom",
            "label": "A",
            "domain": "Thermal"
          },
          {
            "id": "b",
            "pos": "top",
            "label": "B",
            "domain": "Thermal"
          },
          {
            "id": "s",
            "pos": "left",
            "label": "S",
            "domain": "Physical"
          }
        ],
        "equation": "Controlled Heat Flow Rate Source governing physical equation",
        "description": "Physical component model for Controlled Heat Flow Rate Source."
      },
      {
        "id": "ctrl_temp_src",
        "name": "Controlled Temperature Source",
        "color": "#f97316",
        "icon": "ctrl_temp_src",
        "category": "Sources",
        "params": {},
        "ports": [
          {
            "id": "a",
            "pos": "bottom",
            "label": "A"
          },
          {
            "id": "b",
            "pos": "top",
            "label": "B"
          },
          {
            "id": "s",
            "pos": "left",
            "label": "S",
            "domain": "Physical"
          }
        ],
        "equation": "Controlled Temperature Source governing physical equation",
        "description": "Physical component model for Controlled Temperature Source."
      }
    ]
  },
  {
    "type": "Consumer Appliances",
    "blocks": [
      {
        "id": "washing_basket",
        "name": "Washing Basket",
        "color": "#06b6d4",
        "icon": "washing_basket",
        "category": "Elements",
        "params": {
          "J_basket": {
            "value": 0.1,
            "unit": "kg-m^2",
            "label": "Basket Inertia"
          },
          "load_mass": {
            "value": 5,
            "unit": "kg",
            "label": "Clothes Mass"
          },
          "unbalance": {
            "value": 0.5,
            "unit": "kg",
            "label": "Unbalance Mass"
          },
          "radius": {
            "value": 0.25,
            "unit": "m",
            "label": "Radius"
          }
        },
        "ports": [
          {
            "id": "r",
            "pos": "left",
            "label": "R",
            "domain": "Rotational"
          },
          {
            "id": "vis",
            "pos": "right",
            "label": "Vis",
            "domain": "Physical"
          }
        ],
        "equation": "τ = J_drum * dω/dt + b_visc * ω + τ_unbalance",
        "description": "Rotational inertia and eccentric mass dynamics of washing machine drum during spin cycles."
      },
      {
        "id": "washing_fluid",
        "name": "Fluid & Detergent Load",
        "color": "#06b6d4",
        "icon": "washing_fluid",
        "category": "Elements",
        "params": {
          "water_level": {
            "value": 10,
            "unit": "L",
            "label": "Water Level"
          },
          "detergent": {
            "value": 1,
            "unit": "%",
            "label": "Detergent Conc"
          },
          "drag_coeff": {
            "value": 0.05,
            "unit": "N-m-s/rad",
            "label": "Slosh Drag"
          }
        },
        "ports": [
          {
            "id": "r",
            "pos": "left",
            "label": "R",
            "domain": "Rotational"
          }
        ],
        "equation": "dT_water/dt = (Q_heater - Q_loss) / (m_water * Cp_water)",
        "description": "Thermal and fluid load dynamics representing wash tub water volume, detergent mixing, and heating."
      }
    ]
  },
  {
    "type": "Microwave & Cooking",
    "blocks": [
      {
        "id": "magnetron",
        "name": "Magnetron Unit",
        "color": "#ef4444",
        "icon": "magnetron",
        "category": "Elements",
        "params": {
          "power_rating": {
            "value": 900,
            "unit": "W",
            "label": "Nominal Power"
          },
          "efficiency": {
            "value": 65,
            "unit": "%",
            "label": "Efficiency"
          },
          "freq": {
            "value": 2.45,
            "unit": "GHz",
            "label": "Frequency"
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "left",
            "label": "+",
            "domain": "Electrical"
          },
          {
            "id": "n",
            "pos": "bottom",
            "label": "-",
            "domain": "Electrical"
          },
          {
            "id": "h",
            "pos": "right",
            "label": "H",
            "domain": "Thermal"
          }
        ],
        "equation": "P_out = P_elec * η\\nλ = c / f",
        "description": "Converts high-voltage electrical energy into microwave radiation (thermal energy). Typical efficiency is around 65%."
      },
      {
        "id": "upper_heater",
        "name": "Upper Radiant Heater",
        "color": "#f97316",
        "icon": "heater",
        "category": "Elements",
        "params": {
          "resistance": {
            "value": 40,
            "unit": "Ohm",
            "label": "Resistance"
          },
          "surface_area": {
            "value": 0.05,
            "unit": "m^2",
            "label": "Surface Area"
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "left",
            "label": "+",
            "domain": "Electrical"
          },
          {
            "id": "n",
            "pos": "right",
            "label": "-",
            "domain": "Electrical"
          },
          {
            "id": "h",
            "pos": "top",
            "label": "H",
            "domain": "Thermal"
          }
        ],
        "equation": "Q = V²/R\\nQ_rad = ε*σ*A*(T⁴ - T_amb⁴)",
        "description": "A resistive heating element that provides radiant heat to the cavity. It models both Joule heating and Stefan-Boltzmann radiation."
      },
      {
        "id": "steam_generator",
        "name": "Steam Generator (800W)",
        "color": "#0ea5e9",
        "icon": "steam_gen",
        "category": "Elements",
        "params": {
          "power": {
            "value": 800,
            "unit": "W",
            "label": "Heating Power"
          },
          "tank_vol": {
            "value": 0.5,
            "unit": "L",
            "label": "Tank Volume"
          },
          "boil_temp": {
            "value": 100,
            "unit": "C",
            "label": "Boiling Temp"
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "left",
            "label": "+",
            "domain": "Electrical"
          },
          {
            "id": "n",
            "pos": "bottom",
            "label": "-",
            "domain": "Electrical"
          },
          {
            "id": "s",
            "pos": "right",
            "label": "S",
            "domain": "Thermal"
          }
        ],
        "equation": "Q = P_elec * η_thermal\\nmdot_steam = Q / h_fg",
        "description": "High-power electric boiler producing saturated steam at rate proportional to heating element power."
      },
      {
        "id": "microwave_inverter",
        "name": "HV Inverter PSU",
        "color": "#8b5cf6",
        "icon": "inverter",
        "category": "Power",
        "params": {
          "v_in": {
            "value": 230,
            "unit": "V",
            "label": "Input Voltage"
          },
          "v_out": {
            "value": 4000,
            "unit": "V",
            "label": "Output HV"
          },
          "switching_freq": {
            "value": 30,
            "unit": "kHz",
            "label": "Switching Freq"
          }
        },
        "ports": [
          {
            "id": "ac_in",
            "pos": "left",
            "label": "AC",
            "domain": "Electrical"
          },
          {
            "id": "hv_out",
            "pos": "right",
            "label": "HV",
            "domain": "Electrical"
          },
          {
            "id": "ctrl",
            "pos": "top",
            "label": "C",
            "domain": "Physical"
          }
        ],
        "equation": "P_out = η * V_in * I_in * DutyCycle",
        "description": "High-voltage inverter power supply for microwave magnetron with PWM duty cycle regulation."
      },
      {
        "id": "microwave_cavity",
        "name": "25L Microwave Cavity",
        "color": "#64748b",
        "icon": "cavity",
        "category": "Thermal",
        "params": {
          "volume": {
            "value": 25,
            "unit": "L",
            "label": "Volume"
          },
          "ambient_temp": {
            "value": 25,
            "unit": "C",
            "label": "Ambient"
          },
          "max_temp": {
            "value": 250,
            "unit": "C",
            "label": "Thermal Cutout Limit"
          },
          "food_mass": {
            "value": 0.5,
            "unit": "kg",
            "label": "Food/Water Mass"
          },
          "food_cp": {
            "value": 4184,
            "unit": "J/(kg*K)",
            "label": "Food Specific Heat"
          },
          "wall_mass": {
            "value": 2,
            "unit": "kg",
            "label": "Wall Mass"
          },
          "wall_cp": {
            "value": 460,
            "unit": "J/(kg*K)",
            "label": "Wall Specific Heat"
          },
          "h_conv": {
            "value": 10,
            "unit": "W/(m^2*K)",
            "label": "Convection Coeff."
          },
          "eps": {
            "value": 0.85,
            "unit": "-",
            "label": "Surface Emissivity"
          }
        },
        "ports": [
          {
            "id": "h1",
            "pos": "left",
            "label": "M",
            "domain": "Thermal"
          },
          {
            "id": "h2",
            "pos": "top",
            "label": "U",
            "domain": "Thermal"
          },
          {
            "id": "h3",
            "pos": "right",
            "label": "S",
            "domain": "Thermal"
          },
          {
            "id": "t",
            "pos": "bottom",
            "label": "T",
            "domain": "Physical"
          }
        ],
        "equation": "dQ/dt = P_in - Q_loss\\nm*Cp*dT/dt = Σ(dQ/dt)",
        "description": "A thermal model of a microwave oven cavity. It tracks temperature based on microwave energy input and heat losses to the environment."
      }
    ]
  },
  {
    "type": "Utilities",
    "blocks": [
      {
        "id": "solver_config",
        "name": "Solver Configuration",
        "color": "#4b5563",
        "icon": "solver_config",
        "category": "General",
        "params": {
          "solver": {
            "value": "auto",
            "unit": "",
            "label": "Numerical Solver"
          },
          "startTime": {
            "value": 0,
            "unit": "s",
            "label": "Start Time"
          },
          "stopTime": {
            "value": 10,
            "unit": "s",
            "label": "Stop Time"
          },
          "initialStep": {
            "value": 0.001,
            "unit": "s",
            "label": "Initial Step"
          },
          "minimumStep": {
            "value": 0.000001,
            "unit": "s",
            "label": "Minimum Step"
          },
          "maximumStep": {
            "value": 0.05,
            "unit": "s",
            "label": "Maximum Step"
          },
          "relativeTolerance": {
            "value": 0.001,
            "unit": "",
            "label": "Relative Tolerance"
          },
          "absoluteTolerance": {
            "value": 0.000001,
            "unit": "",
            "label": "Absolute Tolerance"
          },
          "nonlinearTolerance": {
            "value": 1e-8,
            "unit": "",
            "label": "Nonlinear Tolerance"
          },
          "maximumIterations": {
            "value": 50,
            "unit": "",
            "label": "Max Newton Iterations"
          },
          "enableDiagnostics": {
            "value": "on",
            "unit": "",
            "label": "Enable Diagnostics"
          },
          "enableLogging": {
            "value": "on",
            "unit": "",
            "label": "Log Statistics"
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "right",
            "label": ""
          }
        ],
        "description": "Defines the numerical solver parameters, integration tolerances, time-stepping, and diagnostics for the physical network.",
        "equation": "DAE System: F(x, dx/dt, u, t) = 0"
      },
      {
        "id": "ps_simulink_conv",
        "name": "PS-Simulink Converter",
        "color": "#4b5563",
        "icon": "ps_to_sim",
        "category": "Converters",
        "params": {},
        "ports": [
          {
            "id": "in",
            "pos": "left",
            "label": ""
          },
          {
            "id": "out",
            "pos": "right",
            "label": ""
          }
        ],
        "equation": "PS-Simulink Converter governing physical equation",
        "description": "Physical component model for PS-Simulink Converter."
      },
      {
        "id": "simulink_ps_conv",
        "name": "Simulink-PS Converter",
        "color": "#4b5563",
        "icon": "sim_to_ps",
        "category": "Converters",
        "params": {},
        "ports": [
          {
            "id": "in",
            "pos": "left",
            "label": ""
          },
          {
            "id": "out",
            "pos": "right",
            "label": ""
          }
        ],
        "equation": "Simulink-PS Converter governing physical equation",
        "description": "Physical component model for Simulink-PS Converter."
      },
      {
        "id": "vlab_probe",
        "name": "Probe",
        "color": "#4b5563",
        "icon": "probe",
        "category": "General",
        "params": {},
        "ports": [
          {
            "id": "in",
            "pos": "left",
            "label": ""
          },
          {
            "id": "out",
            "pos": "right",
            "label": "x"
          }
        ],
        "equation": "Probe governing physical equation",
        "description": "Physical component model for Probe."
      },
      {
        "id": "conn_label",
        "name": "Connection Label",
        "color": "#4b5563",
        "icon": "conn_label",
        "category": "General",
        "params": {
          "tag": {
            "value": "A",
            "unit": "",
            "label": "Label"
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": ""
          }
        ],
        "equation": "Connection Label governing physical equation",
        "description": "Physical component model for Connection Label."
      },
      {
        "id": "subsystem",
        "name": "Subsystem",
        "color": "#c9a86c",
        "icon": "subsystem",
        "category": "Subsystems",
        "params": {
          "name": {
            "value": "Subsystem",
            "unit": "",
            "label": "Name"
          }
        },
        "ports": [],
        "equation": "Hierarchical sub-network encapsulation",
        "description": "A block representing a nested subsystem layer containing its own blocks and connections. Connects to parent layers via Inports and Outports."
      },
      {
        "id": "inport",
        "name": "Inport",
        "color": "#4b5563",
        "icon": "inport",
        "category": "Subsystems",
        "params": {
          "name": {
            "value": "In1",
            "unit": "",
            "label": "Port Name"
          },
          "port_index": {
            "value": 1,
            "unit": "",
            "label": "Port Index"
          },
          "data_type": {
            "value": "auto",
            "unit": "",
            "label": "Data Type"
          }
        },
        "ports": [
          {
            "id": "out",
            "pos": "right",
            "label": "Out"
          }
        ],
        "description": "An input port for a subsystem. Creates an input handle on the parent subsystem block.",
        "equation": "y = u_external"
      },
      {
        "id": "outport",
        "name": "Outport",
        "color": "#4b5563",
        "icon": "outport",
        "category": "Subsystems",
        "params": {
          "name": {
            "value": "Out1",
            "unit": "",
            "label": "Port Name"
          },
          "port_index": {
            "value": 1,
            "unit": "",
            "label": "Port Index"
          },
          "data_type": {
            "value": "auto",
            "unit": "",
            "label": "Data Type"
          }
        },
        "ports": [
          {
            "id": "in",
            "pos": "left",
            "label": "In"
          }
        ],
        "description": "An output port for a subsystem. Creates an output handle on the parent subsystem block.",
        "equation": "y_external = u"
      }
    ]
  },
  {
    "type": "Fluid / Steam",
    "blocks": [
      {
        "id": "fluid_ref",
        "name": "Fluid Ground (Atm)",
        "color": "#06b6d4",
        "icon": "minus",
        "category": "Elements",
        "params": {},
        "ports": [
          {
            "id": "p",
            "pos": "bottom",
            "label": "P"
          }
        ],
        "equation": "Fluid Ground (Atm) governing physical equation",
        "description": "Physical component model for Fluid Ground (Atm)."
      },
      {
        "id": "fluid_resistance",
        "name": "Fluid Resistance",
        "color": "#06b6d4",
        "icon": "fluid_res",
        "category": "Elements",
        "params": {
          "Rf": {
            "value": 100000,
            "unit": "Pa·s/kg",
            "label": "Resistance"
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "left",
            "label": "In"
          },
          {
            "id": "n",
            "pos": "right",
            "label": "Out"
          }
        ],
        "equation": "Fluid Resistance governing physical equation",
        "description": "Physical component model for Fluid Resistance."
      },
      {
        "id": "orifice",
        "name": "Orifice",
        "color": "#06b6d4",
        "icon": "orifice",
        "category": "Elements",
        "params": {
          "Cd": {
            "value": 0.6,
            "unit": "1",
            "label": "Discharge Coeff."
          },
          "A": {
            "value": 0.0001,
            "unit": "m²",
            "label": "Area"
          },
          "rho": {
            "value": 1.2,
            "unit": "kg/m³",
            "label": "Density"
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "left",
            "label": "In"
          },
          {
            "id": "n",
            "pos": "right",
            "label": "Out"
          }
        ],
        "equation": "mdot = Cd * A * √(2*ρ*ΔP)",
        "description": "Hydraulic restriction orifice calculating flow rate from cross-sectional area and pressure differential."
      },
      {
        "id": "fluid_capacitance",
        "name": "Fluid Capacitance",
        "color": "#06b6d4",
        "icon": "database",
        "category": "Elements",
        "params": {
          "Cf": {
            "value": 0.00001,
            "unit": "kg/Pa",
            "label": "Capacitance"
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "left",
            "label": "In"
          }
        ],
        "equation": "Fluid Capacitance governing physical equation",
        "description": "Physical component model for Fluid Capacitance."
      },
      {
        "id": "fluid_inertance",
        "name": "Fluid Inertance",
        "color": "#06b6d4",
        "icon": "arrow-right",
        "category": "Elements",
        "params": {
          "Li": {
            "value": 100,
            "unit": "Pa·s²/kg",
            "label": "Inertance"
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "left",
            "label": "In"
          },
          {
            "id": "n",
            "pos": "right",
            "label": "Out"
          }
        ],
        "equation": "Fluid Inertance governing physical equation",
        "description": "Physical component model for Fluid Inertance."
      },
      {
        "id": "pressure_source",
        "name": "Pressure Source",
        "color": "#06b6d4",
        "icon": "zap",
        "category": "Sources",
        "params": {
          "P": {
            "value": 101325,
            "unit": "Pa",
            "label": "Pressure"
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "right",
            "label": "Out"
          }
        ],
        "equation": "P_out - P_in = P_param",
        "description": "Ideal hydraulic pressure source establishing commanded pressure differential across ports."
      },
      {
        "id": "ctrl_pressure_source",
        "name": "Ctrl Pressure Source",
        "color": "#06b6d4",
        "icon": "zap",
        "category": "Sources",
        "params": {},
        "ports": [
          {
            "id": "p",
            "pos": "right",
            "label": "Out"
          },
          {
            "id": "ctrl",
            "pos": "left",
            "label": "In",
            "domain": "physical"
          }
        ],
        "equation": "Ctrl Pressure Source governing physical equation",
        "description": "Physical component model for Ctrl Pressure Source."
      },
      {
        "id": "mass_flow_source",
        "name": "Mass Flow Source",
        "color": "#06b6d4",
        "icon": "wind",
        "category": "Sources",
        "params": {
          "mdot": {
            "value": 0.01,
            "unit": "kg/s",
            "label": "Mass Flow"
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "right",
            "label": "Out"
          }
        ],
        "equation": "Mass Flow Source governing physical equation",
        "description": "Physical component model for Mass Flow Source."
      },
      {
        "id": "check_valve",
        "name": "Check Valve",
        "color": "#06b6d4",
        "icon": "check_valve",
        "category": "Elements",
        "params": {
          "Rf": {
            "value": 1000,
            "unit": "Pa·s/kg",
            "label": "On Resistance"
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "left",
            "label": "In"
          },
          {
            "id": "n",
            "pos": "right",
            "label": "Out"
          }
        ],
        "equation": "Q = (ΔP > P_crack) ? Cd*A*√(2*ΔP/ρ) : 0",
        "description": "One-way hydraulic check valve allowing forward flow only when pressure exceeds cracking pressure."
      },
      {
        "id": "relief_valve",
        "name": "Relief Valve",
        "color": "#06b6d4",
        "icon": "relief_valve",
        "category": "Elements",
        "params": {
          "P_set": {
            "value": 500000,
            "unit": "Pa",
            "label": "Set Pressure"
          },
          "Rf_open": {
            "value": 100,
            "unit": "Pa·s/kg",
            "label": "Open Res."
          },
          "Rf_closed": {
            "value": 10000000000,
            "unit": "Pa·s/kg",
            "label": "Closed Res."
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "left",
            "label": "In"
          },
          {
            "id": "n",
            "pos": "right",
            "label": "Out"
          }
        ],
        "equation": "Q = (ΔP > P_set) ? Cd*A*√(2*(ΔP - P_set)/ρ) : 0",
        "description": "Pressure relief safety valve opening to discharge fluid when system pressure exceeds setpoint."
      },
      {
        "id": "steam_generator_fluid",
        "name": "Steam Generator",
        "color": "#06b6d4",
        "icon": "steam_gen",
        "category": "Couplings",
        "params": {
          "Q": {
            "value": 1000,
            "unit": "W",
            "label": "Heater Power"
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "right",
            "label": "Steam"
          },
          {
            "id": "q_in",
            "pos": "left",
            "label": "Heat",
            "domain": "physical"
          }
        ],
        "equation": "Steam Generator governing physical equation",
        "description": "Physical component model for Steam Generator."
      },
      {
        "id": "steam_accumulator",
        "name": "Steam Accumulator",
        "color": "#06b6d4",
        "icon": "accumulator",
        "category": "Elements",
        "params": {
          "V": {
            "value": 0.5,
            "unit": "m³",
            "label": "Volume"
          }
        },
        "ports": [
          {
            "id": "pin",
            "pos": "left",
            "label": "In"
          },
          {
            "id": "pout",
            "pos": "right",
            "label": "Out"
          }
        ],
        "equation": "Steam Accumulator governing physical equation",
        "description": "Physical component model for Steam Accumulator."
      },
      {
        "id": "steam_nozzle",
        "name": "Steam Nozzle",
        "color": "#06b6d4",
        "icon": "nozzle",
        "category": "Elements",
        "params": {
          "Cd": {
            "value": 0.5,
            "unit": "1",
            "label": "Discharge Coeff."
          },
          "d": {
            "value": 0.0005,
            "unit": "m",
            "label": "Diameter"
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "left",
            "label": "In"
          }
        ],
        "equation": "mdot = Cd * A_throat * P0 * √(γ/(R*T0)) * (2/(γ+1))^((γ+1)/(2*(γ-1)))",
        "description": "Convergent-divergent steam expansion nozzle accelerating high-pressure steam into velocity jet."
      },
      {
        "id": "pressure_sensor",
        "name": "Pressure Sensor",
        "color": "#06b6d4",
        "icon": "eye",
        "category": "Sensors",
        "params": {},
        "ports": [
          {
            "id": "p",
            "pos": "left",
            "label": "In"
          },
          {
            "id": "out",
            "pos": "right",
            "label": "P",
            "domain": "physical"
          }
        ],
        "equation": "P_out = P_p - P_n",
        "description": "Measures differential or gauge fluid pressure across two hydraulic ports."
      },
      {
        "id": "flow_sensor",
        "name": "Flow Sensor",
        "color": "#06b6d4",
        "icon": "eye",
        "category": "Sensors",
        "params": {},
        "ports": [
          {
            "id": "p",
            "pos": "left",
            "label": "In"
          },
          {
            "id": "n",
            "pos": "right",
            "label": "Out"
          },
          {
            "id": "out",
            "pos": "top",
            "label": "F",
            "domain": "physical"
          }
        ],
        "equation": "Q_out = Q_branch",
        "description": "Measures volumetric fluid flow rate flowing through a hydraulic pipeline branch."
      }
    ]
  },
  {
    "type": "DOE Models",
    "blocks": [
      {
        "id": "doe_custom",
        "name": "DOE Model Block",
        "color": "#f97316",
        "icon": "doe_model",
        "category": "Statistical",
        "params": {
          "modelType": {
            "value": "RSM",
            "unit": "",
            "label": "Model Type"
          },
          "equation": {
            "value": "Y = f(X1, X2, ...)",
            "unit": "",
            "label": "Equation"
          }
        },
        "ports": [],
        "equation": "Y = f(X1, X2, ...)",
        "description": "A data-driven model generated from experimental results (Design of Experiments). It allows high-fidelity behavioral simulation without complex physical equations."
      }
    ]
  }
];

export function scoreVLabBlock(block: VLabBlock, query: string): number {
  if (!query) return 0;
  const q = query.toLowerCase().trim();
  const name = (block.name || '').toLowerCase();
  const id = (block.id || '').toLowerCase();
  const cat = (block.category || '').toLowerCase();
  const desc = (block.description || '').toLowerCase();
  const eq = (block.equation || '').toLowerCase();

  if (name === q || id === q) return 1000;
  if (name.startsWith(q) || id.startsWith(q)) return 800;
  if (name.includes(q) || id.includes(q)) return 600;
  if (cat === q) return 400;
  if (cat.includes(q)) return 300;
  if (desc.includes(q) || eq.includes(q)) return 100;
  return 0;
}

export function searchVLabBlocks(blocks: VLabBlock[], query: string): VLabBlock[] {
  if (!query.trim()) return blocks;
  const q = query.toLowerCase().trim();
  return blocks
    .map(b => ({ block: b, score: scoreVLabBlock(b, q) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.block);
}

