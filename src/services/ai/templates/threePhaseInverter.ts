import { EngineeringSystemTemplate } from './templateTypes';

export const THREE_PHASE_INVERTER_TEMPLATE: EngineeringSystemTemplate = {
  id: 'three_phase_inverter',
  name: 'Three-Phase Inverter',
  targetDomain: 'xbridges',
  triggerKeywords: [
    'three phase inverter',
    'three-phase inverter',
    '3-phase inverter',
    '3 phase inverter',
    'inverter bridge',
    'spwm inverter',
    'dc-ac inverter',
    'dc to ac inverter',
    'three phase bridge',
    'inverter'
  ],
  description: 'Three-phase DC to AC inverter power converter using PWM gate generation and LC output filtering',
  requiredQuestions: [
    {
      key: 'dcBusVoltage',
      question: 'What is the DC bus input supply voltage (e.g., 400V, 800V)?',
      recommendedDefault: '400V',
      rationale: 'DC bus voltage establishes semiconductor voltage stress and peak AC output amplitude.',
      options: ['400V', '600V', '800V', '48V'],
      isCritical: true
    },
    {
      key: 'switchingFrequency',
      question: 'What is the PWM carrier switching frequency (e.g., 10kHz, 20kHz)?',
      recommendedDefault: '10000Hz',
      rationale: 'Carrier frequency determines output harmonics and LC filter component sizing.',
      options: ['5000Hz', '10000Hz', '16000Hz', '20000Hz'],
      isCritical: true
    },
    {
      key: 'targetAcFrequency',
      question: 'What is the desired AC output fundamental frequency (e.g., 50Hz, 60Hz)?',
      recommendedDefault: '50Hz',
      rationale: 'AC fundamental frequency sets reference modulation frequency.',
      options: ['50Hz', '60Hz', '400Hz'],
      isCritical: true
    },
    {
      key: 'modulationIndex',
      question: 'What is the target modulation index (0 < m <= 1.0)?',
      recommendedDefault: '0.85',
      rationale: 'Modulation index determines AC output voltage magnitude without overmodulation.',
      isCritical: false
    },
    {
      key: 'loadType',
      question: 'What is the target load connected to the inverter (e.g., Resistive, RL, Induction Motor)?',
      recommendedDefault: 'Balanced 3-Phase Resistive Load (10 Ohm)',
      rationale: 'Load impedance determines phase currents and power rating.',
      isCritical: false
    }
  ],
  defaultAssumptions: [
    {
      key: 'modulationIndex',
      value: 0.85,
      rationale: 'Standard linear SPWM operation avoiding pulse-dropping and overmodulation harmonics'
    },
    {
      key: 'filterInductance',
      value: '2.5mH',
      rationale: 'Standard switching frequency attenuation'
    },
    {
      key: 'filterCapacitance',
      value: '10uF',
      rationale: 'High-frequency ripple bypass'
    },
    {
      key: 'loadResistance',
      value: '10 Ohm',
      rationale: 'Nominal benchmark load impedance'
    }
  ],
  recommendedRoles: [
    {
      role: 'DC_SOURCE',
      preferredBlockId: 'DC_VOLTAGE_SOURCE',
      category: 'Sources',
      domain: 'xbridges',
      rationale: 'Provides constant DC bus voltage for inverter bridge input'
    },
    {
      role: 'MODULATION_SINE',
      preferredBlockId: 'WAVEFORM_GENERATOR',
      category: 'Generators',
      domain: 'xbridges',
      rationale: 'Produces 3-phase sinusoidal modulation references'
    },
    {
      role: 'PWM_GENERATOR',
      preferredBlockId: 'THREE_PHASE_PWM',
      category: 'Modulators',
      domain: 'xbridges',
      rationale: 'Generates gate signals from modulating waveform and carrier'
    },
    {
      role: 'INVERTER_BRIDGE',
      preferredBlockId: 'THREE_PHASE_INVERTER',
      category: 'Power Converters',
      domain: 'xbridges',
      rationale: '6-switch inverter bridge converting DC bus into 3-phase AC voltage'
    },
    {
      role: 'OUTPUT_FILTER',
      preferredBlockId: 'LC_FILTER',
      category: 'Filters',
      domain: 'xbridges',
      rationale: 'Suppresses carrier switching ripple'
    },
    {
      role: 'LOAD',
      preferredBlockId: 'RESISTIVE_LOAD',
      category: 'Loads',
      domain: 'xbridges',
      rationale: 'Receives filtered 3-phase sinusoidal AC power'
    }
  ],
  validationCriteria: [
    {
      id: 'crit_thd',
      description: 'Total Harmonic Distortion under 5%',
      metric: 'THD',
      operator: '<=',
      targetValue: 0.05,
      unit: 'ratio'
    },
    {
      id: 'crit_freq',
      description: 'Fundamental frequency matches target within 1%',
      metric: 'FREQUENCY',
      operator: '==',
      targetValue: 50,
      unit: 'Hz'
    },
    {
      id: 'crit_continuity',
      description: 'All 3 phases active without open circuit or DC saturation',
      metric: 'PHASE_BALANCE',
      operator: '==',
      targetValue: true
    }
  ]
};

