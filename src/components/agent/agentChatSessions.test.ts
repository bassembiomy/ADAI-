import { describe, expect, it } from 'vitest';
import { AgentOrchestrator } from '../../agent/agentOrchestrator';
import {
  createAgentChatSession,
  deriveChatTitle,
  updateSessionById,
} from './agentChatSessions';

describe('agent chat sessions', () => {
  it('creates an empty session with deterministic initial state', () => {
    const orchestrator = new AgentOrchestrator();
    const session = createAgentChatSession(orchestrator, 1234);

    expect(session).toMatchObject({
      title: 'New Chat',
      createdAt: 1234,
      updatedAt: 1234,
      messages: [],
      currentResponse: null,
      isBusy: false,
      orchestrator,
    });
    expect(session.id).toEqual(expect.any(String));
  });

  it('normalizes and limits titles while preserving deterministic text', () => {
    expect(deriveChatTitle('  Build\n\n an   air-fryer model  ')).toBe('Build an air-fryer model');
    expect(deriveChatTitle('abcdefgh', 5)).toBe('abcde…');
    expect(deriveChatTitle('   ')).toBe('New Chat');
    expect(deriveChatTitle('<script>alert(1)</script>')).not.toContain('<script>');
  });

  it('updates only the matching session immutably', () => {
    const first = createAgentChatSession(new AgentOrchestrator(), 1);
    const second = createAgentChatSession(new AgentOrchestrator(), 2);
    const sessions = [first, second];
    const updated = updateSessionById(sessions, second.id, session => ({
      ...session,
      title: 'Updated',
      updatedAt: 3,
    }));

    expect(updated).not.toBe(sessions);
    expect(updated[0]).toBe(first);
    expect(updated[1]).not.toBe(second);
    expect(updated[1]).toMatchObject({ title: 'Updated', updatedAt: 3 });
  });
});
