import type { BlockHelpEntry } from '../../types';
import { SIM_DAE, EMB_NONE, acausal, placeSteps } from './common';

const ELEC_THERM = 'Electrical (voltage [V], current [A]) coupled to Thermal (temperature [K], heat flow [W])';

export const APPLIANCES: Record<string, BlockHelpEntry> = {
  washing_basket: {
    id: 'washing_basket',
    summary: 'Washing-machine drum with load: rotational inertia plus viscous damping, publishing drum speed on port Vis.',
    description:
      'Models the rotating drum of a washing machine as a lumped rotational load. The total inertia is the empty drum inertia plus the clothes and unbalance masses at the drum radius, J_total = J_basket + (load_mass + unbalance)*radius^2. ' +
      'The block draws a torque from the shaft port R equal to J_total*d(omega)/dt + B*omega, with a fixed viscous coefficient B = 0.02 N*m*s/rad (not a block parameter), and reports omega on the Physical output Vis. ' +
      'The eccentric-mass torque term of the library description is not included in the torque; the unbalance only enlarges the inertia in the present equation.',
    shape:
      'An outer circle with a dashed inner circle, four short tick marks at 12, 3, 6 and 9 o\'clock, a small filled square on the right rim and the text BASKET in the centre. Shaft port R (Rotational) on the left edge, visual/speed output Vis (Physical signal) on the right edge.',
    ports: [
      { id: 'r', description: 'Rotational shaft port on the left edge. Across = angular velocity [rad/s]; through = torque [N*m] drawn by the drum from the motor.' },
      { id: 'vis', description: 'Physical-signal output on the right edge carrying the drum angular velocity omega in rad/s (for scopes or animation).' },
    ],
    params: [
      { key: 'J_basket', description: 'Moment of inertia of the empty drum about its axis in kg*m^2.', range: '>= 0 (default 0.1)' },
      { key: 'load_mass', description: 'Mass of the clothes inside the drum in kg; contributes load_mass*radius^2 to the inertia.', range: '>= 0 (default 5 kg)' },
      { key: 'unbalance', description: 'Eccentric (unbalance) mass in kg; in the present model it adds unbalance*radius^2 to the inertia.', range: '>= 0 (default 0.5 kg)' },
      { key: 'radius', description: 'Drum radius in m used to convert the masses to inertia.', range: '> 0 (default 0.25 m)' },
    ],
    algorithm:
      'J_total = J_basket + (load_mass + unbalance) * radius^2\n' +
      'tau_R = J_total * d(omega)/dt + B * omega      (B = 0.02 N*m*s/rad)\n' +
      'Vis = omega\n' +
      'Library reference form: tau = J_drum*d(omega)/dt + b_visc*omega + tau_unbalance',
    usage: placeSteps('Washing Basket', 'Consumer Appliances', [
      'Connect the R port to a motor shaft, for example a DC Motor or a Torque Source; add a Rotational Reference on the other side of the machine.',
      'Select the block and set J_basket, load_mass, unbalance and radius in the parameters panel (SI units).',
      'Add a Fluid & Detergent Load block on the same shaft node for water and detergent drag.',
      'Connect Vis to a Scope input to display the drum speed.',
    ]),
    characteristics: acausal('Rotational (speed [rad/s], torque [N*m]); output Vis is a Physical signal', '0 explicit (the inertia uses d(omega)/dt of the shaft node)', 'inertia derived from shaft acceleration'),
    simulationExecution:
      SIM_DAE + ' The block allocates a torque branch at R and a signal branch for Vis; the torque residual uses the time derivative of the shaft speed supplied by the implicit step (dAcross), so it behaves as an inertia.',
    embeddedExecution: EMB_NONE,
    examples: [
      {
        title: 'Spin-up of a loaded drum',
        steps: [
          'Place Washing Basket, a DC Motor with a DC Voltage source and Electrical Reference, and a Rotational Reference.',
          'Wire the motor shaft to R of the basket and add a Scope to Vis.',
          'Run the simulation and observe the drum speed rising with time constant set by J_total.',
        ],
      },
    ],
    seeAlso: ['washing_fluid', 'dc_motor', 'rot_ref', 'scope'],
  },

  washing_fluid: {
    id: 'washing_fluid',
    summary: 'Water and detergent load on a rotating shaft: viscous plus quadratic drag torque.',
    description:
      'Represents the drag of the wash liquor on the drum. The torque absorbed at the shaft port R is tau = viscosity*omega + 0.01*sign(omega)*omega^2, with a viscosity of 0.05 + 0.02*detergent + 0.005*water_level (N*m*s/rad), where detergent is in percent and water_level in litres. ' +
      'The library description mentions a water-temperature balance dT/dt = (Q_heater - Q_loss)/(m*Cp); that thermal behaviour is not implemented in the block equation, and drag_coeff is declared but not read.',
    shape:
      'A wave-shaped filled water body (translucent) with two thin ripple lines inside it and the text FLUID above. Single rotational port R on the left edge.',
    ports: [
      { id: 'r', description: 'Rotational shaft port on the left edge. Across = angular velocity [rad/s]; through = drag torque [N*m] absorbed from the shaft.' },
    ],
    params: [
      { key: 'water_level', description: 'Volume of water in litres; raises the viscous coefficient by 0.005 per litre.', range: '>= 0 (default 10 L)' },
      { key: 'detergent', description: 'Detergent concentration in percent; raises the viscous coefficient by 0.02 per percent.', range: '>= 0 (default 1 %)' },
      { key: 'drag_coeff', description: 'Slosh drag coefficient in N*m*s/rad. Declared by the library; not read by the present equation (the quadratic term uses a fixed 0.01).', range: '>= 0 (default 0.05)' },
    ],
    algorithm:
      'viscosity = 0.05 + 0.02*detergent + 0.005*water_level\n' +
      'tau_R = viscosity * omega + 0.01 * sign(omega) * omega^2',
    usage: placeSteps('Fluid & Detergent Load', 'Consumer Appliances', [
      'Wire port R to the same rotational node as the Washing Basket shaft.',
      'Set water_level (L) and detergent (%) in the parameters panel.',
      'Leave it out for a dry-spin simulation.',
    ]),
    characteristics: acausal('Rotational (speed [rad/s], torque [N*m])', 'none'),
    simulationExecution: SIM_DAE + ' The block allocates a single torque branch at R and contributes one algebraic residual (torque - drag).',
    embeddedExecution: EMB_NONE,
    seeAlso: ['washing_basket', 'rot_damper', 'dc_motor'],
  },

  magnetron: {
    id: 'magnetron',
    summary: 'Microwave magnetron that draws electrical power and delivers microwave heat to a thermal port.',
    description:
      'Converts the electrical power at the HV terminals p and n into microwave heat at port H. Electrical power follows P_elec = P_rated*(V/V_nom)^2 with V_nom = 4000 V, so at the nominal supply voltage the device draws exactly the rated power. ' +
      'The heat delivered is Q = P_rated*eta*(V/V_nom)^2, e.g. about 585 W for 900 W and 65 percent. The input current is I = P_elec/|V|. ' +
      'The frequency parameter is informational (wavelength = c/f); it is not used in the residual.',
    shape:
      'A circle with a smaller filled inner circle (the cathode), four radial ticks around it, two small diagonal marks and the text MAG below. Ports: + (p) on the left, - (n) on the bottom, thermal output H on the right.',
    ports: [
      { id: 'p', description: 'Positive electrical terminal (+) on the left edge; high-voltage input in volts.' },
      { id: 'n', description: 'Negative electrical terminal (-) on the bottom edge; return path.' },
      { id: 'h', description: 'Thermal output H on the right edge: the heat flow Q in watts delivered to the cavity.' },
    ],
    params: [
      { key: 'power_rating', description: 'Rated electrical input power at the nominal voltage (4000 V) in W.', range: '> 0 (default 900 W)' },
      { key: 'efficiency', description: 'Conversion efficiency to microwave energy in percent.', range: '0 to 100 (default 65 %)' },
      { key: 'freq', description: 'Operating frequency in GHz (informational; wavelength = c/f).', range: '> 0 (default 2.45 GHz)' },
    ],
    algorithm:
      'V = V_p - V_n\n' +
      'P_elec = power_rating * (V / 4000)^2\n' +
      'I = P_elec / max(1, |V|)\n' +
      'Q_H = power_rating * (efficiency/100) * (V / 4000)^2',
    usage: placeSteps('Magnetron Unit', 'Microwave & Cooking', [
      'Feed p and n from the HV Inverter PSU outputs (HV and the return).',
      'Wire port H to a thermal port of the 25L Microwave Cavity.',
      'Set power_rating, efficiency and freq in the parameters panel.',
      'Make sure the electrical network has an Electrical Reference (ground).',
    ]),
    characteristics: acausal(ELEC_THERM, 'none'),
    simulationExecution: SIM_DAE + ' The block allocates a current branch (p to n) and a heat-flow branch at H, with two algebraic residuals (current and heat).',
    embeddedExecution: EMB_NONE,
    seeAlso: ['microwave_inverter', 'microwave_cavity', 'upper_heater', 'steam_generator'],
  },

  upper_heater: {
    id: 'upper_heater',
    summary: 'Resistive upper radiant heater: Joule heating delivered to a thermal port.',
    description:
      'A resistor with resistance R that converts electrical power to heat: I = V/R and Q = I^2*R*eta, with eta = 0.9 (key "efficiency", not a library parameter). ' +
      'The heat flow is delivered to the thermal port H. The surface_area parameter and the Stefan-Boltzmann radiation term quoted in the library description are not used by the present residual.',
    shape:
      'Three faint horizontal guide lines with a wavy heating coil running across them, with short leads out to the left and right. Ports: + (p) on the left, - (n) on the right, thermal H on the top.',
    ports: [
      { id: 'p', description: 'Positive electrical terminal (+) on the left edge.' },
      { id: 'n', description: 'Negative electrical terminal (-) on the right edge.' },
      { id: 'h', description: 'Thermal output H on the top edge: heat flow Q in watts delivered to the cavity.' },
    ],
    params: [
      { key: 'resistance', description: 'Element resistance in ohm.', range: '> 0 (default 40 ohm)' },
      { key: 'surface_area', description: 'Radiating surface area in m^2. Declared for the radiation model; not read by the present residual.', range: '> 0 (default 0.05 m^2)' },
    ],
    algorithm: 'I = (V_p - V_n) / resistance\nQ_H = I^2 * resistance * 0.9\nLibrary reference: Q_rad = eps*sigma*A*(T^4 - T_amb^4)',
    usage: placeSteps('Upper Radiant Heater', 'Microwave & Cooking', [
      'Wire p and n across an AC or DC voltage source (for example AC Voltage at 230 V) and add an Electrical Reference.',
      'Wire H to a thermal port of the 25L Microwave Cavity.',
      'Set resistance (ohm) in the parameters panel.',
    ]),
    characteristics: acausal(ELEC_THERM, 'none'),
    simulationExecution: SIM_DAE + ' The block allocates a current branch (p to n) and a heat-flow branch at H.',
    embeddedExecution: EMB_NONE,
    seeAlso: ['magnetron', 'steam_generator', 'microwave_cavity', 'resistor'],
  },

  steam_generator: {
    id: 'steam_generator',
    summary: 'Electric steam boiler (800 W class) modelled as an equivalent resistance delivering constant heat to a thermal port.',
    description:
      'Treated as a fixed electrical load with equivalent resistance R_eq = 230^2/power, which equals 66.1 ohm at 800 W, and a heat output equal to the parameter power at all times: Q_S = power. ' +
      'The tank volume and boiling temperature parameters are declared but not read by the present equations, and steam mass flow is not computed here (see Steam Generator in the Fluid / Steam group for that).',
    shape:
      'A rounded dome-shaped tank outline with faint fill, three dashed steam wisps rising from its top and the text STEAM inside. Ports: + (p) on the left, - (n) on the bottom, thermal output S on the right.',
    ports: [
      { id: 'p', description: 'Positive electrical terminal (+) on the left edge.' },
      { id: 'n', description: 'Negative electrical terminal (-) on the bottom edge.' },
      { id: 's', description: 'Thermal output S on the right edge: heat flow in watts delivered by the boiler.' },
    ],
    params: [
      { key: 'power', description: 'Heating power in W; sets both the equivalent resistance 230^2/power and the constant heat flow.', range: '> 0 (default 800 W)' },
      { key: 'tank_vol', description: 'Water tank volume in litres. Declared; not read by the present residual.', range: '> 0 (default 0.5 L)' },
      { key: 'boil_temp', description: 'Boiling temperature in degC. Declared; not read by the present residual.', range: '(default 100 degC)' },
    ],
    algorithm: 'R_eq = 230 / (power/230) = 230^2 / power\nV_p - V_n = I * R_eq\nQ_S = power\nLibrary reference: mdot_steam = Q / h_fg',
    usage: placeSteps('Steam Generator (800W)', 'Microwave & Cooking', [
      'Wire p and n to a 230 V supply and an Electrical Reference.',
      'Wire S to a thermal port of the 25L Microwave Cavity.',
      'Set power (W) in the parameters panel.',
    ]),
    characteristics: acausal(ELEC_THERM, 'none'),
    simulationExecution: SIM_DAE + ' The block allocates a current branch (p to n) and a heat-flow branch at S.',
    embeddedExecution: EMB_NONE,
    tips: ['Not to be confused with steam_generator_fluid ("Steam Generator" in Fluid / Steam), which injects steam mass flow into a pressure network.'],
    seeAlso: ['steam_generator_fluid', 'upper_heater', 'microwave_cavity', 'magnetron'],
  },

  microwave_inverter: {
    id: 'microwave_inverter',
    summary: 'High-voltage inverter power supply for a magnetron with an ideal power-balance model and optional duty-cycle control.',
    description:
      'Converts the mains-side AC input to the high-voltage output required by the magnetron. The output node voltage is forced to V_hv = v_out*ctrl, where ctrl is the optional Physical-signal input (1 when unconnected) and the input current follows the ideal power balance I_in = -(V_hv/v_in)*I_out using the nominal input voltage v_in. ' +
      'The switching frequency parameter is informational and is not read by the residual. The Physical control input acts as a duty-cycle/power multiplier between 0 and 1.',
    shape:
      'A rounded rectangle (70 by 50 px) containing a zigzag stroke pattern and the text HV-INV at the bottom. Ports: AC on the left edge, HV on the right edge, control C (Physical signal) on the top edge.',
    ports: [
      { id: 'ac_in', description: 'AC input terminal (Electrical) on the left edge; current drawn from the mains side.' },
      { id: 'hv_out', description: 'High-voltage output terminal (Electrical) on the right edge; held at v_out times the control signal.' },
      { id: 'ctrl', description: 'Control input C (Physical signal) on the top edge: dimensionless multiplier of the output voltage (1 when unconnected).' },
    ],
    params: [
      { key: 'v_in', description: 'Nominal input voltage in V used in the power-balance relation.', range: '> 0 (default 230 V)' },
      { key: 'v_out', description: 'Nominal high-voltage output in V at ctrl = 1.', range: '> 0 (default 4000 V)' },
      { key: 'switching_freq', description: 'Inverter switching frequency in kHz (informational; not read by the residual).', range: '> 0 (default 30 kHz)' },
    ],
    algorithm: 'V_hv_target = v_out * ctrl\nV(hv_out) - V_hv_target = 0\nI_in + (V_hv_target / v_in) * I_out = 0',
    usage: placeSteps('HV Inverter PSU', 'Microwave & Cooking', [
      'Wire ac_in to the mains source (for example an AC Voltage source) and the electrical reference.',
      'Wire hv_out to the Magnetron + terminal; connect its - terminal to the electrical reference.',
      'Optionally wire ctrl to a PS Constant or PS Step to modulate the power level (0 to 1).',
      'Set v_in, v_out and switching_freq in the parameters panel.',
    ]),
    characteristics: acausal('Electrical (voltage [V], current [A]); control input is a Physical signal', 'none'),
    simulationExecution: SIM_DAE + ' The block allocates two current branches (input and output) with two algebraic residuals.',
    embeddedExecution: EMB_NONE,
    seeAlso: ['magnetron', 'microwave_cavity', 'ps_constant', 'ps_step'],
  },

  microwave_cavity: {
    id: 'microwave_cavity',
    summary: 'Lumped thermal model of an oven cavity with air, wall and food heat capacity, losses and a thermal cut-out.',
    description:
      'Collects the heat delivered by the magnetron, the upper heater and the steam generator at three thermal ports (M, U, S) and integrates a single cavity temperature. The total heat capacity is C = air + wall_mass*wall_cp + food_mass*food_cp, with an air term of volume*0.0012*1005 J/K (volume in litres). ' +
      'Losses are natural convection h_conv*A*(T - T_amb) plus Stefan-Boltzmann radiation eps*sigma*A*(T^4 - T_amb^4), where A is the surface of a cube of the given volume. ' +
      'A smooth thermal cut-out multiplies the input heat by 0.5*(1 + tanh((T_max - T)/3 K)), so the heat input fades out near max_temp. ambient_temp and max_temp are entered in degC (values above 200 or 350 respectively are taken as kelvin). The cavity temperature in kelvin is published on the Physical output T.',
    shape:
      'A rectangle (80 by 60 px) with rounded corners, a fainter dashed inner rectangle, a door latch drawn on its right and the text 25L in the centre. Thermal ports: M on the left, U on the top, S on the right; the temperature signal output T on the bottom edge.',
    ports: [
      { id: 'h1', description: 'Thermal port M (magnetron heat) on the left edge; held at the cavity temperature, heat flow in W flows into the cavity.' },
      { id: 'h2', description: 'Thermal port U (upper heater) on the top edge; held at the cavity temperature.' },
      { id: 'h3', description: 'Thermal port S (steam generator) on the right edge; held at the cavity temperature.' },
      { id: 't', description: 'Physical-signal output T on the bottom edge: cavity temperature in kelvin (for scopes).' },
    ],
    params: [
      { key: 'volume', description: 'Cavity air volume in litres; sets the air heat capacity and the loss surface area.', range: '> 0 (default 25 L)' },
      { key: 'ambient_temp', description: 'Ambient temperature in degC; also the initial cavity temperature.', range: 'about -50 to 100 degC (default 25)' },
      { key: 'max_temp', description: 'Thermal cut-out limit in degC; heat input fades out smoothly near this value.', range: '> ambient_temp (default 250 degC)' },
      { key: 'food_mass', description: 'Mass of the food or water load in kg.', range: '>= 0 (default 0.5 kg)' },
      { key: 'food_cp', description: 'Specific heat capacity of the load in J/(kg*K).', range: '> 0 (default 4184, water)' },
      { key: 'wall_mass', description: 'Mass of the cavity walls in kg.', range: '>= 0 (default 2 kg)' },
      { key: 'wall_cp', description: 'Specific heat capacity of the wall material in J/(kg*K).', range: '> 0 (default 460, steel)' },
      { key: 'h_conv', description: 'Natural-convection heat transfer coefficient to ambient in W/(m^2*K).', range: '>= 0 (default 10)' },
      { key: 'eps', description: 'Surface emissivity for radiative loss (dimensionless).', range: '0 to 1 (default 0.85)' },
    ],
    algorithm:
      'C = volume*0.0012*1005 + wall_mass*wall_cp + food_mass*food_cp\n' +
      'A = 6 * (volume*1e-3)^(2/3)\n' +
      'Q_loss = h_conv*A*(T - T_amb) + eps*5.67e-8*A*(T^4 - T_amb^4)\n' +
      'cutoff = 0.5*(1 + tanh((T_max - T)/3))\n' +
      'C * dT/dt = (Q_M + Q_U + Q_S) * cutoff - Q_loss\n' +
      'T_M = T_U = T_S = T ; Out_T = T',
    usage: placeSteps('25L Microwave Cavity', 'Microwave & Cooking', [
      'Wire the Magnetron H port to M, the Upper Radiant Heater H port to U and the Steam Generator S port to S.',
      'Wire T to a Scope to observe the cavity temperature in kelvin.',
      'Set volume, food_mass, food_cp, wall_mass, wall_cp, h_conv, eps, ambient_temp and max_temp in the parameters panel.',
      'Unused thermal ports may be left open.',
    ]),
    characteristics: acausal('Thermal (temperature [K], heat flow [W]); output T is a Physical signal', '1 continuous (cavity temperature, initialised to ambient_temp)'),
    simulationExecution:
      SIM_DAE + ' The block allocates three heat-flow branches, a signal branch for T and one differential state (temperature) integrated implicitly together with the rest of the network. The cut-out is smooth (tanh), so no zero-crossing event is used.',
    embeddedExecution: EMB_NONE,
    examples: [
      {
        title: 'Heat 0.5 kg of water in the microwave',
        steps: [
          'Build AC Voltage - HV Inverter PSU - Magnetron with a ground and wire the magnetron H to M of the cavity.',
          'Leave food_mass at 0.5 kg and food_cp at 4184.',
          'Add a Scope on T and run for 60 s.',
        ],
      },
    ],
    seeAlso: ['magnetron', 'upper_heater', 'steam_generator', 'thermal_mass'],
  },
};
