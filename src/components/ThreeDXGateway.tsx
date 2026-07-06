// src/components/ThreeDXGateway.tsx
// ============================================================================
// 3DEXPERIENCE Gateway — Full Modal Component
// Provides: OAuth login, embedded browser navigation, upload & download panels
// ============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Globe, Upload, Download, Search, RefreshCw,
  LogIn, LogOut, Link2, Wifi, WifiOff, ChevronLeft,
  ChevronRight, Folder, FileText, CheckCircle2,
  AlertCircle, Loader2, ExternalLink, ArrowLeft,
  ArrowRight, RotateCcw, File, FilePlus2, Cloud,
  ShieldCheck, User, Clock, HardDrive, Eye, Inbox,
  Layers, Settings, Play, ArrowRightCircle
} from 'lucide-react';
import type {
  ThreeDXCredentials,
  ThreeDXConnectionStatus,
  ThreeDXWorkspace,
  ThreeDXDocument,
  ThreeDXBrowserState,
  AdiaExportItem,
  ThreeDXUploadResult,
} from '../types/threeDX_types';
import * as ThreeDXService from '../services/threeDXService';
import { ThreeDXDashboardPanel } from './ThreeDXDashboardPanel';
import '../styles/threedx_theme.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ThreeDXGatewayProps {
  isOpen: boolean;
  onClose: () => void;
  /** ADIA project data available for upload */
  adiaExports: AdiaExportItem[];
  /** Called when user downloads a JSON document that should be imported */
  onImportJson: (jsonContent: string) => void;
}

// ---------------------------------------------------------------------------
// Sub-types
// ---------------------------------------------------------------------------

type GatewayTab = 'auth' | 'browser' | 'upload' | 'download' | 'sync';

// ---------------------------------------------------------------------------
// Helpers / Sub-components
// ---------------------------------------------------------------------------

