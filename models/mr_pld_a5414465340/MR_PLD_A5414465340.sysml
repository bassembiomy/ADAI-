/*
 * =====================================================================================
 *  Mercedes-Benz MR-PLD  A 541 446 53 40  (TEMIC PCB 287699.01 B)  -  OM 501 LA.II/2-00 V6
 *  Reverse-Engineering MBSE Model  -  OMG SysML v2 textual notation
 * -------------------------------------------------------------------------------------
 *  Contents (one package per SysML diagram family)
 *    01 Identification ........ label data, variants
 *    02 Signals ................ items / events / enumerations exchanged in the model
 *    03 Interfaces ............. port defs, the X1 (16) / X2 (55) connectors pin by pin,
 *                                interface defs (harness links, CAN, solenoid drive)
 *    04 Requirements ........... req diagram  (REQ-PWR-01 .. REQ-ADC-12) + traceability
 *    05 HardwareStructure ...... bdd  (component blocks, ECU subsystems, engine context)
 *    06 InternalStructure ...... ibd  (ECU internals + full engine harness wiring)
 *    07 Parametrics ............ par  (transfer functions, smoke limiter, RL solenoid)
 *    08 OperationalBehavior .... stm  (ECU operating modes, injection micro-cycle),
 *                                act  (injection event, start procedure)
 *    09 Interactions ........... sd   (crank+immobilizer+peak&hold, CKP loss, immo reject)
 *    10 AnalysisAndSimulation .. analysis / verification cases, simulation scenarios
 *                                (executed by mrpld_sim.py - same constants)
 *    11 Views .................. bdd / ibd / stm / sd / req view definitions
 *
 *  Data status: values are the harmonised data set of the RE workstation after review.
 *  Items tagged "TBV" are reverse-engineering hypotheses to be verified on the bench
 *  or with Star Diagnosis for this ZGS.
 * =====================================================================================
 */
