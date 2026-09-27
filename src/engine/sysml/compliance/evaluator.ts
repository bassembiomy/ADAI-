import type {
  ComplianceResult,
  EvidenceRunContext,
  FeatureComplianceDefinition,
  OverallComplianceStatus,
} from './types';
import { EXECUTABLE_EVIDENCE, isExecutableCaseRegistered } from './evidenceRegistry';

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

function hasUsableRunContext(runContext: EvidenceRunContext | undefined | null): runContext is EvidenceRunContext {
  return (
    runContext !== undefined &&
    runContext !== null &&
    typeof runContext.revision === 'string' &&
    runContext.revision.trim().length > 0 &&
    typeof runContext.runId === 'string' &&
    runContext.runId.trim().length > 0 &&
    runContext.outcomes !== undefined &&
    runContext.outcomes !== null &&
    typeof runContext.outcomes === 'object'
  );
}

export function evaluateCompliance(
  definition: FeatureComplianceDefinition,
  runContext?: EvidenceRunContext | null,
): ComplianceResult {
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

  // Bind declared executable cases to current machine-readable test-run results.
  // Missing, skipped, failed, stale, or unexecuted evidence cannot produce COMPLIANT.
  if (evidence.executableCases !== undefined) {
    if (!hasUsableRunContext(runContext)) {
      missingEvidence.push('evidenceRunResults');
      reasons.push('No current test-run evidence supplied for declared executable cases');
      for (const caseId of evidence.executableCases) {
        if (isExecutableCaseRegistered(caseId) && !missingEvidence.includes(`case:${caseId}`)) {
          missingEvidence.push(`case:${caseId}`);
          reasons.push(`Executable case ${caseId} has no bound test result in the current run`);
        }
      }
    } else {
      const casesToVerify = new Set<string>(evidence.executableCases);
      if (evidence.levelEvidenceCases !== undefined) {
        const levelKeys: Array<keyof typeof levels> = ['element', 'properties', 'relationships', 'constraints'];
        for (const levelKey of levelKeys) {
          if (levels[levelKey] === 'PASS') {
            for (const caseId of evidence.levelEvidenceCases[levelKey] ?? []) {
              casesToVerify.add(caseId);
            }
          }
        }
      }
      for (const caseId of casesToVerify) {
        const record = (EXECUTABLE_EVIDENCE as Record<string, (typeof EXECUTABLE_EVIDENCE)[keyof typeof EXECUTABLE_EVIDENCE] | undefined>)[caseId];
        if (!record) {
          continue;
        }
        const outcome = runContext.outcomes[caseId];
        if (!outcome) {
          missingEvidence.push(`case:${caseId}`);
          reasons.push(`No test result recorded for executable case ${caseId} in the current run`);
          continue;
        }
        if (outcome.status === 'skipped') {
          missingEvidence.push(`case:${caseId}`);
          reasons.push(`Executable case ${caseId} was skipped in the current run and cannot certify compliance`);
          continue;
        }
        if (outcome.status === 'failed') {
          missingEvidence.push(`case:${caseId}`);
          reasons.push(`Executable case ${caseId} failed in the current run and cannot certify compliance`);
          continue;
        }
        if (outcome.status !== 'passed') {
          missingEvidence.push(`case:${caseId}`);
          reasons.push(`Executable case ${caseId} has unknown test status '${(outcome as { status: string }).status}' in the current run`);
          continue;
        }
        if (!outcome.revision || outcome.revision !== runContext.revision) {
          missingEvidence.push(`case:${caseId}`);
          reasons.push(
            `Executable case ${caseId} result is stale (result revision '${outcome.revision || 'unknown'}' does not match current revision '${runContext.revision}')`,
          );
          continue;
        }
        if (!outcome.runId || outcome.runId !== runContext.runId) {
          missingEvidence.push(`case:${caseId}`);
          reasons.push(
            `Executable case ${caseId} result run identity does not match the current test run`,
          );
          continue;
        }
        if (outcome.testFile !== record.testFile || outcome.testName !== record.testName) {
          missingEvidence.push(`case:${caseId}`);
          reasons.push(
            `Executable case ${caseId} result does not match the registered test binding (${record.testFile} :: ${record.testName}); the test is missing or was renamed`,
          );
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
