import type { SemanticElement } from './base';

export interface Requirement extends SemanticElement {
  metaclass: 'Requirement';
  requirementId: string;
  text: string;
  status: 'draft' | 'approved' | 'implemented' | 'verified' | 'failed' | 'stale' | 'retired';
  version: string;
  risk?: 'low' | 'medium' | 'high' | 'critical';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  baselineId?: string;
  source?: string;
  rationale?: string;
  owner?: string;
  copiedFromId?: string;
  derivedFromIds?: string[];
  masterId?: string;
}

/**
 * Normative SysML v1.6 TestCase classifier (Clause 16.3.2.7).
 */
export interface TestCase extends SemanticElement {
  metaclass: 'TestCase';
  verifiesRequirementIds: string[];
  testCaseKind?: 'analysis' | 'inspection' | 'test' | 'demonstration';
  status?: 'draft' | 'ready' | 'passed' | 'failed';
  behaviorId?: string;
}

/**
 * Legacy ADIA verification case extension retained for backward compatibility.
 */
export interface AdiaVerificationCaseExtension extends SemanticElement {
  metaclass: 'VerificationCase';
  method: string;
  verifiesRequirementIds: string[];
}
