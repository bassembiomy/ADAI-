export interface VLabPort {
  id: string;
  pos: 'left' | 'right' | 'top' | 'bottom';
  label?: string;
}

export interface VLabBlock {
  id: string;
  name: string;
  color: string;
  icon: string;
  params: Record<string, { value: number | string; unit: string; label: string }>;
  category?: string;
  ports: VLabPort[];
}

export interface VLabDomain {
  type: string;
  blocks: VLabBlock[];
}

export const VLAB_LIBRARY: VLabDomain[] = [
  {
    type: 'Electrical',
    blocks: [
      { 
        id: 'resistor', name: 'Resistor', color: '#3b82f6', icon: 'resistor', category: 'Passive',
        params: { R: { value: 100, unit: 'Ω', label: 'Resistance' } },
        ports: [{ id: 'p', pos: 'left', label: '+' }, { id: 'n', pos: 'right', label: '-' }]
      },
      { 
        id: 'variable_resistor', name: 'Variable Resistor', color: '#3b82f6', icon: 'variable_resistor', category: 'Passive',
        params: { R_min: { value: 0, unit: 'Ω', label: 'Min Resistance' } },
        ports: [{ id: 'p', pos: 'left', label: '+' }, { id: 'n', pos: 'right', label: '-' }, { id: 'r', pos: 'top', label: 'R' }]
      },
      { 
        id: 'infinite_resistance', name: 'Infinite Resistance', color: '#60a5fa', icon: 'infinite_resistance', category: 'Passive',
        params: {},
        ports: [{ id: 'p', pos: 'left', label: '+' }, { id: 'n', pos: 'right', label: '-' }]
      },
      { 
        id: 'capacitor', name: 'Capacitor', color: '#3b82f6', icon: 'capacitor', category: 'Passive',
        params: { C: { value: 1e-6, unit: 'F', label: 'Capacitance' } },
        ports: [{ id: 'p', pos: 'left', label: '+' }, { id: 'n', pos: 'right', label: '-' }]
      },
      { 
        id: 'inductor', name: 'Inductor', color: '#3b82f6', icon: 'inductor', category: 'Passive',
        params: { L: { value: 1e-3, unit: 'H', label: 'Inductance' } },
        ports: [{ id: 'p', pos: 'left', label: '+' }, { id: 'n', pos: 'right', label: '-' }]
      },
      { 
        id: 'memristor', name: 'Memristor', color: '#3b82f6', icon: 'memristor', category: 'Passive',
        params: { M0: { value: 100, unit: 'Ω', label: 'Initial Memristance' } },
        ports: [{ id: 'p', pos: 'left', label: '+' }, { id: 'n', pos: 'right', label: '-' }]
      },
      { 
        id: 'gyrator', name: 'Gyrator', color: '#818cf8', icon: 'gyrator', category: 'Passive',
        params: { g: { value: 0.01, unit: 'S', label: 'Gyration Conductance' } },
        ports: [
          { id: 'p1', pos: 'left', label: '1+' }, { id: 'n1', pos: 'left', label: '1-' },
          { id: 'p2', pos: 'right', label: '2+' }, { id: 'n2', pos: 'right', label: '2-' }
        ]
      },
      { 
        id: 'transformer', name: 'Ideal Transformer', color: '#818cf8', icon: 'transformer', category: 'Passive',
        params: { N: { value: 10, unit: '1', label: 'Turns Ratio' } },
        ports: [
          { id: 'p1', pos: 'left', label: '1+' }, { id: 'n1', pos: 'left', label: '1-' },
          { id: 'p2', pos: 'right', label: '2+' }, { id: 'n2', pos: 'right', label: '2-' }
        ]
      },
      { 
        id: 'opamp', name: 'Op-Amp', color: '#60a5fa', icon: 'opamp', category: 'Active',
        params: { Gain: { value: 1e5, unit: '1', label: 'Open-Loop Gain' } },
        ports: [
          { id: 'in_p', pos: 'left', label: '+' }, { id: 'in_n', pos: 'left', label: '-' },
          { id: 'out', pos: 'right', label: 'Out' }
        ]
      },
      { 
        id: 'switch', name: 'Switch', color: '#60a5fa', icon: 'switch', category: 'Active',
        params: { Ron: { value: 0.01, unit: 'Ω', label: 'On Resistance' } },
        ports: [{ id: 'p', pos: 'left', label: '+' }, { id: 'n', pos: 'right', label: '-' }, { id: 'v', pos: 'top', label: 'v' }]
      },
      { 
        id: 'rotational_electromechanical_converter', name: 'Rotational EM Converter', color: '#f59e0b', icon: 'rotational_em', category: 'Couplings',
        params: { K: { value: 0.1, unit: 'V-s/rad', label: 'Constant' } },
        ports: [
          { id: 'p', pos: 'left', label: '+' }, { id: 'n', pos: 'left', label: '-' },
          { id: 'r', pos: 'right', label: 'R' }, { id: 'c', pos: 'right', label: 'C' }
        ]
      },
      { 
        id: 'translational_electromechanical_converter', name: 'Translational EM Converter', color: '#f59e0b', icon: 'translational_em', category: 'Couplings',
        params: { Bl: { value: 1, unit: 'N/A', label: 'Magnetic Flux' } },
        ports: [
          { id: 'p', pos: 'left', label: '+' }, { id: 'n', pos: 'left', label: '-' },
          { id: 'r', pos: 'right', label: 'R' }, { id: 'c', pos: 'right', label: 'C' }
        ]
      },
      { 
        id: 'thermal_resistor', name: 'Thermal Resistor', color: '#ef4444', icon: 'thermal_resistor', category: 'Thermal',
        params: { Rth: { value: 10, unit: 'K/W', label: 'Thermal Resistance' } },
        ports: [
          { id: 'a', pos: 'left', label: 'A' }, { id: 'b', pos: 'right', label: 'B' },
          { id: 'h', pos: 'top', label: 'H' }
        ]
      },
      { 
        id: 'scope', name: 'Scope', color: '#fbbf24', icon: 'scope', category: 'Sinks',
        params: { time_range: { value: 10, unit: 's', label: 'Time Range' } },
        ports: [{ id: 'in1', pos: 'left', label: '1' }, { id: 'in2', pos: 'left', label: '2' }]
      },
      {
        id: 'v_sensor', name: 'Voltage Sensor', color: '#fbbf24', icon: 'v_sensor', category: 'Sensors',
        params: { R_int: { value: 1e8, unit: 'Ω', label: 'Internal Res' } },
        ports: [{ id: 'p', pos: 'top', label: '+' }, { id: 'n', pos: 'bottom', label: '-' }, { id: 'v', pos: 'right', label: 'V' }]
      },
      {
        id: 'i_sensor', name: 'Current Sensor', color: '#fbbf24', icon: 'i_sensor', category: 'Sensors',
        params: { R_int: { value: 1e-6, unit: 'Ω', label: 'Internal Res' } },
        ports: [{ id: 'p', pos: 'left', label: '+' }, { id: 'n', pos: 'right', label: '-' }, { id: 'i', pos: 'top', label: 'I' }]
      },
      {
        id: 'dc_voltage', name: 'DC Voltage Source', color: '#ef4444', icon: 'dc_voltage', category: 'Sources',
        params: { V: { value: 12, unit: 'V', label: 'Voltage' }, R_int: { value: 1e-3, unit: 'Ω', label: 'Internal Res' } },
        ports: [{ id: 'p', pos: 'top', label: '+' }, { id: 'n', pos: 'bottom', label: '-' }]
      },
      {
        id: 'ac_voltage', name: 'AC Voltage Source', color: '#ef4444', icon: 'ac_voltage', category: 'Sources',
        params: { Vpk: { value: 230, unit: 'V', label: 'Peak Voltage' }, f: { value: 50, unit: 'Hz', label: 'Frequency' } },
        ports: [{ id: 'p', pos: 'top', label: '+' }, { id: 'n', pos: 'bottom', label: '-' }]
      },
      {
        id: 'controlled_voltage', name: 'Controlled Voltage Source', color: '#ef4444', icon: 'controlled_voltage', category: 'Sources',
        params: {},
        ports: [{ id: 'p', pos: 'top', label: '+' }, { id: 'n', pos: 'bottom', label: '-' }, { id: 's', pos: 'left', label: 'S' }]
      },
      {
        id: 'dc_current', name: 'DC Current Source', color: '#ef4444', icon: 'dc_current', category: 'Sources',
        params: { I: { value: 1, unit: 'A', label: 'Current' } },
        ports: [{ id: 'p', pos: 'top', label: '+' }, { id: 'n', pos: 'bottom', label: '-' }]
      },
      {
        id: 'vcvs', name: 'Voltage-Controlled Voltage Source', color: '#ef4444', icon: 'vcvs', category: 'Sources',
        params: { gain: { value: 1, unit: '1', label: 'Gain' } },
        ports: [
          { id: 'p', pos: 'top', label: '+' }, { id: 'n', pos: 'bottom', label: '-' },
          { id: 'cp', pos: 'left', label: 'C+' }, { id: 'cn', pos: 'left', label: 'C-' }
        ]
      },
      {
        id: 'vccs', name: 'Voltage-Controlled Current Source', color: '#ef4444', icon: 'vccs', category: 'Sources',
        params: { gain: { value: 1, unit: 'S', label: 'Transconductance' } },
        ports: [
          { id: 'p', pos: 'top', label: '+' }, { id: 'n', pos: 'bottom', label: '-' },
          { id: 'cp', pos: 'left', label: 'C+' }, { id: 'cn', pos: 'left', label: 'C-' }
        ]
      },
      {
        id: 'cccs', name: 'Current-Controlled Current Source', color: '#ef4444', icon: 'cccs', category: 'Sources',
        params: { gain: { value: 1, unit: '1', label: 'Current Gain' } },
        ports: [
          { id: 'p', pos: 'top', label: '+' }, { id: 'n', pos: 'bottom', label: '-' },
          { id: 'cp', pos: 'left', label: 'C+' }, { id: 'cn', pos: 'left', label: 'C-' }
        ]
      },
      {
        id: 'ccvs', name: 'Current-Controlled Voltage Source', color: '#ef4444', icon: 'ccvs', category: 'Sources',
        params: { gain: { value: 1, unit: 'Ω', label: 'Transresistance' } },
        ports: [
          { id: 'p', pos: 'top', label: '+' }, { id: 'n', pos: 'bottom', label: '-' },
          { id: 'cp', pos: 'left', label: 'C+' }, { id: 'cn', pos: 'left', label: 'C-' }
        ]
      },
      {
        id: 'ground', name: 'Electrical Reference', color: '#3b82f6', icon: 'ground', category: 'Connections',
        params: {},
        ports: [{ id: 'a', pos: 'top', label: '' }]
      },
      {
        id: 'busbar', name: 'Busbar', color: '#3b82f6', icon: 'busbar', category: 'Connections',
        params: { nodes: { value: 4, unit: '', label: 'Terminals' } },
        ports: [{ id: '1', pos: 'left', label: '1' }, { id: '2', pos: 'right', label: '2' }]
      },
      {
        id: 'phase_splitter', name: 'Phase Splitter', color: '#3b82f6', icon: 'phase_splitter', category: 'Three-Phase',
        params: {},
        ports: [{ id: 'abc', pos: 'left', label: 'abc' }, { id: 'a', pos: 'right', label: 'a' }, { id: 'b', pos: 'right', label: 'b' }, { id: 'c', pos: 'right', label: 'c' }]
      },
      {
        id: 'delta_ref', name: 'Delta Reference', color: '#3b82f6', icon: 'delta_ref', category: 'Three-Phase',
        params: {},
        ports: [{ id: 'a', pos: 'top', label: '' }]
      },
      {
        id: 'open_circuit', name: 'Open Circuit', color: '#3b82f6', icon: 'open_circuit', category: 'Connections',
        params: {},
        ports: [{ id: 'a', pos: 'top', label: '' }]
      },
      {
        id: 'ps_demux_3', name: 'PS Three-Element Demux', color: '#92400e', icon: 'ps_demux', category: 'Utilities',
        params: {},
        ports: [{ id: 'in', pos: 'left', label: 'abc' }, { id: 'a', pos: 'right', label: 'a' }, { id: 'b', pos: 'right', label: 'b' }, { id: 'c', pos: 'right', label: 'c' }]
      }
    ]
  },
  {
    type: 'Gas',
    blocks: [
      {
        id: 'gas_ref', name: 'Absolute Reference (G)', color: '#d946ef', icon: 'gas_ref', category: 'Elements',
        params: {},
        ports: [{ id: 'g', pos: 'bottom', label: 'G' }]
      },
      {
        id: 'gas_cap', name: 'Cap (G)', color: '#d946ef', icon: 'gas_cap', category: 'Elements',
        params: {},
        ports: [{ id: 'a', pos: 'bottom', label: 'A' }]
      },
      {
        id: 'gas_chamber', name: 'Constant Volume Chamber (G)', color: '#d946ef', icon: 'gas_chamber', category: 'Elements',
        params: { V: { value: 0.01, unit: 'm^3', label: 'Volume' } },
        ports: [{ id: 'a', pos: 'top', label: 'A' }, { id: 'b', pos: 'top', label: 'B' }]
      },
      {
        id: 'gas_reservoir', name: 'Controlled Reservoir (G)', color: '#d946ef', icon: 'gas_res', category: 'Elements',
        params: { P: { value: 101325, unit: 'Pa', label: 'Pressure' } },
        ports: [{ id: 'a', pos: 'bottom', label: 'A' }, { id: 's', pos: 'left', label: 'S' }]
      },
      {
        id: 'gas_resistance', name: 'Flow Resistance (G)', color: '#d946ef', icon: 'gas_resistance', category: 'Elements',
        params: { k: { value: 1, unit: 'kg/s/Pa', label: 'Conductance' } },
        ports: [{ id: 'a', pos: 'left', label: 'A' }, { id: 'b', pos: 'right', label: 'B' }]
      },
      {
        id: 'gas_inf_resistance', name: 'Infinite Flow Resistance (G)', color: '#d946ef', icon: 'gas_inf_res', category: 'Elements',
        params: {},
        ports: [{ id: 'a', pos: 'left', label: 'A' }, { id: 'b', pos: 'right', label: 'B' }]
      },
      {
        id: 'gas_restriction', name: 'Local Restriction (G)', color: '#d946ef', icon: 'gas_restriction', category: 'Elements',
        params: { area: { value: 1e-4, unit: 'm^2', label: 'Area' } },
        ports: [
          { id: 'a', pos: 'left', label: 'A' }, { id: 'b', pos: 'right', label: 'B' },
          { id: 'ar', pos: 'top', label: 'AR' }
        ]
      },
      {
        id: 'gas_pipe', name: 'Pipe (G)', color: '#d946ef', icon: 'gas_pipe', category: 'Elements',
        params: { L: { value: 1, unit: 'm', label: 'Length' }, D: { value: 0.05, unit: 'm', label: 'Diameter' } },
        ports: [
          { id: 'a', pos: 'left', label: 'A' }, { id: 'b', pos: 'right', label: 'B' },
          { id: 'h', pos: 'top', label: 'H' }
        ]
      },
      {
        id: 'gas_fixed_res', name: 'Reservoir (G)', color: '#d946ef', icon: 'gas_fixed_res', category: 'Elements',
        params: { P: { value: 101325, unit: 'Pa', label: 'Pressure' } },
        ports: [{ id: 'a', pos: 'top', label: 'A' }]
      },
      {
        id: 'gas_rotational_conv', name: 'Rotational Mechanical Converter (G)', color: '#10b981', icon: 'gas_rot_conv', category: 'Couplings',
        params: { D: { value: 0.01, unit: 'm^3/rad', label: 'Displacement' } },
        ports: [
          { id: 'a', pos: 'left', label: 'A' }, { id: 'h', pos: 'left', label: 'H' },
          { id: 'r', pos: 'right', label: 'R' }, { id: 'c', pos: 'right', label: 'C' }
        ]
      },
      {
        id: 'gas_translational_conv', name: 'Translational Mechanical Converter (G)', color: '#10b981', icon: 'gas_trans_conv', category: 'Couplings',
        params: { A: { value: 0.001, unit: 'm^2', label: 'Piston Area' } },
        ports: [
          { id: 'a', pos: 'left', label: 'A' }, { id: 'h', pos: 'left', label: 'H' },
          { id: 'r', pos: 'right', label: 'R' }, { id: 'c', pos: 'right', label: 'C' }
        ]
      },

      // Gas Sources
      {
        id: 'gas_flow_source', name: 'Flow Rate Source (G)', color: '#d946ef', icon: 'gas_flow_src', category: 'Sources',
        params: { mdot: { value: 0.1, unit: 'kg/s', label: 'Mass Flow Rate' } },
        ports: [{ id: 'a', pos: 'left', label: 'A' }, { id: 'b', pos: 'right', label: 'B' }, { id: 'm', pos: 'top', label: 'M' }]
      },
      {
        id: 'gas_pressure_source', name: 'Pressure Source (G)', color: '#d946ef', icon: 'gas_pres_src', category: 'Sources',
        params: { P: { value: 200000, unit: 'Pa', label: 'Pressure' } },
        ports: [{ id: 'a', pos: 'left', label: 'A' }, { id: 'b', pos: 'right', label: 'B' }, { id: 'p', pos: 'top', label: 'P' }]
      },

      // Gas Utilities
      {
        id: 'gas_properties', name: 'Gas Properties (G)', color: '#d946ef', icon: 'gas_props', category: 'Utilities',
        params: { 
          R: { value: 287, unit: 'J/kg/K', label: 'Gas Constant' },
          gamma: { value: 1.4, unit: '1', label: 'Specific Heat Ratio' }
        },
        ports: []
      }
    ]
  },
  {
    type: 'Magnetic',
    blocks: [
      {
        id: 'mag_ref', name: 'Magnetic Reference', color: '#ec4899', icon: 'mag_ref', category: 'Elements',
        params: {},
        ports: [{ id: 'n', pos: 'bottom', label: 'N' }]
      },
      {
        id: 'reluctance', name: 'Reluctance', color: '#ec4899', icon: 'reluctance', category: 'Elements',
        params: { R: { value: 1e6, unit: 'A-t/Wb', label: 'Reluctance' } },
        ports: [{ id: 'n', pos: 'left', label: 'N' }, { id: 's', pos: 'right', label: 'S' }]
      },
      {
        id: 'fundamental_reluctance', name: 'Fundamental Reluctance', color: '#ec4899', icon: 'reluctance_f', category: 'Elements',
        params: { R: { value: 1e6, unit: 'A-t/Wb', label: 'Reluctance' } },
        ports: [{ id: 'n', pos: 'left', label: 'N' }, { id: 's', pos: 'right', label: 'S' }]
      },
      {
        id: 'variable_reluctance', name: 'Variable Reluctance', color: '#ec4899', icon: 'var_reluctance', category: 'Elements',
        params: { Rmin: { value: 1e5, unit: 'A-t/Wb', label: 'Min Reluctance' } },
        ports: [{ id: 'n', pos: 'left', label: 'N' }, { id: 's', pos: 'right', label: 'S' }, { id: 'ctrl', pos: 'top', label: 'C' }]
      },
      {
        id: 'permanent_magnet', name: 'Permanent Magnet', color: '#ec4899', icon: 'perm_magnet', category: 'Elements',
        params: { Hc: { value: 1000, unit: 'A/m', label: 'Coercivity' } },
        ports: [{ id: 'n', pos: 'left', label: 'N' }, { id: 's', pos: 'right', label: 'S' }]
      },
      {
        id: 'em_converter', name: 'Electromagnetic Converter', color: '#3b82f6', icon: 'em_conv', category: 'Couplings',
        params: { N: { value: 100, unit: '1', label: 'Number of Turns' } },
        ports: [
          { id: 'p', pos: 'left', label: '+' }, { id: 'n', pos: 'left', label: '-' },
          { id: 'mag_n', pos: 'right', label: 'N' }, { id: 'mag_s', pos: 'right', label: 'S' }
        ]
      },
      {
        id: 'reluctance_force', name: 'Reluctance Force Actuator', color: '#f59e0b', icon: 'rel_force', category: 'Couplings',
        params: { K: { value: 1, unit: 'N-m/Wb^2', label: 'Force Constant' } },
        ports: [
          { id: 'n', pos: 'left', label: 'N' }, { id: 's', pos: 'left', label: 'S' },
          { id: 'r', pos: 'right', label: 'R' }, { id: 'c', pos: 'right', label: 'C' }
        ]
      },

      // Magnetic Sensors
      {
        id: 'mag_flux_sensor', name: 'Flux Sensor', color: '#ec4899', icon: 'flux_sensor', category: 'Sensors',
        params: {},
        ports: [{ id: 'n', pos: 'left', label: 'N' }, { id: 's', pos: 'right', label: 'S' }, { id: 'phi', pos: 'top', label: 'Φ' }]
      },
      {
        id: 'mag_mmf_sensor', name: 'MMF Sensor', color: '#ec4899', icon: 'mmf_sensor', category: 'Sensors',
        params: {},
        ports: [{ id: 'n', pos: 'top', label: 'N' }, { id: 's', pos: 'bottom', label: 'S' }, { id: 'f', pos: 'right', label: 'F' }]
      },

      // Magnetic Sources
      {
        id: 'mag_mmf_source', name: 'MMF Source', color: '#ec4899', icon: 'mmf_source', category: 'Sources',
        params: { MMF: { value: 10, unit: 'A-t', label: 'Magnetomotive Force' } },
        ports: [{ id: 'n', pos: 'top', label: 'N' }, { id: 's', pos: 'bottom', label: 'S' }]
      },
      {
        id: 'mag_flux_source', name: 'Flux Source', color: '#ec4899', icon: 'flux_source', category: 'Sources',
        params: { phi: { value: 0.001, unit: 'Wb', label: 'Magnetic Flux' } },
        ports: [{ id: 'n', pos: 'top', label: 'N' }, { id: 's', pos: 'bottom', label: 'S' }]
      },
      {
        id: 'mag_controlled_mmf', name: 'Controlled MMF Source', color: '#ec4899', icon: 'ctrl_mmf', category: 'Sources',
        params: {},
        ports: [{ id: 'n', pos: 'top', label: 'N' }, { id: 's', pos: 'bottom', label: 'S' }, { id: 'src', pos: 'left', label: 'S' }]
      }
    ]
  },
  {
    type: 'Mechanical',
    blocks: [
      // Sensors
      {
        id: 'force_sensor', name: 'Ideal Force Sensor', color: '#10b981', icon: 'force_sensor', category: 'Sensors',
        params: { k: { value: 1e8, unit: 'N/m', label: 'Stiffness' } },
        ports: [{ id: 'a', pos: 'left', label: 'A' }, { id: 'b', pos: 'right', label: 'B' }, { id: 'f', pos: 'top', label: 'F' }]
      },
      {
        id: 'rot_motion_sensor', name: 'Ideal Rotational Motion Sensor', color: '#10b981', icon: 'rot_motion', category: 'Sensors',
        params: { b: { value: 0, unit: 'N-m-s/rad', label: 'Damping' } },
        ports: [{ id: 'r', pos: 'left', label: 'R' }, { id: 'c', pos: 'right', label: 'C' }, { id: 'w', pos: 'top', label: 'W' }, { id: 'a', pos: 'top', label: 'A' }]
      },
      {
        id: 'torque_sensor', name: 'Ideal Torque Sensor', color: '#10b981', icon: 'torque_sensor', category: 'Sensors',
        params: { k: { value: 1e8, unit: 'N-m/rad', label: 'Stiffness' } },
        ports: [{ id: 'r', pos: 'left', label: 'R' }, { id: 'c', pos: 'right', label: 'C' }, { id: 't', pos: 'top', label: 'T' }]
      },
      {
        id: 'trans_motion_sensor', name: 'Ideal Translational Motion Sensor', color: '#10b981', icon: 'trans_motion', category: 'Sensors',
        params: { b: { value: 0, unit: 'N-s/m', label: 'Damping' } },
        ports: [{ id: 'r', pos: 'left', label: 'R' }, { id: 'c', pos: 'right', label: 'C' }, { id: 'v', pos: 'top', label: 'V' }, { id: 'p', pos: 'top', label: 'P' }]
      },

      // Sources
      {
        id: 'force_source', name: 'Ideal Force Source', color: '#10b981', icon: 'force_source', category: 'Sources',
        params: { F: { value: 10, unit: 'N', label: 'Force' } },
        ports: [{ id: 'a', pos: 'left', label: 'A' }, { id: 'b', pos: 'right', label: 'B' }, { id: 's', pos: 'top', label: 'S' }]
      },
      {
        id: 'torque_source', name: 'Ideal Torque Source', color: '#10b981', icon: 'torque_source', category: 'Sources',
        params: { T: { value: 5, unit: 'N-m', label: 'Torque' } },
        ports: [{ id: 'r', pos: 'left', label: 'R' }, { id: 'c', pos: 'right', label: 'C' }, { id: 's', pos: 'top', label: 'S' }]
      },
      {
        id: 'ang_vel_source', name: 'Ideal Angular Velocity Source', color: '#10b981', icon: 'vel_source', category: 'Sources',
        params: { omega: { value: 10, unit: 'rad/s', label: 'Angular Velocity' } },
        ports: [{ id: 'r', pos: 'left', label: 'R' }, { id: 'c', pos: 'right', label: 'C' }, { id: 's', pos: 'top', label: 'S' }]
      },

      // Mechanisms
      {
        id: 'gear_box', name: 'Gear Box', color: '#10b981', icon: 'gear_box', category: 'Mechanisms',
        params: { ratio: { value: 2, unit: '1', label: 'Gear Ratio' } },
        ports: [{ id: 's1', pos: 'left', label: 'S1' }, { id: 's2', pos: 'right', label: 'S2' }]
      },
      {
        id: 'lever', name: 'Lever', color: '#10b981', icon: 'lever', category: 'Mechanisms',
        params: { L1: { value: 0.5, unit: 'm', label: 'Length 1' }, L2: { value: 0.5, unit: 'm', label: 'Length 2' } },
        ports: [{ id: 'a', pos: 'left', label: 'A' }, { id: 'b', pos: 'right', label: 'B' }, { id: 'c', pos: 'bottom', label: 'C' }]
      },
      {
        id: 'wheel_axle', name: 'Wheel and Axle', color: '#10b981', icon: 'wheel_axle', category: 'Mechanisms',
        params: { Rw: { value: 0.3, unit: 'm', label: 'Wheel Radius' }, Ra: { value: 0.05, unit: 'm', label: 'Axle Radius' } },
        ports: [{ id: 'a', pos: 'left', label: 'A' }, { id: 'p', pos: 'right', label: 'P' }]
      },
      {
        id: 'rot_multibody_interface', name: 'Rotational Multibody Interface', color: '#10b981', icon: 'rot_multibody', category: 'Multibody Interfaces',
        params: {},
        ports: [{ id: 't', pos: 'left', label: 'T' }, { id: 'c', pos: 'left', label: 'C' }, { id: 'w', pos: 'right', label: 'W' }, { id: 'r', pos: 'right', label: 'R' }]
      },
      {
        id: 'trans_multibody_interface', name: 'Translational Multibody Interface', color: '#10b981', icon: 'trans_multibody', category: 'Multibody Interfaces',
        params: {},
        ports: [{ id: 'f', pos: 'left', label: 'F' }, { id: 'c', pos: 'left', label: 'C' }, { id: 'v', pos: 'right', label: 'V' }, { id: 'r', pos: 'right', label: 'R' }]
      },

      // Rotational Elements
      {
        id: 'inertia', name: 'Inertia', color: '#10b981', icon: 'inertia', category: 'Rotational Elements',
        params: { J: { value: 0.01, unit: 'kg-m^2', label: 'Inertia' } },
        ports: [{ id: 'r', pos: 'top', label: 'R' }]
      },
      {
        id: 'rot_ref', name: 'Mechanical Rotational Reference', color: '#10b981', icon: 'rot_ref', category: 'Rotational Elements',
        params: {},
        ports: [{ id: 'r', pos: 'top', label: 'R' }]
      },
      {
        id: 'rot_spring', name: 'Rotational Spring', color: '#10b981', icon: 'rot_spring', category: 'Rotational Elements',
        params: { k: { value: 100, unit: 'N-m/rad', label: 'Spring Rate' } },
        ports: [{ id: 'r', pos: 'left', label: 'R' }, { id: 'c', pos: 'right', label: 'C' }]
      },
      {
        id: 'rot_damper', name: 'Rotational Damper', color: '#10b981', icon: 'rot_damper', category: 'Rotational Elements',
        params: { b: { value: 0.1, unit: 'N-m/rad/s', label: 'Damping Coefficient' } },
        ports: [{ id: 'r', pos: 'left', label: 'R' }, { id: 'c', pos: 'right', label: 'C' }]
      },
      {
        id: 'rot_friction', name: 'Rotational Friction', color: '#10b981', icon: 'rot_friction', category: 'Rotational Elements',
        params: { Ts: { value: 0.5, unit: 'N-m', label: 'Static Friction' } },
        ports: [{ id: 'r', pos: 'left', label: 'R' }, { id: 'c', pos: 'right', label: 'C' }]
      },
      {
        id: 'rot_hard_stop', name: 'Rotational Hard Stop', color: '#10b981', icon: 'rot_hard_stop', category: 'Rotational Elements',
        params: { upper: { value: 1, unit: 'rad', label: 'Upper Limit' }, lower: { value: -1, unit: 'rad', label: 'Lower Limit' } },
        ports: [{ id: 'r', pos: 'left', label: 'R' }, { id: 'c', pos: 'right', label: 'C' }]
      },

      // Translational Elements
      {
        id: 'mass', name: 'Mass', color: '#10b981', icon: 'mass', category: 'Translational Elements',
        params: { m: { value: 1, unit: 'kg', label: 'Mass' } },
        ports: [{ id: 'p', pos: 'top', label: 'P' }]
      },
      {
        id: 'trans_ref', name: 'Mechanical Translational Reference', color: '#10b981', icon: 'trans_ref', category: 'Translational Elements',
        params: {},
        ports: [{ id: 'p', pos: 'top', label: 'P' }]
      },
      {
        id: 'trans_spring', name: 'Translational Spring', color: '#10b981', icon: 'trans_spring', category: 'Translational Elements',
        params: { k: { value: 1000, unit: 'N/m', label: 'Spring Rate' } },
        ports: [{ id: 'r', pos: 'left', label: 'R' }, { id: 'c', pos: 'right', label: 'C' }]
      },
      {
        id: 'trans_damper', name: 'Translational Damper', color: '#10b981', icon: 'trans_damper', category: 'Translational Elements',
        params: { b: { value: 10, unit: 'N/m/s', label: 'Damping Coefficient' } },
        ports: [{ id: 'r', pos: 'left', label: 'R' }, { id: 'c', pos: 'right', label: 'C' }]
      },
      {
        id: 'trans_friction', name: 'Translational Friction', color: '#10b981', icon: 'trans_friction', category: 'Translational Elements',
        params: { Fs: { value: 5, unit: 'N', label: 'Static Friction' } },
        ports: [{ id: 'r', pos: 'left', label: 'R' }, { id: 'c', pos: 'right', label: 'C' }]
      },
      {
        id: 'trans_hard_stop', name: 'Translational Hard Stop', color: '#10b981', icon: 'trans_hard_stop', category: 'Translational Elements',
        params: { upper: { value: 0.1, unit: 'm', label: 'Upper Limit' }, lower: { value: -0.1, unit: 'm', label: 'Lower Limit' } },
        ports: [{ id: 'r', pos: 'left', label: 'R' }, { id: 'c', pos: 'right', label: 'C' }]
      }
    ]
  },
  {
    type: 'Moist Air',
    blocks: [
      {
        id: 'ma_ref', name: 'Absolute Reference (MA)', color: '#8b5cf6', icon: 'ma_ref', category: 'Elements',
        params: {},
        ports: [{ id: 'g', pos: 'bottom', label: 'G' }]
      },
      {
        id: 'ma_chamber', name: 'Constant Volume Chamber (MA)', color: '#8b5cf6', icon: 'ma_chamber', category: 'Elements',
        params: { V: { value: 0.1, unit: 'm^3', label: 'Volume' } },
        ports: [{ id: 'a', pos: 'top', label: 'A' }, { id: 'b', pos: 'top', label: 'B' }, { id: 'h', pos: 'left', label: 'H' }]
      },
      {
        id: 'ma_pipe', name: 'Pipe (MA)', color: '#8b5cf6', icon: 'ma_pipe', category: 'Elements',
        params: { L: { value: 2, unit: 'm', label: 'Length' } },
        ports: [
          { id: 'a', pos: 'left', label: 'A' }, { id: 'b', pos: 'right', label: 'B' },
          { id: 'h', pos: 'top', label: 'H' }, { id: 'wd', pos: 'bottom', label: 'WD' }
        ]
      },
      {
        id: 'ma_separator', name: 'Moisture Separator (MA)', color: '#8b5cf6', icon: 'ma_separator', category: 'Elements',
        params: { efficiency: { value: 0.9, unit: '1', label: 'Efficiency' } },
        ports: [
          { id: 'a', pos: 'left', label: 'A' }, { id: 'b', pos: 'right', label: 'B' },
          { id: 'w', pos: 'top', label: 'W' }, { id: 'd', pos: 'top', label: 'D' }
        ]
      },
      {
        id: 'ma_rot_conv', name: 'Rotational Mechanical Converter (MA)', color: '#10b981', icon: 'ma_rot_conv', category: 'Couplings',
        params: { D: { value: 0.001, unit: 'm^3/rad', label: 'Displacement' } },
        ports: [
          { id: 'a', pos: 'left', label: 'A' }, { id: 'h', pos: 'left', label: 'H' },
          { id: 'r', pos: 'right', label: 'R' }, { id: 'c', pos: 'right', label: 'C' },
          { id: 'wd', pos: 'bottom', label: 'WD' }
        ]
      },
      {
        id: 'ma_trans_conv', name: 'Translational Mechanical Converter (MA)', color: '#10b981', icon: 'ma_trans_conv', category: 'Couplings',
        params: { A: { value: 0.01, unit: 'm^2', label: 'Area' } },
        ports: [
          { id: 'a', pos: 'left', label: 'A' }, { id: 'h', pos: 'left', label: 'H' },
          { id: 'r', pos: 'right', label: 'R' }, { id: 'c', pos: 'right', label: 'C' },
          { id: 'wd', pos: 'bottom', label: 'WD' }
        ]
      },

      // Moist Air Sensors
      {
        id: 'ma_flow_sensor', name: 'Flow Rate Sensor (MA)', color: '#8b5cf6', icon: 'ma_flow_sensor', category: 'Sensors',
        params: {},
        ports: [{ id: 'a', pos: 'left', label: 'A' }, { id: 'b', pos: 'right', label: 'B' }, { id: 'm', pos: 'top', label: 'M' }]
      },
      {
        id: 'ma_selector', name: 'Measurement Selector (MA)', color: '#8b5cf6', icon: 'ma_selector', category: 'Sensors',
        params: {},
        ports: [{ id: 'in', pos: 'left', label: 'F' }, { id: 't', pos: 'right', label: 'T' }, { id: 'p', pos: 'right', label: 'P' }, { id: 'w', pos: 'right', label: 'W' }]
      },
      {
        id: 'ma_moisture_sensor', name: 'Moisture & Trace Gas Sensor (MA)', color: '#8b5cf6', icon: 'ma_moisture', category: 'Sensors',
        params: {},
        ports: [{ id: 'a', pos: 'left', label: 'A' }, { id: 'w', pos: 'right', label: 'W' }]
      },
      {
        id: 'ma_pt_sensor', name: 'Pressure & Temperature Sensor (MA)', color: '#8b5cf6', icon: 'ma_pt_sensor', category: 'Sensors',
        params: {},
        ports: [{ id: 'a', pos: 'left', label: 'A' }, { id: 'p', pos: 'right', label: 'Pa' }]
      },
      {
        id: 'ma_thermo_sensor', name: 'Thermodynamic Properties Sensor (MA)', color: '#8b5cf6', icon: 'ma_thermo', category: 'Sensors',
        params: {},
        ports: [{ id: 'a', pos: 'left', label: 'A' }, { id: 'rho', pos: 'right', label: 'ρ' }]
      },
      // Moist Air Sources
      {
        id: 'ma_moisture_source', name: 'Moisture Source (MA)', color: '#8b5cf6', icon: 'ma_moisture_src', category: 'Sources',
        params: { rate: { value: 0.01, unit: 'kg/s', label: 'Moisture Rate' } },
        ports: [{ id: 'a', pos: 'bottom', label: 'A' }, { id: 's', pos: 'top', label: 'S' }]
      },
      {
        id: 'ma_flow_source', name: 'Flow Rate Source (MA)', color: '#8b5cf6', icon: 'ma_flow_src', category: 'Sources',
        params: { rate: { value: 0.1, unit: 'kg/s', label: 'Mass Flow Rate' } },
        ports: [{ id: 'a', pos: 'left', label: 'A' }, { id: 'b', pos: 'right', label: 'B' }, { id: 's', pos: 'top', label: 'S' }]
      },
      {
        id: 'ma_pressure_source', name: 'Pressure Source (MA)', color: '#8b5cf6', icon: 'ma_pres_src', category: 'Sources',
        params: { P: { value: 100000, unit: 'Pa', label: 'Pressure Difference' } },
        ports: [{ id: 'a', pos: 'left', label: 'A' }, { id: 'b', pos: 'right', label: 'B' }, { id: 's', pos: 'top', label: 'S' }]
      },
      // Moist Air Utilities
      {
        id: 'ma_properties', name: 'Moist Air Properties (MA)', color: '#8b5cf6', icon: 'ma_props', category: 'Utilities',
        params: { 
          P_std: { value: 101325, unit: 'Pa', label: 'Std Pressure' },
          T_std: { value: 293.15, unit: 'K', label: 'Std Temperature' }
        },
        ports: []
      }
    ]
  },
  {
    type: 'Physical Signals',
    blocks: [
      // Delays
      {
        id: 'ps_delay', name: 'PS Constant Delay', color: '#92400e', icon: 'ps_delay', category: 'Delays',
        params: { delay: { value: 1, unit: 's', label: 'Delay' } },
        ports: [{ id: 'u', pos: 'left', label: 'U' }, { id: 'y', pos: 'right', label: 'Y' }]
      },
      // Functions
      {
        id: 'ps_add', name: 'PS Add', color: '#92400e', icon: 'ps_add', category: 'Functions',
        params: {},
        ports: [{ id: 'u1', pos: 'left', label: '+' }, { id: 'u2', pos: 'left', label: '+' }, { id: 'y', pos: 'right', label: 'Y' }]
      },
      {
        id: 'ps_subtract', name: 'PS Subtract', color: '#92400e', icon: 'ps_subtract', category: 'Functions',
        params: {},
        ports: [{ id: 'u1', pos: 'left', label: '+' }, { id: 'u2', pos: 'left', label: '-' }, { id: 'y', pos: 'right', label: 'Y' }]
      },
      {
        id: 'ps_gain', name: 'PS Gain', color: '#92400e', icon: 'ps_gain', category: 'Functions',
        params: { gain: { value: 1, unit: '1', label: 'Gain' } },
        ports: [{ id: 'u', pos: 'left', label: 'U' }, { id: 'y', pos: 'right', label: 'Y' }]
      },
      {
        id: 'ps_product', name: 'PS Product', color: '#92400e', icon: 'ps_product', category: 'Functions',
        params: {},
        ports: [{ id: 'u1', pos: 'left', label: '*' }, { id: 'u2', pos: 'left', label: '*' }, { id: 'y', pos: 'right', label: 'Y' }]
      },
      {
        id: 'ps_divide', name: 'PS Divide', color: '#92400e', icon: 'ps_divide', category: 'Functions',
        params: {},
        ports: [{ id: 'u1', pos: 'left', label: 'num' }, { id: 'u2', pos: 'left', label: 'den' }, { id: 'y', pos: 'right', label: 'Y' }]
      },
      {
        id: 'ps_math', name: 'PS Math Function', color: '#92400e', icon: 'ps_math', category: 'Functions',
        params: { func: { value: 'exp', unit: '', label: 'Function' } },
        ports: [{ id: 'u', pos: 'left', label: 'U' }, { id: 'y', pos: 'right', label: 'Y' }]
      },
      {
        id: 'ps_sum', name: 'PS Sum of Elements', color: '#92400e', icon: 'ps_sum', category: 'Functions',
        params: {},
        ports: [{ id: 'u', pos: 'left', label: 'U' }, { id: 'y', pos: 'right', label: 'Σ' }]
      },

      // Linear Operators
      {
        id: 'ps_integrator', name: 'PS Integrator', color: '#92400e', icon: 'ps_integrator', category: 'Linear Operators',
        params: { initial: { value: 0, unit: '', label: 'Initial State' } },
        ports: [{ id: 'u', pos: 'left', label: 'U' }, { id: 'y', pos: 'right', label: 'Y' }]
      },
      {
        id: 'ps_transfer_fcn', name: 'PS Transfer Function', color: '#92400e', icon: 'ps_tf', category: 'Linear Operators',
        params: { T: { value: 1, unit: 's', label: 'Time Constant' } },
        ports: [{ id: 'u', pos: 'left', label: 'U' }, { id: 'y', pos: 'right', label: 'Y' }]
      },

      // Lookup Tables
      {
        id: 'ps_lookup_1d', name: 'PS Lookup Table (1D)', color: '#92400e', icon: 'ps_lookup_1d', category: 'Lookup Tables',
        params: {},
        ports: [{ id: 'u', pos: 'left', label: 'U' }, { id: 'y', pos: 'right', label: 'Y' }]
      },
      {
        id: 'ps_lookup_2d', name: 'PS Lookup Table (2D)', color: '#92400e', icon: 'ps_lookup_2d', category: 'Lookup Tables',
        params: {},
        ports: [{ id: 'u1', pos: 'left', label: 'U1' }, { id: 'u2', pos: 'left', label: 'U2' }, { id: 'y', pos: 'right', label: 'Y' }]
      },

      // Nonlinear Operators
      {
        id: 'ps_abs', name: 'PS Abs', color: '#92400e', icon: 'ps_abs', category: 'Nonlinear Operators',
        params: {},
        ports: [{ id: 'u', pos: 'left', label: 'U' }, { id: 'y', pos: 'right', label: 'Y' }]
      },
      {
        id: 'ps_saturation', name: 'PS Saturation', color: '#92400e', icon: 'ps_sat', category: 'Nonlinear Operators',
        params: { upper: { value: 1, unit: '', label: 'Upper Limit' }, lower: { value: -1, unit: '', label: 'Lower Limit' } },
        ports: [{ id: 'u', pos: 'left', label: 'U' }, { id: 'y', pos: 'right', label: 'Y' }]
      },
      {
        id: 'ps_dead_zone', name: 'PS Dead Zone', color: '#92400e', icon: 'ps_dead', category: 'Nonlinear Operators',
        params: { start: { value: 0.5, unit: '', label: 'Start' }, end: { value: -0.5, unit: '', label: 'End' } },
        ports: [{ id: 'u', pos: 'left', label: 'U' }, { id: 'y', pos: 'right', label: 'Y' }]
      },
      {
        id: 'ps_switch', name: 'PS Switch', color: '#92400e', icon: 'ps_switch', category: 'Nonlinear Operators',
        params: { threshold: { value: 0, unit: '', label: 'Threshold' } },
        ports: [
          { id: 'u1', pos: 'left', label: '1' }, 
          { id: 'ctrl', pos: 'left', label: 'C' }, 
          { id: 'u2', pos: 'left', label: '2' }, 
          { id: 'y', pos: 'right', label: 'Y' }
        ]
      },
      {
        id: 'ps_min', name: 'PS Min', color: '#92400e', icon: 'ps_min', category: 'Nonlinear Operators',
        params: { limit: { value: 100, unit: '', label: 'Saturation' } },
        ports: [{ id: 'u1', pos: 'left', label: '1' }, { id: 'u2', pos: 'left', label: '2' }, { id: 'y', pos: 'right', label: 'MIN' }]
      },
      {
        id: 'ps_max', name: 'PS Max', color: '#92400e', icon: 'ps_max', category: 'Nonlinear Operators',
        params: { limit: { value: -100, unit: '', label: 'Saturation' } },
        ports: [{ id: 'u1', pos: 'left', label: '1' }, { id: 'u2', pos: 'left', label: '2' }, { id: 'y', pos: 'right', label: 'MAX' }]
      },

      // Periodic Operators
      {
        id: 'ps_rms', name: 'PS RMS Estimator', color: '#92400e', icon: 'ps_rms', category: 'Periodic Operators',
        params: { window: { value: 0.02, unit: 's', label: 'Window' } },
        ports: [{ id: 'u', pos: 'left', label: 'U' }, { id: 'y', pos: 'right', label: 'RMS' }]
      },

      // BLDC Control
      {
        id: 'bldc_commutation', name: 'BLDC Commutation Logic', color: '#4b5563', icon: 'bldc_logic', category: 'BLDC Control',
        params: {},
        ports: [
          { id: 'hall', pos: 'left', label: 'Hall' },
          { id: 'dir', pos: 'left', label: 'Direction' },
          { id: 'abc', pos: 'right', label: 'abc' }
        ]
      },
      {
        id: 'bldc_current_ctrl', name: 'BLDC Current Controller', color: '#4b5563', icon: 'bldc_ctrl', category: 'BLDC Control',
        params: { Kp: { value: 1, unit: '', label: 'Prop Gain' }, Ki: { value: 10, unit: '', label: 'Int Gain' } },
        ports: [
          { id: 'is_ref', pos: 'left', label: 'IsRef' },
          { id: 'is', pos: 'left', label: 'Is' },
          { id: 'reset', pos: 'left', label: 'Reset' },
          { id: 'hall', pos: 'left', label: 'Hall' },
          { id: 'dir', pos: 'left', label: 'Direction' },
          { id: 'vabc', pos: 'right', label: 'vabcRef' }
        ]
      },
      {
        id: 'bldc_pwm_ctrl', name: 'BLDC Current Controller with PWM', color: '#4b5563', icon: 'bldc_pwm', category: 'BLDC Control',
        params: { freq: { value: 20000, unit: 'Hz', label: 'PWM Freq' } },
        ports: [
          { id: 'is_ref', pos: 'left', label: 'IsRef' },
          { id: 'is', pos: 'left', label: 'Is' },
          { id: 'reset', pos: 'left', label: 'Reset' },
          { id: 'hall', pos: 'left', label: 'Hall' },
          { id: 'dir', pos: 'left', label: 'Direction' },
          { id: 'g', pos: 'right', label: 'G' }
        ]
      },

      // Converter Control
      {
        id: 'dcdc_ctrl', name: 'DC-DC Voltage Controller', color: '#4b5563', icon: 'dcdc_ctrl', category: 'Converter Control',
        params: { v_ref: { value: 48, unit: 'V', label: 'Ref Voltage' } },
        ports: [
          { id: 'v_ref', pos: 'left', label: 'vRef' },
          { id: 'v', pos: 'left', label: 'v' },
          { id: 'ff', pos: 'left', label: 'FF' },
          { id: 'reset', pos: 'left', label: 'Reset' },
          { id: 'ctrl', pos: 'right', label: 'Control' }
        ]
      },
      {
        id: 'pfc_rectifier_ctrl', name: 'PFC Rectifier Controller', color: '#4b5563', icon: 'pfc_ctrl', category: 'Converter Control',
        params: { Kp_v: { value: 0.1, unit: '', label: 'Volt Prop' }, Ki_v: { value: 2, unit: '', label: 'Volt Int' }, Kp_i: { value: 1, unit: '', label: 'Curr Prop' } },
        ports: [
          { id: 'vdc_ref', pos: 'left', label: 'VdcRef (V)' },
          { id: 'q_ref', pos: 'left', label: 'QRef (pu)' },
          { id: 'vdc_sens', pos: 'left', label: 'VdcSens (V)' },
          { id: 'vabc_sens', pos: 'left', label: 'VabcSens (pu)' },
          { id: 'iabc_sens', pos: 'left', label: 'IabcSens (pu)' },
          { id: 'vabc_ref', pos: 'right', label: 'VabcRef (pu)' },
          { id: 'vis', pos: 'right', label: 'Visualization' }
        ]
      },
      {
        id: 'cycloconverter_ctrl', name: 'Cycloconverter Controller', color: '#4b5563', icon: 'cyclo_ctrl', category: 'Converter Control',
        params: { m: { value: 0.8, unit: '', label: 'Mod Index' }, bank_limit: { value: 0.1, unit: 's', label: 'Bank Delay' } },
        ports: [
          { id: 'v_ref', pos: 'left', label: 'VRef' },
          { id: 'f_ref', pos: 'left', label: 'fRef' },
          { id: 'vabc', pos: 'left', label: 'vabc' },
          { id: 'vcyc', pos: 'left', label: 'Vcyc' },
          { id: 'icyc', pos: 'left', label: 'Icyc' },
          { id: 'p', pos: 'right', label: 'P' },
          { id: 'vis', pos: 'right', label: 'Visualization' }
        ]
      },

      // General Control
      {
        id: 'ps_pi_ctrl', name: 'Discrete PI Controller', color: '#4b5563', icon: 'pi_ctrl', category: 'General Control',
        params: { Kp: { value: 1, unit: '', label: 'Prop Gain' }, Ki: { value: 10, unit: '', label: 'Int Gain' }, limit: { value: 1, unit: '', label: 'Saturation' } },
        ports: [{ id: 'e', pos: 'left', label: 'e' }, { id: 'reset', pos: 'left', label: 'Reset' }, { id: 'u', pos: 'right', label: 'u' }]
      },
      {
        id: 'ps_lpf', name: 'Low-Pass Filter', color: '#4b5563', icon: 'lpf', category: 'General Control',
        params: { f_cut: { value: 100, unit: 'Hz', label: 'Cutoff Freq' } },
        ports: [{ id: 'u', pos: 'left', label: 'u' }, { id: 'y', pos: 'right', label: 'y' }]
      },
      {
        id: 'ps_integrator_gen', name: 'Integrator', color: '#4b5563', icon: 'integrator', category: 'General Control',
        params: { initial: { value: 0, unit: '', label: 'Initial' } },
        ports: [{ id: 'u', pos: 'left', label: 'u' }, { id: 'reset', pos: 'left', label: 'Reset' }, { id: 'y', pos: 'right', label: 'y' }]
      },
      {
        id: 'ps_moving_avg', name: 'Moving Average', color: '#4b5563', icon: 'mov_avg', category: 'General Control',
        params: { window: { value: 10, unit: 'samples', label: 'Window' } },
        ports: [{ id: 'u', pos: 'left', label: 'u' }, { id: 'y', pos: 'right', label: 'Mean' }]
      },
      {
        id: 'ps_sr_flipflop', name: 'SR Flip-Flop', color: '#4b5563', icon: 'sr_ff', category: 'General Control',
        params: {},
        ports: [{ id: 's', pos: 'left', label: 'Set' }, { id: 'r', pos: 'left', label: 'Reset' }, { id: 'q', pos: 'right', label: 'Q' }, { id: 'nq', pos: 'right', label: '!Q' }]
      },
      {
        id: 'ps_sample_hold', name: 'Sample and Hold', color: '#4b5563', icon: 's_h', category: 'General Control',
        params: {},
        ports: [{ id: 'u', pos: 'left', label: 'u' }, { id: 's', pos: 'left', label: 'S' }, { id: 'y', pos: 'right', label: 'y' }]
      },
      {
        id: 'ps_smith_predictor', name: 'Smith Predictor', color: '#4b5563', icon: 'smith', category: 'General Control',
        params: { tau: { value: 0.1, unit: 's', label: 'Dead Time' } },
        ports: [{ id: 'r', pos: 'left', label: 'r' }, { id: 'y', pos: 'left', label: 'y' }, { id: 'u', pos: 'right', label: 'u' }]
      },
      {
        id: 'ps_sine_3phase', name: 'Sine Generator (3-Phase)', color: '#4b5563', icon: 'sine_3ph', category: 'General Control',
        params: { amp: { value: 1, unit: 'pu', label: 'Amplitude' }, freq: { value: 50, unit: 'Hz', label: 'Frequency' } },
        ports: [{ id: 'm', pos: 'left', label: 'm' }, { id: 'ang', pos: 'left', label: 'ang' }, { id: 'abc', pos: 'right', label: 'abc' }, { id: 'wt', pos: 'right', label: 'wt' }]
      },
      {
        id: 'ps_second_order_filter', name: 'Second-Order Filter', color: '#4b5563', icon: 'second_order', category: 'General Control',
        params: { zeta: { value: 0.707, unit: '', label: 'Damping' }, wn: { value: 100, unit: 'rad/s', label: 'Nat Freq' } },
        ports: [{ id: 'u', pos: 'left', label: 'u' }, { id: 'y', pos: 'right', label: 'y' }]
      },
      {
        id: 'ps_state_feedback', name: 'State-Feedback Controller', color: '#4b5563', icon: 'state_fb', category: 'General Control',
        params: { K: { value: '[1 2]', unit: '', label: 'Gain K' } },
        ports: [{ id: 'r', pos: 'left', label: 'r' }, { id: 'x', pos: 'left', label: 'x' }, { id: 'u', pos: 'right', label: 'u' }, { id: 'reset', pos: 'left', label: 'Reset' }]
      },
      {
        id: 'ps_sliding_mode', name: 'Sliding Mode Controller', color: '#4b5563', icon: 'smc', category: 'General Control',
        params: { lambda: { value: 1, unit: '', label: 'Surface' }, k: { value: 10, unit: '', label: 'Gain K' } },
        ports: [{ id: 'r', pos: 'left', label: 'r' }, { id: 'y', pos: 'left', label: 'y' }, { id: 'u', pos: 'right', label: 'u' }]
      },
      {
        id: 'ps_stair_gen', name: 'Stair Generator', color: '#4b5563', icon: 'stair', category: 'General Control',
        params: { steps: { value: '[0 1 2 1 0]', unit: '', label: 'Steps' }, ts: { value: 0.1, unit: 's', label: 'Sample' } },
        ports: [{ id: 'y', pos: 'right', label: 'y' }]
      },
      {
        id: 'ps_washout', name: 'Washout Filter', color: '#4b5563', icon: 'washout', category: 'General Control',
        params: { T: { value: 0.1, unit: 's', label: 'Time Const' } },
        ports: [{ id: 'u', pos: 'left', label: 'u' }, { id: 'y', pos: 'right', label: 'y' }]
      },

      // Machine Control
      {
        id: 'dc_current_ctrl', name: 'DC Current Controller', color: '#4b5563', icon: 'dc_curr_ctrl', category: 'Machine Control',
        params: { Kp: { value: 1, unit: '', label: 'Prop Gain' }, Ki: { value: 10, unit: '', label: 'Int Gain' }, v_max: { value: 240, unit: 'V', label: 'Max Voltage' } },
        ports: [{ id: 'i_ref', pos: 'left', label: 'iRef' }, { id: 'i', pos: 'left', label: 'i' }, { id: 'v_max', pos: 'left', label: 'vMax' }, { id: 'reset', pos: 'left', label: 'Reset' }, { id: 'v_ref', pos: 'right', label: 'vRef' }]
      },
      {
        id: 'dc_voltage_ctrl', name: 'DC Voltage Controller', color: '#4b5563', icon: 'dc_volt_ctrl', category: 'Machine Control',
        params: { Kp: { value: 0.5, unit: '', label: 'Prop Gain' }, Ki: { value: 5, unit: '', label: 'Int Gain' } },
        ports: [{ id: 'v_ref', pos: 'left', label: 'vRef' }, { id: 'v', pos: 'left', label: 'v' }, { id: 'reset', pos: 'left', label: 'Reset' }, { id: 'ctrl', pos: 'right', label: 'Control' }]
      },
      {
        id: 'hysteresis_ctrl_3ph', name: 'Hysteresis Current Controller (3-Ph)', color: '#4b5563', icon: 'hyst_ctrl', category: 'Machine Control',
        params: { band: { value: 0.1, unit: 'A', label: 'Hyst Band' } },
        ports: [{ id: 'iabc_ref', pos: 'left', label: 'iabc*' }, { id: 'iabc', pos: 'left', label: 'iabc' }, { id: 's', pos: 'right', label: 'S' }]
      },
      {
        id: 'velocity_ctrl', name: 'Velocity Controller', color: '#4b5563', icon: 'vel_ctrl', category: 'Machine Control',
        params: { Kp: { value: 1, unit: '', label: 'Prop Gain' }, Ki: { value: 2, unit: '', label: 'Int Gain' } },
        ports: [{ id: 'w_ref', pos: 'left', label: 'wRef' }, { id: 'w_mech', pos: 'left', label: 'wMechanical' }, { id: 'tq_sat', pos: 'left', label: 'TqRefSat' }, { id: 'reset', pos: 'left', label: 'Reset' }, { id: 'tq_unsat', pos: 'right', label: 'TqRefUnsat' }]
      },

      // Induction Machine Control
      {
        id: 'im_scalar_ctrl', name: 'Induction Machine Scalar Control', color: '#4b5563', icon: 'im_scalar', category: 'Induction Machine Control',
        params: { v_f_ratio: { value: 4.4, unit: '', label: 'V/f Ratio' } },
        ports: [{ id: 'f_ref', pos: 'left', label: 'fRef' }, { id: 'vabc', pos: 'right', label: 'Vabc' }]
      },
      {
        id: 'im_foc_ctrl', name: 'Induction Machine FOC', color: '#4b5563', icon: 'im_foc', category: 'Induction Machine Control',
        params: { Lm: { value: 0.05, unit: 'H', label: 'Mutual Ind' }, Rr: { value: 0.1, unit: 'Ohm', label: 'Rotor Res' } },
        ports: [
          { id: 'imr_ref', pos: 'left', label: 'imrRef' },
          { id: 'wr_ref', pos: 'left', label: 'wrRef' },
          { id: 'iabc', pos: 'left', label: 'iabc' },
          { id: 'wr', pos: 'left', label: 'wr' },
          { id: 'vdc', pos: 'left', label: 'Vdc' },
          { id: 'g', pos: 'right', label: 'G' },
          { id: 'vis', pos: 'right', label: 'Visualization' }
        ]
      },
      {
        id: 'im_dtc_ctrl', name: 'Induction Machine DTC', color: '#4b5563', icon: 'im_dtc', category: 'Induction Machine Control',
        params: { flux_ref: { value: 0.8, unit: 'Wb', label: 'Flux Ref' } },
        ports: [
          { id: 'flux_ref', pos: 'left', label: 'FluxRef' },
          { id: 'tq_ref', pos: 'left', label: 'TqRef' },
          { id: 'vabc', pos: 'left', label: 'vabc' },
          { id: 'iabc', pos: 'left', label: 'iabc' },
          { id: 'g', pos: 'right', label: 'G' }
        ]
      },
      {
        id: 'im_curr_ctrl', name: 'Induction Machine Current Controller', color: '#4b5563', icon: 'im_curr', category: 'Induction Machine Control',
        params: { Kp: { value: 1, unit: '', label: 'Prop Gain' } },
        ports: [
          { id: 'idq_ref', pos: 'left', label: 'idqRef' },
          { id: 'idq', pos: 'left', label: 'idq' },
          { id: 'vdq_ff', pos: 'left', label: 'vdqFF' },
          { id: 'v_max', pos: 'left', label: 'VphMax' },
          { id: 'reset', pos: 'left', label: 'Reset' },
          { id: 'vdq_ref', pos: 'right', label: 'vdqRef' }
        ]
      },

      // Math Transforms
      {
        id: 'clarke_transform', name: 'Clarke Transform', color: '#4b5563', icon: 'clarke', category: 'Math Transforms',
        params: { convention: { value: 'Peak Amp Preserved', unit: '', label: 'Convention' } },
        ports: [{ id: 'abc', pos: 'left', label: 'abc' }, { id: 'ab0', pos: 'right', label: 'ab0' }]
      },
      {
        id: 'inv_clarke_transform', name: 'Inverse Clarke Transform', color: '#4b5563', icon: 'inv_clarke', category: 'Math Transforms',
        params: { convention: { value: 'Peak Amp Preserved', unit: '', label: 'Convention' } },
        ports: [{ id: 'ab0', pos: 'left', label: 'ab0' }, { id: 'abc', pos: 'right', label: 'abc' }]
      },
      {
        id: 'park_transform', name: 'Park Transform', color: '#4b5563', icon: 'park', category: 'Math Transforms',
        params: { alignment: { value: '90 deg behind A', unit: '', label: 'Alignment' } },
        ports: [{ id: 'abc', pos: 'left', label: 'abc' }, { id: 'theta', pos: 'left', label: 'theta' }, { id: 'dq0', pos: 'right', label: 'dq0' }]
      },
      {
        id: 'inv_park_transform', name: 'Inverse Park Transform', color: '#4b5563', icon: 'inv_park', category: 'Math Transforms',
        params: { alignment: { value: '90 deg behind A', unit: '', label: 'Alignment' } },
        ports: [{ id: 'dq0', pos: 'left', label: 'dq0' }, { id: 'theta', pos: 'left', label: 'theta' }, { id: 'abc', pos: 'right', label: 'abc' }]
      },
      {
        id: 'sym_comp_transform', name: 'Symmetrical-Components', color: '#4b5563', icon: 'sym_comp', category: 'Math Transforms',
        params: { freq: { value: 50, unit: 'Hz', label: 'Base Freq' } },
        ports: [{ id: 'abc', pos: 'left', label: 'abc' }, { id: 'seq', pos: 'right', label: '+-0' }]
      },
      {
        id: 'inv_sym_comp_transform', name: 'Inverse Symmetrical-Components', color: '#4b5563', icon: 'inv_sym_comp', category: 'Math Transforms',
        params: { freq: { value: 50, unit: 'Hz', label: 'Base Freq' } },
        ports: [{ id: 'seq', pos: 'left', label: '+-0' }, { id: 'abc', pos: 'right', label: 'abc' }]
      },

      // Observers & Sensors
      {
        id: 'im_flux_observer', name: 'Induction Machine Flux Observer', color: '#4b5563', icon: 'flux_obs', category: 'Observers & Sensors',
        params: { Rs: { value: 0.1, unit: 'Ohm', label: 'Stator Res' }, Lm: { value: 0.05, unit: 'H', label: 'Mutual Ind' } },
        ports: [
          { id: 'iabc', pos: 'left', label: 'iabc' },
          { id: 'wr', pos: 'left', label: 'wr' },
          { id: 'idqsef', pos: 'right', label: 'idqseF' },
          { id: 'imr', pos: 'right', label: 'imr' },
          { id: 'theta', pos: 'right', label: 'theta' },
          { id: 'we', pos: 'right', label: 'we' }
        ]
      },
      {
        id: 'luenberger_observer', name: 'Luenberger Observer', color: '#4b5563', icon: 'luenberger', category: 'Observers & Sensors',
        params: { A: { value: '[0 1; -1 -1]', unit: '', label: 'System A' }, L: { value: '[10; 10]', unit: '', label: 'Gain L' } },
        ports: [{ id: 'u', pos: 'left', label: 'u' }, { id: 'y', pos: 'left', label: 'y' }, { id: 'xhat', pos: 'right', label: 'xhat' }]
      },
      {
        id: 'quad_decoder', name: 'Quadrature Shaft Decoder', color: '#4b5563', icon: 'quad_dec', category: 'Observers & Sensors',
        params: { ppr: { value: 1024, unit: '', label: 'Pulses/Rev' } },
        ports: [
          { id: 'a', pos: 'left', label: 'A' },
          { id: 'b', pos: 'left', label: 'B' },
          { id: 'z', pos: 'left', label: 'Z' },
          { id: 'vel', pos: 'right', label: 'Velocity' },
          { id: 'pos', pos: 'right', label: 'Position' }
        ]
      },
      {
        id: 'resolver_to_digital', name: 'Resolver-to-Digital Converter', color: '#4b5563', icon: 'rtd', category: 'Observers & Sensors',
        params: { freq: { value: 10000, unit: 'Hz', label: 'Excitation' } },
        ports: [
          { id: 'vp', pos: 'left', label: 'Vp' },
          { id: 'vx', pos: 'left', label: 'Vx' },
          { id: 'vy', pos: 'left', label: 'Vy' },
          { id: 'vel', pos: 'right', label: 'Velocity' },
          { id: 'ang', pos: 'right', label: 'Angle' }
        ]
      },

      // PMSM Control
      {
        id: 'pmsm_curr_ctrl', name: 'PMSM Current Controller', color: '#4b5563', icon: 'pmsm_curr', category: 'PMSM Control',
        params: { Kp: { value: 2, unit: '', label: 'Prop Gain' } },
        ports: [
          { id: 'idq_ref', pos: 'left', label: 'idqRef' },
          { id: 'idq', pos: 'left', label: 'idq' },
          { id: 'vdq_ff', pos: 'left', label: 'vdqFF' },
          { id: 'v_max', pos: 'left', label: 'VphMax' },
          { id: 'reset', pos: 'left', label: 'Reset' },
          { id: 'vdq_ref', pos: 'right', label: 'vdqRef' }
        ]
      },
      {
        id: 'pmsm_ref_gen', name: 'PMSM Current Reference Generator', color: '#4b5563', icon: 'pmsm_ref', category: 'PMSM Control',
        params: { Ld: { value: 0.005, unit: 'H', label: 'Ld Ind' }, Lq: { value: 0.005, unit: 'H', label: 'Lq Ind' }, flux: { value: 0.1, unit: 'Wb', label: 'PM Flux' } },
        ports: [
          { id: 'tq_ref', pos: 'left', label: 'TqRef' },
          { id: 'w_mech', pos: 'left', label: 'wMechanical' },
          { id: 'vdc', pos: 'left', label: 'Vdc' },
          { id: 'idq_ref', pos: 'right', label: 'idqRef' },
          { id: 'tq_ref_sat', pos: 'right', label: 'TqRefSat' },
          { id: 'tq_lim', pos: 'right', label: 'TqLim' }
        ]
      },
      {
        id: 'pmsm_foc', name: 'PMSM Field-Oriented Control', color: '#4b5563', icon: 'pmsm_foc', category: 'PMSM Control',
        params: { Rs: { value: 0.1, unit: 'Ohm', label: 'Stator Res' } },
        ports: [
          { id: 'ref', pos: 'left', label: 'Reference' },
          { id: 'iabc_s', pos: 'left', label: 'iabcSens' },
          { id: 'w_s', pos: 'left', label: 'wSens' },
          { id: 'th_s', pos: 'left', label: 'thSens' },
          { id: 'vdc_s', pos: 'left', label: 'vdcSens' },
          { id: 'g', pos: 'right', label: 'G' },
          { id: 'vis', pos: 'right', label: 'Visualization' }
        ]
      },
      {
        id: 'pmsm_field_weakening', name: 'PMSM Field-Weakening Controller', color: '#4b5563', icon: 'pmsm_fw', category: 'PMSM Control',
        params: { v_margin: { value: 0.95, unit: '', label: 'Volt Margin' } },
        ports: [
          { id: 'idq_ref', pos: 'left', label: 'idqRef' },
          { id: 'vdq', pos: 'left', label: 'vdq' },
          { id: 'v_max', pos: 'left', label: 'VphMax' },
          { id: 'idq_ref_fw', pos: 'right', label: 'idqRefFW' }
        ]
      },
      {
        id: 'pmsm_tq_est', name: 'PMSM Torque Estimator', color: '#4b5563', icon: 'pmsm_tq', category: 'PMSM Control',
        params: { pole_pairs: { value: 4, unit: '', label: 'Pole Pairs' } },
        ports: [{ id: 'idq', pos: 'left', label: 'idq' }, { id: 'tq_est', pos: 'right', label: 'TqEst' }]
      },

      // PWM & Gate Generation
      {
        id: 'pwm_3ph_2level', name: 'PWM Generator (3-Phase, 2-Level)', color: '#4b5563', icon: 'pwm_3ph', category: 'PWM & Gate Generation',
        params: { f_sw: { value: 5000, unit: 'Hz', label: 'Switch Freq' } },
        ports: [{ id: 'vabc', pos: 'left', label: 'Vabc' }, { id: 'vdc', pos: 'left', label: 'Vdc' }, { id: 'g', pos: 'right', label: 'g' }, { id: 'mod', pos: 'right', label: 'ModWave' }]
      },
      {
        id: 'pwm_3ph_3level', name: 'PWM Generator (3-Phase, 3-Level)', color: '#4b5563', icon: 'pwm_npc', category: 'PWM & Gate Generation',
        params: { f_sw: { value: 2000, unit: 'Hz', label: 'Switch Freq' } },
        ports: [{ id: 'vabc', pos: 'left', label: 'Vabc' }, { id: 'vdc', pos: 'left', label: 'Vdc' }, { id: 'vneut', pos: 'left', label: 'vNeutral' }, { id: 'g', pos: 'right', label: 'g' }, { id: 'mod', pos: 'right', label: 'ModWave' }]
      },
      {
        id: 'pwm_vienna', name: 'PWM Generator (Vienna Rectifier)', color: '#4b5563', icon: 'pwm_vienna', category: 'PWM & Gate Generation',
        params: { f_sw: { value: 10000, unit: 'Hz', label: 'Switch Freq' } },
        ports: [{ id: 'vabc', pos: 'left', label: 'Vabc' }, { id: 'iabc', pos: 'left', label: 'Iabc' }, { id: 'vdc', pos: 'left', label: 'Vdc' }, { id: 'vneut', pos: 'left', label: 'vNeutral' }, { id: 'g', pos: 'right', label: 'g' }]
      },
      {
        id: 'thyristor_6pulse', name: 'Thyristor 6-Pulse Generator', color: '#4b5563', icon: 'thy_6p', category: 'PWM & Gate Generation',
        params: { freq: { value: 50, unit: 'Hz', label: 'Freq' } },
        ports: [{ id: 'theta', pos: 'left', label: 'theta' }, { id: 'alpha', pos: 'left', label: 'alpha' }, { id: 'p', pos: 'right', label: 'P' }]
      },
      {
        id: 'thyristor_12pulse', name: 'Thyristor 12-Pulse Generator', color: '#4b5563', icon: 'thy_12p', category: 'PWM & Gate Generation',
        params: { freq: { value: 50, unit: 'Hz', label: 'Freq' } },
        ports: [{ id: 'theta', pos: 'left', label: 'theta' }, { id: 'alpha', pos: 'left', label: 'alpha' }, { id: 'pdelta', pos: 'right', label: 'Pdelta' }, { id: 'pwye', pos: 'right', label: 'Pwye' }]
      },

      // Belts & Cables
      {
        id: 'belt_properties', name: 'Belt-Cable Properties', color: '#4b5563', icon: 'belt_props', category: 'Belts & Cables',
        params: { density: { value: 1.1, unit: 'kg/m', label: 'Linear Dens' }, youngs: { value: 1e9, unit: 'Pa', label: 'Young Mod' } },
        ports: [{ id: 'p', pos: 'left', label: 'P' }]
      },
      {
        id: 'belt_end', name: 'Belt-Cable End', color: '#4b5563', icon: 'belt_end', category: 'Belts & Cables',
        params: { stiffness: { value: 1e6, unit: 'N/m', label: 'Stiffness' } },
        ports: [{ id: 'r', pos: 'left', label: 'R' }, { id: 'e', pos: 'right', label: 'E' }]
      },
      {
        id: 'belt_spool', name: 'Belt-Cable Spool', color: '#4b5563', icon: 'belt_spool', category: 'Belts & Cables',
        params: { radius: { value: 0.1, unit: 'm', label: 'Radius' } },
        ports: [{ id: 'r', pos: 'left', label: 'R' }, { id: 'a', pos: 'right', label: 'A' }]
      },
      {
        id: 'pulley', name: 'Pulley', color: '#4b5563', icon: 'pulley', category: 'Belts & Cables',
        params: { radius: { value: 0.1, unit: 'm', label: 'Radius' }, inertia: { value: 0.01, unit: 'kg-m2', label: 'Inertia' } },
        ports: [{ id: 'r', pos: 'left', label: 'R' }, { id: 'a', pos: 'right', label: 'A' }, { id: 'b', pos: 'right', label: 'B' }]
      },

      // Multibody: Frames & Transforms
      {
        id: 'world_frame', name: 'World Frame', color: '#4b5563', icon: 'world_frame', category: 'Frames & Transforms',
        params: {},
        ports: [{ id: 'w', pos: 'right', label: 'W' }]
      },
      {
        id: 'ref_frame', name: 'Reference Frame', color: '#4b5563', icon: 'ref_frame', category: 'Frames & Transforms',
        params: {},
        ports: [{ id: 'r', pos: 'right', label: 'R' }]
      },
      {
        id: 'rigid_transform', name: 'Rigid Transform', color: '#4b5563', icon: 'rigid_trans', category: 'Frames & Transforms',
        params: { offset: { value: '[0 0 0]', unit: 'm', label: 'Offset' }, rotation: { value: '[0 0 0]', unit: 'deg', label: 'Rotation' } },
        ports: [{ id: 'b', pos: 'left', label: 'B' }, { id: 'f', pos: 'right', label: 'F' }]
      },

      // Multibody: Constraints
      {
        id: 'dist_constraint', name: 'Distance Constraint', color: '#4b5563', icon: 'dist_cons', category: 'Constraints',
        params: { dist: { value: 1, unit: 'm', label: 'Distance' } },
        ports: [{ id: 'b', pos: 'left', label: 'B' }, { id: 'f', pos: 'right', label: 'F' }]
      },
      {
        id: 'angle_constraint', name: 'Angle Constraint', color: '#4b5563', icon: 'angle_cons', category: 'Constraints',
        params: { angle: { value: 0, unit: 'deg', label: 'Angle' } },
        ports: [{ id: 'b', pos: 'left', label: 'B' }, { id: 'f', pos: 'right', label: 'F' }]
      },

      // Multibody: Forces & Torques
      {
        id: 'grav_field', name: 'Gravitational Field', color: '#4b5563', icon: 'grav', category: 'Forces & Torques',
        params: { g: { value: 9.81, unit: 'm/s2', label: 'Gravity' } },
        ports: [{ id: 'b', pos: 'left', label: 'B' }, { id: 'f', pos: 'right', label: 'F' }]
      },
      {
        id: 'spring_damper_force', name: 'Spring and Damper Force', color: '#4b5563', icon: 'spring_damper', category: 'Forces & Torques',
        params: { k: { value: 1000, unit: 'N/m', label: 'Stiffness' }, b: { value: 10, unit: 'N-s/m', label: 'Damping' } },
        ports: [{ id: 'b', pos: 'left', label: 'B' }, { id: 'f', pos: 'right', label: 'F' }]
      },
      {
        id: 'external_force', name: 'External Force and Torque', color: '#4b5563', icon: 'ext_force', category: 'Forces & Torques',
        params: { force_scale: { value: 1, unit: '1', label: 'Force Scale' }, torque_scale: { value: 1, unit: '1', label: 'Torque Scale' } },
        ports: [{ id: 'f', pos: 'left', label: 'F' }, { id: 'b', pos: 'right', label: 'B' }]
      },

      // Multibody: Joints
      {
        id: 'revolute_joint', name: 'Revolute Joint', color: '#4b5563', icon: 'rev_joint', category: 'Joints',
        params: { damping: { value: 0.1, unit: 'N-m-s/rad', label: 'Damping' } },
        ports: [{ id: 'b', pos: 'left', label: 'B' }, { id: 'f', pos: 'right', label: 'F' }]
      },
      {
        id: 'prismatic_joint', name: 'Prismatic Joint', color: '#4b5563', icon: 'prism_joint', category: 'Joints',
        params: { damping: { value: 1, unit: 'N-s/m', label: 'Damping' } },
        ports: [{ id: 'b', pos: 'left', label: 'B' }, { id: 'f', pos: 'right', label: 'F' }]
      },
      {
        id: 'spherical_joint', name: 'Spherical Joint', color: '#4b5563', icon: 'sphere_joint', category: 'Joints',
        params: { damping: { value: 0.05, unit: 'N-m-s/rad', label: 'Damping' } },
        ports: [{ id: 'b', pos: 'left', label: 'B' }, { id: 'f', pos: 'right', label: 'F' }]
      },
      {
        id: 'universal_joint', name: 'Universal Joint', color: '#4b5563', icon: 'univ_joint', category: 'Joints',
        params: { damping: { value: 0.05, unit: 'N-m-s/rad', label: 'Damping' } },
        ports: [{ id: 'b', pos: 'left', label: 'B' }, { id: 'f', pos: 'right', label: 'F' }]
      },
      {
        id: 'weld_joint', name: 'Weld Joint', color: '#4b5563', icon: 'weld_joint', category: 'Joints',
        params: { stiffness: { value: 1e9, unit: 'N/m', label: 'Stiffness' } },
        ports: [{ id: 'b', pos: 'left', label: 'B' }, { id: 'f', pos: 'right', label: 'F' }]
      },

      // Multibody: Gears
      {
        id: 'common_gear', name: 'Common Gear Constraint', color: '#4b5563', icon: 'gear_cons', category: 'Gears',
        params: { ratio: { value: 2, unit: '', label: 'Ratio' } },
        ports: [{ id: 'b', pos: 'left', label: 'B' }, { id: 'f', pos: 'right', label: 'F' }]
      },
      {
        id: 'rack_pinion', name: 'Rack and Pinion Constraint', color: '#4b5563', icon: 'rack_pinion', category: 'Gears',
        params: { radius: { value: 0.1, unit: 'm', label: 'Radius' } },
        ports: [{ id: 'b', pos: 'left', label: 'B' }, { id: 'f', pos: 'right', label: 'F' }]
      },

      // Multibody: Utilities
      {
        id: 'mech_config', name: 'Mechanism Configuration', color: '#4b5563', icon: 'mech_cfg', category: 'Multibody Utilities',
        params: { gravity: { value: '[0 0 -9.81]', unit: 'm/s2', label: 'Gravity' } },
        ports: [{ id: 'c', pos: 'right', label: 'C' }]
      },

      // Sinks
      {
        id: 'ps_terminator', name: 'PS Terminator', color: '#92400e', icon: 'ps_term', category: 'Sinks',
        params: {},
        ports: [{ id: 'u', pos: 'left', label: '' }]
      },

      // Sources
      {
        id: 'ps_constant', name: 'PS Constant', color: '#92400e', icon: 'ps_const', category: 'Sources',
        params: { value: { value: 1, unit: '1', label: 'Constant' } },
        ports: [{ id: 'y', pos: 'right', label: 'C' }]
      },
      {
        id: 'ps_sine', name: 'PS Sine Wave', color: '#92400e', icon: 'ps_sine', category: 'Sources',
        params: { amp: { value: 1, unit: '1', label: 'Amplitude' }, freq: { value: 1, unit: 'Hz', label: 'Frequency' } },
        ports: [{ id: 'y', pos: 'right', label: 'y' }]
      },
      {
        id: 'ps_step', name: 'PS Step', color: '#92400e', icon: 'ps_step', category: 'Sources',
        params: { time: { value: 1, unit: 's', label: 'Step Time' }, initial: { value: 0, unit: '1', label: 'Initial' }, final: { value: 1, unit: '1', label: 'Final' } },
        ports: [{ id: 'y', pos: 'right', label: 'y' }]
      },
      {
        id: 'ps_ramp', name: 'PS Ramp', color: '#92400e', icon: 'ps_ramp', category: 'Sources',
        params: { slope: { value: 1, unit: '1/s', label: 'Slope' }, start: { value: 0, unit: 's', label: 'Start Time' } },
        ports: [{ id: 'y', pos: 'right', label: 'y' }]
      }
    ]
  },
  {
    type: 'Thermal',
    blocks: [
      // Elements
      {
        id: 'conductive_heat', name: 'Conductive Heat Transfer', color: '#f97316', icon: 'conductive', category: 'Elements',
        params: { k: { value: 1, unit: 'W/K', label: 'Conductance' } },
        ports: [{ id: 'a', pos: 'left', label: 'A' }, { id: 'b', pos: 'right', label: 'B' }]
      },
      {
        id: 'convective_heat', name: 'Convective Heat Transfer', color: '#f97316', icon: 'convective', category: 'Elements',
        params: { h: { value: 10, unit: 'W/m^2/K', label: 'Heat Coeff' }, A: { value: 1, unit: 'm^2', label: 'Area' } },
        ports: [{ id: 'a', pos: 'left', label: 'A' }, { id: 'b', pos: 'right', label: 'B' }]
      },
      {
        id: 'radiative_heat', name: 'Radiative Heat Transfer', color: '#f97316', icon: 'radiative', category: 'Elements',
        params: { eps: { value: 0.9, unit: '1', label: 'Emissivity' }, A: { value: 1, unit: 'm^2', label: 'Area' } },
        ports: [{ id: 'a', pos: 'left', label: 'A' }, { id: 'b', pos: 'right', label: 'B' }]
      },
      {
        id: 'thermal_mass', name: 'Thermal Mass', color: '#f97316', icon: 'thermal_mass', category: 'Elements',
        params: { C: { value: 1000, unit: 'J/K', label: 'Thermal Capacity' } },
        ports: [{ id: 'a', pos: 'top', label: 'A' }]
      },
      {
        id: 'thermal_ref', name: 'Thermal Reference', color: '#f97316', icon: 'thermal_ref', category: 'Elements',
        params: {},
        ports: [{ id: 'a', pos: 'top', label: 'A' }]
      },

      // Sensors
      {
        id: 'heat_flow_sensor', name: 'Heat Flow Rate Sensor', color: '#f97316', icon: 'heat_sensor', category: 'Sensors',
        params: {},
        ports: [{ id: 'a', pos: 'left', label: 'A' }, { id: 'b', pos: 'right', label: 'B' }, { id: 'h', pos: 'top', label: 'H' }]
      },
      {
        id: 'temp_sensor', name: 'Temperature Sensor', color: '#f97316', icon: 'temp_sensor', category: 'Sensors',
        params: {},
        ports: [{ id: 'a', pos: 'left', label: 'A' }, { id: 'b', pos: 'right', label: 'B' }, { id: 't', pos: 'top', label: 'T' }]
      },

      // Sources
      {
        id: 'heat_src', name: 'Heat Flow Rate Source', color: '#f97316', icon: 'heat_src', category: 'Sources',
        params: { Q: { value: 10, unit: 'W', label: 'Heat Flow Rate' } },
        ports: [{ id: 'a', pos: 'bottom', label: 'A' }, { id: 'b', pos: 'top', label: 'B' }]
      },
      {
        id: 'temp_src', name: 'Temperature Source', color: '#f97316', icon: 'temp_src', category: 'Sources',
        params: { T: { value: 293.15, unit: 'K', label: 'Temperature' } },
        ports: [{ id: 'a', pos: 'top', label: 'A' }]
      },
      {
        id: 'ctrl_heat_src', name: 'Controlled Heat Flow Rate Source', color: '#f97316', icon: 'ctrl_heat_src', category: 'Sources',
        params: {},
        ports: [{ id: 'a', pos: 'bottom', label: 'A' }, { id: 'b', pos: 'top', label: 'B' }, { id: 's', pos: 'left', label: 'S' }]
      },
      {
        id: 'ctrl_temp_src', name: 'Controlled Temperature Source', color: '#f97316', icon: 'ctrl_temp_src', category: 'Sources',
        params: {},
        ports: [{ id: 'a', pos: 'bottom', label: 'A' }, { id: 'b', pos: 'top', label: 'B' }, { id: 's', pos: 'left', label: 'S' }]
      }
    ]
  },
  {
    type: 'Utilities',
    blocks: [
      {
        id: 'solver_config', name: 'Solver Configuration', color: '#4b5563', icon: 'solver_config', category: 'General',
        params: { dt: { value: 0.001, unit: 's', label: 'Step Size' } },
        ports: [{ id: 'a', pos: 'right', label: '' }]
      },
      {
        id: 'ps_simulink_conv', name: 'PS-Simulink Converter', color: '#4b5563', icon: 'ps_to_sim', category: 'Converters',
        params: {},
        ports: [{ id: 'in', pos: 'left', label: '' }, { id: 'out', pos: 'right', label: '' }]
      },
      {
        id: 'simulink_ps_conv', name: 'Simulink-PS Converter', color: '#4b5563', icon: 'sim_to_ps', category: 'Converters',
        params: {},
        ports: [{ id: 'in', pos: 'left', label: '' }, { id: 'out', pos: 'right', label: '' }]
      },
      {
        id: 'vlab_probe', name: 'Probe', color: '#4b5563', icon: 'probe', category: 'General',
        params: {},
        ports: [{ id: 'in', pos: 'left', label: '' }, { id: 'out', pos: 'right', label: 'x' }]
      },
      {
        id: 'conn_label', name: 'Connection Label', color: '#4b5563', icon: 'conn_label', category: 'General',
        params: { tag: { value: 'A', unit: '', label: 'Label' } },
        ports: [{ id: 'a', pos: 'left', label: '' }]
      }
    ]
  }
];
