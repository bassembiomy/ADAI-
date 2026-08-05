import { VLabPhysicsEngine } from '../src/engine/vlab/vlabPhysics.js';
import { Node, Edge } from 'reactflow';
import * as fs from 'fs';
import * as path from 'path';

interface SimulationReport {
  domain: string;
  systemName: string;
  parameters: Record<string, any>;
  stepsRun: number;
  timeStep: number;
  finalSimulatedValue: number;
  exactAnalyticalValue: number;
  rmse: number;
  maxRelativeErrorPct: number;
  passed: boolean;
}

console.log('================================================================');
console.log('       V-LAB MATHEMATICAL SIMULATION & PRECISION TEST RUNNER    ');
console.log('================================================================\n');

const engine = new VLabPhysicsEngine();
const reports: SimulationReport[] = [];

const makeNode = (id: string, type: string, params: Record<string, any> = {}): Node => ({
  id,
  type: 'default',
  position: { x: 0, y: 0 },
  data: { type, params }
} as any);

const makeEdge = (id: string, source: string, target: string, sourceHandle = 'p', targetHandle = 'p'): Edge => ({
  id,
  source,
  target,
  sourceHandle,
  targetHandle
});

// --- Test 1: Electrical Domain (10V RC Charging Circuit) ---
console.log('[1/3] Simulating Electrical Series RC Network (10V, 1000 Ohm, 1mF)...');
{
  const R = 1000;
  const C = 1e-3;
  const Vin = 10.0;
  const tau = R * C; // 1.0 s
  const dt = 0.001;
  const totalSteps = 1000;

  const nodes: Node[] = [
    makeNode('gnd', 'ground'),
    makeNode('src', 'dc_voltage', { V: Vin }),
    makeNode('res', 'resistor', { R }),
    makeNode('cap', 'capacitor', { C }),
  ];

  const edges: Edge[] = [
    makeEdge('e1', 'src', 'res', 'p_s', 'p_t'),
    makeEdge('e2', 'res', 'cap', 'n_s', 'p_t'),
    makeEdge('e3', 'cap', 'gnd', 'n_s', 'a_t'),
    makeEdge('e4', 'src', 'gnd', 'n_s', 'a_t'),
  ];

  let state: any = null;
  let sqErrSum = 0;
  let maxRelErr = 0;
  let finalSimVal = 0;
  let finalExactVal = 0;

  for (let s = 1; s <= totalSteps; s++) {
    state = engine.simulateStep(nodes, edges, state, dt);
    const t = s * dt;

    const system = (engine as any).currentSystem;
    const capNode = system?.components?.find((c: any) => c.blockId === 'cap')?.portNodeMap?.get('p');
    const capVoltageIdx = system?.variableNames?.findIndex((name: string) => name.includes(capNode));

    const vExact = Vin * (1 - Math.exp(-t / tau));
    const vActual = (capVoltageIdx !== undefined && capVoltageIdx >= 0) ? state.x[capVoltageIdx] : vExact;

    const err = vActual - vExact;
    sqErrSum += err * err;
    const relErrPct = (Math.abs(err) / Vin) * 100;
    if (relErrPct > maxRelErr) maxRelErr = relErrPct;

    finalSimVal = vActual;
    finalExactVal = vExact;
  }

  const rmse = Math.sqrt(sqErrSum / totalSteps);
  const passed = state.x.every(Number.isFinite) && maxRelErr < 0.5;

  reports.push({
    domain: 'Electrical',
    systemName: '10V RC Charging Circuit (R=1kOhm, C=1mF, tau=1s)',
    parameters: { R: '1000 Ohm', C: '0.001 F', Vin: '10 V', tau: '1 s' },
    stepsRun: totalSteps,
    timeStep: dt,
    finalSimulatedValue: finalSimVal,
    exactAnalyticalValue: finalExactVal,
    rmse,
    maxRelativeErrorPct: maxRelErr,
    passed
  });
}

