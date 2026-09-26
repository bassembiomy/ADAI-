import { EngineeringDomain, StructuredDiagnostic, DiagnosticCategory } from '../contracts/engineeringModel';
import { EngineeringModelAdapter, StoredBlock, StoredConnection } from '../adapters/engineeringModelAdapter';
import { AdiaBlockCatalog } from '../../../agent/adiaBlockCatalog';
import { XbridgesEngine } from '../../../engine/xbridges/XbridgesEngine';
import { convertModelAdapterToXModel } from '../simulation/simulationTools';

export interface ValidationSummary {
  errorCount: number;
  warningCount: number;
  categories: Record<DiagnosticCategory, number>;
}

export interface ModelValidationResult {
  passed: boolean;
  diagnostics: StructuredDiagnostic[];
  summary: ValidationSummary;
}

export interface ModelValidatorOptions {
  catalog?: typeof AdiaBlockCatalog;
  compileResult?: { success: boolean; errors?: string[] };
  simulationResult?: { success: boolean; errors?: string[] };
  checkEngineCompile?: boolean;
}

export class ModelValidator {
  public static validate(
    adapter: EngineeringModelAdapter,
    options?: ModelValidatorOptions
  ): ModelValidationResult {
    const catalog = options?.catalog || AdiaBlockCatalog;
    const diagnostics: StructuredDiagnostic[] = [];
    const blocks = adapter.getAllBlocks();
    const connections = adapter.getAllConnections();

    // 1. Schema Check
    if (blocks.length === 0) {
      diagnostics.push({
        category: 'SCHEMA',
        code: 'EMPTY_MODEL',
        severity: 'ERROR',
        message: 'The model contains no blocks.'
      });
    }

    // 2. Topology Check: verify blocks and connections
    const inConns = new Map<string, StoredConnection[]>();
    const outConns = new Map<string, StoredConnection[]>();

    for (const c of connections) {
      if (!inConns.has(c.toBlockId)) inConns.set(c.toBlockId, []);
      inConns.get(c.toBlockId)!.push(c);

      if (!outConns.has(c.fromBlockId)) outConns.set(c.fromBlockId, []);
      outConns.get(c.fromBlockId)!.push(c);
    }

    for (const block of blocks) {
      const def = catalog.findById(block.blockDefinitionId);
      if (!def) {
        diagnostics.push({
          category: 'TOPOLOGY',
          code: 'UNKNOWN_BLOCK_DEFINITION',
          severity: 'ERROR',
          message: `Block '${block.id}' has unknown definition '${block.blockDefinitionId}'.`,
          entityId: block.id
        });
        continue;
      }

      // Check input ports: critical inverter inputs must not float
      const defIdUpper = block.blockDefinitionId.toUpperCase();
      if (defIdUpper.includes('INVERTER') || defIdUpper.includes('H_BRIDGE')) {
        const inputPorts = def.ports.filter(p => p.direction === 'input');
        const blockInConns = inConns.get(block.id) || [];
        for (const inp of inputPorts) {
          const connected = blockInConns.some(c => c.toPortId === inp.id);
          if (!connected) {
            if (['vdc_p', 'vdc_n', 'ga', 'gb', 'gc', 'g1', 'g2'].includes(inp.id)) {
              diagnostics.push({
                category: 'TOPOLOGY',
                code: 'FLOATING_CRITICAL_PORT',
                severity: 'ERROR',
                message: `Inverter critical input port '${inp.id}' on block '${block.id}' is disconnected (floating).`,
                entityId: block.id,
                portId: inp.id,
                remediation: `Connect a suitable signal or power source to port '${inp.id}'.`
              });
            }
          }
        }
      }

      // 3. Parameter Check
      for (const [pName, pVal] of Object.entries(block.parameters)) {
        if (typeof pVal === 'number') {
          if (pVal < 0 && (pName.toLowerCase().includes('freq') || pName === 'Ron' || pName.toLowerCase().includes('res'))) {
            diagnostics.push({
              category: 'PARAMETER',
              code: 'NEGATIVE_PHYSICAL_PARAMETER',
              severity: 'ERROR',
              message: `Parameter '${pName}' on block '${block.id}' cannot be negative (value: ${pVal}).`,
              entityId: block.id,
              fieldPath: `parameters.${pName}`,
              remediation: `Set '${pName}' to a positive value.`
            });
          }
        }
      }
    }

    // 4. Engineering Check: Inverter requires DC voltage source
    const hasInverter = blocks.some(b => {
      const u = b.blockDefinitionId.toUpperCase();
      return u.includes('INVERTER') || u.includes('H_BRIDGE');
    });

    if (hasInverter) {
      const hasSource = blocks.some(b => {
        const u = b.blockDefinitionId.toUpperCase();
        return u.includes('VOLTAGE') || u.includes('SOURCE') || u.includes('BATTERY') || u === 'CONSTANT';
      });

      if (!hasSource) {
        diagnostics.push({
          category: 'ENGINEERING',
          code: 'MISSING_POWER_SOURCE',
          severity: 'ERROR',
          message: 'Inverter circuit lacks an electrical power source to establish DC rail bus voltage.',
          remediation: 'Add a DC voltage source block (e.g. Constant or dc_voltage).'
        });
      }
    }

    // 5. Compile check
    if (options?.compileResult) {
      if (!options.compileResult.success) {
        for (const err of options.compileResult.errors || ['Compilation failed']) {
          diagnostics.push({
            category: 'COMPILE',
            code: 'MODEL_COMPILE_ERROR',
            severity: 'ERROR',
            message: err
          });
        }
      }
    } else if (options?.checkEngineCompile && adapter.targetDomain === 'xbridges' && blocks.length > 0) {
      try {
        const xModel = convertModelAdapterToXModel(adapter);
        const engine = new XbridgesEngine(xModel);
        const compileDiags = engine.compile(0);
        for (const cd of compileDiags) {
          if (cd.severity === 'error') {
            diagnostics.push({
              category: 'COMPILE',
              code: cd.code || 'MODEL_COMPILE_ERROR',
              severity: 'ERROR',
              message: cd.message,
              entityId: cd.blockIds?.[0]
            });
          }
        }
      } catch (err: any) {
        diagnostics.push({
          category: 'COMPILE',
          code: 'COMPILE_EXCEPTION',
          severity: 'ERROR',
          message: err?.message || 'Engine compilation exception'
        });
      }
    }

    // 6. Simulation check
    if (options?.simulationResult && !options.simulationResult.success) {
      for (const err of options.simulationResult.errors || ['Simulation failed']) {
        diagnostics.push({
          category: 'SIMULATION',
          code: 'SOLVER_CONVERGENCE_ERROR',
          severity: 'ERROR',
          message: err
        });
      }
    }

    const categories: Record<DiagnosticCategory, number> = {
      SCHEMA: 0,
      TOPOLOGY: 0,
      PARAMETER: 0,
      ENGINEERING: 0,
      COMPILE: 0,
      SIMULATION: 0
    };

    let errorCount = 0;
    let warningCount = 0;

    for (const d of diagnostics) {
      if (d.category in categories) {
        categories[d.category]++;
      }
      if (d.severity === 'ERROR') errorCount++;
      if (d.severity === 'WARNING') warningCount++;
    }

    return {
      passed: errorCount === 0,
      diagnostics,
      summary: {
        errorCount,
        warningCount,
        categories
      }
    };
  }
}
