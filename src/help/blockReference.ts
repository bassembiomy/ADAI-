import { BLOCK_LIBRARY } from '../engine/xbridges/BlockDefinitions';
import { XBRIDGES_CATEGORIES } from '../utils/xbridges/XbridgesLibrary';
import { VLAB_LIBRARY } from '../utils/vlabLibrary';
import { VLAB_COMPONENT_DEFINITIONS } from '../engine/vlab/vlabComponentDefinitions';
import { DERIVATIVE_DEPENDENT_BLOCK_TYPES } from '../engine/vlab/vlabEquations';
import { BLOCK_EXAMPLES, BLOCK_GUIDANCE, VLAB_RUNTIME_RELATIONS, VLAB_UNUSED_PARAMETERS } from './blockGuidance';
import { getXBlockParameterDescription } from './blockParameterGuidance';
import { physicalParameterDescription } from './physicalParameterGuidance';
import { getXBBlockCapability } from '../utils/stateMachine/xbCapabilities';

export interface BlockHelpParameter {
  name: string; label: string; defaultValue: unknown; unit?: string; description: string;
  bounds?: { min?: number; max?: number; exclusiveMin?: boolean; exclusiveMax?: boolean; nonZero?: boolean };
}
export interface BlockHelpPort {
  id: string; name: string; type?: string; domain?: string; direction: 'input' | 'output' | 'bidirectional';
  /** Palette symbol side; a saved instance may rotate or resize this layout. */
  position?: 'left' | 'right' | 'top' | 'bottom';
  unit?: string; width?: number; channelNames?: string[]; composite?: string; dimensions?: number[]; quantity?: string;
}
export interface BlockHelpDiagram {
  kind: 'flow' | 'sequence' | 'usecase' | 'blocks'; nodes: { id: string; label: string; x?: number; y?: number }[];
  edges: { from: string; to: string; label?: string; notation?: 'conserving' }[]; caption?: string;
}
export interface BlockHelpReference {
  id: string; typeId: string; source: 'X-Bridges' | 'V-Lab'; name: string; category: string;
  /** Exact palette icon key; factory-only types use their factory icon or a generic box. */
  icon: string;
  availability: 'available' | 'factory-only' | 'palette-only';
  description: string; behavior: string; example: string; connection: string; parameters: BlockHelpParameter[];
  inputs: BlockHelpPort[]; outputs: BlockHelpPort[]; ports: BlockHelpPort[]; equation?: string;
  embedded?: { eligible: boolean; description: string };
  across?: string; through?: string;
  diagram: BlockHelpDiagram; sourcePath: string;
  /** Missing authored content is visible and excluded from instructional completeness. */
  documentationGaps: string[];
}
function diagram(name: string, ports: BlockHelpPort[]): BlockHelpDiagram {
  let left=0, right=0;
  const portNodes = ports.map((p,i) => ({id: 'port'+i, label: p.name+'\n('+ (p.type ?? p.domain ?? 'port') +')', x: p.direction === 'output' ? 650 : 100, y: 65 + 85 * (p.direction === 'output' ? right++ : left++)}));
  const nodes = [{id:'block',label:name,x:375,y:65+42.5*(Math.max(left,right,1)-1)}, ...portNodes];
  const edges = ports.map((p,i) => p.direction === 'bidirectional' ? {from:'port'+i,to:'block',notation:'conserving' as const} : {from:p.direction === 'input'?'port'+i:'block',to:p.direction === 'input'?'block':'port'+i});
  return {kind:'blocks',nodes,edges,caption:'Catalog port topology, not a complete simulation model. Plain conserving links impose coupled across/through relations; arrows show signal direction.'};
}
function wiringExample(name: string, ports: BlockHelpPort[], parameters: BlockHelpParameter[]): string {
  const connections = ports.map(p => `${p.name} [${p.id}]: ${p.direction === 'bidirectional' ? `connect to a ${p.domain} conserving network` : p.direction === 'input' ? `supply a ${p.type ?? p.domain} signal` : `observe the ${p.type ?? p.domain} output`}${p.width ? ` with ${p.width} channels` : ''}`).join('; ');
  const values = parameters.map(p => `${p.name}=${JSON.stringify(p.defaultValue)}${p.unit ? ` ${p.unit}` : ''}`).join(', ');
  return `Connection example for ${name}: ${connections || 'place the annotation in the model'}. ${values ? `Initial settings: ${values}.` : 'There are no editable parameters in this registry entry.'}`;
}
function physicalWorkflow(name: string, description: string, relation: string | undefined, ports: BlockHelpPort[], parameters: BlockHelpParameter[]): string {
  const inputs = ports.filter(p => p.direction === 'input');
  const conserving = ports.filter(p => p.direction === 'bidirectional');
  const outputs = ports.filter(p => p.direction === 'output');
  const settings = parameters.map(p => `${p.label} (${p.name})=${JSON.stringify(p.defaultValue)}${p.unit ? ` ${p.unit}` : ''}`).join(', ');
  const commands = inputs.map(p => `drive ${p.name} (${p.id}) with a constant physical signal in ${p.unit ?? p.domain}${p.width ? ` of width ${p.width}, channels ${(p.channelNames ?? []).join('/') || 'in registry order'}` : ''}`).join('; ');
  const topology = conserving.length ? `Connect ${conserving.map(p => `${p.name} (${p.id}, ${p.domain}${p.composite ? ', composite three-phase' : ''})`).join(', ')} into matching-domain networks. Attach a Solver Configuration and the reference required by each conserving domain; electrical and mechanical networks need an explicit reference. Excite the network with a compatible source.` : 'Connect compatible physical-signal producers and consumers to the block ports. If those signals control a conserving network, attach Solver Configuration to that physical network, not to a directed signal line.';
  const observation = outputs.length ? `Route ${outputs.map(p => `${p.name} (${p.id})${p.quantity ? `: ${p.quantity}` : ''}`).join(', ')} to Scope${outputs.some(p => p.width && p.width > 1) ? '; observe all vector channels, not only the first' : ''}` : 'Insert domain-compatible sensors to measure terminal across values and branch through values';
  return `${name} workflow: ${topology} ${commands ? `${commands}. ` : ''}${settings ? `Start with ${settings}. ` : ''}${observation}. ${relation ? `Compare the measured response with ${relation.replace(/\\n/g, '; ')}.` : `Check the documented behavior: ${description}`} ${parameters.length ? `Vary ${parameters[0].label} within its declared bounds and compare its effect in the relation.` : 'Vary the driving signal/source and compare the observed connection behavior.'}`;
}
function embeddedGuidance(typeId: string): NonNullable<BlockHelpReference['embedded']> {
  const capability = getXBBlockCapability(typeId);
  if (!capability?.codegen) return {
    eligible: false,
    description: `Not supported by the State Machine embedded C pipeline: ${capability?.reason ?? 'no embedded capability profile is registered'}. This does not prevent separate X-Bridges workspace simulation.`,
  };
  const inputs = (capability.inputShapes ?? capability.shapes).join(', ');
  const outputs = (capability.outputShapes ?? capability.shapes).join(', ');
  return {
    eligible: true,
    description: `Eligible for State Machine embedded X-Bridges C generation with supported input shapes (${inputs || 'none'}) and output shapes (${outputs || 'none'}). ${capability.requiredTargetCapabilities?.length ? `The selected target also needs ${capability.requiredTargetCapabilities.join(', ')}. ` : ''}Eligibility is conditional on graph validation, solver step, mappings, dimensions, target limits and verification; it is not a deployment guarantee.`,
  };
}

