import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AgentPanel } from './AgentPanel';
import { AgentOrchestrator } from '../../agent/agentOrchestrator';
import { LlmProvider, LlmRequest, JsonSchema, LlmResult, LlmHealth } from '../../agent/llmProvider';
import { createTaskState } from '../../agent/requirementState';

class MockLlm implements LlmProvider {
  async generate<T>(_req: LlmRequest, _schema: JsonSchema): Promise<LlmResult<T>> {
    const mockData = {
      intent: 'CREATE_MODEL',
      targetSystem: 'air-fryer',
      summary: 'Air fryer engineering request',
      confidence: 0.95
    };
    return {
      success: true,
      data: mockData as unknown as T,
      rawOutput: JSON.stringify(mockData)
    };
  }
  async health(): Promise<LlmHealth> {
    return { available: true, model: 'llama3:8b (Offline)', latencyMs: 12 };
  }
}

describe('AgentPanel UI Component', () => {
  it('renders project context, inspection-only badge, model selector, and test connection button when open', () => {
    const orchestrator = new AgentOrchestrator(new MockLlm());
    const html = renderToStaticMarkup(
      <AgentPanel
        isOpen={true}
        projectContext={{ projectName: 'AirFryer_ADIA_Demo', activeWorkspace: 'vlab' }}
        orchestrator={orchestrator}
      />
    );

    expect(html).toContain('ADIA Engineering Agent');
    expect(html).toContain('Deterministic inspection-only mode');
    expect(html).toContain('AirFryer_ADIA_Demo');
    expect(html).toContain('Test Ollama connection');
    expect(html).toContain('Select Ollama Model');
    expect(html).toContain('Ask or describe engineering task...');
    expect(html).toContain('adia-agent-panel-container open');
  });

  it('renders toggle button when closed', () => {
    const orchestrator = new AgentOrchestrator(new MockLlm());
    const html = renderToStaticMarkup(
      <AgentPanel
        isOpen={false}
        orchestrator={orchestrator}
      />
    );

    expect(html).toContain('adia-agent-toggle-tab');
    expect(html).toContain('ADIA Agent');
    expect(html).toContain('adia-agent-panel-container closed');
  });

  it('orchestrator clarifies requirements one question at a time before UI transitions', async () => {
    const orchestrator = new AgentOrchestrator(new MockLlm());

    // Turn 1
    const r1 = await orchestrator.handle('Build an air fryer heating model');
    expect(r1.status).toBe('clarifying');
    expect(r1.message).toMatch(/temperature/i);

    // Turn 2
    const r2 = await orchestrator.handle('200°C');
    expect(r2.status).toBe('clarifying');
    expect(r2.message).toMatch(/power/i);

    // Remaining turns to reach specification approval
    await orchestrator.handle('1800W');
    await orchestrator.handle('230V AC');
    await orchestrator.handle('NTC 100k');
    await orchestrator.handle('PID');
    await orchestrator.handle('240°C');
    const rFinal = await orchestrator.handle('Heat to 200°C in under 4 minutes');

    expect(rFinal.status).toBe('awaiting_specification_approval');
    expect(rFinal.pendingApproval).toBeDefined();
    expect(rFinal.pendingApproval?.type).toBe('specification');
  });

  it('orchestrator handles rejection and produces blocked state', async () => {
    const orchestrator = new AgentOrchestrator(new MockLlm());

    await orchestrator.handle('Build air fryer');
    await orchestrator.handle('200°C');
    await orchestrator.handle('1800W');
    await orchestrator.handle('230V AC');
    await orchestrator.handle('NTC 100k');
    await orchestrator.handle('PID');
    await orchestrator.handle('240°C');
    const rSpec = await orchestrator.handle('Heat in < 4 min');

    const reqId = rSpec.pendingApproval!.id;
    const rRej = await orchestrator.reject(reqId, 'User rejected specification');

    expect(rRej.taskState.status).toBe('blocked');
    expect(rRej.message).toContain('rejected by user');
  });

  it('receives and renders active project name, workspace, blocks, nodes, connections, and model state', () => {
    const orchestrator = new AgentOrchestrator(new MockLlm());
    const projectContext = {
      projectName: 'ThermalChamber_V2',
      activeWorkspace: 'xbridges',
      blocksCount: 14,
      nodesCount: 8,
      connectionsCount: 7,
      modelState: {
        diagramMode: 'xbridges',
        statesCount: 3,
        transitionsCount: 4,
        variablesCount: 12
      }
    };

    const html = renderToStaticMarkup(
      <AgentPanel
        isOpen={true}
        projectContext={projectContext}
        orchestrator={orchestrator}
      />
    );

    expect(html).toContain('ThermalChamber_V2');
    expect(html).toContain('Workspace: xbridges');
    expect(html).toContain('Blocks: 14');
    expect(html).toContain('Nodes: 8');
    expect(html).toContain('Connections: 7');
  });

  it('renders individual readiness badges for X-BRIDGES, SysML, Reporting, and Simulation', () => {
    const orchestrator = new AgentOrchestrator(new MockLlm());
    const html = renderToStaticMarkup(
      <AgentPanel
        isOpen={true}
        projectContext={{
          projectName: 'ADIA_Test',
          delegateReadiness: {
            xbridges: true,
            sysml: false,
            report: true,
            simulation: false,
          },
        }}
        orchestrator={orchestrator}
      />
    );

    expect(html).toContain('X-BRIDGES: ● Ready');
    expect(html).toContain('SysML: ○ Unavailable');
    expect(html).toContain('Reporting: ● Ready');
    expect(html).toContain('Simulation: ○ Unavailable');
  });

  it('disables change approval and shows blocked warning when target delegate is unavailable', () => {
    const orchestrator = new AgentOrchestrator(new MockLlm());
    const changeApproval = {
      id: 'app-change-123',
      type: 'change' as const,
      status: 'pending' as const,
      title: 'Instantiate Block',
      description: 'Add GAIN block to X-BRIDGES workspace',
      payload: {
        actionType: 'instantiate_block',
        planId: 'plan-1',
        actionId: 'act-1',
        blockId: 'GAIN',
        params: { blockType: 'GAIN' },
      },
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    };

    const html = renderToStaticMarkup(
      <AgentPanel
        isOpen={true}
        orchestrator={orchestrator}
        initialResponse={{
          status: 'awaiting_change_approval',
          message: 'Please approve block instantiation',
          pendingApproval: changeApproval,
          taskState: createTaskState('Test objective', 'air-fryer'),
        }}
      />
    );

    expect(html).toContain('Approval Required: Instantiate Block');
    expect(html).toContain('Blocked: Delegate for &#x27;instantiate_block&#x27; is unavailable');
    expect(html).toContain('disabled=""');
  });

  it('renders question card, assumptions, plan preview, and diagnostics panels', () => {
    const orchestrator = new AgentOrchestrator(new MockLlm());
    const html = renderToStaticMarkup(
      <AgentPanel
        isOpen={true}
        orchestrator={orchestrator}
        initialResponse={{
          status: 'clarifying',
          message: 'What is the required DC bus voltage (e.g. 400V, 800V)?',
          taskState: createTaskState('Inverter build', 'inverter'),
          specification: {
            id: 'spec-1',
            title: 'Inverter Spec',
            targetSystem: 'three-phase-inverter',
            approved: false,
            requirements: [],
            safetyLimits: [],
            assumptions: ['400V DC bus', '50Hz AC grid frequency']
          },
          executionPlan: {
            id: 'plan-1',
            specificationId: 'spec-1',
            targetWorkspace: 'xbridges',
            actions: [
              {
                id: 'act-1',
                kind: 'instantiate_block',
                title: 'Add Constant block',
                targetWorkspace: 'xbridges',
                params: { blockId: 'dc_src' },
                blockIds: ['dc_src'],
                approvalId: 'app-1',
                expectedEvidence: 'Block instantiated'
              }
            ]
          },
          validationResult: {
            valid: false,
            errors: ['Floating gate input'],
            diagnostics: [
              {
                category: 'TOPOLOGY',
                severity: 'WARNING',
                message: 'Floating gate input detected on inverter'
              }
            ]
          }
        } as any}
      />
    );

    expect(html).toContain('Requirement Clarification');
    expect(html).toContain('What is the required DC bus voltage');
    expect(html).toContain('Engineering Assumptions');
    expect(html).toContain('400V DC bus');
    expect(html).toContain('Plan Preview');
    expect(html).toContain('Add Constant block');
    expect(html).toContain('Diagnostics');
    expect(html).toContain('Floating gate input detected');
  });

  it('renders confirmed requirements, exact block/port plan details, preflight diagnostics, and execution completion', () => {
    const orchestrator = new AgentOrchestrator(new MockLlm());
    const html = renderToStaticMarkup(
      <AgentPanel
        isOpen={true}
        orchestrator={orchestrator}
        initialResponse={{
          status: 'completed',
          message: 'All 16 plan actions executed and verified successfully',
          taskState: createTaskState('Three-Phase Inverter', 'three_phase_inverter'),
          specification: {
            id: 'spec-inv-1',
            title: '3-Phase Inverter Specification',
            targetSystem: 'three_phase_inverter',
            approved: true,
            requirements: [
              { id: 'REQ-001', category: 'electrical', description: 'DC bus input supply voltage', sourceAnswerKey: 'dcBusVoltage', value: '400V' },
              { id: 'REQ-002', category: 'control', description: 'PWM carrier switching frequency', sourceAnswerKey: 'switchingFrequency', value: '10000Hz' }
            ],
            safetyLimits: [],
            assumptions: [
              { key: 'dcLinkFilterCapacitor', value: '1000uF', description: 'Stabilizes DC bus', status: 'approved' },
              { key: 'deadTime', value: '2.0us', description: 'Prevents shoot-through', status: 'approved' }
            ]
          },
          executionPlan: {
            id: 'plan-inv-1',
            specificationId: 'spec-inv-1',
            title: 'Inverter Plan',
            targetSystem: 'three_phase_inverter',
            status: 'approved',
            approved: true,
            actions: [
              {
                id: 'act-1',
                order: 1,
                type: 'instantiate_block',
                title: 'Instantiate DC Voltage Source',
                description: 'Place DC_VOLTAGE_SOURCE',
                blockId: 'DC_VOLTAGE_SOURCE',
                params: { blockId: 'dc_src', blockType: 'DC_VOLTAGE_SOURCE', voltage: 400 },
                dependencies: [],
                affectedArtifacts: [],
                expectedEvidence: '',
                rollbackMetadata: { action: '', params: {} }
              },
              {
                id: 'act-6',
                order: 6,
                type: 'connect_ports',
                title: 'Connect DC Positive Rail',
                description: 'Connect dc_src:v_pos to inv_bridge:vdc_p',
                params: { sourceNodeId: 'dc_src', sourcePortId: 'v_pos', targetNodeId: 'inv_bridge', targetPortId: 'vdc_p' },
                dependencies: [],
                affectedArtifacts: [],
                expectedEvidence: '',
                rollbackMetadata: { action: '', params: {} }
              }
            ]
          },
          preflightResult: {
            passed: true,
            diagnostics: [
              {
                code: 'CANONICAL_TOPOLOGY_VALID',
                category: 'TOPOLOGY',
                severity: 'INFO',
                message: 'All physical ports and bridge connections match canonical catalog'
              }
            ]
          }
        } as any}
      />
    );

    // Confirmed requirements
    expect(html).toContain('Confirmed Requirements');
    expect(html).toContain('DC bus input supply voltage');
    expect(html).toContain('400V');

    // Assumptions formatted properly without [object Object]
    expect(html).toContain('Engineering Assumptions');
    expect(html).toContain('dcLinkFilterCapacitor: 1000uF');
    expect(html).toContain('deadTime: 2.0us');
    expect(html).not.toContain('[object Object]');

    // Exact block and port plan preview
    expect(html).toContain('Plan Preview');
    expect(html).toContain('Instantiate DC Voltage Source');
    expect(html).toContain('Port: dc_src:v_pos → inv_bridge:vdc_p');
    expect(html).toContain('Block: DC_VOLTAGE_SOURCE');

    // Preflight diagnostics
    expect(html).toContain('Preflight Diagnostics');
    expect(html).toContain('CANONICAL_TOPOLOGY_VALID');
    expect(html).toContain('All physical ports and bridge connections match canonical catalog');

    // Execution result
    expect(html).toContain('Execution Completed');
    expect(html).toContain('All 16 plan actions executed and verified successfully');
  });

  it('shows the verified engine run and does not imply unmeasured THD passed', () => {
    const html = renderToStaticMarkup(<AgentPanel isOpen={true} orchestrator={new AgentOrchestrator(new MockLlm())} initialResponse={{
      status: 'completed', message: 'Inverter built', taskState: createTaskState('Inverter', 'three_phase_inverter'),
      simulationResult: { status: 'COMPLETED', domain: 'xbridges', isSupported: true, validationPassed: true, executionTimeMs: 3, engineRunId: 'xbr_run_123', metrics: { vRms: 220 }, diagnostics: [] }
    } as any} />);
    expect(html).toContain('xbr_run_123');
    expect(html).toContain('THD not measured');
  });

  it('renders isolated proof card with engine run id, observables, and catalog fingerprint', () => {
    const html = renderToStaticMarkup(
      <AgentPanel
        isOpen={true}
        orchestrator={new AgentOrchestrator(new MockLlm())}
        initialResponse={{
          status: 'awaiting_plan_approval',
          message: 'Plan proved in isolated worker. Please review and approve.',
          taskState: createTaskState('General Test', 'xbridges'),
          proof: {
            status: 'proved',
            planHash: 'hash_abc123',
            catalogHash: 'cat_fp_456',
            engineRunId: 'eng_run_proof_789',
            diagnostics: [],
            observables: { vOut: 12.0, iPeak: 1.5 }
          },
          pendingApproval: {
            id: 'app_plan_1',
            type: 'plan',
            status: 'pending',
            title: 'Approve Plan',
            description: 'Approve execution plan',
            payload: {},
            createdAt: new Date().toISOString()
          }
        } as any}
      />
    );

    expect(html).toContain('Isolated Plan Proof');
    expect(html).toContain('eng_run_proof_789');
    expect(html).toContain('cat_fp_456');
    expect(html).toContain('vOut');
    expect(html).toContain('12');
  });

  it('renders transaction status and observed delta evidence', () => {
    const html = renderToStaticMarkup(
      <AgentPanel
        isOpen={true}
        orchestrator={new AgentOrchestrator(new MockLlm())}
        initialResponse={{
          status: 'awaiting_change_approval',
          message: 'Action 1 executed. Next action ready.',
          taskState: createTaskState('General Test', 'xbridges'),
          transactionStatus: 'awaiting_action',
          observedDeltas: { addedBlocksCount: 1, modifiedParamsCount: 0 },
          pendingApproval: {
            id: 'app_chg_2',
            type: 'change',
            status: 'pending',
            title: 'Add Capacitor',
            description: 'Place capacitor block',
            payload: {},
            createdAt: new Date().toISOString()
          }
        } as any}
      />
    );

    expect(html).toContain('Transaction Status');
    expect(html).toContain('awaiting_action');
  });
});
