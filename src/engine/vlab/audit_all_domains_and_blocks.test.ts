import { describe, it, expect } from 'vitest';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';
import { blockEquations } from './vlabEquations';
import { DAEAssembler } from './DAEAssembler';

describe('VLab Comprehensive Audit: Domains and Mathematical Base', () => {
  it('Domain Completeness Audit: No domain is empty', () => {
    expect(VLAB_LIBRARY.length).toBeGreaterThan(0);
    const domainStats = VLAB_LIBRARY.map(d => ({
      domain: d.type,
      blockCount: d.blocks.length,
      isEmpty: d.blocks.length === 0
    }));

    console.log('=== VLAB DOMAIN INVENTORY ===');
    domainStats.forEach(d => {
      console.log(`Domain: "${d.domain}" -> ${d.blockCount} blocks`);
      expect(d.blockCount).toBeGreaterThan(0);
      expect(d.isEmpty).toBe(false);
    });
  });

  it('Mathematical Base Audit: Every single block in every domain has a mathematical equation factory', () => {
    const allBlocks = VLAB_LIBRARY.flatMap(d => d.blocks.map(b => ({ ...b, domain: d.type })));
    const missingMath: { id: string; name: string; domain: string }[] = [];

    allBlocks.forEach(b => {
      if (!blockEquations[b.id] || typeof blockEquations[b.id] !== 'function') {
        missingMath.push({ id: b.id, name: b.name, domain: b.domain });
      }
    });

    console.log(`Total blocks checked: ${allBlocks.length}`);
    console.log('Missing mathematical factories:', missingMath);
    expect(missingMath).toEqual([]);
  });

  it('Metadata & Description Completeness: Checks equation strings and descriptions', () => {
    const allBlocks = VLAB_LIBRARY.flatMap(d => d.blocks.map(b => ({ ...b, domain: d.type })));
    const missingEquationString: string[] = [];
    const missingDescription: string[] = [];

    allBlocks.forEach(b => {
      if (!b.equation || b.equation.trim() === '') {
        missingEquationString.push(`${b.domain} -> ${b.id} (${b.name})`);
      }
      if (!b.description || b.description.trim() === '') {
        missingDescription.push(`${b.domain} -> ${b.id} (${b.name})`);
      }
    });

    console.log(`Blocks missing equation string: ${missingEquationString.length} / ${allBlocks.length}`);
    if (missingEquationString.length > 0) {
      console.log('First 20 missing equation strings:', missingEquationString.slice(0, 20));
    }
    console.log(`Blocks missing description: ${missingDescription.length} / ${allBlocks.length}`);
    if (missingDescription.length > 0) {
      console.log('First 20 missing descriptions:', missingDescription.slice(0, 20));
    }
  });

  it('Port & Specification Completeness: Every block has valid ports and spec', () => {
    const allBlocks = VLAB_LIBRARY.flatMap(d => d.blocks.map(b => ({ ...b, domain: d.type })));
    const assembler = new DAEAssembler();

    allBlocks.forEach(b => {
      expect(b.id).toBeDefined();
      expect(b.name).toBeDefined();
      expect(b.color).toBeDefined();
      expect(b.icon).toBeDefined();
      expect(Array.isArray(b.ports)).toBe(true);
      expect(b.equation).toBeDefined();
      expect(b.equation!.length).toBeGreaterThan(0);
      expect(b.description).toBeDefined();
      expect(b.description!.length).toBeGreaterThan(0);

      // Verify assembly for single node produces a valid DAE system without throwing
      const nodes = [{
        id: 'test_node',
        type: b.id,
        data: { id: 'test_node', blockId: b.id, params: b.params, ports: b.ports },
        position: { x: 0, y: 0 }
      }];
      const system = assembler.assemble(nodes as any, []);
      expect(system).toBeDefined();
      expect(system.systemSize).toBeGreaterThanOrEqual(0);
    });
  });
});
