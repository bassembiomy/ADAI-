export type SysmlCapabilityStatus = 'supported' | 'partial' | 'unsupported';

export interface SysmlCapability {
  id: string;
  status: SysmlCapabilityStatus;
  normativeReference: string;
  testId: string;
  limitation?: string;
}

const trackedCapabilities = [
  'bdd.block', 'bdd.valueType', 'bdd.partProperty', 'bdd.referenceProperty',
  'bdd.flowProperty', 'bdd.port', 'bdd.composition', 'bdd.sharedAggregation',
  'bdd.association', 'bdd.generalization', 'bdd.dependency', 'bdd.allocation',
  'ibd.partUsage', 'ibd.fullPort', 'ibd.proxyPort', 'ibd.connector',
  'ibd.itemFlow', 'ibd.bindingConnector', 'ibd.delegationConnector',
  'req.requirement', 'req.deriveReqt', 'req.satisfy', 'req.verify',
  'req.refine', 'req.trace', 'req.copy', 'rtm.matrix', 'rtm.baseline',
] as const;

const capabilities: SysmlCapability[] = trackedCapabilities.map((id, index) => ({
  id,
  status: 'supported',
  normativeReference: 'OMG SysML 1.6 / ISO/IEC 19514:2017',
  testId: `SYSML-${String(index + 1).padStart(3, '0')}`,
}));

capabilities.push({
  id: 'interop.sysmlV2',
  status: 'unsupported',
  normativeReference: 'SysML 1.6 profile boundary; SysML v2 requires a versioned adapter',
  testId: 'SYSML-029',
  limitation: 'No semantic-equivalence claim is made for SysML v2.',
});

capabilities.push({
  id: 'req.containment',
  status: 'supported',
  normativeReference: 'OMG SysML 1.6 Clause 16.3.2.1 / UML Namespace Containment',
  testId: 'SYSML-030',
});

capabilities.push({
  id: 'policy.typedDecisions',
  status: 'supported',
  normativeReference: 'OMG SysML 1.6 / ISO/IEC 19514:2017',
  testId: 'SYSML-031',
});

capabilities.push({
  id: 'usecase.view',
  status: 'partial',
  normativeReference: 'OMG SysML 1.6 Clause 16 / ISO/IEC 19514:2017',
  testId: 'SYSML-032',
  limitation: 'Use Case diagrams (owned by the Model or a Package) have a canvas: Actor, Use Case, Subject rectangle, extension-point compartment, association, include, extend (with extension point and condition), generalization and satisfy/refine/trace, drawn with UML notation and persisted with the diagram. Use cases dragged into a Subject are assigned to it after confirmation. Remaining gaps: Actors, Subjects and Extension Points cannot yet be created from the model explorer (only on the canvas), extension points cannot be renamed or deleted from the UI, «allocate» has no canvas tool on a Use Case diagram, and the canvas has not been verified in a real browser.',
});

/**
 * Known gaps against OMG SysML 1.6 / Cameo, recorded explicitly so that the
 * "supported" entries above are never read as full coverage. Each entry names
 * the missing behaviour; promote it only when conformance evidence exists.
 */
