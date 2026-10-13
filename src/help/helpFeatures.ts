import { getSupportedElementKinds } from '../engine/sysml/capabilities/catalog';
import { RELATIONSHIP_ALIASES } from '../engine/sysml/capabilities/relationshipPolicy';
import { createEmptyRepositoryV4 } from '../engine/sysml/domain';
import { getInspectorSchema, type InspectorSchema } from '../features/sysml/inspectorSchema';
import { VALID_ACTION_KINDS } from '../agent/actionContracts';
import { SYSML_RELATIONSHIPS, SYSML_DIAGRAM_KINDS } from '../features/modelExplorer/modelExplorerCapabilities';
import { UI_HELP_FEATURES, HELP_UI_FEATURE_TOPICS } from './uiFeatureTopics';
import { APP_HELP_FEATURES, APP_HELP_TOPICS } from './appFeatureTopics';
import { OPM_HELP_FEATURES, OPM_HELP_TOPICS } from './opmFeatureTopics';
import { LIVE_UI_FEATURES, LIVE_UI_TOPICS } from './liveUiTopics';
import { HMI_HELP_TOPICS } from './hmiTopics';
import { HMI_CATALOG } from '../features/hmi/hmiCatalog';
import { getBlockHelpReferences, getBlockHelpGaps } from './blockReference';
import type { HelpTopic } from './helpTypes';
import { BEHAVIOR_ELEMENT_REFERENCES } from './referenceTopics';

export interface HelpFeature {
  id: string;
  label: string;
  topicId: string;
  sectionId?: string;
  sourcePath: string;
  kind: 'element' | 'relationship' | 'diagram' | 'property' | 'action' | 'block' | 'ai-tool';
  module?: string;
  documentationGaps?: string[];
}
const inspectorSource = 'src/features/sysml/inspectorSchema.ts';
const topicId = (key: string) => `inspector-field-${key}`;

/** Expand schema factories with representative metadata; no commands are executed. */
export function getHelpInspectorSchemas(): InspectorSchema[] {
  const repository = createEmptyRepositoryV4();
  repository.elements['help-owner'] = { id: 'help-owner', name: 'Example package', metaclass: 'Package', namespace: [], ownerId: null };
  for (const { metaclass } of getSupportedElementKinds()) {
    const id = `help-${metaclass}`;
    const extras: Record<string, unknown> = {};
    if (['PartProperty', 'ReferenceProperty', 'ValueProperty', 'ConstraintProperty', 'FlowProperty', 'Port', 'Parameter'].includes(metaclass)) extras.typeId = '';
    if (['FlowProperty', 'Port', 'Parameter'].includes(metaclass)) extras.direction = 'in';
    if (metaclass === 'Port') extras.isConjugated = false;
    if (['PartProperty', 'ReferenceProperty'].includes(metaclass)) extras.aggregation = 'none';
    if (metaclass === 'Requirement') { extras.text = ''; extras.status = 'draft'; }
    repository.elements[id] = { id, name: metaclass, metaclass, ownerId: 'help-owner', namespace: [], ...extras } as any;
  }
  for (const metaclass of new Set(Object.values(RELATIONSHIP_ALIASES))) {
    const id = `help-rel-${metaclass}`;
    repository.relationships[id] = { id, name: metaclass, metaclass, sourceId: 'help-Block', targetId: 'help-Block',
      ...(metaclass === 'Connector' ? { sourceEnd: { id: 'help-end1', roleId: '' }, targetEnd: { id: 'help-end2', roleId: '' } } : {}) } as any;
  }
  repository.diagrams['help-diagram'] = { id: 'help-diagram', name: 'Example BDD', metaclass: 'Diagram', namespace: [], ownerId: 'help-owner', diagramKind: 'bdd', presentationIds: [] };
  repository.itemFlows ??= {};
  repository.itemFlows['help-flow'] = { id: 'help-flow', sourceId: 'help-Block', targetId: 'help-Block', conveyedClassifierIds: [], realizingRelationshipId: '' } as any;
  return [
    ...Object.keys(repository.elements).filter(id => id.startsWith('help-') && id !== 'help-owner').map(elementId => getInspectorSchema({ repository, elementId })),
    ...Object.keys(repository.relationships).filter(id => id.startsWith('help-rel')).map(relationshipId => getInspectorSchema({ repository, relationshipId })),
    getInspectorSchema({ repository, elementId: 'help-diagram' }),
    getInspectorSchema({ repository, itemFlowId: 'help-flow' }),
  ].filter((schema): schema is InspectorSchema => !!schema);
}

