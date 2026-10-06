import { describe, expect, it } from 'vitest';
import { blockEquations } from './vlabEquations';

describe('Gas component control-port fallbacks', () => {
  it('uses atmospheric pressure only when reservoir control port is unconnected', () => {
    expect(blockEquations.gas_reservoir({ across: [120000, undefined], branch: [0], params: { P: 95000 } } as any)).toEqual([25000]);
    expect(blockEquations.gas_reservoir({ across: [120000, undefined], branch: [0], params: {} } as any)).toEqual([120000 - 101325]);
    expect(blockEquations.gas_reservoir({ across: [120000, 90000], branch: [0] } as any)).toEqual([30000]);
  });

  it('uses the restriction area parameter when the area port is unconnected', () => {
    const residual = blockEquations.gas_restriction({ across: [200000, 100000, undefined], branch: [0], params: { area: 2e-4 } } as any);
    // WP-17: compressible orifice. 1e5/2e5 = 0.5 is below the critical ratio 0.528 (air): choked flow (Anderson, Modern Compressible Flow, eq. 4.79)\n    // mdot* = Cd A p0 sqrt(gamma/(R T)) (2/(gamma+1))^((gamma+1)/(2(gamma-1)))\n    const choked = 0.62 * 2e-4 * 200000 * Math.sqrt(1.4 / (287 * 293.15)) * Math.pow(2 / 2.4, 3);\n    expect(residual[0]).toBeCloseTo(-choked, 10);
  });

  it('uses the flow source parameter when the control port is unconnected, including zero', () => {
    expect(blockEquations.gas_flow_source({ across: [0, 0, undefined], branch: [0], params: { mdot: 0.2 } } as any)).toEqual([-0.2]);
    expect(blockEquations.gas_flow_source({ across: [0, 0, 0], branch: [0], params: { mdot: 0.2 } } as any)).toEqual([0]);
  });

  it('prefers a connected pressure-source control signal over parameter P, including zero', () => {
    expect(blockEquations.gas_pressure_source({ across: [100000, 100000, 0], branch: [0], params: { P: 200000 } } as any)).toEqual([0]);
    expect(blockEquations.gas_pressure_source({ across: [100000, 100000, undefined], branch: [0], params: { P: 200000 } } as any)).toEqual([-200000]);
  });

  it('reports gas flow in the positive p-to-n direction', () => {
    // branch[0] is the flow entering the block at p (positive p -> n); the output equals it. 0.2 kg/s p -> n reads +0.2 (residual 0).
    expect(blockEquations.gas_flow_sensor({ across: [100000, 100000], branch: [0.2, 0.2] } as any)).toEqual([0, 0]);
    expect(blockEquations.gas_flow_sensor({ across: [100000, 100000], branch: [-0.2, 0] } as any)).toEqual([0, 0.2]);
  });

  it('delivered converter torque and force are the pressure difference from a to h (through variable is into the block)', () => {
    // WP-13b: the through variable is the torque / force INTO the block at R, so the delivered torque D*(Pa - Ph) is
    // -branch and the residual is branch + D*(Pa - Ph); this is the sign that conserves power (see gears_converters.test.ts).
    const torque = blockEquations.gas_rotational_conv({ across: [200000, 150000, 0, 0], branch: [0, 0], params: { D: 0.01 } } as any);
    const force = blockEquations.gas_translational_conv({ across: [200000, 150000, 0, 0], branch: [0, 0], params: { A: 0.001 } } as any);
    expect(torque[1]).toBe(500);
    expect(force[1]).toBe(50);
    // delivering exactly D*(Pa - Ph) (branch = -500 N*m) satisfies the equation
    expect(blockEquations.gas_rotational_conv({ across: [200000, 150000, 0, 0], branch: [0, -500], params: { D: 0.01 } } as any)[1]).toBe(0);
  });
});
