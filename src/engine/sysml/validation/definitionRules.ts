import type { SysmlRepository } from '../model';
import type { SysmlDiagnostic } from '../validation';

const error = (code: string, elementId: string, propertyPath: string, message: string): SysmlDiagnostic =>
  ({ code, severity: 'error', elementId, propertyPath, message });

const warning = (code: string, elementId: string, propertyPath: string, message: string): SysmlDiagnostic =>
  ({ code, severity: 'warning', elementId, propertyPath, message });

/**
 * Rules for the definitions that carry their own structure:
 *  - Enumeration: literals are non-empty and unique (UML 2.5 §10.5.3);
 *  - ConstraintBlock: parameters are named, uniquely, and typed by something
 *    that exists and can hold a value (SysML 1.6 §10.3.2.1);
 *  - Unit / QuantityKind (SysML 1.6 §8.3.2.10-11): a Unit has a symbol, and the
 *    Unit / QuantityKind a ValueType or Unit references must exist and agree.
 */
export function validateDefinitionRules(repo: SysmlRepository): SysmlDiagnostic[] {
  const diagnostics: SysmlDiagnostic[] = [];
  for (const definition of Object.values(repo.definitions)) {
    if (definition.kind === 'enumeration') {
      const seen = new Set<string>();
      definition.literals.forEach((literal, index) => {
        const name = literal.trim();
        if (!name) diagnostics.push(error('EMPTY_ENUMERATION_LITERAL', definition.id, `literals.${index}`, `Enumeration ${definition.name} has an empty literal`));
        else if (seen.has(name)) diagnostics.push(error('DUPLICATE_ENUMERATION_LITERAL', definition.id, `literals.${index}`, `Enumeration ${definition.name} repeats the literal "${name}"`));
        seen.add(name);
      });
    }
    if (definition.kind === 'unit') {
      if (!definition.symbol?.trim()) diagnostics.push(error('EMPTY_UNIT_SYMBOL', definition.id, 'symbol', `Unit ${definition.name} has no symbol`));
      if (definition.quantityKindId && repo.definitions[definition.quantityKindId]?.kind !== 'quantityKind') {
        diagnostics.push(error('MISSING_QUANTITY_KIND', definition.id, 'quantityKindId', `Unit ${definition.name} refers to a QuantityKind that does not exist`));
      }
    }
    if (definition.kind === 'valueType') {
      const unit = definition.unitId ? repo.definitions[definition.unitId] : undefined;
      if (definition.unitId && unit?.kind !== 'unit') {
        diagnostics.push(error('MISSING_UNIT', definition.id, 'unitId', `ValueType ${definition.name} refers to a Unit that does not exist`));
      }
      if (definition.quantityKindId && repo.definitions[definition.quantityKindId]?.kind !== 'quantityKind') {
        diagnostics.push(error('MISSING_QUANTITY_KIND', definition.id, 'quantityKindId', `ValueType ${definition.name} refers to a QuantityKind that does not exist`));
      }
      if (unit?.kind === 'unit' && unit.quantityKindId && definition.quantityKindId && unit.quantityKindId !== definition.quantityKindId) {
        diagnostics.push(warning('UNIT_QUANTITY_KIND_MISMATCH', definition.id, 'quantityKindId', `Unit ${unit.name} measures a different QuantityKind than ValueType ${definition.name} declares`));
      }
    }
    if (definition.kind === 'viewpoint') {
      definition.stakeholderIds.forEach((id, index) => {
        if (repo.definitions[id]?.kind !== 'stakeholder') {
          diagnostics.push(error('MISSING_STAKEHOLDER', definition.id, `stakeholderIds.${index}`, `Viewpoint ${definition.name} refers to a Stakeholder that does not exist`));
        }
      });
      definition.concernIds.forEach((id, index) => {
        if (!repo.requirements[id]) {
          diagnostics.push(error('MISSING_CONCERN', definition.id, `concernIds.${index}`, `Viewpoint ${definition.name} refers to a concern (Requirement) that does not exist`));
        }
      });
    }
    if (definition.kind === 'view') {
      // SysML 1.6 §7.3.2.1: a View conforms to exactly one Viewpoint.
      const conforms = Object.values(repo.relationships).filter(relationship => relationship.kind === 'conform' && relationship.sourceId === definition.id);
      if (conforms.length > 1) {
        diagnostics.push(error('MULTIPLE_VIEWPOINTS', definition.id, 'viewpoint', `View ${definition.name} conforms to ${conforms.length} Viewpoints; it may conform to at most one`));
      }
    }
    if (definition.kind === 'constraintBlock') {
      const names = new Set<string>();
      for (const parameter of definition.parameters) {
        const name = parameter.name.trim();
        if (!name) diagnostics.push(error('EMPTY_PARAMETER_NAME', parameter.id, 'name', `A parameter of ${definition.name} has no name`));
        else if (names.has(name)) diagnostics.push(error('DUPLICATE_PARAMETER_NAME', parameter.id, 'name', `${definition.name} already has a parameter named "${name}"`));
        names.add(name);
        const type = repo.definitions[parameter.typeId];
        if (!type || !(type.kind === 'valueType' || type.kind === 'enumeration' || type.kind === 'block')) {
          diagnostics.push(error('MISSING_PARAMETER_TYPE', parameter.id, 'typeId', `Parameter ${name || parameter.id} of ${definition.name} must be typed by a ValueType, Enumeration or Block`));
        }
      }
    }
  }
  return diagnostics;
}
