import { HMI_CATALOG } from '../features/hmi/hmiCatalog';
import type { HmiComponentType } from '../types/sysml_types';
import type { HelpTopic } from './helpTypes';

const widgetDetails: Record<HmiComponentType, [string, string]> = {
  toggle: ['Bind a Boolean variable; active and inactive values select the two positions.', 'Bind Enabled; switch on to stage true.'],
  button: ['Bind the held input; press stages the active value and release stages the inactive value. Keyboard and pointer cancellation release the control.', 'Bind Request; hold the button during operation, then release.'],
  slider: ['Set minimum, maximum and positive step for horizontal adjustment.', 'Bind Speed; choose a range of 0–100 with step 5.'],
  input: ['Enter a finite number or the Boolean text true/false/1/0. Variable overflow policy controls integer saturation or rejection.', 'Bind Setpoint; enter 42.5 for a double variable.'],
  rotary: ['Bind a numeric variable and set range and step, or select variableIds for one-hot positions: choosing a position stages one active signal and clears the others at the same tick boundary.', 'Bind TemperatureSetpoint with range 20–200, or select Low/Medium/High Boolean signals as positions.'],
  'hybrid-rotary': ['Configure the legacy hybridValues list and bind its numeric selection.', 'Use discrete values 0, 50 and 100 for a heater selector.'],
  encoder: ['Configure encoderValues and the main binding. Legacy cursorVariableId and pressVariableId describe additional encoder signals.', 'Use three numeric speed presets and a Boolean confirm press binding.'],
  'mode-selector': ['Configure labeled options or legacy mode names; each selection writes the associated numeric or Boolean value.', 'Configure Off=0, Heat=1 and Fan=2 for Mode.'],
  'mode-icon': ['Set the displayed icon and targetValue for this legacy clickable selector.', 'Use a fan icon with targetValue 2 for Mode.'],
  checkbox: ['Bind a Boolean variable; checking selects activeValue and clearing selects inactiveValue.', 'Bind InterlockEnabled; check to stage true.'],
  'combo-box': ['Provide options as label/value pairs. Option values must be finite numbers or Booleans compatible with the binding.', 'Choose Manual=0 or Automatic=1 for ControlMode.'],
  'radio-group': ['Provide labeled numeric or Boolean options; a single option is selected.', 'Choose Low=1, Medium=2 or High=3 for FanSpeed.'],
  'rocker-switch': ['Set activeValue and inactiveValue for the two rocker positions.', 'Bind Power; use true and false positions.'],
  'slide-switch': ['Set activeValue and inactiveValue for the two slide positions.', 'Bind PumpEnabled; slide on to stage true.'],
  knob: ['Set a finite minimum and maximum and a positive step for numeric adjustment.', 'Bind Gain; use range 0–10 and step 0.1.'],
  'vertical-slider': ['Configure the numeric minimum, maximum and step for vertical adjustment.', 'Bind ValveDemand; use range 0–100 percent.'],
  'latching-button': ['Each activation alternates the active and inactive input values; the active value remains staged until changed.', 'Bind RunRequest; click once for true and again for false.'],
  'pulse-button': ['Configure active and inactive values. A pulse is consumed for one semantic tick before release on the following tick.', 'Bind Acknowledge; a quick click stages a one-tick true pulse.'],
  'simulation-command': ['Choose start, pause, resume, step or reset. This control calls the simulation lifecycle command instead of writing a variable.', 'Create a Step button to advance a paused chart by one tick.'],
  lamp: ['Bind a Boolean or numeric activity signal and choose an indicator color.', 'Bind HeaterOn; the lamp lights from the committed frame.'],
  led: ['Bind an activity signal and choose the LED color.', 'Bind FaultActive; use a red LED.'],
  lcd: ['Bind a numeric value; configure precision and unit text for presentation.', 'Bind Pressure; show two decimal places and bar.'],
  gauge: ['Set minimum and maximum for the circular display scale and unit text.', 'Bind ShaftSpeed; display a scale of 0–3000 rpm.'],
  buzzer: ['Bind an activity signal; soundType selects the legacy sine, square, sawtooth or triangle waveform.', 'Bind AlarmActive; select a square-wave buzzer.'],
  oled: ['Preserve legacy mode, temperature, time, state, progress and indicator bindings, title, mode names and emoji labels.', 'Bind the temperature and progress channels of a heating cycle.'],
  'half-gauge': ['Set range, unit and precision for the semicircular display.', 'Bind Torque; display 0–200 N·m.'],
  'quarter-gauge': ['Set range, unit and precision for the quarter-circle display.', 'Bind Angle; display 0–90 degrees.'],
  'linear-gauge': ['Set range and unit for the horizontal display scale.', 'Bind Flow; display 0–50 L/min.'],
  'vertical-gauge': ['Set range and unit for the vertical display scale.', 'Bind Pressure; display 0–10 bar.'],
  'dashboard-scope': ['Select variableIds for multiple traces. Sample timestamps come from committed interpreter frames.', 'Plot Temperature and Setpoint against simulation time.'],
  'xy-plot': ['Select two variableIds, first for X and second for Y; both values come from the same committed sample.', 'Plot Displacement against Force to inspect a cycle.'],
  'multi-state-image': ['Bind a mode/status variable and configure options containing label, value and optional imageUrl for each value. The committed value selects its image; component imageUrl is the fallback. This does not define chart states.', 'Configure Idle=0 with idle.png and Running=1 with running.png to illustrate committed Mode.'],
  'active-state-indicator': ['Choose stateId from chart states. The indicator reads committed activeStateIds, including nested or parallel active states.', 'Select the Heating state to show its committed activity.'],
  'alarm-list': ['Select variableIds and a finite alarmThreshold; the list shows signals exceeding that threshold.', 'List Temperature channels exceeding 90.'],
  'progress-bar': ['Set range, unit and precision; visual fill represents the value within that range.', 'Bind CycleProgress; display 0–100 percent.'],
  thermometer: ['Set minimum, maximum and unit for a vertical temperature display.', 'Bind TankTemperature; display 0–120 °C.'],
  'tank-level': ['Set minimum and maximum to represent empty and full; unit labels do not convert measurements.', 'Bind Level; display 0–100 percent fill.'],
  'seven-segment': ['Bind a numeric variable and select precision and unit text.', 'Bind RemainingTime; show zero decimal places and seconds.'],
  label: ['Set text for explanatory copy; name identifies the component in the editor.', 'Add the text Cooling system beside related controls.'],
  image: ['Set imageUrl to the desired image resource; size and position place it on the canvas.', 'Add a machine schematic behind status indicators.'],
  panel: ['Use parentId on children to associate them with the panel; set the panel name and geometry.', 'Group pump controls under a panel named Water circuit.'],
  tabs: ['Configure tabs as stable id/label pairs and associate children using parentId and tabId.', 'Create Operation and Diagnostics pages with stable tab IDs.'],
};

