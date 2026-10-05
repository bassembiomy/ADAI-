import {
  EngineeringModelIR,
  IRSubsystem,
  SemanticComponent,
  SemanticPort,
  SemanticConnection
} from '../contracts/modelIr';

export interface ParameterChange {
  componentId: string;
  parameterName: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface ModelIrDiff {
  baseModelId: string;
  targetModelId: string;
  baseRevision: number;
  targetRevision: number;
  addedSubsystems: IRSubsystem[];
  removedSubsystems: IRSubsystem[];
  modifiedSubsystems: IRSubsystem[];
  addedComponents: SemanticComponent[];
  removedComponents: SemanticComponent[];
  modifiedComponents: SemanticComponent[];
  unchangedComponentIds: string[];
  addedPorts: SemanticPort[];
  removedPorts: SemanticPort[];
  addedConnections: SemanticConnection[];
  removedConnections: SemanticConnection[];
  parameterChanges: ParameterChange[];
}

export function diffModelIr(
  base: EngineeringModelIR,
  modified: EngineeringModelIR
): ModelIrDiff {
  // 1. Subsystems diff
  const baseSubMap = new Map(base.subsystems.map(s => [s.id, s]));
  const modSubMap = new Map(modified.subsystems.map(s => [s.id, s]));

  const addedSubsystems = modified.subsystems.filter(s => !baseSubMap.has(s.id));
  const removedSubsystems = base.subsystems.filter(s => !modSubMap.has(s.id));
  const modifiedSubsystems = modified.subsystems.filter(s => {
    const orig = baseSubMap.get(s.id);
    return orig && (orig.name !== s.name || orig.parentSubsystemId !== s.parentSubsystemId);
  });

  // 2. Components diff
  const baseCompMap = new Map(base.components.map(c => [c.id, c]));
  const modCompMap = new Map(modified.components.map(c => [c.id, c]));

  const addedComponents = modified.components.filter(c => !baseCompMap.has(c.id));
  const removedComponents = base.components.filter(c => !modCompMap.has(c.id));

  const modifiedComponents: SemanticComponent[] = [];
  const unchangedComponentIds: string[] = [];
  const parameterChanges: ParameterChange[] = [];

  for (const modComp of modified.components) {
    const orig = baseCompMap.get(modComp.id);
    if (!orig) continue;

    let isModified = false;
    if (orig.conceptId !== modComp.conceptId || orig.subsystemId !== modComp.subsystemId) {
      isModified = true;
    }

    // Compare parameters
    const origParams = new Map(orig.parameters.map(p => [p.name, p.value]));
    const modParams = new Map(modComp.parameters.map(p => [p.name, p.value]));

    for (const [name, newVal] of modParams) {
      const oldVal = origParams.get(name);
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        parameterChanges.push({
          componentId: modComp.id,
          parameterName: name,
          oldValue: oldVal,
          newValue: newVal
        });
        isModified = true;
      }
    }

    if (isModified) {
      modifiedComponents.push(modComp);
    } else {
      unchangedComponentIds.push(modComp.id);
    }
  }

  // 3. Ports diff
  const basePortMap = new Map(base.ports.map(p => [p.id, p]));
  const modPortMap = new Map(modified.ports.map(p => [p.id, p]));
  const addedPorts = modified.ports.filter(p => !basePortMap.has(p.id));
  const removedPorts = base.ports.filter(p => !modPortMap.has(p.id));

  // 4. Connections diff
  const baseConnMap = new Map(base.connections.map(c => [c.id, c]));
  const modConnMap = new Map(modified.connections.map(c => [c.id, c]));
  const addedConnections = modified.connections.filter(c => !baseConnMap.has(c.id));
  const removedConnections = base.connections.filter(c => !modConnMap.has(c.id));

  return {
    baseModelId: base.modelId,
    targetModelId: modified.modelId,
    baseRevision: base.baseRevision,
    targetRevision: modified.baseRevision,
    addedSubsystems,
    removedSubsystems,
    modifiedSubsystems,
    addedComponents,
    removedComponents,
    modifiedComponents,
    unchangedComponentIds,
    addedPorts,
    removedPorts,
    addedConnections,
    removedConnections,
    parameterChanges
  };
}

export function applyModelIrDiff(
  base: EngineeringModelIR,
  diff: ModelIrDiff
): EngineeringModelIR {
  const removedSubIds = new Set(diff.removedSubsystems.map(s => s.id));
  const removedCompIds = new Set(diff.removedComponents.map(c => c.id));
  const removedPortIds = new Set(diff.removedPorts.map(p => p.id));
  const removedConnIds = new Set(diff.removedConnections.map(c => c.id));

  // 1. Subsystems
  const updatedSubsystems = base.subsystems
    .filter(s => !removedSubIds.has(s.id))
    .map(s => diff.modifiedSubsystems.find(m => m.id === s.id) || s)
    .concat(diff.addedSubsystems);

  // 2. Components
  const updatedComponents = base.components
    .filter(c => !removedCompIds.has(c.id))
    .map(c => diff.modifiedComponents.find(m => m.id === c.id) || c)
    .concat(diff.addedComponents);

  // 3. Ports
  const updatedPorts = base.ports
    .filter(p => !removedPortIds.has(p.id))
    .concat(diff.addedPorts);

  // 4. Connections
  const updatedConnections = base.connections
    .filter(c => !removedConnIds.has(c.id))
    .concat(diff.addedConnections);

  return {
    ...base,
    modelId: diff.targetModelId,
    baseRevision: diff.targetRevision,
    subsystems: updatedSubsystems,
    components: updatedComponents,
    ports: updatedPorts,
    connections: updatedConnections
  };
}
