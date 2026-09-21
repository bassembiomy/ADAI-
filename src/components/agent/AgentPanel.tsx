import React, { useState, useEffect, useRef } from 'react';
import { AgentOrchestrator, OrchestratorResponse } from '../../agent/agentOrchestrator';
import { AdiaBlockCatalog, CatalogBlock } from '../../agent/adiaBlockCatalog';
import { ExtendedApprovalRequest } from '../../agent/approvalGate';
import { localLlmService } from '../../services/localLlmService';
import { AgentChatSession, ChatMessage, createAgentChatSession, deriveChatTitle, updateSessionById } from './agentChatSessions';
import './AgentPanel.css';

export interface AgentPanelProjectContext {
  projectName?: string;
  activeWorkspace?: string;
  blocksCount?: number;
  nodesCount?: number;
  connectionsCount?: number;
  modelState?: Record<string, unknown>;
  refreshProject?: () => void;
  delegateReadiness?: {
    xbridges: boolean;
    sysml: boolean;
    report: boolean;
    simulation: boolean;
  };
}

export interface AgentPanelProps {
  isOpen?: boolean;
  onClose?: () => void;
  onToggle?: () => void;
  projectContext?: AgentPanelProjectContext;
  orchestrator?: AgentOrchestrator;
  onProjectChange?: () => void;
  initialResponse?: OrchestratorResponse;
}