const StatusDot: React.FC<{ status: ThreeDXConnectionStatus }> = ({ status }) => {
  const colors: Record<ThreeDXConnectionStatus, string> = {
    disconnected: 'bg-gray-500',
    connecting: 'bg-yellow-400 animate-pulse',
    connected: 'bg-emerald-400',
    error: 'bg-red-500',
    token_expired: 'bg-orange-400',
  };
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors[status]}`} />;
};

const TabButton: React.FC<{
  id: GatewayTab;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
}> = ({ id, active, onClick, icon, label, disabled }) => (
  <button
    id={`3dx-tab-${id}`}
    onClick={onClick}
    disabled={disabled}
    className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold tracking-wider uppercase rounded-lg transition-all duration-200
      ${active
        ? 'bg-[#0056b3]/20 text-[#4da6ff] border border-[#0056b3]/40'
        : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
      }
      ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
  >
    {icon}
    <span className="hidden sm:inline">{label}</span>
  </button>
);

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const ThreeDXGateway: React.FC<ThreeDXGatewayProps> = ({
  isOpen,
  onClose,
  adiaExports,
  onImportJson,
}) => {
  // ── State ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<GatewayTab>('auth');
  const [creds, setCreds] = useState<ThreeDXCredentials | null>(null);
  const [status, setStatus] = useState<ThreeDXConnectionStatus>('disconnected');

  // Auth form
  const [tenantUrl, setTenantUrl] = useState('https://iam.3dexperience.3ds.com');
  const [clientId, setClientId] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  // Browser panel
  const [browserState, setBrowserState] = useState<ThreeDXBrowserState>({
    url: '',
    canGoBack: false,
    canGoForward: false,
    isLoading: false,
  });
  const [browserUrlInput, setBrowserUrlInput] = useState('');
  const [browserVisible, setBrowserVisible] = useState(false);

  // Upload panel
  const [workspaces, setWorkspaces] = useState<ThreeDXWorkspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState('');
  const [selectedExports, setSelectedExports] = useState<Record<string, boolean>>({});
  const [uploadProgress, setUploadProgress] = useState<Record<string, 'idle' | 'uploading' | 'done' | 'error'>>({});
  const [workspacesLoading, setWorkspacesLoading] = useState(false);

  // Download panel
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ThreeDXDocument[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, 'idle' | 'downloading' | 'done' | 'error'>>({});

  // Sync dashboard state
  interface SyncItem {
    id: string;
    name: string;
    type: string;
    selector: string;
    fileName: string;
    status: 'idle' | 'capturing' | 'ready' | 'syncing' | 'done' | 'error';
    direction: 'push' | 'pull' | 'bidirectional';
    lastSynced?: string;
    previewData?: string;
  }

  const [syncItems, setSyncItems] = useState<SyncItem[]>([
    { id: 'bdd', name: 'Block Definition Diagram (BDD)', type: 'bdd_diagram', selector: '#adia-diagram-canvas', fileName: 'bdd_diagram.png', status: 'idle', direction: 'push' },
    { id: 'ibd', name: 'Internal Block Diagram (IBD)', type: 'ibd_diagram', selector: '#adia-diagram-canvas', fileName: 'ibd_diagram.png', status: 'idle', direction: 'push' },
    { id: 'requirements', name: 'Requirements Diagram', type: 'requirements', selector: '#adia-diagram-canvas', fileName: 'requirements_diagram.png', status: 'idle', direction: 'push' },
    { id: 'statemachine', name: 'State Machine Diagram', type: 'state_machine', selector: '#adia-diagram-canvas', fileName: 'state_machine.png', status: 'idle', direction: 'push' },
    { id: 'codegen', name: 'Generated C Code (ZIP)', type: 'code_generation', selector: '', fileName: 'generated_code.zip', status: 'idle', direction: 'push' },
    { id: 'xbridges', name: 'XBridges Model (JSON)', type: 'xbridges_model', selector: '#xbridges-workspace-container', fileName: 'xbridges_model.json', status: 'idle', direction: 'push' },
    { id: 'vlab', name: 'VLab Simulation Model (JSON)', type: 'vlab_model', selector: '#vlab-workspace-container', fileName: 'vlab_model.json', status: 'idle', direction: 'bidirectional' },
  ]);

  const [isLivePanelOpen, setIsLivePanelOpen] = useState(false);

  const handleCapture = async (item: SyncItem) => {
    setSyncItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'capturing' } : i));
    
    if (!item.selector) {
      setSyncItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'ready' } : i));
      return;
    }

    try {
      const { captureElementAsPng } = await import('../services/diagramExporter');
      const exportItem = await captureElementAsPng(item.selector, item.type as any, item.name, item.fileName);
      if (exportItem.available && exportItem.content) {
        setSyncItems(prev => prev.map(i => i.id === item.id ? {
          ...i,
          status: 'ready',
          previewData: `data:image/png;base64,${exportItem.content}`
        } : i));
      } else {
        setSyncItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'error' } : i));
      }
    } catch (err) {
      console.error(err);
      setSyncItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'error' } : i));
    }
  };

  const handleSyncItem = async (item: SyncItem) => {
    if (!selectedWorkspace) return;
    setSyncItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'syncing' } : i));

    try {
      let content = '';
      let encoding: 'base64' | 'utf8' = 'base64';
      let mimeType = 'image/png';

      if (item.id === 'codegen') {
        const mockCode = `/* ADIA Generated Code — ${new Date().toISOString()} */\n#include "hal_drivers.h"\n`;
        content = btoa(mockCode);
        encoding = 'base64';
        mimeType = 'application/zip';
      } else if (item.id === 'xbridges') {
        content = adiaExports.find(x => x.type === 'xbridges_model')?.content || '{}';
        encoding = 'utf8';
        mimeType = 'application/json';
      } else if (item.id === 'vlab') {
        const matchingExp = adiaExports.find(x => x.type === 'vlab_model');
        content = matchingExp ? matchingExp.content : JSON.stringify({ vlab: 'vlab_model_data' });
        encoding = matchingExp ? matchingExp.encoding : 'utf8';
        mimeType = 'application/json';
      } else {
        let currentItem = item;
        if (!item.previewData) {
          await handleCapture(item);
          // retrieve the updated item with previewData
          const updated = syncItems.find(i => i.id === item.id);
          if (updated) currentItem = updated;
        }
        
        if (currentItem.previewData) {
          content = currentItem.previewData.split(',')[1];
          encoding = 'base64';
          mimeType = 'image/png';
        } else {
          // fallback if capture failed
          content = btoa('Capture failed fallback');
          encoding = 'base64';
          mimeType = 'image/png';
        }
      }

      const result = await ThreeDXService.uploadDocument({
        fileName: item.fileName,
        content,
        encoding,
        mimeType,
        targetWorkspaceId: selectedWorkspace,
        title: item.name,
        description: `Synced from ADIA Engineering Suite — ${new Date().toLocaleString()}`,
      });

      if (result.success) {
        setSyncItems(prev => prev.map(i => i.id === item.id ? {
          ...i,
          status: 'done',
          lastSynced: new Date().toLocaleTimeString()
        } : i));
      } else {
        setSyncItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'error' } : i));
      }
    } catch (err) {
      console.error(err);
      setSyncItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'error' } : i));
    }
  };

  const unsubscribeBrowserRef = useRef<(() => void) | null>(null);
  const unsubscribeOAuthRef = useRef<(() => void) | null>(null);

  const isConnected = status === 'connected';

  // ── Effects ──────────────────────────────────────────────────────────────

  // Load stored credentials on open
  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      const stored = await ThreeDXService.loadStoredCredentials();
      if (stored) {
        setCreds(stored);
        setTenantUrl(stored.tenantUrl || tenantUrl);
        setClientId(stored.clientId || '');
        setStatus(ThreeDXService.getConnectionStatus(stored));
      }
    })();
  }, [isOpen]);

  // Subscribe to browser state updates
  useEffect(() => {
    if (!isOpen) return;
    unsubscribeBrowserRef.current = ThreeDXService.onBrowserStateChange((state) => {
      setBrowserState(state);
      setBrowserUrlInput(state.url);
    });
    unsubscribeOAuthRef.current = ThreeDXService.onOAuthComplete(async (result) => {
      setAuthLoading(false);
      if (result.success && result.credentials) {
        setCreds(result.credentials);
        setStatus('connected');
        setAuthError('');
        setActiveTab('browser');
        // Auto-navigate to the 3DX platform on first connect
        await ThreeDXService.navigateBrowserView(
          ThreeDXService.buildPlatformUrl(result.credentials.tenantUrl)
        );
      } else {
        setAuthError(result.error || 'Authentication failed. Please try again.');
        setStatus('error');
      }
    });
    return () => {
      unsubscribeBrowserRef.current?.();
      unsubscribeOAuthRef.current?.();
    };
  }, [isOpen]);

  // Load workspaces when switching to upload tab
  useEffect(() => {
    if (activeTab === 'upload' && isConnected && workspaces.length === 0) {
      fetchWorkspaces();
    }
  }, [activeTab, isConnected]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleConnect = useCallback(async () => {
    if (!tenantUrl.trim() || !clientId.trim()) {
      setAuthError('Please enter both Tenant URL and Client ID.');
      return;
    }
    setAuthLoading(true);
    setAuthError('');
    setStatus('connecting');
    const result = await ThreeDXService.startOAuthFlow(tenantUrl.trim(), clientId.trim());
    if (!result.success) {
      setAuthLoading(false);
      setAuthError(result.error || 'Failed to start OAuth flow.');
      setStatus('error');
    }
    // Success is handled via onOAuthComplete listener above
  }, [tenantUrl, clientId]);

  const handleLogout = useCallback(async () => {
    await ThreeDXService.logout();
    await ThreeDXService.closeBrowserView();
    setCreds(null);
    setStatus('disconnected');
    setBrowserVisible(false);
    setActiveTab('auth');
    setWorkspaces([]);
    setSearchResults([]);
  }, []);

  const handleBrowserNavigate = useCallback(async (url?: string) => {
    const target = url ?? browserUrlInput;
    if (!target) return;
    let navUrl = target;
    if (!/^https?:\/\//i.test(navUrl)) navUrl = `https://${navUrl}`;
    setBrowserUrlInput(navUrl);
    setBrowserVisible(true);
    await ThreeDXService.navigateBrowserView(navUrl);
  }, [browserUrlInput]);

  const fetchWorkspaces = useCallback(async () => {
    setWorkspacesLoading(true);
    const ws = await ThreeDXService.listWorkspaces();
    setWorkspaces(ws);
    if (ws.length > 0 && !selectedWorkspace) setSelectedWorkspace(ws[0].id);
    setWorkspacesLoading(false);
  }, [selectedWorkspace]);

  const handleUpload = useCallback(async () => {
    const toUpload = adiaExports.filter(
      (e) => e.available && selectedExports[e.type]
    );
    if (!selectedWorkspace || toUpload.length === 0) return;

    const progress: Record<string, 'idle' | 'uploading' | 'done' | 'error'> = {};
    toUpload.forEach((e) => { progress[e.type] = 'uploading'; });
    setUploadProgress({ ...progress });

    for (const exportItem of toUpload) {
      try {
        const result: ThreeDXUploadResult = await ThreeDXService.uploadDocument({
          fileName: exportItem.fileName,
          content: exportItem.content,
          encoding: exportItem.encoding,
          mimeType: exportItem.mimeType,
          targetWorkspaceId: selectedWorkspace,
          title: exportItem.label,
          description: `Uploaded from ADIA Engineering Suite — ${new Date().toLocaleString()}`,
        });
        setUploadProgress((prev) => ({
          ...prev,
          [exportItem.type]: result.success ? 'done' : 'error',
        }));
      } catch {
        setUploadProgress((prev) => ({ ...prev, [exportItem.type]: 'error' }));
      }
    }
  }, [adiaExports, selectedExports, selectedWorkspace]);

  const handleSearch = useCallback(async () => {
    setSearchLoading(true);
    const result = await ThreeDXService.searchDocuments({
      query: searchQuery,
      workspaceId: selectedWorkspace || undefined,
      limit: 50,
    });
    setSearchResults(result.documents);
    setSearchLoading(false);
  }, [searchQuery, selectedWorkspace]);

  const handleDownload = useCallback(async (doc: ThreeDXDocument) => {
    setDownloadProgress((prev) => ({ ...prev, [doc.id]: 'downloading' }));
    try {
      const result = await ThreeDXService.downloadDocument(doc.id);
      if (result.success && result.content) {
        if (doc.fileType === 'json' || doc.mimeType === 'application/json') {
          const jsonStr =
            result.encoding === 'base64'
              ? atob(result.content)
              : result.content;
          onImportJson(jsonStr);
        } else {
          // For non-JSON files, trigger a browser download via a data URL
          const mimeType = result.mimeType || doc.mimeType || 'application/octet-stream';
          const dataUrl =
            result.encoding === 'base64'
              ? `data:${mimeType};base64,${result.content}`
              : `data:${mimeType};charset=utf-8,${encodeURIComponent(result.content)}`;
          const a = document.createElement('a');
          a.href = dataUrl;
          a.download = doc.title || doc.id;
          a.click();
        }
        setDownloadProgress((prev) => ({ ...prev, [doc.id]: 'done' }));
      } else {
        setDownloadProgress((prev) => ({ ...prev, [doc.id]: 'error' }));
      }
    } catch {
      setDownloadProgress((prev) => ({ ...prev, [doc.id]: 'error' }));
    }
  }, [onImportJson]);

  const handleClose = useCallback(async () => {
    // Hide BrowserView but keep session alive
    await ThreeDXService.closeBrowserView();
    setBrowserVisible(false);
    onClose();
  }, [onClose]);

  // ── Early return ─────────────────────────────────────────────────────────
  if (!isOpen) return null;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[200] animate-in fade-in duration-200">
      <div
        className="bg-[#0c0c10] border border-[#1e2a3a] rounded-2xl shadow-2xl shadow-blue-950/30 flex flex-col overflow-hidden"
        style={{ width: '920px', maxHeight: '90vh', minHeight: '600px' }}
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1a2133] bg-gradient-to-r from-[#0056b3]/10 to-transparent flex-shrink-0">
          <div className="flex items-center gap-3">
            {/* 3DS Logo Icon */}
            <div className="w-10 h-10 rounded-xl bg-[#0056b3]/20 border border-[#0056b3]/40 flex items-center justify-center">
              <Cloud size={20} className="text-[#4da6ff]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                3DEXPERIENCE Gateway
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <StatusDot status={status} />
                <span className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">
                  {status === 'connected'
                    ? `Connected — ${creds?.userDisplayName ?? creds?.tenantUrl ?? 'Authenticated'}`
                    : status === 'connecting'
                    ? 'Connecting…'
                    : status === 'token_expired'
                    ? 'Session Expired — Please Re-authenticate'
                    : status === 'error'
                    ? 'Connection Error'
                    : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>
          <button
            id="3dx-gateway-close"
            onClick={handleClose}
            className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Tab Bar ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-[#1a2133] bg-[#0a0d14]/50 flex-shrink-0">
          <TabButton id="auth" active={activeTab === 'auth'} onClick={() => setActiveTab('auth')}
            icon={<ShieldCheck size={14} />} label="Authentication" />
          <TabButton id="browser" active={activeTab === 'browser'} onClick={() => setActiveTab('browser')}
            icon={<Globe size={14} />} label="Browser" disabled={!isConnected} />
          <TabButton id="sync" active={activeTab === 'sync'} onClick={() => setActiveTab('sync')}
            icon={<Layers size={14} />} label="Dashboard Sync" disabled={!isConnected} />
          <TabButton id="upload" active={activeTab === 'upload'} onClick={() => setActiveTab('upload')}
            icon={<Upload size={14} />} label="Upload" disabled={!isConnected} />
          <TabButton id="download" active={activeTab === 'download'} onClick={() => setActiveTab('download')}
            icon={<Download size={14} />} label="Download" disabled={!isConnected} />
        </div>

        {/* ── Content Area ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto min-h-0">

          {/* ══ AUTH TAB ══════════════════════════════════════════════ */}
          {activeTab === 'auth' && (
            <div className="p-6 max-w-lg mx-auto">
              {/* Connected state */}
              {isConnected && creds ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-emerald-950/20 border border-emerald-800/30">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                      <User size={22} className="text-emerald-400" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {creds.userDisplayName || 'Authenticated User'}
                      </div>
                      <div className="text-xs text-gray-400">{creds.userEmail || creds.userId}</div>
                      <div className="text-[10px] text-emerald-400 mt-0.5 flex items-center gap-1">
                        <CheckCircle2 size={10} /> Authenticated to 3DEXPERIENCE
                      </div>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-[#0a0d14] border border-[#1a2133] space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Tenant</span>
                      <span className="text-gray-300 font-mono truncate max-w-[220px]">
                        {creds.tenantUrl}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Client ID</span>
                      <span className="text-gray-300 font-mono">
                        {creds.clientId ? `${creds.clientId.slice(0, 8)}…` : '—'}
                      </span>
                    </div>
                    {creds.expiresAt && (
                      <div className="flex justify-between">
                        <span className="text-gray-500 flex items-center gap-1">
                          <Clock size={10} /> Token Expires
                        </span>
                        <span className="text-gray-300">
                          {new Date(creds.expiresAt).toLocaleTimeString()}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      id="3dx-go-browser"
                      onClick={() => setActiveTab('browser')}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#0056b3]/20 hover:bg-[#0056b3]/30 text-[#4da6ff] rounded-lg text-sm font-medium border border-[#0056b3]/40 transition-colors"
                    >
                      <Globe size={15} />
                      Open 3DX Browser
                    </button>
                    <button
                      id="3dx-refresh-token"
                      onClick={async () => { await ThreeDXService.refreshOAuthToken(); }}
                      className="flex items-center justify-center gap-2 px-3 py-2.5 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded-lg text-sm border border-white/10 transition-colors"
                      title="Refresh Token"
                    >
                      <RefreshCw size={14} />
                    </button>
                    <button
                      id="3dx-logout"
                      onClick={handleLogout}
                      className="flex items-center justify-center gap-2 px-3 py-2.5 bg-red-900/20 hover:bg-red-900/30 text-red-400 rounded-lg text-sm border border-red-800/30 transition-colors"
                      title="Logout"
                    >
                      <LogOut size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                /* Login form */
                <div className="space-y-5">
                  <div className="text-center space-y-2 pb-2">
                    <div className="w-16 h-16 rounded-2xl bg-[#0056b3]/10 border border-[#0056b3]/30 flex items-center justify-center mx-auto mb-4">
                      <Cloud size={30} className="text-[#4da6ff]" />
                    </div>
                    <h3 className="text-white font-semibold text-lg">Connect to 3DEXPERIENCE</h3>
                    <p className="text-gray-400 text-sm leading-relaxed">
                      Sign in with your Dassault Systèmes account to access collaborative spaces, upload ADIA models, and download documentation.
                    </p>
                  </div>

                  {authError && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-red-950/30 border border-red-800/40 text-red-400 text-xs">
                      <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                      <span>{authError}</span>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-gray-400 font-medium block mb-1.5">
                        3DEXPERIENCE Tenant URL
                      </label>
                      <input
                        id="3dx-tenant-url"
                        type="url"
                        value={tenantUrl}
                        onChange={(e) => setTenantUrl(e.target.value)}
                        placeholder="https://iam.3dexperience.3ds.com"
                        className="w-full bg-[#0a0d14] border border-[#1e2a3a] rounded-lg px-3 py-2.5 text-sm text-white font-mono placeholder-gray-600 focus:outline-none focus:border-[#0056b3]/60 focus:ring-1 focus:ring-[#0056b3]/30 transition-colors"
                      />
                      <p className="text-[10px] text-gray-500 mt-1">
                        Your company's 3DEXPERIENCE IAM base URL (e.g. eu1-ds-iam.3dexperience.3ds.com)
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 font-medium block mb-1.5">
                        OAuth 2.0 Client ID
                      </label>
                      <input
                        id="3dx-client-id"
                        type="text"
                        value={clientId}
                        onChange={(e) => setClientId(e.target.value)}
                        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                        className="w-full bg-[#0a0d14] border border-[#1e2a3a] rounded-lg px-3 py-2.5 text-sm text-white font-mono placeholder-gray-600 focus:outline-none focus:border-[#0056b3]/60 focus:ring-1 focus:ring-[#0056b3]/30 transition-colors"
                      />
                      <p className="text-[10px] text-gray-500 mt-1">
                        Register ADIA in your 3DX IAM portal under Apps &amp; Access to get a Client ID
                      </p>
                    </div>
                  </div>

                  <button
                    id="3dx-connect-btn"
                    onClick={handleConnect}
                    disabled={authLoading || !tenantUrl || !clientId}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-[#0056b3] hover:bg-[#0069d9] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors"
                  >
                    {authLoading ? (
                      <><Loader2 size={16} className="animate-spin" /> Opening OAuth login…</>
                    ) : (
                      <><LogIn size={16} /> Authenticate with 3DEXPERIENCE</>
                    )}
                  </button>

                  <div className="flex items-center gap-2 text-[10px] text-gray-500 justify-center">
                    <ShieldCheck size={11} />
                    <span>Auth uses OAuth 2.0 PKCE — credentials never stored in plain text</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ BROWSER TAB ═══════════════════════════════════════════ */}
          {activeTab === 'browser' && (
            <div className="flex flex-col h-full p-4 gap-3">
              {/* Navigation bar */}
              <div className="flex items-center gap-2 p-2 bg-[#0a0d14] rounded-xl border border-[#1a2133]">
                <button
                  id="3dx-browser-back"
                  onClick={() => ThreeDXService.browserGoBack()}
                  disabled={!browserState.canGoBack}
                  className="p-1.5 rounded-md text-gray-500 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowLeft size={15} />
                </button>
                <button
                  id="3dx-browser-forward"
                  onClick={() => ThreeDXService.browserGoForward()}
                  disabled={!browserState.canGoForward}
                  className="p-1.5 rounded-md text-gray-500 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowRight size={15} />
                </button>
                <button
                  id="3dx-browser-reload"
                  onClick={() => ThreeDXService.browserReload()}
                  className="p-1.5 rounded-md text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <RotateCcw size={15} className={browserState.isLoading ? 'animate-spin' : ''} />
                </button>
                <form
                  className="flex-1 flex items-center gap-2"
                  onSubmit={(e) => { e.preventDefault(); handleBrowserNavigate(); }}
                >
                  <div className="flex-1 flex items-center gap-2 px-3 py-1.5 bg-[#111520] rounded-lg border border-[#1a2133] focus-within:border-[#0056b3]/50">
                    {browserState.isLoading
                      ? <Loader2 size={12} className="text-gray-500 animate-spin flex-shrink-0" />
                      : <Globe size={12} className="text-gray-500 flex-shrink-0" />}
                    <input
                      id="3dx-url-bar"
                      type="text"
                      value={browserUrlInput}
                      onChange={(e) => setBrowserUrlInput(e.target.value)}
                      placeholder={ThreeDXService.buildPlatformUrl(creds?.tenantUrl ?? tenantUrl)}
                      className="flex-1 bg-transparent text-xs text-gray-300 font-mono placeholder-gray-600 focus:outline-none"
                    />
                  </div>
                  <button type="submit" className="sr-only">Go</button>
                </form>
                {/* Quick shortcut: open at platform home */}
                <button
                  id="3dx-go-home"
                  onClick={() => handleBrowserNavigate(ThreeDXService.buildPlatformUrl(creds?.tenantUrl ?? tenantUrl))}
                  className="p-1.5 rounded-md text-gray-500 hover:text-[#4da6ff] hover:bg-[#0056b3]/10 transition-colors"
                  title="3DEXPERIENCE Home"
                >
                  <Cloud size={15} />
                </button>
              </div>

              {/* Browser viewport placeholder */}
              <div className="flex-1 rounded-xl border border-[#1a2133] bg-[#080b12] flex flex-col items-center justify-center gap-4 min-h-[340px]">
                {browserState.isLoading ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 size={32} className="text-[#0056b3] animate-spin" />
                    <p className="text-gray-400 text-sm">Loading 3DEXPERIENCE…</p>
                  </div>
                ) : browserVisible && browserState.url ? (
                  <div className="flex flex-col items-center gap-3 text-center px-8">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                      <CheckCircle2 size={28} className="text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-white text-sm font-semibold">3DEXPERIENCE is running</p>
                      <p className="text-gray-400 text-xs mt-1">
                        The browser is active in the background. It's embedded as a native window layer over this panel.
                      </p>
                      <p className="text-[#4da6ff] text-xs font-mono mt-2 truncate max-w-xs">{browserState.url}</p>
                    </div>
                    <button
                      id="3dx-open-external"
                      onClick={() => window.open(browserState.url, '_blank')}
                      className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white transition-colors mt-1"
                    >
                      <ExternalLink size={12} /> Open in system browser
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4 text-center px-8">
                    <div className="w-16 h-16 rounded-2xl bg-[#0056b3]/10 border border-[#0056b3]/30 flex items-center justify-center">
                      <Globe size={28} className="text-[#4da6ff]" />
                    </div>
                    <div>
                      <p className="text-white text-sm font-semibold">3DEXPERIENCE Browser</p>
                      <p className="text-gray-400 text-xs mt-1 leading-relaxed">
                        Enter a URL above or click below to navigate to your 3DEXPERIENCE platform.
                      </p>
                    </div>
                    <button
                      id="3dx-launch-browser"
                      onClick={() => handleBrowserNavigate(ThreeDXService.buildPlatformUrl(creds?.tenantUrl ?? tenantUrl))}
                      className="flex items-center gap-2 px-4 py-2 bg-[#0056b3] hover:bg-[#0069d9] text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      <Cloud size={15} />
                      Open 3DEXPERIENCE Platform
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══ UPLOAD TAB ════════════════════════════════════════════ */}
          {activeTab === 'upload' && (
            <div className="p-6 space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-white mb-1">Upload ADIA Documents</h3>
                <p className="text-xs text-gray-400">
                  Push ADIA project files to a 3DEXPERIENCE collaborative space.
                </p>
              </div>

              {/* Workspace selector */}
              <div>
                <label className="text-xs text-gray-400 font-medium block mb-1.5">
                  Target Collaborative Space
                </label>
                {workspacesLoading ? (
                  <div className="flex items-center gap-2 text-gray-500 text-xs py-2">
                    <Loader2 size={14} className="animate-spin" /> Loading workspaces…
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <select
                      id="3dx-workspace-select"
                      value={selectedWorkspace}
                      onChange={(e) => setSelectedWorkspace(e.target.value)}
                      className="flex-1 bg-[#0a0d14] border border-[#1e2a3a] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#0056b3]/60 transition-colors"
                    >
                      {workspaces.length === 0 && (
                        <option value="">No workspaces found</option>
                      )}
                      {workspaces.map((ws) => (
                        <option key={ws.id} value={ws.id}>
                          {ws.title} — {ws.type}
                        </option>
                      ))}
                    </select>
                    <button
                      id="3dx-refresh-workspaces"
                      onClick={fetchWorkspaces}
                      className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 border border-[#1a2133] transition-colors"
                    >
                      <RefreshCw size={14} />
                    </button>
                  </div>
                )}
              </div>

              {/* Document selection */}
              <div>
                <label className="text-xs text-gray-400 font-medium block mb-2">
                  Select Documents to Upload
                </label>
                <div className="space-y-2">
                  {adiaExports.map((exp) => {
                    const prog = uploadProgress[exp.type];
                    return (
                      <div
                        key={exp.type}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                          exp.available
                            ? selectedExports[exp.type]
                              ? 'border-[#0056b3]/50 bg-[#0056b3]/5'
                              : 'border-[#1a2133] bg-[#0a0d14] hover:border-[#1e2a3a]'
                            : 'border-[#111520] bg-[#080b12] opacity-40 cursor-not-allowed'
                        }`}
                      >
                        <input
                          type="checkbox"
                          id={`3dx-export-${exp.type}`}
                          checked={!!selectedExports[exp.type]}
                          disabled={!exp.available}
                          onChange={(e) =>
                            setSelectedExports((prev) => ({
                              ...prev,
                              [exp.type]: e.target.checked,
                            }))
                          }
                          className="w-4 h-4 accent-[#0056b3] rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white font-medium">{exp.label}</div>
                          <div className="text-xs text-gray-500 font-mono">{exp.fileName}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {prog === 'uploading' && <Loader2 size={14} className="text-[#4da6ff] animate-spin" />}
                          {prog === 'done' && <CheckCircle2 size={14} className="text-emerald-400" />}
                          {prog === 'error' && <AlertCircle size={14} className="text-red-400" />}
                          {!exp.available && (
                            <span className="text-[10px] text-gray-600 uppercase tracking-wider">
                              Not Available
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <button
                id="3dx-upload-btn"
                onClick={handleUpload}
                disabled={
                  !selectedWorkspace ||
                  Object.values(selectedExports).every((v) => !v) ||
                  Object.values(uploadProgress).some((p) => p === 'uploading')
                }
                className="w-full flex items-center justify-center gap-2 py-3 bg-[#0056b3] hover:bg-[#0069d9] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors"
              >
                {Object.values(uploadProgress).some((p) => p === 'uploading') ? (
                  <><Loader2 size={15} className="animate-spin" /> Uploading…</>
                ) : (
                  <><Upload size={15} /> Upload to 3DEXPERIENCE</>
                )}
              </button>
            </div>
          )}

          {/* ══ DOWNLOAD TAB ══════════════════════════════════════════ */}
          {activeTab === 'download' && (
            <div className="p-6 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-white mb-1">Download from 3DEXPERIENCE</h3>
                <p className="text-xs text-gray-400">
                  Search and import documents from your 3DX collaborative spaces.
                </p>
              </div>

              {/* Search bar */}
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 px-3 py-2.5 bg-[#0a0d14] rounded-lg border border-[#1e2a3a] focus-within:border-[#0056b3]/50 transition-colors">
                  <Search size={14} className="text-gray-500 flex-shrink-0" />
                  <input
                    id="3dx-search-input"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Search documents by name, type…"
                    className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 focus:outline-none"
                  />
                </div>
                <button
                  id="3dx-search-btn"
                  onClick={handleSearch}
                  disabled={searchLoading}
                  className="flex items-center gap-2 px-4 py-2.5 bg-[#0056b3] hover:bg-[#0069d9] disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {searchLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                  Search
                </button>
              </div>

              {/* Results */}
              {searchLoading ? (
                <div className="flex items-center justify-center py-10 gap-3 text-gray-500">
                  <Loader2 size={20} className="animate-spin" />
                  <span className="text-sm">Searching 3DEXPERIENCE…</span>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                  <div className="w-14 h-14 rounded-xl bg-[#0056b3]/10 border border-[#0056b3]/20 flex items-center justify-center">
                    <Inbox size={24} className="text-[#4da6ff]/50" />
                  </div>
                  <div>
                    <p className="text-gray-400 text-sm">No documents found</p>
                    <p className="text-gray-600 text-xs mt-1">
                      Search above or leave empty and click Search to list all documents.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {searchResults.map((doc) => {
                    const prog = downloadProgress[doc.id];
                    return (
                      <div
                        key={doc.id}
                        className="flex items-center gap-3 p-3 rounded-lg bg-[#0a0d14] border border-[#1a2133] hover:border-[#1e2a3a] transition-colors"
                      >
                        <div className="w-9 h-9 rounded-lg bg-[#0056b3]/10 border border-[#0056b3]/20 flex items-center justify-center flex-shrink-0">
                          <FileText size={16} className="text-[#4da6ff]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white font-medium truncate">{doc.title}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-gray-500 uppercase tracking-wider bg-[#111520] border border-[#1a2133] px-1.5 py-0.5 rounded">
                              {doc.fileType}
                            </span>
                            <span className="text-[10px] text-gray-600">
                              {ThreeDXService.formatFileSize(doc.size)}
                            </span>
                            <span className="text-[10px] text-gray-600">
                              {new Date(doc.modified).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        <button
                          id={`3dx-download-${doc.id}`}
                          onClick={() => handleDownload(doc)}
                          disabled={prog === 'downloading'}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            prog === 'done'
                              ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800/30'
                              : prog === 'error'
                              ? 'bg-red-900/30 text-red-400 border border-red-800/30'
                              : 'bg-[#0056b3]/20 hover:bg-[#0056b3]/30 text-[#4da6ff] border border-[#0056b3]/40'
                          }`}
                        >
                          {prog === 'downloading' && <Loader2 size={12} className="animate-spin" />}
                          {prog === 'done' && <CheckCircle2 size={12} />}
                          {prog === 'error' && <AlertCircle size={12} />}
                          {!prog && <Download size={12} />}
                          {prog === 'done' ? 'Imported' : prog === 'error' ? 'Failed' : prog === 'downloading' ? 'Downloading' : 'Download'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ══ SYNC TAB ════════════════════════════════════════════ */}
          {activeTab === 'sync' && (
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white mb-1">3DEXPERIENCE Live Sync Dashboard</h3>
                  <p className="text-xs text-gray-400">
                    Capture, package, and sync all engineering diagrams and models with your Collaborative Space.
                  </p>
                </div>
                <button
                  onClick={() => setIsLivePanelOpen(!isLivePanelOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-[#0056b3]/25 hover:bg-[#0056b3]/40 border border-[#0056b3]/40 text-[#4da6ff] rounded-lg text-xs font-bold transition-all cursor-pointer"
                >
                  <Globe size={13} />
                  {isLivePanelOpen ? 'Close Live Panel' : 'Open Live Panel'}
                </button>
              </div>

              {/* Passport Section */}
              <div className="threedx-passport-card p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#0056b3]/20 border border-[#0056b3]/40 flex items-center justify-center">
                    <User size={18} className="text-[#4da6ff]" />
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 uppercase tracking-widest block font-bold">User Passport</span>
                    <span className="text-xs font-bold text-white block">{creds?.userDisplayName || 'Default User'}</span>
                    <span className="text-[10px] text-[#4da6ff]">{creds?.userEmail || 'active-session@3dexperience'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-[9px] text-gray-500 block uppercase font-bold">Collaborative Space</span>
                    <span className="text-xs text-white block font-semibold">
                      {workspaces.find(w => w.id === selectedWorkspace)?.title || 'No space selected'}
                    </span>
                  </div>
                  <StatusDot status={status} />
                </div>
              </div>

              {/* Sync Table */}
              <div className="space-y-3">
                {syncItems.map((item) => {
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3.5 rounded-xl bg-[#0a0d14] border border-[#1a2133] hover:border-[#1e2a3a] transition-all duration-200"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {item.previewData ? (
                          <div className="w-12 h-12 rounded-lg border border-[#1e2a3a] overflow-hidden flex-shrink-0 bg-black relative group">
                            <img src={item.previewData} alt="Preview" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <Eye size={12} className="text-white" />
                            </div>
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-[#111520] border border-[#1a2133] flex items-center justify-center flex-shrink-0">
                            {item.id === 'codegen' ? <FileText size={18} className="text-yellow-500" /> :
                             item.id === 'xbridges' ? <Settings size={18} className="text-emerald-500" /> :
                             item.id === 'vlab' ? <Play size={18} className="text-purple-500" /> :
                             <Layers size={18} className="text-[#4da6ff]" />}
                          </div>
                        )}
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-white block truncate">{item.name}</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] text-gray-500 font-mono block truncate max-w-[150px]">{item.fileName}</span>
                            {item.lastSynced && (
                              <span className="text-[9px] text-emerald-400 bg-emerald-950/20 border border-emerald-900/30 px-1.5 py-0.25 rounded-full">
                                Synced {item.lastSynced}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0">
                        {/* Sync Direction Toggle */}
                        <div className="flex items-center bg-[#111520] border border-[#1a2133] rounded-lg p-0.5">
                          {(['push', 'pull', 'bidirectional'] as const).map((dir) => (
                            <button
                              key={dir}
                              onClick={() => {
                                setSyncItems(prev => prev.map(i => i.id === item.id ? { ...i, direction: dir } : i));
                              }}
                              className={`px-2 py-1 text-[9px] font-bold uppercase rounded transition-all cursor-pointer ${
                                item.direction === dir
                                  ? 'bg-[#0056b3]/25 text-[#4da6ff] border border-[#0056b3]/30'
                                  : 'text-gray-600 hover:text-gray-400'
                              }`}
                            >
                              {dir === 'push' ? 'Push' : dir === 'pull' ? 'Pull' : 'Sync ↔'}
                            </button>
                          ))}
                        </div>

                        {/* Actions */}
                        {item.selector && (
                          <button
                            onClick={() => handleCapture(item)}
                            disabled={item.status === 'capturing' || item.status === 'syncing'}
                            className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/10 rounded-lg text-[10px] font-bold transition-all cursor-pointer"
                          >
                            {item.status === 'capturing' ? 'Capturing...' : 'Capture'}
                          </button>
                        )}

                        <button
                          onClick={() => handleSyncItem(item)}
                          disabled={item.status === 'syncing' || !selectedWorkspace}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border cursor-pointer ${
                            item.status === 'done'
                              ? 'bg-emerald-950/20 text-emerald-400 border-emerald-800/30'
                              : item.status === 'error'
                              ? 'bg-red-950/20 text-red-400 border-red-800/30'
                              : 'bg-[#0056b3]/25 hover:bg-[#0056b3]/35 text-[#4da6ff] border-[#0056b3]/30'
                          }`}
                        >
                          {item.status === 'syncing' && <Loader2 size={12} className="animate-spin" />}
                          {item.status === 'done' && <CheckCircle2 size={12} />}
                          {item.status === 'error' && <AlertCircle size={12} />}
                          {item.status !== 'syncing' && item.status !== 'done' && item.status !== 'error' && <ArrowRightCircle size={12} />}
                          {item.status === 'syncing' ? 'Syncing' : item.status === 'done' ? 'Synced' : item.status === 'error' ? 'Failed' : 'Sync Now'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-[#1a2133] bg-[#0a0d14]/50 flex-shrink-0">
          <div className="flex items-center gap-2 text-[10px] text-gray-600">
            <StatusDot status={status} />
            <span>
              {status === 'connected'
                ? `3DEXPERIENCE — ${creds?.tenantUrl ?? ''}`
                : 'Not connected to 3DEXPERIENCE'}
            </span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-gray-600">
            <ShieldCheck size={10} />
            <span>OAuth 2.0 PKCE · Dassault Systèmes</span>
          </div>
        </div>
      </div>

      {/* Live Panel Sidebar */}
      <ThreeDXDashboardPanel
        isOpen={isLivePanelOpen}
        onClose={() => setIsLivePanelOpen(false)}
        tenantUrl={creds?.tenantUrl || tenantUrl}
      />
    </div>
  );
};

export default ThreeDXGateway;
