import type { SysmlRepository } from '../../engine/sysml/model';

/** SysML 1.6 Annex A diagram kind abbreviations used in frame headers. */
const DIAGRAM_KIND_ABBREVIATIONS: Record<string, string> = {
  package: 'pkg',
  bdd: 'bdd',
  ibd: 'ibd',
  requirements: 'req',
  rtm: 'req',
  parametric: 'par',
  stateMachine: 'stm',
  useCase: 'uc',
  activity: 'act',
  sequence: 'sd',
};

export function diagramKindAbbreviation(diagramKind: string): string {
  return DIAGRAM_KIND_ABBREVIATIONS[diagramKind] ?? diagramKind;
}

/** Metaclass of the diagram's context element, as shown in the frame header. */
function contextMetaclass(repo: SysmlRepository, contextId: string): string {
  if (contextId === 'model') return 'Model';
  if (repo.packages[contextId]) return 'Package';
  const definition = repo.definitions[contextId];
  if (definition?.kind === 'block') return 'Block';
  if (definition?.kind === 'interface') return 'Interface Block';
  if (definition?.kind === 'valueType') return 'Value Type';
  if (definition?.kind === 'activity') return 'Activity';
  if (definition?.kind === 'interaction') return 'Interaction';
  if (repo.requirements[contextId]) return 'Requirement';
  return 'Element';
}

function contextName(repo: SysmlRepository, contextId: string): string {
  return repo.packages[contextId]?.name
    ?? repo.definitions[contextId]?.name
    ?? repo.requirements[contextId]?.name
    ?? (contextId === 'model' ? 'Model' : 'Element');
}

/**
 * SysML frame header: `<kind> [<context metaclass>] <context name> [<diagram name>]`,
 * e.g. `pkg [Package] Power Subsystem [Structure]`. Undefined when the diagram is unknown.
 */
export function diagramFrameLabel(repo: SysmlRepository, diagramId: string): string | undefined {
  const diagram = repo.diagrams[diagramId];
  if (!diagram) return undefined;
  const contextId = diagram.contextElementId ?? diagram.ownerId ?? 'model';
  return `${diagramKindAbbreviation(diagram.diagramKind)} [${contextMetaclass(repo, contextId)}] ${contextName(repo, contextId)} [${diagram.name}]`;
}
