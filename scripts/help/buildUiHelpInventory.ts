import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { UI_ACTION_GUIDANCE } from './uiActionGuidance';

type Candidate = { candidateId: string; source: string; line: number; tag: string; label: string; handlers: Record<string, string> };
const snapshot = JSON.parse(readFileSync('docs/help/audit/2026-10-06-ui-candidates.json', 'utf8'));
const items: Candidate[] = snapshot.items;
const moduleFor = (source: string) => source.includes('/vlab/') ? 'vlab' : source.includes('/xbridges/') ? 'xbridges'
  : source.includes('/hil/') ? 'hil' : source.includes('/sysml/') || source.includes('/modelExplorer/') ? 'sysml'
  : source.includes('/statemachine/') ? 'statemachine' : source.includes('/doe/') ? 'doe' : /Agent|AiArchitect|ArchitectBrain/.test(source) ? 'ai'
  : source.includes('/plantuml/') ? 'plantuml' : /ThreeDX/.test(source) ? '3dx' : /FactoryIO/.test(source) ? 'factoryio' : 'system';
const relatedFor: Record<string, string> = { vlab: 'vlab-fundamentals', xbridges: 'xbridges-ref', hil: 'hil-fundamentals', sysml: 'model-browser',
  statemachine: 'state-machine-fundamentals', doe: 'doe-discovery', ai: 'ai-assistant', plantuml: 'project-files', '3dx': 'project-files', factoryio: 'industrial-automation', system: 'settings-guide' };
