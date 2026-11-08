/** Authoring tool for the additional source sites reviewed on 2026-10-06.
 * Not run by coverage: new controls require a new review, never automatic acceptance.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { LIVE_UI_FEATURES, LIVE_UI_TOPICS } from '../../src/help/liveUiTopics';

/** Reviewed 2026-11-08 against src/components/trmSim, src/engine/trmSim, TraceabilityMatrix and DoeSweeperPanel. Each entry documents one source site. */
const AUTHORED: { source: string; handler: RegExp; label: string; body: string }[] = [
  // --- X-Bridges run diagnostics pop-up and status bar ---
  { source: '/diagnostics/XbridgesDiagnosticPopup.tsx', handler: /onShowAll/, label: 'View all run diagnostics', body: 'Open the Problems list of the X-Bridges status bar, which holds every diagnostic of the current run, errors first, and close the pop-up. The pop-up itself shows only the three most serious items that were not announced before. Opening the list does not change the model or the run.' },
  { source: '/diagnostics/XbridgesDiagnosticPopup.tsx', handler: /onDismiss/, label: 'Dismiss the run diagnostics pop-up', body: 'Hide the pop-up at the top right of the canvas. The diagnostics stay in the status bar Problems list until the next run starts, and the problem is not repaired by hiding it. Warnings and information also hide themselves after 8 seconds; an error pop-up stays until you dismiss it.' },
  { source: '/diagnostics/XbridgesStatusBar.tsx', handler: /onSelectBlocks/, label: 'Show the block of a problem', body: 'Select the block that the diagnostic names and bring it into view on the canvas, opening its Subsystem level when it sits inside one. The button appears only when the diagnostic names at least one block; when it names several, the first one that exists is shown. Selecting a block changes neither the model nor the run.' },
  { source: '/diagnostics/XbridgesStatusBar.tsx', handler: /onOpenHelp/, label: 'Open help for a problem', body: 'Open the help chapter that explains the diagnostic code at its diagnostics section: X-Bridges Simulation for simulation codes, and X-Bridges Embedded Code Generation for the XB_ codes. A code without a help entry opens the Simulation chapter. Opening help does not change the model or the run.' },
  { source: '/diagnostics/XbridgesStatusBar.tsx', handler: /setOpen\(!open\)/, label: 'Show or hide the Problems list', body: 'Expand or collapse the Problems list above the status bar. The button shows the number of errors and warnings of the current run, or No problems. The list is read-only: it shows severity, code, message and the meaning from the help reference of each diagnostic, errors first, and keeps the diagnostics of a stopped run until the next run starts.' },
  // --- Requirement links of an element (RequirementAssignmentsPanel) ---
  { source: '/trmSim/RequirementAssignmentsPanel.tsx', handler: /unlink\(l\.id\)/, label: 'Unlink a requirement',
    body: 'Remove this link between the requirement and the element by deleting its satisfy, verify, refine or trace relationship. The requirement and the element themselves stay. The change goes through the repository change callback; if the model gateway rejects it, the reason is added to the error list.' },
  { source: '/trmSim/RequirementAssignmentsPanel.tsx', handler: /setRequirementKey/, label: 'Choose the requirement to link',
    body: 'Select one of the requirements that exist in the repository; each entry shows its requirement ID and, when different, its name. Nothing is linked until you press Link requirement. When the repository has no requirements the panel says so instead of offering this list.' },
  { source: '/trmSim/RequirementAssignmentsPanel.tsx', handler: /setTargetKey/, label: 'Choose the element to link',
    body: 'Select the element the requirement is linked to. The list contains the simulation targets of the selected element; until you choose, the first one is used. The element becomes the source of the new relationship and the requirement its target.' },
  { source: '/trmSim/RequirementAssignmentsPanel.tsx', handler: /setKind/, label: 'Choose the link kind',
    body: 'Choose satisfy, verify, refine or trace for the new relationship. Satisfy says the element implements the requirement, verify that it verifies it, refine that it elaborates it and trace is a general dependency. The kind is stored on the relationship and used by the traceability matrix.' },
  { source: '/trmSim/RequirementAssignmentsPanel.tsx', handler: /^\{link\}$/, label: 'Link requirement',
    body: 'Create the relationship of the chosen kind from the chosen element to the chosen requirement. Nothing is created without a chosen requirement, and a relationship of the same kind between the same element and requirement is not added twice. The new link appears in the Linked requirements list and in the traceability matrix.' },
  // --- Traceability matrix ---
  { source: '/sysml/TraceabilityMatrix.tsx', handler: /onRunAllSimulations/, label: 'Run all simulation tests',
    body: 'Run every verification case whose method is simulation, in order of its ID: a case with a scenario runs the scenario, a case with only a criterion runs the criterion, and a case with neither is skipped. Evidence is recorded in the repository for each run. A summary line (passed, failed, inconclusive, errors, skipped) is added to the error list as an information message. A case that fails to run is counted as an error and does not stop the others.' },
  { source: '/sysml/TraceabilityMatrix.tsx', handler: /onSimulate\(row\.requirement\.id\)/, label: 'Simulate a requirement',
    body: 'Open the simulation verification panel for this requirement below the matrix. There you link simulation targets, create simulation test cases, define a criterion or a scenario and run it. Opening the panel does not run anything by itself.' },
  { source: '/sysml/VirtualizedTraceabilityGrid.tsx', handler: /onSimulate\(row\.requirement\.id\)/, label: 'Simulate a requirement (virtualized grid)',
    body: 'Open the simulation verification panel for the requirement in this row, as in the standard view. The button stops the click from reaching the row, so it does not also navigate to the requirement. Opening the panel does not run anything by itself.' },
  { source: 'src/App.tsx', handler: /setSimVerificationRequirementId\(null\)/, label: 'Close simulation verification',
    body: 'Close the simulation verification panel below the traceability matrix. Criteria, scenarios, links and evidence already saved stay in the repository; an open criterion or scenario draft that was not saved is discarded.' },
  // --- Scenario editor ---
  { source: '/trmSim/ScenarioEditor.tsx', handler: /^\{e=>onChange\(e\.target\.value\)\}$/, label: 'Scenario text field',
    body: 'Text fields of the scenario editor. Duration (s) is the length of the run and Step (s) the time step; the duration must be a whole multiple of the step, the step must not exceed the duration and the run is limited to 20000 steps. A signal alias is the name used in assertion conditions: a letter or underscore followed by letters, digits or underscores, unique, and not true, false, abs, min or max. A stimulus takes value (constant), before, after and at (step), or from, slope and start (ramp). An assertion condition is an expression over the aliases (numbers, + - * /, comparisons, && || !, abs, min, max); trigger is the same kind of expression and within (s) must be greater than 0; window start and end limit the assertion to part of the run and must lie within 0 and the duration. A blank or non-numeric number is rejected when the scenario is validated.' },
  { source: '/trmSim/ScenarioEditor.tsx', handler: /order\.map/, label: 'Engine execution order',
    body: 'Choose which engine (State machine, X-Bridges, V-Lab) runs at this position in every step. Only engines that take part in the scenario run, each exactly once, and every participating engine must appear. The order decides coupling timing: a coupling from an engine that runs later than the engine it drives takes effect one step late, otherwise in the same step. The Couplings list of the panel shows which couplings are delayed.' },
  { source: '/trmSim/ScenarioEditor.tsx', handler: /upd\('signals',i,\{target/, label: 'Signal target',
    body: 'Choose the observable signal that is recorded under this alias: a State Machine variable or state, an X-Bridges output or a V-Lab signal, grouped by engine. Assertion conditions refer to it by its alias, and the recorded trace is plotted after a run. Linking the target to the requirement (satisfy, verify, refine or trace) avoids the UNLINKED_SIGNAL warning.' },
  { source: '/trmSim/ScenarioEditor.tsx', handler: /del\('signals',i\)/, label: 'Remove a signal',
    body: 'Delete this signal from the scenario draft. Assertions that still use its alias are then reported as errors until you remove them or declare the alias again. The change is saved only with Save scenario.' },
  { source: '/trmSim/ScenarioEditor.tsx', handler: /upd\('stimuli',i,\{target/, label: 'Stimulus target',
    body: 'Choose what the stimulus drives: a State Machine input variable, an unconnected X-Bridges input or a parameter of an X-Bridges or V-Lab block. A target can be driven only once: driving it by two stimuli, or by a stimulus and a coupling, is reported as DRIVE_CONFLICT.' },
  { source: '/trmSim/ScenarioEditor.tsx', handler: /upd\('stimuli',i,\{kind/, label: 'Stimulus profile',
    body: 'Choose how the target is driven over time: constant (a fixed value), step (before until time at, then after) or ramp (from until start, then from + slope x (t - start)). The profile decides which number fields are shown below.' },
  { source: '/trmSim/ScenarioEditor.tsx', handler: /del\('stimuli',i\)/, label: 'Remove a stimulus',
    body: 'Delete this stimulus from the scenario draft; the target is no longer driven. The change is saved only with Save scenario.' },
  { source: '/trmSim/ScenarioEditor.tsx', handler: /upd\('couplings',i,\{from/, label: 'Coupling source',
    body: 'Choose the observable signal whose value is passed on in every step. A coupling connects an observable of one engine to a drivable target of another engine; a coupling inside one engine is reported as SAME_ENGINE_COUPLING.' },
  { source: '/trmSim/ScenarioEditor.tsx', handler: /upd\('couplings',i,\{to/, label: 'Coupling target',
    body: 'Choose the drivable target of another engine that receives the coupled value (a State Machine input, an unconnected X-Bridges input or a block parameter). The target must not be driven by a stimulus or another coupling at the same time.' },
  { source: '/trmSim/ScenarioEditor.tsx', handler: /del\('couplings',i\)/, label: 'Remove a coupling',
    body: 'Delete this coupling from the scenario draft; the signal is no longer passed to the other engine. The change is saved only with Save scenario.' },
  { source: '/trmSim/ScenarioEditor.tsx', handler: /upd\('assertions',i,\{requirementId/, label: 'Assertion requirement',
    body: 'Choose the requirement this assertion is evidence for. The result of the assertion is recorded as verification evidence for that requirement, and saving the scenario adds the requirement to those verified by the test case.' },
  { source: '/trmSim/ScenarioEditor.tsx', handler: /upd\('assertions',i,\{mode/, label: 'Assertion mode',
    body: 'Choose how the condition is judged over the samples of its window: always (true at every sample), never (false at every sample), eventually (true at some sample) or response (every time the trigger becomes true, the condition becomes true within the given number of seconds). Response shows the trigger and within fields. A window without samples gives an inconclusive verdict, not a pass.' },
  { source: '/trmSim/ScenarioEditor.tsx', handler: /del\('assertions',i\)/, label: 'Remove an assertion',
    body: 'Delete this assertion from the scenario draft. A scenario needs at least one assertion to be valid. The change is saved only with Save scenario.' },
  { source: '/trmSim/ScenarioEditor.tsx', handler: /signals:\[\.\.\.p\.signals/, label: 'Add a signal',
    body: 'Add an empty signal row: type an alias and choose the observable target to record. Signals are what assertion conditions read; a signal that no assertion uses is still recorded and plotted.' },
  { source: '/trmSim/ScenarioEditor.tsx', handler: /stimuli:\[\.\.\.p\.stimuli/, label: 'Add a stimulus',
    body: 'Add a stimulus row, a constant by default: choose the target to drive, the profile and its numbers.' },
  { source: '/trmSim/ScenarioEditor.tsx', handler: /couplings:\[\.\.\.p\.couplings/, label: 'Add a coupling',
    body: 'Add an empty coupling row: choose the observable signal that is passed on and the drivable target of another engine that receives it.' },
  { source: '/trmSim/ScenarioEditor.tsx', handler: /assertions:\[\.\.\.p\.assertions/, label: 'Add an assertion',
    body: 'Add an assertion for the requirement being verified, with mode always and an empty condition. Enter the condition over the declared signal aliases; the window is optional and defaults to the whole run.' },
  { source: '/trmSim/ScenarioEditor.tsx', handler: /onSave\(scenario,verifies\)/, label: 'Save scenario',
    body: 'Store the scenario in the verification case and add the requirements of its assertions to the requirements the case verifies. The button is disabled while the validation errors shown above it remain; warnings do not block saving. Saving does not run the scenario: press Run on the test case.' },
  { source: '/trmSim/ScenarioEditor.tsx', handler: /^\{onCancel\}$/, label: 'Cancel the scenario editor',
    body: 'Close the scenario editor without saving: the draft is discarded and the stored scenario, if any, is unchanged.' },
  // --- Simulation verification panel ---
  { source: '/trmSim/SimVerificationPanel.tsx', handler: /^\{e=>onChange\(e\.target\.value\)\}$/, label: 'Criterion number field',
    body: 'Number fields of the criterion editor. Value is the level the check compares with. By (s) is the time by which a reaches check must have reached it or after which a settles check applies. Window start and end (s) limit a <=, >= or within check to part of the run and must lie within 0 and the duration. Tolerance (zero or more) is the allowed distance from the value for within and settles. Duration (s) and Step (s) define the run: the duration must be a whole multiple of the step, the step must not exceed the duration, at most 20000 steps. Stimulus fields are value (constant), before, after and at (step), or from, slope and start (ramp). A blank or non-numeric entry is rejected when you save.' },
  { source: '/trmSim/SimVerificationPanel.tsx', handler: /relationships\[l\.relationshipId\]/, label: 'Unlink a simulation target',
    body: 'Remove the relationship between this simulation target and the requirement. The target (State Machine, X-Bridges or V-Lab element) and the requirement stay; only the link is deleted.' },
  { source: '/trmSim/SimVerificationPanel.tsx', handler: /setLinkTarget/, label: 'Choose the simulation target to link',
    body: 'Select the State Machine, X-Bridges or V-Lab element of the project to link to this requirement; each entry shows its name and kind. If you do not choose, the first element of the list is used when you press Link.' },
  { source: '/trmSim/SimVerificationPanel.tsx', handler: /setLinkKind/, label: 'Choose the link kind',
    body: 'Choose satisfy, verify, refine or trace for the new relationship between the simulation target and this requirement. The kind is stored on the relationship and shown in the Linked simulation targets list.' },
  { source: '/trmSim/SimVerificationPanel.tsx', handler: /^\{link\}$/, label: 'Link a simulation target',
    body: 'Create the relationship of the chosen kind from the chosen simulation target to this requirement. Nothing is created when the project has no element to link. The link appears in the Linked simulation targets list.' },
  { source: '/trmSim/SimVerificationPanel.tsx', handler: /createSimulationCase/, label: 'New simulation test case',
    body: 'Create a verification case with the method simulation that verifies this requirement, named after the requirement ID. It has neither criterion nor scenario yet: use Define criterion for a single check or Define scenario for a multi-engine scenario with assertions.' },
  { source: '/trmSim/SimVerificationPanel.tsx', handler: /^\{\(\)=>run\(vc\)\}$/, label: 'Run a simulation test case',
    body: 'Run the test case. A case with a scenario runs the scenario and records evidence for each requirement it asserts, then shows the number of passed, failed, inconclusive and not tested requirements and a table of the assertions with verdict, time and values. A case with only a criterion runs the check and shows Passed, or Failed with the first violation (time, value and reason). A run that cannot start shows its diagnostics and records nothing. The button is disabled until a criterion or scenario is defined.' },
  { source: '/trmSim/SimVerificationPanel.tsx', handler: /openEditor\(vc,true\)/, label: 'Edit the criterion',
    body: 'Open the criterion editor filled with the stored criterion: the observed signal, the check, its numbers, the run duration and step, and the stimuli. Changes are stored only with Save criterion.' },
  { source: '/trmSim/SimVerificationPanel.tsx', handler: /openEditor\(vc,false\)/, label: 'Define a criterion',
    body: 'Open the criterion editor with empty fields (the button reads Define new criterion when one already exists, and saving then replaces it). A criterion observes one signal while optional stimuli drive inputs, and checks it with <=, >=, within, reaches or settles.' },
  { source: '/trmSim/SimVerificationPanel.tsx', handler: /setScenarioEditing\(vc\.id\)/, label: 'Define or edit the scenario',
    body: 'Open the scenario editor below the test case. A scenario records signals, drives stimuli, couples engines and holds assertions over time. Editing it changes the stored scenario only when you press Save scenario.' },
  { source: '/trmSim/SimVerificationPanel.tsx', handler: /setD\(\{observe/, label: 'Observed signal',
    body: 'Choose the signal the criterion checks, grouped by engine: a State Machine variable or state, an X-Bridges output or a V-Lab signal. The engine of this signal is the one that is simulated. If the criterion has a unit that differs from the unit of the signal, saving reports UNIT_MISMATCH.' },
  { source: '/trmSim/SimVerificationPanel.tsx', handler: /setD\(\{check/, label: 'Check kind',
    body: 'Choose how the observed signal is judged. <= and >= require every sample in the window to be at most or at least the value. within requires every sample in the window to lie within the value plus or minus the tolerance. reaches requires some sample at or before the time By to reach the value (rising by default). settles requires every sample from the time By onward to lie within the value plus or minus the tolerance. The fields below change with the check.' },
  { source: '/trmSim/SimVerificationPanel.tsx', handler: /setStim\(i,\{target/, label: 'Stimulus target',
    body: 'Choose what the stimulus drives during the run: a State Machine input variable, an unconnected X-Bridges input or a block parameter of X-Bridges or V-Lab. Leave no stimulus out that the observed signal depends on, otherwise the signal keeps the model defaults.' },
  { source: '/trmSim/SimVerificationPanel.tsx', handler: /setStim\(i,\{kind/, label: 'Stimulus profile',
    body: 'Choose constant (a fixed value), step (before until time at, then after) or ramp (from until start, then from + slope x (t - start)). The profile decides which number fields are shown.' },
  { source: '/trmSim/SimVerificationPanel.tsx', handler: /stimuli:prev\.stimuli\.filter/, label: 'Remove a stimulus',
    body: 'Delete this stimulus from the criterion draft; the target is no longer driven. The change is stored only with Save criterion.' },
  { source: '/trmSim/SimVerificationPanel.tsx', handler: /stimuli:\[\.\.\.prev\.stimuli/, label: 'Add a stimulus',
    body: 'Add a stimulus row, a constant by default: choose the target to drive, the profile and its numbers.' },
  { source: '/trmSim/SimVerificationPanel.tsx', handler: /^\{\(\)=>save\(vc\)\}$/, label: 'Save the criterion',
    body: 'Validate the criterion and store it in the verification case. Errors (duration, step, window, tolerance, value, observed signal, stimulus numbers, unit) are listed in red and nothing is stored until they are fixed. Saving does not run the simulation: press Run.' },
  { source: '/trmSim/SimVerificationPanel.tsx', handler: /setEditing\(null\)/, label: 'Cancel the criterion editor',
    body: 'Close the criterion editor without saving: the draft and its error list are discarded and the stored criterion, if any, is unchanged.' },
  // --- DoE Sweeper results (X-Bridges properties panel) ---
  { source: '/powertrain/DoeSweeperPanel.tsx', handler: /doeModuleTable/, label: 'Send the sweep results to the DOE module',
    body: 'Convert the collected rows into a DOE table and pass it to the DOE module: the factor and response columns become experiment columns for fitting a surrogate. It is enabled when there are results and the workspace can open the DOE module. Sending does not change the sweep block or any calibration block.' },
  { source: '/powertrain/DoeSweeperPanel.tsx', handler: /setEcuId/, label: 'Target ECU',
    body: 'Choose the Calibration ECU block that receives the optimum of the sweep. Only PT_CALIBRATION_ECU blocks of the model are offered. The choice enables Write optimum to ECU once the sweep is complete.' },
  { source: '/powertrain/DoeSweeperPanel.tsx', handler: /^\{writeEcu\}$/, label: 'Write the optimum to the ECU',
    body: 'Write the best feasible row of every operating point (minimum of the sweep objective) into the chosen Calibration ECU: its mode becomes Map and its speed and load breakpoints and one map per sweep factor are replaced. An operating point without a feasible row is filled from the nearest point that has one, and the panel tells which. Enabled when the sweep is complete and an ECU is chosen. A failure is shown as a message below.' },
  { source: '/powertrain/DoeSweeperPanel.tsx', handler: /setEngId/, label: 'Target engine',
    body: 'Choose the Mapped SI Engine or Mapped CI Engine block that receives the sweep as tables. Only blocks of these two types are offered.' },
  { source: '/powertrain/DoeSweeperPanel.tsx', handler: /setTRef/, label: 'Reference torque',
    body: 'Enter the reference torque in N*m that corresponds to 100 % commanded load in the engine tables: rows of the tables are the commanded torque, Load/100 times this value. It defaults to the highest brake torque measured in the sweep and must be a positive number.' },
  { source: '/powertrain/DoeSweeperPanel.tsx', handler: /^\{writeEngine\}$/, label: 'Write the maps to the Mapped Engine',
    body: 'Write the tables built from the sweep (rows commanded torque, columns speed) into the chosen Mapped Engine, using the best feasible rows. Air flow is derived from fuel flow with the air-fuel ratio 14.7 for the SI engine; the CI engine uses the export default. Enabled when the sweep is complete and an engine is chosen; an invalid reference torque is reported as a message.' },
  { source: '/powertrain/DoeSweeperPanel.tsx', handler: /setMapKind/, label: 'Calibration map',
    body: 'Choose which calibration map is computed from the sweep: base start of injection over speed and fuel quantity, full-load fuel limit or full-load torque over speed, smoke limiter over speed and boost, or injection duration over speed and fuel quantity. The choice decides the breakpoints written to the target map.' },
  { source: '/powertrain/DoeSweeperPanel.tsx', handler: /setQFull/, label: 'Fuel quantity at 100 % load',
    body: 'Enter the fuel quantity in mg per stroke at 100 % load. It converts the load of each operating point into a fuel quantity (quantity = load / 100 times this value) and, for the injection duration map, sets the target quantities at 25, 50, 75 and 100 % of it. It must be a positive number.' },
  { source: '/powertrain/DoeSweeperPanel.tsx', handler: /setLamLimit/, label: 'Smoke lambda limit',
    body: 'Enter the minimum air-fuel equivalence ratio lambda for the smoke limiter map. It defaults to the Lambda_min of the sweep block when that is positive, otherwise 1.3. Only the smoke limiter map uses it.' },
  { source: '/powertrain/DoeSweeperPanel.tsx', handler: /setMapId/, label: 'Target map',
    body: 'Choose the Calibration Map 2D block that receives the computed map. Only PT_CALIBRATION_MAP_2D blocks of the model are offered.' },
  { source: '/powertrain/DoeSweeperPanel.tsx', handler: /^\{writeMap\}$/, label: 'Write the calibration map',
    body: 'Compute the chosen calibration map from the sweep rows and write its breakpoints and values into the target Calibration Map 2D block. For the injection duration map, targets outside the measured range are clamped and the panel lists them. Enabled when the sweep is complete and a target map is chosen; a failure, such as a non-positive fuel quantity, is shown as a message.' },
];
const report=JSON.parse(readFileSync('docs/help/2026-10-06-live-ui-reconciliation.json','utf8'));
if (!report.items.some((item:any)=>item.status==='unreviewed')) throw new Error('No new sites require review; preserve the existing review manifest.');
const additions:any[]=[...LIVE_UI_FEATURES], topics:Record<string,any>={...LIVE_UI_TOPICS}, reviews:any[]=JSON.parse(readFileSync('docs/help/audit/live-ui-additional-review.json','utf8'));
for(const item of report.items.filter((item:any)=>item.status==='unreviewed')) {
  const h=Object.values(item.handlers).join(' '), source=item.source, tag=item.tag;
  const id=item.feature ?? 'live:'+source.replace(/^src\//,'').replace(/\.tsx$/,'')+':'+createHash('sha256').update(item.signature).digest('hex').slice(0,12);
  const record={source,signature:item.signature,id,status:'documented',reason:'Additional source handler reviewed against its component implementation.',featureIds:[id]};
  let label='',body='';
  if(/^\{\s*(?:\([^)]*\)|\w+)\s*=>\s*(?:\w+\.)?(?:stopPropagation|preventDefault)\(\)\s*\}$/.test(h.trim()) || tag==='Profiler') {
    reviews.push({...record,status:'excluded',featureIds:[],reason:tag==='Profiler'?'React render profiler callback records performance and is not an interactive command.':'Propagation/prevent-default wrapper performs no independent model or UI command.'});continue;
  }
  if(/^[A-Z]/.test(tag)&&!['ReactFlow','Resizer','PanelMaximizeButton','DraftTextInput','KindFilter','TargetPackSelector'].includes(tag)) {
    reviews.push({...record,status:'excluded',featureIds:[],reason:`${tag} callback wiring delegates events into the rendered child component. Its rendered controls are audited separately; this call site is not another standalone UI action.`});continue;
  }
  const authored=AUTHORED.find(entry=>source.endsWith(entry.source)&&entry.handler.test(h.replace(/\s+/g,'')));
  if (authored) {
    label=authored.label;body=authored.body;
  } else if (/handleHorizontalToolbarWheel/.test(h)) {
    label='Scroll the workspace toolbar';body='When the toolbar is wider than its visible area, use the mouse wheel over it to scroll horizontally and reveal hidden tools. Without horizontal overflow, the handler leaves normal scrolling unchanged. This changes only the toolbar viewport.';
  } else if (/setSnapEnabled/.test(h)) {
    label='Grid snap';body='Toggle Snap to choose grid-aligned placement or smooth pointer movement in this workspace. V-Lab uses its configured 10-pixel snap grid. This affects subsequent placement/movement; it does not change component parameters, solver timing or model relationships.';
  } else if (source.endsWith('/VLabDiagnosticsPanel.tsx')) {
    label=/onDismiss/.test(h)?'Dismiss run diagnostic':'Select a diagnostic block';body=/onDismiss/.test(h)?'Dismiss the visible run diagnostic panel. The recorded failure is not repaired by hiding it. Correct the reported topology, parameter or solver problem before starting another run.':'Select the block named in the run diagnostic to inspect its parameters and offending port context. Read the diagnostic code and message, repair the corresponding model issue and rerun; selecting the block does not itself repair the network.';
  } else if (source.endsWith('/VLabMigrationBanner.tsx')) {
    label=/setDismissed/.test(h)?'Dismiss migration notices':'Inspect a migrated block';body=/setDismissed/.test(h)?'Hide the current model-load migration notices by marking their keys dismissed in this banner. This does not undo parameter migrations or alter the loaded model. Review and save the migrated project after inspecting the changes.':'Select the named migrated block to inspect its loaded parameters. Compare the notice with the intended physical meaning, including units and changed parameter conventions, before running the model.';
  } else if (source === 'src/App.tsx' && /parseModelExplorerDragData/.test(h)) {
    label='Main diagram canvas gestures';body='Use the current tool to select, move, resize or connect supported chart/structural symbols. Wheel gestures adjust the viewport. In State Machine mode right-click opens its canvas menu at the world position. Drag an existing Model Explorer element onto a compatible SysML diagram to add its presentation; the drop preserves its semantic identity. Review command diagnostics and keep canvas movement distinct from model ownership.';
  } else if(source.endsWith('/HelpModal.tsx')) {
    label='Help navigation';body='Search Help matches chapter text, sections and examples. Documentation returns to chapters; Block reference opens catalog browsing. Source/category filters narrow the block list, and selecting a block displays its purpose, behavior, ports, parameters and example. Select a search result or topic to open it, use On this page to jump to a section, and Previous/Next/Related to navigate. Open/Close Architecture Explorer toggles the read-only map. Close Help, Escape or clicking the outer backdrop closes the dialog; Tab stays inside it. Navigation does not execute engineering actions.';
  } else if(tag==='PanelMaximizeButton'||tag==='Resizer'||/setIsResizing|setIsDragging|handleResize|handleModalResize|setResizingPanel|handleDocksChange|zIndex:/.test(h)) {
    label='Move, resize or maximize a panel';body='Drag the visible window title/grip to move or resize the panel, or use its maximize control to expand/restore it. Releasing the pointer ends the gesture. Floating-window movement is disabled where the mobile/maximized layout requires it. These controls change the workspace layout and stacking order rather than model variables or solver settings.';
  } else if(tag==='DraftTextInput') {
    const field=/sourceRole|sourceMultiplicity|targetRole|targetMultiplicity/.exec(h)?.[0];
    if(!field) throw new Error('Unreviewed relationship field '+h);
    label='Relationship '+field;body=field.includes('Multiplicity')?`Enter ${field} using the multiplicity parser, for example 1 or 0..*. The source/target role matters: this editor commits the corresponding endpoint value through its update callback. Invalid text uses the existing multiplicity; inspect the committed value and relationship diagnostics.`:`Enter ${field}, the role name at that relationship endpoint. Leading/trailing whitespace is trimmed; an empty name clears the optional role. This changes endpoint metadata rather than reversing relationship direction.`;
  } else if(tag==='TargetPackSelector') {
    label='Choose HIL target pack';body='Select target, driver mode and installed pack. The callback applies target ID, pack version, driver mode and device revision to HIL configuration. Inspect mapping/pin conflicts after changing the target; selecting a pack does not itself build, flash or connect hardware.';
  } else if(tag==='KindFilter') {
    label='Filter allocation matrix kinds';body='Toggle the offered row or column element kinds to filter the allocation matrix. This changes visible cells; it does not create or delete allocations. Inspect the source/target element identities before editing a displayed relationship.';
  } else if(tag==='ReactFlow') {
    label='Canvas selection, movement and connections';body=source.includes('/entropy/')?'Select OPM nodes/edges to inspect their properties; drag nodes to update positions and connect compatible ports with the selected link kind. Deletion passes through the workspace deletion handler. Pane selection and visual movement are separate from simulation; review connection/deletion diagnostics before running.':source.includes('/vlab/')?'Select a physical component to inspect it, drag it to rearrange the network, and connect compatible conserving or signal ports. Double-click uses the workspace navigation/action for that node. Connections must retain domain, unit, width and direction compatibility; layout changes do not make an invalid physical system solvable.':'Select blocks/edges to inspect them, drag library items or existing blocks to place/rearrange them, and connect compatible signal ports. Pane double-click opens the search menu; selection updates the properties target. The workspace handles save/export separately. A canvas gesture does not automatically start simulation.';
  } else if(source.includes('/sysml/SequenceWorkspace')) {
    label='Sequence canvas gesture';body=/Fragment/.test(h)?'Select/drag the fragment frame to adjust its presentation bounds. Keep covered lifelines and operand message membership consistent; use the inspector to change operator and guards. Reordering messages affects semantic order and validation.':/Lifeline/.test(h)?'Use the selected palette tool on a lifeline to choose message endpoints, or select/drag a participant in Select mode. Dragging its header/body uses the workspace lifeline handler and updates order/presentation. A self message targets the same participant. Inspect diagnostics after creation or reordering.':/Constraint|Invariant/.test(h)?'Select the time/duration constraint or state invariant to inspect its anchors, expression/state reference and diagnostics. These are modeled assertions and do not execute a timer or State Machine in the Sequence workspace.':'Focus the Sequence canvas to use its supported keyboard selection/delete/cancel actions. Background pointer gestures depend on the selected palette tool; Select mode changes selection, while fragment/reference tools create their modeled items. Check the inspector and diagnostics after an edit.';
  } else if(source.includes('/sysml/ActivityWorkspace')||source.includes('/sysml/UseCaseWorkspace')) {
    label='Diagram canvas gesture';body=/Pin/.test(h)?'Select a typed pin and use the workspace’s connection tool to define a compatible object-flow endpoint. Inspect the pin direction/type and command diagnostics; a control-flow edge does not transport a typed value.':/Resize/.test(h)?'Drag the selected symbol’s resize grip to change its diagram bounds. Semantic identity and relationships remain distinct from presentation size. Inspect overlapping symbols/labels after resizing.':/Lane/.test(h)?'Select/drag the Activity partition lane to adjust its presentation. A lane records modeled responsibility; moving its boundary does not itself execute an action or transfer semantic ownership.':'Use the current palette tool to select a symbol/edge or create the supported item/connection on the canvas. Focus the canvas for supported keyboard edit/cancel/delete actions. Inspect endpoints and command diagnostics before accepting a relationship; diagram editing does not execute the modeled behavior.';
  } else if(/handleRedefine/.test(h)) {
    label='Redefine inherited feature';body='Press Enter/Space on the inherited feature control to request redefinition in the current Block. This creates/updates the owned feature through the provided command path rather than directly editing the ancestor’s definition. Review semantic diagnostics and effective inherited/owned features after the command.';
  } else if(source.includes('/plantuml/')) {
    label='Drop PlantUML palette item';body='Drag a supported PlantUML palette item onto the canvas. The drop handler reads its ADIA kind and local drop coordinates, then passes them to the workspace insertion callback. Inspect the resulting diagram/source; this is not a full-fidelity import of every SysML semantic feature.';
  } else if(source.includes('/modelExplorer/')||source.includes('/sysml/VirtualizedTraceabilityGrid')) {
    label='Tree or matrix keyboard and scrolling';body='Scroll to inspect virtualized rows. Focus the tree/grid for its implemented keyboard navigation; F2 starts rename only for a writable focused row. Rename does not change semantic identity. Expansion, selection and scrolling affect visible presentations; use explicit supported commands to move, delete or create semantic elements.';
  } else if(source.includes('/xbridges/XbridgesScopeWindow')) {
    label='Scope plot gestures';body='Use the Scope plot pointer/wheel gestures to inspect its retained trace and configured cursor/zoom interaction. Mouse release/leave ends dragging. Plot manipulation changes the display, not the collected samples or solver state. Close the dialog through its close controls without assuming simulation stopped.';
  } else if(source.includes('/xbridges/XbridgesPropertiesPanel')) {
    label='Scroll block properties';body='Drag/scroll the properties panel to inspect the selected block’s parameter fields. Pointer release/leave ends the drag. Navigation does not commit a new block parameter; use the relevant field editor and read the component reference for its numerical meaning.';
  } else if(source.includes('/xbridges/XbridgesWorkspace')&&/onDragStart/.test(h)) {
    label='Drag X-Bridges library block';body='Drag the selected library entry onto the X-Bridges canvas. The type ID is carried by the drag operation; the workspace drop handler inserts the block at the drop location. Configure its parameters and connect compatible ports before running. Palette-only types without factories cannot be inserted normally.';
  } else if(/onClose|setShowConfirmClear\(false\)|setImportValidationError\(null\)|setShowCodegenDialog\(false\)|setDeleteConfirmState\(null\)|setSysmlDeleteConfirm\(null\)|setRequirementConnectionPicker\(null\)|setPackageDiagramChooser\(null\)|setDiagramTargetChooser\(null\)|revertDrop|dismissErrorDialog/.test(h)) {
    label='Close or cancel dialog';body='Click the outer backdrop or use the close/cancel control to dismiss this dialog. Clicking its inner surface does not dismiss it. Canceling a pending chooser/deletion does not perform that proposed operation; a reverted pending drop restores its prior arrangement. Closing a preview is separate from exporting or saving its content.';
  } else if(source==='src/App.tsx'&&/handleRotaryMouseDown/.test(h)) {
    label='HMI rotary control';body='In HMI Run mode, drag the bound rotary control to change its variable within the configured minimum/maximum. Edit mode changes dashboard layout instead. Confirm the variable binding and committed value before using the control in a model scenario.';
  } else if(source==='src/App.tsx'&&/handleMouseDown.*handleMouseUp.*handleMouseLeave/.test(h)) {
    label='HMI press control';body='In HMI Run mode, press the bound control to set its pressVariable true. Release or leave the control to clear it; the handler cancels the long-press timer. Edit mode suppresses this runtime interaction. Check the bound variable before interpreting a downstream model reaction.';
  } else if(source==='src/App.tsx'&&/handleMouseUp|handleMouseMove/.test(h)) {
    label='HMI layout drag';body='In HMI Edit mode, pointer movement updates the pending dashboard component drag/resize and pointer release ends it. Run mode uses the component’s variable binding instead. Inspect the selected component and its saved bounds after changing the layout.';
  } else if(source==='src/App.tsx'&&/handlePaste/.test(h)) {
    label='Paste experiment table';body='Paste tabular experiment text into the data editor. Inspect parsed numeric cells, column labels and response placement before analysis. Clipboard paste edits this table; it does not itself run DOE or acquire hardware samples.';
  } else if(source==='src/App.tsx'&&/handleJunctionMouseDown|startBddFeatureDrag|isCreatingTransition/.test(h)) {
    label='Select or drag model feature';body='Select the model feature or junction using the active canvas tool. In the appropriate drag/connection mode the handler starts the pending feature move or relationship creation, using semantic IDs and ownership context. Inspect the proposed target and gateway diagnostics before committing; moving a feature between owners differs from moving its symbol.';
  } else if(/Dialog.Root/.test(tag)) {
    label='Close analysis dialog';body='Close the Scope/Root Locus dialog through its dialog controls. The open-state callback closes the window when the dialog reports closed. This does not itself reset the numerical model or erase its saved block parameters.';
  } else if(tag==='div'&&h.trim()==='{onMouseDown}') {
    reviews.push({...record,status:'excluded',featureIds:[],reason:'Reusable layout/presentation primitive forwards its caller-provided pointer handler; caller gestures are audited separately.'});continue;
  } else if(/handleResizeMouseDown/.test(h)) {
    label='Resize diagram symbol';body='Drag this symbol’s resize handle to change its presentation bounds. This adjusts the selected state, Block, part or package drawing rather than replacing its semantic definition. Release the pointer to finish and inspect the resulting layout.';
  }
  if(!body) throw new Error('Still requires review: '+source+':'+item.line+' '+h);
  if(!additions.some(feature=>feature.id===id)) additions.push({id,label,topicId:id,sectionId:'use',sourcePath:source,kind:'action',module:'system'});
  topics[id]={title:label,category:'Workspace Controls',description:body,content:body,sections:[{id:'use',title:label,body,sources:[source]}],sources:[source]};
  reviews.push(record);
}
writeFileSync('src/help/liveUiTopics.ts',`import type { HelpFeature } from './helpFeatures';\nimport type { HelpTopic } from './helpTypes';\nexport const LIVE_UI_FEATURES: HelpFeature[] = ${JSON.stringify(additions,null,2)};\nexport const LIVE_UI_TOPICS: Record<string,HelpTopic> = ${JSON.stringify(topics,null,2)};\n`);
writeFileSync('docs/help/audit/live-ui-additional-review.json',JSON.stringify(reviews,null,2));
// Attach direct bindings to the reviewed native/control sites only.
for(const source of [...new Set<string>(additions.map(feature=>feature.sourcePath))]) {
  const text=readFileSync(source,'utf8'),file=ts.createSourceFile(source,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),edits:any[]=[];
  const map=new Map(reviews.filter(row=>row.source===source&&row.status==='documented').map(row=>[row.signature,row.id]));
  const visit=(node:ts.Node)=>{if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)) {
    const handlers:Record<string,string>={};
    for(const attr of node.attributes.properties) if(ts.isJsxAttribute(attr)&&/^on[A-Z]/.test(attr.name.getText(file))&&attr.initializer) handlers[attr.name.getText(file)]=attr.initializer.getText(file);
    const signature=node.tagName.getText(file)+'|'+Object.entries(handlers).sort().map(([key,value])=>key+':'+value.replace(/\s+/g,'')).join('|');
    const id=map.get(signature);
    if(id&&!node.attributes.properties.some(attr=>ts.isJsxAttribute(attr)&&/^data-help-(feature|topic)$/.test(attr.name.getText(file)))) edits.push({position:node.tagName.end,text:` data-help-feature="${id}"`});
  }ts.forEachChild(node,visit);};visit(file);
  let updated=text;for(const edit of edits.sort((a,b)=>b.position-a.position)) updated=updated.slice(0,edit.position)+edit.text+updated.slice(edit.position);
  if(updated!==text) writeFileSync(source,updated);
}
console.log(JSON.stringify({documented:additions.length,reviewed:reviews.length}));
