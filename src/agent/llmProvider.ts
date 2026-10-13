/**
 * Local LLM Provider Interface and Ollama Adapter
 * Enforces loopback-only network isolation and structured JSON output validation.
 */

export interface JsonSchema {
  type: string;
  required?: string[];
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface LlmRequest {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
}

export type LlmResult<T> =
  | { success: true; data: T; rawOutput: string }
  | { success: false; error: string; rawOutput?: string };

export interface LlmHealth {
  available: boolean;
  model?: string;
  latencyMs?: number;
  error?: string;
}

export interface LocalLlmConfig {
  baseUrl: string;
  modelName: string;
  timeoutMs?: number;
}

/**
 * Validates that a given URL targets exclusively local loopback interfaces.
 */
export function isLoopbackUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '[::1]' ||
      host === '::1'
    );
  } catch {
    return false;
  }
}

export interface LlmProvider {
  generate<T>(request: LlmRequest, schema: JsonSchema): Promise<LlmResult<T>>;
  health(): Promise<LlmHealth>;
}

/**
 * Recursively validates structured data against a JSON schema specification.
 * Validates types, required fields, properties, enums, items, and nested schemas.
 */
export function validateAgainstSchema(
  data: unknown,
  schema: JsonSchema,
  path: string = 'root'
): { valid: boolean; error?: string } {
  if (!schema || typeof schema !== 'object') return { valid: true };

  // Enum validation
  if (Array.isArray(schema.enum)) {
    if (!schema.enum.includes(data)) {
      return {
        valid: false,
        error: `Schema validation failed at '${path}': value ${JSON.stringify(data)} not in allowed enum [${schema.enum.join(', ')}]`
      };
    }
  }

  // Type validation
  if (schema.type) {
    switch (schema.type) {
      case 'object': {
        if (typeof data !== 'object' || data === null || Array.isArray(data)) {
          return {
            valid: false,
            error: `Schema validation failed at '${path}': expected object, got ${data === null ? 'null' : Array.isArray(data) ? 'array' : typeof data}`
          };
        }
        const obj = data as Record<string, unknown>;

        // Required properties
        if (Array.isArray(schema.required)) {
          for (const reqField of schema.required) {
            if (!(reqField in obj) || obj[reqField] === undefined) {
              return {
                valid: false,
                error: `Schema validation failed: missing required property '${path === 'root' ? reqField : `${path}.${reqField}`}'`
              };
            }
          }
        }

        // Nested properties validation
        if (schema.properties && typeof schema.properties === 'object') {
          for (const [propKey, propSchema] of Object.entries(schema.properties)) {
            if (propKey in obj && obj[propKey] !== undefined) {
              const res = validateAgainstSchema(
                obj[propKey],
                propSchema as JsonSchema,
                path === 'root' ? propKey : `${path}.${propKey}`
              );
              if (!res.valid) return res;
            }
          }
        }
        break;
      }

      case 'array': {
        if (!Array.isArray(data)) {
          return {
            valid: false,
            error: `Schema validation failed at '${path}': expected array, got ${typeof data}`
          };
        }
        if (schema.items && typeof schema.items === 'object') {
          for (let i = 0; i < data.length; i++) {
            const res = validateAgainstSchema(
              data[i],
              schema.items as JsonSchema,
              `${path}[${i}]`
            );
            if (!res.valid) return res;
          }
        }
        break;
      }

      case 'string': {
        if (typeof data !== 'string') {
          return {
            valid: false,
            error: `Schema validation failed at '${path}': expected string, got ${typeof data}`
          };
        }
        break;
      }

      case 'number': {
        if (typeof data !== 'number' || isNaN(data)) {
          return {
            valid: false,
            error: `Schema validation failed at '${path}': expected number, got ${typeof data}`
          };
        }
        if (typeof schema.minimum === 'number' && data < schema.minimum) {
          return {
            valid: false,
            error: `Schema validation failed at '${path}': value ${data} < minimum ${schema.minimum}`
          };
        }
        if (typeof schema.maximum === 'number' && data > schema.maximum) {
          return {
            valid: false,
            error: `Schema validation failed at '${path}': value ${data} > maximum ${schema.maximum}`
          };
        }
        break;
      }

      case 'boolean': {
        if (typeof data !== 'boolean') {
          return {
            valid: false,
            error: `Schema validation failed at '${path}': expected boolean, got ${typeof data}`
          };
        }
        break;
      }
    }
  }

  return { valid: true };
}

export class OllamaLlmProvider implements LlmProvider {
  private config: Required<LocalLlmConfig>;

  constructor(config: LocalLlmConfig) {
    if (!isLoopbackUrl(config.baseUrl)) {
      throw new Error(
        `Security violation: only local loopback URLs are permitted (received: ${config.baseUrl})`
      );
    }

    this.config = {
      baseUrl: config.baseUrl.replace(/\/+$/, ''),
      modelName: config.modelName,
      timeoutMs: config.timeoutMs ?? 30000
    };
  }

  public async generate<T>(request: LlmRequest, schema: JsonSchema): Promise<LlmResult<T>> {
    if (!this.config.modelName || !this.config.modelName.trim()) {
      return {
        success: false,
        error: 'No Ollama model selected. Please select an installed model in the agent settings.'
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const promptText = request.systemPrompt
        ? `${request.systemPrompt}\n\n${request.prompt}`
        : request.prompt;

      const response = await fetch(`${this.config.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.config.modelName,
          prompt: promptText,
          format: 'json',
          stream: false,
          options: {
            temperature: request.temperature ?? 0.1
          }
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP error from local LLM: status ${response.status} ${response.statusText}`
        };
      }

      const body = await response.json();
      const rawOutput = (body.response as string) || '';

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawOutput);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          success: false,
          error: `Failed to parse model output as JSON: ${msg}`,
          rawOutput
        };
      }

      // Comprehensive recursive schema validation at the boundary
      const schemaValidation = validateAgainstSchema(parsed, schema);
      if (!schemaValidation.valid) {
        return {
          success: false,
          error: schemaValidation.error || 'Schema validation failed',
          rawOutput
        };
      }

      return {
        success: true,
        data: parsed as T,
        rawOutput
      };
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          return { success: false, error: 'Request timeout: local model did not respond in time' };
        }
        return { success: false, error: `Connection failed: ${err.message}` };
      }
      return { success: false, error: `Unexpected error: ${String(err)}` };
    } finally {
      clearTimeout(timer);
    }
  }

  public async health(): Promise<LlmHealth> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const start = Date.now();

    try {
      const res = await fetch(`${this.config.baseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal
      });

      if (!res.ok) {
        return {
          available: false,
          error: `HTTP ${res.status}: ${res.statusText}`
        };
      }

      const data = await res.json();
      const latencyMs = Date.now() - start;
      const models = Array.isArray(data.models)
        ? data.models.map((m: { name?: string }) => m.name || '')
        : [];
      const modelPresent = models.includes(this.config.modelName)
        ? this.config.modelName
        : models[0] || this.config.modelName;

      return {
        available: true,
        model: modelPresent,
        latencyMs
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        available: false,
        error: `Local LLM unreachable at ${this.config.baseUrl}: ${msg}`
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
