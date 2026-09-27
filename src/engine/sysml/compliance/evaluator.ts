import type {
  ComplianceResult,
  FeatureComplianceDefinition,
  OverallComplianceStatus,
} from './types';
import { isExecutableCaseRegistered } from './evidenceRegistry';

const REQUIRED_EVIDENCE_FIELDS = [
  'specificationSection',
  'sourceFile',
  'domainType',
  'command',
  'validator',
  'persistence',
  'projection',
  'tests',
] as const;

export function evaluateCompliance(definition: FeatureComplianceDefinition): ComplianceResult {
  const { id, name, authority, levels, evidence } = definition;
  const missingEvidence: string[] = [];
  const reasons: string[] = [];

  // Check required evidence
  for (const field of REQUIRED_EVIDENCE_FIELDS) {
    if (field === 'tests') {
      if (!evidence.tests || !Array.isArray(evidence.tests) || evidence.tests.length === 0) {
        missingEvidence.push('tests');
        reasons.push('Automated tests evidence missing or empty');
      }
    } else {
      const val = evidence[field];
      if (!val || typeof val !== 'string' || val.trim().length === 0) {
        missingEvidence.push(field);
        reasons.push(`Missing evidence: ${field}`);
      }
    }
  }

  // Validate executable evidence cases when provided
  if (evidence.executableCases !== undefined) {
    if (!Array.isArray(evidence.executableCases) || evidence.executableCases.length === 0) {
      missingEvidence.push('executableCases');
      reasons.push('Executable evidence cases missing or empty');
    } else {
      for (const caseId of evidence.executableCases) {
        if (!isExecutableCaseRegistered(caseId)) {
          missingEvidence.push(`case:${caseId}`);
          reasons.push(`Unregistered or absent executable case: ${caseId}`);
        }
      }
    }
  }

  // Validate level-specific evidence cases when provided
  if (evidence.levelEvidenceCases !== undefined) {
    const levelKeys: Array<keyof typeof levels> = ['element', 'properties', 'relationships', 'constraints'];
    for (const levelKey of levelKeys) {
      if (levels[levelKey] === 'PASS') {
        const cases = evidence.levelEvidenceCases[levelKey];
        if (!cases || !Array.isArray(cases) || cases.length === 0) {
          missingEvidence.push(`levelEvidenceCases.${levelKey}`);
          reasons.push(`Passing level ${levelKey} requires registered executable evidence cases`);
        } else {
          for (const caseId of cases) {
            if (!isExecutableCaseRegistered(caseId)) {
              missingEvidence.push(`case:${caseId}`);
              reasons.push(`Unregistered executable case for level ${levelKey}: ${caseId}`);
            }
            if (evidence.executableCases && !evidence.executableCases.includes(caseId)) {
              missingEvidence.push(`case:${caseId}`);
              reasons.push(`Level ${levelKey} evidence case ${caseId} not declared in executableCases`);
            }
          }
        }
      }
    }
  }

  const levelValues = [
    { name: 'Element', status: levels.element },
    { name: 'Properties', status: levels.properties },
    { name: 'Relationships', status: levels.relationships },
    { name: 'Constraints', status: levels.constraints },
  ];

  const failedLevels = levelValues.filter(l => l.status === 'FAIL');
  const passingLevels = levelValues.filter(l => l.status === 'PASS');
  const applicableLevels = levelValues.filter(l => l.status !== 'NOT_APPLICABLE');

  for (const failed of failedLevels) {
    reasons.push(`${failed.name} level failed`);
  }

  let status: OverallComplianceStatus;

  if (applicableLevels.length === 0) {
    status = 'NOT_APPLICABLE';
  } else if (levels.element === 'FAIL' || (failedLevels.length === applicableLevels.length && applicableLevels.length > 0)) {
    status = 'NON_COMPLIANT';
  } else if (failedLevels.length > 0) {
    status = 'PARTIAL';
  } else {
    // All applicable levels are PASS
    if (missingEvidence.length > 0) {
      status = 'PARTIAL';
    } else {
      status = 'COMPLIANT';
    }
  }

  return {
    id,
    name,
    authority,
    status,
    levels,
    missingEvidence,
    reasons,
  };
}
