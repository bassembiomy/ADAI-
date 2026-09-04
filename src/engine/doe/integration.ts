import type {
  DOEModelResult,
  DOEDeploymentModel,
  DOEDiagnostic,
  XBridgesDOENode,
  VLabDOENode,
  BlockExportResult,
  DOEModelType
} from './types';

/**
 * Validates a DOEModelResult or DOEDeploymentModel to ensure it conforms to canonical standards.
 */
export function validateDOEModelResult(
  result: Partial<DOEModelResult> | Partial<DOEDeploymentModel>
): DOEDiagnostic[] {
  const diagnostics: DOEDiagnostic[] = [];

  const modelType = result.modelType as DOEModelType;
  if (!modelType || !['RSM', 'GMDH', 'Taguchi'].includes(modelType)) {
    diagnostics.push({
      code: 'UNSUPPORTED_MODEL_TYPE',
      severity: 'error',
      message: `Model type "${modelType}" is not supported. Supported types: RSM, GMDH, Taguchi.`
    });
  }

  const factorNames = (result as any).factorNames || (result as any).factorOrder;
  if (!factorNames || !Array.isArray(factorNames) || factorNames.length === 0) {
    diagnostics.push({
      code: 'MISSING_FACTORS',
      severity: 'error',
      message: 'Model is missing input factor definitions.'
    });
  } else {
    // Check for duplicate factors
    const seen = new Set<string>();
    for (const factor of factorNames) {
      if (seen.has(factor)) {
        diagnostics.push({
          code: 'DUPLICATE_FACTORS',
          severity: 'error',
          factor,
          message: `Duplicate factor name detected: "${factor}".`
        });
      }
      seen.add(factor);
    }
  }

  const responseName = (result as any).responseName;
  if (!responseName || typeof responseName !== 'string' || responseName.trim() === '') {
    diagnostics.push({
      code: 'MISSING_RESPONSE',
      severity: 'error',
      message: 'Model is missing a valid response output name.'
    });
  }

  // Validate deployment payload if present
  const deployment: Partial<DOEDeploymentModel> | undefined =
    (result as any).deployment || (('schemaVersion' in result) ? (result as any) : undefined);

  if (deployment) {
    if (deployment.schemaVersion !== 1) {
      diagnostics.push({
        code: 'INVALID_SCHEMA_VERSION',
        severity: 'error',
        message: `Expected deployment schemaVersion 1, received ${deployment.schemaVersion}.`
      });
    }

    if (modelType === 'RSM') {
      if (!deployment.rsm) {
        diagnostics.push({
          code: 'MISSING_RSM_PAYLOAD',
          severity: 'error',
          message: 'RSM model is missing rsm deployment coefficients payload.'
        });
      } else {
        if (!Number.isFinite(deployment.rsm.intercept)) {
          diagnostics.push({
            code: 'NON_FINITE_COEFFICIENT',
            severity: 'error',
            message: 'RSM intercept is not a finite number.'
          });
        }
        for (const term of deployment.rsm.terms || []) {
          if (!Number.isFinite(term.coeff)) {
            diagnostics.push({
              code: 'NON_FINITE_COEFFICIENT',
              severity: 'error',
              message: `RSM term coefficient for "${term.name}" is not a finite number.`
            });
          }
        }
      }
    } else if (modelType === 'GMDH') {
      if (!deployment.gmdh || !Array.isArray(deployment.gmdh.layers) || deployment.gmdh.layers.length === 0) {
        diagnostics.push({
          code: 'MISSING_GMDH_PAYLOAD',
          severity: 'error',
          message: 'GMDH model is missing layers payload.'
        });
      } else {
        for (let l = 0; l < deployment.gmdh.layers.length; l++) {
          const layer = deployment.gmdh.layers[l];
          for (let n = 0; n < layer.length; n++) {
            const neuron = layer[n];
            for (const c of neuron.coeffs || []) {
              if (!Number.isFinite(c)) {
                diagnostics.push({
                  code: 'NON_FINITE_COEFFICIENT',
                  severity: 'error',
                  message: `GMDH layer ${l} neuron ${n} has non-finite coefficient: ${c}.`
                });
              }
            }
          }
        }
      }
    } else if (modelType === 'Taguchi') {
      if (!deployment.taguchi) {
        diagnostics.push({
          code: 'MISSING_TAGUCHI_PAYLOAD',
          severity: 'error',
          message: 'Taguchi model is missing taguchi deployment payload.'
        });
      } else {
        if (!Number.isFinite(deployment.taguchi.grandMean)) {
          diagnostics.push({
            code: 'NON_FINITE_COEFFICIENT',
            severity: 'error',
            message: 'Taguchi grand mean is not a finite number.'
          });
        }
      }
    }
  }

  return diagnostics;
}

/**
 * Extracts or builds a DOEDeploymentModel from DOEModelResult or DOEDeploymentModel.
 */
function resolveDeploymentModel(
  input: DOEModelResult | DOEDeploymentModel
): DOEDeploymentModel | null {
  if ('schemaVersion' in input && input.schemaVersion === 1) {
    return input;
  }
  if ('deployment' in input && input.deployment) {
    return input.deployment;
  }
  return null;
}

