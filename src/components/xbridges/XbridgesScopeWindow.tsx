// src/components/xbridges/XbridgesScopeWindow.tsx
import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Download, Maximize2, Activity, BarChart2, Info, Settings2 } from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from 'recharts';

const WAYPOINTS = [
  { x: -2.2, y: -2.2 },
  { x: -2.2, y: 2.2 },
  { x: -1.4, y: 2.2 },
  { x: -1.4, y: -2.2 },
  { x: -0.6, y: -2.2 },
  { x: -0.6, y: 2.2 },
  { x: 0.2, y: 2.2 },
  { x: 0.2, y: -2.2 },
  { x: 1.0, y: -2.2 },
  { x: 1.0, y: 2.2 },
  { x: 1.8, y: 2.2 },
  { x: 1.8, y: -2.2 },
  { x: 2.5, y: -2.2 },
  { x: 2.5, y: 2.2 }
];

// Room A (Corridor) + Room B (Living) + Room C (Bedroom) + Room D (Kitchen)
const MATLAB_WAYPOINTS = [
  // Room A – Corridor (x∈[-6,2], y∈[-6,2])
  { x: -5.6, y: -5.6 }, { x: -5.6, y:  1.6 },
  { x: -4.9, y:  1.6 }, { x: -4.9, y: -5.6 },
  { x: -4.2, y: -5.6 }, { x: -4.2, y:  1.6 },
  { x: -3.5, y:  1.6 }, { x: -3.5, y: -5.6 },
  { x: -2.8, y: -5.6 }, { x: -2.8, y: -3.4 },
  { x: -2.1, y: -3.4 }, { x: -2.1, y: -5.6 },
  { x: -1.4, y: -5.6 }, { x: -1.4, y: -3.4 },
  { x: -0.7, y: -3.4 }, { x: -0.7, y: -5.6 },
  { x: -2.8, y:  1.6 }, { x: -2.8, y: -2.6 },
  { x: -2.1, y: -2.6 }, { x: -2.1, y:  1.6 },
  { x: -1.4, y:  1.6 }, { x: -1.4, y: -2.6 },
  { x: -0.7, y: -2.6 }, { x: -0.7, y:  1.6 },
  { x:  0.0, y:  1.6 }, { x:  0.0, y: -2.6 },
  { x:  0.7, y: -2.6 }, { x:  0.7, y:  1.6 },
  { x:  1.4, y:  1.6 }, { x:  1.4, y: -5.6 },
  // Room B – Living Room (x∈[-6,-2], y∈[2,6])
  { x: -5.6, y: 2.5 }, { x: -5.6, y: 5.6 },
  { x: -4.9, y: 5.6 }, { x: -4.9, y: 2.5 },
  { x: -4.2, y: 2.5 }, { x: -4.2, y: 5.6 },
  { x: -3.5, y: 5.6 }, { x: -3.5, y: 2.5 },
  { x: -2.8, y: 2.5 }, { x: -2.8, y: 5.6 },
  { x: -2.1, y: 5.6 }, { x: -2.1, y: 2.5 },
  // Room C – Bedroom (x∈[2,6], y∈[-2,6])
  { x: 2.4, y: -1.6 }, { x: 2.4, y:  5.6 },
  { x: 3.1, y:  5.6 }, { x: 3.1, y: -1.6 },
  { x: 3.8, y: -1.6 }, { x: 3.8, y:  5.6 },
  { x: 4.5, y:  5.6 }, { x: 4.5, y: -1.6 },
  { x: 5.2, y: -1.6 }, { x: 5.2, y:  5.6 },
  // Room D – Kitchen (x∈[2,6], y∈[-6,-2])
  { x: 2.4, y: -5.6 }, { x: 2.4, y: -2.5 },
  { x: 3.1, y: -2.5 }, { x: 3.1, y: -5.6 },
  { x: 3.8, y: -5.6 }, { x: 3.8, y: -2.5 },
  { x: 4.5, y: -2.5 }, { x: 4.5, y: -5.6 },
  { x: 5.2, y: -5.6 }, { x: 5.2, y: -2.5 },
];

interface ScopeWindowProps {
  block: any;
  onUpdate?: (data: any) => void;
  onClose: () => void;
}

