import { AgentOrchestrator, OrchestratorResponse } from '../../agent/agentOrchestrator';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  timestamp: string;
}

export interface AgentChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  currentResponse: OrchestratorResponse | null;
  orchestrator: AgentOrchestrator;
  isBusy: boolean;
}

const DEFAULT_TITLE_LENGTH = 48;

export function deriveChatTitle(firstMessage: string, maxLength = DEFAULT_TITLE_LENGTH): string {
  const normalized = firstMessage.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
  if (!normalized) return 'New Chat';
  if (normalized.length <= maxLength) return normalized;
  const limit = Math.max(1, maxLength);
  return `${normalized.slice(0, limit).trimEnd()}…`;
}

export function createAgentChatSession(orchestrator: AgentOrchestrator, now = Date.now()): AgentChatSession {
  return {
    id: `chat-${now}-${Math.random().toString(36).slice(2, 10)}`,
    title: 'New Chat',
    createdAt: now,
    updatedAt: now,
    messages: [],
    currentResponse: null,
    orchestrator,
    isBusy: false,
  };
}

export function updateSessionById(
  sessions: AgentChatSession[],
  id: string,
  updater: (session: AgentChatSession) => AgentChatSession
): AgentChatSession[] {
  return sessions.map(session => session.id === id ? updater(session) : session);
}
