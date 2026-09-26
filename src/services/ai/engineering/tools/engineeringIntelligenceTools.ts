import { XbridgesCapabilityIndex } from '../../catalog/xbridgesCapabilityIndex';
import { canonicalJson, sha256Hex } from '../../../../engine/opm/canonicalHash';
import { validateArchitecturePlan, ArchitecturePlanValidationReport } from '../planning/architecturePlanValidator';
import { ModelIrBuilder } from '../modelIr/modelIrBuilder';
import { EngineeringValidationPipeline, EngineeringValidationReport } from '../modelIr/engineeringValidationPipeline';
import { ConceptToBlockMapper, CapabilityMappingResult } from '../mapping/conceptToBlockMapper';
import { ModelIrCompiler } from '../modelIr/modelIrCompiler';
import {
  ValidateArchitecturePlanInput,
  BuildModelIrInput,
  ValidateModelIrInput,
  MapConceptsInput,
  CompileModelIrInput
} from '../../tools/engineeringToolSchemas';
import { EngineeringModelIR, BoundEngineeringModelIR } from '../contracts/modelIr';
import { EngineeringModelPlanV2 } from '../../contracts/engineeringModel';

export interface ToolExecutionResult<T> {
  success: boolean;
  inputHash: string;
  data: T;
  error?: string;
}

export class EngineeringIntelligenceTools {
  private builder = new ModelIrBuilder();
  private validator = new EngineeringValidationPipeline();
  private mapper = new ConceptToBlockMapper();
  private compiler = new ModelIrCompiler();

  constructor(private catalog: XbridgesCapabilityIndex) {}

  public validateArchitecturePlan(
    input: ValidateArchitecturePlanInput
  ): ToolExecutionResult<ArchitecturePlanValidationReport> {
    const inputHash = sha256Hex(canonicalJson(input));
    const report = validateArchitecturePlan(input.plan);
    return {
      success: true,
      inputHash,
      data: report
    };
  }

  public buildModelIr(
    input: BuildModelIrInput
  ): ToolExecutionResult<EngineeringModelIR> {
    const inputHash = sha256Hex(canonicalJson(input));
    const ir = this.builder.buildModelIr(input.plan, input.modelId, input.baseRevision ?? 0);
    return {
      success: true,
      inputHash,
      data: ir
    };
  }

  public validateModelIr(
    input: ValidateModelIrInput
  ): ToolExecutionResult<EngineeringValidationReport> {
    const inputHash = sha256Hex(canonicalJson(input));
    const report = this.validator.validate(input.ir, {
      catalog: this.catalog,
      checkAlgebraicLoops: input.checkAlgebraicLoops
    });
    return {
      success: true,
      inputHash,
      data: report
    };
  }

  public mapConcepts(
    input: MapConceptsInput
  ): ToolExecutionResult<CapabilityMappingResult> {
    const inputHash = sha256Hex(canonicalJson(input));
    const result = this.mapper.map(input.ir, this.catalog, []);
    return {
      success: true,
      inputHash,
      data: result
    };
  }

  public compileModelIr(
    input: CompileModelIrInput
  ): ToolExecutionResult<EngineeringModelPlanV2> {
    const inputHash = sha256Hex(canonicalJson(input));
    const plan = this.compiler.compile(input.ir as BoundEngineeringModelIR, {
      projectId: input.projectId,
      baseRevision: input.baseRevision,
      catalog: this.catalog
    });
    return {
      success: true,
      inputHash,
      data: plan
    };
  }
}
