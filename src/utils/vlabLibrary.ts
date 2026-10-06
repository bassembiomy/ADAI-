export interface VLabPort {
  id: string;
  pos: 'left' | 'right' | 'top' | 'bottom';
  label?: string;
  domain?: string;
  /**
   * Signal direction. Only meaningful on Physical (signal) ports; conserving ports are bidirectional.
   * `in`  = the block reads the port as an across value.
   * `out` = the block drives the port (signal branch) or writes it.
   * Derived from the equation trace, see src/engine/vlab/review/portDirections.ts.
   */
  direction?: 'in' | 'out';
  /**
   * Measured quantity of a signal output (`direction: 'out'`), e.g. `angular velocity`. Shown on Scope channels.
   * Reviewed table: src/engine/vlab/review/portQuantities.ts (WP-09b). Absent on inputs and conserving ports.
   */
  quantity?: string;
  /** SI unit of the signal (`rad/s`, `N*m`, `1` dimensionless, `*` = same as the wired input). */
  unit?: string;
  /**
   * Physical-signal vector width (WP-09c, default 1). A width-N signal port carries N channels (Simscape "physical signal
   * vector"): the solver allocates N variables for the net, the equation receives an N-element array for the port, and
   * a wire connects only ports of exactly the same width (no broadcast, no truncation). Scopes show N traces.
   */
  width?: number;
  /** Names of the N channels of a vector / composite port (`a b c`, `d q 0`, `alpha beta 0`, `pos neg zero`). Scope traces are `<port>[<name>]`. */
  channelNames?: string[];
  /**
   * Composite three-phase electrical port (Simscape "Electrical, three-phase"): an Electrical port that expands into the
   * three scalar nodes a, b, c (KCL per phase). It connects only to another composite port; a Phase Splitter bridges to
   * the scalar phases. Implies width 3, channelNames a b c.
   */
  composite?: 'three_phase';
}

/**
 * One block parameter. The optional bound fields are PHYSICAL validity limits (R > 0, damping >= 0, ratio != 0),
 * checked by the engine before assembly (src/engine/vlab/vlabParams.ts). Absent = any finite number is legal
 * (offsets, initial conditions, signed sources). Only numeric parameters carry bounds.
 */
export interface VLabParamSpec {
  value: number | string;
  unit: string;
  label: string;
  min?: number;
  max?: number;
  /** the `min` bound itself is not allowed (value > min) */
  exclusiveMin?: boolean;
  /** the `max` bound itself is not allowed (value < max) */
  exclusiveMax?: boolean;
  /** zero is not allowed (e.g. a gear or turns ratio); the sign stays free */
  nonZero?: boolean;
}