export const XbridgesScopeWindow: React.FC<ScopeWindowProps> = ({ block, onUpdate, onClose }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const isRobotTwin = ['ROBOT_VACUUM_DIGITAL_TWIN', 'ROBOT_VACUUM_DYNAMICS', 'ROBOT_VACUUM_ENVIRONMENT', 'ROBOT_VACUUM_3D_SCENE_VIEW'].includes(block.type);
  const history = block.state?.history || [];
  const numSignals = block.params?.numSignals || 1;
  const timeRange = block.params?.timeRange || 'auto';
  const showGrid = block.params?.showGrid !== false;
  const showLegend = block.params?.showLegend !== false;

  const displayData = React.useMemo(() => {
    if (timeRange === 'auto' || history.length === 0) return history;
    const limit = Number(timeRange);
    if (isNaN(limit)) return history;
    const maxTime = history[history.length - 1].t;
    return history.filter((pt: any) => pt.t >= maxTime - limit);
  }, [history, timeRange]);

  const [showSettings, setShowSettings] = React.useState(false);

  // 3D View configuration state
  const [viewMode, setViewMode] = React.useState<'3d' | '2d'>(block.type === 'ROBOT_VACUUM_3D_SCENE_VIEW' ? '3d' : '2d');
  const [trackRobot, setTrackRobot] = React.useState(true);
  const [showLidar, setShowLidar] = React.useState(true);
  const [showSlam, setShowSlam] = React.useState(true);
  const [redrawTrigger, setRedrawTrigger] = React.useState(0);

  const yawRef = React.useRef(-0.78);
  const pitchRef = React.useRef(0.6);
  const zoomRef = React.useRef(8.0);
  const dragStartRef = React.useRef<{ x: number; y: number } | null>(null);
  
  const dirtParticlesRef = React.useRef<{ x: number; y: number; active: boolean }[]>([]);
  const [dirtEnv, setDirtEnv] = React.useState<'normal' | 'matlab' | null>(null);
  
  if (block.state) {
    const isMatlab = Math.abs(block.state.x || 0) > 3.1 || Math.abs(block.state.y || 0) > 3.1 || Math.abs(block.state.x_est || 0) > 3.1 || Math.abs(block.state.y_est || 0) > 3.1;
    if (dirtEnv === null || (dirtEnv === 'normal' && isMatlab)) {
      const range = isMatlab ? 11.0 : 5.6;
      dirtParticlesRef.current = [];
      for (let i = 0; i < 80; i++) {
        let dx = (Math.random() - 0.5) * range;
        let dy = (Math.random() - 0.5) * range;
        dirtParticlesRef.current.push({ x: dx, y: dy, active: true });
      }
      setDirtEnv(isMatlab ? 'matlab' : 'normal');
    }
  }

  const triggerRedraw = () => setRedrawTrigger(prev => prev + 1);

  // Mouse handlers for orbit dragging and wheel zooming
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (viewMode !== '3d') return;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (viewMode !== '3d' || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    
    yawRef.current = yawRef.current + dx * 0.007;
    pitchRef.current = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, pitchRef.current - dy * 0.007));
    
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    triggerRedraw();
  };

  const handleMouseUp = () => {
    dragStartRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (viewMode !== '3d') return;
    zoomRef.current = Math.max(3.0, Math.min(20.0, zoomRef.current + e.deltaY * 0.005));
    triggerRedraw();
  };

  React.useEffect(() => {
    if (!isRobotTwin) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const state = block.state;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);

    if (!state) {
      ctx.fillStyle = '#64748b';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('WAITING FOR SIMULATION DATA...', W / 2, H / 2);
      return;
    }

    if (viewMode === '2d') {
      const isMatlabEnv = (dirtEnv === 'matlab') || (state && (Math.abs(state.x || 0) > 3.1 || Math.abs(state.y || 0) > 3.1 || Math.abs(state.x_est || 0) > 3.1 || Math.abs(state.y_est || 0) > 3.1));
      const minVal = isMatlabEnv ? -6.0 : -3.0;
      const sizeVal = isMatlabEnv ? 12.0 : 6.0;

      const scaleX = (x: number) => 20 + (x - minVal) / sizeVal * (W - 40);
      const scaleY = (y: number) => H - 20 - (y - minVal) / sizeVal * (H - 40);
      const scaleR = (r: number) => r / sizeVal * (W - 40);

      const grid = state.grid;
      if (grid && Array.isArray(grid)) {
        const cellW = (W - 40) / 30;
        const cellH = (H - 40) / 30;
        for (let r = 0; r < 30; r++) {
          for (let c = 0; c < 30; c++) {
            const val = grid[r][c];
            if (val !== 0) {
              if (val > 0) {
                ctx.fillStyle = `rgba(249, 115, 22, ${Math.min(0.65, val / 100)})`;
              } else {
                ctx.fillStyle = `rgba(51, 65, 85, ${Math.min(0.4, -val / 100)})`;
              }
              const cx = 20 + c * cellW;
              const cy = H - 20 - (r + 1) * cellH;
              ctx.fillRect(cx, cy, cellW, cellH);
            }
          }
        }
      }

      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 3;
      ctx.strokeRect(20, 20, W - 40, H - 40);

      const circles = isMatlabEnv ? [
        { cx: 0.0, cy: 0.0, r: 0.3 },
        { cx: -4.0, cy: 0.0, r: 0.3 },
        { cx: 4.0, cy: 1.0, r: 0.3 }
      ] : [
        { cx: 1.2, cy: 1.0, r: 0.4 },
        { cx: -1.2, cy: -1.2, r: 0.45 },
        { cx: 0.0, cy: 2.0, r: 0.3 }
      ];
      ctx.fillStyle = 'rgba(71, 85, 105, 0.5)';
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;
      circles.forEach(c => {
        ctx.beginPath();
        ctx.arc(scaleX(c.cx), scaleY(c.cy), scaleR(c.r), 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
      });

      const boxes = isMatlabEnv ? [] : [
        { x1: -2.0, y1: 0.5, x2: -1.0, y2: 1.5 },
        { x1: 1.0, y1: -2.0, x2: 2.0, y2: -1.0 }
      ];
      ctx.fillStyle = 'rgba(71, 85, 105, 0.5)';
      boxes.forEach(b => {
        const bx = scaleX(b.x1);
        const by = scaleY(b.y2);
        const bw = scaleR(b.x2 - b.x1);
        const bh = scaleR(b.y2 - b.y1);
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeRect(bx, by, bw, bh);
      });

      if (isMatlabEnv && state.dyn_x !== undefined && state.dyn_y !== undefined) {
        ctx.fillStyle = 'rgba(6, 182, 212, 0.65)';
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(scaleX(state.dyn_x), scaleY(state.dyn_y), scaleR(0.5), 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
      }

      const dock_x = isMatlabEnv ? -5.1 : 0.0;
      const dock_y = isMatlabEnv ? -5.1 : -2.8;

      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(scaleX(dock_x), scaleY(dock_y), 7, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('DOCK', scaleX(dock_x), scaleY(dock_y));

      // Draw interior wall segments (MATLAB environment)
      if (isMatlabEnv) {
        const matlabWalls = [
          { x1: -6.0, y1: -6.0, x2: 6.0, y2: -6.0 },
          { x1: 6.0, y1: -6.0, x2: 6.0, y2: 6.0 },
          { x1: 6.0, y1: 6.0, x2: -6.0, y2: 6.0 },
          { x1: -6.0, y1: 6.0, x2: -6.0, y2: -6.0 },
          // Interior walls
          { x1: -6.0, y1: 2.0, x2: -2.0, y2: 2.0 },   // H-wall top-left
          { x1: 2.0,  y1: -2.0, x2: 2.0, y2: 4.0 },   // V-wall mid-right
          { x1: -3.0, y1: -3.0, x2: 1.0, y2: -3.0 },  // H-wall corridor partial
          { x1: 3.0,  y1: -2.0, x2: 6.0, y2: -2.0 },  // H-wall kitchen divider
        ];
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        for (const w of matlabWalls) {
          ctx.beginPath();
          ctx.moveTo(scaleX(w.x1), scaleY(w.y1));
          ctx.lineTo(scaleX(w.x2), scaleY(w.y2));
          ctx.stroke();
        }

        // Draw doorway indicators (gaps in walls where robot can transit)
        const doorways = [
          { x1: -2.0, y1: 2.0, x2: 0.0, y2: 2.0, label: '↕' },   // Corridor↔Living Room
          { x1: 2.0, y1: -6.0, x2: 2.0, y2: -2.0, label: '↔' },   // Corridor↔Bedroom/Kitchen
          { x1: 2.0, y1: 4.0, x2: 2.0, y2: 6.0, label: '↔' },     // top gap
        ];
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)';
        ctx.lineWidth = 4;
        ctx.setLineDash([6, 4]);
        for (const d of doorways) {
          ctx.beginPath();
          ctx.moveTo(scaleX(d.x1), scaleY(d.y1));
          ctx.lineTo(scaleX(d.x2), scaleY(d.y2));
          ctx.stroke();
        }
        ctx.setLineDash([]);

        // Room labels
        const roomLabels = [
          { label: '🚶 CORRIDOR', x: -2.5, y: -4.0 },
          { label: '🛋 LIVING RM', x: -4.0, y: 4.0 },
          { label: '🛏 BEDROOM',  x: 4.0,  y: 2.0 },
          { label: '🍳 KITCHEN',  x: 4.0,  y: -4.0 },
        ];
        ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const rl of roomLabels) {
          ctx.fillText(rl.label, scaleX(rl.x), scaleY(rl.y));
        }

        // Highlight current room being cleaned
        if (state.bt_state === 'COVERAGE' || state.bt_state === 'TRANSIT') {
          const roomBounds: Record<number, { x1: number, y1: number, x2: number, y2: number, color: string }> = {
            0: { x1: -6, y1: -6, x2: 2, y2: 2, color: 'rgba(59, 130, 246, 0.08)' },
            1: { x1: -6, y1: 2, x2: -2, y2: 6, color: 'rgba(16, 185, 129, 0.08)' },
            2: { x1: 2, y1: -2, x2: 6, y2: 6, color: 'rgba(139, 92, 246, 0.08)' },
            3: { x1: 2, y1: -6, x2: 6, y2: -2, color: 'rgba(245, 158, 11, 0.08)' },
          };
          const cur = roomBounds[state.current_room ?? 0];
          if (cur) {
            ctx.fillStyle = cur.color;
            ctx.fillRect(
              scaleX(cur.x1), scaleY(cur.y2),
              scaleX(cur.x2) - scaleX(cur.x1), scaleY(cur.y1) - scaleY(cur.y2)
            );
          }
        }
      }

      if (state.targetX !== undefined && state.targetY !== undefined && state.navState !== 0) {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(scaleX(state.x), scaleY(state.y));
        ctx.lineTo(scaleX(state.targetX), scaleY(state.targetY));
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(scaleX(state.targetX), scaleY(state.targetY), 5, 0, 2 * Math.PI);
        ctx.fill();
      }

      const wps = isMatlabEnv ? MATLAB_WAYPOINTS : WAYPOINTS;
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(scaleX(wps[0].x), scaleY(wps[0].y));
      for (let i = 1; i < wps.length; i++) {
        ctx.lineTo(scaleX(wps[i].x), scaleY(wps[i].y));
      }
      ctx.stroke();
      ctx.setLineDash([]);

      if (state.astar_path && Array.isArray(state.astar_path) && state.astar_path.length > 1) {
        // Color the A* path by current state
        const pathColor = state.bt_state === 'COVERAGE' ? '#ec4899' :
                          state.bt_state === 'TRANSIT' ? '#06b6d4' :
                          state.bt_state === 'PLAN_ROOM' ? '#f59e0b' :
                          state.bt_state === 'RETURN_DOCK' ? (state.using_constrained ? '#f59e0b' : '#f97316') :
                          '#ec4899';
        ctx.strokeStyle = pathColor;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(scaleX(state.astar_path[0][0]), scaleY(state.astar_path[0][1]));
        for (let i = 1; i < state.astar_path.length; i++) {
          ctx.lineTo(scaleX(state.astar_path[i][0]), scaleY(state.astar_path[i][1]));
        }
        ctx.stroke();
        // Draw intermediate waypoint dots
        ctx.fillStyle = pathColor;
        for (const pt of state.astar_path) {
          ctx.beginPath();
          ctx.arc(scaleX(pt[0]), scaleY(pt[1]), 3, 0, 2 * Math.PI);
          ctx.fill();
        }
      }

      const trail = state.trail;
      if (trail && Array.isArray(trail) && trail.length > 1) {
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#10b981';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(scaleX(trail[0][0]), scaleY(trail[0][1]));
        for (let i = 1; i < trail.length; i++) {
          ctx.lineTo(scaleX(trail[i][0]), scaleY(trail[i][1]));
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      const estTrail = state.estTrail;
      if (estTrail && Array.isArray(estTrail) && estTrail.length > 1) {
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
        ctx.lineWidth = 2.0;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(scaleX(estTrail[0][0]), scaleY(estTrail[0][1]));
        for (let i = 1; i < estTrail.length; i++) {
          ctx.lineTo(scaleX(estTrail[i][0]), scaleY(estTrail[i][1]));
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      const ranges = state.lidarRanges;
      if (ranges && Array.isArray(ranges)) {
        const numBeams = ranges.length;
        const beamAngles: number[] = [];
        if (numBeams === 45) {
          for (let i = -180; i <= 179; i += 8) {
            beamAngles.push(i * Math.PI / 180);
          }
        } else {
          beamAngles.push(0, Math.PI/4, Math.PI/2, 3*Math.PI/4, Math.PI, -3*Math.PI/4, -Math.PI/2, -Math.PI/4);
        }
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
        ctx.lineWidth = 1;
        for (let i = 0; i < ranges.length; i++) {
          const absAngle = (state.theta || 0) + (beamAngles[i] ?? 0);
          const r = ranges[i];
          const lx = (state.x || 0) + r * Math.cos(absAngle);
          const ly = (state.y || 0) + r * Math.sin(absAngle);

          ctx.beginPath();
          ctx.moveTo(scaleX(state.x), scaleY(state.y));
          ctx.lineTo(scaleX(lx), scaleY(ly));
          ctx.stroke();

          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(scaleX(lx), scaleY(ly), 2.5, 0, 2 * Math.PI);
          ctx.fill();
        }
      }

      const rx = scaleX(state.x || 0);
      const ry = scaleY(state.y || 0);
      const rr = scaleR(0.15);
      ctx.fillStyle = 'rgba(16, 185, 129, 0.9)';
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(rx, ry, rr, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + rr * Math.cos(-(state.theta || 0)), ry + rr * Math.sin(-(state.theta || 0)));
      ctx.stroke();

      const ex = scaleX(state.x_est || 0);
      const ey = scaleY(state.y_est || 0);
      const er = scaleR(0.13);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(ex, ey, er, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = '#f59e0b';
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex + er * Math.cos(-(state.theta_est || 0)), ey + er * Math.sin(-(state.theta_est || 0)));
      ctx.stroke();

      // ── State Machine HUD Overlay ─────────────────────────────────────────
      if (state.bt_state !== undefined) {
        const stateColors: Record<string, string> = {
          INIT: '#64748b', PLAN_ROOM: '#f59e0b', COVERAGE: '#ec4899',
          TRANSIT: '#06b6d4', RETURN_DOCK: '#f97316', DOCKED: '#10b981'
        };
        const roomNames: Record<number, string> = {
          0: 'Corridor', 1: 'Living Room', 2: 'Bedroom', 3: 'Kitchen'
        };
        const stCol = stateColors[state.bt_state] || '#94a3b8';
        const bat = typeof state.battery_level === 'number' ? state.battery_level : 100;
        const batCol = bat > 60 ? '#10b981' : bat > 30 ? '#f59e0b' : '#ef4444';
        const cleaned = Array.isArray(state.cleaned_rooms) ? state.cleaned_rooms.length : 0;
        const pathLen = Array.isArray(state.astar_path) ? state.astar_path.length : 0;
        const roomName = roomNames[state.current_room ?? 0] || '?';

        // Background panel
        ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
        ctx.beginPath();
        (ctx as any).roundRect ? (ctx as any).roundRect(28, 28, 176, 108, 8)
                               : ctx.rect(28, 28, 176, 108);
        ctx.fill();

        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        // State label
        ctx.fillStyle = stCol;
        ctx.fillText(`⚙ ${state.bt_state}`, 40, 38);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px monospace';
        ctx.fillText(`Room:  ${roomName} (${state.current_room ?? 0})`, 40, 56);
        ctx.fillText(`Done:  ${cleaned}/4 rooms`, 40, 70);
        ctx.fillText(`Path:  ${pathLen} pts`, 40, 84);
        ctx.fillText(`WP:    ${state.waypoint_idx ?? 0}/${(state.room_waypoints?.length ?? 0)}`, 40, 98);

        // Battery bar
        const barX = 40, barY = 113, barW = 150, barH = 10;
        ctx.fillStyle = 'rgba(51, 65, 85, 0.8)';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = batCol;
        ctx.fillRect(barX, barY, barW * (bat / 100), barH);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '9px monospace';
        ctx.fillText(`🔋 ${bat.toFixed(0)}%`, barX + barW + 4, barY);
      }

    } else {
      const yaw = yawRef.current;
      const pitch = pitchRef.current;
      const zoom = zoomRef.current;

      const rx_true = state.x ?? 0;
      const ry_true = state.y ?? 0;
      
      const isMatlabEnv = (dirtEnv === 'matlab') || Math.abs(rx_true) > 3.1 || Math.abs(ry_true) > 3.1 || Math.abs(state.x_est || 0) > 3.1 || Math.abs(state.y_est || 0) > 3.1;
      const minVal = isMatlabEnv ? -6.0 : -3.0;
      const sizeVal = isMatlabEnv ? 12.0 : 6.0;

      dirtParticlesRef.current.forEach(particle => {
        if (particle.active) {
          const dist = Math.sqrt(Math.pow(particle.x - rx_true, 2) + Math.pow(particle.y - ry_true, 2));
          if (dist < 0.22) {
            particle.active = false;
          }
        }
      });

      let targetX = 0;
      let targetY = 0;
      let targetZ = 0;
      if (trackRobot) {
        targetX = rx_true;
        targetY = ry_true;
      }

      const camX = targetX + zoom * Math.cos(pitch) * Math.cos(yaw);
      const camY = targetY + zoom * Math.cos(pitch) * Math.sin(yaw);
      const camZ = targetZ + zoom * Math.sin(pitch);

      const lx = targetX - camX;
      const ly = targetY - camY;
      const lz = targetZ - camZ;
      const len = Math.sqrt(lx*lx + ly*ly + lz*lz);
      const wx = lx / (len || 1);
      const wy = ly / (len || 1);
      const wz = lz / (len || 1);

      const rlen = Math.sqrt(wx*wx + wy*wy);
      let ux = 0, uy = 0, uz = 0;
      if (rlen > 1e-5) {
        ux = wy / rlen;
        uy = -wx / rlen;
        uz = 0;
      } else {
        ux = 1;
        uy = 0;
        uz = 0;
      }

      const vx = uy * wz - uz * wy;
      const vy = uz * wx - ux * wz;
      const vz = ux * wy - uy * wx;

      const project = (x_w: number, y_w: number, z_w: number) => {
        const rx_w = x_w - camX;
        const ry_w = y_w - camY;
        const rz_w = z_w - camZ;
        
        const x_cam = rx_w * ux + ry_w * uy + rz_w * uz;
        const y_cam = rx_w * vx + ry_w * vy + rz_w * vz;
        const z_cam = rx_w * wx + ry_w * wy + rz_w * wz;
        
        const F = W * 1.1;
        const px = W / 2 + (x_cam * F) / z_cam;
        const py = H / 2 - (y_cam * F) / z_cam;
        
        return { x: px, y: py, depth: z_cam, visible: z_cam > 0.1 };
      };

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.1)';
      ctx.lineWidth = 1;
      const gridStep = 0.5 * (sizeVal / 6.0);
      for (let g = minVal; g <= -minVal; g += gridStep) {
        let p1 = project(g, minVal, 0);
        let p2 = project(g, -minVal, 0);
        if (p1.visible && p2.visible) {
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
        
        let p3 = project(minVal, g, 0);
        let p4 = project(-minVal, g, 0);
        if (p3.visible && p4.visible) {
          ctx.beginPath();
          ctx.moveTo(p3.x, p3.y);
          ctx.lineTo(p4.x, p4.y);
          ctx.stroke();
        }
      }

      if (showSlam && state.grid && Array.isArray(state.grid)) {
        const cellSize = sizeVal / 30;
        for (let r = 0; r < 30; r++) {
          for (let c = 0; c < 30; c++) {
            const val = state.grid[r][c];
            if (val !== 0) {
              const gx = minVal + c * cellSize;
              const gy = minVal + r * cellSize;
              
              const c1 = project(gx, gy, 0.001);
              const c2 = project(gx + cellSize, gy, 0.001);
              const c3 = project(gx + cellSize, gy + cellSize, 0.001);
              const c4 = project(gx, gy + cellSize, 0.001);
              
              if (c1.visible && c2.visible && c3.visible && c4.visible) {
                ctx.beginPath();
                ctx.moveTo(c1.x, c1.y);
                ctx.lineTo(c2.x, c2.y);
                ctx.lineTo(c3.x, c3.y);
                ctx.lineTo(c4.x, c4.y);
                ctx.closePath();
                
                if (val > 0) {
                  ctx.fillStyle = `rgba(239, 68, 68, ${Math.min(0.5, val / 150)})`;
                } else {
                  ctx.fillStyle = `rgba(16, 185, 129, ${Math.min(0.25, -val / 150)})`;
                }
                ctx.fill();
              }
            }
          }
        }
      }

      const wps = isMatlabEnv ? MATLAB_WAYPOINTS : WAYPOINTS;
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 6]);
      ctx.beginPath();
      let firstWaypoint = true;
      for (const wp of wps) {
        const p = project(wp.x, wp.y, 0.001);
        if (p.visible) {
          if (firstWaypoint) {
            ctx.moveTo(p.x, p.y);
            firstWaypoint = false;
          } else {
            ctx.lineTo(p.x, p.y);
          }
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);

      if (state.astar_path && Array.isArray(state.astar_path) && state.astar_path.length > 1) {
        ctx.strokeStyle = state.using_constrained ? 'rgba(245, 158, 11, 0.95)' : 'rgba(236, 72, 153, 0.85)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        let first = true;
        for (const pt of state.astar_path) {
          const p = project(pt[0], pt[1], 0.003);
          if (p.visible) {
            if (first) {
              ctx.moveTo(p.x, p.y);
              first = false;
            } else {
              ctx.lineTo(p.x, p.y);
            }
          }
        }
        ctx.stroke();
      }

      const trail = state.trail || [];
      if (trail.length > 1) {
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.75)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        let first = true;
        for (const pt of trail) {
          const p = project(pt[0], pt[1], 0.002);
          if (p.visible) {
            if (first) {
              ctx.moveTo(p.x, p.y);
              first = false;
            } else {
              ctx.lineTo(p.x, p.y);
            }
          }
        }
        ctx.stroke();
      }

      const estTrail = state.estTrail || [];
      if (estTrail.length > 1) {
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        let first = true;
        for (const pt of estTrail) {
          const p = project(pt[0], pt[1], 0.002);
          if (p.visible) {
            if (first) {
              ctx.moveTo(p.x, p.y);
              first = false;
            } else {
              ctx.lineTo(p.x, p.y);
            }
          }
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      interface Renderable {
        depth: number;
        draw: (ctx: CanvasRenderingContext2D) => void;
      }
      const renderables: Renderable[] = [];

      const H_wall = isMatlabEnv ? 1.2 : 0.45;
      const wallColors = state.room_colors || ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'];
      
      const wallsToRender = isMatlabEnv ? [
        { x1: -6.0, y1: -6.0, x2: 6.0, y2: -6.0 },
        { x1: 6.0, y1: -6.0, x2: 6.0, y2: 6.0 },
        { x1: 6.0, y1: 6.0, x2: -6.0, y2: 6.0 },
        { x1: -6.0, y1: 6.0, x2: -6.0, y2: -6.0 },
        { x1: -6.0, y1: 2.0, x2: -2.0, y2: 2.0 },
        { x1: 2.0, y1: -2.0, x2: 2.0, y2: 4.0 },
        { x1: -3.0, y1: -3.0, x2: 1.0, y2: -3.0 },
        { x1: 3.0, y1: -2.0, x2: 6.0, y2: -2.0 }
      ] : [
        { x1: -3.0, y1: -3.0, x2: -3.0, y2: 3.0 },
        { x1: 3.0, y1: -3.0, x2: 3.0, y2: 3.0 },
        { x1: -3.0, y1: -3.0, x2: 3.0, y2: -3.0 },
        { x1: -3.0, y1: 3.0, x2: 3.0, y2: 3.0 },
        { x1: 0.5, y1: -3.0, x2: 0.5, y2: -2.2 },
        { x1: 0.5, y1: -1.7, x2: 0.5, y2: -1.0 },
        { x1: -3.0, y1: -1.0, x2: -1.8, y2: -1.0 },
        { x1: -1.3, y1: -1.0, x2: 1.3, y2: -1.0 },
        { x1: 1.8, y1: -1.0, x2: 3.0, y2: -1.0 },
        { x1: 0.0, y1: -1.0, x2: 0.0, y2: 0.8 },
        { x1: 0.0, y1: 1.3, x2: 0.0, y2: 3.0 }
      ];

      wallsToRender.forEach((w, idx) => {
        const d1 = project(w.x1, w.y1, 0);
        const d2 = project(w.x2, w.y2, 0);
        const d3 = project(w.x2, w.y2, H_wall);
        const d4 = project(w.x1, w.y1, H_wall);
        
        if (d1.visible || d2.visible || d3.visible || d4.visible) {
          const avgDepth = (d1.depth + d2.depth + d3.depth + d4.depth) / 4;
          const strokeColor = wallColors[idx % wallColors.length] || '#06b6d4';
          
          renderables.push({
            depth: avgDepth,
            draw: (ctx) => {
              ctx.beginPath();
              ctx.moveTo(d1.x, d1.y);
              ctx.lineTo(d2.x, d2.y);
              ctx.lineTo(d3.x, d3.y);
              ctx.lineTo(d4.x, d4.y);
              ctx.closePath();
              
              ctx.fillStyle = 'rgba(15, 23, 42, 0.25)';
              ctx.fill();
              
              ctx.strokeStyle = strokeColor + 'cc';
              ctx.lineWidth = 1.8;
              ctx.stroke();
            }
          });
        }
      });

      const circlesToRender = isMatlabEnv ? [
        { cx: 0.0, cy: 0.0, r: 0.3 },
        { cx: -4.0, cy: 0.0, r: 0.3 },
        { cx: 4.0, cy: 1.0, r: 0.3 }
      ] : [
        { cx: 1.2, cy: 1.0, r: 0.4 },
        { cx: -1.2, cy: -1.2, r: 0.45 },
        { cx: 0.0, cy: 2.0, r: 0.3 }
      ];
      const H_cyl = isMatlabEnv ? 1.2 : 0.35;
      
      circlesToRender.forEach((c) => {
        const segments = 16;
        const bottomPts: { x: number; y: number; depth: number }[] = [];
        const topPts: { x: number; y: number; depth: number }[] = [];
        
        for (let i = 0; i <= segments; i++) {
          const angle = (i / segments) * 2 * Math.PI;
          const wx = c.cx + c.r * Math.cos(angle);
          const wy = c.cy + c.r * Math.sin(angle);
          bottomPts.push(project(wx, wy, 0));
          topPts.push(project(wx, wy, H_cyl));
        }
        
        const avgDepth = bottomPts.reduce((acc, p) => acc + p.depth, 0) / bottomPts.length;
        
        renderables.push({
          depth: avgDepth,
          draw: (ctx) => {
            for (let i = 0; i < segments; i++) {
              ctx.beginPath();
              ctx.moveTo(bottomPts[i].x, bottomPts[i].y);
              ctx.lineTo(bottomPts[i+1].x, bottomPts[i+1].y);
              ctx.lineTo(topPts[i+1].x, topPts[i+1].y);
              ctx.lineTo(topPts[i].x, topPts[i].y);
              ctx.closePath();
              
              ctx.fillStyle = isMatlabEnv ? 'rgba(71, 85, 105, 0.45)' : 'rgba(71, 85, 105, 0.3)';
              ctx.fill();
              ctx.strokeStyle = isMatlabEnv ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.4)';
              ctx.lineWidth = 0.5;
              ctx.stroke();
            }
            
            ctx.beginPath();
            ctx.moveTo(topPts[0].x, topPts[0].y);
            for (let i = 1; i < topPts.length; i++) {
              ctx.lineTo(topPts[i].x, topPts[i].y);
            }
            ctx.closePath();
            ctx.fillStyle = isMatlabEnv ? 'rgba(148, 163, 184, 0.7)' : 'rgba(71, 85, 105, 0.6)';
            ctx.fill();
            ctx.strokeStyle = isMatlabEnv ? 'rgba(203, 213, 225, 0.9)' : 'rgba(100, 116, 139, 0.8)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        });
      });

      const boxesToRender = isMatlabEnv ? [] : [
        { x1: -2.5, y1: 1.5, x2: -1.0, y2: 2.2 },
        { x1: 1.0, y1: 1.0, x2: 2.5, y2: 2.5 }
      ];
      const H_box = 0.35;
      
      boxesToRender.forEach((b) => {
        const v = [
          project(b.x1, b.y1, 0),
          project(b.x2, b.y1, 0),
          project(b.x2, b.y2, 0),
          project(b.x1, b.y2, 0),
          project(b.x1, b.y1, H_box),
          project(b.x2, b.y1, H_box),
          project(b.x2, b.y2, H_box),
          project(b.x1, b.y2, H_box)
        ];
        
        const avgDepth = v.reduce((acc, p) => acc + p.depth, 0) / 8;
        
        renderables.push({
          depth: avgDepth,
          draw: (ctx) => {
            const faces = [
              [0, 1, 5, 4],
              [1, 2, 6, 5],
              [2, 3, 7, 6],
              [3, 0, 4, 7]
            ];
            
            faces.forEach(f => {
              if (v[f[0]].visible && v[f[1]].visible && v[f[2]].visible && v[f[3]].visible) {
                ctx.beginPath();
                ctx.moveTo(v[f[0]].x, v[f[0]].y);
                ctx.lineTo(v[f[1]].x, v[f[1]].y);
                ctx.lineTo(v[f[2]].x, v[f[2]].y);
                ctx.lineTo(v[f[3]].x, v[f[3]].y);
                ctx.closePath();
                ctx.fillStyle = 'rgba(71, 85, 105, 0.35)';
                ctx.fill();
                ctx.strokeStyle = 'rgba(100, 116, 139, 0.4)';
                ctx.lineWidth = 0.8;
                ctx.stroke();
              }
            });

            if (v[4].visible && v[5].visible && v[6].visible && v[7].visible) {
              ctx.beginPath();
              ctx.moveTo(v[4].x, v[4].y);
              ctx.lineTo(v[5].x, v[5].y);
              ctx.lineTo(v[6].x, v[6].y);
              ctx.lineTo(v[7].x, v[7].y);
              ctx.closePath();
              ctx.fillStyle = 'rgba(71, 85, 105, 0.7)';
              ctx.fill();
              ctx.strokeStyle = 'rgba(100, 116, 139, 0.9)';
              ctx.lineWidth = 1.5;
              ctx.stroke();
            }
          }
        });
      });

      if (isMatlabEnv && state.dyn_x !== undefined && state.dyn_y !== undefined) {
        const segments = 16;
        const dyn_x = state.dyn_x;
        const dyn_y = state.dyn_y;
        const dyn_r = 0.5;
        const dyn_h = 1.2;
        const bottomPts: { x: number; y: number; depth: number }[] = [];
        const topPts: { x: number; y: number; depth: number }[] = [];
        
        for (let i = 0; i <= segments; i++) {
          const angle = (i / segments) * 2 * Math.PI;
          const wx = dyn_x + dyn_r * Math.cos(angle);
          const wy = dyn_y + dyn_r * Math.sin(angle);
          bottomPts.push(project(wx, wy, 0));
          topPts.push(project(wx, wy, dyn_h));
        }
        
        const avgDepth = bottomPts.reduce((acc, p) => acc + p.depth, 0) / bottomPts.length;
        
        renderables.push({
          depth: avgDepth,
          draw: (ctx) => {
            for (let i = 0; i < segments; i++) {
              ctx.beginPath();
              ctx.moveTo(bottomPts[i].x, bottomPts[i].y);
              ctx.lineTo(bottomPts[i+1].x, bottomPts[i+1].y);
              ctx.lineTo(topPts[i+1].x, topPts[i+1].y);
              ctx.lineTo(topPts[i].x, topPts[i].y);
              ctx.closePath();
              
              ctx.fillStyle = 'rgba(6, 182, 212, 0.35)';
              ctx.fill();
              ctx.strokeStyle = 'rgba(34, 211, 238, 0.4)';
              ctx.lineWidth = 0.5;
              ctx.stroke();
            }
            
            ctx.beginPath();
            ctx.moveTo(topPts[0].x, topPts[0].y);
            for (let i = 1; i < topPts.length; i++) {
              ctx.lineTo(topPts[i].x, topPts[i].y);
            }
            ctx.closePath();
            ctx.fillStyle = 'rgba(6, 182, 212, 0.6)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(34, 211, 238, 0.85)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        });
      }

      const dock_x = isMatlabEnv ? -5.1 : 0.0;
      const dock_y = isMatlabEnv ? -5.1 : -2.8;
      const dockP = project(dock_x, dock_y, 0);

      if (dockP.visible) {
        renderables.push({
          depth: dockP.depth,
          draw: (ctx) => {
            const dw = 0.15, dh = 0.08;
            const dv = [
              project(dock_x - dw, dock_y - dw/2, 0),
              project(dock_x + dw, dock_y - dw/2, 0),
              project(dock_x + dw, dock_y + dw/2, 0),
              project(dock_x - dw, dock_y + dw/2, 0),
              project(dock_x - dw, dock_y - dw/2, dh),
              project(dock_x + dw, dock_y - dw/2, dh),
              project(dock_x + dw, dock_y + dw/2, dh),
              project(dock_x - dw, dock_y + dw/2, dh)
            ];
            
            const dfaces = [[0,1,5,4], [1,2,6,5], [2,3,7,6], [3,0,4,7]];
            dfaces.forEach(df => {
              if (dv[df[0]].visible && dv[df[1]].visible && dv[df[2]].visible && dv[df[3]].visible) {
                ctx.beginPath();
                ctx.moveTo(dv[df[0]].x, dv[df[0]].y);
                ctx.lineTo(dv[df[1]].x, dv[df[1]].y);
                ctx.lineTo(dv[df[2]].x, dv[df[2]].y);
                ctx.lineTo(dv[df[3]].x, dv[df[3]].y);
                ctx.closePath();
                ctx.fillStyle = 'rgba(30, 41, 59, 0.7)';
                ctx.fill();
                ctx.strokeStyle = '#10b981';
                ctx.stroke();
              }
            });
            
            if (dv[4].visible && dv[5].visible && dv[6].visible && dv[7].visible) {
              ctx.beginPath();
              ctx.moveTo(dv[4].x, dv[4].y);
              ctx.lineTo(dv[5].x, dv[5].y);
              ctx.lineTo(dv[6].x, dv[6].y);
              ctx.lineTo(dv[7].x, dv[7].y);
              ctx.closePath();
              ctx.fillStyle = 'rgba(16, 185, 129, 0.3)';
              ctx.fill();
              ctx.strokeStyle = '#10b981';
              ctx.stroke();
            }

            const dlbl = project(dock_x, dock_y, dh + 0.01);
            if (dlbl.visible) {
              ctx.fillStyle = '#10b981';
              ctx.font = 'bold 8px sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.shadowColor = '#10b981';
              ctx.shadowBlur = 6;
              ctx.fillText('DOCK', dlbl.x, dlbl.y);
              ctx.shadowBlur = 0;
            }
          }
        });
      }

      dirtParticlesRef.current.forEach((d) => {
        if (!d.active) return;
        const p = project(d.x, d.y, 0);
        if (p.visible) {
          renderables.push({
            depth: p.depth,
            draw: (ctx) => {
              ctx.beginPath();
              ctx.arc(p.x, p.y, Math.max(1.5, 10 / p.depth), 0, 2 * Math.PI);
              ctx.fillStyle = '#f59e0b';
              ctx.fill();
              ctx.shadowColor = '#f59e0b';
              ctx.shadowBlur = 4;
              ctx.beginPath();
              ctx.arc(p.x, p.y, Math.max(0.5, 5 / p.depth), 0, 2 * Math.PI);
              ctx.fillStyle = '#ffffff';
              ctx.fill();
              ctx.shadowBlur = 0;
            }
          });
        }
      });

      const pCenter = project(rx_true, ry_true, 0);
      if (pCenter.visible) {
        renderables.push({
          depth: pCenter.depth,
          draw: (ctx) => {
            const rtheta = state.theta || 0;
            
            const brushRadius = 0.05;
            const leftBrushAngle = rtheta + Math.PI/5;
            const rightBrushAngle = rtheta - Math.PI/5;
            const leftBrushX = rx_true + 0.12 * Math.cos(leftBrushAngle);
            const leftBrushY = ry_true + 0.12 * Math.sin(leftBrushAngle);
            const rightBrushX = rx_true + 0.12 * Math.cos(rightBrushAngle);
            const rightBrushY = ry_true + 0.12 * Math.sin(rightBrushAngle);
            
            const drawBrush = (bx: number, by: number, rotSpeed: number) => {
              const bp = project(bx, by, 0.001);
              if (!bp.visible) return;
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
              ctx.lineWidth = 1;
              const numBristles = 6;
              const rotAngle = (performance.now() / 1000) * rotSpeed;
              for (let b = 0; b < numBristles; b++) {
                const bAngle = rotAngle + (b / numBristles) * 2 * Math.PI;
                const bpx = bx + brushRadius * Math.cos(bAngle);
                const bpy = by + brushRadius * Math.sin(bAngle);
                const bpt = project(bpx, bpy, 0.001);
                if (bpt.visible) {
                  ctx.beginPath();
                  ctx.moveTo(bp.x, bp.y);
                  ctx.lineTo(bpt.x, bpt.y);
                  ctx.stroke();
                }
              }
            };
            
            drawBrush(leftBrushX, leftBrushY, 15);
            drawBrush(rightBrushX, rightBrushY, -15);
            
            const segments = 24;
            const rBottom: { x: number; y: number; depth: number }[] = [];
            const rTop: { x: number; y: number; depth: number }[] = [];
            const r_rad = 0.15;
            const r_h = 0.05;
            
            for (let i = 0; i <= segments; i++) {
              const angle = (i / segments) * 2 * Math.PI;
              const wx = rx_true + r_rad * Math.cos(angle);
              const wy = ry_true + r_rad * Math.sin(angle);
              rBottom.push(project(wx, wy, 0));
              rTop.push(project(wx, wy, r_h));
            }
            
            ctx.beginPath();
            ctx.moveTo(rBottom[0].x, rBottom[0].y);
            for (let i = 1; i < rBottom.length; i++) {
              ctx.lineTo(rBottom[i].x, rBottom[i].y);
            }
            ctx.closePath();
            ctx.fillStyle = 'rgba(15, 23, 42, 0.5)';
            ctx.fill();
            
            for (let i = 0; i < segments; i++) {
              ctx.beginPath();
              ctx.moveTo(rBottom[i].x, rBottom[i].y);
              ctx.lineTo(rBottom[i+1].x, rBottom[i+1].y);
              ctx.lineTo(rTop[i+1].x, rTop[i+1].y);
              ctx.lineTo(rTop[i].x, rTop[i].y);
              ctx.closePath();
              ctx.fillStyle = 'rgba(51, 65, 85, 0.9)';
              ctx.fill();
              ctx.strokeStyle = 'rgba(71, 85, 105, 0.4)';
              ctx.lineWidth = 0.5;
              ctx.stroke();
            }
            
            ctx.beginPath();
            ctx.moveTo(rTop[0].x, rTop[0].y);
            for (let i = 1; i < rTop.length; i++) {
              ctx.lineTo(rTop[i].x, rTop[i].y);
            }
            ctx.closePath();
            ctx.fillStyle = '#1e293b';
            ctx.fill();
            ctx.strokeStyle = '#475569';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            
            const headX = rx_true + r_rad * 0.75 * Math.cos(rtheta);
            const headY = ry_true + r_rad * 0.75 * Math.sin(rtheta);
            const pHead = project(headX, headY, r_h + 0.001);
            const pCenterTop = project(rx_true, ry_true, r_h + 0.001);
            if (pHead.visible && pCenterTop.visible) {
              ctx.strokeStyle = '#10b981';
              ctx.lineWidth = 2.0;
              ctx.beginPath();
              ctx.moveTo(pCenterTop.x, pCenterTop.y);
              ctx.lineTo(pHead.x, pHead.y);
              ctx.stroke();
              
              ctx.fillStyle = '#10b981';
              ctx.beginPath();
              ctx.arc(pHead.x, pHead.y, 3.5, 0, 2 * Math.PI);
              ctx.fill();
            }
            
            const turretR = 0.04;
            const turretH = r_h + 0.025;
            const tBottom: { x: number; y: number; depth: number }[] = [];
            const tTop: { x: number; y: number; depth: number }[] = [];
            
            for (let i = 0; i <= segments; i++) {
              const angle = (i / segments) * 2 * Math.PI;
              const wx = rx_true + turretR * Math.cos(angle);
              const wy = ry_true + turretR * Math.sin(angle);
              tBottom.push(project(wx, wy, r_h));
              tTop.push(project(wx, wy, turretH));
            }
            
            for (let i = 0; i < segments; i++) {
              ctx.beginPath();
              ctx.moveTo(tBottom[i].x, tBottom[i].y);
              ctx.lineTo(tBottom[i+1].x, tBottom[i+1].y);
              ctx.lineTo(tTop[i+1].x, tTop[i+1].y);
              ctx.lineTo(tTop[i].x, tTop[i].y);
              ctx.closePath();
              ctx.fillStyle = '#0f172a';
              ctx.fill();
              ctx.strokeStyle = '#1e293b';
              ctx.stroke();
            }
            
            ctx.beginPath();
            ctx.moveTo(tTop[0].x, tTop[0].y);
            for (let i = 1; i < tTop.length; i++) {
              ctx.lineTo(tTop[i].x, tTop[i].y);
            }
            ctx.closePath();
            ctx.fillStyle = '#020617';
            ctx.fill();
            ctx.strokeStyle = '#334155';
            ctx.stroke();
            
            const scanAngle = (performance.now() / 120) % (2 * Math.PI);
            const scanX = rx_true + turretR * 0.75 * Math.cos(scanAngle);
            const scanY = ry_true + turretR * 0.75 * Math.sin(scanAngle);
            const pScan = project(scanX, scanY, turretH + 0.001);
            const pTurretCenter = project(rx_true, ry_true, turretH + 0.001);
            if (pScan.visible && pTurretCenter.visible) {
              ctx.strokeStyle = '#ef4444';
              ctx.lineWidth = 1.2;
              ctx.beginPath();
              ctx.moveTo(pTurretCenter.x, pTurretCenter.y);
              ctx.lineTo(pScan.x, pScan.y);
              ctx.stroke();
            }

            if (state.x_est !== undefined && state.y_est !== undefined) {
              ctx.strokeStyle = 'rgba(245, 158, 11, 0.75)';
              ctx.lineWidth = 1.2;
              ctx.setLineDash([2, 4]);
              ctx.beginPath();
              const estR = 0.15;
              for (let i = 0; i <= segments; i++) {
                const angle = (i / segments) * 2 * Math.PI;
                const wx = state.x_est + estR * Math.cos(angle);
                const wy = state.y_est + estR * Math.sin(angle);
                const pt = project(wx, wy, 0.001);
                if (i === 0) ctx.moveTo(pt.x, pt.y);
                else ctx.lineTo(pt.x, pt.y);
              }
              ctx.stroke();
              ctx.setLineDash([]);
              
              const estHeadX = state.x_est + estR * 0.7 * Math.cos(state.theta_est || 0);
              const estHeadY = state.y_est + estR * 0.7 * Math.sin(state.theta_est || 0);
              const pEstCenter = project(state.x_est, state.y_est, 0.001);
              const pEstHead = project(estHeadX, estHeadY, 0.001);
              if (pEstCenter.visible && pEstHead.visible) {
                ctx.strokeStyle = 'rgba(245, 158, 11, 0.65)';
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.moveTo(pEstCenter.x, pEstCenter.y);
                ctx.lineTo(pEstHead.x, pEstHead.y);
                ctx.stroke();
              }
            }
          }
        });
      }

      renderables.sort((a, b) => b.depth - a.depth);
      renderables.forEach((r) => r.draw(ctx));

      if (showLidar && state.lidarRanges && Array.isArray(state.lidarRanges)) {
        const numBeams = state.lidarRanges.length;
        const beamAngles: number[] = [];
        if (numBeams === 45) {
          for (let i = -180; i <= 179; i += 8) {
            beamAngles.push(i * Math.PI / 180);
          }
        } else {
          beamAngles.push(0, Math.PI/4, Math.PI/2, 3*Math.PI/4, Math.PI, -3*Math.PI/4, -Math.PI/2, -Math.PI/4);
        }
        const turretH = 0.075;
        
        state.lidarRanges.forEach((r: number, i: number) => {
          const absAngle = (state.theta || 0) + (beamAngles[i] ?? 0);
          const hitX = rx_true + r * Math.cos(absAngle);
          const hitY = ry_true + r * Math.sin(absAngle);
          
          const pStart = project(rx_true, ry_true, turretH);
          const pEnd = project(hitX, hitY, turretH);
          
          if (pStart.visible && pEnd.visible) {
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.65)';
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            ctx.moveTo(pStart.x, pStart.y);
            ctx.lineTo(pEnd.x, pEnd.y);
            ctx.stroke();
            
            ctx.fillStyle = '#ef4444';
            ctx.shadowColor = '#ef4444';
            ctx.shadowBlur = 4;
            ctx.beginPath();
            ctx.arc(pEnd.x, pEnd.y, Math.max(1.0, 7.5 / pEnd.depth), 0, 2 * Math.PI);
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        });
      }
    }
  }, [block, isRobotTwin, block.state, viewMode, trackRobot, showLidar, showSlam, redrawTrigger]);

  const getSignalColor = (index: number) => {
    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#06b6d4', '#8b5cf6'];
    return colors[index % colors.length];
  };

  const calculateStats = (dataKey: string) => {
    if (history.length === 0) return { mean: 0, rms: 0, pk2pk: 0 };
    const values = history.map((h: any) => h[dataKey]);
    const sum = values.reduce((a: number, b: number) => a + b, 0);
    const mean = sum / values.length;
    const rms = Math.sqrt(values.reduce((a: number, b: number) => a + b * b, 0) / values.length);
    const pk2pk = Math.max(...values) - Math.min(...values);
    return { mean, rms, pk2pk };
  };

  const downloadCSV = () => {
    const headers = ['Time', ...Array.from({ length: numSignals }, (_, i) => `In${i+1}`)];
    const csvRows = [
      headers,
      ...history.map((h: any) => [
        h.t, 
        ...Array.from({ length: numSignals }, (_, i) => h[`y${i+1}`])
      ])
    ];
    
    const csvContent = csvRows.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `scope_data_${block.id}.csv`);
    link.click();
  };

  if (isRobotTwin) {
    const state = block.state || {};
    const modes = ['Idle', 'Seek Goal', 'Corridor', 'Avoid Obs', 'Clean Rm', 'Docking'];
    const activeMode = modes[state.navState] || 'Idle';
    
    const errorX = Math.abs((state.x || 0) - (state.x_est || 0));
    const errorY = Math.abs((state.y || 0) - (state.y_est || 0));
    const errorTheta = Math.abs(Math.atan2(Math.sin((state.theta || 0) - (state.theta_est || 0)), Math.cos((state.theta || 0) - (state.theta_est || 0))));

    return (
      <Dialog.Root open={true} onOpenChange={(open) => !open && onClose()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] h-[85vh] bg-[#141414] border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col z-[101] outline-none">
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-black/20">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                  <Settings2 size={20} />
                </div>
                <div>
                  <Dialog.Title className="text-lg font-black text-white uppercase tracking-wider">
                    LiDAR Robot Vacuum Map Viewer & Co-Simulator
                  </Dialog.Title>
                  <div className="text-[10px] font-mono text-gray-500 uppercase tracking-tighter">
                    Block ID: {block.id} • Mode: {activeMode} • Real-time SLAM Map
                  </div>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 flex overflow-hidden p-6 gap-6 min-h-0">
              <div className="flex-[5] bg-black/45 border border-white/5 rounded-2xl flex flex-col items-center justify-center p-4 relative shadow-inner overflow-hidden select-none">
                <div className="absolute top-4 left-4 flex gap-3 z-10">
                  <div className="px-2.5 py-1 rounded-md bg-emerald-505/10 border border-emerald-500/20 text-[9px] font-bold text-emerald-400 flex items-center gap-1.5 bg-emerald-950/20">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Actual Pose
                  </div>
                  <div className="px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-[9px] font-bold text-amber-400 flex items-center gap-1.5 bg-amber-950/20">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Estimated Pose
                  </div>
                </div>

                {/* Control Panel in Top Right */}
                <div className="absolute top-4 right-4 flex gap-2 z-10">
                  <button 
                    onClick={() => setViewMode(prev => prev === '3d' ? '2d' : '3d')}
                    className="px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] font-black uppercase text-gray-300 transition-all"
                  >
                    Mode: {viewMode.toUpperCase()}
                  </button>
                  {viewMode === '3d' && (
                    <button 
                      onClick={() => setTrackRobot(prev => !prev)}
                      className={`px-2.5 py-1 rounded-md border text-[9px] font-black uppercase transition-all ${trackRobot ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-400' : 'bg-white/5 border-white/10 text-gray-300'}`}
                    >
                      Track: {trackRobot ? 'ON' : 'OFF'}
                    </button>
                  )}
                  <button 
                    onClick={() => setShowLidar(prev => !prev)}
                    className={`px-2.5 py-1 rounded-md border text-[9px] font-black uppercase transition-all ${showLidar ? 'bg-red-500/10 border-red-500/35 text-red-400' : 'bg-white/5 border-white/10 text-gray-300'}`}
                  >
                    LiDAR: {showLidar ? 'SHOW' : 'HIDE'}
                  </button>
                  <button 
                    onClick={() => setShowSlam(prev => !prev)}
                    className={`px-2.5 py-1 rounded-md border text-[9px] font-black uppercase transition-all ${showSlam ? 'bg-blue-500/10 border-blue-500/35 text-blue-400' : 'bg-white/5 border-white/10 text-gray-300'}`}
                  >
                    SLAM: {showSlam ? 'SHOW' : 'HIDE'}
                  </button>
                </div>
                
                <canvas 
                  ref={canvasRef} 
                  width={460} 
                  height={460} 
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onWheel={handleWheel}
                  className={`rounded-xl shadow-2xl border border-white/10 ${viewMode === '3d' ? 'cursor-grab active:cursor-grabbing' : ''}`} 
                />

                {/* HUD Overlay inside Canvas Panel */}
                <div className="absolute bottom-4 left-4 right-4 flex justify-between bg-black/75 backdrop-blur-md border border-white/10 px-4 py-2.5 rounded-xl text-[10px] font-mono z-10 shadow-lg">
                  <div className="flex gap-4">
                    <div>
                      <span className="text-gray-500 uppercase text-[8px] font-bold block">Cleanup Progress</span>
                      <span className="text-amber-400 font-bold">
                        {(() => {
                          const total = dirtParticlesRef.current.length;
                          const cleaned = dirtParticlesRef.current.filter(p => !p.active).length;
                          return total > 0 ? ((cleaned / total) * 100).toFixed(1) : '0.0';
                        })()}%
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 uppercase text-[8px] font-bold block">Battery</span>
                      <span className={`${(state.battery_level ?? 100) < 20 ? 'text-red-400' : 'text-emerald-400'} font-bold`}>
                        {Number(state.battery_level !== undefined ? state.battery_level : (state.battery ?? 100)).toFixed(1)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 uppercase text-[8px] font-bold block">Dustbin Level</span>
                      <span className={`${(state.dustbin_level ?? 0) > 85 ? 'text-red-400' : 'text-sky-400'} font-bold`}>
                        {Number(state.dustbin_level !== undefined ? state.dustbin_level : (state.dust ?? 0)).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-gray-500 uppercase text-[8px] font-bold block">LiDAR Scanner Status</span>
                    <span className="text-emerald-400 font-bold animate-pulse">ACTIVE (8Hz)</span>
                  </div>
                </div>
              </div>

              <div className="flex-[4] overflow-y-auto space-y-6 bg-black/20 border border-white/5 rounded-2xl p-6 min-h-0">
                <div className="space-y-4">
                  <div className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <Activity size={14} className="text-amber-500" />
                    Real-time Telemetry
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-1">
                      <span className="text-[9px] text-gray-500 uppercase font-black">Actual Pose</span>
                      <div className="text-xs font-mono font-bold text-gray-200">
                        X: {Number(state.x ?? 0).toFixed(3)} m<br/>
                        Y: {Number(state.y ?? 0).toFixed(3)} m<br/>
                        θ: {Number(state.theta ?? 0).toFixed(3)} rad
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-1">
                      <span className="text-[9px] text-gray-500 uppercase font-black">Estimated Pose</span>
                      <div className="text-xs font-mono font-bold text-gray-200">
                        X: {Number(state.x_est ?? 0).toFixed(3)} m<br/>
                        Y: {Number(state.y_est ?? 0).toFixed(3)} m<br/>
                        θ: {Number(state.theta_est ?? 0).toFixed(3)} rad
                      </div>
                    </div>

                    <div className="col-span-2 p-4 rounded-xl bg-white/5 border border-white/5 space-y-2">
                      <span className="text-[9px] text-gray-500 uppercase font-black">Estimation Drift Error</span>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <div className="text-[8px] text-gray-600 font-bold uppercase">ΔX (m)</div>
                          <div className="text-xs font-mono font-bold text-red-400">{errorX.toFixed(4)}</div>
                        </div>
                        <div>
                          <div className="text-[8px] text-gray-600 font-bold uppercase">ΔY (m)</div>
                          <div className="text-xs font-mono font-bold text-red-400">{errorY.toFixed(4)}</div>
                        </div>
                        <div>
                          <div className="text-[8px] text-gray-600 font-bold uppercase">Δθ (rad)</div>
                          <div className="text-xs font-mono font-bold text-red-400">{errorTheta.toFixed(4)}</div>
                        </div>
                      </div>
                    </div>

                    <div className="col-span-2 p-4 rounded-xl bg-amber-500/[0.03] border border-amber-500/10 space-y-2">
                      <span className="text-[9px] text-amber-500 uppercase font-black tracking-wider block">
                        Dynamics & Energy Routing (SRS v2.0)
                      </span>
                      <div className="grid grid-cols-2 gap-4 font-mono text-xs text-gray-300">
                        <div>
                          <span className="text-[8px] text-gray-600 font-bold uppercase block">Linear Speed V (m/s)</span>
                          <span className="text-gray-200 font-bold">
                            {Number(state.v_chassis ?? 0).toFixed(3)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[8px] text-gray-600 font-bold uppercase block">Angular Speed ω (rad/s)</span>
                          <span className="text-gray-200 font-bold">
                            {Number(state.w_chassis ?? 0).toFixed(3)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[8px] text-gray-600 font-bold uppercase block">Optimal Energy E_opt</span>
                          <span className="text-gray-200 font-bold">
                            {Number(state.E_opt ?? 0).toFixed(3)}%
                          </span>
                        </div>
                        <div>
                          <span className="text-[8px] text-gray-600 font-bold uppercase block">Remaining Path E_path</span>
                          <span className="text-gray-200 font-bold">
                            {Number(state.E_path ?? 0).toFixed(3)}%
                          </span>
                        </div>
                        <div className="col-span-2 flex justify-between items-center pt-1 border-t border-white/5">
                          <div>
                            <span className="text-[8px] text-gray-600 font-bold uppercase">Energy Ratio Re</span>
                            <div className="text-sm font-bold text-amber-400">
                              {Number(state.Re ?? 1.0).toFixed(3)}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-[8px] text-gray-600 font-bold uppercase block">Routing Mode</span>
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${state.using_constrained ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>
                              {state.using_constrained ? 'Constrained A*' : 'Standard A*'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <BarChart2 size={14} className="text-amber-500" />
                    LiDAR Laser Scans
                  </div>
                  <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-2 font-mono text-[10px]">
                    {state.lidarRanges?.map((val: number, idx: number) => {
                      const percentage = Math.min(100, (val / (block.params?.lidar_max_range || 4.0)) * 100);
                      const angleNames = ['0° (F)', '45° (FL)', '90° (L)', '135° (BL)', '180° (B)', '-135° (BR)', '-90° (R)', '-45° (FR)'];
                      return (
                        <div key={idx} className="flex items-center gap-3">
                          <span className="w-16 font-bold text-gray-400">{angleNames[idx]}</span>
                          <div className="flex-1 h-2 bg-slate-950 rounded overflow-hidden">
                            <div 
                              className="h-full bg-red-500/80 rounded" 
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <span className="w-10 text-right font-bold text-red-400">{val.toFixed(2)}m</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <Info size={14} className="text-amber-500" />
                    Mathematical Principles
                  </div>
                  <div className="p-4 rounded-xl bg-amber-500/[0.02] border border-amber-500/10 text-[10px] text-gray-400 space-y-3 leading-relaxed">
                    <p>
                      <strong>1. Chassis Kinematics (Plant)</strong><br />
                      The differential drive forward kinematics translate Left/Right wheel velocities to linear ($V$) and angular ($\omega$) velocities:
                      <code className="block p-1 bg-slate-900 rounded my-1 text-[9px] text-slate-300">
                        V = R * (ω_R + ω_L) / 2<br />
                        ω = R * (ω_R - ω_L) / L_sep
                      </code>
                    </p>
                    <p>
                      <strong>2. Sensor Fusion complementary filter</strong><br />
                      Dead-reckoning odometry drifts due to wheel slippage. The complementary filter corrects the estimated state towards the true coordinates:
                      <code className="block p-1 bg-slate-900 rounded my-1 text-[9px] text-slate-300">
                        x_est = x_est_raw + K_slam * (x_true - x_est)<br />
                        y_est = y_est_raw + K_slam * (y_true - y_est)
                      </code>
                      This represents the scan-matching correction loop in a SLAM implementation.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  return (
    <Dialog.Root open={true} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] h-[85vh] bg-[#141414] border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col z-[101] outline-none">
          {/* Header */}
          <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-black/20">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                <Activity size={20} />
              </div>
              <div>
                <Dialog.Title className="text-lg font-black text-white uppercase tracking-wider">
                  Scope Viewer
                </Dialog.Title>
                <div className="text-[10px] font-mono text-gray-500 uppercase tracking-tighter">
                  Block ID: {block.id} • {numSignals} Channels • {history.length} Samples
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button 
                onClick={downloadCSV}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all text-xs font-bold"
              >
                <Download size={14} />
                Export CSV
              </button>
              {onUpdate && (
                <button 
                  onClick={() => setShowSettings(!showSettings)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all text-xs font-bold ${
                    showSettings 
                      ? 'bg-[#c9a86c]/20 text-[#c9a86c] border-[#c9a86c]/30' 
                      : 'bg-white/5 text-gray-300 hover:bg-white/10 border-white/5'
                  }`}
                  title="Scope Settings"
                >
                  <Settings2 size={14} />
                  Settings
                </button>
              )}
              <button 
                onClick={onClose}
                className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-all"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          <div className="flex-1 flex overflow-hidden">
            {/* Collapsible settings panel */}
            {showSettings && onUpdate && (
              <div className="w-64 border-r border-white/5 bg-black/20 p-5 space-y-4 flex flex-col shrink-0 overflow-y-auto custom-scrollbar">
                <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Scope Settings</div>
                
                {/* Time Range */}
                <div className="space-y-1">
                  <label className="block text-[9px] font-bold text-gray-400 uppercase">Time Range</label>
                  <select
                    value={String(block.params?.timeRange || 'auto')}
                    onChange={(e) => onUpdate({ ...block.params, timeRange: e.target.value })}
                    className="w-full text-xs px-2 py-1.5 border border-[#333] bg-[#0a0a0a] text-[#c9a86c] font-bold rounded focus:border-[#c9a86c] outline-none"
                  >
                    <option value="auto">Auto (Full)</option>
                    <option value="1">1s</option>
                    <option value="2">2s</option>
                    <option value="5">5s</option>
                    <option value="10">10s</option>
                    <option value="30">30s</option>
                    <option value="60">60s</option>
                  </select>
                </div>

                {/* Limit Data Points */}
                <div className="space-y-1">
                  <label className="block text-[9px] font-bold text-gray-400 uppercase">Limit Data Points</label>
                  <select
                    value={String(block.params?.limitDataPoints !== false)}
                    onChange={(e) => onUpdate({ ...block.params, limitDataPoints: e.target.value === 'true' })}
                    className="w-full text-xs px-2 py-1.5 border border-[#333] bg-[#0a0a0a] text-gray-300 rounded focus:border-[#c9a86c] outline-none"
                  >
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </div>

                {/* Buffer Size */}
                <div className="space-y-1">
                  <label className="block text-[9px] font-bold text-gray-400 uppercase">Max Points (Buffer)</label>
                  <input
                    type="number"
                    value={block.params?.bufferSize || 1000}
                    onChange={(e) => onUpdate({ ...block.params, bufferSize: parseInt(e.target.value) || 1000 })}
                    className="w-full text-xs px-2.5 py-1 border border-[#333] bg-[#0a0a0a] text-white rounded focus:border-[#c9a86c] outline-none font-mono"
                  />
                </div>

                {/* Decimation */}
                <div className="space-y-1">
                  <label className="block text-[9px] font-bold text-gray-400 uppercase">Decimation</label>
                  <input
                    type="number"
                    min="1"
                    value={block.params?.decimation || 1}
                    onChange={(e) => onUpdate({ ...block.params, decimation: parseInt(e.target.value) || 1 })}
                    className="w-full text-xs px-2.5 py-1 border border-[#333] bg-[#0a0a0a] text-white rounded focus:border-[#c9a86c] outline-none font-mono"
                  />
                </div>

                {/* Sample Time */}
                <div className="space-y-1">
                  <label className="block text-[9px] font-bold text-gray-400 uppercase">Sample Time (s)</label>
                  <input
                    type="number"
                    step="any"
                    value={block.params?.sampleTime ?? -1}
                    onChange={(e) => onUpdate({ ...block.params, sampleTime: parseFloat(e.target.value) || -1 })}
                    className="w-full text-xs px-2.5 py-1 border border-[#333] bg-[#0a0a0a] text-white rounded focus:border-[#c9a86c] outline-none font-mono"
                  />
                </div>

                {/* Show Grid */}
                <div className="space-y-1">
                  <label className="block text-[9px] font-bold text-gray-400 uppercase">Grid</label>
                  <select
                    value={String(block.params?.showGrid !== false)}
                    onChange={(e) => onUpdate({ ...block.params, showGrid: e.target.value === 'true' })}
                    className="w-full text-xs px-2 py-1.5 border border-[#333] bg-[#0a0a0a] text-gray-300 rounded focus:border-[#c9a86c] outline-none"
                  >
                    <option value="true">Show</option>
                    <option value="false">Hide</option>
                  </select>
                </div>

                {/* Show Legend */}
                <div className="space-y-1">
                  <label className="block text-[9px] font-bold text-gray-400 uppercase">Legend</label>
                  <select
                    value={String(block.params?.showLegend !== false)}
                    onChange={(e) => onUpdate({ ...block.params, showLegend: e.target.value === 'true' })}
                    className="w-full text-xs px-2 py-1.5 border border-[#333] bg-[#0a0a0a] text-gray-300 rounded focus:border-[#c9a86c] outline-none"
                  >
                    <option value="true">Show</option>
                    <option value="false">Hide</option>
                  </select>
                </div>
              </div>
            )}

            {/* Main Plot Area */}
            <div className="flex-1 p-6 flex flex-col min-w-0">
              <div className="flex-1 bg-black/40 rounded-xl border border-white/5 p-4 shadow-inner">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={displayData}>
                    {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />}
                    <XAxis 
                      dataKey="t" 
                      type="number" 
                      domain={['auto', 'auto']} 
                      stroke="#444" 
                      fontSize={10}
                      tickFormatter={(t) => `${t.toFixed(2)}s`}
                    />
                    <YAxis 
                      stroke="#444" 
                      fontSize={10} 
                      width={40}
                      tickFormatter={(v) => v.toFixed(1)}
                    />
                    <Tooltip 
                      contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', fontSize: '12px' }}
                      itemStyle={{ fontWeight: 'bold' }}
                      labelStyle={{ color: '#888', marginBottom: '4px' }}
                      labelFormatter={(t) => `Time: ${Number(t).toFixed(4)}s`}
                    />
                    {showLegend && <Legend iconType="circle" />}
                    {Array.from({ length: numSignals }, (_, i) => (
                      <Line 
                        key={i}
                        name={`Channel ${i+1}`}
                        type="monotone" 
                        dataKey={`y${i+1}`} 
                        stroke={getSignalColor(i)} 
                        strokeWidth={2} 
                        dot={false} 
                        isAnimationActive={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Statistics Sidebar */}
            <div className="w-80 border-l border-white/5 bg-black/10 p-6 overflow-y-auto space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-black text-gray-400 uppercase tracking-widest">
                  <BarChart2 size={14} className="text-[#c9a86c]" />
                  Real-time Measurements
                </div>

                <div className="space-y-3">
                  {Array.from({ length: numSignals }, (_, i) => {
                    const stats = calculateStats(`y${i+1}`);
                    const color = getSignalColor(i);
                    return (
                      <div key={i} className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                          <span className="text-xs font-bold text-white">Channel {i+1}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <div className="text-[9px] text-gray-500 uppercase font-black">Mean</div>
                            <div className="text-sm font-mono text-emerald-400">{stats.mean.toFixed(4)}</div>
                          </div>
                          <div>
                            <div className="text-[9px] text-gray-500 uppercase font-black">RMS</div>
                            <div className="text-sm font-mono text-blue-400">{stats.rms.toFixed(4)}</div>
                          </div>
                          <div className="col-span-2">
                            <div className="text-[9px] text-gray-500 uppercase font-black">Peak-to-Peak</div>
                            <div className="text-sm font-mono text-amber-400">{stats.pk2pk.toFixed(4)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/10 flex gap-3">
                <Info size={16} className="text-amber-500 shrink-0" />
                <p className="text-[10px] text-amber-500/80 leading-relaxed italic">
                  Statistics are calculated based on the current visible buffer ({history.length} samples).
                </p>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
