import type { SysmlRepository } from '../engine/sysml/model';

export interface DiagramNavigationStackEntry {
  diagramId: string;
  diagramKind: string;
  contextElementId?: string;
  name?: string;
}

export interface DiagramNavigationState {
  activeDiagramId: string;
  diagramKind: string;
  contextElementId?: string;
  returnStack: DiagramNavigationStackEntry[];
}

/**
 * Legacy-compatible initial seed. The 'bdd' defaults predate exact-ID
 * navigation and do NOT reference a real repository diagram: callers must
 * flow the result through {@link recoverNavigationState} (self-heal) before
 * use so the active ID resolves to a real diagram ID or IBD block context.
 * The App.tsx recovery effect already does this on every repository change.
 * Signatures are unchanged for caller compatibility.
 */
export function createInitialNavigationState(initial?: Partial<DiagramNavigationState>): DiagramNavigationState {
  return {
    activeDiagramId: initial?.activeDiagramId ?? 'bdd',
    diagramKind: initial?.diagramKind ?? 'bdd',
    contextElementId: initial?.contextElementId,
    returnStack: initial?.returnStack ? [...initial.returnStack] : [],
  };
}

export function openExactDiagram(
  state: DiagramNavigationState,
  repo: Pick<SysmlRepository, 'diagrams' | 'definitions'>,
  diagramId: string,
  diagramKind?: string,
  options?: { preserveReturnStack?: boolean },
): DiagramNavigationState {
  const existingDiagram = repo.diagrams[diagramId];
  // Kind resolves from the real diagram record, an explicit caller override,
  // or the current state — never by echoing the requested ID. The previous
  // pseudo-ID inference (treating an unknown 'bdd'/'package'/… ID as its own
  // kind) fabricated kinds for dangling targets. Behavior-compatible: the
  // live caller (App.tsx diagram double-click) only passes real diagram IDs,
  // which resolve via existingDiagram exactly as before.
  const resolvedKind = existingDiagram?.diagramKind ?? diagramKind ?? state.diagramKind;

  return {
    activeDiagramId: diagramId,
    diagramKind: resolvedKind,
    contextElementId: undefined,
    returnStack: options?.preserveReturnStack ? state.returnStack : [],
  };
}

export function enterBlockContext(
  state: DiagramNavigationState,
  repo: Pick<SysmlRepository, 'diagrams' | 'definitions'>,
  blockId: string,
): DiagramNavigationState {
  const block = repo.definitions[blockId];
  if (!block || block.kind !== 'block') {
    return state;
  }

  const originEntry: DiagramNavigationStackEntry = {
    diagramId: state.activeDiagramId,
    diagramKind: state.diagramKind,
    contextElementId: state.contextElementId,
    name: repo.diagrams[state.activeDiagramId]?.name ?? state.activeDiagramId,
  };

  return {
    activeDiagramId: blockId,
    diagramKind: 'ibd',
    contextElementId: blockId,
    returnStack: [...state.returnStack, originEntry],
  };
}

export function navigateRoot(
  state: DiagramNavigationState,
  repo: Pick<SysmlRepository, 'diagrams' | 'definitions'>,
): DiagramNavigationState {
  if (state.returnStack.length > 0) {
    const rootOrigin = state.returnStack[0];
    // Only real repository diagrams are valid return targets. Legacy
    // mode-only pseudo-IDs ('bdd', 'requirements', 'rtm', 'package') never
    // resolve to a diagram and fall through to exact-ID recovery below.
    const isRootValid = Boolean(repo.diagrams[rootOrigin.diagramId]);
    if (isRootValid) {
      return {
        activeDiagramId: rootOrigin.diagramId,
        diagramKind: rootOrigin.diagramKind,
        contextElementId: undefined,
        returnStack: [],
      };
    }
  }

  // No valid root origin: seed recovery with a real repository diagram
  // (default BDD first, preserving the previous fallback priority) — never
  // the 'bdd' pseudo-ID literal. With an empty repository there is no seed
  // and the caller's state flows through recovery unchanged (see below).
  const seedDiagram = Object.values(repo.diagrams).find(d => d.id === 'adia-default-bdd')
    ?? Object.values(repo.diagrams).find(d => d.diagramKind === 'bdd')
    ?? Object.values(repo.diagrams)[0];
  if (!seedDiagram && state.diagramKind === 'ibd' &&
    (Boolean(state.contextElementId && repo.definitions[state.contextElementId]) ||
      Boolean(repo.definitions[state.activeDiagramId]))) {
    return {
      activeDiagramId: 'bdd',
      diagramKind: 'bdd',
      contextElementId: undefined,
      returnStack: [],
    };
  }
  return recoverNavigationState(
    seedDiagram
      ? {
        activeDiagramId: seedDiagram.id,
        diagramKind: seedDiagram.diagramKind,
        contextElementId: undefined,
        returnStack: [],
      }
      : state,
    repo,
  );
}

