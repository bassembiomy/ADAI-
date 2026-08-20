import { describe, expect, it } from 'vitest';
import { ElectromechanicalFixtures } from '../boundary_generator/ElectromechanicalFixtures';
import { SimulationHarness } from '../boundary_generator/SimulationHarness';

describe('VLab White-Box: Electromechanical Domain Batch', () => {
  it('EM-01: Validates DC motor electromechanical speed spin-up under viscous load', () => {
    const Va = 24;
    const K = 0.05;
    const R = 2.0;
    const b = 0.001;
    const J = 0.0002;
    const boundary = ElectromechanicalFixtures.createDCMotorCircuit(Va, K, R, b, J, 0.05);
    const result = SimulationHarness.runBoundarySimulation(boundary);
    const measuredW = result.signals['speed'];

    expect(measuredW.length).toBeGreaterThan(5);
    // Speed magnitude should spin up progressively
    const maxSpeed = Math.max(...measuredW.map(Math.abs));
    expect(maxSpeed).toBeGreaterThan(10.0);
  });
});
