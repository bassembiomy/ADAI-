import { GoogleGenerativeAI } from "@google/generative-ai";

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

export async function getAiResponse(apiKey: string, history: any[], currentContext: any) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const fullPrompt = `
Current Project State:
${JSON.stringify(currentContext, null, 2)}

User Prompt:
${history[history.length - 1].content}
`;

  const chat = model.startChat({
    history: [
      { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
      { role: "model", parts: [{ text: "Understood. I am ready to assist as your AI Architect. Please provide your design requirements." }] },
      ...history.slice(0, -1).map(h => ({
        role: h.role === "user" ? "user" : "model",
        parts: [{ text: h.content }]
      }))
    ],
  });

  const result = await chat.sendMessage(fullPrompt);
  const response = await result.response;
  return response.text();
}
