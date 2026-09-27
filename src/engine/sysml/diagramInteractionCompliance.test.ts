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
    'UML-PORT-STANDARD-001',
    'SYSML-PORT-CREATE-001',
    'SYSML-IBD-DELEGATION-001',
    'SYSML-REQ-TESTCASE-001',
    'ADIA-VERIFICATIONCASE-NORMALIZATION-001',
    'SYSML-REQ-SATISFY-STATE-001',
    'CAMEO-DIAGRAM-ACTIVATE-001',
  ];

  const EXPECTED_AUTHORITIES: Record<string, string> = {
    'UML-PORT-STANDARD-001': 'UML_FOUNDATION',
    'SYSML-PORT-CREATE-001': 'OMG_SYSML_1_6',
    'SYSML-IBD-DELEGATION-001': 'OMG_SYSML_1_6',
    'SYSML-REQ-TESTCASE-001': 'OMG_SYSML_1_6',
    'ADIA-VERIFICATIONCASE-NORMALIZATION-001': 'ADIA_EXTENSION',
    'SYSML-REQ-SATISFY-STATE-001': 'OMG_SYSML_1_6',
    'CAMEO-DIAGRAM-ACTIVATE-001': 'CAMEO_TOOLING',
  };

  it('contains all 7 diagram interaction correction records with separated semantic authorities', () => {
    const ids = evidenceFile.evidence.map((e: any) => e.id);
    for (const targetId of TARGET_IDS) {
      expect(ids).toContain(targetId);
      const record = evidenceFile.evidence.find((e: any) => e.id === targetId);
      expect(record.authority).toBe(EXPECTED_AUTHORITIES[targetId]);
      expect(record.implementation.executableCases).toBeDefined();
      expect(record.implementation.executableCases.length).toBeGreaterThan(0);
    }
  });

  for (const targetId of TARGET_IDS) {
    it(`evaluates ${targetId} (${EXPECTED_AUTHORITIES[targetId]}) as fully COMPLIANT bound to executable evidence`, () => {
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
          executableCases: record.implementation.executableCases,
          levelEvidenceCases: {
            element: record.fourLevelCompliance.element.executableCases,
            properties: record.fourLevelCompliance.properties.executableCases,
            relationships: record.fourLevelCompliance.relationships.executableCases,
            constraints: record.fourLevelCompliance.constraints.executableCases,
          },
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

  it('rejects self-declared compliance when executable cases are stripped or unregistered', () => {
    const record = evidenceFile.evidence.find((e: any) => e.id === 'SYSML-PORT-CREATE-001');
    const tamperedDef: FeatureComplianceDefinition = {
      id: record.id,
      name: record.feature,
      authority: record.authority,
      levels: {
        element: 'PASS',
        properties: 'PASS',
        relationships: 'PASS',
        constraints: 'PASS',
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
        executableCases: ['ABSENT_CASE_ID'],
        levelEvidenceCases: {
          element: ['ABSENT_CASE_ID'],
          properties: ['ABSENT_CASE_ID'],
          relationships: ['ABSENT_CASE_ID'],
          constraints: ['ABSENT_CASE_ID'],
        },
      },
    };
    const result = evaluateCompliance(tamperedDef);
    expect(result.status).toBe('PARTIAL');
    expect(result.missingEvidence).toContain('case:ABSENT_CASE_ID');
  });
});
