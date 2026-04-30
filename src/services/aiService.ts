// AI Service - Direct REST API (No SDK dependency issues)

const SYSTEM_PROMPT = `
You are the ADIA AI Architect, an expert engineering assistant specialized in Model-Based Systems Engineering (MBSE), Stateflow, SysML, and Control Systems.
Your goal is to help the user design complex systems using the ADIA Suite.

ADIA Capabilities:
1. Stateflow: Hierarchical state machines with entry/during/exit actions and conditions.
2. SysML: Block Definition Diagrams (BDD) and Internal Block Diagrams (IBD).
3. V-Lab: Multi-domain physical modeling (Electrical, Mechanical, Thermal).
4. X-Bridges: Signal processing and continuous solvers.

You can return structured commands in your response to modify the project. Use the following JSON format for actions:
{
  "thought": "Brief explanation of your architectural decision",
  "message": "User-facing response",
  "actions": [
    { "type": "CREATE_VARIABLE", "name": "varName", "varType": "int32|float|bool", "value": "0" },
    { "type": "CREATE_STATE", "name": "StateName", "x": 100, "y": 100, "entry": "", "during": "", "exit": "" },
    { "type": "CREATE_TRANSITION", "from": "StateA", "to": "StateB", "condition": "x > 0", "action": "x = 0" },
    { "type": "CREATE_BLOCK", "name": "BlockName", "stereotype": "block|requirement|interface" }
  ]
}

Contextual Knowledge:
- Always prioritize safety and MISRA compliance.
- Suggest best practices for hierarchical state design.
- Use engineering terminology consistent with MATLAB/Simulink.
`;

// Step 1: Discover which models are actually available for this API key
async function findWorkingModel(apiKey: string): Promise<string> {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!res.ok) throw new Error(`ListModels failed: ${res.status}`);
    const data = await res.json();
    const models = (data.models || []) as { name: string; supportedGenerationMethods: string[] }[];
    
    // Find a model that supports generateContent
    const preferred = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"];
    for (const pref of preferred) {
      const found = models.find(
        m => m.name.includes(pref) && m.supportedGenerationMethods?.includes("generateContent")
      );
      if (found) {
        console.log(`AI Architect: Using model ${found.name}`);
        return found.name; // e.g. "models/gemini-2.0-flash"
      }
    }

    // Fallback: use the first model that supports generateContent
    const fallback = models.find((m: any) => m.supportedGenerationMethods?.includes("generateContent"));
    if (fallback) {
      console.log(`AI Architect: Fallback to ${fallback.name}`);
      return fallback.name;
    }

    throw new Error("No compatible Gemini model found for this API key. Available models: " + models.map((m: any) => m.name).join(", "));
  } catch (err: any) {
    throw new Error(`Failed to list available models: ${err.message}`);
  }
}

// Step 2: Call the model using direct REST (no SDK quirks)
export async function getAiResponse(apiKey: string, history: any[], currentContext: any): Promise<string> {
  // Discover the correct model name dynamically
  const modelName = await findWorkingModel(apiKey);

  const userPrompt = history[history.length - 1].content;
  const fullPrompt = `
${SYSTEM_PROMPT}

Current Project Context:
${JSON.stringify(currentContext, null, 2)}

User Request:
${userPrompt}
`;

  // Build the contents array for the API
  const contents: any[] = [];

  // Add chat history (skip leading 'model' messages)
  let pastMessages = history.slice(0, -1);
  while (pastMessages.length > 0 && pastMessages[0].role !== 'user') {
    pastMessages.shift();
  }
  for (const msg of pastMessages) {
    contents.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    });
  }

  // Add the current user message with full context
  contents.push({
    role: 'user',
    parts: [{ text: fullPrompt }]
  });

  // Make the direct REST call
  const url = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${apiKey}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048
      }
    })
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Gemini API Error (${response.status}): ${errBody}`);
  }

  const result = await response.json();
  
  if (result.candidates && result.candidates.length > 0) {
    const parts = result.candidates[0].content?.parts;
    if (parts && parts.length > 0) {
      return parts.map((p: any) => p.text).join('');
    }
  }

  throw new Error("Empty response from Gemini API.");
}
