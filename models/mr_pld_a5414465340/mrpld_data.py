"""Canonical, internally consistent data set for the Mercedes-Benz MR-PLD
A 541 446 53 40 (TEMIC 287699.01 B, OM 501 LA.II/2-00 V6).
Single source of truth for the SysML v2 generator and the simulation.
Values marked TBV ("to be verified") are reverse-engineering hypotheses that
must be confirmed on the bench / with Star Diagnosis for this ZGS."""

ECU = dict(partNumber="A 541 446 53 40", zgs="001", pcb="TEMIC 287699.01 B",
           engine="OM 501 LA.II/2-00 (V6, Euro II)", engineSerial="541.922-00-063818",
           deviceCodes=[1061, 1047, 1034, 1026])

# ---- Electrical reference ----------------------------------------------------
VREF = 5.00            # TLE4275 output, datasheet 4.90..5.10 V (+-2 %)
VREF_TOL = 0.02
ADC_BITS = 10
R_PULLUP = 2490.0      # NTC pull-up, 0.1 %
R_SHUNT = 0.033        # Vishay DALE R033F, 1 %
I_PEAK = 16.0
I_HOLD = 8.0
I_OVERCURRENT = 24.0
I_OPEN_COIL = 4.0
VBAT_DIV = 1.8 / (10.0 + 1.8)
FIRING_ORDER = [1, 4, 2, 5, 3, 6]
FIRING_INTERVAL_DEG = 120
CKP_SLOTS, CKP_PITCH_DEG, CKP_REF_BTDC = 36, 10, 65
CMP_TEETH = 12

def adc(v):  # convention used across the workstation
    return max(0, min(1023, round(min(VREF, v) / VREF * 1023)))

# ---- NTC (Bosch-type 2.5 kOhm @ 20 C) reference table ------------------------
NTC_TABLE = [(-40, 45300), (-30, 26100), (-20, 15400), (-10, 9390), (0, 5890), (10, 3790),
             (20, 2500), (30, 1700), (40, 1180), (50, 840), (60, 595), (70, 435), (80, 322),
             (90, 243), (100, 186), (110, 144), (120, 112), (130, 89)]

import math
def ntc_ohm(t):
    tab = NTC_TABLE
    if t <= tab[0][0]: return tab[0][1]
    if t >= tab[-1][0]: return tab[-1][1]
    for (t0, r0), (t1, r1) in zip(tab, tab[1:]):
        if t0 <= t <= t1:
            return math.exp(math.log(r0) + (math.log(r1) - math.log(r0)) * (t - t0) / (t1 - t0))

def ntc_temp(r):
    tab = NTC_TABLE
    for (t0, r0), (t1, r1) in zip(tab, tab[1:]):
        if r1 <= r <= r0:
            return t0 + (math.log(r) - math.log(r0)) / (math.log(r1) - math.log(r0)) * (t1 - t0)
    return tab[0][0] if r > tab[0][1] else tab[-1][0]

def ntc_volt(t):
    r = ntc_ohm(t); return VREF * r / (r + R_PULLUP)

# ---- Ratiometric pressure transfer functions (single canonical set) -----------
BOOST = dict(p_min=0.60, p_max=3.40, v_min=0.50, v_max=4.50)   # bar abs  (TBV)
OIL   = dict(p_min=0.00, p_max=5.00, v_min=0.50, v_max=4.50)   # bar gauge
BARO  = dict(p_min=0.50, p_max=1.15, v_min=0.50, v_max=4.50)   # bar abs  (TBV)
def p2v(s, p): return s['v_min'] + (p - s['p_min']) * (s['v_max'] - s['v_min']) / (s['p_max'] - s['p_min'])
def v2p(s, v): return s['p_min'] + (v - s['v_min']) * (s['p_max'] - s['p_min']) / (s['v_max'] - s['v_min'])

DIAG_LOW, DIAG_HIGH = 0.25, 4.75      # piezo sensors
NTC_SCG, NTC_OPEN = 0.18, 4.82

# ---- Thermal protection thresholds -------------------------------------------
FAN_ON_C, FAN_FULL_C, WARN_C, DERATE_C, DERATE_HARD_C = 92, 100, 103, 103, 110
DERATE_HARD_PCT = 35
LIMP_RPM_MAX_CKP_LOST = 1800

