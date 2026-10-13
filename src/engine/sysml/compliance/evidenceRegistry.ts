/**
 * Typed Executable Evidence Registry for SysML v1.6 & Related Semantic Authorities.
 *
 * Each stable executable case maps to the concrete automated test
 * (repository-relative test file + exact test title) that substantiates it,
 * together with its semantic authority, specification section, and ADIA
 * implementation locations. Compliance claims are bound to machine-readable
 * test-run results (see EvidenceRunContext) rather than this static registry.
 */
import type { SemanticAuthority } from './types';
import type { ExecutableCaseRunOutcome } from './types';

export const REGISTERED_EXECUTABLE_CASES = {
  // Ports (UML Foundation & SysML 1.6)
  PORT_UML_STANDARD_OWNED: 'UML Standard Port created as owned feature without proxy/full stereotyping',
  PORT_PROXY_INTERFACE_TYPING: 'ProxyPort typed by InterfaceBlock is accepted',
  PORT_PROXY_WRONG_TYPE_REJECTED: 'ProxyPort wrong type or missing type rejected with TYPE_NOT_FOUND',
  PORT_FULL_BLOCK_TYPING: 'FullPort typed by Block, interface, or valueType is accepted',
  PORT_FLOW_LEGACY_OWNED: 'FlowPort created as legacy feature with direction and typing',
  PORT_NESTED_PROXY_VALIDATED: 'Nested proxy ports validate against repository definitions',
  PORT_PERSISTENCE_STABLE: 'Port definition and kinds survive repository serialization',

  // IBD Connectors
  IBD_BOUNDARY_DELEGATION_PERSISTS: 'Boundary port to internal part port delegation connector persists',
  IBD_ASSEMBLY_PART_TO_PART: 'Internal part to part assembly connector created atomically',
  IBD_ASSEMBLY_BOUNDARY_REJECTED: 'Assembly connector on boundary port rejected with INVALID_CONNECTOR_CONTEXT',
  IBD_CONNECTOR_PERSISTENCE: 'Connectors and endpoints preserved across repository serialization',

  // Requirement & TestCase
  REQ_TESTCASE_STABLE_IDENTITY: 'TestCase created from tree and canvas under stable canonical identity',
  REQ_TESTCASE_VERIFIES_PERSISTED: 'TestCase verify relationship to Requirement preserved',
  REQ_BLOCK_NO_DRILLDOWN: 'Double-clicking Block on Requirement Diagram is no-op; explicit navigation supported',
  ADIA_LEGACY_VERIFICATION_NORMALIZATION: 'Legacy VerificationCase normalized to TestCase under ADIA_EXTENSION',

  // State Satisfy
  STATE_SATISFY_REAL_ID_REQUIRED: 'State satisfy requires resolvable canonical State endpoint identity',
  STATE_SATISFY_DIRECTION_ENFORCED: 'Reversed Requirement-to-State satisfy rejected with INVALID_SATISFY_DIRECTION',
  STATE_SATISFY_RELATIONSHIP_PERSISTS: 'State-to-Requirement satisfy relationship persists in repository',

  // Package Diagram Activation (Cameo Tooling)
  CAMEO_DIAGRAM_ACTIVATE_ZERO_CREATES: 'Zero Package diagrams prompts or automatically creates new diagram',
  CAMEO_DIAGRAM_ACTIVATE_ONE_OPENS: 'Single Package diagram opens directly without chooser',
  CAMEO_DIAGRAM_ACTIVATE_MANY_CHOOSER: 'Multiple Package diagrams opens last-active or chooser',
} as const;

export type RegisteredExecutableCaseId = keyof typeof REGISTERED_EXECUTABLE_CASES;

export interface ExecutableEvidenceImplementation {
  sourceFiles: string[];
  domainTypes: string[];
  commands: string[];
  validators: string[];
  persistence: string;
  projections: string[];
}

