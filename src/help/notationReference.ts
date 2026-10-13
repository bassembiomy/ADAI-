import type { ACTIVITY_NODE_SHAPES } from '../features/sysml/activityDiagramView';

/** A drawn notation sample. These previews are schematic; the text records any editor-specific difference. */
export type ShapeGlyph = typeof ACTIVITY_NODE_SHAPES[keyof typeof ACTIVITY_NODE_SHAPES]
  | 'compartment' | 'package' | 'subject' | 'actor' | 'useCase' | 'requirement'
  | 'part' | 'port' | 'pin' | 'lifeline' | 'fragment' | 'matrix' | 'tree'
  | 'state' | 'history' | 'object' | 'process' | 'line' | 'bracket';
export interface NotationSpec {
  glyph: ShapeGlyph;
  appearance: string;
  connect: string;
  line?: 'solid' | 'dashed';
  start?: 'diamond' | 'hollowDiamond' | 'triangle' | 'hollowTriangle' | 'circle' | 'filledArrow';
  end?: 'filled' | 'open' | 'triangle' | 'cross';
}
export interface NotationItem extends NotationSpec { label: string; meaning: string }
const node = (glyph: ShapeGlyph, appearance: string, connect: string): NotationSpec => ({ glyph, appearance, connect });
const edge = (appearance: string, connect: string, line: NotationSpec['line'] = 'solid', end?: NotationSpec['end'], start?: NotationSpec['start']): NotationSpec => ({ glyph: 'line', appearance, connect, line, end, start });
const tree = (appearance: string, connect: string): NotationSpec => node('tree', appearance, connect);

