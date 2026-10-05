import type {
  BlockDefinition,
  ConnectorUsage,
  PartUsage,
  PortUsage,
  PropertyDefinition,
  SysmlRelationship,
  SysmlRepository,
} from '../model';
import { connectorEndKey, findPortDefinition, isConnectorEnd, type ConnectorEnd } from '../connectorEnds';
import { allIds, freshId } from '../services/partUsageSync';
import { effectiveSupertypeIds, invalidateSupertypeIndex } from '../services/supertypes';
import { pathKey } from '../partOccurrences';
import type { DiagramPresentation, PresentationCoordinates } from '../presentationState';
import { stableDiagramPresentationId } from '../presentationState';

/**
 * Format v5: a part exists only as `BlockDefinition.properties[i]`; a port of a
 * part is a property path plus a port id. This module turns a repository that
 * still carries PartUsage/PortUsage records (formats 2 and 3) into that shape.
 *
 * The migration mutates the repository it is given (callers pass a freshly
 * hydrated copy, exactly like the other load-time normalisations), tells
 * `willChange` about every existing element before it modifies it so baselines
 * can be carried through, and produces a report in which every change is
 * described by NAME. Raw ids appear only in `keyMap`, which exists so that
 * presentations can be re-keyed and is never shown.
 */

export const V5_SCHEMA_VERSION = 5;

export type V5ChangeKind =
  | 'part-to-property'
  | 'port-to-path'
  | 'nested-property-added'
  | 'part-retyped'
  | 'type-specialised'
  | 'connector-rewritten'
  | 'relationship-rewritten'
  | 'reference-rewritten'
  | 'presentation-rekeyed'
  | 'baseline-carried'
  | 'record-dropped';

export interface V5UpgradeChange {
  kind: V5ChangeKind;
  /** Stable code for changes a reviewer should look at, for example NESTED_PART_TYPE_SPECIALISED. */
  code?: string;
  severity: 'info' | 'warning';
  /** One sentence made of names only. */
  message: string;
  /** The names the sentence is about, for grouping in the report dialog. */
  names: string[];
}

export interface V5UpgradeReport {
  fromVersion: number;
  toVersion: typeof V5_SCHEMA_VERSION;
  changed: boolean;
  changes: V5UpgradeChange[];
  /** Old usage id -> new key (`path.join('/')`, or `path#portId` for a port). Machinery, never displayed. */
  keyMap: Record<string, string>;
}

export interface MigrateV5Options {
  fromVersion?: number;
  /** Called with the id of an existing element before it is modified. */
  willChange?: (elementId: string) => void;
}

export interface MigrateV5Result {
  report: V5UpgradeReport;
  removedUsageIds: string[];
  /** Definitions and relationships the migration created. */
  createdIds: string[];
  /** Existing definitions, connectors and relationships the migration modified. */
  changedIds: string[];
}

export function createEmptyUpgradeReport(fromVersion: number): V5UpgradeReport {
  return { fromVersion, toVersion: V5_SCHEMA_VERSION, changed: false, changes: [], keyMap: {} };
}

const isBlock = (repo: SysmlRepository, id: string): boolean => repo.definitions[id]?.kind === 'block';
const isStructural = (property: PropertyDefinition): boolean => property.kind === 'part' || property.kind === 'reference';
const byId = <T extends { id: string }>(a: T, b: T): number => a.id.localeCompare(b.id);
const displayName = (value: string | undefined, fallback: string): string => (value && value.trim() ? value.trim() : fallback);

interface Token {
  child: PartUsage;
  /** Existing structural property of the child's parent type that this child stands for. */
  matched?: PropertyDefinition;
  /** Present when the token distinguishes instances (it carries contents). */
  key: string | null;
  /** Identity of the slot within the parent type; used to look up the property created for it. */
  slot: string;
}

interface TypePlan {
  typeId: string;
  divergent: boolean;
  /** Signature -> Block that carries that content ('' signature stays on the type). */
  variants: Map<string, string>;
}

