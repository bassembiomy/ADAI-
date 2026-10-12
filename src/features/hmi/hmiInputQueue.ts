import type { HmiInputCommand } from './hmiModel';

export type HmiQueuedCommand = Omit<HmiInputCommand, 'value' | 'releaseValue'> & {
  value: number | boolean;
  releaseValue?: number | boolean;
};

/** Self-contained factory so the portable report uses the same ordering contract. */
export function createHmiInputQueue() {
  let pending: HmiQueuedCommand[] = [];
  const held = new Set<string>();
  return {
    enqueue(command: HmiQueuedCommand): boolean {
      const mode = command.mode ?? 'set';
      const source = JSON.stringify([command.sourceId, command.variableId]);
      if (mode === 'press' && held.has(source)) return true;
      if (mode === 'release' && !held.has(source)) return true;
      if (pending.length >= 1024) return false;
      if (mode === 'press') held.add(source);
      if (mode === 'release') held.delete(source);
      pending.push({ ...command, mode });
      return true;
    },
    drain(): Record<string, number | boolean> {
      const values: Record<string, number | boolean> = {};
      const blocked = new Set<string>();
      const deferred: HmiQueuedCommand[] = [];
      for (const command of pending) {
        if (blocked.has(command.variableId)) {
          deferred.push(command);
          continue;
        }
        values[command.variableId] = command.value;
        if (command.mode === 'press' || command.mode === 'pulse') {
          // Preserve the asserted value through one complete semantic tick.
          blocked.add(command.variableId);
          if (command.mode === 'pulse') deferred.push({
            ...command, mode: 'set',
            value: command.releaseValue ?? (typeof command.value === 'boolean' ? false : 0),
          });
        }
      }
      pending = deferred;
      return values;
    },
    clear() { pending = []; held.clear(); },
    get size() { return pending.length; },
  };
}

export const getPortableHmiInputQueueScript = () => `const createHmiInputQueue = ${createHmiInputQueue.toString()};`;