export interface ExecutableEvidenceRecord {
  id: RegisteredExecutableCaseId;
  description: string;
  authority: SemanticAuthority;
  specificationSection: string;
  /** Repository-relative test file executing this case. */
  testFile: string;
  /** Exact test title executing this case. */
  testName: string;
  implementation: ExecutableEvidenceImplementation;
}

const CORRECTIONS_TEST_FILE = 'src/engine/sysml/diagramInteractionCorrections.test.ts';

function portImplementation(): ExecutableEvidenceImplementation {
  return {
    sourceFiles: [
      'src/engine/sysml/domain/ports.ts',
      'src/engine/sysml/model.ts',
      'src/engine/sysml/validation/portRules.ts',
      'src/services/sysmlOwnedFeatureCommands.ts',
    ],
    domainTypes: ['Port', 'PortDefinition', 'CanonicalPortKind'],
    commands: ['createOwnedPort', 'buildCreateOwnedPortCommand'],
    validators: ['validatePort', 'PORT_DIAGNOSTICS'],
    persistence: 'SysmlRepository.definitions[blockId].ports',
    projections: ['projectLegacyDiagram', 'projectDiagramScopedCanvasView'],
  };
}

function ibdImplementation(): ExecutableEvidenceImplementation {
  return {
    sourceFiles: ['src/engine/sysml/ibd.ts', 'src/services/sysmlIbdConnectorCommands.ts'],
    domainTypes: ['ConnectorUsage', 'PortUsage'],
    commands: ['createIbdConnector', 'buildCreateIbdConnectorCommand'],
    validators: ['validateConnector', 'validateConnectorCandidate'],
    persistence: 'SysmlRepository.connectors',
    projections: ['deriveIbdView', 'projectLegacyDiagram'],
  };
}

