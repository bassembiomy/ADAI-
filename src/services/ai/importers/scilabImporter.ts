import { ExternalModel, ExternalComponent, ExternalLink, ExternalPort } from './externalModel';

const MAX_SCILAB_SIZE = 10 * 1024 * 1024; // 10 MB

export interface ScilabParserOptions {
  sourceName?: string;
  author?: string;
  license?: string;
  checksum?: string;
}

function checkXmlSecurity(xml: string): void {
  if (xml.length > MAX_SCILAB_SIZE) {
    throw new Error(`Security Violation: Oversized Scilab file (${xml.length} bytes exceeds maximum size limit of ${MAX_SCILAB_SIZE})`);
  }

  // Check XXE & DOCTYPE
  if (/<!DOCTYPE/i.test(xml) || /<!ENTITY/i.test(xml)) {
    throw new Error('Security Violation: Prohibited DOCTYPE or ENTITY declaration detected (XXE protection)');
  }

  // Check for embedded script / macro blocks
  if (/<script\b/i.test(xml) || /<ScriptBlock\b/i.test(xml) || /exec\s*\(/i.test(xml)) {
    throw new Error('Security Violation: Executable script or macro detected in Scilab diagram');
  }
}

export async function parseScilab(
  xml: string,
  options?: ScilabParserOptions
): Promise<ExternalModel> {
  checkXmlSecurity(xml);

  // Match title / diagram name
  const titleMatch = xml.match(/<XcosDiagram\s+[^>]*title="([^"]+)"/i);
  const modelName = titleMatch ? titleMatch[1] : (options?.sourceName || 'ScilabXcosModel');

  const components: ExternalComponent[] = [];
  const links: ExternalLink[] = [];
  const unsupportedConstructs: string[] = [];

  // Match BasicBlock elements: <BasicBlock id="..." interfaceFunctionName="..." ...>...</BasicBlock>
  const blockRegex = /<BasicBlock\s+([^>]+)>(.*?)<\/BasicBlock>/gis;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = blockRegex.exec(xml)) !== null) {
    const attrs = blockMatch[1];
    const body = blockMatch[2];

    const idMatch = attrs.match(/id="([^"]+)"/i);
    const ifaceMatch = attrs.match(/interfaceFunctionName="([^"]+)"/i);
    const blockTypeMatch = attrs.match(/blockType="([^"]+)"/i);

    const id = idMatch ? idMatch[1] : `blk_${components.length}`;
    const externalType = ifaceMatch ? ifaceMatch[1] : (blockTypeMatch ? blockTypeMatch[1] : 'BasicBlock');

    // Extract parameters from ScilabDouble or similar
    const parameters: Record<string, unknown> = {};
    const paramValMatch = body.match(/<data\s+[^>]*value="([^"]+)"/i);
    if (paramValMatch) {
      const val = Number(paramValMatch[1]);
      parameters['value'] = isNaN(val) ? paramValMatch[1] : val;
    }

    // Extract input/output ports
    const ports: ExternalPort[] = [];
    if (body.includes('<ExplicitInputPort')) {
      ports.push({ id: 'p_in', name: 'in', direction: 'in' });
    }
    if (body.includes('<ExplicitOutputPort')) {
      ports.push({ id: 'p_out', name: 'out', direction: 'out' });
    }

    components.push({
      id,
      name: id,
      externalType,
      sourceLocation: `Diagram/${id}`,
      parameters,
      ports
    });
  }

  // Match ExplicitLink: <ExplicitLink id="link_1" from="blk_step:p_out" to="blk_gain:p_in" />
  const linkRegex = /<ExplicitLink\s+([^>]+)\/?>/gi;
  let linkMatch: RegExpExecArray | null;
  let linkIdx = 0;

  while ((linkMatch = linkRegex.exec(xml)) !== null) {
    const attrs = linkMatch[1];
    const fromMatch = attrs.match(/from="([^"]+)"/i);
    const toMatch = attrs.match(/to="([^"]+)"/i);

    if (fromMatch && toMatch) {
      linkIdx++;
      const [fromBlk, fromPort] = fromMatch[1].split(':');
      const [toBlk, toPort] = toMatch[1].split(':');

      links.push({
        id: `link_${linkIdx}`,
        sourceComponentId: fromBlk,
        sourcePortId: fromPort || 'p_out',
        targetComponentId: toBlk,
        targetPortId: toPort || 'p_in'
      });
    }
  }

  return {
    name: modelName,
    sourceFormat: 'scilab',
    provenance: {
      source: options?.sourceName || 'xcos_model.xcos',
      author: options?.author || 'imported',
      license: options?.license || 'quarantined_import',
      checksum: options?.checksum
    },
    components,
    links,
    unsupportedConstructs
  };
}