const fieldGuidance: Record<string, string> = {
  metaclass: 'Read the element or relationship kind here. Its metaclass is immutable; create the correct kind rather than attempting to change it in place.',
  name: 'Enter a display name for the selected semantic object. Renaming preserves its stable identity and existing references; diagram presentations show the updated name.',
  ownerId: 'Choose a Model, Package or Block as owner. The picker excludes the selected element and its descendants to avoid ownership cycles. Root ownership is fixed. Moving ownership changes semantic containment rather than just canvas position.',
  typeId: 'Choose an existing classifier from the Type picker. Available types include blocks, interface blocks, data types, value types, enumerations and signals. A missing reference is shown as unavailable; replace it with a compatible existing type.',
  unitId: 'Choose an existing Unit element for this Value Type. Select None to remove the reference. For example, define a metre Unit and select it for a length Value Type.',
  quantityKindId: 'Choose an existing Quantity Kind element, such as length, for a Unit or Value Type. None removes the reference. This is a semantic reference rather than free text.',
  symbol: 'Enter the symbol displayed for a Unit or Quantity Kind. A Unit requires a nonblank symbol, for example m. A Quantity Kind may omit its symbol.',
  description: 'Enter descriptive text for the Quantity Kind. Clearing it removes the optional description; this text does not define a simulation equation.',
  purpose: 'Describe the purpose of the selected Viewpoint, for example reviewing thermal requirements. This changes the Viewpoint purpose text.',
  stakeholderIds: 'Select Stakeholder elements addressed by the Viewpoint. The picker stores references to existing stakeholders; create stakeholders first if the list is empty.',
  concernIds: 'Select Requirement elements representing concerns addressed by the Viewpoint. This records references; it does not mark those requirements verified.',
  concerns: 'Enter concerns one per line. Blank lines and surrounding whitespace are removed. These free-text concerns supplement rather than replace Requirement references.',
  languages: 'Enter the languages used by the Viewpoint, one per line, for example SysML. Blank lines are removed.',
  presentation: 'Enter presentation conventions for the Viewpoint one per line, for example BDD with parts compartment. These are descriptive conventions rather than rendering commands.',
  methodText: 'Describe the Viewpoint method as text. Clearing the field removes this optional method; it does not execute a procedure.',
  viewpoint: 'Read the Viewpoint derived from the View’s conform relationship. Change that relationship to change the displayed Viewpoint; the field itself is read-only.',
  exposes: 'Read the elements derived from expose relationships leaving the View. Add or delete those relationships to change the exposed set; this field is read-only.',
  direction: 'Choose In, Out or In/Out to record the selected port, flow property or parameter direction. This updates semantic metadata; inspect connector compatibility separately.',
  isConjugated: 'Enable Conjugated to record conjugation on a Port. For example, a conjugated proxy port reverses the interpretation of its interface. This does not reverse a canvas edge by itself.',
  aggregation: 'Choose Composite, Shared or None for a part or reference property. This changes the aggregation metadata; ownership and references must still satisfy model validation.',
  text: 'Enter the Requirement’s specification text. For example, state a measurable limit such as response time below 100 ms. Changing text does not establish verification evidence.',
  status: 'Choose Draft, Approved, Implemented or Verified. This records requirement lifecycle status. Review available evidence before marking Verified; status alone is not a proof of verification.',
  sourceId: 'Choose the semantic source endpoint of the selected relationship or Item Flow. The picker offers repository elements. The command gateway still checks relationship compatibility.',
  targetId: 'Choose the semantic target endpoint of the selected relationship or Item Flow. Source and target order matters for directed relationships; validation still applies after selection.',
  guard: 'Enter the Transition guard text. It is stored as relationship metadata; runtime expression support depends on the State Machine executor. Consult State Machine expression limits before simulation.',
  trigger: 'Enter the Transition trigger text. This updates semantic relationship metadata. Use a trigger supported by the State Machine execution path when preparing an executable model.',
  sourceEndRoleId: 'Choose the role at the Connector source end. The picker may be cleared with None. Endpoint compatibility and role references are checked by model commands.',
  targetEndRoleId: 'Choose the role at the Connector target end. None clears the reference. Check the source and target roles when validating the connector.',
  realizingRelationshipId: 'Select the connector realizing the Item Flow. This associates the flow with a relationship rather than creating a new connector.',
  conveyedClassifierIds: 'Select the classifiers conveyed by the Item Flow. The stored value is a list of semantic classifier references; this does not configure a numerical solver signal.',
  diagramKind: 'Read the Diagram kind. A diagram presentation is a view of semantic objects; use diagram creation to choose a different kind rather than changing this read-only field.',
};

