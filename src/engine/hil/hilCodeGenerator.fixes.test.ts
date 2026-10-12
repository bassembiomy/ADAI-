import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { generateHALCode } from './hilCodeGenerator';
import type { HILConfig } from './hilTypes';

let hasGcc = true;
try {
  execSync('gcc --version', { stdio: 'ignore' });
} catch {
  hasGcc = false;
}

const baseConfig = (over: Partial<HILConfig> = {}): HILConfig => ({
  enabled: true,
  target: 'Generic',
  clockSpeed: 1,
  commPort: '',
  baudRate: 115200,
  channels: [
    { id: 'in', name: 'sensor', peripheral: 'ADC', pin: 'A0', direction: 'In', dataType: 'float', rangeMin: 0, rangeMax: 10, scalingFactor: 1, unit: '' },
    { id: 'out', name: 'actuator', peripheral: 'DAC', pin: 'D0', direction: 'Out', dataType: 'float', rangeMin: 0, rangeMax: 10, scalingFactor: 1, unit: '' },
  ],
  mappings: [
    { id: 'm1', adiaVarId: 'v_in', channelId: 'in', direction: 'read' },
    { id: 'm2', adiaVarId: 'v_out', channelId: 'out', direction: 'write', safeValue: 0 },
  ],
  ...over,
} as HILConfig);

const vars = [{ name: 'v_in', type: 'float' }, { name: 'v_out', type: 'float' }];
const fileContent = (files: Array<{ name: string; content: string }>, name: string) =>
  files.find(f => f.name === name)?.content ?? '';

describe('H2 float literals', () => {
  it('emits 2.0f for integer scaling factors and valid C', () => {
    const cfg = baseConfig();
    cfg.channels[0].scalingFactor = 2;
    cfg.channels[1].scalingFactor = 3;
    const files = generateHALCode(cfg, vars, [], []);
    const iface = fileContent(files, 'hil_interface.c');
    expect(iface).toContain('2.0f');
    expect(iface).toContain('3.0f');
    expect(iface).not.toMatch(/[^0-9.]2f\b/);
    if (hasGcc) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hil_lit_'));
      try {
        for (const f of files) fs.writeFileSync(path.join(dir, f.name), f.content);
        fs.writeFileSync(path.join(dir, 'sm_config.h'), '#ifndef SMC_H\n#define SMC_H\n#include <stdint.h>\n#include <stdbool.h>\ntypedef struct { float v_in; float v_out; } D;\ntypedef struct { D data; } ADIA_Instance_t;\n#endif\n');
        fs.writeFileSync(path.join(dir, 'sm_core.h'), '#ifndef SMK_H\n#define SMK_H\n#include "sm_config.h"\ntypedef int SM_Error_t;\n#define SM_ERR_NONE 0\nSM_Error_t SM_GetError(ADIA_Instance_t*);\n#endif\n');
        // Only syntax-check the scaling expressions.
        execSync('gcc -std=c99 -fsyntax-only -I. hil_interface.c', { cwd: dir, stdio: 'pipe' });
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('formats exponent and fractional scaling factors validly', () => {
    const cfg = baseConfig();
    cfg.channels[0].scalingFactor = 1e21;
    cfg.channels[1].scalingFactor = 0.5;
    const iface = fileContent(generateHALCode(cfg, vars, [], []), 'hil_interface.c');
    expect(iface).toContain('1e+21f');
    expect(iface).toContain('0.5f');
  });

  it('rejects non-finite scaling factor and safeValue', () => {
    const cfg = baseConfig();
    cfg.channels[0].scalingFactor = Infinity;
    const errors: string[] = [];
    expect(generateHALCode(cfg, vars, [], errors)).toEqual([]);
    expect(errors.some(e => e.includes('scalingFactor'))).toBe(true);

    const cfg2 = baseConfig();
    cfg2.mappings[1].safeValue = NaN;
    const errors2: string[] = [];
    expect(generateHALCode(cfg2, vars, [], errors2)).toEqual([]);
    expect(errors2.some(e => e.includes('safeValue'))).toBe(true);
  });
});

describe('H3 channel names', () => {
  const withNames = (a: string, b: string) => {
    const cfg = baseConfig();
    cfg.channels[0].name = a;
    cfg.channels[1].name = b;
    return cfg;
  };

  it.each(['bad%name', 'a"b', 'x;y', '1abc', ''])('rejects %j', (bad) => {
    const errors: string[] = [];
    const files = generateHALCode(withNames(bad, 'actuator'), vars, [], errors);
    expect(files).toEqual([]);
    expect(errors.some(e => e.includes('must be a C identifier'))).toBe(true);
  });

  it('rejects names longer than 48 characters', () => {
    const errors: string[] = [];
    expect(generateHALCode(withNames('a'.repeat(49), 'actuator'), vars, [], errors)).toEqual([]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects names colliding after case folding (Speed/SPEED)', () => {
    const errors: string[] = [];
    const files = generateHALCode(withNames('Speed', 'SPEED'), vars, [], errors);
    expect(files).toEqual([]);
    expect(errors.some(e => e.includes('collides'))).toBe(true);
  });

  it('reports to warnings when errors array is undefined, and still emits nothing', () => {
    const warnings: string[] = [];
    // Without an errors sink the invalid configuration must still not generate files.
    const files = generateHALCode(withNames('x;y', 'actuator'), vars, warnings);
    expect(files).toEqual([]);
    expect(warnings.some(w => w.includes('must be a C identifier'))).toBe(true);
  });

  it('accepts valid identifiers', () => {
    const errors: string[] = [];
    expect(generateHALCode(withNames('sensor_1', '_act2'), vars, [], errors).length).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
});

describe('H4 telemetry of unmapped variables', () => {
  it('falls back to the peripheral read when the mapped variable does not exist', () => {
    const cfg = baseConfig();
    cfg.mappings[0].adiaVarId = 'missing_var';
    const warnings: string[] = [];
    const iface = fileContent(generateHALCode(cfg, vars, warnings, []), 'hil_interface.c');
    expect(iface).not.toContain('instance->data.missing_var');
    expect(iface).toContain('HAL_ADC_Read(PIN_SENSOR');
    expect(warnings.some(w => w.includes('missing_var'))).toBe(true);
  });

  it('still reads mapped variables that exist', () => {
    const iface = fileContent(generateHALCode(baseConfig(), vars, [], []), 'hil_interface.c');
    expect(iface).toContain('instance->data.v_in');
  });
});
