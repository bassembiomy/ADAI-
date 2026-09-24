import type {
  SysmlRepositoryV4,
  Block,
  Port,
  PartProperty,
  ValueProperty,
  Requirement,
  SemanticElement,
  DiagramPresentation,
} from '../domain';
import { formatValueSpecification } from '../services/propertySemantics';

export interface BddNodeProjection {
  presentationId: string;
  elementId: string;
  name: string;
  metaclass: string;
  x: number;
  y: number;
  width: number;
  height: number;
  compartments: {
    parts: string[];
    values: string[];
    ports: string[];
  };
}

export interface BddDiagramProjection {
  diagramId: string;
  nodes: BddNodeProjection[];
}

export function projectBddDiagram(
  repo: SysmlRepositoryV4,
  diagramId: string
): BddDiagramProjection {
  const presIds = repo.indexes.byDiagram[diagramId] || [];
  const nodes: BddNodeProjection[] = [];

  for (const presId of presIds) {
    const pres = repo.presentations[presId];
    if (!pres) continue;
    const element = repo.elements[pres.elementId];
    if (!element) continue;

    const parts: string[] = [];
    const values: string[] = [];
    const ports: string[] = [];

    const childIds = repo.indexes.byOwner[element.id] || [];
    for (const childId of childIds) {
      const child = repo.elements[childId];
      if (!child) continue;

      if (child.metaclass === 'PartProperty') {
        const p = child as PartProperty;
        const target = repo.elements[p.typeId]?.name || p.typeId;
        parts.push(`${p.name} : ${target}`);
      } else if (child.metaclass === 'ValueProperty') {
        const v = child as ValueProperty;
        const target = repo.elements[v.typeId]?.name || v.typeId;
        const valStr = v.defaultValue ? ` = ${formatValueSpecification(v.defaultValue)}` : '';
        values.push(`${v.name} : ${target}${valStr}`);
      } else if (child.metaclass === 'Port') {
        const pt = child as Port;
        ports.push(`${pt.name}`);
      }
    }

    nodes.push({
      presentationId: pres.id,
      elementId: element.id,
      name: element.name,
      metaclass: element.metaclass,
      x: pres.bounds.x,
      y: pres.bounds.y,
      width: pres.bounds.width,
      height: pres.bounds.height,
      compartments: { parts, values, ports },
    });
  }

  return { diagramId, nodes };
}

export interface IbdPortProjection {
  id: string;
  name: string;
  portKind: string;
}

export interface IbdPartProjection {
  presentationId: string;
  elementId: string;
  name: string;
  typeId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  ports: IbdPortProjection[];
}

export interface IbdDiagramProjection {
  diagramId: string;
  contextBlockId: string;
  parts: IbdPartProjection[];
}

export function projectIbdDiagram(
  repo: SysmlRepositoryV4,
  diagramId: string,
  contextBlockId: string
): IbdDiagramProjection {
  const presIds = repo.indexes.byDiagram[diagramId] || [];
  const parts: IbdPartProjection[] = [];

  for (const presId of presIds) {
    const pres = repo.presentations[presId];
    if (!pres) continue;
    const element = repo.elements[pres.elementId];
    if (!element || element.metaclass !== 'PartProperty') continue;

    const part = element as PartProperty;
    const targetType = repo.elements[part.typeId];
    const targetTypeName = targetType?.name || part.typeId;

    // Get ports owned by the target block type
    const ports: IbdPortProjection[] = [];
    if (targetType) {
      const ownedIds = repo.indexes.byOwner[targetType.id] || [];
      for (const oid of ownedIds) {
        const child = repo.elements[oid];
        if (child && child.metaclass === 'Port') {
          const pt = child as Port;
          ports.push({
            id: pt.id,
            name: pt.name,
            portKind: pt.portKind,
          });
        }
      }
    }

    parts.push({
      presentationId: pres.id,
      elementId: part.id,
      name: `${part.name} : ${targetTypeName}`,
      typeId: part.typeId,
      x: pres.bounds.x,
      y: pres.bounds.y,
      width: pres.bounds.width,
      height: pres.bounds.height,
      ports,
    });
  }

  return { diagramId, contextBlockId, parts };
}

export interface RequirementNodeProjection {
  presentationId: string;
  elementId: string;
  requirementId: string;
  name: string;
  text: string;
  status: string;
  version: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RequirementsDiagramProjection {
  diagramId: string;
  requirements: RequirementNodeProjection[];
}

export function projectRequirementsDiagram(
  repo: SysmlRepositoryV4,
  diagramId: string
): RequirementsDiagramProjection {
  const presIds = repo.indexes.byDiagram[diagramId] || [];
  const requirements: RequirementNodeProjection[] = [];

  for (const presId of presIds) {
    const pres = repo.presentations[presId];
    if (!pres) continue;
    const element = repo.elements[pres.elementId];
    if (!element || element.metaclass !== 'Requirement') continue;

    const req = element as Requirement;
    requirements.push({
      presentationId: pres.id,
      elementId: req.id,
      requirementId: req.requirementId,
      name: req.name,
      text: req.text,
      status: req.status,
      version: req.version,
      x: pres.bounds.x,
      y: pres.bounds.y,
      width: pres.bounds.width,
      height: pres.bounds.height,
    });
  }

  return { diagramId, requirements };
}

export interface BrowserTreeNode {
  id: string;
  label: string;
  metaclass: string;
  ownerId: string | null;
  children: string[];
}

export interface ModelBrowserProjection {
  rootNodes: string[];
  allNodes: Record<string, BrowserTreeNode>;
}

export function projectModelBrowser(repo: SysmlRepositoryV4): ModelBrowserProjection {
  const allNodes: Record<string, BrowserTreeNode> = {};
  const rootNodes: string[] = [];

  for (const element of Object.values(repo.elements)) {
    let label = `${element.name}`;
    if (element.metaclass === 'Requirement') {
      const r = element as Requirement;
      label = `«requirement» ${r.name} [${r.requirementId}]`;
    } else if (element.metaclass === 'Block') {
      label = `«block» ${element.name}`;
    }

    allNodes[element.id] = {
      id: element.id,
      label,
      metaclass: element.metaclass,
      ownerId: element.ownerId,
      children: [],
    };
  }

  // Populate children
  for (const node of Object.values(allNodes)) {
    if (node.ownerId && allNodes[node.ownerId]) {
      allNodes[node.ownerId].children.push(node.id);
    } else {
      rootNodes.push(node.id);
    }
  }

  return { rootNodes, allNodes };
}
