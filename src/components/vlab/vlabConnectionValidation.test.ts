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

  // Domain-bridge converters join blocks from two different physical models,
  // so they accept a connection from ANY domain on either side.
  const isDomainBridge = (type: string) =>
    ['ps_simulink_conv', 'simulink_ps_conv'].includes((type || '').toLowerCase());

  const isWildcardDomain = (d: any) =>
    typeof d === 'string' && ['any', 'all', 'universal'].includes(d.toLowerCase());

  if (isUniversal(sourceNode.data.type) || isUniversal(targetNode.data.type)) {
    return { valid: true };
  }

  const sPortId = sourceHandle?.split('-').pop()?.replace(/_[st]$/, '');
  const tPortId = targetHandle?.split('-').pop()?.replace(/_[st]$/, '');

  const sPort = sourceNode.data.ports?.find((p: any) => p.id === sPortId);
  const tPort = targetNode.data.ports?.find((p: any) => p.id === tPortId);

  const sDomain = (sPort?.domain || sourceNode.data.domain || '').toLowerCase();
  const tDomain = (tPort?.domain || targetNode.data.domain || '').toLowerCase();

  if (isDomainBridge(sourceNode.data.type) || isDomainBridge(targetNode.data.type)) {
    return { valid: true };
  }

  if (isWildcardDomain(sDomain) || isWildcardDomain(tDomain)) {
    return { valid: true };
  }

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

  it('rejects a PS Constant connected directly to an electrical conserving port', () => {
    const psConstant = {
      data: {
        type: 'ps_constant',
        ports: [{ id: 'y', domain: 'Physical' }],
        label: 'DC Command'
      }
    };
    const resistor = {
      data: {
        type: 'resistor',
        ports: [{ id: 'p', domain: 'Electrical' }, { id: 'n', domain: 'Electrical' }],
        label: 'Load'
      }
    };

    const result = validateConnection(psConstant, resistor, 'y_s', 'p_t');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Cannot connect physical port (DC Command) to electrical port (Load)');
  });

  it('allows a PS Constant to drive the physical-signal control port of a controlled voltage source', () => {
    const psConstant = {
      data: {
        type: 'ps_constant',
        ports: [{ id: 'y', domain: 'Physical' }],
        label: 'Voltage Command'
      }
    };
    const controlledVoltage = {
      data: {
        type: 'controlled_voltage',
        ports: [
          { id: 'p', domain: 'Electrical' },
          { id: 'n', domain: 'Electrical' },
          { id: 's', domain: 'Physical' }
        ],
        label: 'Controlled Source'
      }
    };

    const result = validateConnection(psConstant, controlledVoltage, 'y_s', 's_t');
    expect(result.valid).toBe(true);
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

  it('allows PS-Simulink converter to accept an electrical domain connection', () => {
    const resistor = {
      data: {
        type: 'resistor',
        ports: [{ id: 'p', domain: 'Electrical' }, { id: 'n', domain: 'Electrical' }],
        label: 'Load'
      }
    };
    const converter = {
      data: {
        type: 'ps_simulink_conv',
        domain: 'Utilities',
        ports: [{ id: 'in', domain: 'Any' }, { id: 'out', domain: 'Any' }],
        label: 'PS-Simulink Converter'
      }
    };

    const result = validateConnection(resistor, converter, 'p_s', 'in_t');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('allows Simulink-PS converter to bridge two different domains (thermal -> rotational)', () => {
    const heater = {
      data: { type: 'upper_heater', domain: 'Thermal', label: 'Heater' }
    };
    const motor = {
      data: { type: 'dc_motor', domain: 'Rotational', label: 'Motor' }
    };
    const converter = {
      data: { type: 'simulink_ps_conv', domain: 'Utilities', label: 'Simulink-PS Converter' }
    };

    expect(validateConnection(heater, converter).valid).toBe(true);
    expect(validateConnection(converter, motor).valid).toBe(true);
  });

  it('allows any port tagged with the Any wildcard domain to connect across domains', () => {
    const gasValve = {
      data: {
        type: 'gas_resistance',
        ports: [{ id: 'a', domain: 'Gas' }],
        label: 'Valve'
      }
    };
    const bridge = {
      data: {
        type: 'custom_bridge',
        ports: [{ id: 'in', domain: 'Any' }],
        label: 'Bridge'
      }
    };

    const result = validateConnection(gasValve, bridge, 'a_s', 'in_t');
    expect(result.valid).toBe(true);
  });
});
