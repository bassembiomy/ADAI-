# HMI audit and proposed component expansion — 2026-10-08

Status: approved expansion implemented; verification recorded in `2026-10-08-hmi-implementation.md`.

## Current implementation

`src/types/sysml_types.ts` defines 15 component types: toggle, button, slider, input, lamp, led, lcd, gauge, rotary, hybrid-rotary, buzzer, oled, encoder, mode-selector and mode-icon. The editor, binding controls and most renderers are embedded in `src/App.tsx`. Projects persist HMI components; the report also contains a separate interactive HMI renderer.

The current interface passes variables and a write callback, but no committed state configuration or simulation lifecycle metadata. Its Edit/Run switch selects editing versus interaction; it does not start chart simulation.

## Verified findings

1. Boolean writes are incorrect for textual true. HMI buttons emit `true`/`false` strings. `updateVariableValue` passes `Number(value)` into `coerceTypedValue`; `Number('true')` is NaN and Boolean(NaN) is false. A direct source-level reproduction returned false for true, false for false, true for 1 and false for 0.
2. Momentary buttons use mouse down/up/leave handlers. Keyboard, pointer cancellation, lost focus and close/unmount need an explicit release contract.
3. HMI writes currently mutate the live runtime through `setSessionVariableValue` inside a React state updater. There is no HMI input queue coordinated with the chart tick, making rapid press/release and lifecycle races important integration cases.
4. General input bindings currently offer every chart variable. Display-only bindings and explicit write permissions are needed to make intended operator input ownership clear.
5. The current editor has fixed colors, a flat component palette and no shared schema for component properties, validation or Help.
6. State indicators and traces need committed interpreter state and timestamps; they must not infer active states from variable values or advance the chart independently.
7. The separate report renderer requires compatibility checks when the catalog expands.

## Recommended design

Extract a focused HMI workspace, a typed component catalog, shared binding validation and a simulation adapter. Preserve legacy IDs and configuration through migration. Keep ADIA theme colors, categorized searchable components, unit/range/precision controls, layout alignment and accessible pointer/keyboard interaction.

Expand the existing components with a bounded engineering catalog rather than promising every widget in every vendor product:

- Inputs: Check Box, Combo Box, Radio Group, Rocker Switch, Slide Switch, continuous Knob, vertical Slider, latching Button, pulse Button and approved simulation command Button.
- Displays: half/quarter/linear/vertical Gauges, multi-signal Dashboard Scope, XY Plot, Multi-state Image, active State Indicator, Alarm List, Progress Bar, Thermometer, Tank Level and Seven-segment Display. Improve the existing numeric/LCD display rather than duplicating its purpose.
- Layout: Label/Text, Image, Group/Panel and Tabs.

The comparison uses the official [MATLAB/Simulink Dashboard catalog](https://www.mathworks.com/help/simulink/dashboard.html) and [customizable dashboard controls](https://www.mathworks.com/help/simulink/customizable-blocks.html). Industrial additions supplement that catalog; no vendor-equivalence claim is intended.

## State Machine behavior contract

- Use the existing semantic interpreter as the sole authority for active states, actions, timers and transitions.
- Apply validated HMI input commands at defined chart tick boundaries. Define staged inputs while paused, cancellation on Reset and deterministic ordering when several components write.
- Define momentary, latched and one-tick pulse behavior separately. A pulse must survive until a chart tick consumes it; pointer cancellation or focus loss must release a held button.
- Parse Boolean and numerical values deliberately, reject non-finite/invalid values and respect variable types, bounds and overflow policy.
- Display indicators, alarms and traces from committed frames. A UI interaction must not directly force state transitions or run entry/do/exit actions.
- Keep layout editing separate from runtime input. Disable invalid/unbound controls and expose the binding issue clearly.
- Treat hardware/Factory I/O input ownership explicitly when an external mapping drives the same variable.
- Keep project Save/Open, report HMI and Help consistent with the shared catalog.

## Required verification

Exercise press/release faster than one tick, keyboard activation, lost focus, pointer cancellation, Pause/Resume, Step, Reset during a queued input, conflicting bindings, external I/O ownership and legacy project migration. Compare HMI-driven chart traces with equivalent direct-input traces, including nested and parallel state configurations. Verify all catalog renderers and property schemas, exported-report interaction, light/dark themes and mobile layout.
