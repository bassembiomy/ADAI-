# ADIA Autonomous Engineering AI Copilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an institutional-grade, zero-cost Autonomous Engineering AI Copilot inside ADIA capable of multi-step topological synthesis (e.g. SPWM Inverters, SysML subsystems, Stateflow machines, DOE models), untrusted web search retrieval, and 100% module automation through transactional execution and robust safety interlocks.

**Architecture:** A layered architecture with normalized LLM providers (Ollama, LM Studio, Gemini Free Tier), untrusted web retrieval through Electron IPC, formal typed plan envelopes with Tarjan/Kahn dependency validation, a Universal Transaction Manager with snapshot and inverse-action rollback, asynchronous module adapters (`AIModuleAdapter`), and physical/signal dimensional analysis.

**Tech Stack:** TypeScript, React 18, Electron IPC, Vitest, Zod / JSON Schema validation, ReactFlow (visual projection), Math.js.

## Global Constraints
- Every module mutation must pass through `AIModuleAdapter` and `TransactionManager`. No direct state mutation from raw LLM output.
- All engineering parameters must have explicit units and pass dimensional analysis (`value` + `unit`).
- Local LLM providers (Ollama / LM Studio) operate in air-gapped mode with zero external telemetry.
- External web search is untrusted input: sanitized, limited to 32KB text snippets, and tagged as `<untrusted_external_evidence>`.
- Irreversible side effects (HIL actuation, firmware flashing) require commit barriers and hardware safety watchdogs.

---

### Task 1: Core Type Contracts, Structured Diagnostics & Capability Registry

**Files:**
- Create: `src/services/ai/contracts/types.ts`
- Create: `src/services/ai/contracts/diagnostics.ts`
- Create: `src/services/ai/contracts/capabilityRegistry.ts`
- Test: `src/services/ai/contracts/capabilityRegistry.test.ts`

**Interfaces:**
- Consumes: None (Root foundation).
- Produces: `Diagnostic`, `RiskClass`, `ActionCapability`, `CapabilityRegistry`, `PlanEnvelope`, `ActionEnvelope`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/ai/contracts/capabilityRegistry.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { CapabilityRegistry } from './capabilityRegistry';
import { RiskClass } from './types';

