export function parseVector3(val: any, defaultVal: [number, number, number] = [0, 0, 0]): [number, number, number] {
  if (Array.isArray(val) && val.length >= 3) {
    return [Number(val[0]) || 0, Number(val[1]) || 0, Number(val[2]) || 0];
  }
  if (typeof val === 'string') {
    const cleaned = val.replace(/[\[\]]/g, '').trim();
    const parts = cleaned.split(/[\s,]+/).filter(Boolean).map(Number);
    if (parts.length >= 3 && parts.every(Number.isFinite)) {
      return [parts[0], parts[1], parts[2]];
    }
  }
  return [...defaultVal];
}

export function eulerToRotationMatrix(rx: number, ry: number, rz: number): number[][] {
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);

  // R = Rz * Ry * Rx
  return [
    [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx],
    [sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx],
    [-sy, cy * sx, cy * cx]
  ];
}

export function transformPoint(R: number[][], p: [number, number, number]): [number, number, number] {
  return [
    R[0][0] * p[0] + R[0][1] * p[1] + R[0][2] * p[2],
    R[1][0] * p[0] + R[1][1] * p[1] + R[1][2] * p[2],
    R[2][0] * p[0] + R[2][1] * p[1] + R[2][2] * p[2]
  ];
}

export function computeFrameDistance(pA: [number, number, number], pB: [number, number, number]): number {
  const dx = pB[0] - pA[0];
  const dy = pB[1] - pA[1];
  const dz = pB[2] - pA[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz + 1e-18);
}

export function computeRelativeAngle(rA: [number, number, number], rB: [number, number, number]): number {
  return computeRelativeAngleAxis(rA, rB).angle;
}

export type Vector3 = [number, number, number];

export interface NormalizedVector3 {
  unit: Vector3;
  magnitude: number;
  defined: boolean;
}

/**
 * Normalizes a vector, flagging the degenerate zero-length case explicitly
 * rather than returning NaN components (e.g. when two frames coincide).
 */
export function normalizeVector3(v: Vector3, tolerance = 1e-12): NormalizedVector3 {
  const magnitude = Math.hypot(v[0], v[1], v[2]);
  if (magnitude <= tolerance) {
    return { unit: [0, 0, 0], magnitude: 0, defined: false };
  }
  return {
    unit: [v[0] / magnitude, v[1] / magnitude, v[2] / magnitude],
    magnitude,
    defined: true,
  };
}

function transpose3(m: number[][]): number[][] {
  return [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
  ];
}

function multiply3(a: number[][], b: number[][]): number[][] {
  const out: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      out[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
    }
  }
  return out;
}

export interface RelativeAngleAxis {
  angle: number;
  axis: Vector3;
  axisDefined: boolean;
}

/**
 * Computes the relative rotation angle and axis between two Euler-angle
 * orientations via Rrel = Rb^T * Rf, using the standard axis-angle extraction
 * with an explicit handling of the angle ~ 0 and angle ~ PI singularities
 * (where the skew-symmetric part of Rrel vanishes and the axis is otherwise
 * numerically undefined).
 */
export function computeRelativeAngleAxis(base: Vector3, follower: Vector3, tolerance = 1e-10): RelativeAngleAxis {
  const Rb = eulerToRotationMatrix(base[0], base[1], base[2]);
  const Rf = eulerToRotationMatrix(follower[0], follower[1], follower[2]);
  const Rrel = multiply3(transpose3(Rb), Rf);

  const trace = Rrel[0][0] + Rrel[1][1] + Rrel[2][2];
  const cosine = Math.min(1, Math.max(-1, (trace - 1) / 2));
  const angle = Math.acos(cosine);

  if (angle <= tolerance) {
    return { angle: 0, axis: [0, 0, 0], axisDefined: false };
  }

  if (Math.PI - angle <= tolerance) {
    // Near the PI singularity, sin(angle) ~ 0 so the skew-vector extraction
    // below is numerically unstable. Recover axis components from the
    // symmetric part of Rrel instead: Rrel = 2*axis*axis^T - I at angle = PI.
    const axisSq: Vector3 = [
      Math.max(0, (Rrel[0][0] + 1) / 2),
      Math.max(0, (Rrel[1][1] + 1) / 2),
      Math.max(0, (Rrel[2][2] + 1) / 2),
    ];
    const raw: Vector3 = [
      Math.sqrt(axisSq[0]),
      Math.sqrt(axisSq[1]) * Math.sign(Rrel[0][1] + Rrel[1][0] || 1),
      Math.sqrt(axisSq[2]) * Math.sign(Rrel[0][2] + Rrel[2][0] || 1),
    ];
    const normalized = normalizeVector3(raw);
    return { angle: Math.PI, axis: normalized.unit, axisDefined: normalized.defined };
  }

  const skew: Vector3 = [
    Rrel[2][1] - Rrel[1][2],
    Rrel[0][2] - Rrel[2][0],
    Rrel[1][0] - Rrel[0][1],
  ];
  const twoSin = 2 * Math.sin(angle);
  const normalized = normalizeVector3([skew[0] / twoSin, skew[1] / twoSin, skew[2] / twoSin]);
  return { angle, axis: normalized.unit, axisDefined: normalized.defined };
}
