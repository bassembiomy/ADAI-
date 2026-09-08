import type { ReportDocument } from '../reportDocumentModel';

export interface MotorDriveReportOptions {
  motorType?: string;
  targetRpm?: number;
  bladeType?: string;
}

export function createMotorDriveTestReport(options: MotorDriveReportOptions = {}): ReportDocument {
  const motorType = options.motorType || 'BLDC/PMSM Ceiling-Fan Motor';
  const targetRpm = options.targetRpm || 280;

  return {
    header: {
      systemTitle: motorType,
      documentTitle: 'Test and Fault-Isolation Procedure',
      subtitle: options.bladeType || 'Plastic Blade vs. Metal Blade Performance',
      primaryObjective: 'Determine whether the speed limitation is caused by plastic-blade aerodynamic load, insufficient continuous motor torque, inverter saturation, FOC implementation, measurement error, or CFD/model mismatch.',
      status: 'Test-ready draft',
      safetyClassification: 'Rotating machinery - guarded testing required',
      runningHeader: 'BLDC/PMSM Fan Drive - Verification Procedure',
    },
    safetyGate: {
      title: '1. Test Logic and Safety Gate',
      description: 'The tests shall be performed in sequence. Current, voltage, speed, or field-weakening limits shall not be increased until sensor scaling, electrical angle, current tracking, voltage utilization, thermal capability, and blade mechanical-speed limits have been verified.',
      stopTestRule: 'Stop immediately for abnormal vibration, blade deformation, fastener movement, overspeed, overcurrent, DC-bus collapse, controller fault, or any motor/inverter temperature above the approved limit.',
      rootCauses: [
        'Higher aerodynamic torque from the plastic blades.',
        'Motor continuous torque below the torque required at target speed.',
        'Current, torque, power, thermal, or speed limiting in the controller.',
        'Inverter voltage saturation or DC-bus limitation.',
        'Incorrect current scaling, speed scaling, pole-pair count, or electrical-angle alignment.',
        'Incorrect motor parameters or current-loop/speed-loop tuning.',
        'Incorrect electromagnetic torque estimate or CFD load prediction.',
      ],
    },
    requiredDataAndSignals: {
      requiredEquipment: [
        'Calibrated tachometer; isolated oscilloscope probes; calibrated phase-current measurement; DC-bus voltage/current measurement.',
        'Motor and inverter temperature sensors; vibration measurement; synchronized MATLAB/Simulink signal logging.',
        'Calibrated torque transducer or dynamometer for the independent torque test.',
        'Mechanical containment, guarding, emergency stop, and approved blade mounting hardware.',
      ],
      requiredPreconditions: [
        'Motor type, pole pairs, rated current definition, continuous/peak current, allowed peak duration, rated voltage/speed/torque.',
        'Rs, Ld, Lq, flux linkage or Ke/Kt, maximum winding temperature, and maximum mechanical speed.',
        'Inverter current rating, DC-bus range, MOSFET/PCB temperature limits, PWM frequency, and sampling times.',
        'Clarke/Park scaling convention, current/torque/power limit values, and approved blade-speed limits.',
      ],
      signalsTable: [
        { signalGroup: 'Speed', signalsToLog: 'Commanded mechanical speed, controller speed, tachometer speed, speed error' },
        { signalGroup: 'Current', signalsToLog: 'Id*, Id, Iq*, Iq, Ia, Ib, Ic, current-limit and saturation flags' },
        { signalGroup: 'Voltage', signalsToLog: 'Vd*, Vq*, sqrt(Vd*^2 + Vq*^2), Vdc, modulation index or PWM duty' },
        { signalGroup: 'Control', signalsToLog: 'Speed PI P term, I term, total output, anti-windup state, active limiter' },
        { signalGroup: 'Power and condition', signalsToLog: 'Idc, DC input power, torque, temperatures, vibration, fault status' },
      ],
      currentRatingRule: 'Do not compare the motor nameplate current directly with Iq until RMS/peak definitions and Clarke/Park scaling are converted to the same convention.',
    },
    testProcedures: [
      {
        id: 'T01',
        badgeLabel: 'T01',
        title: 'Sensor Offset and Scaling Verification',
        purpose: 'Verify current, voltage, phase order, pole-pair count, and speed feedback before performance testing.',
        procedure: [
          'Disable PWM and confirm zero physical phase current.',
          'Log raw current channels for at least 5 seconds and calculate zero offsets.',
          'Apply a known current or compare every channel with a calibrated current probe.',
          'Run at safe low speed and compare controller speed with a calibrated tachometer.',
          'Verify phase sequence, current polarity, pole-pair count, and that Ia + Ib + Ic is approximately zero.',
        ],
        record: ['Raw/offset-corrected currents, calibrated reference current, speed signals, phase order.'],
        acceptanceCriteria: [
          'Current gain and offset meet the sensor calibration specification.',
          'Controller speed agrees with tachometer within +/-2% or the approved project tolerance.',
          'No unexplained current exists with PWM disabled.',
        ],
        decisionRule: 'Any failure invalidates later torque and limit conclusions. Correct sensing or scaling before continuing.',
      },
      {
        id: 'T02',
        badgeLabel: 'T02',
        title: 'No-Load Speed Capability',
        purpose: 'Determine whether the motor and inverter can reach target speed without blade load.',
        procedure: [
          'Remove all blades and confirm rotor balance and guarding.',
          'Apply production current, voltage, thermal, and acceleration limits.',
          `Command 100, 150, 180, 200, 220, 250, and ${targetRpm} RPM sequentially.`,
          'Hold each point until steady state and record all required signals.',
          'Stop for any limit, fault, abnormal noise, or vibration.',
        ],
        record: ['Speed reference/feedback, tachometer, Id/Iq references and feedback, Vd/Vq, Vdc, modulation, limits, temperatures.'],
        acceptanceCriteria: [
          `${targetRpm} RPM is reached without unintended controller limiting.`,
          'Speed agrees with tachometer and Id remains near Id*.',
          'No abnormal voltage/current saturation, heat, or vibration occurs.',
        ],
        decisionRule: `If ${targetRpm} RPM is reached easily, there is no fixed software speed limit below target. If not, investigate sensing, inverter voltage, motor parameters, and control.`,
      },
      {
        id: 'T03',
        badgeLabel: 'T03',
        title: 'No-Load Loss Characterization',
        purpose: 'Estimate speed-dependent mechanical and electromagnetic losses for later CFD comparison.',
        procedure: [
          'Use stabilized T02 data at every speed.',
          'Calculate electromagnetic torque using verified PMSM model: Te = 1.5 p [lambda_m Iq + (Ld - Lq) Id Iq].',
          'At steady-state no-load, initially set Tloss(omega) approximately equal to Te(omega).',
          'Fit Tloss = Tc + B omega + Kw omega^2 and report coefficients and fit error.',
        ],
        record: ['Te, speed, Id, Iq, fitted loss torque, model residuals.'],
        acceptanceCriteria: [
          'Torque equation, current convention, and parameter sources are documented.',
          'A constant loss is used only if data show it is valid over the test range.',
        ],
        decisionRule: 'Nonphysical loss behavior indicates incorrect scaling, Kt/flux, electrical angle, or torque calculation.',
      },
      {
        id: 'T04',
        badgeLabel: 'T04',
        title: 'Metal/Plastic Blade A-B Comparison',
        purpose: 'Determine whether the plastic blades impose higher aerodynamic load under controlled conditions.',
        procedure: [
          'Start from the defined motor/inverter temperature.',
          'Install metal blades and test 100, 150, 180, 200, and 220 RPM.',
          'Hold each point to steady state and log all signals.',
          'Cool to same starting range, install plastic blades, and repeat without changing controller settings.',
          'At equal speed calculate Tblade_est = Te - Tloss(omega) and compare Iq and DC input power.',
        ],
        record: ['Repeat runs, Iq, estimated blade torque, DC power, airflow if available, temperatures, vibration.'],
        acceptanceCriteria: [
          'At least three repeat measurements at critical points.',
          'All comparison variables and ambient/test conditions are controlled and documented.',
        ],
        decisionRule: 'Consistently higher Iq, shaft power, or blade torque for plastic at equal speed confirms higher plastic-blade load.',
      },
      {
        id: 'T05',
        badgeLabel: 'T05',
        title: 'Current-Loop Tracking',
        purpose: 'Determine whether the current controller produces the commanded torque current.',
        procedure: [
          'With plastic blades, increase speed to the point where speed no longer tracks.',
          'Record Id*, Id, Iq*, Iq, current limits, and saturation flags.',
          'Calculate Iq tracking error at each steady point.',
          'Repeat below and near the limiting point.',
        ],
        record: ['Id/Iq references and feedback, ripple, active current/torque limits, voltage utilization.'],
        acceptanceCriteria: [
          'Iq and Id track their references within approved tolerance; +/-5% may be used initially.',
          'Current ripple remains within motor/inverter requirements.',
        ],
        decisionRule: 'Iq* at limit with Iq tracking means torque/current limited. Iq not tracking with voltage margin means current-loop, parameter, or sensing error.',
      },
      {
        id: 'T06',
        badgeLabel: 'T06',
        title: 'Voltage-Saturation and DC-Bus Test',
        purpose: 'Determine whether the inverter has sufficient voltage to regulate current at target speed/load.',
        procedure: [
          'Increase plastic-blade speed gradually toward the limiting point.',
          'Calculate Vs* = sqrt(Vd*^2 + Vq*^2).',
          'Determine exact inverter voltage limit from modulation implementation; for ideal SVPWM use Vmax approx Vdc/sqrt(3).',
          'Calculate voltage utilization Uv = Vs*/Vmax.',
          'Correlate Uv, DC-bus droop, current tracking error, and modulation saturation.',
        ],
        record: ['Vd/Vq, Vs*, Vdc, Idc, modulation index/PWM, current tracking.'],
        acceptanceCriteria: [
          'Required operating point retains the approved voltage margin.',
          'No excessive DC-bus collapse; current tracking remains acceptable.',
        ],
        decisionRule: 'Uv near 1 with poor current tracking means voltage limited. Voltage margin with Iq at limit means current/torque limited.',
      },
      {
        id: 'T07',
        badgeLabel: 'T07',
        title: 'Speed Controller and Limiter Verification',
        purpose: 'Identify any software limiter that prevents additional torque demand.',
        procedure: [
          'Increase plastic-blade speed command gradually.',
          'Log speed PI P term, I term, total output, saturation, and anti-windup state.',
          'Log torque, Iq, DC-current, power, thermal, stall, and lock limits.',
          'Identify the first limiter that becomes active.',
          'Reduce command and verify smooth recovery without windup overshoot.',
        ],
        record: ['Speed error, controller terms, output command, all limit flags and limit values.'],
        acceptanceCriteria: [
          'Configured limits match approved ratings.',
          'Active limiter is unambiguously identified and anti-windup functions correctly.',
        ],
        decisionRule: 'A clamped PI output identifies a configured limit, not automatically poor PI tuning. Rating and thermal validation are required before any increase.',
      },
      {
        id: 'T08',
        badgeLabel: 'T08',
        title: 'Electrical Angle and Id Verification',
        purpose: 'Verify rotor-flux alignment and torque per ampere.',
        procedure: [
          'Confirm pole pairs, phase sequence, and sensor channel assignment.',
          'Execute the approved Hall/encoder/observer alignment procedure.',
          'At low load and loaded points, log angle, Id, Iq, input power, and phase balance.',
          'If permitted, sweep angle offset over a narrow safe range.',
          'Select calibrated offset that minimizes |Id| for Id*=0 and input power at fixed speed/load.',
        ],
        record: ['Electrical angle/offset, Id/Iq, phase currents, DC power, vibration.'],
        acceptanceCriteria: [
          'Id remains close to Id*; phase currents are balanced.',
          'Calibration provides consistent torque per ampere without abnormal current.',
        ],
        decisionRule: 'Persistent nonzero Id or poor torque per ampere indicates angle, phase-order, pole-pair, or transform-sign error.',
      },
      {
        id: 'T09',
        badgeLabel: 'T09',
        title: 'Independent Shaft-Torque Verification',
        purpose: 'Separate FOC torque-estimation error from CFD prediction error.',
        procedure: [
          'Calibrate and zero a torque transducer/dynamometer.',
          'Measure metal- and plastic-blade torque at identical safe speeds.',
          'Calculate Te, Te - Tloss, and CFD torque at every point.',
          'Calculate deviations relative to measured shaft torque and include measurement uncertainty.',
        ],
        record: ['Measured shaft torque, FOC torque, loss-corrected torque, CFD torque, uncertainty.'],
        acceptanceCriteria: [
          'Torque sensor calibration is traceable.',
          'Operating points and reference denominator are explicitly stated.',
        ],
        decisionRule: 'Measured torque matching CFD points to FOC/scaling error; matching FOC points to CFD/geometry error; matching neither requires recalibration and model review.',
      },
      {
        id: 'T10',
        badgeLabel: 'T10',
        title: 'Power and Efficiency Balance',
        purpose: 'Verify electrical input, shaft output, and system loss consistency.',
        procedure: [
          'Calculate Pdc = Vdc Idc.',
          'Calculate Pshaft = Tshaft (2 pi N/60).',
          'Calculate efficiency eta = Pshaft/Pdc.',
          'Repeat at identical metal/plastic speeds and compare power increase.',
        ],
        record: ['Vdc, Idc, torque, speed, Pdc, Pshaft, efficiency.'],
        acceptanceCriteria: [
          'Power balance is physically reasonable and repeatable.',
          'Efficiency remains between 0% and 100% after uncertainty is considered.',
        ],
        decisionRule: 'High input power with low shaft power indicates loss, electrical-angle, waveform, or measurement problems.',
      },
      {
        id: 'T11',
        badgeLabel: 'T11',
        title: 'Thermal Continuous-Operation Test',
        purpose: 'Verify continuous, not merely short-duration, capability at the required operating point.',
        procedure: [
          'Perform only after T01-T10 pass.',
          'Run at required or highest approved safe speed.',
          'Log temperature, current, voltage, speed, power, and vibration until thermal steady state or approved duration.',
          'Stop at any approved limit and inspect blades, hub, fasteners, motor, and inverter afterward.',
        ],
        record: ['Temperature trends, speed/current drift, power, vibration, inspection result.'],
        acceptanceCriteria: [
          'All temperatures remain below continuous ratings with design margin.',
          'No progressive current rise, deformation, looseness, or abnormal vibration occurs.',
        ],
        decisionRule: 'A speed achieved briefly but not thermally sustained requires lower load/current, better cooling, or a higher continuous-torque drive.',
      },
    ],
    decisionMatrix: {
      title: '4. Fault-Isolation Decision Matrix',
      rows: [
        {
          observedResult: `Cannot reach ${targetRpm} RPM without blades`,
          probableCause: 'Feedback, voltage, motor parameter, or inverter-control fault',
          confirmWith: 'T01, T02, T06, T08',
          requiredAction: 'Correct sensing, parameters, angle, or voltage limitation.',
        },
        {
          observedResult: 'Reaches target with metal but not plastic',
          probableCause: 'Plastic blade has higher aerodynamic load',
          confirmWith: 'T04, T09',
          requiredAction: 'Review blade geometry/deformation; verify motor sizing.',
        },
        {
          observedResult: 'Plastic requires higher Iq at equal speed',
          probableCause: 'Higher plastic-blade torque demand',
          confirmWith: 'T04, T09',
          requiredAction: 'Validate CFD; redesign blade or use more torque.',
        },
        {
          observedResult: 'Iq* at maximum and Iq tracks it',
          probableCause: 'Current/torque limit reached',
          confirmWith: 'T05, T07, T11',
          requiredAction: 'Verify rating and thermal margin; do not raise blindly.',
        },
        {
          observedResult: 'Iq* exceeds Iq; modulation saturated',
          probableCause: 'Insufficient available voltage',
          confirmWith: 'T05, T06',
          requiredAction: 'Review Vdc, Ke, PWM utilization, and speed range.',
        },
        {
          observedResult: 'Iq* exceeds Iq; voltage margin exists',
          probableCause: 'Current loop, sensing, or motor parameters',
          confirmWith: 'T01, T05',
          requiredAction: 'Calibrate and retune current loop.',
        },
        {
          observedResult: 'Id nonzero when Id*=0',
          probableCause: 'Angle, phase order, pole pairs, or transforms',
          confirmWith: 'T08',
          requiredAction: 'Recalibrate electrical angle and phase configuration.',
        },
        {
          observedResult: 'Speed PI saturated at torque/Iq limit',
          probableCause: 'Load requires more permitted torque',
          confirmWith: 'T07',
          requiredAction: 'Validate limit; resize motor or reduce blade load.',
        },
        {
          observedResult: 'PWM maximum and Vdc drops',
          probableCause: 'Supply/DC-bus limitation',
          confirmWith: 'T06',
          requiredAction: 'Verify supply, wiring, capacitor bank, and bus rating.',
        },
        {
          observedResult: 'Measured torque matches CFD, not FOC',
          probableCause: 'FOC torque-estimation error',
          confirmWith: 'T09',
          requiredAction: 'Correct current scaling, motor parameters, equation.',
        },
      ],
    },
    finalDecisionCriteria: {
      title: '5. Final Engineering Decision Criteria',
      classifications: [
        {
          title: 'Classify the inverter model or FOC implementation as the primary cause only when testing demonstrates one or more of the following:',
          criteria: [
            'Incorrect current/speed scaling, pole-pair count, phase assignment, or electrical angle.',
            'Poor Id/Iq tracking while adequate inverter voltage is available.',
            'Incorrect current-loop or speed-loop tuning, motor parameters, PWM implementation, or unintended limiter behavior.',
          ],
        },
        {
          title: 'Classify the motor/blade load selection as the primary cause when all of the following are true:',
          criteria: [
            'Measurements and angle alignment are verified; Id and Iq correctly track their references.',
            'Voltage control remains valid, but the approved continuous current/torque limit is reached.',
            'The plastic blade requires greater measured torque than the metal blade at equal speed.',
            'The target speed cannot be maintained within continuous current and temperature ratings.',
          ],
        },
      ],
      releaseCondition: 'Do not authorize higher current, higher DC-bus voltage, overspeed, or field weakening until electrical scaling, voltage utilization, electrical angle, continuous thermal capability, and blade mechanical integrity are formally verified.',
    },
    consistency: {
      revision: 'rev_motordrive_verified',
      removedRelationshipIds: [],
      removedConnectorIds: [],
      errors: [],
    },
  };
}