# ---- Fault codes (one code per function, harmonised; all MR codes TBV) --------
DTC = {
    'B15_CKP': ('0110', '0111', '0112', 'SPN 636'),
    'B16_CMP': ('0210', '0211', '0212', 'SPN 723'),
    'B10_FUEL': ('1215', '1216', None, 'SPN 174'),
    'B11_OILT': ('1115', '1116', None, 'SPN 175'),
    'B111_IAT': ('1315', '1316', None, 'SPN 105'),
    'B111_BOOST': ('1415', '1416', None, 'SPN 102'),
    'B65_ECT': ('1515', '1516', None, 'SPN 110'),
    'B110_OILP': ('1615', '1616', None, 'SPN 100'),
    'B14_OILLVL': ('2515', '2516', None, 'SPN 98'),
    'B_BARO': ('TBV', 'TBV', None, 'SPN 108'),
    'IMMO': ('9964', None, None, '-'),
    'CAN': ('0100', '0101', None, '-'),
}

# ---- Connector pin-out (X1 16-pin cab, X2 55-pin engine) ---------------------
# (pin, direction, signal, function, test value / note)
X1 = [
 (1, 'inout', 'CAN_H', 'IES-CAN High to FR X4-18/3', '2.5..3.5 V; 120 Ohm to X1-2 (ECU unplugged)'),
 (2, 'inout', 'CAN_L', 'IES-CAN Low to FR X4-18/4', '1.5..2.5 V; DTC 0100/0101'),
 (3, 'gnd', 'HF_GND', 'CAN shield (HF ground)', '0 V'),
 (4, 'gnd', 'CAN_GND', 'CAN reference ground (bridged to X1-3)', '0 V'),
 (5, 'in', 'KL30_1', 'Battery +24 V line 1 (fuse F1)', '24..28 V'),
 (6, 'in', 'KL30_2', 'Battery +24 V line 2 (fuse F2), parallel to X1-5', '24..28 V'),
 (7, 'nc', 'NC', 'Reserved', 'open'),
 (8, 'in', 'KL50', 'Crank request from ignition / FR', '+24 V while cranking'),
 (9, 'gnd', 'KL31_1', 'Main power ground 1', '0 V'),
 (10, 'out', 'PV_SUPPLY', 'Proportional-valve +24 V high-side (shared X2-12)', '+24 V when active'),
 (11, 'gnd', 'KL31_2', 'Main power ground 2 (parallel X1-9)', '0 V'),
 (12, 'out', 'STARTER_OUT_P', 'Starter relay output (parallel X2-18)', '+24 V while crank allowed'),
 (13, 'inout', 'K_LINE', 'ISO 14230 diagnostics / BSL flashing (L9637D)', 'idle ~Vbat'),
 (14, 'out', 'PV3_LS_P', 'PV3 low-side PWM (shared X2-41)', 'PWM'),
 (15, 'in', 'KL15', 'Ignition ON / wake-up', '+24 V'),
 (16, 'out', 'PV4_LS_P', 'PV4 low-side PWM (shared X2-43)', 'PWM'),
]
X2 = [
 (1, 'gnd', 'CMP_RET', 'B16 return (-)', '1050..1350 Ohm to X2-20'),
 (2, 'gnd', 'CKP_RET', 'B15 return (-)', '1050..1350 Ohm to X2-19'),
 (3, 'gnd', 'ECT_GND', 'B65 analog ground', '0 V AGND'),
 (4, 'gnd', 'FTS_GND', 'B10 analog ground', '0 V AGND'),
 (5, 'nc', 'NC', 'Reserved (aux GND)', 'open'),
 (6, 'out', 'OILP_5V', 'B110 +5 V supply', '5.00 V +-2 %'),
 (7, 'out', 'BOOST_5V', 'B111 +5 V supply', '5.00 V +-2 %'),
 (8, 'nc', 'NC', 'Reserved', 'open'),
 (9, 'out', 'BANK2_HS', 'Bank 2 common high-side (cyl 4,5,6)', '0.4..0.9 Ohm to 45/44/38; DTC 54xx..56xx'),
 (10, 'gnd', 'OILP_GND', 'B110 analog ground', '0 V AGND'),
 (11, 'nc', 'NC', 'Starter return / aux (variant)', 'open'),
 (12, 'out', 'PV1_SUPPLY', 'PV1 +24 V supply (shared X1-10)', '+24 V when active'),
 (13, 'nc', 'NC', 'Reserved', 'open'), (14, 'nc', 'NC', 'Reserved', 'open'),
 (15, 'gnd', 'OILT_GND', 'B11 analog ground', '0 V AGND'),
 (16, 'out', 'BANK1_HS', 'Bank 1 common high-side (cyl 1,2,3)', '0.4..0.9 Ohm to 54/53/47; DTC 51xx..53xx'),
 (17, 'nc', 'NC', 'Reserved', 'open'),
 (18, 'out', 'STARTER_OUT', 'Starter relay high-side (max 4 A)', '+24 V while cranking'),
 (19, 'in', 'CKP_SIG', 'B15 crank VR (+), 36 slots + ref', '>=1.2 Vpp crank .. ~25 Vpp; DTC 0110/0111/0112'),
 (20, 'in', 'CMP_SIG', 'B16 cam VR (+), 12+1 teeth', '>=0.9 Vpp crank; DTC 0210/0211/0212'),
 (21, 'gnd', 'IAT_GND', 'B111-T analog ground', '0 V AGND'),
 (22, 'nc', 'NC', 'Reserved', 'open'),
 (23, 'gnd', 'BOOST_GND', 'B111-P analog ground', '0 V AGND'),
 (24, 'nc', 'NC', 'Reserved', 'open'),
 (25, 'in', 'BLOCK_START', 'Engine-block start button (bridged to X2-30)', 'active when bridged'),
 (26, 'nc', 'NC', 'Reserved', 'open'), (27, 'nc', 'NC', 'Reserved', 'open'), (28, 'nc', 'NC', 'Reserved', 'open'),
 (29, 'in', 'BOOST_SIG', 'B111-P boost pressure (abs)', '1.07 V @1.0 bar .. 4.21 V @3.2 bar; DTC 1415/1416'),
 (30, 'out', 'BTN_COM', 'Service-button common supply', 'reference line'),
 (31, 'nc', 'NC', 'Reserved', 'open'),
 (32, 'in', 'OILP_SIG', 'B110 oil pressure (gauge)', '0.50 V @0 bar .. 4.50 V @5 bar; DTC 1615/1616'),
 (33, 'in', 'OILLVL_SIG', 'B14 thermal oil level (pulse +)', '18..26 Ohm to X2-49; DTC 2515/2516'),
 (34, 'in', 'ECT_SIG', 'B65 coolant temperature NTC', '2.50 V @20 C, 0.57 V @80 C; DTC 1515/1516'),
 (35, 'in', 'BLOCK_STOP', 'Engine-block stop button (bridged to X2-30)', 'active when bridged'),
 (36, 'in', 'FTS_SIG', 'B10 fuel temperature NTC', '2.50 V @20 C, 0.57 V @80 C; DTC 1215/1216'),
 (37, 'nc', 'UP_H_CYL8', 'Unit pump H, cyl 8 (OM 502 V8 only)', 'not wired on V6'),
 (38, 'out', 'UP_F_CYL6', 'Unit pump F, cyl 6 (bank 2)', '0.6 Ohm to X2-9; DTC 56xx'),
 (39, 'in', 'OILT_SIG', 'B11 oil temperature NTC', '2.50 V @20 C, 0.57 V @80 C; DTC 1115/1116'),
 (40, 'nc', 'NC', 'Reserved', 'open'),
 (41, 'out', 'PV3_LS', 'PV3 fan-clutch valve low-side PWM', '30..50 Ohm to X2-12/52'),
 (42, 'nc', 'NC', 'Reserved', 'open'),
 (43, 'out', 'PV4_LS', 'PV4 aux / fan stage low-side PWM', 'PWM'),
 (44, 'out', 'UP_D_CYL5', 'Unit pump D, cyl 5 (bank 2)', '0.6 Ohm to X2-9; DTC 55xx'),
 (45, 'out', 'UP_B_CYL4', 'Unit pump B, cyl 4 (bank 2)', '0.6 Ohm to X2-9; DTC 54xx'),
 (46, 'nc', 'UP_G_CYL7', 'Unit pump G, cyl 7 (OM 502 V8 only)', 'not wired on V6'),
 (47, 'out', 'UP_E_CYL3', 'Unit pump E, cyl 3 (bank 1)', '0.6 Ohm to X2-16; DTC 53xx'),
 (48, 'in', 'IAT_SIG', 'B111-T charge-air temperature NTC', '2.50 V @20 C; DTC 1315/1316'),
 (49, 'gnd', 'OILLVL_RET', 'B14 return', '0 V'),
 (50, 'out', 'PV2_LS', 'PV2 exhaust-brake flap low-side', '30..50 Ohm to X2-52'),
 (51, 'out', 'PV1_LS', 'PV1 constant-throttle (decompression) low-side', '30..50 Ohm to X2-12'),
 (52, 'out', 'PV2_SUPPLY', 'PV2 / PV +24 V supply', '+24 V when active'),
 (53, 'out', 'UP_C_CYL2', 'Unit pump C, cyl 2 (bank 1)', '0.6 Ohm to X2-16; DTC 52xx'),
 (54, 'out', 'UP_A_CYL1', 'Unit pump A, cyl 1 (bank 1)', '0.6 Ohm to X2-16; DTC 51xx'),
 (55, 'nc', 'NC', 'Reserved', 'open'),
]
assert len(X1) == 16 and len(X2) == 55 and [p[0] for p in X2] == list(range(1, 56))

