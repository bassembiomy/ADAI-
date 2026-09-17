/**
 * Read-Only Index over Existing ADIA Blocks (V-Lab, X-BRIDGES, SysML)
 * Enforces the global constraint: The agent must use only existing ADIA blocks
 * and components; it must NEVER create or register a new block.
 */

import { VLAB_LIBRARY, VLabBlock, VLabDomain } from '../utils/vlabLibrary';
import { XBRIDGES_CATEGORIES } from '../utils/xbridges/XbridgesLibrary';

export interface CatalogPort {
  id: string;
  pos?: string;
  label?: string;
  domain?: string;
}

export interface CatalogParameter {
  value: number | string;
  unit: string;
  label: string;
}

export interface CatalogBlock {
  readonly id: string;
  readonly name: string;
  readonly domain: string;
  readonly category: string;
  readonly ports: readonly CatalogPort[];
  readonly parameters: Readonly<Record<string, CatalogParameter>>;
  readonly description: string;
  readonly capabilities: readonly string[];
  readonly sourceLibrary: 'vlab' | 'xbridges' | 'sysml';
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
              label: v.label
            };
          }
        }

        const block: CatalogBlock = Object.freeze({
          id: b.id,
          name: b.name,
          domain: domain.type,
          category: b.category || 'General',
          ports: Object.freeze(
            (b.ports || []).map(p =>
              Object.freeze({
                id: p.id,
                pos: p.pos,
                label: p.label,
                domain: p.domain
              })
            )
          ),
          parameters: Object.freeze(params),
          description: b.description || b.name,
          capabilities: Object.freeze(capabilities),
          sourceLibrary: 'vlab'
        });

        this.blocksById.set(b.id, block);
        this.blockList.push(block);
      }
    }
  }

  private indexXBridgesBlocks(): void {
    for (const cat of XBRIDGES_CATEGORIES) {
      this.domains.add(`X-BRIDGES: ${cat.name}`);
      for (const b of cat.blocks) {
        const id = b.type;
        // Avoid duplicate ID overwrite if any collision occurs
        if (this.blocksById.has(id)) continue;

        const capabilities = deriveCapabilities(
          'X-BRIDGES',
          cat.name,
          b.type,
          b.label
        );

        const block: CatalogBlock = Object.freeze({
          id: b.type,
          name: b.label,
          domain: `X-BRIDGES: ${cat.name}`,
          category: cat.name,
          ports: Object.freeze([]),
          parameters: Object.freeze({}),
          description: `${b.label} component from X-BRIDGES ${cat.name} library`,
          capabilities: Object.freeze(capabilities),
          sourceLibrary: 'xbridges'
        });

        this.blocksById.set(id, block);
        this.blockList.push(block);
      }
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
