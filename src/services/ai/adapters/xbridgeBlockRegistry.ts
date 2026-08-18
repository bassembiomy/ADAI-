export interface PortDefinition {
  id: string;
  domain: 'SIGNAL_IN' | 'SIGNAL_OUT' | 'PHYSICAL_ELECTRICAL';
}

export interface BlockDefinition {
  type: string;
  ports: PortDefinition[];
  expectedParameters: Record<string, string>;
}

export const XBLOCK_REGISTRY: Record<string, BlockDefinition> = {
  DC_VOLTAGE_SOURCE: {
    type: 'DC_VOLTAGE_SOURCE',
    ports: [{ id: 'pos', domain: 'PHYSICAL_ELECTRICAL' }, { id: 'neg', domain: 'PHYSICAL_ELECTRICAL' }],
    expectedParameters: { nominalVoltage: 'Voltage' }
  },
  WAVEFORM_GENERATOR: {
    type: 'WAVEFORM_GENERATOR',
    ports: [{ id: 'out_signal', domain: 'SIGNAL_OUT' }],
    expectedParameters: { frequency: 'Frequency' }
  },
  SPWM_GENERATOR: {
    type: 'SPWM_GENERATOR',
    ports: [{ id: 'in_modulation', domain: 'SIGNAL_IN' }, { id: 'out_pwm', domain: 'SIGNAL_OUT' }],
    expectedParameters: { carrierFrequency: 'Frequency', modulationIndex: 'Dimensionless' }
  },
  FULL_H_BRIDGE: {
    type: 'FULL_H_BRIDGE',
    ports: [
      { id: 'dc_pos', domain: 'PHYSICAL_ELECTRICAL' },
      { id: 'dc_neg', domain: 'PHYSICAL_ELECTRICAL' },
      { id: 'gate_pwm', domain: 'SIGNAL_IN' },
      { id: 'ac_pos', domain: 'PHYSICAL_ELECTRICAL' },
      { id: 'ac_neg', domain: 'PHYSICAL_ELECTRICAL' }
    ],
    expectedParameters: {}
  },
  LC_FILTER: {
    type: 'LC_FILTER',
    ports: [
      { id: 'in_pos', domain: 'PHYSICAL_ELECTRICAL' },
      { id: 'in_neg', domain: 'PHYSICAL_ELECTRICAL' },
      { id: 'out_pos', domain: 'PHYSICAL_ELECTRICAL' },
      { id: 'out_neg', domain: 'PHYSICAL_ELECTRICAL' }
    ],
    expectedParameters: { inductance: 'Inductance', capacitance: 'Capacitance' }
  },
  RESISTIVE_LOAD: {
    type: 'RESISTIVE_LOAD',
    ports: [{ id: 'pos', domain: 'PHYSICAL_ELECTRICAL' }, { id: 'neg', domain: 'PHYSICAL_ELECTRICAL' }],
    expectedParameters: { resistance: 'Resistance' }
  },
  VOLTAGE_SENSOR_SCOPE: {
    type: 'VOLTAGE_SENSOR_SCOPE',
    ports: [{ id: 'probe_pos', domain: 'PHYSICAL_ELECTRICAL' }, { id: 'probe_neg', domain: 'PHYSICAL_ELECTRICAL' }],
    expectedParameters: {}
  }
};
