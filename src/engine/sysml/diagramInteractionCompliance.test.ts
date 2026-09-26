import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { evaluateCompliance } from './compliance/evaluator';
import type { FeatureComplianceDefinition } from './compliance/types';

describe('Diagram Interaction Corrections Compliance Gate (Task 9)', () => {
  const evidencePath = resolve(__dirname, '../../../docs/sysml/compliance-evidence.json');
  const rawData = readFileSync(evidencePath, 'utf8');
  const evidenceFile = JSON.parse(rawData);

  const TARGET_IDS = [
    'SYSML-PORT-CREATE-001',
    'SYSML-IBD-DELEGATION-001',
    'SYSML-REQ-TESTCASE-001',
    'SYSML-REQ-SATISFY-STATE-001',
    'CAMEO-DIAGRAM-ACTIVATE-001',
  ];

  it('contains all 5 diagram interaction correction records', () => {
    const ids = evidenceFile.evidence.map((e: any) => e.id);
    for (const targetId of TARGET_IDS) {
      expect(ids).toContain(targetId);
    }
  });

  for (const targetId of TARGET_IDS) {
    it(`evaluates ${targetId} as fully COMPLIANT across all four levels with valid evidence`, () => {
      const record = evidenceFile.evidence.find((e: any) => e.id === targetId);
      expect(record).toBeDefined();

      const definition: FeatureComplianceDefinition = {
        id: record.id,
        name: record.feature,
        authority: record.authority,
        levels: {
          element: record.fourLevelCompliance.element.status,
          properties: record.fourLevelCompliance.properties.status,
          relationships: record.fourLevelCompliance.relationships.status,
          constraints: record.fourLevelCompliance.constraints.status,
        },
        evidence: {
          specificationSection: record.specification.section,
          sourceFile: record.implementation.sourceFiles[0],
          domainType: record.implementation.domainTypes[0],
          command: record.implementation.commands[0],
          validator: record.implementation.validator[0],
          persistence: record.implementation.persistenceMapping,
          projection: record.implementation.projection[0],
          tests: record.implementation.automatedTests,
        },
      };

      const result = evaluateCompliance(definition);
      expect(result.missingEvidence).toEqual([]);
      expect(result.reasons).toEqual([]);
      expect(result.status).toBe('COMPLIANT');

      // Verify all tests declared in the evidence exist on disk
      for (const testPath of record.implementation.automatedTests) {
        const fullPath = resolve(process.cwd(), testPath);
        expect(existsSync(fullPath), `Test file must exist: ${testPath}`).toBe(true);
      }
    });
  }
});
