import { describe, it, expect } from 'vitest';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';

describe('VLab Belt and Pulley Domain Definitions', () => {
  const findBlock = (id: string) => {
    for (const group of VLAB_LIBRARY) {
      const b = group.blocks.find(blk => blk.id === id);
      if (b) return b;
    }
    return undefined;
  };

  it('belt_properties has port p with domain BeltProperty at right', () => {
    const block = findBlock('belt_properties');
    expect(block).toBeDefined();
    expect(block!.ports).toEqual([
      { id: 'p', pos: 'right', label: 'P', domain: 'BeltProperty' }
    ]);
  });

  it('belt_end has translational mechanical ports, BeltProperty p, and Physical f measurement port', () => {
    const block = findBlock('belt_end');
    expect(block).toBeDefined();
    expect(block!.ports).toEqual([
      { id: 'r', pos: 'left', label: 'R', domain: 'Translational' },
      { id: 'e', pos: 'right', label: 'E', domain: 'Translational' },
      { id: 'p', pos: 'top', label: 'P', domain: 'BeltProperty' },
      { id: 'f', pos: 'bottom', label: 'F', domain: 'Physical' }
    ]);
  });

  it('belt_spool has rotational r, translational a, BeltProperty p, and Physical t measurement port', () => {
    const block = findBlock('belt_spool');
    expect(block).toBeDefined();
    expect(block!.ports).toEqual([
      { id: 'r', pos: 'left', label: 'R', domain: 'Rotational' },
      { id: 'a', pos: 'right', label: 'A', domain: 'Translational' },
      { id: 'p', pos: 'top', label: 'P', domain: 'BeltProperty' },
      { id: 't', pos: 'bottom', label: 'T', domain: 'Physical' }
    ]);
  });

  it('pulley has rotational r, translational a and b, BeltProperty p, and Physical t measurement port', () => {
    const block = findBlock('pulley');
    expect(block).toBeDefined();
    expect(block!.ports).toEqual([
      { id: 'r', pos: 'left', label: 'R', domain: 'Rotational' },
      { id: 'a', pos: 'right', label: 'A', domain: 'Translational' },
      { id: 'b', pos: 'right', label: 'B', domain: 'Translational' },
      { id: 'p', pos: 'top', label: 'P', domain: 'BeltProperty' },
      { id: 't', pos: 'bottom', label: 'T', domain: 'Physical' }
    ]);
  });
});
