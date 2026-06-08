import React, { useEffect, useRef, useState } from 'react';
import { Play, Sparkles, Activity } from 'lucide-react';

interface IntroStandbyOverlayProps {
  mode: 'intro' | 'standby';
  onClose: () => void;
}

class GoldenParticle {
  x: number = 0;
  y: number = 0;
  z: number = 0;
  vx: number = 0;
  vy: number = 0;
  vz: number = 0;
  life: number = 0;
  maxLife: number = 0;
  size: number = 0;
  color: string = '';
  type: 'spark' | 'disk' | 'ember' = 'spark';
  angle: number = 0;
  radius: number = 0;
  speed: number = 0;
  prevX: number = 0;
  prevY: number = 0;

  constructor(width: number, height: number, type?: 'spark' | 'disk' | 'ember') {
    this.reset(width, height, true, type);
  }

  reset(width: number, height: number, initial = false, type?: 'spark' | 'disk' | 'ember') {
    const rType = Math.random();
    if (type) {
      this.type = type;
    } else {
      if (rType < 0.35) this.type = 'spark';
      else if (rType < 0.75) this.type = 'disk';
      else this.type = 'ember';
    }

    this.maxLife = Math.random() * 100 + 50;
    this.life = initial ? Math.random() * this.maxLife : 0;
    
    const colorVal = Math.random();
    if (colorVal < 0.15) {
      this.color = '255, 255, 255'; // White core sparks
    } else if (colorVal < 0.45) {
      this.color = '251, 191, 36'; // Amber-400
    } else if (colorVal < 0.8) {
      this.color = '249, 115, 22'; // Orange-500
    } else {
      this.color = '254, 240, 138'; // Yellow-200
    }

    if (this.type === 'spark') {
      const angle = Math.random() * Math.PI * 2;
      const pitch = (Math.random() - 0.5) * Math.PI;
      const speed = Math.random() * 4 + 1.5;
      
      this.x = 0;
      this.y = 0;
      this.z = 0;
      this.vx = Math.cos(angle) * Math.cos(pitch) * speed;
      this.vy = Math.sin(pitch) * speed;
      this.vz = Math.sin(angle) * Math.cos(pitch) * speed;
      this.size = Math.random() * 1.5 + 0.6;
    } else if (this.type === 'disk') {
      this.radius = Math.random() * 180 + 50;
      this.angle = Math.random() * Math.PI * 2;
      this.speed = (0.35 / (this.radius + 10)) + Math.random() * 0.005;
      this.speed *= Math.random() < 0.5 ? 1 : -1;

      this.x = Math.cos(this.angle) * this.radius;
      this.z = Math.sin(this.angle) * this.radius;
      this.y = (Math.random() - 0.5) * 8;

      this.vx = 0;
      this.vy = 0;
      this.vz = 0;
      this.size = Math.random() * 1.8 + 0.4;
    } else {
      this.x = (Math.random() - 0.5) * 200;
      this.z = (Math.random() - 0.5) * 200;
      this.y = (Math.random() - 0.3) * 60;
      
      this.vx = (Math.random() - 0.5) * 0.4;
      this.vy = -(Math.random() * 0.8 + 0.4);
      this.vz = (Math.random() - 0.5) * 0.4;
      this.size = Math.random() * 2.5 + 0.8;
    }

    this.prevX = 0;
    this.prevY = 0;
  }

