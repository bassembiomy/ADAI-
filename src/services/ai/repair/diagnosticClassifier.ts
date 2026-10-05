import { StructuredDiagnostic } from '../contracts/engineeringModel';

export type Repairability = 'REPAIRABLE' | 'UNREPAIRABLE';

export interface ClassifiedDiagnostic {
  diagnostic: StructuredDiagnostic;
  repairability: Repairability;
  suggestedAction?: {
    actionType: 'SET_PARAMETER' | 'ADD_BLOCK' | 'CONNECT_PORTS' | 'DISCONNECT_PORTS';
    blockId?: string;
    parameterName?: string;
    value?: unknown;
  };
}

export class DiagnosticClassifier {
  public static classify(diag: StructuredDiagnostic): ClassifiedDiagnostic {
    // 1. Negative physical parameters can be fixed deterministically
    if (diag.code === 'NEGATIVE_PHYSICAL_PARAMETER') {
      const paramName = diag.fieldPath?.replace('parameters.', '') || 'Ron';
      return {
        diagnostic: diag,
        repairability: 'REPAIRABLE',
        suggestedAction: {
          actionType: 'SET_PARAMETER',
          blockId: diag.entityId,
          parameterName: paramName,
          value: paramName === 'Ron' ? 0.01 : paramName.toLowerCase().includes('freq') ? 10000 : 1
        }
      };
    }

    // 2. Missing power source can be repaired by injecting a standard DC bus source
    if (diag.code === 'MISSING_POWER_SOURCE' || diag.code === 'MISSING_ENVIRONMENT_REFERENCE') {
      return {
        diagnostic: diag,
        repairability: 'REPAIRABLE',
        suggestedAction: {
          actionType: 'ADD_BLOCK',
          blockId: 'dc_src_repair'
        }
      };
    }

    // 3. Floating critical DC rails on inverter can be repaired by wiring to available DC source
    if (diag.code === 'FLOATING_CRITICAL_PORT') {
      return {
        diagnostic: diag,
        repairability: 'REPAIRABLE',
        suggestedAction: {
          actionType: 'CONNECT_PORTS',
          blockId: diag.entityId
        }
      };
    }

    // Unregistered/hallucinated blocks, parse errors, solver failure require re-planning or clarification
    return {
      diagnostic: diag,
      repairability: 'UNREPAIRABLE'
    };
  }
}
