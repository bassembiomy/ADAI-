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
import { OPMNodeData, OPMEdgeData, OPMLinkType, SimulationLog, OPMState, OPMPort, type AppNode, type AppEdge, type OpmModelSnapshot, type OpmLifecycleDiagnostic } from './EntropyTypes';
import { normalizeContainment, validateOpmModelLifecycle, getCanonicalParentId } from './OpmModelLifecycle';
import { analyzeOpmDeletion, applyOpmDeletion, type OpmDeletionTarget } from './OpmDeletionImpact';
import { OpmCodeGenerationWorkspace, createInitialArtifactState, resetToDraft, type OpmArtifactState } from './OpmCodeGenerationWorkspace';
import { reconcileSimulationState } from './OpmTraceabilityModel';
import { OpmSimulationScope } from './OpmSimulationScope';
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
import { OpmDockShell } from './OpmDockShell';
import { loadDocks, saveDocks, PAGE_PRESETS, type OpmDocks } from './OpmDockState';
import { OpmDiagnosticsBadge } from './OpmDiagnosticsBadge';
import { createDefaultOpmExecutionConfig, type OpmExecutionConfig, type OpmSourceRef } from '../../engine/opm/executableTypes';
import { convertOpmNodeType, convertOpmEdgeType, type OpmNodeKind } from './OpmMigrations';
import { validateOpmPortConnection } from './OpmPortContracts';
import { getValidTargetNodeIds } from './OpmLinkComposer';
import {
  normalizeOpmSimulationConfig,
  parseOpmSimulationConfig,
  DEFAULT_OPM_SIMULATION_CONFIG,
  type OpmSimulationConfig,
} from './OpmSimulationConfig';
import { importSysmlToOpm } from './SysmlToOpmImporter';
import { validateOpmConnection } from './OpmLinkRules';
import { layoutOpmGraph } from './OpmAutoLayout';
import { resolveBlockOverlap, type RectBounds } from './OpmCollisionAvoidance';
import type { SysMLDiagramState } from '../../types/sysml_types';
import { Play, Pause, RotateCcw, ArrowRight, Layout, Download, Upload, ZoomIn, ZoomOut, Check, X, Plus, Trash2, ExternalLink } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { OPM_EXAMPLES } from './EntropyExamples';
import { OpmFloatingWindow } from './OpmFloatingWindow';
import { OpmRightPanelContent } from './OpmRightPanelContent';

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
  tickMs?: number;
  onTickMsChange?: (tickMs: number) => void;
  opmSimulationConfig?: OpmSimulationConfig;
  onOpmSimulationConfigChange?: (config: OpmSimulationConfig) => void;
  onBack: () => void;
  onSave?: (nodes: AppNode[], edges: AppEdge[]) => void;
  onAddError?: (type: 'error' | 'warning' | 'info', message: string, source?: string) => void;
  sysmlState?: SysMLDiagramState;
  onOpenHelp?: (topic?: string) => void;
}

