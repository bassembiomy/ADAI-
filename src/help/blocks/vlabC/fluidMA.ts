import type { BlockHelpEntry } from '../../types';
import { SIM_DAE, EMB_NONE, acausal, placeSteps } from './common';

const MA = 'Moist air (Fluid domain): across = pressure [Pa], through = mass flow [kg/s]';
const MA_INERT =
  ' Implementation note: in the current DAE assembler this block is wired as an interface only. ' +
  'Its equation function expects through-variables and an output signal, but the assembler allocates no branch or state variable for it, ' +
  'so it adds no equation to the system and does not change the solution of a connected network.';

export const FLUID_MA: Record<string, BlockHelpEntry> = {
  ma_ref: {
    id: 'ma_ref',
    summary: 'Absolute reference node of a moist-air network; pins the connected node to zero pressure.',
    description:
      'Absolute Reference (MA) is the ground symbol of the Moist Air (MA) library. Every moist-air network needs at least one ' +
      'reference, otherwise pressures are only defined up to a constant and the Jacobian is singular. The block has a single port G. ' +
      'The assembler recognises the block type "ma_ref" as a reference component: the across variable of the node it is wired to ' +
      'is removed from the Kirchhoff conservation set and replaced by the constraint x = 0. Pressures in the network are therefore ' +
      'expressed relative to this reference (gauge-like), unlike Fluid Ground (Atm) of the Fluid / Steam library which pins the node to 101325 Pa.',
    shape:
      'A small vertical stem ending on a three-line ground hatch (long, medium and short bars, drawn at 50% opacity) with a filled water-drop glyph at the top of the stem. The single port G sits at the bottom edge of the block; the drop is purely decorative.',
    ports: [
      { id: 'g', description: 'Reference port. Wire it to any moist-air port (pressure node) that should be the zero-pressure datum. Across variable is pinned to 0 Pa; the through variable absorbed by the reference is not constrained.' },
    ],
    params: [],
    algorithm: 'p_G = 0   (reference constraint on the node; no component equation, no branch or state variable)',
    usage: [
      'Drag "Absolute Reference (MA)" from the Fluid palette group onto the canvas.',
      'Draw a wire from its G port (bottom) to the port of the chamber, pipe or source whose node should be the pressure datum.',
      'Place exactly one reference per connected moist-air network; two references on the same node are harmless, on different nodes of one network they over-constrain it.',
      'Run the simulation; all other pressures in the network are solved relative to this node.',
    ],
    characteristics: acausal(MA, 'none', 'no parameters'),
    simulationExecution:
      SIM_DAE + ' For this block the assembler adds the reference equation x_node = 0 in place of the Kirchhoff sum for the node it touches.',
    embeddedExecution: EMB_NONE,
    tips: [
      'Gauge-style zero: a Pressure Source (MA) of P = 150 Pa then raises the downstream node to 150 Pa above this datum.',
      'For absolute atmospheric pressure (101325 Pa) use Fluid Ground (Atm) from the Fluid / Steam group instead.',
    ],
    seeAlso: ['ma_chamber', 'ma_pipe', 'ma_pressure_source', 'fluid_ref'],
  },

  ma_chamber: {
    id: 'ma_chamber',
    summary: 'Constant-volume moist-air chamber with a lumped thermal mass exchanging heat through its thermal port H.',
    description:
      'Represents a rigid volume of moist air connected to the network through two pneumatic ports A and B and to a thermal network through port H. ' +
      'The thermal side is modelled as one differential state, the air temperature T, with heat capacity C = rho*cp*V (rho = 1.2 kg/m^3, cp = 1005 J/(kg*K) are fixed in the equation) and a loss to a fixed 298.15 K ambient with coefficient k_loss = 8.5 W/K. ' +
      'The thermal port H is held at the chamber temperature. The library documentation quotes dP/dt = (R*T/V)*(mdot_in - mdot_out); in the current implementation the pneumatic side is simplified: the mass-flow branch at port A is constrained to zero and port B carries no through variable, so the chamber behaves as a dead-end pressure node plus a heat-storing thermal mass.',
    shape:
      'A rounded square box with a small filled water-drop in the upper-left quadrant, and two faint dashed stubs running up from the top edge and down from the bottom edge. Ports A and B are both on the top edge; the thermal port H (Thermal domain) is on the left edge.',
    ports: [
      { id: 'a', description: 'Pneumatic port A (Fluid domain, pressure [Pa] across, mass flow [kg/s] through). Mass flow into the chamber at A is constrained to 0 in the current model.' },
      { id: 'b', description: 'Pneumatic port B (Fluid domain). Takes part in no equation of the block; it only exposes the same kind of pressure node.' },
      { id: 'h', description: 'Thermal port H (Thermal domain, temperature [K] across, heat flow [W] through). Its temperature equals the chamber air temperature; heat flowing in from the network heats the chamber.' },
    ],
    params: [
      { key: 'V', description: 'Chamber volume in m^3. It scales the heat capacity C = 1.2 * 1005 * V of the air in the chamber.', range: '> 0 (default 0.1 m^3)' },
    ],
    algorithm:
      'C = rho * cp * V           (rho = 1.2 kg/m^3, cp = 1005 J/(kg*K))\n' +
      'Q_loss = k_loss * (T - T_amb)   (k_loss = 8.5 W/K, T_amb = 298.15 K)\n' +
      'mdot_A = 0\n' +
      'T_H = T\n' +
      'C * dT/dt = Q_into_H - Q_loss\n' +
      'Library reference form: dP/dt = (R*T/V) * (mdot_in - mdot_out)',
    usage: placeSteps('Constant Volume Chamber (MA)', 'Fluid', [
      'Double-click the block (or select it) and set V in the parameters panel, in m^3.',
      'Wire port A (and optionally B) to the moist-air network, and port H to a thermal heat source such as Heat Source or an Upper Radiant Heater.',
      'Add an Absolute Reference (MA) to the moist-air network and a Temperature Sensor or Scope on the thermal side to observe T.',
    ]),
    characteristics: acausal(MA + '; thermal port: temperature [K], heat flow [W]', '1 continuous (air temperature)'),
    simulationExecution:
      SIM_DAE + ' The chamber contributes three residuals: the A-port mass-flow branch (set to 0), the heat-flow branch at H (C*dT/dt + loss) and the temperature state (T_H - T). The temperature state starts at 293.15 K.',
    embeddedExecution: EMB_NONE,
    tips: ['Use a larger V to slow the temperature response of the chamber.', 'The 8.5 W/K ambient loss is built into the equation and is not a block parameter.'],
    seeAlso: ['ma_pipe', 'ma_ref', 'ma_pressure_source', 'thermal_mass'],
  },

  ma_pipe: {
    id: 'ma_pipe',
    summary: 'Moist-air pipe segment relating pressure drop to mass flow between ports A and B.',
    description:
      'Connects two moist-air nodes through a flow resistance. The library documents a Darcy-type drop dP = f(L, D, Re) * rho*v^2/2 plus heat transfer to the wall. ' +
      'In the current implementation the pipe is a linear resistance: p_B - p_A = f * mdot, where f is read from the parameter key "resistance" (default 1.0 Pa*s/kg). ' +
      'The declared parameter L (length) and the ports H (thermal) and WD are stored on the block but not used by the residual, so changing L does not currently change the result.',
    shape:
      'A small rounded rectangle in the middle of a horizontal line, with a filled water-drop inside it and a short red tick hanging below it. Ports: A on the left, B on the right, H (Thermal domain) on the top, WD on the bottom.',
    ports: [
      { id: 'a', description: 'Moist-air inlet/outlet A on the left edge (pressure [Pa] across, mass flow [kg/s] through).' },
      { id: 'b', description: 'Moist-air inlet/outlet B on the right edge (pressure [Pa] across, mass flow [kg/s] through).' },
      { id: 'h', description: 'Thermal port H on the top edge for wall heat exchange (temperature [K], heat flow [W]). Not referenced by the current residual.' },
      { id: 'wd', description: 'Wall-data port WD on the bottom edge (Fluid-domain node). Not referenced by the current residual.' },
    ],
    params: [
      { key: 'L', description: 'Pipe length in m. Declared for the Darcy friction model; the present linear residual does not read it.', range: '> 0 (default 2 m)' },
    ],
    algorithm:
      'p_B - p_A = f * mdot     (f = parameter "resistance", default 1.0 Pa*s/kg)\n' +
      'Library reference form: dP = f(L, D, Re) * rho * v^2 / 2',
    usage: placeSteps('Pipe (MA)', 'Fluid', [
      'Wire port A to the upstream moist-air node and port B to the downstream node.',
      'Leave H and WD unconnected unless you want to see the thermal/wall nodes; unconnected thermal ports are treated as ambient reference.',
      'Select the block and set L (m) in the parameters panel. Add a Flow Rate Sensor (MA) or Scope to inspect the flow.',
    ]),
    characteristics: acausal(MA, 'none'),
    simulationExecution: SIM_DAE + ' The pipe allocates one mass-flow branch (A to B) and contributes one residual: p_B - p_A - f*mdot.',
    embeddedExecution: EMB_NONE,
    seeAlso: ['ma_chamber', 'ma_pressure_source', 'ma_flow_source', 'ma_flow_sensor'],
  },

  ma_separator: {
    id: 'ma_separator',
    summary: 'Moisture separator: lets moist air pass from A to B while a fraction of the water is drawn off at W and D.',
    description:
      'Intended to remove liquid water from a moist-air stream with an efficiency parameter between 0 and 1: the dried stream leaves at B, separated water at W and drain D. ' +
      'In the current implementation the block is a lossless pass-through: it allocates a single through variable between A and B and contributes the equation p_A = p_B, so no moisture is removed and the efficiency parameter is not read. ' +
      'Ports W and D are Fluid-domain nodes that carry no through variable.',
    shape:
      'A rounded square box with a small curved water-line mark in the upper-left, a dashed horizontal line across the lower third and a filled water-drop below it. Ports: A on the left, B on the right, W and D both on the top edge.',
    ports: [
      { id: 'a', description: 'Moist-air inlet on the left edge (pressure [Pa], mass flow [kg/s]).' },
      { id: 'b', description: 'Dried moist-air outlet on the right edge; held at the same pressure as A in the current model.' },
      { id: 'w', description: 'Separated-water port on the top edge. Carries no through variable in the current model.' },
      { id: 'd', description: 'Drain port on the top edge. Carries no through variable in the current model.' },
    ],
    params: [
      { key: 'efficiency', description: 'Fraction of the liquid water removed from the stream (dimensionless). Declared by the library; not read by the present residual.', range: '0 to 1 (default 0.9)' },
    ],
    algorithm: 'p_A - p_B = 0\nmdot_A = mdot_B  (single through variable)\nLibrary intent: m_water_removed = efficiency * m_water_in',
    usage: placeSteps('Moisture Separator (MA)', 'Fluid', [
      'Insert the block in series in the moist-air line: A to the upstream node, B to the downstream node.',
      'Set efficiency in the parameters panel (0 to 1).',
      'Leave W and D unconnected, or wire them to the nodes where you want separated water to be observed.',
    ]),
    characteristics: acausal(MA, 'none'),
    simulationExecution: SIM_DAE + ' The block adds one A-to-B through variable and one residual (p_A - p_B = 0).',
    embeddedExecution: EMB_NONE,
    seeAlso: ['ma_pipe', 'ma_moisture_sensor', 'ma_moisture_source'],
  },

  ma_rot_conv: {
    id: 'ma_rot_conv',
    summary: 'Interface between a moist-air stream and a rotational mechanical shaft (R, C) for fans and compressors.',
    description:
      'Intended as a displacement-type converter: shaft speed times displacement D [m^3/rad] gives volumetric flow between the pneumatic ports, with the thermal port H carrying the energy exchange. ' +
      'The current implementation is a placeholder coupling: it allocates one torque branch between R and C and constrains it with torque = (5 + 0.1*|x_A|) * (x_H - x_R), where x_A, x_H, x_R are the across values at ports A, H and R. ' +
      'The parameter D is declared but not read, so this block should not be used for quantitative fan or compressor work until the displacement equation is implemented.',
    shape:
      'Left: a circle containing the Greek letter omega. Right: a small rounded rectangle joined to it by a dashed link. Ports: A and H on the left edge, R and C on the right edge, WD on the bottom edge.',
    ports: [
      { id: 'a', description: 'Moist-air port A on the left edge (pressure [Pa], mass flow [kg/s]).' },
      { id: 'h', description: 'Heat port H on the left edge (declared in the Fluid domain in this block).' },
      { id: 'r', description: 'Rotational shaft port R on the right edge (angular velocity [rad/s] across, torque [N*m] through).' },
      { id: 'c', description: 'Rotational case/reference port C on the right edge; the torque branch runs from R to C.' },
      { id: 'wd', description: 'Wall-data port on the bottom edge. Not referenced by the current residual.' },
    ],
    params: [
      { key: 'D', description: 'Volumetric displacement per radian in m^3/rad. Declared for flow = D*omega; not read by the present residual.', range: '> 0 (default 0.001 m^3/rad)' },
    ],
    algorithm:
      'h = 5 + 0.1 * |x_A|\n' +
      'torque_RC = h * (x_H - x_R)\n' +
      'Library intent: Q_vol = D * omega,  tau = D * (p_B - p_A)',
    usage: placeSteps('Rotational Mechanical Converter (MA)', 'Fluid', [
      'Wire A to a moist-air node, R to a rotational source or inertia and C to Mechanical Rotational Reference.',
      'Set D in m^3/rad in the parameters panel.',
      'Because the coupling is a placeholder, validate results against a hand calculation before relying on them.',
    ]),
    characteristics: acausal('Moist air (Fluid) coupled to Rotational mechanics: torque [N*m], speed [rad/s]', 'none'),
    simulationExecution: SIM_DAE + ' The block allocates one torque branch (R to C) with one residual.',
    embeddedExecution: EMB_NONE,
    seeAlso: ['ma_trans_conv', 'ma_pressure_source', 'ma_chamber'],
  },

  ma_trans_conv: {
    id: 'ma_trans_conv',
    summary: 'Interface between a moist-air stream and a translational mechanical port (piston), with a thermal port.',
    description:
      'Intended as a piston converter: velocity times piston area A gives volumetric flow, and pressure times area gives force. ' +
      'The current implementation is a placeholder coupling like the rotational converter: it allocates one force branch between R and C and constrains it with value = (5 + 0.1*|x_A|) * (x_H - x_R) using the across values of ports A, H and R. ' +
      'Parameter A (area) is declared but not read by the residual.',
    shape:
      'Two small rounded rectangles side by side joined by a dashed link; the left one is labelled v and the right one F. Ports: A and H (Thermal domain) on the left edge, R and C (Translational domain) on the right edge, WD on the bottom edge.',
    ports: [
      { id: 'a', description: 'Moist-air port A on the left edge (pressure [Pa], mass flow [kg/s]).' },
      { id: 'h', description: 'Thermal port H on the left edge (temperature [K], heat flow [W]).' },
      { id: 'r', description: 'Translational port R on the right edge (velocity [m/s] across, force [N] through).' },
      { id: 'c', description: 'Translational reference/case port C on the right edge; the force branch runs from R to C.' },
      { id: 'wd', description: 'Wall-data port on the bottom edge. Not referenced by the current residual.' },
    ],
    params: [
      { key: 'A', description: 'Effective piston area in m^2. Declared for flow = A*v and force = A*dp; not read by the present residual.', range: '> 0 (default 0.01 m^2)' },
    ],
    algorithm:
      'h = 5 + 0.1 * |x_A|\n' +
      'force_RC = h * (x_H - x_R)\n' +
      'Library intent: Q_vol = A * v,  F = A * (p_B - p_A)',
    usage: placeSteps('Translational Mechanical Converter (MA)', 'Fluid', [
      'Wire A to the moist-air node, R to a translational mass or source and C to Mechanical Translational Reference.',
      'Optionally wire H to a thermal node; unconnected thermal ports are treated as ambient.',
      'Set A (m^2) in the parameters panel.',
    ]),
    characteristics: acausal('Moist air (Fluid) coupled to Translational mechanics: force [N], velocity [m/s]', 'none'),
    simulationExecution: SIM_DAE + ' The block allocates one force branch (R to C) with one residual.',
    embeddedExecution: EMB_NONE,
    seeAlso: ['ma_rot_conv', 'ma_chamber', 'ma_pressure_source'],
  },

  ma_flow_sensor: {
    id: 'ma_flow_sensor',
    summary: 'Ideal moist-air flow-rate sensor inserted in series between A and B with an output port M.',
    description:
      'An ideal sensor has zero pressure drop and passes the through-flow unchanged. The block is placed in series: A and B are held at equal pressure (p_A - p_B = 0) and the through variable between them is the measured mass flow. ' +
      'The measurement output M is declared in the Fluid domain on the top edge; in the current assembler no separate signal branch is allocated for it, so M does not yet publish a computed physical-signal value. Use Flow Sensor from the Fluid / Steam library when a scope signal is required.',
    shape:
      'A rounded square with a circle inside and a small lens/loop mark in the circle indicating flow. Ports: A on the left, B on the right, M on the top edge.',
    ports: [
      { id: 'a', description: 'Moist-air port A on the left edge (pressure [Pa], mass flow [kg/s]).' },
      { id: 'b', description: 'Moist-air port B on the right edge; held at the same pressure as A.' },
      { id: 'm', description: 'Measurement output M on the top edge (intended: mass flow [kg/s]). Not driven by a signal branch in the current model.' },
    ],
    params: [],
    algorithm: 'p_A - p_B = 0\nM = mdot_AB   (intended output)',
    usage: placeSteps('Flow Rate Sensor (MA)', 'Fluid', [
      'Insert the sensor in series: upstream node to A, downstream node to B.',
      'Connect M to a Scope input if you want to display it (see the implementation note in the description).',
      'It has no parameters.',
    ]),
    characteristics: acausal(MA, 'none', 'output M declared as measurement'),
    simulationExecution: SIM_DAE + ' The block allocates one A-to-B through variable and contributes the residual p_A - p_B = 0.',
    embeddedExecution: EMB_NONE,
    seeAlso: ['flow_sensor', 'ma_pipe', 'ma_pt_sensor'],
  },

  ma_selector: {
    id: 'ma_selector',
    summary: 'Measurement selector that splits a moist-air measurement bus F into temperature T, pressure P and moisture W outputs.',
    description:
      'The Measurement Selector is meant to demultiplex a composite moist-air measurement (flow bundle F) into three scalar signals: temperature T, pressure P and moisture/humidity W. ' +
      'In the current model the ports are declared in the Fluid domain and the equation function relates the first two ports, but the assembler allocates no branch or state variable for this block, so it adds no equation to the system.' +
      ' It serves as a placeholder interface for the measurement bundle.',
    shape:
      'A tall narrow rounded rectangle with three faint horizontal lines and the letter S in the centre. Input port F on the left edge; output ports T, P and W stacked on the right edge.',
    ports: [
      { id: 'in', description: 'Measurement input F on the left edge: the moist-air measurement bundle to be split.' },
      { id: 't', description: 'Temperature output T on the right edge (intended unit K).' },
      { id: 'p', description: 'Pressure output P on the right edge (intended unit Pa).' },
      { id: 'w', description: 'Moisture output W on the right edge (intended: humidity ratio or relative humidity, dimensionless).' },
    ],
    params: [],
    algorithm: 'T, P, W = select(F)   (intended)\nNo residual is allocated in the current assembler.',
    usage: placeSteps('Measurement Selector (MA)', 'Fluid', [
      'Wire the measurement source (for example a Pressure & Temperature Sensor) to port F.',
      'Wire T, P and W to Scope inputs or downstream signal blocks.',
      'Treat as an interface block until the selector equations are implemented.',
    ]),
    characteristics: acausal('Moist air measurement signals (Fluid domain ports)', 'none'),
    simulationExecution: SIM_DAE + MA_INERT,
    embeddedExecution: EMB_NONE,
    seeAlso: ['ma_pt_sensor', 'ma_moisture_sensor', 'ma_thermo_sensor'],
  },

  ma_moisture_sensor: {
    id: 'ma_moisture_sensor',
    summary: 'Moisture and trace-gas sensor for a moist-air node; reports water-vapour content on output W.',
    description:
      'Measures the moisture content of the moist air at the node it is attached to and reports it on port W. The equation function is a constant stub that returns 0.5 (50 percent), and, because the assembler allocates no branch variable for the block, it does not influence the simulation. ' +
      'Use it as a labelled measurement point; do not rely on its output value yet.',
    shape:
      'A rounded square containing a circle with a small filled water-drop at its centre (palette glyph), drawn on the canvas as a "%" with the sub-label MOIST. Port A (moist-air measurement point) on the left edge and port W (moisture output) on the right edge.',
    ports: [
      { id: 'a', description: 'Moist-air measurement port A on the left edge (pressure [Pa], mass flow [kg/s]); a sensor draws no flow.' },
      { id: 'w', description: 'Moisture output W on the right edge (intended dimensionless relative humidity or humidity ratio).' },
    ],
    params: [],
    algorithm: 'W = RH(P_vapor, P_sat(T))   (intended)\nequation stub returns W = 0.5',
    usage: placeSteps('Moisture & Trace Gas Sensor (MA)', 'Fluid', [
      'Wire port A to the moist-air node to be observed.',
      'Wire W to a Scope input.',
      'It has no parameters.',
    ]),
    characteristics: acausal(MA, 'none', 'output W as measurement'),
    simulationExecution: SIM_DAE + MA_INERT,
    embeddedExecution: EMB_NONE,
    seeAlso: ['ma_pt_sensor', 'ma_thermo_sensor', 'ma_moisture_source'],
  },

  ma_pt_sensor: {
    id: 'ma_pt_sensor',
    summary: 'Pressure and temperature sensor for a moist-air node with output Pa.',
    description:
      'Measures pressure and temperature of the moist air at the node it is attached to. The equation function maps the across values of its two ports to two output signals (default 101325 Pa and 293.15 K), but the assembler allocates no branch variable for the block, so it contributes no equation and does not affect the network. ' +
      'It acts as a labelled measurement point and a placeholder for a full psychrometric sensor.',
    shape:
      'A rounded square with an inner circle, an arrow pointing right inside it and the text "P/T" above the circle. Port A on the left edge, output Pa on the right edge.',
    ports: [
      { id: 'a', description: 'Moist-air measurement port A on the left edge (pressure [Pa] across).' },
      { id: 'p', description: 'Output port labelled Pa on the right edge: pressure measurement signal (intended unit Pa).' },
    ],
    params: [],
    algorithm: 'P_out = p_A ; T_out = T_A   (intended)\nstub defaults: P = 101325 Pa, T = 293.15 K',
    usage: placeSteps('Pressure & Temperature Sensor (MA)', 'Fluid', [
      'Wire port A to the moist-air node to be observed.',
      'Wire port Pa to a Scope input.',
      'It has no parameters.',
    ]),
    characteristics: acausal(MA, 'none', 'output as measurement'),
    simulationExecution: SIM_DAE + MA_INERT,
    embeddedExecution: EMB_NONE,
    seeAlso: ['pressure_sensor', 'ma_thermo_sensor', 'ma_selector'],
  },

  ma_thermo_sensor: {
    id: 'ma_thermo_sensor',
    summary: 'Thermodynamic properties sensor for moist air; outputs density rho on port rho.',
    description:
      'Reports derived thermodynamic properties of the moist air (here the density) for the node it is attached to. The equation function is a constant stub (1000) and the assembler allocates no branch variable for the block, so it has no effect on the simulation today. ' +
      'It is retained as a measurement placeholder so that models can be annotated and later wired to a real property evaluation.',
    shape:
      'A square-ish glyph labelled "T°" with the sub-label SENSOR. Port A on the left edge and the density output (labelled with the Greek letter rho) on the right edge.',
    ports: [
      { id: 'a', description: 'Moist-air measurement port A on the left edge (pressure [Pa], mass flow [kg/s]).' },
      { id: 'rho', description: 'Density output on the right edge (intended unit kg/m^3).' },
    ],
    params: [],
    algorithm: 'rho = P / (R_mix * T)   (intended)\nequation stub returns 1000',
    usage: placeSteps('Thermodynamic Properties Sensor (MA)', 'Fluid', [
      'Wire port A to the moist-air node to be observed.',
      'Wire the rho port to a Scope input.',
      'It has no parameters.',
    ]),
    characteristics: acausal(MA, 'none', 'output rho as measurement'),
    simulationExecution: SIM_DAE + MA_INERT,
    embeddedExecution: EMB_NONE,
    seeAlso: ['ma_pt_sensor', 'ma_moisture_sensor', 'ma_properties'],
  },

  ma_moisture_source: {
    id: 'ma_moisture_source',
    summary: 'Ideal source injecting a prescribed moisture mass flow into a moist-air node.',
    description:
      'Adds water vapour to the node connected to port A at a constant mass flow. The block allocates one mass-flow branch at A and fixes it with branch = S, where S is read from the parameter key "flow" (default 0.01 kg/s). ' +
      'The library parameter is named "rate" (default 0.01 kg/s); the present residual does not read that key, so the effective rate is the 0.01 kg/s default regardless of the value entered. The control port S is declared but unused. ' +
      'The mass-flow branch enters the block at A (sign -1 in the node balance), so a positive rate is booked as leaving node A; confirm the direction with a flow sensor.',
    shape:
      'A circle with a small filled water-drop above its centre and a dashed vertical line through it; the canvas glyph reads "%" with the sub-label SRC. Port A on the bottom edge, control port S (Physical signal) on the top edge.',
    ports: [
      { id: 'a', description: 'Moist-air port A on the bottom edge (pressure [Pa] across, mass flow [kg/s] through).' },
      { id: 's', description: 'Physical-signal control port S on the top edge (intended modulation of the rate). Not read by the present residual.' },
    ],
    params: [
      { key: 'rate', description: 'Moisture mass flow in kg/s (library default 0.01). The residual currently reads the key "flow", not "rate", so this value is stored but not applied.', range: '>= 0 (default 0.01 kg/s)' },
    ],
    algorithm: 'mdot_A = S   with S = 0.01 kg/s (key "flow")\nLibrary intent: mdot_A = rate * s',
    usage: placeSteps('Moisture Source (MA)', 'Fluid', [
      'Wire port A to the moist-air node that receives the moisture.',
      'Set rate in kg/s in the parameters panel (see the implementation note on the key).',
      'Optionally drive S from a PS Constant or PS Step block.',
    ]),
    characteristics: acausal(MA, 'none', 'control input S is a Physical signal'),
    simulationExecution: SIM_DAE + ' The block allocates one mass-flow branch at A and contributes the residual mdot - S.',
    embeddedExecution: EMB_NONE,
    seeAlso: ['ma_flow_source', 'ma_moisture_sensor', 'ma_chamber'],
  },

  ma_flow_source: {
    id: 'ma_flow_source',
    summary: 'Ideal moist-air mass-flow source forcing a prescribed mass flow from A to B.',
    description:
      'Imposes a constant mass flow between ports A and B irrespective of the pressure difference. One mass-flow branch (A to B) is allocated and fixed with branch = S, where S is read from the key "flow" (default 0.01 kg/s). ' +
      'The library parameter is named "rate" (default 0.1 kg/s) and is not read by the present residual, so the effective flow is 0.01 kg/s. The control port S is declared but unused.',
    shape:
      'A circle with a right-pointing arrow in the centre and the letter M above it (canvas glyph: "MA" with sub-label FLOW); short leads extend left and right. Ports: A on the left, B on the right, S (Physical signal) on the top edge.',
    ports: [
      { id: 'a', description: 'Moist-air inlet A on the left edge (pressure [Pa], mass flow [kg/s]).' },
      { id: 'b', description: 'Moist-air outlet B on the right edge.' },
      { id: 's', description: 'Physical-signal control port S on the top edge. Not read by the present residual.' },
    ],
    params: [
      { key: 'rate', description: 'Mass flow rate in kg/s (library default 0.1). The residual reads the key "flow" (0.01 kg/s default), so this value is stored but not applied.', range: '>= 0' },
    ],
    algorithm: 'mdot_AB = S   with S = 0.01 kg/s (key "flow")\np_B - p_A is free (determined by the network)',
    usage: placeSteps('Flow Rate Source (MA)', 'Fluid', [
      'Connect A to the upstream node and B to the downstream node.',
      'Set rate in kg/s in the parameters panel (see the implementation note).',
      'Make sure the network contains an Absolute Reference (MA) so the pressure level is defined.',
    ]),
    characteristics: acausal(MA, 'none', 'control input S is a Physical signal'),
    simulationExecution: SIM_DAE + ' The block allocates one A-to-B mass-flow branch and contributes the residual mdot - S.',
    embeddedExecution: EMB_NONE,
    seeAlso: ['ma_pressure_source', 'ma_pipe', 'ma_moisture_source'],
  },

  ma_pressure_source: {
    id: 'ma_pressure_source',
    summary: 'Ideal moist-air pressure source that raises pressure from A to B by P times a control signal.',
    description:
      'Forces a pressure difference across its ports: p_B - p_A = P * s, where P is the parameter (in Pa) and s is the optional Physical-signal input at port S. ' +
      'When S is not connected the multiplier defaults to 1, so the source delivers exactly P. The through flow (mass flow A to B) is determined by the rest of the network. ' +
      'Use it as a fan, blower or compressor stand-in in air circuits such as the air-fryer and blender examples.',
    shape:
      'A circle with a right-pointing arrow and the letter P above it; short leads left and right. Ports: A on the left, B on the right (both Fluid domain), S (Physical signal) on the top edge.',
    ports: [
      { id: 'a', description: 'Suction side A on the left edge (Fluid domain, pressure [Pa] across, mass flow [kg/s] through).' },
      { id: 'b', description: 'Discharge side B on the right edge; p_B equals p_A plus P times the control signal.' },
      { id: 's', description: 'Physical-signal control input S on the top edge (dimensionless multiplier of P; 1 if left unconnected).' },
    ],
    params: [
      { key: 'P', description: 'Pressure rise delivered when the control signal equals 1, in Pa.', range: 'any real number (default 100000 Pa)' },
    ],
    algorithm: 'p_B - p_A = P * s      (s = 1 if S unconnected)\nmdot_AB determined by the network (through variable)',
    usage: placeSteps('Pressure Source (MA)', 'Fluid', [
      'Wire A to the low-pressure node and B to the high-pressure node of the circuit.',
      'Set P in Pa in the parameters panel.',
      'To modulate the source, wire a PS Constant, PS Step or controller output to port S.',
      'Add an Absolute Reference (MA) so that the pressure level is defined.',
    ]),
    characteristics: acausal(MA, 'none', 'control input S is a Physical signal'),
    simulationExecution: SIM_DAE + ' The block allocates one A-to-B mass-flow branch and contributes the residual (p_B - p_A) - P*s.',
    embeddedExecution: EMB_NONE,
    tips: ['With s = 0 the block behaves as a short circuit between A and B.'],
    seeAlso: ['ma_flow_source', 'ma_pipe', 'ma_chamber', 'ma_ref'],
  },

  ma_properties: {
    id: 'ma_properties',
    summary: 'Moist Air Properties block defining the psychrometric reference conditions of a moist-air network.',
    description:
      'A configuration block with no ports. It stores the standard pressure P_std and standard temperature T_std used as the reference state for moist-air properties and documents the psychrometric relations P_total = P_dry + P_vapor and RH = P_vapor / P_sat(T). ' +
      'The block has no equation in the assembler and is not read by any other block\'s residual, so it does not change the numerical solution; it is a documentation and parameter-holder block, similar in role to the Solver Configuration block.',
    shape:
      'A small rounded rectangle (60 by 40 px) with a faint fill containing two filled water-drop glyphs, one upper-left and one lower-right. It has no ports.',
    ports: [],
    params: [
      { key: 'P_std', description: 'Standard (reference) pressure of the moist-air network in Pa.', range: '> 0 (default 101325 Pa)' },
      { key: 'T_std', description: 'Standard (reference) temperature of the moist-air network in K.', range: '> 0 (default 293.15 K)' },
    ],
    algorithm: 'P_total = P_dry + P_vapor\nRH = P_vapor / P_sat(T)',
    usage: placeSteps('Moist Air Properties (MA)', 'Fluid', [
      'Place one block anywhere on the canvas near the moist-air network; it needs no wires.',
      'Select it and set P_std (Pa) and T_std (K) in the parameters panel.',
      'Keep one block per diagram so the reference conditions are unambiguous.',
    ]),
    characteristics: acausal('Moist air (Fluid domain), no ports', 'none', 'configuration block'),
    simulationExecution:
      SIM_DAE + ' This block has no ports, branches or states; the assembler instantiates it but it contributes no residual.',
    embeddedExecution: EMB_NONE,
    seeAlso: ['ma_chamber', 'ma_pt_sensor', 'solver_config'],
  },
};