const KNOWN_GAPS: ReadonlyArray<{ id: string; status: SysmlCapabilityStatus; normativeReference: string; limitation: string }> = [
  { id: 'bdd.compartments', status: 'partial', normativeReference: 'OMG SysML 1.6 Clause 8.3.2.1', limitation: 'Block symbol shows one unnamed feature list; named parts/references/values/constraints/operations compartments are not drawn.' },
  { id: 'bdd.enumerationSignalUnit', status: 'partial', normativeReference: 'OMG SysML 1.6 Clause 8.3.2.4 / UML 2.5 §10', limitation: 'Unit and QuantityKind are stored elements (SysML 1.6 §8.3.2.10-11), creatable in the model explorer, referenced from a ValueType through inspector pickers, validated (MISSING_UNIT, MISSING_QUANTITY_KIND, UNIT_QUANTITY_KIND_MISMATCH) and shown as {unit=symbol} on BDD value property rows; old free-text units are linked to a matching Unit on load. Remaining gaps: Enumeration and Signal have no BDD symbol and no inspector editor (enumeration literals cannot be edited in the UI), Unit and QuantityKind have no dedicated BDD symbol, and there is no unit conversion or dimensional analysis.' },
  { id: 'ibd.nestedConnectorEnds', status: 'supported', normativeReference: 'OMG SysML 1.6 Clause 8.3.2.2', limitation: 'A part is only a Block property and a connector end is a property path plus a port (format 5, ConnectorEnd { path, portId }) at any depth, resolved through part types and inherited properties and validated (direction and conjugation, typing, duplicates, delegation depth 1); during a session no part or port usage record exists. On an IBD each part draws its own parts inside its symbol (one level by default, up to four levels with the Nested parts control, deeper where a connector needs it), so a connector can be drawn to a nested part or port in Connect mode. Remaining limits: nested parts are laid out automatically inside their parent and cannot be moved, resized or given their own port layout; inherited ports of a nested part are not drawn; with Nested parts off, connectors that end in a nested part are not drawn; a nested part is deleted from the Block that declares it, not from the IBD; files older than format 5 are upgraded on open with a named report and a .v3-backup.json copy; the IBD has not been verified in a real browser.' },
  { id: 'ibd.inheritedFeatures', status: 'partial', normativeReference: 'OMG SysML 1.6 Clause 8.3.2.1', limitation: 'Inheritance is resolved for validation and BDD, but inherited parts and ports are not drawn on an IBD.' },
  { id: 'par.parametricDiagram', status: 'partial', normativeReference: 'OMG SysML 1.6 Clause 10', limitation: 'ConstraintBlocks, constraint properties and typed parametric binding connectors are stored, validated and persisted; there is no parametric diagram canvas, no inspector for ConstraintBlock parameters and expressions, and no constraint solving.' },
  { id: 'act.activityDiagram', status: 'partial', normativeReference: 'OMG SysML 1.6 Clause 11', limitation: 'Activity is a stored definition (creatable under the Model, a Package or a Block) with parameters, nodes, edges and swimlanes; an Activity Diagram (owned by the Activity) has a canvas with action (opaque or call-behavior), initial, activity final, flow final, decision, merge, fork, join, object node and activity parameter node symbols, typed input/output pins on action borders, control and object flows with guards, and vertical swimlanes. The pure rules check one initial node, final/initial node edges, decision/merge/fork/join arity and guards, object-flow endpoints, pin direction and type compatibility (same type or subtype), existing called behaviors and swimlane targets. A node dropped into a swimlane is assigned only after confirmation; a swimlane can represent a Block or part, and «allocate» from an action or swimlane to a Block uses the Allocation Matrix tools. Remaining gaps: no object-flow routing through decision, merge, fork or join nodes, and no interruptible regions, expansion regions, structured nodes, send/accept-event actions, object-node upper bounds, ordering or selection behavior, streaming or rate, pin multiplicity, or activity-parameter-node direction beyond the parameter; Activity parameters are edited only by adding parameter nodes; edges are straight lines without bend points; swimlanes cannot be nested or span two dimensions; there is no execution or simulation; and the canvas has not been verified in a real browser.' },
  { id: 'seq.sequenceDiagram', status: 'partial', normativeReference: 'OMG SysML 1.6 Clause 12', limitation: 'Interaction is a stored definition (creatable under the Model, a Package or a Block) with lifelines, messages and combined fragments; a Sequence Diagram (owned by the Interaction) draws lifelines with dashed lines, messages ordered top to bottom (synchronous call with filled head, asynchronous call and signal with open head, reply and create dashed, delete ending the lifeline with a cross), execution bars from each synchronous call to its reply, and combined fragments (alt, opt, loop, par, break, critical, neg, seq, strict) with operand guards. A message can be reordered by dragging or with Move up/down. The pure rules check that message ends exist and positions are unique, that a reply answers an earlier synchronous call between the same two lifelines in reverse, that a signal message references an existing Signal (a missing one is a warning), that a call names an operation of the receiving lifeline\'s Block when that lifeline is typed, that nothing follows a delete message on its lifeline, that a lifeline represents an existing Block or part, and that fragment operands only hold messages between covered lifelines. Model integration: deleting a represented Block or part, a Signal or a connector keeps the lifeline or message and clears the reference (the deletion impact lists them), renaming a Block operation rewrites the calls to it in the same step, and repository errors that already existed no longer block unrelated edits. An Interaction owned by a Block warns when a lifeline is neither that Block nor one of its parts; a message may name the connector it travels over (checked against the parts its lifelines stand for) and warns when a wired context has no connector between the two parts; a Block lists the Signals it receives (receptions) and a signal message to a Block that lists some warns when it is not one of them; a call with arguments warns when their count differs from the operation parameter count. A Sequence Diagram can be created from a Block (one lifeline per part, one undo step), and the message inspector offers the receiving Block operations and received Signals first, with New operation and New signal. A Use Case can own a scenario Interaction (an Actor may be a lifeline, and a scenario warns when a lifeline Actor is not associated with the use case), an Activity can call an Interaction as a behavior, and a ref frame (interaction use) refers to another Interaction over chosen lifelines after a chosen message, with optional arguments, loop prevention across interactions, double click to open the referred diagram and removal of the frame when the referred interaction is deleted; a ref frame cannot sit inside a combined fragment. A lifeline can carry state invariants that name states of the state machine editor (drawn as rounded boxes on the lifeline); for a Signal message to such a lifeline the inspector says, as information only, whether a transition leaving that state names the Signal in its condition text (whole word, case-insensitive; there is no explicit trigger field on transitions, so this is a text match and the state machine is never changed). An Interaction, a lifeline or a message can be the client of «satisfy», «verify», «refine», «trace» and «allocate» (the traceability matrix names them like Main ▸ message 2: go, and the diagram draws «allocate» names under the lifeline or message); a verification case may name the Activity or Interaction that is its test procedure (a missing one is a warning; deleting the behavior clears it). The model tree lists the lifelines, messages in order, fragments, ref frames and state invariants of an Interaction (rename and delete only, through the interaction commands), the right panel edits any of them, a Block panel lists the Sequence Diagrams that show it and opens them with the lifelines selected, and double click opens a Signal or the Block that owns a called operation. An Interaction can be downloaded as PlantUML text from the sequence canvas (one way) and the architecture report has a Scenarios section with the messages and relationships of each interaction. A lifeline can be the end of a lost or found message (asynchronous only, drawn with a filled circle), and time and duration constraints are text brackets beside the lifelines (never evaluated). Remaining gaps: operations are Block text lines without ids, so a call stores the operation text and argument types are not checked; receptions are not drawn as a Block compartment; connector item flows cannot convey a Signal, so signal messages are not checked against item flows; a message does not name a port; there is no entry on the IBD canvas itself (use the Block panel or the model tree); there is no general ordering, gates or coregions; lost and found messages are asynchronous only; a ref frame cannot sit inside a combined fragment; a fragment nests by enclosing messages that another fragment already holds (and is assumed to span consecutive messages in the PlantUML export); message arrows are straight horizontal lines; execution bars for asynchronous calls are an option that is off by default; there is no execution or simulation and no conversion from the separate PlantUML sequence editor or back from PlantUML text; and the canvas has not been verified in a real browser.' },
  { id: 'alloc.allocationMatrix', status: 'partial', normativeReference: 'OMG SysML 1.6 Clause 15', limitation: '«allocate» is modelled between any Block, Part, Port, Use Case, Requirement, Verification Case, Actor, Subject, Interface or Package and is accepted by the connection policy on BDD, IBD, requirements and package diagrams; the Allocation Matrix and the BDD allocatedFrom/allocatedTo compartments are provided. Allocation lines are only drawn on BDD, requirements and package canvases (not yet on the IBD canvas), block properties and state-machine states cannot be matrix axes. Activities, Activity actions and swimlanes are matrix row kinds and can be allocated to Blocks from the Activity Diagram.' },
  { id: 'view.viewpoint', status: 'partial', normativeReference: 'OMG SysML 1.6 Clause 17', limitation: 'View, Viewpoint and Stakeholder are stored elements (creatable in the model explorer, edited in the inspector, shown as «view» / «viewpoint» / «stakeholder» boxes with a purpose/stakeholders/concerns compartment on package diagrams and BDDs); «conform» (View to Viewpoint, at most one: MULTIPLE_VIEWPOINTS) and «expose» (View to any element) are relationships with package-diagram tools, and a View\'s Viewpoint is derived from its «conform». Remaining gaps: concerns are Requirement references plus free text, not UML Comments (the model has no Comment storage); a View does not compute or render its exposed content (no view generation, filtering or Viewpoint method execution); «conform» and «expose» are not drawn on IBD, requirements or use case canvases; the V4 projection maps «conform» to a Generalization and «expose» to a Dependency; and the canvas has not been verified in a real browser.' },
];

for (const gap of KNOWN_GAPS) {
  capabilities.push({
    id: gap.id,
    status: gap.status,
    normativeReference: gap.normativeReference,
    testId: `SYSML-${String(capabilities.length + 1).padStart(3, '0')}`,
    ...(gap.limitation ? { limitation: gap.limitation } : {}),
  });
}

export const SYSML_PROFILE = Object.freeze({
  id: 'OMG-SysML-1.6-ADIA' as const,
  sysmlVersion: '1.6' as const,
  isoBaseline: 'ISO/IEC 19514:2017' as const,
  capabilities: Object.freeze(capabilities),
});

const byId = new Map(SYSML_PROFILE.capabilities.map(capability => [capability.id, capability]));

export function getCapability(id: string): SysmlCapability | undefined {
  return byId.get(id);
}
