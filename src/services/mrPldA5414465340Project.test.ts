import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCanonicalSysmlProject } from './sysmlCommandGateway';
import { validateSysmlRepository } from '../engine/sysml/validation';
import { deriveIbdView } from '../engine/sysml/ibd';
import { deriveBddView } from '../engine/sysml/bdd';
import { signalTriggerCoverage } from '../engine/sysml/interactionTriggers';
import { projectStateEndpoints } from '../engine/sysml/workers/projectIoPayload';
import type { BlockDefinition, InteractionDefinition } from '../engine/sysml/model';
import { normalizeHmiComponents } from '../features/hmi/hmiModel';
import { generateMISRACCode } from '../utils/stateMachineCodeGenerator';
import {
  createAppSimulationSession,
  setSessionVariableValue,
  stepAppSimulationSession,
  type AppSimulationSession,
} from '../utils/stateMachine/smAppAdapter';

// MR_PLD_A5414465340.adia is generated from models/mr_pld_a5414465340/MR_PLD_A5414465340.sysml by
// scripts/build_mr_pld_a5414465340_adia.ts; this proves the app opens it, its model passes the app's
// rules, it uses only the source's blocks, and its state machine reproduces the source's simulation.
const ROOT = resolve(__dirname, '../..');
const project = JSON.parse(readFileSync(resolve(ROOT, 'MR_PLD_A5414465340.adia'), 'utf8'));
const source = readFileSync(resolve(ROOT, 'models/mr_pld_a5414465340/MR_PLD_A5414465340.sysml'), 'utf8');
const simResults = JSON.parse(readFileSync(resolve(ROOT, 'models/mr_pld_a5414465340/sim_out/results.json'), 'utf8'));
const context = { externalEndpoints: projectStateEndpoints(project.states) };
const repo = loadCanonicalSysmlProject(project, context).repository;
const blocks = Object.values(repo.definitions).filter((d): d is BlockDefinition => d.kind === 'block');
const ABSTRACT = ['blk_ElectronicComponent', 'blk_EngineSensor'];

// ------------------------------------------------------------ simulation helpers
const step = (session: AppSimulationSession, ms = 1) => {
  let frame = stepAppSimulationSession(session, project.tickMs);
  for (let t = project.tickMs; t < ms; t += project.tickMs) frame = stepAppSimulationSession(session, project.tickMs);
  return frame;
};
const set = (session: AppSimulationSession, values: Record<string, number | boolean>) => {
  for (const [name, value] of Object.entries(values)) setSessionVariableValue(session, name, value);
};
/** A Signal: true for one tick, then discarded (UML: an event nobody accepts is lost). */
const fire = (session: AppSimulationSession, signal: string) => {
  setSessionVariableValue(session, signal, true);
  const frame = step(session);
  setSessionVariableValue(session, signal, false);
  return step(session);
};
const leaf = (frame: { activeStateIds: string[] }) => frame.activeStateIds.filter(id => id.startsWith('ST_') && id !== 'ST_RUN');

