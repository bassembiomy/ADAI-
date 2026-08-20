import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Activity } from 'lucide-react';
import { GalaxyStandbyCanvas } from './standby/GalaxyStandbyCanvas';

interface IntroStandbyOverlayProps {
  mode: 'intro' | 'standby';
  onClose: () => void;
}

export const IntroStandbyOverlay: React.FC<IntroStandbyOverlayProps> = ({ mode, onClose }) => {
  const [isExiting, setIsExiting] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [currentLine, setCurrentLine] = useState('');
  const [logIndex, setLogIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);

  const bootLogs = [
    "Initializing ADIA Core Engine...",
    "Loading local AVR GCC compiler toolchain...",
    "Linking HIL hardware model interfaces...",
    "Compiling Arduino.h and workspace libraries...",
    "Resolving system identification parameters...",
    "Workspace ready. Booting interface..."
  ];

  const exitTriggeredRef = useRef(false);

  const handleExit = () => {
    if (exitTriggeredRef.current) return;
    exitTriggeredRef.current = true;
    setIsExiting(true);
    setTimeout(() => {
      onClose();
    }, 800);
  };

  useEffect(() => {
    if (mode !== 'intro') return;

    let timer: any;
    const currentFullText = bootLogs[logIndex];

    if (logIndex < bootLogs.length) {
      if (charIndex < currentFullText.length) {
        timer = setTimeout(() => {
          setCurrentLine((prev) => prev + currentFullText[charIndex]);
          setCharIndex((prev) => prev + 1);
        }, 25);
      } else {
        timer = setTimeout(() => {
          setLogs((prev) => [...prev, currentFullText]);
          setCurrentLine('');
          setCharIndex(0);
          setLogIndex((prev) => prev + 1);
        }, 400);
      }
    } else {
      timer = setTimeout(() => {
        handleExit();
      }, 800);
    }

    return () => clearTimeout(timer);
  }, [mode, logIndex, charIndex]);

  // Intro skip keydown
  useEffect(() => {
    if (mode !== 'intro') return;
    
    const handleKeyDown = () => {
      handleExit();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mode]);

  // Standby mode wakeup listeners
  useEffect(() => {
    if (mode !== 'standby') return;

    const mountedTime = Date.now();

    const handleWake = () => {
      if (Date.now() - mountedTime < 300) return;
      handleExit();
    };

    window.addEventListener('keydown', handleWake);
    window.addEventListener('mousedown', handleWake);
    window.addEventListener('touchstart', handleWake);

    return () => {
      window.removeEventListener('keydown', handleWake);
      window.removeEventListener('mousedown', handleWake);
      window.removeEventListener('touchstart', handleWake);
    };
  }, [mode]);

  return (
    <div
      onClick={handleExit}
      className={`fixed inset-0 z-[9999] bg-[#020204] flex items-center justify-center overflow-hidden transition-all duration-700 ease-in-out cursor-pointer ${
        isExiting ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      {/* 3D Particle Galaxy Canvas */}
      <GalaxyStandbyCanvas />

      {/* Atmospheric Vignette and Lighting */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.45)_0%,rgba(2,2,4,0.75)_55%,rgba(2,2,4,0.95)_100%)]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-orange-500/10 rounded-full blur-[140px] pointer-events-none animate-pulse" style={{ animationDuration: '4s' }} />
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center text-center px-6 max-w-xl select-none">
        
        {/* Cinematic Title & Tagline Card with Frosted Backdrop */}
        <div className="mb-8 px-8 py-6 rounded-3xl bg-black/35 backdrop-blur-md border border-white/5 shadow-[0_20px_60px_rgba(0,0,0,0.7)] flex flex-col items-center">
          
          <h1 className="text-7xl sm:text-8xl md:text-9xl font-black tracking-[0.25em] text-transparent bg-clip-text bg-gradient-to-b from-white via-[#fff7ed] to-[#fcd34d] drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)] drop-shadow-[0_12px_45px_rgba(249,115,22,0.45)] mb-2 animate-fade-in-up pl-[0.25em]">
            ADIA
          </h1>

          <div className="flex items-center gap-3 w-full justify-center animate-fade-in-delayed mt-1">
            <span className="h-[1px] w-8 sm:w-16 bg-gradient-to-r from-transparent to-amber-500/60" />
            <p className="text-xs sm:text-sm font-semibold text-amber-400 tracking-[0.55em] uppercase pl-[0.55em] drop-shadow-[0_2px_12px_rgba(249,115,22,0.5)]">
              GO BEYOND
            </p>
            <span className="h-[1px] w-8 sm:w-16 bg-gradient-to-l from-transparent to-amber-500/60" />
          </div>

        </div>

        {mode === 'intro' ? (
          <div className="flex flex-col items-center gap-4 w-full animate-fade-in-delayed-more" onClick={(e) => e.stopPropagation()}>
            {/* Terminal Log Container */}
            <div className="w-84 max-w-full h-32 bg-black/60 border border-orange-500/20 rounded-xl p-3.5 font-mono text-[11px] text-left text-orange-400/90 overflow-y-auto flex flex-col justify-end gap-1 shadow-2xl backdrop-blur-md">
              {logs.map((log, idx) => (
                <div key={idx} className="flex items-center gap-1.5 opacity-70">
                  <span className="text-amber-500 font-bold">&gt;</span>
                  <span>{log}</span>
                </div>
              ))}
              {logIndex < bootLogs.length && (
                <div className="flex items-center gap-1.5 text-amber-300 font-semibold">
                  <span className="text-amber-400 font-bold animate-pulse">&gt;</span>
                  <span>
                    {currentLine}
                    <span className="inline-block w-1.5 h-3.5 bg-amber-400 animate-pulse ml-0.5" />
                  </span>
                </div>
              )}
            </div>

            {/* Click to skip indicator */}
            <span className="text-[9px] font-mono text-white/40 uppercase tracking-[0.15em] mt-1 animate-pulse">
              Click anywhere or press any key to skip
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 animate-fade-in-delayed-more">
            <div className="flex items-center gap-2.5 bg-black/50 backdrop-blur-md border border-amber-500/30 px-5 py-2 rounded-full mb-1 shadow-lg shadow-amber-950/40">
              <Activity className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              <span className="text-[11px] font-mono font-medium text-amber-300 tracking-[0.25em] uppercase">
                STANDBY MODE ACTIVE
              </span>
            </div>

            <p className="text-xs font-mono text-white/70 tracking-[0.3em] uppercase drop-shadow-md animate-pulse" style={{ animationDuration: '2.5s' }}>
              Click or press any key to resume
            </p>
          </div>
        )}
      </div>

      <div className="absolute top-6 left-6 flex items-center gap-2 pointer-events-none font-mono text-[10px] text-white/30">
        <Sparkles size={13} className="text-orange-400" />
        <span>ADIA_OS_v2.5</span>
      </div>
      
      <div className="absolute bottom-6 right-6 pointer-events-none font-mono text-[10px] text-white/30">
        <span>GPU: THREE.JS VORTEX | FPS: 60</span>
      </div>

      <style>{`
        @keyframes fade-in-up {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up {
          animation: fade-in-up 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-fade-in-delayed {
          animation: fade-in-up 1.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          animation-delay: 0.3s;
          opacity: 0;
        }
        .animate-fade-in-delayed-more {
          animation: fade-in-up 1.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          animation-delay: 0.6s;
          opacity: 0;
        }
      `}</style>
    </div>
  );
};