// Widget shapes follow the actual HmiWidget switch; these are controls/displays, not signal-flow block ports.
const widgetAppearance: Record<HmiComponentType, string> = {
  toggle: 'Labeled checkbox switch with On/Off state.',
  button: 'Labeled momentary push button (press and release).',
  slider: 'Horizontal range slider with numerical output.',
  input: 'Labeled numeric/Boolean entry field.',
  rotary: 'Circular dial and +/- controls; multi-variable one-hot configuration uses a button row instead.',
  'hybrid-rotary': 'Circular dial with configured discrete positions and +/- controls.',
  encoder: 'Circular dial, +/- controls and a separate Press button.',
  'mode-selector': 'Row of labeled mode buttons.',
  'mode-icon': 'Single selectable icon button.',
  checkbox: 'Labeled checkbox switch.',
  'combo-box': 'Dropdown of labeled options.',
  'radio-group': 'Labeled fieldset of mutually exclusive radio buttons.',
  'rocker-switch': 'Two-position labeled rocker-style switch.',
  'slide-switch': 'Two-position labeled slider-style switch.',
  knob: 'Circular dial with +/- controls and horizontal range slider.',
  'vertical-slider': 'Vertical range slider with numerical output.',
  'latching-button': 'Labeled two-position switch that retains the active value.',
  'pulse-button': 'Single labeled pulse button.',
  'simulation-command': 'Button labeled with the selected Start/Pause/Resume/Step/Reset command.',
  lamp: 'Colored lamp output with a status glyph.',
  led: 'Compact colored LED/status glyph.',
  lcd: 'Numeric output field with precision and optional unit.',
  gauge: 'Circular 270-degree arc with needle and numerical output.',
  buzzer: 'Text/audio status output: Sounding or Silent; no drawn speaker meter.',
  oled: 'Multiline status panel with title, mode, value, progress and indicators.',
  'half-gauge': 'Semicircular arc with needle and numerical output.',
  'quarter-gauge': 'Quarter-circle arc with needle and numerical output.',
  'linear-gauge': 'Horizontal filled level meter with numerical output.',
  'vertical-gauge': 'Vertical filled level meter with numerical output.',
  'dashboard-scope': 'Time-series SVG plot from committed samples.',
  'xy-plot': 'XY SVG plot pairing two variables from each committed sample.',
  'multi-state-image': 'Image with a caption for the committed state; caption-only without an image URL.',
  'active-state-indicator': 'Active/Inactive dot and selected state name.',
  'alarm-list': 'List of current committed alarms or No active alarms.',
  'progress-bar': 'Horizontal filled progress meter with numerical output.',
  thermometer: 'Vertical filled level meter with temperature output.',
  'tank-level': 'Vertical filled tank-level meter with numerical output.',
  'seven-segment': 'Numeric SVG digits drawn with seven light segments.',
  label: 'Plain explanatory text.',
  image: 'Configured image or a text prompt to set an image URL.',
  panel: 'Named container with a visible header for child widgets.',
  tabs: 'Tabbed container; tab buttons switch the visible child page.',
};

