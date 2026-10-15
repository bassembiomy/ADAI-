// =====================================================================
//  SysML v2 textual model — Mercedes-Benz MR-PLD ECU (A 541 446 53 40)
//  Engine: OM 501 LA.II/2-00 (V6, PLD unit-pump injection)
//  Views in the HTML page: BDD x3, IBD, STM + executable simulation
//  Note: pin numbers, thresholds and tooth patterns follow the
//  reverse-engineering document; verify against WIS before use.
// =====================================================================
package MR_PLD_Model {
    private import ScalarValues::*;
    private import ISQ::*;
    private import SI::*;

    // ------------------------------------------------------------ items
    package Items {
        item def TorqueRequest { attribute pedal : Real; attribute engineBrake : Boolean; }
        item def EngineStatus  { attribute rpm : Real; attribute ect : Real; attribute dtc : String[*]; }
        item def CrankPulse    { attribute toothIndex : Integer; }   // 36+1 pattern
        item def CamPulse      { attribute refTooth : Boolean; }     // 12+1 pattern
        item def AnalogSignal  { attribute volts : Real; }
        item def InjectionCmd  { attribute cylinder : Integer; attribute soiDeg : Real; attribute durationMs : Real; }
        item def SolenoidCurrent { attribute peakA : Real = 16.0; attribute holdA : Real = 8.0; }
        item def Electrical    { attribute volts : Real; }
        item def DiagRequest;
        item def KeyCode       { attribute code : String; }
    }

    // ------------------------------------------------------------ ports
    package Ports {
        private import Items::*;
        port def PowerPort      { out item supply : Electrical; }
        port def DigitalPort    { out item level : Electrical; }
        port def ImmoPort       { out item key : KeyCode; }
        port def CAN_Port {
            in  item rx : TorqueRequest;
            out item tx : EngineStatus;
        }
        port def KLinePort      { inout item diag : DiagRequest; }
        port def VRSensorPort   { out item pulse : CrankPulse; }
        port def CamSensorPort  { out item pulse : CamPulse; }
        port def AnalogPort     { out item value : AnalogSignal; }
        port def SolenoidPort   { in item drive : SolenoidCurrent; }

        // connectors modelled as port definitions with nested pin ports
        port def CabConnector16 {
            in  port KL30 : ~PowerPort;      // X1-5, X1-6
            in  port KL15 : ~DigitalPort;    // X1-15
            in  port KL50 : ~DigitalPort;    // X1-8
            port can      : ~CAN_Port;       // X1-1 (H), X1-2 (L)
            port kLine    : KLinePort;       // X1-13
        }
        port def EngConnector55 {
            in  port ckp     : ~VRSensorPort;   // X2-19 / X2-2
            in  port cmp     : ~CamSensorPort;  // X2-20 / X2-1
            in  port analog  : ~AnalogPort[8];  // X2-29,32,34,36,39,48,33 ...
            out port bank1   : ~SolenoidPort[3];// X2-16 + 54,53,47
            out port bank2   : ~SolenoidPort[3];// X2-9  + 45,44,38
            out port starter : PowerPort;       // X2-18
            out port pv      : PowerPort[2];    // X2-12/51, X2-52/50
            out port fan     : PowerPort[2];    // X2-41, X2-43
        }
    }

    // ------------------------------------------------------------ blocks (part defs)
    package Structure {
        private import Ports::*;

        part def VehicleBattery    { attribute nominal : Real = 24.0; port KL30 : PowerPort; }
        part def IgnitionSwitch    { port KL15 : DigitalPort; port KL50 : DigitalPort; port immo : ImmoPort; }
        part def FR_DriveController{ attribute pedal : Real; attribute engBrakeReq : Boolean; port can : CAN_Port; }
        part def DiagnosticTester  { attribute tool : String = "Star / XENTRY"; port kLine : ~KLinePort; }

        // ---- ECU internals
        part def PowerSupplyUnit   { attribute vOut : Real = 5.0; attribute regulator : String = "TLE4275/TLE4267"; action powerLatch; }
        part def MainMCU           { attribute chip : String = "SAK-C167CS-LM"; attribute adcChannels : Integer = 24; attribute capcomChannels : Integer = 32; }
        part def FlashMemory       { attribute chip : String = "AM29F400BB"; attribute sizeKB : Integer = 512; }
        part def ConfigEEPROM      { attribute chip : String = "93C86"; attribute sizeBytes : Integer = 2048; attribute codes : String = "1061 1047 1034 1026"; }
        part def CoProcessor       { attribute chip : String = "TEMIC 845AW"; }
        part def TimingLogic       { attribute chip : String = "TEMIC ULC (PLCC-44)"; }
        part def SensorConditioning{ attribute vrConditioner : String = "LM2903"; }
        part def CommInterface     { attribute canTransceiver : String = "B10011S + PCA82C250"; attribute kLineIC : String = "L9637D"; attribute canRate_kbps : Integer = 250; }
        part def MosfetSwitch      { attribute partNo : String; attribute vds : Real; attribute id : Real; }
        part def InjectionPowerStage {
            attribute iPeak : Real = 16.0;
            attribute iHold : Real = 8.0;
            attribute rShunt : Real = 0.033;
            part highSide : MosfetSwitch[2] { :>> partNo = "BUZ102SL"; :>> vds = 55.0; :>> id = 52.0; }
            part lowSide  : MosfetSwitch[8] { :>> partNo = "SUD25N06-45L"; :>> vds = 60.0; :>> id = 25.0; }
        }
        part def AuxDrivers;

        part def MR_PLD_ECU {
            attribute partNo : String = "A 541 446 53 40";
            attribute zgs : String = "001";
            port X1 : CabConnector16;
            port X2 : EngConnector55;

            part psu    : PowerSupplyUnit;
            part mcu    : MainMCU;
            part flash  : FlashMemory;
            part eeprom : ConfigEEPROM;
            part coproc : CoProcessor;
            part tlog   : TimingLogic;
            part sigc   : SensorConditioning;
            part comm   : CommInterface;
            part pstage : InjectionPowerStage;
            part aux    : AuxDrivers;

            // internal connections (IBD)
            connect X1.KL30 to psu;
            connect X1.can  to comm;
            connect X1.kLine to comm;
            connect comm to mcu;
            connect psu to mcu;
            connect mcu to flash;
            connect mcu to eeprom;
            connect mcu to coproc;
            connect X2.ckp to sigc;
            connect X2.cmp to sigc;
            connect X2.analog to sigc;
            connect sigc to mcu;
            connect mcu to tlog;
            connect tlog to pstage;
            connect pstage to X2.bank1;
            connect pstage to X2.bank2;
            connect mcu to aux;
            connect aux to X2.starter;
            connect aux to X2.pv;
            connect aux to X2.fan;

            exhibit state operatingModes : Behavior::OperatingModes;
        }

        // ---- engine side
        part def CKP_Sensor         { attribute coilOhm : Real = 1200.0; attribute pattern : String = "36+1"; port out_ : VRSensorPort; }
        part def CMP_Sensor         { attribute pattern : String = "12+1"; port out_ : CamSensorPort; }
        part def AnalogSensor       { attribute id : String; port out_ : AnalogPort; }
        part def UnitPump           { attribute coilOhm : Real = 0.6; attribute bank : Integer; port drive : SolenoidPort; }
        part def StarterMotor       { port cmd : ~PowerPort; }
        part def ProportionalValve  { attribute coilOhm : Real = 40.0; port cmd : ~PowerPort; }
        part def FanClutch          { port cmd : ~PowerPort; }

        part def OM501LA_Engine {
            attribute cylinders : Integer = 6;
            attribute firingOrder : String = "1-4-2-5-3-6";
            part ckp : CKP_Sensor;
            part cmp : CMP_Sensor;
            part sensors : AnalogSensor[8];
            part pump : UnitPump[6];
            part starter : StarterMotor;
            part pv : ProportionalValve[2];
            part fan : FanClutch;
            port harness : ~EngConnector55;
        }

        // ---- system context (top-level BDD / IBD)
        part def Actros_EngineMgmt_System {
            part battery  : VehicleBattery;
            part ignition : IgnitionSwitch;
            part fr       : FR_DriveController;
            part mr       : MR_PLD_ECU;
            part engine   : OM501LA_Engine;
            ref  tester   : DiagnosticTester[0..1];

            connect battery.KL30  to mr.X1.KL30;
            connect ignition.KL15 to mr.X1.KL15;
            connect ignition.KL50 to mr.X1.KL50;
            interface fr.can to mr.X1.can;
            connect tester.kLine  to mr.X1.kLine;
            connect mr.X2 to engine.harness;

            flow of Items::TorqueRequest from fr.can.rx to mr.X1.can;
            flow of Items::CrankPulse    from engine.ckp.out_.pulse to mr.X2.ckp;
            flow of Items::SolenoidCurrent from mr.X2.bank1 to engine.pump;
        }
    }

    // ------------------------------------------------------------ behaviour
    package Behavior {
        attribute def Rpm :> Real;

        attribute kl15 : Boolean;
        attribute kl50 : Boolean;
        attribute keyValid : Boolean;
        attribute rpm : Real;
        attribute synced : Boolean;
        attribute fault : Boolean;
        attribute pedal : Real;
        attribute ebReq : Boolean;

        state def OperatingModes {
            entry; then Off;

            state Off;
            transition off_init first Off accept when kl15 then Powered;

            state Powered {
                entry; then Init_SelfTest;
                state Init_SelfTest { entry action latchAndReadEEPROM; }
                transition init_immo first Init_SelfTest accept after 0.7 [s] then ImmoCheck;

                state ImmoCheck;
                transition immo_ready first ImmoCheck if keyValid then Standby;
                transition immo_block first ImmoCheck if not keyValid then StartInhibit;

                state StartInhibit { entry action storeImmoDTC; }
                transition block_immo first StartInhibit accept when keyValid then ImmoCheck;

                state Standby;
                transition ready_sync first Standby accept when kl50 if rpm == 0.0 then Crank_SyncSearch;

                state Crank_SyncSearch { entry action starterOn; }
                transition sync_ready first Crank_SyncSearch accept when not kl50 then Standby;
                transition sync_sf    first Crank_SyncSearch accept when synced then Crank_StartFuel;

                state Crank_StartFuel { do action injectStartQuantity; }
                transition sf_ready first Crank_StartFuel accept after 4 [s] then Standby;
            }
            transition pow_after first Powered accept when not kl15 then AfterRun;
            transition sf_run first Powered::Crank_StartFuel accept when rpm > 450.0 then Running;

            state Running {
                do action injectPLD;
                entry; then Idle;
                state Idle;
                state Drive;
                state EngineBrake { entry action pvOn; exit action pvOff; }
                state LimpHome   { do action derate; }

                transition idle_drive  first Idle  accept when pedal > 0.0 then Drive;
                transition drive_idle  first Drive accept when pedal == 0.0 then Idle;
                transition drive_brake first Drive accept when ebReq if rpm > 900.0 then EngineBrake;
                transition brake_drive first EngineBrake accept when not ebReq then Drive;
                transition idle_limp   first Idle  accept when fault then LimpHome;
                transition drive_limp  first Drive accept when fault then LimpHome;
                transition limp_idle   first LimpHome accept when not fault then Idle;
            }
            transition run_stop first Running accept when not kl15 or not synced then Stopping;

            state Stopping { do action cutInjection; }
            transition stop_ready first Stopping accept when rpm == 0.0 and kl15 then Powered::Standby;
            transition stop_after first Stopping accept when rpm == 0.0 and not kl15 then AfterRun;

            state AfterRun { entry action storeDTC; exit action releaseLatch; }
            transition after_off first AfterRun accept after 1.6 [s] then Off;
        }
    }
}
