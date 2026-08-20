import * as THREE from 'three';

export interface GalaxyParameters {
  count: number;
  size: number;
  radius: number;
  branches: number;
  spin: number;
  randomness: number;
  randomnessPower: number;
  insideColor: string;
  outsideColor: string;
}

export const DEFAULT_GALAXY_PARAMS: GalaxyParameters = {
  count: 75000,
  size: 0.015,
  radius: 6.5,
  branches: 4,
  spin: 1.15,
  randomness: 0.45,
  randomnessPower: 3.5,
  insideColor: '#ff9c3a',
  outsideColor: '#3b5bdb'
};

export interface GalaxyData {
  positions: Float32Array;
  colors: Float32Array;
  scales: Float32Array;
  count: number;
}

/**
 * Generates logarithmic spiral galaxy particle coordinates, scales, and colors
 * using exponential random dispersion.
 */
export function generateGalaxyData(params: GalaxyParameters = DEFAULT_GALAXY_PARAMS): GalaxyData {
  const positions = new Float32Array(params.count * 3);
  const colors = new Float32Array(params.count * 3);
  const scales = new Float32Array(params.count);

  const colorInside = new THREE.Color(params.insideColor);
  const colorOutside = new THREE.Color(params.outsideColor);

  for (let i = 0; i < params.count; i++) {
    const i3 = i * 3;

    // Radius distribution: cubic distribution to concentrate high density at galactic core
    const radius = Math.pow(Math.random(), 1.2) * params.radius;

    // Spiral arm angle
    const branchAngle = ((i % params.branches) / params.branches) * Math.PI * 2;
    const spinAngle = radius * params.spin;

    // Exponential randomness power calculation
    const randomX = Math.pow(Math.random(), params.randomnessPower) * (Math.random() < 0.5 ? 1 : -1) * params.randomness * radius;
    const randomY = Math.pow(Math.random(), params.randomnessPower) * (Math.random() < 0.5 ? 1 : -1) * (params.randomness * 0.4) * radius;
    const randomZ = Math.pow(Math.random(), params.randomnessPower) * (Math.random() < 0.5 ? 1 : -1) * params.randomness * radius;

    positions[i3] = Math.cos(branchAngle + spinAngle) * radius + randomX;
    positions[i3 + 1] = randomY;
    positions[i3 + 2] = Math.sin(branchAngle + spinAngle) * radius + randomZ;

    // Scale variation
    scales[i] = Math.random() * 0.8 + 0.5;

    // Color gradient: warm radiant core transitioning to cosmic violet/blue
    const mixedColor = colorInside.clone().lerp(colorOutside, Math.min(1, radius / params.radius));
    
    // Core flare brightness boost
    if (radius < params.radius * 0.15) {
      mixedColor.r = Math.min(1, mixedColor.r * 1.3);
      mixedColor.g = Math.min(1, mixedColor.g * 1.2);
      mixedColor.b = Math.min(1, mixedColor.b * 1.1);
    }

    colors[i3] = mixedColor.r;
    colors[i3 + 1] = mixedColor.g;
    colors[i3 + 2] = mixedColor.b;
  }

  return {
    positions,
    colors,
    scales,
    count: params.count
  };
}