export const EXECUTABLE_EVIDENCE: Record<RegisteredExecutableCaseId, ExecutableEvidenceRecord> = {
  PORT_UML_STANDARD_OWNED: {
    id: 'PORT_UML_STANDARD_OWNED',
    description: REGISTERED_EXECUTABLE_CASES.PORT_UML_STANDARD_OWNED,
    authority: 'UML_FOUNDATION',
    specificationSection: 'ISO/IEC 19505-2 (UML 2.5.1) §11.3 Ports',
    testFile: CORRECTIONS_TEST_FILE,
    testName: 'PORT_UML_STANDARD_OWNED: creates standard UML Port as owned feature without proxy/full stereotype',
    implementation: portImplementation(),
  },
  PORT_PROXY_INTERFACE_TYPING: {
    id: 'PORT_PROXY_INTERFACE_TYPING',
    description: REGISTERED_EXECUTABLE_CASES.PORT_PROXY_INTERFACE_TYPING,
    authority: 'OMG_SYSML_1_6',
    specificationSection: 'OMG SysML 1.6 §9.3.2.12 ProxyPort; UML 2.5.1 §11.3 Ports',
    testFile: CORRECTIONS_TEST_FILE,
    testName: 'PORT_PROXY_INTERFACE_TYPING: creates ProxyPort typed by InterfaceBlock',
    implementation: portImplementation(),
  },
  PORT_PROXY_WRONG_TYPE_REJECTED: {
    id: 'PORT_PROXY_WRONG_TYPE_REJECTED',
    description: REGISTERED_EXECUTABLE_CASES.PORT_PROXY_WRONG_TYPE_REJECTED,
    authority: 'OMG_SYSML_1_6',
    specificationSection: 'OMG SysML 1.6 §9.3.2.12 ProxyPort; UML 2.5.1 §11.3 Ports',
    testFile: CORRECTIONS_TEST_FILE,
    testName: 'PORT_PROXY_WRONG_TYPE_REJECTED: rejects ProxyPort typed by non-interface Block with INVALID_PROXY_PORT_TYPE',
    implementation: portImplementation(),
  },
  PORT_FULL_BLOCK_TYPING: {
    id: 'PORT_FULL_BLOCK_TYPING',
    description: REGISTERED_EXECUTABLE_CASES.PORT_FULL_BLOCK_TYPING,
    authority: 'OMG_SYSML_1_6',
    specificationSection: 'OMG SysML 1.6 §9.3.2.8 FullPort; UML 2.5.1 §11.3 Ports',
    testFile: CORRECTIONS_TEST_FILE,
    testName: 'PORT_FULL_BLOCK_TYPING: creates FullPort typed by Block',
    implementation: portImplementation(),
  },
  PORT_FLOW_LEGACY_OWNED: {
    id: 'PORT_FLOW_LEGACY_OWNED',
    description: REGISTERED_EXECUTABLE_CASES.PORT_FLOW_LEGACY_OWNED,
    authority: 'OMG_SYSML_1_6',
    specificationSection: 'OMG SysML 1.6 §9.3.2.7 FlowPort; UML 2.5.1 §11.3 Ports',
    testFile: CORRECTIONS_TEST_FILE,
    testName: 'PORT_FLOW_LEGACY_OWNED: creates legacy FlowPort with direction',
    implementation: portImplementation(),
  },
  PORT_NESTED_PROXY_VALIDATED: {
    id: 'PORT_NESTED_PROXY_VALIDATED',
    description: REGISTERED_EXECUTABLE_CASES.PORT_NESTED_PROXY_VALIDATED,
    authority: 'OMG_SYSML_1_6',
    specificationSection: 'OMG SysML 1.6 §9.3.2.12 ProxyPort; UML 2.5.1 §11.3 Ports',
    testFile: CORRECTIONS_TEST_FILE,
    testName: 'PORT_NESTED_PROXY_VALIDATED: nested proxy ports validate against repository definitions',
    implementation: portImplementation(),
  },
  PORT_PERSISTENCE_STABLE: {
    id: 'PORT_PERSISTENCE_STABLE',
    description: REGISTERED_EXECUTABLE_CASES.PORT_PERSISTENCE_STABLE,
    authority: 'OMG_SYSML_1_6',
    specificationSection: 'OMG SysML 1.6 §9.3.2 Ports; UML 2.5.1 §11.3 Ports',
    testFile: CORRECTIONS_TEST_FILE,
    testName: 'PORT_PERSISTENCE_STABLE: port definitions and kinds survive serialization round trip',
    implementation: portImplementation(),
  },
  IBD_BOUNDARY_DELEGATION_PERSISTS: {
    id: 'IBD_BOUNDARY_DELEGATION_PERSISTS',
    description: REGISTERED_EXECUTABLE_CASES.IBD_BOUNDARY_DELEGATION_PERSISTS,
    authority: 'OMG_SYSML_1_6',
    specificationSection: 'OMG SysML 1.6 §9.3.1.2 Internal Block Diagram, Clause 9.3.2 Connectors',
    testFile: CORRECTIONS_TEST_FILE,
    testName: 'IBD_BOUNDARY_DELEGATION_PERSISTS: creates and persists boundary port to internal part port delegation connector',
    implementation: ibdImplementation(),
  },
  IBD_ASSEMBLY_PART_TO_PART: {
    id: 'IBD_ASSEMBLY_PART_TO_PART',
    description: REGISTERED_EXECUTABLE_CASES.IBD_ASSEMBLY_PART_TO_PART,
    authority: 'OMG_SYSML_1_6',
    specificationSection: 'OMG SysML 1.6 §9.3.1.2 Internal Block Diagram, Clause 9.3.2 Connectors',
    testFile: CORRECTIONS_TEST_FILE,
    testName: 'IBD_ASSEMBLY_PART_TO_PART: creates internal part to part assembly connector',
    implementation: ibdImplementation(),
  },
  IBD_ASSEMBLY_BOUNDARY_REJECTED: {
    id: 'IBD_ASSEMBLY_BOUNDARY_REJECTED',
    description: REGISTERED_EXECUTABLE_CASES.IBD_ASSEMBLY_BOUNDARY_REJECTED,
    authority: 'OMG_SYSML_1_6',
    specificationSection: 'OMG SysML 1.6 §9.3.1.2 Internal Block Diagram, Clause 9.3.2 Connectors',
    testFile: CORRECTIONS_TEST_FILE,
    testName: 'IBD_ASSEMBLY_BOUNDARY_REJECTED: rejects assembly connector on boundary port with INVALID_CONNECTOR_CONTEXT',
    implementation: ibdImplementation(),
  },
  IBD_CONNECTOR_PERSISTENCE: {
    id: 'IBD_CONNECTOR_PERSISTENCE',
    description: REGISTERED_EXECUTABLE_CASES.IBD_CONNECTOR_PERSISTENCE,
    authority: 'OMG_SYSML_1_6',
    specificationSection: 'OMG SysML 1.6 §9.3.1.2 Internal Block Diagram, Clause 9.3.2 Connectors',
    testFile: CORRECTIONS_TEST_FILE,
    testName: 'IBD_CONNECTOR_PERSISTENCE: connector and endpoints preserved across serialization',
    implementation: ibdImplementation(),
  },
  REQ_TESTCASE_STABLE_IDENTITY: {
    id: 'REQ_TESTCASE_STABLE_IDENTITY',
    description: REGISTERED_EXECUTABLE_CASES.REQ_TESTCASE_STABLE_IDENTITY,
    authority: 'OMG_SYSML_1_6',
    specificationSection: 'OMG SysML 1.6 §16.3.2.4 TestCase, §16.3.1.1 Requirement Diagram',
    testFile: CORRECTIONS_TEST_FILE,
    testName: 'REQ_TESTCASE_STABLE_IDENTITY: TestCase exists under stable canonical identity',
    implementation: {
      sourceFiles: [
        'src/services/sysmlDiagramCreation.ts',
        'src/engine/sysml/requirementsDiagramScope.ts',
        'src/services/sysmlProjectionState.ts',
      ],
      domainTypes: ['TestCase', 'VerificationCase'],
      commands: ['createAndPresentElement', 'createVerificationCase'],
      validators: ['validateSysmlRepository'],
      persistence: 'SysmlRepository.verificationCases normalized to TestCase',
      projections: ['projectLegacyDiagram', 'projectDiagramScopedCanvasView'],
    },
  },
  REQ_TESTCASE_VERIFIES_PERSISTED: {
    id: 'REQ_TESTCASE_VERIFIES_PERSISTED',
    description: REGISTERED_EXECUTABLE_CASES.REQ_TESTCASE_VERIFIES_PERSISTED,
    authority: 'OMG_SYSML_1_6',
    specificationSection: 'OMG SysML 1.6 §16.3.2.4 TestCase, §16.3.1.1 Requirement Diagram',
    testFile: CORRECTIONS_TEST_FILE,
    testName: 'REQ_TESTCASE_VERIFIES_PERSISTED: TestCase verifiesRequirementIds preserved',
    implementation: {
      sourceFiles: [
        'src/services/sysmlDiagramCreation.ts',
        'src/engine/sysml/requirementsDiagramScope.ts',
        'src/services/sysmlProjectionState.ts',
      ],
      domainTypes: ['TestCase', 'VerificationCase'],
      commands: ['createAndPresentElement', 'createVerificationCase'],
      validators: ['validateSysmlRepository'],
      persistence: 'SysmlRepository.verificationCases normalized to TestCase',
      projections: ['projectLegacyDiagram', 'projectDiagramScopedCanvasView'],
    },
  },
  REQ_BLOCK_NO_DRILLDOWN: {
    id: 'REQ_BLOCK_NO_DRILLDOWN',
    description: REGISTERED_EXECUTABLE_CASES.REQ_BLOCK_NO_DRILLDOWN,
    authority: 'OMG_SYSML_1_6',
    specificationSection: 'OMG SysML 1.6 §16.3.1.1 Requirement Diagram',
    testFile: CORRECTIONS_TEST_FILE,
    testName: 'REQ_BLOCK_NO_DRILLDOWN: double-clicking Block on Requirement Diagram is no-op',
    implementation: {
      sourceFiles: [
        'src/services/sysmlDiagramCreation.ts',
        'src/engine/sysml/requirementsDiagramScope.ts',
        'src/services/sysmlProjectionState.ts',
      ],
      domainTypes: ['TestCase', 'VerificationCase'],
      commands: ['createAndPresentElement', 'createVerificationCase'],
      validators: ['validateSysmlRepository'],
      persistence: 'SysmlRepository.verificationCases normalized to TestCase',
      projections: ['projectLegacyDiagram', 'projectDiagramScopedCanvasView'],
    },
  },
  ADIA_LEGACY_VERIFICATION_NORMALIZATION: {
    id: 'ADIA_LEGACY_VERIFICATION_NORMALIZATION',
    description: REGISTERED_EXECUTABLE_CASES.ADIA_LEGACY_VERIFICATION_NORMALIZATION,
    authority: 'ADIA_EXTENSION',
    specificationSection: 'ADIA VerificationCase Normalization & Transition Architecture: SysML 1.6 TestCase mapping',
    testFile: CORRECTIONS_TEST_FILE,
    testName: 'ADIA_LEGACY_VERIFICATION_NORMALIZATION: legacy VerificationCase normalized to TestCase under ADIA_EXTENSION',
    implementation: {
      sourceFiles: ['src/engine/sysml/model.ts', 'src/services/sysmlDiagramCreation.ts'],
      domainTypes: ['VerificationCase', 'TestCase'],
      commands: ['createVerificationCase'],
      validators: ['validateSysmlRepository'],
      persistence: 'SysmlRepository.verificationCases',
      projections: ['projectLegacyDiagram'],
    },
  },
  STATE_SATISFY_REAL_ID_REQUIRED: {
    id: 'STATE_SATISFY_REAL_ID_REQUIRED',
    description: REGISTERED_EXECUTABLE_CASES.STATE_SATISFY_REAL_ID_REQUIRED,
    authority: 'OMG_SYSML_1_6',
    specificationSection: 'OMG SysML 1.6 §16.3.2.3 Satisfy; ISO/IEC 19514:2017',
    testFile: CORRECTIONS_TEST_FILE,
    testName: 'STATE_SATISFY_REAL_ID_REQUIRED: requires resolvable canonical State endpoint identity',
    implementation: {
      sourceFiles: [
        'src/engine/sysml/connectionPolicy.ts',
        'src/services/sysmlConnectionUi.ts',
        'src/services/sysmlCreationRules.ts',
        'src/engine/sysml/policy.ts',
      ],
      domainTypes: ['ConnectionEndpoint', 'SysmlRelationship'],
      commands: ['createAndPresentRelationship', 'createRelationship'],
      validators: ['evaluateSysmlConnection', 'validateCanonicalRelationshipCandidate'],
      persistence: 'SysmlRepository.relationships',
      projections: ['projectLegacyDiagram'],
    },
  },
  STATE_SATISFY_DIRECTION_ENFORCED: {
    id: 'STATE_SATISFY_DIRECTION_ENFORCED',
    description: REGISTERED_EXECUTABLE_CASES.STATE_SATISFY_DIRECTION_ENFORCED,
    authority: 'OMG_SYSML_1_6',
    specificationSection: 'OMG SysML 1.6 §16.3.2.3 Satisfy; ISO/IEC 19514:2017',
    testFile: CORRECTIONS_TEST_FILE,
    testName: 'STATE_SATISFY_DIRECTION_ENFORCED: reversed Requirement-to-State satisfy rejected with INVALID_SATISFY_DIRECTION',
    implementation: {
      sourceFiles: [
        'src/engine/sysml/connectionPolicy.ts',
        'src/services/sysmlConnectionUi.ts',
        'src/services/sysmlCreationRules.ts',
        'src/engine/sysml/policy.ts',
      ],
      domainTypes: ['ConnectionEndpoint', 'SysmlRelationship'],
      commands: ['createAndPresentRelationship', 'createRelationship'],
      validators: ['evaluateSysmlConnection', 'validateCanonicalRelationshipCandidate'],
      persistence: 'SysmlRepository.relationships',
      projections: ['projectLegacyDiagram'],
    },
  },
  STATE_SATISFY_RELATIONSHIP_PERSISTS: {
    id: 'STATE_SATISFY_RELATIONSHIP_PERSISTS',
    description: REGISTERED_EXECUTABLE_CASES.STATE_SATISFY_RELATIONSHIP_PERSISTS,
    authority: 'OMG_SYSML_1_6',
    specificationSection: 'OMG SysML 1.6 §16.3.2.3 Satisfy; ISO/IEC 19514:2017',
    testFile: CORRECTIONS_TEST_FILE,
    testName: 'STATE_SATISFY_RELATIONSHIP_PERSISTS: State-to-Requirement satisfy relationship valid and persists',
    implementation: {
      sourceFiles: [
        'src/engine/sysml/connectionPolicy.ts',
        'src/services/sysmlConnectionUi.ts',
        'src/services/sysmlCreationRules.ts',
        'src/engine/sysml/policy.ts',
      ],
      domainTypes: ['ConnectionEndpoint', 'SysmlRelationship'],
      commands: ['createAndPresentRelationship', 'createRelationship'],
      validators: ['evaluateSysmlConnection', 'validateCanonicalRelationshipCandidate'],
      persistence: 'SysmlRepository.relationships',
      projections: ['projectLegacyDiagram'],
    },
  },
  CAMEO_DIAGRAM_ACTIVATE_ZERO_CREATES: {
    id: 'CAMEO_DIAGRAM_ACTIVATE_ZERO_CREATES',
    description: REGISTERED_EXECUTABLE_CASES.CAMEO_DIAGRAM_ACTIVATE_ZERO_CREATES,
    authority: 'CAMEO_TOOLING',
    specificationSection: 'Cameo Systems Modeler Tooling Benchmark: Package Diagram activation and last-active restoration',
    testFile: CORRECTIONS_TEST_FILE,
    testName: 'CAMEO_DIAGRAM_ACTIVATE_ZERO_CREATES: zero package diagrams returns create',
    implementation: {
      sourceFiles: [
        'src/services/sysmlDiagramActivation.ts',
        'src/features/modelExplorer/modelDiagramRegistry.ts',
        'src/App.tsx',
      ],
      domainTypes: ['PackageDiagramActivation', 'ModelDiagramDefinition'],
      commands: ['resolvePackageDiagramActivation'],
      validators: ['validateSysmlRepository'],
      persistence: 'SysmlRepository.diagrams',
      projections: ['ModelDiagramRegistry'],
    },
  },
  CAMEO_DIAGRAM_ACTIVATE_ONE_OPENS: {
    id: 'CAMEO_DIAGRAM_ACTIVATE_ONE_OPENS',
    description: REGISTERED_EXECUTABLE_CASES.CAMEO_DIAGRAM_ACTIVATE_ONE_OPENS,
    authority: 'CAMEO_TOOLING',
    specificationSection: 'Cameo Systems Modeler Tooling Benchmark: Package Diagram activation and last-active restoration',
    testFile: CORRECTIONS_TEST_FILE,
    testName: 'CAMEO_DIAGRAM_ACTIVATE_ONE_OPENS: single package diagram opens directly without chooser',
    implementation: {
      sourceFiles: [
        'src/services/sysmlDiagramActivation.ts',
        'src/features/modelExplorer/modelDiagramRegistry.ts',
        'src/App.tsx',
      ],
      domainTypes: ['PackageDiagramActivation', 'ModelDiagramDefinition'],
      commands: ['resolvePackageDiagramActivation'],
      validators: ['validateSysmlRepository'],
      persistence: 'SysmlRepository.diagrams',
      projections: ['ModelDiagramRegistry'],
    },
  },
  CAMEO_DIAGRAM_ACTIVATE_MANY_CHOOSER: {
    id: 'CAMEO_DIAGRAM_ACTIVATE_MANY_CHOOSER',
    description: REGISTERED_EXECUTABLE_CASES.CAMEO_DIAGRAM_ACTIVATE_MANY_CHOOSER,
    authority: 'CAMEO_TOOLING',
    specificationSection: 'Cameo Systems Modeler Tooling Benchmark: Package Diagram activation and last-active restoration',
    testFile: CORRECTIONS_TEST_FILE,
    testName: 'CAMEO_DIAGRAM_ACTIVATE_MANY_CHOOSER: multiple diagrams opens chooser or last active',
    implementation: {
      sourceFiles: [
        'src/services/sysmlDiagramActivation.ts',
        'src/features/modelExplorer/modelDiagramRegistry.ts',
        'src/App.tsx',
      ],
      domainTypes: ['PackageDiagramActivation', 'ModelDiagramDefinition'],
      commands: ['resolvePackageDiagramActivation'],
      validators: ['validateSysmlRepository'],
      persistence: 'SysmlRepository.diagrams',
      projections: ['ModelDiagramRegistry'],
    },
  },
};