/** mrpld_sim.py run_scenario(): the same stimulus sequence, on the ADIA state machine. */
function runScenario(s: Record<string, string>) {
  const session = createAppSimulationSession(project);
  set(session, { coolantC: Number(s.coolantC) });
  let frame = step(session);
  if (s.keyState === 'OFF') return { session, frame };
  frame = fire(session, 'KL15_On');
  set(session, { immoValid: s.immoValid === 'true' ? 1 : 0 });
  frame = fire(session, s.immoValid === 'true' ? 'SelfTestPassed' : 'ImmoRejected');
  if (s.keyState === 'IGN') return { session, frame };
  frame = fire(session, 'KL50_CrankRequest');
  set(session, { rpm: 220 });
  if (s.keyState === 'CRANK') return { session, frame: step(session) };
  set(session, { rpm: 650 });
  frame = fire(session, 'EngineRunning');
  set(session, { rpm: 600 + Number(s.pedalPct) * 13 });
  if (s.keyState === 'BRAKE') frame = fire(session, 'EngineBrakeRequest');
  // the SyncSupervisor region raises CkpLost / CmpLost / SyncLost from the sensor validity
  set(session, { ckpValid: s.ckpValid === 'true' ? 1 : 0, cmpValid: s.cmpValid === 'true' ? 1 : 0 });
  frame = step(session, 5);
  // the ThermalFanControl region raises OvertempDetected from the coolant temperature
  frame = step(session, 5);
  if (s.bank1Short === 'true') frame = fire(session, 'BankShortDetected');
  if (s.canValid === 'false') frame = fire(session, 'CanTimeout');
  return { session, frame };
}
const SCENARIOS = [...source.matchAll(/part (scn\d+_\w+) : SimulationScenario \{ (.*?) \}/g)].map(m => ({
  name: m[1], ...Object.fromEntries([...m[2].matchAll(/:>> (\w+) = ([^;]+);/g)].map(f => [f[1], f[2].replace(/"/g, '').replace('KeyState::', '')])),
}) as Record<string, string>);


/** The rules of the app's Validate button (App.tsx performValidation) for the state machine, as a list of findings. */
function appValidationFindings(p: typeof project): string[] {
  const { states, transitions, variables, layers } = p;
  const findings: string[] = [];
  const declared = new Set(variables.map((v: { name: string }) => v.name));
  const keywords = new Set(['Math', 'true', 'false', 'null', 'undefined', 'if', 'else', 'return', 'context']);
  const words = (code: string) => code.match(/\b[a-zA-Z_]\w*\b/g) ?? [];
  const nameOf = (id: string) => states.find((x: { id: string }) => x.id === id)?.name ?? id;
  const code = (text: string, where: string, isCondition: boolean) => {
    if (!text?.trim()) return;
    for (const word of words(text)) if (!declared.has(word) && !keywords.has(word)) findings.push(`unknown identifier ${word} in ${where}`);
    if (isCondition && /(?<![=!<>+\-*/])=(?![=])/.test(text)) findings.push(`assignment in ${where}`);
    if (!isCondition) for (const stmt of text.split(';').map(x => x.trim()).filter(Boolean)) {
      if (/^[\w.]+\s*(===|==|!==|!=|<|>|<=|>=)\s*[^=]+$/.test(stmt)) findings.push(`comparison as action in ${where}`);
    }
    try { new Function('context', isCondition ? `with(context) { return (${text}); }` : `with(context) { ${text} }`); } catch { findings.push(`syntax error in ${where}`); }
  };
  for (const st of states) {
    for (const part of ['entry', 'during', 'exit'] as const) code(st[part], `${st.name} ${part}`, false);
    for (const line of (st.internalTransitions ?? '').split('\n').filter((l: string) => l.trim())) code(/^\[(.*?)\]/.exec(line)?.[1] ?? '', `${st.name} internal`, true);
    if (/\s/.test(st.name)) findings.push(`state name with spaces: ${st.name}`);
  }
  const names = states.map((x: { name: string }) => x.name);
  for (const n of new Set(names)) if (names.filter((m: string) => m === n).length > 1) findings.push(`duplicate state name ${n}`);
  for (const t of transitions) {
    code(t.action, `transition ${t.id} action`, false);
    code(t.condition, `transition ${t.id} condition`, true);
    if (!states.some((x: { id: string }) => x.id === t.targetId)) findings.push(`undefined target ${t.id}`);
    const unguarded = !t.condition?.trim() || t.condition.trim() === 'true';
    if (unguarded && (t.afterTicks == null || t.afterTicks <= 0 || t.type === 'condition')) findings.push(`unguarded untimed ${t.id}`);
    const target = states.find((x: { id: string }) => x.id === t.targetId);
    const resets = new Set(Array.from(`${t.action}${target?.entry ?? ''}`.matchAll(/\b([a-zA-Z_]\w*)\s*=\s*(?:false|0)\b/g)).map(m => m[1]));
    for (const word of words(t.condition)) {
      if (variables.some((v: { name: string; type: string }) => v.name === word && v.type === 'bool') && !resets.has(word)) findings.push(`level-triggered ${word} in ${t.id}`);
    }
  }
  for (const layer of layers) {
    const inLayer = states.filter((x: { id: string }) => layer.id === 'root'
      ? !layers.some((l: { id: string; stateIds: string[] }) => l.id !== 'root' && l.stateIds.includes(x.id)) : layer.stateIds.includes(x.id));
    const auto = inLayer.filter((x: { autostart: boolean }) => x.autostart).length;
    if (inLayer.length && (auto === 0 || (auto > 1 && !inLayer.every((x: { isParallel: boolean }) => x.isParallel)))) findings.push(`autostart ${layer.id}`);
  }
  const bySource = new Map<string, Array<{ type: string; condition: string; afterTicks: number | null; order: number }>>();
  for (const t of transitions) bySource.set(t.sourceId, [...(bySource.get(t.sourceId) ?? []), t]);
  for (const [source, list] of bySource) {
    const keys = list.map(t => `${t.type}|${t.condition}|${t.afterTicks}`);
    if (new Set(keys).size < keys.length) findings.push(`conflicting transitions from ${nameOf(source)}`);
    const orders = list.map(t => t.order);
    if (new Set(orders).size < orders.length) findings.push(`same priority from ${nameOf(source)}`);
  }
  const reached = new Set<string>(states.filter((x: { autostart: boolean }) => x.autostart).map((x: { id: string }) => x.id));
  for (let grew = true; grew;) {
    grew = false;
    for (const t of transitions) if (reached.has(t.sourceId) && !reached.has(t.targetId)) { reached.add(t.targetId); grew = true; }
  }
  for (const st of states) {
    if (!reached.has(st.id)) findings.push(`unreachable ${st.name}`);
    if (!transitions.some((t: { sourceId: string }) => t.sourceId === st.id) && !(st.internalTransitions ?? '').trim() && !st.isSafeState && !st.isTerminalState) findings.push(`dead end ${st.name}`);
  }
  const generated = generateMISRACCode({ tickMs: p.tickMs, states, junctions: p.junctions, transitions, variables, layers, safetyMode: p.safetyMode, hilConfig: { enabled: false, mappings: [], channels: [] } } as never);
  for (const error of generated.errors ?? []) findings.push(`code generator: ${error.message}`);
  if (!generated.files.length) findings.push('code generator produced no files');
  return findings;
}

describe('MR_PLD_A5414465340.adia', () => {
  it('opens in the current model format with no upgrade, errors or quarantined elements', () => {
    const loaded = loadCanonicalSysmlProject(project, context);
    expect(loaded.valid).toBe(true);
    expect(loaded.upgradeReport).toBeUndefined();
    expect(loaded.diagnostics.filter(d => d.severity !== 'info' && d.code !== 'ABSTRACT_INSTANTIATION')).toEqual([]);
    expect(loaded.quarantinedConnectorIds).toEqual([]);
    expect(loaded.quarantinedRelationshipIds).toEqual([]);
  });

  it('loads and validates cleanly without the state machine too (the path the Report takes)', () => {
    const plain = loadCanonicalSysmlProject(project);
    expect(plain.diagnostics.filter(d => d.severity !== 'info')).toEqual([]);
    expect(validateSysmlRepository(plain.repository).diagnostics.filter(d => d.code !== 'ABSTRACT_INSTANTIATION')).toEqual([]);
    // every relationship joins two elements of the SysML repository
    const known = (id: string) => [repo.definitions, repo.requirements, repo.verificationCases, repo.useCases, repo.actors, repo.subjects, repo.packages, repo.diagrams]
      .some(collection => Boolean(collection[id])) || Object.values(repo.definitions).some(d => (d.kind === 'block' && [...d.properties, ...d.ports].some(f => f.id === id))
      || (d.kind === 'interaction' && false) || (d.kind === 'activity' && (d.nodes.some(n => n.id === id))));
    for (const relationship of Object.values(repo.relationships)) {
      expect(known(relationship.sourceId), `${relationship.id} source`).toBe(true);
      expect(known(relationship.targetId), `${relationship.id} target`).toBe(true);
    }
  });

  it('shows only real model elements on every diagram: IBD parts are block properties, ports and connectors of the context', () => {
    const { store } = loadCanonicalSysmlProject(project, context);
    const presentations = Object.fromEntries(store.diagramPresentations.entries());
    const properties = new Map(blocks.flatMap(b => [...b.properties, ...b.ports].map(f => [f.id, b.id] as const)));
    const activityNodes = new Set(Object.values(repo.definitions).flatMap(d => (d.kind === 'activity' ? d.nodes.map(n => n.id) : [])));
    const isElement = (id: string) => Boolean(repo.definitions[id] || repo.requirements[id] || repo.verificationCases[id] || repo.useCases[id]
      || repo.actors[id] || repo.subjects[id] || repo.packages[id] || repo.connectors[id] || repo.relationships[id]) || activityNodes.has(id);
    for (const [diagramId, presentation] of Object.entries(presentations)) {
      const diagram = repo.diagrams[diagramId];
      expect(diagram, diagramId).toBeDefined();
      for (const id of presentation.elementIds ?? []) {
        if (diagram.diagramKind === 'ibd') {
          // the context block itself (the diagram frame), a part of it, a nested part path under it, or one of its connectors
          const lastProperty = id.split('/').pop()!;
          const ok = id === diagram.contextElementId || repo.connectors[id]?.ownerId === diagram.contextElementId
            || (properties.has(lastProperty) && id.split('/')[0].startsWith(`${diagram.contextElementId}.`));
          expect(ok, `${diagramId}: ${id}`).toBe(true);
        } else if (diagram.diagramKind === 'parametric') {
          expect(properties.get(id), `${diagramId}: ${id}`).toBe(diagram.contextElementId);
        } else {
          expect(isElement(id), `${diagramId}: ${id}`).toBe(true);
        }
      }
    }
  });

  it('passes every model rule of the app; the only notes are the guidance on the two abstract part defs', () => {
    const findings = [
      ...validateSysmlRepository(repo, context).diagnostics,
      ...blocks.flatMap(d => deriveIbdView(repo, d.id).diagnostics),
      ...deriveBddView(repo).diagnostics,
    ];
    expect(findings.map(d => [d.severity, d.code, d.elementId])).toEqual(ABSTRACT.map(id => ['warning', 'ABSTRACT_INSTANTIATION', id]));
  });

  it('uses exactly the part defs of the source as blocks: none added, none missing', () => {
    const partDefs = [...source.matchAll(/^\s*(?:abstract |variation )?part def (\w+)/gm)].map(m => m[1]);
    // Driver (package Interactions) is a human participant: the Actor of the use cases and sequence diagrams.
    expect(blocks.map(b => b.name).sort()).toEqual(partDefs.filter(name => name !== 'Driver').sort());
    expect(repo.actors.actor_Driver).toBeDefined();
    expect(blocks.filter(b => b.isAbstract).map(b => b.id).sort()).toEqual(ABSTRACT);
    for (const block of blocks) {
      for (const feature of [...block.properties, ...block.ports]) expect(repo.definitions[feature.typeId], `${block.name}.${feature.name}`).toBeDefined();
      for (const signal of block.receptions ?? []) expect(repo.definitions[signal].kind).toBe('signal');
    }
  });

  it('models all 71 connector pins and every connect of the source IBDs', () => {
    const ecu = repo.definitions.blk_MR_PLD_ECU as BlockDefinition;
    expect(ecu.ports.filter(p => p.ownerPortId === 'blk_MR_PLD_ECU.x1')).toHaveLength(16);
    expect(ecu.ports.filter(p => p.ownerPortId === 'blk_MR_PLD_ECU.x2')).toHaveLength(55);
    const count = (body: string) => [...body.matchAll(/^\s*(connect|interface : )/gm)].length;
    const engineSystem = source.slice(source.indexOf('part engineSystem'), source.indexOf('package Parametrics'));
    const mrPld = source.slice(source.indexOf('part mrPld'), source.indexOf('part engineSystem'));
    const owned = (owner: string) => Object.values(repo.connectors).filter(c => c.ownerId === owner && c.kind !== 'binding');
    expect(owned('blk_OM501LA_EngineSystem')).toHaveLength(count(engineSystem));
    // the source connects plus the 8 pin -> driver delegations taken from the pin functions
    expect(owned('blk_MR_PLD_ECU')).toHaveLength(count(mrPld) + 8);
    expect(Object.values(repo.connectors).filter(c => c.itemFlowId).length).toBeGreaterThanOrEqual(8);
  });

  it('gives every block a requirements diagram with the requirements it satisfies', () => {
    for (const block of blocks) {
      const diagram = repo.diagrams[`req_blk_${block.name}`];
      expect(diagram?.diagramKind, block.name).toBe('requirements');
      const shown = new Set(project.diagramPresentations[diagram.id].elementIds as string[]);
      const satisfied = Object.values(repo.relationships).filter(r => r.kind === 'satisfy' && r.sourceId === block.id).map(r => r.targetId);
      expect(satisfied.length, block.name).toBeGreaterThan(0);
      expect(shown.has(block.id)).toBe(true);
      for (const id of satisfied) expect(shown.has(id), `${block.name} -> ${id}`).toBe(true);
    }
  });

  it('traces every requirement: top-level ones are contained, satisfied, refined by a use case and verified; derived ones derive and are satisfied', () => {
    const rels = Object.values(repo.relationships);
    const has = (kind: string, target: string, source?: string) => rels.some(r => r.kind === kind && r.targetId === target && (!source || r.sourceId === source));
    const top = [...source.matchAll(/requirement def <'([^']+)'>/g)].map(m => `req_${m[1].replace(/[^A-Za-z0-9]/g, '_')}`);
    expect(top).toHaveLength(12);
    for (const id of top) {
      expect(has('requirementContainment', id, 'req_REQ_SPEC_00'), id).toBe(true);
      expect(has('satisfy', id, 'blk_MR_PLD_ECU'), id).toBe(true);
      expect(has('useCaseRefine', id), id).toBe(true);
      expect(has('verify', id), id).toBe(true);
    }
    for (const requirement of Object.values(repo.requirements)) {
      if (requirement.id === 'req_REQ_SPEC_00') continue;
      expect(has('satisfy', requirement.id), requirement.requirementId).toBe(true);
      if (requirement.requirementId.includes('.')) expect(rels.some(r => r.kind === 'deriveReqt' && r.sourceId === requirement.id), requirement.requirementId).toBe(true);
    }
    // the 14 simulation scenarios are verification cases
    for (const s of SCENARIOS) expect(repo.verificationCases[`vc_${s.name}`]?.method).toBe('Simulation');
  });

  it('has a use case diagram of the MR_PLD_ECU subject whose every use case has an actor or is included / extended', () => {
    expect(repo.diagrams.uc_01_mr_pld.diagramKind).toBe('useCase');
    expect(repo.subjects.subject_MR_PLD_ECU.realizedByBlockId).toBe('blk_MR_PLD_ECU');
    const rels = Object.values(repo.relationships);
    for (const useCase of Object.values(repo.useCases)) {
      expect(useCase.subjectId).toBe('subject_MR_PLD_ECU');
      const linked = rels.some(r => (r.kind === 'useCaseAssociation' && r.targetId === useCase.id)
        || (['include', 'extend', 'useCaseGeneralization'].includes(r.kind) && (r.sourceId === useCase.id || r.targetId === useCase.id)));
      expect(linked, useCase.name).toBe(true);
    }
  });

  it('has sequence diagrams whose messages are Signals over real IBD connectors and drive state machine transitions', () => {
    const interactions = Object.values(repo.definitions).filter((d): d is InteractionDefinition => d.kind === 'interaction');
    expect(interactions).toHaveLength(8);
    for (const interaction of interactions) {
      expect(Object.values(repo.diagrams).some(d => d.diagramKind === 'sequence' && d.ownerId === interaction.id)).toBe(true);
      for (const message of interaction.messages) {
        expect(repo.definitions[message.signatureId!].kind).toBe('signal');
        if (message.connectorId) expect(repo.connectors[message.connectorId], message.id).toBeDefined();
      }
      // every signal received in a named state that is not plain data triggers a transition of that state
      const dataOnly = new Set(['ImmoReleaseFrame', 'TorqueRequestFrame', 'VrToothPulse', 'ElectricalPower', 'FaultRecord']);
      const uncovered = signalTriggerCoverage(repo, interaction, project.transitions).filter(c => !c.covered && !dataOnly.has(c.signalName));
      // the immobiliser scenario shows the crank request being ignored while the start is locked
      const ignoredOnPurpose = (c: { signalName: string; stateId: string }) => c.signalName === 'KL50_CrankRequest' && c.stateId === 'ST_IMMO_LOCKED';
      expect(uncovered.filter(c => !ignoredOnPurpose(c)), interaction.name).toEqual([]);
    }
    expect(project.transitions.filter((t: { sourceId: string; condition: string }) => t.sourceId === 'ST_IMMO_LOCKED' && t.condition.includes('KL50'))).toEqual([]);
    const crank = repo.definitions.int_SD_Crank_Auth_PeakHold_Injection as InteractionDefinition;
    expect(crank.uses?.[0].refersToId).toBe('int_ECU_Start_Injection');
  });

  it("passes the app's Validate button with no error or warning, and generates MISRA C code", () => {
    expect(appValidationFindings(project)).toEqual([]);
    for (const state of project.states) expect(state.name, state.id).toMatch(/^[A-Za-z_]\w*$/);
    expect(project.states.filter((st: { isSafeState?: boolean }) => st.isSafeState).map((st: { id: string }) => st.id)).toEqual(['ST_FAULT_SHUTDOWN']);
  });

  it('keeps every HMI widget', () => {
    const diagnostics: string[] = [];
    expect(normalizeHmiComponents(project.hmiComponents, diagnostics)).toHaveLength(project.hmiComponents.length);
    expect(diagnostics).toEqual([]);
  });

  it.each(SCENARIOS.map(s => [s.name, s] as const))('reproduces simulation scenario %s', (_name, s) => {
    const { frame } = runScenario(s);
    expect(leaf(frame)).toEqual([s.expectedState]);
    const expected = simResults.scenarios.find((r: { name: string }) => r.name === s.name);
    expect(expected.finalState).toBe(s.expectedState);
    if (s.expectedState === 'ST_IMMO_LOCKED') expect(frame.data.v_starter).toBe(false);
    if (s.expectedState === 'ST_LIMP_DERATE') expect(frame.data.v_torqueLimitPct).toBeLessThanOrEqual(65);
    if (s.expectedState === 'ST_FAULT_SHUTDOWN') expect(frame.data.v_injEnable).toBe(0);
  });

  it('replays the 60 s drive cycle of the source simulation event by event', () => {
    const session = createAppSimulationSession(project);
    set(session, { coolantC: 84, immoValid: 1 });
    const LEVELS: Record<string, Record<string, number | boolean>> = {
      KL50_CrankRequest: { rpm: 220 }, EngineRunning: { rpm: 650 }, OvertempDetected: { coolantC: 104 }, OvertempCleared: { coolantC: 95 },
      CkpLost: { ckpValid: 0 }, CkpRestored: { ckpValid: 1 }, KL15_Off: { rpm: 0 },
    };
    const RAISED_BY_REGIONS = new Set(['OvertempDetected', 'OvertempCleared', 'CkpLost', 'CkpRestored']);
    for (const [, event, expectedState] of simResults.driveCycleEvents as Array<[number, string, string]>) {
      if (LEVELS[event]) set(session, LEVELS[event]);
      const frame = RAISED_BY_REGIONS.has(event) ? step(session, 5) : fire(session, event);
      expect(leaf(frame), event).toEqual([expectedState]);
    }
  });

  it('runs one peak & hold injection and cuts a cylinder on overcurrent', () => {
    const { session } = runScenario(SCENARIOS.find(s => s.name === 'scn04_NormalRun')!);
    set(session, { peakCurrentSense: 0 });
    let frame = fire(session, 'SoiTrigger');
    expect(frame.activeStateIds).toContain('INJ_PEAK');
    expect([frame.data.v_hsGate, frame.data.v_lsGate]).toEqual([true, true]);
    frame = fire(session, 'PeakCurrentReached');
    expect(frame.activeStateIds).toContain('INJ_BIP_WAIT');
    frame = fire(session, 'BipDetected');
    expect(frame.activeStateIds).toContain('INJ_HOLD');
    expect(frame.data.v_holdChop).toBe(true);
    frame = fire(session, 'EoiTrigger');
    frame = step(session, 2);
    expect(frame.activeStateIds).toContain('INJ_IDLE');
    expect(frame.data.v_holdChop).toBe(false);
    fire(session, 'SoiTrigger');
    frame = fire(session, 'OvercurrentTrip');
    expect(frame.activeStateIds).toContain('INJ_CYL_CUTOFF');
    expect(frame.data.v_cylCutoff).toBe(true);
  });

  it('declares an open coil when the peak current is never reached and holds without BIP after 2 ms', () => {
    const { session } = runScenario(SCENARIOS.find(s => s.name === 'scn04_NormalRun')!);
    set(session, { peakCurrentSense: 0 });
    fire(session, 'SoiTrigger');
    expect(step(session, 3).activeStateIds).toContain('INJ_CYL_CUTOFF');
    const second = runScenario(SCENARIOS.find(s => s.name === 'scn04_NormalRun')!).session;
    set(second, { peakCurrentSense: 0 });
    fire(second, 'SoiTrigger');
    fire(second, 'PeakCurrentReached');
    expect(step(second, 3).activeStateIds).toContain('INJ_HOLD');
  });

  it('follows the micro-cycle at HMI speed while the peak comparator reports a healthy coil', () => {
    const { session } = runScenario(SCENARIOS.find(s => s.name === 'scn04_NormalRun')!);
    fire(session, 'SoiTrigger');
    let frame = step(session, 500);
    expect(frame.activeStateIds).toContain('INJ_HOLD');
    expect(frame.activeStateIds).not.toContain('INJ_CYL_CUTOFF');
    fire(session, 'EoiTrigger');
    frame = step(session, 2);
    expect(frame.activeStateIds).toContain('INJ_IDLE');
    expect(frame.data.v_cylCutoff).toBe(false);
  });

  it('never injects outside the operating modes that allow it', () => {
    const session = createAppSimulationSession(project);
    const frame = fire(session, 'SoiTrigger');
    expect(frame.activeStateIds).toContain('INJ_IDLE');
    expect(frame.data.v_hsGate).toBe(false);
  });

  it('drives the fan clutch from 92 C and classifies the ECT channel', () => {
    const session = createAppSimulationSession(project);
    set(session, { coolantC: 96 });
    let frame = step(session, 3);
    expect(frame.activeStateIds).toContain('FAN_PWM');
    expect(frame.data.v_pv3DutyPct).toBeCloseTo(50, 5);
    set(session, { coolantC: 101 });
    expect(step(session, 3).data.v_pv3DutyPct).toBe(100);
    // each fault from NORMAL, and back to NORMAL once the pin is inside 0.18..4.82 V again
    for (const [volts, stateId, mode] of [[0.1, 'DIAG_SCG', 2], [4.9, 'DIAG_OPEN', 1], [5.2, 'DIAG_SCB', 3]] as const) {
      set(session, { vEctPin: volts });
      frame = step(session, 3);
      expect(frame.activeStateIds, String(volts)).toContain(stateId);
      expect([frame.data.v_sensorFaultMode, frame.data.v_useSubstitute]).toEqual([mode, true]);
      set(session, { vEctPin: 2.5 });
      frame = step(session, 3);
      expect(frame.activeStateIds).toContain('DIAG_NORMAL');
      expect([frame.data.v_sensorFaultMode, frame.data.v_useSubstitute]).toEqual([0, false]);
    }
    set(session, { sensorDrift: 1 });
    expect(step(session, 3).activeStateIds).toContain('DIAG_DRIFT');
    expect(frame.data.v_dtcSensor).toBe(true);
  });

  it('closes the corners the source leaves open: key off while initialising or cranking, key on during after-run, stall, CAN recovery', () => {
    let session = createAppSimulationSession(project);
    fire(session, 'KL15_On');
    expect(leaf(fire(session, 'KL15_Off'))).toEqual(['ST_STANDBY']);

    session = runScenario(SCENARIOS.find(s => s.name === 'scn03_ColdCrank')!).session;
    let frame = fire(session, 'KL15_Off');
    expect(leaf(frame)).toEqual(['ST_AFTERRUN']);
    expect(frame.data.v_starter).toBe(false);
    step(session, 5);
    frame = fire(session, 'KL15_On');
    expect(leaf(frame)).toEqual(['ST_INIT_IMMO']);
    expect([frame.data.v_powerLatch, frame.data.v_eepromWrite]).toEqual([1, false]);

    session = runScenario(SCENARIOS.find(s => s.name === 'scn04_NormalRun')!).session;
    set(session, { rpm: 0 });
    expect(leaf(fire(session, 'EngineStopped'))).toEqual(['ST_READY']);

    session = runScenario(SCENARIOS.find(s => s.name === 'scn13_CanTimeout')!).session;
    expect(leaf(fire(session, 'CanRestored'))).toEqual(['ST_RUN_NORMAL']);
  });
});
