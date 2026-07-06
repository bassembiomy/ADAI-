// src/components/ThreeDXDashboardPanel.tsx
import React, { useState, useEffect } from 'react';
import { Layout, X, RefreshCw, ExternalLink, ShieldAlert, Compass } from 'lucide-react';
import * as ThreeDXService from '../services/threeDXService';

interface ThreeDXDashboardPanelProps {
  isOpen: boolean;
  onClose: () => void;
  tenantUrl: string;
}

export const ThreeDXDashboardPanel: React.FC<ThreeDXDashboardPanelProps> = ({
  isOpen,
  onClose,
  tenantUrl,
}) => {
  const [activeWidget, setActiveWidget] = useState<'compass' | 'projects' | 'tasks'>('compass');
  const [isLoading, setIsLoading] = useState(false);

  const getWidgetUrl = () => {
    const base = tenantUrl.replace(/\/$/, '');
    switch (activeWidget) {
      case 'projects':
        return `${base}/3DSpace/index.htm#showcase:projects`;
      case 'tasks':
        return `${base}/3DSpace/index.htm#showcase:tasks`;
      case 'compass':
      default:
        return `${base}/`;
    }
  };

  useEffect(() => {
    if (isOpen) {
      // Trigger main process to show dashboard BrowserView overlay on the right half of the window
      (async () => {
        setIsLoading(true);
        try {
          const electron = (window as any).require?.('electron');
          if (electron) {
            await electron.ipcRenderer.invoke('3dx-dashboard-open', { url: getWidgetUrl() });
          }
        } catch (err) {
          console.error('Failed to open 3DX dashboard view:', err);
        }
        setIsLoading(false);
      })();
    } else {
      // Close/hide the dashboard view
      try {
        const electron = (window as any).require?.('electron');
        if (electron) {
          electron.ipcRenderer.invoke('3dx-dashboard-close');
        }
      } catch (err) {
        console.error('Failed to close 3DX dashboard view:', err);
      }
    }

    return () => {
      try {
        const electron = (window as any).require?.('electron');
        if (electron) {
          electron.ipcRenderer.invoke('3dx-dashboard-close');
        }
      } catch (_) {}
    };
  }, [isOpen, activeWidget]);

  if (!isOpen) return null;

  return (
    <div className="fixed top-12 right-0 bottom-7 w-[450px] bg-[#0c0c10] border-l border-[#1e2a3a] flex flex-col z-[150] animate-in slide-in-from-right duration-300 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-[#0056b3]/15 to-transparent border-b border-[#1e2a3a]">
        <div className="flex items-center gap-2">
          <Compass size={16} className="text-[#4da6ff] animate-spin-slow" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">3DEXPERIENCE Live Panel</span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white p-1 hover:bg-white/5 rounded-md transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Widget Tabs */}
      <div className="flex items-center border-b border-[#1a2133] bg-[#0a0d14]/50 px-2 py-1.5 gap-1">
        {(['compass', 'projects', 'tasks'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveWidget(tab)}
            className={`px-3 py-1 text-[10px] font-bold uppercase rounded-md tracking-wider transition-all ${
              activeWidget === tab
                ? 'bg-[#0056b3]/25 text-[#4da6ff] border border-[#0056b3]/30'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`}
          >
            {tab === 'compass' ? 'Compass' : tab === 'projects' ? 'My Projects' : 'My Tasks'}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => {
            const electron = (window as any).require?.('electron');
            if (electron) {
              electron.ipcRenderer.invoke('3dx-dashboard-open', { url: getWidgetUrl() });
            }
          }}
          className="text-gray-500 hover:text-[#4da6ff] p-1 rounded-md transition-colors"
          title="Reload Panel"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {/* Embedded View Placeholder */}
      <div className="flex-1 bg-[#06080c] flex flex-col items-center justify-center p-6 text-center">
        {isLoading ? (
          <div className="space-y-2">
            <RefreshCw size={24} className="text-[#4da6ff] animate-spin mx-auto" />
            <span className="text-xs text-gray-500">Loading Dashboard...</span>
          </div>
        ) : (
          <div className="space-y-4 max-w-xs">
            <div className="w-12 h-12 rounded-xl bg-[#0056b3]/10 border border-[#0056b3]/25 flex items-center justify-center mx-auto">
              <Layout size={20} className="text-[#4da6ff]" />
            </div>
            <div>
              <p className="text-xs font-bold text-white">Live Dashboard View Active</p>
              <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">
                The native 3DEXPERIENCE browser layer is currently active and rendered directly over this side panel.
              </p>
            </div>
            <button
              onClick={() => window.open(getWidgetUrl(), '_blank')}
              className="inline-flex items-center gap-1.5 text-[10px] font-bold text-gray-400 hover:text-white transition-colors"
            >
              <ExternalLink size={10} /> Open in external browser
            </button>
          </div>
        )}
      </div>

      {/* Safety warning */}
      <div className="p-3 bg-[#111] border-t border-[#222] flex items-center gap-2 text-[9px] text-gray-500">
        <ShieldAlert size={12} className="text-yellow-500/70" />
        <span>Sandboxed connection running over secure TLS 1.2.</span>
      </div>
    </div>
  );
};
