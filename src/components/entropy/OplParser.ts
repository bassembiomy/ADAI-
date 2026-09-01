import { OPMNodeData, OPMEdgeData, OPMNodeType, OPMLinkType, OPMState, OPMPort, type AppNode, type AppEdge } from './EntropyTypes';
import { v4 as uuidv4 } from 'uuid';
import { layoutOpmGraph } from './OpmAutoLayout';

export interface OplSyntaxError {
  line: number;
  message: string;
  severity: 'error' | 'warning';
}

// Generate OPL text from nodes and edges (OPD -> OPL)
export function generateOpl(nodes: AppNode[], edges: AppEdge[]): string {
  const sentences: string[] = [];

  // Group nodes
  const objects = nodes.filter(n => n.data.type === 'object');
  const processes = nodes.filter(n => n.data.type === 'process');
  const states = nodes.filter(n => n.data.type === 'state');
  const requirements = nodes.filter(n => n.data.type === 'requirement');
  const nonRequirementObjects = objects.filter(o => o.data.type !== 'requirement');

  // 1. Declarations of Objects, physical attributes, states
  nonRequirementObjects.forEach(obj => {
    const objName = obj.data.name;
    if (obj.data.physical) {
      sentences.push(`Object ${objName} is physical.`);
    }
    
    // Find child states
    const childStates = states.filter(s => s.parentId === obj.id || s.data.parentId === obj.id);
    if (childStates.length > 0) {
      const stateNames = childStates.map(s => s.data.name).join(', ');
      sentences.push(`Object ${objName} has states ${stateNames}.`);
    }

    if (obj.data.attributes && obj.data.attributes.length > 0) {
      const attrNames = obj.data.attributes.map(a => `${a.key} = ${a.value}`).join(', ');
      sentences.push(`Object ${objName} exhibits attributes: ${attrNames}.`);
    }
  });

  // 1b. Requirement declarations (extension to ISO 19450)
  requirements.forEach(req => {
    sentences.push(`Requirement ${req.data.name}.`);
  });

  // 2. Declarations of Processes
  processes.forEach(proc => {
    const procName = proc.data.name;
    if (proc.data.physical) {
      sentences.push(`Process ${procName} is physical.`);
    } else {
      sentences.push(`Process ${procName}.`);
    }
  });

  // Helper to find node name
  const findNodeName = (id: string): string => {
    const node = nodes.find(n => n.id === id);
    if (!node) return '';
    if (node.data.type === 'state') {
      const parent = nodes.find(n => n.id === (node.parentId || node.data.parentId));
      return parent ? `${parent.data.name} in state ${node.data.name}` : node.data.name;
    }
    return node.data.name;
  };

  // 3. Edges (Links)
  edges.forEach(edge => {
    const srcNode = nodes.find(n => n.id === edge.source);
    const tgtNode = nodes.find(n => n.id === edge.target);
    if (!srcNode || !tgtNode) return;

    const srcName = srcNode.data.name;
    const tgtName = tgtNode.data.name;
    const linkType = edge.data?.type;

    if (!linkType) return;

    switch (linkType) {
      case 'aggregation':
        sentences.push(`${srcName} consists of ${tgtName}.`);
        break;
      case 'generalization':
        sentences.push(`${srcName} specializes ${tgtName}.`);
        break;
      case 'exhibition':
        sentences.push(`${srcName} exhibits ${tgtName}.`);
        break;
      case 'agent':
        sentences.push(`${srcName} executes ${tgtName}.`);
        break;
      case 'instrument':
        sentences.push(`${tgtName} uses ${srcName}.`);
        break;
      case 'consumption':
        sentences.push(`${tgtName} consumes ${findNodeName(edge.source)}.`);
        break;
      case 'result':
        sentences.push(`${srcName} yields ${findNodeName(edge.target)}.`);
        break;
      case 'effect':
        // Check if source or target is a state
        if (srcNode.data.type === 'state' && tgtNode.data.type === 'process') {
          // Connected state to process
          sentences.push(`${tgtName} transforms ${findNodeName(edge.source)}.`);
        } else if (srcNode.data.type === 'process' && tgtNode.data.type === 'state') {
          // Connected process to state
          sentences.push(`${srcName} changes ${findNodeName(edge.target)}.`);
        } else {
          sentences.push(`${srcName} changes ${tgtName}.`);
        }
        break;
      case 'trigger':
        if (srcNode.data.type === 'state') {
          const parent = nodes.find(n => n.id === (srcNode.parentId || srcNode.data.parentId));
          const parentName = parent ? parent.data.name : 'Object';
          sentences.push(`${parentName} in state ${srcName} triggers ${tgtName}.`);
        } else {
          sentences.push(`${srcName} triggers ${tgtName}.`);
        }
        break;
      case 'condition':
        if (srcNode.data.type === 'state') {
          const parent = nodes.find(n => n.id === (srcNode.parentId || srcNode.data.parentId));
          const parentName = parent ? parent.data.name : 'Object';
          sentences.push(`${parentName} in state ${srcName} conditions ${tgtName}.`);
        } else {
          sentences.push(`${srcName} conditions ${tgtName}.`);
        }
        break;
      case 'satisfies':
        sentences.push(`${srcName} satisfies ${tgtName}.`);
        break;
      case 'verifies':
        sentences.push(`${srcName} verifies ${tgtName}.`);
        break;
      default:
        break;
    }
  });

  return sentences.join('\n');
}

