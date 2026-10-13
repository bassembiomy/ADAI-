import type { QuantityKindDefinition, SysmlRepository, UnitDefinition } from './model';

export interface ResolvedValueTypeMeasure {
  unit?: UnitDefinition;
  quantityKind?: QuantityKindDefinition;
}

/**
 * The Unit and QuantityKind a ValueType references (SysML 1.6 §8.3.2.10-11).
 * When the ValueType names no QuantityKind itself, its Unit's QuantityKind is used.
 */
export function resolveValueTypeMeasure(repo: SysmlRepository, valueTypeId: string | undefined): ResolvedValueTypeMeasure {
  const valueType = valueTypeId ? repo.definitions[valueTypeId] : undefined;
  if (valueType?.kind !== 'valueType') return {};
  const unitCandidate = valueType.unitId ? repo.definitions[valueType.unitId] : undefined;
  const unit = unitCandidate?.kind === 'unit' ? unitCandidate : undefined;
  const kindId = valueType.quantityKindId ?? unit?.quantityKindId;
  const kindCandidate = kindId ? repo.definitions[kindId] : undefined;
  return { unit, quantityKind: kindCandidate?.kind === 'quantityKind' ? kindCandidate : undefined };
}

/** The symbol shown as `{unit=…}` on a value property typed by `typeId`, when that type references a Unit with a symbol. */
export function resolvedPropertyUnitSymbol(repo: SysmlRepository, typeId: string | undefined): string | undefined {
  const symbol = resolveValueTypeMeasure(repo, typeId).unit?.symbol?.trim();
  return symbol || undefined;
}
