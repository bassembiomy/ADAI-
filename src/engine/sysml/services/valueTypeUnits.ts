import type { SysmlRepository, UnitDefinition } from '../model';

/**
 * Load-time migration (SysML 1.6 §8.3.2.10): older files stored a ValueType's
 * unit as free text. When that text names an existing Unit (by symbol, or by
 * name ignoring case) and the ValueType has no `unitId` yet, link it. A Unit is
 * never created automatically, and an ambiguous match is left alone.
 * Idempotent: a linked ValueType is skipped on the next load.
 * Returns the ids of the ValueTypes that were linked.
 */
export function linkValueTypeUnits(repo: SysmlRepository, willChange?: (elementId: string) => void): string[] {
  const units = Object.values(repo.definitions)
    .filter((definition): definition is UnitDefinition => definition.kind === 'unit');
  if (units.length === 0) return [];
  const linked: string[] = [];
  for (const definition of Object.values(repo.definitions).sort((a, b) => a.id.localeCompare(b.id))) {
    if (definition.kind !== 'valueType' || definition.unitId) continue;
    const text = definition.unit?.trim();
    if (!text) continue;
    let matches = units.filter(unit => unit.symbol.trim() === text);
    if (matches.length === 0) matches = units.filter(unit => unit.name.trim().toLowerCase() === text.toLowerCase());
    if (matches.length !== 1) continue;
    willChange?.(definition.id);
    definition.unitId = matches[0].id;
    linked.push(definition.id);
  }
  return linked;
}
