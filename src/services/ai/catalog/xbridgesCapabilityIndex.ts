import { BLOCK_LIBRARY } from '../../../engine/xbridges/BlockDefinitions';
import { XBRIDGES_CATEGORIES } from '../../../utils/xbridges/XbridgesLibrary';
import {
  XbridgesBlockCapability,
  XbridgesCapabilityIndex,
  XbridgesParameterCapability,
  XbridgesPortCapability,
} from '../../../engine/xbridges/types';
import { canonicalJson, sha256Hex } from '../../../engine/opm/canonicalHash';

export type {
  XbridgesBlockCapability,
  XbridgesCapabilityIndex,
  XbridgesParameterCapability,
  XbridgesPortCapability,
};

let cachedIndex: XbridgesCapabilityIndex | null = null;

// Build category and label lookup from XBRIDGES_CATEGORIES
function buildCategoryLookup(): {
  categoryByType: Map<string, string>;
  labelByType: Map<string, string>;
} {
  const categoryByType = new Map<string, string>();
  const labelByType = new Map<string, string>();

  if (Array.isArray(XBRIDGES_CATEGORIES)) {
    for (const cat of XBRIDGES_CATEGORIES) {
      if (Array.isArray(cat.blocks)) {
        for (const b of cat.blocks) {
          if (b && b.type) {
            categoryByType.set(b.type, cat.name);
            if (b.label) {
              labelByType.set(b.type, b.label);
            }
          }
        }
      }
    }
  }

  return { categoryByType, labelByType };
}

/**
 * Builds an immutable, canonical capability index directly from the active BLOCK_LIBRARY.
 * Does not infer units or metadata when the factory does not provide them; records 'unknown'.
 */
