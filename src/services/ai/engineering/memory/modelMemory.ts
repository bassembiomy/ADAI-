import {
  ModelSnapshotRecord,
  ModelMemorySnapshot
} from '../contracts/memory';

export class ModelMemoryManager {
  private readonly models = new Map<string, ModelMemorySnapshot>();

  public getOrCreate(modelId: string, projectId: string): ModelMemorySnapshot {
    let model = this.models.get(modelId);
    if (!model) {
      model = {
        modelId,
        projectId,
        activeRevision: 0,
        revisions: [],
        lastSavedAt: Date.now()
      };
      this.models.set(modelId, model);
    }
    return model;
  }

  public recordSnapshot(snapshot: ModelSnapshotRecord): void {
    const model = this.getOrCreate(snapshot.modelId, snapshot.projectId);
    model.revisions.push(snapshot);
    model.activeRevision = Math.max(model.activeRevision, snapshot.revision);
    model.lastSavedAt = Date.now();
  }

  public getRevision(modelId: string, revision: number): ModelSnapshotRecord | null {
    const model = this.models.get(modelId);
    if (!model) return null;
    return model.revisions.find(r => r.revision === revision) ?? null;
  }

  public getLatest(modelId: string): ModelSnapshotRecord | null {
    const model = this.models.get(modelId);
    if (!model || model.revisions.length === 0) return null;
    return [...model.revisions].sort((a, b) => b.revision - a.revision)[0];
  }
}
