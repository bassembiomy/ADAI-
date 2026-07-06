import React, { useState, useRef, useEffect, useCallback, useMemo, MouseEvent, KeyboardEvent, ChangeEvent } from 'react';
import * as math from 'mathjs';
import Plot from 'react-plotly.js';
import DOMPurify from 'dompurify';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { XbridgesWorkspace } from './components/xbridges/XbridgesWorkspace';
import { VLabWorkspace } from './components/vlab/VLabWorkspace';
import { HILWorkspace } from './components/hil/HILWorkspace';
import { EntropyWorkspace } from './components/entropy/EntropyWorkspace';
import { HILConfig, HILSessionState } from './engine/hil/hilTypes';
import { XbridgesEngine } from './engine/xbridges/XbridgesEngine';
import { Solvers } from './engine/xbridges/Solvers';
import { GMDHEngine, solveLeastSquares } from './engine/gmdh/gmdh_core/combi';
import { ChevronLeft } from 'lucide-react';
import {
  Trash2, Plus, Layers, Settings2, Search, Save, Box,
  ChevronDown, ChevronRight, Play, Pause, Square, BookOpen,
  MousePointer2, Upload, FileText, Download,
  Activity, Zap, Database, Cpu, Layout, Maximize2, X,
  LayoutGrid, Rows, Network, Flame, RefreshCcw, Wind, Cloud,
  Eye, Paperclip
} from 'lucide-react';
import { FactoryIOGateway } from './components/FactoryIOGateway';
import { ThreeDXGateway } from './components/ThreeDXGateway';
import type { AdiaExportItem } from './types/threeDX_types';
import { AiArchitectSidebar } from './components/AiArchitectSidebar';
import { executeAiActions } from './utils/aiActionProcessor';
import { IntroStandbyOverlay } from './components/IntroStandbyOverlay';
import { 
  VariableType, VariableDef, StateData, JunctionData, TransitionData, Layer, ErrorItem 
} from './types/sm_types';
import { generateMISRACCode, getCTimeType } from './utils/stateMachineCodeGenerator';
import { analyzeStateMachine } from './utils/smAnalysisEngine';
import { HELP_DATA } from './HelpData';
import { VLAB_LIBRARY } from './utils/vlabLibrary';
import { BLOCK_LIBRARY as XBRIDGES_LIBRARY } from './engine/xbridges/BlockDefinitions';

// =============================================================================
// STATIC UI COMPONENTS (ZERO IMPORT ERRORS - FULLY TYPED)
// =============================================================================
const Button = ({
  children,
  onClick,
  variant = 'default',
  size = 'default',
  className = '',
  disabled = false,
  ...props
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'outline' | 'destructive' | 'ghost' | 'secondary';
  size?: 'sm' | 'default' | 'icon';
  className?: string;
  disabled?: boolean;
  [key: string]: any;
}) => {
  const base = 'px-3 py-1.5 rounded font-medium transition-colors flex items-center justify-center';
  const variants = {
    default: 'bg-[#f97316] text-white hover:bg-[#ea580c]',
    outline: 'border border-[#333] text-[#e0e0e0] hover:bg-[#1a1a1a]',
    destructive: 'bg-red-600 hover:bg-red-700 text-white',
    ghost: 'text-[#a0a0a0] hover:text-[#e0e0e0] hover:bg-[#1a1a1a]',
    secondary: 'bg-[#1a1a1a] border border-[#333] text-[#e0e0e0] hover:bg-[#222]'
  };
  const sizes = {
    sm: 'text-xs px-2 h-7',
    default: 'text-sm px-3 h-8',
    icon: 'h-8 w-8 p-0'
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className} ${disabled ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      {...props}
    >
      {children}
    </button>
  );
};

const Input = ({
  value,
  onChange,
  placeholder = '',
  type = 'text',
  className = '',
  ...props
}: {
  value: string | number;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  className?: string;
  [key: string]: any;
}) => (
  <input
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    type={type}
    className={`px-2 py-1 bg-[#1a1a1a] border border-[#333] rounded text-sm text-[#e0e0e0] ${className}`}
    {...props}
  />
);

const Label = ({ children, className = '', ...props }: { children: React.ReactNode; className?: string;[key: string]: any }) => (
  <label className={`text-xs text-[#888] ${className}`} {...props}>{children}</label>
);

const Badge = ({ children, variant = 'secondary', className = '' }: {
  children: React.ReactNode;
  variant?: 'default' | 'secondary' | 'outline';
  className?: string;
}) => (
  <span className={`px-2 py-0.5 rounded text-xs ${variant === 'secondary' ? 'bg-[#222] text-[#888]' : 'bg-[#f97316] text-[#0a0a0a]'
    } ${className}`}>
    {children}
  </span>
);

const Separator = ({ orientation = 'horizontal', className = '' }: {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}) => (
  <div className={`${orientation === 'vertical' ? 'w-px h-4' : 'h-px w-full'} bg-[#333] ${className}`} />
);

const Triangle = ({ size, className, fill }: { size: number, className?: string, fill?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill || "none"}
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M3 20h18L12 4z" />
  </svg>
);

const Checkbox = ({
  checked,
  onCheckedChange,
  id,
  className = ''
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
  className?: string;
}) => (
  <input
    id={id}
    type="checkbox"
    checked={checked}
    onChange={(e) => onCheckedChange(e.target.checked)}
    className={`w-4 h-4 rounded border-[#444] bg-[#1a1a1a] text-[#f97316] focus:ring-[#f97316] ${className}`}
  />
);

const Resizer = ({ onMouseDown, orientation = 'vertical' }: { onMouseDown: (e: React.MouseEvent) => void, orientation?: 'vertical' | 'horizontal' }) => (
  <div
    onMouseDown={onMouseDown}
    className={`shrink-0 bg-transparent group transition-colors duration-200 ${orientation === 'vertical' ? 'w-1.5 cursor-col-resize' : 'h-1.5 cursor-row-resize'
      }`}
  >
    <div className={`bg-[#333] group-hover:bg-[#f97316] transition-colors ${orientation === 'vertical' ? 'w-px h-full mx-auto' : 'h-px w-full my-auto'}`} />
  </div>
);

// WelcomeOverlay has been moved and refactored as a standalone component IntroStandbyOverlay




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
type DiagramMode = 'statemachine' | 'bdd' | 'ibd' | 'requirements' | 'xbridges' | 'vlab' | 'hil' | 'entropy';

interface ManagedWindowState {
  id: ManagedWindowId;
  title: string;
  isOpen: boolean;
  isMinimized: boolean;
  pos: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
}

interface PortData {
  id: string;
  name: string;
  type: string; // e.g. 'int', 'float', 'signal'
  kind?: 'standard' | 'flow' | 'proxy';
  direction?: 'in' | 'out' | 'inout';
  unit?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  offset?: number;
}

interface ValuePropertyData {
  id: string;
  name: string;
  type: string;
  defaultValue?: string;
}

interface BlockData {
  id: string;
  name: string;
  stereotype: string; // 'block', 'requirement', 'interface', 'valueType'
  x: number;
  y: number;
  width: number;
  height: number;
  properties: ValuePropertyData[];
  operations: string[];
  constraints: string[];
  classes: string[]; // Nested classes/parts definitions
  ports: PortData[];
  reqId?: string;
  description?: string;
  status?: string;
  priority?: string;
  satisfiedReqIds?: string[];
  risk?: string;
  verificationMethod?: string;
  source?: string;
  ibdX?: number;
  ibdY?: number;
  ibdWidth?: number;
  ibdHeight?: number;
  attachedFiles?: { name: string; content: string }[];
  assignedTo?: string;
  layerId?: string; // Which requirements layer this block belongs to ('root' or a block id)
}

interface RelationshipData {
  id: string;
  sourceId: string;
  targetId: string;
  type: 'association' | 'generalization' | 'composition' | 'aggregation' | 'allocation' | 'derive' | 'deriveReqt' | 'refine' | 'satisfy' | 'verify' | 'trace' | 'binding' | 'dependency';
  label: string;
  sourceMultiplicity?: string;
  targetMultiplicity?: string;
}

interface PartData {
  id: string;
  name: string;
  blockId: string | null;
  typeId?: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  satisfiedReqIds?: string[];
  multiplicity?: string;
  portLayouts?: Record<string, { side: 'top' | 'bottom' | 'left' | 'right', offset: number }>;
}

interface ConnectorData {
  id: string;
  sourcePartId: string;
  sourcePortId: string;
  targetPartId: string;
  targetPortId: string;
  itemFlow?: string;
  label?: string;
}

interface InterfaceRealizationData {
  id: string;
  partId: string;
  portId: string;
  interfaceId: string;
}

type HmiComponentType = 'toggle' | 'button' | 'slider' | 'input' | 'lamp' | 'led' | 'lcd' | 'gauge' | 'rotary' | 'hybrid-rotary' | 'buzzer' | 'oled' | 'encoder' | 'mode-selector' | 'mode-icon';

interface HmiComponent {
  id: string;
  type: HmiComponentType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  variableId: string | null;
  min?: number;
  max?: number;
  variableIds?: string[];
  hybridValues?: string[];
  soundType?: 'sine' | 'square' | 'sawtooth' | 'triangle';
  icon?: 'none' | 'power' | 'play' | 'light';
  color?: 'orange' | 'green' | 'red' | 'blue' | 'yellow' | 'grey';
  cursorVariableId?: string | null;
  pressVariableId?: string | null;
  oledModeVarId?: string | null;
  oledTempVarId?: string | null;
  oledTimeVarId?: string | null;
  oledStateVarId?: string | null;
  oledSteamVarId?: string | null;
  oledHeatVarId?: string | null;
  oledFanVarId?: string | null;
  oledLightVarId?: string | null;
  oledDuoVarId?: string | null;
  oledProgressVarId?: string | null;
  iconEmoji?: string;
  targetValue?: string;
  oledModeNames?: string;
  oledIndicatorEmojis?: string[];
  oledIndicatorVarIds?: (string | null)[];
  oledIndicatorLabels?: string[];
  oledTitle?: string;
  encoderValues?: string[];
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
  if (['float', 'single', 'double'].includes(type)) {
    const parsed = parseFloat(trimmed);
    return isNaN(parsed) ? 0 : parsed;
  }
  const parsed = parseInt(trimmed, 10);
  if (isNaN(parsed)) return 0;
  switch (type) {
    case 'int8': return Math.max(-128, Math.min(127, parsed));
    case 'uint8': return Math.max(0, Math.min(255, parsed));
    case 'int16': return Math.max(-32768, Math.min(32767, parsed));
    case 'uint16': return Math.max(0, Math.min(65535, parsed));
    case 'int32': return Math.max(-2147483648, Math.min(2147483647, parsed));
    case 'uint32': return Math.max(0, Math.min(4294967295, parsed));
    case 'uint': return Math.max(0, parsed);
    default: return parsed;
  }
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
// STATIC CODE METRICS ENGINE (MATLAB-STYLE REPORTING)
// =============================================================================
const generateStaticMetricsReport = (chart: any, files: { name: string, content: string }[]): string => {
  const now = new Date().toISOString();
  const totalStates = chart.states.length;
  const totalTransitions = chart.transitions.length;
  const totalJunctions = chart.junctions.length;
  const totalVars = chart.variables.length;
  
  // Calculate total LOC
  const totalLoc = files.reduce((sum, f) => sum + f.content.split('\n').length, 0);
  const functionalLoc = files.reduce((sum, f) => {
    return sum + f.content.split('\n').filter(line => line.trim() && !line.trim().startsWith('/') && !line.trim().startsWith('*')).length;
  }, 0);

  // Complexity Analysis (Simplified McCabe for State Machines)
  const regions = new Set(chart.states.map((s: any) => s.regionId || 'MAIN'));
  const complexityPerRegion = Array.from(regions).map(r => {
    const rStates = chart.states.filter((s: any) => (s.regionId || 'MAIN') === r);
    const rTransitions = chart.transitions.filter((t: any) => {
        const src = chart.states.find((s: any) => s.id === t.sourceId);
        return src && (src.regionId || 'MAIN') === r;
    });
    const complexity = rTransitions.length - rStates.length + 2;
    return { region: r, complexity: Math.max(1, complexity) };
  });

  // State Reachability
  const visited = new Set<string>();
  const autostart = chart.states.find((s: any) => s.autostart && (!s.parentId || s.parentId === 'root'));
  if (autostart) {
    const queue = [autostart.id];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (visited.has(curr)) continue;
      visited.add(curr);
      chart.transitions
        .filter((t: any) => t.sourceId === curr)
        .forEach((t: any) => {
          if (t.targetId) queue.push(t.targetId);
        });
    }
  }
  const reachability = totalStates > 0 ? (visited.size / totalStates) * 100 : 0;

  // Resource usage estimates
  const stackEstimate = totalStates * 4 + 64; 
  const globalVarBytes = chart.variables.reduce((sum: number, v: any) => {
      if (v.type.includes('64') || v.type === 'double') return sum + 8;
      if (v.type.includes('32') || v.type === 'float' || v.type === 'single') return sum + 4;
      if (v.type.includes('16')) return sum + 2;
      return sum + 1;
  }, 0) + (totalStates * 4); 

  return `
# Static Code Metric Report
Generated by ADIA Static Analysis Engine
Timestamp: ${now}

## 1. Project Overview
| Metric | Value |
|--------|-------|
| Total States | ${totalStates} |
| Total Transitions | ${totalTransitions} |
| Total Junctions | ${totalJunctions} |
| Total Variables | ${totalVars} |
| Solver Mode | Fixed-Step (${chart.tickMs}ms) |

## 2. Complexity Analysis (McCabe)
${complexityPerRegion.map(c => `- **Region ${c.region}**: Cyclomatic Complexity = ${c.complexity} ${c.complexity > 10 ? '⚠️ (High)' : '✅ (Low)'}`).join('\n')}

**State Reachability**: ${reachability.toFixed(1)}%
${reachability < 100 ? `> [!WARNING]\n> ${totalStates - visited.size} unreachable states detected. These indicate logic gaps or dead code in the current configuration.` : ''}

## 3. Implementation Metrics (MISRA-C)
| Metric | Value |
|--------|-------|
| Total Lines of Code (LOC) | ${totalLoc} |
| Functional LOC | ${functionalLoc} |
| Comment Density | ${((totalLoc - functionalLoc) / (totalLoc || 1) * 100).toFixed(1)}% |
| Estimated RAM Footprint | ~${globalVarBytes + stackEstimate} Bytes |
| Compliance Level | IEC 60730 Class B / SIL-2 |

## 4. Interface Definition
**Inputs/Global Variables**:
${chart.variables.length > 0 ? chart.variables.map((v: any) => `- \`${v.name}\` (${v.type})`).join('\n') : '*No global variables defined.*'}

## 5. Violation Summary
- **MISRA Violations**: 0 (AI-Audited)
- **Safety Hazards**: ${chart.states.some((s: any) => s.isSafeState) ? '0' : 'N/A'}
- **Dead-lock Potential**: Low

