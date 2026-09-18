import { EngineeringModelAdapter } from '../adapters/engineeringModelAdapter';
import { ModelValidator, ModelValidationResult } from '../validation/modelValidation';
import { DiagnosticClassifier } from './diagnosticClassifier';
import { StructuredDiagnostic } from '../contracts/engineeringModel';

export interface RepairAttemptLog {
  attemptNumber: number;
  diagnosticsBefore: StructuredDiagnostic[];
  actionsTaken: string[];
  diagnosticsAfter: StructuredDiagnostic[];
  success: boolean;
}

export interface RepairResult {
  success: boolean;
  totalAttempts: number;
  finalValidation: ModelValidationResult;
  history: RepairAttemptLog[];
  unresolvedDiagnostics: StructuredDiagnostic[];
}

export class RepairLoop {
  public static readonly MAX_ATTEMPTS = 3;

  public static async run(
    adapter: EngineeringModelAdapter,
    maxAttempts: number = RepairLoop.MAX_ATTEMPTS
  ): Promise<RepairResult> {
    const history: RepairAttemptLog[] = [];
    let currentValidation = ModelValidator.validate(adapter);

    if (currentValidation.passed) {
      return {
        success: true,
        totalAttempts: 0,
        finalValidation: currentValidation,
        history: [],
        unresolvedDiagnostics: []
      };
    }

    let attempt = 0;
    while (attempt < maxAttempts) {
      attempt++;
      const errors = currentValidation.diagnostics.filter(d => d.severity === 'ERROR');
      if (errors.length === 0) {
        break;
      }

      const classified = errors.map(e => DiagnosticClassifier.classify(e));
      const repairable = classified.filter(c => c.repairability === 'REPAIRABLE' && c.suggestedAction);

      if (repairable.length === 0) {
        history.push({
          attemptNumber: attempt,
          diagnosticsBefore: [...currentValidation.diagnostics],
          actionsTaken: ['No deterministic repair actions available for remaining errors.'],
          diagnosticsAfter: [...currentValidation.diagnostics],
          success: false
        });
        break;
      }

      const actionsTaken: string[] = [];

      for (const item of repairable) {
        const act = item.suggestedAction!;
        if (act.actionType === 'SET_PARAMETER' && act.blockId && act.parameterName !== undefined) {
          await adapter.setParameter(act.blockId, act.parameterName, act.value);
          actionsTaken.push(`Set parameter '${act.parameterName}' on '${act.blockId}' to ${act.value}`);
        } else if (act.actionType === 'ADD_BLOCK') {
          const blockId = act.blockId || 'dc_src_repair';
          const addRes = await adapter.addBlock({
            id: blockId,
            blockDefinitionId: 'Constant',
            domain: adapter.targetDomain,
            name: 'DC Source (Repaired)',
            parameters: [{ blockId, parameterName: 'value', value: 400 }]
          });
          if (addRes.success) {
            actionsTaken.push(`Added missing source block '${blockId}'`);
          }
        } else if (act.actionType === 'CONNECT_PORTS' && act.blockId) {
          const allBlocks = adapter.getAllBlocks();
          const targetBlock = adapter.getBlock(act.blockId);
          if (targetBlock) {
            const portId = item.diagnostic.portId;
            if (portId === 'vdc_p' || portId === 'vdc_n') {
              const src = allBlocks.find(b => b.blockDefinitionId === 'Constant');
              if (src) {
                const connId = `conn_repair_${Date.now()}_${portId}`;
                await adapter.connectPorts({
                  id: connId,
                  fromBlockId: src.id,
                  fromPortId: 'out',
                  toBlockId: targetBlock.id,
                  toPortId: portId,
                  domain: adapter.targetDomain
                });
                actionsTaken.push(`Connected '${src.id}.out' to '${targetBlock.id}.${portId}'`);
              }
            }
          }
        }
      }

      const nextValidation = ModelValidator.validate(adapter);
      history.push({
        attemptNumber: attempt,
        diagnosticsBefore: [...currentValidation.diagnostics],
        actionsTaken,
        diagnosticsAfter: [...nextValidation.diagnostics],
        success: nextValidation.passed
      });

      currentValidation = nextValidation;
      if (currentValidation.passed) {
        return {
          success: true,
          totalAttempts: attempt,
          finalValidation: currentValidation,
          history,
          unresolvedDiagnostics: []
        };
      }
    }

    return {
      success: false,
      totalAttempts: attempt,
      finalValidation: currentValidation,
      history,
      unresolvedDiagnostics: currentValidation.diagnostics.filter(d => d.severity === 'ERROR')
    };
  }
}
