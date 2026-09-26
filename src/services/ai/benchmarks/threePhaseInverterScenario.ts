import { AgentOrchestrator } from '../../../agent/agentOrchestrator';
import { ToolGateway } from '../../../agent/toolGateway';
import { AdiaBlockCatalog } from '../../../agent/adiaBlockCatalog';
import { EngineeringModelPlan } from '../contracts/engineeringModel';
import { PlanPreflight } from '../planner/planPreflight';
import { EngineeringModelAdapter } from '../adapters/engineeringModelAdapter';
import { LiveXbridgesModelAdapter } from '../adapters/liveXbridgesModelAdapter';
import {
  createXbridgesDelegate,
  XbridgesAdapter,
  ReactFlowXbridgesNode,
  ReactFlowXbridgesEdge,
} from '../../../agent/toolAdapters/xbridgesAdapter';
import { TransactionManager } from '../execution/transactionManager';
import { InMemoryTransactionJournalStore } from '../execution/transactionJournalStore';
import { CapabilityRegistry } from '../contracts/capabilityRegistry';
import { ModelValidator, ModelValidationResult } from '../validation/modelValidation';
import { RepairLoop, RepairResult } from '../repair/repairLoop';
import { SimulationTools, SimulationResult } from '../simulation/simulationTools';
import { findTemplateForIntent } from '../templates/threePhaseInverter';

export interface BenchmarkMetrics {
  registryResolutionRate: number; // 0.0 to 1.0
  invalidPlanRejectionRate: number; // 0.0 to 1.0
  validationCorrectness: number; // 0.0 to 1.0
  repairMaxAttemptsBoundMet: boolean;
  truthfulReportingVerified: boolean;
  undoVerified: boolean;
  liveAdapterVerified: boolean;
  appFlowVerified: boolean;
}

export interface ScenarioExecutionReport {
  scenarioName: string;
  templateMatched: boolean;
  clarificationTurns: number;
  preflightRejectedHallucination: boolean;
  transactionSuccess: boolean;
  validationResult: ModelValidationResult;
  repairResult: RepairResult;
  simulationResult: SimulationResult;
  undoSuccess: boolean;
  liveAdapterSuccess: boolean;
  appFlowVerified: boolean;
  appFlowError?: string;
  metrics: BenchmarkMetrics;
}