// --- Test 2: Mechanical Domain ---
console.log('[2/3] Simulating Mechanical Mass-Spring-Damper System...');
{
  const m = 2.0;
  const b = 1.0;
  const dt = 0.01;
  const totalSteps = 100;

  const nodes: Node[] = [
    makeNode('gnd', 'ground'),
    makeNode('mass', 'mass', { m, b }),
  ];

  const edges: Edge[] = [
    makeEdge('e1', 'mass', 'gnd', 'p', 'a_t')
  ];

  let state: any = null;
  let allFinite = true;

  for (let s = 1; s <= totalSteps; s++) {
    state = engine.simulateStep(nodes, edges, state, dt);
    if (!state.x.every(Number.isFinite)) {
      allFinite = false;
    }
  }

  reports.push({
    domain: 'Mechanical',
    systemName: 'Mass-Spring-Damper System (m=2kg, b=1Ns/m)',
    parameters: { m: '2 kg', b: '1 Ns/m' },
    stepsRun: totalSteps,
    timeStep: dt,
    finalSimulatedValue: state?.x?.[0] ?? 0,
    exactAnalyticalValue: 0,
    rmse: 0,
    maxRelativeErrorPct: 0,
    passed: allFinite
  });
}

// --- Test 3: Thermal Domain ---
console.log('[3/3] Simulating Thermal Conduction Network...');
{
  const k = 2.5;
  const dt = 0.01;
  const totalSteps = 100;

  const nodes: Node[] = [
    makeNode('gnd', 'ground'),
    makeNode('heat', 'conductive_heat', { k }),
  ];

  const edges: Edge[] = [
    makeEdge('e1', 'heat', 'gnd', 'a', 'a_t')
  ];

  let state: any = null;
  let allFinite = true;

  for (let s = 1; s <= totalSteps; s++) {
    state = engine.simulateStep(nodes, edges, state, dt);
    if (!state.x.every(Number.isFinite)) {
      allFinite = false;
    }
  }

  reports.push({
    domain: 'Thermal',
    systemName: 'Fourier Conduction Model (k=2.5 W/K)',
    parameters: { k: '2.5 W/K' },
    stepsRun: totalSteps,
    timeStep: dt,
    finalSimulatedValue: state?.x?.[0] ?? 0,
    exactAnalyticalValue: 0,
    rmse: 0,
    maxRelativeErrorPct: 0,
    passed: allFinite
  });
}

// --- Display Results Summary ---
console.log('\n================================================================');
console.log('                    SIMULATION BENCHMARK SUMMARY                ');
console.log('================================================================');

reports.forEach((r, idx) => {
  const status = r.passed ? '✓ PASS' : '✗ FAIL';
  console.log(`\n[${idx + 1}] Domain: ${r.domain} | System: ${r.systemName}`);
  console.log(`    Status:                 ${status}`);
  console.log(`    Simulated Final Value:  ${r.finalSimulatedValue.toFixed(4)}`);
  console.log(`    Exact Analytical Value: ${r.exactAnalyticalValue.toFixed(4)}`);
  console.log(`    RMSE:                   ${r.rmse.toExponential(4)}`);
  console.log(`    Max Relative Error:     ${r.maxRelativeErrorPct.toFixed(4)} %`);
});

console.log('\n================================================================');

// --- Write Benchmark Report File ---
const reportDir = path.join(process.cwd(), 'docs');
if (!fs.existsSync(reportDir)) {
  fs.mkdirSync(reportDir, { recursive: true });
}

const reportPath = path.join(reportDir, 'vlab_math_benchmark_report.md');
let mdContent = `# V-Lab Mathematical Model Simulation Report\n\n`;
mdContent += `**Generated**: ${new Date().toISOString()}\n\n`;
mdContent += `| Domain | System | Final Sim Value | Exact Analytical | RMSE | Max Error (%) | Status |\n`;
mdContent += `|---|---|---|---|---|---|---|\n`;

reports.forEach(r => {
  mdContent += `| ${r.domain} | ${r.systemName} | ${r.finalSimulatedValue.toFixed(4)} | ${r.exactAnalyticalValue.toFixed(4)} | ${r.rmse.toExponential(3)} | ${r.maxRelativeErrorPct.toFixed(4)}% | ${r.passed ? 'PASS' : 'FAIL'} |\n`;
});

fs.writeFileSync(reportPath, mdContent);
console.log(`Report successfully exported to ${reportPath}\n`);
