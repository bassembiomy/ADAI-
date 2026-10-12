# HMI expansion implementation plan

Approved scope: docs/help/2026-10-08-hmi-review.md; user approval received 2026-10-08.

## Shared contract

Preserve every existing component type and property. Add categorized engineering controls, displays and layout widgets with a shared catalog and migration. Theme follows the application's CSS variables. The semantic interpreter remains authoritative.

Commands use `{ sourceId, variableId, value, mode?: 'set' | 'press' | 'release' | 'pulse', releaseValue? }`, with values number, boolean or string. The queue validates against current VariableDef and externally owned sensor IDs. Commands are applied immediately before the semantic tick, after external reads; no React updater mutates runtime. Quick press/release is observed for one tick and release follows on the next tick. Reset/model replacement clears commands. Paused input stays staged; displays always show committed frames.

Workspace props: variables, components, setComponents (React Dispatch), onInput(command), onClose, runtime `{ running, time, activeStateIds, states: {id,name}[], samples: {time,values: Record<string,number|boolean>}[], resetVersion }`, externalOwnedVariableIds, onSimulationCommand('start'|'pause'|'resume'|'step'|'reset'). Input callback returns `{ accepted: boolean, error?: string }`.

New component names: checkbox, combo-box, radio-group, rocker-switch, slide-switch, knob, vertical-slider, latching-button, pulse-button, simulation-command, half-gauge, quarter-gauge, linear-gauge, vertical-gauge, dashboard-scope, xy-plot, multi-state-image, active-state-indicator, alarm-list, progress-bar, thermometer, tank-level, seven-segment, label, image, panel, tabs.

Common optional properties: step, precision, unit, text, imageUrl, options `{label,value:number|boolean}[]`, stateId, command, alarmThreshold, writable, parentId, tabId, tabs `{id,label}[]`. Existing variableIds supports traces and XY pairs. Legacy writable inputs default true; displays never write. Unknown component data is handled explicitly by migration diagnostics.

## Tasks and checks

- [x] Catalog/types/migration/binding parser and tests (isolated model task).
- [x] Extract themed HMI workspace, accessible controls, properties, committed displays and tests (isolated UI task).
- [x] Shared portable report renderers and catalog coverage (isolated report task).
- [x] Deterministic queue, semantic tick integration, lifecycle integration and differential tests (root integration).
- [x] App workspace replacement, project migration, report wiring, catalog Help.
- [x] Task reviews, integration fixes, TypeScript, focused tests and browser verification.

Preserve unrelated dirty changes. No commits or resets of existing work. Review actual files and test output before claiming completion.
