import { v4 as uuidv4 } from 'uuid';
import { validateInitialValue } from './stateMachineCodeGenerator';

export interface AiAction {
  type: 'CREATE_VARIABLE' | 'CREATE_STATE' | 'CREATE_TRANSITION' | 'CREATE_BLOCK' | 'CONFIGURE_DOE' | 'RUN_MODEL' | 'EXPORT_MODEL';
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
  // DOE fields
  modelType?: 'RSM' | 'GMDH' | 'Taguchi';
  factors?: Array<{ name: string; min: number; max: number; levels?: number[] }>;
  response?: string;
  target?: 'X-Bridges' | 'V-Lab';
}

export function processAiResponse(responseText: string) {
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { message: responseText, actions: [] };

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      message: parsed.message || parsed.chatResponse || "Actions suggested.",
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
  const { 
    setStates, setVariables, setTransitions, addError,
    setFactors, setHeaders, setModelType, calculateRSM, calculateGMDH, calculateTaguchi,
    handleExportToXbridges, handleExportToVLab
  } = setters;

  actions.forEach(action => {
    switch (action.type) {
      case 'CONFIGURE_DOE':
        if (action.factors && action.modelType) {
          setFactors(action.factors.map(f => ({ name: f.name, min: f.min, max: f.max, levels: f.levels || [f.min, f.max] })));
          setHeaders([...action.factors.map(f => f.name), action.response || 'Yield']);
          setModelType(action.modelType);
          addError('info', `AI Configured ${action.modelType} model.`);
        }
        break;

      case 'RUN_MODEL':
        if (action.modelType === 'RSM') calculateRSM();
        else if (action.modelType === 'GMDH') calculateGMDH();
        else if (action.modelType === 'Taguchi') calculateTaguchi();
        addError('info', `AI executing ${action.modelType} analysis...`);
        break;

      case 'EXPORT_MODEL':
        if (action.target === 'X-Bridges') handleExportToXbridges();
        else if (action.target === 'V-Lab') handleExportToVLab();
        addError('info', `AI exporting model to ${action.target}.`);
        break;

      case 'CREATE_VARIABLE':
        if (action.name && action.varType) {
          const initVal = action.value || "0";
          if (validateInitialValue({ type: action.varType as any, initialValue: initVal }) === null) {
            addError('error', `Invalid initial value '${initVal}' for ${action.varType} variable '${action.name}'.`, 'AI Assistant');
            break;
          }
          const newVar = {
            id: uuidv4(),
            name: action.name,
            type: action.varType as any,
            initialValue: initVal,
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

      case 'CREATE_BLOCK':
        // SysML semantics must be created through the visible application
        // workflow and canonical command gateway, never through this legacy
        // simulation action executor.
        addError('warning', 'AI block creation requires the explicit SysML Create New Type workflow.', 'AI Assistant');
        break;
    }
  });
}
