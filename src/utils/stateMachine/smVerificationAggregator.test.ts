import { describe, expect, it } from 'vitest';
import {
  deriveAcceptance,
  type VerificationBundle,
  type ActivityEvidence,
  type VerificationActivity,
} from './smVerificationAggregator';

describe('smVerificationAggregator fail-closed acceptance policy', () => {
  const makeActivity = (
    activity: VerificationActivity,
    status: 'PASS' | 'FAIL' | 'NOT_RUN' | 'NOT_APPLICABLE' | 'PENDING',
    summary = `${activity} ${status}`,
  ): ActivityEvidence => ({
    activity,
    status,
    summary,
    command: null,
    details: null,
  });

  const makeAllPassActivities = (): Record<VerificationActivity, ActivityEvidence> => ({
    'structural': makeActivity('structural', 'PASS'),
    'semantic': makeActivity('semantic', 'PASS'),
    'test-generation': makeActivity('test-generation', 'PASS'),
    'host-compilation': makeActivity('host-compilation', 'PASS'),
    'host-runtime': makeActivity('host-runtime', 'PASS'),
    'sanitizers': makeActivity('sanitizers', 'PASS'),
    'statement-coverage': makeActivity('statement-coverage', 'PASS'),
    'branch-coverage': makeActivity('branch-coverage', 'PASS'),
    'mcdc-coverage': makeActivity('mcdc-coverage', 'NOT_APPLICABLE', 'MC/DC not required for non-safety chart'),
    'differential': makeActivity('differential', 'PASS'),
    'static-analysis': makeActivity('static-analysis', 'PASS'),
    'misra-analysis': makeActivity('misra-analysis', 'PASS'),
    'target-compilation': makeActivity('target-compilation', 'PASS'),
    'hardware': makeActivity('hardware', 'PENDING', 'Hardware execution pending bench access'),
  });

  it('accepts bundle when all required activities pass and non-safety MC/DC is N/A', () => {
    const activities = makeAllPassActivities();
    const bundle: VerificationBundle = {
      schemaVersion: 1,
      modelHash: 'hash_abc123',
      generatedAt: new Date().toISOString(),
      overallStatus: 'PASS',
      acceptance: false,
      activities,
    };

    const evaluated = deriveAcceptance(bundle);

    expect(evaluated.acceptance).toBe(true);
    expect(evaluated.overallStatus).toBe('PASS');
  });

  it('rejects bundle with FAIL if any required activity failed', () => {
    const activities = makeAllPassActivities();
    activities['host-runtime'] = makeActivity('host-runtime', 'FAIL', 'Assertion failed at test_core_01');

    const bundle: VerificationBundle = {
      schemaVersion: 1,
      modelHash: 'hash_abc123',
      generatedAt: new Date().toISOString(),
      overallStatus: 'PASS',
      acceptance: false,
      activities,
    };

    const evaluated = deriveAcceptance(bundle);

    expect(evaluated.acceptance).toBe(false);
    expect(evaluated.overallStatus).toBe('FAIL');
  });

  it('rejects bundle if mandatory gate is NOT_RUN (fail-closed)', () => {
    const activities = makeAllPassActivities();
    // Host compilation was skipped or blocked
    activities['host-compilation'] = makeActivity('host-compilation', 'NOT_RUN', 'Compiler not found');

    const bundle: VerificationBundle = {
      schemaVersion: 1,
      modelHash: 'hash_abc123',
      generatedAt: new Date().toISOString(),
      overallStatus: 'PASS',
      acceptance: false,
      activities,
    };

    const evaluated = deriveAcceptance(bundle);

    expect(evaluated.acceptance).toBe(false);
    expect(evaluated.overallStatus).toBe('NOT_RUN');
  });

  it('rejects bundle if MC/DC coverage is NOT_APPLICABLE when MC/DC is required for safety', () => {
    const activities = makeAllPassActivities();
    activities['mcdc-coverage'] = makeActivity('mcdc-coverage', 'NOT_APPLICABLE');

    const bundle: VerificationBundle = {
      schemaVersion: 1,
      modelHash: 'hash_abc123',
      generatedAt: new Date().toISOString(),
      overallStatus: 'PASS',
      acceptance: false,
      activities,
    };

    const evaluated = deriveAcceptance(bundle, { requireMcdc: true });

    expect(evaluated.acceptance).toBe(false);
    expect(evaluated.overallStatus).toBe('FAIL');
  });

  it('rejects bundle if configured target compilation is NOT_RUN', () => {
    const activities = makeAllPassActivities();
    activities['target-compilation'] = makeActivity('target-compilation', 'NOT_RUN', 'Target compiler arm-none-eabi-gcc missing');

    const bundle: VerificationBundle = {
      schemaVersion: 1,
      modelHash: 'hash_abc123',
      generatedAt: new Date().toISOString(),
      overallStatus: 'PASS',
      acceptance: false,
      activities,
    };

    const evaluated = deriveAcceptance(bundle, { requireTargetCompile: true });

    expect(evaluated.acceptance).toBe(false);
    expect(evaluated.overallStatus).toBe('NOT_RUN');
  });

  it('ensures hardware activity can remain PENDING but is never PASS without hardware test evidence', () => {
    const activities = makeAllPassActivities();
    expect(activities['hardware'].status).toBe('PENDING');

    const bundle: VerificationBundle = {
      schemaVersion: 1,
      modelHash: 'hash_abc123',
      generatedAt: new Date().toISOString(),
      overallStatus: 'PASS',
      acceptance: false,
      activities,
    };

    const evaluated = deriveAcceptance(bundle);
    expect(evaluated.activities['hardware'].status).toBe('PENDING');
  });
});
