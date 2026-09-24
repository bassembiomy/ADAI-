import { describe, expect, it } from 'vitest';
import { evaluateCompliance } from './evaluator';
import type { FeatureComplianceDefinition } from './types';

describe('Four-Level Compliance Evaluator', () => {
  const completeProxyPortEvidence = {
    specificationSection: 'OMG SysML 1.6 Clause 9.3.2.12',
    sourceFile: 'src/engine/sysml/domain/ports.ts',
    domainType: 'ProxyPortDefinition',
    command: 'CreatePortCommand',
    validator: 'validatePort',
    persistence: 'persistPort',
    projection: 'ibdProjection',
    tests: ['src/engine/sysml/ibd.test.ts', 'src/engine/sysml/portRules.test.ts'],
  };

  it('evaluates ProxyPort with three passing levels and failed Constraints as PARTIAL, never COMPLIANT', () => {
    const proxyPortDef: FeatureComplianceDefinition = {
      id: 'SYSML-PORT-PROXY',
      name: 'ProxyPort',
      authority: 'OMG_SYSML_1_6',
      levels: {
        element: 'PASS',
        properties: 'PASS',
        relationships: 'PASS',
        constraints: 'FAIL', // Constraints level failed (e.g. InterfaceBlock typing or conjugation not satisfied)
      },
      evidence: completeProxyPortEvidence,
    };

    const result = evaluateCompliance(proxyPortDef);
    expect(result.status).toBe('PARTIAL');
    expect(result.status).not.toBe('COMPLIANT');
    expect(result.reasons).toContain('Constraints level failed');
  });

  it('blocks COMPLIANT when automated tests are missing or empty', () => {
    const featureDef: FeatureComplianceDefinition = {
      id: 'SYSML-BLOCK',
      name: 'Block',
      authority: 'OMG_SYSML_1_6',
      levels: {
        element: 'PASS',
        properties: 'PASS',
        relationships: 'PASS',
        constraints: 'PASS',
      },
      evidence: {
        ...completeProxyPortEvidence,
        tests: [], // Missing automated tests
      },
    };

    const result = evaluateCompliance(featureDef);
    expect(result.status).toBe('PARTIAL');
    expect(result.status).not.toBe('COMPLIANT');
    expect(result.missingEvidence).toContain('tests');
    expect(result.reasons.some(r => r.includes('tests'))).toBe(true);
  });

  it('blocks COMPLIANT when specification section is missing', () => {
    const featureDef: FeatureComplianceDefinition = {
      id: 'SYSML-BLOCK',
      name: 'Block',
      authority: 'OMG_SYSML_1_6',
      levels: {
        element: 'PASS',
        properties: 'PASS',
        relationships: 'PASS',
        constraints: 'PASS',
      },
      evidence: {
        ...completeProxyPortEvidence,
        specificationSection: '', // Missing specification section
      },
    };

    const result = evaluateCompliance(featureDef);
    expect(result.status).toBe('PARTIAL');
    expect(result.missingEvidence).toContain('specificationSection');
  });

  it('blocks COMPLIANT when domain type, command, validator, persistence, or projection are missing', () => {
    const featureDef: FeatureComplianceDefinition = {
      id: 'SYSML-BLOCK',
      name: 'Block',
      authority: 'OMG_SYSML_1_6',
      levels: {
        element: 'PASS',
        properties: 'PASS',
        relationships: 'PASS',
        constraints: 'PASS',
      },
      evidence: {
        specificationSection: 'OMG SysML 1.6 Clause 8.3.1',
        sourceFile: 'src/engine/sysml/domain/classifiers.ts',
        // Missing domainType, command, validator, persistence, projection, tests
      },
    };

    const result = evaluateCompliance(featureDef);
    expect(result.status).toBe('PARTIAL');
    expect(result.missingEvidence).toEqual(
      expect.arrayContaining(['domainType', 'command', 'validator', 'persistence', 'projection', 'tests'])
    );
  });

  it('grants COMPLIANT when all applicable levels pass and all required evidence is present', () => {
    const featureDef: FeatureComplianceDefinition = {
      id: 'SYSML-BLOCK',
      name: 'Block',
      authority: 'OMG_SYSML_1_6',
      levels: {
        element: 'PASS',
        properties: 'PASS',
        relationships: 'PASS',
        constraints: 'PASS',
      },
      evidence: {
        specificationSection: 'OMG SysML 1.6 Clause 8.3.1',
        sourceFile: 'src/engine/sysml/domain/classifiers.ts',
        domainType: 'BlockDefinition',
        command: 'CreateBlockCommand',
        validator: 'validateBlock',
        persistence: 'persistBlock',
        projection: 'bddProjection',
        tests: ['src/engine/sysml/bdd.test.ts'],
      },
    };

    const result = evaluateCompliance(featureDef);
    expect(result.status).toBe('COMPLIANT');
    expect(result.missingEvidence).toHaveLength(0);
  });

  it('marks NON_COMPLIANT if element level fails', () => {
    const featureDef: FeatureComplianceDefinition = {
      id: 'SYSML-FAIL',
      name: 'FailedElement',
      authority: 'OMG_SYSML_1_6',
      levels: {
        element: 'FAIL',
        properties: 'FAIL',
        relationships: 'FAIL',
        constraints: 'FAIL',
      },
      evidence: completeProxyPortEvidence,
    };

    const result = evaluateCompliance(featureDef);
    expect(result.status).toBe('NON_COMPLIANT');
  });

  it('handles NOT_APPLICABLE levels correctly', () => {
    const featureDef: FeatureComplianceDefinition = {
      id: 'SYSML-COMMENT',
      name: 'Comment',
      authority: 'UML_FOUNDATION',
      levels: {
        element: 'PASS',
        properties: 'NOT_APPLICABLE',
        relationships: 'PASS',
        constraints: 'NOT_APPLICABLE',
      },
      evidence: {
        specificationSection: 'UML 2.5 Clause 7.2',
        sourceFile: 'src/engine/sysml/domain/base.ts',
        domainType: 'Comment',
        command: 'CreateCommentCommand',
        validator: 'validateComment',
        persistence: 'persistComment',
        projection: 'diagramProjection',
        tests: ['src/engine/sysml/model.test.ts'],
      },
    };

    const result = evaluateCompliance(featureDef);
    expect(result.status).toBe('COMPLIANT');
  });
});
