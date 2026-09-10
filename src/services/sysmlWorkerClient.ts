import type { SysmlRepository } from '../engine/sysml/model';
import type { NormalizedSysmlStore } from '../engine/sysml/normalizedStore';
import type { SysmlValidationReport } from '../engine/sysml/validation';
import type { LegacySysmlView } from './sysmlCommandGateway';
import {
  type WorkerRequest,
  type WorkerResponse,
  type WorkerTaskType,
  type CompactProjectDelta,
  type CompactImpactDelta,
  WORKER_FAST_PATH_THRESHOLD,
  shouldRunInWorker,
} from '../engine/sysml/workerProtocol';
import { handleWorkerMessage } from '../engine/sysml/sysmlWorker';

interface PendingRequest<T> {
  requestId: string;
  revision: number;
  taskType: WorkerTaskType;
  resolve: (value: T) => void;
  reject: (reason: any) => void;
  timestamp: number;
}

export class SysmlWorkerClient {
  private worker: Worker | null = null;
  private pendingRequests = new Map<string, PendingRequest<any>>();
  private latestRevisionByType = new Map<WorkerTaskType, number>();
  private activeRequestByType = new Map<WorkerTaskType, string>();
  private requestCounter = 0;

  constructor(workerFactory?: () => Worker) {
    if (typeof Worker !== 'undefined' && workerFactory) {
      try {
        this.worker = workerFactory();
        this.worker.onmessage = this.handleWorkerResponse.bind(this);
        this.worker.onerror = this.handleWorkerError.bind(this);
      } catch {
        this.worker = null;
      }
    }
  }

  private nextRequestId(): string {
    return `req_${++this.requestCounter}_${Date.now()}`;
  }

  private handleWorkerResponse(event: MessageEvent<WorkerResponse>): void {
    const response = event.data;
    const pending = this.pendingRequests.get(response.requestId);
    if (!pending) return;

    this.pendingRequests.delete(response.requestId);

    // Stale result rejection: if a newer revision has arrived for this task type, discard
    const latestRev = this.latestRevisionByType.get(pending.taskType) ?? 0;
    if (response.revision < latestRev) {
      pending.reject(new Error(`Stale result rejected: revision ${response.revision} < latest ${latestRev}`));
      return;
    }

    if (response.success) {
      pending.resolve(response.result);
    } else {
      pending.reject(new Error(response.error || 'Worker request failed'));
    }
  }

  private handleWorkerError(error: ErrorEvent): void {
    for (const [id, pending] of this.pendingRequests.entries()) {
      pending.reject(new Error(`Worker encountered an unhandled error: ${error.message}`));
      this.pendingRequests.delete(id);
    }
  }

  private countEntities(payload: SysmlRepository | NormalizedSysmlStore): number {
    if ('indexes' in payload && payload.definitions instanceof Map) {
      return payload.indexes.byId.size;
    }
    const repo = payload as SysmlRepository;
    return (
      Object.keys(repo.definitions ?? {}).length +
      Object.keys(repo.usages ?? {}).length +
      Object.keys(repo.relationships ?? {}).length +
      Object.keys(repo.requirements ?? {}).length
    );
  }

  public async execute<T>(
    taskType: WorkerTaskType,
    revision: number,
    createRequest: (requestId: string) => WorkerRequest,
    entityCount?: number
  ): Promise<T> {
    const previousReqId = this.activeRequestByType.get(taskType);
    if (previousReqId && this.pendingRequests.has(previousReqId)) {
      this.cancel(previousReqId);
    }

    const requestId = this.nextRequestId();
    this.latestRevisionByType.set(taskType, revision);
    this.activeRequestByType.set(taskType, requestId);

    const request = createRequest(requestId);

    // Fast path: if payload is small or no WebWorker instance available, compute synchronously
    const count = entityCount ?? ('payload' in request ? this.countEntities((request as any).payload) : 0);
    if (!this.worker || !shouldRunInWorker(count)) {
      const response = handleWorkerMessage(request);
      if (response.success) {
        return response.result as T;
      }
      throw new Error(response.error || 'Execution failed');
    }

    // Off-thread path via WebWorker
    return new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(requestId, {
        requestId,
        revision,
        taskType,
        resolve,
        reject,
        timestamp: Date.now(),
      });

      this.worker!.postMessage(request);
    });
  }

  public async validate(
    payload: SysmlRepository | NormalizedSysmlStore,
    revision: number
  ): Promise<SysmlValidationReport> {
    return this.execute<SysmlValidationReport>('validate', revision, requestId => ({
      requestId,
      revision,
      taskType: 'validate',
      payload,
    }));
  }

  public async project(
    payload: SysmlRepository | NormalizedSysmlStore,
    revision: number,
    diagramId?: string
  ): Promise<{ view: LegacySysmlView; delta: CompactProjectDelta }> {
    return this.execute<{ view: LegacySysmlView; delta: CompactProjectDelta }>('project', revision, requestId => ({
      requestId,
      revision,
      taskType: 'project',
      diagramId,
      payload,
    }));
  }

  public async analyzeImpact(
    payload: SysmlRepository | NormalizedSysmlStore,
    revision: number,
    targetElementIds: string[]
  ): Promise<CompactImpactDelta> {
    return this.execute<CompactImpactDelta>('impact', revision, requestId => ({
      requestId,
      revision,
      taskType: 'impact',
      targetElementIds,
      payload,
    }));
  }

  public async serialize(
    payload: SysmlRepository | NormalizedSysmlStore,
    revision: number
  ): Promise<string> {
    return this.execute<string>('serialize', revision, requestId => ({
      requestId,
      revision,
      taskType: 'serialize',
      payload,
    }));
  }

  public cancel(requestId: string): void {
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      pending.reject(new Error('Request cancelled by client'));
      this.pendingRequests.delete(requestId);
    }

    if (this.worker) {
      this.worker.postMessage({ taskType: 'cancel', requestId });
    }
  }

  public getPendingCount(): number {
    return this.pendingRequests.size;
  }

  public terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    for (const pending of this.pendingRequests.values()) {
      pending.reject(new Error('SysmlWorkerClient terminated'));
    }
    this.pendingRequests.clear();
  }
}
