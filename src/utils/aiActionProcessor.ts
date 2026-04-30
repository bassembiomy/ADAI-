import { v4 as uuidv4 } from 'uuid';

export interface AiAction {
  type: 'CREATE_VARIABLE' | 'CREATE_STATE' | 'CREATE_TRANSITION' | 'CREATE_BLOCK';
  name?: string;
  varType?: string;
  value?: string;
  x?: number;
  y?: number;
  entry?: string;
  during?: string;
  exit?: string;
  from?: string;
  to?: string;
  condition?: string;
  action?: string;
  stereotype?: string;
}

export function processAiResponse(responseText: string) {
  try {
    // Attempt to extract JSON from the response (in case AI adds conversational text)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { message: responseText, actions: [] };

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      message: parsed.message || "Actions suggested.",
      actions: (parsed.actions || []) as AiAction[]
    };
  } catch (e) {
    console.error("Failed to parse AI response", e);
    return { message: responseText, actions: [] };
  }
}

export function executeAiActions(
  actions: AiAction[],
  appState: any,
  setters: any
) {
  const { states, variables, junctions, currentLayerId } = appState;
  const { setStates, setVariables, setTransitions, setBlocks, addError } = setters;

  actions.forEach(action => {
    switch (action.type) {
      case 'CREATE_VARIABLE':
        if (action.name && action.varType) {
          const newVar = {
            id: uuidv4(),
            name: action.name,
            type: action.varType as any,
            initialValue: action.value || "0",
            currentValue: action.varType === 'bool' ? (action.value === 'true') : Number(action.value || 0),
            visibleInScope: true
          };
          setVariables((prev: any) => [...prev, newVar]);
          addError('info', `AI Created Variable: ${action.name}`);
        }
        break;

      case 'CREATE_STATE':
        if (action.name) {
          const newState = {
            id: uuidv4(),
            name: action.name,
            x: action.x || 100,
            y: action.y || 100,
            width: 180,
            height: 120,
            entry: action.entry || "",
            during: action.during || "",
            exit: action.exit || "",
            isActive: false,
            parentId: currentLayerId
          };
          setStates((prev: any) => [...prev, newState]);
          addError('info', `AI Created State: ${action.name}`);
        }
        break;

      case 'CREATE_TRANSITION':
        if (action.from && action.to) {
          const source = states.find((s: any) => s.name === action.from) || junctions.find((j: any) => j.name === action.from);
          const target = states.find((s: any) => s.name === action.to) || junctions.find((j: any) => j.name === action.to);
          
          if (source && target) {
            const newTransition = {
              id: uuidv4(),
              sourceId: source.id,
              targetId: target.id,
              condition: action.condition || "",
              action: action.action || "",
              order: 1,
              points: []
            };
            setTransitions((prev: any) => [...prev, newTransition]);
            addError('info', `AI Created Transition: ${action.from} -> ${action.to}`);
          }
        }
        break;
      
      // Additional actions can be added here
    }
  });
}