const fieldGuidance: Record<string, string> = {
  name: 'Enter the display name. This preserves the object identity; references use IDs rather than this label.',
  label: 'Enter the display label of the selected object. Renaming a display label does not create a new object.',
  pin: 'Choose a pin from those offered for the selected peripheral and target. Resolve duplicate/conflicting assignments before building.',
  peripheral: 'Choose the peripheral. ADC defaults to In/uint16_t; DAC and PWM default to Out/uint8_t. The editor picks an available pin for the new peripheral.',
  direction: 'Choose the offered direction. HIL In channels read hardware into model variables; Out channels write model values to hardware. Confirm that the peripheral supports the intended direction.',
  dataType: 'Choose the data type used for this channel. Check the target and peripheral constraints before generating or building code.',
  rangeMin: 'Enter the minimum channel range. Invalid or empty numerical input falls back to 0 in this editor. Keep the minimum and maximum consistent with the hardware signal.',
  rangeMax: 'Enter the maximum channel range. Invalid or empty numerical input falls back to 0 in this editor. Check the range before mapping a signal.',
  scalingFactor: 'Enter the scaling factor for the channel. This editor falls back to 1 for a falsy parsed value; check the committed value before connecting hardware.',
  unit: 'Enter the unit label, such as V or Hz. A label records metadata; use the conversion expression when a numerical conversion is required.',
  clockSpeed: 'Enter the target clock configuration. This editor parses an integer and uses 16 when the input is invalid or zero. Select a target-supported value.',
  commPort: 'Choose or enter the communication port, such as COM3. This sets configuration; use Connect or Deploy & Connect to open communication.',
  baudRate: 'Choose the baud rate that matches the firmware/serial endpoint. This configuration alone does not reconnect an already open device.',
  enabled: 'Toggle whether HIL configuration is enabled. Enabling configuration is separate from building, flashing and connecting the device.',
  gain: 'Enter the gain used by the selected block or root-locus view. The control converts the value to a number; inspect the block reference and simulation results to verify its effect.',
  maxGain: 'Enter the maximum gain shown by the root-locus view. Positive values are required; the property slider may clamp the value to at least 1.',
  timeRange: 'Choose the time span displayed by the scope. This controls the displayed history window rather than the model stop time.',
  bufferSize: 'Enter the scope buffer size. The scope editor falls back to 1000 when the integer input is invalid or zero. Larger buffers retain more samples.',
  decimation: 'Enter the scope decimation setting. This editor falls back to 1 when the integer input is invalid or zero. Sampling display choices do not improve solver accuracy.',
  sampleTime: 'Enter the scope sample time. The editor falls back to -1 when parsed input is invalid or zero; consult the block’s scope settings for automatic timing.',
  showGrid: 'Choose whether to show grid lines on the scope plot. This changes visualization only.',
  showLegend: 'Choose whether to show the scope legend. The legend identifies displayed traces; this changes visualization only.',
  limitDataPoints: 'Choose whether the scope limits retained data points. Review the buffer-size setting when enabling this option.',
  simulationType: 'Choose the offered simulation/display type for the root-locus view. This does not alter the stored transfer-function coefficients.',
  text: 'Enter annotation text or notes. Notes explain a model but do not affect simulation equations.',
  isAbstract: 'Mark the selected classifier Abstract when it should describe a general type rather than a concrete instance. This is semantic metadata; inspect model rules separately.',
  isLeaf: 'Mark the classifier Leaf when it should not be further specialized. This edits semantic classifier metadata.',
  typeId: 'Choose an existing compatible type from the picker. The stored value is a type reference; check diagnostics after applying it.',
  kind: 'Choose one of the offered kinds. Changing kind can affect which fields and endpoints are valid; inspect the result and validation diagnostics.',
  multiplicity: 'Enter multiplicity such as 1, 0..1 or 0..*. The feature editor separates lower and upper bounds; * means unbounded. Check the committed values when input is invalid.',
  ordered: 'Enable Ordered when the values in this property are ordered. This records semantic multiplicity metadata.',
  unique: 'The Nonunique checkbox stores the inverse of unique. Check Nonunique to allow repeated values in the semantic collection.',
  isDerived: 'Mark Derived when the property is computed from other information. This declaration does not automatically implement a simulation equation.',
  redefinesId: 'Choose the inherited feature this feature redefines. Redefinition retains a link to that source feature; check type and inheritance compatibility.',
  subsetsId: 'Choose the inherited feature this feature subsets. This records semantic subset metadata rather than copying all its runtime values.',
  isConjugated: 'Toggle port conjugation. Conjugation reverses interface interpretation; it does not reverse a diagram edge automatically.',
  defaultValue: 'Enter the optional semantic default value. Clearing it removes the optional field. Numerical execution uses only defaults supported by its runtime path.',
  dimension: 'Enter dimension metadata for the property. It describes the value; it does not itself convert simulation units.',
  sourcePortId: 'Choose the existing port for the source connector end. Check compatibility with the target port after applying.',
  targetPortId: 'Choose the existing port for the target connector end. Check endpoint roles and type compatibility after applying.',
  sourceParameterId: 'Enter the source parameter ID for this binding connector. Clearing removes the optional reference; use IDs of existing compatible parameters.',
  targetParameterId: 'Enter the target parameter ID for this binding connector. Clearing removes the optional reference.',
  itemFlowId: 'Choose a conveyed classifier for the connector’s Item Flow metadata. This semantic choice differs from wiring numerical solver signals.',
  itemProperty: 'Enter the optional Item Flow property name. Clearing removes it; it is descriptive flow metadata.',
  itemUnit: 'Enter the optional Item Flow unit label. This label does not execute numerical unit conversion.',
  sourceNavigable: 'Toggle navigation from the source end of the association. This records semantic navigability metadata.',
  targetNavigable: 'Toggle navigation from the target end of the association. This records semantic navigability metadata.',
  sourceAggregation: 'Choose aggregation at the source association end: none, shared or composite. Inspect the opposite end and relationship validation.',
  targetAggregation: 'Choose aggregation at the target association end: none, shared or composite. This changes semantic end metadata rather than element ownership.',
};
const namedActions: Record<string, string> = {
  handleConnect: 'Connect to the configured endpoint. Confirm port and baud rate first, then inspect connection status and log output. An unavailable serial API or endpoint can reject the connection.',
  handleDisconnect: 'Disconnect the active endpoint. Inspect status afterwards; disconnecting communication does not reverse earlier hardware output.',
  handleExportTrace: 'Export the recorded HIL trace as CSV. Start recording first to collect samples, then stop and export for later inspection.',
  addChannel: 'Add a hardware channel, then set its name, pin, peripheral, direction, data type, range and unit before mapping it to a model variable.',
  removeChannel: 'Delete the selected hardware channel. Review mappings that reference it and validate configuration before building.',
  addMapping: 'Choose a model variable and hardware channel, then select read/write direction, conversion expression and safe value. Map Signal commits that mapping; inspect any safe-value validation message.',
  removeMapping: 'Delete the selected signal mapping. The channel itself remains configured; review the resulting mapping table before deployment.',
  handleBuild: 'Build the generated C artifacts for the selected target/toolchain. Review build logs and prerequisite diagnostics. A successful model validation does not imply that a target compiler is provisioned.',
  handleBurn: 'Flash the selected target firmware through the configured programmer. The HIL flash policy and toolchain prerequisites still apply; inspect output before connecting.',
  handleErase: 'Erase the target flash through the configured programmer. This changes physical target memory. Verify target identity and inspect the tool output.',
  handleDeploy: 'Deploy through the configured HIL build/flash/connect workflow. Configure target, channels and mappings first; inspect each step’s log and evidence before using live signals.',
  handleTargetChange: 'Select a provisioned target pack. Inspect its supported toolchain, peripherals and driver modes; changing selection does not install missing tools.',
  handleDriverModeChange: 'Choose a supported driver mode from the selected target pack. Unsupported modes are unavailable; review generated configuration before building.',
  onExpandAll: 'Expand all visible branches in the Model Explorer to inspect containment. This changes tree display state without modifying the semantic model.',
  onCollapseAll: 'Collapse the Model Explorer branches. Expand a branch again to inspect its descendants; model ownership remains unchanged.',
  onToggleFavoritesOnly: 'Toggle the Model Explorer Favorites filter. This controls displayed rows; it does not delete elements omitted by the filter.',
  addPartition: 'Add an activity swimlane/partition, then set its represented element and allocate it where appropriate. Partitions group responsibilities and do not by themselves execute tasks.',
  addExisting: 'Choose an existing semantic element to display on this diagram. This adds its presentation and preserves its identity rather than creating a duplicate semantic definition.',
  fitToContent: 'Fit the viewport to the current diagram contents. This changes zoom and pan without modifying semantic elements.',
  removeFromDiagram: 'Remove the selected presentations from the active diagram. The semantic elements remain in the model and can be shown again using Add Existing.',
  deleteFromModel: 'Request deletion of the selected semantic elements. Review the confirmation and model impact; semantic deletion has a wider scope than removing a diagram symbol.',
  confirmDeletion: 'Confirm the pending semantic deletion after reviewing the affected selection. Cancel closes the prompt without committing that deletion.',
  addExtensionPoint: 'Select a Use Case and enter a nonblank extension point name, then add it. Use the extension point when specifying an Extend relationship.',
  confirmExtend: 'Choose an existing extension point or enter a new name, add the extension condition, and create Extend. The extension source and base target must satisfy Use Case connection rules.',
  applyProposals: 'Review inferred relationship proposals, then Apply to commit the accepted semantic changes. Keep as drawn only discards proposals while preserving the drawn presentation.',
  commitName: 'Edit the Name and leave the field or press Enter to commit. The command changes the selected semantic name; rejected changes report diagnostics.',
  commitGuard: 'Edit the guard and leave the field or press Enter to commit. Guard text is semantic metadata; runtime evaluation supports only the relevant executable expression subset.',
  commitArgs: 'Edit arguments and leave the field or press Enter to commit. The stored argument text is validated by the supported sequence/runtime workflow.',
  deleteSelection: 'Delete the selected sequence item through its semantic command plan. Review the selected item and resulting diagnostics before continuing.',
  handleCreate: 'Enter a baseline name and submit Save to capture the supported requirement baseline. A baseline is a snapshot for comparison and governance; it does not verify requirements.',
  onClearSuspect: 'Mark the selected suspect traceability link validated after reviewing the changed requirement and relationship. This clears the suspect flag; it does not run a test.',
  onSyncFromMaster: 'Synchronize the supported requirement copy data from its master. Review changes and traceability after synchronization.',
  onCloneBaseline: 'Clone the selected requirement baseline into a new baseline record. Inspect its name and captured state before authorization.',
  onAuthorizeBaseline: 'Authorize the selected requirement baseline through the configured governance action. This records governance state rather than certification.',
  exportCsv: 'Export the currently represented traceability matrix as CSV. Use the search and filters to review scope, and keep verification evidence separate from exported relationship rows.',
  handleAddFactor: 'Add an experiment factor column, then enter its values for each run. Keep factor ranges meaningful for the engineering model.',
  handleAddRun: 'Add an experiment run row, then enter factor inputs and response data before solving the surrogate model.',
  handleRemoveFactor: 'Remove the selected factor from the DOE table. Review the remaining data columns before solving again.',
  handleRemoveRun: 'Remove the selected experiment run row. Review data sufficiency and solve again after changing the dataset.',
  handleSolve: 'Solve the selected DOE/GMDH model from the current dataset. Review fit/error diagnostics; a fitted surrogate requires engineering validation before use outside sampled ranges.',
  handleExportXBridges: 'Export the fitted surrogate to X-Bridges using its supported polynomial representation. Solve first and inspect resulting parameters in the destination model.',
  handleExportVLab: 'Export the fitted surrogate to V-Lab using the supported export representation. Inspect the resulting block and validate the connected physical model.',
  handleNewChat: 'Create a new engineering-agent chat/session. This resets the conversational context for the new session rather than clearing the engineering model.',
  handleModelChange: 'Choose a local Ollama model from the offered list. Test connectivity before requesting engineering work.',
  handleTestConnection: 'Test connectivity to the configured Ollama endpoint and model. Inspect the reported result before sending a task.',
  handleSelectSession: 'Select the existing agent session to review its conversation, specification and audit trail. Pending engineering actions still require their approval gate.',
  handleApprove: 'Review the pending proposed action, affected artifacts and evidence, then approve it. The approval is bound to the active project/revision and proposal; stale proposals need regeneration.',
  handleReject: 'Reject the pending engineering proposal. This closes the approval gate without committing the proposed mutation.',
  handleCancel: 'Cancel the in-flight agent operation. Review its resulting status and any already committed artifacts; cancellation does not guarantee reversal of completed actions.',
  handleUndo: 'Request undo of the last supported committed engineering transaction. Review affected artifacts and resulting revision. Physical hardware effects are not assumed reversible.',
  handleSend: 'Enter the engineering request and send it. Review the produced specification/plan and any approval gate before proposed model changes execute.',
  saveSettings: 'Save the selected AI provider, endpoint, model and key settings, then close settings. Choose an endpoint/model available in your environment and inspect connection failures.',
  refreshModels: 'Query the configured local model endpoint for available models. Confirm the endpoint is reachable, then select a returned model.',
  handleToggle: 'Open or close the engineering-agent panel. This changes panel visibility and retains the model state.',
  downloadCSV: 'Export the collected scope data as CSV. Run the model to collect samples first; buffer and decimation settings can limit retained data.',
};

