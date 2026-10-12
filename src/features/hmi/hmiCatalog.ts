import type { HmiComponent, HmiComponentType } from '../../types/sysml_types';

export interface HmiDefinition {
  type: HmiComponentType;
  label: string;
  category: 'Inputs' | 'Displays' | 'Layout';
  description: string;
  width: number;
  height: number;
  role: 'input' | 'display' | 'layout' | 'command';
}

const inputs: HmiComponentType[] = ['toggle', 'button', 'slider', 'input', 'rotary', 'hybrid-rotary', 'encoder', 'mode-selector', 'mode-icon', 'checkbox', 'combo-box', 'radio-group', 'rocker-switch', 'slide-switch', 'knob', 'vertical-slider', 'latching-button', 'pulse-button'];
const displays: HmiComponentType[] = ['lamp', 'led', 'lcd', 'gauge', 'buzzer', 'oled', 'half-gauge', 'quarter-gauge', 'linear-gauge', 'vertical-gauge', 'dashboard-scope', 'xy-plot', 'multi-state-image', 'active-state-indicator', 'alarm-list', 'progress-bar', 'thermometer', 'tank-level', 'seven-segment'];
const layouts: HmiComponentType[] = ['label', 'image', 'panel', 'tabs'];
const descriptions: Record<HmiComponentType, string> = {
  toggle: 'Switches a Boolean operator input on or off.', button: 'Holds an input active until released.', slider: 'Selects a numeric value along a horizontal range.', input: 'Enters a typed numeric or Boolean value.',
  rotary: 'Selects a numeric value with a rotary dial.', 'hybrid-rotary': 'Selects a configured discrete rotary value.', encoder: 'Selects encoder values and supports a separate press binding.', 'mode-selector': 'Selects a configured operating mode.', 'mode-icon': 'Sets a configured mode value using an icon.',
  checkbox: 'Checks or clears a Boolean input.', 'combo-box': 'Chooses one labeled value from a dropdown.', 'radio-group': 'Chooses one labeled value from visible alternatives.', 'rocker-switch': 'Rocks between active and inactive input values.', 'slide-switch': 'Slides between active and inactive input values.', knob: 'Adjusts a continuous numeric input using a dial.', 'vertical-slider': 'Selects a numeric value along a vertical range.', 'latching-button': 'Retains its active input value until pressed again.', 'pulse-button': 'Queues an active input for one simulation tick.', 'simulation-command': 'Starts, pauses, resumes, steps or resets the simulation.',
  lamp: 'Lights when its committed variable is active.', led: 'Shows a compact committed Boolean indicator.', lcd: 'Displays a committed numeric value with units and precision.', gauge: 'Shows a committed value on a circular scale.', buzzer: 'Signals an active committed variable with sound.', oled: 'Combines committed mode, temperature, status and progress indicators.', 'half-gauge': 'Shows a committed value on a semicircular scale.', 'quarter-gauge': 'Shows a committed value on a quarter-circle scale.', 'linear-gauge': 'Shows a committed value on a horizontal scale.', 'vertical-gauge': 'Shows a committed value on a vertical scale.', 'dashboard-scope': 'Plots selected variables against committed simulation time.', 'xy-plot': 'Plots a pair of committed variables against each other.', 'multi-state-image': 'Displays an image and the current selected variable state.', 'active-state-indicator': 'Indicates whether a chart state is in the committed active configuration.', 'alarm-list': 'Lists selected committed variables exceeding an alarm threshold.', 'progress-bar': 'Shows committed progress within a configured range.', thermometer: 'Shows a committed temperature on a vertical scale.', 'tank-level': 'Shows committed fill level within a configured range.', 'seven-segment': 'Displays a committed number in seven-segment style.',
  label: 'Adds explanatory text to the workspace.', image: 'Adds an image to the workspace.', panel: 'Groups related workspace components.', tabs: 'Organizes components into named tab pages.',
};
const dimensions = (type: HmiComponentType): [number, number] => {
  if (type === 'dashboard-scope' || type === 'xy-plot') return [320, 200];
  if (type === 'panel' || type === 'tabs') return [360, 240];
  if (type === 'oled') return [280, 190];
  if (type === 'vertical-slider' || type === 'vertical-gauge' || type === 'thermometer' || type === 'tank-level') return [100, 220];
  if (type.includes('gauge') || type === 'knob' || type.includes('rotary')) return [180, 160];
  return [180, 90];
};
const definition = (type: HmiComponentType, category: HmiDefinition['category'], role: HmiDefinition['role']): HmiDefinition => {
  const [width, height] = dimensions(type);
  const label = type.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
  return { type, label, category, role, width, height, description: descriptions[type] };
};
export const HMI_CATALOG: readonly HmiDefinition[] = [
  ...inputs.map(type => definition(type, 'Inputs', 'input')),
  definition('simulation-command', 'Inputs', 'command'),
  ...displays.map(type => definition(type, 'Displays', 'display')),
  ...layouts.map(type => definition(type, 'Layout', 'layout')),
];
export const getHmiDefinition = (type: string): HmiDefinition | undefined => HMI_CATALOG.find(entry => entry.type === type);
export const createHmiComponent = (type: HmiComponentType, id: string): HmiComponent => {
  const entry = getHmiDefinition(type);
  if (!entry) throw new Error(`Unknown HMI component type '${type}'.`);
  return { id, type, name: entry.label, x: 20, y: 20, width: entry.width, height: entry.height, variableId: null, min: 0, max: 100, step: 1, precision: 2, writable: entry.role === 'input', ...(type === 'simulation-command' ? { command: 'start' as const } : {}), ...(type === 'tabs' ? { tabs: [{ id: 'tab-1', label: 'Tab 1' }] } : {}) };
};
