# MR-PLD ECU (A 541 446 53 40) — OM 501 LA

`MR_PLD_Model.sysml` is the SysML v2 textual source. The ready-to-open ADIA project is
`../../MR_PLD_ECU.adia` (ADIA → **Open**).

| Source (SysML v2) | In ADIA |
| --- | --- |
| `Items`, `Ports` packages | BDD 4 – Items and port definitions |
| `Actros_EngineMgmt_System` | BDD 1 – System context, IBD – Actros_EngineMgmt_System |
| `MR_PLD_ECU` + internals | BDD 2 – MR-PLD ECU internals, IBD – MR_PLD_ECU |
| `OM501LA_Engine` | BDD 3 – OM 501 LA engine, IBD – OM501LA_Engine |
| `state def OperatingModes` | Main State Machine (Powered / Running are composite states) |
| — | HMI Panel: inputs (KL15, KL50, key, sync, fault, engine brake, rpm, pedal) and outputs |

Mapping notes:

- `accept when x` change events become level guards (`kl15==true`); `accept after t [s]` becomes an
  `after` transition in 10 ms ticks (0.7 s → 70, 4 s → 400, 1.6 s → 160).
- The opaque actions drive output variables: `latchAndReadEEPROM`/`releaseLatch` → `powerLatch`,
  `starterOn` → `starter`, `injectStartQuantity`/`injectPLD`/`cutInjection` → `injMode` 1/2/0,
  `pvOn`/`pvOff` → `pv`, `derate` → `derate`, `storeImmoDTC` → `dtcImmo`, `storeDTC` → `dtcStored`.
- The connector pins (`X1.KL30`, `X2.ckp`, …) are flattened into ECU boundary ports (`X1_KL30`, `X2_ckp`, …).
  The SysML `connect a to b` lines without named ports get role ports on the internal blocks
  (e.g. `mcu.spi` ↔ `eeprom.spi`).

Regenerate after editing the mapping:

```sh
python3 scripts/generate_mr_pld_adia.py   # SysML mapping -> models/mr_pld/MR_PLD_ECU.flat.json
npx tsx scripts/build_mr_pld_adia.ts      # app loader + diagrams -> MR_PLD_ECU.adia (format 5)
npx vitest run src/services/mrPldEcuProject.test.ts
```