const binding = 'Choose an existing chart variable for a data binding. Inputs require writable permission and are disabled when unbound, invalid or externally owned by hardware/Factory I/O. Boolean input accepts true, false, 1 and 0; numerical input rejects empty and non-finite values and follows the variable type and overflow policy. Displays never write variables. Simulation commands and layout widgets need no data binding.';
const properties = 'Name and x/y/width/height control placement. Numeric controls use minimum, maximum and positive step; precision controls displayed decimals (0–20). Unit is presentation text and does not convert values. Writable applies to input controls; display and layout components stay read-only. Labeled options store finite numeric or Boolean values. Parent and tab IDs describe layout membership. Configure only fields relevant to this widget.';
const semantics = 'The semantic interpreter decides state transitions, actions and timers. HMI commands are applied at tick boundaries after external reads. While paused, accepted input stays staged until Step or Resume. Displays, active-state indicators and traces use committed frames; editing a binding does not change the active state configuration. Reset or model replacement clears staged commands and history.';

export const HMI_HELP_TOPICS: Record<string, HelpTopic> = Object.fromEntries(HMI_CATALOG.map(entry => {
  const [details, example] = widgetDetails[entry.type];
  const appearance = `Visible shape: ${widgetAppearance[entry.type]} Default footprint: ${entry.width} × ${entry.height} CSS pixels; position and size can be edited. This widget has no block-style signal or conserving terminals. ${entry.role === 'input' ? 'Bind a writable chart variable; changes are staged for a semantic tick.' : entry.role === 'display' ? 'Read committed chart variables only; never drive the chart.' : entry.role === 'command' ? 'Calls the chart lifecycle command rather than binding a variable.' : 'Use parent and tab IDs to organize other widgets, not to connect signals.'}`;
  return [`hmi-component-${entry.type}`, {
    title: `HMI: ${entry.label}`, category: 'HMI', description: entry.description,
    content: [entry.description, appearance, details, binding, properties, example, semantics].join('\n\n'),
    sections: [
      { id: 'use', title: 'Behavior', body: `${entry.description} ${details}` },
      { id: 'appearance', title: 'Visible shape and connections', body: appearance },
      { id: 'binding', title: 'Bindings and ownership', body: binding },
      { id: 'properties', title: 'Properties and limits', body: `${details} ${properties}` },
      { id: 'example', title: 'Example', body: example },
      { id: 'semantics', title: 'Simulation semantics', body: semantics },
    ], related: ['hmi_dashboard', 'state-machine-simulation'], sources: ['src/features/hmi/hmiCatalog.ts', 'src/features/hmi/hmiModel.ts'],
  } satisfies HelpTopic];
}));

HMI_HELP_TOPICS.hmi_dashboard = {
  title: 'HMI dashboard', category: 'HMI', description: 'Build an operator workspace with typed inputs, committed displays and layout components.',
  content: `Use Edit to add, select, position and configure catalog widgets; use Run to interact. The workspace mode does not itself start the chart. ${binding}\n\n${properties}\n\n${semantics}\n\nA quick press/release or pulse survives until one tick observes the active value; release follows on the next tick. Pause retains staged input, Step consumes a tick, Resume restarts progression and Reset cancels pending commands. State indicators use committed active states; scopes and XY plots use committed timestamps and values.`,
  sections: [
    { id: 'edit', title: 'Build and bind', body: `Search the Inputs, Displays and Layout catalog, add a component, then configure its binding and properties. ${binding} ${properties}` },
    { id: 'ticks', title: 'Input and committed frames', body: `${semantics} A pulse or rapid press/release remains active for one consumed tick; release follows on the next tick. Paused input stays staged. Reset cancels pending input.`, diagram: {
      kind: 'flow', nodes: [
        { id: 'input', label: 'Operator input', x: 80, y: 70 }, { id: 'queue', label: 'Validate and stage\npaused: retain', x: 260, y: 70 },
        { id: 'external', label: 'External I/O reads', x: 80, y: 210 }, { id: 'apply', label: 'Apply queued values', x: 260, y: 210 },
        { id: 'tick', label: 'Semantic tick', x: 440, y: 210 }, { id: 'frame', label: 'Committed state /\nvalue / trace frame', x: 620, y: 210 },
      ], edges: [{ from: 'input', to: 'queue' }, { from: 'queue', to: 'apply', label: 'Step / running tick' }, { from: 'external', to: 'apply' }, { from: 'apply', to: 'tick' }, { from: 'tick', to: 'frame' }],
      caption: 'Only a semantic tick advances the chart. Reset clears pending commands. A pulse is released after its active tick; display history follows committed frames.',
    } },
    { id: 'state', title: 'State indicators and traces', body: 'Bind an active-state indicator to a chart state ID. Nested and parallel active states come from the committed interpreter configuration. Scopes plot selected variableIds against committed time; XY plots pair X and Y from a common committed sample. Display controls do not execute entry, do or exit actions.' },
    { id: 'example', title: 'Example', body: 'Add a writable toggle bound to RunRequest, a lamp bound to MotorOn and an active-state indicator bound to Running. Pause the chart, change RunRequest and Step once. Inspect the committed output and state indicators; Reset clears staged commands and starts a new history.' },
  ], related: HMI_CATALOG.map(entry => `hmi-component-${entry.type}`), sources: ['src/features/hmi/hmiModel.ts'],
};
