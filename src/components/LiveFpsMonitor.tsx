import React, { useEffect, useRef, useState } from 'react';

export function getFpsColorClass(fps: number): string {
  if (fps >= 55) return 'text-emerald-400';
  if (fps >= 30) return 'text-amber-400';
  return 'text-rose-400';
}

export function getFpsStrokeColor(fps: number): string {
  if (fps >= 55) return '#10b981'; // Emerald
  if (fps >= 30) return '#f59e0b'; // Amber
  return '#f43f5e'; // Rose
}

export function computeRollingAverageFps(history: number[]): number {
  if (!history || history.length === 0) return 60;
  const sum = history.reduce((acc, val) => acc + val, 0);
  return Math.round(sum / history.length);
}

export function calculateSparklineY(fps: number, maxFps: number, height: number): number {
  const clampedFps = Math.max(0, Math.min(maxFps, fps));
  const normalized = clampedFps / maxFps;
  // Map normalized (0..1) to y coordinate (bottom to top padding)
  return height - 2 - normalized * (height - 4);
}

export interface LiveFpsMonitorProps {
  className?: string;
  maxFps?: number;
  historyLength?: number;
}

export const LiveFpsMonitor: React.FC<LiveFpsMonitorProps> = ({
  className = '',
  maxFps = 60,
  historyLength = 30,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [displayFps, setDisplayFps] = useState<number>(60);
  const fpsHistoryRef = useRef<number[]>(new Array(historyLength).fill(60));
  const lastTimeRef = useRef<number>(typeof performance !== 'undefined' ? performance.now() : Date.now());
  const lastTextUpdateRef = useRef<number>(typeof performance !== 'undefined' ? performance.now() : Date.now());

  useEffect(() => {
    if (typeof window === 'undefined' || !window.requestAnimationFrame) {
      return;
    }

    let animId: number;

    const tick = (now: number) => {
      const delta = now - lastTimeRef.current;
      lastTimeRef.current = now;

      if (delta > 0 && delta < 500) {
        const instantFps = Math.min(maxFps, Math.round(1000 / delta));
        fpsHistoryRef.current.push(instantFps);
        if (fpsHistoryRef.current.length > historyLength) {
          fpsHistoryRef.current.shift();
        }
      }

      // Throttle numeric text update to 4 times per second (every 250ms)
      if (now - lastTextUpdateRef.current >= 250) {
        const avg = computeRollingAverageFps(fpsHistoryRef.current);
        setDisplayFps(avg);
        lastTextUpdateRef.current = now;
      }

      // Render live sparkline to canvas
      const canvas = canvasRef.current;
      if (canvas && canvas.getContext) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const width = canvas.width;
          const height = canvas.height;
          ctx.clearRect(0, 0, width, height);

          const history = fpsHistoryRef.current;
          const len = history.length;
          if (len > 1) {
            const currentFps = history[len - 1];
            const strokeColor = getFpsStrokeColor(currentFps);

            // Target 60 FPS reference ceiling guideline
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.moveTo(0, 2);
            ctx.lineTo(width, 2);
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw rolling live FPS sparkline
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 1.5;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.beginPath();

            for (let i = 0; i < len; i++) {
              const x = (i / (len - 1)) * width;
              const y = calculateSparklineY(history[i], maxFps, height);
              if (i === 0) {
                ctx.moveTo(x, y);
              } else {
                ctx.lineTo(x, y);
              }
            }
            ctx.stroke();
          }
        }
      }

      animId = window.requestAnimationFrame(tick);
    };

    animId = window.requestAnimationFrame(tick);
    return () => {
      if (window.cancelAnimationFrame) {
        window.cancelAnimationFrame(animId);
      }
    };
  }, [maxFps, historyLength]);

  const fpsColorClass = getFpsColorClass(displayFps);

  return (
    <div
      data-testid="live-fps-monitor"
      className={`flex items-center gap-1.5 font-mono text-[11px] select-none ${className}`}
      title={`Rendering performance: ${displayFps} FPS`}
    >
      <canvas
        ref={canvasRef}
        width={40}
        height={14}
        className="w-10 h-3.5 block opacity-90"
      />
      <span className={`font-semibold ${fpsColorClass}`}>
        {displayFps} <span className="text-[9px] text-zinc-500 font-normal">FPS</span>
      </span>
    </div>
  );
};