package MercedesBenz_MR_PLD_A5414465340 {
    doc /* Formal reverse-engineering MBSE model of the TEMIC MR-PLD engine controller. */

    private import ScalarValues::*;
    private import ISQ::*;
    private import SI::*;

    // =================================================================================
    package Identification {
        attribute def ECU_Label {
            doc /* Data printed on the ECU label. */
            attribute partNumber : String;
            attribute zgs : String {
                doc /* ZGS = Zeichnungs-Geometrie-Stand: drawing / hardware revision index (NOT software version). */
            }
            attribute pcbRevision : String;
            attribute engineCertification : String;
            attribute engineSerial : String;
            attribute deviceCodes : Integer[4] ordered {
                doc /* Geraetecode 1061 1047 1034 1026 = 0x0425 0x0417 0x040A 0x0402.
                 * Storage format in the 93C86 dump (binary BE/LE or BCD) is TBV. */
            }
        }
        attribute thisEcu : ECU_Label {
            :>> partNumber = "A 541 446 53 40";
            :>> zgs = "001";
            :>> pcbRevision = "TEMIC 287699.01 B";
            :>> engineCertification = "OM 501 LA.II/2-00 (V6, Euro II)";
            :>> engineSerial = "541.922-00-063818";
            :>> deviceCodes = (1061, 1047, 1034, 1026);
        }
        enum def EngineVariant {
            doc /* Same PCB populates 8 low-side drivers; cyl 7/8 outputs (X2-46/37) only wired on V8. */
            enum OM501LA_V6;
            enum OM502LA_V8;
        }
    }

    // =================================================================================
    package Signals {
        doc /* Items, events and enumerations exchanged between blocks. */

        enum def KeyState { enum OFF; enum IGN; enum CRANK; enum RUN; enum BRAKE; }
        enum def SyncMode { enum BOTH; enum CMP_ONLY; enum CKP_ONLY; enum NONE; }
        enum def Severity { enum CRITICAL; enum DERATE; enum WARNING; enum DRIFT; }
        enum def SensorFaultMode { enum NORMAL; enum OPEN; enum SCG; enum SCB; enum DRIFT; }
        enum def PinDirection { enum IN; enum OUT; enum INOUT; enum GND; enum NC; }
        enum def InjectionPhase { enum IDLE; enum PEAK; enum BIP_WAIT; enum HOLD; enum SPILL; }

        // ---- discrete events (signals) ---------------------------------------------
        item def KL15_On;
        item def KL15_Off;
        item def KL50_CrankRequest;
        item def BlockStartButton;
        item def BlockStopButton;
        item def SelfTestPassed;
        item def SyncLocked;
        item def SyncLost;
        item def CkpLost;
        item def CkpRestored;
        item def CmpLost;
        item def EngineRunning;
        item def EngineStopped;
        item def AfterrunComplete;
        item def EngineBrakeRequest;
        item def EngineBrakeRelease;
        item def OvertempDetected;
        item def OvertempCleared;
        item def BankShortDetected;
        item def CanTimeout;
        item def CanRestored;
        item def PeakCurrentReached;
        item def BipDetected;
        item def OvercurrentTrip;
        item def ImmoRejected;

        item def CanFrame {
            attribute identifier : Integer;
            attribute dlc : Integer;
        }
        item def ImmoReleaseFrame :> CanFrame {
            doc /* Drive-authorisation code sent by FR over IES-CAN (transponder read on cab side). */
            attribute authCode : Integer;
        }
        item def TorqueRequestFrame :> CanFrame { attribute pedalPct : Real; }
        item def EngineDataFrame :> CanFrame {
            attribute rpm : Real;
            attribute coolantC : Real;
            attribute oilPressureBar : Real;
        }
        item def SoiTrigger {
            attribute cylinder : Integer;
            attribute soiDegBTDC : Real;
            attribute durationDegCA : Real;
        }
        item def EoiTrigger { attribute cylinder : Integer; }
        item def VrToothPulse { attribute toothIndex : Integer; }
        item def FaultRecord {
            attribute mrCode : String;
            attribute j1939Spn : Integer;
            attribute fmi : Integer;
            attribute severity : Severity;
        }
        item def ElectricalPower;
        item def Fuel;
    }

    // =================================================================================
    package Interfaces {
        private import Signals::*;

        port def SupplyPort {
            doc /* Supply rail (24 V battery, 5 V reference, valve supply). */
            out attribute voltage : ElectricPotentialValue;
            out item power : ElectricalPower;
        }
        port def GroundPort;
        port def AnalogSignalPort {
            doc /* Sensor -> ECU analogue voltage. */
            out attribute voltage : ElectricPotentialValue;
        }
        port def VRSignalPort {
            doc /* Variable-reluctance differential signal. */
            out attribute vpp : ElectricPotentialValue;
            out attribute frequency : FrequencyValue;
            out item tooth : VrToothPulse;
        }
        port def DigitalInputPort { out attribute active : Boolean; }
        port def CanPort {
            attribute bitRate : Real = 250000.0;
            inout item canFrame : CanFrame;
        }
        port def KLinePort { attribute protocol : String = "ISO 14230 (KWP2000)"; }
        port def SolenoidDrivePort {
            doc /* ECU high-side / low-side drive of a unit-pump coil. */
            out attribute current : ElectricCurrentValue;
        }
        port def ValveDrivePort { out attribute dutyCyclePct : Real; }
        port def RelayDrivePort { out attribute energised : Boolean; }
        port def GateDrivePort {
            out attribute gateOn : Boolean;
            out item trigger : SoiTrigger;
        }
        port def CurrentSensePort { out attribute senseVoltage : ElectricPotentialValue; }
        port def MemoryBusPort { attribute widthBits : Integer; }
        port def SerialMemoryPort { attribute protocol : String = "Microwire"; }
        port def FuelPort { inout item fuel : Fuel; }

        port def ConnectorPin {
            doc /* One cavity of an ECU connector. */
            attribute pinNo : Integer;
            attribute direction : PinDirection;
            attribute signalName : String;
            attribute function : String;
            attribute testValue : String;
        }

        port def X1_CabConnector16 {
            doc /* X1 - 16-pin cab connector (2 x 8). */
            port pin_01 : ConnectorPin { :>> pinNo = 1; :>> direction = PinDirection::INOUT; :>> signalName = "CAN_H"; :>> function = "IES-CAN High to FR X4-18/3"; :>> testValue = "2.5..3.5 V; 120 Ohm to X1-2 (ECU unplugged)"; }
            port pin_02 : ConnectorPin { :>> pinNo = 2; :>> direction = PinDirection::INOUT; :>> signalName = "CAN_L"; :>> function = "IES-CAN Low to FR X4-18/4"; :>> testValue = "1.5..2.5 V; DTC 0100/0101"; }
            port pin_03 : ConnectorPin { :>> pinNo = 3; :>> direction = PinDirection::GND; :>> signalName = "HF_GND"; :>> function = "CAN shield (HF ground)"; :>> testValue = "0 V"; }
            port pin_04 : ConnectorPin { :>> pinNo = 4; :>> direction = PinDirection::GND; :>> signalName = "CAN_GND"; :>> function = "CAN reference ground (bridged to X1-3)"; :>> testValue = "0 V"; }
            port pin_05 : ConnectorPin { :>> pinNo = 5; :>> direction = PinDirection::IN; :>> signalName = "KL30_1"; :>> function = "Battery +24 V line 1 (fuse F1)"; :>> testValue = "24..28 V"; }
            port pin_06 : ConnectorPin { :>> pinNo = 6; :>> direction = PinDirection::IN; :>> signalName = "KL30_2"; :>> function = "Battery +24 V line 2 (fuse F2), parallel to X1-5"; :>> testValue = "24..28 V"; }
            port pin_07 : ConnectorPin { :>> pinNo = 7; :>> direction = PinDirection::NC; :>> signalName = "NC"; :>> function = "Reserved"; :>> testValue = "open"; }
            port pin_08 : ConnectorPin { :>> pinNo = 8; :>> direction = PinDirection::IN; :>> signalName = "KL50"; :>> function = "Crank request from ignition / FR"; :>> testValue = "+24 V while cranking"; }
            port pin_09 : ConnectorPin { :>> pinNo = 9; :>> direction = PinDirection::GND; :>> signalName = "KL31_1"; :>> function = "Main power ground 1"; :>> testValue = "0 V"; }
            port pin_10 : ConnectorPin { :>> pinNo = 10; :>> direction = PinDirection::OUT; :>> signalName = "PV_SUPPLY"; :>> function = "Proportional-valve +24 V high-side (shared X2-12)"; :>> testValue = "+24 V when active"; }
            port pin_11 : ConnectorPin { :>> pinNo = 11; :>> direction = PinDirection::GND; :>> signalName = "KL31_2"; :>> function = "Main power ground 2 (parallel X1-9)"; :>> testValue = "0 V"; }
            port pin_12 : ConnectorPin { :>> pinNo = 12; :>> direction = PinDirection::OUT; :>> signalName = "STARTER_OUT_P"; :>> function = "Starter relay output (parallel X2-18)"; :>> testValue = "+24 V while crank allowed"; }
            port pin_13 : ConnectorPin { :>> pinNo = 13; :>> direction = PinDirection::INOUT; :>> signalName = "K_LINE"; :>> function = "ISO 14230 diagnostics / BSL flashing (L9637D)"; :>> testValue = "idle ~Vbat"; }
            port pin_14 : ConnectorPin { :>> pinNo = 14; :>> direction = PinDirection::OUT; :>> signalName = "PV3_LS_P"; :>> function = "PV3 low-side PWM (shared X2-41)"; :>> testValue = "PWM"; }
            port pin_15 : ConnectorPin { :>> pinNo = 15; :>> direction = PinDirection::IN; :>> signalName = "KL15"; :>> function = "Ignition ON / wake-up"; :>> testValue = "+24 V"; }
            port pin_16 : ConnectorPin { :>> pinNo = 16; :>> direction = PinDirection::OUT; :>> signalName = "PV4_LS_P"; :>> function = "PV4 low-side PWM (shared X2-43)"; :>> testValue = "PWM"; }
        }

        port def X2_EngineConnector55 {
            doc /* X2 - 55-pin engine connector (3 rows 18 + 19 + 18). */
            port pin_01 : ConnectorPin { :>> pinNo = 1; :>> direction = PinDirection::GND; :>> signalName = "CMP_RET"; :>> function = "B16 return (-)"; :>> testValue = "1050..1350 Ohm to X2-20"; }
            port pin_02 : ConnectorPin { :>> pinNo = 2; :>> direction = PinDirection::GND; :>> signalName = "CKP_RET"; :>> function = "B15 return (-)"; :>> testValue = "1050..1350 Ohm to X2-19"; }
            port pin_03 : ConnectorPin { :>> pinNo = 3; :>> direction = PinDirection::GND; :>> signalName = "ECT_GND"; :>> function = "B65 analog ground"; :>> testValue = "0 V AGND"; }
            port pin_04 : ConnectorPin { :>> pinNo = 4; :>> direction = PinDirection::GND; :>> signalName = "FTS_GND"; :>> function = "B10 analog ground"; :>> testValue = "0 V AGND"; }
            port pin_05 : ConnectorPin { :>> pinNo = 5; :>> direction = PinDirection::NC; :>> signalName = "NC"; :>> function = "Reserved (aux GND)"; :>> testValue = "open"; }
            port pin_06 : ConnectorPin { :>> pinNo = 6; :>> direction = PinDirection::OUT; :>> signalName = "OILP_5V"; :>> function = "B110 +5 V supply"; :>> testValue = "5.00 V +-2 %"; }
            port pin_07 : ConnectorPin { :>> pinNo = 7; :>> direction = PinDirection::OUT; :>> signalName = "BOOST_5V"; :>> function = "B111 +5 V supply"; :>> testValue = "5.00 V +-2 %"; }
            port pin_08 : ConnectorPin { :>> pinNo = 8; :>> direction = PinDirection::NC; :>> signalName = "NC"; :>> function = "Reserved"; :>> testValue = "open"; }
            port pin_09 : ConnectorPin { :>> pinNo = 9; :>> direction = PinDirection::OUT; :>> signalName = "BANK2_HS"; :>> function = "Bank 2 common high-side (cyl 4,5,6)"; :>> testValue = "0.4..0.9 Ohm to 45/44/38; DTC 54xx..56xx"; }
            port pin_10 : ConnectorPin { :>> pinNo = 10; :>> direction = PinDirection::GND; :>> signalName = "OILP_GND"; :>> function = "B110 analog ground"; :>> testValue = "0 V AGND"; }
            port pin_11 : ConnectorPin { :>> pinNo = 11; :>> direction = PinDirection::NC; :>> signalName = "NC"; :>> function = "Starter return / aux (variant)"; :>> testValue = "open"; }
            port pin_12 : ConnectorPin { :>> pinNo = 12; :>> direction = PinDirection::OUT; :>> signalName = "PV1_SUPPLY"; :>> function = "PV1 +24 V supply (shared X1-10)"; :>> testValue = "+24 V when active"; }
            port pin_13 : ConnectorPin { :>> pinNo = 13; :>> direction = PinDirection::NC; :>> signalName = "NC"; :>> function = "Reserved"; :>> testValue = "open"; }
            port pin_14 : ConnectorPin { :>> pinNo = 14; :>> direction = PinDirection::NC; :>> signalName = "NC"; :>> function = "Reserved"; :>> testValue = "open"; }
            port pin_15 : ConnectorPin { :>> pinNo = 15; :>> direction = PinDirection::GND; :>> signalName = "OILT_GND"; :>> function = "B11 analog ground"; :>> testValue = "0 V AGND"; }
            port pin_16 : ConnectorPin { :>> pinNo = 16; :>> direction = PinDirection::OUT; :>> signalName = "BANK1_HS"; :>> function = "Bank 1 common high-side (cyl 1,2,3)"; :>> testValue = "0.4..0.9 Ohm to 54/53/47; DTC 51xx..53xx"; }
            port pin_17 : ConnectorPin { :>> pinNo = 17; :>> direction = PinDirection::NC; :>> signalName = "NC"; :>> function = "Reserved"; :>> testValue = "open"; }
            port pin_18 : ConnectorPin { :>> pinNo = 18; :>> direction = PinDirection::OUT; :>> signalName = "STARTER_OUT"; :>> function = "Starter relay high-side (max 4 A)"; :>> testValue = "+24 V while cranking"; }
            port pin_19 : ConnectorPin { :>> pinNo = 19; :>> direction = PinDirection::IN; :>> signalName = "CKP_SIG"; :>> function = "B15 crank VR (+), 36 slots + ref"; :>> testValue = ">=1.2 Vpp crank .. ~25 Vpp; DTC 0110/0111/0112"; }
            port pin_20 : ConnectorPin { :>> pinNo = 20; :>> direction = PinDirection::IN; :>> signalName = "CMP_SIG"; :>> function = "B16 cam VR (+), 12+1 teeth"; :>> testValue = ">=0.9 Vpp crank; DTC 0210/0211/0212"; }
            port pin_21 : ConnectorPin { :>> pinNo = 21; :>> direction = PinDirection::GND; :>> signalName = "IAT_GND"; :>> function = "B111-T analog ground"; :>> testValue = "0 V AGND"; }
            port pin_22 : ConnectorPin { :>> pinNo = 22; :>> direction = PinDirection::NC; :>> signalName = "NC"; :>> function = "Reserved"; :>> testValue = "open"; }
            port pin_23 : ConnectorPin { :>> pinNo = 23; :>> direction = PinDirection::GND; :>> signalName = "BOOST_GND"; :>> function = "B111-P analog ground"; :>> testValue = "0 V AGND"; }
            port pin_24 : ConnectorPin { :>> pinNo = 24; :>> direction = PinDirection::NC; :>> signalName = "NC"; :>> function = "Reserved"; :>> testValue = "open"; }
            port pin_25 : ConnectorPin { :>> pinNo = 25; :>> direction = PinDirection::IN; :>> signalName = "BLOCK_START"; :>> function = "Engine-block start button (bridged to X2-30)"; :>> testValue = "active when bridged"; }
            port pin_26 : ConnectorPin { :>> pinNo = 26; :>> direction = PinDirection::NC; :>> signalName = "NC"; :>> function = "Reserved"; :>> testValue = "open"; }
            port pin_27 : ConnectorPin { :>> pinNo = 27; :>> direction = PinDirection::NC; :>> signalName = "NC"; :>> function = "Reserved"; :>> testValue = "open"; }
            port pin_28 : ConnectorPin { :>> pinNo = 28; :>> direction = PinDirection::NC; :>> signalName = "NC"; :>> function = "Reserved"; :>> testValue = "open"; }
            port pin_29 : ConnectorPin { :>> pinNo = 29; :>> direction = PinDirection::IN; :>> signalName = "BOOST_SIG"; :>> function = "B111-P boost pressure (abs)"; :>> testValue = "1.07 V @1.0 bar .. 4.21 V @3.2 bar; DTC 1415/1416"; }
            port pin_30 : ConnectorPin { :>> pinNo = 30; :>> direction = PinDirection::OUT; :>> signalName = "BTN_COM"; :>> function = "Service-button common supply"; :>> testValue = "reference line"; }
            port pin_31 : ConnectorPin { :>> pinNo = 31; :>> direction = PinDirection::NC; :>> signalName = "NC"; :>> function = "Reserved"; :>> testValue = "open"; }
            port pin_32 : ConnectorPin { :>> pinNo = 32; :>> direction = PinDirection::IN; :>> signalName = "OILP_SIG"; :>> function = "B110 oil pressure (gauge)"; :>> testValue = "0.50 V @0 bar .. 4.50 V @5 bar; DTC 1615/1616"; }
            port pin_33 : ConnectorPin { :>> pinNo = 33; :>> direction = PinDirection::IN; :>> signalName = "OILLVL_SIG"; :>> function = "B14 thermal oil level (pulse +)"; :>> testValue = "18..26 Ohm to X2-49; DTC 2515/2516"; }
            port pin_34 : ConnectorPin { :>> pinNo = 34; :>> direction = PinDirection::IN; :>> signalName = "ECT_SIG"; :>> function = "B65 coolant temperature NTC"; :>> testValue = "2.50 V @20 C, 0.57 V @80 C; DTC 1515/1516"; }
            port pin_35 : ConnectorPin { :>> pinNo = 35; :>> direction = PinDirection::IN; :>> signalName = "BLOCK_STOP"; :>> function = "Engine-block stop button (bridged to X2-30)"; :>> testValue = "active when bridged"; }
            port pin_36 : ConnectorPin { :>> pinNo = 36; :>> direction = PinDirection::IN; :>> signalName = "FTS_SIG"; :>> function = "B10 fuel temperature NTC"; :>> testValue = "2.50 V @20 C, 0.57 V @80 C; DTC 1215/1216"; }
            port pin_37 : ConnectorPin { :>> pinNo = 37; :>> direction = PinDirection::NC; :>> signalName = "UP_H_CYL8"; :>> function = "Unit pump H, cyl 8 (OM 502 V8 only)"; :>> testValue = "not wired on V6"; }
            port pin_38 : ConnectorPin { :>> pinNo = 38; :>> direction = PinDirection::OUT; :>> signalName = "UP_F_CYL6"; :>> function = "Unit pump F, cyl 6 (bank 2)"; :>> testValue = "0.6 Ohm to X2-9; DTC 56xx"; }
            port pin_39 : ConnectorPin { :>> pinNo = 39; :>> direction = PinDirection::IN; :>> signalName = "OILT_SIG"; :>> function = "B11 oil temperature NTC"; :>> testValue = "2.50 V @20 C, 0.57 V @80 C; DTC 1115/1116"; }
            port pin_40 : ConnectorPin { :>> pinNo = 40; :>> direction = PinDirection::NC; :>> signalName = "NC"; :>> function = "Reserved"; :>> testValue = "open"; }
            port pin_41 : ConnectorPin { :>> pinNo = 41; :>> direction = PinDirection::OUT; :>> signalName = "PV3_LS"; :>> function = "PV3 fan-clutch valve low-side PWM"; :>> testValue = "30..50 Ohm to X2-12/52"; }
            port pin_42 : ConnectorPin { :>> pinNo = 42; :>> direction = PinDirection::NC; :>> signalName = "NC"; :>> function = "Reserved"; :>> testValue = "open"; }
            port pin_43 : ConnectorPin { :>> pinNo = 43; :>> direction = PinDirection::OUT; :>> signalName = "PV4_LS"; :>> function = "PV4 aux / fan stage low-side PWM"; :>> testValue = "PWM"; }
            port pin_44 : ConnectorPin { :>> pinNo = 44; :>> direction = PinDirection::OUT; :>> signalName = "UP_D_CYL5"; :>> function = "Unit pump D, cyl 5 (bank 2)"; :>> testValue = "0.6 Ohm to X2-9; DTC 55xx"; }
            port pin_45 : ConnectorPin { :>> pinNo = 45; :>> direction = PinDirection::OUT; :>> signalName = "UP_B_CYL4"; :>> function = "Unit pump B, cyl 4 (bank 2)"; :>> testValue = "0.6 Ohm to X2-9; DTC 54xx"; }
            port pin_46 : ConnectorPin { :>> pinNo = 46; :>> direction = PinDirection::NC; :>> signalName = "UP_G_CYL7"; :>> function = "Unit pump G, cyl 7 (OM 502 V8 only)"; :>> testValue = "not wired on V6"; }
            port pin_47 : ConnectorPin { :>> pinNo = 47; :>> direction = PinDirection::OUT; :>> signalName = "UP_E_CYL3"; :>> function = "Unit pump E, cyl 3 (bank 1)"; :>> testValue = "0.6 Ohm to X2-16; DTC 53xx"; }
            port pin_48 : ConnectorPin { :>> pinNo = 48; :>> direction = PinDirection::IN; :>> signalName = "IAT_SIG"; :>> function = "B111-T charge-air temperature NTC"; :>> testValue = "2.50 V @20 C; DTC 1315/1316"; }
            port pin_49 : ConnectorPin { :>> pinNo = 49; :>> direction = PinDirection::GND; :>> signalName = "OILLVL_RET"; :>> function = "B14 return"; :>> testValue = "0 V"; }
            port pin_50 : ConnectorPin { :>> pinNo = 50; :>> direction = PinDirection::OUT; :>> signalName = "PV2_LS"; :>> function = "PV2 exhaust-brake flap low-side"; :>> testValue = "30..50 Ohm to X2-52"; }
            port pin_51 : ConnectorPin { :>> pinNo = 51; :>> direction = PinDirection::OUT; :>> signalName = "PV1_LS"; :>> function = "PV1 constant-throttle (decompression) low-side"; :>> testValue = "30..50 Ohm to X2-12"; }
            port pin_52 : ConnectorPin { :>> pinNo = 52; :>> direction = PinDirection::OUT; :>> signalName = "PV2_SUPPLY"; :>> function = "PV2 / PV +24 V supply"; :>> testValue = "+24 V when active"; }
            port pin_53 : ConnectorPin { :>> pinNo = 53; :>> direction = PinDirection::OUT; :>> signalName = "UP_C_CYL2"; :>> function = "Unit pump C, cyl 2 (bank 1)"; :>> testValue = "0.6 Ohm to X2-16; DTC 52xx"; }
            port pin_54 : ConnectorPin { :>> pinNo = 54; :>> direction = PinDirection::OUT; :>> signalName = "UP_A_CYL1"; :>> function = "Unit pump A, cyl 1 (bank 1)"; :>> testValue = "0.6 Ohm to X2-16; DTC 51xx"; }
            port pin_55 : ConnectorPin { :>> pinNo = 55; :>> direction = PinDirection::NC; :>> signalName = "NC"; :>> function = "Reserved"; :>> testValue = "open"; }
        }

        interface def CanBusLink {
            doc /* IES-CAN 250 kbit/s, 120 Ohm termination per node end. */
            end port nodeA : CanPort;
            end port nodeB : CanPort;
        }
        interface def AnalogSensorLink {
            end port sensor : AnalogSignalPort;
            end port ecu : ~AnalogSignalPort;
        }
        interface def VRSensorLink {
            end port sensor : VRSignalPort;
            end port ecu : ~VRSignalPort;
        }
        interface def SolenoidLink {
            end port driver : SolenoidDrivePort;
            end port coil : ~SolenoidDrivePort;
        }
        interface def ValveLink {
            end port driver : ValveDrivePort;
            end port valve : ~ValveDrivePort;
        }
        interface def SupplyLink {
            end port source : SupplyPort;
            end port sink : ~SupplyPort;
        }
    }

    // =================================================================================
    package Requirements {
        private import HardwareStructure::*;

        requirement def <'REQ-PWR-01'> SupplyRegulation {
            doc /* With KL.30 between 18 V and 32 V the 5 V reference (TLE4275) shall stay
                 * within 4.90 .. 5.10 V (TLE4275 datasheet tolerance +-2 %). */
            subject ecu : MR_PLD_ECU;
            attribute vKl30 : Real;
            attribute vRef : Real;
            assume constraint { vKl30 >= 18.0 and vKl30 <= 32.0 }
            require constraint { vRef >= 4.90 and vRef <= 5.10 }
        }
        requirement def <'REQ-SYNC-02'> DualSyncRedundancy {
            doc /* Injection shall continue on CKP (36 slots + ref) or on CMP (12+1) alone;
                 * injection is inhibited only when both are lost. */
            subject ecu : MR_PLD_ECU;
            attribute ckpValid : Boolean;
            attribute cmpValid : Boolean;
            attribute injectionEnabled : Boolean;
            require constraint { injectionEnabled == (ckpValid or cmpValid) }
        }
        requirement def <'REQ-INJ-03'> PeakHoldCurrent {
            doc /* Unit-pump coil current: pull-in 16 A (+-2 A), hold 8 A (+-0.5 A),
                 * measured on DALE R033F 0.033 Ohm shunts -> 528 mV / 264 mV. */
            subject ecu : MR_PLD_ECU;
            attribute iPeak : Real;
            attribute iHold : Real;
            require constraint { iPeak >= 14.0 and iPeak <= 18.0 and iHold >= 7.5 and iHold <= 8.5 }
        }
        requirement def <'REQ-INJ-04'> SolenoidCircuitProtection {
            doc /* Hardware cut-off above 24 A; open coil declared when peak current < 4 A. */
            subject ecu : MR_PLD_ECU;
            attribute iCoil : Real;
            attribute driverEnabled : Boolean;
            require constraint { iCoil > 24.0 implies not driverEnabled }
        }
        requirement def <'REQ-SAF-05'> SmokeLimitation {
            doc /* Injected quantity limited by boost (and baro / air temperature) map,
                 * absolute ceiling 185 mg/stroke. */
            subject ecu : MR_PLD_ECU;
            attribute qFuel : Real;
            attribute qSmokeMax : Real;
            require constraint { qFuel <= qSmokeMax and qFuel <= 185.0 }
        }
        requirement def <'REQ-SEC-06'> ImmobilizerInterlock {
            doc /* Starter output (X2-18 / X1-12) and injection only after a valid
                 * drive-authorisation code from FR matches the 93C86 pairing data. */
            subject ecu : MR_PLD_ECU;
            attribute immoValid : Boolean;
            attribute rpm : Real;
            attribute starterOut : Boolean;
            require constraint { starterOut implies (immoValid and rpm < 300.0) }
        }
        requirement def <'REQ-DIAG-07'> SensorDiagnosticWindow {
            doc /* Ratiometric sensors valid 0.25 .. 4.75 V, NTC inputs valid 0.18 .. 4.82 V;
                 * outside the window a DTC is stored and the substitute value is used. */
            subject ecu : MR_PLD_ECU;
            attribute vPin : Real;
            attribute faultStored : Boolean;
            require constraint { (vPin < 0.25 or vPin > 4.75) implies faultStored }
        }
        requirement def <'REQ-THM-08'> ThermalProtection {
            doc /* Fan clutch PV3 PWM from 92 C, 100 % at 100 C; warning and derate from 103 C;
                 * hard derate 35 % from 110 C. */
            subject ecu : MR_PLD_ECU;
            attribute coolantC : Real;
            attribute torqueLimitPct : Real;
            require constraint { coolantC >= 110.0 implies torqueLimitPct <= 65.0 }
        }
        requirement def <'REQ-LIMP-09'> CkpLossLimpHome {
            doc /* On CKP loss the engine runs on CMP with engine speed limited to 1800 rpm. */
            subject ecu : MR_PLD_ECU;
            attribute ckpValid : Boolean;
            attribute rpm : Real;
            require constraint { (not ckpValid) implies rpm <= 1800.0 }
        }
        requirement def <'REQ-FIRE-10'> FiringSequence {
            doc /* Firing order 1-4-2-5-3-6, 120 deg crank interval. */
            subject ecu : MR_PLD_ECU;
            attribute firingIntervalDeg : Real;
            require constraint { firingIntervalDeg == 120.0 }
        }
        requirement def <'REQ-COM-11'> CanCommunication {
            doc /* IES-CAN at 250 kbit/s to FR; loss of torque request -> limp torque. */
            subject ecu : MR_PLD_ECU;
            attribute bitRate : Real;
            require constraint { bitRate == 250000.0 }
        }
        requirement def <'REQ-ADC-12'> AdcResolution {
            doc /* 10-bit ADC on the 5 V reference: code = round(V / 5 x 1023). */
            subject ecu : MR_PLD_ECU;
            attribute adcBits : Integer;
            require constraint { adcBits == 10 }
        }

        requirement mrPldSpecification {
            doc /* Top-level specification grouping all ECU requirements. */
            subject ecu : MR_PLD_ECU;
            requirement reqPwr : SupplyRegulation;
            requirement reqSync : DualSyncRedundancy;
            requirement reqPeakHold : PeakHoldCurrent;
            requirement reqProt : SolenoidCircuitProtection;
            requirement reqSmoke : SmokeLimitation;
            requirement reqImmo : ImmobilizerInterlock;
            requirement reqDiag : SensorDiagnosticWindow;
            requirement reqThermal : ThermalProtection;
            requirement reqLimp : CkpLossLimpHome;
            requirement reqFiring : FiringSequence;
            requirement reqCan : CanCommunication;
            requirement reqAdc : AdcResolution;
        }
    }

    // =================================================================================
    package HardwareStructure {
        doc /* bdd - block definitions. */
        private import Interfaces::*;
        private import Signals::*;
        private import OperationalBehavior::*;

        abstract part def ElectronicComponent {
            attribute refDes : String;
            attribute partNumber : String;
            attribute packageType : String;
        }

        // ---------------- compute core ------------------------------------------------
        part def SAK_C167CS_LM :> ElectronicComponent {
            doc /* Siemens/Infineon C167CS, ROM-less, MQFP-144 (mounted at 45 deg). */
            :>> partNumber = "SAK-C167CS-LM";
            :>> packageType = "P-MQFP-144";
            attribute adcBits : Integer = 10;
            attribute adcInputs : Integer = 24;
            attribute canModules : Integer = 2;
            attribute capcomChannels : Integer = 32;
            port vdd : ~SupplyPort;
            port extBus : MemoryBusPort;
            port microwire : SerialMemoryPort;
            port capcomIn : ~VRSignalPort;
            port soiOut : GateDrivePort;
            port can : CanPort;
            port asc0 : KLinePort;
            port adcIn : ~AnalogSignalPort[12];
        }
        part def TEMIC_845AW :> ElectronicComponent {
            doc /* Co-processor / watchdog / digital input supervisor (PLCC-68). Function TBV. */
            :>> packageType = "PLCC-68";
            port vdd : ~SupplyPort;
            port digIn : ~DigitalInputPort[6];
        }
        part def AM29F400BB :> ElectronicComponent {
            doc /* 4 Mbit (512 KB) bottom-boot flash. Map: 0x00000-0x03FFF boot, 0x04000-0x5FFFF code,
                 * 0x60000-0x7FEFF data set (maps), 0x7FF00-0x7FFFF checksums.
                 * BSL entry: DQ4 (pin 24) to GND via 1 kOhm at reset = C167 P0L.4 low (TBV). */
            :>> partNumber = "AM29F400BB";
            :>> packageType = "PSOP-44";
            attribute capacityKB : Integer = 512;
            port bus : ~MemoryBusPort;
        }
        part def M93C86 :> ElectronicComponent {
            doc /* 16 kbit (2 KB) Microwire EEPROM: immobiliser pairing, engine no., device codes. */
            :>> partNumber = "93C86";
            :>> packageType = "SOIC-8";
            attribute capacityBytes : Integer = 2048;
            port microwire : ~SerialMemoryPort;
        }
        part def PLD_C1_1 :> ElectronicComponent {
            doc /* TEMIC PLD_C1.1 (PLCC-44): gate sequencer and peak/hold chopper logic. */
            :>> packageType = "PLCC-44";
            port soiIn : ~GateDrivePort;
            port gateOut : GateDrivePort[10];
            port currentTripIn : ~CurrentSensePort[2];
        }
        part def Crystal4MHz :> ElectronicComponent { attribute frequencyMHz : Real = 4.0; }

        // ---------------- analogue front-end ------------------------------------------
        part def LM2903D :> ElectronicComponent {
            doc /* Dual comparator - VR zero-crossing detector. */
            :>> partNumber = "LM2903D";
            port vrIn : ~VRSignalPort;
            port output : VRSignalPort;
        }
        part def LM2904D :> ElectronicComponent {
            doc /* Dual op-amp - ratiometric sensor buffer. */
            :>> partNumber = "LM2904D";
            port inp : ~AnalogSignalPort;
            port output : AnalogSignalPort;
        }
        part def LM2901D :> ElectronicComponent {
            doc /* Quad comparator - shunt current thresholds (peak / hold / overcurrent / open). */
            :>> partNumber = "LM2901D";
            port senseIn : ~CurrentSensePort;
            port trip : CurrentSensePort;
        }
        part def NtcPullUpNetwork :> ElectronicComponent {
            doc /* 2.49 kOhm 0.1 % pull-up to VAREF + RC low-pass. */
            attribute rPullUpOhm : Real = 2490.0;
            port vref : ~SupplyPort;
            port sensor : ~AnalogSignalPort;
            port toAdc : AnalogSignalPort;
        }
        part def OnboardBaroSensor :> ElectronicComponent {
            doc /* Absolute MEMS barometric sensor on PCB, 0.50-1.15 bar -> 0.5-4.5 V (TBV). */
            port vdd : ~SupplyPort;
            port output : AnalogSignalPort;
        }

        // ---------------- power & comms -------------------------------------------------
        part def TLE4275 :> ElectronicComponent {
            doc /* 5 V / 450 mA LDO with reset; output 4.90 .. 5.10 V. */
            :>> partNumber = "TLE4275";
            attribute vOutNom : Real = 5.00;
            attribute vOutTolPct : Real = 2.0;
            port vin : ~SupplyPort;
            port wake : ~DigitalInputPort;
            port vout : SupplyPort;
        }
        part def EmiChoke :> ElectronicComponent { :>> partNumber = "S+M 882590"; }
        part def CanTransceiver :> ElectronicComponent {
            doc /* PCA82C250 / B10011S class transceiver. */
            port bus : CanPort;
            port mcu : ~CanPort;
        }
        part def L9637D :> ElectronicComponent {
            :>> partNumber = "L9637D";
            port line : KLinePort;
            port mcu : ~KLinePort;
        }

        // ---------------- power stage ----------------------------------------------------
        part def BUZ102SL :> ElectronicComponent {
            doc /* High-side MOSFET, D2PAK. */
            :>> partNumber = "BUZ102SL";
            :>> packageType = "TO-263";
            port gate : ~GateDrivePort;
            port output : SolenoidDrivePort;
        }
        part def SUD25N06_45L :> ElectronicComponent {
            doc /* Low-side solenoid MOSFET, DPAK. */
            :>> partNumber = "SUD25N06-45L";
            :>> packageType = "TO-252";
            port gate : ~GateDrivePort;
            port drain : SolenoidDrivePort;
        }
        part def DaleShunt :> ElectronicComponent {
            :>> partNumber = "Vishay DALE R033F";
            attribute resistanceOhm : Real = 0.033;
            port sense : CurrentSensePort;
        }
        part def FreewheelNetwork :> ElectronicComponent { :>> packageType = "SMB + 0805"; }

        // ---------------- ECU subsystems ----------------------------------------------
        part def ComputeCore {
            part mcu : SAK_C167CS_LM { :>> refDes = "U1"; }
            part coProcessor : TEMIC_845AW { :>> refDes = "U4"; }
            part flash : AM29F400BB { :>> refDes = "U2"; }
            part eeprom : M93C86 { :>> refDes = "U5"; }
            part crystals : Crystal4MHz[2];
        }
        part def SensorAFE {
            part vrComparators : LM2903D[2];
            part buffers : LM2904D[2];
            part ntcNetworks : NtcPullUpNetwork[4];
            part baro : OnboardBaroSensor;
        }
        part def InjectionPowerStage {
            part gateCpld : PLD_C1_1 { :>> refDes = "U3"; }
            part hsBank1 : BUZ102SL { :>> refDes = "Q_HS1"; }
            part hsBank2 : BUZ102SL { :>> refDes = "Q_HS2"; }
            part lowSide : SUD25N06_45L[8] {
                doc /* Q_LS1..3 cyl 1-3, Q_LS5..7 cyl 4-6, Q_LS4 / Q_LS8 cyl 7 / 8 (V8 only). */
            }
            part shuntBank1 : DaleShunt { :>> refDes = "R_SH1"; }
            part shuntBank2 : DaleShunt { :>> refDes = "R_SH2"; }
            part currentComparators : LM2901D[3];
            part freewheel : FreewheelNetwork[8];
        }
        part def ValveAndStarterDrivers {
            part hsValveSupply : BUZ102SL { :>> refDes = "Q_HS3"; }
            part hsStarter : BUZ102SL { :>> refDes = "Q_HS4"; }
            part hsAux : BUZ102SL { :>> refDes = "Q_HS5"; }
            port starterOut : RelayDrivePort;
            port pvOut : ValveDrivePort[4];
        }
        part def PowerSupplyAndComms {
            part regulator : TLE4275 { :>> refDes = "U16"; }
            part choke : EmiChoke { :>> refDes = "L_FILT1"; }
            part canPhy : CanTransceiver[2];
            part kLinePhy : L9637D { :>> refDes = "U15"; }
        }

        // ---------------- the ECU block ---------------------------------------------------
        part def MR_PLD_ECU {
            doc /* Engine controller MR (Motor-Regelung) for PLD unit-pump injection. */
            attribute label : Identification::ECU_Label = Identification::thisEcu;
            attribute engineVariant : Identification::EngineVariant = Identification::EngineVariant::OM501LA_V6;
            attribute rShuntOhm : Real = 0.033;
            attribute iPeakA : Real = 16.0;
            attribute iHoldA : Real = 8.0;
            attribute iOvercurrentA : Real = 24.0;
            attribute vRefV : Real = 5.00;
            attribute rPullUpOhm : Real = 2490.0;
            attribute firingOrder : Integer[6] ordered = (1, 4, 2, 5, 3, 6);
            attribute firingIntervalDeg : Real = 120.0;

            port x1 : X1_CabConnector16;
            port x2 : X2_EngineConnector55;

            part core : ComputeCore;
            part afe : SensorAFE;
            part injStage : InjectionPowerStage;
            part drivers : ValveAndStarterDrivers;
            part pwrCom : PowerSupplyAndComms;

            exhibit state operatingModes : MR_PLD_OperatingStates;
        }

        // ---------------- external blocks (engine / vehicle context) ---------------------
        part def FR_CabECU {
            doc /* Vehicle controller FR (Fahrregelung) - pedal, immobiliser authorisation. */
            port can : CanPort;
            port kl15 : DigitalInputPort;
            port kl50 : DigitalInputPort;
        }
        part def Battery24V { port kl30 : SupplyPort; port kl31 : GroundPort; }
        part def DiagnosticTester { port kLine : KLinePort; }

        abstract part def EngineSensor {
            attribute reference : String;
            attribute kind : String;
        }
        part def VRSensor :> EngineSensor {
            :>> kind = "Inductive VR";
            attribute coilOhmMin : Real = 1050.0;
            attribute coilOhmMax : Real = 1350.0;
            attribute teeth : Integer;
            port sig : VRSignalPort;
        }
        part def NTCSensor :> EngineSensor {
            :>> kind = "NTC 2.5 kOhm @ 20 C";
            attribute r20Ohm : Real = 2500.0;
            attribute r80Ohm : Real = 322.0;
            port sig : AnalogSignalPort;
        }
        part def RatiometricPressureSensor :> EngineSensor {
            :>> kind = "Piezoresistive ratiometric 0.5-4.5 V";
            attribute pMin : Real;
            attribute pMax : Real;
            port supply : ~SupplyPort;
            port sig : AnalogSignalPort;
        }
        part def ThermalOilLevelSensor :> EngineSensor {
            :>> kind = "Hot-wire";
            attribute ohmMin : Real = 18.0;
            attribute ohmMax : Real = 26.0;
            port sig : AnalogSignalPort;
        }
        part def UnitPump {
            doc /* PLD unit pump (Pumpe-Leitung-Duese) with solenoid valve. */
            attribute cylinder : Integer;
            attribute coilOhm : Real = 0.6;
            attribute coilInductanceH : Real = 0.0003 { doc /* TBV - used by the RL simulation. */ }
            port coil : ~SolenoidDrivePort;
            port fuelIn : FuelPort;
        }
        part def ProportionalValve {
            attribute name : String;
            attribute coilOhmMin : Real = 30.0;
            attribute coilOhmMax : Real = 50.0;
            port drive : ~ValveDrivePort;
        }
        part def StarterRelay { port coil : ~RelayDrivePort; }

        part def OM501LA_EngineSystem {
            doc /* System context: the ECU with everything wired to X1 / X2. */
            part ecu : MR_PLD_ECU;
            part fr : FR_CabECU;
            part battery : Battery24V;
            part tester : DiagnosticTester;
            part b15_ckp : VRSensor { :>> reference = "B15"; :>> teeth = 36; }
            part b16_cmp : VRSensor { :>> reference = "B16"; :>> teeth = 12; }
            part b111_boost : RatiometricPressureSensor { :>> reference = "B111-P"; :>> pMin = 0.6; :>> pMax = 3.4; }
            part b111_iat : NTCSensor { :>> reference = "B111-T"; }
            part b65_ect : NTCSensor { :>> reference = "B65"; }
            part b10_fuel : NTCSensor { :>> reference = "B10"; }
            part b110_oilP : RatiometricPressureSensor { :>> reference = "B110"; :>> pMin = 0.0; :>> pMax = 5.0; }
            part b11_oilT : NTCSensor { :>> reference = "B11"; }
            part b14_oilLvl : ThermalOilLevelSensor { :>> reference = "B14"; }
            part unitPumps : UnitPump[6];
            part pv1_decompression : ProportionalValve { :>> name = "PV1 constant throttle"; }
            part pv2_exhaustBrake : ProportionalValve { :>> name = "PV2 exhaust brake flap"; }
            part pv3_fanClutch : ProportionalValve { :>> name = "PV3 fan clutch"; }
            part pv4_aux : ProportionalValve { :>> name = "PV4 aux / fan stage"; }
            part starter : StarterRelay;
        }
    }

    // =================================================================================
    package InternalStructure {
        doc /* ibd - internal connections of the ECU and harness wiring of the context. */
        private import HardwareStructure::*;
        private import Interfaces::*;
        private import Signals::*;

        part mrPld : MR_PLD_ECU {
            // supply chain
            connect pwrCom.regulator.vout to core.mcu.vdd;
            connect pwrCom.regulator.vout to core.coProcessor.vdd;
            connect pwrCom.regulator.vout to afe.baro.vdd;
            // compute
            connect core.mcu.extBus to core.flash.bus;
            connect core.mcu.microwire to core.eeprom.microwire;
            connect core.mcu.can to pwrCom.canPhy.mcu;
            connect core.mcu.asc0 to pwrCom.kLinePhy.mcu;
            // sensing
            connect afe.vrComparators.output to core.mcu.capcomIn;
            connect afe.buffers.output to core.mcu.adcIn;
            connect afe.ntcNetworks.toAdc to core.mcu.adcIn;
            connect afe.baro.output to core.mcu.adcIn;
            // injection loop: MCU CAPCOM -> CPLD -> gates -> coil -> shunt -> comparators -> CPLD
            connect core.mcu.soiOut to injStage.gateCpld.soiIn;
            connect injStage.gateCpld.gateOut to injStage.lowSide.gate;
            connect injStage.gateCpld.gateOut to injStage.hsBank1.gate;
            connect injStage.gateCpld.gateOut to injStage.hsBank2.gate;
            connect injStage.shuntBank1.sense to injStage.currentComparators.senseIn;
            connect injStage.shuntBank2.sense to injStage.currentComparators.senseIn;
            connect injStage.currentComparators.trip to injStage.gateCpld.currentTripIn;
            flow of SoiTrigger from core.mcu.soiOut.trigger to injStage.gateCpld.soiIn.trigger;
        }

        part engineSystem : OM501LA_EngineSystem {
            // IES-CAN to the cab controller
            interface : CanBusLink connect nodeA ::> fr.can to nodeB ::> ecu.pwrCom.canPhy.bus;
            flow of TorqueRequestFrame from fr.can to ecu.pwrCom.canPhy.bus;
            flow of ImmoReleaseFrame from fr.can to ecu.pwrCom.canPhy.bus;
            // power & control inputs (X1)
            connect battery.kl30 to ecu.x1.pin_05;
            connect battery.kl30 to ecu.x1.pin_06;
            connect battery.kl31 to ecu.x1.pin_09;
            connect battery.kl31 to ecu.x1.pin_11;
            connect fr.kl15 to ecu.x1.pin_15;
            connect fr.kl50 to ecu.x1.pin_08;
            connect fr.can to ecu.x1.pin_01;
            connect fr.can to ecu.x1.pin_02;
            connect tester.kLine to ecu.x1.pin_13;
            // engine harness (X2)
            connect b15_ckp.sig to ecu.x2.pin_19;   // B15 Crankshaft position (VR 36 slots + ref) -> CC0, return X2-2
            connect b16_cmp.sig to ecu.x2.pin_20;   // B16 Camshaft position (VR 12+1) -> CC1, return X2-1
            connect b111_boost.sig to ecu.x2.pin_29;   // B111-P Charge-air pressure (abs) -> AN0, return X2-23
            connect b111_boost.supply to ecu.x2.pin_07;   // B111-P +5 V
            connect b111_iat.sig to ecu.x2.pin_48;   // B111-T Charge-air temperature -> AN1, return X2-21
            connect b65_ect.sig to ecu.x2.pin_34;   // B65 Coolant temperature -> AN2, return X2-3
            connect b10_fuel.sig to ecu.x2.pin_36;   // B10 Fuel temperature -> AN3, return X2-4
            connect b110_oilP.sig to ecu.x2.pin_32;   // B110 Oil pressure (gauge) -> AN4, return X2-10
            connect b110_oilP.supply to ecu.x2.pin_06;   // B110 +5 V
            connect b11_oilT.sig to ecu.x2.pin_39;   // B11 Oil temperature -> AN5, return X2-15
            connect b14_oilLvl.sig to ecu.x2.pin_33;   // B14 Thermal oil level -> AN6, return X2-49
            connect unitPumps[1].coil to ecu.x2.pin_54;   // cyl 1 low-side, bank 1 common X2-16
            connect unitPumps[2].coil to ecu.x2.pin_53;   // cyl 2 low-side, bank 1 common X2-16
            connect unitPumps[3].coil to ecu.x2.pin_47;   // cyl 3 low-side, bank 1 common X2-16
            connect unitPumps[4].coil to ecu.x2.pin_45;   // cyl 4 low-side, bank 2 common X2-9
            connect unitPumps[5].coil to ecu.x2.pin_44;   // cyl 5 low-side, bank 2 common X2-9
            connect unitPumps[6].coil to ecu.x2.pin_38;   // cyl 6 low-side, bank 2 common X2-9
            // valves and starter
            connect pv1_decompression.drive to ecu.x2.pin_51;
            connect pv2_exhaustBrake.drive to ecu.x2.pin_50;
            connect pv3_fanClutch.drive to ecu.x2.pin_41;
            connect pv4_aux.drive to ecu.x2.pin_43;
            connect starter.coil to ecu.x2.pin_18;
        }
    }

    // =================================================================================
    package Parametrics {
        doc /* par - constraint blocks; numeric twins live in mrpld_sim.py. */

        constraint def NtcDivider {
            doc /* V_pin = Vref * R_ntc / (R_ntc + R_pullup). */
            in rNtc : Real;
            in rPullUp : Real;
            in vRef : Real;
            in vPin : Real;
            vPin == vRef * rNtc / (rNtc + rPullUp)
        }
        constraint def RatiometricTransfer {
            doc /* Linear sensor: V = Vmin + (P - Pmin) * (Vmax - Vmin) / (Pmax - Pmin). */
            in p : Real;
            in pMin : Real;
            in pMax : Real;
            in vMin : Real;
            in vMax : Real;
            in v : Real;
            v == vMin + (p - pMin) * (vMax - vMin) / (pMax - pMin)
        }
        constraint def AdcQuantization {
            in v : Real;
            in vRef : Real;
            in code : Real;
            code == v / vRef * 1023.0
        }
        constraint def ShuntSense {
            in iCoil : Real;
            in rShunt : Real;
            in vSense : Real;
            vSense == iCoil * rShunt
        }
        constraint def VrFrequency {
            doc /* CKP: f = 36 * n / 60 = 0.6 n ; CMP: f = 12 * (n / 2) / 60 = 0.1 n. */
            in teethPerRev : Real;
            in shaftToCrankRatio : Real;
            in rpm : Real;
            in fHz : Real;
            fHz == teethPerRev * rpm * shaftToCrankRatio / 60.0
        }
        constraint def SmokeLimiter {
            doc /* q_max = min(185, 55 + 65 * (P_boost - 1.0)) mg/stroke (calibration TBV). */
            in pBoostBar : Real;
            in qMax : Real;
            qMax == 55.0 + 65.0 * (pBoostBar - 1.0)
        }
        constraint def FuelDemand {
            in pedalPct : Real;
            in qReq : Real;
            qReq == 22.0 + 1.6 * pedalPct
        }
        constraint def SoiMap {
            in pedalPct : Real;
            in coldAdvance : Real;
            in soiDeg : Real;
            soiDeg == 11.5 + 0.05 * pedalPct + coldAdvance
        }
        constraint def BatteryDivider {
            in vBat : Real;
            in vAdc : Real;
            vAdc == vBat * 1.8 / 11.8
        }
        constraint def SolenoidRL {
            doc /* L di/dt = V_bat - (R_coil + R_dson + R_shunt) * i  (integrated in the simulation). */
            in vBat : Real;
            in rTotal : Real;
            in lCoil : Real;
            in i : Real;
            in diDt : Real;
            diDt == (vBat - rTotal * i) / lCoil
        }

        part def SensorChainContext {
            doc /* Binds the ECU constants to the sensor transfer functions. */
            attribute vRef : Real = 5.00;
            attribute rPullUp : Real = 2490.0;
            attribute rShunt : Real = 0.033;
            attribute ectOhm : Real;
            attribute ectVolt : Real;
            attribute boostBar : Real;
            attribute boostVolt : Real;
            attribute coilA : Real;
            attribute shuntVolt : Real;
            constraint ect : NtcDivider {
                in rNtc = ectOhm;
                in rPullUp = SensorChainContext::rPullUp;
                in vRef = SensorChainContext::vRef;
                in vPin = ectVolt;
            }
            constraint boost : RatiometricTransfer {
                in p = boostBar;
                in pMin = 0.6;
                in pMax = 3.4;
                in vMin = 0.5;
                in vMax = 4.5;
                in v = boostVolt;
            }
            constraint shunt : ShuntSense {
                in iCoil = coilA;
                in rShunt = SensorChainContext::rShunt;
                in vSense = shuntVolt;
            }
        }
    }

    // =================================================================================
    package OperationalBehavior {
        doc /* stm + act. */
        private import Signals::*;

        state def MR_PLD_OperatingStates {
            doc /* ECU operating modes (matches ST_* names of the workstation simulator). */
            attribute rpm : Real;
            attribute coolantC : Real;
            attribute immoValid : Boolean;
            attribute ckpValid : Boolean;
            attribute cmpValid : Boolean;

            entry; then ST_STANDBY;

            state ST_STANDBY {
                doc /* KL.15 = 0 V, regulator off, only KL.30 present. */
            }
            state ST_INIT_IMMO {
                doc /* Power latch, 5 V on, flash/EEPROM checksum, ADC plausibility, B14 oil level pulse,
                     * wait for drive authorisation over IES-CAN. */
                entry action powerLatchOn;
                do action runSelfTests;
            }
            state ST_IMMO_LOCKED {
                doc /* Code mismatch (MR 9964): starter output and injection inhibited. */
                entry action storeImmoFault;
            }
            state ST_READY {
                doc /* Authorised, waiting for KL.50 or block start button. */
            }
            state ST_CRANK_SYNC {
                doc /* Starter X2-18 on, synchronisation on CKP ref slot / CMP sync tooth, start fuel. */
                entry action starterOn;
                exit action starterOff;
            }
            state ST_RUN {
                entry; then ST_RUN_NORMAL;
                state ST_RUN_NORMAL {
                    doc /* Full sync 36+1 / 12+1, peak & hold injection, smoke limiter active. */
                }
                state ST_ENGINE_BRAKE {
                    doc /* Pedal 0 %, PV1 + PV2 energised, injection cut. */
                    entry action engineBrakeValvesOn;
                    exit action engineBrakeValvesOff;
                }
                transition brakeOn first ST_RUN_NORMAL accept EngineBrakeRequest then ST_ENGINE_BRAKE;
                transition brakeOff first ST_ENGINE_BRAKE accept EngineBrakeRelease then ST_RUN_NORMAL;
            }
            state ST_LIMP_DERATE {
                doc /* CKP or CMP lost, bank short, CAN timeout or coolant >= 103 C: torque limited,
                     * <= 1800 rpm when running on CMP only. */
                entry action applyTorqueLimit;
            }
            state ST_FAULT_SHUTDOWN {
                doc /* CKP and CMP lost: MOSFET matrix tristated, injection stopped. */
                entry action tristateDrivers;
            }
            state ST_AFTERRUN {
                doc /* Engine stopped, KL.15 off: store DTCs / adaptation to EEPROM, release power latch. */
                do action writeEeprom;
            }

            transition t01_wake first ST_STANDBY accept KL15_On then ST_INIT_IMMO;
            transition t02_auth first ST_INIT_IMMO accept SelfTestPassed if immoValid then ST_READY;
            transition t03_reject first ST_INIT_IMMO accept ImmoRejected then ST_IMMO_LOCKED;
            transition t04_lockOff first ST_IMMO_LOCKED accept KL15_Off then ST_STANDBY;
            transition t05_crank first ST_READY accept KL50_CrankRequest if rpm < 300.0 then ST_CRANK_SYNC;
            transition t06_blockStart first ST_READY accept BlockStartButton if rpm < 300.0 then ST_CRANK_SYNC;
            transition t07_started first ST_CRANK_SYNC accept EngineRunning if rpm > 500.0 then ST_RUN;
            transition t08_noSyncCrank first ST_CRANK_SYNC accept SyncLost if not ckpValid and not cmpValid then ST_FAULT_SHUTDOWN;
            transition t09_ckpLost first ST_RUN accept CkpLost if cmpValid then ST_LIMP_DERATE;
            transition t09b_cmpLost first ST_RUN accept CmpLost if ckpValid then ST_LIMP_DERATE;
            transition t10_overtemp first ST_RUN accept OvertempDetected if coolantC >= 103.0 then ST_LIMP_DERATE;
            transition t11_bankShort first ST_RUN accept BankShortDetected then ST_LIMP_DERATE;
            transition t12_canLost first ST_RUN accept CanTimeout then ST_LIMP_DERATE;
            transition t13_recover first ST_LIMP_DERATE accept CkpRestored if ckpValid and coolantC < 100.0 then ST_RUN;
            transition t13b_cooledDown first ST_LIMP_DERATE accept OvertempCleared if ckpValid and coolantC < 100.0 then ST_RUN;
            transition t14_syncLost first ST_RUN accept SyncLost if not ckpValid and not cmpValid then ST_FAULT_SHUTDOWN;
            transition t15_syncLostLimp first ST_LIMP_DERATE accept SyncLost if not ckpValid and not cmpValid then ST_FAULT_SHUTDOWN;
            transition t16_stopBtn first ST_RUN accept BlockStopButton then ST_AFTERRUN;
            transition t17_keyOffRun first ST_RUN accept KL15_Off then ST_AFTERRUN;
            transition t18_keyOffLimp first ST_LIMP_DERATE accept KL15_Off then ST_AFTERRUN;
            transition t19_keyOffShut first ST_FAULT_SHUTDOWN accept KL15_Off then ST_AFTERRUN;
            transition t20_keyOffReady first ST_READY accept KL15_Off then ST_STANDBY;
            transition t21_afterrunDone first ST_AFTERRUN accept AfterrunComplete then ST_STANDBY;
        }

        state def InjectionMicroCycle {
            doc /* Per-injection solenoid control executed by PLD_C1.1 with LM2901D feedback. */
            entry; then IDLE;
            state IDLE;
            state PEAK { doc /* Bank high-side + cylinder low-side on, current rises to 16 A. */ }
            state BIP_WAIT { doc /* Free-wheel at peak, watch for beginning-of-injection-period glitch. */ }
            state HOLD { doc /* Chop 8 A +- 0.5 A (about 10 kHz with 0.45 mH; L-dependent, TBV) until end of injection. */ }
            state SPILL { doc /* Fast de-energise via freewheel/zener, valve opens, spill. */ }
            state CYL_CUTOFF { doc /* Overcurrent > 24 A or open coil < 4 A: cylinder disabled, DTC 5Nxx. */ }

            transition first IDLE accept SoiTrigger then PEAK;
            transition first PEAK accept PeakCurrentReached then BIP_WAIT;
            transition first BIP_WAIT accept BipDetected then HOLD;
            transition first BIP_WAIT accept after 0.002 [s] then HOLD;
            transition first HOLD accept EoiTrigger then SPILL;
            transition first SPILL accept after 0.0003 [s] then IDLE;
            transition first PEAK accept OvercurrentTrip then CYL_CUTOFF;
            transition first HOLD accept OvercurrentTrip then CYL_CUTOFF;
        }

        action def InjectionEvent {
            doc /* One unit-pump injection, timed in crank degrees by CAPCOM. */
            in item soi : SoiTrigger;
            action computeQuantity;
            action computeSoi;
            action armCapcom;
            action pullIn;
            action detectBip;
            action holdChop;
            action release;
            first start;
            then computeQuantity;
            then computeSoi;
            then armCapcom;
            then pullIn;
            then detectBip;
            then holdChop;
            then release;
            then done;
        }

        action def EngineStartProcedure {
            action wakeUp;
            action selfTest;
            action authorise;
            action engageStarter;
            action synchronise;
            action startFuel;
            action rampToIdle;
            first start;
            then wakeUp;
            then selfTest;
            then authorise;
            then engageStarter;
            then synchronise;
            then startFuel;
            then rampToIdle;
            then done;
        }
    }

    // =================================================================================
    package Interactions {
        doc /* sd - sequence diagrams as occurrence definitions with ordered messages. */
        private import Signals::*;
        private import HardwareStructure::*;

        part def Driver;

        occurrence def SD_Crank_Auth_PeakHold_Injection {
            doc /* Key ON -> authorisation -> crank -> sync -> first peak & hold injection. */
            part driver : Driver {
                event occurrence keyOn;
                then event occurrence crankReq;
            }
            part fr : FR_CabECU {
                event occurrence rxKeyOn;
                then event occurrence txWake;
                then event occurrence txImmo;
                then event occurrence rxCrank;
                then event occurrence txKl50;
                then event occurrence txTorque;
            }
            part mcu : SAK_C167CS_LM {
                event occurrence rxWake;
                then event occurrence txEepromRead;
                then event occurrence rxEepromData;
                then event occurrence rxImmo;
                then event occurrence rxKl50;
                then event occurrence txStarterOn;
                then event occurrence rxCkp;
                then event occurrence rxCmp;
                then event occurrence rxTorque;
                then event occurrence txSoi;
                then event occurrence rxTrip;
            }
            part eeprom : M93C86 {
                event occurrence rxRead;
                then event occurrence txData;
            }
            part starter : StarterRelay { event occurrence rxOn; }
            part crankCam : VRSensor {
                event occurrence txCkp;
                then event occurrence txCmp;
            }
            part cpld : PLD_C1_1 {
                event occurrence rxSoi;
                then event occurrence txGates;
                then event occurrence rxPeakTrip;
                then event occurrence txHoldChop;
                then event occurrence txTripToMcu;
            }
            part powerStage : InjectionPowerStage {
                event occurrence rxGates;
                then event occurrence txShuntPeak;
                then event occurrence rxHoldChop;
            }

            message m01 of KL15_On from driver.keyOn to fr.rxKeyOn;
            then message m02 of KL15_On from fr.txWake to mcu.rxWake;
            then message m03 of FaultRecord from mcu.txEepromRead to eeprom.rxRead;
            then message m04 of FaultRecord from eeprom.txData to mcu.rxEepromData;
            then message m05 of ImmoReleaseFrame from fr.txImmo to mcu.rxImmo;
            then message m06 of KL50_CrankRequest from driver.crankReq to fr.rxCrank;
            then message m07 of KL50_CrankRequest from fr.txKl50 to mcu.rxKl50;
            then message m08 of KL50_CrankRequest from mcu.txStarterOn to starter.rxOn;
            then message m09 of VrToothPulse from crankCam.txCkp to mcu.rxCkp;
            then message m10 of VrToothPulse from crankCam.txCmp to mcu.rxCmp;
            then message m11 of TorqueRequestFrame from fr.txTorque to mcu.rxTorque;
            then message m12 of SoiTrigger from mcu.txSoi to cpld.rxSoi;
            then message m13 of SoiTrigger from cpld.txGates to powerStage.rxGates;
            then message m14 of PeakCurrentReached from powerStage.txShuntPeak to cpld.rxPeakTrip;
            then message m15 of PeakCurrentReached from cpld.txHoldChop to powerStage.rxHoldChop;
            then message m16 of BipDetected from cpld.txTripToMcu to mcu.rxTrip;
        }

        occurrence def SD_CkpLoss_LimpHome {
            doc /* CKP lost while running: MCU falls back to CMP timing, limits speed, reports DTC. */
            part crankCam : VRSensor {
                event occurrence ckpSilent;
                then event occurrence cmpTeeth;
            }
            part mcu : SAK_C167CS_LM {
                event occurrence detectMissing;
                then event occurrence rxCmp;
                then event occurrence txDtc;
                then event occurrence txSoiCmp;
            }
            part fr : FR_CabECU { event occurrence rxDtc; }
            part cpld : PLD_C1_1 { event occurrence rxSoi; }
            message n1 of CkpLost from crankCam.ckpSilent to mcu.detectMissing;
            then message n2 of VrToothPulse from crankCam.cmpTeeth to mcu.rxCmp;
            then message n3 of FaultRecord from mcu.txDtc to fr.rxDtc;
            then message n4 of SoiTrigger from mcu.txSoiCmp to cpld.rxSoi;
        }

        occurrence def SD_Immobilizer_Rejected {
            part fr : FR_CabECU {
                event occurrence txImmo;
                then event occurrence txKl50;
                then event occurrence rxDtc;
            }
            part mcu : SAK_C167CS_LM {
                event occurrence rxImmo;
                then event occurrence rxKl50;
                then event occurrence txDtc;
            }
            message k1 of ImmoReleaseFrame from fr.txImmo to mcu.rxImmo;
            then message k2 of KL50_CrankRequest from fr.txKl50 to mcu.rxKl50;
            then message k3 of FaultRecord from mcu.txDtc to fr.rxDtc;
        }
    }

    // =================================================================================
    package AnalysisAndSimulation {
        doc /* Analysis / verification cases and the simulation scenario set executed by mrpld_sim.py. */
        private import Signals::*;
        private import HardwareStructure::*;
        private import Requirements::*;
        private import Parametrics::*;

        calc def NtcVoltage {
            in tempOhm : Real;
            return v : Real = 5.00 * tempOhm / (tempOhm + 2490.0);
        }
        calc def BoostVoltage {
            in pBar : Real;
            return v : Real = 0.5 + (pBar - 0.6) * 4.0 / (3.4 - 0.6);
        }
        calc def OilPressureVoltage {
            in pBar : Real;
            return v : Real = 0.5 + pBar * 0.8;
        }
        calc def AdcCode {
            in v : Real;
            return code : Real = v / 5.00 * 1023.0;
        }
        calc def ShuntVoltage {
            in i : Real;
            return v : Real = i * 0.033;
        }
        calc def InjectedQuantity {
            in pedalPct : Real;
            in pBoostBar : Real;
            in torqueLimitPct : Real;
            attribute qReq : Real = 22.0 + 1.6 * pedalPct;
            attribute qSmoke : Real = 55.0 + 65.0 * (pBoostBar - 1.0);
            return q : Real = if qReq < qSmoke ? qReq * torqueLimitPct / 100.0 else qSmoke * torqueLimitPct / 100.0;
        }

        analysis def SensorCalibrationAnalysis {
            doc /* Reproduces the calibration tables (NTC 13 points, boost / oil pressure 7 points). */
            subject ecu : MR_PLD_ECU;
            objective { doc /* All table rows consistent with the transfer functions within 0.01 V / 1 LSB. */ }
            return ectAt80C : Real = NtcVoltage(322.0);
        }
        analysis def PeakHoldCurrentAnalysis {
            doc /* RL integration of a 0.6 Ohm / 0.3 mH coil at 24 V with 16 A peak, 8 A hold chopping. */
            subject ecu : MR_PLD_ECU;
            objective { doc /* Peak reached in < 0.3 ms; hold ripple within 7.5 .. 8.5 A. */ }
            return shuntPeak : Real = ShuntVoltage(16.0);
        }

        verification def VC_PeakHold {
            subject ecu : MR_PLD_ECU;
            objective { verify requirement : PeakHoldCurrent; }
        }
        verification def VC_DualSync {
            subject ecu : MR_PLD_ECU;
            objective { verify requirement : DualSyncRedundancy; verify requirement : CkpLossLimpHome; }
        }
        verification def VC_Immobilizer {
            subject ecu : MR_PLD_ECU;
            objective { verify requirement : ImmobilizerInterlock; }
        }
        verification def VC_Thermal {
            subject ecu : MR_PLD_ECU;
            objective { verify requirement : ThermalProtection; }
        }
        verification def VC_Smoke {
            subject ecu : MR_PLD_ECU;
            objective { verify requirement : SmokeLimitation; }
        }
        verification def VC_SensorDiag {
            subject ecu : MR_PLD_ECU;
            objective { verify requirement : SensorDiagnosticWindow; }
        }

        part def SimulationScenario {
            doc /* Stimulus + expected final state; executed by mrpld_sim.py. */
            attribute keyState : KeyState;
            attribute pedalPct : Real;
            attribute coolantC : Real;
            attribute boostBar : Real;
            attribute immoValid : Boolean;
            attribute ckpValid : Boolean;
            attribute cmpValid : Boolean;
            attribute bank1Short : Boolean;
            attribute canValid : Boolean;
            attribute expectedState : String;
        }
        part scn01_KeyOff : SimulationScenario { :>> keyState = KeyState::OFF; :>> pedalPct = 0.0; :>> coolantC = 20.0; :>> boostBar = 1.0; :>> immoValid = true; :>> ckpValid = true; :>> cmpValid = true; :>> bank1Short = false; :>> canValid = true; :>> expectedState = "ST_STANDBY"; }
        part scn02_IgnitionOn : SimulationScenario { :>> keyState = KeyState::IGN; :>> pedalPct = 0.0; :>> coolantC = 20.0; :>> boostBar = 1.0; :>> immoValid = true; :>> ckpValid = true; :>> cmpValid = true; :>> bank1Short = false; :>> canValid = true; :>> expectedState = "ST_READY"; }
        part scn03_ColdCrank : SimulationScenario { :>> keyState = KeyState::CRANK; :>> pedalPct = 20.0; :>> coolantC = -5.0; :>> boostBar = 1.0; :>> immoValid = true; :>> ckpValid = true; :>> cmpValid = true; :>> bank1Short = false; :>> canValid = true; :>> expectedState = "ST_CRANK_SYNC"; }
        part scn04_NormalRun : SimulationScenario { :>> keyState = KeyState::RUN; :>> pedalPct = 45.0; :>> coolantC = 85.0; :>> boostBar = 2.0; :>> immoValid = true; :>> ckpValid = true; :>> cmpValid = true; :>> bank1Short = false; :>> canValid = true; :>> expectedState = "ST_RUN_NORMAL"; }
        part scn05_FullLoad : SimulationScenario { :>> keyState = KeyState::RUN; :>> pedalPct = 100.0; :>> coolantC = 88.0; :>> boostBar = 3.2; :>> immoValid = true; :>> ckpValid = true; :>> cmpValid = true; :>> bank1Short = false; :>> canValid = true; :>> expectedState = "ST_RUN_NORMAL"; }
        part scn06_EngineBrake : SimulationScenario { :>> keyState = KeyState::BRAKE; :>> pedalPct = 0.0; :>> coolantC = 85.0; :>> boostBar = 1.0; :>> immoValid = true; :>> ckpValid = true; :>> cmpValid = true; :>> bank1Short = false; :>> canValid = true; :>> expectedState = "ST_ENGINE_BRAKE"; }
        part scn07_ImmoMismatch : SimulationScenario { :>> keyState = KeyState::CRANK; :>> pedalPct = 0.0; :>> coolantC = 20.0; :>> boostBar = 1.0; :>> immoValid = false; :>> ckpValid = true; :>> cmpValid = true; :>> bank1Short = false; :>> canValid = true; :>> expectedState = "ST_IMMO_LOCKED"; }
        part scn08_CkpLossLimp : SimulationScenario { :>> keyState = KeyState::RUN; :>> pedalPct = 80.0; :>> coolantC = 85.0; :>> boostBar = 2.0; :>> immoValid = true; :>> ckpValid = false; :>> cmpValid = true; :>> bank1Short = false; :>> canValid = true; :>> expectedState = "ST_LIMP_DERATE"; }
        part scn09_CmpLossRun : SimulationScenario { :>> keyState = KeyState::RUN; :>> pedalPct = 45.0; :>> coolantC = 85.0; :>> boostBar = 2.0; :>> immoValid = true; :>> ckpValid = true; :>> cmpValid = false; :>> bank1Short = false; :>> canValid = true; :>> expectedState = "ST_LIMP_DERATE"; }
        part scn10_TotalSyncLoss : SimulationScenario { :>> keyState = KeyState::RUN; :>> pedalPct = 45.0; :>> coolantC = 85.0; :>> boostBar = 2.0; :>> immoValid = true; :>> ckpValid = false; :>> cmpValid = false; :>> bank1Short = false; :>> canValid = true; :>> expectedState = "ST_FAULT_SHUTDOWN"; }
        part scn11_Overheat : SimulationScenario { :>> keyState = KeyState::RUN; :>> pedalPct = 80.0; :>> coolantC = 106.0; :>> boostBar = 2.4; :>> immoValid = true; :>> ckpValid = true; :>> cmpValid = true; :>> bank1Short = false; :>> canValid = true; :>> expectedState = "ST_LIMP_DERATE"; }
        part scn12_Bank1Short : SimulationScenario { :>> keyState = KeyState::RUN; :>> pedalPct = 50.0; :>> coolantC = 85.0; :>> boostBar = 2.0; :>> immoValid = true; :>> ckpValid = true; :>> cmpValid = true; :>> bank1Short = true; :>> canValid = true; :>> expectedState = "ST_LIMP_DERATE"; }
        part scn13_CanTimeout : SimulationScenario { :>> keyState = KeyState::RUN; :>> pedalPct = 50.0; :>> coolantC = 85.0; :>> boostBar = 2.0; :>> immoValid = true; :>> ckpValid = true; :>> cmpValid = true; :>> bank1Short = false; :>> canValid = false; :>> expectedState = "ST_LIMP_DERATE"; }
        part scn14_LowBoostSmoke : SimulationScenario { :>> keyState = KeyState::RUN; :>> pedalPct = 100.0; :>> coolantC = 85.0; :>> boostBar = 1.2; :>> immoValid = true; :>> ckpValid = true; :>> cmpValid = true; :>> bank1Short = false; :>> canValid = true; :>> expectedState = "ST_RUN_NORMAL"; }
    }

    // =================================================================================
    package Traceability {
        private import Requirements::*;
        private import InternalStructure::*;

        satisfy Requirements::mrPldSpecification::reqPwr by mrPld;   // realised by mrPld.pwrCom.regulator
        satisfy Requirements::mrPldSpecification::reqSync by mrPld;   // realised by mrPld.afe.vrComparators
        satisfy Requirements::mrPldSpecification::reqPeakHold by mrPld;   // realised by mrPld.injStage
        satisfy Requirements::mrPldSpecification::reqProt by mrPld;   // realised by mrPld.injStage.currentComparators
        satisfy Requirements::mrPldSpecification::reqSmoke by mrPld;   // realised by mrPld.core.mcu
        satisfy Requirements::mrPldSpecification::reqImmo by mrPld;   // realised by mrPld.core.eeprom
        satisfy Requirements::mrPldSpecification::reqDiag by mrPld;   // realised by mrPld.afe
        satisfy Requirements::mrPldSpecification::reqThermal by mrPld;   // realised by mrPld.drivers
        satisfy Requirements::mrPldSpecification::reqLimp by mrPld;   // realised by mrPld.core.mcu
        satisfy Requirements::mrPldSpecification::reqFiring by mrPld;   // realised by mrPld.core.mcu
        satisfy Requirements::mrPldSpecification::reqCan by mrPld;   // realised by mrPld.pwrCom.canPhy
        satisfy Requirements::mrPldSpecification::reqAdc by mrPld;   // realised by mrPld.core.mcu
    }

    // =================================================================================
    package Variants {
        private import HardwareStructure::*;
        variation part def EngineConfiguration {
            doc /* Same ECU hardware, harness decides V6 / V8. */
            variant part om501_V6 : OM501LA_EngineSystem {
                doc /* X2-46 / X2-37 unused. */
            }
            variant part om502_V8 : OM501LA_EngineSystem {
                doc /* Adds unit pumps G (cyl 7, X2-46) and H (cyl 8, X2-37). */
            }
        }
    }

    // =================================================================================
    package Views {
        private import StandardViewDefinitions::*;
        view bdd_HardwareArchitecture : GeneralView { expose HardwareStructure::*; }
        view ibd_EcuInternal : InterconnectionView { expose InternalStructure::mrPld::**; }
        view ibd_EngineHarness : InterconnectionView { expose InternalStructure::engineSystem::**; }
        view stm_OperatingModes : StateTransitionView { expose OperationalBehavior::MR_PLD_OperatingStates::**; }
        view stm_InjectionMicroCycle : StateTransitionView { expose OperationalBehavior::InjectionMicroCycle::**; }
        view sd_CrankAuthInjection : SequenceView { expose Interactions::SD_Crank_Auth_PeakHold_Injection::**; }
        view sd_CkpLimp : SequenceView { expose Interactions::SD_CkpLoss_LimpHome::**; }
        view req_Specification : GeneralView { expose Requirements::**; }
        view par_SensorChain : GeneralView { expose Parametrics::**; }
        view act_InjectionEvent : ActionFlowView { expose OperationalBehavior::InjectionEvent::**; }
    }
}