export const EntropyWorkspace: React.FC<EntropyWorkspaceProps> = ({
  initialNodes = [],
  initialEdges = [],
  availableVariables,
  onVariablesChange,
  tickMs = 10,
  onTickMsChange,
  opmSimulationConfig,
  onOpmSimulationConfigChange,
  onBack,
  onSave,
  onAddError,
  sysmlState,
  onOpenHelp,
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
  const opmClipboardRef = useRef<{ nodes: AppNode[]; edges: AppEdge[] } | null>(null);
  const isSpacePressed = useRef<boolean>(false);
  const spaceComboUsed = useRef<boolean>(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState<boolean>(false);

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
  const logSim = useCallback((type: 'info' | 'success' | 'warning' | 'error', message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setSimLogs(prev => [...prev.slice(-20), { timestamp, type, message }]);
  }, []);
  const [firingProcesses, setFiringProcesses] = useState<Set<string>>(new Set());
  const simStateRef = useRef<OpmSimulationState>(createSimulationState());
  const [modelRevision, setModelRevision] = useState<number>(1);
  const bumpModelRevision = useCallback(() => {
    setModelRevision(r => r + 1);
    setOpmArtifactState(prev => resetToDraft(prev));
  }, []);

  const invalidateSimState = useCallback((snapshot: OpmModelSnapshot) => {
    const survivingNodeIds = new Set(snapshot.nodes.map(n => n.id));
    const survivingEdgeIds = new Set(snapshot.edges.map(e => e.id));
    simStateRef.current = reconcileSimulationState(
      simStateRef.current || createSimulationState(),
      survivingNodeIds,
      survivingEdgeIds
    );
    setFiringProcesses(prev => {
      const next = new Set<string>();
      prev.forEach(id => {
        if (survivingNodeIds.has(id)) next.add(id);
      });
      return next;
    });
    setNodes(prev => applySimResultToNodes(prev, simStateRef.current, []));
  }, [setNodes]);

  // Isolated OPM Simulation Configuration
  const activeOpmConfig: OpmSimulationConfig = useMemo(() => {
    return normalizeOpmSimulationConfig(opmSimulationConfig);
  }, [opmSimulationConfig]);

  const opmExecutionConfig: OpmExecutionConfig = useMemo(() => {
    const config = createDefaultOpmExecutionConfig();
    config.settings = {
      ...config.settings,
      tickMs: activeOpmConfig.tickMs,
      maxTicks: activeOpmConfig.maxTicks,
      maxEventsPerTick: activeOpmConfig.maxEventsPerTick,
    };
    return config;
  }, [activeOpmConfig]);

  const [configDraft, setConfigDraft] = useState<{
    tickMs: number;
    maxTicks: number;
    maxEventsPerTick: number;
  }>({
    tickMs: activeOpmConfig.tickMs,
    maxTicks: activeOpmConfig.maxTicks,
    maxEventsPerTick: activeOpmConfig.maxEventsPerTick,
  });
  const configDraftRef = useRef(configDraft);
  const [configErrors, setConfigErrors] = useState<string[]>([]);

  useEffect(() => {
    const nextDraft = {
      tickMs: activeOpmConfig.tickMs,
      maxTicks: activeOpmConfig.maxTicks,
      maxEventsPerTick: activeOpmConfig.maxEventsPerTick,
    };
    configDraftRef.current = nextDraft;
    setConfigDraft(nextDraft);
    setConfigErrors([]);
  }, [activeOpmConfig]);

  const handleConfigFieldChange = useCallback((field: keyof OpmSimulationConfig, rawValue: string | number) => {
    const num = typeof rawValue === 'number' ? rawValue : Number(rawValue);
    const nextDraft = { ...configDraftRef.current, [field]: num };
    configDraftRef.current = nextDraft;
    setConfigDraft(nextDraft);

    const parsed = parseOpmSimulationConfig({
      ...activeOpmConfig,
      ...nextDraft,
    });

    if (parsed.ok) {
      setConfigErrors([]);
      if (onOpmSimulationConfigChange) {
        onOpmSimulationConfigChange(parsed.config);
      }
    } else {
      setConfigErrors(parsed.diagnostics);
      // Keep previous valid config active; do NOT update active config
    }
  }, [activeOpmConfig, onOpmSimulationConfigChange]);
  
  // Selected Node Details
  const [selectedNode, setSelectedNode] = useState<AppNode | null>(null);

  // New Port Manager States
  const [newPortName, setNewPortName] = useState('');
  const [newPortDir, setNewPortDir] = useState<'input' | 'output'>('input');
  const [newPortPos, setNewPortPos] = useState<'left' | 'right' | 'top' | 'bottom'>('left');
  const [newPortType, setNewPortType] = useState<OPMPort['type']>('standard');

  // Right Sidebar active tab
  const [rightTab, setRightTab] = useState<'simControl' | 'scope' | 'opl' | 'smartShow' | 'opmCodegen'>('simControl');
  const [opmArtifactState, setOpmArtifactState] = useState<OpmArtifactState>(createInitialArtifactState);
  const [selectedEdge, setSelectedEdge] = useState<AppEdge | null>(null);
  const [diagnosticNavMessage, setDiagnosticNavMessage] = useState<string | null>(null);
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  const [docks, setDocks] = useState<OpmDocks>(() => {
    const loaded = loadDocks();
    return { ...loaded, bottom: true };
  });
  const [isRightFloating, setIsRightFloating] = useState(false);

  // --- Dock page presets: page switch applies the preset + its right tab ---
  const handleDocksChange = (d: OpmDocks) => {
    if (d.page !== docks.page) {
      const preset = PAGE_PRESETS[d.page];
      setDocks(preset);
      saveDocks(preset);
      setRightTab(preset.rightTab as typeof rightTab);
    } else {
      setDocks(d);
      saveDocks(d);
    }
  };

  const normalizedOpmConfig = useMemo(() => {
    return normalizeOpmSimulationConfig({ tickMs });
  }, [tickMs]);

  const handleNavigateToDiagnostic = useCallback((source: OpmSourceRef) => {
    setDiagnosticNavMessage(null);
    const node = nodes.find(n => n.id === source.elementId);
    const edge = edges.find(e => e.id === source.elementId);

    if (node) {
      setSelectedNode(node);
      setSelectedEdge(null);
    } else if (edge) {
      setSelectedEdge(edge);
      setSelectedNode(null);
    }

    setTimeout(() => {
      let el = document.querySelector(`[data-opm-path="${source.propertyPath}"]`);
      if (!el && source.propertyPath) {
        const base = source.propertyPath.replace(/\[\d+\]\..*$/, '');
        el = document.querySelector(`[data-opm-path="${base}"]`) ||
             document.querySelector(`[data-opm-path*="${source.propertyPath}"]`);
      }

      if (el instanceof HTMLElement) {
        el.focus();
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        const targetDesc = node ? `Node "${node.data.name || node.id}"` : edge ? `Link "${edge.id}"` : `Element "${source.elementId}"`;
        const msg = `Navigated to ${targetDesc}. (Property control for "${source.propertyPath}" is not visible in current view)`;
        setDiagnosticNavMessage(msg);
        logSim('warning', msg);
      }
    }, 60);
  }, [nodes, edges]);

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
      const layoutedNodes = layoutOpmGraph(initializedNodes, parsedEdges);
      setNodes(layoutedNodes);
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
    const STATE_START_Y = 49;

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
    setUndoStack(prev => [...prev.slice(-49), {
      nodes: JSON.parse(JSON.stringify(currentNodes)),
      edges: JSON.parse(JSON.stringify(currentEdges)),
      modelRevision,
    }]);
    setRedoStack([]); // Clear redo
  }, [modelRevision]);

  const triggerUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
      modelRevision,
    }]);
    setNodes(previous.nodes);
    setEdges(previous.edges);
    invalidateSimState({ nodes: previous.nodes, edges: previous.edges });
    bumpModelRevision();
    if (onSave) onSave(previous.nodes, previous.edges);
  }, [undoStack, nodes, edges, modelRevision, invalidateSimState, bumpModelRevision, onSave, setNodes, setEdges]);

  const triggerRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const nextState = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    setUndoStack(prev => [...prev, {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
      modelRevision,
    }]);
    setNodes(nextState.nodes);
    setEdges(nextState.edges);
    invalidateSimState({ nodes: nextState.nodes, edges: nextState.edges });
    bumpModelRevision();
    if (onSave) onSave(nextState.nodes, nextState.edges);
  }, [redoStack, nodes, edges, modelRevision, invalidateSimState, bumpModelRevision, onSave, setNodes, setEdges]);

  // --- Central Canonical Lifecycle Mutation & Transaction Gateway ---
  const commitModelMutation = useCallback((
    mutator: (currentSnapshot: OpmModelSnapshot) => {
      snapshot: OpmModelSnapshot;
      diagnostics?: OpmLifecycleDiagnostic[];
      invalidatesSimulation?: boolean;
      invalidatesEvidence?: boolean;
      impactSummary?: string;
    } | null,
    options?: { saveUndo?: boolean }
  ): boolean => {
    const currentSnapshot: OpmModelSnapshot = { nodes, edges };
    const result = mutator(currentSnapshot);
    if (!result) return false;

    // Validate the resulting snapshot against canonical OPM lifecycle integrity rules
    const validation = validateOpmModelLifecycle(result.snapshot);
    if (!validation.valid) {
      const firstErr = validation.diagnostics.find(d => d.severity === 'error');
      const msg = firstErr?.message || 'Model mutation failed lifecycle integrity validation.';
      logSim('error', msg);
      if (onAddError) onAddError('error', msg, 'OPM');
      setDiagnosticNavMessage(msg);
      return false;
    }

    if (options?.saveUndo !== false) {
      saveHistory(nodes, edges);
    }

    setNodes(result.snapshot.nodes);
    setEdges(result.snapshot.edges);

    // Deselect elements if they were removed
    setSelectedNode(prev => {
      if (prev && !result.snapshot.nodes.some(n => n.id === prev.id)) {
        return null;
      }
      return prev;
    });

    setSelectedEdge(prev => {
      if (prev && !result.snapshot.edges.some(e => e.id === prev.id)) {
        return null;
      }
      return prev;
    });

    if (result.invalidatesSimulation) {
      invalidateSimState(result.snapshot);
    }

    if (result.invalidatesEvidence) {
      bumpModelRevision();
    }

    if (result.impactSummary) {
      logSim('warning', result.impactSummary);
    }

    if (onSave) {
      onSave(result.snapshot.nodes, result.snapshot.edges);
    }

    return true;
  }, [nodes, edges, saveHistory, setNodes, setEdges, logSim, onAddError, onSave, invalidateSimState, bumpModelRevision]);

  // --- Centralized Deletion Pipeline ---
  const executeDeletion = useCallback((target: OpmDeletionTarget) => {
    return commitModelMutation((currentSnapshot) => {
      const impact = analyzeOpmDeletion(currentSnapshot, target);
      const mutation = applyOpmDeletion(currentSnapshot, impact);
      const summaryMsg = `Deleted ${impact.summary.deletedNodeCount} element(s), ${impact.summary.descendantsCascadedCount} child(ren), and ${impact.summary.deletedEdgeCount} link(s).`;
      return {
        snapshot: mutation.snapshot,
        diagnostics: mutation.diagnostics,
        invalidatesSimulation: mutation.invalidatesSimulation,
        invalidatesEvidence: mutation.invalidatesEvidence,
        impactSummary: summaryMsg,
      };
    });
  }, [commitModelMutation]);

  // --- Smart link composer: valid targets for the in-progress connection ---
  const validTargets = useMemo(() => connectSourceId ? getValidTargetNodeIds(nodes, edges, connectSourceId, activeLinkType) : [], [connectSourceId, nodes, edges, activeLinkType]);

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
    }).map(n => {
      // --- Link composer glow: valid drop targets glow green during connect drag ---
      const composerValid = connectSourceId !== null && validTargets.includes(n.id);
      return {
        ...n,
        ...(composerValid ? { style: { ...(n.style ?? {}), boxShadow: '0 0 0 2px rgba(34,197,94,0.9), 0 0 22px rgba(34,197,94,0.5)' } } : {}),
        data: { ...n.data, composerValid } as typeof n.data,
      };
    });
  }, [nodes, activeParentId, validTargets]);

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
    const STATE_START_Y = 49;
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

    const ok = commitModelMutation((currentSnapshot) => {
      const updatedNodes = currentSnapshot.nodes.map(n => {
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

      return {
        snapshot: normalizeContainment({
          nodes: [...updatedNodes, newStateNode],
          edges: currentSnapshot.edges,
        }),
        invalidatesSimulation: true,
        invalidatesEvidence: true,
        impactSummary: `Added state [${stateName}] inside Object [${targetObject.data.name}].`,
      };
    });

    if (ok) {
      if (isInitial) {
        simStateRef.current = {
          ...simStateRef.current,
          objectActiveState: {
            ...simStateRef.current.objectActiveState,
            [objectId]: stateId,
          }
        };
      }

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
    }
  }, [nodes, edges, commitModelMutation]);

  const handleDeleteState = useCallback((stateId: string, _parentObjectId?: string) => {
    executeDeletion({ nodeIds: [stateId] });
  }, [executeDeletion]);

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

    const assignedParentId = isReq ? null : activeParentId;
    if (isReq && activeParentId) {
      logSim('warning', 'Requirement nodes must be root-scoped and cannot be nested.');
    }

    const newNode: AppNode = {
      id,
      type: isProc ? 'opmProcess' : 'opmObject',
      position: { x: Math.round(flowPos.x), y: Math.round(flowPos.y) },
      parentId: assignedParentId ?? undefined,
      data: {
        name: nodeName,
        type: isReq ? 'requirement' : (activeTool as any),
        physical: false,
        states: [],
        attributes: [],
        parentId: assignedParentId,
        requirementText: isReq ? `The system shall perform function [${nodeName}].` : undefined,
        inputs: defaultInputs,
        outputs: defaultOutputs,
      },
    };

    commitModelMutation((currentSnapshot) => {
      return {
        snapshot: normalizeContainment({
          nodes: [...currentSnapshot.nodes, newNode],
          edges: currentSnapshot.edges,
        }),
        invalidatesSimulation: true,
        invalidatesEvidence: true,
        impactSummary: `Created ${isReq ? 'Requirement' : activeTool.toUpperCase()} [${nodeName}] at (${Math.round(flowPos.x)}, ${Math.round(flowPos.y)}).`,
      };
    });

    setSelectedNode(newNode);
    setActiveTool('select');
  }, [activeTool, activeParentId, nodes, edges, commitModelMutation]);

  // --- Shared Port Connection Validator (Canvas preview and onConnect gate) ---
  const isValidConnection = useCallback((connection: Connection | { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }) => {
    if (!connection.source || !connection.target) return false;
    const verdict = validateOpmPortConnection(nodes, edges, connection as any, activeLinkType);
    return verdict.valid;
  }, [nodes, edges, activeLinkType]);

  // --- Connect nodes (draw OPM links) ---
  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;

    // Strict validation via shared contract
    const verdict = validateOpmPortConnection(nodes, edges, connection as any, activeLinkType);
    if (!verdict.valid) {
      const msg = verdict.reason || `Link rejected [${activeLinkType}]: invalid connection`;
      if (onAddError) onAddError('error', `OPM link rejected: ${msg}`, 'ENTROPY');
      logSim('error', `Link rejected [${activeLinkType}]: ${msg}`);
      setDiagnosticNavMessage(msg);
      window.setTimeout(() => setDiagnosticNavMessage(null), 1200);
      return;
    }

    const src = nodes.find(n => n.id === connection.source);
    const tgt = nodes.find(n => n.id === connection.target);

    const newEdge: AppEdge = {
      id: `e-${connection.source}-${connection.sourceHandle || 'std-out'}-${connection.target}-${connection.targetHandle || 'res-in'}`,
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle || undefined,
      targetHandle: connection.targetHandle || undefined,
      type: 'opmEdge',
      data: {
        type: activeLinkType,
        linkType: activeLinkType,
      },
    };

    commitModelMutation((currentSnapshot) => ({
      snapshot: {
        nodes: currentSnapshot.nodes,
        edges: addEdge(newEdge, currentSnapshot.edges) as AppEdge[],
      },
      invalidatesSimulation: true,
      invalidatesEvidence: true,
      impactSummary: `Link [${activeLinkType}] connected: ${src?.data?.name || connection.source} → ${tgt?.data?.name || connection.target}`,
    }));
  }, [activeLinkType, nodes, edges, commitModelMutation, onAddError, logSim]);

  // --- Dynamic Port Handlers ---
  const handleAddPort = (name: string, direction: 'input' | 'output', position: 'left' | 'right' | 'top' | 'bottom', type: any) => {
    if (!selectedNode) return;

    const portId = `${direction === 'input' ? 'in' : 'out'}-${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now().toString().slice(-4)}`;
    const newPort: OPMPort = { id: portId, name, type, direction, position };

    const inputs = selectedNode.data.inputs || [];
    const outputs = selectedNode.data.outputs || [];
    const updatedInputs = direction === 'input' ? [...inputs, newPort] : inputs;
    const updatedOutputs = direction === 'output' ? [...outputs, newPort] : outputs;

    const nextNode: AppNode = {
      ...selectedNode,
      data: {
        ...selectedNode.data,
        inputs: updatedInputs,
        outputs: updatedOutputs,
      }
    };

    const ok = commitModelMutation((currentSnapshot) => ({
      snapshot: {
        nodes: currentSnapshot.nodes.map(n => n.id === selectedNode.id ? nextNode : n),
        edges: currentSnapshot.edges,
      },
      invalidatesSimulation: true,
      invalidatesEvidence: true,
      impactSummary: `Added ${direction} port [${name}] to [${selectedNode.data.name}].`,
    }));

    if (ok) {
      setSelectedNode(nextNode);
    }
  };

  const handleRemovePort = (portId: string, direction: 'input' | 'output') => {
    if (!selectedNode) return;
    executeDeletion({ portRefs: [{ nodeId: selectedNode.id, portId, direction }] });
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

    const candidateSnapshot: OpmModelSnapshot = normalizeContainment({ nodes: parsedNodes, edges: parsedEdges });
    const validation = validateOpmModelLifecycle(candidateSnapshot);
    if (!validation.valid) {
      const firstErr = validation.diagnostics.find(d => d.severity === 'error');
      const msg = firstErr?.message || 'OPL model violates lifecycle integrity rules.';
      if (onAddError) onAddError('error', msg, 'ENTROPY');
      logSim('error', msg);
      return;
    }

    const ok = commitModelMutation(() => ({
      snapshot: candidateSnapshot,
      invalidatesSimulation: true,
      invalidatesEvidence: true,
      impactSummary: 'OPL changes synchronized successfully to canvas.',
    }));

    if (ok) {
      setIsEditingText(false);
    }
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
    if (simStateRef.current.tick >= activeOpmConfig.maxTicks) {
      setSimRunning(false);
      logSim('warning', `Simulation stopped at maxTicks (${activeOpmConfig.maxTicks}).`);
      return;
    }
    const result = stepSimulation(nodes, edges, simStateRef.current, activeOpmConfig.maxEventsPerTick);
    simStateRef.current = result.state;
    setNodes(prev => applySimResultToNodes(prev, result.state, result.firingProcessIds));
    result.logs.forEach(l => logSim(l.type, l.message));
  }, [nodes, edges, activeOpmConfig]);

  // Handle simulation timer (uses isolated OPM tickMs)
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (simRunning) {
      interval = setInterval(runSimTick, activeOpmConfig.tickMs);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [simRunning, activeOpmConfig.tickMs, runSimTick]);

  const toggleSimulation = () => {
    if (!simRunning && simStateRef.current.tick === 0) {
      simStateRef.current = initializeSimulation(nodes);
      setNodes(prev => applySimResultToNodes(prev, simStateRef.current, []));
    }
    setSimRunning(!simRunning);
    logSim('info', simRunning ? 'Simulation paused.' : 'Simulation running...');
  };

  const runSimulation = () => {
    if (!simRunning) {
      if (simStateRef.current.tick === 0) {
        simStateRef.current = initializeSimulation(nodes);
        setNodes(prev => applySimResultToNodes(prev, simStateRef.current, []));
      }
      setSimRunning(true);
      logSim('info', 'Simulation running...');
    }
  };

  const pauseSimulation = () => {
    if (simRunning) {
      setSimRunning(false);
      logSim('info', 'Simulation paused.');
    }
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
    executeDeletion({ nodeIds: [selectedNode.id] });
  };

  const handleConvertNodeType = useCallback((targetType: OpmNodeKind) => {
    if (!selectedNode) return;
    const conversion = convertOpmNodeType(selectedNode, targetType);
    if (conversion.warnings.length > 0) {
      conversion.warnings.forEach(w => {
        onAddError?.('warning', `[${w.code}] ${w.message}`, 'OPM');
        logSim('warning', `[${w.code}] ${w.message}`);
      });
    }

    const candidateSnapshot: OpmModelSnapshot = {
      nodes: nodes.map(n => n.id === selectedNode.id ? conversion.node : n),
      edges,
    };
    const validation = validateOpmModelLifecycle(candidateSnapshot);
    if (!validation.valid) {
      const firstErr = validation.diagnostics.find(d => d.severity === 'error');
      const msg = firstErr?.message || `Converting node to ${targetType} violates lifecycle rules.`;
      onAddError?.('error', msg, 'OPM');
      logSim('error', msg);
      return;
    }

    const ok = commitModelMutation((currentSnapshot) => {
      return {
        snapshot: {
          nodes: currentSnapshot.nodes.map(n => n.id === selectedNode.id ? conversion.node : n),
          edges: currentSnapshot.edges,
        },
        invalidatesSimulation: true,
        invalidatesEvidence: true,
        impactSummary: `Converted "${selectedNode.data.name || selectedNode.id}" to ${targetType}.`,
      };
    });
    if (ok) {
      setSelectedNode(conversion.node);
    }
  }, [selectedNode, nodes, edges, commitModelMutation, onAddError, logSim]);

  const handleConvertEdgeType = useCallback((edgeId: string, nextType: OPMLinkType) => {
    const edge = edges.find(e => e.id === edgeId);
    if (!edge) return;
    const conversion = convertOpmEdgeType(edge, nextType);
    if (conversion.warnings.length > 0) {
      conversion.warnings.forEach(w => {
        onAddError?.('warning', `[${w.code}] ${w.message}`, 'OPM');
        logSim('warning', `[${w.code}] ${w.message}`);
      });
    }

    const srcNode = nodes.find(n => n.id === edge.source);
    const tgtNode = nodes.find(n => n.id === edge.target);
    if (srcNode && tgtNode) {
      const portConnVerdict = validateOpmPortConnection(
        nodes,
        edges,
        {
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
        } as any,
        nextType
      );
      if (!portConnVerdict.valid) {
        onAddError?.('error', `[${portConnVerdict.code}] ${portConnVerdict.reason}`, 'OPM');
        logSim('error', `[${portConnVerdict.code}] ${portConnVerdict.reason}`);
        return;
      }
    }

    const candidateSnapshot: OpmModelSnapshot = {
      nodes,
      edges: edges.map(e => e.id === edgeId ? conversion.edge : e),
    };
    const validation = validateOpmModelLifecycle(candidateSnapshot);
    if (!validation.valid) {
      const firstErr = validation.diagnostics.find(d => d.severity === 'error');
      const msg = firstErr?.message || `Converting link to ${nextType} violates lifecycle rules.`;
      onAddError?.('error', msg, 'OPM');
      logSim('error', msg);
      return;
    }

    const ok = commitModelMutation((currentSnapshot) => {
      return {
        snapshot: {
          nodes: currentSnapshot.nodes,
          edges: currentSnapshot.edges.map(e => e.id === edgeId ? conversion.edge : e),
        },
        invalidatesSimulation: true,
        invalidatesEvidence: true,
        impactSummary: `Converted link "${edgeId}" to ${nextType}.`,
      };
    });
    if (ok && selectedEdge && selectedEdge.id === edgeId) {
      setSelectedEdge(conversion.edge);
    }
  }, [edges, nodes, selectedEdge, commitModelMutation, onAddError, logSim]);

  const handleAddAttribute = (key: string, val: string) => {
    if (!selectedNode || selectedNode.data.type !== 'object') return;

    const attrs = selectedNode.data.attributes || [];
    const updatedAttrs = [...attrs, { key, value: val }];
    const nextNode: AppNode = {
      ...selectedNode,
      data: {
        ...selectedNode.data,
        attributes: updatedAttrs,
      },
    };

    const ok = commitModelMutation((currentSnapshot) => ({
      snapshot: {
        nodes: currentSnapshot.nodes.map(n => n.id === selectedNode.id ? nextNode : n),
        edges: currentSnapshot.edges,
      },
      invalidatesSimulation: true,
      invalidatesEvidence: true,
    }));

    if (ok) {
      setSelectedNode(nextNode);
    }
  };

  const handleUpdateSelectionExecution = useCallback((updatedExecution: any) => {
    if (selectedNode) {
      const executionKey =
        selectedNode.data?.type === 'object'
          ? 'objectExecution'
          : selectedNode.data?.type === 'state'
          ? 'stateExecution'
          : selectedNode.data?.type === 'process'
          ? 'processExecution'
          : 'execution';
      const nextNode = {
        ...selectedNode,
        data: {
          ...selectedNode.data,
          execution: updatedExecution,
          [executionKey]: updatedExecution,
        },
      };
      const ok = commitModelMutation((currentSnapshot) => ({
        snapshot: {
          nodes: currentSnapshot.nodes.map(n => n.id === selectedNode.id ? nextNode : n),
          edges: currentSnapshot.edges,
        },
        invalidatesSimulation: true,
        invalidatesEvidence: true,
      }));
      if (ok) {
        setSelectedNode(nextNode);
      }
    } else if (selectedEdge) {
      const nextEdge = {
        ...selectedEdge,
        data: {
          ...selectedEdge.data,
          execution: updatedExecution,
          linkExecution: updatedExecution,
        },
      };
      const ok = commitModelMutation((currentSnapshot) => ({
        snapshot: {
          nodes: currentSnapshot.nodes,
          edges: currentSnapshot.edges.map(e => e.id === selectedEdge.id ? nextEdge : e),
        },
        invalidatesSimulation: true,
        invalidatesEvidence: true,
      }));
      if (ok) {
        setSelectedEdge(nextEdge);
      }
    }
  }, [selectedNode, selectedEdge, commitModelMutation]);

  const writableAttributes = useMemo(() => {
    const list: { id: string; displayName: string }[] = [];
    nodes.filter(n => n.data?.type === 'object').forEach(obj => {
      const objName = obj.data?.name || obj.id;
      const data = obj.data as any;
      const attrs = (data?.objectExecution?.attributes || data?.execution?.attributes || []) as any[];
      attrs.forEach((attr: any) => {
        list.push({
          id: attr.id,
          displayName: `${objName}.${attr.displayName || attr.id}`,
        });
      });
    });
    return list;
  }, [nodes]);

  const handleEdgeTypeChange = useCallback((edgeId: string, newType: OPMLinkType) => {
    handleConvertEdgeType(edgeId, newType);
  }, [handleConvertEdgeType]);

  const handleEdgeDelete = useCallback((edgeId: string) => {
    executeDeletion({ edgeIds: [edgeId] });
  }, [executeDeletion]);

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

  // --- Comprehensive Keyboard Shortcuts (Ctrl+S, Ctrl+Z, Ctrl+Y, Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+D, Ctrl+R, Ctrl+P, Ctrl+O, Ctrl+L, Zoom, Delete, Escape, Space) ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If user is actively typing in an input, textarea, or contentEditable element, do not intercept
      const target = e.target as HTMLElement | null;
      const isInput = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      );

      // Escape: Deselect elements / close inspectors / modals
      if (e.key === 'Escape') {
        setSelectedNode(null);
        setSelectedEdge(null);
        setNodes(prev => prev.map(n => n.selected ? { ...n, selected: false } : n));
        setEdges(prev => prev.map(ed => ed.selected ? { ...ed, selected: false } : ed));
        setShowShortcutsModal(false);
        return;
      }

      // If typing in an input field, let normal typing / delete / undo happen inside the field
      if (isInput) return;

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // 1. Save: Ctrl+S / Cmd+S
      if (isCtrlOrCmd && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        e.stopPropagation();
        if (onSave) {
          onSave(nodes, edges);
          logSim('success', 'Diagram saved (Ctrl+S).');
        }
        return;
      }

      // 2. Undo: Ctrl+Z / Cmd+Z (without Shift)
      if (isCtrlOrCmd && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        triggerUndo();
        return;
      }

      // 3. Redo: Ctrl+Y / Cmd+Y OR Ctrl+Shift+Z / Cmd+Shift+Z
      if (
        (isCtrlOrCmd && (e.key === 'y' || e.key === 'Y')) ||
        (isCtrlOrCmd && (e.key === 'z' || e.key === 'Z') && e.shiftKey)
      ) {
        e.preventDefault();
        e.stopPropagation();
        triggerRedo();
        return;
      }

      // 4. Select All: Ctrl+A / Cmd+A
      if (isCtrlOrCmd && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        e.stopPropagation();
        setNodes(prev => prev.map(n => ({ ...n, selected: true })));
        setEdges(prev => prev.map(ed => ({ ...ed, selected: true })));
        logSim('info', 'Selected all elements (Ctrl+A).');
        return;
      }

      // 5. Copy: Ctrl+C / Cmd+C
      if (isCtrlOrCmd && (e.key === 'c' || e.key === 'C')) {
        const activeSelectedNodes = nodes.filter(n => n.selected || (selectedNode && n.id === selectedNode.id));
        if (activeSelectedNodes.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          const selectedObjIds = new Set(activeSelectedNodes.map(n => n.id));
          const childStates = nodes.filter(n => n.parentId && selectedObjIds.has(n.parentId));
          const toCopyNodes = [...new Set([...activeSelectedNodes, ...childStates])];
          const toCopyIds = new Set(toCopyNodes.map(n => n.id));
          const toCopyEdges = edges.filter(ed => toCopyIds.has(ed.source) && toCopyIds.has(ed.target));
          opmClipboardRef.current = {
            nodes: JSON.parse(JSON.stringify(toCopyNodes)),
            edges: JSON.parse(JSON.stringify(toCopyEdges)),
          };
          logSim('info', `Copied ${activeSelectedNodes.length} element(s) (Ctrl+C).`);
        }
        return;
      }

      // 6. Paste: Ctrl+V / Cmd+V
      if (isCtrlOrCmd && (e.key === 'v' || e.key === 'V')) {
        if (opmClipboardRef.current && opmClipboardRef.current.nodes.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          saveHistory(nodes, edges);
          const idMap = new Map<string, string>();
          opmClipboardRef.current.nodes.forEach(n => idMap.set(n.id, uuidv4()));

          const newPastedNodes: AppNode[] = opmClipboardRef.current.nodes.map(n => {
            const newId = idMap.get(n.id)!;
            const isChild = Boolean(n.parentId);
            const parentId = n.parentId ? idMap.get(n.parentId) || n.parentId : undefined;
            return {
              ...n,
              id: newId,
              selected: true,
              parentId,
              position: isChild
                ? { ...n.position }
                : { x: n.position.x + 35, y: n.position.y + 35 },
              data: {
                ...n.data,
                parentId: parentId || null,
              }
            };
          });

          const newPastedEdges: AppEdge[] = opmClipboardRef.current.edges.map(edge => {
            const newSource = idMap.get(edge.source) || edge.source;
            const newTarget = idMap.get(edge.target) || edge.target;
            return {
              ...edge,
              id: `e-${newSource}-${newTarget}-${uuidv4().slice(0, 6)}`,
              source: newSource,
              target: newTarget,
              selected: false,
            };
          });

          setNodes(prev => [...prev.map(n => ({ ...n, selected: false })), ...newPastedNodes]);
          setEdges(prev => [...prev.map(ed => ({ ...ed, selected: false })), ...newPastedEdges]);
          if (newPastedNodes.length > 0) {
            setSelectedNode(newPastedNodes[0]);
          }
          logSim('info', `Pasted ${newPastedNodes.filter(n => !n.parentId).length} element(s) (Ctrl+V).`);
        }
        return;
      }

      // 7. Cut: Ctrl+X / Cmd+X
      if (isCtrlOrCmd && (e.key === 'x' || e.key === 'X')) {
        const activeSelectedNodes = nodes.filter(n => n.selected || (selectedNode && n.id === selectedNode.id));
        if (activeSelectedNodes.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          saveHistory(nodes, edges);
          const selectedObjIds = new Set(activeSelectedNodes.map(n => n.id));
          const childStates = nodes.filter(n => n.parentId && selectedObjIds.has(n.parentId));
          const toCopyNodes = [...new Set([...activeSelectedNodes, ...childStates])];
          const toCopyIds = new Set(toCopyNodes.map(n => n.id));
          const toCopyEdges = edges.filter(ed => toCopyIds.has(ed.source) && toCopyIds.has(ed.target));
          opmClipboardRef.current = {
            nodes: JSON.parse(JSON.stringify(toCopyNodes)),
            edges: JSON.parse(JSON.stringify(toCopyEdges)),
          };
          setNodes(prev => prev.filter(n => !toCopyIds.has(n.id)));
          setEdges(prev => prev.filter(ed => !toCopyIds.has(ed.source) && !toCopyIds.has(ed.target)));
          setSelectedNode(null);
          setSelectedEdge(null);
          logSim('info', `Cut ${activeSelectedNodes.length} element(s) (Ctrl+X).`);
        }
        return;
      }

      // 8. Duplicate: Ctrl+D / Cmd+D
      if (isCtrlOrCmd && (e.key === 'd' || e.key === 'D')) {
        const activeSelectedNodes = nodes.filter(n => n.selected || (selectedNode && n.id === selectedNode.id));
        if (activeSelectedNodes.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          saveHistory(nodes, edges);
          const idMap = new Map<string, string>();
          const selectedObjIds = new Set(activeSelectedNodes.map(n => n.id));
          const childStates = nodes.filter(n => n.parentId && selectedObjIds.has(n.parentId));
          const toDupNodes = [...new Set([...activeSelectedNodes, ...childStates])];
          toDupNodes.forEach(n => idMap.set(n.id, uuidv4()));

          const dupNodes: AppNode[] = toDupNodes.map(n => {
            const newId = idMap.get(n.id)!;
            const isChild = Boolean(n.parentId);
            const parentId = n.parentId ? idMap.get(n.parentId) || n.parentId : undefined;
            return {
              ...n,
              id: newId,
              selected: true,
              parentId,
              position: isChild
                ? { ...n.position }
                : { x: n.position.x + 35, y: n.position.y + 35 },
              data: {
                ...n.data,
                parentId: parentId || null,
              }
            };
          });

          const toDupIds = new Set(toDupNodes.map(n => n.id));
          const toDupEdges = edges.filter(ed => toDupIds.has(ed.source) && toDupIds.has(ed.target));
          const dupEdges: AppEdge[] = toDupEdges.map(edge => {
            const newSource = idMap.get(edge.source) || edge.source;
            const newTarget = idMap.get(edge.target) || edge.target;
            return {
              ...edge,
              id: `e-${newSource}-${newTarget}-${uuidv4().slice(0, 6)}`,
              source: newSource,
              target: newTarget,
              selected: false,
            };
          });

          setNodes(prev => [...prev.map(n => ({ ...n, selected: false })), ...dupNodes]);
          setEdges(prev => [...prev.map(ed => ({ ...ed, selected: false })), ...dupEdges]);
          if (dupNodes.length > 0) {
            setSelectedNode(dupNodes[0]);
          }
          logSim('info', `Duplicated ${activeSelectedNodes.length} element(s) (Ctrl+D).`);
        }
        return;
      }

      // 9. Run Simulation: Ctrl+R / Cmd+R
      if (isCtrlOrCmd && (e.code === 'KeyR' || e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        e.stopPropagation();
        runSimulation();
        return;
      }

      // 10. Pause Simulation: Ctrl+P / Cmd+P
      if (isCtrlOrCmd && (e.code === 'KeyP' || e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        e.stopPropagation();
        pauseSimulation();
        return;
      }

      // 11. Reset Simulation: Ctrl+O / Cmd+O
      if (isCtrlOrCmd && (e.code === 'KeyO' || e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        e.stopPropagation();
        resetSimulation();
        return;
      }

      // 12. Auto Layout: Ctrl+L / Cmd+L
      if (isCtrlOrCmd && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        e.stopPropagation();
        triggerAutoLayout('hierarchy');
        logSim('info', 'Auto-layout applied (Ctrl+L).');
        return;
      }

      // 13. Zoom In: Ctrl+= / Ctrl++
      if (isCtrlOrCmd && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        e.stopPropagation();
        reactFlowInstanceRef.current?.zoomIn({ duration: 200 });
        return;
      }

      // 14. Zoom Out: Ctrl+-
      if (isCtrlOrCmd && e.key === '-') {
        e.preventDefault();
        e.stopPropagation();
        reactFlowInstanceRef.current?.zoomOut({ duration: 200 });
        return;
      }

      // 15. Fit View: Ctrl+0
      if (isCtrlOrCmd && e.key === '0') {
        e.preventDefault();
        e.stopPropagation();
        reactFlowInstanceRef.current?.fitView({ duration: 250, padding: 0.15 });
        return;
      }

      // 16. Delete or Backspace: Delete selected node(s) or edge(s)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const activeSelectedNodes = nodes.filter(n => n.selected || (selectedNode && n.id === selectedNode.id));
        const activeSelectedEdges = edges.filter(ed => ed.selected || (selectedEdge && ed.id === selectedEdge.id));

        if (activeSelectedNodes.length > 0 || activeSelectedEdges.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          executeDeletion({
            nodeIds: activeSelectedNodes.map(n => n.id),
            edgeIds: activeSelectedEdges.map(ed => ed.id),
          });
          return;
        }
      }

      // 17. Space: Record keydown without repeat so Space + C can be detected
      if (e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) {
          isSpacePressed.current = true;
        }
        return;
      }

      // 18. Space + C: Toggle Collapse / Expand all dock panels (Left, Right, Bottom)
      if ((e.key === 'c' || e.key === 'C') && isSpacePressed.current) {
        e.preventDefault();
        e.stopPropagation();
        spaceComboUsed.current = true;
        const allCollapsed = !docks.left && !docks.right && !docks.bottom;
        if (allCollapsed) {
          handleDocksChange({ ...docks, left: true, right: true, bottom: true });
          logSim('info', 'Expanded all panels (Space + C).');
        } else {
          handleDocksChange({ ...docks, left: false, right: false, bottom: false });
          logSim('info', 'Collapsed all panels (Space + C).');
        }
        return;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        const wasCombo = spaceComboUsed.current;
        isSpacePressed.current = false;
        spaceComboUsed.current = false;
        if (!wasCombo) {
          const target = e.target as HTMLElement | null;
          const isInput = target && (
            target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable
          );
          if (!isInput) {
            toggleSimulation();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
    };
  }, [
    selectedNode,
    selectedEdge,
    nodes,
    edges,
    docks,
    handleDocksChange,
    handleDeleteSelectedNode,
    triggerUndo,
    triggerRedo,
    onSave,
    toggleSimulation,
    runSimulation,
    pauseSimulation,
    resetSimulation,
    triggerAutoLayout,
    saveHistory,
    logSim
  ]);

  const numIn = selectedNode?.data?.inputs?.length || 0;
  const numOut = selectedNode?.data?.outputs?.length || 0;
  const selectedNodePortsCount = numIn + numOut;

  const rightPanelContent = (
    <OpmRightPanelContent
      nodes={nodes}
      edges={edges}
      selectedNode={selectedNode}
      selectedEdge={selectedEdge}
      onCloseInspector={() => {
        setSelectedNode(null);
        setSelectedEdge(null);
      }}
      onUpdateNodeProp={handleUpdateNodeProp}
      onConvertNodeType={handleConvertNodeType}
      onAddStateToObject={handleAddStateToObject}
      onManualActivateState={handleManualActivateState}
      onDeleteState={handleDeleteState}
      onAddAttribute={handleAddAttribute}
      onAddPort={handleAddPort}
      onRemovePort={handleRemovePort}
      onZoomInNode={handleZoomInNode}
      onDeleteSelectedNode={handleDeleteSelectedNode}
      onConvertEdgeType={handleConvertEdgeType}
      rightTab={rightTab}
      onRightTabChange={(t) => setRightTab(t as any)}
      simRunning={simRunning}
      simTick={simStateRef.current?.tick || 0}
      tickMs={activeOpmConfig.tickMs}
      onToggleSimulation={toggleSimulation}
      onRunSimTick={runSimTick}
      onResetSimulation={resetSimulation}
      activeOpmConfig={activeOpmConfig}
      onOpmConfigChange={(updater: any) => {
        if (typeof updater === 'function') {
          const next = updater(activeOpmConfig);
          if (next && next.tickMs !== undefined) handleConfigFieldChange('tickMs', next.tickMs);
        } else if (updater && updater.tickMs !== undefined) {
          handleConfigFieldChange('tickMs', updater.tickMs);
        }
      }}
      executionConfig={opmExecutionConfig}
      onUpdateSelectionExecution={handleUpdateSelectionExecution}
      writableAttributes={writableAttributes}
      diagnostics={[]}
      simControlExtraContent={
        <div className="flex flex-col gap-3.5 pt-1">
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
      }
      scopeTabContent={
        <div className="flex-1 flex flex-col overflow-hidden p-2 min-h-0">
          <OpmSimulationScope
            simRunning={simRunning}
            currentTick={simStateRef.current.tick}
            tickMs={activeOpmConfig.tickMs}
            nodes={nodes}
            edges={edges}
            recentLogs={simLogs}
            onReset={resetSimulation}
          />
        </div>
      }
      oplTabContent={
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
          <div className="h-8 border-b border-[#222] px-3 flex items-center justify-between shrink-0 bg-[#181818]/60 text-xs text-[#888]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">OPL Editor Mode</span>
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
          <div className="flex-1 relative p-3 min-h-0">
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
      }
      smartShowTabContent={
        <div className="flex-1 flex flex-col overflow-hidden p-3 min-h-0">
          <SmartShowPanel
            nodes={nodes}
            edges={edges}
            simState={simStateRef.current}
            simRunning={simRunning}
            onSelectProcess={(pid) => {
              const p = nodes.find(n => n.id === pid);
              if (p) {
                setSelectedNode(p);
                setSelectedEdge(null);
              }
            }}
            onSelectElement={(elemId) => {
              const node = nodes.find(n => n.id === elemId);
              if (node) {
                setSelectedNode(node);
                setSelectedEdge(null);
                return;
              }
              const edge = edges.find(e => e.id === elemId);
              if (edge) {
                setSelectedEdge(edge);
                setSelectedNode(null);
                return;
              }
              for (const n of nodes) {
                const hasPort = (n.data?.inputs || []).some(p => p.id === elemId) || (n.data?.outputs || []).some(p => p.id === elemId);
                if (hasPort) {
                  setSelectedNode(n);
                  setSelectedEdge(null);
                  return;
                }
              }
            }}
          />
        </div>
      }
      codegenTabContent={
        <div className="flex-1 overflow-y-auto">
          <OpmCodeGenerationWorkspace
            nodes={nodes as never}
            edges={edges as never}
            executionConfig={opmExecutionConfig}
            state={opmArtifactState}
            onStateChange={setOpmArtifactState}
            opmSimulationConfig={activeOpmConfig}
            onNavigateToDiagnostic={(src) => {
              if (src.elementId) {
                const node = nodes.find(n => n.id === src.elementId);
                if (node) {
                  setSelectedNode(node);
                  setSelectedEdge(null);
                  return;
                }
                const edge = edges.find(e => e.id === src.elementId);
                if (edge) {
                  setSelectedEdge(edge);
                  setSelectedNode(null);
                  return;
                }
              }
              onAddError?.('info', `Diagnostic reference: ${src.elementId || src.propertyPath || 'unknown source'}`, 'OPM');
            }}
            onDownload={(files) => {
              onAddError?.('info', `Verified OPM bundle ready: ${files.length} files.`, 'OPM');
            }}
            onRunHil={(files) => {
              onAddError?.('info', `Verified OPM bundle sent to HIL: ${files.length} files.`, 'OPM');
            }}
          />
        </div>
      }
    />
  );

  return (
    <div className="entropy-workspace ui-surface h-full w-full font-sans">
      <OpmDockShell
        docks={isRightFloating ? { ...docks, right: false } : docks}
        onDocksChange={(nextDocks) => {
          if (isRightFloating && nextDocks.right) {
            setIsRightFloating(false);
          }
          handleDocksChange(nextDocks);
        }}
        left={
          <div className="flex flex-col gap-2 p-2">
            {/* Tool Dock (moved verbatim into left dock slot; wrapper adapted from floating to docked) */}
            <div className="opm-panel ui-card bg-[var(--surface-panel)] border border-[var(--border-default)] rounded-lg p-2 flex flex-col gap-2 shadow-xl" role="toolbar" aria-label="OPM Canvas Tools">
              <span className="text-[8px] uppercase tracking-wider font-extrabold text-orange-400/80 mb-0.5 text-center">Tools</span>
              <button
                onClick={() => setActiveTool('select')}
                aria-label="Select tool"
                data-testid="opm-tool-select"
                className={`p-2 rounded text-xs transition-all flex flex-col items-center justify-center gap-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                  activeTool === 'select' ? 'bg-[#f97316]/20 border border-[#f97316] text-[#f97316] font-bold shadow' : 'hover:bg-[#222] text-[#999]'
                }`}
                title="Select / Move elements"
              >
                <span aria-hidden="true">🖱️</span> <span className="text-[8px]">Select</span>
              </button>
              <button
                onClick={() => setActiveTool('object')}
                aria-label="Add Object"
                data-testid="opm-tool-object"
                className={`p-2 rounded text-xs transition-all flex flex-col items-center justify-center gap-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  activeTool === 'object' ? 'bg-emerald-950/60 border border-emerald-400 text-emerald-300 font-bold shadow' : 'hover:bg-[#222] text-[#999]'
                }`}
                title="Click canvas to place an Object"
              >
                <span aria-hidden="true">🟢</span> <span className="text-[8px]">Object</span>
              </button>
              <button
                onClick={() => setActiveTool('process')}
                aria-label="Add Process"
                data-testid="opm-tool-process"
                className={`p-2 rounded text-xs transition-all flex flex-col items-center justify-center gap-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                  activeTool === 'process' ? 'bg-sky-950/60 border border-sky-400 text-sky-300 font-bold shadow' : 'hover:bg-[#222] text-[#999]'
                }`}
                title="Click canvas to place a Process"
              >
                <span aria-hidden="true">🔵</span> <span className="text-[8px]">Process</span>
              </button>
              <button
                onClick={() => setActiveTool('state')}
                aria-label="Add State"
                data-testid="opm-tool-state"
                className={`p-2 rounded text-xs transition-all flex flex-col items-center justify-center gap-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                  activeTool === 'state' ? 'bg-orange-950/60 border border-orange-400 text-orange-300 font-bold shadow animate-pulse' : 'hover:bg-[#222] text-[#999]'
                }`}
                title="Click an Object to add a State inside it"
              >
                <span aria-hidden="true">🔶</span> <span className="text-[8px]">State</span>
              </button>
              <button
                onClick={() => setActiveTool('requirement')}
                aria-label="Add Requirement"
                data-testid="opm-tool-requirement"
                className={`p-2 rounded text-xs transition-all flex flex-col items-center justify-center gap-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
                  activeTool === 'requirement' ? 'bg-purple-950/60 border border-purple-400 text-purple-300 font-bold shadow' : 'hover:bg-[#222] text-[#999]'
                }`}
                title="Click canvas to place a Requirement"
              >
                <span aria-hidden="true">📜</span> <span className="text-[8px]">Req</span>
              </button>

              <div className="h-px bg-[#333] my-1"></div>
              <span className="text-[8px] uppercase tracking-wider font-extrabold text-sky-400/80 text-center mb-0.5">Link Mode</span>

              <select
                value={activeLinkType}
                onChange={(e) => setActiveLinkType(e.target.value as OPMLinkType)}
                aria-label="Select link type"
                data-testid="opm-link-mode-select"
                className="bg-[#0f0f0f] border border-[#333] rounded text-[10px] py-1 px-1.5 outline-none text-[#ccc] w-20 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
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
            {/* Model outline: zoom path navigator + in-scope counts */}
            <div className="rounded-lg border border-[#2d2d2d] bg-[#161616]/95 p-2 shadow-xl">
              <span className="mb-1 block text-center text-[8px] font-extrabold uppercase tracking-wider text-orange-400/80">Outline</span>
              <div className="flex flex-col gap-1">
                {zoomPath.map((zp, i) => {
                  const label = zp === 'root' ? 'System Context' : nodes.find(n => n.id === zp)?.data.name || zp;
                  return (
                    <button
                      key={zp}
                      onClick={() => setZoomPath(zoomPath.slice(0, i + 1))}
                      className={`truncate rounded px-1.5 py-1 text-left text-[10px] transition-colors ${i === zoomPath.length - 1 ? 'bg-orange-950/40 font-bold text-orange-300' : 'text-[#888] hover:bg-[#222]'}`}
                    >
                      {i > 0 ? '› ' : ''}{label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-1.5 border-t border-[#2d2d2d] pt-1.5 font-mono text-[9px] text-[#666]">
                {nodes.filter(n => n.data.parentId === activeParentId).length} elements · {filteredEdges.length} links
              </div>
            </div>
          </div>
        }
        center={
          <div className="flex h-full min-h-0 flex-col">
        {/* Navigation / Control bar -> Studio Ribbon */}
        <div
          data-testid="opm-studio-ribbon"
          className="h-11 bg-[#121215]/95 backdrop-blur-md border-b border-[#25252a] px-3 flex items-center justify-between gap-3 shrink-0 select-none overflow-x-auto custom-scrollbar"
        >
          {/* Zone 1: Context & Model Sources (Left) */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onBack}
              className="px-2 py-1 text-xs font-semibold border border-[#333] rounded hover:bg-[#252528] text-gray-300 hover:text-white transition-colors flex items-center gap-1"
            >
              ← <span className="hidden sm:inline">Back</span>
            </button>
            <span className="text-xs text-[#444]">/</span>
            {/* Breadcrumbs */}
            <div className="flex items-center gap-1 text-xs font-medium max-w-[180px] truncate">
              {zoomPath.map((zp, i) => {
                const label = zp === 'root' ? 'System Context' : nodes.find(n => n.id === zp)?.data.name || zp;
                return (
                  <React.Fragment key={zp}>
                    {i > 0 && <span className="text-[#555]">›</span>}
                    <button
                      onClick={() => setZoomPath(zoomPath.slice(0, i + 1))}
                      className={`hover:text-orange-400 transition-colors truncate ${i === zoomPath.length - 1 ? 'text-orange-400 font-bold' : 'text-[#888]'}`}
                    >
                      {label}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
            {/* Example Template Loader */}
            <select
              onChange={(e) => {
                const val = e.target.value;
                if (val && OPM_EXAMPLES[val]) {
                  const selectedExample = OPM_EXAMPLES[val];
                  const { nodes: parsedNodes, edges: parsedEdges, errors } = parseOpl(selectedExample.oplText);
                  simStateRef.current = initializeSimulation(parsedNodes);
                  const initializedNodes = applySimResultToNodes(parsedNodes, simStateRef.current, []);
                  const layoutedNodes = layoutOpmGraph(initializedNodes, parsedEdges);
                  saveHistory(nodes, edges);
                  setNodes(layoutedNodes);
                  setEdges(parsedEdges);
                  setOplText(selectedExample.oplText);
                  setOplErrors(errors);
                  logSim('success', `Loaded example model: ${selectedExample.name}`);
                  if (onSave) onSave(layoutedNodes, parsedEdges);
                }
              }}
              defaultValue=""
              className="bg-[#18181c] border border-[#333] rounded text-[10px] py-1 px-1.5 outline-none text-[#ccc] w-28 font-medium focus:border-orange-500/50"
            >
              <option value="" disabled>-- Template --</option>
              {Object.entries(OPM_EXAMPLES).map(([key, ex]) => (
                <option key={key} value={key}>{ex.name}</option>
              ))}
            </select>
            {sysmlState && (
              <button
                onClick={() => {
                  const { nodes: impNodes, edges: impEdges, warnings } = importSysmlToOpm(sysmlState);
                  const candidateSnapshot: OpmModelSnapshot = normalizeContainment({ nodes: impNodes, edges: impEdges });
                  const validation = validateOpmModelLifecycle(candidateSnapshot);
                  if (!validation.valid) {
                    const firstErr = validation.diagnostics.find(d => d.severity === 'error');
                    const msg = firstErr?.message || 'SysML import violates lifecycle integrity rules.';
                    if (onAddError) onAddError('error', msg, 'OPM');
                    logSim('error', msg);
                    return;
                  }

                  commitModelMutation(() => ({
                    snapshot: candidateSnapshot,
                    invalidatesSimulation: true,
                    invalidatesEvidence: true,
                    impactSummary: `Imported ${impNodes.length} OPM elements from the SysML model.`,
                  }));
                  setOplText('');
                  warnings.forEach(w => logSim('warning', w));
                }}
                className="px-2 py-0.5 text-[10px] border border-purple-600/80 bg-purple-950/30 text-purple-300 rounded hover:bg-purple-900/50 transition-colors font-semibold"
                title="Migrate the SysML BDD/IBD/Requirements model into this OPM workspace"
              >
                SysML → OPM
              </button>
            )}
          </div>

          {/* Zone 2: Simulation Transport & Logic Scope (Center) */}
          <div className="flex items-center gap-2 shrink-0 bg-[#18181c] px-2.5 py-1 rounded-lg border border-white/5 shadow-sm">
            <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded border border-white/5">
              <button
                data-testid="opm-sim-toggle"
                onClick={toggleSimulation}
                className={`p-1 rounded transition-colors ${simRunning ? 'text-red-400 hover:bg-red-950/40' : 'text-green-400 hover:bg-green-950/40'}`}
                title={simRunning ? 'Pause Simulation (Space)' : 'Start Simulation (Space)'}
              >
                {simRunning ? <Pause size={13} /> : <Play size={13} />}
              </button>
              <button
                data-testid="opm-sim-step"
                onClick={runSimTick}
                className="p-1 text-sky-400 hover:bg-sky-950/40 rounded transition-colors"
                title="Step Simulation"
              >
                <ArrowRight size={13} />
              </button>
              <button
                data-testid="opm-sim-reset"
                onClick={resetSimulation}
                className="p-1 text-amber-400 hover:bg-amber-950/40 rounded transition-colors"
                title="Reset Simulation"
              >
                <RotateCcw size={13} />
              </button>
            </div>

            <span className="w-px h-3.5 bg-[#333]"></span>
            <span
              data-testid="opm-sim-status"
              className={`text-[9px] uppercase font-extrabold flex items-center gap-1 ${simRunning ? 'text-green-400' : 'text-[#888]'}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${simRunning ? 'bg-green-400 animate-ping' : 'bg-gray-500'}`} />
              {simRunning ? 'Running' : 'Paused'}
            </span>
            <span className="w-px h-3.5 bg-[#333]"></span>

            <div className="flex items-center gap-1.5">
              <span className="text-[8px] uppercase tracking-wider font-extrabold text-[#777]">Tick:</span>
              <input
                data-testid="opm-toolbar-tick-slider"
                type="range"
                min="10"
                max="2000"
                step="10"
                value={activeOpmConfig.tickMs}
                onChange={(e) => handleConfigFieldChange('tickMs', Number(e.target.value))}
                className="w-16 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
                title="OPM Simulation speed interval (ms)"
              />
              <span className="text-[9px] text-[#888] font-mono w-9 text-right">{activeOpmConfig.tickMs}ms</span>
            </div>

            <span className="w-px h-3.5 bg-[#333]"></span>

            {/* Scope Quick Launcher */}
            <button
              data-testid="opm-sim-scope-launcher"
              onClick={() => setRightTab('scope')}
              className={`px-2 py-0.5 text-[10px] rounded transition-all flex items-center gap-1 font-bold ${
                rightTab === 'scope'
                  ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40 shadow-sm'
                  : 'text-gray-400 hover:text-orange-300 hover:bg-white/5 border border-transparent'
              }`}
              title="Open Simulation Scope (Logic Analyzer)"
            >
              📈 <span>Scope</span>
            </button>
          </div>

          {/* Zone 3: History & Canvas Layout (Right) */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="flex items-center bg-[#18181c] rounded-md border border-white/5 p-0.5">
              <button
                onClick={triggerUndo}
                disabled={undoStack.length === 0}
                className="p-1 rounded hover:bg-[#252529] text-[#aaa] hover:text-white disabled:opacity-25 disabled:hover:bg-transparent transition-colors text-xs"
                title="Undo (Ctrl+Z)"
              >
                ↶
              </button>
              <button
                onClick={triggerRedo}
                disabled={redoStack.length === 0}
                className="p-1 rounded hover:bg-[#252529] text-[#aaa] hover:text-white disabled:opacity-25 disabled:hover:bg-transparent transition-colors text-xs"
                title="Redo (Ctrl+Y)"
              >
                ↷
              </button>
            </div>
            <div className="flex items-center bg-[#18181c] rounded-md border border-white/5 p-0.5">
              <button
                onClick={() => triggerAutoLayout('force')}
                className="px-2 py-0.5 text-[10px] rounded hover:bg-[#252529] flex items-center gap-1 text-[#bbb] hover:text-white transition-colors"
                title="Force-Directed Auto Layout"
              >
                <Layout size={11} /> Force
              </button>
              <button
                onClick={() => triggerAutoLayout('hierarchy')}
                className="px-2 py-0.5 text-[10px] rounded hover:bg-[#252529] flex items-center gap-1 text-[#bbb] hover:text-white transition-colors"
                title="Grid/Hierarchy Auto Layout (Ctrl+L)"
              >
                <Layout size={11} /> Tree
              </button>
            </div>
            <button
              onClick={() => setShowShortcutsModal(prev => !prev)}
              data-testid="opm-shortcuts-help-btn"
              className={`px-2 py-0.5 text-[10px] rounded transition-all flex items-center gap-1 font-semibold ${
                showShortcutsModal
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                  : 'text-gray-400 hover:text-white hover:bg-[#252529] border border-transparent'
              }`}
              title="Keyboard Shortcuts Cheat Sheet"
            >
              ⌨ <span className="hidden md:inline">Shortcuts</span>
            </button>
          </div>
        </div>

          {/* Center canvas */}
          <div className="relative min-h-0 flex-1">

          {/* React Flow Canvas */}
          <div className="absolute inset-0">
            <ReactFlow
              proOptions={{ hideAttribution: true }}
              nodes={filteredNodes}
              edges={mappedEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              onConnectStart={(_, p) => setConnectSourceId(p.nodeId ?? null)}
              onConnectEnd={() => setConnectSourceId(null)}
              onEdgeClick={(_, edge) => { setSelectedEdge(edge); setSelectedNode(null); }}
              onNodeDragStop={handleNodeDragStop}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onInit={(inst) => { reactFlowInstanceRef.current = inst; }}
              onPaneClick={handlePaneClick}
              onNodeClick={handleNodeClick}
              onNodesDelete={(deleted) => {
                executeDeletion({ nodeIds: deleted.map(n => n.id) });
              }}
              onEdgesDelete={(deleted) => {
                executeDeletion({ edgeIds: deleted.map(e => e.id) });
              }}
              deleteKeyCode={['Backspace', 'Delete']}
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
            <OpmLegend onOpenHelp={onOpenHelp ? () => onOpenHelp('entropy-opm') : undefined} />
            <OpmDiagnosticsBadge
              diagnostics={opmArtifactState.diagnostics}
              onNavigateToDiagnostic={handleNavigateToDiagnostic}
            />

            {/* Diagnostic Navigation Fallback Toast */}
            {diagnosticNavMessage && (
              <div
                data-testid="diagnostic-nav-fallback"
                className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-[#241305] border border-amber-500/70 text-amber-300 px-3 py-1.5 rounded shadow-2xl text-xs flex items-center gap-2 select-none"
              >
                <span>{diagnosticNavMessage}</span>
                <button onClick={() => setDiagnosticNavMessage(null)} className="text-gray-400 hover:text-white text-xs font-bold">✕</button>
              </div>
            )}
          </div>
        </div>
      </div>
    }
    right={
      !isRightFloating ? (
        <div className="flex h-full flex-col min-h-0">
          {/* Dock Header with Double-Click & Popout */}
          <div
            data-testid="opm-right-dock-header"
            onDoubleClick={() => setIsRightFloating(true)}
            className="h-8 bg-[#18181c] border-b border-white/10 px-3 flex items-center justify-between shrink-0 select-none cursor-pointer group hover:bg-[#202026] transition-colors"
            title="Double-click to float on workspace"
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-300 group-hover:text-orange-300 transition-colors">
                Inspector & Tools
              </span>
            </div>
            <button
              type="button"
              data-testid="opm-float-right-panel-btn"
              onClick={() => setIsRightFloating(true)}
              className="p-1 text-gray-400 hover:text-orange-400 rounded transition-colors"
              title="Pop out into floating window (or double-click header)"
            >
              <ExternalLink size={12} />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden">
            {rightPanelContent}
          </div>
        </div>
      ) : null
    }
        bottom={
          <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#111]">
            <div className="h-8 bg-[#181818] border-b border-[#222] px-4 flex items-center justify-between text-xs font-bold text-[#888]">
              <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Simulation Console</span>
              <button
                onClick={() => setSimLogs([])}
                className="text-[#555] hover:text-[#bbb] text-[10px]"
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
        }
      />

      {/* OPM Floating Right Panel Window */}
      {isRightFloating && (
        <OpmFloatingWindow
          isOpen={isRightFloating}
          title={selectedNode ? selectedNode.data.name || 'Element Inspector' : 'OPM Studio & Tools'}
          badge={selectedNode ? (selectedNode.data.type || 'Object').toUpperCase() : 'OPM Studio'}
          onClose={() => setIsRightFloating(false)}
          onDock={() => setIsRightFloating(false)}
        >
          {rightPanelContent}
        </OpmFloatingWindow>
      )}

      {/* OPM Studio Keyboard Shortcuts Modal */}
      {showShortcutsModal && (
        <div
          data-testid="opm-shortcuts-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setShowShortcutsModal(false)}
        >
          <div
            className="w-full max-w-lg bg-[#141416] border border-[#333] rounded-xl shadow-2xl p-4 text-white space-y-3"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#292929] pb-2">
              <div className="flex items-center gap-2">
                <span className="text-base">⌨</span>
                <h3 className="text-sm font-bold text-amber-400">OPM Studio Keyboard Shortcuts</h3>
              </div>
              <button
                onClick={() => setShowShortcutsModal(false)}
                className="text-gray-400 hover:text-white text-sm px-1.5 py-0.5 rounded hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-white/5 pb-0.5">Editing & Clipboard</div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-gray-300">Select All</span>
                  <kbd className="px-1.5 py-0.5 bg-[#202024] border border-white/10 rounded font-mono text-[10px] text-amber-300">Ctrl + A</kbd>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-gray-300">Copy Selected</span>
                  <kbd className="px-1.5 py-0.5 bg-[#202024] border border-white/10 rounded font-mono text-[10px] text-amber-300">Ctrl + C</kbd>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-gray-300">Paste</span>
                  <kbd className="px-1.5 py-0.5 bg-[#202024] border border-white/10 rounded font-mono text-[10px] text-amber-300">Ctrl + V</kbd>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-gray-300">Cut</span>
                  <kbd className="px-1.5 py-0.5 bg-[#202024] border border-white/10 rounded font-mono text-[10px] text-amber-300">Ctrl + X</kbd>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-gray-300">Duplicate</span>
                  <kbd className="px-1.5 py-0.5 bg-[#202024] border border-white/10 rounded font-mono text-[10px] text-amber-300">Ctrl + D</kbd>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-gray-300">Delete Selected</span>
                  <kbd className="px-1.5 py-0.5 bg-[#202024] border border-white/10 rounded font-mono text-[10px] text-amber-300">Del / Backspace</kbd>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-gray-300">Undo</span>
                  <kbd className="px-1.5 py-0.5 bg-[#202024] border border-white/10 rounded font-mono text-[10px] text-amber-300">Ctrl + Z</kbd>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-gray-300">Redo</span>
                  <kbd className="px-1.5 py-0.5 bg-[#202024] border border-white/10 rounded font-mono text-[10px] text-amber-300">Ctrl + Y</kbd>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-gray-300">Save Diagram</span>
                  <kbd className="px-1.5 py-0.5 bg-[#202024] border border-white/10 rounded font-mono text-[10px] text-amber-300">Ctrl + S</kbd>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-white/5 pb-0.5">Simulation & Canvas</div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-gray-300">Run Simulation</span>
                  <kbd className="px-1.5 py-0.5 bg-[#202024] border border-white/10 rounded font-mono text-[10px] text-orange-400">Ctrl + R</kbd>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-gray-300">Pause Simulation</span>
                  <kbd className="px-1.5 py-0.5 bg-[#202024] border border-white/10 rounded font-mono text-[10px] text-orange-400">Ctrl + P</kbd>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-gray-300">Reset Simulation</span>
                  <kbd className="px-1.5 py-0.5 bg-[#202024] border border-white/10 rounded font-mono text-[10px] text-orange-400">Ctrl + O</kbd>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-gray-300">Toggle Play/Pause</span>
                  <kbd className="px-1.5 py-0.5 bg-[#202024] border border-white/10 rounded font-mono text-[10px] text-orange-400">Space</kbd>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-gray-300">Auto Layout</span>
                  <kbd className="px-1.5 py-0.5 bg-[#202024] border border-white/10 rounded font-mono text-[10px] text-sky-400">Ctrl + L</kbd>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-gray-300">Zoom In / Out</span>
                  <kbd className="px-1.5 py-0.5 bg-[#202024] border border-white/10 rounded font-mono text-[10px] text-sky-400">Ctrl + / -</kbd>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-gray-300">Fit View</span>
                  <kbd className="px-1.5 py-0.5 bg-[#202024] border border-white/10 rounded font-mono text-[10px] text-sky-400">Ctrl + 0</kbd>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-gray-300">Toggle Panels</span>
                  <kbd className="px-1.5 py-0.5 bg-[#202024] border border-white/10 rounded font-mono text-[10px] text-amber-300">Space + C</kbd>
                </div>
                <div className="flex justify-between items-center py-0.5">
                  <span className="text-gray-300">Deselect / Cancel</span>
                  <kbd className="px-1.5 py-0.5 bg-[#202024] border border-white/10 rounded font-mono text-[10px] text-gray-400">Escape</kbd>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-[#292929] flex justify-end">
              <button
                onClick={() => setShowShortcutsModal(false)}
                className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded text-xs transition-colors"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
