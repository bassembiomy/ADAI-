/**
 * Requirements of MR_PLD_A5414465340.adia.
 *
 * TOP: the twelve `requirement def`s of package Requirements (REQ-PWR-01 .. REQ-ADC-12), contained by
 * `mrPldSpecification`; their text is read from the .sysml doc comments by the build script.
 * SUPPLEMENTARY: specification statements the source states as part / state docs and pin data but not as a
 * requirement def (engine brake, memory map, pin-out, variants, BOM identification).
 * DERIVED: one or more requirements per block, each «deriveReqt» from a TOP / SUPPLEMENTARY requirement and
 * «satisfy»-ed by the block whose doc, attributes or pins state it. Every value comes from the .sysml model,
 * mrpld_data.py or the review report; TBV marks reverse-engineering hypotheses.
 */

export interface DerivedRequirement {
  id: string;
  name: string;
  text: string;
  /** «deriveReqt» source (a TOP or SUPPLEMENTARY requirementId). */
  from: string;
  /** Blocks (definition ids) that «satisfy» it. */
  satisfiedBy: string[];
  risk?: 'low' | 'medium' | 'high' | 'critical';
}

/** Source comments of package Traceability: the part that realises each top requirement. */
export const TOP_SATISFIED_BY: Record<string, string[]> = {
  'REQ-PWR-01': ['blk_MR_PLD_ECU', 'blk_PowerSupplyAndComms', 'blk_TLE4275'],
  'REQ-SYNC-02': ['blk_MR_PLD_ECU', 'blk_SensorAFE', 'blk_LM2903D'],
  'REQ-INJ-03': ['blk_MR_PLD_ECU', 'blk_InjectionPowerStage'],
  'REQ-INJ-04': ['blk_MR_PLD_ECU', 'blk_InjectionPowerStage', 'blk_LM2901D'],
  'REQ-SAF-05': ['blk_MR_PLD_ECU', 'blk_SAK_C167CS_LM'],
  'REQ-SEC-06': ['blk_MR_PLD_ECU', 'blk_M93C86'],
  'REQ-DIAG-07': ['blk_MR_PLD_ECU', 'blk_SensorAFE'],
  'REQ-THM-08': ['blk_MR_PLD_ECU', 'blk_ValveAndStarterDrivers'],
  'REQ-LIMP-09': ['blk_MR_PLD_ECU', 'blk_SAK_C167CS_LM'],
  'REQ-FIRE-10': ['blk_MR_PLD_ECU', 'blk_SAK_C167CS_LM', 'blk_OM501LA_EngineSystem'],
  'REQ-COM-11': ['blk_MR_PLD_ECU', 'blk_PowerSupplyAndComms', 'blk_CanTransceiver'],
  'REQ-ADC-12': ['blk_MR_PLD_ECU', 'blk_SAK_C167CS_LM'],
};

export const SUPPLEMENTARY: Array<{ id: string; name: string; text: string; satisfiedBy: string[] }> = [
  { id: 'REQ-BRK-13', name: 'EngineBrake', satisfiedBy: ['blk_MR_PLD_ECU', 'blk_ValveAndStarterDrivers'],
    text: 'With pedal 0 % and an engine-brake request from FR the ECU shall energise PV1 (constant throttle, X2-51) and PV2 (exhaust-brake flap, X2-50) and cut injection; on release it shall de-energise both and resume injection (ST_ENGINE_BRAKE).' },
  { id: 'REQ-MEM-14', name: 'ProgramAndDataMemory', satisfiedBy: ['blk_ComputeCore'],
    text: 'Program and calibration shall reside in a 512 KB bottom-boot flash mapped 0x00000-0x03FFF boot, 0x04000-0x5FFFF code, 0x60000-0x7FEFF data set, 0x7FF00-0x7FFFF checksums; pairing and adaptation data in a 2 KB Microwire EEPROM.' },
  { id: 'REQ-CON-15', name: 'ConnectorPinout', satisfiedBy: ['blk_MR_PLD_ECU', 'blk_OM501LA_EngineSystem'],
    text: 'The ECU shall interface the vehicle through X1 (16-pin cab connector, 2 x 8) and the engine through X2 (55-pin engine connector, 18 + 19 + 18) with the pin functions and test values of the X1_CabConnector16 / X2_EngineConnector55 port definitions.' },
  { id: 'REQ-VAR-16', name: 'EngineVariants', satisfiedBy: ['blk_EngineConfiguration', 'blk_MR_PLD_ECU'],
    text: 'The same ECU hardware shall serve OM 501 LA V6 and OM 502 LA V8: 8 low-side drivers populated, cylinder 7 / 8 outputs (X2-46 / X2-37) wired on V8 only.' },
  { id: 'REQ-BOM-17', name: 'ComponentIdentification', satisfiedBy: ['blk_ElectronicComponent'],
    text: 'Every electronic component shall be identified by reference designator, part number and package type (43 BOM groups, TEMIC PCB 287699.01 B).' },
  { id: 'REQ-AFT-18', name: 'AfterRunAndPowerLatch', satisfiedBy: ['blk_MR_PLD_ECU', 'blk_PowerSupplyAndComms'],
    text: 'After KL.15 off or the engine-block stop button the ECU shall keep its power latch, store DTCs and adaptation values in the EEPROM and only then release the latch and return to standby (ST_AFTERRUN).' },
];

