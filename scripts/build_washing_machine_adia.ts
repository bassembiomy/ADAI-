/**
 * Build models/washing_machine/WashingMachine.adia from models/washing_machine/washingMachineChart.ts.
 *
 * Behaviour only (a state machine with an X-Bridges speed loop and a simulation-only plant). The chart is built with the
 * editor's own operations; this script validates it with the app's simulation session and wraps it into the app's
 * project payload. The delivered file is then rewritten by the app's own Save (scripts/save_washing_machine_in_app.mjs).
 * Run: npx tsx scripts/build_washing_machine_adia.ts
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createUnifiedProjectPayload } from '../src/utils/adiaProjectPersistence';
import { createAppSimulationSession } from '../src/utils/stateMachine/smAppAdapter';
import { washingMachineChart } from '../models/washing_machine/washingMachineChart';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'models/washing_machine/WashingMachine.adia');

const chart = washingMachineChart();
createAppSimulationSession(chart as never); // throws unless the state machine passes the app's rules

const payload = createUnifiedProjectPayload({
  version: 'v2.4 ENGINE',
  projectName: 'WashingMachine',
  tickMs: chart.tickMs,
  safetyMode: false,
  states: chart.states,
  junctions: chart.junctions,
  transitions: chart.transitions,
  variables: chart.variables,
  layers: chart.layers,
  events: chart.events ?? [],
  codePrefix: chart.codePrefix,
  diagrams: chart.diagrams,
  view: { scale: 0.6, offsetX: 40, offsetY: 40 },
  interfaceRealizations: [], customStereotypes: [], hmiComponents: [],
  vlabNodes: [], vlabEdges: [], globalXBridgesNodes: [], globalXBridgesEdges: [], entropyNodes: [], entropyEdges: [],
  openTabs: ['statemachine'],
  blocks: [], relationships: [], parts: [], connectors: [],
} as never, () => new Date('2026-11-15T00:00:00Z'));
writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`wrote ${OUT.slice(ROOT.length + 1)}: ${chart.states.length} states, ${chart.transitions.length} transitions, ${chart.variables.length} variables, ${(chart.events ?? []).length} events`);
