import type { ModelDiagramDefinition, SysmlRepository } from '../engine/sysml/model';

export type DiagramWorkspaceTab =
  | { kind: 'sysmlDiagram'; diagramId: string }
  | { kind: 'stateMachineDiagram'; diagramId: string; contextRegionId: string }
  | { kind: 'module'; mode: string };

export interface DiagramWorkspaceDiagnostic {
  code: 'STALE_DIAGRAM_TAB';
  message: string;
  tabId?: string;
}

export interface DiagramWorkspaceState {
  tabs: DiagramWorkspaceTab[];
  activeTab: DiagramWorkspaceTab | null;
}

type DefaultDiagramSpec = Pick<ModelDiagramDefinition, 'id' | 'name' | 'diagramKind' | 'ownerId'>;

const DEFAULTS: readonly DefaultDiagramSpec[] = [
  { id: 'adia-default-bdd', name: 'Main SysML BDD', diagramKind: 'bdd' as const, ownerId: 'model' },
  { id: 'adia-default-requirements', name: 'Main Requirements Diagram', diagramKind: 'requirements' as const, ownerId: 'model' },
];

/** Legacy mode-only tab labels resolved once to their default exact-ID diagram. */
const LEGACY_TAB_TO_DIAGRAM_KIND: Readonly<Record<string, ModelDiagramDefinition['diagramKind']>> = {
  bdd: 'bdd',
  requirements: 'requirements',
  package: 'package',
  rtm: 'rtm',
};

export function ensureDefaultSysmlDiagrams(repository: SysmlRepository): {
  repository: SysmlRepository;
  createdDiagramIds: string[];
} {
  const diagrams: SysmlRepository['diagrams'] = { ...repository.diagrams };
  const createdDiagramIds: string[] = [];
  for (const spec of DEFAULTS) {
    const exists = Object.values(diagrams).some(
      (d) => d.diagramKind === spec.diagramKind && d.ownerId === spec.ownerId,
    );
    if (!exists) {
      diagrams[spec.id] = { ...spec, kind: 'diagram', namespace: ['model'] };
      createdDiagramIds.push(spec.id);
    }
  }
  return {
    repository: createdDiagramIds.length > 0 ? { ...repository, diagrams } : repository,
    createdDiagramIds,
  };
}

function workspaceTabKey(tab: DiagramWorkspaceTab): string {
  return tab.kind === 'module' ? `module:${tab.mode}` : `${tab.kind}:${tab.diagramId}`;
}

export function openDiagramWorkspaceTab(
  tabs: readonly DiagramWorkspaceTab[],
  tab: DiagramWorkspaceTab,
): DiagramWorkspaceTab[] {
  return tabs.some((existing) => workspaceTabKey(existing) === workspaceTabKey(tab))
    ? [...tabs]
    : [...tabs, tab];
}

/** Keep the State Machine workspace available when the last diagram is closed. */
export function ensureDefaultStateMachineWorkspaceFile<T extends { id: string; type: string }>(
  files: T[],
  createDefault: () => T,
): { files: T[]; file: T } {
  const existing = files.find(file => file.id === 'default_sm') ??
    files.find(file => file.type === 'statemachine');
  if (existing) return { files, file: existing };

  const file = createDefault();
  return { files: [...files, file], file };
}

/** Remove a workspace diagram tab and select the right neighbor at its index,
 * falling back to the preceding tab when the closed tab was last. */
export function closeDiagramWorkspaceTab(
  tabs: readonly DiagramWorkspaceTab[],
  activeTab: DiagramWorkspaceTab | null,
  diagramId: string,
): DiagramWorkspaceState {
  const closedIndex = tabs.findIndex((tab) => ('diagramId' in tab ? tab.diagramId : tab.mode) === diagramId);
  if (closedIndex < 0) return { tabs: [...tabs], activeTab };

  const remaining = tabs.filter((_, index) => index !== closedIndex);
  const closedWasActive = activeTab !== null && workspaceTabKey(activeTab) === workspaceTabKey(tabs[closedIndex]);
  return {
    tabs: remaining,
    activeTab: closedWasActive
      ? remaining[closedIndex] ?? remaining[closedIndex - 1] ?? null
      : activeTab,
  };
}

function findDefaultDiagramId(
  repository: Pick<SysmlRepository, 'diagrams'>,
  diagramKind: ModelDiagramDefinition['diagramKind'],
): string | null {
  const candidates = Object.values(repository.diagrams).filter((d) => d.diagramKind === diagramKind);
  if (candidates.length === 0) return null;
  const preferred = candidates.find((d) => d.id === `adia-default-${diagramKind}`);
  return (preferred ?? candidates[0]).id;
}

function resolveRawTab(
  repository: Pick<SysmlRepository, 'diagrams'>,
  raw: string | DiagramWorkspaceTab,
): { tab: DiagramWorkspaceTab | null; diagnostic: DiagramWorkspaceDiagnostic | null } {
  if (typeof raw !== 'string') {
    if (raw.kind === 'sysmlDiagram') {
      if (repository.diagrams[raw.diagramId]) return { tab: raw, diagnostic: null };
      return {
        tab: null,
        diagnostic: {
          code: 'STALE_DIAGRAM_TAB',
          message: `Diagram tab '${raw.diagramId}' no longer exists and was discarded.`,
          tabId: raw.diagramId,
        },
      };
    }
    return { tab: raw, diagnostic: null };
  }
  if (repository.diagrams[raw]) {
    return { tab: { kind: 'sysmlDiagram', diagramId: raw }, diagnostic: null };
  }
  const legacyKind = LEGACY_TAB_TO_DIAGRAM_KIND[raw];
  if (legacyKind) {
    const diagramId = findDefaultDiagramId(repository, legacyKind);
    if (diagramId) return { tab: { kind: 'sysmlDiagram', diagramId }, diagnostic: null };
  }
  return {
    tab: null,
    diagnostic: {
      code: 'STALE_DIAGRAM_TAB',
      message: `Diagram tab '${raw}' is stale and was discarded.`,
      tabId: raw,
    },
  };
}

export function normalizeDiagramWorkspace(
  repository: Pick<SysmlRepository, 'diagrams'>,
  rawTabs: readonly (string | DiagramWorkspaceTab)[],
  rawActiveTab?: string | DiagramWorkspaceTab | null,
): DiagramWorkspaceState & { diagnostics: DiagramWorkspaceDiagnostic[] } {
  const tabs: DiagramWorkspaceTab[] = [];
  const diagnostics: DiagramWorkspaceDiagnostic[] = [];
  for (const raw of rawTabs) {
    const { tab, diagnostic } = resolveRawTab(repository, raw);
    if (diagnostic) diagnostics.push(diagnostic);
    if (tab && !tabs.some((existing) => workspaceTabKey(existing) === workspaceTabKey(tab))) {
      tabs.push(tab);
    }
  }
  if (tabs.length === 0) {
    const fallbackId = findDefaultDiagramId(repository, 'bdd');
    if (fallbackId) {
      tabs.push({ kind: 'sysmlDiagram', diagramId: fallbackId });
    }
  }
  let activeTab: DiagramWorkspaceTab | null = null;
  if (rawActiveTab !== undefined && rawActiveTab !== null) {
    const { tab, diagnostic } = resolveRawTab(repository, rawActiveTab);
    if (diagnostic) diagnostics.push(diagnostic);
    if (tab) {
      activeTab = tabs.find((existing) => workspaceTabKey(existing) === workspaceTabKey(tab)) ?? null;
    }
  }
  if (!activeTab) {
    activeTab = tabs[0] ?? null;
  }
  return { tabs, activeTab, diagnostics };
}
