import JSZip from 'jszip';
import { ExternalModel, ExternalComponent, ExternalLink, ExternalPort } from './externalModel';

const MAX_ENTRY_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_TOTAL_UNCOMPRESSED = 50 * 1024 * 1024; // 50 MB
const PROHIBITED_EXTENSIONS = ['.m', '.mex', '.dll', '.so', '.exe', '.bat', '.cmd', '.sh', '.py', '.js', '.vbs', '.wsf'];

export interface SimulinkParserOptions {
  sourceName?: string;
  author?: string;
  license?: string;
  checksum?: string;
}

function assertSafePath(filename: string): void {
  const normalized = filename.replace(/\\/g, '/');
  if (
    normalized.startsWith('/') ||
    normalized.startsWith('../') ||
    normalized.includes('/../') ||
    normalized.endsWith('/..') ||
    normalized === '..' ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    throw new Error(`Security Violation: Zip-slip / path traversal detected: ${filename}`);
  }
}

function checkXmlSecurity(xml: string): void {
  // Check XXE & DOCTYPE
  if (/<!DOCTYPE/i.test(xml) || /<!ENTITY/i.test(xml)) {
    throw new Error('Security Violation: Prohibited DOCTYPE or ENTITY declaration detected (XXE protection)');
  }
}

function parseSimulinkXml(xml: string, sourceName: string, options?: SimulinkParserOptions): ExternalModel {
  checkXmlSecurity(xml);

  // Check model name
  const modelMatch = xml.match(/<Model\s+[^>]*Name="([^"]+)"/i);
  const modelName = modelMatch ? modelMatch[1] : (options?.sourceName || 'SimulinkModel');

  const components: ExternalComponent[] = [];
  const links: ExternalLink[] = [];
  const unsupportedConstructs: string[] = [];

  // Match Block elements
  // Regex to match blocks safely
  const blockRegex = /<Block\s+([^>]+)>(.*?)<\/Block>/gis;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = blockRegex.exec(xml)) !== null) {
    const attrStr = blockMatch[1];
    const bodyStr = blockMatch[2];

    const typeMatch = attrStr.match(/BlockType="([^"]+)"/i);
    const nameMatch = attrStr.match(/Name="([^"]+)"/i);
    const sidMatch = attrStr.match(/SID="([^"]+)"/i);

    const externalType = typeMatch ? typeMatch[1] : 'Unknown';
    const name = nameMatch ? nameMatch[1] : (sidMatch ? sidMatch[1] : `Block_${components.length}`);
    const id = sidMatch ? sidMatch[1] : name;

    // Check for executable script blocks
    if (/MATLABFunction|S-Function|Stateflow/i.test(externalType)) {
      unsupportedConstructs.push(`Prohibited or unsupported block type: ${externalType}`);
    }

    // Extract parameters <P Name="X">Value</P>
    const parameters: Record<string, unknown> = {};
    const paramRegex = /<P\s+Name="([^"]+)">([^<]*)<\/P>/gi;
    let pMatch: RegExpExecArray | null;
    while ((pMatch = paramRegex.exec(bodyStr)) !== null) {
      const pName = pMatch[1];
      const pVal = pMatch[2].trim();
      const num = Number(pVal);
      parameters[pName] = isNaN(num) ? pVal : num;
    }

    // Extract ports <Port PortType="in|out" Index="1" Name="r"/>
    const ports: ExternalPort[] = [];
    const portRegex = /<Port\s+([^>]+)\/?>/gi;
    let portMatch: RegExpExecArray | null;
    while ((portMatch = portRegex.exec(bodyStr)) !== null) {
      const pAttrs = portMatch[1];
      const pTypeMatch = pAttrs.match(/PortType="([^"]+)"/i);
      const pNameMatch = pAttrs.match(/Name="([^"]+)"/i);
      const pIdxMatch = pAttrs.match(/Index="([^"]+)"/i);

      const dir = pTypeMatch && pTypeMatch[1].toLowerCase() === 'in' ? 'in' : 'out';
      const portId = pNameMatch ? pNameMatch[1] : (pIdxMatch ? `${dir}${pIdxMatch[1]}` : `${dir}1`);
      ports.push({
        id: portId,
        name: pNameMatch ? pNameMatch[1] : undefined,
        direction: dir
      });
    }

    components.push({
      id,
      name,
      externalType,
      sourceLocation: `Root/${name}`,
      parameters,
      ports
    });
  }

  // Extract Lines / Links
  const lineRegex = /<Line\s*([^>]*)>(.*?)<\/Line>/gis;
  let lineMatch: RegExpExecArray | null;
  let linkIdx = 0;
  while ((lineMatch = lineRegex.exec(xml)) !== null) {
    const lineBody = lineMatch[2];
    const srcMatch = lineBody.match(/<P\s+Name="Src">([^<]+)<\/P>/i);
    const dstMatch = lineBody.match(/<P\s+Name="Dst">([^<]+)<\/P>/i);

    if (srcMatch && dstMatch) {
      const srcRaw = srcMatch[1].trim(); // e.g. "1#out:1" or "1#out"
      const dstRaw = dstMatch[1].trim(); // e.g. "2#in:1" or "2#in"

      const [srcComp, srcPort] = srcRaw.split('#');
      const [dstComp, dstPort] = dstRaw.split('#');

      linkIdx++;
      links.push({
        id: `link_${linkIdx}`,
        sourceComponentId: srcComp,
        sourcePortId: srcPort ? srcPort.replace(/:/g, '_') : 'out',
        targetComponentId: dstComp,
        targetPortId: dstPort ? dstPort.replace(/:/g, '_') : 'in'
      });
    }
  }

  return {
    name: modelName,
    sourceFormat: 'simulink',
    provenance: {
      source: options?.sourceName || 'simulink_model.slx',
      author: options?.author || 'imported',
      license: options?.license || 'quarantined_import',
      checksum: options?.checksum
    },
    components,
    links,
    unsupportedConstructs
  };
}

