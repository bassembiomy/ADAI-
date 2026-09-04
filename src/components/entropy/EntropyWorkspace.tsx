import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  useReactFlow,
  getBezierPath,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { OPMObjectNode, OPMProcessNode, OPMStateNode } from './OPMNodeComponents';
import { OPMEdge } from './OPMEdgeComponents';
import { OPMNodeData, OPMEdgeData, OPMLinkType, SimulationLog, OPMState, OPMPort, type AppNode, type AppEdge } from './EntropyTypes';
import { OpmCodeGenerationWorkspace, createInitialArtifactState, type OpmArtifactState } from './OpmCodeGenerationWorkspace';
import { generateOpl, parseOpl, OplSyntaxError } from './OplParser';
import {
  OpmSimulationState,
  createSimulationState,
  initializeSimulation,
  stepSimulation,
  applySimResultToNodes,
} from './OpmSimulationEngine';
import { SmartShowPanel } from './SmartShowPanel';
import { OpmLegend } from './OpmLegend';
import { OpmDiagnosticsBadge } from './OpmDiagnosticsBadge';
import type { OpmSourceRef } from '../../engine/opm/executableTypes';
import { importSysmlToOpm } from './SysmlToOpmImporter';
import { validateOpmConnection } from './OpmLinkRules';
import { layoutOpmGraph } from './OpmAutoLayout';
import { resolveBlockOverlap, type RectBounds } from './OpmCollisionAvoidance';
import type { SysMLDiagramState } from '../../types/sysml_types';
import { Play, Pause, RotateCcw, ArrowRight, Layout, Download, Upload, ZoomIn, ZoomOut, Check, X, Plus, Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { OPM_EXAMPLES } from './EntropyExamples';

const nodeTypes = {
  opmObject: OPMObjectNode,
  opmProcess: OPMProcessNode,
  opmState: OPMStateNode,
};

const edgeTypes = {
  opmEdge: OPMEdge,
};

const OPMConnectionLine = ({
  fromX,
  fromY,
  fromPosition,
  toX,
  toY,
  toPosition,
  fromNode
}: any) => {
  const color = '#fbbf24'; // Warm golden-amber light
  const { screenToFlowPosition } = useReactFlow();
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const targetsRef = useRef<{ x: number; y: number; flowX: number; flowY: number }[]>([]);

  useEffect(() => {
    const sourceHandleEl = document.querySelector('.react-flow__handle-connecting');
    if (!sourceHandleEl) return;

    const isSourceStart = sourceHandleEl.classList.contains('source');
    const oppositeType = isSourceStart ? 'target' : 'source';
    const handleElements = document.querySelectorAll(
      oppositeType === 'target'
        ? '.react-flow__handle.target'
        : '.react-flow__handle.source'
    );

    const targets: { x: number; y: number; flowX: number; flowY: number }[] = [];
    handleElements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const hX = rect.left + rect.width / 2;
      const hY = rect.top + rect.height / 2;
      const flowPos = screenToFlowPosition({ x: hX, y: hY });
      targets.push({
        x: hX,
        y: hY,
        flowX: flowPos.x,
        flowY: flowPos.y
      });
    });
    targetsRef.current = targets;
  }, [screenToFlowPosition]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('pointermove', handleMouseMove);
    return () => window.removeEventListener('pointermove', handleMouseMove);
  }, []);

  let finalToX = toX;
  let finalToY = toY;
  let minDistance = 30; // snap threshold
  let snappedTarget = null;

  for (const target of targetsRef.current) {
    const dist = Math.hypot(target.x - mousePos.x, target.y - mousePos.y);
    if (dist < minDistance) {
      minDistance = dist;
      snappedTarget = target;
    }
  }

  if (snappedTarget) {
    finalToX = snappedTarget.flowX;
    finalToY = snappedTarget.flowY;
  }

  const [path] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: finalToX,
    targetY: finalToY,
    targetPosition: toPosition
  });

  return (
    <g>
      <path
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeOpacity={0.4}
        d={path}
        style={{ filter: `drop-shadow(0 0 6px ${color})` }}
      />
      <path fill="none" stroke={color} strokeWidth={2.5} strokeDasharray="6 4" d={path} />
      <circle
        cx={finalToX}
        cy={finalToY}
        fill="#fbbf24"
        r={4.5}
        stroke="#ffffff"
        strokeWidth={1.5}
        style={{ filter: `drop-shadow(0 0 8px ${color})` }}
      />
    </g>
  );
};

interface EntropyWorkspaceProps {
  initialNodes?: AppNode[];
  initialEdges?: AppEdge[];
  availableVariables: any[];
  onVariablesChange: (vars: any[]) => void;
  tickMs: number;
  onTickMsChange?: (tickMs: number) => void;
  onBack: () => void;
  onSave?: (nodes: AppNode[], edges: AppEdge[]) => void;
  onAddError?: (type: 'error' | 'warning' | 'info', message: string, source?: string) => void;
  sysmlState?: SysMLDiagramState;
}

