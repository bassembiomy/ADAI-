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
  SYSML_WORKER_PROTOCOL_VERSION,
  WORKER_FAST_PATH_THRESHOLD,
  shouldRunInWorker,
} from '../engine/sysml/workerProtocol';
import { handleWorkerMessage } from '../engine/sysml/sysmlWorker';
import { createSysmlWorker, isWorkerSupported } from './sysmlWorkerFactory';
import { toWorkerSnapshot } from '../engine/sysml/normalizedStore';

function toWorkerSafePayload(payload: any, diagramId?: string): any {
  if (payload && typeof payload === 'object' && 'indexes' in payload && payload.definitions instanceof Map) {
    return toWorkerSnapshot(payload, diagramId, Boolean(diagramId));
  }
  return payload;
}

export interface SysmlWorkerDiagnostics {
  workerAvailable: boolean;
  isMainThreadFallback: boolean;
  lastWorkerError: string | null;
  fallbackReason: string | null;
  pendingCount: number;
  staleCount: number;
  lastTaskDurationMs: number | null;
}

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
  private lastWorkerError: string | null = null;
  private fallbackReason: string | null = null;
  private staleCount = 0;
  private lastTaskDurationMs: number | null = null;
  private isMainThreadFallback = false;

  constructor(workerFactory?: (() => Worker) | null) {
    if (workerFactory === null) {
      this.worker = null;
      this.fallbackReason = 'Worker explicitly disabled by configuration';
      return;
    }

    const factory = workerFactory ?? (isWorkerSupported() ? createSysmlWorker : null);
    if (factory) {
      try {
        this.worker = factory();
        this.worker.onmessage = this.handleWorkerResponse.bind(this);
        this.worker.onerror = this.handleWorkerError.bind(this);
      } catch (err: any) {
        this.worker = null;
        this.lastWorkerError = err?.message || 'Failed to instantiate Web Worker';
        this.fallbackReason = `Worker instantiation failed: ${this.lastWorkerError}`;
      }
    } else {
      this.fallbackReason = 'Web Workers are not supported in this runtime environment';
    }
  }

  public getDiagnostics(): SysmlWorkerDiagnostics {
    return {
      workerAvailable: this.worker !== null,
      isMainThreadFallback: this.isMainThreadFallback,
      lastWorkerError: this.lastWorkerError,
      fallbackReason: this.fallbackReason,
      pendingCount: this.pendingRequests.size,
      staleCount: this.staleCount,
      lastTaskDurationMs: this.lastTaskDurationMs,
    };
  }

  private nextRequestId(): string {
    return `req_${++this.requestCounter}_${Date.now()}`;
  }

  private handleWorkerResponse(event: MessageEvent<WorkerResponse>): void {
    const response = event.data;
    const pending = this.pendingRequests.get(response.requestId);
    if (!pending) return;

    this.pendingRequests.delete(response.requestId);
    const duration = Date.now() - pending.timestamp;
    this.lastTaskDurationMs = duration;

    // Stale result rejection: if a newer revision has arrived for this task type, discard
    const latestRev = this.latestRevisionByType.get(pending.taskType) ?? 0;
    if (response.revision < latestRev) {
      this.staleCount++;
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
    const errorMsg = error?.message || 'Worker runtime failure';
    this.lastWorkerError = errorMsg;
    for (const [id, pending] of this.pendingRequests.entries()) {
      pending.reject(new Error(`Worker encountered an unhandled error: ${errorMsg}`));
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
    entityCount?: number,
    requestIdOverride?: string,
  ): Promise<T> {
    const previousReqId = this.activeRequestByType.get(taskType);
    if (previousReqId && this.pendingRequests.has(previousReqId)) {
      this.cancel(previousReqId);
    }

    const requestId = requestIdOverride ?? this.nextRequestId();
    this.latestRevisionByType.set(taskType, revision);
    this.activeRequestByType.set(taskType, requestId);

    const request = createRequest(requestId);

    // Fast path: if payload is small or no WebWorker instance available, compute synchronously
    const count = entityCount ?? ('payload' in request ? this.countEntities((request as any).payload) : 0);
    if (!this.worker || !shouldRunInWorker(count)) {
      if (!this.worker && shouldRunInWorker(count)) {
        this.isMainThreadFallback = true;
        this.fallbackReason = this.fallbackReason || 'Worker unavailable: falling back to main-thread processing for large model';
      }
      const t0 = performance.now();
      const response = handleWorkerMessage(request);
      this.lastTaskDurationMs = performance.now() - t0;
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

      const workerSafeRequest = { ...request };
      if ('payload' in workerSafeRequest) {
        (workerSafeRequest as any).payload = toWorkerSafePayload(
          (workerSafeRequest as any).payload,
          (workerSafeRequest as any).diagramId
        );
      }

      this.worker!.postMessage(workerSafeRequest);
    });
  }

  public scheduleValidation(
    payload: SysmlRepository | NormalizedSysmlStore,
    revision: number,
    onResult: (report: SysmlValidationReport) => void,
    onError?: (err: any) => void
  ): () => void {
    let cancelled = false;
    const reqId = this.nextRequestId();

    this.validate(payload, revision, reqId)
      .then(report => {
        if (!cancelled) {
          onResult(report);
        }
      })
      .catch(err => {
        if (!cancelled && onError) {
          onError(err);
        }
      });

    return () => {
      cancelled = true;
      this.cancel(reqId);
    };
  }

  public async validate(
    payload: SysmlRepository | NormalizedSysmlStore,
    revision: number,
    requestIdOverride?: string,
  ): Promise<SysmlValidationReport> {
    return this.execute<SysmlValidationReport>('validate', revision, requestId => ({
      version: SYSML_WORKER_PROTOCOL_VERSION,
      requestId,
      revision,
      taskType: 'validate',
      payload,
    }), undefined, requestIdOverride);
  }

  public async project(
    payload: SysmlRepository | NormalizedSysmlStore,
    revision: number,
    diagramId?: string
  ): Promise<{ view: LegacySysmlView; delta: CompactProjectDelta }> {
    return this.execute<{ view: LegacySysmlView; delta: CompactProjectDelta }>('project', revision, requestId => ({
      version: SYSML_WORKER_PROTOCOL_VERSION,
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
      version: SYSML_WORKER_PROTOCOL_VERSION,
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
      version: SYSML_WORKER_PROTOCOL_VERSION,
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
      this.worker.postMessage({ version: SYSML_WORKER_PROTOCOL_VERSION, taskType: 'cancel', requestId });
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
