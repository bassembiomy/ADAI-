import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCanonicalSysmlProject } from './sysmlCommandGateway';
import { getCachedLegacyView } from '../engine/sysml/normalizedStore';
import { validateSysmlRepository } from '../engine/sysml/validation';
import { deriveIbdView } from '../engine/sysml/ibd';
import { deriveBddView } from '../engine/sysml/bdd';
import { signalTriggerCoverage } from '../engine/sysml/interactionTriggers';
import { projectStateEndpoints } from '../engine/sysml/workers/projectIoPayload';
import type { InteractionDefinition } from '../engine/sysml/model';
import { normalizeHmiComponents } from '../features/hmi/hmiModel';
import {
  createAppSimulationSession,
  setSessionVariableValue,
  stepAppSimulationSession,
  type AppSimulationSession,
} from '../utils/stateMachine/smAppAdapter';

// MR_PLD_ECU.adia is generated from models/mr_pld/MR_PLD_Model.sysml by
// scripts/generate_mr_pld_adia.py + scripts/build_mr_pld_adia.ts; this proves
// the app can open it, its model passes the app's rules, and it runs.
const project = JSON.parse(readFileSync(resolve(__dirname, '../../MR_PLD_ECU.adia'), 'utf8'));
const context = { externalEndpoints: projectStateEndpoints(project.states) };
const repo = loadCanonicalSysmlProject(project, context).repository;

const run = (session: AppSimulationSession, ms: number) => {
  let frame = session.initialFrame;
  for (let t = 0; t < ms; t += project.tickMs) frame = stepAppSimulationSession(session, project.tickMs);
  return frame;
};
const set = (session: AppSimulationSession, values: Record<string, number | boolean>) => {
  for (const [name, value] of Object.entries(values)) setSessionVariableValue(session, name, value);
};