/** Keys match the authored diagram inventory. Every named chapter item must have an explicit notation. */
export const diagramNotation: Record<string, Record<string, NotationSpec>> = {
  'bdd-reference': {
    'Block': node('compartment', 'Rectangle headed «block» with compartments for features.', 'Define a reusable classifier; property rows are typed usages. Draw relationships between classifiers, not numerical signal wires.'),
    'Interface Block': node('compartment', 'Rectangular classifier with «interfaceBlock» and flow properties.', 'Type a proxy port and inspect its flow direction and conjugation.'),
    'Value Type / Data Type / Enumeration': node('compartment', 'Typed classifier rectangle; enumeration literals appear in a compartment.', 'Reference a type from a feature. Quantity Kind and Unit are semantic metadata, not numeric converters.'),
    'Part / Reference / Value / Constraint Property': node('part', 'Name: Type row in a classifier; usages may also appear as IBD boxes.', 'Give each feature its own identity, type and multiplicity; do not confuse a use with its type definition.'),
    'Generalization': edge('Solid line with a hollow triangle at the general classifier.', 'Connect specialized source to general target.', 'solid', 'triangle'),
    'Association / Aggregation / Composition': edge('Solid association; hollow diamond for shared aggregation, filled diamond for composition at the whole end.', 'Set endpoint roles and multiplicities; select whole/part semantics deliberately.', 'solid', undefined, 'diamond'),
  },
  'ibd-reference': {
    'Part usage': node('part', 'Rectangle labeled usageName: Type inside its containing Block.', 'Connect actual usage/port occurrences, not the reusable classifier box.'),
    'Reference usage': node('part', 'Usage rectangle referring to a separately owned typed element.', 'A structural reference does not transfer semantic ownership.'),
    'Standard / Proxy / Full / Flow Port': node('port', 'Small square on a block or part boundary; kind/type/direction in properties.', 'Use compatible occurrences. Proxy exposes an interface; full is an interaction point; flow is legacy.'),
    'Connector': edge('Assembly/delegation: solid line; binding in the IBD notation: dashed equality line.', 'Connect compatible resolved end roles/paths. Structural connection alone does not run a solver.'),
    'Item Flow': edge('Conveyed classifier annotation on an existing realizing connector.', 'Attach a conveyed type to a resolved connector; the notation does not execute transfer.'),
  },
  'requirements-reference': {
    'Requirement': node('requirement', 'Rectangle with «requirement», ID and Text compartments.', 'State a measurable condition; add verification evidence separately.'),
    'Satisfy': edge('Dashed dependency arrow «satisfy» pointing at the Requirement.', 'Connect a design element → Requirement as a design claim.', 'dashed', 'open'),
    'Verify': edge('Dashed dependency arrow «verify» pointing at the Requirement.', 'Connect a test/verification element → Requirement; run and attach evidence separately.', 'dashed', 'open'),
    'deriveReqt / Copy': edge('Labeled dependency; deriveReqt points derived → source, Copy points copy → master.', 'Inspect both requirement identities and suspect-link status.', 'dashed', 'open'),
    'Refine / Trace / Containment': edge('Keyword-labeled dependency or «contains» ownership link.', 'Refine elaborates; Trace is general; containment changes hierarchy, not verification status.', 'dashed', 'open'),
  },
  'rtm-reference': {
    'Requirement row': node('matrix', 'Matrix row labeled with stable Requirement identity.', 'Filter rows by requirement ID; inspect the full Text and revision.'),
    'Design / verification column': node('matrix', 'Matrix column for a related design or test identity.', 'Follow the header to the actual semantic element, not a duplicate name.'),
    'Relationship cell': node('matrix', 'Cell indicates an existing typed link at row/column intersection.', 'Inspect Satisfy/Verify and direction before claiming coverage.'),
    'Suspect link': node('matrix', 'Change/suspect status indicator on a trace cell.', 'Review changed endpoints and evidence currency before clearing suspect status.'),
    'Baseline': tree('Saved requirement snapshot in governance controls; not a canvas shape.', 'Compare current requirements with the recorded baseline.'),
  },
  'package-diagrams': {
    'Package / Model': node('package', 'Tabbed package rectangle in a diagram; Model is the browser root.', 'Place owned definitions or reuse existing element presentations; layout is not ownership.'),
    'Package Import': edge('Dashed «import» dependency arrow.', 'Importing namespace → imported Package; does not move it.', 'dashed', 'open'),
    'Element Import': edge('Dashed «import» dependency arrow to an individual element.', 'Importing namespace → element; alias if supported.', 'dashed', 'open'),
    'Package Merge': edge('Dashed «merge» dependency arrow.', 'Receiving Package → merged Package; review merge diagnostics.', 'dashed', 'open'),
    'Dependency': edge('Dashed open-arrow dependency.', 'Client → supplier. A dependency is not package containment.', 'dashed', 'open'),
  },
  'activity-diagrams': {
    'Action': node('roundedRect', 'Rounded rectangle with action name and optional called behavior.', 'Use Control Flow for ordering and typed pins for Object Flow.'),
    'Initial / Activity Final / Flow Final': node('filledCircle', 'Initial filled circle; Activity Final bullseye; Flow Final circle with X.', 'Connect Initial out; choose Activity Final to end all flows, or Flow Final to end only this flow.'),
    'Decision / Merge': node('diamond', 'Diamond (same glyph); outgoing decision edges may show [guard].', 'Decision branches by guard; Merge reunites alternatives without waiting for parallel branches.'),
    'Fork / Join': node('bar', 'Thick bar in the activity canvas.', 'Fork splits concurrent paths; Join synchronizes them.'),
    'Object Node / Activity Parameter': node('rect', 'Square-cornered rectangle with name/type; activity parameter at boundary.', 'Connect Object Flows only between compatible typed object/pin endpoints.'),
    'Input / Output Pin': node('pin', 'Small square attached to an action, with typed name.', 'Connect output pin → compatible input pin with Object Flow.'),
    'Partition': node('subject', 'Swimlane rectangle with labeled header.', 'Group responsibility; moving a glyph into a lane does not by itself transfer ownership.'),
    'Control Flow / Object Flow': edge('Solid directed edge with open arrow, optionally labeled [guard].', 'Control Flow orders tokens; Object Flow transfers typed values between allowed endpoints.', 'solid', 'open'),
  },
  'sequence-diagrams': {
    'Lifeline': node('lifeline', 'Header rectangle above a dashed vertical lifeline.', 'Represent a participant; add messages between lifeline identities.'),
    'Synchronous / asynchronous / reply message': edge('Call: solid filled arrow; async/signal: solid open arrow; reply: dashed open arrow.', 'Select sender → receiver, message sort, signature and arguments; match replies to calls.', 'solid', 'filled'),
    'Self message / activation': node('lifeline', 'U-shaped return to the same lifeline; execution occurrence bar on the timeline.', 'Use a self call for internal behavior; a matched reply closes a synchronous activation.'),
    'Combined fragment / operand': node('fragment', 'Frame with operator tab and dashed operand separators labeled [guards].', 'Configure operator, covered lifelines, operand membership and guards; runtime supports only a subset.'),
    'Interaction use (ref)': node('fragment', 'Framed «ref» / ref tab to a named Interaction.', 'Reuse an existing Interaction with covered lifelines and arguments.'),
    'State invariant': node('roundedRect', 'Small rounded state label on the lifeline.', 'Assert a state at this position; this does not activate the executable chart.'),
    'Time / duration constraint': node('bracket', 'Bracket by one or two occurrence levels and timing expression.', 'Record an assertion; obtain elapsed-time evidence in a separate executable run.'),
  },
  'use-case-diagrams': {
    'Actor': node('actor', 'Stick figure with the external role name underneath.', 'Associate to a goal inside the subject; may generalize toward a broader actor.'),
    'Use Case': node('useCase', 'Ellipse containing goal name.', 'Keep the goal inside the Subject and relate it to actors or other goals.'),
    'Subject boundary': node('subject', 'Large named rectangular system boundary.', 'Scope goals inside; actors outside. A resize is only a presentation until membership is committed.'),
    'Association': edge('Solid plain line without arrowhead.', 'Connect participating Actor and goal; no function call is implied.'),
    'Include / Extend': edge('Dashed open arrow with «include»/«extend» keyword.', 'Include: base → included goal; Extend: optional goal → base goal with extension point and condition.', 'dashed', 'open'),
    'Generalization': edge('Solid line with hollow triangle at general role/goal.', 'Specialized Actor/Use Case → general target.', 'solid', 'triangle'),
    'Extension point': node('useCase', 'Named extension-points compartment inside the base Use Case ellipse.', 'Select an extension point belonging to the base goal for the Extend relationship.'),
  },
  'parametric-diagrams': {
    'Constraint Block': node('compartment', 'Classifier rectangle with «constraint» and named parameters/relation.', 'Define typed parameters, expression and units before placing usages.'),
    'Constraint Property': node('part', 'Typed constraint usage rectangle inside the containing context.', 'Refer to an existing Constraint Block; its parameter ends belong to this usage.'),
    'Constraint parameter': node('port', 'Named typed parameter on the constraint usage.', 'Bind to an eligible value endpoint with compatible type/dimension.'),
    'Value Property': node('part', 'Property label name: Type in its owning Block.', 'Expose the actual property identity and bind it to a constraint parameter.'),
    'Binding Connector': edge('Undirected equality binding; IBD binding connector can appear dashed.', 'Bind compatible value property ↔ constraint parameter; not a directed numerical wire.'),
  },
  'state-machine-fundamentals': {
    'State / composite state': node('state', 'Rounded state rectangle with optional entry/during/exit text; composite owns child layers.', 'Connect transitions by state ID and choose OR/AND and defaults explicitly.'),
    'Entry / do / exit action': node('state', 'Entry, During and Exit text in the state compartment.', 'Author supported action expressions; execute on entry, during no-outer-route ticks, and exit respectively.'),
    'Transition': edge('Directed state-to-state or state-to-junction path with guard/action text.', 'Connect source → destination and choose phase, numeric priority and trigger mode.', 'solid', 'filled'),
    'Initial / autostart configuration': node('state', 'The editor marks the chosen autostart state/junction; current notation has no separate initial node symbol.', 'Mark exactly one initial/default entry per OR layer and validate the route.'),
    'Event / timer / variable': tree('Declared fields in chart/inspector; timer and variable values appear in traces, not as independent solver blocks.', 'Declare types/defaults and supported expressions before using guard, afterTicks or actions.'),
  },
  'entropy-opm': {
    'Object': node('object', 'Labeled rounded object rectangle (physical objects have heavier border).', 'Relate objects and their states using supported structural/procedural links.'),
    'Process': node('process', 'Labeled elliptical process.', 'Attach transforming/enabling/event links and inspect execution properties.'),
    'Object State': node('roundedRect', 'Small rounded state capsule within an Object.', 'Model the object condition; it is not a chart State Machine state.'),
    'Structural link': edge('Glyph at source/whole end: filled/hollow triangle or filled circle.', 'Use aggregation, generalization or exhibition with the correct endpoints.', 'solid', undefined, 'triangle'),
    'Procedural link': edge('Typed arrows: filled/open, dashed for trigger/condition, double-ended effect.', 'Inspect roles, direction and OPM runtime subset for the selected link.', 'solid', 'filled'),
    'Agent / Instrument': edge('Agent filled arrow; Instrument hollow arrow.', 'Use enabling role at the Process; do not mistake it for a transformed result.', 'solid', 'filled'),
    'Consumption / Result': edge('Filled arrows toward Process for consumption; toward Object for result.', 'Connect object → process for consumed input or process → object for result.', 'solid', 'filled'),
    'Effect': edge('Filled arrowheads at both ends of the link.', 'Represent a process effect on a participating Object/state.', 'solid', 'filled', 'filledArrow'),
    'Trigger / Condition': edge('Dashed trigger with filled arrow; dashed condition with hollow arrow.', 'Trigger denotes event activation; condition denotes enabling condition.', 'dashed', 'open'),
    'Aggregation / Generalization / Exhibition': edge('Structural start markers: filled triangle, hollow triangle or filled circle.', 'Select the exact structural link and inspect its endpoint roles.', 'solid', undefined, 'triangle'),
    'Satisfies / Verifies': edge('Dashed requirement trace with a filled arrowhead.', 'Record a claim; verification result requires separate evidence.', 'dashed', 'filled'),
  },
  'xbridges-ref': {
    'Source / operation / sink block': node('part', 'Palette Lucide glyph in a signal block; individual previews and ports in Block reference.', 'Drag a factory-backed item, set parameters, wire output → compatible input.'),
    'Input / output port': node('port', 'Small labeled port on the current block boundary (side varies by block).', 'Connect by exact port ID, type, unit, dimension, frame and sample rate.'),
    'Signal wire': edge('Directed signal wire from source output to target input.', 'Validate types/dimensions and solver feedback; a line is not an acausal physical net.', 'solid', 'filled'),
    'Stateful / continuous block': node('part', 'Same palette/block outline; state and derivatives live in execution metadata.', 'Configure timestep, initial state and compatible solver.'),
    'Scope': node('part', 'Monitor/scope block with visualization when executing.', 'Connect supported outputs and inspect history; scope does not change the signal.'),
  },
  'vlab-fundamentals': {
    'Physical component': node('part', 'Component-specific SVG circuit/physical glyph in Block reference.', 'Place the component in the matching physical domain and inspect its conserving and signal ports.'),
    'Conserving port / connection': edge('Domain terminal joined by a plain, undirected network line.', 'Connect matching domains; composite three-phase only to compatible composites. Add domain reference.', 'solid'),
    'Physical signal port': node('port', 'Typed input/output terminal, with unit and optional vector width.', 'Wire one output → compatible input, matching exact vector width; fan-out is allowed.'),
    'Domain reference': node('part', 'Ground/reference SVG symbol for the chosen physical domain.', 'Provide electrical/mechanical reference where required by the network.'),
    'Solver Configuration': node('part', 'Solver configuration component in the same network.', 'Choose valid step/tolerance/initialization; validate topology before Run.'),
    'Sensor / Scope': node('part', 'Sensor glyph feeds directed measurable output to a scope glyph.', 'Measure conserving quantities through a compatible sensor; do not attach Scope to an undirected terminal.'),
  },
};

