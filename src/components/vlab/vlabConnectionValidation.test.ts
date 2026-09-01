import { describe, it, expect } from 'vitest';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';

export const validateConnection = (
  sourceNode: { data: { type: string; domain?: string; ports?: any[]; label?: string } },
  targetNode: { data: { type: string; domain?: string; ports?: any[]; label?: string } },
  sourceHandle?: string,
  targetHandle?: string
): { valid: boolean; error?: string } => {
  const isUniversal = (type: string) =>
    ['scope', 'vlab_probe', 'conn_label', 'ps_terminator', 'subsystem', 'inport', 'outport', 'solver_config', 'solver_configuration'].includes(
      (type || '').toLowerCase()
    );

  if (isUniversal(sourceNode.data.type) || isUniversal(targetNode.data.type)) {
    return { valid: true };
  }

  const sPortId = sourceHandle?.split('-').pop()?.replace(/_[st]$/, '');
  const tPortId = targetHandle?.split('-').pop()?.replace(/_[st]$/, '');

  const sPort = sourceNode.data.ports?.find((p: any) => p.id === sPortId);
  const tPort = targetNode.data.ports?.find((p: any) => p.id === tPortId);

  const sDomain = (sPort?.domain || sourceNode.data.domain || '').toLowerCase();
  const tDomain = (tPort?.domain || targetNode.data.domain || '').toLowerCase();

  if (sDomain && tDomain && sDomain !== tDomain) {
    const sName = sourceNode.data.label || sourceNode.data.type;
    const tName = targetNode.data.label || targetNode.data.type;
    return {
      valid: false,
      error: `Cannot connect ${sDomain} port (${sName}) to ${tDomain} port (${tName}). Use a domain converter block.`
    };
  }

  return { valid: true };
};

describe('VLab Port Connection Validation', () => {
  it('identifies mismatched domains (e.g. electrical to thermal) as invalid with error message', () => {
    const electricalNode = {
      data: { type: 'dc_voltage', domain: 'Electrical', label: '24V Battery' }
    };
    const thermalNode = {
      data: { type: 'thermal_resistor', domain: 'Thermal', label: 'Heater' }
    };

    const result = validateConnection(electricalNode, thermalNode);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Cannot connect electrical port (24V Battery) to thermal port (Heater)');
  });

  it('allows matching physical domains (e.g. electrical to electrical)', () => {
    const battery = {
      data: { type: 'dc_voltage', domain: 'Electrical', label: 'Battery' }
    };
    const resistor = {
      data: { type: 'resistor', domain: 'Electrical', label: 'Resistor' }
    };

    const result = validateConnection(battery, resistor);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('allows universal measurement connections to scope or probe across domains', () => {
    const thermalSensor = {
      data: { type: 'temp_sensor', domain: 'Thermal', label: 'Temp Sensor' }
    };
    const scope = {
      data: { type: 'scope', domain: 'Signal', label: 'Monitor' }
    };

    const result = validateConnection(thermalSensor, scope);
    expect(result.valid).toBe(true);
  });

  it('allows solver_config to connect to ground and any domain reference block', () => {
    const ground = {
      data: { type: 'ground', domain: 'Electrical', label: 'Ground' }
    };
    const solverConfig = {
      data: { type: 'solver_config', domain: 'Utilities', label: 'Solver Configuration' }
    };

    const result = validateConnection(solverConfig, ground);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });
});