/** Upgrades `repo` in place. See the module comment for the contract. */
export function migrateRepositoryToV5(repo: SysmlRepository, options: MigrateV5Options = {}): MigrateV5Result {
  const report = createEmptyUpgradeReport(options.fromVersion ?? 3);
  const removedUsageIds: string[] = [];
  const createdIds: string[] = [];
  const changedSet = new Set<string>();
  const willChange = (id: string) => {
    if (!changedSet.has(id)) options.willChange?.(id);
    changedSet.add(id);
  };
  const note = (change: V5UpgradeChange) => { report.changes.push(change); };
  const result = (): MigrateV5Result => {
    report.changed = report.changes.length > 0;
    return { report, removedUsageIds, createdIds, changedIds: [...changedSet].sort() };
  };

  const allUsages = Object.values(repo.usages ?? {});
  const partUsages = new Map<string, PartUsage>();
  const portUsages = new Map<string, PortUsage>();
  for (const usage of allUsages) {
    if (usage.kind === 'part') partUsages.set(usage.id, usage);
    else if (usage.kind === 'port') portUsages.set(usage.id, usage);
  }
  const legacyConnectors = Object.values(repo.connectors ?? {}).filter(connector =>
    !isParametricEndConnector(connector) && !(isConnectorEnd(connector.sourceEnd) && isConnectorEnd(connector.targetEnd)));
  if (allUsages.length === 0 && legacyConnectors.length === 0) return result();

  const taken = allIds(repo);
  const blockName = (id: string): string => displayName(repo.definitions[id]?.name, 'unnamed Block');
  const requirementName = (id: string): string => displayName(
    repo.requirements[id]?.name ?? repo.definitions[id]?.name ?? repo.verificationCases[id]?.name, 'unnamed element');

  // ---- 1. Structure of the usage tree --------------------------------------
  const usageName = new Map<string, string>(allUsages.map(usage => [usage.id, displayName(usage.name, usage.kind === 'port' ? 'unnamed port' : 'unnamed part')]));
  const children = new Map<string, PartUsage[]>();
  const rootParts: PartUsage[] = [];
  const orphanParts: PartUsage[] = [];
  const rootBlockOf = new Map<string, string>();
  const resolveRoot = (usage: PartUsage): string | undefined => {
    const seen = new Set<string>();
    let current: PartUsage = usage;
    while (!seen.has(current.id)) {
      seen.add(current.id);
      const owner = partUsages.get(current.ownerId);
      if (!owner) return isBlock(repo, current.ownerId) ? current.ownerId : undefined;
      current = owner;
    }
    return undefined;
  };
  for (const usage of [...partUsages.values()].sort(byId)) {
    const root = resolveRoot(usage);
    if (!root) { orphanParts.push(usage); continue; }
    rootBlockOf.set(usage.id, root);
    if (partUsages.has(usage.ownerId)) {
      const list = children.get(usage.ownerId) ?? [];
      list.push(usage);
      children.set(usage.ownerId, list);
    } else rootParts.push(usage);
  }

  // Two usages of one Block property are one part: later ones become aliases of the first.
  const depthOneProperty = new Map<string, { block: BlockDefinition; property: PropertyDefinition }>();
  const primaryOfProperty = new Map<string, string>();
  const aliasOf = new Map<string, string>();
  for (const usage of rootParts) {
    const block = repo.definitions[usage.ownerId] as BlockDefinition;
    let property = usage.propertyId ? block.properties.find(candidate => candidate.id === usage.propertyId) : undefined;
    if (!property) {
      property = block.properties.find(candidate => isStructural(candidate) && candidate.name === usage.name
        && candidate.typeId === usage.typeId && !primaryOfProperty.has(candidate.id));
    }
    if (!property) {
      willChange(block.id);
      property = {
        id: freshId(taken, `property:${usage.id}`), name: usage.name,
        kind: usage.aggregation === 'composite' ? 'part' : 'reference', typeId: usage.typeId, multiplicity: usage.multiplicity,
      };
      block.properties.push(property);
    }
    const primary = primaryOfProperty.get(property.id);
    if (primary) {
      aliasOf.set(usage.id, primary);
      continue;
    }
    primaryOfProperty.set(property.id, usage.id);
    depthOneProperty.set(usage.id, { block, property });
  }
  for (const [aliasId, primaryId] of aliasOf) {
    const merged = children.get(primaryId) ?? [];
    for (const extra of children.get(aliasId) ?? []) {
      merged.push({ ...extra, ownerId: primaryId });
      partUsages.set(extra.id, merged[merged.length - 1]);
    }
    children.set(primaryId, merged);
    children.delete(aliasId);
  }
  const primaryRoots = rootParts.filter(usage => !aliasOf.has(usage.id));
  for (const list of children.values()) list.sort(byId);

  const typeKeyOf = (usage: PartUsage): string => depthOneProperty.get(usage.id)?.property.typeId ?? usage.typeId;

  // ---- 2. Contents per instance and per type ------------------------------
  const structuralPropsOf = (typeId: string): PropertyDefinition[] => {
    const props: PropertyDefinition[] = [];
    const seen = new Set<string>();
    const visit = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      const block = repo.definitions[id];
      if (block?.kind !== 'block') return;
      for (const property of block.properties) if (isStructural(property)) props.push(property);
      for (const supertypeId of effectiveSupertypeIds(repo, id)) visit(supertypeId);
    };
    visit(typeId);
    return props;
  };

  const tokenMemo = new Map<string, Token[]>();
  const sigMemo = new Map<string, string>();
  const computing = new Set<string>();
  const tokensOf = (usage: PartUsage): Token[] => {
    const cached = tokenMemo.get(usage.id);
    if (cached) return cached;
    const own = children.get(usage.id) ?? [];
    if (own.length === 0) { tokenMemo.set(usage.id, []); return []; }
    const type = typeKeyOf(usage);
    const props = isBlock(repo, type) ? structuralPropsOf(type) : [];
    const claimed = new Set<string>();
    const seenKeys = new Map<string, number>();
    const tokens: Token[] = [];
    for (const child of own) {
      const match = props.find(property => !claimed.has(property.id)
        && ((child.propertyId && property.id === child.propertyId) || (property.name === child.name && property.typeId === child.typeId)));
      const childSig = sigOf(child);
      if (match) {
        claimed.add(match.id);
        tokens.push({ child, matched: match, key: childSig === '' ? null : `=${match.id}{${childSig}}`, slot: `=${match.id}` });
        continue;
      }
      const base = `+${child.name}|${typeKeyOf(child)}|${child.aggregation}|${child.multiplicity.lower}..${child.multiplicity.upper}{${childSig}}`;
      const count = (seenKeys.get(base) ?? 0) + 1;
      seenKeys.set(base, count);
      const key = count === 1 ? base : `${base}#${count}`;
      tokens.push({ child, key, slot: key });
    }
    tokenMemo.set(usage.id, tokens);
    return tokens;
  };
  const sigOf = (usage: PartUsage): string => {
    const cached = sigMemo.get(usage.id);
    if (cached !== undefined) return cached;
    if (computing.has(usage.id)) return '';
    computing.add(usage.id);
    const signature = tokensOf(usage).map(token => token.key).filter((key): key is string => key !== null).sort().join('\n');
    computing.delete(usage.id);
    sigMemo.set(usage.id, signature);
    return signature;
  };

  const everyPart: PartUsage[] = [];
  const collect = (usage: PartUsage) => { everyPart.push(usage); for (const child of children.get(usage.id) ?? []) collect(child); };
  primaryRoots.forEach(collect);

  const instancesByType = new Map<string, PartUsage[]>();
  for (const usage of everyPart) {
    const list = instancesByType.get(typeKeyOf(usage)) ?? [];
    list.push(usage);
    instancesByType.set(typeKeyOf(usage), list);
  }

  // ---- 3. Plans, specialised subtypes and nested properties ---------------
  const plans = new Map<string, TypePlan>();
  const specialisations: Array<{ type: BlockDefinition; subtype: BlockDefinition; parts: PartUsage[] }> = [];
  const uniqueBlockName = (base: string, namespace: string[]): string => {
    const used = new Set(Object.values(repo.definitions).map(def => `${(def.namespace ?? []).join('::')}::${def.name}`));
    let name = base;
    for (let n = 2; used.has(`${namespace.join('::')}::${name}`); n += 1) name = `${base} ${n}`;
    return name;
  };
  for (const typeId of [...instancesByType.keys()].sort()) {
    const instances = instancesByType.get(typeId)!;
    const plan: TypePlan = { typeId, divergent: false, variants: new Map() };
    plans.set(typeId, plan);
    if (!isBlock(repo, typeId)) continue;
    const groups = new Map<string, PartUsage[]>();
    for (const usage of instances) {
      const list = groups.get(sigOf(usage)) ?? [];
      list.push(usage);
      groups.set(sigOf(usage), list);
    }
    plan.divergent = groups.size > 1;
    plan.variants.set('', typeId);
    if (!plan.divergent) { plan.variants.set([...groups.keys()][0], typeId); continue; }
    const type = repo.definitions[typeId] as BlockDefinition;
    for (const signature of [...groups.keys()].sort()) {
      if (signature === '') continue;
      const parts = groups.get(signature)!;
      const id = freshId(taken, `${typeId}:specialised`);
      const subtype: BlockDefinition = {
        id, kind: 'block', name: uniqueBlockName(`${displayName(type.name, 'Block')} (${usageName.get(parts[0].id)})`, type.namespace ?? []),
        namespace: [...(type.namespace ?? [])], ownerId: type.ownerId ?? 'model', isAbstract: false, isLeaf: false,
        properties: [], ports: [], operations: [], constraints: [],
      };
      repo.definitions[id] = subtype;
      createdIds.push(id);
      const generalizationId = freshId(taken, `generalization:${id}:${typeId}`);
      repo.relationships[generalizationId] = { id: generalizationId, kind: 'generalization', sourceId: id, targetId: typeId };
      createdIds.push(generalizationId);
      plan.variants.set(signature, id);
      specialisations.push({ type, subtype, parts });
    }
  }
  invalidateSupertypeIndex(repo);
  const variantOf = (usage: PartUsage): string => {
    const plan = plans.get(typeKeyOf(usage));
    return plan?.variants.get(sigOf(usage)) ?? typeKeyOf(usage);
  };

  /** `variantBlockId|slot` -> id of the property that stands for the slot. */
  const slotProperty = new Map<string, string>();
  const nestedAdded: Array<{ block: BlockDefinition; property: PropertyDefinition; host: string }> = [];
  const retyped: Array<{ block: BlockDefinition; property: PropertyDefinition; from: string }> = [];
  const fill = (target: BlockDefinition, representative: PartUsage, divergent: boolean) => {
    for (const token of tokensOf(representative)) {
      if (slotProperty.has(`${target.id}|${token.slot}`)) continue;
      const child = token.child;
      const childType = variantOf(child);
      if (token.matched) {
        const declaring = declaringBlockOf(token.matched.id) ?? target;
        if (token.key === null) { slotProperty.set(`${target.id}|${token.slot}`, token.matched.id); continue; }
        if (!divergent) {
          if (token.matched.typeId !== childType) {
            willChange(declaring.id);
            retyped.push({ block: declaring, property: token.matched, from: token.matched.typeId });
            token.matched.typeId = childType;
          }
          slotProperty.set(`${target.id}|${token.slot}`, token.matched.id);
        } else {
          willChange(target.id);
          const redefining: PropertyDefinition = {
            id: freshId(taken, `property:${child.id}`), name: token.matched.name, kind: token.matched.kind,
            typeId: childType, multiplicity: token.matched.multiplicity, redefinesId: token.matched.id,
          };
          target.properties.push(redefining);
          slotProperty.set(`${target.id}|${token.slot}`, redefining.id);
          nestedAdded.push({ block: target, property: redefining, host: usageName.get(representative.id)! });
        }
        continue;
      }
      willChange(target.id);
      const property: PropertyDefinition = {
        id: freshId(taken, `property:${child.id}`), name: child.name, kind: child.aggregation === 'composite' || child.aggregation === 'shared' ? 'part' : 'reference',
        typeId: childType, multiplicity: child.multiplicity,
      };
      target.properties.push(property);
      slotProperty.set(`${target.id}|${token.slot}`, property.id);
      nestedAdded.push({ block: target, property, host: usageName.get(representative.id)! });
    }
  };
  const declaringBlockOf = (propertyId: string): BlockDefinition | undefined => {
    for (const definition of Object.values(repo.definitions)) {
      if (definition.kind === 'block' && definition.properties.some(property => property.id === propertyId)) return definition;
    }
    return undefined;
  };
  for (const typeId of [...plans.keys()].sort()) {
    const plan = plans.get(typeId)!;
    if (!isBlock(repo, typeId)) continue;
    for (const usage of (instancesByType.get(typeId) ?? [])) {
      if (!tokensOf(usage).length) continue;
      const variantId = variantOf(usage);
      fill(repo.definitions[variantId] as BlockDefinition, usage, plan.divergent && variantId !== typeId);
    }
  }

  // ---- 4. Paths ------------------------------------------------------------
  const pathOf = new Map<string, string[]>();
  const keyMap = report.keyMap;
  const dropped: Array<{ name: string; reason: string }> = [];
  const labelOf = (usage: PartUsage): string => {
    const names: string[] = [];
    const seen = new Set<string>();
    let current: PartUsage | undefined = usage;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      names.unshift(usageName.get(current.id) ?? displayName(current.name, 'unnamed part'));
      const owner: PartUsage | undefined = partUsages.get(current.ownerId);
      if (!owner) names.unshift(blockName(current.ownerId));
      current = owner;
    }
    return names.join('.');
  };
  const assign = (usage: PartUsage, path: string[]) => {
    pathOf.set(usage.id, path);
    keyMap[usage.id] = pathKey(path);
    const tokens = tokensOf(usage);
    if (!tokens.length) return;
    const variantId = variantOf(usage);
    for (const token of tokens) {
      const propertyId = slotProperty.get(`${variantId}|${token.slot}`);
      if (!propertyId) {
        dropped.push({ name: labelOf(token.child), reason: 'its type could not be resolved to a Block' });
        continue;
      }
      assign(token.child, [...path, propertyId]);
    }
  };
  for (const usage of primaryRoots) {
    const { block, property } = depthOneProperty.get(usage.id)!;
    const variantId = variantOf(usage);
    if (property.typeId !== variantId) {
      willChange(block.id);
      retyped.push({ block, property, from: property.typeId });
      property.typeId = variantId;
    }
    assign(usage, [property.id]);
    // A property is a part (composite) or a reference; a shared aggregation has no property form of its own.
    const sharedLoss = usage.aggregation === 'shared';
    note({
      kind: 'part-to-property', severity: sharedLoss ? 'warning' : 'info', names: [blockName(block.id), displayName(property.name, 'unnamed part')],
      message: `Part ${labelOf(usage)} is now the property ${displayName(property.name, 'unnamed part')} of Block ${blockName(block.id)}`
        + ` (typed ${blockName(property.typeId)}).`
        + (sharedLoss ? ` It was a shared aggregation, which the new format cannot store; it is kept as a ${property.kind} property.` : ''),
    });
  }
  for (const [aliasId, primaryId] of aliasOf) {
    keyMap[aliasId] = keyMap[primaryId];
    note({
      kind: 'part-to-property', severity: 'info', names: [usageName.get(aliasId)!],
      message: `Part ${usageName.get(aliasId)} duplicated the property of part ${usageName.get(primaryId)} and was merged into it.`,
    });
  }
  for (const orphan of orphanParts) {
    dropped.push({ name: usageName.get(orphan.id)!, reason: 'its owner no longer exists' });
  }

  for (const entry of nestedAdded) {
    const type = entry.block;
    note({
      kind: 'nested-property-added', severity: 'info', names: [blockName(type.id), displayName(entry.property.name, 'unnamed part')],
      message: `Property ${displayName(entry.property.name, 'unnamed part')} was added to Block ${blockName(type.id)}`
        + ` because it was a nested part of ${entry.host}.`,
    });
  }
  for (const entry of retyped) {
    note({
      kind: 'part-retyped', severity: 'info', names: [displayName(entry.property.name, 'unnamed part'), blockName(entry.from), blockName(entry.property.typeId)],
      message: `Property ${displayName(entry.property.name, 'unnamed part')} of Block ${blockName(entry.block.id)} is now typed ${blockName(entry.property.typeId)} instead of ${blockName(entry.from)}.`,
    });
  }
  for (const entry of specialisations) {
    const partNames = entry.parts.map(labelOf);
    note({
      kind: 'type-specialised', code: 'NESTED_PART_TYPE_SPECIALISED', severity: 'warning',
      names: [blockName(entry.type.id), blockName(entry.subtype.id), ...partNames],
      message: `Parts of Block ${blockName(entry.type.id)} had different nested contents. Block ${blockName(entry.subtype.id)} (a specialisation of`
        + ` ${blockName(entry.type.id)}) now carries the contents for ${partNames.join(', ')}.`,
    });
  }

  // ---- 5. Ports ------------------------------------------------------------
  const portEnd = new Map<string, ConnectorEnd>();
  for (const usage of [...portUsages.values()].sort(byId)) {
    const portId = usage.definitionId;
    const ownerPart = partUsages.get(usage.ownerId);
    let end: ConnectorEnd | undefined;
    let ownerLabel = '';
    let ownerType = '';
    if (ownerPart) {
      const path = pathOf.get(ownerPart.id) ?? pathOf.get(aliasOf.get(ownerPart.id) ?? '');
      if (path) { end = { path, portId }; ownerLabel = labelOf(ownerPart); ownerType = variantOf(ownerPart); }
    } else if (isBlock(repo, usage.ownerId)) {
      end = { path: [], portId }; ownerLabel = blockName(usage.ownerId); ownerType = usage.ownerId;
    }
    if (!end) {
      dropped.push({ name: usageName.get(usage.id)!, reason: 'the part that owns it could not be placed' });
      continue;
    }
    portEnd.set(usage.id, end);
    keyMap[usage.id] = connectorEndKey(end);
    const portName = displayName(findPortDefinition(repo, ownerType, portId)?.name, usageName.get(usage.id)!);
    note({
      kind: 'port-to-path', severity: 'info', names: [ownerLabel, portName],
      message: `Port ${ownerLabel}.${portName} is now addressed by its part path instead of a port record.`,
    });
  }

  // ---- 6. Connectors -------------------------------------------------------
  const endLabel = (end: ConnectorEnd | undefined, contextId: string): string => {
    if (!end) return 'an unresolved end';
    let typeId = contextId;
    const names = [blockName(contextId)];
    for (const segment of end.path) {
      const property = findPropertyIn(typeId, segment);
      names.push(displayName(property?.name, 'unnamed part'));
      typeId = property?.typeId ?? typeId;
    }
    if (end.portId) names.push(displayName(findPortDefinition(repo, typeId, end.portId)?.name, 'unnamed port'));
    return names.join('.');
  };
  const findPropertyIn = (blockId: string, propertyId: string, seen = new Set<string>()): PropertyDefinition | undefined => {
    if (seen.has(blockId)) return undefined;
    seen.add(blockId);
    const block = repo.definitions[blockId];
    if (block?.kind !== 'block') return undefined;
    const own = block.properties.find(property => property.id === propertyId);
    if (own) return own;
    for (const supertypeId of effectiveSupertypeIds(repo, blockId)) {
      const inherited = findPropertyIn(supertypeId, propertyId, seen);
      if (inherited) return inherited;
    }
    return undefined;
  };
  /** The Block whose structure the part or port usage `id` (or an `owner::port` pair) belongs to. */
  const endRootOf = (id: string): string | undefined => {
    const port = portUsages.get(id);
    if (port) {
      const ownerPart = partUsages.get(port.ownerId);
      return ownerPart ? rootBlockOf.get(ownerPart.id) : (isBlock(repo, port.ownerId) ? port.ownerId : undefined);
    }
    const part = partUsages.get(id);
    if (part) return rootBlockOf.get(part.id);
    if (id.includes('::')) {
      const ownerId = id.split('::')[0];
      const ownerPart = partUsages.get(ownerId);
      return ownerPart ? rootBlockOf.get(ownerPart.id) : (isBlock(repo, ownerId) ? ownerId : undefined);
    }
    return undefined;
  };
  const endForId = (id: string): ConnectorEnd | undefined => {
    const port = portEnd.get(id);
    if (port) return port;
    const part = partUsages.get(id);
    if (part) {
      const path = pathOf.get(part.id) ?? pathOf.get(aliasOf.get(part.id) ?? '');
      return path ? { path } : undefined;
    }
    if (id.includes('::')) {
      const [ownerId, portId] = id.split('::');
      if (isBlock(repo, ownerId) && findPortDefinition(repo, ownerId, portId)) return { path: [], portId };
      const ownerPart = partUsages.get(ownerId);
      const path = ownerPart ? pathOf.get(ownerPart.id) : undefined;
      if (path) return { path, portId };
    }
    return undefined;
  };
  for (const connector of Object.values(repo.connectors ?? {}).sort(byId)) {
    if (isParametricEndConnector(connector)) continue;
    const hasSource = isConnectorEnd(connector.sourceEnd);
    const hasTarget = isConnectorEnd(connector.targetEnd);
    if (hasSource && hasTarget) continue;
    const ownerPart = partUsages.get(connector.ownerId);
    const contextId = ownerPart ? rootBlockOf.get(ownerPart.id) ?? connector.ownerId : connector.ownerId;
    // A path starts under the context Block, so an end that belongs to another Block's structure cannot be a path of this connector.
    const inContext = (id: string) => endRootOf(id) === contextId;
    const source = hasSource ? connector.sourceEnd as ConnectorEnd : (inContext(connector.sourcePortId) ? endForId(connector.sourcePortId) : undefined);
    const target = hasTarget ? connector.targetEnd as ConnectorEnd : (inContext(connector.targetPortId) ? endForId(connector.targetPortId) : undefined);
    const label = `${connector.kind} connector in Block ${blockName(contextId)}`;
    if (!source || !target) {
      note({
        kind: 'record-dropped', severity: 'warning', names: [blockName(contextId)],
        message: `A ${label} could not be rewritten because ${!source ? 'its source' : 'its target'} end no longer resolves inside that Block; it is kept unchanged and will be reported as unresolved.`,
      });
      continue;
    }
    willChange(connector.id);
    repo.connectors[connector.id] = {
      ...connector, ownerId: contextId, sourceEnd: source, targetEnd: target,
      sourcePortId: connectorEndKey(source), targetPortId: connectorEndKey(target),
    };
    note({
      kind: 'connector-rewritten', severity: 'info', names: [endLabel(source, contextId), endLabel(target, contextId)],
      message: `The ${label} from ${endLabel(source, contextId)} to ${endLabel(target, contextId)} now stores property paths.`,
    });
  }

  // ---- 7. Relationships and other references ------------------------------
  const rewriteId = (id: string): string | undefined => {
    const port = portUsages.get(id);
    if (port) return port.definitionId;
    const part = partUsages.get(id);
    if (!part) return undefined;
    const path = pathOf.get(part.id) ?? pathOf.get(aliasOf.get(part.id) ?? '');
    return path ? path[path.length - 1] : undefined;
  };
  const referenceLabel = (id: string): string => {
    const part = partUsages.get(id);
    if (part) return labelOf(part);
    return usageName.get(id) ?? requirementName(id);
  };
  for (const relationship of Object.values(repo.relationships).sort(byId)) {
    const nextSource = rewriteId(relationship.sourceId);
    const nextTarget = rewriteId(relationship.targetId);
    if (nextSource === undefined && nextTarget === undefined) continue;
    willChange(relationship.id);
    const updated: SysmlRelationship = {
      ...relationship, sourceId: nextSource ?? relationship.sourceId, targetId: nextTarget ?? relationship.targetId,
    };
    const sourceLabel = nextSource !== undefined ? referenceLabel(relationship.sourceId) : requirementName(relationship.sourceId);
    const targetLabel = nextTarget !== undefined ? referenceLabel(relationship.targetId) : requirementName(relationship.targetId);
    repo.relationships[relationship.id] = updated;
    note({
      kind: 'relationship-rewritten', severity: 'info', names: [sourceLabel, targetLabel],
      message: `The ${relationship.kind} relationship from ${sourceLabel} to ${targetLabel} now refers to the property instead of the part record.`,
    });
  }
  const rewriteRepresents = (value: unknown): boolean => {
    let changed = false;
    if (Array.isArray(value)) {
      for (const item of value) changed = rewriteRepresents(item) || changed;
    } else if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        if (key === 'representsId' && typeof record[key] === 'string') {
          const next = rewriteId(record[key] as string);
          if (next !== undefined) { record[key] = next; changed = true; }
        } else changed = rewriteRepresents(record[key]) || changed;
      }
    }
    return changed;
  };
  for (const definition of Object.values(repo.definitions)) {
    if (definition.kind !== 'activity' && definition.kind !== 'interaction') continue;
    const copy = structuredClone(definition);
    if (rewriteRepresents(copy)) {
      willChange(definition.id);
      repo.definitions[definition.id] = copy;
      note({
        kind: 'reference-rewritten', severity: 'info', names: [blockName(definition.id)],
        message: `${definition.kind === 'activity' ? 'Activity' : 'Interaction'} ${blockName(definition.id)} now refers to the property instead of the part record.`,
      });
    }
  }
  for (const reference of Object.values(repo.diagramReferences ?? {})) {
    const next = reference.sourceElementId ? rewriteId(reference.sourceElementId) : undefined;
    if (next !== undefined) repo.diagramReferences[reference.id] = { ...reference, sourceElementId: next };
  }
  for (const diagram of Object.values(repo.diagrams ?? {})) {
    const contextId = diagram.contextElementId;
    const part = contextId ? partUsages.get(contextId) : undefined;
    if (part) {
      const root = rootBlockOf.get(part.id);
      if (root) {
        repo.diagrams[diagram.id] = { ...diagram, contextElementId: root };
        note({
          kind: 'reference-rewritten', severity: 'info', names: [displayName(diagram.name, 'unnamed diagram'), blockName(root)],
          message: `Diagram ${displayName(diagram.name, 'unnamed diagram')} was shown for part ${labelOf(part)} and now shows Block ${blockName(root)}.`,
        });
      }
    }
  }

  // ---- 8. Remove the records ----------------------------------------------
  for (const entry of dropped) {
    note({
      kind: 'record-dropped', severity: 'warning', names: [entry.name],
      message: `${entry.name} could not be placed because ${entry.reason}; it was not carried into the new format.`,
    });
  }
  for (const id of Object.keys(repo.usages)) removedUsageIds.push(id);
  repo.usages = {};
  invalidateSupertypeIndex(repo);
  return result();
}

