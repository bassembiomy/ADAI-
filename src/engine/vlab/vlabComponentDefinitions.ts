export interface BlockDefinition {
  equations: string[];
  latex: string[];
  across: string;
  through: string;
  description: string;
}

export const VLAB_COMPONENT_DEFINITIONS: Record<string, BlockDefinition> = {
  resistor: {
    equations: ['I = (Vp - Vn)/R'],
    latex: ['V = I \\cdot R'],
    across: 'Voltage (V)', through: 'Current (I)',
    description: 'Implements a linear resistor following Ohm\'s law. Connect to model energy dissipation in electrical networks.'
  },
  variable_resistor: {
    equations: ['I = (Vp - Vn)/R_ctrl'],
    latex: ['V = I \\cdot R(r)'],
    across: 'Voltage (V)', through: 'Current (I)',
    description: 'A resistor whose resistance is modulated by a physical signal (PS). Used for modeling potentiometers or temperature-dependent loads.'
  },
  infinite_resistance: {
    equations: ['I = 0'],
    latex: ['I = 0'],
    across: 'Voltage (V)', through: 'Current (I)',
    description: 'Models an ideal open circuit. Prevents current flow while maintaining voltage potential between terminals.'
  },
  capacitor: {
    equations: ['I = C * d(Vp-Vn)/dt'],
    latex: ['I = C \\frac{dV}{dt}'],
    across: 'Voltage (V)', through: 'Current (I)',
    description: 'Models energy storage in an electric field. The current is proportional to the rate of change of voltage.'
  },
  inductor: {
    equations: ['(Vp-Vn) = L * dI/dt'],
    latex: ['V = L \\frac{dI}{dt}'],
    across: 'Voltage (V)', through: 'Current (I)',
    description: 'Models energy storage in a magnetic field. The voltage drop is proportional to the rate of change of current.'
  },
  memristor: {
    equations: ['V = M(w) * I', 'dw/dt = f(V, I)'],
    latex: ['V = M(w) I', '\\frac{dw}{dt} = v(t)'],
    across: 'Voltage (V)', through: 'Current (I)',
    description: 'A non-linear resistive element with memory. Its resistance depends on the history of charge or flux.'
  },
  gyrator: {
    equations: ['I1 = g * V2', 'I2 = -g * V1'],
    latex: ['i_1 = G v_2', 'i_2 = -G v_1'],
    across: 'Voltage (V)', through: 'Current (I)',
    description: 'A two-port element that couples the current of one port to the voltage of the other. Used for dual-network modeling.'
  },
  transformer: {
    equations: ['V2 = N * V1', 'I1 = -N * I2'],
    latex: ['v_2 = N v_1', 'i_1 = -N i_2'],
    across: 'Voltage (V)', through: 'Current (I)',
    description: 'Ideal electromagnetic coupling between two electrical circuits. Scales voltage and current based on turns ratio.'
  },
  opamp: {
    equations: ['Vout = Gain * (Vp - Vn)'],
    latex: ['V_{out} = A (V_+ - V_-)'],
    across: 'Voltage (V)', through: 'Current (I)',
    description: 'Models an ideal operational amplifier with high open-loop gain. Use for analog signal processing and active filters.'
  },
  switch: {
    equations: ['V = I * (S ? Ron : Roff)'],
    latex: ['V = I \\cdot R_{switch}'],
    across: 'Voltage (V)', through: 'Current (I)',
    description: 'An ideal controlled switch. Toggles between low (Ron) and high (Roff) resistance based on a control signal.'
  },
  rotational_electromechanical_converter: {
    equations: ['V = K * omega', 'T = K * I'],
    latex: ['v = K \\omega', '\tau = K i'],
    across: 'V, rad/s', through: 'I, N-m',
    description: 'Bridges the Electrical and Rotational domains. Models DC motors or generators where torque is proportional to current.'
  },
  translational_electromechanical_converter: {
    equations: ['V = Bl * v', 'F = Bl * I'],
    latex: ['v = (Bl) v_m', 'f = (Bl) i'],
    across: 'V, m/s', through: 'I, N',
    description: 'Bridges the Electrical and Translational domains. Models voice coils or solenoids where force is proportional to current.'
  },
  thermal_resistor: {
    equations: ['Q = (Th - Tc) / Rth'],
    latex: ['Q = \\frac{\Delta T}{R_{th}}'],
    across: 'Temperature (K)', through: 'Heat Flow (W)',
    description: 'Bridges Electrical and Thermal domains by modeling heat generation from power dissipation ($P = I^2 R$).'
  },
  v_sensor: {
    equations: ['V_sens = Vp - Vn', 'I = V_sens / R_int'],
    latex: ['V_{out} = V_p - V_n', 'I_{leak} = \\frac{V_{sens}}{R_{int}}'],
    across: 'Voltage (V)', through: 'Current (A)',
    description: 'Measures voltage between two points. Includes a high internal resistance (R_int) to model a non-ideal voltmeter.'
  },
  i_sensor: {
    equations: ['I_sens = I_p', 'V_sens = I_sens * R_int'],
    latex: ['I_{out} = I_p', 'V_{drop} = I \cdot R_{int}'],
    across: 'Voltage (V)', through: 'Current (A)',
    description: 'Measures current flowing through the branch. Includes a low internal resistance (R_int) to model voltage drop across a shunt.'
  },
  dc_voltage: {
    equations: ['Vp - Vn = V_const'],
    latex: ['v = V_{dc}'],
    across: 'Voltage (V)', through: 'Current (I)',
    description: 'An ideal constant voltage source. Maintains a fixed potential regardless of the load current.'
  },
  ac_voltage: {
    equations: ['Vp - Vn = Vpk * sin(2*pi*f*t)'],
    latex: ['v = V_{pk} \sin(\omega t)'],
    across: 'Voltage (V)', through: 'Current (I)',
    description: 'An ideal sinusoidal voltage source. Used for modeling mains power or signal generators.'
  },
  controlled_voltage: {
    equations: ['Vp - Vn = S'],
    latex: ['v = S(t)'],
    across: 'Voltage (V)', through: 'Current (I)',
    description: 'A voltage source whose output is driven by an external physical signal (PS).'
  },
  dc_current: {
    equations: ['I = I_const'],
    latex: ['i = I_{dc}'],
    across: 'Voltage (V)', through: 'Current (I)',
    description: 'An ideal constant current source. Maintains a fixed current flow regardless of the load voltage.'
  },
  vcvs: {
    equations: ['Vp - Vn = gain * (Vcp - Vcn)'],
    latex: ['v_{out} = A \cdot v_{in}'],
    across: 'Voltage (V)', through: 'Current (I)',
    description: 'Voltage-Controlled Voltage Source. A dependent source where output voltage is proportional to an input voltage.'
  },
  vccs: {
    equations: ['I = gain * (Vcp - Vcn)'],
    latex: ['i_{out} = G \cdot v_{in}'],
    across: 'Voltage (V)', through: 'Current (I)',
    description: 'Voltage-Controlled Current Source. A dependent source where output current is proportional to an input voltage.'
  },
  cccs: {
    equations: ['I_out = gain * I_in'],
    latex: ['i_{out} = \beta \cdot i_{in}'],
    across: 'Voltage (V)', through: 'Current (I)',
    description: 'Current-Controlled Current Source. A dependent source where output current is proportional to an input current.'
  },
  ccvs: {
    equations: ['Vp - Vn = gain * I_in'],
    latex: ['v_{out} = r \cdot i_{in}'],
    across: 'Voltage (V)', through: 'Current (I)',
    description: 'Current-Controlled Voltage Source. A dependent source where output voltage is proportional to an input current.'
  },
  ground: {
    equations: ['V = 0'],
    latex: ['V = 0'],
    across: 'Voltage (V)', through: 'Current (I)',
    description: 'The zero-potential reference point for the electrical network. Every circuit must have at least one ground.'
  },
  busbar: {
    equations: ['V1 = V2 = ... = Vn', 'Sum(I) = 0'],
    latex: ['V_i = V_j', '\sum I_k = 0'],
    across: 'Voltage (V)', through: 'Current (I)',
    description: 'A low-impedance electrical conductor used to connect multiple branches. Models a common node with Kirchhoff\'s Current Law.'
  },
  phase_splitter: {
    equations: ['Va = Vabc[0]', 'Vb = Vabc[1]', 'Vc = Vabc[2]'],
    latex: ['\mathbf{V}_{abc} \\to V_a, V_b, V_c'],
    across: 'Voltage (V)', through: 'Current (I)',
    description: 'Decomposes a composite three-phase signal into three individual phase lines (A, B, and C).'
  },
  delta_ref: {
    equations: ['V_delta = V_ref'],
    latex: ['V_{\Delta} = 0'],
    across: 'Voltage (V)', through: 'Current (I)',
    description: 'Provides a reference potential specifically for Delta-connected three-phase loads.'
  },
  open_circuit: {
    equations: ['I = 0'],
    latex: ['I = 0'],
    across: 'Voltage (V)', through: 'Current (I)',
    description: 'Models a floating terminal with no connected path. Essential for modeling unconnected three-phase ports.'
  },
  ps_demux_3: {
    equations: ['y1 = u[0]', 'y2 = u[1]', 'y3 = u[2]'],
    latex: ['\mathbf{u} \\to y_1, y_2, y_3'],
    across: 'None', through: 'None',
    description: 'Splits a three-element physical signal vector into three independent scalar signals.'
  },
  gas_ref: {
    equations: ['P = 0', 'T = 0'],
    latex: ['P = 0, T = 0'],
    across: 'Pressure (Pa)', through: 'Mass Flow (kg/s)',
    description: 'The reference point for gas networks, representing standard ambient pressure and temperature.'
  },
  gas_cap: {
    equations: ['mdot = 0'],
    latex: ['\dot{m} = 0'],
    across: 'Pressure (Pa)', through: 'Mass Flow (kg/s)',
    description: 'Models a gas-tight seal or cap. Prevents mass flow through the terminal.'
  },
  gas_chamber: {
    equations: ['dm/dt = (V/R*T) * dP/dt'],
    latex: ['\dot{m} = \frac{V}{RT} \frac{dP}{dt}'],
    across: 'Pressure (Pa)', through: 'Mass Flow (kg/s)',
    description: 'Models a fixed-volume gas container. It accumulates mass based on pressure and temperature changes.'
  },
  gas_reservoir: {
    equations: ['P = S'],
    latex: ['P = P_{ctrl}'],
    across: 'Pressure (Pa)', through: 'Mass Flow (kg/s)',
    description: 'A controlled gas source that maintains a specific pressure regardless of the flow rate.'
  },
  gas_resistance: {
    equations: ['mdot = k * (Pa - Pb)'],
    latex: ['\dot{m} = G \Delta P'],
    across: 'Pressure (Pa)', through: 'Mass Flow (kg/s)',
    description: 'Models linear pressure drop in a gas flow path, similar to a pipe or valve with low flow.'
  },
  gas_restriction: {
    equations: ['mdot = Cd * A * P / sqrt(T)'],
    latex: ['\dot{m} = f(A, P, T)'],
    across: 'Pressure (Pa)', through: 'Mass Flow (kg/s)',
    description: 'Models an orifice or nozzle where flow is restricted based on geometry and gas state.'
  },
  gas_pipe: {
    equations: ['Pa - Pb = f(L, D, mdot)', 'Q_heat = h * A * (T_gas - T_wall)'],
    latex: ['\Delta P = f(\dot{m})', 'Q = h A \Delta T'],
    across: 'Pressure (Pa)', through: 'Mass Flow (kg/s)',
    description: 'Models a cylindrical pipe with friction losses and optional heat exchange with the environment.'
  },
  gas_fixed_res: {
    equations: ['P = P_const'],
    latex: ['P = P_{set}'],
    across: 'Pressure (Pa)', through: 'Mass Flow (kg/s)',
    description: 'A constant pressure source representing a large tank or regulated gas supply.'
  },
  gas_rotational_conv: {
    equations: ['mdot = (D/R*T) * omega', 'T_torque = D * (Pa - Ph)'],
    latex: ['\dot{m} = \frac{D}{RT} \omega', '\tau = D \Delta P'],
    across: 'P, rad/s', through: 'mdot, N-m',
    description: 'Bridges Gas and Rotational domains. Models pneumatic motors or compressors.'
  },
  gas_translational_conv: {
    equations: ['mdot = (A/R*T) * v', 'F_force = A * (Pa - Ph)'],
    latex: ['\dot{m} = \frac{A}{RT} v', 'f = A \Delta P'],
    across: 'P, m/s', through: 'mdot, N',
    description: 'Bridges Gas and Translational domains. Models pneumatic cylinders and actuators.'
  },
  gas_flow_source: {
    equations: ['mdot = S_m'],
    latex: ['\dot{m} = \dot{m}_{src}'],
    across: 'Pressure (Pa)', through: 'Mass Flow (kg/s)',
    description: 'An ideal mass flow source that maintains a fixed flow rate regardless of back-pressure.'
  },
  gas_pressure_source: {
    equations: ['Pa - Pb = S_p'],
    latex: ['\Delta P = P_{src}'],
    across: 'Pressure (Pa)', through: 'Mass Flow (kg/s)',
    description: 'Models a pump or compressor that maintains a constant pressure difference between ports.'
  },
  gas_properties: {
    equations: ['P = rho * R * T'],
    latex: ['P = \rho R T'],
    across: 'None', through: 'None',
    description: 'Defines the working fluid properties (R, Cp, etc.) for the connected gas network.'
  },
  mag_ref: {
    equations: ['mmf = 0'],
    latex: ['\\mathcal{F} = 0'],
    across: 'MMF (A-t)', through: 'Flux (Wb)',
    description: 'The magnetic ground. Represents zero magneto-motive force in the magnetic circuit.'
  },
  reluctance: {
    equations: ['mmf = R * phi'],
    latex: ['\\mathcal{F} = \\mathcal{R} \\phi'],
    across: 'MMF (A-t)', through: 'Flux (Wb)',
    description: 'Models resistance to magnetic flux, similar to electrical resistance. Depends on geometry and permeability.'
  },
  variable_reluctance: {
    equations: ['mmf = R(ctrl) * phi'],
    latex: ['\\mathcal{F} = \\mathcal{R}(u) \\phi'],
    across: 'MMF (A-t)', through: 'Flux (Wb)',
    description: 'A magnetic reluctance whose value is modulated by an external physical signal (PS).'
  },
  permanent_magnet: {
    equations: ['mmf = Hc * L'],
    latex: ['\\mathcal{F} = H_c L'],
    across: 'MMF (A-t)', through: 'Flux (Wb)',
    description: 'Models a hard magnetic material providing constant magneto-motive force (MMF).'
  },
  em_converter: {
    equations: ['V = N * dphi/dt', 'mmf = N * I'],
    latex: ['v = N \\frac{d\\phi}{dt}', '\\mathcal{F} = N i'],
    across: 'V, A-t', through: 'I, Wb',
    description: 'Bridges Electrical and Magnetic domains. Models a coil with N turns.'
  },
  reluctance_force: {
    equations: ['F = 0.5 * phi^2 * dR/dx'],
    latex: ['f = \\frac{1}{2} \\phi^2 \\frac{d\\mathcal{R}}{dx}'],
    across: 'A-t, m/s', through: 'Wb, N',
    description: 'Bridges Magnetic and Translational domains. Models the attraction force in solenoids or relays.'
  },
  mag_flux_sensor: {
    equations: ['phi_out = phi'],
    latex: ['\\phi_{out} = \\phi_{thru}'],
    across: 'None', through: 'Flux (Wb)',
    description: 'Measures the magnetic flux through a branch. Outputs the result as a physical signal (PS).'
  },
  mag_mmf_sensor: {
    equations: ['mmf_out = mmf_n - mmf_s'],
    latex: ['\\mathcal{F} = \\mathcal{F}_n - \\mathcal{F}_s'],
    across: 'MMF (A-t)', through: 'None',
    description: 'Measures the MMF difference between two magnetic nodes.'
  },
  mag_mmf_source: {
    equations: ['mmf_n - mmf_s = MMF_src'],
    latex: ['\\mathcal{F} = \\mathcal{F}_{src}'],
    across: 'MMF (A-t)', through: 'Flux (Wb)',
    description: 'An ideal magneto-motive force source, representing a constant current winding.'
  },
  mag_flux_source: {
    equations: ['phi = phi_src'],
    latex: ['\\phi = \\phi_{src}'],
    across: 'MMF (A-t)', through: 'Flux (Wb)',
    description: 'An ideal magnetic flux source.'
  },
  mag_controlled_mmf: {
    equations: ['mmf_n - mmf_s = S'],
    latex: ['\\mathcal{F} = S(t)'],
    across: 'MMF (A-t)', through: 'Flux (Wb)',
    description: 'A magnetic source whose MMF is driven by an external physical signal (PS).'
  },
  force_sensor: {
    equations: ['F_out = F'],
    latex: ['f = f_{thru}'],
    across: 'None', through: 'Force (N)',
    description: 'Measures the mechanical force acting through a branch. Outputs a physical signal (PS).'
  },
  rot_motion_sensor: {
    equations: ['W = omega', 'A = theta'],
    latex: ['\omega = \omega, \\theta = \\theta'],
    across: 'Ang. Vel (rad/s)', through: 'None',
    description: 'Measures angular velocity and displacement of a rotational node.'
  },
  torque_sensor: {
    equations: ['T_out = Torque'],
    latex: ['\tau = \tau_{thru}'],
    across: 'None', through: 'Torque (N-m)',
    description: 'Measures the transmitted torque through a rotational branch.'
  },
  force_source: {
    equations: ['F_a - F_b = F_src'],
    latex: ['f = F_{src}'],
    across: 'Velocity (m/s)', through: 'Force (N)',
    description: 'An ideal force generator that maintains a specific force regardless of terminal velocity.'
  },
  torque_source: {
    equations: ['T_r - T_c = T_src'],
    latex: ['\tau = T_{src}'],
    across: 'Ang. Vel (rad/s)', through: 'Torque (N-m)',
    description: 'An ideal torque generator for rotational networks.'
  },
  gear_box: {
    equations: ['omega2 = ratio * omega1', 'tau1 = ratio * tau2'],
    latex: ['\omega_2 = N \omega_1', '\tau_1 = N \tau_2'],
    across: 'Ang. Vel (rad/s)', through: 'Torque (N-m)',
    description: 'Models a mechanical transmission that scales velocity and torque based on the gear ratio.'
  },
  lever: {
    equations: ['v_b = -(L2/L1) * v_a', 'f_a = (L2/L1) * f_b'],
    latex: ['v_b = -\\frac{L_2}{L_1} v_a', 'f_a = \\frac{L_2}{L_1} f_b'],
    across: 'Velocity (m/s)', through: 'Force (N)',
    description: 'Models a mechanical lever. Scales translational velocity and force based on arm lengths.'
  },
  inertia: {
    equations: ['T = J * d(omega)/dt'],
    latex: ['\\tau = J \\dot{\\omega}'],
    across: 'Ang. Vel (rad/s)', through: 'Torque (N-m)',
    description: 'Models rotational inertia. Opposes changes in angular velocity.'
  },
  rot_ref: {
    equations: ['omega = 0'],
    latex: ['\\omega = 0'],
    across: 'Ang. Vel (rad/s)', through: 'Torque (N-m)',
    description: 'The rotational ground. Represents a stationary frame ($ \omega = 0 $).'
  },
  rot_spring: {
    equations: ['T = k * (theta_r - theta_c)'],
    latex: ['\\tau = k \\Delta \\theta'],
    across: 'Ang. Vel (rad/s)', through: 'Torque (N-m)',
    description: 'Models a rotational torsion spring. Torque is proportional to angular displacement.'
  },
  rot_damper: {
    equations: ['T = b * (omega_r - omega_c)'],
    latex: ['\\tau = b \\Delta \\omega'],
    across: 'Ang. Vel (rad/s)', through: 'Torque (N-m)',
    description: 'Models rotational viscous friction. Torque is proportional to relative angular velocity.'
  },
  rot_friction: {
    equations: ['T = f(omega, Ts, Tv)'],
    latex: ['\\tau = \\tau_f(\\omega)'],
    across: 'Ang. Vel (rad/s)', through: 'Torque (N-m)',
    description: 'Models non-linear rotational friction, including static and kinetic effects.'
  },
  rot_hard_stop: {
    equations: ['T = T_stop if theta out of range'],
    latex: ['\\tau = \\tau_{stop}(\\theta)'],
    across: 'Ang. Vel (rad/s)', through: 'Torque (N-m)',
    description: 'Restricts the range of motion of a rotational branch using spring-damper stop logic.'
  },
  mass: {
    equations: ['F = m * dv/dt'],
    latex: ['f = m \\dot{v}'],
    across: 'Velocity (m/s)', through: 'Force (N)',
    description: 'Models translational mass. Opposes changes in linear velocity following Newton\'s second law.'
  },
  trans_ref: {
    equations: ['v = 0'],
    latex: ['v = 0'],
    across: 'Velocity (m/s)', through: 'Force (N)',
    description: 'The translational ground. Represents a stationary reference frame ($ v = 0 $).'
  },
  trans_spring: {
    equations: ['F = k * (x_r - x_c)'],
    latex: ['f = k \\Delta x'],
    across: 'Velocity (m/s)', through: 'Force (N)',
    description: 'Models a translational spring. Force is proportional to linear displacement.'
  },
  trans_damper: {
    equations: ['F = b * (v_r - v_c)'],
    latex: ['f = b \\Delta v'],
    across: 'Velocity (m/s)', through: 'Force (N)',
    description: 'Models linear viscous damping. Force is proportional to relative velocity.'
  },
  trans_friction: {
    equations: ['F = f(v, Fs, Fv)'],
    latex: ['f = f_f(v)'],
    across: 'Velocity (m/s)', through: 'Force (N)',
    description: 'Models complex translational friction, including Stribeck and Coulomb effects.'
  },
  trans_hard_stop: {
    equations: ['F = F_stop if x out of range'],
    latex: ['f = f_{stop}(x)'],
    across: 'Velocity (m/s)', through: 'Force (N)',
    description: 'Restricts linear travel distance using mechanical stop physics.'
  },
  ma_ref: {
    equations: ['P = 0', 'T = 0', 'phi = 0'],
    latex: ['P, T, \phi = 0'],
    across: 'P, T, H', through: 'm, Q, mw',
    description: 'The reference point for moist air networks, representing zero pressure, temperature, and humidity.'
  },
  ma_chamber: {
    equations: ['dm/dt = f(V, P, T)', 'dQ/dt = f(T, P)'],
    latex: ['\dot{m}, \dot{Q} = f(V, P, T)'],
    across: 'P, T, H', through: 'm, Q, mw',
    description: 'Models a fixed-volume moist air chamber. Tracks mass, energy, and vapor content over time.'
  },
  ma_pipe: {
    equations: ['Delta P = f(L, m)', 'Delta T = f(h, Q)'],
    latex: ['\Delta P, \Delta T = f(\dot{m}, \dot{Q})'],
    across: 'P, T, H', through: 'm, Q, mw',
    description: 'Models a cylindrical pipe for moist air flow. Accounts for pressure drop and heat transfer.'
  },
  ma_separator: {
    equations: ['mw_removed = eff * mw_in'],
    latex: ['\dot{m}_{w,rem} = \eta \dot{m}_{w,in}'],
    across: 'P, T, H', through: 'm, Q, mw',
    description: 'Models a moisture separator. Removes water vapor from the air stream based on efficiency.'
  },
  ma_flow_sensor: {
    equations: ['m_out = m_thru'],
    latex: ['\dot{m}_{out} = \dot{m}'],
    across: 'None', through: 'Mass Flow (kg/s)',
    description: 'Measures the total mass flow rate of the moist air mixture.'
  },
  ma_pt_sensor: {
    equations: ['P_out = P', 'T_out = T'],
    latex: ['P_{out} = P, T_{out} = T'],
    across: 'P, T, H', through: 'None',
    description: 'Measures the pressure and temperature at a moist air node.'
  },
  ma_thermo_sensor: {
    equations: ['rho_out = rho(P, T, H)'],
    latex: ['\rho_{out} = \rho(P, T, \phi)'],
    across: 'P, T, H', through: 'None',
    description: 'Calculates and outputs secondary thermodynamic properties like density or humidity ratio.'
  },
  ma_moisture_source: {
    equations: ['mw = S_w'],
    latex: ['\dot{m}_w = \dot{m}_{w,src}'],
    across: 'P, T, H', through: 'm, Q, mw',
    description: 'Injects water vapor or liquid moisture into the moist air stream.'
  },
  ma_flow_src: {
    equations: ['m = S_m'],
    latex: ['\dot{m} = \dot{m}_{src}'],
    across: 'P, T, H', through: 'm, Q, mw',
    description: 'An ideal mass flow source for the air-vapor mixture.'
  },
  ma_pres_src: {
    equations: ['Pa - Pb = S_p'],
    latex: ['\Delta P = P_{src}'],
    across: 'P, T, H', through: 'm, Q, mw',
    description: 'Models a pump or fan that maintains a pressure difference in a moist air network.'
  },
  ma_props: {
    equations: ['State = f(P_std, T_std)'],
    latex: ['State = f(P_{std}, T_{std})'],
    across: 'None', through: 'None',
    description: 'Defines the standard reference properties for the moist air medium in the network.'
  },
  ps_add: {
    equations: ['y = u1 + u2'],
    latex: ['y = u_1 + u_2'],
    across: 'None', through: 'None',
    description: 'Performs mathematical addition of two physical signals with unit propagation.'
  },
  ps_subtract: {
    equations: ['y = u1 - u2'],
    latex: ['y = u_1 - u_2'],
    across: 'None', through: 'None',
    description: 'Performs mathematical subtraction of two physical signals.'
  },
  ps_gain: {
    equations: ['y = gain * u'],
    latex: ['y = K u'],
    across: 'None', through: 'None',
    description: 'Amplifies a physical signal by a configurable factor K.'
  },
  ps_product: {
    equations: ['y = u1 * u2'],
    latex: ['y = u_1 \\times u_2'],
    across: 'None', through: 'None',
    description: 'Multiplies two physical signals together.'
  },
  ps_divide: {
    equations: ['y = u1 / u2'],
    latex: ['y = \\frac{u_1}{u_2}'],
    across: 'None', through: 'None',
    description: 'Divides one physical signal by another.'
  },
  ps_delay: {
    equations: ['y(t) = u(t - delay)'],
    latex: ['y(t) = u(t - \\tau)'],
    across: 'None', through: 'None',
    description: 'Implements a time-shift or transport delay in a physical signal path.'
  },
  ps_math: {
    equations: ['y = f(u)'],
    latex: ['y = f(u)'],
    across: 'None', through: 'None',
    description: 'Applies a mathematical function (exp, log, sin, etc.) to the input signal.'
  },
  ps_integrator: {
    equations: ['dy/dt = u'],
    latex: ['y = \\int u dt'],
    across: 'None', through: 'None',
    description: 'Computes the time-integral of the input signal. Used for state accumulation.'
  },
  ps_transfer_fcn: {
    equations: ['T*dy/dt + y = u'],
    latex: ['G(s) = \\frac{1}{Ts + 1}'],
    across: 'None', through: 'None',
    description: 'Models a first-order dynamic response or lag in a signal path.'
  },
  ps_lookup_1d: {
    equations: ['y = interp1(table, u)'],
    latex: ['y = f_{1D}(u)'],
    across: 'None', through: 'None',
    description: 'Implements a 1-dimensional lookup table with interpolation.'
  },
  ps_abs: {
    equations: ['y = |u|'],
    latex: ['y = |u|'],
    across: 'None', through: 'None',
    description: 'Outputs the absolute magnitude of the input signal.'
  },
  ps_saturation: {
    equations: ['y = min(upper, max(lower, u))'],
    latex: ['y = \\text{sat}(u)'],
    across: 'None', through: 'None',
    description: 'Limits the signal between a configurable upper and lower bound.'
  },
  ps_dead_zone: {
    equations: ['y = 0 if lower < u < upper else u'],
    latex: ['y = \\text{deadzone}(u)'],
    across: 'None', through: 'None',
    description: 'Models a region where the signal has no effect (outputs zero).'
  },
  ps_switch: {
    equations: ['y = u1 if ctrl > threshold else u2'],
    latex: ['y = \\begin{cases} u_1 & \\text{if } C > T \\\\ u_2 & \\text{otherwise} \\end{cases}'],
    across: 'None', through: 'None',
    description: 'Selects between two signals based on a threshold-controlled port.'
  },
  ps_constant: {
    equations: ['y = C'],
    latex: ['y = C'],
    across: 'None', through: 'None',
    description: 'Generates a constant physical signal value.'
  },
  ps_sine: {
    equations: ['y = A * sin(2*pi*f*t)'],
    latex: ['y = A \\sin(2\\pi f t)'],
    across: 'None', through: 'None',
    description: 'Generates a sinusoidal physical signal.'
  },
  ps_step: {
    equations: ['y = val_init if t < t_step else val_final'],
    latex: ['y = \\text{step}(t)'],
    across: 'None', through: 'None',
    description: 'Implements a step transition in a signal at a specific time.'
  },
  ps_rms: {
    equations: ['y = sqrt(avg(u^2))'],
    latex: ['y = \\sqrt{\\frac{1}{T} \\int u^2 dt}'],
    across: 'None', through: 'None',
    description: 'Estimates the Root Mean Square of a signal over a sliding window.'
  },
  bldc_commutation: {
    equations: ['Logic based on Hall [H1 H2 H3]', 'Step 1: A+, B-', 'Step 2: A+, C-', '...'],
    latex: ['f_{logic}(H, Dir) \to S_{abc}'],
    across: 'None', through: 'None',
    description: 'Implements the 6-step trapezoidal commutation logic for BLDC motors. Maps Hall-effect sensor states to phase switching sequences.'
  },
  bldc_current_ctrl: {
    equations: ['Error = IsRef - Is', 'Vabc = PI(Error) * CommLogic'],
    latex: ['V_{ref} = (K_p + \\frac{K_i}{s}) \Delta I'],
    across: 'None', through: 'None',
    description: 'A proportional-integral (PI) current controller optimized for BLDC motors. Regulates phase currents based on reference setpoints and rotor position.'
  },
  bldc_pwm_ctrl: {
    equations: ['Duty = Vref / Vdc', 'G = PWM(Duty, f_sw)'],
    latex: ['G = \\text{PWM}(V_{ctrl})'],
    across: 'None', through: 'None',
    description: 'Integrated current controller and PWM generator. Directly outputs gate signals (G) for a three-phase inverter bridge.'
  },
  dcdc_ctrl: {
    equations: ['Error = Vref - V', 'Duty = PI(Error) + FF'],
    latex: ['D = (K_p + \\frac{K_i}{s}) \Delta V + V_{ff}'],
    across: 'None', through: 'None',
    description: 'A voltage regulator for DC-DC converters. Includes an optional feed-forward (FF) input for improved transient response.'
  },
  pfc_rectifier_ctrl: {
    equations: ['V_ref = PI(Vdc_err)', 'I_ref = V_ref * sin(theta)', 'Vabc_ref = PI(I_err)'],
    latex: ['\mathbf{V}_{abc}^* = f(V_{dc}, Q, \mathbf{I}_{abc})'],
    across: 'None', through: 'None',
    description: 'A comprehensive Power Factor Correction (PFC) controller for three-phase rectifiers. Regulates DC bus voltage while maintaining sinusoidal grid currents.'
  },
  cycloconverter_ctrl: {
    equations: ['Phase = f(Vref, fref)', 'Trigger = Logic(Phase, Vabc)'],
    latex: ['P = f(V, f, \mathbf{V}_{abc})'],
    across: 'None', through: 'None',
    description: 'Controls the firing pulses for a three-phase bridge cycloconverter. Adjusts output frequency and voltage magnitude.'
  },
  ps_pi_ctrl: {
    equations: ['u(k) = u(k-1) + Kp*(e(k)-e(k-1)) + Ki*Ts*e(k)'],
    latex: ['U(z) = (K_p + K_i \\frac{T_s}{z-1}) E(z)'],
    across: 'None', through: 'None',
    description: 'A discrete-time Proportional-Integral controller with anti-windup. Essential for closed-loop regulation of physical systems.'
  },
  ps_lpf: {
    equations: ['y(k) = alpha*u(k) + (1-alpha)*y(k-1)'],
    latex: ['Y(s) = \\frac{1}{Ts+1} U(s)'],
    across: 'None', through: 'None',
    description: 'A first-order low-pass filter. Attenuates high-frequency noise from sensors and control signals.'
  },
  ps_integrator_gen: {
    equations: ['y(k) = y(k-1) + Ts*u(k)'],
    latex: ['y = \\int u dt'],
    across: 'None', through: 'None',
    description: 'A generalized integrator with reset capability. Computes the accumulation of a signal over time.'
  },
  ps_moving_avg: {
    equations: ['y(k) = sum(u(k-N:k)) / N'],
    latex: ['y = \\frac{1}{N} \\sum_{i=0}^{N-1} u_{k-i}'],
    across: 'None', through: 'None',
    description: 'Computes the arithmetic mean of the input signal over a sliding window of N samples.'
  },
  ps_sr_flipflop: {
    equations: ['Q = (S or Q) and (not R)'],
    latex: ['Q_{next} = S \\lor (Q \\land \\neg R)'],
    across: 'None', through: 'None',
    description: 'A standard Set-Reset latch. Sets output high on S signal and resets on R signal.'
  },
  ps_sample_hold: {
    equations: ['y = u if S > 0.5 else y_prev'],
    latex: ['y = \\text{S\&H}(u, S)'],
    across: 'None', through: 'None',
    description: 'Captures and holds the value of the input signal whenever the sample trigger (S) is high.'
  },
  ps_smith_predictor: {
    equations: ['y_pred = G_model * (1 - e^-s*tau) * u'],
    latex: ['U = C(s) [R - (Y + (G_{pred} - G_{delay}) U)]'],
    across: 'None', through: 'None',
    description: 'An advanced dead-time compensation controller. Predicts the plant output to eliminate the instability caused by transport delays.'
  },
  ps_sine_3phase: {
    equations: ['Va = m * sin(wt)', 'Vb = m * sin(wt - 120)', 'Vc = m * sin(wt + 120)'],
    latex: ['V_{abc} = M \\begin{bmatrix} \\sin(\\omega t) \\\\ \\sin(\\omega t - 120^\\circ) \\\\ \\sin(\\omega t + 120^\\circ) \\end{bmatrix}'],
    across: 'None', through: 'None',
    description: 'Generates a three-phase sinusoidal physical signal vector with configurable amplitude and frequency.'
  },
  ps_second_order_filter: {
    equations: ['d2y/dt2 + 2*zeta*wn*dy/dt + wn^2*y = wn^2*u'],
    latex: ['G(s) = \\frac{\\omega_n^2}{s^2 + 2\\zeta\\omega_n s + \\omega_n^2}'],
    across: 'None', through: 'None',
    description: 'A second-order low-pass filter with damping ratio (zeta) and natural frequency (wn).'
  },
  ps_state_feedback: {
    equations: ['u = -K * x + r'],
    latex: ['u = -\\mathbf{K}\\mathbf{x} + r'],
    across: 'None', through: 'None',
    description: 'Implements state-feedback control logic. Calculates the control effort u based on the state vector x and feedback gains K.'
  },
  ps_sliding_mode: {
    equations: ['s = error_dot + lambda * error', 'u = -k * sign(s)'],
    latex: ['u = -K \\text{sgn}(s), s = \\dot{e} + \\lambda e'],
    across: 'None', through: 'None',
    description: 'A robust sliding mode controller. Uses a switching law to force the system state onto a sliding surface (s=0).'
  },
  ps_stair_gen: {
    equations: ['y = steps[floor(t / Ts) % N]'],
    latex: ['y(t) = S[k]'],
    across: 'None', through: 'None',
    description: 'Generates a periodic stair-step signal defined by a vector of values.'
  },
  ps_washout: {
    equations: ['Y(s) = (Ts / (Ts + 1)) * U(s)'],
    latex: ['G(s) = \\frac{Ts}{Ts + 1}'],
    across: 'None', through: 'None',
    description: 'A washout filter (high-pass) that removes the steady-state component of a signal, allowing only transients to pass.'
  },
  dc_current_ctrl: {
    equations: ['V_err = I_ref - I', 'vRef = PI(V_err)', 'vRef = clip(vRef, -vMax, vMax)'],
    latex: ['V_{ref} = \\text{sat}((K_p + \\frac{K_i}{s}) \Delta I, V_{max})'],
    across: 'None', through: 'None',
    description: 'A dedicated current regulator for DC machines. Includes anti-windup and voltage clamping to protect the motor armature.'
  },
  dc_voltage_ctrl: {
    equations: ['V_err = V_ref - V', 'Control = PI(V_err)'],
    latex: ['U = (K_p + \\frac{K_i}{s}) \Delta V'],
    across: 'None', through: 'None',
    description: 'Regulates the terminal voltage of a DC generator or bus. Essential for maintaining stability in DC microgrids.'
  },
  hysteresis_ctrl_3ph: {
    equations: ['S = 1 if (I* - I) > band/2 else 0 if (I* - I) < -band/2 else S_prev'],
    latex: ['S = \\begin{cases} 1 & \Delta I > \\delta/2 \\\\ 0 & \Delta I < -\\delta/2 \\end{cases}'],
    across: 'None', through: 'None',
    description: 'Implements a bang-bang (hysteresis) current control law for three-phase systems. Maintains the current within a specified tolerance band.'
  },
  velocity_ctrl: {
    equations: ['W_err = wRef - wMech', 'Tq = PI(W_err)', 'Tq = clip(Tq, TqMin, TqMax)'],
    latex: ['T_{ref} = (K_p + \\frac{K_i}{s}) \Delta \omega'],
    across: 'None', through: 'None',
    description: 'The outer loop of a motor drive system. Regulates mechanical speed by generating a torque reference for the inner current loops.'
  },
  im_scalar_ctrl: {
    equations: ['V_mag = v_f_ratio * f_ref', 'Vabc = V_mag * [sin(wt) sin(wt-120) sin(wt+120)]'],
    latex: ['V_{ref} = K \\cdot f_{ref}'],
    across: 'None', through: 'None',
    description: 'Implements Scalar Control (V/f) for induction motors. Maintains constant air-gap flux by keeping the voltage-to-frequency ratio constant.'
  },
  im_foc_ctrl: {
    equations: ['id_ref = FluxRef / Lm', 'iq_ref = TqRef / (k * Flux)', 'Vdq = PI(idq_err) + FeedForward'],
    latex: ['\mathbf{V}_{dq} = \mathbf{C}_{abc \\to dq} \mathbf{V}_{abc}'],
    across: 'None', through: 'None',
    description: 'Field-Oriented Control (FOC) for induction machines. Decouples torque and flux control into separate d-axis and q-axis current loops, allowing DC-motor-like performance.'
  },
  im_dtc_ctrl: {
    equations: ['Flux_err = Flux_ref - Flux_est', 'Tq_err = Tq_ref - Tq_est', 'Vector = Lookup(Flux_err, Tq_err, Sector)'],
    latex: ['S = f_{DTC}(\Delta \Psi, \Delta T, \theta)'],
    across: 'None', through: 'None',
    description: 'Direct Torque Control (DTC). Uses hysteresis band controllers and a lookup table to directly select inverter switching vectors based on estimated flux and torque.'
  },
  im_curr_ctrl: {
    equations: ['Vdq_ref = PI(idq_err) + vdqFF', 'Vdq_ref = sat(Vdq_ref, Vmax)'],
    latex: ['\mathbf{V}_{dq}^* = PI(\mathbf{I}_{dq}^* - \mathbf{I}_{dq}) + \mathbf{V}_{ff}'],
    across: 'None', through: 'None',
    description: 'A high-performance $dq$-axis current regulator for induction machines. Includes cross-coupling decoupling and voltage feed-forward.'
  },
  clarke_transform: {
    equations: ['alpha = 2/3 * (a - 0.5*b - 0.5*c)', 'beta = 2/3 * (sqrt(3)/2*b - sqrt(3)/2*c)', 'zero = 1/3 * (a + b + c)'],
    latex: ['\mathbf{x}_{\\alpha\\beta0} = \mathbf{T}_{clarke} \mathbf{x}_{abc}'],
    across: 'None', through: 'None',
    description: 'Converts 3-phase stationary coordinates (abc) to 2-phase stationary coordinates (alpha-beta-0). Follows the amplitude-invariant convention.'
  },
  inv_clarke_transform: {
    equations: ['a = alpha + zero', 'b = -0.5*alpha + sqrt(3)/2*beta + zero', 'c = -0.5*alpha - sqrt(3)/2*beta + zero'],
    latex: ['\mathbf{x}_{abc} = \mathbf{T}_{clarke}^{-1} \mathbf{x}_{\\alpha\\beta0}'],
    across: 'None', through: 'None',
    description: 'Transforms 2-phase stationary coordinates back to 3-phase stationary coordinates.'
  },
  park_transform: {
    equations: ['d = cos(th)*alpha + sin(th)*beta', 'q = -sin(th)*alpha + cos(th)*beta', '0 = zero'],
    latex: ['\mathbf{x}_{dq0} = \mathbf{T}_{park}(\\theta) \mathbf{x}_{\\alpha\\beta0}'],
    across: 'None', through: 'None',
    description: 'Converts 2-phase stationary coordinates (alpha-beta) to rotating coordinates (dq) based on the rotor alignment convention.'
  },
  inv_park_transform: {
    equations: ['alpha = cos(th)*d - sin(th)*q', 'beta = sin(th)*d + cos(th)*q', 'zero = 0'],
    latex: ['\mathbf{x}_{\\alpha\\beta0} = \mathbf{T}_{park}^{-1}(\\theta) \mathbf{x}_{dq0}'],
    across: 'None', through: 'None',
    description: 'Transforms rotating dq coordinates back to stationary alpha-beta coordinates.'
  },
  sym_comp_transform: {
    equations: ['pos = 1/3 * (a + a^1*b + a^2*c)', 'neg = 1/3 * (a + a^2*b + a^1*c)', 'zero = 1/3 * (a + b + c)'],
    latex: ['\mathbf{x}_{+-0} = \mathbf{T}_{sym} \mathbf{x}_{abc}'],
    across: 'None', through: 'None',
    description: 'Decomposes an unbalanced three-phase system into positive, negative, and zero sequence components using Symmetrical Components theory.'
  },
  inv_sym_comp_transform: {
    equations: ['a = p + n + z', 'b = a^2*p + a*n + z', 'c = a*p + a^2*n + z'],
    latex: ['\mathbf{x}_{abc} = \mathbf{T}_{sym}^{-1} \mathbf{x}_{+-0}'],
    across: 'None', through: 'None',
    description: 'Synthesizes three-phase $abc$ signals from their positive, negative, and zero sequence components.'
  },
  im_flux_observer: {
    equations: ['d(phi_r)/dt = -(1/Tr)*phi_r + (Lm/Tr)*is', 'theta = atan2(phi_beta, phi_alpha)'],
    latex: ['\dot{\hat{\Psi}}_r = -\frac{1}{T_r} \hat{\Psi}_r + \frac{L_m}{T_r} \mathbf{i}_s'],
    across: 'None', through: 'None',
    description: 'Estimates the rotor flux magnitude and angle for an induction machine. Essential for sensorless FOC or flux-oriented regulation.'
  },
  luenberger_observer: {
    equations: ['dx_hat/dt = A*x_hat + B*u + L*(y - C*x_hat)'],
    latex: ['\dot{\hat{\mathbf{x}}} = \mathbf{A}\hat{\mathbf{x}} + \mathbf{B}\mathbf{u} + \mathbf{L}(\mathbf{y} - \mathbf{C}\hat{\mathbf{x}})'],
    across: 'None', through: 'None',
    description: 'A classic Luenberger state observer. Estimates internal system states (x_hat) by combining a plant model with an error correction term based on output measurements (y).'
  },
  quad_decoder: {
    equations: ['count = count + (A_edge ? (B ? -1 : 1) : 0)', 'theta = 2*pi * count / PPR'],
    latex: ['\theta = \frac{2\pi \cdot N_{pulses}}{PPR}'],
    across: 'None', through: 'None',
    description: 'Decodes signals from a quadrature incremental encoder. Calculates precise shaft position and angular velocity from Phase A and B pulse sequences.'
  },
  resolver_to_digital: {
    equations: ['theta = atan2(Vy, Vx)', 'omega = d(theta)/dt'],
    latex: ['\theta = \arctan\left(\frac{V_{sin}}{V_{cos}}\right)'],
    across: 'None', through: 'None',
    description: 'Models a Resolver-to-Digital (R/D) conversion loop. Extracts rotor position and speed from high-frequency carrier signals (Sine/Cosine envelopes).'
  },
  pmsm_curr_ctrl: {
    equations: ['Vd = PI(id_err) - w*Lq*iq', 'Vq = PI(iq_err) + w*(Ld*id + Flux)'],
    latex: ['\mathbf{V}_{dq}^* = PI(\mathbf{I}_{dq}^* - \mathbf{I}_{dq}) + \mathbf{V}_{decoupling}'],
    across: 'None', through: 'None',
    description: 'A dedicated dq-axis current regulator for PMSM machines. Includes cross-coupling decoupling and voltage feed-forward to maintain torque control at high speeds.'
  },
  pmsm_ref_gen: {
    equations: ['id_ref = f(MTPA, TqRef)', 'iq_ref = TqRef / (1.5*P*(Flux + (Ld-Lq)*id))'],
    latex: ['i_{dq}^* = f_{MTPA}(T_{ref})'],
    across: 'None', through: 'None',
    description: 'Generates optimal d-axis and q-axis current references for a PMSM. Implements Maximum Torque Per Ampere (MTPA) trajectories to maximize efficiency.'
  },
  pmsm_foc: {
    equations: ['dq = ClarkePark(abc, theta)', 'Vabc = InvParkClarke(Vdq, theta)'],
    latex: ['\mathbf{V}_{abc} = \mathbf{T}^{-1} \mathbf{V}_{dq}'],
    across: 'None', through: 'None',
    description: 'Complete Field-Oriented Control (FOC) system for Permanent Magnet machines. Coordinates transformations, current loops, and speed regulation.'
  },
  pmsm_field_weakening: {
    equations: ['V_mag = sqrt(Vd^2 + Vq^2)', 'id_fw = id_ref - PI(V_max - V_mag)'],
    latex: ['i_d^* = i_{d,ref} + \Delta i_{d,fw}'],
    across: 'None', through: 'None',
    description: 'Extends the operating range of a PMSM above rated speed. Injecting negative d-axis current opposes the permanent magnet flux to limit terminal voltage.'
  },
  pmsm_tq_est: {
    equations: ['Tq = 1.5 * P * (Flux*iq + (Ld - Lq)*id*iq)'],
    latex: ['T_e = \\frac{3}{2} p [\Psi_m i_q + (L_d - L_q) i_d i_q]'],
    across: 'None', through: 'None',
    description: 'Estimates the electromagnetic torque produced by a PMSM based on measured currents and known machine parameters (flux, inductances).'
  },
  pwm_3ph_2level: {
    equations: ['g = 1 if Vabc > Carrier else 0'],
    latex: ['g = \\text{sgn}(V_{abc} - V_{tri})'],
    across: 'None', through: 'None',
    description: 'Generates gate signals for a standard two-level three-phase inverter. Uses carrier-based comparison to modulate the duty cycle.'
  },
  pwm_3ph_3level: {
    equations: ['g = 1 if Vabc > C1 else 0 if Vabc < C2 else 0.5'],
    latex: ['g \\in \\{-1, 0, 1\\}'],
    across: 'None', through: 'None',
    description: 'Generates gate signals for three-level inverters (e.g., NPC). Uses two vertically offset carriers to create three output voltage levels.'
  },
  pwm_vienna: {
    equations: ['g = f(Vabc, Iabc, Vdc, Neutral)'],
    latex: ['g = \\text{Logic}(V, I, V_{dc})'],
    across: 'None', through: 'None',
    description: 'Specialized PWM generator for Vienna Rectifiers. Ensures sinusoidal input currents and neutral-point balance.'
  },
  thyristor_6pulse: {
    equations: ['Trigger if theta > alpha + phase_offset'],
    latex: ['G = \\delta(t - t_{\\alpha})'],
    across: 'None', through: 'None',
    description: 'Generates firing pulses for a 6-pulse thyristor bridge (Graetz circuit). Controlled by the firing angle alpha.'
  },
  thyristor_12pulse: {
    equations: ['G_delta = Trigger(alpha)', 'G_wye = Trigger(alpha + 30)'],
    latex: ['G_{12} = \\{G_{\\Delta}, G_{Y}\\}'],
    across: 'None', through: 'None',
    description: 'Generates coordinated firing pulses for a 12-pulse converter, consisting of delta and wye connected bridges with a 30-degree phase shift.'
  },
  belt_properties: {
    equations: ['E = youngs', 'rho = density'],
    latex: ['E, \rho = \\text{const}'],
    across: 'None', through: 'None',
    description: 'Defines the material and physical properties for a connected belt or cable network, such as elasticity and linear mass density.'
  },
  belt_end: {
    equations: ['F = k * x', 'v = dx/dt'],
    latex: ['F = k \Delta x'],
    across: 'Velocity (m/s)', through: 'Force (N)',
    description: 'Models the termination point of a belt or cable, typically connected to a translational reference or load.'
  },
  belt_spool: {
    equations: ['v = omega * R', 'T = F * R'],
    latex: ['v = \omega R', '\\tau = F R'],
    across: 'Velocity, Ang. Vel', through: 'Force, Torque',
    description: 'Converts between rotational and translational motion using a spool or winch mechanism. The coupling is defined by the spool radius.'
  },
  pulley: {
    equations: ['vA = omega * R', 'vB = -omega * R', 'T = (FA - FB) * R'],
    latex: ['v = \pm \omega R', '\\tau = (F_A - F_B) R'],
    across: 'Velocity, Ang. Vel', through: 'Force, Torque',
    description: 'Models a physical pulley with inertia. Transfers force between two belt segments while converting rotational motion to linear travel.'
  },
  world_frame: {
    equations: ['R = Identity', 'P = [0 0 0]'],
    latex: ['\mathbf{T}_{world} = \mathbf{I}_{4x4}'],
    across: 'Frame', through: 'None',
    description: 'The global inertial reference frame for a multibody system. All other frames are ultimately defined relative to this absolute coordinate system.'
  },
  ref_frame: {
    equations: ['T = T_parent * T_local'],
    latex: ['\mathbf{T}_i = \mathbf{T}_{i-1} \mathbf{T}_{rel}'],
    across: 'Frame', through: 'None',
    description: 'Defines a local coordinate system at a specific location and orientation on a multibody component.'
  },
  rigid_transform: {
    equations: ['f = b + offset', 'Rf = Rb * R_rotation'],
    latex: ['\mathbf{T}_f = \mathbf{T}_b \mathbf{T}_{offset}'],
    across: 'Frame', through: 'None',
    description: 'Applies a fixed translation and rotation between two frames. Models rigid connections between multibody parts.'
  },
  dist_constraint: {
    equations: ['dist(b, f) = L_set', 'Force = lambda * Grad(dist)'],
    latex: ['\|\mathbf{P}_f - \mathbf{P}_b\| = L'],
    across: 'Frame', through: 'Force (N)',
    description: 'Maintains a constant distance between two frames. Implements a kinematic constraint using Lagrange multipliers.'
  },
  angle_constraint: {
    equations: ['angle(b, f) = Theta_set'],
    latex: ['\\theta_{bf} = \Theta_{const}'],
    across: 'Frame', through: 'Torque (N-m)',
    description: 'Maintains a fixed angular relationship between two frames.'
  },
  grav_field: {
    equations: ['F = m * g'],
    latex: ['\mathbf{F}_g = m \mathbf{g}'],
    across: 'Frame', through: 'Force (N)',
    description: 'Applies a uniform gravitational force to all mass-bearing components in the multibody system.'
  },
  spring_damper_force: {
    equations: ['F = k*(x - x0) + b*v'],
    latex: ['F = k \Delta x + b \dot{x}'],
    across: 'Frame', through: 'Force (N)',
    description: 'Models a linear spring and damper acting between two frames. Opposes displacement and relative velocity.'
  },
  external_force: {
    equations: ['F_total = F_ext + T_ext'],
    latex: ['\mathbf{F}_{ext} = \mathbf{f}(t)'],
    across: 'Frame', through: 'Force, Torque',
    description: 'Allows for the application of time-varying forces and torques from external physical signals (PS).'
  },
  revolute_joint: {
    equations: ['theta = angle(b, f)', 'Tau = J*alpha + b*omega'],
    latex: ['\\tau = J \dot{\omega} + B \omega'],
    across: 'Ang. Vel', through: 'Torque (N-m)',
    description: 'A 1-DOF rotational joint that allows rotation about a single axis. Constrains all translational and remaining rotational degrees of freedom.'
  },
  prismatic_joint: {
    equations: ['v = dx/dt', 'F = m*a + b*v'],
    latex: ['F = m \ddot{x} + B \dot{x}'],
    across: 'Velocity', through: 'Force (N)',
    description: 'A 1-DOF translational joint that allows sliding along a single axis while constraining all other motions.'
  },
  spherical_joint: {
    equations: ['P_b = P_f', 'v_b = v_f'],
    latex: ['\mathbf{P}_b = \mathbf{P}_f'],
    across: 'Frame', through: 'Force (N)',
    description: 'A 3-DOF "ball-and-socket" joint. Constrains the relative translation between two frames while allowing free rotation.'
  },
  universal_joint: {
    equations: ['DOF = 2 (Rotation)'],
    latex: ['\\text{DOF} = 2'],
    across: 'Frame', through: 'Torque (N-m)',
    description: 'A 2-DOF joint that transmits rotation between non-parallel axes, common in drive shafts.'
  },
  weld_joint: {
    equations: ['Tb = Tf', 'vb = vf', 'wb = wf'],
    latex: ['\mathbf{T}_b = \mathbf{T}_f'],
    across: 'Frame', through: 'Force, Torque',
    description: 'A 0-DOF constraint that rigidly locks two frames together. No relative motion is permitted.'
  },
  common_gear: {
    equations: ['omega_f = ratio * omega_b', 'Tau_b = ratio * Tau_f'],
    latex: ['\omega_f = N \omega_b', '\\tau_b = N \\tau_f'],
    across: 'Ang. Vel', through: 'Torque (N-m)',
    description: 'Models a kinematic coupling between two rotational axes (gears). Transmits torque based on the specified gear ratio.'
  },
  rack_pinion: {
    equations: ['v_f = omega_b * R', 'Tau_b = F_f * R'],
    latex: ['v_l = \omega R', '\\tau = F R'],
    across: 'Velocity, Ang. Vel', through: 'Force, Torque',
    description: 'Converts rotational motion from a pinion gear into linear motion of a rack. The coupling is defined by the pinion radius.'
  },
  mech_config: {
    equations: ['g = gravity_vector'],
    latex: ['\mathbf{g} = [g_x, g_y, g_z]'],
    across: 'None', through: 'None',
    description: 'Defines global parameters for the mechanical mechanism, including the gravity vector and uniform linearization parameters.'
  },
  conductive_heat: {
    equations: ['Q = k * (Ta - Tb)'],
    latex: ['Q = G \Delta T'],
    across: 'T', through: 'Q',
    description: 'Models heat conduction through a material (Fourier\'s Law).'
  },
  convective_heat: {
    equations: ['Q = h * A * (Ta - Tb)'],
    latex: ['Q = h A \Delta T'],
    across: 'T', through: 'Q',
    description: 'Models heat transfer between a surface and a fluid (Newton\'s Law of Cooling).'
  },
  radiative_heat: {
    equations: ['Q = eps * sigma * A * (Ta^4 - Tb^4)'],
    latex: ['Q = \epsilon \sigma A (T_a^4 - T_b^4)'],
    across: 'T', through: 'Q',
    description: 'Models thermal radiation between surfaces (Stefan-Boltzmann Law).'
  },
  thermal_mass: {
    equations: ['Q = C * dTa/dt'],
    latex: ['Q = C \frac{dT}{dt}'],
    across: 'T', through: 'Q',
    description: 'Models energy storage in a material based on its specific heat capacity.'
  },
  temp_sensor: {
    equations: ['T_out = Ta - Tb'],
    latex: ['T_{out} = \Delta T'],
    across: 'T', through: 'None',
    description: 'Measures the temperature difference between two nodes.'
  },
  heat_sensor: {
    equations: ['Q_out = Q'],
    latex: ['Q_{out} = Q'],
    across: 'None', through: 'Q',
    description: 'Measures the heat flow rate through a thermal branch.'
  },
  heat_src: {
    equations: ['Q = S_q'],
    latex: ['Q = Q_{src}'],
    across: 'T', through: 'Q',
    description: 'An ideal heat flow source that injects a fixed power into the network.'
  },
  temp_src: {
    equations: ['T = S_t'],
    latex: ['T = T_{src}'],
    across: 'T', through: 'Q',
    description: 'An ideal temperature source that maintains a fixed potential node.'
  },
  ctrl_heat_src: {
    equations: ['Q = S_input'],
    latex: ['Q = f(S_{ctrl})'],
    across: 'T', through: 'Q',
    description: 'A heat flow source driven by an external physical signal (PS).'
  },
  ctrl_temp_src: {
    equations: ['T = S_input'],
    latex: ['T = f(S_{ctrl})'],
    across: 'T', through: 'Q',
    description: 'A temperature source driven by an external physical signal (PS).'
  },
  solver_config: {
    equations: ['f(x) = 0'],
    latex: ['f(x) = 0'],
    across: 'None', through: 'None',
    description: 'Defines the numerical solver parameters and time-step for the network.'
  },
  ps_simulink_conv: {
    equations: ['y = u'],
    latex: ['y = u'],
    across: 'None', through: 'None',
    description: 'Converts a unit-aware Physical Signal into a unitless control signal.'
  },
  simulink_ps_conv: {
    equations: ['y = u'],
    latex: ['y = u'],
    across: 'None', through: 'None',
    description: 'Converts a control signal into a unit-aware Physical Signal.'
  },
  scope: {
    equations: ['Y = X'],
    latex: ['Y(t) = X(t)'],
    across: 'Any', through: 'None',
    description: 'Visualizes signal time-histories in a dedicated window.'
  }
};