function explain(item: Candidate): { body: string; label?: string } | undefined {
  const h = Object.values(item.handlers).join(' ');
  const cleanLabel = item.label.replace(/^["']|["']$/g, '').trim();
  if (/setIsRecording/.test(h)) return { body: 'Start or stop HIL trace recording. Starting clears the previous recorded sample list; stopping records the number of collected samples in the log. Export CSV afterwards to retain the trace.' };
  if (/setIsEnabled/.test(h) && item.source.endsWith('FactoryIOGateway.tsx')) return { body: 'Enable/disable real-time synchronization between mapped ADIA variables and Factory I/O tags. Sensor mappings read tags into ADIA; actuator mappings write outward. Inspect live-link status and mappings before enabling.' };
  const parameterKey = h.match(/updateParameter\(['"]([^'"]+)/)?.[1];
  const solverParameters: Record<string, string> = {
    startTime: 'Enter the simulation start time in seconds; invalid/zero input falls back to 0. Keep stop time later than start time.',
    stopTime: 'Enter the stop time in seconds; invalid/zero input falls back to 10. Inspect the configured run limit and retained scope history.',
    solver: 'Choose Auto, BDF, RK4, adaptive RK or Euler from the offered solver modes. Solver availability and accuracy depend on the actual physical network; inspect convergence diagnostics.',
    initialStep: 'Set the initial integration step in seconds; the editor falls back to 0.001 for invalid/zero input. Refine it based on model dynamics and convergence checks.',
    minimumStep: 'Set the minimum permitted step in seconds; the editor falls back to 1e-6. Keep it compatible with maximum step and inspect solver diagnostics.',
    maximumStep: 'Set the maximum integration step in seconds; the editor falls back to 0.05. Smaller maximum steps can improve temporal resolution but increase work.',
    relativeTolerance: 'Set relative numerical tolerance; the editor falls back to 1e-3. Compare outputs under tighter tolerances and inspect convergence rather than assuming accuracy.',
    absoluteTolerance: 'Set absolute numerical tolerance; the editor falls back to 1e-6. Account for signal units and magnitude when comparing solutions.',
    nonlinearTolerance: 'Set nonlinear residual tolerance; the editor falls back to 1e-8. Inspect Newton/convergence diagnostics for the actual network.',
    maximumIterations: 'Set maximum Newton iterations; the editor falls back to 50. A higher limit permits more nonlinear work but cannot repair an invalid physical network.',
    enableDiagnostics: 'Choose whether solver diagnostics are enabled. Inspect emitted messages after a run; hiding diagnostics does not make a failing model valid.',
    enableLogging: 'Choose whether solver statistics logging is enabled. Logs describe available execution evidence and do not certify numerical accuracy.',
    referencePressure: 'Set the hydraulic reference pressure value/unit. Select absolute or gauge interpretation separately; the UI keeps the numeric value and unit metadata together.',
    pressureType: 'Choose absolute or gauge pressure interpretation for the hydraulic reference/reservoir. Check atmospheric-pressure settings and units before rerunning.',
    atmosphericPressure: 'Set atmospheric pressure value/unit used with gauge/absolute interpretation. Keep unit metadata consistent with physical inputs.',
    elevationCorrection: 'Enable/disable elevation correction for the hydraulic reference. When enabled, inspect reference elevation and connected network geometry.',
    referenceElevation: 'Set the reference elevation value/unit for hydraulic elevation correction. Keep the chosen datum and physical geometry consistent.',
    initializationPriority: 'Choose the offered initialization priority for the selected physical component. Inspect initialization/convergence diagnostics; priority metadata is not a guarantee of convergence.',
  };
  if (parameterKey && solverParameters[parameterKey]) return { body: solverParameters[parameterKey], label: cleanLabel || parameterKey };
  const scopeKey = h.match(/onUpdate\(\{\s*(\w+):\s*\{\s*\.\.\.params\./)?.[1];
  const scopeGuidance: Record<string, string> = {
    numSignals: 'Set the number of scope signals; this editor clamps the integer to 1–8 and defaults to 1. Connect the corresponding channels before plotting.',
    time_range: 'Set the scope time range to Auto or a numerical duration. This changes the visible history window rather than the simulation stop time.',
    buffer_size: 'Set retained scope buffer size; invalid/zero integer input falls back to 1000. Buffer limits determine available history/export samples.',
    decimation: 'Set scope decimation; invalid/zero input falls back to 1. Display sampling does not improve numerical solver accuracy.',
    show_grid: 'Choose whether to show grid lines on the scope. This changes visualization only.',
    show_legend: 'Choose whether to show the scope legend identifying traces. This changes visualization only.',
    sample_time: 'Set scope sample time; invalid/zero input falls back to -1 for the offered automatic setting. Interpret sampled history with this configuration.',
    limit_data_points: 'Choose whether to limit scope retained data points. Inspect the buffer size when enabling it; export can only contain retained history.',
  };
  if (scopeKey && scopeGuidance[scopeKey]) return { body: scopeGuidance[scopeKey], label: scopeKey };
  if (/updateParameter\(key/.test(h)) return { body: 'Edit the selected block’s catalog parameter using its displayed name/unit and offered options. Numerical fields parse numbers; positive physical values may be clamped at zero. Inspect the component reference for parameter meaning/bounds and validate the network after editing.' };
  if (/params:\s*\{[^]*?\[key\]/.test(h)) return { body: 'Edit the selected X-Bridges catalog parameter using its displayed name and offered options. Boolean selections are converted to true/false where supported; scalar numbers can commit while typing, while array/matrix drafts commit on blur/Enter. Consult the block reference for meaning, dimensions and limits before simulation.' };
  if (item.source.endsWith('SysmlPropertyPanel.tsx')) return { body: 'Edit the selected inspector field using its schema-defined type, options and read-only state. Text commits on blur/Enter; lists use one item per line, checkboxes commit booleans and multi-select stores references. Consult the specific Inspector property entry for meaning; command rejection displays diagnostics.' };
  if (item.source.endsWith('FactoryIOGateway.tsx') && !h) return { body: 'Select Source Variable, Target Tag and sensor/actuator Direction in the Factory I/O link form. Sensor reads Factory I/O into ADIA; actuator writes ADIA to Factory I/O. Establish Data Link commits the selected mapping after tags are available.', label: 'Factory I/O mapping selection' };
  if (item.source.endsWith('RelationshipWizard.tsx') && !h) return { body: 'Submit Create after choosing the relationship kind, compatible target and optional name. The enclosing form runs validation and reports errors rather than bypassing semantic rules.', label: 'Create relationship' };
  if (item.source.endsWith('RequirementGovernancePanel.tsx') && !h) return { body: 'Save the entered requirement baseline name through the enclosing form. The snapshot supports later comparison and governance rather than executing verification tests.', label: 'Save baseline' };
  if (item.source.endsWith('ThreeDXGateway.tsx') && !h) return { body: 'Submit the embedded browser navigation form to open the entered platform URL. Missing schemes receive https://; browser navigation is separate from document transfer.', label: 'Navigate platform browser' };
  if (/build(?:Add|Update)StateInvariantCommand/.test(h)) return { body: 'Choose the state represented by this sequence State Invariant. Adding it attaches the invariant to the selected lifeline; changing it updates the referenced state through a validated command plan. Inspect rejection diagnostics.', label: 'Sequence state invariant' };
  if (item.source.endsWith('VLabWorkspace.tsx') && /onDrop.*onDragOver/.test(h)) return { body: 'Drop a library block onto the V-Lab canvas to create its configured instance. Connect physically compatible ports and add required references/solver configuration before simulation.', label: 'Drop V-Lab block' };
  const sourceRules: Array<[RegExp, string]> = [];
  if (item.source.endsWith('ThreeDXGateway.tsx') || item.source.endsWith('ThreeDXDashboardPanel.tsx')) sourceRules.push(
    [/handleConnect/, 'Enter Tenant URL and Client ID, then connect through the 3DEXPERIENCE OAuth flow. Authentication completes through the OAuth listener; inspect error/status before workspace operations.'],
    [/handleClose/, 'Close the embedded browser view and gateway panel while retaining the authentication session. Logout explicitly ends the session.'],
    [/refreshOAuthToken/, 'Refresh the existing OAuth token through the connected 3DEXPERIENCE service. Inspect session status before retrying document operations.'],
    [/handleLogout/, 'Log out of 3DEXPERIENCE, close its embedded browser, clear local workspace/search selections, and return to authentication.'],
    [/setTenantUrl/, 'Enter the tenant URL for your 3DEXPERIENCE environment, then supply Client ID and start OAuth authentication.'],
    [/setClientId/, 'Enter the OAuth Client ID provisioned for the intended 3DEXPERIENCE tenant. Connect uses this ID with Tenant URL.'],
    [/browserGoBack/, 'Navigate backwards in the embedded 3DEXPERIENCE browser history. This changes browser navigation rather than the ADIA model.'],
    [/browserGoForward/, 'Navigate forwards in the embedded browser history. This does not push or import model documents.'],
    [/browserReload/, 'Reload the embedded browser page. Authentication/document operations retain their separate status.'],
    [/handleBrowserNavigate|setBrowserUrlInput/, 'Enter or choose the intended platform URL and navigate in the embedded browser. URLs without a scheme receive https://. Navigation does not itself transfer documents.'],
    [/setSelectedWorkspace/, 'Choose the 3DEXPERIENCE workspace for upload/search/synchronization. Verify the destination identity before uploading.'],
    [/fetchWorkspaces/, 'Refresh workspaces from the authenticated service. The first returned workspace is selected when no selection exists.'],
    [/setSelectedExports/, 'Select which available ADIA exports to upload. Unavailable exports are skipped; inspect each export’s format and captured content.'],
    [/handleUpload/, 'Upload selected available exports to the selected workspace. Per-document progress shows done/error. This requires authentication and a selected workspace.'],
    [/handleSearch/, 'Search documents in the selected workspace, returning up to 50 results. Inspect document type/identity before download or import.'],
    [/handleDownload/, 'Download this document. JSON content is decoded and passed to ADIA import; other formats are downloaded as files. Review the resulting import/download status.'],
    [/setSyncItems/, 'Choose the displayed synchronization direction for this item. The current item handler still uploads content and does not implement a general pull workflow; use document download for supported JSON import.'],
    [/handleCapture/, 'Capture the item’s currently rendered diagram element as PNG where a selector exists. Capture can fail when the canvas is unavailable; inspect the item status/preview.'],
    [/handleSyncItem/, 'Synchronize this item to the selected workspace using its current handler. Important limit: this live-item code-generation path supplies placeholder text labelled ZIP, and V-Lab may use placeholder JSON when no export is available. Use the available-export upload path and inspect actual content; this action does not provide a verified firmware bundle or general bidirectional merge.'],
    [/setActiveWidget/, 'Select the platform widget to display, such as dashboard/3DSpace. Widget selection changes the external view rather than transferring ADIA models.'],
    [/3dx-dashboard-open/, 'Open the selected platform widget using the Electron dashboard browser. This requires Electron; the browser action does not alter the ADIA engineering model.'],
    [/window\.open/, 'Open the current platform/widget URL in an external browser tab. Model document transfer remains a separate upload/download action.'],
  );
  if (item.source.includes('/plantuml/')) sourceRules.push(
    [/onAdd|application\/x-adia-plantuml-kind/, 'Click or drag the selected palette kind to add a PlantUML element. Select it afterwards to edit its label and connect it.'],
    [/setDragging|finishDrag/, 'Select/drag this element to change its canvas position. In connection mode, clicking a different target connects source to target. Canvas movement clamps coordinates to zero or above.'],
    [/^\{onSave\}$/, 'Save the current PlantUML diagram through the workspace callback. Project-file saving is a separate action.'],
    [/onExport/, 'Export the current diagram’s PlantUML source text for supported exchange. Inspect the exported source before using another renderer.'],
    [/setSelectedId|onChange/, 'Select an element and edit its Label, or drag/connect it through the canvas. The workspace updates the matching element by its identity rather than duplicating it.'],
  );
  if (item.source.includes('/modelExplorer/')) sourceRules.push(
    [/onSelectCapability/, 'Select an enabled context action to execute it and close the menu. Disabled actions show their reason. Creation/relationship actions depend on selected element kind and owner policy.'],
    [/onStartRename/, 'Select a tree row; double-click opens its context, right-click opens actions, and F2 starts rename when editable. Drag/drop proposes a validated ownership move; inspect its impact confirmation.'],
    [/onToggleExpand/, 'Expand/collapse this tree branch. This changes displayed hierarchy rows without changing semantic ownership.'],
    [/onConfirm\(impactHash\)/, 'Review the proposed ownership move and its impact, then confirm the matching impact hash. If the proposal changes, review it again; confirmation does not bypass semantic rules.'],
    [/handleSubmit/, 'Choose relationship kind and a compatible target, enter an optional name, then Create. The wizard submits through the semantic command gateway and displays validation errors.'],
  );
  if (item.source.endsWith('HardwareSyncModal.tsx')) sourceRules.push([/onSave\(content\)/, 'Save the MCU user-code draft through the supplied callback and close Hardware Sync. This saves/imports the fragment rather than flashing hardware.']);
  if (item.source.endsWith('AiArchitectSidebar.tsx')) sourceRules.push([/onToggle/, 'Open/close the AI Architect sidebar. Configure provider settings and submit a request separately.']);
  if (item.source.endsWith('ResizableSplitPane.tsx')) sourceRules.push([/onToggle/, 'Maximize or restore this panel to inspect detailed visualization. Escape restores the normal view where supported.']);
  if (item.source.endsWith('SoftwareArchitectureExplorer.tsx')) sourceRules.push([/\breset\b/, 'Reset Architecture Explorer selection and view filters to inspect the default architecture map. This explorer is read-only toward engineering state.'], [/setSelectedId/, 'Select an architecture card to inspect its responsibilities, dependencies, data types and safeguards. This does not modify the application model.']);
  if (item.source.endsWith('AllocationMatrix.tsx')) sourceRules.push([/onToggle/, 'Toggle this allocation-kind filter to show the relevant matrix rows/columns. This does not create/delete allocations.']);
  if (item.source.endsWith('BlockPropertiesEditor.tsx')) sourceRules.push([/^\{add\}$/, 'Add a new property to the selected Block definition, then choose its name, kind, type and multiplicity.'], [/\bremove\(/, 'Remove this property from the selected Block definition. Inspect affected usages and references.']);
  if (item.source.endsWith('CreateNewTypeActionPrompt.tsx')) sourceRules.push([/onCreate/, 'Start creating a new compatible type for the pending property. Complete the new-type workflow before applying the property type.']);
  if (item.source.endsWith('IbdConnectorEndpoint.tsx')) sourceRules.push([/handleClick/, 'Select this connector endpoint to inspect/reassign its role or port. Dragging follows the supplied connector interaction callbacks; hover shows endpoint feedback.']);
  if (item.source.endsWith('InteractionElementInspector.tsx')) sourceRules.push([/setDraft/, 'Edit the selected interaction item’s text field and leave it or press Enter to commit. Changes run through the semantic command plan and show rejection diagnostics.'], [/run\(plan/, 'Delete the selected interaction item through its prepared command plan. Review the item identity and semantic diagnostics.']);
  if (item.source.endsWith('RelationshipEndEditor.tsx')) sourceRules.push([/\bcommit\b/, 'Edit the association-end role or multiplicity field. Enter or blur commits; Escape restores the stored value. Review validation messages for rejected semantic changes.']);
  if (item.source.endsWith('TypeSelectionPrompt.tsx')) sourceRules.push([/setSelectedId/, 'Select an existing compatible type from the offered candidates. Confirm applies it to the pending feature; Cancel preserves the current type.'], [/onCreateNewType/, 'Start creating a new compatible type rather than selecting an existing one. Complete creation before confirming the feature type.'], [/onSelectType/, 'Confirm the selected compatible type. The control applies only a valid selection; inspect resulting property/type diagnostics.']);
  if (item.source.endsWith('SequenceWorkspace.tsx')) sourceRules.push([/setAsyncBars/, 'Toggle execution bars for asynchronous messages. This is sequence presentation and does not change stored message kind or execution order.'], [/interactionToPlantUml/, 'Export this Interaction as a .puml source file using supported sequence constructs. Export can fail for unavailable/invalid context; inspect the reported message.']);
  if (item.source.endsWith('UseCaseWorkspace.tsx')) sourceRules.push([/setExtendPrompt/, 'Choose an existing extension point or enter a new name, then describe the Extend condition. These are prompt drafts; Create «extend» commits the supported semantic relationship.']);
  if (item.source.endsWith('VibeDashboard.tsx')) sourceRules.push([/setShowExplain/, 'Open the engine explanation view to inspect its displayed engineering information.'], [/setShowSync/, 'Open Hardware Sync to review/edit the MCU user-code fragment. Saving the fragment and flashing hardware are separate actions.']);
  for (const [pattern, body] of sourceRules) if (pattern.test(h)) return { body };
  if (/setNodes\(\[\]\)|setEdges\(\[\]\)/.test(h)) return { body: 'Confirm clearing the workspace canvas. This removes stored nodes and edges in this workspace; save current work before clearing.' };
  if (/setShowConfirmClear\(true\)/.test(h)) return { body: 'Open the Clear Canvas confirmation. Review/save current work; confirmation removes workspace nodes and edges, while Cancel preserves them.' };
  if (/\bupdateProperty\([^]*?multiplicity:/.test(h)) return { body: fieldGuidance.multiplicity };
  if (/applyLegacyTargetSelection/.test(h)) return { body: 'Choose the legacy HIL target and update its target configuration. Inspect the provisioned target pack and supported toolchain before building.' };
  if (/peripheral:\s*val/.test(h)) return { body: fieldGuidance.peripheral };
  if (/enabled:\s*!config.enabled/.test(h)) return { body: fieldGuidance.enabled };
  if (/onChangeConfig\([^]*?\bchannels\s*\}/.test(h)) return { body: 'Edit configured hardware channels through the Driver panel. The parent stores the updated channel list; review mappings and target compatibility before building.' };
  if (/onChangeConfig\([^]*?\bmappings\s*\}/.test(h)) return { body: 'Edit signal mappings through the Mapper. The parent stores the mapping list; validate direction, conversion and safe values before deployment.' };
  if (/setIsEditingLabel/.test(h)) return { body: 'Start editing this V-Lab node’s display label. Enter or blur commits through the rename handler; the node identity is preserved.' };
  if (/setTimeZoomRange\(null\)/.test(h)) return { body: 'Reset scope time zoom and manual Y-axis overrides to the default view. Retained sampled data remain unchanged.' };
  if (/setActiveCursor|setCursor[12]Time/.test(h)) return { body: 'Select cursor C1/C2 or enter its time. Click a sampled plot position to place the active cursor; compare sampled time/value differences. This measures retained data rather than interpolating a new simulation.' };
  if (/setZoomLevel|reactFlowInstance\?\.(?:zoom|fitView)/.test(h)) return { body: 'Zoom in/out, reset to 100%, or fit the model in the canvas. Viewport changes preserve block parameters and physical network connections.' };
  if (/onExpand\(/.test(h)) return { body: 'Expand this embedded scope into its detailed view to inspect traces/settings. This does not start or rerun simulation.' };
  if (/setNodes\([^]*?(?:newLabel|newName)/.test(h)) return { body: 'Rename the selected V-Lab node or boundary port label. The matching name parameter is updated while node/port identity remains stable.' };
  if (/setMaxGainInput/.test(h)) return { body: fieldGuidance.maxGain };
  if (/handleCanvasMouseClick/.test(h)) return { body: 'Hover a root-locus point to inspect its gain, then click to set the block gain to that point rounded to four decimal places. Recheck the resulting response and stability; plot interaction is not verification evidence.' };
  for (const [name, body] of Object.entries(UI_ACTION_GUIDANCE)) if (new RegExp(`\\b${name}\\b`).test(h)) return { body };
  const key = h.match(/\b(\w+):\s*(?:(?:Number|parseFloat|parseInt|Math\.max)\([^]*?)?(?:!\s*)?(?:e|event)\.target\.(?:value|checked)/)?.[1];
  if (key && fieldGuidance[key]) return { body: fieldGuidance[key], label: cleanLabel || key };
  const setters: Record<string, string> = {
    setApiKey: 'Enter the Gemini API key for the selected provider. Save & Close persists the settings; the key must be valid for the configured provider.',
    setOpenaiApiKey: 'Enter the API key for the selected OpenAI-compatible endpoint. Save & Close persists settings. Endpoint compatibility and connectivity determine available behavior.',
    setOpenaiBaseUrl: 'Enter the base URL of the OpenAI-compatible API endpoint. Save & Close persists the URL; use a reachable endpoint that supports the selected model.',
    setOpenaiModel: 'Enter the model identifier supported by the configured endpoint. This is a provider model name rather than an ADIA engineering model.',
    setLocalBaseUrl: 'Enter the local model-server URL, such as http://localhost:1234. Refresh Models queries this endpoint for available models.',
    setLocalModel: 'Select or enter the model identifier available on the configured local server. Refresh Models first if the list is empty.',
    setAiEngine: 'Choose the AI backend: n8n orchestration, Gemini, OpenAI-compatible API or local model server. Configure that backend’s endpoint/model/key before sending a request.',
    setInput: 'Enter a request in the chat box. This updates the draft; use Send or the supported Enter shortcut to submit it. Review proposals before applying engineering changes.',
    setMessages: 'Clear the current chat display and replace it with the cleared-chat notice. This does not clear engineering models or committed transactions.',
    setActiveModel: 'Choose the DOE surrogate/model variant to inspect or solve. Review the current dataset and solve result for that variant.',
    setContent: 'Paste the MCU user-code fragment to review/import through Hardware Sync. Keep the expected user-code markers; editing the draft does not flash a device.',
    setSelectedVar: 'Choose the model variable to map to hardware. Then select a compatible channel and read/write direction before Map Signal.',
    setSelectedChannel: 'Choose the hardware channel. The mapping editor aligns read/write direction to the channel direction; inspect conversion and safe value before committing.',
    setDirection: 'Choose Read to bring hardware input into the model or Write to send model output to hardware. The chosen channel must support the direction.',
    setConversionExpr: 'Enter the supported mapping conversion expression, for example x * 3.3 / 4095. Check validation and numerical range before applying it to a live channel.',
    setSafeValue: 'Enter the channel safe value, such as 0 or false, in a form compatible with the mapping data type. Map Signal reports invalid safe-value input.',
    setOptimization: 'Choose the target compiler optimization level. This configures the build request; inspect compiler logs and target verification after building.',
    setWarningLevel: 'Choose the compiler warning level for the target build. Resolve relevant compiler diagnostics before deploying.',
    setProgrammer: 'Choose the programmer used for target flashing/erasing. Availability depends on the selected target pack and installed tools.',
    setFlashAddress: 'Enter the target firmware flash address. Use an address supported by the selected target/recipe and inspect flash-policy diagnostics.',
    setSelectedKind: 'Choose the relationship kind to create. Available kinds depend on the source context; choose a compatible target and review validation before submitting.',
    setSelectedTargetId: 'Select the existing target semantic element for the relationship. Review the source, target and relationship kind before Create.',
    setRelationshipName: 'Enter the optional display name for the new relationship, such as driveShaftConnection. The endpoints continue to use stable semantic IDs.',
    setLocalRename: 'Edit the tree row’s name draft. Enter or leaving the field commits where allowed; Escape cancels. Read-only rows cannot be renamed.',
    setConnectSourceId: 'Select a source element, enable connection mode, then click a different target element to create a PlantUML relationship. Toggle connection mode off to return to selection.',
    setZoom: 'Adjust the report preview zoom within its supported 50–150% range. Preview zoom changes display scale and does not recalculate report data.',
    setSelectedReqId: 'Choose the existing Requirement for the state trace link, then choose a supported relationship kind and Add Trace Link.',
    setNewBaselineName: 'Enter a nonblank name for the requirement baseline, then Save to capture it. The name identifies the snapshot for comparison/governance.',
    setWithReply: 'Choose whether creating a synchronous call also creates its reply. The paired reply refers to the call; inspect ordering before simulation/code generation.',
    setShowAsyncExecution: 'Choose whether asynchronous messages show execution bars. This changes sequence presentation, not the message’s stored kind.',
    setStatus: 'Filter requirement traceability rows by the offered lifecycle/traceability status. Filtering does not change requirement status.',
    setOwner: 'Filter traceability rows by their owner. Clear the filter to restore rows; semantic ownership is unchanged.',
    setRisk: 'Filter traceability rows by risk metadata. This affects the displayed matrix only.',
    setCompareBaselineId: 'Choose a saved baseline for comparison with the current requirements. Review changed/added/deleted rows before governance actions.',
    setChangeType: 'Filter baseline comparison rows by the offered change type. The filter does not modify current or captured baseline data.',
    setSelectedTdxWorkspace: 'Choose the 3DEXPERIENCE workspace used for the pending push/pull operation. Check workspace identity before transferring model documents.',
    setViewPath: 'Navigate to an earlier subsystem breadcrumb. This changes the visible subsystem context while preserving its stored blocks and connections.',
    setIsLabGuideMinimized: 'Minimize or restore the learning-lab guide. This changes guide visibility without resetting the model or completed steps.',
    setCurrentStepIndex: 'Navigate to the previous or next learning-lab step. The step transition clears its displayed objective flags; Next completes the lab at the final step when objectives allow it.',
    setSolverType: 'Choose the offered X-Bridges solver. Solver choice changes the simulation integration path; use a step size appropriate to model dynamics and inspect diagnostics.',
    setStepSizeInput: 'Enter the simulation step size using digits and decimal point. The input normalizes numeral characters and removes unsupported characters; inspect the committed value before running.',
    setSimLimitInput: 'Enter the simulation time limit or leave it unlimited where supported. The input normalizes digits and decimal point; check the run configuration before simulation.',
    setEdgeType: 'Choose the wire style/type. This updates existing edge presentation types; it does not change numerical block equations.',
    setSolverConfigTab: 'Choose the solver-configuration tab to inspect timing, tolerances or physical initialization settings. Edit values deliberately and review diagnostics before rerunning.',
    setIsSimulating: 'Start or stop the X-Bridges simulation where this workspace owns execution. When co-simulation owns the run, this local control is disabled/ignored. Inspect run diagnostics and scope outputs.',
    setIsPaused: 'Pause or resume the running simulation. Pause preserves the current simulation state; stopping or resetting has a different scope.',
    setTool: 'Choose a diagram tool, then click the canvas or endpoints as prompted to create/select elements or relationships. Choosing a tool clears the pending connection source and message; semantic changes still pass through command validation.',
    setProposals: 'Discard the inferred semantic proposals and keep the view as drawn. This does not commit the proposed semantic relationship changes.',
    setPortKindOpen: 'Open the port-kind chooser to add a full, proxy, flow or supported port kind. Cancel closes the chooser without adding a port.',
    setPending: 'Cancel the pending allocation deletion prompt. No pending deletion is committed.',
  };
  for (const [name, body] of Object.entries(setters)) if (new RegExp(`\\b${name}\\b`).test(h)) return { body, label: cleanLabel || name.replace(/^set/, '') };
  for (const [name, body] of Object.entries(namedActions)) if (new RegExp(`\\b${name}\\b`).test(h)) return { body };
  if (/^\{(?:onClose|onCancel|onDismiss|props\.onClose)\}$/.test(h.trim()) || /setShow\w+\(false\)/.test(h) || /set(?:ExtendPrompt|PendingDeletion)\(null\)/.test(h)) return { body: 'Close or cancel this panel/prompt. Cancellation does not commit the pending selection or proposed change; existing committed model changes remain.' };
  if (/\bonBack\b/.test(h)) return { body: /persistWorkspace|onSave/.test(h) ? 'Save the current workspace through the provided save callback, then return to the parent workspace. Check project Save separately for writing a file.' : 'Return to the parent workspace. This navigation action does not itself export a project file.' };
  if (/\bzoomBy\(/.test(h)) return { body: 'Adjust diagram viewport zoom by the selected factor. Zoom controls affect display scale and preserve semantic model data.' };
  if (/\bonNavigate\b/.test(h)) return { body: 'Navigate to the selected semantic object to inspect its definition or diagram context. References keep the same object identity; navigation does not create a duplicate.' };
  if (/set(?:Search\w*|Query|FilterQuery)\(/.test(h)) return { body: 'Enter a search term to filter the displayed catalog, actions or rows in this panel. Clear the text to restore the unfiltered list. Filtering does not delete omitted model objects.' };
  if (/set(?:ActiveTab|ActiveMainTab|ActiveFileTab|ActiveSidebarTab|RightTab|ViewMode|PlotType)\(/.test(h)) {
    const value = h.match(/set\w+\(['"]([^'"]+)/)?.[1];
    return { body: `Select ${value ? `the ${value} view` : 'the offered view or tab'} to inspect that panel’s information. Switching view preserves model identities and does not rerun an engineering calculation.`, label: cleanLabel || value };
  }
  if (/set\w+\([^]*?(?:!\w+|prev\s*=>\s*!prev|v\s*=>\s*!v)/.test(h)) return { body: `Toggle ${cleanLabel && !cleanLabel.startsWith('{') ? cleanLabel : 'the selected display option'}. This callback changes the panel’s local display state; inspect the view to see the result.` };
  if (/onViewModeChange\(/.test(h)) return { body: 'Choose Containment Tree for full semantic hierarchy, Diagram Context for the active diagram’s elements, or Search for filtered rows. These are views of existing semantic identities.' };
  if (/onSearchQueryChange\(/.test(h)) return { body: 'Filter the Model Explorer by name or a kind selector such as :Block. Clear Search restores rows without modifying semantic elements.' };
  if (/handleCellChange\(/.test(h)) return { body: 'Enter the numerical factor/response value for this experiment cell. The input parses a floating-point value and falls back to 0 when parsing is invalid. Solve again after modifying data.' };
  if (/updateArrayParam|addArrayParam|removeArrayParam|handleRawArrayInput|handleArrayUpdate/.test(h)) {
    const param = h.match(/(?:updateArrayParam|addArrayParam|removeArrayParam|handleRawArrayInput|handleArrayUpdate)\(['"]([^'"]+)/)?.[1] ?? 'coefficient';
    return { body: `Edit the ${param} array of the selected block. Add creates an array element, remove deletes that element, and scalar editing replaces its numerical value. Raw arrays use bracket syntax such as [1, 2, 1]. Inspect the block reference for coefficient ordering and simulation meaning.`, label: `${param} array` };
  }
  if (/build\w+Command\(/.test(h)) {
    const command = h.match(/\b(build\w+Command)\(/)?.[1];
    const property = h.match(/\b(typeId|representsId|behaviorId|signatureId|connectorId|sort|operator|refersToId|afterMessageId|coveredLifelineIds|toIndex|direction|guard|arguments|operandIndex):/)?.[1];
    const effects: Record<string, string> = {
      typeId: 'Choose the existing classifier type for the selected activity node/pin. None clears the optional reference.',
      representsId: 'Choose the existing element represented by the selected lifeline or partition. None clears the optional reference.',
      behaviorId: 'Choose the called behavior for the selected action. None clears the call reference; selecting a behavior does not automatically run it.',
      signatureId: 'Choose the Signal or Operation signature for this message. Available choices depend on message kind and receiving context. None clears the optional signature.',
      connectorId: 'Choose the connector referenced by the selected sequence message. This records the semantic interaction path rather than creating a simulation wire.',
      sort: 'Choose the message kind, such as synchronous call, asynchronous call/signal or reply. Supported runtime/code-generation behavior is narrower than the stored semantic diagram kinds.',
      operator: 'Choose the fragment operator from the offered alternatives. Use the operand guards to describe branching or iteration; consult sequence runtime limits before executing.',
      refersToId: 'Choose an existing Interaction referenced by this ref frame. The selection records a semantic interaction reference.',
      afterMessageId: 'Choose which message precedes this frame/invariant. None places it before the messages. This changes its order in the interaction view.',
      coveredLifelineIds: 'Toggle whether this ref frame covers the selected lifeline. The command adds or removes that lifeline ID from the semantic covered set.',
      toIndex: 'Move the selected message up or down in the interaction order. Review reply/call ordering and diagnostics after the move.',
      direction: 'Move the selected partition left or right. This updates partition ordering through the activity command plan.',
      guard: 'Enter the fragment operand guard and leave the field to commit. This is stored guard text; executable expressions must satisfy the supported runtime subset.',
      arguments: 'Edit the ref-frame argument text and leave the field to commit. The command updates stored arguments; runtime support is limited to implemented invocation handling.',
      operandIndex: 'Remove the selected fragment operand through the command plan. Review the remaining operand guards and model diagnostics afterwards.',
    };
    if (property && effects[property]) return { body: `${effects[property]} Rejected semantic changes report a diagnostic and are not treated as successful.` };
    if (/buildAddFragmentOperandCommand/.test(command ?? '')) return { body: 'Add an operand to the selected combined fragment, then enter its guard. The command plan validates semantic integrity and reports rejection diagnostics.' };
    if (/buildCreateSignalForMessageCommand/.test(command ?? '')) return { body: 'Create a new Signal and reference it as the selected message signature. Review the created signal and any gateway diagnostics.' };
    if (/buildCreateOperationForMessageCommand/.test(command ?? '')) return { body: 'Create an Operation on the receiving Block and use it as the selected call message signature. Review its parameters and semantic diagnostics.' };
  }
  return undefined;
}

const features: any[] = [];
const topics: Record<string, any> = {};
const reconciliation: any[] = [];
for (const item of items) {
  if (item.source === 'src/App.tsx' || item.source.includes('/entropy/')) continue;
  const h = Object.values(item.handlers).join(' ');
  const result = explain(item);
  const id = `ui:${item.source.replace(/^src\/components\//, '').replace(/\.tsx$/, '')}:${createHash('sha256').update(JSON.stringify([item.tag, item.handlers])).digest('hex').slice(0, 12)}`;
  const duplicate = features.find(feature => feature.id === id);
  const title = (result?.label || item.label).replace(/^["']|["']$/g, '').trim();
  const label = title && !title.startsWith('{') ? title : item.source.split('/').pop()!.replace('.tsx', '') + ' control';
  if (result) {
    if (!duplicate) features.push({ id, label, topicId: id, sectionId: 'use', sourcePath: item.source, kind: /onChange|onBlur/.test(Object.keys(item.handlers).join(' ')) ? 'property' : 'action', module: moduleFor(item.source) });
    topics[id] = { title: `${item.source.split('/').pop()!.replace('.tsx', '')}: ${label}`, category: 'Workspace Controls', description: result.body, content: result.body,
      sections: [{ id: 'use', title: label, body: result.body, sources: [item.source] }], related: [relatedFor[moduleFor(item.source)]], sources: [item.source] };
  }
  const factory = item.source.endsWith('EngineeringPrimitives.tsx') || (item.source.endsWith('ThreeDXGateway.tsx') && h.trim() === '{onClick}');
  const structural = !result && (/\b(?:stopPropagation|preventDefault)\b/.test(h) && !/(?:set[A-Z]|handle[A-Z]|on[A-Z]|add[A-Z]|update|execute|remove|download|connect)/.test(h) || factory);
  reconciliation.push({ candidateId: item.candidateId, sourcePath: item.source, status: result ? 'mapped' : structural ? 'excluded' : 'unreviewed', featureIds: result ? [id] : [],
    reason: result ? duplicate ? 'Duplicate site for the same stable handler identity and instructional destination.' : 'Source-specific instructions grounded in this callback’s selected field/command/action.'
      : factory ? 'Reusable presentation primitive forwards caller-provided handlers; no independent standalone action. Its reachable callers carry semantic instructions.'
      : structural ? 'Event propagation/prevent-default wrapper with no independent user action.' : 'Handler needs further authored semantic instructions; no generic module fallback counted.', sourceEvidence: [item.source, h] });
}
writeFileSync('src/help/uiFeatureTopics.ts', `// Generated by scripts/help/buildUiHelpInventory.ts from source-reviewed callback/field rules.\nimport type { HelpFeature } from './helpFeatures';\nimport type { HelpTopic } from './helpTypes';\nexport const UI_HELP_FEATURES: HelpFeature[] = ${JSON.stringify(features, null, 2)};\nexport const HELP_UI_FEATURE_TOPICS: Record<string, HelpTopic> = ${JSON.stringify(topics, null, 2)};\n`);
writeFileSync('docs/help/audit/ui-controls-reconciliation.json', JSON.stringify({ items: reconciliation }, null, 2));
console.log(JSON.stringify({ features: features.length, mapped: reconciliation.filter(row => row.status === 'mapped').length, excluded: reconciliation.filter(row => row.status === 'excluded').length, unresolved: reconciliation.filter(row => row.status === 'unreviewed').length }));