/**
 * Creates an X-Bridges block from a canonical DOE result.
 */
export function createXBridgesDOEBlock(
  result: DOEModelResult | DOEDeploymentModel,
  nodeId?: string
): BlockExportResult<XBridgesDOENode> {
  const diagnostics = validateDOEModelResult(result);
  const errors = diagnostics.filter(d => d.severity === 'error');
  if (errors.length > 0) {
    return { success: false, diagnostics };
  }

  const deployment = resolveDeploymentModel(result);
  if (!deployment) {
    return {
      success: false,
      diagnostics: [
        {
          code: 'MISSING_DEPLOYMENT_MODEL',
          severity: 'error',
          message: 'DOE result does not have a structured DOEDeploymentModel.'
        }
      ]
    };
  }

  const factorOrder = deployment.factorOrder;
  const responseName = deployment.responseName;
  const id = nodeId || `doe_xb_${Date.now()}`;
  const modelType = deployment.modelType;
  const equation = ('equation' in result && result.equation) ? result.equation : `${responseName} = f_${modelType}(${factorOrder.join(', ')})`;

  const inputs = factorOrder.map((name, i) => ({
    id: `in${i + 1}`,
    name,
    type: 'auto',
    direction: 'input',
    position: 'left',
    value: 0
  }));

  const outputs = [
    {
      id: 'out',
      name: responseName,
      type: 'auto',
      direction: 'output',
      position: 'right',
      value: 0
    }
  ];

  return {
    id,
    type: 'xblock',
    position: { x: 400, y: 300 },
    data: {
      id,
      name: `${modelType} Model`,
      label: `${modelType} Model`,
      type: 'DOE_MODEL',
      modelType,
      equation,
      inputNames: [...factorOrder],
      outputName: responseName,
      deploymentModel: deployment,
      inputs,
      outputs,
      params: {
        equation: { label: 'Equation', value: equation },
        inputNames: { label: 'Inputs', value: [...factorOrder] },
        outputName: { label: 'Output', value: responseName },
        modelType: { label: 'Model', value: modelType },
        deploymentModel: { label: 'Deployment', value: serializeDOEDeploymentModel(deployment) }
      },
      selected: false
    }
  };
}

/**
 * Creates a V-Lab block from a canonical DOE result.
 */
export function createVLabDOEBlock(
  result: DOEModelResult | DOEDeploymentModel,
  nodeId?: string
): BlockExportResult<VLabDOENode> {
  const diagnostics = validateDOEModelResult(result);
  const errors = diagnostics.filter(d => d.severity === 'error');
  if (errors.length > 0) {
    return { success: false, diagnostics };
  }

  const deployment = resolveDeploymentModel(result);
  if (!deployment) {
    return {
      success: false,
      diagnostics: [
        {
          code: 'MISSING_DEPLOYMENT_MODEL',
          severity: 'error',
          message: 'DOE result does not have a structured DOEDeploymentModel.'
        }
      ]
    };
  }

  const factorOrder = deployment.factorOrder;
  const responseName = deployment.responseName;
  const id = nodeId || `doe_vlab_${Date.now()}`;
  const modelType = deployment.modelType;
  const equation = ('equation' in result && result.equation) ? result.equation : `${responseName} = f_${modelType}(${factorOrder.join(', ')})`;

  const ports = [
    ...factorOrder.map((name, i) => ({
      id: `in${i + 1}`,
      label: name,
      type: 'input' as const,
      pos: 'left',
      position: 'left',
      domain: 'General'
    })),
    {
      id: 'out',
      label: responseName,
      type: 'output' as const,
      pos: 'right',
      position: 'right',
      domain: 'General'
    }
  ];

  return {
    id,
    type: 'doe_custom',
    position: { x: 400, y: 300 },
    data: {
      id,
      name: `${modelType} Model`,
      label: `${modelType} Model`,
      type: 'doe_custom',
      color: '#c9a86c', // Gold color for DOE
      deploymentModel: deployment,
      params: {
        equation: { label: 'Model Equation', value: equation, unit: '' },
        modelType: { label: 'Algorithm', value: modelType, unit: '' },
        deploymentModel: { label: 'Deployment', value: serializeDOEDeploymentModel(deployment), unit: '' }
      },
      ports
    }
  };
}

/**
 * Serializes DOEDeploymentModel cleanly to JSON.
 */
export function serializeDOEDeploymentModel(model: DOEDeploymentModel): string {
  return JSON.stringify(model);
}

/**
 * Deserializes JSON string into validated DOEDeploymentModel.
 */
export function deserializeDOEDeploymentModel(json: string): DOEDeploymentModel {
  const parsed = JSON.parse(json);
  const diagnostics = validateDOEModelResult(parsed);
  const errors = diagnostics.filter(d => d.severity === 'error');
  if (errors.length > 0) {
    throw new Error(`Deserialization error: ${errors.map(e => e.message).join('; ')}`);
  }
  return parsed as DOEDeploymentModel;
}
