/**
 * Stable Executable Evidence Registry for SysML v1.6 & Related Semantic Authorities.
 * Binds self-declared compliance levels to executable semantic cases.
 */

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

export function isExecutableCaseRegistered(caseId: string): boolean {
  return Object.prototype.hasOwnProperty.call(REGISTERED_EXECUTABLE_CASES, caseId);
}