/** Individual model elements can be tree/inspector entries rather than independent canvas shapes. */
export const elementNotation: Record<string, NotationSpec> = {
  Model: tree('Model Browser root row (no independently dragged diagram glyph).', 'Own Packages/definitions and diagrams; reference existing IDs across views.'),
  Package: node('package', 'Tabbed package on Package diagram; row in Model Browser.', 'Own definitions, import/merge by relationship rather than moving a symbol.'),
  Block: node('compartment', 'BDD classifier rectangle «block» with feature compartments.', 'Define parts, values and ports; connect classifiers using BDD relationships.'),
  InterfaceBlock: node('compartment', 'BDD «interfaceBlock» compartment rectangle.', 'Type proxy ports and inspect flow properties and conjugation.'),
  ConstraintBlock: node('compartment', '«constraint» rectangle with named parameters and relation.', 'Type a Constraint Property and bind its parameters in a parametric view.'),
  AssociationBlock: node('compartment', 'Classifier in BDD; relationship semantics live in its endpoints.', 'Use an Association Block as a typed association and inspect both end roles.'),
  FlowSpecification: tree('Legacy interface specification in Model Browser/inspector; no required independent canvas symbol.', 'Type legacy flow ports/features; prefer supported Interface Block/proxy port for new models.'),
  ValueType: node('compartment', 'BDD typed classifier rectangle, optionally annotated with units.', 'Use as a property type; label does not perform unit conversion.'),
  DataType: node('compartment', 'Typed classifier rectangle on BDD.', 'Use as compatible value type in feature declarations.'),
  QuantityKind: tree('Semantic quantity row in Model Browser/inspector, not a physical port glyph.', 'Reference from Unit and Value Type; no numerical execution.'),
  Unit: tree('Semantic unit row in Model Browser/inspector, not a conversion operator.', 'Reference from a Value Type and check its symbol/quantity kind.'),
  View: tree('View definition in Model Browser; optional diagram reference.', 'Connect conform → Viewpoint and expose → included element.'),
  Viewpoint: tree('Viewpoint row/inspector; not a self-executing diagram.', 'Select stakeholders, concerns and presentation conventions; conform from View.'),
  Stakeholder: tree('Stakeholder row/inspector; not a canvas actor by itself.', 'Reference from Viewpoint; external use-case Actor is a different model item.'),
  Enumeration: node('compartment', '«enumeration» rectangle with literal compartment.', 'Type compatible properties with the enumeration.'),
  Signal: tree('Classifier in browser/inspector; a message arrow is drawn only in Sequence diagram.', 'Reference from an asynchronous Signal message where supported.'),
  Requirement: node('requirement', 'Box with «requirement», ID and Text compartments.', 'Use Satisfy/Verify/Trace/Derive with correct directions; evidence is separate.'),
  TestCase: node('compartment', 'Typed «testCase» model element; row in browser.', 'Connect Verify to a Requirement and record test results outside the line.'),
  VerificationCase: tree('ADIA verification-oriented model row; not a generated executable harness.', 'Attach/review evidence and verify intended requirements separately.'),
  UseCase: node('useCase', 'Ellipse inside named Subject on Use Case diagram.', 'Associate Actors, Include reused goals or Extend conditional goals.'),
  Activity: tree('Activity owner in Model Browser; actions/control nodes are rendered in its diagram.', 'Create its Activity diagram and connect contained nodes by control/object flow.'),
  ActivityPartition: node('subject', 'Swimlane rectangle with header (responsibility/represented element).', 'Assign node membership explicitly; canvas position is not semantic ownership.'),
  Interaction: tree('Interaction owner in Model Browser; lifelines/messages are shown in its Sequence diagram.', 'Create lifelines and ordered messages inside this Interaction.'),
  Comment: tree('Annotation row/inspector; optional diagram note presentation depends on view.', 'Attach annotated-element references; no execution semantics.'),
  Rationale: tree('Explanation element in browser/inspector; no mandatory runnable glyph.', 'Reference design decisions/claims and review supporting evidence separately.'),
  Constraint: tree('Constraint expression in model/inspector; not a solver block.', 'Reference constrained properties; validate the supported expression form.'),
  PartProperty: node('part', 'Name: Type feature; represented as part rectangle in IBD.', 'Use an owned part of a Block, expose compatible port occurrences.'),
  ReferenceProperty: node('part', 'Name: Type reference feature in structure/IBD.', 'Reference a separately owned instance; do not imply composition.'),
  ValueProperty: node('part', 'Name: Type value feature/label in BDD or parametric view.', 'Bind only to compatible typed constraint parameters.'),
  ConstraintProperty: node('part', 'Typed constraint usage box in a parametric context.', 'Connect its named parameters through equality bindings.'),
  FlowProperty: node('port', 'Direction/type row inside an Interface Block contract.', 'Connect through correctly typed/conjugated proxy ports; not an independent arrow.'),
  Port: node('port', 'Small square on Block/part boundary in structural views.', 'Choose standard/proxy/full/legacy kind and compatible type/direction.'),
  Operation: tree('Operation feature row in classifier/inspector; call message uses its signature.', 'Define parameters/return type; model a synchronous call separately in Sequence.'),
  Parameter: tree('Operation/behavior parameter feature, not a free-standing port icon.', 'Select type/direction and pass compatible argument at call site.'),
  Reception: tree('Signal reception feature in classifier/inspector.', 'Reference a compatible Signal; the call arrow is separate from this feature.'),
  EnumerationLiteral: tree('Literal row in its Enumeration compartment.', 'Select as a compatible enumeration value; not a chart State.'),
};

