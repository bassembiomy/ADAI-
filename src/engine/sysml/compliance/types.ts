/**
 * Provenance and Four-Level Compliance Types for OMG SysML v1.6 in ADIA.
 * Conformance baseline: OMG SysML v1.6 formal/19-11-01 plus inherited UML semantics.
 */

export type SemanticAuthority =
  | 'OMG_SYSML_1_6'
  | 'UML_FOUNDATION'
  | 'CAMEO_TOOLING'
  | 'ADIA_EXTENSION';

export type InteractionDefectEvidenceId =
  | 'UML-PORT-STANDARD-001'
  | 'SYSML-PORT-CREATE-001'
  | 'SYSML-IBD-DELEGATION-001'
  | 'SYSML-REQ-TESTCASE-001'
  | 'ADIA-VERIFICATIONCASE-NORMALIZATION-001'
  | 'SYSML-REQ-SATISFY-STATE-001'
  | 'CAMEO-DIAGRAM-ACTIVATE-001';

export type ComplianceLevelStatus = 'PASS' | 'FAIL' | 'NOT_APPLICABLE';

export type OverallComplianceStatus = 'COMPLIANT' | 'PARTIAL' | 'NON_COMPLIANT' | 'NOT_APPLICABLE';

export interface FourLevelCompliance {
  element: ComplianceLevelStatus;
  properties: ComplianceLevelStatus;
  relationships: ComplianceLevelStatus;
  constraints: ComplianceLevelStatus;
}

export interface LevelEvidenceCases {
  element?: string[];
  properties?: string[];
  relationships?: string[];
  constraints?: string[];
}

export interface ComplianceEvidence {
  /** Normative specification clause or standard section (e.g., 'OMG SysML 1.6 Clause 9.3.2.8') */
  specificationSection: string;
  /** Primary source file defining the feature */
  sourceFile: string;
  /** Domain type name or symbol */
  domainType: string;
  /** Command name responsible for mutating/creating this feature */
  command: string;
  /** Validation function or rule module */
  validator: string;
  /** Persistence adapter / collection mapping */
  persistence: string;
  /** Diagram / Model Explorer projection selector */
  projection: string;
  /** Automated test files providing verification evidence */
  tests: string[];
  /** Stable registered executable case IDs required to substantiate compliance */
  executableCases?: string[];
  /** Registered executable cases mapped to specific compliance levels */
  levelEvidenceCases?: LevelEvidenceCases;
}

export interface FeatureComplianceDefinition {
  id: string;
  name: string;
  authority: SemanticAuthority;
  levels: FourLevelCompliance;
  evidence: Partial<ComplianceEvidence>;
  notes?: string;
}

export interface ComplianceResult {
  id: string;
  name: string;
  authority: SemanticAuthority;
  status: OverallComplianceStatus;
  levels: FourLevelCompliance;
  missingEvidence: string[];
  reasons: string[];
}
