import {
  DialogueTurn,
  ConversationMemorySnapshot
} from '../contracts/memory';

export class ConversationMemoryManager {
  private readonly sessions = new Map<string, ConversationMemorySnapshot>();

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

  public clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