/** Relationship style is diagram-specific where an element appears in multiple workspaces. */
export const relationshipNotation: Record<string, NotationSpec> = {
  Association: edge('Solid undirected association.', 'Classifier/source ↔ classifier/target; set roles and multiplicities.'),
  SharedAggregation: edge('Solid line with hollow diamond at the whole end.', 'Whole ↔ shared part; not exclusive composition.', 'solid', undefined, 'hollowDiamond'),
  Composition: edge('Solid line with filled diamond at the whole end.', 'Whole ↔ composed part; inspect ownership/multiplicity.', 'solid', undefined, 'diamond'),
  Generalization: edge('Solid line, hollow triangle at general classifier.', 'Specialized → general.', 'solid', 'triangle'),
  Dependency: edge('Dashed open arrow.', 'Dependent client → supplier; no data transfer.', 'dashed', 'open'),
  Allocate: edge('Dashed dependency with «allocate» badge.', 'Behavior/usage → responsible element; not scheduling.', 'dashed', 'open'),
  Satisfy: edge('Dashed «satisfy» arrow.', 'Design → Requirement; claim, not proof.', 'dashed', 'open'),
  Verify: edge('Dashed «verify» arrow.', 'Test/verification → Requirement; collect results separately.', 'dashed', 'open'),
  Refine: edge('Dashed «refine» arrow.', 'Detailed description → refined goal/requirement.', 'dashed', 'open'),
  Trace: edge('Dashed «trace» arrow.', 'Source → target; general trace only.', 'dashed', 'open'),
  RequirementContainment: edge('Labeled «contains» ownership link.', 'Containing Requirement → subordinate Requirement; check the semantic hierarchy.'),
  DeriveReqt: edge('Dashed «deriveReqt» arrow.', 'Derived Requirement → source Requirement.', 'dashed', 'open'),
  Copy: edge('Dashed «copy» arrow.', 'Copy → master Requirement.', 'dashed', 'open'),
  Connector: edge('Solid assembly/delegation line on IBD.', 'Join resolved part/port occurrences; check role paths.'),
  BindingConnector: edge('Undirected equality; IBD binding is dashed, parametric Help schematic plain.', 'Bind compatible value/constraint parameter endpoints; not causal signal flow.', 'dashed'),
  ItemFlow: edge('Conveyed-type label attached to a structural connector.', 'Annotate existing realizing relation with a classifier; no sample transfer.'),
  Transition: edge('Directed arrow with guard/action label on chart.', 'Source state/junction → destination; choose kind/priority/trigger.', 'solid', 'filled'),
  ActivityEdge: edge('Solid open arrow, subtype may be Control or Object Flow.', 'Connect allowed nodes/pins; choose token order or typed value transfer.', 'solid', 'open'),
  ControlFlow: edge('Solid open arrow, optional [guard].', 'Control token from source node → target node.', 'solid', 'open'),
  ObjectFlow: edge('Solid open arrow, typed endpoints.', 'Typed output pin/object → compatible input.', 'solid', 'open'),
  Include: edge('Dashed open «include» arrow.', 'Base Use Case → included Use Case (required reused behavior).', 'dashed', 'open'),
  Extend: edge('Dashed open «extend» arrow.', 'Optional extension Use Case → base Use Case at selected extension point.', 'dashed', 'open'),
  PackageImport: edge('Dashed open «import» arrow.', 'Importing namespace → imported Package.', 'dashed', 'open'),
  ElementImport: edge('Dashed open «import» arrow.', 'Importing namespace → existing Element.', 'dashed', 'open'),
  PackageMerge: edge('Dashed open «merge» arrow.', 'Receiving Package → merged Package; read merge diagnostics.', 'dashed', 'open'),
  conform: edge('View/Viewpoint relation with «conform» badge.', 'View → Viewpoint; inspector derives reference.', 'dashed', 'open'),
  expose: edge('View/exposed element relation with «expose» badge.', 'View → exposed element; does not insert a symbol.', 'dashed', 'open'),
};