# cylinder -> (low-side pin, bank common pin, bank)
CYL = {1: (54, 16, 1), 2: (53, 16, 1), 3: (47, 16, 1), 4: (45, 9, 2), 5: (44, 9, 2), 6: (38, 9, 2)}

SENSORS = [
 # key, ref, name, kind, signal pin, return pin, supply pin, adc channel
 ('B15_CKP', 'B15', 'Crankshaft position (VR 36 slots + ref)', 'VR', 19, 2, None, 'CC0'),
 ('B16_CMP', 'B16', 'Camshaft position (VR 12+1)', 'VR', 20, 1, None, 'CC1'),
 ('B111_BOOST', 'B111-P', 'Charge-air pressure (abs)', 'PIEZO', 29, 23, 7, 'AN0'),
 ('B111_IAT', 'B111-T', 'Charge-air temperature', 'NTC', 48, 21, None, 'AN1'),
 ('B65_ECT', 'B65', 'Coolant temperature', 'NTC', 34, 3, None, 'AN2'),
 ('B10_FUEL', 'B10', 'Fuel temperature', 'NTC', 36, 4, None, 'AN3'),
 ('B110_OILP', 'B110', 'Oil pressure (gauge)', 'PIEZO', 32, 10, 6, 'AN4'),
 ('B11_OILT', 'B11', 'Oil temperature', 'NTC', 39, 15, None, 'AN5'),
 ('B14_OILLVL', 'B14', 'Thermal oil level', 'HOTWIRE', 33, 49, None, 'AN6'),
]