export function navigateBack(
  state: DiagramNavigationState,
  repo: Pick<SysmlRepository, 'diagrams' | 'definitions'>,
): DiagramNavigationState {
  if (state.returnStack.length === 0) {
    return state;
  }
  const nextStack = [...state.returnStack];
  const target = nextStack.pop()!;
  return recoverNavigationState(
    {
      activeDiagramId: target.diagramId,
      diagramKind: target.diagramKind,
      contextElementId: target.contextElementId,
      returnStack: nextStack,
    },
    repo,
  );
}

export function recoverNavigationState(
  state: DiagramNavigationState,
  repo: Pick<SysmlRepository, 'diagrams' | 'definitions'>,
): DiagramNavigationState {
  // Mode-only pseudo-IDs ('bdd', 'requirements', 'rtm', 'package') are never
  // valid diagram targets: only real repository diagrams (or a live Block
  // context for an IBD) count. Recovery never alters semantic ownership; it
  // only reselects navigation state through the fallback chain below.
  const isContextValid = !state.contextElementId || Boolean(repo.definitions[state.contextElementId]);
  const isDiagramValid =
    Boolean(repo.diagrams[state.activeDiagramId]) ||
    (state.diagramKind === 'ibd' && Boolean(repo.definitions[state.activeDiagramId]));

  if (isContextValid && isDiagramValid) {
    const validStack = state.returnStack.filter(entry =>
      Boolean(repo.diagrams[entry.diagramId]) ||
      (entry.diagramKind === 'ibd' && Boolean(repo.definitions[entry.diagramId]))
    );
    return { ...state, returnStack: validStack };
  }

  for (let i = state.returnStack.length - 1; i >= 0; i--) {
    const entry = state.returnStack[i];
    // Mirrors the validity filter above: a live Block context is a genuine
    // IBD origin even though it has no diagram record.
    const entryValid = Boolean(repo.diagrams[entry.diagramId]) ||
      (entry.diagramKind === 'ibd' && Boolean(repo.definitions[entry.diagramId]));
    if (entryValid) {
      return {
        activeDiagramId: entry.diagramId,
        diagramKind: entry.diagramKind,
        contextElementId: undefined,
        returnStack: state.returnStack.slice(0, i),
      };
    }
  }

  const sameKindDiagrams = Object.values(repo.diagrams).filter(d => d.diagramKind === state.diagramKind);
  const sameKind = sameKindDiagrams.find(d => d.id === 'adia-default-bdd') ?? sameKindDiagrams[0];
  if (sameKind) {
    return {
      activeDiagramId: sameKind.id,
      diagramKind: sameKind.diagramKind,
      contextElementId: undefined,
      returnStack: [],
    };
  }

  const defaultBdd = repo.diagrams['adia-default-bdd'];
  if (defaultBdd) {
    return {
      activeDiagramId: defaultBdd.id,
      diagramKind: 'bdd',
      contextElementId: undefined,
      returnStack: [],
    };
  }

  const anyBdd = Object.values(repo.diagrams).find(d => d.diagramKind === 'bdd');
  if (anyBdd) {
    return {
      activeDiagramId: anyBdd.id,
      diagramKind: 'bdd',
      contextElementId: undefined,
      returnStack: [],
    };
  }

  // No valid target exists anywhere (empty repository, or every candidate
  // deleted). Preserve the caller's state unchanged. This module is a pure
  // state-transition helper with no diagnostics channel, so the only
  // alternative — fabricating the 'bdd' pseudo-ID — would hand back a
  // dangling reference to a diagram that does not exist. Callers (notably
  // the App.tsx recovery effect) treat an unchanged result as a no-op and
  // keep their current selection, so this is read-only and gate-safe.
  return state;
}