export function isExecutableCaseRegistered(caseId: string): boolean {
  return Object.prototype.hasOwnProperty.call(REGISTERED_EXECUTABLE_CASES, caseId);
}

export function listExecutableEvidenceRecords(): ExecutableEvidenceRecord[] {
  return (Object.keys(EXECUTABLE_EVIDENCE) as RegisteredExecutableCaseId[]).map(id => EXECUTABLE_EVIDENCE[id]);
}

/** Minimal Vitest JSON-reporter report shape consumed for evidence binding. */
export interface VitestJsonAssertionResult {
  title: string;
  fullName: string;
  ancestorTitles?: string[];
  status: string;
}

export interface VitestJsonFileResult {
  name: string;
  status: string;
  assertionResults?: VitestJsonAssertionResult[];
}

export interface VitestJsonReport {
  testResults?: VitestJsonFileResult[];
}

function normalizeReportPath(path: string): string {
  return path.replace(/\\/g, '/');
}

function reportPathMatchesBinding(reportPath: string, testFile: string): boolean {
  const normalized = normalizeReportPath(reportPath);
  return normalized === testFile || normalized.endsWith(`/${testFile}`);
}

function toExecutableStatus(reportStatus: string): ExecutableCaseRunOutcome['status'] {
  if (reportStatus === 'passed') return 'passed';
  if (reportStatus === 'failed') return 'failed';
  return 'skipped';
}

/**
 * Consumes a Vitest JSON-reporter report into revision- and run-bound case
 * outcomes keyed by registered executable case ID. Cases with no matching
 * executed test are absent from the result so the evaluator fails closed.
 */
export function buildOutcomesFromVitestReport(
  report: VitestJsonReport,
  meta: { revision: string; runId: string },
): Record<string, ExecutableCaseRunOutcome> {
  const outcomes: Record<string, ExecutableCaseRunOutcome> = {};
  for (const fileResult of report.testResults ?? []) {
    for (const assertion of fileResult.assertionResults ?? []) {
      for (const record of listExecutableEvidenceRecords()) {
        if (
          reportPathMatchesBinding(fileResult.name, record.testFile) &&
          assertion.title === record.testName
        ) {
          outcomes[record.id] = {
            caseId: record.id,
            testFile: record.testFile,
            testName: record.testName,
            fullName: assertion.fullName ?? assertion.title,
            status: toExecutableStatus(assertion.status),
            revision: meta.revision,
            runId: meta.runId,
          };
        }
      }
    }
  }
  return outcomes;
}
