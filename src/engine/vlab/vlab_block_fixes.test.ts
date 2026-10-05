import { describe, it, expect } from 'vitest';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';
import { blockEquations } from './vlabEquations';

describe('VLab Block Port & Parameter Fixes', () => {
  const findBlock = (blockId: string) => {
    for (const domain of VLAB_LIBRARY) {
      const block = domain.blocks.find(b => b.id === blockId);
      if (block) return { domain: domain.type, block };
    }
    throw new Error(`Block ${blockId} not found in VLAB_LIBRARY`);
  };

  describe('variable_resistor', () => {
    it('should define Physical domain on port r and Electrical domain on ports p and n', () => {
      const { block } = findBlock('variable_resistor');
      const portP = block.ports.find(p => p.id === 'p');
      const portN = block.ports.find(p => p.id === 'n');
      const portR = block.ports.find(p => p.id === 'r');

      expect(portP).toBeDefined();
      expect(portP?.domain).toBe('Electrical');

      expect(portN).toBeDefined();
      expect(portN?.domain).toBe('Electrical');

      expect(portR).toBeDefined();
      expect(portR?.domain).toBe('Physical');
    });
  });

  describe('switch', () => {
    it('uses the current control value and preserves zero resistance parameters', () => {
      const equation = blockEquations.switch;
      const args = { across: [10, 0, 1], branch: [1], params: { Ron: 0, Roff: 1_000_000, threshold: 0.5 } } as any;
      expect(equation(args)[0]).toBe(10);
      args.across[2] = 0;
      expect(equation(args)[0]).toBe(-999_990);
    });
    it('should define Physical domain on port v and Electrical domain on ports p and n', () => {
      const { block } = findBlock('switch');
      const portP = block.ports.find(p => p.id === 'p');
      const portN = block.ports.find(p => p.id === 'n');
      const portV = block.ports.find(p => p.id === 'v');

      expect(portP).toBeDefined();
      expect(portP?.domain).toBe('Electrical');

      expect(portN).toBeDefined();
      expect(portN?.domain).toBe('Electrical');

      expect(portV).toBeDefined();
      expect(portV?.domain).toBe('Physical');
    });

    it('should have Roff and threshold parameters defined in block params', () => {
      const { block } = findBlock('switch');

      expect(block.params.Ron).toBeDefined();
      expect(block.params.Ron.value).toBeDefined();

      expect(block.params.Roff).toBeDefined();
      expect(typeof block.params.Roff.value).toBe('number');
      expect(block.params.Roff.unit).toBe('Ω');
      expect(block.params.Roff.label).toMatch(/off resistance/i);

      expect(block.params.threshold).toBeDefined();
      expect(typeof block.params.threshold.value).toBe('number');
      expect(block.params.threshold.label).toMatch(/threshold/i);
    });

    it('should include threshold and Roff in equation', () => {
      const { block } = findBlock('switch');
      expect(block.equation).toContain('threshold');
      expect(block.equation).toContain('Roff');
    });
  });

  describe('diode', () => {
    it('uses the piecewise linear forward and reverse equations with zero-valued resistances', () => {
      const equation = blockEquations.diode;
      expect(equation({ across: [0.70093, 0], branch: [0.09299], params: { Ron: 0.01, Roff: 1_000_000, Vf: 0.7 } } as any)[0]).toBeCloseTo(0, 5);
      expect(equation({ across: [1, 0], branch: [0.1], params: { Ron: 0, Roff: 0, Vf: 0.7 } } as any)[0]).toBeCloseTo(0.3, 10);
      expect(equation({ across: [0.2, 0], branch: [1e-6], params: { Ron: 0.01, Roff: 1_000_000, Vf: 0.7 } } as any)[0]).toBeCloseTo(-0.8, 5);
    });
  });

  it('switches a PS Step at the declared inclusive StepTime', () => {
    const equation = blockEquations.ps_step;
    expect(equation({ branch: [2], params: { time: 1, initial: 0, final: 2 }, ctx: { time: 1 } } as any)[0]).toBe(0);
  });

  describe('translational_electromechanical_converter', () => {
    it('should define Electrical domain on p, n and Translational domain on r, c', () => {
      const { block } = findBlock('translational_electromechanical_converter');
      const portP = block.ports.find(p => p.id === 'p');
      const portN = block.ports.find(p => p.id === 'n');
      const portR = block.ports.find(p => p.id === 'r');
      const portC = block.ports.find(p => p.id === 'c');

      expect(portP).toBeDefined();
      expect(portP?.domain).toBe('Electrical');

      expect(portN).toBeDefined();
      expect(portN?.domain).toBe('Electrical');

      expect(portR).toBeDefined();
      expect(portR?.domain).toBe('Translational');

      expect(portC).toBeDefined();
      expect(portC?.domain).toBe('Translational');
    });
  });
});