export const behaviorNotation: Record<string, NotationSpec> = {
  'activity:action': diagramNotation['activity-diagrams'].Action,
  'activity:initial': node('filledCircle', 'Filled circle (Initial).', 'Connect outgoing Control Flow to the first action.'),
  'activity:activityFinal': node('bullseye', 'Outer ring with filled center (Activity Final).', 'Terminate all activity flows on arrival.'),
  'activity:flowFinal': node('crossCircle', 'Circle with X (Flow Final).', 'End the arriving branch, not the whole activity.'),
  'activity:decision': node('diamond', 'Diamond with outgoing [guard] labels.', 'Choose a guarded path; do not mistake for Join.'),
  'activity:merge': node('diamond', 'Diamond (same glyph as Decision).', 'Recombine alternative incoming paths without synchronization.'),
  'activity:fork': node('bar', 'Thick bar.', 'Split one incoming control path into concurrent outgoing paths.'),
  'activity:join': node('bar', 'Thick bar (same glyph as Fork).', 'Synchronize concurrent incoming branches.'),
  'activity:objectNode': node('rect', 'Square-cornered typed rectangle.', 'Accept/give compatible Object Flow values.'),
  'activity:activityParameterNode': node('rect', 'Square-cornered typed boundary-value rectangle.', 'Connect compatible parameter value paths.'),
  'activity:pin': node('pin', 'Small square attached to Action.', 'Input pin receives compatible Object Flow; output pin sends it.'),
  'sequence:lifeline': diagramNotation['sequence-diagrams'].Lifeline,
  'sequence:message': diagramNotation['sequence-diagrams']['Synchronous / asynchronous / reply message'],
  'sequence:fragment': diagramNotation['sequence-diagrams']['Combined fragment / operand'],
  'sequence:operand': node('fragment', 'Dashed divider in a frame with [guard] label.', 'Assign messages to this operator branch/iteration.'),
  'sequence:ref': diagramNotation['sequence-diagrams']['Interaction use (ref)'],
  'sequence:invariant': diagramNotation['sequence-diagrams']['State invariant'],
  'sequence:time': diagramNotation['sequence-diagrams']['Time / duration constraint'],
  'usecase:actor': diagramNotation['use-case-diagrams'].Actor,
  'usecase:subject': diagramNotation['use-case-diagrams']['Subject boundary'],
  'usecase:extension': diagramNotation['use-case-diagrams']['Extension point'],
  'state:state': diagramNotation['state-machine-fundamentals']['State / composite state'],
  'state:junction': node('filledCircle', 'Small filled circular junction; H/H* label when history type.', 'Connect incoming and outgoing transitions; validate routing and supported kind.'),
  'state:xbridges': node('state', 'State rectangle configured with embedded X-Bridges graph.', 'Configure supported graph/mappings and validate simulation/codegen separately.'),
};