# ---- Simulation scenarios (shared with the SysML model) -----------------------
# name, key, pedal %, coolant C, boost bar abs, immo, ckp, cmp, bank1Short, can, expected state
SCENARIOS = [
 ('scn01_KeyOff',          'OFF',   0,  20, 1.0, True,  True,  True,  False, True, 'ST_STANDBY'),
 ('scn02_IgnitionOn',      'IGN',   0,  20, 1.0, True,  True,  True,  False, True, 'ST_READY'),
 ('scn03_ColdCrank',       'CRANK', 20, -5, 1.0, True,  True,  True,  False, True, 'ST_CRANK_SYNC'),
 ('scn04_NormalRun',       'RUN',   45, 85, 2.0, True,  True,  True,  False, True, 'ST_RUN_NORMAL'),
 ('scn05_FullLoad',        'RUN',  100, 88, 3.2, True,  True,  True,  False, True, 'ST_RUN_NORMAL'),
 ('scn06_EngineBrake',     'BRAKE', 0,  85, 1.0, True,  True,  True,  False, True, 'ST_ENGINE_BRAKE'),
 ('scn07_ImmoMismatch',    'CRANK', 0,  20, 1.0, False, True,  True,  False, True, 'ST_IMMO_LOCKED'),
 ('scn08_CkpLossLimp',     'RUN',   80, 85, 2.0, True,  False, True,  False, True, 'ST_LIMP_DERATE'),
 ('scn09_CmpLossRun',      'RUN',   45, 85, 2.0, True,  True,  False, False, True, 'ST_LIMP_DERATE'),
 ('scn10_TotalSyncLoss',   'RUN',   45, 85, 2.0, True,  False, False, False, True, 'ST_FAULT_SHUTDOWN'),
 ('scn11_Overheat',        'RUN',   80, 106, 2.4, True, True,  True,  False, True, 'ST_LIMP_DERATE'),
 ('scn12_Bank1Short',      'RUN',   50, 85, 2.0, True,  True,  True,  True,  True, 'ST_LIMP_DERATE'),
 ('scn13_CanTimeout',      'RUN',   50, 85, 2.0, True,  True,  True,  False, False, 'ST_LIMP_DERATE'),
 ('scn14_LowBoostSmoke',   'RUN',  100, 85, 1.2, True,  True,  True,  False, True, 'ST_RUN_NORMAL'),
]
