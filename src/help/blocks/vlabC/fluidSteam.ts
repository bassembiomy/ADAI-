import type { BlockHelpEntry } from '../../types';
import { SIM_DAE, EMB_NONE, acausal, placeSteps } from './common';

const FS = 'Fluid / Steam (across = absolute pressure [Pa], through = mass flow [kg/s])';
const FS_SIG = FS + '; sensor/control ports are Physical signals';
const FS_NOTE =
  ' Pressures are absolute: include Fluid Ground (Atm) (101325 Pa) or a Pressure Source so that the pressure level is defined. ' +
  'The automatic "unconnected port is atmosphere" rule of the assembler applies to the Fluid, Gas and Thermal domains only, so unconnected Fluid / Steam ports are left free.';

export const FLUID_STEAM: Record<string, BlockHelpEntry> = {
  fluid_ref: {
    id: 'fluid_ref',
    summary: 'Fluid Ground (Atm): reference node pinned to atmospheric pressure, 101325 Pa.',
    description:
      'The ground symbol of the Fluid / Steam library. The node it is wired to is removed from the mass-conservation set and fixed at 101325 Pa (1 atm absolute). ' +
      'Any mass flow needed to hold that pressure is supplied by the reference. Use one Fluid Ground per connected pressure network as the pressure datum, for example at the open end of a nozzle, a vented tank or the pump suction.',
    shape:
      'On the canvas a square glyph with the text REF and the sub-label FLUID (palette icon: a minus sign). The single pressure port P is on the bottom edge.',
    ports: [
      { id: 'p', description: 'Reference pressure port on the bottom edge. Across variable is fixed to 101325 Pa; the absorbed mass flow is unconstrained.' },
    ],
    params: [],
    algorithm: 'p = 101325 Pa     (reference constraint; replaces the mass-balance equation of the node)',
    usage: placeSteps('Fluid Ground (Atm)', 'Fluid / Steam', [
      'Wire port P to the node that should sit at atmospheric pressure (for example the outlet side of a nozzle or the low-pressure side of a pump).',
      'Use one ground per connected network; more than one on separate nodes pin each of them to 101325 Pa.',
      'The block has no parameters.',
    ]),
    characteristics: acausal(FS, 'none', 'no parameters'),
    simulationExecution: SIM_DAE + ' For this block the assembler adds the reference equation x_node = 101325 in place of the mass-flow balance of the node it touches.',
    embeddedExecution: EMB_NONE,
    seeAlso: ['pressure_source', 'fluid_resistance', 'steam_nozzle', 'hydraulic_reference_il'],
  },

  fluid_resistance: {
    id: 'fluid_resistance',
    summary: 'Linear fluid resistance: pressure drop proportional to mass flow.',
    description:
      'The hydraulic analogue of a resistor. The pressure drop from port In to port Out is dp = Rf * mdot, where mdot is the mass flow in kg/s from In to Out. It dissipates energy, has no storage and is the simplest way to model friction in a line. ' +
      'For a flow-dependent restriction use Orifice, which is quadratic in flow.' + FS_NOTE,
    shape:
      'A small rounded rectangle on a horizontal line with the letter F inside. Port In (p) on the left edge and port Out (n) on the right edge.',
    ports: [
      { id: 'p', description: 'Inlet port labelled In on the left edge (absolute pressure [Pa], mass flow [kg/s]).' },
      { id: 'n', description: 'Outlet port labelled Out on the right edge.' },
    ],
    params: [
      { key: 'Rf', description: 'Fluid resistance in Pa*s/kg (pressure drop per unit mass flow).', range: '> 0 (default 100000)' },
    ],
    algorithm: 'p_In - p_Out = Rf * mdot',
    usage: placeSteps('Fluid Resistance', 'Fluid / Steam', [
      'Wire In to the upstream node and Out to the downstream node.',
      'Set Rf in Pa*s/kg in the parameters panel.',
      'Add Fluid Ground (Atm) and a Pressure Source or Mass Flow Source to drive the line.',
    ]),
    characteristics: acausal(FS, 'none'),
    simulationExecution: SIM_DAE + ' The block allocates one mass-flow branch (In to Out) and contributes the residual (p_In - p_Out) - Rf*mdot.',
    embeddedExecution: EMB_NONE,
    seeAlso: ['orifice', 'fluid_capacitance', 'fluid_inertance', 'pipe_il'],
  },

  orifice: {
    id: 'orifice',
    summary: 'Sharp-edged orifice: mass flow proportional to the square root of the pressure difference.',
    description:
      'Models a turbulent restriction obeying Bernoulli flow: mdot = Cd*A*sqrt(2*rho*|dp|)*sign(dp), with dp = p_In - p_Out. Flow reverses when the pressure difference reverses. ' +
      'The density rho is a block parameter (default 1.2 kg/m^3 for air-like gases), so set it to the fluid you simulate. The square-root characteristic has infinite slope at dp = 0, which the Newton solver handles but which can slow convergence at very small pressure differences.' + FS_NOTE,
    shape:
      'Two short vertical bars with a gap between them on a horizontal line (the classic orifice plate). Port In on the left edge and Out on the right edge.',
    ports: [
      { id: 'p', description: 'Inlet port In on the left edge (absolute pressure [Pa], mass flow [kg/s]).' },
      { id: 'n', description: 'Outlet port Out on the right edge.' },
    ],
    params: [
      { key: 'Cd', description: 'Discharge coefficient (dimensionless).', range: '0 < Cd <= 1 (default 0.6)' },
      { key: 'A', description: 'Orifice flow area in m^2.', range: '> 0 (default 1e-4 m^2)' },
      { key: 'rho', description: 'Fluid density in kg/m^3.', range: '> 0 (default 1.2 kg/m^3)' },
    ],
    algorithm: 'dp = p_In - p_Out\nmdot = Cd * A * sqrt(2 * rho * |dp|) * sign(dp)',
    usage: placeSteps('Orifice', 'Fluid / Steam', [
      'Wire In to the high-pressure side and Out to the low-pressure side.',
      'Set Cd, A (m^2) and rho (kg/m^3) in the parameters panel.',
      'Add a Pressure Sensor or Flow Sensor and a Scope to read the operating point.',
    ]),
    characteristics: acausal(FS, 'none'),
    simulationExecution: SIM_DAE + ' The block allocates one mass-flow branch and contributes the residual mdot - Cd*A*sqrt(2*rho*|dp|)*sign(dp).',
    embeddedExecution: EMB_NONE,
    seeAlso: ['fluid_resistance', 'restriction_il', 'steam_nozzle', 'check_valve'],
  },

  fluid_capacitance: {
    id: 'fluid_capacitance',
    summary: 'Fluid capacitance: a compliant volume that stores mass in proportion to its pressure.',
    description:
      'A single-port storage element, the analogue of a capacitor to ground. The net mass flow entering the port equals Cf times the rate of change of the node pressure, mdot = Cf*dp/dt, so pressure builds up when more mass flows in than out. ' +
      'Use it to model tank compliance, accumulator volume or pipe elasticity. A line without any capacitance and inertance reacts instantaneously.' + FS_NOTE,
    shape:
      'On the canvas a square glyph with the letter C and the sub-label FLUID (palette icon: a stacked-disc symbol). One port, In (p), on the left edge.',
    ports: [
      { id: 'p', description: 'Single pressure port labelled In on the left edge (absolute pressure [Pa], mass flow [kg/s]).' },
    ],
    params: [
      { key: 'Cf', description: 'Fluid capacitance in kg/Pa (mass stored per unit pressure).', range: '> 0 (default 1e-5 kg/Pa)' },
    ],
    algorithm: 'mdot_in = Cf * dp/dt',
    usage: placeSteps('Fluid Capacitance', 'Fluid / Steam', [
      'Wire port In to the node whose compliance you want to model (for example between a resistance and an orifice).',
      'Set Cf in kg/Pa in the parameters panel.',
      'Observe the pressure with a Pressure Sensor; its time constant is roughly Rf*Cf with the neighbouring resistance.',
    ]),
    characteristics: acausal(FS, '0 explicit states (pressure of the node is the dynamic variable; uses dp/dt from the implicit step)'),
    simulationExecution: SIM_DAE + ' The block allocates one mass-flow branch and its residual uses the time derivative of the node pressure supplied by the implicit integrator.',
    embeddedExecution: EMB_NONE,
    seeAlso: ['fluid_resistance', 'steam_accumulator', 'fluid_inertance'],
  },

  fluid_inertance: {
    id: 'fluid_inertance',
    summary: 'Fluid inertance: pressure difference proportional to the rate of change of mass flow.',
    description:
      'The hydraulic analogue of an inductor. A pressure difference between In and Out accelerates the fluid column: p_In - p_Out = Li * d(mdot)/dt. It models the inertia of the mass of fluid in a long line and produces water-hammer-like oscillations when combined with a capacitance. ' +
      'An auxiliary state variable named mdot is allocated alongside the branch variable; the residual does not use it, the dynamics come from the derivative of the branch flow.' + FS_NOTE,
    shape:
      'On the canvas a square glyph with the letter I and the sub-label FLUID (palette icon: a right arrow). Port In (p) on the left edge and Out (n) on the right edge.',
    ports: [
      { id: 'p', description: 'Inlet port In on the left edge (absolute pressure [Pa], mass flow [kg/s]).' },
      { id: 'n', description: 'Outlet port Out on the right edge.' },
    ],
    params: [
      { key: 'Li', description: 'Fluid inertance in Pa*s^2/kg (equal to length/area for a line).', range: '> 0 (default 100)' },
    ],
    algorithm: 'p_In - p_Out = Li * d(mdot)/dt',
    usage: placeSteps('Fluid Inertance', 'Fluid / Steam', [
      'Insert it in series in the line, In upstream and Out downstream.',
      'Set Li in Pa*s^2/kg in the parameters panel.',
      'Combine with a Fluid Capacitance and a Fluid Resistance to model a damped hydraulic oscillation.',
    ]),
    characteristics: acausal(FS, 'no independent state used (dynamics come from the derivative of the branch mass flow; one auxiliary state variable is allocated but unused)'),
    simulationExecution: SIM_DAE + ' The residual uses the time derivative of the branch mass-flow variable from the implicit step.',
    embeddedExecution: EMB_NONE,
    seeAlso: ['fluid_capacitance', 'fluid_resistance'],
  },

  pressure_source: {
    id: 'pressure_source',
    summary: 'Ideal pressure source that holds its port at an absolute pressure P.',
    description:
      'Imposes the pressure P on the node it is connected to, regardless of the flow drawn. The library describes it as a pressure difference P_out - P_in, but the block has a single port and the implementation fixes the absolute port pressure: p = P. ' +
      'Because it pins a pressure it also serves as the datum of the network, so a separate Fluid Ground is not required on that node. The mass flow supplied is whatever the network demands.' + FS_NOTE,
    shape:
      'On the canvas a square glyph with the text P-SRC (palette icon: a lightning bolt). One port Out (p) on the right edge.',
    ports: [
      { id: 'p', description: 'Pressure output port labelled Out on the right edge; the absolute pressure at this node equals P.' },
    ],
    params: [
      { key: 'P', description: 'Absolute pressure held at the port, in Pa.', range: '> 0 (default 101325 Pa)' },
    ],
    algorithm: 'p_Out = P   (absolute pressure held at the port)',
    usage: placeSteps('Pressure Source', 'Fluid / Steam', [
      'Wire port Out to the start of the line (for example the inlet of a Fluid Resistance).',
      'Set P (absolute, Pa) in the parameters panel; for a gauge pressure of 2 bar enter 301325.',
      'Wire the far end of the line to Fluid Ground (Atm).',
    ]),
    characteristics: acausal(FS, 'none'),
    simulationExecution: SIM_DAE + ' The block allocates one mass-flow branch and contributes the residual p - P = 0.',
    embeddedExecution: EMB_NONE,
    seeAlso: ['ctrl_pressure_source', 'mass_flow_source', 'fluid_ref', 'pump_il'],
  },

  ctrl_pressure_source: {
    id: 'ctrl_pressure_source',
    summary: 'Pressure source whose set-point is meant to be commanded by a control signal at port In.',
    description:
      'Intended as a pressure source driven by a Physical signal: the port pressure follows the commanded value. Implementation status: the residual reads the control value from the third entry of its port list, but the block declares only two ports (Out and In), so that entry is undefined and the source currently holds the default 101325 Pa regardless of the signal wired to In. ' +
      'Use Pressure Source for a fixed value; treat this block as non-functional for modulation until the control index is corrected.' + FS_NOTE,
    shape:
      'On the canvas a square glyph with the text P-SRC and the sub-label CTRL. Output port Out (p) on the right edge and the control signal input In (ctrl, Physical) on the left edge.',
    ports: [
      { id: 'p', description: 'Pressure output port labelled Out on the right edge (absolute pressure [Pa], mass flow [kg/s]).' },
      { id: 'ctrl', description: 'Physical-signal control input labelled In on the left edge: the intended pressure command in Pa.' },
    ],
    params: [],
    algorithm: 'p = P_cmd     (P_cmd = control input; evaluates to 101325 Pa in the current implementation, see the description)',
    usage: placeSteps('Ctrl Pressure Source', 'Fluid / Steam', [
      'Wire Out to the fluid line and the far end of the line to Fluid Ground (Atm).',
      'Wire a signal source (PS Constant, PS Step, controller output) to the In port, scaled in Pa.',
      'Verify the resulting pressure with a Pressure Sensor and a Scope; if it stays at 101325 Pa use Pressure Source instead.',
    ]),
    characteristics: acausal(FS_SIG, 'none', 'control input is a Physical signal'),
    simulationExecution: SIM_DAE + ' The block allocates one mass-flow branch and contributes the residual p - P_cmd = 0.',
    embeddedExecution: EMB_NONE,
    seeAlso: ['pressure_source', 'ps_step', 'ps_constant', 'pressure_sensor'],
  },

  mass_flow_source: {
    id: 'mass_flow_source',
    summary: 'Ideal mass-flow source that forces a constant mass flow mdot through its port.',
    description:
      'Forces the through variable to mdot kg/s, independent of the pressure at the port; the pressure results from the load. The branch is counted with the assembler convention of a through variable entering the block at its port (sign -1 in the node balance of the connected node), so a positive mdot draws mass out of the connected node and a negative value injects it. ' +
      'Verify the direction with a Flow Sensor when building the model. Only a pressure reference or a compliant element at the node makes the pressure well defined.' + FS_NOTE,
    shape:
      'On the canvas a square glyph with the symbol for mdot (m with a dot) followed by -SRC. One port Out (p) on the right edge.',
    ports: [
      { id: 'p', description: 'Flow port labelled Out on the right edge (absolute pressure [Pa] across, mass flow [kg/s] through).' },
    ],
    params: [
      { key: 'mdot', description: 'Imposed mass flow in kg/s.', range: 'any real number (default 0.01 kg/s)' },
    ],
    algorithm: 'branch mass flow = mdot',
    usage: placeSteps('Mass Flow Source', 'Fluid / Steam', [
      'Wire port Out to the node to be fed or drained.',
      'Set mdot in kg/s in the parameters panel.',
      'Terminate the line with Fluid Ground (Atm) through a Fluid Resistance or Orifice so that the pressure is defined.',
    ]),
    characteristics: acausal(FS, 'none'),
    simulationExecution: SIM_DAE + ' The block allocates one mass-flow branch with the residual branch - mdot = 0.',
    embeddedExecution: EMB_NONE,
    seeAlso: ['pressure_source', 'flow_sensor', 'fluid_capacitance'],
  },

  check_valve: {
    id: 'check_valve',
    summary: 'One-way valve that conducts with resistance Rf in the forward direction and blocks reverse flow.',
    description:
      'Passes flow from In to Out when p_In exceeds p_Out and blocks the reverse direction. The mass flow is mdot = g(dp)*dp/Rf with dp = p_In - p_Out, where g = 0.5*(1 + tanh(1000*dp)) is a smooth switch that changes from 0 to 1 within about a millipascal of dp = 0, so no zero-crossing event is needed. ' +
      'The library text mentions a cracking pressure; the implementation has no cracking pressure and the only parameter is the on-resistance Rf.' + FS_NOTE,
    shape:
      'A triangle pointing right on a horizontal line with a vertical bar at its tip (valve symbol). Port In on the left edge and Out on the right edge.',
    ports: [
      { id: 'p', description: 'Inlet port In on the left edge (absolute pressure [Pa], mass flow [kg/s]).' },
      { id: 'n', description: 'Outlet port Out on the right edge; reverse flow from Out to In is blocked.' },
    ],
    params: [
      { key: 'Rf', description: 'On-state (forward) resistance in Pa*s/kg.', range: '> 0 (default 1000)' },
    ],
    algorithm: 'dp = p_In - p_Out\ng = 0.5 * (1 + tanh(1000 * dp))\nmdot = g * dp / Rf',
    usage: placeSteps('Check Valve', 'Fluid / Steam', [
      'Insert it in series with the flow direction: In upstream, Out downstream.',
      'Set Rf (Pa*s/kg) in the parameters panel.',
      'Test blocking by driving the downstream side to a higher pressure and watching a Flow Sensor.',
    ]),
    characteristics: acausal(FS, 'none', 'smooth tanh switching instead of event detection'),
    simulationExecution: SIM_DAE + ' The block allocates one mass-flow branch; the smooth switch keeps the residual differentiable, so the Newton iteration needs no event handling (no zero-crossing).',
    embeddedExecution: EMB_NONE,
    seeAlso: ['relief_valve', 'orifice', 'fluid_resistance'],
  },

  relief_valve: {
    id: 'relief_valve',
    summary: 'Pressure relief valve that opens when the inlet pressure exceeds a set pressure.',
    description:
      'Behaves as a pressure-controlled resistance. The effective resistance blends between Rf_closed and Rf_open with open = 0.5*(1 + tanh((p_In - P_set)*1e-4)), so the valve opens smoothly over a window of a few tens of kPa around the set pressure. The flow is dp = mdot * R with R = Rf_open*open + Rf_closed*(1 - open). ' +
      'The set pressure is compared with the absolute inlet pressure, not the differential pressure. The orifice-style expression of the library description is not used.' + FS_NOTE,
    shape:
      'A box with an upward arrow above it (relief-valve symbol) on a horizontal line. Port In on the left edge and Out on the right edge.',
    ports: [
      { id: 'p', description: 'Inlet port In on the left edge; its absolute pressure is compared with the set pressure.' },
      { id: 'n', description: 'Outlet (discharge) port Out on the right edge.' },
    ],
    params: [
      { key: 'P_set', description: 'Opening (set) absolute pressure at the inlet in Pa.', range: '> 0 (default 500000 Pa)' },
      { key: 'Rf_open', description: 'Resistance when fully open in Pa*s/kg.', range: '> 0 (default 100)' },
      { key: 'Rf_closed', description: 'Resistance when fully closed in Pa*s/kg (a very large number models a leak-tight seat).', range: '>> Rf_open (default 1e10)' },
    ],
    algorithm:
      'open = 0.5 * (1 + tanh((p_In - P_set) * 1e-4))\n' +
      'R = Rf_open*open + Rf_closed*(1 - open)\n' +
      'p_In - p_Out = R * mdot',
    usage: placeSteps('Relief Valve', 'Fluid / Steam', [
      'Connect In to the protected line and Out to a low-pressure sink such as Fluid Ground (Atm).',
      'Set P_set (absolute Pa), Rf_open and Rf_closed in the parameters panel.',
      'Drive the line above P_set with a Pressure Source and check that the pressure is limited by watching a Pressure Sensor.',
    ]),
    characteristics: acausal(FS, 'none', 'smooth tanh opening instead of event detection'),
    simulationExecution: SIM_DAE + ' The block allocates one mass-flow branch; the smooth opening function avoids zero-crossing events.',
    embeddedExecution: EMB_NONE,
    seeAlso: ['check_valve', 'orifice', 'pressure_sensor'],
  },

  steam_generator_fluid: {
    id: 'steam_generator_fluid',
    summary: 'Steam generator: converts heater power into a steam mass flow injected at its outlet.',
    description:
      'Computes the saturated-steam production from heating power and outlet pressure. The saturation temperature is T_sat = 100 + (P - 101325)/3600 degC, the latent heat h_fg = (2257 - 2.175*max(0, T_sat - 100))*1000 J/kg and the generated mass flow mdot = max(0, Q/h_fg) is imposed on the mass-flow branch at port Steam. In the assembler convention that branch enters the block at the port (sign -1 in the node balance, exactly like Mass Flow Source), so a positive steam flow is booked as leaving the connected node; confirm the direction with a Flow Sensor in your circuit. ' +
      'The heat input is the parameter Q (default 1000 W, about 0.44 g/s of steam at atmospheric pressure). The residual reads a heat command from the third entry of its port list, but the block declares only two ports, so that entry is undefined and Q is always taken from the parameter; the Heat input port is currently not read.' + FS_NOTE,
    shape:
      'A rounded rectangle tank with a wavy steam line inside it and two small steam wisps above its top edge. Steam outlet port (p) on the right edge and heat command input Heat (q_in, Physical signal) on the left edge.',
    ports: [
      { id: 'p', description: 'Steam outlet port labelled Steam on the right edge (absolute pressure [Pa], mass flow [kg/s]); the generated steam flow is imposed on the branch at this port.' },
      { id: 'q_in', description: 'Physical-signal input labelled Heat on the left edge: intended heater power command in W. Not read by the current residual (the parameter Q is used).' },
    ],
    params: [
      { key: 'Q', description: 'Heater power in W used to boil water; sets the steam mass flow mdot = Q/h_fg.', range: '>= 0 (default 1000 W)' },
    ],
    algorithm:
      'T_sat = 100 + (P - 101325)/3600            [degC]\n' +
      'h_fg = (2257 - 2.175*max(0, T_sat - 100))*1000    [J/kg]\n' +
      'mdot_steam = max(0, Q / h_fg)',
    usage: placeSteps('Steam Generator', 'Fluid / Steam', [
      'Wire port Steam to a Steam Accumulator or a line leading to a Steam Nozzle.',
      'Terminate the circuit with Fluid Ground (Atm).',
      'Set Q (W) in the parameters panel; leave the Heat input unconnected.',
      'Do not confuse it with the electrical Steam Generator (800W) of the Microwave & Cooking group.',
    ]),
    characteristics: acausal(FS_SIG, 'none', 'heat input is a Physical signal'),
    simulationExecution: SIM_DAE + ' The block allocates one mass-flow branch with the residual mdot - max(0, Q/h_fg(P)); it depends on the current port pressure through h_fg.',
    embeddedExecution: EMB_NONE,
    seeAlso: ['steam_generator', 'steam_accumulator', 'steam_nozzle', 'mass_flow_source'],
  },

  steam_accumulator: {
    id: 'steam_accumulator',
    summary: 'Steam accumulator: a steam volume between inlet In and outlet Out that buffers pressure.',
    description:
      'Stores steam. Both ports sit at the same pressure (p_In = p_Out) and the difference between inflow and outflow charges the vessel: mdot_in - mdot_out = Cf*dp/dt. The equivalent capacitance follows the steam density, Cf = V*1e-3*rho/1e5 kg/Pa with rho_steam = 0.6 + 4e-6*(p - 101325) kg/m^3. ' +
      'The scale factors are built into the implementation; V is the only parameter. The accumulator smooths pressure ripple between a generator and a nozzle or load.' + FS_NOTE,
    shape:
      'On the canvas a square glyph with the text STEAM and the sub-label ACC (palette icon: a vertical vessel with a dome and a horizontal level line). Inlet port In (pin) on the left edge and outlet Out (pout) on the right edge.',
    ports: [
      { id: 'pin', description: 'Inlet port In on the left edge (absolute pressure [Pa], mass flow [kg/s] into the vessel).' },
      { id: 'pout', description: 'Outlet port Out on the right edge (same pressure as In, mass flow out of the vessel).' },
    ],
    params: [
      { key: 'V', description: 'Vessel volume in m^3; scales the capacitance linearly.', range: '> 0 (default 0.5 m^3)' },
    ],
    algorithm:
      'rho_steam = 0.6 + (p - 101325) * 4e-6\n' +
      'Cf = V * 1e-3 * rho_steam / 1e5\n' +
      'p_In - p_Out = 0\n' +
      'mdot_in - mdot_out = Cf * dp/dt',
    usage: placeSteps('Steam Accumulator', 'Fluid / Steam', [
      'Wire In to the Steam Generator Steam port and Out to the load line (for example a Steam Nozzle).',
      'Set V (m^3) in the parameters panel.',
      'Add a Pressure Sensor on the accumulator node to follow the pressure build-up.',
    ]),
    characteristics: acausal(FS, '0 explicit states (node pressure is the dynamic variable; uses dp/dt from the implicit step)'),
    simulationExecution: SIM_DAE + ' The block allocates an inflow and an outflow branch; its residuals are the pressure equality and the storage equation with dp/dt from the implicit integrator.',
    embeddedExecution: EMB_NONE,
    seeAlso: ['steam_generator_fluid', 'steam_nozzle', 'fluid_capacitance'],
  },

  steam_nozzle: {
    id: 'steam_nozzle',
    summary: 'Steam nozzle venting the connected node to atmosphere through a throat of diameter d.',
    description:
      'A single-port sink that discharges to the atmosphere (101325 Pa). The throat area is A = pi*d^2/4 and the mass flow is mdot = Cd*A*sqrt(2*rho*max(0, P - 101325)) with a fixed steam density rho = 0.6 kg/m^3. ' +
      'No flow occurs below atmospheric pressure. The choked-flow formula quoted in the library description is not implemented; the model is an incompressible orifice to ambient, which is adequate for moderate pressure ratios only.' + FS_NOTE,
    shape:
      'On the canvas a square glyph with the text NOZ and the sub-label STEAM (palette icon: a converging-diverging nozzle with a jet). One inlet port In (p) on the left edge.',
    ports: [
      { id: 'p', description: 'Inlet port In on the left edge (absolute pressure [Pa], mass flow [kg/s] leaving the node through the nozzle).' },
    ],
    params: [
      { key: 'Cd', description: 'Discharge coefficient (dimensionless).', range: '0 < Cd <= 1 (default 0.5)' },
      { key: 'd', description: 'Throat diameter in m.', range: '> 0 (default 0.0005 m)' },
    ],
    algorithm:
      'A = pi * d^2 / 4\n' +
      'mdot = Cd * A * sqrt(2 * 0.6 * max(0, P - 101325))\n' +
      'Library reference: mdot = Cd*A*P0*sqrt(gamma/(R*T0))*(2/(gamma+1))^((gamma+1)/(2*(gamma-1)))',
    usage: placeSteps('Steam Nozzle', 'Fluid / Steam', [
      'Wire In to the steam line or accumulator outlet; no ground is needed on the nozzle side because it discharges to a fixed 101325 Pa.',
      'Set Cd and d (m) in the parameters panel.',
      'Observe the line pressure with a Pressure Sensor and the flow with a Flow Sensor placed upstream.',
    ]),
    characteristics: acausal(FS, 'none'),
    simulationExecution: SIM_DAE + ' The block allocates one mass-flow branch with the residual mdot - Cd*A*sqrt(2*0.6*max(0, P - 101325)).',
    embeddedExecution: EMB_NONE,
    seeAlso: ['steam_accumulator', 'steam_generator_fluid', 'orifice'],
  },

  pressure_sensor: {
    id: 'pressure_sensor',
    summary: 'Ideal pressure sensor that outputs the absolute pressure at its port as a Physical signal.',
    description:
      'Connects to a fluid node without drawing any flow (its through variable is held at 0) and publishes the node pressure in Pa on the Physical output P. The library equation P_out = P_p - P_n suggests a differential sensor, but the block has a single fluid port, so the output is the absolute pressure of the node (gauge = output - 101325). ' +
      'Wire the output to a Scope to plot it or to a controller block.' + FS_NOTE,
    shape:
      'On the canvas a square glyph with the letter P and the sub-label SENSOR. Fluid port In (p) on the left edge, signal output P (out, Physical) on the right edge.',
    ports: [
      { id: 'p', description: 'Measured fluid port labelled In on the left edge (absolute pressure [Pa] across, zero flow drawn).' },
      { id: 'out', description: 'Physical-signal output labelled P on the right edge: the measured absolute pressure in Pa.' },
    ],
    params: [],
    algorithm: 'mdot_p = 0\nP_out = p_node',
    usage: placeSteps('Pressure Sensor', 'Fluid / Steam', [
      'Wire port In to the node to measure.',
      'Wire output P to a Scope input, or to a controller.',
      'The block has no parameters.',
    ]),
    characteristics: acausal(FS_SIG, 'none', 'output is a Physical signal'),
    simulationExecution: SIM_DAE + ' The block allocates a zero-flow branch at In and a signal branch for P; the residuals are mdot = 0 and P - p_node = 0.',
    embeddedExecution: EMB_NONE,
    seeAlso: ['flow_sensor', 'ma_pt_sensor', 'scope'],
  },

  flow_sensor: {
    id: 'flow_sensor',
    summary: 'Ideal series flow sensor that outputs the mass flow through it as a Physical signal.',
    description:
      'Inserted in series in a line: the pressures at In and Out are equal (zero pressure drop) and the through mass flow is published in kg/s on the Physical output F. The library text speaks of volumetric flow; the output is mass flow. ' +
      'The sign is positive for flow from In to Out. Connect F to a Scope or a controller.' + FS_NOTE,
    shape:
      'On the canvas a square glyph with the symbol for mdot (m with a dot) and the sub-label SENSOR. Fluid ports In (p) on the left edge and Out (n) on the right edge, signal output F (out, Physical) on the top edge.',
    ports: [
      { id: 'p', description: 'Inlet port In on the left edge (absolute pressure [Pa], mass flow [kg/s]).' },
      { id: 'n', description: 'Outlet port Out on the right edge; at the same pressure as In.' },
      { id: 'out', description: 'Physical-signal output labelled F on the top edge: the mass flow in kg/s from In to Out.' },
    ],
    params: [],
    algorithm: 'p_In - p_Out = 0\nF = mdot (In to Out)',
    usage: placeSteps('Flow Sensor', 'Fluid / Steam', [
      'Insert it in the line: upstream node to In, downstream node to Out.',
      'Wire output F (top) to a Scope input.',
      'The block has no parameters.',
    ]),
    characteristics: acausal(FS_SIG, 'none', 'output is a Physical signal'),
    simulationExecution: SIM_DAE + ' The block allocates one mass-flow branch and a signal branch for F; the residuals are p_In - p_Out = 0 and F - mdot = 0.',
    embeddedExecution: EMB_NONE,
    seeAlso: ['pressure_sensor', 'ma_flow_sensor', 'mass_flow_source'],
  },
};
