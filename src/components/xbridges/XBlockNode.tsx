// src/components/xbridges/XBlockNode.tsx
import React from 'react';
import { Handle, Position, useUpdateNodeInternals, NodeResizer } from 'reactflow';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { 
  Square, Activity, Plus, Minus, X, Divide, ChevronUp, MinusCircle, Maximize, Maximize2,
  Sigma, BarChart, ArrowUp, Grid, RotateCw, RefreshCcw, Hash, TrendingUp, Monitor, Box, Download,
  LogIn, LogOut, ChevronLeft, ChevronRight, Zap, Settings, ZapOff, Cpu, Layers, Wind, Filter, Eye,
  GraduationCap, ArrowRightCircle, ArrowLeftCircle, Network, FlaskConical, FileText
} from 'lucide-react';
import { LineChart, Line, AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';
import { XPort } from '../../engine/xbridges/types';
import { XBRIDGES_CATEGORIES, raycastTwin, ROOM_WALLS, ROOM_CIRCLES, ROOM_BOXES, MATLAB_WALLS, MATLAB_OBSTACLES, polyToString, zpgToString, findRoots } from '../../engine/xbridges/BlockDefinitions';
import { WorkspaceContext } from './context';

// Map icon string names to Lucide icon components
const LucideIconMap: Record<string, React.ComponentType<any>> = {
  'square': Square,
  'activity': Activity,
  'plus': Plus,
  'minus': Minus,
  'x': X,
  'divide': Divide,
  'chevron-up': ChevronUp,
  'minus-circle': MinusCircle,
  'maximize': Maximize,
  'maximize2': Maximize2,
  'sigma': Sigma,
  'bar-chart': BarChart,
  'arrow-up': ArrowUp,
  'grid': Grid,
  'rotate-cw': RotateCw,
  'refresh-ccw': RefreshCcw,
  'hash': Hash,
  'trending-up': TrendingUp,
  'monitor': Monitor,
  'box': Box,
  'download': Download,
  'log-in': LogIn,
  'log-out': LogOut,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'zap': Zap,
  'settings': Settings,
  'zap-off': ZapOff,
  'cpu': Cpu,
  'layers': Layers,
  'wind': Wind,
  'filter': Filter,
  'eye': Eye,
  'graduation-cap': GraduationCap,
  'arrow-right-circle': ArrowRightCircle,
  'arrow-left-circle': ArrowLeftCircle,
  'network': Network,
  'integral': TrendingUp,
  'file-text': FileText,
};

// Build mapping of block type to icon name from categories
const blockTypeToIconName: Record<string, string> = {};
XBRIDGES_CATEGORIES.forEach(cat => {
  cat.blocks.forEach(b => {
    blockTypeToIconName[b.type] = b.icon;
  });
});

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

interface DustParticle {
  id: number;
  x: number;
  y: number;
  scale: number;
  opacity: number;
  isSucked: boolean;
}

const RobotTwinCanvas: React.FC<{ state: any }> = ({ state }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const stateRef = React.useRef(state);
  const dustParticlesRef = React.useRef<DustParticle[]>([]);

  // Telemetry HUD refs
  const stateTextRef = React.useRef<HTMLSpanElement>(null);
  const batTextRef = React.useRef<HTMLSpanElement>(null);
  const batBarRef = React.useRef<HTMLDivElement>(null);
  const covRef = React.useRef<HTMLSpanElement>(null);
  const effRef = React.useRef<HTMLSpanElement>(null);
  const distRef = React.useRef<HTMLSpanElement>(null);
  const confRef = React.useRef<HTMLSpanElement>(null);
  const errRef = React.useRef<HTMLSpanElement>(null);
  const latRef = React.useRef<HTMLSpanElement>(null);
  const lossRef = React.useRef<HTMLSpanElement>(null);

  // Local Ref representing the smoothly interpolated variables
  const smoothRobot = React.useRef({
    x: 0,
    y: 0,
    theta: 0,
    x_est: 0,
    y_est: 0,
    theta_est: 0,
    battery: 100,
    confidence: 100,
    coverage: 0,
    efficiency: 100,
    distance: 0,
    latency: 50,
    loss: 0
  });

  React.useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Seed cosmetic dust particles on first load
  React.useEffect(() => {
    const list: DustParticle[] = [];
    for (let i = 0; i < 30; i++) {
      list.push({
        id: i,
        x: (Math.random() - 0.5) * 5.0, // Spread across map
        y: (Math.random() - 0.5) * 5.0,
        scale: Math.random() * 1.5 + 1.0,
        opacity: Math.random() * 0.4 + 0.3,
        isSucked: false
      });
    }
    dustParticlesRef.current = list;
  }, []);

  // Tween incoming discrete simulation updates to 60fps values
  useGSAP(() => {
    if (!state) return;
    const navStats = state.nav_stats || [0, 100, 0, 100];
    const commStats = state.comm_stats || [50, 0, 0];

    gsap.to(smoothRobot.current, {
      x: state.x !== undefined && !isNaN(state.x) ? state.x : 0,
      y: state.y !== undefined && !isNaN(state.y) ? state.y : 0,
      theta: state.theta !== undefined && !isNaN(state.theta) ? state.theta : 0,
      x_est: state.x_est !== undefined && !isNaN(state.x_est) ? state.x_est : 0,
      y_est: state.y_est !== undefined && !isNaN(state.y_est) ? state.y_est : 0,
      theta_est: state.theta_est !== undefined && !isNaN(state.theta_est) ? state.theta_est : 0,
      battery: state.battery_level !== undefined && !isNaN(state.battery_level) ? state.battery_level : 100,
      confidence: state.confidence !== undefined && !isNaN(state.confidence) ? state.confidence : 100,
      coverage: navStats[0] !== undefined ? navStats[0] : 0,
      efficiency: navStats[1] !== undefined ? navStats[1] : 100,
      distance: navStats[2] !== undefined ? navStats[2] : 0,
      latency: commStats[0] !== undefined ? commStats[0] : 50,
      loss: commStats[1] !== undefined ? commStats[1] : 0,
      duration: 0.15,
      ease: 'power1.out',
      overwrite: 'auto'
    });

    // Tween HUD Numbers
    if (batTextRef.current) {
      gsap.to(batTextRef.current, {
        innerText: state.battery_level !== undefined ? state.battery_level : 100,
        snap: { innerText: 1 },
        duration: 0.3,
        ease: 'power2.out',
        modifiers: { innerText: (v) => `${parseFloat(v).toFixed(0)}%` }
      });
    }

    if (batBarRef.current) {
      gsap.to(batBarRef.current, {
        width: `${state.battery_level ?? 100}%`,
        duration: 0.3,
        ease: 'power2.out'
      });
    }

    if (covRef.current) {
      gsap.to(covRef.current, {
        innerText: navStats[0] ?? 0,
        snap: { innerText: 1 },
        duration: 0.4,
        ease: 'power2.out',
        modifiers: { innerText: (v) => `${parseFloat(v).toFixed(0)}%` }
      });
    }

    if (effRef.current) {
      gsap.to(effRef.current, {
        innerText: navStats[1] ?? 100,
        snap: { innerText: 1 },
        duration: 0.4,
        ease: 'power2.out',
        modifiers: { innerText: (v) => `${parseFloat(v).toFixed(0)}%` }
      });
    }

    if (distRef.current) {
      gsap.to(distRef.current, {
        innerText: navStats[2] ?? 0,
        snap: { innerText: 0.1 },
        duration: 0.4,
        ease: 'power2.out',
        modifiers: { innerText: (v) => `${parseFloat(v).toFixed(1)}m` }
      });
    }

    if (confRef.current) {
      gsap.to(confRef.current, {
        innerText: state.confidence ?? 100,
        snap: { innerText: 1 },
        duration: 0.4,
        ease: 'power2.out',
        modifiers: { innerText: (v) => `${parseFloat(v).toFixed(0)}%` }
      });
    }

    if (errRef.current) {
      const trueX = state.x ?? 0;
      const trueY = state.y ?? 0;
      const estX = state.x_est ?? 0;
      const estY = state.y_est ?? 0;
      const posErr = Math.sqrt(Math.pow(trueX - estX, 2) + Math.pow(trueY - estY, 2));

      gsap.to(errRef.current, {
        innerText: posErr,
        snap: { innerText: 0.01 },
        duration: 0.4,
        ease: 'power2.out',
        modifiers: { innerText: (v) => `${parseFloat(v).toFixed(2)}m` }
      });
    }

    if (latRef.current) {
      gsap.to(latRef.current, {
        innerText: commStats[0] ?? 50,
        snap: { innerText: 1 },
        duration: 0.4,
        ease: 'power2.out',
        modifiers: { innerText: (v) => `${parseFloat(v).toFixed(0)}ms` }
      });
    }

    if (lossRef.current) {
      gsap.to(lossRef.current, {
        innerText: commStats[1] ?? 0,
        snap: { innerText: 1 },
        duration: 0.4,
        ease: 'power2.out',
        modifiers: { innerText: (v) => `${parseFloat(v).toFixed(0)} pkts` }
      });
    }
  }, [state]);

  // Slide-in animation on mount
  useGSAP(() => {
    gsap.from('.hud-card-robot', {
      x: -25,
      opacity: 0,
      duration: 0.6,
      ease: 'back.out(1.4)'
    });
  }, { scope: containerRef });

  // Render loop
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const draw = () => {
      const s = smoothRobot.current;
      const W = canvas.width;
      const H = canvas.height;
      const now = performance.now();

      // Clear
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, W, H);

      const currentState = stateRef.current;
      if (!currentState) {
        ctx.fillStyle = '#64748b';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('WAITING FOR SIMULATION', W / 2, H / 2);
        animationFrameId = requestAnimationFrame(draw);
        return;
      }

      // Check if we should use Matlab coordinates range [-6.0, 6.0]
      const isMatlabActive = Math.abs(currentState.x || 0) > 3.05 || Math.abs(currentState.y || 0) > 3.05;
      const minVal = isMatlabActive ? -6.0 : -3.0;
      const sizeVal = isMatlabActive ? 12.0 : 6.0;

      const scaleX = (x: number) => 10 + (x - minVal) / sizeVal * (W - 20);
      const scaleY = (y: number) => H - 10 - (y - minVal) / sizeVal * (H - 20);
      const scaleR = (r: number) => r / sizeVal * (W - 20);

      // Check suction for cosmetic dust particles
      dustParticlesRef.current.forEach(p => {
        if (p.isSucked) return;
        const dist = Math.sqrt(Math.pow(p.x - s.x, 2) + Math.pow(p.y - s.y, 2));
        if (dist < 0.4) {
          p.isSucked = true;
          gsap.to(p, {
            x: s.x,
            y: s.y,
            scale: 0,
            opacity: 0,
            duration: 0.25,
            ease: 'power2.in',
            onComplete: () => {
              // Re-spawn in uncleaned area
              let spawned = false;
              const grid = currentState.cleanedGrid;
              if (grid && Array.isArray(grid)) {
                for (let retry = 0; retry < 10; retry++) {
                  const r = Math.floor(Math.random() * 30);
                  const c = Math.floor(Math.random() * 30);
                  if (grid[r][c] === 0) {
                    p.x = minVal + (c / 30) * sizeVal;
                    p.y = minVal + (r / 30) * sizeVal;
                    spawned = true;
                    break;
                  }
                }
              }
              if (!spawned) {
                p.x = (Math.random() - 0.5) * sizeVal;
                p.y = (Math.random() - 0.5) * sizeVal;
              }
              p.scale = Math.random() * 1.5 + 1.0;
              p.opacity = Math.random() * 0.4 + 0.3;
              p.isSucked = false;
            }
          });
        }
      });

      // 1. Draw SLAM occupancy grid
      const grid = currentState.grid;
      if (grid && Array.isArray(grid)) {
        const cellW = (W - 20) / 30;
        const cellH = (H - 20) / 30;
        for (let r = 0; r < 30; r++) {
          for (let c = 0; c < 30; c++) {
            const val = grid[r][c];
            if (val !== 0) {
              if (val > 0) {
                ctx.fillStyle = `rgba(249, 115, 22, ${Math.min(0.65, val / 100)})`;
              } else {
                ctx.fillStyle = `rgba(51, 65, 85, ${Math.min(0.4, -val / 100)})`;
              }
              const cx_cell = 10 + c * cellW;
              const cy_cell = H - 10 - (r + 1) * cellH;
              ctx.fillRect(cx_cell, cy_cell, cellW, cellH);
            }
          }
        }
      }

      // 1.5 Draw Coverage grid (Cleaned Grid)
      const cleanedGrid = currentState.cleanedGrid;
      if (cleanedGrid && Array.isArray(cleanedGrid)) {
        const cellW = (W - 20) / 30;
        const cellH = (H - 20) / 30;
        ctx.fillStyle = 'rgba(6, 182, 212, 0.16)';
        for (let r = 0; r < 30; r++) {
          for (let c = 0; c < 30; c++) {
            if (cleanedGrid[r][c] === 1) {
              const cx_cell = 10 + c * cellW;
              const cy_cell = H - 10 - (r + 1) * cellH;
              ctx.fillRect(cx_cell, cy_cell, cellW, cellH);
            }
          }
        }
      }

      // Draw subtle grid overlay texture
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 0.5;
      const gridStep = isMatlabActive ? 1.0 : 0.5;
      for (let x = minVal; x <= -minVal; x += gridStep) {
        ctx.beginPath();
        ctx.moveTo(scaleX(x), scaleY(minVal));
        ctx.lineTo(scaleX(x), scaleY(-minVal));
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(scaleX(minVal), scaleY(x));
        ctx.lineTo(scaleX(-minVal), scaleY(x));
        ctx.stroke();
      }

      // Draw active dust particles
      dustParticlesRef.current.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = '#857262';
        ctx.beginPath();
        ctx.arc(scaleX(p.x), scaleY(p.y), p.scale * 0.7, 0, 2 * Math.PI);
        ctx.fill();
        ctx.restore();
      });

      const walls = isMatlabActive ? MATLAB_WALLS : ROOM_WALLS;
      const circles = isMatlabActive ? MATLAB_OBSTACLES : ROOM_CIRCLES;
      const boxes = isMatlabActive ? [] : ROOM_BOXES;

      // Draw Multi-room boundaries
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2.0;
      walls.forEach(w => {
        ctx.beginPath();
        ctx.moveTo(scaleX(w.x1), scaleY(w.y1));
        ctx.lineTo(scaleX(w.x2), scaleY(w.y2));
        ctx.stroke();
      });

      // 2. Draw Obstacles
      const obstacleGlow = 0.04 * Math.sin(now * 0.003);
      circles.forEach((c, idx) => {
        ctx.fillStyle = `rgba(51, 65, 85, ${0.15 + obstacleGlow})`;
        ctx.strokeStyle = `rgba(148, 163, 184, ${0.25 + 0.05 * Math.sin(now * 0.002 + idx)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(scaleX(c.cx), scaleY(c.cy), scaleR(c.r + 0.06 * Math.sin(now * 0.003 + idx)), 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        const grad = ctx.createRadialGradient(
          scaleX(c.cx) - scaleR(c.r)/3, scaleY(c.cy) - scaleR(c.r)/3, scaleR(c.r)*0.1,
          scaleX(c.cx), scaleY(c.cy), scaleR(c.r)
        );
        grad.addColorStop(0, '#475569');
        grad.addColorStop(1, '#1e293b');

        ctx.fillStyle = grad;
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(scaleX(c.cx), scaleY(c.cy), scaleR(c.r), 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
      });

      boxes.forEach((b, idx) => {
        const bx = scaleX(b.x1);
        const by = scaleY(b.y2);
        const bw = scaleR(b.x2 - b.x1);
        const bh = scaleR(b.y2 - b.y1);

        ctx.fillStyle = `rgba(51, 65, 85, ${0.15 + obstacleGlow})`;
        ctx.strokeStyle = `rgba(148, 163, 184, ${0.25 + 0.05 * Math.sin(now * 0.002 - idx)})`;
        ctx.lineWidth = 1;
        const grow = 2 + 2 * Math.sin(now * 0.003 - idx);
        ctx.fillRect(bx - grow, by - grow, bw + 2*grow, bh + 2*grow);
        ctx.strokeRect(bx - grow, by - grow, bw + 2*grow, bh + 2*grow);

        const grad = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
        grad.addColorStop(0, '#475569');
        grad.addColorStop(1, '#1e293b');
        ctx.fillStyle = grad;
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1.5;
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeRect(bx, by, bw, bh);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let offset = 4; offset < bw; offset += 8) {
          ctx.moveTo(bx + offset, by);
          ctx.lineTo(bx, by + offset);
          ctx.moveTo(bx + bw, by + offset);
          ctx.lineTo(bx + offset, by + bh);
        }
        ctx.stroke();
      });

      // 3. Docking station signal beacons
      const isDocking = currentState.navState === 8;
      const isCharging = currentState.navState === 9;
      const dockPulseRadius = ((now * 0.05) % 60);
      const dockAlpha = 1 - (dockPulseRadius / 60);
      const dockX = isMatlabActive ? -5.1 : 0.0;
      const dockY = isMatlabActive ? -5.1 : -2.8;

      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(scaleX(dockX), scaleY(dockY), 5, 0, 2 * Math.PI);
      ctx.fill();

      ctx.strokeStyle = `rgba(16, 185, 129, ${dockAlpha * (isDocking || isCharging ? 0.8 : 0.35)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(scaleX(dockX), scaleY(dockY), 5 + dockPulseRadius, 0, 2 * Math.PI);
      ctx.stroke();

      if (isDocking || isCharging) {
        ctx.beginPath();
        ctx.arc(scaleX(dockX), scaleY(dockY), 5 + (dockPulseRadius + 30) % 60, 0, 2 * Math.PI);
        ctx.stroke();
      }

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 7px sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText('D', scaleX(dockX), scaleY(dockY));

      // Draw active path targets
      if (currentState.targetX !== undefined && currentState.targetY !== undefined && currentState.navState !== 1) {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(scaleX(s.x), scaleY(s.y));
        ctx.lineTo(scaleX(currentState.targetX), scaleY(currentState.targetY));
        ctx.stroke();
        ctx.setLineDash([]);

        const targetPulse = 3.5 + 2 * Math.sin(now * 0.01);
        ctx.fillStyle = `rgba(239, 68, 68, ${0.5 + 0.4 * Math.sin(now * 0.01)})`;
        ctx.beginPath();
        ctx.arc(scaleX(currentState.targetX), scaleY(currentState.targetY), targetPulse, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(scaleX(currentState.targetX), scaleY(currentState.targetY), 2.2, 0, 2 * Math.PI);
        ctx.fill();
      }

      // Pre-planned sweep path waypoints
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(scaleX(WAYPOINTS[0].x), scaleY(WAYPOINTS[0].y));
      for (let i = 1; i < WAYPOINTS.length; i++) {
        ctx.lineTo(scaleX(WAYPOINTS[i].x), scaleY(WAYPOINTS[i].y));
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Robot paths: true trail (smoothly drawn via interpolated path coordinates)
      const trail = currentState.trail;
      if (trail && Array.isArray(trail) && trail.length > 1) {
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2.0;
        ctx.shadowColor = '#10b981';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.moveTo(scaleX(trail[0][0]), scaleY(trail[0][1]));
        for (let i = 1; i < trail.length; i++) {
          ctx.lineTo(scaleX(trail[i][0]), scaleY(trail[i][1]));
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Robot paths: estimated trail (amber)
      const estTrail = currentState.estTrail;
      if (estTrail && Array.isArray(estTrail) && estTrail.length > 1) {
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(scaleX(estTrail[0][0]), scaleY(estTrail[0][1]));
        for (let i = 1; i < estTrail.length; i++) {
          ctx.lineTo(scaleX(estTrail[i][0]), scaleY(estTrail[i][1]));
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 4. LiDAR active scan rays + ripples
      const ranges = currentState.lidarRanges;
      if (ranges && Array.isArray(ranges)) {
        const numBeams = ranges.length;
        const beamAngles = [];
        for (let i = 0; i < numBeams; i++) {
          beamAngles.push((i * 2 * Math.PI) / numBeams);
        }
        
        const sweepAngle = (now * 0.004) % (2 * Math.PI);
        const ldsMaxRange = 4.0;
        const sweepDist = raycastTwin(s.x, s.y, sweepAngle, ldsMaxRange, 0);
        const sx_hit = s.x + sweepDist * Math.cos(sweepAngle);
        const sy_hit = s.y + sweepDist * Math.sin(sweepAngle);

        const laserGrad = ctx.createLinearGradient(
          scaleX(s.x), scaleY(s.y),
          scaleX(sx_hit), scaleY(sy_hit)
        );
        laserGrad.addColorStop(0, 'rgba(249, 115, 22, 0.4)');
        laserGrad.addColorStop(0.8, 'rgba(249, 115, 22, 0.2)');
        laserGrad.addColorStop(1, 'rgba(249, 115, 22, 0.0)');
        ctx.strokeStyle = laserGrad;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(scaleX(s.x), scaleY(s.y));
        ctx.lineTo(scaleX(sx_hit), scaleY(sy_hit));
        ctx.stroke();

        ctx.fillStyle = '#f97316';
        ctx.shadowColor = '#f97316';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(scaleX(sx_hit), scaleY(sy_hit), 2.0, 0, 2 * Math.PI);
        ctx.fill();
        ctx.shadowBlur = 0;

        for (let i = 0; i < ranges.length; i++) {
          const absAngle = s.theta + beamAngles[i];
          const r = ranges[i];
          const lx = s.x + r * Math.cos(absAngle);
          const ly = s.y + r * Math.sin(absAngle);

          ctx.strokeStyle = 'rgba(239, 68, 68, 0.25)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(scaleX(s.x), scaleY(s.y));
          ctx.lineTo(scaleX(lx), scaleY(ly));
          ctx.stroke();

          const waveSpeed = 1000;
          const wavePhase = (now % waveSpeed) / waveSpeed;
          const pulseDist = r * wavePhase;
          const px_wave = s.x + pulseDist * Math.cos(absAngle);
          const py_wave = s.y + pulseDist * Math.sin(absAngle);

          ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
          ctx.beginPath();
          ctx.arc(scaleX(px_wave), scaleY(py_wave), 1.2, 0, 2 * Math.PI);
          ctx.fill();

          const impactRipple = ((now * 0.02) % 6);
          const impactAlpha = 1 - (impactRipple / 6);
          ctx.strokeStyle = `rgba(239, 68, 68, ${impactAlpha * 0.75})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.arc(scaleX(lx), scaleY(ly), impactRipple, 0, 2 * Math.PI);
          ctx.stroke();

          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(scaleX(lx), scaleY(ly), 1.8, 0, 2 * Math.PI);
          ctx.fill();
        }
      }

      // 5. Sleek True Robot Chassis (Xiaomi style!)
      const rx = scaleX(s.x);
      const ry = scaleY(s.y);
      const rr = scaleR(0.15);

      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(rx, ry, rr, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(rx, ry, rr, -s.theta - Math.PI/2, -s.theta + Math.PI/2);
      ctx.stroke();

      const isMoving = trail && trail.length > 1 && 
        (Math.abs(s.x - trail[trail.length - 2][0]) > 0.002 || 
         Math.abs(s.y - trail[trail.length - 2][1]) > 0.002);
      const brushAngle = isMoving ? (now * 0.02) % (2 * Math.PI) : 0;
      
      const drawBrush = (angleOffset: number) => {
        const brushX = rx + rr * Math.cos(-s.theta + angleOffset);
        const brushY = ry + rr * Math.sin(-s.theta + angleOffset);
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1;
        for (let b = 0; b < 3; b++) {
          const bAngle = brushAngle + (b * 2 * Math.PI / 3);
          ctx.beginPath();
          ctx.moveTo(brushX, brushY);
          ctx.lineTo(brushX + 5 * Math.cos(bAngle), brushY + 5 * Math.sin(bAngle));
          ctx.stroke();
        }
      };
      drawBrush(Math.PI / 5);
      drawBrush(-Math.PI / 5);

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(rx - rr * 0.6, ry - rr * 0.25, rr * 1.2, rr * 0.45);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.strokeRect(rx - rr * 0.6, ry - rr * 0.25, rr * 1.2, rr * 0.45);

      const turretRadius = rr * 0.35;
      const tGrad = ctx.createRadialGradient(rx, ry, 1, rx, ry, turretRadius);
      tGrad.addColorStop(0, '#f97316');
      tGrad.addColorStop(0.8, '#ea580c');
      tGrad.addColorStop(1, '#7c2d12');
      ctx.fillStyle = tGrad;
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(rx, ry, turretRadius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + turretRadius * Math.cos(-s.theta), ry + turretRadius * Math.sin(-s.theta));
      ctx.stroke();

      // 6. Holographic wireframe Estimated Robot chassis (EKF localization shadow)
      const ex = scaleX(s.x_est);
      const ey = scaleY(s.y_est);
      const er = scaleR(0.13);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.arc(ex, ey, er, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = '#f59e0b';
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex + er * Math.cos(-s.theta_est), ey + er * Math.sin(-s.theta_est));
      ctx.stroke();

      animationFrameId = requestAnimationFrame(draw);
    };

    animationFrameId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  const navState = state?.navState ?? 1;
  const isCharging = navState === 9;
  const modes = ['Init', 'Idle', 'Mapping', 'Localize', 'Explore', 'Clean', 'Nav', 'Avoid Obs', 'Docking', 'Charging', 'Resume', 'Stop'];
  const modeName = modes[navState] || 'Idle';
  const confidence = state?.confidence ?? 100;
  
  // LED indicator color
  const ledColor = navState === 9 || navState === 5 ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]' :
                   navState === 2 || navState === 3 || navState === 4 ? 'bg-sky-500 shadow-[0_0_6px_#0ea5e9]' :
                   navState === 7 ? 'bg-amber-500 shadow-[0_0_6px_#f59e0b]' :
                   'bg-rose-500 shadow-[0_0_6px_#f43f5e]';

  return (
    <div ref={containerRef} className="relative w-[190px] h-[190px] group rounded-lg border border-white/10 overflow-hidden bg-[#020617] shadow-inner select-none">
      <canvas
        ref={canvasRef}
        width={190}
        height={190}
        className="w-full h-full block"
      />

      {/* Floating High-Tech Telemetry Dashboard HUD */}
      <div className="hud-card-robot absolute top-1.5 left-1.5 w-[84px] p-1.5 rounded bg-slate-950/80 backdrop-blur-md border border-white/10 shadow-2xl text-[5.8px] font-mono text-slate-300 pointer-events-none flex flex-col gap-1 z-20">
        
        {/* State LED & Header */}
        <div className="flex items-center gap-1.5 border-b border-white/5 pb-1">
          <span className={`w-1.5 h-1.5 rounded-full ${ledColor} animate-pulse`} />
          <span ref={stateTextRef} className="font-bold text-[6px] tracking-wide text-sky-400 uppercase">{modeName}</span>
        </div>

        {/* Battery meter */}
        <div className="flex flex-col gap-0.5">
          <div className="flex justify-between leading-none text-[5.5px]">
            <span className="text-slate-400">BATTERY</span>
            <span ref={batTextRef} className="text-emerald-400 font-bold">100%</span>
          </div>
          <div className="w-full h-0.5 bg-slate-800 rounded-sm overflow-hidden">
            <div ref={batBarRef} className="h-full bg-emerald-500 w-full" />
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-x-1 gap-y-0.5 pt-0.5 leading-none">
          <div className="flex justify-between"><span className="text-slate-400">COV:</span><span ref={covRef} className="text-cyan-400 font-bold">0%</span></div>
          <div className="flex justify-between"><span className="text-slate-400">EFF:</span><span ref={effRef} className="text-cyan-400">100%</span></div>
          <div className="flex justify-between"><span className="text-slate-400">DIST:</span><span ref={distRef} className="text-slate-200">0.0m</span></div>
          <div className="flex justify-between"><span className="text-slate-400">CONF:</span><span ref={confRef} className={confidence < 60 ? 'text-rose-400 font-bold animate-pulse' : 'text-amber-400'}>100%</span></div>
        </div>

        <div className="border-t border-white/5 my-0.5" />

        {/* EKF + Localization Error */}
        <div className="flex justify-between leading-none text-[5.5px]">
          <span className="text-slate-400">EKF ERR:</span>
          <span ref={errRef} className="text-amber-500 font-bold">0.00m</span>
        </div>

        {/* Comms Network Stats */}
        <div className="flex justify-between leading-none text-[5.5px] text-violet-400">
          <span>LAT:</span>
          <span ref={latRef} className="font-bold">50ms</span>
        </div>
        <div className="flex justify-between leading-none text-[5.5px] text-violet-400">
          <span>LOSS:</span>
          <span ref={lossRef}>0 pkts</span>
        </div>
      </div>
    </div>
  );
};

interface SoapBubble {
  x: number;
  y: number;
  r: number;
  opacity: number;
}

const WashingMachineDEMCanvas: React.FC<{ state: any }> = ({ state }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const stateRef = React.useRef(state);
  const bubblesRef = React.useRef<SoapBubble[]>([]);

  // Telemetry refs for GSAP count-ups
  const rpmRef = React.useRef<HTMLSpanElement>(null);
  const keRef = React.useRef<HTMLSpanElement>(null);
  const cleanRef = React.useRef<HTMLSpanElement>(null);
  const cleanBarRef = React.useRef<HTMLDivElement>(null);

  // local smooth state for 60fps canvas drawing
  const smoothState = React.useRef({
    dx: 0,
    dy: 0,
    drumAngle: 0,
    rpm: 45,
    cleanliness: 0,
    kineticEnergy: 0,
  });

  React.useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // GSAP tween for smoothing the incoming simulation steps
  useGSAP(() => {
    if (!state) return;

    // Calculate live kinetic energy from incoming particle velocities
    let targetKE = 0;
    const particles = state.particles || [];
    if (particles.length > 0) {
      const mass = state.clothes_weight ? state.clothes_weight / particles.length : 0.1;
      particles.forEach((p: any) => {
        targetKE += 0.5 * mass * (p.vx * p.vx + p.vy * p.vy);
      });
    }

    const currentRpm = Math.round(state.drum_angle ? (state.drum_angle * 60) / (2 * Math.PI * (performance.now() * 0.001)) : 45);

    // Tween the drawing variables smoothly
    gsap.to(smoothState.current, {
      dx: state.dx !== undefined && !isNaN(state.dx) ? state.dx : 0,
      dy: state.dy !== undefined && !isNaN(state.dy) ? state.dy : 0,
      drumAngle: state.drum_angle !== undefined && !isNaN(state.drum_angle) ? state.drum_angle : 0,
      rpm: currentRpm || 45,
      cleanliness: state.cleanliness !== undefined && !isNaN(state.cleanliness) ? state.cleanliness : 0,
      kineticEnergy: targetKE,
      duration: 0.15,
      ease: 'power1.out',
      overwrite: 'auto',
    });

    // Tween the HUD cleanliness display percentage & progress bar width
    if (cleanRef.current) {
      gsap.to(cleanRef.current, {
        innerText: state.cleanliness !== undefined && !isNaN(state.cleanliness) ? state.cleanliness : 0,
        snap: { innerText: 0.1 },
        duration: 0.4,
        ease: 'power2.out',
        modifiers: {
          innerText: (val) => `${parseFloat(val).toFixed(1)}%`,
        },
      });
    }

    if (cleanBarRef.current) {
      const cleanVal = state.cleanliness !== undefined && !isNaN(state.cleanliness) ? state.cleanliness : 0;
      gsap.to(cleanBarRef.current, {
        width: `${cleanVal}%`,
        duration: 0.4,
        ease: 'power2.out',
      });
    }

    // Tween HUD RPM text
    if (rpmRef.current) {
      gsap.to(rpmRef.current, {
        innerText: currentRpm || 45,
        snap: { innerText: 1 },
        duration: 0.4,
        ease: 'power2.out',
      });
    }

    // Tween HUD KE text
    if (keRef.current) {
      gsap.to(keRef.current, {
        innerText: targetKE,
        snap: { innerText: 0.001 },
        duration: 0.4,
        ease: 'power2.out',
        modifiers: {
          innerText: (val) => `${parseFloat(val).toFixed(3)} J`,
        },
      });
    }
  }, [state]);

  // Entrance animations for glassmorphic cards
  useGSAP(() => {
    gsap.from('.hud-card-wm', {
      y: 10,
      opacity: 0,
      duration: 0.5,
      stagger: 0.08,
      ease: 'back.out(1.5)',
    });
  }, { scope: containerRef });

  // Bubble spawner and draw execution
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const draw = () => {
      const s = smoothState.current;
      const W = canvas.width;
      const H = canvas.height;
      const now = performance.now();

      // Clear with sleek dark blue background
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, W, H);

      const currentState = stateRef.current;
      if (!currentState || !currentState.initialized) {
        ctx.fillStyle = '#475569';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('WAITING FOR DEM STEP', W / 2, H / 2);
        animationFrameId = requestAnimationFrame(draw);
        return;
      }

      const R_d = 0.8;
      const scale = (W - 24) / (2 * R_d);

      // Dynamic vibration offset from suspension model (Smoothly interpolated)
      const dx_offset = s.dx * scale * 50;
      const dy_offset = s.dy * scale * 50;
      const cx = W / 2 + Math.max(-15, Math.min(15, dx_offset));
      const cy = H / 2 - Math.max(-15, Math.min(15, dy_offset));

      const toCanvasX = (x: number) => cx + x * scale;
      const toCanvasY = (y: number) => cy - y * scale;
      const toCanvasLength = (l: number) => l * scale;

      const drumAngle = s.drumAngle;
      const particles = currentState.particles || [];
      const bonds = currentState.bonds || [];
      const numSheets = currentState.num_sheets || 2;
      const gridRows = currentState.grid_rows || 4;
      const gridCols = currentState.grid_cols || 4;
      const clothSize = gridRows * gridCols;
      const fluidParticles = currentState.fluidParticles || [];

      // 1. Draw Water Fluid Phase (SPH/Sloshing Wave)
      if (fluidParticles.length === 0) {
        const fill = 0.35;
        const Y_water = -R_d + 2 * R_d * fill;
        const canvasY_water = toCanvasY(Y_water);
        
        const waveFreq = 0.005;
        const waveAmp = 5;
        const waveOffset = Math.sin(now * waveFreq + drumAngle) * waveAmp;

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, toCanvasLength(R_d), 0, 2 * Math.PI);
        ctx.clip();

        const waterGrad = ctx.createLinearGradient(0, canvasY_water + waveOffset, 0, H);
        waterGrad.addColorStop(0, 'rgba(14, 165, 233, 0.4)');
        waterGrad.addColorStop(1, 'rgba(3, 105, 161, 0.65)');
        ctx.fillStyle = waterGrad;

        ctx.beginPath();
        ctx.moveTo(0, canvasY_water + waveOffset);
        for (let x = 0; x <= W; x += 10) {
          const sineY = Math.sin((x / W) * Math.PI * 2 + now * 0.003) * 3;
          ctx.lineTo(x, canvasY_water + waveOffset + sineY);
        }
        ctx.lineTo(W, H);
        ctx.lineTo(0, H);
        ctx.closePath();
        ctx.fill();

        // Spawn bubbles periodically if rotating
        if (Math.abs(s.rpm) > 10 && Math.random() < 0.12) {
          const angle = Math.PI * 0.5 + (Math.random() - 0.5) * 1.0;
          const bubbleX = cx + toCanvasLength(R_d) * Math.cos(angle) * 0.8;
          const bubbleY = cy + toCanvasLength(R_d) * Math.sin(angle) * 0.8;
          const bObj = { x: bubbleX, y: bubbleY, r: 1, opacity: 0.7 };
          bubblesRef.current.push(bObj);
          
          gsap.to(bObj, {
            y: bubbleY - (Math.random() * 40 + 20),
            x: bubbleX + (Math.random() - 0.5) * 15,
            r: Math.random() * 3 + 2,
            opacity: 0,
            duration: Math.random() * 1.2 + 0.8,
            ease: 'power1.out',
            onComplete: () => {
              bubblesRef.current = bubblesRef.current.filter(b => b !== bObj);
            }
          });
        }

        // Draw GSAP cosmetic soap bubbles
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 0.5;
        bubblesRef.current.forEach(bubble => {
          if (Math.pow(bubble.x - cx, 2) + Math.pow(bubble.y - cy, 2) < Math.pow(toCanvasLength(R_d - 0.05), 2)) {
            ctx.save();
            ctx.globalAlpha = bubble.opacity;
            ctx.beginPath();
            ctx.arc(bubble.x, bubble.y, bubble.r, 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }
        });

        // Foam elements on water surface
        for (let x = 10; x < W - 10; x += 15) {
          const sineY = Math.sin((x / W) * Math.PI * 2 + now * 0.003) * 3;
          const foamY = canvasY_water + waveOffset + sineY;
          const count = 3;
          for (let b = 0; b < count; b++) {
            const bx = x + Math.sin(now * 0.002 + b) * 4;
            const by = foamY + Math.cos(now * 0.002 + b) * 2 - 2;
            const br = 2 + (Math.sin(bx * 0.05 + now * 0.001) + 1) * 2;
            if (Math.pow(bx - cx, 2) + Math.pow(by - cy, 2) < Math.pow(toCanvasLength(R_d - 0.05), 2)) {
              ctx.beginPath();
              ctx.arc(bx, by, br, 0, 2 * Math.PI);
              ctx.fill();
              ctx.stroke();
            }
          }
        }

        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        for (let i = 0; i < 8; i++) {
          const bx = cx + Math.sin(i * 1.7 + now * 0.001) * toCanvasLength(R_d * 0.7);
          const by = cy + (0.3 + 0.5 * Math.cos(i * 2.3 + now * 0.001)) * toCanvasLength(R_d);
          if (Math.pow(bx - cx, 2) + Math.pow(by - cy, 2) < Math.pow(toCanvasLength(R_d - 0.1), 2)) {
            ctx.beginPath();
            ctx.arc(bx, by, 1.5 + (i % 3), 0, 2 * Math.PI);
            ctx.fill();
          }
        }
        ctx.restore();
      }

      // Draw SPH fluid particles if present
      if (fluidParticles.length > 0) {
        ctx.save();
        ctx.fillStyle = 'rgba(14, 165, 233, 0.75)';
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)';
        ctx.lineWidth = 1;
        const fRad = Math.max(2, toCanvasLength(0.025));

        fluidParticles.forEach((p: any) => {
          if (!p || isNaN(p.x) || isNaN(p.y)) return;
          const fx = toCanvasX(p.x);
          const fy = toCanvasY(p.y);
          if (Math.pow(fx - cx, 2) + Math.pow(fy - cy, 2) < Math.pow(toCanvasLength(R_d + 0.05), 2)) {
            ctx.beginPath();
            ctx.arc(fx, fy, fRad, 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.beginPath();
            ctx.arc(fx - fRad / 3, fy - fRad / 3, fRad * 0.25, 0, 2 * Math.PI);
            ctx.fill();
            ctx.fillStyle = 'rgba(14, 165, 233, 0.75)';
          }
        });
        ctx.restore();
      }

      // 2. Draw Rotating Drum Geometry
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, toCanvasLength(R_d), 0, 2 * Math.PI);
      ctx.stroke();

      const numRibs = 3;
      ctx.fillStyle = '#64748b';
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < numRibs; i++) {
        const angle = drumAngle + (i * 2 * Math.PI) / numRibs;
        const rx = R_d * Math.cos(angle);
        const ry = R_d * Math.sin(angle);
        const tipLen = 0.15;
        const rtx = (R_d - tipLen) * Math.cos(angle);
        const rty = (R_d - tipLen) * Math.sin(angle);
        const baseWidth = 0.08;
        const b1x = R_d * Math.cos(angle - baseWidth);
        const b1y = R_d * Math.sin(angle - baseWidth);
        const b2x = R_d * Math.cos(angle + baseWidth);
        const b2y = R_d * Math.sin(angle + baseWidth);

        ctx.beginPath();
        ctx.moveTo(toCanvasX(b1x), toCanvasY(b1y));
        ctx.lineTo(toCanvasX(rtx), toCanvasY(rty));
        ctx.lineTo(toCanvasX(b2x), toCanvasY(b2y));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // 2b. Draw Central Pulsator Hub
      if (currentState.has_pulsator) {
        const pRad = toCanvasLength(R_d * 0.22);
        const pGrad = ctx.createRadialGradient(cx, cy, 1, cx, cy, pRad);
        pGrad.addColorStop(0, '#334155');
        pGrad.addColorStop(1, '#1e293b');
        ctx.fillStyle = pGrad;
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, pRad, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        const numFins = 3;
        const pulsAngle = currentState.pulsator_angle || 0;
        ctx.fillStyle = '#475569';
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1.2;
        for (let f = 0; f < numFins; f++) {
          const theta = pulsAngle + (f * 2 * Math.PI) / numFins;
          const tipLen = pRad * 0.5;
          const ftx = (pRad + tipLen) * Math.cos(theta);
          const fty = (pRad + tipLen) * Math.sin(theta);
          const baseWidth = 0.08;
          const fb1x = pRad * Math.cos(theta - baseWidth);
          const fb1y = pRad * Math.sin(theta - baseWidth);
          const fb2x = pRad * Math.cos(theta + baseWidth);
          const fb2y = pRad * Math.sin(theta + baseWidth);

          ctx.beginPath();
          ctx.moveTo(toCanvasX(fb1x), toCanvasY(fb1y));
          ctx.lineTo(toCanvasX(ftx), toCanvasY(fty));
          ctx.lineTo(toCanvasX(fb2x), toCanvasY(fb2y));
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }

      // 3. Draw Cloth Fabric Meshes
      for (let c = 0; c < numSheets; c++) {
        const offset = c * clothSize;
        if (offset + clothSize > particles.length) continue;

        for (let row = 0; row < gridRows - 1; row++) {
          for (let col = 0; col < gridCols - 1; col++) {
            const iA = offset + row * gridCols + col;
            const iB = offset + row * gridCols + (col + 1);
            const iC = offset + (row + 1) * gridCols + (col + 1);
            const iD = offset + (row + 1) * gridCols + col;

            const pA = particles[iA];
            const pB = particles[iB];
            const pC = particles[iC];
            const pD = particles[iD];

            if (pA && pB && pC && pD && !isNaN(pA.x) && !isNaN(pA.y) && !isNaN(pB.x) && !isNaN(pB.y) && !isNaN(pC.x) && !isNaN(pC.y) && !isNaN(pD.x) && !isNaN(pD.y)) {
              ctx.beginPath();
              ctx.moveTo(toCanvasX(pA.x), toCanvasY(pA.y));
              ctx.lineTo(toCanvasX(pB.x), toCanvasY(pB.y));
              ctx.lineTo(toCanvasX(pC.x), toCanvasY(pC.y));
              ctx.lineTo(toCanvasX(pD.x), toCanvasY(pD.y));
              ctx.closePath();
              const hue = (c * 137.5 + 200) % 360;
              ctx.fillStyle = `hsla(${hue}, 75%, 65%, 0.4)`;
              ctx.fill();
            }
          }
        }
      }

      // 4. Draw Bond Fabric Mesh
      ctx.lineWidth = 1.8;
      bonds.forEach((bond: any) => {
        const idx1 = bond.i1 !== undefined ? bond.i1 : bond.p1;
        const idx2 = bond.i2 !== undefined ? bond.i2 : bond.p2;
        const L0 = bond.L0 !== undefined ? bond.L0 : bond.restLength;
        const p1 = particles[idx1];
        const p2 = particles[idx2];
        if (!p1 || !p2 || isNaN(p1.x) || isNaN(p1.y) || isNaN(p2.x) || isNaN(p2.y)) return;

        const x1 = toCanvasX(p1.x);
        const y1 = toCanvasY(p1.y);
        const x2 = toCanvasX(p2.x);
        const y2 = toCanvasY(p2.y);
        const currentL = Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
        const strain = Math.abs(currentL - L0) / (L0 || 1e-5);
        const t = Math.min(1.0, strain * 4.0); 
        ctx.strokeStyle = `rgba(${Math.floor(40 + t * 215)}, ${Math.floor(200 - t * 150)}, ${Math.floor(100 - t * 50)}, 0.8)`;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      });

      // 5. Draw Cloth Particles (Mesh Nodes)
      const pRadius = currentState.radius || 0.05;
      const drawRad = toCanvasLength(pRadius) * 0.7;

      particles.forEach((p: any) => {
        if (!p || isNaN(p.x) || isNaN(p.y)) return;
        const px = toCanvasX(p.x);
        const py = toCanvasY(p.y);
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        const hue = Math.max(0, Math.min(240, 240 - (speed / 1.5) * 240));
        
        const radGrad = ctx.createRadialGradient(
          px - drawRad / 3, py - drawRad / 3, drawRad * 0.1,
          px, py, drawRad
        );
        radGrad.addColorStop(0, `hsl(${hue}, 100%, 75%)`);
        radGrad.addColorStop(0.4, `hsl(${hue}, 90%, 50%)`);
        radGrad.addColorStop(1, `hsl(${hue}, 100%, 25%)`);

        ctx.fillStyle = radGrad;
        ctx.beginPath();
        ctx.arc(px, py, drawRad, 0, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.beginPath();
        ctx.arc(px - drawRad/3, py - drawRad/3, drawRad * 0.2, 0, 2 * Math.PI);
        ctx.fill();

        if (speed > 0.1) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + (p.vx / speed) * (drawRad * 1.5), py - (p.vy / speed) * (drawRad * 1.5));
          ctx.stroke();
        }
      });

      // 6. Draw Glass Door Rim
      const rimRad = toCanvasLength(R_d + 0.05);
      const doorGrad = ctx.createRadialGradient(cx, cy, rimRad * 0.85, cx, cy, rimRad);
      doorGrad.addColorStop(0, 'rgba(15, 23, 42, 0)');
      doorGrad.addColorStop(0.8, 'rgba(148, 163, 184, 0.15)');
      doorGrad.addColorStop(1, 'rgba(148, 163, 184, 0.4)');
      
      ctx.fillStyle = doorGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, rimRad, 0, 2 * Math.PI);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(cx, cy, rimRad * 0.9, Math.PI * 1.25, Math.PI * 1.75);
      ctx.stroke();

      animationFrameId = requestAnimationFrame(draw);
    };

    animationFrameId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  const particlesCount = state?.particles?.length || 0;
  const numSheets = state?.num_sheets || 2;
  const gridRows = state?.grid_rows || 4;
  const gridCols = state?.grid_cols || 4;

  return (
    <div ref={containerRef} className="relative w-[190px] h-[190px] group rounded-lg border border-white/10 overflow-hidden bg-[#020617] shadow-inner select-none">
      {/* 2D Canvas Layer */}
      <canvas
        ref={canvasRef}
        width={190}
        height={190}
        className="w-full h-full block"
      />

      {/* Floating Glassmorphic HUD Overlays */}
      
      {/* Top-Left Telemetry Badge */}
      <div className="hud-card-wm absolute top-1.5 left-1.5 px-2 py-1 rounded bg-slate-950/75 backdrop-blur-md border border-white/10 shadow-lg text-[6.5px] font-mono text-slate-300 pointer-events-none flex flex-col gap-0.5 z-20">
        <div className="flex gap-1.5 justify-between">
          <span className="text-slate-400">RPM:</span>
          <span ref={rpmRef} className="text-sky-400 font-bold drop-shadow-[0_0_4px_rgba(56,189,248,0.2)]">45</span>
        </div>
        <div className="flex gap-1.5 justify-between">
          <span className="text-slate-400">SHEETS:</span>
          <span className="text-slate-200">{numSheets} ({gridRows}x{gridCols})</span>
        </div>
        <div className="flex gap-1.5 justify-between">
          <span className="text-slate-400">PARTS:</span>
          <span className="text-slate-200">{particlesCount}</span>
        </div>
      </div>

      {/* Bottom-Left Kinetic Energy Badge */}
      <div className="hud-card-wm absolute bottom-1.5 left-1.5 px-2 py-1 rounded bg-slate-950/75 backdrop-blur-md border border-white/10 shadow-lg text-[6.5px] font-mono text-slate-300 pointer-events-none z-20">
        <div className="flex gap-1.5 items-center">
          <span className="text-slate-400">KE:</span>
          <span ref={keRef} className="text-amber-400 font-bold drop-shadow-[0_0_4px_rgba(245,158,11,0.2)]">0.000 J</span>
        </div>
      </div>

      {/* Bottom-Right Cleanliness Bar */}
      <div className="hud-card-wm absolute bottom-1.5 right-1.5 w-[75px] p-1.5 rounded bg-slate-950/75 backdrop-blur-md border border-white/10 shadow-lg pointer-events-none flex flex-col gap-1 z-20">
        <div className="flex justify-between items-center text-[6px] font-mono leading-none">
          <span className="text-slate-400 uppercase tracking-wider">CLEAN</span>
          <span ref={cleanRef} className="text-emerald-400 font-black drop-shadow-[0_0_4px_rgba(16,185,129,0.3)]">0.0%</span>
        </div>
        {/* Progress Bar Container */}
        <div className="w-full h-1 bg-slate-800/80 rounded overflow-hidden">
          <div ref={cleanBarRef} className="h-full bg-emerald-500 w-0 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
        </div>
      </div>
    </div>
  );
};

const HarmonicAnalyzerCanvas: React.FC<{ state: any }> = ({ state }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const stateRef = React.useRef(state);

  React.useEffect(() => {
    stateRef.current = state;
  }, [state]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let animId: number;

    const draw = () => {
      const s = stateRef.current;
      const W = canvas.width;
      const H = canvas.height;
      const now = performance.now();

      // Background
      ctx.fillStyle = '#070d1a';
      ctx.fillRect(0, 0, W, H);

      // Grid lines (oscilloscope style)
      ctx.strokeStyle = 'rgba(14, 165, 233, 0.08)';
      ctx.lineWidth = 1;
      for (let gx = 0; gx <= W; gx += W / 6) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
      }
      for (let gy = 0; gy <= H; gy += H / 4) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
      }

      const history: number[] = (s?.history || []).map((v: any) => (
        typeof v === 'number' ? v : 0
      ));

      const midY = H * 0.45;
      const maxAmp = Math.max(...history, 0.001);
      const scale = Math.min((H * 0.38) / maxAmp, 800);

      // Zero baseline
      ctx.strokeStyle = 'rgba(14, 165, 233, 0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(W, midY); ctx.stroke();
      ctx.setLineDash([]);

      if (history.length > 1) {
        // Fill under waveform
        const grad = ctx.createLinearGradient(0, midY - scale * maxAmp, 0, midY + scale * maxAmp);
        grad.addColorStop(0, 'rgba(239, 68, 68, 0.25)');
        grad.addColorStop(0.5, 'rgba(251, 146, 60, 0.12)');
        grad.addColorStop(1, 'rgba(239, 68, 68, 0.05)');

        ctx.beginPath();
        ctx.moveTo(0, midY);
        history.forEach((val, i) => {
          const x = (i / (history.length - 1)) * W;
          const y = midY - val * scale;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.lineTo(W, midY);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // Waveform line
        const lineGrad = ctx.createLinearGradient(0, 0, W, 0);
        lineGrad.addColorStop(0, '#f97316');
        lineGrad.addColorStop(0.5, '#ef4444');
        lineGrad.addColorStop(1, '#f97316');
        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = 2;
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        history.forEach((val, i) => {
          const x = (i / (history.length - 1)) * W;
          const y = midY - val * scale;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Scan line (moving cursor)
        const scanX = ((now * 0.03) % W);
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(scanX, 0); ctx.lineTo(scanX, H * 0.85); ctx.stroke();
      } else {
        ctx.fillStyle = '#334155';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('AWAITING VIBRATION DATA', W / 2, midY);
      }

      // Suspension displacement indicator (bottom panel)
      const panelY = H * 0.73;
      const panelH = H * 0.24;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.fillRect(0, panelY, W, panelH);
      ctx.strokeStyle = 'rgba(14, 165, 233, 0.15)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, panelY, W, panelH);

      const dx = isNaN(s?.dx) ? 0 : Math.max(-0.02, Math.min(0.02, s?.dx ?? 0));
      const dy = isNaN(s?.dy) ? 0 : Math.max(-0.02, Math.min(0.02, s?.dy ?? 0));
      const dispScale = 1200;
      const drumCX = W / 2 + dx * dispScale;
      const drumCY = panelY + panelH / 2 - dy * dispScale;
      const drumR = Math.min(panelH * 0.32, 18);

      // Housing box
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(W * 0.1, panelY + 4, W * 0.8, panelH - 8);

      // Suspension springs (4 corners)
      const corners = [
        [W * 0.1, panelY + 4], [W * 0.9, panelY + 4],
        [W * 0.1, panelY + panelH - 4], [W * 0.9, panelY + panelH - 4]
      ];
      ctx.strokeStyle = 'rgba(14, 165, 233, 0.5)';
      ctx.lineWidth = 1;
      corners.forEach(([cx, cy]) => {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(drumCX, drumCY);
        ctx.stroke();
      });

      // Drum body (vibrating mass)
      const vibGrad = ctx.createRadialGradient(drumCX - drumR * 0.3, drumCY - drumR * 0.3, 1, drumCX, drumCY, drumR);
      vibGrad.addColorStop(0, 'rgba(251, 146, 60, 0.9)');
      vibGrad.addColorStop(1, 'rgba(239, 68, 68, 0.5)');
      ctx.fillStyle = vibGrad;
      ctx.beginPath();
      ctx.arc(drumCX, drumCY, drumR, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // HUD labels
      const vibAmp = history.length ? history[history.length - 1] : 0;
      const freq = isNaN(s?.freq) ? 0 : (s?.freq ?? 0);
      const ex = Array.isArray(s?.eccentricity) ? (s.eccentricity[0] ?? 0) : 0;
      const ey = Array.isArray(s?.eccentricity) ? (s.eccentricity[1] ?? 0) : 0;

      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 7px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('HARMONIC ANALYZER', 6, 5);

      ctx.fillStyle = '#f97316';
      ctx.fillText(`AMP: ${vibAmp.toFixed(4)} m`, 6, 15);
      ctx.fillText(`FREQ: ${freq.toFixed(2)} Hz`, 6, 25);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`Ex: ${ex.toFixed(3)}m`, W - 6, 5);
      ctx.fillText(`Ey: ${ey.toFixed(3)}m`, W - 6, 15);

      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={190}
      height={190}
      className="rounded-lg border border-white/10 shadow-inner bg-[#070d1a]"
    />
  );
};

const RootLocusCanvas: React.FC<{ params: any }> = ({ params }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const W = canvas.width;
    const H = canvas.height;
    
    const numerator = params?.numerator || [1];
    const denominator = params?.denominator || [1, 2, 1];
    const gain = params?.gain !== undefined ? Number(params.gain) : 1;
    const maxGain = params?.maxGain !== undefined ? Number(params.maxGain) : 100;
    
    const olPoles = findRoots(denominator);
    const olZeros = findRoots(numerator);
    
    const gains: number[] = [];
    for (let i = 0; i <= 50; i++) {
      gains.push(maxGain * Math.pow(i / 50, 2));
    }
    
    const dCoeffs = [...denominator];
    const nCoeffs = [...numerator];
    const maxLength = Math.max(dCoeffs.length, nCoeffs.length);
    while (dCoeffs.length < maxLength) dCoeffs.unshift(0);
    while (nCoeffs.length < maxLength) nCoeffs.unshift(0);
    
    const n = dCoeffs.length - 1;
    const trajectories: { re: number; im: number }[][] = Array.from({ length: n }, () => []);
    
    let prevRoots = [...olPoles];
    prevRoots.forEach((r, idx) => {
      trajectories[idx].push(r);
    });
    
    for (let step = 1; step < gains.length; step++) {
      const K = gains[step];
      const closedLoopCoeffs = dCoeffs.map((dVal, idx) => dVal + K * nCoeffs[idx]);
      const currentRoots = findRoots(closedLoopCoeffs);
      
      const matchedIndices = new Set<number>();
      const nextPrevRoots: typeof currentRoots = [];
      
      for (let i = 0; i < prevRoots.length; i++) {
        const prev = prevRoots[i];
        let bestDist = Infinity;
        let bestIdx = -1;
        
        for (let j = 0; j < currentRoots.length; j++) {
          if (matchedIndices.has(j)) continue;
          const curr = currentRoots[j];
          const dist = Math.pow(curr.re - prev.re, 2) + Math.pow(curr.im - prev.im, 2);
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = j;
          }
        }
        
        if (bestIdx !== -1) {
          matchedIndices.add(bestIdx);
          const matchedRoot = currentRoots[bestIdx];
          trajectories[i].push(matchedRoot);
          nextPrevRoots.push(matchedRoot);
        } else {
          trajectories[i].push(prev);
          nextPrevRoots.push(prev);
        }
      }
      prevRoots = nextPrevRoots;
    }
    
    const currCoeffs = dCoeffs.map((dVal, idx) => dVal + gain * nCoeffs[idx]);
    const clPoles = findRoots(currCoeffs);
    
    let minRe = -4;
    let maxRe = 1;
    let minIm = -2.5;
    let maxIm = 2.5;
    
    const allPoints: { re: number; im: number }[] = [];
    olPoles.forEach(p => allPoints.push(p));
    olZeros.forEach(z => allPoints.push(z));
    trajectories.forEach(traj => traj.forEach(pt => allPoints.push(pt)));
    
    if (allPoints.length > 0) {
      const res = allPoints.map(p => p.re);
      const ims = allPoints.map(p => p.im);
      minRe = Math.min(...res, -1);
      maxRe = Math.max(...res, 1);
      minIm = Math.min(...ims, -1);
      maxIm = Math.max(...ims, 1);
      
      const reSpan = maxRe - minRe;
      const imSpan = maxIm - minIm;
      const padRe = reSpan > 0 ? reSpan * 0.15 : 1;
      const padIm = imSpan > 0 ? imSpan * 0.15 : 1;
      
      minRe -= padRe;
      maxRe += padRe;
      minIm -= padIm;
      maxIm += padIm;
    }
    
    const padding = 10;
    const pxPerUnitX = (W - 2 * padding) / (maxRe - minRe);
    const pxPerUnitY = (H - 2 * padding) / (maxIm - minIm);
    const pxPerUnit = Math.min(pxPerUnitX, pxPerUnitY);
    
    const centerX = (minRe + maxRe) / 2;
    const centerY = (minIm + maxIm) / 2;
    const newReRange = (W - 2 * padding) / pxPerUnit;
    const newImRange = (H - 2 * padding) / pxPerUnit;
    
    const plotMinRe = centerX - newReRange / 2;
    const plotMaxRe = centerX + newReRange / 2;
    const plotMinIm = centerY - newImRange / 2;
    const plotMaxIm = centerY + newImRange / 2;
    
    const scaleX = (re: number) => padding + ((re - plotMinRe) / newReRange) * (W - 2 * padding);
    const scaleY = (im: number) => H - padding - ((im - plotMinIm) / newImRange) * (H - 2 * padding);
    
    ctx.fillStyle = '#070d1a';
    ctx.fillRect(0, 0, W, H);
    
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([2, 2]);
    for (let reVal = Math.floor(plotMinRe); reVal <= Math.ceil(plotMaxRe); reVal++) {
      if (reVal === 0) continue;
      const px = scaleX(reVal);
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();
    }
    for (let imVal = Math.floor(plotMinIm); imVal <= Math.ceil(plotMaxIm); imVal++) {
      if (imVal === 0) continue;
      const py = scaleY(imVal);
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke();
    }
    ctx.setLineDash([]);
    
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
    ctx.lineWidth = 1;
    const y0 = scaleY(0);
    ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(W, y0); ctx.stroke();
    const x0 = scaleX(0);
    ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0, H); ctx.stroke();
    
    ctx.lineWidth = 1.5;
    const colors = ['#f43f5e', '#3b82f6', '#10b981', '#a855f7', '#eab308'];
    trajectories.forEach((traj, trajIdx) => {
      if (traj.length < 2) return;
      ctx.strokeStyle = colors[trajIdx % colors.length];
      ctx.beginPath();
      ctx.moveTo(scaleX(traj[0].re), scaleY(traj[0].im));
      for (let i = 1; i < traj.length; i++) {
        ctx.lineTo(scaleX(traj[i].re), scaleY(traj[i].im));
      }
      ctx.stroke();
    });
    
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ef4444';
    olPoles.forEach(p => {
      const px = scaleX(p.re);
      const py = scaleY(p.im);
      const sz = 4;
      ctx.beginPath();
      ctx.moveTo(px - sz, py - sz);
      ctx.lineTo(px + sz, py + sz);
      ctx.moveTo(px - sz, py + sz);
      ctx.lineTo(px + sz, py - sz);
      ctx.stroke();
    });
    
    ctx.strokeStyle = '#3b82f6';
    olZeros.forEach(z => {
      const px = scaleX(z.re);
      const py = scaleY(z.im);
      const r = 3.5;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, 2 * Math.PI);
      ctx.stroke();
    });
    
    ctx.fillStyle = '#10b981';
    ctx.strokeStyle = '#059669';
    ctx.lineWidth = 1;
    clPoles.forEach(p => {
      const px = scaleX(p.re);
      const py = scaleY(p.im);
      const r = 3;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    });
  }, [params]);
  
  return (
    <canvas 
      ref={canvasRef} 
      width={150} 
      height={100} 
      className="rounded-lg border border-slate-800 bg-[#070d1a] shadow-inner" 
    />
  );
};

export const getColor = (type: string) => {
  if (['DEM_WASHING_MACHINE_TWIN', 'DEM_DRUM', 'DEM_PARTICLE_SYSTEM', 'DEM_HERTZ_CONTACT', 'DEM_BOND_FABRIC', 'DEM_FLUID_COUPLING', 'CFD_SPH_WATER_SOLVER', 'DEM_CFD_COSIMULATION_INTERFACE', 'FABRIC_HARMONIC_ANALYZER'].includes(type)) return '#0ea5e9'; // DEM & Particles (Sky Blue)
  if (['CFD_DEM_SURROGATE_LEARNER'].includes(type)) return '#c9a86c'; // Gold/Copper
  if (['Constant', 'WaveformGen', 'Clock', 'Step', 'Scope', 'DELAY', 'MUX', 'DEMUX', 'TERMINATOR', 'DATA_TYPE_CONVERSION'].includes(type)) return '#007acc'; // Signal (Blue)
  if (['SUM_JUNCTION', 'VectorAdd', 'VectorSub', 'VectorMul', 'VectorDiv', 'VectorPow', 'UnaryNeg', 'Abs', 'SumElements', 'Mean', 'Max', 'MatrixMul', 'Transpose', 'Inverse', 'Determinant', 'GAIN', 'PRODUCT', 'SIN', 'COS', 'TAN', 'COT', 'SEC', 'COSEC', 'ASIN', 'ACOS', 'ATAN', 'ACOT', 'ASEC', 'ACOSEC', 'SINH', 'COSH', 'TANH', 'COTH', 'SECH', 'COSECH', 'ASINH', 'ACOSH', 'ATANH', 'ACOTH', 'ASECH', 'ACOSECH', 'TRANSFER_FUNCTION', 'STATE_SPACE', 'ZERO_POLE_GAIN', 'DISCRETE_TRANSFER_FUNCTION', 'LAPLACE_TRANSFORM', 'MatrixConcat', 'MatrixDiag', 'IdentityMatrix', 'SubMatrix', 'MatrixSolve'].includes(type)) return '#28a745'; // Math (Green)
  if (['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR', 'XNOR', 'SWITCH', 'IF_ELSE', 'SWITCH_CASE'].includes(type)) return '#6f42c1'; // Logic (Purple)
  if (['BitwiseAND', 'BitwiseOR', 'BitwiseXOR', 'BitwiseNOT', 'ShiftLeft', 'ShiftRight'].includes(type)) return '#563d7c'; // Bitwise (Indigo)
  if (['DFlipFlop', 'JKFlipFlop', 'Register', 'Counter', 'Integrator', 'INTEGRATOR_CONTINUOUS', 'INTEGRATOR_DISCRETE', 'PID_CONTROLLER', 'PID_BASIC', 'FUZZY_PID_CONTROLLER'].includes(type)) return '#d73a49'; // Sequential/Control (Red)
  if (['MPC_CONTROLLER', 'Subsystem', 'DOE_MODEL', 'AC_MOTOR_PID_CONTROL', 'LMS_ADAPTIVE_FILTER', 'NEURAL_NEURON_LEARNING', 'RL_Q_LEARNING_CONTROLLER', 'ROBOT_VACUUM_DIGITAL_TWIN', 'ROBOT_VACUUM_DYNAMICS', 'ROBOT_VACUUM_MOTOR', 'ROBOT_VACUUM_ODOMETRY', 'ROBOT_VACUUM_FUSION', 'ROBOT_VACUUM_SLAM', 'ROBOT_VACUUM_NAV', 'ROBOT_VACUUM_KINEMATICS', 'ROBOT_VACUUM_WHEEL_CONTROL', 'ROBOT_VACUUM_ENVIRONMENT', 'ROBOT_VACUUM_BOUSTROPHEDON_SWEEP', 'ROBOT_VACUUM_ERODE_MASK', 'ROBOT_VACUUM_DOOR_TRACKER', 'ROBOT_VACUUM_DOOR_CROSSING', 'ROBOT_VACUUM_CONTINUOUS_ENERGY', 'ROBOT_VACUUM_TOPOLOGY_RETURN', 'ROBOT_VACUUM_THETA_STAR', 'Note'].includes(type)) return '#c9a86c'; // MPC/Subsystem/DOE/Learning/Robots/Note (Copper/Gold)
  if (['WHITE_NOISE', 'BAND_LIMITED_NOISE', 'LOW_PASS_FILTER', 'HIGH_PASS_FILTER', 'MOVING_AVERAGE', 'DISCRETE_IMPULSE'].includes(type)) return '#17a2b8'; // Signal Processing (Cyan/Teal)
  if (['KALMAN_FILTER', 'EXTENDED_KALMAN_FILTER'].includes(type)) return '#20c997'; // Estimation (Mint)
  if (['THREE_PHASE_INVERTER', 'SINGLE_PHASE_H_BRIDGE'].includes(type)) return '#ef4444'; // Power (Red)
  if (['PWM_GENERATOR', 'THREE_PHASE_PWM', 'SIX_STEP_COMMUTATION', 'SVPWM_GATE_GENERATOR', 'SVPWM_MODULATOR'].includes(type)) return '#3b82f6'; // Control (Blue)
  if (['FIELD_ORIENTED_CONTROL', 'VOLTAGE_REFERENCE_GENERATOR', 'CURRENT_CONTROLLER_DQ', 'SPEED_CONTROLLER', 'FLUX_REFERENCE', 'ROTOR_POSITION_ESTIMATOR'].includes(type)) return '#10b981'; // Control/Feedback (Emerald)
  if (['FUZZY_MF_TRIMF', 'FUZZY_MF_TRAPMF', 'FUZZY_MF_GAUSSMF', 'FUZZY_MF_SIGMF', 'FUZZY_AND', 'FUZZY_OR', 'FUZZY_NOT', 'FUZZY_DEFUZZIFY'].includes(type)) return '#f59e0b'; // Fuzzy Membership/Operators (Amber)
  if (['FUZZY_INFERENCE_SYSTEM', 'FUZZY_RULE', 'FUZZY_SURFACE_VIEWER'].includes(type)) return '#8b5cf6'; // Fuzzy Inference (Violet)
  return '#444';
};

export const XBlockNode = React.memo(({ data, selected, id }: any) => {
  const updateNodeInternals = useUpdateNodeInternals();
  const nodeRef = React.useRef<HTMLDivElement>(null);
  const workspaceContext = React.useContext(WorkspaceContext);

  const allPorts = React.useMemo(() => [...(data.inputs || []), ...(data.outputs || [])], [data.inputs, data.outputs]);

  // Update node internals when handles are modified (adding/removing ports)
  React.useEffect(() => {
    updateNodeInternals(id);

    // Staggered timeouts to ensure React Flow re-measures coordinates after
    // CSS loads, fonts load, and the canvas zoom/fitView finishes.
    const t1 = setTimeout(() => updateNodeInternals(id), 50);
    const t2 = setTimeout(() => updateNodeInternals(id), 200);
    const t3 = setTimeout(() => updateNodeInternals(id), 500);
    const t4 = setTimeout(() => updateNodeInternals(id), 1000);
    const t5 = setTimeout(() => updateNodeInternals(id), 2000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
    };
  }, [id, allPorts.length, data.inputs, data.outputs, updateNodeInternals]);

  // Update node internals when the DOM element is resized (NodeResizer or content change)
  React.useEffect(() => {
    if (!nodeRef.current) return;
    let t: NodeJS.Timeout;
    const observer = new ResizeObserver(() => {
      updateNodeInternals(id);
      // Run after a tick to ensure reflow completes
      t = setTimeout(() => updateNodeInternals(id), 0);
    });
    observer.observe(nodeRef.current);
    return () => {
      observer.disconnect();
      clearTimeout(t);
    };
  }, [id, updateNodeInternals]);

  const downloadCSV = () => {
    const history = data.state?.history || [];
    if (history.length === 0) return;
    
    const numSignals = data.params?.numSignals || 1;
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
    link.setAttribute('download', `scope_data_${id}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getSignalColor = (index: number) => {
    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#06b6d4', '#8b5cf6'];
    return colors[index % colors.length];
  };

  const getIcon = (type: string) => {
    const iconName = blockTypeToIconName[type] || data?.icon;
    if (iconName && LucideIconMap[iconName]) {
      const IconComponent = LucideIconMap[iconName];
      return <IconComponent size={12} />;
    }

    switch (type) {
      case 'Constant': return <Square size={12} />;
      case 'WaveformGen': return <Activity size={12} />;
      case 'SUM_JUNCTION': return <Sigma size={12} />;
      case 'VectorAdd': return <Plus size={12} />;
      case 'VectorSub': return <Minus size={12} />;
      case 'VectorMul': return <X size={12} />;
      case 'VectorDiv': return <Divide size={12} />;
      case 'VectorPow': return <ChevronUp size={12} />;
      case 'UnaryNeg': return <MinusCircle size={12} />;
      case 'Abs': return <Maximize size={12} />;
      case 'SumElements': return <Sigma size={12} />;
      case 'Mean': return <BarChart size={12} />;
      case 'Max': return <ArrowUp size={12} />;
      case 'MatrixMul': 
      case 'MatrixConcat':
      case 'MatrixDiag':
      case 'IdentityMatrix':
      case 'SubMatrix':
      case 'MatrixSolve':
      case 'DEMUX': return <Grid size={12} />;
      case 'Transpose': return <RotateCw size={12} />;
      case 'Inverse': return <RefreshCcw size={12} />;
      case 'Determinant': return <Hash size={12} />;
      case 'Integrator': 
      case 'INTEGRATOR_CONTINUOUS':
      case 'INTEGRATOR_DISCRETE': return <TrendingUp size={12} />;
      case 'Scope': return <Monitor size={12} />;
      case 'DFlipFlop':
      case 'JKFlipFlop': return <RefreshCcw size={12} />;
      case 'Register': return <Box size={12} />;
      case 'Counter': return <TrendingUp size={12} />;
      case 'Clock': return <RotateCw size={12} />;
      case 'Inport': return <LogIn size={12} />;
      case 'Outport': return <LogOut size={12} />;
      case 'MUX': return <Layers size={12} />;
      case 'DELAY': return <TrendingUp size={12} />;
      case 'AND':
      case 'OR':
      case 'NAND':
      case 'NOR':
      case 'XOR': return <Plus size={12} />;
      case 'NOT': return <MinusCircle size={12} />;
      case 'THREE_PHASE_INVERTER':
      case 'SINGLE_PHASE_H_BRIDGE': return <Zap size={12} />;
      case 'SWITCH':
      case 'IF_ELSE':
      case 'SWITCH_CASE': return <Settings size={12} />;
      case 'DATA_TYPE_CONVERSION': return <Hash size={12} />;
      case 'NUMERIC_REPRESENTATION': return <Activity size={12} />;
      case 'TERMINATOR': return <ZapOff size={12} />;
      case 'PID_CONTROLLER':
      case 'MPC_CONTROLLER': return <Cpu size={12} />;
      case 'TRANSFER_FUNCTION':
      case 'STATE_SPACE':
      case 'ZERO_POLE_GAIN':
      case 'ROOT_LOCUS': return <Activity size={12} />;
      case 'WHITE_NOISE':
      case 'BAND_LIMITED_NOISE': return <Wind size={12} />;
      case 'LOW_PASS_FILTER':
      case 'HIGH_PASS_FILTER':
      case 'DISCRETE_IMPULSE': return <Zap size={12} />;
      case 'MOVING_AVERAGE': return <Filter size={12} />;
      case 'KALMAN_FILTER':
      case 'EXTENDED_KALMAN_FILTER': return <Eye size={12} />;
      case 'SIN':
      case 'COS':
      case 'TAN':
      case 'COT':
      case 'SEC':
      case 'COSEC':
      case 'ASIN':
      case 'ACOS':
      case 'ATAN':
      case 'ACOT':
      case 'ASEC':
      case 'ACOSEC':
      case 'SINH':
      case 'COSH':
      case 'TANH':
      case 'COTH':
      case 'SECH':
      case 'COSECH':
      case 'ASINH':
      case 'ACOSH':
      case 'ATANH':
      case 'ACOTH':
      case 'ASECH':
      case 'ACOSECH': return <TrendingUp size={12} />;
      case 'Subsystem':
      case 'DOE_MODEL': return <Layers size={12} />;
      default: return <Box size={12} />;
    }
  };

  const getHandleColor = (type: string) => {
    switch (type) {
      case 'vector': return '#3b82f6'; // Blue
      case 'boolean': return '#ef4444'; // Red
      case 'control': return '#f59e0b'; // Amber
      case 'transform': return '#a855f7'; // Purple
      default: return '#94a3b8'; // Gray
    }
  };

  const renderPort = (port: XPort, index: number) => {
    // Hide virtual bridging ports in the UI
    if (data.type === 'Inport' && port.id === 'in') return null;
    if (data.type === 'Outport' && port.id === 'out') return null;

    const isInput = port.direction === 'input';
    const position = 
      port.position === 'left' ? Position.Left :
      port.position === 'right' ? Position.Right :
      port.position === 'top' ? Position.Top : Position.Bottom;

    const isVertical = port.position === 'top' || port.position === 'bottom';

    const isSelected = data.selectedHandle && 
                       data.selectedHandle.nodeId === id && 
                       data.selectedHandle.handleId === port.id;

    const offsetSize = isSelected ? 7 : 5;
    const calcStyle = `calc(50% - ${offsetSize}px)`;

    return (
      <div 
        key={port.id} 
        className="relative group flex"
        style={{
          flexDirection: isVertical
            ? (port.position === 'bottom' ? 'column-reverse' : 'column')
            : (port.position === 'right' ? 'row-reverse' : 'row'),
          alignItems: 'center',
          justifyContent: 'center',
          margin: isVertical ? '0 10px' : '5px 0'
        }}
      >
        <Handle
          type={isInput ? 'target' : 'source'}
          position={position}
          id={port.id}
          className="cursor-pointer hover:scale-125 transition-all duration-300"
          style={{
            background: isSelected ? '#c9a86c' : getHandleColor(port.type),
            width: isSelected ? 14 : 10,
            height: isSelected ? 14 : 10,
            border: isSelected ? '2px solid #000000' : '1.5px solid #1e293b',
            borderRadius: '50%', // Circle dot (like Simulink)
            zIndex: 15,
            boxShadow: isSelected ? '0 0 12px #c9a86c, 0 0 6px #c9a86c' : 'none',
            transition: 'all 0.3s ease',
            ...(port.position === 'left' ? { left: isSelected ? -20 : -18, position: 'absolute', top: calcStyle } : {}),
            ...(port.position === 'right' ? { right: isSelected ? -20 : -18, position: 'absolute', top: calcStyle } : {}),
            ...(port.position === 'top' ? { top: isSelected ? 2 : 4, left: calcStyle, position: 'absolute' } : {}),
            ...(port.position === 'bottom' ? { bottom: isSelected ? 2 : 4, left: calcStyle, position: 'absolute' } : {}),
          }}
          onClick={(e) => {
            e.stopPropagation();
            data.onPortClick?.(id, port.id, isInput ? 'target' : 'source', port.type);
          }}
        />
        <span 
          className={`text-[8px] font-mono text-slate-400 uppercase tracking-tighter mx-1.5 transition-opacity duration-200 group-hover:text-slate-200 font-bold`}
          style={{
            marginTop: port.position === 'top' ? 16 : 0,
            marginBottom: port.position === 'bottom' ? 16 : 0,
            pointerEvents: 'none',
          }}
        >
          {port.name}
        </span>
      </div>
    );
  };

  const color = getColor(data.type);

  const isPulsing = data.pulse || (workspaceContext?.isTargetBlock ? workspaceContext.isTargetBlock(id) : false);

  if (data.type === 'Note') {
    return (
      <div 
        ref={nodeRef}
        className={`relative rounded-md transition-all duration-500 border-2 p-3 ${selected ? 'ring-4 ring-orange-500/20 scale-105 z-50' : 'hover:border-[#444]'}`}
        onContextMenu={(e) => e.preventDefault()}
        onMouseDown={(e) => {
          if (workspaceContext?.onNodeMouseDown) workspaceContext.onNodeMouseDown(e, id);
          else if (data.onNodeMouseDown) data.onNodeMouseDown(e);
        }}
        style={{ 
          background: 'rgba(201, 168, 108, 0.08)',
          backdropFilter: 'blur(20px)',
          borderColor: selected ? color : 'rgba(201, 168, 108, 0.3)',
          minWidth: 150,
          minHeight: 100,
          boxShadow: selected 
            ? `0 12px 24px -8px rgba(0,0,0,0.5), 0 0 16px ${color}33` 
            : '0 4px 12px -4px rgba(0,0,0,0.4)',
          height: '100%',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <NodeResizer minWidth={100} minHeight={60} isVisible={selected} lineStyle={{ borderColor: color }} handleStyle={{ background: color, border: 'none', borderRadius: '4px' }} />
        
        {/* Simple Note Header */}
        <div className="flex items-center gap-1.5 pb-2 mb-2 border-b border-[#c9a86c]/20 z-10">
          <div style={{ color }} className="opacity-70">
            {getIcon(data.type)}
          </div>
          <span className="text-[9px] font-black text-slate-350 uppercase tracking-widest leading-none">
            {data.label || 'Note'}
          </span>
        </div>
        
        {/* Note Editor Area */}
        <div className="flex-1 min-h-0 relative z-10">
          <textarea
            className="nodrag nopan nowheel w-full h-full bg-transparent text-slate-200 placeholder-slate-500 border-none outline-none resize-none font-sans text-xs leading-relaxed"
            value={data.params?.text ?? ''}
            placeholder="Type your notes here..."
            onChange={(e) => {
              if (workspaceContext?.updateBlock) {
                workspaceContext.updateBlock(id, { params: { ...data.params, text: e.target.value } });
              } else {
                data.onUpdate?.({ params: { ...data.params, text: e.target.value } });
              }
            }}
          />
        </div>
        
        {selected && <div className="absolute bottom-0 left-0 w-full h-[2px]" style={{ background: `linear-gradient(to right, transparent, ${color}, transparent)` }} />}
      </div>
    );
  }

  return (
    <div 
      ref={nodeRef}
      className={`relative rounded-md transition-all duration-500 border-2 ${selected ? 'ring-4 ring-orange-500/20 scale-105 z-50' : 'hover:border-[#444]'} ${isPulsing ? 'block-pulse-highlight' : ''}`}
      onContextMenu={(e) => e.preventDefault()}
      onMouseDown={(e) => {
        if (workspaceContext?.onNodeMouseDown) workspaceContext.onNodeMouseDown(e, id);
        else if (data.onNodeMouseDown) data.onNodeMouseDown(e);
      }}
      style={{ 
        background: 'rgba(26, 26, 26, 0.95)',
        backdropFilter: 'blur(20px)',
        borderColor: selected ? color : '#333333',
        minWidth: data.type === 'Scope' ? 260 : ['TRANSFER_FUNCTION', 'DISCRETE_TRANSFER_FUNCTION', 'ZERO_POLE_GAIN', 'ROOT_LOCUS', 'LAPLACE_TRANSFORM'].includes(data.type) ? 170 : 130,
        boxShadow: selected 
          ? `0 12px 24px -8px rgba(0,0,0,0.5), 0 0 16px ${color}33` 
          : '0 4px 12px -4px rgba(0,0,0,0.4)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <NodeResizer minWidth={100} minHeight={40} isVisible={selected} lineStyle={{ borderColor: color }} handleStyle={{ background: color, border: 'none', borderRadius: '4px' }} />
      
      {/* Header with Glowing Accent */}
      <div 
        className="px-4 py-2.5 border-b border-[#333] flex items-center justify-between relative overflow-hidden rounded-t-[4px]"
        style={{ background: `linear-gradient(to right, ${color}0c, transparent)` }}
      >
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-right from-slate-800 to-transparent" />
        <div className="flex items-center gap-2.5 z-10">
          <div className="p-1.5 rounded-lg bg-[#222] border border-[#333] shadow-sm" style={{ color }}>
            {getIcon(data.type)}
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] font-black text-slate-200 uppercase tracking-[0.2em] leading-tight">
              {((data.type === 'Inport' || data.type === 'Outport') ? (data.params?.name || data.label) : data.label) || data.type}
            </span>
            {data.params?.smVarId && (
              <span className="text-[7px] text-[#c9a86c] font-bold uppercase tracking-widest mt-0.5">
                Linked: {data.params.smVarId}
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-1 z-10">

          {['Scope', 'ROOT_LOCUS'].includes(data.type) && (
            <div className="flex bg-[#222] p-0.5 rounded-lg border border-[#333]">
              <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  if (workspaceContext?.onOpenScope) workspaceContext.onOpenScope(id);
                  else if (data.onOpenScope) data.onOpenScope(id); 
                }}
                className="p-1.5 hover:bg-[#333] rounded-md transition-all text-blue-400 hover:text-blue-500"
                title={data.type === 'Scope' ? "Full Screen Scope" : "Open Root Locus Plotter"}
              >
                <Maximize2 size={12} />
              </button>
              {data.type === 'Scope' && (
                <button 
                  onClick={(e) => { e.stopPropagation(); downloadCSV(); }}
                  className="p-1.5 hover:bg-[#333] rounded-md transition-all text-emerald-400 hover:text-emerald-500"
                  title="Export Data"
                >
                  <Download size={12} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 p-3 gap-5 relative min-h-0">
        {/* Decorative Grid Overlay for Node Body */}
        <div className="absolute inset-0 opacity-[0.05] pointer-events-none" 
             style={{ backgroundImage: 'radial-gradient(circle, rgba(255, 255, 255, 0.15) 1px, transparent 1px)', backgroundSize: '10px 10px' }} />

        {/* Inputs Column */}
        <div className="flex flex-col flex-1 justify-center gap-2 z-10">
          {allPorts.filter((p: XPort) => p.position === 'left').map(renderPort)}
        </div>

        {/* Dynamic Center Stage */}
        <div className="flex flex-col items-center justify-center py-1 min-w-[40px] flex-[4] z-10">
          {['ROBOT_VACUUM_DIGITAL_TWIN', 'ROBOT_VACUUM_ENVIRONMENT', 'ROBOT_VACUUM_VISUALIZATION'].includes(data.type) ? (
            <RobotTwinCanvas state={data.state} />
          ) : data.type === 'FABRIC_HARMONIC_ANALYZER' ? (
            <HarmonicAnalyzerCanvas state={data.state} />
          ) : ['DEM_WASHING_MACHINE_TWIN', 'DEM_DRUM', 'DEM_PARTICLE_SYSTEM', 'DEM_HERTZ_CONTACT', 'DEM_BOND_FABRIC', 'DEM_FLUID_COUPLING', 'CFD_SPH_WATER_SOLVER', 'DEM_CFD_COSIMULATION_INTERFACE'].includes(data.type) ? (
            <WashingMachineDEMCanvas state={data.state} />
          ) : data.type === 'CFD_DEM_SURROGATE_LEARNER' ? (
            (() => {
              const pattern = data.state?.motion_pattern ?? 0;
              const patternStr = pattern === 2 ? 'Centrifuging' : pattern === 1 ? 'Cataracting' : 'Cascading';
              
              const rotDir = data.state?.rotation_direction ?? 0;
              const rotDirStr = rotDir === 2 ? 'Alternating' : rotDir === 1 ? 'Counter-CW' : 'Clockwise';

              return (
                <div className="flex flex-col items-center text-center p-1.5 min-w-[130px]">
                   <div className="p-2 rounded-2xl bg-[#c9a86c]/10 border border-[#c9a86c]/20 mb-1.5 shadow-[0_0_12px_rgba(201,168,108,0.1)]">
                      <GraduationCap size={20} className="text-[#c9a86c] drop-shadow-[0_0_6px_rgba(201,168,108,0.4)]" />
                   </div>
                   <span className="text-[7px] font-black text-[#c9a86c] uppercase tracking-[0.2em] mb-1">
                     SURROGATE OPTIMIZER
                   </span>
                   <div className="text-[6.5px] font-mono text-slate-400 mt-1 space-y-0.5 text-left w-full px-1">
                     <div className="flex justify-between"><span>Vib Err:</span><span className="text-slate-300 font-bold">{(data.state?.vibration_error ?? 0).toFixed(4)}</span></div>
                     <div className="flex justify-between"><span>Clean Err:</span><span className="text-slate-300 font-bold">{(data.state?.cleanliness_error ?? 0).toFixed(1)}%</span></div>
                     <div className="h-[1px] bg-slate-800 my-1 w-full" />
                     <div className="text-[7px] text-[#c9a86c] font-black uppercase tracking-wider mb-0.5">Optimal Design</div>
                     <div className="flex justify-between text-emerald-400 font-bold"><span>Opt RPM:</span><span>{Math.round(data.state?.optimal_rpm ?? 45)}</span></div>
                     <div className="flex justify-between text-emerald-400"><span>Opt Rad:</span><span>{(data.state?.optimal_drum_radius ?? 0.8).toFixed(2)}m</span></div>
                     <div className="flex justify-between text-emerald-400"><span>Opt Fill:</span><span>{Math.round((data.state?.optimal_fill_level ?? 0.35) * 100)}%</span></div>
                     <div className="flex justify-between text-emerald-400"><span>Opt Lifters:</span><span>{Math.round(data.state?.optimal_lifter_count ?? 3)}</span></div>
                     <div className="h-[1px] bg-slate-800 my-1 w-full" />
                     <div className="flex justify-between text-sky-400"><span>Motion:</span><span className="font-bold">{patternStr}</span></div>
                     <div className="flex justify-between text-sky-400"><span>Rotation:</span><span className="font-bold">{rotDirStr}</span></div>
                   </div>
                </div>
              );
            })()
          ) : data.type === 'Scope' ? (
            <div className="w-full flex-1 min-h-[90px] bg-slate-950 rounded-xl border border-slate-800 p-2 shadow-inner group/scope overflow-hidden relative">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(16,185,129,0.1),transparent)]" />
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.state?.history?.slice(-50).map((sample: any, i: number) => {
                  let val = 0;
                  if (typeof sample === 'number') {
                    val = sample;
                  } else if (sample && typeof sample === 'object') {
                    val = sample.y1 !== undefined ? sample.y1 : (sample.y !== undefined ? sample.y : 0);
                  }
                  return { i, v: Number(val) || 0 };
                }) || []}>
                  <defs>
                    <linearGradient id={`grad-${id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <YAxis hide domain={['auto', 'auto']} />
                  <Area 
                    type="monotone" 
                    dataKey="v" 
                    stroke="#10b981" 
                    strokeWidth={2} 
                    fillOpacity={1} 
                    fill={`url(#grad-${id})`}
                    isAnimationActive={false}
                    className="drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]"
                  />
                </AreaChart>
              </ResponsiveContainer>
              <div className="absolute top-1 right-2 text-[6px] font-black text-emerald-500/50 uppercase tracking-widest animate-pulse">Live Trace</div>
            </div>
          ) : data.type === 'Subsystem' ? (
            <div className="flex flex-col items-center group/sub cursor-pointer">
              <div className="p-3 rounded-2xl bg-[#222] border border-[#333] group-hover/sub:bg-[#c9a86c]/15 group-hover/sub:border-[#c9a86c]/30 transition-all duration-500 shadow-md">
                <Layers size={24} className="text-[#c9a86c] drop-shadow-[0_0_10px_rgba(201,168,108,0.3)]" />
              </div>
              <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest mt-2 group-hover/sub:text-[#c9a86c]">Double-click to Enter</span>
            </div>
          ) : data.type === 'DOE_MODEL' ? (
            <div className="flex flex-col items-center text-center">
               <div className="p-3 rounded-2xl bg-[#c9a86c]/10 border border-[#c9a86c]/20 mb-3 shadow-[0_0_15px_rgba(201,168,108,0.1)]">
                  <Layers size={28} className="text-[#c9a86c] drop-shadow-[0_0_8px_rgba(201,168,108,0.4)]" />
               </div>
               <span className="text-[8px] font-black text-[#c9a86c] uppercase tracking-[0.2em] mb-1">
                 {data.modelType || 'RSM'} MODEL
               </span>
               {data.metrics?.R2 !== undefined && (
                 <div className="px-2 py-0.5 rounded-full bg-emerald-950/30 border border-emerald-900/30">
                   <span className="text-[9px] font-mono font-bold text-emerald-400">
                     R²: {(data.metrics.R2 * 100).toFixed(1)}%
                   </span>
                 </div>
               )}
            </div>
          ) : data.type === 'FUZZY_INFERENCE_SYSTEM' ? (
            <div className="flex flex-col items-center text-center">
               <div className="p-3 rounded-2xl bg-violet-950/30 border border-violet-900/30 mb-3 shadow-[0_0_15px_rgba(139,92,246,0.15)]">
                   <Cpu size={28} className="text-violet-400 drop-shadow-[0_0_8px_rgba(139,92,246,0.4)]" />
               </div>
               <span className="text-[8px] font-black text-violet-400 uppercase tracking-[0.2em] mb-1">
                 {data.params?.type || 'Mamdani'} FIS
               </span>
               <div className="px-2 py-0.5 rounded-full bg-violet-950/30 border border-violet-900/30">
                 <span className="text-[9px] font-mono font-bold text-violet-400">
                   {(data.params?.rules || []).length} Rules
                 </span>
               </div>
            </div>
          ) : ['TRANSFER_FUNCTION', 'DISCRETE_TRANSFER_FUNCTION', 'ZERO_POLE_GAIN', 'LAPLACE_TRANSFORM'].includes(data.type) ? (
            <div className="flex flex-col items-center select-text">
               {['TRANSFER_FUNCTION', 'LAPLACE_TRANSFORM'].includes(data.type) && (
                 <div className="flex flex-col items-center py-2 px-3 min-w-[120px]">
                   <div className="font-mono text-[11px] text-emerald-400 text-center leading-snug whitespace-nowrap">
                     {polyToString(data.params?.numerator || [1], 's')}
                   </div>
                   <div className="w-full h-[1.5px] bg-emerald-500/40 my-1.5 rounded-full" />
                   <div className="font-mono text-[11px] text-emerald-400 text-center leading-snug whitespace-nowrap">
                     {polyToString(data.params?.denominator || [1, 1], 's')}
                   </div>
                 </div>
               )}
               {data.type === 'DISCRETE_TRANSFER_FUNCTION' && (
                 <div className="flex flex-col items-center py-2 px-3 min-w-[120px]">
                   <div className="font-mono text-[11px] text-emerald-400 text-center leading-snug whitespace-nowrap">
                     {polyToString(data.params?.numerator || [1], 'z')}
                   </div>
                   <div className="w-full h-[1.5px] bg-emerald-500/40 my-1.5 rounded-full" />
                   <div className="font-mono text-[11px] text-emerald-400 text-center leading-snug whitespace-nowrap">
                     {polyToString(data.params?.denominator || [1, 1], 'z')}
                   </div>
                 </div>
               )}
               {data.type === 'ZERO_POLE_GAIN' && (() => {
                 const { num, den } = zpgToString(data.params?.zeros || [], data.params?.poles || [-1], data.params?.gain ?? 1, 's');
                 return (
                   <div className="flex flex-col items-center py-2 px-3 min-w-[120px]">
                     <div className="font-mono text-[11px] text-emerald-400 text-center leading-snug whitespace-nowrap">
                       {num}
                     </div>
                     <div className="w-full h-[1.5px] bg-emerald-500/40 my-1.5 rounded-full" />
                     <div className="font-mono text-[11px] text-emerald-400 text-center leading-snug whitespace-nowrap">
                       {den}
                     </div>
                   </div>
                 );
               })()}
            </div>
          ) : data.type === 'ROOT_LOCUS' ? (
             <div className="flex flex-col items-center select-none py-1">
               <RootLocusCanvas params={data.params} />
               <div className="text-[8px] font-mono text-slate-400 mt-1 uppercase tracking-wider">
                 Gain K: {(data.params?.gain ?? 1).toFixed(2)}
               </div>
             </div>
           ) : (
            <div className="flex flex-col items-center">
               <div className="p-3 rounded-xl bg-[#222] border border-[#333] mb-2 shadow-inner">
                  <div style={{ color }} className="scale-150 drop-shadow-[0_0_8px_currentColor]">{getIcon(data.type)}</div>
               </div>
               {data.type === 'Constant' && (
                 <div className="px-2 py-0.5 rounded-full bg-[#222] border border-[#333] text-[10px] font-mono font-bold text-slate-300 tabular-nums">
                   {data.params?.value}
                 </div>
               )}
               {data.type === 'Step' && (
                 <div className="px-2 py-0.5 rounded bg-[#222] border border-[#333] text-[9px] font-mono text-center font-bold text-slate-300 tabular-nums">
                   <div>t ≥ {data.params?.stepTime}</div>
                   <div className="text-[8px] text-slate-500 font-sans">{String(data.params?.initialValue)} → {String(data.params?.finalValue)}</div>
                 </div>
               )}
               {data.type === 'GAIN' && (
                 <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 uppercase tracking-tighter">
                   <span>GAIN</span>
                   <span className="text-[#c9a86c] font-mono">{data.params?.gain}</span>
                 </div>
               )}
                {data.type === 'MatrixConcat' && (
                  <div className="px-2 py-0.5 rounded bg-[#222] border border-[#333] text-[9px] font-mono font-bold text-slate-300">
                    Axis: {data.params?.axis === 1 ? 'Horizontal' : 'Vertical'}
                  </div>
                )}
                {data.type === 'MatrixDiag' && (
                  <div className="px-2 py-0.5 rounded bg-[#222] border border-[#333] text-[9px] font-mono font-bold text-slate-300 capitalize">
                    Mode: {data.params?.diagMode || 'create'}
                  </div>
                )}
                {data.type === 'IdentityMatrix' && (
                  <div className="px-2 py-0.5 rounded bg-[#222] border border-[#333] text-[9px] font-mono font-bold text-slate-300">
                    {data.params?.dim ?? 3} x {data.params?.dim ?? 3}
                  </div>
                )}
                {data.type === 'SubMatrix' && (
                  <div className="px-2 py-0.5 rounded bg-[#222] border border-[#333] text-[8px] font-mono font-bold text-slate-300 leading-normal text-center">
                    <div>Rows: [{data.params?.rowStart ?? 0}, {data.params?.rowEnd ?? 0}]</div>
                    <div>Cols: [{data.params?.colStart ?? 0}, {data.params?.colEnd ?? 0}]</div>
                  </div>
                )}
               {data.type === 'SUM_JUNCTION' && (() => {
                  const signs: string[] = data.params?.signs || Array(Math.max(2, data.params?.numInputs || 2)).fill('+');
                  return (
                    <div className="flex flex-col items-center">
                      {/* Simulink-style circle with Sigma */}
                      <div
                        className="flex items-center justify-center rounded-full border-2 shadow-sm"
                        style={{
                          width: 42,
                          height: 42,
                          borderColor: '#28a745',
                          background: 'radial-gradient(circle, rgba(40,167,69,0.08) 0%, rgba(0,0,0,0) 80%)'
                        }}
                      >
                        <Sigma size={18} style={{ color: '#28a745' }} />
                      </div>
                      {/* Signs display */}
                      <div className="flex flex-wrap justify-center gap-1 mt-1.5 max-w-[90px]">
                        {signs.map((s, i) => (
                          <span
                            key={i}
                            className="text-[9px] font-black font-mono leading-none px-1 py-0.5 rounded"
                            style={{
                              color: s === '-' ? '#ef4444' : '#28a745',
                              background: s === '-' ? 'rgba(239,68,68,0.15)' : 'rgba(40,167,69,0.15)',
                              border: `1px solid ${s === '-' ? 'rgba(239,68,68,0.3)' : 'rgba(40,167,69,0.3)'}`
                            }}
                          >
                            {s === '-' ? '−' : '+'}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}
            </div>
          )}
        </div>

        {/* Outputs Column */}
        <div className="flex flex-col flex-1 justify-center items-end gap-2 z-10">
          {allPorts.filter((p: XPort) => p.position === 'right').map(renderPort)}
        </div>
      </div>

      {/* Top/Bottom Port Containers */}
      <div className="absolute top-0 left-0 w-full flex justify-center -translate-y-1/2 px-10 gap-4">
        {allPorts.filter((p: XPort) => p.position === 'top').map(renderPort)}
      </div>
      <div className="absolute bottom-0 left-0 w-full flex justify-center translate-y-1/2 px-10 gap-4">
        {allPorts.filter((p: XPort) => p.position === 'bottom').map(renderPort)}
      </div>
      
      {/* Selection Glow Footer */}
      {selected && <div className="absolute bottom-0 left-0 w-full h-[2px]" style={{ background: `linear-gradient(to right, transparent, ${color}, transparent)` }} />}
    </div>
  );
});
