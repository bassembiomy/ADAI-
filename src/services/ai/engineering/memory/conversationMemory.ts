import {
  DialogueTurn,
  ConversationMemorySnapshot
} from '../contracts/memory';
import { ActiveRequestSession } from '../contracts/structuredEngineeringRequest';

export class ConversationMemoryManager {
  private readonly sessions = new Map<string, ConversationMemorySnapshot>();
  private readonly activeRequestSessions = new Map<string, ActiveRequestSession>();

  public createSession(sessionId?: string): ConversationMemorySnapshot {
    const id = sessionId || `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const session: ConversationMemorySnapshot = {
      sessionId: id,
      turns: [],
      activeConceptIds: [],
      lastActiveAt: Date.now()
    };
    this.sessions.set(id, session);
    return session;
  }

  public getSession(sessionId: string): ConversationMemorySnapshot | null {
    return this.sessions.get(sessionId) ?? null;
  }

  public getSnapshot(sessionId: string): ConversationMemorySnapshot | null {
    return this.getSession(sessionId);
  }

  public recordTurn(
    sessionId: string,
    turn: Omit<DialogueTurn, 'id' | 'timestamp'>
  ): DialogueTurn {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = this.createSession(sessionId);
    }

    const recorded: DialogueTurn = {
      ...turn,
      id: `turn_${Date.now()}_${session.turns.length + 1}`,
      timestamp: Date.now()
    };

    session.turns.push(recorded);
    session.lastActiveAt = Date.now();
    return recorded;
  }

  public getTurns(sessionId: string): DialogueTurn[] {
    const session = this.sessions.get(sessionId);
    return session ? [...session.turns] : [];
  }

  public getActiveRequestSession(sessionId: string): ActiveRequestSession | null {
    return this.activeRequestSessions.get(sessionId) ?? null;
  }

  public setActiveRequestSession(sessionId: string, session: ActiveRequestSession): void {
    this.activeRequestSessions.set(sessionId, { ...session });
  }

  public clearActiveRequestSession(sessionId: string): void {
    this.activeRequestSessions.delete(sessionId);
  }

  public clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.activeRequestSessions.delete(sessionId);
  }
}