const ECU = 'blk_MR_PLD_ECU';
export const DERIVED: DerivedRequirement[] = [
  // ---- power supply
  { id: 'REQ-PWR-01.1', name: 'BatterySupplyKL30', from: 'REQ-PWR-01', satisfiedBy: ['blk_Battery24V'],
    text: 'The vehicle battery shall supply KL.30 +24 V (24..28 V) on X1-5 (fuse F1) and X1-6 (fuse F2) and KL.31 ground on X1-9 and X1-11.' },
  { id: 'REQ-PWR-01.2', name: 'ReferenceRegulator', from: 'REQ-PWR-01', satisfiedBy: ['blk_TLE4275'],
    text: 'The TLE4275 LDO shall deliver 5.00 V +-2 % (4.90..5.10 V), up to 450 mA, with reset output, enabled by the KL.15 wake-up.' },
  { id: 'REQ-PWR-01.3', name: 'SupplyFiltering', from: 'REQ-PWR-01', satisfiedBy: ['blk_EmiChoke'],
    text: 'The KL.30 input shall be filtered by the S+M 882590 EMI choke (L_FILT1) before the regulator.' },
  { id: 'REQ-PWR-01.4', name: 'SensorSupply5V', from: 'REQ-PWR-01', satisfiedBy: [ECU, 'blk_RatiometricPressureSensor'],
    text: 'The ECU shall supply the ratiometric sensors B110 (X2-6) and B111-P (X2-7) with 5.00 V +-2 % from the reference rail.' },
  { id: 'REQ-PWR-01.5', name: 'PowerSupplyAndCommsUnit', from: 'REQ-PWR-01', satisfiedBy: ['blk_PowerSupplyAndComms'],
    text: 'The power-supply and communication subsystem shall group regulator U16, choke L_FILT1, two CAN transceivers and the K-line transceiver U15.' },
  // ---- synchronisation
  { id: 'REQ-SYNC-02.1', name: 'VrZeroCrossing', from: 'REQ-SYNC-02', satisfiedBy: ['blk_LM2903D'],
    text: 'The LM2903D comparators shall square the VR signals: CKP valid from 1.2 Vpp at cranking up to ~25 Vpp, CMP from 0.9 Vpp.' },
  { id: 'REQ-SYNC-02.2', name: 'CrankCamPattern', from: 'REQ-SYNC-02', satisfiedBy: ['blk_VRSensor'],
    text: 'B15 (crank, 36 slots + reference, X2-19 / X2-2) and B16 (cam, 12 + 1 teeth, X2-20 / X2-1) shall be inductive VR sensors of 1050..1350 Ohm; f_CKP = 0.6 n, f_CMP = 0.1 n.' },
  { id: 'REQ-SYNC-02.3', name: 'CapcomSynchronisation', from: 'REQ-SYNC-02', satisfiedBy: ['blk_SAK_C167CS_LM'],
    text: 'The C167 CAPCOM (CC0 / CC1) shall synchronise on the CKP reference slot and the CMP sync tooth and keep injecting on either one alone (SyncMode BOTH / CMP_ONLY / CKP_ONLY / NONE).' },
  { id: 'REQ-SYNC-02.4', name: 'SensorFrontEnd', from: 'REQ-SYNC-02', satisfiedBy: ['blk_SensorAFE'],
    text: 'The analogue front-end shall contain 2 VR comparators, 2 ratiometric buffers, 4 NTC pull-up networks and the on-board baro sensor.' },
  // ---- injection
  { id: 'REQ-INJ-03.1', name: 'GateSequencing', from: 'REQ-INJ-03', satisfiedBy: ['blk_PLD_C1_1'],
    text: 'The PLD_C1.1 CPLD (U3) shall sequence bank high-side and cylinder low-side gates from the CAPCOM start-of-injection trigger and run the peak / BIP / hold / spill micro-cycle.' },
  { id: 'REQ-INJ-03.2', name: 'BankHighSide', from: 'REQ-INJ-03', satisfiedBy: ['blk_BUZ102SL'],
    text: 'The BUZ102SL high-side MOSFETs (D2PAK) shall switch the bank commons X2-16 (cyl 1-3, Q_HS1) and X2-9 (cyl 4-6, Q_HS2), the valve supply (Q_HS3), starter (Q_HS4) and aux (Q_HS5).' },
  { id: 'REQ-INJ-03.3', name: 'CylinderLowSide', from: 'REQ-INJ-03', satisfiedBy: ['blk_SUD25N06_45L'],
    text: 'Eight SUD25N06-45L low-side MOSFETs shall switch the unit-pump coils: Q_LS1..3 cyl 1-3 (X2-54 / 53 / 47), Q_LS5..7 cyl 4-6 (X2-45 / 44 / 38), Q_LS4 / Q_LS8 cyl 7 / 8 (V8 only).' },
  { id: 'REQ-INJ-03.4', name: 'CurrentShunt', from: 'REQ-INJ-03', satisfiedBy: ['blk_DaleShunt'],
    text: 'Each bank shall measure coil current on a Vishay DALE R033F 0.033 Ohm 1 % shunt: 16 A -> 528 mV, 8 A -> 264 mV, 25 A -> 825 mV.' },
  { id: 'REQ-INJ-03.5', name: 'FastDeEnergise', from: 'REQ-INJ-03', satisfiedBy: ['blk_FreewheelNetwork'],
    text: 'At end of injection the freewheel / zener network (SMB + 0805) shall de-energise the coil fast so the valve opens and spills.' },
  { id: 'REQ-INJ-03.6', name: 'UnitPumpCoil', from: 'REQ-INJ-03', satisfiedBy: ['blk_UnitPump'],
    text: 'Each PLD unit pump shall have a 0.6 Ohm solenoid (0.4..0.9 Ohm to its bank common through the harness) and 0.30..0.45 mH inductance (TBV).' },
  { id: 'REQ-INJ-03.7', name: 'InjectionPowerStageUnit', from: 'REQ-INJ-03', satisfiedBy: ['blk_InjectionPowerStage'],
    text: 'The injection power stage shall group gate CPLD U3, 2 bank high-sides, 8 low-sides, 2 shunts, 3 LM2901D comparators and 8 freewheel networks.' },
  { id: 'REQ-INJ-04.1', name: 'CurrentThresholds', from: 'REQ-INJ-04', satisfiedBy: ['blk_LM2901D'],
    text: 'The LM2901D comparators shall signal peak (16 A / 528 mV), hold (8 A / 264 mV), overcurrent (24 A / 792 mV) and open coil (< 4 A / 132 mV) to the CPLD.' },
  { id: 'REQ-INJ-04.2', name: 'CylinderCutOff', from: 'REQ-INJ-04', satisfiedBy: ['blk_PLD_C1_1'],
    text: 'On an overcurrent trip or open coil the CPLD shall disable the cylinder driver (CYL_CUTOFF) and a DTC 5Nxx shall be stored (bank 1 51xx..53xx, bank 2 54xx..56xx).' },
  // ---- smoke / fuel
  { id: 'REQ-SAF-05.1', name: 'QuantityComputation', from: 'REQ-SAF-05', satisfiedBy: ['blk_SAK_C167CS_LM'],
    text: 'The MCU shall compute q = min(22 + 1.6 pedal %, 55 + 65 (P_boost - 1)) x torqueLimit / 100 mg/stroke and SOI = 11.5 + 0.05 pedal % + cold advance deg BTDC (calibration TBV).' },
  { id: 'REQ-SAF-05.2', name: 'BoostPressureSensing', from: 'REQ-SAF-05', satisfiedBy: ['blk_RatiometricPressureSensor'],
    text: 'B111-P shall measure charge-air pressure 0.60..3.40 bar abs as 0.50..4.50 V on X2-29 (1.07 V at 1.0 bar, 4.21 V at 3.2 bar); B110 oil pressure 0..5 bar as 0.50..4.50 V on X2-32.' },
  { id: 'REQ-SAF-05.3', name: 'BarometricSensing', from: 'REQ-SAF-05', satisfiedBy: ['blk_OnboardBaroSensor'],
    text: 'The on-board MEMS baro sensor shall measure 0.50..1.15 bar abs as 0.5..4.5 V (3.66 V at 1.013 bar) for the altitude correction (TBV).' },
  // ---- immobiliser
  { id: 'REQ-SEC-06.1', name: 'PairingDataStorage', from: 'REQ-SEC-06', satisfiedBy: ['blk_M93C86'],
    text: 'The 93C86 EEPROM (U5, 16 kbit) shall hold the immobiliser pairing data, the engine number 541.922-00-063818 and device codes 1061 1047 1034 1026 (storage format TBV).' },
  { id: 'REQ-SEC-06.2', name: 'DriveAuthorisation', from: 'REQ-SEC-06', satisfiedBy: ['blk_FR_CabECU'],
    text: 'FR shall read the transponder on the cab side and send the drive-authorisation code to the MR in an ImmoReleaseFrame over IES-CAN; KL.15 / KL.50 shall reach X1-15 / X1-8.' },
  { id: 'REQ-SEC-06.3', name: 'StarterOutput', from: 'REQ-SEC-06', satisfiedBy: ['blk_ValveAndStarterDrivers', 'blk_StarterRelay'],
    text: 'The starter relay output (X2-18, parallel X1-12, max 4 A) shall be energised only in ST_CRANK_SYNC, i.e. after authorisation and below 300 rpm.' },
  { id: 'REQ-SEC-06.4', name: 'InputSupervision', from: 'REQ-SEC-06', satisfiedBy: ['blk_TEMIC_845AW'],
    text: 'The TEMIC 845AW co-processor (U4, PLCC-68) shall supervise six digital inputs (KL.15, KL.50, block start / stop) and act as watchdog of the MCU (function TBV).' },
  { id: 'REQ-SEC-06.5', name: 'EngineBlockButtons', from: 'REQ-SEC-06', satisfiedBy: [ECU],
    text: 'The engine-block start (X2-25) and stop (X2-35) buttons, bridged to X2-30, shall start only from ST_READY below 300 rpm and stop the running engine.' },
  // ---- diagnostics
  { id: 'REQ-DIAG-07.1', name: 'RatiometricBuffer', from: 'REQ-DIAG-07', satisfiedBy: ['blk_LM2904D'],
    text: 'The LM2904D op-amps shall buffer the ratiometric inputs into the ADC; valid window 0.25..4.75 V.' },
  { id: 'REQ-DIAG-07.2', name: 'NtcDividerNetwork', from: 'REQ-DIAG-07', satisfiedBy: ['blk_NtcPullUpNetwork'],
    text: 'Each NTC input shall use a 2.49 kOhm 0.1 % pull-up to VAREF with RC low-pass: 2.50 V at 20 C, 0.57 V at 80 C; valid window 0.18..4.82 V.' },
  { id: 'REQ-DIAG-07.3', name: 'NtcSensors', from: 'REQ-DIAG-07', satisfiedBy: ['blk_NTCSensor'],
    text: 'B65 coolant (X2-34), B10 fuel (X2-36), B11 oil (X2-39) and B111-T charge-air (X2-48) temperature sensors shall be NTC 2.5 kOhm at 20 C, 322 Ohm at 80 C.' },
  { id: 'REQ-DIAG-07.4', name: 'OilLevelSensor', from: 'REQ-DIAG-07', satisfiedBy: ['blk_ThermalOilLevelSensor'],
    text: 'B14 thermal oil-level sensor (X2-33 / X2-49) shall be a 18..26 Ohm hot-wire element pulsed at initialisation; DTC 2515 / 2516.' },
  { id: 'REQ-DIAG-07.5', name: 'FaultRecord', from: 'REQ-DIAG-07', satisfiedBy: ['blk_DiagnosticTester', ECU],
    text: 'Every stored fault shall carry its MR code, J1939 SPN / FMI and severity (CRITICAL, DERATE, WARNING, DRIFT) and be readable over the K-line (X1-13, ISO 14230 / KWP2000).' },
  { id: 'REQ-DIAG-07.6', name: 'SensorIdentification', from: 'REQ-DIAG-07', satisfiedBy: ['blk_EngineSensor'],
    text: 'Every engine sensor shall carry its reference designator (B15, B16, B65, B10, B11, B14, B110, B111-P, B111-T) and sensing principle.' },
  { id: 'REQ-DIAG-07.7', name: 'FaultModeClassification', from: 'REQ-DIAG-07', satisfiedBy: ['blk_SensorAFE'],
    text: 'Each sensor channel shall be classified NORMAL, OPEN, SCG, SCB or DRIFT and switch to its substitute value outside NORMAL (SensorFaultMode).' },
  // ---- thermal
  { id: 'REQ-THM-08.1', name: 'FanClutchControl', from: 'REQ-THM-08', satisfiedBy: ['blk_ValveAndStarterDrivers'],
    text: 'PV3 fan-clutch valve (X2-41 / X1-14) shall be driven by PWM from 92 C, reaching 100 % at 100 C; warning from 103 C.' },
  { id: 'REQ-THM-08.2', name: 'ProportionalValveCoil', from: 'REQ-THM-08', satisfiedBy: ['blk_ProportionalValve'],
    text: 'PV1 (X2-51), PV2 (X2-50), PV3 (X2-41) and PV4 (X2-43) proportional valves shall have 30..50 Ohm coils supplied from X2-12 / X2-52.' },
  // ---- limp home
  { id: 'REQ-LIMP-09.1', name: 'CmpOnlyTiming', from: 'REQ-LIMP-09', satisfiedBy: ['blk_SAK_C167CS_LM'],
    text: 'On CKP loss the MCU shall time injection from the CMP 12 + 1 pattern, limit speed to 1800 rpm and torque to 65 %, report the DTC 0110 / 0111 / 0112 over CAN.' },
  // ---- firing
  { id: 'REQ-FIRE-10.1', name: 'CylinderOrder', from: 'REQ-FIRE-10', satisfiedBy: ['blk_SAK_C167CS_LM', 'blk_OM501LA_EngineSystem'],
    text: 'Injection shall follow firing order 1-4-2-5-3-6 at 120 deg crank intervals: cylinders 1-3 on bank 1 (X2-16), 4-6 on bank 2 (X2-9).' },
  { id: 'REQ-FIRE-10.2', name: 'ClockReference', from: 'REQ-FIRE-10', satisfiedBy: ['blk_Crystal4MHz'],
    text: 'Two 4 MHz crystals shall clock the MCU and the co-processor for the CAPCOM crank-angle timing.' },
  // ---- communication
  { id: 'REQ-COM-11.1', name: 'CanPhysicalLayer', from: 'REQ-COM-11', satisfiedBy: ['blk_CanTransceiver'],
    text: 'The CAN transceivers (PCA82C250 / B10011S class) shall run IES-CAN at 250 kbit/s on X1-1 / X1-2 with 120 Ohm termination per node end (about 60 Ohm on the complete harness).' },
  { id: 'REQ-COM-11.2', name: 'KLineTransceiver', from: 'REQ-COM-11', satisfiedBy: ['blk_L9637D'],
    text: 'The L9637D (U15) shall connect the C167 ASC0 to the K-line X1-13 for ISO 14230 diagnostics and BSL flashing.' },
  { id: 'REQ-COM-11.3', name: 'CabTorqueRequest', from: 'REQ-COM-11', satisfiedBy: ['blk_FR_CabECU'],
    text: 'FR shall send TorqueRequestFrame (pedal %) and engine-brake requests and receive EngineDataFrame (rpm, coolant, oil pressure) and fault records over IES-CAN.' },
  { id: 'REQ-COM-11.4', name: 'WorkshopTester', from: 'REQ-COM-11', satisfiedBy: ['blk_DiagnosticTester'],
    text: 'The diagnostic tester (Star Diagnosis) shall reach the ECU over the K-line X1-13 using ISO 14230 (KWP2000).' },
  // ---- ADC
  { id: 'REQ-ADC-12.1', name: 'AdcChannels', from: 'REQ-ADC-12', satisfiedBy: ['blk_SAK_C167CS_LM'],
    text: 'The SAK-C167CS-LM (U1, MQFP-144) shall convert 24 analogue inputs with 10 bits on the 5 V reference: AN0 boost, AN1 IAT, AN2 ECT, AN3 fuel, AN4 oil P, AN5 oil T, AN6 oil level; battery via 1.8 / 11.8 divider (24 V -> 749).' },
  // ---- supplementary breakdown
  { id: 'REQ-MEM-14.1', name: 'FlashMemory', from: 'REQ-MEM-14', satisfiedBy: ['blk_AM29F400BB'],
    text: 'The AM29F400BB (U2, PSOP-44) shall provide 4 Mbit (512 KB) bottom-boot flash; BSL entry by DQ4 (pin 24) to GND via 1 kOhm at reset (TBV).' },
  { id: 'REQ-MEM-14.2', name: 'ComputeCoreUnit', from: 'REQ-MEM-14', satisfiedBy: ['blk_ComputeCore'],
    text: 'The compute core shall group MCU U1, co-processor U4, flash U2, EEPROM U5 and two 4 MHz crystals on the external bus and Microwire.' },
  { id: 'REQ-BRK-13.1', name: 'EngineBrakeValves', from: 'REQ-BRK-13', satisfiedBy: ['blk_ProportionalValve', 'blk_ValveAndStarterDrivers'],
    text: 'PV1 decompression and PV2 exhaust-brake flap shall be energised together while ST_ENGINE_BRAKE is active.' },
  { id: 'REQ-CON-15.1', name: 'SystemHarness', from: 'REQ-CON-15', satisfiedBy: ['blk_OM501LA_EngineSystem'],
    text: 'The OM 501 LA engine harness shall wire 9 sensors, 6 unit pumps, 4 proportional valves and the starter relay to X2, and battery, FR and tester to X1, as in the system IBD.' },
  { id: 'REQ-VAR-16.1', name: 'V8Outputs', from: 'REQ-VAR-16', satisfiedBy: ['blk_EngineConfiguration'],
    text: 'On OM 502 V8 the harness shall add unit pumps G (cyl 7, X2-46) and H (cyl 8, X2-37); on V6 these pins stay unused.' },
  { id: 'REQ-BOM-17.1', name: 'SubsystemDrivers', from: 'REQ-BOM-17', satisfiedBy: ['blk_ValveAndStarterDrivers'],
    text: 'The valve and starter drivers shall provide one starter relay output and four proportional-valve outputs through Q_HS3..Q_HS5.' },
  { id: 'REQ-AFT-18.1', name: 'AfterRunStorage', from: 'REQ-AFT-18', satisfiedBy: ['blk_M93C86', ECU],
    text: 'In after-run the ECU shall write the fault memory and adaptation values to the 93C86 before it releases the power latch.' },
  // ---- analysis context
  { id: 'REQ-ADC-12.2', name: 'SensorChainBinding', from: 'REQ-ADC-12', satisfiedBy: ['blk_SensorChainContext'],
    text: 'The sensor chain shall bind V_ref = 5.00 V, R_pull-up = 2490 Ohm and R_shunt = 0.033 Ohm to the NTC divider, boost transfer function and shunt-sense constraints.' },
  { id: 'REQ-SYNC-02.5', name: 'ScenarioCoverage', from: 'REQ-SYNC-02', satisfiedBy: ['blk_SimulationScenario'],
    text: 'Each simulation scenario shall state key state, pedal, coolant, boost, immobiliser, CKP, CMP, bank-1 short and CAN validity and the expected final operating state.' },
];

/** Requirements an engine-system state of the state machine satisfies (cross-domain «satisfy»). */
export const STATE_SATISFIES: Array<[string, string]> = [
  ['ST_IMMO_LOCKED', 'REQ-SEC-06'], ['ST_CRANK_SYNC', 'REQ-SEC-06.3'], ['ST_LIMP_DERATE', 'REQ-LIMP-09'],
  ['ST_LIMP_DERATE', 'REQ-THM-08'], ['ST_FAULT_SHUTDOWN', 'REQ-SYNC-02'], ['ST_ENGINE_BRAKE', 'REQ-BRK-13'],
  ['ST_AFTERRUN', 'REQ-AFT-18'], ['INJ_HOLD', 'REQ-INJ-03'], ['INJ_CYL_CUTOFF', 'REQ-INJ-04'],
  ['SYNC_CMP_ONLY', 'REQ-SYNC-02.3'], ['FAN_PWM', 'REQ-THM-08.1'], ['DIAG_SCG', 'REQ-DIAG-07.7'],
];