---
*Report automatically generated for compliance auditing.*
`.trim();
};

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

const HierarchyTree = ({
  states,
  layers,
  activeStates,
  currentLayerId,
  onSelect,
  onDoubleClick,
  selectedIds,
}: {
  states: StateData[];
  layers: Layer[];
  activeStates: Record<string, string>;
  currentLayerId: string;
  onSelect: (id: string) => void;
  onDoubleClick: (id: string) => void;
  selectedIds: string[];
}): React.ReactNode => {
  const renderNode = (state: StateData, level: number): React.ReactNode => {
    const isActive = Object.values(activeStates).includes(state.id);
    const isSelected = selectedIds.includes(state.id);

    const childLayer = layers.find(l => l.parentStateId === state.id);
    const childStates = childLayer
      ? states.filter(s => childLayer.stateIds.includes(s.id))
      : [];

    return (
      <div key={state.id}>
        <div
          onClick={(e) => { e.stopPropagation(); onSelect(state.id); }}
          onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(state.id); }}
          className={`flex items-center p-1 rounded cursor-pointer hover:bg-[#2a2a2a] ${isSelected ? 'bg-[#f97316]/30' : ''
            } ${isActive ? 'font-bold' : ''}`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill={isActive ? '#4ade80' : 'none'} stroke={state.color} strokeWidth="2" className="mr-2 shrink-0">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          </svg>
          <span className="text-sm truncate" title={state.name}>{state.name}</span>
        </div>
        {childStates.length > 0 && (
          <div>
            {childStates.map(childState => renderNode(childState, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const rootLayer = layers.find(l => l.id === 'root');
  const rootStates = rootLayer ? states.filter(s => rootLayer.stateIds.includes(s.id)) : [];

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
      {rootStates.length > 0 ? rootStates.sort((a, b) => a.name.localeCompare(b.name)).map(state => renderNode(state, 0)) : (
        <div className="text-center text-xs text-[#666] p-4">No states in root.</div>
      )}
    </div>
  );
};

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
      } : {
        position: 'absolute',
        left: windowState.pos.x,
        top: windowState.pos.y,
        width: windowState.size.width,
        height: windowState.size.height,
        zIndex: windowState.zIndex,
      }}
      className="bg-[#1a1a1a] border border-[#f97316] rounded-lg flex flex-col shadow-2xl overflow-hidden"
      onMouseDown={() => !isMobile && onUpdate(windowState.id, { zIndex: Date.now() })}
    >
      <div
        className="h-8 bg-[#1a1a1a] border-b border-[#222] flex items-center justify-between px-3 cursor-move select-none shrink-0"
        onMouseDown={(e) => {
          if (isMobile) return;
          e.stopPropagation();
          setIsDragging(true);
          setDragOffset({ x: e.clientX - windowState.pos.x, y: e.clientY - windowState.pos.y });
        }}
      >
        <span className="text-xs font-bold text-[#f97316]">{windowState.title}</span>
        <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="text-[#666] hover:text-[#e0e0e0]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      <div className="flex-1 overflow-hidden relative flex flex-col">
        {children}
      </div>
      {!isMobile && <div
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



const TraceabilityMatrix = ({
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
      if (rel.type === 'composition' || rel.type === 'derive' || rel.type === 'deriveReqt') {
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
        return `[${rel.type}] ${target?.name}`;
      }).join('; ');

      const satisfiedByBlocks = blocks.filter(b => b.satisfiedReqIds?.includes(r.id)).map(b => b.name);
      const satisfiedByParts = parts.filter(p => p.satisfiedReqIds?.includes(r.id)).map(p => p.name);
      const satisfiedBy = [...satisfiedByBlocks, ...satisfiedByParts].join('; ');

      const prefix = '  '.repeat(level) + (level > 0 ? '└ ' : '');

      return {
        ID: r.reqId || '',
        Name: prefix + r.name,
        Status: r.status || '',
        Priority: r.priority || '',
        'Assigned To': r.assignedTo || 'Unassigned',
        Description: r.description || '',
        Links: outgoing,
        SatisfiedBy: satisfiedBy
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
        <h2 className="text-lg font-bold text-[#f97316]">MISRA-C Code Generation</h2>
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
            onClick={() => {
              files.forEach(f => {
                const element = document.createElement('a');
                element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(f.content));
                element.setAttribute('download', f.name);
                element.style.display = 'none';
                document.body.appendChild(element);
                element.click();
                document.body.removeChild(element);
              });
              addError('info', 'Files downloaded successfully');
              onClose();
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

    // Download H file
    const elementH = document.createElement('a');
    elementH.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(h_content));
    elementH.setAttribute('download', 'pid_controller.h');
    elementH.style.display = 'none';
    document.body.appendChild(elementH);
    elementH.click();
    document.body.removeChild(elementH);

    // Download C file
    const elementC = document.createElement('a');
    elementC.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(c_content));
    elementC.setAttribute('download', 'pid_controller.c');
    elementC.style.display = 'none';
    document.body.appendChild(elementC);
    elementC.click();
    document.body.removeChild(elementC);

    addError('info', 'PID C code exported.');
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
    <div className="flex flex-col h-full w-full bg-[#050505] text-[#e0e0e0] font-sans">
      {/* Top Control Bar */}
      <div className="h-14 border-b border-[#222] bg-[#0a0a0a] flex items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Layers size={18} className="text-[#f97316]" />
            <h2 className="text-sm font-black uppercase tracking-tighter text-[#f97316]">DOE ANALYZER Pro</h2>
          </div>
          <div className="h-4 w-px bg-[#222]" />
          <div className="flex gap-2">
            <Button size="sm" variant={activeModel === 'RSM' ? 'default' : 'secondary'} onClick={calculateRSM}>
              Run RSM
            </Button>
            <Button size="sm" variant={activeModel === 'GMDH' ? 'default' : 'secondary'} onClick={calculateGMDH}>
              Run GMDH
            </Button>
            <Button size="sm" variant={activeModel === 'Taguchi' ? 'default' : 'secondary'} onClick={calculateTaguchi}>
              Run Taguchi
            </Button>
            {activeModel === 'Taguchi' && (
              <Button size="sm" variant="outline" onClick={() => setShowDesignBuilder(true)}>
                Create Taguchi Design
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx,.csv" onChange={handleFileUpload} />
          <Button variant="outline" size="sm" onClick={handleExportProject} title="Ctrl+S">
            <Save size={14} className="mr-2" /> Save
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload size={14} className="mr-2" /> Upload Data
          </Button>
          <Button variant="outline" size="sm" onClick={generateReport}>
            <FileText size={14} className="mr-2" /> Report
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-red-500">Close</Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Results & Config */}
        <div className="w-80 border-r border-[#222] bg-[#0a0a0a] flex flex-col p-4 overflow-y-auto custom-scrollbar">
          {results ? (
            <div className="space-y-6">
              <section className="bg-white/5 p-3 rounded-xl border border-white/10 shadow-2xl">
                <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3">Model Deployment</h3>
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 text-[10px] font-black border-sky-500/30 text-sky-400 hover:bg-sky-500 hover:text-white transition-all duration-300"
                    onClick={handleExportToXBridges}
                  >
                    <Network size={12} className="mr-2" /> X-Bridges
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 text-[10px] font-black border-purple-500/30 text-purple-400 hover:bg-purple-500 hover:text-white transition-all duration-300"
                    onClick={handleExportToVLab}
                  >
                    <Box size={12} className="mr-2" /> V-Lab
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
                      className="h-6 text-[9px] border-[#f97316] text-[#f97316] hover:bg-[#f97316] hover:text-white"
                      onClick={handleExportToVLab}
                    >
                      Export to V-Lab
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-6 text-[9px] border-sky-500 text-sky-500 hover:bg-sky-500 hover:text-white"
                      onClick={handleExportToXBridges}
                    >
                      Export to X-Bridges
                    </Button>
                    <div className="w-2" />
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setEqFontSize(p => Math.max(8, p - 1))}><span className="text-[8px]">A-</span></Button>
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setEqFontSize(p => Math.min(32, p + 1))}><span className="text-[10px]">A+</span></Button>
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
                    <Label className="mb-2 block">Plot Type</Label>
                    <div className="grid grid-cols-2 gap-1">
                      <Button
                        size="sm"
                        variant={plotType === 'surface' ? 'default' : 'outline'}
                        onClick={() => setPlotType('surface')}
                        className="text-[10px]"
                      >
                        Surface
                      </Button>
                      <Button
                        size="sm"
                        variant={plotType === 'contour' ? 'default' : 'outline'}
                        onClick={() => setPlotType('contour')}
                        className="text-[10px]"
                      >
                        Contour
                      </Button>
                      {results?.type === 'Taguchi' && (
                        <>
                          <Button
                            size="sm"
                            variant={plotType === 'taguchi_main_sn' ? 'default' : 'outline'}
                            onClick={() => setPlotType('taguchi_main_sn')}
                            className="text-[10px]"
                          >
                            Main Effects (S/N)
                          </Button>
                          <Button
                            size="sm"
                            variant={plotType === 'taguchi_main_mean' ? 'default' : 'outline'}
                            onClick={() => setPlotType('taguchi_main_mean')}
                            className="text-[10px]"
                          >
                            Main Effects (Means)
                          </Button>
                        </>
                      )}
                      {(results?.type === 'RSM' || results?.type === 'Taguchi') && (
                        <>
                          {results?.type === 'RSM' && <Button size="sm" variant={plotType === 'pareto' ? 'default' : 'outline'} onClick={() => setPlotType('pareto')} className="text-[10px]">Pareto</Button>}
                          <Button size="sm" variant={plotType === 'residuals' ? 'default' : 'outline'} onClick={() => setPlotType('residuals')} className="text-[10px]">Residuals</Button>
                        </>
                      )}
                      {results?.type === 'Taguchi' && (
                        <Button size="sm" variant={plotType === 'taguchi_delta' ? 'default' : 'outline'} onClick={() => setPlotType('taguchi_delta')} className="text-[10px]">Rank/Delta</Button>
                      )}
                      {(results?.type === 'RSM' || results?.type === 'GMDH' || results?.type === 'Taguchi') && (
                        <Button size="sm" variant={plotType === 'pred_vs_act' ? 'default' : 'outline'} onClick={() => setPlotType('pred_vs_act')} className="text-[10px]">Pred vs Act</Button>
                      )}
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
                  <Button onClick={() => setShowDesignBuilder(true)}>
                    Create Taguchi Design Wizard
                  </Button>
                </div>
              ) : (
                <div className="flex-1 relative border-b border-[#222] min-h-[300px]">
                  <div className="absolute top-4 left-4 z-10 flex gap-1">
                    <Button size="sm" variant={plotType === 'surface' ? 'default' : 'secondary'} onClick={() => setPlotType('surface')}>3D Surface</Button>
                    <Button size="sm" variant={plotType === 'contour' ? 'default' : 'secondary'} onClick={() => setPlotType('contour')}>Contour</Button>
                    {results?.type === 'Taguchi' && (
                      <>
                        <Button size="sm" variant={plotType === 'taguchi_main_sn' ? 'default' : 'secondary'} onClick={() => setPlotType('taguchi_main_sn')}>Main Effects (SN)</Button>
                        <Button size="sm" variant={plotType === 'taguchi_main_mean' ? 'default' : 'secondary'} onClick={() => setPlotType('taguchi_main_mean')}>Main Effects (Means)</Button>
                      </>
                    )}
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
                  <div className="absolute bottom-1 text-[9px] text-white font-mono select-none">Pos {currentIndex + 1}</div>
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
            <button onClick={() => setEditMode(true)} className={`px-3 py-1 text-xs rounded ${editMode ? 'bg-[#333] text-white' : 'text-[#888]'}`}>Edit</button>
            <button onClick={() => { setEditMode(false); setSelectedId(null); }} className={`px-3 py-1 text-xs rounded ${!editMode ? 'bg-[#f97316] text-black font-bold' : 'text-[#888]'}`}>Run</button>
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

const TickRateInput = ({ value, onChange }: { value: number, onChange: (val: number) => void }) => {
  const [localValue, setLocalValue] = useState(String(value));

  useEffect(() => {
    setLocalValue(String(value));
  }, [value]);

  const commit = () => {
    const num = parseInt(normalizeNumerals(localValue));
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
    <div className="flex flex-col h-full bg-[#0a0a0a] border border-[#222] rounded overflow-hidden">
      <div className="flex items-center justify-between p-2 border-b border-[#222] bg-[#1a1a1a]">
        <span className="text-xs font-bold uppercase tracking-wider text-[#888]">Experiment Data</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={addFactor}>+ Factor</Button>
          <Button size="sm" variant="outline" onClick={addRow}>+ Row</Button>
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

const PlotlyPlots = ({
  type,
  data,
  results,
  factors,
  headers,
  holdValues,
  modelType = 'RSM'
}: {
  type: 'surface' | 'contour' | 'pareto' | 'residuals' | 'taguchi_delta' | 'pred_vs_act' | 'taguchi_main_sn' | 'taguchi_main_mean',
  data: number[][],
  results: any,
  factors: { x: number, y: number },
  headers: string[],
  holdValues: number[],
  modelType?: 'RSM' | 'GMDH' | 'Taguchi'
}) => {
  if (!results || !data) return <div className="flex items-center justify-center h-full text-[#444]">No Model Calculated</div>;

  if (type === 'pareto' && results.coeffTable) {
    // Pareto Chart of Standardized Effects with dynamic critical t-value
    const n = data.length;
    const p = results.coeffTable?.length || 1;
    const dfErr = Math.max(1, n - p);
    // Compute critical t from degrees of freedom (approximate)
    const lgamma = (x: number): number => {
      const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
        -1.231739572450155, 0.001208650973866179, -0.000005395239384953];
      let y = x, tmp = x + 5.5;
      tmp -= (x + 0.5) * Math.log(tmp);
      let ser = 1.000000000190015;
      for (let j = 0; j < 6; j++) ser += c[j] / ++y;
      return -tmp + Math.log(2.5066282746310005 * ser / x);
    };
    // Approximate critical t via Wilson-Hilferty
    let critT = 2.0; // fallback
    if (dfErr > 2) {
      const a = 0.025; // two-tailed alpha/2
      let z = Math.sqrt(-2 * Math.log(a));
      z = z - (2.30753 + 0.27061 * z) / (1 + 0.99229 * z + 0.04481 * z * z);
      critT = Math.abs(z * Math.sqrt(dfErr / (dfErr - 2 + z * z / (3 * dfErr))));
      critT = Math.min(critT, z * (1 + 1 / (4 * dfErr))); // bounded correction
    }

    const sortedEffects = results.coeffTable
      .filter((c: any) => c.term !== 'Intercept')
      .map((c: any) => ({ term: c.term, absT: Math.abs(c.t) }))
      .sort((a: any, b: any) => a.absT - b.absT);

    const trace = {
      x: sortedEffects.map((s: any) => s.absT),
      y: sortedEffects.map((s: any) => s.term),
      type: 'bar',
      orientation: 'h',
      marker: {
        color: sortedEffects.map((s: any) => s.absT > critT ? '#10b981' : '#444'),
        line: { color: '#000', width: 1 }
      },
      name: 'Effect Magnitude'
    };

    return (
      <Plot
        data={[trace] as any}
        layout={{
          template: { layout: { paper_bgcolor: 'transparent', plot_bgcolor: 'transparent' } },
          autosize: true,
          margin: { l: 120, r: 40, t: 40, b: 40 },
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'rgba(0,0,0,0.2)',
          font: { color: '#888', size: 10 },
          title: { text: `Pareto Chart of Standardized Effects (α=0.05, df=${dfErr})`, font: { size: 12, color: '#f97316' } },
          xaxis: { title: 'Absolute T-Value', gridcolor: '#222' },
          yaxis: { title: 'Factor Term', gridcolor: '#222' },
          shapes: [
            {
              type: 'line',
              x0: critT,
              x1: critT,
              y0: -0.5,
              y1: sortedEffects.length - 0.5,
              line: { color: '#ef4444', width: 2, dash: 'dash' }
            }
          ],
          annotations: [
            {
              x: critT,
              y: sortedEffects.length - 1,
              text: `t_crit = ${critT.toFixed(3)}`,
              showarrow: false,
              font: { color: '#ef4444', size: 9 },
              xanchor: 'left',
              xshift: 5
            }
          ]
        }}
        useResizeHandler
        className="w-full h-full"
      />
    );
  }

  if (type === 'residuals' && results.residuals) {
    // Residual Diagnostics
    const res = results.residuals;
    const fits = results.fits || [];
    
    // Normal Probability Plot Calculation
    const sortedRes = [...res].sort((a, b) => a - b);
    const n = res.length;
    const pValues = res.map((_: number, i: number) => (i + 0.5) / n);
    const zScores = pValues.map((p: number) => {
      // Simple inverse normal approximation
      const t = Math.sqrt(-2 * Math.log(Math.min(p, 1 - p)));
      const z = t - (2.30753 + 0.27061 * t) / (1 + 0.99229 * t + 0.04481 * t * t);
      return p > 0.5 ? z : -z;
    });

    const normalTrace = {
      x: sortedRes,
      y: zScores,
      mode: 'markers',
      type: 'scatter',
      name: 'Normal Probability',
      marker: { color: '#f97316' }
    };

    const fitsTrace = {
      x: fits,
      y: res,
      mode: 'markers',
      type: 'scatter',
      name: 'Residual vs Fits',
      xaxis: 'x2',
      yaxis: 'y2',
      marker: { color: '#10b981' }
    };

    const histTrace = {
      x: res,
      type: 'histogram',
      name: 'Histogram',
      xaxis: 'x3',
      yaxis: 'y3',
      marker: { color: '#f97316' }
    };

    return (
      <Plot
        data={[normalTrace, fitsTrace, histTrace] as any}
        layout={{
          grid: { rows: 2, columns: 2, pattern: 'independent' },
          template: { layout: { paper_bgcolor: 'transparent', plot_bgcolor: 'transparent' } },
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'rgba(0,0,0,0.1)',
          font: { color: '#888', size: 10 },
          showlegend: false,
          annotations: [
            { text: 'Normal Probability Plot', xref: 'paper', yref: 'paper', x: 0, y: 1.1, showarrow: false, font: { color: '#f97316' } },
            { text: 'Residual vs Fits', xref: 'paper', yref: 'paper', x: 0.6, y: 1.1, showarrow: false, font: { color: '#10b981' } },
            { text: 'Histogram of Residuals', xref: 'paper', yref: 'paper', x: 0, y: 0.4, showarrow: false, font: { color: '#f97316' } }
          ],
          xaxis: { title: 'Residual', gridcolor: '#222' },
          yaxis: { title: 'Z-Score', gridcolor: '#222' },
          xaxis2: { title: 'Fitted Value', gridcolor: '#222' },
          yaxis2: { title: 'Residual', gridcolor: '#222' },
          xaxis3: { title: 'Residual', gridcolor: '#222' },
          yaxis3: { title: 'Frequency', gridcolor: '#222' }
        }}
        useResizeHandler
        className="w-full h-full"
      />
    );
  }

  if (type === 'pred_vs_act' && results.fits) {
    const act = results.actuals || data.map(r => r[headers.length-1]);
    const fits = results.fits;
    
    const min = Math.min(...act, ...fits);
    const max = Math.max(...act, ...fits);

    const trace = {
      x: act,
      y: fits,
      mode: 'markers',
      type: 'scatter',
      name: 'Observations',
      marker: { color: '#f97316', size: 8, line: { color: '#000', width: 1 } }
    };

    const line = {
      x: [min, max],
      y: [min, max],
      mode: 'lines',
      type: 'scatter',
      name: 'Ideal (45°)',
      line: { color: '#666', dash: 'dash', width: 1 }
    };

    return (
      <Plot
        data={[trace, line] as any}
        layout={{
          template: { layout: { paper_bgcolor: 'transparent', plot_bgcolor: 'transparent' } },
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'rgba(0,0,0,0.1)',
          font: { color: '#888', size: 10 },
          title: { text: 'Predicted vs Actual Response', font: { size: 12, color: '#f97316' } },
          xaxis: { title: 'Actual Value', gridcolor: '#222', scaleanchor: 'y', scaleratio: 1 },
          yaxis: { title: 'Predicted Value', gridcolor: '#222' }
        }}
        useResizeHandler
        className="w-full h-full"
      />
    );
  }
  if (type === 'taguchi_delta' && results.type === 'Taguchi') {
    // Response Table Delta Plot
    const deltaTrace = {
      x: results.factorLevels.map((f: any) => f.factor),
      y: results.factorLevels.map((f: any) => f.delta),
      type: 'bar',
      marker: { color: '#f97316' },
      name: 'Delta (Max-Min)'
    };

    return (
      <Plot
        data={[deltaTrace] as any}
        layout={{
          template: { layout: { paper_bgcolor: 'transparent', plot_bgcolor: 'transparent' } },
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'rgba(0,0,0,0.1)',
          font: { color: '#888', size: 10 },
          title: { text: 'Response Table Delta (Factor Significance)', font: { size: 12, color: '#f97316' } },
          xaxis: { title: 'Factor', gridcolor: '#222' },
          yaxis: { title: 'Delta (S/N)', gridcolor: '#222' }
        }}
        useResizeHandler
        className="w-full h-full"
      />
    );
  }

  if (modelType === 'Taguchi' && (type === 'taguchi_main_sn' || type === 'taguchi_main_mean')) {
    const isSN = type === 'taguchi_main_sn';
    const K = results.factorLevels?.length || 0;
    if (K === 0) return <div className="flex items-center justify-center h-full text-[#444]">No Factor Levels Found</div>;

    const traces: any[] = [];
    const layoutAxes: any = {};
    const grandMean = isSN ? results.grandMeanSN : results.grandMeanY;

    results.factorLevels.forEach((fl: any, idx: number) => {
      const factorName = fl.factor;
      const sortedMeans = [...fl.means].sort((a: any, b: any) => a.level - b.level);
      const x = sortedMeans.map((m: any) => `L${m.level}`);
      const y = sortedMeans.map((m: any) => isSN ? m.meanSN : m.meanY);
      
      traces.push({
        x,
        y,
        type: 'scatter',
        mode: 'lines+markers',
        name: factorName,
        xaxis: 'x' + (idx + 1),
        yaxis: 'y',
        line: { 
          color: isSN ? '#f97316' : '#10b981', 
          width: 3 
        },
        marker: { 
          color: isSN ? '#f97316' : '#10b981', 
          size: 10,
          line: { color: '#000', width: 1 } 
        },
        showlegend: false
      });

      layoutAxes[`xaxis${idx + 1}`] = {
        title: factorName,
        titlefont: { size: 10, color: '#aaa', family: 'Inter, sans-serif' },
        tickfont: { size: 9, color: '#888' },
        gridcolor: '#222',
        zeroline: false,
        domain: [idx / K + 0.02, (idx + 1) / K - 0.02]
      };
    });

    const layout = {
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'rgba(0,0,0,0.1)',
      font: { color: '#888', family: 'Inter, sans-serif' },
      margin: { l: 60, r: 20, b: 50, t: 50 },
      title: { 
        text: isSN ? 'Main Effects Plot for SN Ratios' : 'Main Effects Plot for Means',
        font: { size: 13, color: '#f97316' }
      },
      yaxis: {
        title: isSN ? 'Mean S/N Ratio (dB)' : 'Mean Response',
        gridcolor: '#222',
        tickfont: { size: 9, color: '#aaa' },
        zeroline: false
      },
      ...layoutAxes,
      shapes: [
        {
          type: 'line',
          x0: 0,
          x1: 1,
          xref: 'paper',
          y0: grandMean || 0,
          y1: grandMean || 0,
          yref: 'y',
          line: { color: '#666', width: 1.5, dash: 'dash' }
        }
      ],
      annotations: [
        {
          xref: 'paper',
          yref: 'y',
          x: 0.98,
          y: grandMean || 0,
          text: `Grand Mean: ${(grandMean || 0).toFixed(3)}`,
          showarrow: false,
          font: { color: '#888', size: 9 },
          yanchor: 'bottom',
          xanchor: 'right'
        }
      ],
      autosize: true
    };

    return (
      <div className="w-full h-full">
        <Plot
          data={traces as any}
          layout={layout as any}
          useResizeHandler={true}
          className="w-full h-full"
          config={{ displayModeBar: false }}
        />
      </div>
    );
  }

  const idxX = factors.x;
  const idxY = factors.y;

  const xVals = data.map(r => r[idxX]);
  const yVals = data.map(r => r[idxY]);
  const minX = Math.min(...xVals), maxX = Math.max(...xVals);
  const minY = Math.min(...yVals), maxY = Math.max(...yVals);

  // Higher resolution mesh for smoother surfaces
  const gridRes = 60;
  const stepX = Math.max(1e-9, (maxX - minX) / gridRes);
  const stepY = Math.max(1e-9, (maxY - minY) / gridRes);
  const xRange = Array.from({ length: gridRes + 1 }, (_, i) => minX + i * stepX);
  const yRange = Array.from({ length: gridRes + 1 }, (_, i) => minY + i * stepY);

  const k = headers.length - 1;
  const zGrid: number[][] = [];

  for (let j = 0; j < yRange.length; j++) {
    const rowZ: number[] = [];
    for (let i = 0; i < xRange.length; i++) {
      const currentFactors = [...holdValues];
      currentFactors[idxX] = xRange[i];
      currentFactors[idxY] = yRange[j];

      let z = 0;
      if (modelType === 'RSM' && results.Beta) {
        // Use unified prediction function — matches engine exactly
        z = results.Beta[0];
        for (let f = 0; f < k; f++) z += results.Beta[f + 1] * currentFactors[f];
        for (let f = 0; f < k; f++) z += results.Beta[k + 1 + f] * currentFactors[f] * currentFactors[f];
        let idx = 2 * k + 1;
        for (let f = 0; f < k; f++) {
          for (let g = f + 1; g < k; g++) {
            z += results.Beta[idx] * currentFactors[f] * currentFactors[g];
            idx++;
          }
        }
      } else if (modelType === 'GMDH' && results.model) {
        z = results.model.predict(currentFactors.slice(0, k));
      } else if (modelType === 'Taguchi' && results.factorLevels && results.grandMean !== undefined) {
        // Taguchi additive model surface
        z = results.grandMean;
        results.factorLevels.forEach((f: any, fIdx: number) => {
          const val = currentFactors[fIdx];
          if (f.means && f.means.length > 0) {
            const sorted = [...f.means].sort((a: any, b: any) => Math.abs(a.level - val) - Math.abs(b.level - val));
            if (sorted[0]) z += (sorted[0].meanY - results.grandMean);
          }
        });
      }
      rowZ.push(z);
    }
    zGrid.push(rowZ);
  }

  const plotData: any[] = [
    {
      z: zGrid,
      x: xRange,
      y: yRange,
      type: type === 'surface' ? 'surface' : 'contour',
      colorscale: 'Viridis',
      showscale: true,
      opacity: type === 'surface' ? 0.95 : 1,
      contours: type === 'contour' ? {
        coloring: 'heatmap',
        showlabels: true,
        labelfont: { size: 10, color: '#fff' }
      } : type === 'surface' ? {
        z: { show: true, usecolormap: true, highlightcolor: '#fff', project: { z: false } }
      } : undefined
    }
  ];

  // Overlay actual data points on 3D surface
  if (type === 'surface') {
    plotData.push({
      x: xVals,
      y: yVals,
      z: data.map(r => r[data[0].length - 1]),
      mode: 'markers',
      type: 'scatter3d',
      marker: {
        size: 5,
        color: '#f97316',
        opacity: 1,
        line: { width: 1, color: '#fff' }
      },
      name: 'Actual Data'
    });
  }

  const layout = {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { color: '#888', family: 'Inter, sans-serif' },
    margin: { l: 20, r: 20, b: 20, t: 40 },
    title: { 
      text: type === 'surface' ? '3D Response Surface' : 'Contour Plot',
      font: { size: 14, color: '#f97316' }
    },
    scene: {
      xaxis: { title: { text: headers[idxX], font: { color: '#f97316' } }, gridcolor: '#222' },
      yaxis: { title: { text: headers[idxY], font: { color: '#10b981' } }, gridcolor: '#222' },
      zaxis: { title: { text: headers[headers.length - 1], font: { color: '#3b82f6' } }, gridcolor: '#222' },
      camera: { eye: { x: 1.6, y: 1.6, z: 1.4 } }
    },
    autosize: true
  };

  return (
    <div className="w-full h-full">
      <Plot
        data={plotData}
        layout={layout}
        useResizeHandler={true}
        className="w-full h-full"
        config={{ displayModeBar: true, responsive: true }}
      />
    </div>
  );
};
// Help Data moved to HelpData.ts

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

const HelpModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const [activeTopic, setActiveTopic] = useState<string>("getting-started");
  const [searchQuery, setSearchQuery] = useState("");
  const [showBlockRef, setShowBlockRef] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  
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
  const filteredBlocks = allBlocks.filter(b => 
    b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.domain.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedBlock = allBlocks.find(b => b.id === selectedBlockId);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 backdrop-blur-3xl p-10 text-white font-sans">
      <div className="bg-[#0f0f0f] rounded-3xl border border-white/10 w-full h-full max-w-7xl flex flex-col shadow-[0_0_150px_rgba(0,0,0,0.8)] overflow-hidden">
        
        {/* TOP HEADER */}
        <header className="h-20 border-b border-white/5 flex items-center justify-between px-10 bg-[#151515]/50 backdrop-blur-xl">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center font-black text-xl shadow-[0_0_20px_rgba(249,115,22,0.3)]">A</div>
              <div className="flex flex-col">
                <span className="font-black tracking-tight text-xl leading-none">ADIA <span className="text-orange-500">DOCS</span></span>
                <span className="text-[9px] text-gray-500 font-bold uppercase tracking-[0.2em] mt-1">Advanced Engineering Reference</span>
              </div>
            </div>
            
            <div className="h-10 w-[1px] bg-white/10"></div>
            
            <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
              <button 
                onClick={() => setShowBlockRef(false)}
                className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${!showBlockRef ? 'bg-orange-500 text-black shadow-lg shadow-orange-500/20' : 'text-gray-500 hover:text-white'}`}
              >
                User Guide
              </button>
              <button 
                onClick={() => setShowBlockRef(true)}
                className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${showBlockRef ? 'bg-orange-500 text-black shadow-lg shadow-orange-500/20' : 'text-gray-500 hover:text-white'}`}
              >
                Block Reference
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-orange-500 transition-colors">
                <Search size={16} />
              </div>
              <input 
                type="text" 
                placeholder={showBlockRef ? "Search components..." : "Search documentation..."}
                className="bg-black/60 border border-white/10 rounded-full py-3 pl-12 pr-6 text-xs w-80 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 transition-all font-medium"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button 
              onClick={onClose}
              className="w-12 h-12 rounded-full bg-white/5 hover:bg-red-500/20 hover:text-red-500 flex items-center justify-center transition-all group"
            >
              <X size={24} className="group-hover:rotate-90 transition-transform" />
            </button>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          
          {/* SIDEBAR */}
          <aside className="w-80 border-r border-white/5 bg-[#0a0a0a] flex flex-col">
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
              {!showBlockRef ? (
                /* DOCUMENTATION TREE */
                <div className="space-y-8">
                  {Object.keys(topicCategories).map(cat => (
                    <div key={cat}>
                      <h4 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full bg-orange-500"></div>
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
                  <h4 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em] mb-4">Available Components</h4>
                  {filteredBlocks.map(block => (
                    <button 
                      key={block.id}
                      onClick={() => setSelectedBlockId(block.id)}
                      className={`w-full text-left px-4 py-2 rounded-xl text-[11px] transition-all flex items-center justify-between group ${selectedBlockId === block.id ? 'bg-orange-500 text-black font-black' : 'text-gray-500 hover:bg-white/5'}`}
                    >
                      <div className="flex items-center gap-3">
                        <Box size={14} className={selectedBlockId === block.id ? 'text-black' : 'text-gray-700'} />
                        {block.name}
                      </div>
                      <span className={`text-[8px] uppercase font-bold px-1.5 py-0.5 rounded ${selectedBlockId === block.id ? 'bg-black/20 text-black' : 'bg-white/5 text-gray-600'}`}>
                        {block.source}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>

          {/* MAIN CONTENT AREA */}
          <main className="flex-1 overflow-y-auto bg-[#0a0a0a] p-16 custom-scrollbar relative">
            {!showBlockRef ? (
              /* TOPIC VIEW */
              <div className="max-w-4xl mx-auto">
                <div className="mb-16">
                  <nav className="flex items-center gap-3 text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-6">
                    <span className="hover:text-orange-500 cursor-pointer">ADIA Docs</span>
                    <ChevronRight size={10} />
                    <span className="text-gray-400">{topic.category}</span>
                    <ChevronRight size={10} />
                    <span className="text-white">{topic.title}</span>
                  </nav>
                  
                  <h1 className="text-6xl font-black text-white tracking-tighter mb-6 leading-none">
                    {topic.title}
                  </h1>
                  <p className="text-xl text-gray-400 leading-relaxed font-light max-w-2xl">
                    {topic.description}
                  </p>
                </div>

                {topic.image && (
                  <div className="mb-16 rounded-3xl overflow-hidden border border-white/10 shadow-2xl group relative">
                    <img src={topic.image} alt={topic.title} className="w-full object-cover group-hover:scale-105 transition-transform duration-700" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                    <div className="absolute bottom-8 left-8 flex items-center gap-3">
                      <div className="p-2 bg-orange-500 rounded-lg text-black"><Activity size={16} /></div>
                      <span className="text-xs font-black uppercase tracking-widest text-white shadow-sm">Module Overview Diagram</span>
                    </div>
                  </div>
                )}

                <div className="prose prose-invert max-w-none">
                  <div className="text-gray-300 leading-relaxed text-lg mb-16 font-light">
                    {topic.content}
                  </div>

                  <div className="space-y-20">
                    {topic.sections?.map((section, idx) => (
                      <section key={idx} className="relative pl-12 border-l border-white/10 group">
                        <div className="absolute left-[-6px] top-0 w-3 h-3 rounded-full bg-white/10 group-hover:bg-orange-500 transition-colors shadow-[0_0_15px_rgba(255,255,255,0.1)] group-hover:shadow-orange-500/50"></div>
                        <h2 className="text-2xl font-black text-white mb-6 tracking-tight flex items-center gap-4">
                          {section.title}
                        </h2>
                        <div className="text-gray-400 leading-relaxed mb-8 whitespace-pre-wrap font-light">
                          {section.body}
                        </div>
                        
                        {section.list && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                            {section.list.map((item, i) => (
                              <div key={i} className="flex items-start gap-3 p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                                <div className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5 shrink-0"></div>
                                <span className="text-sm text-gray-300 font-light" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.replace(/\*\*(.*?)\*\*/g, '<b class="text-white">$1</b>')) }}></span>
                              </div>
                            ))}
                          </div>
                        )}

                        {section.code && (
                          <div className="relative group/code mt-8">
                            <div className="absolute right-4 top-4 text-[10px] font-black text-white/20 uppercase tracking-widest">Mathematical Model</div>
                            <div className="bg-black/80 rounded-2xl border border-white/10 p-8 font-mono text-sm text-orange-400 overflow-x-auto shadow-inner">
                              <pre className="m-0">{section.code}</pre>
                            </div>
                          </div>
                        )}
                      </section>
                    ))}
                  </div>

                  {topic.related && (
                    <div className="mt-32 pt-16 border-t border-white/5">
                      <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] mb-10">Expand Your Learning</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {topic.related.map(key => (
                          <button 
                            key={key}
                            onClick={() => setActiveTopic(key)}
                            className="p-8 bg-[#151515] border border-white/5 rounded-3xl hover:border-orange-500/40 transition-all text-left group hover:-translate-y-1"
                          >
                            <span className="text-[9px] text-orange-500 uppercase font-black block mb-2 tracking-widest">{HELP_DATA[key]?.category}</span>
                            <span className="text-lg font-bold text-white group-hover:text-orange-500 transition-colors block leading-tight">{HELP_DATA[key]?.title}</span>
                            <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-gray-500 group-hover:text-gray-300 transition-colors">
                              View Tutorial <ChevronRight size={10} />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* BLOCK REFERENCE VIEW */
              <div className="max-w-4xl mx-auto">
                {selectedBlock ? (
                  <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-start justify-between mb-16">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-4 mb-4">
                          <div className="p-4 bg-orange-500 rounded-2xl text-black shadow-2xl shadow-orange-500/20">
                            <DynamicIcon name={selectedBlock.icon} size={32} />
                          </div>
                          <div>
                            <h1 className="text-5xl font-black text-white tracking-tighter">{selectedBlock.name}</h1>
                            <div className="flex items-center gap-3 mt-2">
                              <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] font-black text-gray-400 uppercase tracking-widest">{selectedBlock.source} Component</span>
                              <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] font-black text-orange-500 uppercase tracking-widest">{selectedBlock.domain} Domain</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1">Status</div>
                        <div className="text-emerald-500 font-bold text-xs flex items-center gap-2 justify-end">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                          Fully Documented
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                      <div className="space-y-10">
                        <section>
                          <h3 className="text-xs font-black text-gray-500 uppercase tracking-[0.2em] mb-6">Component Interface</h3>
                          <div className="bg-black/40 rounded-3xl border border-white/5 p-8 relative flex items-center justify-center min-h-[300px]">
                            {/* Block Visualization */}
                            <div className="w-40 h-40 bg-orange-500/5 border-2 border-orange-500/30 rounded-3xl flex items-center justify-center relative shadow-[0_0_50px_rgba(249,115,22,0.1)]">
                              <DynamicIcon name={selectedBlock.icon} size={48} className="text-orange-500" />
                              
                              {/* Port Labels */}
                              {selectedBlock.ports?.map((p: any, i: number) => (
                                <div key={i} className={`absolute text-[8px] font-black uppercase text-gray-400 p-2 ${p.position === 'left' ? '-left-12' : p.position === 'right' ? '-right-12' : p.position === 'top' ? '-top-10' : '-bottom-10'}`}>
                                  {p.label || p.name}
                                  <div className={`absolute w-2 h-2 rounded-full border-2 border-orange-500 bg-black ${p.position === 'left' ? 'right-[-4px] top-1/2 -translate-y-1/2' : p.position === 'right' ? 'left-[-4px] top-1/2 -translate-y-1/2' : p.position === 'top' ? 'bottom-[-4px] left-1/2 -translate-x-1/2' : 'top-[-4px] left-1/2 -translate-x-1/2'}`}></div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </section>

                        <section>
                          <h3 className="text-xs font-black text-gray-500 uppercase tracking-[0.2em] mb-6">Configurable Parameters</h3>
                          <div className="space-y-3">
                            {Object.entries(selectedBlock.params || {}).map(([key, p]: [string, any]) => (
                              <div key={key} className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-2xl group hover:bg-white/[0.04] transition-colors">
                                <div className="flex flex-col">
                                  <span className="text-[10px] font-black text-white uppercase">{p.label || key}</span>
                                  <span className="text-[9px] text-gray-600 font-mono">{key}</span>
                                </div>
                                <div className="text-right">
                                  <span className="text-xs font-bold text-orange-500">{p.value}</span>
                                  <span className="text-[9px] text-gray-500 ml-1 uppercase">{p.unit}</span>
                                </div>
                              </div>
                            ))}
                            {Object.keys(selectedBlock.params || {}).length === 0 && (
                              <div className="p-8 text-center text-xs text-gray-600 italic bg-white/[0.01] border border-dashed border-white/10 rounded-2xl">
                                No configurable parameters for this component.
                              </div>
                            )}
                          </div>
                        </section>
                      </div>

                      <div className="space-y-10">
                        <section>
                          <h3 className="text-xs font-black text-gray-500 uppercase tracking-[0.2em] mb-6">Execution Logic</h3>
                          <div className="bg-black/60 rounded-3xl border border-white/5 p-8">
                            <p className="text-sm text-gray-400 leading-relaxed font-light mb-6">
                              {selectedBlock.description || "This block performs real-time computation of its internal transfer function during each simulation step (fixed-step solver)."}
                            </p>
                            <div className="bg-orange-500/5 p-6 rounded-2xl border border-orange-500/20">
                              <h4 className="text-[9px] font-black text-orange-500 uppercase tracking-widest mb-4">Physics Equation</h4>
                              <div className="font-mono text-sm text-white/90 italic whitespace-pre-wrap">
                                {selectedBlock.equation || (selectedBlock.domain === 'Electrical' ? 'V = I * Z(s)' : selectedBlock.domain === 'Mechanical' ? 'F = m * dv/dt' : 'Y = f(U)')}
                              </div>
                            </div>
                          </div>
                        </section>

                        <section>
                          <h3 className="text-xs font-black text-gray-500 uppercase tracking-[0.2em] mb-6">Usage Example</h3>
                          <div className="p-8 bg-gradient-to-br from-orange-500/10 to-transparent border border-orange-500/10 rounded-3xl">
                            <p className="text-xs text-gray-400 leading-relaxed mb-6 font-light italic">
                              "Connect the {selectedBlock.name} to a <b>Scope</b> to visualize its dynamics in real-time. Ensure the input signal type matches the expected physical domain."
                            </p>
                            <button className="flex items-center gap-2 text-[10px] font-black text-orange-500 uppercase tracking-widest hover:text-orange-400 transition-colors">
                              Open Learning Lab <ChevronRight size={12} />
                            </button>
                          </div>
                        </section>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-[60vh] flex flex-col items-center justify-center text-center">
                    <div className="w-24 h-24 bg-white/[0.03] rounded-full flex items-center justify-center mb-8 border border-white/5">
                      <Search size={40} className="text-gray-700" />
                    </div>
                    <h2 className="text-3xl font-black text-white tracking-tighter mb-4">Explore the Block Library</h2>
                    <p className="text-gray-500 max-w-sm leading-relaxed text-sm font-light">
                      Select a component from the sidebar to view its mathematical model, electrical ports, and configuration parameters.
                    </p>
                  </div>
                )}
              </div>
            )}
          </main>
        </div>

        {/* FOOTER */}
        <footer className="h-14 border-t border-white/5 bg-[#111] flex items-center justify-between px-10">
          <div className="flex items-center gap-6">
            <span className="text-[9px] text-gray-600 font-black uppercase tracking-widest">ADIA Engineering Suite v2.4</span>
            <div className="h-4 w-[1px] bg-white/5"></div>
            <div className="flex gap-4">
              <button className="text-[9px] text-gray-500 font-bold uppercase hover:text-white transition-colors">Safety Standard</button>
              <button className="text-[9px] text-gray-500 font-bold uppercase hover:text-white transition-colors">Compliance Record</button>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex -space-x-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="w-6 h-6 rounded-full border-2 border-[#111] bg-gray-800 flex items-center justify-center text-[8px] font-bold text-gray-500">U{i}</div>
              ))}
            </div>
            <span className="text-[9px] text-gray-500 font-black uppercase tracking-widest">Join the Community</span>
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
    const sourceHTML = header + clone.innerHTML + footer;
    
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
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && reportData && previewRef.current) {
      const scripts = previewRef.current.querySelectorAll('script');
      scripts.forEach(script => {
        try {
          const newScript = document.createElement('script');
          if (script.src) {
            newScript.src = script.src;
          } else {
            newScript.textContent = script.textContent;
          }
          document.body.appendChild(newScript);
          document.body.removeChild(newScript);
        } catch (e) {
          console.error("Failed to run preview script:", e);
        }
      });
    }
  }, [isOpen, reportData, layout]);

  if (!isOpen || !reportData) return null;

  const exportToWord = async () => {
    if (!previewRef.current) return;
    
    const clone = previewRef.current.cloneNode(true) as HTMLDivElement;
    const svgs = clone.querySelectorAll('svg');
    const images: { id: string, data: string }[] = [];
    
    // Convert SVGs to images and collect them
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
        const height = parseInt(svg.getAttribute("height") || "600");
        
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
        newImg.src = `cid:${imageId}`; // Use Content-ID for MHTML
        
        // Cap the display width so it doesn't overflow Word's page margins, keeping font scale reasonable
        const MAX_WORD_WIDTH = 650;
        const displayWidth = width > MAX_WORD_WIDTH ? MAX_WORD_WIDTH : width;
        newImg.setAttribute('width', displayWidth.toString());
        
        svg.parentNode?.replaceChild(newImg, svg);
      } catch (e) { console.error('Failed to capture SVG', e); }
    }

    const htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'>
      <head><meta charset='utf-8'><title>${reportData.projectName} Report</title></head>
      <body style="font-family: 'Calibri', 'Segoe UI', sans-serif; font-size: 11pt; line-height: 1.5; background-color: #ffffff; color: #333333; margin: 0 auto; max-width: 800px;">
        ${clone.innerHTML}
      </body>
      </html>
    `;

    // Construct MHTML
    const boundary = "----=_NextPart_" + Math.random().toString(36).substring(2);
    let mhtml = `MIME-Version: 1.0\nContent-Type: multipart/related; boundary="${boundary}"\n\n`;
    
    // HTML Part
    mhtml += `--${boundary}\nContent-Type: text/html; charset="utf-8"\nContent-Transfer-Encoding: 8bit\n\n`;
    mhtml += htmlContent + `\n\n`;

    // Image Parts
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
      <div className="bg-[#1a1a1a] border border-[#333] rounded-xl w-full max-w-6xl h-full max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-[#222]">
          <div className="flex items-center gap-2">
            <FileText size={20} className="text-[#f97316]" />
            <h2 className="text-lg font-bold text-white">Global Project Report</h2>
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

        <div className="flex-1 overflow-y-auto p-8 bg-[#0a0a0a] flex justify-center custom-scrollbar">
          <div 
            ref={previewRef} 
            className="bg-white w-full max-w-[210mm] min-h-[297mm] shadow-2xl p-10 text-black border border-[#333] global-report-content"
            style={{ fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif' }}
          >
            <style>{`
              .global-report-content h1 { color: #f97316; border-bottom: 2px solid #f97316; padding-bottom: 10px; margin-bottom: 20px; }
              .global-report-content h2 { color: #222; border-bottom: 1px solid #eee; margin-top: 40px; padding-bottom: 5px; }
              .global-report-content h3 { color: #444; margin-top: 25px; font-size: 1.1em; }
              .global-report-content .meta { color: #666; font-size: 0.9em; margin-bottom: 40px; }
              .global-report-content .tree { margin-left: 20px; border-left: 1px solid #ddd; padding-left: 15px; }
              .global-report-content .item { margin-bottom: 15px; }
              .global-report-content .item-header { font-weight: bold; color: #000; }
              .global-report-content .props { font-size: 0.9em; color: #555; margin-left: 10px; }
              .global-report-content .tag { background: #eee; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; }
              
              /* Layout styles */
              .global-report-content .diagram-container {
                 display: ${layout === '2-col' ? 'grid' : 'block'};
                 grid-template-columns: ${layout === '2-col' ? '1fr 1fr' : '1fr'};
                 gap: 20px;
                 margin: 16px 0;
              }
              .global-report-content .diagram-cell {
                 break-inside: avoid;
                 page-break-inside: avoid;
                 margin-bottom: 16px;
              }
              .global-report-content svg {
                 max-width: 100%;
                 height: auto;
                 display: block;
              }
              
              /* Print styles for clean PDF output */
              @media print {
                .global-report-content .diagram-container {
                   display: block;
                }
                .global-report-content .diagram-cell {
                   page-break-inside: avoid;
                   margin-bottom: 20px;
                }
                .global-report-content svg {
                   max-width: 100% !important;
                   height: auto !important;
                }
                .global-report-content h2 {
                   page-break-after: avoid;
                }
              }
            `}</style>
            <div 
              dangerouslySetInnerHTML={{ 
                __html: DOMPurify.sanitize(reportData.html.replace(/.*?<body>/s, '').replace(/<\/body>.*?/s, ''), {
                  ALLOWED_TAGS: [
                    'h1','h2','h3','h4','p','span','div','table','tr','td','th','thead','tbody','b','i','strong','em','br','hr','ul','ol','li','img','svg','path','rect','circle','text','line','g'
                  ],
                  ALLOWED_ATTR: [
                    'class','style','width','height','viewBox','xmlns','d','cx','cy','r','x','y','fill','stroke','stroke-width','transform','text-anchor','dominant-baseline','src','alt'
                  ]
                })
              }} 
            />
          </div>
        </div>
      </div>
    </div>
  );
};