describe('MR_PLD_ECU.adia', () => {
  it('opens in the current model format with no upgrade, errors or quarantined elements', () => {
    const loaded = loadCanonicalSysmlProject(project, context);
    expect(loaded.valid).toBe(true);
    expect(loaded.upgradeReport).toBeUndefined();
    expect(loaded.diagnostics.filter(d => d.severity !== 'info')).toEqual([]);
    expect(loaded.quarantinedConnectorIds).toEqual([]);
    expect(loaded.quarantinedRelationshipIds).toEqual([]);
  });

  it('passes every model rule of the app: repository, all IBD contexts and BDD blocks', () => {
    const findings = [
      ...validateSysmlRepository(repo, context).diagnostics,
      ...Object.values(repo.definitions).filter(d => d.kind === 'block').flatMap(d => deriveIbdView(repo, d.id).diagnostics),
      ...deriveBddView(repo).diagnostics,
    ];
    expect(findings).toEqual([]);
  });

  it('is made of real model elements whose every type reference resolves', () => {
    const kinds: Record<string, number> = {};
    for (const definition of Object.values(repo.definitions)) kinds[definition.kind] = (kinds[definition.kind] ?? 0) + 1;
    expect(kinds).toEqual({ block: 37, interface: 11, signal: 10, valueType: 14, unit: 10, quantityKind: 9, interaction: 1 });
    expect(Object.values(repo.packages).map(p => p.name).sort()).toEqual(['Behavior', 'Items', 'MR_PLD_Model', 'Model', 'Ports', 'Structure', 'Types']);
    for (const definition of Object.values(repo.definitions)) {
      if (definition.kind !== 'block') continue;
      for (const feature of [...definition.properties, ...definition.ports]) {
        expect(repo.definitions[feature.typeId], `${definition.name}.${feature.name}`).toBeDefined();
      }
      for (const port of definition.ports) expect(repo.definitions[port.typeId].kind, `${definition.name}.${port.name}`).toBe('interface');
      for (const signalId of definition.receptions ?? []) expect(repo.definitions[signalId].kind).toBe('signal');
    }
    for (const connector of Object.values(repo.connectors)) {
      if (connector.itemFlowId) expect(repo.definitions[connector.itemFlowId].kind).toBe('interface');
    }
  });

  it('shows every block, part and connector on its BDD/IBD diagram', () => {
    const { store } = loadCanonicalSysmlProject(project, context);
    const count = (id: string) => {
      const view = getCachedLegacyView(store, id);
      return [view.blocks.length, view.relationships.length, view.parts.length, view.connectors.length];
    };
    expect(count('bdd_context')).toEqual([7, 6, 0, 0]);
    expect(count('bdd_ecu')).toEqual([14, 14, 0, 0]);
    expect(count('bdd_engine')).toEqual([8, 7, 0, 0]);
    expect(count('ibd_system')).toEqual([1, 0, 6, 6]);
    expect(count('ibd_ecu')).toEqual([1, 0, 10, 20]);
  });

  it('has a sequence diagram whose signals travel over IBD connectors and drive state machine transitions', () => {
    const interaction = repo.definitions.int_EngineStart as InteractionDefinition;
    expect(repo.diagrams.sd_engine_start.diagramKind).toBe('sequence');
    expect(interaction.lifelines.map(l => l.representsId)).toEqual([
      'blk_Actros_EngineMgmt_System.ignition', 'blk_Actros_EngineMgmt_System.fr',
      'blk_Actros_EngineMgmt_System.mr', 'blk_Actros_EngineMgmt_System.engine',
    ]);
    for (const message of interaction.messages) {
      expect(repo.definitions[message.signatureId!].kind).toBe('signal');
      expect(repo.connectors[message.connectorId!]).toBeDefined();
    }
    const coverage = signalTriggerCoverage(repo, interaction, project.transitions);
    expect(coverage).toHaveLength(7);
    expect(coverage.filter(c => !c.covered)).toEqual([]);
  });

  it('keeps every HMI widget', () => {
    const diagnostics: string[] = [];
    expect(normalizeHmiComponents(project.hmiComponents, diagnostics)).toHaveLength(project.hmiComponents.length);
    expect(diagnostics).toEqual([]);
  });

  it('runs a key-on, crank, drive, engine-brake and shutdown cycle', () => {
    const session = createAppSimulationSession(project);
    expect(session.initialFrame.activeStateIds).toEqual(['st_Off']);

    set(session, { kl15: true, keyValid: true });
    let frame = run(session, 800);
    expect(frame.activeStateIds).toContain('st_Standby');
    expect(frame.data.v_powerLatch).toBe(true);

    set(session, { kl50: true });
    frame = run(session, 50);
    expect(frame.activeStateIds).toContain('st_Crank_SyncSearch');
    expect(frame.data.v_starter).toBe(true);

    set(session, { synced: true });
    frame = run(session, 50);
    expect(frame.activeStateIds).toContain('st_Crank_StartFuel');
    expect(frame.data.v_injMode).toBe(1);

    set(session, { rpm: 600, kl50: false });
    frame = run(session, 50);
    expect(frame.activeStateIds).toEqual(expect.arrayContaining(['st_Running', 'st_Idle']));
    expect(frame.data.v_starter).toBe(false);
    expect(frame.data.v_injMode).toBe(2);

    set(session, { pedal: 40, rpm: 1400 });
    frame = run(session, 50);
    expect(frame.activeStateIds).toContain('st_Drive');
    set(session, { ebReq: true });
    frame = run(session, 50);
    expect(frame.activeStateIds).toContain('st_EngineBrake');
    expect(frame.data.v_pv).toBe(true);
    set(session, { ebReq: false });
    frame = run(session, 50);
    expect(frame.activeStateIds).toContain('st_Drive');
    expect(frame.data.v_pv).toBe(false);

    set(session, { kl15: false, pedal: 0 });
    frame = run(session, 50);
    expect(frame.activeStateIds).toContain('st_Stopping');
    expect(frame.data.v_injMode).toBe(0);
    set(session, { rpm: 0 });
    frame = run(session, 50);
    expect(frame.activeStateIds).toContain('st_AfterRun');
    expect(frame.data.v_dtcStored).toBe(true);
    frame = run(session, 1700);
    expect(frame.activeStateIds).toEqual(['st_Off']);
    expect(frame.data.v_powerLatch).toBe(false);
  });

  it('inhibits the start when the immobiliser key is invalid', () => {
    const session = createAppSimulationSession(project);
    set(session, { kl15: true });
    let frame = run(session, 800);
    expect(frame.activeStateIds).toContain('st_StartInhibit');
    expect(frame.data.v_dtcImmo).toBe(true);
    set(session, { keyValid: true });
    frame = run(session, 50);
    expect(frame.activeStateIds).toContain('st_Standby');
  });
});