export async function parseSimulink(
  buffer: Buffer | Uint8Array,
  options?: SimulinkParserOptions
): Promise<ExternalModel> {
  const zip = new JSZip();
  let zipFile: JSZip;
  try {
    zipFile = await zip.loadAsync(buffer);
  } catch (err: any) {
    throw new Error(`Invalid SLX archive: ${err?.message || err}`);
  }

  let totalSize = 0;
  let blockDiagramContent: string | null = null;

  for (const [filename, fileObj] of Object.entries(zipFile.files)) {
    assertSafePath(filename);

    const lower = filename.toLowerCase();
    for (const ext of PROHIBITED_EXTENSIONS) {
      if (lower.endsWith(ext)) {
        throw new Error(`Security Violation: Prohibited executable script or macro detected in archive: ${filename}`);
      }
    }

    if (fileObj.dir) continue;

    // Check size limit before or during decompression
    // JSZip stores uncompressed size in _data.uncompressedSize if available
    const uncompressed = (fileObj as any)._data?.uncompressedSize;
    if (typeof uncompressed === 'number' && uncompressed > MAX_ENTRY_SIZE) {
      throw new Error(`Security Violation: Archive entry is oversized (${uncompressed} bytes exceeds ${MAX_ENTRY_SIZE})`);
    }

    const content = await fileObj.async('string');
    if (content.length > MAX_ENTRY_SIZE) {
      throw new Error(`Security Violation: Extracted entry size (${content.length}) exceeds maximum limit (${MAX_ENTRY_SIZE})`);
    }
    totalSize += content.length;
    if (totalSize > MAX_TOTAL_UNCOMPRESSED) {
      throw new Error(`Security Violation: Total uncompressed archive size exceeds ${MAX_TOTAL_UNCOMPRESSED} bytes`);
    }

    if (lower === 'simulink/blockdiagram.xml' || lower.endsWith('/blockdiagram.xml')) {
      blockDiagramContent = content;
    }
  }

  if (!blockDiagramContent) {
    throw new Error('Missing blockdiagram.xml: Invalid SLX structure');
  }

  return parseSimulinkXml(blockDiagramContent, options?.sourceName || 'simulink_model.slx', options);
}
