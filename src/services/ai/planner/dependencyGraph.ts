import { ActionEnvelope } from './planSchemas';
import { Diagnostic } from '../contracts/diagnostics';

export class DependencyGraph {
  public static analyzeAndSort(actions: ActionEnvelope[]): { sortedIds: string[]; diagnostics: Diagnostic[] } {
    const diagnostics: Diagnostic[] = [];
    const actionIds = new Set(actions.map(a => a.actionId));
    const adj = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    actions.forEach(a => {
      adj.set(a.actionId, []);
      inDegree.set(a.actionId, 0);
    });

    for (const a of actions) {
      for (const dep of a.dependsOn) {
        if (!actionIds.has(dep)) {
          diagnostics.push({
            code: 'UNRESOLVED_DEPENDENCY',
            severity: 'ERROR',
            message: `Action ${a.actionId} depends on unresolved action ${dep}`,
            actionId: a.actionId
          });
          continue;
        }
        adj.get(dep)!.push(a.actionId);
        inDegree.set(a.actionId, (inDegree.get(a.actionId) || 0) + 1);
      }
    }

    if (diagnostics.length > 0) return { sortedIds: [], diagnostics };

    const queue: string[] = [];
    actions.forEach(a => {
      if (inDegree.get(a.actionId) === 0) queue.push(a.actionId);
    });

    const sortedIds: string[] = [];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      sortedIds.push(curr);
      for (const neighbor of adj.get(curr) || []) {
        inDegree.set(neighbor, inDegree.get(neighbor)! - 1);
        if (inDegree.get(neighbor) === 0) queue.push(neighbor);
      }
    }

    if (sortedIds.length !== actions.length) {
      diagnostics.push({
        code: 'CYCLIC_DEPENDENCY',
        severity: 'ERROR',
        message: 'Cyclic dependency detected in action graph.'
      });
      return { sortedIds: [], diagnostics };
    }

    return { sortedIds, diagnostics: [] };
  }
}
