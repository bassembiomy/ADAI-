import type { BlockHelpEntry } from '../../types';
import { SIM_DAE, EMB_NONE, acausal, placeSteps } from './common';

const IL = 'Isothermal Liquid (across = absolute pressure [Pa], through = mass flow [kg/s])';

export const ISOTHERMAL: Record<string, BlockHelpEntry> = {
  hydraulic_reference_il: {
    id: 'hydraulic_reference_il',
    summary: 'Hydraulic Reference (IL): fixes the pressure of an isothermal-liquid network, like connecting it to a large reservoir.',
    description:
      'Every isothermal-liquid network needs a pressure reference. This block pins the pressure of the node it is connected to at p_A = p_absolute + rho*g*(z_ref - z_A). The reference pressure may be entered in Pa, kPa, MPa, bar, psi or atm and may be absolute or gauge; a gauge value is added to the atmospheric pressure parameter. ' +
      'With elevation correction on, the hydrostatic term uses rho = 1000 kg/m^3 and g = 9.80665 m/s^2, and the port elevation z_A is 0 m. The mass flow needed to hold the pressure is supplied by the reference. The initialization priority is stored with the block but not read by the present assembler.',
    shape:
      'A vertical stem with a small filled dot at its top, ending on a horizontal datum bar with five short diagonal hatch lines below it (reservoir datum symbol) and the text IL REF under it, drawn in blue. The single port A sits on the top edge.',
    ports: [
      { id: 'a', description: 'Hydraulic port A on the top edge (isothermal_liquid domain). Its absolute pressure is held at the computed reference pressure; the absorbed mass flow is unconstrained.' },
    ],
    params: [
      { key: 'referencePressure', description: 'Reference pressure value. The unit (Pa, kPa, MPa, bar, psi, atm) is chosen next to the value in the parameters panel.', range: '>= 0 (default 101325 Pa)' },
      { key: 'pressureType', description: 'Whether the reference pressure is absolute or gauge (relative to atmospheric pressure).', range: "{'absolute','gauge'}" },
      { key: 'atmosphericPressure', description: 'Atmospheric pressure used to convert a gauge reference to absolute; ignored when pressureType is absolute.', range: '> 0 (default 101325 Pa)' },
      { key: 'elevationCorrection', description: 'When "true" the hydrostatic offset rho*g*(z_ref - z_A) is added to the reference pressure.', range: "{'true','false'}" },
      { key: 'referenceElevation', description: 'Elevation of the reference above the datum, in m (unit selectable: m, cm, mm, km, ft, in); used only with elevation correction.', range: 'any real number (default 0 m)' },
      { key: 'initializationPriority', description: 'Priority of the reference when initial conditions are resolved: high, low or none. Stored with the block; not read by the present assembler.', range: "{'high','low','none'}" },
    ],
    algorithm:
      'p_abs = referencePressure                       (pressureType = absolute)\n' +
      'p_abs = atmosphericPressure + referencePressure  (pressureType = gauge)\n' +
      'p_A = p_abs + rho*g*(z_ref - z_A)     if elevationCorrection = true, else p_A = p_abs\n' +
      'rho = 1000 kg/m^3, g = 9.80665 m/s^2, z_A = 0 m',
    usage: placeSteps('Hydraulic Reference (IL)', 'Isothermal Liquid', [
      'Wire port A to a node of the liquid network, typically the pump suction or a tank-side node.',
      'Select the block. The parameters panel shows "Pressure Settings": enter Reference Pressure and choose its unit, switch Pressure Type between Absolute and Gauge, and set Atmospheric Pressure for gauge references.',
      'Optionally enable elevation correction and set Reference Elevation; the panel previews the calculated absolute reference pressure.',
      'Use one reference per connected liquid network, then run the simulation.',
    ]),
    characteristics: acausal(IL, 'none'),
    simulationExecution:
      SIM_DAE + ' For this block the assembler computes the reference pressure from the parameters (with unit conversion) and adds the reference equation x_node = p_A in place of the mass-flow balance of the node it touches.',
    embeddedExecution: EMB_NONE,
    examples: [
      {
        title: 'Pump driving flow through a pipe to a 1 bar gauge tank',
        steps: [
          'Place Hydraulic Reference (IL) at the pump inlet (absolute, 101325 Pa), a Pump (IL) with pressure_rise 200000 Pa and a Pipe (IL).',
          'Place a second Hydraulic Reference (IL) at the pipe outlet with Pressure Type = Gauge and Reference Pressure = 1 bar.',
          'Add a Pressure Sensor or Scope and run; the flow follows from the pressure difference over the pipe resistance.',
        ],
      },
    ],
    seeAlso: ['pump_il', 'pipe_il', 'restriction_il', 'fluid_ref'],
  },

  pump_il: {
    id: 'pump_il',
    summary: 'Ideal pump that maintains a fixed pressure rise between inlet A and outlet B.',
    description:
      'Forces p_B - p_A = pressure_rise, independent of flow. The mass flow through the pump is determined by the rest of the network. It is a source of hydraulic energy in a liquid circuit and has no inertia, efficiency or flow limit. ' +
      'Use Pipe (IL) or Restriction (IL) downstream to create the pressure drop that sets the flow, and a Hydraulic Reference (IL) to define the pressure level.',
    shape:
      'A circle with a solid right-pointing triangle inside it and the text PUMP below, drawn in blue. Inlet A on the left edge and outlet B on the right edge.',
    ports: [
      { id: 'a', description: 'Pump inlet A on the left edge (isothermal_liquid domain; absolute pressure [Pa], mass flow [kg/s]).' },
      { id: 'b', description: 'Pump outlet B on the right edge; pressure is the inlet pressure plus pressure_rise.' },
    ],
    params: [
      { key: 'pressure_rise', description: 'Pressure increase from A to B in Pa.', range: 'any real number (default 200000 Pa)' },
    ],
    algorithm: 'p_B - p_A = pressure_rise\nmdot_AB determined by the network',
    usage: placeSteps('Pump (IL)', 'Isothermal Liquid', [
      'Wire A to the suction node (connect it to a Hydraulic Reference (IL)) and B to the discharge line.',
      'Set pressure_rise in Pa in the parameters panel.',
      'Close the loop through a Pipe (IL) or Restriction (IL) back to a reference.',
    ]),
    characteristics: acausal(IL, 'none'),
    simulationExecution: SIM_DAE + ' The block allocates one A-to-B mass-flow branch and contributes the residual (p_B - p_A) - pressure_rise.',
    embeddedExecution: EMB_NONE,
    seeAlso: ['hydraulic_reference_il', 'pipe_il', 'restriction_il'],
  },

  pipe_il: {
    id: 'pipe_il',
    summary: 'Hydraulic pipe with laminar (linear) flow resistance between ports A and B.',
    description:
      'Relates the pressure drop to mass flow linearly, p_A - p_B = R*mdot, which is the laminar-flow resistance of a pipe. There is no fluid inertia or compressibility in this block. ' +
      'Increase R for a longer or narrower pipe; use Restriction (IL) when turbulent, quadratic flow behaviour matters.',
    shape:
      'A rounded rectangle with a dashed centre line and the text PIPE below, drawn in blue. Port A on the left edge, port B on the right edge.',
    ports: [
      { id: 'a', description: 'Pipe end A on the left edge (isothermal_liquid domain; absolute pressure [Pa], mass flow [kg/s]).' },
      { id: 'b', description: 'Pipe end B on the right edge.' },
    ],
    params: [
      { key: 'R', description: 'Hydraulic resistance in Pa/(kg/s); pressure drop per unit mass flow.', range: '> 0 (default 100000)' },
    ],
    algorithm: 'p_A - p_B = R * mdot',
    usage: placeSteps('Pipe (IL)', 'Isothermal Liquid', [
      'Wire A to the upstream node and B to the downstream node.',
      'Set R in Pa/(kg/s) in the parameters panel.',
      'Ensure a Hydraulic Reference (IL) exists in the network; a Pump (IL) or pressure difference between references drives the flow.',
    ]),
    characteristics: acausal(IL, 'none'),
    simulationExecution: SIM_DAE + ' The block allocates one A-to-B mass-flow branch and contributes the residual (p_A - p_B) - R*mdot.',
    embeddedExecution: EMB_NONE,
    seeAlso: ['restriction_il', 'pump_il', 'hydraulic_reference_il', 'fluid_resistance'],
  },

  restriction_il: {
    id: 'restriction_il',
    summary: 'Hydraulic orifice restriction obeying Bernoulli (square-root) flow.',
    description:
      'Models a turbulent restriction: mdot = Cd*A*sqrt(2*rho*|dp|)*sign(dp) with dp = p_A - p_B. The flow reverses with the pressure difference. In the implementation |dp| is bounded below by 1e-9 Pa inside the square root to keep the expression finite. ' +
      'Because the slope is very steep near dp = 0, the Newton solver may need smaller steps there; combine with a Pipe (IL) when you need a finite slope at zero flow.',
    shape:
      'Two thick vertical bars with a gap between them on a horizontal line and the text ORIFICE below, drawn in blue. Port A on the left edge, port B on the right edge.',
    ports: [
      { id: 'a', description: 'Restriction end A on the left edge (isothermal_liquid domain; absolute pressure [Pa], mass flow [kg/s]).' },
      { id: 'b', description: 'Restriction end B on the right edge.' },
    ],
    params: [
      { key: 'Cd', description: 'Discharge coefficient (dimensionless).', range: '0 < Cd <= 1 (default 0.6)' },
      { key: 'area', description: 'Restriction flow area in m^2.', range: '> 0 (default 1e-4 m^2)' },
      { key: 'rho', description: 'Liquid density in kg/m^3.', range: '> 0 (default 1000 kg/m^3)' },
    ],
    algorithm: 'dp = p_A - p_B\nmdot = Cd * area * sqrt(2 * rho * max(1e-9, |dp|)) * sign(dp)',
    usage: placeSteps('Restriction (IL)', 'Isothermal Liquid', [
      'Wire A to the high-pressure side and B to the low-pressure side.',
      'Set Cd, area (m^2) and rho (kg/m^3) in the parameters panel.',
      'Use a Pump (IL) and Hydraulic Reference (IL) to define the operating point.',
    ]),
    characteristics: acausal(IL, 'none'),
    simulationExecution: SIM_DAE + ' The block allocates one A-to-B mass-flow branch and contributes the residual mdot - Cd*area*sqrt(2*rho*max(1e-9,|dp|))*sign(dp).',
    embeddedExecution: EMB_NONE,
    seeAlso: ['pipe_il', 'orifice', 'pump_il', 'hydraulic_reference_il'],
  },
};