export class ThreePhaseInverterScenarioBenchmark {
  public static async run(): Promise<ScenarioExecutionReport> {
    // 1. Template Matching & Dynamic Clarification
    const requestText = 'Create a three-phase inverter model for motor drive';
    const template = findTemplateForIntent(requestText);
    const templateMatched = Boolean(template && (template.id === 'three_phase_inverter' || template.id === 'three-phase-inverter'));

    let clarificationTurns = 0;

    // 2. Exact Registry Resolution
    const candidateBlocks = [
      'DC_VOLTAGE_SOURCE',
      'VOLTAGE_REFERENCE_GENERATOR',
      'THREE_PHASE_PWM',
      'THREE_PHASE_INVERTER',
      'THREE_PHASE_LOAD',
    ];
    let resolvedCount = 0;
    for (const bId of candidateBlocks) {
      if (AdiaBlockCatalog.findById(bId)) {
        resolvedCount++;
      }
    }
    const registryResolutionRate = resolvedCount / candidateBlocks.length;

    // 3. Preflight Rejection of Hallucinated Blocks and Nonexistent Ports
    const hallucinatedPlan: EngineeringModelPlan = {
      schemaVersion: '1.0.0',
      planId: 'plan_hallucinated',
      projectId: 'proj_bench',
      baseRevision: 1,
      targetDomain: 'xbridges',
      designRationale: 'Test hallucination rejection',
      assumptions: [],
      blocks: [
        {
          id: 'hallucinated_inv',
          blockDefinitionId: 'FANTASY_QUANTUM_INVERTER_9000',
          domain: 'xbridges',
          name: 'Fantasy Inverter',
          parameters: []
        }
      ],
      connections: [],
      validationCriteria: []
    };

    const preflightHallucination = PlanPreflight.preflight(hallucinatedPlan, { currentRevision: 1 });
    const preflightRejectedHallucination = !preflightHallucination.passed;

    // 4. Transactional Build with Canonical Inverter Topology
    const validPlan: EngineeringModelPlan = {
      schemaVersion: '1.0.0',
      planId: 'plan_inv_valid',
      projectId: 'proj_bench',
      baseRevision: 1,
      targetDomain: 'xbridges',
      designRationale: 'Three-phase inverter benchmark synthesis',
      assumptions: ['400V DC bus', '50Hz AC frequency'],
      blocks: [
        {
          id: 'dc_src',
          blockDefinitionId: 'DC_VOLTAGE_SOURCE',
          domain: 'xbridges',
          name: 'DC Bus Source',
          parameters: [{ blockId: 'dc_src', parameterName: 'voltage', value: 400 }]
        },
        {
          id: 'v_ref',
          blockDefinitionId: 'VOLTAGE_REFERENCE_GENERATOR',
          domain: 'xbridges',
          name: 'Sine Voltage Reference',
          parameters: [
            { blockId: 'v_ref', parameterName: 'frequency', value: 50 },
            { blockId: 'v_ref', parameterName: 'amplitude', value: 1 }
          ]
        },
        {
          id: 'pwm_mod',
          blockDefinitionId: 'THREE_PHASE_PWM',
          domain: 'xbridges',
          name: 'SPWM Generator',
          parameters: [
            { blockId: 'pwm_mod', parameterName: 'frequency', value: 10000 },
            { blockId: 'pwm_mod', parameterName: 'method', value: 'SPWM' }
          ]
        },
        {
          id: 'inv_bridge',
          blockDefinitionId: 'THREE_PHASE_INVERTER',
          domain: 'xbridges',
          name: '3-Phase Bridge',
          parameters: [
            { blockId: 'inv_bridge', parameterName: 'Ron', value: 0.01 },
            { blockId: 'inv_bridge', parameterName: 'Vf', value: 0.7 }
          ]
        },
        {
          id: 'ac_load',
          blockDefinitionId: 'THREE_PHASE_LOAD',
          domain: 'xbridges',
          name: '3-Phase AC Load',
          parameters: [{ blockId: 'ac_load', parameterName: 'R', value: 10 }]
        }
      ],
      connections: [
        {
          id: 'c_dc_p',
          fromBlockId: 'dc_src',
          fromPortId: 'v_pos',
          toBlockId: 'inv_bridge',
          toPortId: 'vdc_p',
          domain: 'xbridges'
        },
        {
          id: 'c_dc_n',
          fromBlockId: 'dc_src',
          fromPortId: 'v_neg',
          toBlockId: 'inv_bridge',
          toPortId: 'vdc_n',
          domain: 'xbridges'
        },
        {
          id: 'c_ref_a',
          fromBlockId: 'v_ref',
          fromPortId: 'va',
          toBlockId: 'pwm_mod',
          toPortId: 'va_ref',
          domain: 'xbridges'
        },
        {
          id: 'c_ref_b',
          fromBlockId: 'v_ref',
          fromPortId: 'vb',
          toBlockId: 'pwm_mod',
          toPortId: 'vb_ref',
          domain: 'xbridges'
        },
        {
          id: 'c_ref_c',
          fromBlockId: 'v_ref',
          fromPortId: 'vc',
          toBlockId: 'pwm_mod',
          toPortId: 'vc_ref',
          domain: 'xbridges'
        },
        {
          id: 'c_ga',
          fromBlockId: 'pwm_mod',
          fromPortId: 'ga',
          toBlockId: 'inv_bridge',
          toPortId: 'ga',
          domain: 'xbridges'
        },
        {
          id: 'c_gb',
          fromBlockId: 'pwm_mod',
          fromPortId: 'gb',
          toBlockId: 'inv_bridge',
          toPortId: 'gb',
          domain: 'xbridges'
        },
        {
          id: 'c_gc',
          fromBlockId: 'pwm_mod',
          fromPortId: 'gc',
          toBlockId: 'inv_bridge',
          toPortId: 'gc',
          domain: 'xbridges'
        },
        {
          id: 'c_out_a',
          fromBlockId: 'inv_bridge',
          fromPortId: 'va',
          toBlockId: 'ac_load',
          toPortId: 'va',
          domain: 'xbridges'
        },
        {
          id: 'c_out_b',
          fromBlockId: 'inv_bridge',
          fromPortId: 'vb',
          toBlockId: 'ac_load',
          toPortId: 'vb',
          domain: 'xbridges'
        },
        {
          id: 'c_out_c',
          fromBlockId: 'inv_bridge',
          fromPortId: 'vc',
          toBlockId: 'ac_load',
          toPortId: 'vc',
          domain: 'xbridges'
        }
      ],
      validationCriteria: [
        {
          id: 'crit_thd',
          description: 'THD <= 5%',
          metric: 'THD',
          operator: '<=',
          targetValue: 0.05
        }
      ]
    };

    const adapter = new EngineeringModelAdapter('xbridges');
    const journalStore = new InMemoryTransactionJournalStore();
    const tm = new TransactionManager(new CapabilityRegistry(), new Map([['xbridges', adapter]]), journalStore);

    const txResult = await tm.executeEngineeringPlan(validPlan, 1);
    const transactionSuccess = txResult.success && txResult.newRevision === 2;

    // 5. Post-build Validation
    const validationResult = ModelValidator.validate(adapter);

    // 6. Bounded Repair Evaluation
    // Introduce a bounded fault to test repair
    await adapter.setParameter('inv_bridge', 'Ron', -0.02);
    const repairResult = await RepairLoop.run(adapter, 3);

    // 7. Capability-gated Simulation
    const simulationResult = await SimulationTools.simulateModel(adapter, { domain: 'xbridges' });

    // 8. Live Application Delegate Realization
    let liveAdapterSuccess = false;
    try {
      let liveNodes: ReactFlowXbridgesNode[] = [];
      let liveEdges: ReactFlowXbridgesEdge[] = [];
      const liveDelegate = createXbridgesDelegate({
        getNodes: () => liveNodes,
        getEdges: () => liveEdges,
        setNodes: (updater) => {
          liveNodes = typeof updater === 'function' ? updater(liveNodes) : updater;
        },
        setEdges: (updater) => {
          liveEdges = typeof updater === 'function' ? updater(liveEdges) : updater;
        },
        onSave: () => {},
      });
      let liveRev = 1;
      const liveAdapter = new LiveXbridgesModelAdapter(liveDelegate, {
        projectId: 'proj_bench',
        getRevision: () => liveRev,
        setRevision: (r) => { liveRev = r; }
      });
      const liveApplyResult = await liveAdapter.apply(validPlan);
      liveAdapterSuccess = liveApplyResult.success && liveNodes.length === 5 && liveEdges.length === 11;
    } catch {
      liveAdapterSuccess = false;
    }

    // Run the same orchestrator and delegate action path used by AgentPanel.
    let appFlowVerified = false;
    let appFlowError: string | undefined;
    try {
      let liveNodes: ReactFlowXbridgesNode[] = [];
      let liveEdges: ReactFlowXbridgesEdge[] = [];
      let savedNodes: ReactFlowXbridgesNode[] = [];
      let savedEdges: ReactFlowXbridgesEdge[] = [];
      const delegate = createXbridgesDelegate({
        getNodes: () => liveNodes,
        getEdges: () => liveEdges,
        setNodes: updater => { liveNodes = updater(liveNodes); },
        setEdges: updater => { liveEdges = updater(liveEdges); },
        onSave: (nodes, edges) => { savedNodes = [...nodes]; savedEdges = [...edges]; }
      });
      const gateway = new ToolGateway({ xbridges: delegate } as any);
      const adapter = new XbridgesAdapter(delegate);
      gateway.registerAdapter('instantiate_block', adapter);
      gateway.registerAdapter('connect_ports', adapter);
      gateway.registerAdapter('configure_parameters', adapter);
      const workflow = new AgentOrchestrator(undefined, gateway);
      let response = await workflow.handle(requestText);
      for (const answer of ['400V', '10000Hz', '50Hz']) {
        if (response.status !== 'clarifying') throw new Error('Expected engineering clarification');
        clarificationTurns++;
        response = await workflow.handle(answer);
      }
      if (!response.pendingApproval || response.pendingApproval.type !== 'specification') throw new Error('No specification approval');
      response = await workflow.approve(response.pendingApproval.id);
      if (!response.pendingApproval || response.pendingApproval.type !== 'plan') throw new Error('No plan approval');
      response = await workflow.approve(response.pendingApproval.id);
      while (response.status === 'awaiting_change_approval' && response.pendingApproval) {
        response = await workflow.approve(response.pendingApproval.id);
      }
      const simulationVerified = response.status === 'completed' && response.simulationResult?.status === 'COMPLETED'
        && Boolean(response.simulationResult.engineRunId);
      const stateVerified = liveNodes.length === 5 && liveEdges.length === 11;
      const persistedAtCommit = savedNodes.length === 5 && savedEdges.length === 11;
      const undo = await workflow.undoLastTransaction();
      appFlowVerified = Boolean(simulationVerified && stateVerified && persistedAtCommit
        && undo.success && liveNodes.length === 0 && liveEdges.length === 0 && savedNodes.length === 0 && savedEdges.length === 0);
      if (!appFlowVerified) appFlowError = JSON.stringify({ status: response.status, simulationVerified, stateVerified, persistedAtCommit, undo, nodesAfterUndo: liveNodes.length, edgesAfterUndo: liveEdges.length });
    } catch (error) {
      appFlowVerified = false;
      appFlowError = error instanceof Error ? error.message : String(error);
    }

    // 9. Undo Transaction
    const entries = await journalStore.getEntries('proj_bench');
    const commitRecord = entries.find(e => e.status === 'COMMITTED');
    let undoSuccess = false;
    if (commitRecord) {
      const undoRes = await tm.undoTransaction(commitRecord.transactionId, 'proj_bench');
      undoSuccess = undoRes.success && adapter.getAllBlocks().length === 0;
    }

    const truthfulReportingVerified =
      Boolean(simulationResult.engineRunId && simulationResult.engineRunId.length > 0) &&
      (repairResult.success ? repairResult.unresolvedDiagnostics.length === 0 : true);

    const metrics: BenchmarkMetrics = {
      registryResolutionRate,
      invalidPlanRejectionRate: preflightRejectedHallucination ? 1.0 : 0.0,
      validationCorrectness: validationResult.passed ? 1.0 : 0.0,
      repairMaxAttemptsBoundMet: repairResult.totalAttempts <= 3,
      truthfulReportingVerified,
      undoVerified: undoSuccess,
      liveAdapterVerified: liveAdapterSuccess,
      appFlowVerified,
    };

    return {
      scenarioName: 'ThreePhaseInverterVerticalSlice',
      templateMatched,
      clarificationTurns,
      preflightRejectedHallucination,
      transactionSuccess,
      validationResult,
      repairResult,
      simulationResult,
      undoSuccess,
      liveAdapterSuccess,
      appFlowVerified,
      appFlowError,
      metrics
    };
  }
}