export interface VLabBlock {
  id: string;
  name: string;
  color: string;
  icon: string;
  params: Record<string, VLabParamSpec>;
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
            "label": "Resistance",
            "min": 0,
            "exclusiveMin": true
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
          }
        ],
        "equation": "v = i * R   [V = A·Ω], v = v_p − v_n, i: p → n",
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
            "value": 0.001,
            "unit": "Ω",
            "label": "Min Resistance",
            "min": 0
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
            "id": "r",
            "pos": "top",
            "label": "R",
            "domain": "Physical",
            "direction": "in"
          }
        ],
        "equation": "v = i * max(R(t), R_min)   [V = A·Ω], R(t) = signal r [Ω]",
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
            "label": "+",
            "domain": "Electrical"
          },
          {
            "id": "n",
            "pos": "right",
            "label": "-",
            "domain": "Electrical"
          }
        ],
        "equation": "i = 0 A   (R → ∞, v free)",
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
            "label": "Capacitance",
            "min": 0,
            "exclusiveMin": true
          },
          "v0": {
            "value": 0,
            "unit": "V",
            "label": "Initial Voltage"
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
          }
        ],
        "equation": "i = C * dv/dt   [A = F·V/s], v(0) = v0",
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
            "label": "Inductance",
            "min": 0,
            "exclusiveMin": true
          },
          "i0": {
            "value": 0,
            "unit": "A",
            "label": "Initial Current"
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
          }
        ],
        "equation": "v = L * di/dt   [V = H·A/s], i(0) = i0",
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
            "label": "Initial Memristance",
            "min": 0,
            "exclusiveMin": true
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
          }
        ],
        "equation": "v = M(w) * i   [V], M = M0 + 10·w [Ω]\ndw/dt = i   [A]",
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
            "label": "Gyration Conductance",
            "nonZero": true
          }
        },
        "ports": [
          {
            "id": "p1",
            "pos": "left",
            "label": "1+",
            "domain": "Electrical"
          },
          {
            "id": "n1",
            "pos": "left",
            "label": "1-",
            "domain": "Electrical"
          },
          {
            "id": "p2",
            "pos": "right",
            "label": "2+",
            "domain": "Electrical"
          },
          {
            "id": "n2",
            "pos": "right",
            "label": "2-",
            "domain": "Electrical"
          }
        ],
        "equation": "i1 = g * v2   [A = S·V]\ni2 = -g * v1   [A = S·V]",
        "description": "Ideal non-reciprocal two-port network that inverts voltage and current characteristics."
      },
      {
        "id": "transformer",
        "name": "Ideal Transformer",
        "color": "#818cf8",
        "icon": "transformer",
        "category": "Passive",
        "params": {
          "N12": {
            "value": 0.1,
            "unit": "1",
            "label": "Winding ratio N1/N2",
            "nonZero": true
          }
        },
        "ports": [
          {
            "id": "p1",
            "pos": "left",
            "label": "1+",
            "domain": "Electrical"
          },
          {
            "id": "n1",
            "pos": "left",
            "label": "1-",
            "domain": "Electrical"
          },
          {
            "id": "p2",
            "pos": "right",
            "label": "2+",
            "domain": "Electrical"
          },
          {
            "id": "n2",
            "pos": "right",
            "label": "2-",
            "domain": "Electrical"
          }
        ],
        "equation": "v1 = N12 * v2   [V]\ni2 = -N12 * i1   [A],  N12 = N1/N2",
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
            "label": "Open-Loop Gain",
            "min": 0,
            "exclusiveMin": true
          },
          "Vsat": {
            "value": 15,
            "unit": "V",
            "label": "Output Saturation",
            "min": 0,
            "exclusiveMin": true
          }
        },
        "ports": [
          {
            "id": "in_p",
            "pos": "left",
            "label": "+",
            "domain": "Electrical"
          },
          {
            "id": "in_n",
            "pos": "left",
            "label": "-",
            "domain": "Electrical"
          },
          {
            "id": "out",
            "pos": "right",
            "label": "Out",
            "domain": "Electrical"
          }
        ],
        "equation": "Vout = clamp(A * (V+ − V−), ±Vsat)   [V]\n(linear region: V+ ≈ V− for large A)",
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
            "label": "On Resistance",
            "min": 0,
            "exclusiveMin": true
          },
          "Roff": {
            "value": 1000000,
            "unit": "Ω",
            "label": "Off Resistance",
            "min": 0,
            "exclusiveMin": true
          },
          "threshold": {
            "value": 0.5,
            "unit": "V",
            "label": "Threshold"
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
            "id": "v",
            "pos": "top",
            "label": "v",
            "domain": "Physical",
            "direction": "in"
          }
        ],
        "equation": "V = I * R_sw   [V]\nR_sw = (v > threshold) ? Ron : Roff   [Ω]",
        "description": "An ideal switch controlled by a physical signal (Simscape Foundation Switch). When the control signal v exceeds threshold [V], the switch is closed with low resistance Ron [Ω]; otherwise it opens with high resistance Roff = 1/Gopen [Ω]."
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
            "label": "On Resistance",
            "min": 0,
            "exclusiveMin": true
          },
          "Roff": {
            "value": 1000000,
            "unit": "Ω",
            "label": "Off Resistance",
            "min": 0,
            "exclusiveMin": true
          },
          "Vf": {
            "value": 0.7,
            "unit": "V",
            "label": "Forward Voltage",
            "min": 0
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "left",
            "label": "A",
            "domain": "Electrical"
          },
          {
            "id": "n",
            "pos": "right",
            "label": "K",
            "domain": "Electrical"
          }
        ],
        "equation": "On (V > Vf): I = (V − Vf)/Ron + Vf/Roff   [A]\nOff (V ≤ Vf): I = V/Roff   [A]",
        "description": "Piecewise-linear diode (Simscape Electrical Diode, piecewise linear model): forward voltage Vf [V], on resistance Ron [Ω], off resistance Roff = 1/Goff [Ω]. V = v_A − v_K, current positive A → K; I(V) is continuous at V = Vf."
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
            "label": "Transconductance",
            "min": 0,
            "exclusiveMin": true
          },
          "Vth": {
            "value": 2,
            "unit": "V",
            "label": "Threshold Voltage"
          },
          "lambda": {
            "value": 0.01,
            "unit": "1/V",
            "label": "Channel Mod.",
            "min": 0
          }
        },
        "ports": [
          {
            "id": "d",
            "pos": "top",
            "label": "D",
            "domain": "Electrical"
          },
          {
            "id": "s",
            "pos": "bottom",
            "label": "S",
            "domain": "Electrical"
          },
          {
            "id": "g",
            "pos": "left",
            "label": "G",
            "domain": "Physical",
            "direction": "in"
          }
        ],
        "equation": "Vov = Vgs − Vth   [V]\nCut-off (Vov ≤ 0): Id = 0\nLinear (0 < Vds < Vov): Id = kn·(Vov·Vds − Vds²/2)·(1 + λ·Vds)   [A]\nSaturation (Vds ≥ Vov > 0): Id = kn/2·Vov²·(1 + λ·Vds)   [A]",
        "description": "N-channel MOSFET, Shichman–Hodges (SPICE level 1) model with a physical signal gate input (gate current 0). kn = μCox·W/L [A/V²], λ [1/V]. Symmetric: drain and source swap roles for Vds < 0."
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
            "label": "Saturation Vce",
            "min": 0
          },
          "Rd": {
            "value": 0.05,
            "unit": "Ω",
            "label": "On Resistance",
            "min": 0,
            "exclusiveMin": true
          },
          "Roff": {
            "value": 1000000,
            "unit": "Ω",
            "label": "Off Resistance",
            "min": 0,
            "exclusiveMin": true
          }
        },
        "ports": [
          {
            "id": "c",
            "pos": "top",
            "label": "C",
            "domain": "Electrical"
          },
          {
            "id": "e",
            "pos": "bottom",
            "label": "E",
            "domain": "Electrical"
          },
          {
            "id": "g",
            "pos": "left",
            "label": "G",
            "domain": "Physical",
            "direction": "in"
          }
        ],
        "equation": "On (Vge ≥ Vge_th and Vce ≥ Vce_sat): Ic = (Vce − Vce_sat)/Rd + Vce_sat/Roff   [A]\nOtherwise: Ic = Vce/Roff   [A]",
        "description": "Ideal switching IGBT (Simscape Electrical IGBT, Ideal Switching): voltage-controlled switch with gate threshold Vge_th [V], saturation voltage Vce_sat [V], on resistance Rd [Ω] and off resistance Roff [Ω]. Conducts C → E only."
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
            "label": "Armature Res",
            "min": 0
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
        "equation": "V = R·I + K·ω [V],  ω = ω_R − ω_C [rad/s]\nτ = K·I [N·m]  (torque delivered at R, reaction at C)\nV·I = R·I² + τ·ω",
        "description": "Ideal rotational electromechanical converter (DC machine without armature inductance) between the Electrical port pair + / − and the Rotational port pair R / C. K (V·s/rad) is the back-EMF constant and, in SI, equal to the torque constant. The armature resistance R is the only loss: the electrical input V·I equals R·I² plus the mechanical power K·I·ω, so with R = 0 the conversion is lossless. K may be negative (reversed polarity)."
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
            "label": "Force Constant (Bl)"
          },
          "R": {
            "value": 1,
            "unit": "Ω",
            "label": "Winding Resistance",
            "min": 0
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
            "domain": "Translational"
          },
          {
            "id": "c",
            "pos": "right",
            "label": "C",
            "domain": "Translational"
          }
        ],
        "equation": "V = R·I + Bl·v [V],  v = v_R − v_C [m/s]\nF = Bl·I [N]  (force delivered at R, reaction at C)\nV·I = R·I² + F·v",
        "description": "Ideal translational electromechanical converter (voice coil / Lorentz actuator without coil inductance) between the Electrical port pair + / − and the Translational port pair R / C. Bl (N/A = V·s/m) is the force constant and equals the back-EMF constant. The winding resistance R is the only loss: V·I = R·I² + Bl·I·v, so with R = 0 the conversion is lossless. Bl may be negative (reversed polarity)."
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
            "label": "Pole Pairs",
            "min": 1
          },
          "Rs": {
            "value": 0.1,
            "unit": "Ω",
            "label": "Stator Res",
            "min": 0
          },
          "Ld": {
            "value": 0.005,
            "unit": "H",
            "label": "D-axis Inductance",
            "min": 0,
            "exclusiveMin": true
          },
          "Lq": {
            "value": 0.005,
            "unit": "H",
            "label": "Q-axis Inductance",
            "min": 0,
            "exclusiveMin": true
          },
          "L0": {
            "value": 0.005,
            "unit": "H",
            "label": "Zero-Sequence Inductance",
            "min": 0,
            "exclusiveMin": true
          },
          "flux": {
            "value": 0.1,
            "unit": "Wb",
            "label": "PM Flux"
          },
          "J": {
            "value": 0.02,
            "unit": "kg-m^2",
            "label": "Inertia",
            "min": 0,
            "exclusiveMin": true
          },
          "B": {
            "value": 0.002,
            "unit": "N-m-s/rad",
            "label": "Viscous Damping",
            "min": 0
          }
        },
        "ports": [
          {
            "id": "abc",
            "composite": "three_phase",
            "pos": "left",
            "label": "ABC",
            "domain": "Electrical"
          },
          {
            "id": "n",
            "pos": "left",
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
        "equation": "v_d = Rs·i_d + Ld·di_d/dt − ω_e·Lq·i_q [V]\nv_q = Rs·i_q + Lq·di_q/dt + ω_e·(Ld·i_d + λm) [V]\nv_0 = Rs·i_0 + L0·di_0/dt [V]\nτ_e = (3/2)·p·(λm·i_q + (Ld − Lq)·i_d·i_q) [N·m],  ω_e = p·ω [rad/s]\nJ·dω/dt = τ_e − B·ω − τ_shaft [N·m]",
        "description": "Permanent Magnet Synchronous Motor in the rotor-fixed dq frame (amplitude-invariant Clarke/Park transform, d axis on phase a at θ = 0). The stator terminals are the composite three-phase port ABC (wire it to an inverter / source ABC port, or through a Phase Splitter to scalar phases). Wye stator: the phase currents flow from A, B, C through the windings to the star point N, so an open N forces i_a + i_b + i_c = 0 and a connected N carries the zero-sequence current (inductance L0). The shaft is the scalar Rotational port R (speed relative to the inertial frame, the machine case is fixed to it); the torque delivered at R is τ_e − J·dω/dt − B·ω. Phase back-EMF amplitude is λm·ω_e."
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
            "label": "Armature Res",
            "min": 0
          },
          "La": {
            "value": 0.01,
            "unit": "H",
            "label": "Armature Ind",
            "min": 0,
            "exclusiveMin": true
          },
          "Ke": {
            "value": 0.05,
            "unit": "V*s/rad",
            "label": "Back-EMF / Torque Constant k"
          },
          "J": {
            "value": 0.001,
            "unit": "kg-m^2",
            "label": "Inertia",
            "min": 0,
            "exclusiveMin": true
          },
          "B": {
            "value": 0.001,
            "unit": "N-m-s/rad",
            "label": "Viscous Damping",
            "min": 0
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
        "equation": "V = Ra·I + La·dI/dt + k·ω [V]\nτ_e = k·I = J·dω/dt + B·ω + τ_shaft [N·m]   (τ_shaft = torque delivered to the load)\nV·I = Ra·I² + d(½La·I²)/dt + B·ω² + d(½J·ω²)/dt + τ_shaft·ω",
        "description": "Permanent-magnet DC motor (Simscape DC Motor): armature circuit (Ra, La) and one electromechanical constant k [V·s/rad = N·m/A] coupled to a rotor with inertia J and viscous damping B. In SI the torque constant equals the back-EMF constant, so the conversion is lossless apart from Ra·I² and B·ω²: there is a single constant (parameter Ke). A saved model with a different Kt keeps its Ke as k and gets a migration notice. The rotor shaft is the scalar Rotational port R (speed relative to the inertial frame, the machine case is fixed to it); the torque delivered to the load is k·I minus the rotor inertia and damping terms."
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
            "label": "Stator Res",
            "min": 0
          },
          "Rr": {
            "value": 0.08,
            "unit": "Ω",
            "label": "Rotor Res",
            "min": 0
          },
          "Lm": {
            "value": 0.05,
            "unit": "H",
            "label": "Magnetizing Inductance",
            "min": 0,
            "exclusiveMin": true
          },
          "Lls": {
            "value": 0.01,
            "unit": "H",
            "label": "Stator Leakage Inductance",
            "min": 0
          },
          "Llr": {
            "value": 0.01,
            "unit": "H",
            "label": "Rotor Leakage Inductance (stator referred)",
            "min": 0
          },
          "P": {
            "value": 2,
            "unit": "",
            "label": "Pole Pairs",
            "min": 1
          },
          "J": {
            "value": 0.05,
            "unit": "kg-m^2",
            "label": "Inertia",
            "min": 0,
            "exclusiveMin": true
          },
          "B": {
            "value": 0.005,
            "unit": "N-m-s/rad",
            "label": "Viscous Damping",
            "min": 0
          }
        },
        "ports": [
          {
            "id": "abc",
            "composite": "three_phase",
            "pos": "left",
            "label": "ABC",
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
        "equation": "v_s = Rs·i_s + dψ_s/dt [V]\n0 = Rr·i_r + dψ_r/dt − j·P·ω·ψ_r [V]\nψ_s = (Lls + Lm)·i_s + Lm·i_r,  ψ_r = (Llr + Lm)·i_r + Lm·i_s [Wb]\nτ_e = (3/2)·P·(ψ_sα·i_sβ − ψ_sβ·i_sα) [N·m]\nJ·dω/dt = τ_e − B·ω − τ_shaft [N·m]",
        "description": "Three-phase squirrel-cage induction motor (Krause dq0 model in the stationary αβ frame, amplitude-invariant Clarke transform, rotor referred to the stator; same T-equivalent as Simscape Asynchronous Machine Squirrel Cage). Parameters: stator/rotor resistance Rs, Rr, leakage Lls, Llr, magnetizing Lm, pole pairs P. The stator terminals are the composite three-phase port ABC (wire it to an inverter / source ABC port, or through a Phase Splitter to scalar phases). Wye stator: the phase currents flow from A, B, C through the windings to the star point N (an open N forces i_a + i_b + i_c = 0). The shaft is the scalar Rotational port R (speed relative to the inertial frame, the machine case is fixed to it)."
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
            "label": "Phase Res",
            "min": 0
          },
          "Ls": {
            "value": 0.002,
            "unit": "H",
            "label": "Phase Ind",
            "min": 0,
            "exclusiveMin": true
          },
          "Ke": {
            "value": 0.1,
            "unit": "V*s/rad",
            "label": "Back-EMF / Torque Constant"
          },
          "P": {
            "value": 4,
            "unit": "",
            "label": "Pole Pairs",
            "min": 1
          },
          "J": {
            "value": 0.02,
            "unit": "kg-m^2",
            "label": "Inertia",
            "min": 0,
            "exclusiveMin": true
          },
          "B": {
            "value": 0.002,
            "unit": "N-m-s/rad",
            "label": "Viscous Damping",
            "min": 0
          }
        },
        "ports": [
          {
            "id": "abc",
            "composite": "three_phase",
            "pos": "left",
            "label": "ABC",
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
        "equation": "v_x − v_g = Rs·i_x + Ls·di_x/dt + e_x [V],  e_x = Ke·ω·f(P·θ − φ_x),  φ = 0, 2π/3, −2π/3\nτ_e = (e_a·i_a + e_b·i_b + e_c·i_c)/ω = Ke·(f_a·i_a + f_b·i_b + f_c·i_c) [N·m]\nJ·dω/dt = τ_e − B·ω − τ_shaft [N·m]",
        "description": "Brushless DC motor with trapezoidal back-EMF (unit trapezoid f: ±1 over 120°, 60° ramps; Pillay and Krishnan, IEEE Trans. Ind. Appl. 1989). The stator terminals are the composite three-phase port ABC (wire it to an inverter / source ABC port, or through a Phase Splitter to scalar phases). Wye stator: the phase currents flow from A, B, C through the windings to the star point G (an open G forces i_a + i_b + i_c = 0). One constant Ke [V·s/rad = N·m/A] is both the back-EMF and the torque constant, so the conversion is lossless apart from Rs·i² and B·ω². Needs an external commutation bridge. The shaft is the scalar Rotational port R (speed relative to the inertial frame, the machine case is fixed to it)."
      },
      {
        "id": "thermal_resistor",
        "name": "Thermal Resistor",
        "color": "#ef4444",
        "icon": "thermal_resistor",
        "category": "Thermal",
        "params": {
          "R": {
            "value": 10,
            "unit": "Ω",
            "label": "Electrical Resistance",
            "min": 0,
            "exclusiveMin": true
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
        "equation": "V = I * R\nQ_gen = I² * R = V² / R",
        "description": "Electrical resistor (constant R, no temperature coefficient) whose whole dissipated power P = V·I = I²R = V²/R is delivered as a heat flow into the thermal port H (electrical power in = heat out). Port H must be wired into a thermal network (an open H has nowhere to deliver the heat)."
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
            "domain": "Physical",
            "direction": "in"
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
            "label": "Internal Res",
            "min": 0,
            "exclusiveMin": true
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
            "domain": "Physical",
            "direction": "out",
            "quantity": "voltage",
            "unit": "V"
          }
        ],
        "equation": "V_out = V_p − V_n   [V]  (i_leak = V/R_int, R_int → ∞ ideal)",
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
            "label": "Internal Res",
            "min": 0
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
            "domain": "Physical",
            "direction": "out",
            "quantity": "current",
            "unit": "A"
          }
        ],
        "equation": "I_out = i_p→n   [A]\nV_p − V_n = R_int * i  (R_int = 0 ideal)",
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
            "label": "Internal Res",
            "min": 0
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
        "equation": "V_p − V_n = V + I * R_int   [V]  (I: p → n, R_int = 0 ideal)",
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
            "label": "Frequency",
            "min": 0
          },
          "phase": {
            "value": 0.7853981633974483,
            "unit": "rad",
            "label": "Phase"
          },
          "R_int": {
            "value": 0.001,
            "unit": "Ω",
            "label": "Internal Resistance",
            "min": 0
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
        "equation": "V(t) = Vpk * sin(2*π*f*t + phase); Vp - Vn = V(t) + I * R_int",
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
            "label": "Line Voltage",
            "min": 0
          },
          "f": {
            "value": 50,
            "unit": "Hz",
            "label": "Frequency",
            "min": 0
          },
          "phase": {
            "value": 0,
            "unit": "deg",
            "label": "Phase Angle of Phase A"
          }
        },
        "ports": [
          {
            "id": "abc",
            "composite": "three_phase",
            "pos": "right",
            "label": "abc",
            "domain": "Electrical"
          },
          {
            "id": "n",
            "pos": "bottom",
            "label": "N",
            "domain": "Electrical"
          }
        ],
        "equation": "v_a = √(2/3)·V_LL·sin(2π·f·t + φ)\nv_b = √(2/3)·V_LL·sin(2π·f·t + φ − 2π/3)\nv_c = √(2/3)·V_LL·sin(2π·f·t + φ + 2π/3)   [V], phase to neutral n\ni_n = −(i_a + i_b + i_c)   [A]",
        "description": "Balanced wye three-phase voltage source (Simscape Three-Phase Source): V_LL = phase-to-phase RMS voltage, frequency f, phase angle φ of phase A (default 0 deg), positive a-b-c sequence. The composite port abc carries the three phase terminals (connect a Phase Splitter for the scalar phases) and the star point N is a real terminal: reference it with an Electrical Reference block. A balanced load returns zero current in N."
      },
      {
        "id": "controlled_voltage",
        "name": "Controlled Voltage Source",
        "color": "#ef4444",
        "icon": "controlled_voltage",
        "category": "Sources",
        "params": {
          "R_int": {
            "value": 0.001,
            "unit": "Ω",
            "label": "Internal Resistance",
            "min": 0
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
            "id": "s",
            "pos": "left",
            "label": "S",
            "domain": "Physical",
            "direction": "in"
          }
        ],
        "equation": "V_p − V_n = s(t) + I * R_int   [V]",
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
        "equation": "I (p → n) = I_src   [A]",
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
            "id": "cp",
            "pos": "left",
            "label": "C+",
            "domain": "Electrical"
          },
          {
            "id": "cn",
            "pos": "left",
            "label": "C-",
            "domain": "Electrical"
          }
        ],
        "equation": "V_p − V_n = Gain * (V_cp − V_cn)   [V], i_ctrl = 0",
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
            "id": "cp",
            "pos": "left",
            "label": "C+",
            "domain": "Electrical"
          },
          {
            "id": "cn",
            "pos": "left",
            "label": "C-",
            "domain": "Electrical"
          }
        ],
        "equation": "I (p → n) = Gm * (V_cp − V_cn)   [A = S·V], i_ctrl = 0",
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
          },
          "R_in": {
            "value": 0,
            "unit": "Ω",
            "label": "Control Input Resistance",
            "min": 0
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
            "id": "cp",
            "pos": "left",
            "label": "C+",
            "domain": "Electrical"
          },
          {
            "id": "cn",
            "pos": "left",
            "label": "C-",
            "domain": "Electrical"
          }
        ],
        "equation": "I_out (p → n) = Gain * I_ctrl   [A]\nV_cp − V_cn = R_in * I_ctrl",
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
          },
          "R_in": {
            "value": 0,
            "unit": "Ω",
            "label": "Control Input Resistance",
            "min": 0
          },
          "R_out": {
            "value": 0,
            "unit": "Ω",
            "label": "Output Resistance",
            "min": 0
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
            "id": "cp",
            "pos": "left",
            "label": "C+",
            "domain": "Electrical"
          },
          {
            "id": "cn",
            "pos": "left",
            "label": "C-",
            "domain": "Electrical"
          }
        ],
        "equation": "V_p − V_n = Rm * I_ctrl + R_out * I_out   [V = Ω·A]\nV_cp − V_cn = R_in * I_ctrl",
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
            "label": "A",
            "domain": "Electrical"
          }
        ],
        "equation": "V = 0 V   (electrical reference)",
        "description": "The zero-potential reference for the electrical circuit. All voltage measurements are relative to this node."
      },
      {
        "id": "busbar",
        "name": "Busbar",
        "color": "#3b82f6",
        "icon": "busbar",
        "category": "Connections",
        "params": {},
        "ports": [
          {
            "id": "1",
            "pos": "left",
            "label": "1",
            "domain": "Electrical"
          },
          {
            "id": "2",
            "pos": "right",
            "label": "2",
            "domain": "Electrical"
          }
        ],
        "equation": "V_1 = V_2 = … = V_n   [V]\nΣ I_k = 0   [A]",
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
            "composite": "three_phase",
            "pos": "left",
            "label": "abc",
            "domain": "Electrical"
          },
          {
            "id": "a",
            "pos": "right",
            "label": "a",
            "domain": "Electrical"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "b",
            "domain": "Electrical"
          },
          {
            "id": "c",
            "pos": "right",
            "label": "c",
            "domain": "Electrical"
          }
        ],
        "equation": "V_a = V_abc[a], V_b = V_abc[b], V_c = V_abc[c]\nKCL per phase: I_abc,k = I_k",
        "description": "Splits the composite three-phase port abc into its scalar phase ports a, b and c (Simscape Phase Splitter). The phases are independent: each phase k of abc is tied to scalar port k only."
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
            "label": "A",
            "domain": "Electrical"
          }
        ],
        "equation": "V_a = 0 V   (reference node of the delta network)",
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
            "label": "A",
            "domain": "Electrical"
          }
        ],
        "equation": "I = 0 A   (open terminal)",
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
            "width": 3,
            "channelNames": ["a", "b", "c"],
            "pos": "left",
            "label": "abc",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "a",
            "pos": "right",
            "label": "a",
            "domain": "Physical",
            "direction": "out",
            "quantity": "demux component 1",
            "unit": "*"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "b",
            "domain": "Physical",
            "direction": "out",
            "quantity": "demux component 2",
            "unit": "*"
          },
          {
            "id": "c",
            "pos": "right",
            "label": "c",
            "domain": "Physical",
            "direction": "out",
            "quantity": "demux component 3",
            "unit": "*"
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
            "label": "G",
            "domain": "Gas"
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
            "label": "A",
            "domain": "Gas"
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
            "label": "Volume",
            "min": 0,
            "exclusiveMin": true
          },
          "T": {
            "value": 293.15,
            "unit": "K",
            "label": "Gas Temperature",
            "min": 0,
            "exclusiveMin": true
          },
          "P0": {
            "value": 101325,
            "unit": "Pa",
            "label": "Initial Pressure",
            "min": 0
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "top",
            "label": "A",
            "domain": "Gas"
          },
          {
            "id": "b",
            "pos": "top",
            "label": "B",
            "domain": "Gas"
          }
        ],
        "equation": "dp/dt = (R*T/V) * (mdot_a + mdot_b),  p(0) = P0   (ideal gas p = rho*R*T, isothermal, R = 287 J/(kg K))",
        "description": "A rigid container that stores gas at the fixed temperature T. Mass conservation dm/dt = mdot_a + mdot_b with m = p V / (R T) gives the pressure rise from the net mass flow into the two ports (both ports are the chamber node). An unconnected port is closed (no flow)."
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
            "label": "Pressure",
            "min": 0,
            "exclusiveMin": true
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "bottom",
            "label": "A",
            "domain": "Gas"
          },
          {
            "id": "s",
            "pos": "left",
            "label": "S",
            "domain": "Physical",
            "direction": "in"
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
            "label": "Conductance",
            "min": 0,
            "exclusiveMin": true
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A",
            "domain": "Gas"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "B",
            "domain": "Gas"
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
            "label": "A",
            "domain": "Gas"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "B",
            "domain": "Gas"
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
            "label": "Area",
            "min": 0,
            "exclusiveMin": true
          },
          "Cd": {
            "value": 0.62,
            "unit": "1",
            "label": "Discharge Coefficient",
            "min": 0,
            "exclusiveMin": true,
            "max": 1
          },
          "T": {
            "value": 293.15,
            "unit": "K",
            "label": "Gas Temperature",
            "min": 0,
            "exclusiveMin": true
          },
          "gamma": {
            "value": 1.4,
            "unit": "1",
            "label": "Specific Heat Ratio",
            "min": 1,
            "exclusiveMin": true
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A",
            "domain": "Gas"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "B",
            "domain": "Gas"
          },
          {
            "id": "ar",
            "pos": "top",
            "label": "AR",
            "domain": "Physical",
            "direction": "in"
          }
        ],
        "equation": "mdot = Cd*A*p_up*sqrt(2*gamma/((gamma-1)*R*T)) * sqrt(r^(2/gamma) - r^((gamma+1)/gamma)),  r = max(p_dn/p_up, r*),  r* = (2/(gamma+1))^(gamma/(gamma-1))  (choked: mdot = Cd*A*p_up*sqrt(gamma/(R*T))*(2/(gamma+1))^((gamma+1)/(2(gamma-1))))",
        "description": "Compressible gas orifice (Simscape Local Restriction (G)): isentropic Saint-Venant & Wantzel flow of an ideal gas (R = 287 J/(kg K)) at the fixed upstream temperature T, from the higher-pressure port to the lower one. The flow chokes at the critical pressure ratio r* (0.528 for air) and stays constant below it; above the laminar pressure ratio 0.999 it is linear in the pressure difference, so it has a finite slope at zero. The area comes from the AR input when wired, else from the area parameter."
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
            "label": "Length",
            "min": 0,
            "exclusiveMin": true
          },
          "D": {
            "value": 0.05,
            "unit": "m",
            "label": "Diameter",
            "min": 0,
            "exclusiveMin": true
          },
          "f": {
            "value": 0.02,
            "unit": "1",
            "label": "Friction Factor",
            "min": 0
          },
          "T": {
            "value": 293.15,
            "unit": "K",
            "label": "Gas Temperature",
            "min": 0,
            "exclusiveMin": true
          },
          "mu": {
            "value": 0.0000181,
            "unit": "Pa·s",
            "label": "Dynamic Viscosity",
            "min": 0,
            "exclusiveMin": true
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A",
            "domain": "Gas"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "B",
            "domain": "Gas"
          },
        ],
        "equation": "p_a - p_b = f_eff * (L/D) * rho * v^2/2,  rho = p_mean/(R*T),  v = mdot/(rho*S),  f_eff = max(f, 64/Re),  Re = 4*|mdot|/(pi*D*mu)",
        "description": "Darcy-Weisbach friction in a straight circular pipe for an isothermal ideal gas (R = 287 J/(kg K)): f is the turbulent friction factor, and below it the laminar Hagen-Poiseuille law f = 64/Re applies so the pressure drop is linear in the flow near zero. mdot is positive from A to B. Heat transfer is not represented."
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
            "label": "Pressure",
            "min": 0,
            "exclusiveMin": true
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "top",
            "label": "A",
            "domain": "Gas"
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
            "label": "Displacement",
            "nonZero": true
          },
          "T": {
            "value": 293.15,
            "unit": "K",
            "label": "Gas Temperature",
            "min": 0,
            "exclusiveMin": true
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A",
            "domain": "Gas"
          },
          {
            "id": "h",
            "pos": "left",
            "label": "H",
            "domain": "Gas"
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
        "equation": "ṁ(A→H) = ρ_A·D·ω [kg/s],  ρ_A = P_A/(R_gas·T),  ω = ω_R − ω_C [rad/s]\nτ = D·(P_A − P_H) [N·m]  (torque delivered at R, reaction at C)\n(P_A − P_H)·ṁ/ρ_A = −τ_in·ω",
        "description": "Ideal positive-displacement rotary machine (vane or piston motor / compressor) between the gas ports A and H and the Rotational ports R / C. D (m³/rad) is the displacement: the volumetric flow at A is D·ω and the shaft torque is D·(P_A − P_H), so the shaft power τ·ω equals the pressure power (P_A − P_H)·V̇ and no power is lost. The gas is ideal at the fixed temperature T (R_gas = 287 J/(kg·K), air). Positive ω pumps gas from A to H."
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
            "label": "Piston Area",
            "min": 0,
            "exclusiveMin": true
          },
          "T": {
            "value": 293.15,
            "unit": "K",
            "label": "Gas Temperature",
            "min": 0,
            "exclusiveMin": true
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A",
            "domain": "Gas"
          },
          {
            "id": "h",
            "pos": "left",
            "label": "H",
            "domain": "Gas"
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
          }
        ],
        "equation": "ṁ(A→H) = ρ_A·A·v [kg/s],  ρ_A = P_A/(R_gas·T),  v = v_R − v_C [m/s]\nF = A·(P_A − P_H) [N]  (force delivered at R, reaction at C)\n(P_A − P_H)·ṁ/ρ_A = −F_in·v",
        "description": "Ideal double-acting pneumatic cylinder between the gas ports A and H and the Translational ports R / C. A (m²) is the piston area: the volumetric flow at A is A·v and the piston force is A·(P_A − P_H), so the mechanical power F·v equals the pressure power (P_A − P_H)·V̇ and no power is lost. The gas is ideal at the fixed temperature T (R_gas = 287 J/(kg·K), air). Positive v pumps gas from A to H."
      },
      {
        "id": "gas_pressure_sensor",
        "name": "Pressure Sensor (G)",
        "color": "#f59e0b",
        "icon": "gas_pressure_sensor",
        "category": "Sensors",
        "params": {},
        "ports": [
          { "id": "p", "pos": "left", "label": "P", "domain": "Gas" },
          { "id": "out", "pos": "right", "label": "OUT", "domain": "Physical", "direction": "out", "quantity": "pressure", "unit": "Pa" }
        ],
        "equation": "mass_flow = 0\nout = P(p)",
        "description": "Measures gas pressure at a node without drawing mass flow; connect OUT to a Scope for Pa."
      },
      {
        "id": "gas_flow_sensor",
        "name": "Flow Sensor (G)",
        "color": "#f59e0b",
        "icon": "gas_flow_sensor",
        "category": "Sensors",
        "params": {},
        "ports": [
          { "id": "p", "pos": "left", "label": "P", "domain": "Gas" },
          { "id": "n", "pos": "left", "label": "N", "domain": "Gas" },
          { "id": "out", "pos": "right", "label": "OUT", "domain": "Physical", "direction": "out", "quantity": "mass flow rate", "unit": "kg/s" }
        ],
        "equation": "P(p) = P(n)\nout = mdot",
        "description": "Ideal gas flow sensor that passes the line without pressure loss; connect OUT to a Scope for kg/s."
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
            "label": "A",
            "domain": "Gas"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "B",
            "domain": "Gas"
          },
          {
            "id": "m",
            "pos": "top",
            "label": "M",
            "domain": "Physical",
            "direction": "in"
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
            "label": "Pressure",
            "min": 0,
            "exclusiveMin": true
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A",
            "domain": "Gas"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "B",
            "domain": "Gas"
          },
          {
            "id": "p",
            "pos": "top",
            "label": "P",
            "domain": "Physical",
            "direction": "in"
          }
        ],
        "equation": "Pb - Pa = P_source",
        "description": "Ideal pneumatic pressure source maintaining a specified pressure differential across ports."
      },
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
            "label": "N",
            "domain": "Magnetic"
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
            "label": "Reluctance",
            "min": 0,
            "exclusiveMin": true
          }
        },
        "ports": [
          {
            "id": "n",
            "pos": "left",
            "label": "N",
            "domain": "Magnetic"
          },
          {
            "id": "s",
            "pos": "right",
            "label": "S",
            "domain": "Magnetic"
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
          "l": {
            "value": 0.1,
            "unit": "m",
            "label": "Core Length",
            "min": 0,
            "exclusiveMin": true
          },
          "A": {
            "value": 0.0001,
            "unit": "m^2",
            "label": "Cross-Section Area",
            "min": 0,
            "exclusiveMin": true
          },
          "mu_r": {
            "value": 1000,
            "unit": "1",
            "label": "Relative Permeability",
            "min": 0,
            "exclusiveMin": true
          }
        },
        "ports": [
          {
            "id": "n",
            "pos": "left",
            "label": "N",
            "domain": "Magnetic"
          },
          {
            "id": "s",
            "pos": "right",
            "label": "S",
            "domain": "Magnetic"
          }
        ],
        "equation": "MMF = Φ * R,  R = l / (μ0 * μr * A)",
        "description": "Reluctance of a uniform magnetic core segment from its length l [m], cross-section A [m²] and relative permeability μr (μ0 = 4π·10⁻⁷ H/m), then Hopkinson's law MMF = R·Φ."
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
            "label": "Min Reluctance",
            "min": 0,
            "exclusiveMin": true
          },
          "R": {
            "value": 1000000,
            "unit": "A-t/Wb",
            "label": "Reluctance When Control Port Unwired",
            "min": 0,
            "exclusiveMin": true
          }
        },
        "ports": [
          {
            "id": "n",
            "pos": "left",
            "label": "N",
            "domain": "Magnetic"
          },
          {
            "id": "s",
            "pos": "right",
            "label": "S",
            "domain": "Magnetic"
          },
          {
            "id": "ctrl",
            "domain": "Physical",
            "direction": "in",
            "pos": "top",
            "label": "C"
          }
        ],
        "equation": "MMF = Φ * max(Rmin, ctrl)",
        "description": "Variable reluctance: the reluctance R [A-t/Wb] is the physical signal wired to port C, bounded below by Rmin so it never becomes a short; when C is unwired the parameter R is used. Hopkinson's law MMF = R·Φ."
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
            "label": "Coercivity",
            "min": 0
          },
          "Lm": {
            "value": 0.05,
            "unit": "m",
            "label": "Magnet Length",
            "min": 0,
            "exclusiveMin": true
          },
          "Rm": {
            "value": 0,
            "unit": "A-t/Wb",
            "label": "Internal Reluctance",
            "min": 0
          }
        },
        "ports": [
          {
            "id": "n",
            "pos": "left",
            "label": "N",
            "domain": "Magnetic"
          },
          {
            "id": "s",
            "pos": "right",
            "label": "S",
            "domain": "Magnetic"
          }
        ],
        "equation": "MMF = Hc * Lm - Φ * Rm",
        "description": "Permanent magnet modeled as an mmf source Hc·Lm in series with its internal reluctance Rm (Thevenin): the mmf rise from S to N is Hc·Lm - Rm·Φ, with Φ the flux delivered into the circuit at N."
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
            "label": "Number of Turns",
            "min": 0,
            "exclusiveMin": true
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
            "id": "mag_n",
            "pos": "right",
            "label": "N",
            "domain": "Magnetic"
          },
          {
            "id": "mag_s",
            "pos": "right",
            "label": "S",
            "domain": "Magnetic"
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
          "R0": {
            "value": 1000000,
            "unit": "A-t/Wb",
            "label": "Initial Reluctance",
            "min": 0,
            "exclusiveMin": true
          },
          "K": {
            "value": 10000000,
            "unit": "A-t/(Wb-m)",
            "label": "Reluctance Gradient (dR/dx)"
          }
        },
        "ports": [
          {
            "id": "n",
            "domain": "Magnetic",
            "pos": "left",
            "label": "N"
          },
          {
            "id": "s",
            "domain": "Magnetic",
            "pos": "left",
            "label": "S"
          },
          {
            "id": "r",
            "domain": "Translational",
            "pos": "right",
            "label": "R"
          },
          {
            "id": "c",
            "domain": "Translational",
            "pos": "right",
            "label": "C"
          }
        ],
        "equation": "R = R0 + K * x,  x = ∫(v_R - v_C) dt\nMMF = Φ * R\nF_R = -½ Φ² dR/dx = -½ Φ² K",
        "description": "Reluctance force actuator (Maxwell force at fixed flux, F = -dW/dx with W = Φ²R/2). The air-gap position x is the integral of the relative velocity v_R - v_C (x = 0 where R = R0); the force F_R acts on the body at port R and is directed toward lower reluctance (attraction for K > 0)."
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
            "label": "N",
            "domain": "Magnetic"
          },
          {
            "id": "s",
            "pos": "right",
            "label": "S",
            "domain": "Magnetic"
          },
          {
            "id": "phi",
            "domain": "Physical",
            "direction": "out",
            "quantity": "magnetic flux",
            "unit": "Wb",
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
            "label": "N",
            "domain": "Magnetic"
          },
          {
            "id": "s",
            "pos": "bottom",
            "label": "S",
            "domain": "Magnetic"
          },
          {
            "id": "f",
            "domain": "Physical",
            "direction": "out",
            "quantity": "magnetomotive force",
            "unit": "A",
            "pos": "right",
            "label": "F"
          }
        ],
        "equation": "MMF_out = MMF_n - MMF_s",
        "description": "Ideal across sensor: measures the magnetomotive force difference MMF_N - MMF_S between two magnetic terminals and draws no flux (wire it in parallel with the element, like a voltmeter)."
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
            "label": "N",
            "domain": "Magnetic"
          },
          {
            "id": "s",
            "pos": "bottom",
            "label": "S",
            "domain": "Magnetic"
          }
        ],
        "equation": "MMF_N - MMF_S = MMF",
        "description": "Ideal source of magnetomotive force: holds the MMF rise from S to N at the parameter MMF [A-t] whatever flux the circuit draws (flux Φ = MMF / R_total through a reluctance R)."
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
            "label": "N",
            "domain": "Magnetic"
          },
          {
            "id": "s",
            "pos": "bottom",
            "label": "S",
            "domain": "Magnetic"
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
        "params": {
          "MMF": {
            "value": 0,
            "unit": "A-t",
            "label": "MMF When Control Port Unwired"
          }
        },
        "ports": [
          {
            "id": "n",
            "pos": "top",
            "label": "N",
            "domain": "Magnetic"
          },
          {
            "id": "s",
            "pos": "bottom",
            "label": "S",
            "domain": "Magnetic"
          },
          {
            "id": "src",
            "domain": "Physical",
            "direction": "in",
            "pos": "left",
            "label": "S"
          }
        ],
        "equation": "MMF_N - MMF_S = S",
        "description": "Controlled MMF source: holds the MMF rise from S to N [A-t] equal to the physical signal wired to port S; when that port is unwired the parameter MMF is used."
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
        "params": {},
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
            "domain": "Physical",
            "direction": "out",
            "quantity": "force",
            "unit": "N"
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
        "params": {},
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
            "domain": "Physical",
            "direction": "out",
            "quantity": "angular velocity",
            "unit": "rad/s"
          },
          {
            "id": "a",
            "pos": "top",
            "label": "A",
            "domain": "Physical",
            "direction": "out",
            "quantity": "angle",
            "unit": "rad"
          }
        ],
        "equation": "w_out = ω, a_out = θ; dθ/dt = ω",
        "description": "Ideal rotational sensor measuring angular velocity ω and angular position θ."
      },
      {
        "id": "torque_sensor",
        "name": "Ideal Torque Sensor",
        "color": "#10b981",
        "icon": "torque_sensor",
        "category": "Sensors",
        "params": {},
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
            "domain": "Physical",
            "direction": "out",
            "quantity": "torque",
            "unit": "N*m"
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
        "params": {},
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
            "domain": "Physical",
            "direction": "out",
            "quantity": "velocity",
            "unit": "m/s"
          },
          {
            "id": "p",
            "pos": "top",
            "label": "P",
            "domain": "Physical",
            "direction": "out",
            "quantity": "position",
            "unit": "m"
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
            "domain": "Physical",
            "direction": "in"
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
            "domain": "Physical",
            "direction": "in"
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
            "domain": "Physical",
            "direction": "in"
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
            "label": "Gear Ratio",
            "nonZero": true
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
        "equation": "ω1 = ratio·ω2 [rad/s]\nτ1,in·ratio + τ2,in = 0 [N·m]   (delivered τ2 = ratio·τ1; P = τ1·ω1 + τ2·ω2 = 0)",
        "description": "Ideal (lossless, massless, backlash-free) simple gear between shaft S1 (input / follower side, faster) and shaft S2 (output / base side); both shafts are scalar Rotational ports referenced to the inertial frame. ratio = ω1/ω2 (dimensionless, nonzero; a ratio of 0 is rejected). A positive ratio makes both shafts rotate in the same direction and a negative ratio reverses the direction (the Simscape Simple Gear 'output shaft rotates in the opposite direction' setting); the magnitude is the teeth ratio. The torque delivered to S2 is the torque into S1 multiplied by the ratio, so the transmitted power is zero for either sign."
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
            "label": "Length 1",
            "min": 0,
            "exclusiveMin": true
          },
          "L2": {
            "value": 0.5,
            "unit": "m",
            "label": "Length 2",
            "min": 0,
            "exclusiveMin": true
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
        "equation": "(v_A − v_C)·L2 + (v_B − v_C)·L1 = 0 [m/s·m]   (opposite sides of the pivot: v_A − v_C = −(L1/L2)·(v_B − v_C))\nF_A·L1 − F_B·L2 = 0,  F_A + F_B + F_C = 0 [N]   (forces into the block; P = F_A·v_A + F_B·v_B + F_C·v_C = 0)",
        "description": "Ideal massless rigid lever pivoting about port C, with port A at arm length L1 on one side of the pivot and port B at arm length L2 on the opposite side (small-angle, translational ports). Port C is the pivot (fulcrum) and carries the reaction force F_C = −(F_A + F_B); the pivot may move (v_C) or be tied to a Translational reference. A positive velocity at A gives a negative velocity at B relative to the pivot, with v_A/v_B = −L1/L2; the moment balance about the pivot is F_A·L1 = F_B·L2. Lossless: the three port powers sum to zero."
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
            "label": "Wheel Radius",
            "min": 0,
            "exclusiveMin": true
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
        "equation": "v_P = Rw·ω_A [m/s]\nτ_A,in + Rw·F_P,in = 0 [N·m]   (P = τ_A·ω_A + F_P·v_P = 0)",
        "description": "Ideal wheel and axle (rolling without slip, lossless): the Translational port P moves at v = Rw·ω of the Rotational axle A (both referenced to the inertial frame) and the axle torque is the wheel radius times the force, τ = Rw·F, so the transmitted power is zero. Rw > 0 (m)."
      },
      {
        "id": "rot_multibody_interface",
        "name": "Rotational Multibody Interface",
        "color": "#10b981",
        "icon": "rot_multibody",
        "category": "Multibody Interfaces",
        "params": {
          "axis": {
            "value": "[0 0 1]",
            "unit": "",
            "label": "Rotation axis (B-local, normalized)"
          }
        },
        "ports": [
          {
            "id": "b",
            "pos": "left",
            "label": "B",
            "domain": "Frame"
          },
          {
            "id": "f",
            "pos": "left",
            "label": "F",
            "domain": "Frame"
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
          },
          {
            "id": "w",
            "pos": "right",
            "label": "W",
            "domain": "Physical",
            "direction": "out",
            "quantity": "angular velocity",
            "unit": "rad/s"
          }
        ],
        "equation": "ω_R − ω_C = ω_rel = a·(ω_F − ω_B)  [rad/s],  a = R_B·axis (world)\nτ_F = T·a,  τ_B = −T·a  [N·m]   (T = torque from R to C; P = T·ω_rel)",
        "description": "Scalar-to-Frame bridge for a Rotational network (one of the only two allowed scalar/Frame connections). Wire B and F in parallel with the Frames of a joint (for example a Revolute Joint) that has the same axis: the angular velocity of F relative to B about the normalized B-local axis parameter is imposed on the Rotational port pair R-C (ω_R − ω_C = ω_rel), and the torque T of the Rotational network is applied as a pure couple T·a on F with the reaction −T·a on B, about the configured axis (never a fixed X or Z axis). Ideal and lossless: T·ω_rel is handed from the network to the Frames. Output w is ω_rel (rad/s)."
      },
      {
        "id": "trans_multibody_interface",
        "name": "Translational Multibody Interface",
        "color": "#10b981",
        "icon": "trans_multibody",
        "category": "Multibody Interfaces",
        "params": {
          "axis": {
            "value": "[0 0 1]",
            "unit": "",
            "label": "Slide axis (B-local, normalized)"
          }
        },
        "ports": [
          {
            "id": "b",
            "pos": "left",
            "label": "B",
            "domain": "Frame"
          },
          {
            "id": "f",
            "pos": "left",
            "label": "F",
            "domain": "Frame"
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
            "id": "v",
            "pos": "right",
            "label": "V",
            "domain": "Physical",
            "direction": "out",
            "quantity": "velocity",
            "unit": "m/s"
          }
        ],
        "equation": "v_R − v_C = v_rel = d/dt (a·(P_F − P_B))  [m/s],  a = R_B·axis (world)\nf_F = F·a,  f_B = −F·a,  τ_B = −(P_F − P_B) × F·a   (F = force from R to C; P = F·v_rel)",
        "description": "Scalar-to-Frame bridge for a Translational network (one of the only two allowed scalar/Frame connections). Wire B and F in parallel with the Frames of a joint (for example a Prismatic Joint) that has the same axis: the slide rate of F relative to B along the normalized B-local axis parameter is imposed on the Translational port pair R-C (v_R − v_C = v_rel), and the force F of the Translational network is applied along that axis on F with the reaction on B (including the moment of the lever arm P_F − P_B), never along a fixed X axis. Ideal and lossless: F·v_rel is handed from the network to the Frames. Output v is v_rel (m/s)."
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
            "label": "Inertia",
            "min": 0,
            "exclusiveMin": true
          },
          "B": {
            "value": 0,
            "unit": "N-m-s/rad",
            "label": "Viscous Drag to Inertial Frame (extension, 0 = Simscape)",
            "min": 0
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
        "equation": "τ = J * dω/dt  (ω = speed of port R relative to the inertial frame; optional drag τ += B ω, default B = 0)",
        "description": "Rotational flywheel inertia relating net torque to angular acceleration via moment of inertia J (Simscape Inertia). B is an optional viscous drag against the inertial frame, 0 by default; add a Rotational Damper to a Rotational Reference for a physical drag."
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
            "label": "Spring Rate",
            "min": 0
          },
          "theta0": {
            "value": 0,
            "unit": "rad",
            "label": "Initial Deformation"
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
        "equation": "τ = k * φ,  φ = θ0 + ∫(ω_R − ω_C) dt",
        "description": "Torsional spring (Simscape Rotational Spring) with restoring torque proportional to the relative angle φ; θ0 is the initial deformation."
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
            "label": "Damping Coefficient",
            "min": 0
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
        "equation": "τ = b * (ω_R − ω_C)",
        "description": "Rotational viscous damper (Simscape Rotational Damper) generating resistive torque proportional to relative angular velocity; b in N-m-s/rad."
      },
      {
        "id": "rot_friction",
        "name": "Rotational Friction",
        "color": "#10b981",
        "icon": "rot_friction",
        "category": "Rotational Elements",
        "params": {
          "Tbrk": {
            "value": 0.6,
            "unit": "N-m",
            "label": "Breakaway Friction Torque (>= Coulomb)",
            "min": 0
          },
          "Tc": {
            "value": 0.5,
            "unit": "N-m",
            "label": "Coulomb Friction Torque",
            "min": 0
          },
          "Tv": {
            "value": 0.1,
            "unit": "N-m-s/rad",
            "label": "Viscous Friction Coefficient",
            "min": 0
          },
          "cv": {
            "value": 10,
            "unit": "s/rad",
            "label": "Transition Approximation Coefficient",
            "min": 0
          },
          "wthr": {
            "value": 0.01,
            "unit": "rad/s",
            "label": "Linear Region Velocity Threshold",
            "min": 0,
            "exclusiveMin": true
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
        "equation": "τ = [Tc + (Tbrk − Tc)·exp(−cv·|ω|)]·tanh(4ω/ω_thr) + Tv·ω,  ω = ω_R − ω_C",
        "description": "Rotational friction (Simscape Rotational Friction): Stribeck + Coulomb + viscous torque between ports R and C. The sign of the velocity is smoothed by tanh(4ω/ω_thr), so below breakaway the shafts creep at a tiny speed instead of switching state."
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
          },
          "k": {
            "value": 1000,
            "unit": "N-m/rad",
            "label": "Contact Stiffness",
            "min": 0,
            "exclusiveMin": true
          },
          "c": {
            "value": 0.1,
            "unit": "N-m-s/rad",
            "label": "Contact Damping",
            "min": 0
          },
          "transition": {
            "value": 0.0001,
            "unit": "rad",
            "label": "Transition Region",
            "min": 0,
            "exclusiveMin": true
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
        "equation": "θ = ∫(ω_R − ω_C) dt;  p = θ − upper (θ > upper) or lower − θ (θ < lower);  τ_stop = ±max(0, k·p + c·ω_out·S(p/w)),  S = cubic smooth step (0 → 1)",
        "description": "Rotational hard stop (Simscape Rotational Hard Stop, continuous damped-rebound contact): zero torque inside [lower, upper]; outside, contact stiffness k plus contact damping c that fades in over the transition region w, so the torque is continuous at contact entry and the stop never pulls. Contact entry and exit are solver events."
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
            "label": "Mass",
            "min": 0,
            "exclusiveMin": true
          },
          "b": {
            "value": 0,
            "unit": "N-s/m",
            "label": "Viscous Drag to Inertial Frame (extension, 0 = Simscape)",
            "min": 0
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
        "equation": "F = m * dv/dt  (v = speed of port P relative to the inertial frame; optional drag F += b v, default b = 0)",
        "description": "Translational rigid mass governed by Newton's second law relating net force to acceleration (Simscape Mass). b is an optional viscous drag against the inertial frame, 0 by default; add a Translational Damper to a Translational Reference for a physical drag."
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
            "label": "Spring Rate",
            "min": 0
          },
          "x0": {
            "value": 0,
            "unit": "m",
            "label": "Initial Deformation"
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
        "equation": "F = k * x,  x = x0 + ∫(v_R − v_C) dt",
        "description": "Translational spring (Simscape Translational Spring) with force proportional to the relative displacement x; x0 is the initial deformation."
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
            "label": "Damping Coefficient",
            "min": 0
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
        "equation": "F = b * (v_R − v_C)",
        "description": "Translational viscous damper (Simscape Translational Damper): force proportional to the relative velocity of ports R and C; b in N-s/m."
      },
      {
        "id": "trans_friction",
        "name": "Translational Friction",
        "color": "#10b981",
        "icon": "trans_friction",
        "category": "Translational Elements",
        "params": {
          "Fbrk": {
            "value": 6,
            "unit": "N",
            "label": "Breakaway Friction Force (>= Coulomb)",
            "min": 0
          },
          "Fc": {
            "value": 5,
            "unit": "N",
            "label": "Coulomb Friction Force",
            "min": 0
          },
          "Fv": {
            "value": 2,
            "unit": "N-s/m",
            "label": "Viscous Friction Coefficient",
            "min": 0
          },
          "cv": {
            "value": 10,
            "unit": "s/m",
            "label": "Transition Approximation Coefficient",
            "min": 0
          },
          "vthr": {
            "value": 0.01,
            "unit": "m/s",
            "label": "Linear Region Velocity Threshold",
            "min": 0,
            "exclusiveMin": true
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
        "equation": "F = [Fc + (Fbrk − Fc)·exp(−cv·|v|)]·tanh(4v/v_thr) + Fv·v,  v = v_R − v_C",
        "description": "Translational friction (Simscape Translational Friction): Stribeck + Coulomb + viscous force between ports R and C. The sign of the velocity is smoothed by tanh(4v/v_thr), so below breakaway the bodies creep at a tiny speed instead of switching state."
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
          },
          "k": {
            "value": 10000,
            "unit": "N/m",
            "label": "Contact Stiffness",
            "min": 0,
            "exclusiveMin": true
          },
          "c": {
            "value": 10,
            "unit": "N-s/m",
            "label": "Contact Damping",
            "min": 0
          },
          "transition": {
            "value": 0.0001,
            "unit": "m",
            "label": "Transition Region",
            "min": 0,
            "exclusiveMin": true
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
        "equation": "x = ∫(v_R − v_C) dt;  p = x − upper (x > upper) or lower − x (x < lower);  F_stop = ±max(0, k·p + c·v_out·S(p/w)),  S = cubic smooth step (0 → 1)",
        "description": "Translational hard stop (Simscape Translational Hard Stop, continuous damped-rebound contact): zero force inside [lower, upper]; outside, contact stiffness k plus contact damping c that fades in over the transition region w, so the force is continuous at contact entry and the stop never pulls. Contact entry and exit are solver events."
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
            "label": "G",
            "domain": "Fluid"
          }
        ],
        "equation": "p = 0 Pa (absolute pressure zero)",
        "description": "Absolute pressure reference of a Moist Air network (the analogue of the Thermal Reference at 0 K): pins the connected node at 0 Pa absolute and absorbs any mass flow. The Moist Air ports carry total pressure and mass flow only; the psychrometric state (temperature, relative humidity) is a parameter of each block."
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
            "label": "Volume",
            "min": 0,
            "exclusiveMin": true
          },
          "ambient_temp": {
            "value": 25,
            "unit": "C",
            "label": "Ambient Temperature",
            "min": -273.15,
            "exclusiveMin": true
          },
          "wall_mass": {
            "value": 2,
            "unit": "kg",
            "label": "Wall Mass",
            "min": 0
          },
          "wall_cp": {
            "value": 460,
            "unit": "J/(kg*K)",
            "label": "Wall Specific Heat",
            "min": 0,
            "exclusiveMin": true
          },
          "food_mass": {
            "value": 0.5,
            "unit": "kg",
            "label": "Load Mass",
            "min": 0
          },
          "food_cp": {
            "value": 4184,
            "unit": "J/(kg*K)",
            "label": "Load Specific Heat",
            "min": 0,
            "exclusiveMin": true
          },
          "k_loss": {
            "value": 8.5,
            "unit": "W/K",
            "label": "Heat Loss Coefficient",
            "min": 0
          },
          "max_temp": {
            "value": 220,
            "unit": "C",
            "label": "Safety Cutout Temperature",
            "min": -273.15,
            "exclusiveMin": true
          },
          "P0": {
            "value": 101325,
            "unit": "Pa",
            "label": "Initial Pressure",
            "min": 0
          },
          "phi": {
            "value": 0.5,
            "unit": "1",
            "label": "Initial Relative Humidity",
            "min": 0,
            "max": 1
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
        "equation": "dm/dt = mdot_a + mdot_b, m = p*V/(R*T)  ->  dp/dt = (R*T/V)*(mdot_a + mdot_b) + (p/T)*dT/dt\nC dT/dt = Q_H - k_loss*(T - T_amb),  C = m*c_v + m_wall*c_wall + m_load*c_load,  R = (R_a + w*R_v)/(1 + w)",
        "description": "Constant-volume chamber of moist air (ideal mixture, Dalton's law): mass conservation of the rigid volume gives the pressure from the net inflow at A and B and from the temperature change; the humidity ratio w is fixed by the initial relative humidity phi at P0 and the ambient temperature (no condensation). The ports carry no enthalpy, so the energy balance uses only the heat flow Q_H at port H, the loss to the ambient and the lumped air + wall + load heat capacity, with a safety cutout above max_temp. Unconnected A / B ports are closed."
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
          },
          "resistance": {
            "value": 1,
            "unit": "Pa/(kg/s)",
            "label": "Local Resistance",
            "min": 0
          },
          "D": {
            "value": 0.05,
            "unit": "m",
            "label": "Diameter",
            "min": 0,
            "exclusiveMin": true
          },
          "roughness": {
            "value": 0.0000015,
            "unit": "m",
            "label": "Surface Roughness",
            "min": 0
          },
          "T": {
            "value": 293.15,
            "unit": "K",
            "label": "Gas Temperature",
            "min": 0,
            "exclusiveMin": true
          },
          "phi": {
            "value": 0.5,
            "unit": "1",
            "label": "Relative Humidity",
            "min": 0,
            "max": 1
          },
          "UA": {
            "value": 5,
            "unit": "W/K",
            "label": "Wall Heat Transfer Conductance",
            "min": 0
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
            "id": "h",
            "pos": "top",
            "label": "H",
            "domain": "Thermal"
          },
          {
            "id": "wd",
            "pos": "bottom",
            "label": "WD",
            "domain": "Physical",
            "direction": "out",
            "quantity": "friction power dissipated",
            "unit": "W"
          }
        ],
        "equation": "p_a - p_b = f*(L/D)*rho*v^2/2 + resistance*mdot,  rho = p_mean/(R*T),  v = mdot/(rho*S),  f = max(64/Re, Haaland(Re, e/D));  Q_H = UA*(T_H - T);  wd = (p_a - p_b)*mdot/rho",
        "description": "Straight circular pipe for moist air: Darcy-Weisbach friction with laminar f = 64/Re and the explicit Haaland turbulent friction factor for the relative roughness e/D, plus an optional lumped local resistance. The mixture density comes from (p_mean, T, phi) by Dalton's law and the ideal gas law, the viscosity from Sutherland's law. The wall at port H exchanges heat Q = UA (T_H - T) with the gas; wd is the friction power dissipated. Condensation is not modelled."
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
            "id": "w",
            "pos": "top",
            "label": "W",
            "domain": "Physical",
            "direction": "out",
            "quantity": "unspecified (block unsupported)",
            "unit": "*"
          },
          {
            "id": "d",
            "pos": "top",
            "label": "D",
            "domain": "Physical",
            "direction": "out",
            "quantity": "unspecified (block unsupported)",
            "unit": "*"
          }
        ],
        "equation": "(not simulated) mdot_removed = efficiency * mdot_liquid  -  see the missing-specification diagnostic",
        "description": "Moisture Separator (MA) is explicitly unsupported: the library defines only the efficiency parameter and the `w` and `d` outputs without meaning or unit, and the Moist Air ports carry no liquid-water fraction to separate. The solver rejects a model that contains it and names the missing specification."
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
          },
          "h0": {
            "value": 5,
            "unit": "W/K",
            "label": "Stationary Heat Transfer",
            "min": 0
          },
          "k": {
            "value": 0.1,
            "unit": "W/K/(rad/s)",
            "label": "Speed-Dependent Heat Transfer",
            "min": 0
          },
          "V0": {
            "value": 0.001,
            "unit": "m^3",
            "label": "Dead Volume",
            "min": 0,
            "exclusiveMin": true
          },
          "T": {
            "value": 293.15,
            "unit": "K",
            "label": "Initial Gas Temperature",
            "min": 0,
            "exclusiveMin": true
          },
          "P0": {
            "value": 101325,
            "unit": "Pa",
            "label": "Initial Pressure",
            "min": 0,
            "exclusiveMin": true
          },
          "p_env": {
            "value": 101325,
            "unit": "Pa",
            "label": "Environment Pressure",
            "min": 0
          },
          "phi": {
            "value": 0.5,
            "unit": "1",
            "label": "Initial Relative Humidity",
            "min": 0,
            "max": 1
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
            "id": "h",
            "pos": "left",
            "label": "H",
            "domain": "Thermal"
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
          },
          {
            "id": "wd",
            "pos": "bottom",
            "label": "WD",
            "domain": "Physical",
            "direction": "out",
            "quantity": "mechanical power delivered by the gas",
            "unit": "W"
          }
        ],
        "equation": "V = V0 + D*theta, theta = integral(w_R - w_C) dt;  dm/dt = mdot_A, m = p*V/(R*T)\nm*c_v dT/dt = mdot_A*R*T - p*dV/dt + Q_H,  Q_H = (h0 + k*|w|)*(T_H - T)\ntau = D*(p - p_env) (delivered at R, reaction at C);  wd = tau*w",
        "description": "Single-acting moist-air vane / piston chamber driven through the rotational ports R and C: the chamber volume follows the shaft angle, V = V0 + D theta (D in m^3/rad). Ideal-gas mass and energy balance of the closed chamber (flow through A enters at the gas temperature), heat exchange with the wall at H through a stationary plus speed-dependent conductance, and the shaft torque D (p - p_env) against the environment pressure. wd is the mechanical power delivered by the gas (W). Humidity ratio is frozen at the initial relative humidity; no condensation."
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
          },
          "h0": {
            "value": 5,
            "unit": "W/K",
            "label": "Stationary Heat Transfer",
            "min": 0
          },
          "k": {
            "value": 0.1,
            "unit": "W/K/(m/s)",
            "label": "Speed-Dependent Heat Transfer",
            "min": 0
          },
          "V0": {
            "value": 0.001,
            "unit": "m^3",
            "label": "Dead Volume",
            "min": 0,
            "exclusiveMin": true
          },
          "T": {
            "value": 293.15,
            "unit": "K",
            "label": "Initial Gas Temperature",
            "min": 0,
            "exclusiveMin": true
          },
          "P0": {
            "value": 101325,
            "unit": "Pa",
            "label": "Initial Pressure",
            "min": 0,
            "exclusiveMin": true
          },
          "p_env": {
            "value": 101325,
            "unit": "Pa",
            "label": "Environment Pressure",
            "min": 0
          },
          "phi": {
            "value": 0.5,
            "unit": "1",
            "label": "Initial Relative Humidity",
            "min": 0,
            "max": 1
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
            "label": "WD",
            "domain": "Physical",
            "direction": "out",
            "quantity": "mechanical power delivered by the gas",
            "unit": "W"
          }
        ],
        "equation": "V = V0 + A*x, x = integral(v_R - v_C) dt;  dm/dt = mdot_A, m = p*V/(R*T)\nm*c_v dT/dt = mdot_A*R*T - p*dV/dt + Q_H,  Q_H = (h0 + k*|v|)*(T_H - T)\nF = A*(p - p_env) (delivered at R, reaction at C);  wd = F*v",
        "description": "Single-acting moist-air piston chamber driven through the translational ports R and C: the chamber volume follows the piston position, V = V0 + A x. Ideal-gas mass and energy balance of the closed chamber (flow through A enters at the gas temperature), heat exchange with the wall at H through a stationary plus speed-dependent conductance, and the piston force A (p - p_env) against the environment pressure. wd is the mechanical power delivered by the gas (W). Humidity ratio is frozen at the initial relative humidity; no condensation."
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
            "id": "m",
            "pos": "top",
            "label": "M",
            "domain": "Physical",
            "direction": "out",
            "quantity": "mass flow rate",
            "unit": "kg/s"
          }
        ],
        "equation": "p_a = p_b,  m = mdot   [kg/s, positive from A to B]",
        "description": "Ideal mass flow rate sensor in series with a Moist Air line: no pressure drop (p_a = p_b), the output is the total mass flow rate of the mixture through it, positive from A to B."
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
            "label": "F",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "t",
            "pos": "right",
            "label": "T",
            "domain": "Physical",
            "direction": "out",
            "quantity": "temperature",
            "unit": "K"
          },
          {
            "id": "p",
            "pos": "right",
            "label": "P",
            "domain": "Physical",
            "direction": "out",
            "quantity": "pressure",
            "unit": "Pa"
          },
          {
            "id": "w",
            "pos": "right",
            "label": "W",
            "domain": "Physical",
            "direction": "out",
            "quantity": "moisture mass fraction",
            "unit": "1"
          }
        ],
        "equation": "(not simulated) [t, p, w] = select(in)  -  see the missing-specification diagnostic",
        "description": "Measurement Selector (MA) is explicitly unsupported: it selects temperature, pressure and humidity from a composite measurement vector whose layout and width are not defined, and no sensor in the library produces such a vector. The solver rejects a model that contains it and names the missing specification."
      },
      {
        "id": "ma_moisture_sensor",
        "name": "Moisture & Trace Gas Sensor (MA)",
        "color": "#8b5cf6",
        "icon": "ma_moisture",
        "category": "Sensors",
        "params": {
          "T": {
            "value": 293.15,
            "unit": "K",
            "label": "Gas Temperature",
            "min": 0,
            "exclusiveMin": true
          },
          "phi": {
            "value": 0.5,
            "unit": "1",
            "label": "Relative Humidity",
            "min": 0,
            "max": 1
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
            "id": "w",
            "pos": "right",
            "label": "W",
            "domain": "Physical",
            "direction": "out",
            "quantity": "moisture mass fraction",
            "unit": "1"
          }
        ],
        "equation": "w = x_v = w_h/(1 + w_h),  w_h = 0.622*p_v/(p - p_v),  p_v = phi*p_sat(T)   [kg water vapour / kg moist air]",
        "description": "Ideal moisture sensor: outputs the water-vapour mass fraction of the moist air at the node pressure p for the block's gas temperature T and relative humidity phi (saturation pressure from the IAPWS-IF97 line, humidity ratio from Dalton's law, ASHRAE ch. 1). The Moist Air ports carry only total pressure and mass flow, so T and phi are parameters of the sensor, not measured. Draws no flow."
      },
      {
        "id": "ma_pt_sensor",
        "name": "Pressure & Temperature Sensor (MA)",
        "color": "#8b5cf6",
        "icon": "ma_pt_sensor",
        "category": "Sensors",
        "params": {
          "T": {
            "value": 293.15,
            "unit": "K",
            "label": "Gas Temperature",
            "min": 0,
            "exclusiveMin": true
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
            "id": "p",
            "pos": "right",
            "label": "Pa",
            "domain": "Physical",
            "direction": "out",
            "quantity": "pressure",
            "unit": "Pa"
          },
          {
            "id": "t",
            "pos": "right",
            "label": "T",
            "domain": "Physical",
            "direction": "out",
            "quantity": "temperature",
            "unit": "K"
          }
        ],
        "equation": "p_out = p_a   [Pa, total pressure of the node],  t_out = T   [K, gas temperature of the isothermal network]",
        "description": "Ideal pressure and temperature sensor: p is the total pressure of the Moist Air node, t the temperature of the network. The Moist Air ports carry only total pressure and mass flow, so the temperature is the sensor's T parameter (set it to the temperature of the chamber or pipe it measures), not a measured node variable. Draws no flow."
      },
      {
        "id": "ma_thermo_sensor",
        "name": "Thermodynamic Properties Sensor (MA)",
        "color": "#8b5cf6",
        "icon": "ma_thermo",
        "category": "Sensors",
        "params": {
          "T": {
            "value": 293.15,
            "unit": "K",
            "label": "Gas Temperature",
            "min": 0,
            "exclusiveMin": true
          },
          "phi": {
            "value": 0.5,
            "unit": "1",
            "label": "Relative Humidity",
            "min": 0,
            "max": 1
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
            "id": "rho",
            "pos": "right",
            "label": "ρ",
            "domain": "Physical",
            "direction": "out",
            "quantity": "density",
            "unit": "kg/m^3"
          }
        ],
        "equation": "rho = (p - p_v)/(R_a*T) + p_v/(R_v*T) = p/(R*T),  p_v = phi*p_sat(T),  R = (R_a + w*R_v)/(1 + w)   [kg/m^3]",
        "description": "Ideal thermodynamic properties sensor: outputs the mixture density of the moist air at the node pressure p for the block's gas temperature T and relative humidity phi (Dalton's law, ideal gas law, saturation pressure from the IAPWS-IF97 line; R_a = 287.058, R_v = 461.52 J/(kg K)). T and phi are parameters of the sensor because the ports carry only total pressure and mass flow. Draws no flow."
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
            "label": "A",
            "domain": "Fluid"
          },
          {
            "id": "s",
            "pos": "top",
            "label": "S",
            "domain": "Physical",
            "direction": "in"
          }
        ],
        "equation": "mdot_added = rate * S   [kg/s of water vapour delivered INTO the node; S = 1 when the S input is unwired]",
        "description": "Ideal moisture source: delivers water vapour into the Moist Air node at `rate` kg/s, scaled by the S input signal when wired. A single-ended source: it needs a network that can take the flow (a chamber or a path to a pressure datum). The ports carry total mass flow, so the added vapour is counted in the total flow."
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
            "domain": "Physical",
            "direction": "in"
          }
        ],
        "equation": "mdot = rate * S   [kg/s from A through the source to B; S = 1 when the S input is unwired]",
        "description": "Ideal mass flow rate source for the moist-air mixture (Simscape Mass Flow Rate Source): the flow rate is imposed whatever the pressure difference; positive flow runs from A through the block to B. It needs a path for the flow on both sides (a chamber or a connection to a pressure datum)."
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
            "domain": "Physical",
            "direction": "in"
          }
        ],
        "equation": "p_b - p_a = P * S   [Pa; S = 1 when the S input is unwired]",
        "description": "Ideal pressure difference source (fan / blower head): holds p_B - p_A at P times the S input signal (P when S is unwired) and passes whatever mass flow the network demands. It fixes only a difference, so its network needs a pressure datum (a chamber, a reference or an absolute source)."
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
            "label": "Std Pressure",
            "min": 0,
            "exclusiveMin": true
          },
          "T_std": {
            "value": 293.15,
            "unit": "K",
            "label": "Std Temperature",
            "min": 0,
            "exclusiveMin": true
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
            "label": "U",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "Y",
            "domain": "Physical",
            "direction": "out",
            "quantity": "delayed signal",
            "unit": "*"
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
            "label": "+",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "u2",
            "pos": "left",
            "label": "+",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "Y",
            "domain": "Physical",
            "direction": "out",
            "quantity": "sum",
            "unit": "*"
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
            "label": "+",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "u2",
            "pos": "left",
            "label": "-",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "Y",
            "domain": "Physical",
            "direction": "out",
            "quantity": "difference",
            "unit": "*"
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
            "label": "U",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "Y",
            "domain": "Physical",
            "direction": "out",
            "quantity": "scaled signal",
            "unit": "*"
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
            "label": "*",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "u2",
            "pos": "left",
            "label": "*",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "Y",
            "domain": "Physical",
            "direction": "out",
            "quantity": "product",
            "unit": "*"
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
            "label": "num",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "u2",
            "pos": "left",
            "label": "den",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "Y",
            "domain": "Physical",
            "direction": "out",
            "quantity": "quotient",
            "unit": "*"
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
            "label": "U",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "Y",
            "domain": "Physical",
            "direction": "out",
            "quantity": "function value",
            "unit": "*"
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
            "label": "U",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "Σ",
            "domain": "Physical",
            "direction": "out",
            "quantity": "sum",
            "unit": "*"
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
            "label": "U",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "Y",
            "domain": "Physical",
            "direction": "out",
            "quantity": "time integral",
            "unit": "*"
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
            "label": "Time Constant",
            "min": 0,
            "exclusiveMin": true
          }
        },
        "ports": [
          {
            "id": "u",
            "pos": "left",
            "label": "U",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "Y",
            "domain": "Physical",
            "direction": "out",
            "quantity": "filtered signal",
            "unit": "*"
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
        "params": {
          "table_x": {
            "value": "[0 1 2]",
            "unit": "",
            "label": "Breakpoints (x)"
          },
          "table_y": {
            "value": "[0 1 4]",
            "unit": "",
            "label": "Table Values (y)"
          }
        },
        "ports": [
          {
            "id": "u",
            "pos": "left",
            "label": "U",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "Y",
            "domain": "Physical",
            "direction": "out",
            "quantity": "table value",
            "unit": "*"
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
            "label": "U1",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "u2",
            "pos": "left",
            "label": "U2",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "Y",
            "domain": "Physical",
            "direction": "out",
            "quantity": "table value",
            "unit": "*"
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
            "label": "U",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "Y",
            "domain": "Physical",
            "direction": "out",
            "quantity": "absolute value",
            "unit": "*"
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
            "label": "U",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "Y",
            "domain": "Physical",
            "direction": "out",
            "quantity": "limited signal",
            "unit": "*"
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
          "upper": {
            "value": 0.5,
            "unit": "1",
            "label": "Dead Zone Upper Bound"
          },
          "lower": {
            "value": -0.5,
            "unit": "1",
            "label": "Dead Zone Lower Bound"
          }
        },
        "ports": [
          {
            "id": "u",
            "pos": "left",
            "label": "U",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "Y",
            "domain": "Physical",
            "direction": "out",
            "quantity": "dead-zone output",
            "unit": "*"
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
            "label": "1",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "ctrl",
            "pos": "left",
            "label": "C",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "u2",
            "pos": "left",
            "label": "2",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "Y",
            "domain": "Physical",
            "direction": "out",
            "quantity": "selected signal",
            "unit": "*"
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
            "label": "1",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "u2",
            "pos": "left",
            "label": "2",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "MIN",
            "domain": "Physical",
            "direction": "out",
            "quantity": "minimum",
            "unit": "*"
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
            "label": "1",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "u2",
            "pos": "left",
            "label": "2",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "MAX",
            "domain": "Physical",
            "direction": "out",
            "quantity": "maximum",
            "unit": "*"
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
            "label": "U",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "RMS",
            "domain": "Physical",
            "direction": "out",
            "quantity": "rms value",
            "unit": "*"
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
            "label": "Hall",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "dir",
            "pos": "left",
            "label": "Direction",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "abc",
            "pos": "right",
            "label": "abc",
            "domain": "Physical",
            "direction": "out",
            "quantity": "phase commutation pattern",
            "unit": "1"
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
            "label": "IsRef",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "is",
            "pos": "left",
            "label": "Is",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "reset",
            "pos": "left",
            "label": "Reset",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "hall",
            "pos": "left",
            "label": "Hall",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "dir",
            "pos": "left",
            "label": "Direction",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "vabc",
            "pos": "right",
            "label": "vabcRef",
            "domain": "Physical",
            "direction": "out",
            "quantity": "phase voltage reference",
            "unit": "V"
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
            "label": "IsRef",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "is",
            "pos": "left",
            "label": "Is",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "reset",
            "pos": "left",
            "label": "Reset",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "hall",
            "pos": "left",
            "label": "Hall",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "dir",
            "pos": "left",
            "label": "Direction",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "g",
            "pos": "right",
            "label": "G",
            "domain": "Physical",
            "direction": "out",
            "quantity": "gate signal",
            "unit": "1"
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
            "label": "vRef",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "v",
            "pos": "left",
            "label": "v",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "ff",
            "pos": "left",
            "label": "FF",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "reset",
            "pos": "left",
            "label": "Reset",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "ctrl",
            "pos": "right",
            "label": "Control",
            "domain": "Physical",
            "direction": "out",
            "quantity": "duty cycle",
            "unit": "1"
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
            "label": "VdcRef (V)",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "q_ref",
            "pos": "left",
            "label": "QRef (pu)",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "vdc_sens",
            "pos": "left",
            "label": "VdcSens (V)",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "vabc_sens",
            "pos": "left",
            "label": "VabcSens (pu)",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "iabc_sens",
            "pos": "left",
            "label": "IabcSens (pu)",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "vabc_ref",
            "pos": "right",
            "label": "VabcRef (pu)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "modulation reference",
            "unit": "1"
          },
          {
            "id": "vis",
            "pos": "right",
            "label": "Visualization",
            "domain": "Physical",
            "direction": "out",
            "quantity": "visualization signal",
            "unit": "*"
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
            "label": "VRef",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "f_ref",
            "pos": "left",
            "label": "fRef",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "vabc",
            "pos": "left",
            "label": "vabc",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "vcyc",
            "pos": "left",
            "label": "Vcyc",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "icyc",
            "pos": "left",
            "label": "Icyc",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "p",
            "pos": "right",
            "label": "P",
            "domain": "Physical",
            "direction": "out",
            "quantity": "gate pulses",
            "unit": "1"
          },
          {
            "id": "vis",
            "pos": "right",
            "label": "Visualization",
            "domain": "Physical",
            "direction": "out",
            "quantity": "visualization signal",
            "unit": "*"
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
            "label": "Saturation",
            "min": 0,
            "exclusiveMin": true
          }
        },
        "ports": [
          {
            "id": "e",
            "pos": "left",
            "label": "e",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "reset",
            "pos": "left",
            "label": "Reset",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "u",
            "pos": "right",
            "label": "u",
            "domain": "Physical",
            "direction": "out",
            "quantity": "controller output",
            "unit": "*"
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
            "label": "Filter Coeff",
            "min": 0,
            "exclusiveMin": true
          },
          "limit": {
            "value": 240,
            "unit": "",
            "label": "Saturation",
            "min": 0,
            "exclusiveMin": true
          }
        },
        "ports": [
          {
            "id": "e",
            "pos": "left",
            "label": "e",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "reset",
            "pos": "left",
            "label": "Reset",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "u",
            "pos": "right",
            "label": "u",
            "domain": "Physical",
            "direction": "out",
            "quantity": "controller output",
            "unit": "*"
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
            "label": "Cutoff Freq",
            "min": 0,
            "exclusiveMin": true
          }
        },
        "ports": [
          {
            "id": "u",
            "pos": "left",
            "label": "u",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "y",
            "domain": "Physical",
            "direction": "out",
            "quantity": "filtered signal",
            "unit": "*"
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
            "label": "u",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "reset",
            "pos": "left",
            "label": "Reset",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "y",
            "domain": "Physical",
            "direction": "out",
            "quantity": "time integral",
            "unit": "*"
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
            "label": "u",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "Mean",
            "domain": "Physical",
            "direction": "out",
            "quantity": "moving average",
            "unit": "*"
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
            "label": "Set",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "r",
            "pos": "left",
            "label": "Reset",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "q",
            "pos": "right",
            "label": "Q",
            "domain": "Physical",
            "direction": "out",
            "quantity": "logic state Q",
            "unit": "1"
          },
          {
            "id": "nq",
            "pos": "right",
            "label": "!Q",
            "domain": "Physical",
            "direction": "out",
            "quantity": "logic state not-Q",
            "unit": "1"
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
            "label": "u",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "s",
            "pos": "left",
            "label": "S",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "y",
            "domain": "Physical",
            "direction": "out",
            "quantity": "held signal",
            "unit": "*"
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
            "label": "Dead Time",
            "min": 0,
            "exclusiveMin": true
          }
        },
        "ports": [
          {
            "id": "r",
            "pos": "left",
            "label": "r",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "y",
            "pos": "left",
            "label": "y",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "u",
            "pos": "right",
            "label": "u",
            "domain": "Physical",
            "direction": "out",
            "quantity": "controller output",
            "unit": "*"
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
          "Vpk": {
            "value": 325,
            "unit": "V",
            "label": "Peak Phase Voltage"
          },
          "f": {
            "value": 50,
            "unit": "Hz",
            "label": "Frequency"
          }
        },
        "ports": [
          {
            "id": "m",
            "pos": "left",
            "label": "m",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "ang",
            "pos": "left",
            "label": "ang",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "abc",
            "width": 3,
            "channelNames": ["a", "b", "c"],
            "pos": "right",
            "label": "abc",
            "domain": "Physical",
            "direction": "out",
            "quantity": "three-phase sine voltage",
            "unit": "V"
          },
          {
            "id": "wt",
            "pos": "right",
            "label": "wt",
            "domain": "Physical",
            "direction": "out",
            "quantity": "electrical angle",
            "unit": "rad"
          }
        ],
        "equation": "a = Vpk*sin(wt)\nb = Vpk*sin(wt - 2*pi/3)\nc = Vpk*sin(wt + 2*pi/3)\nwt = 2*pi*f*t",
        "description": "Balanced positive-sequence three-phase sine set on the width-3 output abc, plus the instantaneous angle wt."
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
            "label": "Damping",
            "min": 0
          },
          "wn": {
            "value": 100,
            "unit": "rad/s",
            "label": "Nat Freq",
            "min": 0,
            "exclusiveMin": true
          }
        },
        "ports": [
          {
            "id": "u",
            "pos": "left",
            "label": "u",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "y",
            "domain": "Physical",
            "direction": "out",
            "quantity": "filtered signal",
            "unit": "*"
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
            "label": "r",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "x",
            "pos": "left",
            "label": "x",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "u",
            "pos": "right",
            "label": "u",
            "domain": "Physical",
            "direction": "out",
            "quantity": "controller output",
            "unit": "*"
          },
          {
            "id": "reset",
            "pos": "left",
            "label": "Reset",
            "domain": "Physical",
            "direction": "in"
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
          },
          "boundary_layer": {
            "value": 0.05,
            "unit": "1",
            "label": "Boundary Layer Thickness",
            "min": 0,
            "exclusiveMin": true
          }
        },
        "ports": [
          {
            "id": "r",
            "pos": "left",
            "label": "r",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "y",
            "pos": "left",
            "label": "y",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "u",
            "pos": "right",
            "label": "u",
            "domain": "Physical",
            "direction": "out",
            "quantity": "controller output",
            "unit": "*"
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
            "label": "Sample",
            "min": 0,
            "exclusiveMin": true
          }
        },
        "ports": [
          {
            "id": "y",
            "pos": "right",
            "label": "y",
            "domain": "Physical",
            "direction": "out",
            "quantity": "staircase value",
            "unit": "*"
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
            "label": "Time Const",
            "min": 0,
            "exclusiveMin": true
          }
        },
        "ports": [
          {
            "id": "u",
            "pos": "left",
            "label": "u",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "y",
            "domain": "Physical",
            "direction": "out",
            "quantity": "washout output",
            "unit": "*"
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
            "label": "iRef",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "i",
            "pos": "left",
            "label": "i",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "v_max",
            "pos": "left",
            "label": "vMax",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "reset",
            "pos": "left",
            "label": "Reset",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "v_ref",
            "pos": "right",
            "label": "vRef",
            "domain": "Physical",
            "direction": "out",
            "quantity": "voltage reference",
            "unit": "V"
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
            "label": "vRef",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "v",
            "pos": "left",
            "label": "v",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "reset",
            "pos": "left",
            "label": "Reset",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "ctrl",
            "pos": "right",
            "label": "Control",
            "domain": "Physical",
            "direction": "out",
            "quantity": "duty cycle",
            "unit": "1"
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
            "label": "iabc*",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "iabc",
            "pos": "left",
            "label": "iabc",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "s",
            "pos": "right",
            "label": "S",
            "domain": "Physical",
            "direction": "out",
            "quantity": "switching state",
            "unit": "1"
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
            "label": "wRef",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "w_mech",
            "pos": "left",
            "label": "wMechanical",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "tq_sat",
            "pos": "left",
            "label": "TqRefSat",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "reset",
            "pos": "left",
            "label": "Reset",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "tq_unsat",
            "pos": "right",
            "label": "TqRefUnsat",
            "domain": "Physical",
            "direction": "out",
            "quantity": "torque reference",
            "unit": "N*m"
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
            "label": "fRef",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "vabc",
            "pos": "right",
            "label": "Vabc",
            "domain": "Physical",
            "direction": "out",
            "quantity": "phase voltage reference",
            "unit": "V"
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
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "wr_ref",
            "pos": "left",
            "label": "wrRef",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "iabc",
            "pos": "left",
            "label": "iabc",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "wr",
            "pos": "left",
            "label": "wr",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "vdc",
            "pos": "left",
            "label": "Vdc",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "g",
            "pos": "right",
            "label": "G",
            "domain": "Physical",
            "direction": "out",
            "quantity": "gate signal",
            "unit": "1"
          },
          {
            "id": "vabc",
            "pos": "right",
            "label": "Vabc",
            "domain": "Physical",
            "direction": "out",
            "quantity": "phase voltage reference",
            "unit": "V"
          },
          {
            "id": "vis",
            "pos": "right",
            "label": "Visualization",
            "domain": "Physical",
            "direction": "out",
            "quantity": "visualization signal",
            "unit": "*"
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
            "label": "FluxRef",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "tq_ref",
            "pos": "left",
            "label": "TqRef",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "vabc",
            "pos": "left",
            "label": "vabc",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "iabc",
            "pos": "left",
            "label": "iabc",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "g",
            "pos": "right",
            "label": "G",
            "domain": "Physical",
            "direction": "out",
            "quantity": "gate signal",
            "unit": "1"
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
            "label": "idqRef",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "idq",
            "pos": "left",
            "label": "idq",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "vdq_ff",
            "pos": "left",
            "label": "vdqFF",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "v_max",
            "pos": "left",
            "label": "VphMax",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "reset",
            "pos": "left",
            "label": "Reset",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "vdq_ref",
            "pos": "right",
            "label": "vdqRef",
            "domain": "Physical",
            "direction": "out",
            "quantity": "dq voltage reference",
            "unit": "V"
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
            "width": 3,
            "channelNames": ["a", "b", "c"],
            "pos": "left",
            "label": "abc",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "ab0",
            "width": 3,
            "channelNames": ["alpha", "beta", "0"],
            "pos": "right",
            "label": "ab0",
            "domain": "Physical",
            "direction": "out",
            "quantity": "alpha-beta-zero components",
            "unit": "*"
          }
        ],
        "equation": "alpha = (2/3)*(a - b/2 - c/2)\nbeta = (b - c)/√3\nzero = (a + b + c)/3",
        "description": "Clarke transform: abc (width 3) to alpha-beta-zero (width 3). Convention Peak Amp Preserved (above) or Power Preserved (sqrt(2/3) scaling, orthogonal)."
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
            "width": 3,
            "channelNames": ["alpha", "beta", "0"],
            "pos": "left",
            "label": "ab0",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "abc",
            "width": 3,
            "channelNames": ["a", "b", "c"],
            "pos": "right",
            "label": "abc",
            "domain": "Physical",
            "direction": "out",
            "quantity": "abc components",
            "unit": "*"
          }
        ],
        "equation": "a = alpha + zero\nb = -alpha/2 + (√3/2)*beta + zero\nc = -alpha/2 - (√3/2)*beta + zero",
        "description": "Inverse Clarke transform: alpha-beta-zero (width 3) to abc (width 3), same convention as the forward block."
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
            "width": 3,
            "channelNames": ["a", "b", "c"],
            "pos": "left",
            "label": "abc",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "theta",
            "pos": "left",
            "label": "theta",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "dq0",
            "width": 3,
            "channelNames": ["d", "q", "0"],
            "pos": "right",
            "label": "dq0",
            "domain": "Physical",
            "direction": "out",
            "quantity": "dq0 components",
            "unit": "*"
          }
        ],
        "equation": "d = alpha*cos(θ) + beta*sin(θ)\nq = -alpha*sin(θ) + beta*cos(θ)\nzero = (a + b + c)/3\n(90 deg behind A: θ -> θ - π/2, i.e. d = alpha*sin(θ) - beta*cos(θ), q = alpha*cos(θ) + beta*sin(θ))",
        "description": "Park transform: abc (width 3) and angle theta to the rotating dq0 frame (width 3), alpha-beta from the amplitude-invariant Clarke transform."
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
            "width": 3,
            "channelNames": ["d", "q", "0"],
            "pos": "left",
            "label": "dq0",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "theta",
            "pos": "left",
            "label": "theta",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "abc",
            "width": 3,
            "channelNames": ["a", "b", "c"],
            "pos": "right",
            "label": "abc",
            "domain": "Physical",
            "direction": "out",
            "quantity": "abc components",
            "unit": "*"
          }
        ],
        "equation": "alpha = d*cos(θ) - q*sin(θ)\nbeta = d*sin(θ) + q*cos(θ)\n(90 deg behind A: alpha = d*sin(θ) + q*cos(θ), beta = -d*cos(θ) + q*sin(θ))\na = alpha + zero, b = -alpha/2 + (√3/2)*beta + zero, c = -alpha/2 - (√3/2)*beta + zero",
        "description": "Inverse Park transform: dq0 (width 3) and angle theta back to the stationary abc frame (width 3)."
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
            "label": "Base Freq",
            "min": 0,
            "exclusiveMin": true
          }
        },
        "ports": [
          {
            "id": "abc",
            "width": 3,
            "channelNames": ["a", "b", "c"],
            "pos": "left",
            "label": "abc",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "seq",
            "width": 3,
            "channelNames": ["pos", "neg", "zero"],
            "pos": "right",
            "label": "+-0",
            "domain": "Physical",
            "direction": "out",
            "quantity": "sequence components",
            "unit": "*"
          }
        ],
        "equation": "V1 = (A + a*B + a^2*C)/3\nV2 = (A + a^2*B + a*C)/3\nV0 = (A + B + C)/3\na = exp(j*2*pi/3), A = x - j*(dx/dt)/w, w = 2*pi*freq\nseq = [|V1|, |V2|, |V0|]",
        "description": "Fortescue symmetrical components of the abc phasors at the base frequency: the width-3 output seq carries the peak magnitudes of the positive, negative and zero sequence."
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
            "label": "Base Freq",
            "min": 0,
            "exclusiveMin": true
          }
        },
        "ports": [
          {
            "id": "seq",
            "width": 3,
            "channelNames": ["pos", "neg", "zero"],
            "pos": "left",
            "label": "+-0",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "abc",
            "width": 3,
            "channelNames": ["a", "b", "c"],
            "pos": "right",
            "label": "abc",
            "domain": "Physical",
            "direction": "out",
            "quantity": "abc components",
            "unit": "*"
          }
        ],
        "equation": "a = (V1 + V2 + V0)*cos(wt)\nb = V1*cos(wt - 2*pi/3) + V2*cos(wt + 2*pi/3) + V0*cos(wt)\nc = V1*cos(wt + 2*pi/3) + V2*cos(wt - 2*pi/3) + V0*cos(wt)\nwt = 2*pi*freq*t",
        "description": "Inverse Fortescue synthesis: positive, negative and zero sequence magnitudes (width 3) to the abc time signals at the base frequency, phase a as cos(wt) reference."
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
          },
          "Lr": {
            "value": 0.06,
            "unit": "H",
            "label": "Rotor Inductance"
          },
          "Rr": {
            "value": 0.08,
            "unit": "Ohm",
            "label": "Rotor Resistance"
          }
        },
        "ports": [
          {
            "id": "iabc",
            "pos": "left",
            "label": "iabc",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "wr",
            "pos": "left",
            "label": "wr",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "idqsef",
            "pos": "right",
            "label": "idqseF",
            "domain": "Physical",
            "direction": "out",
            "quantity": "stator current in field frame",
            "unit": "A"
          },
          {
            "id": "imr",
            "pos": "right",
            "label": "imr",
            "domain": "Physical",
            "direction": "out",
            "quantity": "rotor magnetizing current",
            "unit": "A"
          },
          {
            "id": "theta",
            "pos": "right",
            "label": "theta",
            "domain": "Physical",
            "direction": "out",
            "quantity": "rotor flux angle",
            "unit": "rad"
          },
          {
            "id": "we",
            "pos": "right",
            "label": "we",
            "domain": "Physical",
            "direction": "out",
            "quantity": "synchronous speed",
            "unit": "rad/s"
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
            "label": "u",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "y",
            "pos": "left",
            "label": "y",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "xhat",
            "pos": "right",
            "label": "xhat",
            "domain": "Physical",
            "direction": "out",
            "quantity": "state estimate",
            "unit": "*"
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
            "label": "A",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "b",
            "pos": "left",
            "label": "B",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "z",
            "pos": "left",
            "label": "Z",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "vel",
            "pos": "right",
            "label": "Velocity",
            "domain": "Physical",
            "direction": "out",
            "quantity": "angular velocity",
            "unit": "rad/s"
          },
          {
            "id": "pos",
            "pos": "right",
            "label": "Position",
            "domain": "Physical",
            "direction": "out",
            "quantity": "angular position",
            "unit": "rad"
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
            "label": "Vp",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "vx",
            "pos": "left",
            "label": "Vx",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "vy",
            "pos": "left",
            "label": "Vy",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "vel",
            "pos": "right",
            "label": "Velocity",
            "domain": "Physical",
            "direction": "out",
            "quantity": "angular velocity",
            "unit": "rad/s"
          },
          {
            "id": "ang",
            "pos": "right",
            "label": "Angle",
            "domain": "Physical",
            "direction": "out",
            "quantity": "angle",
            "unit": "rad"
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
            "label": "idqRef",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "idq",
            "pos": "left",
            "label": "idq",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "vdq_ff",
            "pos": "left",
            "label": "vdqFF",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "v_max",
            "pos": "left",
            "label": "VphMax",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "reset",
            "pos": "left",
            "label": "Reset",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "vdq_ref",
            "pos": "right",
            "label": "vdqRef",
            "domain": "Physical",
            "direction": "out",
            "quantity": "dq voltage reference",
            "unit": "V"
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
            "label": "TqRef",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "w_mech",
            "pos": "left",
            "label": "wMechanical",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "vdc",
            "pos": "left",
            "label": "Vdc",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "idq_ref",
            "pos": "right",
            "label": "idqRef",
            "domain": "Physical",
            "direction": "out",
            "quantity": "dq current reference",
            "unit": "A"
          },
          {
            "id": "tq_ref_sat",
            "pos": "right",
            "label": "TqRefSat",
            "domain": "Physical",
            "direction": "out",
            "quantity": "limited torque reference",
            "unit": "N*m"
          },
          {
            "id": "tq_lim",
            "pos": "right",
            "label": "TqLim",
            "domain": "Physical",
            "direction": "out",
            "quantity": "torque limit",
            "unit": "N*m"
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
            "label": "Reference",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "iabc_s",
            "pos": "left",
            "label": "iabcSens",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "w_s",
            "pos": "left",
            "label": "wSens",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "th_s",
            "pos": "left",
            "label": "thSens",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "vdc_s",
            "pos": "left",
            "label": "vdcSens",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "g",
            "pos": "right",
            "label": "G",
            "domain": "Physical",
            "direction": "out",
            "quantity": "gate signal",
            "unit": "1"
          },
          {
            "id": "vis",
            "pos": "right",
            "label": "Visualization",
            "domain": "Physical",
            "direction": "out",
            "quantity": "visualization signal",
            "unit": "*"
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
            "label": "idqRef",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "vdq",
            "pos": "left",
            "label": "vdq",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "v_max",
            "pos": "left",
            "label": "VphMax",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "idq_ref_fw",
            "pos": "right",
            "label": "idqRefFW",
            "domain": "Physical",
            "direction": "out",
            "quantity": "field-weakened dq current reference",
            "unit": "A"
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
            "label": "idq",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "tq_est",
            "pos": "right",
            "label": "TqEst",
            "domain": "Physical",
            "direction": "out",
            "quantity": "estimated torque",
            "unit": "N*m"
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
          "model_mode": {
            "value": "averaged",
            "unit": "",
            "label": "Model Mode"
          },
          "control_mode": {
            "value": "three_phase_modulation",
            "unit": "",
            "label": "Control Mode"
          },
          "output_frequency_hz": {
            "value": 50,
            "unit": "Hz",
            "label": "Output Frequency",
            "min": 0
          },
          "f_sw": {
            "value": 5000,
            "unit": "Hz",
            "label": "Switch Freq",
            "min": 0,
            "exclusiveMin": true
          },
          "output_resistance_ohm": {
            "value": 0.001,
            "unit": "ohm",
            "label": "Output Resistance",
            "min": 0
          },
          "modulation_index": {
            "value": 0.8,
            "unit": "",
            "label": "Modulation Index M (V/f generator)",
            "min": 0,
            "max": 1
          }
        },
        "ports": [
          {
            "id": "vabc",
            "width": 3,
            "channelNames": ["a", "b", "c"],
            "pos": "left",
            "label": "m_abc",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "amp",
            "pos": "left",
            "label": "M",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "ma",
            "pos": "left",
            "label": "d_a",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "mb",
            "pos": "left",
            "label": "d_b",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "mc",
            "pos": "left",
            "label": "d_c",
            "domain": "Physical",
            "direction": "in"
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
            "id": "abc",
            "composite": "three_phase",
            "pos": "right",
            "label": "ABC",
            "domain": "Electrical"
          }
        ],
        "equation": "v_k − v_n = d_k·Vdc − R_out·i_k,out  [V],  k = a, b, c  (Vdc = v_DC+ − v_DC−)\ni_dc = Σ d_k·i_k,out  [A]  (P_dc = Σ v_k·i_k,out + R_out·Σ i_k,out²)\nd_k = (1 + m_k)/2,  m_k = M·sin(2π·f_out·t − k·2π/3)  or the vabc / duty inputs  → fundamental pole amplitude = M·Vdc/2",
        "description": "Two-level three-phase voltage-source inverter. Model mode 'averaged' (default) is the Simscape Average-Value Inverter: continuous duty d_k, no switching ripple. Model mode 'switching' is the ideal-switch model: each leg switches at f_sw when the duty reference crosses a triangular carrier (anti-parallel diodes, no dead time), and the crossing instants are located by the solver's zero-crossing events. AC terminals are the composite three-phase port ABC (connect it to a machine ABC port directly, or through a Phase Splitter to scalar phases); DC+ / DC− are the DC link. References: input vabc = (m_a, m_b, m_c) in [−1, 1] (control mode three_phase_modulation; legacy scalar duties d_a, d_b, d_c in [0, 1] when vabc is unwired, an unwired duty means the lower switch is on), or, in control mode sinusoidal_modulation, an internal balanced V/f generator at the output frequency with amplitude M (input M, or the Modulation Index parameter). Linear range M ≤ 1: line-to-line fundamental rms = (√3/(2√2))·M·Vdc; over-modulation saturates at the rails. The AC side is a voltage source behind R_out, so a floating (wye, open star point) load sees no zero-sequence current."
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
            "label": "Switch Freq",
            "min": 0,
            "exclusiveMin": true
          },
          "neutral_balance_gain": {
            "value": 0.1,
            "unit": "1/V",
            "label": "Neutral Balance Gain"
          }
        },
        "ports": [
          {
            "id": "vabc",
            "width": 3,
            "channelNames": ["a", "b", "c"],
            "pos": "left",
            "label": "m_abc",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "vdc",
            "pos": "left",
            "label": "Vdc",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "vneut",
            "pos": "left",
            "label": "vNeutral",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "ga",
            "pos": "right",
            "label": "Gate A",
            "domain": "Physical",
            "direction": "out",
            "quantity": "gate signal A",
            "unit": "1"
          },
          {
            "id": "gb",
            "pos": "right",
            "label": "Gate B",
            "domain": "Physical",
            "direction": "out",
            "quantity": "gate signal B",
            "unit": "1"
          },
          {
            "id": "gc",
            "pos": "right",
            "label": "Gate C",
            "domain": "Physical",
            "direction": "out",
            "quantity": "gate signal C",
            "unit": "1"
          },
          {
            "id": "ma",
            "pos": "right",
            "label": "Mod A",
            "domain": "Physical",
            "direction": "out",
            "quantity": "modulation index A",
            "unit": "1"
          },
          {
            "id": "mb",
            "pos": "right",
            "label": "Mod B",
            "domain": "Physical",
            "direction": "out",
            "quantity": "modulation index B",
            "unit": "1"
          },
          {
            "id": "mc",
            "pos": "right",
            "label": "Mod C",
            "domain": "Physical",
            "direction": "out",
            "quantity": "modulation index C",
            "unit": "1"
          }
        ],
        "equation": "r_k = clamp(m_k + Δ_neut, −1, 1),  Δ_neut = clamp(k_neut·v_neut/max(|v_dc|, 1), −0.15, 0.15)\nc_u = tri(f_sw·t) ∈ [0, 1],  c_l = c_u − 1\ng_k = +1 if r_k ≥ c_u,  −1 if r_k ≤ c_l,  0 otherwise  → v_k = g_k·Vdc/2 ∈ {−Vdc/2, 0, +Vdc/2}\n⟨g_k⟩ over a carrier period = r_k  (fundamental phase voltage = m·Vdc/2)",
        "description": "Three-level (neutral-point-clamped) phase-disposition PWM generator (Simscape PWM Generator (Three-Level)). Input m_abc = (m_a, m_b, m_c) is the reference vector in [−1, 1] (unit = Vdc/2); two in-phase triangular carriers at f_sw (upper in [0, 1], lower in [−1, 0]) turn it into the level commands ga, gb, gc ∈ {−1, 0, +1} (+Vdc/2 / neutral / −Vdc/2 at the phase output of an NPC leg); ma, mb, mc echo the clamped references. The carrier average of the level equals the reference for every |m| ≤ 1, so the fundamental phase voltage is m·Vdc/2 and the line-to-line rms fundamental (√3/(2√2))·m·Vdc. vdc and vneut (DC-link total and neutral-point unbalance) add a bounded zero-sequence offset Δ_neut that steers the neutral point. This is a signal generator (it computes gate levels, not a power stage): connect the levels to switch / IGBT commands of an NPC leg."
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
            "label": "Switch Freq",
            "min": 0,
            "exclusiveMin": true
          },
          "vdc_ref": {
            "value": 800,
            "unit": "V",
            "label": "Vdc Ref",
            "min": 0
          },
          "kp_v": {
            "value": 0.1,
            "unit": "A/V",
            "label": "Voltage Prop Gain"
          },
          "neutral_balance_gain": {
            "value": 0.1,
            "unit": "1/V",
            "label": "Neutral Balance Gain"
          }
        },
        "ports": [
          {
            "id": "va",
            "pos": "left",
            "label": "Va",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "vb",
            "pos": "left",
            "label": "Vb",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "vc",
            "pos": "left",
            "label": "Vc",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "ia",
            "pos": "left",
            "label": "Ia",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "ib",
            "pos": "left",
            "label": "Ib",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "ic",
            "pos": "left",
            "label": "Ic",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "vdc",
            "pos": "left",
            "label": "Vdc",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "vneut",
            "pos": "left",
            "label": "vNeutral",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "ga",
            "pos": "right",
            "label": "Gate A",
            "domain": "Physical",
            "direction": "out",
            "quantity": "gate signal A",
            "unit": "1"
          },
          {
            "id": "gb",
            "pos": "right",
            "label": "Gate B",
            "domain": "Physical",
            "direction": "out",
            "quantity": "gate signal B",
            "unit": "1"
          },
          {
            "id": "gc",
            "pos": "right",
            "label": "Gate C",
            "domain": "Physical",
            "direction": "out",
            "quantity": "gate signal C",
            "unit": "1"
          },
          {
            "id": "ma",
            "pos": "right",
            "label": "Mod A",
            "domain": "Physical",
            "direction": "out",
            "quantity": "modulation index A",
            "unit": "1"
          },
          {
            "id": "mb",
            "pos": "right",
            "label": "Mod B",
            "domain": "Physical",
            "direction": "out",
            "quantity": "modulation index B",
            "unit": "1"
          },
          {
            "id": "mc",
            "pos": "right",
            "label": "Mod C",
            "domain": "Physical",
            "direction": "out",
            "quantity": "modulation index C",
            "unit": "1"
          }
        ],
        "equation": "I* = max(0, kp_v·(vdc_ref − vdc))  [A]\nΔ_neut = clamp(k_neut·v_neut/max(|vdc|, 1), −0.2, 0.2)\nm_x = clamp(2·v_x/max(|vdc|, 1) + 0.05·(I*·v_x/max(√(v_a²+v_b²+v_c²), 1) − i_x) + Δ_neut, −1, 1)\ng_x = 1 if C_tri(f_sw·t) < 1 − |m_x| else 0   (switch on = phase clamped to the neutral)",
        "description": "Carrier-based PWM generator of a three-phase three-level Vienna rectifier (spec docs/superpowers/specs/2026-09-30-vienna-rectifier-pwm-design.md). The phase-switch duty is 1 − |m_x|, so with the diode legs the average pole voltage is sign(i_x)·|m_x|·Vdc/2 = v_x at unity power factor (m_x = 2·v_x/Vdc is the feed-forward term). An outer proportional DC-link loop (kp_v, vdc_ref) scales the in-phase current reference I*, a fixed 0.05 V/A current-error gain corrects the modulation, and vneut adds a bounded zero-sequence term that balances the neutral point. Outputs ga, gb, gc ∈ {0, 1} are the switch gates, ma, mb, mc the modulation indices. Signal generator only (no power stage): wire the gates to the bidirectional phase switches of a Vienna bridge built from diodes and IGBT / switch blocks. The scalar ports are kept as in the spec (one phase per port)."
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
            "label": "Freq",
            "min": 0
          },
          "pulse_width_deg": {
            "value": 20,
            "unit": "deg",
            "label": "Pulse Width",
            "min": 0,
            "exclusiveMin": true,
            "max": 60
          }
        },
        "ports": [
          {
            "id": "theta",
            "pos": "left",
            "label": "theta",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "alpha",
            "pos": "left",
            "label": "alpha",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "g1",
            "pos": "right",
            "label": "G1",
            "domain": "Physical",
            "direction": "out",
            "quantity": "gate signal 1",
            "unit": "1"
          },
          {
            "id": "g2",
            "pos": "right",
            "label": "G2",
            "domain": "Physical",
            "direction": "out",
            "quantity": "gate signal 2",
            "unit": "1"
          },
          {
            "id": "g3",
            "pos": "right",
            "label": "G3",
            "domain": "Physical",
            "direction": "out",
            "quantity": "gate signal 3",
            "unit": "1"
          },
          {
            "id": "g4",
            "pos": "right",
            "label": "G4",
            "domain": "Physical",
            "direction": "out",
            "quantity": "gate signal 4",
            "unit": "1"
          },
          {
            "id": "g5",
            "pos": "right",
            "label": "G5",
            "domain": "Physical",
            "direction": "out",
            "quantity": "gate signal 5",
            "unit": "1"
          },
          {
            "id": "g6",
            "pos": "right",
            "label": "G6",
            "domain": "Physical",
            "direction": "out",
            "quantity": "gate signal 6",
            "unit": "1"
          }
        ],
        "equation": "g_k = 1 if wrap360(θ − (α + 60·(k − 1))) < pulse_width,  else 0   [θ, α in deg],  k = 1…6\nθ = 360·freq·t when the θ port is unwired\nDiode / thyristor bridge: Vdc,avg = (3√2/π)·V_LL·cos α  (ripple at 6·f)",
        "description": "Six-pulse firing generator for a thyristor (Graetz) bridge (Simscape Synchronized 6-Pulse Generator). Gate k = 1…6 is high for pulse_width degrees starting at the firing angle α + 60·(k − 1), α counted from the natural commutation point of thyristor 1 (with v_a = V·sin ωt and positive a-b-c sequence that is θ = ωt − 30°). θ is the synchronisation angle in degrees (absolute); unwired, the block uses its own ramp 360·freq·t. A six-pulse bridge with firing angle α has the mean DC voltage (3√2/π)·V_LL·cos α. Signal generator only; the library has no thyristor device, so the gates drive controlled switches."
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
            "label": "Freq",
            "min": 0
          },
          "pulse_width_deg": {
            "value": 5,
            "unit": "deg",
            "label": "Pulse Width",
            "min": 0,
            "exclusiveMin": true,
            "max": 60
          }
        },
        "ports": [
          {
            "id": "theta",
            "pos": "left",
            "label": "theta",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "alpha",
            "pos": "left",
            "label": "alpha",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "delta_g1",
            "pos": "right",
            "label": "Delta G1",
            "domain": "Physical",
            "direction": "out",
            "quantity": "delta bridge gate signal 1",
            "unit": "1"
          },
          {
            "id": "delta_g2",
            "pos": "right",
            "label": "Delta G2",
            "domain": "Physical",
            "direction": "out",
            "quantity": "delta bridge gate signal 2",
            "unit": "1"
          },
          {
            "id": "delta_g3",
            "pos": "right",
            "label": "Delta G3",
            "domain": "Physical",
            "direction": "out",
            "quantity": "delta bridge gate signal 3",
            "unit": "1"
          },
          {
            "id": "delta_g4",
            "pos": "right",
            "label": "Delta G4",
            "domain": "Physical",
            "direction": "out",
            "quantity": "delta bridge gate signal 4",
            "unit": "1"
          },
          {
            "id": "delta_g5",
            "pos": "right",
            "label": "Delta G5",
            "domain": "Physical",
            "direction": "out",
            "quantity": "delta bridge gate signal 5",
            "unit": "1"
          },
          {
            "id": "delta_g6",
            "pos": "right",
            "label": "Delta G6",
            "domain": "Physical",
            "direction": "out",
            "quantity": "delta bridge gate signal 6",
            "unit": "1"
          },
          {
            "id": "wye_g1",
            "pos": "right",
            "label": "Wye G1",
            "domain": "Physical",
            "direction": "out",
            "quantity": "wye bridge gate signal 1",
            "unit": "1"
          },
          {
            "id": "wye_g2",
            "pos": "right",
            "label": "Wye G2",
            "domain": "Physical",
            "direction": "out",
            "quantity": "wye bridge gate signal 2",
            "unit": "1"
          },
          {
            "id": "wye_g3",
            "pos": "right",
            "label": "Wye G3",
            "domain": "Physical",
            "direction": "out",
            "quantity": "wye bridge gate signal 3",
            "unit": "1"
          },
          {
            "id": "wye_g4",
            "pos": "right",
            "label": "Wye G4",
            "domain": "Physical",
            "direction": "out",
            "quantity": "wye bridge gate signal 4",
            "unit": "1"
          },
          {
            "id": "wye_g5",
            "pos": "right",
            "label": "Wye G5",
            "domain": "Physical",
            "direction": "out",
            "quantity": "wye bridge gate signal 5",
            "unit": "1"
          },
          {
            "id": "wye_g6",
            "pos": "right",
            "label": "Wye G6",
            "domain": "Physical",
            "direction": "out",
            "quantity": "wye bridge gate signal 6",
            "unit": "1"
          }
        ],
        "equation": "φ = θ + 2π·freq·t  [rad]\ndelta_g_k = 1 if wrap2π(φ − (α + 60·(k − 1))) < pulse_width,  else 0\nwye_g_k = 1 if wrap2π(φ − (α + 30 + 60·(k − 1))) < pulse_width,  else 0   [α, pulse_width in deg],  k = 1…6\n12-pulse bridge pair in series: Vdc,avg = 2·(3√2/π)·V_LL·cos α  (ripple at 12·f)",
        "description": "Twelve-pulse firing generator (Simscape Synchronized 12-Pulse Generator): two six-pulse sequences, the wye (star) bridge 30° behind the delta bridge, each gate 60° after the previous one. θ is a phase offset in radians that is added to the internal ramp 2π·freq·t (the six-pulse block takes an absolute angle in degrees instead), α is the firing angle in degrees. Two six-pulse bridges fed 30° apart and connected in series give twice the six-pulse mean DC voltage with the ripple at 12 times the line frequency. Signal generator only; the library has no thyristor device, so the gates drive controlled switches."
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
            "label": "Linear Dens",
            "min": 0
          },
          "youngs": {
            "value": 1000000000,
            "unit": "Pa",
            "label": "Young Mod",
            "min": 0,
            "exclusiveMin": true
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "right",
            "label": "P",
            "domain": "BeltProperty"
          }
        ],
        "equation": "ρ = linear density [kg/m],  E = Young modulus [Pa]\nk = E·A/L [N/m] (Belt-Cable End),  J_belt = 2π·ρ·R³ [kg·m²] (spool, pulley)",
        "description": "Property link: publishes the linear density ρ (kg/m) and the Young modulus E (Pa) to every Belt-Cable End, Spool and Pulley wired to its BeltProperty port P. It has no mechanical ports and exchanges no power; a belt block that is not wired to it uses its own stiffness / inertia parameters."
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
            "label": "Stiffness",
            "min": 0,
            "exclusiveMin": true
          },
          "length": {
            "value": 1,
            "unit": "m",
            "label": "Belt Length",
            "min": 0,
            "exclusiveMin": true
          },
          "area": {
            "value": 0.001,
            "unit": "m2",
            "label": "Section Area",
            "min": 0,
            "exclusiveMin": true
          },
          "damping": {
            "value": 0,
            "unit": "N-s/m",
            "label": "Internal Damping",
            "min": 0
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
            "id": "e",
            "pos": "right",
            "label": "E",
            "domain": "Translational"
          },
          {
            "id": "p",
            "pos": "top",
            "label": "P",
            "domain": "BeltProperty"
          },
          {
            "id": "f",
            "pos": "bottom",
            "label": "F",
            "domain": "Physical",
            "direction": "out",
            "quantity": "belt tension",
            "unit": "N"
          }
        ],
        "equation": "dx/dt = v_E − v_R [m/s]  (x = x_E − x_R, extension)\nf = max(0, k·x + c·dx/dt) [N]  (belt tension, tension-only: a slack belt carries nothing)\nF_R→E = −f,  k = E·A/L (linked Belt-Cable Properties) or stiffness [N/m],  c = damping [N·s/m]",
        "description": "Elastic, tension-only end of a belt or cable between two Translational ports R and E, k = E·A/L from a wired Belt-Cable Properties block (Young modulus E, section A, length L), otherwise the stiffness parameter, plus an internal damping c (default 0). The tension is k·(x_E − x_R) + c·(v_E − v_R) and is clipped at 0 when the belt goes slack; the taut / slack switch is a solver event. Output f is the belt tension, positive when the belt is stretched (E moves away from R)."
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
            "label": "Radius",
            "min": 0,
            "exclusiveMin": true
          },
          "inertia": {
            "value": 0,
            "unit": "kg-m2",
            "label": "Spool Inertia",
            "min": 0
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
            "id": "a",
            "pos": "right",
            "label": "A",
            "domain": "Translational"
          },
          {
            "id": "p",
            "pos": "top",
            "label": "P",
            "domain": "BeltProperty"
          },
          {
            "id": "t",
            "pos": "bottom",
            "label": "T",
            "domain": "Physical",
            "direction": "out",
            "quantity": "torque",
            "unit": "N*m"
          }
        ],
        "equation": "v_A = R·ω_R [m/s]\nτ_R,in + R·F_A,in = J·dω/dt [N·m],  J = inertia + 2π·ρ·R³ (wrapped belt)\nt = τ_R,in",
        "description": "Ideal spool (winch) that reels a belt or cable: the belt end at Translational port A moves at v = R·ω of the Rotational shaft R (both referenced to the inertial frame). The torque balance includes the spool inertia plus the inertia of one wrapped circumference of belt, ρ·2π·R·R², with ρ the linear density of a wired Belt-Cable Properties block. Power balance: τ·ω + F·v = d(½·J·ω²)/dt. Output t is the torque the shaft delivers into the spool (N·m)."
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
            "label": "Radius",
            "min": 0,
            "exclusiveMin": true
          },
          "inertia": {
            "value": 0.01,
            "unit": "kg-m2",
            "label": "Inertia",
            "min": 0
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
            "id": "a",
            "pos": "right",
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
            "id": "p",
            "pos": "top",
            "label": "P",
            "domain": "BeltProperty"
          },
          {
            "id": "t",
            "pos": "bottom",
            "label": "T",
            "domain": "Physical",
            "direction": "out",
            "quantity": "torque",
            "unit": "N*m"
          }
        ],
        "equation": "v_A = R·ω [m/s],  v_B = −R·ω [m/s]\nτ_R,in + R·(F_A,in − F_B,in) = J·dω/dt [N·m],  J = inertia + 2π·ρ·R³\nt = τ_R,in",
        "description": "Ideal pulley carrying a belt over a wheel of radius R: the two belt segments A and B (Translational ports) move in opposite directions at ±R·ω of the Rotational hub R. The torque balance includes the hub inertia plus the wrapped-belt inertia 2π·ρ·R³ (linear density ρ from a wired Belt-Cable Properties block). Power balance: τ·ω + F_A·v_A + F_B·v_B = d(½·J·ω²)/dt. Output t is the torque the hub delivers into the pulley (N·m)."
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
            "label": "W",
            "domain": "Frame"
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
            "label": "R",
            "domain": "Frame"
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
            "label": "B",
            "domain": "Frame"
          },
          {
            "id": "f",
            "pos": "right",
            "label": "F",
            "domain": "Frame"
          }
        ],
        "equation": "Rigid Transform governing physical equation",
        "description": "Physical component model for Rigid Transform."
      },
      {
        "id": "transform_sensor",
        "name": "Transform Sensor",
        "color": "#4b5563",
        "icon": "rigid_trans",
        "category": "Frames & Transforms",
        "params": {},
        "ports": [
          {
            "id": "b",
            "pos": "left",
            "label": "B",
            "domain": "Frame"
          },
          {
            "id": "f",
            "pos": "left",
            "label": "F",
            "domain": "Frame"
          },
          {
            "id": "x",
            "pos": "right",
            "label": "X",
            "domain": "Physical",
            "direction": "out",
            "quantity": "relative position x",
            "unit": "m"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "Y",
            "domain": "Physical",
            "direction": "out",
            "quantity": "relative position y",
            "unit": "m"
          },
          {
            "id": "z",
            "pos": "right",
            "label": "Z",
            "domain": "Physical",
            "direction": "out",
            "quantity": "relative position z",
            "unit": "m"
          },
          {
            "id": "rx",
            "pos": "right",
            "label": "Rx",
            "domain": "Physical",
            "direction": "out",
            "quantity": "relative rotation about x",
            "unit": "rad"
          },
          {
            "id": "ry",
            "pos": "right",
            "label": "Ry",
            "domain": "Physical",
            "direction": "out",
            "quantity": "relative rotation about y",
            "unit": "rad"
          },
          {
            "id": "rz",
            "pos": "right",
            "label": "Rz",
            "domain": "Physical",
            "direction": "out",
            "quantity": "relative rotation about z",
            "unit": "rad"
          }
        ],
        "equation": "Transform Sensor governing physical equation",
        "description": "Physical component model for Transform Sensor."
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
            "label": "Distance",
            "min": 0
          }
        },
        "ports": [
          {
            "id": "b",
            "pos": "left",
            "label": "B",
            "domain": "Frame"
          },
          {
            "id": "f",
            "pos": "right",
            "label": "F",
            "domain": "Frame"
          },
          {
            "id": "d",
            "pos": "right",
            "label": "d",
            "domain": "Physical",
            "direction": "out",
            "quantity": "distance",
            "unit": "m"
          },
          {
            "id": "f_reac",
            "pos": "right",
            "label": "F",
            "domain": "Physical",
            "direction": "out",
            "quantity": "constraint reaction force",
            "unit": "N"
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
            "label": "B",
            "domain": "Frame"
          },
          {
            "id": "f",
            "pos": "right",
            "label": "F",
            "domain": "Frame"
          },
          {
            "id": "ang",
            "pos": "right",
            "label": "θ",
            "domain": "Physical",
            "direction": "out",
            "quantity": "angle",
            "unit": "rad"
          },
          {
            "id": "t_reac",
            "pos": "right",
            "label": "T",
            "domain": "Physical",
            "direction": "out",
            "quantity": "constraint reaction torque",
            "unit": "N*m"
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
          },
          "mass": {
            "value": 1,
            "unit": "kg",
            "label": "Mass",
            "min": 0
          },
          "direction": {
            "value": "[0 0 -1]",
            "unit": "1",
            "label": "Direction"
          }
        },
        "ports": [
          {
            "id": "b",
            "pos": "left",
            "label": "B",
            "domain": "Frame"
          },
          {
            "id": "f",
            "pos": "right",
            "label": "F",
            "domain": "Frame"
          },
          {
            "id": "fm",
            "pos": "right",
            "label": "|F|",
            "domain": "Physical",
            "direction": "out",
            "quantity": "gravity force magnitude",
            "unit": "N"
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
            "label": "Stiffness",
            "min": 0
          },
          "b": {
            "value": 10,
            "unit": "N-s/m",
            "label": "Damping",
            "min": 0
          },
          "x0": {
            "value": 0,
            "unit": "m",
            "label": "Natural Length"
          }
        },
        "ports": [
          {
            "id": "b",
            "pos": "left",
            "label": "B",
            "domain": "Frame"
          },
          {
            "id": "f",
            "pos": "right",
            "label": "F",
            "domain": "Frame"
          },
          {
            "id": "x",
            "pos": "right",
            "label": "x",
            "domain": "Physical",
            "direction": "out",
            "quantity": "spring length",
            "unit": "m"
          },
          {
            "id": "v",
            "pos": "right",
            "label": "v",
            "domain": "Physical",
            "direction": "out",
            "quantity": "relative velocity",
            "unit": "m/s"
          },
          {
            "id": "fm",
            "pos": "right",
            "label": "F",
            "domain": "Physical",
            "direction": "out",
            "quantity": "force magnitude",
            "unit": "N"
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
            "id": "in_fx",
            "pos": "left",
            "label": "Fx",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "in_fy",
            "pos": "left",
            "label": "Fy",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "in_fz",
            "pos": "left",
            "label": "Fz",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "in_tx",
            "pos": "left",
            "label": "Tx",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "in_ty",
            "pos": "left",
            "label": "Ty",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "in_tz",
            "pos": "left",
            "label": "Tz",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "b",
            "pos": "left",
            "label": "B",
            "domain": "Frame"
          },
          {
            "id": "f",
            "pos": "right",
            "label": "F",
            "domain": "Frame"
          },
          {
            "id": "fm",
            "pos": "right",
            "label": "|F|",
            "domain": "Physical",
            "direction": "out",
            "quantity": "force magnitude",
            "unit": "N"
          },
          {
            "id": "tm",
            "pos": "right",
            "label": "|T|",
            "domain": "Physical",
            "direction": "out",
            "quantity": "torque magnitude",
            "unit": "N*m"
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
          "axis": {
            "value": "[0 0 1]",
            "unit": "",
            "label": "Rotation axis (B-local, normalized)"
          },
          "damping": {
            "value": 0.1,
            "unit": "N-m-s/rad",
            "label": "Damping (free DOF only)",
            "min": 0
          }
        },
        "ports": [
          {
            "id": "b",
            "pos": "left",
            "label": "B",
            "domain": "Frame"
          },
          {
            "id": "f",
            "pos": "right",
            "label": "F",
            "domain": "Frame"
          },
          {
            "id": "q",
            "pos": "right",
            "label": "q (rad)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "joint angle",
            "unit": "rad"
          },
          {
            "id": "w",
            "pos": "right",
            "label": "w (rad/s)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "joint angular velocity",
            "unit": "rad/s"
          },
          {
            "id": "fx",
            "pos": "right",
            "label": "fx (N)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "joint reaction force x",
            "unit": "N"
          },
          {
            "id": "fy",
            "pos": "right",
            "label": "fy (N)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "joint reaction force y",
            "unit": "N"
          },
          {
            "id": "fz",
            "pos": "right",
            "label": "fz (N)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "joint reaction force z",
            "unit": "N"
          },
          {
            "id": "f_reac",
            "pos": "right",
            "label": "f_reac (N)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "constraint force magnitude",
            "unit": "N"
          },
          {
            "id": "tx",
            "pos": "right",
            "label": "tx (N*m)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "joint reaction torque x",
            "unit": "N*m"
          },
          {
            "id": "ty",
            "pos": "right",
            "label": "ty (N*m)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "joint reaction torque y",
            "unit": "N*m"
          },
          {
            "id": "tz",
            "pos": "right",
            "label": "tz (N*m)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "joint reaction torque z",
            "unit": "N*m"
          },
          {
            "id": "t_reac",
            "pos": "right",
            "label": "t_reac (N*m)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "constrained reaction torque magnitude",
            "unit": "N*m"
          }
        ],
        "equation": "Pf = Pb; (Rb t_j) . (Rf a) = 0 for t_j perpendicular to a (j = 1, 2); Ff = -Fb; Tf = sum_j lambda_j ((Rf a) x (Rb t_j)) - c w (Rb a); Tb = -Tf",
        "description": "1-DOF revolute joint: rotation about the normalized B-local axis a (a is also the F-local axis at q = 0). Constrains the 3 relative translations and the 2 rotations perpendicular to a. Reactions are the Lagrange multipliers of those 5 constraints: force Ff on F (equal and opposite on B) and the constrained torque, always perpendicular to a. Damping c [N*m*s/rad] acts only on the free rotation about a (0 is allowed). Outputs: q [rad] and w [rad/s] about the axis, reaction force (fx, fy, fz, f_reac) and torque (tx, ty, tz total on F including damping; t_reac is the constrained part only)."
      },
      {
        "id": "prismatic_joint",
        "name": "Prismatic Joint",
        "color": "#4b5563",
        "icon": "prism_joint",
        "category": "Joints",
        "params": {
          "axis": {
            "value": "[0 0 1]",
            "unit": "",
            "label": "Slide axis (B-local, normalized)"
          },
          "damping": {
            "value": 1,
            "unit": "N-s/m",
            "label": "Damping (free DOF only)",
            "min": 0
          }
        },
        "ports": [
          {
            "id": "b",
            "pos": "left",
            "label": "B",
            "domain": "Frame"
          },
          {
            "id": "f",
            "pos": "right",
            "label": "F",
            "domain": "Frame"
          },
          {
            "id": "x",
            "pos": "right",
            "label": "x (m)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "joint displacement",
            "unit": "m"
          },
          {
            "id": "v",
            "pos": "right",
            "label": "v (m/s)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "joint velocity",
            "unit": "m/s"
          },
          {
            "id": "fx",
            "pos": "right",
            "label": "fx (N)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "joint reaction force x",
            "unit": "N"
          },
          {
            "id": "fy",
            "pos": "right",
            "label": "fy (N)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "joint reaction force y",
            "unit": "N"
          },
          {
            "id": "fz",
            "pos": "right",
            "label": "fz (N)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "joint reaction force z",
            "unit": "N"
          },
          {
            "id": "f_reac",
            "pos": "right",
            "label": "f_reac (N)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "constraint force magnitude",
            "unit": "N"
          },
          {
            "id": "tx",
            "pos": "right",
            "label": "tx (N*m)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "joint reaction torque x",
            "unit": "N*m"
          },
          {
            "id": "ty",
            "pos": "right",
            "label": "ty (N*m)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "joint reaction torque y",
            "unit": "N*m"
          },
          {
            "id": "tz",
            "pos": "right",
            "label": "tz (N*m)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "joint reaction torque z",
            "unit": "N*m"
          },
          {
            "id": "tbx",
            "pos": "right",
            "label": "tbx (N*m)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "reaction torque on B x",
            "unit": "N*m"
          },
          {
            "id": "tby",
            "pos": "right",
            "label": "tby (N*m)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "reaction torque on B y",
            "unit": "N*m"
          },
          {
            "id": "tbz",
            "pos": "right",
            "label": "tbz (N*m)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "reaction torque on B z",
            "unit": "N*m"
          },
          {
            "id": "t_reac",
            "pos": "right",
            "label": "t_reac (N*m)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "constrained reaction torque magnitude",
            "unit": "N*m"
          }
        ],
        "equation": "(Rb c_j) . (Pf - Pb) = 0 for c_j perpendicular to a (j = 1, 2); Rf = Rb; Ff = sum_j lambda_j (Rb c_j) - c v (Rb a); Tb = -Tf - (Pf - Pb) x Ff",
        "description": "1-DOF prismatic joint: translation along the normalized B-local axis a. Constrains the 2 translations perpendicular to a and all 3 rotations. Reactions are the Lagrange multipliers of those 5 constraints: constraint force perpendicular to a (f_reac) plus the viscous force c v along a (fx, fy, fz are the total force on F), and the 3 constrained torques (tx, ty, tz on F about F; tbx, tby, tbz on B about B, which include the lever arm of the displacement). Damping c [N*s/m] acts only on the slide (0 is allowed). Outputs: displacement x [m] and velocity v [m/s]."
      },
      {
        "id": "spherical_joint",
        "name": "Spherical Joint",
        "color": "#4b5563",
        "icon": "sphere_joint",
        "category": "Joints",
        "params": {},
        "ports": [
          {
            "id": "b",
            "pos": "left",
            "label": "B",
            "domain": "Frame"
          },
          {
            "id": "f",
            "pos": "right",
            "label": "F",
            "domain": "Frame"
          },
          {
            "id": "fx",
            "pos": "right",
            "label": "fx (N)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "constraint force x",
            "unit": "N"
          },
          {
            "id": "fy",
            "pos": "right",
            "label": "fy (N)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "constraint force y",
            "unit": "N"
          },
          {
            "id": "fz",
            "pos": "right",
            "label": "fz (N)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "constraint force z",
            "unit": "N"
          },
          {
            "id": "f_reac",
            "pos": "right",
            "label": "f_reac (N)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "constraint force magnitude",
            "unit": "N"
          },
          {
            "id": "rx",
            "pos": "right",
            "label": "rx (rad)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "rotation about x",
            "unit": "rad"
          },
          {
            "id": "ry",
            "pos": "right",
            "label": "ry (rad)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "rotation about y",
            "unit": "rad"
          },
          {
            "id": "rz",
            "pos": "right",
            "label": "rz (rad)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "rotation about z",
            "unit": "rad"
          }
        ],
        "equation": "Pf - Pb = 0; Ff = -Fb (3 multipliers); Tf = Tb = 0",
        "description": "Ideal 3-DOF ball-and-socket joint: locks the relative X/Y/Z translation and leaves every rotation free, so it transmits no torque (there is no rotational damping or friction model). Reactions are the 3 force multipliers (fx, fy, fz, f_reac) in N. Outputs rx, ry, rz are the relative rotation vector (angle times axis of Rb^T Rf) in rad."
      },
      {
        "id": "universal_joint",
        "name": "Universal Joint",
        "color": "#4b5563",
        "icon": "univ_joint",
        "category": "Joints",
        "params": {
          "axis1": {
            "value": "[1 0 0]",
            "unit": "",
            "label": "Axis 1 (B-local, normalized)"
          },
          "axis2": {
            "value": "[0 1 0]",
            "unit": "",
            "label": "Axis 2 (F-local, orthogonalized to axis 1)"
          },
          "damping": {
            "value": 0.05,
            "unit": "N*m*s/rad",
            "label": "Damping on permitted axes",
            "min": 0
          }
        },
        "ports": [
          {
            "id": "b",
            "pos": "left",
            "label": "B",
            "domain": "Frame"
          },
          {
            "id": "f",
            "pos": "right",
            "label": "F",
            "domain": "Frame"
          },
          {
            "id": "angle1",
            "pos": "right",
            "label": "angle1 (rad)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "joint angle 1",
            "unit": "rad"
          },
          {
            "id": "angle2",
            "pos": "right",
            "label": "angle2 (rad)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "joint angle 2",
            "unit": "rad"
          },
          {
            "id": "w1",
            "pos": "right",
            "label": "w1 (rad/s)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "angular velocity 1",
            "unit": "rad/s"
          },
          {
            "id": "w2",
            "pos": "right",
            "label": "w2 (rad/s)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "angular velocity 2",
            "unit": "rad/s"
          },
          {
            "id": "fx",
            "pos": "right",
            "label": "fx (N)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "constraint force x",
            "unit": "N"
          },
          {
            "id": "fy",
            "pos": "right",
            "label": "fy (N)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "constraint force y",
            "unit": "N"
          },
          {
            "id": "fz",
            "pos": "right",
            "label": "fz (N)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "constraint force z",
            "unit": "N"
          },
          {
            "id": "f_reac",
            "pos": "right",
            "label": "f_reac (N)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "constraint force magnitude",
            "unit": "N"
          },
          {
            "id": "t_reac",
            "pos": "right",
            "label": "t_reac (N*m)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "constraint torque magnitude",
            "unit": "N*m"
          }
        ],
        "equation": "Pf = Pb; (Rb axis1) dot (Rf axis2) = 0; equal/opposite reactions",
        "description": "Two-axis universal joint. axis1 belongs to B and axis2 to F; nonparallel reference axes are orthonormalized. Angles are signed principal values in rad; t_reac is signed constrained torque on F. Damping opposes permitted-axis angular velocity only."
      },
      {
        "id": "weld_joint",
        "name": "Weld Joint",
        "color": "#4b5563",
        "icon": "weld_joint",
        "category": "Joints",
        "params": {
          "offset": {
            "value": "[0 0 0]",
            "unit": "m",
            "label": "Reference offset of F in B (B-local)"
          },
          "rotation": {
            "value": "[0 0 0]",
            "unit": "deg",
            "label": "Reference rotation of F relative to B"
          }
        },
        "ports": [
          {
            "id": "b",
            "pos": "left",
            "label": "B",
            "domain": "Frame"
          },
          {
            "id": "f",
            "pos": "right",
            "label": "F",
            "domain": "Frame"
          },
          {
            "id": "fx",
            "pos": "right",
            "label": "fx (N)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "joint reaction force x",
            "unit": "N"
          },
          {
            "id": "fy",
            "pos": "right",
            "label": "fy (N)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "joint reaction force y",
            "unit": "N"
          },
          {
            "id": "fz",
            "pos": "right",
            "label": "fz (N)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "joint reaction force z",
            "unit": "N"
          },
          {
            "id": "f_reac",
            "pos": "right",
            "label": "f_reac (N)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "constraint force magnitude",
            "unit": "N"
          },
          {
            "id": "tx",
            "pos": "right",
            "label": "tx (N*m)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "joint reaction torque x",
            "unit": "N*m"
          },
          {
            "id": "ty",
            "pos": "right",
            "label": "ty (N*m)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "joint reaction torque y",
            "unit": "N*m"
          },
          {
            "id": "tz",
            "pos": "right",
            "label": "tz (N*m)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "joint reaction torque z",
            "unit": "N*m"
          },
          {
            "id": "tbx",
            "pos": "right",
            "label": "tbx (N*m)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "reaction torque on B x",
            "unit": "N*m"
          },
          {
            "id": "tby",
            "pos": "right",
            "label": "tby (N*m)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "reaction torque on B y",
            "unit": "N*m"
          },
          {
            "id": "tbz",
            "pos": "right",
            "label": "tbz (N*m)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "reaction torque on B z",
            "unit": "N*m"
          },
          {
            "id": "t_reac",
            "pos": "right",
            "label": "t_reac (N*m)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "constrained reaction torque magnitude",
            "unit": "N*m"
          },
          {
            "id": "pos_err",
            "pos": "right",
            "label": "pos_err (m)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "relative position error",
            "unit": "m"
          },
          {
            "id": "rot_err",
            "pos": "right",
            "label": "rot_err (rad)",
            "domain": "Physical",
            "direction": "out",
            "quantity": "relative rotation error",
            "unit": "rad"
          }
        ],
        "equation": "Pf - Pb - Rb p0 = 0; Rf = Rb R0; Ff = -Fb; Tb = -Tf - (Pf - Pb) x Ff (6 multipliers)",
        "description": "0-DOF weld: locks all 6 relative coordinates to the fixed reference pose given by offset p0 (B-local, m) and rotation R0 (deg, Z-Y-X Euler like Rigid Transform); the default is coincident, aligned frames. Reactions are the 6 multipliers: force fx, fy, fz and torque tx, ty, tz exerted on F, plus the torque on B about B (tbx, tby, tbz = -t - d x f, which carries the moment of an offset load). pos_err [m] and rot_err [rad] report the residual relative pose error. There is no stiffness: the constraint is ideal."
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
            "label": "Ratio",
            "nonZero": true
          }
        },
        "ports": [
          {
            "id": "b",
            "pos": "left",
            "label": "B",
            "domain": "Rotational"
          },
          {
            "id": "f",
            "pos": "right",
            "label": "F",
            "domain": "Rotational"
          }
        ],
        "equation": "ω_F = ratio·ω_B [rad/s]\nτ_B,in + ratio·τ_F,in = 0 [N·m]  (P = τ_B·ω_B + τ_F·ω_F = 0)",
        "description": "Ideal (lossless, massless, backlash-free) gear pair between two scalar Rotational shafts B (base) and F (follower), each referenced to the inertial frame. ratio = ω_F/ω_B (dimensionless, nonzero); a negative ratio is an external mesh that reverses the direction. The constraint forces τ_F = -τ_B/ratio on the follower, so the transmitted power is zero. Both ports are scalar Rotational ports (the Simscape Driveline style): attach a body through a Rotational Multibody Interface, never wire a Frame to this block."
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
            "label": "Radius",
            "min": 0,
            "exclusiveMin": true
          }
        },
        "ports": [
          {
            "id": "b",
            "pos": "left",
            "label": "B",
            "domain": "Rotational"
          },
          {
            "id": "f",
            "pos": "right",
            "label": "F",
            "domain": "Translational"
          }
        ],
        "equation": "v_F = r·ω_B [m/s]\nτ_B,in + r·F_F,in = 0 [N·m]  (P = τ_B·ω_B + F_F·v_F = 0)",
        "description": "Ideal rack and pinion between a scalar Rotational pinion shaft B and a scalar Translational rack F, both referenced to the inertial frame. Positive pinion rotation drives the rack in the positive direction (v = r·ω); the rack force reacts on the pinion as τ = r·F, so the transmitted power is zero. Pinion pitch radius r > 0 (m). Scalar Rotational/Translational ports (Simscape Driveline style); a Frame must be attached through a Multibody Interface block."
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
            "label": "C",
            "domain": "Frame"
          }
        ],
        "equation": "g = [gx gy gz] attached to the Frame network it is wired to; no wrench, no constraint",
        "description": "Mechanism Configuration (Simscape Multibody): its single port C is a Frame connection that attaches the uniform gravity vector g [m/s2] to the mechanism it is wired to. It contributes no wrench and no constraint equation. Gravity is applied by the Gravitational Field block (this block records the mechanism gravity and rejects a malformed vector)."
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
            "label": "U",
            "domain": "Physical",
            "direction": "in"
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
            "domain": "Physical",
            "direction": "out",
            "quantity": "constant value",
            "unit": "*"
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
            "domain": "Physical",
            "direction": "out",
            "quantity": "constant value",
            "unit": "*"
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
            "label": "y",
            "domain": "Physical",
            "direction": "out",
            "quantity": "sine value",
            "unit": "*"
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
            "label": "y",
            "domain": "Physical",
            "direction": "out",
            "quantity": "step value",
            "unit": "*"
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
            "label": "y",
            "domain": "Physical",
            "direction": "out",
            "quantity": "ramp value",
            "unit": "*"
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
            "label": "Learning Rate",
            "min": 0
          }
        },
        "ports": [
          {
            "id": "x",
            "pos": "left",
            "label": "x",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "d",
            "pos": "left",
            "label": "d",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "lr",
            "pos": "bottom",
            "label": "lr",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "y",
            "domain": "Physical",
            "direction": "out",
            "quantity": "filter output",
            "unit": "*"
          },
          {
            "id": "err",
            "pos": "right",
            "label": "err",
            "domain": "Physical",
            "direction": "out",
            "quantity": "estimation error",
            "unit": "*"
          },
          {
            "id": "w1",
            "pos": "right",
            "label": "w1",
            "domain": "Physical",
            "direction": "out",
            "quantity": "filter weight 1",
            "unit": "1"
          },
          {
            "id": "w2",
            "pos": "right",
            "label": "w2",
            "domain": "Physical",
            "direction": "out",
            "quantity": "filter weight 2",
            "unit": "1"
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
            "label": "Learning Rate",
            "min": 0
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
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "x2",
            "pos": "left",
            "label": "x2",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "target",
            "pos": "left",
            "label": "target",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "lr",
            "pos": "bottom",
            "label": "lr",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "y",
            "pos": "right",
            "label": "y",
            "domain": "Physical",
            "direction": "out",
            "quantity": "neuron output",
            "unit": "1"
          },
          {
            "id": "err",
            "pos": "right",
            "label": "err",
            "domain": "Physical",
            "direction": "out",
            "quantity": "output error",
            "unit": "*"
          },
          {
            "id": "w1",
            "pos": "right",
            "label": "w1",
            "domain": "Physical",
            "direction": "out",
            "quantity": "weight 1",
            "unit": "1"
          },
          {
            "id": "w2",
            "pos": "right",
            "label": "w2",
            "domain": "Physical",
            "direction": "out",
            "quantity": "weight 2",
            "unit": "1"
          },
          {
            "id": "bias",
            "pos": "right",
            "label": "bias",
            "domain": "Physical",
            "direction": "out",
            "quantity": "bias",
            "unit": "1"
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
            "label": "Alpha (Learning Rate)",
            "min": 0,
            "exclusiveMin": true,
            "max": 1
          },
          "gamma": {
            "value": 0.9,
            "unit": "1",
            "label": "Gamma (Discount Factor)",
            "min": 0,
            "max": 1
          },
          "epsilon": {
            "value": 0.1,
            "unit": "1",
            "label": "Epsilon (Exploration Rate)",
            "min": 0,
            "max": 1
          },
          "numStates": {
            "value": 5,
            "unit": "1",
            "label": "Number of States",
            "min": 1
          },
          "numActions": {
            "value": 3,
            "unit": "1",
            "label": "Number of Actions",
            "min": 1
          }
        },
        "ports": [
          {
            "id": "error",
            "pos": "left",
            "label": "error",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "reward",
            "pos": "left",
            "label": "reward",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "reset",
            "pos": "bottom",
            "label": "reset",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "action",
            "pos": "right",
            "label": "action",
            "domain": "Physical",
            "direction": "out",
            "quantity": "selected action",
            "unit": "*"
          },
          {
            "id": "max_q",
            "pos": "right",
            "label": "max_q",
            "domain": "Physical",
            "direction": "out",
            "quantity": "maximum Q value",
            "unit": "1"
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
            "label": "Stator Res",
            "min": 0
          },
          "Ls": {
            "value": 0.1,
            "unit": "H",
            "label": "Stator Ind",
            "min": 0,
            "exclusiveMin": true
          },
          "Rr": {
            "value": 0.4,
            "unit": "Ω",
            "label": "Rotor Res",
            "min": 0,
            "exclusiveMin": true
          },
          "Lr": {
            "value": 0.1,
            "unit": "H",
            "label": "Rotor Ind",
            "min": 0,
            "exclusiveMin": true
          },
          "Lm": {
            "value": 0.09,
            "unit": "H",
            "label": "Mutual Ind",
            "min": 0,
            "exclusiveMin": true
          },
          "P": {
            "value": 2,
            "unit": "1",
            "label": "Pole Pairs",
            "min": 1
          },
          "J": {
            "value": 0.01,
            "unit": "kg-m^2",
            "label": "Inertia",
            "min": 0,
            "exclusiveMin": true
          },
          "B": {
            "value": 0.001,
            "unit": "N-m-s/rad",
            "label": "Damping",
            "min": 0
          },
          "N": {
            "value": 100,
            "unit": "1",
            "label": "Filter Coeff",
            "min": 0,
            "exclusiveMin": true
          }
        },
        "ports": [
          {
            "id": "w_ref",
            "pos": "left",
            "label": "w_ref",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "tl",
            "pos": "bottom",
            "label": "tl",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "omega",
            "pos": "right",
            "label": "omega",
            "domain": "Physical",
            "direction": "out",
            "quantity": "angular velocity",
            "unit": "rad/s"
          },
          {
            "id": "error",
            "pos": "right",
            "label": "error",
            "domain": "Physical",
            "direction": "out",
            "quantity": "speed error",
            "unit": "rad/s"
          },
          {
            "id": "te",
            "pos": "right",
            "label": "te",
            "domain": "Physical",
            "direction": "out",
            "quantity": "electromagnetic torque",
            "unit": "N*m"
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
            "label": "Conductance",
            "min": 0
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A",
            "domain": "Thermal"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "B",
            "domain": "Thermal"
          }
        ],
        "equation": "Q = k * (T1 - T2)",
        "description": "Fourier conductive heat transfer with thermal conductance k."
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
            "label": "Heat Coeff",
            "min": 0
          },
          "A": {
            "value": 1,
            "unit": "m^2",
            "label": "Area",
            "min": 0
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A",
            "domain": "Thermal"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "B",
            "domain": "Thermal"
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
            "label": "Emissivity",
            "min": 0,
            "max": 1
          },
          "A": {
            "value": 1,
            "unit": "m^2",
            "label": "Area",
            "min": 0
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "left",
            "label": "A",
            "domain": "Thermal"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "B",
            "domain": "Thermal"
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
            "label": "Thermal Capacity",
            "min": 0,
            "exclusiveMin": true
          },
          "T0": {
            "value": 293.15,
            "unit": "K",
            "label": "Initial Temperature",
            "min": 0
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "top",
            "label": "A",
            "domain": "Thermal"
          }
        ],
        "equation": "Q = C * dT/dt   (C = m * c_p, T(0) = T0)",
        "description": "Simscape Thermal Mass: lumped heat capacity C = m·c_p [J/K]. Q is the heat flow into port A and T is the absolute temperature (K, measured against the 0 K Thermal Reference); the temperature starts at the Initial Temperature T0 (default 293.15 K)."
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
            "label": "A",
            "domain": "Thermal"
          }
        ],
        "equation": "T = 0 K (absolute zero)",
        "description": "Simscape Thermal Reference: absolute zero (0 K), the datum of every thermal network. All thermal temperatures in V-Lab are absolute (K); a Temperature Sensor with B on the reference reads the absolute temperature. It is NOT an ambient temperature: use a Temperature Source for a fixed-temperature environment."
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
            "label": "A",
            "domain": "Thermal"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "B",
            "domain": "Thermal"
          },
          {
            "id": "h",
            "pos": "top",
            "label": "H",
            "domain": "Physical",
            "direction": "out",
            "quantity": "heat flow rate",
            "unit": "W"
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
            "label": "A",
            "domain": "Thermal"
          },
          {
            "id": "b",
            "pos": "right",
            "label": "B",
            "domain": "Thermal"
          },
          {
            "id": "t",
            "pos": "top",
            "label": "T",
            "domain": "Physical",
            "direction": "out",
            "quantity": "temperature difference",
            "unit": "K"
          }
        ],
        "equation": "T_out = T_a - T_b",
        "description": "Simscape Temperature Sensor: outputs T_A - T_B (K) as a physical signal and draws no heat. Temperatures are absolute, so with B on the Thermal Reference (or left open, which reads against 0 K) the output is the absolute temperature in kelvin."
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
            "label": "A",
            "domain": "Thermal"
          },
          {
            "id": "b",
            "pos": "top",
            "label": "B",
            "domain": "Thermal"
          }
        ],
        "equation": "Q = Q_src (heat flow from A to B through the source)",
        "description": "Simscape Heat Flow Rate Source: ideal source forcing the heat flow rate Q [W] from port A to port B regardless of the temperature difference (Q < 0 reverses it). Both ports must be wired into the thermal network, otherwise the heat has nowhere to go."
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
            "label": "Temperature",
            "min": 0,
            "exclusiveMin": true
          }
        },
        "ports": [
          {
            "id": "a",
            "pos": "top",
            "label": "A",
            "domain": "Thermal"
          }
        ],
        "equation": "T_A = T (absolute, against the 0 K Thermal Reference)",
        "description": "Ideal temperature source holding its single thermal port A at the absolute temperature T [K] (the other terminal is the 0 K Thermal Reference); it supplies whatever heat flow the network demands. Use it as the ambient or a fixed-temperature boundary."
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
            "domain": "Physical",
            "direction": "in"
          }
        ],
        "equation": "Q = S (heat flow from A to B through the source)",
        "description": "Simscape Controlled Heat Flow Rate Source: ideal source whose heat flow rate Q [W] from port A to port B equals the physical signal S wired to port S. Both thermal ports must be wired into the network."
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
            "domain": "Physical",
            "direction": "in"
          }
        ],
        "equation": "T_A - T_B = S",
        "description": "Controlled Temperature Source: holds the temperature difference T_A - T_B (K) equal to the physical signal S wired to port S. With B on the Thermal Reference (or left open, which reads against 0 K) it sets the absolute temperature of A."
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
            "label": "Basket Inertia",
            "min": 0,
            "exclusiveMin": true
          },
          "load_mass": {
            "value": 5,
            "unit": "kg",
            "label": "Clothes Mass",
            "min": 0
          },
          "unbalance": {
            "value": 0.5,
            "unit": "kg",
            "label": "Unbalance Mass",
            "min": 0
          },
          "radius": {
            "value": 0.25,
            "unit": "m",
            "label": "Radius",
            "min": 0,
            "exclusiveMin": true
          },
          "damping": {
            "value": 0.02,
            "unit": "N-m-s/rad",
            "label": "Viscous Damping",
            "min": 0
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
            "domain": "Physical",
            "direction": "out",
            "quantity": "load torque",
            "unit": "N*m"
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
            "label": "Water Level",
            "min": 0
          },
          "detergent": {
            "value": 1,
            "unit": "%",
            "label": "Detergent Conc",
            "min": 0
          },
          "drag_coeff": {
            "value": 0.05,
            "unit": "N-m-s/rad",
            "label": "Slosh Drag",
            "min": 0
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
            "label": "Nominal Power",
            "min": 0
          },
          "efficiency": {
            "value": 65,
            "unit": "%",
            "label": "Efficiency",
            "min": 0,
            "max": 100
          },
          "v_nominal": {
            "value": 4000,
            "unit": "V",
            "label": "Nominal Anode Voltage",
            "min": 0,
            "exclusiveMin": true
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
            "label": "Resistance",
            "min": 0,
            "exclusiveMin": true
          },
          "efficiency": {
            "value": 0.9,
            "unit": "1",
            "label": "Heating Efficiency",
            "min": 0,
            "max": 1
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
            "label": "Heating Power",
            "min": 0
          },
          "tank_vol": {
            "value": 0.5,
            "unit": "L",
            "label": "Tank Volume",
            "min": 0,
            "exclusiveMin": true
          },
          "boil_temp": {
            "value": 100,
            "unit": "C",
            "label": "Boiling Temp",
            "min": -273.15,
            "exclusiveMin": true
          },
          "v_rated": {
            "value": 230,
            "unit": "V",
            "label": "Rated Voltage",
            "min": 0,
            "exclusiveMin": true
          },
          "eta": {
            "value": 0.95,
            "unit": "1",
            "label": "Thermal Efficiency",
            "min": 0,
            "max": 1
          },
          "k_loss": {
            "value": 1,
            "unit": "W/K",
            "label": "Tank Heat Loss Coefficient",
            "min": 0
          },
          "ambient_temp": {
            "value": 25,
            "unit": "C",
            "label": "Ambient Temperature",
            "min": -273.15,
            "exclusiveMin": true
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
        "equation": "R = v_rated^2/power, i = (v_p - v_n)/R, P_el = v*i\nm_w c_w dT_w/dt = eta*P_el - k_loss*(T_w - T_amb) - Q_s\nT_w >= T_boil: Q_s = max(0, eta*P_el - k_loss*(T_w - T_amb)), mdot_steam = Q_s/h_fg, dm_w/dt = -mdot_steam",
        "description": "Electric boiler: a resistive element (rated power at the rated voltage) heats a water tank of tank_vol litres (initially full, at the ambient temperature). The water warms with the first-law balance above until it reaches the boiling temperature boil_temp; the net heat then evaporates water, mdot_steam = Q_s / h_fg (h_fg from the IF97 saturation line), the tank inventory falls, and the latent heat Q_s is delivered through the thermal port S (the steam condensing on the load). Below boil_temp no heat leaves through S. Dry-out stops steam production."
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
            "label": "Input Voltage",
            "min": 0,
            "exclusiveMin": true
          },
          "v_out": {
            "value": 4000,
            "unit": "V",
            "label": "Output HV"
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
            "domain": "Physical",
            "direction": "in"
          }
        ],
        "equation": "V_hv = ctrl·v_out  [V]  (regulated, measured against the model ground)\ni_in = G_e·v_ac,  G_e = V_hv·i_out/v_in²  [A]  (loss-free resistor: P_in = ⟨v_ac·i_in⟩ = V_hv·i_out when the supply rms = v_in)",
        "description": "Averaged model of the high-voltage inverter power supply of a microwave oven: an ideal, loss-free converter with a regulated HV output V_hv = ctrl·v_out (ctrl = 1 when unwired) and a unity-power-factor input (loss-free resistor, Erickson, Fundamentals of Power Electronics ch. 18). The input current is in phase with the AC voltage, so the cycle-averaged input power equals the output power when the supply rms equals the nominal Input Voltage v_in (the model has no energy storage, so the 100 Hz power ripple appears at the input). AC and HV are single-ended terminals measured against the model's Electrical Reference (there is no return terminal). Averaged model: the switching of the inverter itself is not simulated."
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
            "label": "Volume",
            "min": 0,
            "exclusiveMin": true
          },
          "ambient_temp": {
            "value": 25,
            "unit": "C",
            "label": "Ambient",
            "min": -273.15,
            "exclusiveMin": true
          },
          "max_temp": {
            "value": 250,
            "unit": "C",
            "label": "Thermal Cutout Limit",
            "min": -273.15,
            "exclusiveMin": true
          },
          "food_mass": {
            "value": 0.5,
            "unit": "kg",
            "label": "Food/Water Mass",
            "min": 0
          },
          "food_cp": {
            "value": 4184,
            "unit": "J/(kg*K)",
            "label": "Food Specific Heat",
            "min": 0,
            "exclusiveMin": true
          },
          "wall_mass": {
            "value": 2,
            "unit": "kg",
            "label": "Wall Mass",
            "min": 0
          },
          "wall_cp": {
            "value": 460,
            "unit": "J/(kg*K)",
            "label": "Wall Specific Heat",
            "min": 0,
            "exclusiveMin": true
          },
          "h_conv": {
            "value": 10,
            "unit": "W/(m^2*K)",
            "label": "Convection Coeff.",
            "min": 0
          },
          "eps": {
            "value": 0.85,
            "unit": "-",
            "label": "Surface Emissivity",
            "min": 0,
            "max": 1
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
            "domain": "Physical",
            "direction": "out",
            "quantity": "temperature",
            "unit": "K"
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
            "label": "Start Time",
            "min": 0
          },
          "stopTime": {
            "value": 10,
            "unit": "s",
            "label": "Stop Time",
            "min": 0,
            "exclusiveMin": true
          },
          "initialStep": {
            "value": 0.001,
            "unit": "s",
            "label": "Initial Step",
            "min": 0,
            "exclusiveMin": true
          },
          "minimumStep": {
            "value": 0.000001,
            "unit": "s",
            "label": "Minimum Step",
            "min": 0,
            "exclusiveMin": true
          },
          "maximumStep": {
            "value": 0.05,
            "unit": "s",
            "label": "Maximum Step",
            "min": 0,
            "exclusiveMin": true
          },
          "relativeTolerance": {
            "value": 0.001,
            "unit": "",
            "label": "Relative Tolerance",
            "min": 0,
            "exclusiveMin": true
          },
          "absoluteTolerance": {
            "value": 0.000001,
            "unit": "",
            "label": "Absolute Tolerance",
            "min": 0,
            "exclusiveMin": true
          },
          "nonlinearTolerance": {
            "value": 1e-8,
            "unit": "",
            "label": "Nonlinear Tolerance",
            "min": 0,
            "exclusiveMin": true
          },
          "maximumIterations": {
            "value": 50,
            "unit": "",
            "label": "Max Newton Iterations",
            "min": 1
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
            "label": "A",
            "domain": "Physical"
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
            "label": "In",
            "domain": "Any"
          },
          {
            "id": "out",
            "pos": "right",
            "label": "Out",
            "domain": "Any"
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
            "label": "In",
            "domain": "Any"
          },
          {
            "id": "out",
            "pos": "right",
            "label": "Out",
            "domain": "Any"
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
            "label": "In",
            "domain": "Physical",
            "direction": "in"
          },
          {
            "id": "out",
            "pos": "right",
            "label": "x",
            "domain": "Physical",
            "direction": "out",
            "quantity": "probed signal",
            "unit": "*"
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
            "label": "A",
            "domain": "Physical"
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
            "label": "Port Index",
            "min": 1
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
            "label": "Out",
            "domain": "Physical",
            "direction": "out",
            "quantity": "subsystem input",
            "unit": "*"
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
            "label": "Port Index",
            "min": 1
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
            "label": "In",
            "domain": "Physical",
            "direction": "in"
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
            "label": "P",
            "domain": "Fluid"
          }
        ],
        "equation": "p = 101325 Pa (1 atm, absolute)",
        "description": "Pressure datum of a Fluid network (Simscape Reservoir / Hydraulic Reference): pins the connected node at the absolute pressure of 1 standard atmosphere and absorbs any mass flow. Unconnected Fluid ports are open (capped, no flow), never an implicit atmosphere: every connected Fluid network needs a datum (this block, an absolute Pressure Source, or a capacity with an initial pressure)."
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
            "label": "Resistance",
            "min": 0
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "left",
            "label": "In",
            "domain": "Fluid"
          },
          {
            "id": "n",
            "pos": "right",
            "label": "Out",
            "domain": "Fluid"
          }
        ],
        "equation": "p_p - p_n = Rf * mdot   [Pa = (Pa s/kg) * (kg/s)]",
        "description": "Linear (laminar) flow resistance: the pressure drop is proportional to the mass flow rate, as for Hagen-Poiseuille flow in a pipe. mdot is positive from p to n. Rf = 0 is an ideal short between the ports."
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
            "label": "Discharge Coeff.",
            "min": 0,
            "exclusiveMin": true,
            "max": 1
          },
          "A": {
            "value": 0.0001,
            "unit": "m²",
            "label": "Area",
            "min": 0
          },
          "rho": {
            "value": 1.2,
            "unit": "kg/m³",
            "label": "Density",
            "min": 0,
            "exclusiveMin": true
          },
          "mu": {
            "value": 0.0000181,
            "unit": "Pa·s",
            "label": "Dynamic Viscosity",
            "min": 0,
            "exclusiveMin": true
          },
          "Re_crit": {
            "value": 12,
            "unit": "1",
            "label": "Critical Reynolds Number",
            "min": 0,
            "exclusiveMin": true
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "left",
            "label": "In",
            "domain": "Fluid"
          },
          {
            "id": "n",
            "pos": "right",
            "label": "Out",
            "domain": "Fluid"
          }
        ],
        "equation": "mdot = Cd*A*sqrt(2*rho)*dP/(dP^2 + dP_crit^2)^(1/4),  dP = p_p - p_n,  dP_crit = pi*Re_crit^2*mu^2/(8*rho*Cd^2*A)  [kg/s]  (= Cd*A*sqrt(2*rho*|dP|)*sign(dP) for |dP| >> dP_crit)",
        "description": "Bernoulli orifice (Simscape Local Restriction) with the smooth laminar / turbulent transition: turbulent mdot = Cd A sqrt(2 rho |dP|) for |dP| well above the critical pressure drop dP_crit (the pressure drop at the critical Reynolds number Re_crit), linear in dP below it, so the law has a finite slope at dP = 0. A = 0 closes the orifice. mdot is positive from p to n; rho and mu are those of the fluid (defaults: air at 20 degC)."
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
            "label": "Capacitance",
            "min": 0,
            "exclusiveMin": true
          },
          "P0": {
            "value": 101325,
            "unit": "Pa",
            "label": "Initial Pressure",
            "min": 0
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "left",
            "label": "In",
            "domain": "Fluid"
          }
        ],
        "equation": "mdot = Cf * dp/dt   [kg/s = (kg/Pa) * (Pa/s)],  p(0) = P0",
        "description": "Constant-volume fluid chamber (tank): the mass flow into the port equals the compressibility capacitance Cf = V (d rho / d p) times the rate of change of the absolute pressure. The pressure starts at P0 (default 1 atm). The second terminal of the chamber is the absolute pressure zero, so the block also defines the absolute pressure level of its network."
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
            "label": "Inertance",
            "min": 0,
            "exclusiveMin": true
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "left",
            "label": "In",
            "domain": "Fluid"
          },
          {
            "id": "n",
            "pos": "right",
            "label": "Out",
            "domain": "Fluid"
          }
        ],
        "equation": "p_p - p_n = Li * d(mdot)/dt   [Pa = (Pa s^2/kg) * (kg/s^2)]",
        "description": "Fluid inertance (momentum of a fluid column, Newton's second law on the column): the pressure difference accelerates the mass flow, Li = L / S for a column of length L and cross-section S. With a capacitance it forms an oscillator of period 2 pi sqrt(Li Cf). mdot is positive from p to n."
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
            "label": "Pressure",
            "min": 0,
            "exclusiveMin": true
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "right",
            "label": "Out",
            "domain": "Fluid"
          }
        ],
        "equation": "p_p = P   (absolute pressure, any mass flow)",
        "description": "Ideal single-ended pressure source: holds its port at the absolute pressure P (the second terminal is the absolute pressure zero) and supplies whatever mass flow the network demands. It is itself a pressure datum for its network."
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
            "label": "Out",
            "domain": "Fluid"
          },
          {
            "id": "ctrl",
            "pos": "left",
            "label": "In",
            "domain": "Physical",
            "direction": "in"
          }
        ],
        "equation": "p_p = ctrl   (absolute pressure in Pa from the input signal)",
        "description": "Controlled ideal single-ended pressure source: holds its port at the absolute pressure given by the ctrl input signal (the second terminal is the absolute pressure zero). It is itself a pressure datum for its network."
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
            "label": "Out",
            "domain": "Fluid"
          }
        ],
        "equation": "mdot_out = mdot   [kg/s delivered into the network through the port, negative = withdrawn]",
        "description": "Ideal single-ended mass flow source: delivers mdot (kg/s) INTO the network through its Out port, whatever the pressure. The network must be able to take the flow (a path to a pressure datum or a capacity), otherwise the mass accumulates without bound and the model is singular."
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
            "label": "On Resistance",
            "min": 0,
            "exclusiveMin": true
          },
          "P_crack": {
            "value": 0,
            "unit": "Pa",
            "label": "Cracking Pressure",
            "min": 0
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "left",
            "label": "In",
            "domain": "Fluid"
          },
          {
            "id": "n",
            "pos": "right",
            "label": "Out",
            "domain": "Fluid"
          }
        ],
        "equation": "mdot = (dP - P_crack) / Rf  for dP = p_p - p_n > P_crack,  mdot = 0 otherwise  (smooth gate, width 1 mPa)",
        "description": "One-way valve with a linear open-state resistance (Simscape Check Valve, linear region): it conducts from p to n once the pressure difference exceeds the cracking pressure P_crack, with flow proportional to the excess pressure, and blocks reverse flow."
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
            "label": "Set Pressure",
            "min": 0,
            "exclusiveMin": true
          },
          "Rf_open": {
            "value": 100,
            "unit": "Pa·s/kg",
            "label": "Open Res.",
            "min": 0,
            "exclusiveMin": true
          },
          "Rf_closed": {
            "value": 10000000000,
            "unit": "Pa·s/kg",
            "label": "Closed Res.",
            "min": 0,
            "exclusiveMin": true
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "left",
            "label": "In",
            "domain": "Fluid"
          },
          {
            "id": "n",
            "pos": "right",
            "label": "Out",
            "domain": "Fluid"
          }
        ],
        "equation": "dP = p_p - p_n = mdot * R(dP),  R = Rf_open*s + Rf_closed*(1 - s),  s = (1 + tanh((dP - P_set)/10 kPa))/2",
        "description": "Pressure relief valve (Simscape Pressure Relief Valve): the valve opens when the pressure DIFFERENCE between its ports exceeds the set pressure P_set, so the flow path resistance falls smoothly from Rf_closed (leakage) to Rf_open and the excess pressure is vented from p to n."
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
            "label": "Steam",
            "domain": "Fluid"
          },
          {
            "id": "n",
            "pos": "left",
            "label": "Return",
            "domain": "Fluid"
          },
          {
            "id": "q_in",
            "pos": "left",
            "label": "Heat",
            "domain": "Physical",
            "direction": "in"
          }
        ],
        "equation": "mdot_steam = max(0, Q) / h_fg(T_sat(p_p))   [kg/s],  steam leaves through p, feed water returns through n",
        "description": "Ideal steam generator: the heat input Q (parameter, or the q_in signal in W) evaporates water at the saturation state of the Steam port pressure, mdot = Q / h_fg. T_sat(p) and h_fg come from the IAPWS-IF97 saturation line (Clausius-Clapeyron latent heat). The steam is delivered into the network at p and the same mass flow is drawn from n."
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
            "label": "Volume",
            "min": 0,
            "exclusiveMin": true
          }
        },
        "ports": [
          {
            "id": "pin",
            "pos": "left",
            "label": "In",
            "domain": "Fluid"
          },
          {
            "id": "pout",
            "pos": "right",
            "label": "Out",
            "domain": "Fluid"
          }
        ],
        "equation": "p_in = p_out,  mdot_in - mdot_out = V * (d rho_g / d p)_sat * dp/dt   [kg/s]",
        "description": "Dry saturated-steam vessel of volume V: the steam mass m = V rho_g(p) follows the saturation line (IAPWS-IF97), so a net inflow raises the pressure with the storage coefficient V d rho_g/dp. Both ports are the vessel node. Flash storage of a liquid inventory is not modelled."
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
            "label": "Discharge Coeff.",
            "min": 0,
            "exclusiveMin": true,
            "max": 1
          },
          "d": {
            "value": 0.0005,
            "unit": "m",
            "label": "Diameter",
            "min": 0,
            "exclusiveMin": true
          },
          "gamma": {
            "value": 1.3,
            "unit": "1",
            "label": "Specific Heat Ratio",
            "min": 1,
            "exclusiveMin": true
          }
        },
        "ports": [
          {
            "id": "p",
            "pos": "left",
            "label": "In",
            "domain": "Fluid"
          },
          {
            "id": "n",
            "pos": "right",
            "label": "Out",
            "domain": "Fluid"
          }
        ],
        "equation": "mdot = Cd*A*Pp*sqrt(2*gamma/((gamma-1)*R*T0)) * sqrt(r^(2/gamma) - r^((gamma+1)/gamma)),  r = max(Pn/Pp, r*),  r* = (2/(gamma+1))^(gamma/(gamma-1)),  T0 = T_sat(Pp)",
        "description": "Two-port converging steam nozzle: isentropic (Saint-Venant & Wantzel) flow of saturated steam from the upstream pressure Pp (T0 = T_sat(Pp), R = 461.52 J/(kg K)) to the downstream pressure Pn, choked at the critical pressure ratio r*, so the flow stays constant when the downstream pressure falls below r* Pp. No reverse flow."
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
            "label": "In",
            "domain": "Fluid"
          },
          {
            "id": "out",
            "pos": "right",
            "label": "P",
            "domain": "Physical",
            "direction": "out",
            "quantity": "pressure",
            "unit": "Pa"
          }
        ],
        "equation": "out = p_p   [Pa, absolute pressure of the node; no mass flow]",
        "description": "Ideal single-ended pressure sensor: outputs the absolute pressure at its port and draws no mass flow. Use two sensors (or a Subtract block) for a differential reading."
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
            "label": "In",
            "domain": "Fluid"
          },
          {
            "id": "n",
            "pos": "right",
            "label": "Out",
            "domain": "Fluid"
          },
          {
            "id": "out",
            "pos": "top",
            "label": "F",
            "domain": "Physical",
            "direction": "out",
            "quantity": "mass flow rate",
            "unit": "kg/s"
          }
        ],
        "equation": "p_p = p_n,  out = mdot   [kg/s, positive from p to n]",
        "description": "Ideal mass flow rate sensor in series with the line: no pressure drop (p_p = p_n), the output is the mass flow rate through it, positive from p to n."
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
          },
          "deploymentModel": {
            "value": "{}",
            "unit": "",
            "label": "Deployment Model (JSON)"
          }
        },
        "ports": [],
        "equation": "Y = f(X1, X2, ...)",
        "description": "A data-driven model generated from experimental results (Design of Experiments). It allows high-fidelity behavioral simulation without complex physical equations."
      }
    ]
  },
  {
    "type": "Isothermal Liquid",
    "blocks": [
      {
        "id": "hydraulic_reference_il",
        "name": "Hydraulic Reference (IL)",
        "color": "#2563eb",
        "icon": "hydraulic_reference_il",
        "category": "Utilities",
        "params": {
          "referencePressure": {
            "value": 101325,
            "unit": "Pa",
            "label": "Reference Pressure",
            "min": 0,
            "exclusiveMin": true
          },
          "pressureType": {
            "value": "absolute",
            "unit": "",
            "label": "Pressure Type"
          },
          "atmosphericPressure": {
            "value": 101325,
            "unit": "Pa",
            "label": "Atmospheric Pressure",
            "min": 0,
            "exclusiveMin": true
          },
          "elevationCorrection": {
            "value": "false",
            "unit": "",
            "label": "Enable Elevation Correction"
          },
          "referenceElevation": {
            "value": 0,
            "unit": "m",
            "label": "Reference Elevation"
          },
          "initializationPriority": {
            "value": "high",
            "unit": "",
            "label": "Initialization Priority"
          }
        },
        "ports": [
          { "id": "a", "pos": "top", "label": "A", "domain": "isothermal_liquid" }
        ],
        "equation": "p_A = p_absolute + rho*g*(z_ref - z_A)",
        "description": "Establishes the absolute pressure reference for an isothermal liquid network, equivalent to connecting to a large reservoir."
      },
      {
        "id": "pump_il",
        "name": "Pump (IL)",
        "color": "#2563eb",
        "icon": "pump_il",
        "category": "Sources",
        "params": {
          "pressure_rise": { "value": 200000, "unit": "Pa", "label": "Pressure Rise" }
        },
        "ports": [
          { "id": "a", "pos": "left", "label": "A", "domain": "isothermal_liquid" },
          { "id": "b", "pos": "right", "label": "B", "domain": "isothermal_liquid" }
        ],
        "equation": "p_B - p_A = pressure_rise   [Pa, any mass flow A -> B]",
        "description": "Ideal pump in the sense of an ideal pressure source: it holds a fixed pressure rise between its ports and delivers whatever mass flow the network demands. It has no shaft port and no pump curve (no displacement relation Q = D w, tau = D dp): use it as the pressure head of a pump."
      },
      {
        "id": "pipe_il",
        "name": "Pipe (IL)",
        "color": "#2563eb",
        "icon": "pipe_il",
        "category": "Elements",
        "params": {
          "R": {
            "value": 100000,
            "unit": "Pa/(kg/s)",
            "label": "Hydraulic Resistance",
            "min": 0
          }
        },
        "ports": [
          { "id": "a", "pos": "left", "label": "A", "domain": "isothermal_liquid" },
          { "id": "b", "pos": "right", "label": "B", "domain": "isothermal_liquid" }
        ],
        "equation": "p_A - p_B = R * mdot",
        "description": "Hydraulic pipe with laminar flow resistance."
      },
      {
        "id": "restriction_il",
        "name": "Restriction (IL)",
        "color": "#2563eb",
        "icon": "restriction_il",
        "category": "Elements",
        "params": {
          "Cd": {
            "value": 0.6,
            "unit": "1",
            "label": "Discharge Coefficient",
            "min": 0,
            "exclusiveMin": true,
            "max": 1
          },
          "area": {
            "value": 0.0001,
            "unit": "m^2",
            "label": "Restriction Area",
            "min": 0
          },
          "rho": {
            "value": 1000,
            "unit": "kg/m^3",
            "label": "Fluid Density",
            "min": 0,
            "exclusiveMin": true
          },
          "mu": {
            "value": 0.001,
            "unit": "Pa·s",
            "label": "Dynamic Viscosity",
            "min": 0,
            "exclusiveMin": true
          },
          "Re_crit": {
            "value": 12,
            "unit": "1",
            "label": "Critical Reynolds Number",
            "min": 0,
            "exclusiveMin": true
          }
        },
        "ports": [
          { "id": "a", "pos": "left", "label": "A", "domain": "isothermal_liquid" },
          { "id": "b", "pos": "right", "label": "B", "domain": "isothermal_liquid" }
        ],
        "equation": "mdot = Cd*A*sqrt(2*rho)*dp/(dp^2 + dp_crit^2)^(1/4),  dp = p_A - p_B,  dp_crit = pi*Re_crit^2*mu^2/(8*rho*Cd^2*A)  (= Cd*A*sqrt(2*rho*|dp|)*sign(dp) for |dp| >> dp_crit)",
        "description": "Hydraulic orifice (Simscape Isothermal Liquid Local Restriction): Bernoulli flow with the smooth laminar / turbulent transition at the critical Reynolds number, finite slope at dp = 0. A = 0 closes the restriction. mdot is positive from A to B; defaults are water at 20 degC."
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

