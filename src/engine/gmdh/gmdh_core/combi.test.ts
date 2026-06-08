// src/engine/gmdh/gmdh_core/combi.test.ts

import { describe, it, expect } from 'vitest';
import { GMDHEngine } from './combi';
import { GMDHConfig } from './types';

describe('GMDHEngine Core Implementation', () => {
  const baseConfig: GMDHConfig = {
    algorithm: 'MIA',
    polynomialOrder: 2,
    maxLayers: 3,
    externalCriterion: 'RMSE',
    validationSplit: 0.3
  };

  // Deterministic LCG random number generator
  let seed = 42;
  const pseudorandom = () => {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  };

  it('TC-GMDH-01: Train on simple polynomial function and recover trend', () => {
    seed = 1;
    const engine = new GMDHEngine(baseConfig);
    
    // Generate data: y = 2 + 3*x1 - 1.5*x2 + x1*x2 + noise
    const data: number[][] = [];
    const headers = ['x1', 'x2', 'y'];
    
    for (let i = 0; i < 200; i++) {
      const x1 = pseudorandom() * 10 - 5;
      const x2 = pseudorandom() * 10 - 5;
      const noise = (pseudorandom() - 0.5) * 0.1;
      const y = 2 + 3 * x1 - 1.5 * x2 + x1 * x2 + noise;
      data.push([x1, x2, y]);
    }

    engine.train(data, headers);
    
    // It should train at least 1 layer
    expect(engine.layers.length).toBeGreaterThan(0);
    
    // Predict on a new point
    const testPoint = [2, -3]; // x1=2, x2=-3
    const expectedY = 2 + 3 * 2 - 1.5 * (-3) + 2 * (-3); // 2 + 6 + 4.5 - 6 = 6.5
    
    const prediction = engine.predict(testPoint);
    
    // Prediction should be close to expected due to small noise
    expect(prediction).toBeCloseTo(expectedY, 0); // Precision 0 (within 1 unit)
  });

  it('TC-GMDH-02: Prevent overfitting with external criterion (Early Stopping)', () => {
    seed = 42;
    // With 100% noise and irrelevant features, it should stop early
    const engine = new GMDHEngine({
      ...baseConfig,
      maxLayers: 10, // Try to force deep network
    });

    const data: number[][] = [];
    const headers = ['x1', 'x2', 'x3', 'y'];
    
    for (let i = 0; i < 100; i++) {
      data.push([
        pseudorandom(), 
        pseudorandom(), 
        pseudorandom(), 
        pseudorandom() // completely random target
      ]);
    }

    engine.train(data, headers);
    
    // The engine should stop early, usually at 1 or 2 layers, not reaching 10
    expect(engine.layers.length).toBeLessThan(6);
  });
});
