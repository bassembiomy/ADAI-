import { describe, it, expect } from 'vitest';
import { validateImportedJson } from './jsonImportValidator';

describe('jsonImportValidator', () => {
  it('rejects non-object primitives and null', () => {
    expect(validateImportedJson(null).isValid).toBe(false);
    expect(validateImportedJson("hello").isValid).toBe(false);
    expect(validateImportedJson(123).isValid).toBe(false);
    expect(validateImportedJson([]).isValid).toBe(false);
  });

  it('rejects objects with non-array mandatory collections', () => {
    const badData = { states: "not-an-array" };
    const res = validateImportedJson(badData);
    expect(res.isValid).toBe(false);
    expect(res.errors).toContain("Field 'states' must be an array (found string).");
  });

  it('rejects nodes with invalid positions (NaN/Infinity)', () => {
    const badData = {
      states: [
        { id: 's1', position: { x: NaN, y: 100 } }
      ]
    };
    const res = validateImportedJson(badData);
    expect(res.isValid).toBe(false);
    expect(res.errors.some(e => e.includes('position'))).toBe(true);
  });

  it('accepts valid ADIA project payload', () => {
    const validProject = {
      projectName: 'Test Project',
      states: [{ id: 's1', name: 'State1', position: { x: 10, y: 20 } }],
      workspaceFiles: []
    };
    const res = validateImportedJson(validProject);
    expect(res.isValid).toBe(true);
    expect(res.errors.length).toBe(0);
  });

  it('accepts valid module asset payload', () => {
    const validModule = {
      vlabNodes: [{ id: 'n1', type: 'resistor', x: 50, y: 50 }],
      vlabEdges: []
    };
    const res = validateImportedJson(validModule);
    expect(res.isValid).toBe(true);
    expect(res.detectedType).toBe('vlab');
  });
});