// Parse OPL text into React Flow nodes and edges (OPL -> OPD)
export function parseOpl(text: string, existingNodes: AppNode[] = []): {
  nodes: AppNode[];
  edges: AppEdge[];
  errors: OplSyntaxError[];
} {
  const nodes: AppNode[] = [];
  const edges: AppEdge[] = [];
  const errors: OplSyntaxError[] = [];

  const lines = text.split('\n');
  const nodeMap = new Map<string, AppNode>(); // key: lowercase node name, value: Node
  const stateMap = new Map<string, AppNode>(); // key: lowercase "objectname:statename", value: Node

  // Helper to find or create a node
  const getOrCreateNode = (name: string, type: OPMNodeType, parentNodeId?: string | null): AppNode => {
    const cleaned = name.replace(/^(object|process|state)\s+/i, '').trim();
    const key = cleaned.toLowerCase();
    
    // Check if we already created it in this parse session
    let node = nodeMap.get(key);
    if (node) return node;

    // Check if it exists in existingNodes to preserve positions
    const existing = existingNodes.find(n => n.data.name.toLowerCase() === key && n.data.type === type);
    
    const id = existing ? existing.id : uuidv4();
    const x = existing ? existing.position.x : Math.random() * 500 + 50;
    const y = existing ? existing.position.y : Math.random() * 400 + 50;

    const defaultInputs: OPMPort[] = [];
    const defaultOutputs: OPMPort[] = [];

    if (type === 'object') {
      defaultInputs.push(
        { id: 'res-in', name: 'Result', type: 'result', direction: 'input', position: 'left' },
        { id: 'eff-in', name: 'Effect', type: 'effect', direction: 'input', position: 'top' }
      );
      defaultOutputs.push(
        { id: 'std-out', name: 'Out', type: 'standard', direction: 'output', position: 'right' },
        { id: 'agt-out', name: 'Agent', type: 'agent', direction: 'output', position: 'bottom' },
        { id: 'inst-out', name: 'Instrument', type: 'instrument', direction: 'output', position: 'bottom' }
      );
    } else if (type === 'process') {
      defaultInputs.push(
        { id: 'con-in', name: 'Consume', type: 'consumption', direction: 'input', position: 'left' },
        { id: 'agt-in', name: 'Agent', type: 'agent', direction: 'input', position: 'left' },
        { id: 'inst-in', name: 'Instrument', type: 'instrument', direction: 'input', position: 'left' },
        { id: 'trg-in', name: 'Trigger', type: 'trigger', direction: 'input', position: 'top' },
        { id: 'cond-in', name: 'Condition', type: 'condition', direction: 'input', position: 'top' }
      );
      defaultOutputs.push(
        { id: 'res-out', name: 'Result', type: 'result', direction: 'output', position: 'right' },
        { id: 'eff-out', name: 'Effect', type: 'effect', direction: 'output', position: 'right' }
      );
    } else if (type === 'state') {
      defaultOutputs.push(
        { id: 'val-out', name: 'Val', type: 'standard', direction: 'output', position: 'right' }
      );
    }

    node = {
      id,
      type: type === 'state' ? 'opmState' : type === 'process' ? 'opmProcess' : 'opmObject',
      position: { x, y },
      data: {
        name: cleaned,
        type,
        physical: existing ? existing.data.physical : false,
        states: existing ? existing.data.states : [],
        attributes: existing ? existing.data.attributes : [],
        parentId: parentNodeId || (existing ? existing.data.parentId : null),
        inputs: existing ? (existing.data.inputs || defaultInputs) : defaultInputs,
        outputs: existing ? (existing.data.outputs || defaultOutputs) : defaultOutputs,
      },
      parentId: parentNodeId || undefined,
      extent: parentNodeId ? 'parent' : undefined
    };

    nodeMap.set(key, node);
    nodes.push(node);
    return node;
  };

  // Process declarations and state definitions first to construct the basic entities
  lines.forEach((lineRaw, idx) => {
    const line = lineRaw.trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) return;

    const lineNum = idx + 1;

    // Object physical declaration
    // Object [Name] is physical.
    let match = line.match(/^Object\s+(.+?)\s+is\s+physical\.$/i);
    if (match) {
      const objNode = getOrCreateNode(match[1], 'object');
      objNode.data.physical = true;
      return;
    }

    // Process physical declaration
    // Process [Name] is physical.
    match = line.match(/^Process\s+(.+?)\s+is\s+physical\.$/i);
    if (match) {
      const procNode = getOrCreateNode(match[1], 'process');
      procNode.data.physical = true;
      return;
    }

    // Object has states declaration
    // Object [Name] has states [State1], [State2]...
    match = line.match(/^Object\s+(.+?)\s+has\s+states\s+(.+?)\.$/i);
    if (match) {
      const objName = match[1];
      const stateList = match[2].split(',').map(s => s.trim());
      const objNode = getOrCreateNode(objName, 'object');
      
      const opmStates: OPMState[] = [];
      stateList.forEach((stateName, sIdx) => {
        const stateKey = `${objName.toLowerCase()}:${stateName.toLowerCase()}`;
        // Create state node
        const stateNode = getOrCreateNode(stateName, 'state', objNode.id);
        
        // Position state inside the object node
        stateNode.position = { x: 15 + sIdx * 90, y: 45 };
        
        opmStates.push({
          id: stateNode.id,
          name: stateName,
          isActive: false
        });
        
        if (sIdx === 0) {
          (stateNode.data as any).isInitial = true;
        }

        stateMap.set(stateKey, stateNode);
      });

      objNode.data.states = opmStates;
      return;
    }

    // Requirement declaration
    // Requirement [Name].
    match = line.match(/^Requirement\s+(.+?)\.$/i);
    if (match) {
      const node = getOrCreateNode(match[1], 'requirement');
      node.type = 'opmObject'; // rendered by opmObject; data.type distinguishes
      return;
    }

    // Process declaration
    // Process [Name].
    match = line.match(/^Process\s+(.+?)\.$/i);
    if (match) {
      getOrCreateNode(match[1], 'process');
      return;
    }
  });

  // Second pass: Process links and relations
  lines.forEach((lineRaw, idx) => {
    const line = lineRaw.trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) return;

    const lineNum = idx + 1;
    let matched = false;

    // 1. Aggregation: [Whole] consists of [Part].
    let match = line.match(/^(.+?)\s+consists\s+of\s+(.+?)\.$/i);
    if (match) {
      matched = true;
      const whole = getOrCreateNode(match[1], 'object');
      const part = getOrCreateNode(match[2], 'object');
      
      // Make part a child node visually or link it
      edges.push({
        id: `e-${whole.id}-${part.id}`,
        source: whole.id,
        target: part.id,
        sourceHandle: 'std-out',
        targetHandle: 'res-in',
        data: { type: 'aggregation' }
      });
      return;
    }

    // 2. Generalization: [Sub] specializes [Super].
    match = line.match(/^(.+?)\s+specializes\s+(.+?)\.$/i);
    if (match) {
      matched = true;
      const sub = getOrCreateNode(match[1], 'object');
      const superObj = getOrCreateNode(match[2], 'object');

      edges.push({
        id: `e-${sub.id}-${superObj.id}`,
        source: sub.id,
        target: superObj.id,
        sourceHandle: 'std-out',
        targetHandle: 'res-in',
        data: { type: 'generalization' }
      });
      return;
    }

    // 3. Exhibition: [Obj] exhibits [Attr].
    match = line.match(/^(.+?)\s+exhibits\s+(.+?)\.$/i);
    if (match) {
      matched = true;
      const obj = getOrCreateNode(match[1], 'object');
      const attr = getOrCreateNode(match[2], 'object');

      edges.push({
        id: `e-${obj.id}-${attr.id}`,
        source: obj.id,
        target: attr.id,
        sourceHandle: 'std-out',
        targetHandle: 'res-in',
        data: { type: 'exhibition' }
      });
      return;
    }

    // 4. Agent link: [Obj] executes [Proc].
    match = line.match(/^(.+?)\s+executes\s+(.+?)\.$/i);
    if (match) {
      matched = true;
      const obj = getOrCreateNode(match[1], 'object');
      const proc = getOrCreateNode(match[2], 'process');

      edges.push({
        id: `e-${obj.id}-${proc.id}`,
        source: obj.id,
        target: proc.id,
        sourceHandle: 'agt-out',
        targetHandle: 'agt-in',
        data: { type: 'agent' }
      });
      return;
    }

    // 5. Instrument link: [Proc] uses [Obj].
    match = line.match(/^(.+?)\s+uses\s+(.+?)\.$/i);
    if (match) {
      matched = true;
      const proc = getOrCreateNode(match[1], 'process');
      const obj = getOrCreateNode(match[2], 'object');

      edges.push({
        id: `e-${obj.id}-${proc.id}`,
        source: obj.id,
        target: proc.id,
        sourceHandle: 'inst-out',
        targetHandle: 'inst-in',
        data: { type: 'instrument' }
      });
      return;
    }

    // 6. Consumption link: [Proc] consumes [Obj].
    // Also handles consumes [Obj] in state [State]
    match = line.match(/^(.+?)\s+consumes\s+(.+?)\.$/i);
    if (match) {
      matched = true;
      const proc = getOrCreateNode(match[1], 'process');
      const objTarget = match[2];
      
      let sourceId = '';
      let isState = false;
      const stateMatch = objTarget.match(/(.+?)\s+in\s+state\s+(.+)/i);
      if (stateMatch) {
        const objName = stateMatch[1];
        const stateName = stateMatch[2];
        const stateKey = `${objName.toLowerCase()}:${stateName.toLowerCase()}`;
        const stateNode = stateMap.get(stateKey);
        sourceId = stateNode ? stateNode.id : getOrCreateNode(objName, 'object').id;
        isState = !!stateNode;
      } else {
        sourceId = getOrCreateNode(objTarget, 'object').id;
      }

      edges.push({
        id: `e-${sourceId}-${proc.id}`,
        source: sourceId,
        target: proc.id,
        sourceHandle: isState ? 'val-out' : 'std-out',
        targetHandle: 'con-in',
        data: { type: 'consumption' }
      });
      return;
    }

    // 7. Result link: [Proc] yields [Obj].
    match = line.match(/^(.+?)\s+yields\s+(.+?)\.$/i);
    if (match) {
      matched = true;
      const proc = getOrCreateNode(match[1], 'process');
      const objTarget = match[2];

      let targetId = '';
      const stateMatch = objTarget.match(/(.+?)\s+in\s+state\s+(.+)/i);
      if (stateMatch) {
        const objName = stateMatch[1];
        const stateName = stateMatch[2];
        const stateKey = `${objName.toLowerCase()}:${stateName.toLowerCase()}`;
        const stateNode = stateMap.get(stateKey);
        targetId = stateNode ? stateNode.id : getOrCreateNode(objName, 'object').id;
      } else {
        targetId = getOrCreateNode(objTarget, 'object').id;
      }

      edges.push({
        id: `e-${proc.id}-${targetId}`,
        source: proc.id,
        target: targetId,
        sourceHandle: 'res-out',
        targetHandle: 'res-in',
        data: { type: 'result' }
      });
      return;
    }

    // 8. Effect / Transition link: [Proc] changes [Obj] from [StateA] to [StateB].
    match = line.match(/^(.+?)\s+changes\s+(.+?)\s+from\s+(.+?)\s+to\s+(.+?)\.$/i);
    if (match) {
      matched = true;
      const proc = getOrCreateNode(match[1], 'process');
      const objName = match[2];
      const stateAName = match[3];
      const stateBName = match[4];

      const stateAKey = `${objName.toLowerCase()}:${stateAName.toLowerCase()}`;
      const stateBKey = `${objName.toLowerCase()}:${stateBName.toLowerCase()}`;
      const stateANode = stateMap.get(stateAKey);
      const stateBNode = stateMap.get(stateBKey);

      if (stateANode && stateBNode) {
        edges.push({
          id: `e-${stateANode.id}-${proc.id}`,
          source: stateANode.id,
          target: proc.id,
          sourceHandle: 'val-out',
          targetHandle: 'con-in',
          data: { type: 'consumption' }
        });
        edges.push({
          id: `e-${proc.id}-${stateBNode.id}`,
          source: proc.id,
          target: stateBNode.id,
          sourceHandle: 'res-out',
          targetHandle: 'res-in',
          data: { type: 'result' }
        });
      } else {
        // Fallback to object link
        const objNode = getOrCreateNode(objName, 'object');
        edges.push({
          id: `e-${proc.id}-${objNode.id}`,
          source: proc.id,
          target: objNode.id,
          sourceHandle: 'eff-out',
          targetHandle: 'eff-in',
          data: { type: 'effect', conditionText: `changes from ${stateAName} to ${stateBName}` }
        });
      }
      return;
    }

    // 9. Trigger link: [Obj] in state [State] triggers [Proc].
    // or [Obj] triggers [Proc].
    match = line.match(/^(.+?)\s+in\s+state\s+(.+?)\s+triggers\s+(.+?)\.$/i);
    if (match) {
      matched = true;
      const objName = match[1];
      const stateName = match[2];
      const procName = match[3];

      const stateKey = `${objName.toLowerCase()}:${stateName.toLowerCase()}`;
      const stateNode = stateMap.get(stateKey);
      const procNode = getOrCreateNode(procName, 'process');

      if (stateNode) {
        edges.push({
          id: `e-${stateNode.id}-${procNode.id}`,
          source: stateNode.id,
          target: procNode.id,
          sourceHandle: 'val-out',
          targetHandle: 'trg-in',
          data: { type: 'trigger' }
        });
      }
      return;
    }

    match = line.match(/^(.+?)\s+triggers\s+(.+?)\.$/i);
    if (match) {
      matched = true;
      const obj = getOrCreateNode(match[1], 'object');
      const proc = getOrCreateNode(match[2], 'process');

      edges.push({
        id: `e-${obj.id}-${proc.id}`,
        source: obj.id,
        target: proc.id,
        sourceHandle: 'std-out',
        targetHandle: 'trg-in',
        data: { type: 'trigger' }
      });
      return;
    }

    // 10. Condition link: [Obj] in state [State] conditions [Proc].
    // or [Obj] conditions [Proc].
    match = line.match(/^(.+?)\s+in\s+state\s+(.+?)\s+conditions\s+(.+?)\.$/i);
    if (match) {
      matched = true;
      const objName = match[1];
      const stateName = match[2];
      const procName = match[3];

      const stateKey = `${objName.toLowerCase()}:${stateName.toLowerCase()}`;
      const stateNode = stateMap.get(stateKey);
      const procNode = getOrCreateNode(procName, 'process');

      if (stateNode) {
        edges.push({
          id: `e-${stateNode.id}-${procNode.id}`,
          source: stateNode.id,
          target: procNode.id,
          sourceHandle: 'val-out',
          targetHandle: 'cond-in',
          data: { type: 'condition' }
        });
      }
      return;
    }

    match = line.match(/^(.+?)\s+conditions\s+(.+?)\.$/i);
    if (match) {
      matched = true;
      const obj = getOrCreateNode(match[1], 'object');
      const proc = getOrCreateNode(match[2], 'process');

      edges.push({
        id: `e-${obj.id}-${proc.id}`,
        source: obj.id,
        target: proc.id,
        sourceHandle: 'std-out',
        targetHandle: 'cond-in',
        data: { type: 'condition' }
      });
      return;
    }

    // 11. Satisfies / verifies traceability links
    match = line.match(/^(.+?)\s+(satisfies|verifies)\s+(.+?)\.$/i);
    if (match) {
      matched = true;
      const src = getOrCreateNode(match[1], 'requirement');
      src.type = 'opmObject';
      const target = getOrCreateNode(match[3], 'object');
      edges.push({
        id: `e-${src.id}-${target.id}`,
        source: src.id,
        target: target.id,
        sourceHandle: 'std-out',
        targetHandle: 'res-in',
        data: { type: match[2].toLowerCase() as 'satisfies' | 'verifies' }
      });
      return;
    }

    // If we've made declarations like "Object X." or "Process Y.", skip flagging them
    if (line.match(/^Object\s+[^.]+\.$/i) || line.match(/^Process\s+[^.]+\.$/i) || line.match(/^Requirement\s+[^.]+\.$/i)) {
      matched = true;
      return;
    }

    // If it reaches here and wasn't matched, flag a syntax error
    if (!matched) {
      errors.push({
        line: lineNum,
        message: `Syntax Error: Could not parse OPL sentence "${line}".`,
        severity: 'error'
      });
    }
  });

  const finalNodes = layoutOpmGraph(nodes, edges);
  return { nodes: finalNodes, edges, errors };
}
