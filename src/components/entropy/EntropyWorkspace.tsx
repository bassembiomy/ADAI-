import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { OPMObjectNode, OPMProcessNode, OPMStateNode } from './OPMNodeComponents';
import { OPMEdge } from './OPMEdgeComponents';
import { OPMNodeData, OPMEdgeData, OPMLinkType, SimulationLog, OPMState } from './EntropyTypes';
import { generateOpl, parseOpl, OplSyntaxError } from './OplParser';
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

interface EntropyWorkspaceProps {
  initialNodes?: Node<OPMNodeData>[];
  initialEdges?: Edge<OPMEdgeData>[];
  availableVariables: any[];
  onVariablesChange: (vars: any[]) => void;
  tickMs: number;
  onBack: () => void;
  onSave?: (nodes: Node<OPMNodeData>[], edges: Edge<OPMEdgeData>[]) => void;
  onAddError?: (type: 'error' | 'warning' | 'info', message: string, source?: string) => void;
}

export const EntropyWorkspace: React.FC<EntropyWorkspaceProps> = ({
  initialNodes = [],
  initialEdges = [],
  availableVariables,
  onVariablesChange,
  tickMs,
  onBack,
  onSave,
  onAddError,
}) => {
  // --- States ---
  const [nodes, setNodes, onNodesChange] = useNodesState<OPMNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<OPMEdgeData>([]);
  
  // Breadcrumb / Nesting path: ['root', 'proc-1', etc.]
  const [zoomPath, setZoomPath] = useState<string[]>(['root']);
  const activeParentId = useMemo(() => {
    return zoomPath[zoomPath.length - 1] === 'root' ? null : zoomPath[zoomPath.length - 1];
  }, [zoomPath]);

  // Selected tool / link types
  const [activeTool, setActiveTool] = useState<'select' | 'object' | 'process' | 'state'>('select');
  const [activeLinkType, setActiveLinkType] = useState<OPMLinkType>('consumption');

  // Text editor integration (bimodal)
  const [oplText, setOplText] = useState<string>('');
  const [oplErrors, setOplErrors] = useState<OplSyntaxError[]>([]);
  const [isEditingText, setIsEditingText] = useState<boolean>(false);
  const [textVersion, setTextVersion] = useState<string>('');

  // Undo/Redo Stacks
  const [undoStack, setUndoStack] = useState<{ nodes: Node<OPMNodeData>[]; edges: Edge<OPMEdgeData>[] }[]>([]);
  const [redoStack, setRedoStack] = useState<{ nodes: Node<OPMNodeData>[]; edges: Edge<OPMEdgeData>[] }[]>([]);

  // Simulation Runner
  const [simRunning, setSimRunning] = useState<boolean>(false);
  const [simLogs, setSimLogs] = useState<SimulationLog[]>([]);
  const [firingProcesses, setFiringProcesses] = useState<Set<string>>(new Set());
  
  // Selected Node Details
  const [selectedNode, setSelectedNode] = useState<Node<OPMNodeData> | null>(null);

  // --- Initialize canvas ---
  useEffect(() => {
    if (initialNodes.length > 0) {
      setNodes(initialNodes);
    } else {
      // Default template if empty
      const defaultNodes: Node<OPMNodeData>[] = [];
      const defaultEdges: Edge<OPMEdgeData>[] = [];
      setNodes(defaultNodes);
      setEdges(defaultEdges);
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

  // --- Record History for Undo ---
  const saveHistory = useCallback((currentNodes: Node<OPMNodeData>[], currentEdges: Edge<OPMEdgeData>[]) => {
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
        // States are rendered inside objects. React Flow nodes with parentNode:
        // We only render them if their parent object node is visible.
        const parent = nodes.find(p => p.id === n.parentNode);
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

  // --- Add Elements visually ---
  const handleCanvasClick = useCallback((event: React.MouseEvent) => {
    if (activeTool === 'select') return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;

    saveHistory(nodes, edges);

    const id = uuidv4();
    const nodeName = `${activeTool.charAt(0).toUpperCase() + activeTool.slice(1)}_${id.substring(0, 4)}`;

    const newNode: Node<OPMNodeData> = {
      id,
      type: activeTool === 'object' ? 'opmObject' : activeTool === 'process' ? 'opmProcess' : 'opmState',
      position: { x, y },
      data: {
        name: nodeName,
        type: activeTool as any,
        physical: false,
        states: [],
        attributes: [],
        parentId: activeParentId,
      },
    };

    if (activeTool === 'state') {
      // Find object under cursor to assign parentNode
      const clickedObject = nodes.find(n => {
        if (n.data.type !== 'object') return false;
        const width = 150; // approximated width
        const height = 80;
        return (
          x >= n.position.x &&
          x <= n.position.x + width &&
          y >= n.position.y &&
          y <= n.position.y + height &&
          n.data.parentId === activeParentId
        );
      });

      if (clickedObject) {
        newNode.parentNode = clickedObject.id;
        newNode.extent = 'parent';
        newNode.position = { x: 15, y: 45 };
        newNode.data.parentId = clickedObject.id;

        // Add state to parent object structure
        setNodes(prev => prev.map(n => {
          if (n.id === clickedObject.id) {
            const currentStates = n.data.states || [];
            return {
              ...n,
              data: {
                ...n.data,
                states: [...currentStates, { id: newNode.id, name: nodeName, isActive: false }]
              }
            };
          }
          return n;
        }).concat(newNode));
        
        logSim('info', `State ${nodeName} added to Object ${clickedObject.data.name}`);
      } else {
        if (onAddError) onAddError('warning', 'States must be placed inside an Object rectangle.', 'ENTROPY');
      }
    } else {
      setNodes(prev => [...prev, newNode]);
      logSim('info', `${activeTool.toUpperCase()} ${nodeName} created at (${Math.round(x)}, ${Math.round(y)})`);
    }

    setActiveTool('select');
  }, [activeTool, activeParentId, nodes, edges, saveHistory, onAddError]);

  // --- Connect nodes (draw OPM links) ---
  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;

    saveHistory(nodes, edges);

    const newEdge: Edge<OPMEdgeData> = {
      id: `e-${connection.source}-${connection.target}`,
      source: connection.source,
      target: connection.target,
      type: 'opmEdge',
      data: {
        type: activeLinkType,
      },
    };

    setEdges(prev => addEdge(newEdge, prev));
    logSim('info', `Link type [${activeLinkType}] drawn from source to target`);
  }, [activeLinkType, nodes, edges, saveHistory]);

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
    let updatedNodes = [...nodes];

    if (type === 'force') {
      // Simple force-directed physics layout
      const width = 800;
      const height = 500;
      const k = 120; // spring constant rest length
      const cRepulsion = 6000;
      const cAttraction = 0.04;
      const iterations = 50;

      // Position initialized
      const nodePos = new Map<string, { x: number; y: number }>();
      updatedNodes.forEach(n => {
        nodePos.set(n.id, { x: n.position.x, y: n.position.y });
      });

      for (let step = 0; step < iterations; step++) {
        // Calculate repulsion forces between all nodes
        updatedNodes.forEach(n1 => {
          let fx = 0;
          let fy = 0;
          const pos1 = nodePos.get(n1.id)!;

          updatedNodes.forEach(n2 => {
            if (n1.id === n2.id) return;
            const pos2 = nodePos.get(n2.id)!;
            const dx = pos1.x - pos2.x;
            const dy = pos1.y - pos2.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;

            if (dist < 300) {
              const force = cRepulsion / (dist * dist);
              fx += (dx / dist) * force;
              fy += (dy / dist) * force;
            }
          });

          // Attraction forces along edges
          edges.forEach(e => {
            if (e.source === n1.id) {
              const pos2 = nodePos.get(e.target);
              if (pos2) {
                const dx = pos2.x - pos1.x;
                const dy = pos2.y - pos1.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const force = cAttraction * (dist - k);
                fx += (dx / dist) * force;
                fy += (dy / dist) * force;
              }
            } else if (e.target === n1.id) {
              const pos2 = nodePos.get(e.source);
              if (pos2) {
                const dx = pos2.x - pos1.x;
                const dy = pos2.y - pos1.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const force = cAttraction * (dist - k);
                fx += (dx / dist) * force;
                fy += (dy / dist) * force;
              }
            }
          });

          // Apply displacement with damping
          const newX = Math.max(50, Math.min(width - 50, pos1.x + fx * 0.5));
          const newY = Math.max(50, Math.min(height - 50, pos1.y + fy * 0.5));
          nodePos.set(n1.id, { x: newX, y: newY });
        });
      }

      updatedNodes = updatedNodes.map(n => {
        if (n.data.type === 'state') return n; // Skip nested state coordinates displacement
        const pos = nodePos.get(n.id);
        return pos ? { ...n, position: pos } : n;
      });
    } else {
      // Hierarchical placement: Objects at top, Processes middle, output objects bottom
      let objCount = 0;
      let procCount = 0;
      updatedNodes = updatedNodes.map(n => {
        if (n.data.parentId !== activeParentId) return n;
        
        if (n.data.type === 'object') {
          objCount++;
          return {
            ...n,
            position: { x: objCount * 180 - 80, y: 80 }
          };
        } else if (n.data.type === 'process') {
          procCount++;
          return {
            ...n,
            position: { x: procCount * 180 - 80, y: 260 }
          };
        }
        return n;
      });
    }

    setNodes(updatedNodes);
    logSim('info', `Auto-layout (${type === 'force' ? 'Force-Directed' : 'Hierarchical'}) applied to canvas.`);
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
    // Collect active variable state
    const varContext = availableVariables.reduce((acc, v) => {
      acc[v.name] = v.currentValue;
      return acc;
    }, {} as Record<string, any>);

    setNodes(prevNodes => {
      let changed = false;
      const nextNodes = prevNodes.map(n => {
        // Find if this node is an active process triggering transitions
        if (n.data.type === 'process') {
          // Check conditions and enablers
          // 1. Condition Links (purple arrows pointing to this process)
          const conditionLinks = edges.filter(e => e.target === n.id && e.data?.type === 'condition');
          const conditionsMet = conditionLinks.length === 0 || conditionLinks.every(link => {
            const srcNode = prevNodes.find(pn => pn.id === link.source);
            if (!srcNode) return false;
            if (srcNode.data.type === 'state') {
              return (srcNode.data as any).isActive === true;
            }
            // If linked to object, check if object matches active state or value is positive
            const matchingVar = availableVariables.find(v => v.name.toLowerCase() === srcNode.data.name.toLowerCase());
            return matchingVar ? !!matchingVar.currentValue : true;
          });

          // 2. Trigger Links (amber arrows pointing to this process)
          const triggerLinks = edges.filter(e => e.target === n.id && e.data?.type === 'trigger');
          const triggersMet = triggerLinks.length === 0 || triggerLinks.some(link => {
            const srcNode = prevNodes.find(pn => pn.id === link.source);
            if (!srcNode) return false;
            return srcNode.data.type === 'state' ? (srcNode.data as any).isActive === true : false;
          });

          // 3. Firing Process update
          const isFiring = conditionsMet && (triggerLinks.length === 0 || triggersMet);

          if (isFiring !== (n.data as any).isFiring) {
            changed = true;
            if (isFiring) {
              logSim('info', `Process [${n.data.name}] fires! Conditions met.`);
              
              // Trigger OPM State transitions and effects upon firing
              // Find result edges pointing outwards from this process to states
              const resultEdges = edges.filter(e => e.source === n.id && e.data?.type === 'result');
              resultEdges.forEach(re => {
                const targetState = prevNodes.find(pn => pn.id === re.target && pn.data.type === 'state');
                if (targetState) {
                  // Make target state active, other states of parent object inactive
                  const parentObjId = targetState.parentNode;
                  if (parentObjId) {
                    prevNodes.forEach(sn => {
                      if (sn.parentNode === parentObjId && sn.data.type === 'state') {
                        (sn.data as any).isActive = (sn.id === targetState.id);
                      }
                    });

                    // Sync state change back to ADIA global variables!
                    const parentObj = prevNodes.find(pn => pn.id === parentObjId);
                    if (parentObj) {
                      const varName = parentObj.data.name;
                      const activeStateName = targetState.data.name;

                      // Update global variables
                      onVariablesChange(availableVariables.map(v => {
                        if (v.name.toLowerCase() === varName.toLowerCase()) {
                          // Try parsing status to numeric or string value
                          let val: number | boolean | string = activeStateName;
                          if (activeStateName.toLowerCase() === 'on' || activeStateName.toLowerCase() === 'high' || activeStateName.toLowerCase() === 'active') val = 1;
                          if (activeStateName.toLowerCase() === 'off' || activeStateName.toLowerCase() === 'low' || activeStateName.toLowerCase() === 'inactive') val = 0;
                          return { ...v, currentValue: val };
                        }
                        return v;
                      }));
                      
                      logSim('success', `System Sync: Object [${varName}] transitioned to state [${activeStateName}]`);
                    }
                  }
                }
              });
            }
            return {
              ...n,
              data: {
                ...n.data,
                isFiring,
              } as any
            };
          }
        }
        return n;
      });

      return nextNodes;
    });
  }, [nodes, edges, availableVariables, onVariablesChange]);

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
    setSimRunning(!simRunning);
    logSim('info', simRunning ? 'Simulation paused.' : 'Simulation running...');
  };

  const resetSimulation = () => {
    setSimRunning(false);
    setNodes(prev => prev.map(n => ({
      ...n,
      data: {
        ...n.data,
        isFiring: false,
        isActive: false
      } as any
    })));
    logSim('info', 'Simulation state reset.');
  };

  const stepSimulation = () => {
    runSimTick();
    logSim('info', 'Single-step tick executed.');
  };

  const logSim = (type: 'info' | 'success' | 'warning' | 'error', message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setSimLogs(prev => [...prev.slice(-20), { timestamp, type, message }]);
  };

  // --- Properties Panel Interactions ---
  const handleNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNode(node);
  }, []);

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

    setNodes(prev => prev.filter(n => n.id !== selectedNode.id && n.parentNode !== selectedNode.id));
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
                  saveHistory(nodes, edges);
                  setNodes(parsedNodes);
                  setEdges(parsedEdges);
                  setOplText(selectedExample.oplText);
                  setOplErrors(errors);
                  logSim('success', `Loaded example model: ${selectedExample.name}`);
                  if (onSave) onSave(parsedNodes, parsedEdges);
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
              onClick={stepSimulation}
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
          <div className="absolute left-3 top-3 z-10 bg-[#161616]/90 backdrop-blur-md border border-[#2d2d2d] rounded-lg p-2 flex flex-col gap-2 shadow-lg">
            <span className="text-[8px] uppercase tracking-wider font-extrabold text-orange-400/80 mb-1 text-center">Tools</span>
            <button
              onClick={() => setActiveTool('select')}
              className={`p-2 rounded text-xs transition-all flex flex-col items-center justify-center gap-0.5 ${
                activeTool === 'select' ? 'bg-[#f97316]/20 border border-[#f97316] text-[#f97316]' : 'hover:bg-[#222] text-[#999]'
              }`}
              title="Select / Move"
            >
              🖱️ <span className="text-[8px]">Select</span>
            </button>
            <button
              onClick={() => setActiveTool('object')}
              className={`p-2 rounded text-xs transition-all flex flex-col items-center justify-center gap-0.5 ${
                activeTool === 'object' ? 'bg-emerald-950/50 border border-emerald-500 text-emerald-400' : 'hover:bg-[#222] text-[#999]'
              }`}
              title="Add Object (Rectangle)"
            >
              🟢 <span className="text-[8px]">Object</span>
            </button>
            <button
              onClick={() => setActiveTool('process')}
              className={`p-2 rounded text-xs transition-all flex flex-col items-center justify-center gap-0.5 ${
                activeTool === 'process' ? 'bg-sky-950/50 border border-sky-500 text-sky-400' : 'hover:bg-[#222] text-[#999]'
              }`}
              title="Add Process (Ellipse)"
            >
              🔵 <span className="text-[8px]">Process</span>
            </button>
            <button
              onClick={() => setActiveTool('state')}
              className={`p-2 rounded text-xs transition-all flex flex-col items-center justify-center gap-0.5 ${
                activeTool === 'state' ? 'bg-orange-950/50 border border-orange-500 text-orange-400' : 'hover:bg-[#222] text-[#999]'
              }`}
              title="Add State inside Object"
            >
              🔶 <span className="text-[8px]">State</span>
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
            </select>
          </div>

          {/* React Flow Canvas */}
          <div className="flex-1 h-full" onClick={handleCanvasClick}>
            <ReactFlow
              nodes={filteredNodes}
              edges={filteredEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodeClick={handleNodeClick}
              fitView
            >
              <Background color="#333" gap={20} size={1} />
              <Controls />
              <MiniMap
                nodeColor={(node) => {
                  if (node.data?.type === 'object') return '#10b981';
                  if (node.data?.type === 'process') return '#0284c7';
                  return '#f59e0b';
                }}
                maskColor="rgba(0, 0, 0, 0.7)"
                className="bg-[#141414] border border-[#2d2d2d] rounded-md"
              />
            </ReactFlow>
          </div>

          {/* Selected Node Properties Panel (Floating bottom-left) */}
          {selectedNode && (
            <div className="absolute right-4 top-4 z-10 w-72 bg-[#141414]/95 backdrop-blur-md border border-[#2d2d2d] rounded-lg p-3.5 shadow-xl flex flex-col gap-2.5">
              <div className="flex items-center justify-between border-b border-[#333] pb-1.5">
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
              <div className="space-y-1.5 text-xs">
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

              {/* Attributes Section (For Objects) */}
              {selectedNode.data.type === 'object' && (
                <div className="border-t border-[#2d2d2d] pt-2">
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
                        className="bg-[#0b0b0b] border border-[#333] rounded px-1.5 py-0.5 outline-none w-1/2 text-xs"
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
                        className="bg-[#0b0b0b] border border-[#333] rounded px-1.5 py-0.5 outline-none w-1/2 text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Zoom Action */}
              {selectedNode.data.type !== 'state' && (
                <button
                  onClick={() => handleZoomInNode(selectedNode.id)}
                  className="mt-2 py-1 bg-sky-950 text-sky-400 border border-sky-800 hover:bg-sky-900 rounded text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                >
                  <ZoomIn size={12} /> Zoom In (Decompose)
                </button>
              )}

              {/* Delete Node */}
              <button
                onClick={handleDeleteSelectedNode}
                className="mt-1.5 py-1 bg-red-950/40 text-red-400 border border-red-900/60 hover:bg-red-900 rounded text-xs font-bold transition-all flex items-center justify-center gap-1.5"
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

      {/* 2. Right Text Editor (OPL pane) */}
      <div className="w-96 flex flex-col h-full bg-[#141414] overflow-hidden">
        <div className="h-12 border-b border-[#222] px-4 flex items-center justify-between shrink-0 bg-[#181818]">
          <span className="text-xs uppercase font-extrabold tracking-wider text-sky-400">
            OPL Specifications (Bimodal Text)
          </span>
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
    </div>
  );
};
