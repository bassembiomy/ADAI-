import { z } from 'zod';
import { ILLMProvider, StructuredGenerationRequest, StructuredGenerationResult } from './providerInterface';

export class StructuredGenerationCoordinator {
  constructor(private provider: ILLMProvider) {}

  public async generateAndRepair<T>(
    request: StructuredGenerationRequest,
    schema: z.ZodType<T>,
    signal?: AbortSignal
  ): Promise<StructuredGenerationResult<T>> {
    const startTime = Date.now();
    let currentPrompt = request.userPrompt;
    let attempts = 0;
    const maxAttempts = 2;
    let lastRawText = '';
    let accumulatedUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const timeoutController = new AbortController();
        const timeoutId = setTimeout(() => timeoutController.abort(), request.timeoutMs || 30000);
        const combinedSignal = signal ? AbortSignal.any([signal, timeoutController.signal]) : timeoutController.signal;

        let rawRes;
        try {
          rawRes = await this.provider.generateRaw({ ...request, userPrompt: currentPrompt }, combinedSignal);
        } finally {
          clearTimeout(timeoutId);
        }

        lastRawText = rawRes.rawText;
        if (rawRes.usage) {
          accumulatedUsage.promptTokens += rawRes.usage.promptTokens;
          accumulatedUsage.completionTokens += rawRes.usage.completionTokens;
          accumulatedUsage.totalTokens += rawRes.usage.totalTokens;
        }

        let parsedJson;
        try {
          parsedJson = JSON.parse(lastRawText);
        } catch (parseErr: any) {
          currentPrompt = `${request.userPrompt}\n\n[ERROR: Your previous output was not valid JSON: "${lastRawText}". Please return ONLY valid JSON matching schema.]`;
          continue;
        }

        const zodCheck = schema.safeParse(parsedJson);
        if (zodCheck.success) {
          return {
            success: true,
            data: zodCheck.data,
            rawText: lastRawText,
            usage: accumulatedUsage,
            diagnostics: [],
            isTruncated: rawRes.isTruncated || false,
            durationMs: Date.now() - startTime
          };
        }

        const issues = zodCheck.error.issues;
        const errSummary = issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join('; ');
        currentPrompt = `${request.userPrompt}\n\n[ERROR: Your previous JSON failed schema validation: ${errSummary}. Previous output was: ${lastRawText}. Please correct invalid fields and return valid JSON.]`;
      } catch (err: any) {
        if (attempts >= maxAttempts) {
          return {
            success: false,
            rawText: lastRawText,
            usage: accumulatedUsage,
            diagnostics: [{ code: 'PROVIDER_CALL_FAILED', severity: 'ERROR', message: err.message }],
            isTruncated: false,
            durationMs: Date.now() - startTime
          };
        }
      }
    }

    return {
      success: false,
      rawText: lastRawText,
      usage: accumulatedUsage,
      diagnostics: [{ code: 'SCHEMA_REPAIR_EXHAUSTED', severity: 'ERROR', message: 'Schema repair attempts exhausted.' }],
      isTruncated: false,
      durationMs: Date.now() - startTime
    };
  }
}
