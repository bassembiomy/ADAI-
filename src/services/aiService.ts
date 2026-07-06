// AI Service - n8n Orchestrator and Gemini REST API

const SYSTEM_PROMPT = `
You are the ADIA AI Architect, an expert engineering assistant specialized in MBSE, Control Systems, and Design of Experiments (DOE).
Your goal is to help the user design complex systems and perform statistical modeling using the ADIA Suite.

ADIA Capabilities:
1. Stateflow: Hierarchical state machines with entry/during/exit actions.
2. SysML: BDD and IBD diagram generation.
3. V-Lab & X-Bridges: Physical and signal-based simulation.
4. DOE Module: Professional statistical modeling (RSM, GMDH, Taguchi).

You can return structured commands in your response to modify the project. Use the following JSON format for actions:
{
  "thought": "Brief explanation of your decision",
  "message": "User-facing response",
  "actions": [
    { "type": "CREATE_VARIABLE", "name": "varName", "varType": "int32|float|bool", "value": "0" },
    { "type": "CREATE_STATE", "name": "StateName", "x": 100, "y": 100 },
    { "type": "CONFIGURE_DOE", "modelType": "RSM|GMDH|Taguchi", "factors": [{ "name": "T", "min": 0, "max": 100 }], "response": "Yield" },
    { "type": "RUN_MODEL", "modelType": "RSM|GMDH|Taguchi" },
    { "type": "EXPORT_MODEL", "target": "X-Bridges|V-Lab" }
  ]
}
`;

const N8N_WEBHOOK_URL = (import.meta as any).env.VITE_N8N_WEBHOOK_URL || "";

// New n8n Orchestrator function with automatic fallback and debugging
export async function getN8nAiResponse(prompt: string, context: any, apiKey?: string, history?: any[]): Promise<string> {
  if (!N8N_WEBHOOK_URL) {
    throw new Error("AI Orchestrator URL is not configured. Please check VITE_N8N_WEBHOOK_URL in environment settings.");
  }
  console.log("AI Architect: Calling Orchestrator...");
  
  try {
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        context: {
          ...context,
          appVersion: "2.4",
          module: "DOE_AI_ARCHITECT"
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`n8n Server Error (${response.status}):`, errorText);
      throw new Error(`Orchestrator returned error ${response.status}`);
    }

    const data = await response.json();
    if (typeof data === 'string') return data;
    if (data.chatResponse) return data.chatResponse;
    if (data.message) return data.message;
    if (data.response) return data.response;
    return JSON.stringify(data);
  } catch (err: any) {
    console.warn("n8n Orchestrator unreachable, falling back to local Gemini:", err.message);
    
    // If we have an API key and history, try the local Gemini fallback
    if (apiKey && history) {
      return getAiResponse(apiKey, history, context);
    }
    
    throw new Error(`AI Orchestrator Error: ${err.message}. (Check if your n8n workflow is Active and 'Allowed Origins' is set to *)`);
  }
}

// Existing Gemini REST Service (as fallback)
async function findWorkingModel(apiKey: string): Promise<string> {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!res.ok) throw new Error(`ListModels failed: ${res.status}`);
    const data = await res.json();
    const models = (data.models || []) as { name: string; supportedGenerationMethods: string[] }[];
    const preferred = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"];
    for (const pref of preferred) {
      const found = models.find(m => m.name.includes(pref) && m.supportedGenerationMethods?.includes("generateContent"));
      if (found) return found.name;
    }
    const fallback = models.find((m: any) => m.supportedGenerationMethods?.includes("generateContent"));
    if (fallback) return fallback.name;
    throw new Error("No compatible Gemini model found.");
  } catch (err: any) {
    throw new Error(`Failed to list available models: ${err.message}`);
  }
}

export async function getAiResponse(apiKey: string, history: any[], currentContext: any): Promise<string> {
  const modelName = await findWorkingModel(apiKey);
  const userPrompt = history[history.length - 1].content;
  const fullPrompt = `${SYSTEM_PROMPT}\n\nCurrent Project Context:\n${JSON.stringify(currentContext, null, 2)}\n\nUser Request:\n${userPrompt}`;
  const contents: any[] = [];
  let pastMessages = history.slice(0, -1);
  while (pastMessages.length > 0 && pastMessages[0].role !== 'user') pastMessages.shift();
  for (const msg of pastMessages) contents.push({ role: msg.role === 'user' ? 'user' : 'model', parts: [{ text: msg.content }] });
  contents.push({ role: 'user', parts: [{ text: fullPrompt }] });

  const url = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents, generationConfig: { temperature: 0.7, maxOutputTokens: 2048 } })
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Gemini API Error (${response.status}): ${errBody}`);
  }

  const result = await response.json();
  if (result.candidates && result.candidates.length > 0) {
    const parts = result.candidates[0].content?.parts;
    if (parts && parts.length > 0) return parts.map((p: any) => p.text).join('');
  }
  throw new Error("Empty response from Gemini API.");
}

// Local LM Studio / Custom Local LLM Service
export async function getLocalAiResponse(
  baseUrl: string,
  model: string,
  history: any[],
  currentContext: any
): Promise<string> {
  const url = baseUrl.trim() || "http://localhost:1234/api/v1/chat";
  
  // Format conversation history and context into 'input'
  let inputContent = "";
  if (history && history.length > 1) {
    inputContent += "Previous conversation history:\n";
    for (let i = 0; i < history.length - 1; i++) {
      const role = history[i].role === 'user' ? 'User' : 'Assistant';
      inputContent += `${role}: ${history[i].content}\n`;
    }
    inputContent += "\n";
  }
  
  if (currentContext) {
    inputContent += `Current Project Context:\n${JSON.stringify(currentContext, null, 2)}\n\n`;
  }
  
  inputContent += `User Request: ${history[history.length - 1].content}`;

  console.log("Calling Local LLM at", url, "with model", model || "qwen3-8b");

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || "qwen3-8b",
      system_prompt: SYSTEM_PROMPT,
      input: inputContent
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Local LLM Error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  console.log("Local AI Response Data:", data);

  if (typeof data === 'string') return data;
  if (data.response) return data.response;
  if (data.message) {
    if (typeof data.message === 'string') return data.message;
    if (data.message.content) return data.message.content;
  }
  if (data.choices && data.choices[0]) {
    const choice = data.choices[0];
    if (choice.message && choice.message.content) return choice.message.content;
    if (choice.text) return choice.text;
  }
  if (data.text) return data.text;
  return JSON.stringify(data);
}

// Fetch list of models from LM Studio / Local LLM Endpoint
export async function fetchLocalModels(baseUrl: string): Promise<string[]> {
  try {
    let cleanUrl = baseUrl.trim();
    // Remove the chat endpoint suffix if present to find the base path
    cleanUrl = cleanUrl.replace(/\/api\/v1\/chat\/?$/, '');
    cleanUrl = cleanUrl.replace(/\/v1\/chat\/completions\/?$/, '');
    cleanUrl = cleanUrl.replace(/\/+$/, '');
    
    // Try common endpoints to fetch models list
    for (const path of ['/api/v1/models', '/v1/models', '/models']) {
      try {
        const response = await fetch(`${cleanUrl}${path}`);
        if (!response.ok) continue;
        const data = await response.json();
        if (data && Array.isArray(data.data)) {
          return data.data.map((m: any) => m.id);
        }
      } catch (e) {
        // Try next path
      }
    }
    return [];
  } catch (e) {
    console.warn("Failed to fetch local models:", e);
    return [];
  }
}

