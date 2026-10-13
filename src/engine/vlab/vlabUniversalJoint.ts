/**
 * Universal joint entry points. The mathematics lives in the shared joint core (vlabJointCore.ts, WP-19a); this module
 * keeps the original universal-joint API (parameter parsing, kinematics, measurement list) on top of it.
 */
import type { Vector3 } from './vlabFrameKinematics';
import {
  JOINT_SIGNAL_PORTS,
  frameAngularVelocity,
  jointConfiguration,
  universalKinematics,
} from './vlabJointCore';

export { frameAngularVelocity };

export const UNIVERSAL_MEASUREMENTS: readonly string[] = JOINT_SIGNAL_PORTS.universal;

export function universalJointParameters(params: Record<string, any>, nodeId: string) {
  const { axis1, axis2, damping } = jointConfiguration('universal', params, nodeId);
  return { axis1, axis2, damping };
}

export function universalJointKinematics(
  B: number[],
  F: number[],
  dB: number[],
  dF: number[],
  axes: { axis1: Vector3; axis2: Vector3 },
  dt = 0,
) {
  return universalKinematics(B, F, dB, dF, axes, dt);
}
