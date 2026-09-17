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
    expect(residual[0]).toBeCloseTo(-0.62 * 2e-4 / Math.sqrt(293.15) * 100000, 10);
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
    expect(blockEquations.gas_flow_sensor({ across: [100000, 100000], branch: [-0.2, 0] } as any)).toEqual([0, -0.2]);
  });
});
