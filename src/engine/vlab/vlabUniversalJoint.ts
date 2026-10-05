import {
  eulerToRotationMatrix,
  transformPoint,
  Vector3,
} from './vlabFrameKinematics';
import { MultibodyConstraintDiagnosticError } from './vlabConstraintDiagnostics';

const dot = (a: Vector3, b: Vector3) =>
  a.reduce((sum, v, i) => sum + v * b[i], 0);
const cross = (a: Vector3, b: Vector3): Vector3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (v: Vector3): Vector3 => {
  const m = Math.hypot(...v);
  return v.map((x) => x / m) as Vector3;
};
export const UNIVERSAL_MEASUREMENTS = [
  'angle1',
  'angle2',
  'w1',
  'w2',
  'fx',
  'fy',
  'fz',
  'f_reac',
  't_reac',
];

export function universalJointParameters(
  params: Record<string, any>,
  nodeId: string,
) {
  const fail = (message: string): never => {
    throw new MultibodyConstraintDiagnosticError(
      'INVALID_JOINT_PARAMETER',
      nodeId,
      ['b', 'f'],
      `Universal joint "${nodeId}": ${message}`,
    );
  };
  const axis = (name: string, fallback: Vector3): Vector3 => {
    const raw = params[name] ?? fallback;
    const values = Array.isArray(raw)
      ? raw
      : typeof raw === 'string'
        ? raw
            .replace(/[\[\]]/g, '')
            .trim()
            .split(/[\s,]+/)
            .filter(Boolean)
        : [];
    const v = values.map(Number);
    if (v.length !== 3 || !v.every(Number.isFinite) || Math.hypot(...v) < 1e-12)
      fail(`${name} must contain three finite numbers and must be nonzero.`);
    return unit(v as Vector3);
  };
  const axis1 = axis('axis1', [1, 0, 0]);
  const input2 = axis('axis2', [0, 1, 0]);
  const perpendicular = input2.map(
    (v, i) => v - dot(axis1, input2) * axis1[i],
  ) as Vector3;
  if (Math.hypot(...perpendicular) < 1e-10)
    fail('axis1 and axis2 must not be parallel.');
  const axis2 = unit(perpendicular);
  const damping = Number(params.damping ?? 0.05);
  if (!Number.isFinite(damping) || damping < 0)
    fail('damping must be finite and nonnegative.');
  return { axis1, axis2, damping };
}

// Spatial angular velocity for R = Rz(rz) Ry(ry) Rx(rx).
export function frameAngularVelocity(r: Vector3, dr: Vector3): Vector3 {
  const cy = Math.cos(r[1]),
    sy = Math.sin(r[1]),
    cz = Math.cos(r[2]),
    sz = Math.sin(r[2]);
  return [
    cz * cy * dr[0] - sz * dr[1],
    sz * cy * dr[0] + cz * dr[1],
    dr[2] - sy * dr[0],
  ];
}

export function universalJointKinematics(
  B: number[],
  F: number[],
  dB: number[],
  dF: number[],
  axes: { axis1: Vector3; axis2: Vector3 },
) {
  const rB = B.slice(3, 6) as Vector3,
    rF = F.slice(3, 6) as Vector3;
  const RB = eulerToRotationMatrix(...rB),
    RF = eulerToRotationMatrix(...rF);
  const a = transformPoint(RB, axes.axis1),
    b = transformPoint(RF, axes.axis2);
  const n = cross(a, b);
  const localN = cross(axes.axis1, axes.axis2);
  const base2 = transformPoint(RB, axes.axis2),
    baseN = transformPoint(RB, localN);
  const follower1 = transformPoint(RF, axes.axis1),
    followerN = transformPoint(RF, localN);
  const wB = frameAngularVelocity(rB, dB.slice(3, 6) as Vector3),
    wF = frameAngularVelocity(rF, dF.slice(3, 6) as Vector3);
  const relativeW = wF.map((v, i) => v - wB[i]) as Vector3;
  const c = dot(a, b),
    denominator = Math.max(1e-12, 1 - c * c);
  const wa = dot(relativeW, a),
    wb = dot(relativeW, b);
  return {
    a,
    b,
    n,
    constraint: c,
    angle1: Math.atan2(dot(b, baseN), dot(b, base2)),
    angle2: Math.atan2(dot(a, followerN), dot(a, follower1)),
    w1: (wa - c * wb) / denominator,
    w2: (wb - c * wa) / denominator,
  };
}
