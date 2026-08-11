# VLab Scope Feature & Specification Parity Design Document

**Date**: 2026-08-11  
**Status**: Approved  
**Scope**: VLab Oscilloscope / Scope Component  

---

## 1. Executive Summary

This specification outlines the architecture, data models, UI components, and parameter definitions required to bring **100% feature and specification parity** to the **VLab Scope** based on the **XBridges Scope** implementation.

Key capabilities introduced to VLab Scope:
- Dynamic multi-channel input ports (1–8 ports, e.g. `in1`, `in2`, ..., `inN`).
- Connected signal source auto-detection & metadata inspection in the legend (`SourceBlock.Port (Type)`).
- Full parameter suite: `numSignals`, `time_range`, `buffer_size`, `limit_data_points`, `decimation`, `sample_time`, `show_grid`, `show_legend`.
- Live Scope Settings popover/modal to modify parameters while simulating.
- Timestamped CSV data export functionality.
- Interactive controls: Zoom in/out, Autoscale reset, Fullscreen floating window dialog.

---

## 2. Architecture & Utility Layer

### 2.1 Utility Module (`src/utils/scopeUtils.ts`)
A dedicated scope utility module will handle signal metadata resolution, CSV generation, and parameter normalization:

1. **`getVLabSignalInfo(nodeId, channelIndex, nodes, edges, history)`**:
   - Resolves connected incoming edge targeting channel `in{channelIndex+1}`.
   - Extracts source block label, source port label, and infers signal data type (`double`, `boolean`, `[N]`).
   - Returns metadata object:
     ```ts
     {
       connected: boolean;
       name: string; // e.g. "Channel 1"
       dataType: string; // e.g. "double"
       portName: string; // e.g. "v_s"
       blockLabel: string; // e.g. "Voltage Sensor"
       fullName: string; // e.g. "Channel 1: Voltage Sensor.v_s (double)"
     }
     ```

2. **`exportScopeToCSV(title, displayData, signalInfos)`**:
   - Formats history records into standard CSV string with column headers `Time (s), [Signal 1 FullName], [Signal 2 FullName], ...`.
   - Triggers browser Blob download as `${title}_data_${timestamp}.csv`.

3. **Parameter Normalization Helper**:
   - Normalizes snake_case parameters (`time_range`, `buffer_size`, `show_grid`, `show_legend`) to uniform numerical/boolean representations used in rendering and evaluation.

---

## 3. Dynamic Multi-Channel Port Synchronization

### 3.1 Library Definition (`src/utils/vlabLibrary.ts`)
Update the `scope` item definition in `vlabLibrary.ts` to include all standardized parameters:
```ts
{
  id: 'scope',
  name: 'Scope',
  color: '#fbbf24',
  icon: 'scope',
  category: 'Sinks',
  params: {
    numSignals: { value: 1, unit: 'channels', label: 'Number of Input Ports' },
    time_range: { value: 10, unit: 's', label: 'Time Range' },
    limit_data_points: { value: 'on', unit: '', label: 'Limit data points' },
    buffer_size: { value: 1000, unit: 'points', label: 'Max Points' },
    decimation: { value: 1, unit: '', label: 'Decimation' },
    sample_time: { value: -1, unit: 's', label: 'Sample Time' },
    show_grid: { value: 'on', unit: '', label: 'Show Grid' },
    show_legend: { value: 'on', unit: '', label: 'Show Legend' }
  },
  ports: [{ id: 'in1', pos: 'left', label: '1', domain: 'Physical' }]
}
```

### 3.2 Dynamic Node Updating & Edge Filtering (`VLabWorkspace.tsx`)
- When `numSignals` (or `numPorts`) is modified (range 1–8):
  - Generate input ports: `in1`, `in2`, ..., `inN`.
  - Update `node.data.ports`.
  - Filter out edges connected to removed target handles when channel count is reduced.

---

## 4. UI & Visualization Components

### 4.1 Scope Settings Modal (`ScopeSettingsModal`)
Provides live parameter tuning inside both `ScopeView` and `VLabScopeWindow`:
- Channel count selector (1 to 8).
- Time range input / `auto` toggle.
- Buffer size input & limit points toggle.
- Decimation factor & sample time inputs.
- Grid & Legend visibility toggles.

### 4.2 Floating Window (`VLabScopeWindow`)
- **Header**: Title, simulation acquisition status indicator, minimize, maximize, close.
- **Toolbar**:
  - Download CSV button (`Download` icon).
  - Zoom In (`ZoomIn`) / Zoom Out (`ZoomOut`) buttons.
  - Autoscale Reset (`RefreshCcw`).
  - Settings Modal trigger (`Settings`).
- **Legend & Metadata Bar**: Multi-channel color dots, signal names, connected block source info, data types, and live values.
- **Plot Area**: Recharts AreaChart/LineChart with dynamic Y-axis domain zoom and responsive sizing.

---

## 5. Verification & Testing Plan

1. **Unit & Utility Tests**:
   - Test `getVLabSignalInfo` edge resolution with single and multiple connected ports.
   - Test `exportScopeToCSV` output formatting.
2. **Interactive UI Verification**:
   - Change `numSignals` from 1 to 4 and verify node updates ports `in1`..`in4`.
   - Connect multiple sensors (e.g. voltage & current sensors) to Scope and verify legend displays connected block names and data types.
   - Verify CSV export file generation.
   - Test Zoom in/out, Autoscale, Grid toggle, and Legend toggle controls.
