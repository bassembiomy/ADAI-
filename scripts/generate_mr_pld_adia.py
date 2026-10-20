#!/usr/bin/env python3
"""Behaviour half of MR_PLD_ECU.adia (step 1 of 2): models/mr_pld/MR_PLD_Model.sysml
`state def OperatingModes` -> executable state machine, its I/O variables and the HMI panel.

Step 2, `npx tsx scripts/build_mr_pld_adia.ts`, builds the SysML structure (packages,
value types, items, interface blocks, blocks, IBD connectors, signals, the sequence
diagram) through the app's own commands and writes MR_PLD_ECU.adia.

SysML v2 change events ("accept when x") become level guards, time events
("accept after 0.7 [s]") become `after` transitions in ticks of TICK_MS, and
the opaque entry/do/exit actions drive the output variables listed in VARS.

Run:  python3 scripts/generate_mr_pld_adia.py && npx tsx scripts/build_mr_pld_adia.ts
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "models" / "mr_pld" / "MR_PLD_ECU.behaviour.json"
TICK_MS = 10

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
    "interfaceRealizations": [],
    "customStereotypes": [],
    "hmiComponents": hmi,
    "vlabNodes": [], "vlabEdges": [],
    "globalXBridgesNodes": [], "globalXBridgesEdges": [],
    "entropyNodes": [], "entropyEdges": [],
}
OUT.write_text(json.dumps(project, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"wrote {OUT.relative_to(ROOT)}: {len(states)} states, {len(transitions)} transitions, "
      f"{len(variables)} variables, {len(hmi)} HMI widgets")