export const extraDiagramNotation: Record<string, NotationItem[]> = {
  'bdd-reference': [
    { label: 'Composition', meaning: 'Exclusive whole/part association.', ...relationshipNotation.Composition },
    { label: 'Shared Aggregation', meaning: 'Shared whole/part association.', ...relationshipNotation.SharedAggregation },
  ],
  'activity-diagrams': [
    { label: 'Activity Final', meaning: 'Terminate the whole Activity.', ...behaviorNotation['activity:activityFinal'] },
    { label: 'Flow Final', meaning: 'Terminate one flow only.', ...behaviorNotation['activity:flowFinal'] },
  ],
  'sequence-diagrams': [
    { label: 'Synchronous Call', meaning: 'Blocking request with matched reply.', ...edge('Solid line with filled arrowhead and activation.', 'Sender → receiver, matched reply for return.', 'solid', 'filled') },
    { label: 'Asynchronous Call or Signal', meaning: 'Nonblocking message.', ...edge('Solid line with open arrowhead.', 'Sender → receiver, inspect signal/operation signature.', 'solid', 'open') },
    { label: 'Reply', meaning: 'Return from a synchronous call.', ...edge('Dashed line with open arrowhead.', 'Callee → original caller; match the call.', 'dashed', 'open') },
    { label: 'Create / Delete', meaning: 'Create or destroy a participant.', ...edge('Dashed create arrow to lifeline header; solid delete arrow to X.', 'Create targets a new lifeline header; Delete targets its termination point.', 'dashed', 'open') },
  ],
  'use-case-diagrams': [
    { label: '«include»', meaning: 'Required reused behavior.', ...relationshipNotation.Include },
    { label: '«extend»', meaning: 'Conditional optional extension.', ...relationshipNotation.Extend },
  ],
  'state-machine-fundamentals': [
    { label: 'History / Deep history', meaning: 'Saved active child/descendant configurations.', ...node('history', 'Small circle labeled H or H* in the chart.', 'Route into history; validate defaults and the restorable configuration.') },
    { label: 'Other pseudostate kinds', meaning: 'The model type vocabulary includes initial, final, choice, fork, join, entry/exit and terminate; editor availability may differ.', ...node('filledCircle', 'Current chart paints most junction kinds as a plain circle, not distinct standard glyphs.', 'Do not assume distinct runtime/code-generation semantics: the current builder treats non-history junction types as routing junctions. Validate the intended route and trace.') },
  ],
};