export const AgentPanel: React.FC<AgentPanelProps> = ({
  isOpen: propIsOpen,
  onClose,
  onToggle,
  projectContext,
  orchestrator: propOrchestrator,
  onProjectChange,
  initialResponse
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = propIsOpen !== undefined ? propIsOpen : internalIsOpen;

  const [activeTab, setActiveTab] = useState<'chat' | 'spec' | 'blocks' | 'audit'>('chat');
  const [inputText, setInputText] = useState('');
  const [internalOrchestrator] = useState<AgentOrchestrator>(
    () => propOrchestrator || new AgentOrchestrator()
  );
  const orchestrator = propOrchestrator || internalOrchestrator;
  const [sessions, setSessions] = useState<AgentChatSession[]>(() => {
    const session = createAgentChatSession(orchestrator);
    return [{ ...session, currentResponse: initialResponse ?? null }];
  });
  const [activeSessionId] = useState(() => sessions[0]?.id);
  const activeSession = sessions.find(session => session.id === activeSessionId) ?? sessions[0];
  const activeSessionOrchestrator = activeSession!.orchestrator;
  const messages = activeSession?.messages ?? [];
  const currentResponse = activeSession?.currentResponse ?? null;
  const isBusy = activeSession?.isBusy ?? false;
  const [modelStatus, setModelStatus] = useState<string>('Checking...');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(() => localLlmService.getConfig().modelName);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'unavailable' | 'unselected'>('unavailable');
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [canUndo, setCanUndo] = useState<boolean>(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const refreshStatus = async () => {
    try {
      const status = await localLlmService.checkStatus();
      setAvailableModels(status.models);
      setSelectedModel(status.currentModel);
      if (status.available) {
        if (status.isModelSelected) {
          setConnectionStatus('connected');
          setModelStatus(`${status.currentModel} (Online loopback)`);
        } else {
          setConnectionStatus('unselected');
          setModelStatus('Deterministic inspection-only mode (select model)');
        }
      } else {
        setConnectionStatus('unavailable');
        setModelStatus('Deterministic inspection-only mode');
      }
    } catch {
      setConnectionStatus('unavailable');
      setModelStatus('Deterministic inspection-only mode');
    }
  };

  useEffect(() => {
    refreshStatus();
  }, []);

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newModel = e.target.value;
    setSelectedModel(newModel);
    localLlmService.setSelectedModel(newModel);
    if (newModel && availableModels.includes(newModel)) {
      setConnectionStatus('connected');
      setModelStatus(`${newModel} (Online loopback)`);
    } else {
      setConnectionStatus('unselected');
      setModelStatus('Deterministic inspection-only mode (select model)');
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      const status = await localLlmService.testConnection();
      setAvailableModels(status.models);
      setSelectedModel(status.currentModel);
      if (status.available) {
        if (status.isModelSelected) {
          setConnectionStatus('connected');
          setModelStatus(`${status.currentModel} (Online loopback)`);
        } else {
          setConnectionStatus('unselected');
          setModelStatus('Deterministic inspection-only mode (select model)');
        }
      } else {
        setConnectionStatus('unavailable');
        setModelStatus('Deterministic inspection-only mode');
      }
    } finally {
      setIsTesting(false);
    }
  };

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    } else if (onClose && isOpen) {
      onClose();
    } else {
      setInternalIsOpen(!isOpen);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() || isBusy) return;

    const sessionId = activeSessionId;
    const sessionOrchestrator = activeSession!.orchestrator;
    if (!sessionId) return;
    const promptToSend = inputText.trim();

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-u`,
      sender: 'user',
      text: inputText.trim(),
      timestamp: new Date().toLocaleTimeString()
    };

    setSessions(prev => updateSessionById(prev, sessionId, session => ({
      ...session,
      title: session.messages.length === 0 ? deriveChatTitle(promptToSend) : session.title,
      updatedAt: Date.now(),
      messages: [...session.messages, userMsg],
      isBusy: true,
    })));
    setInputText('');

    try {
      const resp = await sessionOrchestrator.handle(promptToSend);

      const agentMsg: ChatMessage = {
        id: `msg-${Date.now()}-a`,
        sender: 'agent',
        text: resp.message,
        timestamp: new Date().toLocaleTimeString()
      };

      setSessions(prev => updateSessionById(prev, sessionId, session => ({
        ...session,
        currentResponse: resp,
        messages: [...session.messages, agentMsg],
        updatedAt: Date.now(),
      })));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const errorMessage: ChatMessage = {
        id: `msg-${Date.now()}-err`,
        sender: 'agent',
        text: `Error: ${msg}`,
        timestamp: new Date().toLocaleTimeString(),
      };
      setSessions(prev => updateSessionById(prev, sessionId, session => ({
        ...session,
        messages: [...session.messages, errorMessage],
        updatedAt: Date.now(),
      })));
    } finally {
      setSessions(prev => updateSessionById(prev, sessionId, session => ({ ...session, isBusy: false })));
    }
  };

  const handleApprove = async (requestId: string) => {
    if (isBusy) return;
    const sessionId = activeSessionId;
    const sessionOrchestrator = activeSession!.orchestrator;
    if (!sessionId) return;
    setSessions(prev => updateSessionById(prev, sessionId, session => ({
      ...session,
      isBusy: true,
    })));

    try {
      const resp = await sessionOrchestrator.approve(requestId);
      projectContext?.refreshProject?.();
      onProjectChange?.();

      const agentMsg: ChatMessage = {
        id: `msg-${Date.now()}-app`,
        sender: 'agent',
        text: resp.message,
        timestamp: new Date().toLocaleTimeString()
      };

      setSessions(prev => updateSessionById(prev, sessionId, session => ({
        ...session,
        currentResponse: resp,
        messages: [...session.messages, agentMsg],
        updatedAt: Date.now(),
      })));
      setCanUndo(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSessions(prev => updateSessionById(prev, sessionId, session => ({
        ...session,
        currentResponse: session.currentResponse
          ? {
              ...session.currentResponse,
              pendingApproval: undefined,
              currentApproval: undefined,
              transactionStatus: 'failed',
            }
          : session.currentResponse,
        messages: [
          ...session.messages,
          {
            id: `msg-${Date.now()}-err`,
            sender: 'agent',
            text: `Approval failed: ${msg}`,
            timestamp: new Date().toLocaleTimeString(),
          },
        ],
        updatedAt: Date.now(),
      })));
    } finally {
      setSessions(prev => updateSessionById(prev, sessionId, session => ({
        ...session,
        isBusy: false,
      })));
    }
  };

  const handleCancel = () => {
    const sessionId = activeSessionId;
    const sessionOrchestrator = activeSession!.orchestrator;
    if (sessionOrchestrator.cancelOperation && sessionId) {
      sessionOrchestrator.cancelOperation();
      const cancelMessage: ChatMessage = {
        id: `msg-${Date.now()}-cnl`,
        sender: 'agent',
        text: 'Workflow cancelled by user.',
        timestamp: new Date().toLocaleTimeString(),
      };
      setSessions(prev => updateSessionById(prev, sessionId, session => ({
        ...session,
        isBusy: false,
        messages: [...session.messages, cancelMessage],
        updatedAt: Date.now(),
      })));
    }
  };

  const handleUndo = async () => {
    if (isBusy) return;
    const sessionId = activeSessionId;
    const sessionOrchestrator = activeSession!.orchestrator;
    if (!sessionId) return;
    setSessions(prev => updateSessionById(prev, sessionId, session => ({
      ...session,
      isBusy: true,
    })));
    try {
      if (sessionOrchestrator.undoLastTransaction) {
        const res = await sessionOrchestrator.undoLastTransaction(projectContext?.projectName);
        setCanUndo(false);
        const undoMessage: ChatMessage = {
          id: `msg-${Date.now()}-undo`,
          sender: 'agent',
          text: res.message,
          timestamp: new Date().toLocaleTimeString(),
        };
        setSessions(prev => updateSessionById(prev, sessionId, session => ({
          ...session,
          messages: [...session.messages, undoMessage],
          updatedAt: Date.now(),
        })));
        if (projectContext?.refreshProject) {
          projectContext.refreshProject();
        }
      }
    } finally {
      setSessions(prev => updateSessionById(prev, sessionId, session => ({
        ...session,
        isBusy: false,
      })));
    }
  };

  const handleReject = async (requestId: string) => {
    if (isBusy) return;
    const sessionId = activeSessionId;
    const sessionOrchestrator = activeSession!.orchestrator;
    if (!sessionId) return;
    setSessions(prev => updateSessionById(prev, sessionId, session => ({
      ...session,
      isBusy: true,
    })));

    try {
      const resp = await sessionOrchestrator.reject(requestId, 'Requirement rejected by user');

      const agentMsg: ChatMessage = {
        id: `msg-${Date.now()}-rej`,
        sender: 'agent',
        text: resp.message,
        timestamp: new Date().toLocaleTimeString()
      };

      setSessions(prev => updateSessionById(prev, sessionId, session => ({
        ...session,
        currentResponse: resp,
        messages: [...session.messages, agentMsg],
        updatedAt: Date.now(),
      })));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const errorMessage: ChatMessage = {
        id: `msg-${Date.now()}-err`,
        sender: 'agent',
        text: `Rejection error: ${msg}`,
        timestamp: new Date().toLocaleTimeString(),
      };
      setSessions(prev => updateSessionById(prev, sessionId, session => ({
        ...session,
        messages: [...session.messages, errorMessage],
        updatedAt: Date.now(),
      })));
    } finally {
      setSessions(prev => updateSessionById(prev, sessionId, session => ({
        ...session,
        isBusy: false,
      })));
    }
  };

  const pendingApproval: ExtendedApprovalRequest | undefined =
    currentResponse?.pendingApproval || activeSessionOrchestrator.getPendingApproval?.();
  const taskState = currentResponse?.taskState;
  const catalogBlocks: readonly CatalogBlock[] = AdiaBlockCatalog.list().slice(0, 30);
  const auditList = activeSessionOrchestrator.getAuditHistory();

  // Evaluate approval gating checks
  const isStale = Boolean(
    pendingApproval?.expiresAt && new Date(pendingApproval.expiresAt).getTime() < Date.now()
  );
  const isBlocked = taskState?.status === 'blocked';

  let unknownBlockId: string | null = null;
  if (pendingApproval?.payload?.blockId && typeof pendingApproval.payload.blockId === 'string') {
    if (!AdiaBlockCatalog.isExistingBlockId(pendingApproval.payload.blockId)) {
      unknownBlockId = pendingApproval.payload.blockId;
    }
  }

  const readiness = projectContext?.delegateReadiness || activeSessionOrchestrator.getToolGateway().getDelegateReadiness?.() || {
    xbridges: false,
    sysml: false,
    report: false,
    simulation: false,
  };

  let hasNoAdapter = false;
  let isDelegateMissing = false;
  let missingDelegateReason = '';
  if (pendingApproval?.type === 'change' && pendingApproval.payload?.actionType) {
    const actionKind = pendingApproval.payload.actionType as any;
    const adapter = activeSessionOrchestrator.getToolGateway().getAdapter(actionKind);
    if (!adapter) {
      hasNoAdapter = true;
      isDelegateMissing = true;
      missingDelegateReason = `No adapter registered for action '${actionKind}'`;
    } else if (typeof (adapter as any).isAvailable === 'function' && !(adapter as any).isAvailable()) {
      isDelegateMissing = true;
      missingDelegateReason = `Delegate for '${actionKind}' is unavailable in current workspace`;
    }
  }

  const isApprovalDisabled = isBusy || isStale || isBlocked || Boolean(unknownBlockId) || hasNoAdapter || isDelegateMissing;

  return (
    <>
      {!isOpen && (
        <button
          className="adia-agent-toggle-tab"
          onClick={handleToggle}
          title="Open ADIA Engineering Agent"
        >
          <span className="adia-agent-toggle-label">ADIA Agent</span>
          <span style={{ fontSize: '10px', color: '#10b981' }}>●</span>
        </button>
      )}

      <div className={`adia-agent-panel-container ${isOpen ? 'open' : 'closed'}`}>
        <div className="adia-agent-header">
          <div>
            <div className="adia-agent-title">
              <span>ADIA Engineering Agent</span>
              {connectionStatus === 'connected' && (
                <span className="adia-agent-badge-connected" style={{ backgroundColor: '#059669', color: '#fff', fontSize: '11px', padding: '2px 6px', borderRadius: '4px' }}>
                  Ollama connected
                </span>
              )}
              {connectionStatus === 'unavailable' && (
                <span className="adia-agent-badge-unavailable" style={{ backgroundColor: '#dc2626', color: '#fff', fontSize: '11px', padding: '2px 6px', borderRadius: '4px' }}>
                  Ollama unavailable
                </span>
              )}
              {connectionStatus === 'unselected' && (
                <span className="adia-agent-badge-warning" style={{ backgroundColor: '#d97706', color: '#fff', fontSize: '11px', padding: '2px 6px', borderRadius: '4px' }}>
                  Select Ollama Model
                </span>
              )}
              <span className="adia-agent-badge-mode" style={{ marginLeft: '6px', fontSize: '11px', color: '#94a3b8' }}>
                Deterministic inspection-only mode
              </span>
            </div>
            <div className="adia-agent-meta">
              Project: {projectContext?.projectName || 'Main Project'} | Workspace: {projectContext?.activeWorkspace || 'vlab'} | Blocks: {projectContext?.blocksCount ?? 0} | Nodes: {projectContext?.nodesCount ?? 0} | Connections: {projectContext?.connectionsCount ?? 0} | {modelStatus}
            </div>
            <div className="adia-agent-delegates-bar" style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '11px' }}>
              <span className="delegate-status-xbridges" style={{ color: readiness.xbridges ? '#10b981' : '#64748b' }}>
                X-BRIDGES: {readiness.xbridges ? '● Ready' : '○ Unavailable'}
              </span>
              <span className="delegate-status-sysml" style={{ color: readiness.sysml ? '#10b981' : '#64748b' }}>
                SysML: {readiness.sysml ? '● Ready' : '○ Unavailable'}
              </span>
              <span className="delegate-status-report" style={{ color: readiness.report ? '#10b981' : '#64748b' }}>
                Reporting: {readiness.report ? '● Ready' : '○ Unavailable'}
              </span>
              <span className="delegate-status-simulation" style={{ color: readiness.simulation ? '#10b981' : '#64748b' }}>
                Simulation: {readiness.simulation ? '● Ready' : '○ Unavailable'}
              </span>
            </div>
            <div className="adia-agent-ollama-bar" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', fontSize: '12px' }}>
              <label htmlFor="adia-ollama-model-select" style={{ color: '#94a3b8' }}>Model:</label>
              <select
                id="adia-ollama-model-select"
                aria-label="Select Ollama Model"
                value={selectedModel}
                onChange={handleModelChange}
                style={{
                  background: '#1e293b',
                  color: '#e2e8f0',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  fontSize: '11px'
                }}
              >
                {availableModels.length === 0 ? (
                  <option value="">No models detected</option>
                ) : (
                  <>
                    <option value="">-- Choose installed model --</option>
                    {availableModels.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </>
                )}
              </select>
              <button
                type="button"
                className="adia-agent-test-btn"
                onClick={handleTestConnection}
                disabled={isTesting}
                style={{
                  background: '#334155',
                  color: '#f8fafc',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '2px 8px',
                  fontSize: '11px',
                  cursor: isTesting ? 'wait' : 'pointer'
                }}
                title="Test Ollama connection"
              >
                {isTesting ? 'Testing...' : 'Test Ollama connection'}
              </button>
            </div>
          </div>
          <button className="adia-agent-close-btn" onClick={handleToggle} title="Close Panel">
            ✕
          </button>
        </div>

        <div className="adia-agent-tabs">
          <button
            className={`adia-agent-tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            Workflow & Chat
          </button>
          <button
            className={`adia-agent-tab-btn ${activeTab === 'spec' ? 'active' : ''}`}
            onClick={() => setActiveTab('spec')}
          >
            Specification
          </button>
          <button
            className={`adia-agent-tab-btn ${activeTab === 'blocks' ? 'active' : ''}`}
            onClick={() => setActiveTab('blocks')}
          >
            ADIA Blocks
          </button>
          <button
            className={`adia-agent-tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
            onClick={() => setActiveTab('audit')}
          >
            Audit Trail
          </button>
        </div>

        <div className="adia-agent-body">
          {activeTab === 'chat' && (
            <>
              {taskState?.status === 'blocked' && (
                <div className="adia-agent-status-banner blocked">
                  Status: BLOCKED — Review required
                </div>
              )}
              {taskState?.status === 'completed' && (
                <div className="adia-agent-status-banner completed">
                  Status: COMPLETED — Verified against criteria
                </div>
              )}

              {messages.length === 0 && (
                <div style={{ color: '#64748b', fontSize: '12px', textAlign: 'center', marginTop: 40 }}>
                  Enter an engineering request to start the workflow. The agent will clarify requirements, draft
                  specifications, and request your approval before making any changes.
                </div>
              )}

              {messages.map(m => (
                <div key={m.id} className={`adia-agent-msg ${m.sender}`}>
                  <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '2px' }}>
                    {m.sender === 'user' ? 'You' : 'ADIA Agent'} • {m.timestamp}
                  </div>
                  <div>{m.text}</div>
                </div>
              ))}

              {/* Question Card */}
              {currentResponse?.status === 'clarifying' && (
                <div className="adia-agent-question-card">
                  <div className="adia-agent-question-title">❓ Requirement Clarification</div>
                  <div className="adia-agent-question-text">{currentResponse.message}</div>
                </div>
              )}

              {/* Confirmed Requirements Card */}
              {Boolean(currentResponse?.specification?.requirements?.length) && (
                <div className="adia-agent-requirements-card">
                  <div className="adia-agent-requirements-title">✅ Confirmed Requirements</div>
                  <ul className="adia-agent-requirements-list">
                    {currentResponse!.specification!.requirements.map((req: any) => (
                      <li key={req.id}>
                        <strong>{req.description}:</strong> {String(req.value)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Assumptions Card */}
              {Boolean((currentResponse?.specification?.assumptions?.length || (currentResponse?.executionPlan as any)?.assumptions?.length)) && (
                <div className="adia-agent-assumptions-card">
                  <div className="adia-agent-assumptions-title">📋 Engineering Assumptions</div>
                  <ul className="adia-agent-assumptions-list">
                    {((currentResponse?.specification?.assumptions || (currentResponse?.executionPlan as any)?.assumptions || []) as any[]).map((asm: any, idx: number) => (
                      <li key={idx}>
                        {typeof asm === 'object' && asm !== null
                          ? `${asm.key}: ${asm.value} (${asm.description || asm.rationale || ''})`
                          : String(asm)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Plan Preview */}
              {Boolean(currentResponse?.executionPlan || pendingApproval?.type === 'plan') && (
                <div className="adia-agent-plan-preview-card">
                  <div className="adia-agent-plan-preview-header">
                    <span className="adia-agent-plan-preview-title">📐 Plan Preview</span>
                    <span className="adia-agent-plan-revision-badge">
                      Rev: {activeSessionOrchestrator.getProjectContext().revision}
                    </span>
                  </div>
                  <div className="adia-agent-plan-preview-body">
                    <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px' }}>
                      Actions ({currentResponse?.executionPlan?.actions?.length || 0} scheduled):
                    </div>
                    <div className="adia-agent-plan-action-list">
                      {(currentResponse?.executionPlan?.actions || []).map((act: any) => (
                        <div key={act.id} className="adia-agent-plan-action-item">
                          <span className="action-kind-tag">[{act.kind || act.actionType || act.type}]</span> {act.title}
                          {act.params?.sourceNodeId && (
                            <div className="adia-plan-port-detail" style={{ fontSize: '10px', color: '#38bdf8', marginLeft: '12px' }}>
                              Port: {act.params.sourceNodeId}:{act.params.sourcePortId} → {act.params.targetNodeId}:{act.params.targetPortId}
                            </div>
                          )}
                          {act.blockId && (
                            <div className="adia-plan-block-detail" style={{ fontSize: '10px', color: '#a78bfa', marginLeft: '12px' }}>
                              Block: {act.blockId} ({act.params?.blockType || act.blockId})
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Isolated Plan Proof Card */}
              {Boolean(currentResponse?.proof) && (
                <div className="adia-agent-proof-card" style={{ background: '#0f172a', border: '1px solid #0284c7', borderRadius: '4px', padding: '8px', margin: '8px 0' }}>
                  <div style={{ fontWeight: 600, color: '#38bdf8', marginBottom: '4px' }}>
                    🔬 Isolated Plan Proof ({currentResponse!.proof!.status.toUpperCase()})
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                    Engine Run ID: <span style={{ color: '#38bdf8' }}>{currentResponse!.proof!.engineRunId || 'none'}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                    Catalog Fingerprint: <span style={{ color: '#a78bfa' }}>{currentResponse!.proof!.catalogHash || 'canonical'}</span>
                  </div>
                  {Boolean(currentResponse!.proof!.observables && Object.keys(currentResponse!.proof!.observables).length > 0) && (
                    <div style={{ marginTop: '4px', fontSize: '11px' }}>
                      <div style={{ color: '#94a3b8' }}>Observables:</div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '2px' }}>
                        {Object.entries(currentResponse!.proof!.observables).map(([k, v]) => (
                          <span key={k} style={{ background: '#1e293b', padding: '2px 6px', borderRadius: '3px', color: '#34d399', fontSize: '10px' }}>
                            {k}: {String(v)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Transaction Status Card */}
              {Boolean(currentResponse?.transactionStatus && currentResponse.transactionStatus !== 'idle') && (
                <div className="adia-agent-transaction-card" style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '4px', padding: '8px', margin: '8px 0' }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                    Transaction Status: <span style={{ color: '#38bdf8', fontWeight: 600 }}>{currentResponse!.transactionStatus}</span>
                  </div>
                  {Boolean(currentResponse?.observedDeltas) && (
                    <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>
                      Observed Deltas: {JSON.stringify(currentResponse!.observedDeltas)}
                    </div>
                  )}
                </div>
              )}

              {/* Preflight Diagnostics Panel */}
              {Boolean((currentResponse?.preflightResult as any)?.diagnostics?.length) && (
                <div className="adia-agent-preflight-card">
                  <div className="adia-agent-preflight-header" style={{ fontWeight: 600, color: '#f59e0b', marginBottom: '6px' }}>
                    🔍 Preflight Diagnostics ({((currentResponse!.preflightResult as any)!.diagnostics!.length)})
                  </div>
                  <div className="adia-agent-preflight-list">
                    {(currentResponse!.preflightResult as any)!.diagnostics!.map((diag: any, i: number) => (
                      <div key={i} className={`diag-item severity-${(diag.severity || 'info').toLowerCase()}`}>
                        <span className="diag-badge">[{diag.code || diag.category || 'PREFLIGHT'}]</span>
                        <span className="diag-msg">{diag.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Validation Diagnostics Panel */}
              {Boolean((currentResponse?.validationResult as any)?.diagnostics?.length) && (
                <div className="adia-agent-diagnostics-card">
                  <div className="adia-agent-diagnostics-header">
                    🔍 Diagnostics ({(currentResponse!.validationResult as any)!.diagnostics!.length})
                  </div>
                  <div className="adia-agent-diagnostics-list">
                    {(currentResponse!.validationResult as any)!.diagnostics!.map((diag: any, i: number) => (
                      <div key={i} className={`diag-item severity-${(diag.severity || 'info').toLowerCase()}`}>
                        <span className="diag-badge">{diag.category || 'DIAGNOSTIC'}</span>
                        <span className="diag-msg">{diag.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Execution Result Card */}
              {currentResponse?.status === 'completed' && (
                <div className="adia-agent-execution-result success" style={{ background: '#064e3b', border: '1px solid #059669', padding: '8px', borderRadius: '4px', margin: '8px 0' }}>
                  <div style={{ fontWeight: 600, color: '#34d399' }}>🎉 Execution Completed</div>
                  <div style={{ fontSize: '12px', color: '#e2e8f0', marginTop: '4px' }}>{currentResponse.message}</div>
                  {currentResponse.simulationResult && (
                    <div className="adia-agent-simulation-result" style={{ fontSize: '12px', marginTop: '6px' }}>
                      Simulation: {currentResponse.simulationResult.status}; run: {currentResponse.simulationResult.engineRunId || 'none'}.
                      {' '}THD {typeof currentResponse.simulationResult.metrics?.thd === 'number'
                        ? `${currentResponse.simulationResult.metrics.thd}` : 'not measured'}.
                    </div>
                  )}
                </div>
              )}
              {currentResponse?.status === 'failed' && (
                <div className="adia-agent-execution-result failure" style={{ background: '#450a0a', border: '1px solid #dc2626', padding: '8px', borderRadius: '4px', margin: '8px 0' }}>
                  <div style={{ fontWeight: 600, color: '#f87171' }}>❌ Execution Failed</div>
                  <div style={{ fontSize: '12px', color: '#e2e8f0', marginTop: '4px' }}>{currentResponse.message}</div>
                </div>
              )}

              {/* Pending Approval Card */}
              {pendingApproval && pendingApproval.status === 'pending' && (
                <div className="adia-agent-approval-card">
                  <div className="adia-agent-approval-title">
                    ⚠️ Approval Required: {pendingApproval.title}
                  </div>
                  <div className="adia-agent-approval-desc">{pendingApproval.description}</div>

                  {pendingApproval.type === 'change' && (
                    <div className="adia-agent-approval-details" style={{ marginTop: '8px', fontSize: '11px', background: '#0f172a', padding: '8px', borderRadius: '4px' }}>
                      {Boolean(pendingApproval.payload?.affectedArtifacts && Array.isArray(pendingApproval.payload.affectedArtifacts)) && (
                        <div style={{ marginBottom: '4px' }}>
                          <span style={{ color: '#94a3b8' }}>Affected Artifacts: </span>
                          <span style={{ color: '#38bdf8' }}>{((pendingApproval.payload?.affectedArtifacts as unknown[]) || []).map(String).join(', ')}</span>
                        </div>
                      )}
                      {Boolean(pendingApproval.payload?.params) && (
                        <div>
                          <span style={{ color: '#94a3b8' }}>Action Parameters: </span>
                          <pre style={{ margin: '4px 0 0 0', background: '#020617', padding: '4px 6px', borderRadius: '3px', color: '#a5f3fc', overflowX: 'auto', fontSize: '10px' }}>
                            {JSON.stringify(pendingApproval.payload?.params, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}

                  {isStale && (
                    <div style={{ color: '#f87171', fontSize: '11px', marginTop: '6px' }}>
                      ⚠️ Approval request has expired.
                    </div>
                  )}
                  {isBlocked && (
                    <div style={{ color: '#f87171', fontSize: '11px', marginTop: '6px' }}>
                      ⛔ Workflow is blocked. Resolve issues before approving.
                    </div>
                  )}
                  {unknownBlockId && (
                    <div style={{ color: '#f87171', fontSize: '11px', marginTop: '6px' }}>
                      ⛔ Blocked: block '{unknownBlockId}' is absent from ADIA catalog. Creating new blocks is forbidden.
                    </div>
                  )}
                  {hasNoAdapter && (
                    <div style={{ color: '#f87171', fontSize: '11px', marginTop: '6px' }}>
                      ⛔ Blocked: no real tool adapter registered for action kind '{String(pendingApproval.payload?.actionType)}'.
                    </div>
                  )}
                  {isDelegateMissing && !hasNoAdapter && (
                    <div className="adia-agent-delegate-missing-error" style={{ color: '#f87171', fontSize: '11px', marginTop: '6px' }}>
                      ⛔ Blocked: {missingDelegateReason}.
                    </div>
                  )}

                  <div className="adia-agent-btn-row" style={{ marginTop: '10px' }}>
                    <button
                      className="adia-agent-btn-approve"
                      onClick={() => handleApprove(pendingApproval.id)}
                      disabled={isApprovalDisabled}
                    >
                      {pendingApproval.type === 'specification'
                        ? 'Approve Specification'
                        : pendingApproval.type === 'plan'
                        ? 'Approve Execution Plan'
                        : 'Approve Change'}
                    </button>
                    <button
                      className="adia-agent-btn-reject"
                      onClick={() => handleReject(pendingApproval.id)}
                      disabled={isBusy}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              )}

              <div ref={chatBottomRef} />
            </>
          )}

          {activeTab === 'spec' && (
            <div style={{ fontSize: '12px', color: '#cbd5e1' }}>
              {currentResponse?.specification ? (
                <div>
                  <h4 style={{ color: '#38bdf8', marginBottom: 8 }}>
                    {currentResponse.specification.title}
                  </h4>
                  <p>Target System: {currentResponse.specification.targetSystem}</p>
                  <p>
                    Approved Status:{' '}
                    {currentResponse.specification.approved ? '✅ Approved' : '⏳ Pending Approval'}
                  </p>
                  <h5 style={{ marginTop: 12, color: '#94a3b8' }}>Requirements:</h5>
                  <ul>
                    {currentResponse.specification.requirements.map(r => (
                      <li key={r.id}>
                        <b>{r.id}</b> ({r.category}): {r.description} = {String(r.value)}
                      </li>
                    ))}
                  </ul>
                  <h5 style={{ marginTop: 12, color: '#94a3b8' }}>Safety Limits:</h5>
                  <ul>
                    {currentResponse.specification.safetyLimits.map((s, idx) => (
                      <li key={idx}>{s}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div>No formal specification generated yet. Complete clarification questions first.</div>
              )}
            </div>
          )}

          {activeTab === 'blocks' && (
            <div style={{ fontSize: '11px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ color: '#94a3b8', marginBottom: 4 }}>
                Existing Catalog Blocks ({AdiaBlockCatalog.getBlockCount()} indexed):
              </div>
              {catalogBlocks.map(b => (
                <div
                  key={b.id}
                  style={{
                    padding: '6px 8px',
                    background: '#1a1e28',
                    borderRadius: 4,
                    borderLeft: '2px solid #38bdf8'
                  }}
                >
                  <div style={{ fontWeight: 600, color: '#f8fafc' }}>
                    {b.name} <span style={{ color: '#64748b' }}>({b.id})</span>
                  </div>
                  <div style={{ color: '#94a3b8' }}>Domain: {b.domain}</div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'audit' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                Immutable Audit Trail ({auditList.length} events):
              </div>
              {auditList.map(a => (
                <div key={a.id} className="adia-agent-audit-item">
                  <div style={{ fontWeight: 600, color: '#38bdf8' }}>
                    [{a.eventType}] by {a.actor}
                  </div>
                  <div style={{ color: '#64748b' }}>{a.timestamp}</div>
                  <div style={{ color: '#cbd5e1' }}>{JSON.stringify(a.details)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="adia-agent-input-container">
          <input
            type="text"
            className="adia-agent-input"
            placeholder={
              pendingApproval
                ? 'Respond to approval gate above...'
                : 'Ask or describe engineering task...'
            }
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            disabled={isBusy}
          />
          {isBusy && (
            <button
              type="button"
              className="adia-agent-btn-stop"
              onClick={handleCancel}
              title="Stop in-flight operation"
            >
              Stop
            </button>
          )}
          {canUndo && (
            <button
              type="button"
              className="adia-agent-btn-undo"
              onClick={handleUndo}
              disabled={isBusy}
              title="Undo last committed engineering transaction"
            >
              ↶ Undo
            </button>
          )}
          <button
            className="adia-agent-send-btn"
            onClick={handleSend}
            disabled={isBusy || !inputText.trim()}
          >
            Send
          </button>
        </div>
      </div>
    </>
  );
};

