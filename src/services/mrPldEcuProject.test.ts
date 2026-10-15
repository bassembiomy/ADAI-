import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCanonicalSysmlProject } from './sysmlCommandGateway';
import { getCachedLegacyView } from '../engine/sysml/normalizedStore';
import { normalizeHmiComponents } from '../features/hmi/hmiModel';
import {
  createAppSimulationSession,
  setSessionVariableValue,
  stepAppSimulationSession,
  type AppSimulationSession,
} from '../utils/stateMachine/smAppAdapter';

// MR_PLD_ECU.adia is generated from models/mr_pld/MR_PLD_Model.sysml by
// scripts/generate_mr_pld_adia.py + scripts/build_mr_pld_adia.ts; this proves
// the app can open and run it.
const project = JSON.parse(readFileSync(resolve(__dirname, '../../MR_PLD_ECU.adia'), 'utf8'));

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
    const loaded = loadCanonicalSysmlProject(project);
    expect(loaded.valid).toBe(true);
    expect(loaded.upgradeReport).toBeUndefined();
    expect(loaded.diagnostics.filter(d => d.severity !== 'info')).toEqual([]);
    expect(loaded.quarantinedConnectorIds).toEqual([]);
    expect(loaded.quarantinedRelationshipIds).toEqual([]);
    expect(Object.values(loaded.repository.definitions).map(d => d.name)).toEqual(
      expect.arrayContaining(['MR_PLD_ECU', 'OM501LA_Engine', 'Actros_EngineMgmt_System', 'InjectionPowerStage']),
    );
    expect(Object.keys(loaded.repository.connectors)).toHaveLength(33);
  });

  it('shows every block, part and connector on its BDD/IBD diagram', () => {
    const { store } = loadCanonicalSysmlProject(project);
    const count = (id: string) => {
      const view = getCachedLegacyView(store, id);
      return [view.blocks.length, view.relationships.length, view.parts.length, view.connectors.length];
    };
    expect(count('bdd_context')).toEqual([7, 6, 0, 0]);
    expect(count('bdd_ecu')).toEqual([12, 12, 0, 0]);
    expect(count('bdd_engine')).toEqual([8, 7, 0, 0]);
    expect(count('bdd_items_ports')).toEqual([21, 0, 0, 0]);
    expect(count('ibd_context')).toEqual([1, 0, 6, 13]);
    expect(count('ibd_ecu')).toEqual([1, 0, 10, 20]);
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
