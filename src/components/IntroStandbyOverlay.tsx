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

      {/* Subtle atmospheric ambient glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-orange-600/10 rounded-full blur-[160px] pointer-events-none animate-pulse" style={{ animationDuration: '4s' }} />
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center text-center px-6 max-w-lg select-none -translate-y-10 sm:-translate-y-16">
        
        {/* Floating Typography Raised Upwards */}
        <div className="mb-12">
          <h1 className="text-7xl sm:text-8xl font-black tracking-[0.25em] text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-amber-200 drop-shadow-[0_10px_35px_rgba(249,115,22,0.4)] mb-3 animate-fade-in-up pl-[0.25em]">
            ADIA
          </h1>
          <p className="text-sm sm:text-base font-light text-orange-400 tracking-[0.7em] lowercase pl-[0.7em] drop-shadow-[0_2px_10px_rgba(249,115,22,0.3)] animate-fade-in-delayed">
            go beyond
          </p>
        </div>

        {mode === 'intro' ? (
          <div className="flex flex-col items-center gap-4 w-full animate-fade-in-delayed-more" onClick={(e) => e.stopPropagation()}>
            {/* Terminal Log Container */}
            <div className="w-80 max-w-full h-32 bg-black/40 border border-orange-500/15 rounded-xl p-3.5 font-mono text-[10px] text-left text-orange-400/85 overflow-y-auto flex flex-col justify-end gap-1 shadow-inner backdrop-blur-sm">
              {logs.map((log, idx) => (
                <div key={idx} className="flex items-center gap-1.5 opacity-65">
                  <span className="text-amber-500/80 font-bold">&gt;</span>
                  <span>{log}</span>
                </div>
              ))}
              {logIndex < bootLogs.length && (
                <div className="flex items-center gap-1.5 text-orange-400 font-medium">
                  <span className="text-amber-400 font-bold animate-pulse">&gt;</span>
                  <span>
                    {currentLine}
                    <span className="inline-block w-1.5 h-3.5 bg-orange-400 animate-pulse ml-0.5" />
                  </span>
                </div>
              )}
            </div>

            {/* Click to skip indicator */}
            <span className="text-[8px] font-mono text-white/30 uppercase tracking-[0.12em] mt-1 animate-pulse">
              Click anywhere or press any key to skip
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 animate-fade-in-delayed-more">
            <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 px-4 py-1.5 rounded-full mb-1">
              <Activity className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
              <span className="text-[10px] font-mono text-amber-400 tracking-widest uppercase">
                STANDBY MODE ACTIVE
              </span>
            </div>

            <p className="text-xs font-mono text-white/50 tracking-[0.25em] uppercase animate-pulse" style={{ animationDuration: '2.5s' }}>
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
