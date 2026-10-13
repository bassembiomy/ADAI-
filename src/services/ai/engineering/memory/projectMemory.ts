import {
  ProjectDecisionRecord,
  ProjectMemorySnapshot
} from '../contracts/memory';

export class ProjectMemoryManager {
  private readonly projects = new Map<string, ProjectMemorySnapshot>();

  public getOrCreate(projectId: string, projectName = ''): ProjectMemorySnapshot {
    let proj = this.projects.get(projectId);
    if (!proj) {
      proj = {
        projectId,
        projectName: projectName || projectId,
        decisions: [],
        assumptions: [],
        resolvedSlots: {},
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      this.projects.set(projectId, proj);
    }
    return proj;
  }

  public recordDecision(
    projectId: string,
    decision: {
      decisionKey: string;
      title: string;
      value: unknown;
      rationale: string;
      approvedBy: string;
      supersedes?: string;
      provenance: {
        source: 'user_approval' | 'spec_engine' | 'agent_proposal';
        sourceId?: string;
      };
    }
  ): ProjectDecisionRecord {
    const proj = this.getOrCreate(projectId);
    const now = Date.now();

    // If superseding, find and update old decision
    if (decision.supersedes) {
      const old = proj.decisions.find(d => d.id === decision.supersedes);
      if (old) {
        old.status = 'superseded';
        old.supersededAt = now;
      }
    } else {
      // If another decision with same decisionKey is active, supersede it automatically
      const existingActive = proj.decisions.find(
        d => d.decisionKey === decision.decisionKey && d.status === 'active'
      );
      if (existingActive) {
        existingActive.status = 'superseded';
        existingActive.supersededAt = now;
      }
    }

    const record: ProjectDecisionRecord = {
      ...decision,
      id: `dec_${projectId}_${Date.now()}_${proj.decisions.length + 1}`,
      projectId,
      approvedAt: now,
      status: 'active'
    };

    proj.decisions.push(record);
    proj.updatedAt = now;
    return record;
  }

  public listActiveDecisions(projectId: string): ProjectDecisionRecord[] {
    const proj = this.projects.get(projectId);
    if (!proj) return [];
    return proj.decisions.filter(d => d.status === 'active');
  }

  public getDecisionHistory(projectId: string, decisionKey: string): ProjectDecisionRecord[] {
    const proj = this.projects.get(projectId);
    if (!proj) return [];
    return proj.decisions.filter(d => d.decisionKey === decisionKey);
  }

  public resolveSlot(projectId: string, slotName: string, value: unknown): void {
    const proj = this.getOrCreate(projectId);
    proj.resolvedSlots[slotName] = value;
    proj.updatedAt = Date.now();
  }

  public recordAssumption(projectId: string, assumption: { id: string; statement: string; source: string }): void {
    const proj = this.getOrCreate(projectId);
    proj.assumptions.push(assumption);
    proj.updatedAt = Date.now();
  }
}
