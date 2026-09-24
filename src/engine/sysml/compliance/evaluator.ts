import type {
  ComplianceResult,
  FeatureComplianceDefinition,
  OverallComplianceStatus,
} from './types';

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