  update(width: number, height: number, time: number) {
    this.life++;
    if (this.life >= this.maxLife) {
      this.reset(width, height);
      return;
    }

    if (this.type === 'spark') {
      this.x += this.vx;
      this.y += this.vy;
      this.z += this.vz;
      this.vx *= 0.97;
      this.vy *= 0.97;
      this.vz *= 0.97;
    } else if (this.type === 'disk') {
      this.angle += this.speed;
      this.x = Math.cos(this.angle) * this.radius;
      this.z = Math.sin(this.angle) * this.radius;
      this.y += Math.sin(time * 3 + this.radius) * 0.08;
    } else {
      this.x += this.vx + Math.sin(time + this.maxLife) * 0.15;
      this.y += this.vy;
      this.z += this.vz;
    }
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number, focalLength: number) {
    const angleTiltX = 0.55;
    const angleTiltY = 0.25;

    let y1 = this.y * Math.cos(angleTiltX) - this.z * Math.sin(angleTiltX);
    let z1 = this.y * Math.sin(angleTiltX) + this.z * Math.cos(angleTiltX);

    let x2 = this.x * Math.cos(angleTiltY) + z1 * Math.sin(angleTiltY);
    let z2 = -this.x * Math.sin(angleTiltY) + z1 * Math.cos(angleTiltY);

    const scale = focalLength / (focalLength + z2);
    const px = x2 * scale + width / 2;
    const py = y1 * scale + height / 2;

    let alpha = 1.0;
    if (this.life < 15) {
      alpha = this.life / 15;
    } else {
      alpha = 1.0 - (this.life / this.maxLife);
    }
    
    alpha = Math.max(0, Math.min(1, alpha));

    if (this.type === 'spark' && this.life > 1) {
      ctx.strokeStyle = `rgba(${this.color}, ${alpha * 0.55})`;
      ctx.lineWidth = this.size * scale;
      ctx.beginPath();
      ctx.moveTo(this.prevX, this.prevY);
      ctx.lineTo(px, py);
      ctx.stroke();
    } else {
      ctx.fillStyle = `rgba(${this.color}, ${alpha * 0.85})`;
      ctx.beginPath();
      ctx.arc(px, py, this.size * scale, 0, Math.PI * 2);
      ctx.fill();
      
      if (this.size > 1.8 && Math.random() < 0.2) {
        ctx.fillStyle = `rgba(${this.color}, ${alpha * 0.25})`;
        ctx.beginPath();
        ctx.arc(px, py, this.size * scale * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    this.prevX = px;
    this.prevY = py;
  }
}

export const IntroStandbyOverlay: React.FC<IntroStandbyOverlayProps> = ({ mode, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isExiting, setIsExiting] = useState(false);

  const handleExit = () => {
    setIsExiting(true);
    setTimeout(() => {
      onClose();
    }, 800);
  };

  useEffect(() => {
    if (mode === 'intro') {
      const timer = setTimeout(() => {
        handleExit();
      }, 8500);
      return () => clearTimeout(timer);
    }
  }, [mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = canvas.width;
    let height = canvas.height;
    const focalLength = 300;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const particleCount = mode === 'standby' ? 400 : 300;
    const particles: GoldenParticle[] = [];
    for (let i = 0; i < particleCount; i++) {
      particles.push(new GoldenParticle(width, height));
    }

    let time = 0;

    const animate = () => {
      time += 0.01;
      
      ctx.fillStyle = 'rgba(3, 3, 5, 0.16)';
      ctx.fillRect(0, 0, width, height);

      const pulseGlow = Math.sin(time * 2) * 30 + 180;
      const radGlow = ctx.createRadialGradient(
        width / 2, height / 2, 0,
        width / 2, height / 2, pulseGlow
      );
      radGlow.addColorStop(0, 'rgba(249, 115, 22, 0.22)');
      radGlow.addColorStop(0.4, 'rgba(251, 191, 36, 0.08)');
      radGlow.addColorStop(1, 'rgba(249, 115, 22, 0)');
      ctx.fillStyle = radGlow;
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, pulseGlow, 0, Math.PI * 2);
      ctx.fill();

      particles.forEach((p) => {
        p.update(width, height, time);
        p.draw(ctx, width, height, focalLength);
      });

      const pulseCore = Math.sin(time * 4) * 2.5 + 24;
      const radCore = ctx.createRadialGradient(
        width / 2, height / 2, 0,
        width / 2, height / 2, pulseCore
      );
      radCore.addColorStop(0, '#ffffff');
      radCore.addColorStop(0.2, '#fff1a8');
      radCore.addColorStop(0.5, 'rgba(249, 115, 22, 0.85)');
      radCore.addColorStop(1, 'rgba(249, 115, 22, 0)');
      ctx.fillStyle = radCore;
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, pulseCore, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, 5 + Math.sin(time * 8) * 0.5, 0, Math.PI * 2);
      ctx.fill();

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [mode]);

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-[#030305] flex items-center justify-center overflow-hidden transition-all duration-700 ease-in-out ${
        isExiting ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:3rem_3rem]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-orange-600/10 rounded-full blur-[150px] animate-pulse" />
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center text-center px-6 max-w-lg select-none">
        
        <div className="mb-10">
          <h1 className="text-7xl sm:text-8xl font-black tracking-[0.25em] text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-amber-200 drop-shadow-[0_10px_35px_rgba(249,115,22,0.35)] mb-3 animate-fade-in-up pl-[0.25em]">
            ADIA
          </h1>
          <p className="text-sm sm:text-base font-light text-orange-400 tracking-[0.7em] lowercase pl-[0.7em] drop-shadow-[0_2px_10px_rgba(249,115,22,0.25)] animate-fade-in-delayed">
            go beyond
          </p>
        </div>

        {mode === 'intro' ? (
          <div className="flex flex-col items-center gap-6 w-full animate-fade-in-delayed-more">
            <button
              onClick={handleExit}
              className="group relative flex items-center justify-center gap-3 bg-gradient-to-r from-orange-600 to-amber-500 text-white font-bold text-sm tracking-widest px-10 py-4 rounded-xl shadow-[0_5px_30px_rgba(249,115,22,0.4)] hover:shadow-[0_5px_40px_rgba(249,115,22,0.65)] hover:scale-[1.04] active:scale-[0.98] transition-all duration-300 border border-orange-400/30 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent -translate-x-full group-hover:animate-shimmer" />
              <Play className="w-4 h-4 fill-white" />
              ENTER WORKSPACE
            </button>

            <div className="w-64 h-[2px] bg-white/5 relative rounded-full overflow-hidden mt-4">
              <div className="absolute inset-0 bg-gradient-to-r from-orange-600 via-amber-400 to-orange-600 animate-loading-slide shadow-[0_0_8px_#f97316]" />
            </div>
            
            <span className="text-[10px] font-mono text-white/30 uppercase tracking-[0.2em] animate-pulse">
              System boot sequence active
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 animate-fade-in-delayed-more">
            <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 px-4 py-1.5 rounded-full mb-2">
              <Activity className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
              <span className="text-[10px] font-mono text-amber-400 tracking-widest uppercase">
                STANDBY MODE ACTIVE
              </span>
            </div>

            <p className="text-xs font-mono text-white/50 tracking-[0.25em] uppercase animate-pulse" style={{ animationDuration: '2.5s' }}>
              Move mouse or press any key to resume
            </p>
          </div>
        )}
      </div>

      <div className="absolute top-6 left-6 flex items-center gap-2 pointer-events-none font-mono text-[9px] text-white/20">
        <Sparkles size={12} className="text-orange-500" />
        <span>ADIA_OS_v2.5</span>
      </div>
      
      <div className="absolute bottom-6 right-6 pointer-events-none font-mono text-[9px] text-white/20">
        <span>GPU: ENABLED | FPS: 60</span>
      </div>

      <style>{`
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
        @keyframes loading-slide {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(0%); }
          100% { transform: translateX(100%); }
        }
        @keyframes fade-in-up {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-shimmer {
          animation: shimmer 1.5s infinite;
        }
        .animate-loading-slide {
          animation: loading-slide 3.5s infinite ease-in-out;
        }
        .animate-fade-in-up {
          animation: fade-in-up 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-fade-in-delayed {
          animation: fade-in-up 1.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          animation-delay: 0.4s;
          opacity: 0;
        }
        .animate-fade-in-delayed-more {
          animation: fade-in-up 1.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          animation-delay: 0.8s;
          opacity: 0;
        }
      `}</style>
    </div>
  );
};
