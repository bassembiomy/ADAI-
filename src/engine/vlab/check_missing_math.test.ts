import { describe, it } from 'vitest';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';
import { blockEquations } from './vlabEquations';
import { DAEAssembler } from './DAEAssembler';

describe('Check Missing Mathematics', () => {
  it('identifies blocks in library that have no equation factory', () => {
    const allBlocks = VLAB_LIBRARY.flatMap(d => d.blocks);
    const missingEquations: string[] = [];

    allBlocks.forEach(block => {
      if (!blockEquations[block.id]) {
        missingEquations.push(block.id);
      }
    });

    console.log("Blocks with missing equation factory:", missingEquations);
  });

  it('identifies blocks in library that are not handled in getComponentSpec of DAEAssembler', () => {
    const allBlocks = VLAB_LIBRARY.flatMap(d => d.blocks);
    const assembler = new DAEAssembler();
    
    // We can inspect the getComponentSpec method or check if it throws/crashes when we ask for spec
    const getComponentSpec = (assembler as any).getComponentSpec || (DAEAssembler.prototype as any).getComponentSpec;
    
    if (getComponentSpec) {
      const missingSpec: string[] = [];
      allBlocks.forEach(block => {
        const ports = block.ports.map(p => p.id);
        const spec = getComponentSpec(block.id, block.id, ports);
        
        // A block is "unhandled" if it falls into the default block and might have mismatched state/branch definitions
        // Let's check if there are specific states or branches that are expected but not allocated
        // E.g. if the equation uses state or dState but spec.states is empty
      });
    }
  });
});