function connectionGuidance(source: BlockHelpReference['source'], ports: BlockHelpPort[]): string {
  if (source === 'X-Bridges') return ports.length
    ? 'Connect an output to a compatible input by its exact port ID, not by the display label or drawn location. Check signal type, dimensions, unit, frame and sample-rate diagnostics where those attributes are declared. Configure variable port counts before wiring and validate feedback paths; a pure direct-feedthrough cycle may be unsupported by the embedded graph.'
    : 'This item has no connection ports. Use its documented properties or annotation behavior; it cannot be inserted into a signal path.';
  const conserving = ports.some(port => port.direction === 'bidirectional');
  const signal = ports.some(port => port.direction !== 'bidirectional');
  return [
    conserving ? 'Connect conserving terminals only to compatible domains (and composite ports only to matching composites). These undirected nets couple across and through quantities; they are not signal arrows.' : '',
    signal ? 'Connect physical-signal outputs to compatible inputs, with exactly matching vector widths. One output may fan out; each input has one driver. Scope/probe inputs require a measurable signal output.' : '',
    conserving ? 'Place Solver Configuration on the relevant conserving network and add any required domain reference.' : 'If these signals drive a conserving network, configure that physical network and its references separately; Solver Configuration is not a directed signal input.',
    'Validate wiring, parameters, initialization and solver diagnostics before interpreting results.',
  ].filter(Boolean).join(' ');
}

