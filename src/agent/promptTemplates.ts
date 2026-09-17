import { LlmRequest } from './llmProvider';

/**
 * Prompt template to parse user intent into structured engineering objective and target system.
 */
export function intentExtractionPrompt(userInput: string): LlmRequest {
  return {
    systemPrompt: `You are the ADIA Engineering Assistant. Analyze the user's engineering request.
Your response MUST be strict JSON matching this structure:
{
  "intent": "CREATE_MODEL" | "MODIFY_MODEL" | "SIMULATE" | "VALIDATE" | "UNKNOWN",
  "targetSystem": string,
  "summary": string,
  "detectedInputs": Record<string, string>,
  "confidence": number
}
Do NOT include explanations outside the JSON object.`,
    prompt: `User Request: "${userInput}"`
  };
}

/**
 * Prompt template to formulate exactly ONE focused clarification question.
 */
export function questionGenerationPrompt(
  targetSystem: string,
  missingOrConflictingItems: string[]
): LlmRequest {
  const itemsList = missingOrConflictingItems.map(item => `- ${item}`).join('\n');
  return {
    systemPrompt: `You are the ADIA Engineering Assistant clarifying requirements for: ${targetSystem}.
Rules:
1. You must ask exactly ONE focused question addressing the highest priority missing or conflicting item.
2. If suggesting an engineering default, you must clearly frame it as a recommendation requiring user approval.
3. Response MUST be strict JSON:
{
  "key": string,
  "question": string,
  "recommendedDefault"?: string,
  "rationale": string
}
Do NOT include markdown formatting or commentary outside the JSON.`,
    prompt: `Target System: ${targetSystem}\nUnresolved Items:\n${itemsList}\n\nGenerate the next single focused clarification question.`
  };
}

/**
 * Prompt template to summarize gathered requirements into a structured specification draft.
 */
export function specificationDraftPrompt(
  targetSystem: string,
  gatheredInputs: Record<string, unknown>,
  approvedAssumptions: unknown[]
): LlmRequest {
  return {
    systemPrompt: `You are the ADIA Engineering Assistant drafting a formal engineering specification.
Response MUST be strict JSON:
{
  "title": string,
  "system": string,
  "subsystems": Array<{ name: string, description: string, keyParameters: Record<string, string> }>,
  "functionalRequirements": string[],
  "safetyLimits": string[],
  "simulationCriteria": string[],
  "summary": string
}
Do NOT include markdown or text outside JSON.`,
    prompt: `System: ${targetSystem}
Inputs: ${JSON.stringify(gatheredInputs, null, 2)}
Approved Assumptions: ${JSON.stringify(approvedAssumptions, null, 2)}`
  };
}

/**
 * Prompt template to explain an ADIA block proposal or engineering default to the user.
 */
export function proposalExplanationPrompt(item: string, context: string): LlmRequest {
  return {
    systemPrompt: `You are the ADIA Engineering Assistant. Explain a proposed engineering component or default concisely.
Response MUST be strict JSON:
{
  "item": string,
  "explanation": string,
  "impact": string,
  "requiresApproval": true
}`,
    prompt: `Proposed Item: "${item}"\nContext: "${context}"`
  };
}
