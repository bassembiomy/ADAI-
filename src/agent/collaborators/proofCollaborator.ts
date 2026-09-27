import { EngineeringModelPlanV2 } from '../../services/ai/contracts/engineeringModel';
import {
  proveXbridgesPlan,
  ProofOptions,
  XbridgesProof
} from '../../services/ai/proof/xbridgesProofRunner';

export class ProofCollaborator {
  public async provePlan(
    plan: EngineeringModelPlanV2,
    options: ProofOptions = {}
  ): Promise<XbridgesProof> {
    return proveXbridgesPlan(plan, {
      stopTime: 0.1,
      maxSteps: 100,
      ...options
    });
  }
}