export function getBlockHelpReferences(): BlockHelpReference[] {
  const palette = new Map(XBRIDGES_CATEGORIES.flatMap(c => c.blocks.map(b => [b.type, { name: b.label, category: c.name, icon: b.icon }] as const)));
  const signal = Object.entries(BLOCK_LIBRARY).map(([typeId, factory]): BlockHelpReference => {
    // Factory construction reads defaults only. Never execute simulation or mutate model state.
    const b = factory(`help:${typeId}`, {});
    const id = `xbridges:${typeId}`;
    const guidance = BLOCK_GUIDANCE[id];
    const name = palette.get(typeId)?.name ?? typeId;
    const ports: BlockHelpPort[] = [...b.inputs, ...b.outputs].map(p => ({ id: p.id, name: p.name, type: p.type, direction: p.direction, position: p.position ?? (p.direction === 'input' ? 'left' : 'right'), unit: p.unit, dimensions: p.dimensions ? [...p.dimensions] : undefined }));
    const parameters = Object.entries(b.params).map(([name, defaultValue]) => ({ name, label: name, defaultValue: structuredClone(defaultValue), description: guidance?.parameters?.[name] ?? getXBlockParameterDescription(typeId, name) ?? `Factory setting ${name}; default ${JSON.stringify(defaultValue)}. Parameter-specific interpretation still requires review.` }));
    const description = guidance?.description ?? b.description ?? (b.equation ? `Signal operation: ${b.equation}.` : 'Purpose documentation is pending source review.');
    const equation = guidance?.equation ?? b.equation;
    const status = `${b.evaluateDerivatives ? ' Continuous derivatives are evaluated by the selected solver.' : ''}${b.isStateful ? ' Retains internal state between simulation steps.' : ''}${b.allowDynamicInputs ? ' Input port count is configurable.' : ''}${b.allowDynamicOutputs ? ' Output port count is configurable.' : ''}`;
    const documentationGaps = [];
    if (!guidance && !b.description && !b.equation) documentationGaps.push('purpose and execution behavior');
    if (!guidance?.example && !BLOCK_EXAMPLES[typeId]) documentationGaps.push('worked example (connection example supplied)');
    if (parameters.some(p => !(guidance?.parameters?.[p.name] ?? getXBlockParameterDescription(typeId, p.name)))) documentationGaps.push('parameter-specific interpretation');
    return { id, typeId, source: 'X-Bridges', name, category: palette.get(typeId)?.category ?? 'Other',
      icon: palette.get(typeId)?.icon ?? b.icon ?? 'box', availability: palette.has(typeId) ? 'available' : 'factory-only', description,
      behavior: (guidance?.behavior ?? description) + (equation ? ` Relation: ${equation}.` : '') + status,
      example: guidance?.example ?? BLOCK_EXAMPLES[typeId] ?? wiringExample(name, ports, parameters), connection: connectionGuidance('X-Bridges', ports), parameters, ports,
      inputs: ports.filter(p => p.direction === 'input'), outputs: ports.filter(p => p.direction === 'output'), equation,
      embedded: embeddedGuidance(typeId), diagram: diagram(name, ports), sourcePath: 'src/engine/xbridges/BlockDefinitions.ts', documentationGaps };
  });
  const physical = VLAB_LIBRARY.flatMap(domain => domain.blocks.map((b): BlockHelpReference => {
    const id = `vlab:${b.id}`;
    const guidance = BLOCK_GUIDANCE[id];
    const definition = VLAB_COMPONENT_DEFINITIONS[b.id];
    const parameterRelation = VLAB_RUNTIME_RELATIONS[b.id] ?? definition?.equations.join('; ');
    const ports: BlockHelpPort[] = b.ports.map(p => ({ id: p.id, name: p.label ?? p.id, domain: p.domain ?? domain.type,
      direction: p.direction === 'in' ? 'input' : p.direction === 'out' ? 'output' : 'bidirectional', position: p.pos, unit: p.unit,
      width: p.width, channelNames: p.channelNames ? [...p.channelNames] : undefined, composite: p.composite, quantity: p.quantity }));
    const parameters: BlockHelpParameter[] = Object.entries(b.params).map(([name, p]) => ({ name, label: p.label, defaultValue: p.value, unit: p.unit,
      description: (guidance?.parameters?.[name] ?? physicalParameterDescription(name, p.label, p.unit, parameterRelation)) + (VLAB_UNUSED_PARAMETERS[b.id]?.includes(name) ? ' This catalog setting is not read by the current component residual; changing it does not change that runtime relation.' : ''),
      bounds: { min: p.min, max: p.max, exclusiveMin: p.exclusiveMin, exclusiveMax: p.exclusiveMax, nonZero: p.nonZero } }));
    const description = guidance?.description ?? (b.description && !/^Physical component model/.test(b.description) ? b.description : definition?.description) ?? b.description ?? 'Purpose documentation is pending source review.';
    const equation = VLAB_RUNTIME_RELATIONS[b.id] ?? (!/governing physical equation/.test(b.equation ?? '') && b.equation ? b.equation : definition?.equations.join('\n'));
    const behavior = guidance?.behavior ?? `${description}${equation ? ` Relation: ${equation}.` : ''}${DERIVATIVE_DEPENDENT_BLOCK_TYPES.has(b.id) ? ' Uses derivatives or discrete history; the network solver must advance the dynamic solution.' : ''}`;
    return { id, typeId: b.id, source: 'V-Lab', name: b.name, category: `${domain.type} / ${b.category ?? 'Components'}`, icon: b.icon, availability: 'available', description, behavior,
      example: guidance?.example ?? physicalWorkflow(b.name, description, equation, ports, parameters), connection: connectionGuidance('V-Lab', ports), parameters, ports, inputs: ports.filter(p => p.direction === 'input'), outputs: ports.filter(p => p.direction === 'output'), equation,
      diagram: diagram(b.name, ports), across: definition?.across, through: definition?.through, sourcePath: 'src/utils/vlabLibrary.ts', documentationGaps: [] };
  }));
  const paletteOnly = [...palette.entries()]
    .filter(([typeId]) => !Object.prototype.hasOwnProperty.call(BLOCK_LIBRARY, typeId))
    .map(([typeId, entry]): BlockHelpReference => ({
      id: `xbridges:${typeId}`, typeId, source: 'X-Bridges', name: entry.name, category: entry.category,
      icon: entry.icon, availability: 'palette-only',
      description: `Listed in the X-Bridges palette, but ${typeId} has no BLOCK_LIBRARY factory in this version.`,
      behavior: 'Not executable through normal X-Bridges palette insertion because no block factory is registered. No runtime ports, parameters or equation are asserted by this reference.',
      example: 'Search this palette item to identify it, then choose a supported factory-backed block or explicitly build the equivalent signal operation after checking units, limits and singularities. Validate and run that replacement; do not rely on the unavailable item.',
      connection: 'No factory ports exist to wire in the normal X-Bridges workspace. The palette glyph is shown for identification only.',
      parameters: [], ports: [], inputs: [], outputs: [],
      embedded: { eligible: false, description: 'Not available for normal insertion or State Machine embedded C generation from this palette entry; a separate capability name does not supply the missing X-Bridges factory.' },
      diagram: diagram(entry.name, []), sourcePath: 'src/utils/xbridges/XbridgesLibrary.ts', documentationGaps: [],
    }));
  return [...signal, ...paletteOnly, ...physical];
}
export function getBlockHelpGaps() {
  return {
    paletteOnly: [...new Set(XBRIDGES_CATEGORIES.flatMap(c => c.blocks.map(b => b.type)))].filter(type => !BLOCK_LIBRARY[type]).sort(),
    instructional: getBlockHelpReferences().filter(b => b.documentationGaps.length).map(b => ({ id: b.id, gaps: b.documentationGaps })),
  };
}