export function buildXbridgesCapabilityIndex(): XbridgesCapabilityIndex {
  if (cachedIndex) {
    return cachedIndex;
  }

  const { categoryByType, labelByType } = buildCategoryLookup();
  const blocksMap = new Map<string, XbridgesBlockCapability>();
  const aliasesMap = new Map<string, string>();
  const categoriesSet = new Set<string>();

  const sortedBlockIds = Object.keys(BLOCK_LIBRARY).sort();

  for (const blockId of sortedBlockIds) {
    const factory = BLOCK_LIBRARY[blockId];
    if (typeof factory !== 'function') {
      continue;
    }

    const instance = factory(`probe_${blockId}`, {});
    const category = categoryByType.get(blockId) || 'Core Library';
    categoriesSet.add(category);

    const label = instance.label || labelByType.get(blockId) || blockId.replace(/_/g, ' ');
    const description = instance.description || `${label} component (${category})`;

    const inputs: XbridgesPortCapability[] = (instance.inputs || []).map(p =>
      Object.freeze({
        id: p.id,
        name: p.name || p.id,
        direction: 'input' as const,
        type: p.type || 'signal',
        unit: p.unit || 'unknown',
        position: p.position,
        dimensions: p.dimensions ? Object.freeze([...p.dimensions]) : undefined,
      })
    );

    const outputs: XbridgesPortCapability[] = (instance.outputs || []).map(p =>
      Object.freeze({
        id: p.id,
        name: p.name || p.id,
        direction: 'output' as const,
        type: p.type || 'signal',
        unit: p.unit || 'unknown',
        position: p.position,
        dimensions: p.dimensions ? Object.freeze([...p.dimensions]) : undefined,
      })
    );

    const allPorts: readonly XbridgesPortCapability[] = Object.freeze([...inputs, ...outputs]);

    const paramsRecord: Record<string, XbridgesParameterCapability> = {};
    const parameterNames = Object.keys(instance.params || {}).sort();

    for (const paramKey of parameterNames) {
      const val = instance.params[paramKey];
      const valType = Array.isArray(val) ? 'array' : typeof val;
      paramsRecord[paramKey] = Object.freeze({
        name: paramKey,
        type: valType,
        defaultValue: val,
        unit: 'unknown',
      });
    }

    const hasDerivative = typeof instance.evaluateDerivatives === 'function';
    const hasZeroCrossing = typeof instance.ZeroCrossingFn === 'function';
    const isStateful = !!instance.isStateful || instance.state !== undefined || hasDerivative;

    const solverFeatures: string[] = ['discrete'];
    if (hasDerivative) {
      solverFeatures.push('continuous', 'ode1', 'ode4');
    }
    if (hasZeroCrossing) {
      solverFeatures.push('zeroCrossing');
    }

    const aliasCandidates = new Set<string>([
      blockId,
      blockId.toLowerCase(),
      blockId.replace(/_/g, ' '),
      blockId.replace(/_/g, ' ').toLowerCase(),
      label,
      label.toLowerCase(),
    ]);

    const aliases = Object.freeze([...aliasCandidates]);

    for (const alias of aliases) {
      const normalizedAlias = alias.trim().toLowerCase();
      if (!normalizedAlias) continue;
      const existing = aliasesMap.get(normalizedAlias);
      if (existing && existing !== blockId) {
        // Alias conflict between distinct blocks - fail closed or ignore ambiguous alias
        // We log/prevent ambiguous alias from overwriting
        continue;
      }
      aliasesMap.set(normalizedAlias, blockId);
    }

    const blockCapability: XbridgesBlockCapability = Object.freeze({
      id: blockId,
      type: instance.type || blockId,
      label,
      category,
      description,
      ports: allPorts,
      inputs: Object.freeze(inputs),
      outputs: Object.freeze(outputs),
      parameterNames: parameterNames.slice(),
      parameters: Object.freeze(paramsRecord),
      isStateful,
      hasDerivative,
      hasZeroCrossing,
      allowDynamicInputs: !!instance.allowDynamicInputs,
      allowDynamicOutputs: !!instance.allowDynamicOutputs,
      aliases,
      equation: instance.equation,
      solverFeatures: Object.freeze(solverFeatures.sort()),
    });

    blocksMap.set(blockId, blockCapability);
  }

  // Derive catalog fingerprint deterministically with canonicalJson and sha256Hex
  const canonicalPayload = {
    version: '1.0.0',
    totalBlocks: blocksMap.size,
    blocks: sortedBlockIds.map(id => {
      const b = blocksMap.get(id)!;
      return {
        id: b.id,
        type: b.type,
        label: b.label,
        category: b.category,
        ports: b.ports.map(p => ({
          id: p.id,
          direction: p.direction,
          name: p.name,
          type: p.type,
          unit: p.unit,
        })),
        parameterNames: [...b.parameterNames].sort(),
        parameters: Object.fromEntries(
          Object.entries(b.parameters)
            .sort(([k1], [k2]) => k1.localeCompare(k2))
            .map(([k, p]) => [k, { name: p.name, type: p.type, defaultValue: p.defaultValue, unit: p.unit }])
        ),
        isStateful: b.isStateful,
        hasDerivative: b.hasDerivative,
        hasZeroCrossing: b.hasZeroCrossing,
        solverFeatures: [...b.solverFeatures].sort(),
      };
    }),
  };

  const catalogFingerprint = sha256Hex(canonicalJson(canonicalPayload));

  cachedIndex = Object.freeze({
    catalogFingerprint,
    totalBlocks: blocksMap.size,
    blocks: blocksMap,
    aliases: aliasesMap,
    categories: Object.freeze([...categoriesSet].sort()),
  });

  return cachedIndex;
}

/**
 * Resolves a capability record by canonical ID or registered alias.
 */
export function resolveBlockCapability(blockIdOrAlias: string): XbridgesBlockCapability | undefined {
  if (!blockIdOrAlias || typeof blockIdOrAlias !== 'string') {
    return undefined;
  }

  const index = buildXbridgesCapabilityIndex();
  // 1. Direct map lookup
  const exact = index.blocks.get(blockIdOrAlias);
  if (exact) {
    return exact;
  }

  // 2. Normalized alias lookup
  const canonicalId = index.aliases.get(blockIdOrAlias.trim().toLowerCase());
  if (canonicalId) {
    return index.blocks.get(canonicalId);
  }

  return undefined;
}

/** Clears cached index (useful in test environments). */
export function resetXbridgesCapabilityIndex(): void {
  cachedIndex = null;
}