export const EntropyWorkspace: React.FC<EntropyWorkspaceProps> = ({
  initialNodes = [],
  initialEdges = [],
  availableVariables,
  onVariablesChange,
  tickMs,
  onTickMsChange,
  onBack,
  onSave,
  onAddError,
  sysmlState,
}) => {
  // --- States ---
  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<AppEdge>([]);
  
  // Breadcrumb / Nesting path: ['root', 'proc-1', etc.]
  const [zoomPath, setZoomPath] = useState<string[]>(['root']);
  const activeParentId = useMemo(() => {
    return zoomPath[zoomPath.length - 1] === 'root' ? null : zoomPath[zoomPath.length - 1];
  }, [zoomPath]);

  // Selected tool / link types
  const [activeTool, setActiveTool] = useState<'select' | 'object' | 'process' | 'state' | 'requirement'>('select');
  const [activeLinkType, setActiveLinkType] = useState<OPMLinkType>('consumption');
  const reactFlowInstanceRef = useRef<any>(null);

  // Text editor integration (bimodal)
  const [oplText, setOplText] = useState<string>('');
  const [oplErrors, setOplErrors] = useState<OplSyntaxError[]>([]);
  const [isEditingText, setIsEditingText] = useState<boolean>(false);
  const [textVersion, setTextVersion] = useState<string>('');

  // Undo/Redo Stacks
  const [undoStack, setUndoStack] = useState<{ nodes: AppNode[]; edges: AppEdge[] }[]>([]);
  const [redoStack, setRedoStack] = useState<{ nodes: AppNode[]; edges: AppEdge[] }[]>([]);

  // Simulation Runner
  const [simRunning, setSimRunning] = useState<boolean>(false);
  const [simLogs, setSimLogs] = useState<SimulationLog[]>([]);
  const [firingProcesses, setFiringProcesses] = useState<Set<string>>(new Set());
  const simStateRef = useRef<OpmSimulationState>(createSimulationState());
  
  // Selected Node Details
  const [selectedNode, setSelectedNode] = useState<AppNode | null>(null);

  // New Port Manager States
  const [newPortName, setNewPortName] = useState('');
  const [newPortDir, setNewPortDir] = useState<'input' | 'output'>('input');
  const [newPortPos, setNewPortPos] = useState<'left' | 'right' | 'top' | 'bottom'>('left');
  const [newPortType, setNewPortType] = useState<OPMPort['type']>('standard');

  // Right Sidebar active tab
  const [rightTab, setRightTab] = useState<'simControl' | 'opl' | 'smartShow' | 'opmCodegen'>('simControl');
  const [opmArtifactState, setOpmArtifactState] = useState<OpmArtifactState>(createInitialArtifactState);

  const handleNavigateToDiagnostic = useCallback((source: OpmSourceRef) => {
    const node = nodes.find(n => n.id === source.elementId);
    if (node) {
      setSelectedNode(node);
    }
    setTimeout(() => {
      const el = document.querySelector(`[data-opm-path="${source.propertyPath}"]`);
      if (el instanceof HTMLElement) {
        el.focus();
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 60);
  }, [nodes]);

  // --- Initialize canvas ---
  useEffect(() => {
    if (initialNodes.length > 0) {
      setNodes(initialNodes);
    } else {
      // Default smart home template if empty
      const smartHomeEx = OPM_EXAMPLES.smartHome;
      const { nodes: parsedNodes, edges: parsedEdges, errors } = parseOpl(smartHomeEx.oplText);
      simStateRef.current = initializeSimulation(parsedNodes);
      const initializedNodes = applySimResultToNodes(parsedNodes, simStateRef.current, []);
      setNodes(initializedNodes);
      setEdges(parsedEdges);
      setOplText(smartHomeEx.oplText);
      setOplErrors(errors);
      logSim('success', 'Smart Home System design loaded as default context.');
    }
    if (initialEdges.length > 0) {
      setEdges(initialEdges);
    }
  }, [initialNodes, initialEdges]);

  // --- Auto-generate OPL ---
  useEffect(() => {
    if (!isEditingText) {
      const generated = generateOpl(nodes, edges);
      setOplText(generated);
      setOplErrors([]);
    }
  }, [nodes, edges, isEditingText]);

  // --- Auto-layout Child States inside parent Objects ---
  useEffect(() => {
    const parentNodes = nodes.filter(n => n.type === 'opmObject');
    let nodesChanged = false;

    const STATE_WIDTH = 95;
    const STATE_GAP_X = 12;
    const STATE_START_X = 18;
    const STATE_START_Y = 56;

    const updatedNodes = nodes.map(node => {
      if (node.type === 'opmState' && node.parentId) {
        const parent = parentNodes.find(p => p.id === node.parentId);
        if (parent) {
          const siblingStates = nodes.filter(n => n.type === 'opmState' && n.parentId === parent.id);
          const index = siblingStates.findIndex(n => n.id === node.id);
          if (index !== -1) {
            const targetX = STATE_START_X + index * (STATE_WIDTH + STATE_GAP_X);
            const targetY = STATE_START_Y;

            if (Math.abs(node.position.x - targetX) > 1 || Math.abs(node.position.y - targetY) > 1) {
              nodesChanged = true;
              return {
                ...node,
                position: { x: targetX, y: targetY }
              };
            }
          }
        }
      }
      return node;
    });

    if (nodesChanged) {
      setNodes(updatedNodes);
    }
  }, [nodes, setNodes]);

  // --- Record History for Undo ---
  const saveHistory = useCallback((currentNodes: AppNode[], currentEdges: AppEdge[]) => {
    setUndoStack(prev => [...prev.slice(-49), { nodes: JSON.parse(JSON.stringify(currentNodes)), edges: JSON.parse(JSON.stringify(currentEdges)) }]);
    setRedoStack([]); // Clear redo
  }, []);

  const triggerUndo = () => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, { nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }]);
    setNodes(previous.nodes);
    setEdges(previous.edges);
    if (onSave) onSave(previous.nodes, previous.edges);
  };

  const triggerRedo = () => {
    if (redoStack.length === 0) return;
    const nextState = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev, { nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }]);
    setNodes(nextState.nodes);
    setEdges(nextState.edges);
    if (onSave) onSave(nextState.nodes, nextState.edges);
  };

  // --- Node Filtering based on Zoom ---
  const filteredNodes = useMemo(() => {
    return nodes.filter(n => {
      if (n.data.type === 'state') {
        // States are rendered inside objects. React Flow nodes with parentId:
        // We only render them if their parent object node is visible.
        const parent = nodes.find(p => p.id === n.parentId);
        if (!parent) return false;
        return parent.data.parentId === activeParentId;
      }
      return n.data.parentId === activeParentId;
    });
  }, [nodes, activeParentId]);

  const filteredEdges = useMemo(() => {
    return edges.filter(e => {
      const srcNode = nodes.find(n => n.id === e.source);
      const tgtNode = nodes.find(n => n.id === e.target);
      if (!srcNode || !tgtNode) return false;
      
      // Determine if edge belongs in this zoom view.
      // If either source or target parent matches activeParentId:
      const srcParent = srcNode.data.parentId || null;
      const tgtParent = tgtNode.data.parentId || null;
      return srcParent === activeParentId || tgtParent === activeParentId;
    });
  }, [edges, nodes, activeParentId]);

  // --- Add State inside Object ---
  const handleAddStateToObject = useCallback((objectId: string, customName?: string) => {
    saveHistory(nodes, edges);
    const targetObject = nodes.find(n => n.id === objectId);
    if (!targetObject || targetObject.data.type !== 'object') return;

    const existingStates = targetObject.data.states || [];
    const stateId = uuidv4();
    const stateName = customName?.trim() || `State_${existingStates.length + 1}`;

    const STATE_WIDTH = 95;
    const STATE_GAP_X = 12;
    const STATE_START_X = 18;
    const STATE_START_Y = 56;
    const newIdx = existingStates.length;
    const isInitial = existingStates.length === 0;

    const newStateNode: AppNode = {
      id: stateId,
      type: 'opmState',
      parentId: targetObject.id,
      extent: 'parent',
      position: {
        x: STATE_START_X + newIdx * (STATE_WIDTH + STATE_GAP_X),
        y: STATE_START_Y,
      },
      data: {
        name: stateName,
        type: 'state',
        physical: false,
        states: [],
        attributes: [],
        parentId: targetObject.id,
        isInitial,
        isActive: isInitial,
        inputs: [],
        outputs: [
          { id: `val-out-${stateId}`, name: 'Val', type: 'standard', direction: 'output', position: 'right' }
        ],
      },
    };

    const newStatesList: OPMState[] = [
      ...existingStates,
      { id: stateId, name: stateName, isInitial, isActive: isInitial }
    ];

    setNodes(prev => {
      const updated = prev.map(n => {
        if (n.id === objectId) {
          return {
            ...n,
            data: {
              ...n.data,
              states: newStatesList,
            }
          };
        }
        return n;
      });
      return [...updated, newStateNode];
    });

    if (isInitial) {
      simStateRef.current = {
        ...simStateRef.current,
        objectActiveState: {
          ...simStateRef.current.objectActiveState,
          [objectId]: stateId,
        }
      };
    }

    // Refresh selectedNode if it's the target object
    setSelectedNode(prev => {
      if (prev && prev.id === objectId) {
        return {
          ...prev,
          data: {
            ...prev.data,
            states: newStatesList,
          }
        };
      }
      return prev;
    });

    logSim('success', `Added state [${stateName}] inside Object [${targetObject.data.name}].`);
  }, [nodes, edges, saveHistory]);

  const handleDeleteState = useCallback((stateId: string, parentObjectId: string) => {
    saveHistory(nodes, edges);
    setNodes(prev => {
      const filtered = prev.filter(n => n.id !== stateId);
      return filtered.map(n => {
        if (n.id === parentObjectId) {
          const remainingStates = (n.data.states || []).filter(s => s.id !== stateId);
          return {
            ...n,
            data: {
              ...n.data,
              states: remainingStates,
            }
          };
        }
        return n;
      });
    });

    setEdges(prev => prev.filter(e => e.source !== stateId && e.target !== stateId));

    setSelectedNode(prev => {
      if (prev && prev.id === parentObjectId) {
        const remainingStates = (prev.data.states || []).filter(s => s.id !== stateId);
        return {
          ...prev,
          data: {
            ...prev.data,
            states: remainingStates,
          }
        };
      }
      return prev;
    });

    logSim('info', `Removed state from Object.`);
  }, [nodes, edges, saveHistory]);

  // --- Add Elements visually via Canvas Pane Click ---
  const handlePaneClick = useCallback((event: React.MouseEvent) => {
    if (activeTool === 'select') {
      setSelectedNode(null);
      return;
    }

    if (activeTool === 'state') {
      logSim('info', 'Click directly on an Object rectangle to add a State inside it.');
      return;
    }

    saveHistory(nodes, edges);

    // Calculate accurate flow position from screen coordinates
    let flowPos = { x: 200, y: 200 };
    if (reactFlowInstanceRef.current?.screenToFlowPosition) {
      flowPos = reactFlowInstanceRef.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
    }

    const id = uuidv4();
    const isReq = activeTool === 'requirement';
    const isProc = activeTool === 'process';
    const nodeName = isReq
      ? `REQ_${id.substring(0, 4).toUpperCase()}`
      : `${activeTool.charAt(0).toUpperCase() + activeTool.slice(1)}_${id.substring(0, 4)}`;

    const defaultInputs: OPMPort[] = [];
    const defaultOutputs: OPMPort[] = [];

    if (activeTool === 'object') {
      defaultInputs.push(
        { id: 'res-in', name: 'Result', type: 'result', direction: 'input', position: 'left' },
        { id: 'eff-in', name: 'Effect', type: 'effect', direction: 'input', position: 'top' }
      );
      defaultOutputs.push(
        { id: 'std-out', name: 'Out', type: 'standard', direction: 'output', position: 'right' },
        { id: 'agt-out', name: 'Agent', type: 'agent', direction: 'output', position: 'bottom' },
        { id: 'inst-out', name: 'Instrument', type: 'instrument', direction: 'output', position: 'bottom' }
      );
    } else if (isProc) {
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
    }

    const newNode: AppNode = {
      id,
      type: isProc ? 'opmProcess' : 'opmObject',
      position: { x: Math.round(flowPos.x), y: Math.round(flowPos.y) },
      data: {
        name: nodeName,
        type: isReq ? 'requirement' : (activeTool as any),
        physical: false,
        states: [],
        attributes: [],
        parentId: activeParentId,
        requirementText: isReq ? `The system shall perform function [${nodeName}].` : undefined,
        inputs: defaultInputs,
        outputs: defaultOutputs,
      },
    };

    setNodes(prev => [...prev, newNode]);
    setSelectedNode(newNode);
    setActiveTool('select');
    logSim('success', `Created ${isReq ? 'Requirement' : activeTool.toUpperCase()} [${nodeName}] at (${Math.round(flowPos.x)}, ${Math.round(flowPos.y)}).`);
  }, [activeTool, activeParentId, nodes, edges, saveHistory]);

  // --- Connect nodes (draw OPM links) ---
  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;

    const src = nodes.find(n => n.id === connection.source);
    const tgt = nodes.find(n => n.id === connection.target);
    if (!src || !tgt) return;

    // ISO 19450 link-role validation (OpmLinkRules.ts)
    const verdict = validateOpmConnection(activeLinkType, src.data.type, tgt.data.type);
    if (!verdict.allowed) {
      if (onAddError) onAddError('error', `OPM link rejected: ${verdict.reason}`, 'ENTROPY');
      logSim('error', `Link rejected [${activeLinkType}]: ${verdict.reason}`);
      return;
    }

    saveHistory(nodes, edges);

    const newEdge: AppEdge = {
      id: `e-${connection.source}-${connection.sourceHandle || 'std-out'}-${connection.target}-${connection.targetHandle || 'res-in'}`,
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle || undefined,
      targetHandle: connection.targetHandle || undefined,
      type: 'opmEdge',
      data: {
        type: activeLinkType,
      },
    };

    setEdges(prev => addEdge(newEdge, prev));
    logSim('info', `Link [${activeLinkType}] connected: ${src.data.name} → ${tgt.data.name}`);
  }, [activeLinkType, nodes, edges, saveHistory, onAddError]);

  // --- Dynamic Port Handlers ---
  const handleAddPort = (name: string, direction: 'input' | 'output', position: 'left' | 'right' | 'top' | 'bottom', type: any) => {
    if (!selectedNode) return;
    saveHistory(nodes, edges);

    const portId = `${direction === 'input' ? 'in' : 'out'}-${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now().toString().slice(-4)}`;
    const newPort: OPMPort = { id: portId, name, type, direction, position };

    setNodes(prev => prev.map(n => {
      if (n.id === selectedNode.id) {
        const inputs = n.data.inputs || [];
        const outputs = n.data.outputs || [];
        return {
          ...n,
          data: {
            ...n.data,
            inputs: direction === 'input' ? [...inputs, newPort] : inputs,
            outputs: direction === 'output' ? [...outputs, newPort] : outputs
          }
        };
      }
      return n;
    }));

    setSelectedNode(prev => {
      if (!prev) return null;
      const inputs = prev.data.inputs || [];
      const outputs = prev.data.outputs || [];
      return {
        ...prev,
        data: {
          ...prev.data,
          inputs: direction === 'input' ? [...inputs, newPort] : inputs,
          outputs: direction === 'output' ? [...outputs, newPort] : outputs
        }
      };
    });
  };

  const handleRemovePort = (portId: string, direction: 'input' | 'output') => {
    if (!selectedNode) return;
    saveHistory(nodes, edges);

    setNodes(prev => prev.map(n => {
      if (n.id === selectedNode.id) {
        const inputs = n.data.inputs || [];
        const outputs = n.data.outputs || [];
        return {
          ...n,
          data: {
            ...n.data,
            inputs: direction === 'input' ? inputs.filter(p => p.id !== portId) : inputs,
            outputs: direction === 'output' ? outputs.filter(p => p.id !== portId) : outputs
          }
        };
      }
      return n;
    }));

    setEdges(prev => prev.filter(e => e.sourceHandle !== portId && e.targetHandle !== portId));

    setSelectedNode(prev => {
      if (!prev) return null;
      const inputs = prev.data.inputs || [];
      const outputs = prev.data.outputs || [];
      return {
        ...prev,
        data: {
          ...prev.data,
          inputs: direction === 'input' ? inputs.filter(p => p.id !== portId) : inputs,
          outputs: direction === 'output' ? outputs.filter(p => p.id !== portId) : outputs
        }
      };
    });
  };

  // --- Manual Simulation Activation & Initializations ---
  const handleManualActivateState = useCallback((stateId: string, parentObjId: string) => {
    saveHistory(nodes, edges);

    const parentObj = nodes.find(n => n.id === parentObjId);
    const targetState = nodes.find(n => n.id === stateId);
    if (!parentObj || !targetState) return;

    const parentObjName = parentObj.data.name;
    const stateName = targetState.data.name;

    // Latch state in the simulation engine ref
    simStateRef.current = {
      ...simStateRef.current,
      objectActiveState: {
        ...simStateRef.current.objectActiveState,
        [parentObjId]: stateId,
      },
      pendingEvents: [
        ...simStateRef.current.pendingEvents,
        { stateId, objectId: parentObjId, tick: simStateRef.current.tick },
      ],
    };

    // Update nodes immutably using applySimResultToNodes
    setNodes(prevNodes => applySimResultToNodes(prevNodes, simStateRef.current, []));

    // Update global variables
    onVariablesChange(availableVariables.map(v => {
      if (v.name.toLowerCase() === parentObjName.toLowerCase()) {
        let val: number | boolean | string = stateName;
        if (stateName.toLowerCase() === 'on' || stateName.toLowerCase() === 'high' || stateName.toLowerCase() === 'active') val = 1;
        if (stateName.toLowerCase() === 'off' || stateName.toLowerCase() === 'low' || stateName.toLowerCase() === 'inactive') val = 0;
        return { ...v, currentValue: val };
      }
      return v;
    }));

    logSim('success', `Manual Override: Latched state of [${parentObjName}] to [${stateName}]`);
  }, [nodes, edges, availableVariables, onVariablesChange, saveHistory]);

  const handleManualTriggerProcess = useCallback((processId: string) => {
    saveHistory(nodes, edges);

    const processNode = nodes.find(n => n.id === processId);
    if (!processNode) return;

    logSim('info', `Manual Trigger: Firing Process [${processNode.data.name}]`);

    // Find result / effect edges where this process is the source
    const targetEdges = edges.filter(e => e.source === processId && (e.data?.type === 'result' || e.data?.type === 'effect'));
    const consumptionEdges = edges.filter(e => e.target === processId && e.data?.type === 'consumption');

    const nextActive = { ...simStateRef.current.objectActiveState };
    const newEvents = [...simStateRef.current.pendingEvents];

    targetEdges.forEach(edge => {
      const tgtNode = nodes.find(n => n.id === edge.target);
      if (tgtNode && tgtNode.data.type === 'state' && tgtNode.parentId) {
        nextActive[tgtNode.parentId] = tgtNode.id;
        newEvents.push({ stateId: tgtNode.id, objectId: tgtNode.parentId, tick: simStateRef.current.tick });
      }
    });

    consumptionEdges.forEach(edge => {
      const srcNode = nodes.find(n => n.id === edge.source);
      if (srcNode && srcNode.data.type === 'state' && srcNode.parentId) {
        if (nextActive[srcNode.parentId] === srcNode.id) {
          nextActive[srcNode.parentId] = null;
        }
      }
    });

    simStateRef.current = {
      ...simStateRef.current,
      objectActiveState: nextActive,
      pendingEvents: newEvents,
    };

    // Apply firing state to nodes
    setNodes(prevNodes => applySimResultToNodes(prevNodes, simStateRef.current, [processId]));

    // Sync global variables
    const varsToUpdate = Object.entries(nextActive);
    if (varsToUpdate.length > 0) {
      onVariablesChange(availableVariables.map(v => {
        const match = varsToUpdate.find(([parentId, stateId]) => {
          const parentObj = nodes.find(n => n.id === parentId);
          return parentObj && v.name.toLowerCase() === parentObj.data.name.toLowerCase();
        });
        if (match && match[1]) {
          const stateNode = nodes.find(n => n.id === match[1]);
          const stateName = stateNode ? stateNode.data.name : '';
          let val: number | boolean | string = stateName;
          if (stateName.toLowerCase() === 'on' || stateName.toLowerCase() === 'high' || stateName.toLowerCase() === 'active') val = 1;
          if (stateName.toLowerCase() === 'off' || stateName.toLowerCase() === 'low' || stateName.toLowerCase() === 'inactive') val = 0;
          return { ...v, currentValue: val };
        }
        return v;
      }));
    }

    // Reset process isFiring after 600ms
    setTimeout(() => {
      setNodes(prevNodes => applySimResultToNodes(prevNodes, simStateRef.current, []));
    }, 600);

  }, [nodes, edges, availableVariables, onVariablesChange, saveHistory]);

  const handleAutoInitializeStates = useCallback(() => {
    saveHistory(nodes, edges);
    simStateRef.current = initializeSimulation(nodes);
    setNodes(prevNodes => applySimResultToNodes(prevNodes, simStateRef.current, []));
    logSim('success', 'Auto-initialized all stateful objects to their initial state.');
  }, [nodes, edges, saveHistory]);

  // --- OPL Text Sync (Sync to Canvas) ---
  const applyOplChanges = () => {
    const { nodes: parsedNodes, edges: parsedEdges, errors } = parseOpl(oplText, nodes);
    setOplErrors(errors);

    if (errors.length > 0) {
      if (onAddError) onAddError('error', `OPL compilation failed with ${errors.length} errors.`, 'ENTROPY');
      return;
    }

    saveHistory(nodes, edges);
    setNodes(parsedNodes);
    setEdges(parsedEdges);
    setIsEditingText(false);
    logSim('success', 'OPL changes synchronized successfully to canvas.');
    if (onSave) onSave(parsedNodes, parsedEdges);
  };

  // --- Auto-Layout Algorithms ---
  const triggerAutoLayout = (type: 'force' | 'hierarchy') => {
    saveHistory(nodes, edges);
    const updatedNodes = layoutOpmGraph(nodes, edges, {
      columnGap: type === 'hierarchy' ? 420 : 360,
      rowGap: type === 'hierarchy' ? 55 : 40,
      startX: 80,
      startY: 80,
    });
    setNodes(updatedNodes);
    logSim('success', `Collision-free ${type === 'force' ? 'force-balanced' : 'hierarchical'} layout applied.`);
  };

  // --- Zoom In/Out hierarchical navigation ---
  const handleZoomInNode = (nodeId: string) => {
    const target = nodes.find(n => n.id === nodeId);
    if (!target) return;

    if (target.data.type === 'state') {
      if (onAddError) onAddError('warning', 'Zooming inside object states is not supported. Zoom inside the parent Object or Process instead.', 'ENTROPY');
      return;
    }

    setZoomPath(prev => [...prev, nodeId]);
    logSim('info', `Zoomed into ${target.data.type} [${target.data.name}] body`);
  };

  const handleZoomOut = () => {
    if (zoomPath.length <= 1) return;
    setZoomPath(prev => prev.slice(0, -1));
    logSim('info', 'Zoomed back up one level');
  };

  // --- Simulation Runner Engine ---
  const runSimTick = useCallback(() => {
    const result = stepSimulation(nodes, edges, simStateRef.current);
    simStateRef.current = result.state;
    setNodes(prev => applySimResultToNodes(prev, result.state, result.firingProcessIds));
    result.logs.forEach(l => logSim(l.type, l.message));
  }, [nodes, edges]);

  // Handle simulation timer
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (simRunning) {
      interval = setInterval(runSimTick, tickMs);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [simRunning, tickMs, runSimTick]);

  const toggleSimulation = () => {
    if (!simRunning && simStateRef.current.tick === 0) {
      simStateRef.current = initializeSimulation(nodes);
      setNodes(prev => applySimResultToNodes(prev, simStateRef.current, []));
    }
    setSimRunning(!simRunning);
    logSim('info', simRunning ? 'Simulation paused.' : 'Simulation running...');
  };

  const resetSimulation = () => {
    setSimRunning(false);
    simStateRef.current = initializeSimulation(nodes);
    setNodes(prev => applySimResultToNodes(prev, simStateRef.current, []));
    logSim('info', 'Simulation reset: objects initialized to their first state.');
  };

  const handleStepClick = () => {
    runSimTick();
    logSim('info', 'Single-step tick executed.');
  };

  const logSim = (type: 'info' | 'success' | 'warning' | 'error', message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setSimLogs(prev => [...prev.slice(-20), { timestamp, type, message }]);
  };

  // --- Properties Panel Interactions ---
  const handleNodeClick = useCallback((_: any, node: AppNode) => {
    // If state creation tool is active and user clicks an Object
    if (activeTool === 'state' && node.data.type === 'object') {
      handleAddStateToObject(node.id);
      setActiveTool('select');
      setSelectedNode(node);
      return;
    }

    setSelectedNode(node);
    if (node.data.type === 'state' && node.parentId) {
      handleManualActivateState(node.id, node.parentId);
    }
  }, [activeTool, handleAddStateToObject, handleManualActivateState]);

  const handleUpdateNodeProp = (key: string, value: any) => {
    if (!selectedNode) return;
    saveHistory(nodes, edges);

    setNodes(prev => prev.map(n => {
      if (n.id === selectedNode.id) {
        let updatedData = { ...n.data };
        if (key === 'name') updatedData.name = value;
        if (key === 'physical') updatedData.physical = value;

        // If Object name changed, update states list if there's parent mappings
        return {
          ...n,
          data: updatedData
        };
      }
      return n;
    }));

    // Update locally selected node as well
    setSelectedNode(prev => {
      if (!prev) return null;
      let updatedData = { ...prev.data };
      if (key === 'name') updatedData.name = value;
      if (key === 'physical') updatedData.physical = value;
      return { ...prev, data: updatedData };
    });
  };

  const handleDeleteSelectedNode = () => {
    if (!selectedNode) return;
    saveHistory(nodes, edges);

    setNodes(prev => prev.filter(n => n.id !== selectedNode.id && n.parentId !== selectedNode.id));
    setEdges(prev => prev.filter(e => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setSelectedNode(null);
    logSim('warning', `Element ${selectedNode.data.name} deleted.`);
  };

  const handleAddAttribute = (key: string, val: string) => {
    if (!selectedNode || selectedNode.data.type !== 'object') return;
    saveHistory(nodes, edges);

    const attrs = selectedNode.data.attributes || [];
    const updatedAttrs = [...attrs, { key, value: val }];

    setNodes(prev => prev.map(n => {
      if (n.id === selectedNode.id) {
        return {
          ...n,
          data: {
            ...n.data,
            attributes: updatedAttrs
          }
        };
      }
      return n;
    }));

    setSelectedNode(prev => {
      if (!prev) return null;
      return {
        ...prev,
        data: {
          ...prev.data,
          attributes: updatedAttrs
        }
      };
    });
  };

  const handleEdgeTypeChange = useCallback((edgeId: string, newType: OPMLinkType) => {
    setEdges(eds => eds.map(edge => edge.id === edgeId ? { ...edge, data: { ...edge.data, type: newType } } : edge));
  }, [setEdges]);

  const handleEdgeDelete = useCallback((edgeId: string) => {
    setEdges(eds => eds.filter(edge => edge.id !== edgeId));
  }, [setEdges]);

  const handleNodeDragStop = useCallback((_: unknown, node: AppNode) => {
    if (node.parentId) return;

    setNodes((currentNodes) => {
      const movingNode = currentNodes.find((n) => n.id === node.id);
      if (!movingNode) return currentNodes;

      const otherNodes: RectBounds[] = currentNodes
        .filter((n) => n.id !== node.id && !n.parentId && n.position)
        .map((n) => ({
          id: n.id,
          x: n.position.x,
          y: n.position.y,
          width: (n.measured?.width ?? (n.width as number)) || 220,
          height: (n.measured?.height ?? (n.height as number)) || 80,
        }));

      const movingBounds: RectBounds = {
        id: movingNode.id,
        x: movingNode.position.x,
        y: movingNode.position.y,
        width: (movingNode.measured?.width ?? (movingNode.width as number)) || 220,
        height: (movingNode.measured?.height ?? (movingNode.height as number)) || 80,
      };

      const resolution = resolveBlockOverlap(movingBounds, otherNodes, 16);
      if (!resolution.collided) return currentNodes;

      return currentNodes.map((n) =>
        n.id === node.id
          ? { ...n, position: { x: resolution.x, y: resolution.y } }
          : n
      );
    });
  }, [setNodes]);

  const mappedEdges = useMemo(() => {
    return filteredEdges.map(e => {
      const srcNode = nodes.find(n => n.id === e.source);
      const tgtNode = nodes.find(n => n.id === e.target);

      let isActiveFlow = false;
      if (simRunning && srcNode && tgtNode) {
        const isSrcActiveState = srcNode.data.type === 'state' && (srcNode.data as any).isActive;
        const isSrcFiringProcess = srcNode.data.type === 'process' && (srcNode.data as any).isFiring;
        const isTgtFiringProcess = tgtNode.data.type === 'process' && (tgtNode.data as any).isFiring;

        if (e.data?.type === 'condition' || e.data?.type === 'trigger' || e.data?.type === 'agent' || e.data?.type === 'instrument') {
          isActiveFlow = !!isSrcActiveState && !!isTgtFiringProcess;
        } else if (e.data?.type === 'result' || e.data?.type === 'effect' || e.data?.type === 'consumption') {
          isActiveFlow = !!isSrcFiringProcess;
        }
      }

      return {
        ...e,
        data: {
          ...e.data,
          isSimulating: simRunning,
          isActiveFlow,
          onTypeChange: (newType: OPMLinkType) => handleEdgeTypeChange(e.id, newType),
          onDelete: () => handleEdgeDelete(e.id),
        }
      };
    });
  }, [filteredEdges, nodes, simRunning, handleEdgeTypeChange, handleEdgeDelete]);

  const numIn = selectedNode?.data?.inputs?.length || 0;
  const numOut = selectedNode?.data?.outputs?.length || 0;
  const selectedNodePortsCount = numIn + numOut;

  return (
    <div className="flex h-full w-full bg-[#0d0d0d] text-[#e0e0e0] font-sans">
      {/* 1. Left canvas and sidebar */}
      <div className="flex-1 flex flex-col h-full overflow-hidden border-r border-[#222]">
        {/* Navigation / Control bar */}
        <div className="h-12 bg-[#141414] border-b border-[#222] px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="px-2.5 py-1 text-xs border border-[#333] rounded hover:bg-[#222] transition-colors"
            >
              ← Back
            </button>
            <span className="text-xs text-[#888]">/</span>
            {/* Breadcrumbs */}
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              {zoomPath.map((zp, i) => {
                const label = zp === 'root' ? 'System Context' : nodes.find(n => n.id === zp)?.data.name || zp;
                return (
                  <React.Fragment key={zp}>
                    {i > 0 && <span className="text-[#555]">›</span>}
                    <button
                      onClick={() => setZoomPath(zoomPath.slice(0, i + 1))}
                      className={`hover:text-orange-400 transition-colors ${i === zoomPath.length - 1 ? 'text-orange-500 font-bold' : 'text-[#888]'}`}
                    >
                      {label}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Example Template Loader */}
          <div className="flex items-center gap-1.5 bg-[#1a1a1a] px-2.5 py-1 rounded border border-[#2d2d2d]">
            <span className="text-[10px] text-[#888] font-bold uppercase tracking-wider">Example:</span>
            <select
              onChange={(e) => {
                const val = e.target.value;
                if (val && OPM_EXAMPLES[val]) {
                  const selectedExample = OPM_EXAMPLES[val];
                  const { nodes: parsedNodes, edges: parsedEdges, errors } = parseOpl(selectedExample.oplText);
                  simStateRef.current = initializeSimulation(parsedNodes);
                  const initializedNodes = applySimResultToNodes(parsedNodes, simStateRef.current, []);
                  saveHistory(nodes, edges);
                  setNodes(initializedNodes);
                  setEdges(parsedEdges);
                  setOplText(selectedExample.oplText);
                  setOplErrors(errors);
                  logSim('success', `Loaded example model: ${selectedExample.name}`);
                  if (onSave) onSave(initializedNodes, parsedEdges);
                }
              }}
              defaultValue=""
              className="bg-[#0f0f0f] border border-[#333] rounded text-[11px] py-0.5 px-1.5 outline-none text-[#ccc] w-40 font-semibold"
            >
              <option value="" disabled>-- Load Template --</option>
              {Object.entries(OPM_EXAMPLES).map(([key, ex]) => (
                <option key={key} value={key}>{ex.name}</option>
              ))}
            </select>
            {sysmlState && (
              <button
                onClick={() => {
                  const { nodes: impNodes, edges: impEdges, warnings } = importSysmlToOpm(sysmlState);
                  saveHistory(nodes, edges);
                  setNodes(impNodes);
                  setEdges(impEdges);
                  setOplText('');
                  warnings.forEach(w => logSim('warning', w));
                  logSim('success', `Imported ${impNodes.length} OPM elements from the SysML model.`);
                  if (onSave) onSave(impNodes, impEdges);
                }}
                className="px-2.5 py-1 text-[10px] border border-purple-700 text-purple-300 rounded hover:bg-purple-950/40 ml-1 font-semibold"
                title="Migrate the SysML BDD/IBD/Requirements model into this OPM workspace"
              >
                Import SysML → OPM
              </button>
            )}
          </div>

          {/* Simulation Tools */}
          <div className="flex items-center gap-2 bg-[#1a1a1a] px-3 py-1 rounded border border-[#2d2d2d]">
            <button
              onClick={toggleSimulation}
              className={`p-1 rounded transition-colors ${simRunning ? 'text-red-400 hover:bg-red-950/40' : 'text-green-400 hover:bg-green-950/40'}`}
              title={simRunning ? 'Pause Simulation' : 'Start Simulation'}
            >
              {simRunning ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button
              onClick={runSimTick}
              className="p-1 text-sky-400 hover:bg-sky-950/40 rounded transition-colors"
              title="Step Simulation"
            >
              <ArrowRight size={14} />
            </button>
            <button
              onClick={resetSimulation}
              className="p-1 text-amber-400 hover:bg-amber-950/40 rounded transition-colors"
              title="Reset Simulation"
            >
              <RotateCcw size={14} />
            </button>
            <span className="w-px h-4 bg-[#333]"></span>
            <span className="text-[10px] uppercase font-bold text-[#666]">
              {simRunning ? 'Running' : 'Paused'}
            </span>
            <span className="w-px h-4 bg-[#333]"></span>
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] uppercase tracking-wider font-extrabold text-[#777]">Interval:</span>
              <input
                type="range"
                min="100"
                max="2000"
                step="100"
                value={tickMs}
                onChange={(e) => onTickMsChange && onTickMsChange(Number(e.target.value))}
                className="w-16 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
                title="Simulation speed interval (ms)"
              />
              <span className="text-[9px] text-[#888] font-mono w-9 text-right">{tickMs}ms</span>
            </div>
          </div>

          {/* Graphical Operations */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={triggerUndo}
              disabled={undoStack.length === 0}
              className="p-1.5 border border-[#222] rounded hover:bg-[#222] text-[#888] disabled:opacity-30 disabled:hover:bg-transparent"
              title="Undo"
            >
              ↶
            </button>
            <button
              onClick={triggerRedo}
              disabled={redoStack.length === 0}
              className="p-1.5 border border-[#222] rounded hover:bg-[#222] text-[#888] disabled:opacity-30 disabled:hover:bg-transparent"
              title="Redo"
            >
              ↷
            </button>
            <span className="w-px h-4 bg-[#222] mx-1"></span>
            <button
              onClick={() => triggerAutoLayout('force')}
              className="px-2.5 py-1 text-xs border border-[#222] rounded hover:bg-[#222] flex items-center gap-1 text-[#aaa] hover:text-white"
              title="Force-Directed Auto Layout"
            >
              <Layout size={12} /> Force Layout
            </button>
            <button
              onClick={() => triggerAutoLayout('hierarchy')}
              className="px-2.5 py-1 text-xs border border-[#222] rounded hover:bg-[#222] flex items-center gap-1 text-[#aaa] hover:text-white"
              title="Grid/Hierarchy Auto Layout"
            >
              <Layout size={12} /> Hierarchy Layout
            </button>
          </div>
        </div>

        {/* Workspace core body */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* Tool Dock (Left floating bar) */}
          <div className="absolute left-3 top-3 z-10 bg-[#161616]/95 backdrop-blur-md border border-[#2d2d2d] rounded-lg p-2 flex flex-col gap-2 shadow-xl">
            <span className="text-[8px] uppercase tracking-wider font-extrabold text-orange-400/80 mb-0.5 text-center">Tools</span>
            <button
              onClick={() => setActiveTool('select')}
              className={`p-2 rounded text-xs transition-all flex flex-col items-center justify-center gap-0.5 ${
                activeTool === 'select' ? 'bg-[#f97316]/20 border border-[#f97316] text-[#f97316] font-bold shadow' : 'hover:bg-[#222] text-[#999]'
              }`}
              title="Select / Move elements"
            >
              🖱️ <span className="text-[8px]">Select</span>
            </button>
            <button
              onClick={() => setActiveTool('object')}
              className={`p-2 rounded text-xs transition-all flex flex-col items-center justify-center gap-0.5 ${
                activeTool === 'object' ? 'bg-emerald-950/60 border border-emerald-400 text-emerald-300 font-bold shadow' : 'hover:bg-[#222] text-[#999]'
              }`}
              title="Click canvas to place an Object"
            >
              🟢 <span className="text-[8px]">Object</span>
            </button>
            <button
              onClick={() => setActiveTool('process')}
              className={`p-2 rounded text-xs transition-all flex flex-col items-center justify-center gap-0.5 ${
                activeTool === 'process' ? 'bg-sky-950/60 border border-sky-400 text-sky-300 font-bold shadow' : 'hover:bg-[#222] text-[#999]'
              }`}
              title="Click canvas to place a Process"
            >
              🔵 <span className="text-[8px]">Process</span>
            </button>
            <button
              onClick={() => setActiveTool('state')}
              className={`p-2 rounded text-xs transition-all flex flex-col items-center justify-center gap-0.5 ${
                activeTool === 'state' ? 'bg-orange-950/60 border border-orange-400 text-orange-300 font-bold shadow animate-pulse' : 'hover:bg-[#222] text-[#999]'
              }`}
              title="Click an Object to add a State inside it"
            >
              🔶 <span className="text-[8px]">State</span>
            </button>
            <button
              onClick={() => setActiveTool('requirement')}
              className={`p-2 rounded text-xs transition-all flex flex-col items-center justify-center gap-0.5 ${
                activeTool === 'requirement' ? 'bg-purple-950/60 border border-purple-400 text-purple-300 font-bold shadow' : 'hover:bg-[#222] text-[#999]'
              }`}
              title="Click canvas to place a Requirement"
            >
              📜 <span className="text-[8px]">Req</span>
            </button>

            <div className="h-px bg-[#333] my-1"></div>
            <span className="text-[8px] uppercase tracking-wider font-extrabold text-sky-400/80 text-center mb-0.5">Link Mode</span>
            
            <select
              value={activeLinkType}
              onChange={(e) => setActiveLinkType(e.target.value as OPMLinkType)}
              className="bg-[#0f0f0f] border border-[#333] rounded text-[10px] py-1 px-1.5 outline-none text-[#ccc] w-20"
            >
              <optgroup label="Procedural" className="bg-[#141414]">
                <option value="consumption">Consumption</option>
                <option value="result">Result</option>
                <option value="effect">Effect</option>
                <option value="agent">Agent</option>
                <option value="instrument">Instrument</option>
                <option value="trigger">Trigger</option>
                <option value="condition">Condition</option>
              </optgroup>
              <optgroup label="Structural" className="bg-[#141414]">
                <option value="aggregation">Aggregation</option>
                <option value="generalization">Generalization</option>
                <option value="exhibition">Exhibition</option>
              </optgroup>
              <optgroup label="Traceability" className="bg-[#141414]">
                <option value="satisfies">Satisfies</option>
                <option value="verifies">Verifies</option>
              </optgroup>
            </select>
          </div>

          {/* React Flow Canvas */}
          <div className="flex-1 h-full">
            <ReactFlow
              proOptions={{ hideAttribution: true }}
              nodes={filteredNodes}
              edges={mappedEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeDragStop={handleNodeDragStop}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onInit={(inst) => { reactFlowInstanceRef.current = inst; }}
              onPaneClick={handlePaneClick}
              onNodeClick={handleNodeClick}
              connectionLineComponent={OPMConnectionLine}
              colorMode="dark"
              minZoom={0.01}
              maxZoom={15}
              fitView
            >
              <Background color="#333" gap={20} size={1} />
              <Controls />
              <MiniMap
                nodeColor={(node) => {
                  if (node.data?.type === 'object') return '#10b981';
                  if (node.data?.type === 'process') return '#0284c7';
                  if (node.data?.type === 'requirement') return '#c084fc';
                  return '#f59e0b';
                }}
                maskColor="rgba(0, 0, 0, 0.7)"
                className="bg-[#141414] border border-[#2d2d2d] rounded-md"
              />
            </ReactFlow>
            <OpmLegend />
            <OpmDiagnosticsBadge
              diagnostics={opmArtifactState.diagnostics}
              onNavigateToDiagnostic={handleNavigateToDiagnostic}
            />
          </div>

          {/* Selected Node Properties Panel (Floating bottom-left) */}
          {selectedNode && (
            <div className="absolute right-4 top-4 z-10 w-72 bg-[#141414]/95 backdrop-blur-md border border-[#2d2d2d] rounded-lg p-3.5 shadow-xl flex flex-col gap-2.5 max-h-[85%] overflow-y-auto custom-scrollbar">
              <div className="flex items-center justify-between border-b border-[#333] pb-1.5 shrink-0">
                <span className="text-xs uppercase font-extrabold tracking-wider text-orange-400">
                  Element Inspector
                </span>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-gray-500 hover:text-white"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Basic Fields */}
              <div className="space-y-1.5 text-xs shrink-0">
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] text-[#777] uppercase font-semibold">Name</label>
                  <input
                    type="text"
                    value={selectedNode.data.name}
                    onChange={(e) => handleUpdateNodeProp('name', e.target.value)}
                    className="bg-[#0b0b0b] border border-[#333] rounded px-2 py-1 outline-none focus:border-orange-500/50 text-white"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="text-[10px] text-[#777] uppercase font-semibold">Physical Entity</label>
                  <input
                    type="checkbox"
                    checked={selectedNode.data.physical}
                    onChange={(e) => handleUpdateNodeProp('physical', e.target.checked)}
                    className="rounded border-[#333] bg-[#0d0d0d] text-orange-500 w-3.5 h-3.5"
                  />
                </div>
              </div>

              {/* States Manager (For Objects) */}
              {selectedNode.data.type === 'object' && (
                <div className="border-t border-[#2d2d2d] pt-2 space-y-2 shrink-0">
                  <div className="text-[10px] text-[#777] uppercase font-bold tracking-wider mb-1 flex items-center justify-between">
                    <span>States</span>
                    <span className="text-[8px] text-orange-400 font-mono">
                      {(selectedNode.data.states || []).length} States
                    </span>
                  </div>

                  {/* List of States */}
                  <div className="space-y-1.5 text-xs">
                    {(selectedNode.data.states || []).map((st) => (
                      <div key={st.id} className="flex items-center justify-between bg-[#191008] border border-orange-950/60 px-2 py-1 rounded">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${st.isActive ? 'bg-orange-500 shadow-[0_0_6px_#f97316]' : 'bg-orange-900/60'}`} />
                          <span className="font-semibold text-orange-200 text-[10px] truncate">{st.name}</span>
                          {st.isInitial && <span className="text-[7px] px-1 bg-amber-950 text-amber-300 rounded border border-amber-800/60 font-bold shrink-0">Init</span>}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleManualActivateState(st.id, selectedNode.id)}
                            className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase ${st.isActive ? 'bg-orange-600 text-black' : 'bg-[#222] text-orange-300 hover:bg-[#333]'}`}
                          >
                            {st.isActive ? 'Active' : 'Set'}
                          </button>
                          <button
                            onClick={() => handleDeleteState(st.id, selectedNode.id)}
                            className="text-gray-500 hover:text-red-400 p-0.5 transition-colors"
                            title="Delete State"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Add State form */}
                    <div className="flex gap-1.5 mt-2">
                      <input
                        placeholder="State name (e.g. Active)"
                        id="new-state-name-input"
                        className="bg-[#0b0b0b] border border-[#333] rounded px-2 py-1 outline-none flex-1 text-xs text-white focus:border-orange-500/50"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                            handleAddStateToObject(selectedNode.id, e.currentTarget.value.trim());
                            e.currentTarget.value = '';
                          }
                        }}
                      />
                      <button
                        onClick={() => {
                          const inputEl = document.getElementById('new-state-name-input') as HTMLInputElement;
                          if (inputEl && inputEl.value.trim()) {
                            handleAddStateToObject(selectedNode.id, inputEl.value.trim());
                            inputEl.value = '';
                          }
                        }}
                        className="px-2 py-1 bg-orange-600 hover:bg-orange-500 text-black font-extrabold rounded text-[10px] flex items-center gap-0.5 shrink-0 transition-colors"
                      >
                        <Plus size={10} /> Add
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Attributes Section (For Objects) */}
              {selectedNode.data.type === 'object' && (
                <div className="border-t border-[#2d2d2d] pt-2 shrink-0">
                  <div className="text-[10px] text-[#777] uppercase font-semibold mb-1">
                    Attributes
                  </div>
                  {/* List */}
                  <div className="space-y-1 text-xs">
                    {(selectedNode.data.attributes || []).map((attr, idx) => (
                      <div key={idx} className="flex justify-between bg-[#1f1f1f] px-2 py-0.5 rounded font-mono">
                        <span>{attr.key}:</span>
                        <span className="text-[#bbb]">{attr.value}</span>
                      </div>
                    ))}
                    {/* Add form */}
                    <div className="flex gap-1.5 mt-2">
                      <input
                        placeholder="Key"
                        id="new-attr-key"
                        className="bg-[#0b0b0b] border border-[#333] rounded px-1.5 py-0.5 outline-none w-1/2 text-xs text-white"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const valEl = document.getElementById('new-attr-val') as HTMLInputElement;
                            if (e.currentTarget.value && valEl.value) {
                              handleAddAttribute(e.currentTarget.value, valEl.value);
                              e.currentTarget.value = '';
                              valEl.value = '';
                            }
                          }
                        }}
                      />
                      <input
                        placeholder="Val"
                        id="new-attr-val"
                        className="bg-[#0b0b0b] border border-[#333] rounded px-1.5 py-0.5 outline-none w-1/2 text-xs text-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Port Manager (For Objects and Processes) */}
              {(selectedNode.data.type === 'object' || selectedNode.data.type === 'process') && (
                <div className="border-t border-[#2d2d2d] pt-2 space-y-2 shrink-0">
                  <div className="text-[10px] text-[#777] uppercase font-bold tracking-wider mb-1 flex items-center justify-between">
                    <span>Ports Manager</span>
                    <span className="text-[8px] text-gray-500 font-mono">
                      {selectedNodePortsCount} Ports
                    </span>
                  </div>

                  {/* List of Ports */}
                  <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                    {/* Inputs */}
                    {(selectedNode.data.inputs || []).map((port: OPMPort) => (
                      <div key={port.id} className="flex items-center justify-between bg-black/40 border border-white/5 px-2 py-1 rounded text-[10px]">
                        <div className="flex items-center gap-1.5 overflow-hidden">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                          <span className="font-mono text-gray-400 font-bold shrink-0">{port.position.toUpperCase()[0]}:</span>
                          <span className="truncate text-white font-medium">{port.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[8px] px-1 bg-blue-950 text-blue-400 border border-blue-900 rounded font-bold tracking-tighter uppercase scale-90">
                            {port.type}
                          </span>
                          <button
                            onClick={() => handleRemovePort(port.id, 'input')}
                            className="text-gray-500 hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Outputs */}
                    {(selectedNode.data.outputs || []).map((port: OPMPort) => (
                      <div key={port.id} className="flex items-center justify-between bg-black/40 border border-white/5 px-2 py-1 rounded text-[10px]">
                        <div className="flex items-center gap-1.5 overflow-hidden">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                          <span className="font-mono text-gray-400 font-bold shrink-0">{port.position.toUpperCase()[0]}:</span>
                          <span className="truncate text-white font-medium">{port.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[8px] px-1 bg-emerald-950 text-emerald-400 border border-emerald-900 rounded font-bold tracking-tighter uppercase scale-90">
                            {port.type}
                          </span>
                          <button
                            onClick={() => handleRemovePort(port.id, 'output')}
                            className="text-gray-500 hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add Port Form */}
                  <div className="bg-[#1c1c1c]/55 p-2.5 rounded border border-white/5 space-y-1.5">
                    <span className="text-[8px] uppercase tracking-wider text-orange-400/80 font-black">Add Custom Port</span>
                    <div className="flex gap-1">
                      <input
                        placeholder="Port Label"
                        value={newPortName}
                        onChange={(e) => setNewPortName(e.target.value)}
                        className="bg-[#0b0b0b] border border-[#333] rounded px-1.5 py-0.5 outline-none text-[10px] flex-1 text-white"
                      />
                      <select
                        value={newPortDir}
                        onChange={(e: any) => setNewPortDir(e.target.value)}
                        className="bg-[#0b0b0b] border border-[#333] rounded px-1 text-[10px] text-gray-300 outline-none"
                      >
                        <option value="input">In</option>
                        <option value="output">Out</option>
                      </select>
                    </div>

                    <div className="flex gap-1 justify-between">
                      <select
                        value={newPortPos}
                        onChange={(e: any) => setNewPortPos(e.target.value)}
                        className="bg-[#0b0b0b] border border-[#333] rounded px-1 py-0.5 text-[9px] text-gray-300 outline-none w-[48%]"
                      >
                        <option value="left">Left</option>
                        <option value="right">Right</option>
                        <option value="top">Top</option>
                        <option value="bottom">Bottom</option>
                      </select>

                      <select
                        value={newPortType}
                        onChange={(e: any) => setNewPortType(e.target.value)}
                        className="bg-[#0b0b0b] border border-[#333] rounded px-1 py-0.5 text-[9px] text-gray-300 outline-none w-[48%]"
                      >
                        <option value="standard">Standard</option>
                        <option value="agent">Agent</option>
                        <option value="instrument">Instrument</option>
                        <option value="trigger">Trigger</option>
                        <option value="condition">Condition</option>
                        <option value="consumption">Consume</option>
                        <option value="result">Result</option>
                        <option value="effect">Effect</option>
                      </select>
                    </div>

                    <button
                      onClick={() => {
                        if (newPortName.trim()) {
                          handleAddPort(newPortName.trim(), newPortDir, newPortPos, newPortType);
                          setNewPortName('');
                        }
                      }}
                      className="w-full mt-1.5 py-1 bg-orange-600 hover:bg-orange-700 text-black font-extrabold rounded text-[9.5px] uppercase tracking-wider flex items-center justify-center gap-1 transition-colors"
                    >
                      <Plus size={10} /> Add Port
                    </button>
                  </div>
                </div>
              )}

              {/* Zoom Action */}
              {selectedNode.data.type !== 'state' && (
                <button
                  onClick={() => handleZoomInNode(selectedNode.id)}
                  className="mt-2 py-1 bg-sky-950 text-sky-400 border border-sky-800 hover:bg-sky-900 rounded text-xs font-bold transition-all flex items-center justify-center gap-1.5 shrink-0"
                >
                  <ZoomIn size={12} /> Zoom In (Decompose)
                </button>
              )}

              {/* Delete Node */}
              <button
                onClick={handleDeleteSelectedNode}
                className="mt-1.5 py-1 bg-red-950/40 text-red-400 border border-red-900/60 hover:bg-red-900 rounded text-xs font-bold transition-all flex items-center justify-center gap-1.5 shrink-0"
              >
                <Trash2 size={12} /> Delete Element
              </button>
            </div>
          )}
        </div>

        {/* Bottom Simulation Logs console */}
        <div className="h-40 bg-[#111] border-t border-[#222] flex flex-col shrink-0 overflow-hidden">
          <div className="h-8 bg-[#181818] border-b border-[#222] px-4 flex items-center justify-between text-xs font-bold text-[#888]">
            <span>SIMULATION CONSOLE</span>
            <button
              onClick={() => setSimLogs([])}
              className="text-[#555] hover:text-[#bbb]"
            >
              Clear Logs
            </button>
          </div>
          <div className="flex-1 p-2 font-mono text-[11px] overflow-y-auto space-y-0.5">
            {simLogs.map((log, idx) => (
              <div key={idx} className="flex gap-2">
                <span className="text-[#555]">{log.timestamp}</span>
                <span className={
                  log.type === 'success' ? 'text-green-400' :
                  log.type === 'error' ? 'text-red-400' :
                  log.type === 'warning' ? 'text-amber-400' :
                  'text-[#888]'
                }>
                  [{log.type.toUpperCase()}] {log.message}
                </span>
              </div>
            ))}
            {simLogs.length === 0 && (
              <div className="h-full flex items-center justify-center text-[#555] italic">
                Console idle. Start the simulation or trigger a process to see live execution traces.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Right Tabbed Panel (Simulation Monitor & OPL Editor & Smart Show) */}
      <div className="w-96 flex flex-col h-full bg-[#141414] overflow-hidden border-l border-[#222]">
        {/* Tab Header */}
        <div className="h-12 border-b border-[#222] flex shrink-0 bg-[#181818]">
          <button
            onClick={() => setRightTab('simControl')}
            className={`flex-1 flex items-center justify-center gap-1 text-[11px] font-bold uppercase tracking-wider transition-colors border-b-2 ${
              rightTab === 'simControl'
                ? 'border-orange-500 text-orange-400 bg-orange-950/10'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            ⚡ Sim
          </button>
          <button
            onClick={() => setRightTab('opl')}
            className={`flex-1 flex items-center justify-center gap-1 text-[11px] font-bold uppercase tracking-wider transition-colors border-b-2 ${
              rightTab === 'opl'
                ? 'border-sky-500 text-sky-400 bg-sky-950/10'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            📝 OPL
          </button>
          <button
            onClick={() => setRightTab('smartShow')}
            className={`flex-1 flex items-center justify-center gap-1 text-[11px] font-bold uppercase tracking-wider transition-colors border-b-2 ${
              rightTab === 'smartShow'
                ? 'border-sky-500 text-sky-300 bg-sky-950/20'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            🌐 Smart Show
          </button>
          <button
            onClick={() => setRightTab('opmCodegen')}
            className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
              rightTab === 'opmCodegen'
                ? 'border-emerald-500 text-emerald-400 bg-emerald-950/10'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            🛠 OPM Build
          </button>
        </div>

        {/* Tab Content 1: Simulation Control Dashboard */}
        {rightTab === 'simControl' && (
          <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
            {/* Live Status and controls */}
            <div className="bg-[#1a1a1a] rounded-lg border border-[#2d2d2d] p-3 flex items-center justify-between shadow-md shrink-0">
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-500 uppercase font-black">Simulation Status</span>
                <span className={`text-xs font-extrabold flex items-center gap-1.5 ${simRunning ? 'text-green-400' : 'text-amber-400'}`}>
                  <span className={`w-2 h-2 rounded-full ${simRunning ? 'bg-green-400 animate-ping' : 'bg-amber-400'}`} />
                  {simRunning ? 'ACTIVE RUNNING' : 'PAUSED'}
                </span>
              </div>
              <div className="flex gap-1 bg-black/40 p-1 rounded border border-white/5">
                <button
                  onClick={toggleSimulation}
                  className={`p-1.5 rounded transition-all ${simRunning ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-green-500/20 text-green-400 border border-green-500/30'}`}
                  title={simRunning ? 'Pause' : 'Start'}
                >
                  {simRunning ? <Pause size={12} /> : <Play size={12} />}
                </button>
                <button
                  onClick={runSimTick}
                  className="p-1.5 text-sky-400 hover:bg-sky-950/40 rounded transition-all"
                  title="Step Simulation"
                >
                  <ArrowRight size={12} />
                </button>
                <button
                  onClick={resetSimulation}
                  className="p-1.5 text-amber-400 hover:bg-amber-950/40 rounded transition-all"
                  title="Reset"
                >
                  <RotateCcw size={12} />
                </button>
              </div>
            </div>

            {/* Quick Initialize Button */}
            <button
              onClick={handleAutoInitializeStates}
              className="py-2 px-3 bg-[#10b981] hover:bg-emerald-600 text-black font-extrabold rounded-md text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-lg shrink-0"
              title="Activate the first state of all objects to initialize the model"
            >
              🔄 Auto-Initialize States
            </button>

            {/* Section 1: Objects & States (Outports) */}
            <div className="flex-1 min-h-0 flex flex-col gap-2">
              <div className="flex items-center justify-between border-b border-[#2d2d2d] pb-1 shrink-0">
                <span className="text-xs uppercase font-extrabold tracking-wider text-emerald-400 flex items-center gap-1">
                  🟢 Objects & States (Outports)
                </span>
                <span className="text-[10px] text-gray-500 font-mono">
                  {nodes.filter(n => n.data.type === 'object' && n.data.parentId === activeParentId).length} Objects
                </span>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar">
                {nodes.filter(n => n.data.type === 'object' && n.data.parentId === activeParentId).map(obj => {
                  const childStates = nodes.filter(sn => sn.parentId === obj.id && sn.data.type === 'state');
                  
                  return (
                    <div key={obj.id} className="bg-[#161616]/75 border border-emerald-900/20 rounded-lg p-2.5 space-y-2 hover:border-emerald-600/30 transition-all">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-300">
                          {obj.data.name}
                        </span>
                        {obj.data.physical && (
                          <span className="text-[8px] px-1 bg-emerald-950 border border-emerald-800 text-emerald-400 rounded font-semibold scale-90">
                            Physical
                          </span>
                        )}
                      </div>

                      {childStates.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {childStates.map(stateNode => {
                            const isActive = (stateNode.data as any).isActive;
                            return (
                              <button
                                key={stateNode.id}
                                onClick={() => handleManualActivateState(stateNode.id, obj.id)}
                                className={`text-[9.5px] px-2.5 py-1 rounded transition-all duration-300 border flex items-center gap-1 ${
                                  isActive
                                    ? 'bg-orange-500 text-black border-orange-400 font-black shadow-[0_0_10px_rgba(249,115,22,0.4)]'
                                    : 'bg-[#1c1c1c] text-orange-200/70 border-orange-900/30 hover:border-orange-500/50'
                                }`}
                                title={`Click to set ${obj.data.name} state to ${stateNode.data.name}`}
                              >
                                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-black animate-ping" />}
                                {stateNode.data.name}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-[9px] text-gray-500 italic">
                          No states defined. Double-click canvas under State tool to add.
                        </div>
                      )}
                    </div>
                  );
                })}
                {nodes.filter(n => n.data.type === 'object' && n.data.parentId === activeParentId).length === 0 && (
                  <div className="text-xs text-gray-500 italic text-center py-6">
                    No objects in this scope.
                  </div>
                )}
              </div>
            </div>

            {/* Section 2: Processes & Triggers */}
            <div className="flex-1 min-h-0 flex flex-col gap-2">
              <div className="flex items-center justify-between border-b border-[#2d2d2d] pb-1 shrink-0">
                <span className="text-xs uppercase font-extrabold tracking-wider text-sky-400 flex items-center gap-1">
                  🔵 Processes & Triggers
                </span>
                <span className="text-[10px] text-gray-500 font-mono">
                  {nodes.filter(n => n.data.type === 'process' && n.data.parentId === activeParentId).length} Processes
                </span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar">
                {nodes.filter(n => n.data.type === 'process' && n.data.parentId === activeParentId).map(proc => {
                  const isFiring = (proc.data as any).isFiring;
                  const incomingEdges = edges.filter(e => e.target === proc.id && (e.data?.type === 'trigger' || e.data?.type === 'condition'));
                  
                  return (
                    <div key={proc.id} className="bg-[#161616]/75 border border-sky-900/20 rounded-lg p-2.5 space-y-2 hover:border-sky-600/30 transition-all">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isFiring ? 'bg-orange-400 animate-pulse shadow-[0_0_8px_#f97316]' : 'bg-sky-500'}`} />
                          <span className="text-xs font-bold text-sky-300 truncate">
                            {proc.data.name}
                          </span>
                        </div>
                        <button
                          onClick={() => handleManualTriggerProcess(proc.id)}
                          className={`text-[9px] px-2 py-0.5 font-extrabold uppercase rounded transition-all border flex items-center gap-0.5 shrink-0 ${
                            isFiring
                              ? 'bg-orange-600 text-black border-orange-400'
                              : 'bg-sky-950/40 text-sky-400 border-sky-900 hover:bg-sky-900 hover:text-white'
                          }`}
                          title="Force execute process manually"
                        >
                          ⚡ {isFiring ? 'Firing' : 'Fire'}
                        </button>
                      </div>

                      {/* Conditions & Triggers List */}
                      {incomingEdges.length > 0 && (
                        <div className="space-y-1">
                          <div className="text-[8px] uppercase tracking-wider font-extrabold text-gray-500">Incoming Conditions:</div>
                          <div className="flex flex-col gap-1">
                            {incomingEdges.map(edge => {
                              const srcNode = nodes.find(n => n.id === edge.source);
                              if (!srcNode) return null;
                              
                              const isSourceActive = srcNode.data.type === 'state' ? (srcNode.data as any).isActive : false;
                              const linkType = edge.data?.type || 'standard';

                              return (
                                <div key={edge.id} className="flex items-center justify-between bg-black/25 px-1.5 py-0.5 rounded text-[9px] font-mono border border-white/5">
                                  <span className="text-gray-400 truncate max-w-[140px]">
                                    {srcNode.data.name}
                                  </span>
                                  <span className={`px-1 rounded text-[7.5px] uppercase font-bold shrink-0 ${
                                    isSourceActive
                                      ? 'bg-green-950 text-green-400 border border-green-900/60'
                                      : 'bg-red-950 text-red-400 border border-red-900/60'
                                  }`}>
                                    {linkType === 'trigger' ? 'trg' : 'cnd'} {isSourceActive ? '✓' : '✗'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {nodes.filter(n => n.data.type === 'process' && n.data.parentId === activeParentId).length === 0 && (
                  <div className="text-xs text-gray-500 italic text-center py-6">
                    No processes in this scope.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab Content 2: OPL Editor */}
        {rightTab === 'opl' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="h-8 border-b border-[#222] px-4 flex items-center justify-between shrink-0 bg-[#181818]/60 text-xs text-[#888]">
              <span>OPL Editor Mode</span>
              {isEditingText ? (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={applyOplChanges}
                    className="px-2 py-0.5 bg-green-600 hover:bg-green-700 text-white rounded text-[10px] font-bold flex items-center gap-0.5 transition-colors"
                    title="Apply Changes"
                  >
                    <Check size={10} /> Sync
                  </button>
                  <button
                    onClick={() => {
                      setIsEditingText(false);
                      const generated = generateOpl(nodes, edges);
                      setOplText(generated);
                    }}
                    className="px-2 py-0.5 bg-red-600 hover:bg-red-700 text-white rounded text-[10px] font-bold flex items-center gap-0.5 transition-colors"
                    title="Discard Changes"
                  >
                    <X size={10} /> Cancel
                  </button>
                </div>
              ) : (
                <span className="text-[9px] px-1.5 py-0.5 bg-gray-800 text-gray-400 rounded uppercase font-semibold tracking-wide">
                  Auto-Sync
                </span>
              )}
            </div>

            {/* Text Area */}
            <div className="flex-1 relative p-3">
              <textarea
                value={oplText}
                onChange={(e) => {
                  setOplText(e.target.value);
                  setIsEditingText(true);
                }}
                placeholder="// Add OPL Sentences to represent system architecture..."
                className="w-full h-full bg-[#0a0a0a] border border-[#2d2d2d] rounded-md p-3 outline-none text-[#cfd8dc] font-mono text-xs leading-relaxed resize-none focus:border-sky-500/50"
              />

              {isEditingText && (
                <div className="absolute top-5 right-5 bg-orange-950/80 border border-orange-500 text-orange-400 text-[10px] font-bold px-2 py-0.5 rounded shadow animate-pulse">
                  Edit Mode Active
                </div>
              )}
            </div>

            {/* OPL Errors / Warnings Drawer */}
            <div className="h-32 bg-[#0c0c0c] border-t border-[#222] flex flex-col shrink-0">
              <div className="h-7 bg-[#111] px-3 flex items-center justify-between text-[10px] font-bold text-[#666]">
                <span>SYNTAX CHECKER</span>
                <span className={oplErrors.length > 0 ? 'text-red-400 font-extrabold' : 'text-green-500'}>
                  {oplErrors.length > 0 ? `${oplErrors.length} Errors` : 'Grammar Valid ✓'}
                </span>
              </div>
              <div className="flex-1 p-2 overflow-y-auto space-y-1">
                {oplErrors.map((err, idx) => (
                  <div key={idx} className="flex gap-2 text-xs font-mono">
                    <span className="text-red-500 font-bold">[Line {err.line}]</span>
                    <span className="text-[#ccc]">{err.message}</span>
                  </div>
                ))}
                {oplErrors.length === 0 && (
                  <div className="h-full flex items-center justify-center text-[10px] text-[#555] italic">
                    No syntax warnings found. All OPL structures are correct.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab Content 3: Smart Show Panel */}
        {rightTab === 'smartShow' && (
          <div className="flex-1 flex flex-col overflow-hidden p-3 min-h-0">
            <SmartShowPanel
              nodes={nodes}
              edges={edges}
              simState={simStateRef.current}
              simRunning={simRunning}
              onSelectProcess={(pid) => {
                const p = nodes.find(n => n.id === pid);
                if (p) setSelectedNode(p);
              }}
            />
          </div>
        )}

        {/* Tab Content 4: OPM Code Generation */}
        {rightTab === 'opmCodegen' && (
          <div className="flex-1 overflow-y-auto">
            <OpmCodeGenerationWorkspace
              nodes={nodes as never}
              edges={edges as never}
              state={opmArtifactState}
              onStateChange={setOpmArtifactState}
              onDownload={(files) => {
                onAddError?.('info', `Verified OPM bundle ready: ${files.length} files.`, 'OPM');
              }}
              onRunHil={(files) => {
                onAddError?.('info', `Verified OPM bundle sent to HIL: ${files.length} files.`, 'OPM');
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};
