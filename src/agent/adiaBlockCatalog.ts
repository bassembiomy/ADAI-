import { VLAB_LIBRARY, VLabBlock, VLabDomain } from '../utils/vlabLibrary';
import { XBRIDGES_CATEGORIES } from '../utils/xbridges/XbridgesLibrary';
import { BLOCK_LIBRARY } from '../engine/xbridges/BlockDefinitions';

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
    for (const cat of XBRIDGES_CATEGORIES) {
      this.domains.add(`X-BRIDGES: ${cat.name}`);
      for (const b of cat.blocks) {
        const id = b.type;
        if (this.blocksById.has(id)) continue;

        const capabilities = deriveCapabilities(
          'X-BRIDGES',
          cat.name,
          b.type,
          b.label
        );

        let instance: any = null;
        if (BLOCK_LIBRARY && typeof BLOCK_LIBRARY[id] === 'function') {
          try {
            instance = BLOCK_LIBRARY[id]('catalog_probe', {});
          } catch {
            // Some blocks may need special defaults; instance remains null
          }
        }

        const ports: CatalogPort[] = [];
        const params: Record<string, CatalogParameter> = {};

        if (instance) {
          if (Array.isArray(instance.inputs)) {
            for (const inp of instance.inputs) {
              ports.push(Object.freeze({
                id: inp.id,
                name: inp.name || inp.id,
                pos: inp.position,
                label: inp.name,
                domain: 'xbridges',
                direction: 'input',
                type: inp.type || 'signal'
              }));
            }
          }
          if (Array.isArray(instance.outputs)) {
            for (const outp of instance.outputs) {
              ports.push(Object.freeze({
                id: outp.id,
                name: outp.name || outp.id,
                pos: outp.position,
                label: outp.name,
                domain: 'xbridges',
                direction: 'output',
                type: outp.type || 'signal'
              }));
            }
          }
          if (instance.params && typeof instance.params === 'object') {
            for (const [k, val] of Object.entries(instance.params)) {
              params[k] = {
                value: val,
                label: k,
                type: typeof val,
                defaultValue: val
              };
            }
          }
        }

        const block: CatalogBlock = Object.freeze({
          id: b.type,
          aliases: Object.freeze([b.label, b.type.replace(/_/g, ' '), b.type.toLowerCase()]),
          name: b.label,
          domain: `X-BRIDGES: ${cat.name}`,
          category: cat.name,
          ports: Object.freeze(ports),
          parameters: Object.freeze(params),
          description: instance?.description || `${b.label} component from X-BRIDGES ${cat.name} library`,
          capabilities: Object.freeze(capabilities),
          sourceLibrary: 'xbridges',
          documentationRef: instance?.equation || undefined,
          compatibility: Object.freeze({
            domains: ['xbridges'],
            solvers: ['ode1', 'ode4', 'discrete']
          })
        });

        this.blocksById.set(id, block);
        this.blockList.push(block);
      }
    }

    // Index any remaining blocks defined in BLOCK_LIBRARY that were not in XBRIDGES_CATEGORIES
    if (BLOCK_LIBRARY) {
      for (const [typeKey, factory] of Object.entries(BLOCK_LIBRARY)) {
        if (this.blocksById.has(typeKey) || typeof factory !== 'function') continue;

        let instance: any = null;
        try {
          instance = factory('catalog_probe', {});
        } catch {
          // Skip if factory cannot instantiate probe
        }

        const ports: CatalogPort[] = [];
        const params: Record<string, CatalogParameter> = {};

        if (instance) {
          if (Array.isArray(instance.inputs)) {
            for (const inp of instance.inputs) {
              ports.push(Object.freeze({
                id: inp.id,
                name: inp.name || inp.id,
                pos: inp.position,
                label: inp.name,
                domain: 'xbridges',
                direction: 'input',
                type: inp.type || 'signal'
              }));
            }
          }
          if (Array.isArray(instance.outputs)) {
            for (const outp of instance.outputs) {
              ports.push(Object.freeze({
                id: outp.id,
                name: outp.name || outp.id,
                pos: outp.position,
                label: outp.name,
                domain: 'xbridges',
                direction: 'output',
                type: outp.type || 'signal'
              }));
            }
          }
          if (instance.params && typeof instance.params === 'object') {
            for (const [k, val] of Object.entries(instance.params)) {
              params[k] = {
                value: val,
                label: k,
                type: typeof val,
                defaultValue: val
              };
            }
          }
        }

        const label = instance?.label || typeKey.replace(/_/g, ' ');
        const capabilities = deriveCapabilities('X-BRIDGES', 'Core Library', typeKey, label, instance?.description);

        const block: CatalogBlock = Object.freeze({
          id: typeKey,
          aliases: Object.freeze([label, typeKey.replace(/_/g, ' '), typeKey.toLowerCase()]),
          name: label,
          domain: 'X-BRIDGES: Core Library',
          category: 'Core Library',
          ports: Object.freeze(ports),
          parameters: Object.freeze(params),
          description: instance?.description || `${label} component from X-BRIDGES Core Library`,
          capabilities: Object.freeze(capabilities),
          sourceLibrary: 'xbridges',
          documentationRef: instance?.equation || undefined,
          compatibility: Object.freeze({
            domains: ['xbridges'],
            solvers: ['ode1', 'ode4', 'discrete']
          })
        });

        this.blocksById.set(typeKey, block);
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
