import { describe, expect, it } from 'vitest';
import { XB_CAPABILITIES } from './xbCapabilities';
import { XB_EXECUTABLE_C_CASES } from './xbCConformanceCases';

/*
 * Inverter control for appliance motor drives (washing machines use PMSM/BLDC with
 * field-oriented control, or induction motors with V/f control) must generate embedded C:
 * every block below becomes `codegen: true` with paired interpreter/C99 conformance cases,
 * so the existing gates apply automatically:
 *   - xbDeclaredCConformance.test.ts: each declared case executes and the generated C matches
 *     the simulation;
 *   - xbMisraConformance.test.ts: every executable case is MISRA C:2012 clean except 15.5.
 * The semantics are those the host engine already implements for these blocks (simulation is
 * the reference). Plant models (THREE_PHASE_INVERTER, AC_INDUCTION_MOTOR, motor dynamics,
 * DC sources, loads) stay simulation-only.
 */

const INVERTER_CONTROL_BLOCKS = [
  // Modulation
  'SVPWM_MODULATOR', 'SVPWM_CORE', 'SECTOR_SELECTOR', 'SWITCHING_TIME_CALCULATOR',
  'SVPWM_GATE_GENERATOR', 'ZERO_SEQUENCE_INJECTION', 'PWM_GENERATOR', 'THREE_PHASE_PWM',
  // Current, speed and flux control (PMSM/BLDC FOC)
  'CURRENT_CONTROLLER_DQ', 'SPEED_CONTROLLER', 'FIELD_ORIENTED_CONTROL', 'FLUX_REFERENCE',
  'FIELD_WEAKENING', 'MTPA_CONTROLLER', 'VOLTAGE_REFERENCE_GENERATOR', 'ROTOR_POSITION_ESTIMATOR',
  // Induction motor V/f
  'IM_SCALAR_CONTROL', 'VF_SLIP_COMP',
];

const PLANT_BLOCKS = ['THREE_PHASE_INVERTER', 'AC_INDUCTION_MOTOR', 'DC_VOLTAGE_SOURCE', 'THREE_PHASE_LOAD'];

describe('inverter-control blocks generate embedded C', () => {
  for (const type of INVERTER_CONTROL_BLOCKS) {
    it(`${type} is embedded with paired simulation/C conformance cases`, () => {
      const capability = XB_CAPABILITIES[type];
      expect(capability, type).toBeDefined();
      expect(capability.codegen, `${type}: ${capability.reason ?? ''}`).toBe(true);
      const paired = capability.pairedConformanceCaseIds ?? [];
      const cCases = capability.cConformanceCaseIds ?? [];
      expect(paired.length + cCases.length, type).toBeGreaterThan(0);
      const executable = new Set(XB_EXECUTABLE_C_CASES.map((testCase) => testCase.id));
      for (const id of [...paired, ...cCases].filter((caseId) => caseId.includes('C99'))) {
        expect(executable.has(id), `${type}: case ${id} must be an executable C case`).toBe(true);
      }
    });
  }

  it('plant models stay simulation-only', () => {
    for (const type of PLANT_BLOCKS) {
      expect(XB_CAPABILITIES[type]?.codegen ?? false, type).toBe(false);
    }
  });
});