function isParametricEndConnector(connector: ConnectorUsage): boolean {
  const end = (value: unknown): boolean => typeof value === 'object' && value !== null && 'propertyId' in (value as object);
  return connector.kind === 'binding' && (end(connector.sourceEnd) || end(connector.targetEnd));
}

// ---- Presentation re-keying ------------------------------------------------

export interface RekeyedPresentationState {
  presentations: Record<string, DiagramPresentation>;
  coordinates: Record<string, PresentationCoordinates>;
  changes: V5UpgradeChange[];
}

/**
 * Re-keys presentation records of removed usages by their new path key. Port
 * layouts inside a part presentation are keyed by port id already and are kept.
 * `diagramName` turns a diagram id into the name shown in the report.
 */
export function rekeyPresentationState(
  presentations: Record<string, DiagramPresentation>,
  coordinates: Record<string, PresentationCoordinates>,
  keyMap: Readonly<Record<string, string>>,
  diagramName: (diagramId: string) => string = id => id,
): RekeyedPresentationState {
  const changes: V5UpgradeChange[] = [];
  if (Object.keys(keyMap).length === 0) return { presentations, coordinates, changes };
  const renamed = (id: string): string => (Object.prototype.hasOwnProperty.call(keyMap, id) ? keyMap[id] : id);
  const nextPresentations: Record<string, DiagramPresentation> = {};
  for (const [diagramId, presentation] of Object.entries(presentations)) {
    const targetId = renamed(diagramId);
    const existing = nextPresentations[targetId];
    let moved = 0;
    const elementIds = new Set<string>(existing?.elementIds ?? []);
    for (const id of presentation.elementIds ?? []) {
      const next = renamed(id);
      if (next !== id) moved += 1;
      elementIds.add(next);
    }
    const records = { ...(existing?.presentations ?? {}) };
    for (const [semanticId, record] of Object.entries(presentation.presentations ?? {})) {
      const next = renamed(semanticId);
      if (records[next]) continue;
      records[next] = next === semanticId && targetId === diagramId
        ? record
        : { ...record, id: stableDiagramPresentationId(targetId, next), diagramId: targetId, semanticElementId: next };
    }
    const hidden = [...(existing?.hiddenElementIds ?? []), ...(presentation.hiddenElementIds ?? []).map(renamed)];
    nextPresentations[targetId] = {
      ...(existing ?? {}), ...presentation, elementIds: [...elementIds], presentations: records,
      ...(hidden.length > 0 || presentation.hiddenElementIds ? { hiddenElementIds: [...new Set(hidden)] } : {}),
    };
    if (moved > 0) {
      changes.push({
        kind: 'presentation-rekeyed', severity: 'info', names: [diagramName(diagramId)],
        message: `Diagram ${diagramName(diagramId)}: ${moved} element position${moved === 1 ? '' : 's'} now follow the part properties.`,
      });
    }
  }
  const nextCoordinates: Record<string, PresentationCoordinates> = {};
  for (const [id, value] of Object.entries(coordinates)) {
    const next = renamed(id);
    if (next !== id && coordinates[next]) continue;
    nextCoordinates[next] = value;
  }
  return { presentations: nextPresentations, coordinates: nextCoordinates, changes };
}
