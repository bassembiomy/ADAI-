import { VLAB_LIBRARY, VLabBlock, VLabDomain } from '../utils/vlabLibrary';
import { buildXbridgesCapabilityIndex } from '../services/ai/catalog/xbridgesCapabilityIndex';

export interface CatalogPort {
  id: string;
  name?: string;
  pos?: string;
  label?: string;
  domain?: string;
  direction?: 'input' | 'output' | 'bidirectional';
  type?: string;
  unit?: string;
}

export interface CatalogParameter {
  value: number | string | boolean | unknown;
  unit?: string;
  label: string;
  type?: string;
  defaultValue?: unknown;
}

export interface CatalogBlockCompatibility {
  readonly domains?: readonly string[];
  readonly solvers?: readonly string[];
}

export interface CatalogBlock {
  readonly id: string;
  readonly aliases?: readonly string[];
  readonly name: string;
  readonly domain: string;
  readonly category: string;
  readonly ports: readonly CatalogPort[];
  readonly parameters: Readonly<Record<string, CatalogParameter>>;
  readonly description: string;
  readonly capabilities: readonly string[];
  readonly sourceLibrary: 'vlab' | 'xbridges' | 'sysml';
  readonly documentationRef?: string;
  readonly compatibility?: CatalogBlockCompatibility;
}


function deriveCapabilities(
  domain: string,
  category: string,
  id: string,
  name: string,
  description?: string
): string[] {
  const caps = new Set<string>();
  const text = `${domain} ${category} ${id} ${name} ${description || ''}`.toLowerCase();

  const keywords = [
    'electrical',
    'thermal',
    'mechanical',
    'hydraulic',
    'pneumatic',
    'fluid',
    'sensor',
    'sensing',
    'temperature',
    'actuator',
    'motor',
    'bldc',
    'pmsm',
    'inverter',
    'controller',
    'pid',
    'source',
    'power',
    'load',
    'resistor',
    'heating',
    'cooling',
    'passive',
    'dem',
    'cfd',
    'robotics',
    'vacuum'
  ];

  for (const kw of keywords) {
    if (text.includes(kw)) {
      caps.add(kw);
    }
  }

  // Always include domain lowercased
  caps.add(domain.toLowerCase().trim());

  return Array.from(caps);
}

class CatalogRegistry {
  private blocksById: Map<string, CatalogBlock> = new Map();
  private blockList: CatalogBlock[] = [];
  private domains: Set<string> = new Set();

  constructor() {
    this.indexVLabBlocks();
    this.indexXBridgesBlocks();
    Object.freeze(this.blockList);
  }

  private indexVLabBlocks(): void {
    for (const domain of VLAB_LIBRARY) {
      this.domains.add(domain.type);
      for (const b of domain.blocks) {
        const capabilities = deriveCapabilities(
          domain.type,
          b.category || '',
          b.id,
          b.name,
          b.description
        );

        const params: Record<string, CatalogParameter> = {};
        if (b.params) {
          for (const [k, v] of Object.entries(b.params)) {
            params[k] = {
              value: v.value,
              unit: v.unit,
              label: v.label,
              type: typeof v.value,
              defaultValue: v.value
            };
          }
        }

        const block: CatalogBlock = Object.freeze({
          id: b.id,
          aliases: Object.freeze([b.name, b.id.replace(/_/g, ' '), b.id.toLowerCase()]),
          name: b.name,
          domain: domain.type,
          category: b.category || 'General',
          ports: Object.freeze(
            (b.ports || []).map(p =>
              Object.freeze({
                id: p.id,
                name: p.label || p.id,
                pos: p.pos,
                label: p.label,
                domain: p.domain || domain.type,
                direction: (p.pos === 'left' ? 'input' : p.pos === 'right' ? 'output' : 'bidirectional') as 'input' | 'output' | 'bidirectional',
                type: domain.type.toLowerCase()
              })
            )
          ),
          parameters: Object.freeze(params),
          description: b.description || b.name,
          capabilities: Object.freeze(capabilities),
          sourceLibrary: 'vlab',
          documentationRef: b.equation ? b.equation : undefined,
          compatibility: Object.freeze({
            domains: [domain.type],
            solvers: ['ode1', 'ode4', 'vlab_solver']
          })
        });

        this.blocksById.set(b.id, block);
        this.blockList.push(block);
      }
    }
  }

  private indexXBridgesBlocks(): void {
    const capabilityIndex = buildXbridgesCapabilityIndex();
    for (const cap of capabilityIndex.blocks.values()) {
      if (this.blocksById.has(cap.id)) continue;

      this.domains.add(`X-BRIDGES: ${cap.category}`);

      const capabilities = deriveCapabilities(
        'X-BRIDGES',
        cap.category,
        cap.id,
        cap.label,
        cap.description
      );

      const ports: CatalogPort[] = cap.ports.map(p =>
        Object.freeze({
          id: p.id,
          name: p.name || p.id,
          pos: p.position,
          label: p.name,
          domain: 'xbridges',
          direction: p.direction,
          type: p.type || 'signal',
          unit: p.unit,
        })
      );

      const params: Record<string, CatalogParameter> = {};
      for (const [k, p] of Object.entries(cap.parameters)) {
        params[k] = {
          value: p.defaultValue,
          unit: p.unit !== 'unknown' ? p.unit : undefined,
          label: p.name,
          type: p.type,
          defaultValue: p.defaultValue,
        };
      }

      const block: CatalogBlock = Object.freeze({
        id: cap.id,
        aliases: Object.freeze([...cap.aliases]),
        name: cap.label,
        domain: `X-BRIDGES: ${cap.category}`,
        category: cap.category,
        ports: Object.freeze(ports),
        parameters: Object.freeze(params),
        description: cap.description,
        capabilities: Object.freeze(capabilities),
        sourceLibrary: 'xbridges',
        documentationRef: cap.equation || undefined,
        compatibility: Object.freeze({
          domains: ['xbridges'],
          solvers: [...cap.solverFeatures],
        }),
      });

      this.blocksById.set(cap.id, block);
      this.blockList.push(block);
    }
  }

  public list(): readonly CatalogBlock[] {

    return this.blockList;
  }

  public findById(id: string): CatalogBlock | undefined {
    if (!id || typeof id !== 'string') return undefined;
    return this.blocksById.get(id);
  }

  public isExistingBlockId(id: string): boolean {
    if (!id || typeof id !== 'string') return false;
    return this.blocksById.has(id);
  }

  public findByCapability(capability: string): readonly CatalogBlock[] {
    const term = capability.toLowerCase().trim();
    return this.blockList.filter(
      b =>
        b.capabilities.includes(term) ||
        b.domain.toLowerCase().includes(term) ||
        b.id.toLowerCase().includes(term)
    );
  }

  public findByName(name: string): readonly CatalogBlock[] {
    const term = name.toLowerCase().trim();
    return this.blockList.filter(b => b.name.toLowerCase().includes(term));
  }

  public getBlockCount(): number {
    return this.blockList.length;
  }

  public getDomainCount(): number {
    return this.domains.size;
  }
}

export const AdiaBlockCatalog = new CatalogRegistry();
