import type { SysmlRepositoryV4, Property } from '../domain';
import { validateProperty, type PropertyValidationResult } from '../services/propertySemantics';

export { validateProperty, type PropertyValidationResult };

export function validateAllProperties(repo: SysmlRepositoryV4): { valid: boolean; errors: Record<string, string[]> } {
  let valid = true;
  const errors: Record<string, string[]> = {};

  for (const [id, element] of Object.entries(repo.elements)) {
    if (
      element.metaclass === 'PartProperty' ||
      element.metaclass === 'ReferenceProperty' ||
      element.metaclass === 'ValueProperty' ||
      element.metaclass === 'ConstraintProperty' ||
      element.metaclass === 'FlowProperty'
    ) {
      const res = validateProperty(repo, element as Property);
      if (!res.valid) {
        valid = false;
        errors[id] = res.diagnostics;
      }
    }
  }

  return { valid, errors };
}
