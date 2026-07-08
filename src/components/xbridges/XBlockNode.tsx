// src/components/xbridges/XBlockNode.tsx
import React from 'react';
import { Handle, Position, useUpdateNodeInternals, NodeResizer } from 'reactflow';
import { 
  Square, Activity, Plus, Minus, X, Divide, ChevronUp, MinusCircle, Maximize, Maximize2,
  Sigma, BarChart, ArrowUp, Grid, RotateCw, RefreshCcw, Hash, TrendingUp, Monitor, Box, Download,
  LogIn, LogOut, ChevronLeft, ChevronRight, Zap, Settings, ZapOff, Cpu, Layers, Wind, Filter, Eye,
  GraduationCap, ArrowRightCircle, ArrowLeftCircle, Network, FlaskConical
} from 'lucide-react';
import { LineChart, Line, AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';
import { XPort } from '../../engine/xbridges/types';
import { XBRIDGES_CATEGORIES, raycastTwin, ROOM_WALLS, ROOM_CIRCLES, ROOM_BOXES, polyToString, zpgToString } from '../../engine/xbridges/BlockDefinitions';

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

const RobotTwinCanvas: React.FC<{ state: any }> = ({ state }) => {
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

    let animationFrameId: number;

    const draw = () => {
      const currentState = stateRef.current;
      const W = canvas.width;
      const H = canvas.height;
      const now = performance.now();

      // Clear
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, W, H);

      if (!currentState) {
        ctx.fillStyle = '#64748b';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('WAITING FOR SIMULATION', W / 2, H / 2);
        animationFrameId = requestAnimationFrame(draw);
        return;
      }

      const scaleX = (x: number) => 10 + (x + 3.0) / 6.0 * (W - 20);
      const scaleY = (y: number) => H - 10 - (y + 3.0) / 6.0 * (H - 20);
      const scaleR = (r: number) => r / 6.0 * (W - 20);

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
              const cx = 10 + c * cellW;
              const cy = H - 10 - (r + 1) * cellH;
              ctx.fillRect(cx, cy, cellW, cellH);
            }
          }
        }
      }

      // 1.5 Draw Coverage grid (Cleaned Grid)
      const cleanedGrid = currentState.cleanedGrid;
      if (cleanedGrid && Array.isArray(cleanedGrid)) {
        const cellW = (W - 20) / 30;
        const cellH = (H - 20) / 30;
        ctx.fillStyle = 'rgba(6, 182, 212, 0.16)'; // light cyan/teal
        for (let r = 0; r < 30; r++) {
          for (let c = 0; c < 30; c++) {
            if (cleanedGrid[r][c] === 1) {
              const cx = 10 + c * cellW;
              const cy = H - 10 - (r + 1) * cellH;
              ctx.fillRect(cx, cy, cellW, cellH);
            }
          }
        }
      }

      // Draw subtle grid overlay texture
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 0.5;
      for (let x = -3.0; x <= 3.0; x += 0.5) {
        ctx.beginPath();
        ctx.moveTo(scaleX(x), scaleY(-3.0));
        ctx.lineTo(scaleX(x), scaleY(3.0));
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(scaleX(-3.0), scaleY(x));
        ctx.lineTo(scaleX(3.0), scaleY(x));
        ctx.stroke();
      }

      // Draw Multi-room Internal and boundary walls
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2.0;
      ROOM_WALLS.forEach(w => {
        ctx.beginPath();
        ctx.moveTo(scaleX(w.x1), scaleY(w.y1));
        ctx.lineTo(scaleX(w.x2), scaleY(w.y2));
        ctx.stroke();
      });

      // 2. Draw Obstacles (Holographic / Metallic gradient style with glow)
      const obstacleGlow = 0.04 * Math.sin(now * 0.003);
      ROOM_CIRCLES.forEach((c, idx) => {
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

      ROOM_BOXES.forEach((b, idx) => {
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
      
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(scaleX(0), scaleY(-2.8), 5, 0, 2 * Math.PI);
      ctx.fill();

      ctx.strokeStyle = `rgba(16, 185, 129, ${dockAlpha * (isDocking || isCharging ? 0.8 : 0.35)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(scaleX(0), scaleY(-2.8), 5 + dockPulseRadius, 0, 2 * Math.PI);
      ctx.stroke();

      if (isDocking || isCharging) {
        ctx.beginPath();
        ctx.arc(scaleX(0), scaleY(-2.8), 5 + (dockPulseRadius + 30) % 60, 0, 2 * Math.PI);
        ctx.stroke();
      }

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 7px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('D', scaleX(0), scaleY(-2.8));

      // Draw active path targets
      if (currentState.targetX !== undefined && currentState.targetY !== undefined && currentState.navState !== 1) {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(scaleX(currentState.x), scaleY(currentState.y));
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

      // Pre-planned lawnmower sweep path WAYPOINTS
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

      // Robot paths: true trail (emerald)
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

      // 4. LiDAR active scan rays + Time-of-Flight chevron wave pulses + scattering impact ripples
      const ranges = currentState.lidarRanges;
      if (ranges && Array.isArray(ranges)) {
        const numBeams = ranges.length;
        const beamAngles = [];
        for (let i = 0; i < numBeams; i++) {
          beamAngles.push((i * 2 * Math.PI) / numBeams);
        }
        
        const sweepAngle = (now * 0.004) % (2 * Math.PI);
        const ldsMaxRange = 4.0;
        const sweepDist = raycastTwin(currentState.x, currentState.y, sweepAngle, ldsMaxRange, 0);
        const sx_hit = currentState.x + sweepDist * Math.cos(sweepAngle);
        const sy_hit = currentState.y + sweepDist * Math.sin(sweepAngle);

        const laserGrad = ctx.createLinearGradient(
          scaleX(currentState.x), scaleY(currentState.y),
          scaleX(sx_hit), scaleY(sy_hit)
        );
        laserGrad.addColorStop(0, 'rgba(249, 115, 22, 0.4)');
        laserGrad.addColorStop(0.8, 'rgba(249, 115, 22, 0.2)');
        laserGrad.addColorStop(1, 'rgba(249, 115, 22, 0.0)');
        ctx.strokeStyle = laserGrad;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(scaleX(currentState.x), scaleY(currentState.y));
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
          const absAngle = currentState.theta + beamAngles[i];
          const r = ranges[i];
          const lx = currentState.x + r * Math.cos(absAngle);
          const ly = currentState.y + r * Math.sin(absAngle);

          ctx.strokeStyle = 'rgba(239, 68, 68, 0.25)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(scaleX(currentState.x), scaleY(currentState.y));
          ctx.lineTo(scaleX(lx), scaleY(ly));
          ctx.stroke();

          const waveSpeed = 1000;
          const wavePhase = (now % waveSpeed) / waveSpeed;
          const pulseDist = r * wavePhase;
          const px_wave = currentState.x + pulseDist * Math.cos(absAngle);
          const py_wave = currentState.y + pulseDist * Math.sin(absAngle);

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
      const rx = scaleX(currentState.x);
      const ry = scaleY(currentState.y);
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
      ctx.arc(rx, ry, rr, -currentState.theta - Math.PI/2, -currentState.theta + Math.PI/2);
      ctx.stroke();

      const isMoving = trail && trail.length > 1 && 
        (Math.abs(currentState.x - trail[trail.length - 2][0]) > 0.002 || 
         Math.abs(currentState.y - trail[trail.length - 2][1]) > 0.002);
      const brushAngle = isMoving ? (now * 0.02) % (2 * Math.PI) : 0;
      
      const drawBrush = (angleOffset: number) => {
        const brushX = rx + rr * Math.cos(-currentState.theta + angleOffset);
        const brushY = ry + rr * Math.sin(-currentState.theta + angleOffset);
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
      ctx.lineTo(rx + turretRadius * Math.cos(-currentState.theta), ry + turretRadius * Math.sin(-currentState.theta));
      ctx.stroke();

      // 6. Holographic wireframe Estimated Robot chassis
      const ex = scaleX(currentState.x_est);
      const ey = scaleY(currentState.y_est);
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
      ctx.lineTo(ex + er * Math.cos(-currentState.theta_est), ey + er * Math.sin(-currentState.theta_est));
      ctx.stroke();

      // Charging battery icon overlay
      if (isCharging) {
        const bx = rx + 14;
        const by = ry - 14;
        ctx.fillStyle = '#10b981';
        ctx.fillRect(bx, by, 10, 5);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, 10, 5);
        ctx.fillStyle = '#eab308';
        ctx.font = 'bold 7px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚡', bx + 5, by + 3);
      }

      // 7. Info Panel / Performance Dashboard Overlay
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.fillRect(6, 6, 76, 80);
      ctx.strokeRect(6, 6, 76, 80);

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 6px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      const modes = ['Init', 'Idle', 'Mapping', 'Localize', 'Explore', 'Clean', 'Nav', 'Avoid Obs', 'Docking', 'Charging', 'Resume', 'Stop'];
      ctx.fillText(`STATE: ${modes[currentState.navState] || 'Idle'}`, 10, 10);
      
      const batLvl = currentState.battery_level !== undefined ? currentState.battery_level : 100;
      ctx.fillStyle = batLvl < 20 ? '#ef4444' : batLvl < 50 ? '#f59e0b' : '#10b981';
      ctx.fillText(`BAT: ${batLvl.toFixed(0)}% ${isCharging ? '⚡' : ''}`, 10, 18);

      const navStats = currentState.nav_stats || [0, 100, 0, 100];
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(`COV: ${(navStats[0] ?? 0).toFixed(0)}%`, 10, 26);
      ctx.fillText(`EFF: ${(navStats[1] ?? 100).toFixed(0)}%`, 10, 34);
      ctx.fillText(`DIST: ${(navStats[2] ?? 0).toFixed(1)}m`, 10, 42);

      const trueX = currentState.x ?? 0;
      const trueY = currentState.y ?? 0;
      const estX = currentState.x_est ?? 0;
      const estY = currentState.y_est ?? 0;
      const posErr = Math.sqrt(Math.pow(trueX - estX, 2) + Math.pow(trueY - estY, 2));
      const conf = currentState.confidence !== undefined ? currentState.confidence : 100;
      ctx.fillStyle = conf < 60 ? '#ef4444' : '#f59e0b';
      ctx.fillText(`CONF: ${conf.toFixed(0)}%`, 10, 50);
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`ERR: ${posErr.toFixed(2)}m`, 10, 58);

      const commStats = currentState.comm_stats || [50, 0, 0];
      ctx.fillStyle = '#c084fc';
      ctx.fillText(`LAT: ${(commStats[0] ?? 50).toFixed(0)}ms`, 10, 66);
      ctx.fillText(`LOSS: ${(commStats[1] ?? 0)} pkts`, 10, 74);

      animationFrameId = requestAnimationFrame(draw);
    };

    animationFrameId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={190}
      height={190}
      className="rounded-lg border border-white/10 shadow-inner bg-[#020617]"
    />
  );
};

export const getColor = (type: string) => {
  if (['Constant', 'WaveformGen', 'Clock', 'Step', 'Scope', 'DELAY', 'MUX', 'DEMUX', 'TERMINATOR', 'DATA_TYPE_CONVERSION'].includes(type)) return '#007acc'; // Signal (Blue)
  if (['VectorAdd', 'VectorSub', 'VectorMul', 'VectorDiv', 'VectorPow', 'UnaryNeg', 'Abs', 'SumElements', 'Mean', 'Max', 'MatrixMul', 'Transpose', 'Inverse', 'Determinant', 'GAIN', 'PRODUCT', 'SIN', 'COS', 'TAN', 'COT', 'SEC', 'COSEC', 'TRANSFER_FUNCTION', 'STATE_SPACE', 'ZERO_POLE_GAIN', 'DISCRETE_TRANSFER_FUNCTION'].includes(type)) return '#28a745'; // Math (Green)
  if (['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR', 'XNOR', 'SWITCH', 'IF_ELSE', 'SWITCH_CASE'].includes(type)) return '#6f42c1'; // Logic (Purple)
  if (['BitwiseAND', 'BitwiseOR', 'BitwiseXOR', 'BitwiseNOT', 'ShiftLeft', 'ShiftRight'].includes(type)) return '#563d7c'; // Bitwise (Indigo)
  if (['DFlipFlop', 'JKFlipFlop', 'Register', 'Counter', 'Integrator', 'INTEGRATOR_CONTINUOUS', 'INTEGRATOR_DISCRETE', 'PID_CONTROLLER', 'PID_BASIC', 'FUZZY_PID_CONTROLLER'].includes(type)) return '#d73a49'; // Sequential/Control (Red)
  if (['MPC_CONTROLLER', 'Subsystem', 'DOE_MODEL', 'AC_MOTOR_PID_CONTROL', 'LMS_ADAPTIVE_FILTER', 'NEURAL_NEURON_LEARNING', 'RL_Q_LEARNING_CONTROLLER', 'ROBOT_VACUUM_DIGITAL_TWIN', 'ROBOT_VACUUM_DYNAMICS', 'ROBOT_VACUUM_MOTOR', 'ROBOT_VACUUM_ODOMETRY', 'ROBOT_VACUUM_FUSION', 'ROBOT_VACUUM_SLAM', 'ROBOT_VACUUM_NAV', 'ROBOT_VACUUM_KINEMATICS', 'ROBOT_VACUUM_WHEEL_CONTROL', 'ROBOT_VACUUM_ENVIRONMENT', 'ROBOT_VACUUM_BOUSTROPHEDON_SWEEP', 'ROBOT_VACUUM_ERODE_MASK', 'ROBOT_VACUUM_DOOR_TRACKER', 'ROBOT_VACUUM_DOOR_CROSSING', 'ROBOT_VACUUM_CONTINUOUS_ENERGY', 'ROBOT_VACUUM_TOPOLOGY_RETURN', 'ROBOT_VACUUM_THETA_STAR'].includes(type)) return '#c9a86c'; // MPC/Subsystem/DOE/Learning/Robots (Copper/Gold)
  if (['WHITE_NOISE', 'BAND_LIMITED_NOISE', 'LOW_PASS_FILTER', 'HIGH_PASS_FILTER', 'MOVING_AVERAGE'].includes(type)) return '#17a2b8'; // Signal Processing (Cyan/Teal)
  if (['KALMAN_FILTER', 'EXTENDED_KALMAN_FILTER'].includes(type)) return '#20c997'; // Estimation (Mint)
  if (['THREE_PHASE_INVERTER', 'SINGLE_PHASE_H_BRIDGE'].includes(type)) return '#ef4444'; // Power (Red)
  if (['PWM_GENERATOR', 'THREE_PHASE_PWM', 'SIX_STEP_COMMUTATION', 'SVPWM_GATE_GENERATOR', 'SVPWM_MODULATOR'].includes(type)) return '#3b82f6'; // Control (Blue)
  if (['FIELD_ORIENTED_CONTROL', 'VOLTAGE_REFERENCE_GENERATOR', 'CURRENT_CONTROLLER_DQ', 'SPEED_CONTROLLER', 'FLUX_REFERENCE', 'ROTOR_POSITION_ESTIMATOR'].includes(type)) return '#10b981'; // Control/Feedback (Emerald)
  if (['FUZZY_MF_TRIMF', 'FUZZY_MF_TRAPMF', 'FUZZY_MF_GAUSSMF', 'FUZZY_MF_SIGMF', 'FUZZY_AND', 'FUZZY_OR', 'FUZZY_NOT', 'FUZZY_DEFUZZIFY'].includes(type)) return '#f59e0b'; // Fuzzy Membership/Operators (Amber)
  if (['FUZZY_INFERENCE_SYSTEM', 'FUZZY_RULE', 'FUZZY_SURFACE_VIEWER'].includes(type)) return '#8b5cf6'; // Fuzzy Inference (Violet)
  return '#444';
};

export const XBlockNode = ({ data, id, selected }: any) => {
  const updateNodeInternals = useUpdateNodeInternals();
  const nodeRef = React.useRef<HTMLDivElement>(null);

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
      case 'MatrixMul': return <Grid size={12} />;
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
      case 'DEMUX': return <Grid size={12} />;
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
      case 'ZERO_POLE_GAIN': return <Activity size={12} />;
      case 'WHITE_NOISE':
      case 'BAND_LIMITED_NOISE': return <Wind size={12} />;
      case 'LOW_PASS_FILTER':
      case 'HIGH_PASS_FILTER':
      case 'MOVING_AVERAGE': return <Filter size={12} />;
      case 'KALMAN_FILTER':
      case 'EXTENDED_KALMAN_FILTER': return <Eye size={12} />;
      case 'SIN':
      case 'COS':
      case 'TAN': return <TrendingUp size={12} />;
      case 'COT':
      case 'SEC':
      case 'COSEC': return <TrendingUp size={12} />;
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
            border: isSelected ? '2px solid #ffffff' : '1.5px solid #0f172a',
            borderRadius: '50%', // Circle dot (like Simulink)
            zIndex: 15,
            boxShadow: isSelected ? '0 0 12px #c9a86c, 0 0 6px #c9a86c' : 'none',
            transition: 'all 0.3s ease',
            ...(port.position === 'left' ? { left: isSelected ? -20 : -18, position: 'absolute', top: `calc(50% - ${isSelected ? 7 : 5}px)` } : {}),
            ...(port.position === 'right' ? { right: isSelected ? -20 : -18, position: 'absolute', top: `calc(50% - ${isSelected ? 7 : 5}px)` } : {}),
            ...(port.position === 'top' ? { top: `calc(50% - ${isSelected ? 7 : 5}px)`, left: `calc(50% - ${isSelected ? 7 : 5}px)`, position: 'absolute' } : {}),
            ...(port.position === 'bottom' ? { top: `calc(50% - ${isSelected ? 7 : 5}px)`, left: `calc(50% - ${isSelected ? 7 : 5}px)`, position: 'absolute' } : {}),
          }}
          onClick={(e) => {
            e.stopPropagation();
            data.onPortClick?.(id, port.id, isInput ? 'target' : 'source', port.type);
          }}
        />
        <span 
          className={`text-[8px] font-mono text-gray-500 uppercase tracking-tighter mx-1.5 transition-opacity duration-200 group-hover:text-white`}
          style={{
            marginTop: port.position === 'top' ? 12 : 0,
            marginBottom: port.position === 'bottom' ? 12 : 0,
          }}
        >
          {port.name}
        </span>
      </div>
    );
  };

  const color = getColor(data.type);

  const isPulsing = !!data.pulse;

  return (
    <div 
      ref={nodeRef}
      className={`relative rounded-md transition-all duration-500 border-2 ${selected ? 'ring-4 ring-white/10 scale-105 z-50' : 'hover:border-white/20'} ${isPulsing ? 'block-pulse-highlight' : ''}`}
      onMouseDown={(e) => data.onNodeMouseDown && data.onNodeMouseDown(e)}
      style={{ 
        background: 'rgba(20, 20, 20, 0.8)',
        backdropFilter: 'blur(20px)',
        borderColor: selected ? color : 'rgba(255,255,255,0.05)',
        minWidth: data.type === 'Scope' ? 260 : ['TRANSFER_FUNCTION', 'DISCRETE_TRANSFER_FUNCTION', 'ZERO_POLE_GAIN'].includes(data.type) ? 170 : 130,
        boxShadow: selected 
          ? `0 20px 50px -10px rgba(0,0,0,0.8), 0 0 30px ${color}33` 
          : '0 10px 30px -10px rgba(0,0,0,0.5)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <NodeResizer minWidth={100} minHeight={40} isVisible={selected} lineStyle={{ borderColor: color }} handleStyle={{ background: color, border: 'none', borderRadius: '4px' }} />
      
      {/* Header with Glowing Accent */}
      <div 
        className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between relative overflow-hidden rounded-t-[4px]"
        style={{ background: `linear-gradient(to right, ${color}15, transparent)` }}
      >
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-right from-white/10 to-transparent" />
        <div className="flex items-center gap-2.5 z-10">
          <div className="p-1.5 rounded-lg bg-black/40 shadow-inner" style={{ color }}>
            {getIcon(data.type)}
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] font-black text-white/90 uppercase tracking-[0.2em] leading-tight">
              {data.label || data.type}
            </span>
            {data.params?.smVarId && (
              <span className="text-[7px] text-[#c9a86c] font-bold uppercase tracking-widest mt-0.5">
                Linked: {data.params.smVarId}
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-1 z-10">

          {data.type === 'Scope' && (
            <div className="flex bg-black/30 p-0.5 rounded-lg border border-white/5">
              <button 
                onClick={(e) => { e.stopPropagation(); data.onOpenScope && data.onOpenScope(id); }}
                className="p-1.5 hover:bg-white/10 rounded-md transition-all text-blue-400/70 hover:text-blue-400"
                title="Full Screen Scope"
              >
                <Maximize2 size={12} />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); downloadCSV(); }}
                className="p-1.5 hover:bg-white/10 rounded-md transition-all text-emerald-400/70 hover:text-emerald-400"
                title="Export Data"
              >
                <Download size={12} />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 p-3 gap-5 relative min-h-0">
        {/* Decorative Grid Overlay for Node Body */}
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none" 
             style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '10px 10px' }} />

        {/* Inputs Column */}
        <div className="flex flex-col flex-1 justify-center gap-2 z-10">
          {allPorts.filter((p: XPort) => p.position === 'left').map(renderPort)}
        </div>

        {/* Dynamic Center Stage */}
        <div className="flex flex-col items-center justify-center py-1 min-w-[40px] flex-[4] z-10">
          {['ROBOT_VACUUM_DIGITAL_TWIN', 'ROBOT_VACUUM_ENVIRONMENT', 'ROBOT_VACUUM_VISUALIZATION'].includes(data.type) ? (
            <RobotTwinCanvas state={data.state} />
          ) : data.type === 'Scope' ? (
            <div className="w-full flex-1 min-h-[90px] bg-black/60 rounded-xl border border-white/5 p-2 shadow-inner group/scope overflow-hidden relative">
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
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10 group-hover/sub:bg-[#c9a86c]/10 group-hover/sub:border-[#c9a86c]/30 transition-all duration-500 shadow-xl">
                <Layers size={24} className="text-[#c9a86c] drop-shadow-[0_0_10px_rgba(201,168,108,0.3)]" />
              </div>
              <span className="text-[7px] font-black text-gray-500 uppercase tracking-widest mt-2 group-hover/sub:text-[#c9a86c]">Double-click to Enter</span>
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
                 <div className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                   <span className="text-[9px] font-mono font-bold text-emerald-400">
                     R²: {(data.metrics.R2 * 100).toFixed(1)}%
                   </span>
                 </div>
               )}
            </div>
          ) : data.type === 'FUZZY_INFERENCE_SYSTEM' ? (
            <div className="flex flex-col items-center text-center">
               <div className="p-3 rounded-2xl bg-violet-500/10 border border-violet-500/20 mb-3 shadow-[0_0_15px_rgba(139,92,246,0.15)]">
                   <Cpu size={28} className="text-violet-400 drop-shadow-[0_0_8px_rgba(139,92,246,0.4)]" />
               </div>
               <span className="text-[8px] font-black text-violet-400 uppercase tracking-[0.2em] mb-1">
                 {data.params?.type || 'Mamdani'} FIS
               </span>
               <div className="px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20">
                 <span className="text-[9px] font-mono font-bold text-violet-300">
                   {(data.params?.rules || []).length} Rules
                 </span>
               </div>
            </div>
          ) : ['TRANSFER_FUNCTION', 'DISCRETE_TRANSFER_FUNCTION', 'ZERO_POLE_GAIN'].includes(data.type) ? (
            <div className="flex flex-col items-center select-text">
               {data.type === 'TRANSFER_FUNCTION' && (
                 <div className="flex flex-col items-center py-2 px-3 min-w-[120px]">
                   <div className="font-mono text-[11px] text-emerald-300 text-center leading-snug whitespace-nowrap">
                     {polyToString(data.params?.numerator || [1], 's')}
                   </div>
                   <div className="w-full h-[1.5px] bg-emerald-500/50 my-1.5 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.3)]" />
                   <div className="font-mono text-[11px] text-emerald-300 text-center leading-snug whitespace-nowrap">
                     {polyToString(data.params?.denominator || [1, 1], 's')}
                   </div>
                 </div>
               )}
               {data.type === 'DISCRETE_TRANSFER_FUNCTION' && (
                 <div className="flex flex-col items-center py-2 px-3 min-w-[120px]">
                   <div className="font-mono text-[11px] text-emerald-300 text-center leading-snug whitespace-nowrap">
                     {polyToString(data.params?.numerator || [1], 'z')}
                   </div>
                   <div className="w-full h-[1.5px] bg-emerald-500/50 my-1.5 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.3)]" />
                   <div className="font-mono text-[11px] text-emerald-300 text-center leading-snug whitespace-nowrap">
                     {polyToString(data.params?.denominator || [1, 1], 'z')}
                   </div>
                 </div>
               )}
               {data.type === 'ZERO_POLE_GAIN' && (() => {
                 const { num, den } = zpgToString(data.params?.zeros || [], data.params?.poles || [-1], data.params?.gain ?? 1, 's');
                 return (
                   <div className="flex flex-col items-center py-2 px-3 min-w-[120px]">
                     <div className="font-mono text-[11px] text-emerald-300 text-center leading-snug whitespace-nowrap">
                       {num}
                     </div>
                     <div className="w-full h-[1.5px] bg-emerald-500/50 my-1.5 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.3)]" />
                     <div className="font-mono text-[11px] text-emerald-300 text-center leading-snug whitespace-nowrap">
                       {den}
                     </div>
                   </div>
                 );
               })()}
            </div>
          ) : (
            <div className="flex flex-col items-center">
               <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 mb-2 shadow-inner">
                  <div style={{ color }} className="scale-150 drop-shadow-[0_0_8px_currentColor]">{getIcon(data.type)}</div>
               </div>
               {data.type === 'Constant' && (
                 <div className="px-2 py-0.5 rounded-full bg-black/40 border border-white/5 text-[10px] font-mono font-bold text-white/70 tabular-nums">
                   {data.params?.value}
                 </div>
               )}
               {data.type === 'Step' && (
                 <div className="px-2 py-0.5 rounded bg-black/40 border border-white/5 text-[9px] font-mono text-center font-bold text-white/70 tabular-nums">
                   <div>t ≥ {data.params?.stepTime}</div>
                   <div className="text-[8px] text-gray-500 font-sans">{String(data.params?.initialValue)} → {String(data.params?.finalValue)}</div>
                 </div>
               )}
               {data.type === 'GAIN' && (
                 <div className="flex items-center gap-1.5 text-[10px] font-black text-white/40 uppercase tracking-tighter">
                   <span>GAIN</span>
                   <span className="text-[#c9a86c] font-mono">{data.params?.gain}</span>
                 </div>
               )}
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
};
