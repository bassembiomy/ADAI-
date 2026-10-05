import type { AssembledSystem } from './types';
import {
  parseVector3,
  eulerToRotationMatrix,
  transformPoint,
  Vector3,
} from './vlabFrameKinematics';

/** Seed a new joint at its reference pose, before estimating any velocity.
 * Propagation follows the existing rigid_transform equations (Euler offsets).
 * It changes only the initial guess, never a previously simulated state.
 */
export function initializeUniversalJointFrames(
  system: AssembledSystem,
  x: number[],
): void {
  const poses = new Map<string, number[]>();
  const roots = (c: AssembledSystem['components'][number]) => [
    c.portNodeMap.get('b'),
    c.portNodeMap.get('f'),
  ];
  for (const c of system.components)
    if (c.blockType === 'world_frame') {
      for (const root of c.portNodeMap.values())
        poses.set(root, new Array(6).fill(0));
    }
  const propagate = () => {
    let changed = false;
    for (const c of system.components) {
      const [b, f] = roots(c);
      if (!b || !f) continue;
      const B = poses.get(b),
        F = poses.get(f);
      if ((!B && !F) || (B && F)) continue;
      if (c.blockType === 'rigid_transform') {
        const offset = parseVector3(c.params.offset);
        const rotation = parseVector3(c.params.rotation).map(
          (v) => (v * Math.PI) / 180,
        );
        if (B) {
          const shift = transformPoint(
            eulerToRotationMatrix(...(B.slice(3, 6) as Vector3)),
            offset,
          );
          poses.set(f, [
            ...shift.map((v, i) => B[i] + v),
            ...rotation.map((v, i) => B[i + 3] + v),
          ]);
        } else if (F) {
          const r = rotation.map((v, i) => F[i + 3] - v) as Vector3;
          const shift = transformPoint(eulerToRotationMatrix(...r), offset);
          poses.set(b, [...shift.map((v, i) => F[i] - v), ...r]);
        }
        changed = true;
      } else if (c.blockType === 'universal_joint') {
        poses.set(B ? f : b, [...(B ?? F)!]);
        changed = true;
      }
    }
    return changed;
  };
  while (propagate()) {
    /* each pass discovers at least one new frame */
  }
  // Unanchored joints choose an origin as their initial free reference pose.
  for (const c of system.components)
    if (c.blockType === 'universal_joint') {
      const [b, f] = roots(c);
      if (b && f && !poses.has(b) && !poses.has(f)) {
        poses.set(b, new Array(6).fill(0));
        while (propagate()) {
          /* propagate through the unanchored component */
        }
      }
    }
  const indices = new Map(system.variableNames.map((name, i) => [name, i]));
  for (const [root, pose] of poses) {
    for (const domain of ['frame', 'multibodyframe']) {
      const index = indices.get(`Across_${root}_Px_(${domain})`);
      if (index !== undefined)
        pose.forEach((value, k) => {
          x[index + k] = value;
        });
    }
  }
}