export const AIR_FRYER_TEMPLATE: EngineeringSystemTemplate = {
  id: 'air_fryer',
  name: 'Air Fryer Control System',
  targetDomain: 'xbridges',
  triggerKeywords: ['air fryer', 'airfryer', 'fryer', 'cooking appliance', 'oven temperature'],
  description: 'Closed-loop air fryer thermal regulation and heating element control',
  requiredQuestions: [
    {
      key: 'targetTemperature',
      question: 'What is the target operating temperature for the air fryer (e.g., 180°C - 200°C)?',
      recommendedDefault: '200°C',
      rationale: 'A target temperature is required to size heating elements and model thermal transfer.',
      isCritical: true
    },
    {
      key: 'powerRating',
      question: 'What is the maximum electrical power rating for the heating element (e.g., 1500W, 1800W)?',
      recommendedDefault: '1800W',
      rationale: 'Heating wattage defines the electrical load and heating ramp rate.',
      isCritical: true
    },
    {
      key: 'supplyVoltage',
      question: 'What is the mains supply voltage (e.g., 230V AC or 120V AC)?',
      recommendedDefault: '230V AC',
      rationale: 'Supply voltage determines electrical stage isolation and component voltage ratings.',
      isCritical: true
    },
    {
      key: 'temperatureSensor',
      question: 'What temperature sensor should be used for chamber sensing (e.g., NTC 100k, PT100 RTD)?',
      recommendedDefault: 'NTC 100k thermistor',
      rationale: 'Sensor characteristics determine ADC signal conditioning and sensing latency.',
      isCritical: true
    },
    {
      key: 'controlMethod',
      question: 'What control algorithm should regulate temperature (e.g., PID, Hysteresis / Bang-bang)?',
      recommendedDefault: 'PID temperature control',
      rationale: 'Control strategy dictates firmware code generation and closed-loop stability.',
      isCritical: true
    },
    {
      key: 'safetyMaxTemperature',
      question: 'What is the absolute maximum safety cutoff temperature (e.g., 240°C)?',
      recommendedDefault: '240°C',
      rationale: 'Mandatory thermal fuse / safety cutoff prevents thermal runaway.',
      isCritical: true
    },
    {
      key: 'successCriteria',
      question: 'What are the verification success criteria (e.g., heat up in < 4 min, overshoot < 5°C)?',
      recommendedDefault: 'Rise time to target < 4 min with overshoot < 5°C',
      rationale: 'Quantifiable criteria are required for automated simulation pass/fail reporting.',
      isCritical: true
    }
  ],
  defaultAssumptions: [],
  recommendedRoles: [
    { role: 'HEATER', preferredBlockId: 'AIR_FRYER_LEARNING_MODEL', category: 'Thermal', domain: 'xbridges', rationale: 'Simulates chamber thermal physics' },
    { role: 'CONTROLLER', preferredBlockId: 'PID_CONTROLLER', category: 'Controls', domain: 'xbridges', rationale: 'Closed-loop PID controller' }
  ],
  validationCriteria: [
    { id: 'crit_overshoot', description: 'Overshoot < 5%', metric: 'OVERSHOOT', operator: '<=', targetValue: 0.05 }
  ]
};


const REGISTERED_TEMPLATES: EngineeringSystemTemplate[] = [
  THREE_PHASE_INVERTER_TEMPLATE,
  AIR_FRYER_TEMPLATE
];

export function findTemplateForIntent(promptOrTargetSystem: string): EngineeringSystemTemplate | undefined {
  if (!promptOrTargetSystem) return undefined;
  const lower = promptOrTargetSystem.toLowerCase();

  for (const tmpl of REGISTERED_TEMPLATES) {
    if (tmpl.triggerKeywords.some(kw => lower.includes(kw))) {
      return tmpl;
    }
  }

  return undefined;
}

export function getAllRegisteredTemplates(): readonly EngineeringSystemTemplate[] {
  return REGISTERED_TEMPLATES;
}
