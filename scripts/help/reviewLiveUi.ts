/** Authoring tool for the additional source sites reviewed on 2026-10-06.
 * Not run by coverage: new controls require a new review, never automatic acceptance.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { LIVE_UI_FEATURES, LIVE_UI_TOPICS } from '../../src/help/liveUiTopics';
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
  if (/handleHorizontalToolbarWheel/.test(h)) {
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
