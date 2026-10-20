# ADR-001 Bus signals in X-Bridges (Powertrain plan WP-04)

Status: accepted (Opus, 2026-10-20)

## Context
Nearly every Powertrain Blockset block has an `Info` bus output (efficiency, losses, power terms, states).
X-Bridges carries numbers, booleans, vectors and matrices only (`XValue`, `src/engine/xbridges/types.ts`).
The engine already passes any value through unchanged (`XbridgesEngine.gatherInputs`) and its NaN check
already walks objects (`checkNumericalStability`).

## Decision
- A bus value is a plain, ordered JavaScript object `XBus = { [element: string]: XBusElement }` where an
  element is a number, boolean, vector, matrix or nested `XBus`. Element order = insertion order = Simulink
  element order. `XValue` gains `XBus`.
- Pure helpers in `src/engine/xbridges/bus/busCore.ts`: `isBus`, `makeBus`, `selectBusElement(bus, 'a.b')`,
  `flattenBus(bus)` (leaf path -> leaf), `busLeafPaths(bus)`.
- Blocks with Simulink parameter names: `BUS_CREATOR` (`Inputs`, `SignalNames`; ports `in1..inN` -> `bus`) and
  `BUS_SELECTOR` (`OutputSignals` comma list of dot paths, `OutputAsBus` `off`/`on`; port `bus` -> `out1..outN`
  or `bus`). A selected path missing from the incoming bus is a block error naming the path.
- Scope: a bus input is recorded leaf by leaf (`y<i>.<path>` keys); `y<i>` keeps the first leaf so existing
  views keep working.
- Port metadata: a bus port has `type: 'auto'`, `unit: 'bus'` and the bus type name in `dataType`
  (`Bus: <Name>`), as Simulink shows `Bus: <Name>`.
- Embedded C: bus blocks are host-only until Powertrain WP-30 (C structs).
- TRM / DOE address bus leaves with the dot path after the port id (WP-34).

## Consequences
- Powertrain blocks build `Info` with `makeBus` in Simulink element order; Bus Selector reads any element.
- No change to existing blocks; arithmetic blocks given a bus input keep their current behaviour (Simulink
  rejects that at compile time; X-Bridges compile-time type checks are out of scope here).
