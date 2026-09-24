import React, { useState, useRef, useEffect, useCallback, useMemo, MouseEvent, KeyboardEvent, ChangeEvent } from 'react';
import * as math from 'mathjs';
import Plot from './components/doe/PlotlyRenderer';
import { PlotlyPlots } from './components/doe/PlotlyPlots';
import { createVLabDOEBlock, createXBridgesDOEBlock } from './engine/doe/integration';
import { fitRSM, fitGMDH, fitTaguchi } from './engine/doe/statistics';
import DOMPurify from 'dompurify';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { XbridgesWorkspace } from './components/xbridges/XbridgesWorkspace';
import { VLabWorkspace } from './components/vlab/VLabWorkspace';
import { HILWorkspace } from './components/hil/HILWorkspace';
import { EntropyWorkspace } from './components/entropy/EntropyWorkspace';
import { PlantUmlWorkspace } from './components/plantuml/PlantUmlWorkspace';
import { createVisualDiagram, type VisualDiagramModel } from './features/plantuml/model/visualDiagramModel';
import { readPlantUmlDiagrams } from './features/plantuml/persistence/plantUmlProjectState';
import { generateSequencePlantUml } from './features/plantuml/adapters/sequenceAdapter';
import type { AppNode, AppEdge } from './components/entropy/EntropyTypes';
import { DEFAULT_OPM_SIMULATION_CONFIG, type OpmSimulationConfig } from './components/entropy/OpmSimulationConfig';
import { HILConfig, HILSessionState } from './engine/hil/hilTypes';
import { GMDHEngine, solveLeastSquares } from './engine/gmdh/gmdh_core/combi';
import { ChevronLeft } from 'lucide-react';
import {
  Trash2, Plus, Layers, Settings2, Search, Save, Box,
  ChevronDown, ChevronRight, Play, Pause, Square, BookOpen,
  MousePointer2, Upload, FileText, Download,
  Activity, Zap, Database, Cpu, Layout, Maximize2, X,
  LayoutGrid, Rows, Network, Flame, RefreshCcw, Wind, Cloud,
  Eye, Paperclip, FlaskConical, AlertTriangle, FolderOpen, ShieldAlert,
  Sun, Moon, Gauge
} from 'lucide-react';
import { getStoredTheme, applyThemeToDOM, toggleTheme, AppTheme } from './utils/themeManager';
import { FactoryIOGateway } from './components/FactoryIOGateway';
import { ThreeDXGateway } from './components/ThreeDXGateway';
import type { AdiaExportItem } from './types/threeDX_types';
import { AiArchitectSidebar } from './components/AiArchitectSidebar';
import { executeAiActions } from './utils/aiActionProcessor';
import { IntroStandbyOverlay } from './components/IntroStandbyOverlay';
import { LiveFpsMonitor } from './components/LiveFpsMonitor';
import { 
  VariableType, VariableDef, VariableOverflowPolicy, StateData, JunctionData, TransitionData, Layer, ErrorItem
} from './types/sm_types';
import {
  calculateControlPointFromMidpoint,
  screenToWorld,
  isDragThresholdExceeded,
  getDefaultControlPoint
} from './utils/transitionGeometry';
import type {
  PortData, ValuePropertyData, BlockData, RelationshipData, PartData,
  ConnectorData, InterfaceRealizationData, HmiComponentType, HmiComponent
} from './types/sysml_types';
import {
  calculateSeparatedRelationshipPath,
  calculateOrthogonalConnectorPath,
} from './utils/sysmlConnectionRouting';
import { createStateMachineClipboard, pasteStateMachineClipboard, StateMachineClipboardData } from './utils/stateMachineClipboard';
import { pruneStateHierarchy, pruneMultipleStatesHierarchy, countDescendants } from './utils/stateMachine/smStatePruner';
import { generateMISRACCode, getCTimeType, validateInitialValue } from './utils/stateMachineCodeGenerator';
import { coerceTypedValue } from './utils/stateMachine/smTypedValue';
import { isInputFocused } from './utils/domUtils';
import { validateImportedJson, ValidationResult } from './utils/jsonImportValidator';
import {
  createUnifiedProjectPayload,
  createProjectSnapshot,
  hasUnsavedProjectChanges,
  shouldConfirmProjectReplacement,
} from './utils/adiaProjectPersistence';
import {
  applyPersistedAppSimulationModel,
  commitAppOutputRequest,
  createAppSimulationLifecycle,
  createAppSimulationSession,
  createFactoryIOMappings,
  createPersistedAppSimulationModel,
  createSimulationModelKey,
  resetAppSimulationSession,
  runAppSimulationTick,
  setSessionVariableValue,
  shouldReportAppOperationError,
  traceFrameToAppUpdate,
  type AppSimulationSession,
  type AppSimulationValue,
} from './utils/stateMachine/smAppAdapter';
import { serializeInlineScriptJson } from './utils/stateMachine/smInlineScriptSerialization';
import { migrateStateMachineModel } from './utils/stateMachine/smModelMigration';
import type { XBMappingV1 } from './utils/stateMachine/xbModel';
import {
  createXBBoundaryMapping,
  listXBBoundaryTargets,
  pruneXBBoundaryMappings,
  syncXBBoundaryNodeMetadata,
} from './utils/stateMachine/xbBoundaryMappings';
import type { SemanticTraceFrame } from './utils/stateMachine/smTrace';
import { STATE_MACHINE_RUNTIME_BUNDLE } from './generated/stateMachineRuntimeBundle';
import { analyzeStateMachine } from './utils/smAnalysisEngine';
import { HELP_DATA } from './HelpData';
import { SoftwareArchitectureExplorer } from './components/help/SoftwareArchitectureExplorer';
import { AppModelExplorer } from './components/modelExplorer/AppModelExplorer';
import { VLAB_LIBRARY } from './utils/vlabLibrary';
import { BLOCK_LIBRARY as XBRIDGES_LIBRARY } from './engine/xbridges/BlockDefinitions';
import JSZip from 'jszip';
import {
  buildReportHierarchy,
  generateDiagramScript,
  createReportSnapshot,
  toHierarchySource,
  renderRequirementsDiagram,
  renderBddDiagram,
  renderInteractiveDiagramHierarchy,
  renderStateMachineDiagrams,
} from './features/reporting';
import { TraceabilityMatrix as CanonicalTraceabilityMatrix } from './components/sysml/TraceabilityMatrix';
import { BlockPropertiesEditor } from './components/sysml/BlockPropertiesEditor';
import { BlockFeatureEditor } from './components/sysml/BlockFeatureEditor';
import { RelationshipEndEditor } from './components/sysml/RelationshipEndEditor';
import { restoreConnectionErrorFocus, SysmlConnectionErrorDetails } from './components/sysml/SysmlConnectionErrorDetails';
import { computeBlockDisplayBounds } from './components/sysml/blockLayout';
import { IbdConnectorEditor } from './components/sysml/IbdConnectorEditor';
import { RequirementGovernancePanel } from './components/sysml/RequirementGovernancePanel';
import { validateAssociationEnds } from './engine/sysml/bdd';
import { validateRequirementContainment } from './engine/sysml/validation';
import { validateConnector } from './engine/sysml/ibd';
import { createModelBaseline, clearSuspectLink, synchronizeRequirementCopy, cloneProtectedBaselineAsWorkingCopy } from './engine/sysml/requirements';
import { getRequirementsDiagramScope } from './engine/sysml/requirementsDiagramScope';
import { analyzeMutation, createHistory } from './engine/sysml/mutations';
import { loadRepository, serializeRepository } from './engine/sysml/persistence';
import { createEmptyRepository, parseMultiplicity } from './engine/sysml/model';
import { evaluateSysmlOperationGate } from './engine/sysml/evidence';
import { buildTraceabilityMatrix, computeCoverageMetrics } from './engine/sysml/rtm';
import { buildCanonicalTraceabilitySnapshot } from './engine/sysml/reportSnapshotAdapter';
import { applyLegacySysmlDeletion, impactSeverity, mergeLegacyDiagramIntoRepository, requiresDeletionConfirmation } from './services/sysmlTransactionAdapter';
import { loadCanonicalSysmlProject, fromRepository, projectLegacyDiagram, selectSuspectLinks, selectEvidenceForRequirement, getDefaultSysmlWorkerClient, executeSysmlCommand, createSysmlGatewayState, type SysmlEditorCommand } from './services/sysmlCommandGateway';
import { createSysmlDelegate } from './agent/toolAdapters/sysmlAdapter';
import { createReportDelegate, createProjectDelegate } from './agent/toolAdapters/adiaProjectAdapter';
import { createLiveXbridgesStateAccessors, createXbridgesDelegate } from './agent/toolAdapters/xbridgesAdapter';
import { ToolGateway } from './agent/toolGateway';
import { AgentOrchestrator } from './agent/agentOrchestrator';
import { AgentPanel } from './components/agent/AgentPanel';
import type {
  SysmlApplicationDelegate,
  ReportApplicationDelegate,
  XbridgesApplicationDelegate,
  ProjectApplicationDelegate,
} from './agent/applicationDelegates';
import { computeViewportBounds, cullElements } from './components/sysml/VirtualizedDiagram';
import { LargeModelDiagnostics, loadStoredPerformanceLimits, saveStoredPerformanceLimits } from './components/sysml/LargeModelDiagnostics';
import { validateLegacyConnectorCandidate, validateLegacyRequirementStatusTransition } from './services/sysmlCreationRules';
import { getCanvasRelationshipKinds, rejectBlockConnectionChange, rejectUiRelationship, resolveUiConnectionEndpoint } from './services/sysmlConnectionUi';
import { formatLegacyProperty, inheritedProperties, introducesNewValidationCodes, removePartProperty, validateLegacyBlockEdit, validateLegacyBlockProperties } from './services/sysmlPropertyRules';
import { reconcileAllPropertyUsages, reconcilePropertyUsages } from './services/sysmlPropertyUsageSync';
import { classifyLegacyEndpoint, type ConnectionEndpoint, type ConnectionPolicyDiagnostic } from './engine/sysml/connectionPolicy';
import { RELATIONSHIP_DEFINITIONS, type RequirementRelationshipKind } from './engine/sysml/relationshipDefinitions';

// Security Helper: Escapes HTML special characters to prevent XSS / HTML injection attacks
const escapeHtml = (str: unknown): string => {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\x60/g, '&#96;');
};

const safeParseMultiplicity = (str?: string) => {
  if (!str) return undefined;
  try {
    return parseMultiplicity(str);
  } catch {
    return undefined;
  }
};

// Security Helper: Safe React renderer for Help Center bold text without dangerouslySetInnerHTML
const renderFormattedHelpText = (text: string) => {
  if (!text) return null;
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <b key={index} className="text-white font-normal">{part.slice(2, -2)}</b>;
    }
    return part;
  });
};

// Security Sandbox: Disallows access to sensitive environment globals in user expressions
const FORBIDDEN_EXPRESSION_GLOBALS = /\b(process|require|window|document|globalThis|electron|fetch|XMLHttpRequest|import|eval|Function|Object\.constructor)\b/;

export function safeCreateFunction(params: string[], body: string): Function {
  if (FORBIDDEN_EXPRESSION_GLOBALS.test(body)) {
    throw new Error("Security Violation: Access to restricted global objects (process, require, window, document) is forbidden in expressions.");
  }
  // Shadow global objects with undefined parameters to prevent global scope leakage
  // sast-ignore SEC-SAST-005: safe sandboxed expression evaluator with shadowed globals
  return new Function('window', 'document', 'process', 'require', 'globalThis', ...params, body).bind(
    null, undefined, undefined, undefined, undefined, undefined
  );
}

// =============================================================================
// SHARED ENGINEERING UI PRIMITIVES
// =============================================================================
import {
  Button,
  Input,
  Label,
  Badge,
  Separator,
  Triangle,
  Checkbox,
  Resizer,
  EngineeringButton,
  EngineeringInput,
  EngineeringLabel,
  EngineeringBadge,
  EngineeringSeparator,
  EngineeringCheckbox,
} from './components/ui/EngineeringPrimitives';





// =============================================================================
// TYPES (FULLY TYPED)
// =============================================================================

interface ScopeDataPoint {
  time: number;
  [key: string]: number;
}

interface Point {
  x: number;
  y: number;
}

type ManagedWindowId = 'hmi' | 'pid' | 'rtm' | 'doe';
type DiagramMode = 'statemachine' | 'bdd' | 'ibd' | 'requirements' | 'xbridges' | 'vlab' | 'hil' | 'entropy' | 'plantuml';

type ConnectionErrorItem = ErrorItem & {
  connectionDiagnostic?: ConnectionPolicyDiagnostic;
  relationshipKind?: string;
  sourceEndpoint?: ConnectionEndpoint;
  targetEndpoint?: ConnectionEndpoint;
};

interface WorkspaceFile {
  id: string;
  name: string;
  type: string;
  data: any;
}

interface ManagedWindowState {
  id: ManagedWindowId;
  title: string;
  isOpen: boolean;
  isMinimized: boolean;
  isMaximized?: boolean;
  pos: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================
const ALLOWED_TYPES: VariableType[] = ['bool', 'int', 'uint', 'int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32', 'int64', 'uint64', 'float', 'single', 'double'];
const DEFAULT_STATE_WIDTH = 160;
const DEFAULT_STATE_HEIGHT = 100;
const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const GRID_SIZE = 20;
const SCOPE_MAX_POINTS = 500;
const STATE_COLORS = ['#f97316', '#6c9ac6', '#6cc9a8', '#c96c8a', '#9a6cc9', '#c9c46c'];
const JUNCTION_COLOR = '#ff9900';
const VERSION = 'v2.4 ENGINE';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================
const snapToGrid = (value: number, gridSize: number): number => Math.round(value / gridSize) * gridSize;
const normalizeNumerals = (val: string) => {
  if (!val) return "";
  return val.replace(/[٠١٢٣٤٥٦٧٨٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d).toString())
    .replace(/[۰۱۲۳۴۵۶۷۸۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d).toString())
    .replace(/[٫،,]/g, '.');
};

const parseValue = (type: VariableType, value: string): number | boolean => {
  const trimmed = value.trim().toLowerCase();
  if (type === 'bool') return ['1', 'true', 't', 'yes', 'y', 'on'].includes(trimmed);
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return 0;
  return coerceTypedValue(parsed, type).value;
};

const getDefaultValue = (type: VariableType): string => {
  if (type === 'bool') return 'false';
  if (['float', 'single', 'double'].includes(type)) return '0.0';
  return '0';
};

const getEdgePoint = (from: { x: number; y: number; width: number; height: number }, to: { x: number; y: number; width: number; height: number }): Point => {
  const fx = from.x + from.width / 2;
  const fy = from.y + from.height / 2;
  const tx = to.x + to.width / 2;
  const ty = to.y + to.height / 2;
  const dx = tx - fx;
  const dy = ty - fy;
  const angle = Math.atan2(dy, dx);
  const w = from.width / 2;
  const h = from.height / 2;
  let edgeX = fx, edgeY = fy;
  if (Math.abs(Math.cos(angle)) * h > Math.abs(Math.sin(angle)) * w) {
    edgeX = fx + (Math.cos(angle) > 0 ? w : -w);
    edgeY = fy + (edgeX - fx) * Math.tan(angle);
  } else {
    edgeY = fy + (Math.sin(angle) > 0 ? h : -h);
    edgeX = fx + (edgeY - fy) / Math.tan(angle);
  }
  return { x: edgeX, y: edgeY };
};

const getJunctionEdgePoint = (junction: { x: number; y: number }, target: { x: number; y: number }): Point => {
  const jx = junction.x;
  const jy = junction.y;
  const tx = target.x;
  const ty = target.y;
  const dx = tx - jx;
  const dy = ty - jy;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance < 1) return { x: jx, y: jy };
  const radius = 8;
  const edgeX = jx + (dx / distance) * radius;
  const edgeY = jy + (dy / distance) * radius;
  return { x: edgeX, y: edgeY };
};



const migrateBlocks = (blocksToMigrate: any[]): BlockData[] => {
  return (blocksToMigrate || []).map((b: any) => {
    let migrated = { ...b, constraints: b.constraints || [] };
    if (b.properties && b.properties.length > 0 && typeof b.properties[0] === 'string') {
      const newProperties: ValuePropertyData[] = b.properties.map((pStr: string) => {
        const [name, rest] = pStr.split(':');
        const [type, defaultValue] = rest ? rest.split('=') : ['any', undefined];
        return {
          id: uuidv4(),
          name: name?.trim() || 'prop',
          type: type?.trim() || 'any',
          defaultValue: defaultValue?.trim(),
        };
      });
      migrated = { ...migrated, properties: newProperties };
    }
    // Migrate old requirement blocks that lack layerId: default to 'root'
    if (migrated.stereotype === 'requirement' && migrated.layerId === undefined) {
      migrated.layerId = 'root';
    }
    return migrated;
  });
};

// MISRA-C CODE GENERATION (ROBUST & TESTED) - Moved to stateMachineCodeGenerator.ts
// =============================================================================


// =============================================================================
// PID HELPER FUNCTIONS (from user request)
// =============================================================================

const safeFloat = (val: string | number, defaultVal: number): number => {
  try {
    const f = parseFloat(String(val));
    return isNaN(f) ? defaultVal : f;
  } catch {
    return defaultVal;
  }
};

class PIDContinuous {
  kp: number;
  ki: number;
  kd: number;
  private i = 0;
  private e_prev = 0;

  constructor(kp = 1, ki = 0.5, kd = 0.1) {
    this.kp = kp;
    this.ki = ki;
    this.kd = kd;
  }

  compute(sp: number, pv: number, dt: number): number {
    const e = sp - pv;
    this.i += e * dt;
    const d = (e - this.e_prev) / dt;
    this.e_prev = e;
    return this.kp * e + this.ki * this.i + this.kd * d;
  }

  reset() {
    this.i = 0;
    this.e_prev = 0;
  }
}

class PIDDiscrete {
  kp: number;
  ki: number;
  kd: number;
  Ts: number;
  private e: [number, number, number] = [0, 0, 0]; // Represents [e(k-1), e(k-2), e(k-3)]
  private u_prev = 0;

  constructor(kp = 1, ki = 0.5, kd = 0.1, Ts = 0.05) {
    this.kp = kp;
    this.ki = ki;
    this.kd = kd;
    this.Ts = Ts;
  }

  compute(sp: number, pv: number): number {
    const e_new = sp - pv; // e(k)
    const u = this.u_prev
      + this.kp * (e_new - this.e[0]) // Kp * (e(k) - e(k-1))
      + this.ki * this.Ts * e_new // Ki * Ts * e(k)
      + (this.kd / this.Ts) * (e_new - 2 * this.e[0] + this.e[1]); // (Kd/Ts) * (e(k) - 2e(k-1) + e(k-2))

    this.u_prev = u;
    this.e = [e_new, this.e[0], this.e[1]]; // New history is [e(k), e(k-1), e(k-2)]
    return u;
  }

  reset() {
    this.e = [0, 0, 0];
    this.u_prev = 0;
  }
}

class Plant {
  private x = 0;

  // Made public to be closer to Python implementation and simplify access
  // public x = 0;
  // Keeping getX() for encapsulation
  public getX = (): number => this.x;

  update(u: number, dt: number): number {
    this.x += dt * (-this.x + u);
    return this.x;
  }

  reset() {
    this.x = 0;
  }
};

const HierarchyTree: React.FC<any> = (props) => (
  <AppModelExplorer
    diagramMode={props.diagramMode}
    states={props.states}
    layers={props.layers}
    transitions={props.transitions ?? []}
    junctions={props.junctions ?? []}
    activeStates={props.activeStates}
    currentLayerId={props.currentLayerId}
    blocks={props.blocks}
    parts={props.parts}
    canonicalSysmlRepository={props.canonicalSysmlRepository}
    selectedIds={props.selectedIds}
    onSelect={props.onSelect}
    onDoubleClick={props.onDoubleClick}
    onUpdateStates={props.onUpdateStates}
    onUpdateLayers={props.onUpdateLayers}
    onUpdateTransitions={props.onUpdateTransitions}
    onUpdateJunctions={props.onUpdateJunctions}
    onExecuteSysmlCommand={props.onExecuteSysmlCommand}
  />
);

const findPeaks = (y: number[]): { peaks: number[] } => {
  const peaks: number[] = [];
  for (let i = 1; i < y.length - 1; i++) {
    if (y[i] > y[i - 1] && y[i] > y[i + 1]) {
      peaks.push(i);
    }
  }
  return { peaks };
};

const autoTunePeaks = (t: number[], pv: number[], sp: number[]): { Kp: number, Ki: number, Kd: number } => {
  const pv_np = pv;
  const { peaks } = findPeaks(pv_np);

  if (peaks.length < 2) {
    return { Kp: 1.5, Ki: 0.5, Kd: 0.1 }; // fallback
  }

  const peakTimes = peaks.map(p => t[p]);
  const diffs = [];
  for (let i = 1; i < peakTimes.length; i++) {
    diffs.push(peakTimes[i] - peakTimes[i - 1]);
  }
  const Tu = diffs.reduce((a, b) => a + b, 0) / diffs.length;

  if (Tu <= 0) {
    return { Kp: 1.5, Ki: 0.5, Kd: 0.1 }; // fallback
  }

  const peakValues = peaks.map(p => pv_np[p]);
  const A = (Math.max(...peakValues) - Math.min(...peakValues)) / 2;

  let Ku: number;
  if (A === 0) {
    Ku = 2.0;
  } else {
    const spRange = Math.max(...sp) - Math.min(...sp);
    Ku = spRange > 0 ? spRange / (2 * A) : 2.0;
  }

  const Kp = 0.6 * Ku;
  const Ki = 2 * Kp / Tu;
  const Kd = Kp * Tu / 8;

  return { Kp, Ki, Kd };
};

// =============================================================================
// SYSTEM IDENTIFICATION HELPERS & WORKSPACE (MOVED OUTSIDE ADIA)
// =============================================================================

const FloatingWindow = ({
  windowState,
  onClose,
  onUpdate,
  children
}: {
  windowState: ManagedWindowState;
  onClose: () => void;
  onUpdate: (id: ManagedWindowId, updates: Partial<ManagedWindowState>) => void;
  children: React.ReactNode;
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState({ w: 0, h: 0, x: 0, y: 0 });

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isMobile) return;
    const handleMouseMove = (e: globalThis.MouseEvent) => {
      if (isDragging) {
        onUpdate(windowState.id, {
          pos: {
            x: e.clientX - dragOffset.x,
            y: e.clientY - dragOffset.y
          }
        });
      }
      if (isResizing) {
        onUpdate(windowState.id, {
          size: {
            width: Math.max(300, resizeStart.w + (e.clientX - resizeStart.x)),
            height: Math.max(200, resizeStart.h + (e.clientY - resizeStart.y))
          }
        });
      }
    };
    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, dragOffset, resizeStart, windowState.id, onUpdate, isMobile]);

  return (
    <div
      style={isMobile ? {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 100
      } : windowState.isMinimized ? {
        position: 'absolute',
        left: windowState.pos.x,
        top: windowState.pos.y,
        width: windowState.size.width,
        height: '32px',
        zIndex: windowState.zIndex,
      } : windowState.isMaximized ? {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: windowState.zIndex,
      } : {
        position: 'absolute',
        left: windowState.pos.x,
        top: windowState.pos.y,
        width: windowState.size.width,
        height: windowState.size.height,
        zIndex: windowState.zIndex,
      }}
      className="bg-[var(--surface-base)] border border-[var(--border-strong)] rounded-lg flex flex-col shadow-2xl overflow-hidden"
      onMouseDown={() => !isMobile && onUpdate(windowState.id, { zIndex: Date.now() })}
    >
      <div
        style={{ userSelect: 'none' }}
        className={`h-8 bg-[var(--surface-raised)] border-b border-[var(--border-default)] flex items-center justify-between px-3 shrink-0 ${
          isMobile || windowState.isMaximized ? '' : 'cursor-move'
        }`}
        onMouseDown={(e) => {
          if (isMobile || windowState.isMaximized) return;
          e.stopPropagation();
          setIsDragging(true);
          setDragOffset({ x: e.clientX - windowState.pos.x, y: e.clientY - windowState.pos.y });
        }}
      >
        <span className="text-xs font-bold text-orange-500">{windowState.title}</span>
        <div className="flex items-center gap-1" onMouseDown={(e) => e.stopPropagation()}>
          {/* Minimize Button */}
          <button
            onClick={() => onUpdate(windowState.id, { isMinimized: !windowState.isMinimized })}
            title={windowState.isMinimized ? "Restore" : "Minimize"}
            className="w-6 h-6 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-panel)] transition-colors"
          >
            {windowState.isMinimized ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 14 10 14 10 20"></polyline>
                <polyline points="20 10 14 10 14 4"></polyline>
                <line x1="14" y1="10" x2="21" y2="3"></line>
                <line x1="10" y1="14" x2="3" y2="21"></line>
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            )}
          </button>

          {/* Maximize Button */}
          <button
            onClick={() => onUpdate(windowState.id, { isMaximized: !windowState.isMaximized, isMinimized: false })}
            title={windowState.isMaximized ? "Restore Size" : "Maximize"}
            className="w-6 h-6 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-panel)] transition-colors"
          >
            {windowState.isMaximized ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="8" y="4" width="12" height="12" rx="1"></rect>
                <path d="M4 8v11a1 1 0 0 0 1 1h11"></path>
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              </svg>
            )}
          </button>

          {/* Close/Exit Button */}
          <button
            onClick={onClose}
            title="Close"
            className="w-6 h-6 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-white hover:bg-rose-600 transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
      <div
        className="flex-1 overflow-hidden relative flex flex-col"
        style={{ display: windowState.isMinimized ? 'none' : 'flex' }}
      >
        {children}
      </div>
      {!isMobile && !windowState.isMaximized && !windowState.isMinimized && <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-20"
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setIsResizing(true);
          setResizeStart({ w: windowState.size.width, h: windowState.size.height, x: e.clientX, y: e.clientY });
        }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="#f97316" className="absolute bottom-1 right-1 opacity-50"><path d="M 10 0 L 10 10 L 0 10 Z" /></svg>
      </div>}
    </div>
  );
};



const LegacyTraceabilityMatrix = ({
  blocks,
  relationships,
  parts,
  onClose
}: {
  blocks: BlockData[],
  relationships: RelationshipData[],
  parts: PartData[],
  onClose: () => void
}) => {
  const reqs = blocks.filter(b => b.stereotype === 'requirement');
  const [filterStatus, setFilterStatus] = useState('');

  const filteredReqs = filterStatus
    ? reqs.filter(r => r.status === filterStatus)
    : reqs;
  const childrenMap = new Map<string, string[]>();
  const parentSet = new Set<string>();

  relationships.forEach(rel => {
    const source = blocks.find(b => b.id === rel.sourceId);
    const target = blocks.find(b => b.id === rel.targetId);
    if (source?.stereotype === 'requirement' && target?.stereotype === 'requirement') {
      if (rel.type === 'requirementContainment' || rel.type === 'composition' || rel.type === 'derive' || rel.type === 'deriveReqt') {
        if (!childrenMap.has(rel.sourceId)) childrenMap.set(rel.sourceId, []);
        childrenMap.get(rel.sourceId)!.push(rel.targetId);
        parentSet.add(rel.targetId);
      }
    }
  });

  const orderedReqs: { req: BlockData, level: number }[] = [];
  const visited = new Set<string>();

  const traverse = (req: BlockData, level: number) => {
    if (visited.has(req.id)) return;
    visited.add(req.id);

    if (!filterStatus || req.status === filterStatus) {
      orderedReqs.push({ req, level });
    }

    const childrenIds = childrenMap.get(req.id) || [];
    childrenIds.forEach(cid => {
      const childReq = reqs.find(r => r.id === cid);
      if (childReq) traverse(childReq, level + 1);
    });
  };

  const roots = reqs.filter(r => !parentSet.has(r.id));
  if (roots.length === 0 && reqs.length > 0) {
    reqs.forEach(r => traverse(r, 0));
  } else {
    roots.forEach(r => traverse(r, 0));
  }

  const exportExcel = () => {
    const data = orderedReqs.map(({ req: r, level }) => {
      const outgoing = relationships.filter(rel => rel.sourceId === r.id).map(rel => {
        const target = blocks.find(b => b.id === rel.targetId);
        return `[${rel.type}] ${target?.name || rel.targetId}`;
      }).join('; ');

      const containedBy = relationships
        .filter(rel => rel.type === 'requirementContainment' && rel.targetId === r.id)
        .map(rel => blocks.find(b => b.id === rel.sourceId)?.name || rel.sourceId)
        .join('; ');

      const contains = relationships
        .filter(rel => rel.type === 'requirementContainment' && rel.sourceId === r.id)
        .map(rel => blocks.find(b => b.id === rel.targetId)?.name || rel.targetId)
        .join('; ');

      const derivedFrom = relationships
        .filter(rel => (rel.type === 'deriveReqt' || rel.type === 'derive') && rel.sourceId === r.id)
        .map(rel => blocks.find(b => b.id === rel.targetId)?.name || rel.targetId)
        .join('; ');

      const derivedReqs = relationships
        .filter(rel => (rel.type === 'deriveReqt' || rel.type === 'derive') && rel.targetId === r.id)
        .map(rel => blocks.find(b => b.id === rel.sourceId)?.name || rel.sourceId)
        .join('; ');

      const copiedFrom = relationships
        .filter(rel => rel.type === 'copy' && rel.sourceId === r.id)
        .map(rel => blocks.find(b => b.id === rel.targetId)?.name || rel.targetId)
        .join('; ');

      const copies = relationships
        .filter(rel => rel.type === 'copy' && rel.targetId === r.id)
        .map(rel => blocks.find(b => b.id === rel.sourceId)?.name || rel.sourceId)
        .join('; ');

      const satisfiedByRel = relationships
        .filter(rel => rel.type === 'satisfy' && rel.targetId === r.id)
        .map(rel => blocks.find(b => b.id === rel.sourceId)?.name || rel.sourceId);

      const satisfiedByBlocks = blocks.filter(b => b.satisfiedReqIds?.includes(r.id)).map(b => b.name);
      const satisfiedByParts = parts.filter(p => p.satisfiedReqIds?.includes(r.id)).map(p => p.name);
      const satisfiedBy = [...new Set([...satisfiedByRel, ...satisfiedByBlocks, ...satisfiedByParts])].join('; ');

      const verifiedBy = relationships
        .filter(rel => rel.type === 'verify' && rel.targetId === r.id)
        .map(rel => blocks.find(b => b.id === rel.sourceId)?.name || rel.sourceId)
        .join('; ');

      const refinedBy = relationships
        .filter(rel => rel.type === 'refine' && rel.targetId === r.id)
        .map(rel => blocks.find(b => b.id === rel.sourceId)?.name || rel.sourceId)
        .join('; ');

      const traced = relationships
        .filter(rel => (rel.type === 'trace' || (rel.type as string) === 'traceability') && (rel.sourceId === r.id || rel.targetId === r.id))
        .map(rel => {
          const otherId = rel.sourceId === r.id ? rel.targetId : rel.sourceId;
          return blocks.find(b => b.id === otherId)?.name || otherId;
        })
        .join('; ');

      const prefix = '  '.repeat(level) + (level > 0 ? '└ ' : '');

      return {
        ID: r.reqId || '',
        Name: prefix + r.name,
        Status: r.status || '',
        Priority: r.priority || '',
        'Assigned To': r.assignedTo || 'Unassigned',
        Description: r.description || '',
        'Contained By': containedBy,
        Contains: contains,
        'Derived From': derivedFrom,
        'Derived Requirements': derivedReqs,
        'Copied From': copiedFrom,
        'Copied Requirements': copies,
        'Satisfied By': satisfiedBy,
        'Verified By': verifiedBy,
        'Refined By': refinedBy,
        'Traced Elements': traced,
        Links: outgoing,
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "RTM");
    XLSX.writeFile(wb, "Traceability_Matrix.xlsx");
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#1a1a1a]">
      <div className="h-10 flex items-center px-4 border-b border-[#222] justify-between shrink-0">
        <div className="flex gap-2 items-center">
          <span className="text-xs text-[#888]">Filter:</span>
          <select className="bg-[#0a0a0a] border border-[#333] text-xs rounded px-2 h-6 text-[#e0e0e0]" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="Draft">Draft</option>
            <option value="Approved">Approved</option>
            <option value="Verified">Verified</option>
          </select>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={exportExcel} className="h-6 text-xs">Export Excel</Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-0">
        <table className="w-full text-left text-xs text-[#e0e0e0] border-collapse">
          <thead className="bg-[#1a1a1a] text-[#888] sticky top-0 z-10 shadow-sm"><tr><th className="p-3 font-medium border-b border-[#333]">ID</th><th className="p-3 font-medium border-b border-[#333]">Name</th><th className="p-3 font-medium border-b border-[#333]">Status</th><th className="p-3 font-medium border-b border-[#333]">Priority</th><th className="p-3 font-medium border-b border-[#333]">Assigned To</th><th className="p-3 font-medium border-b border-[#333]">Links (Out)</th><th className="p-3 font-medium border-b border-[#333]">Satisfied By</th></tr></thead>
          <tbody className="divide-y divide-[#222]">
            {orderedReqs.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-[#666]">
                  <div className="flex flex-col items-center justify-center">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 opacity-50">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                      <line x1="3" y1="9" x2="21" y2="9"></line>
                      <line x1="9" y1="21" x2="9" y2="9"></line>
                    </svg>
                    <p>No requirements found matching the current filter.</p>
                  </div>
                </td>
              </tr>
            ) : orderedReqs.map(({ req: r, level }) => {
              const satisfiedByBlocks = blocks.filter(b => b.satisfiedReqIds?.includes(r.id)).map(b => b.name);
              const satisfiedByParts = parts.filter(p => p.satisfiedReqIds?.includes(r.id)).map(p => p.name);
              const satisfiedBy = [...satisfiedByBlocks, ...satisfiedByParts];
              return (
                <tr key={r.id} className="hover:bg-[#1a1a1a] transition-colors group">
                  <td className="py-3 pr-3 font-mono text-[#f97316]" style={{ paddingLeft: `${12 + level * 20}px` }}>
                    {level > 0 && <span className="text-[#555] mr-2">└</span>}
                    {r.reqId}
                  </td>
                  <td className="p-3 font-bold text-[#e0e0e0] group-hover:text-[#fff]">{r.name}</td>
                  <td className="p-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${r.status === 'Verified' ? 'bg-green-900/20 text-green-400 border-green-800/30' :
                      r.status === 'Approved' ? 'bg-orange-900/20 text-orange-400 border-orange-800/30' :
                        r.status === 'Implemented' ? 'bg-purple-900/20 text-purple-400 border-purple-800/30' :
                          'bg-[#222] text-[#aaa] border-[#333]'
                      }`}>
                      {r.status || 'Draft'}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${r.priority === 'High' ? 'bg-red-900/20 text-red-400 border-red-800/30' :
                      r.priority === 'Medium' ? 'bg-amber-900/20 text-amber-400 border-amber-800/30' :
                        'bg-[#222] text-[#888] border-[#333]'
                      }`}>
                      {r.priority || 'Medium'}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${r.assignedTo ? 'bg-blue-950/40 text-blue-400 border-blue-800/30' : 'bg-[#222]/40 text-[#666] border-[#333]/40'}`}>
                      {r.assignedTo || 'Unassigned'}
                    </span>
                  </td>
                  <td className="p-3 text-[#888]">
                    <div className="flex flex-col gap-1">
                      {relationships.filter(rel => rel.sourceId === r.id).map(rel => {
                        const t = blocks.find(b => b.id === rel.targetId);
                        return (
                          <div key={rel.id} className="flex items-center gap-1.5 bg-[#1a1a1a] px-2 py-1 rounded border border-[#222] w-max">
                            <span className="text-[#6c9ac6] text-[10px] font-mono">«{rel.type}»</span>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-50"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                            <span className="text-[#ccc]">{t?.name}</span>
                          </div>
                        );
                      })}
                      {relationships.filter(rel => rel.sourceId === r.id).length === 0 && <span className="text-[#555] italic">None</span>}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {satisfiedBy.length > 0 ? satisfiedBy.map((name, i) => (
                        <span key={i} className="inline-flex items-center px-2 py-1 rounded bg-[#1a2e20] border border-[#2e5239] text-[#4ade80] text-[10px]">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1"><path d="M20 6L9 17l-5-5"></path></svg>
                          {name}
                        </span>
                      )) : <span className="text-[#555] italic">Unsatisfied</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const CodeGenerationDialog = ({
  files,
  codegenErrors,
  codegenWarnings,
  generationLog,
  onClose,
  addError
}: {
  files: { name: string; content: string }[];
  codegenErrors: ErrorItem[];
  codegenWarnings: string[];
  generationLog: string[];
  onClose: () => void;
  addError: (type: 'error' | 'warning' | 'info', message: string) => void;
}) => {
  const [size, setSize] = useState({ width: 800, height: Math.min(700, window.innerHeight * 0.9) });
  const [isResizingModal, setIsResizingModal] = useState(false);
  const [activeFile, setActiveFile] = useState(files.length > 0 ? files[0].name : '');

  const handleModalResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizingModal(true);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: globalThis.MouseEvent) => {
      if (!isResizingModal) return;
      setSize(prev => ({
        width: Math.max(500, prev.width + e.movementX),
        height: Math.max(400, prev.height + e.movementY)
      }));
    };
    const handleMouseUp = () => setIsResizingModal(false);

    if (isResizingModal) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('mouseleave', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mouseleave', handleMouseUp);
    };
  }, [isResizingModal]);

  return (
    <div style={{ width: `${size.width}px`, height: `${size.height}px` }} className="bg-[#1a1a1a] border border-[#f97316] rounded-lg flex flex-col relative overflow-hidden" onMouseDown={e => e.stopPropagation()}>
      <div className="h-12 flex items-center px-5 border-b border-[#222]">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" className="mr-3">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
        <h2 className="text-lg font-bold text-[#f97316]">Embedded C99 Code Generation</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {codegenErrors.length > 0 ? (
          <div className="bg-red-900/25 border border-red-900/50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-red-400 mb-3 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Blocking Errors ({codegenErrors.length})
            </h3>
            <ul className="text-xs text-red-300 space-y-1.5 max-h-64 overflow-y-auto">
              {codegenErrors.map((err, i) => (
                <li key={i} className="pl-4 border-l-2 border-red-900/70 py-0.5">
                  <span className="font-mono text-[#f97316]">[{err.source}]</span> {err.message}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <div className="flex gap-2 mb-2 overflow-x-auto pb-2">
                {files.map(f => (
                  <button key={f.name} onClick={() => setActiveFile(f.name)} className={`px-3 py-1 text-xs rounded border ${activeFile === f.name ? 'bg-[#f97316] text-black border-[#f97316]' : 'bg-[#1a1a1a] text-[#888] border-[#333]'}`}>
                    {f.name}
                  </button>
                ))}
              </div>
              <h3 className="text-sm font-medium text-[#f97316] mb-2.5">{activeFile}</h3>
              {activeFile.endsWith('.md') ? (
                <div className="bg-[#0a0a0a] p-6 rounded text-sm text-[#e0e0e0] max-h-96 overflow-auto border border-[#333] select-text">
                  {files.find(f => f.name === activeFile)?.content.split('\n').map((line, i) => {
                    if (line.startsWith('# ')) return <h1 key={i} className="text-2xl font-black text-[#f97316] mb-6 border-b border-[#f97316]/30 pb-2">{line.slice(2)}</h1>;
                    if (line.startsWith('## ')) return <h2 key={i} className="text-lg font-bold text-orange-400 mt-8 mb-4 flex items-center gap-2"><div className="w-1.5 h-4 bg-orange-500 rounded-full" />{line.slice(3)}</h2>;
                    if (line.startsWith('|')) return <div key={i} className="font-mono text-xs text-gray-500 whitespace-pre py-0.5 border-x border-white/5 px-2 hover:bg-white/5">{line}</div>;
                    if (line.startsWith('- ')) return <li key={i} className="ml-6 list-disc text-gray-300 mb-1">{line.slice(2).split('`').map((part, j) => j % 2 === 1 ? <code key={j} className="bg-white/10 px-1 rounded text-orange-300">{part}</code> : part)}</li>;
                    if (line.startsWith('> ')) return <blockquote key={i} className="border-l-4 border-amber-600/50 pl-5 py-3 bg-amber-600/5 my-6 italic text-amber-200/80 rounded-r-lg">{line.slice(2)}</blockquote>;
                    if (!line.trim()) return <div key={i} className="h-4" />;
                    return <p key={i} className="mb-3 leading-relaxed text-gray-400">{line.split('**').map((part, j) => j % 2 === 1 ? <b key={j} className="text-white font-bold">{part}</b> : part)}</p>;
                  })}
                </div>
              ) : (
                <pre className="bg-[#0a0a0a] p-4 rounded text-xs font-mono text-[#e0e0e0] max-h-96 overflow-auto border border-[#333]">
                  {files.find(f => f.name === activeFile)?.content || '// Select a file'}
                </pre>
              )}
            </div>
            {codegenWarnings.length > 0 && (
              <div className="bg-amber-900/15 border border-amber-900/30 rounded-lg p-4">
                <h3 className="text-xs font-medium text-amber-400 mb-2 flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  MISRA Style Warnings ({codegenWarnings.length})
                </h3>
                <ul className="text-[11px] text-amber-300 space-y-1 max-h-36 overflow-y-auto">
                  {codegenWarnings.map((warning, i) => (
                    <li key={i} className="pl-3 border-l-2 border-amber-900/50 py-0.5">{warning}</li>
                  ))}
                </ul>
              </div>
            )}
            {generationLog.length > 0 && (
              <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-4">
                <h3 className="text-xs font-medium text-[#888] mb-2">Generation Log (REQ-ENGINE-004)</h3>
                <ul className="text-[10px] font-mono text-[#666] space-y-1 max-h-24 overflow-y-auto">
                  {generationLog.map((log, i) => (
                    <li key={i}>{log}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="h-14 flex items-center justify-end px-5 border-t border-[#222] gap-3">
        <Button
          variant="outline"
          onClick={onClose}
          className="border-[#333] text-[#a0a0a0] hover:text-[#e0e0e0] px-5"
        >
          Close
        </Button>
        {codegenErrors.length === 0 && files.length > 0 && (
          <Button
            onClick={async () => {
              try {
                const zip = new JSZip();
                files.forEach(f => {
                  zip.file(f.name, f.content);
                });
                const blob = await zip.generateAsync({ type: 'blob' });
                const url = URL.createObjectURL(blob);
                const element = document.createElement('a');
                element.setAttribute('href', url);
                element.setAttribute('download', `generated_code_${new Date().getTime()}.zip`);
                element.style.display = 'none';
                document.body.appendChild(element);
                element.click();
                document.body.removeChild(element);
                URL.revokeObjectURL(url);
                addError('info', 'Code package downloaded successfully as ZIP');
                onClose();
              } catch (err) {
                console.error('Failed to generate ZIP package:', err);
                addError('error', 'Failed to generate ZIP package.');
              }
            }}
            className="bg-[#f97316] text-[#0a0a0a] hover:bg-[#ea580c] px-5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Download Files
          </Button>
        )}
      </div>
      <div
        onMouseDown={handleModalResizeStart}
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-10 text-[#f97316] opacity-50 hover:opacity-100 flex items-end justify-end"
        title="Resize Window"
      ><svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M 10 0 L 10 10 L 0 10 Z" /></svg></div>
    </div>
  );
};

const PidWorkspaceDialog = ({
  onClose,
  addError,
}: {
  onClose: () => void;
  addError: (type: 'error' | 'warning' | 'info', message: string, source?: string, elementId?: string) => void;
}) => {
  const [pidData, setPidData] = useState<{ t: number[], setpoint: number[], pv: number[] } | null>(null);
  const [pidPlotData, setPidPlotData] = useState<{ t: number[], pv_org: number[], pv_ctrl: number[], sp: number[] } | null>(null);
  const [pidKp, setPidKp] = useState('1.5');
  const [pidKi, setPidKi] = useState('0.5');
  const [pidKd, setPidKd] = useState('0.1');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLoadPidData = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handlePidFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Mock data loading (simulating file read)
    const t = Array.from({ length: 400 }, (_, i) => i * 0.05); // 20s at 20Hz
    const sp = t.map(time => time < 1 ? 0 : (time < 10 ? 100 : 80));

    // Simulate a second-order system response to the setpoint for more realistic PV data
    const zeta = 0.5; // Damping ratio
    const wn = 1;     // Natural frequency
    let pos = 0;
    let vel = 0;
    const dt = 0.05;
    const pv = sp.map(current_sp => {
      const accel = wn * wn * (current_sp - pos) - 2 * zeta * wn * vel;
      vel += accel * dt;
      pos += vel * dt;
      return pos;
    });

    setPidData({ t, setpoint: sp, pv });
    setPidPlotData({ t, pv_org: pv, pv_ctrl: pv, sp });
    addError('info', `Loaded data from ${file.name} (Mocked). Install 'xlsx' to parse real files.`);

    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [addError]);

  const runPidSimulation = useCallback((discrete: boolean, draw: boolean = true): { t: number[], pv_ctrl: number[], sp: number[] } | null => {
    const plant = new Plant();
    const currentKp = safeFloat(pidKp, 1);
    const currentKi = safeFloat(pidKi, 0);
    const currentKd = safeFloat(pidKd, 0);
    const contPid = new PIDContinuous(currentKp, currentKi, currentKd);
    const discPid = new PIDDiscrete(currentKp, currentKi, currentKd);

    let t: number[], sp: number[], pv_org: number[];

    if (pidData) {
      t = pidData.t;
      sp = pidData.setpoint;
      pv_org = pidData.pv;
    } else {
      addError('warning', 'No data loaded. Please load data first.');
      return null;
    }

    if (t.length < 2) {
      addError('error', 'Not enough data points to run simulation.');
      return null;
    }

    const dt = t[1] - t[0];
    discPid.Ts = dt;
    const pv_ctrl: number[] = [];

    for (const s of sp) {
      const current_pv = plant.getX();
      let u: number;
      if (discrete) {
        u = discPid.compute(s, current_pv);
      } else {
        u = contPid.compute(s, current_pv, dt);
      }
      pv_ctrl.push(plant.update(u, dt));
    }

    if (draw) {
      setPidPlotData({ t, pv_org, pv_ctrl, sp });
    }

    return { t, pv_ctrl, sp };
  }, [pidData, pidKp, pidKi, pidKd, addError]);

  const handleAutoTune = useCallback(() => {
    const simResult = runPidSimulation(true, false);
    if (!simResult) {
      addError('error', 'Auto-tune failed: could not run simulation. Load data first.');
      return;
    }

    const { t, pv_ctrl, sp } = simResult;
    const { Kp, Ki, Kd } = autoTunePeaks(t, pv_ctrl, sp);

    setPidKp(Kp.toFixed(3));
    setPidKi(Ki.toFixed(3));
    setPidKd(Kd.toFixed(3));

    addError('info', `Auto-Tune complete: Kp=${Kp.toFixed(3)}, Ki=${Ki.toFixed(3)}, Kd=${Kd.toFixed(3)}`);
  }, [runPidSimulation, addError]);

  const handleExportPidCode = useCallback(() => {
    const Kp = safeFloat(pidKp, 1.0);
    const Ki = safeFloat(pidKi, 0.0);
    const Kd = safeFloat(pidKd, 0.0);
    const Ts = pidData && pidData.t.length > 1 ? pidData.t[1] - pidData.t[0] : 0.05;

    const h_content = `#ifndef PID_CONTROLLER_H\n#define PID_CONTROLLER_H\n\ntypedef struct {\n    float Kp;\n    float Ki;\n    float Kd;\n    float Ts;\n    float e[3];\n    float u_prev;\n} PID;\n\nvoid PID_Init(PID* pid, float Kp, float Ki, float Kd, float Ts);\nfloat PID_Compute(PID* pid, float setpoint, float pv);\n\n#endif`;

    const c_content = `#include "pid_controller.h"\n\nvoid PID_Init(PID* pid, float Kp, float Ki, float Kd, float Ts){\n    pid->Kp = Kp;\n    pid->Ki = Ki;\n    pid->Kd = Kd;\n    pid->Ts = Ts;\n    pid->e[0] = pid->e[1] = pid->e[2] = 0;\n    pid->u_prev = 0;\n}\n\nfloat PID_Compute(PID* pid, float setpoint, float pv){\n    float e_new = setpoint - pv;\n    float u = pid->u_prev + pid->Kp*(e_new - pid->e[0])\n              + pid->Ki*pid->Ts*e_new\n              + pid->Kd/pid->Ts*(e_new - 2*pid->e[0] + pid->e[1]);\n    pid->u_prev = u;\n    pid->e[2] = pid->e[1];\n    pid->e[1] = pid->e[0];\n    pid->e[0] = e_new;\n    return u;\n}\n\n/*\n// ===== PID instance with tuned values =====\nPID pid_instance;\nPID_Init(&pid_instance, ${Kp.toFixed(4)}f, ${Ki.toFixed(4)}f, ${Kd.toFixed(4)}f, ${Ts.toFixed(4)}f);\n*/`;

    // Download PID files together as a ZIP
    (async () => {
      try {
        const zip = new JSZip();
        zip.file('pid_controller.h', h_content);
        zip.file('pid_controller.c', c_content);
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const element = document.createElement('a');
        element.setAttribute('href', url);
        element.setAttribute('download', `pid_controller_code_${new Date().getTime()}.zip`);
        element.style.display = 'none';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
        URL.revokeObjectURL(url);
        addError('info', 'PID C code exported as ZIP.');
      } catch (err) {
        console.error('Failed to generate PID ZIP package:', err);
        addError('error', 'Failed to generate PID ZIP package.');
      }
    })();
  }, [pidKp, pidKi, pidKd, pidData, addError]);

  return (
    <div className="flex flex-col h-full w-full bg-[#1a1a1a]">
      <div className="p-5 text-center text-[#e0e0e0]">
        PID Workspace (Please refactor state to pass as props to fully enable)
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Controls */}
        <div className="w-72 p-4 border-r border-[#222] flex flex-col gap-4 overflow-y-auto">
          <input type="file" ref={fileInputRef} onChange={handlePidFileChange} className="hidden" accept=".xlsx,.csv" />
          <Button onClick={handleLoadPidData} variant="outline">Load Data</Button>

          <div className="space-y-2 p-3 bg-[#1a1a1a] rounded-lg border border-[#222]">
            <Label>PID Parameters</Label>
            <div className="grid grid-cols-3 gap-2">
              <div><Label>Kp</Label><Input value={pidKp} onChange={e => setPidKp(e.target.value)} className="h-7" /></div>
              <div><Label>Ki</Label><Input value={pidKi} onChange={e => setPidKi(e.target.value)} className="h-7" /></div>
              <div><Label>Kd</Label><Input value={pidKd} onChange={e => setPidKd(e.target.value)} className="h-7" /></div>
            </div>
          </div>

          <Button onClick={() => runPidSimulation(true)} variant="default">Run Simulation</Button>
          <Button onClick={handleAutoTune} variant="secondary">Auto Tune (Z-N)</Button>
          <Button onClick={handleExportPidCode} variant="outline">Export C Code</Button>
        </div>

        {/* Plot */}
        <div className="flex-1 p-4 bg-[#0a0a0a] relative">
          {pidPlotData ? (
            <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
              {/* Grid */}
              {[...Array(5)].map((_, i) => <line key={i} x1="0" y1={i * 25} x2="100" y2={i * 25} stroke="#222" strokeWidth="0.5" />)}
              {[...Array(10)].map((_, i) => <line key={i} x1={i * 10} y1="0" x2={i * 10} y2="100" stroke="#222" strokeWidth="0.5" />)}

              {(() => {
                const allVals = [...pidPlotData.sp, ...pidPlotData.pv_ctrl];
                const min = Math.min(...allVals);
                const max = Math.max(...allVals);
                const range = max - min || 1;
                const padding = range * 0.1;
                const effMin = min - padding;
                const effRange = range + 2 * padding;

                const toPoints = (data: number[]) => data.map((v, i) => `${(i / (data.length - 1)) * 100},${100 - ((v - effMin) / effRange) * 100}`).join(' ');

                return (
                  <>
                    <polyline points={toPoints(pidPlotData.sp)} fill="none" stroke="#444" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
                    <polyline points={toPoints(pidPlotData.pv_ctrl)} fill="none" stroke="#6c9ac6" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                  </>
                );
              })()}
            </svg>
          ) : (
            <div className="flex items-center justify-center h-full text-[#666]">Load data to visualize</div>
          )}
          {pidPlotData && (
            <div className="absolute top-2 right-2 flex flex-col items-end text-xs gap-1">
              <div className="flex items-center gap-2"><div className="w-3 h-0.5 bg-[#444] border-t border-dashed"></div> Setpoint</div>
              <div className="flex items-center gap-2"><div className="w-3 h-0.5 bg-[#6c9ac6]"></div> Process Value</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const OledDisplay = ({
  comp,
  variables,
  editMode
}: {
  comp: HmiComponent;
  variables: VariableDef[];
  editMode: boolean;
}) => {
  const getVarVal = (varId: string | null | undefined, fallback: any = 0) => {
    if (!varId) return fallback;
    const v = variables.find(x => x.id === varId);
    return v ? v.currentValue : fallback;
  };

  const modeVal = getVarVal(comp.oledModeVarId, 0);
  const tempVal = getVarVal(comp.oledTempVarId, 200);
  const timeVal = getVarVal(comp.oledTimeVarId, 20);
  const stateVal = getVarVal(comp.oledStateVarId, 'HOME');
  const steamVal = !!getVarVal(comp.oledSteamVarId, false);
  const heatVal = !!getVarVal(comp.oledHeatVarId, false);
  const fanVal = !!getVarVal(comp.oledFanVarId, false);
  const lightVal = !!getVarVal(comp.oledLightVarId, false);
  const duoVal = !!getVarVal(comp.oledDuoVarId, false);
  const progressVal = Number(getVarVal(comp.oledProgressVarId, 0));

  const customModeList = comp.oledModeNames
    ? comp.oledModeNames.split(',').map(s => s.trim())
    : [
        'AIR FRYER', 'STEAMER', 'OVEN', 'RAPID STEAM', 'BROIL', 'REHEAT',
        'KEEP WARM', 'FERMENT', 'DEFROST', 'SLOW COOK', 'DEHYDRATE', 'DUO COOK'
      ];

  let modeText = customModeList[0] || 'READY';
  if (typeof modeVal === 'number') {
    modeText = customModeList[Math.floor(modeVal) % customModeList.length] || customModeList[0] || 'READY';
  } else if (typeof modeVal === 'string') {
    modeText = modeVal.toUpperCase();
  }

  let tempText = typeof tempVal === 'number' ? `${tempVal}°C` : String(tempVal);
  let timeText = '';
  if (typeof timeVal === 'number') {
    if (timeVal >= 60 || (String(stateVal).toUpperCase() === 'COOKING' && timeVal > 0)) {
      const m = Math.floor(timeVal / 60);
      const s = Math.floor(timeVal % 60);
      if (timeVal < 60 && String(stateVal).toUpperCase() !== 'COOKING') {
        timeText = `${timeVal} min`;
      } else {
        timeText = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      }
    } else {
      timeText = `${timeVal} min`;
    }
  } else {
    timeText = String(timeVal);
  }

  const stateStr = String(stateVal).toUpperCase();
  let ctxText = 'Rotate to select mode';
  if (stateStr === 'READY') ctxText = 'Press START to cook';
  else if (stateStr === 'COOKING') ctxText = 'Cooking... Press START to pause';
  else if (stateStr === 'PAUSED') ctxText = 'Paused. Press START to resume';
  else if (stateStr === 'COMPLETE') ctxText = 'Cooking complete! Press encoder';
  else if (stateStr === 'SETTINGS') ctxText = 'Settings menu';

  const hasCustomIndicators = Array.isArray(comp.oledIndicatorEmojis) && comp.oledIndicatorEmojis.length > 0;

  const renderIndicators = () => {
    if (hasCustomIndicators) {
      return (comp.oledIndicatorEmojis || []).map((emoji, idx) => {
        const varId = comp.oledIndicatorVarIds?.[idx];
        const val = varId ? !!getVarVal(varId, false) : false;
        const label = comp.oledIndicatorLabels?.[idx] || `Indicator ${idx + 1}`;
        const isSpin = emoji === '🌀' || emoji === '⚙️' || emoji === '🎡' || label.toLowerCase().includes('fan') || label.toLowerCase().includes('spin');

        return (
          <span
            key={idx}
            className={`transition-opacity duration-200 ${val ? 'opacity-100' : 'opacity-20'} ${val && isSpin ? 'animate-spin' : ''}`}
            style={val && isSpin ? { animationDuration: '2s', display: 'inline-block' } : { display: 'inline-block' }}
            title={label}
          >
            {emoji}
          </span>
        );
      });
    }

    // Default legacy fallback
    return (
      <>
        <span className={`transition-opacity duration-200 ${steamVal ? 'opacity-100' : 'opacity-20'}`} title="Steam">💧</span>
        <span className={`transition-opacity duration-200 ${heatVal ? 'opacity-100' : 'opacity-20'}`} title="Heat">🔥</span>
        <span className={`transition-opacity duration-200 ${fanVal ? 'opacity-100 animate-spin' : 'opacity-20'}`} style={{ animationDuration: '2s' }} title="Fan">🌀</span>
        <span className={`transition-opacity duration-200 ${lightVal ? 'opacity-100' : 'opacity-20'}`} title="Light">💡</span>
        <span className={`transition-opacity duration-200 ${duoVal ? 'opacity-100' : 'opacity-20'}`} title="Duo">⚡</span>
      </>
    );
  };

  return (
    <div className="w-full h-full bg-black border border-[#1a1a22] rounded-lg p-3 flex flex-col justify-between font-mono shadow-[inset_0_0_15px_rgba(0,0,0,0.9)] text-[#4db8ff]">
      <div className="text-[10px] text-[#4d7aaa] uppercase tracking-wider truncate h-4 flex justify-between">
        <span>{comp.oledTitle || comp.name}</span>
        <span className="text-[#3de88a]/70 font-semibold">{modeText}</span>
      </div>
      <div className="text-2xl font-bold tracking-widest text-[#4db8ff] text-shadow-[0_0_8px_rgba(77,184,255,0.5)] my-0.5 truncate">
        {tempText}
      </div>
      <div className="w-full h-1 bg-[#111] border border-[#222] rounded overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-[#e8a020] to-[#3de88a] transition-all duration-300"
          style={{ width: `${Math.max(0, Math.min(100, progressVal))}%` }}
        />
      </div>
      <div className="flex justify-between items-center text-xs my-0.5 font-semibold">
        <span className="text-[#4db8ff]">{timeText}</span>
        <span className="text-[#3de88a] bg-[#3de88a]/10 px-1.5 py-0.2 rounded text-[9px] border border-[#3de88a]/20">
          {stateStr}
        </span>
      </div>
      <div className="flex gap-2 text-sm justify-start border-t border-[#111] pt-1 mt-0.5 h-7 items-center overflow-x-auto">
        {renderIndicators()}
      </div>
      <div className="text-[8px] text-[#335577] truncate border-t border-[#111] pt-1 mt-0.5 h-3.5">
        {ctxText}
      </div>
    </div>
  );
};

const Encoder = ({
  comp,
  variables,
  updateVariable,
  editMode
}: {
  comp: HmiComponent;
  variables: VariableDef[];
  updateVariable: (id: string, value: string) => void;
  editMode: boolean;
}) => {
  const [rotationAngle, setRotationAngle] = useState(0);
  const [isLpActive, setIsLpActive] = useState(false);
  const lpTimerRef = useRef<any>(null);

  const rotVar = variables.find(x => x.id === comp.variableId);
  const rotVal = rotVar ? Number(rotVar.currentValue) || 0 : 0;

  const isHybrid = Array.isArray(comp.encoderValues) && comp.encoderValues.length > 0;
  const encoderValues = comp.encoderValues || [];

  let currentIndex = 0;
  if (isHybrid && rotVar) {
    const idx = encoderValues.findIndex(x => String(x) === String(rotVar.currentValue));
    if (idx !== -1) currentIndex = idx;
  }

  const stepAngle = isHybrid ? 360 / Math.max(1, encoderValues.length) : 18;
  const rotIndexVal = isHybrid ? currentIndex : rotVal;
  const angle = rotIndexVal * stepAngle + rotationAngle;

  const rotate = (dir: number) => {
    if (editMode || !comp.variableId) return;
    const v = variables.find(x => x.id === comp.variableId);
    if (!v) return;

    if (isHybrid) {
      const nextIndex = (currentIndex + dir + encoderValues.length) % encoderValues.length;
      updateVariable(comp.variableId, encoderValues[nextIndex]);
      setRotationAngle(prev => prev + dir * stepAngle);
    } else {
      const curVal = Number(v.currentValue) || 0;
      const step = v.name.toLowerCase().includes('temp') ? 5 : 1;
      const newVal = curVal + dir * step;
      const clampedVal = Math.max(comp.min ?? 0, Math.min(comp.max ?? 100, newVal));
      updateVariable(comp.variableId, clampedVal.toString());
      setRotationAngle(prev => prev + dir * 18);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (editMode || !comp.pressVariableId) return;
    e.preventDefault();
    e.stopPropagation();

    setIsLpActive(false);
    updateVariable(comp.pressVariableId, 'true');

    lpTimerRef.current = setTimeout(() => {
      setIsLpActive(true);
    }, 1500);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (editMode || !comp.pressVariableId) return;
    e.preventDefault();
    e.stopPropagation();

    if (lpTimerRef.current) {
      clearTimeout(lpTimerRef.current);
      lpTimerRef.current = null;
    }
    setIsLpActive(false);
    updateVariable(comp.pressVariableId, 'false');
  };

  const handleMouseLeave = () => {
    if (editMode || !comp.pressVariableId) return;
    if (lpTimerRef.current) {
      clearTimeout(lpTimerRef.current);
      lpTimerRef.current = null;
    }
    setIsLpActive(false);
    updateVariable(comp.pressVariableId, 'false');
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-between p-2 select-none">
      <div className="flex gap-2 w-full justify-center shrink-0">
        <button 
          onClick={() => rotate(-1)} 
          className="w-10 h-6 bg-[#222] border border-[#333] hover:border-[#f97316] rounded text-[#888] hover:text-[#fff] text-xs flex items-center justify-center active:scale-95 transition-all"
          disabled={editMode}
        >
          ↺
        </button>
        <button 
          onClick={() => rotate(1)} 
          className="w-10 h-6 bg-[#222] border border-[#333] hover:border-[#f97316] rounded text-[#888] hover:text-[#fff] text-xs flex items-center justify-center active:scale-95 transition-all"
          disabled={editMode}
        >
          ↻
        </button>
      </div>

      <div className="relative flex-1 flex items-center justify-center my-1">
        <div 
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          className="relative w-20 h-20 rounded-full cursor-pointer flex items-center justify-center transition-transform active:scale-95"
          style={{
            background: 'conic-gradient(from 0deg, #2a2a36, #1a1a24, #2a2a36, #1a1a24, #2a2a36)',
            border: '3px solid #333340',
            boxShadow: '0 4px 10px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
            transform: `rotate(${angle}deg)`
          }}
        >
          <div className="absolute w-2.5 h-2.5 bg-[#f97316] rounded-full shadow-[0_0_6px_rgba(249,115,22,0.8)]" style={{ top: '6px' }} />
          <div className="w-10 h-10 rounded-full bg-[#0d0d10] border border-[#222230] shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] flex items-center justify-center">
            <span className="text-[10px] text-[#444] font-bold">✦</span>
          </div>
        </div>
        <div 
          className={`absolute w-24 h-24 rounded-full border-2 border-[#f97316] pointer-events-none transition-all duration-300 ${isLpActive ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}
        />
      </div>

      <div className="text-[9px] text-[#555] font-mono text-center shrink-0">
        Value: {isHybrid ? String(encoderValues[currentIndex] || '') : String(rotVal)}
      </div>
    </div>
  );
};

const ModeSelector = ({
  comp,
  variables,
  updateVariable,
  editMode
}: {
  comp: HmiComponent;
  variables: VariableDef[];
  updateVariable: (id: string, value: string) => void;
  editMode: boolean;
}) => {
  const oledModes = [
    { name: 'Air Fry', emoji: '🍟' },
    { name: 'Steam', emoji: '💧' },
    { name: 'Oven', emoji: '🍞' },
    { name: 'Rapid Stm', emoji: '♨️' },
    { name: 'Broil', emoji: '🔥' },
    { name: 'Reheat', emoji: '🍲' },
    { name: 'Warm', emoji: '☕' },
    { name: 'Ferment', emoji: '🧫' },
    { name: 'Defrost', emoji: '❄️' },
    { name: 'Slow Cook', emoji: '🥘' },
    { name: 'Dehydrate', emoji: '🌿' },
    { name: 'Duo Cook', emoji: '⚡' }
  ];

  const selVar = variables.find(x => x.id === comp.variableId);
  const selIndex = selVar ? Number(selVar.currentValue) || 0 : 0;

  const curVar = variables.find(x => x.id === comp.cursorVariableId);
  const curIndex = curVar ? Number(curVar.currentValue) || 0 : 0;

  const handleSelect = (idx: number) => {
    if (editMode || !comp.variableId) return;
    updateVariable(comp.variableId, idx.toString());
  };

  return (
    <div className="w-full h-full bg-[#111] p-1 flex flex-col justify-between select-none">
      <div className="text-[9px] text-[#555] uppercase font-bold tracking-wider px-1">Cooking Modes</div>
      <div className="grid grid-cols-6 gap-1 flex-1 mt-0.5">
        {oledModes.map((m, idx) => {
          const isSelected = idx === selIndex;
          const isCursor = idx === curIndex;

          let borderClass = 'border-[#222]';
          let bgClass = 'bg-[#1a1a20]';
          let glowStyle = {};

          if (isSelected) {
            borderClass = 'border-[#f97316]';
            bgClass = 'bg-[#f97316]/10';
            glowStyle = { boxShadow: '0 0 6px rgba(249,115,22,0.3)' };
          } else if (isCursor) {
            borderClass = 'border-[#4db8ff]';
            bgClass = 'bg-[#4db8ff]/10';
            glowStyle = { boxShadow: '0 0 6px rgba(77,184,255,0.3)' };
          }

          return (
            <div
              key={idx}
              onClick={() => handleSelect(idx)}
              style={glowStyle}
              className={`border rounded flex flex-col items-center justify-center cursor-pointer p-0.5 transition-all active:scale-95 ${borderClass} ${bgClass}`}
            >
              <span className="text-xs">{m.emoji}</span>
              <span className="text-[7px] text-[#888] truncate w-full text-center mt-0.5">{m.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const HybridRotary = ({
  comp,
  variable,
  updateVariable,
  editMode
}: {
  comp: HmiComponent;
  variable: VariableDef | undefined;
  updateVariable: (id: string, value: string) => void;
  editMode: boolean;
}) => {
  const [dragAngle, setDragAngle] = useState<number | null>(null);

  const values = comp.hybridValues || [];
  const positions = Math.max(1, values.length);
  const stepAngle = 270 / (Math.max(1, positions - 1));

  let currentIndex = 0;
  if (variable) {
    const valStr = String(variable.currentValue);
    const idx = values.findIndex((v) => v == valStr);
    if (idx !== -1) currentIndex = idx;
  }

  // Start at 225 (Bottom-Left), go clockwise
  const currentAngle = 225 + currentIndex * stepAngle;
  const angle = dragAngle !== null ? dragAngle : currentAngle;

  const onMouseDown = (e: React.MouseEvent) => {
    if (editMode || !variable) return;

    e.preventDefault();
    e.stopPropagation();

    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const updateFromEvent = (ev: { clientX: number; clientY: number }) => {
      const angleRad = Math.atan2(ev.clientY - centerY, ev.clientX - centerX);
      let deg = angleRad * 180 / Math.PI;

      // atan2: 0=Right, 90=Down, 180=Left, -90=Up
      // We want 0 at 135 deg (Bottom-Left) in atan2 space
      let effectiveAngle = deg - 135;
      if (effectiveAngle < 0) effectiveAngle += 360;

      // SVG Angle (0=Up) => SVG = atan2 + 90
      let svgAngle = deg + 90;

      // Clamp dead zone (Bottom quadrant)
      if (effectiveAngle > 270) {
        if (effectiveAngle > 315) {
          effectiveAngle = 0;
          svgAngle = 225;
        } else {
          effectiveAngle = 270;
          svgAngle = 135;
        }
      }

      setDragAngle(svgAngle);

      const index = Math.round(effectiveAngle / stepAngle);
      const clampedIndex = Math.max(0, Math.min(positions - 1, index));

      if (clampedIndex !== currentIndex) {
        updateVariable(variable.id, values[clampedIndex]);
      }
    };

    updateFromEvent(e);

    const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
      updateFromEvent(moveEvent);
    };

    const handleMouseUp = () => {
      setDragAngle(null);
      document.body.style.cursor = 'default';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.body.style.cursor = 'grabbing';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      className="relative w-full h-full flex items-center justify-center"
      onMouseDown={onMouseDown}
      style={{ cursor: editMode ? 'default' : 'pointer' }}
    >
      <svg viewBox="0 0 100 100" className="w-full h-full">
        <defs>
          <radialGradient id="grad-hybrid">
            <stop offset="0%" stopColor="#444" />
            <stop offset="90%" stopColor="#1a1a1a" />
            <stop offset="100%" stopColor="#000" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="40" fill="url(#grad-hybrid)" stroke="#f97316" strokeWidth="1" />
        {Array.from({ length: positions }).map((_, i) => {
          const tickRot = 225 + i * stepAngle;
          return (
            <line
              key={i}
              x1="50" y1="10" x2="50" y2="15"
              stroke={i === currentIndex ? '#f97316' : '#666'}
              strokeWidth={i === currentIndex ? 3 : 1}
              transform={`rotate(${tickRot} 50 50)`}
            />
          );
        })}
        {Array.from({ length: positions }).map((_, i) => {
          const tickRot = 225 + i * stepAngle;
          const rad = (tickRot - 90) * (Math.PI / 180);
          const tx = 50 + 30 * Math.cos(rad);
          const ty = 50 + 30 * Math.sin(rad);
          return (
            <g key={i}>
              <text
                x={tx}
                y={ty}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={i === currentIndex ? '#f97316' : '#888'}
                fontSize="6"
                fontFamily="monospace"
                style={{ pointerEvents: 'none' }}
              >
                {values[i] || ''}
              </text>
            </g>
          );
        })}
        <g transform={`rotate(${angle} 50 50)`}>
          <circle cx="50" cy="20" r="4" fill="#f97316" />
          <line x1="50" y1="20" x2="50" y2="50" stroke="#f97316" strokeWidth="2" />
        </g>
      </svg>
      <div className="absolute bottom-1 text-[9px] text-[#f97316] font-mono select-none">
        {values[currentIndex]}
      </div>
    </div>
  );
};

const Buzzer = ({
  comp,
  variable,
  editMode
}: {
  comp: HmiComponent;
  variable: VariableDef | undefined;
  editMode: boolean;
}) => {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const hasPlayedRef = useRef(false);

  // Determine if buzzer should be active (truthy value and not in edit mode)
  const isActive = !editMode && variable && (
    (typeof variable.currentValue === 'boolean' && variable.currentValue) ||
    (typeof variable.currentValue === 'number' && variable.currentValue > 0)
  );

  useEffect(() => {
    if (isActive && !hasPlayedRef.current) {
      hasPlayedRef.current = true;
      try {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }

        if (audioCtxRef.current.state === 'suspended') {
          audioCtxRef.current.resume();
        }

        const osc = audioCtxRef.current.createOscillator();
        const gainNode = audioCtxRef.current.createGain();

        osc.type = comp.soundType || 'square';
        osc.frequency.setValueAtTime(1000, audioCtxRef.current.currentTime); // 1kHz beep
        gainNode.gain.setValueAtTime(0.1, audioCtxRef.current.currentTime); // Volume

        osc.connect(gainNode);
        gainNode.connect(audioCtxRef.current.destination);

        osc.start();
        oscillatorRef.current = osc;
        const ctx = audioCtxRef.current;
        const now = ctx.currentTime;
        const beepLength = 0.1;
        const gap = 0.15;
        const freq = 1200;
        const soundType = comp.soundType || 'sine';

        const playBeep = (startTime: number) => {
          const osc = ctx.createOscillator();
          const gainNode = ctx.createGain();

          osc.type = soundType;
          osc.frequency.setValueAtTime(freq, startTime);
          gainNode.gain.setValueAtTime(0.1, startTime);
          gainNode.gain.exponentialRampToValueAtTime(0.00001, startTime + beepLength);

          osc.connect(gainNode);
          gainNode.connect(ctx.destination);

          osc.start(startTime);
          osc.stop(startTime + beepLength);
        };

        // Schedule 3 beeps
        playBeep(now);
        playBeep(now + beepLength + gap);
        playBeep(now + 2 * (beepLength + gap));

      } catch (e) {
        console.error("Buzzer AudioContext error", e);
      }
    } else {
      if (oscillatorRef.current) {
        try {
          oscillatorRef.current.stop();
          oscillatorRef.current.disconnect();
        } catch (e) { /* ignore */ }
        oscillatorRef.current = null;
      }
      if (!isActive) {
        hasPlayedRef.current = false;
      }
    }

    return () => {
      if (oscillatorRef.current) {
        try {
          oscillatorRef.current.stop();
          oscillatorRef.current.disconnect();
        } catch (e) { /* ignore */ }
        oscillatorRef.current = null;
      }
    };
  }, [isActive, comp.soundType]);

  return (
    <div className={`w-full h-full flex items-center justify-center transition-colors duration-200 ${isActive ? 'text-red-500' : 'text-[#444]'}`}>
      <svg viewBox="0 0 24 24" fill="currentColor" width="60%" height="60%">
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
      </svg>
    </div>
  );
};

// ── Statistical Helper Functions (Global Scope) ──────────────────────────────
const normalCDF = (x: number) => {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
};

const lgamma = (x: number): number => {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let i = 0; i < 6; i++) ser += c[i] / (x + i + 1);
  return -tmp + Math.log(2.5066282746310005 * ser / x);
};

const betaIncomplete = (a: number, b: number, x: number): number => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lnBeta = lgamma(a) + lgamma(b) - lgamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta) / a;
  let f = 1, c = 1, d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d; f = d;
  for (let m = 1; m <= 200; m++) {
    let num = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + num * d; if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d;
    c = 1 + num / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    f *= d * c;
    num = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + num * d; if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d;
    c = 1 + num / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    f *= d * c;
  }
  return front * f;
};

const fDistPValue = (fVal: number, df1: number, df2: number): number => {
  if (fVal <= 0 || df1 <= 0 || df2 <= 0) return 1;
  const x = df2 / (df2 + df1 * fVal);
  return betaIncomplete(df2 / 2, df1 / 2, x);
};

const tCritical = (alpha: number, df: number): number => {
  if (df <= 0) return 0;
  const target = 1 - alpha / 2;
  let t = 2, step = 1;
  for (let i = 0; i < 20; i++) {
    const p = 1 - 0.5 * betaIncomplete(df / 2, 0.5, df / (df + t * t));
    if (p < target) t += step; else t -= step;
    step /= 2;
  }
  return t;
};



const predictRSM = (Beta: number[], factorValues: number[], k: number): number => {
  let y = Beta[0];
  for (let i = 0; i < k; i++) y += Beta[i + 1] * factorValues[i];
  for (let i = 0; i < k; i++) y += Beta[k + 1 + i] * factorValues[i] * factorValues[i];
  let idx = 2 * k + 1;
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      y += Beta[idx] * factorValues[i] * factorValues[j];
      idx++;
    }
  }
  return y;
};

// =============================================================================
// TAGUCHI ORTHOGONAL ARRAYS & HELPERS (MINITAB COMPLIANT)
// =============================================================================
const gf4_add = (x: number, y: number) => x ^ y;
const gf4_mul = (x: number, y: number) => {
  if (x === 0 || y === 0) return 0;
  if (x === 1) return y;
  if (y === 1) return x;
  if (x === 2 && y === 2) return 3;
  if (x === 3 && y === 3) return 2;
  return 1;
};

const generateL4 = () => [
  [1, 1, 1],
  [1, 2, 2],
  [2, 1, 2],
  [2, 2, 1]
];

const generateL8 = () => [
  [1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 2, 2, 2, 2],
  [1, 2, 2, 1, 1, 2, 2],
  [1, 2, 2, 2, 2, 1, 1],
  [2, 1, 2, 1, 2, 1, 2],
  [2, 1, 2, 2, 1, 2, 1],
  [2, 2, 1, 1, 2, 2, 1],
  [2, 2, 1, 2, 1, 1, 2]
];

const generateL9 = () => [
  [1, 1, 1, 1],
  [1, 2, 2, 2],
  [1, 3, 3, 3],
  [2, 1, 2, 3],
  [2, 2, 3, 1],
  [2, 3, 1, 2],
  [3, 1, 3, 2],
  [3, 2, 1, 3],
  [3, 3, 2, 1]
];

const generateL12 = () => [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2],
  [1, 1, 2, 2, 2, 1, 1, 1, 2, 2, 2],
  [1, 2, 1, 2, 2, 1, 2, 2, 1, 1, 2],
  [1, 2, 2, 1, 2, 2, 1, 2, 1, 2, 1],
  [1, 2, 2, 2, 1, 2, 2, 1, 2, 1, 1],
  [2, 1, 2, 2, 1, 1, 2, 2, 1, 2, 1],
  [2, 1, 2, 1, 2, 2, 2, 1, 1, 1, 2],
  [2, 1, 1, 2, 2, 2, 1, 2, 2, 1, 1],
  [2, 2, 2, 1, 1, 1, 1, 2, 2, 1, 2],
  [2, 2, 1, 2, 1, 2, 1, 1, 1, 2, 2],
  [2, 2, 1, 1, 2, 1, 2, 2, 2, 2, 1]
];

const generateL16_2 = () => {
  const matrix = [];
  for (let r = 0; r < 16; r++) {
    const row = [];
    for (let c = 1; c <= 15; c++) {
      let popcount = 0;
      let andVal = r & c;
      while (andVal > 0) {
        if (andVal & 1) popcount++;
        andVal >>= 1;
      }
      row.push((popcount % 2 === 0) ? 1 : 2);
    }
    matrix.push(row);
  }
  return matrix;
};

const generateL16_4 = () => {
  const matrix = [];
  for (let r = 0; r < 16; r++) {
    const a = Math.floor(r / 4);
    const b = r % 4;
    const row = [
      a + 1,
      b + 1,
      gf4_add(a, b) + 1,
      gf4_add(a, gf4_mul(2, b)) + 1,
      gf4_add(a, gf4_mul(3, b)) + 1
    ];
    matrix.push(row);
  }
  return matrix;
};

const generateL18 = () => [
  [1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 2, 2, 2, 2, 2, 2],
  [1, 1, 3, 3, 3, 3, 3, 3],
  [1, 2, 1, 1, 2, 2, 3, 3],
  [1, 2, 2, 2, 3, 3, 1, 1],
  [1, 2, 3, 3, 1, 1, 2, 2],
  [1, 3, 1, 2, 1, 3, 2, 3],
  [1, 3, 2, 3, 2, 1, 3, 1],
  [1, 3, 3, 1, 3, 2, 1, 2],
  [2, 1, 1, 3, 3, 2, 2, 1],
  [2, 1, 2, 1, 1, 3, 3, 2],
  [2, 1, 3, 2, 2, 1, 1, 3],
  [2, 2, 1, 2, 3, 1, 3, 2],
  [2, 2, 2, 3, 1, 2, 1, 3],
  [2, 2, 3, 1, 2, 3, 2, 1],
  [2, 3, 1, 3, 2, 3, 1, 2],
  [2, 3, 2, 1, 3, 1, 2, 3],
  [2, 3, 3, 2, 1, 2, 3, 1]
];

const generateL25 = () => {
  const matrix = [];
  for (let r = 0; r < 25; r++) {
    const a = Math.floor(r / 5);
    const b = r % 5;
    const row = [
      a + 1,
      b + 1,
      ((a + b) % 5) + 1,
      ((a + 2 * b) % 5) + 1,
      ((a + 3 * b) % 5) + 1,
      ((a + 4 * b) % 5) + 1
    ];
    matrix.push(row);
  }
  return matrix;
};

const generateL27 = () => {
  const matrix = [];
  for (let r = 0; r < 27; r++) {
    const a = Math.floor(r / 9) % 3;
    const b = Math.floor(r / 3) % 3;
    const c = r % 3;
    const row = [
      a + 1, // 1
      b + 1, // 2
      ((a + b) % 3) + 1, // 3
      ((a + 2 * b) % 3) + 1, // 4
      c + 1, // 5
      ((a + c) % 3) + 1, // 6
      ((a + 2 * c) % 3) + 1, // 7
      ((b + c) % 3) + 1, // 8
      ((b + 2 * c) % 3) + 1, // 9
      ((a + b + c) % 3) + 1, // 10
      ((a + b + 2 * c) % 3) + 1, // 11
      ((a + 2 * b + c) % 3) + 1, // 12
      ((a + 2 * b + 2 * c) % 3) + 1 // 13
    ];
    matrix.push(row);
  }
  return matrix;
};

const generateL32 = () => {
  const matrix = [];
  for (let r = 0; r < 32; r++) {
    const row = [];
    for (let c = 1; c <= 31; c++) {
      let popcount = 0;
      let andVal = r & c;
      while (andVal > 0) {
        if (andVal & 1) popcount++;
        andVal >>= 1;
      }
      row.push((popcount % 2 === 0) ? 1 : 2);
    }
    matrix.push(row);
  }
  return matrix;
};

interface TaguchiOADef {
  name: string;
  runs: number;
  colLevels: number[];
  matrix: number[][];
}

const getTaguchiOAs = (): TaguchiOADef[] => [
  { name: 'L4 (2^3)', runs: 4, colLevels: Array(3).fill(2), matrix: generateL4() },
  { name: 'L8 (2^7)', runs: 8, colLevels: Array(7).fill(2), matrix: generateL8() },
  { name: 'L9 (3^4)', runs: 9, colLevels: Array(4).fill(3), matrix: generateL9() },
  { name: 'L12 (2^11)', runs: 12, colLevels: Array(11).fill(2), matrix: generateL12() },
  { name: 'L16 (2^15)', runs: 16, colLevels: Array(15).fill(2), matrix: generateL16_2() },
  { name: 'L16 (4^5)', runs: 16, colLevels: Array(5).fill(4), matrix: generateL16_4() },
  { name: 'L18 (2^1 x 3^7)', runs: 18, colLevels: [2, 3, 3, 3, 3, 3, 3, 3], matrix: generateL18() },
  { name: 'L25 (5^6)', runs: 25, colLevels: Array(6).fill(5), matrix: generateL25() },
  { name: 'L27 (3^13)', runs: 27, colLevels: Array(13).fill(3), matrix: generateL27() },
  { name: 'L32 (2^31)', runs: 32, colLevels: Array(31).fill(2), matrix: generateL32() }
];

const findBestOA = (userLevels: number[]): TaguchiOADef | null => {
  const sortedUser = [...userLevels].sort((a, b) => b - a);
  const OAs = getTaguchiOAs();
  let bestOA: TaguchiOADef | null = null;
  for (const oa of OAs) {
    const sortedOA = [...oa.colLevels].sort((a, b) => b - a);
    if (sortedUser.length > sortedOA.length) continue;
    
    let compatible = true;
    for (let i = 0; i < sortedUser.length; i++) {
      if (sortedUser[i] > sortedOA[i]) {
        compatible = false;
        break;
      }
    }
    if (compatible) {
      if (!bestOA || oa.runs < bestOA.runs) {
        bestOA = oa;
      }
    }
  }
  return bestOA;
};

const generateDesignMatrix = (factors: { name: string, levels: number }[], oa: TaguchiOADef): number[][] => {
  const mappedCols: number[] = [];
  const usedCols = new Set<number>();
  
  factors.forEach((f, fIdx) => {
    let matchedCol = -1;
    for (let c = 0; c < oa.colLevels.length; c++) {
      if (!usedCols.has(c) && oa.colLevels[c] === f.levels) {
        matchedCol = c;
        break;
      }
    }
    if (matchedCol !== -1) {
      mappedCols[fIdx] = matchedCol;
      usedCols.add(matchedCol);
    }
  });
  
  factors.forEach((f, fIdx) => {
    if (mappedCols[fIdx] !== undefined) return;
    let matchedCol = -1;
    for (let c = 0; c < oa.colLevels.length; c++) {
      if (!usedCols.has(c) && oa.colLevels[c] >= f.levels) {
        matchedCol = c;
        break;
      }
    }
    if (matchedCol !== -1) {
      mappedCols[fIdx] = matchedCol;
      usedCols.add(matchedCol);
    }
  });

  const dataRows: number[][] = [];
  for (let r = 0; r < oa.runs; r++) {
    const row: number[] = [];
    factors.forEach((f, fIdx) => {
      const colIdx = mappedCols[fIdx];
      let val = 1;
      if (colIdx !== undefined) {
        val = oa.matrix[r][colIdx];
        if (val > f.levels) {
          val = 1;
        }
      }
      row.push(val);
    });
    row.push(0);
    dataRows.push(row);
  }
  return dataRows;
};

const DoeWorkspace = ({
  onClose,
  addError,
  activeModel,
  setActiveModel,
  taguchiConfig,
  setTaguchiConfig,
  data,
  setData,
  headers,
  setHeaders,
  results,
  setResults,
  plotFactors,
  setPlotFactors,
  holdValues,
  setHoldValues,
  plotType,
  setPlotType,
  handleExportProject,
  generateReport,
  onExportToVLab,
  onExportToXBridges,
  factors,
  setFactors,
  calculateRSM,
  calculateGMDH,
  calculateTaguchi,
  handleExportToVLab,
  handleExportToXBridges
}: {
  onClose: () => void;
  addError: (type: 'error' | 'warning' | 'info', message: string, source?: string, elementId?: string) => void;
  activeModel: 'RSM' | 'GMDH' | 'Taguchi';
  setActiveModel: React.Dispatch<React.SetStateAction<'RSM' | 'GMDH' | 'Taguchi'>>;
  taguchiConfig: { objective: 'larger' | 'smaller' | 'nominal' | 'target', targetValue?: number };
  setTaguchiConfig: React.Dispatch<React.SetStateAction<{ objective: 'larger' | 'smaller' | 'nominal' | 'target', targetValue?: number }>>;
  data: number[][];
  setData: React.Dispatch<React.SetStateAction<number[][]>>;
  headers: string[];
  setHeaders: React.Dispatch<React.SetStateAction<string[]>>;
  results: any | null;
  setResults: React.Dispatch<React.SetStateAction<any | null>>;
  plotFactors: { x: number, y: number };
  setPlotFactors: React.Dispatch<React.SetStateAction<{ x: number, y: number }>>;
  holdValues: number[];
  setHoldValues: React.Dispatch<React.SetStateAction<number[]>>;
  plotType: 'surface' | 'contour' | 'pareto' | 'residuals' | 'taguchi_delta' | 'pred_vs_act' | 'taguchi_main_sn' | 'taguchi_main_mean';
  setPlotType: React.Dispatch<React.SetStateAction<'surface' | 'contour' | 'pareto' | 'residuals' | 'taguchi_delta' | 'pred_vs_act' | 'taguchi_main_sn' | 'taguchi_main_mean'>>;
  handleExportProject: () => void;
  generateReport: () => void;
  onExportToVLab: (block: any) => void;
  onExportToXBridges: (block: any) => void;
  factors: any[];
  setFactors: React.Dispatch<React.SetStateAction<any[]>>;
  calculateRSM: () => void;
  calculateGMDH: () => void;
  calculateTaguchi: () => void;
  handleExportToVLab: () => void;
  handleExportToXBridges: () => void;
}) => {
  const [eqFontSize, setEqFontSize] = useState(14);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Taguchi design builder state
  const [showDesignBuilder, setShowDesignBuilder] = useState(false);
  const [builderNumFactors, setBuilderNumFactors] = useState(3);
  const [builderFactors, setBuilderFactors] = useState<{ name: string, levels: number }[]>([
    { name: 'A', levels: 3 },
    { name: 'B', levels: 3 },
    { name: 'C', levels: 3 }
  ]);
  const [responseTableTab, setResponseTableTab] = useState<'sn' | 'mean'>('sn');

  const k = headers.length - 1;

  useEffect(() => {
    // Initialize hold values to means
    if (data.length > 0) {
      const means = new Array(k).fill(0);
      for (let i = 0; i < k; i++) {
        const vals = data.map(r => r[i]);
        means[i] = vals.reduce((a, b) => a + b, 0) / vals.length;
      }
      setHoldValues(means);
    }
  }, [data.length, k]);

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

        if (jsonData.length < 2) throw new Error("Empty or invalid sheet");

        const headerRow = jsonData[0] as string[];
        const dataRows = jsonData.slice(1).filter(r => r.length > 0).map(r => r.map((c: any) => Number(c)));

        setHeaders(headerRow);
        setData(dataRows);
        addError('info', `Loaded ${dataRows.length} rows from Excel.`);
      } catch (err) {
        addError('error', 'Failed to parse Excel file.');
      }
    };
    reader.readAsBinaryString(file);
  };

  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleExportProject();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleExportProject]);

  const handleBuilderNumFactorsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    if (isNaN(val) || val < 1 || val > 15) return;
    setBuilderNumFactors(val);
    setBuilderFactors(prev => {
      const newList = [...prev];
      if (val > prev.length) {
        for (let i = prev.length; i < val; i++) {
          const charCode = 65 + i;
          const name = charCode <= 90 ? String.fromCharCode(charCode) : `X${i + 1}`;
          newList.push({ name, levels: 3 });
        }
      } else if (val < prev.length) {
        return newList.slice(0, val);
      }
      return newList;
    });
  };

  const handleBuilderFactorNameChange = (idx: number, name: string) => {
    setBuilderFactors(prev => prev.map((f, i) => i === idx ? { ...f, name } : f));
  };

  const handleBuilderFactorLevelsChange = (idx: number, levels: number) => {
    setBuilderFactors(prev => prev.map((f, i) => i === idx ? { ...f, levels } : f));
  };

  const handleGenerateDesign = () => {
    const bestOA = findBestOA(builderFactors.map(f => f.levels));
    if (!bestOA) {
      addError('error', 'No standard Taguchi Orthogonal Array supports this levels configuration.');
      return;
    }
    const designMatrix = generateDesignMatrix(builderFactors, bestOA);
    const newHeaders = [...builderFactors.map(f => f.name), 'Response'];
    setData(designMatrix);
    setHeaders(newHeaders);
    setResults(null);
    setShowDesignBuilder(false);
    addError('info', `Generated Taguchi Coded worksheet using ${bestOA.name} array.`);
  };

  return (
    <div className="doe-workspace doe-panel flex flex-col h-full w-full bg-[var(--surface-base)] text-[var(--text-primary)] font-sans">
      {/* Top Control Bar */}
      <div className="h-14 border-b border-[var(--border-default)] bg-[var(--surface-raised)] flex items-center justify-between px-5 gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-500">
              <Layers size={16} />
            </div>
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">DOE ANALYZER PRO</h2>
              <span className="text-[10px] text-[var(--text-muted)] font-mono">Response Surface & Optimization</span>
            </div>
          </div>

          <Separator orientation="vertical" className="h-6 bg-[var(--border-default)]" />

          {/* Model Switcher Segment */}
          <div className="flex bg-[var(--surface-panel)] rounded-lg border border-[var(--border-default)] p-0.5">
            {[
              { id: 'RSM', label: 'Run RSM', action: calculateRSM },
              { id: 'GMDH', label: 'Run GMDH', action: calculateGMDH },
              { id: 'Taguchi', label: 'Run Taguchi', action: calculateTaguchi },
            ].map(m => (
              <button
                key={m.id}
                onClick={m.action}
                className={`px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                  activeModel === m.id
                    ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm font-semibold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-base)]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {activeModel === 'Taguchi' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDesignBuilder(true)}
              className="h-7 px-2.5 text-xs font-medium bg-[var(--surface-panel)] border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--surface-raised)] whitespace-nowrap"
            >
              Create Taguchi Design
            </Button>
          )}
        </div>

        {/* Top Actions Capsule */}
        <div className="flex items-center gap-1 bg-[var(--surface-panel)] border border-[var(--border-default)] rounded-lg p-1">
          <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx,.csv" onChange={handleFileUpload} />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExportProject}
            className="h-7 px-2.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] whitespace-nowrap"
            title="Ctrl+S"
          >
            <Save size={13} className="mr-1.5 text-[var(--text-muted)]" /> Save
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="h-7 px-2.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] whitespace-nowrap"
          >
            <Upload size={13} className="mr-1.5 text-[var(--text-muted)]" /> Upload Data
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={generateReport}
            className="h-7 px-2.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] whitespace-nowrap"
          >
            <FileText size={13} className="mr-1.5 text-[var(--text-muted)]" /> Report
          </Button>
          <Separator orientation="vertical" className="h-4 bg-[var(--border-default)]" />
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-7 px-2 text-xs text-[var(--text-muted)] hover:text-rose-500 hover:bg-rose-500/10 whitespace-nowrap"
            title="Close DOE Analyzer"
          >
            <X size={14} className="mr-1" /> Close
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Results & Config */}
        <div className="w-80 border-r border-[#222] bg-[#0a0a0a] flex flex-col p-4 overflow-y-auto custom-scrollbar">
          {results ? (
            <div className="space-y-6">
              <section className="bg-[#18181c] p-3 rounded-xl border border-[#27272f]">
                <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2.5">Model Deployment</h3>
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-7 text-xs font-medium border-sky-500/30 bg-sky-500/5 text-sky-400 hover:bg-sky-500/20 hover:text-sky-300 transition-colors whitespace-nowrap"
                    onClick={handleExportToXBridges}
                  >
                    <Network size={12} className="mr-1.5" /> X-Bridges
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-7 text-xs font-medium border-purple-500/30 bg-purple-500/5 text-purple-400 hover:bg-purple-500/20 hover:text-purple-300 transition-colors whitespace-nowrap"
                    onClick={handleExportToVLab}
                  >
                    <FlaskConical size={12} className="mr-1.5" /> V-Lab
                  </Button>
                </div>
              </section>

              <section>
                <h3 className="text-xs font-bold text-[#888] uppercase tracking-widest mb-3">Model Metrics</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-[#1a1a1a] p-4 rounded-lg border border-[#222]">
                    <div className="text-xs text-[#888] mb-1">R-Squared</div>
                    <div className="text-xl font-black text-[#f97316]">{(results.R2 * 100).toFixed(2)}%</div>
                    {results.R2Adj !== undefined && (
                      <div className="text-[10px] text-[#555] mt-1">Adj: {(results.R2Adj * 100).toFixed(2)}% | Pred: {(results.R2Pred * 100).toFixed(2)}%</div>
                    )}
                  </div>
                  <div className="bg-[#1a1a1a] p-4 rounded-lg border border-[#222]">
                    <div className="text-xs text-[#888] mb-1">{results.type === 'RSM' ? 'Adeq Precision' : 'Model Type'}</div>
                    <div className="text-sm font-bold text-white uppercase">
                      {results.type === 'RSM' ? results.AdeqPrec?.toFixed(4) : results.type}
                    </div>
                    {results.type === 'RSM' && (
                      <div className={`text-[9px] font-bold mt-1 uppercase leading-none px-1 py-0.5 rounded inline-block ${results.AdeqPrec > 4 ? 'text-emerald-400 bg-emerald-500/10' : 'text-amber-400 bg-amber-500/10'}`}>
                        {results.AdeqPrec > 4 ? 'Signal Adequate' : 'Weak Signal'}
                      </div>
                    )}
                    {results.type === 'GMDH' && results.model?.layers && (
                      <div className="text-[10px] text-[#666] mt-1">{results.model.layers.length} layers</div>
                    )}
                  </div>
                </div>
              </section>

              {results.type === 'Taguchi' && (
                <>
                  <section>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-bold text-[#888] uppercase tracking-widest">Response Table</h3>
                      <div className="flex bg-[#1a1a1a] p-0.5 rounded border border-[#222]">
                        <button 
                          className={`px-2 py-1 text-[9px] rounded font-bold transition-all ${responseTableTab === 'sn' ? 'bg-[#f97316] text-black' : 'text-[#888] hover:text-[#fff]'}`}
                          onClick={() => setResponseTableTab('sn')}
                        >
                          S/N
                        </button>
                        <button 
                          className={`px-2 py-1 text-[9px] rounded font-bold transition-all ${responseTableTab === 'mean' ? 'bg-[#f97316] text-black' : 'text-[#888] hover:text-[#fff]'}`}
                          onClick={() => setResponseTableTab('mean')}
                        >
                          Means
                        </button>
                      </div>
                    </div>
                    <div className="bg-[#1a1a1a] rounded border border-[#222] overflow-x-auto custom-scrollbar">
                      <table className="w-full text-[10px] text-left border-collapse">
                        <thead className="bg-[#1a1a1a] text-[#666] uppercase">
                          <tr>
                            <th className="p-2 border-r border-[#222]">Level</th>
                            {results.factorLevels?.map((f: any, i: number) => (
                              <th key={i} className="p-2 text-center min-w-[60px]">{f.factor}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#222]">
                          {[1, 2, 3, 4, 5].map(level => {
                            const hasLevel = results.factorLevels?.some((f: any) => f.means.some((m: any) => m.level === level));
                            if (!hasLevel) return null;
                            return (
                              <tr key={level}>
                                <td className="p-2 font-bold text-[#888] bg-[#1a1a1a] border-r border-[#222]">{level}</td>
                                {results.factorLevels?.map((f: any, i: number) => {
                                  const m = f.means.find((m: any) => m.level === level);
                                  return (
                                    <td key={i} className="p-2 text-center text-white">
                                      {m ? (responseTableTab === 'sn' ? m.meanSN.toFixed(2) : m.meanY.toFixed(4)) : '-'}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                          <tr className="bg-[#1a1a1a]/50">
                            <td className="p-2 font-bold text-[#f97316] border-r border-[#222]">Delta</td>
                            {results.factorLevels?.map((f: any, i: number) => {
                              const deltaVal = responseTableTab === 'sn' ? f.delta : f.deltaY;
                              return <td key={i} className="p-2 text-center text-[#f97316] font-bold">{deltaVal !== undefined ? deltaVal.toFixed(2) : '-'}</td>;
                            })}
                          </tr>
                          <tr>
                            <td className="p-2 font-bold text-[#f97316] border-r border-[#222]">Rank</td>
                            {results.factorLevels?.map((f: any, i: number) => {
                              const val = responseTableTab === 'sn' ? f.rank : f.rankY;
                              return <td key={i} className="p-2 text-center text-[#f97316] font-black italic">{val}</td>;
                            })}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="bg-[#1a1a1a] p-3 rounded-xl border border-emerald-500/10">
                    <h3 className="text-xs font-bold text-[#888] uppercase tracking-widest mb-3">Optimal Settings</h3>
                    <div className="grid grid-cols-1 gap-1 mb-3">
                      {results.optimal?.map((opt: any, idx: number) => (
                        <div key={idx} className="bg-[#0f0f0f] p-2 rounded border border-emerald-500/10 flex justify-between items-center group hover:border-emerald-500/40 transition-colors">
                          <span className="text-[10px] text-gray-400">{opt.factor}</span>
                          <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">Level {opt.level}</span>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-1 pt-2 border-t border-[#222] font-mono text-[10px]">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Predicted SN:</span>
                        <span className="text-emerald-400 font-bold">{results.predOptSN?.toFixed(3)} dB</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Predicted Mean Y:</span>
                        <span className="text-emerald-400 font-bold">{results.predOptY?.toFixed(4)}</span>
                      </div>
                    </div>
                  </section>
                </>
              )}

              {results.type === 'RSM' && (
                <>
                  <section>
                    <h3 className="text-xs font-bold text-[#888] uppercase tracking-widest mb-3">ANOVA (Model Summary)</h3>
                    <div className="bg-[#1a1a1a] rounded border border-[#222] overflow-x-auto">
                      <table className="w-full text-[9px] text-left border-collapse">
                        <thead className="bg-[#1a1a1a] text-[#666] uppercase">
                          <tr>
                            <th className="p-2 border-r border-[#222]">Source</th>
                            <th className="p-2 text-center">DF</th>
                            <th className="p-2 text-center">SS</th>
                            <th className="p-2 text-center">MS</th>
                            <th className="p-2 text-center">F</th>
                            <th className="p-2 text-center">P-Value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#222]">
                          {results.anovaTable?.map((row: any, i: number) => (
                            <tr key={i} className={row.source === 'Lack of Fit' && row.p > 0.05 ? 'bg-emerald-500/5' : row.source === 'Lack of Fit' && row.p <= 0.05 ? 'bg-red-500/5' : ''}>
                              <td className={`p-2 font-bold bg-[#1a1a1a] border-r border-[#222] ${row.source === 'Lack of Fit' || row.source === 'Pure Error' ? 'text-[#666] pl-4' : 'text-[#888]'}`}>{row.source}</td>
                              <td className="p-2 text-center text-white">{row.df}</td>
                              <td className="p-2 text-center text-white">{row.ss?.toFixed(4) || '-'}</td>
                              <td className="p-2 text-center text-white">{row.ms?.toFixed(4) || '-'}</td>
                              <td className="p-2 text-center font-bold text-[#f97316]">{row.f?.toFixed(2) || '-'}</td>
                              <td className={`p-2 text-center font-bold ${row.p !== undefined ? (row.p < 0.05 ? 'text-emerald-400' : 'text-gray-500') : 'text-gray-600'}`}>
                                {row.p !== undefined ? row.p.toFixed(4) : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {results.lofTest && (
                      <div className={`text-[9px] mt-1 px-2 py-1 rounded ${results.lofTest.p_LOF > 0.05 ? 'text-emerald-400 bg-emerald-500/5' : 'text-amber-400 bg-amber-500/5'}`}>
                        {results.lofTest.p_LOF > 0.05 ? '✓ Lack of Fit is not significant — model fits well' : '⚠ Lack of Fit is significant — consider higher-order terms'}
                      </div>
                    )}
                  </section>

                  <section>
                    <h3 className="text-xs font-bold text-[#888] uppercase tracking-widest mb-3">Coefficients (Uncoded)</h3>
                    <div className="bg-[#1a1a1a] rounded border border-[#222] overflow-x-auto max-h-48 custom-scrollbar">
                      <table className="w-full text-[9px] text-left border-collapse">
                        <thead className="bg-[#1a1a1a] text-[#666] uppercase sticky top-0 z-10">
                          <tr>
                            <th className="p-2 border-r border-[#222]">Term</th>
                            <th className="p-2 text-center">Coef</th>
                            <th className="p-2 text-center">T-Val</th>
                            <th className="p-2 text-center">P-Val</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#222]">
                          {results.coeffTable?.map((row: any, i: number) => (
                            <tr key={i} className={row.p < 0.05 ? 'bg-emerald-500/5' : ''}>
                              <td className="p-2 font-bold text-[#888] bg-[#1a1a1a] border-r border-[#222] truncate max-w-[80px]">{row.term}</td>
                              <td className="p-2 text-center text-white">{row.coef.toPrecision(4)}</td>
                              <td className="p-2 text-center text-white">{row.t.toFixed(2)}</td>
                              <td className={`p-2 text-center font-bold ${row.p < 0.05 ? 'text-emerald-400' : 'text-gray-500'}`}>{row.p.toFixed(3)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              )}

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-[#888] uppercase tracking-widest">Equation</h3>
                  <div className="flex gap-1 items-center">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-6 px-2 text-[10px] font-medium border-purple-500/30 bg-purple-500/5 text-purple-400 hover:bg-purple-500/20 hover:text-purple-300 whitespace-nowrap"
                      onClick={handleExportToVLab}
                    >
                      <FlaskConical size={10} className="mr-1" /> V-Lab
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-6 px-2 text-[10px] font-medium border-sky-500/30 bg-sky-500/5 text-sky-400 hover:bg-sky-500/20 hover:text-sky-300 whitespace-nowrap"
                      onClick={handleExportToXBridges}
                    >
                      <Network size={10} className="mr-1" /> X-Bridges
                    </Button>
                    <div className="w-1" />
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-white" onClick={() => setEqFontSize(p => Math.max(8, p - 1))}><span className="text-[9px]">A-</span></Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-white" onClick={() => setEqFontSize(p => Math.min(32, p + 1))}><span className="text-[11px]">A+</span></Button>
                  </div>
                </div>
                <div
                  className="bg-[#1a1a1a] rounded-lg border border-[#222] overflow-auto max-h-64 select-text"
                >
                  <pre
                    className="p-4 font-mono text-[#f97316] whitespace-pre-wrap leading-loose"
                    style={{ fontSize: `${eqFontSize}px` }}
                  >
                    {results.equation || 'No equation generated'}
                  </pre>
                </div>

                {/* GMDH Metrics Badges */}
                {results.type === 'GMDH' && results.model?.layers && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    <div className="bg-[#1a1a2e] border border-[#2a2a4e] rounded-full px-3 py-1 text-[11px] font-mono">
                      <span className="text-[#888]">RMSE </span>
                      <span className="text-sky-400 font-bold">{results.model.layers[results.model.layers.length - 1][0].rmse.toFixed(4)}</span>
                    </div>
                    <div className="bg-[#1a2e1a] border border-[#2a4e2a] rounded-full px-3 py-1 text-[11px] font-mono">
                      <span className="text-[#888]">Layers </span>
                      <span className="text-emerald-400 font-bold">{results.model.layers.length}</span>
                    </div>
                  </div>
                )}
              </div>

              <section>
                <h3 className="text-xs font-bold text-[#888] uppercase tracking-widest mb-3">Plot Config</h3>
                <div className="space-y-4">
                  {plotType !== 'taguchi_main_sn' && plotType !== 'taguchi_main_mean' && (
                    <>
                      <div>
                        <Label className="mb-2 block">X-Axis Factor</Label>
                        <select
                          className="w-full bg-[#1a1a1a] border border-[#222] rounded p-2 text-xs text-white"
                          value={plotFactors.x}
                          onChange={e => setPlotFactors(prev => ({ ...prev, x: Number(e.target.value) }))}
                        >
                          {headers.slice(0, -1).map((h, i) => <option key={i} value={i}>{h}</option>)}
                        </select>
                      </div>
                      <div>
                        <Label className="mb-2 block">Y-Axis Factor</Label>
                        <select
                          className="w-full bg-[#1a1a1a] border border-[#222] rounded p-2 text-xs text-white"
                          value={plotFactors.y}
                          onChange={e => setPlotFactors(prev => ({ ...prev, y: Number(e.target.value) }))}
                        >
                          {headers.slice(0, -1).map((h, i) => <option key={i} value={i}>{h}</option>)}
                        </select>
                      </div>
                    </>
                  )}

                  <div>
                    <Label className="mb-2 block text-xs text-zinc-400">Plot Type</Label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { id: 'surface', label: 'Surface', show: true },
                        { id: 'contour', label: 'Contour', show: true },
                        { id: 'taguchi_main_sn', label: 'Main Effects (S/N)', show: results?.type === 'Taguchi' },
                        { id: 'taguchi_main_mean', label: 'Main Effects (Means)', show: results?.type === 'Taguchi' },
                        { id: 'pareto', label: 'Pareto', show: results?.type === 'RSM' },
                        { id: 'residuals', label: 'Residuals', show: results?.type === 'RSM' || results?.type === 'Taguchi' },
                        { id: 'taguchi_delta', label: 'Rank/Delta', show: results?.type === 'Taguchi' },
                        { id: 'pred_vs_act', label: 'Pred vs Act', show: results?.type === 'RSM' || results?.type === 'GMDH' || results?.type === 'Taguchi' },
                      ].filter(p => p.show).map(p => (
                        <button
                          key={p.id}
                          onClick={() => setPlotType(p.id as any)}
                          className={`h-7 px-2 text-xs font-medium rounded-md whitespace-nowrap transition-colors border ${
                            plotType === p.id
                              ? 'bg-orange-500/15 border-orange-500/40 text-orange-400 font-semibold'
                              : 'bg-[#18181c] border-[#27272f] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {activeModel === 'Taguchi' && (
                    <div className="space-y-4">
                      <div className="bg-[#1a1a1a] p-3 rounded border border-[#222] space-y-3">
                        <h4 className="text-[10px] font-bold text-[#f97316] uppercase tracking-tighter">Confirmation Prediction</h4>
                        <p className="text-[9px] text-gray-500 italic mb-2">Predict response based on factor level selection.</p>
                        {headers.slice(0, -1).map((h, i) => (
                          <div key={i} className="flex justify-between items-center gap-2">
                            <span className="text-[9px] text-gray-400 truncate w-24">{h}</span>
                            <select 
                              className="bg-[#050505] border border-[#222] text-[9px] p-1 rounded text-white"
                              value={holdValues[i]}
                              onChange={(e) => {
                                const newVals = [...holdValues];
                                newVals[i] = Number(e.target.value);
                                setHoldValues(newVals);
                              }}
                            >
                              {Array.from(new Set(data.map(r => r[i]))).sort((a,b)=>a-b).map(l => <option key={l} value={l}>Level {l}</option>)}
                            </select>
                          </div>
                        ))}
                        <div className="mt-3 pt-3 border-t border-[#222]">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] text-gray-300">Predicted SN:</span>
                            <span className="text-[10px] font-bold text-[#f97316]">
                              {(() => {
                                const grandMean = results?.grandMeanSN || 0;
                                let pred = grandMean;
                                holdValues.forEach((val, i) => {
                                  const factor = results?.factorLevels?.find((f:any) => f.factor === headers[i]);
                                  const levelMean = factor?.means.find((m:any) => m.level === val)?.meanSN;
                                  if (levelMean !== undefined) pred += (levelMean - grandMean);
                                });
                                return isNaN(pred) ? '0.000' : pred.toFixed(3);
                              })()}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] text-gray-300">Predicted Mean Y:</span>
                            <span className="text-[10px] font-bold text-emerald-400">
                              {(() => {
                                const grandMeanY = results?.grandMeanY || 0;
                                let pred = grandMeanY;
                                holdValues.forEach((val, i) => {
                                  const factor = results?.factorLevels?.find((f:any) => f.factor === headers[i]);
                                  const levelMean = factor?.means.find((m:any) => m.level === val)?.meanY;
                                  if (levelMean !== undefined) pred += (levelMean - grandMeanY);
                                });
                                return isNaN(pred) ? '0.000' : pred.toFixed(4);
                              })()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div>
                        <Label className="mb-2 block">Objective (S/N)</Label>
                        <select
                          className="w-full bg-[#1a1a1a] border border-[#222] rounded p-2 text-xs text-white"
                          value={taguchiConfig.objective}
                          onChange={e => setTaguchiConfig(prev => ({ ...prev, objective: e.target.value as any }))}
                        >
                          <option value="larger">Larger is Better</option>
                          <option value="smaller">Smaller is Better</option>
                          <option value="nominal">Nominal is Best (Standard)</option>
                          <option value="target">Nominal is Best (Target Value)</option>
                        </select>
                      </div>

                      {taguchiConfig.objective === 'target' && (
                        <div>
                          <Label className="mb-2 block">Target Value</Label>
                          <input
                            type="number"
                            value={taguchiConfig.targetValue !== undefined ? taguchiConfig.targetValue : 0}
                            onChange={e => setTaguchiConfig(prev => ({ ...prev, targetValue: Number(e.target.value) }))}
                            className="w-full bg-[#1a1a1a] border border-[#222] rounded p-2 text-xs text-white"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {plotType !== 'taguchi_main_sn' && plotType !== 'taguchi_main_mean' && (
                    <div className="pt-4 border-t border-[#222]">
                      <Label className="mb-3 block">Hold Values (Other Factors)</Label>
                      {headers.slice(0, -1).map((h, i) => {
                        if (i === plotFactors.x || i === plotFactors.y) return null;
                        return (
                          <div key={i} className="mb-4">
                            <div className="flex justify-between text-[10px] mb-1">
                              <span>{h}</span>
                              <span className="text-[#f97316]">{holdValues[i]?.toFixed(2)}</span>
                            </div>
                            <input
                              type="range"
                              min={Math.min(...data.map(r => r[i]))}
                              max={Math.max(...data.map(r => r[i]))}
                              step="0.01"
                              value={holdValues[i]}
                              onChange={e => {
                                const newHolds = [...holdValues];
                                newHolds[i] = Number(e.target.value);
                                setHoldValues(newHolds);
                              }}
                              className="w-full h-1 bg-[#222] rounded-lg appearance-none cursor-pointer accent-[#f97316]"
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center opacity-30">
              <Box size={40} className="mb-4" />
              <p className="text-xs">Select model type<br />to begin analysis</p>
            </div>
          )}
        </div>

        {/* Center: Visualization & Data */}
        <div className="flex-1 flex flex-col bg-[#050505] overflow-y-auto">
          {showDesignBuilder ? (
            <div className="flex-1 p-8 flex flex-col items-center justify-center">
              <div className="w-full max-w-2xl bg-[#0f0f0f] border border-[#222] rounded-2xl p-6 shadow-2xl space-y-6">
                <div>
                  <h3 className="text-lg font-black text-white uppercase tracking-tight">Create Taguchi Design</h3>
                  <p className="text-xs text-gray-500">Configure factors and levels to generate a coded Orthogonal Array worksheet.</p>
                </div>
                
                <div className="flex items-center gap-4 bg-[#141414] p-4 rounded-xl border border-[#222]">
                  <Label className="uppercase text-xs font-black tracking-widest text-[#f97316]">Number of Factors</Label>
                  <input 
                    type="number" 
                    min={2} 
                    max={15} 
                    value={builderNumFactors} 
                    onChange={handleBuilderNumFactorsChange}
                    className="w-20 bg-[#050505] border border-[#333] p-1.5 text-center rounded text-sm text-white"
                  />
                </div>

                <div className="max-h-60 overflow-y-auto border border-[#222] rounded-xl bg-[#0a0a0a] p-2 custom-scrollbar">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#222] text-[#666] uppercase">
                        <th className="p-2">Factor</th>
                        <th className="p-2">Name</th>
                        <th className="p-2">Levels</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#151515]">
                      {builderFactors.map((f, idx) => (
                        <tr key={idx}>
                          <td className="p-2 font-bold text-gray-400">Factor {idx + 1}</td>
                          <td className="p-1">
                            <input 
                              type="text" 
                              value={f.name} 
                              onChange={(e) => handleBuilderFactorNameChange(idx, e.target.value)}
                              className="bg-[#050505] border border-[#222] p-1.5 rounded text-white text-xs w-full focus:border-[#f97316] outline-none"
                            />
                          </td>
                          <td className="p-1">
                            <select 
                              value={f.levels} 
                              onChange={(e) => handleBuilderFactorLevelsChange(idx, Number(e.target.value))}
                              className="bg-[#050505] border border-[#222] p-1.5 rounded text-white text-xs w-full focus:border-[#f97316] outline-none"
                            >
                              <option value={2}>2 Levels</option>
                              <option value={3}>3 Levels</option>
                              <option value={4}>4 Levels</option>
                              <option value={5}>5 Levels</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {(() => {
                  const bestOA = findBestOA(builderFactors.map(f => f.levels));
                  return (
                    <div className="bg-[#1a1a1a] p-4 rounded-xl border border-[#222] flex justify-between items-center">
                      <div>
                        <div className="text-[10px] font-bold text-[#888] uppercase tracking-widest">Recommended Orthogonal Array</div>
                        <div className="text-sm font-black text-[#f97316] uppercase mt-1">
                          {bestOA ? bestOA.name : 'No compatible array found'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-bold text-[#888] uppercase tracking-widest">Worksheet Size</div>
                        <div className="text-sm font-black text-white mt-1">
                          {bestOA ? `${bestOA.runs} Runs` : '-'}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowDesignBuilder(false)}>Cancel</Button>
                  <Button 
                    variant="default"
                    disabled={!findBestOA(builderFactors.map(f => f.levels))}
                    onClick={handleGenerateDesign}
                  >
                    Generate Coded Worksheet
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {!results && activeModel === 'Taguchi' ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-400 space-y-4 min-h-[300px]">
                  <Database size={48} className="text-[#f97316] opacity-60" />
                  <div>
                    <h3 className="text-lg font-bold text-white">Taguchi Design of Experiments</h3>
                    <p className="text-xs max-w-sm mx-auto mt-1">Configure your factors and levels to generate a coded orthogonal design matrix, or paste your experimental data below.</p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setShowDesignBuilder(true)}
                    className="h-8 px-4 text-xs font-semibold bg-[#18181c] border-orange-500/30 text-orange-400 hover:bg-orange-500/20"
                  >
                    Create Taguchi Design Wizard
                  </Button>
                </div>
              ) : (
                <div className="flex-1 relative border-b border-[#222228] min-h-[300px]">
                  <div className="absolute top-4 left-4 z-10 flex bg-[#111114]/90 backdrop-blur border border-[#27272f] rounded-lg p-0.5 gap-1 shadow-lg">
                    {[
                      { id: 'surface', label: '3D Surface', show: true },
                      { id: 'contour', label: 'Contour', show: true },
                      { id: 'taguchi_main_sn', label: 'Main Effects (SN)', show: results?.type === 'Taguchi' },
                      { id: 'taguchi_main_mean', label: 'Main Effects (Means)', show: results?.type === 'Taguchi' },
                    ].filter(p => p.show).map(p => (
                      <button
                        key={p.id}
                        onClick={() => setPlotType(p.id as any)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                          plotType === p.id
                            ? 'bg-zinc-800 text-white shadow-sm font-semibold'
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <PlotlyPlots
                    type={plotType}
                    data={data}
                    results={results}
                    factors={plotFactors}
                    headers={headers}
                    holdValues={holdValues}
                    modelType={activeModel}
                  />
                </div>
              )}
            </>
          )}

          <div className="h-64 flex">
            <div className="flex-1 p-2">
              <ManualEntryTable data={data} headers={headers} onChange={(nd, nh) => { setData(nd); setHeaders(nh); }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ICON_LIBRARY = [
  {
    category: 'Cooking & Kitchen',
    icons: ['🍟', '💧', '🍞', '♨️', '🔥', '🍲', '☕', '🧫', '❄️', '🥘', '🌿', '⚡', '🍳', '🍕', '🍰', '🍖', '🍗', '🐟', '🍤', '🍿', '🥩', '🥦', '🍎', '🍚', '🥣', '🥫', '🧊', '🌡️']
  },
  {
    category: 'Controls & Power',
    icons: ['⏻', '▶', '⏸', '⏹', '🔁', '🔃', '⚙️', '🌀', '🎡', '💡', '🔌', '🔋', '🔔', '🔕', '🔊', '🚨', '🛑', '🔒', '🔓', '🛡️', '🔑', '⏱️', '⏰', '📅']
  },
  {
    category: 'Status & Indicators',
    icons: ['✅', '❌', '⚠️', 'ℹ️', '❓', '📶', '📡', '☁️', '🌐', '📈', '📉', '📊', '💬', '📣', '💎', '🚥', '🚦', '🚧']
  },
  {
    category: 'Miscellaneous',
    icons: ['✨', '🌟', '🍀', '🚀', '🔧', '🛢️', '🧪', '🔩', '🖥️', '📟']
  }
];

const EmojiPicker = ({
  onSelect,
  currentValue
}: {
  onSelect: (emoji: string) => void;
  currentValue: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative mt-1">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-8 px-2 bg-[#0a0a0a] border border-[#333] hover:border-[#f97316] rounded text-xs text-[#e0e0e0] flex items-center justify-between transition-colors"
      >
        <span className="truncate">Selected: {currentValue || 'None'}</span>
        <span className="text-[10px] text-gray-500 shrink-0">▼ Library</span>
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto bg-[#141414] border border-[#2d2d2d] rounded shadow-2xl p-2 font-sans text-xs">
          <div className="flex justify-between items-center mb-1.5 border-b border-[#2d2d2d] pb-1">
            <span className="text-gray-400 font-bold">Pick an Icon</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-gray-500 hover:text-white"
            >
              Close
            </button>
          </div>
          <div className="space-y-3">
            {ICON_LIBRARY.map((cat, catIdx) => (
              <div key={catIdx}>
                <div className="text-[9px] text-[#f97316] uppercase font-bold tracking-wider mb-1">
                  {cat.category}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {cat.icons.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        onSelect(emoji);
                        setIsOpen(false);
                      }}
                      className={`h-7 flex items-center justify-center rounded text-base hover:bg-[#333] transition-colors ${
                        currentValue === emoji ? 'bg-[#f97316]/20 border border-[#f97316]/50' : 'bg-[#0a0a0a] border border-[#222]'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const HmiDashboardContent = ({
  variables,
  components,
  setComponents,
  updateVariable,
  onClose
}: {
  variables: VariableDef[];
  components: HmiComponent[];
  setComponents: React.Dispatch<React.SetStateAction<HmiComponent[]>>;
  updateVariable: (id: string, value: string) => void;
  onClose: () => void;
}) => {
  const [editMode, setEditMode] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [resizeStart, setResizeStart] = useState<{ x: number, y: number, w: number, h: number, mx: number, my: number } | null>(null);

  const addComponent = (type: HmiComponentType) => {
    const newComp: HmiComponent = {
      id: uuidv4(),
      type,
      name: `${type}_${components.length + 1}`,
      x: 50 + (components.length * 20) % 300,
      y: 50 + (components.length * 20) % 300,
      width: type === 'slider' ? 150 : type === 'lcd' ? 120 : (type === 'rotary' || type === 'gauge' || type === 'hybrid-rotary' || type === 'buzzer') ? 80 : type === 'oled' ? 240 : type === 'encoder' ? 120 : type === 'mode-selector' ? 320 : type === 'mode-icon' ? 55 : 80,
      height: type === 'slider' ? 40 : (type === 'rotary' || type === 'gauge' || type === 'hybrid-rotary' || type === 'buzzer') ? 80 : type === 'oled' ? 180 : type === 'encoder' ? 150 : type === 'mode-selector' ? 90 : type === 'mode-icon' ? 55 : 60,
      variableId: null,
      min: 0,
      max: 100,
      variableIds: type === 'rotary' ? [] : undefined,
      hybridValues: type === 'hybrid-rotary' ? ['0', '1', '2'] : undefined,
      icon: type === 'button' ? 'none' : undefined,
      color: (type === 'button' || type === 'led' || type === 'lamp') ? 'orange' : undefined,
      iconEmoji: type === 'mode-icon' ? '🍟' : undefined,
      targetValue: type === 'mode-icon' ? '0' : undefined
    };
    setComponents(prev => [...prev, newComp]);
    setSelectedId(newComp.id);
  };

  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    if (!editMode) return;
    e.stopPropagation();
    setSelectedId(id);
    setIsDragging(true);
    const comp = components.find(c => c.id === id);
    if (comp) {
      setDragOffset({ x: e.clientX - comp.x, y: e.clientY - comp.y });
    }
  };

  const handleResizeMouseDown = (e: React.MouseEvent, handle: string, id: string) => {
    e.stopPropagation();
    const comp = components.find(c => c.id === id);
    if (comp) {
      setIsResizing(true);
      setResizeHandle(handle);
      setResizeStart({ x: comp.x, y: comp.y, w: comp.width, h: comp.height, mx: e.clientX, my: e.clientY });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isResizing && resizeStart && resizeHandle && selectedId) {
      const dx = e.clientX - resizeStart.mx;
      const dy = e.clientY - resizeStart.my;

      let newX = resizeStart.x;
      let newY = resizeStart.y;
      let newW = resizeStart.w;
      let newH = resizeStart.h;

      if (resizeHandle.includes('e')) newW = Math.max(20, resizeStart.w + dx);
      if (resizeHandle.includes('s')) newH = Math.max(20, resizeStart.h + dy);
      if (resizeHandle.includes('w')) {
        const delta = Math.min(resizeStart.w - 20, dx);
        newX = resizeStart.x + delta;
        newW = resizeStart.w - delta;
      }
      if (resizeHandle.includes('n')) {
        const delta = Math.min(resizeStart.h - 20, dy);
        newY = resizeStart.y + delta;
        newH = resizeStart.h - delta;
      }

      setComponents(prev => prev.map(c => c.id === selectedId ? { ...c, x: newX, y: newY, width: newW, height: newH } : c));
      return;
    }

    if (isDragging && selectedId && editMode) {
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;
      setComponents(prev => prev.map(c => c.id === selectedId ? { ...c, x: newX, y: newY } : c));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setIsResizing(false);
    setResizeHandle(null);
    setResizeStart(null);
  };

  const renderComponent = (comp: HmiComponent) => {
    const variable = variables.find(v => v.id === comp.variableId);
    const value = variable ? variable.currentValue : 0;
    const numValue = typeof value === 'number' ? value : (value ? 1 : 0);
    const boolValue = !!value;

    const commonStyle = `absolute border ${selectedId === comp.id && editMode ? 'border-[#f97316] z-10' : 'border-[#333]'} bg-[#1a1a1a] rounded flex flex-col items-center justify-center overflow-hidden select-none`;

    return (
      <div
        key={comp.id}
        style={{ left: comp.x, top: comp.y, width: comp.width, height: comp.height }}
        className={commonStyle}
        onMouseDown={(e) => handleMouseDown(e, comp.id)}
        onClick={(e) => e.stopPropagation()}
      >
        {selectedId === comp.id && editMode && (
          <>
            {['nw', 'ne', 'sw', 'se'].map(h => (
              <div
                key={h}
                className={`absolute w-2 h-2 bg-[#f97316] border border-black z-20 ${h === 'nw' ? 'top-0 left-0 cursor-nw-resize' : h === 'ne' ? 'top-0 right-0 cursor-ne-resize' : h === 'sw' ? 'bottom-0 left-0 cursor-sw-resize' : 'bottom-0 right-0 cursor-se-resize'}`}
                onMouseDown={(e) => handleResizeMouseDown(e, h, comp.id)}
              />
            ))}
          </>
        )}
        {/* Component Content */}
        <div className="flex-1 flex items-center justify-center w-full p-2">
          {comp.type === 'toggle' && (
            <div
              className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors ${boolValue ? 'bg-[#f97316]' : 'bg-[#333]'}`}
              onClick={() => !editMode && variable && updateVariable(variable.id, (!boolValue).toString())}
            >
              <div className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform ${boolValue ? 'translate-x-6' : 'translate-x-0'}`} />
            </div>
          )}
          {comp.type === 'button' && (() => {
            const btnTheme = comp.color || 'orange';
            const colorMap = {
              orange: { bg: 'bg-[#ea580c]/20 hover:bg-[#ea580c]/30 text-[#f97316] border-[#ea580c]/50 active:bg-[#ea580c]/40', activeBg: 'bg-[#ea580c] text-white border-[#f97316] shadow-[0_0_12px_rgba(249,115,22,0.4)]' },
              green: { bg: 'bg-[#166534]/20 hover:bg-[#166534]/30 text-[#22c55e] border-[#166534]/50 active:bg-[#166534]/40', activeBg: 'bg-[#22c55e] text-black border-[#4ade80] shadow-[0_0_12px_rgba(34,197,94,0.4)]' },
              red: { bg: 'bg-[#991b1b]/20 hover:bg-[#991b1b]/30 text-[#ef4444] border-[#991b1b]/50 active:bg-[#991b1b]/40', activeBg: 'bg-[#ef4444] text-white border-[#f87171] shadow-[0_0_12px_rgba(239,68,68,0.4)]' },
              blue: { bg: 'bg-[#075985]/20 hover:bg-[#075985]/30 text-[#38bdf8] border-[#075985]/50 active:bg-[#075985]/40', activeBg: 'bg-[#0284c7] text-white border-[#38bdf8] shadow-[0_0_12px_rgba(56,189,248,0.4)]' },
              yellow: { bg: 'bg-[#854d0e]/20 hover:bg-[#854d0e]/30 text-[#eab308] border-[#854d0e]/50 active:bg-[#854d0e]/40', activeBg: 'bg-[#eab308] text-black border-[#facc15] shadow-[0_0_12px_rgba(234,179,8,0.4)]' },
              grey: { bg: 'bg-[#333]/40 hover:bg-[#444]/40 text-[#ccc] border-[#444] active:bg-[#555]/40', activeBg: 'bg-[#555] text-white border-[#666] shadow-[0_0_12px_rgba(255,255,255,0.1)]' }
            };
            const currentTheme = colorMap[btnTheme] || colorMap.orange;

            const renderButtonIcon = () => {
              if (comp.icon === 'power') return <span className="mr-1">⏻</span>;
              if (comp.icon === 'play') return <span className="mr-1">▶</span>;
              if (comp.icon === 'light') return <span className="mr-1">💡</span>;
              return null;
            };

            return (
              <button
                className={`w-full h-full rounded border font-bold text-[10px] tracking-wider uppercase transition-all duration-150 flex items-center justify-center ${
                  boolValue ? currentTheme.activeBg : currentTheme.bg
                }`}
                onMouseDown={() => !editMode && variable && updateVariable(variable.id, 'true')}
                onMouseUp={() => !editMode && variable && updateVariable(variable.id, 'false')}
                onMouseLeave={() => !editMode && variable && updateVariable(variable.id, 'false')}
              >
                {renderButtonIcon()}
                {comp.name}
              </button>
            );
          })()}
          {comp.type === 'lamp' && (() => {
            const lampColor = comp.color || 'green';
            const colorClasses = {
              red: boolValue ? 'bg-red-500/20 border-red-500 shadow-[inset_0_0_10px_rgba(239,68,68,0.5),0_0_15px_rgba(239,68,68,0.6)]' : 'bg-[#222] border-[#444]',
              green: boolValue ? 'bg-green-500/20 border-green-500 shadow-[inset_0_0_10px_rgba(34,197,94,0.5),0_0_15px_rgba(34,197,94,0.6)]' : 'bg-[#222] border-[#444]',
              blue: boolValue ? 'bg-[#4db8ff]/20 border-[#4db8ff] shadow-[inset_0_0_10px_rgba(77,184,255,0.5),0_0_15px_rgba(77,184,255,0.6)]' : 'bg-[#222] border-[#444]',
              yellow: boolValue ? 'bg-[#e8a020]/20 border-[#e8a020] shadow-[inset_0_0_10px_rgba(232,160,32,0.5),0_0_15px_rgba(232,160,32,0.6)]' : 'bg-[#222] border-[#444]',
              orange: boolValue ? 'bg-[#f97316]/20 border-[#f97316] shadow-[inset_0_0_10px_rgba(249,115,22,0.5),0_0_15px_rgba(249,115,22,0.6)]' : 'bg-[#222] border-[#444]',
              grey: boolValue ? 'bg-white/20 border-white shadow-[inset_0_0_10px_rgba(255,255,255,0.5),0_0_15px_rgba(255,255,255,0.6)]' : 'bg-[#222] border-[#444]'
            };
            return <div className={`w-10 h-10 rounded-full border-2 transition-all duration-200 ${colorClasses[lampColor] || colorClasses.green}`} />;
          })()}
          {comp.type === 'led' && (() => {
            const ledColor = comp.color || 'red';
            const colorClasses = {
              red: boolValue ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]' : 'bg-[#333]',
              green: boolValue ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)]' : 'bg-[#333]',
              blue: boolValue ? 'bg-[#4db8ff] shadow-[0_0_10px_rgba(77,184,255,0.8)]' : 'bg-[#333]',
              yellow: boolValue ? 'bg-[#e8a020] shadow-[0_0_10px_rgba(232,160,32,0.8)]' : 'bg-[#333]',
              orange: boolValue ? 'bg-[#f97316] shadow-[0_0_10px_rgba(249,115,22,0.8)]' : 'bg-[#333]',
              grey: boolValue ? 'bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]' : 'bg-[#333]'
            };
            return <div className={`w-4 h-4 rounded-full transition-all duration-200 ${colorClasses[ledColor] || colorClasses.red}`} />;
          })()}
          {comp.type === 'slider' && (
            <input
              type="range"
              min={comp.min ?? 0}
              max={comp.max ?? 100}
              value={numValue}
              onChange={(e) => !editMode && variable && updateVariable(variable.id, e.target.value)}
              className="w-full accent-[#f97316]"
              disabled={editMode}
            />
          )}
          {comp.type === 'input' && (
            <input
              type="number"
              value={numValue}
              onChange={(e) => !editMode && variable && updateVariable(variable.id, e.target.value)}
              className="w-full bg-[#0a0a0a] border border-[#333] rounded px-2 py-1 text-right text-[#f97316] font-mono"
              disabled={editMode}
            />
          )}
          {comp.type === 'lcd' && (
            <div className="w-full h-full bg-[#0a0a0a] border border-[#333] flex items-center justify-end px-2 font-mono text-green-500 text-lg">
              {typeof value === 'number' ? value.toFixed(2) : String(value)}
            </div>
          )}
          {comp.type === 'gauge' && (
            <div className="relative w-full h-full flex items-center justify-center">
              <svg viewBox="0 0 100 50" className="w-full h-full">
                <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#333" strokeWidth="10" />
                <path
                  d="M 10 50 A 40 40 0 0 1 90 50"
                  fill="none"
                  stroke="#f97316"
                  strokeWidth="10"
                  strokeDasharray={`${((numValue - (comp.min || 0)) / ((comp.max || 100) - (comp.min || 0))) * 126} 126`}
                />
                <text x="50" y="45" textAnchor="middle" fill="#fff" fontSize="12">{numValue.toFixed(0)}</text>
              </svg>
            </div>
          )}
          {comp.type === 'rotary' && (() => {
            const isMultiVar = comp.variableIds && comp.variableIds.length > 0;

            if (isMultiVar) {
              const positions = comp.variableIds!.length;
              const stepAngle = 270 / (Math.max(1, positions - 1));

              // Determine current index based on variables
              let currentIndex = 0;
              comp.variableIds!.forEach((vid, idx) => {
                if (!vid) return;
                const v = variables.find(v => v.id === vid);
                // Check for truthy value (true or > 0)
                if (v && (v.currentValue === true || Number(v.currentValue) > 0)) {
                  currentIndex = idx;
                }
              });

              const angle = -135 + currentIndex * stepAngle;

              const handleRotaryMouseDown = (e: React.MouseEvent) => {
                if (editMode) return;
                e.stopPropagation();

                const rect = e.currentTarget.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;

                const updateFromEvent = (ev: { clientX: number, clientY: number }) => {
                  const angleRad = Math.atan2(ev.clientY - centerY, ev.clientX - centerX);
                  let deg = angleRad * 180 / Math.PI;

                  // Rotate so -135 becomes 0.
                  let effectiveAngle = deg + 135;
                  if (effectiveAngle < 0) effectiveAngle += 360;

                  // Clamping to 0-270 range
                  if (effectiveAngle > 270) {
                    if (effectiveAngle > 315) effectiveAngle = 0;
                    else effectiveAngle = 270;
                  }

                  const index = Math.round(effectiveAngle / stepAngle);
                  const clampedIndex = Math.max(0, Math.min(positions - 1, index));

                  if (clampedIndex !== currentIndex) {
                    // Update variables
                    comp.variableIds!.forEach((vid, idx) => {
                      if (!vid) return;
                      updateVariable(vid, idx === clampedIndex ? '1' : '0');
                    });
                  }
                };

                updateFromEvent(e);

                const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
                  updateFromEvent(moveEvent);
                };

                const handleMouseUp = () => {
                  document.body.style.cursor = 'default';
                  document.removeEventListener('mousemove', handleMouseMove);
                  document.removeEventListener('mouseup', handleMouseUp);
                };

                document.body.style.cursor = 'grabbing';
                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
              };

              const posText = `Pos ${currentIndex + 1}`;

              return (
                <div className="relative w-full h-full flex items-center justify-center" onMouseDown={handleRotaryMouseDown} style={{ cursor: editMode ? 'default' : 'pointer' }}>
                  <svg viewBox="0 0 100 100" className="w-full h-full">
                    <defs><radialGradient id="grad-rotary"><stop offset="0%" stopColor="#555" /><stop offset="90%" stopColor="#222" /><stop offset="100%" stopColor="#1a1a1a" /></radialGradient></defs>
                    <circle cx="50" cy="50" r="40" fill="url(#grad-rotary)" stroke="#1a1a1a" strokeWidth="2" />
                    {/* Ticks */}
                    {Array.from({ length: positions }).map((_, i) => (
                      <line key={i} x1="50" y1="10" x2="50" y2="15" stroke={i === currentIndex ? "#f97316" : "#888"} strokeWidth={i === currentIndex ? 3 : 2} transform={`rotate(${-135 + i * stepAngle} 50 50)`} />
                    ))}
                    <g transform={`rotate(${angle} 50 50)`}>
                      <circle cx="50" cy="20" r="4" fill="#f97316" />
                      <line x1="50" y1="20" x2="50" y2="50" stroke="#f97316" strokeWidth="2" />
                    </g>
                  </svg>
                  <div className="absolute bottom-1 text-[9px] text-white font-mono select-none">{posText}</div>
                </div>
              );
            }

            const min = comp.min ?? 0;
            const max = comp.max ?? 100;
            const range = max - min;
            const value = Math.max(min, Math.min(max, numValue));
            const percentage = range === 0 ? 0 : (value - min) / range;
            const angle = -135 + percentage * 270; // from -135 to 135 degrees

            const handleRotaryMouseDown = (e: React.MouseEvent) => {
              if (editMode || !variable) return;
              e.stopPropagation();

              const rect = e.currentTarget.getBoundingClientRect();
              const centerX = rect.left + rect.width / 2;
              const centerY = rect.top + rect.height / 2;
              const startAngleRad = Math.atan2(e.clientY - centerY, e.clientX - centerX);

              const startValue = value;
              document.body.style.cursor = 'grabbing';

              const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
                const currentAngleRad = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX);
                let angleDiff = currentAngleRad - startAngleRad;

                if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

                const valueChange = (angleDiff / (270 * Math.PI / 180)) * range;
                let newValue = startValue + valueChange;
                newValue = Math.max(min, Math.min(max, newValue));

                updateVariable(variable.id, newValue.toString());
              };

              const handleMouseUp = () => {
                document.body.style.cursor = 'default';
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
              };

              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);
            };

            return (
              <div className="relative w-full h-full flex items-center justify-center" onMouseDown={handleRotaryMouseDown} style={{ cursor: editMode ? 'default' : 'grab' }}>
                <svg viewBox="0 0 100 100" className="w-full h-full">
                  <defs><radialGradient id="grad-rotary"><stop offset="0%" stopColor="#555" /><stop offset="90%" stopColor="#222" /><stop offset="100%" stopColor="#1a1a1a" /></radialGradient></defs>
                  <circle cx="50" cy="50" r="40" fill="url(#grad-rotary)" stroke="#1a1a1a" strokeWidth="2" />
                  {Array.from({ length: 11 }).map((_, i) => <line key={i} x1="50" y1="10" x2="50" y2="15" stroke="#888" strokeWidth="2" transform={`rotate(${-135 + i * 27} 50 50)`} />)}
                  <g transform={`rotate(${angle} 50 50)`}><circle cx="50" cy="20" r="4" fill="#f97316" /></g>
                </svg>
                <div className="absolute text-xs text-white font-mono select-none">{value.toFixed(1)}</div>
              </div>
            );
          })()}
          {comp.type === 'hybrid-rotary' && (
            <HybridRotary
              comp={comp}
              variable={variable}
              updateVariable={updateVariable}
              editMode={editMode}
            />
          )}
          {comp.type === 'buzzer' && (
            <Buzzer comp={comp} variable={variable} editMode={editMode} />
          )}
          {comp.type === 'oled' && (
            <OledDisplay
              comp={comp}
              variables={variables}
              editMode={editMode}
            />
          )}
          {comp.type === 'encoder' && (
            <Encoder
              comp={comp}
              variables={variables}
              updateVariable={updateVariable}
              editMode={editMode}
            />
          )}
          {comp.type === 'mode-selector' && (
            <ModeSelector
              comp={comp}
              variables={variables}
              updateVariable={updateVariable}
              editMode={editMode}
            />
          )}
          {comp.type === 'mode-icon' && (() => {
            const isSelected = variable && String(variable.currentValue) === String(comp.targetValue);
            let borderClass = 'border-[#222]';
            let bgClass = 'bg-[#1a1a20]';
            let glowStyle = {};

            if (isSelected) {
              borderClass = 'border-[#f97316]';
              bgClass = 'bg-[#f97316]/10';
              glowStyle = { boxShadow: '0 0 8px rgba(249,115,22,0.4)' };
            }

            const handleClick = () => {
              if (editMode || !variable) return;
              updateVariable(variable.id, (comp.targetValue ?? '0').toString());
            };

            return (
              <div
                onClick={handleClick}
                style={glowStyle}
                className={`w-full h-full border rounded flex flex-col items-center justify-center cursor-pointer p-1 transition-all active:scale-95 ${borderClass} ${bgClass}`}
              >
                <span className="text-xl leading-none">{comp.iconEmoji || '✨'}</span>
                <span className="text-[8px] text-[#ccc] font-medium truncate w-full text-center mt-1">{comp.name}</span>
              </div>
            );
          })()}
        </div>
        {/* Label */}
        <div className="w-full bg-[#1a1a1a] text-[9px] text-center text-[#888] py-0.5 truncate px-1">
          {comp.name} {variable ? `(${variable.name})` : '(unbound)'}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#1a1a1a]" onMouseUp={handleMouseUp} onMouseMove={handleMouseMove}>
      <div className="h-10 flex items-center px-4 border-b border-[#222] justify-between bg-[#1a1a1a] shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex bg-[#0a0a0a] rounded p-0.5 border border-[#333]">
            <button onClick={() => setEditMode(true)} className={"px-3 py-1 text-xs rounded " + (editMode ? "bg-[#333] text-white" : "text-[#888]")}>Edit</button>
            <button onClick={() => { setEditMode(false); setSelectedId(null); }} className={"px-3 py-1 text-xs rounded " + (!editMode ? "bg-[#f97316] text-black font-bold" : "text-[#888]")}>Run</button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar (Edit Mode Only) */}
        {editMode && (
          <div
            className="w-48 bg-[#1a1a1a] border-r border-[#222] p-3 flex flex-col gap-3 overflow-y-auto"
            onMouseDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
          >
            <Label>Components</Label>
            <div className="grid grid-cols-2 gap-2">
              {['toggle', 'button', 'slider', 'input', 'lamp', 'led', 'lcd', 'gauge', 'rotary', 'hybrid-rotary', 'buzzer', 'oled', 'encoder', 'mode-selector', 'mode-icon'].map(t => (
                <button key={t} onClick={() => addComponent(t as HmiComponentType)} className="flex flex-col items-center justify-center p-2 bg-[#1a1a1a] border border-[#333] rounded hover:bg-[#222] hover:border-[#f97316]">
                  <span className="text-[10px] capitalize text-[#ccc]">{t}</span>
                </button>
              ))}
            </div>

            <Separator />

            {selectedId ? (
              <div className="space-y-3">
                <Label>Properties</Label>
                {(() => {
                  const comp = components.find(c => c.id === selectedId);
                  if (!comp) return null;
                  return (
                    <>
                      <div><Label>Name</Label><Input value={comp.name} onChange={e => setComponents(prev => prev.map(c => c.id === comp.id ? { ...c, name: e.target.value } : c))} /></div>
                      <div>
                        <Label>Variable</Label>
                        <select
                          value={comp.variableId || ''}
                          onChange={e => setComponents(prev => prev.map(c => c.id === comp.id ? { ...c, variableId: e.target.value || null } : c))}
                          className="w-full h-8 bg-[#0a0a0a] border border-[#333] rounded px-2 text-xs text-[#e0e0e0] mt-1"
                        >
                          <option value="">-- Unbound --</option>
                          {variables.map(v => <option key={v.id} value={v.id}>{v.name} ({v.type})</option>)}
                        </select>
                      </div>

                      {(comp.type === 'button' || comp.type === 'led' || comp.type === 'lamp') && (
                        <div className="space-y-2 mt-2">
                          <div>
                            <Label>Color / Theme</Label>
                            <select
                              value={comp.color || 'orange'}
                              onChange={e => setComponents(prev => prev.map(c => c.id === comp.id ? { ...c, color: e.target.value as any } : c))}
                              className="w-full h-8 bg-[#0a0a0a] border border-[#333] rounded px-2 text-xs text-[#e0e0e0] mt-1"
                            >
                              <option value="orange">Orange</option>
                              <option value="green">Green</option>
                              <option value="red">Red</option>
                              <option value="blue">Blue</option>
                              <option value="yellow">Yellow</option>
                              <option value="grey">Grey</option>
                            </select>
                          </div>
                          {comp.type === 'button' && (
                            <div>
                              <Label>Button Icon</Label>
                              <select
                                value={comp.icon || 'none'}
                                onChange={e => setComponents(prev => prev.map(c => c.id === comp.id ? { ...c, icon: e.target.value as any } : c))}
                                className="w-full h-8 bg-[#0a0a0a] border border-[#333] rounded px-2 text-xs text-[#e0e0e0] mt-1"
                              >
                                <option value="none">None</option>
                                <option value="power">Power (⏻)</option>
                                <option value="play">Play/Pause (▶)</option>
                                <option value="light">Light (💡)</option>
                              </select>
                            </div>
                          )}
                        </div>
                      )}

                      {comp.type === 'encoder' && (
                        <div className="space-y-2 mt-2">
                          <div>
                            <Label>Button Press Bind (GPIO)</Label>
                            <select
                              value={comp.pressVariableId || ''}
                              onChange={e => setComponents(prev => prev.map(c => c.id === comp.id ? { ...c, pressVariableId: e.target.value || null } : c))}
                              className="w-full h-8 bg-[#0a0a0a] border border-[#333] rounded px-2 text-xs text-[#e0e0e0] mt-1"
                            >
                              <option value="">-- Unbound --</option>
                              {variables.map(v => <option key={v.id} value={v.id}>{v.name} ({v.type})</option>)}
                            </select>
                          </div>
                          <div className="space-y-2 border-t border-[#333] pt-2 mt-2">
                            <Label>Encoder Values (Discrete Mode)</Label>
                            {(comp.encoderValues || []).map((val, idx) => (
                              <div key={idx} className="flex gap-1">
                                <Input
                                  value={val}
                                  onChange={e => setComponents(prev => prev.map(c => c.id === comp.id ? { ...c, encoderValues: (c.encoderValues || []).map((v, i) => i === idx ? e.target.value : v) } : c))}
                                  className="flex-1 h-6 text-[10px]"
                                />
                                <button
                                  type="button"
                                  onClick={() => setComponents(prev => prev.map(c => c.id === comp.id ? { ...c, encoderValues: (c.encoderValues || []).filter((_, i) => i !== idx) } : c))}
                                  className="text-[#666] hover:text-red-400 px-1"
                                >×</button>
                              </div>
                            ))}
                            <Button size="sm" variant="secondary" className="w-full h-6 text-[10px]" onClick={() => setComponents(prev => prev.map(c => c.id === comp.id ? { ...c, encoderValues: [...(c.encoderValues || []), '0'] } : c))}>+ Add Value</Button>
                          </div>
                        </div>
                      )}

                      {comp.type === 'mode-selector' && (
                        <div className="space-y-2 mt-2">
                          <Label>Cursor Variable (Index)</Label>
                          <select
                            value={comp.cursorVariableId || ''}
                            onChange={e => setComponents(prev => prev.map(c => c.id === comp.id ? { ...c, cursorVariableId: e.target.value || null } : c))}
                            className="w-full h-8 bg-[#0a0a0a] border border-[#333] rounded px-2 text-xs text-[#e0e0e0] mt-1"
                          >
                            <option value="">-- Unbound --</option>
                            {variables.map(v => <option key={v.id} value={v.id}>{v.name} ({v.type})</option>)}
                          </select>
                        </div>
                      )}

                      {comp.type === 'mode-icon' && (
                        <div className="space-y-2 mt-2">
                          <div>
                            <Label>Icon (Emoji)</Label>
                            <Input
                              value={comp.iconEmoji || ''}
                              onChange={e => setComponents(prev => prev.map(c => c.id === comp.id ? { ...c, iconEmoji: e.target.value } : c))}
                              placeholder="e.g. 🍟"
                              className="mt-1"
                            />
                            <EmojiPicker
                              currentValue={comp.iconEmoji || ''}
                              onSelect={emoji => setComponents(prev => prev.map(c => c.id === comp.id ? { ...c, iconEmoji: emoji } : c))}
                            />
                          </div>
                          <div>
                            <Label>Target Value</Label>
                            <Input
                              value={comp.targetValue || ''}
                              onChange={e => setComponents(prev => prev.map(c => c.id === comp.id ? { ...c, targetValue: e.target.value } : c))}
                              placeholder="e.g. 0, 1, or Air Fry"
                              className="mt-1"
                            />
                          </div>
                        </div>
                      )}

                      {comp.type === 'oled' && (
                        <div className="space-y-2 mt-2 border-t border-[#333] pt-2 max-h-60 overflow-y-auto pr-1">
                          <Label>Display Variable Mapping</Label>
                          {[
                            { label: 'Mode Index/Text', key: 'oledModeVarId' },
                            { label: 'Temp', key: 'oledTempVarId' },
                            { label: 'Time', key: 'oledTimeVarId' },
                            { label: 'State (e.g. HOME)', key: 'oledStateVarId' },
                            { label: 'Steam Active (Bool)', key: 'oledSteamVarId' },
                            { label: 'Heat Active (Bool)', key: 'oledHeatVarId' },
                            { label: 'Fan Active (Bool)', key: 'oledFanVarId' },
                            { label: 'Light Active (Bool)', key: 'oledLightVarId' },
                            { label: 'Duo Active (Bool)', key: 'oledDuoVarId' },
                            { label: 'Progress (0-100)', key: 'oledProgressVarId' }
                          ].map(mapping => (
                            <div key={mapping.key} className="mt-1">
                              <span className="text-[10px] text-gray-400">{mapping.label}</span>
                              <select
                                value={(comp as any)[mapping.key] || ''}
                                onChange={e => setComponents(prev => prev.map(c => c.id === comp.id ? { ...c, [mapping.key]: e.target.value || null } : c))}
                                className="w-full h-7 bg-[#0a0a0a] border border-[#333] rounded px-1.5 text-[10px] text-[#e0e0e0] mt-0.5"
                              >
                                <option value="">-- Unbound --</option>
                                {variables.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                              </select>
                            </div>
                          ))}
                          <div className="mt-2 border-t border-[#222] pt-2">
                            <Label>Screen Title</Label>
                            <Input
                              value={comp.oledTitle || ''}
                              onChange={e => setComponents(prev => prev.map(c => c.id === comp.id ? { ...c, oledTitle: e.target.value } : c))}
                              placeholder="e.g. MAIN PANEL"
                              className="mt-1"
                            />
                          </div>
                          <div className="mt-2 border-t border-[#222] pt-2">
                            <Label>Mode Names (comma-separated)</Label>
                            <textarea
                              value={comp.oledModeNames || ''}
                              onChange={e => setComponents(prev => prev.map(c => c.id === comp.id ? { ...c, oledModeNames: e.target.value } : c))}
                              placeholder="AIR FRYER, STEAMER, OVEN, ..."
                              className="w-full min-h-[50px] bg-[#0a0a0a] border border-[#333] rounded p-1.5 text-xs text-[#e0e0e0] font-mono mt-1"
                            />
                          </div>
                          <div className="space-y-2 mt-2 pt-2 border-t border-[#222]">
                            <Label>Custom Status Indicators (Max 8)</Label>
                            {(comp.oledIndicatorEmojis || []).map((emoji, idx) => (
                              <div key={idx} className="flex flex-col gap-1 p-1.5 bg-[#111] border border-[#222] rounded mt-1">
                                <div className="flex gap-1 items-center justify-between">
                                  <span className="text-[10px] text-gray-400 font-bold">Indicator #{idx + 1}</span>
                                  <button
                                    onClick={() => setComponents(prev => prev.map(c => c.id === comp.id ? {
                                      ...c,
                                      oledIndicatorEmojis: (c.oledIndicatorEmojis || []).filter((_, i) => i !== idx),
                                      oledIndicatorVarIds: (c.oledIndicatorVarIds || []).filter((_, i) => i !== idx),
                                      oledIndicatorLabels: (c.oledIndicatorLabels || []).filter((_, i) => i !== idx)
                                    } : c))}
                                    className="text-[#888] hover:text-red-400 text-xs px-1"
                                  >
                                    Remove
                                  </button>
                                </div>
                                <div className="grid grid-cols-2 gap-1 mt-1">
                                  <div>
                                    <span className="text-[8px] text-gray-500">Emoji/Icon</span>
                                    <Input
                                      value={emoji}
                                      onChange={e => setComponents(prev => prev.map(c => c.id === comp.id ? {
                                        ...c,
                                        oledIndicatorEmojis: (c.oledIndicatorEmojis || []).map((v, i) => i === idx ? e.target.value : v)
                                      } : c))}
                                      className="h-6 text-[10px] px-1"
                                    />
                                    <EmojiPicker
                                      currentValue={emoji}
                                      onSelect={emojiVal => setComponents(prev => prev.map(c => c.id === comp.id ? {
                                        ...c,
                                        oledIndicatorEmojis: (c.oledIndicatorEmojis || []).map((v, i) => i === idx ? emojiVal : v)
                                      } : c))}
                                    />
                                  </div>
                                  <div>
                                    <span className="text-[8px] text-gray-500">Label</span>
                                    <Input
                                      value={comp.oledIndicatorLabels?.[idx] || ''}
                                      onChange={e => setComponents(prev => prev.map(c => c.id === comp.id ? {
                                        ...c,
                                        oledIndicatorLabels: Array.from({ length: Math.max(c.oledIndicatorLabels?.length || 0, idx + 1) }, (_, i) => i === idx ? e.target.value : (c.oledIndicatorLabels?.[i] || ''))
                                      } : c))}
                                      className="h-6 text-[10px] px-1"
                                      placeholder="e.g. Steam"
                                    />
                                  </div>
                                </div>
                                <div className="mt-1">
                                  <span className="text-[8px] text-gray-500">Bind Variable</span>
                                  <select
                                    value={comp.oledIndicatorVarIds?.[idx] || ''}
                                    onChange={e => setComponents(prev => prev.map(c => c.id === comp.id ? {
                                      ...c,
                                      oledIndicatorVarIds: Array.from({ length: Math.max(c.oledIndicatorVarIds?.length || 0, idx + 1) }, (_, i) => i === idx ? (e.target.value || null) : (c.oledIndicatorVarIds?.[i] || null))
                                    } : c))}
                                    className="w-full h-6 bg-[#0a0a0a] border border-[#333] rounded px-1 text-[10px] text-[#e0e0e0]"
                                  >
                                    <option value="">-- Unbound --</option>
                                    {variables.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                  </select>
                                </div>
                              </div>
                            ))}
                            {((comp.oledIndicatorEmojis || []).length < 8) && (
                              <Button
                                size="sm"
                                variant="secondary"
                                className="w-full h-6 text-[10px] mt-1"
                                onClick={() => setComponents(prev => prev.map(c => c.id === comp.id ? {
                                  ...c,
                                  oledIndicatorEmojis: [...(c.oledIndicatorEmojis || []), '💡'],
                                  oledIndicatorVarIds: [...(c.oledIndicatorVarIds || []), null],
                                  oledIndicatorLabels: [...(c.oledIndicatorLabels || []), 'Status']
                                } : c))}
                              >
                                + Add Custom Indicator
                              </Button>
                            )}
                          </div>
                        </div>
                      )}

                      {comp.type === 'rotary' && (
                        <div className="space-y-2 border-t border-[#333] pt-2 mt-2">
                          <Label>Multi-Variable Mode (Max 5)</Label>
                          {(comp.variableIds || []).map((vid, idx) => (
                            <div key={idx} className="flex gap-1">
                              <select
                                value={vid || ''}
                                onChange={e => setComponents(prev => prev.map(c => c.id === comp.id ? { ...c, variableIds: (c.variableIds || []).map((v, i) => i === idx ? e.target.value : v) } : c))}
                                className="flex-1 h-6 bg-[#0a0a0a] border border-[#333] rounded px-1 text-[10px] text-[#e0e0e0]"
                              >
                                <option value="">-- Select --</option>
                                {variables.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                              </select>
                              <button
                                onClick={() => setComponents(prev => prev.map(c => c.id === comp.id ? { ...c, variableIds: (c.variableIds || []).filter((_, i) => i !== idx) } : c))}
                                className="text-[#666] hover:text-red-400 px-1"
                              >×</button>
                            </div>
                          ))}
                          {(comp.variableIds?.length || 0) < 5 && (
                            <Button size="sm" variant="secondary" className="w-full h-6 text-[10px]" onClick={() => setComponents(prev => prev.map(c => c.id === comp.id ? { ...c, variableIds: [...(c.variableIds || []), ''] } : c))}>+ Add Position</Button>
                          )}
                        </div>
                      )}

                      {comp.type === 'hybrid-rotary' && (
                        <div className="space-y-2 border-t border-[#333] pt-2 mt-2">
                          <Label>Hybrid Values</Label>
                          {(comp.hybridValues || []).map((val, idx) => (
                            <div key={idx} className="flex gap-1">
                              <Input
                                value={val}
                                onChange={e => setComponents(prev => prev.map(c => c.id === comp.id ? { ...c, hybridValues: (c.hybridValues || []).map((v, i) => i === idx ? e.target.value : v) } : c))}
                                className="flex-1 h-6 text-[10px]"
                              />
                              <button
                                onClick={() => setComponents(prev => prev.map(c => c.id === comp.id ? { ...c, hybridValues: (c.hybridValues || []).filter((_, i) => i !== idx) } : c))}
                                className="text-[#666] hover:text-red-400 px-1"
                              >×</button>
                            </div>
                          ))}
                          <Button size="sm" variant="secondary" className="w-full h-6 text-[10px]" onClick={() => setComponents(prev => prev.map(c => c.id === comp.id ? { ...c, hybridValues: [...(c.hybridValues || []), '0'] } : c))}>+ Add Value</Button>
                        </div>
                      )}

                      {(comp.type === 'slider' || comp.type === 'gauge') && (
                        <div className="grid grid-cols-2 gap-2">
                          <div><Label>Min</Label><Input type="number" value={comp.min ?? 0} onChange={e => setComponents(prev => prev.map(c => c.id === comp.id ? { ...c, min: parseFloat(e.target.value) } : c))} /></div>
                          <div><Label>Max</Label><Input type="number" value={comp.max ?? 0} onChange={e => setComponents(prev => prev.map(c => c.id === comp.id ? { ...c, max: parseFloat(e.target.value) } : c))} /></div>
                        </div>
                      )}

                      {comp.type === 'buzzer' && (
                        <div className="mt-2">
                          <Label>Sound Type</Label>
                          <select
                            value={comp.soundType || 'square'}
                            onChange={e => setComponents(prev => prev.map(c => c.id === comp.id ? { ...c, soundType: e.target.value as any } : c))}
                            className="w-full h-8 bg-[#0a0a0a] border border-[#333] rounded px-2 text-xs text-[#e0e0e0] mt-1"
                          >
                            <option value="sine">Sine</option>
                            <option value="square">Square</option>
                            <option value="sawtooth">Sawtooth</option>
                            <option value="triangle">Triangle</option>
                          </select>
                        </div>
                      )}
                      <Button variant="destructive" size="sm" onClick={() => { setComponents(prev => prev.filter(c => c.id !== comp.id)); setSelectedId(null); }} className="w-full mt-2">Delete</Button>
                    </>
                  );
                })()}
              </div>
            ) : <div className="text-xs text-[#666] text-center mt-4">Select a component to edit</div>}
          </div>
        )}

        {/* Canvas */}
        <div className="flex-1 bg-[#0a0a0a] relative overflow-hidden" onClick={() => setSelectedId(null)}>
          <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#333 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
          {components.map(renderComponent)}
        </div>
      </div>
    </div>
  );
};

const ReportDialog = ({
  onClose,
  onGenerate
}: {
  onClose: () => void;
  onGenerate: (projectName: string, author: string) => void;
}) => {
  const [projectName, setProjectName] = useState('My Project');
  const [author, setAuthor] = useState('Author');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50" onMouseDown={onClose}>
      <div className="bg-[#1a1a1a] border border-[#f97316] rounded-lg w-[400px] flex flex-col" onMouseDown={e => e.stopPropagation()}>
        <div className="h-12 flex items-center px-5 border-b border-[#222]">
          <h2 className="text-lg font-bold text-[#f97316]">Generate Report</h2>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <Label>Project Name</Label>
            <Input value={projectName} onChange={e => setProjectName(e.target.value)} className="w-full mt-1" />
          </div>
          <div>
            <Label>Author</Label>
            <Input value={author} onChange={e => setAuthor(e.target.value)} className="w-full mt-1" />
          </div>
          <Button onClick={() => onGenerate(projectName, author)} className="w-full bg-[#f97316] text-[#0a0a0a] font-bold">Generate Report</Button>
        </div>
      </div>
    </div>
  );
};

const NewProjectDialog = ({
  onClose,
  onCreate
}: {
  onClose: () => void;
  onCreate: (name: string) => void;
}) => {
  const [name, setName] = useState('');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50" onMouseDown={onClose}>
      <div className="bg-[#1a1a1a] border border-[#f97316] rounded-lg w-[400px] flex flex-col shadow-2xl" onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}>
        <div className="h-12 flex items-center px-5 border-b border-[#222]">
          <h2 className="text-lg font-bold text-[#f97316]">Create New Project</h2>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <Label>Project Name</Label>
            <Input
              autoFocus
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              placeholder="e.g. HVAC Control System"
              className="w-full mt-1 border-[#333] focus:border-[#f97316]"
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === 'Enter' && name.trim()) {
                  onCreate(name.trim());
                }
              }}
            />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button onClick={onClose} className="px-4 py-2 border border-[#333] bg-transparent text-white hover:bg-[#222]">Cancel</Button>
            <Button
              onClick={() => name.trim() && onCreate(name.trim())}
              disabled={!name.trim()}
              className="px-4 py-2 bg-[#f97316] text-[#0a0a0a] font-bold hover:bg-[#ea580c] disabled:opacity-50"
            >
              Create Project
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

const WorkspaceFileDialog = ({
  onClose,
  onCreateFile,
  onCreateProject,
  existingFiles,
  openTabIds,
  onOpenFile,
  onDeleteFile,
  onImportFile,
  onValidationError
}: {
  onClose: () => void;
  onCreateFile: (name: string, type: string) => void;
  onCreateProject: (name: string) => void;
  existingFiles: WorkspaceFile[];
  openTabIds: string[];
  onOpenFile: (fileId: string) => void;
  onDeleteFile: (fileId: string) => void;
  onImportFile: (name: string, type: string, data: any) => void;
  onValidationError?: (validation: ValidationResult) => void;
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'manage' | 'import'>('create');
  const [selectedType, setSelectedType] = useState<string>('xbridges');
  const [fileName, setFileName] = useState('');
  const [projectName, setProjectName] = useState('');
  
  // For import
  const [importedJson, setImportedJson] = useState<any>(null);
  const [detectedType, setDetectedType] = useState<string>('');
  const [importFileName, setImportFileName] = useState('');
  const importInputRef = useRef<HTMLInputElement>(null);

  const modules = [
    { id: 'xbridges', name: 'X-Bridges', desc: 'Control block diagram suite', color: '#c9a86c', icon: '🖧' },
    { id: 'vlab', name: 'V-Lab', desc: '3D physical plant mechanics', color: '#a855f7', icon: <FlaskConical size={18} /> },
    { id: 'hil', name: 'HIL Config', desc: 'Hardware-in-the-Loop setups', color: '#3b82f6', icon: '⚙' },
    { id: 'entropy', name: 'OPM (ISO 19450)', desc: 'Single-model architecture: structure, behavior & requirements', color: '#e8b74a', icon: '🌐' },
    { id: 'statemachine', name: 'State Machine', desc: 'Behavioral state logic simulation', color: '#f97316', icon: '⚡' },
    { id: 'bdd', name: 'SysML BDD', desc: 'Block Definition Diagram layout', color: '#6c9ac6', icon: '🗂' },
    { id: 'ibd', name: 'SysML IBD', desc: 'Internal Block Diagram port wiring', color: '#6cc9a8', icon: '🖥' },
    { id: 'requirements', name: 'Requirements', desc: 'SysML Requirements specifications', color: '#e0e0e0', icon: '📋' },
    { id: 'hmi', name: 'HMI Panel', desc: 'Realtime dashboard gauge interface', color: '#f59e0b', icon: '📊' },
    { id: 'doe', name: 'DOE (RSM)', desc: 'Design of Experiments analytical suite', color: '#ef4444', icon: '📈' },
  ];

  const handleCreate = () => {
    if (selectedType === 'project') {
      if (projectName.trim()) {
        onCreateProject(projectName.trim());
      }
    } else {
      const name = fileName.trim() || `Unnamed ${modules.find(m => m.id === selectedType)?.name || selectedType}`;
      onCreateFile(name, selectedType);
      onClose();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setImportFileName(file.name.replace(/\.[^/.]+$/, ""));
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const json = JSON.parse(evt.target?.result as string);
        const validation = validateImportedJson(json);
        if (!validation.isValid) {
          if (onValidationError) onValidationError(validation);
          setImportedJson(null);
          return;
        }
        setImportedJson(validation.sanitizedData || json);
        if (validation.detectedType) {
          setDetectedType(validation.detectedType);
        }
      } catch (err) {
        if (onValidationError) {
          onValidationError({
            isValid: false,
            errorTitle: 'JSON Syntax Error',
            errors: [`Failed to parse JSON file: ${err instanceof Error ? err.message : 'Invalid JSON format'}`]
          });
        }
        setImportedJson(null);
      }
    };
    reader.readAsText(file);
  };

  const handleImportExecute = () => {
    if (importedJson && detectedType && importFileName.trim()) {
      onImportFile(importFileName.trim(), detectedType, importedJson);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 animate-in fade-in duration-300" onMouseDown={onClose}>
      <div className="bg-[#111] border border-[#f97316]/40 rounded-2xl w-[750px] max-h-[85vh] flex flex-col shadow-2xl overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-[#181818] to-[#111] border-b border-[#222] flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="text-[#f97316] text-xl">📁</span>
            <h2 className="text-lg font-black uppercase tracking-wider text-[#e0e0e0]">Workspace Asset Manager</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">✕</button>
        </div>

        {/* Tab Buttons */}
        <div className="flex bg-[#0f0f0f] border-b border-[#222] p-1 gap-2 px-6">
          <button 
            onClick={() => setActiveTab('create')} 
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${activeTab === 'create' ? 'bg-[#f97316]/10 text-[#f97316] border border-[#f97316]/30' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Create New Asset
          </button>
          <button 
            onClick={() => setActiveTab('manage')} 
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${activeTab === 'manage' ? 'bg-[#f97316]/10 text-[#f97316] border border-[#f97316]/30' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Manage Files ({existingFiles.length})
          </button>
          <button 
            onClick={() => setActiveTab('import')} 
            className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${activeTab === 'import' ? 'bg-[#f97316]/10 text-[#f97316] border border-[#f97316]/30' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Import Module JSON
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 min-h-[350px] max-h-[55vh]">
          {activeTab === 'create' && (
            <div className="space-y-6">
              {/* Asset Type Grid */}
              <div className="grid grid-cols-2 gap-3">
                {/* Project Option */}
                <div 
                  onClick={() => setSelectedType('project')}
                  className={`p-4 rounded-xl border transition-all cursor-pointer flex gap-4 items-start ${selectedType === 'project' ? 'bg-[#f97316]/10 border-[#f97316] shadow-[0_0_15px_rgba(249,115,22,0.15)]' : 'bg-[#181818] border-[#222] hover:border-[#333]'}`}
                >
                  <div className="p-2 rounded-lg bg-[#f97316]/20 text-[#f97316] text-xl font-bold">✨</div>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-white">New ADIA Project</span>
                    <span className="text-xs text-slate-500 mt-1">Spawn a separate parallel project workspace in a new tab.</span>
                  </div>
                </div>

                {/* Separator / Header */}
                <div className="col-span-2 pt-2 pb-1 border-b border-[#222]">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#f97316]">Or Add Module Asset To Current Project</span>
                </div>

                {/* Modules */}
                {modules.map(m => (
                  <div 
                    key={m.id}
                    onClick={() => setSelectedType(m.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex gap-3 items-center ${selectedType === m.id ? 'bg-[#181818] border-l-4 shadow-[0_0_15px_rgba(255,255,255,0.05)]' : 'bg-[#161616] border-[#222] hover:border-[#333]'}`}
                    style={{ borderLeftColor: selectedType === m.id ? m.color : 'transparent' }}
                  >
                    <div className="p-2 rounded-lg text-lg flex items-center justify-center w-8 h-8" style={{ backgroundColor: `${m.color}15`, color: m.color }}>
                      {m.icon}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-bold text-white truncate">{m.name}</span>
                      <span className="text-[10px] text-slate-500 truncate mt-0.5">{m.desc}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Name fields */}
              <div className="pt-2 border-t border-[#222] space-y-4">
                {selectedType === 'project' ? (
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase">Project Name</label>
                    <Input 
                      autoFocus
                      value={projectName}
                      onChange={e => setProjectName(e.target.value)}
                      placeholder="e.g. Smart Grids Controller"
                      className="w-full mt-1.5 bg-[#181818] border-[#222] focus:border-[#f97316] text-[#e0e0e0]"
                      onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleCreate()}
                    />
                  </div>
                ) : (
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase">Asset File/Tab Name</label>
                    <Input 
                      autoFocus
                      value={fileName}
                      onChange={e => setFileName(e.target.value)}
                      placeholder={`e.g. TankSystem (${modules.find(m => m.id === selectedType)?.name || selectedType})`}
                      className="w-full mt-1.5 bg-[#181818] border-[#222] focus:border-[#f97316] text-[#e0e0e0]"
                      onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleCreate()}
                    />
                  </div>
                )}
                
                <div className="flex justify-end gap-3 pt-2">
                  <Button onClick={onClose} className="px-5 border border-[#222] bg-transparent text-slate-400 hover:bg-[#181818]">Cancel</Button>
                  <Button 
                    onClick={handleCreate} 
                    disabled={selectedType === 'project' ? !projectName.trim() : false}
                    className="px-5 bg-[#f97316] text-black hover:bg-[#ea580c] font-bold"
                  >
                    {selectedType === 'project' ? 'Create Project' : 'Create Asset File'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'manage' && (
            <div className="space-y-4">
              <div className="text-xs text-slate-500 mb-2">Double-click an asset to load it into the active workspace, or manage their states below.</div>
              <div className="border border-[#222] rounded-xl overflow-hidden bg-[#0a0a0a]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#161616] text-slate-400 font-bold border-b border-[#222]">
                      <th className="p-3">Asset Name</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Tab Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {existingFiles.map((file) => {
                      const isOpen = openTabIds.includes(file.id);
                      const modInfo = modules.find(m => m.id === file.type);
                      return (
                        <tr key={file.id} className="border-b border-[#181818] hover:bg-[#151515] transition-colors group" onDoubleClick={() => !isOpen && onOpenFile(file.id)}>
                          <td className="p-3 font-bold text-white truncate max-w-[200px]" title={file.name}>{file.name}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold" style={{ backgroundColor: `${modInfo?.color || '#333'}15`, color: modInfo?.color || '#ccc' }}>
                              {modInfo?.name || file.type.toUpperCase()}
                            </span>
                          </td>
                          <td className="p-3">
                            {isOpen ? (
                              <span className="text-emerald-400 font-medium">● Active Tab</span>
                            ) : (
                              <span className="text-slate-500">○ Inactive / Closed</span>
                            )}
                          </td>
                          <td className="p-3 text-right space-x-2">
                            {!isOpen && (
                              <button 
                                onClick={() => onOpenFile(file.id)}
                                className="text-xs text-[#f97316] hover:underline"
                              >
                                Open Tab
                              </button>
                            )}
                            {file.id.startsWith('default_') ? (
                              <span className="text-[10px] text-slate-600 font-bold uppercase select-none">System Default</span>
                            ) : (
                              <button 
                                onClick={() => onDeleteFile(file.id)}
                                className="text-xs text-red-500 hover:text-red-400 hover:underline"
                              >
                                Delete
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'import' && (
            <div className="space-y-5">
              <div 
                onClick={() => importInputRef.current?.click()}
                className="border-2 border-dashed border-[#333] hover:border-[#f97316]/50 rounded-2xl p-10 text-center cursor-pointer transition-all bg-[#0a0a0a]"
              >
                <input 
                  type="file" 
                  ref={importInputRef} 
                  onChange={handleFileChange} 
                  className="hidden" 
                  accept=".json"
                />
                <div className="text-4xl mb-4">📥</div>
                <h3 className="text-sm font-bold text-white">Click to Select Module JSON File</h3>
                <p className="text-xs text-slate-500 mt-2">Supports files generated by exporting individual modules (e.g. xbridges.json, vlab.json, etc.)</p>
              </div>

              {importedJson && (
                <div className="p-5 bg-[#181818] border border-[#222] rounded-xl space-y-4 animate-in slide-in-from-bottom-2 duration-300">
                  <div className="flex justify-between items-center border-b border-[#222] pb-3">
                    <span className="text-xs font-bold text-slate-400 uppercase">Detection Summary</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: `${modules.find(m => m.id === detectedType)?.color || '#333'}15`, color: modules.find(m => m.id === detectedType)?.color || '#ccc' }}>
                      {modules.find(m => m.id === detectedType)?.name || detectedType.toUpperCase()} File
                    </span>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase">Import Asset Tab Name</label>
                    <Input 
                      value={importFileName}
                      onChange={e => setImportFileName(e.target.value)}
                      className="w-full mt-1.5 bg-[#111] border-[#222] focus:border-[#f97316] text-white font-mono"
                    />
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <Button onClick={() => setImportedJson(null)} className="px-5 border border-[#222] bg-transparent text-slate-400 hover:bg-[#111]">Reset</Button>
                    <Button onClick={handleImportExecute} className="px-5 bg-emerald-600 text-white hover:bg-emerald-700 font-bold">Import Tab</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const WorkspaceTabBar = ({
  openTabIds,
  activeFileId,
  workspaceFiles,
  onSwitchTab,
  onCloseTab,
  onOpenDialog
}: {
  openTabIds: string[];
  activeFileId: string;
  workspaceFiles: WorkspaceFile[];
  onSwitchTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onOpenDialog: () => void;
}) => {
  const modules = [
    { id: 'xbridges', name: 'X-Bridges', color: '#c9a86c', icon: '🖧' },
    { id: 'vlab', name: 'V-Lab', color: '#a855f7', icon: <FlaskConical size={14} className="shrink-0" /> },
    { id: 'hil', name: 'HIL', color: '#3b82f6', icon: '⚙' },
    { id: 'entropy', name: 'Entropy OPM', color: '#ec4899', icon: '➿' },
    { id: 'statemachine', name: 'State Machine', color: '#f97316', icon: '⚡' },
    { id: 'bdd', name: 'BDD', color: '#6c9ac6', icon: '🗂' },
    { id: 'ibd', name: 'IBD', color: '#6cc9a8', icon: '🖥' },
    { id: 'requirements', name: 'Requirements', color: '#e0e0e0', icon: '📋' },
    { id: 'hmi', name: 'HMI', color: '#f59e0b', icon: '📊' },
    { id: 'doe', name: 'DOE', color: '#ef4444', icon: '📈' },
  ];

  return (
    <div className="workspace-tab-bar ui-surface h-10 bg-[var(--surface-canvas)] border-b border-[var(--border-default)] flex items-center px-4 shrink-0 justify-between select-none">
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1 h-full pt-1">
        {openTabIds.map((tabId) => {
          const file = workspaceFiles.find(f => f.id === tabId);
          if (!file) return null;
          
          const isActive = activeFileId === tabId;
          const modInfo = modules.find(m => m.id === file.type);
          
          return (
            <div 
              key={tabId}
              onClick={() => onSwitchTab(tabId)}
              className={`flex items-center gap-2 px-4 h-full rounded-t-lg text-xs font-bold transition-all duration-200 cursor-pointer border-t-2 shrink-0 ${
                  isActive 
                ? 'workspace-tab-active ui-card bg-[var(--surface-panel)] text-[var(--text-primary)] border-t-[#f97316]' 
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] border-t-transparent'
              }`}
              style={{
                boxShadow: isActive ? 'inset 0 1px 1px rgba(255,255,255,0.05)' : 'none'
              }}
            >
              <span style={{ color: modInfo?.color }}>{modInfo?.icon || '📁'}</span>
              <span className="truncate max-w-[120px]">{file.name}</span>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tabId);
                }}
                className="ml-2 w-4 h-4 rounded-full hover:bg-[var(--surface-raised)] hover:text-red-400 flex items-center justify-center text-[8px] text-[var(--text-muted)] font-normal transition-colors"
                title="Close Tab"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
      <button 
        onClick={onOpenDialog}
        className="ui-control ui-focus-ring ml-4 p-1 rounded hover:bg-[var(--surface-raised)] text-[#f97316] transition-colors flex items-center justify-center"
        title="Open Workspace Asset Manager"
      >
        <span className="text-lg font-bold">+</span>
      </button>
    </div>
  );
};

const SaveSelectionDialog = ({
  onClose,
  onSave
}: {
  onClose: () => void;
  onSave: (selectedKeys: string[]) => void;
}) => {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([
    'statemachine', 'bdd', 'ibd', 'requirements', 'xbridges', 
    'vlab', 'hmi', 'hil', 'doe', 'entropy', 'unified'
  ]);

  const modules = [
    { id: 'unified', name: 'Unified Project File (contains everything in one file)', desc: 'adia_project_unified.json' },
    { id: 'statemachine', name: 'State Machine Module', desc: 'statemachine.json' },
    { id: 'bdd', name: 'SysML BDD Module', desc: 'bdd.json' },
    { id: 'ibd', name: 'SysML IBD Module', desc: 'ibd.json' },
    { id: 'requirements', name: 'Requirements Module', desc: 'requirements.json' },
    { id: 'xbridges', name: 'X-Bridges Module', desc: 'xbridges.json' },
    { id: 'vlab', name: 'V-Lab Physical Model Module', desc: 'vlab.json' },
    { id: 'hmi', name: 'HMI Dashboard Layout', desc: 'hmi.json' },
    { id: 'hil', name: 'HIL Configuration', desc: 'hil.json' },
    { id: 'doe', name: 'DOE RSM Analysis Data', desc: 'doe.json' },
    { id: 'entropy', name: 'ENTROPY OPM Module', desc: 'entropy.json' },
  ];

  const handleToggle = (id: string) => {
    setSelectedKeys(prev => 
      prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id]
    );
  };

  const handleToggleAll = () => {
    if (selectedKeys.length === modules.length) {
      setSelectedKeys([]);
    } else {
      setSelectedKeys(modules.map(m => m.id));
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 animate-fade-in" onMouseDown={onClose}>
      <div className="bg-[#1a1a1a] border border-[#f97316] rounded-xl w-[500px] max-h-[90vh] flex flex-col shadow-2xl" onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}>
        <div className="h-14 flex items-center justify-between px-6 border-b border-[#222]">
          <h2 className="text-lg font-bold text-[#f97316]">Select Modules to Save</h2>
          <button 
            onClick={handleToggleAll} 
            className="text-xs text-[#888] hover:text-[#f97316] transition-colors cursor-pointer"
          >
            {selectedKeys.length === modules.length ? 'Deselect All' : 'Select All'}
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          <p className="text-xs text-[#888] mb-2">Check the modules you want to export. By default, all are selected.</p>
          <div className="space-y-2 border border-[#222] rounded-lg p-3 bg-[#111]/40">
            {modules.map(m => (
              <label 
                key={m.id} 
                className="flex items-start gap-3 p-2 rounded hover:bg-[#222]/50 cursor-pointer transition-colors"
              >
                <input 
                  type="checkbox" 
                  checked={selectedKeys.includes(m.id)}
                  onChange={() => handleToggle(m.id)}
                  className="mt-0.5 rounded border-[#333] text-[#f97316] focus:ring-[#f97316] focus:ring-offset-0 focus:ring-0 bg-transparent w-4 h-4 cursor-pointer"
                />
                <div className="flex flex-col select-none">
                  <span className="text-sm font-semibold text-[#e0e0e0]">{m.name}</span>
                  <span className="text-[10px] text-[#666] font-mono">{m.desc}</span>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="h-16 flex items-center justify-end px-6 border-t border-[#222] gap-3">
          <Button 
            onClick={onClose} 
            className="px-4 py-2 border border-[#333] bg-transparent text-white hover:bg-[#222]"
          >
            Cancel
          </Button>
          <Button
            onClick={() => onSave(selectedKeys)}
            disabled={selectedKeys.length === 0}
            className="px-5 py-2 bg-[#f97316] text-[#0a0a0a] font-bold hover:bg-[#ea580c] disabled:opacity-50"
          >
            Save Selected
          </Button>
        </div>
      </div>
    </div>
  );
};

const TickRateInput = ({ value, onChange }: { value: number, onChange: (val: number) => void }) => {
  const [localValue, setLocalValue] = useState(String(value));

  useEffect(() => {
    setLocalValue(String(value));
  }, [value]);

  const commit = () => {
    const num = parseFloat(normalizeNumerals(localValue));
    if (!isNaN(num) && num > 0) {
      onChange(num);
    } else {
      setLocalValue(String(value));
    }
  };

  return (
    <Input
      type="text"
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === 'Enter') commit();
      }}
      className="h-7 w-16 text-center text-xs font-mono"
      placeholder="ms"
    />
  );
};

// =============================================================================
// MAIN COMPONENT (FULLY FUNCTIONAL)
// =============================================================================
// =============================================================================


// =============================================================================
// DOE UI COMPONENTS (Manual Table & Plotly Wrappers)
// =============================================================================

const ManualEntryTable = ({
  data,
  headers,
  onChange
}: {
  data: number[][],
  headers: string[],
  onChange: (newData: number[][], newHeaders: string[]) => void
}) => {
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text');
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    const grid = lines.map(l => l.split('\t').map(c => Number(c.replace(',', '.'))));

    if (grid.length > 0) {
      onChange(grid, headers);
    }
  };

  const updateCell = (rIdx: number, cIdx: number, val: string) => {
    const newData = [...data];
    newData[rIdx] = [...newData[rIdx]];
    newData[rIdx][cIdx] = Number(val);
    onChange(newData, headers);
  };

  const addRow = () => {
    const newRow = new Array(headers.length).fill(0);
    onChange([...data, newRow], headers);
  };

  const removeRow = (idx: number) => {
    if (data.length <= 1) return;
    onChange(data.filter((_: number[], i: number) => i !== idx), headers);
  };

  const addFactor = () => {
    const newHeaders = [...headers.slice(0, -1), `X${headers.length}`, headers[headers.length - 1]];
    const newData = data.map(r => [...r.slice(0, -1), 0, r[r.length - 1]]);
    onChange(newData, newHeaders);
  };

  return (
    <div className="flex flex-col h-full bg-[#0d0d10] border border-[#27272f] rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#27272f] bg-[#141417]">
        <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Experiment Data</span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={addFactor}
            className="h-7 px-2.5 text-xs font-medium bg-[#18181c] border border-[#27272f] text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-md"
          >
            <Plus size={12} className="mr-1 text-zinc-400" /> Factor
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={addRow}
            className="h-7 px-2.5 text-xs font-medium bg-[#18181c] border border-[#27272f] text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-md"
          >
            <Plus size={12} className="mr-1 text-zinc-400" /> Row
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto custom-scrollbar" onPaste={handlePaste}>
        <table className="w-full text-xs text-left border-collapse">
          <thead className="sticky top-0 bg-[#1a1a1a] z-10 shadow-sm">
            <tr>
              <th className="p-2 border-b border-[#222] w-8 text-center text-[#444]">#</th>
              {headers.map((h, i) => (
                <th key={i} className={`p-2 border-b border-[#222] font-bold ${i === headers.length - 1 ? 'text-emerald-500' : 'text-[#f97316]'}`}>
                  {h}
                </th>
              ))}
              <th className="p-2 border-b border-[#222] w-8"></th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, rIdx) => (
              <tr key={rIdx} className="hover:bg-white/5 border-b border-[#1a1a1a]">
                <td className="p-2 text-center text-[#444]">{rIdx + 1}</td>
                {row.map((cell, cIdx) => (
                  <td key={cIdx} className="p-0 border-r border-[#1a1a1a]">
                    <input
                      type="number"
                      value={cell}
                      onChange={(e) => updateCell(rIdx, cIdx, e.target.value)}
                      className="w-full bg-transparent p-2 outline-none focus:bg-emerald-500/10 text-white transition-colors"
                    />
                  </td>
                ))}
                <td className="p-1">
                  <button onClick={() => removeRow(rIdx)} className="text-red-500/50 hover:text-red-500 p-1 transition-colors">
                    <Trash2 size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="p-2 bg-[#1a1a1a] border-t border-[#222] text-[10px] text-[#555]">
        Tip: Paste data directly from Excel (Ctrl+V)
      </div>
    </div>
  );
};
// PlotlyPlots extracted to src/components/doe/PlotlyPlots.tsx
// Help Data moved to HelpData.ts

const ALL_MODULES = [
  { id: 'statemachine', label: 'State Machine' },
  { id: 'bdd', label: 'SysML BDD' },
  { id: 'requirements', label: 'Requirements' },
  { id: 'ibd', label: 'SysML IBD' },
  { id: 'xbridges', label: 'X-Bridges' },
  { id: 'vlab', label: 'V-Lab' },
  { id: 'hil', label: 'HIL' },
  { id: 'entropy', label: 'ENTROPY OPM' },
] as const;

const DynamicIcon = ({ name, size, className }: { name?: string; size: number; className?: string }) => {
  switch (name) {
    case 'activity': return <Activity size={size} className={className} />;
    case 'zap': return <Zap size={size} className={className} />;
    case 'cpu': return <Cpu size={size} className={className} />;
    case 'layers': return <Layers size={size} className={className} />;
    case 'database': return <Database size={size} className={className} />;
    case 'network': return <Network size={size} className={className} />;
    case 'plus': return <Plus size={size} className={className} />;
    case 'resistor': return <Zap size={size} className={className} />;
    case 'capacitor': return <Layers size={size} className={className} />;
    case 'inductor': return <Activity size={size} className={className} />;
    case 'dc_motor': return <Cpu size={size} className={className} />;
    case 'inertia': return <Database size={size} className={className} />;
    case 'mass': return <Box size={size} className={className} />;
    case 'trans_spring': return <Rows size={size} className={className} />;
    case 'scope': return <Activity size={size} className={className} />;
    case 'settings-2': return <Settings2 size={size} className={className} />;
    case 'magnetron': return <Zap size={size} className={className} />;
    case 'heater': return <Flame size={size} className={className} />;
    case 'cavity': return <Box size={size} className={className} />;
    case 'inverter': return <RefreshCcw size={size} className={className} />;
    case 'gas_chamber': return <Wind size={size} className={className} />;
    case 'ma_chamber': return <Cloud size={size} className={className} />;
    case 'reluctance': return <Activity size={size} className={className} />;
    case 'doe_model': return <Database size={size} className={className} />;
    default: return <Box size={size} className={className} />;
  }
};

const HelpModal = ({ isOpen, onClose, initialTopic }: { isOpen: boolean; onClose: () => void; initialTopic?: string }) => {
  const [activeTopic, setActiveTopic] = useState<string>(initialTopic || "getting-started");
  const [searchQuery, setSearchQuery] = useState("");
  const [showBlockRef, setShowBlockRef] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedDomainFilter, setSelectedDomainFilter] = useState<string>("All");
  const [selectedSourceFilter, setSelectedSourceFilter] = useState<string>("All");
  const [showArchitectureExplorer, setShowArchitectureExplorer] = useState(false);

  useEffect(() => {
    if (initialTopic && isOpen) {
      setActiveTopic(initialTopic);
      setShowBlockRef(false);
      setShowArchitectureExplorer(false);
    }
  }, [initialTopic, isOpen]);
  
  if (!isOpen) return null;

  const topic = HELP_DATA[activeTopic] || HELP_DATA["getting-started"];

  // Categories for Help Topics
  const topicCategories: Record<string, string[]> = {};
  Object.keys(HELP_DATA).forEach(key => {
    const cat = HELP_DATA[key].category;
    if (!topicCategories[cat]) topicCategories[cat] = [];
    topicCategories[cat].push(key);
  });

  // Flattened library for search
  const vlabBlocks = VLAB_LIBRARY.flatMap(domain => 
    domain.blocks.map(b => ({ ...b, domain: domain.type, source: 'V-Lab' }))
  );
  
  const xbridgesBlocks = Object.keys(XBRIDGES_LIBRARY).map(key => {
    try {
      const b = XBRIDGES_LIBRARY[key]('tmp', {});
      return { 
        id: key, 
        name: key, 
        domain: 'Control', 
        source: 'X-Bridges', 
        params: b.params, 
        ports: [...(b.inputs || []), ...(b.outputs || [])],
        icon: b.icon,
        equation: b.equation,
        description: b.description
      };
    } catch(e) {
      return { id: key, name: key, domain: 'Control', source: 'X-Bridges', params: {}, ports: [], icon: undefined, equation: undefined, description: undefined };
    }
  });

  const allBlocks = [...vlabBlocks, ...xbridgesBlocks];
  
  const domainsList = ["All", ...Array.from(new Set(allBlocks.map(b => b.domain)))];

  const filteredBlocks = allBlocks
    .map(b => {
      const q = searchQuery.toLowerCase().trim();
      const name = b.name.toLowerCase();
      const id = b.id.toLowerCase();
      const domain = b.domain.toLowerCase();
      const desc = (b.description || '').toLowerCase();
      const eq = (b.equation || '').toLowerCase();

      let score = 0;
      if (!q) {
        score = 1;
      } else if (name === q || id === q) {
        score = 1000;
      } else if (name.startsWith(q) || id.startsWith(q)) {
        score = 800;
      } else if (name.includes(q) || id.includes(q)) {
        score = 600;
      } else if (domain.includes(q)) {
        score = 400;
      } else if (desc.includes(q) || eq.includes(q)) {
        score = 100;
      }

      const matchesDomain = selectedDomainFilter === "All" || b.domain.toLowerCase() === selectedDomainFilter.toLowerCase();
      const matchesSource = selectedSourceFilter === "All" || b.source.toLowerCase() === selectedSourceFilter.toLowerCase();

      return { block: b, score, match: score > 0 && matchesDomain && matchesSource };
    })
    .filter(item => item.match)
    .sort((a, b) => b.score - a.score)
    .map(item => item.block);

  const selectedBlock = allBlocks.find(b => b.id === selectedBlockId);

  const getDomainColor = (domain: string) => {
    const d = domain.toLowerCase();
    if (d.includes('electr')) return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30';
    if (d.includes('mechanic') || d.includes('rotat') || d.includes('translat')) return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    if (d.includes('therm')) return 'text-red-400 bg-red-500/10 border-red-500/30';
    if (d.includes('magnet')) return 'text-purple-400 bg-purple-500/10 border-purple-500/30';
    if (d.includes('gas') || d.includes('fluid') || d.includes('air')) return 'text-sky-400 bg-sky-500/10 border-sky-500/30';
    if (d.includes('control')) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    return 'text-orange-400 bg-orange-500/10 border-orange-500/30';
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 backdrop-blur-3xl p-6 md:p-10 text-white font-sans">
      <div className="bg-[#0f0f0f] rounded-3xl border border-white/10 w-full h-full max-w-7xl flex flex-col shadow-[0_0_150px_rgba(0,0,0,0.8)] overflow-hidden">
        
        {/* TOP HEADER */}
        <header className="h-20 border-b border-white/5 flex items-center justify-between px-8 md:px-10 bg-[#151515]/50 backdrop-blur-xl shrink-0">
          <div className="flex items-center gap-6 md:gap-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center font-black text-xl shadow-[0_0_20px_rgba(249,115,22,0.3)]">A</div>
              <div className="flex flex-col">
                <span className="font-black tracking-tight text-xl leading-none">ADIA <span className="text-orange-500">DOCS</span></span>
                <span className="text-[9px] text-gray-500 font-bold uppercase tracking-[0.2em] mt-1">Multi-Domain MBD & HIL Reference</span>
              </div>
            </div>
            
            <div className="h-10 w-[1px] bg-white/10 hidden sm:block"></div>
            
            <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
              <button 
                onClick={() => setShowBlockRef(false)}
                className={`px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${!showBlockRef ? 'bg-orange-500 text-black shadow-lg shadow-orange-500/20' : 'text-gray-500 hover:text-white'}`}
              >
                User Guide & Modules
              </button>
              <button 
                onClick={() => setShowBlockRef(true)}
                className={`px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${showBlockRef ? 'bg-orange-500 text-black shadow-lg shadow-orange-500/20' : 'text-gray-500 hover:text-white'}`}
              >
                Illustrated Block Reference ({allBlocks.length})
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-4 md:gap-6">
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-orange-500 transition-colors">
                <Search size={16} />
              </div>
              <input 
                type="text" 
                placeholder={showBlockRef ? "Search 250+ blocks, equations, ports..." : "Search documentation topics & guides..."}
                className="bg-black/60 border border-white/10 rounded-full py-2.5 pl-12 pr-6 text-xs w-64 md:w-80 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 transition-all font-medium"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button 
              onClick={onClose}
              className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/5 hover:bg-red-500/20 hover:text-red-500 flex items-center justify-center transition-all group shrink-0"
              title="Close Help"
            >
              <X size={22} className="group-hover:rotate-90 transition-transform" />
            </button>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          
          {/* SIDEBAR */}
          <aside className="w-80 border-r border-white/5 bg-[#0a0a0a] flex flex-col shrink-0">
            {showBlockRef && (
              <div className="p-4 border-b border-white/5 bg-[#121212]/80 space-y-3 shrink-0">
                {/* Engine Filter */}
                <div className="flex items-center gap-1.5 bg-black/50 p-1 rounded-lg border border-white/5 text-[9px] font-bold">
                  {["All", "V-Lab", "X-Bridges"].map(src => (
                    <button
                      key={src}
                      onClick={() => setSelectedSourceFilter(src)}
                      className={`flex-1 py-1 rounded text-center transition-all ${selectedSourceFilter === src ? 'bg-orange-500 text-black font-black' : 'text-gray-400 hover:text-white'}`}
                    >
                      {src}
                    </button>
                  ))}
                </div>

                {/* Domain Selector */}
                <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar pb-1">
                  {domainsList.slice(0, 8).map(d => (
                    <button
                      key={d}
                      onClick={() => setSelectedDomainFilter(d)}
                      className={`px-2 py-1 rounded text-[8px] font-bold uppercase whitespace-nowrap transition-all ${selectedDomainFilter === d ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40' : 'bg-white/5 text-gray-500 hover:text-gray-300'}`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
              {!showBlockRef ? (
                /* DOCUMENTATION TREE */
                <div className="space-y-8">
                  {Object.keys(topicCategories).map(cat => (
                    <div key={cat}>
                      <h4 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-500"></div>
                        {cat}
                      </h4>
                      <ul className="space-y-1">
                        {topicCategories[cat].map(key => (
                          <li key={key}>
                            <button 
                              onClick={() => setActiveTopic(key)}
                              className={`w-full text-left px-4 py-2.5 rounded-xl text-xs transition-all flex items-center gap-3 ${activeTopic === key ? 'bg-orange-500/10 text-orange-500 font-bold border border-orange-500/20' : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'}`}
                            >
                              <BookOpen size={14} className={activeTopic === key ? 'text-orange-500' : 'text-gray-700'} />
                              {HELP_DATA[key].title}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                /* BLOCK LIBRARY TREE */
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-3 text-[10px] font-black text-gray-600 uppercase tracking-[0.2em]">
                    <span>Components ({filteredBlocks.length})</span>
                    {selectedDomainFilter !== "All" && (
                      <button onClick={() => setSelectedDomainFilter("All")} className="text-orange-500 hover:underline">Reset</button>
                    )}
                  </div>
                  {filteredBlocks.map(block => (
                    <button 
                      key={block.id}
                      onClick={() => setSelectedBlockId(block.id)}
                      className={`w-full text-left px-3.5 py-2.5 rounded-xl text-[11px] transition-all flex items-center justify-between group ${selectedBlockId === block.id ? 'bg-orange-500 text-black font-black shadow-md shadow-orange-500/20' : 'text-gray-400 hover:bg-white/5'}`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <Box size={13} className={selectedBlockId === block.id ? 'text-black' : 'text-gray-600'} />
                        <span className="truncate">{block.name}</span>
                      </div>
                      <span className={`text-[8px] uppercase font-black px-1.5 py-0.5 rounded shrink-0 ml-2 ${selectedBlockId === block.id ? 'bg-black/20 text-black' : 'bg-white/5 text-gray-500'}`}>
                        {block.domain}
                      </span>
                    </button>
                  ))}
                  {filteredBlocks.length === 0 && (
                    <div className="p-6 text-center text-xs text-gray-600 italic">
                      No blocks match your search or filter.
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>

          {/* MAIN CONTENT AREA */}
          <main className="flex-1 overflow-y-auto bg-[#0a0a0a] p-10 md:p-14 custom-scrollbar relative">
            {!showBlockRef ? (
              /* TOPIC VIEW */
              <div className="max-w-4xl mx-auto">
                {activeTopic === 'software-architecture' && showArchitectureExplorer ? (
                  <SoftwareArchitectureExplorer onClose={() => setShowArchitectureExplorer(false)} />
                ) : <>
                <div className="mb-14">
                  <nav className="flex items-center gap-3 text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-6">
                    <span className="hover:text-orange-500 cursor-pointer" onClick={() => setActiveTopic("getting-started")}>ADIA Docs</span>
                    <ChevronRight size={10} />
                    <span className="text-gray-400">{topic.category}</span>
                    <ChevronRight size={10} />
                    <span className="text-white">{topic.title}</span>
                  </nav>
                  
                <h1 className="text-5xl font-black text-white tracking-tighter mb-4 leading-tight">
                    {topic.title}
                  </h1>
                  <p className="text-lg text-gray-400 leading-relaxed font-light max-w-3xl">
                    {topic.description}
                  </p>
                </div>

                {activeTopic === 'software-architecture' && (
                  <button onClick={() => setShowArchitectureExplorer(true)} className="mb-10 flex items-center gap-3 rounded-xl border border-orange-500/40 bg-orange-500/10 px-5 py-3 text-sm font-bold text-orange-400 hover:bg-orange-500/20">
                    <Layers size={18} /> Open Architecture Explorer
                  </button>
                )}

                {topic.image && (
                  <div className="mb-14 rounded-3xl overflow-hidden border border-white/10 shadow-2xl group relative bg-black/40">
                    <img src={topic.image} alt={topic.title} className="w-full object-cover group-hover:scale-105 transition-transform duration-700 max-h-[380px]" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"></div>
                    <div className="absolute bottom-6 left-6 flex items-center gap-3">
                      <div className="p-2 bg-orange-500 rounded-lg text-black"><Activity size={16} /></div>
                      <span className="text-xs font-black uppercase tracking-widest text-white shadow-sm">Illustrated Architecture Diagram</span>
                    </div>
                  </div>
                )}

                <div className="prose prose-invert max-w-none">
                  <div className="text-gray-300 leading-relaxed text-base mb-14 font-light bg-white/[0.02] p-8 rounded-3xl border border-white/5">
                    {topic.content}
                  </div>

                  <div className="space-y-16">
                    {topic.sections?.map((section, idx) => (
                      <section key={idx} className="relative pl-10 border-l-2 border-white/10 group">
                        <div className="absolute left-[-7px] top-1 w-3 h-3 rounded-full bg-white/20 group-hover:bg-orange-500 transition-colors shadow-[0_0_15px_rgba(255,255,255,0.1)] group-hover:shadow-orange-500/50"></div>
                        <h2 className="text-2xl font-black text-white mb-4 tracking-tight flex items-center gap-3">
                          {section.title}
                        </h2>
                        <div className="text-gray-400 leading-relaxed mb-6 whitespace-pre-wrap font-light text-sm">
                          {section.body}
                        </div>
                        
                        {section.list && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                            {section.list.map((item, i) => (
                              <div key={i} className="flex items-start gap-3 p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                                <div className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5 shrink-0"></div>
                                <span className="text-xs text-gray-300 font-light leading-relaxed">{renderFormattedHelpText(item)}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {section.code && (
                          <div className="relative group/code mt-6">
                            <div className="absolute right-4 top-3 text-[9px] font-black text-white/30 uppercase tracking-widest">Mathematical / Code Formulation</div>
                            <div className="bg-black/90 rounded-2xl border border-white/10 p-6 font-mono text-xs text-orange-400 overflow-x-auto shadow-inner">
                              <pre className="m-0">{section.code}</pre>
                            </div>
                          </div>
                        )}
                      </section>
                    ))}
                  </div>

                  {topic.related && (
                    <div className="mt-24 pt-12 border-t border-white/5">
                      <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] mb-8">Related Modules & Deep Dives</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {topic.related.map(key => (
                          <button 
                            key={key}
                            onClick={() => setActiveTopic(key)}
                            className="p-6 bg-[#151515] border border-white/5 rounded-3xl hover:border-orange-500/40 transition-all text-left group hover:-translate-y-1"
                          >
                            <span className="text-[9px] text-orange-500 uppercase font-black block mb-1.5 tracking-widest">{HELP_DATA[key]?.category}</span>
                            <span className="text-sm font-bold text-white group-hover:text-orange-500 transition-colors block leading-tight">{HELP_DATA[key]?.title}</span>
                            <div className="mt-3 flex items-center gap-1.5 text-[9px] font-bold text-gray-500 group-hover:text-gray-300 transition-colors">
                              Explore Guide <ChevronRight size={10} />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                </>}
              </div>
            ) : (
              /* BLOCK REFERENCE VIEW */
              <div className="max-w-4xl mx-auto">
                {selectedBlock ? (
                  <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-12 border-b border-white/5 pb-8">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-4 mb-3">
                          <div className="p-3.5 bg-orange-500 rounded-2xl text-black shadow-xl shadow-orange-500/20">
                            <DynamicIcon name={selectedBlock.icon} size={28} />
                          </div>
                          <div>
                            <h1 className="text-4xl font-black text-white tracking-tighter">{selectedBlock.name}</h1>
                            <div className="flex items-center gap-2.5 mt-1.5">
                              <span className="px-3 py-0.5 bg-white/5 border border-white/10 rounded-full text-[9px] font-black text-gray-400 uppercase tracking-widest">{selectedBlock.source} Component</span>
                              <span className={`px-3 py-0.5 border rounded-full text-[9px] font-black uppercase tracking-widest ${getDomainColor(selectedBlock.domain)}`}>
                                {selectedBlock.domain} Domain
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[9px] font-black text-gray-600 uppercase tracking-widest mb-1">Catalog Status</div>
                        <div className="text-emerald-400 font-bold text-xs flex items-center gap-1.5 justify-end">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
                          Full Physics & Port Verified
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                      {/* Left Column: Pinout & Parameters */}
                      <div className="space-y-8">
                        <section>
                          <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                            <Box size={14} className="text-orange-500" />
                            Schematic Terminal Interface
                          </h3>
                          <div className="bg-black/60 rounded-3xl border border-white/5 p-6 relative flex flex-col items-center justify-center min-h-[260px] shadow-inner">
                            {/* Block Visualization */}
                            <div className="w-36 h-36 bg-orange-500/5 border-2 border-orange-500/30 rounded-3xl flex flex-col items-center justify-center relative shadow-[0_0_50px_rgba(249,115,22,0.1)] group">
                              <DynamicIcon name={selectedBlock.icon} size={40} className="text-orange-500 mb-1" />
                              <span className="text-[10px] font-black text-white/80 max-w-[100px] text-center truncate px-1">{selectedBlock.name}</span>
                              
                              {/* Port Pins */}
                              {selectedBlock.ports?.map((p: any, i: number) => {
                                const pos = p.position || (i % 2 === 0 ? 'left' : 'right');
                                return (
                                  <div 
                                    key={i} 
                                    className={`absolute text-[8px] font-black uppercase text-gray-400 flex items-center gap-1 ${pos === 'left' ? '-left-14' : pos === 'right' ? '-right-14' : pos === 'top' ? '-top-8' : '-bottom-8'}`}
                                  >
                                    <span className="px-1 py-0.5 bg-black/80 rounded border border-white/10 text-orange-400/90">{p.label || p.name || `Pin ${i+1}`}</span>
                                    <div className={`w-2.5 h-2.5 rounded-full border-2 border-orange-500 bg-black ${pos === 'left' ? 'order-last' : 'order-first'}`}></div>
                                  </div>
                                );
                              })}
                            </div>
                            <span className="text-[9px] text-gray-600 font-bold uppercase tracking-widest mt-6">
                              {selectedBlock.ports?.length || 2} Connected Terminals ({selectedBlock.source === 'V-Lab' ? 'Acausal Energy Ports' : 'Causal Signal Ports'})
                            </span>
                          </div>
                        </section>

                        <section>
                          <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4">
                            Configurable Parameters
                          </h3>
                          <div className="space-y-2.5">
                            {Object.entries(selectedBlock.params || {}).map(([key, p]: [string, any]) => (
                              <div key={key} className="flex items-center justify-between p-3.5 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/[0.04] transition-colors">
                                <div className="flex flex-col">
                                  <span className="text-[11px] font-bold text-white">{p.label || key}</span>
                                  <span className="text-[9px] text-gray-600 font-mono">{key}</span>
                                </div>
                                <div className="text-right">
                                  <span className="text-xs font-bold text-orange-400 font-mono">{String(p.value ?? p.default ?? '0')}</span>
                                  <span className="text-[9px] text-gray-500 ml-1.5 uppercase font-bold">{p.unit || ''}</span>
                                </div>
                              </div>
                            ))}
                            {Object.keys(selectedBlock.params || {}).length === 0 && (
                              <div className="p-6 text-center text-xs text-gray-600 italic bg-white/[0.01] border border-dashed border-white/10 rounded-2xl">
                                Standard ideal component with fixed internal characteristics.
                              </div>
                            )}
                          </div>
                        </section>
                      </div>

                      {/* Right Column: Execution, Equations, and How-To-Use */}
                      <div className="space-y-8">
                        <section>
                          <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4">
                            Governing Physics & Transfer Equations
                          </h3>
                          <div className="bg-black/60 rounded-3xl border border-white/5 p-6">
                            <p className="text-xs text-gray-400 leading-relaxed font-light mb-4">
                              {selectedBlock.description || "This component participates in continuous simulation through simultaneous differential-algebraic equations solved by the numerical solver."}
                            </p>
                            <div className="bg-orange-500/5 p-5 rounded-2xl border border-orange-500/20">
                              <h4 className="text-[9px] font-black text-orange-500 uppercase tracking-widest mb-2">Mathematical Formulation</h4>
                              <div className="font-mono text-xs text-white/90 italic whitespace-pre-wrap leading-relaxed">
                                {selectedBlock.equation || (selectedBlock.domain === 'Electrical' ? 'V_p - V_n = I * R' : selectedBlock.domain === 'Mechanical' ? 'F = m * dv/dt + B * v' : 'Y = f(U)')}
                              </div>
                            </div>
                          </div>
                        </section>

                        <section>
                          <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4">
                            How to Use & Button Steps in Canvas
                          </h3>
                          <div className="p-6 bg-gradient-to-br from-white/[0.03] to-transparent border border-white/10 rounded-3xl space-y-3 text-xs text-gray-300 font-light">
                            <div className="flex items-start gap-2.5">
                              <span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center font-bold text-[10px] shrink-0">1</span>
                              <span>Click and drag <b>{selectedBlock.name}</b> from the left component panel onto the canvas.</span>
                            </div>
                            <div className="flex items-start gap-2.5">
                              <span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center font-bold text-[10px] shrink-0">2</span>
                              <span>Drag connection wires between terminal pins matching the <b>{selectedBlock.domain}</b> domain.</span>
                            </div>
                            <div className="flex items-start gap-2.5">
                              <span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center font-bold text-[10px] shrink-0">3</span>
                              <span>Double-click the block on the canvas to open the sidebar parameters editor.</span>
                            </div>
                            <div className="flex items-start gap-2.5">
                              <span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center font-bold text-[10px] shrink-0">4</span>
                              <span>Click <b>Start Simulation</b> in the top toolbar to execute real-time solver steps.</span>
                            </div>
                          </div>
                        </section>

                        <section>
                          <button 
                            onClick={() => {
                              setShowBlockRef(false);
                              if (selectedBlock.source === 'V-Lab') {
                                setActiveTopic('vlab-fundamentals');
                              } else {
                                setActiveTopic('xbridges-ref');
                              }
                            }}
                            className="w-full py-3.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all group"
                          >
                            <span>Read Full {selectedBlock.source} Theory Guide</span>
                            <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                          </button>
                        </section>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-[60vh] flex flex-col items-center justify-center text-center">
                    <div className="w-20 h-20 bg-white/[0.03] rounded-full flex items-center justify-center mb-6 border border-white/5">
                      <Search size={32} className="text-gray-600" />
                    </div>
                    <h2 className="text-2xl font-black text-white tracking-tight mb-2">Explore the Multi-Domain Block Catalog</h2>
                    <p className="text-gray-500 max-w-md leading-relaxed text-xs font-light mb-6">
                      Select any physical component or control block from the sidebar to inspect its electrical/mechanical pinouts, transfer equations, parameters, and step-by-step canvas usage.
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                      {["Resistor", "Capacitor", "Inertia", "DC Voltage Source", "PID Controller", "Clarke Transform", "BLDC Motor"].map(sample => {
                        const target = allBlocks.find(b => b.name.toLowerCase().includes(sample.toLowerCase()));
                        return target ? (
                          <button
                            key={sample}
                            onClick={() => setSelectedBlockId(target.id)}
                            className="px-3 py-1.5 bg-white/5 hover:bg-orange-500/10 hover:text-orange-400 border border-white/10 rounded-xl text-[10px] font-bold text-gray-400 transition-colors"
                          >
                            {sample}
                          </button>
                        ) : null;
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </main>
        </div>

        {/* FOOTER */}
        <footer className="h-14 border-t border-white/5 bg-[#111] flex items-center justify-between px-8 md:px-10 shrink-0">
          <div className="flex items-center gap-6">
            <span className="text-[9px] text-gray-600 font-black uppercase tracking-widest">ADIA Model-Based Design Engineering Suite</span>
            <div className="h-4 w-[1px] bg-white/5"></div>
            <div className="flex gap-4">
              <span className="text-[9px] text-gray-500 font-bold uppercase">250+ Multi-Domain Blocks Verified</span>
              <span className="text-[9px] text-gray-500 font-bold uppercase">HIL Real-Time Driver Ready</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[9px] text-gray-600 font-bold">Press <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-white font-mono text-[8px]">Esc</kbd> to exit</span>
          </div>
        </footer>
      </div>
    </div>
  );
};

const ReportPreviewModal = ({ 
  isOpen, 
  onClose, 
  results, 
  data, 
  headers, 
  plotFactors, 
  holdValues 
}: any) => {
  const [layout, setLayout] = useState<'1-col' | '2-col'>('1-col');
  const previewRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const exportToWord = async () => {
    if (!previewRef.current) return;
    
    const clone = previewRef.current.cloneNode(true) as HTMLDivElement;
    const originalPlots = previewRef.current.querySelectorAll('.js-plotly-plot');
    const clonePlots = clone.querySelectorAll('.js-plotly-plot');
    
    // We replace interactive plotly divs with static images for Word
    for (let i = 0; i < originalPlots.length; i++) {
      try {
        const plot = originalPlots[i] as any;
        if (plot.data && plot.layout) {
             const canvas = await html2canvas(plot);
             const imgData = canvas.toDataURL('image/png');
             const img = document.createElement('img');
             img.src = imgData;
             img.style.width = '100%';
             clonePlots[i].parentNode?.replaceChild(img, clonePlots[i]);
        }
      } catch (e) { console.error('Failed to capture plot', e); }
    }

    const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head><meta charset='utf-8'><title>ADIA DOE Report</title></head><body style="background-color: #1a1a1a; color: #e0e0e0;">`;
    const footer = "</body></html>";
    const sourceHTML = header + DOMPurify.sanitize(clone.innerHTML) + footer;
    
    const blob = new Blob(['\ufeff', sourceHTML], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ADIA_DOE_Report_${new Date().getTime()}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToPDF = async () => {
    if (!previewRef.current) return;
    try {
      const canvas = await html2canvas(previewRef.current, { scale: 2, backgroundColor: '#1a1a1a' });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`ADIA_DOE_Report_${new Date().getTime()}.pdf`);
    } catch (e) {
      console.error('PDF generation failed', e);
    }
  };

  const plotsToShow = results?.type === 'RSM' ? ['surface', 'contour', 'pareto', 'residuals'] :
                      results?.type === 'Taguchi' ? ['taguchi_delta'] :
                      ['surface', 'contour', 'pred_vs_act'];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#1a1a1a] border border-[#333] rounded-xl w-full max-w-6xl h-full max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-[#222]">
          <div className="flex items-center gap-2">
            <FileText size={20} className="text-[#f97316]" />
            <h2 className="text-lg font-bold text-white">Report Preview</h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 bg-[#1a1a1a] rounded-lg p-1 border border-[#333]">
              <button 
                onClick={() => setLayout('1-col')} 
                className={`p-1.5 rounded transition-colors ${layout === '1-col' ? 'bg-[#333] text-white' : 'text-gray-500 hover:text-gray-300'}`}
                title="1 Column Layout"
              >
                <Rows size={16} />
              </button>
              <button 
                onClick={() => setLayout('2-col')} 
                className={`p-1.5 rounded transition-colors ${layout === '2-col' ? 'bg-[#333] text-white' : 'text-gray-500 hover:text-gray-300'}`}
                title="2 Columns Grid"
              >
                <LayoutGrid size={16} />
              </button>
            </div>
            
            <Button size="sm" onClick={exportToPDF} className="bg-red-600 hover:bg-red-700 text-white border-0">
              <Download size={14} className="mr-2" /> PDF
            </Button>
            <Button size="sm" onClick={exportToWord} className="bg-orange-600 hover:bg-orange-700 text-white border-0">
              <Download size={14} className="mr-2" /> Word (.doc)
            </Button>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/10 transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 bg-[#0a0a0a] flex justify-center custom-scrollbar">
          <div 
            ref={previewRef} 
            className="bg-[#1a1a1a] w-full max-w-[210mm] min-h-[297mm] shadow-2xl p-10 text-[#e0e0e0] border border-[#333]"
            style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}
          >
            <div style={{ borderBottom: '2px solid #f97316', paddingBottom: '10px', marginBottom: '20px' }}>
              <h1 style={{ fontSize: '24px', color: '#f97316', margin: 0, fontWeight: 'bold' }}>ADIA DOE Analysis Report</h1>
              <p style={{ color: '#888', fontSize: '12px', margin: '5px 0 0 0' }}>Generated: {new Date().toLocaleString()}</p>
              <p style={{ color: '#888', fontSize: '12px', margin: 0 }}>Model Type: {results?.type}</p>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', color: '#f97316', borderBottom: '1px solid #333', paddingBottom: '5px', fontWeight: 'bold' }}>1. Model Summary</h2>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#222' }}>
                    <th style={{ padding: '8px', border: '1px solid #444', textAlign: 'left', color: '#aaa' }}>Model Type</th>
                    <th style={{ padding: '8px', border: '1px solid #444', textAlign: 'left', color: '#aaa' }}>R-Squared (Adj)</th>
                    <th style={{ padding: '8px', border: '1px solid #444', textAlign: 'left', color: '#aaa' }}>Std Error (S)</th>
                    <th style={{ padding: '8px', border: '1px solid #444', textAlign: 'left', color: '#aaa' }}>F-Statistic</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: '8px', border: '1px solid #444' }}>{results?.type}</td>
                    <td style={{ padding: '8px', border: '1px solid #444' }}>{results?.type === 'Taguchi' ? 'N/A' : `${(results?.R2Adj ? results.R2Adj * 100 : (results?.R2 || 0) * 100).toFixed(2)}%`}</td>
                    <td style={{ padding: '8px', border: '1px solid #444' }}>{results?.S ? results.S.toFixed(4) : 'N/A'}</td>
                    <td style={{ padding: '8px', border: '1px solid #444' }}>{results?.F ? results.F.toFixed(2) : 'N/A'}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', color: '#f97316', borderBottom: '1px solid #333', paddingBottom: '5px', fontWeight: 'bold' }}>2. Model Equation</h2>
              <div style={{ backgroundColor: '#1a1a1a', padding: '15px', borderRadius: '4px', border: '1px solid #333', fontFamily: 'monospace', fontSize: '12px', color: '#10b981' }}>
                {results?.type === 'Taguchi' 
                  ? 'Taguchi models optimize S/N ratios for robust design; an explicit polynomial regression equation is not generated.' 
                  : (results?.equation || 'No equation available')}
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', color: '#f97316', borderBottom: '1px solid #333', paddingBottom: '5px', marginBottom: '15px', fontWeight: 'bold' }}>3. Analysis Diagrams</h2>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: layout === '2-col' ? '1fr 1fr' : '1fr', 
                gap: '20px' 
              }}>
                {plotsToShow.map(pt => (
                  <div key={pt} style={{ border: '1px solid #333', padding: '10px', borderRadius: '4px', background: '#1a1a1a' }}>
                    <div style={{ width: '100%', height: '350px', overflow: 'hidden' }}>
                      <PlotlyPlots 
                        type={pt as any} 
                        results={results} 
                        data={data} 
                        headers={headers} 
                        factors={plotFactors} 
                        holdValues={holdValues} 
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const GlobalReportPreviewModal = ({ 
  isOpen, 
  onClose, 
  reportData 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  reportData: { html: string, projectName: string } | null 
}) => {
  const [layout, setLayout] = useState<'1-col' | '2-col'>('1-col');

  if (!isOpen || !reportData) return null;

  const exportToWord = async () => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(reportData.html, 'text/html');
      const bodyContent = doc.body;
      // Word cannot execute drill-down navigation: expand the complete hierarchy.
      bodyContent.querySelectorAll<HTMLElement>('.diagram-layer-view').forEach(el => {
        el.style.display = 'block';
        el.style.opacity = '1';
      });
      bodyContent.querySelectorAll('script,.diagram-controls,.diagram-breadcrumbs,.diagram-link-btn,.diagram-hint').forEach(el => el.remove());
      const svgs = Array.from(bodyContent.querySelectorAll('svg'));
      const images: { id: string, data: string }[] = [];

      for (let i = 0; i < svgs.length; i++) {
        try {
          const svg = svgs[i];
          if (!svg.getAttribute('xmlns')) {
            svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
          }
          const svgData = new XMLSerializer().serializeToString(svg);
          const canvas = document.createElement("canvas");
          const scale = 2;
          const width = parseInt(svg.getAttribute("width") || "800");
          const box = (svg.getAttribute('viewBox') || '').split(/[ ,]+/).map(Number);
          const height = parseInt(svg.getAttribute("height") || String(box[2] > 0 ? Math.ceil(width * box[3] / box[2]) : 600));
          svg.setAttribute('width', String(width));
          svg.setAttribute('height', String(height));
          canvas.width = width * scale;
          canvas.height = height * scale;
          const ctx = canvas.getContext("2d");
          const img = document.createElement("img");
          img.setAttribute("src", "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData))));

          await new Promise((resolve) => {
            img.onload = () => {
              if (ctx) {
                ctx.fillStyle = "white";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.scale(scale, scale);
                ctx.drawImage(img, 0, 0);
              }
              resolve(true);
            };
            img.onerror = resolve;
          });

          const imgData = canvas.toDataURL("image/png");
          const base64Content = imgData.split(',')[1];
          const imageId = `img_${i}`;
          images.push({ id: imageId, data: base64Content });

          const newImg = document.createElement('img');
          newImg.src = `cid:${imageId}`;
          const MAX_WORD_WIDTH = 650;
          const displayWidth = width > MAX_WORD_WIDTH ? MAX_WORD_WIDTH : width;
          newImg.setAttribute('width', displayWidth.toString());
          svg.parentNode?.replaceChild(newImg, svg);
        } catch (e) {
          console.error('Failed to capture SVG for Word export', e);
        }
      }

      const htmlContent = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'>
        <head><meta charset='utf-8'><title>${escapeHtml(reportData.projectName)} Report</title>${Array.from(doc.querySelectorAll('style')).map(el => el.outerHTML).join('')}</head>
        <body style="font-family: 'Calibri', 'Segoe UI', sans-serif; font-size: 11pt; line-height: 1.5; background-color: #ffffff; color: #333333; margin: 0 auto; max-width: 800px;">
          ${bodyContent.innerHTML}
        </body>
        </html>
      `;

      const boundary = "----=_NextPart_" + Math.random().toString(36).substring(2);
      let mhtml = `MIME-Version: 1.0\nContent-Type: multipart/related; boundary="${boundary}"\n\n`;
      mhtml += `--${boundary}\nContent-Type: text/html; charset="utf-8"\nContent-Transfer-Encoding: 8bit\n\n`;
      mhtml += htmlContent + `\n\n`;
      images.forEach(img => {
        mhtml += `--${boundary}\nContent-Type: image/png\nContent-Transfer-Encoding: base64\nContent-ID: <${img.id}>\n\n`;
        mhtml += img.data + `\n\n`;
      });
      mhtml += `--${boundary}--`;

      const blob = new Blob([mhtml], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${reportData.projectName.replace(/\s+/g, '_')}_Report.doc`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Failed to export report to Word', err);
    }
  };

  const exportToHTML = () => {
    const blob = new Blob([reportData.html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${reportData.projectName.replace(/\s+/g, '_')}_Report.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#1a1a1a] border border-[#333] rounded-xl w-full max-w-6xl h-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-[#222] bg-[#141414]">
          <div className="flex items-center gap-2">
            <FileText size={20} className="text-[#f97316]" />
            <h2 className="text-lg font-bold text-white">{reportData.projectName} — Interactive Report</h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 bg-[#1a1a1a] rounded-lg p-1 border border-[#333]">
              <button 
                onClick={() => setLayout('1-col')} 
                className={`p-1.5 rounded transition-colors ${layout === '1-col' ? 'bg-[#333] text-white' : 'text-gray-500 hover:text-gray-300'}`}
                title="1 Column Layout"
              >
                <Rows size={16} />
              </button>
              <button 
                onClick={() => setLayout('2-col')} 
                className={`p-1.5 rounded transition-colors ${layout === '2-col' ? 'bg-[#333] text-white' : 'text-gray-500 hover:text-gray-300'}`}
                title="2 Columns Grid"
              >
                <LayoutGrid size={16} />
              </button>
            </div>
            
            <Button size="sm" onClick={exportToHTML} className="bg-emerald-600 hover:bg-emerald-700 text-white border-0">
              <Download size={14} className="mr-2" /> HTML
            </Button>
            <Button size="sm" onClick={exportToWord} className="bg-orange-600 hover:bg-orange-700 text-white border-0">
              <Download size={14} className="mr-2" /> Word (.doc)
            </Button>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/10 transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 p-4 bg-[#0a0a0a] flex justify-center overflow-hidden">
          <div className={`w-full ${layout === '2-col' ? 'max-w-[280mm]' : 'max-w-[220mm]'} h-full bg-white rounded-sm shadow-2xl overflow-hidden flex flex-col`}>
            <iframe
              srcDoc={reportData.html}
              title="Report Preview"
              className="w-full flex-1 border-0 h-full bg-white"
              sandbox="allow-scripts allow-same-origin allow-popups allow-modals"
            />
          </div>
        </div>
      </div>
    </div>
  );
};


const ADIA = () => {
  const [currentTheme, setCurrentTheme] = useState<AppTheme>(getStoredTheme);

  useEffect(() => {
    applyThemeToDOM(currentTheme);
  }, [currentTheme]);

  const [currentProjectName, setCurrentProjectName] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('projectName') || 'Main Project';
  });
  const [activeProjectPath, setActiveProjectPath] = useState<string | null>(null);
  const lastSavedSnapshotRef = useRef<string | null>(null);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showSaveSelectionModal, setShowSaveSelectionModal] = useState(false);
  const [showWelcome, setShowWelcome] = useState(() => !window.location.search.includes('projectName'));
  const [showStandby, setShowStandby] = useState(false);

  // Standby Timeout Listener (30 seconds of inactivity)
  useEffect(() => {
    if (showWelcome) return; // Don't trigger standby if the initial welcome/intro screen is visible

    let timeoutId: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setShowStandby(true);
      }, 30000); // 30 seconds
    };

    const handleActivity = () => {
      if (!showStandby) {
        resetTimer();
      }
    };

    // Activity triggers
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('mousedown', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('touchstart', handleActivity);

    // Initial trigger
    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('mousedown', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
    };
  }, [showWelcome, showStandby]);
  // STATE HOOKS
  const [variables, setVariables] = useState<VariableDef[]>([]);

  // DOE STATE (Lifted)
  const [activeModel, setActiveModel] = useState<'RSM' | 'GMDH' | 'Taguchi'>('RSM');
  const [taguchiConfig, setTaguchiConfig] = useState<{ objective: 'larger' | 'smaller' | 'nominal' | 'target', targetValue?: number }>({ objective: 'larger', targetValue: 10 });
  const [data, setData] = useState<number[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [results, setResults] = useState<any | null>(null);
  const [plotFactors, setPlotFactors] = useState<{ x: number, y: number }>({ x: 0, y: 1 });
  const [holdValues, setHoldValues] = useState<number[]>([]);
  const [plotType, setPlotType] = useState<'surface' | 'contour' | 'pareto' | 'residuals' | 'taguchi_delta' | 'pred_vs_act' | 'taguchi_main_sn' | 'taguchi_main_mean'>('surface');
  const [factors, setFactors] = useState<any[]>([]);

  // ── Statistical Functions (Lifted from DoeWorkspace) ───────────────────────
  const calculateRSM = () => {
    if (!data || data.length < 3) {
      addError('warning', 'Insufficient data points for RSM.');
      return;
    }
    const res = fitRSM({ headers, data });
    if (res.diagnostics.some(d => d.severity === 'error')) {
      addError('error', res.diagnostics.find(d => d.severity === 'error')?.message || 'RSM solve failed.');
      return;
    }
    const Y = data.map(r => r[headers.length - 1]);
    const legacyCompatible = {
      ...res,
      canonicalResult: res,
      type: 'RSM',
      Beta: res.details?.Beta,
      Beta_coded: res.details?.Beta_coded,
      R2: res.rSquared,
      R2Adj: res.adjustedRSquared,
      F: res.fStatistic,
      P: res.pValue,
      fits: res.details?.predicted,
      residuals: res.details?.residuals,
      actuals: Y
    };
    setResults(legacyCompatible);
    setActiveModel('RSM');
    addError('info', `RSM Calculated: R² = ${((res.rSquared ?? 0) * 100).toFixed(2)}%`);
  };

  const calculateGMDH = () => {
    if (!data || data.length < 5) {
      addError('warning', 'Insufficient data for GMDH.');
      return;
    }
    const res = fitGMDH({ headers, data });
    if (res.diagnostics.some(d => d.severity === 'error')) {
      addError('error', res.diagnostics.find(d => d.severity === 'error')?.message || 'GMDH solve failed.');
      return;
    }
    const Y = data.map(r => r[headers.length - 1]);
    const legacyCompatible = {
      ...res,
      canonicalResult: res,
      type: 'GMDH',
      model: res.details?.model,
      R2: res.rSquared,
      R2Adj: res.adjustedRSquared,
      fits: res.details?.predicted,
      residuals: res.details?.residuals,
      actuals: Y
    };
    setResults(legacyCompatible);
    setActiveModel('GMDH');
    addError('info', `GMDH Trained: R² = ${((res.rSquared ?? 0) * 100).toFixed(2)}%`);
  };

  const calculateTaguchi = () => {
    if (!data || data.length < 2) {
      addError('warning', 'Insufficient data for Taguchi analysis.');
      return;
    }
    const res = fitTaguchi({
      headers,
      data,
      objective: taguchiConfig.objective,
      targetValue: taguchiConfig.targetValue
    });
    if (res.diagnostics.some(d => d.severity === 'error')) {
      addError('error', res.diagnostics.find(d => d.severity === 'error')?.message || 'Taguchi analysis failed.');
      return;
    }
    const Y = data.map(r => r[headers.length - 1]);
    const legacyCompatible = {
      ...res,
      canonicalResult: res,
      type: 'Taguchi',
      snRatios: res.details?.snRatios,
      factorLevels: res.details?.factorLevels,
      objective: taguchiConfig.objective,
      targetValue: taguchiConfig.targetValue,
      R2: res.rSquared,
      grandMean: res.details?.grandMeanY,
      fits: res.details?.predicted,
      residuals: res.details?.residuals,
      actuals: Y
    };
    setResults(legacyCompatible);
    setActiveModel('Taguchi');
    addError('info', `Taguchi Analysis Completed. R² = ${((res.rSquared ?? 0) * 100).toFixed(2)}%`);
  };



  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [mobileTab, setMobileTab] = useState<'hierarchy' | 'variables' | 'canvas' | 'properties'>('canvas');

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [newVarName, setNewVarName] = useState('');
  const [newVarType, setNewVarType] = useState<VariableType>('int32');
  const [newVarValue, setNewVarValue] = useState('0');
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);

  const [scopeData, setScopeData] = useState<ScopeDataPoint[]>([]);
  const [simulationTime, setSimulationTime] = useState(0);
  const [sourceData, setSourceData] = useState<{ headers: string[]; data: any[][] } | null>(null);
  const [sampleOnTransitionOnly, setSampleOnTransitionOnly] = useState(false);

  const [isRunning, setIsRunning] = useState(false);
  const [tickMs, setTickMs] = useState(500);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [errors, setErrors] = useState<ErrorItem[]>([]);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [currentError, setCurrentError] = useState<ConnectionErrorItem | null>(null);
  const errorDialogTriggerRef = useRef<HTMLElement | null>(null);
  const errorDismissButtonRef = useRef<HTMLButtonElement | null>(null);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [showGlobalReportPreview, setShowGlobalReportPreview] = useState(false);
  const [globalReportData, setGlobalReportData] = useState<{ html: string, projectName: string } | null>(null);

  // Window Management State
  const [managedWindows, setManagedWindows] = useState<Record<ManagedWindowId, ManagedWindowState>>({
    hmi: { id: 'hmi', title: 'HMI Dashboard', isOpen: false, isMinimized: false, isMaximized: false, pos: { x: 110, y: 110 }, size: { width: 900, height: 600 }, zIndex: 10 },
    pid: { id: 'pid', title: 'PID Tuner', isOpen: false, isMinimized: false, isMaximized: false, pos: { x: 160, y: 160 }, size: { width: 1000, height: 700 }, zIndex: 10 },
    rtm: { id: 'rtm', title: 'Requirements Traceability Matrix', isOpen: false, isMinimized: false, isMaximized: false, pos: { x: 210, y: 210 }, size: { width: 900, height: 600 }, zIndex: 10 },
    doe: { id: 'doe', title: 'DOE RSM Analysis', isOpen: false, isMinimized: false, isMaximized: false, pos: { x: 260, y: 260 }, size: { width: 1100, height: 750 }, zIndex: 10 },
  });

  const [isHierarchyCollapsed, setIsHierarchyCollapsed] = useState(false);
  const [isVariablesCollapsed, setIsVariablesCollapsed] = useState(false);
  const [isPropertiesCollapsed, setIsPropertiesCollapsed] = useState(false);
  const [isScopeCollapsed, setIsScopeCollapsed] = useState(false);
  const [isScopeDetached, setIsScopeDetached] = useState(false);

  const updateManagedWindow = useCallback((id: ManagedWindowId, updates: Partial<Omit<ManagedWindowState, 'id' | 'title'>>) => {
    setManagedWindows(prev => ({
      ...prev,
      [id]: { ...prev[id], ...updates }
    }));
  }, []);

  const toggleWindow = useCallback((id: ManagedWindowId) => {
    setManagedWindows(prev => {
      const current = prev[id];
      if (current.isOpen && current.isMinimized) {
        return {
          ...prev,
          [id]: { ...current, isMinimized: false }
        };
      }
      return {
        ...prev,
        [id]: { ...current, isOpen: !current.isOpen }
      };
    });
  }, []);

  const [layers, setLayers] = useState<Layer[]>([{
    id: 'root',
    name: 'Root',
    parentStateId: null,
    stateIds: [],
    transitionIds: [],
    junctionIds: []
  }]);
  const [currentLayerId, setCurrentLayerId] = useState('root');
  const [layerStack, setLayerStack] = useState<string[]>([]);
  const [layerPath, setLayerPath] = useState(['Root']);
  const [deleteConfirmState, setDeleteConfirmState] = useState<{
    id?: string;
    ids: string[];
    name: string;
    parts: string;
    hasChildren: boolean;
    totalStates: number;
    otherDeletedIds?: string[];
  } | null>(null);

  // SysML (BDD/Requirements/IBD) deletion confirmation — replaces native window.confirm/alert
  const [sysmlDeleteConfirm, setSysmlDeleteConfirm] = useState<{
    impact: import('./engine/sysml/mutations').MutationImpact;
    transaction: import('./services/sysmlTransactionAdapter').LegacySysmlDeletionResult;
    elementName: string;
    elementKind: string;
    severity: import('./services/sysmlTransactionAdapter').ImpactSeverity;
    onConfirm: () => void;
  } | null>(null);

  const [states, setStates] = useState<StateData[]>([]);
  const [junctions, setJunctions] = useState<JunctionData[]>([]);
  const [transitions, setTransitions] = useState<TransitionData[]>([]);
  const [view, setView] = useState({ scale: 1, offsetX: 0, offsetY: 0 });
  const [gridEnabled, setGridEnabled] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);

  // Selection state (supports multiple items)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [hoveredTransitionId, setHoveredTransitionId] = useState<string | null>(null);

  const [isCreatingTransition, setIsCreatingTransition] = useState(false);
  const [transitionSourceId, setTransitionSourceId] = useState<string | null>(null);
  const [requirementConnectionPicker, setRequirementConnectionPicker] = useState<{ sourceId: string; targetId: string; reversedKinds?: RelationshipData['type'][] } | null>(null);
  const [diagramPresentations, setDiagramPresentations] = useState<Record<string, { elementIds: string[] }>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });
  const [mousePos, setMousePos] = useState<Point>({ x: 0, y: 0 });
  const [showZoomIndicator, setShowZoomIndicator] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const isSpacePressed = useRef(false);
  const spaceComboUsed = useRef(false);
  const lastMousePos = useRef<Point>({ x: 0, y: 0 });
  const midDown = useRef(false);
  const rightDown = useRef(false);

  // Simulation state
  const [activeStates, setActiveStates] = useState<Record<string, string>>({});
  const [stateTimers, setStateTimers] = useState<Record<string, number>>({});
  const [traceHistory, setTraceHistory] = useState<Array<{ time: number; event: string; group: string; state: string; transition: string; transitionId?: string }>>([]);
  const [firedTransitions, setFiredTransitions] = useState<Record<string, number>>({});
  const simulationSessionRef = useRef<AppSimulationSession | null>(null);
  const simulationLifecycleRef = useRef(createAppSimulationLifecycle());

  // Code generation state
  const [showCodegenDialog, setShowCodegenDialog] = useState(false);
  const [xBridgesStateId, setXBridgesStateId] = useState<string | null>(null);
  const [generatedFiles, setGeneratedFiles] = useState<{ name: string; content: string }[]>([]);
  const [codegenErrors, setCodegenErrors] = useState<ErrorItem[]>([]);
  const [codegenWarnings, setCodegenWarnings] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAiValidating, setIsAiValidating] = useState(false);

  // History state for Undo/Redo
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // REQ-ENGINE-004: Generation log with checksums
  const [generationLog, setGenerationLog] = useState<string[]>([]);
  const [safetyMode, setSafetyMode] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  // BDD STATE (SysML)
  // Tab Management State
  const [openTabs, setOpenTabs] = useState<string[]>(['statemachine']);
  const [diagramMode, setDiagramModeState] = useState<DiagramMode>('statemachine' as DiagramMode);
  const [plantUmlDiagram, setPlantUmlDiagram] = useState<VisualDiagramModel>(() => createVisualDiagram('sequence', 'New sequence diagram'));
  const syncTabRef = useRef<(mode: DiagramMode) => void>(() => {});

  const setDiagramMode = useCallback((mode: DiagramMode) => {
    setSelectedIds([]);
    setDiagramModeState(mode);
    setOpenTabs(prev => {
      if (prev.includes(mode)) return prev;
      return [...prev, mode];
    });
    syncTabRef.current(mode);
  }, []);
  const [helpInitialTopic, setHelpInitialTopic] = useState<string>("getting-started");

  const handleOpenHelp = useCallback((topic?: string) => {
    setHelpInitialTopic(topic || (diagramMode === 'entropy' ? 'entropy-opm' : 'getting-started'));
    setShowHelpModal(true);
  }, [diagramMode]);

  const [activePropTab, setActivePropTab] = useState<'general' | 'assign' | 'governance'>('general');

  // HIL (Hardware-in-the-Loop) state
  const [hilConfig, setHilConfig] = useState<HILConfig>({
    enabled: false,
    target: 'Generic',
    clockSpeed: 16,
    channels: [],
    mappings: [],
    commPort: '',
    baudRate: 115200
  });

  const [hilSessionState, setHilSessionState] = useState<HILSessionState>({
    status: 'disconnected',
    channelValues: {},
    faultInjections: {},
    log: []
  });
  const [blocks, setBlocks] = useState<BlockData[]>([]);
  const [relationships, setRelationships] = useState<RelationshipData[]>([]);
  const [parts, setParts] = useState<PartData[]>([]);
  const [connectors, setConnectors] = useState<ConnectorData[]>([]);
  const [canonicalSysmlRepository, setCanonicalSysmlRepository] = useState(createEmptyRepository);
  const [sysmlStore, setSysmlStore] = useState(() => fromRepository(createEmptyRepository()));
  const sysmlCoordinates = useMemo(
    () => Object.fromEntries(sysmlStore.coordinates.entries()),
    [sysmlStore],
  );
  const sysmlDiagramPresentations = useMemo(
    () => Object.fromEntries(sysmlStore.diagramPresentations.entries()),
    [sysmlStore],
  );
  // Explicit per-baseline deletion authorizations granted from the governance
  // panel. Projection-only state: it never mutates semantics by itself; the
  // gateway still requires a confirmed impact hash for destructive mutations.
  const [authorizedBaselineIds, setAuthorizedBaselineIds] = useState<string[]>([]);

  // SysML Application Delegate connected to the canonical command gateway
  const sysmlApplicationDelegate = useMemo<SysmlApplicationDelegate>(() => {
    return createSysmlDelegate({
      getState: () => ({
        repository: canonicalSysmlRepository,
        history: createHistory(canonicalSysmlRepository),
        store: sysmlStore,
        coordinates: Object.fromEntries(sysmlStore.coordinates.entries()),
        diagramPresentations: Object.fromEntries(sysmlStore.diagramPresentations.entries()),
      }),
      setState: (nextState) => {
        setCanonicalSysmlRepository(nextState.repository);
        if (nextState.store) {
          setSysmlStore(nextState.store);
        }
      },
      onStateChange: (result) => {
        setBlocks(result.view.blocks);
        setRelationships(result.view.relationships);
        setParts(result.view.parts);
        setConnectors(result.view.connectors);
      },
    });
  }, [canonicalSysmlRepository, sysmlStore]);

  // Report Application Delegate connected to the real report export pipeline
  const reportApplicationDelegate = useMemo<ReportApplicationDelegate>(() => {
    return createReportDelegate({
      getProjectData: () => ({
        projectId: 'ADIA_Project',
        modelRevision: canonicalSysmlRepository.revision,
        blocks,
        relationships,
      }),
      outputDir: './reports',
    });
  }, [canonicalSysmlRepository.revision, blocks, relationships]);

  // The legacy diagram editors still expose array setters. Keep the canonical
  // store current until every editor has been migrated to gateway commands.
  // The debounce prevents pointer-move events from rebuilding the store on
  // every frame, while the revision is advanced only for a settled edit.
  useEffect(() => {
    if (isDragging) return;
    const timer = setTimeout(() => {
      setCanonicalSysmlRepository(previous => {
        const next = mergeLegacyDiagramIntoRepository(previous, {
          blocks,
          parts,
          connectors,
          relationships,
        });
        setSysmlStore(current => fromRepository(
          next,
          Object.fromEntries(current.coordinates.entries()),
          Object.fromEntries(current.diagramPresentations.entries()),
        ));
        return next;
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [blocks, parts, connectors, relationships, isDragging]);

  const blocksById = useMemo(() => {
    const map = new Map<string, BlockData>();
    for (const b of blocks) {
      map.set(b.id, b);
    }
    return map;
  }, [blocks]);

  const partsById = useMemo(() => {
    const map = new Map<string, PartData>();
    for (const p of parts) {
      map.set(p.id, p);
    }
    return map;
  }, [parts]);

  const diagramViewport = useMemo(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const w = rect?.width || 1200;
    const h = rect?.height || 800;
    return computeViewportBounds(view, { width: w, height: h }, 300);
  }, [view]);

  const culledDiagram = useMemo(() => {
    const limits = loadStoredPerformanceLimits();
    const threshold = limits.virtualizationThreshold ?? 150;
    if (!limits.forcePerformanceMode && blocks.length < threshold && parts.length < threshold) {
      return null;
    }
    return cullElements(diagramViewport, blocks, relationships, parts, connectors, undefined, 500, {
      storeRevision: sysmlStore.revision,
      ibdContextBlockId: currentLayerId,
    });
  }, [diagramViewport, blocks, relationships, parts, connectors, sysmlStore.revision, currentLayerId]);

  const requirementsDiagramScope = useMemo(
    () => getRequirementsDiagramScope(blocks, relationships, currentLayerId),
    [blocks, relationships, currentLayerId],
  );

  // Schedule large validation asynchronously after edits with revision-based cancellation
  useEffect(() => {
    if (blocks.length === 0 && parts.length === 0) return;
    const cancel = getDefaultSysmlWorkerClient().scheduleValidation(
      sysmlStore,
      sysmlStore.revision,
      () => {
        // Validation completed in worker thread without blocking UI
      }
    );
    return cancel;
  }, [sysmlStore.revision]);

  const [showSysmlDiagnostics, setShowSysmlDiagnostics] = useState(false);
  const [interfaceRealizations, setInterfaceRealizations] = useState<InterfaceRealizationData[]>([]);
  const [customStereotypes, setCustomStereotypes] = useState<string[]>([]);
  const [uiZoom, setUiZoom] = useState(1.0);

  // HMI STATE
  const [hmiComponents, setHmiComponents] = useState<HmiComponent[]>([]);
  const [draggedPort, setDraggedPort] = useState<{ elementId: string, portId: string } | null>(null);

  // Global X-Bridges persistence
  const [globalXBridgesNodes, setGlobalXBridgesNodes] = useState<any[]>([]);
  const [globalXBridgesEdges, setGlobalXBridgesEdges] = useState<any[]>([]);
  const globalXBridgesNodesRef = useRef<any[]>(globalXBridgesNodes);
  const globalXBridgesEdgesRef = useRef<any[]>(globalXBridgesEdges);

  useEffect(() => {
    globalXBridgesNodesRef.current = globalXBridgesNodes;
  }, [globalXBridgesNodes]);

  useEffect(() => {
    globalXBridgesEdgesRef.current = globalXBridgesEdges;
  }, [globalXBridgesEdges]);

  // V-Lab STATE
  const [vlabNodes, setVlabNodes] = useState<any[]>([]);
  const [vlabEdges, setVlabEdges] = useState<any[]>([]);
  const [vlabSelectedNodeId, setVlabSelectedNodeId] = useState<string | null>(null);
  const [xBridgesSelectedNodeId, setXBridgesSelectedNodeId] = useState<string | null>(null);

  // ENTROPY OPM STATE
  const [entropyNodes, setEntropyNodes] = useState<AppNode[]>([]);
  const [entropyEdges, setEntropyEdges] = useState<AppEdge[]>([]);
  const [opmSimulationConfig, setOpmSimulationConfig] = useState<OpmSimulationConfig>(DEFAULT_OPM_SIMULATION_CONFIG);

  // FACTORY I/O GATEWAY STATE
  const [showFactoryIOGateway, setShowFactoryIOGateway] = useState(false);
  const [factoryIOMapping, setFactoryIOMapping] = useState<{ adiaVarId: string, factoryTagId: string | number, type: 'sensor' | 'actuator' }[]>([]);
  const [factoryIOEnabled, setFactoryIOEnabled] = useState(false);
  const [factoryIOStatus, setFactoryIOStatus] = useState<'connected' | 'disconnected' | 'error'>('disconnected');

  // Multi-File and Tab Management State
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const [openTabIds, setOpenTabIds] = useState<string[]>([]);
  const [activeFileId, setActiveFileId] = useState<string>('');
  const [showWorkspaceFileDialog, setShowWorkspaceFileDialog] = useState(false);
  const [sharedClipboard, setSharedClipboard] = useState<{
    nodes: any[];
    edges: any[];
    sourceFileId: string;
  } | null>(null);

  // Helper to get active state data for a type
  const getActiveStateData = useCallback((type: string) => {
    switch (type) {
      case 'statemachine':
        return {
          ...createPersistedAppSimulationModel({
            tickMs, states, junctions, transitions, variables, layers,
            safetyMode, hilConfig,
          }),
          view,
        };
      case 'bdd':
        return { blocks: blocks.filter(b => b.stereotype !== 'requirement'), relationships, customStereotypes };
      case 'requirements':
        return {
          blocks: blocks.filter(b => requirementsDiagramScope.visibleBlockIds.has(b.id)),
          relationships: relationships.filter(r => requirementsDiagramScope.visibleRelationshipIds.has(r.id)),
        };
      case 'ibd':
        return { parts, connectors, interfaceRealizations };
      case 'xbridges':
        return { globalXBridgesNodes, globalXBridgesEdges };
      case 'vlab':
        return { vlabNodes, vlabEdges };
      case 'hil':
        return hilConfig;
      case 'entropy':
        return { entropyNodes, entropyEdges, opmSimulationConfig };
      case 'hmi':
        return { hmiComponents };
      case 'doe':
        return { headers, data, activeModel, taguchiConfig, results };
      default:
        return null;
    }
  }, [
    states, junctions, transitions, layers, variables, view, tickMs, safetyMode,
    blocks, relationships, customStereotypes, parts, connectors, interfaceRealizations,
    globalXBridgesNodes, globalXBridgesEdges, vlabNodes, vlabEdges, hilConfig,
    entropyNodes, entropyEdges, opmSimulationConfig, hmiComponents, headers, data, activeModel, taguchiConfig, results,
    requirementsDiagramScope,
  ]);

  // Helper to save current active file state into workspaceFiles list
  const saveCurrentFileState = useCallback((filesList: WorkspaceFile[], activeId: string): WorkspaceFile[] => {
    return filesList.map(f => {
      if (f.id === activeId) {
        const liveData = getActiveStateData(f.type);
        return { ...f, data: liveData };
      }
      return f;
    });
  }, [getActiveStateData]);

  const applyStateMachineSnapshot = useCallback((snapshot: unknown) => (
    applyPersistedAppSimulationModel(snapshot, restored => {
      setStates(restored.states);
      setJunctions(restored.junctions);
      setTransitions(restored.transitions);
      setLayers(restored.layers);
      setVariables(restored.variables);
      setTickMs(restored.tickMs);
      setSafetyMode(restored.safetyMode);
      setHilConfig(restored.hilConfig ?? {
        enabled: false,
        target: 'Generic',
        clockSpeed: 16,
        channels: [],
        mappings: [],
        commPort: '',
        baudRate: 115200,
      });
    })
  ), []);

  // Helper to load file state into respective state variables
  const loadStateForFile = useCallback((file: WorkspaceFile) => {
    if (!file.data) {
      switch (file.type) {
        case 'statemachine':
          setStates([]); setJunctions([]); setTransitions([]); setLayers([]); setVariables([]);
          break;
        case 'bdd':
          setBlocks(prev => prev.filter(b => b.stereotype === 'requirement'));
          setRelationships(prev => prev.filter(r => 
            r.type === 'deriveReqt' || r.type === 'derive' || r.type === 'refine' || r.type === 'satisfy' || r.type === 'verify' || r.type === 'trace'
          ));
          break;
        case 'requirements':
          setBlocks(prev => prev.filter(b => b.stereotype !== 'requirement'));
          setRelationships(prev => prev.filter(r => 
            r.type !== 'deriveReqt' && r.type !== 'derive' && r.type !== 'refine' && r.type !== 'satisfy' && r.type !== 'verify' && r.type !== 'trace'
          ));
          break;
        case 'ibd':
          setParts([]); setConnectors([]); setInterfaceRealizations([]);
          break;
        case 'xbridges':
          setGlobalXBridgesNodes([]); setGlobalXBridgesEdges([]);
          break;
        case 'vlab':
          setVlabNodes([]); setVlabEdges([]);
          break;
        case 'hil':
          setHilConfig({
            enabled: false,
            target: 'Generic',
            clockSpeed: 16,
            channels: [],
            mappings: [],
            commPort: '',
            baudRate: 115200
          });
          break;
        case 'entropy':
          setEntropyNodes([]); setEntropyEdges([]); setOpmSimulationConfig(DEFAULT_OPM_SIMULATION_CONFIG);
          break;
        case 'hmi':
          setHmiComponents([]);
          break;
        case 'doe':
          setHeaders([]); setData([]); setActiveModel('RSM'); setTaguchiConfig({ objective: 'larger', targetValue: 10 }); setResults(null);
          break;
      }
      return;
    }

    const d = file.data;
    switch (file.type) {
      case 'statemachine':
        applyStateMachineSnapshot(d);
        if (d.view) setView(d.view);
        break;
      case 'bdd':
        setBlocks(prev => [
          ...prev.filter(b => b.stereotype === 'requirement'),
          ...(d.blocks || [])
        ]);
        if (d.relationships) {
          setRelationships(prev => {
            const relMap = new Map<string, RelationshipData>();
            prev.forEach(r => {
              if (r.type === 'deriveReqt' || r.type === 'derive' || r.type === 'refine' || r.type === 'satisfy' || r.type === 'verify' || r.type === 'trace') {
                relMap.set(r.id, r);
              }
            });
            (d.relationships || []).forEach((r: RelationshipData) => relMap.set(r.id, r));
            return Array.from(relMap.values());
          });
        }
        if (d.customStereotypes) setCustomStereotypes(d.customStereotypes);
        break;
      case 'requirements':
        setBlocks(prev => [
          ...prev.filter(b => b.stereotype !== 'requirement'),
          ...(d.blocks || [])
        ]);
        if (d.relationships) {
          setRelationships(prev => {
            const relMap = new Map<string, RelationshipData>();
            prev.forEach(r => {
              if (r.type !== 'deriveReqt' && r.type !== 'derive' && r.type !== 'refine' && r.type !== 'satisfy' && r.type !== 'verify' && r.type !== 'trace') {
                relMap.set(r.id, r);
              }
            });
            (d.relationships || []).forEach((r: RelationshipData) => relMap.set(r.id, r));
            return Array.from(relMap.values());
          });
        }
        break;
      case 'ibd':
        if (d.parts) setParts(d.parts);
        if (d.connectors) setConnectors(d.connectors);
        if (d.interfaceRealizations) setInterfaceRealizations(d.interfaceRealizations);
        if (d.parts && d.parts.length > 0) {
          const firstBlockId = d.parts[0].blockId;
          if (firstBlockId && d.parts.every((p: any) => p.blockId === firstBlockId)) {
            const targetBlock = blocks.find((b: any) => b.id === firstBlockId);
            if (targetBlock) {
              setCurrentLayerId(firstBlockId);
              setLayerStack([firstBlockId]);
              setLayerPath(['Root', targetBlock.name]);
            }
          }
        }
        break;
      case 'xbridges':
        setGlobalXBridgesNodes(d.globalXBridgesNodes || []);
        setGlobalXBridgesEdges(d.globalXBridgesEdges || []);
        break;
      case 'vlab':
        setVlabNodes(d.vlabNodes || []);
        setVlabEdges(d.vlabEdges || []);
        break;
      case 'hil':
        setHilConfig(d);
        break;
      case 'entropy':
        setEntropyNodes(d.entropyNodes || []);
        setEntropyEdges(d.entropyEdges || []);
        setOpmSimulationConfig(d.opmSimulationConfig || DEFAULT_OPM_SIMULATION_CONFIG);
        break;
      case 'hmi':
        setHmiComponents(d.hmiComponents || []);
        break;
      case 'doe':
        if (d.headers) setHeaders(d.headers);
        if (d.data) setData(d.data);
        if (d.activeModel) setActiveModel(d.activeModel);
        if (d.taguchiConfig) setTaguchiConfig(d.taguchiConfig);
        if (d.results) setResults(d.results);
        break;
    }
  }, [
    setStates, setJunctions, setTransitions, setLayers, setVariables, setView, setTickMs,
    setBlocks, setRelationships, setCustomStereotypes, setParts, setConnectors, setInterfaceRealizations,
    setGlobalXBridgesNodes, setGlobalXBridgesEdges, setVlabNodes, setVlabEdges, setHilConfig,
    setEntropyNodes, setEntropyEdges, setOpmSimulationConfig, setHmiComponents, setHeaders, setData, setActiveModel, setTaguchiConfig, setResults,
    applyStateMachineSnapshot
  ]);

  // Switch active file function
  const switchActiveFile = useCallback((newFileId: string) => {
    setSelectedIds([]);
    setWorkspaceFiles(prevFiles => {
      let updatedFiles = prevFiles;
      if (activeFileId) {
        updatedFiles = saveCurrentFileState(prevFiles, activeFileId);
      }
      
      const targetFile = updatedFiles.find(f => f.id === newFileId);
      if (targetFile) {
        loadStateForFile(targetFile);
        setDiagramModeState(targetFile.type as DiagramMode);
        setActiveFileId(newFileId);
      }
      
      return updatedFiles;
    });
  }, [activeFileId, saveCurrentFileState, loadStateForFile]);

  // Create new file function
  const createNewFile = useCallback((name: string, type: string) => {
    const newId = `file_${Date.now()}`;
    const newFile: WorkspaceFile = {
      id: newId,
      name: name,
      type: type,
      data: null
    };
    
    setWorkspaceFiles(prev => {
      let updatedFiles = prev;
      if (activeFileId) {
        updatedFiles = saveCurrentFileState(prev, activeFileId);
      }
      return [...updatedFiles, newFile];
    });
    
    setOpenTabIds(prev => {
      if (prev.includes(newId)) return prev;
      return [...prev, newId];
    });
    
    setActiveFileId(newId);
    setDiagramModeState(type as DiagramMode);
    loadStateForFile(newFile);
  }, [activeFileId, saveCurrentFileState, loadStateForFile]);

  // Close tab function
  const closeTab = useCallback((fileId: string) => {
    setOpenTabIds(prev => {
      const next = prev.filter(id => id !== fileId);
      
      if (activeFileId === fileId) {
        if (next.length > 0) {
          const index = prev.indexOf(fileId);
          const nextActiveId = next[Math.min(index, next.length - 1)];
          setTimeout(() => {
            switchActiveFile(nextActiveId);
          }, 0);
        } else {
          const fallbackId = 'default_sm';
          setTimeout(() => {
            setOpenTabIds([fallbackId]);
            switchActiveFile(fallbackId);
          }, 0);
        }
      }
      return next;
    });
  }, [activeFileId, switchActiveFile]);

  // Open file in tab function
  const openFileInTab = useCallback((fileId: string) => {
    setSelectedIds([]);
    setOpenTabIds(prev => {
      if (prev.includes(fileId)) return prev;
      return [...prev, fileId];
    });
    switchActiveFile(fileId);
  }, [switchActiveFile]);

  // Sync tab with diagram mode helper
  const syncTabWithMode = useCallback((mode: DiagramMode) => {
    // 1. Check if the active file is already of this type
    const activeFile = workspaceFiles.find(f => f.id === activeFileId);
    if (activeFile && activeFile.type === mode) {
      return; // Already active file of this type
    }
    
    // 2. Find if a file of this type is already open in tabs
    const openTabFile = workspaceFiles.find(f => openTabIds.includes(f.id) && f.type === mode);
    if (openTabFile) {
      switchActiveFile(openTabFile.id);
      return;
    }
    
    // 3. Find if a file of this type exists in workspaceFiles but not open in tabs
    const existingFile = workspaceFiles.find(f => f.type === mode);
    if (existingFile) {
      openFileInTab(existingFile.id);
      return;
    }
    
    // 4. If no file of this type exists, create a default file of this type
    const defaultNames: Record<string, string> = {
      statemachine: 'Main State Machine',
      bdd: 'Main SysML BDD',
      requirements: 'Main Requirements',
      ibd: 'Main SysML IBD',
      xbridges: 'Main X-Bridges',
      vlab: 'Main V-Lab',
      hil: 'Main HIL',
      entropy: 'Main ENTROPY',
      hmi: 'Main HMI',
      doe: 'Main DOE'
    };
    const name = defaultNames[mode] || `Main ${mode}`;
    createNewFile(name, mode);
  }, [activeFileId, workspaceFiles, openTabIds, switchActiveFile, openFileInTab, createNewFile]);

  // Update the ref so the switcher callback can run it with fresh state
  useEffect(() => {
    syncTabRef.current = syncTabWithMode;
  }, [syncTabWithMode]);

  const handleExportToVLab = (block?: any) => {
    if (!results) {
      addError('warning', 'Please calculate a model first.');
      return;
    }
    // Prevent React events from being treated as block data
    const actualBlock = (block && block.nativeEvent) ? null : block;
    
    let newNode: any = actualBlock;
    if (!newNode) {
      const exportRes = createVLabDOEBlock(results.canonicalResult || results);
      if ('success' in exportRes && !exportRes.success) {
        addError('error', exportRes.diagnostics[0]?.message || 'Failed to export V-Lab block.');
        return;
      }
      newNode = exportRes;
    }
    console.log('[DOE EXPORT DEBUG] Exporting to VLab:', newNode);
    
    const getTargetFileForMode = (mode: DiagramMode) => {
      const activeFile = workspaceFiles.find(f => f.id === activeFileId);
      if (activeFile && activeFile.type === mode) {
        return { id: activeFile.id, isNew: false, name: activeFile.name };
      }
      const openTabFile = workspaceFiles.find(f => openTabIds.includes(f.id) && f.type === mode);
      if (openTabFile) {
        return { id: openTabFile.id, isNew: false, name: openTabFile.name };
      }
      const existingFile = workspaceFiles.find(f => f.type === mode);
      if (existingFile) {
        return { id: existingFile.id, isNew: false, name: existingFile.name };
      }
      const defaultNames: Record<string, string> = {
        xbridges: 'Main X-Bridges',
        vlab: 'Main V-Lab'
      };
      const name = defaultNames[mode] || `Main ${mode}`;
      const newId = `file_${Date.now()}`;
      return { id: newId, isNew: true, name };
    };
    
    const target = getTargetFileForMode('vlab');
    
    if (target.isNew) {
      const newFile: WorkspaceFile = {
        id: target.id,
        name: target.name,
        type: 'vlab',
        data: {
          vlabNodes: [newNode],
          vlabEdges: []
        }
      };
      
      setWorkspaceFiles(prev => {
        let updatedFiles = prev;
        if (activeFileId) {
          updatedFiles = saveCurrentFileState(prev, activeFileId);
        }
        return [...updatedFiles, newFile];
      });
      
      setOpenTabIds(prev => {
        if (prev.includes(target.id)) return prev;
        return [...prev, target.id];
      });
      
      setActiveFileId(target.id);
      setDiagramModeState('vlab');
      loadStateForFile(newFile);
    } else {
      setWorkspaceFiles(prev => {
        let updated = prev;
        if (activeFileId) {
          updated = saveCurrentFileState(prev, activeFileId);
        }
        return updated.map(f => {
          if (f.id === target.id) {
            const currentData = f.data || { vlabNodes: [], vlabEdges: [] };
            const currentNodes = currentData.vlabNodes || [];
            return {
              ...f,
              data: {
                ...currentData,
                vlabNodes: [...currentNodes, newNode]
              }
            };
          }
          return f;
        });
      });
      
      if (activeFileId === target.id) {
        setVlabNodes(prev => [...prev, newNode]);
      }
      
      openFileInTab(target.id);
    }
    
    toggleWindow('doe');
    addError('info', `Exported ${activeModel} model to V-Lab workspace.`);
  };

  const handleExportToXBridges = () => {
    if (!results) {
      addError('warning', 'Please calculate a model first.');
      return;
    }
    const exportRes = createXBridgesDOEBlock(results.canonicalResult || results);
    if ('success' in exportRes && !exportRes.success) {
      addError('error', exportRes.diagnostics[0]?.message || 'Failed to export X-Bridges block.');
      return;
    }
    const newNode = exportRes;
    
    if (xBridgesStateId) {
      // 1. If inside a state-specific sub-workspace, append node to that state's xBridgesModel.nodes
      setStates(prev => prev.map(s => 
        s.id === xBridgesStateId 
          ? {
              ...s,
              xBridgesModel: {
                ...s.xBridgesModel,
                nodes: [...(s.xBridgesModel?.nodes || []), newNode],
                edges: Array.from(s.xBridgesModel?.edges || []),
                mappings: Array.from(s.xBridgesModel?.mappings || [])
              }
            }
          : s
      ));
      addError('info', `Exported ${activeModel} model to state sub-workspace.`);
    } else {
      // 2. Otherwise, find or create the target xbridges file
      const getTargetFileForMode = (mode: DiagramMode) => {
        const activeFile = workspaceFiles.find(f => f.id === activeFileId);
        if (activeFile && activeFile.type === mode) {
          return { id: activeFile.id, isNew: false, name: activeFile.name };
        }
        const openTabFile = workspaceFiles.find(f => openTabIds.includes(f.id) && f.type === mode);
        if (openTabFile) {
          return { id: openTabFile.id, isNew: false, name: openTabFile.name };
        }
        const existingFile = workspaceFiles.find(f => f.type === mode);
        if (existingFile) {
          return { id: existingFile.id, isNew: false, name: existingFile.name };
        }
        const defaultNames: Record<string, string> = {
          xbridges: 'Main X-Bridges',
          vlab: 'Main V-Lab'
        };
        const name = defaultNames[mode] || `Main ${mode}`;
        const newId = `file_${Date.now()}`;
        return { id: newId, isNew: true, name };
      };
      
      const target = getTargetFileForMode('xbridges');
      
      if (target.isNew) {
        const newFile: WorkspaceFile = {
          id: target.id,
          name: target.name,
          type: 'xbridges',
          data: {
            globalXBridgesNodes: [...(globalXBridgesNodes || []), newNode],
            globalXBridgesEdges: []
          }
        };
        
        setWorkspaceFiles(prev => {
          let updatedFiles = prev;
          if (activeFileId) {
            updatedFiles = saveCurrentFileState(prev, activeFileId);
          }
          return [...updatedFiles, newFile];
        });
        
        setOpenTabIds(prev => {
          if (prev.includes(target.id)) return prev;
          return [...prev, target.id];
        });
        
        setActiveFileId(target.id);
        setDiagramModeState('xbridges');
        loadStateForFile(newFile);
      } else {
        setWorkspaceFiles(prev => {
          let updated = prev;
          if (activeFileId) {
            updated = saveCurrentFileState(prev, activeFileId);
          }
          return updated.map(f => {
            if (f.id === target.id) {
              const currentData = f.data || { globalXBridgesNodes: [], globalXBridgesEdges: [] };
              const currentNodes = currentData.globalXBridgesNodes || [];
              return {
                ...f,
                data: {
                  ...currentData,
                  globalXBridgesNodes: [...currentNodes, newNode]
                }
              };
            }
            return f;
          });
        });
        
        if (activeFileId === target.id) {
          setGlobalXBridgesNodes(prev => [...prev, newNode]);
        }
        
        openFileInTab(target.id);
      }
      addError('info', `Exported ${activeModel} model to X-Bridges workspace.`);
    }
    
    toggleWindow('doe');
  };

  const onExportToVLab = handleExportToVLab;
  const onExportToXBridges = handleExportToXBridges;



  // Initialize workspace files on mount
  useEffect(() => {
    if (workspaceFiles.length === 0) {
      const initialFiles: WorkspaceFile[] = [
        { id: 'default_sm', name: 'Main State Machine', type: 'statemachine', data: getActiveStateData('statemachine') },
        { id: 'default_bdd', name: 'Main SysML BDD', type: 'bdd', data: getActiveStateData('bdd') },
        { id: 'default_requirements', name: 'Main Requirements', type: 'requirements', data: getActiveStateData('requirements') },
        { id: 'default_ibd', name: 'Main SysML IBD', type: 'ibd', data: getActiveStateData('ibd') },
        { id: 'default_xbridges', name: 'Main X-Bridges', type: 'xbridges', data: getActiveStateData('xbridges') },
        { id: 'default_vlab', name: 'Main V-Lab', type: 'vlab', data: getActiveStateData('vlab') },
        { id: 'default_hil', name: 'Main HIL', type: 'hil', data: getActiveStateData('hil') },
        { id: 'default_entropy', name: 'Main ENTROPY', type: 'entropy', data: getActiveStateData('entropy') },
        { id: 'default_hmi', name: 'Main HMI', type: 'hmi', data: getActiveStateData('hmi') },
        { id: 'default_doe', name: 'Main DOE', type: 'doe', data: getActiveStateData('doe') },
      ];
      setWorkspaceFiles(initialFiles);
      setOpenTabIds(['default_sm', 'default_xbridges', 'default_vlab']);
      setActiveFileId('default_sm');
    }
  }, [workspaceFiles.length, getActiveStateData]);

  // 3DEXPERIENCE GATEWAY STATE
  const [show3DXGateway, setShow3DXGateway] = useState(false);

  /**
   * Builds the list of ADIA documents that can be uploaded to 3DEXPERIENCE.
   * Computed lazily so the upload panel always reflects the current workspace state.
   */
  const adiaExportItems: AdiaExportItem[] = useMemo(() => {
    const projectPayload = {
      ...createPersistedAppSimulationModel({
        tickMs, states, junctions, transitions, layers, variables,
        safetyMode, hilConfig,
      }),
      blocks, relationships, parts, connectors, interfaceRealizations,
    };
    const projectJson = JSON.stringify(projectPayload, null, 2);
    const hasProject = states.length > 0 || blocks.length > 0;

    return [
      {
        type: 'project_json',
        fileName: `adia_project_${new Date().toISOString().slice(0, 10)}.json`,
        label: 'ADIA Project JSON',
        content: projectJson,
        mimeType: 'application/json',
        encoding: 'utf8',
        available: hasProject,
      },
      {
        type: 'xbridges_model',
        fileName: `xbridges_model_${new Date().toISOString().slice(0, 10)}.json`,
        label: 'X-Bridges Model',
        content: JSON.stringify({ nodes: globalXBridgesNodes, edges: globalXBridgesEdges }, null, 2),
        mimeType: 'application/json',
        encoding: 'utf8',
        available: globalXBridgesNodes.length > 0,
      },
      {
        type: 'vlab_model',
        fileName: `vlab_model_${new Date().toISOString().slice(0, 10)}.json`,
        label: 'V-Lab Model',
        content: JSON.stringify({ nodes: vlabNodes, edges: vlabEdges }, null, 2),
        mimeType: 'application/json',
        encoding: 'utf8',
        available: vlabNodes && vlabNodes.length > 0,
      },
    ] as AdiaExportItem[];
  }, [states, junctions, transitions, layers, variables, tickMs, safetyMode, hilConfig, blocks, relationships, parts, connectors, interfaceRealizations, globalXBridgesNodes, globalXBridgesEdges, vlabNodes, vlabEdges]);



  // AI SIDEBAR & AGENT PANEL STATE
  const [isAiSidebarOpen, setIsAiSidebarOpen] = useState(false);
  const [isAgentPanelOpen, setIsAgentPanelOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (factoryIOEnabled && (window as any).require) {
      const { ipcRenderer } = (window as any).require('electron');
      ipcRenderer.invoke('fetch-factory-io-tags').then((tags: any) => {
        if (!isMounted) return;
        if (tags && !tags.error) setFactoryIOStatus('connected');
        else setFactoryIOStatus('error');
      }).catch(() => {
        if (!isMounted) return;
        setFactoryIOStatus('error');
      });
    } else if (!factoryIOEnabled) {
      setFactoryIOStatus('disconnected');
    }
    return () => {
      isMounted = false;
    };
  }, [factoryIOEnabled]);

  const projectImportRef = useRef<HTMLInputElement>(null);
  const [importValidationError, setImportValidationError] = useState<ValidationResult | null>(null);

  const calculateChecksum = useCallback((str: string): string => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
  }, []);

  // Clipboard state
  const [clipboard, setClipboard] = useState<StateMachineClipboardData | null>(null);

  // Resizing state
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [resizeStart, setResizeStart] = useState<{ id: string, x: number, y: number, w: number, h: number, mx: number, my: number, type?: 'block' | 'state' | 'ibdContext' | 'part' } | null>(null);

  // Panel resizing state
  const [hierarchyWidth, setHierarchyWidth] = useState(256);
  const [variablesWidth, setVariablesWidth] = useState(288);
  const [propertiesWidth, setPropertiesWidth] = useState(352);
  const [scopeHeight, setScopeHeight] = useState(224);
  const [resizingPanel, setResizingPanel] = useState<string | null>(null);

  // ERROR SYSTEM
  const addError = useCallback((type: 'error' | 'warning' | 'info', message: string, source?: string, elementId?: string) => {
    const newError: ErrorItem = {
      id: uuidv4(),
      type,
      message,
      timestamp: new Date(),
      source: source || 'System',
      elementId: elementId ?? undefined
    };
    setErrors(prev => [newError, ...prev].slice(0, 100));
    if (type === 'error') {
      setCurrentError(newError);
      setShowErrorDialog(true);
      setIsRunning(false);
    }
  }, [setIsRunning, setErrors, setCurrentError, setShowErrorDialog]);

  const showConnectionPolicyError = useCallback((rejection: {
    diagnostic: ConnectionPolicyDiagnostic;
    relationshipKind: string;
    source: ConnectionEndpoint;
    target: ConnectionEndpoint;
  }, elementId?: string) => {
    const activeElement = document.activeElement;
    errorDialogTriggerRef.current = activeElement instanceof HTMLElement ? activeElement : null;
    const error: ConnectionErrorItem = {
      id: uuidv4(),
      type: 'error',
      message: rejection.diagnostic.message,
      timestamp: new Date(),
      source: 'SysML connection policy',
      elementId,
      connectionDiagnostic: rejection.diagnostic,
      relationshipKind: rejection.relationshipKind,
      sourceEndpoint: rejection.source,
      targetEndpoint: rejection.target,
    };
    setErrors(prev => [error, ...prev].slice(0, 100));
    setCurrentError(error);
    setShowErrorDialog(true);
  }, []);

  const dismissErrorDialog = useCallback(() => {
    setShowErrorDialog(false);
    const trigger = errorDialogTriggerRef.current;
    errorDialogTriggerRef.current = null;
    restoreConnectionErrorFocus(trigger);
  }, []);

  useEffect(() => {
    if (showErrorDialog) errorDismissButtonRef.current?.focus();
  }, [showErrorDialog]);

  const exportPlantUmlSource = useCallback(() => {
    const source = generateSequencePlantUml(plantUmlDiagram);
    const blob = new Blob([source], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${(plantUmlDiagram.title || 'adia-diagram').replace(/[^a-z0-9_-]+/gi, '_')}.puml`;
    anchor.click();
    URL.revokeObjectURL(url);
    addError('info', 'PlantUML source exported locally.');
  }, [plantUmlDiagram, addError]);

  // Import file as new tab function
  const handleImportFile = useCallback((name: string, type: string, fileData: any) => {
    const newId = `file_${Date.now()}`;
    const newFile: WorkspaceFile = {
      id: newId,
      name: name,
      type: type,
      data: fileData
    };
    setWorkspaceFiles(prev => [...prev, newFile]);
    setOpenTabIds(prev => {
      if (prev.includes(newId)) return prev;
      return [...prev, newId];
    });
    setActiveFileId(newId);
    setDiagramModeState(type as DiagramMode);
    loadStateForFile(newFile);
    addError('info', `Imported ${name} as a new ${type.toUpperCase()} tab.`);
  }, [loadStateForFile, addError]);

  // === Professional Report Generation ===
  const [showReportPreview, setShowReportPreview] = useState(false);

  const generateReport = useCallback(() => {
    if (!results) {
      addError('warning', 'No model results to export. Run a model first.');
      return;
    }

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageW = pdf.internal.pageSize.getWidth();
    const margin = 20;
    const contentW = pageW - margin * 2;
    let y = margin;

    const addPage = () => {
      pdf.addPage();
      y = margin;
    };

    const checkSpace = (needed: number) => {
      if (y + needed > 270) addPage();
    };

    // --- Header Bar ---
    pdf.setFillColor(10, 10, 10);
    pdf.rect(0, 0, pageW, 35, 'F');
    pdf.setFillColor(201, 168, 108);
    pdf.rect(0, 35, pageW, 1.5, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.setTextColor(201, 168, 108);
    pdf.text('ADIA', margin, 15);
    pdf.setFontSize(9);
    pdf.setTextColor(150, 150, 150);
    pdf.text('Design of Experiments — Analysis Report', margin, 22);
    pdf.setFontSize(8);
    pdf.setTextColor(100, 100, 100);
    pdf.text(`Generated: ${new Date().toLocaleString()}`, margin, 29);
    pdf.text(`Model: ${results.type}`, pageW - margin - 30, 29);

    y = 45;

    // --- Model Summary Section ---
    pdf.setFontSize(13);
    pdf.setTextColor(201, 168, 108);
    pdf.setFont('helvetica', 'bold');
    pdf.text('1. Model Summary', margin, y);
    y += 8;

    pdf.setFillColor(20, 20, 20);
    pdf.roundedRect(margin, y, contentW, 28, 2, 2, 'F');
    pdf.setDrawColor(50, 50, 50);
    pdf.roundedRect(margin, y, contentW, 28, 2, 2, 'S');

    pdf.setFontSize(9);
    pdf.setTextColor(130, 130, 130);
    pdf.text('Model Type', margin + 5, y + 7);
    pdf.text('R-Squared (Adj)', margin + 45, y + 7);
    pdf.text('Std Error (S)', margin + 95, y + 7);
    pdf.text('F-Statistic', margin + 140, y + 7);

    pdf.setFontSize(14);
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.text(results.type, margin + 5, y + 20);
    pdf.setTextColor(201, 168, 108);
    if (results.type === 'Taguchi') {
      pdf.text('N/A', margin + 45, y + 20);
      pdf.text('N/A', margin + 95, y + 20);
    } else {
      pdf.text(`${(results.R2Adj ? results.R2Adj * 100 : results.R2 * 100).toFixed(2)}%`, margin + 45, y + 20);
      pdf.text(results.S ? results.S.toFixed(4) : 'N/A', margin + 95, y + 20);
    }
    pdf.setTextColor(255, 255, 255);
    pdf.text(results.F ? results.F.toFixed(2) : 'N/A', margin + 140, y + 20);
    y += 36;

    // --- Equation Section ---
    checkSpace(40);
    pdf.setFontSize(13);
    pdf.setTextColor(201, 168, 108);
    pdf.setFont('helvetica', 'bold');
    pdf.text('2. Model Equation', margin, y);
    y += 8;

    pdf.setFillColor(17, 17, 17);
    const eqText = results.type === 'Taguchi'
      ? 'Taguchi models optimize S/N ratios for robust design; an explicit polynomial regression equation is not generated.'
      : (results.equation || 'No equation');
    const eqLines = pdf.setFont('courier', 'normal').setFontSize(10).splitTextToSize(eqText, contentW - 10);
    const eqH = Math.max(20, eqLines.length * 5 + 10);

    pdf.roundedRect(margin, y, contentW, eqH, 2, 2, 'F');
    pdf.setDrawColor(50, 50, 50);
    pdf.roundedRect(margin, y, contentW, eqH, 2, 2, 'S');
    pdf.setTextColor(52, 211, 153);
    pdf.text(eqLines, margin + 5, y + 7);
    y += eqH + 8;

    // --- Factor Summary ---
    checkSpace(30 + headers.length * 6);
    pdf.setFontSize(13);
    pdf.setTextColor(201, 168, 108);
    pdf.setFont('helvetica', 'bold');
    pdf.text('3. Factor Summary', margin, y);
    y += 8;

    // Table header
    pdf.setFillColor(30, 30, 30);
    pdf.rect(margin, y, contentW, 7, 'F');
    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 150);
    pdf.setFont('helvetica', 'bold');
    const colW = contentW / 5;
    ['Factor', 'Min', 'Max', 'Mean', 'Std Dev'].forEach((h, i) => {
      pdf.text(h, margin + i * colW + 3, y + 5);
    });
    y += 7;

    // Table rows
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(220, 220, 220);
    headers.slice(0, -1).forEach((h, i) => {
      const col = data.map(r => r[i]);
      const min = Math.min(...col);
      const max = Math.max(...col);
      const mean = col.reduce((a, b) => a + b, 0) / col.length;
      const std = Math.sqrt(col.reduce((s, v) => s + (v - mean) ** 2, 0) / col.length);

      if (i % 2 === 0) {
        pdf.setFillColor(18, 18, 18);
        pdf.rect(margin, y, contentW, 6, 'F');
      }
      [h, min.toFixed(3), max.toFixed(3), mean.toFixed(3), std.toFixed(3)].forEach((val, j) => {
        pdf.text(val, margin + j * colW + 3, y + 4.5);
      });
      y += 6;
    });
    y += 8;

    // --- Data Table ---
    checkSpace(20);
    pdf.setFontSize(13);
    pdf.setTextColor(201, 168, 108);
    pdf.setFont('helvetica', 'bold');
    pdf.text('4. Experiment Data', margin, y);
    y += 8;

    // Data table header
    const dColW = contentW / headers.length;
    pdf.setFillColor(30, 30, 30);
    pdf.rect(margin, y, contentW, 7, 'F');
    pdf.setFontSize(7);
    pdf.setTextColor(150, 150, 150);
    pdf.setFont('helvetica', 'bold');
    headers.forEach((h, i) => {
      pdf.text(h, margin + i * dColW + 2, y + 5);
    });
    y += 7;

    // Data rows
    pdf.setFont('courier', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(200, 200, 200);
    data.forEach((row, rIdx) => {
      checkSpace(6);
      if (rIdx % 2 === 0) {
        pdf.setFillColor(15, 15, 15);
        pdf.rect(margin, y, contentW, 5.5, 'F');
      }
      row.forEach((val, cIdx) => {
        pdf.text(val.toFixed(4), margin + cIdx * dColW + 2, y + 4);
      });
      y += 5.5;
    });
    y += 8;

    // --- Footer ---
    const totalPages = pdf.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      pdf.setPage(p);
      pdf.setFillColor(201, 168, 108);
      pdf.rect(0, 290, pageW, 0.5, 'F');
      pdf.setFontSize(7);
      pdf.setTextColor(100, 100, 100);
      pdf.text(`ADIA DOE Analyzer Pro — Confidential`, margin, 295);
      pdf.text(`Page ${p} of ${totalPages}`, pageW - margin - 20, 295);
    }

    pdf.save(`DOE_Report_${results.type}_${new Date().toISOString().slice(0, 10)}.pdf`);
    addError('info', 'Professional report generated and downloaded.');
  }, [results, data, headers, addError]);

  const executeExportProject = useCallback(async (selectedKeys: string[]) => {
    const totalEntities = blocks.length + parts.length + connectors.length + relationships.length;
    const limits = loadStoredPerformanceLimits();
    if (totalEntities >= limits.largeModelWarningThreshold && selectedKeys.includes('unified')) {
      const ok = window.confirm?.(
        `Exporting complete unified project with ${totalEntities.toLocaleString()} entities may take a moment. Proceed?`
      );
      if (!ok) return;
    }
    const projectFiles: Record<string, any> = {};
    const persistedStateMachine = createPersistedAppSimulationModel({
      tickMs, states, junctions, transitions, layers, variables,
      safetyMode, hilConfig,
    });

    if (selectedKeys.includes('statemachine')) {
      projectFiles['statemachine.json'] = { ...persistedStateMachine, view };
    }
    if (selectedKeys.includes('bdd')) {
      projectFiles['bdd.json'] = { blocks: blocks.filter(b => b.stereotype !== 'requirement'), relationships, customStereotypes };
    }
    if (selectedKeys.includes('ibd')) {
      projectFiles['ibd.json'] = { parts, connectors, interfaceRealizations };
    }
    if (selectedKeys.includes('requirements')) {
      projectFiles['requirements.json'] = { blocks: blocks.filter(b => b.stereotype === 'requirement'), relationships };
    }
    if (selectedKeys.includes('xbridges')) {
      projectFiles['xbridges.json'] = { globalXBridgesNodes, globalXBridgesEdges };
    }
    if (selectedKeys.includes('vlab')) {
      projectFiles['vlab.json'] = { vlabNodes, vlabEdges };
    }
    if (selectedKeys.includes('hmi')) {
      projectFiles['hmi.json'] = { hmiComponents };
    }
    if (selectedKeys.includes('hil')) {
      projectFiles['hil.json'] = hilConfig;
    }
    if (selectedKeys.includes('doe')) {
      projectFiles['doe.json'] = { schemaVersion: 1, headers, data, activeModel, taguchiConfig, results };
    }
    if (selectedKeys.includes('entropy')) {
      projectFiles['entropy.json'] = { entropyNodes, entropyEdges, opmSimulationConfig };
    }
    if (selectedKeys.includes('unified')) {
      projectFiles['adia_project_unified.json'] = {
        version: VERSION,
        timestamp: new Date().toISOString(),
        projectName: currentProjectName,
        openTabs,
        ...persistedStateMachine, view,
        blocks, relationships, parts, connectors, interfaceRealizations, customStereotypes,
        hmiComponents, vlabNodes, vlabEdges, globalXBridgesNodes, globalXBridgesEdges,
        hilConfig,
        doe: { schemaVersion: 1, headers, data, activeModel, taguchiConfig, results },
        managedWindows,
        entropyNodes,
        entropyEdges,
        opmSimulationConfig,
        canonicalSysmlRepository,
        workspaceFiles: saveCurrentFileState(workspaceFiles, activeFileId),
        openTabIds,
        activeFileId
      };
    }

    if (Object.keys(projectFiles).length === 0) {
      addError('warning', 'No modules selected to save.');
      return;
    }

    // Electron specialized multi-file save
    if ((window as any).require) {
      try {
        const { ipcRenderer } = (window as any).require('electron');
        const success = await ipcRenderer.invoke('save-project-folder', projectFiles);
        if (success) {
          addError('info', 'Selected project modules exported in selected directory');
        }
        return;
      } catch (err) {
        console.error('Electron folder save failed, falling back to web downloads:', err);
      }
    }

    // Web Fallback: Try File System Access API for one-window directory save
    if (!((window as any).require) && 'showDirectoryPicker' in window) {
      try {
        const dirHandle = await (window as any).showDirectoryPicker();
        for (const [filename, data] of Object.entries(projectFiles)) {
          const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(JSON.stringify(data, null, 2));
          await writable.close();
        }
        addError('info', 'Selected unified project saved successfully to selected directory');
        return;
      } catch (err) {
        console.warn('Directory picker failed or canceled, falling back to multiple downloads:', err);
      }
    }

    // Traditional Web Fallback: Trigger multiple downloads
    for (const [filename, data] of Object.entries(projectFiles)) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    addError('info', 'Selected project modules exported as files.');
  }, [
    states, junctions, transitions, layers, variables, view, tickMs, safetyMode,
    blocks, relationships, parts, connectors, interfaceRealizations, customStereotypes,
    hmiComponents, vlabNodes, vlabEdges, globalXBridgesNodes, globalXBridgesEdges,
    hilConfig,
    headers, data, activeModel, taguchiConfig, results, managedWindows, addError,
    entropyNodes, entropyEdges, opmSimulationConfig, currentProjectName, openTabs,
    workspaceFiles, openTabIds, activeFileId, saveCurrentFileState
  ]);



  const handleXBridgesSave = useCallback((nodes: any[], edges: any[], mappings: readonly XBMappingV1[]) => {
    const prunedMappings = pruneXBBoundaryMappings(mappings, nodes);
    if (xBridgesStateId) {
      setStates(prev => prev.map(s =>
        s.id === xBridgesStateId
          ? { ...s, xBridgesModel: { ...s.xBridgesModel, nodes, edges, mappings: Array.from(prunedMappings) } }
          : s
      ));
    } else {
      setGlobalXBridgesNodes(nodes);
      setGlobalXBridgesEdges(edges);
    }
  }, [xBridgesStateId, setGlobalXBridgesNodes, setGlobalXBridgesEdges, setStates]);


  const hydrateProject = useCallback((importedData: any) => {
    try {
      let sysmlLoadedView: { blocks: BlockData[]; relationships: RelationshipData[]; parts: PartData[]; connectors: ConnectorData[] } | null = null;
      if (importedData.sysmlRepository) {
        const loaded = loadCanonicalSysmlProject(importedData);
        if (!loaded.valid) {
          throw new Error(`Canonical SysML repository failed validation: ${loaded.diagnostics.map(item => item.code).join(', ')}`);
        }
        setCanonicalSysmlRepository(loaded.repository);
        setSysmlStore(fromRepository(loaded.repository, loaded.coordinates, loaded.diagramPresentations));
        if (loaded.diagramPresentations) {
          setDiagramPresentations(loaded.diagramPresentations);
        }
        sysmlLoadedView = loaded.view;
      }
      // Logic & Simulation
      if (importedData.projectName) setCurrentProjectName(importedData.projectName);
      if (importedData.openTabs) setOpenTabs(importedData.openTabs);
      if (importedData.states) setStates(importedData.states);
      if (importedData.junctions) setJunctions(importedData.junctions);
      if (importedData.transitions) setTransitions(importedData.transitions);
      if (importedData.layers) setLayers(importedData.layers);
      if (importedData.variables) setVariables(importedData.variables);
      if (importedData.view) {
        const v = importedData.view;
        const scale = typeof v.scale === 'number' && Number.isFinite(v.scale) && v.scale > 0 ? v.scale : (typeof v.zoom === 'number' && Number.isFinite(v.zoom) && v.zoom > 0 ? v.zoom : 1);
        const offsetX = typeof v.offsetX === 'number' && Number.isFinite(v.offsetX) ? v.offsetX : (typeof v.x === 'number' && Number.isFinite(v.x) ? v.x : 0);
        const offsetY = typeof v.offsetY === 'number' && Number.isFinite(v.offsetY) ? v.offsetY : (typeof v.y === 'number' && Number.isFinite(v.y) ? v.y : 0);
        setView({ scale, offsetX, offsetY });
      }
      if (importedData.tickMs) setTickMs(importedData.tickMs);

      // SysML & Requirements — derive from canonical repository if present, else migrate legacy
      if (sysmlLoadedView) {
        setBlocks(migrateBlocks(sysmlLoadedView.blocks));
        setRelationships(sysmlLoadedView.relationships);
        setParts(sysmlLoadedView.parts);
        setConnectors(sysmlLoadedView.connectors);
      } else {
        if (importedData.blocks) setBlocks(migrateBlocks(importedData.blocks));
        if (importedData.relationships) setRelationships(importedData.relationships);
        if (importedData.parts) setParts(importedData.parts);
        if (importedData.connectors) setConnectors(importedData.connectors);
      }
      if (importedData.interfaceRealizations) setInterfaceRealizations(importedData.interfaceRealizations);
      if (importedData.customStereotypes) setCustomStereotypes(importedData.customStereotypes);

      // HMI Dashboard
      if (importedData.hmiComponents) setHmiComponents(importedData.hmiComponents);

      // V-Lab Physical Modeling
      if (importedData.vlabNodes) setVlabNodes(importedData.vlabNodes);
      if (importedData.vlabEdges) setVlabEdges(importedData.vlabEdges);

      // X-Bridges Architecture
      if (importedData.globalXBridgesNodes) setGlobalXBridgesNodes(importedData.globalXBridgesNodes);
      if (importedData.globalXBridgesEdges) setGlobalXBridgesEdges(importedData.globalXBridgesEdges);

      // ENTROPY OPM
      if (importedData.entropyNodes) setEntropyNodes(importedData.entropyNodes);
      if (importedData.entropyEdges) setEntropyEdges(importedData.entropyEdges);
      if (importedData.opmSimulationConfig) setOpmSimulationConfig(importedData.opmSimulationConfig);

      // HIL Configuration
      if (importedData.hilConfig) setHilConfig(importedData.hilConfig);

      if (importedData.canonicalSysmlRepository) {
        setCanonicalSysmlRepository(importedData.canonicalSysmlRepository);
      }

      const savedPlantUmlDiagrams = readPlantUmlDiagrams(importedData);
      if (savedPlantUmlDiagrams[0]) setPlantUmlDiagram(savedPlantUmlDiagrams[0]);

      // DOE Modeling Suite
      if (importedData.doe) {
        if (importedData.doe.headers) setHeaders(importedData.doe.headers);
        if (importedData.doe.data) setData(importedData.doe.data);
        if (importedData.doe.activeModel) setActiveModel(importedData.doe.activeModel);
        if (importedData.doe.taguchiConfig) setTaguchiConfig(importedData.doe.taguchiConfig);
        if (importedData.doe.results) setResults(importedData.doe.results);
      }

      // UI State
      if (importedData.managedWindows) setManagedWindows(importedData.managedWindows);

      // Re-populate workspace files list
      let restoredFiles: WorkspaceFile[] = [];
      if (importedData.workspaceFiles && Array.isArray(importedData.workspaceFiles)) {
        setWorkspaceFiles(importedData.workspaceFiles);
      } else {
        // Fallback for older saved projects (or unified projects saved without workspaceFiles):
        // We construct the default workspace files, but populate their `data` fields with the loaded state.
        restoredFiles = [
          {
            id: 'default_sm',
            name: 'Main State Machine',
            type: 'statemachine',
            data: {
              states: importedData.states || [],
              junctions: importedData.junctions || [],
              transitions: importedData.transitions || [],
              layers: importedData.layers || [],
              variables: importedData.variables || [],
              view: importedData.view || { x: 0, y: 0, zoom: 1 },
              tickMs: importedData.tickMs || 100
            }
          },
          {
            id: 'default_bdd',
            name: 'Main SysML BDD',
            type: 'bdd',
            data: {
              blocks: (importedData.blocks || []).filter((b: any) => b.stereotype !== 'requirement'),
              relationships: importedData.relationships || [],
              customStereotypes: importedData.customStereotypes || []
            }
          },
          {
            id: 'default_requirements',
            name: 'Main Requirements',
            type: 'requirements',
            data: {
              blocks: (() => {
                const reqRelEndpoints = new Set<string>();
                (importedData.relationships || []).forEach((r: any) => {
                  if (r.type === 'satisfy' || r.type === 'deriveReqt' || r.type === 'verify' || r.type === 'refine') {
                    reqRelEndpoints.add(r.sourceId);
                    reqRelEndpoints.add(r.targetId);
                  }
                });
                return (importedData.blocks || []).filter((b: any) => b.stereotype === 'requirement' || reqRelEndpoints.has(b.id));
              })(),
              relationships: importedData.relationships || []
            }
          },
          {
            id: 'default_ibd',
            name: 'Main SysML IBD',
            type: 'ibd',
            data: {
              parts: importedData.parts || [],
              connectors: importedData.connectors || [],
              interfaceRealizations: importedData.interfaceRealizations || []
            }
          },
          {
            id: 'default_xbridges',
            name: 'Main X-Bridges',
            type: 'xbridges',
            data: {
              globalXBridgesNodes: importedData.globalXBridgesNodes || [],
              globalXBridgesEdges: importedData.globalXBridgesEdges || []
            }
          },
          {
            id: 'default_vlab',
            name: 'Main V-Lab',
            type: 'vlab',
            data: {
              vlabNodes: importedData.vlabNodes || [],
              vlabEdges: importedData.vlabEdges || []
            }
          },
          {
            id: 'default_hil',
            name: 'Main HIL',
            type: 'hil',
            data: importedData.hilConfig || {
              enabled: false,
              target: 'Generic',
              clockSpeed: 16,
              channels: [],
              mappings: [],
              commPort: '',
              baudRate: 115200
            }
          },
          {
            id: 'default_entropy',
            name: 'Main ENTROPY',
            type: 'entropy',
            data: {
              entropyNodes: importedData.entropyNodes || [],
              entropyEdges: importedData.entropyEdges || [],
              opmSimulationConfig: importedData.opmSimulationConfig || DEFAULT_OPM_SIMULATION_CONFIG
            }
          },
          {
            id: 'default_hmi',
            name: 'Main HMI',
            type: 'hmi',
            data: {
              hmiComponents: importedData.hmiComponents || []
            }
          },
          {
            id: 'default_doe',
            name: 'Main DOE',
            type: 'doe',
            data: importedData.doe ? {
              headers: importedData.doe.headers || [],
              data: importedData.doe.data || [],
              activeModel: importedData.doe.activeModel || 'RSM',
              taguchiConfig: importedData.doe.taguchiConfig || { objective: 'larger', targetValue: 10 },
              results: importedData.doe.results || null
            } : {
              headers: [],
              data: [],
              activeModel: 'RSM',
              taguchiConfig: { objective: 'larger', targetValue: 10 },
              results: null
            }
          }
        ];
        setWorkspaceFiles(restoredFiles);
      }

      const effectiveFiles = (importedData.workspaceFiles && Array.isArray(importedData.workspaceFiles))
        ? importedData.workspaceFiles
        : restoredFiles;
      const validFileIds = new Set(effectiveFiles.map((f: any) => f.id));

      if (importedData.openTabIds && Array.isArray(importedData.openTabIds)) {
        const validOpenTabs = importedData.openTabIds.filter((id: string) => validFileIds.has(id));
        setOpenTabIds(validOpenTabs.length > 0 ? validOpenTabs : (validFileIds.has('default_sm') ? ['default_sm'] : Array.from(validFileIds).slice(0, 3)));
      } else {
        setOpenTabIds(['default_sm', 'default_bdd', 'default_requirements', 'default_hmi']);
      }

      if (importedData.activeFileId && validFileIds.has(importedData.activeFileId)) {
        setActiveFileId(importedData.activeFileId);
        const activeFile = effectiveFiles.find((f: any) => f.id === importedData.activeFileId);
        if (activeFile && activeFile.type) {
          setDiagramModeState(activeFile.type as DiagramMode);
        } else {
          setDiagramModeState('statemachine');
        }
      } else {
        setActiveFileId('default_sm');
        setDiagramModeState('statemachine');
      }

      // Reset runtime state
      setIsRunning(false);
      setActiveStates({});
      setStateTimers({});
      setTraceHistory([]);
      setScopeData([]);
      setSimulationTime(0);

      // Auto-resolve initial IBD context if parts exist and share a single blockId (IBD-001, IBD-002)
      const importedParts = importedData.parts || [];
      const importedBlocks = importedData.blocks || [];
      if (importedParts.length > 0) {
        const firstBlockId = importedParts[0].blockId;
        if (firstBlockId && importedParts.every((p: any) => p.blockId === firstBlockId)) {
          const targetBlock = importedBlocks.find((b: any) => b.id === firstBlockId);
          if (targetBlock) {
            setCurrentLayerId(firstBlockId);
            setLayerStack([firstBlockId]);
            setLayerPath(['Root', targetBlock.name]);
          } else {
            setCurrentLayerId('root');
            setLayerStack([]);
            setLayerPath(['Root']);
          }
        } else {
          setCurrentLayerId('root');
          setLayerStack([]);
          setLayerPath(['Root']);
        }
      } else {
        setCurrentLayerId('root');
        setLayerStack([]);
        setLayerPath(['Root']);
      }
      setSelectedIds([]);
      setHistory([]);
      setHistoryIndex(-1);

      addError('info', 'Unified ADIA Project imported successfully');
    } catch (error) {
      addError('error', 'Failed to hydrate project state. File might be corrupted.');
    }
  }, [
    setStates, setJunctions, setTransitions, setLayers, setVariables, setView, setTickMs,
    setBlocks, setRelationships, setParts, setConnectors, setInterfaceRealizations, setCustomStereotypes,
    setHmiComponents, setVlabNodes, setVlabEdges, setGlobalXBridgesNodes, setGlobalXBridgesEdges,
    setHilConfig,
    setHeaders, setData, setActiveModel, setTaguchiConfig, setResults, setManagedWindows,
    setIsRunning, setActiveStates, setStateTimers, setTraceHistory, setScopeData, setSimulationTime,
    setSelectedIds, setHistory, setHistoryIndex, setCurrentLayerId, setLayerStack, setLayerPath, addError,
    setCurrentProjectName, setOpenTabs, setWorkspaceFiles, setOpenTabIds, setActiveFileId, setDiagramModeState
  ]);

  const buildUnifiedProjectPayload = useCallback(() => {
    return createUnifiedProjectPayload({
      version: VERSION,
      projectName: currentProjectName,
      tickMs,
      states,
      junctions,
      transitions,
      layers,
      variables,
      safetyMode,
      hilConfig,
      blocks,
      relationships,
      parts,
      connectors,
      sysmlRepository: serializeRepository(canonicalSysmlRepository),
      sysmlCoordinates: Object.fromEntries([
        ...blocks.map(b => [b.id, { x: b.x, y: b.y, width: b.width, height: b.height }]),
        ...parts.map(p => [p.id, { x: p.x, y: p.y, width: p.width, height: p.height }]),
      ]),
      diagramPresentations,
      interfaceRealizations,
      customStereotypes,
      hmiComponents,
      vlabNodes,
      vlabEdges,
      globalXBridgesNodes,
      globalXBridgesEdges,
      entropyNodes,
      entropyEdges,
      opmSimulationConfig,
      doe: {
        headers,
        data,
        activeModel,
        taguchiConfig,
        results,
      },
      managedWindows,
      workspaceFiles,
      openTabIds,
      activeFileId,
      plantUml: { version: 1, diagrams: [plantUmlDiagram] },
    });
  }, [
    currentProjectName,
    tickMs,
    states,
    junctions,
    transitions,
    layers,
    variables,
    safetyMode,
    hilConfig,
    blocks,
    relationships,
    parts,
    connectors,
    canonicalSysmlRepository,
    diagramPresentations,
    interfaceRealizations,
    customStereotypes,
    hmiComponents,
    vlabNodes,
    vlabEdges,
    globalXBridgesNodes,
    globalXBridgesEdges,
    entropyNodes,
    entropyEdges,
    opmSimulationConfig,
    headers,
    data,
    activeModel,
    taguchiConfig,
    results,
    managedWindows,
    workspaceFiles,
    openTabIds,
    activeFileId,
    plantUmlDiagram,
  ]);

  const saveUnifiedProject = useCallback(async (saveAs: boolean = false) => {
    try {
      const payload = buildUnifiedProjectPayload();
      const electron = (window as any).electronAPI;
      if (electron) {
        let result: any;
        if (saveAs) {
          result = typeof electron.projectSaveAs === 'function'
            ? await electron.projectSaveAs(payload)
            : await electron.invoke('project-save-as', payload);
        } else {
          result = typeof electron.projectSave === 'function'
            ? await electron.projectSave(payload)
            : await electron.invoke('project-save', payload);
        }

        if (result && (result.status === 'saved' || result.success) && result.filePath) {
          setActiveProjectPath(result.filePath);
          lastSavedSnapshotRef.current = createProjectSnapshot(payload);
          
          const fileName = result.filePath.split(/[/\\]/).pop() || '';
          const nameWithoutExt = fileName.replace(/\.adia$/i, '').replace(/\.json$/i, '');
          if (nameWithoutExt) {
            setCurrentProjectName(nameWithoutExt);
          }
          addError('info', `Project saved successfully: ${result.filePath}`);
        } else if (result && (result.status === 'cancelled' || result.canceled)) {
          // User canceled save dialog
        } else {
          addError('error', `Failed to save project: ${result?.message || result?.error || 'Unknown error'}`);
        }
      } else {
        // Web / Browser Fallback
        const jsonStr = JSON.stringify(payload, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentProjectName.replace(/[^a-zA-Z0-9_-]/g, '_')}.adia`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        lastSavedSnapshotRef.current = createProjectSnapshot(payload);
        addError('info', 'Project downloaded as .adia file.');
      }
    } catch (err: any) {
      console.error('Save failed:', err);
      addError('error', `Failed to save project: ${err?.message || String(err)}`);
    }
  }, [buildUnifiedProjectPayload, currentProjectName, addError]);

  // X-BRIDGES Application Delegate connected to live React Flow state
  const liveXbridgesState = useMemo(() => createLiveXbridgesStateAccessors(
    globalXBridgesNodesRef,
    globalXBridgesEdgesRef,
    setGlobalXBridgesNodes,
    setGlobalXBridgesEdges,
  ), []);

  const xbridgesApplicationDelegate = useMemo<XbridgesApplicationDelegate | undefined>(() => {
    if (diagramMode !== 'xbridges') return undefined;
    return createXbridgesDelegate({
      ...liveXbridgesState,
      onSave: (nodes, edges) => handleXBridgesSave(nodes, edges, []),
    });
  }, [diagramMode, liveXbridgesState, handleXBridgesSave]);

  // Project Application Delegate for project identity, active workspace, and persistence
  const projectApplicationDelegate = useMemo<ProjectApplicationDelegate>(() => {
    return createProjectDelegate({
      getProjectId: () => currentProjectName || 'ADIA_Project',
      getActiveWorkspace: () => diagramMode,
      getRevision: () => canonicalSysmlRepository.revision,
      onRefreshPersistence: async () => {
        await saveUnifiedProject(false);
      },
    });
  }, [currentProjectName, diagramMode, canonicalSysmlRepository.revision, saveUnifiedProject]);

  // ToolGateway constructed with live application delegates
  const agentToolGateway = useMemo<ToolGateway>(() => {
    return new ToolGateway({
      project: projectApplicationDelegate,
      xbridges: xbridgesApplicationDelegate,
      sysml: sysmlApplicationDelegate,
      report: reportApplicationDelegate,
    });
  }, [projectApplicationDelegate, xbridgesApplicationDelegate, sysmlApplicationDelegate, reportApplicationDelegate]);

  // Single active AgentOrchestrator instance for the project
  const agentOrchestrator = useMemo<AgentOrchestrator>(() => {
    const orchestrator = new AgentOrchestrator(undefined, agentToolGateway);
    orchestrator.updateProjectContext({
      projectId: currentProjectName || 'ADIA_Project',
      workspace: diagramMode,
      revision: canonicalSysmlRepository.revision,
      nodes: globalXBridgesNodes,
      edges: globalXBridgesEdges,
    });
    return orchestrator;
  }, []);

  useEffect(() => {
    agentOrchestrator.setToolGateway(agentToolGateway);
  }, [agentOrchestrator, agentToolGateway]);

  // Update orchestrator project context whenever project properties change
  useEffect(() => {
    agentOrchestrator.updateProjectContext({
      projectId: currentProjectName || 'ADIA_Project',
      workspace: diagramMode,
      revision: canonicalSysmlRepository.revision,
      nodes: globalXBridgesNodes,
      edges: globalXBridgesEdges,
    });
  }, [agentOrchestrator, currentProjectName, diagramMode, canonicalSysmlRepository.revision, globalXBridgesNodes, globalXBridgesEdges]);

  const confirmProjectReplacementIfDirty = useCallback((): boolean => {
    const currentPayload = buildUnifiedProjectPayload();
    const isDirty = hasUnsavedProjectChanges(currentPayload, lastSavedSnapshotRef.current);
    return shouldConfirmProjectReplacement(isDirty, (msg: string) => window.confirm(msg));
  }, [buildUnifiedProjectPayload]);

  const handleOpenProjectDialog = useCallback(async () => {
    try {
      if (!confirmProjectReplacementIfDirty()) {
        return;
      }

      const electron = (window as any).electronAPI;
      if (electron) {
        const result = typeof electron.projectOpenDialog === 'function'
          ? await electron.projectOpenDialog()
          : (typeof electron.invoke === 'function' ? await electron.invoke('project-open-dialog') : null);

        if (result && (result.status === 'opened' || result.success) && (result.data || result.projectData)) {
          const projectData = result.data || result.projectData;
          const validation = validateImportedJson(projectData);
          if (!validation.isValid) {
            setImportValidationError(validation);
            return;
          }
          const dataToHydrate = validation.sanitizedData || projectData;
          hydrateProject(dataToHydrate);
          if (result.filePath) {
            setActiveProjectPath(result.filePath);
            const fileName = result.filePath.split(/[/\\]/).pop() || '';
            const nameWithoutExt = fileName.replace(/\.adia$/i, '').replace(/\.json$/i, '');
            if (nameWithoutExt) {
              setCurrentProjectName(nameWithoutExt);
            }
          }
          if (result.token) {
            if (typeof electron.projectAcceptOpen === 'function') {
              await electron.projectAcceptOpen({ token: result.token });
            } else if (typeof electron.invoke === 'function') {
              await electron.invoke('project-accept-open', { token: result.token });
            }
          }
          setTimeout(() => {
            lastSavedSnapshotRef.current = createProjectSnapshot(buildUnifiedProjectPayload());
          }, 50);
          addError('info', `Opened project: ${result.filePath || 'Unified Project'}`);
        } else if (result && result.status === 'error') {
          addError('error', result.message || 'Failed to open project');
        }
      } else {
        projectImportRef.current?.click();
      }
    } catch (err: any) {
      console.error('Open dialog failed:', err);
      addError('error', `Failed to open project: ${err?.message || String(err)}`);
    }
  }, [confirmProjectReplacementIfDirty, hydrateProject, buildUnifiedProjectPayload, addError]);

  useEffect(() => {
    const electron = (window as any).electronAPI;
    if (!electron) return;

    const handleOpenReq = async (eventData: any) => {
      const token = eventData?.token;
      const filePath = eventData?.filePath;
      const projectData = eventData?.data || eventData?.projectData;
      if (!projectData) return;

      try {
        const currentPayload = buildUnifiedProjectPayload();
        const isDirty = hasUnsavedProjectChanges(currentPayload, lastSavedSnapshotRef.current);
        const userApproved = shouldConfirmProjectReplacement(isDirty, (msg: string) => window.confirm(msg));

        if (!userApproved) {
          return;
        }

        const validation = validateImportedJson(projectData);
        if (!validation.isValid) {
          setImportValidationError(validation);
          return;
        }

        const dataToHydrate = validation.sanitizedData || projectData;
        hydrateProject(dataToHydrate);
        if (filePath) {
          setActiveProjectPath(filePath);
          const fileName = filePath.split(/[/\\]/).pop() || '';
          const nameWithoutExt = fileName.replace(/\.adia$/i, '').replace(/\.json$/i, '');
          if (nameWithoutExt) {
            setCurrentProjectName(nameWithoutExt);
          }
        }

        if (token) {
          if (typeof electron.projectAcceptOpen === 'function') {
            await electron.projectAcceptOpen({ token });
          } else if (typeof electron.invoke === 'function') {
            await electron.invoke('project-accept-open', { token });
          }
        }

        setTimeout(() => {
          lastSavedSnapshotRef.current = createProjectSnapshot(buildUnifiedProjectPayload());
        }, 50);

        addError('info', `Opened external project: ${filePath || 'Unified Project'}`);
      } catch (err: any) {
        console.error('Failed to accept external open requested:', err);
      }
    };

    if (typeof electron.onProjectOpenRequested === 'function') {
      const unsubscribe = electron.onProjectOpenRequested(handleOpenReq);
      return () => {
        if (typeof unsubscribe === 'function') unsubscribe();
      };
    } else if (typeof electron.on === 'function') {
      const unsubscribe = electron.on('project-open-requested', (_event: any, data: any) => handleOpenReq(data));
      return () => {
        if (typeof unsubscribe === 'function') unsubscribe();
      };
    }
  }, [buildUnifiedProjectPayload, hydrateProject, addError]);

  const handleExportProject = useCallback(() => {
    setShowSaveSelectionModal(true);
  }, []);

  // Computed values
  const selectedState = useMemo(() => selectedIds.length === 1 ? states.find(s => s.id === selectedIds[0]) : null, [selectedIds, states]);
  const selectedXBridgesNodes = useMemo(
    () => Array.from(selectedState?.xBridgesModel?.nodes || []),
    [selectedState],
  );
  const selectedInputBoundaryTargets = useMemo(
    () => listXBBoundaryTargets(selectedXBridgesNodes, 'in'),
    [selectedXBridgesNodes],
  );
  const selectedOutputBoundaryTargets = useMemo(
    () => listXBBoundaryTargets(selectedXBridgesNodes, 'out'),
    [selectedXBridgesNodes],
  );
  const mappingVariables = useMemo(
    () => variables.filter(variable => typeof variable.id === 'string' && variable.id.length > 0),
    [variables],
  );
  const selectedJunction = useMemo(() => selectedIds.length === 1 ? junctions.find(j => j.id === selectedIds[0]) : null, [selectedIds, junctions]);
  const selectedTransition = useMemo(() => selectedIds.length === 1 ? transitions.find(t => t.id === selectedIds[0]) : null, [selectedIds, transitions]);
  const selectedBlock = useMemo(() => selectedIds.length === 1 ? blocks.find(b => b.id === selectedIds[0]) : null, [selectedIds, blocks]);
  const selectedRelationship = useMemo(() => selectedIds.length === 1 ? relationships.find(r => r.id === selectedIds[0]) : null, [selectedIds, relationships]);
  const selectedPart = useMemo(() => selectedIds.length === 1 ? parts.find(p => p.id === selectedIds[0]) : null, [selectedIds, parts]);

  const sysmlStructureSignature = useMemo(() => JSON.stringify({
    blocks: blocks.map(block => ({ id: block.id, stereotype: block.stereotype, properties: block.properties })),
    parts: parts.map(part => ({
      id: part.id,
      propertyId: part.propertyId,
      name: part.name,
      blockId: part.blockId,
      typeId: part.typeId,
      aggregation: part.aggregation,
      multiplicity: part.multiplicity,
    })),
  }), [blocks, parts]);

  useEffect(() => {
    if (diagramMode !== 'bdd' && diagramMode !== 'ibd') return;
    const reconciled = reconcileAllPropertyUsages(blocks, parts, connectors);
    const blocksChanged = JSON.stringify(reconciled.blocks) !== JSON.stringify(blocks);
    const partsChanged = JSON.stringify(reconciled.parts) !== JSON.stringify(parts);
    if (!blocksChanged && !partsChanged) return;
    if (blocksChanged) setBlocks(reconciled.blocks);
    if (partsChanged) setParts(reconciled.parts);
  }, [diagramMode, sysmlStructureSignature]);
  const selectedConnector = useMemo(() => selectedIds.length === 1 ? connectors.find(c => c.id === selectedIds[0]) : null, [selectedIds, connectors]);
  const selectedInterfaceRealization = useMemo(() => selectedIds.length === 1 ? interfaceRealizations.find(ir => ir.id === selectedIds[0]) : null, [selectedIds, interfaceRealizations]);
  const currentLayer = useMemo(() => layers.find(l => l.id === currentLayerId) || layers[0], [layers, currentLayerId]);
  const currentStates = useMemo(() => states.filter(s => s.parentId === currentLayerId), [states, currentLayerId]) as StateData[];
  const currentJunctions = useMemo(() => junctions.filter(j => layers.find(l => l.junctionIds.includes(j.id))?.id === currentLayerId), [junctions, layers, currentLayerId]);
  const currentTransitions = useMemo(() => transitions.filter(t => {
    const parentStateId = currentLayer?.parentStateId;

    const sourceState = states.find(s => s.id === t.sourceId) || junctions.find(j => j.id === t.sourceId);
    const targetState = states.find(s => s.id === t.targetId) || junctions.find(j => j.id === t.targetId);
    // Use 'children' to distinguish StateData (has children) from JunctionData (doesn't have children)
    const sourceLayer = sourceState ? ('children' in sourceState ? (sourceState as StateData).parentId : layers.find(l => l.junctionIds.includes((sourceState as JunctionData).id))?.id) : currentLayerId;
    const targetLayer = targetState ? ('children' in targetState ? (targetState as StateData).parentId : layers.find(l => l.junctionIds.includes((targetState as JunctionData).id))?.id) : currentLayerId;

    if (sourceLayer === currentLayerId && targetLayer === currentLayerId) return true;
    if (t.sourceId === parentStateId && targetLayer === currentLayerId) return true;
    if (t.targetId === parentStateId && sourceLayer === currentLayerId) return true;

    return false;
  }), [transitions, states, junctions, currentLayerId, layers, currentLayer]);


  const clearErrors = useCallback(() => {
    setErrors([]);
    setCurrentError(null);
  }, []);

  // VARIABLE WORKSPACE
  const addVariable = useCallback(() => {
    if (!newVarName.trim()) {
      addError('error', 'Variable name cannot be empty.', 'Workspace');
      return;
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newVarName)) {
      addError('error', `Invalid variable name: "${newVarName}".\n\nTip: Variable names must start with a letter or underscore, and can only contain letters, numbers, and underscores.`, 'Workspace');
      return;
    }
    if (variables.some(v => v.name === newVarName)) {
      addError('error', `Variable "${newVarName}" already exists.\n\nTip: Choose a unique name for your new variable.`, 'Workspace');
      return;
    }
    if (validateInitialValue({ type: newVarType, initialValue: newVarValue }) === null) {
      addError('error', `Invalid initial value '${newVarValue}' for ${newVarType} variable '${newVarName}'.`, 'Workspace');
      return;
    }
    setVariables(prev => [...prev, {
      id: uuidv4(),
      name: newVarName,
      type: newVarType,
      overflowPolicy: 'saturate',
      initialValue: newVarValue,
      currentValue: parseValue(newVarType, newVarValue),
      visibleInScope: true
    }]);
    setNewVarName('');
    setNewVarValue(getDefaultValue(newVarType));
    addError('info', `Added variable: ${newVarName}`);
  }, [newVarName, newVarType, newVarValue, variables, addError]);

  const removeVariable = useCallback((id: string) => {
    const varName = variables.find(v => v.id === id)?.name;
    setVariables(prev => prev.filter(v => v.id !== id));
    addError('info', `Removed variable: ${varName}`);
  }, [variables, addError]);

  const updateVariableValue = useCallback((idOrName: string, value: string) => {
    setVariables(prev => prev.map(v => {
      if (v.id === idOrName || v.name === idOrName) {
        const result = coerceTypedValue(Number(value), v.type, v.overflowPolicy ?? 'saturate');
        if (result.error !== undefined) {
          addError('error', `${v.name}: ${result.error}`, 'Variable Runtime');
          return v;
        }
        const parsed = result.value;
        if (simulationSessionRef.current) {
          setSessionVariableValue(simulationSessionRef.current, v.id, parsed);
        }
        return { ...v, currentValue: parsed };
      }
      return v;
    }));
  }, [addError]);

  const updateVariableType = useCallback((id: string, type: VariableType) => {
    setVariables(prev => prev.map(v => {
      if (v.id !== id) return v;
      const initial = validateInitialValue({ type, initialValue: v.initialValue });
      if (initial === null) {
        addError('error', `Cannot change '${v.name}' to ${type}: initial value is invalid.`, 'Variable Type');
        return v;
      }
      return { ...v, type, initialValue: initial, currentValue: parseValue(type, initial) };
    }));
  }, [addError]);

  const updateVariableOverflowPolicy = useCallback((id: string, overflowPolicy: VariableOverflowPolicy) => {
    setVariables(prev => prev.map(v => v.id === id ? { ...v, overflowPolicy } : v));
  }, []);

  const updateVariableInitValue = useCallback((id: string, value: string) => {
    setVariables(prev => prev.map(v =>
      v.id === id ? { ...v, initialValue: value } : v
    ));
  }, []);

  const toggleVariableVisibility = useCallback((id: string) => {
    setVariables(prev => prev.map(v =>
      v.id === id ? { ...v, visibleInScope: !v.visibleInScope } : v
    ));
  }, []);

  const resetVariables = useCallback(() => {
    setVariables(prev => prev.map(v => ({
      ...v,
      currentValue: parseValue(v.type, v.initialValue)
    })));
    setStateTimers({});
    setSimulationTime(0);
    setScopeData([]);
  }, []);

  // SCOPE
  const exportScopeCSV = useCallback(() => {
    if (scopeData.length === 0) {
      addError('warning', 'No data to export. Tip: Run a simulation to generate scope data before exporting.');
      return;
    }
    const headers = ['time', ...variables.filter(v => v.visibleInScope).map(v => v.name)];
    const rows = scopeData.map(dp => headers.map(h => dp[h] ?? '').join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `adia_scope_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addError('info', 'Scope data exported to CSV');
  }, [scopeData, variables, addError]);

  const clearScope = useCallback(() => {
    setScopeData([]);
    setSimulationTime(0);
    addError('info', 'Scope cleared');
  }, [addError]);

  // HISTORY OPERATIONS
  const addToHistory = useCallback(() => {
    const snapshot = JSON.stringify({
      ...createPersistedAppSimulationModel({
        tickMs, states, junctions, transitions, layers, variables,
        safetyMode, hilConfig,
      }),
      blocks, relationships, parts, connectors, interfaceRealizations, customStereotypes
    });
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(snapshot);
      if (newHistory.length > 50) newHistory.shift(); // Limit history size
      return newHistory;
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  }, [states, junctions, transitions, layers, variables, tickMs, safetyMode, hilConfig, blocks, relationships, parts, connectors, interfaceRealizations, historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const prevSnapshot = JSON.parse(history[historyIndex - 1]);
      applyStateMachineSnapshot(prevSnapshot);
      setBlocks(migrateBlocks(prevSnapshot.blocks));
      setRelationships(prevSnapshot.relationships || []);
      setParts(prevSnapshot.parts || []);
      setConnectors(prevSnapshot.connectors || []);
      setInterfaceRealizations(prevSnapshot.interfaceRealizations || []);
      setCustomStereotypes(prevSnapshot.customStereotypes || []);
      setHistoryIndex(prev => prev - 1);
      addError('info', 'Undo');
    }
  }, [history, historyIndex, addError, applyStateMachineSnapshot]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextSnapshot = JSON.parse(history[historyIndex + 1]);
      applyStateMachineSnapshot(nextSnapshot);
      setBlocks(migrateBlocks(nextSnapshot.blocks));
      setRelationships(nextSnapshot.relationships || []);
      setParts(nextSnapshot.parts || []);
      setConnectors(nextSnapshot.connectors || []);
      setInterfaceRealizations(nextSnapshot.interfaceRealizations || []);
      setCustomStereotypes(nextSnapshot.customStereotypes || []);
      setHistoryIndex(prev => prev + 1);
      addError('info', 'Redo');
    }
  }, [history, historyIndex, addError, applyStateMachineSnapshot]);

  // VALIDATION
  // VALIDATION
  const performValidation = useCallback(() => {
    const newErrors: ErrorItem[] = [];
    const declaredVarNames = new Set(variables.map(v => v.name));
    const jsKeywords = new Set([
      'Math', 'console', 'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
      'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return',
      'var', 'let', 'const', 'function', 'new', 'this', 'try', 'catch', 'finally', 'throw',
      'parseInt', 'parseFloat', 'String', 'Number', 'Boolean', 'Date', 'Array', 'Object', 'RegExp',
      'alert', 'prompt', 'confirm', 'context', 'window', 'document'
    ]);

    // 1. Syntax Checking
    const uintVars = new Set(variables.filter(v => v.type.startsWith('uint')).map(v => v.name));
    const checkUnsafeArithmetic = (code: string, context: string, id?: string) => {
      if (!code) return;
      const matches = Array.from(code.matchAll(/\b([a-zA-Z_]\w*)\s*--|--\s*\b([a-zA-Z_]\w*)\b/g));
      matches.forEach(m => {
        const varName = m[1] || m[2];
        if (varName && uintVars.has(varName)) {
          newErrors.push({ id: uuidv4(), type: 'error', message: `Unsafe arithmetic in ${context}: Potential underflow for unsigned variable '${varName}'. Avoid using '--'. Use '${varName} = ${varName} - 1U;' inside a check.`, timestamp: new Date(), source: 'Validation', elementId: id });
        }
      });
    };

    const checkSyntax = (code: string, context: string, id?: string) => {
      if (!code || !code.trim()) return;

      const statements = code.split(';').map(s => s.trim()).filter(s => s);
      for (const stmt of statements) {
        if (/^(if|while|do|for|switch|return|case|var|let|const)\b/.test(stmt)) continue;

        if (/^[\w\.]+\s*(===|==|!==|!=|<|>|<=|>=)\s*[^=]+$/.test(stmt)) {
          newErrors.push({
            id: uuidv4(),
            type: 'error',
            message: `Statement '${stmt}' in ${context} is a comparison, not an action. Did you mean to assign using '='?`,
            timestamp: new Date(),
            source: 'Validation',
            elementId: id
          });
        }
      }

      const propertyWords = new Set(Array.from(code.matchAll(/\.\s*([a-zA-Z_]\w*)\b/g)).map(m => m[1]));
      const words = code.match(/\b[a-zA-Z_]\w*\b/g) || [];
      for (const word of words) {
        if (!declaredVarNames.has(word) && !jsKeywords.has(word)) {
          const isProperty = propertyWords.has(word);
          if (!isProperty) {
            newErrors.push({
              id: uuidv4(),
              type: 'warning',
              message: `Unknown identifier '${word}' in ${context}. Make sure it is defined in Variables.`,
              timestamp: new Date(),
              source: 'Validation',
              elementId: id
            });
          }
        }
      }

      try {
        safeCreateFunction(['context'], `with(context) { ${code} }`);
      } catch (e: any) {
        if (e instanceof SyntaxError) {
          let tip = 'Check for mismatched brackets, missing semicolons, or invalid operators.';
          if (e.message.includes('Unexpected token')) {
            tip = 'Check for typos, invalid characters, or missing operators. Make sure all parentheses and braces are balanced.';
          } else if (e.message.includes('missing')) {
            tip = 'You are missing a required element. Check that all parentheses, braces, and brackets are closed properly.';
          } else if (e.message.includes('identifier')) {
            tip = 'Variable names must start with a letter or underscore, and contain only letters, numbers, or underscores.';
          } else if (e.message.includes('Unexpected identifier')) {
            tip = 'You might have a space in a variable name (e.g., "my var" instead of "my_var") or a missing operator.';
          }
          newErrors.push({
            id: uuidv4(),
            type: 'error',
            message: `Syntax error in ${context}: ${e.message}.\n\nHow to fix: ${tip}`,
            timestamp: new Date(),
            source: 'Validation',
            elementId: id
          });
        }
      }
    };

    const checkConditionSyntax = (code: string, context: string, id?: string) => {
      if (!code || !code.trim() || code === 'true') return;

      const propertyWords = new Set(Array.from(code.matchAll(/\.\s*([a-zA-Z_]\w*)\b/g)).map(m => m[1]));
      const words = code.match(/\b[a-zA-Z_]\w*\b/g) || [];
      for (const word of words) {
        if (!declaredVarNames.has(word) && !jsKeywords.has(word)) {
          const isProperty = propertyWords.has(word);
          if (!isProperty) {
            newErrors.push({
              id: uuidv4(),
              type: 'warning',
              message: `Unknown identifier '${word}' in ${context}. Make sure it is defined in Variables.`,
              timestamp: new Date(),
              source: 'Validation',
              elementId: id
            });
          }
        }
      }

      if (/(?<![=!<>+\-*/])=(?![=])/.test(code)) {
        newErrors.push({
          id: uuidv4(),
          type: 'error',
          message: `Assignment '=' detected in ${context}. Tip: Use '==' or '===' for comparison. Single '=' is for assignment.`,
          timestamp: new Date(),
          source: 'Validation',
          elementId: id
        });
      }

      try {
        let jsCondition = code
          .replace(/&&/g, '&&')
          .replace(/\|\|/g, '||')
          .replace(/!/g, '!')
          .replace(/==/g, '===')
          .replace(/!=/g, '!==');
        safeCreateFunction(['context'], `with(context) { return (${jsCondition}); }`);
      } catch (e: any) {
        if (e instanceof SyntaxError) {
          let tip = 'Conditions must be valid boolean expressions.';
          if (e.message.includes('Unexpected token')) {
            tip = 'Check your condition syntax. Use && for AND, || for OR, ! for NOT, and ==/!= for comparison.';
          } else if (e.message.includes('missing')) {
            tip = 'Make sure your condition is complete. Check parentheses and operators are balanced.';
          } else if (e.message.includes('Unexpected identifier')) {
            tip = 'You might have a space in a variable name or missing operator (e.g. "a b" instead of "a && b").';
          }
          newErrors.push({
            id: uuidv4(),
            type: 'error',
            message: `Syntax error in ${context}: ${e.message}.\n\nHow to fix: ${tip}`,
            timestamp: new Date(),
            source: 'Validation',
            elementId: id
          });
        }
      }
    };

    states.forEach(s => {
      checkSyntax(s.entry, `State '${s.name}' Entry`, s.id);
      checkSyntax(s.during, `State '${s.name}' During`, s.id);
      checkSyntax(s.exit, `State '${s.name}' Exit`, s.id);
      checkUnsafeArithmetic(s.entry, `State '${s.name}' Entry`, s.id);
      checkUnsafeArithmetic(s.during, `State '${s.name}' During`, s.id);
      checkUnsafeArithmetic(s.exit, `State '${s.name}' Exit`, s.id);

      if (/\s/.test(s.name)) {
        newErrors.push({
          id: uuidv4(),
          type: 'error',
          message: `State name '${s.name}' contains spaces.\n\nHow to fix: Remove spaces or use underscores (e.g., '${s.name.replace(/\s+/g, '_')}'). State names must be valid C identifiers.`,
          timestamp: new Date(),
          source: 'Validation',
          elementId: s.id,
          canAutoFix: true
        });
      }
    });

    const stateNameCounts = new Map<string, string[]>();
    states.forEach(s => {
      const ids = stateNameCounts.get(s.name) || [];
      stateNameCounts.set(s.name, [...ids, s.id]);
    });

    stateNameCounts.forEach((ids, name) => {
      if (ids.length > 1) {
        ids.forEach(id => {
          newErrors.push({
            id: uuidv4(),
            type: 'error',
            message: `Duplicate state name '${name}' detected. State names must be unique across the entire model.`,
            timestamp: new Date(),
            source: 'Validation',
            elementId: id,
            canAutoFix: true
          });
        });
      }
    });

    states.forEach(s => {
      if (s.internalTransitions) {
        const lines = s.internalTransitions.split('\n').filter(l => l.trim());
        lines.forEach(line => {
          const match = line.match(/^\[(.*?)\]\s*\/?\s*(.*)$/);
          if (match) checkConditionSyntax(match[1], `State '${s.name}' Internal Transition`, s.id);
        });
      }
    });

    transitions.forEach(t => {
      const sourceName = states.find(s => s.id === t.sourceId)?.name || junctions.find(j => j.id === t.sourceId)?.name || 'Unknown';
      checkSyntax(t.action, `Transition from '${sourceName}' Action`, t.id);
      checkConditionSyntax(t.condition, `Transition from '${sourceName}' Condition`, t.id);
    });

    transitions.forEach(t => {
      const targetExists = states.some(s => s.id === t.targetId) || junctions.some(j => j.id === t.targetId);
      if (!targetExists) {
        const sourceName = states.find(s => s.id === t.sourceId)?.name || junctions.find(j => j.id === t.sourceId)?.name || 'Unknown';
        newErrors.push({ id: uuidv4(), type: 'error', message: `Transition from '${sourceName}' targets an undefined state or junction.`, timestamp: new Date(), source: 'Validation', elementId: t.id });
      }
    });

    // Check for unguarded, untimed transitions
    transitions.forEach(t => {
      const sourceState = states.find(s => s.id === t.sourceId);
      if (sourceState) {
        const isUnguarded = !t.condition || t.condition.trim() === '' || t.condition.trim() === 'true';
        const isUntimed = t.afterTicks === null || t.afterTicks === undefined || t.afterTicks <= 0;
        const hasConditionType = t.type === 'condition';

        if (isUnguarded && (isUntimed || hasConditionType)) {
          newErrors.push({
            id: uuidv4(),
            type: 'warning',
            message: `Transition from '${sourceState.name}' is unguarded and untimed. It will trigger immediately upon entering the state.`,
            timestamp: new Date(),
            source: 'Validation',
            elementId: t.id,
            canAutoFix: true
          });
        }
      }
    });

    // Type-binding plausibility check for HIL configurations
    if (hilConfig && hilConfig.enabled) {
      hilConfig.mappings.forEach((m: any) => {
        const ch = hilConfig.channels.find((c: any) => c.id === m.channelId);
        const v = variables.find((vr: any) => vr.name === m.adiaVarId || vr.id === m.adiaVarId);
        if (ch && v) {
          if (ch.peripheral === 'GPIO') {
            const isCounter = v.name.toLowerCase().includes('counter') ||
                              v.name.toLowerCase().includes('count') ||
                              v.name.toLowerCase().includes('timer');
            if ((v.type !== 'bool' && v.type !== 'uint8' && v.type !== 'int8') || isCounter) {
              newErrors.push({
                id: uuidv4(),
                type: 'warning',
                message: `Implausible binding: Digital pin channel '${ch.name}' is mapped to variable '${v.name}' of type '${v.type}'. Digital pins should be bound to 'bool' or small flags. Suggested fix: Re-bind to a 'bool' variable, or change '${v.name}' type to 'bool'.`,
                timestamp: new Date(),
                source: 'Validation',
                elementId: m.id
              });
            }
          } else if (['ADC', 'DAC', 'PWM'].includes(ch.peripheral)) {
            if (v.type === 'bool') {
              newErrors.push({
                id: uuidv4(),
                type: 'warning',
                message: `Implausible binding: Analog/PWM channel '${ch.name}' is mapped to boolean variable '${v.name}'. Analog signals should be bound to numeric types (e.g., float, double, uint16_t). Suggested fix: Re-bind to a numeric variable (float/double/uint16), or change '${v.name}' type.`,
                timestamp: new Date(),
                source: 'Validation',
                elementId: m.id
              });
            }
          }
        }
      });
    }

    const statesByParent = new Map<string, StateData[]>();
    states.forEach(s => { const pid = s.parentId || 'root'; if (!statesByParent.has(pid)) statesByParent.set(pid, []); statesByParent.get(pid)!.push(s); });

    layers.forEach(layer => {
      const layerStates = states.filter(s => {
        if (layer.id === 'root') {
          return !layers.some(l => l.id !== 'root' && l.stateIds.includes(s.id));
        }
        return layer.stateIds.includes(s.id);
      });

      if (layerStates.length > 0) {
        const layerJunctions = junctions.filter(j => layer.junctionIds.includes(j.id));
        const autostartStates = layerStates.filter(s => s.autostart);
        const autostartJunctions = layerJunctions.filter(j => j.autostart);
        const totalAutostarts = autostartStates.length + autostartJunctions.length;
        const allParallel = layerStates.length > 0 && layerStates.every(s => s.isParallel);

        if (totalAutostarts === 0) {
          const layerName = layer.name || (layer.id === 'root' ? 'Root' : layer.id);
          newErrors.push({
            id: uuidv4(),
            type: 'error',
            message: `Layer '${layerName}' has no AutoStart. Each layer must have exactly one AutoStart state or junction.`,
            timestamp: new Date(),
            source: 'Validation',
            elementId: layerStates[0].id,
            canAutoFix: true
          });
        } else if (totalAutostarts > 1 && !allParallel) {
          [...autostartStates, ...autostartJunctions].forEach(s => {
            const layerName = layer.name || (layer.id === 'root' ? 'Root' : layer.id);
            newErrors.push({
              id: uuidv4(),
              type: 'error',
              message: `Layer '${layerName}' has multiple AutoStart elements. Only one AutoStart is allowed per layer.`,
              timestamp: new Date(),
              source: 'Validation',
              elementId: s.id
            });
          });
        }
      }
    });

    const transitionsBySource = new Map<string, TransitionData[]>();
    transitions.forEach(t => {
      if (!transitionsBySource.has(t.sourceId)) transitionsBySource.set(t.sourceId, []);
      transitionsBySource.get(t.sourceId)!.push(t);
    });

    transitionsBySource.forEach((transitionsFromSource, sourceId) => {
      const sourceName = states.find(s => s.id === sourceId)?.name || junctions.find(j => j.id === sourceId)?.name || 'Unknown';
      const conditions = new Map<string, TransitionData[]>();
      const priorities = new Map<number, TransitionData[]>();

      transitionsFromSource.forEach(t => {
        const key = `${t.type}|${t.condition}|${t.afterTicks}`;
        if (!conditions.has(key)) conditions.set(key, []);
        conditions.get(key)!.push(t);

        if (!priorities.has(t.order)) priorities.set(t.order, []);
        priorities.get(t.order)!.push(t);

        const boolVarsInCondition = (t.condition.match(/\b[a-zA-Z_]\w*\b/g) || []).filter(word => variables.find(v => v.name === word && v.type === 'bool'));
        if (boolVarsInCondition.length > 0) {
          const targetState = states.find(s => s.id === t.targetId);
          const combinedActions = t.action + (targetState ? targetState.entry : '');
          const resetVars = new Set(
            Array.from(combinedActions.matchAll(/\b([a-zA-Z_]\w*)\s*=\s*(?:false|0)\b/g)).map(m => m[1])
          );
          boolVarsInCondition.forEach(v => {
            if (!resetVars.has(v)) {
              newErrors.push({ id: uuidv4(), type: 'warning', message: `Level-triggered event '${v}' is used in a transition from '${sourceName}' but is not reset to false. This may cause repeated, immediate transitions.`, timestamp: new Date(), source: 'Validation', elementId: t.id });
            }
          });
        }
      });

      conditions.forEach((group) => { if (group.length > 1) group.forEach(t => newErrors.push({ id: uuidv4(), type: 'error', message: `Conflicting transitions from '${sourceName}'. Multiple transitions have the same trigger. Use different conditions or priorities.`, timestamp: new Date(), source: 'Validation', elementId: t.id })); });
      priorities.forEach((group, order) => { if (group.length > 1) group.forEach(t => newErrors.push({ id: uuidv4(), type: 'warning', message: `Multiple transitions from '${sourceName}' have the same priority (${order}). Execution order may be non-deterministic.`, timestamp: new Date(), source: 'Validation', elementId: t.id })); });
    });

    const reachable = new Set<string>();
    const queue = states.filter(s => s.autostart).map(s => s.id);

    if (queue.length === 0 && states.length > 0) {
      queue.push(states[0].id);
    }

    queue.forEach(id => reachable.add(id));

    let head = 0;
    while (head < queue.length) {
      const currentId = queue[head++];
      const outgoing = transitions.filter(t => t.sourceId === currentId);
      outgoing.forEach(t => {
        if (!reachable.has(t.targetId)) {
          reachable.add(t.targetId);
          queue.push(t.targetId);
        }
      });
    }

    states.forEach(s => {
      if (!reachable.has(s.id)) {
        newErrors.push({
          id: uuidv4(),
          type: 'warning',
          message: `State '${s.name}' appears to be unreachable. Tip: Ensure there is a transition path from an initial state to this state, or mark it as 'Auto-start'.`,
          timestamp: new Date(),
          source: 'Validation',
          elementId: s.id
        });
      }
    });

    states.forEach(s => {
      const outgoing = transitions.filter(t => t.sourceId === s.id);
      if (outgoing.length === 0 && (s.internalTransitions || '').trim().length === 0 && states.length > 1 && !s.isSafeState && !s.isTerminalState) {
        newErrors.push({
          id: uuidv4(),
          type: 'warning',
          message: `State '${s.name}' is a dead end (no outgoing transitions). Tip: Add a transition to another state to prevent the machine from getting stuck here.`,
          timestamp: new Date(),
          source: 'Validation',
          elementId: s.id
        });
      }
    });

    // Run the code generator checks to catch undeclared variables and safety constraints
    const genRes = generateMISRACCode({
      tickMs,
      states,
      junctions,
      transitions,
      variables,
      layers,
      safetyMode,
      hilConfig: { ...hilConfig, enabled: false }
    });
    if (genRes.errors && genRes.errors.length > 0) {
      newErrors.push(...genRes.errors);
    }

    setErrors(prev => {
      const filtered = prev.filter(e => e.source !== 'Validation');
      return [...newErrors, ...filtered];
    });

    return newErrors;
  }, [states, transitions, junctions, variables, layers, hilConfig, tickMs, safetyMode]);

  const validateModel = useCallback(() => {
    const newErrors = performValidation();
    if (newErrors.length > 0) {
      const firstError = newErrors.find(e => e.type === 'error');
      if (firstError) {
        setCurrentError(firstError);
        setShowErrorDialog(true);
        return false;
      }
    }
    return true;
  }, [performValidation]);

  useEffect(() => {
    performValidation();
  }, [states, transitions, junctions, variables, performValidation]);

  // MODEL VALIDATION (structural checks via validateModel)
  const validateWithAI = useCallback(async () => {
    setIsAiValidating(true);
    try {
      const ok = validateModel();
      if (ok) {
        addError('info', 'Model passed structural validation checks.', 'Validator');
      }
      return ok;
    } finally {
      setIsAiValidating(false);
    }
  }, [validateModel, addError]);

  const handleExecuteAiActions = useCallback((actions: any[]) => {
    executeAiActions(
      actions, 
      { states, variables, junctions, layers, currentLayerId },
      { 
        setStates, setVariables, setTransitions, setBlocks, addError,
        setFactors, setHeaders, setModelType: setActiveModel,
        calculateRSM, calculateGMDH, calculateTaguchi,
        handleExportToXbridges: handleExportToXBridges,
        handleExportToVLab
      }
    );
  }, [states, variables, junctions, layers, currentLayerId, addError, setStates, setVariables, setTransitions, setBlocks, setFactors, setHeaders, setActiveModel, calculateRSM, calculateGMDH, calculateTaguchi, handleExportToXBridges, handleExportToVLab]);

  const simulationIOMappings = useMemo(
    () => factoryIOEnabled ? createFactoryIOMappings(factoryIOMapping) : [],
    [factoryIOEnabled, factoryIOMapping]
  );
  const simulationModelKey = useMemo(() => createSimulationModelKey({
    tickMs,
    states,
    junctions,
    transitions,
    variables,
    layers,
    safetyMode,
    hilConfig
  }, simulationIOMappings), [
    tickMs, states, junctions, transitions, variables, layers,
    safetyMode, hilConfig, simulationIOMappings
  ]);
  const previousSimulationModelKeyRef = useRef(simulationModelKey);
  useEffect(() => {
    if (previousSimulationModelKeyRef.current === simulationModelKey) return;
    previousSimulationModelKeyRef.current = simulationModelKey;
    simulationLifecycleRef.current.invalidate();
    simulationSessionRef.current = null;
    setIsRunning(false);
    setActiveStates({});
    setStateTimers({});
    setFiredTransitions({});
    setSimulationTime(0);
    setTraceHistory([]);
    setScopeData([]);
    setStates(prev => prev.map(state =>
      state.isActive ? { ...state, isActive: false } : state
    ));
  }, [simulationModelKey]);

  const createSimulationSession = useCallback((): AppSimulationSession => (
    createAppSimulationSession({
      tickMs,
      states,
      junctions,
      transitions,
      variables,
      layers,
      safetyMode,
      hilConfig
    }, simulationIOMappings)
  ), [
    tickMs, states, junctions, transitions, variables, layers,
    safetyMode, hilConfig, simulationIOMappings
  ]);

  const readFactoryInputs = useCallback(async (): Promise<Record<string, AppSimulationValue>> => {
    if (!factoryIOEnabled || !(window as any).require) return {};

    try {
      const { ipcRenderer } = (window as any).require('electron');
      const tags = await ipcRenderer.invoke('sync-factory-io', { actuators: [] });
      if (!Array.isArray(tags)) {
        setFactoryIOStatus('error');
        return {};
      }

      const inputs: Record<string, AppSimulationValue> = {};
      for (const mapping of factoryIOMapping) {
        if (mapping.type !== 'sensor') continue;
        const tag = tags.find((item: any) => String(item.id) === String(mapping.factoryTagId));
        if (!tag) continue;
        inputs[String(mapping.factoryTagId)] = typeof tag.value === 'boolean'
          ? tag.value
          : Number(tag.value);
      }
      setFactoryIOStatus('connected');
      return inputs;
    } catch {
      setFactoryIOStatus('error');
      return {};
    }
  }, [factoryIOEnabled, factoryIOMapping]);

  const writeFactoryOutputs = useCallback(async (
    outputValues: Readonly<Record<string, AppSimulationValue>>
  ): Promise<void> => {
    if (!factoryIOEnabled || !(window as any).require) return;

    try {
      const { ipcRenderer } = (window as any).require('electron');
      const actuators = factoryIOMapping
        .filter(mapping => mapping.type === 'actuator')
        .map(mapping => ({
          id: mapping.factoryTagId,
          value: outputValues[String(mapping.factoryTagId)]
        }))
        .filter(item => item.value !== undefined);
      await commitAppOutputRequest(
        () => ipcRenderer.invoke('sync-factory-io', { actuators })
      );
      setFactoryIOStatus('connected');
    } catch (error) {
      setFactoryIOStatus('error');
      throw error;
    }
  }, [factoryIOEnabled, factoryIOMapping]);

  const applySimulationFrameToReact = useCallback((
    session: AppSimulationSession,
    frame: SemanticTraceFrame,
    timeSeconds: number,
    sampleScope: boolean
  ) => {
    const update = traceFrameToAppUpdate(frame, session.ir);
    const activeIds = new Set(Object.values(update.activeStates));

    setVariables(prev => prev.map(variable => {
      if (!Object.prototype.hasOwnProperty.call(update.variableValues, variable.id)) {
        return variable;
      }
      const currentValue = update.variableValues[variable.id];
      return currentValue === variable.currentValue
        ? variable
        : { ...variable, currentValue };
    }));
    setActiveStates({ ...update.activeStates });
    setStateTimers({ ...update.stateTimers });
    setFiredTransitions({ ...update.firedTransitions });
    setStates(prev => prev.map(state => ({
      ...state,
      isActive: activeIds.has(state.id)
    })));

    if (update.traceEvents.length > 0) {
      setTraceHistory(prev => [
        ...prev,
        ...update.traceEvents.map(event => {
          const transition = session.ir.transitions[event.transitionId];
          const source = transition
            ? states.find(state => state.id === transition.sourceStateId)
            : undefined;
          const target = transition
            ? states.find(state => state.id === transition.destinationStateId)
            : undefined;
          return {
            ...event,
            time: timeSeconds,
            state: target?.name || event.state,
            transition: source && target
              ? source.name + ' -> ' + target.name
              : event.transition
          };
        })
      ].slice(-200));
    }

    if (sampleScope && (!sampleOnTransitionOnly || update.traceEvents.length > 0)) {
      const dataPoint: ScopeDataPoint = { time: timeSeconds };
      variables.forEach(variable => {
        if (!variable.visibleInScope) return;
        const value = update.variableValues[variable.id] ?? variable.currentValue;
        dataPoint[variable.name] = typeof value === 'boolean'
          ? (value ? 1 : 0)
          : Number(value);
      });
      setScopeData(prev => {
        const next = [...prev, dataPoint];
        return next.length > SCOPE_MAX_POINTS
          ? next.slice(-SCOPE_MAX_POINTS)
          : next;
      });
    }
  }, [sampleOnTransitionOnly, states, variables]);

  // SIMULATION: shared semantic interpreter with explicit read/step/write I/O.
  const simulationStep = useCallback(async () => {
    const lifecycle = simulationLifecycleRef.current;
    const operation = lifecycle.begin();
    if (!operation) return false;

    try {
      let session = simulationSessionRef.current;
      if (!session) {
        session = createSimulationSession();
        simulationSessionRef.current = session;
        applySimulationFrameToReact(
          session,
          session.initialFrame,
          simulationTime,
          false
        );
      }

      const newTime = simulationTime + tickMs / 1000;
      const frame = await runAppSimulationTick(session, tickMs, {
        readInputs: readFactoryInputs,
        isCurrent: () => lifecycle.isCurrent(operation),
        applyFrame: nextFrame => {
          setSimulationTime(newTime);
          applySimulationFrameToReact(session, nextFrame, newTime, true);
        },
        commitOutputs: writeFactoryOutputs,
      });
      if (frame === null) return false;

      if (frame.error) {
        setIsRunning(false);
        lifecycle.invalidate();
        addError('error', frame.error, 'Simulation');
        return false;
      }
      return true;
    } catch (error: any) {
      if (shouldReportAppOperationError(lifecycle, operation, error)) {
        setIsRunning(false);
        lifecycle.invalidate();
        addError('error', error.message || String(error), 'Simulation');
      }
      return false;
    } finally {
      lifecycle.finish(operation);
    }
  }, [
    addError, applySimulationFrameToReact, createSimulationSession,
    readFactoryInputs, simulationTime, tickMs,
    writeFactoryOutputs
  ]);

  const startSimulation = useCallback(async () => {
    const sysmlGate = evaluateSysmlOperationGate(canonicalSysmlRepository, 'simulate');
    if (!sysmlGate.allowed) {
      sysmlGate.diagnostics.filter(item => item.severity === 'error').forEach(item => addError('error', `${item.code}: ${item.message}`, 'SysML'));
      return;
    }
    if (!validateModel()) return;

    const lifecycle = simulationLifecycleRef.current;
    lifecycle.invalidate();
    const generation = lifecycle.currentGeneration();
    await lifecycle.whenIdle();
    if (!lifecycle.isGenerationCurrent(generation)) return;

    try {
      const session = createSimulationSession();
      simulationSessionRef.current = session;
      setSimulationTime(0);
      setScopeData([]);
      setTraceHistory([]);
      setFiredTransitions({});
      applySimulationFrameToReact(session, session.initialFrame, 0, false);
      if (session.initialFrame.error) {
        addError('error', session.initialFrame.error, 'Simulation');
        return;
      }
      setIsRunning(true);
      addError('info', 'Simulation started');
    } catch (error: any) {
      simulationSessionRef.current = null;
      addError('error', error.message || String(error), 'Simulation');
    }
  }, [
    addError, applySimulationFrameToReact, createSimulationSession,
    validateModel, canonicalSysmlRepository
  ]);

  const pauseSimulation = useCallback(() => {
    simulationLifecycleRef.current.invalidate();
    setIsRunning(false);
    addError('info', 'Simulation paused');
  }, [addError]);

  const resetSimulation = useCallback(async () => {
    setIsRunning(false);
    const lifecycle = simulationLifecycleRef.current;
    lifecycle.invalidate();
    const generation = lifecycle.currentGeneration();
    await lifecycle.whenIdle();
    if (!lifecycle.isGenerationCurrent(generation)) return;

    const operation = lifecycle.begin();
    if (!operation) return;

    try {
      const session = simulationSessionRef.current ?? createSimulationSession();
      simulationSessionRef.current = session;
      const frame = await resetAppSimulationSession(
        session,
        async outputs => {
          if (lifecycle.isCurrent(operation)) {
            await writeFactoryOutputs(outputs);
          }
        }
      );
      if (!lifecycle.isCurrent(operation)) return;

      setSimulationTime(0);
      setScopeData([]);
      setTraceHistory([]);
      setFiredTransitions({});
      applySimulationFrameToReact(session, frame, 0, false);
      addError(
        frame.error ? 'error' : 'info',
        frame.error || 'Simulation reset',
        'Simulation'
      );
    } catch (error: any) {
      if (shouldReportAppOperationError(lifecycle, operation, error)) {
        lifecycle.invalidate();
        simulationSessionRef.current = null;
        addError('error', error.message || String(error), 'Simulation');
      }
    } finally {
      lifecycle.finish(operation);
    }
  }, [
    addError, applySimulationFrameToReact, createSimulationSession,
    writeFactoryOutputs
  ]);

  const stepSimulation = useCallback(async () => {
    if (isRunning) {
      setIsRunning(false);
    }
    const lifecycle = simulationLifecycleRef.current;
    lifecycle.invalidate();
    const generation = lifecycle.currentGeneration();
    await lifecycle.whenIdle();
    if (!lifecycle.isGenerationCurrent(generation)) return;

    const completed = await simulationStep();
    if (completed) addError('info', 'Simulation step');
  }, [isRunning, simulationStep, addError]);

  const simStepRef = useRef(simulationStep);
  useEffect(() => {
    simStepRef.current = simulationStep;
  }, [simulationStep]);

  // One-time migration: ensure all requirement blocks have a layerId.
  // Blocks without layerId are old data and belong to the root layer.
  useEffect(() => {
    setBlocks(prev => {
      const needsMigration = prev.some(b => b.stereotype === 'requirement' && b.layerId === undefined);
      if (!needsMigration) return prev;
      return prev.map(b =>
        b.stereotype === 'requirement' && b.layerId === undefined
          ? { ...b, layerId: 'root' }
          : b
      );
    });
  }, []); // Run once on mount

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const loopGeneration = simulationLifecycleRef.current.currentGeneration();

    const runLoop = async () => {
      if (
        !cancelled
        && simulationLifecycleRef.current.isGenerationCurrent(loopGeneration)
      ) {
        const completed = await simStepRef.current();
        if (
          !completed
          || cancelled
          || !simulationLifecycleRef.current.isGenerationCurrent(loopGeneration)
        ) {
          return;
        }
        timer = setTimeout(runLoop, tickMs);
      }
    };

    if (isRunning) {
      runLoop();
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isRunning, tickMs]);

  // LAYER / NESTED STATE OPERATIONS
  const enterLayer = useCallback((stateId: string) => {
    const state = states.find(s => s.id === stateId);
    if (!state) return;

    let layer = layers.find(l => l.parentStateId === stateId);
    if (!layer) {
      layer = {
        id: uuidv4(),
        name: state.name,
        parentStateId: stateId,
        stateIds: [],
        transitionIds: [],
        junctionIds: []
      };
      setLayers(prev => [...prev, layer!]);
    }

    setLayerStack(prev => [...prev, currentLayerId]);
    setLayerPath(prev => [...prev, state.name]);
    setCurrentLayerId(layer.id);
    setSelectedIds([]);
    addError('info', `Entered layer: ${state.name}`);
  }, [states, layers, currentLayerId, addError]);

  const enterRequirement = useCallback((blockId: string) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;

    setLayerStack(prev => [...prev, currentLayerId]);
    setLayerPath(prev => [...prev, block.name]);
    setCurrentLayerId(blockId);
    setSelectedIds([]);
    addError('info', `Entered requirement: ${block.name}`);
  }, [blocks, currentLayerId, addError]);

  const enterBlock = useCallback((blockId: string) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;

    setLayerStack(prev => [...prev, currentLayerId]);
    setLayerPath(prev => [...prev, block.name]);
    setCurrentLayerId(blockId);
    setDiagramMode('ibd');
    setSelectedIds([]);
    addError('info', `Entered block: ${block.name}`);
  }, [blocks, currentLayerId, addError]);

  const exitLayer = useCallback(() => {
    if (layerStack.length === 0) return;
    const parentLayerId = layerStack[layerStack.length - 1];
    setLayerStack(prev => prev.slice(0, -1));
    setLayerPath(prev => prev.slice(0, -1));
    setCurrentLayerId(parentLayerId);

    if (diagramMode === 'ibd' && parentLayerId === 'root') {
      setDiagramMode('bdd');
    }

    setSelectedIds([]);
    addError('info', 'Returned to parent layer');
  }, [layerStack, diagramMode, addError]);

  const goToLayer = useCallback((index: number) => {
    if (index >= layerPath.length - 1) return;
    const targetLayerId = layerStack[index];
    setLayerStack(prev => prev.slice(0, index));
    setLayerPath(prev => prev.slice(0, index + 1));
    setCurrentLayerId(targetLayerId);

    if (diagramMode === 'ibd' && targetLayerId === 'root') {
      setDiagramMode('bdd');
    }

    setSelectedIds([]);
    addError('info', `Navigated to layer: ${layerPath[index]}`);
  }, [layerStack, layerPath, diagramMode, addError]);

  // STATE MACHINE EDITOR
  const createState = useCallback((x: number, y: number, parentId?: string) => {
    addToHistory();
    const targetLayerId = parentId || currentLayerId;
    const layerStates = states.filter(s => s.parentId === targetLayerId);

    const existingPriorities = layerStates.map(s => s.priority);
    const newPriority = existingPriorities.length > 0 ? Math.max(...existingPriorities) + 10 : 10;

    let finalX = snapEnabled ? snapToGrid(x - DEFAULT_STATE_WIDTH / 2, GRID_SIZE) : x - DEFAULT_STATE_WIDTH / 2;
    let finalY = snapEnabled ? snapToGrid(y - DEFAULT_STATE_HEIGHT / 2, GRID_SIZE) : y - DEFAULT_STATE_HEIGHT / 2;

    if (targetLayerId !== 'root') {
      const parentState = states.find(s => s.id === layers.find(l => l.id === targetLayerId)?.parentStateId);
      if (parentState) {
        finalX = Math.max(parentState.x, Math.min(finalX, parentState.x + parentState.width - DEFAULT_STATE_WIDTH));
        finalY = Math.max(parentState.y, Math.min(finalY, parentState.y + parentState.height - DEFAULT_STATE_HEIGHT));
      }
    }

    const newState: StateData = {
      id: uuidv4(),
      name: `State_${states.length + 1}`,
      x: finalX,
      y: finalY,
      width: DEFAULT_STATE_WIDTH,
      height: DEFAULT_STATE_HEIGHT,
      entry: '',
      during: '',
      exit: '',
      isActive: false,
      color: STATE_COLORS[Math.floor(Math.random() * STATE_COLORS.length)],
      parentId: targetLayerId,
      children: [],
      priority: newPriority,
      isParallel: false,
      regionId: null,
      autostart: layerStates.length === 0,
      historyType: 'none',
      internalTransitions: ''
    };

    setStates(prev => [...prev, newState]);
    setLayers(prev => prev.map(l =>
      l.id === targetLayerId
        ? { ...l, stateIds: [...l.stateIds, newState.id] }
        : l
    ));

    setSelectedIds([newState.id]);
    addError('info', `Created state: ${newState.name}`);
  }, [states, snapEnabled, currentLayerId, addError, addToHistory, layers]);

  const updateState = useCallback((id: string, updates: Partial<StateData>) => {
    setStates(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    if (updates.autostart) {
      setStates(prev => {
        const target = prev.find(s => s.id === id);
        if (!target) return prev;
        return prev.map(s => {
          if (s.id !== id && s.parentId === target.parentId && s.autostart) return { ...s, autostart: false };
          return s;
        });
      });
      setJunctions(prev => {
        const targetState = states.find(s => s.id === id);
        if (!targetState) return prev;
        const parentLayerId = targetState.parentId || 'root';
        const layer = layers.find(l => l.id === parentLayerId);
        if (!layer) return prev;
        return prev.map(j => layer.junctionIds.includes(j.id) && j.autostart ? { ...j, autostart: false } : j);
      });
    }
  }, [layers, states]);

  const applyNonStateTransaction = useCallback((transaction: import('./services/sysmlTransactionAdapter').LegacySysmlDeletionResult, ids: string[]) => {
    const idSet = new Set(ids);
    addToHistory();
    setJunctions(prev => prev.filter(j => !idSet.has(j.id)));
    setTransitions(prev => prev.filter(t => !idSet.has(t.id) && !idSet.has(t.sourceId) && !idSet.has(t.targetId)));
    setLayers(prev => prev.map(l => ({
      ...l,
      junctionIds: l.junctionIds.filter(jid => !idSet.has(jid)),
      transitionIds: l.transitionIds.filter(tid => !idSet.has(tid))
    })));
    const deletedIds = new Set(transaction.impact.deletedElementIds);
    setBlocks(transaction.model.blocks);
    setRelationships(transaction.model.relationships);
    setParts(transaction.model.parts);
    setConnectors(transaction.model.connectors);
    setInterfaceRealizations(prev => prev.filter(ir => !deletedIds.has(ir.id) && !deletedIds.has(ir.partId) && !deletedIds.has(ir.interfaceId)));
    setSelectedIds(prev => prev.filter(sid => !deletedIds.has(sid)));
  }, [addToHistory]);

  const deleteNonStateElements = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    if (idSet.size === 0) return;

    const transaction = applyLegacySysmlDeletion({ blocks, relationships, parts, connectors }, ids);
    const severity = impactSeverity(transaction.impact, authorizedBaselineIds);
    if (severity === 'blocked') {
      const blocked = transaction.impact.blockedBaselineIds ?? transaction.impact.affectedBaselineIds;
      setSysmlDeleteConfirm({
        impact: transaction.impact,
        transaction,
        elementName: `${ids.length} element(s)`,
        elementKind: 'element',
        severity,
        onConfirm: () => {},
      });
      return;
    }
    if (requiresDeletionConfirmation(transaction.impact)) {
      setSysmlDeleteConfirm({
        impact: transaction.impact,
        transaction,
        elementName: `${ids.length} element(s)`,
        elementKind: 'element',
        severity,
        onConfirm: () => {
          applyNonStateTransaction(transaction, ids);
        },
      });
      return;
    }
    applyNonStateTransaction(transaction, ids);
  }, [blocks, relationships, parts, connectors, authorizedBaselineIds, applyNonStateTransaction]);

  const deleteStates = useCallback((targetIds: string | string[], otherDeletedIds: string[] = []) => {
    const rawIds = Array.isArray(targetIds) ? targetIds : [targetIds];
    const targetStateIds = rawIds.filter(id => states.some(s => s.id === id));
    if (targetStateIds.length === 0) {
      if (otherDeletedIds.length > 0) {
        deleteNonStateElements(otherDeletedIds);
      }
      return;
    }

    if (targetStateIds.length === 1) {
      const state = states.find(s => s.id === targetStateIds[0]);
      if (!state) return;

      const { stateCount, layerCount } = countDescendants(state.id, states, layers);
      const hasChildren = stateCount > 0 || layerCount > 0;

      let parts = '';
      if (hasChildren) {
        const stateMsg = stateCount > 0 ? `${stateCount} child state(s)` : '';
        const layerMsg = layerCount > 0 ? `${layerCount} sub-layer(s)` : '';
        parts = [stateMsg, layerMsg].filter(Boolean).join(' and ');
      }

      setDeleteConfirmState({
        id: state.id,
        ids: [state.id],
        name: state.name,
        parts,
        hasChildren,
        totalStates: 1,
        otherDeletedIds
      });
    } else {
      let totalNestedStates = 0;
      let totalNestedLayers = 0;
      for (const sid of targetStateIds) {
        const { stateCount, layerCount } = countDescendants(sid, states, layers);
        totalNestedStates += stateCount;
        totalNestedLayers += layerCount;
      }
      const hasChildren = totalNestedStates > 0 || totalNestedLayers > 0;
      let parts = '';
      if (hasChildren) {
        const stateMsg = totalNestedStates > 0 ? `${totalNestedStates} child state(s)` : '';
        const layerMsg = totalNestedLayers > 0 ? `${totalNestedLayers} sub-layer(s)` : '';
        parts = [stateMsg, layerMsg].filter(Boolean).join(' and ');
      }

      setDeleteConfirmState({
        ids: targetStateIds,
        name: `${targetStateIds.length} states`,
        parts,
        hasChildren,
        totalStates: targetStateIds.length,
        otherDeletedIds
      });
    }
  }, [states, layers, deleteNonStateElements]);

  const deleteState = useCallback((id: string) => {
    deleteStates([id]);
  }, [deleteStates]);

  const executeDeleteState = useCallback((targetIds?: string | string[], otherDeletedIds: string[] = []) => {
    setDeleteConfirmState(null);
    const resolvedIds = targetIds
      ? (Array.isArray(targetIds) ? targetIds : [targetIds])
      : (deleteConfirmState ? deleteConfirmState.ids : []);
    const resolvedOtherIds = otherDeletedIds.length > 0
      ? otherDeletedIds
      : (deleteConfirmState?.otherDeletedIds || []);

    if (resolvedIds.length === 0 && resolvedOtherIds.length === 0) return;

    addToHistory();

    let nextStates = states;
    let nextLayers = layers;
    let nextJunctions = junctions;
    let nextTransitions = transitions;
    let nextCurrentLayerId = currentLayerId;
    let nextLayerStack = layerStack;
    let nextLayerPath = layerPath;

    if (resolvedIds.length > 0) {
      const result = pruneMultipleStatesHierarchy(
        resolvedIds,
        { states, layers, junctions, transitions },
        { currentLayerId, layerStack, layerPath }
      );

      nextStates = result.states;
      nextLayers = result.layers;
      nextJunctions = result.junctions;
      nextTransitions = result.transitions;
      nextCurrentLayerId = result.navigation.currentLayerId;
      nextLayerStack = result.navigation.layerStack;
      nextLayerPath = result.navigation.layerPath;
    }

    if (resolvedOtherIds.length > 0) {
      const otherSet = new Set(resolvedOtherIds);
      nextJunctions = nextJunctions.filter(j => !otherSet.has(j.id));
      nextTransitions = nextTransitions.filter(t => !otherSet.has(t.id) && !otherSet.has(t.sourceId) && !otherSet.has(t.targetId));
      nextLayers = nextLayers.map(l => ({
        ...l,
        junctionIds: l.junctionIds.filter(jid => !otherSet.has(jid)),
        transitionIds: l.transitionIds.filter(tid => !otherSet.has(tid))
      }));
      setBlocks(prev => prev.filter(b => !otherSet.has(b.id)));
      setRelationships(prev => prev.filter(r => !otherSet.has(r.id) && !otherSet.has(r.sourceId) && !otherSet.has(r.targetId)));
      setParts(prev => prev.filter(p => !otherSet.has(p.id)));
      setConnectors(prev => prev.filter(c => !otherSet.has(c.id) && !otherSet.has(c.sourcePartId) && !otherSet.has(c.targetPartId)));
      setInterfaceRealizations(prev => prev.filter(ir => !otherSet.has(ir.id) && !otherSet.has(ir.partId) && !otherSet.has(ir.interfaceId)));
    }

    setStates(nextStates);
    setLayers(nextLayers);
    setJunctions(nextJunctions);
    setTransitions(nextTransitions);
    setCurrentLayerId(nextCurrentLayerId);
    setLayerStack(nextLayerStack);
    setLayerPath(nextLayerPath);

    const allDeletedIds = new Set([...resolvedIds, ...resolvedOtherIds]);
    setSelectedIds(prev => prev.filter(sid => !allDeletedIds.has(sid)));

    const deletedStateCount = resolvedIds.length;
    if (deletedStateCount === 1) {
      const stateObj = states.find(s => s.id === resolvedIds[0]);
      addError('info', `Deleted state: ${stateObj?.name || resolvedIds[0]}`);
    } else if (deletedStateCount > 1) {
      addError('info', `Deleted ${deletedStateCount} states`);
    } else {
      addError('info', 'Deleted selected elements');
    }
  }, [deleteConfirmState, states, layers, junctions, transitions, currentLayerId, layerStack, layerPath, addError, addToHistory]);

  const createXBridgesState = useCallback((x: number, y: number) => {
    addToHistory();
    const finalX = snapEnabled ? snapToGrid(x - DEFAULT_STATE_WIDTH / 2, GRID_SIZE) : x - DEFAULT_STATE_WIDTH / 2;
    const finalY = snapEnabled ? snapToGrid(y - DEFAULT_STATE_HEIGHT / 2, GRID_SIZE) : y - DEFAULT_STATE_HEIGHT / 2;

    const newState: StateData = {
      id: uuidv4(),
      name: `XBridges_${states.length + 1}`,
      x: finalX,
      y: finalY,
      width: DEFAULT_STATE_WIDTH,
      height: DEFAULT_STATE_HEIGHT,
      entry: '',
      during: '',
      exit: '',
      isActive: false,
      color: '#4caf50', // Emerald for X-Bridges
      parentId: currentLayerId,
      children: [],
      priority: 10,
      isParallel: false,
      regionId: null,
      autostart: false,
      isXBridges: true,
      xBridgesModel: {
        nodes: [],
        edges: [],
        mappings: [],
        solver: { kind: 'euler', stepSeconds: 0.01 },
        policy: { memory: 'reset', numericFault: 'escalate' },
      },
      internalTransitions: ''
    };

    setStates(prev => [...prev, newState]);
    setLayers(prev => prev.map(l =>
      l.id === currentLayerId ? { ...l, stateIds: [...l.stateIds, newState.id] } : l
    ));
    setSelectedIds([newState.id]);
    addError('info', `Created X-Bridges state: ${newState.name}`);
  }, [states, snapEnabled, currentLayerId, addError, addToHistory]);

  const createJunction = useCallback((x: number, y: number, type: 'junction' | 'history' | 'deep-history' = 'junction', parentId: string | null = null) => {
    addToHistory();
    const newJunction: JunctionData = {
      id: uuidv4(),
      x: snapEnabled ? snapToGrid(x, GRID_SIZE) : x,
      y: snapEnabled ? snapToGrid(y, GRID_SIZE) : y,
      name: type === 'history' ? 'H' : type === 'deep-history' ? 'H*' : `J${junctions.length + 1}`,
      color: JUNCTION_COLOR,
      parentId: parentId,
      type: type,
      autostart: false
    };

    setJunctions(prev => [...prev, newJunction]);
    setLayers(prev => prev.map(l =>
      l.id === currentLayerId
        ? { ...l, junctionIds: [...l.junctionIds, newJunction.id] }
        : l
    ));

    setSelectedIds([newJunction.id]);
    addError('info', `Created junction: ${newJunction.name}`);
  }, [junctions.length, snapEnabled, currentLayerId, addError, addToHistory, layers]);

  const updateJunction = useCallback((id: string, updates: Partial<JunctionData>) => {
    setJunctions(prev => prev.map(j => j.id === id ? { ...j, ...updates } : j));
    if (updates.autostart) {
      setJunctions(prev => {
        const layer = layers.find(l => l.junctionIds.includes(id));
        if (!layer) return prev;
        return prev.map(j => layer.junctionIds.includes(j.id) && j.id !== id && j.autostart ? { ...j, autostart: false } : j);
      });
      setStates(prev => {
        const layer = layers.find(l => l.junctionIds.includes(id));
        if (!layer) return prev;
        return prev.map(s => layer.stateIds.includes(s.id) && s.autostart ? { ...s, autostart: false } : s);
      });
    }
  }, [layers]);

  const deleteJunction = useCallback((id: string) => {
    const junction = junctions.find(j => j.id === id);
    if (!junction) return;

    setTransitions(prev => prev.filter(t => t.sourceId !== id && t.targetId !== id));
    setLayers(prev => prev.map(l => ({
      ...l,
      junctionIds: l.junctionIds.filter(jid => jid !== id)
    })));
    setJunctions(prev => prev.filter(j => j.id !== id));
    setSelectedIds(prev => prev.filter(sid => sid !== id));
    addError('info', `Deleted junction: ${junction.name}`);
  }, [junctions, addError]);

  const createTransition = useCallback((sourceId: string, targetId: string) => {
    addToHistory();
    const outgoingTransitions = transitions.filter(t => t.sourceId === sourceId);
    const order = outgoingTransitions.length > 0 ? Math.max(...outgoingTransitions.map(t => t.order)) + 1 : 0;

    const newTransition: TransitionData = {
      id: uuidv4(),
      sourceId,
      targetId,
      condition: 'true',
      action: '',
      afterTicks: null,
      type: 'condition',
      hasControlPoint: false,
      order,
      isInternal: false,
    };

    setTransitions(prev => [...prev, newTransition]);
    setLayers(prev => prev.map(l =>
      l.id === currentLayerId
        ? { ...l, transitionIds: [...l.transitionIds, newTransition.id] }
        : l
    ));

    setSelectedIds([newTransition.id]);
    addError('info', 'Created transition');
  }, [transitions, currentLayerId, addError, addToHistory]);

  const updateTransition = useCallback((id: string, updates: Partial<TransitionData>) => {
    setTransitions(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);

  const deleteTransition = useCallback((id: string) => {
    setTransitions(prev => prev.filter(t => t.id !== id));
    setLayers(prev => prev.map(l => ({
      ...l,
      transitionIds: l.transitionIds.filter(tid => tid !== id)
    })));
    setSelectedIds(prev => prev.filter(sid => sid !== id));
    addError('info', 'Deleted transition');
  }, [addError]);

  // BDD OPERATIONS
  const createBlock = useCallback((x: number, y: number, stereotype: string = 'block') => {
    addToHistory();
    const newId = uuidv4();
    // For requirements diagram, store which layer this block was created in
    const blockLayerId = (diagramMode === 'requirements') ? currentLayerId : undefined;
    const newBlock: BlockData = {
      id: newId,
      name: `New${stereotype.charAt(0).toUpperCase() + stereotype.slice(1)}`,
      stereotype,
      x: snapEnabled ? snapToGrid(x - 75, GRID_SIZE) : x - 75,
      y: snapEnabled ? snapToGrid(y - 50, GRID_SIZE) : y - 50,
      width: 150,
      height: 100,
      properties: [],
      classes: [],
      operations: [],
      constraints: [],
      ports: [],
      reqId: stereotype === 'requirement' ? `REQ-${blocks.filter(b => b.stereotype === 'requirement').length + 1}` : undefined,
      status: stereotype === 'requirement' ? 'Draft' : undefined,
      priority: stereotype === 'requirement' ? 'Medium' : undefined,
      description: stereotype === 'requirement' ? 'Requirement text...' : undefined,
      risk: stereotype === 'requirement' ? 'Medium' : undefined,
      verificationMethod: stereotype === 'requirement' ? 'Test' : undefined,
      source: stereotype === 'requirement' ? '' : undefined,
      version: stereotype === 'requirement' ? '1.0' : undefined,
      rationale: stereotype === 'requirement' ? '' : undefined,
      namespace: [],
      isAbstract: false,
      isLeaf: false,
      layerId: blockLayerId,
    };
    setBlocks(prev => [...prev, newBlock]);

    setSelectedIds([newBlock.id]);
    addError('info', `Created ${stereotype}: ${newBlock.name}`);
  }, [snapEnabled, addError, addToHistory, blocks, diagramMode, currentLayerId]);

  const updateBlock = useCallback((id: string, updates: Partial<BlockData>) => {
    const current = blocks.find(block => block.id === id);
    if (!current) return;
    const candidate = { ...current, ...updates };
    const connectionRejection = rejectBlockConnectionChange({ blocks, parts, relationships }, candidate);
    if (connectionRejection) {
      showConnectionPolicyError(connectionRejection, id);
      return;
    }
    if (current.stereotype === 'requirement' && candidate.stereotype !== 'requirement') {
      addError('error', 'A SysML requirement cannot be changed to an unrelated stereotype.', 'SysML', id);
      return;
    }
    const currentValidation = validateLegacyBlockEdit(blocks, relationships, id);
    const validation = validateLegacyBlockEdit([...blocks.filter(block => block.id !== id), candidate], relationships, id);
    if (!validation.valid && (currentValidation.valid || introducesNewValidationCodes(currentValidation, validation))) {
      addError('error', `Invalid SysML attribute: ${validation.messages[0] || validation.codes[0]}`, 'SysML', id);
      return;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'properties')) {
      const reconciled = reconcilePropertyUsages(
        blocks.map(block => block.id === id ? candidate : block),
        parts,
        connectors,
        id,
        'property',
      );
      setBlocks(reconciled.blocks);
      setParts(reconciled.parts);
      setConnectors(reconciled.connectors);
    } else {
      setBlocks(prev => prev.map(b => b.id === id ? candidate : b));
    }
  }, [addError, blocks, connectors, parts, relationships, showConnectionPolicyError]);

  const applySysmlDeletion = useCallback((transaction: import('./services/sysmlTransactionAdapter').LegacySysmlDeletionResult, msg: string) => {
    addToHistory();
    const deletedIds = new Set(transaction.impact.deletedElementIds);
    const deletedPartIds = transaction.model.parts.length === 0
      ? new Set(parts.filter(part => deletedIds.has(part.id)).map(part => part.id))
      : new Set(parts.filter(part => deletedIds.has(part.id) && !transaction.model.parts.some(next => next.id === part.id)).map(part => part.id));
    setBlocks([...deletedPartIds].reduce((current, partId) => removePartProperty(current, partId), transaction.model.blocks));
    setRelationships(transaction.model.relationships);
    setParts(transaction.model.parts);
    setConnectors(transaction.model.connectors);
    setInterfaceRealizations(prev => prev.filter(ir => !deletedIds.has(ir.id) && !deletedIds.has(ir.partId) && !deletedIds.has(ir.interfaceId)));
    setSelectedIds(prev => prev.filter(sid => !deletedIds.has(sid)));
    addError('info', msg);
  }, [addToHistory, addError, parts]);

  const deleteBlock = useCallback((id: string) => {
    const block = blocks.find(b => b.id === id);
    if (!block) return;
    const kind = block.stereotype === 'requirement' ? 'requirement' : 'block';
    const transaction = applyLegacySysmlDeletion({ blocks, relationships, parts, connectors }, [id]);
    const severity = impactSeverity(transaction.impact, authorizedBaselineIds);
    if (severity === 'blocked' || requiresDeletionConfirmation(transaction.impact)) {
      setSysmlDeleteConfirm({
        impact: transaction.impact,
        transaction,
        elementName: block.name,
        elementKind: kind,
        severity,
        onConfirm: severity === 'blocked' ? () => {} : () => {
          applySysmlDeletion(transaction, `Deleted ${kind}: ${block.name}`);
        },
      });
      return;
    }
    applySysmlDeletion(transaction, `Deleted ${kind}: ${block.name}`);
  }, [blocks, relationships, parts, connectors, addError, addToHistory, authorizedBaselineIds, applySysmlDeletion]);

  const removeFromDiagram = useCallback((ids: string | string[]) => {
    const rawIds = Array.isArray(ids) ? ids : [ids];
    if (rawIds.length === 0) return;
    const idSet = new Set(rawIds);
    addToHistory();
    const currentDiagramId = diagramMode === 'requirements' ? 'requirements' : (diagramMode || 'default');
    setDiagramPresentations(prev => {
      const existing = prev[currentDiagramId]?.elementIds ?? blocks.map(b => b.id);
      return {
        ...prev,
        [currentDiagramId]: {
          elementIds: existing.filter(id => !idSet.has(id)),
        },
      };
    });
    setBlocks(prev => prev.filter(b => !idSet.has(b.id)));
    setRelationships(prev => prev.filter(r => !idSet.has(r.sourceId) && !idSet.has(r.targetId)));
    setSelectedIds(prev => prev.filter(sid => !idSet.has(sid)));
    addError('info', `Removed ${rawIds.length} element(s) from diagram (preserved in model)`);
  }, [addToHistory, diagramMode, blocks, addError]);

  const createRequirement = useCallback((x: number, y: number) => {
    createBlock(x, y, 'requirement');
  }, [createBlock]);

  const createRelationship = useCallback((sourceId: string, targetId: string, type: RelationshipData['type']) => {
    const newRel: RelationshipData = {
      id: uuidv4(),
      sourceId,
      targetId,
      type,
      label: '',
      sourceMultiplicity: '1',
      targetMultiplicity: '1'
    };
    const rejection = rejectUiRelationship({ blocks, parts, relationships }, newRel, diagramMode === 'ibd' ? 'ibd' : diagramMode === 'requirements' ? 'requirements' : 'bdd');
    if (rejection) {
      showConnectionPolicyError(rejection);
      return;
    }
    addToHistory();
    setRelationships(prev => [...prev, newRel]);
    setSelectedIds([newRel.id]);
    addError('info', `Created ${type}`);
  }, [addError, addToHistory, blocks, parts, relationships, diagramMode, showConnectionPolicyError]);

  const updateRelationship = useCallback((id: string, updates: Partial<RelationshipData>) => {
    const current = relationships.find(relationship => relationship.id === id);
    if (!current) return;
    const candidate = { ...current, ...updates };
    const rejection = rejectUiRelationship({ blocks, parts, relationships }, candidate, diagramMode === 'ibd' ? 'ibd' : diagramMode === 'requirements' ? 'requirements' : 'bdd');
    if (rejection) {
      showConnectionPolicyError(rejection, id);
      return;
    }
    setRelationships(prev => prev.map(r => r.id === id ? candidate : r));
  }, [relationships, blocks, parts, diagramMode, showConnectionPolicyError]);

  const deleteRelationship = useCallback((id: string) => {
    const transaction = applyLegacySysmlDeletion({ blocks, relationships, parts, connectors }, [id]);
    const severity = impactSeverity(transaction.impact, authorizedBaselineIds);
    if (severity === 'blocked' || requiresDeletionConfirmation(transaction.impact)) {
      const rel = relationships.find(r => r.id === id);
      setSysmlDeleteConfirm({
        impact: transaction.impact,
        transaction,
        elementName: rel?.label || id,
        elementKind: 'relationship',
        severity,
        onConfirm: severity === 'blocked' ? () => {} : () => {
          applySysmlDeletion(transaction, 'Deleted relationship');
        },
      });
      return;
    }
    applySysmlDeletion(transaction, 'Deleted relationship');
  }, [blocks, relationships, parts, connectors, addError, addToHistory, authorizedBaselineIds, applySysmlDeletion]);

  // IBD OPERATIONS
  const createPart = useCallback((x: number, y: number) => {
    addToHistory();
    const defId = uuidv4();
    const defName = `Part_${parts.length + 1}_Def`;
    const defBlock: BlockData = {
      id: defId,
      name: defName,
      stereotype: 'block',
      classes: [],
      x: 100,
      y: 100,
      width: 150,
      height: 100,
      properties: [],
      operations: [],
      constraints: [],
      ports: []
    };
    const nextBlocks = [...blocks, defBlock];

    const newPart: PartData = {
      id: uuidv4(),
      name: `part_${parts.length + 1}`,
      blockId: currentLayerId,
      typeId: defId,
      aggregation: 'composite',
      x: snapEnabled ? snapToGrid(x - 75, GRID_SIZE) : x - 75,
      y: snapEnabled ? snapToGrid(y - 50, GRID_SIZE) : y - 50,
      width: 150,
      height: 100,
      multiplicity: '1'
    };
    const reconciled = reconcilePropertyUsages(nextBlocks, [...parts, newPart], connectors, currentLayerId, 'usage');
    setParts(reconciled.parts);
    setConnectors(reconciled.connectors);
    setBlocks(reconciled.blocks);
    setSelectedIds([newPart.id]);
    addError('info', `Created part: ${newPart.name}`);
  }, [parts, connectors, currentLayerId, snapEnabled, addError, addToHistory, blocks]);

  const updatePart = useCallback((id: string, updates: Partial<PartData>) => {
    const current = parts.find(part => part.id === id);
    if (!current) return;
    const candidate = { ...current, ...updates };

    const isPureGeometricUpdate = Object.keys(updates).every(key => ['x', 'y', 'width', 'height'].includes(key));
    if (isPureGeometricUpdate) {
      setParts(prev => prev.map(p => p.id === id ? candidate : p));
      return;
    }

    const validName = /^[A-Za-z_][A-Za-z0-9_]*$/.test(candidate.name.trim());
    const validType = Boolean(candidate.typeId && blocks.some(block => block.id === candidate.typeId && block.stereotype === 'block'));
    let validMultiplicity = true;
    try { parseMultiplicity(candidate.multiplicity || '1'); } catch { validMultiplicity = false; }
    if (!validName || !validType || !validMultiplicity) {
      addError('error', !validName
        ? `Invalid SysML part name "${candidate.name}".`
        : !validType
          ? `Part ${candidate.name || id} must reference a block type.`
          : `Invalid multiplicity "${candidate.multiplicity || ''}" for part ${candidate.name || id}.`, 'SysML', id);
      return;
    }
    const reconciled = reconcilePropertyUsages(
      blocks,
      parts.map(p => p.id === id ? candidate : p),
      connectors,
      candidate.blockId || currentLayerId,
      'usage',
    );
    setParts(reconciled.parts);
    setBlocks(reconciled.blocks);
    setConnectors(reconciled.connectors);
  }, [addError, blocks, connectors, currentLayerId, parts]);

  const deletePart = useCallback((id: string) => {
    const part = parts.find(p => p.id === id);
    if (!part) return;
    const transaction = applyLegacySysmlDeletion({ blocks, relationships, parts, connectors }, [id]);
    const severity = impactSeverity(transaction.impact, authorizedBaselineIds);
    if (severity === 'blocked' || requiresDeletionConfirmation(transaction.impact)) {
      setSysmlDeleteConfirm({
        impact: transaction.impact,
        transaction,
        elementName: part.name,
        elementKind: 'part',
        severity,
        onConfirm: severity === 'blocked' ? () => {} : () => {
          applySysmlDeletion(transaction, `Deleted part: ${part.name}`);
        },
      });
      return;
    }
    applySysmlDeletion(transaction, `Deleted part: ${part.name}`);
  }, [blocks, relationships, parts, connectors, addError, addToHistory, authorizedBaselineIds, applySysmlDeletion]);

  const handleDoubleClick = useCallback((e: MouseEvent<HTMLDivElement>) => {
    if (e.target === canvasRef.current) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const worldX = ((e.clientX - rect.left) / uiZoom - view.offsetX) / view.scale;
      const worldY = ((e.clientY - rect.top) / uiZoom - view.offsetY) / view.scale;
      if (diagramMode === 'statemachine') {
        createState(worldX, worldY);
      } else if (diagramMode === 'bdd') {
        createBlock(worldX, worldY, 'block');
      } else if (diagramMode === 'requirements') {
        createRequirement(worldX, worldY);
      }
    }
  }, [createState, createBlock, createRequirement, view, uiZoom, diagramMode]);

  const handleAutoLayout = useCallback(() => {
    const reqs = blocks.filter(b => b.stereotype === 'requirement');
    if (reqs.length === 0) return;

    // Only layout requirements belonging to the current layer
    const visibleReqs = reqs.filter(block => (block.layerId ?? 'root') === currentLayerId);

    if (visibleReqs.length === 0) return;
    const limits = loadStoredPerformanceLimits();
    if (visibleReqs.length >= limits.performanceModeThreshold) {
      const proceed = window.confirm?.(
        `Auto-layout on ${visibleReqs.length} requirement elements may cause temporary UI latency. Proceed?`
      );
      if (!proceed) return;
    }
    const visibleIds = new Set(visibleReqs.map(r => r.id));

    const levels: Record<string, number> = {};

    // Find roots within the visible set
    const layerRoots = visibleReqs.filter(r => !relationships.some(rel => rel.targetId === r.id && visibleIds.has(rel.sourceId)));

    const queue = (layerRoots.length > 0 ? layerRoots : visibleReqs).map(r => ({ id: r.id, level: 0 }));
    const visited = new Set<string>();

    while (queue.length > 0) {
      const { id, level } = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      levels[id] = level;

      const children = relationships
        .filter(rel => rel.sourceId === id && visibleIds.has(rel.targetId))
        .map(rel => rel.targetId);
      children.forEach(cid => queue.push({ id: cid, level: level + 1 }));
    }

    const levelGroups: Record<number, string[]> = {};
    Object.entries(levels).forEach(([id, lvl]) => {
      if (!levelGroups[lvl]) levelGroups[lvl] = [];
      levelGroups[lvl].push(id);
    });

    const newBlocks = [...blocks];
    Object.entries(levelGroups).forEach(([lvlStr, ids]) => {
      const lvl = parseInt(lvlStr);
      ids.forEach((id, index) => {
        const idx = newBlocks.findIndex(b => b.id === id);
        if (idx !== -1) newBlocks[idx] = { ...newBlocks[idx], x: 50 + index * 220, y: 50 + lvl * 180 };
      });
    });
    setBlocks(newBlocks);
    addError('info', 'Auto-layout applied to current layer.');
  }, [blocks, relationships, currentLayerId, addError]);

  const handleAddPortToSelected = useCallback((kind: 'standard' | 'flow' | 'proxy') => {
    if (selectedIds.length !== 1) {
      addError('warning', 'Select exactly one Block or Part to add a port.');
      return;
    }
    const id = selectedIds[0];

    const part = parts.find(p => p.id === id);
    if (part) {
      const originalTypeId = part.typeId;

      if (!originalTypeId) {
        const newBlockId = uuidv4();
        const newPort: PortData = { id: uuidv4(), name: `p1`, type: kind === 'proxy' ? 'Interface' : (kind === 'flow' ? 'Power' : 'void'), kind, direction: kind === 'flow' ? 'in' : undefined };
        const newBlock: BlockData = {
          id: newBlockId, name: `${part.name}_Def`, stereotype: 'block', classes: [],
          x: 100, y: 100, width: 150, height: 100,
          properties: [], operations: [], constraints: [], ports: [newPort]
        };
        setBlocks(prev => [...prev, newBlock]);
        updatePart(part.id, { typeId: newBlockId });
        addError('info', `Created definition '${newBlock.name}' for part and added port.`);
        return;
      }

      const isShared = parts.some(p => p.id !== part.id && p.typeId === originalTypeId);
      const originalBlock = blocks.find(b => b.id === originalTypeId);
      if (!originalBlock) {
        addError('error', `Could not find block definition with ID ${originalTypeId}`);
        return;
      }

      if (isShared) {
        addError('info', `Specializing definition for '${part.name}'...`);
        const newBlockId = uuidv4();
        const newBlock: BlockData = { ...originalBlock, id: newBlockId, name: `${originalBlock.name}_${part.name}`, ports: originalBlock.ports.map(p => ({ ...p })), properties: originalBlock.properties.map(p => ({ ...p })), constraints: originalBlock.constraints, };
        const newPort: PortData = { id: uuidv4(), name: `p${newBlock.ports.length + 1}`, type: kind === 'proxy' ? 'Interface' : (kind === 'flow' ? 'Power' : 'void'), kind, direction: kind === 'flow' ? 'in' : undefined };
        newBlock.ports.push(newPort);
        setBlocks(prev => [...prev, newBlock]);
        updatePart(part.id, { typeId: newBlockId });
        addError('info', `Created new definition '${newBlock.name}' and added port.`);
      } else {
        const newPort: PortData = { id: uuidv4(), name: `p${originalBlock.ports.length + 1}`, type: kind === 'proxy' ? 'Interface' : (kind === 'flow' ? 'Power' : 'void'), kind, direction: kind === 'flow' ? 'in' : undefined };
        updateBlock(originalTypeId, { ports: [...originalBlock.ports, newPort] });
        addError('info', `Added ${kind} port to definition: ${originalBlock.name}`);
      }
    } else {
      const block = blocks.find(b => b.id === id);
      if (!block) {
        addError('warning', 'Selected element is not a Block or Part.');
        return;
      }
      const newPort: PortData = { id: uuidv4(), name: `p${block.ports.length + 1}`, type: kind === 'proxy' ? 'Interface' : (kind === 'flow' ? 'Power' : 'void'), kind, direction: kind === 'flow' ? 'in' : undefined };
      updateBlock(id, { ports: [...block.ports, newPort] });
      addError('info', `Added ${kind} port to Block: ${block.name}`);
    }
  }, [selectedIds, blocks, parts, updateBlock, updatePart, addError, setBlocks]);

  const createInterfaceRealization = useCallback((interfaceId: string, partId: string, portId: string) => {
    addToHistory();
    const newRealization: InterfaceRealizationData = {
      id: uuidv4(),
      interfaceId,
      partId,
      portId,
    };
    setInterfaceRealizations(prev => [...prev, newRealization]);
    setSelectedIds([newRealization.id]);
    addError('info', 'Created interface realization');
  }, [addToHistory, addError]);

  const [isCreatingConnector, setIsCreatingConnector] = useState(false);
  const [connectorSource, setConnectorSource] = useState<{ partId: string, portId: string } | null>(null);

  const handlePortMouseDown = useCallback((e: MouseEvent<SVGRectElement>, elementId: string, portId: string) => {
    e.stopPropagation();
    if (isCreatingConnector) return; // Don't drag if we are trying to connect

    // Start dragging port
    setDraggedPort({ elementId, portId });
    setIsDragging(true); // To prevent other interactions
  }, [isCreatingConnector]);

  const handlePortClick = useCallback((e: MouseEvent<SVGRectElement>, partId: string, portId: string) => {
    e.stopPropagation();

    if (isCreatingTransition && transitionSourceId) {
      const sourceBlock = blocks.find(b => b.id === transitionSourceId);
      if (sourceBlock && sourceBlock.stereotype === 'interface') {
        // We are connecting an interface to a port.
        createInterfaceRealization(transitionSourceId, partId, portId);
        setIsCreatingTransition(false);
        setTransitionSourceId(null);
        return;
      }
    }

    if (isCreatingConnector) {
      if (connectorSource) {
        if (connectorSource.partId === partId && connectorSource.portId === portId) {
          setIsCreatingConnector(false);
          setConnectorSource(null);
          return;
        }

        // FR-IBD-003: Validate compatibility
        const getBlockForEnd = (pId: string) => {
          if (pId === currentLayerId) return blocks.find(b => b.id === pId);
          const p = parts.find(part => part.id === pId);
          return blocks.find(b => b.id === p?.typeId);
        };

        const sourceBlock = getBlockForEnd(connectorSource.partId);
        const targetBlock = getBlockForEnd(partId);

        const sourcePort = sourceBlock?.ports.find(p => p.id === connectorSource.portId);
        const targetPort = targetBlock?.ports.find(p => p.id === portId);

        if (sourcePort && targetPort) {
          if (sourcePort.type !== targetPort.type && sourcePort.type !== 'any' && targetPort.type !== 'any') {
            addError('error', `Incompatible ports: ${sourcePort.name} (${sourcePort.type}) vs ${targetPort.name} (${targetPort.type})`);
            return;
          }

          const newConnector: ConnectorData = {
            id: uuidv4(),
            sourcePartId: connectorSource.partId,
            sourcePortId: connectorSource.portId,
            targetPartId: partId,
            targetPortId: portId,
            kind: connectorSource.partId === currentLayerId || partId === currentLayerId ? 'delegation' : 'assembly'
          };
          const validation = validateLegacyConnectorCandidate({ blocks, parts, connectors }, newConnector, currentLayerId);
          if (!validation.valid) {
            addError('error', `Invalid connector: ${validation.reason}`);
            return;
          }
          addToHistory();
          setConnectors(prev => [...prev, newConnector]);
          addError('info', 'Created connection');
        }
        setIsCreatingConnector(false);
        setConnectorSource(null);
      } else {
        setConnectorSource({ partId, portId });
      }
    }
  }, [isCreatingConnector, connectorSource, parts, blocks, connectors, addError, addToHistory, isCreatingTransition, transitionSourceId, createInterfaceRealization, currentLayerId]);

  const deleteConnector = useCallback((id: string) => {
    const transaction = applyLegacySysmlDeletion({ blocks, relationships, parts, connectors }, [id]);
    const severity = impactSeverity(transaction.impact, authorizedBaselineIds);
    if (severity === 'blocked' || requiresDeletionConfirmation(transaction.impact)) {
      setSysmlDeleteConfirm({
        impact: transaction.impact,
        transaction,
        elementName: id,
        elementKind: 'connector',
        severity,
        onConfirm: severity === 'blocked' ? () => {} : () => {
          applySysmlDeletion(transaction, 'Deleted connector');
        },
      });
      return;
    }
    applySysmlDeletion(transaction, 'Deleted connector');
  }, [blocks, relationships, parts, connectors, addError, addToHistory, authorizedBaselineIds, applySysmlDeletion]);

  const updateConnector = useCallback((id: string, updates: Partial<ConnectorData>) => {
    const current = connectors.find(connector => connector.id === id);
    if (!current) return;
    const candidate = { ...current, ...updates };
    const validation = validateLegacyConnectorCandidate({ blocks, parts, connectors }, candidate, currentLayerId);
    if (!validation.valid) {
      addError('error', `Invalid connector update: ${validation.reason}`);
      return;
    }
    setConnectors(prev => prev.map(c => c.id === id ? candidate : c));
  }, [connectors, blocks, parts, currentLayerId, addError]);

  const deleteInterfaceRealization = useCallback((id: string) => {
    addToHistory();
    setInterfaceRealizations(prev => prev.filter(ir => ir.id !== id));
    setSelectedIds(prev => prev.filter(sid => sid !== id));
    addError('info', 'Disconnected interface');
  }, [addError, addToHistory]);

  const handleResizeStart = useCallback((e: React.MouseEvent, panel: string) => {
    e.preventDefault();
    setResizingPanel(panel);
  }, []);

  useEffect(() => {
    const handleResizeMove = (e: globalThis.MouseEvent) => {
      if (!resizingPanel) return;

      if (resizingPanel === 'hierarchy') {
        setHierarchyWidth(prev => Math.max(150, Math.min(500, prev + e.movementX / uiZoom)));
      } else if (resizingPanel === 'variables') {
        setVariablesWidth(prev => Math.max(150, Math.min(500, prev + e.movementX / uiZoom)));
      } else if (resizingPanel === 'properties') {
        setPropertiesWidth(prev => Math.max(200, Math.min(600, prev - e.movementX / uiZoom)));
      } else if (resizingPanel === 'scope') {
        setScopeHeight(prev => Math.max(100, Math.min(window.innerHeight - 200, prev - e.movementY / uiZoom)));
      }
    };

    const handleResizeEnd = () => {
      setResizingPanel(null);
    };

    if (resizingPanel) {
      window.addEventListener('mousemove', handleResizeMove);
      window.addEventListener('mouseup', handleResizeEnd);
      window.addEventListener('mouseleave', handleResizeEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('mouseup', handleResizeEnd);
      window.removeEventListener('mouseleave', handleResizeEnd);
    };
  }, [resizingPanel, uiZoom]);

  const handleResizeMouseDown = useCallback((e: MouseEvent<SVGRectElement>, handle: string, id: string) => {
    e.stopPropagation();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const worldX = ((e.clientX - rect.left) / uiZoom - view.offsetX) / view.scale;
    const worldY = ((e.clientY - rect.top) / uiZoom - view.offsetY) / view.scale;

    const block = blocks.find(b => b.id === id);
    if (block) {
      setIsResizing(true);
      setResizeHandle(handle);
      if (diagramMode === 'ibd' && block.id === currentLayerId) {
        setResizeStart({ id: block.id, x: block.ibdX ?? 50, y: block.ibdY ?? 50, w: block.ibdWidth ?? 1200, h: block.ibdHeight ?? 800, mx: worldX, my: worldY, type: 'ibdContext' });
      } else {
        setResizeStart({ id: block.id, x: block.x, y: block.y, w: block.width, h: block.height, mx: worldX, my: worldY, type: 'block' });
      }
      addToHistory();
      return;
    }

    const part = parts.find(p => p.id === id);
    if (part) {
      setIsResizing(true);
      setResizeHandle(handle);
      setResizeStart({ id: part.id, x: part.x, y: part.y, w: part.width, h: part.height, mx: worldX, my: worldY, type: 'part' });
      addToHistory();
      return;
    }

    const state = states.find(s => s.id === id);
    if (state) {
      setIsResizing(true);
      setResizeHandle(handle);
      setResizeStart({ id: state.id, x: state.x, y: state.y, w: state.width, h: state.height, mx: worldX, my: worldY, type: 'state' });
      addToHistory();
    }
  }, [blocks, states, parts, view, addToHistory, uiZoom, diagramMode, currentLayerId]);

  // CANVAS NAVIGATION (CATIA-style)
  const handleMouseDown = useCallback((e: MouseEvent<HTMLDivElement>) => {
    if (e.button === 1) {
      midDown.current = true;
      if (rightDown.current) {
        setIsPanning(true);
        lastMousePos.current = { x: e.clientX, y: e.clientY };
      }
      e.preventDefault();
      return;
    }

    if (e.button === 2) {
      rightDown.current = true;
      if (midDown.current) {
        setIsPanning(true);
        lastMousePos.current = { x: e.clientX, y: e.clientY };
      }
      e.preventDefault();
      return;
    }

    if (e.button === 0 && isSpacePressed.current) {
      setIsPanning(true);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      e.preventDefault();
      return;
    }

    if (e.button === 0 && e.target === canvasRef.current) {
      if (isCreatingTransition) {
        setIsCreatingTransition(false);
        setTransitionSourceId(null);
      }
      if (isCreatingConnector) {
        setIsCreatingConnector(false);
        setConnectorSource(null);
      }
      setSelectedIds([]);
    }
  }, [isCreatingTransition, isCreatingConnector, setIsCreatingTransition, setTransitionSourceId, setIsCreatingConnector, setConnectorSource, setSelectedIds, canvasRef, isSpacePressed, setIsPanning, rightDown, midDown, lastMousePos]);

  const handleMouseMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const worldX = ((e.clientX - rect.left) / uiZoom - view.offsetX) / view.scale;
    const worldY = ((e.clientY - rect.top) / uiZoom - view.offsetY) / view.scale;
    setMousePos({ x: worldX, y: worldY });

    if (isPanning) {
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      setView(prev => ({
        ...prev,
        offsetX: prev.offsetX + dx,
        offsetY: prev.offsetY + dy
      }));
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      e.preventDefault();
      return;
    }

    if (isResizing && resizeStart && resizeHandle) {
      const dx = worldX - resizeStart.mx;
      const dy = worldY - resizeStart.my;

      let newX = resizeStart.x;
      let newY = resizeStart.y;
      let newW = resizeStart.w;
      let newH = resizeStart.h;

      if (resizeStart.type === 'state') {
        if (resizeHandle.includes('e')) newW = Math.max(100, resizeStart.w + dx);
        if (resizeHandle.includes('s')) newH = Math.max(60, resizeStart.h + dy);
        if (resizeHandle.includes('w')) {
          const delta = Math.min(resizeStart.w - 100, dx);
          newX = resizeStart.x + delta;
          newW = resizeStart.w - delta;
        }
        if (resizeHandle.includes('n')) {
          const delta = Math.min(resizeStart.h - 60, dy);
          newY = resizeStart.y + delta;
          newH = resizeStart.h - delta;
        }
      } else {
        if (resizeHandle.includes('e')) newW = Math.max(50, resizeStart.w + dx);
        if (resizeHandle.includes('s')) newH = Math.max(50, resizeStart.h + dy);
        if (resizeHandle.includes('w')) {
          const delta = Math.min(resizeStart.w - 50, dx);
          newX = resizeStart.x + delta;
          newW = resizeStart.w - delta;
        }
        if (resizeHandle.includes('n')) {
          const delta = Math.min(resizeStart.h - 50, dy);
          newY = resizeStart.y + delta;
          newH = resizeStart.h - delta;
        }
      }

      if (snapEnabled) {
        if (resizeHandle.includes('w')) newX = snapToGrid(newX, GRID_SIZE);
        if (resizeHandle.includes('n')) newY = snapToGrid(newY, GRID_SIZE);
        newW = snapToGrid(newW, GRID_SIZE);
        newH = snapToGrid(newH, GRID_SIZE);
      }

      if (resizeStart.type === 'state') {
        updateState(resizeStart.id, { x: newX, y: newY, width: newW, height: newH });
      } else if (resizeStart.type === 'ibdContext') {
        updateBlock(resizeStart.id, { ibdX: newX, ibdY: newY, ibdWidth: newW, ibdHeight: newH });
      } else if (resizeStart.type === 'part') {
        updatePart(resizeStart.id, { x: newX, y: newY, width: newW, height: newH });
      } else {
        updateBlock(resizeStart.id, { x: newX, y: newY, width: newW, height: newH });
      }
      return;
    }

    if (isDragging && draggedPort) {
      const { elementId, portId } = draggedPort;
      // Find element (Part or Block)
      let element: { x: number, y: number, width: number, height: number, typeId?: string | null } | undefined = parts.find(p => p.id === elementId);
      let isContext = false;
      if (!element) {
        element = blocks.find(b => b.id === elementId);
        isContext = true;
      }
      const part = parts.find(p => p.id === elementId);
      const block = blocks.find(b => b.id === elementId);

      if (element) {
        let elX = element.x, elY = element.y, elW = element.width, elH = element.height;
        if (isContext && diagramMode === 'ibd') {
          elX = block!.ibdX ?? 50;
          elY = block!.ibdY ?? 50;
          elW = block!.ibdWidth ?? 1200;
          elH = block!.ibdHeight ?? 800;
        }

        const relX = worldX - elX;
        const relY = worldY - elY;

        const distTop = Math.abs(relY);
        const distBottom = Math.abs(relY - elH);
        const distLeft = Math.abs(relX);
        const distRight = Math.abs(relX - elW);

        const minDist = Math.min(distTop, distBottom, distLeft, distRight);

        let side: 'top' | 'bottom' | 'left' | 'right' = 'top';
        let offset = 0.5;

        if (minDist === distTop) { side = 'top'; offset = Math.max(0, Math.min(1, relX / elW)); }
        else if (minDist === distBottom) { side = 'bottom'; offset = Math.max(0, Math.min(1, relX / elW)); }
        else if (minDist === distLeft) { side = 'left'; offset = Math.max(0, Math.min(1, relY / elH)); }
        else { side = 'right'; offset = Math.max(0, Math.min(1, relY / elH)); }

        if (isContext && block) {
          // Update Block definition (Context)
          setBlocks(prev => prev.map(b => b.id === elementId ? {
            ...b, ports: b.ports.map(p => p.id === portId ? { ...p, side, offset } : p)
          } : b));
        } else if (part) {
          // Update Part instance only
          setParts(prev => prev.map(p => p.id === elementId ? {
            ...p, portLayouts: { ...(p.portLayouts || {}), [portId]: { side, offset } }
          } : p));
        }
      }
      return;
    }

    if (isDragging) {
      // Calculate delta
      const dx = worldX - dragOffset.x;
      const dy = worldY - dragOffset.y;

      const idsToMove = new Set(selectedIds);
      selectedIds.forEach(id => {
        const state = states.find(s => s.id === id);
        if (state) {
          const childLayer = layers.find(l => l.parentStateId === id);
          if (childLayer) {
            childLayer.stateIds.forEach(childId => idsToMove.add(childId));
            childLayer.junctionIds.forEach(childId => idsToMove.add(childId));
          }
          currentJunctions.forEach(j => {
            if (j.x >= state.x && j.x <= state.x + state.width &&
              j.y >= state.y && j.y <= state.y + state.height &&
              !idsToMove.has(j.id)) {
              idsToMove.add(j.id);
            }
          });
        }
      });

      // Move all selected items
      idsToMove.forEach(id => {
        const state = states.find(s => s.id === id);
        if (state) {
          const newX = state.x + dx;
          const newY = state.y + dy;
          const snappedX = snapEnabled ? snapToGrid(newX, GRID_SIZE) : newX;
          const snappedY = snapEnabled ? snapToGrid(newY, GRID_SIZE) : newY;


          updateState(id, { x: snappedX, y: snappedY });

          // Move child junctions
          junctions.forEach(j => {
            if (j.parentId === id && !idsToMove.has(j.id)) { // Ensure child junctions are not already selected
              updateJunction(j.id, { x: j.x + dx, y: j.y + dy });
            }
          });
        }
        const junction = junctions.find(j => j.id === id);
        if (junction) {
          const newX = junction.x + dx;
          const newY = junction.y + dy;

          let finalX = snapEnabled ? snapToGrid(newX, GRID_SIZE) : newX;
          let finalY = snapEnabled ? snapToGrid(newY, GRID_SIZE) : newY;

          const parentState = states.find(s => s.id === junction.parentId);
          if (parentState) {
            // junction radius is 8, rect size is 16x16
            finalX = Math.max(parentState.x, Math.min(finalX, parentState.x + parentState.width - 16));
            finalY = Math.max(parentState.y, Math.min(finalY, parentState.y + parentState.height - 16));
          }

          updateJunction(id, { x: finalX, y: finalY });
        }

        // BDD Blocks
        const block = blocks.find(b => b.id === id);
        if (block) {
          if (diagramMode === 'ibd' && block.id === currentLayerId) {
            const oldX = block.ibdX ?? 50;
            const oldY = block.ibdY ?? 50;
            const newX = oldX + dx;
            const newY = oldY + dy;
            const snappedX = snapEnabled ? snapToGrid(newX, GRID_SIZE) : newX;
            const snappedY = snapEnabled ? snapToGrid(newY, GRID_SIZE) : newY;
            const actualDx = snappedX - oldX;
            const actualDy = snappedY - oldY;

            updateBlock(id, {
              ibdX: snappedX,
              ibdY: snappedY
            });

            // Make all parts in this context follow the context block boundary
            parts.forEach(p => {
              if (p.blockId === id && !idsToMove.has(p.id)) {
                updatePart(p.id, {
                  x: p.x + actualDx,
                  y: p.y + actualDy
                });
              }
            });
          } else {
            const newX = block.x + dx;
            const newY = block.y + dy;
            updateBlock(id, {
              x: snapEnabled ? snapToGrid(newX, GRID_SIZE) : newX,
              y: snapEnabled ? snapToGrid(newY, GRID_SIZE) : newY
            });
          }
        }

        // IBD Parts
        const part = parts.find(p => p.id === id);
        if (part) {
          const newX = part.x + dx;
          const newY = part.y + dy;

          // REQ-LAYOUT-003: Prevent Parts from being moved outside the Context Block diagram boundary
          let finalX = snapEnabled ? snapToGrid(newX, GRID_SIZE) : newX;
          let finalY = snapEnabled ? snapToGrid(newY, GRID_SIZE) : newY;

          if (diagramMode === 'ibd') {
            const contextBlock = blocks.find(b => b.id === currentLayerId);
            if (contextBlock) {
              const cx = contextBlock.ibdX ?? 50;
              const cy = contextBlock.ibdY ?? 50;
              const cw = contextBlock.ibdWidth ?? 1200;
              const ch = contextBlock.ibdHeight ?? 800;
              finalX = Math.max(cx, Math.min(finalX, cx + cw - part.width));
              finalY = Math.max(cy, Math.min(finalY, cy + ch - part.height));
            }
          }

          updatePart(id, {
            x: finalX,
            y: finalY
          });
        }
      });

      // Update drag offset to current position for next frame
      setDragOffset({ x: worldX, y: worldY });
    }
  }, [isPanning, isDragging, draggedPort, selectedIds, states, junctions, blocks, parts, dragOffset, view, snapEnabled, updateState, updateJunction, updateBlock, updatePart, diagramMode, currentLayerId, isResizing, resizeStart, resizeHandle, layers]);

  const handleMouseUp = useCallback((e: MouseEvent<HTMLDivElement>) => {
    if (e.button === 1) {
      midDown.current = false;
    }
    if (e.button === 2) {
      rightDown.current = false;
    }
    if (isResizing) {
      setIsResizing(false);
      setResizeHandle(null);
      setResizeStart(null);
    }
    if (isDragging) {
      setIsDragging(false);
      setDraggedPort(null);
    }
    if (isPanning) {
      setIsPanning(false);
    }
  }, [isDragging, isPanning, draggedPort, isResizing, selectedIds]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = (e.clientX - rect.left) / uiZoom;
    const mouseY = (e.clientY - rect.top) / uiZoom;

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, view.scale * zoomFactor));

    const zoomPointX = (mouseX - view.offsetX) / view.scale;
    const zoomPointY = (mouseY - view.offsetY) / view.scale;
    const newOffsetX = mouseX - zoomPointX * newScale;
    const newOffsetY = mouseY - zoomPointY * newScale;

    setView({
      scale: newScale,
      offsetX: newOffsetX,
      offsetY: newOffsetY
    });

    setShowZoomIndicator(true);
    setTimeout(() => setShowZoomIndicator(false), 500);
  }, [view, uiZoom]);

  const handleStateMouseDown = useCallback((e: MouseEvent<SVGGElement>, stateId: string) => {
    e.stopPropagation();
    if (isCreatingTransition) {
      if (transitionSourceId) {
        createTransition(transitionSourceId, stateId);
        setIsCreatingTransition(false);
        setTransitionSourceId(null);
      } else {
        setTransitionSourceId(stateId);
      }
      return;
    }

    const state = states.find(s => s.id === stateId);
    if (!state) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const worldX = ((e.clientX - rect.left) / uiZoom - view.offsetX) / view.scale;
    const worldY = ((e.clientY - rect.top) / uiZoom - view.offsetY) / view.scale;

    if (e.button === 2) {
      e.preventDefault();
      const stateToClone = states.find(s => s.id === stateId);
      if (!stateToClone) return;
      const newId = uuidv4();
      const newState = {
        ...stateToClone,
        id: newId,
        name: `${stateToClone.name}_copy`,
        x: stateToClone.x,
        y: stateToClone.y,
      };
      addToHistory();
      setStates(prev => [...prev, newState]);
      setLayers(prev => prev.map(l => l.id === currentLayerId ? {
        ...l,
        stateIds: [...l.stateIds, newId]
      } : l));
      setSelectedIds([newId]);
      setIsDragging(true);
      setDragOffset({ x: worldX, y: worldY });
      return;
    }

    if (e.ctrlKey) {
      setSelectedIds(prev => prev.includes(stateId) ? prev.filter(id => id !== stateId) : [...prev, stateId]);
    } else {
      if (!selectedIds.includes(stateId)) {
        setSelectedIds([stateId]);
      }
    }

    addToHistory(); // Save state before dragging
    setIsDragging(true);

    // For dragging, we track the mouse position relative to world
    setDragOffset({ x: worldX, y: worldY });
  }, [isCreatingTransition, transitionSourceId, states, view, createTransition, selectedIds, addToHistory, uiZoom, currentLayerId]);

  const handleJunctionMouseDown = useCallback((e: MouseEvent<SVGGElement>, junctionId: string) => {
    e.stopPropagation();
    if (isCreatingTransition) {
      if (transitionSourceId) {
        if (transitionSourceId !== junctionId) {
          createTransition(transitionSourceId, junctionId);
          setIsCreatingTransition(false);
          setTransitionSourceId(null);
        }
      } else {
        setTransitionSourceId(junctionId);
      }
      return;
    }

    const junction = junctions.find(j => j.id === junctionId);
    if (!junction) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const worldX = ((e.clientX - rect.left) / uiZoom - view.offsetX) / view.scale;
    const worldY = ((e.clientY - rect.top) / uiZoom - view.offsetY) / view.scale;

    if (e.button === 2) {
      e.preventDefault();
      const junctionToClone = junctions.find(j => j.id === junctionId);
      if (!junctionToClone) return;
      const newId = uuidv4();
      const newJunction = {
        ...junctionToClone,
        id: newId,
        name: junctionToClone.name ? `${junctionToClone.name}_copy` : `J${junctions.length + 1}`,
      };
      addToHistory();
      setJunctions(prev => [...prev, newJunction]);
      setLayers(prev => prev.map(l => l.id === currentLayerId ? {
        ...l,
        junctionIds: [...l.junctionIds, newId]
      } : l));
      setSelectedIds([newId]);
      setIsDragging(true);
      setDragOffset({ x: worldX, y: worldY });
      return;
    }

    if (e.ctrlKey) {
      setSelectedIds(prev => prev.includes(junctionId) ? prev.filter(id => id !== junctionId) : [...prev, junctionId]);
    } else {
      if (!selectedIds.includes(junctionId)) {
        setSelectedIds([junctionId]);
      }
    }

    addToHistory(); // Save state before dragging
    setIsDragging(true);
    setDragOffset({ x: worldX, y: worldY });
  }, [isCreatingTransition, transitionSourceId, junctions, view, createTransition, selectedIds, addToHistory, uiZoom, currentLayerId]);

  const handleBlockMouseDown = useCallback((e: MouseEvent<SVGGElement>, blockId: string) => {
    e.stopPropagation();
    if (isCreatingTransition) { // Reusing this flag for relationships
      if (transitionSourceId) {
        if (transitionSourceId !== blockId) {
          const source = blocks.find(b => b.id === transitionSourceId);
          const target = blocks.find(b => b.id === blockId);
          if (!source || !target) return;
          const legalKinds = getCanvasRelationshipKinds({ blocks, parts, relationships }, transitionSourceId, blockId, diagramMode === 'ibd' ? 'ibd' : diagramMode === 'requirements' ? 'requirements' : 'bdd');
          if (legalKinds.length === 0) {
            const reversedKinds = getCanvasRelationshipKinds({ blocks, parts, relationships }, blockId, transitionSourceId, diagramMode === 'ibd' ? 'ibd' : diagramMode === 'requirements' ? 'requirements' : 'bdd');
            if (reversedKinds.length > 0) {
              setRequirementConnectionPicker({ sourceId: blockId, targetId: transitionSourceId, reversedKinds });
            } else {
              showConnectionPolicyError({
                relationshipKind: 'relationship',
                source: classifyLegacyEndpoint(source),
                target: classifyLegacyEndpoint(target),
                diagnostic: {
                  code: 'NO_LEGAL_RELATIONSHIP',
                  message: `No available relationship can connect ${source.name} to ${target.name} on this diagram.`,
                  correctiveAction: 'Choose compatible endpoints or the appropriate diagram. Check existing links for duplicate or cyclic relationships.',
                },
              });
            }
          } else if (diagramMode === 'requirements' || !legalKinds.includes('association')) {
            setRequirementConnectionPicker({ sourceId: transitionSourceId, targetId: blockId });
          } else {
            createRelationship(transitionSourceId, blockId, 'association');
          }
          setIsCreatingTransition(false);
          setTransitionSourceId(null);
        }
      } else {
        setTransitionSourceId(blockId);
      }
      return;
    }
    if (isCreatingConnector) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const worldX = ((e.clientX - rect.left) / uiZoom - view.offsetX) / view.scale;
    const worldY = ((e.clientY - rect.top) / uiZoom - view.offsetY) / view.scale;

    if (e.button === 2) {
      e.preventDefault();
      const blockToClone = blocks.find(b => b.id === blockId);
      if (!blockToClone) return;
      const newId = uuidv4();
      const newBlock = {
        ...blockToClone,
        id: newId,
        name: `${blockToClone.name}_copy`,
        ports: blockToClone.ports.map(p => ({
          ...p,
          id: uuidv4()
        }))
      };
      addToHistory();
      setBlocks(prev => [...prev, newBlock]);
      setSelectedIds([newId]);
      setIsDragging(true);
      setDragOffset({ x: worldX, y: worldY });
      return;
    }

    if (e.ctrlKey) {
      setSelectedIds(prev => prev.includes(blockId) ? prev.filter(id => id !== blockId) : [...prev, blockId]);
    } else {
      if (!selectedIds.includes(blockId)) setSelectedIds([blockId]);
    }
    addToHistory();
    setIsDragging(true);
    setDragOffset({ x: worldX, y: worldY });
  }, [isCreatingTransition, transitionSourceId, createRelationship, view, selectedIds, addToHistory, isCreatingConnector, uiZoom, blocks, parts, relationships, diagramMode, showConnectionPolicyError]);

  const handlePartMouseDown = useCallback((e: MouseEvent<SVGGElement>, partId: string) => {
    e.stopPropagation();
    if (isCreatingConnector) return; // Handled by port click usually, but if clicking body do nothing or cancel?

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const worldX = ((e.clientX - rect.left) / uiZoom - view.offsetX) / view.scale;
    const worldY = ((e.clientY - rect.top) / uiZoom - view.offsetY) / view.scale;

    if (e.button === 2) {
      e.preventDefault();
      const partToClone = parts.find(p => p.id === partId);
      if (!partToClone) return;
      const newId = uuidv4();
      const newPart = {
        ...partToClone,
        id: newId,
        name: `${partToClone.name}_copy`
      };
      addToHistory();
      setParts(prev => [...prev, newPart]);
      setSelectedIds([newId]);
      setIsDragging(true);
      setDragOffset({ x: worldX, y: worldY });
      return;
    }

    if (e.ctrlKey) {
      setSelectedIds(prev => prev.includes(partId) ? prev.filter(id => id !== partId) : [...prev, partId]);
    } else {
      if (!selectedIds.includes(partId)) setSelectedIds([partId]);
    }
    addToHistory();
    setIsDragging(true);
    setDragOffset({ x: worldX, y: worldY });
  }, [isCreatingConnector, view, selectedIds, addToHistory, uiZoom, parts]);

  const handleStateDoubleClick = useCallback((e: MouseEvent<SVGGElement>, stateId: string) => {
    e.stopPropagation();
    const state = states.find(s => s.id === stateId);
    if (state?.isXBridges) {
      if (isRunning) pauseSimulation();
      setXBridgesStateId(stateId);
      return;
    }

    if (diagramMode === 'requirements') {
      enterRequirement(stateId);
    } else {
      enterLayer(stateId);
    }
  }, [enterLayer, diagramMode, states]);

  const handleTransitionClick = useCallback((e: MouseEvent<SVGPathElement>, transitionId: string) => {
    e.stopPropagation();
    if (e.ctrlKey) {
      setSelectedIds(prev => prev.includes(transitionId) ? prev.filter(id => id !== transitionId) : [...prev, transitionId]);
    } else {
      setSelectedIds([transitionId]);
    }
  }, []);

  const startTransitionDrag = useCallback((
    transitionId: string,
    e: MouseEvent<SVGElement>,
    mode: 'curve' | 'handle'
  ) => {
    e.stopPropagation();
    const transition = transitions.find(t => t.id === transitionId);
    if (!transition) return;

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const ctrlPressed = e.ctrlKey;
    let isDragging = false;

    // Calculate source and target points for curve mode
    const sourceState = states.find(s => s.id === transition.sourceId);
    const sourceJunction = junctions.find(j => j.id === transition.sourceId);
    const targetState = states.find(s => s.id === transition.targetId);
    const targetJunction = junctions.find(j => j.id === transition.targetId);

    let sp: Point = { x: 0, y: 0 };
    let tp: Point = { x: 0, y: 0 };

    if (sourceState && targetState) {
      if (sourceState.id === targetState.id) {
        sp = { x: sourceState.x + sourceState.width / 2 - 15, y: sourceState.y };
        tp = { x: sourceState.x + sourceState.width / 2 + 15, y: sourceState.y };
      } else {
        sp = getEdgePoint(sourceState, targetState);
        tp = getEdgePoint(targetState, sourceState);
      }
    } else if (sourceState && targetJunction) {
      sp = getEdgePoint(sourceState, { x: targetJunction.x - 8, y: targetJunction.y - 8, width: 16, height: 16 });
      tp = getJunctionEdgePoint(targetJunction, { x: sourceState.x, y: sourceState.y });
    } else if (sourceJunction && targetState) {
      sp = getJunctionEdgePoint(sourceJunction, { x: targetState.x, y: targetState.y });
      tp = getEdgePoint(targetState, { x: sourceJunction.x - 8, y: sourceJunction.y - 8, width: 16, height: 16 });
    } else if (sourceJunction && targetJunction) {
      sp = getJunctionEdgePoint(sourceJunction, targetJunction);
      tp = getJunctionEdgePoint(targetJunction, sourceJunction);
    }

    const handleMouseMove = (moveEvent: any) => {
      const dx = moveEvent.clientX - startClientX;
      const dy = moveEvent.clientY - startClientY;

      if (!isDragging) {
        if (mode === 'handle' || isDragThresholdExceeded(dx, dy, 3)) {
          isDragging = true;
          setSelectedIds(prev => prev.includes(transitionId) ? prev : [transitionId]);
        } else {
          return;
        }
      }

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const cursorWorld = screenToWorld(moveEvent.clientX, moveEvent.clientY, rect, view, uiZoom);

      let newControlPoint: Point;
      if (mode === 'handle') {
        newControlPoint = cursorWorld;
      } else {
        newControlPoint = calculateControlPointFromMidpoint(sp, tp, cursorWorld);
      }

      updateTransition(transitionId, {
        controlPoint: newControlPoint,
        hasControlPoint: true
      });
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      if (isDragging) {
        addToHistory();
      } else if (mode === 'curve') {
        if (ctrlPressed) {
          setSelectedIds(prev => prev.includes(transitionId) ? prev.filter(id => id !== transitionId) : [...prev, transitionId]);
        } else {
          setSelectedIds([transitionId]);
        }
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [transitions, states, junctions, view, updateTransition, uiZoom, addToHistory]);

  const resetTransitionCurve = useCallback((transitionId: string) => {
    updateTransition(transitionId, {
      controlPoint: undefined,
      hasControlPoint: false
    });
    addToHistory();
    addError('info', 'Reset transition curve');
  }, [updateTransition, addToHistory, addError]);



  const handleProjectFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        let raw = (event.target?.result as string) || '';
        if (raw.charCodeAt(0) === 0xFEFF) {
          raw = raw.slice(1);
        }
        const text = raw.trim();
        if (!text) {
          setImportValidationError({
            isValid: false,
            errorTitle: 'Empty File',
            errors: ['The selected project file is empty (0 bytes).']
          });
          return;
        }
        const importedData = JSON.parse(text);
        const validation = validateImportedJson(importedData);
        if (!validation.isValid) {
          setImportValidationError(validation);
          return;
        }
        const dataToHydrate = validation.sanitizedData || importedData;
        const estEntities = (dataToHydrate.blocks?.length || 0) +
                            (dataToHydrate.parts?.length || 0) +
                            (dataToHydrate.connectors?.length || 0) +
                            (dataToHydrate.relationships?.length || 0) +
                            (dataToHydrate.definitions?.length || 0);
        const limits = loadStoredPerformanceLimits();
        if (estEntities >= limits.largeModelWarningThreshold) {
          const enablePerf = window.confirm?.(
            `This project contains ${estEntities.toLocaleString()} entities. Would you like to enable Performance Mode (spatial culling & simplified rendering) for faster editing?`
          );
          if (enablePerf) {
            saveStoredPerformanceLimits({ ...limits, forcePerformanceMode: true });
          }
        }
        hydrateProject(dataToHydrate);
        addError('info', `Imported project: ${file.name}`);
      } catch (error) {
        setImportValidationError({
          isValid: false,
          errorTitle: 'JSON Syntax Error',
          errors: [`Failed to parse project file JSON: ${error instanceof Error ? error.message : 'Invalid JSON format'}`]
        });
      }
    };
    reader.readAsText(file);
    if (projectImportRef.current) projectImportRef.current.value = '';
  }, [hydrateProject, addError]);

  const handleImportProject = useCallback(async () => {
    await handleOpenProjectDialog();
  }, [handleOpenProjectDialog]);

  const handleGenerateReport = useCallback((projectName: string = 'My Project', author: string = 'Engineer') => {
    const sysmlGate = evaluateSysmlOperationGate(canonicalSysmlRepository, 'report');
    if (!sysmlGate.allowed) {
      sysmlGate.diagnostics.filter(item => item.severity === 'error').forEach(item => addError('error', `${item.code}: ${item.message}`, 'SysML'));
      return;
    }
    const limits = loadStoredPerformanceLimits();
    const totalEntities = blocks.length + parts.length + connectors.length + relationships.length;
    if (totalEntities >= limits.largeModelWarningThreshold) {
      const ok = window.confirm?.(
        `This model contains ${totalEntities.toLocaleString()} entities. Generating a global report with diagrams may take several seconds. Proceed?`
      );
      if (!ok) return;
    }
    const canonicalReportView = projectLegacyDiagram(canonicalSysmlRepository);
    const snapshot = createReportSnapshot({
      blocks: canonicalReportView.blocks,
      relationships: canonicalReportView.relationships,
      parts: canonicalReportView.parts,
      connectors: canonicalReportView.connectors,
      states,
      layers,
      transitions,
      junctions,
    });
    const hierarchySource = toHierarchySource(snapshot);
    const traceabilitySnapshot = buildCanonicalTraceabilitySnapshot(canonicalSysmlRepository);
    const traceabilityMatrix = buildTraceabilityMatrix(
      canonicalSysmlRepository,
      {},
      traceabilitySnapshot.index,
    );
    const traceabilityMetrics = computeCoverageMetrics(traceabilityMatrix);

    const style = `
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #fff; color: #333; padding: 40px; line-height: 1.6; max-width: 900px; margin: 0 auto; }
        h1 { color: #f97316; border-bottom: 2px solid #f97316; padding-bottom: 10px; margin-bottom: 20px; }
        h2 { color: #222; border-bottom: 1px solid #eee; margin-top: 40px; padding-bottom: 5px; page-break-after: avoid; }
        h3 { color: #444; margin-top: 25px; font-size: 1.1em; page-break-after: avoid; }
        .meta { color: #666; font-size: 0.9em; margin-bottom: 40px; }
        .tree { margin-left: 20px; border-left: 1px solid #ddd; padding-left: 15px; }
        .item { margin-bottom: 15px; }
        .item-header { font-weight: bold; color: #000; }
        .props { font-size: 0.9em; color: #555; margin-left: 10px; }
        .tag { background: #eee; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; }
        .diagram-container { margin: 16px 0; }
        .diagram-cell { break-inside: avoid; page-break-inside: avoid; margin-bottom: 16px; }
        .diagram-card { margin: 20px 0; border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff; box-shadow: 0 2px 8px rgba(0,0,0,0.04); overflow: hidden; page-break-inside: avoid; }
        .diagram-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-size: 12px; font-weight: 600; color: #334155; }
        .diagram-link-btn { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; background: #fff; color: #ea580c; border: 1px solid #fed7aa; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; text-decoration: none; transition: all 0.15s ease; }
        .diagram-link-btn:hover { background: #ea580c; color: #ffffff; border-color: #ea580c; box-shadow: 0 2px 6px rgba(234, 88, 12, 0.25); }
        .diagram-preview-body { padding: 16px; display: flex; justify-content: center; align-items: center; cursor: zoom-in; background: #fafafa; overflow-x: auto; transition: background 0.15s ease; }
        .diagram-preview-body:hover { background: #f1f5f9; }
        .diagram-hint { text-align: center; padding: 6px; font-size: 11px; color: #94a3b8; border-top: 1px dashed #e2e8f0; background: #ffffff; }
        #diagram-modal { display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(4px); z-index: 999999; flex-direction: column; }
        #diagram-modal.active { display: flex; }
        #diagram-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 24px; background: #0f172a; border-bottom: 1px solid #334155; color: #f8fafc; }
        #diagram-modal-body { flex: 1; overflow: auto; display: flex; justify-content: center; align-items: center; padding: 24px; background: #1e293b; cursor: grab; }
        #diagram-modal-body:active { cursor: grabbing; }
        .modal-ctrl-btn { background: #334155; color: #f8fafc; border: 1px solid #475569; border-radius: 4px; padding: 6px 12px; font-size: 12px; font-weight: bold; cursor: pointer; margin-left: 8px; transition: all 0.15s; }
        .modal-ctrl-btn:hover { background: #ea580c; border-color: #ea580c; }
        svg { max-width: 100%; height: auto; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 15px; font-size: 0.9em; }
        th, td { padding: 10px; border: 1px solid #ddd; text-align: left; }
        th { background-color: #f5f5f5; color: #333; }
        .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: bold; }
        .badge-critical { background-color: #fee2e2; color: #991b1b; }
        .badge-warning { background-color: #fef3c7; color: #92400e; }
        .badge-info { background-color: #e0f2fe; color: #075985; }
        @media print {
          .diagram-link-btn, .diagram-hint, #diagram-modal { display: none !important; }
          .diagram-cell { page-break-inside: avoid; }
          .diagram-card { border: 1px solid #ddd; box-shadow: none; }
          svg { max-width: 100% !important; height: auto !important; }
        }
    `;

    let html = `<html><head><title>${escapeHtml(projectName)} Report</title><style>${style}</style></head><body>`;
    html += `<h1>${escapeHtml(projectName)}</h1>`;
    html += `<div class="meta"><strong>Author:</strong> ${escapeHtml(author)} &bull; <strong>Date:</strong> ${escapeHtml(new Date().toLocaleString())} &bull; <strong>Engine:</strong> ${escapeHtml(VERSION)}</div>`;

    if (snapshot.diagnostics) {
      const removedRelCount = snapshot.diagnostics.removedRelationshipIds?.length || 0;
      const removedConnCount = snapshot.diagnostics.removedConnectorIds?.length || 0;
      const totalRemoved = removedRelCount + removedConnCount;
      const errorCount = snapshot.diagnostics.errors?.length || 0;

      html += `<div class="consistency-summary" style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1e3a8a; padding: 12px 16px; border-radius: 6px; margin-bottom: 24px; font-size: 0.9em;">
        <strong>Model Consistency Summary:</strong> revision: ${escapeHtml(snapshot.revision)} &bull; removed connections: ${totalRemoved} (relationships: ${removedRelCount}, connectors: ${removedConnCount}) &bull; errors: ${errorCount}
      </div>`;
    }

    html += `<h2>Traceability Matrix</h2>`;
    html += `<div class="consistency-summary"><strong>Canonical revision:</strong> ${escapeHtml(String(traceabilitySnapshot.repositoryRevision))} &bull; <strong>Model hash:</strong> ${escapeHtml(traceabilitySnapshot.modelHash)} &bull; <strong>Coverage:</strong> ${traceabilityMetrics.coveragePercent.toFixed(1)}% &bull; <strong>Verification:</strong> ${traceabilityMetrics.verificationPercent.toFixed(1)}%</div>`;
    html += `<table><tr><th>Requirement</th><th>Status</th><th>Change</th><th>Owner / Risk</th><th>Covering Elements</th><th>Verification / Evidence</th><th>Unresolved</th></tr>`;
    for (const row of traceabilityMatrix.rows) {
      const links = [...row.coveringBlocks.map(item => item.name), ...row.blocks, ...row.parts].join('; ');
      html += `<tr><td>${escapeHtml(row.requirement.requirementId)} · ${escapeHtml(row.requirement.name)}</td><td>${escapeHtml(row.status)}</td><td>${escapeHtml(row.changeKind ?? 'unchanged')}</td><td>${escapeHtml(`${row.requirement.owner ?? 'Unassigned'} / ${row.requirement.risk ?? 'unspecified'}`)}</td><td>${escapeHtml(links || 'None')}</td><td>${escapeHtml(`${row.verificationCases.length} cases / ${row.evidence.length} evidence`)}</td><td>${escapeHtml(row.unresolvedEndpointIds.join('; ') || 'None')}</td></tr>`;
    }
    html += `</table>`;
    if (traceabilitySnapshot.diagnostics.length > 0) {
      html += `<h3>Traceability Diagnostics</h3><ul>${traceabilitySnapshot.diagnostics.map(item => `<li>${escapeHtml(item.code)}: ${escapeHtml(item.message)}</li>`).join('')}</ul>`;
    }

    // ═══════════════════════════════════════════════════════════════════
    // AUTO-LAYOUT ENGINE FOR REPORT DIAGRAMS
    // Repositions nodes into readable arrangements for report output
    // without modifying the user's actual canvas positions.
    // ═══════════════════════════════════════════════════════════════════
    const autoLayoutForReport = (
      nodes: any[],
      edges: any[],
      type: 'req' | 'bdd' | 'ibd' | 'statemachine' | 'xbridges'
    ): any[] => {
      if (nodes.length <= 1) return nodes;

      const NODE_GAP_X = 60;
      const NODE_GAP_Y = 80;
      const MAX_ROW_WIDTH = 780; // A4 target width

      // Build adjacency for hierarchical layout
      const buildAdjacency = () => {
        const children = new Map<string, string[]>();
        const parents = new Set<string>();
        const nodeIds = new Set(nodes.map(n => n.id));

        edges.forEach((e: any) => {
          let srcId = e.sourceId || e.sourcePartId;
          let tgtId = e.targetId || e.targetPartId;

          if (type === 'bdd' && e.type === 'generalization') {
            const temp = srcId;
            srcId = tgtId;
            tgtId = temp;
          }

          if (!nodeIds.has(srcId) || !nodeIds.has(tgtId)) return;
          if (srcId === tgtId) return;

          if (!children.has(srcId)) children.set(srcId, []);
          children.get(srcId)!.push(tgtId);
          parents.add(tgtId);
        });

        // Find root nodes (nodes with no incoming edges)
        const roots = nodes.filter(n => !parents.has(n.id));
        if (roots.length === 0) return { children, roots: [nodes[0]] }; // fallback
        return { children, roots };
      };

      if (type === 'statemachine') {
        // ── Hierarchical / layered layout (top-to-bottom) ──
        // BFS from start states to assign layers
        const { children, roots } = buildAdjacency();

        // Prioritize autostart states as roots
        const autostartRoots = roots.filter(n => n.autostart || n.nodeType === 'parentState');
        const effectiveRoots = autostartRoots.length > 0 ? autostartRoots : roots;

        const layerMap = new Map<string, number>();
        const queue: { id: string, layer: number }[] = effectiveRoots.map(r => ({ id: r.id, layer: 0 }));
        const visited = new Set<string>();

        while (queue.length > 0) {
          const { id, layer } = queue.shift()!;
          if (visited.has(id)) continue;
          visited.add(id);
          layerMap.set(id, Math.max(layerMap.get(id) || 0, layer));

          const kids = children.get(id) || [];
          kids.forEach(kid => {
            if (!visited.has(kid)) {
              queue.push({ id: kid, layer: layer + 1 });
            }
          });
        }

        // Place unvisited nodes into next layer
        nodes.forEach(n => {
          if (!layerMap.has(n.id)) {
            layerMap.set(n.id, (Math.max(...Array.from(layerMap.values()), 0)) + 1);
          }
        });

        // Group nodes by layer
        const layerGroups = new Map<number, any[]>();
        nodes.forEach(n => {
          const layer = layerMap.get(n.id) || 0;
          if (!layerGroups.has(layer)) layerGroups.set(layer, []);
          layerGroups.get(layer)!.push(n);
        });

        const sortedLayers = Array.from(layerGroups.keys()).sort((a, b) => a - b);
        let currentY = 0;

        sortedLayers.forEach(layerIdx => {
          const layerNodes = layerGroups.get(layerIdx)!;
          let currentX = 0;
          const maxH = Math.max(...layerNodes.map(n => n.height || 80));

          // Center the row
          const totalWidth = layerNodes.reduce((sum, n) => sum + (n.width || 160) + NODE_GAP_X, -NODE_GAP_X);
          const startX = Math.max(0, (MAX_ROW_WIDTH - totalWidth) / 2);
          currentX = startX;

          layerNodes.forEach(n => {
            const w = n.width || 160;
            n.displayX = currentX;
            n.displayY = currentY;
            currentX += w + NODE_GAP_X;
          });

          currentY += maxH + NODE_GAP_Y;
        });

      } else if (type === 'bdd' || type === 'req') {
        // ── Hierarchical Layered Tree Layout for BDD / Requirements ──
        const { children, roots } = buildAdjacency();

        // Assign levels via BFS
        const levelMap = new Map<string, number>();
        const bfsQueue: { id: string, level: number }[] = roots.map(r => ({ id: r.id, level: 0 }));
        const bfsVisited = new Set<string>();

        while (bfsQueue.length > 0) {
          const { id, level } = bfsQueue.shift()!;
          if (bfsVisited.has(id)) continue;
          bfsVisited.add(id);
          levelMap.set(id, level);

          const kids = children.get(id) || [];
          kids.forEach(kid => {
            if (!bfsVisited.has(kid)) {
              bfsQueue.push({ id: kid, level: level + 1 });
            }
          });
        }

        // Place unvisited nodes at the next single level
        const maxLevel = Math.max(...Array.from(levelMap.values()), -1);
        nodes.forEach(n => {
          if (!levelMap.has(n.id)) {
            levelMap.set(n.id, maxLevel + 1);
          }
        });

        // Group by level
        const levelGroups = new Map<number, any[]>();
        nodes.forEach(n => {
          const level = levelMap.get(n.id) || 0;
          if (!levelGroups.has(level)) levelGroups.set(level, []);
          levelGroups.get(level)!.push(n);
        });

        const sortedLevels = Array.from(levelGroups.keys()).sort((a, b) => a - b);
        let curY = 0;

        // Order nodes within level using parent position to minimize crossings
        const nodeXPos = new Map<string, number>();

        sortedLevels.forEach(level => {
          const levelNodes = levelGroups.get(level)!;

          if (level > 0) {
            // Sort by average parent X position
            levelNodes.sort((a, b) => {
              const parentsA = edges.filter((e: any) => (e.targetId || e.targetPartId) === a.id).map((e: any) => nodeXPos.get(e.sourceId || e.sourcePartId) ?? 0);
              const parentsB = edges.filter((e: any) => (e.targetId || e.targetPartId) === b.id).map((e: any) => nodeXPos.get(e.sourceId || e.sourcePartId) ?? 0);
              const avgA = parentsA.length ? parentsA.reduce((s, v) => s + v, 0) / parentsA.length : 0;
              const avgB = parentsB.length ? parentsB.reduce((s, v) => s + v, 0) / parentsB.length : 0;
              return avgA - avgB;
            });
          }

          const nodeW = type === 'req' ? 160 : 140;
          const totalWidth = levelNodes.reduce((sum, n) => sum + (n.width || nodeW) + NODE_GAP_X, -NODE_GAP_X);
          const startX = Math.max(0, (MAX_ROW_WIDTH - totalWidth) / 2);
          let curX = startX;
          const maxH = Math.max(...levelNodes.map(n => n.height || 80));

          levelNodes.forEach(n => {
            n.displayX = curX;
            n.displayY = curY;
            nodeXPos.set(n.id, curX + (n.width || nodeW) / 2);
            curX += (n.width || nodeW) + NODE_GAP_X;
          });

          curY += maxH + NODE_GAP_Y + 24;
        });

      } else if (type === 'ibd') {
        // ── Grid layout for IBD parts ──
        const nodeW = 180;
        const nodeH = 100;
        const cols = Math.max(2, Math.floor(MAX_ROW_WIDTH / (nodeW + NODE_GAP_X)));

        nodes.forEach((n, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          n.displayX = col * (nodeW + NODE_GAP_X);
          n.displayY = row * (nodeH + NODE_GAP_Y);
          if (!n.width || n.width < 100) n.width = nodeW;
          if (!n.height || n.height < 60) n.height = nodeH;
        });

      } else {
        // ── Fallback: grid layout ──
        const cols = Math.max(2, Math.floor(MAX_ROW_WIDTH / 200));
        nodes.forEach((n, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          n.displayX = col * 200;
          n.displayY = row * 150;
        });
      }

      return nodes;
    };

    const reportHierarchy = buildReportHierarchy(hierarchySource);

    // Helper to generate SVG for report
    const renderDiagramSVG = (nodes: any[], edges: any[], type: 'req' | 'bdd' | 'ibd' | 'statemachine' | 'xbridges', contextId?: string) => {
      if (nodes.length === 0) return '';

      // Deep-copy edges to avoid mutating actual state data
      const edgesCopy = edges.map((e: any) => ({ ...e }));

      // Prepare Nodes: Use fixed size for BDD blocks to match App, use instance size for IBD/Req
      const displayNodes = nodes.map(n => {
        const isBdd = type === 'bdd';
        const isReq = type === 'req';
        const width = isBdd ? (n.width || 140) : isReq ? (n.width || 160) : n.width;
        const height = isBdd ? (n.height || 70) : isReq ? (n.height || 80) : n.height;
        return { ...n, width, height, displayX: n.x || 0, displayY: n.y || 0 };
      });

      const displayNodesMap = new Map<string, any>();
      displayNodes.forEach(n => displayNodesMap.set(n.id, n));

      // Ensure all edge sources and targets are in displayNodes for statemachine
      if (type === 'statemachine') {
        edgesCopy.forEach((e: any) => {
          [e.sourceId, e.targetId].forEach(id => {
            if (!displayNodesMap.has(id)) {
              const globalState = states.find(s => s.id === id);
              const globalJunc = junctions.find(j => j.id === id);
              if (globalState) {
                const node = { ...globalState, nodeType: 'externalState', width: globalState.width, height: globalState.height, displayX: globalState.x, displayY: globalState.y };
                displayNodes.push(node);
                displayNodesMap.set(id, node);
              } else if (globalJunc) {
                const node = { ...globalJunc, nodeType: 'junction', width: 20, height: 20, displayX: globalJunc.x - 10, displayY: globalJunc.y - 10 };
                displayNodes.push(node);
                displayNodesMap.set(id, node);
              }
            }
          });
        });
      }

      // ── AUTO-LAYOUT: reposition nodes for report readability ──
      autoLayoutForReport(displayNodes, edgesCopy, type);

      // Rebuild the map after layout (positions changed)
      displayNodes.forEach(n => displayNodesMap.set(n.id, n));

      // Clear any user-defined control points (they won't match new positions)
      if (type === 'statemachine') {
        edgesCopy.forEach((e: any) => {
          e.controlPoint = undefined;
          e.hasControlPoint = false;
        });
      }

      // Calculate bounds from new layout
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      displayNodes.forEach(n => {
        minX = Math.min(minX, n.displayX);
        minY = Math.min(minY, n.displayY);
        maxX = Math.max(maxX, n.displayX + n.width);
        maxY = Math.max(maxY, n.displayY + n.height);
      });

      const contextBlock = contextId ? blocks.find(b => b.id === contextId) : null;
      const contextFrame = (type === 'ibd' && contextBlock) ? {
        x: contextBlock.ibdX ?? 50,
        y: contextBlock.ibdY ?? 50,
        w: contextBlock.ibdWidth ?? 1200,
        h: contextBlock.ibdHeight ?? 800
      } : (type === 'ibd' ? {
        x: minX - 80,
        y: minY - 80,
        w: maxX - minX + 160,
        h: maxY - minY + 160
      } : { x: minX, y: minY, w: maxX - minX, h: maxY - minY });

      // Update min/max X/Y based on the contextFrame
      if (type === 'ibd') {
        minX = contextFrame.x;
        minY = contextFrame.y;
        maxX = contextFrame.x + contextFrame.w;
        maxY = contextFrame.y + contextFrame.h;
      }

      const padding = 60;
      const rawWidth = Math.max(200, maxX - minX + padding * 2);
      const rawHeight = Math.max(150, maxY - minY + padding * 2);

      // Cap SVG display width for A4 readability
      const MAX_SVG_WIDTH = 780;
      const scaleFactor = rawWidth > MAX_SVG_WIDTH ? MAX_SVG_WIDTH / rawWidth : 1;
      const displayWidth = Math.min(rawWidth, MAX_SVG_WIDTH);
      const displayHeight = rawHeight * scaleFactor;

      const viewBox = `${minX - padding} ${minY - padding} ${rawWidth} ${rawHeight}`;

      const title = type === 'req' ? 'Requirements Traceability Diagram' :
                    type === 'bdd' ? 'Block Definition Diagram (BDD)' :
                    type === 'ibd' ? `Internal Block Diagram (IBD) · ${contextBlock?.name || 'System'}` :
                    type === 'statemachine' ? 'State Machine Architecture' : 'System Diagram';

      const diagId = `diag-${Math.random().toString(36).substring(2, 9)}`;

      // Render root SVG
      const rootSvg = renderSingleSVG(displayNodes, edgesCopy, type, viewBox, displayWidth, displayHeight, displayNodesMap, contextId, diagId);

      // Render child drill-down layers if any element inside has sub-layers
      let childLayersHtml = '';
      displayNodes.forEach(node => {
        if (reportHierarchy.hasChildLayer(node.id)) {
          const childInfo = reportHierarchy.getChildLayerInfo(node.id)!;
          if (childInfo.type === 'ibd') {
            const targetBlockId = node.typeId || node.id;
            const targetBlock = blocks.find(b => b.id === targetBlockId);
            const childParts = parts.filter(p => p.blockId === targetBlockId);
            const childConns = connectors.filter(c => {
              const s = parts.find(p => p.id === c.sourcePartId);
              const t = parts.find(p => p.id === c.targetPartId);
              return (s && s.blockId === targetBlockId) || (t && t.blockId === targetBlockId);
            });

            if (childParts.length > 0) {
              const childDisplayNodes = childParts.map(p => ({ ...p, displayX: p.x || 0, displayY: p.y || 0 }));
              const childEdgesCopy = childConns.map(c => ({ ...c }));
              autoLayoutForReport(childDisplayNodes, childEdgesCopy, 'ibd');

              let cMinX = Infinity, cMinY = Infinity, cMaxX = -Infinity, cMaxY = -Infinity;
              childDisplayNodes.forEach(n => {
                cMinX = Math.min(cMinX, n.displayX);
                cMinY = Math.min(cMinY, n.displayY);
                cMaxX = Math.max(cMaxX, n.displayX + n.width);
                cMaxY = Math.max(cMaxY, n.displayY + n.height);
              });
              const cPad = 60;
              const cRawW = Math.max(200, cMaxX - cMinX + cPad * 2 + 160);
              const cRawH = Math.max(150, cMaxY - cMinY + cPad * 2 + 160);
              const cScale = cRawW > MAX_SVG_WIDTH ? MAX_SVG_WIDTH / cRawW : 1;
              const cDispW = Math.min(cRawW, MAX_SVG_WIDTH);
              const cDispH = cRawH * cScale;
              const cViewBox = `${cMinX - cPad - 80} ${cMinY - cPad - 80} ${cRawW} ${cRawH}`;
              const cMap = new Map<string, any>();
              childDisplayNodes.forEach(n => cMap.set(n.id, n));

              const childSvg = renderSingleSVG(childDisplayNodes, childEdgesCopy, 'ibd', cViewBox, cDispW, cDispH, cMap, targetBlockId, diagId);
              childLayersHtml += `<div id="layer-${childInfo.layerId}" class="diagram-layer-view" style="display:none; width:100%;">${childSvg}</div>`;
            }
          } else if (childInfo.type === 'statemachine') {
            const childLayer = layers.find(l => l.parentStateId === node.id);
            if (childLayer) {
              const childStates = states.filter(s => childLayer.stateIds.includes(s.id));
              const childJuncs = junctions.filter(j => childLayer.junctionIds.includes(j.id));
              const childTrans = transitions.filter(t => childLayer.transitionIds.includes(t.id));

              const childNodes: any[] = [
                ...childStates.map(s => ({ ...s, nodeType: 'state' })),
                ...childJuncs.map(j => ({ ...j, nodeType: 'junction', width: 20, height: 20, x: j.x - 10, y: j.y - 10 }))
              ];
              const childDisplayNodes = childNodes.map(n => ({ ...n, displayX: n.x || 0, displayY: n.y || 0 }));
              const childEdgesCopy = childTrans.map(t => ({ ...t }));
              autoLayoutForReport(childDisplayNodes, childEdgesCopy, 'statemachine');

              let cMinX = Infinity, cMinY = Infinity, cMaxX = -Infinity, cMaxY = -Infinity;
              childDisplayNodes.forEach(n => {
                cMinX = Math.min(cMinX, n.displayX);
                cMinY = Math.min(cMinY, n.displayY);
                cMaxX = Math.max(cMaxX, n.displayX + n.width);
                cMaxY = Math.max(cMaxY, n.displayY + n.height);
              });
              const cPad = 60;
              const cRawW = Math.max(200, cMaxX - cMinX + cPad * 2);
              const cRawH = Math.max(150, cMaxY - cMinY + cPad * 2);
              const cScale = cRawW > MAX_SVG_WIDTH ? MAX_SVG_WIDTH / cRawW : 1;
              const cDispW = Math.min(cRawW, MAX_SVG_WIDTH);
              const cDispH = cRawH * cScale;
              const cViewBox = `${cMinX - cPad} ${cMinY - cPad} ${cRawW} ${cRawH}`;
              const cMap = new Map<string, any>();
              childDisplayNodes.forEach(n => cMap.set(n.id, n));

              const childSvg = renderSingleSVG(childDisplayNodes, childEdgesCopy, 'statemachine', cViewBox, cDispW, cDispH, cMap, undefined, diagId);
              childLayersHtml += `<div id="layer-${childInfo.layerId}" class="diagram-layer-view" style="display:none; width:100%;">${childSvg}</div>`;
            }
          }
        }
      });

      let svgResult = `<div class="diagram-card">`;
      svgResult += `<div class="diagram-header">`;
      svgResult += `<div id="bc-${diagId}" class="diagram-breadcrumbs"></div>`;
      svgResult += `<div class="diagram-controls">`;
      svgResult += `<button class="modal-ctrl-btn" onclick="window.ADIA_DIAGRAM_NAV.zoom('${diagId}', 1.25)">➕ Zoom In</button>`;
      svgResult += `<button class="modal-ctrl-btn" onclick="window.ADIA_DIAGRAM_NAV.zoom('${diagId}', 0.8)">➖ Zoom Out</button>`;
      svgResult += `<button class="modal-ctrl-btn" onclick="window.ADIA_DIAGRAM_NAV.resetZoom('${diagId}')">↺ Reset</button>`;
      svgResult += `<button class="diagram-link-btn" onclick="openDiagramModal('${diagId}', '${escapeHtml(title)}')">🔍 Fullscreen</button>`;
      svgResult += `</div>`;
      svgResult += `</div>`;
      svgResult += `<div id="${diagId}" class="diagram-preview-body">`;
      svgResult += `<div id="layer-root-${diagId}" class="diagram-layer-view" style="display:block; width:100%;">`;
      svgResult += rootSvg;
      svgResult += `</div>`;
      svgResult += childLayersHtml;
      svgResult += `</div>`;
      svgResult += `<div class="diagram-hint">💡 <b>Interactive Diagram:</b> Double-click any element marked with ⧉ to explore its nested architecture layer. Use breadcrumbs above to navigate back.</div>`;
      svgResult += `</div>`;
      svgResult += `<script>window.ADIA_DIAGRAM_NAV.initContainer('${diagId}', 'root-${diagId}', '${escapeHtml(title)}');</script>`;
      return svgResult;
    };

    // Single SVG rendering helper (used by renderDiagramSVG)
    const renderSingleSVG = (
      displayNodes: any[],
      edges: any[],
      type: string,
      viewBox: string,
      svgWidth: number,
      svgHeight: number,
      displayNodesMap: Map<string, any>,
      contextId?: string,
      diagId?: string
    ) => {
      const contextBlock = contextId ? blocksById.get(contextId) : null;

      // Calculate bounds for this page's nodes to render local context frame
      let minX_ = Infinity, minY_ = Infinity, maxX_ = -Infinity, maxY_ = -Infinity;
      displayNodes.forEach(n => {
        minX_ = Math.min(minX_, n.displayX);
        minY_ = Math.min(minY_, n.displayY);
        maxX_ = Math.max(maxX_, n.displayX + n.width);
        maxY_ = Math.max(maxY_, n.displayY + n.height);
      });
      const framePadding = type === 'ibd' ? 80 : 0;
      const contextFrame = {
        x: minX_ - framePadding,
        y: minY_ - framePadding,
        w: maxX_ - minX_ + framePadding * 2,
        h: maxY_ - minY_ + framePadding * 2
      };

      // Helper for Port Position
      const getPortPos = (nodeOrId: any, portId: string) => {
        const isString = typeof nodeOrId === 'string';
        const id = isString ? nodeOrId : nodeOrId?.id;

        if (type === 'ibd' && id === contextId) {
          const block = contextBlock;
          const port = block?.ports?.find((p: any) => p.id === portId);
          const side = port?.side || 'left';
          const offset = port?.offset ?? 0.5;

          let x = 0, y = 0;
          if (side === 'top') { x = contextFrame.x + contextFrame.w * offset; y = contextFrame.y; }
          else if (side === 'bottom') { x = contextFrame.x + contextFrame.w * offset; y = contextFrame.y + contextFrame.h; }
          else if (side === 'left') { x = contextFrame.x; y = contextFrame.y + contextFrame.h * offset; }
          else { x = contextFrame.x + contextFrame.w; y = contextFrame.y + contextFrame.h * offset; }
          return { x, y };
        }

        const node = isString ? displayNodes.find(n => n.id === id) : nodeOrId;
        if (!node) return { x: 0, y: 0 };

        let block = type === 'ibd' ? blocksById.get(node.typeId) : node;
        if (!block) return { x: node.displayX + (node.width || 120) / 2, y: node.displayY + (node.height || 80) / 2 };

        const port = block.ports?.find((p: any) => p.id === portId);
        const portIndex = block.ports?.findIndex((p: any) => p.id === portId) ?? 0;

        const layout = type === 'ibd' ? node.portLayouts?.[portId] : null;
        const side = layout?.side || port?.side;
        const offset = layout?.offset ?? port?.offset;

        let x = 0, y = 0;
        if (side && offset != null) {
          if (side === 'top') { x = node.displayX + node.width * offset; y = node.displayY; }
          else if (side === 'bottom') { x = node.displayX + node.width * offset; y = node.displayY + node.height; }
          else if (side === 'left') { x = node.displayX; y = node.displayY + node.height * offset; }
          else { x = node.displayX + node.width; y = node.displayY + node.height * offset; }
        } else {
          const isLeft = portIndex % 2 === 0;
          if (type === 'ibd') {
            x = node.displayX + (isLeft ? 0 : node.width);
            y = node.displayY + 20 + Math.floor(portIndex / 2) * 20 + 5;
          } else {
            x = node.displayX + (isLeft ? 0 : node.width);
            y = node.displayY + 60 + Math.floor(portIndex / 2) * 40;
          }
        }
        return { x, y };
      };

      const getBox = (n: any) => ({ x: n.displayX, y: n.displayY, width: n.width, height: n.height });
      const getCenter = (n: any) => ({ x: n.displayX + n.width / 2, y: n.displayY + n.height / 2 });

      let svg = `<svg width="${svgWidth}" height="${svgHeight}" viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 100%; height: auto;">`;

      // Defs for markers
      svg += `<defs>
          <marker id="m-arrow-${type}" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10" fill="none" stroke="#546e7a" stroke-width="1.2" /></marker>
          <marker id="m-arrow-filled-${type}" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="#333" stroke="#333" /></marker>
          <marker id="m-diamond-${type}" markerWidth="16" markerHeight="10" refX="1" refY="5" orient="auto"><path d="M1,5 L8,1 L15,5 L8,9 Z" fill="#fff" stroke="#333" stroke-width="1.2" /></marker>
          <marker id="m-diamond-fill-${type}" markerWidth="16" markerHeight="10" refX="1" refY="5" orient="auto"><path d="M1,5 L8,1 L15,5 L8,9 Z" fill="#333" stroke="#333" /></marker>
          <marker id="m-triangle-${type}" markerWidth="14" markerHeight="12" refX="13" refY="6" orient="auto"><path d="M1,1 L13,6 L1,11 Z" fill="#fff" stroke="#333" stroke-width="1.2" /></marker>
          <marker id="requirement-containment-crosshair" markerWidth="14" markerHeight="14" refX="7" refY="7" orient="auto"><circle cx="7" cy="7" r="5.5" fill="#ffffff" stroke="#333333" stroke-width="1.2" /><path d="M 7 1.5 L 7 12.5 M 1.5 7 L 12.5 7" stroke="#333333" stroke-width="1.2" stroke-linecap="round" /></marker>
          <marker id="m-containment-${type}" markerWidth="14" markerHeight="14" refX="7" refY="7" orient="auto"><circle cx="7" cy="7" r="5.5" fill="#ffffff" stroke="#333333" stroke-width="1.2" /><path d="M 7 1.5 L 7 12.5 M 1.5 7 L 12.5 7" stroke="#333333" stroke-width="1.2" stroke-linecap="round" /></marker>
        </defs>`;

      // If IBD, render the outer context block boundary and its ports
      if (type === 'ibd') {
        const ctxBlockName = contextBlock ? contextBlock.name : 'System';
        svg += `<rect x="${contextFrame.x}" y="${contextFrame.y}" width="${contextFrame.w}" height="${contextFrame.h}" fill="none" stroke="#666" stroke-width="1.5" stroke-dasharray="4,4" rx="6" />`;
        svg += `<text x="${contextFrame.x + 10}" y="${contextFrame.y + 20}" fill="#666" font-size="12" font-weight="bold">ibd [Block] ${escapeHtml(ctxBlockName)}</text>`;

        if (contextBlock && contextBlock.ports) {
          contextBlock.ports.forEach((p: any) => {
            const portPos = getPortPos(contextId, p.id);
            svg += `<rect x="${portPos.x - 4}" y="${portPos.y - 4}" width="8" height="8" fill="#333" stroke="#f97316" stroke-width="1" />`;

            const side = p.side || 'left';
            let tx = portPos.x, ty = portPos.y;
            let anchor = "middle";
            if (side === 'left') { tx -= 6; anchor = "end"; ty += 3; }
            else if (side === 'right') { tx += 6; anchor = "start"; ty += 3; }
            else if (side === 'top') { ty -= 6; }
            else if (side === 'bottom') { ty += 10; }

            svg += `<text x="${tx}" y="${ty}" text-anchor="${anchor}" font-size="8" fill="#666">${escapeHtml(p.name)}</text>`;
          });
        }
      }

      // Render Nodes
      displayNodes.forEach(n => {
        const fill = type === 'req' ? '#fff' : '#f0f0f0';
        const stroke = type === 'req' ? '#f97316' : '#333';
        const hasChild = reportHierarchy.hasChildLayer(n.id);
        const childInfo = hasChild ? reportHierarchy.getChildLayerInfo(n.id) : undefined;
        const dblClickAttr = (hasChild && childInfo && diagId)
          ? `ondblclick="window.ADIA_DIAGRAM_NAV.drillDown('${diagId}', '${childInfo.layerId}', '${escapeHtml(childInfo.title)}'); event.stopPropagation();"`
          : '';
        const nodeClass = `diagram-node${hasChild ? ' has-child-layer' : ''}`;

        if (type === 'statemachine') {
          if (n.nodeType === 'junction') {
            svg += `<g transform="translate(${n.displayX + n.width / 2}, ${n.displayY + n.height / 2})">`;
            svg += `<circle r="8" fill="#333" stroke="#ff9900" stroke-width="2" />`;
            if (n.type === 'history') svg += `<text x="0" y="4" text-anchor="middle" fill="#fff" font-size="11" font-weight="bold">H</text>`;
            if (n.type === 'deep-history') svg += `<text x="0" y="4" text-anchor="middle" fill="#fff" font-size="11" font-weight="bold">H*</text>`;
            svg += `<text x="0" y="-18" text-anchor="middle" fill="#ff9900" font-size="12" font-weight="bold">${escapeHtml(n.name)}</text>`;
            svg += `</g>`;
          } else {
            // State
            svg += `<g class="${nodeClass}" transform="translate(${n.displayX}, ${n.displayY})" ${dblClickAttr}>`;
            svg += `<rect width="${n.width}" height="${n.height}" rx="8" fill="#fcfcfc" stroke="#333" stroke-width="2" />`;
            svg += `<path d="M0 26 h${n.width}" stroke="#ddd" stroke-width="1" />`;
            svg += `<text x="${n.width / 2}" y="18" text-anchor="middle" font-size="13" font-weight="bold" fill="#000" font-family="sans-serif">${escapeHtml(n.name)}</text>`;

            if (hasChild) {
              svg += `<g class="diagram-drill-badge"><rect x="${n.width - 24}" y="5" width="18" height="15" rx="3" fill="#ea580c" /><text x="${n.width - 15}" y="16" text-anchor="middle" font-size="9" fill="#fff" font-weight="bold">⧉</text></g>`;
            }

            if (n.entry || n.during || n.exit) {
              let yTxt = 36;
              if (n.entry) { svg += `<text x="6" y="${yTxt}" font-size="10" fill="#555" font-family="monospace">entry/</text>`; yTxt += 12; }
              if (n.during) { svg += `<text x="6" y="${yTxt}" font-size="10" fill="#555" font-family="monospace">during/</text>`; yTxt += 12; }
              if (n.exit) { svg += `<text x="6" y="${yTxt}" font-size="10" fill="#555" font-family="monospace">exit/</text>`; }
            }
            if (n.internalTransitions) {
              const lines = n.internalTransitions.split('\n').filter((l: string) => l.trim());
              if (lines.length > 0) {
                const startY = n.height - 15 - (lines.length * 10);
                svg += `<g transform="translate(8, ${startY})">`;
                svg += `<line x1="-8" y1="-5" x2="${n.width - 8}" y2="-5" stroke="#eee" stroke-width="1" />`;
                lines.slice(0, 3).forEach((line: string, i: number) => {
                  const txt = line.length > 25 ? line.slice(0, 25) + '...' : line;
                  const safeTxt = escapeHtml(txt);
                  svg += `<text y="${i * 10}" fill="#888" font-size="9" font-family="monospace">${safeTxt}</text>`;
                });
                svg += `</g>`;
              }
            }
            if (n.autostart) {
              svg += `<circle cx="10" cy="-5" r="3" fill="#333" />`;
            }
            svg += `</g>`;
          }
          return;
        }

        svg += `<g class="${nodeClass}" transform="translate(${n.displayX}, ${n.displayY})" ${dblClickAttr}>`;
        svg += `<rect width="${n.width}" height="${n.height}" fill="${fill}" stroke="${stroke}" stroke-width="1" rx="4" />`;

        if (type === 'req') {
          svg += `<text x="${n.width / 2}" y="22" text-anchor="middle" font-size="13" font-weight="bold" fill="#000" font-family="sans-serif">${escapeHtml(n.reqId)}</text>`;
          const displayName = n.name.length > 22 ? n.name.substring(0, 20) + '...' : n.name;
          svg += `<text x="${n.width / 2}" y="40" text-anchor="middle" font-size="11" fill="#333" font-family="sans-serif">${escapeHtml(displayName)}</text>`;
          if (n.description) {
            const desc = n.description.length > 30 ? n.description.substring(0, 28) + '...' : n.description;
            svg += `<text x="6" y="58" font-size="10" fill="#555" font-family="sans-serif">${escapeHtml(desc)}</text>`;
          }
        } else {
          svg += `<text x="${n.width / 2}" y="17" text-anchor="middle" font-size="10" fill="#666" font-family="monospace">«${escapeHtml(n.stereotype || (type === 'ibd' ? 'part' : 'block'))}»</text>`;
          svg += `<text x="${n.width / 2}" y="34" text-anchor="middle" font-size="13" font-weight="bold" fill="#000" font-family="sans-serif">${escapeHtml(n.name)}</text>`;
          svg += `<line x1="0" y1="38" x2="${n.width}" y2="38" stroke="#888" stroke-width="0.5" />`;
        }

        if (hasChild) {
          svg += `<g class="diagram-drill-badge"><rect x="${n.width - 24}" y="5" width="18" height="15" rx="3" fill="#ea580c" /><text x="${n.width - 15}" y="16" text-anchor="middle" font-size="9" fill="#fff" font-weight="bold">⧉</text></g>`;
        }

        if (type === 'bdd' && n.properties?.length > 0) {
          n.properties.slice(0, 3).forEach((p: any, i: number) => {
            svg += `<text x="5" y="${48 + i * 12}" font-size="9" font-family="monospace" fill="#555">${escapeHtml(p.name)}:${escapeHtml(p.type)}</text>`;
          });
        }

        // Render Ports
        let block = type === 'ibd' ? blocks.find(b => b.id === n.typeId) : n;
        if (block && block.ports && type === 'ibd') {
          block.ports.forEach((p: any) => {
            const portPos = getPortPos(n, p.id);
            const px = portPos.x - n.displayX;
            const py = portPos.y - n.displayY;
            svg += `<rect x="${px - 4}" y="${py - 4}" width="8" height="8" fill="#333" stroke="#f97316" stroke-width="1" />`;

            const isLeft = px <= 0;
            const isRight = px >= n.width;
            const isTop = py <= 0;
            const isBottom = py >= n.height;
            let tx = px, ty = py;
            let anchor = "middle";
            if (isLeft) { tx -= 6; anchor = "end"; ty += 3; }
            else if (isRight) { tx += 6; anchor = "start"; ty += 3; }
            else if (isTop) { ty -= 6; }
            else if (isBottom) { ty += 10; }

            svg += `<text x="${tx}" y="${ty}" text-anchor="${anchor}" font-size="8" fill="#666">${escapeHtml(p.name)}</text>`;
          });
        }

        svg += `</g>`;
      });

      // Precompute incoming and outgoing edge counts per node to spread ports
      const outEdgeMap = new Map<string, any[]>();
      const inEdgeMap = new Map<string, any[]>();
      edges.forEach((e: any) => {
        const sId = e.sourceId || e.sourcePartId;
        const tId = e.targetId || e.targetPartId;
        if (!outEdgeMap.has(sId)) outEdgeMap.set(sId, []);
        outEdgeMap.get(sId)!.push(e);
        if (!inEdgeMap.has(tId)) inEdgeMap.set(tId, []);
        inEdgeMap.get(tId)!.push(e);
      });

      // Render Edges
      edges.forEach((e: any) => {
        let sp, tp;
        let source = type === 'ibd' ? displayNodes.find(n => n.id === e.sourcePartId) : displayNodes.find(n => n.id === e.sourceId);
        let target = type === 'ibd' ? displayNodes.find(n => n.id === e.targetPartId) : displayNodes.find(n => n.id === e.targetId);

        if (type === 'ibd') {
          const isSourceCtx = e.sourcePartId === contextId || !e.sourcePartId;
          const isTargetCtx = e.targetPartId === contextId || !e.targetPartId;

          const sRef = source || (isSourceCtx ? contextId : null);
          const tRef = target || (isTargetCtx ? contextId : null);

          if (sRef && tRef) {
            sp = getPortPos(sRef, e.sourcePortId);
            tp = getPortPos(tRef, e.targetPortId);
          }
        } else if (type === 'statemachine') {
          if (source && target) {
            if (source.id === target.id) {
              sp = { x: source.displayX + source.width / 2 - 15, y: source.displayY };
              tp = { x: source.displayX + source.width / 2 + 15, y: source.displayY };
            } else if (source.nodeType === 'junction' && target.nodeType !== 'junction') {
              sp = getJunctionEdgePoint(getCenter(source), getCenter(target));
              tp = getEdgePoint(getBox(target), getBox(source));
            } else if (source.nodeType !== 'junction' && target.nodeType === 'junction') {
              sp = getEdgePoint(getBox(source), getBox(target));
              tp = getJunctionEdgePoint(getCenter(target), getCenter(source));
            } else if (source.nodeType === 'junction' && target.nodeType === 'junction') {
              sp = getJunctionEdgePoint(getCenter(source), getCenter(target));
              tp = getJunctionEdgePoint(getCenter(target), getCenter(source));
            } else {
              sp = getEdgePoint(getBox(source), getBox(target));
              tp = getEdgePoint(getBox(target), getBox(source));
            }
          }
        } else if (type === 'req' || type === 'bdd') {
          if (source && target) {
            const outList = outEdgeMap.get(source.id) || [e];
            const inList = inEdgeMap.get(target.id) || [e];
            const outIdx = Math.max(0, outList.indexOf(e));
            const inIdx = Math.max(0, inList.indexOf(e));

            if (target.displayY >= source.displayY + source.height) {
              // Top-to-bottom hierarchy: spread ports along source bottom and target top
              const spX = source.displayX + (source.width / (outList.length + 1)) * (outIdx + 1);
              const spY = source.displayY + source.height;
              const tpX = target.displayX + (target.width / (inList.length + 1)) * (inIdx + 1);
              const tpY = target.displayY;
              sp = { x: spX, y: spY };
              tp = { x: tpX, y: tpY };
            } else {
              sp = getEdgePoint(getBox(source), getBox(target));
              tp = getEdgePoint(getBox(target), getBox(source));
            }
          }
        } else {
          if (source && target) {
            sp = getEdgePoint(getBox(source), getBox(target));
            tp = getEdgePoint(getBox(target), getBox(source));
          }
        }

        if (sp && tp) {
          let strokeColor = '#333';
          let strokeDash = '';
          let middleLabel = '';
          let markerStart = '';
          let markerEnd = '';

          let cp: Point | undefined = undefined;

          if (type === 'ibd') {
            if (e.itemFlow) middleLabel = `«${e.itemFlow}»`;
            strokeColor = '#333';
            markerEnd = `url(#m-arrow-filled-${type})`;
          } else if (type === 'statemachine') {
            markerEnd = `url(#m-arrow-filled-${type})`;
            strokeColor = '#333';
            if (e.isInternal) middleLabel = `«local» `;
            if (e.condition && e.condition !== 'true') middleLabel += `[${e.condition}]`;
            else if (e.afterTicks) middleLabel += `after(${e.afterTicks})`;

            if (e.action) middleLabel += (middleLabel ? ` / ` : ``) + e.action;

            cp = e.controlPoint || {
              x: (sp.x + tp.x) / 2 + (tp.y - sp.y) * 0.3,
              y: (sp.y + tp.y) / 2 + (sp.x - tp.x) * 0.3,
            };
          } else {
            const relType = e.type;
            if (relType === 'composition') {
              markerStart = `url(#m-diamond-fill-${type})`;
            } else if (relType === 'requirementContainment') {
              markerStart = `url(#requirement-containment-crosshair)`;
              middleLabel = '«contains»';
              strokeColor = '#546e7a';
            } else if (relType === 'aggregation') {
              markerStart = `url(#m-diamond-${type})`;
            } else if (relType === 'generalization') {
              markerEnd = `url(#m-triangle-${type})`;
            } else if (['derive', 'deriveReqt', 'refine', 'satisfy', 'verify', 'trace', 'copy'].includes(relType)) {
              strokeDash = '4,2';
              middleLabel = `«${relType}»`;
              markerEnd = `url(#m-arrow-${type})`;
              strokeColor = '#546e7a';
            } else if (relType === 'allocation') {
              strokeDash = '5,5';
              middleLabel = '«allocate»';
              markerEnd = `url(#m-arrow-${type})`;
              strokeColor = '#546e7a';
            }
          }

          if (type === 'statemachine' && cp) {
            const dPath = `M ${sp.x} ${sp.y} Q ${cp.x} ${cp.y} ${tp.x} ${tp.y}`;
            svg += `<path d="${dPath}" fill="none" stroke="${strokeColor}" stroke-width="1.5" stroke-dasharray="${strokeDash}" marker-end="${markerEnd}" />`;
          } else if (type === 'ibd') {
            // Manhattan orthogonal path
            const midX = (sp.x + tp.x) / 2;
            const dPath = `M ${sp.x} ${sp.y} L ${midX} ${sp.y} L ${midX} ${tp.y} L ${tp.x} ${tp.y}`;
            svg += `<path d="${dPath}" fill="none" stroke="${strokeColor}" stroke-width="1.5" marker-end="${markerEnd}" />`;
          } else if ((type === 'req' || type === 'bdd') && target && source && target.displayY >= source.displayY + source.height) {
            // Smooth vertical S-curve avoiding crossing through middle nodes
            const midY = (sp.y + tp.y) / 2;
            const dPath = `M ${sp.x} ${sp.y} C ${sp.x} ${midY}, ${tp.x} ${midY}, ${tp.x} ${tp.y}`;
            svg += `<path d="${dPath}" fill="none" stroke="${strokeColor}" stroke-width="1.5" stroke-dasharray="${strokeDash}" marker-start="${markerStart}" marker-end="${markerEnd}" />`;
          } else {
            svg += `<line x1="${sp.x}" y1="${sp.y}" x2="${tp.x}" y2="${tp.y}" stroke="${strokeColor}" stroke-width="1.5" stroke-dasharray="${strokeDash}" marker-start="${markerStart}" marker-end="${markerEnd}" />`;
          }

          if (middleLabel || e.label) {
            let midX = (sp.x + tp.x) / 2;
            let midY = (sp.y + tp.y) / 2;

            if (type === 'statemachine' && cp) {
              midX = cp.x;
              midY = cp.y - 5;
            } else if ((type === 'req' || type === 'bdd') && target && source && target.displayY >= source.displayY + source.height) {
              midX = tp.x;
              midY = tp.y - 14;
            }

            const txt = (middleLabel ? middleLabel + ' ' : '') + (e.label || '');
            const txtW = txt.length * 6.5 + 14;
            svg += `<rect x="${midX - txtW / 2}" y="${midY - 8}" width="${txtW}" height="15" fill="#ffffff" stroke="#ddd" stroke-width="0.8" rx="3" />`;
            svg += `<text x="${midX}" y="${midY + 3}" text-anchor="middle" font-size="9" font-weight="600" fill="#f97316" font-family="sans-serif">${escapeHtml(txt)}</text>`;
          }

          if (type === 'bdd' && (e.sourceMultiplicity || e.targetMultiplicity)) {
            if (e.sourceMultiplicity) svg += `<text x="${sp.x + (tp.x > sp.x ? 15 : -15)}" y="${sp.y + (tp.y > sp.y ? 15 : -15)}" font-size="10" fill="#000">${escapeHtml(e.sourceMultiplicity)}</text>`;
            if (e.targetMultiplicity) svg += `<text x="${tp.x + (sp.x > tp.x ? 15 : -15)}" y="${tp.y + (sp.y > tp.y ? 15 : -15)}" font-size="10" fill="#000">${escapeHtml(e.targetMultiplicity)}</text>`;
          }
        }
      });

      svg += `</svg>`;
      return svg;
    };


    // Helper to generate SVG for HMI
    const renderHmiSVG = (components: HmiComponent[]) => {
      if (components.length === 0) return '';

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      components.forEach(c => {
        minX = Math.min(minX, c.x);
        minY = Math.min(minY, c.y);
        maxX = Math.max(maxX, c.x + c.width);
        maxY = Math.max(maxY, c.y + c.height);
      });

      const padding = 20;
      const width = Math.max(100, maxX - minX + padding * 2);
      const height = Math.max(100, maxY - minY + padding * 2);
      const viewBox = `${minX - padding} ${minY - padding} ${width} ${height}`;

      let svg = `<div style="margin: 20px 0; border: 1px solid #333; padding: 10px; overflow: auto; background: #1a1a1a;">`;
      svg += `<h3 style="margin-top:0; color:#f97316; font-size:14px;">HMI Visual Design</h3>`;
      svg += `<svg width="${width}" height="${height}" viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" style="font-family: sans-serif; background: #0a0a0a;">`;

      components.forEach(c => {
        const cx = c.width / 2;
        const cy = c.height / 2;
        const highlight = '#f97316';

        svg += `<g transform="translate(${c.x}, ${c.y})">`;
        svg += `<rect width="${c.width}" height="${c.height}" fill="#1a1a1a" stroke="#333" stroke-width="1" rx="4" />`;

        const themeColors = {
          orange: '#f97316',
          green: '#22c55e',
          red: '#ef4444',
          blue: '#0284c7',
          yellow: '#eab308',
          grey: '#555'
        };

        if (c.type === 'toggle') {
          svg += `<rect x="${cx - 20}" y="${cy - 10}" width="40" height="20" rx="10" fill="#333" />`;
          svg += `<circle cx="${cx - 10}" cy="${cy}" r="8" fill="#fff" />`;
        } else if (c.type === 'button') {
          const btnColor = themeColors[c.color || 'orange'] || themeColors.orange;
          const iconSym = c.icon === 'power' ? '⏻ ' : c.icon === 'play' ? '▶ ' : c.icon === 'light' ? '💡 ' : '';
          svg += `<rect x="4" y="4" width="${c.width - 8}" height="${c.height - 8}" rx="4" fill="#222" stroke="${btnColor}" stroke-width="1" />`;
          svg += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" fill="${btnColor}" font-size="10">${iconSym}${escapeHtml(c.name)}</text>`;
        } else if (c.type === 'lamp') {
          const lampColor = themeColors[c.color || 'green'] || themeColors.green;
          svg += `<circle cx="${cx}" cy="${cy}" r="15" fill="#222" stroke="${lampColor}" stroke-width="2" />`;
        } else if (c.type === 'led') {
          const ledColor = themeColors[c.color || 'red'] || themeColors.red;
          svg += `<circle cx="${cx}" cy="${cy}" r="6" fill="${ledColor}" />`;
        } else if (c.type === 'slider') {
          svg += `<line x1="10" y1="${cy}" x2="${c.width - 10}" y2="${cy}" stroke="#555" stroke-width="4" stroke-linecap="round" />`;
          svg += `<circle cx="${cx}" cy="${cy}" r="8" fill="${highlight}" />`;
        } else if (c.type === 'input') {
          svg += `<rect x="4" y="${cy - 10}" width="${c.width - 8}" height="20" fill="#0a0a0a" stroke="#333" />`;
          svg += `<text x="${c.width - 10}" y="${cy}" text-anchor="end" dominant-baseline="middle" fill="${highlight}" font-family="monospace" font-size="10">0</text>`;
        } else if (c.type === 'lcd') {
          svg += `<rect x="4" y="4" width="${c.width - 8}" height="${c.height - 8}" fill="#0a0a0a" stroke="#333" />`;
          svg += `<text x="${c.width - 10}" y="${cy}" text-anchor="end" dominant-baseline="middle" fill="#4ade80" font-family="monospace" font-size="14">0.00</text>`;
        } else if (c.type === 'gauge') {
          svg += `<path d="M 10 ${c.height - 10} A ${c.width / 2 - 10} ${c.width / 2 - 10} 0 0 1 ${c.width - 10} ${c.height - 10}" fill="none" stroke="#333" stroke-width="6" />`;
        } else if (c.type === 'rotary' || c.type === 'hybrid-rotary') {
          svg += `<circle cx="${cx}" cy="${cy}" r="${Math.min(c.width, c.height) / 2 - 10}" fill="#222" stroke="#1a1a1a" stroke-width="2" />`;
          svg += `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - (Math.min(c.width, c.height) / 2 - 15)}" stroke="${highlight}" stroke-width="2" transform="rotate(-135, ${cx}, ${cy})" />`;
        } else if (c.type === 'buzzer') {
          svg += `<path d="M${cx - 8} ${cy - 8} h4 l4 -4 v24 l-4 -4 h-4 z" fill="#444" />`;
        } else if (c.type === 'oled') {
          const customModeList = c.oledModeNames
            ? c.oledModeNames.split(',').map(s => s.trim())
            : [
                'AIR FRYER', 'STEAMER', 'OVEN', 'RAPID STEAM', 'BROIL', 'REHEAT',
                'KEEP WARM', 'FERMENT', 'DEFROST', 'SLOW COOK', 'DEHYDRATE', 'DUO COOK'
              ];
          const modeText = customModeList[0] || 'READY';
          let indicatorsStr = '💧 🔥 🌀 💡 ⚡';
          if (Array.isArray(c.oledIndicatorEmojis) && c.oledIndicatorEmojis.length > 0) {
            indicatorsStr = c.oledIndicatorEmojis.join(' ');
          }
          const titleText = (c.oledTitle || c.name).toUpperCase();

          svg += `<rect x="4" y="4" width="${c.width - 8}" height="${c.height - 8}" fill="#000" stroke="#222" stroke-width="2" rx="6" />`;
          svg += `<text x="12" y="20" fill="#4d7aaa" font-size="8" font-family="monospace">${escapeHtml(titleText)}</text>`;
          svg += `<text x="${c.width - 12}" y="20" text-anchor="end" fill="#3de88a" font-size="8" font-family="monospace" font-weight="bold">${escapeHtml(modeText)}</text>`;
          svg += `<text x="12" y="45" fill="#4db8ff" font-size="18" font-family="monospace" font-weight="bold">200°C</text>`;
          svg += `<rect x="12" y="55" width="${c.width - 24}" height="3" fill="#111" rx="1" />`;
          svg += `<rect x="12" y="55" width="${(c.width - 24) * 0.4}" height="3" fill="#3de88a" rx="1" />`;
          svg += `<text x="12" y="75" fill="#4db8ff" font-size="10" font-family="monospace">30:00</text>`;
          svg += `<text x="${c.width - 12}" y="75" text-anchor="end" fill="#3de88a" font-size="8" font-family="monospace">HOME</text>`;
          svg += `<text x="12" y="95" fill="#335577" font-size="7" font-family="monospace">${escapeHtml(indicatorsStr)}</text>`;
        } else if (c.type === 'mode-icon') {
          svg += `<rect x="4" y="4" width="${c.width - 8}" height="${c.height - 8}" fill="#1a1a20" stroke="#333" rx="4" />`;
          svg += `<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="14">${escapeHtml(c.iconEmoji || '✨')}</text>`;
          svg += `<text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="7" fill="#ccc">${escapeHtml(c.name)}</text>`;
        } else if (c.type === 'encoder') {
          const isHybrid = Array.isArray(c.encoderValues) && c.encoderValues.length > 0;
          const displayVal = isHybrid ? (c.encoderValues?.[0] || '0') : '0';

          svg += `<circle cx="${cx}" cy="${cy - 15}" r="30" fill="#2a2a36" stroke="#333340" stroke-width="2" />`;
          svg += `<circle cx="${cx}" cy="${cy - 35}" r="3.5" fill="#f97316" />`;
          svg += `<circle cx="${cx}" cy="${cy - 15}" r="15" fill="#0d0d10" stroke="#222230" />`;
          svg += `<rect x="${cx - 25}" y="${c.height - 25}" width="20" height="12" rx="2" fill="#222" stroke="#333" />`;
          svg += `<text x="${cx - 15}" y="${c.height - 17}" text-anchor="middle" fill="#888" font-size="8">↺</text>`;
          svg += `<rect x="${cx + 5}" y="${c.height - 25}" width="20" height="12" rx="2" fill="#222" stroke="#333" />`;
          svg += `<text x="${cx + 15}" y="${c.height - 17}" text-anchor="middle" fill="#888" font-size="8">↻</text>`;
          svg += `<text x="${cx}" y="${cy + 25}" text-anchor="middle" fill="#555" font-family="monospace" font-size="7">${escapeHtml(displayVal)}</text>`;
        } else if (c.type === 'mode-selector') {
          svg += `<rect x="4" y="4" width="${c.width - 8}" height="${c.height - 8}" fill="#111" stroke="#222" rx="4" />`;
          svg += `<text x="10" y="16" fill="#555" font-size="7" font-family="sans-serif" font-weight="bold">COOKING MODES</text>`;
          svg += `<rect x="10" y="24" width="24" height="24" rx="2" fill="#f97316" fill-opacity="0.1" stroke="#f97316" stroke-width="1" />`;
          svg += `<text x="22" y="40" text-anchor="middle" font-size="12">🍟</text>`;
          svg += `<rect x="40" y="24" width="24" height="24" rx="2" fill="#1a1a20" stroke="#222" stroke-width="1" />`;
          svg += `<text x="52" y="40" text-anchor="middle" font-size="12">💧</text>`;
          svg += `<rect x="70" y="24" width="24" height="24" rx="2" fill="#1a1a20" stroke="#222" stroke-width="1" />`;
          svg += `<text x="82" y="40" text-anchor="middle" font-size="12">🍞</text>`;
          svg += `<rect x="100" y="24" width="24" height="24" rx="2" fill="#4db8ff" fill-opacity="0.1" stroke="#4db8ff" stroke-width="1" />`;
          svg += `<text x="112" y="40" text-anchor="middle" font-size="12">♨️</text>`;
          svg += `<text x="135" y="40" fill="#444" font-size="10">...</text>`;
        }

        svg += `<text x="${cx}" y="${c.height - 4}" text-anchor="middle" font-size="8" fill="#888">${escapeHtml(c.name)}</text>`;
        svg += `</g>`;
      });

      svg += `</svg></div>`;
      return svg;
    };

    // 1. Requirements
    const reqs = hierarchySource.blocks.filter(b => b.stereotype === 'requirement');
    if (reqs.length > 0) {
      html += `<h2>1. Requirements</h2>`;
      html += renderRequirementsDiagram({ blocks: hierarchySource.blocks, relationships: hierarchySource.relationships });

      html += `<table style="width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 0.9em;">`;
      html += `<tr style="background-color: #f5f5f5; text-align: left; color: #333;">
                <th style="padding: 10px; border: 1px solid #ddd;">ID</th>
                <th style="padding: 10px; border: 1px solid #ddd;">Name</th>
                <th style="padding: 10px; border: 1px solid #ddd;">Status</th>
                <th style="padding: 10px; border: 1px solid #ddd;">Priority</th>
                <th style="padding: 10px; border: 1px solid #ddd;">Assigned To</th>
                <th style="padding: 10px; border: 1px solid #ddd;">Description</th>
              </tr>`;

      // Build hierarchy map
      const childrenMap = new Map<string, string[]>();
      const parentSet = new Set<string>();

      hierarchySource.relationships.forEach(rel => {
        const source = hierarchySource.blocks.find(b => b.id === rel.sourceId);
        const target = hierarchySource.blocks.find(b => b.id === rel.targetId);
        if (source?.stereotype === 'requirement' && target?.stereotype === 'requirement') {
          // Only use specific SysML relationships for parent-child nesting, matching the Traceability Matrix
          if (rel.type === 'requirementContainment' || rel.type === 'composition' || rel.type === 'derive' || rel.type === 'deriveReqt') {
            if (!childrenMap.has(rel.sourceId)) childrenMap.set(rel.sourceId, []);
            childrenMap.get(rel.sourceId)!.push(rel.targetId);
            parentSet.add(rel.targetId);
          }
        }
      });

      // Roots are requirements that are not children of any other requirement
      const roots = reqs.filter(r => !parentSet.has(r.id));

      // Recursive render function for table rows
      const renderReqRow = (r: BlockData, level: number) => {
        const prefix = '&nbsp;&nbsp;&nbsp;&nbsp;'.repeat(level) + (level > 0 ? '└ ' : '');
        let rowHtml = `<tr>
          <td style="padding: 10px; border: 1px solid #ddd; font-family: monospace; color: #888;">${escapeHtml(r.reqId || '')}</td>
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">${prefix}${escapeHtml(r.name)}</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(r.status || 'Draft')}</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(r.priority || 'Medium')}</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(r.assignedTo || 'Unassigned')}</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(r.description || '')}</td>
        </tr>`;

        const children = childrenMap.get(r.id) || [];
        children.forEach(childId => {
          const child = reqs.find(x => x.id === childId);
          if (child) {
            rowHtml += renderReqRow(child, level + 1);
          }
        });
        return rowHtml;
      };

      if (roots.length === 0 && reqs.length > 0) {
        // Fallback if circular or no explicit roots found
        reqs.forEach((r) => {
          html += renderReqRow(r, 0);
        });
      } else {
        roots.forEach((r) => {
          html += renderReqRow(r, 0);
        });
      }

      html += `</table>`;
    }

    // 2. BDD
    const bddBlocks = hierarchySource.blocks.filter(b => {
      if (b.stereotype === 'requirement') return false;
      return true;
    });

    if (bddBlocks.length > 0) {
      html += `<h2>2. System Architecture (BDD)</h2>`;
      html += renderBddDiagram({
        blocks: hierarchySource.blocks,
        relationships: hierarchySource.relationships,
        parts: hierarchySource.parts,
        containerId: 'adia-diagram-hierarchy',
      });
      html += `<div class="tree">`;
      bddBlocks.forEach(b => {
        html += `<div class="item">
                <div class="item-header">«${escapeHtml(b.stereotype)}» ${escapeHtml(b.name)}</div>`;
        if (b.properties && b.properties.length > 0) {
          html += `<div class="props"><strong>Properties:</strong><ul>`;
          b.properties.forEach(p => html += `<li>${escapeHtml(p.name)}: ${escapeHtml(p.type)} ${p.defaultValue ? '= ' + escapeHtml(p.defaultValue) : ''}</li>`);
          html += `</ul></div>`;
        }
        if (b.ports && b.ports.length > 0) {
          html += `<div class="props"><strong>Ports:</strong><ul>`;
          b.ports.forEach(p => html += `<li>${escapeHtml(p.name)} : ${escapeHtml(p.type)} (${escapeHtml(p.kind || 'standard')})</li>`);
          html += `</ul></div>`;
        }
        html += `</div>`;
      });
      html += `</div>`;
    }

    // 3. IBD
    // 3. IBD
    if (hierarchySource.parts.length > 0) {
      html += `<h2>3. Internal Structure (IBD)</h2>`;
      html += renderInteractiveDiagramHierarchy(hierarchySource, { title: projectName });

      // Generate context listings
      const contextIds = Array.from(new Set(hierarchySource.parts.map(p => p.blockId).filter(id => id !== null))) as string[];
      contextIds.forEach(ctxId => {
        const ctxBlock = hierarchySource.blocks.find(b => b.id === ctxId);
        const ctxName = ctxBlock ? ctxBlock.name : (ctxId === 'root' ? 'Root' : 'Unknown');
        const ctxParts = hierarchySource.parts.filter(p => p.blockId === ctxId);
        const ctxConns = hierarchySource.connectors.filter(c => {
          const s = hierarchySource.parts.find(p => p.id === c.sourcePartId);
          const t = hierarchySource.parts.find(p => p.id === c.targetPartId);

          // Connectors in this context block
          const sInCtx = s && s.blockId === ctxId;
          const tInCtx = t && t.blockId === ctxId;

          // Or environment connectors linked to this context block ports
          const isEnvSource = !c.sourcePartId && t && t.blockId === ctxId;
          const isEnvTarget = !c.targetPartId && s && s.blockId === ctxId;

          return sInCtx || tInCtx || isEnvSource || isEnvTarget;
        });

        if (ctxParts.length > 0) {
          html += `<div class="tree" style="margin-bottom: 30px;">`;
          html += `<h3>Context: ${escapeHtml(ctxName)}</h3>`;

          // Parts list for this context
          html += `<div class="props"><strong>Parts:</strong><ul>`;
          ctxParts.forEach(p => {
            const typeName = hierarchySource.blocks.find(b => b.id === p.typeId)?.name || 'Unknown';
            html += `<li>${escapeHtml(p.name)} : ${escapeHtml(typeName)}</li>`;
          });
          html += `</ul></div>`;

          // Connectors list for this context
          if (ctxConns.length > 0) {
            html += `<div class="props"><strong>Connections:</strong><ul>`;
            ctxConns.forEach(c => {
              const sPart = hierarchySource.parts.find(p => p.id === c.sourcePartId)?.name || 'Env';
              const tPart = hierarchySource.parts.find(p => p.id === c.targetPartId)?.name || 'Env';

              const sBlock = hierarchySource.parts.find(p => p.id === c.sourcePartId)
                ? hierarchySource.blocks.find(b => b.id === (hierarchySource.parts.find(p => p.id === c.sourcePartId)?.typeId))
                : ctxBlock;
              const tBlock = hierarchySource.parts.find(p => p.id === c.targetPartId)
                ? hierarchySource.blocks.find(b => b.id === (hierarchySource.parts.find(p => p.id === c.targetPartId)?.typeId))
                : ctxBlock;

              const sPortName = sBlock?.ports?.find((p: any) => p.id === c.sourcePortId)?.name || c.sourcePortId || '';
              const tPortName = tBlock?.ports?.find((p: any) => p.id === c.targetPortId)?.name || c.targetPortId || '';

              const sDesc = sPart + (sPortName ? `.${sPortName}` : '');
              const tDesc = tPart + (tPortName ? `.${tPortName}` : '');

              html += `<li><span class="tag">Conn</span> ${escapeHtml(sDesc)} &harr; ${escapeHtml(tDesc)} ${c.itemFlow ? '(' + escapeHtml(c.itemFlow) + ')' : ''}</li>`;
            });
            html += `</ul></div>`;
          }
          html += `</div>`;
        }
      });
    }

    // 4. State Machine
    if (hierarchySource.states.length > 0) {
      html += `<h2>4. State Machine</h2><div class="tree">`;

      const smFigures = renderStateMachineDiagrams({
        layers: hierarchySource.layers,
        states: hierarchySource.states,
        junctions: hierarchySource.junctions,
        transitions: hierarchySource.transitions,
      });
      smFigures.forEach(fig => {
        html += fig;
      });

      hierarchySource.states.forEach(s => {
        html += `<div class="item"><div class="item-header">${escapeHtml(s.name)} <span class="tag">State</span></div>`;
        const outgoing = hierarchySource.transitions.filter(t => t.sourceId === s.id);
        const internal = (s.internalTransitions || '').split('\n').filter(l => l.trim());
        if (outgoing.length > 0 || internal.length > 0) {
          html += `<div class="props"><strong>Transitions:</strong><ul>`;
          outgoing.forEach(t => {
            const target = hierarchySource.states.find(st => st.id === t.targetId)?.name || hierarchySource.junctions.find(j => j.id === t.targetId)?.name || 'Unknown';
            html += `<li>To <strong>${escapeHtml(target)}</strong>: [${escapeHtml(t.condition || 'true')}]${t.action ? ' / ' + escapeHtml(t.action) : ''}</li>`;
          });
          internal.forEach(i => {
            const safeI = escapeHtml(i);
            html += `<li><strong>Internal:</strong> ${safeI}</li>`;
          });
          html += `</ul></div>`;
        }
        html += `</div>`;
      });
      html += `</div>`;

      // 4.1 Critical Path Analysis (Critical Batches)
      const analysis = analyzeStateMachine({
        tickMs,
        states: hierarchySource.states as StateData[],
        junctions: hierarchySource.junctions as JunctionData[],
        transitions: hierarchySource.transitions as TransitionData[],
        variables,
        layers: hierarchySource.layers as Layer[],
        safetyMode,
      });
      const analysisErrors = analysis.diagnostics.filter(
        diagnostic => diagnostic.severity === 'error',
      );

      if (analysisErrors.length > 0) {
        html += `<h2>4.0 Semantic Analysis Diagnostics</h2><div class="tree">`;
        html += `<p style="color: #b91c1c; font-weight: bold;">Semantic analysis was not completed because the model is invalid. The sections below are not verification evidence.</p><ul>`;
        analysisErrors.forEach(diagnostic => {
          html += `<li><strong>${escapeHtml(diagnostic.code)}</strong>: ${escapeHtml(diagnostic.message)}</li>`;
        });
        html += `</ul></div>`;
      }

      html += `<h2>4.1 Critical Path Analysis</h2><div class="tree">`;
      html += `<p>The execution path analysis evaluates the longest and most complex functional routes (critical batches) through the state machine.</p>`;
      if (analysis.criticalPaths.length > 0) {
        html += `<table>
                  <tr style="background-color: #f5f5f5; text-align: left; color: #333;">
                    <th style="padding: 10px; border: 1px solid #ddd;">ID</th>
                    <th style="padding: 10px; border: 1px solid #ddd;">Name</th>
                    <th style="padding: 10px; border: 1px solid #ddd;">Execution Sequence</th>
                    <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">Complexity</th>
                  </tr>`;
        analysis.criticalPaths.forEach(cp => {
          html += `<tr>
                    <td style="padding: 10px; border: 1px solid #ddd; font-family: monospace; font-weight: bold; color: #f97316;">${escapeHtml(cp.id)}</td>
                    <td style="padding: 10px; border: 1px solid #ddd;"><strong>${escapeHtml(cp.name)}</strong><br/><small style="color: #666;">${escapeHtml(cp.description)}</small></td>
                    <td style="padding: 10px; border: 1px solid #ddd; font-family: monospace; font-size: 0.95em;">${cp.states.map(s => `<span class="tag">${escapeHtml(s)}</span>`).join(' &rarr; ')}</td>
                    <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; text-align: center;">${escapeHtml(cp.complexity)}</td>
                  </tr>`;
        });
        html += `</table>`;
      } else if (analysisErrors.length > 0) {
        html += `<p><em>Critical-path analysis was not run because semantic validation failed.</em></p>`;
      } else {
        html += `<p><em>No critical paths identified. Check if an autostart state is configured.</em></p>`;
      }
      html += `</div>`;

      // 4.2 Corner Case & Behavior Analysis
      html += `<h2>4.2 Corner Case & Behavior Analysis</h2><div class="tree">`;
      html += `<p>Systematic audit of risk-prone states, deadlock conditions, race risks, and boundaries in the designed logic.</p>`;
      if (analysis.cornerCases.length > 0) {
        html += `<table>
                  <tr style="background-color: #f5f5f5; text-align: left; color: #333;">
                    <th style="padding: 10px; border: 1px solid #ddd;">ID</th>
                    <th style="padding: 10px; border: 1px solid #ddd;">Category</th>
                    <th style="padding: 10px; border: 1px solid #ddd;">Severity</th>
                    <th style="padding: 10px; border: 1px solid #ddd;">Element</th>
                    <th style="padding: 10px; border: 1px solid #ddd;">Description</th>
                    <th style="padding: 10px; border: 1px solid #ddd;">Recommendation</th>
                  </tr>`;
        analysis.cornerCases.forEach(cc => {
          const badgeClass = cc.severity === 'critical' ? 'badge-critical' : cc.severity === 'warning' ? 'badge-warning' : 'badge-info';
          html += `<tr>
                    <td style="padding: 10px; border: 1px solid #ddd; font-family: monospace; font-weight: bold;">${escapeHtml(cc.id)}</td>
                    <td style="padding: 10px; border: 1px solid #ddd; font-family: monospace; font-weight: bold;">${escapeHtml(cc.category)}</td>
                    <td style="padding: 10px; border: 1px solid #ddd;"><span class="badge ${badgeClass}">${escapeHtml(cc.severity.toUpperCase())}</span></td>
                    <td style="padding: 10px; border: 1px solid #ddd;"><strong>${escapeHtml(cc.elementName)}</strong></td>
                    <td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(cc.description)}</td>
                    <td style="padding: 10px; border: 1px solid #ddd;"><span style="color: #3b82f6; font-weight: 500;">${escapeHtml(cc.recommendation)}</span></td>
                  </tr>`;
        });
        html += `</table>`;
      } else if (analysisErrors.length > 0) {
        html += `<p style="color: #b91c1c; font-weight: bold;">Corner-case analysis was not run because semantic validation failed.</p>`;
      } else {
        html += `<p style="color: #15803d; font-weight: bold;">&check; The validated semantic model has no structurally detected deadlocks, unreachable states, or unconditional loops. Runtime and target verification remain separate evidence gates.</p>`;
      }
      html += `</div>`;

      // 4.3 Test Scenario Matrix
      html += `<h2>4.3 Test Scenario Matrix</h2><div class="tree">`;
      html += analysisErrors.length > 0
        ? `<p style="color: #b91c1c; font-weight: bold;">No test scenarios were derived because semantic validation failed.</p>`
        : `<p>Structurally derived test scenarios for critical paths and detected corner cases. Execute them in host, differential, embedded, and target-hardware gates before treating them as runtime evidence.</p>`;
      
      analysis.testScenarios.forEach(ts => {
        html += `<div class="item" style="border: 1px solid #e5e7eb; border-radius: 6px; padding: 15px; margin-bottom: 20px; background-color: #fafafa;">
                  <div class="item-header" style="font-size: 1.1em; color: #1e293b; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin-bottom: 10px;">
                    <span class="tag" style="background-color: #f97316; color: #fff;">${escapeHtml(ts.category.toUpperCase())}</span> ${escapeHtml(ts.name)} <span style="font-family: monospace; font-size: 0.9em; color: #64748b; float: right;">${escapeHtml(ts.id)}</span>
                  </div>`;
        
        if (ts.preconditions.length > 0) {
          html += `<div class="props" style="margin-bottom: 10px;">
                    <strong>Preconditions:</strong>
                    <ul style="margin: 4px 0; padding-left: 20px; font-size: 0.95em;">
                      ${ts.preconditions.map(p => `<li>${escapeHtml(p)}</li>`).join('')}
                    </ul>
                  </div>`;
        }

        html += `<strong>Steps:</strong>
                <table style="width: 100%; border-collapse: collapse; margin-top: 8px; margin-bottom: 10px; font-size: 0.85em; background-color: #fff;">
                  <tr style="background-color: #f1f5f9; text-align: left;">
                    <th style="width: 8%; padding: 6px; border: 1px solid #cbd5e1; text-align: center;">Step</th>
                    <th style="width: 52%; padding: 6px; border: 1px solid #cbd5e1;">Action / Input Stimulus</th>
                    <th style="width: 40%; padding: 6px; border: 1px solid #cbd5e1;">Expected Transition / Output State</th>
                  </tr>`;
        ts.steps.forEach((step, index) => {
          html += `<tr>
                    <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold;">${index + 1}</td>
                    <td style="padding: 6px; border: 1px solid #cbd5e1; font-family: monospace;">${escapeHtml(step.action)}</td>
                    <td style="padding: 6px; border: 1px solid #cbd5e1;">${escapeHtml(step.expected)}</td>
                  </tr>`;
        });
        html += `</table>`;

        html += `<div class="props" style="background-color: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; padding: 8px; border-radius: 4px; font-size: 0.9em;">
                  <strong>Expected Outcome:</strong> ${escapeHtml(ts.expectedResult)}
                </div>`;
        html += `</div>`;
      });
      html += `</div>`;
    }

    // 5. HMI
    if (hmiComponents.length > 0) {
      html += `<h2>5. HMI Design</h2><div class="tree">`;
      html += renderHmiSVG(hmiComponents);
      hmiComponents.forEach(c => {
        const boundVariableName = variables.find(v => v.id === c.variableId)?.name || 'Unbound';
        html += `<div class="item"><div class="item-header">${escapeHtml(c.name)} <span class="tag">${escapeHtml(c.type)}</span></div><div class="props">Bound to: <strong>${escapeHtml(boundVariableName)}</strong></div></div>`;
      });
      html += `</div>`;
    }

    // 6. Interactive System Prototype
    if (hmiComponents.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      hmiComponents.forEach(c => {
        minX = Math.min(minX, c.x);
        minY = Math.min(minY, c.y);
        maxX = Math.max(maxX, c.x + c.width);
        maxY = Math.max(maxY, c.y + c.height);
      });

      const padding = 20;
      const width = Math.max(100, maxX - minX + padding * 2);
      const height = Math.max(100, maxY - minY + padding * 2);

      const standaloneMigration = migrateStateMachineModel({
        tickMs,
        states,
        junctions,
        transitions,
        variables,
        layers,
        safetyMode,
      });

      // Serialize presentation data separately from the authoritative model.
      const serializedVariables = variables.map(v => ({
        id: v.id,
        name: v.name,
        type: v.type,
        defaultValue: v.initialValue,
        currentValue: v.currentValue
      }));

      const serializedStates = states.map(s => ({
        id: s.id,
        name: s.name,
        parentId: s.parentId
      }));

      const serializedHmiComponents = hmiComponents.map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        variableId: c.variableId,
        pressVariableId: c.pressVariableId,
        color: c.color,
        icon: c.icon,
        encoderValues: c.encoderValues,
        cursorVariableId: c.cursorVariableId,
        iconEmoji: c.iconEmoji,
        targetValue: c.targetValue,
        oledTitle: c.oledTitle,
        oledModeNames: c.oledModeNames,
        oledModeVarId: c.oledModeVarId,
        oledTempVarId: c.oledTempVarId,
        oledTimeVarId: c.oledTimeVarId,
        oledStateVarId: c.oledStateVarId,
        oledProgressVarId: c.oledProgressVarId,
        oledIndicatorEmojis: c.oledIndicatorEmojis,
        oledIndicatorVarIds: c.oledIndicatorVarIds,
        oledIndicatorLabels: c.oledIndicatorLabels,
        min: c.min,
        max: c.max,
        x: c.x,
        y: c.y,
        width: c.width,
        height: c.height
      }));

      let componentsHtml = '';
      hmiComponents.forEach(c => {
        const cx = c.x - (minX - padding);
        const cy = c.y - (minY - padding);
        const cw = c.width;
        const ch = c.height;

        componentsHtml += `<div class="hmi-comp-container" style="left: ${cx}px; top: ${cy}px; width: ${cw}px; height: ${ch}px;" data-id="${c.id}" data-type="${c.type}">`;

        if (c.type === 'toggle') {
          componentsHtml += `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
              <div class="hmi-toggle-track" id="track-${c.id}" onclick="window.ADIA_SIM.toggleClick('${c.id}')">
                <div class="hmi-toggle-thumb"></div>
              </div>
              <span style="font-size: 8px; color: #888; margin-top: 4px; text-align: center; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${c.name}</span>
            </div>`;
        } else if (c.type === 'button') {
          const btnColor = c.color === 'green' ? '#22c55e' : c.color === 'red' ? '#ef4444' : c.color === 'blue' ? '#0284c7' : c.color === 'yellow' ? '#eab308' : c.color === 'grey' ? '#555' : '#f97316';
          const iconSym = c.icon === 'power' ? '⏻ ' : c.icon === 'play' ? '▶ ' : c.icon === 'light' ? '💡 ' : '';
          componentsHtml += `
            <button class="hmi-btn" id="btn-${c.id}" onmousedown="window.ADIA_SIM.buttonPress('${c.id}', true)" onmouseup="window.ADIA_SIM.buttonPress('${c.id}', false)" onmouseleave="window.ADIA_SIM.buttonPress('${c.id}', false)" style="--btn-color: ${btnColor}">
              ${iconSym}${c.name}
            </button>`;
        } else if (c.type === 'lamp') {
          const lampColor = c.color === 'green' ? '#22c55e' : c.color === 'red' ? '#ef4444' : c.color === 'blue' ? '#0284c7' : c.color === 'yellow' ? '#eab308' : c.color === 'grey' ? '#555' : '#22c55e';
          componentsHtml += `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
              <div class="hmi-lamp-circle" id="lamp-${c.id}" style="--glow-color: ${lampColor}; border-color: ${lampColor}"></div>
              <span style="font-size: 8px; color: #888; margin-top: 4px; text-align: center; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${c.name}</span>
            </div>`;
        } else if (c.type === 'led') {
          const ledColor = c.color === 'green' ? '#22c55e' : c.color === 'red' ? '#ef4444' : c.color === 'blue' ? '#0284c7' : c.color === 'yellow' ? '#eab308' : c.color === 'grey' ? '#555' : '#ef4444';
          componentsHtml += `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
              <div class="hmi-led-circle" id="led-${c.id}" style="--led-color: ${ledColor}"></div>
              <span style="font-size: 8px; color: #888; margin-top: 4px; text-align: center; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${c.name}</span>
            </div>`;
        } else if (c.type === 'slider') {
          componentsHtml += `
            <div style="display: flex; flex-direction: column; justify-content: center; height: 100%; padding: 0 4px;">
              <input type="range" id="slider-${c.id}" min="${c.min ?? 0}" max="${c.max ?? 100}" oninput="window.ADIA_SIM.sliderChange('${c.id}', this.value)" style="width: 100%; accent-color: #f97316;" />
              <span style="font-size: 8px; color: #888; text-align: center; margin-top: 2px; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${c.name}</span>
            </div>`;
        } else if (c.type === 'input') {
          componentsHtml += `
            <div style="display: flex; flex-direction: column; justify-content: center; height: 100%; padding: 2px;">
              <input type="number" id="input-${c.id}" min="${c.min ?? 0}" max="${c.max ?? 100}" onchange="window.ADIA_SIM.inputChange('${c.id}', this.value)" style="width: 100%; background: #0a0a0a; border: 1px solid #333; color: #f97316; font-family: monospace; font-size: 10px; text-align: center; border-radius: 4px; padding: 2px;" />
              <span style="font-size: 8px; color: #888; text-align: center; margin-top: 2px; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${c.name}</span>
            </div>`;
        } else if (c.type === 'lcd') {
          componentsHtml += `
            <div style="display: flex; flex-direction: column; justify-content: center; height: 100%; background: #0a0a0a; border: 1px solid #333; border-radius: 6px; padding: 4px; box-sizing: border-box;">
              <div id="lcd-${c.id}" style="font-family: monospace; font-size: 14px; color: #4ade80; text-align: right; text-shadow: 0 0 6px rgba(74,222,128,0.4); overflow: hidden; white-space: nowrap;">0.00</div>
              <span style="font-size: 7px; color: #555; text-align: left; margin-top: 1px; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${c.name}</span>
            </div>`;
        } else if (c.type === 'gauge') {
          componentsHtml += `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
              <svg viewBox="0 0 100 50" style="width: 80%; height: auto;">
                <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#333" stroke-width="8" />
                <path id="gauge-path-${c.id}" d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#f97316" stroke-width="8" stroke-dasharray="0 126" />
                <text id="gauge-text-${c.id}" x="50" y="45" text-anchor="middle" fill="#fff" font-size="11" font-family="monospace">0</text>
              </svg>
              <span style="font-size: 7px; color: #888; margin-top: 2px; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${c.name}</span>
            </div>`;
        } else if (c.type === 'rotary' || c.type === 'hybrid-rotary' || c.type === 'encoder') {
          const isEncoder = c.type === 'encoder';
          const innerIcon = isEncoder ? '✦' : '⚙️';
          componentsHtml += `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: space-between; height: 100%; padding: 2px 0;">
              <div style="display: flex; gap: 4px; margin-bottom: 2px;">
                <button onclick="window.ADIA_SIM.rotateKnob('${c.id}', -1)" style="width: 20px; height: 14px; background: #222; border: 1px solid #333; border-radius: 4px; color: #888; font-size: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; outline: none;">↺</button>
                <button onclick="window.ADIA_SIM.rotateKnob('${c.id}', 1)" style="width: 20px; height: 14px; background: #222; border: 1px solid #333; border-radius: 4px; color: #888; font-size: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; outline: none;">↻</button>
              </div>
              <div style="position: relative; width: ${ch - 24}px; height: ${ch - 24}px; cursor: pointer;" 
                   onmousedown="window.ADIA_SIM.knobPress('${c.id}', true)" 
                   onmouseup="window.ADIA_SIM.knobPress('${c.id}', false)"
                   onmouseleave="window.ADIA_SIM.knobPress('${c.id}', false)">
                <div class="hmi-knob-circle" id="knob-${c.id}">
                  <div class="hmi-knob-dot"></div>
                  <div class="hmi-knob-inner">${innerIcon}</div>
                </div>
                <div class="knob-lp-ring" id="knob-lp-${c.id}"></div>
              </div>
              <div id="knob-val-${c.id}" style="font-family: monospace; font-size: 8px; color: #ccc; margin-top: 1px; width: 100%; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">0</div>
            </div>`;
        } else if (c.type === 'oled') {
          componentsHtml += `
            <div class="hmi-comp oled" id="oled-${c.id}" style="width: 100%; height: 100%; background: black; border: 1px solid #1a1a22; border-radius: 8px; padding: 6px; flex-direction: column; justify-content: space-between; font-family: monospace; color: #4db8ff; box-shadow: inset 0 0 10px rgba(0,0,0,0.9); display: flex; box-sizing: border-box;">
              <div style="font-size: 7px; color: #4d7aaa; display: flex; justify-content: space-between; border-bottom: 1px solid #111; padding-bottom: 2px;">
                <span class="oled-title" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60%;">${c.oledTitle || c.name}</span>
                <span class="oled-mode" style="color: #3de88a; font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 40%;">READY</span>
              </div>
              <div class="oled-temp" style="font-size: 16px; font-weight: bold; color: #4db8ff; margin: 1px 0;">200°C</div>
              <div style="width: 100%; height: 3px; background: #111; border: 1px solid #222; border-radius: 2px; overflow: hidden; margin: 1px 0;">
                <div class="oled-progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #e8a020, #3de88a); transition: width 0.3s;"></div>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; font-size: 9px; margin: 1px 0;">
                <span class="oled-time">30:00</span>
                <span class="oled-state" style="color: #3de88a; border: 1px solid rgba(61,232,138,0.2); border-radius: 2px; padding: 0 3px; font-size: 7px;">HOME</span>
              </div>
              <div class="oled-indicators" style="display: flex; gap: 3px; font-size: 10px; border-top: 1px solid #111; padding-top: 2px; height: 14px; overflow: hidden;"></div>
              <div class="oled-context" style="font-size: 6px; color: #335577; border-top: 1px solid #111; padding-top: 2px; text-align: left; height: 9px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;">Ready to cook</div>
            </div>`;
        } else if (c.type === 'mode-icon') {
          componentsHtml += `
            <div class="hmi-mode-card" id="modeicon-${c.id}" onclick="window.ADIA_SIM.modeIconClick('${c.id}')" style="width: 100%; height: 100%;">
              <span style="font-size: 14px;">${c.iconEmoji || '✨'}</span>
              <span style="font-size: 7px; color: #ccc; margin-top: 2px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%;">${c.name}</span>
            </div>`;
        } else if (c.type === 'mode-selector') {
          componentsHtml += `
            <div class="hmi-comp mode-selector" style="width: 100%; height: 100%; background: #111; border: 1px solid #222; border-radius: 6px; padding: 4px; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box;">
              <div style="font-size: 7px; color: #555; font-weight: bold; text-transform: uppercase;">Cooking Modes</div>
              <div class="modes-grid" style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 2px; margin-top: 1px;">
                ${[
                  { name: 'Air Fry', emoji: '🍟' },
                  { name: 'Steam', emoji: '💧' },
                  { name: 'Oven', emoji: '🍞' },
                  { name: 'Rapid Stm', emoji: '♨️' },
                  { name: 'Broil', emoji: '🔥' },
                  { name: 'Reheat', emoji: '🍲' },
                  { name: 'Warm', emoji: '☕' },
                  { name: 'Ferment', emoji: '🧫' },
                  { name: 'Defrost', emoji: '❄️' },
                  { name: 'Slow Cook', emoji: '🥘' },
                  { name: 'Dehydrate', emoji: '🌿' },
                  { name: 'Duo Cook', emoji: '⚡' }
                ].map((m, idx) => `
                  <div class="selector-mode-card" id="modeselect-${c.id}-${idx}" onclick="window.ADIA_SIM.modeSelectorClick('${c.id}', ${idx})" style="border: 1px solid #222; background: #1a1a20; border-radius: 3px; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; padding: 1px; transition: all 0.1s;">
                    <span style="font-size: 8px;">${m.emoji}</span>
                    <span style="font-size: 5px; color: #888; text-align: center; margin-top: 0.5px; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${m.name.split(' ')[0]}</span>
                  </div>
                `).join('')}
              </div>
            </div>`;
        } else if (c.type === 'buzzer') {
          componentsHtml += `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
              <div id="buzzer-${c.id}" style="font-size: 18px; color: #444; transition: all 0.1s;">🔊</div>
              <span style="font-size: 8px; color: #888; margin-top: 2px; text-align: center; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${c.name}</span>
            </div>`;
        }

        componentsHtml += `</div>`;
      });

      html += `
        <h2>6. Interactive System Prototype</h2>
        <div class="hmi-sim-container">
          <style>
            .hmi-sim-container {
              background: #0a0a0c;
              color: #e8e8ec;
              border: 1px solid #2a2a36;
              border-radius: 12px;
              padding: 24px;
              font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
              margin-top: 30px;
              box-shadow: 0 10px 30px rgba(0,0,0,0.5);
              box-sizing: border-box;
            }
            .hmi-sim-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 1px solid #2a2a36;
              padding-bottom: 12px;
              margin-bottom: 20px;
            }
            .hmi-sim-title {
              color: #f97316;
              font-size: 16px;
              font-weight: 700;
              margin: 0;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            .hmi-sim-subtitle {
              color: #8888a0;
              font-size: 11px;
              margin: 4px 0 0;
            }
            .sim-toolbar {
              display: flex;
              gap: 8px;
            }
            .sim-btn {
              background: #1a1a20;
              border: 1px solid #2a2a36;
              color: #e8e8ec;
              border-radius: 6px;
              padding: 6px 12px;
              cursor: pointer;
              font-size: 12px;
              font-weight: 600;
              transition: all 0.15s;
              outline: none;
            }
            .sim-btn:hover {
              background: #22222a;
              border-color: #f97316;
            }
            .sim-btn.active {
              background: rgba(249, 115, 22, 0.15);
              border-color: #f97316;
              color: #f97316;
            }
            .hmi-canvas-wrapper {
              position: relative;
              border: 1px solid #2a2a36;
              border-radius: 8px;
              background: #111115;
              margin: 0 auto 20px;
              box-shadow: inset 0 0 20px rgba(0,0,0,0.8);
            }
            .hmi-comp-container {
              position: absolute;
              box-sizing: border-box;
            }
            .hmi-btn {
              width: 100%;
              height: 100%;
              border-radius: 6px;
              border: 1px solid #333;
              background: linear-gradient(180deg, #222230, #18181e);
              color: #e0e0e0;
              font-size: 10px;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              transition: all 0.12s;
              box-shadow: 0 2px 4px rgba(0,0,0,0.4);
              outline: none;
              user-select: none;
            }
            .hmi-btn:hover {
              background: linear-gradient(180deg, #2a2a3a, #1e1e26);
              border-color: #f97316;
            }
            .hmi-btn:active {
              transform: translateY(1px);
              box-shadow: 0 1px 2px rgba(0,0,0,0.4);
            }
            .hmi-btn.active {
              background: rgba(249, 115, 22, 0.1);
              border-color: #f97316;
              color: #f97316;
              box-shadow: 0 0 8px rgba(249, 115, 22, 0.3);
            }
            .hmi-toggle-track {
              width: 40px;
              height: 20px;
              border-radius: 10px;
              background: #333;
              position: relative;
              cursor: pointer;
              transition: background 0.2s;
            }
            .hmi-toggle-track.active {
              background: #22c55e;
            }
            .hmi-toggle-thumb {
              width: 16px;
              height: 16px;
              border-radius: 50%;
              background: white;
              position: absolute;
              top: 2px;
              left: 2px;
              transition: transform 0.2s;
              box-shadow: 0 1px 3px rgba(0,0,0,0.4);
            }
            .hmi-toggle-track.active .hmi-toggle-thumb {
              transform: translateX(20px);
            }
            .hmi-lamp-circle {
              width: 24px;
              height: 24px;
              border-radius: 50%;
              background: #111;
              border: 2px solid #555;
              transition: all 0.2s;
            }
            .hmi-lamp-circle.active {
              box-shadow: 0 0 12px var(--glow-color, #22c55e);
              background: var(--glow-color, #22c55e);
            }
            .hmi-led-circle {
              width: 10px;
              height: 10px;
              border-radius: 50%;
              background: #222;
              border: 1px solid #111;
              transition: all 0.2s;
            }
            .hmi-led-circle.active {
              background: var(--led-color, #ef4444);
              box-shadow: 0 0 8px var(--led-color, #ef4444);
              border-color: var(--led-color, #ef4444);
            }
            .hmi-knob-circle {
              width: 100%;
              height: 100%;
              border-radius: 50%;
              background: conic-gradient(from 0deg, #2a2a36, #1a1a24, #2a2a36, #1a1a24, #2a2a36);
              border: 2px solid #333340;
              box-shadow: 0 3px 8px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05);
              position: relative;
              transition: transform 0.1s;
            }
            .hmi-knob-dot {
              width: 4px;
              height: 4px;
              background: #f97316;
              border-radius: 50%;
              position: absolute;
              top: 4px;
              left: 50%;
              transform: translateX(-50%);
              box-shadow: 0 0 4px rgba(249,115,22,0.8);
            }
            .hmi-knob-inner {
              width: 45%;
              height: 45%;
              border-radius: 50%;
              background: #0d0d10;
              border: 1px solid #222230;
              position: absolute;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              display: flex;
              align-items: center;
              justify-content: center;
              color: #444;
              font-size: 8px;
            }
            .knob-lp-ring {
              position: absolute;
              inset: -3px;
              border-radius: 50%;
              border: 1.5px solid #f97316;
              opacity: 0;
              pointer-events: none;
              transition: opacity 0.2s, transform 0.2s;
              transform: scale(0.9);
            }
            .hmi-mode-card {
              border: 1px solid #222;
              background: #1a1a20;
              border-radius: 6px;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              cursor: pointer;
              transition: all 0.15s;
              padding: 4px;
              box-sizing: border-box;
            }
            .hmi-mode-card.active {
              border-color: #f97316;
              background: rgba(249, 115, 22, 0.1);
              box-shadow: 0 0 6px rgba(249, 115, 22, 0.3);
            }
            .selector-mode-card.active {
              border-color: #f97316 !important;
              background: rgba(249, 115, 22, 0.15) !important;
              box-shadow: 0 0 5px rgba(249, 115, 22, 0.3);
            }
            .selector-mode-card.cursor {
              border-color: #4db8ff !important;
              background: rgba(77, 184, 255, 0.15) !important;
              box-shadow: 0 0 5px rgba(77, 184, 255, 0.3);
            }
            @keyframes sim-spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          </style>

          <div class="hmi-sim-header">
            <div>
              <div class="hmi-sim-title">HMI INTERACTIVE SIMULATOR</div>
              <div class="hmi-sim-subtitle">Interact with components to step through the system logic in real-time.</div>
            </div>
            <div class="sim-toolbar">
              <button id="sim-btn-power" onclick="window.ADIA_SIM.toggleSimRunning()" class="sim-btn">PAUSE</button>
              <button id="sim-btn-step" onclick="window.ADIA_SIM.step()" class="sim-btn">STEP TICK</button>
              <button id="sim-btn-reset" onclick="window.ADIA_SIM.reset()" class="sim-btn">RESET</button>
            </div>
          </div>

          <div class="hmi-canvas-wrapper" style="width: ${width}px; height: ${height}px;">
            ${componentsHtml}
          </div>

          <div style="background: #111115; border: 1px solid #2a2a36; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
            <div style="font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #555568; margin-bottom: 12px; border-bottom: 1px solid #2a2a36; padding-bottom: 6px;">Live Engineering Dashboard</div>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(145px, 1fr)); gap: 10px;" id="sim-dashboard"></div>
          </div>

          <div style="background: #111115; border: 1px solid #2a2a36; border-radius: 8px; padding: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <div style="font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #555568;">Event Log</div>
              <button onclick="window.ADIA_SIM.clearLog()" style="font-size: 10px; color: #555568; cursor: pointer; border: 1px solid #2a2a36; background: none; border-radius: 4px; padding: 2px 6px;">Clear</button>
            </div>
            <div id="sim-event-log" style="max-height: 120px; overflow-y: auto; font-family: monospace; font-size: 11px; display: flex; flex-direction: column; gap: 4px;"></div>
          </div>
        </div>

        <script>
          ${STATE_MACHINE_RUNTIME_BUNDLE}
          (function() {
            const PROJECT_DATA = {
              model: ${serializeInlineScriptJson(standaloneMigration.model)},
              modelDiagnostics: ${serializeInlineScriptJson(standaloneMigration.diagnostics)},
              variables: ${serializeInlineScriptJson(serializedVariables)},
              states: ${serializeInlineScriptJson(serializedStates)},
              hmiComponents: ${serializeInlineScriptJson(serializedHmiComponents)},
              tickMs: ${tickMs}
            };

            let varValues = {};
            let varTypes = {};
            let activeStates = {};
            let stateTimers = {};
            let semanticRuntime = null;
            let simRunning = true;
            let simInterval = null;
            let stepCount = 0;
            let simTime = 0;
            let lpTimers = {};
            let audioCtx = null;

            function escapeHtml(str) {
              return String(str || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;')
                .replace(/\x60/g, '&#96;');
            }

            function logEvent(event, detail = "") {
              const el = document.getElementById("sim-event-log");
              if (!el) return;
              const now = new Date();
              const ts = String(now.getMinutes()).padStart(2, "0") + ":" + String(now.getSeconds()).padStart(2, "0") + "." + String(Math.floor(now.getMilliseconds() / 100));
              const entry = document.createElement("div");
              entry.style.display = "flex";
              entry.style.gap = "8px";
              entry.style.borderBottom = "1px solid #1a1a20";
              entry.style.padding = "3px 0";

              const s1 = document.createElement("span");
              s1.style.color = "#555568";
              s1.style.minWidth = "50px";
              s1.textContent = ts;

              const s2 = document.createElement("span");
              s2.style.color = "#4db8ff";
              s2.style.minWidth = "100px";
              s2.style.fontWeight = "bold";
              s2.textContent = event;

              const s3 = document.createElement("span");
              s3.style.color = "#8888a0";
              s3.textContent = detail;

              entry.appendChild(s1);
              entry.appendChild(s2);
              entry.appendChild(s3);

              el.prepend(entry);
              while (el.children.length > 40) el.removeChild(el.lastChild);
            }

            function getVarValById(id) {
              const v = PROJECT_DATA.variables.find(x => x.id === id);
              return v ? varValues[v.name] : null;
            }

            function updateVariableById(id, value) {
              const v = PROJECT_DATA.variables.find(x => x.id === id);
              if (!v || !semanticRuntime) return;
              let val = value;
              if (varTypes[v.name] === "bool") {
                val = value === "true" || value === true || value === "1" || value === 1;
              } else if (varTypes[v.name] === "int" || varTypes[v.name] === "float") {
                val = Number(value) || 0;
              }
              const oldVal = varValues[v.name];
              if (oldVal !== val) {
                window.ADIAStateMachineRuntime.applyInputs(
                  semanticRuntime,
                  { [v.id]: val }
                );
                varValues[v.name] = semanticRuntime.data[v.id];
                logEvent("Variable Change", v.name + ": " + oldVal + " → " + val);
                updateUi();
              }
            }

            function beepBuzzer() {
              try {
                if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                if (audioCtx.state === "suspended") audioCtx.resume();
                if (window.lastBeepTime && Date.now() - window.lastBeepTime < 300) return;
                window.lastBeepTime = Date.now();
                const osc = audioCtx.createOscillator();
                const gainNode = audioCtx.createGain();
                osc.connect(gainNode);
                gainNode.connect(audioCtx.destination);
                osc.type = "sine";
                osc.frequency.value = 1000;
                gainNode.gain.setValueAtTime(0.04, audioCtx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.08);
                osc.start();
                osc.stop(audioCtx.currentTime + 0.08);
              } catch (e) {}
            }

            function applySemanticFrame(frame) {
              const nextActiveStates = {};
              frame.activeStateIds.forEach(stateId => {
                const state = semanticRuntime.ir.states[stateId];
                const layer = semanticRuntime.ir.layers[state.layerId];
                const key = layer.decomposition === "AND"
                  ? layer.id + "_" + stateId
                  : layer.id;
                nextActiveStates[key] = stateId;
              });
              activeStates = nextActiveStates;
              stateTimers = { ...frame.stateTimersMs };
              stepCount = frame.sequence;

              PROJECT_DATA.variables.forEach(v => {
                varValues[v.name] = frame.data[v.id];
              });

              frame.actions
                .filter(action => action.startsWith("transition:"))
                .forEach(action => {
                  const transitionId = action.slice("transition:".length);
                  const transition = semanticRuntime.ir.transitions[transitionId];
                  if (!transition) {
                    logEvent("Transition", transitionId);
                    return;
                  }
                  const sourceState = PROJECT_DATA.states.find(
                    state => state.id === transition.sourceStateId
                  );
                  const destinationState = PROJECT_DATA.states.find(
                    state => state.id === transition.destinationStateId
                  );
                  logEvent(
                    "Transition",
                    (sourceState ? sourceState.name : transition.sourceStateId)
                      + " → "
                      + (
                        destinationState
                          ? destinationState.name
                          : transition.destinationStateId
                      )
                  );
                });
            }

            function stepSimulation() {
              if (!semanticRuntime) return;
              const elapsedMs = PROJECT_DATA.tickMs || 100;
              const frame = window.ADIAStateMachineRuntime.stepRuntime(
                semanticRuntime,
                elapsedMs
              );
              simTime += elapsedMs / 1000;
              applySemanticFrame(frame);
              updateUi();
              if (frame.error) {
                simRunning = false;
                logEvent("Runtime Error", frame.error);
              }
            }

            function updateDashboard() {
              const db = document.getElementById("sim-dashboard");
              if (!db) return;
              db.textContent = "";

              PROJECT_DATA.model.layers.forEach(layer => {
                const layerName = layer.name || (layer.id === "root" ? "Root Region" : "Region");
                const activeStateIds = Object.entries(activeStates)
                  .filter(([key]) => key === layer.id || key.startsWith(layer.id + "_"))
                  .map(([, stateId]) => stateId);
                const stateName = activeStateIds
                  .map(stateId => PROJECT_DATA.states.find(s => s.id === stateId)?.name || stateId)
                  .join(", ") || "—";
                const cell = document.createElement("div");
                cell.style.background = "#1a1a20";
                cell.style.border = "1px solid #2a2a36";
                cell.style.borderRadius = "6px";
                cell.style.padding = "6px 8px";

                const d1 = document.createElement("div");
                d1.style.fontSize = "8px";
                d1.style.color = "#555568";
                d1.style.textTransform = "uppercase";
                d1.style.overflow = "hidden";
                d1.style.textOverflow = "ellipsis";
                d1.style.whiteSpace = "nowrap";
                d1.textContent = layerName;

                const d2 = document.createElement("div");
                d2.style.fontSize = "11px";
                d2.style.fontWeight = "bold";
                d2.style.color = "#f97316";
                d2.style.marginTop = "2px";
                d2.style.overflow = "hidden";
                d2.style.textOverflow = "ellipsis";
                d2.style.whiteSpace = "nowrap";
                d2.textContent = stateName;

                cell.appendChild(d1);
                cell.appendChild(d2);
                db.appendChild(cell);
              });

              PROJECT_DATA.variables.forEach(v => {
                const val = varValues[v.name];
                let displayVal = String(val !== undefined && val !== null ? val : "");
                if (v.type === "bool") displayVal = val ? "TRUE" : "FALSE";
                const cell = document.createElement("div");
                cell.style.background = "#1a1a20";
                cell.style.border = "1px solid #2a2a36";
                cell.style.borderRadius = "6px";
                cell.style.padding = "6px 8px";

                const d1 = document.createElement("div");
                d1.style.fontSize = "8px";
                d1.style.color = "#555568";
                d1.style.textTransform = "uppercase";
                d1.style.overflow = "hidden";
                d1.style.textOverflow = "ellipsis";
                d1.style.whiteSpace = "nowrap";
                d1.textContent = v.name;

                const d2 = document.createElement("div");
                d2.style.fontSize = "11px";
                d2.style.fontWeight = "bold";
                d2.style.color = v.type === "bool" && val ? "#22c55e" : "#e8e8ec";
                d2.style.marginTop = "2px";
                d2.style.overflow = "hidden";
                d2.style.textOverflow = "ellipsis";
                d2.style.whiteSpace = "nowrap";
                d2.textContent = displayVal;

                cell.appendChild(d1);
                cell.appendChild(d2);
                db.appendChild(cell);
              });
            }

            function updateUi() {
              PROJECT_DATA.hmiComponents.forEach(c => {
                const val = c.variableId ? getVarValById(c.variableId) : null;
                if (c.type === "toggle") {
                  const track = document.getElementById("track-" + c.id);
                  if (track) {
                    if (val === true || val === "true" || val === 1) track.classList.add("active");
                    else track.classList.remove("active");
                  }
                } else if (c.type === "button") {
                  const btn = document.getElementById("btn-" + c.id);
                  if (btn) {
                    const isPress = c.pressVariableId ? getVarValById(c.pressVariableId) : null;
                    const active = (val === true || val === "true" || val === 1 || isPress === true || isPress === "true" || isPress === 1);
                    if (active) btn.classList.add("active");
                    else btn.classList.remove("active");
                  }
                } else if (c.type === "lamp") {
                  const lamp = document.getElementById("lamp-" + c.id);
                  if (lamp) {
                    if (val === true || val === "true" || val === 1) lamp.classList.add("active");
                    else lamp.classList.remove("active");
                  }
                } else if (c.type === "led") {
                  const led = document.getElementById("led-" + c.id);
                  if (led) {
                    if (val === true || val === "true" || val === 1) led.classList.add("active");
                    else led.classList.remove("active");
                  }
                } else if (c.type === "slider") {
                  const slider = document.getElementById("slider-" + c.id);
                  if (slider) slider.value = Number(val) || 0;
                } else if (c.type === "input") {
                  const input = document.getElementById("input-" + c.id);
                  if (input) input.value = val !== null ? val : "";
                } else if (c.type === "lcd") {
                  const lcd = document.getElementById("lcd-" + c.id);
                  if (lcd) {
                    const num = Number(val);
                    lcd.textContent = isNaN(num) ? String(val ?? "") : num.toFixed(2);
                  }
                } else if (c.type === "gauge") {
                  const path = document.getElementById("gauge-path-" + c.id);
                  const text = document.getElementById("gauge-text-" + c.id);
                  if (path && text) {
                    const minVal = c.min ?? 0;
                    const maxVal = c.max ?? 100;
                    const range = maxVal - minVal;
                    const currentVal = Number(val) || 0;
                    const percent = range === 0 ? 0 : Math.max(0, Math.min(1, (currentVal - minVal) / range));
                    path.setAttribute("stroke-dasharray", (percent * 126) + " 126");
                    text.textContent = Math.round(currentVal);
                  }
                } else if (c.type === "rotary" || c.type === "hybrid-rotary" || c.type === "encoder") {
                  const knob = document.getElementById("knob-" + c.id);
                  const valText = document.getElementById("knob-val-" + c.id);
                  if (knob) {
                    let angle = 0;
                    let displayVal = "0";
                    if (c.type === "encoder") {
                      const isHybrid = Array.isArray(c.encoderValues) && c.encoderValues.length > 0;
                      const encoderValues = c.encoderValues || [];
                      if (isHybrid) {
                        const idx = encoderValues.findIndex(x => String(x) === String(val));
                        const currentIndex = idx !== -1 ? idx : 0;
                        angle = currentIndex * (360 / Math.max(1, encoderValues.length));
                        displayVal = String(encoderValues[currentIndex] || "");
                      } else {
                        const rotVal = Number(val) || 0;
                        angle = rotVal * 18;
                        displayVal = String(rotVal);
                      }
                    } else if (c.type === "hybrid-rotary") {
                      const values = c.hybridValues || [];
                      const idx = values.findIndex(v => String(v) === String(val));
                      const currentIndex = idx !== -1 ? idx : 0;
                      angle = -135 + currentIndex * (270 / Math.max(1, values.length - 1));
                      displayVal = String(values[currentIndex] || "");
                    } else {
                      const minVal = c.min ?? 0;
                      const maxVal = c.max ?? 100;
                      const range = maxVal - minVal;
                      const currentVal = Number(val) || 0;
                      angle = -135 + (range === 0 ? 0 : (currentVal - minVal) / range) * 270;
                      displayVal = currentVal.toFixed(1);
                    }
                    knob.style.transform = "rotate(" + angle + "deg)";
                    if (valText) valText.textContent = displayVal;
                  }
                } else if (c.type === "oled") {
                  const oled = document.getElementById("oled-" + c.id);
                  if (oled) {
                    const modeTextEl = oled.querySelector(".oled-mode");
                    const tempEl = oled.querySelector(".oled-temp");
                    const progressEl = oled.querySelector(".oled-progress-bar");
                    const timeEl = oled.querySelector(".oled-time");
                    const stateEl = oled.querySelector(".oled-state");
                    const indicatorsEl = oled.querySelector(".oled-indicators");
                    const contextEl = oled.querySelector(".oled-context");
                    
                    if (modeTextEl) {
                      const modeIdx = c.oledModeVarId ? Number(getVarValById(c.oledModeVarId)) || 0 : 0;
                      const modeNames = c.oledModeNames ? c.oledModeNames.split(",").map(s => s.trim()) : [
                        "AIR FRYER", "STEAMER", "OVEN", "RAPID STEAM", "BROIL", "REHEAT",
                        "KEEP WARM", "FERMENT", "DEFROST", "SLOW COOK", "DEHYDRATE", "DUO COOK"
                      ];
                      modeTextEl.textContent = modeNames[modeIdx] || "READY";
                    }
                    if (tempEl) {
                      const tempVal = c.oledTempVarId ? getVarValById(c.oledTempVarId) : "";
                      tempEl.textContent = tempVal !== undefined && tempVal !== null && tempVal !== "" ? tempVal + "°C" : "";
                    }
                    if (progressEl) {
                      const progressVal = c.oledProgressVarId ? Number(getVarValById(c.oledProgressVarId)) || 0 : 0;
                      progressEl.style.width = Math.max(0, Math.min(100, progressVal)) + "%";
                    }
                    if (timeEl) {
                      const timeVal = c.oledTimeVarId ? getVarValById(c.oledTimeVarId) : "";
                      const timeNum = Number(timeVal);
                      if (!isNaN(timeNum) && timeVal !== "" && timeVal !== null) {
                        const m = Math.floor(timeNum / 60);
                        const s = Math.round(timeNum % 60);
                        if (timeNum < 180 && String(c.oledTitle).toLowerCase().includes("fryer")) {
                          timeEl.textContent = String(Math.floor(timeNum)).padStart(2, "0") + ":00";
                        } else {
                          timeEl.textContent = String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
                        }
                      } else {
                        timeEl.textContent = String(timeVal ?? "");
                      }
                    }
                    if (stateEl) {
                      const stateVal = c.oledStateVarId ? String(getVarValById(c.oledStateVarId)) : "";
                      if (stateVal) stateEl.textContent = stateVal;
                      else {
                        const rootActiveStateId = activeStates["root"];
                        const rootActiveState = PROJECT_DATA.states.find(s => s.id === rootActiveStateId);
                        stateEl.textContent = rootActiveState ? rootActiveState.name : "HOME";
                      }
                    }
                    if (indicatorsEl && Array.isArray(c.oledIndicatorEmojis)) {
                      indicatorsEl.textContent = "";
                      c.oledIndicatorEmojis.forEach((emoji, idx) => {
                        const varId = c.oledIndicatorVarIds?.[idx];
                        const iVal = varId ? !!getVarValById(varId) : false;
                        const label = c.oledIndicatorLabels?.[idx] || "";
                        const isSpin = emoji === "🌀" || emoji === "⚙️" || emoji === "🎡" || label.toLowerCase().includes("fan") || label.toLowerCase().includes("spin");
                        const span = document.createElement("span");
                        span.title = label;
                        span.textContent = emoji;
                        span.style.transition = "opacity 0.2s";
                        span.style.opacity = iVal ? "1" : "0.2";
                        span.style.display = "inline-block";
                        if (iVal && isSpin) {
                          span.style.animation = "sim-spin 2s linear infinite";
                        }
                        indicatorsEl.appendChild(span);
                      });
                    }
                    if (contextEl) {
                      contextEl.textContent = "System OK";
                    }
                  }
                } else if (c.type === "mode-icon") {
                  const card = document.getElementById("modeicon-" + c.id);
                  if (card) {
                    if (String(val) === String(c.targetValue)) card.classList.add("active");
                    else card.classList.remove("active");
                  }
                } else if (c.type === "mode-selector") {
                  const selVarVal = val;
                  const curVarVal = c.cursorVariableId ? getVarValById(c.cursorVariableId) : null;
                  for (let idx = 0; idx < 12; idx++) {
                    const item = document.getElementById("modeselect-" + c.id + "-" + idx);
                    if (item) {
                      item.className = "selector-mode-card";
                      if (Number(selVarVal) === idx) item.classList.add("active");
                      else if (Number(curVarVal) === idx) item.classList.add("cursor");
                    }
                  }
                } else if (c.type === "buzzer") {
                  const buzzer = document.getElementById("buzzer-" + c.id);
                  if (buzzer) {
                    if (val === true || val === "true" || val === 1) {
                      buzzer.style.color = "#ef4444";
                      buzzer.style.transform = stepCount % 2 === 0 ? "scale(1.2)" : "scale(1.0)";
                      beepBuzzer();
                    } else {
                      buzzer.style.color = "#444";
                      buzzer.style.transform = "scale(1.0)";
                    }
                  }
                }
              });
              updateDashboard();
            }

            function initializeSimulation() {
              PROJECT_DATA.variables.forEach(v => {
                varTypes[v.name] = v.type;
              });

              try {
                const migrationErrors = PROJECT_DATA.modelDiagnostics.filter(
                  diagnostic => diagnostic.severity === "error"
                );
                if (migrationErrors.length > 0) {
                  throw new Error(
                    migrationErrors
                      .map(diagnostic => diagnostic.code + ": " + diagnostic.message)
                      .join("; ")
                  );
                }
                const built = window.ADIAStateMachineRuntime.buildSemanticModel(
                  PROJECT_DATA.model
                );
                if (!built.ir) {
                  throw new Error(
                    built.diagnostics
                      .map(diagnostic => diagnostic.code + ": " + diagnostic.message)
                      .join("; ")
                  );
                }
                semanticRuntime = window.ADIAStateMachineRuntime.createRuntime(
                  built.ir
                );
                applySemanticFrame(
                  window.ADIAStateMachineRuntime.initializeRuntime(
                    semanticRuntime
                  )
                );
              } catch (error) {
                simRunning = false;
                logEvent(
                  "Init Error",
                  error instanceof Error ? error.message : String(error)
                );
                updateUi();
                return;
              }

              const intervalTime = Math.max(100, PROJECT_DATA.tickMs || 100);
              simInterval = setInterval(() => {
                const container = document.getElementById("sim-event-log");
                if (!container) {
                  clearInterval(simInterval);
                  simInterval = null;
                  if (window.ADIA_SIM) delete window.ADIA_SIM;
                  return;
                }
                if (simRunning) {
                  stepSimulation();
                }
              }, intervalTime);

              updateUi();
              logEvent("System Init", "State machine initialized");
            }

            window.ADIA_SIM = {
              toggleSimRunning() {
                simRunning = !simRunning;
                const btn = document.getElementById("sim-btn-power");
                if (btn) {
                  btn.textContent = simRunning ? "PAUSE" : "RUN";
                  if (simRunning) btn.classList.remove("active");
                  else btn.classList.add("active");
                }
                logEvent(simRunning ? "Sim Resumed" : "Sim Paused");
              },
              step() {
                stepSimulation();
                logEvent("Sim Step", "Manual tick step executed");
              },
              reset() {
                if (!semanticRuntime) return;
                simTime = 0;
                applySemanticFrame(
                  window.ADIAStateMachineRuntime.resetRuntime(semanticRuntime)
                );
                updateUi();
                logEvent("Sim Reset", "All states and variables reset to default");
              },
              clearLog() {
                const el = document.getElementById("sim-event-log");
                if (el) el.textContent = "";
              },
              toggleClick(id) {
                const c = PROJECT_DATA.hmiComponents.find(x => x.id === id);
                if (!c || !c.variableId) return;
                const currentVal = !!getVarValById(c.variableId);
                updateVariableById(c.variableId, !currentVal);
              },
              buttonPress(id, isDown) {
                const c = PROJECT_DATA.hmiComponents.find(x => x.id === id);
                if (!c) return;
                if (c.pressVariableId) {
                  updateVariableById(c.pressVariableId, isDown);
                } else if (c.variableId && isDown) {
                  const currentVal = getVarValById(c.variableId);
                  if (varTypes[c.name] === "bool") {
                    updateVariableById(c.variableId, !currentVal);
                  } else {
                    updateVariableById(c.variableId, 1);
                  }
                }
              },
              sliderChange(id, val) {
                const c = PROJECT_DATA.hmiComponents.find(x => x.id === id);
                if (!c || !c.variableId) return;
                updateVariableById(c.variableId, val);
              },
              inputChange(id, val) {
                const c = PROJECT_DATA.hmiComponents.find(x => x.id === id);
                if (!c || !c.variableId) return;
                updateVariableById(c.variableId, val);
              },
              rotateKnob(id, dir) {
                const c = PROJECT_DATA.hmiComponents.find(x => x.id === id);
                if (!c || !c.variableId) return;
                const v = PROJECT_DATA.variables.find(x => x.id === c.variableId);
                if (!v) return;
                const isHybrid = Array.isArray(c.encoderValues) && c.encoderValues.length > 0;
                const encoderValues = c.encoderValues || [];

                if (c.type === "encoder" && isHybrid) {
                  const idx = encoderValues.findIndex(x => String(x) === String(varValues[v.name]));
                  const currentIndex = idx !== -1 ? idx : 0;
                  const nextIndex = (currentIndex + dir + encoderValues.length) % encoderValues.length;
                  updateVariableById(c.variableId, encoderValues[nextIndex]);
                } else if (c.type === "hybrid-rotary") {
                  const values = c.hybridValues || [];
                  const idx = values.findIndex(x => String(x) === String(varValues[v.name]));
                  const currentIndex = idx !== -1 ? idx : 0;
                  const nextIndex = (currentIndex + dir + values.length) % values.length;
                  updateVariableById(c.variableId, values[nextIndex]);
                } else {
                  const curVal = Number(varValues[v.name]) || 0;
                  const step = v.name.toLowerCase().includes("temp") ? 5 : 1;
                  const newVal = curVal + dir * step;
                  const clampedVal = Math.max(c.min ?? 0, Math.min(c.max ?? 100, newVal));
                  updateVariableById(c.variableId, clampedVal);
                }
              },
              knobPress(id, isDown) {
                const c = PROJECT_DATA.hmiComponents.find(x => x.id === id);
                if (!c || !c.pressVariableId) return;
                const pressVarId = c.pressVariableId;
                const lpRing = document.getElementById("knob-lp-" + c.id);
                if (isDown) {
                  updateVariableById(pressVarId, true);
                  if (lpRing) {
                    lpRing.style.opacity = "1";
                    lpRing.style.transform = "scale(1.1)";
                  }
                  lpTimers[id] = setTimeout(() => {
                    logEvent("Long Press", c.name + " held for 1.5s");
                    if (lpRing) lpRing.style.borderColor = "#22c55e";
                  }, 1500);
                } else {
                  updateVariableById(pressVarId, false);
                  if (lpRing) {
                    lpRing.style.opacity = "0";
                    lpRing.style.transform = "scale(0.9)";
                    lpRing.style.borderColor = "#f97316";
                  }
                  if (lpTimers[id]) {
                    clearTimeout(lpTimers[id]);
                    delete lpTimers[id];
                  }
                }
              },
              modeIconClick(id) {
                const c = PROJECT_DATA.hmiComponents.find(x => x.id === id);
                if (!c || !c.variableId) return;
                updateVariableById(c.variableId, c.targetValue);
              },
              modeSelectorClick(id, idx) {
                const c = PROJECT_DATA.hmiComponents.find(x => x.id === id);
                if (!c || !c.variableId) return;
                updateVariableById(c.variableId, idx);
              }
            };

            initializeSimulation();
          })();
        </script>
      `;
    }

    html += `
      <!-- High-Resolution Interactive Diagram Modal Viewer -->
      <div id="diagram-modal" onclick="closeDiagramModal()">
        <div id="diagram-modal-header" onclick="event.stopPropagation()">
          <div id="diagram-modal-title" style="font-weight:bold; font-size:14px; color:#f97316;">📊 SysML Diagram Viewer</div>
          <div>
            <button class="modal-ctrl-btn" onclick="zoomDiagram(1.25)">➕ Zoom In</button>
            <button class="modal-ctrl-btn" onclick="zoomDiagram(0.8)">➖ Zoom Out</button>
            <button class="modal-ctrl-btn" onclick="resetDiagramZoom()">↺ Reset 100%</button>
            <button class="modal-ctrl-btn" onclick="openDiagramInNewTab()">⧉ Open in New Tab</button>
            <button class="modal-ctrl-btn" style="background:#dc2626;border-color:#dc2626;" onclick="closeDiagramModal()">✕ Close</button>
          </div>
        </div>
        <div id="diagram-modal-body" onclick="event.stopPropagation()">
          <div id="diagram-modal-content" style="transform-origin: center center; transition: transform 0.08s ease-out; width: 100%; display: flex; justify-content: center; align-items: center;"></div>
        </div>
      </div>
      <script>
        let currentZoom = 1;
        let currentSvgHtml = '';
        let isPanning = false;
        let startX = 0, startY = 0;
        let panX = 0, panY = 0;

        function openDiagramModal(diagId, title) {
          const container = document.getElementById(diagId);
          if (!container) return;
          const svgEl = container.querySelector('svg');
          if (!svgEl) return;

          currentSvgHtml = svgEl.outerHTML;
          const modal = document.getElementById('diagram-modal');
          const modalTitle = document.getElementById('diagram-modal-title');
          const modalContent = document.getElementById('diagram-modal-content');
          
          if (modalTitle) modalTitle.textContent = '📊 ' + (title || 'SysML Diagram Viewer');
          if (modalContent) {
            modalContent.replaceChildren(svgEl.cloneNode(true));
            const newSvg = modalContent.querySelector('svg');
            if (newSvg) {
              newSvg.style.maxWidth = 'none';
              newSvg.style.width = '100%';
              newSvg.style.height = 'auto';
              newSvg.style.display = 'block';
              newSvg.style.background = '#ffffff';
              newSvg.style.borderRadius = '8px';
              newSvg.style.padding = '20px';
              newSvg.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
            }
          }
          currentZoom = 1;
          panX = 0;
          panY = 0;
          updateModalTransform();
          if (modal) modal.classList.add('active');
        }

        function closeDiagramModal() {
          const modal = document.getElementById('diagram-modal');
          if (modal) modal.classList.remove('active');
        }

        function zoomDiagram(factor) {
          currentZoom = Math.max(0.2, Math.min(5, currentZoom * factor));
          updateModalTransform();
        }

        function resetDiagramZoom() {
          currentZoom = 1;
          panX = 0;
          panY = 0;
          updateModalTransform();
        }

        function updateModalTransform() {
          const content = document.getElementById('diagram-modal-content');
          if (content) {
            content.style.transform = "translate(" + panX + "px, " + panY + "px) scale(" + currentZoom + ")";
          }
        }

        function openDiagramInNewTab() {
          if (!currentSvgHtml) return;
          const blob = new Blob([currentSvgHtml], { type: 'image/svg+xml' });
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank');
        }

        // Modal Pan & Mouse Wheel Zoom
        document.addEventListener('DOMContentLoaded', () => {
          const modalBody = document.getElementById('diagram-modal-body');
          if (modalBody) {
            modalBody.addEventListener('mousedown', (e) => {
              isPanning = true;
              startX = e.clientX - panX;
              startY = e.clientY - panY;
            });
            window.addEventListener('mousemove', (e) => {
              if (!isPanning) return;
              panX = e.clientX - startX;
              panY = e.clientY - startY;
              updateModalTransform();
            });
            window.addEventListener('mouseup', () => {
              isPanning = false;
            });
            modalBody.addEventListener('wheel', (e) => {
              e.preventDefault();
              const factor = e.deltaY < 0 ? 1.15 : 0.85;
              zoomDiagram(factor);
            }, { passive: false });
          }
        });

        window.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') closeDiagramModal();
        });
      </script>
      ${generateDiagramScript(reportHierarchy)}
    </body></html>`;

    setGlobalReportData({ html, projectName });
    setShowGlobalReportPreview(true);
    setShowReportDialog(false);
    addError('info', 'Report preview ready');
  }, [blocks, parts, connectors, relationships, states, transitions, junctions, hmiComponents, variables, addError, setShowReportDialog, layers, tickMs, safetyMode, canonicalSysmlRepository]);

  // KEYBOARD SHORTCUTS
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (diagramMode === 'entropy') {
        // Let EntropyWorkspace handle all shortcuts in OPM mode
        return;
      }

      // Prevent shortcuts when typing in inputs

      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if (isInput) {
        if (e.ctrlKey && (e.key === 's' || e.key === 'S')) {
          e.preventDefault();
          saveUnifiedProject(e.shiftKey);
        }
        return;
      }

      // Space + C combo: Collapse/Expand properties, tree, variables, and scope together
      if ((e.key === 'c' || e.key === 'C') && isSpacePressed.current) {
        e.preventDefault();
        spaceComboUsed.current = true;
        const allCollapsed = isHierarchyCollapsed && isVariablesCollapsed && isPropertiesCollapsed && isScopeCollapsed;
        if (allCollapsed) {
          setIsHierarchyCollapsed(false);
          setIsVariablesCollapsed(false);
          setIsPropertiesCollapsed(false);
          setIsScopeCollapsed(false);
        } else {
          setIsHierarchyCollapsed(true);
          setIsVariablesCollapsed(true);
          setIsPropertiesCollapsed(true);
          setIsScopeCollapsed(true);
        }
      }

      // Shift + C: Toggle Connect Mode
      if (e.shiftKey && (e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.metaKey && !e.altKey && !isSpacePressed.current) {
        e.preventDefault();
        if (diagramMode === 'ibd') {
          setIsCreatingConnector(prev => {
            const next = !prev;
            if (!next) setConnectorSource(null);
            addError('info', next ? 'Connect mode activated' : 'Connect mode canceled');
            return next;
          });
        } else {
          setIsCreatingTransition(prev => {
            const next = !prev;
            if (!next) setTransitionSourceId(null);
            addError('info', next ? 'Connect mode activated' : 'Connect mode canceled');
            return next;
          });
        }
      }

      // Shift + X: Create X-Bridges block at viewport center
      if (e.shiftKey && (e.key === 'x' || e.key === 'X') && !e.ctrlKey && !e.metaKey && !e.altKey && !isSpacePressed.current) {
        e.preventDefault();
        const canvasW = canvasRef.current?.clientWidth || 800;
        const canvasH = canvasRef.current?.clientHeight || 600;
        const worldX = ((canvasW / 2) / uiZoom - view.offsetX) / view.scale;
        const worldY = ((canvasH / 2) / uiZoom - view.offsetY) / view.scale;
        createXBridgesState(worldX, worldY);
      }

      // Run Simulation (Ctrl + R)
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyR') {
        e.preventDefault();
        startSimulation();
      }

      // Pause Simulation (Ctrl + P)
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyP') {
        e.preventDefault();
        pauseSimulation();
      }

      // Stop Simulation (Ctrl + O)
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyO') {
        e.preventDefault();
        resetSimulation();
      }

      if (e.code === 'Space' && !e.repeat) {
        isSpacePressed.current = true;
        document.body.style.cursor = 'grab';
      }

      if (e.key === 'ArrowLeft') setView(prev => ({ ...prev, offsetX: prev.offsetX + 20 / prev.scale }));
      if (e.key === 'ArrowRight') setView(prev => ({ ...prev, offsetX: prev.offsetX - 20 / prev.scale }));
      if (e.key === 'ArrowUp') setView(prev => ({ ...prev, offsetY: prev.offsetY + 20 / prev.scale }));
      if (e.key === 'ArrowDown') setView(prev => ({ ...prev, offsetY: prev.offsetY - 20 / prev.scale }));

      if (e.ctrlKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          setUiZoom(prev => Math.min(3.0, prev + 0.1));
        }
        if (e.key === '-') {
          e.preventDefault();
          setUiZoom(prev => Math.max(0.4, prev - 0.1));
        }
        if (e.key === '0') {
          e.preventDefault();
          setUiZoom(1.0);
        }
      }

      // Copy / Paste / Cut / Select All / Undo / Redo / Save
      if (e.ctrlKey) {
        if (e.key === 'c' || e.key === 'C') {
          // Copy
          const clipData = createStateMachineClipboard(
            selectedIds,
            states,
            junctions,
            transitions,
            layers,
            blocks,
            relationships,
            parts,
            connectors,
            interfaceRealizations
          );
          setClipboard(clipData);
          addError('info', `Copied ${selectedIds.length} items`);
        }
        if (e.key === 'v' || e.key === 'V') {
          // Paste
          if (clipboard) {
            addToHistory();
            const result = pasteStateMachineClipboard(
              clipboard,
              currentLayerId,
              states,
              junctions,
              transitions,
              layers,
              blocks,
              relationships,
              parts,
              connectors,
              interfaceRealizations
            );

            setStates(prev => [...prev, ...result.newStates]);
            setJunctions(prev => [...prev, ...result.newJunctions]);
            setTransitions(prev => [...prev, ...result.newTransitions]);
            setLayers(result.updatedLayers);
            setBlocks(prev => [...prev, ...result.newBlocks]);
            setRelationships(prev => [...prev, ...result.newRelationships]);
            setParts(prev => [...prev, ...result.newParts]);
            setConnectors(prev => [...prev, ...result.newConnectors]);
            setInterfaceRealizations(prev => [...prev, ...result.newInterfaceRealizations]);

            setSelectedIds(result.pastedTopLevelIds);
            addError('info', 'Pasted items');
          }
        }
        if (e.key === 'x' || e.key === 'X') {
          // Cut
          addToHistory();
          const clipData = createStateMachineClipboard(
            selectedIds,
            states,
            junctions,
            transitions,
            layers,
            blocks,
            relationships,
            parts,
            connectors,
            interfaceRealizations
          );
          setClipboard(clipData);
          // Delete logic
          const selectedStateIds = selectedIds.filter(id => states.some(s => s.id === id));
          const otherSelectedIds = selectedIds.filter(id => !states.some(s => s.id === id));
          executeDeleteState(selectedStateIds, otherSelectedIds);
          addError('info', 'Cut items');
        }
        if (e.key === 'a' || e.key === 'A') {
          e.preventDefault();
          const allIds = diagramMode === 'statemachine'
            ? [...currentStates.map(s => s.id), ...currentJunctions.map(j => j.id), ...currentTransitions.map(t => t.id)]
            : (diagramMode === 'bdd' || diagramMode === 'requirements')
              ? [...blocks.map(b => b.id), ...relationships.map(r => r.id)]
              : [...parts.map(p => p.id), ...connectors.map(c => c.id)];
          setSelectedIds(allIds);
        }
        if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault();
          undo();
        }
        if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault();
          redo();
        }
        if (e.key === 's' || e.key === 'S') {
          e.preventDefault();
          saveUnifiedProject(e.shiftKey);
        }
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && !xBridgesStateId) {
        if (selectedIds.length > 0) {
          const selectedStateIds = selectedIds.filter(id => states.some(s => s.id === id));
          const otherSelectedIds = selectedIds.filter(id => !states.some(s => s.id === id));

          if (selectedStateIds.length > 0) {
            deleteStates(selectedStateIds, otherSelectedIds);
          } else if (diagramMode === 'requirements' || diagramMode === 'bdd') {
            removeFromDiagram(otherSelectedIds);
          } else {
            deleteNonStateElements(otherSelectedIds);
          }
        }
      }

      if (e.key === 'Escape') {
        setIsCreatingTransition(false);
        setTransitionSourceId(null);
        setSelectedIds([]);
      }
    };

    const handleKeyUp = (e: globalThis.KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpacePressed.current = false;
        document.body.style.cursor = 'default';
        spaceComboUsed.current = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedIds, view, deleteState, deleteStates, deleteNonStateElements, executeDeleteState, deleteJunction, deleteTransition, deleteBlock, removeFromDiagram, deleteRelationship, deletePart, deleteConnector, deleteInterfaceRealization, states, junctions, transitions, blocks, relationships, parts, connectors, interfaceRealizations, clipboard, currentLayerId, currentStates, currentJunctions, currentTransitions, addToHistory, undo, redo, addError, handleExportProject, diagramMode, startSimulation, pauseSimulation, resetSimulation, isHierarchyCollapsed, isVariablesCollapsed, isPropertiesCollapsed, isScopeCollapsed]);

  // CODE GENERATION (FULLY FUNCTIONAL WITH USER FEEDBACK)
  const generateCode = useCallback(async () => {
    // First validate syntax of actions and conditions
    if (!validateModel()) {
      return;
    }

    setIsGenerating(true);

    // Run AI check before generation to ensure MISRA/Syntax compliance
    await validateWithAI();

    try {
      const chart = { tickMs, states, junctions, transitions, variables, layers, safetyMode, hilConfig };
      // REQ-ENGINE-003: TS template literals ensure safe string concatenation
      let { files, errors: validationErrors, warnings } = generateMISRACCode(chart);

      if (validationErrors.length > 0) {
        setCodegenErrors(validationErrors);
        setCodegenWarnings([]); // Clear previous warnings
        validationErrors.forEach(err => addError(err.type, err.message, err.source, err.elementId));
        addError('error', `Code generation blocked: ${validationErrors.length} errors found. Fix errors before generating.`);
        setShowCodegenDialog(true);
        setIsGenerating(false);
        return;
      }

      // AI CODE FIX & VALIDATION
      setIsAiValidating(true);
      try {
        let validationPassed = true;
        const auditErrors: string[] = [];

        // Check for dangling targets (#error)
        files.forEach(f => {
          if (f.content.includes('#error')) {
            validationPassed = false;
            auditErrors.push(`Dangling transition target in ${f.name}`);
          }
        });

        // Validate model constraints using validateModel
        if (!validateModel()) {
          validationPassed = false;
          auditErrors.push('Model syntax validation failed');
        }

        if (validationPassed) {
          files = files.map(f => {
            const timestamp = new Date().toISOString();
            const message = `[STRUCTURAL-CHECK] Passed generator structural validation (no dangling targets, model syntax OK) | ${timestamp}`;
            const header = f.name.endsWith('.md')
              ? `<!-- ${message} -->\n`
              : `/* ${message} */\n`;
            return {
              ...f,
              content: header + f.content + (f.content.endsWith('\n') ? '' : '\n')
            };
          });
          addError('info', 'Generated code passed structural validation checks.', 'Code Generator');
        } else {
          addError('error', `AI Validation failed: ${auditErrors.join('. ')}`, 'AI Assistant');
          setCodegenErrors(auditErrors.map(msg => ({
            id: uuidv4(),
            type: 'error',
            message: msg,
            timestamp: new Date(),
            source: 'AI Auditor'
          })));
          setShowCodegenDialog(true);
          setIsGenerating(false);
          return;
        }
      } catch (e: any) {
        console.warn('AI Fix failed', e);
        addError('error', `AI Fix/Validation error: ${e.message}`, 'AI Assistant');
      } finally {
        setIsAiValidating(false);
      }

      // REQ-ENGINE-001: Validate output buffers before "writing"
      files.forEach(f => {
        const openComments = (f.content.match(/\/\*/g) || []).length;
        const closeComments = (f.content.match(/\*\//g) || []).length;
        if (openComments !== closeComments) throw new Error(`Unbalanced comments in ${f.name}`);
      });

      // REQ-ENGINE-004: Maintain generation log with checksums
      const checksums = files.map(f => `${f.name}:${calculateChecksum(f.content)}`).join(', ');
      const logEntry = `[${new Date().toLocaleTimeString()}] Generated: ${checksums}`;
      setGenerationLog(prev => [logEntry, ...prev]);

      setGeneratedFiles(files);
      setCodegenErrors([]);
      setCodegenWarnings(warnings);
      setShowCodegenDialog(true);
      addError('info', `Embedded C99 code generated successfully.`);
    } catch (error) {
      console.error('Code generation failed:', error);
      addError('error', `Code generation failed: ${error instanceof Error ? error.message : 'Unknown error'}. This might be an internal issue.`);
    } finally {
      setIsGenerating(false);
    }
  }, [tickMs, states, junctions, transitions, variables, layers, safetyMode, hilConfig, addError, validateModel, calculateChecksum, validateWithAI]);

  const renderStates = useCallback((): React.ReactNode => {
    return currentStates.map(state => {
      const isSelected = selectedIds.includes(state.id);
      const hasSubLayer = states.some(s => s.parentId === state.id); // REQ-HSM-012
      return (
        <g
          key={state.id}
          transform={`translate(${state.x}, ${state.y})`}
          onMouseDown={(e) => handleStateMouseDown(e, state.id)}
          onDoubleClick={(e) => handleStateDoubleClick(e, state.id)}
          style={{ cursor: isCreatingTransition ? 'crosshair' : 'move' }}
        >
          {isSelected && ['nw', 'ne', 'sw', 'se'].map(h => {
            const hx = h.includes('e') ? state.width : 0;
            const hy = h.includes('s') ? state.height : 0;
            return (
              <rect
                key={h}
                x={hx - 4} y={hy - 4} width={8} height={8}
                fill="#f97316" stroke="#0a0a0a" strokeWidth={1}
                style={{ cursor: `${h}-resize` }}
                onMouseDown={(e) => handleResizeMouseDown(e, h, state.id)}
              />
            );
          })}

          {isSelected && (
            <rect
              x={-4}
              y={-4}
              width={state.width + 8}
              height={state.height + 8}
              rx={8}
              fill="none"
              stroke="#f97316"
              strokeWidth={2}
              strokeDasharray="5,5"
            />
          )}

          {state.isActive && (
            <rect
              x={-6}
              y={-6}
              width={state.width + 12}
              height={state.height + 12}
              rx={10}
              fill="none"
              stroke="#4ade80"
              strokeWidth={3}
              opacity={0.8}
            >
              <animate
                attributeName="opacity"
                values="0.8;0.4;0.8"
                dur="1s"
                repeatCount="indefinite"
              />
            </rect>
          )}

          <rect
            width={state.width}
            height={state.height}
            rx={8}
            fill={state.isActive ? 'var(--sysml-state-active-fill)' : 'var(--sysml-state-fill)'}
            stroke={isSelected ? state.color : 'var(--sysml-state-stroke)'}
            strokeWidth={isSelected ? 2 : 1}
          />

          {/* Autostart Indicator */}
          {state.autostart && (
            <g transform="translate(10, -14)">
              <path d="M0 0 L0 10" stroke="#4ade80" strokeWidth="2" markerEnd="url(#arrowhead-start)" />
              <circle cx={0} cy={0} r={3} fill="#4ade80" />
              <path d="M-3 8 L0 12 L3 8" fill="none" stroke="#4ade80" strokeWidth="2" />
            </g>
          )}

          <rect
            width={state.width}
            height={24}
            rx={8}
            fill={state.color}
            opacity={0.3}
          />

          <text
            x={state.width / 2}
            y={17}
            textAnchor="middle"
            fill={state.color}
            fontSize={12}
            fontWeight="bold"
            fontFamily="Inter, sans-serif"
          >
            {state.name}
          </text>

          {/* REQ-HSM-012: Composite State Indicator */}
          {hasSubLayer && (
            <g transform={`translate(${state.width - 25}, ${state.height - 10})`}>
              <circle cx="0" cy="0" r="4" fill="none" stroke="#888" strokeWidth="1" />
              <circle cx="6" cy="0" r="4" fill="none" stroke="#888" strokeWidth="1" />
              <line x1="-4" y1="0" x2="10" y2="0" stroke="#888" strokeWidth="1" />
            </g>
          )}

          <text
            x={8}
            y={17}
            textAnchor="start"
            fill="var(--sysml-state-subtext)"
            fontSize={9}
            fontFamily="Inter, sans-serif"
          >
            p={state.priority}
          </text>

          {state.isParallel && (
            <circle
              cx={state.width - 12}
              cy={12}
              r={5}
              fill="#6cc9a8"
              stroke="#0a0a0a"
              strokeWidth={1}
            />
          )}

          {state.children.length > 0 && (
            <circle
              cx={state.width - 12}
              cy={state.height - 12}
              r={5}
              fill={state.color}
            />
          )}

          {state.regionId && (
            <text
              x={state.width - 8}
              y={state.height - 8}
              textAnchor="end"
              fill="var(--sysml-state-subtext)"
              fontSize={8}
              fontFamily="Inter, sans-serif"
            >
              {state.regionId}
            </text>
          )}

          {/* Graphical Representation of Internal Transitions */}
          {state.internalTransitions && (
            <g transform={`translate(8, ${state.height - 15 - (state.internalTransitions.split('\n').length * 10)})`}>
              <line x1={-8} y1={-5} x2={state.width - 8} y2={-5} stroke="var(--sysml-block-divider)" strokeWidth={1} />
              {state.internalTransitions.split('\n').slice(0, 3).map((line, i) => (
                <text key={i} y={i * 10} fill="var(--sysml-state-subtext)" fontSize={9} fontFamily="monospace">{line.length > 25 ? line.slice(0, 25) + '...' : line}</text>
              ))}
            </g>
          )}

          {state.entry && (
            <text x={8} y={42} fill="#888" fontSize={9} fontFamily="monospace">
              entry: {state.entry.slice(0, 20)}{state.entry.length > 20 ? '...' : ''}
            </text>
          )}

          {state.during && (
            <text x={8} y={56} fill="#888" fontSize={9} fontFamily="monospace">
              during: {state.during.slice(0, 18)}{state.during.length > 18 ? '...' : ''}
            </text>
          )}

          {state.exit && (
            <text x={8} y={70} fill="#888" fontSize={9} fontFamily="monospace">
              exit: {state.exit.slice(0, 20)}{state.exit.length > 20 ? '...' : ''}
            </text>
          )}
        </g>
      );
    });
  }, [currentStates, selectedIds, isCreatingTransition, handleStateMouseDown, handleStateDoubleClick, handleResizeMouseDown]);

  const renderJunctions = useCallback((): React.ReactNode => {
    return currentJunctions.map(junction => {
      const isSelected = selectedIds.includes(junction.id);
      return (
        <g
          key={junction.id}
          transform={`translate(${junction.x}, ${junction.y})`}
          onMouseDown={(e) => handleJunctionMouseDown(e, junction.id)}
          style={{ cursor: isCreatingTransition ? 'crosshair' : 'move' }}
        >
          {isSelected && (
            <circle
              cx={0}
              cy={0}
              r={12}
              fill="none"
              stroke="#f97316"
              strokeWidth={2}
              strokeDasharray="5,5"
            />
          )}

          <circle
            cx={0}
            cy={0}
            r={8}
            fill={isSelected ? '#ff9900' : '#666'}
            stroke="#0a0a0a"
            strokeWidth={1.5}
            cursor="move"
          />

          {junction.type === 'history' && <text x={0} y={4} textAnchor="middle" fill="#0a0a0a" fontSize={10} fontWeight="bold">H</text>}
          {junction.type === 'deep-history' && <text x={0} y={4} textAnchor="middle" fill="#0a0a0a" fontSize={10} fontWeight="bold">H*</text>}

          <text
            x={0}
            y={-15}
            textAnchor="middle"
            fill={junction.color}
            fontSize={10}
            fontFamily="Inter, sans-serif"
            fontWeight="bold"
          >
            {junction.name}
          </text>
        </g>
      );
    });
  }, [currentJunctions, selectedIds, isCreatingTransition, handleJunctionMouseDown]);

  const renderTransitions = useCallback((): React.ReactNode => {
    return currentTransitions.map(transition => {
      const sourceState = states.find(s => s.id === transition.sourceId);
      const sourceJunction = junctions.find(j => j.id === transition.sourceId);
      const targetState = states.find(s => s.id === transition.targetId);
      const targetJunction = junctions.find(j => j.id === transition.targetId);

      if ((!sourceState && !sourceJunction) || (!targetState && !targetJunction)) return null;

      let sp: Point, tp: Point;
      if (sourceState && targetState) {
        if (sourceState.id === targetState.id) {
          sp = { x: sourceState.x + sourceState.width / 2 - 15, y: sourceState.y };
          tp = { x: sourceState.x + sourceState.width / 2 + 15, y: sourceState.y };
        } else {
          sp = getEdgePoint(sourceState, targetState);
          tp = getEdgePoint(targetState, sourceState);
        }
      } else if (sourceState && targetJunction) {
        sp = getEdgePoint(sourceState, { x: targetJunction.x - 8, y: targetJunction.y - 8, width: 16, height: 16 });
        tp = getJunctionEdgePoint(targetJunction, { x: sourceState.x, y: sourceState.y });
      } else if (sourceJunction && targetState) {
        sp = getJunctionEdgePoint(sourceJunction, { x: targetState.x, y: targetState.y });
        tp = getEdgePoint(targetState, { x: sourceJunction.x - 8, y: sourceJunction.y - 8, width: 16, height: 16 });
      } else if (sourceJunction && targetJunction) {
        sp = getJunctionEdgePoint(sourceJunction, targetJunction);
        tp = getJunctionEdgePoint(targetJunction, sourceJunction);
      } else {
        return null;
      }

      const isSelfLoop = !!(sourceState && targetState && sourceState.id === targetState.id);
      const cp = transition.controlPoint || getDefaultControlPoint(sp, tp, isSelfLoop);

      const path = `M ${sp.x} ${sp.y} Q ${cp.x} ${cp.y} ${tp.x} ${tp.y}`;
      const isSelected = selectedIds.includes(transition.id);
      const isHovered = hoveredTransitionId === transition.id;
      const isFired = !!firedTransitions[transition.id];

      // Scale stroke width and hit areas with zoom level
      const strokeWidth = isSelected ? 3 / view.scale : 2 / view.scale;
      const hitAreaWidth = Math.max(16, 20 / view.scale);
      const handleRadius = Math.max(6, 8 / view.scale);
      const handleStrokeWidth = Math.max(1.5, 2 / view.scale);

      // Build label
      const parts: string[] = [];
      if (transition.isInternal) parts.push(`«local»`);
      if (transition.type === 'condition') parts.push(`[${transition.condition || 'true'}]`);
      else if (transition.type === 'after') parts.push(`after(${transition.afterTicks || '?'})`);
      else if (transition.type === 'and') parts.push(`[${transition.condition}] && after(${transition.afterTicks})`);
      else if (transition.type === 'or') parts.push(`[${transition.condition}] || after(${transition.afterTicks})`);

      if (transition.action) parts.push(`/${transition.action.substring(0, 15)}${transition.action.length > 15 ? '...' : ''}`);
      const labelText = parts.length > 0 ? parts.join(' ') : 'default';
      const priorityText = `(${transition.order})`;

      return (
        <g key={transition.id}>
          {/* Hit area - enlarged for free grabbing & smooth dragging */}
          <path
            d={path}
            fill="none"
            stroke="transparent"
            strokeWidth={hitAreaWidth}
            onMouseDown={(e: MouseEvent<SVGPathElement>) => {
              startTransitionDrag(transition.id, e, 'curve');
            }}
            onDoubleClick={(e: MouseEvent<SVGPathElement>) => {
              e.stopPropagation();
              resetTransitionCurve(transition.id);
            }}
            onMouseEnter={() => setHoveredTransitionId(transition.id)}
            onMouseLeave={() => setHoveredTransitionId(prev => prev === transition.id ? null : prev)}
            style={{ cursor: 'grab' }}
          />

          {/* Main path - scaled for zoom with responsive highlight */}
          <path
            d={path}
            fill="none"
            stroke={isFired ? '#ffffff' : (isSelected ? '#f97316' : (isHovered ? '#fb923c' : '#666'))}
            strokeWidth={isFired ? strokeWidth * 2 : (isSelected || isHovered ? strokeWidth * 1.3 : strokeWidth)}
            strokeDasharray={transition.condition === 'true' && !transition.afterTicks ? '5,3' : undefined}
            style={{ transition: 'stroke 0.1s, stroke-width 0.1s', pointerEvents: 'none' }}
          />

          {/* Arrowhead - scaled with transform */}
          <path
            d={`M ${tp.x} ${tp.y} L ${tp.x - 10} ${tp.y - 4} L ${tp.x - 10} ${tp.y + 4} Z`}
            fill={isSelected ? '#f97316' : (isHovered ? '#fb923c' : '#666')}
            transform={`rotate(${Math.atan2(tp.y - sp.y, tp.x - sp.x) * 180 / Math.PI}, ${tp.x}, ${tp.y})`}
            style={{ transition: 'fill 0.1s', pointerEvents: 'none' }}
          />

          {/* Transition label - non-blocking pointer events */}
          <foreignObject
            x={cp.x - 75}
            y={cp.y - 15}
            width="150"
            height="30"
            style={{ pointerEvents: 'none' }}
          >
            {(() => {
              const hasWarning = errors.some(e => e.elementId === transition.id && e.source === 'Validation' && e.type === 'warning');
              const hasError = errors.some(e => e.elementId === transition.id && e.source === 'Validation' && e.type === 'error');
              const borderColor = hasError ? 'border-red-500/50 hover:border-red-500' : (hasWarning ? 'border-amber-500/50 hover:border-amber-500' : 'border-[#333]');
              const textColor = isSelected ? '#f97316' : (hasError ? '#f87171' : (hasWarning ? '#fbbf24' : '#a0a0a0'));
              return (
                <div className={`px-2 py-1 bg-[#0a0a0a] border ${borderColor} rounded text-[10px] font-mono text-center flex items-center justify-center gap-1`}
                  style={{ color: textColor, pointerEvents: 'none' }}>
                  {hasError && <span title="Error on transition" className="text-red-500 animate-pulse font-sans">🔴</span>}
                  {!hasError && hasWarning && <span title="Warning: Unguarded & untimed transition" className="text-amber-500 animate-pulse font-sans">⚠️</span>}
                  <span className="text-amber-400">{priorityText}</span> {labelText}
                </div>
              );
            })()}
          </foreignObject>

          {/* Control point handle (when selected or hovered) */}
          {(isSelected || isHovered) && (
            <g>
              <circle
                cx={cp.x}
                cy={cp.y}
                r={handleRadius * 1.6}
                fill="none"
                stroke="#f97316"
                strokeWidth={1 / view.scale}
                opacity={0.4}
                style={{ pointerEvents: 'none' }}
              />
              <circle
                cx={cp.x}
                cy={cp.y}
                r={handleRadius}
                fill="#f97316"
                stroke="#0a0a0a"
                strokeWidth={handleStrokeWidth}
                cursor="grab"
                onMouseDown={(e: MouseEvent<SVGCircleElement>) => {
                  startTransitionDrag(transition.id, e, 'handle');
                }}
                onDoubleClick={(e: MouseEvent<SVGCircleElement>) => {
                  e.stopPropagation();
                  resetTransitionCurve(transition.id);
                }}
                onMouseEnter={() => setHoveredTransitionId(transition.id)}
              />
            </g>
          )}
        </g>
      );
    });
  }, [currentTransitions, states, junctions, view, selectedIds, hoveredTransitionId, firedTransitions, startTransitionDrag, resetTransitionCurve, errors]);

  const renderBlocks = useCallback((): React.ReactNode => {
    // In BDD mode, always treat as root level (ignore currentLayerId from IBD navigation)
    const effectiveLayerId = diagramMode === 'bdd' ? 'root' : currentLayerId;
    const targetBlocks = culledDiagram ? culledDiagram.visibleBlocks : blocks;
    const isDegraded = Boolean(culledDiagram?.isDegradedMode && view.scale < 0.7);

    return targetBlocks.map(block => {
      if (diagramMode === 'ibd') {
        if (block.id === currentLayerId) {
          const frame = { x: block.ibdX ?? 50, y: block.ibdY ?? 50, w: block.ibdWidth ?? 1200, h: block.ibdHeight ?? 800 };
          const isSelected = selectedIds.includes(block.id);
          return (
            <g key={block.id}>
              <rect x={frame.x} y={frame.y} width={frame.w} height={frame.h} fill="none" stroke="#444" strokeWidth={2} strokeDasharray="10,5"
                onMouseDown={(e) => handleBlockMouseDown(e, block.id)}
                onClick={(e) => { e.stopPropagation(); setSelectedIds([block.id]); }}
                style={{ cursor: 'move', pointerEvents: 'all' }}
              />
              <text x={frame.x + 5} y={frame.y + 15} fill="#666" fontSize={12} fontWeight="bold">ibd [Block] {block.name}</text>

              {isSelected && ['nw', 'ne', 'sw', 'se'].map(h => {
                const hx = h.includes('e') ? frame.x + frame.w : frame.x;
                const hy = h.includes('s') ? frame.y + frame.h : frame.y;
                return (
                  <rect
                    key={h}
                    x={hx - 4} y={hy - 4} width={8} height={8}
                    fill="#f97316" stroke="#0a0a0a" strokeWidth={1}
                    style={{ cursor: `${h}-resize` }}
                    onMouseDown={(e) => handleResizeMouseDown(e, h, block.id)}
                  />
                );
              })}

              {block.ports.map((port, i) => {
                let x = 0, y = 0;
                let isLeft = false;
                if (port.side && port.offset != null) {
                  if (port.side === 'top') { x = frame.x + frame.w * port.offset; y = frame.y; }
                  else if (port.side === 'bottom') { x = frame.x + frame.w * port.offset; y = frame.y + frame.h; }
                  else if (port.side === 'left') { x = frame.x; y = frame.y + frame.h * port.offset; isLeft = true; }
                  else { x = frame.x + frame.w; y = frame.y + frame.h * port.offset; }
                } else {
                  isLeft = i % 2 === 0;
                  x = isLeft ? frame.x : frame.x + frame.w;
                  y = frame.y + 60 + Math.floor(i / 2) * 40;
                }

                return (
                  <g key={port.id} transform={`translate(${x}, ${y})`}>
                    <rect
                      x={-6} y={-6} width={12} height={12}
                      fill={connectorSource?.portId === port.id && connectorSource?.partId === block.id ? '#f97316' : '#222'}
                      stroke={port.kind === 'flow' ? '#6c9ac6' : port.kind === 'proxy' ? '#c96c8a' : '#f97316'}
                      strokeWidth={1}
                      onMouseDown={(e) => handlePortMouseDown(e, block.id, port.id)}
                      onClick={(e) => handlePortClick(e, block.id, port.id)}
                      style={{ cursor: 'pointer' }}
                    />
                    <text x={isLeft ? 10 : -10} y={4} textAnchor={isLeft ? "start" : "end"} fill="#aaa" fontSize={10}>{port.name}</text>
                  </g>
                );
              })}
            </g>
          );
        }
        if (block.stereotype !== 'interface' && block.stereotype !== 'interfaceBlock') return null;

        // Only show interface blocks / interfaces in IBD if they are realized by a part in the current layer,
        // or if they are currently being connected.
        const isRealizedInCurrentLayer = interfaceRealizations.some(realization => {
          if (realization.interfaceId !== block.id) return false;
          const part = partsById.get(realization.partId);
          return part && part.blockId === currentLayerId;
        });
        const isConnectionSource = isCreatingTransition && transitionSourceId === block.id;

        if (!isRealizedInCurrentLayer && !isConnectionSource) return null;
      }

      if (diagramMode === 'requirements') {
        const allowedStereotypes = ['requirement', 'block', 'part', 'testCase', 'activity', 'useCase', 'stateMachine'];
        if (!allowedStereotypes.includes(block.stereotype)) return null;
        if (!requirementsDiagramScope.visibleBlockIds.has(block.id)) return null;
        // Use layerId for visibility: show only blocks belonging to the current layer.
        // Blocks without layerId (legacy) default to root.
        const blockLayer = block.layerId ?? 'root';
        if (blockLayer !== currentLayerId) return null;
      }

      if (diagramMode === 'bdd' && block.stereotype === 'requirement') return null;

      const isSelected = selectedIds.includes(block.id);

      const { width: displayWidth, height: displayHeight } = computeBlockDisplayBounds(block);

      return (
        <g
          key={block.id}
          transform={`translate(${block.x}, ${block.y})`}
          onMouseDown={(e) => handleBlockMouseDown(e, block.id)}
          onDoubleClick={(e: MouseEvent<SVGGElement>) => {
            e.stopPropagation();
            if (diagramMode === 'requirements') {
              enterRequirement(block.id);
            } else {
              enterBlock(block.id);
            }
          }}
          style={{ cursor: isCreatingTransition ? 'crosshair' : 'move' }}
        >
          {isSelected && (
            <rect x={-4} y={-4} width={displayWidth + 8} height={displayHeight + 8} fill="none" stroke="#f97316" strokeWidth={2} strokeDasharray="5,5" rx={4} />
          )}

          <rect width={displayWidth} height={displayHeight} fill={block.stereotype === 'requirement' ? 'var(--sysml-requirement-fill)' : 'var(--sysml-block-fill)'} stroke={isSelected ? '#f97316' : 'var(--sysml-block-stroke)'} strokeWidth={1} />

          {/* Header */}
          <text x={displayWidth / 2} y={15} textAnchor="middle" fill="var(--sysml-block-meta)" fontSize={10} fontFamily="monospace">
            {block.isAbstract ? `«${block.stereotype}, abstract»` : `«${block.stereotype}»`}
          </text>
          <text x={displayWidth / 2} y={30} textAnchor="middle" fill="var(--sysml-block-text)" fontSize={12} fontWeight="bold" fontStyle={block.isAbstract ? 'italic' : 'normal'}>
            {block.name}{block.isLeaf ? ' {leaf}' : ''}
          </text>
          <line x1={0} y1={35} x2={displayWidth} y2={35} stroke="var(--sysml-block-divider)" strokeWidth={1} />

          {/* If degraded mode active, skip complex sub-elements for performance */}
          {!isDegraded && (
            <>
              {/* Requirement Specifics */}
              {block.stereotype === 'requirement' ? (
                <g transform="translate(5, 45)">
                  <text y={0} fill="#f97316" fontSize={10} fontWeight="bold">Id: {block.reqId}</text>
                  <foreignObject x={0} y={5} width={Math.max(10, displayWidth - 10)} height={Math.max(10, displayHeight - 55)}>
                    <div className="text-[9px] text-[#aaa] overflow-hidden h-full">
                      {block.description}
                    </div>
                  </foreignObject>
                  {/* Status Indicator */}
                  <circle cx={displayWidth - 15} cy={-35} r={3} fill={
                    block.status === 'Verified' ? '#4ade80' :
                      block.status === 'Approved' ? '#6c9ac6' :
                        block.status === 'Draft' ? '#888' : '#c96c8a'
                  } />
                  {/* Attached PDFs Indicator */}
                  {block.attachedFiles && block.attachedFiles.length > 0 && (
                    <g transform={`translate(${displayWidth - 35}, -40)`}>
                      <title>{`${block.attachedFiles.length} PDF(s) attached`}</title>
                      <rect x="0" y="0" width="8" height="10" rx="1" fill="none" stroke="#f97316" strokeWidth={1} />
                      <line x1="2" y1="3" x2="6" y2="3" stroke="#f97316" strokeWidth={1} />
                      <line x1="2" y1="5" x2="6" y2="5" stroke="#f97316" strokeWidth={1} />
                      <line x1="2" y1="7" x2="5" y2="7" stroke="#f97316" strokeWidth={1} />
                      <text x="11" y="9" fill="#f97316" fontSize={8} fontWeight="bold">{block.attachedFiles.length}</text>
                    </g>
                  )}
                </g>
              ) : (
                <g transform="translate(5, 45)">
                  {block.properties.slice(0, 3).map((prop, i) => (
                    <text key={prop.id} y={i * 12} fill="#aaa" fontSize={10} fontFamily="monospace">
                      {formatLegacyProperty(prop)}{prop.defaultValue ? ` = ${prop.defaultValue}` : ''}
                    </text>
                  ))}
                  {block.classes && block.classes.length > 0 && (
                    <g transform={`translate(0, ${block.properties.length * 12 + 5})`}>
                      <line x1={-5} y1={-2} x2={displayWidth - 5} y2={-2} stroke="#444" strokeWidth={1} />
                      {block.classes.slice(0, 3).map((cls, i) => (
                        <text key={i} y={i * 12 + 8} fill="#aaa" fontSize={10} fontFamily="monospace">
                          {cls}
                        </text>
                      ))}
                    </g>
                  )}
                </g>
              )}

              {/* Operations Separator if needed */}
              {block.operations.length > 0 && (
                <>
                  <line x1={0} y1={displayHeight - 25} x2={displayWidth} y2={displayHeight - 25} stroke="#444" strokeWidth={1} />
                  <g transform={`translate(5, ${displayHeight - 15})`}>
                    {block.operations.slice(0, 2).map((op, i) => (
                      <text key={i} y={i * 12} fill="#aaa" fontSize={10} fontFamily="monospace">{op}</text>
                    ))}
                  </g>
                </>
              )}

              {/* Constraints */}
              {block.constraints && block.constraints.length > 0 && (
                <>
                  <line x1={0} y1={displayHeight - (block.operations.length > 0 ? 40 : 25)} x2={displayWidth} y2={displayHeight - (block.operations.length > 0 ? 40 : 25)} stroke="#444" strokeWidth={1} />
                  <g transform={`translate(5, ${displayHeight - (block.operations.length > 0 ? 30 : 15)})`}>
                    {block.constraints.slice(0, 2).map((c, i) => (
                      <text key={i} y={i * 12} fill="#aaa" fontSize={10} fontFamily="monospace">{`{${c}}`}</text>
                    ))}
                  </g>
                </>
              )}

              {/* Ports */}
              {block.ports.map((port, i) => (
                <g key={port.id} transform={`translate(-5, ${20 + i * 15})`}>
                  <rect
                    width={10}
                    height={10}
                    fill="#333"
                    stroke={port.kind === 'flow' ? '#6c9ac6' : port.kind === 'proxy' ? '#c96c8a' : '#f97316'}
                    strokeWidth={1}
                  />
                  {port.kind === 'flow' && (
                    <text x={5} y={8} textAnchor="middle" fill="#6c9ac6" fontSize={8} fontWeight="bold">
                      {port.direction === 'in' ? '>' : port.direction === 'out' ? '<' : '<>'}
                    </text>
                  )}
                  <title>{port.name} : {port.type} ({port.kind || 'standard'}){port.unit ? ` { unit: ${port.unit} }` : ''}</title>
                </g>
              ))}

              {/* Satisfied Requirements Indicator */}
              {block.satisfiedReqIds && block.satisfiedReqIds.length > 0 && (
                <text x={displayWidth - 5} y={displayHeight - 5} textAnchor="end" fill="#4ade80" fontSize={9} fontWeight="bold">
                  ✓ {block.satisfiedReqIds.length}
                </text>
              )}
            </>
          )}

          {/* Resize Handles */}
          {isSelected && (diagramMode === 'requirements' || diagramMode === 'bdd') && ['nw', 'ne', 'sw', 'se'].map(h => {
            const hx = h.includes('e') ? displayWidth : 0;
            const hy = h.includes('s') ? displayHeight : 0;
            return (
              <rect
                key={h}
                x={hx - 4} y={hy - 4} width={8} height={8}
                fill="#f97316" stroke="#0a0a0a" strokeWidth={1}
                style={{ cursor: `${h}-resize` }}
                onMouseDown={(e) => handleResizeMouseDown(e, h, block.id)}
              />
            );
          })}
        </g>
      );
    });
  }, [blocks, culledDiagram, view.scale, parts, selectedIds, isCreatingTransition, handleBlockMouseDown, diagramMode, currentLayerId, connectorSource, handlePortClick, handlePortMouseDown, enterBlock, enterRequirement, handleResizeMouseDown, interfaceRealizations, transitionSourceId, requirementsDiagramScope]);

  const renderRelationships = useCallback((): React.ReactNode => {
    const targetRelationships = culledDiagram ? culledDiagram.visibleRelationships : relationships;
    const isInteracting = isDragging || isPanning;

    const pairGroups = new Map<string, string[]>();
    targetRelationships.forEach(rel => {
      const pairKey = [rel.sourceId, rel.targetId].sort().join(':::');
      if (!pairGroups.has(pairKey)) pairGroups.set(pairKey, []);
      pairGroups.get(pairKey)!.push(rel.id);
    });

    return targetRelationships.map(rel => {
      const source = blocksById.get(rel.sourceId);
      const target = blocksById.get(rel.targetId);
      if (!source || !target) return null;

      const isReqRel = source.stereotype === 'requirement' || target.stereotype === 'requirement';
      if (diagramMode === 'ibd') return null;
      if (diagramMode === 'bdd' && isReqRel) return null;
      if (diagramMode === 'requirements' && !requirementsDiagramScope.visibleRelationshipIds.has(rel.id)) return null;

      const sourceBounds = computeBlockDisplayBounds(source);
      const targetBounds = computeBlockDisplayBounds(target);
      const srcW = sourceBounds.width;
      const srcH = sourceBounds.height;
      const tgtW = targetBounds.width;
      const tgtH = targetBounds.height;

      const pairKey = [rel.sourceId, rel.targetId].sort().join(':::');
      const group = pairGroups.get(pairKey) || [rel.id];
      const edgeIndex = group.indexOf(rel.id);
      const totalEdges = group.length;

      const route = calculateSeparatedRelationshipPath(
        { x: source.x, y: source.y, width: srcW, height: srcH },
        { x: target.x, y: target.y, width: tgtW, height: tgtH },
        edgeIndex,
        totalEdges
      );

      const isSelected = selectedIds.includes(rel.id);
      const isSuspect = Boolean((rel as any).suspect);
      const strokeColor = isSelected ? '#f97316' : isSuspect ? '#ef4444' : '#888';
      const strokeDash = rel.type === 'allocation' ? '5,5' : undefined;
      const isTrace = ['derive', 'deriveReqt', 'refine', 'satisfy', 'verify', 'trace', 'copy'].includes(rel.type);
      const isReqContainment = rel.type === 'requirementContainment';
      const containmentDiagnostics = isReqContainment && canonicalSysmlRepository.relationships[rel.id]
        ? validateRequirementContainment(canonicalSysmlRepository, rel.id)
        : [];
      const containmentErrorText = containmentDiagnostics.map(d => d.message).join('; ');
      const ariaLabel = isReqContainment
        ? `Requirement containment: ${source.name || source.reqId || source.id} contains ${target.name || target.reqId || target.id}${containmentErrorText ? ` - Error: ${containmentErrorText}` : ''}`
        : undefined;
      const { sp, tp, labelPos, angle } = route;

      return (
        <g
          key={rel.id}
          onClick={(e) => { e.stopPropagation(); setSelectedIds([rel.id]); }}
          style={{ cursor: 'pointer' }}
          role={isReqContainment ? "graphics-symbol" : undefined}
          aria-label={ariaLabel}
        >
          {/* Broad click target */}
          <path d={route.path} fill="none" stroke="transparent" strokeWidth={14} />

          {/* Rendered line/curve */}
          <path d={route.path} fill="none" stroke={strokeColor} strokeWidth={2} strokeDasharray={isTrace ? '4,2' : strokeDash} />

          {/* Arrowheads & Markers */}
          {rel.type === 'generalization' && (
            <polygon points={`${tp.x},${tp.y} ${tp.x - 10},${tp.y - 5} ${tp.x - 10},${tp.y + 5}`} fill="#1a1a1a" stroke={strokeColor} strokeWidth={1.5} transform={`rotate(${angle}, ${tp.x}, ${tp.y})`} />
          )}
          {rel.type === 'composition' && (
            <polygon points={`${sp.x},${sp.y} ${sp.x + 10},${sp.y - 5} ${sp.x + 20},${sp.y} ${sp.x + 10},${sp.y + 5}`} fill={strokeColor} stroke={strokeColor} strokeWidth={1.5} transform={`rotate(${angle}, ${sp.x}, ${sp.y})`} />
          )}
          {rel.type === 'requirementContainment' && (
            <g transform={`translate(${sp.x}, ${sp.y}) rotate(${angle})`}>
              <circle cx={7} cy={0} r={6} fill="#141414" stroke={strokeColor} strokeWidth={1.5} />
              <line x1={1} y1={0} x2={13} y2={0} stroke={strokeColor} strokeWidth={1.5} strokeLinecap="round" />
              <line x1={7} y1={-6} x2={7} y2={6} stroke={strokeColor} strokeWidth={1.5} strokeLinecap="round" />
            </g>
          )}
          {rel.type === 'aggregation' && (
            <polygon points={`${sp.x},${sp.y} ${sp.x + 10},${sp.y - 5} ${sp.x + 20},${sp.y} ${sp.x + 10},${sp.y + 5}`} fill="#1a1a1a" stroke={strokeColor} strokeWidth={1.5} transform={`rotate(${angle}, ${sp.x}, ${sp.y})`} />
          )}
          {rel.type === 'allocation' && (
            <polygon points={`${tp.x},${tp.y} ${tp.x - 10},${tp.y - 5} ${tp.x - 10},${tp.y + 5}`} fill="none" stroke={strokeColor} strokeWidth={1.5} transform={`rotate(${angle}, ${tp.x}, ${tp.y})`} />
          )}
          {isTrace && (
            <path d={`M ${tp.x - 8} ${tp.y - 4} L ${tp.x} ${tp.y} L ${tp.x - 8} ${tp.y + 4}`} fill="none" stroke={strokeColor} strokeWidth={1.5} transform={`rotate(${angle}, ${tp.x}, ${tp.y})`} />
          )}

          {/* Stereotype / Label Badge with background - deferred during drag/pan */}
          {!isInteracting && (isTrace || rel.type === 'allocation' || rel.type === 'requirementContainment' || rel.label) && (
            <g transform={`translate(${labelPos.x}, ${labelPos.y})`}>
              <rect
                x={-42}
                y={-10}
                width={84}
                height={16}
                rx={3}
                fill="#141414"
                stroke={isSuspect || containmentDiagnostics.length > 0 ? '#ef4444' : '#333'}
                strokeWidth={isSuspect || containmentDiagnostics.length > 0 ? 1.2 : 0.8}
              />
              <text
                x={0}
                y={2}
                textAnchor="middle"
                fill={containmentDiagnostics.length > 0 ? '#ef4444' : strokeColor}
                fontSize={9}
                fontWeight="600"
              >
                {rel.type === 'requirementContainment'
                  ? (containmentDiagnostics.length > 0 ? '«contains» [!]' : '«contains»')
                  : (rel.label || `«${rel.type === 'allocation' ? 'allocate' : rel.type}»`)}{isSuspect ? ' [!]' : ''}
              </text>
            </g>
          )}

          {!isInteracting && (rel as any).sourceRole && (
            <text x={sp.x + (tp.x > sp.x ? 12 : -12)} y={sp.y - 4} fill={strokeColor} fontSize={9} fontStyle="italic" textAnchor={tp.x > sp.x ? 'start' : 'end'}>+{(rel as any).sourceRole}</text>
          )}
          {!isInteracting && rel.sourceMultiplicity && (
            <text x={sp.x + (tp.x > sp.x ? 12 : -12)} y={sp.y + 12} fill={strokeColor} fontSize={10} textAnchor={tp.x > sp.x ? 'start' : 'end'}>{rel.sourceMultiplicity}</text>
          )}
          {!isInteracting && (rel as any).targetRole && (
            <text x={tp.x + (sp.x > tp.x ? 12 : -12)} y={tp.y - 4} fill={strokeColor} fontSize={9} fontStyle="italic" textAnchor={sp.x > tp.x ? 'start' : 'end'}>+{(rel as any).targetRole}</text>
          )}
          {!isInteracting && rel.targetMultiplicity && (
            <text x={tp.x + (sp.x > tp.x ? 12 : -12)} y={tp.y - 12} fill={strokeColor} fontSize={10} textAnchor={sp.x > tp.x ? 'start' : 'end'}>{rel.targetMultiplicity}</text>
          )}
        </g>
      );
    });
  }, [relationships, blocksById, culledDiagram, selectedIds, diagramMode, currentLayerId, canonicalSysmlRepository, isDragging, isPanning, requirementsDiagramScope]);

  const renderParts = useCallback((): React.ReactNode => {
    // Only render parts in IBD mode
    if (diagramMode !== 'ibd') return null;
    const targetParts = culledDiagram ? culledDiagram.visibleParts : parts;
    return targetParts.filter(p => p.blockId === currentLayerId).map(part => {
      const block = part.typeId ? blocksById.get(part.typeId) : undefined;
      const isSelected = selectedIds.includes(part.id);

      return (
        <g
          key={part.id}
          transform={`translate(${part.x}, ${part.y})`}
          onMouseDown={(e) => handlePartMouseDown(e, part.id)}
          style={{ cursor: isCreatingConnector ? 'default' : 'move' }}
        >
          {isSelected && (
            <rect x={-4} y={-4} width={part.width + 8} height={part.height + 8} fill="none" stroke="#f97316" strokeWidth={2} strokeDasharray="5,5" rx={4} />
          )}
          <rect width={part.width} height={part.height} fill="var(--sysml-part-fill)" stroke={isSelected ? '#f97316' : 'var(--sysml-part-stroke)'} strokeWidth={1} />
          <text x={part.width / 2} y={20} textAnchor="middle" fill="var(--sysml-block-text)" fontSize={12} fontWeight="bold">{part.name} {part.multiplicity ? `[${part.multiplicity}]` : ''}</text>
          <text x={part.width / 2} y={35} textAnchor="middle" fill="var(--sysml-block-subtext)" fontSize={10}>: {block?.name || 'Unknown'}</text>

          {/* Ports - FR-IBD-005: Reflect changes in BDD automatically */}
          {block?.ports?.map((port, i) => {
            let xOffset = 0, yOffset = 0;
            let isLeft = false;
            const layout = part.portLayouts?.[port.id];
            const side = layout?.side || port.side;
            const offset = layout?.offset ?? port.offset;

            if (side && offset != null) {
              if (side === 'top') { xOffset = part.width * offset; yOffset = 0; }
              else if (side === 'bottom') { xOffset = part.width * offset; yOffset = part.height; }
              else if (side === 'left') { xOffset = 0; yOffset = part.height * offset; isLeft = true; }
              else { xOffset = part.width; yOffset = part.height * offset; }
            } else {
              isLeft = i % 2 === 0;
              xOffset = isLeft ? 0 : part.width;
              yOffset = 20 + Math.floor(i / 2) * 20 + 5;
            }

            return (
              <g key={port.id} transform={`translate(${xOffset}, ${yOffset})`}>
                <rect
                  x={-5} y={-5}
                  width={10} height={10}
                  fill={connectorSource?.portId === port.id && connectorSource?.partId === part.id ? '#f97316' : 'var(--sysml-port-fill)'}
                  stroke={port.kind === 'flow' ? '#6c9ac6' : port.kind === 'proxy' ? '#c96c8a' : '#f97316'}
                  strokeWidth={1}
                  onMouseDown={(e) => handlePortMouseDown(e, part.id, port.id)}
                  onClick={(e) => handlePortClick(e, part.id, port.id)}
                  style={{ cursor: 'pointer' }}
                />
                {port.kind === 'flow' && (
                  <>
                    <text x={5} y={8} textAnchor="middle" fill="#6c9ac6" fontSize={8} fontWeight="bold" pointerEvents="none">
                      {port.direction === 'in' ? (isLeft ? '>' : '<') : port.direction === 'out' ? (isLeft ? '<' : '>') : '<>'}
                    </text>
                    <g transform="translate(5, 5)" style={{ pointerEvents: 'none' }}>
                      {port.direction === 'in' ? (
                        isLeft ? <path d="M -3 0 L 3 0 M 0 -3 L 3 0 L 0 3" stroke="#6c9ac6" strokeWidth="1.5" fill="none" /> : <path d="M 3 0 L -3 0 M 0 -3 L -3 0 L 0 3" stroke="#6c9ac6" strokeWidth="1.5" fill="none" />
                      ) : port.direction === 'out' ? (
                        isLeft ? <path d="M 3 0 L -3 0 M 0 -3 L -3 0 L 0 3" stroke="#6c9ac6" strokeWidth="1.5" fill="none" /> : <path d="M -3 0 L 3 0 M 0 -3 L 3 0 L 0 3" stroke="#6c9ac6" strokeWidth="1.5" fill="none" />
                      ) : (
                        <path d="M -3 0 L 3 0 M 0 -3 L 3 0 L 0 3 M 0 -3 L -3 0 L 0 3" stroke="#6c9ac6" strokeWidth="1.5" fill="none" />
                      )}
                    </g>
                  </>
                )}
                <text x={isLeft ? -5 : 15} y={9} textAnchor={isLeft ? "end" : "start"} fill="var(--sysml-port-label)" fontSize={9}>{port.name}</text>
              </g>
            );
          })}

          {/* Satisfied Requirements Indicator */}
          {part.satisfiedReqIds && part.satisfiedReqIds.length > 0 && (
            <text x={part.width - 5} y={part.height - 5} textAnchor="end" fill="#4ade80" fontSize={9} fontWeight="bold">
              ✓ {part.satisfiedReqIds.length}
            </text>
          )}

          {/* Resize Handles */}
          {isSelected && ['nw', 'ne', 'sw', 'se'].map(h => {
            const hx = h.includes('e') ? part.width : 0;
            const hy = h.includes('s') ? part.height : 0;
            return (
              <rect
                key={h}
                x={hx - 4} y={hy - 4} width={8} height={8}
                fill="#f97316" stroke="#0a0a0a" strokeWidth={1}
                style={{ cursor: `${h}-resize` }}
                onMouseDown={(e) => handleResizeMouseDown(e, h, part.id)}
              />
            );
          })}
        </g>
      );
    });
  }, [parts, blocksById, culledDiagram, selectedIds, isCreatingConnector, connectorSource, handlePortClick, handlePartMouseDown, handlePortMouseDown, diagramMode, currentLayerId]);

  const renderConnectors = useCallback((): React.ReactNode => {
    // Only render connectors in IBD mode
    if (diagramMode !== 'ibd') return null;
    const targetParts = culledDiagram ? culledDiagram.visibleParts : parts;
    const targetConnectors = culledDiagram ? culledDiagram.visibleConnectors : connectors;
    const currentPartIds = new Set(targetParts.filter(p => p.blockId === currentLayerId).map(p => p.id));
    currentPartIds.add(currentLayerId); // Add the context block itself
    const isInteracting = isDragging || isPanning;

    const visibleConnectors = targetConnectors.filter(c => currentPartIds.has(c.sourcePartId) && currentPartIds.has(c.targetPartId));

    return visibleConnectors.map((conn, connIdx) => {
      const getPortPos = (partId: string, portId: string) => {
        if (partId === currentLayerId) {
          const block = blocksById.get(partId);
          const port = block?.ports?.find(p => p.id === portId);
          const index = block?.ports?.findIndex(p => p.id === portId) ?? 0;
          const frame = { x: block?.ibdX ?? 50, y: block?.ibdY ?? 50, w: block?.ibdWidth ?? 1200, h: block?.ibdHeight ?? 800 };
          if (port?.side && port.offset != null) {
            if (port.side === 'top') return { x: frame.x + frame.w * port.offset, y: frame.y, side: 'top' as const };
            if (port.side === 'bottom') return { x: frame.x + frame.w * port.offset, y: frame.y + frame.h, side: 'bottom' as const };
            if (port.side === 'left') return { x: frame.x, y: frame.y + frame.h * port.offset, side: 'left' as const };
            return { x: frame.x + frame.w, y: frame.y + frame.h * port.offset, side: 'right' as const };
          }
          const isLeft = index % 2 === 0;
          return { x: isLeft ? frame.x : frame.x + frame.w, y: frame.y + 60 + Math.floor(index / 2) * 40, side: isLeft ? 'left' as const : 'right' as const };
        } else {
          const part = partsById.get(partId);
          const block = part?.typeId ? blocksById.get(part.typeId) : undefined;
          const port = block?.ports?.find(p => p.id === portId);
          const index = block?.ports?.findIndex(p => p.id === portId) ?? 0;
          if (!part) return { x: 0, y: 0, side: 'right' as const };
          const layout = part.portLayouts?.[portId];
          const side = layout?.side || port?.side;
          const offset = layout?.offset ?? port?.offset;

          if (side && offset != null) {
            if (side === 'top') return { x: part.x + part.width * offset, y: part.y, side: 'top' as const };
            if (side === 'bottom') return { x: part.x + part.width * offset, y: part.y + part.height, side: 'bottom' as const };
            if (side === 'left') return { x: part.x, y: part.y + part.height * offset, side: 'left' as const };
            return { x: part.x + part.width, y: part.y + part.height * offset, side: 'right' as const };
          }
          const isLeft = index % 2 === 0;
          return { x: part.x + (isLeft ? 0 : part.width), y: part.y + 20 + Math.floor(index / 2) * 20 + 5, side: isLeft ? 'left' as const : 'right' as const };
        }
      };

      const p1 = getPortPos(conn.sourcePartId, conn.sourcePortId);
      const p2 = getPortPos(conn.targetPartId, conn.targetPortId);

      const route = calculateOrthogonalConnectorPath(p1, p2, connIdx);
      const isSelected = selectedIds.includes(conn.id);

      return (
        <g key={conn.id} onClick={(e) => { e.stopPropagation(); setSelectedIds([conn.id]); }} style={{ cursor: 'pointer' }}>
          <path d={route.path} fill="none" stroke="transparent" strokeWidth={12} />
          <path d={route.path} fill="none" stroke={isSelected ? '#f97316' : '#888'} strokeWidth={2} pointerEvents="none" />
          {!isInteracting && (conn.itemFlow || conn.label) && (
            <g transform={`translate(${route.midX}, ${route.midY})`}>
              <polygon
                points="0,0 -6,-3 -6,3"
                fill="#f97316"
                transform={`rotate(${route.angle})`}
              />
              <rect x={-36} y={-20} width={72} height={16} rx={3} fill="#141414" stroke="#333" strokeWidth={0.8} />
              <text x={0} y={-8} textAnchor="middle" fill="#f97316" fontSize={8} fontWeight="bold">
                {conn.itemFlow ? `«${conn.itemFlow}»` : conn.label}
              </text>
            </g>
          )}
        </g>
      );
    });
  }, [connectors, parts, partsById, blocksById, culledDiagram, selectedIds, currentLayerId, diagramMode, isDragging, isPanning]);

  const renderInterfaceRealizations = useCallback((): React.ReactNode => {
    if (diagramMode !== 'ibd') return null;

    return interfaceRealizations.map(realization => {
      const { id, interfaceId, partId, portId } = realization;

      const interfaceBlock = blocksById.get(interfaceId);
      const part = partsById.get(partId);
      if (!interfaceBlock || !part || part.blockId !== currentLayerId) return null;

      const partBlock = part.typeId ? blocksById.get(part.typeId) : undefined;
      if (!partBlock) return null;

      const port = partBlock.ports.find(p => p.id === portId);
      const portIndex = partBlock.ports.findIndex(p => p.id === portId);
      if (portIndex === -1) return null;
      if (!port || portIndex === -1) return null;

      const sp = getEdgePoint(interfaceBlock, part);

      const layout = part.portLayouts?.[portId];
      const side = layout?.side || port.side;
      const offset = layout?.offset ?? port.offset;

      let tp = { x: 0, y: 0 };
      if (side && offset != null) {
        if (side === 'top') tp = { x: part.x + part.width * offset, y: part.y };
        else if (side === 'bottom') tp = { x: part.x + part.width * offset, y: part.y + part.height };
        else if (side === 'left') tp = { x: part.x, y: part.y + part.height * offset };
        else tp = { x: part.x + part.width, y: part.y + part.height * offset };
      } else {
        const isLeft = portIndex % 2 === 0;
        tp = { x: part.x + (isLeft ? 0 : part.width), y: part.y + 20 + Math.floor(portIndex / 2) * 20 + 5 };
      }

      const isSelected = selectedIds.includes(id);
      const strokeColor = isSelected ? '#f97316' : '#6c9ac6';

      return (
        <g key={id} onClick={(e) => { e.stopPropagation(); setSelectedIds([id]); }}>
          <line x1={sp.x} y1={sp.y} x2={tp.x} y2={tp.y} stroke={strokeColor} strokeWidth={1.5} strokeDasharray="4,2" />
          <circle cx={tp.x} cy={tp.y} r="3" fill="none" stroke={strokeColor} />
        </g>
      );
    });
  }, [diagramMode, interfaceRealizations, blocksById, partsById, currentLayerId, selectedIds]);

  const handleJumpToError = useCallback((error: ErrorItem) => {
    if (!error.elementId) return;

    const state = states.find(s => s.id === error.elementId);
    const junction = junctions.find(j => j.id === error.elementId);
    const transition = transitions.find(t => t.id === error.elementId);

    let targetX = 0, targetY = 0;
    let targetLayerId = currentLayerId;

    if (state) {
      targetX = state.x + state.width / 2;
      targetY = state.y + state.height / 2;
      targetLayerId = state.parentId || 'root';
      setSelectedIds([state.id]);
    } else if (junction) {
      targetX = junction.x;
      targetY = junction.y;
      const layer = layers.find(l => l.junctionIds.includes(junction.id));
      if (layer) targetLayerId = layer.id;
      setSelectedIds([junction.id]);
    } else if (transition) {
      const s = states.find(s => s.id === transition.sourceId) || junctions.find(j => j.id === transition.sourceId);
      if (s) {
        targetX = s.x;
        targetY = s.y;
        if ('width' in s) {
          targetLayerId = (s as StateData).parentId || 'root';
        } else {
          const layer = layers.find(l => l.junctionIds.includes(s.id));
          if (layer) targetLayerId = layer.id;
        }
      }
      setSelectedIds([transition.id]);
    }

    if (targetLayerId !== currentLayerId) {
      const buildLayerNavigation = (layerId: string): { newStack: string[], newPath: string[] } => {
        if (layerId === 'root') {
          return { newStack: [], newPath: ['Root'] };
        }
        const pathNames: string[] = [];
        const stackIds: string[] = [];
        let currentId = layerId;

        while (currentId !== 'root') {
          const layer = layers.find(l => l.id === currentId);
          if (!layer || !layer.parentStateId) return { newStack: [], newPath: ['Root'] }; // Path is broken
          const parentState = states.find(s => s.id === layer.parentStateId);
          if (!parentState) return { newStack: [], newPath: ['Root'] }; // Path is broken
          pathNames.unshift(parentState.name);
          const parentLayerId = parentState.parentId || 'root';
          stackIds.unshift(parentLayerId);
          currentId = parentLayerId;
        }
        return { newStack: stackIds, newPath: ['Root', ...pathNames] };
      };

      const { newStack, newPath } = buildLayerNavigation(targetLayerId);
      setCurrentLayerId(targetLayerId);
      setLayerStack(newStack);
      setLayerPath(newPath);
    }

    if (targetX && targetY && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      setView({ scale: 1, offsetX: rect.width / 2 - targetX, offsetY: rect.height / 2 - targetY });
    }
    dismissErrorDialog();
  }, [states, junctions, transitions, layers, currentLayerId]);

  const handleAutoFix = useCallback((error: ErrorItem) => {
    if (!error.elementId) return;

    if (error.message.includes('contains spaces')) {
      const state = states.find(s => s.id === error.elementId);
      if (state) {
        const newName = state.name.trim().replace(/\s+/g, '_');
        updateState(state.id, { name: newName });
        addError('info', `Auto-fixed state name: ${state.name} -> ${newName}`);
        setErrors(prev => prev.filter(e => e.id !== error.id));
        dismissErrorDialog();
      }
    } else if (error.message.includes('Duplicate state name')) {
      const state = states.find(s => s.id === error.elementId);
      if (state) {
        let newName = state.name;
        let counter = 1;
        while (states.some(s => s.name === newName && s.id !== state.id)) {
          newName = `${state.name}_${counter}`;
          counter++;
        }
        updateState(state.id, { name: newName });
        addError('info', `Auto-fixed duplicate state name: ${state.name} -> ${newName}`);
        setErrors(prev => prev.filter(e => e.id !== error.id));
        dismissErrorDialog();
      }
    } else if (error.message.includes('has no AutoStart')) {
      // REQ-HSM-004 & REQ-HSM-023: Auto-fix by setting first state as autostart
      const state = states.find(s => s.id === error.elementId);
      if (state) {
        // Find the layer this state belongs to
        const layer = layers.find(l =>
          l.id === 'root' ? !layers.some(ol => ol.id !== 'root' && ol.stateIds.includes(state.id)) : l.stateIds.includes(state.id)
        );
        const layerName = layer?.name || (layer?.id === 'root' ? 'Root' : 'unknown');

        // Clear autostart from all states in this layer first
        const statesInLayer = layer
          ? states.filter(ls => {
            if (layer.id === 'root') {
              return !layers.some(ol => ol.id !== 'root' && ol.stateIds.includes(ls.id));
            }
            return layer.stateIds.includes(ls.id);
          })
          : [];

        statesInLayer.forEach(s => {
          if (s.autostart) {
            updateState(s.id, { autostart: false });
          }
        });

        // Set this state as autostart
        updateState(state.id, { autostart: true });
        addError('info', `Auto-fixed: Set '${state.name}' as AutoStart for layer '${layerName}'`);
        setErrors(prev => prev.filter(e => e.id !== error.id));
        dismissErrorDialog();
      }
    } else if (error.message.includes('unguarded and untimed')) {
      const transition = transitions.find(t => t.id === error.elementId);
      if (transition) {
        updateTransition(transition.id, { type: 'after', afterTicks: 5 });
        addError('info', `Auto-fixed transition: Added after-timer`);
        setErrors(prev => prev.filter(e => e.id !== error.id));
        dismissErrorDialog();
      }
    }
  }, [states, layers, transitions, updateState, updateTransition, addError]);

  const handleFixAll = useCallback(() => {
    const fixableErrors = errors.filter(e => e.canAutoFix);
    if (fixableErrors.length === 0) return;

    const updates = new Map<string, string>();
    const usedNames = new Set(states.map(s => s.name));

    fixableErrors.forEach(error => {
      if (!error.elementId) return;

      // Handle AutoStart errors separately
      if (error.message.includes('has no AutoStart')) {
        const state = states.find(s => s.id === error.elementId);
        if (state) {
          // Find the layer this state belongs to
          const layer = layers.find(l =>
            l.id === 'root' ? !layers.some(ol => ol.id !== 'root' && ol.stateIds.includes(state.id)) : l.stateIds.includes(state.id)
          );

          // Clear autostart from all states in this layer first
          const statesInLayer = layer
            ? states.filter(ls => {
              if (layer.id === 'root') {
                return !layers.some(ol => ol.id !== 'root' && ol.stateIds.includes(ls.id));
              }
              return layer.stateIds.includes(ls.id);
            })
            : [];

          statesInLayer.forEach(s => {
            if (s.autostart) {
              updateState(s.id, { autostart: false });
            }
          });

          // Set this state as autostart
          updateState(state.id, { autostart: true });
        }
        return;
      }

      const state = states.find(s => s.id === error.elementId);
      if (!state) return;

      let newName = state.name;

      if (error.message.includes('contains spaces')) {
        newName = newName.trim().replace(/\s+/g, '_');
      }

      // Ensure uniqueness (handling both spaces fix and duplicates)
      // We check against the original 'states' list AND the 'usedNames' set which tracks assignments in this batch
      let counter = 1;
      const baseName = newName;

      // Check if name is taken by another state (not self) OR if we've already assigned this name in this batch
      const isTaken = (n: string) => {
        const takenByOther = states.some(s => s.name === n && s.id !== state.id);
        const takenInBatch = usedNames.has(n) && !updates.has(state.id); // If we are updating self, we overwrite, but here we are checking collision
        // Actually, simpler: just check if n is in usedNames, but exclude self's *original* name if we are renaming self?
        // No, usedNames tracks the *result* set.
        return takenByOther || (usedNames.has(n) && updates.get(state.id) !== n);
      };

      // If it's a duplicate error, we MUST change it even if it looks unique (because it collided with someone else)
      // If it's a space error, we only change if it collides.
      const isDuplicateError = error.message.includes('Duplicate state name');

      while (
        (isDuplicateError && newName === state.name) ||
        states.some(s => s.name === newName && s.id !== state.id) ||
        (usedNames.has(newName) && updates.get(state.id) !== newName)
      ) {
        newName = `${baseName}_${counter}`;
        counter++;
      }

      updates.set(state.id, newName);
      usedNames.add(newName);
    });

    if (updates.size > 0) {
      setStates(prev => prev.map(s => {
        if (updates.has(s.id)) {
          return { ...s, name: updates.get(s.id)! };
        }
        return s;
      }));
      setErrors(prev => prev.filter(e => !e.canAutoFix));
      dismissErrorDialog();
      addError('info', `Auto-fixed ${updates.size} issues.`);
    }
  }, [errors, states, layers, updateState, addError]);

  const visibleVariables = useMemo(() => variables.filter(v => v.visibleInScope), [variables]);
  const colors = ['#f97316', '#6c9ac6', '#6cc9a8', '#c96c8a', '#9a6cc9', '#c9c46c'];



  return (
    <>
      {showWelcome && (
        <IntroStandbyOverlay mode="intro" onClose={() => setShowWelcome(false)} />
      )}
      {showStandby && (
        <IntroStandbyOverlay mode="standby" onClose={() => setShowStandby(false)} />
      )}
      <HelpModal isOpen={showHelpModal} onClose={() => setShowHelpModal(false)} initialTopic={helpInitialTopic} />
      <FactoryIOGateway 
        isOpen={showFactoryIOGateway} 
        onClose={() => setShowFactoryIOGateway(false)}
        variables={variables}
        mapping={factoryIOMapping}
        setMapping={setFactoryIOMapping}
        isEnabled={factoryIOEnabled}
        setIsEnabled={setFactoryIOEnabled}
        status={factoryIOStatus}
      />
      <AiArchitectSidebar 
        isOpen={isAiSidebarOpen} 
        onToggle={() => setIsAiSidebarOpen(!isAiSidebarOpen)}
        currentContext={{ states, variables, transitions, junctions, layers, blocks }}
        onExecuteActions={handleExecuteAiActions}
      />
      <AgentPanel
        isOpen={isAgentPanelOpen}
        onToggle={() => setIsAgentPanelOpen(prev => !prev)}
        onClose={() => setIsAgentPanelOpen(false)}
        orchestrator={agentOrchestrator}
        projectContext={{
          projectName: currentProjectName,
          activeWorkspace: diagramMode,
          blocksCount: blocks.length,
          nodesCount: (diagramMode === 'xbridges' ? globalXBridgesNodes.length : diagramMode === 'vlab' ? vlabNodes.length : blocks.length),
          connectionsCount: (diagramMode === 'xbridges' ? globalXBridgesEdges.length : relationships.length),
          refreshProject: () => {
            agentOrchestrator.refreshProjectContext();
          },
          delegateReadiness: agentToolGateway.getDelegateReadiness(),
        }}
      />
      <GlobalReportPreviewModal
        isOpen={showGlobalReportPreview}
        onClose={() => setShowGlobalReportPreview(false)}
        reportData={globalReportData}
      />
      <ReportPreviewModal 
        isOpen={showReportPreview} 
        onClose={() => setShowReportPreview(false)} 
        results={results} 
        data={data} 
        headers={headers} 
        plotFactors={plotFactors} 
        holdValues={holdValues} 
      />
      <LargeModelDiagnostics
        isOpen={showSysmlDiagnostics}
        onClose={() => setShowSysmlDiagnostics(false)}
        totalBlockCount={blocks.length}
        totalPartCount={parts.length}
        totalConnectorCount={connectors.length}
        totalRelationshipCount={relationships.length}
        visibleCount={culledDiagram ? culledDiagram.visibleBlocks.length + culledDiagram.visibleParts.length : undefined}
        isVirtualizing={Boolean(culledDiagram)}
        isDegradedMode={culledDiagram?.isDegradedMode}
        workerDiagnostics={getDefaultSysmlWorkerClient().getDiagnostics()}
      />
      {importValidationError && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] animate-in fade-in duration-200" onMouseDown={() => setImportValidationError(null)}>
          <div className="bg-[#121212] border-2 border-red-500/80 rounded-2xl w-[600px] max-h-[80vh] flex flex-col shadow-2xl overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 bg-red-950/40 border-b border-red-500/30 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <span className="text-2xl">⚠️</span>
                <div>
                  <h2 className="text-base font-bold text-red-400 uppercase tracking-wider">{importValidationError.errorTitle || 'Import Failed: Invalid File'}</h2>
                  <p className="text-xs text-slate-400">File import refused to prevent application crash</p>
                </div>
              </div>
              <button onClick={() => setImportValidationError(null)} className="text-slate-400 hover:text-white text-lg">✕</button>
            </div>

            <div className="p-6 overflow-y-auto space-y-3 font-mono text-xs">
              <p className="text-slate-300 font-sans text-sm">The selected JSON file contains structural errors and cannot be imported:</p>
              <div className="bg-[#080808] border border-red-900/40 p-4 rounded-xl space-y-2 text-red-300 max-h-60 overflow-y-auto no-scrollbar">
                {importValidationError.errors.map((err, idx) => (
                  <div key={idx} className="flex gap-2">
                    <span className="text-red-500 font-bold">•</span>
                    <span>{err}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-6 py-4 bg-[#181818] border-t border-[#222] flex justify-end">
              <button
                onClick={() => setImportValidationError(null)}
                className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                Dismiss & Refuse File
              </button>
            </div>
          </div>
        </div>
      )}
      <div
        className="flex flex-col ui-surface font-sans overflow-hidden"
        style={{
          zoom: uiZoom,
          width: `${100 / uiZoom}vw`,
          height: `${100 / uiZoom}vh`
        }}
      >
        {/* Hidden input for project import */}
        <input type="file" ref={projectImportRef} onChange={handleProjectFileChange} className="hidden" accept=".adia,.json" />

        {/* Top Toolbar - Modernized & Unified Semantic Header */}
        <header className="h-14 ui-surface bg-[var(--surface-panel)] border-b border-[var(--border-default)] flex items-center px-4 gap-3 shrink-0 overflow-x-auto no-scrollbar">
          {/* Brand & Project Identity Group */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => setShowWorkspaceFileDialog(true)}
              className="p-1.5 hover:bg-[var(--surface-raised)] rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#f97316]/50 text-[#f97316] group"
              title="Create/Open Workspace Asset File"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="group-hover:scale-110 transition-transform">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </button>
            <div>
              <div className="font-bold text-lg tracking-tight text-[var(--text-primary)] flex items-center gap-2">
                <span>ADIA</span>
                <input
                  type="text"
                  value={currentProjectName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCurrentProjectName(e.target.value)}
                  className="bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-[var(--border-strong)] focus:border-[#f97316] text-xs font-medium px-2 py-0.5 rounded border border-[var(--border-default)] focus:outline-none tracking-normal w-28 focus:w-44 transition-all text-center cursor-pointer focus:cursor-text"
                  title="Click to rename project"
                />
              </div>
              <div className="text-[10px] text-[var(--text-muted)] font-mono mt-[-2px]">{VERSION}</div>
            </div>
          </div>

          <Separator orientation="vertical" className="h-6" />

          {/* DIAGRAM MODE SWITCHER */}
          <div className="flex ui-card bg-[var(--surface-raised)] rounded-lg border border-[var(--border-default)] p-0.5 shrink-0">
            {[
              { id: 'statemachine', label: 'State Machine' },
              { id: 'bdd', label: 'SysML BDD' },
              { id: 'requirements', label: 'Requirements' },
              { id: 'ibd', label: 'SysML IBD' },
              { id: 'xbridges', label: 'X-Bridges' },
              { id: 'vlab', label: 'V-Lab' },
              { id: 'hil', label: 'HIL' },
              { id: 'entropy', label: 'ENTROPY OPM' },
            ].map(mode => (
              <button
                key={mode.id}
                onClick={() => setDiagramMode(mode.id as DiagramMode)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                  diagramMode === mode.id
                    ? 'bg-[var(--surface-panel)] text-[var(--text-primary)] shadow-sm font-semibold'
                    : 'text-[var(--text-secondary)] hover:text-[#f97316] hover:bg-[var(--surface-panel)]'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>


          <Separator orientation="vertical" className="h-6" />

          {/* SIMULATION & VALIDATION GROUP */}
          <div className="flex items-center gap-1.5 ui-card bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-lg p-1 shrink-0">
            {/* Sim tick rate control */}
            <div className="flex items-center gap-1 px-1.5 text-xs text-[var(--text-secondary)]">
              <span className="text-[11px] whitespace-nowrap">Tick:</span>
              <TickRateInput value={tickMs} onChange={setTickMs} />
              <span className="text-[10px] text-[var(--text-muted)]">ms</span>
            </div>

            {(diagramMode as DiagramMode) !== 'xbridges' && (diagramMode as DiagramMode) !== 'hil' && (
              <>
                <Separator orientation="vertical" className="h-4" />

                <Button
                  size="sm"
                  onClick={isRunning ? pauseSimulation : startSimulation}
                  className={`h-7 px-2.5 text-xs font-semibold whitespace-nowrap rounded-md ${
                    isRunning
                      ? 'bg-rose-600 hover:bg-rose-500 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                >
                  {isRunning ? (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="mr-1">
                        <rect x="6" y="4" width="4" height="16" />
                        <rect x="14" y="4" width="4" height="16" />
                      </svg>
                      Pause
                    </>
                  ) : (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="mr-1">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                      Start
                    </>
                  )}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={stepSimulation}
                  className="h-7 px-2 text-xs text-[var(--text-secondary)] hover:text-[#f97316] hover:bg-[var(--surface-panel)] whitespace-nowrap transition-colors"
                  title="Step single cycle"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1">
                    <polygon points="5 3 19 12 5 21 5 3" />
                    <line x1="12" y1="4" x2="12" y2="20" />
                  </svg>
                  Step
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetSimulation}
                  className="h-7 px-2 text-xs text-[var(--text-secondary)] hover:text-[#f97316] hover:bg-[var(--surface-panel)] whitespace-nowrap transition-colors"
                  title="Reset simulation"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1">
                    <path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0" />
                    <polyline points="3 4 3 12 11 12" />
                  </svg>
                  Reset
                </Button>

                <Separator orientation="vertical" className="h-4" />

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { if (validateModel()) addError('info', 'Model validation passed.'); }}
                  className="h-7 px-2 text-xs text-[var(--text-secondary)] hover:text-[#f97316] hover:bg-[var(--surface-panel)] whitespace-nowrap transition-colors"
                  title="Check for errors"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1 text-emerald-400">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                  </svg>
                  Validate
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={validateWithAI}
                  disabled={isAiValidating}
                  className="h-7 px-2 text-xs text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 whitespace-nowrap"
                  title="Validate logic with AI"
                >
                  {isAiValidating ? (
                    <svg className="animate-spin mr-1 h-3.5 w-3.5 text-amber-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1">
                      <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
                      <path d="M12 2a10 10 0 0 1 10 10" opacity="0.5" />
                      <circle cx="12" cy="12" r="2" />
                    </svg>
                  )}
                  {isAiValidating ? 'Analyzing...' : 'AI Check'}
                </Button>
              </>
            )}

            <Separator orientation="vertical" className="h-4" />

            <div className="flex items-center gap-1.5 px-1.5 py-0.5">
              <Checkbox
                checked={safetyMode}
                onCheckedChange={(c) => setSafetyMode(c as boolean)}
                id="safety-mode"
                className="h-3.5 w-3.5 rounded border-[var(--border-strong)] data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500"
              />
              <Label htmlFor="safety-mode" className={`text-xs cursor-pointer select-none whitespace-nowrap ${safetyMode ? "text-red-500 font-semibold" : "text-[var(--text-secondary)]"}`}>
                Safety
              </Label>
            </div>
          </div>

          <Separator orientation="vertical" className="h-6" />

          {/* CODE GENERATION & PROJECT I/O GROUP */}
          <div className="flex items-center gap-1 ui-card bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-lg p-1 shrink-0">
            {/* Generate C/H Button - Primary Accent */}
            <Button
              variant="outline"
              size="sm"
              onClick={generateCode}
              disabled={isGenerating}
              className="h-7 px-2.5 text-xs font-semibold whitespace-nowrap bg-orange-500/10 border-orange-500/30 text-orange-500 hover:bg-orange-500/20 hover:text-orange-600 disabled:opacity-50 disabled:cursor-wait"
              title="Generate C/H Embedded Code"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              {isGenerating ? 'Generating...' : 'Generate C/H'}
            </Button>

            <Separator orientation="vertical" className="h-4" />

            <Button
              variant="ghost"
              size="sm"
              onClick={() => saveUnifiedProject(false)}
              className="h-7 px-2 text-xs text-[var(--text-secondary)] hover:text-[#f97316] hover:bg-[var(--surface-panel)] whitespace-nowrap transition-colors"
              title="Save ADIA project (.adia)"
            >
              <Save size={13} className="mr-1 text-[var(--text-muted)]" />
              Save
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => saveUnifiedProject(true)}
              className="h-7 px-2 text-xs text-[var(--text-secondary)] hover:text-[#f97316] hover:bg-[var(--surface-panel)] whitespace-nowrap transition-colors"
              title="Save ADIA project as new file (.adia)"
            >
              Save As
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleOpenProjectDialog}
              className="h-7 px-2 text-xs text-[var(--text-secondary)] hover:text-[#f97316] hover:bg-[var(--surface-panel)] whitespace-nowrap transition-colors"
              title="Open ADIA project (.adia)"
            >
              <FolderOpen size={13} className="mr-1 text-[var(--text-muted)]" />
              Open
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleExportProject}
              className="h-7 px-2 text-xs text-[var(--text-secondary)] hover:text-[#f97316] hover:bg-[var(--surface-panel)] whitespace-nowrap transition-colors"
              title="Export individual module files (.json)"
            >
              Export
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowReportDialog(true)}
              className="h-7 px-2 text-xs text-[var(--text-secondary)] hover:text-[#f97316] hover:bg-[var(--surface-panel)] whitespace-nowrap transition-colors"
              title="Generate Engineering Report"
            >
              Report
            </Button>
          </div>

          <Separator orientation="vertical" className="h-6" />

          {/* ENGINEERING TOOLS & GATEWAYS GROUP */}
          <div className="flex items-center gap-1 ui-card bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-lg p-1 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleWindow('hmi')}
              className="h-7 px-2 text-xs text-[var(--text-secondary)] hover:text-[#f97316] hover:bg-[var(--surface-panel)] whitespace-nowrap transition-colors"
              title="Open HMI Dashboard Panel"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1 text-orange-400">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
              </svg>
              HMI Panel
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleWindow('pid')}
              className="h-7 px-2 text-xs text-[var(--text-secondary)] hover:text-[#f97316] hover:bg-[var(--surface-panel)] whitespace-nowrap transition-colors"
              title="PID Controller Tuner"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1 text-sky-400">
                <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"></path>
                <line x1="16" y1="8" x2="2" y2="22"></line>
                <line x1="17.5" y1="15" x2="9" y2="15"></line>
              </svg>
              PID Tuner
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleWindow('doe')}
              className="h-7 px-2 text-xs text-[var(--text-secondary)] hover:text-[#f97316] hover:bg-[var(--surface-panel)] whitespace-nowrap transition-colors"
              title="Design of Experiments (Response Surface Methodology)"
            >
              DOE (RSM)
            </Button>

            <Separator orientation="vertical" className="h-4" />

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFactoryIOGateway(true)}
              className={`h-7 px-2 text-xs text-[var(--text-secondary)] hover:text-[#f97316] hover:bg-[var(--surface-panel)] whitespace-nowrap transition-colors ${
                factoryIOEnabled ? 'text-indigo-400 bg-indigo-500/10' : ''
              }`}
              title="Factory I/O Gateway Connection"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`mr-1 ${factoryIOEnabled ? 'text-indigo-400' : 'text-[var(--text-muted)]'}`}>
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
              Factory I/O
              {factoryIOEnabled && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 ml-1"></span>}
            </Button>

            <Button
              id="3dx-toolbar-btn"
              variant="ghost"
              size="sm"
              onClick={() => setShow3DXGateway(true)}
              className="h-7 px-2 text-xs text-[var(--text-secondary)] hover:text-[#f97316] hover:bg-[var(--surface-panel)] whitespace-nowrap transition-colors"
              title="Connect to 3DEXPERIENCE Platform"
            >
              <Cloud size={13} className="mr-1 text-cyan-400" />
              3DEXPERIENCE
            </Button>

            <Button
              id="sysml-diagnostics-toolbar-btn"
              variant="ghost"
              size="sm"
              onClick={() => setShowSysmlDiagnostics(true)}
              className="h-7 px-2 text-xs text-[var(--text-secondary)] hover:text-[#f97316] hover:bg-[var(--surface-panel)] whitespace-nowrap transition-colors"
              title="SysML Performance Diagnostics & Limits"
            >
              <Gauge size={13} className="mr-1 text-orange-400" />
              Diagnostics
            </Button>
          </div>

          <div className="flex-1 min-w-4" />

          {/* HELP & STATUS GROUP */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleOpenHelp()}
              className="h-7 px-2 text-xs text-[var(--text-secondary)] hover:text-[#f97316] hover:bg-[var(--surface-panel)] whitespace-nowrap transition-colors"
              title="Help & Documentation"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1 text-emerald-400">
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              Help
            </Button>

            {/* Theme Switcher Button */}
            <button
              id="adia-theme-toggle-btn"
              type="button"
              title={currentTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              onClick={() => {
                const next = toggleTheme();
                setCurrentTheme(next);
              }}
              className="ui-control ui-focus-ring h-7 px-2.5 flex items-center gap-1.5 text-xs font-semibold rounded-md border border-[var(--border-default)] transition-all duration-200 shadow-sm cursor-pointer"
            >
              {currentTheme === 'dark' ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline font-mono font-bold">Light</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-[var(--text-primary)]" />
                  <span className="hidden sm:inline font-mono font-bold">Dark</span>
                </>
              )}
            </button>

            {/* Status indicators */}
            <div className="flex items-center gap-3 ui-card bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-lg px-2.5 py-1 text-xs">
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
                <span className={`font-mono text-[11px] font-semibold ${isRunning ? 'text-emerald-500' : 'text-[var(--text-muted)]'}`}>
                  {isRunning ? 'RUN' : 'STOP'}
                </span>
              </div>
              <Separator orientation="vertical" className="h-3.5" />
              <LiveFpsMonitor />
              <Separator orientation="vertical" className="h-3.5" />
              <div className="text-[var(--text-muted)] font-mono text-[11px]">
                T: <span className="text-[var(--text-primary)] font-semibold">{simulationTime.toFixed(1)}s</span>
              </div>
              <div className="text-[var(--text-muted)] font-mono text-[11px]">
                S: <span className="text-[var(--text-primary)] font-semibold">{currentStates.length}</span>
              </div>
              <div className="text-[var(--text-muted)] font-mono text-[11px]">
                V: <span className="text-[var(--text-primary)] font-semibold">{variables.length}</span>
              </div>
            </div>
          </div>
        </header>


        {/* Workspace Tab Bar */}
        <WorkspaceTabBar
          openTabIds={openTabIds}
          activeFileId={activeFileId}
          workspaceFiles={workspaceFiles}
          onSwitchTab={switchActiveFile}
          onCloseTab={closeTab}
          onOpenDialog={() => setShowWorkspaceFileDialog(true)}
        />

        {/* Main Content Area */}
        <div className="flex flex-1 overflow-hidden" onMouseUp={() => setResizingPanel(null)}>
          {/* Left Sidebar - Hierarchy */}
          {!['xbridges', 'vlab', 'hil', 'entropy'].includes(diagramMode) && (
            <aside style={{ width: isMobile ? '100%' : (isHierarchyCollapsed ? '48px' : `${hierarchyWidth}px`), display: isMobile && mobileTab !== 'hierarchy' ? 'none' : 'flex' }} className="ui-surface bg-[var(--surface-panel)] border-r border-[var(--border-default)] flex flex-col shrink-0 transition-all duration-300 overflow-hidden">
              <div className="h-10 flex items-center justify-between px-4 border-b border-[var(--border-default)]">
                {!isHierarchyCollapsed && (
                  <div className="flex items-center overflow-hidden whitespace-nowrap">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" className="mr-2.5">
                       <path d="M10 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4" />
                       <path d="M16 17l-3-3 3-3" />
                       <path d="M13 14H3" />
                    </svg>
                    <span className="text-sm font-medium text-[var(--text-primary)]">Hierarchy</span>
                  </div>
                )}
                <button
                  onClick={() => setIsHierarchyCollapsed(!isHierarchyCollapsed)}
                  className={`p-1.5 rounded hover:bg-[var(--surface-raised)] text-[#f97316] transition-all ${isHierarchyCollapsed ? 'w-full flex justify-center' : ''}`}
                >
                  <Triangle size={10} className={`transition-transform duration-300 ${isHierarchyCollapsed ? 'rotate-90' : '-rotate-90'}`} fill="currentColor" />
                </button>
              </div>
              {!isHierarchyCollapsed && (
                <HierarchyTree
                  states={states}
                  layers={layers}
                  transitions={transitions}
                  junctions={junctions}
                  activeStates={activeStates}
                  currentLayerId={currentLayerId}
                  diagramMode={diagramMode}
                  blocks={blocks}
                  parts={parts}
                  canonicalSysmlRepository={canonicalSysmlRepository}
                  onSelect={(id: string) => setSelectedIds([id])}
                  onDoubleClick={(id: string) => {
                    if (diagramMode === "statemachine") {
                      enterLayer(id);
                    }
                  }}
                  selectedIds={selectedIds}
                  onUpdateStates={setStates}
                  onUpdateLayers={setLayers}
                  onUpdateTransitions={setTransitions}
                  onUpdateJunctions={setJunctions}
                  onExecuteSysmlCommand={sysmlApplicationDelegate ? (cmd: any) => sysmlApplicationDelegate.executeCommand(cmd) as any : undefined}
                />
              )}
            </aside>
          )}
          {!isMobile && !isHierarchyCollapsed && !['xbridges', 'vlab', 'hil', 'entropy'].includes(diagramMode) && <Resizer onMouseDown={(e) => handleResizeStart(e, 'hierarchy')} />}

          {/* Left Sidebar - Variables */}
          {!['xbridges', 'vlab', 'hil', 'entropy'].includes(diagramMode) && (
            <aside style={{ width: isMobile ? '100%' : (isVariablesCollapsed ? '48px' : `${variablesWidth}px`), display: isMobile && mobileTab !== 'variables' ? 'none' : 'flex' }} className="bg-[#1a1a1a] flex flex-col shrink-0 transition-all duration-300 overflow-hidden">
              <div className="h-10 flex items-center justify-between px-4 border-b border-[#222]">
                {!isVariablesCollapsed && (
                  <div className="flex items-center overflow-hidden whitespace-nowrap">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" className="mr-2.5">
                      <path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v5" />
                      <path d="M3 12h18" />
                      <path d="M12 12v9" />
                    </svg>
                    <span className="text-sm font-medium text-[#e0e0e0]">Variables</span>
                  </div>
                )}
                <button
                  onClick={() => setIsVariablesCollapsed(!isVariablesCollapsed)}
                  className={`p-1.5 rounded hover:bg-[#222] text-[#f97316] transition-all ${isVariablesCollapsed ? 'w-full flex justify-center' : ''}`}
                >
                  <Triangle size={10} className={`transition-transform duration-300 ${isVariablesCollapsed ? 'rotate-90' : '-rotate-90'}`} fill="currentColor" />
                </button>
              </div>

              {!isVariablesCollapsed && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="flex-1 overflow-y-auto no-scrollbar">
                    {/* Compact Create Section */}
                    <div className="p-3 border-b border-[#222] bg-[#1a1a1a]/50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-[#f97316] uppercase tracking-wider">New Variable</span>
                      </div>
                      <div className="flex gap-1.5 mb-1.5">
                        <Input
                          placeholder="Name"
                          value={newVarName}
                          onChange={(e) => setNewVarName(e.target.value)}
                          className="h-7 text-[11px] bg-[#0d0d0d] border-[#333] focus:border-[#f97316]/50"
                        />
                        <select
                          value={newVarType}
                          onChange={(e) => {
                            const t = e.target.value as VariableType;
                            setNewVarType(t);
                            setNewVarValue(getDefaultValue(t));
                          }}
                          className="h-7 w-24 bg-[#0d0d0d] border border-[#333] rounded text-[10px] px-1 text-[#e0e0e0] outline-none"
                        >
                          {ALLOWED_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div className="flex gap-1.5">
                        <Input
                          placeholder="Init Value"
                          value={newVarValue}
                          onChange={(e) => setNewVarValue(e.target.value)}
                          className="h-7 text-[11px] bg-[#0d0d0d] border-[#333] focus:border-[#f97316]/50"
                        />
                        <Button size="sm" onClick={addVariable} className="h-7 px-3 bg-[#f97316] text-[#0a0a0a] text-[10px] font-bold hover:bg-[#ea580c]">ADD</Button>
                      </div>
                    </div>

                    {/* Compact List */}
                    <div className="py-2">
                      {variables.map((variable, idx) => {
                        const color = colors[idx % colors.length];
                        const typeColors: Record<string, string> = {
                          'int32': 'text-emerald-400',
                          'float': 'text-sky-400',
                          'bool': 'text-amber-400'
                        };

                        return (
                          <div key={variable.id} className="group border-b border-[#1a1a1a] last:border-0">
                            <div className="flex items-center h-8 px-4 hover:bg-[#222] transition-colors">
                              <div className="flex items-center gap-2 flex-1 overflow-hidden">
                                <Checkbox
                                  checked={variable.visibleInScope}
                                  onCheckedChange={() => toggleVariableVisibility(variable.id)}
                                  className="w-3.5 h-3.5 border-[#333] data-[state=checked]:bg-[#f97316] data-[state=checked]:border-[#f97316]"
                                />
                                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                <span className="text-xs font-mono text-[#e0e0e0] truncate flex-1" title={variable.name}>{variable.name}</span>
                                <span className={`text-[9px] font-bold uppercase shrink-0 w-8 text-center ${typeColors[variable.type.toLowerCase()] || 'text-gray-500'}`}>
                                  {variable.type.substring(0, 3)}
                                </span>
                              </div>
                              <button
                                onClick={() => removeVariable(variable.id)}
                                className="ml-2 text-[#444] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M18 6L6 18M6 6l12 12" />
                                </svg>
                              </button>
                            </div>

                            <div className="px-4 pb-2 pt-0.5 grid grid-cols-2 gap-3 group-hover:bg-[#1a1a1a]/30 transition-colors">
                              <select
                                value={variable.type}
                                onChange={(e) => updateVariableType(variable.id, e.target.value as VariableType)}
                                className="h-6 text-[10px] font-mono bg-[#0d0d0d] border border-[#222] rounded px-1"
                              >
                                {ALLOWED_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                              </select>
                              <select
                                value={variable.overflowPolicy ?? 'saturate'}
                                onChange={(e) => updateVariableOverflowPolicy(variable.id, e.target.value as VariableOverflowPolicy)}
                                className="h-6 text-[10px] font-mono bg-[#0d0d0d] border border-[#222] rounded px-1"
                              >
                                <option value="saturate">saturate</option>
                                <option value="error">error</option>
                              </select>
                              <div className="space-y-0.5">
                                <span className="text-[8px] font-bold text-[#444] uppercase tracking-tighter">Initial</span>
                                <Input
                                  value={variable.initialValue}
                                  onChange={(e) => updateVariableInitValue(variable.id, e.target.value)}
                                  disabled={isRunning}
                                  className="h-6 text-[10px] font-mono bg-[#0d0d0d] border-[#222] focus:border-[#f97316]/30 px-1.5"
                                />
                              </div>
                              <div className="space-y-0.5">
                                <span className="text-[8px] font-bold text-[#444] uppercase tracking-tighter">Current</span>
                                <Input
                                  value={String(variable.currentValue)}
                                  onChange={(e) => updateVariableValue(variable.id, e.target.value)}
                                  className="h-6 text-[10px] font-mono bg-[#0d0d0d] border-[#222] text-emerald-400 focus:border-[#f97316]/30 px-1.5"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {variables.length === 0 && (
                        <div className="py-10 text-center opacity-30">
                          <p className="text-[10px] font-bold uppercase tracking-widest">No Signals</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </aside>
          )}
          {!isMobile && !['xbridges', 'vlab', 'hil', 'entropy'].includes(diagramMode) && <Resizer onMouseDown={(e) => handleResizeStart(e, 'variables')} />}

          {/* Canvas Area */}
          <div style={{ display: isMobile && mobileTab !== 'canvas' ? 'none' : 'flex' }} className="flex-1 flex flex-col min-w-0">
            <main className="flex-1 relative overflow-hidden bg-[#0a0a0a]">
            {(xBridgesStateId || diagramMode === 'xbridges') && (
                <XbridgesWorkspace
                  key={xBridgesStateId || activeFileId}
                  initialNodes={syncXBBoundaryNodeMetadata(
                    xBridgesStateId ? Array.from(states.find(s => s.id === xBridgesStateId)?.xBridgesModel?.nodes || []) : globalXBridgesNodes,
                    xBridgesStateId ? Array.from(states.find(s => s.id === xBridgesStateId)?.xBridgesModel?.mappings || []) : [],
                  )}
                  initialEdges={xBridgesStateId ? Array.from(states.find(s => s.id === xBridgesStateId)?.xBridgesModel?.edges || []) : globalXBridgesEdges}
                  initialMappings={xBridgesStateId ? Array.from(states.find(s => s.id === xBridgesStateId)?.xBridgesModel?.mappings || []) : []}
                  availableVariables={variables}
                  tickMs={tickMs}
                  onLaunchDoe={() => toggleWindow('doe')}
                  onBack={() => {
                    if (xBridgesStateId) setXBridgesStateId(null);
                    else setDiagramMode('statemachine');
                  }}
                  onSave={handleXBridgesSave}
                  onSaveAll={handleExportProject}
                  initialSelectedNodeId={xBridgesSelectedNodeId}
                  sharedClipboard={sharedClipboard}
                  onClipboardChange={setSharedClipboard}
                  fileId={activeFileId}
                  workspaceFiles={workspaceFiles}
                  isSmSimulating={isRunning}
                  simulationTime={simulationTime}
                />
              )}

              {diagramMode === 'plantuml' && (
                <PlantUmlWorkspace
                  diagram={plantUmlDiagram}
                  onChange={setPlantUmlDiagram}
                  onSave={() => addError('info', 'PlantUML diagram saved in the current project session.')}
                  onExport={exportPlantUmlSource}
                />
              )}

              {diagramMode === 'vlab' && (
                <VLabWorkspace
                  nodes={vlabNodes}
                  edges={vlabEdges}
                  onNodesChange={(nodes) => setVlabNodes(nodes)}
                  onEdgesChange={(edges) => setVlabEdges(edges)}
                  onResult={(res) => console.log('V-Lab Result:', res)}
                  onSendToDOE={(data) => {
                    toggleWindow('doe');
                  }}
                  onBack={() => setDiagramMode('statemachine')}
                  initialSelectedNodeId={vlabSelectedNodeId}
                  onNavigateToXbridges={(nodeId?: string) => {
                    const findMatchingNode = (targetNodes: any[], sourceNodeId?: string): any => {
                      if (!sourceNodeId) return null;
                      const srcLower = sourceNodeId.toLowerCase();
                      const groups = [
                        ['pid', 'controller', 'ctrl', 'ps_pid_ctrl', 'pid_basic', 'pid_controller'],
                        ['motor', 'plant', 'ac_motor', 'ac_induction_motor', 'induction', 'engine'],
                        ['inverter', 'pwm', 'gate', 'pwm_3ph_2level', 'three_phase_inverter', 'commutation'],
                        ['error', 'subtract', 'sub', 'error_calc', 'error_sub', 'ps_subtract', 'vectorsub'],
                        ['ref', 'constant', 'gen', 'signal', 'ref_speed', 'ref_signal', 'ps_constant', 'waveformgen']
                      ];
                      let match = targetNodes.find((n: any) => n.id === sourceNodeId);
                      if (match) return match;
                      for (const group of groups) {
                        const isSourceInGroup = group.some(keyword => srcLower.includes(keyword));
                        if (isSourceInGroup) {
                          match = targetNodes.find((n: any) => {
                            const id = n.id.toLowerCase();
                            const type = (n.data?.type || n.type || '').toLowerCase();
                            return group.some(keyword => id.includes(keyword) || type.includes(keyword));
                          });
                          if (match) return match;
                        }
                      }
                      const cleanId = srcLower.replace(/_[0-9]+$/, '');
                      return targetNodes.find((n: any) => {
                        const id = n.id.toLowerCase();
                        const type = (n.data?.type || n.type || '').toLowerCase();
                        return id.includes(cleanId) || type.includes(cleanId) || cleanId.includes(id) || cleanId.includes(type);
                      });
                    };

                    const targetNodes = xBridgesStateId ? Array.from(states.find(s => s.id === xBridgesStateId)?.xBridgesModel?.nodes || []) : globalXBridgesNodes;
                    const targetNode = findMatchingNode(targetNodes, nodeId);
                    if (targetNode) {
                      setXBridgesSelectedNodeId(targetNode.id);
                    } else {
                      setXBridgesSelectedNodeId(null);
                    }
                    setDiagramMode('xbridges');
                    setTimeout(() => setXBridgesSelectedNodeId(null), 1000);
                  }}
                />
              )}

              {diagramMode === 'hil' && (
                <HILWorkspace
                  config={hilConfig}
                  onChangeConfig={setHilConfig}
                  sessionState={hilSessionState}
                  onChangeSessionState={setHilSessionState}
                  variables={variables}
                  states={states}
                  transitions={transitions}
                  junctions={junctions}
                  layers={layers}
                  safetyMode={safetyMode}
                  tickMs={tickMs}
                  onBack={() => setDiagramMode('statemachine')}
                />
              )}

              {diagramMode === 'entropy' && (
                <EntropyWorkspace
                  initialNodes={entropyNodes}
                  initialEdges={entropyEdges}
                  availableVariables={variables}
                  onVariablesChange={setVariables}
                  tickMs={tickMs}
                  onTickMsChange={setTickMs}
                  opmSimulationConfig={opmSimulationConfig}
                  onOpmSimulationConfigChange={setOpmSimulationConfig}
                  onBack={() => setDiagramMode('statemachine')}
                  onSave={(nodes, edges) => {
                    setEntropyNodes(nodes);
                    setEntropyEdges(edges);
                  }}
                  onAddError={addError}
                  onOpenHelp={(topic) => handleOpenHelp(topic || 'entropy-opm')}
                  sysmlState={{
                    blocks: blocks.filter(b => b.stereotype !== 'requirement'),
                    requirements: blocks.filter(b => b.stereotype === 'requirement'),
                    relations: relationships,
                    relationships,
                    parts,
                    connectors,
                    ports: blocks.flatMap(b => b.ports || []),
                  }}
                />
              )}

              {!xBridgesStateId && !['xbridges', 'vlab', 'hil', 'entropy'].includes(diagramMode) && (
                <>

              {/* Canvas Toolbar */}
              <div className="absolute top-3 left-3 z-10 flex items-center gap-2 bg-[#1a1a1a]/95 border border-[#333] rounded-lg px-2.5 py-1.5 text-xs">
                {/* Layer Breadcrumb */}
                {layerPath.length > 1 && (
                  <>
                    {layerPath.map((name, index) => ( // REQ-HSM-041 & 042
                      <React.Fragment key={index}>
                        <button
                          onClick={index < layerPath.length - 1 ? () => goToLayer(index) : undefined}
                          disabled={index === layerPath.length - 1}
                          className={`flex items-center gap-1 px-2 py-0.5 rounded ${index === layerPath.length - 1
                            ? 'bg-[#f97316] text-[#0a0a0a] font-medium'
                            : 'text-[#f97316] hover:bg-[#222]'
                            } ${index < layerPath.length - 1 ? 'cursor-pointer' : 'cursor-default'}`}
                        > <span className="text-[9px] text-gray-500 mr-1">L{index}</span>
                          {name}
                          {index < layerPath.length - 1 && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          )}
                        </button>
                        {index < layerPath.length - 1 && <span className="text-[#666] mx-1">/</span>}
                      </React.Fragment>
                    ))}
                  </>
                )}

                <Separator orientation="vertical" className="h-3 bg-[#333] mx-1.5" />


                {diagramMode === 'statemachine' && (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const rect = canvasRef.current?.getBoundingClientRect();
                        if (rect) {
                          createState(
                            ((rect.width / uiZoom) / 2 - view.offsetX) / view.scale,
                            ((rect.height / uiZoom) / 2 - view.offsetY) / view.scale
                          );
                        }
                      }}
                      className="h-6 px-2 text-[#e0e0e0] hover:bg-[#222]"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      State
                    </Button>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const rect = canvasRef.current?.getBoundingClientRect();
                        if (rect) {
                          createJunction(
                            ((rect.width / uiZoom) / 2 - view.offsetX) / view.scale,
                            ((rect.height / uiZoom) / 2 - view.offsetY) / view.scale
                          );
                        }
                      }}
                      className="h-6 px-2 text-[#e0e0e0] hover:bg-[#222]"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1">
                        <circle cx="12" cy="12" r="10" />
                      </svg>
                      Junction
                    </Button>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const rect = canvasRef.current?.getBoundingClientRect();
                        if (rect) {
                          createXBridgesState(
                            ((rect.width / uiZoom) / 2 - view.offsetX) / view.scale,
                            ((rect.height / uiZoom) / 2 - view.offsetY) / view.scale
                          );
                        }
                      }}
                      className="h-6 px-2 text-[#4caf50] hover:bg-[#4caf50]/10 border border-[#4caf50]/30"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                        <polyline points="3.29 7 12 12 20.71 7" />
                        <line x1="12" y1="22" x2="12" y2="12" />
                      </svg>
                      X-Bridges
                    </Button>
                  </>
                )}

                {diagramMode === 'bdd' && (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const rect = canvasRef.current?.getBoundingClientRect();
                        if (rect) createBlock((rect.width / 2 - view.offsetX) / view.scale, (rect.height / 2 - view.offsetY) / view.scale, 'block');
                      }}
                      className="h-6 px-2 text-[#e0e0e0] hover:bg-[#222]"
                    >
                      Block
                    </Button>
                    <div className="flex gap-0.5">
                      <Button size="sm" onClick={() => handleAddPortToSelected('standard')} className="h-6 px-1 text-[10px] bg-[#f97316]/20 text-[#f97316] hover:bg-[#f97316]/30 border border-[#f97316]/50" title="Add Standard Port">+Std</Button>
                      <Button size="sm" onClick={() => handleAddPortToSelected('flow')} className="h-6 px-1 text-[10px] bg-[#6c9ac6]/20 text-[#6c9ac6] hover:bg-[#6c9ac6]/30 border border-[#6c9ac6]/50" title="Add Flow Port">+Flow</Button>
                      <Button size="sm" onClick={() => handleAddPortToSelected('proxy')} className="h-6 px-1 text-[10px] bg-[#c96c8a]/20 text-[#c96c8a] hover:bg-[#c96c8a]/30 border border-[#c96c8a]/50" title="Add Proxy Port">+Prx</Button>
                    </div>
                  </>
                )}

                {diagramMode === 'requirements' && (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const rect = canvasRef.current?.getBoundingClientRect();
                        if (rect) createBlock((rect.width / 2 - view.offsetX) / view.scale, (rect.height / 2 - view.offsetY) / view.scale, 'requirement');
                      }}
                      className="h-6 px-2 text-[#e0e0e0] hover:bg-[#222]"
                    >
                      + Requirement
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const rect = canvasRef.current?.getBoundingClientRect();
                        if (rect) createBlock((rect.width / 2 - view.offsetX) / view.scale, (rect.height / 2 - view.offsetY) / view.scale, 'block');
                      }}
                      className="h-6 px-2 text-[#e0e0e0] hover:bg-[#222]"
                    >
                      + Block
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const rect = canvasRef.current?.getBoundingClientRect();
                        if (rect) createBlock((rect.width / 2 - view.offsetX) / view.scale, (rect.height / 2 - view.offsetY) / view.scale, 'testCase');
                      }}
                      className="h-6 px-2 text-[#e0e0e0] hover:bg-[#222]"
                    >
                      + Test Case
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => toggleWindow('rtm')}
                      className="h-6 px-2 text-[#f97316] hover:bg-[#222]"
                    >
                      RTM
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleAutoLayout}
                      className="h-6 px-2 text-[#e0e0e0] hover:bg-[#222]"
                    >
                      Auto Layout
                    </Button>
                  </>
                )}

                {diagramMode === 'ibd' && (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const rect = canvasRef.current?.getBoundingClientRect();
                        if (rect) createPart((rect.width / 2 - view.offsetX) / view.scale, (rect.height / 2 - view.offsetY) / view.scale);
                      }}
                      className="h-6 px-2 text-[#e0e0e0] hover:bg-[#222]"
                    >
                      Part
                    </Button>
                    <div className="flex gap-0.5">
                      <Button size="sm" onClick={() => handleAddPortToSelected('standard')} className="h-6 px-1 text-[10px] bg-[#f97316]/20 text-[#f97316] hover:bg-[#f97316]/30 border border-[#f97316]/50" title="Add Standard Port">+Std</Button>
                      <Button size="sm" onClick={() => handleAddPortToSelected('flow')} className="h-6 px-1 text-[10px] bg-[#6c9ac6]/20 text-[#6c9ac6] hover:bg-[#6c9ac6]/30 border border-[#6c9ac6]/50" title="Add Flow Port">+Flow</Button>
                      <Button size="sm" onClick={() => handleAddPortToSelected('proxy')} className="h-6 px-1 text-[10px] bg-[#c96c8a]/20 text-[#c96c8a] hover:bg-[#c96c8a]/30 border border-[#c96c8a]/50" title="Add Proxy Port">+Prx</Button>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        if (isCreatingConnector) {
                          setIsCreatingConnector(false);
                          setConnectorSource(null);
                        } else {
                          setIsCreatingConnector(true);
                        }
                      }}
                      className={`h-6 px-2 ${isCreatingConnector ? 'bg-[#f97316] text-[#0a0a0a]' : 'text-[#e0e0e0] hover:bg-[#222]'}`}
                    >
                      {isCreatingConnector ? 'Cancel' : 'Connect'}
                    </Button>
                  </>
                )}

                {diagramMode !== 'ibd' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      if (isCreatingTransition) {
                        setIsCreatingTransition(false);
                        setTransitionSourceId(null);
                      } else {
                        setIsCreatingTransition(true);
                      }
                    }}
                    className={`h-6 px-2 ${isCreatingTransition ? 'bg-[#f97316] text-[#0a0a0a]' : 'text-[#e0e0e0] hover:bg-[#222]'
                      }`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                    {isCreatingTransition ? 'Cancel' : 'Connect'}
                  </Button>
                )}

                <Separator orientation="vertical" className="h-3 bg-[#333] mx-1.5" />

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setGridEnabled(!gridEnabled)}
                  className={`h-6 w-6 ${gridEnabled ? 'text-[#f97316]' : 'text-[#666]'}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 3v1818V3H3z" />
                    <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
                  </svg>
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSnapEnabled(!snapEnabled)}
                  className={`h-6 w-6 ${snapEnabled ? 'text-[#f97316]' : 'text-[#666]'}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <circle cx="12" cy="12" r="6" />
                    <circle cx="12" cy="12" r="2" />
                  </svg>
                </Button>

                <Separator orientation="vertical" className="h-3 bg-[#333] mx-1.5" />

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setView(prev => ({ ...prev, scale: Math.min(MAX_SCALE, prev.scale * 1.2) }))}
                  className="h-6 w-6 text-[#a0a0a0] hover:text-[#e0e0e0]"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </Button>

                <span className="text-[#666] w-9 text-center font-mono text-xs">
                  {Math.round(view.scale * 100)}%
                </span>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setView(prev => ({ ...prev, scale: Math.max(MIN_SCALE, prev.scale / 1.2) }))}
                  className="h-6 w-6 text-[#a0a0a0] hover:text-[#e0e0e0]"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setView({ scale: 1, offsetX: 0, offsetY: 0 })}
                  className="h-6 w-6 text-[#a0a0a0] hover:text-[#e0e0e0]"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 14.5V22M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 12.5304 2.04152 13.0558 2.1225 13.5714M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 12.5304 21.9585 13.0558 21.8775 13.5714" />
                  </svg>
                </Button>
              </div>

              {/* Mode indicator */}
              {isCreatingTransition && (
                <div className="absolute top-3 right-3 z-10 px-4 py-2 bg-[#f97316] text-[#0a0a0a] rounded-lg font-medium text-sm shadow-lg">
                  {transitionSourceId ? 'Click target state/junction to connect...' : 'Click source state/junction...'}
                </div>
              )}
              {isCreatingConnector && (
                <div className="absolute top-3 right-3 z-10 px-4 py-2 bg-[#f97316] text-[#0a0a0a] rounded-lg font-medium text-sm shadow-lg">
                  {connectorSource ? 'Click target port...' : 'Click source port...'}
                </div>
              )}

              {/* Zoom indicator */}
              {showZoomIndicator && (
                <div className="absolute top-12 right-3 z-10 px-3 py-1.5 bg-[#1a1a1a] border border-[#333] rounded-lg font-mono text-sm shadow-lg">
                  Zoom: {Math.round(view.scale * 100)}%
                </div>
              )}


              <div
                ref={canvasRef}
                id="adia-diagram-canvas"
                className="absolute inset-0"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onDoubleClick={handleDoubleClick}
                onWheel={handleWheel}
                onContextMenu={(e) => e.preventDefault()}
              >
                <svg className="sysml-diagram-canvas" width="100%" height="100%" style={{ pointerEvents: 'none' }}>
                  <defs>
                    <pattern
                      id="grid"
                      width={GRID_SIZE}
                      height={GRID_SIZE}
                      patternUnits="userSpaceOnUse"
                    >
                      <path d={`M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`} fill="none" stroke="var(--canvas-grid-dot)" strokeWidth="1" />
                    </pattern>
                  </defs>

                  {/* Grid */}
                  {gridEnabled && (
                    <rect
                      width="100%"
                      height="100%"
                      fill="url(#grid)"
                      opacity={0.3}
                    />
                  )}

                  {/* World content */}
                  <g transform={`translate(${view.offsetX}, ${view.offsetY}) scale(${view.scale})`}>
                    {/* Origin marker */}
                    <g>
                      <line x1={-10} y1={0} x2={10} y2={0} stroke="#f97316" strokeWidth={0.5} opacity={0.5} />
                      <line x1={0} y1={-10} x2={0} y2={10} stroke="#f97316" strokeWidth={0.5} opacity={0.5} />
                      <circle cx={0} cy={0} r={2} fill="#f97316" opacity={0.7}>
                        <animate attributeName="r" values="2;3;2" dur="2s" repeatCount="indefinite" />
                      </circle>
                    </g>

                    {diagramMode === 'statemachine' ? (
                      <>
                        <g style={{ pointerEvents: 'all' }}>
                          {renderStates()}
                        </g>
                        <g style={{ pointerEvents: 'all' }}>
                          {renderTransitions()}
                        </g>
                        <g style={{ pointerEvents: 'all' }}>
                          {renderJunctions()}
                        </g>
                      </>
                    ) : (diagramMode === 'bdd' || diagramMode === 'requirements') ? (
                      <>
                        <g style={{ pointerEvents: 'all' }}>
                          {renderBlocks()}
                        </g>
                        <g style={{ pointerEvents: 'all' }}>
                          {renderRelationships()}
                        </g>
                      </>
                    ) : (
                      diagramMode === 'ibd' ? (
                        <>
                          <g style={{ pointerEvents: 'all' }}>
                            {renderBlocks()}
                          </g>
                          <g style={{ pointerEvents: 'all' }}>
                            {renderParts()}
                          </g>
                          <g style={{ pointerEvents: 'all' }}>
                            {renderConnectors()}
                          </g>
                          <g style={{ pointerEvents: 'all' }}>
                            {renderInterfaceRealizations()}
                          </g>
                        </>
                      ) : null
                    )}
                  </g>
                </svg>
              </div>

              {/* Status bar */}
              <div className="absolute bottom-0 left-0 right-0 h-7 bg-[#1a1a1a] border-t border-[#222] flex items-center px-3 text-xs text-[#666]">
                <span className="mr-4 font-mono">X: {Math.round(mousePos.x)}</span>
                <span className="mr-4 font-mono">Y: {Math.round(mousePos.y)}</span>
                {diagramMode === 'statemachine' ? (
                  <>
                    <span className="mr-4">States: {currentStates.length}</span>
                    <span>Transitions: {currentTransitions.length}</span>
                  </>
                ) : (diagramMode === 'bdd' || diagramMode === 'requirements') ? (
                  <>
                    <span className="mr-4">Blocks: {blocks.length}</span>
                    <span>Relations: {relationships.length}</span>
                  </>
                ) : (
                  <>
                    <span className="mr-4">Parts: {parts.length}</span>
                    <span>Connectors: {connectors.length}</span>
                  </>
                )}
                <div className="flex-1" />
                <span className="text-[#888]">
                  {isPanning ? 'PANNING' : isSpacePressed.current ? 'PAN MODE (SPACE)' : 'READY'}
                  {' | '}
                  Space+Drag: Pan | Ctrl+Wheel: Zoom
                </span>
              </div>

                </>
              )}
            </main>

            {!['xbridges', 'vlab', 'hil', 'entropy'].includes(diagramMode) && (
              <>
                {/* Bottom Panel */}
            {!isMobile && !isScopeCollapsed && <Resizer onMouseDown={(e) => handleResizeStart(e, 'scope')} orientation="horizontal" />}
            <div style={{ height: isMobile ? '30%' : (isScopeCollapsed ? '40px' : `${scopeHeight}px`), display: isMobile && mobileTab !== 'canvas' ? 'none' : 'flex' }} className="bg-[#1a1a1a] border-t border-[#222] flex flex-col shrink-0 transition-all duration-300 overflow-hidden">
              <div
                onDoubleClick={() => setIsScopeDetached(!isScopeDetached)}
                title="Double-click header to expand/dock Scope window"
                className="flex items-center justify-between px-4 border-b border-[#222] h-10 shrink-0 select-none cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsScopeCollapsed(!isScopeCollapsed); }}
                    className="p-1 hover:bg-[#222] rounded text-[#f97316] transition-colors"
                  >
                    <Triangle size={10} className={`transition-transform duration-300 ${isScopeCollapsed ? 'rotate-0' : 'rotate-180'}`} fill="currentColor" />
                  </button>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                  <span className="font-medium">Scope</span>
                  <span className="text-[10px] text-[#666] ml-2 hidden sm:inline">(Double-click to detach/dock)</span>
                </div>
                {!isScopeCollapsed && (
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    {/* Variable Selector */}
                    <div className="relative group">
                      <Button variant="ghost" size="sm" className="text-[#a0a0a0] hover:text-[#e0e0e0] px-2.5 py-1">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1">
                          <path d="M12 20v-6M6 20V10M18 20V4" />
                        </svg>
                        Variables ({visibleVariables.length})
                      </Button>
                      <div className="absolute bottom-full left-0 mb-1 w-48 bg-[#1a1a1a] border border-[#333] rounded-lg shadow-xl p-2 hidden group-hover:block z-50">
                        {variables.length === 0 ? (
                          <div className="text-xs text-[#666] p-2 text-center">No variables</div>
                        ) : (
                          variables.map(v => (
                            <div
                              key={v.id}
                              className="flex items-center gap-2 p-1.5 hover:bg-[#222] rounded cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleVariableVisibility(v.id);
                              }}
                            >
                              <Checkbox
                                checked={v.visibleInScope}
                                onCheckedChange={() => { }}
                                className="pointer-events-none"
                              />
                              <span className="text-xs text-[#e0e0e0] truncate">{v.name}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <Separator orientation="vertical" className="h-4 bg-[#333] mx-2" />

                    <Checkbox
                      id="sampleOnTransition"
                      checked={sampleOnTransitionOnly}
                      onCheckedChange={(checked) => setSampleOnTransitionOnly(checked as boolean)}
                      className="border-[#444]"
                    />
                    <Label htmlFor="sampleOnTransition" className="text-xs text-[#888] cursor-pointer">
                      Sample on transitions only
                    </Label>
                    <Separator orientation="vertical" className="h-4 bg-[#333] mx-2" />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={exportScopeCSV}
                      className="text-[#a0a0a0] hover:text-[#e0e0e0] px-2.5 py-1"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      Export CSV
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearScope}
                      className="text-[#a0a0a0] hover:text-[#e0e0e0] px-2.5 py-1"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                      Clear
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setIsScopeDetached(!isScopeDetached)}
                      className="h-6 w-6 text-[#a0a0a0] hover:text-[#f97316]"
                      title={isScopeDetached ? "Dock Scope" : "Detach Scope into window"}
                    >
                      <Maximize2 size={13} />
                    </Button>
                  </div>
                )}
              </div>

              {!isScopeCollapsed && (
                <div
                  onDoubleClick={() => setIsScopeDetached(!isScopeDetached)}
                  className="flex-1 p-3 overflow-x-auto overflow-y-hidden cursor-pointer select-none"
                  title="Double-click to expand into detached window"
                >
                  {visibleVariables.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-[#666]">
                      <div className="text-center">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-2 opacity-50">
                          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                        </svg>
                        <p className="text-sm font-medium">No variables selected for scope</p>
                        <p className="text-xs mt-1 opacity-70">Open Workspace to add variables</p>
                      </div>
                    </div>
                  ) : scopeData.length < 2 ? (
                    <div className="flex items-center justify-center h-full text-[#666]">
                      <div className="text-center">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-2 opacity-50">
                          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                        </svg>
                        <p className="text-sm font-medium">Start simulation to see scope data</p>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full overflow-x-auto overflow-y-hidden">
                      <div className="h-full flex pb-2 gap-3 min-w-max">
                        {visibleVariables.map((variable, index) => {
                          const color = colors[index % colors.length];
                          const values = scopeData.map(dp => dp[variable.name] ?? 0);
                          const maxValue = Math.max(1, ...values);
                          const height = 70;

                          // Auto-scale logic
                          let minVal = Math.min(...values);
                          let maxVal = Math.max(...values);
                          if (minVal === maxVal) {
                            minVal -= 1;
                            maxVal += 1;
                          }
                          const range = maxVal - minVal;
                          const padding = range * 0.1;
                          const effectiveMin = minVal - padding;
                          const effectiveMax = maxVal + padding;
                          const effectiveRange = effectiveMax - effectiveMin;

                          // Generate SVG points for continuous line
                          const points = values.map((v, i) => {
                            const x = (i / (values.length - 1)) * 100;
                            const y = 100 - ((v - effectiveMin) / effectiveRange) * 100;
                            return `${x},${y}`;
                          }).join(' ');

                          return (
                            <div key={variable.id} className="w-[240px] shrink-0 relative h-full bg-[#1a1a1a] rounded border border-[#333] overflow-hidden">
                              <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0">
                                <polyline
                                  points={points}
                                  fill="none"
                                  stroke={color}
                                  strokeWidth="2"
                                  vectorEffect="non-scaling-stroke"
                                  strokeLinejoin="round"
                                  strokeLinecap="round"
                                />
                              </svg>
                              <div className="absolute top-2 left-2 right-2 flex justify-between items-start pointer-events-none">
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#000]/50 backdrop-blur-sm" style={{ color }}>
                                  {variable.name}
                                </span>
                                <span className="text-[10px] font-mono text-[#e0e0e0] px-1.5 py-0.5 rounded bg-[#000]/50 backdrop-blur-sm">
                                  {values[values.length - 1]?.toFixed(2)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

              </>
            )}          </div>
          {!isMobile && !['xbridges', 'vlab', 'hil', 'entropy'].includes(diagramMode) && <Resizer onMouseDown={(e) => handleResizeStart(e, 'properties')} />}

          {!['xbridges', 'vlab', 'hil', 'entropy'].includes(diagramMode) && (
            <>
            {/* Right Dock: Properties */}
          <aside style={{ width: isMobile ? '100%' : (isPropertiesCollapsed ? '48px' : `${propertiesWidth}px`), display: isMobile && mobileTab !== 'properties' ? 'none' : 'flex' }} className="bg-[#1a1a1a] border-l border-[#222] flex flex-col shrink-0 transition-all duration-300 overflow-hidden">
            <div className="h-10 flex items-center justify-between px-4 border-b border-[#222]">
              {!isPropertiesCollapsed && (
                <div className="flex items-center overflow-hidden whitespace-nowrap">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" className="mr-2.5">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  <span className="text-sm font-medium">Properties</span>
                </div>
              )}
              <button
                onClick={() => setIsPropertiesCollapsed(!isPropertiesCollapsed)}
                className={`p-1.5 rounded hover:bg-[#222] text-[#f97316] transition-all ${isPropertiesCollapsed ? 'w-full flex justify-center' : ''}`}
              >
                <Triangle size={10} className={`transition-transform duration-300 ${isPropertiesCollapsed ? '-rotate-90' : 'rotate-90'}`} fill="currentColor" />
              </button>
            </div>

            <div className={`flex-1 overflow-y-auto p-4 space-y-4 ${isPropertiesCollapsed ? 'hidden' : 'block'}`}>
              {selectedState ? (() => {
                const stateErrors = errors.filter(e => e.elementId === selectedState.id && e.source === 'Validation');
                const hasEntryError = stateErrors.some(e => e.message.includes('Entry'));
                const hasDuringError = stateErrors.some(e => e.message.includes('During'));
                const hasExitError = stateErrors.some(e => e.message.includes('Exit'));
                const hasInternalError = stateErrors.some(e => e.message.includes('Internal Transition') || e.message.includes('Internal transition'));
                const hasNameError = stateErrors.some(e => e.message.includes('spaces') || e.message.includes('Duplicate'));

                return (
                  <>
                    <div>
                      <Label>State Name</Label>
                      <Input
                        value={selectedState.name}
                        onChange={(e) => updateState(selectedState.id, { name: e.target.value })}
                        className={`mt-1 ${hasNameError ? 'border-red-500 ring-red-500 focus-visible:ring-red-500' : ''}`}
                      />
                    </div>

                    {stateErrors.map(err => (
                      <div key={err.id} className={`p-3 rounded-lg border text-xs mb-3 ${err.type === 'error' ? 'bg-red-950/20 border-red-900/50 text-red-300' : 'bg-amber-950/20 border-amber-900/50 text-amber-300'}`}>
                        <div className="font-semibold flex items-center gap-1.5 mb-1">
                          {err.type === 'error' ? (
                            <span className="text-red-400">🔴 Error</span>
                          ) : (
                            <span className="text-amber-400">⚠️ Warning</span>
                          )}
                        </div>
                        <p className="mb-2 leading-relaxed whitespace-pre-line">{err.message}</p>
                        {err.canAutoFix && (
                          <div className="flex gap-2 mt-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAutoFix(err)}
                              className="bg-green-600/15 hover:bg-green-600/30 text-green-300 border-green-600/30 text-[10px] h-7 px-2.5"
                            >
                              Auto-Fix
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}

                  <div>
                    <Label>Priority (lower = higher)</Label>
                    <Input
                      type="number"
                      value={selectedState.priority}
                      onChange={(e) => updateState(selectedState.id, { priority: parseInt(e.target.value) || 0 })}
                      className="mt-1"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedState.isParallel}
                      onCheckedChange={(checked) => updateState(selectedState.id, { isParallel: checked as boolean })}
                      id="isParallel"
                    />
                    <Label htmlFor="isParallel">Parallel State</Label>
                  </div>

                  {selectedState.isParallel && (
                    <div>
                      <Label>Region ID</Label>
                      <Input
                        value={selectedState.regionId || ''}
                        onChange={(e) => updateState(selectedState.id, { regionId: e.target.value || null })}
                        placeholder="e.g., main_region"
                        className="mt-1"
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedState.autostart}
                      onCheckedChange={(checked) => updateState(selectedState.id, { autostart: checked as boolean })}
                      id="autostart"
                    />
                    <Label htmlFor="autostart">Auto-start on reset</Label>
                  </div>

                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedState.isSafeState || false}
                      onCheckedChange={(checked) => updateState(selectedState.id, { isSafeState: checked as boolean })}
                      id="isSafeState"
                    />
                    <Label htmlFor="isSafeState" className="text-green-400">Is Safe State</Label>
                  </div>

                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedState.isTerminalState || false}
                      onCheckedChange={(checked) => updateState(selectedState.id, { isTerminalState: checked as boolean })}
                      id="isTerminalState"
                    />
                    <Label htmlFor="isTerminalState" className="text-blue-400">Is Terminal/Safe State</Label>
                  </div>

                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedState.isXBridges || false}
                      onCheckedChange={(checked) => updateState(selectedState.id, { isXBridges: checked as boolean })}
                      id="isXBridges"
                    />
                    <Label htmlFor="isXBridges" className="text-amber-400">X-Bridges Sub-Model</Label>
                  </div>

                  {selectedState.isXBridges && (
                    <div className="space-y-3 p-3 bg-[#1a1a1a] rounded border border-[#f97316]/30">
                      <div className="flex justify-between items-center">
                        <Label className="text-amber-400 font-bold">Variable Mappings</Label>
                        <div className="flex gap-1">
                          {(['in', 'out'] as const).map(direction => {
                            const targets = direction === 'in' ? selectedInputBoundaryTargets : selectedOutputBoundaryTargets;
                            const disabled = mappingVariables.length === 0 || targets.length === 0;
                            return (
                              <Button
                                key={direction}
                                size="sm"
                                disabled={disabled}
                                className="h-5 text-[10px] px-2 bg-amber-600/20 text-amber-500 border-amber-500/50 disabled:opacity-40"
                                onClick={() => {
                                  const mappings = selectedState.xBridgesModel?.mappings || [];
                                  updateState(selectedState.id, {
                                    xBridgesModel: {
                                      ...selectedState.xBridgesModel,
                                      nodes: Array.from(selectedState.xBridgesModel?.nodes || []),
                                      edges: Array.from(selectedState.xBridgesModel?.edges || []),
                                      mappings: [...mappings, createXBBoundaryMapping(mappingVariables[0].id, targets[0])],
                                    },
                                  });
                                }}
                              >{direction === 'in' ? '+ Input' : '+ Output'}</Button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1 thin-scrollbar">
                        {(selectedState.xBridgesModel?.mappings || []).map((map, idx) => (
                          <div key={idx} className="p-2 bg-[#0a0a0a] rounded border border-[#333] space-y-2 relative group">
                            <div className="grid grid-cols-2 gap-2">
                              <div className="flex flex-col gap-1">
                                <Label className="text-[9px] uppercase tracking-wider text-gray-500">SM Variable</Label>
                                <select
                                  value={map.smVarId}
                                  onChange={(e) => {
                                    const newMaps = [...selectedState.xBridgesModel!.mappings!];
                                    newMaps[idx] = { ...map, smVarId: e.target.value };
                                    updateState(selectedState.id, {
                                      xBridgesModel: {
                                        ...selectedState.xBridgesModel,
                                        nodes: Array.from(selectedState.xBridgesModel?.nodes || []),
                                        edges: Array.from(selectedState.xBridgesModel?.edges || []),
                                        mappings: newMaps
                                      }
                                    });
                                  }}
                                  className="w-full h-7 bg-[#1a1a1a] border border-[#333] rounded text-[10px] px-1 text-amber-200"
                                >
                                  {mappingVariables.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                </select>
                              </div>
                              <div className="flex flex-col gap-1">
                                <Label className="text-[9px] uppercase tracking-wider text-gray-500">Direction</Label>
                                <div className="h-7 flex items-center px-2 bg-[#1a1a1a] border border-[#333] rounded text-[10px] text-gray-300">
                                  {map.direction === 'in' ? 'SM → Inport' : 'Outport → SM'}
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-col gap-1">
                              <Label className="text-[9px] uppercase tracking-wider text-gray-500">Boundary</Label>
                              {(() => {
                                const targets = map.direction === 'in' ? selectedInputBoundaryTargets : selectedOutputBoundaryTargets;
                                const selectedTargetIndex = targets.findIndex(target => target.blockId === map.blockId && target.portId === map.portId);
                                return (
                                  <select
                                    value={selectedTargetIndex >= 0 ? String(selectedTargetIndex) : ''}
                                    onChange={(e) => {
                                      const target = targets[Number(e.target.value)];
                                      if (!target) return;
                                      const newMaps = [...selectedState.xBridgesModel!.mappings!];
                                      newMaps[idx] = createXBBoundaryMapping(map.smVarId, target);
                                      updateState(selectedState.id, {
                                        xBridgesModel: {
                                          ...selectedState.xBridgesModel,
                                          nodes: Array.from(selectedState.xBridgesModel?.nodes || []),
                                          edges: Array.from(selectedState.xBridgesModel?.edges || []),
                                          mappings: newMaps,
                                        },
                                      });
                                    }}
                                    className="w-full h-7 bg-[#1a1a1a] border border-[#333] rounded text-[10px] px-1 text-gray-300"
                                  >
                                    {selectedTargetIndex < 0 && <option value="" disabled>Boundary unavailable</option>}
                                    {targets.map((target, targetIndex) => (
                                      <option key={`${target.blockId}:${target.portId}`} value={targetIndex}>
                                        {target.label} · {target.portId}
                                      </option>
                                    ))}
                                  </select>
                                );
                              })()}
                            </div>
                            <button
                              className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                              onClick={() => {
                                const newMaps = selectedState.xBridgesModel!.mappings!.filter((_, i) => i !== idx);
                                updateState(selectedState.id, {
                                  xBridgesModel: {
                                    ...selectedState.xBridgesModel,
                                    nodes: Array.from(selectedState.xBridgesModel?.nodes || []),
                                    edges: Array.from(selectedState.xBridgesModel?.edges || []),
                                    mappings: newMaps
                                  }
                                });
                              }}
                            >
                              <span className="text-white text-[10px]">×</span>
                            </button>
                          </div>
                        ))}
                        {(selectedState.xBridgesModel?.mappings || []).length === 0 && (
                          <div className="text-[10px] text-gray-600 italic text-center py-2">No mappings defined</div>
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <Label>History</Label>
                    <select
                      value={selectedState.historyType || 'none'}
                      onChange={(e) => {
                        const newType = e.target.value as 'none' | 'shallow' | 'deep';
                        updateState(selectedState.id, { historyType: newType });

                        const existing = junctions.find(j => j.parentId === selectedState.id && (j.type === 'history' || j.type === 'deep-history'));
                        if (existing) {
                          deleteJunction(existing.id);
                        }

                        if (newType !== 'none') {
                          createJunction(selectedState.x + 30, selectedState.y + 30, newType === 'shallow' ? 'history' : 'deep-history', selectedState.id);
                        }
                      }}
                      className="w-full h-8 bg-[#0a0a0a] border border-[#333] rounded px-2 text-sm text-[#e0e0e0] mt-1"
                    >
                      <option value="none">None</option>
                      <option value="shallow">Shallow (H)</option>
                      <option value="deep">Deep (H*)</option>
                    </select>
                  </div>

                  <div className={`space-y-2 p-2 bg-[#1a1a1a] rounded border ${hasInternalError ? 'border-red-500' : 'border-[#333]'}`}>
                    <div className="flex justify-between items-center">
                      <Label className="text-[#f97316]">Internal Transitions</Label>
                      <Button size="sm" className="h-5 text-[10px] px-2" onClick={() => {
                        const current = selectedState.internalTransitions ? selectedState.internalTransitions + '\n' : '';
                        updateState(selectedState.id, { internalTransitions: current + '[condition] / action;' });
                      }}>+ Add</Button>
                    </div>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {(selectedState.internalTransitions || '').split('\n').filter(l => l.trim()).map((line, idx) => {
                        const parts = line.split('/');
                        const action = parts.length > 1 ? parts.slice(1).join('/') : '';
                        const triggerPart = parts[0].trim();

                        let type = 'condition';
                        if (triggerPart.includes('&&')) type = 'and';
                        else if (triggerPart.includes('||')) type = 'or';
                        else if (triggerPart.includes('after')) type = 'after';

                        const afterMatch = triggerPart.match(/after\((\d+)\)/);
                        const condMatch = triggerPart.match(/\[(.*?)\]/);
                        const afterTicks = afterMatch ? afterMatch[1] : '';
                        const condition = condMatch ? condMatch[1] : (type === 'condition' ? triggerPart.replace(/[\[\]]/g, '') : '');

                        const updateLine = (newType: string, newCond: string, newAfter: string, newAct: string) => {
                          let newTrigger = '';
                          if (newType === 'condition') newTrigger = `[${newCond}]`;
                          else if (newType === 'after') newTrigger = `after(${newAfter})`;
                          else if (newType === 'and') newTrigger = `[${newCond}] && after(${newAfter})`;
                          else if (newType === 'or') newTrigger = `[${newCond}] || after(${newAfter})`;

                          const allLines = (selectedState.internalTransitions || '').split('\n').filter(l => l.trim());
                          allLines[idx] = `${newTrigger} / ${newAct}`;
                          updateState(selectedState.id, { internalTransitions: allLines.join('\n') });
                        };

                        return (
                          <div key={idx} className="p-2 bg-[#0a0a0a] border border-[#333] rounded space-y-1">
                            <div className="flex gap-1">
                              <select
                                value={type}
                                onChange={e => updateLine(e.target.value, condition, afterTicks, action)}
                                className="h-6 bg-[#1a1a1a] border border-[#333] rounded text-[10px] w-20 px-1 text-[#e0e0e0]"
                              >
                                <option value="condition">Cond</option>
                                <option value="after">After</option>
                                <option value="and">And</option>
                                <option value="or">Or</option>
                              </select>
                              <button onClick={() => {
                                const allLines = (selectedState.internalTransitions || '').split('\n').filter(l => l.trim());
                                allLines.splice(idx, 1);
                                updateState(selectedState.id, { internalTransitions: allLines.join('\n') });
                              }} className="ml-auto text-[#666] hover:text-red-400">×</button>
                            </div>
                            {(type !== 'after') && (
                              <Input value={condition} onChange={e => updateLine(type, e.target.value, afterTicks, action)} placeholder="Condition" className="h-6 text-[10px]" />
                            )}
                            {(type !== 'condition') && (
                              <Input value={afterTicks} onChange={e => updateLine(type, condition, e.target.value, action)} placeholder="Ticks" type="number" className="h-6 text-[10px]" />
                            )}
                            <div className="flex items-center gap-1">
                              <span className="text-[#666] text-[10px]">/</span>
                              <Input value={action.trim()} onChange={e => updateLine(type, condition, afterTicks, e.target.value)} placeholder="Action" className="h-6 text-[10px] flex-1" />
                            </div>
                          </div>
                        );
                      })}
                      {(!selectedState.internalTransitions || !selectedState.internalTransitions.trim()) && (
                        <div className="text-[10px] text-[#666] text-center italic">No internal transitions</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label>Entry Action (C-like)</Label>
                    <textarea
                      value={selectedState.entry}
                      onChange={(e) => updateState(selectedState.id, { entry: e.target.value })}
                      placeholder="/* Entry action */ counter = 0;"
                      className={`w-full h-20 min-h-[4rem] bg-[#1a1a1a] border rounded text-sm font-mono text-[#e0e0e0] p-2 mt-1 resize-y focus:outline-none focus:ring-1 ${hasEntryError ? 'border-red-500 focus:ring-red-500' : 'border-[#333] focus:ring-[#f97316]'}`}
                    />
                  </div>

                  <div>
                    <Label>During Action (C-like)</Label>
                    <textarea
                      value={selectedState.during}
                      onChange={(e) => updateState(selectedState.id, { during: e.target.value })}
                      placeholder="/* During action */ counter++;"
                      className={`w-full h-20 min-h-[4rem] bg-[#1a1a1a] border rounded text-sm font-mono text-[#e0e0e0] p-2 mt-1 resize-y focus:outline-none focus:ring-1 ${hasDuringError ? 'border-red-500 focus:ring-red-500' : 'border-[#333] focus:ring-[#f97316]'}`}
                    />
                  </div>

                  <div className={`space-y-2 p-2 bg-[#1a1a1a] rounded border ${hasInternalError ? 'border-red-500' : 'border-[#333]'}`}>
                    <div className="flex justify-between items-center">
                      <Label className="text-[#f97316]">Internal Transitions</Label>
                      <Button size="sm" className="h-5 text-[10px] px-2" onClick={() => {
                        const current = selectedState.internalTransitions ? selectedState.internalTransitions + '\n' : '';
                        updateState(selectedState.id, { internalTransitions: current + '[condition] / action;' });
                      }}>+ Add</Button>
                    </div>
                    <textarea
                      value={selectedState.internalTransitions || ''}
                      onChange={(e) => updateState(selectedState.id, { internalTransitions: e.target.value })}
                      placeholder="[condition] / action"
                      className={`w-full h-20 min-h-[4rem] bg-[#0a0a0a] border rounded text-xs font-mono text-[#e0e0e0] p-2 mt-1 resize-y focus:outline-none focus:ring-1 ${hasInternalError ? 'border-red-500 focus:ring-red-500' : 'border-[#333] focus:ring-[#f97316]'}`}
                    />
                  </div>

                  <div>
                    <Label>Exit Action (C-like)</Label>
                    <textarea
                      value={selectedState.exit}
                      onChange={(e) => updateState(selectedState.id, { exit: e.target.value })}
                      placeholder="/* Exit action */"
                      className={`w-full h-20 min-h-[4rem] bg-[#1a1a1a] border rounded text-sm font-mono text-[#e0e0e0] p-2 mt-1 resize-y focus:outline-none focus:ring-1 ${hasExitError ? 'border-red-500 focus:ring-red-500' : 'border-[#333] focus:ring-[#f97316]'}`}
                    />
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => enterLayer(selectedState.id)}
                    className="w-full border-[#f97316] text-[#f97316] hover:bg-[#f97316]/10"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1.5">
                      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                    </svg>
                    Enter Layer
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteState(selectedState.id)}
                    className="w-full border-red-800 text-red-400 hover:text-red-300 hover:bg-red-950/30"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1.5">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    Delete State
                  </Button>
                </>
              );
            })() : selectedJunction ? (
                <>
                  <div>
                    <Label>Junction Name</Label>
                    <Input
                      value={selectedJunction.name}
                      onChange={(e) => updateJunction(selectedJunction.id, { name: e.target.value })}
                      className="mt-1"
                    />
                  </div>

                  <div className="flex items-center gap-2 mt-3">
                    <Checkbox
                      checked={selectedJunction.autostart || false}
                      onCheckedChange={(checked) => updateJunction(selectedJunction.id, { autostart: checked as boolean })}
                      id="j-autostart"
                    />
                    <Label htmlFor="j-autostart">Default Transition (Auto-start)</Label>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteJunction(selectedJunction.id)}
                    className="w-full border-red-800 text-red-400 hover:text-red-300 hover:bg-red-950/30"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1.5">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    Delete Junction
                  </Button>
                </>
              ) : selectedBlock ? (
                <>
                  <div>
                    <Label>Block Name</Label>
                    <Input value={selectedBlock.name} onChange={(e) => updateBlock(selectedBlock.id, { name: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <Label>Stereotype</Label>
                    {selectedBlock.stereotype === 'requirement' ? (
                      <div className="w-full h-8 bg-[#0a0a0a] border border-[#333] rounded px-2 py-1 text-sm text-[#e0e0e0]" role="status">
                        Requirement <span className="text-[10px] text-[#888]">(fixed by SysML Requirements semantics)</span>
                      </div>
                    ) : (
                      <select
                        value={selectedBlock.stereotype}
                        onChange={(e) => updateBlock(selectedBlock.id, { stereotype: e.target.value })}
                        className="w-full h-8 bg-[#0a0a0a] border border-[#333] rounded px-2 text-sm text-[#e0e0e0] mt-1"
                      >
                        <option value="block">Block</option>
                        <option value="interface">Interface</option>
                        <option value="interfaceBlock">Interface Block</option>
                        <option value="valueType">ValueType</option>
                        <option value="enumeration">Enumeration</option>
                        <option value="verificationCase">Verification Case</option>
                        {customStereotypes
                          ?.filter(s => s !== 'requirement' && !['block', 'interface', 'interfaceBlock', 'valueType', 'enumeration'].includes(s))
                          .map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                      </select>
                    )}
                  </div>
                  {selectedBlock.stereotype === 'requirement' && (
                    <>
                      {/* Tabs Header */}
                      <div className="flex border-b border-[#333] mb-4">
                        <button
                          onClick={() => setActivePropTab('general')}
                          className={`flex-1 py-1.5 text-xs font-semibold border-b-2 transition-colors ${
                            activePropTab === 'general'
                              ? 'border-[#f97316] text-[#e0e0e0]'
                              : 'border-transparent text-[#666] hover:text-[#aaa]'
                          }`}
                        >
                          General
                        </button>
                        <button
                          onClick={() => setActivePropTab('assign')}
                          className={`flex-1 py-1.5 text-xs font-semibold border-b-2 transition-colors ${
                            activePropTab === 'assign'
                              ? 'border-[#f97316] text-[#e0e0e0]'
                              : 'border-transparent text-[#666] hover:text-[#aaa]'
                          }`}
                        >
                          Assign
                        </button>
                        <button
                          onClick={() => setActivePropTab('governance')}
                          className={`flex-1 py-1.5 text-xs font-semibold border-b-2 transition-colors ${
                            activePropTab === 'governance'
                              ? 'border-[#f97316] text-[#e0e0e0]'
                              : 'border-transparent text-[#666] hover:text-[#aaa]'
                          }`}
                        >
                          Governance
                        </button>
                      </div>

                      {activePropTab === 'general' && (
                        <>
                          <div><Label>Req ID</Label><Input value={selectedBlock.reqId || ''} onChange={(e) => updateBlock(selectedBlock.id, { reqId: e.target.value })} className="mt-1" /></div>
                          <div><Label>Status</Label>
                            <select value={selectedBlock.status || ''} onChange={(e) => {
                              const validation = validateLegacyRequirementStatusTransition(blocks, relationships, selectedBlock.id, e.target.value);
                              if (!validation.valid) addError('error', `Invalid requirement status: ${validation.reason}`);
                              else updateBlock(selectedBlock.id, { status: e.target.value });
                            }} className="w-full h-8 bg-[#0a0a0a] border border-[#333] rounded px-2 text-sm text-[#e0e0e0] mt-1">
                              <option value="Draft">Draft</option>
                              <option value="Approved">Approved</option>
                              <option value="Verified">Verified</option>
                              <option value="Implemented">Implemented</option>
                              <option value="Failed">Failed</option>
                              <option value="Stale">Stale</option>
                              <option value="Retired">Retired</option>
                            </select>
                          </div>
                          <div><Label>Priority</Label>
                            <select value={selectedBlock.priority || ''} onChange={(e) => updateBlock(selectedBlock.id, { priority: e.target.value })} className="w-full h-8 bg-[#0a0a0a] border border-[#333] rounded px-2 text-sm text-[#e0e0e0] mt-1">
                              <option value="High">High</option>
                              <option value="Medium">Medium</option>
                              <option value="Low">Low</option>
                              <option value="Critical">Critical</option>
                            </select>
                          </div>
                          <div><Label>Description</Label><textarea value={selectedBlock.description || ''} onChange={(e) => updateBlock(selectedBlock.id, { description: e.target.value })} className="w-full h-20 min-h-[4rem] bg-[#1a1a1a] border border-[#333] rounded text-sm font-mono text-[#e0e0e0] p-2 mt-1 resize-y focus:outline-none focus:ring-1 focus:ring-[#f97316]" /></div>
                          <div>
                            <Label>Risk</Label>
                            <select value={selectedBlock.risk || 'Medium'} onChange={(e) => updateBlock(selectedBlock.id, { risk: e.target.value })} className="w-full h-8 bg-[#0a0a0a] border border-[#333] rounded px-2 text-sm text-[#e0e0e0] mt-1">
                              <option value="High">High</option>
                              <option value="Medium">Medium</option>
                              <option value="Low">Low</option>
                              <option value="Critical">Critical</option>
                            </select>
                          </div>
                          <div>
                            <Label>Verification Method</Label>
                            <select value={selectedBlock.verificationMethod || 'Test'} onChange={(e) => updateBlock(selectedBlock.id, { verificationMethod: e.target.value })} className="w-full h-8 bg-[#0a0a0a] border border-[#333] rounded px-2 text-sm text-[#e0e0e0] mt-1">
                              <option value="Test">Test</option>
                              <option value="Analysis">Analysis</option>
                              <option value="Inspection">Inspection</option>
                              <option value="Demonstration">Demonstration</option>
                            </select>
                          </div>
                          <div><Label>Source</Label><Input value={selectedBlock.source || ''} onChange={(e) => updateBlock(selectedBlock.id, { source: e.target.value })} className="mt-1" /></div>
                          <div><Label>Version</Label><Input value={selectedBlock.version || '1.0'} onChange={(e) => updateBlock(selectedBlock.id, { version: e.target.value })} className="mt-1" /></div>
                          <div><Label>Rationale</Label><textarea value={selectedBlock.rationale || ''} onChange={(e) => updateBlock(selectedBlock.id, { rationale: e.target.value })} className="w-full h-16 bg-[#1a1a1a] border border-[#333] rounded text-sm text-[#e0e0e0] p-2 mt-1" /></div>
                          <div><Label>Baseline ID</Label><Input value={selectedBlock.baselineId || ''} onChange={(e) => updateBlock(selectedBlock.id, { baselineId: e.target.value || undefined })} className="mt-1" /></div>

                          <div className="mt-4 pt-3 border-t border-[#333]">
                            <Label className="flex items-center justify-between text-xs font-semibold text-[#aaa] mb-2">
                              <span>Attached PDFs</span>
                              <span className="text-[10px] text-[#666]">({(selectedBlock.attachedFiles || []).length})</span>
                            </Label>
                            
                            <div className="space-y-2 mb-2 max-h-40 overflow-y-auto">
                              {(!selectedBlock.attachedFiles || selectedBlock.attachedFiles.length === 0) ? (
                                <div className="text-xs text-[#666] italic py-1">No PDF files attached.</div>
                              ) : (
                                selectedBlock.attachedFiles.map((file, idx) => (
                                  <div key={idx} className="flex items-center justify-between bg-[#0a0a0a] p-2 rounded border border-[#333] gap-2">
                                    <div className="flex items-center gap-2 overflow-hidden flex-1">
                                      <FileText size={14} className="text-[#f97316] shrink-0" />
                                      <span className="text-xs text-[#e0e0e0] truncate" title={file.name}>
                                        {file.name}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        onClick={() => {
                                          try {
                                            const base64Parts = file.content.split(',');
                                            const mime = base64Parts[0].match(/:(.*?);/)?.[1] || 'application/pdf';
                                            const byteString = atob(base64Parts[1]);
                                            const ab = new ArrayBuffer(byteString.length);
                                            const ia = new Uint8Array(ab);
                                            for (let i = 0; i < byteString.length; i++) {
                                              ia[i] = byteString.charCodeAt(i);
                                            }
                                            const blob = new Blob([ab], { type: mime });
                                            const url = URL.createObjectURL(blob);
                                            window.open(url, '_blank');
                                          } catch (err) {
                                            console.error('Error opening PDF:', err);
                                            addError('error', 'Failed to open PDF.');
                                          }
                                        }}
                                        title="View PDF"
                                        className="p-1 hover:bg-[#222] rounded text-[#aaa] hover:text-[#f97316] transition-colors"
                                      >
                                        <Eye size={12} />
                                      </button>
                                      <button
                                        onClick={() => {
                                          try {
                                            const base64Parts = file.content.split(',');
                                            const mime = base64Parts[0].match(/:(.*?);/)?.[1] || 'application/pdf';
                                            const byteString = atob(base64Parts[1]);
                                            const ab = new ArrayBuffer(byteString.length);
                                            const ia = new Uint8Array(ab);
                                            for (let i = 0; i < byteString.length; i++) {
                                              ia[i] = byteString.charCodeAt(i);
                                            }
                                            const blob = new Blob([ab], { type: mime });
                                            const url = URL.createObjectURL(blob);
                                            const link = document.createElement('a');
                                            link.href = url;
                                            link.download = file.name;
                                            link.click();
                                            URL.revokeObjectURL(url);
                                          } catch (err) {
                                            console.error('Error downloading PDF:', err);
                                            addError('error', 'Failed to download PDF.');
                                          }
                                        }}
                                        title="Download PDF"
                                        className="p-1 hover:bg-[#222] rounded text-[#aaa] hover:text-[#f97316] transition-colors"
                                      >
                                        <Download size={12} />
                                      </button>
                                      <button
                                        onClick={() => {
                                          const currentFiles = selectedBlock.attachedFiles || [];
                                          const updatedFiles = currentFiles.filter((_, i) => i !== idx);
                                          updateBlock(selectedBlock.id, { attachedFiles: updatedFiles });
                                          addError('info', `Removed PDF: ${file.name}`);
                                        }}
                                        title="Remove PDF"
                                        className="p-1 hover:bg-[#222] rounded text-[#aaa] hover:text-red-400 transition-colors"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>

                            <div>
                              <input
                                type="file"
                                id="req-pdf-upload"
                                accept=".pdf"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
                                    addError('error', 'Only PDF files are supported.');
                                    return;
                                  }
                                  const reader = new FileReader();
                                  reader.onload = (event) => {
                                    const base64Content = event.target?.result as string;
                                    const currentFiles = selectedBlock.attachedFiles || [];
                                    const updatedFiles = [...currentFiles, { name: file.name, content: base64Content }];
                                    updateBlock(selectedBlock.id, { attachedFiles: updatedFiles });
                                    addError('info', `Attached PDF: ${file.name}`);
                                  };
                                  reader.readAsDataURL(file);
                                  e.target.value = '';
                                }}
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => document.getElementById('req-pdf-upload')?.click()}
                                className="w-full flex items-center justify-center gap-2 border-[#333] hover:border-[#f97316] hover:bg-[#f97316]/10 text-xs mt-1"
                              >
                                <Upload size={12} />
                                Attach PDF File
                              </Button>
                            </div>
                          </div>
                        </>
                      )}
                      {activePropTab === 'assign' && (
                        <div className="space-y-4">
                          <div>
                            <Label>Assigned To</Label>
                            <Input
                              value={selectedBlock.assignedTo || ''}
                              onChange={(e) => updateBlock(selectedBlock.id, { assignedTo: e.target.value })}
                              className="mt-1"
                              placeholder="e.g. John Doe, Control Team, Subsystem A"
                            />
                          </div>

                          <div>
                            <span className="text-[10px] text-[#888] uppercase font-bold tracking-wider">Quick Team Assignment</span>
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {["Control Team", "Hardware Team", "Software Team", "Mechanical Design", "Safety Engineer", "QA Team", "System Architect"].map(team => (
                                <button
                                  key={team}
                                  onClick={() => updateBlock(selectedBlock.id, { assignedTo: team })}
                                  className={`px-2 py-1 rounded text-[10px] border transition-colors ${
                                    selectedBlock.assignedTo === team
                                      ? 'bg-[#f97316]/20 text-[#f97316] border-[#f97316]/30'
                                      : 'bg-[#111] text-[#aaa] border-[#333] hover:border-[#555]'
                                  }`}
                                >
                                  {team}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="bg-[#111] border border-[#222] p-3 rounded text-[11px] text-[#888] space-y-1.5">
                            <span className="font-bold text-[#aaa]">About Assignment</span>
                            <p>Assigning a requirement establishes clear ownership for implementing and validating it. The assignee or team is displayed directly in the **Requirements Traceability Matrix (RTM)**.</p>
                          </div>
                        </div>
                      )}
                      {activePropTab === 'governance' && (() => {
                        const reqDef = canonicalSysmlRepository.requirements[selectedBlock.id] || {
                          id: selectedBlock.id,
                          requirementId: selectedBlock.reqId || selectedBlock.id,
                          name: selectedBlock.name,
                          text: selectedBlock.description || '',
                          status: selectedBlock.status,
                          priority: selectedBlock.priority,
                          risk: selectedBlock.risk,
                          verificationMethod: selectedBlock.verificationMethod,
                          baselineId: selectedBlock.baselineId,
                          version: selectedBlock.version || '1.0',
                          copiedFromId: (selectedBlock as any).copiedFromId,
                        };
                        const masterReq = reqDef.copiedFromId ? canonicalSysmlRepository.requirements[reqDef.copiedFromId] : undefined;
                        const suspectLinks = selectSuspectLinks(sysmlStore, selectedBlock.id);
                        const evidenceHistory = selectEvidenceForRequirement(sysmlStore, selectedBlock.id);
                        // Projection-only deletion preview: analyze without
                        // mutating, so the panel can show typed severity,
                        // unresolved usages, evidence fallout, and protected
                        // baseline blocks before any confirmation dialog.
                        const deletionPreview = analyzeMutation(canonicalSysmlRepository, { kind: 'deleteElements', elementIds: [selectedBlock.id] });

                        return (
                          <RequirementGovernancePanel
                            requirement={reqDef}
                            masterRequirement={masterReq}
                            baselines={canonicalSysmlRepository.baselines}
                            suspectLinks={suspectLinks}
                            evidenceHistory={evidenceHistory}
                            deletionSeverity={impactSeverity(deletionPreview, authorizedBaselineIds)}
                            unresolvedUsageIds={deletionPreview.unresolvedUsageIds}
                            invalidatedEvidenceIds={deletionPreview.invalidatedEvidenceIds}
                            blockedBaselineIds={deletionPreview.affectedBaselineIds.filter(id => !authorizedBaselineIds.includes(id))}
                            onCreateBaseline={(name) => {
                              const res = createModelBaseline(canonicalSysmlRepository, name);
                              setCanonicalSysmlRepository(res.repository);
                              addError('info', `Created baseline: ${name}`);
                            }}
                            onCloneBaseline={(baselineId) => {
                              const res = cloneProtectedBaselineAsWorkingCopy(canonicalSysmlRepository, baselineId, `Working copy of ${baselineId}`);
                              setCanonicalSysmlRepository(res.repository);
                              addError('info', `Cloned protected baseline ${baselineId} into unprotected working copy ${res.baseline.id}`);
                            }}
                            onAuthorizeBaseline={(baselineId) => {
                              setAuthorizedBaselineIds(prev => prev.includes(baselineId) ? prev : [...prev, baselineId]);
                              addError('info', `Recorded explicit deletion authorization for protected baseline ${baselineId}`);
                            }}
                            onClearSuspect={(relId) => {
                              const updated = clearSuspectLink(canonicalSysmlRepository, relId);
                              setCanonicalSysmlRepository(updated);
                              addError('info', `Cleared suspect flag on link: ${relId}`);
                            }}
                            onSyncFromMaster={() => {
                              const res = synchronizeRequirementCopy(canonicalSysmlRepository, selectedBlock.id);
                              setCanonicalSysmlRepository(res.repository);
                              if (masterReq) {
                                updateBlock(selectedBlock.id, {
                                  name: masterReq.name,
                                  description: masterReq.text,
                                  status: masterReq.status,
                                  version: masterReq.version,
                                  priority: masterReq.priority,
                                  risk: masterReq.risk,
                                });
                              }
                              addError('info', 'Synchronized copy requirement from master');
                            }}
                          />
                        );
                      })()}
                    </>
                  )}
                  {selectedBlock.stereotype === 'verificationCase' && (
                    <div className="space-y-3 border-t border-[#333] pt-3">
                      <div><Label>Verification Method</Label><Input value={selectedBlock.verificationMethod || 'Test'} onChange={(e) => updateBlock(selectedBlock.id, { verificationMethod: e.target.value })} className="mt-1" /></div>
                      <div><Label>Result</Label>
                        <select value={selectedBlock.verificationResult || ''} onChange={(e) => updateBlock(selectedBlock.id, { verificationResult: e.target.value ? e.target.value as 'passed' | 'failed' : undefined, executedAt: e.target.value ? new Date().toISOString() : undefined })} className="w-full h-8 bg-[#0a0a0a] border border-[#333] rounded px-2 text-sm text-[#e0e0e0] mt-1">
                          <option value="">Not Executed</option><option value="passed">Passed</option><option value="failed">Failed</option>
                        </select>
                      </div>
                      <div><Label>Evidence Artifact URI</Label><Input value={selectedBlock.artifactUri || ''} onChange={(e) => updateBlock(selectedBlock.id, { artifactUri: e.target.value })} className="mt-1" /></div>
                      {selectedBlock.executedAt && <div className="text-[10px] text-[#777]">Executed: {selectedBlock.executedAt}</div>}
                    </div>
                  )}
                  {selectedBlock.stereotype === 'block' && (
                    <div className="space-y-2 border-t border-[#333] pt-3">
                      <div><Label>Namespace</Label><Input value={(selectedBlock.namespace || []).join('::')} onChange={(e) => updateBlock(selectedBlock.id, { namespace: e.target.value.split('::').map(value => value.trim()).filter(Boolean) })} className="mt-1" /></div>
                      <label className="flex items-center gap-2 text-xs text-[#aaa]"><input type="checkbox" checked={Boolean(selectedBlock.isAbstract)} onChange={(e) => updateBlock(selectedBlock.id, { isAbstract: e.target.checked })} /> Abstract</label>
                      <label className="flex items-center gap-2 text-xs text-[#aaa]"><input type="checkbox" checked={Boolean(selectedBlock.isLeaf)} onChange={(e) => updateBlock(selectedBlock.id, { isLeaf: e.target.checked })} /> Leaf</label>
                    </div>
                  )}
                  <div>
                    <Label>Ports</Label>
                    <div className="space-y-1 mt-1 max-h-40 overflow-y-auto">
                      {selectedBlock.ports.map((port, i) => (
                        <div key={port.id} className="flex items-center gap-1 bg-[#0a0a0a] p-1 rounded border border-[#333]">
                          <Input
                            value={port.name}
                            onChange={(e) => {
                              const newPorts = [...selectedBlock.ports];
                              newPorts[i] = { ...port, name: e.target.value };
                              updateBlock(selectedBlock.id, { ports: newPorts });
                            }}
                            className="w-16 h-6 text-[10px] px-1"
                            placeholder="Name"
                          />
                          <span className="text-[#666] text-[10px]">:</span>
                          <Input
                            value={port.type}
                            onChange={(e) => {
                              const newPorts = [...selectedBlock.ports];
                              newPorts[i] = { ...port, type: e.target.value };
                              updateBlock(selectedBlock.id, { ports: newPorts });
                            }}
                            className="w-16 h-6 text-[10px] px-1"
                            placeholder="Type"
                          />
                          <select
                            value={port.kind || 'standard'}
                            onChange={(e) => {
                              const newPorts = [...selectedBlock.ports];
                              newPorts[i] = { ...port, kind: e.target.value as any };
                              updateBlock(selectedBlock.id, { ports: newPorts });
                            }}
                            className="h-6 bg-[#1a1a1a] border border-[#333] rounded text-[10px] w-14 px-0 text-[#e0e0e0]"
                          >
                            <option value="standard">Std</option>
                            <option value="flow">Flow</option>
                            <option value="proxy">Proxy</option>
                          </select>
                          {port.kind === 'flow' && (
                            <>
                              <select
                                value={port.direction || 'in'}
                                onChange={(e) => {
                                  const newPorts = [...selectedBlock.ports];
                                  newPorts[i] = { ...port, direction: e.target.value as any };
                                  updateBlock(selectedBlock.id, { ports: newPorts });
                                }}
                                className="h-6 bg-[#1a1a1a] border border-[#333] rounded text-[10px] w-10 px-0 text-[#e0e0e0]"
                              >
                                <option value="in">In</option>
                                <option value="out">Out</option>
                                <option value="inout">I/O</option>
                              </select>
                              <Input
                                value={port.unit || ''}
                                onChange={(e) => {
                                  const newPorts = [...selectedBlock.ports];
                                  newPorts[i] = { ...port, unit: e.target.value };
                                  updateBlock(selectedBlock.id, { ports: newPorts });
                                }}
                                className="w-10 h-6 text-[10px] px-1" placeholder="Unit"
                              />
                            </>
                          )}
                          <button
                            onClick={() => {
                              const newPorts = selectedBlock.ports.filter(p => p.id !== port.id);
                              updateBlock(selectedBlock.id, { ports: newPorts });
                            }}
                            className="text-[#666] hover:text-red-400 ml-auto px-1"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-1 mt-2">
                      <Button size="sm" onClick={() => handleAddPortToSelected('standard')} className="h-6 text-[10px] px-2 bg-[#f97316]/20 text-[#f97316] hover:bg-[#f97316]/30 border border-[#f97316]/50">+ Std</Button>
                      <Button size="sm" onClick={() => handleAddPortToSelected('flow')} className="h-6 text-[10px] px-2 bg-[#6c9ac6]/20 text-[#6c9ac6] hover:bg-[#6c9ac6]/30 border border-[#6c9ac6]/50">+ Flow</Button>
                      <Button size="sm" onClick={() => handleAddPortToSelected('proxy')} className="h-6 text-[10px] px-2 bg-[#c96c8a]/20 text-[#c96c8a] hover:bg-[#c96c8a]/30 border border-[#c96c8a]/50">+ Proxy</Button>
                    </div>
                  </div>
                  <div>
                    <Label>Operations (one per line)</Label>
                    <textarea
                      value={selectedBlock.operations.join('\n')}
                      onChange={(e) => updateBlock(selectedBlock.id, { operations: e.target.value.split('\n').filter(s => s) })}
                      className="w-full h-20 min-h-[4rem] bg-[#1a1a1a] border border-[#333] rounded text-sm font-mono text-[#e0e0e0] p-2 mt-1 resize-y focus:outline-none focus:ring-1 focus:ring-[#f97316]"
                      placeholder="myOperation(arg: Type): ReturnType"
                    />
                  </div>
                  <div>
                    <Label>Constraints (one per line)</Label>
                    <textarea
                      value={(selectedBlock.constraints || []).join('\n')}
                      onChange={(e) => updateBlock(selectedBlock.id, { constraints: e.target.value.split('\n').filter(s => s) })}
                      className="w-full h-20 min-h-[4rem] bg-[#1a1a1a] border border-[#333] rounded text-sm font-mono text-[#e0e0e0] p-2 mt-1 resize-y focus:outline-none focus:ring-1 focus:ring-[#f97316]"
                      placeholder="x > 0"
                    />
                  </div>
                  <div>
                    <Label>Nested Classes / Parts</Label>
                    <textarea
                      value={(selectedBlock.classes || []).join('\n')}
                      onChange={(e) => updateBlock(selectedBlock.id, { classes: e.target.value.split('\n').filter(s => s) })}
                      className="w-full h-20 min-h-[4rem] bg-[#1a1a1a] border border-[#333] rounded text-sm font-mono text-[#e0e0e0] p-2 mt-1 resize-y focus:outline-none focus:ring-1 focus:ring-[#f97316]"
                      placeholder="ClassName : Type"
                    />
                  </div>
                  <div>
                    <Label>Properties</Label>
                    <BlockPropertiesEditor
                      properties={selectedBlock.properties}
                      typeOptions={blocks.filter(block => block.stereotype !== 'requirement')}
                      inheritedProperties={inheritedProperties(blocks, relationships, selectedBlock.id)}
                      onChange={(properties) => updateBlock(selectedBlock.id, { properties })}
                    />
                    {(() => {
                      const result = validateLegacyBlockProperties(blocks, relationships, selectedBlock.id);
                      return !result.valid && <div role="alert" className="mt-2 text-xs text-red-400">{result.messages.join('; ')}</div>;
                    })()}
                  </div>
                  <div>
                    <Label>Satisfied Requirements</Label>
                    <select
                      multiple
                      value={selectedBlock.satisfiedReqIds || []}
                      onChange={(e) => {
                        const selected = Array.from(e.target.selectedOptions, option => option.value);
                        updateBlock(selectedBlock.id, { satisfiedReqIds: selected });
                      }}
                      className="w-full h-20 bg-[#0a0a0a] border border-[#333] rounded px-2 text-sm text-[#e0e0e0] mt-1"
                    >
                      {blocks.filter(b => b.stereotype === 'requirement').map(req => (
                        <option key={req.id} value={req.id}>{req.reqId}: {req.name}</option>
                      ))}
                    </select>
                    <div className="text-[10px] text-[#666] mt-1">Hold Ctrl to select multiple</div>
                  </div>
                  <div className="flex flex-col gap-2 mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeFromDiagram(selectedBlock.id)}
                      className="w-full border-[#444] text-[#ccc] hover:bg-[#222]"
                    >
                      Remove from Diagram
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteBlock(selectedBlock.id)}
                      className="w-full border-red-800 text-red-400 hover:bg-red-950/30"
                    >
                      Delete from Model…
                    </Button>
                  </div>
                </>
              ) : selectedRelationship ? (
                <>
                  <div>
                    <Label>Label</Label>
                    <Input value={selectedRelationship.label} onChange={(e) => updateRelationship(selectedRelationship.id, { label: e.target.value })} className="mt-1" />
                  </div>
                  <RelationshipEndEditor
                    relationship={{
                      id: selectedRelationship.id,
                      kind: selectedRelationship.type === 'aggregation' ? 'sharedAggregation' : selectedRelationship.type === 'derive' ? 'deriveReqt' : selectedRelationship.type as any,
                      sourceId: selectedRelationship.sourceId,
                      targetId: selectedRelationship.targetId,
                      sourceRole: (selectedRelationship as any).sourceRole,
                      targetRole: (selectedRelationship as any).targetRole,
                      sourceMultiplicity: safeParseMultiplicity(selectedRelationship.sourceMultiplicity),
                      targetMultiplicity: safeParseMultiplicity(selectedRelationship.targetMultiplicity),
                      sourceNavigable: (selectedRelationship as any).sourceNavigable,
                      targetNavigable: (selectedRelationship as any).targetNavigable,
                      sourceAggregation: (selectedRelationship as any).sourceAggregation,
                      targetAggregation: (selectedRelationship as any).targetAggregation,
                    }}
                    diagnostics={
                      canonicalSysmlRepository.relationships[selectedRelationship.id]
                        ? selectedRelationship.type === 'requirementContainment'
                          ? validateRequirementContainment(canonicalSysmlRepository, selectedRelationship.id)
                          : validateAssociationEnds(canonicalSysmlRepository, selectedRelationship.id)
                        : []
                    }
                    sourceIsRequirement={blocks.find(b => b.id === selectedRelationship.sourceId)?.stereotype === 'requirement'}
                    targetIsRequirement={blocks.find(b => b.id === selectedRelationship.targetId)?.stereotype === 'requirement'}
                    sourceEndpoint={resolveUiConnectionEndpoint({ blocks, parts }, selectedRelationship.sourceId)}
                    targetEndpoint={resolveUiConnectionEndpoint({ blocks, parts }, selectedRelationship.targetId)}
                    diagram={diagramMode === 'ibd' ? 'ibd' : diagramMode === 'requirements' ? 'requirements' : 'bdd'}
                    onInvalidChange={(rejection) => showConnectionPolicyError(rejection, selectedRelationship.id)}
                    onChange={(updatedRel) => {
                      updateRelationship(selectedRelationship.id, {
                        type: updatedRel.kind === 'sharedAggregation' ? 'aggregation' : updatedRel.kind === 'deriveReqt' ? 'derive' : updatedRel.kind as any,
                        sourceRole: updatedRel.sourceRole,
                        targetRole: updatedRel.targetRole,
                        sourceMultiplicity: updatedRel.sourceMultiplicity ? `${updatedRel.sourceMultiplicity.lower}..${updatedRel.sourceMultiplicity.upper}` : undefined,
                        targetMultiplicity: updatedRel.targetMultiplicity ? `${updatedRel.targetMultiplicity.lower}..${updatedRel.targetMultiplicity.upper}` : undefined,
                        sourceNavigable: updatedRel.sourceNavigable,
                        targetNavigable: updatedRel.targetNavigable,
                        sourceAggregation: updatedRel.sourceAggregation,
                        targetAggregation: updatedRel.targetAggregation,
                      } as any);
                    }}
                  />
                  <Button variant="outline" size="sm" onClick={() => deleteRelationship(selectedRelationship.id)} className="w-full border-red-800 text-red-400 hover:bg-red-950/30">Delete Relation</Button>
                </>
              ) : selectedPart ? (
                <>
                  <div>
                    <Label>Part Name</Label>
                    <Input value={selectedPart.name} onChange={(e) => updatePart(selectedPart.id, { name: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <Label>Multiplicity</Label>
                    <Input value={selectedPart.multiplicity || ''} onChange={(e) => updatePart(selectedPart.id, { multiplicity: e.target.value })} className="mt-1" placeholder="1" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <Label>Block Type</Label>
                      <button
                        type="button"
                        onClick={() => {
                          const defId = uuidv4();
                          const defName = `${selectedPart.name}_Def`;
                          const defBlock: BlockData = {
                            id: defId,
                            name: defName,
                            stereotype: 'block',
                            classes: [],
                            x: 100,
                            y: 100,
                            width: 150,
                            height: 100,
                            properties: [],
                            operations: [],
                            constraints: [],
                            ports: []
                          };
                          const candidate = { ...selectedPart, typeId: defId };
                          const reconciled = reconcilePropertyUsages(
                            [...blocks, defBlock],
                            parts.map(part => part.id === selectedPart.id ? candidate : part),
                            connectors,
                            candidate.blockId || currentLayerId,
                            'usage',
                          );
                          setBlocks(reconciled.blocks);
                          setParts(reconciled.parts);
                          setConnectors(reconciled.connectors);
                          addError('info', `Created definition '${defName}' for part.`);
                        }}
                        className="text-[10px] text-[#f97316] hover:underline cursor-pointer"
                      >
                        + New Block Def
                      </button>
                    </div>
                    <select
                      value={selectedPart.typeId || ''}
                      onChange={(e) => updatePart(selectedPart.id, { typeId: e.target.value || null })}
                      className="w-full h-8 bg-[#0a0a0a] border border-[#333] rounded px-2 text-sm text-[#e0e0e0] mt-1"
                    >
                      <option value="">Select a Block...</option>
                      {blocks.filter(b => b.stereotype === 'block').map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Property Semantics</Label>
                    <select
                      value={selectedPart.aggregation === 'reference' ? 'reference' : 'composite'}
                      onChange={(e) => updatePart(selectedPart.id, { aggregation: e.target.value as 'composite' | 'reference' })}
                      className="w-full h-8 bg-[#0a0a0a] border border-[#333] rounded px-2 text-sm text-[#e0e0e0] mt-1"
                    >
                      <option value="composite">Composite Part</option>
                      <option value="reference">Reference Property</option>
                    </select>
                  </div>

                  {/* Ports Editor for the underlying Block */}
                  {(() => {
                    const block = blocks.find(b => b.id === selectedPart.typeId);
                    if (block) {
                      return (
                        <div className="p-2 bg-[#1a1a1a] border border-[#333] rounded mt-2">
                          <Label className="text-[#f97316]">Block Ports ({block.name})</Label>
                          <div className="space-y-1 mt-1 max-h-40 overflow-y-auto">
                            {block.ports.map((port, i) => (
                              <div key={port.id} className="flex items-center gap-1 bg-[#0a0a0a] p-1 rounded border border-[#333]">
                                <Input
                                  value={port.name}
                                  onChange={(e) => {
                                    const newPorts = [...block.ports];
                                    newPorts[i] = { ...port, name: e.target.value };
                                    updateBlock(block.id, { ports: newPorts });
                                  }}
                                  className="w-16 h-6 text-[10px] px-1"
                                />
                                <span className="text-[#666] text-[10px]">:</span>
                                <Input
                                  value={port.type}
                                  onChange={(e) => {
                                    const newPorts = [...block.ports];
                                    newPorts[i] = { ...port, type: e.target.value };
                                    updateBlock(block.id, { ports: newPorts });
                                  }}
                                  className="w-16 h-6 text-[10px] px-1"
                                />
                                <select
                                  value={port.kind || 'standard'}
                                  onChange={(e) => {
                                    const newPorts = [...block.ports];
                                    newPorts[i] = { ...port, kind: e.target.value as any };
                                    updateBlock(block.id, { ports: newPorts });
                                  }}
                                  className="h-6 bg-[#1a1a1a] border border-[#333] rounded text-[10px] w-14 px-0 text-[#e0e0e0]"
                                >
                                  <option value="standard">Std</option>
                                  <option value="flow">Flow</option>
                                  <option value="proxy">Proxy</option>
                                </select>
                                <button
                                  onClick={() => {
                                    const newPorts = block.ports.filter(p => p.id !== port.id);
                                    updateBlock(block.id, { ports: newPorts });
                                  }}
                                  className="text-[#666] hover:text-red-400 ml-auto px-1"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-1 mt-2">
                            <Button size="sm" onClick={() => handleAddPortToSelected('standard')} className="h-6 text-[10px] px-2 bg-[#f97316]/20 text-[#f97316] hover:bg-[#f97316]/30 border border-[#f97316]/50">+ Std</Button>
                            <Button size="sm" onClick={() => handleAddPortToSelected('flow')} className="h-6 text-[10px] px-2 bg-[#6c9ac6]/20 text-[#6c9ac6] hover:bg-[#6c9ac6]/30 border border-[#6c9ac6]/50">+ Flow</Button>
                            <Button size="sm" onClick={() => handleAddPortToSelected('proxy')} className="h-6 text-[10px] px-2 bg-[#c96c8a]/20 text-[#c96c8a] hover:bg-[#c96c8a]/30 border border-[#c96c8a]/50">+ Proxy</Button>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  <div>
                    <Label>Satisfied Requirements</Label>
                    <select
                      multiple
                      value={selectedPart.satisfiedReqIds || []}
                      onChange={(e) => {
                        const selected = Array.from(e.target.selectedOptions, option => option.value);
                        updatePart(selectedPart.id, { satisfiedReqIds: selected });
                      }}
                      className="w-full h-20 bg-[#0a0a0a] border border-[#333] rounded px-2 text-sm text-[#e0e0e0] mt-1"
                    >
                      {blocks.filter(b => b.stereotype === 'requirement').map(req => (
                        <option key={req.id} value={req.id}>{req.reqId}: {req.name}</option>
                      ))}
                    </select>
                    <div className="text-[10px] text-[#666] mt-1">Hold Ctrl to select multiple</div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => deletePart(selectedPart.id)} className="w-full border-red-800 text-red-400 hover:bg-red-950/30">Delete Part</Button>
                </>
              ) : selectedConnector ? (
                <>
                  <IbdConnectorEditor
                    connector={{
                      id: selectedConnector.id,
                      kind: selectedConnector.kind || 'assembly',
                      ownerId: currentLayerId,
                      sourcePortId: `${selectedConnector.sourcePartId}::${selectedConnector.sourcePortId}`,
                      targetPortId: `${selectedConnector.targetPartId}::${selectedConnector.targetPortId}`,
                      itemFlowId: selectedConnector.itemFlow,
                      sourceParameterId: (selectedConnector as any).sourceParameterId,
                      targetParameterId: (selectedConnector as any).targetParameterId,
                      itemProperty: (selectedConnector as any).itemProperty,
                      itemUnit: (selectedConnector as any).itemUnit,
                    }}
                    availablePorts={parts.filter(p => p.blockId === currentLayerId).flatMap(p => {
                      const b = blocks.find(b => b.id === p.typeId);
                      return (b?.ports || []).map(port => ({
                        id: `${p.id}::${port.id}`,
                        name: port.name,
                        ownerName: p.name,
                      }));
                    })}
                    definitions={canonicalSysmlRepository.definitions}
                    diagnostics={canonicalSysmlRepository.connectors[selectedConnector.id] ? validateConnector(canonicalSysmlRepository, selectedConnector.id) : []}
                    onChange={(updatedConn) => {
                      const [srcPart, srcPort] = updatedConn.sourcePortId.split('::');
                      const [tgtPart, tgtPort] = updatedConn.targetPortId.split('::');
                      updateConnector(selectedConnector.id, {
                        kind: updatedConn.kind,
                        sourcePartId: srcPart || selectedConnector.sourcePartId,
                        sourcePortId: srcPort || selectedConnector.sourcePortId,
                        targetPartId: tgtPart || selectedConnector.targetPartId,
                        targetPortId: tgtPort || selectedConnector.targetPortId,
                        itemFlow: updatedConn.itemFlowId,
                        sourceParameterId: updatedConn.sourceParameterId,
                        targetParameterId: updatedConn.targetParameterId,
                        itemProperty: updatedConn.itemProperty,
                        itemUnit: updatedConn.itemUnit,
                      } as any);
                    }}
                  />
                  <div className="mt-2">
                    <Label>Label (Text)</Label>
                    <Input value={selectedConnector.label || ''} onChange={(e) => updateConnector(selectedConnector.id, { label: e.target.value })} className="mt-1" placeholder="e.g., Control Link" />
                  </div>
                  <Button variant="outline" size="sm" onClick={() => deleteConnector(selectedConnector.id)} className="w-full border-red-800 text-red-400 hover:bg-red-950/30">Delete Connector</Button>
                </>
              ) : selectedInterfaceRealization ? (
                <>
                  <div>
                    <Label>Interface Connection</Label>
                    <p className="text-xs text-[#888] mt-1">Connects an interface to a part's port.</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => deleteInterfaceRealization(selectedInterfaceRealization.id)} className="w-full border-red-800 text-red-400 hover:bg-red-950/30">Delete Connection</Button>
                </>
              ) : selectedTransition ? (
                <>
                  <div>
                    <Label>Transition Properties</Label>
                    <div className="text-sm text-[#888] mt-1 mb-2">
                      {states.find(s => s.id === selectedTransition.sourceId)?.name ||
                        junctions.find(j => j.id === selectedTransition.sourceId)?.name} →
                      {states.find(s => s.id === selectedTransition.targetId)?.name ||
                        junctions.find(j => j.id === selectedTransition.targetId)?.name}
                    </div>
                  </div>

                  {errors.filter(e => e.elementId === selectedTransition.id && e.source === 'Validation').map(err => (
                    <div key={err.id} className={`p-3 rounded-lg border text-xs mb-3 ${err.type === 'error' ? 'bg-red-950/20 border-red-900/50 text-red-300' : 'bg-amber-950/20 border-amber-900/50 text-amber-300'}`}>
                      <div className="font-semibold flex items-center gap-1.5 mb-1">
                        {err.type === 'error' ? (
                          <span className="text-red-400">🔴 Error</span>
                        ) : (
                          <span className="text-amber-400">⚠️ Warning</span>
                        )}
                      </div>
                      <p className="mb-2 leading-relaxed">{err.message}</p>
                      {err.canAutoFix && (
                        <div className="flex gap-2 mt-2">
                          {err.message.includes('unguarded and untimed') ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  const defaultGuard = variables.length > 0 ? `${variables[0].name} == 1U` : 'flag == true';
                                  updateTransition(selectedTransition.id, { type: 'condition', condition: defaultGuard });
                                  addError('info', `Added guard condition: [${defaultGuard}]`);
                                }}
                                className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px] h-7 px-2.5"
                              >
                                Add Guard
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  updateTransition(selectedTransition.id, { type: 'after', afterTicks: 5 });
                                  addError('info', `Added after-timer: after(5)`);
                                }}
                                className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px] h-7 px-2.5"
                              >
                                Add after-timer
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAutoFix(err)}
                              className="bg-green-600/15 hover:bg-green-600/30 text-green-300 border-green-600/30 text-[10px] h-7 px-2.5"
                            >
                              Auto-Fix
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  <div>
                    <Label>Order (priority for same source)</Label>
                    <Input
                      type="number"
                      value={selectedTransition.order}
                      onChange={(e) => updateTransition(selectedTransition.id, { order: parseInt(e.target.value) || 0 })}
                      className="mt-1"
                    />
                  </div>

                  <div className="flex items-center gap-2 mt-3 mb-2">
                    <Checkbox
                      checked={!!selectedTransition.isInternal}
                      onCheckedChange={(checked) => updateTransition(selectedTransition.id, { isInternal: checked as boolean })}
                      id="isInternal"
                    />
                    <Label htmlFor="isInternal" className="text-[#f97316]">Internal / Local Transition</Label>
                  </div>

                  <div className="space-y-3 p-3 bg-[#1a1a1a] rounded-lg border border-[#222]">
                    <Label className="text-[#f97316]">Trigger Logic</Label>

                    <select
                      value={selectedTransition.type}
                      onChange={(e) => updateTransition(selectedTransition.id, { type: e.target.value as any })}
                      className="w-full h-8 bg-[#0a0a0a] border border-[#333] rounded px-2 text-sm text-[#e0e0e0]"
                    >
                      <option value="condition">Condition Only</option>
                      <option value="after">After (Timer) Only</option>
                      <option value="and">Condition AND Timer</option>
                      <option value="or">Condition OR Timer</option>
                    </select>

                    {(selectedTransition.type === 'condition' || selectedTransition.type === 'and' || selectedTransition.type === 'or') && (
                      <div>
                        <Label>Condition</Label>
                        <textarea
                          value={selectedTransition.condition}
                          onChange={(e) => updateTransition(selectedTransition.id, { condition: e.target.value as any })}
                          placeholder="e.g., x > 10"
                          className="w-full h-20 min-h-[4rem] bg-[#1a1a1a] border border-[#333] rounded text-sm font-mono text-[#e0e0e0] p-2 mt-1 resize-y focus:outline-none focus:ring-1 focus:ring-[#f97316]"
                        />
                      </div>
                    )}

                    {(selectedTransition.type === 'after' || selectedTransition.type === 'and' || selectedTransition.type === 'or') && (
                      <div>
                        <Label>After (ticks)</Label>
                        <Input
                          type="number"
                          value={selectedTransition.afterTicks ?? ''}
                          onChange={(e) => updateTransition(selectedTransition.id, {
                            afterTicks: e.target.value ? parseInt(e.target.value) : null
                          })}
                          placeholder="Ticks"
                          className="mt-1 font-mono"
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <Label>Action (C-like code)</Label>
                    <textarea
                      value={selectedTransition.action}
                      onChange={(e) => updateTransition(selectedTransition.id, { action: e.target.value })}
                      placeholder="/* Action on transition */ counter = 0; flag = false;"
                      className="w-full h-20 min-h-[4rem] bg-[#1a1a1a] border border-[#333] rounded text-sm font-mono text-[#e0e0e0] p-2 mt-1 resize-y focus:outline-none focus:ring-1 focus:ring-[#f97316]"
                    />
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteTransition(selectedTransition.id)}
                    className="w-full border-red-800 text-red-400 hover:text-red-300 hover:bg-red-950/30"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1.5">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    Delete Transition
                  </Button>
                </>
              ) : (
                <div className="text-center py-8 text-[#666]">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-3 opacity-50">
                    <path d="M12 12h.01" />
                    <path d="M16 8v4a4 4 0 0 1-4 4H8" />
                    <path d="M16 8h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2h2" />
                  </svg>
                  <p className="text-sm font-medium">Select an element to edit properties</p>
                  <p className="text-xs mt-2 opacity-70">
                    Click and drag to move items<br />
                    Use toolbar buttons to create elements
                  </p>
                </div>
              )}
            </div>
          </aside>
            </>
          )}
        </div>

        {/* Mobile Navigation Bar */}
        {isMobile && (
          <div className="h-14 bg-[#1a1a1a] border-t border-[#222] flex items-center justify-around shrink-0 pb-safe">
            <button
              onClick={() => setMobileTab('hierarchy')}
              className={`flex flex-col items-center justify-center w-full h-full ${mobileTab === 'hierarchy' ? 'text-[#f97316]' : 'text-[#666]'}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mb-1">
                <path d="M10 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4" />
                <path d="M16 17l-3-3 3-3" />
                <path d="M13 14H3" />
              </svg>
              <span className="text-[10px] font-bold">Tree</span>
            </button>
            <button
              onClick={() => setMobileTab('variables')}
              className={`flex flex-col items-center justify-center w-full h-full ${mobileTab === 'variables' ? 'text-[#f97316]' : 'text-[#666]'}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mb-1">
                <path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v5" />
                <path d="M3 12h18" />
                <path d="M12 12v9" />
              </svg>
              <span className="text-[10px] font-bold">Vars</span>
            </button>
            <button
              onClick={() => setMobileTab('canvas')}
              className={`flex flex-col items-center justify-center w-full h-full ${mobileTab === 'canvas' ? 'text-[#f97316]' : 'text-[#666]'}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mb-1">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18" />
              </svg>
              <span className="text-[10px] font-bold">Canvas</span>
            </button>
            <button
              onClick={() => setMobileTab('properties')}
              className={`flex flex-col items-center justify-center w-full h-full ${mobileTab === 'properties' ? 'text-[#f97316]' : 'text-[#666]'}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mb-1">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span className="text-[10px] font-bold">Props</span>
            </button>
          </div>
        )}

        {/* Workspace Modal */}
        {showWorkspaceModal && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
            <div className="bg-[#1a1a1a] border border-[#f97316] rounded-lg w-[650px] max-h-[90vh] flex flex-col">
              <div className="h-12 flex items-center px-5 border-b border-[#222]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" className="mr-3">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                </svg>
                <h2 className="text-lg font-bold text-[#f97316]">Workspace Variables</h2>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                <div className="space-y-3 p-4 bg-[#1a1a1a] rounded-lg border border-[#222]">
                  <Label>Add Variable</Label>
                  <Input
                    placeholder="Name"
                    value={newVarName}
                    onChange={(e) => setNewVarName(e.target.value)}
                  />
                  <select
                    value={newVarType}
                    onChange={(e) => {
                      setNewVarType(e.target.value as VariableType);
                      setNewVarValue(getDefaultValue(e.target.value as VariableType));
                    }}
                    className="h-10 bg-[#0a0a0a] border border-[#333] text-sm rounded w-full px-3 mt-1"
                  >
                    {ALLOWED_TYPES.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  <Input
                    placeholder="Initial value"
                    value={newVarValue}
                    onChange={(e) => setNewVarValue(e.target.value)}
                    className="mt-1"
                  />
                  <Button
                    size="sm"
                    onClick={addVariable}
                    className="w-full bg-[#f97316] text-[#0a0a0a] hover:bg-[#ea580c] mt-2 h-9"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1.5">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Add Variable
                  </Button>
                </div>

                <div className="space-y-3 max-h-[450px] overflow-y-auto pr-2">
                  {variables.map((variable) => (
                    <div
                      key={variable.id}
                      className="p-4 bg-[#1a1a1a] rounded-lg border border-[#222] space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={variable.visibleInScope}
                            onCheckedChange={() => toggleVariableVisibility(variable.id)}
                            id={`var-${variable.id}`}
                          />
                          <span className="font-mono text-sm text-[#f97316]">{variable.name}</span>
                        </div>
                        <Badge>{variable.type}</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-[11px]">Initial Value</Label>
                          <Input
                            value={variable.initialValue}
                            onChange={(e) => updateVariableInitValue(variable.id, e.target.value)}
                            disabled={isRunning}
                            className="mt-1 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] flex items-center gap-1">
                            Runtime Value
                            {isRunning && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6c9ac6" strokeWidth="2">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                              </svg>
                            )}
                          </Label>
                          <Input
                            value={String(variable.currentValue)}
                            onChange={(e) => updateVariableValue(variable.id, e.target.value)}
                            disabled={!isRunning}
                            className="mt-1 text-xs font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="h-14 flex items-center justify-end px-5 border-t border-[#222] gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowWorkspaceModal(false)}
                  className="border-[#333] text-[#a0a0a0] hover:text-[#e0e0e0] px-5"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    resetVariables();
                    setShowWorkspaceModal(false);
                  }}
                  className="bg-[#f97316] text-[#0a0a0a] hover:bg-[#ea580c] px-5"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1.5">
                    <path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0" />
                    <polyline points="3 4 3 12 11 12" />
                  </svg>
                  Reset to Initial Values
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Code Generation Dialog - FULLY FUNCTIONAL */}
        {showCodegenDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50" onMouseDown={() => setShowCodegenDialog(false)}>
            <CodeGenerationDialog
              files={generatedFiles}
              codegenErrors={codegenErrors}
              codegenWarnings={codegenWarnings}
              generationLog={generationLog}
              onClose={() => setShowCodegenDialog(false)}
              addError={addError}
            />
          </div>
        )}

        {/* Report Dialog */}
        {showReportDialog && (
          <ReportDialog
            onClose={() => setShowReportDialog(false)}
            onGenerate={handleGenerateReport}
          />
        )}

        {/* Workspace File/Project Dialog */}
        {showWorkspaceFileDialog && (
          <WorkspaceFileDialog
            onClose={() => setShowWorkspaceFileDialog(false)}
            onCreateFile={createNewFile}
            onCreateProject={(name) => {
              setShowWorkspaceFileDialog(false);
              const newUrl = `${window.location.origin}${window.location.pathname}?projectName=${encodeURIComponent(name)}`;
              window.open(newUrl, '_blank');
            }}
            existingFiles={workspaceFiles}
            openTabIds={openTabIds}
            onOpenFile={openFileInTab}
            onDeleteFile={(id) => {
              setWorkspaceFiles(prev => prev.filter(f => f.id !== id));
              setOpenTabIds(prev => prev.filter(tid => tid !== id));
            }}
            onImportFile={handleImportFile}
            onValidationError={setImportValidationError}
          />
        )}

        {/* Delete State Confirmation Modal */}
        {deleteConfirmState && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-150" onMouseDown={() => setDeleteConfirmState(null)}>
            <div className="bg-[#1a1a1a] border border-[#f97316]/60 rounded-xl w-[480px] max-h-[90vh] flex flex-col shadow-2xl overflow-hidden relative" onMouseDown={e => e.stopPropagation()}>
              <div className="h-14 flex items-center px-6 border-b border-[#2a2a2a] bg-[#141414]">
                <Trash2 className="w-5 h-5 text-[#f97316] mr-3 shrink-0" />
                <h2 className="text-base font-bold text-[#e0e0e0]">
                  {deleteConfirmState.totalStates > 1 ? 'Confirm Delete States' : 'Confirm Delete State'}
                </h2>
                <button
                  onClick={() => setDeleteConfirmState(null)}
                  className="ml-auto text-[#888] hover:text-[#fff] p-1 rounded transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {deleteConfirmState.hasChildren ? (
                  <>
                    <p className="text-sm text-[#cccccc] leading-relaxed">
                      {deleteConfirmState.totalStates > 1 ? (
                        <>Selected <span className="font-semibold text-[#f97316]">{deleteConfirmState.totalStates} states</span> contain <span className="font-semibold text-[#f97316]">{deleteConfirmState.parts}</span>.</>
                      ) : (
                        <>State <span className="font-semibold text-[#f97316]">{deleteConfirmState.name}</span> contains <span className="font-semibold text-[#f97316]">{deleteConfirmState.parts}</span>.</>
                      )}
                    </p>
                    <div className="p-3.5 bg-[#2a1a14] rounded-lg border border-[#f97316]/30 flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-[#f97316] shrink-0 mt-0.5" />
                      <p className="text-xs text-[#e8b595] leading-relaxed">
                        Deleting {deleteConfirmState.totalStates > 1 ? 'these states' : 'this state'} will permanently remove all child states, sub-layers, junctions, and transitions from both the workspace canvas and tree hierarchy.
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-[#cccccc]">
                    {deleteConfirmState.totalStates > 1 ? (
                      <>Are you sure you want to delete <span className="font-semibold text-[#f97316]">{deleteConfirmState.totalStates} states</span> from the workspace and state tree?</>
                    ) : (
                      <>Are you sure you want to delete state <span className="font-semibold text-[#f97316]">{deleteConfirmState.name}</span> from the workspace and state tree?</>
                    )}
                  </p>
                )}
              </div>

              <div className="h-16 flex items-center justify-end px-6 border-t border-[#2a2a2a] bg-[#141414] gap-3">
                <Button
                  variant="outline"
                  onClick={() => setDeleteConfirmState(null)}
                  className="border-[#333] text-[#a0a0a0] hover:bg-[#252525] hover:text-white px-5 text-xs h-9"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => executeDeleteState(deleteConfirmState.ids, deleteConfirmState.otherDeletedIds)}
                  className="bg-red-600 hover:bg-red-700 text-white px-5 text-xs h-9 font-medium shadow-md flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {deleteConfirmState.totalStates > 1 ? `Delete ${deleteConfirmState.totalStates} States` : 'Delete State'}
                </Button>
              </div>
            </div>
          </div>
        )}
        {/* SysML Deletion Confirmation Modal (BDD / Requirements / IBD) */}
        {sysmlDeleteConfirm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-150" onMouseDown={() => setSysmlDeleteConfirm(null)}>
            <div className="bg-[#1a1a1a] border border-red-900/60 rounded-xl w-[520px] max-h-[90vh] flex flex-col shadow-2xl overflow-hidden relative" onMouseDown={e => e.stopPropagation()}>
              <div className="h-14 flex items-center px-6 border-b border-[#2a2a2a] bg-[#141414]">
                <AlertTriangle className={`w-5 h-5 ${sysmlDeleteConfirm.severity === 'blocked' ? 'text-red-500' : 'text-[#f97316]'} mr-3 shrink-0`} />
                <h2 className="text-base font-bold text-[#e0e0e0]">
                  {sysmlDeleteConfirm.severity === 'blocked' ? 'Deletion Blocked' : `Confirm Delete ${sysmlDeleteConfirm.elementKind.charAt(0).toUpperCase() + sysmlDeleteConfirm.elementKind.slice(1)}`}
                </h2>
                <button
                  onClick={() => setSysmlDeleteConfirm(null)}
                  className="ml-auto text-[#888] hover:text-[#fff] p-1 rounded transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-4 overflow-y-auto">
                {sysmlDeleteConfirm.severity === 'blocked' ? (
                  <div className="p-3.5 bg-red-950/40 rounded-lg border border-red-800/60 flex items-start gap-3">
                    <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-300 leading-relaxed">
                      Protected baseline <span className="font-semibold text-white">{(sysmlDeleteConfirm.impact.blockedBaselineIds ?? sysmlDeleteConfirm.impact.affectedBaselineIds).join(', ') || 'unknown'}</span> forbids this deletion. Clone the baseline or authorize explicitly before retrying.
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-[#cccccc] leading-relaxed">
                      Are you sure you want to delete <span className="font-semibold text-[#f97316]">{sysmlDeleteConfirm.elementName}</span>?
                    </p>

                    {/* Impact Details */}
                    <div className="space-y-2">
                      {(() => {
                        const { impact } = sysmlDeleteConfirm;
                        const requested = new Set(impact.requestedElementIds);
                        const cascade = impact.deletedElementIds.filter(id => !requested.has(id));
                        const items: { label: string; value: string; color: string }[] = [];
                        if (cascade.length > 0) items.push({ label: 'Cascade deleted', value: `${cascade.length} element(s)`, color: 'text-red-300' });
                        if (impact.nestedRequirementIds.length > 0) items.push({ label: 'Nested requirements', value: `${impact.nestedRequirementIds.length} requirement(s)`, color: 'text-purple-300' });
                        if (impact.removedRelationshipIds.length > 0) items.push({ label: 'Removed relationships', value: `${impact.removedRelationshipIds.length} relationship(s)`, color: 'text-amber-300' });
                        if (impact.unresolvedUsageIds.length > 0) items.push({ label: 'Unresolved usages', value: impact.unresolvedUsageIds.join(', '), color: 'text-amber-300' });
                        if (impact.affectedRequirementIds.filter(id => !requested.has(id)).length > 0) items.push({ label: 'Affected requirements', value: `${impact.affectedRequirementIds.filter(id => !requested.has(id)).length} requirement(s)`, color: 'text-purple-300' });
                        if (impact.invalidatedEvidenceIds.length > 0) items.push({ label: 'Invalidated evidence', value: `${impact.invalidatedEvidenceIds.length} record(s)`, color: 'text-amber-300' });
                        if (impact.affectedDiagramKinds.length > 0) items.push({ label: 'Affected diagrams', value: impact.affectedDiagramKinds.join(', ').toUpperCase(), color: 'text-sky-300' });
                        if (impact.affectedBaselineIds.length > 0) items.push({ label: 'Affected baselines', value: impact.affectedBaselineIds.join(', '), color: 'text-amber-300' });

                        return items.length > 0 && (
                          <div className="p-3.5 bg-[#2a1a14] rounded-lg border border-[#f97316]/30">
                            <div className="flex items-center gap-1.5 mb-2">
                              <AlertTriangle className="w-4 h-4 text-[#f97316]" />
                              <span className="text-xs font-bold text-[#f97316]">Deletion Impact</span>
                            </div>
                            <div className="space-y-1.5">
                              {items.map((item, i) => (
                                <div key={i} className="flex items-baseline justify-between text-xs">
                                  <span className="text-[#999]">{item.label}</span>
                                  <span className={`font-mono ${item.color}`}>{item.value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    <p className="text-[11px] text-[#777] leading-relaxed">
                      This action is irreversible. All cascaded elements, relationships, and evidence will be permanently removed.
                    </p>
                  </>
                )}
              </div>

              <div className="h-16 flex items-center justify-end px-6 border-t border-[#2a2a2a] bg-[#141414] gap-3">
                <Button
                  variant="outline"
                  onClick={() => setSysmlDeleteConfirm(null)}
                  className="border-[#333] text-[#a0a0a0] hover:bg-[#252525] hover:text-white px-5 text-xs h-9"
                >
                  {sysmlDeleteConfirm.severity === 'blocked' ? 'Dismiss' : 'Cancel'}
                </Button>
                {sysmlDeleteConfirm.severity !== 'blocked' && (
                  <Button
                    onClick={() => {
                      const fn = sysmlDeleteConfirm.onConfirm;
                      setSysmlDeleteConfirm(null);
                      fn();
                    }}
                    className="bg-red-600 hover:bg-red-700 text-white px-5 text-xs h-9 font-medium shadow-md flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete {sysmlDeleteConfirm.elementKind.charAt(0).toUpperCase() + sysmlDeleteConfirm.elementKind.slice(1)}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Policy-filtered connection picker */}
        {requirementConnectionPicker && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4"
            onMouseDown={() => setRequirementConnectionPicker(null)}
          >
            <div
              className="bg-[#141414] border border-[#333] rounded-lg w-[420px] shadow-2xl p-5 flex flex-col gap-4 text-[#e0e0e0]"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div>
                <h3 className="text-base font-semibold text-white">
                  {requirementConnectionPicker.reversedKinds ? 'Reverse Endpoints & Create' : 'Create Relationship'}
                </h3>
                {requirementConnectionPicker.reversedKinds && (
                  <div className="mt-2 p-2 rounded bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs">
                    Direction assistance: SysML requires connections to be created from the dependent/realizing element to the requirement. The endpoints below have been aligned to standard SysML direction.
                  </div>
                )}
                <p className="text-xs text-[#888] mt-1">
                  Connect{' '}
                  <span className="text-[#f97316] font-medium">
                    {blocks.find(b => b.id === requirementConnectionPicker.sourceId)?.name || 'Source'}
                  </span>{' '}
                  to{' '}
                  <span className="text-[#f97316] font-medium">
                    {blocks.find(b => b.id === requirementConnectionPicker.targetId)?.name || 'Target'}
                  </span>
                </p>
              </div>

              <div className="flex flex-col gap-2">
                {getCanvasRelationshipKinds(
                  { blocks, parts, relationships },
                  requirementConnectionPicker.sourceId,
                  requirementConnectionPicker.targetId,
                  diagramMode === 'ibd' ? 'ibd' : diagramMode === 'requirements' ? 'requirements' : 'bdd',
                ).map(kind => {
                  const meta = RELATIONSHIP_DEFINITIONS[kind as RequirementRelationshipKind];
                  return (
                    <Button
                      key={kind}
                      onClick={() => {
                        createRelationship(requirementConnectionPicker.sourceId, requirementConnectionPicker.targetId, kind);
                        setRequirementConnectionPicker(null);
                      }}
                      className="w-full justify-start text-left bg-[#1f1f1f] hover:bg-[#2a2a2a] text-white border border-[#333] p-3 h-auto flex flex-col items-start gap-0.5"
                    >
                      {meta ? (
                        <>
                          <span className="font-semibold text-xs text-orange-300">
                            {meta.displayLabel} — {meta.label}
                          </span>
                          <span className="text-[11px] text-neutral-400">
                            {meta.directionLabel}
                          </span>
                        </>
                      ) : (
                        <span>
                          {kind === 'requirementContainment'
                            ? 'Requirement Containment (parent → child)'
                            : kind.replace(/([A-Z])/g, ' $1').replace(/^./, character => character.toUpperCase())}
                        </span>
                      )}
                    </Button>
                  );
                })}
              </div>

              <div className="flex justify-end pt-2 border-t border-[#2a2a2a]">
                <Button
                  variant="outline"
                  onClick={() => setRequirementConnectionPicker(null)}
                  className="border-[#333] text-[#a0a0a0] hover:bg-[#222]"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Save Selection Dialog */}
        {showSaveSelectionModal && (
          <SaveSelectionDialog
            onClose={() => setShowSaveSelectionModal(false)}
            onSave={(selectedKeys) => {
              setShowSaveSelectionModal(false);
              executeExportProject(selectedKeys);
            }}
          />
        )}

        {/* Error Dialog */}
        {showErrorDialog && currentError && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50" onMouseDown={dismissErrorDialog}>
            <div role="alertdialog" aria-modal="true" aria-labelledby="error-dialog-title" className="bg-[#1a1a1a] border border-red-900 rounded-lg w-[550px] max-h-[90vh] flex flex-col relative" onMouseDown={e => e.stopPropagation()}>
              <div className="h-12 flex items-center px-5 border-b border-red-900/50">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ff6b6b" strokeWidth="2" className="mr-3">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <h2 id="error-dialog-title" className="text-lg font-bold text-red-400">
                  {currentError.connectionDiagnostic ? 'SysML Connection Blocked' : 'Error'}
                </h2>
              </div>

              <div className="p-5 bg-red-950/25 rounded-lg border border-red-900 m-5">
                <p className="text-red-300 text-sm whitespace-pre-wrap">{currentError.message}</p>
                {currentError.connectionDiagnostic && currentError.relationshipKind && currentError.sourceEndpoint && currentError.targetEndpoint && (
                  <SysmlConnectionErrorDetails
                    relationshipKind={currentError.relationshipKind}
                    source={currentError.sourceEndpoint}
                    target={currentError.targetEndpoint}
                    diagnostic={currentError.connectionDiagnostic}
                  />
                )}
                {currentError.source && (
                  <p className="text-xs text-red-400 mt-2.5">Source: {currentError.source}</p>
                )}
              </div>

              <div className="h-14 flex items-center justify-end px-5 border-t border-[#222] gap-3">
                <Button
                  variant="outline"
                  onClick={() => handleJumpToError(currentError)}
                  disabled={!currentError.elementId}
                  className="border-[#f97316] text-[#f97316] hover:bg-[#f97316]/10 px-5 mr-auto"
                >
                  Go to Element
                </Button>
                {currentError.canAutoFix && (
                  currentError.message.includes('unguarded and untimed') ? (
                    <>
                      <Button
                        onClick={() => {
                          const defaultGuard = variables.length > 0 ? `${variables[0].name} == 1U` : 'flag == true';
                          updateTransition(currentError.elementId!, { type: 'condition', condition: defaultGuard });
                          addError('info', `Added guard condition: [${defaultGuard}]`);
                          setErrors(prev => prev.filter(e => e.id !== currentError.id));
                          dismissErrorDialog();
                        }}
                        className="bg-green-600 hover:bg-green-700 text-white px-5 mr-2"
                      >
                        Add Guard
                      </Button>
                      <Button
                        onClick={() => {
                          updateTransition(currentError.elementId!, { type: 'after', afterTicks: 5 });
                          addError('info', `Added after-timer: after(5)`);
                          setErrors(prev => prev.filter(e => e.id !== currentError.id));
                          dismissErrorDialog();
                        }}
                        className="bg-green-600 hover:bg-green-700 text-white px-5 mr-2"
                      >
                        Add after-timer
                      </Button>
                    </>
                  ) : (
                    <Button
                      onClick={() => handleAutoFix(currentError)}
                      className="bg-green-600 hover:bg-green-700 text-white px-5 mr-2"
                    >
                      Auto-Fix
                    </Button>
                  )
                )}
                {errors.filter(e => e.canAutoFix).length > 1 && (
                  <Button
                    onClick={handleFixAll}
                    className="bg-green-700 hover:bg-green-800 text-white px-5 mr-2"
                  >
                    Fix All ({errors.filter(e => e.canAutoFix).length})
                  </Button>
                )}
                <Button
                  variant="outline"
                  ref={errorDismissButtonRef}
                  onClick={dismissErrorDialog}
                  className="border-[#333] text-[#a0a0a0] hover:text-[#e0e0e0] px-5"
                >
                  Dismiss
                </Button>
                <Button
                  onClick={() => {
                    clearErrors();
                    dismissErrorDialog();
                  }}
                  className="bg-red-600 hover:bg-red-700 text-white px-5"
                >
                  Clear All Errors
                </Button>
              </div>
              {/* Resizing for this modal is less critical, but can be added similarly if needed */}
            </div>
          </div>
        )}

        {/* PID Workspace Window */}
        {managedWindows.pid.isOpen && (
          <FloatingWindow
            windowState={managedWindows.pid}
            onClose={() => toggleWindow('pid')}
            onUpdate={updateManagedWindow}
          >
            <PidWorkspaceDialog onClose={() => toggleWindow('pid')} addError={addError} />
          </FloatingWindow>
        )}


        {/* RTM Window */}
        {managedWindows.rtm.isOpen && (
          <FloatingWindow
            windowState={managedWindows.rtm}
            onClose={() => toggleWindow('rtm')}
            onUpdate={updateManagedWindow}
          >
            <CanonicalTraceabilityMatrix
              repository={canonicalSysmlRepository}
              onNavigate={(elementId) => {
                setSelectedIds([elementId]);
                if (blocks.some(block => block.id === elementId && block.stereotype === 'requirement')) setDiagramMode('requirements');
                else if (blocks.some(block => block.id === elementId)) setDiagramMode('bdd');
                else if (parts.some(part => part.id === elementId) || connectors.some(connector => connector.id === elementId)) setDiagramMode('ibd');
              }}
            />
          </FloatingWindow>
        )}

        {/* HMI Dashboard Window */}
        {managedWindows.hmi.isOpen && (
          <FloatingWindow
            windowState={managedWindows.hmi}
            onClose={() => toggleWindow('hmi')}
            onUpdate={updateManagedWindow}
          >
            <HmiDashboardContent
              variables={variables}
              components={hmiComponents}
              setComponents={setHmiComponents}
              updateVariable={(id, val) => updateVariableValue(id, val)}
              onClose={() => toggleWindow('hmi')}
            />
          </FloatingWindow>
        )}

        {/* DOE Workspace Window */}
        {managedWindows.doe.isOpen && (
          <FloatingWindow
            windowState={managedWindows.doe}
            onClose={() => toggleWindow('doe')}
            onUpdate={updateManagedWindow}
          >
            <DoeWorkspace
              activeModel={activeModel}
              setActiveModel={setActiveModel}
              taguchiConfig={taguchiConfig}
              setTaguchiConfig={setTaguchiConfig}
              data={data}
              setData={setData}
              headers={headers}
              setHeaders={setHeaders}
              results={results}
              setResults={setResults}
              plotFactors={plotFactors}
              setPlotFactors={setPlotFactors}
              holdValues={holdValues}
              setHoldValues={setHoldValues}
              plotType={plotType}
              setPlotType={setPlotType}
              handleExportProject={handleExportProject}
              generateReport={() => setShowReportPreview(true)}
              onClose={() => toggleWindow('doe')}
              addError={addError}
              onExportToVLab={onExportToVLab}
              onExportToXBridges={onExportToXBridges}
              factors={factors}
              setFactors={setFactors}
              calculateRSM={calculateRSM}
              calculateGMDH={calculateGMDH}
              calculateTaguchi={calculateTaguchi}
              handleExportToVLab={handleExportToVLab}
              handleExportToXBridges={handleExportToXBridges}
            />
          </FloatingWindow>
        )}

        {/* ── 3DEXPERIENCE Gateway Modal ──────────────────────────────────────── */}
        <ThreeDXGateway
          isOpen={show3DXGateway}
          onClose={() => setShow3DXGateway(false)}
          adiaExports={adiaExportItems}
          onImportJson={(jsonStr) => {
            try {
              const parsed = JSON.parse(jsonStr);
              if (parsed && typeof parsed === 'object') {
                hydrateProject(parsed);
                addError('info', '3DEXPERIENCE: Project imported successfully.');
              }
            } catch {
              addError('error', '3DEXPERIENCE: Downloaded file is not valid JSON.');
            }
            setShow3DXGateway(false);
          }}
        />

        {/* ── Detached Scope Floating Overlay Window ────────────────────────────── */}
        {isScopeDetached && (
          <div className="fixed inset-4 sm:inset-10 z-50 bg-[#121212]/95 border border-[#333] rounded-xl shadow-2xl flex flex-col backdrop-blur-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div
              onDoubleClick={() => setIsScopeDetached(false)}
              className="h-12 px-5 border-b border-[#222] flex items-center justify-between bg-[#1a1a1a] shrink-0 cursor-pointer select-none"
              title="Double-click header to dock back to bottom panel"
            >
              <div className="flex items-center gap-2.5">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
                <span className="font-semibold text-sm text-[#e0e0e0]">Scope — Detached Visualization</span>
                <span className="text-xs text-[#666] bg-[#222] px-2.5 py-0.5 rounded-full ml-2">Double-click header to dock back</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={exportScopeCSV}
                  className="text-[#a0a0a0] hover:text-[#e0e0e0] px-2.5 py-1 text-xs"
                >
                  Export CSV
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearScope}
                  className="text-[#a0a0a0] hover:text-[#e0e0e0] px-2.5 py-1 text-xs"
                >
                  Clear
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsScopeDetached(false)}
                  className="h-7 w-7 text-[#a0a0a0] hover:text-[#f97316]"
                  title="Dock back to bottom panel"
                >
                  <X size={16} />
                </Button>
              </div>
            </div>
            <div className="flex-1 p-5 overflow-x-auto overflow-y-auto">
              {visibleVariables.length === 0 ? (
                <div className="flex items-center justify-center h-full text-[#666]">
                  <p className="text-sm font-medium">No variables selected for scope</p>
                </div>
              ) : scopeData.length < 2 ? (
                <div className="flex items-center justify-center h-full text-[#666]">
                  <p className="text-sm font-medium">Start simulation to see scope data</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 h-full">
                  {visibleVariables.map((variable, index) => {
                    const color = colors[index % colors.length];
                    const values = scopeData.map(dp => dp[variable.name] ?? 0);
                    let minVal = Math.min(...values);
                    let maxVal = Math.max(...values);
                    if (minVal === maxVal) { minVal -= 1; maxVal += 1; }
                    const range = maxVal - minVal;
                    const padding = range * 0.1;
                    const effectiveMin = minVal - padding;
                    const effectiveMax = maxVal + padding;
                    const effectiveRange = effectiveMax - effectiveMin;

                    const points = values.map((v, i) => {
                      const x = (i / (values.length - 1)) * 100;
                      const y = 100 - ((v - effectiveMin) / effectiveRange) * 100;
                      return `${x},${y}`;
                    }).join(' ');

                    return (
                      <div key={variable.id} className="h-64 bg-[#1a1a1a] rounded-lg border border-[#333] p-3 flex flex-col relative overflow-hidden">
                        <div className="flex justify-between items-center mb-2 z-10">
                          <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#000]/60" style={{ color }}>
                            {variable.name}
                          </span>
                          <span className="text-xs font-mono text-[#e0e0e0] px-2 py-0.5 rounded bg-[#000]/60">
                            {values[values.length - 1]?.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex-1 relative">
                          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0">
                            <polyline
                              points={points}
                              fill="none"
                              stroke={color}
                              strokeWidth="2"
                              vectorEffect="non-scaling-stroke"
                              strokeLinejoin="round"
                              strokeLinecap="round"
                            />
                          </svg>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default ADIA;
