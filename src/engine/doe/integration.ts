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

  const modelType = ((result as any).modelType || (result as any).type) as DOEModelType;
  if (!modelType || !['RSM', 'GMDH', 'Taguchi'].includes(modelType)) {
    diagnostics.push({
      code: 'UNSUPPORTED_MODEL_TYPE',
      severity: 'error',
      message: `Model type "${modelType}" is not supported. Supported types: RSM, GMDH, Taguchi.`
    });
  }

  const factorNames = (result as any).factorNames
    || (result as any).factorOrder
    || ((result as any).deployment && (result as any).deployment.factorOrder)
    || (Array.isArray((result as any).headers) ? (result as any).headers.slice(0, -1) : undefined);
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

  const responseName = (result as any).responseName
    || ((result as any).deployment && (result as any).deployment.responseName)
    || (Array.isArray((result as any).headers) ? (result as any).headers[(result as any).headers.length - 1] : undefined);
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

    const factorCount = factorNames ? factorNames.length : (deployment.factorOrder?.length || 0);

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
          if (!Array.isArray(term.factors) || !Array.isArray(term.powers)) {
            diagnostics.push({
              code: 'MALFORMED_TERM_PAYLOAD',
              severity: 'error',
              message: `RSM term "${term.name}" has invalid factors or powers array.`
            });
          } else {
            if (term.factors.length !== term.powers.length) {
              diagnostics.push({
                code: 'TERM_LENGTH_MISMATCH',
                severity: 'error',
                message: `RSM term "${term.name}" has factors length ${term.factors.length} != powers length ${term.powers.length}.`
              });
            }
            for (const fIdx of term.factors) {
              if (!Number.isInteger(fIdx) || fIdx < 0 || fIdx >= factorCount) {
                diagnostics.push({
                  code: 'INVALID_FACTOR_INDEX',
                  severity: 'error',
                  message: `RSM term "${term.name}" references invalid factor index ${fIdx} (valid: 0 to ${factorCount - 1}).`
                });
              }
            }
            for (const pwr of term.powers) {
              if (!Number.isInteger(pwr) || pwr < 1) {
                diagnostics.push({
                  code: 'INVALID_TERM_POWER',
                  severity: 'error',
                  message: `RSM term "${term.name}" references non-positive integer power ${pwr}.`
                });
              }
            }
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
        let prevWidth = factorCount;
        for (let l = 0; l < deployment.gmdh.layers.length; l++) {
          const layer = deployment.gmdh.layers[l];
          if (!Array.isArray(layer) || layer.length === 0) {
            diagnostics.push({
              code: 'EMPTY_GMDH_LAYER',
              severity: 'error',
              message: `GMDH layer ${l} has no neurons.`
            });
            continue;
          }
          for (let n = 0; n < layer.length; n++) {
            const neuron = layer[n];
            if (!neuron || !Array.isArray(neuron.inputs) || neuron.inputs.length !== 2) {
              diagnostics.push({
                code: 'INVALID_NEURON_STRUCTURE',
                severity: 'error',
                message: `GMDH layer ${l} neuron ${n} must have exactly 2 input indices.`
              });
            } else {
              for (const inp of neuron.inputs) {
                if (!Number.isInteger(inp) || inp < 0 || inp >= prevWidth) {
                  diagnostics.push({
                    code: 'INVALID_NEURON_INPUT',
                    severity: 'error',
                    message: `GMDH layer ${l} neuron ${n} input index ${inp} out of range (0 to ${prevWidth - 1}).`
                  });
                }
              }
            }
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
          prevWidth = layer.length;
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
        if (!Array.isArray(deployment.taguchi.factorLevels) || deployment.taguchi.factorLevels.length !== factorCount) {
          diagnostics.push({
            code: 'FACTOR_LEVEL_COUNT_MISMATCH',
            severity: 'error',
            message: `Taguchi factor level count (${deployment.taguchi.factorLevels?.length ?? 0}) does not match factor count (${factorCount}).`
          });
        } else {
          for (const fl of deployment.taguchi.factorLevels) {
            if (!fl.levels || !Array.isArray(fl.levels) || fl.levels.length === 0) {
              diagnostics.push({
                code: 'EMPTY_FACTOR_LEVELS',
                severity: 'error',
                factor: fl.factorName,
                message: `Taguchi factor "${fl.factorName}" has no level response data.`
              });
            } else {
              for (const lvl of fl.levels) {
                if (!Number.isFinite(lvl.level) || !Number.isFinite(lvl.meanY)) {
                  diagnostics.push({
                    code: 'NON_FINITE_LEVEL_STATISTIC',
                    severity: 'error',
                    factor: fl.factorName,
                    message: `Taguchi factor "${fl.factorName}" level has non-finite values (level=${lvl.level}, meanY=${lvl.meanY}).`
                  });
                }
              }
            }
          }
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
  if ('canonicalResult' in (input as any) && (input as any).canonicalResult?.deployment) {
    return (input as any).canonicalResult.deployment;
  }
  // Synthesize deployment from legacy result if possible
  const raw = input as any;
  const mType = (raw.modelType || raw.type) as DOEModelType;
  const factorOrder: string[] = raw.factorNames || (Array.isArray(raw.headers) ? raw.headers.slice(0, -1) : []);
  const responseName: string = raw.responseName || (Array.isArray(raw.headers) ? raw.headers[raw.headers.length - 1] : 'Y');

  if (mType === 'RSM') {
    const beta = raw.Beta || raw.details?.Beta || raw.details?.physicalCoefficients;
    if (Array.isArray(beta) && beta.length > 0) {
      const k = factorOrder.length || 1;
      const terms: any[] = [];
      for (let i = 0; i < k; i++) {
        if (beta[i + 1] !== undefined) {
          terms.push({ name: factorOrder[i] || `X${i + 1}`, factors: [i], powers: [1], coeff: beta[i + 1] });
        }
      }
      for (let i = 0; i < k; i++) {
        if (beta[k + 1 + i] !== undefined) {
          terms.push({ name: `${factorOrder[i] || `X${i + 1}`}²`, factors: [i], powers: [2], coeff: beta[k + 1 + i] });
        }
      }
      let cIdx = 2 * k + 1;
      for (let i = 0; i < k; i++) {
        for (let j = i + 1; j < k; j++) {
          if (beta[cIdx] !== undefined) {
            terms.push({ name: `${factorOrder[i] || `X${i + 1}`}·${factorOrder[j] || `X${j + 1}`}`, factors: [i, j], powers: [1, 1], coeff: beta[cIdx] });
            cIdx++;
          }
        }
      }
      return {
        schemaVersion: 1,
        modelType: 'RSM',
        factorOrder,
        responseName,
        trainingRowCount: raw.actuals?.length || 4,
        metrics: { rSquared: raw.rSquared ?? raw.R2 ?? 0 },
        rsm: { intercept: beta[0] || 0, terms }
      };
    }
  } else if (mType === 'GMDH') {
    const gmdhModel = raw.model || raw.details?.model;
    if (gmdhModel && Array.isArray(gmdhModel.layers)) {
      return {
        schemaVersion: 1,
        modelType: 'GMDH',
        factorOrder,
        responseName,
        trainingRowCount: raw.actuals?.length || 5,
        metrics: { rSquared: raw.rSquared ?? raw.R2 ?? 0 },
        gmdh: { polyOrder: gmdhModel.polynomialOrder || 2, layers: gmdhModel.layers }
      };
    }
  } else if (mType === 'Taguchi') {
    const factorLevels = raw.factorLevels || raw.details?.factorLevels;
    if (Array.isArray(factorLevels)) {
      return {
        schemaVersion: 1,
        modelType: 'Taguchi',
        factorOrder,
        responseName,
        trainingRowCount: raw.actuals?.length || 2,
        metrics: { rSquared: raw.rSquared ?? raw.R2 ?? 0 },
        taguchi: {
          grandMean: raw.grandMean ?? raw.details?.grandMeanY ?? 0,
          factorLevels: factorLevels.map((fl: any) => ({
            factorName: fl.factor || fl.factorName,
            levels: (fl.means || []).map((m: any) => ({
              level: m.level,
              meanY: m.meanY,
              snr: m.meanSN ?? m.snr ?? 0
            }))
          }))
        }
      };
    }
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
