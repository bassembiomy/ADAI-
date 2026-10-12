import { BLOCK_LIBRARY } from '../engine/xbridges/BlockDefinitions';
import { XBRIDGES_CATEGORIES } from '../utils/xbridges/XbridgesLibrary';
import { VLAB_LIBRARY } from '../utils/vlabLibrary';
import { VLAB_COMPONENT_DEFINITIONS } from '../engine/vlab/vlabComponentDefinitions';
import { DERIVATIVE_DEPENDENT_BLOCK_TYPES } from '../engine/vlab/vlabEquations';
import { BLOCK_EXAMPLES, BLOCK_GUIDANCE, VLAB_RUNTIME_RELATIONS, VLAB_UNUSED_PARAMETERS } from './blockGuidance';
import { getXBlockParameterDescription } from './blockParameterGuidance';
import { physicalParameterDescription } from './physicalParameterGuidance';

export interface BlockHelpParameter {
  name: string; label: string; defaultValue: unknown; unit?: string; description: string;
  bounds?: { min?: number; max?: number; exclusiveMin?: boolean; exclusiveMax?: boolean; nonZero?: boolean };
}
export interface BlockHelpPort {
  id: string; name: string; type?: string; domain?: string; direction: 'input' | 'output' | 'bidirectional';
  unit?: string; width?: number; channelNames?: string[]; composite?: string; dimensions?: number[]; quantity?: string;
}
export interface BlockHelpDiagram {
  kind: 'flow' | 'sequence' | 'usecase' | 'blocks'; nodes: { id: string; label: string; x?: number; y?: number }[];
  edges: { from: string; to: string; label?: string; notation?: 'conserving' }[]; caption?: string;
}
export interface BlockHelpReference {
  id: string; typeId: string; source: 'X-Bridges' | 'V-Lab'; name: string; category: string;
  description: string; behavior: string; example: string; parameters: BlockHelpParameter[];
  inputs: BlockHelpPort[]; outputs: BlockHelpPort[]; ports: BlockHelpPort[]; equation?: string;
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
  const topology = conserving.length ? `Connect ${conserving.map(p => `${p.name} (${p.id}, ${p.domain}${p.composite ? ', composite three-phase' : ''})`).join(', ')} into matching-domain networks. Attach a Solver Configuration and the reference required by each conserving domain; electrical and mechanical networks need an explicit reference. Excite the network with a compatible source.` : 'Connect a Solver Configuration to the signal network when running a V-Lab simulation.';
  const observation = outputs.length ? `Route ${outputs.map(p => `${p.name} (${p.id})${p.quantity ? `: ${p.quantity}` : ''}`).join(', ')} to Scope${outputs.some(p => p.width && p.width > 1) ? '; observe all vector channels, not only the first' : ''}` : 'Insert domain-compatible sensors to measure terminal across values and branch through values';
  return `${name} workflow: ${topology} ${commands ? `${commands}. ` : ''}${settings ? `Start with ${settings}. ` : ''}${observation}. ${relation ? `Compare the measured response with ${relation.replace(/\\n/g, '; ')}.` : `Check the documented behavior: ${description}`} ${parameters.length ? `Vary ${parameters[0].label} within its declared bounds and compare its effect in the relation.` : 'Vary the driving signal/source and compare the observed connection behavior.'}`;
}
export function getBlockHelpReferences(): BlockHelpReference[] {
  const palette = new Map(XBRIDGES_CATEGORIES.flatMap(c => c.blocks.map(b => [b.type, { name: b.label, category: c.name }] as const)));
  const signal = Object.entries(BLOCK_LIBRARY).map(([typeId, factory]): BlockHelpReference => {
    // Factory construction reads defaults only. Never execute simulation or mutate model state.
    const b = factory(`help:${typeId}`, {});
    const id = `xbridges:${typeId}`;
    const guidance = BLOCK_GUIDANCE[id];
    const name = palette.get(typeId)?.name ?? typeId;
    const ports: BlockHelpPort[] = [...b.inputs, ...b.outputs].map(p => ({ id: p.id, name: p.name, type: p.type, direction: p.direction, unit: p.unit, dimensions: p.dimensions ? [...p.dimensions] : undefined }));
    const parameters = Object.entries(b.params).map(([name, defaultValue]) => ({ name, label: name, defaultValue: structuredClone(defaultValue), description: guidance?.parameters?.[name] ?? getXBlockParameterDescription(typeId, name) ?? `Factory setting ${name}; default ${JSON.stringify(defaultValue)}. Parameter-specific interpretation still requires review.` }));
    const description = guidance?.description ?? b.description ?? (b.equation ? `Signal operation: ${b.equation}.` : 'Purpose documentation is pending source review.');
    const equation = guidance?.equation ?? b.equation;
    const status = `${b.evaluateDerivatives ? ' Continuous derivatives are evaluated by the selected solver.' : ''}${b.isStateful ? ' Retains internal state between simulation steps.' : ''}${b.allowDynamicInputs ? ' Input port count is configurable.' : ''}${b.allowDynamicOutputs ? ' Output port count is configurable.' : ''}`;
    const documentationGaps = [];
    if (!guidance && !b.description && !b.equation) documentationGaps.push('purpose and execution behavior');
    if (!guidance?.example && !BLOCK_EXAMPLES[typeId]) documentationGaps.push('worked example (connection example supplied)');
    if (parameters.some(p => !(guidance?.parameters?.[p.name] ?? getXBlockParameterDescription(typeId, p.name)))) documentationGaps.push('parameter-specific interpretation');
    return { id, typeId, source: 'X-Bridges', name, category: palette.get(typeId)?.category ?? 'Other', description,
      behavior: (guidance?.behavior ?? description) + (equation ? ` Relation: ${equation}.` : '') + status,
      example: guidance?.example ?? BLOCK_EXAMPLES[typeId] ?? wiringExample(name, ports, parameters), parameters, ports,
      inputs: ports.filter(p => p.direction === 'input'), outputs: ports.filter(p => p.direction === 'output'), equation,
      diagram: diagram(name, ports), sourcePath: 'src/engine/xbridges/BlockDefinitions.ts', documentationGaps };
  });
  const physical = VLAB_LIBRARY.flatMap(domain => domain.blocks.map((b): BlockHelpReference => {
    const id = `vlab:${b.id}`;
    const guidance = BLOCK_GUIDANCE[id];
    const definition = VLAB_COMPONENT_DEFINITIONS[b.id];
    const parameterRelation = VLAB_RUNTIME_RELATIONS[b.id] ?? definition?.equations.join('; ');
    const ports: BlockHelpPort[] = b.ports.map(p => ({ id: p.id, name: p.label ?? p.id, domain: p.domain ?? domain.type,
      direction: p.direction === 'in' ? 'input' : p.direction === 'out' ? 'output' : 'bidirectional', unit: p.unit,
      width: p.width, channelNames: p.channelNames ? [...p.channelNames] : undefined, composite: p.composite, quantity: p.quantity }));
    const parameters: BlockHelpParameter[] = Object.entries(b.params).map(([name, p]) => ({ name, label: p.label, defaultValue: p.value, unit: p.unit,
      description: (guidance?.parameters?.[name] ?? physicalParameterDescription(name, p.label, p.unit, parameterRelation)) + (VLAB_UNUSED_PARAMETERS[b.id]?.includes(name) ? ' This catalog setting is not read by the current component residual; changing it does not change that runtime relation.' : ''),
      bounds: { min: p.min, max: p.max, exclusiveMin: p.exclusiveMin, exclusiveMax: p.exclusiveMax, nonZero: p.nonZero } }));
    const description = guidance?.description ?? (b.description && !/^Physical component model/.test(b.description) ? b.description : definition?.description) ?? b.description ?? 'Purpose documentation is pending source review.';
    const equation = VLAB_RUNTIME_RELATIONS[b.id] ?? (!/governing physical equation/.test(b.equation ?? '') && b.equation ? b.equation : definition?.equations.join('\n'));
    const behavior = guidance?.behavior ?? `${description}${equation ? ` Relation: ${equation}.` : ''}${DERIVATIVE_DEPENDENT_BLOCK_TYPES.has(b.id) ? ' Uses derivatives or discrete history; the network solver must advance the dynamic solution.' : ''}`;
    return { id, typeId: b.id, source: 'V-Lab', name: b.name, category: `${domain.type} / ${b.category ?? 'Components'}`, description, behavior,
      example: guidance?.example ?? physicalWorkflow(b.name, description, equation, ports, parameters), parameters, ports, inputs: ports.filter(p => p.direction === 'input'), outputs: ports.filter(p => p.direction === 'output'), equation,
      diagram: diagram(b.name, ports), across: definition?.across, through: definition?.through, sourcePath: 'src/utils/vlabLibrary.ts', documentationGaps: [] };
  }));
  return [...signal, ...physical];
}
export function getBlockHelpGaps() {
  return {
    paletteOnly: [...new Set(XBRIDGES_CATEGORIES.flatMap(c => c.blocks.map(b => b.type)))].filter(type => !BLOCK_LIBRARY[type]).sort(),
    instructional: getBlockHelpReferences().filter(b => b.documentationGaps.length).map(b => ({ id: b.id, gaps: b.documentationGaps })),
  };
}
