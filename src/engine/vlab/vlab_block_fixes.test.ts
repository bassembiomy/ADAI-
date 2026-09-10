import { describe, it, expect } from 'vitest';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';

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