type FeatureTopic = HelpTopic;
export const HELP_FEATURE_TOPICS: Record<string, FeatureTopic> = Object.fromEntries(Object.entries(fieldGuidance).map(([key, body]) => [topicId(key), {
  title: `Inspector: ${key}`, category: 'Properties', description: body, content: body,
  sections: [{ id: 'edit', title: 'Use this property', body }], related: ['model-browser'],
}]));
HELP_FEATURE_TOPICS['inspector-delete'] = {
  title: 'Delete semantic objects', category: 'Properties', description: 'Delete the selected element, relationship or diagram using the inspector.',
  content: 'Inspect references before deleting a semantic object. Deleting an element affects the semantic model; deleting a diagram removes its presentation view. The command gateway validates deletion and reports errors.',
  sections: [{ id: 'delete', title: 'Delete the selection', body: 'Select the intended object, check its name and kind, then use Delete Element, Delete Relationship or Delete Diagram. Review the resulting diagnostics. Diagram deletion and removing a presentation from a diagram have different scopes.' }], related: ['model-browser'],
};

// Authored guidance is deliberately separate from catalogs. A new catalog entry
// receives an inventory ID but no automatic instructional fallback.
const elementGuidance: Record<string, string> = {
  Model: 'Use the Model as the root of semantic ownership. Organize work in owned Packages; the root owner is fixed. Opening a diagram displays a view without changing the Model identity.',
  Package: 'Create a Package to organize owned model elements and diagrams. Move elements through the Owner picker; descendants cannot own their ancestors. For example, keep requirements in a Requirements package.',
  Block: 'Create a Block for a system classifier such as Pump. In BDD define its features; in IBD create typed Part Properties to represent contained uses. A Block definition and a part usage have distinct identities.',
  InterfaceBlock: 'Define an Interface Block for a reusable interface contract. Add Flow Properties with directions, then reference this type from proxy Ports. A type declaration does not create a connected physical network.',
  ConstraintBlock: 'Define a Constraint Block to group constraint definitions. Use typed Constraint Properties in a parametric view and bind their parameters. Numerical execution requires a supported solver path.',
  AssociationBlock: 'Use an Association Block to model an association with classifier features. Its associationId refers to the underlying association; creating the classifier alone does not create an executable connection.',
  FlowSpecification: 'Use a Flow Specification for legacy flow-property contracts. Record Flow Property IDs and directions; prefer the supported interface/port workflow for newly modeled interfaces.',
  ValueType: 'Create a Value Type such as Length. Choose existing Quantity Kind and Unit elements in the inspector; None removes a reference. These metadata describe values rather than automatically converting simulation signals.',
  DataType: 'Create a Data Type for a value classifier. Select it as the Type of a compatible property or parameter; a semantic Data Type declaration does not itself define a numerical block.',
  QuantityKind: 'Create a Quantity Kind such as length to describe the physical dimension of quantities. Set optional symbol and description, then reference it from Units or Value Types.',
  Unit: 'Create a Unit such as metre, supply a nonblank symbol m, and optionally choose its Quantity Kind. Reference it from Value Types. Unit metadata alone does not execute conversions.',
  View: 'Create a View for a selected perspective on the model. Its Viewpoint and Exposes fields are derived from conform and expose relationships and are read-only. Edit those relationships to change the derived values.',
  Viewpoint: 'Create a Viewpoint defining purpose, stakeholders, concerns, languages, presentation conventions and method. Enter list values one per line. Link a View by conform rather than attempting to edit the View’s derived Viewpoint field.',
  Stakeholder: 'Create a Stakeholder such as Maintainer and enter concerns one per line. Reference the Stakeholder from a Viewpoint to identify whose concerns that perspective addresses.',
  Enumeration: 'Create an Enumeration for a finite set of values, then create Enumeration Literals under it. Use the Enumeration as a property Type; the semantic declaration does not enforce a simulation variable range by itself.',
  EnumerationLiteral: 'Create an Enumeration Literal under its owning Enumeration, for example Running under OperatingMode. Keep its owner meaningful and rename the literal without changing its identity.',
  Signal: 'Create a Signal classifier to describe communicated information. Use it as a type or conveyed classifier where compatible; defining a Signal alone does not send a runtime event.',
  Requirement: 'Create a Requirement and enter a measurable Text specification. Choose lifecycle Status carefully; marking Verified does not produce test evidence. Add Satisfy and Verify relationships to express traceability.',
  TestCase: 'Create a Test Case to identify a verification test. Link it to a Requirement using Verify and review evidence independently. A semantic Test Case is distinct from executing a simulation or generated test harness.',
  VerificationCase: 'Use a Verification Case as an ADIA extension for verification-oriented modeling. Record its identity and ownership and review verification evidence separately; creating this element does not run a test.',
  UseCase: 'Create a Use Case for an externally observable goal such as Start Pump. Keep actors outside the system subject. Use Include for required reused behavior and Extend for conditional additions; this is a semantic diagram, not a simulation executable.',
  Activity: 'Create an Activity for coordinated behavior. Populate its nodes, partitions and edges through the activity workflow. Control Flow orders actions while Object Flow describes transferred objects; stored diagrams do not imply every node kind is executable.',
  ActivityPartition: 'Create an Activity Partition to group activity nodes by a shared responsibility, for example Operator. It may reference a represented element and nested partitions; it organizes behavior rather than defining a numerical solver boundary.',
  Interaction: 'Create an Interaction to own sequence lifeline, message and fragment identities. Edit those through the sequence workflow. Message ordering communicates behavior; runtime and C-generation support are limited to supported constructs.',
  Comment: 'Create a Comment to annotate model elements using body text and annotated-element references. Comments explain intent; they do not alter simulation equations or establish requirement satisfaction.',
  Rationale: 'Create a Rationale to record why a modeling decision was made. Associate it with the relevant elements. The rationale text provides explanation rather than verification evidence.',
  Constraint: 'Create a Constraint with a Value Specification and constrained-element references. An expression can describe a rule; only supported execution paths evaluate it. Check diagnostics rather than assuming every opaque expression can run.',
  PartProperty: 'Create a Part Property owned by a Block and choose its classifier Type. Use it as a contained part in IBD; Composite aggregation records composition metadata. A part usage remains distinct from its Block definition.',
  ReferenceProperty: 'Create a Reference Property when a Block refers to another classifier without making that definition a contained part. Choose its Type and aggregation metadata; review connector compatibility separately.',
  ValueProperty: 'Create a Value Property to describe a typed value owned by a classifier, such as temperature. Choose a compatible Value Type. Semantic value declarations and simulation variables are separate mechanisms.',
  ConstraintProperty: 'Create a Constraint Property typed by a Constraint Block for use in a parametric model. Bind compatible values or parameters to express the constraint’s context; unsupported bindings do not become executable automatically.',
  FlowProperty: 'Create a Flow Property on an interface contract. Choose Type and In, Out or In/Out direction to describe what can cross the interface. Validate the connected ports independently.',
  Port: 'Create a Port on the owning classifier or part context. Choose its Type, Direction and Conjugated metadata. Connect compatible endpoints in IBD and check gateway diagnostics; metadata alone does not transmit simulated values.',
  Operation: 'Create an Operation to describe a callable classifier feature. Organize its Parameters under the operation. This declaration expresses an interface; it does not provide a C function implementation.',
  Parameter: 'Create a Parameter for an operation or supported behavior. Choose Type and Direction where exposed. For example, describe an input speed parameter; executable argument handling depends on the behavior runtime.',
  Reception: 'Create a Reception to declare handling of a Signal. Keep its owner and signal references meaningful. Declaring a Reception alone does not dispatch a simulation event.',
};
const relationshipGuidance: Record<string, string> = {
  Association: 'Use Association between compatible classifiers to record a structural connection. Source/Target select semantic endpoints. An association differs from an IBD connector between usages or ports.',
  SharedAggregation: 'Use Shared Aggregation for a whole/part structural relation without exclusive composition. Select compatible classifier endpoints and inspect aggregation semantics; this does not move element ownership.',
  Composition: 'Use Composition for a whole/part structural relation with composite meaning. Keep source and target classifier roles consistent. Semantic containment and ownership still use model commands and validation.',
  Generalization: 'Connect a specialized classifier as source to its general classifier as target. For example, ElectricPump specializes Pump. Use the connection diagnostics to reject incompatible endpoints or cycles.',
  Dependency: 'Connect a dependent source to the supplier target it relies on. Dependency records a semantic relationship; it does not create a runtime signal wire.',
  Allocate: 'Use Allocate to express assignment between compatible model elements, for example a behavior to a structural block. Allocation does not itself transfer implementation or schedule execution.',
  Satisfy: 'Connect the satisfying design element to the Requirement target. This records a design claim. Review the requirement text and supporting evidence separately.',
  Verify: 'Connect a Test Case to the Requirement it verifies. The relationship records traceability; running tests and collecting evidence are separate steps.',
  Refine: 'Connect the refining model element to the Requirement or supported target it clarifies. Refinement adds explanatory detail without proving satisfaction.',
  Trace: 'Use Trace for a general traceability relation when a more specific supported relation does not express the intent. Check both endpoints and direction before creation.',
  RequirementContainment: 'Use Requirement Containment to organize parent/child requirements. Semantic requirement hierarchy is distinct from nesting packages or moving canvas shapes.',
  DeriveReqt: 'Connect a derived Requirement to its source Requirement. Record why the derived constraint follows from the source; derivation alone does not verify either requirement.',
  Copy: 'Use Copy between requirements for a copied requirement specification. Review identity and text synchronization behavior rather than treating copied requirements as the same semantic object.',
  Connector: 'Connect compatible parts or ports in IBD. Inspect Source/Target End Roles, then validate endpoint families and type compatibility. This semantic connector differs from X-Bridges and V-Lab runtime wires.',
  BindingConnector: 'Use a Binding Connector to express equality between compatible parametric values. Select the proper constrained values; numerical execution depends on the supported parametric solver path.',
  ItemFlow: 'Define an Item Flow with source, target, conveyed classifiers and a realizing connector. Use the inspector’s semantic flow fields to reference existing objects rather than creating a solver wire.',
  Transition: 'Connect supported behavioral endpoints and enter Trigger and Guard metadata. Runtime evaluation is handled by the State Machine path and supports only its implemented expression subset.',
  ActivityEdge: 'Use an Activity Edge between compatible activity nodes to describe an activity connection. Choose a more specific Control Flow or Object Flow when that expresses the intended semantics.',
  ControlFlow: 'Connect activity nodes in execution order with Control Flow. It communicates sequencing rather than transferring a typed data object; supported execution behavior is described in Activity help.',
  ObjectFlow: 'Connect compatible activity object endpoints using Object Flow to show transferred objects. This differs from control sequencing and from numerical simulation wires.',
  Include: 'Connect the including Use Case as source to the reused Use Case as target. Include represents required reused behavior, for example Start Pump includes Check Supply. It does not create executable calls.',
  Extend: 'Connect the extending Use Case as source to the base Use Case as target. Use it for conditional added behavior, such as Alarm extends Monitor. Describe the extension condition explicitly.',
  PackageImport: 'Create Package Import from the importing namespace to the imported Package. Choose public or private visibility where exposed. Import records access to members without moving or duplicating their identities.',
  ElementImport: 'Create Element Import from a namespace to the individual imported element. Use an alias where supported. This references the existing element rather than moving its ownership.',
  PackageMerge: 'Create Package Merge from the receiving Package to the merged Package. Review merge-policy diagnostics; merge relationships do not blindly concatenate files or execute simulation models.',
  conform: 'Connect a View to the Viewpoint it conforms to. The View inspector derives its Viewpoint from this relationship. Delete or replace the relationship to update that read-only field.',
  expose: 'Connect a View to an element it exposes. The View inspector derives the Exposes list from these relationships. This is a semantic viewpoint relation rather than an automatic canvas insertion.',
};
for (const [kind, body] of Object.entries(elementGuidance)) HELP_FEATURE_TOPICS[`sysml-element-${kind}`] = {
  title: `SysML: ${kind}`, category: 'SysML Elements', description: body, content: body,
  sections: [{ id: 'use', title: 'Model this element', body }], related: ['model-browser'],
};
for (const [kind, body] of Object.entries(relationshipGuidance)) HELP_FEATURE_TOPICS[`sysml-relationship-${kind}`] = {
  title: `SysML relationship: ${kind}`, category: 'SysML Relationships', description: body, content: body,
  sections: [{ id: 'connect', title: 'Connect semantic endpoints', body }], related: ['model-browser'],
};
const aiActionGuidance: Record<string, string> = {
  instantiate_block: 'Review the proposed block type, workspace, parameters and port definitions before approving instantiation. The adapter creates an instance from an existing catalog definition; unknown types must be resolved first.',
  connect_ports: 'Review source and target block/port identities and domain before approving a connection. The live adapter checks endpoints and compatibility; review returned diagnostics rather than assuming the wire was committed.',
  configure_parameters: 'Review the proposed parameter names, values and units against the block reference. Approval applies to the proposed project revision. After commit, inspect the changed artifact and diagnostics.',
  run_simulation: 'Review the simulation domain and configuration before approving the run. Results depend on a connected simulation delegate and supported model constructs. Read returned evidence and errors after execution.',
  generate_code: 'Review the model and requested code-generation operation. Generated output supports only implemented backend constructs; inspect validation and verification evidence before using the code in a target build.',
  run_tests: 'Review the planned test operation and expected evidence before approving. Inspect the returned test result; an AI description of success is distinct from actual execution evidence.',
  generate_report: 'Review the planned report scope and available evidence. A report describes the captured model or results; it does not create missing verification evidence or certify a model.',
  create_model: 'Review the modelName and domain (vlab, xbridges or sysml), then approve for the active project revision. Model creation needs an available workspace delegate; inspect the committed artifacts.',
  add_block: 'Review blockId, catalog blockDefinitionId, display name, domain, optional parameters and position. Approval authorizes that proposed insertion only. The adapter rejects unsupported definitions or stale revisions.',
  remove_block: 'Review blockId and optional domain before approving removal. This mutates the live model and can affect connected wires. Inspect changed artifacts and validation diagnostics afterwards.',
  move_block: 'Review blockId and x/y position before approval. This changes layout through the live adapter; it does not change the catalog block definition.',
  rename_block: 'Review blockId and newName before approving. A rename changes the display name of the selected instance while retaining its identity.',
  set_parameter: 'Review blockId, parameterName, value and optional unit against the block definition. Scalars, arrays and objects are accepted by the input contract, but the adapter still validates domain-specific compatibility.',
  disconnect_ports: 'Review the proposed connectionId before approval. The operation removes that connection through the active delegate; verify the resulting model and diagnostics.',
  validate_model: 'Select the active project and domain for validation. An optional project revision binds the check. Review errors and warnings; validation itself does not approve or commit unrelated model mutations.',
  simulate_model: 'Review domain, optional positive stopTime and solver before approval. The dispatcher requires the active project/revision and a connected simulation delegate. Read execution evidence to confirm completion.',
  undo_transaction: 'Review the transactionId to undo. Only supported committed transactions can be reversed; physical hardware effects cannot be assumed reversible. Inspect the resulting artifacts and revision.',
  create_block: 'Review the proposed SysML Block and owner before approval. Semantic creation passes through the SysML adapter/gateway; creating a classifier differs from adding a simulation block instance.',
  create_requirement: 'Review the requirement identity, specification text and owner before approval. Creating a Requirement records a model claim and does not establish verification evidence.',
  create_relationship: 'Review relationship kind, source and target before approval. The SysML gateway validates supported endpoint rules and returns diagnostics for rejected proposals.',
  sysml_command: 'Review the exact canonical SysML command, target IDs and expected effects before approval. The command runs through the transaction gateway; stale revisions or unsupported commands must be resolved before retrying.',
};
for (const [kind, body] of Object.entries(aiActionGuidance)) HELP_FEATURE_TOPICS[`ai-action-${kind}`] = {
  title: `AI action: ${kind}`, category: 'AI Actions', description: body, content: body,
  sections: [{ id: 'review', title: 'Review and execute', body }], related: ['ai-assistant'],
};
Object.assign(HELP_FEATURE_TOPICS, HELP_UI_FEATURE_TOPICS, APP_HELP_TOPICS, OPM_HELP_TOPICS, LIVE_UI_TOPICS, HMI_HELP_TOPICS);
for (const reference of getBlockHelpReferences()) HELP_FEATURE_TOPICS[reference.id] = {
  title: `${reference.source}: ${reference.name}`, category: 'Component References', description: reference.description,
  content: `${reference.description}\n\n${reference.behavior}\n\n${reference.example}`,
  sections: [{ id: 'behavior', title: 'Behavior and example', body: `${reference.behavior}\n\n${reference.example}` },
    { id: 'ports', title: 'Ports and connection topology', body: reference.ports.map(port => `${port.name} (${port.id}): ${port.direction}; ${port.type ?? port.domain ?? ''}${port.unit ? '; unit '+port.unit : ''}${port.width ? '; width '+port.width : ''}${port.composite ? '; '+port.composite : ''}${port.channelNames?.length ? '; channels '+port.channelNames.join(', ') : ''}`).join('\n') || 'This entry has no connection ports.', diagram: reference.diagram },
    { id: 'parameters', title: 'Parameters', body: reference.parameters.map(parameter => `${parameter.name}: default ${JSON.stringify(parameter.defaultValue)} ${parameter.unit ?? ''}. ${parameter.description}${parameter.bounds ? ' Declared bounds: '+JSON.stringify(parameter.bounds) : ''}`).join('\n') || 'This catalog entry has no editable parameters.' }],
  sources: [reference.sourcePath],
};
// Keep the full block page and its unavailable-state note together: the block feature
// resolves #behavior, while the palette-availability feature resolves #availability.
for (const type of getBlockHelpGaps().paletteOnly) {
  const topic = HELP_FEATURE_TOPICS[`xbridges:${type}`];
  topic.sections?.unshift({ id: 'availability', title: 'Implementation status',
    body: `${type} appears in the palette but BLOCK_LIBRARY has no factory for it. No execution behavior or port/parameter contract is invented here; use a factory-backed equivalent after validating it.` });
}

