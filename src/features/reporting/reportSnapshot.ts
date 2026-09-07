import {
  buildReportSnapshot,
  type ReportModelInput,
  type ReportModelSnapshot,
} from '../../services/reportModelConsistency';
import type { HierarchySourceModel } from './reportHierarchyEngine';

/**
 * Creates a validated immutable report snapshot from raw application state.
 * Calls buildReportSnapshot() exactly once.
 */
export function createReportSnapshot(input: ReportModelInput): ReportModelSnapshot {
  return buildReportSnapshot(input);
}

/**
 * Adapts a ReportModelSnapshot into a HierarchySourceModel for hierarchy
 * engine and diagram renderers, passing the snapshot arrays by reference
 * without filtering connections.
 */
export function toHierarchySource(snapshot: ReportModelSnapshot): HierarchySourceModel {
  return {
    blocks: snapshot.blocks,
    parts: snapshot.parts,
    connectors: snapshot.connectors,
    relationships: snapshot.relationships,
    states: snapshot.states ?? [],
    layers: snapshot.layers ?? [],
    transitions: snapshot.transitions ?? [],
    junctions: snapshot.junctions ?? [],
  };
}