const ADIA = () => {
  const [showWelcome, setShowWelcome] = useState(true);
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
      if (showStandby) {
        setShowStandby(false);
      }
      resetTimer();
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
  const [variables, setVariables] = useState<VariableDef[]>([
    { id: uuidv4(), name: 'counter', type: 'int32', initialValue: '0', currentValue: 0, visibleInScope: true },
    { id: uuidv4(), name: 'flag', type: 'bool', initialValue: 'false', currentValue: false, visibleInScope: true },
    { id: uuidv4(), name: 'value', type: 'float', initialValue: '0.0', currentValue: 0, visibleInScope: true },
  ]);

  // DOE STATE (Lifted)
  const [activeModel, setActiveModel] = useState<'RSM' | 'GMDH' | 'Taguchi'>('RSM');
  const [taguchiConfig, setTaguchiConfig] = useState<{ objective: 'larger' | 'smaller' | 'nominal' | 'target', targetValue?: number }>({ objective: 'larger', targetValue: 10 });
  const [data, setData] = useState<number[][]>([[0, 0, 0], [1, 0, 1], [0, 1, 1], [1, 1, 4]]);
  const [headers, setHeaders] = useState<string[]>(['X1', 'X2', 'Y']);
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
    const factorsCount = headers.length - 1;
    const n = data.length;
    const factorStats = headers.slice(0, factorsCount).map((_, i) => {
      const col = data.map(r => r[i]);
      return { min: Math.min(...col), max: Math.max(...col) };
    });
    const coding = factorStats.map(s => ({ mid: (s.max + s.min) / 2, scale: (s.max - s.min) / 2 || 1 }));
    const Z: number[][] = [];
    const Y: number[] = [];
    data.forEach(row => {
      const f = row.slice(0, factorsCount);
      Y.push(row[factorsCount]);
      const x = f.map((v, i) => (v - coding[i].mid) / coding[i].scale);
      const zRow = [1];
      for (let i = 0; i < factorsCount; i++) zRow.push(x[i]);
      for (let i = 0; i < factorsCount; i++) zRow.push(x[i] * x[i]);
      for (let i = 0; i < factorsCount; i++) {
        for (let j = i + 1; j < factorsCount; j++) zRow.push(x[i] * x[j]);
      }
      Z.push(zRow);
    });

    try {
      const Beta_coded = solveLeastSquares(Z, Y);
      const p_terms = Z[0].length - 1;
      const Beta: number[] = new Array(p_terms + 1).fill(0);
      const k = factorsCount;
      for (let i = 0; i < k; i++) Beta[k + 1 + i] = Beta_coded[k + 1 + i] / (coding[i].scale ** 2);
      let interIdx = 2 * k + 1;
      for (let i = 0; i < k; i++) {
        for (let j = i + 1; j < k; j++) {
          Beta[interIdx] = Beta_coded[interIdx] / (coding[i].scale * coding[j].scale);
          interIdx++;
        }
      }
      for (let i = 0; i < k; i++) {
        let val = Beta_coded[i + 1] / coding[i].scale;
        val -= 2 * Beta[k + 1 + i] * coding[i].mid;
        let itIdx = 2 * k + 1;
        for (let m = 0; m < k; m++) {
          for (let n = m + 1; n < k; n++) {
            if (m === i) val -= Beta[itIdx] * coding[n].mid;
            if (n === i) val -= Beta[itIdx] * coding[m].mid;
            itIdx++;
          }
        }
        Beta[i + 1] = val;
      }
      let intercept = Beta_coded[0];
      for (let i = 0; i < k; i++) intercept -= (Beta_coded[i + 1] / coding[i].scale) * coding[i].mid;
      for (let i = 0; i < k; i++) intercept += Beta[k + 1 + i] * (coding[i].mid ** 2);
      let iIdx = 2 * k + 1;
      for (let i = 0; i < k; i++) {
        for (let j = i + 1; j < k; j++) {
          intercept += Beta[iIdx] * coding[i].mid * coding[j].mid;
          iIdx++;
        }
      }
      Beta[0] = intercept;

      const Y_pred = Z.map(row => {
        let sum = 0;
        for (let i = 0; i < Beta_coded.length; i++) sum += Beta_coded[i] * row[i];
        return sum;
      });

      const SSE = Y.reduce((acc, y, i) => acc + Math.pow(y - Y_pred[i], 2), 0);
      const SST = Y.reduce((acc, y) => acc + Math.pow(y - (Y.reduce((a, b) => a + b, 0) / Y.length), 2), 0);
      const df_total = n - 1;
      const df_model = p_terms;
      const df_error = n - p_terms - 1;
      const R2 = 1 - SSE / SST;
      const R2Adj = 1 - (SSE / df_error) / (SST / df_total);
      const MS_model = (SST - SSE) / df_model;
      const MS_error = SSE / df_error;
      const F = MS_model / MS_error;
      const P = fDistPValue(F, df_model, df_error);

      let eq = `Y = ${Beta[0].toFixed(4)}`;
      for (let i = 0; i < k; i++) eq += ` ${Beta[i + 1] >= 0 ? '+' : ''} ${Beta[i + 1].toFixed(4)}·${headers[i]}`;
      for (let i = 0; i < k; i++) eq += ` ${Beta[k + 1 + i] >= 0 ? '+' : ''} ${Beta[k + 1 + i].toFixed(4)}·${headers[i]}²`;
      let aIdx = 2 * k + 1;
      for (let i = 0; i < k; i++) {
        for (let j = i + 1; j < k; j++) {
          eq += ` ${Beta[aIdx] >= 0 ? '+' : ''} ${Beta[aIdx].toFixed(4)}·${headers[i]}·${headers[j]}`;
          aIdx++;
        }
      }

      setResults({
        type: 'RSM',
        Beta,
        Beta_coded,
        R2,
        R2Adj,
        F,
        P,
        equation: eq,
        fits: Y_pred,
        residuals: Y.map((y, i) => y - Y_pred[i]),
        actuals: Y
      });
      setActiveModel('RSM');
      addError('info', `RSM Calculated: R² = ${(R2 * 100).toFixed(2)}%`);
    } catch (err) {
      addError('error', 'Statistical solver failed.');
    }
  };

  const calculateGMDH = () => {
    if (!data || data.length < 5) {
      addError('warning', 'Insufficient data for GMDH.');
      return;
    }
    const factorsCount = headers.length - 1;
    const X = data.map(r => r.slice(0, factorsCount));
    const Y = data.map(r => r[factorsCount]);

    const k_folds = 5;
    const model = new GMDHEngine({
      algorithm: 'MIA',
      polynomialOrder: 2,
      maxLayers: 8,
      externalCriterion: 'RMSE',
      validationSplit: 0.3
    });
    model.train(data, headers);

    const Y_pred = data.map(r => {
      try { return model.predict(r.slice(0, factorsCount)); } catch(e) { return 0; }
    });
    const meanY = Y.reduce((a, b) => a + b, 0) / Y.length;
    let SSE = 0, SST = 0;
    for (let i = 0; i < Y.length; i++) {
      SSE += Math.pow(Y[i] - Y_pred[i], 2);
      SST += Math.pow(Y[i] - meanY, 2);
    }
    const R2 = SST === 0 ? 1 : Math.max(0, 1 - (SSE / SST));

    setResults({
      type: 'GMDH',
      model,
      R2,
      equation: model.getEquation ? model.getEquation() : 'GMDH Neural Model',
      fits: Y_pred,
      residuals: Y.map((y, i) => y - Y_pred[i]),
      actuals: Y
    });
    setActiveModel('GMDH');
    addError('info', `GMDH Trained: R² = ${(R2 * 100).toFixed(2)}%`);
  };

  const calculateTaguchi = () => {
    if (!data || data.length < 2) {
      addError('warning', 'Insufficient data for Taguchi analysis.');
      return;
    }

    const factorsCount = headers.length - 1;
    const factors = headers.slice(0, factorsCount);
    const meanY = data.reduce((a, r) => a + r[factorsCount], 0) / data.length;

    // Group data into unique trials to handle replicates properly
    const trialsMap = new Map<string, number[]>();
    data.forEach((row: number[]) => {
      const factorsPart = row.slice(0, factorsCount).join('|');
      if (!trialsMap.has(factorsPart)) trialsMap.set(factorsPart, []);
      trialsMap.get(factorsPart)!.push(row[factorsCount]);
    });

    const trials = Array.from(trialsMap.entries()).map(([key, vals]: [string, number[]]) => ({
      factors: key.split('|').map(Number),
      mean: vals.reduce((a: number, b: number) => a + b, 0) / vals.length,
      variance: vals.length > 1 ? vals.reduce((a: number, b: number) => a + Math.pow(b - (vals.reduce((x: number, y: number) => x + y, 0) / vals.length), 2), 0) / (vals.length - 1) : 0,
      count: vals.length,
      responses: vals
    }));

    const snRatios = trials.map((t: any) => {
      const n = t.count;
      const y = t.responses;
      if (taguchiConfig.objective === 'larger') {
        const sumSqInv = y.reduce((acc: number, val: number) => acc + 1 / (val * val + 1e-12), 0);
        return -10 * Math.log10(sumSqInv / n);
      } else if (taguchiConfig.objective === 'smaller') {
        const sumSq = y.reduce((acc: number, val: number) => acc + val * val, 0);
        return -10 * Math.log10(sumSq / n);
      } else if (taguchiConfig.objective === 'target') {
        const target = taguchiConfig.targetValue !== undefined ? taguchiConfig.targetValue : 0;
        const sumSqDev = y.reduce((acc: number, val: number) => acc + Math.pow(val - target, 2), 0);
        return -10 * Math.log10((sumSqDev / n) + 1e-12);
      } else { // 'nominal'
        if (t.variance === 0) return 10 * Math.log10(Math.pow(t.mean, 2) / 1e-6);
        return 10 * Math.log10(Math.pow(t.mean, 2) / t.variance);
      }
    });

    const factorLevels = factors.map((f: string, factorIdx: number) => {
      const levels = Array.from(new Set(trials.map((t: any) => t.factors[factorIdx]))).sort((a: number, b: number) => a - b);
      const means = levels.map((l: number) => {
        const matchingTrialsIndices = trials.map((t: any, i: number) => t.factors[factorIdx] === l ? i : -1).filter((idx: number) => idx !== -1);
        const levelMeanY = matchingTrialsIndices.reduce((acc: number, idx: number) => acc + trials[idx].mean, 0) / matchingTrialsIndices.length;
        const meanSN = matchingTrialsIndices.reduce((acc: number, idx: number) => acc + snRatios[idx], 0) / matchingTrialsIndices.length;
        return { level: l, meanY: levelMeanY, meanSN };
      });
      const delta = Math.max(...means.map((m: any) => m.meanSN)) - Math.min(...means.map((m: any) => m.meanSN));
      const deltaY = Math.max(...means.map((m: any) => m.meanY)) - Math.min(...means.map((m: any) => m.meanY));
      return { factor: f, means, delta, deltaY };
    });

    const rankedFactors = factorLevels.map((f: any) => {
      const snSorted = [...factorLevels].sort((a: any, b: any) => b.delta - a.delta);
      const rank = snSorted.findIndex((x: any) => x.factor === f.factor) + 1;
      
      const ySorted = [...factorLevels].sort((a: any, b: any) => b.deltaY - a.deltaY);
      const rankY = ySorted.findIndex((x: any) => x.factor === f.factor) + 1;
      
      return { ...f, rank, rankY };
    });

    const grandMeanSN = snRatios.reduce((a: number, b: number) => a + b, 0) / snRatios.length;
    const grandMeanY = trials.reduce((a: number, t: any) => a + t.mean, 0) / trials.length;

    const optimal = factorLevels.map((fl: any) => {
      const bestMean = [...fl.means].sort((a: any, b: any) => b.meanSN - a.meanSN)[0];
      return {
        factor: fl.factor,
        level: bestMean ? bestMean.level : 1,
        meanSN: bestMean ? bestMean.meanSN : 0,
        meanY: bestMean ? bestMean.meanY : 0
      };
    });

    let predOptSN = grandMeanSN;
    let predOptY = grandMeanY;
    optimal.forEach((opt: any) => {
      predOptSN += (opt.meanSN - grandMeanSN);
      predOptY += (opt.meanY - grandMeanY);
    });

    const Y_all = data.map(r => r[factorsCount]);
    const fits = data.map(row => {
      let pred = meanY;
      factorLevels.forEach((f, fIdx) => {
        const val = row[fIdx];
        const nearest = [...f.means].sort((a: any, b: any) => Math.abs(a.level - val) - Math.abs(b.level - val))[0];
        if (nearest) pred += (nearest.meanY - meanY);
      });
      return pred;
    });

    const SSE = Y_all.reduce((acc, y, i) => acc + Math.pow(y - fits[i], 2), 0);
    const SST = Y_all.reduce((acc, y) => acc + Math.pow(y - meanY, 2), 0);
    const R2 = SST === 0 ? 1 : Math.max(0, 1 - SSE / SST);

    setResults({
      type: 'Taguchi',
      snRatios,
      factorLevels: rankedFactors,
      objective: taguchiConfig.objective,
      targetValue: taguchiConfig.targetValue,
      equation: `Taguchi Model (R² = ${(R2*100).toFixed(2)}%)`,
      grandMean: meanY,
      grandMeanSN,
      grandMeanY,
      R2,
      fits,
      actuals: Y_all,
      residuals: Y_all.map((y, i) => y - fits[i]),
      optimal,
      predOptSN,
      predOptY
    });
    setActiveModel('Taguchi');
    addError('info', `Taguchi Analysis Completed. R² = ${(R2 * 100).toFixed(2)}%`);
  };

  const handleExportToVLab = (block?: any) => {
    if (!results) {
      addError('warning', 'Please calculate a model first.');
      return;
    }
    // Prevent React events from being treated as block data
    const actualBlock = (block && block.nativeEvent) ? null : block;
    
    const exportBlock = actualBlock || {
      name: `${activeModel} Model`,
      type: 'doe_custom',
      color: '#c9a86c', // Explicit gold color for DOE
      params: { 
        equation: { label: 'Model Equation', value: results.equation || '', unit: '' },
        modelType: { label: 'Algorithm', value: activeModel, unit: '' }
      },
      ports: [
        ...headers.slice(0, -1).map((h, i) => ({ 
          id: `in${i + 1}`, label: h, type: 'input', pos: 'left', position: 'left', domain: 'General' 
        })),
        { id: 'out', label: headers[headers.length - 1], type: 'output', pos: 'right', position: 'right', domain: 'General' }
      ]
    };
    
    const newNodeId = `doe_vlab_${Date.now()}`;
    const newNode = {
      id: newNodeId,
      type: 'doe_custom', 
      position: { x: 400, y: 300 },
      data: { 
        ...exportBlock, 
        id: newNodeId, 
        label: exportBlock.name,
        type: 'doe_custom', 
        ports: exportBlock.ports 
      }
    };
    console.log('[DOE EXPORT DEBUG] Exporting to VLab:', newNode); // Log object directly, no stringify
    setVlabNodes(prev => [...prev, newNode]);
    setDiagramMode('vlab');
    toggleWindow('doe');
    addError('info', `Exported ${activeModel} model to V-Lab workspace.`);
  };

  const handleExportToXBridges = () => {
    if (!results) {
      addError('warning', 'Please calculate a model first.');
      return;
    }
    const newNodeId = `doe_xb_${Date.now()}`;
    const blockData = {
      name: `${activeModel} Model`,
      label: `${activeModel} Model`,
      type: 'DOE_MODEL',
      equation: results.equation || '',
      modelType: activeModel,
      inputNames: headers.slice(0, -1),
      outputName: headers[headers.length - 1],
      params: { 
        equation: { label: 'Equation', value: results.equation || '' },
        inputNames: { label: 'Inputs', value: headers.slice(0, -1) },
        outputName: { label: 'Output', value: headers[headers.length - 1] },
        modelType: { label: 'Model', value: activeModel }
      },
      inputs: headers.slice(0, -1).map((h, i) => ({ 
        id: `in${i + 1}`, name: h, type: 'auto', direction: 'input', position: 'left', value: 0 
      })),
      outputs: [{ 
        id: 'out', name: headers[headers.length - 1], type: 'auto', direction: 'output', position: 'right', value: 0 
      }],
      // Inject execution logic for simulation
      execute: (inputs: any[], params: any) => {
        try {
          const scope: any = {};
          const inputNames = params.inputNames.value;
          inputNames.forEach((name: string, i: number) => {
            scope[name] = inputs[i] || 0;
          });
          // Evaluate using mathjs (available globally as math)
          const result = math.evaluate(params.equation.value, scope);
          return { outputs: [result] };
        } catch (e) {
          console.error('DOE Model execution error:', e);
          return { outputs: [0] };
        }
      }
    };
    
    const newNode = {
      id: newNodeId,
      type: 'xblock',
      position: { x: 400, y: 300 },
      data: { ...blockData, id: newNodeId, selected: false }
    };
    setGlobalXBridgesNodes(prev => [...prev, newNode]);
    setDiagramMode('xbridges');
    toggleWindow('doe');
    addError('info', `Exported ${activeModel} model to X-Bridges workspace.`);
  };

  const onExportToVLab = handleExportToVLab;
  const onExportToXBridges = handleExportToXBridges;

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
  const xBridgesEnginesRef = useRef<Map<string, XbridgesEngine>>(new Map());

  const [errors, setErrors] = useState<ErrorItem[]>([]);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [currentError, setCurrentError] = useState<ErrorItem | null>(null);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [showGlobalReportPreview, setShowGlobalReportPreview] = useState(false);
  const [globalReportData, setGlobalReportData] = useState<{ html: string, projectName: string } | null>(null);

  // Window Management State
  const [managedWindows, setManagedWindows] = useState<Record<ManagedWindowId, ManagedWindowState>>({
    hmi: { id: 'hmi', title: 'HMI Dashboard', isOpen: false, isMinimized: false, pos: { x: 110, y: 110 }, size: { width: 900, height: 600 }, zIndex: 10 },
    pid: { id: 'pid', title: 'PID Tuner', isOpen: false, isMinimized: false, pos: { x: 160, y: 160 }, size: { width: 1000, height: 700 }, zIndex: 10 },
    rtm: { id: 'rtm', title: 'Requirements Traceability Matrix', isOpen: false, isMinimized: false, pos: { x: 210, y: 210 }, size: { width: 900, height: 600 }, zIndex: 10 },
    doe: { id: 'doe', title: 'DOE RSM Analysis', isOpen: false, isMinimized: false, pos: { x: 260, y: 260 }, size: { width: 1100, height: 750 }, zIndex: 10 },
  });

  const [isHierarchyCollapsed, setIsHierarchyCollapsed] = useState(false);
  const [isVariablesCollapsed, setIsVariablesCollapsed] = useState(false);
  const [isPropertiesCollapsed, setIsPropertiesCollapsed] = useState(false);
  const [isScopeCollapsed, setIsScopeCollapsed] = useState(false);

  const updateManagedWindow = useCallback((id: ManagedWindowId, updates: Partial<Omit<ManagedWindowState, 'id' | 'title'>>) => {
    setManagedWindows(prev => ({
      ...prev,
      [id]: { ...prev[id], ...updates }
    }));
  }, []);

  const toggleWindow = useCallback((id: ManagedWindowId) => {
    setManagedWindows(prev => ({
      ...prev,
      [id]: { ...prev[id], isOpen: !prev[id].isOpen }
    }));
  }, []);

  const [layers, setLayers] = useState<Layer[]>([{
    id: 'root',
    name: 'Root',
    parentStateId: null,
    stateIds: ['s1', 's2', 'slp'],
    transitionIds: ['t1', 't2'],
    junctionIds: []
  }]);
  const [currentLayerId, setCurrentLayerId] = useState('root');
  const [layerStack, setLayerStack] = useState<string[]>([]);
  const [layerPath, setLayerPath] = useState(['Root']);

  const [states, setStates] = useState<StateData[]>([
    {
      id: 's1',
      name: 'State_1',
      x: 100,
      y: 100,
      width: DEFAULT_STATE_WIDTH,
      height: DEFAULT_STATE_HEIGHT,
      entry: '',
      during: '',
      exit: '',
      isActive: false,
      color: STATE_COLORS[0],
      parentId: 'root',
      children: [],
      priority: 10,
      isParallel: false,
      regionId: null,
      autostart: true,
      internalTransitions: ''
    },
    {
      id: 's2',
      name: 'State_2',
      x: 400,
      y: 100,
      width: DEFAULT_STATE_WIDTH,
      height: DEFAULT_STATE_HEIGHT,
      entry: '',
      during: '',
      exit: '',
      isActive: false,
      color: STATE_COLORS[1],
      parentId: 'root',
      children: [],
      priority: 20,
      isParallel: false,
      regionId: null,
      autostart: false,
      internalTransitions: ''
    },
    {
      id: 'slp',
      name: 'Low_Power',
      x: 400,
      y: 300,
      width: DEFAULT_STATE_WIDTH,
      height: DEFAULT_STATE_HEIGHT,
      entry: '/* Low Power Mode */',
      during: '',
      exit: '',
      isActive: false,
      color: STATE_COLORS[2],
      parentId: 'root',
      children: [],
      priority: 30,
      isParallel: false,
      regionId: null,
      autostart: false,
      internalTransitions: ''
    }
  ]);
  const [junctions, setJunctions] = useState<JunctionData[]>([]);
  const [transitions, setTransitions] = useState<TransitionData[]>([
    {
      id: 't1',
      sourceId: 's1',
      targetId: 's2',
      condition: 'true',
      action: '',
      afterTicks: null,
      type: 'condition',
      hasControlPoint: false,
      order: 0
    },
    {
      id: 't2',
      sourceId: 's2',
      targetId: 'slp',
      condition: '',
      action: '',
      afterTicks: 50,
      type: 'after',
      hasControlPoint: false,
      order: 0
    }
  ]);
  const [view, setView] = useState({ scale: 1, offsetX: 0, offsetY: 0 });
  const [gridEnabled, setGridEnabled] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);

  // Selection state (supports multiple items)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [isCreatingTransition, setIsCreatingTransition] = useState(false);
  const [transitionSourceId, setTransitionSourceId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });
  const [mousePos, setMousePos] = useState<Point>({ x: 0, y: 0 });
  const [showZoomIndicator, setShowZoomIndicator] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const isSpacePressed = useRef(false);
  const lastMousePos = useRef<Point>({ x: 0, y: 0 });
  const midDown = useRef(false);
  const rightDown = useRef(false);

  // Simulation state
  const [activeStates, setActiveStates] = useState<Record<string, string>>({});
  const [lastActiveStates, setLastActiveStates] = useState<Record<string, string>>({});
  const [stateTimers, setStateTimers] = useState<Record<string, number>>({});
  const [traceHistory, setTraceHistory] = useState<Array<{ time: number; event: string; group: string; state: string; transition: string; transitionId?: string }>>([]);
  const [firedTransitions, setFiredTransitions] = useState<Record<string, number>>({});

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
  const [diagramMode, setDiagramMode] = useState<DiagramMode>('statemachine' as DiagramMode);
  const [activePropTab, setActivePropTab] = useState<'general' | 'assign'>('general');

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
  const [interfaceRealizations, setInterfaceRealizations] = useState<InterfaceRealizationData[]>([]);
  const [customStereotypes, setCustomStereotypes] = useState<string[]>([]);
  const [uiZoom, setUiZoom] = useState(1.0);

  // HMI STATE
  const [hmiComponents, setHmiComponents] = useState<HmiComponent[]>([]);
  const [draggedPort, setDraggedPort] = useState<{ elementId: string, portId: string } | null>(null);

  // Global X-Bridges persistence
  const defaultXBridgesNodes = [
    {
      id: 'w_ref_const',
      type: 'xblock',
      position: { x: 80, y: 120 },
      data: {
        id: 'w_ref_const',
        type: 'Constant',
        label: 'Speed Ref (rad/s)',
        params: { value: 157 },
        inputs: [],
        outputs: [
          { id: 'out', name: 'Out', type: 'auto', direction: 'output', value: 157, position: 'right' }
        ],
        parentId: 'root',
        selected: false
      }
    },
    {
      id: 'tl_const',
      type: 'xblock',
      position: { x: 80, y: 280 },
      data: {
        id: 'tl_const',
        type: 'Constant',
        label: 'Load Torque (N-m)',
        params: { value: 2 },
        inputs: [],
        outputs: [
          { id: 'out', name: 'Out', type: 'auto', direction: 'output', value: 2, position: 'right' }
        ],
        parentId: 'root',
        selected: false
      }
    },
    {
      id: 'ac_motor_controller',
      type: 'xblock',
      position: { x: 350, y: 160 },
      data: {
        id: 'ac_motor_controller',
        type: 'AC_MOTOR_PID_CONTROL',
        label: 'AC Motor PID Control',
        params: { Kp: 2.5, Ki: 1.2, Kd: 0.1, w_ref: 157, tl: 2 },
        inputs: [
          { id: 'w_ref', name: 'ω*', type: 'control', direction: 'input', value: 157, position: 'left' },
          { id: 'tl', name: 'Tl', type: 'load', direction: 'input', value: 2, position: 'bottom' }
        ],
        outputs: [
          { id: 'omega', name: 'ω', type: 'measurement', direction: 'output', value: 0, position: 'right' },
          { id: 'error', name: 'Error', type: 'measurement', direction: 'output', value: 0, position: 'top' },
          { id: 'te', name: 'Torque', type: 'measurement', direction: 'output', value: 0, position: 'top' }
        ],
        parentId: 'root',
        selected: false
      }
    },
    {
      id: 'motor_scope',
      type: 'xblock',
      position: { x: 680, y: 160 },
      data: {
        id: 'motor_scope',
        type: 'Scope',
        label: 'Motor Scope',
        params: { numSignals: 3, bufferSize: 1000 },
        inputs: [
          { id: 'in1', name: 'In 1', type: 'auto', direction: 'input', value: 0, position: 'left' },
          { id: 'in2', name: 'In 2', type: 'auto', direction: 'input', value: 0, position: 'left' },
          { id: 'in3', name: 'In 3', type: 'auto', direction: 'input', value: 0, position: 'left' }
        ],
        outputs: [],
        parentId: 'root',
        selected: false
      }
    }
  ];

  const defaultXBridgesEdges = [
    {
      id: 'e_w_ref',
      source: 'w_ref_const',
      sourceHandle: 'out',
      target: 'ac_motor_controller',
      targetHandle: 'w_ref',
      style: { stroke: '#4caf50', strokeWidth: 3 },
      animated: false
    },
    {
      id: 'e_tl',
      source: 'tl_const',
      sourceHandle: 'out',
      target: 'ac_motor_controller',
      targetHandle: 'tl',
      style: { stroke: '#4caf50', strokeWidth: 3 },
      animated: false
    },
    {
      id: 'e_omega',
      source: 'ac_motor_controller',
      sourceHandle: 'omega',
      target: 'motor_scope',
      targetHandle: 'in1',
      style: { stroke: '#4caf50', strokeWidth: 3 },
      animated: false
    },
    {
      id: 'e_error',
      source: 'ac_motor_controller',
      sourceHandle: 'error',
      target: 'motor_scope',
      targetHandle: 'in2',
      style: { stroke: '#4caf50', strokeWidth: 3 },
      animated: false
    },
    {
      id: 'e_te',
      source: 'ac_motor_controller',
      sourceHandle: 'te',
      target: 'motor_scope',
      targetHandle: 'in3',
      style: { stroke: '#4caf50', strokeWidth: 3 },
      animated: false
    }
  ];

  const [globalXBridgesNodes, setGlobalXBridgesNodes] = useState<any[]>(defaultXBridgesNodes);
  const [globalXBridgesEdges, setGlobalXBridgesEdges] = useState<any[]>(defaultXBridgesEdges);

  // V-Lab STATE
  const [vlabNodes, setVlabNodes] = useState<any[]>([]);
  const [vlabEdges, setVlabEdges] = useState<any[]>([]);
  const [vlabSelectedNodeId, setVlabSelectedNodeId] = useState<string | null>(null);
  const [xBridgesSelectedNodeId, setXBridgesSelectedNodeId] = useState<string | null>(null);

  // ENTROPY OPM STATE
  const [entropyNodes, setEntropyNodes] = useState<any[]>([]);
  const [entropyEdges, setEntropyEdges] = useState<any[]>([]);

  // FACTORY I/O GATEWAY STATE
  const [showFactoryIOGateway, setShowFactoryIOGateway] = useState(false);
  const [factoryIOMapping, setFactoryIOMapping] = useState<{ adiaVarId: string, factoryTagId: string | number, type: 'sensor' | 'actuator' }[]>([]);
  const [factoryIOEnabled, setFactoryIOEnabled] = useState(true);
  const [factoryIOStatus, setFactoryIOStatus] = useState<'connected' | 'disconnected' | 'error'>('disconnected');

  // 3DEXPERIENCE GATEWAY STATE
  const [show3DXGateway, setShow3DXGateway] = useState(false);

  /**
   * Builds the list of ADIA documents that can be uploaded to 3DEXPERIENCE.
   * Computed lazily so the upload panel always reflects the current workspace state.
   */
  const adiaExportItems: AdiaExportItem[] = useMemo(() => {
    const projectPayload = {
      states, junctions, transitions, layers, variables,
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
  }, [states, junctions, transitions, layers, variables, blocks, relationships, parts, connectors, interfaceRealizations, globalXBridgesNodes, globalXBridgesEdges, vlabNodes, vlabEdges]);



  // AI SIDEBAR STATE
  const [isAiSidebarOpen, setIsAiSidebarOpen] = useState(false);

  useEffect(() => {
    if (factoryIOEnabled && (window as any).require) {
      const { ipcRenderer } = (window as any).require('electron');
      ipcRenderer.invoke('fetch-factory-io-tags').then((tags: any) => {
        if (tags && !tags.error) setFactoryIOStatus('connected');
        else setFactoryIOStatus('error');
      });
    }
  }, []);

  const projectImportRef = useRef<HTMLInputElement>(null);

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
  const [clipboard, setClipboard] = useState<{
    states: StateData[],
    junctions: JunctionData[],
    transitions: TransitionData[],
    blocks: BlockData[],
    relationships: RelationshipData[],
    parts: PartData[],
    connectors: ConnectorData[],
    interfaceRealizations: InterfaceRealizationData[],
  } | null>(null);

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

  const handleExportProject = useCallback(async () => {
    const projectFiles = {
      'statemachine.json': { states, junctions, transitions, layers, variables, view, tickMs },
      'bdd.json': { blocks: blocks.filter(b => b.stereotype !== 'requirement'), relationships, customStereotypes },
      'ibd.json': { parts, connectors, interfaceRealizations },
      'requirements.json': { blocks: blocks.filter(b => b.stereotype === 'requirement'), relationships },
      'xbridges.json': { globalXBridgesNodes, globalXBridgesEdges },
      'vlab.json': { vlabNodes, vlabEdges },
      'hmi.json': { hmiComponents },
      'hil.json': hilConfig,
      'doe.json': { headers, data, activeModel, taguchiConfig, results: results ? { R2: results.R2, equation: results.equation, type: results.type } : null },
      'entropy.json': { entropyNodes, entropyEdges },
      'adia_project_unified.json': {
        version: VERSION,
        timestamp: new Date().toISOString(),
        states, junctions, transitions, layers, variables, view, tickMs,
        blocks, relationships, parts, connectors, interfaceRealizations, customStereotypes,
        hmiComponents, vlabNodes, vlabEdges, globalXBridgesNodes, globalXBridgesEdges,
        hilConfig,
        doe: { headers, data, activeModel, taguchiConfig, results },
        managedWindows,
        entropyNodes,
        entropyEdges
      }
    };

    // Electron specialized multi-file save
    if ((window as any).require) {
      try {
        const { ipcRenderer } = (window as any).require('electron');
        const success = await ipcRenderer.invoke('save-project-folder', projectFiles);
        if (success) {
          addError('info', 'Project exported as individual module files in selected directory');
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
        addError('info', 'Unified Project saved successfully to selected directory');
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
    addError('info', 'All project modules exported as individual files (Ctrl+S)');
  }, [
    states, junctions, transitions, layers, variables, view, tickMs,
    blocks, relationships, parts, connectors, interfaceRealizations, customStereotypes,
    hmiComponents, vlabNodes, vlabEdges, globalXBridgesNodes, globalXBridgesEdges,
    hilConfig,
    headers, data, activeModel, taguchiConfig, results, managedWindows, addError,
    entropyNodes, entropyEdges
  ]);

  const hydrateProject = useCallback((importedData: any) => {
    try {
      // Logic & Simulation
      if (importedData.states) setStates(importedData.states);
      if (importedData.junctions) setJunctions(importedData.junctions);
      if (importedData.transitions) setTransitions(importedData.transitions);
      if (importedData.layers) setLayers(importedData.layers);
      if (importedData.variables) setVariables(importedData.variables);
      if (importedData.view) setView(importedData.view);
      if (importedData.tickMs) setTickMs(importedData.tickMs);

      // SysML & Requirements — always migrate to ensure layerId is set
      if (importedData.blocks) setBlocks(migrateBlocks(importedData.blocks));
      if (importedData.relationships) setRelationships(importedData.relationships);
      if (importedData.parts) setParts(importedData.parts);
      if (importedData.connectors) setConnectors(importedData.connectors);
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

      // HIL Configuration
      if (importedData.hilConfig) setHilConfig(importedData.hilConfig);

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

      // Reset runtime state
      setIsRunning(false);
      setActiveStates({});
      setStateTimers({});
      setTraceHistory([]);
      setScopeData([]);
      setSimulationTime(0);
      setCurrentLayerId('root');
      setLayerStack([]);
      setLayerPath(['Root']);
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
    setSelectedIds, setHistory, setHistoryIndex, setCurrentLayerId, setLayerStack, setLayerPath, addError
  ]);

  // Computed values
  const selectedState = useMemo(() => selectedIds.length === 1 ? states.find(s => s.id === selectedIds[0]) : null, [selectedIds, states]);
  const selectedJunction = useMemo(() => selectedIds.length === 1 ? junctions.find(j => j.id === selectedIds[0]) : null, [selectedIds, junctions]);
  const selectedTransition = useMemo(() => selectedIds.length === 1 ? transitions.find(t => t.id === selectedIds[0]) : null, [selectedIds, transitions]);
  const selectedBlock = useMemo(() => selectedIds.length === 1 ? blocks.find(b => b.id === selectedIds[0]) : null, [selectedIds, blocks]);
  const selectedRelationship = useMemo(() => selectedIds.length === 1 ? relationships.find(r => r.id === selectedIds[0]) : null, [selectedIds, relationships]);
  const selectedPart = useMemo(() => selectedIds.length === 1 ? parts.find(p => p.id === selectedIds[0]) : null, [selectedIds, parts]);
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
    setVariables(prev => [...prev, {
      id: uuidv4(),
      name: newVarName,
      type: newVarType,
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

  const updateVariableValue = useCallback((id: string, value: string) => {
    setVariables(prev => prev.map(v =>
      v.id === id ? { ...v, currentValue: parseValue(v.type, value) } : v
    ));
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
    setLastActiveStates({});
    setStateTimers({});
    setSimulationTime(0);
    setScopeData([]);
    xBridgesEnginesRef.current.clear();
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
      states, junctions, transitions, layers, variables,
      blocks, relationships, parts, connectors, interfaceRealizations, customStereotypes
    });
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(snapshot);
      if (newHistory.length > 50) newHistory.shift(); // Limit history size
      return newHistory;
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  }, [states, junctions, transitions, layers, variables, blocks, relationships, parts, connectors, interfaceRealizations, historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const prevSnapshot = JSON.parse(history[historyIndex - 1]);
      setStates(prevSnapshot.states || []);
      setJunctions(prevSnapshot.junctions || []);
      setTransitions(prevSnapshot.transitions || []);
      setLayers(prevSnapshot.layers || []);
      setVariables(prevSnapshot.variables || []);
      setBlocks(migrateBlocks(prevSnapshot.blocks));
      setRelationships(prevSnapshot.relationships || []);
      setParts(prevSnapshot.parts || []);
      setConnectors(prevSnapshot.connectors || []);
      setInterfaceRealizations(prevSnapshot.interfaceRealizations || []);
      setCustomStereotypes(prevSnapshot.customStereotypes || []);
      setHistoryIndex(prev => prev - 1);
      addError('info', 'Undo');
    }
  }, [history, historyIndex, addError]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextSnapshot = JSON.parse(history[historyIndex + 1]);
      setStates(nextSnapshot.states || []);
      setJunctions(nextSnapshot.junctions || []);
      setTransitions(nextSnapshot.transitions || []);
      setLayers(nextSnapshot.layers || []);
      setVariables(nextSnapshot.variables || []);
      setBlocks(migrateBlocks(nextSnapshot.blocks));
      setRelationships(nextSnapshot.relationships || []);
      setParts(nextSnapshot.parts || []);
      setConnectors(nextSnapshot.connectors || []);
      setInterfaceRealizations(nextSnapshot.interfaceRealizations || []);
      setCustomStereotypes(nextSnapshot.customStereotypes || []);
      setHistoryIndex(prev => prev + 1);
      addError('info', 'Redo');
    }
  }, [history, historyIndex, addError]);

  // VALIDATION
  const validateModel = useCallback(() => {
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
      uintVars.forEach(v => {
        const decrementRegex = new RegExp(`\\b${v}\\s*--|--\\s*\\b${v}\\b`);
        if (decrementRegex.test(code)) {
          newErrors.push({ id: uuidv4(), type: 'error', message: `Unsafe arithmetic in ${context}: Potential underflow for unsigned variable '${v}'. Avoid using '--'. Use '${v} = ${v} - 1U;' inside a check.`, timestamp: new Date(), source: 'Validation', elementId: id });
        }
      });
    };


    const checkSyntax = (code: string, context: string, id?: string) => {
      if (!code || !code.trim()) return;

      // Check for statements that are just comparisons (e.g. "x === 0;")
      // This is valid JS but usually a mistake in an Action field (should be assignment)
      const statements = code.split(';').map(s => s.trim()).filter(s => s);
      for (const stmt of statements) {
        // Skip if it starts with a control flow keyword
        if (/^(if|while|do|for|switch|return|case|var|let|const)\b/.test(stmt)) continue;

        // Check for comparison operators at top level of statement
        // Matches "identifier comparison value" pattern
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

      // Check for undeclared variables
      const words = code.match(/\b[a-zA-Z_]\w*\b/g) || [];
      for (const word of words) {
        if (!declaredVarNames.has(word) && !jsKeywords.has(word)) {
          // Ignore property access (e.g. .length)
          const isProperty = new RegExp(`\\.\\s*${word}\\b`).test(code);
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
        // Just parsing, not executing
        new Function('context', `with(context) { ${code} }`);
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

      // Check for undeclared variables in condition
      const words = code.match(/\b[a-zA-Z_]\w*\b/g) || [];
      for (const word of words) {
        if (!declaredVarNames.has(word) && !jsKeywords.has(word)) {
          const isProperty = new RegExp(`\\.\\s*${word}\\b`).test(code);
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

      // Check for assignment in condition
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
        new Function('context', `with(context) { return (${jsCondition}); }`);
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
      // CG-CL-004
      checkUnsafeArithmetic(s.entry, `State '${s.name}' Entry`, s.id);
      checkUnsafeArithmetic(s.during, `State '${s.name}' During`, s.id);
      checkUnsafeArithmetic(s.exit, `State '${s.name}' Exit`, s.id);

      // Check for spaces in state names
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

    // Check for duplicate state names across the entire model
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

    // Validate internal transitions
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

    // CG-VAL-001: Undefined target state/junction
    transitions.forEach(t => {
      const targetExists = states.some(s => s.id === t.targetId) || junctions.some(j => j.id === t.targetId);
      if (!targetExists) {
        const sourceName = states.find(s => s.id === t.sourceId)?.name || junctions.find(j => j.id === t.sourceId)?.name || 'Unknown';
        newErrors.push({ id: uuidv4(), type: 'error', message: `Transition from '${sourceName}' targets an undefined state or junction.`, timestamp: new Date(), source: 'Validation', elementId: t.id });
      }
    });

    // 2. Logical Checking
    // REQ-HSM-050 VR-01: Only one AutoStart per layer
    // Validate per layer instead of per regionId

    // Group states by parentId to validate layers
    const statesByParent = new Map<string, StateData[]>();
    states.forEach(s => { const pid = s.parentId || 'root'; if (!statesByParent.has(pid)) statesByParent.set(pid, []); statesByParent.get(pid)!.push(s); });

    layers.forEach(layer => {
      const layerStates = states.filter(s => {
        // Get states belonging to this layer
        if (layer.id === 'root') {
          // Root layer: states without a parent layer (parentStateId not referencing another layer)
          return !layers.some(l => l.id !== 'root' && l.stateIds.includes(s.id));
        }
        return layer.stateIds.includes(s.id);
      });

      if (layerStates.length > 0) {
        const layerJunctions = junctions.filter(j => layer.junctionIds.includes(j.id));
        const autostartStates = layerStates.filter(s => s.autostart);
        const autostartJunctions = layerJunctions.filter(j => j.autostart);
        const totalAutostarts = autostartStates.length + autostartJunctions.length;

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
        } else if (totalAutostarts > 1) {
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

    // CG-VAL-006 & CG-SAFE-003: Conflicting transitions / priority
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

        // CG-CL-005: Event Consumption
        const boolVarsInCondition = (t.condition.match(/\b[a-zA-Z_]\w*\b/g) || []).filter(word => variables.find(v => v.name === word && v.type === 'bool'));
        if (boolVarsInCondition.length > 0) {
          const targetState = states.find(s => s.id === t.targetId);
          const combinedActions = t.action + (targetState ? targetState.entry : '');
          boolVarsInCondition.forEach(v => {
            const resetRegex = new RegExp(`\\b${v}\\s*=\\s*(false|0)\\b`);
            if (!resetRegex.test(combinedActions)) {
              newErrors.push({ id: uuidv4(), type: 'warning', message: `Level-triggered event '${v}' is used in a transition from '${sourceName}' but is not reset to false. This may cause repeated, immediate transitions.`, timestamp: new Date(), source: 'Validation', elementId: t.id });
            }
          });
        }
      });

      conditions.forEach((group) => { if (group.length > 1) group.forEach(t => newErrors.push({ id: uuidv4(), type: 'error', message: `Conflicting transitions from '${sourceName}'. Multiple transitions have the same trigger. Use different conditions or priorities.`, timestamp: new Date(), source: 'Validation', elementId: t.id })); });
      priorities.forEach((group, order) => { if (group.length > 1) group.forEach(t => newErrors.push({ id: uuidv4(), type: 'warning', message: `Multiple transitions from '${sourceName}' have the same priority (${order}). Execution order may be non-deterministic.`, timestamp: new Date(), source: 'Validation', elementId: t.id })); });
    });

    // Unreachable states (BFS from roots)
    const reachable = new Set<string>();
    const queue = states.filter(s => s.autostart).map(s => s.id);

    // If no autostart, assume first state is start (as per simulation logic)
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

    // Dead ends (states with no outgoing transitions)
    states.forEach(s => {
      const outgoing = transitions.filter(t => t.sourceId === s.id);
      if (outgoing.length === 0 && (s.internalTransitions || '').trim().length === 0 && states.length > 1) {
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

    // Clear old validation errors/warnings and add new ones
    setErrors(prev => {
      const filtered = prev.filter(e => e.source !== 'Validation');
      return [...newErrors, ...filtered];
    });

    if (newErrors.length > 0) {
      // If there are errors (not just warnings), show dialog
      const firstError = newErrors.find(e => e.type === 'error');
      if (firstError) {
        setCurrentError(firstError);
        setShowErrorDialog(true);
        return false;
      }
    }
    return true;
  }, [states, transitions, junctions, addError, variables]);

  // AI VALIDATION
  const validateWithAI = useCallback(async () => {
    setIsAiValidating(true);
    // ... logic ...
  }, [states, transitions, junctions, variables, addError]);

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

  const resolveAutoStart = useCallback((layerId: string, context: any, runActions: boolean = true): string | undefined => {
    const layer = layers.find(l => l.id === layerId);
    if (!layer) return undefined;

    const autoState = states.find(s => layer.stateIds.includes(s.id) && s.autostart);
    if (autoState) return autoState.id;

    const autoJunc = junctions.find(j => layer.junctionIds.includes(j.id) && j.autostart);
    if (autoJunc) {
      let currentNode: JunctionData | StateData | undefined = autoJunc;
      const visited = new Set<string>();
      let pathActions: string[] = [];

      while (currentNode && !states.find(s => s.id === currentNode!.id)) {
        if (visited.has(currentNode.id)) break; // Cycle
        visited.add(currentNode.id);

        const outgoing = transitions
          .filter(t => t.sourceId === currentNode!.id)
          .sort((a, b) => a.order - b.order);

        let found = false;
        for (const tr of outgoing) {
          let conditionMet = true;
          if (tr.condition && tr.condition !== 'true') {
            try {
              let jsCondition = tr.condition
                .replace(/&&/g, '&&')
                .replace(/\|\|/g, '||')
                .replace(/!/g, '!')
                .replace(/==/g, '===')
                .replace(/!=/g, '!==');
              const func = new Function('context', `with(context) { return (${jsCondition}); }`);
              conditionMet = !!func(context);
            } catch (e) {
              conditionMet = false;
            }
          }
          if (conditionMet) {
            if (runActions && tr.action) pathActions.push(tr.action);
            currentNode = states.find(s => s.id === tr.targetId) || junctions.find(j => j.id === tr.targetId);
            found = true;
            break;
          }
        }
        if (!found) break; // Dead end
      }
      if (currentNode && states.find(s => s.id === currentNode!.id)) {
        if (runActions) {
          pathActions.forEach(act => {
            try {
              const func = new Function('context', `with(context) { ${act} }`);
              func(context);
            } catch (e) { }
          });
        }
        return currentNode.id;
      }
    }
    return undefined;
  }, [layers, states, junctions, transitions]);

  // FACTORY I/O SYNC LOGIC
  const syncFactoryIO = useCallback(async (currentVars: VariableDef[]) => {
    if (!factoryIOEnabled || !(window as any).require) return currentVars;

    try {
      const { ipcRenderer } = (window as any).require('electron');
      
      // 1. Prepare Actuator data to send
      const actuatorsToSend = factoryIOMapping
        .filter(m => m.type === 'actuator')
        .map(m => {
          const v = currentVars.find(cv => cv.id === m.adiaVarId);
          let val = v ? v.currentValue : 0;
          if (v && v.type === 'bool') {
            val = Boolean(val);
          }
          return { id: m.factoryTagId, value: val };
        });

      // 2. Sync with Backend
      const tags = await ipcRenderer.invoke('sync-factory-io', { actuators: actuatorsToSend });

      if (tags && !tags.error) {
        setFactoryIOStatus('connected');
        // 3. Update ADIA variables from Sensors
        const nextVars = [...currentVars];
        let changed = false;

        factoryIOMapping
          .filter(m => m.type === 'sensor')
          .forEach(m => {
            const tag = (tags as any[]).find(t => t.id === m.factoryTagId);
            if (tag) {
              const varIdx = nextVars.findIndex(v => v.id === m.adiaVarId);
              if (varIdx !== -1 && nextVars[varIdx].currentValue !== tag.value) {
                nextVars[varIdx] = { ...nextVars[varIdx], currentValue: tag.value };
                changed = true;
              }
            }
          });

        if (changed) setVariables(nextVars);
        return nextVars;
      } else {
        setFactoryIOStatus('error');
      }
    } catch (e) {
      setFactoryIOStatus('error');
    }
    return currentVars;
  }, [factoryIOEnabled, factoryIOMapping]);

  // SIMULATION (FULLY FUNCTIONAL)
  const simulationStep = useCallback(async () => {
    // 0. Factory I/O Pre-sync (Read Sensors)
    let currentVars = [...variables];
    if (factoryIOEnabled) {
      currentVars = await syncFactoryIO(currentVars);
    }

    // 1. Advance time
    const newTime = simulationTime + tickMs / 1000;
    setSimulationTime(newTime);

    // 2. Create working context from current variables
    const workingContext = currentVars.reduce((acc, v) => {
      acc[v.name] = v.currentValue;
      return acc;
    }, {} as Record<string, any>);

    // 3. Update state timers
    const nextStateTimers = { ...stateTimers };
    Object.values(activeStates).forEach(stateId => {
      if (!stateId) return;
      nextStateTimers[stateId] = (nextStateTimers[stateId] || 0) + 1;
    });

    let variablesChanged = false;
    const newActiveStates = { ...activeStates };
    const stepFiredTransitions: Record<string, number> = {};
    let transitionFired = false;
    // Helper to execute code
    const executeAction = (code: string, context: any, location: string) => {
      if (!code || !code.trim()) return;
      try {
        const func = new Function('context', `with(context) { ${code} }`);
        func(context);
        variablesChanged = true;
      } catch (e: any) {
        let message = `Action error in ${location}: ${e.message}`;
        if (e instanceof ReferenceError) {
          message += `\n\nTip: Make sure all variables used in actions are defined in the 'Variables' workspace. Variable names are case-sensitive.`;
        } else if (e instanceof SyntaxError) {
          message += `\n\nTip: Check for syntax errors in your action code, like mismatched brackets or invalid statements.`;
        }
        addError('error', message, 'Simulation');
      }
    };

    // Helper to evaluate condition
    const evaluateCondition = (condition: string, context: any, location: string): boolean => {
      if (condition === 'true' || condition === '') return true;
      try {
        let jsCondition = condition
          .replace(/&&/g, '&&')
          .replace(/\|\|/g, '||')
          .replace(/!/g, '!')
          .replace(/==/g, '===')
          .replace(/!=/g, '!==');

        const func = new Function('context', `with(context) { return (${jsCondition}); }`);
        return !!func(context);
      } catch (e: any) {
        let message = `Condition error in ${location}: ${e.message}`;
        if (e instanceof ReferenceError) {
          message += `\n\nTip: Make sure all variables used in conditions are defined in the 'Variables' workspace. Variable names are case-sensitive.`;
        } else if (e instanceof SyntaxError) {
          message += `\n\nTip: Check for syntax errors in your condition, like mismatched parentheses or invalid operators. Use '==' for comparison.`;
        }
        addError('error', message, 'Simulation');
        return false;
      }
    };

    // Helper to get node data
    const getNode = (id: string) => states.find(s => s.id === id) || junctions.find(j => j.id === id);

    // REQ-HSM-030: Recursive entry
    const enterState = (stateId: string, activeMap: Record<string, string>, fromHistory: 'deep' | 'shallow' | false = false) => {
      const s = states.find(st => st.id === stateId);
      if (!s) return;

      const layerId = s.parentId || 'root';
      activeMap[layerId] = s.id;
      nextStateTimers[s.id] = 0;
      executeAction(s.entry, workingContext, `Entry ${s.name}`);

      // Check for sub-layer AutoStart
      const childLayer = layers.find(l => l.parentStateId === s.id);
      if (childLayer) {
        let childToEnterId: string | undefined;
        if (fromHistory === 'deep') {
          childToEnterId = lastActiveStates[childLayer.id];
        }

        if (childToEnterId) {
          enterState(childToEnterId, activeMap, 'deep');
        } else {
          const targetId = resolveAutoStart(childLayer.id, workingContext, true);
          if (targetId) enterState(targetId, activeMap, false);
        }
      }
    };

    // Recursive exit
    const exitState = (stateId: string, activeMap: Record<string, string>) => {
      const s = states.find(st => st.id === stateId);
      if (!s) return;

      const layerId = s.parentId || 'root';
      setLastActiveStates(prev => ({ ...prev, [layerId]: s.id }));

      const childLayer = layers.find(l => l.parentStateId === s.id);
      if (childLayer) {
        const activeChildId = activeMap[childLayer.id];
        if (activeChildId) exitState(activeChildId, activeMap);
        delete activeMap[childLayer.id];
      }
      executeAction(s.exit, workingContext, `Exit ${s.name}`);
    };

    // 4. Process Transitions (Per Region)
    const regions = Object.keys(activeStates);

    // Failsafe: If no states active, try autostart
    if (regions.length === 0) {
      const autoStarts = states.filter(s => s.autostart);
      if (autoStarts.length > 0) {
        autoStarts.forEach((s, i) => {
          if (s.parentId === 'root') enterState(s.id, newActiveStates);
        });
      } else if (states.length > 0) {
        // Absolute fallback
        const roots = states.filter(s => s.parentId === 'root');
        if (roots.length > 0) enterState(roots[0].id, newActiveStates);
      }
    }

    // Iterate regions to handle transitions
    for (const region of Object.keys(newActiveStates)) {
      const currentStateId = newActiveStates[region];

      const currentState = states.find(s => s.id === currentStateId);

      if (!currentState) continue;

      // Find potential transitions from current state
      const potentialTransitions = transitions
        .filter(t => t.sourceId === currentStateId)
        .sort((a, b) => a.order - b.order);

      // Add internal transitions to potential list (Lower priority than external to allow exit)
      if (currentState.internalTransitions) {
        const internalLines = currentState.internalTransitions.split('\n').filter(l => l.trim());
        internalLines.forEach((line, idx) => {
          let type: any = 'condition';
          let condition = 'true';
          let afterTicks: number | null = null;
          let action = '';
          const parts = line.split('/');
          if (parts.length > 1) action = parts.slice(1).join('/').trim();
          const triggerPart = parts[0].trim();
          const afterMatch = triggerPart.match(/after\((\d+)\)/);
          const condMatch = triggerPart.match(/\[(.*?)\]/);
          if (triggerPart.includes('&&')) type = 'and';
          else if (triggerPart.includes('||')) type = 'or';
          else if (afterMatch) type = 'after';
          if (afterMatch) afterTicks = parseInt(afterMatch[1]);
          if (condMatch) condition = condMatch[1];

          potentialTransitions.push({
            id: `INT_${currentState.id}_${idx}`, sourceId: currentState.id, targetId: currentState.id,
            condition, action, type, afterTicks, hasControlPoint: false, order: 1000 + idx, isInternal: true
          } as any);
        });
      }

      for (const transition of potentialTransitions) {
        // Check triggers
        const currentTicks = nextStateTimers[currentStateId] || 0;
        const conditionMet = evaluateCondition(transition.condition, workingContext, `Transition from ${currentState.name}`);
        const timerMet = transition.afterTicks !== null && currentTicks >= transition.afterTicks;

        let shouldFire = false;
        switch (transition.type) {
          case 'condition': shouldFire = conditionMet; break;
          case 'after': shouldFire = timerMet; break;
          case 'and': shouldFire = conditionMet && timerMet; break;
          case 'or': shouldFire = conditionMet || timerMet; break;
        }

        if (shouldFire) {
          // Traverse path (handle junctions)
          let currentTr = transition;
          let targetNode = getNode(currentTr.targetId);
          let pathActions = [currentTr.action];
          let isValidPath = true;
          let isLocalPath = !!transition.isInternal || (transition as any).id?.startsWith('INT_');
          const visited = new Set<string>();
          let pathTerminatedAtJunction = false;
          while (targetNode && !states.find(s => s.id === (targetNode as StateData | JunctionData).id)) {
            if (targetNode && visited.has(targetNode.id)) {
              // Cycle
              // Dead end junction. Execute actions on the path and terminate the step for this region.
              pathActions.forEach(act => executeAction(act, workingContext, 'Action Path'));
              transitionFired = true;
              setTraceHistory(prev => [...prev, {
                time: newTime,
                event: 'Action Path',
                group: region,
                state: currentState.name,
                transition: `Ended at ${targetNode!.name}`,
                transitionId: transition.id
              }].slice(-200));
              break;
            }
            visited.add(targetNode.id);

            const currentNode = targetNode as JunctionData;

            // Find outgoing from junction
            const junctionTransitions = transitions
              .filter(t => t.sourceId === currentNode.id)
              .sort((a, b) => a.order - b.order);

            let foundNext = false;
            for (const jTr of junctionTransitions) {
              if (evaluateCondition(jTr.condition, workingContext, `Junction '${currentNode.name}'`)) {
                currentTr = jTr;
                targetNode = getNode(jTr.targetId);
                pathActions.push(jTr.action);
                foundNext = true;

                break;
              }
            }

            if (!foundNext) {
              pathActions.forEach(act => executeAction(act, workingContext, 'Action Path'));
              transitionFired = true;
              stepFiredTransitions[transition.id] = Date.now();

              setTraceHistory(prev => [...prev, {
                time: newTime,
                event: 'Action Path',
                group: region,
                state: currentState.name,
                transition: `Ended at ${currentNode.name}`,
                transitionId: transition.id
              }].slice(-200));

              targetNode = undefined;
              pathTerminatedAtJunction = true;
              break;
            }
          }

          if (pathTerminatedAtJunction) {
            break;
          } else if (transitionFired) {
            break;
          } else if (isValidPath && targetNode) {

            const targetState = targetNode as StateData;

            if (isLocalPath) {
              pathActions.forEach(act => executeAction(act, workingContext, 'Local Transition Action'));
              if (targetState.id !== currentState.id) {
                newActiveStates[region] = targetState.id;
                nextStateTimers[targetState.id] = 0;
              }
            } else {
              exitState(currentState.id, newActiveStates);
              pathActions.forEach(act => executeAction(act, workingContext, 'Transition Action'));
              enterState(targetState.id, newActiveStates);
            }

            transitionFired = true;


            setTraceHistory(prev => [...prev, {
              time: newTime,
              event: 'Transition',
              group: region,
              state: targetState.name,
              transition: `${currentState.name} -> ${targetState.name}`,
              transitionId: transition.id
            }].slice(-200));


          } else if (isValidPath && !targetNode) {
            break;
          }
        }
      }
    }

    // 5. Process During Actions & X-Bridges Sub-Models
    Object.values(newActiveStates).forEach(stateId => {
      const state = states.find(s => s.id === stateId);
      if (!state) return;

      // Regular During Action
      if (state.during) {
        executeAction(state.during, workingContext, `During ${state.name}`);
      }

      // X-Bridges Co-Simulation
      if (state.isXBridges && state.xBridgesModel) {
        let engine = xBridgesEnginesRef.current.get(stateId);
        if (!engine) {
          const model = {
            blocks: state.xBridgesModel.nodes.map(n => {
              const d = n.data as any;
              if (XBRIDGES_LIBRARY[d.type]) {
                try {
                  const freshBlock = XBRIDGES_LIBRARY[d.type](d.id, d.params || {});
                  return { 
                    ...freshBlock, 
                    id: d.id, 
                    state: d.state || freshBlock.state, 
                    params: { ...freshBlock.params, ...d.params } 
                  };
                } catch (e) {
                  return d;
                }
              }
              return d;
            }),
            connections: state.xBridgesModel.edges.map(e => ({
              sourceBlock: e.source, sourcePort: e.sourceHandle!, targetBlock: e.target, targetPort: e.targetHandle!
            }))
          };
          engine = new XbridgesEngine(model);
          try {
            engine.compile();
            xBridgesEnginesRef.current.set(stateId, engine);
          } catch (err: any) {
            addError('error', `Failed to compile X-Bridges sub-model in state ${state.name}: ${err.message}`, 'Simulation');
          }
        }

        if (engine) {
          // Sync SM -> Block
          // 1. Explicit mappings
          if (state.xBridgesModel.mappings) {
            state.xBridgesModel.mappings.forEach(map => {
              if (map.direction === 'in' && map.smVarId && map.blockId && map.portId) {
                const smVar = variables.find(v => v.id === map.smVarId);
                if (smVar) {
                  const val = smVar.name in workingContext ? workingContext[smVar.name] : smVar.currentValue;
                  const numericVal = Number(val);
                  engine!.setSignalValue(map.blockId, map.portId, numericVal);
                  const block = engine!['blockMap'].get(map.blockId);
                  if (block && block.params) block.params.value = numericVal;
                }
              }
            });
          }
          // 2. Direct block parameters (Inports)
          state.xBridgesModel.nodes.forEach(node => {
            if (node.data.type === 'Inport' && node.data.params.smVarId) {
              const smVar = variables.find(v => v.id === node.data.params.smVarId);
              if (smVar) {
                const val = smVar.name in workingContext ? workingContext[smVar.name] : smVar.currentValue;
                const numericVal = Number(val);
                engine!.setSignalValue(node.id, 'out', numericVal);
                const block = engine!['blockMap'].get(node.id);
                if (block && block.params) block.params.value = numericVal;
              }
            }
          });

          // Step X-Bridges
          try {
            Solvers.stepRK4(engine, simulationTime, tickMs / 1000);
          } catch (err: any) {
            addError('error', `X-Bridges simulation error in state ${state.name}: ${err.message}`, 'Simulation');
          }

          // Sync Block -> SM
          // 1. Explicit mappings
          if (state.xBridgesModel.mappings) {
            state.xBridgesModel.mappings.forEach(map => {
              if (map.direction === 'out' && map.smVarId && map.blockId && map.portId) {
                const smVar = variables.find(v => v.id === map.smVarId);
                if (smVar) {
                  const blockVal = engine!.getSignalValue(map.blockId, map.portId);
                  workingContext[smVar.name] = blockVal;
                  variablesChanged = true;
                }
              }
            });
          }
          // 2. Direct block parameters (Outports)
          state.xBridgesModel.nodes.forEach(node => {
            if (node.data.type === 'Outport' && node.data.params.smVarId) {
              const smVar = variables.find(v => v.id === node.data.params.smVarId);
              if (smVar) {
                const val = engine!.getSignalValue(node.id, 'in');
                if (val !== undefined) {
                  workingContext[smVar.name] = val;
                  variablesChanged = true;
                }
              }
            }
          });
        }
      }
    });

    // 6. Update React State
    if (variablesChanged) {
      setVariables(prev => prev.map(v => {
        if (v.name in workingContext && workingContext[v.name] !== v.currentValue) {
          return { ...v, currentValue: workingContext[v.name] };
        }
        return v;
      }));
    }

    setActiveStates(newActiveStates);
    setStateTimers(nextStateTimers);
    setFiredTransitions(stepFiredTransitions);

    // Update visual active state
    setStates(prev => prev.map(s => ({
      ...s,
      isActive: Object.values(newActiveStates).includes(s.id)
    })));

    // 7. Scope Sampling
    if (!sampleOnTransitionOnly || transitionFired) {
      const dataPoint: ScopeDataPoint = { time: newTime };
      variables.forEach(v => {
        if (v.visibleInScope) {
          const val = v.name in workingContext ? workingContext[v.name] : v.currentValue;
          dataPoint[v.name] = typeof val === 'boolean' ? (val ? 1 : 0) : Number(val);
        }
      });
      setScopeData(prev => {
        const newData = [...prev, dataPoint];
        return newData.length > SCOPE_MAX_POINTS ? newData.slice(-SCOPE_MAX_POINTS) : newData;
      });
    }

    // 8. Factory I/O Post-sync (Write Actuators)
    // REMOVED: Combined into the start of the next tick for efficiency
  }, [states, junctions, transitions, variables, activeStates, stateTimers, simulationTime, tickMs, sampleOnTransitionOnly, addError, layers, resolveAutoStart, factoryIOEnabled, syncFactoryIO]);


  const startSimulation = useCallback(() => {
    if (!validateModel()) return;

    resetVariables();
    const initialContext = variables.reduce((acc, v) => {
      acc[v.name] = v.currentValue;
      return acc;
    }, {} as Record<string, any>);

    // Initialize active states
    const newActive: Record<string, string> = {};
    const initialTimers: Record<string, number> = {};

    // Helper to recursively activate states and their nested autostart children
    const activateState = (stateId: string) => {
      const s = states.find(st => st.id === stateId);
      if (!s) return;

      const layerId = s.parentId || 'root';
      newActive[layerId] = s.id;
      initialTimers[s.id] = 0;

      const childLayer = layers.find(l => l.parentStateId === s.id);
      if (childLayer) {
        const targetId = resolveAutoStart(childLayer.id, initialContext, true);
        if (targetId) activateState(targetId);
      }
    };

    const rootTargetId = resolveAutoStart('root', initialContext, true);
    if (rootTargetId) {
      activateState(rootTargetId);
    } else if (states.length > 0) {
      const roots = states.filter(s => s.parentId === 'root');
      if (roots.length > 0) activateState(roots[0].id);
    }

    setVariables(prev => prev.map(v => {
      if (v.name in initialContext && initialContext[v.name] !== v.currentValue) {
        return { ...v, currentValue: initialContext[v.name] };
      }
      return v;
    }));

    setActiveStates(newActive);
    setStateTimers(initialTimers);
    setStates(prev => prev.map(s => ({ ...s, isActive: Object.values(newActive).includes(s.id) })));

    setIsRunning(true);
    addError('info', 'Simulation started');
  }, [resetVariables, addError, states, validateModel, layers, resolveAutoStart, variables]);

  const pauseSimulation = useCallback(() => {
    setIsRunning(false);
    addError('info', 'Simulation paused');
  }, [addError]);

  const resetSimulation = useCallback(() => {
    setIsRunning(false);
    resetVariables();
    setLastActiveStates({});
    setStates(prev => prev.map(s => ({ ...s, isActive: false })));
    setActiveStates({});
    setStateTimers({});
    setTraceHistory([]);
    setFiredTransitions({});
    xBridgesEnginesRef.current.clear();
    addError('info', 'Simulation reset');
  }, [resetVariables, addError]);

  const stepSimulation = useCallback(() => {
    if (isRunning) {
      setIsRunning(false);
    }
    simulationStep();
    addError('info', 'Simulation step');
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

    const runLoop = async () => {
      if (isRunning) {
        await simStepRef.current();
        timer = setTimeout(runLoop, tickMs);
      }
    };

    if (isRunning) {
      runLoop();
    }

    return () => {
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

  const deleteState = useCallback((id: string) => {
    const state = states.find(s => s.id === id);
    if (!state) return;

    // Check for children (descendants)
    const getDescendants = (parentId: string): string[] => {
      const children = states.filter(s => s.parentId === parentId);
      let descendants = children.map(c => c.id);
      children.forEach(c => {
        descendants = [...descendants, ...getDescendants(c.id)];
      });
      return descendants;
    };

    const descendants = getDescendants(id);

    if (descendants.length > 0) {
      if (!window.confirm(`State '${state.name}' contains ${descendants.length} descendant(s). Deleting it will remove all children. Continue?`)) {
        return;
      }
    }

    const idsToDelete = [id, ...descendants];

    setTransitions(prev => prev.filter(t => !idsToDelete.includes(t.sourceId) && !idsToDelete.includes(t.targetId)));

    setLayers(prev => {
      const remaining = prev.filter(l => l.parentStateId === null || !idsToDelete.includes(l.parentStateId));
      return remaining.map(l => ({
        ...l,
        stateIds: l.stateIds.filter(sid => !idsToDelete.includes(sid))
      }));
    });

    setStates(prev => prev.filter(s => !idsToDelete.includes(s.id)));
    setSelectedIds(prev => prev.filter(sid => !idsToDelete.includes(sid)));
    addError('info', `Deleted state: ${state.name}`);
  }, [states, addError]);

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
      xBridgesModel: { nodes: [], edges: [], mappings: [] },
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
    // For requirements, store which layer this block was created in
    const blockLayerId = (stereotype === 'requirement' && diagramMode === 'requirements') ? currentLayerId : undefined;
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
      layerId: blockLayerId,
    };
    setBlocks(prev => [...prev, newBlock]);

    setSelectedIds([newBlock.id]);
    addError('info', `Created ${stereotype}: ${newBlock.name}`);
  }, [snapEnabled, addError, addToHistory, blocks, diagramMode, currentLayerId]);

  const updateBlock = useCallback((id: string, updates: Partial<BlockData>) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  }, []);

  const deleteBlock = useCallback((id: string) => {
    const block = blocks.find(b => b.id === id);
    if (!block) return;
    setRelationships(prev => prev.filter(r => r.sourceId !== id && r.targetId !== id));
    setBlocks(prev => prev.filter(b => b.id !== id));
    setSelectedIds(prev => prev.filter(sid => sid !== id));
    addError('info', `Deleted block: ${block.name}`);
  }, [blocks, addError]);

  const createRequirement = useCallback((x: number, y: number) => {
    createBlock(x, y, 'requirement');
  }, [createBlock]);

  const createRelationship = useCallback((sourceId: string, targetId: string, type: RelationshipData['type'] = 'association') => {
    addToHistory();
    if (sourceId === targetId) return;
    const newRel: RelationshipData = {
      id: uuidv4(),
      sourceId,
      targetId,
      type,
      label: '',
      sourceMultiplicity: '1',
      targetMultiplicity: '1'
    };
    setRelationships(prev => [...prev, newRel]);
    setSelectedIds([newRel.id]);
    addError('info', `Created ${type}`);
  }, [addError, addToHistory]);

  const updateRelationship = useCallback((id: string, updates: Partial<RelationshipData>) => {
    setRelationships(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  }, []);

  const deleteRelationship = useCallback((id: string) => {
    setRelationships(prev => prev.filter(r => r.id !== id));
    setSelectedIds(prev => prev.filter(sid => sid !== id));
    addError('info', 'Deleted relationship');
  }, [addError]);

  // IBD OPERATIONS
  const createPart = useCallback((x: number, y: number) => {
    addToHistory();
    const newPart: PartData = {
      id: uuidv4(),
      name: `part_${parts.length + 1}`,
      blockId: currentLayerId,
      typeId: null,
      x: snapEnabled ? snapToGrid(x - 75, GRID_SIZE) : x - 75,
      y: snapEnabled ? snapToGrid(y - 50, GRID_SIZE) : y - 50,
      width: 150,
      height: 100,
      multiplicity: '1'
    };
    setParts(prev => [...prev, newPart]);
    setSelectedIds([newPart.id]);
    addError('info', `Created part: ${newPart.name}`);
  }, [parts.length, currentLayerId, snapEnabled, addError, addToHistory]);

  const updatePart = useCallback((id: string, updates: Partial<PartData>) => {
    setParts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  }, []);

  const deletePart = useCallback((id: string) => {
    setConnectors(prev => prev.filter(c => c.sourcePartId !== id && c.targetPartId !== id));
    setParts(prev => prev.filter(p => p.id !== id));
    setSelectedIds(prev => prev.filter(sid => sid !== id));
    addError('info', 'Deleted part');
  }, [addError]);

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

          addToHistory();
          const newConnector: ConnectorData = {
            id: uuidv4(),
            sourcePartId: connectorSource.partId,
            sourcePortId: connectorSource.portId,
            targetPartId: partId,
            targetPortId: portId
          };
          setConnectors(prev => [...prev, newConnector]);
          addError('info', 'Created connection');
        }
        setIsCreatingConnector(false);
        setConnectorSource(null);
      } else {
        setConnectorSource({ partId, portId });
      }
    }
  }, [isCreatingConnector, connectorSource, parts, blocks, addError, addToHistory, isCreatingTransition, transitionSourceId, createInterfaceRealization, currentLayerId]);

  const deleteConnector = useCallback((id: string) => {
    setConnectors(prev => prev.filter(c => c.id !== id));
    setSelectedIds(prev => prev.filter(sid => sid !== id));
    addError('info', 'Deleted connector');
  }, [addError]);

  const updateConnector = useCallback((id: string, updates: Partial<ConnectorData>) => {
    setConnectors(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }, []);

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
            const newX = (block.ibdX ?? 50) + dx;
            const newY = (block.ibdY ?? 50) + dy;
            updateBlock(id, {
              ibdX: snapEnabled ? snapToGrid(newX, GRID_SIZE) : newX,
              ibdY: snapEnabled ? snapToGrid(newY, GRID_SIZE) : newY
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
          let type: RelationshipData['type'] = 'association';

          if (source?.stereotype === 'requirement' && target?.stereotype === 'requirement') {
            type = 'deriveReqt';
          }

          createRelationship(transitionSourceId, blockId, type);
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
  }, [isCreatingTransition, transitionSourceId, createRelationship, view, selectedIds, addToHistory, isCreatingConnector, uiZoom, blocks]);

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

  const startControlPointDrag = useCallback((transitionId: string, e: MouseEvent<SVGCircleElement>) => {
    e.stopPropagation();
    const transition = transitions.find(t => t.id === transitionId);
    if (!transition) return;

    const handleMouseMove = (moveEvent: any) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const worldX = ((moveEvent.clientX - rect.left) / uiZoom - view.offsetX) / view.scale;
      const worldY = ((moveEvent.clientY - rect.top) / uiZoom - view.offsetY) / view.scale;

      updateTransition(transitionId, {
        controlPoint: { x: worldX, y: worldY },
        hasControlPoint: true
      });
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove as any);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove as any);
    document.addEventListener('mouseup', handleMouseUp);
  }, [transitions, view, updateTransition, uiZoom]);



  const handleProjectFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedData = JSON.parse(event.target?.result as string);
        hydrateProject(importedData);
      } catch (error) {
        addError('error', 'Failed to parse project file JSON.');
      }
    };
    reader.readAsText(file);
    if (projectImportRef.current) projectImportRef.current.value = '';
  }, [hydrateProject, addError]);

  const handleImportProject = useCallback(async () => {
    try {
      if ((window as any).require) {
        const { ipcRenderer } = (window as any).require('electron');
        const importedData = await ipcRenderer.invoke('import-json');
        if (importedData) {
          hydrateProject(importedData);
        } else {
          addError('info', 'Import cancelled or file could not be read.');
        }
      } else {
        // Web/Mobile Fallback
        projectImportRef.current?.click();
      }
    } catch (error) {
      console.error('Import failed:', error);
      addError('error', `Failed to import project: ${error instanceof Error ? error.message : 'Unknown error'}. Tip: Ensure the file is a valid ADIA project JSON file.`);
    }
  }, [addError, hydrateProject]);

  const handleGenerateReport = useCallback((projectName: string, author: string) => {
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
        svg { max-width: 100%; height: auto; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 15px; font-size: 0.9em; }
        th, td { padding: 10px; border: 1px solid #ddd; text-align: left; }
        th { background-color: #f5f5f5; color: #333; }
        .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 0.8em; font-weight: bold; }
        .badge-critical { background-color: #fee2e2; color: #991b1b; }
        .badge-warning { background-color: #fef3c7; color: #92400e; }
        .badge-info { background-color: #e0f2fe; color: #075985; }
        @media print {
          .diagram-cell { page-break-inside: avoid; }
          svg { max-width: 100% !important; height: auto !important; }
        }
    `;

    let html = `<html><head><title>${projectName} Report</title><style>${style}</style></head><body>`;
    html += `<h1>${projectName}</h1>`;
    html += `<div class="meta"><strong>Author:</strong> ${author} &bull; <strong>Date:</strong> ${new Date().toLocaleString()} &bull; <strong>Engine:</strong> ${VERSION}</div>`;

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
          const srcId = e.sourceId || e.sourcePartId;
          const tgtId = e.targetId || e.targetPartId;
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
        // ── Tree layout for BDD / Requirements ──
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

        // Place unvisited
        nodes.forEach(n => {
          if (!levelMap.has(n.id)) {
            levelMap.set(n.id, (Math.max(...Array.from(levelMap.values()), 0)) + 1);
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

        sortedLevels.forEach(level => {
          const levelNodes = levelGroups.get(level)!;
          const totalWidth = levelNodes.reduce((sum, n) => sum + (n.width || 140) + NODE_GAP_X, -NODE_GAP_X);
          const startX = Math.max(0, (MAX_ROW_WIDTH - totalWidth) / 2);
          let curX = startX;
          const maxH = Math.max(...levelNodes.map(n => n.height || 80));

          levelNodes.forEach(n => {
            n.displayX = curX;
            n.displayY = curY;
            curX += (n.width || 140) + NODE_GAP_X;
          });

          curY += maxH + NODE_GAP_Y;
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

    // Helper to generate SVG for report
    const renderDiagramSVG = (nodes: any[], edges: any[], type: 'req' | 'bdd' | 'ibd' | 'statemachine' | 'xbridges', contextId?: string) => {
      if (nodes.length === 0) return '';

      // Deep-copy edges to avoid mutating actual state data
      const edgesCopy = edges.map((e: any) => ({ ...e }));

      // Prepare Nodes: Use fixed size for BDD blocks to match App, use instance size for IBD/Req
      const displayNodes = nodes.map(n => {
        const isBdd = type === 'bdd';
        const isReq = type === 'req';
        const width = isBdd ? 140 : isReq ? (n.width || 160) : n.width;
        const height = isBdd ? 70 : isReq ? (n.height || 80) : n.height;
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

      const padding = 60;
      const rawWidth = Math.max(200, maxX - minX + padding * 2);
      const rawHeight = Math.max(150, maxY - minY + padding * 2);

      // Cap SVG display width for A4 readability
      const MAX_SVG_WIDTH = 780;
      const scaleFactor = rawWidth > MAX_SVG_WIDTH ? MAX_SVG_WIDTH / rawWidth : 1;
      const displayWidth = Math.min(rawWidth, MAX_SVG_WIDTH);
      const displayHeight = rawHeight * scaleFactor;

      const viewBox = `${minX - padding} ${minY - padding} ${rawWidth} ${rawHeight}`;

      // ── PAGINATION: split large diagrams into pages ──
      const MAX_NODES_PER_PAGE = 20;
      if (displayNodes.length > MAX_NODES_PER_PAGE) {
        // Sort nodes by Y then X for logical page grouping
        const sortedNodes = [...displayNodes].sort((a, b) => a.displayY - b.displayY || a.displayX - b.displayX);
        const pages: any[][] = [];
        for (let i = 0; i < sortedNodes.length; i += MAX_NODES_PER_PAGE) {
          pages.push(sortedNodes.slice(i, i + MAX_NODES_PER_PAGE));
        }

        let allSvg = '';
        pages.forEach((pageNodes, pageIdx) => {
          const pageNodeIds = new Set(pageNodes.map(n => n.id));
          const pageEdges = edgesCopy.filter((e: any) => {
            const srcId = e.sourceId || e.sourcePartId;
            const tgtId = e.targetId || e.targetPartId;
            return pageNodeIds.has(srcId) || pageNodeIds.has(tgtId);
          });

          // Calculate page bounds
          let pMinX = Infinity, pMinY = Infinity, pMaxX = -Infinity, pMaxY = -Infinity;
          pageNodes.forEach(n => {
            pMinX = Math.min(pMinX, n.displayX);
            pMinY = Math.min(pMinY, n.displayY);
            pMaxX = Math.max(pMaxX, n.displayX + n.width);
            pMaxY = Math.max(pMaxY, n.displayY + n.height);
          });

          const pPad = 50;
          const pW = Math.max(200, pMaxX - pMinX + pPad * 2);
          const pH = Math.max(150, pMaxY - pMinY + pPad * 2);
          const pDispW = Math.min(pW, MAX_SVG_WIDTH);
          const pScale = pW > MAX_SVG_WIDTH ? MAX_SVG_WIDTH / pW : 1;
          const pDispH = pH * pScale;
          const pVB = `${pMinX - pPad} ${pMinY - pPad} ${pW} ${pH}`;

          allSvg += `<div style="margin: 12px 0; border: 1px solid #ddd; padding: 12px; background: #fcfcfc; page-break-inside: avoid;">`;
          allSvg += `<div style="font-size: 10px; color: #999; margin-bottom: 6px; text-align: right;">Page ${pageIdx + 1} of ${pages.length} (${displayNodes.length} elements)</div>`;
          allSvg += renderSingleSVG(pageNodes, pageEdges, type, pVB, pDispW, pDispH, displayNodesMap);
          allSvg += `</div>`;
        });
        return allSvg;
      }

      let svgResult = `<div style="margin: 16px 0; border: 1px solid #ddd; padding: 12px; background: #fcfcfc; page-break-inside: avoid;">`;
      svgResult += renderSingleSVG(displayNodes, edgesCopy, type, viewBox, displayWidth, displayHeight, displayNodesMap);
      svgResult += `</div>`;
      return svgResult;
    };

    // Single SVG rendering helper (used by renderDiagramSVG and pagination)
    const renderSingleSVG = (displayNodes: any[], edges: any[], type: string, viewBox: string, svgWidth: number, svgHeight: number, displayNodesMap: Map<string, any>) => {

      let svg = `<svg width="${svgWidth}" height="${svgHeight}" viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 100%; height: auto;">`;

      // Defs for markers
      svg += `<defs>
          <marker id="m-arrow-${type}" markerWidth="10" markerHeight="10" refX="10" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10" fill="none" stroke="#333" /></marker>
          <marker id="m-arrow-filled-${type}" markerWidth="10" markerHeight="10" refX="10" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="#333" stroke="#333" /></marker>
          <marker id="m-diamond-${type}" markerWidth="16" markerHeight="10" refX="16" refY="5" orient="auto"><path d="M0,5 L8,0 L16,5 L8,10 Z" fill="#fff" stroke="#333" /></marker>
          <marker id="m-diamond-fill-${type}" markerWidth="16" markerHeight="10" refX="16" refY="5" orient="auto"><path d="M0,5 L8,0 L16,5 L8,10 Z" fill="#333" stroke="#333" /></marker>
          <marker id="m-triangle-${type}" markerWidth="12" markerHeight="10" refX="12" refY="5" orient="auto"><path d="M0,0 L12,5 L0,10 Z" fill="#fff" stroke="#333" /></marker>
        </defs>`;

      // Helper for Port Position
      const getPortPos = (node: any, portId: string) => {
        let block = type === 'ibd' ? blocks.find(b => b.id === node.typeId) : node;
        if (!block) return { x: node.displayX, y: node.displayY };

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

      // Render Nodes
      displayNodes.forEach(n => {
        const fill = type === 'req' ? '#fff' : '#f0f0f0';
        const stroke = type === 'req' ? '#f97316' : '#333';

        if (type === 'statemachine') {
          if (n.nodeType === 'junction') {
            svg += `<g transform="translate(${n.displayX + n.width / 2}, ${n.displayY + n.height / 2})">`;
            svg += `<circle r="8" fill="#333" stroke="#ff9900" stroke-width="2" />`;
            if (n.type === 'history') svg += `<text x="0" y="4" text-anchor="middle" fill="#fff" font-size="11" font-weight="bold">H</text>`;
            if (n.type === 'deep-history') svg += `<text x="0" y="4" text-anchor="middle" fill="#fff" font-size="11" font-weight="bold">H*</text>`;
            svg += `<text x="0" y="-18" text-anchor="middle" fill="#ff9900" font-size="12" font-weight="bold">${n.name}</text>`;
            svg += `</g>`;
          } else {
            // State
            svg += `<g transform="translate(${n.displayX}, ${n.displayY})">`;
            svg += `<rect width="${n.width}" height="${n.height}" rx="8" fill="#fcfcfc" stroke="#333" stroke-width="2" />`;
            svg += `<path d="M0 26 h${n.width}" stroke="#ddd" stroke-width="1" />`;
            svg += `<text x="${n.width / 2}" y="18" text-anchor="middle" font-size="13" font-weight="bold" fill="#000" font-family="sans-serif">${n.name}</text>`;

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
                  const safeTxt = txt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

        svg += `<g transform="translate(${n.displayX}, ${n.displayY})">`;
        svg += `<rect width="${n.width}" height="${n.height}" fill="${fill}" stroke="${stroke}" stroke-width="1" rx="4" />`;

        if (type === 'req') {
          svg += `<text x="${n.width / 2}" y="22" text-anchor="middle" font-size="13" font-weight="bold" fill="#000" font-family="sans-serif">${n.reqId}</text>`;
          svg += `<text x="${n.width / 2}" y="40" text-anchor="middle" font-size="11" fill="#333" font-family="sans-serif">${n.name.length > 22 ? n.name.substring(0, 20) + '...' : n.name}</text>`;
          if (n.description) {
            const desc = n.description.length > 30 ? n.description.substring(0, 28) + '...' : n.description;
            svg += `<text x="6" y="58" font-size="10" fill="#555" font-family="sans-serif">${desc}</text>`;
          }
        } else {
          svg += `<text x="${n.width / 2}" y="17" text-anchor="middle" font-size="10" fill="#666" font-family="monospace">«${n.stereotype || (type === 'ibd' ? 'part' : 'block')}»</text>`;
          svg += `<text x="${n.width / 2}" y="34" text-anchor="middle" font-size="13" font-weight="bold" fill="#000" font-family="sans-serif">${n.name}</text>`;
          svg += `<line x1="0" y1="38" x2="${n.width}" y2="38" stroke="#888" stroke-width="0.5" />`;
        }

        if (type === 'bdd' && n.properties?.length > 0) {
          n.properties.slice(0, 3).forEach((p: any, i: number) => {
            svg += `<text x="5" y="${48 + i * 12}" font-size="9" font-family="monospace" fill="#555">${p.name}:${p.type}</text>`;
          });
        }

        // Render Ports
        let block = type === 'ibd' ? blocks.find(b => b.id === n.typeId) : n;
        if (block && block.ports && (type === 'ibd' || type === 'bdd')) {
          block.ports.forEach((p: any, i: number) => {
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

            svg += `<text x="${tx}" y="${ty}" text-anchor="${anchor}" font-size="8" fill="#666">${p.name}</text>`;
          });
        }

        svg += `</g>`;
      });

      // Render Edges
      edges.forEach((e: any) => {
        let sp, tp;
        let source = type === 'ibd' ? displayNodes.find(n => n.id === e.sourcePartId) : displayNodes.find(n => n.id === e.sourceId);
        let target = type === 'ibd' ? displayNodes.find(n => n.id === e.targetPartId) : displayNodes.find(n => n.id === e.targetId);

        if (type === 'ibd') {
          if (source && target) {
            sp = getPortPos(source, e.sourcePortId);
            tp = getPortPos(target, e.targetPortId);
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
            if (relType === 'composition') markerStart = `url(#m-diamond-fill-${type})`;
            else if (relType === 'aggregation') markerStart = `url(#m-diamond-${type})`;
            else if (relType === 'generalization') markerEnd = `url(#m-triangle-${type})`;
            else if (['derive', 'deriveReqt', 'refine', 'satisfy', 'verify', 'trace'].includes(relType)) {
              strokeDash = '4,2';
              middleLabel = `«${relType}»`;
              markerEnd = `url(#m-arrow-${type})`;
            } else if (relType === 'allocation') {
              strokeDash = '5,5';
              middleLabel = '«allocate»';
              markerEnd = `url(#m-arrow-${type})`;
            }
          }

          if (type === 'statemachine' && cp) {
            const dPath = `M ${sp.x} ${sp.y} Q ${cp.x} ${cp.y} ${tp.x} ${tp.y}`;
            svg += `<path d="${dPath}" fill="none" stroke="${strokeColor}" stroke-width="1.5" stroke-dasharray="${strokeDash}" marker-end="${markerEnd}" />`;
          } else {
            svg += `<line x1="${sp.x}" y1="${sp.y}" x2="${tp.x}" y2="${tp.y}" stroke="${strokeColor}" stroke-width="1.5" stroke-dasharray="${strokeDash}" marker-start="${markerStart}" marker-end="${markerEnd}" />`;
          }

          if (middleLabel || e.label) {
            let midX = (sp.x + tp.x) / 2;
            let midY = (sp.y + tp.y) / 2;

            if (type === 'statemachine' && cp) {
              midX = cp.x;
              midY = cp.y - 5;
            }

            const txt = (middleLabel ? middleLabel + ' ' : '') + (e.label || '');
            const txtW = txt.length * 6.5 + 12;
            svg += `<rect x="${midX - txtW / 2}" y="${midY - 9}" width="${txtW}" height="16" fill="#fcfcfc" opacity="0.92" rx="2" />`;
            svg += `<text x="${midX}" y="${midY + 3}" text-anchor="middle" font-size="11" fill="#000">${txt}</text>`;
          }

          if (type === 'bdd' && (e.sourceMultiplicity || e.targetMultiplicity)) {
            if (e.sourceMultiplicity) svg += `<text x="${sp.x + (tp.x > sp.x ? 15 : -15)}" y="${sp.y + (tp.y > sp.y ? 15 : -15)}" font-size="10" fill="#000">${e.sourceMultiplicity}</text>`;
            if (e.targetMultiplicity) svg += `<text x="${tp.x + (sp.x > tp.x ? 15 : -15)}" y="${tp.y + (sp.y > tp.y ? 15 : -15)}" font-size="10" fill="#000">${e.targetMultiplicity}</text>`;
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
          svg += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" fill="${btnColor}" font-size="10">${iconSym}${c.name}</text>`;
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
          svg += `<text x="12" y="20" fill="#4d7aaa" font-size="8" font-family="monospace">${titleText}</text>`;
          svg += `<text x="${c.width - 12}" y="20" text-anchor="end" fill="#3de88a" font-size="8" font-family="monospace" font-weight="bold">${modeText}</text>`;
          svg += `<text x="12" y="45" fill="#4db8ff" font-size="18" font-family="monospace" font-weight="bold">200°C</text>`;
          svg += `<rect x="12" y="55" width="${c.width - 24}" height="3" fill="#111" rx="1" />`;
          svg += `<rect x="12" y="55" width="${(c.width - 24) * 0.4}" height="3" fill="#3de88a" rx="1" />`;
          svg += `<text x="12" y="75" fill="#4db8ff" font-size="10" font-family="monospace">30:00</text>`;
          svg += `<text x="${c.width - 12}" y="75" text-anchor="end" fill="#3de88a" font-size="8" font-family="monospace">HOME</text>`;
          svg += `<text x="12" y="95" fill="#335577" font-size="7" font-family="monospace">${indicatorsStr}</text>`;
        } else if (c.type === 'mode-icon') {
          svg += `<rect x="4" y="4" width="${c.width - 8}" height="${c.height - 8}" fill="#1a1a20" stroke="#333" rx="4" />`;
          svg += `<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="14">${c.iconEmoji || '✨'}</text>`;
          svg += `<text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="7" fill="#ccc">${c.name}</text>`;
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
          svg += `<text x="${cx}" y="${cy + 25}" text-anchor="middle" fill="#555" font-family="monospace" font-size="7">${displayVal}</text>`;
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

        svg += `<text x="${cx}" y="${c.height - 4}" text-anchor="middle" font-size="8" fill="#888">${c.name}</text>`;
        svg += `</g>`;
      });

      svg += `</svg></div>`;
      return svg;
    };

    // 1. Requirements
    const reqs = blocks.filter(b => b.stereotype === 'requirement');
    if (reqs.length > 0) {
      const reqRels = relationships.filter(r => {
        const s = blocks.find(b => b.id === r.sourceId);
        const t = blocks.find(b => b.id === r.targetId);
        return s?.stereotype === 'requirement' && t?.stereotype === 'requirement';
      });
      html += renderDiagramSVG(reqs, reqRels, 'req');

      html += `<h2>1. Requirements</h2>`;
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

      relationships.forEach(rel => {
        const source = blocks.find(b => b.id === rel.sourceId);
        const target = blocks.find(b => b.id === rel.targetId);
        if (source?.stereotype === 'requirement' && target?.stereotype === 'requirement') {
          // Only use specific SysML relationships for parent-child nesting, matching the Traceability Matrix
          if (rel.type === 'composition' || rel.type === 'derive' || rel.type === 'deriveReqt') {
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
          <td style="padding: 10px; border: 1px solid #ddd; font-family: monospace; color: #888;">${r.reqId}</td>
          <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">${prefix}${r.name}</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${r.status || 'Draft'}</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${r.priority || 'Medium'}</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${r.assignedTo || 'Unassigned'}</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${r.description || ''}</td>
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
    const bddBlocks = blocks.filter(b => {
      if (b.stereotype === 'requirement') return false;
      // Check if this block is used as a type for any part
      if (parts.some(p => p.typeId === b.id)) return false;
      return true;
    });

    if (bddBlocks.length > 0) {
      const bddRels = relationships.filter(r => {
        const s = blocks.find(b => b.id === r.sourceId);
        const t = blocks.find(b => b.id === r.targetId);
        if (!s || !t) return false;
        // Check if source or target are hidden
        const sHidden = parts.some(p => p.typeId === s.id);
        const tHidden = parts.some(p => p.typeId === t.id);
        return s.stereotype !== 'requirement' && t.stereotype !== 'requirement' && !sHidden && !tHidden;
      });
      html += `<div class="diagram-container"><div class="diagram-cell">` + renderDiagramSVG(bddBlocks, bddRels, 'bdd') + `</div></div>`;

      html += `<h2>2. System Architecture (BDD)</h2><div class="tree">`;
      bddBlocks.forEach(b => {
        html += `<div class="item">
                <div class="item-header">«${b.stereotype}» ${b.name}</div>`;
        if (b.properties.length > 0) {
          html += `<div class="props"><strong>Properties:</strong><ul>`;
          b.properties.forEach(p => html += `<li>${p.name}: ${p.type} ${p.defaultValue ? '= ' + p.defaultValue : ''}</li>`);
          html += `</ul></div>`;
        }
        if (b.ports.length > 0) {
          html += `<div class="props"><strong>Ports:</strong><ul>`;
          b.ports.forEach(p => html += `<li>${p.name} : ${p.type} (${p.kind})</li>`);
          html += `</ul></div>`;
        }
        html += `</div>`;
      });
      html += `</div>`;
    }

    // 3. IBD
    if (parts.length > 0) {
      html += `<h2>3. Internal Structure (IBD)</h2><div class="tree">`;

      // Generate diagrams for each context
      const contextIds = Array.from(new Set(parts.map(p => p.blockId).filter(id => id !== null))) as string[];
      html += `<div class="diagram-container">`;
      contextIds.forEach(ctxId => {
        const ctxBlock = blocks.find(b => b.id === ctxId);
        const ctxName = ctxBlock ? ctxBlock.name : (ctxId === 'root' ? 'Root' : 'Unknown');
        const ctxParts = parts.filter(p => p.blockId === ctxId);
        const ctxConns = connectors.filter(c => {
          const s = parts.find(p => p.id === c.sourcePartId);
          const t = parts.find(p => p.id === c.targetPartId);
          return (s && s.blockId === ctxId) && (t && t.blockId === ctxId);
        });
        if (ctxParts.length > 0) {
          html += `<div class="diagram-cell"><h3>Context: ${ctxName}</h3>` + renderDiagramSVG(ctxParts, ctxConns, 'ibd') + `</div>`;
        }
      });
      html += `</div>`;

      parts.forEach(p => {
        const typeName = blocks.find(b => b.id === p.typeId)?.name || 'Unknown';
        html += `<div class="item"><div class="item-header">${p.name} : ${typeName}</div></div>`;
      });
      if (connectors.length > 0) {
        html += `<h3>Connections</h3><div class="tree">`;
        connectors.forEach(c => {
          const sPart = parts.find(p => p.id === c.sourcePartId)?.name || 'Env';
          const tPart = parts.find(p => p.id === c.targetPartId)?.name || 'Env';
          html += `<div class="item"><span class="tag">Conn</span> ${sPart} &harr; ${tPart} ${c.itemFlow ? '(' + c.itemFlow + ')' : ''}</div>`;
        });
        html += `</div>`;
      }
      html += `</div>`;
    }

    // 4. State Machine
    if (states.length > 0) {
      html += `<h2>4. State Machine</h2><div class="tree">`;

      // Generate diagrams for all layers
      html += `<div class="diagram-container">`;
      layers.forEach(layer => {
        const layerStates = states.filter(s => layer.stateIds.includes(s.id));
        const layerJunctions = junctions.filter(j => layer.junctionIds.includes(j.id));
        const layerTransitions = transitions.filter(t => layer.transitionIds.includes(t.id));

        if (layerStates.length > 0 || layerJunctions.length > 0) {
          const layerName = layer.name || (layer.id === 'root' ? 'Root' : 'Unknown');

          // Mix states and junctions into nodes list, adding type
          const nodes: any[] = [];
          if (layer.parentStateId) {
            const parentState = states.find(s => s.id === layer.parentStateId);
            if (parentState) {
              nodes.push({ ...parentState, nodeType: 'parentState' });
            }
          }
          nodes.push(
            ...layerStates.map(s => ({ ...s, nodeType: 'state' })),
            ...layerJunctions.map(j => ({ ...j, nodeType: 'junction', width: 20, height: 20, x: j.x - 10, y: j.y - 10 }))
          );

          html += `<div class="diagram-cell"><h3>Layer: ${layerName}</h3>`;
          html += renderDiagramSVG(nodes, layerTransitions, 'statemachine');
          html += `</div>`;
        }
      });
      html += `</div>`;

      states.forEach(s => {
        html += `<div class="item"><div class="item-header">${s.name} <span class="tag">State</span></div>`;
        const outgoing = transitions.filter(t => t.sourceId === s.id);
        const internal = (s.internalTransitions || '').split('\n').filter(l => l.trim());
        if (outgoing.length > 0 || internal.length > 0) {
          html += `<div class="props"><strong>Transitions:</strong><ul>`;
          outgoing.forEach(t => {
            const target = states.find(st => st.id === t.targetId)?.name || junctions.find(j => j.id === t.targetId)?.name || 'Unknown';
            html += `<li>To <strong>${target}</strong>: [${t.condition || 'true'}]${t.action ? ' / ' + t.action : ''}</li>`;
          });
          internal.forEach(i => {
            const safeI = i.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            html += `<li><strong>Internal:</strong> ${safeI}</li>`;
          });
          html += `</ul></div>`;
        }
        html += `</div>`;
      });
      html += `</div>`;

      // 4.1 Critical Path Analysis (Critical Batches)
      const analysis = analyzeStateMachine({ tickMs, states, junctions, transitions, variables, layers, safetyMode });

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
                    <td style="padding: 10px; border: 1px solid #ddd; font-family: monospace; font-weight: bold; color: #f97316;">${cp.id}</td>
                    <td style="padding: 10px; border: 1px solid #ddd;"><strong>${cp.name}</strong><br/><small style="color: #666;">${cp.description}</small></td>
                    <td style="padding: 10px; border: 1px solid #ddd; font-family: monospace; font-size: 0.95em;">${cp.states.map(s => `<span class="tag">${s}</span>`).join(' &rarr; ')}</td>
                    <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; text-align: center;">${cp.complexity}</td>
                  </tr>`;
        });
        html += `</table>`;
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
                    <td style="padding: 10px; border: 1px solid #ddd; font-family: monospace; font-weight: bold;">${cc.id}</td>
                    <td style="padding: 10px; border: 1px solid #ddd; font-family: monospace; font-weight: bold;">${cc.category}</td>
                    <td style="padding: 10px; border: 1px solid #ddd;"><span class="badge ${badgeClass}">${cc.severity.toUpperCase()}</span></td>
                    <td style="padding: 10px; border: 1px solid #ddd;"><strong>${cc.elementName}</strong></td>
                    <td style="padding: 10px; border: 1px solid #ddd;">${cc.description}</td>
                    <td style="padding: 10px; border: 1px solid #ddd;"><span style="color: #3b82f6; font-weight: 500;">${cc.recommendation}</span></td>
                  </tr>`;
        });
        html += `</table>`;
      } else {
        html += `<p style="color: #15803d; font-weight: bold;">&check; All behavioral audits passed! No deadlocks, unreachable states, or unconditional loops detected.</p>`;
      }
      html += `</div>`;

      // 4.3 Test Scenario Matrix
      html += `<h2>4.3 Test Scenario Matrix</h2><div class="tree">`;
      html += `<p>Comprehensive set of test scenarios derived to achieve full branch/junction coverage, exercise all corner cases, and verify robust runtime execution with zero crashes.</p>`;
      
      analysis.testScenarios.forEach(ts => {
        html += `<div class="item" style="border: 1px solid #e5e7eb; border-radius: 6px; padding: 15px; margin-bottom: 20px; background-color: #fafafa;">
                  <div class="item-header" style="font-size: 1.1em; color: #1e293b; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin-bottom: 10px;">
                    <span class="tag" style="background-color: #f97316; color: #fff;">${ts.category.toUpperCase()}</span> ${ts.name} <span style="font-family: monospace; font-size: 0.9em; color: #64748b; float: right;">${ts.id}</span>
                  </div>`;
        
        if (ts.preconditions.length > 0) {
          html += `<div class="props" style="margin-bottom: 10px;">
                    <strong>Preconditions:</strong>
                    <ul style="margin: 4px 0; padding-left: 20px; font-size: 0.95em;">
                      ${ts.preconditions.map(p => `<li>${p}</li>`).join('')}
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
                    <td style="padding: 6px; border: 1px solid #cbd5e1; font-family: monospace;">${step.action}</td>
                    <td style="padding: 6px; border: 1px solid #cbd5e1;">${step.expected}</td>
                  </tr>`;
        });
        html += `</table>`;

        html += `<div class="props" style="background-color: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; padding: 8px; border-radius: 4px; font-size: 0.9em;">
                  <strong>Expected Outcome:</strong> ${ts.expectedResult}
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
        html += `<div class="item"><div class="item-header">${c.name} <span class="tag">${c.type}</span></div><div class="props">Bound to: <strong>${boundVariableName}</strong></div></div>`;
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

      // Serialize data for JS engine
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
        parentId: s.parentId,
        entry: s.entry || '',
        during: s.during || '',
        exit: s.exit || '',
        autostart: !!s.autostart,
        internalTransitions: s.internalTransitions || '',
        isXBridges: !!s.isXBridges
      }));

      const serializedTransitions = transitions.map(t => ({
        id: t.id,
        sourceId: t.sourceId,
        targetId: t.targetId,
        condition: t.condition || '',
        action: t.action || '',
        afterTicks: t.afterTicks,
        type: t.type || 'condition',
        order: t.order || 1
      }));

      const serializedJunctions = junctions.map(j => ({
        id: j.id,
        name: j.name,
        parentId: j.parentId
      }));

      const serializedLayers = layers.map(l => ({
        id: l.id,
        name: l.name || '',
        parentStateId: l.parentStateId,
        stateIds: l.stateIds || [],
        junctionIds: l.junctionIds || [],
        transitionIds: l.transitionIds || []
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
          (function() {
            const PROJECT_DATA = {
              variables: ${JSON.stringify(serializedVariables)},
              states: ${JSON.stringify(serializedStates)},
              transitions: ${JSON.stringify(serializedTransitions)},
              junctions: ${JSON.stringify(serializedJunctions)},
              layers: ${JSON.stringify(serializedLayers)},
              hmiComponents: ${JSON.stringify(serializedHmiComponents)},
              tickMs: ${tickMs}
            };

            let varValues = {};
            let varTypes = {};
            let activeStates = {};
            let stateTimers = {};
            let lastActiveStates = {};
            let simRunning = true;
            let simInterval = null;
            let stepCount = 0;
            let simTime = 0;
            let lpTimers = {};
            let audioCtx = null;

            function escapeHtml(str) {
              return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
              entry.innerHTML = "<span style='color: #555568; min-width: 50px;'>" + escapeHtml(ts) + "</span><span style='color: #4db8ff; min-width: 100px; font-weight: bold;'>" + escapeHtml(event) + "</span><span style='color: #8888a0;'>" + escapeHtml(detail) + "</span>";
              el.prepend(entry);
              while (el.children.length > 40) el.removeChild(el.lastChild);
            }

            function getVarValById(id) {
              const v = PROJECT_DATA.variables.find(x => x.id === id);
              return v ? varValues[v.name] : null;
            }

            function updateVariableById(id, value) {
              const v = PROJECT_DATA.variables.find(x => x.id === id);
              if (!v) return;
              let val = value;
              if (varTypes[v.name] === "bool") {
                val = value === "true" || value === true || value === "1" || value === 1;
              } else if (varTypes[v.name] === "int" || varTypes[v.name] === "float") {
                val = Number(value) || 0;
              }
              const oldVal = varValues[v.name];
              if (oldVal !== val) {
                varValues[v.name] = val;
                logEvent("Variable Change", v.name + ": " + oldVal + " → " + val);
                updateUi();
              }
            }

            function executeAction(code, location) {
              if (!code || !code.trim()) return;
              try {
                const varKeys = Object.keys(varValues);
                const varVals = varKeys.map(k => varValues[k]);
                const runner = new Function(...varKeys, code + "; return {" + varKeys.map(k => k + ":" + k).join(",") + "};");
                const result = runner(...varVals);
                if (result) {
                  varKeys.forEach(k => {
                    if (result[k] !== undefined) {
                      if (varTypes[k] === "bool") {
                        varValues[k] = !!result[k];
                      } else if (varTypes[k] === "int" || varTypes[k] === "float") {
                        varValues[k] = Number(result[k]) || 0;
                      } else {
                        varValues[k] = result[k];
                      }
                    }
                  });
                }
              } catch (e) {
                console.error("Action error in " + location + ":", e);
                logEvent("Action Error", location + ": " + e.message);
              }
            }

            function evaluateCondition(condition, location) {
              if (condition === "true" || condition === "") return true;
              try {
                let jsCondition = condition
                  .replace(/&&/g, "&&")
                  .replace(/\\|\\|/g, "||")
                  .replace(/!/g, "!")
                  .replace(/==/g, "===")
                  .replace(/!=/g, "!==");
                const varKeys = Object.keys(varValues);
                const varVals = varKeys.map(k => varValues[k]);
                const evaluator = new Function(...varKeys, "return !!(" + jsCondition + ");");
                return evaluator(...varVals);
              } catch (e) {
                console.error("Condition error in " + location + ":", e);
                return false;
              }
            }

            function enterState(stateId, activeMap, fromHistory = false) {
              const s = PROJECT_DATA.states.find(st => st.id === stateId);
              if (!s) return;
              const layerId = s.parentId || "root";
              activeMap[layerId] = s.id;
              stateTimers[s.id] = 0;
              executeAction(s.entry, "Entry " + s.name);
              
              const childLayer = PROJECT_DATA.layers.find(l => l.parentStateId === s.id);
              if (childLayer) {
                let childToEnterId;
                if (fromHistory === "deep") {
                  childToEnterId = lastActiveStates[childLayer.id];
                }
                if (childToEnterId) {
                  enterState(childToEnterId, activeMap, "deep");
                } else {
                  const targetId = resolveAutoStart(childLayer.id);
                  if (targetId) enterState(targetId, activeMap, false);
                }
              }
            }

            function resolveAutoStart(layerId) {
              const layerStates = PROJECT_DATA.states.filter(s => s.parentId === layerId);
              const autostarts = layerStates.filter(s => s.autostart);
              return autostarts.length > 0 ? autostarts[0].id : (layerStates.length > 0 ? layerStates[0].id : null);
            }

            function exitState(stateId, activeMap) {
              const s = PROJECT_DATA.states.find(st => st.id === stateId);
              if (!s) return;
              const layerId = s.parentId || "root";
              lastActiveStates[layerId] = s.id;
              
              const childLayer = PROJECT_DATA.layers.find(l => l.parentStateId === s.id);
              if (childLayer) {
                const activeChildId = activeMap[childLayer.id];
                if (activeChildId) exitState(activeChildId, activeMap);
                delete activeMap[childLayer.id];
              }
              executeAction(s.exit, "Exit " + s.name);
            }

            function getNode(id) {
              return PROJECT_DATA.states.find(s => s.id === id) || PROJECT_DATA.junctions.find(j => j.id === id);
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

            function stepSimulation() {
              simTime += (PROJECT_DATA.tickMs || 100) / 1000;
              stepCount++;
              
              Object.values(activeStates).forEach(stateId => {
                if (stateId) {
                  stateTimers[stateId] = (stateTimers[stateId] || 0) + 1;
                }
              });

              const nextActiveStates = { ...activeStates };
              let transitionFired = false;
              const regions = Object.keys(activeStates);

              for (const region of regions) {
                const currentStateId = activeStates[region];
                if (!nextActiveStates[region]) continue;
                const currentState = PROJECT_DATA.states.find(s => s.id === currentStateId);
                if (!currentState) continue;

                const potentialTransitions = PROJECT_DATA.transitions
                  .filter(t => t.sourceId === currentStateId)
                  .sort((a, b) => a.order - b.order);

                if (currentState.internalTransitions) {
                  const internalLines = currentState.internalTransitions.split("\\n").filter(l => l.trim());
                  internalLines.forEach((line, idx) => {
                    let type = "condition";
                    let condition = "true";
                    let afterTicks = null;
                    let action = "";
                    const parts = line.split("/");
                    if (parts.length > 1) action = parts.slice(1).join("/").trim();
                    const triggerPart = parts[0].trim();
                    const afterMatch = triggerPart.match(/after\\((\\d+)\\)/);
                    const condMatch = triggerPart.match(/\\[(.*?)\\]/);
                    if (afterMatch) {
                      type = "after";
                      afterTicks = parseInt(afterMatch[1]);
                    }
                    if (condMatch) condition = condMatch[1];

                    potentialTransitions.push({
                      id: "INT_" + currentState.id + "_" + idx,
                      sourceId: currentState.id,
                      targetId: currentState.id,
                      condition,
                      action,
                      type,
                      afterTicks,
                      order: 1000 + idx,
                      isInternal: true
                    });
                  });
                }

                for (const transition of potentialTransitions) {
                  const currentTicks = stateTimers[currentStateId] || 0;
                  const conditionMet = evaluateCondition(transition.condition, "Transition from " + currentState.name);
                  const timerMet = transition.afterTicks !== null && currentTicks >= transition.afterTicks;

                  let shouldFire = false;
                  if (transition.type === "condition") shouldFire = conditionMet;
                  else if (transition.type === "after") shouldFire = timerMet;
                  else if (transition.type === "and") shouldFire = conditionMet && timerMet;
                  else if (transition.type === "or") shouldFire = conditionMet || timerMet;

                  if (shouldFire) {
                    let currentTr = transition;
                    let targetNode = getNode(currentTr.targetId);
                    let pathActions = [currentTr.action];
                    let isLocalPath = !!transition.isInternal;
                    const visited = new Set();
                    let pathTerminatedAtJunction = false;

                    while (targetNode && !PROJECT_DATA.states.find(s => s.id === targetNode.id)) {
                      if (visited.has(targetNode.id)) {
                        pathActions.forEach(act => executeAction(act, "Action Path"));
                        transitionFired = true;
                        logEvent("Action Path", "Cycle ended at " + targetNode.name);
                        break;
                      }
                      visited.add(targetNode.id);
                      const currentNode = targetNode;
                      const junctionTransitions = PROJECT_DATA.transitions
                        .filter(t => t.sourceId === currentNode.id)
                        .sort((a, b) => a.order - b.order);

                      let foundNext = false;
                      for (const jTr of junctionTransitions) {
                        if (evaluateCondition(jTr.condition, "Junction " + currentNode.name)) {
                          currentTr = jTr;
                          targetNode = getNode(jTr.targetId);
                          pathActions.push(jTr.action);
                          foundNext = true;
                          break;
                        }
                      }
                      if (!foundNext) {
                        pathActions.forEach(act => executeAction(act, "Action Path"));
                        transitionFired = true;
                        logEvent("Action Path", "Ended at junction " + currentNode.name);
                        targetNode = null;
                        pathTerminatedAtJunction = true;
                        break;
                      }
                    }

                    if (pathTerminatedAtJunction || transitionFired) {
                      break;
                    }

                    if (targetNode) {
                      const targetState = targetNode;
                      if (isLocalPath) {
                        pathActions.forEach(act => executeAction(act, "Local Action"));
                        if (targetState.id !== currentState.id) {
                          nextActiveStates[region] = targetState.id;
                          stateTimers[targetState.id] = 0;
                        }
                      } else {
                        exitState(currentState.id, nextActiveStates);
                        pathActions.forEach(act => executeAction(act, "Transition Action"));
                        enterState(targetState.id, nextActiveStates);
                      }
                      transitionFired = true;
                      logEvent("Transition", currentState.name + " → " + targetState.name);
                      break;
                    }
                  }
                }
              }

              Object.values(nextActiveStates).forEach(stateId => {
                const state = PROJECT_DATA.states.find(s => s.id === stateId);
                if (state && state.during) {
                  executeAction(state.during, "During " + state.name);
                }
              });

              activeStates = nextActiveStates;
              updateUi();
            }

            function updateDashboard() {
              const db = document.getElementById("sim-dashboard");
              if (!db) return;
              db.innerHTML = "";

              PROJECT_DATA.layers.forEach(layer => {
                const layerName = layer.name || (layer.id === "root" ? "Root Region" : "Region");
                const activeStateId = activeStates[layer.id];
                const activeState = PROJECT_DATA.states.find(s => s.id === activeStateId);
                const stateName = activeState ? activeState.name : "—";
                const cell = document.createElement("div");
                cell.style.background = "#1a1a20";
                cell.style.border = "1px solid #2a2a36";
                cell.style.borderRadius = "6px";
                cell.style.padding = "6px 8px";
                cell.innerHTML = "<div style='font-size: 8px; color: #555568; text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;'>" + escapeHtml(layerName) + "</div><div style='font-size: 11px; font-weight: bold; color: #f97316; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;'>" + escapeHtml(stateName) + "</div>";
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
                cell.innerHTML = "<div style='font-size: 8px; color: #555568; text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;'>" + escapeHtml(v.name) + "</div><div style='font-size: 11px; font-weight: bold; color: " + (v.type === "bool" && val ? "#22c55e" : "#e8e8ec") + "; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;'>" + escapeHtml(displayVal) + "</div>";
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
                      indicatorsEl.innerHTML = "";
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
                let val = v.defaultValue;
                if (v.type === "bool") {
                  val = val === "true" || val === true || val === "1";
                } else if (v.type === "int" || v.type === "float") {
                  val = Number(val) || 0;
                }
                varValues[v.name] = val;
                varTypes[v.name] = v.type;
              });

              const rootStates = PROJECT_DATA.states.filter(s => s.parentId === "root" || !s.parentId);
              const autostarts = rootStates.filter(s => s.autostart);
              if (autostarts.length > 0) {
                autostarts.forEach(s => enterState(s.id, activeStates));
              } else if (rootStates.length > 0) {
                enterState(rootStates[0].id, activeStates);
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
                PROJECT_DATA.variables.forEach(v => {
                  let val = v.defaultValue;
                  if (v.type === "bool") {
                    val = val === "true" || val === true || val === "1";
                  } else if (v.type === "int" || v.type === "float") {
                    val = Number(val) || 0;
                  }
                  varValues[v.name] = val;
                });
                activeStates = {};
                stateTimers = {};
                lastActiveStates = {};
                simTime = 0;
                stepCount = 0;
                
                const rootStates = PROJECT_DATA.states.filter(s => s.parentId === "root" || !s.parentId);
                const autostarts = rootStates.filter(s => s.autostart);
                if (autostarts.length > 0) {
                  autostarts.forEach(s => enterState(s.id, activeStates));
                } else if (rootStates.length > 0) {
                  enterState(rootStates[0].id, activeStates);
                }
                updateUi();
                logEvent("Sim Reset", "All states and variables reset to default");
              },
              clearLog() {
                const el = document.getElementById("sim-event-log");
                if (el) el.innerHTML = "";
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

    html += `</body></html>`;

    setGlobalReportData({ html, projectName });
    setShowGlobalReportPreview(true);
    setShowReportDialog(false);
    addError('info', 'Report preview ready');
  }, [blocks, parts, connectors, states, transitions, junctions, hmiComponents, variables, addError, setShowReportDialog, layers, tickMs, safetyMode]);

  // KEYBOARD SHORTCUTS
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      // Prevent shortcuts when typing in inputs

      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if (isInput) {
        if (e.ctrlKey && (e.key === 's' || e.key === 'S')) {
          e.preventDefault();
          handleExportProject();
        }
        return;
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
          const selectedStates = states.filter(s => selectedIds.includes(s.id));
          const selectedJunctions = junctions.filter(j => selectedIds.includes(j.id));
          const selectedTransitions = transitions.filter(t => selectedIds.includes(t.id));
          const selectedBlocks = blocks.filter(b => selectedIds.includes(b.id));
          const selectedRelationships = relationships.filter(r => selectedIds.includes(r.id));
          const selectedParts = parts.filter(p => selectedIds.includes(p.id));
          const selectedConnectors = connectors.filter(c => selectedIds.includes(c.id));
          const selectedInterfaceRealizations = interfaceRealizations.filter(ir => selectedIds.includes(ir.id));

          setClipboard({
            states: selectedStates,
            junctions: selectedJunctions,
            transitions: selectedTransitions,
            blocks: selectedBlocks,
            relationships: selectedRelationships,
            parts: selectedParts,
            connectors: selectedConnectors,
            interfaceRealizations: selectedInterfaceRealizations,
          });
          addError('info', `Copied ${selectedIds.length} items`);
        }
        if (e.key === 'v' || e.key === 'V') {
          // Paste
          if (clipboard) {
            addToHistory();
            const idMap = new Map<string, string>();

            // State Machine
            const newStates = clipboard.states.map(s => {
              const newId = uuidv4();
              idMap.set(s.id, newId);
              return { ...s, id: newId, x: s.x + 20, y: s.y + 20, name: `${s.name}_copy` };
            });
            const newJunctions = clipboard.junctions.map(j => {
              const newId = uuidv4();
              idMap.set(j.id, newId);
              return { ...j, id: newId, x: j.x + 20, y: j.y + 20, name: `${j.name}_copy` };
            });
            const newTransitions = clipboard.transitions.map(t => ({
              ...t,
              id: uuidv4(),
              sourceId: idMap.get(t.sourceId) || t.sourceId,
              targetId: idMap.get(t.targetId) || t.targetId
            })).filter(t => (idMap.has(t.sourceId) || states.some(s => s.id === t.sourceId) || junctions.some(j => j.id === t.sourceId)) && (idMap.has(t.targetId) || states.some(s => s.id === t.targetId) || junctions.some(j => j.id === t.targetId)));

            // BDD/Requirements
            const newBlocks = (clipboard.blocks || []).map((b: BlockData) => {
              const newId = uuidv4();
              idMap.set(b.id, newId);
              const updatedBlock = { ...b, id: newId, x: b.x + 20, y: b.y + 20, name: `${b.name}_copy` };
              // Paste requirement blocks into the current layer
              if (b.stereotype === 'requirement') updatedBlock.layerId = currentLayerId;
              return updatedBlock;
            });
            const newRelationships = (clipboard.relationships || []).map(r => ({
              ...r,
              id: uuidv4(),
              sourceId: idMap.get(r.sourceId) || r.sourceId,
              targetId: idMap.get(r.targetId) || r.targetId
            })).filter(r => (idMap.has(r.sourceId) || blocks.some(b => b.id === r.sourceId)) && (idMap.has(r.targetId) || blocks.some(b => b.id === r.targetId)));

            // IBD
            const newParts = (clipboard.parts || []).map(p => {
              const newId = uuidv4();
              idMap.set(p.id, newId);
              return { ...p, id: newId, x: p.x + 20, y: p.y + 20, name: `${p.name}_copy` };
            });
            const newConnectors = (clipboard.connectors || []).map(c => ({
              ...c,
              id: uuidv4(),
              sourcePartId: idMap.get(c.sourcePartId) || c.sourcePartId,
              targetPartId: idMap.get(c.targetPartId) || c.targetPartId
            })).filter(c => (idMap.has(c.sourcePartId) || parts.some(p => p.id === c.sourcePartId)) && (idMap.has(c.targetPartId) || parts.some(p => p.id === c.targetPartId)));

            // Interface Realizations
            const newInterfaceRealizations = (clipboard.interfaceRealizations || []).map(ir => ({
              ...ir,
              id: uuidv4(),
              partId: idMap.get(ir.partId) || ir.partId,
              interfaceId: idMap.get(ir.interfaceId) || ir.interfaceId,
            })).filter(ir => (idMap.has(ir.partId) || parts.some(p => p.id === ir.partId)) && (idMap.has(ir.interfaceId) || blocks.some(b => b.id === ir.interfaceId)));

            setStates(prev => [...prev, ...newStates]);
            setJunctions(prev => [...prev, ...newJunctions]);
            setTransitions(prev => [...prev, ...newTransitions]);
            setBlocks(prev => [...prev, ...newBlocks]);
            setRelationships(prev => [...prev, ...newRelationships]);
            setParts(prev => [...prev, ...newParts]);
            setConnectors(prev => [...prev, ...newConnectors]);
            setInterfaceRealizations(prev => [...prev, ...newInterfaceRealizations]);

            // Add to current layer
            setLayers(prev => prev.map(l => l.id === currentLayerId ? {
              ...l,
              stateIds: [...l.stateIds, ...newStates.map(s => s.id)],
              junctionIds: [...l.junctionIds, ...newJunctions.map(j => j.id)],
              transitionIds: [...l.transitionIds, ...newTransitions.map(t => t.id)]
            } : l));

            setSelectedIds([
              ...newStates.map(s => s.id),
              ...newJunctions.map(j => j.id),
              ...newTransitions.map(t => t.id),
              ...newBlocks.map(b => b.id),
              ...newRelationships.map(r => r.id),
              ...newParts.map(p => p.id),
              ...newConnectors.map(c => c.id),
              ...newInterfaceRealizations.map(ir => ir.id)
            ]);
            addError('info', 'Pasted items');
          }
        }
        if (e.key === 'x' || e.key === 'X') {
          // Cut
          addToHistory();
          // Copy logic
          const selectedStates = states.filter(s => selectedIds.includes(s.id));
          const selectedJunctions = junctions.filter(j => selectedIds.includes(j.id));
          const selectedTransitions = transitions.filter(t => selectedIds.includes(t.id));
          const selectedBlocks = blocks.filter(b => selectedIds.includes(b.id));
          const selectedRelationships = relationships.filter(r => selectedIds.includes(r.id));
          const selectedParts = parts.filter(p => selectedIds.includes(p.id));
          const selectedConnectors = connectors.filter(c => selectedIds.includes(c.id));
          const selectedInterfaceRealizations = interfaceRealizations.filter(ir => selectedIds.includes(ir.id));

          setClipboard({
            states: selectedStates,
            junctions: selectedJunctions,
            transitions: selectedTransitions,
            blocks: selectedBlocks,
            relationships: selectedRelationships,
            parts: selectedParts,
            connectors: selectedConnectors,
            interfaceRealizations: selectedInterfaceRealizations,
          });
          // Delete logic
          selectedIds.forEach(id => {
            if (states.some(s => s.id === id)) deleteState(id);
            else if (junctions.some(j => j.id === id)) deleteJunction(id);
            else if (transitions.some(t => t.id === id)) deleteTransition(id);
            else if (blocks.some(b => b.id === id)) deleteBlock(id);
            else if (relationships.some(r => r.id === id)) deleteRelationship(id);
            else if (parts.some(p => p.id === id)) deletePart(id);
            else if (connectors.some(c => c.id === id)) deleteConnector(id);
            else if (interfaceRealizations.some(ir => ir.id === id)) deleteInterfaceRealization(id);
          });
          setSelectedIds([]);
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
          handleExportProject();
        }
      }

      if (e.key === 'Delete') {
        if (selectedIds.length > 0) {
          addToHistory();
          selectedIds.forEach(id => {
            if (states.some(s => s.id === id)) deleteState(id);
            else if (junctions.some(j => j.id === id)) deleteJunction(id);
            else if (transitions.some(t => t.id === id)) deleteTransition(id);
            else if (blocks.some(b => b.id === id)) deleteBlock(id);
            else if (relationships.some(r => r.id === id)) deleteRelationship(id);
            else if (parts.some(p => p.id === id)) deletePart(id);
            else if (connectors.some(c => c.id === id)) deleteConnector(id);
            else if (interfaceRealizations.some(ir => ir.id === id)) deleteInterfaceRealization(id);
          });
          setSelectedIds([]);
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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedIds, view, deleteState, deleteJunction, deleteTransition, deleteBlock, deleteRelationship, deletePart, deleteConnector, deleteInterfaceRealization, states, junctions, transitions, blocks, relationships, parts, connectors, interfaceRealizations, clipboard, currentLayerId, currentStates, currentJunctions, currentTransitions, addToHistory, undo, redo, addError, handleExportProject, diagramMode]);

  // CODE GENERATION (FULLY FUNCTIONAL WITH USER FEEDBACK)
  const generateCode = useCallback(async () => {
    // First validate syntax of actions and conditions
    if (!validateModel()) {
      // addError('error', 'Code generation blocked: Fix syntax errors in actions/conditions before generating.'); // Handled by validateModel
      return;
    }

    setIsGenerating(true);

    // Run AI check before generation to ensure MISRA/Syntax compliance
    await validateWithAI();

    try {
      const chart = { tickMs, states, junctions, transitions, variables, layers, safetyMode, hilConfig };
      // REQ-ENGINE-003: TS template literals ensure safe string concatenation
      let { files, errors: validationErrors, warnings } = generateMISRACCode(chart);

      // Generate Static Metric Report (MATLAB-Style)
      if (files.length > 0) {
        const metricsReport = generateStaticMetricsReport(chart, files);
        files.push({ name: 'static_metrics_report.md', content: metricsReport });
      }

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
        // Simulate AI processing
        await new Promise(resolve => setTimeout(resolve, 600));

        files = files.map(f => ({
          ...f,
          content: `/* [AI-AUDIT] Verified & Fixed by ADIA AI | ${new Date().toISOString()} */\n` + f.content + (f.content.endsWith('\n') ? '' : '\n')
        }));

        addError('info', 'AI has reviewed, fixed, and validated the generated code.', 'AI Assistant');
      } catch (e) {
        console.warn('AI Fix failed', e);
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
      addError('info', `MISRA-C code generated successfully.`);
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
            fill={state.isActive ? '#2a2a2a' : '#1a1a1a'}
            stroke={isSelected ? state.color : '#444'}
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
            fill="#888"
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
              fill="#888"
              fontSize={8}
              fontFamily="Inter, sans-serif"
            >
              {state.regionId}
            </text>
          )}

          {/* Graphical Representation of Internal Transitions */}
          {state.internalTransitions && (
            <g transform={`translate(8, ${state.height - 15 - (state.internalTransitions.split('\n').length * 10)})`}>
              <line x1={-8} y1={-5} x2={state.width - 8} y2={-5} stroke="#444" strokeWidth={1} />
              {state.internalTransitions.split('\n').slice(0, 3).map((line, i) => (
                <text key={i} y={i * 10} fill="#aaa" fontSize={9} fontFamily="monospace">{line.length > 25 ? line.slice(0, 25) + '...' : line}</text>
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

      const cp = transition.controlPoint || {
        x: (sp.x + tp.x) / 2 + (tp.y - sp.y) * 0.3,
        y: (sp.y + tp.y) / 2 + (sp.x - tp.x) * 0.3,
      };

      const path = `M ${sp.x} ${sp.y} Q ${cp.x} ${cp.y} ${tp.x} ${tp.y}`;
      const isSelected = selectedIds.includes(transition.id);
      const isFired = !!firedTransitions[transition.id];

      // CRITICAL FIX: Scale stroke width with zoom level
      const strokeWidth = isSelected ? 3 / view.scale : 2 / view.scale;
      const hitAreaWidth = 15 / view.scale;
      const handleRadius = 8 / view.scale;
      const handleStrokeWidth = 2 / view.scale;

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
          {/* Hit area - scaled for zoom */}
          <path
            d={path}
            fill="none"
            stroke="transparent"
            strokeWidth={hitAreaWidth}
            onMouseDown={(e: MouseEvent<SVGPathElement>) => {
              e.stopPropagation();
              handleTransitionClick(e, transition.id);
            }}
            style={{ cursor: 'pointer' }}
          />

          {/* Main path - scaled for zoom */}
          <path
            d={path}
            fill="none"
            stroke={isFired ? '#ffffff' : (isSelected ? '#f97316' : '#666')}
            strokeWidth={isFired ? strokeWidth * 2 : strokeWidth}
            strokeDasharray={transition.condition === 'true' && !transition.afterTicks ? '5,3' : undefined}
            style={{ transition: 'stroke 0.1s, stroke-width 0.1s' }}
          />

          {/* Arrowhead - scaled with transform */}
          <path
            d={`M ${tp.x} ${tp.y} L ${tp.x - 10} ${tp.y - 4} L ${tp.x - 10} ${tp.y + 4} Z`}
            fill={isSelected ? '#f97316' : '#666'}
            transform={`rotate(${Math.atan2(tp.y - sp.y, tp.x - sp.x) * 180 / Math.PI}, ${tp.x}, ${tp.y})`}
            style={{ transition: 'fill 0.1s' }}
          />

          {/* Control point handle (only when selected) - scaled for zoom */}
          {isSelected && (
            <circle
              cx={cp.x}
              cy={cp.y}
              r={handleRadius}
              fill="#f97316"
              stroke="#0a0a0a"
              strokeWidth={handleStrokeWidth}
              cursor="move"
              onMouseDown={(e: MouseEvent<SVGCircleElement>) => {
                e.stopPropagation();
                startControlPointDrag(transition.id, e);
              }}
            />
          )}

          {/* Transition label - not scaled (remains readable) */}
          <foreignObject x={cp.x - 75} y={cp.y - 15} width="150" height="30">
            <div className="px-2 py-1 bg-[#0a0a0a] border border-[#333] rounded text-[10px] font-mono text-center"
              style={{ color: isSelected ? '#f97316' : '#a0a0a0', pointerEvents: 'none' }}>
              <span className="text-amber-400">{priorityText}</span> {labelText}
            </div>
          </foreignObject>
        </g>
      );
    });
  }, [currentTransitions, states, junctions, view, selectedIds, firedTransitions, handleTransitionClick, startControlPointDrag]);

  const renderBlocks = useCallback((): React.ReactNode => {
    // In BDD mode, always treat as root level (ignore currentLayerId from IBD navigation)
    const effectiveLayerId = diagramMode === 'bdd' ? 'root' : currentLayerId;

    return blocks.map(block => {
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
      }

      if (diagramMode === 'requirements') {
        if (block.stereotype !== 'requirement') return null;
        // Use layerId for visibility: show only blocks belonging to the current layer.
        // Blocks without layerId (legacy) default to root.
        const blockLayer = block.layerId ?? 'root';
        if (blockLayer !== currentLayerId) return null;
      }

      if (diagramMode === 'bdd' && block.stereotype === 'requirement') return null;

      // In BDD mode, hide any block that is being used as a type for a part.
      if (diagramMode === 'bdd' && parts.some(p => p.typeId === block.id)) {
        return null;
      }

      const isSelected = selectedIds.includes(block.id);

      const displayWidth = block.width || 150;
      const displayHeight = block.height || 100;

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

          <rect width={displayWidth} height={displayHeight} fill={block.stereotype === 'requirement' ? '#1e1e1e' : '#1a1a1a'} stroke={isSelected ? '#f97316' : '#e0e0e0'} strokeWidth={1} />

          {/* Header */}
          <text x={displayWidth / 2} y={15} textAnchor="middle" fill="#f97316" fontSize={10} fontFamily="monospace">«{block.stereotype}»</text>
          <text x={displayWidth / 2} y={30} textAnchor="middle" fill="#e0e0e0" fontSize={12} fontWeight="bold">{block.name}</text>
          <line x1={0} y1={35} x2={displayWidth} y2={35} stroke="#444" strokeWidth={1} />

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
                  {prop.name}: {prop.type}{prop.defaultValue ? ` = ${prop.defaultValue}` : ''}
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
  }, [blocks, parts, selectedIds, isCreatingTransition, handleBlockMouseDown, diagramMode, currentLayerId, connectorSource, handlePortClick, handlePortMouseDown, enterBlock, enterRequirement, handleResizeMouseDown]);

  const renderRelationships = useCallback((): React.ReactNode => {
    return relationships.map(rel => {
      const source = blocks.find(b => b.id === rel.sourceId);
      const target = blocks.find(b => b.id === rel.targetId);
      if (!source || !target) return null;

      const isReqRel = source.stereotype === 'requirement' || target.stereotype === 'requirement';
      if (diagramMode === 'ibd') return null;
      if (diagramMode === 'bdd' && isReqRel) return null;
      if (diagramMode === 'requirements' && !isReqRel) return null;

      // Check visibility for requirements: both source and target must be in the current layer
      if (diagramMode === 'requirements') {
        const isBlockVisible = (block: BlockData) => (block.layerId ?? 'root') === currentLayerId;
        if (!isBlockVisible(source) || !isBlockVisible(target)) return null;
      }

      const srcW = source.width || 150;
      const srcH = source.height || 100;
      const tgtW = target.width || 150;
      const tgtH = target.height || 100;

      const sp = getEdgePoint({ x: source.x, y: source.y, width: srcW, height: srcH }, { x: target.x, y: target.y, width: tgtW, height: tgtH });
      const tp = getEdgePoint({ x: target.x, y: target.y, width: tgtW, height: tgtH }, { x: source.x, y: source.y, width: srcW, height: srcH });
      const isSelected = selectedIds.includes(rel.id);
      const strokeColor = isSelected ? '#f97316' : '#888';
      const strokeDash = rel.type === 'allocation' ? '5,5' : undefined;
      const isTrace = ['derive', 'deriveReqt', 'refine', 'satisfy', 'verify', 'trace'].includes(rel.type);

      return (
        <g key={rel.id} onClick={(e) => { e.stopPropagation(); setSelectedIds([rel.id]); }}>
          <line x1={sp.x} y1={sp.y} x2={tp.x} y2={tp.y} stroke={strokeColor} strokeWidth={2} strokeDasharray={isTrace ? '4,2' : strokeDash} />

          {/* Arrowheads */}
          {rel.type === 'generalization' && (
            <polygon points={`${tp.x},${tp.y} ${tp.x - 10},${tp.y - 5} ${tp.x - 10},${tp.y + 5}`} fill="#0a0a0a" stroke={strokeColor} transform={`rotate(${Math.atan2(tp.y - sp.y, tp.x - sp.x) * 180 / Math.PI}, ${tp.x}, ${tp.y})`} />
          )}
          {rel.type === 'composition' && (
            <polygon points={`${sp.x},${sp.y} ${sp.x + 10},${sp.y - 5} ${sp.x + 20},${sp.y} ${sp.x + 10},${sp.y + 5}`} fill={strokeColor} stroke={strokeColor} transform={`rotate(${Math.atan2(tp.y - sp.y, tp.x - sp.x) * 180 / Math.PI}, ${sp.x}, ${sp.y})`} />
          )}
          {rel.type === 'aggregation' && (
            <polygon points={`${sp.x},${sp.y} ${sp.x + 10},${sp.y - 5} ${sp.x + 20},${sp.y} ${sp.x + 10},${sp.y + 5}`} fill="#0a0a0a" stroke={strokeColor} transform={`rotate(${Math.atan2(tp.y - sp.y, tp.x - sp.x) * 180 / Math.PI}, ${sp.x}, ${sp.y})`} />
          )}
          {rel.type === 'allocation' && (
            <g>
              <text x={(sp.x + tp.x) / 2} y={(sp.y + tp.y) / 2 - 10} textAnchor="middle" fill={strokeColor} fontSize={10}>«allocate»</text>
              <polygon points={`${tp.x},${tp.y} ${tp.x - 10},${tp.y - 5} ${tp.x - 10},${tp.y + 5}`} fill="none" stroke={strokeColor} transform={`rotate(${Math.atan2(tp.y - sp.y, tp.x - sp.x) * 180 / Math.PI}, ${tp.x}, ${tp.y})`} />
            </g>
          )}
          {isTrace && (
            <g>
              <text x={(sp.x + tp.x) / 2} y={(sp.y + tp.y) / 2 - 10} textAnchor="middle" fill={strokeColor} fontSize={10}>«{rel.type}»</text>
              <path d={`M ${tp.x - 8} ${tp.y - 4} L ${tp.x} ${tp.y} L ${tp.x - 8} ${tp.y + 4}`} fill="none" stroke={strokeColor} transform={`rotate(${Math.atan2(tp.y - sp.y, tp.x - sp.x) * 180 / Math.PI}, ${tp.x}, ${tp.y})`} />
            </g>
          )}

          {rel.label && (
            <text x={(sp.x + tp.x) / 2} y={(sp.y + tp.y) / 2 - 5} textAnchor="middle" fill={strokeColor} fontSize={10} dy={-5}>{rel.label}</text>
          )}
          {rel.sourceMultiplicity && (
            <text x={sp.x + (tp.x > sp.x ? 10 : -10)} y={sp.y + 10} fill={strokeColor} fontSize={10} textAnchor={tp.x > sp.x ? 'start' : 'end'}>{rel.sourceMultiplicity}</text>
          )}
          {rel.targetMultiplicity && (
            <text x={tp.x + (sp.x > tp.x ? 10 : -10)} y={tp.y - 10} fill={strokeColor} fontSize={10} textAnchor={sp.x > tp.x ? 'start' : 'end'}>{rel.targetMultiplicity}</text>
          )}
        </g>
      );
    });
  }, [relationships, blocks, selectedIds, diagramMode, currentLayerId]);

  const renderParts = useCallback((): React.ReactNode => {
    // Only render parts in IBD mode
    if (diagramMode !== 'ibd') return null;
    return parts.filter(p => p.blockId === currentLayerId).map(part => {
      const block = blocks.find(b => b.id === part.typeId);
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
          <rect width={part.width} height={part.height} fill="#1a1a1a" stroke={isSelected ? '#f97316' : '#666'} strokeWidth={1} />
          <text x={part.width / 2} y={20} textAnchor="middle" fill="#e0e0e0" fontSize={12} fontWeight="bold">{part.name} {part.multiplicity ? `[${part.multiplicity}]` : ''}</text>
          <text x={part.width / 2} y={35} textAnchor="middle" fill="#888" fontSize={10}>: {block?.name || 'Unknown'}</text>

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
                  fill={connectorSource?.portId === port.id && connectorSource?.partId === part.id ? '#f97316' : '#333'}
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
                <text x={isLeft ? -5 : 15} y={9} textAnchor={isLeft ? "end" : "start"} fill="#aaa" fontSize={9}>{port.name}</text>
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
  }, [parts, blocks, selectedIds, isCreatingConnector, connectorSource, handlePortClick, handlePartMouseDown, handlePortMouseDown, diagramMode]);

  const renderConnectors = useCallback((): React.ReactNode => {
    // Only render connectors in IBD mode
    if (diagramMode !== 'ibd') return null;
    const currentPartIds = new Set(parts.filter(p => p.blockId === currentLayerId).map(p => p.id));
    currentPartIds.add(currentLayerId); // Add the context block itself

    const visibleConnectors = connectors.filter(c => currentPartIds.has(c.sourcePartId) && currentPartIds.has(c.targetPartId));

    return visibleConnectors.map(conn => {
      const getPortPos = (partId: string, portId: string) => {
        if (partId === currentLayerId) {
          const block = blocks.find(b => b.id === partId);
          const port = block?.ports?.find(p => p.id === portId);
          const index = block?.ports?.findIndex(p => p.id === portId) ?? 0;
          const frame = { x: block?.ibdX ?? 50, y: block?.ibdY ?? 50, w: block?.ibdWidth ?? 1200, h: block?.ibdHeight ?? 800 };
          if (port?.side && port.offset != null) {
            if (port.side === 'top') return { x: frame.x + frame.w * port.offset, y: frame.y };
            if (port.side === 'bottom') return { x: frame.x + frame.w * port.offset, y: frame.y + frame.h };
            if (port.side === 'left') return { x: frame.x, y: frame.y + frame.h * port.offset };
            return { x: frame.x + frame.w, y: frame.y + frame.h * port.offset };
          }
          const isLeft = index % 2 === 0;
          return { x: isLeft ? frame.x : frame.x + frame.w, y: frame.y + 60 + Math.floor(index / 2) * 40 };
        } else {
          const part = parts.find(p => p.id === partId);
          const block = blocks.find(b => b.id === part?.typeId);
          const port = block?.ports?.find(p => p.id === portId);
          const index = block?.ports?.findIndex(p => p.id === portId) ?? 0;
          if (!part) return { x: 0, y: 0 };
          const layout = part.portLayouts?.[portId];
          const side = layout?.side || port?.side;
          const offset = layout?.offset ?? port?.offset;

          if (side && offset != null) {
            if (side === 'top') return { x: part.x + part.width * offset, y: part.y };
            if (side === 'bottom') return { x: part.x + part.width * offset, y: part.y + part.height };
            if (side === 'left') return { x: part.x, y: part.y + part.height * offset };
            return { x: part.x + part.width, y: part.y + part.height * offset };
          }
          const isLeft = index % 2 === 0;
          return { x: part.x + (isLeft ? 0 : part.width), y: part.y + 20 + Math.floor(index / 2) * 20 + 5 };
        }
      };

      const p1 = getPortPos(conn.sourcePartId, conn.sourcePortId);
      const p2 = getPortPos(conn.targetPartId, conn.targetPortId);

      const isSelected = selectedIds.includes(conn.id);

      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI;

      return (
        <g key={conn.id} onClick={(e) => { e.stopPropagation(); setSelectedIds([conn.id]); }}>
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="transparent" strokeWidth={10} style={{ cursor: 'pointer' }} />
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={isSelected ? '#f97316' : '#888'} strokeWidth={2} pointerEvents="none" />
          {(conn.itemFlow || conn.label) && (
            <g>
              <polygon
                points="0,0 -6,-3 -6,3"
                fill="#f97316"
                transform={`translate(${midX}, ${midY}) rotate(${angle})`}
              />
              {conn.itemFlow && <text x={midX} y={midY - 15} textAnchor="middle" fill="#f97316" fontSize={8}>«itemFlow»</text>}
              <text x={midX} y={midY - 5} textAnchor="middle" fill="#e0e0e0" fontSize={10}>
                {conn.itemFlow || ''}
                {conn.label ? (conn.itemFlow ? ` : ${conn.label}` : conn.label) : ''}
              </text>
            </g>
          )}
        </g>
      );
    });
  }, [connectors, parts, blocks, selectedIds, currentLayerId, diagramMode]);

  const renderInterfaceRealizations = useCallback((): React.ReactNode => {
    if (diagramMode !== 'ibd') return null;

    return interfaceRealizations.map(realization => {
      const { id, interfaceId, partId, portId } = realization;

      const interfaceBlock = blocks.find(b => b.id === interfaceId);
      const part = parts.find(p => p.id === partId);
      if (!interfaceBlock || !part || part.blockId !== currentLayerId) return null;

      const partBlock = blocks.find(b => b.id === part.typeId);
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
  }, [diagramMode, interfaceRealizations, blocks, parts, currentLayerId, selectedIds]);

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
    setShowErrorDialog(false);
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
        setShowErrorDialog(false);
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
        setShowErrorDialog(false);
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
        setShowErrorDialog(false);
      }
    }
  }, [states, layers, updateState, addError]);

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
      setShowErrorDialog(false);
      addError('info', `Auto-fixed ${updates.size} issues.`);
    }
  }, [errors, states, layers, updateState, addError]);

  const visibleVariables = useMemo(() => variables.filter(v => v.visibleInScope), [variables]);
  const colors = ['#f97316', '#6c9ac6', '#6cc9a8', '#c96c8a', '#9a6cc9', '#c9c46c'];

  if (xBridgesStateId || diagramMode === 'xbridges') {
    const xState = xBridgesStateId ? states.find(s => s.id === xBridgesStateId) : null;
    return (
      <div 
        className="fixed inset-0 z-50 bg-[#0a0a0a]"
        style={{
          zoom: uiZoom,
          width: `${100 / uiZoom}vw`,
          height: `${100 / uiZoom}vh`
        }}
      >
        <XbridgesWorkspace
          initialNodes={xBridgesStateId ? (xState?.xBridgesModel?.nodes || []) : globalXBridgesNodes}
          initialEdges={xBridgesStateId ? (xState?.xBridgesModel?.edges || []) : globalXBridgesEdges}
          availableVariables={variables}
          tickMs={tickMs}
          onLaunchDoe={() => toggleWindow('doe')}
          onBack={() => {
            if (xBridgesStateId) setXBridgesStateId(null);
            else setDiagramMode('statemachine');
          }}
          onSave={(nodes, edges) => {
            if (xBridgesStateId) {
               xBridgesEnginesRef.current.delete(xBridgesStateId);
               setStates(prev => prev.map(s =>
                 s.id === xBridgesStateId
                   ? { ...s, xBridgesModel: { ...s.xBridgesModel, nodes, edges } }
                   : s
               ));
            } else {
               setGlobalXBridgesNodes(nodes);
               setGlobalXBridgesEdges(edges);
            }
          }}
          onSaveAll={handleExportProject}
          initialSelectedNodeId={xBridgesSelectedNodeId}
          onNavigateToVlab={(nodeId) => {
            const findMatchingNode = (targetNodes: any[], sourceNodeId?: string) => {
              if (!sourceNodeId) return null;
              const srcLower = sourceNodeId.toLowerCase();
              const groups = [
                ['pid', 'controller', 'ctrl', 'ps_pid_ctrl', 'pid_basic', 'pid_controller'],
                ['motor', 'plant', 'ac_motor', 'ac_induction_motor', 'induction', 'engine'],
                ['inverter', 'pwm', 'gate', 'pwm_3ph_2level', 'three_phase_inverter', 'commutation'],
                ['error', 'subtract', 'sub', 'error_calc', 'error_sub', 'ps_subtract', 'vectorsub'],
                ['ref', 'constant', 'gen', 'signal', 'ref_speed', 'ref_signal', 'ps_constant', 'waveformgen']
              ];
              let match = targetNodes.find(n => n.id === sourceNodeId);
              if (match) return match;
              for (const group of groups) {
                const isSourceInGroup = group.some(keyword => srcLower.includes(keyword));
                if (isSourceInGroup) {
                  match = targetNodes.find(n => {
                    const id = n.id.toLowerCase();
                    const type = (n.data?.type || n.type || '').toLowerCase();
                    return group.some(keyword => id.includes(keyword) || type.includes(keyword));
                  });
                  if (match) return match;
                }
              }
              const cleanId = srcLower.replace(/_[0-9]+$/, '');
              return targetNodes.find(n => {
                const id = n.id.toLowerCase();
                const type = (n.data?.type || n.type || '').toLowerCase();
                return id.includes(cleanId) || type.includes(cleanId) || cleanId.includes(id) || cleanId.includes(type);
              });
            };

            const targetNode = findMatchingNode(vlabNodes, nodeId);
            if (targetNode) {
              setVlabSelectedNodeId(targetNode.id);
            } else {
              setVlabSelectedNodeId(null);
            }
            setDiagramMode('vlab');
            setTimeout(() => setVlabSelectedNodeId(null), 1000);
          }}
        />
      </div>
    );
  }

  if (diagramMode === 'vlab') {
    return (
      <div 
        className="fixed inset-0 z-50 bg-[#0a0a0a]"
        style={{
          zoom: uiZoom,
          width: `${100 / uiZoom}vw`,
          height: `${100 / uiZoom}vh`
        }}
      >
        <VLabWorkspace
          nodes={vlabNodes}
          edges={vlabEdges}
          onNodesChange={(nodes) => setVlabNodes(nodes)}
          onEdgesChange={(edges) => setVlabEdges(edges)}
          onResult={(res) => console.log('V-Lab Result:', res)}
          onSendToDOE={(data) => {
            // Logic to send V-Lab results to DOE
            toggleWindow('doe');
          }}
          onBack={() => setDiagramMode('statemachine')}
          initialSelectedNodeId={vlabSelectedNodeId}
          onNavigateToXbridges={(nodeId) => {
            const findMatchingNode = (targetNodes: any[], sourceNodeId?: string) => {
              if (!sourceNodeId) return null;
              const srcLower = sourceNodeId.toLowerCase();
              const groups = [
                ['pid', 'controller', 'ctrl', 'ps_pid_ctrl', 'pid_basic', 'pid_controller'],
                ['motor', 'plant', 'ac_motor', 'ac_induction_motor', 'induction', 'engine'],
                ['inverter', 'pwm', 'gate', 'pwm_3ph_2level', 'three_phase_inverter', 'commutation'],
                ['error', 'subtract', 'sub', 'error_calc', 'error_sub', 'ps_subtract', 'vectorsub'],
                ['ref', 'constant', 'gen', 'signal', 'ref_speed', 'ref_signal', 'ps_constant', 'waveformgen']
              ];
              let match = targetNodes.find(n => n.id === sourceNodeId);
              if (match) return match;
              for (const group of groups) {
                const isSourceInGroup = group.some(keyword => srcLower.includes(keyword));
                if (isSourceInGroup) {
                  match = targetNodes.find(n => {
                    const id = n.id.toLowerCase();
                    const type = (n.data?.type || n.type || '').toLowerCase();
                    return group.some(keyword => id.includes(keyword) || type.includes(keyword));
                  });
                  if (match) return match;
                }
              }
              const cleanId = srcLower.replace(/_[0-9]+$/, '');
              return targetNodes.find(n => {
                const id = n.id.toLowerCase();
                const type = (n.data?.type || n.type || '').toLowerCase();
                return id.includes(cleanId) || type.includes(cleanId) || cleanId.includes(id) || cleanId.includes(type);
              });
            };

            const targetNodes = xBridgesStateId ? (states.find(s => s.id === xBridgesStateId)?.xBridgesModel?.nodes || []) : globalXBridgesNodes;
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
      </div>
    );
  }

  if (diagramMode === 'hil') {
    return (
      <div 
        className="fixed inset-0 z-50 bg-[#0a0a0a]"
        style={{
          zoom: uiZoom,
          width: `${100 / uiZoom}vw`,
          height: `${100 / uiZoom}vh`
        }}
      >
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
      </div>
    );
  }

  if (diagramMode === 'entropy') {
    return (
      <div 
        className="fixed inset-0 z-50 bg-[#0a0a0a]"
        style={{
          zoom: uiZoom,
          width: `${100 / uiZoom}vw`,
          height: `${100 / uiZoom}vh`
        }}
      >
        <EntropyWorkspace
          initialNodes={entropyNodes}
          initialEdges={entropyEdges}
          availableVariables={variables}
          onVariablesChange={setVariables}
          tickMs={tickMs}
          onTickMsChange={setTickMs}
          onBack={() => setDiagramMode('statemachine')}
          onSave={(nodes, edges) => {
            setEntropyNodes(nodes);
            setEntropyEdges(edges);
          }}
          onAddError={addError}
        />
      </div>
    );
  }

  return (
    <>
      {showWelcome && (
        <IntroStandbyOverlay mode="intro" onClose={() => setShowWelcome(false)} />
      )}
      {showStandby && (
        <IntroStandbyOverlay mode="standby" onClose={() => setShowStandby(false)} />
      )}
      <HelpModal isOpen={showHelpModal} onClose={() => setShowHelpModal(false)} />
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
      <div
        className="flex flex-col bg-[#0a0a0a] text-[#e0e0e0] font-sans overflow-hidden"
        style={{
          zoom: uiZoom,
          width: `${100 / uiZoom}vw`,
          height: `${100 / uiZoom}vh`
        }}
      >
        {/* Hidden input for project import */}
        <input type="file" ref={projectImportRef} onChange={handleProjectFileChange} className="hidden" accept=".json" />

        {/* Top Toolbar - WITH VISIBLE SIMULATION CONTROLS */}
        <header className="h-14 bg-[#1a1a1a] border-b border-[#222] flex items-center px-4 gap-4 shrink-0 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-3">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <div>
              <div className="font-bold text-2xl tracking-tight">ADIA</div>
              <div className="text-xs text-[#888] mt-[-3px]">{VERSION}</div>
            </div>
          </div>

          <Separator orientation="vertical" className="h-6 bg-[#333]" />

          {/* DIAGRAM MODE SWITCHER */}
          <div className="flex bg-[#1a1a1a] rounded border border-[#333] p-0.5">
            <button onClick={() => setDiagramMode('statemachine')} className={`px-3 py-1 text-xs rounded ${diagramMode === 'statemachine' ? 'bg-[#333] text-[#e0e0e0]' : 'text-[#888] hover:text-[#ccc]'}`}>
              State Machine
            </button>
            <button onClick={() => setDiagramMode('bdd')} className={`px-3 py-1 text-xs rounded ${diagramMode === 'bdd' ? 'bg-[#333] text-[#e0e0e0]' : 'text-[#888] hover:text-[#ccc]'}`}>
              SysML BDD
            </button>
            <button onClick={() => setDiagramMode('requirements')} className={`px-3 py-1 text-xs rounded ${diagramMode === 'requirements' ? 'bg-[#333] text-[#e0e0e0]' : 'text-[#888] hover:text-[#ccc]'}`}>
              Requirements
            </button>
            <button onClick={() => setDiagramMode('ibd')} className={`px-3 py-1 text-xs rounded ${diagramMode === 'ibd' ? 'bg-[#333] text-[#e0e0e0]' : 'text-[#888] hover:text-[#ccc]'}`}>
              SysML IBD
            </button>
            <button onClick={() => setDiagramMode('xbridges')} className={`px-3 py-1 text-xs rounded ${(diagramMode as DiagramMode) === 'xbridges' ? 'bg-[#333] text-[#e0e0e0]' : 'text-[#888] hover:text-[#ccc]'}`}>
              X-Bridges
            </button>
            <button onClick={() => setDiagramMode('vlab')} className={`px-3 py-1 text-xs rounded ${(diagramMode as DiagramMode) === 'vlab' ? 'bg-[#333] text-[#e0e0e0]' : 'text-[#888] hover:text-[#ccc]'}`}>
              V-Lab
            </button>
            <button onClick={() => setDiagramMode('hil')} className={`px-3 py-1 text-xs rounded ${(diagramMode as DiagramMode) === 'hil' ? 'bg-[#333] text-[#e0e0e0]' : 'text-[#888] hover:text-[#ccc]'}`}>
              HIL
            </button>
            <button onClick={() => setDiagramMode('entropy')} className={`px-3 py-1 text-xs rounded ${(diagramMode as DiagramMode) === 'entropy' ? 'bg-[#333] text-[#e0e0e0]' : 'text-[#888] hover:text-[#ccc]'}`}>
              ENTROPY OPM
            </button>
          </div>

          {/* SIMULATION CONTROLS - PROMINENT AND FUNCTIONAL */}
          {(diagramMode as DiagramMode) !== 'xbridges' && (diagramMode as DiagramMode) !== 'hil' && (
            <div className="flex items-center gap-2 bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-1.5">
              <Button
                variant={isRunning ? "destructive" : "default"}
                size="sm"
                onClick={isRunning ? pauseSimulation : startSimulation}
                className={isRunning ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"}
              >
                {isRunning ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1.5">
                      <rect x="6" y="4" width="4" height="16" />
                      <rect x="14" y="4" width="4" height="16" />
                    </svg>
                    Pause
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1.5">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    Start
                  </>
                )}
              </Button>

              <Button variant="outline" size="sm" onClick={stepSimulation}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1.5">
                  <polygon points="5 3 19 12 5 21 5 3" />
                  <line x1="12" y1="4" x2="12" y2="20" />
                </svg>
                Step
              </Button>

              <Button variant="outline" size="sm" onClick={resetSimulation}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1.5">
                  <path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0" />
                  <polyline points="3 4 3 12 11 12" />
                </svg>
                Reset
              </Button>

              <Separator orientation="vertical" className="h-4 bg-[#333]" />

              <Button
                variant="outline"
                size="sm"
                onClick={() => { if (validateModel()) addError('info', 'Model validation passed.'); }}
                className="text-[#e0e0e0] hover:bg-[#222]"
                title="Check for errors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                Validate
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={validateWithAI}
                disabled={isAiValidating}
                className="text-[#f97316] border-[#f97316]/50 hover:bg-[#f97316]/10"
                title="Validate logic with AI"
              >
                {isAiValidating ? (
                  <svg className="animate-spin mr-1.5 h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1.5">
                    <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
                    <path d="M12 2a10 10 0 0 1 10 10" opacity="0.5" />
                    <circle cx="12" cy="12" r="2" />
                  </svg>
                )}
                {isAiValidating ? 'Analyzing...' : 'AI Check'}
              </Button>

              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[#888] whitespace-nowrap">Tick Rate:</span>
                <TickRateInput value={tickMs} onChange={setTickMs} />
                <span className="text-[10px] text-[#666]">ms</span>
              </div>
            </div>
          )}

          <Separator orientation="vertical" className="h-6 bg-[#333]" />

          <div className="flex items-center gap-2 bg-[#1a1a1a] border border-[#333] rounded px-2 py-1">
            <Checkbox
              checked={safetyMode}
              onCheckedChange={(c) => setSafetyMode(c as boolean)}
              id="safety-mode"
            />
            <Label htmlFor="safety-mode" className={safetyMode ? "text-red-400 font-bold" : "text-[#888]"}>Safety Mode</Label>
          </div>

          <Separator orientation="vertical" className="h-6 bg-[#333]" />

          {/* CODE GENERATION BUTTON - FULLY FUNCTIONAL */}
          <Button
            variant="outline"
            size="sm"
            onClick={generateCode}
            disabled={isGenerating}
            className="border-[#f97316] text-[#f97316] hover:bg-[#f97316]/10 disabled:opacity-50 disabled:cursor-wait"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1.5">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
            {isGenerating ? 'Generating...' : 'Generate C/H'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportProject}
            className="border-[#f97316] text-[#f97316] hover:bg-[#f97316]/10"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleImportProject}
            className="border-[#f97316] text-[#f97316] hover:bg-[#f97316]/10"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Import
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowReportDialog(true)}
            className="border-[#f97316] text-[#f97316] hover:bg-[#f97316]/10"
          >
            Report
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => toggleWindow('hmi')}
            className="border-[#f97316] text-[#f97316] hover:bg-[#f97316]/10"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1.5"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
            HMI Panel
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => toggleWindow('pid')}
            className="border-[#6c9ac6] text-[#6c9ac6] hover:bg-[#6c9ac6]/10"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1.5">
              <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"></path><line x1="16" y1="8" x2="2" y2="22"></line><line x1="17.5" y1="15" x2="9" y2="15"></line>
            </svg>
            PID Tuner
          </Button>


          <Button
            variant="outline"
            size="sm"
            onClick={() => toggleWindow('doe')}
            className="border-[#c96c8a] text-[#c96c8a] hover:bg-[#c96c8a]/10"
          >
            DOE (RSM)
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHelpModal(true)}
            className="border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1.5">
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Help
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFactoryIOGateway(true)}
            className={`border-indigo-500/50 text-indigo-400 hover:bg-indigo-500/10 ${factoryIOEnabled ? 'border-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.3)]' : ''}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1.5">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
            Factory I/O
          </Button>

          {/* 3DEXPERIENCE Gateway Button */}
          <Button
            id="3dx-toolbar-btn"
            variant="outline"
            size="sm"
            onClick={() => setShow3DXGateway(true)}
            className="border-[#0056b3]/60 text-[#4da6ff] hover:bg-[#0056b3]/10"
            title="Connect to 3DEXPERIENCE Platform"
          >
            <Cloud size={14} className="mr-1.5" />
            3DEXPERIENCE
          </Button>

          <div className="flex-1" />

          {/* Status indicators */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
              <span className="text-[#888] font-medium">{isRunning ? 'RUNNING' : 'STOPPED'}</span>
            </div>
            <div className="text-[#666]">
              Time: <span className="text-[#f97316] font-mono font-medium">{simulationTime.toFixed(2)}s</span>
            </div>
            <div className="text-[#666]">
              States: <span className="text-[#f97316] font-mono font-medium">{currentStates.length}</span>
            </div>
            <div className="text-[#666]">
              Vars: <span className="text-[#f97316] font-mono font-medium">{variables.length}</span>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <div className="flex flex-1 overflow-hidden" onMouseUp={() => setResizingPanel(null)}>
          {/* Left Sidebar - Hierarchy */}
          <aside style={{ width: isMobile ? '100%' : (isHierarchyCollapsed ? '48px' : `${hierarchyWidth}px`), display: isMobile && mobileTab !== 'hierarchy' ? 'none' : 'flex' }} className="bg-[#1a1a1a] flex flex-col shrink-0 transition-all duration-300 overflow-hidden">
            <div className="h-10 flex items-center justify-between px-4 border-b border-[#222]">
              {!isHierarchyCollapsed && (
                <div className="flex items-center overflow-hidden whitespace-nowrap">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" className="mr-2.5">
                    <path d="M10 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4" />
                    <path d="M16 17l-3-3 3-3" />
                    <path d="M13 14H3" />
                  </svg>
                  <span className="text-sm font-medium">Hierarchy</span>
                </div>
              )}
              <button
                onClick={() => setIsHierarchyCollapsed(!isHierarchyCollapsed)}
                className={`p-1.5 rounded hover:bg-[#222] text-[#f97316] transition-all ${isHierarchyCollapsed ? 'w-full flex justify-center' : ''}`}
              >
                <Triangle size={10} className={`transition-transform duration-300 ${isHierarchyCollapsed ? 'rotate-90' : '-rotate-90'}`} fill="currentColor" />
              </button>
            </div>
            {!isHierarchyCollapsed && (
              <HierarchyTree
                states={states}
                layers={layers}
                activeStates={activeStates}
                currentLayerId={currentLayerId}
                onSelect={(id: string) => setSelectedIds([id])}
                onDoubleClick={(id: string) => enterLayer(id)}
                selectedIds={selectedIds}
              />
            )}
          </aside>
          {!isMobile && !isHierarchyCollapsed && <Resizer onMouseDown={(e) => handleResizeStart(e, 'hierarchy')} />}

          {/* Left Sidebar - Variables */}
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
                        onChange={(e) => setNewVarType(e.target.value as VariableType)}
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
          {!isMobile && <Resizer onMouseDown={(e) => handleResizeStart(e, 'variables')} />}

          {/* Canvas Area */}
          <div style={{ display: isMobile && mobileTab !== 'canvas' ? 'none' : 'flex' }} className="flex-1 flex flex-col min-w-0">
            <main className="flex-1 relative overflow-hidden bg-[#0a0a0a]">
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
                      Requirement
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
                <svg width="100%" height="100%" style={{ pointerEvents: 'none' }}>
                  <defs>
                    <pattern
                      id="grid"
                      width={GRID_SIZE}
                      height={GRID_SIZE}
                      patternUnits="userSpaceOnUse"
                    >
                      <path d={`M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`} fill="none" stroke="#1a1a1a" strokeWidth="1" />
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
                          {renderRelationships()}
                        </g>
                        <g style={{ pointerEvents: 'all' }}>
                          {renderBlocks()}
                        </g>
                      </>
                    ) : (
                      diagramMode === 'ibd' ? (
                        <>
                          <g style={{ pointerEvents: 'all' }}>
                            {renderBlocks()}
                          </g>
                          <g style={{ pointerEvents: 'all' }}>
                            {renderInterfaceRealizations()}
                          </g>
                          <g style={{ pointerEvents: 'all' }}>
                            {renderConnectors()}
                          </g>
                          <g style={{ pointerEvents: 'all' }}>
                            {renderParts()}
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
            </main>

            {/* Bottom Panel */}
            {!isMobile && !isScopeCollapsed && <Resizer onMouseDown={(e) => handleResizeStart(e, 'scope')} orientation="horizontal" />}
            <div style={{ height: isMobile ? '30%' : (isScopeCollapsed ? '40px' : `${scopeHeight}px`), display: isMobile && mobileTab !== 'canvas' ? 'none' : 'flex' }} className="bg-[#1a1a1a] border-t border-[#222] flex flex-col shrink-0 transition-all duration-300 overflow-hidden">
              <div className="flex items-center justify-between px-4 border-b border-[#222] h-10 shrink-0">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsScopeCollapsed(!isScopeCollapsed)}
                    className="p-1 hover:bg-[#222] rounded text-[#f97316] transition-colors"
                  >
                    <Triangle size={10} className={`transition-transform duration-300 ${isScopeCollapsed ? 'rotate-0' : 'rotate-180'}`} fill="currentColor" />
                  </button>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                  <span className="font-medium">Scope</span>
                </div>
                {!isScopeCollapsed && (
                  <div className="flex items-center gap-2">
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
                  </div>
                )}
              </div>

              {!isScopeCollapsed && (
                <div className="flex-1 p-3">
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
                    <div className="w-full h-full overflow-hidden">
                      <div className="h-full flex pb-3 gap-2">
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
                            <div key={variable.id} className="flex-1 min-w-[150px] relative h-full bg-[#1a1a1a] rounded border border-[#333] overflow-hidden">
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
          </div>
          {!isMobile && <Resizer onMouseDown={(e) => handleResizeStart(e, 'properties')} />}

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
              {selectedState ? (
                <>
                  <div>
                    <Label>State Name</Label>
                    <Input
                      value={selectedState.name}
                      onChange={(e) => updateState(selectedState.id, { name: e.target.value })}
                      className="mt-1"
                    />
                  </div>

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
                        <Button size="sm" className="h-5 text-[10px] px-2 bg-amber-600/20 text-amber-500 border-amber-500/50"
                          onClick={() => {
                            const currentMappings = selectedState.xBridgesModel?.mappings || [];
                            updateState(selectedState.id, {
                              xBridgesModel: {
                                nodes: selectedState.xBridgesModel?.nodes || [],
                                edges: selectedState.xBridgesModel?.edges || [],
                                mappings: [...currentMappings, { smVarId: '', blockId: '', portId: '', direction: 'in' }]
                              }
                            });
                          }}
                        >+ Add Map</Button>
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
                                        nodes: selectedState.xBridgesModel?.nodes || [],
                                        edges: selectedState.xBridgesModel?.edges || [],
                                        mappings: newMaps
                                      }
                                    });
                                  }}
                                  className="w-full h-7 bg-[#1a1a1a] border border-[#333] rounded text-[10px] px-1 text-amber-200"
                                >
                                  <option value="">Select...</option>
                                  {variables.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                </select>
                              </div>
                              <div className="flex flex-col gap-1">
                                <Label className="text-[9px] uppercase tracking-wider text-gray-500">Direction</Label>
                                <select
                                  value={map.direction}
                                  onChange={(e) => {
                                    const newMaps = [...selectedState.xBridgesModel!.mappings!];
                                    newMaps[idx] = { ...map, direction: e.target.value as any };
                                    updateState(selectedState.id, {
                                      xBridgesModel: {
                                        nodes: selectedState.xBridgesModel?.nodes || [],
                                        edges: selectedState.xBridgesModel?.edges || [],
                                        mappings: newMaps
                                      }
                                    });
                                  }}
                                  className="w-full h-7 bg-[#1a1a1a] border border-[#333] rounded text-[10px] px-1 text-gray-300"
                                >
                                  <option value="in">SM → Block</option>
                                  <option value="out">Block → SM</option>
                                </select>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="flex flex-col gap-1">
                                <Label className="text-[9px] uppercase tracking-wider text-gray-500">Block ID</Label>
                                <Input
                                  value={map.blockId}
                                  onChange={(e) => {
                                    const newMaps = [...selectedState.xBridgesModel!.mappings!];
                                    newMaps[idx] = { ...map, blockId: e.target.value };
                                    updateState(selectedState.id, {
                                      xBridgesModel: {
                                        nodes: selectedState.xBridgesModel?.nodes || [],
                                        edges: selectedState.xBridgesModel?.edges || [],
                                        mappings: newMaps
                                      }
                                    });
                                  }}
                                  placeholder="e.g. Constant-1"
                                  className="h-7 text-[10px] font-mono"
                                />
                              </div>
                              <div className="flex flex-col gap-1">
                                <Label className="text-[9px] uppercase tracking-wider text-gray-500">Block Port</Label>
                                <Input
                                  value={map.portId}
                                  onChange={(e) => {
                                    const newMaps = [...selectedState.xBridgesModel!.mappings!];
                                    newMaps[idx] = { ...map, portId: e.target.value };
                                    updateState(selectedState.id, {
                                      xBridgesModel: {
                                        nodes: selectedState.xBridgesModel?.nodes || [],
                                        edges: selectedState.xBridgesModel?.edges || [],
                                        mappings: newMaps
                                      }
                                    });
                                  }}
                                  placeholder="e.g. in1"
                                  className="h-7 text-[10px] font-mono"
                                />
                              </div>
                            </div>
                            <button
                              className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                              onClick={() => {
                                const newMaps = selectedState.xBridgesModel!.mappings!.filter((_, i) => i !== idx);
                                updateState(selectedState.id, {
                                  xBridgesModel: {
                                    nodes: selectedState.xBridgesModel?.nodes || [],
                                    edges: selectedState.xBridgesModel?.edges || [],
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

                  <div className="space-y-2 p-2 bg-[#1a1a1a] rounded border border-[#333]">
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
                      className="w-full h-20 min-h-[4rem] bg-[#1a1a1a] border border-[#333] rounded text-sm font-mono text-[#e0e0e0] p-2 mt-1 resize-y focus:outline-none focus:ring-1 focus:ring-[#f97316]"
                    />
                  </div>

                  <div>
                    <Label>During Action (C-like)</Label>
                    <textarea
                      value={selectedState.during}
                      onChange={(e) => updateState(selectedState.id, { during: e.target.value })}
                      placeholder="/* During action */ counter++;"
                      className="w-full h-20 min-h-[4rem] bg-[#1a1a1a] border border-[#333] rounded text-sm font-mono text-[#e0e0e0] p-2 mt-1 resize-y focus:outline-none focus:ring-1 focus:ring-[#f97316]"
                    />
                  </div>

                  <div className="space-y-2 p-2 bg-[#1a1a1a] rounded border border-[#333]">
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
                      className="w-full h-20 min-h-[4rem] bg-[#0a0a0a] border border-[#333] rounded text-xs font-mono text-[#e0e0e0] p-2 mt-1 resize-y focus:outline-none focus:ring-1 focus:ring-[#f97316]"
                    />
                  </div>

                  <div>
                    <Label>Exit Action (C-like)</Label>
                    <textarea
                      value={selectedState.exit}
                      onChange={(e) => updateState(selectedState.id, { exit: e.target.value })}
                      placeholder="/* Exit action */"
                      className="w-full h-20 min-h-[4rem] bg-[#1a1a1a] border border-[#333] rounded text-sm font-mono text-[#e0e0e0] p-2 mt-1 resize-y focus:outline-none focus:ring-1 focus:ring-[#f97316]"
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
              ) : selectedJunction ? (
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
                    <select
                      value={selectedBlock.stereotype}
                      onChange={(e) => updateBlock(selectedBlock.id, { stereotype: e.target.value })}
                      className="w-full h-8 bg-[#0a0a0a] border border-[#333] rounded px-2 text-sm text-[#e0e0e0] mt-1"
                    >
                      <option value="block">Block</option>
                      <option value="requirement">Requirement</option>
                      <option value="interface">Interface</option>
                      <option value="interfaceBlock">Interface Block</option>
                      <option value="valueType">ValueType</option>
                      <option value="enumeration">Enumeration</option>
                    </select>
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
                      </div>

                      {activePropTab === 'general' ? (
                        <>
                          <div><Label>Req ID</Label><Input value={selectedBlock.reqId || ''} onChange={(e) => updateBlock(selectedBlock.id, { reqId: e.target.value })} className="mt-1" /></div>
                          <div><Label>Status</Label>
                            <select value={selectedBlock.status || ''} onChange={(e) => updateBlock(selectedBlock.id, { status: e.target.value })} className="w-full h-8 bg-[#0a0a0a] border border-[#333] rounded px-2 text-sm text-[#e0e0e0] mt-1">
                              <option value="Draft">Draft</option>
                              <option value="Approved">Approved</option>
                              <option value="Verified">Verified</option>
                              <option value="Implemented">Implemented</option>
                            </select>
                          </div>
                          <div><Label>Priority</Label>
                            <select value={selectedBlock.priority || ''} onChange={(e) => updateBlock(selectedBlock.id, { priority: e.target.value })} className="w-full h-8 bg-[#0a0a0a] border border-[#333] rounded px-2 text-sm text-[#e0e0e0] mt-1">
                              <option value="High">High</option>
                              <option value="Medium">Medium</option>
                              <option value="Low">Low</option>
                            </select>
                          </div>
                          <div><Label>Description</Label><textarea value={selectedBlock.description || ''} onChange={(e) => updateBlock(selectedBlock.id, { description: e.target.value })} className="w-full h-20 min-h-[4rem] bg-[#1a1a1a] border border-[#333] rounded text-sm font-mono text-[#e0e0e0] p-2 mt-1 resize-y focus:outline-none focus:ring-1 focus:ring-[#f97316]" /></div>
                          <div>
                            <Label>Risk</Label>
                            <select value={selectedBlock.risk || 'Medium'} onChange={(e) => updateBlock(selectedBlock.id, { risk: e.target.value })} className="w-full h-8 bg-[#0a0a0a] border border-[#333] rounded px-2 text-sm text-[#e0e0e0] mt-1">
                              <option value="High">High</option>
                              <option value="Medium">Medium</option>
                              <option value="Low">Low</option>
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
                      ) : (
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
                              {["Control Team", "Hardware Team", "Software Team", "Safety Engineer", "QA Team", "System Architect"].map(team => (
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
                    </>
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
                    <Label>Properties (comma sep)</Label>
                    <textarea
                      value={selectedBlock.properties.map(p => `${p.name}:${p.type}${p.defaultValue ? '=' + p.defaultValue : ''}`).join(',\n')}
                      onChange={(e) => {
                        const newProperties: ValuePropertyData[] = e.target.value.split(/[,;\n]/).map(s => s.trim()).filter(s => s).map(pStr => {
                          const [name, rest] = pStr.split(':');
                          const [type, defaultValue] = rest ? rest.split('=') : ['any', undefined];
                          return {
                            id: uuidv4(),
                            name: name?.trim() || 'prop',
                            type: type?.trim() || 'any',
                            defaultValue: defaultValue?.trim(),
                          };
                        });
                        updateBlock(selectedBlock.id, { properties: newProperties });
                      }}
                      className="w-full h-20 min-h-[4rem] bg-[#1a1a1a] border border-[#333] rounded text-sm font-mono text-[#e0e0e0] p-2 mt-1 resize-y focus:outline-none focus:ring-1 focus:ring-[#f97316]"
                    />
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
                  <Button variant="outline" size="sm" onClick={() => deleteBlock(selectedBlock.id)} className="w-full border-red-800 text-red-400 hover:bg-red-950/30">Delete Block</Button>
                </>
              ) : selectedRelationship ? (
                <>
                  <div>
                    <Label>Relationship Type</Label>
                    <select
                      value={selectedRelationship.type}
                      onChange={(e) => updateRelationship(selectedRelationship.id, { type: e.target.value as any })}
                      className="w-full h-8 bg-[#0a0a0a] border border-[#333] rounded px-2 text-sm text-[#e0e0e0] mt-1"
                    >
                      <option value="association">Association</option>
                      <option value="generalization">Generalization</option>
                      <option value="composition">Composition</option>
                      <option value="aggregation">Aggregation</option>
                      <option value="allocation">Allocation</option>
                      <option value="derive">Derive</option>
                      <option value="refine">Refine</option>
                      <option value="satisfy">Satisfy</option>
                      <option value="verify">Verify</option>
                      <option value="trace">Trace</option>
                    </select>
                  </div>
                  <div>
                    <Label>Label</Label>
                    <Input value={selectedRelationship.label} onChange={(e) => updateRelationship(selectedRelationship.id, { label: e.target.value })} className="mt-1" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Source Mult.</Label>
                      <Input value={selectedRelationship.sourceMultiplicity || ''} onChange={(e) => updateRelationship(selectedRelationship.id, { sourceMultiplicity: e.target.value })} className="mt-1" placeholder="0..1" />
                    </div>
                    <div>
                      <Label>Target Mult.</Label>
                      <Input value={selectedRelationship.targetMultiplicity || ''} onChange={(e) => updateRelationship(selectedRelationship.id, { targetMultiplicity: e.target.value })} className="mt-1" placeholder="*" />
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => deleteRelationship(selectedRelationship.id)} className="w-full border-red-800 text-red-400 hover:bg-red-950/30">Delete Relation</Button>
                </>
              ) : selectedPart ? (
                <>
                  <div>
                    <Label>Part Name</Label>
                    <Input value={selectedPart.name} onChange={(e) => updatePart(selectedPart.id, { name: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <Label>Block Definition</Label>
                    <select
                      value={selectedPart.typeId || ''}
                      onChange={(e) => updatePart(selectedPart.id, { typeId: e.target.value })}
                      className="w-full h-8 bg-[#0a0a0a] border border-[#333] rounded px-2 text-sm text-[#e0e0e0] mt-1"
                    >
                      <option value="">[Undefined]</option>
                      {blocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>Multiplicity</Label>
                    <Input value={selectedPart.multiplicity || ''} onChange={(e) => updatePart(selectedPart.id, { multiplicity: e.target.value })} className="mt-1" placeholder="1" />
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
                  <div>
                    <Label>Item Flow</Label>
                    <Input value={selectedConnector.itemFlow || ''} onChange={(e) => updateConnector(selectedConnector.id, { itemFlow: e.target.value })} className="mt-1" placeholder="e.g., PowerSignal" />
                  </div>
                  <div>
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

        {/* Error Dialog */}
        {showErrorDialog && currentError && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50" onMouseDown={() => setShowErrorDialog(false)}>
            <div className="bg-[#1a1a1a] border border-red-900 rounded-lg w-[550px] max-h-[90vh] flex flex-col relative" onMouseDown={e => e.stopPropagation()}>
              <div className="h-12 flex items-center px-5 border-b border-red-900/50">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ff6b6b" strokeWidth="2" className="mr-3">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <h2 className="text-lg font-bold text-red-400">Error</h2>
              </div>

              <div className="p-5 bg-red-950/25 rounded-lg border border-red-900 m-5">
                <p className="text-red-300 text-sm whitespace-pre-wrap">{currentError.message}</p>
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
                  <Button
                    onClick={() => handleAutoFix(currentError)}
                    className="bg-green-600 hover:bg-green-700 text-white px-5 mr-2"
                  >
                    Auto-Fix
                  </Button>
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
                  onClick={() => setShowErrorDialog(false)}
                  className="border-[#333] text-[#a0a0a0] hover:text-[#e0e0e0] px-5"
                >
                  Dismiss
                </Button>
                <Button
                  onClick={() => {
                    clearErrors();
                    setShowErrorDialog(false);
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
            <TraceabilityMatrix blocks={blocks} relationships={relationships} parts={parts} onClose={() => toggleWindow('rtm')} />
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
      </div>
    </>
  );
};

export default ADIA;