export function getHelpFeatures(): HelpFeature[] {
  const features: HelpFeature[] = getSupportedElementKinds().map(def => ({ id: `sysml:element:${def.metaclass}`, label: def.label,
    topicId: `sysml-element-${def.metaclass}`, sourcePath: 'src/engine/sysml/capabilities/catalog.ts', kind: 'element', module: 'sysml' }));
  for (const [id, reference] of Object.entries(BEHAVIOR_ELEMENT_REFERENCES)) features.push({ id: `behavior:element:${id}`, label: reference.title,
    topicId: `behavior-element-${id}`, sectionId: 'use', sourcePath: 'src/help/referenceTopics.ts', kind: 'element', module: id.split(':')[0] });
  const relationshipKinds = new Set<string>([...Object.values(RELATIONSHIP_ALIASES), 'Include', 'Extend']);
  for (const kind of Object.values(SYSML_RELATIONSHIPS).flat()) relationshipKinds.add(RELATIONSHIP_ALIASES[kind.toLowerCase()] ?? (['packageImport', 'elementImport', 'packageMerge'].includes(kind) ? kind[0].toUpperCase() + kind.slice(1) : kind));
  for (const kind of relationshipKinds) features.push({ id: `sysml:relationship:${kind}`, label: kind,
    topicId: `sysml-relationship-${kind}`, sourcePath: 'src/engine/sysml/capabilities/relationshipPolicy.ts', kind: 'relationship', module: 'sysml' });
  for (const schema of getHelpInspectorSchemas()) {
    // ItemFlow relationship and semantic flow have different schema factories.
    const schemaKind = schema.id === 'help-flow' ? 'ItemFlowDefinition' : schema.metaclass;
    for (const field of schema.fields) features.push({ id: `sysml:property:${schemaKind}:${field.key}`, label: field.label,
      topicId: topicId(field.key), sectionId: 'edit', sourcePath: inspectorSource, kind: 'property', module: 'sysml' });
    for (const action of schema.actions) features.push({ id: `sysml:action:${schemaKind}:${action.id}`, label: action.label,
      topicId: 'inspector-delete', sectionId: 'delete', sourcePath: inspectorSource, kind: 'action', module: 'sysml' });
  }
  const diagrams: Record<string, [string, string | undefined]> = {
    bdd: ['bdd-reference', 'workflow'], ibd: ['ibd-reference', 'workflow'], requirements: ['requirements-reference', 'workflow'], rtm: ['rtm-reference', 'workflow'],
    parametric: ['parametric-diagrams', 'create'], stateMachine: ['state-machine-fundamentals', undefined], package: ['package-diagrams', 'create'],
    useCase: ['use-case-diagrams', 'create'], activity: ['activity-diagrams', 'create'], sequence: ['sequence-diagrams', 'create'],
  };
  for (const kind of new Set([...Object.values(SYSML_DIAGRAM_KINDS).flat(), 'parametric'])) {
    const [topicId, sectionId] = diagrams[kind] ?? [`diagram-${kind}`, undefined];
    features.push({ id: `sysml:diagram:${kind}`, label: kind, topicId, sectionId,
    sourcePath: 'src/engine/sysml/domain/presentations.ts', kind: 'diagram', module: 'sysml' });
  }
  for (const kind of VALID_ACTION_KINDS) features.push({ id: `ai:action:${kind}`, label: kind, topicId: `ai-action-${kind}`,
    sourcePath: 'src/agent/actionContracts.ts', kind: 'ai-tool', module: 'ai' });
  features.push(...UI_HELP_FEATURES, ...APP_HELP_FEATURES, ...OPM_HELP_FEATURES, ...LIVE_UI_FEATURES);
  for (const entry of HMI_CATALOG) features.push({ id: `hmi:component:${entry.type}`, label: entry.label, topicId: `hmi-component-${entry.type}`, sectionId: 'use', sourcePath: 'src/features/hmi/hmiCatalog.ts', kind: 'element', module: 'hmi' });
  features.push({ id: 'hmi:dashboard', label: 'HMI dashboard', topicId: 'hmi_dashboard', sectionId: 'ticks', sourcePath: 'src/features/hmi/hmiModel.ts', kind: 'action', module: 'hmi' });
  for (const reference of getBlockHelpReferences()) features.push({ id: `block:${reference.id}`, label: reference.name, topicId: reference.id,
    sectionId: 'behavior', sourcePath: reference.sourcePath, kind: 'block', module: reference.source === 'X-Bridges' ? 'xbridges' : 'vlab', documentationGaps: reference.documentationGaps });
  for (const type of getBlockHelpGaps().paletteOnly) features.push({id:`palette:xbridges:${type}`,label:type,topicId:`xbridges:${type}`,sectionId:'availability',sourcePath:'src/engine/xbridges/BlockDefinitions.ts',kind:'block',module:'xbridges'});
  return features;
}

export function findHelpFeature(context: { label?: string; sourcePath?: string; featureId?: string; module?: string }): HelpFeature | undefined {
  const features = getHelpFeatures();
  if (context.featureId) return features.find(feature => feature.id === context.featureId);
  if (!context.label?.trim() || (!context.module && !context.sourcePath)) return undefined;
  const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
  const matches = features.filter(feature => normalize(feature.label) === normalize(context.label!)
    && (!context.sourcePath || feature.sourcePath === context.sourcePath)
    && (!context.module || feature.module === context.module));
  const targets = new Set(matches.map(feature => `${feature.topicId}#${feature.sectionId ?? ''}`));
  return targets.size === 1 ? matches[0] : undefined;
}
