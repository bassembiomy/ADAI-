#!/usr/bin/env python3
"""Map models/mr_pld/MR_PLD_Model.sysml onto a flat ADIA project (step 1 of 2).

Step 2, `npx tsx scripts/build_mr_pld_adia.ts`, loads that flat project through
the app's own SysML loader, lays out the BDD/IBD diagrams and writes the
native (format 5) MR_PLD_ECU.adia that the app opens without an upgrade.

The SysML v2 textual model (Mercedes-Benz MR-PLD ECU, OM 501 LA) is mapped
onto the ADIA project schema by hand-maintained tables below:

* item / port / part defs      -> BDD blocks (+ composition relationships)
* part usages + connect/flow   -> IBD parts and connectors (two contexts:
                                  Actros_EngineMgmt_System and MR_PLD_ECU)
* state def OperatingModes     -> executable hierarchical state machine
* simulation inputs / outputs  -> variables + HMI dashboard

SysML v2 change events ("accept when x") become level guards, time events
("accept after 0.7 [s]") become `after` transitions in ticks of TICK_MS, and
the opaque entry/do/exit actions drive the output variables listed in VARS.

Run:  python3 scripts/generate_mr_pld_adia.py && npx tsx scripts/build_mr_pld_adia.ts
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "models" / "mr_pld" / "MR_PLD_ECU.flat.json"
TICK_MS = 10

# --------------------------------------------------------------------- BDD
blocks = []
relationships = []


def prop(owner, name, typ, default=None, unit=None):
    p = {"id": f"{owner}.{name}", "name": name, "type": typ, "kind": "value"}
    if default is not None:
        p["defaultValue"] = str(default)
    if unit:
        p["unit"] = unit
    return p


PORT_DEF_NAMES = {"PowerPort", "DigitalPort", "ImmoPort", "CAN_Port", "KLinePort", "VRSensorPort",
                  "CamSensorPort", "AnalogPort", "SolenoidPort", "CabConnector16", "EngConnector55"}
ITEM_NAMES = {"TorqueRequest", "EngineStatus", "CrankPulse", "CamPulse", "AnalogSignal", "InjectionCmd",
              "SolenoidCurrent", "Electrical", "DiagRequest", "KeyCode"}


def port(owner, name, typ, direction, multiplicity=None):
    """Standard (UML) port typed by the BDD block of its port/item def; '~' marks a conjugated port."""
    conj = typ.startswith("~")
    base = typ.lstrip("~")
    type_id = f"pdef_{base}" if base in PORT_DEF_NAMES else f"item_{base}" if base in ITEM_NAMES else base
    p = {"id": f"{owner}.{name}", "name": name, "type": type_id, "kind": "standard", "direction": direction}
    if conj:
        p["isConjugated"] = True
    if multiplicity:
        p["multiplicity"] = multiplicity
    return p


def block(bid, name, x, y, *, stereotype="block", props=(), ports=(), ops=(), constraints=(), w=230, h=None, ns=None):
    h = h or max(110, 60 + 18 * (len(props) + len(ports)))
    blocks.append({
        "id": bid, "name": name, "stereotype": stereotype,
        "x": x, "y": y, "width": w, "height": h,
        "properties": list(props), "operations": list(ops), "constraints": list(constraints),
        "classes": [], "ports": list(ports), "layerId": "root",
        "namespace": ns or ["MR_PLD_Model"],
    })


def compose(whole, part, role, mult="1"):
    relationships.append({
        "id": f"comp_{whole}_{role}", "sourceId": whole, "targetId": part, "type": "composition",
        "label": role, "targetRole": role, "sourceMultiplicity": "1", "targetMultiplicity": mult,
        "sourceAggregation": "composite",
    })


def associate(whole, part, role, mult="0..1"):
    relationships.append({
        "id": f"ref_{whole}_{role}", "sourceId": whole, "targetId": part, "type": "association",
        "label": role, "targetRole": role, "sourceMultiplicity": "1", "targetMultiplicity": mult,
    })


ITEMS = ["MR_PLD_Model", "Items"]
PORTS = ["MR_PLD_Model", "Ports"]
STRUCT = ["MR_PLD_Model", "Structure"]

# ---- Items package (item defs) - row at the top
items = [
    ("TorqueRequest", [("pedal", "Real"), ("engineBrake", "Boolean")]),
    ("EngineStatus", [("rpm", "Real"), ("ect", "Real"), ("dtc", "String[*]")]),
    ("CrankPulse", [("toothIndex", "Integer")]),
    ("CamPulse", [("refTooth", "Boolean")]),
    ("AnalogSignal", [("volts", "Real")]),
    ("InjectionCmd", [("cylinder", "Integer"), ("soiDeg", "Real"), ("durationMs", "Real")]),
    ("SolenoidCurrent", [("peakA", "Real", 16.0), ("holdA", "Real", 8.0)]),
    ("Electrical", [("volts", "Real")]),
    ("DiagRequest", []),
    ("KeyCode", [("code", "String")]),
]
for i, (name, attrs) in enumerate(items):
    bid = f"item_{name}"
    block(bid, name, -1400 + i * 260, -1500, w=220, ns=ITEMS,
          props=[prop(bid, a[0], a[1], a[2] if len(a) > 2 else None) for a in attrs])

# ---- Ports package (port defs) - second row
port_defs = [
    ("PowerPort", [("supply", "Electrical", "out")]),
    ("DigitalPort", [("level", "Electrical", "out")]),
    ("ImmoPort", [("key", "KeyCode", "out")]),
    ("CAN_Port", [("rx", "TorqueRequest", "in"), ("tx", "EngineStatus", "out")]),
    ("KLinePort", [("diag", "DiagRequest", "inout")]),
    ("VRSensorPort", [("pulse", "CrankPulse", "out")]),
    ("CamSensorPort", [("pulse", "CamPulse", "out")]),
    ("AnalogPort", [("value", "AnalogSignal", "out")]),
    ("SolenoidPort", [("drive", "SolenoidCurrent", "in")]),
]
for i, (name, flows) in enumerate(port_defs):
    bid = f"pdef_{name}"
    block(bid, name, -1400 + i * 260, -1250, stereotype="interface", w=220, ns=PORTS,
          ports=[port(bid, f, t, d) for f, t, d in flows])

# Connector port defs (nested pin ports) - documented as interfaces with their pin map
block("pdef_CabConnector16", "CabConnector16", 1000, -1250, stereotype="interface", w=260, ns=PORTS,
      ports=[
          port("pdef_CabConnector16", "KL30", "~PowerPort", "in"),      # X1-5, X1-6
          port("pdef_CabConnector16", "KL15", "~DigitalPort", "in"),    # X1-15
          port("pdef_CabConnector16", "KL50", "~DigitalPort", "in"),    # X1-8
          port("pdef_CabConnector16", "can", "~CAN_Port", "inout"),     # X1-1 (H), X1-2 (L)
          port("pdef_CabConnector16", "kLine", "KLinePort", "inout"),   # X1-13
      ],
      constraints=["X1-5/6 KL30", "X1-15 KL15", "X1-8 KL50", "X1-1 CAN-H, X1-2 CAN-L", "X1-13 K-Line"])
block("pdef_EngConnector55", "EngConnector55", 1300, -1250, stereotype="interface", w=260, ns=PORTS,
      ports=[
          port("pdef_EngConnector55", "ckp", "~VRSensorPort", "in"),
          port("pdef_EngConnector55", "cmp", "~CamSensorPort", "in"),
          port("pdef_EngConnector55", "analog", "~AnalogPort", "in", multiplicity="8"),
          port("pdef_EngConnector55", "bank1", "~SolenoidPort", "out", multiplicity="3"),
          port("pdef_EngConnector55", "bank2", "~SolenoidPort", "out", multiplicity="3"),
          port("pdef_EngConnector55", "starter", "PowerPort", "out"),
          port("pdef_EngConnector55", "pv", "PowerPort", "out", multiplicity="2"),
          port("pdef_EngConnector55", "fan", "PowerPort", "out", multiplicity="2"),
      ],
      constraints=["X2-19/2 CKP", "X2-20/1 CMP", "X2-29,32,34,36,39,48,33 analog",
                   "X2-16 + 54,53,47 bank1", "X2-9 + 45,44,38 bank2", "X2-18 starter",
                   "X2-12/51, X2-52/50 PV", "X2-41, X2-43 fan"])

# ---- Structure: system context (BDD 1)
SYS = "blk_System"
block(SYS, "Actros_EngineMgmt_System", 0, -900, w=300, ns=STRUCT)
block("blk_Battery", "VehicleBattery", -900, -650, ns=STRUCT,
      props=[prop("blk_Battery", "nominal", "Real", 24.0, "V")],
      ports=[port("blk_Battery", "KL30", "PowerPort", "out")])
block("blk_Ignition", "IgnitionSwitch", -620, -650, ns=STRUCT,
      ports=[port("blk_Ignition", "KL15", "DigitalPort", "out"),
             port("blk_Ignition", "KL50", "DigitalPort", "out"),
             port("blk_Ignition", "immo", "ImmoPort", "out")])
block("blk_FR", "FR_DriveController", -340, -650, ns=STRUCT,
      props=[prop("blk_FR", "pedal", "Real"), prop("blk_FR", "engBrakeReq", "Boolean")],
      ports=[port("blk_FR", "can", "CAN_Port", "inout")])

ECU = "blk_ECU"
ecu_ports = [
    port(ECU, "X1_KL30", "~PowerPort", "in"),
    port(ECU, "X1_KL15", "~DigitalPort", "in"),
    port(ECU, "X1_KL50", "~DigitalPort", "in"),
    port(ECU, "X1_can", "~CAN_Port", "inout"),
    port(ECU, "X1_kLine", "KLinePort", "inout"),
    port(ECU, "X2_ckp", "~VRSensorPort", "in"),
    port(ECU, "X2_cmp", "~CamSensorPort", "in"),
    port(ECU, "X2_analog", "~AnalogPort", "in", multiplicity="8"),
    port(ECU, "X2_bank1", "~SolenoidPort", "out", multiplicity="3"),
    port(ECU, "X2_bank2", "~SolenoidPort", "out", multiplicity="3"),
    port(ECU, "X2_starter", "PowerPort", "out"),
    port(ECU, "X2_pv", "PowerPort", "out", multiplicity="2"),
    port(ECU, "X2_fan", "PowerPort", "out", multiplicity="2"),
]
block(ECU, "MR_PLD_ECU", 0, -650, w=300, ns=STRUCT,
      props=[prop(ECU, "partNo", "String", "A 541 446 53 40"), prop(ECU, "zgs", "String", "001")],
      ports=ecu_ports,
      constraints=["X1 : CabConnector16 (cab, 16-pin)", "X2 : EngConnector55 (engine, 55-pin)"])

ENG = "blk_Engine"
eng_ports = [
    port(ENG, "harness_ckp", "VRSensorPort", "out"),
    port(ENG, "harness_cmp", "CamSensorPort", "out"),
    port(ENG, "harness_analog", "AnalogPort", "out", multiplicity="8"),
    port(ENG, "harness_bank1", "SolenoidPort", "in", multiplicity="3"),
    port(ENG, "harness_bank2", "SolenoidPort", "in", multiplicity="3"),
    port(ENG, "harness_starter", "~PowerPort", "in"),
    port(ENG, "harness_pv", "~PowerPort", "in", multiplicity="2"),
    port(ENG, "harness_fan", "~PowerPort", "in", multiplicity="2"),
]
block(ENG, "OM501LA_Engine", 420, -650, w=280, ns=STRUCT,
      props=[prop(ENG, "cylinders", "Integer", 6), prop(ENG, "firingOrder", "String", "1-4-2-5-3-6")],
      ports=eng_ports, constraints=["harness : ~EngConnector55"])
block("blk_Tester", "DiagnosticTester", 780, -650, ns=STRUCT,
      props=[prop("blk_Tester", "tool", "String", "Star / XENTRY")],
      ports=[port("blk_Tester", "kLine", "~KLinePort", "inout")])

compose(SYS, "blk_Battery", "battery")
compose(SYS, "blk_Ignition", "ignition")
compose(SYS, "blk_FR", "fr")
compose(SYS, ECU, "mr")
compose(SYS, ENG, "engine")
associate(SYS, "blk_Tester", "tester", "0..1")

# ---- Structure: ECU internals (BDD 2)
ecu_parts = [
    ("psu", "blk_PSU", "PowerSupplyUnit",
     [("vOut", "Real", 5.0, "V"), ("regulator", "String", "TLE4275/TLE4267")],
     [("KL30_in", "~PowerPort", "in"), ("vcc5", "PowerPort", "out")], ["powerLatch()"]),
    ("mcu", "blk_MCU", "MainMCU",
     [("chip", "String", "SAK-C167CS-LM"), ("adcChannels", "Integer", 24), ("capcomChannels", "Integer", 32)],
     [("vcc", "~PowerPort", "in"), ("commBus", "CAN_Port", "inout"), ("extBus", "DataBus", "inout"),
      ("spi", "DataBus", "inout"), ("coprocLink", "DataBus", "inout"), ("sensorIn", "~AnalogPort", "in"),
      ("timingOut", "InjectionCmd", "out"), ("auxOut", "DigitalPort", "out")], []),
    ("flash", "blk_Flash", "FlashMemory",
     [("chip", "String", "AM29F400BB"), ("sizeKB", "Integer", 512, "KB")], [("bus", "DataBus", "inout")], []),
    ("eeprom", "blk_EEPROM", "ConfigEEPROM",
     [("chip", "String", "93C86"), ("sizeBytes", "Integer", 2048, "B"), ("codes", "String", "1061 1047 1034 1026")],
     [("spi", "DataBus", "inout")], []),
    ("coproc", "blk_CoProc", "CoProcessor", [("chip", "String", "TEMIC 845AW")], [("link", "DataBus", "inout")], []),
    ("tlog", "blk_TLog", "TimingLogic", [("chip", "String", "TEMIC ULC (PLCC-44)")],
     [("cmdIn", "InjectionCmd", "in"), ("gateOut", "DigitalPort", "out")], []),
    ("sigc", "blk_SigC", "SensorConditioning", [("vrConditioner", "String", "LM2903")],
     [("ckpIn", "~VRSensorPort", "in"), ("cmpIn", "~CamSensorPort", "in"), ("analogIn", "~AnalogPort", "in"),
      ("toMcu", "AnalogPort", "out")], []),
    ("comm", "blk_Comm", "CommInterface",
     [("canTransceiver", "String", "B10011S + PCA82C250"), ("kLineIC", "String", "L9637D"),
      ("canRate_kbps", "Integer", 250, "kbit/s")],
     [("can", "~CAN_Port", "inout"), ("kLine", "KLinePort", "inout"), ("mcuBus", "~CAN_Port", "inout")], []),
    ("pstage", "blk_PStage", "InjectionPowerStage",
     [("iPeak", "Real", 16.0, "A"), ("iHold", "Real", 8.0, "A"), ("rShunt", "Real", 0.033, "Ohm")],
     [("gateIn", "~DigitalPort", "in"), ("bank1", "~SolenoidPort", "out"), ("bank2", "~SolenoidPort", "out")], []),
    ("aux", "blk_Aux", "AuxDrivers", [],
     [("cmdIn", "~DigitalPort", "in"), ("starter", "PowerPort", "out"), ("pv", "PowerPort", "out"),
      ("fan", "PowerPort", "out")], []),
]
for i, (role, bid, name, attrs, prts, ops) in enumerate(ecu_parts):
    col, row = i % 5, i // 5
    block(bid, name, -900 + col * 300, -250 + row * 330, ns=STRUCT,
          props=[prop(bid, *a) for a in attrs],
          ports=[port(bid, *p) for p in prts], ops=ops)
    compose(ECU, bid, role)
block("blk_Mosfet", "MosfetSwitch", 600, 80, ns=STRUCT,
      props=[prop("blk_Mosfet", "partNo", "String"), prop("blk_Mosfet", "vds", "Real", unit="V"),
             prop("blk_Mosfet", "id", "Real", unit="A")])
compose("blk_PStage", "blk_Mosfet", "highSide", "2")
compose("blk_PStage", "blk_Mosfet", "lowSide", "8")

# ---- Structure: engine side (BDD 3)
eng_parts = [
    ("ckp", "blk_CKP", "CKP_Sensor", [("coilOhm", "Real", 1200.0, "Ohm"), ("pattern", "String", "36+1")],
     [("out_", "VRSensorPort", "out")], "1"),
    ("cmp", "blk_CMP", "CMP_Sensor", [("pattern", "String", "12+1")], [("out_", "CamSensorPort", "out")], "1"),
    ("sensors", "blk_Analog", "AnalogSensor", [("id", "String")], [("out_", "AnalogPort", "out")], "8"),
    ("pump", "blk_Pump", "UnitPump", [("coilOhm", "Real", 0.6, "Ohm"), ("bank", "Integer")],
     [("drive", "SolenoidPort", "in")], "6"),
    ("starter", "blk_Starter", "StarterMotor", [], [("cmd", "~PowerPort", "in")], "1"),
    ("pv", "blk_PV", "ProportionalValve", [("coilOhm", "Real", 40.0, "Ohm")], [("cmd", "~PowerPort", "in")], "2"),
    ("fan", "blk_Fan", "FanClutch", [], [("cmd", "~PowerPort", "in")], "1"),
]
for i, (role, bid, name, attrs, prts, mult) in enumerate(eng_parts):
    block(bid, name, -900 + i * 280, 600, ns=STRUCT,
          props=[prop(bid, *a) for a in attrs], ports=[port(bid, *p) for p in prts])
    compose(ENG, bid, role, mult)

# --------------------------------------------------------------------- IBD
parts = []
connectors = []


def part(pid, name, context, type_id, x, y, mult="1", w=200, h=120):
    parts.append({"id": pid, "name": name, "blockId": context, "typeId": type_id,
                  "x": x, "y": y, "width": w, "height": h, "multiplicity": mult})


def connect(cid, sp, sport, tp, tport, flow=None, label=None, kind=None):
    c = {"id": cid, "sourcePartId": sp, "sourcePortId": sport, "targetPartId": tp, "targetPortId": tport}
    if flow:
        c["itemFlow"] = flow
    if label:
        c["label"] = label
    if kind:
        c["kind"] = kind
    connectors.append(c)


# IBD 1: Actros_EngineMgmt_System
part("p_battery", "battery", SYS, "blk_Battery", 200, 100)
part("p_ignition", "ignition", SYS, "blk_Ignition", 200, 300)
part("p_fr", "fr", SYS, "blk_FR", 200, 500)
part("p_tester", "tester", SYS, "blk_Tester", 200, 700, mult="0..1")
part("p_mr", "mr", SYS, ECU, 600, 160, w=280, h=600)
part("p_engine", "engine", SYS, ENG, 1080, 160, w=280, h=600)

connect("c_kl30", "p_battery", "blk_Battery.KL30", "p_mr", "blk_ECU.X1_KL30", flow="Electrical")
connect("c_kl15", "p_ignition", "blk_Ignition.KL15", "p_mr", "blk_ECU.X1_KL15", flow="Electrical")
connect("c_kl50", "p_ignition", "blk_Ignition.KL50", "p_mr", "blk_ECU.X1_KL50", flow="Electrical")
connect("c_can", "p_fr", "blk_FR.can", "p_mr", "blk_ECU.X1_can", flow="TorqueRequest", label="interface CAN 250 kbit/s")
connect("c_kline", "p_tester", "blk_Tester.kLine", "p_mr", "blk_ECU.X1_kLine", flow="DiagRequest")
connect("c_x2_ckp", "p_engine", "blk_Engine.harness_ckp", "p_mr", "blk_ECU.X2_ckp", flow="CrankPulse")
connect("c_x2_cmp", "p_engine", "blk_Engine.harness_cmp", "p_mr", "blk_ECU.X2_cmp", flow="CamPulse")
connect("c_x2_analog", "p_engine", "blk_Engine.harness_analog", "p_mr", "blk_ECU.X2_analog", flow="AnalogSignal")
connect("c_x2_bank1", "p_mr", "blk_ECU.X2_bank1", "p_engine", "blk_Engine.harness_bank1", flow="SolenoidCurrent")
connect("c_x2_bank2", "p_mr", "blk_ECU.X2_bank2", "p_engine", "blk_Engine.harness_bank2", flow="SolenoidCurrent")
connect("c_x2_starter", "p_mr", "blk_ECU.X2_starter", "p_engine", "blk_Engine.harness_starter", flow="Electrical")
connect("c_x2_pv", "p_mr", "blk_ECU.X2_pv", "p_engine", "blk_Engine.harness_pv", flow="Electrical")
connect("c_x2_fan", "p_mr", "blk_ECU.X2_fan", "p_engine", "blk_Engine.harness_fan", flow="Electrical")

# IBD 2: MR_PLD_ECU internals (delegations use the ECU block itself as the boundary owner)
lay = {"comm": (240, 100), "psu": (240, 320), "sigc": (240, 540), "mcu": (580, 260), "tlog": (580, 540),
       "aux": (580, 760), "flash": (920, 100), "eeprom": (920, 280), "coproc": (920, 460), "pstage": (920, 640)}
for role, bid, *_ in ecu_parts:
    x, y = lay[role]
    part(f"p_{role}", role, ECU, bid, x, y, h=200 if role == "mcu" else 120)

D = "delegation"
connect("c_i_kl30", ECU, "blk_ECU.X1_KL30", "p_psu", "blk_PSU.KL30_in", flow="Electrical", kind=D)
connect("c_i_can", ECU, "blk_ECU.X1_can", "p_comm", "blk_Comm.can", flow="TorqueRequest", kind=D)
connect("c_i_kline", ECU, "blk_ECU.X1_kLine", "p_comm", "blk_Comm.kLine", flow="DiagRequest", kind=D)
connect("c_i_comm_mcu", "p_comm", "blk_Comm.mcuBus", "p_mcu", "blk_MCU.commBus")
connect("c_i_psu_mcu", "p_psu", "blk_PSU.vcc5", "p_mcu", "blk_MCU.vcc", flow="Electrical")
connect("c_i_mcu_flash", "p_mcu", "blk_MCU.extBus", "p_flash", "blk_Flash.bus")
connect("c_i_mcu_eeprom", "p_mcu", "blk_MCU.spi", "p_eeprom", "blk_EEPROM.spi")
connect("c_i_mcu_coproc", "p_mcu", "blk_MCU.coprocLink", "p_coproc", "blk_CoProc.link")
connect("c_i_ckp", ECU, "blk_ECU.X2_ckp", "p_sigc", "blk_SigC.ckpIn", flow="CrankPulse", kind=D)
connect("c_i_cmp", ECU, "blk_ECU.X2_cmp", "p_sigc", "blk_SigC.cmpIn", flow="CamPulse", kind=D)
connect("c_i_analog", ECU, "blk_ECU.X2_analog", "p_sigc", "blk_SigC.analogIn", flow="AnalogSignal", kind=D)
connect("c_i_sigc_mcu", "p_sigc", "blk_SigC.toMcu", "p_mcu", "blk_MCU.sensorIn", flow="AnalogSignal")
connect("c_i_mcu_tlog", "p_mcu", "blk_MCU.timingOut", "p_tlog", "blk_TLog.cmdIn", flow="InjectionCmd")
connect("c_i_tlog_ps", "p_tlog", "blk_TLog.gateOut", "p_pstage", "blk_PStage.gateIn")
connect("c_i_bank1", "p_pstage", "blk_PStage.bank1", ECU, "blk_ECU.X2_bank1", flow="SolenoidCurrent", kind=D)
connect("c_i_bank2", "p_pstage", "blk_PStage.bank2", ECU, "blk_ECU.X2_bank2", flow="SolenoidCurrent", kind=D)
connect("c_i_mcu_aux", "p_mcu", "blk_MCU.auxOut", "p_aux", "blk_Aux.cmdIn")
connect("c_i_starter", "p_aux", "blk_Aux.starter", ECU, "blk_ECU.X2_starter", flow="Electrical", kind=D)
connect("c_i_pv", "p_aux", "blk_Aux.pv", ECU, "blk_ECU.X2_pv", flow="Electrical", kind=D)
connect("c_i_fan", "p_aux", "blk_Aux.fan", ECU, "blk_ECU.X2_fan", flow="Electrical", kind=D)

# IBD 3: engine parts and power-stage switches (structure only, no connectors in the source)
for i, (role, bid, _n, _a, _p, mult) in enumerate(eng_parts):
    part(f"p_eng_{role}", role, ENG, bid, 200 + (i % 4) * 260, 100 + (i // 4) * 220, mult=mult)
part("p_highSide", "highSide", "blk_PStage", "blk_Mosfet", 60, 60, mult="2")
part("p_lowSide", "lowSide", "blk_PStage", "blk_Mosfet", 320, 60, mult="8")

# --------------------------------------------------------------- variables
VARS = [
    # inputs (operator / sensor side)
    ("kl15", "bool", "false"), ("kl50", "bool", "false"), ("keyValid", "bool", "false"),
    ("synced", "bool", "false"), ("fault", "bool", "false"), ("ebReq", "bool", "false"),
    ("rpm", "double", "0"), ("pedal", "double", "0"),
    # outputs driven by the opaque SysML actions
    ("powerLatch", "bool", "false"),   # latchAndReadEEPROM / releaseLatch
    ("starter", "bool", "false"),      # starterOn
    ("injMode", "int", "0"),           # 0 = cutInjection, 1 = injectStartQuantity, 2 = injectPLD
    ("pv", "bool", "false"),           # pvOn / pvOff  (engine brake proportional valves)
    ("derate", "bool", "false"),       # derate (limp home)
    ("dtcImmo", "bool", "false"),      # storeImmoDTC
    ("dtcStored", "bool", "false"),    # storeDTC
]
variables = []
for name, typ, init in VARS:
    cur = (init == "true") if typ == "bool" else float(init) if typ == "double" else int(init)
    variables.append({"id": f"v_{name}", "name": name, "type": typ, "initialValue": init,
                      "currentValue": cur, "visibleInScope": True, "overflowPolicy": "saturate"})

# ------------------------------------------------------------ state machine
states, transitions = [], []
COLORS = {"top": "#6c9ac6", "pow": "#f59e0b", "run": "#22c55e", "warn": "#ef4444", "stop": "#a855f7"}
prio = {"n": 0}


def state(sid, name, layer, x, y, *, w=170, h=100, entry="", during="", exit_="", auto=False, color="top"):
    prio["n"] += 10
    states.append({
        "id": sid, "name": name, "x": x, "y": y, "width": w, "height": h,
        "entry": entry, "during": during, "exit": exit_, "isActive": False, "color": COLORS[color],
        "parentId": layer, "children": [], "priority": prio["n"], "isParallel": False, "regionId": None,
        "autostart": auto, "historyType": "none", "internalTransitions": "",
    })


def tr(tid, src, dst, cond="", after_s=None, action="", order=0):
    ticks = None if after_s is None else round(after_s * 1000 / TICK_MS)
    ttype = "condition" if ticks is None else ("after" if not cond else "and")
    transitions.append({
        "id": tid, "sourceId": src, "targetId": dst, "condition": cond, "action": action,
        "afterTicks": ticks, "type": ttype, "hasControlPoint": False, "order": order, "isInternal": False,
    })


# root region
state("st_Off", "Off", "root", 0, 0, auto=True)
state("st_Powered", "Powered", "root", 320, -40, w=240, h=180, color="pow", exit_="starter=false;")
state("st_Running", "Running", "root", 760, -40, w=240, h=180, color="run", entry="starter=false;",
      during="injMode=2;")
state("st_Stopping", "Stopping", "root", 760, 320, color="stop", during="injMode=0;")
state("st_AfterRun", "AfterRun", "root", 320, 320, color="stop", entry="dtcStored=true;", exit_="powerLatch=false;")
# Powered region
state("st_Init_SelfTest", "Init_SelfTest", "lay_Powered", 0, 0, entry="powerLatch=true;", auto=True, color="pow")
state("st_ImmoCheck", "ImmoCheck", "lay_Powered", 280, 0, color="pow")
state("st_StartInhibit", "StartInhibit", "lay_Powered", 280, 260, entry="dtcImmo=true;", color="warn")
state("st_Standby", "Standby", "lay_Powered", 560, 0, entry="starter=false;injMode=0;", color="pow")
state("st_Crank_SyncSearch", "Crank_SyncSearch", "lay_Powered", 560, 260, entry="starter=true;", color="pow")
state("st_Crank_StartFuel", "Crank_StartFuel", "lay_Powered", 840, 260, during="injMode=1;",
      exit_="injMode=0;", color="pow")
# Running region
state("st_Idle", "Idle", "lay_Running", 0, 0, auto=True, color="run")
state("st_Drive", "Drive", "lay_Running", 300, 0, color="run")
state("st_EngineBrake", "EngineBrake", "lay_Running", 600, 0, entry="pv=true;", exit_="pv=false;", color="run")
state("st_LimpHome", "LimpHome", "lay_Running", 300, 260, during="derate=true;", exit_="derate=false;",
      color="warn")

# top-level transitions
tr("off_init", "st_Off", "st_Powered", "kl15==true")
tr("pow_after", "st_Powered", "st_AfterRun", "kl15==false")
tr("sf_run", "st_Crank_StartFuel", "st_Running", "rpm>450", order=0)
tr("run_stop", "st_Running", "st_Stopping", "kl15==false || synced==false")
tr("stop_ready", "st_Stopping", "st_Standby", "rpm==0 && kl15==true", order=0)
tr("stop_after", "st_Stopping", "st_AfterRun", "rpm==0 && kl15==false", order=1)
tr("after_off", "st_AfterRun", "st_Off", after_s=1.6)
# Powered
tr("init_immo", "st_Init_SelfTest", "st_ImmoCheck", after_s=0.7)
tr("immo_ready", "st_ImmoCheck", "st_Standby", "keyValid==true", order=0)
tr("immo_block", "st_ImmoCheck", "st_StartInhibit", "keyValid==false", order=1)
tr("block_immo", "st_StartInhibit", "st_ImmoCheck", "keyValid==true")
tr("ready_sync", "st_Standby", "st_Crank_SyncSearch", "kl50==true && rpm==0")
tr("sync_ready", "st_Crank_SyncSearch", "st_Standby", "kl50==false", order=0)
tr("sync_sf", "st_Crank_SyncSearch", "st_Crank_StartFuel", "synced==true", order=1)
tr("sf_ready", "st_Crank_StartFuel", "st_Standby", after_s=4, order=1)
# Running
tr("idle_limp", "st_Idle", "st_LimpHome", "fault==true", order=0)
tr("idle_drive", "st_Idle", "st_Drive", "pedal>0", order=1)
tr("drive_limp", "st_Drive", "st_LimpHome", "fault==true", order=0)
tr("drive_brake", "st_Drive", "st_EngineBrake", "ebReq==true && rpm>900", order=1)
tr("drive_idle", "st_Drive", "st_Idle", "pedal==0", order=2)
tr("brake_drive", "st_EngineBrake", "st_Drive", "ebReq==false")
tr("limp_idle", "st_LimpHome", "st_Idle", "fault==false")

layer_of = {s["id"]: s["parentId"] for s in states}


def layer(lid, name, parent):
    sids = [s["id"] for s in states if s["parentId"] == lid]
    tids = [t["id"] for t in transitions if layer_of[t["sourceId"]] == lid]
    return {"id": lid, "name": name, "parentStateId": parent, "stateIds": sids, "transitionIds": tids,
            "junctionIds": [], "decomposition": "OR"}


layers = [layer("root", "Root", None), layer("lay_Powered", "Powered", "st_Powered"),
          layer("lay_Running", "Running", "st_Running")]

# --------------------------------------------------------------------- HMI
hmi = []


def widget(hid, typ, name, x, y, var=None, w=150, h=80, **extra):
    c = {"id": hid, "type": typ, "name": name, "x": x, "y": y, "width": w, "height": h,
         "variableId": f"v_{var}" if var else None, "min": 0, "max": 100}
    c.update(extra)
    hmi.append(c)


widget("h_title", "label", "MR-PLD ECU - OM 501 LA operating modes", 20, 10, w=520, h=40,
       text="MR-PLD ECU (A 541 446 53 40) - OM 501 LA operating modes")
widget("h_start", "simulation-command", "Start", 560, 10, w=110, h=50, command="start")
widget("h_reset", "simulation-command", "Reset", 680, 10, w=110, h=50, command="reset")
for i, (v, label, color) in enumerate([("kl15", "KL15 ignition", "green"), ("kl50", "KL50 start", "orange"),
                                       ("keyValid", "Immo key valid", "blue"), ("synced", "CKP/CMP synced", "blue"),
                                       ("ebReq", "Engine brake req", "yellow"), ("fault", "Inject fault", "red")]):
    widget(f"h_in_{v}", "toggle", label, 20 + (i % 3) * 170, 70 + (i // 3) * 100, v, color=color)
widget("h_rpm", "slider", "Engine speed [rpm]", 20, 280, "rpm", w=330, h=90, max=2500, step=10, precision=0, unit="rpm")
widget("h_pedal", "slider", "Pedal [%]", 20, 380, "pedal", w=330, h=90, max=100, step=1, precision=0, unit="%")
widget("h_rpm_gauge", "gauge", "rpm", 370, 280, "rpm", w=180, h=160, max=2500, precision=0, unit="rpm")
for i, (v, label, color) in enumerate([("powerLatch", "Main relay latch", "green"), ("starter", "Starter (X2-18)", "orange"),
                                       ("pv", "PV engine brake", "yellow"), ("derate", "Limp-home derate", "red"),
                                       ("dtcImmo", "Immo DTC", "red"), ("dtcStored", "DTC stored", "grey")]):
    widget(f"h_out_{v}", "lamp", label, 580 + (i % 3) * 160, 80 + (i // 3) * 100, v, color=color)
widget("h_inj", "lcd", "Injection mode (0 cut / 1 start / 2 PLD)", 580, 290, "injMode", w=300, h=70, max=2, precision=0)
for i, sid in enumerate(["st_Off", "st_Init_SelfTest", "st_ImmoCheck", "st_StartInhibit", "st_Standby",
                         "st_Crank_SyncSearch", "st_Crank_StartFuel", "st_Idle", "st_Drive", "st_EngineBrake",
                         "st_LimpHome", "st_Stopping", "st_AfterRun"]):
    widget(f"h_st_{sid}", "active-state-indicator", sid[3:], 20 + (i % 4) * 215, 500 + (i // 4) * 60,
           w=205, h=50, stateId=sid)
widget("h_scope", "dashboard-scope", "Trace", 900, 280, w=360, h=220,
       variableIds=["v_rpm", "v_injMode", "v_starter", "v_pv"])

# ------------------------------------------------------------------ write
project = {
    # No top-level "schemaVersion": the SysML loader would read a flat payload
    # carrying schemaVersion 4 as an already-canonical v4 repository.
    "version": "v2.4 ENGINE",
    "projectName": "MR_PLD_ECU",
    "openTabs": ["bdd", "ibd", "statemachine", "hmi"],
    "tickMs": TICK_MS,
    "safetyMode": False,
    "states": states,
    "junctions": [],
    "transitions": transitions,
    "variables": variables,
    "layers": layers,
    "view": {"scale": 0.8, "offsetX": 120, "offsetY": 160},
    "blocks": blocks,
    "relationships": relationships,
    "parts": parts,
    "connectors": connectors,
    "interfaceRealizations": [],
    "customStereotypes": [],
    "hmiComponents": hmi,
    "vlabNodes": [], "vlabEdges": [],
    "globalXBridgesNodes": [], "globalXBridgesEdges": [],
    "entropyNodes": [], "entropyEdges": [],
}
OUT.write_text(json.dumps(project, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"wrote {OUT.relative_to(ROOT)}: {len(blocks)} blocks, {len(relationships)} relationships, "
      f"{len(parts)} parts, {len(connectors)} connectors, {len(states)} states, "
      f"{len(transitions)} transitions, {len(variables)} variables, {len(hmi)} HMI widgets")