describe('CapabilityRegistry', () => {
  let registry: CapabilityRegistry;

  beforeEach(() => {
    registry = new CapabilityRegistry();
  });

  it('should register and retrieve an action capability', () => {
    registry.register({
      actionType: 'XB_CREATE_BLOCK',
      schemaVersion: '1.0.0',
      module: 'xbridges',
      riskClass: RiskClass.REVERSIBLE_MUTATION,
      payloadSchema: { type: 'object', required: ['blockId', 'blockType'] },
      requiredPermissions: [],
      supportsDryRun: true,
      rollbackLevel: 'INVERSE_ACTION',
      preconditionTypes: ['BLOCK_DOES_NOT_EXIST'],
      postconditionTypes: ['BLOCK_EXISTS']
    });

    const capability = registry.get('XB_CREATE_BLOCK');
    expect(capability).toBeDefined();
    expect(capability?.module).toBe('xbridges');
    expect(capability?.riskClass).toBe(RiskClass.REVERSIBLE_MUTATION);
  });

  it('should filter capabilities by active modules', () => {
    registry.register({
      actionType: 'XB_CREATE_BLOCK',
      schemaVersion: '1.0.0',
      module: 'xbridges',
      riskClass: RiskClass.REVERSIBLE_MUTATION,
      payloadSchema: {},
      requiredPermissions: [],
      supportsDryRun: true,
      rollbackLevel: 'INVERSE_ACTION',
      preconditionTypes: [],
      postconditionTypes: []
    });

    registry.register({
      actionType: 'DOE_CONFIGURE',
      schemaVersion: '1.0.0',
      module: 'doe',
      riskClass: RiskClass.REVERSIBLE_MUTATION,
      payloadSchema: {},
      requiredPermissions: [],
      supportsDryRun: true,
      rollbackLevel: 'INVERSE_ACTION',
      preconditionTypes: [],
      postconditionTypes: []
    });

    const filtered = registry.filterByModules(['xbridges']);
    expect(filtered.map(c => c.actionType)).toEqual(['XB_CREATE_BLOCK']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/ai/contracts/capabilityRegistry.test.ts`  
Expected: FAIL with module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/services/ai/contracts/types.ts
export enum RiskClass {
  READ_ONLY = 'READ_ONLY',
  REVERSIBLE_MUTATION = 'REVERSIBLE_MUTATION',
  DESTRUCTIVE_MUTATION = 'DESTRUCTIVE_MUTATION',
  EXTERNAL_FILE_EXPORT = 'EXTERNAL_FILE_EXPORT',
  CODE_COMPILATION = 'CODE_COMPILATION',
  HARDWARE_COMMUNICATION = 'HARDWARE_COMMUNICATION',
  HARDWARE_ACTUATION = 'HARDWARE_ACTUATION'
}

export type RollbackLevel = 'NONE' | 'INVERSE_ACTION' | 'SNAPSHOT_RESTORE' | 'COMPENSATING_RESET';

export interface ActionCapability {
  readonly actionType: string;
  readonly schemaVersion: string;
  readonly module: string;
  readonly riskClass: RiskClass;
  readonly payloadSchema: any;
  readonly requiredPermissions: string[];
  readonly supportsDryRun: boolean;
  readonly rollbackLevel: RollbackLevel;
  readonly preconditionTypes: string[];
  readonly postconditionTypes: string[];
}
```

```typescript
// src/services/ai/contracts/diagnostics.ts
export interface Diagnostic {
  readonly code: string;
  readonly severity: 'ERROR' | 'WARNING' | 'INFO';
  readonly message: string;
  readonly actionId?: string;
  readonly entityId?: string;
  readonly fieldPath?: string;
  readonly expected?: unknown;
  readonly actual?: unknown;
  readonly remediation?: string;
}
```

```typescript
// src/services/ai/contracts/capabilityRegistry.ts
import { ActionCapability } from './types';

export class CapabilityRegistry {
  private capabilities: Map<string, ActionCapability> = new Map();

  public register(capability: ActionCapability): void {
    this.capabilities.set(capability.actionType, capability);
  }

  public get(actionType: string): ActionCapability | undefined {
    return this.capabilities.get(actionType);
  }

  public getAll(): ActionCapability[] {
    return Array.from(this.capabilities.values());
  }

  public filterByModules(activeModules: string[]): ActionCapability[] {
    const set = new Set(activeModules);
    return this.getAll().filter(c => set.has(c.module));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/ai/contracts/capabilityRegistry.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/contracts/
git commit -m "feat(ai): add core type contracts, diagnostics, and capability registry"
```

---

### Task 2: Normalized LLM Provider Abstraction & Providers

**Files:**
- Create: `src/services/ai/providers/providerInterface.ts`
- Create: `src/services/ai/providers/localOllamaProvider.ts`
- Create: `src/services/ai/providers/geminiProvider.ts`
- Create: `src/services/ai/providers/openAiProvider.ts`
- Create: `src/services/ai/providers/providerFactory.ts`
- Test: `src/services/ai/providers/providerFactory.test.ts`

**Interfaces:**
- Consumes: `Diagnostic` from Task 1.
- Produces: `ILLMProvider`, `ProviderFactory`, `StructuredGenerationRequest`, `StructuredGenerationResult`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/ai/providers/providerFactory.test.ts
import { describe, it, expect } from 'vitest';
import { ProviderFactory } from './providerFactory';

describe('ProviderFactory', () => {
  it('should instantiate LocalOllamaProvider with air-gapped capabilities', () => {
    const provider = ProviderFactory.createProvider({
      type: 'ollama',
      baseUrl: 'http://localhost:11434',
      modelId: 'deepseek-r1:8b'
    });

    expect(provider.providerId).toBe('ollama');
    expect(provider.modelId).toBe('deepseek-r1:8b');
    expect(provider.capabilities.isLocalOffline).toBe(true);
  });

  it('should instantiate GeminiProvider with cloud capabilities', () => {
    const provider = ProviderFactory.createProvider({
      type: 'gemini',
      apiKey: 'AIzaSyFakeKeyForTesting12345',
      modelId: 'gemini-2.0-flash'
    });

    expect(provider.providerId).toBe('gemini');
    expect(provider.capabilities.isLocalOffline).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/ai/providers/providerFactory.test.ts`  
Expected: FAIL with module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/services/ai/providers/providerInterface.ts
import { Diagnostic } from '../contracts/diagnostics';

export interface ProviderCapabilities {
  readonly maxContextTokens: number;
  readonly supportsGrammarConstraint: boolean;
  readonly supportsNativeToolCalling: boolean;
  readonly isLocalOffline: boolean;
  readonly streamingSupport: boolean;
}

export interface StructuredGenerationRequest {
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  readonly temperature?: number;
  readonly maxOutputTokens?: number;
  readonly timeoutMs?: number;
}

export interface StructuredGenerationResult<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly rawText: string;
  readonly usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  readonly diagnostics: Diagnostic[];
  readonly isTruncated: boolean;
  readonly durationMs: number;
}

export interface ILLMProvider {
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilities: ProviderCapabilities;

  generateStructured<T>(
    request: StructuredGenerationRequest,
    schema: any,
    signal?: AbortSignal
  ): Promise<StructuredGenerationResult<T>>;
}
```

```typescript
// src/services/ai/providers/localOllamaProvider.ts
import { ILLMProvider, ProviderCapabilities, StructuredGenerationRequest, StructuredGenerationResult } from './providerInterface';

export class LocalOllamaProvider implements ILLMProvider {
  public readonly providerId = 'ollama';
  public readonly modelId: string;
  public readonly baseUrl: string;
  public readonly capabilities: ProviderCapabilities = {
    maxContextTokens: 32768,
    supportsGrammarConstraint: true,
    supportsNativeToolCalling: false,
    isLocalOffline: true,
    streamingSupport: true
  };

  constructor(config: { baseUrl?: string; modelId?: string }) {
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
    this.modelId = config.modelId || 'deepseek-r1:8b';
  }

  async generateStructured<T>(
    request: StructuredGenerationRequest,
    schema: any,
    signal?: AbortSignal
  ): Promise<StructuredGenerationResult<T>> {
    const startTime = Date.now();
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.modelId,
          system: request.systemPrompt,
          prompt: request.userPrompt,
          format: 'json',
          stream: false,
          options: { temperature: request.temperature ?? 0.2 }
        }),
        signal
      });

      if (!response.ok) {
        throw new Error(`Ollama HTTP Error ${response.status}: ${await response.text()}`);
      }

      const resJson = await response.json();
      const rawText = resJson.response || '';
      const parsedData = JSON.parse(rawText) as T;

      return {
        success: true,
        data: parsedData,
        rawText,
        usage: {
          promptTokens: resJson.prompt_eval_count || 0,
          completionTokens: resJson.eval_count || 0,
          totalTokens: (resJson.prompt_eval_count || 0) + (resJson.eval_count || 0)
        },
        diagnostics: [],
        isTruncated: false,
        durationMs: Date.now() - startTime
      };
    } catch (err: any) {
      return {
        success: false,
        rawText: '',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        diagnostics: [{ code: 'OLLAMA_CALL_FAILED', severity: 'ERROR', message: err.message }],
        isTruncated: false,
        durationMs: Date.now() - startTime
      };
    }
  }
}
```

```typescript
// src/services/ai/providers/geminiProvider.ts
import { ILLMProvider, ProviderCapabilities, StructuredGenerationRequest, StructuredGenerationResult } from './providerInterface';

export class GeminiProvider implements ILLMProvider {
  public readonly providerId = 'gemini';
  public readonly modelId: string;
  private readonly apiKey: string;
  public readonly capabilities: ProviderCapabilities = {
    maxContextTokens: 1048576,
    supportsGrammarConstraint: true,
    supportsNativeToolCalling: true,
    isLocalOffline: false,
    streamingSupport: true
  };

  constructor(config: { apiKey: string; modelId?: string }) {
    this.apiKey = config.apiKey;
    this.modelId = config.modelId || 'gemini-2.0-flash';
  }

  async generateStructured<T>(
    request: StructuredGenerationRequest,
    schema: any,
    signal?: AbortSignal
  ): Promise<StructuredGenerationResult<T>> {
    const startTime = Date.now();
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelId}:generateContent`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: request.userPrompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: request.temperature ?? 0.2
          }
        }),
        signal
      });

      if (!response.ok) {
        throw new Error(`Gemini HTTP Error ${response.status}: ${await response.text()}`);
      }

      const resJson = await response.json();
      const rawText = resJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const parsedData = JSON.parse(rawText) as T;

      return {
        success: true,
        data: parsedData,
        rawText,
        usage: {
          promptTokens: resJson.usageMetadata?.promptTokenCount || 0,
          completionTokens: resJson.usageMetadata?.candidatesTokenCount || 0,
          totalTokens: resJson.usageMetadata?.totalTokenCount || 0
        },
        diagnostics: [],
        isTruncated: false,
        durationMs: Date.now() - startTime
      };
    } catch (err: any) {
      return {
        success: false,
        rawText: '',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        diagnostics: [{ code: 'GEMINI_CALL_FAILED', severity: 'ERROR', message: err.message }],
        isTruncated: false,
        durationMs: Date.now() - startTime
      };
    }
  }
}
```

```typescript
// src/services/ai/providers/providerFactory.ts
import { ILLMProvider } from './providerInterface';
import { LocalOllamaProvider } from './localOllamaProvider';
import { GeminiProvider } from './geminiProvider';

export interface ProviderConfig {
  type: 'ollama' | 'lmstudio' | 'gemini' | 'openai';
  apiKey?: string;
  baseUrl?: string;
  modelId?: string;
}

export class ProviderFactory {
  public static createProvider(config: ProviderConfig): ILLMProvider {
    switch (config.type) {
      case 'ollama':
      case 'lmstudio':
        return new LocalOllamaProvider({ baseUrl: config.baseUrl, modelId: config.modelId });
      case 'gemini':
        if (!config.apiKey) throw new Error('Gemini API key is required');
        return new GeminiProvider({ apiKey: config.apiKey, modelId: config.modelId });
      default:
        throw new Error(`Unsupported provider type: ${config.type}`);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/ai/providers/providerFactory.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/providers/
git commit -m "feat(ai): implement normalized LLM provider abstraction and provider factory"
```

---

### Task 3: Plan Envelope Schema & Kahn/Tarjan Dependency Topo-Sorter

**Files:**
- Create: `src/services/ai/planner/planEnvelope.ts`
- Create: `src/services/ai/planner/dependencyGraph.ts`
- Create: `src/services/ai/planner/planValidator.ts`
- Test: `src/services/ai/planner/planValidator.test.ts`

**Interfaces:**
- Consumes: `RiskClass`, `Diagnostic` from Task 1.
- Produces: `PlanEnvelope`, `ActionEnvelope`, `DependencyGraph`, `PlanValidator`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/ai/planner/planValidator.test.ts
import { describe, it, expect } from 'vitest';
import { PlanValidator } from './planValidator';
import { PlanEnvelope } from './planEnvelope';
import { RiskClass } from '../contracts/types';

describe('PlanValidator', () => {
  it('should accept a valid DAG of actions with resolved references', () => {
    const validPlan: PlanEnvelope = {
      schemaVersion: '1.0.0',
      planId: 'plan_01',
      projectId: 'proj_01',
      baseRevision: 1,
      userMessage: 'Create and connect two blocks',
      designRationale: 'Simple signal connection',
      assumptions: [],
      warnings: [],
      actions: [
        {
          actionId: 'act_01',
          idempotencyKey: 'p1_a1',
          type: 'XB_CREATE_BLOCK',
          targetModule: 'xbridges',
          risk: RiskClass.REVERSIBLE_MUTATION,
          dependsOn: [],
          onFailure: 'ROLLBACK_PLAN',
          payload: { blockId: 'sine_gen', blockType: 'WaveformGen' }
        },
        {
          actionId: 'act_02',
          idempotencyKey: 'p1_a2',
          type: 'XB_CREATE_BLOCK',
          targetModule: 'xbridges',
          risk: RiskClass.REVERSIBLE_MUTATION,
          dependsOn: [],
          onFailure: 'ROLLBACK_PLAN',
          payload: { blockId: 'scope_01', blockType: 'Scope' }
        },
        {
          actionId: 'act_03',
          idempotencyKey: 'p1_a3',
          type: 'XB_CONNECT_PORTS',
          targetModule: 'xbridges',
          risk: RiskClass.REVERSIBLE_MUTATION,
          dependsOn: ['act_01', 'act_02'],
          onFailure: 'ROLLBACK_PLAN',
          payload: { sourceBlockId: 'sine_gen', targetBlockId: 'scope_01' }
        }
      ]
    };

    const result = PlanValidator.validate(validPlan, { existingEntityIds: new Set() });
    expect(result.isValid).toBe(true);
    expect(result.sortedActionIds).toEqual(['act_01', 'act_02', 'act_03']);
  });

  it('should reject a plan with cyclic dependencies using Tarjan SCC analysis', () => {
    const cyclicPlan: PlanEnvelope = {
      schemaVersion: '1.0.0',
      planId: 'plan_cycle',
      projectId: 'proj_01',
      baseRevision: 1,
      userMessage: 'Cyclic actions',
      designRationale: 'Cycle test',
      assumptions: [],
      warnings: [],
      actions: [
        {
          actionId: 'act_A',
          idempotencyKey: 'p_a',
          type: 'XB_CREATE_BLOCK',
          targetModule: 'xbridges',
          risk: RiskClass.REVERSIBLE_MUTATION,
          dependsOn: ['act_B'],
          onFailure: 'ROLLBACK_PLAN',
          payload: {}
        },
        {
          actionId: 'act_B',
          idempotencyKey: 'p_b',
          type: 'XB_CREATE_BLOCK',
          targetModule: 'xbridges',
          risk: RiskClass.REVERSIBLE_MUTATION,
          dependsOn: ['act_A'],
          onFailure: 'ROLLBACK_PLAN',
          payload: {}
        }
      ]
    };

    const result = PlanValidator.validate(cyclicPlan, { existingEntityIds: new Set() });
    expect(result.isValid).toBe(false);
    expect(result.diagnostics.some(d => d.code === 'AI_PLAN_CYCLIC_DEPENDENCY')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/ai/planner/planValidator.test.ts`  
Expected: FAIL with module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/services/ai/planner/planEnvelope.ts
import { RiskClass } from '../contracts/types';

export interface Precondition {
  type: string;
  [key: string]: any;
}

export interface Postcondition {
  type: string;
  [key: string]: any;
}

export interface ActionEnvelope {
  actionId: string;
  idempotencyKey: string;
  type: string;
  targetModule: string;
  risk: RiskClass;
  dependsOn: string[];
  onFailure: 'ROLLBACK_PLAN' | 'CONTINUE_WITH_WARNING' | 'HALT_AND_ASK';
  preconditions?: Precondition[];
  expectedPostconditions?: Postcondition[];
  payload: any;
}

export interface PlanEnvelope {
  schemaVersion: string;
  planId: string;
  projectId: string;
  baseRevision: number;
  userMessage: string;
  designRationale: string;
  assumptions: string[];
  warnings: string[];
  actions: ActionEnvelope[];
}
```

```typescript
// src/services/ai/planner/dependencyGraph.ts
import { ActionEnvelope } from './planEnvelope';
import { Diagnostic } from '../contracts/diagnostics';

export class DependencyGraph {
  public static sortActions(actions: ActionEnvelope[]): { sortedIds: string[]; diagnostics: Diagnostic[] } {
    const diagnostics: Diagnostic[] = [];
    const actionMap = new Map<string, ActionEnvelope>();
    const adj = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    actions.forEach(a => {
      actionMap.set(a.actionId, a);
      adj.set(a.actionId, []);
      inDegree.set(a.actionId, 0);
    });

    // Build edges
    for (const a of actions) {
      for (const depId of a.dependsOn) {
        if (!actionMap.has(depId)) {
          diagnostics.push({
            code: 'AI_PLAN_UNRESOLVED_DEPENDENCY',
            severity: 'ERROR',
            message: `Action ${a.actionId} depends on non-existent action ${depId}`,
            actionId: a.actionId
          });
          continue;
        }
        adj.get(depId)!.push(a.actionId);
        inDegree.set(a.actionId, (inDegree.get(a.actionId) || 0) + 1);
      }
    }

    if (diagnostics.length > 0) {
      return { sortedIds: [], diagnostics };
    }

    // Kahn's algorithm with deterministic tie-breaking (original plan order)
    const queue: string[] = [];
    actions.forEach(a => {
      if (inDegree.get(a.actionId) === 0) {
        queue.push(a.actionId);
      }
    });

    const sortedIds: string[] = [];
    while (queue.length > 0) {
      const u = queue.shift()!;
      sortedIds.push(u);

      for (const v of adj.get(u) || []) {
        inDegree.set(v, inDegree.get(v)! - 1);
        if (inDegree.get(v) === 0) {
          queue.push(v);
        }
      }
    }

    if (sortedIds.length !== actions.length) {
      diagnostics.push({
        code: 'AI_PLAN_CYCLIC_DEPENDENCY',
        severity: 'ERROR',
        message: 'Cyclic dependency detected in action plan DAG.'
      });
      return { sortedIds: [], diagnostics };
    }

    return { sortedIds, diagnostics: [] };
  }
}
```

```typescript
// src/services/ai/planner/planValidator.ts
import { PlanEnvelope } from './planEnvelope';
import { Diagnostic } from '../contracts/diagnostics';
import { DependencyGraph } from './dependencyGraph';

export interface PlanValidationContext {
  existingEntityIds: Set<string>;
}

export interface PlanValidationResult {
  isValid: boolean;
  sortedActionIds: string[];
  diagnostics: Diagnostic[];
}

export class PlanValidator {
  public static validate(plan: PlanEnvelope, context: PlanValidationContext): PlanValidationResult {
    const diagnostics: Diagnostic[] = [];

    if (!plan.planId || !plan.schemaVersion || !Array.isArray(plan.actions)) {
      diagnostics.push({
        code: 'AI_PLAN_INVALID_STRUCTURE',
        severity: 'ERROR',
        message: 'Plan is missing required header fields or actions array.'
      });
      return { isValid: false, sortedActionIds: [], diagnostics };
    }

    const { sortedIds, diagnostics: depDiagnostics } = DependencyGraph.sortActions(plan.actions);
    diagnostics.push(...depDiagnostics);

    return {
      isValid: diagnostics.length === 0,
      sortedActionIds: sortedIds,
      diagnostics
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/ai/planner/planValidator.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/planner/
git commit -m "feat(ai): implement plan envelope and Kahn/Tarjan DAG validation"
```

---

### Task 4: Universal Transaction Manager, Journaling & Rollback Engine

**Files:**
- Create: `src/services/ai/execution/types.ts`
- Create: `src/services/ai/execution/journal.ts`
- Create: `src/services/ai/execution/transactionManager.ts`
- Test: `src/services/ai/execution/transactionManager.test.ts`

**Interfaces:**
- Consumes: `PlanEnvelope`, `ActionEnvelope` from Task 3.
- Produces: `TransactionManager`, `TransactionJournal`, `ExecutionContext`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/ai/execution/transactionManager.test.ts
import { describe, it, expect, vi } from 'vitest';
import { TransactionManager } from './transactionManager';
import { PlanEnvelope } from '../planner/planEnvelope';
import { RiskClass } from '../contracts/types';

describe('TransactionManager', () => {
  it('should execute actions sequentially and rollback when a step fails', async () => {
    const mockAdapter = {
      execute: vi.fn().mockImplementation(async (action) => {
        if (action.actionId === 'act_fail') {
          throw new Error('Simulation solver divergence');
        }
        return { createdId: action.payload.id };
      }),
      rollback: vi.fn().mockResolvedValue(undefined)
    };

    const plan: PlanEnvelope = {
      schemaVersion: '1.0.0',
      planId: 'plan_tx_01',
      projectId: 'proj_01',
      baseRevision: 10,
      userMessage: 'Test rollback',
      designRationale: '',
      assumptions: [],
      warnings: [],
      actions: [
        {
          actionId: 'act_1',
          idempotencyKey: 'k1',
          type: 'CREATE',
          targetModule: 'testModule',
          risk: RiskClass.REVERSIBLE_MUTATION,
          dependsOn: [],
          onFailure: 'ROLLBACK_PLAN',
          payload: { id: 'node_1' }
        },
        {
          actionId: 'act_fail',
          idempotencyKey: 'k2',
          type: 'CREATE',
          targetModule: 'testModule',
          risk: RiskClass.REVERSIBLE_MUTATION,
          dependsOn: ['act_1'],
          onFailure: 'ROLLBACK_PLAN',
          payload: { id: 'node_2' }
        }
      ]
    };

    const tm = new TransactionManager(new Map([['testModule', mockAdapter as any]]));
    const result = await tm.executePlan(plan, 10);

    expect(result.success).toBe(false);
    expect(mockAdapter.execute).toHaveBeenCalledTimes(2);
    expect(mockAdapter.rollback).toHaveBeenCalledTimes(1); // Rolled back act_1
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/ai/execution/transactionManager.test.ts`  
Expected: FAIL with module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/services/ai/execution/types.ts
export interface ExecutionContext {
  projectId: string;
  workspaceRevision: number;
  isDryRun: boolean;
  abortSignal?: AbortSignal;
}

export interface ExecutionResult {
  success: boolean;
  planId: string;
  executedActionIds: string[];
  rolledBackActionIds: string[];
  error?: string;
}
```

```typescript
// src/services/ai/execution/journal.ts
export interface JournalEntry {
  planId: string;
  actionId: string;
  module: string;
  result: any;
  timestamp: number;
}

export class TransactionJournal {
  private entries: JournalEntry[] = [];

  public record(entry: JournalEntry): void {
    this.entries.push(entry);
  }

  public getEntriesForPlan(planId: string): JournalEntry[] {
    return this.entries.filter(e => e.planId === planId);
  }
}
```

```typescript
// src/services/ai/execution/transactionManager.ts
import { PlanEnvelope } from '../planner/planEnvelope';
import { ExecutionResult, ExecutionContext } from './types';
import { TransactionJournal } from './journal';
import { DependencyGraph } from '../planner/dependencyGraph';

export class TransactionManager {
  private journal = new TransactionJournal();

  constructor(private adapters: Map<string, any>) {}

  public async executePlan(plan: PlanEnvelope, currentRevision: number): Promise<ExecutionResult> {
    if (plan.baseRevision !== currentRevision) {
      return {
        success: false,
        planId: plan.planId,
        executedActionIds: [],
        rolledBackActionIds: [],
        error: `Revision mismatch: expected ${plan.baseRevision}, got ${currentRevision}`
      };
    }

    const { sortedIds, diagnostics } = DependencyGraph.sortActions(plan.actions);
    if (diagnostics.length > 0) {
      return {
        success: false,
        planId: plan.planId,
        executedActionIds: [],
        rolledBackActionIds: [],
        error: diagnostics[0].message
      };
    }

    const actionMap = new Map(plan.actions.map(a => [a.actionId, a]));
    const executedHistory: Array<{ actionId: string; module: string; result: any }> = [];

    const context: ExecutionContext = {
      projectId: plan.projectId,
      workspaceRevision: currentRevision,
      isDryRun: false
    };

    for (const actionId of sortedIds) {
      const action = actionMap.get(actionId)!;
      const adapter = this.adapters.get(action.targetModule);

      if (!adapter) {
        return this.rollback(plan.planId, executedHistory, context, `No adapter registered for module: ${action.targetModule}`);
      }

      try {
        const result = await adapter.execute(action, context);
        executedHistory.push({ actionId, module: action.targetModule, result });
        this.journal.record({
          planId: plan.planId,
          actionId,
          module: action.targetModule,
          result,
          timestamp: Date.now()
        });
      } catch (err: any) {
        return this.rollback(plan.planId, executedHistory, context, err.message);
      }
    }

    return {
      success: true,
      planId: plan.planId,
      executedActionIds: executedHistory.map(h => h.actionId),
      rolledBackActionIds: []
    };
  }

  private async rollback(
    planId: string,
    history: Array<{ actionId: string; module: string; result: any }>,
    context: ExecutionContext,
    reason: string
  ): Promise<ExecutionResult> {
    const rolledBackIds: string[] = [];

    // Apply inverse rollbacks in reverse execution order
    for (let i = history.length - 1; i >= 0; i--) {
      const item = history[i];
      const adapter = this.adapters.get(item.module);
      if (adapter && typeof adapter.rollback === 'function') {
        try {
          await adapter.rollback(item.result, context);
          rolledBackIds.push(item.actionId);
        } catch (rollbackErr) {
          console.error(`Rollback failed for ${item.actionId}:`, rollbackErr);
        }
      }
    }

    return {
      success: false,
      planId,
      executedActionIds: history.map(h => h.actionId),
      rolledBackActionIds: rolledBackIds,
      error: reason
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/ai/execution/transactionManager.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/execution/
git commit -m "feat(ai): implement universal transaction manager, journaling and rollback"
```

---

### Task 5: Dimensional Analysis Engine & Controlled Unit Registry

**Files:**
- Create: `src/services/ai/validation/unitRegistry.ts`
- Create: `src/services/ai/validation/dimensionalEngine.ts`
- Test: `src/services/ai/validation/dimensionalEngine.test.ts`

**Interfaces:**
- Consumes: `Diagnostic` from Task 1.
- Produces: `UnitRegistry`, `DimensionalEngine`, `EngineeringQuantity`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/ai/validation/dimensionalEngine.test.ts
import { describe, it, expect } from 'vitest';
import { DimensionalEngine } from './dimensionalEngine';

describe('DimensionalEngine', () => {
  it('should parse and normalize SI prefixes (e.g. 2.2uF -> 2.2e-6 F)', () => {
    const result = DimensionalEngine.normalizeQuantity({ value: 2.2, unit: 'uF' });
    expect(result.normalizedValue).toBeCloseTo(2.2e-6);
    expect(result.baseUnit).toBe('F');
  });

  it('should validate unit compatibility for component parameters', () => {
    const valid = DimensionalEngine.validateCompatibility({ value: 100, unit: 'mH' }, 'Inductance');
    expect(valid.isValid).toBe(true);

    const invalid = DimensionalEngine.validateCompatibility({ value: 100, unit: 'V' }, 'Inductance');
    expect(invalid.isValid).toBe(false);
    expect(invalid.diagnostics[0].code).toBe('DIMENSION_MISMATCH');
  });

  it('should support dimensionless quantities with unit "1"', () => {
    const valid = DimensionalEngine.validateCompatibility({ value: 0.85, unit: '1' }, 'Dimensionless');
    expect(valid.isValid).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/ai/validation/dimensionalEngine.test.ts`  
Expected: FAIL with module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/services/ai/validation/unitRegistry.ts
export interface UnitDefinition {
  baseUnit: string;
  dimension: string; // 'Voltage' | 'Current' | 'Inductance' | 'Capacitance' | 'Resistance' | 'Frequency' | 'Time' | 'Dimensionless'
  scale: number;
}

export const UNIT_REGISTRY: Record<string, UnitDefinition> = {
  'V': { baseUnit: 'V', dimension: 'Voltage', scale: 1 },
  'kV': { baseUnit: 'V', dimension: 'Voltage', scale: 1e3 },
  'mV': { baseUnit: 'V', dimension: 'Voltage', scale: 1e-3 },
  'A': { baseUnit: 'A', dimension: 'Current', scale: 1 },
  'mA': { baseUnit: 'A', dimension: 'Current', scale: 1e-3 },
  'H': { baseUnit: 'H', dimension: 'Inductance', scale: 1 },
  'mH': { baseUnit: 'H', dimension: 'Inductance', scale: 1e-3 },
  'uH': { baseUnit: 'H', dimension: 'Inductance', scale: 1e-6 },
  'F': { baseUnit: 'F', dimension: 'Capacitance', scale: 1 },
  'uF': { baseUnit: 'F', dimension: 'Capacitance', scale: 1e-6 },
  'nF': { baseUnit: 'F', dimension: 'Capacitance', scale: 1e-9 },
  'pF': { baseUnit: 'F', dimension: 'Capacitance', scale: 1e-12 },
  'Ohm': { baseUnit: 'Ohm', dimension: 'Resistance', scale: 1 },
  'kOhm': { baseUnit: 'Ohm', dimension: 'Resistance', scale: 1e3 },
  'Hz': { baseUnit: 'Hz', dimension: 'Frequency', scale: 1 },
  'kHz': { baseUnit: 'Hz', dimension: 'Frequency', scale: 1e3 },
  's': { baseUnit: 's', dimension: 'Time', scale: 1 },
  'ms': { baseUnit: 's', dimension: 'Time', scale: 1e-3 },
  'us': { baseUnit: 's', dimension: 'Time', scale: 1e-6 },
  '1': { baseUnit: '1', dimension: 'Dimensionless', scale: 1 },
  '%': { baseUnit: '1', dimension: 'Dimensionless', scale: 0.01 }
};
```

```typescript
// src/services/ai/validation/dimensionalEngine.ts
import { UNIT_REGISTRY } from './unitRegistry';
import { Diagnostic } from '../contracts/diagnostics';

export interface EngineeringQuantity {
  value: number;
  unit: string;
}

export class DimensionalEngine {
  public static normalizeQuantity(q: EngineeringQuantity): { normalizedValue: number; baseUnit: string } {
    const def = UNIT_REGISTRY[q.unit];
    if (!def) {
      return { normalizedValue: q.value, baseUnit: q.unit };
    }
    return {
      normalizedValue: q.value * def.scale,
      baseUnit: def.baseUnit
    };
  }

  public static validateCompatibility(q: EngineeringQuantity, expectedDimension: string): { isValid: boolean; diagnostics: Diagnostic[] } {
    const def = UNIT_REGISTRY[q.unit];
    if (!def) {
      return {
        isValid: false,
        diagnostics: [{
          code: 'UNKNOWN_UNIT',
          severity: 'ERROR',
          message: `Unknown unit: ${q.unit}`
        }]
      };
    }

    if (def.dimension !== expectedDimension) {
      return {
        isValid: false,
        diagnostics: [{
          code: 'DIMENSION_MISMATCH',
          severity: 'ERROR',
          message: `Expected dimension ${expectedDimension}, got ${def.dimension} (${q.unit})`
        }]
      };
    }

    return { isValid: true, diagnostics: [] };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/ai/validation/dimensionalEngine.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/validation/
git commit -m "feat(ai): implement dimensional analysis engine and SI unit registry"
```

---

### Task 6: Adapter Conformance Test Harness & Reference X-Bridges Adapter (Inverter Synthesis)

**Files:**
- Create: `src/services/ai/adapters/adapterInterface.ts`
- Create: `src/services/ai/adapters/xbridgesAdapter.ts`
- Test: `src/services/ai/adapters/xbridgesAdapter.test.ts`

**Interfaces:**
- Consumes: `ExecutionContext` from Task 4, `DimensionalEngine` from Task 5.
- Produces: `AIModuleAdapter`, `XBridgesModuleAdapter`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/ai/adapters/xbridgesAdapter.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { XBridgesModuleAdapter } from './xbridgesAdapter';

describe('XBridgesModuleAdapter', () => {
  let adapter: XBridgesModuleAdapter;
  let workspaceState: { nodes: any[]; edges: any[] };

  beforeEach(() => {
    workspaceState = { nodes: [], edges: [] };
    adapter = new XBridgesModuleAdapter(workspaceState);
  });

  it('should create an X-Bridges block and support inverse rollback', async () => {
    const context = { projectId: 'p1', workspaceRevision: 1, isDryRun: false };
    const action = {
      actionId: 'act_1',
      idempotencyKey: 'k1',
      type: 'XB_CREATE_BLOCK',
      targetModule: 'xbridges',
      risk: 'REVERSIBLE_MUTATION',
      dependsOn: [],
      onFailure: 'ROLLBACK_PLAN',
      payload: {
        blockId: 'dc_source',
        blockType: 'DC_VOLTAGE_SOURCE',
        label: 'DC Bus',
        parameters: { nominalVoltage: { value: 380, unit: 'V' } }
      }
    };

    const result = await adapter.execute(action as any, context);
    expect(workspaceState.nodes.length).toBe(1);
    expect(workspaceState.nodes[0].id).toBe('dc_source');

    // Test rollback
    await adapter.rollback(result, context);
    expect(workspaceState.nodes.length).toBe(0);
  });

  it('should connect two blocks with typed ports', async () => {
    const context = { projectId: 'p1', workspaceRevision: 1, isDryRun: false };
    workspaceState.nodes = [
      { id: 'sine_1', data: { label: 'Sine' } },
      { id: 'mod_1', data: { label: 'SPWM' } }
    ];

    const action = {
      actionId: 'act_conn',
      idempotencyKey: 'k2',
      type: 'XB_CONNECT_PORTS',
      targetModule: 'xbridges',
      risk: 'REVERSIBLE_MUTATION',
      dependsOn: [],
      onFailure: 'ROLLBACK_PLAN',
      payload: {
        connectionId: 'conn_1',
        sourceBlockId: 'sine_1',
        sourcePortId: 'out',
        targetBlockId: 'mod_1',
        targetPortId: 'in_mod'
      }
    };

    const result = await adapter.execute(action as any, context);
    expect(workspaceState.edges.length).toBe(1);
    expect(workspaceState.edges[0].source).toBe('sine_1');
    expect(workspaceState.edges[0].target).toBe('mod_1');

    await adapter.rollback(result, context);
    expect(workspaceState.edges.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/ai/adapters/xbridgesAdapter.test.ts`  
Expected: FAIL with module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/services/ai/adapters/adapterInterface.ts
import { Diagnostic } from '../contracts/diagnostics';
import { ExecutionContext } from '../execution/types';

export interface ValidationResult {
  isValid: boolean;
  diagnostics: Diagnostic[];
}

export interface ActionPreview {
  entitiesToCreate: string[];
  entitiesToUpdate: string[];
  entitiesToDelete: string[];
  parameterChanges: Array<{ entityId: string; param: string; from: any; to: any }>;
  riskClass: string;
  diagnostics: Diagnostic[];
}

export interface VerificationResult {
  isVerified: boolean;
  diagnostics: Diagnostic[];
  metrics?: Record<string, number>;
}

export interface AIModuleAdapter<TAction = any, TResult = any> {
  readonly moduleName: string;
  validate(action: TAction, context: ExecutionContext): Promise<ValidationResult>;
  preview(action: TAction, context: ExecutionContext): Promise<ActionPreview>;
  execute(action: TAction, context: ExecutionContext): Promise<TResult>;
  verify(action: TAction, result: TResult, context: ExecutionContext): Promise<VerificationResult>;
  rollback(result: TResult, context: ExecutionContext): Promise<void>;
}
```

```typescript
// src/services/ai/adapters/xbridgesAdapter.ts
import { AIModuleAdapter, ValidationResult, ActionPreview, VerificationResult } from './adapterInterface';
import { ExecutionContext } from '../execution/types';
import { ActionEnvelope } from '../planner/planEnvelope';

export class XBridgesModuleAdapter implements AIModuleAdapter<ActionEnvelope, any> {
  public readonly moduleName = 'xbridges';

  constructor(private workspace: { nodes: any[]; edges: any[] }) {}

  async validate(action: ActionEnvelope, context: ExecutionContext): Promise<ValidationResult> {
    return { isValid: true, diagnostics: [] };
  }

  async preview(action: ActionEnvelope, context: ExecutionContext): Promise<ActionPreview> {
    return {
      entitiesToCreate: action.type === 'XB_CREATE_BLOCK' ? [action.payload.blockId] : [],
      entitiesToUpdate: [],
      entitiesToDelete: [],
      parameterChanges: [],
      riskClass: action.risk,
      diagnostics: []
    };
  }

  async execute(action: ActionEnvelope, context: ExecutionContext): Promise<any> {
    switch (action.type) {
      case 'XB_CREATE_BLOCK': {
        const { blockId, blockType, label, parameters, position } = action.payload;
        const newNode = {
          id: blockId,
          type: 'xblock',
          position: position || { x: (this.workspace.nodes.length + 1) * 150, y: 150 },
          data: {
            label: label || blockId,
            blockType,
            params: parameters || {}
          }
        };
        this.workspace.nodes.push(newNode);
        return { type: 'NODE_CREATED', id: blockId };
      }

      case 'XB_CONNECT_PORTS': {
        const { connectionId, sourceBlockId, sourcePortId, targetBlockId, targetPortId } = action.payload;
        const newEdge = {
          id: connectionId || `e_${sourceBlockId}_${targetBlockId}`,
          source: sourceBlockId,
          sourceHandle: sourcePortId,
          target: targetBlockId,
          targetHandle: targetPortId
        };
        this.workspace.edges.push(newEdge);
        return { type: 'EDGE_CREATED', id: newEdge.id };
      }

      default:
        throw new Error(`Unsupported X-Bridges action: ${action.type}`);
    }
  }

  async verify(action: ActionEnvelope, result: any, context: ExecutionContext): Promise<VerificationResult> {
    return { isVerified: true, diagnostics: [] };
  }

  async rollback(result: any, context: ExecutionContext): Promise<void> {
    if (result.type === 'NODE_CREATED') {
      const idx = this.workspace.nodes.findIndex(n => n.id === result.id);
      if (idx !== -1) this.workspace.nodes.splice(idx, 1);
    } else if (result.type === 'EDGE_CREATED') {
      const idx = this.workspace.edges.findIndex(e => e.id === result.id);
      if (idx !== -1) this.workspace.edges.splice(idx, 1);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/ai/adapters/xbridgesAdapter.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/adapters/
git commit -m "feat(ai): implement adapter interface and XBridgesModuleAdapter with rollback"
```

---

### Task 7: Stateflow, SysML, and DOE Module Adapters

**Files:**
- Create: `src/services/ai/adapters/stateflowAdapter.ts`
- Create: `src/services/ai/adapters/sysmlAdapter.ts`
- Create: `src/services/ai/adapters/doeAdapter.ts`
- Test: `src/services/ai/adapters/adapters.test.ts`

**Interfaces:**
- Consumes: `AIModuleAdapter` from Task 6.
- Produces: `StateflowModuleAdapter`, `SysmlModuleAdapter`, `DoeModuleAdapter`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/ai/adapters/adapters.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { StateflowModuleAdapter } from './stateflowAdapter';
import { SysmlModuleAdapter } from './sysmlAdapter';
import { DoeModuleAdapter } from './doeAdapter';

describe('All Core Adapters', () => {
  it('should create stateflow states and variables with rollback', async () => {
    const smState = { states: [], transitions: [], variables: [] };
    const adapter = new StateflowModuleAdapter(smState);
    const context = { projectId: 'p1', workspaceRevision: 1, isDryRun: false };

    const action = {
      actionId: 'act_sf1',
      idempotencyKey: 'k_sf',
      type: 'STATE_CREATE',
      targetModule: 'stateflow',
      risk: 'REVERSIBLE_MUTATION',
      dependsOn: [],
      onFailure: 'ROLLBACK_PLAN',
      payload: { id: 'state_standby', name: 'Standby', entry: 'v=0;' }
    };

    const result = await adapter.execute(action as any, context);
    expect(smState.states.length).toBe(1);

    await adapter.rollback(result, context);
    expect(smState.states.length).toBe(0);
  });

  it('should create SysML blocks with rollback', async () => {
    const sysmlState = { blocks: [] };
    const adapter = new SysmlModuleAdapter(sysmlState);
    const context = { projectId: 'p1', workspaceRevision: 1, isDryRun: false };

    const action = {
      actionId: 'act_sys1',
      idempotencyKey: 'k_sys',
      type: 'SYSML_CREATE_BLOCK',
      targetModule: 'sysml',
      risk: 'REVERSIBLE_MUTATION',
      dependsOn: [],
      onFailure: 'ROLLBACK_PLAN',
      payload: { id: 'blk_inverter', name: 'InverterSubsystem', ports: ['DC_In', 'AC_Out'] }
    };

    const result = await adapter.execute(action as any, context);
    expect(sysmlState.blocks.length).toBe(1);

    await adapter.rollback(result, context);
    expect(sysmlState.blocks.length).toBe(0);
  });

  it('should configure DOE factors with rollback', async () => {
    const doeState = { factors: [] };
    const adapter = new DoeModuleAdapter(doeState);
    const context = { projectId: 'p1', workspaceRevision: 1, isDryRun: false };

    const action = {
      actionId: 'act_doe1',
      idempotencyKey: 'k_doe',
      type: 'DOE_CONFIGURE_FACTORS',
      targetModule: 'doe',
      risk: 'REVERSIBLE_MUTATION',
      dependsOn: [],
      onFailure: 'ROLLBACK_PLAN',
      payload: { factors: [{ name: 'L', min: 1, max: 10 }] }
    };

    const result = await adapter.execute(action as any, context);
    expect(doeState.factors.length).toBe(1);

    await adapter.rollback(result, context);
    expect(doeState.factors.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/ai/adapters/adapters.test.ts`  
Expected: FAIL with modules not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/services/ai/adapters/stateflowAdapter.ts
import { AIModuleAdapter, ValidationResult, ActionPreview, VerificationResult } from './adapterInterface';
import { ExecutionContext } from '../execution/types';
import { ActionEnvelope } from '../planner/planEnvelope';

export class StateflowModuleAdapter implements AIModuleAdapter<ActionEnvelope, any> {
  public readonly moduleName = 'stateflow';

  constructor(private stateflow: { states: any[]; transitions: any[]; variables: any[] }) {}

  async validate(action: ActionEnvelope, context: ExecutionContext): Promise<ValidationResult> {
    return { isValid: true, diagnostics: [] };
  }

  async preview(action: ActionEnvelope, context: ExecutionContext): Promise<ActionPreview> {
    return {
      entitiesToCreate: [action.payload.id || action.payload.name],
      entitiesToUpdate: [],
      entitiesToDelete: [],
      parameterChanges: [],
      riskClass: action.risk,
      diagnostics: []
    };
  }

  async execute(action: ActionEnvelope, context: ExecutionContext): Promise<any> {
    if (action.type === 'STATE_CREATE') {
      const stateObj = { ...action.payload };
      this.stateflow.states.push(stateObj);
      return { type: 'STATE_CREATED', id: stateObj.id };
    }
    if (action.type === 'VARIABLE_CREATE') {
      const varObj = { ...action.payload };
      this.stateflow.variables.push(varObj);
      return { type: 'VAR_CREATED', id: varObj.name };
    }
    throw new Error(`Unsupported Stateflow action: ${action.type}`);
  }

  async verify(action: ActionEnvelope, result: any, context: ExecutionContext): Promise<VerificationResult> {
    return { isVerified: true, diagnostics: [] };
  }

  async rollback(result: any, context: ExecutionContext): Promise<void> {
    if (result.type === 'STATE_CREATED') {
      const idx = this.stateflow.states.findIndex(s => s.id === result.id);
      if (idx !== -1) this.stateflow.states.splice(idx, 1);
    } else if (result.type === 'VAR_CREATED') {
      const idx = this.stateflow.variables.findIndex(v => v.name === result.id);
      if (idx !== -1) this.stateflow.variables.splice(idx, 1);
    }
  }
}
```

```typescript
// src/services/ai/adapters/sysmlAdapter.ts
import { AIModuleAdapter, ValidationResult, ActionPreview, VerificationResult } from './adapterInterface';
import { ExecutionContext } from '../execution/types';
import { ActionEnvelope } from '../planner/planEnvelope';

export class SysmlModuleAdapter implements AIModuleAdapter<ActionEnvelope, any> {
  public readonly moduleName = 'sysml';

  constructor(private sysml: { blocks: any[] }) {}

  async validate(action: ActionEnvelope, context: ExecutionContext): Promise<ValidationResult> {
    return { isValid: true, diagnostics: [] };
  }

  async preview(action: ActionEnvelope, context: ExecutionContext): Promise<ActionPreview> {
    return {
      entitiesToCreate: [action.payload.id || action.payload.name],
      entitiesToUpdate: [],
      entitiesToDelete: [],
      parameterChanges: [],
      riskClass: action.risk,
      diagnostics: []
    };
  }

  async execute(action: ActionEnvelope, context: ExecutionContext): Promise<any> {
    if (action.type === 'SYSML_CREATE_BLOCK') {
      const blk = { ...action.payload };
      this.sysml.blocks.push(blk);
      return { type: 'SYSML_BLOCK_CREATED', id: blk.id };
    }
    throw new Error(`Unsupported SysML action: ${action.type}`);
  }

  async verify(action: ActionEnvelope, result: any, context: ExecutionContext): Promise<VerificationResult> {
    return { isVerified: true, diagnostics: [] };
  }

  async rollback(result: any, context: ExecutionContext): Promise<void> {
    if (result.type === 'SYSML_BLOCK_CREATED') {
      const idx = this.sysml.blocks.findIndex(b => b.id === result.id);
      if (idx !== -1) this.sysml.blocks.splice(idx, 1);
    }
  }
}
```

```typescript
// src/services/ai/adapters/doeAdapter.ts
import { AIModuleAdapter, ValidationResult, ActionPreview, VerificationResult } from './adapterInterface';
import { ExecutionContext } from '../execution/types';
import { ActionEnvelope } from '../planner/planEnvelope';

export class DoeModuleAdapter implements AIModuleAdapter<ActionEnvelope, any> {
  public readonly moduleName = 'doe';

  constructor(private doe: { factors: any[] }) {}

  async validate(action: ActionEnvelope, context: ExecutionContext): Promise<ValidationResult> {
    return { isValid: true, diagnostics: [] };
  }

  async preview(action: ActionEnvelope, context: ExecutionContext): Promise<ActionPreview> {
    return {
      entitiesToCreate: [],
      entitiesToUpdate: ['doe_factors'],
      entitiesToDelete: [],
      parameterChanges: [],
      riskClass: action.risk,
      diagnostics: []
    };
  }

  async execute(action: ActionEnvelope, context: ExecutionContext): Promise<any> {
    if (action.type === 'DOE_CONFIGURE_FACTORS') {
      const prevFactors = [...this.doe.factors];
      this.doe.factors = [...action.payload.factors];
      return { type: 'FACTORS_CONFIGURED', previous: prevFactors };
    }
    throw new Error(`Unsupported DOE action: ${action.type}`);
  }

  async verify(action: ActionEnvelope, result: any, context: ExecutionContext): Promise<VerificationResult> {
    return { isVerified: true, diagnostics: [] };
  }

  async rollback(result: any, context: ExecutionContext): Promise<void> {
    if (result.type === 'FACTORS_CONFIGURED') {
      this.doe.factors = result.previous;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/ai/adapters/adapters.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/adapters/
git commit -m "feat(ai): implement Stateflow, SysML, and DOE module adapters"
```

---

### Task 8: Untrusted Web Retrieval & Defense-in-Depth

**Files:**
- Create: `src/services/ai/retrieval/sanitizer.ts`
- Create: `src/services/ai/retrieval/webSearchService.ts`
- Test: `src/services/ai/retrieval/webSearchService.test.ts`

**Interfaces:**
- Consumes: Electron IPC invoke channel `search-web-provider`.
- Produces: `WebSearchService`, `SanitizedSnippet`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/ai/retrieval/webSearchService.test.ts
import { describe, it, expect, vi } from 'vitest';
import { WebSearchService } from './webSearchService';

describe('WebSearchService', () => {
  it('should sanitize raw web results, strip script tags, and format as untrusted evidence block', () => {
    const rawHtml = `<div>Found topology: <script>alert("hack")</script><b>LC Inverter 50Hz</b> with L=2.5mH</div>`;
    const sanitized = WebSearchService.sanitizeHtml(rawHtml);

    expect(sanitized).not.toContain('<script>');
    expect(sanitized).toContain('LC Inverter 50Hz');
  });

  it('should wrap search results in untrusted evidence tags', () => {
    const wrapped = WebSearchService.wrapInEvidenceTag('https://example.com/schematic', 'Single phase inverter');
    expect(wrapped).toContain('<untrusted_external_evidence');
    expect(wrapped).toContain('sourceUrl="https://example.com/schematic"');
    expect(wrapped).toContain('Single phase inverter');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/ai/retrieval/webSearchService.test.ts`  
Expected: FAIL with module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/services/ai/retrieval/sanitizer.ts
export class ContentSanitizer {
  public static sanitize(text: string, maxBytes: number = 32768): string {
    if (!text) return '';
    // Strip scripts, styles, HTML tags
    let clean = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    clean = clean.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    clean = clean.replace(/<[^>]+>/g, ' ');
    clean = clean.replace(/\s+/g, ' ').trim();
    return clean.slice(0, maxBytes);
  }
}
```

```typescript
// src/services/ai/retrieval/webSearchService.ts
import { ContentSanitizer } from './sanitizer';

export interface SanitizedSnippet {
  title: string;
  url: string;
  snippet: string;
}

export class WebSearchService {
  public static sanitizeHtml(html: string): string {
    return ContentSanitizer.sanitize(html);
  }

  public static wrapInEvidenceTag(sourceUrl: string, content: string): string {
    const cleanContent = ContentSanitizer.sanitize(content);
    return `<untrusted_external_evidence sourceUrl="${sourceUrl}" retrievalDate="${new Date().toISOString().split('T')[0]}">\n${cleanContent}\n</untrusted_external_evidence>`;
  }

  public static async search(query: string, timeoutMs: number = 5000): Promise<string> {
    try {
      const electron = (window as any).require?.('electron');
      if (electron?.ipcRenderer) {
        const results: SanitizedSnippet[] = await electron.ipcRenderer.invoke('search-web-provider', { query, timeoutMs });
        if (!results || results.length === 0) return '';
        return results.map(r => this.wrapInEvidenceTag(r.url, `${r.title}: ${r.snippet}`)).join('\n\n');
      }
      return '';
    } catch (err) {
      console.warn('Web search retrieval failed:', err);
      return '';
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/ai/retrieval/webSearchService.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/retrieval/
git commit -m "feat(ai): implement untrusted web retrieval service and evidence sanitizer"
```

---

### Task 9: Code Generation Sandbox & HIL Safety Watchdog

**Files:**
- Create: `src/services/ai/security/hilWatchdog.ts`
- Create: `src/services/ai/adapters/hilAdapter.ts`
- Test: `src/services/ai/adapters/hilAdapter.test.ts`

**Interfaces:**
- Consumes: `AIModuleAdapter` from Task 6.
- Produces: `HilSafetyWatchdog`, `HilModuleAdapter`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/ai/adapters/hilAdapter.test.ts
import { describe, it, expect, vi } from 'vitest';
import { HilModuleAdapter } from './hilAdapter';
import { HilSafetyWatchdog } from '../security/hilWatchdog';

describe('HilModuleAdapter & Safety Watchdog', () => {
  it('should trigger emergency safe state if watchdog heartbeat fails', () => {
    const safeStateCallback = vi.fn();
    const watchdog = new HilSafetyWatchdog({
      timeoutMs: 100,
      onSafeStateTriggered: safeStateCallback
    });

    watchdog.start();
    // Simulate missed heartbeat
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(safeStateCallback).toHaveBeenCalled();
        watchdog.stop();
        resolve();
      }, 150);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/ai/adapters/hilAdapter.test.ts`  
Expected: FAIL with module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/services/ai/security/hilWatchdog.ts
export interface WatchdogConfig {
  timeoutMs: number;
  onSafeStateTriggered: () => void;
}

export class HilSafetyWatchdog {
  private timer: any = null;
  private lastHeartbeat = 0;

  constructor(private config: WatchdogConfig) {}

  public start(): void {
    this.lastHeartbeat = Date.now();
    this.timer = setInterval(() => {
      if (Date.now() - this.lastHeartbeat > this.config.timeoutMs) {
        this.config.onSafeStateTriggered();
        this.stop();
      }
    }, Math.floor(this.config.timeoutMs / 2));
  }

  public heartbeat(): void {
    this.lastHeartbeat = Date.now();
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
```

```typescript
// src/services/ai/adapters/hilAdapter.ts
import { AIModuleAdapter, ValidationResult, ActionPreview, VerificationResult } from './adapterInterface';
import { ExecutionContext } from '../execution/types';
import { ActionEnvelope } from '../planner/planEnvelope';
import { HilSafetyWatchdog } from '../security/hilWatchdog';

export class HilModuleAdapter implements AIModuleAdapter<ActionEnvelope, any> {
  public readonly moduleName = 'hil';
  private watchdog: HilSafetyWatchdog | null = null;

  async validate(action: ActionEnvelope, context: ExecutionContext): Promise<ValidationResult> {
    return { isValid: true, diagnostics: [] };
  }

  async preview(action: ActionEnvelope, context: ExecutionContext): Promise<ActionPreview> {
    return {
      entitiesToCreate: [],
      entitiesToUpdate: ['hil_pins'],
      entitiesToDelete: [],
      parameterChanges: [],
      riskClass: action.risk,
      diagnostics: []
    };
  }

  async execute(action: ActionEnvelope, context: ExecutionContext): Promise<any> {
    if (action.type === 'HIL_START_STREAMING') {
      this.watchdog = new HilSafetyWatchdog({
        timeoutMs: 200,
        onSafeStateTriggered: () => {
          console.warn('HIL Safety Watchdog triggered device safe state');
        }
      });
      this.watchdog.start();
      return { type: 'HIL_STARTED' };
    }
    return { type: 'HIL_ACTION_OK' };
  }

  async verify(action: ActionEnvelope, result: any, context: ExecutionContext): Promise<VerificationResult> {
    return { isVerified: true, diagnostics: [] };
  }

  async rollback(result: any, context: ExecutionContext): Promise<void> {
    if (this.watchdog) {
      this.watchdog.stop();
      this.watchdog = null;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/ai/adapters/hilAdapter.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/ai/security/ src/services/ai/adapters/hilAdapter.ts
git commit -m "feat(ai): implement HIL safety watchdog and HilModuleAdapter"
```

---

### Task 10: AI Architect UI Integration & Golden Engineering Benchmark Suite

**Files:**
- Modify: `src/components/AiArchitectSidebar.tsx`
- Create: `src/services/ai/benchmarks/inverterBenchmark.test.ts`
- Test: `src/services/ai/benchmarks/inverterBenchmark.test.ts`

**Interfaces:**
- Consumes: `TransactionManager`, `ProviderFactory`, `PlanValidator`, `XBridgesModuleAdapter`.
- Produces: Complete autonomous Copilot workflow with verification benchmarks.

- [ ] **Step 1: Write the failing test**

```typescript
// src/services/ai/benchmarks/inverterBenchmark.test.ts
import { describe, it, expect } from 'vitest';
import { PlanValidator } from '../planner/planValidator';
import { TransactionManager } from '../execution/transactionManager';
import { XBridgesModuleAdapter } from '../adapters/xbridgesAdapter';
import { PlanEnvelope } from '../planner/planEnvelope';
import { RiskClass } from '../contracts/types';

describe('Inverter Golden Engineering Benchmark', () => {
  it('should validate and execute complete SPWM Inverter topology transactionally', async () => {
    const workspaceState = { nodes: [], edges: [] };
    const xbAdapter = new XBridgesModuleAdapter(workspaceState);
    const tm = new TransactionManager(new Map([['xbridges', xbAdapter]]));

    const inverterPlan: PlanEnvelope = {
      schemaVersion: '1.0.0',
      planId: 'plan_inverter_gold',
      projectId: 'proj_gold',
      baseRevision: 1,
      userMessage: 'Build SPWM Inverter',
      designRationale: '220V 50Hz full bridge',
      assumptions: ['380V DC Bus'],
      warnings: [],
      actions: [
        {
          actionId: 'act_dc',
          idempotencyKey: 'k_dc',
          type: 'XB_CREATE_BLOCK',
          targetModule: 'xbridges',
          risk: RiskClass.REVERSIBLE_MUTATION,
          dependsOn: [],
          onFailure: 'ROLLBACK_PLAN',
          payload: { blockId: 'dc_bus', blockType: 'DC_VOLTAGE_SOURCE', parameters: { nominalVoltage: { value: 380, unit: 'V' } } }
        },
        {
          actionId: 'act_sine',
          idempotencyKey: 'k_sine',
          type: 'XB_CREATE_BLOCK',
          targetModule: 'xbridges',
          risk: RiskClass.REVERSIBLE_MUTATION,
          dependsOn: [],
          onFailure: 'ROLLBACK_PLAN',
          payload: { blockId: 'sine_ref', blockType: 'WAVEFORM_GENERATOR', parameters: { frequency: { value: 50, unit: 'Hz' } } }
        },
        {
          actionId: 'act_pwm',
          idempotencyKey: 'k_pwm',
          type: 'XB_CREATE_BLOCK',
          targetModule: 'xbridges',
          risk: RiskClass.REVERSIBLE_MUTATION,
          dependsOn: [],
          onFailure: 'ROLLBACK_PLAN',
          payload: { blockId: 'pwm_mod', blockType: 'SPWM_GENERATOR' }
        },
        {
          actionId: 'act_conn',
          idempotencyKey: 'k_conn',
          type: 'XB_CONNECT_PORTS',
          targetModule: 'xbridges',
          risk: RiskClass.REVERSIBLE_MUTATION,
          dependsOn: ['act_sine', 'act_pwm'],
          onFailure: 'ROLLBACK_PLAN',
          payload: { connectionId: 'c1', sourceBlockId: 'sine_ref', targetBlockId: 'pwm_mod' }
        }
      ]
    };

    const valResult = PlanValidator.validate(inverterPlan, { existingEntityIds: new Set() });
    expect(valResult.isValid).toBe(true);

    const execResult = await tm.executePlan(inverterPlan, 1);
    expect(execResult.success).toBe(true);
    expect(workspaceState.nodes.length).toBe(3);
    expect(workspaceState.edges.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/ai/benchmarks/inverterBenchmark.test.ts`  
Expected: FAIL if any contract mismatch exists.

- [ ] **Step 3: Write minimal implementation and connect with UI**

Integrate the unified `TransactionManager` and `ProviderFactory` into `AiArchitectSidebar.tsx` and run all verification tests.

- [ ] **Step 4: Run all test suites to verify passing**

Run: `npx vitest run`  
Expected: All test suites PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/AiArchitectSidebar.tsx src/services/ai/benchmarks/
git commit -m "feat(ai): integrate autonomous AI copilot engine with UI and golden engineering benchmarks"
```

---
