import { describe, it, expect } from 'vitest';
import { parseSimulink } from './simulinkImporter';
import { parseScilab } from './scilabImporter';
import { compileExternalPattern } from './xbridgesCompatibilityCompiler';
import { ExternalModel } from './externalModel';
import { buildXbridgesCapabilityIndex } from '../catalog/xbridgesCapabilityIndex';
import JSZip from 'jszip';

describe('External Model Importers (Simulink & Scilab) and Compatibility Compiler', () => {
  describe('Simulink Importer Security & Parsing', () => {
    it('rejects zip-slip paths in .slx archive', async () => {
      const zip = new JSZip();
      zip.file('../../../evil.xml', '<model></model>');
      zip.file('simulink/blockdiagram.xml', '<model></model>');
      const buffer = await zip.generateAsync({ type: 'nodebuffer' });

      await expect(parseSimulink(buffer)).rejects.toThrow(/zip-slip|traversal|invalid path/i);
    });

    it('rejects archives containing executable scripts or macros', async () => {
      const zip = new JSZip();
      zip.file('simulink/blockdiagram.xml', '<model></model>');
      zip.file('simulink/preload_fcn.m', 'system("calc.exe")');
      const buffer = await zip.generateAsync({ type: 'nodebuffer' });

      await expect(parseSimulink(buffer)).rejects.toThrow(/executable|macro|script/i);
    });

    it('rejects XML with XXE / entity expansions or external references', async () => {
      const zip = new JSZip();
      const xxeXml = `<?xml version="1.0"?>
      <!DOCTYPE foo [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>
      <ModelInformation><foo>&xxe;</foo></ModelInformation>`;
      zip.file('simulink/blockdiagram.xml', xxeXml);
      const buffer = await zip.generateAsync({ type: 'nodebuffer' });

      await expect(parseSimulink(buffer)).rejects.toThrow(/entity|doctype|prohibited/i);
    });

    it('rejects oversized archive entries (zip bomb protection)', async () => {
      const zip = new JSZip();
      // Generate entry reporting massive size or throw on extraction limit
      const bigContent = 'x'.repeat(1024 * 1024 * 11); // 11MB exceeds default 10MB limit
      zip.file('simulink/blockdiagram.xml', bigContent);
      const buffer = await zip.generateAsync({ type: 'nodebuffer' });

      await expect(parseSimulink(buffer)).rejects.toThrow(/oversized|size limit/i);
    });

    it('rejects malformed or empty archives without blockdiagram.xml', async () => {
      const zip = new JSZip();
      zip.file('random.txt', 'hello world');
      const buffer = await zip.generateAsync({ type: 'nodebuffer' });

      await expect(parseSimulink(buffer)).rejects.toThrow(/missing blockdiagram|invalid slx/i);
    });

    it('parses valid safe Simulink SLX into ExternalModel AST', async () => {
      const zip = new JSZip();
      const validSimulinkXml = `<?xml version="1.0" encoding="utf-8"?>
      <ModelInformation Version="1.0">
        <Model Name="PID_Feedback_Simulink">
          <System>
            <Block BlockType="Step" Name="StepSource" SID="1">
              <P Name="Time">1.0</P>
              <P Name="After">5.0</P>
              <Port PortType="out" Index="1" Name="out"/>
            </Block>
            <Block BlockType="PIDController" Name="PID" SID="2">
              <P Name="P">2.5</P>
              <P Name="I">1.2</P>
              <P Name="D">0.05</P>
              <Port PortType="in" Index="1" Name="r"/>
              <Port PortType="out" Index="1" Name="u"/>
            </Block>
            <Line Name="Conn1">
              <P Name="Src">1#out:1</P>
              <P Name="Dst">2#in:1</P>
            </Line>
          </System>
        </Model>
      </ModelInformation>`;

      zip.file('simulink/blockdiagram.xml', validSimulinkXml);
      const buffer = await zip.generateAsync({ type: 'nodebuffer' });

      const model = await parseSimulink(buffer, { sourceName: 'test_pid.slx' });
      expect(model.sourceFormat).toBe('simulink');
      expect(model.name).toBe('PID_Feedback_Simulink');
      expect(model.components).toHaveLength(2);
      expect(model.components[0].externalType).toBe('Step');
      expect(model.components[1].externalType).toBe('PIDController');
      expect(model.links).toHaveLength(1);
      expect(model.links[0].sourceComponentId).toBe('1');
      expect(model.links[0].targetComponentId).toBe('2');
    });
  });

  describe('Scilab / Xcos Importer Security & Parsing', () => {
    it('rejects Scilab content with XML entity declarations (XXE protection)', async () => {
      const xxeContent = `<?xml version="1.0"?>
      <!DOCTYPE Xcos [ <!ENTITY evil "malicious"> ]>
      <XcosDiagram>&evil;</XcosDiagram>`;

      await expect(parseScilab(xxeContent)).rejects.toThrow(/entity|doctype|prohibited/i);
    });

    it('rejects oversized Scilab content', async () => {
      const bigContent = '<XcosDiagram>' + ' '.repeat(1024 * 1024 * 11) + '</XcosDiagram>';
      await expect(parseScilab(bigContent)).rejects.toThrow(/oversized|size limit/i);
    });

    it('rejects scripts or macros inside Scilab diagrams', async () => {
      const scriptDiagram = `<XcosDiagram>
        <ScriptBlock code="exec('harmful.sci');" />
      </XcosDiagram>`;

      await expect(parseScilab(scriptDiagram)).rejects.toThrow(/executable|macro|script/i);
    });

    it('parses valid Scilab / Xcos XML into ExternalModel AST', async () => {
      const validXcos = `<?xml version="1.0" encoding="utf-8"?>
      <XcosDiagram title="Gain_Test">
        <BasicBlock id="blk_step" interfaceFunctionName="STEP_FUNCTION" blockType="c">
          <ExplicitOutputPort id="p_out" />
          <Array as="parameters" name="realParameters">
            <ScilabDouble height="1" width="1">
              <data line="0" column="0" value="2.0" />
            </ScilabDouble>
          </Array>
        </BasicBlock>
        <BasicBlock id="blk_gain" interfaceFunctionName="GAINBLK" blockType="d">
          <ExplicitInputPort id="p_in" />
          <ExplicitOutputPort id="p_gain_out" />
          <Array as="parameters" name="realParameters">
            <ScilabDouble height="1" width="1">
              <data line="0" column="0" value="10.0" />
            </ScilabDouble>
          </Array>
        </BasicBlock>
        <ExplicitLink id="link_1" from="blk_step:p_out" to="blk_gain:p_in" />
      </XcosDiagram>`;

      const model = await parseScilab(validXcos, { sourceName: 'gain_test.xcos' });
      expect(model.sourceFormat).toBe('scilab');
      expect(model.name).toBe('Gain_Test');
      expect(model.components).toHaveLength(2);
      expect(model.links).toHaveLength(1);
    });
  });

  describe('Compatibility Compiler & Mapping Table', () => {
    const catalog = buildXbridgesCapabilityIndex();

    it('maps recognized Simulink components to active X-Bridges catalog blocks', () => {
      const external: ExternalModel = {
        name: 'MappedModel',
        sourceFormat: 'simulink',
        provenance: { source: 'test.slx', author: 'tester', license: 'MIT' },
        components: [
          {
            id: '1',
            name: 'StepSource',
            externalType: 'Step',
            parameters: { Time: 1.0, After: 5.0 },
            ports: [{ id: 'out', direction: 'out' }]
          },
          {
            id: '2',
            name: 'GainBlock',
            externalType: 'Gain',
            parameters: { Gain: 3.5 },
            ports: [{ id: 'u', direction: 'in' }, { id: 'y', direction: 'out' }]
          }
        ],
        links: [
          {
            id: 'link1',
            sourceComponentId: '1',
            sourcePortId: 'out',
            targetComponentId: '2',
            targetPortId: 'u'
          }
        ],
        unsupportedConstructs: []
      };

      const result = compileExternalPattern(external, catalog);
      expect(result.status).toBe('compatible');
      expect(result.pattern).toBeDefined();
      expect(result.pattern?.lifecycle).toBe('quarantined');
      expect(result.pattern?.topology.blocks).toHaveLength(2);
      expect(result.pattern?.topology.blocks[0].blockId).toBe('Step');
      expect(result.pattern?.topology.blocks[1].blockId).toBe('GAIN');
      expect(result.pattern?.topology.connections).toHaveLength(1);
    });

    it('returns UNMAPPED_EXTERNAL_COMPONENT with source location for unmapped components without guessing', () => {
      const external: ExternalModel = {
        name: 'UnmappedModel',
        sourceFormat: 'simulink',
        provenance: { source: 'test.slx', author: 'tester', license: 'MIT' },
        components: [
          {
            id: 'bad_1',
            name: 'StateflowChart',
            externalType: 'Stateflow.Chart',
            sourceLocation: 'Root/StateflowChart',
            parameters: {},
            ports: []
          }
        ],
        links: [],
        unsupportedConstructs: []
      };

      const result = compileExternalPattern(external, catalog);
      expect(result.status).toBe('incompatible');
      expect(result.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'UNMAPPED_EXTERNAL_COMPONENT',
            entityId: 'bad_1',
            remediation: expect.stringContaining('Stateflow.Chart')
          })
        ])
      );
    });

    it('rejects external models with unsupported constructs or unrecognized ports', () => {
      const external: ExternalModel = {
        name: 'InvalidPortModel',
        sourceFormat: 'scilab',
        provenance: { source: 'test.xcos', author: 'tester', license: 'MIT' },
        components: [
          {
            id: '1',
            name: 'Step1',
            externalType: 'STEP_FUNCTION',
            parameters: {},
            ports: [{ id: 'nonexistent_port', direction: 'out' }]
          }
        ],
        links: [],
        unsupportedConstructs: ['S-Function embedded C wrapper']
      };

      const result = compileExternalPattern(external, catalog);
      expect(result.status).toBe('incompatible');
      expect(result.diagnostics.some(d => d.code === 'UNSUPPORTED_CONSTRUCT')).toBe(true);
    });
  });
});
