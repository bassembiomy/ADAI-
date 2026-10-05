import { describe, it, expect } from 'vitest';
import { parseScilab } from './scilabImporter';
import { compileExternalPattern } from './xbridgesCompatibilityCompiler';
import { buildXbridgesCapabilityIndex } from '../catalog/xbridgesCapabilityIndex';

describe('Scilab Importer Dedicated Tests', () => {
  const catalog = buildXbridgesCapabilityIndex();

  it('parses Scilab Xcos XML with gain and step, compiling into quarantined pattern', async () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
    <XcosDiagram title="Scilab_Filter_Test">
      <BasicBlock id="b_step" interfaceFunctionName="STEP_FUNCTION" blockType="c">
        <ExplicitOutputPort id="p_out" />
      </BasicBlock>
      <BasicBlock id="b_gain" interfaceFunctionName="GAINBLK" blockType="d">
        <ExplicitInputPort id="p_in" />
        <ExplicitOutputPort id="p_gain_out" />
        <Array as="parameters" name="realParameters">
          <ScilabDouble height="1" width="1">
            <data line="0" column="0" value="4.0" />
          </ScilabDouble>
        </Array>
      </BasicBlock>
      <ExplicitLink id="l1" from="b_step:p_out" to="b_gain:p_in" />
    </XcosDiagram>`;

    const external = await parseScilab(xml, { sourceName: 'filter.xcos', license: 'MIT' });
    expect(external.name).toBe('Scilab_Filter_Test');
    expect(external.components).toHaveLength(2);

    const result = compileExternalPattern(external, catalog);
    expect(result.status).toBe('compatible');
    expect(result.pattern).toBeDefined();
    expect(result.pattern?.lifecycle).toBe('quarantined');
    expect(result.pattern?.topology.blocks.map(b => b.blockId)).toEqual(['Step', 'GAIN']);
  });
});
