/**
 * Shared multibody joint core (WP-19a): ONE implementation for revolute, prismatic, spherical, universal and weld.
 *
 * Frame state: every Frame node carries a 6-vector pose [Px Py Pz Rx Ry Rz]: world position and Z-Y-X Euler angles,
 * R = Rz(rz) Ry(ry) Rx(rx) (vlabFrameKinematics.eulerToRotationMatrix). A joint couples the pose of its base frame B
 * and its follower frame F.
 *
 * Relative pose B -> F:   d = P_F - P_B (world),  p_rel = R_B^T d,  R_rel = R_B^T R_F.
 *
 * Each joint is a DOF mask over that relative pose, expressed as constraint rows g_j(B, F) = 0 whose multipliers are the
 * reaction wrench:
 *   translation  locked (3 rows  d - R_B p0 = 0, the force branches ARE the multipliers)   revolute, spherical, universal, weld
 *                partly locked (2 rows  (R_B c_j).d = 0, c_j perpendicular to the slide axis a)  prismatic
 *   rotation     free                                                                 spherical
 *                about one axis (2 rows  (R_B t_j).(R_F a) = 0, t_j perpendicular to a)   revolute
 *                about two axes (1 row   (R_B a1).(R_F a2) = 0)                           universal
 *                locked (3 rows  rho = vee(skew(R_F R0^T R_B^T)) = 0, torque branches are the multipliers)  prismatic, weld
 * The wrench the joint exerts on F is the constraint-gradient combination (Lagrange multipliers), plus the viscous term of
 * the free DOFs only:
 *   f_F = sum_j lambda_j (R_B c_j)  -  c v a_W                      (prismatic)  or the 3 force multipliers
 *   t_F = sum_j lambda_j n_j        -  c w a_W                      (revolute: n_j = (R_F a) x (R_B t_j))
 *   t_F = lambda (a x b)            -  c (w1 a + w2 b)              (universal; a = R_B a1, b = R_F a2)
 * and the wrench on B is -f_F with the moment about B's origin  t_B = -t_F - d x f_F  (equal and opposite at coincident
 * origins, with the lever arm when the joint has a displacement: prismatic, weld with an offset). Branch variables are the
 * literal world components of those wrenches, so the Frame Kirchhoff rows need no name guessing (F-047).
 *
 * Sign convention: through variables are positive B -> F (the wrench exerted by the joint on F), across = pose_F - pose_B.
 * SI units; angles in rad. Joint velocities are the discrete derivative of the joint coordinate over the solver step
 * (exact for the backward-difference scheme the assembler uses), with the instantaneous spatial rate as a fallback when no
 * step size is known.
 */
import {
  Vector3,
  eulerToRotationMatrix,
  computeRelativeAngleAxis,
} from './vlabFrameKinematics';
import { MultibodyConstraintDiagnosticError } from './vlabConstraintDiagnostics';
import { numericParam, parseNumeric, unwrapParam } from './vlabParams';

export type JointKind = 'revolute' | 'prismatic' | 'spherical' | 'universal' | 'weld';

export const JOINT_BLOCK_KIND: Record<string, JointKind> = {
  revolute_joint: 'revolute',
  prismatic_joint: 'prismatic',
  spherical_joint: 'spherical',
  universal_joint: 'universal',
  weld_joint: 'weld',
};
export const JOINT_BLOCK_TYPES: readonly string[] = Object.keys(JOINT_BLOCK_KIND);
export const jointKindOf = (blockType: string): JointKind | undefined => JOINT_BLOCK_KIND[blockType];

const JOINT_LABEL: Record<JointKind, string> = {
  revolute: 'Revolute joint',
  prismatic: 'Prismatic joint',
  spherical: 'Spherical joint',
  universal: 'Universal joint',
  weld: 'Weld joint',
};

/** Documented default viscous coefficient of the free DOF (same values as the library parameter). */
const DEFAULT_DAMPING: Partial<Record<JointKind, number>> = { revolute: 0.1, prismatic: 1.0, universal: 0.05 };

// ── small linear algebra ────────────────────────────────────────────────────────────────────────
type Mat3 = number[][];
const dot = (a: Vector3, b: Vector3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vector3, b: Vector3): Vector3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const add = (a: Vector3, b: Vector3): Vector3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vector3, b: Vector3): Vector3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vector3, s: number): Vector3 => [a[0] * s, a[1] * s, a[2] * s];
const norm = (a: Vector3) => Math.hypot(a[0], a[1], a[2]);
const unit = (v: Vector3): Vector3 => {
  const m = norm(v);
  return [v[0] / m, v[1] / m, v[2] / m];
};
const mulMV = (R: Mat3, v: Vector3): Vector3 => [dot(R[0] as Vector3, v), dot(R[1] as Vector3, v), dot(R[2] as Vector3, v)];
const mulMtV = (R: Mat3, v: Vector3): Vector3 => [
  R[0][0] * v[0] + R[1][0] * v[1] + R[2][0] * v[2],
  R[0][1] * v[0] + R[1][1] * v[1] + R[2][1] * v[2],
  R[0][2] * v[0] + R[1][2] * v[1] + R[2][2] * v[2],
];
const transposeM = (m: Mat3): Mat3 => [
  [m[0][0], m[1][0], m[2][0]],
  [m[0][1], m[1][1], m[2][1]],
  [m[0][2], m[1][2], m[2][2]],
];
const mulMM = (a: Mat3, b: Mat3): Mat3 => {
  const out: Mat3 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) out[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
  return out;
};
const trace = (m: Mat3) => m[0][0] + m[1][1] + m[2][2];
/** vee of the skew part of a rotation: sin(theta) * axis, smooth everywhere (no sqrt, no acos). */
const skewVee = (m: Mat3): Vector3 => [(m[2][1] - m[1][2]) / 2, (m[0][2] - m[2][0]) / 2, (m[1][0] - m[0][1]) / 2];
const wrapPi = (x: number) => x - 2 * Math.PI * Math.round(x / (2 * Math.PI));
const frame = (v: any): number[] => (Array.isArray(v) ? v : [Number(v) || 0, 0, 0, 0, 0, 0]);
const pos = (f: number[]): Vector3 => [f[0], f[1], f[2]];
const euler = (f: number[]): Vector3 => [f[3], f[4], f[5]];

/** Spatial angular velocity for R = Rz(rz) Ry(ry) Rx(rx) and Euler rates dr. */
export function frameAngularVelocity(r: Vector3, dr: Vector3): Vector3 {
  const cy = Math.cos(r[1]), sy = Math.sin(r[1]), cz = Math.cos(r[2]), sz = Math.sin(r[2]);
  return [cz * cy * dr[0] - sz * dr[1], sz * cy * dr[0] + cz * dr[1], dr[2] - sy * dr[0]];
}

/** Deterministic orthonormal pair (t1, t2) with t1 x t2 = a, for the unit axis a. */
export function perpendicularBasis(a: Vector3): [Vector3, Vector3] {
  const ax = Math.abs(a[0]), ay = Math.abs(a[1]), az = Math.abs(a[2]);
  const ref: Vector3 = ax <= ay && ax <= az ? [1, 0, 0] : ay <= az ? [0, 1, 0] : [0, 0, 1];
  const t1 = unit(cross(a, ref));
  return [t1, cross(a, t1)];
}

// ── parameters ──────────────────────────────────────────────────────────────────────────────────
export interface JointConfig {
  kind: JointKind;
  /** unit slide / rotation axis in B-local coordinates (revolute, prismatic) */
  axis: Vector3;
  /** universal: unit B-local axis1 and unit F-local axis2 (orthogonalized against axis1) */
  axis1: Vector3;
  axis2: Vector3;
  /** viscous coefficient of the FREE DOFs only (0 for spherical and weld) */
  damping: number;
  /** weld: reference position of F in B-local coordinates [m] and reference rotation R0 (R_F = R_B R0) */
  offset: Vector3;
  rotation: Mat3;
}

const identity3 = (): Mat3 => [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

function readVector(raw: unknown, fallback: Vector3): number[] | null {
  const v = unwrapParam(raw);
  if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) return [...fallback];
  const items: unknown[] = Array.isArray(v)
    ? v
    : typeof v === 'string'
      ? v.replace(/[[\]]/g, ' ').trim().split(/[\s,;]+/).filter(Boolean)
      : [];
  if (items.length !== 3) return null;
  const parsed = items.map(parseNumeric);
  if (!parsed.every((p) => p.kind === 'ok')) return null;
  return parsed.map((p) => (p as { value: number }).value);
}

/**
 * Parameters of a joint. Axis parameters are normalized here (at load); a zero, non-finite, malformed or (universal)
 * parallel axis is rejected with the INVALID_JOINT_PARAMETER diagnostic (the same MultibodyConstraintDiagnosticError path
 * as the other pre-solve multibody diagnostics).
 */
const CONFIG_KEYS: Record<JointKind, string[]> = {
  revolute: ['axis', 'damping'], prismatic: ['axis', 'damping'], spherical: [], universal: ['axis1', 'axis2', 'damping'], weld: ['offset', 'rotation'],
};
// The equation is evaluated (n + 1) times per Newton iteration with the same parameters; parsing them each time dominated
// the cost of a joint step. The key is the raw parameter text, so an edited value is always re-parsed (errors are never cached).
const CONFIG_CACHE = new Map<string, JointConfig>();

export function jointConfiguration(kind: JointKind, params: Record<string, any> | undefined, nodeId: string): JointConfig {
  const p = params ?? {};
  const key = kind + '|' + CONFIG_KEYS[kind].map((name) => JSON.stringify(unwrapParam(p[name]) ?? null)).join('|');
  const hit = CONFIG_CACHE.get(key);
  if (hit) return hit;
  const cfg = parseJointConfiguration(kind, p, nodeId);
  if (CONFIG_CACHE.size > 512) CONFIG_CACHE.clear();
  CONFIG_CACHE.set(key, cfg);
  return cfg;
}

function parseJointConfiguration(kind: JointKind, p: Record<string, any>, nodeId: string): JointConfig {
  const fail = (message: string): never => {
    throw new MultibodyConstraintDiagnosticError(
      'INVALID_JOINT_PARAMETER', nodeId, ['b', 'f'], `${JOINT_LABEL[kind]} "${nodeId}": ${message}`,
    );
  };
  const axisOf = (name: string, fallback: Vector3): Vector3 => {
    const v = readVector(p[name], fallback);
    if (!v || !v.every(Number.isFinite) || Math.hypot(v[0], v[1], v[2]) < 1e-12) {
      return fail(`${name} must contain three finite numbers and must be nonzero.`);
    }
    return unit(v as Vector3);
  };
  const vectorOf = (name: string, fallback: Vector3): Vector3 => {
    const v = readVector(p[name], fallback);
    if (!v || !v.every(Number.isFinite)) return fail(`${name} must contain three finite numbers.`);
    return v as Vector3;
  };

  const cfg: JointConfig = {
    kind, axis: [0, 0, 1], axis1: [1, 0, 0], axis2: [0, 1, 0], damping: 0, offset: [0, 0, 0], rotation: identity3(),
  };
  if (kind === 'revolute' || kind === 'prismatic') cfg.axis = axisOf('axis', [0, 0, 1]);
  if (kind === 'universal') {
    cfg.axis1 = axisOf('axis1', [1, 0, 0]);
    const input2 = axisOf('axis2', [0, 1, 0]);
    const perpendicular = sub(input2, scale(cfg.axis1, dot(cfg.axis1, input2)));
    if (norm(perpendicular) < 1e-10) fail('axis1 and axis2 must not be parallel.');
    cfg.axis2 = unit(perpendicular);
  }
  if (kind === 'revolute' || kind === 'prismatic' || kind === 'universal') {
    const damping = numericParam(p, 'damping', DEFAULT_DAMPING[kind]!, nodeId);
    if (!Number.isFinite(damping) || damping < 0) fail('damping must be finite and nonnegative.');
    cfg.damping = damping;
  }
  if (kind === 'weld') {
    cfg.offset = vectorOf('offset', [0, 0, 0]);
    const deg = vectorOf('rotation', [0, 0, 0]);
    cfg.rotation = eulerToRotationMatrix(deg[0] * Math.PI / 180, deg[1] * Math.PI / 180, deg[2] * Math.PI / 180);
  }
  return cfg;
}

// ── layout: branch order shared by the DAE assembler and the equation ───────────────────────────
/** Signal (Physical, direction `out`) ports of each joint, in residual order. */
export const JOINT_SIGNAL_PORTS: Record<JointKind, readonly string[]> = {
  revolute: ['q', 'w', 'fx', 'fy', 'fz', 'f_reac', 'tx', 'ty', 'tz', 't_reac'],
  prismatic: ['x', 'v', 'fx', 'fy', 'fz', 'f_reac', 'tx', 'ty', 'tz', 'tbx', 'tby', 'tbz', 't_reac'],
  spherical: ['fx', 'fy', 'fz', 'f_reac', 'rx', 'ry', 'rz'],
  universal: ['angle1', 'angle2', 'w1', 'w2', 'fx', 'fy', 'fz', 'f_reac', 't_reac'],
  weld: ['fx', 'fy', 'fz', 'f_reac', 'tx', 'ty', 'tz', 'tbx', 'tby', 'tbz', 't_reac', 'pos_err', 'rot_err'],
};

interface JointShape {
  /** names of the scalar multipliers (no Kirchhoff port) */
  lambdas: string[];
  /** F-side torque branches tx,ty,tz exist (some rotation is constrained) */
  torque: boolean;
  /** torque on B is a separate branch (the joint has a lever arm: prismatic, weld) */
  bTorque: boolean;
}
const SHAPE: Record<JointKind, JointShape> = {
  revolute: { lambdas: ['lambda1', 'lambda2'], torque: true, bTorque: false },
  prismatic: { lambdas: ['lambda1', 'lambda2'], torque: true, bTorque: true },
  spherical: { lambdas: [], torque: false, bTorque: false },
  universal: { lambdas: ['lambda'], torque: true, bTorque: false },
  weld: { lambdas: [], torque: true, bTorque: true },
};
const XYZ = ['x', 'y', 'z'];

export interface JointBranchSpec {
  name: string;
  /** `coord` is the Frame pose coordinate (0..5 = Px..Rz) the through variable acts on; always explicit for joints */
  ports: { id: string; sign: number; coord?: number }[];
}

/**
 * Branch variables of a joint, in residual order: force on F [fx fy fz], multipliers, torque on F [tx ty tz],
 * torque on B [tbx tby tbz] (only with a lever arm) and then one signal branch per wired measurement port.
 * Kirchhoff routing is explicit: a wrench component names the Frame coordinate it loads.
 */
export function jointBranchSpecs(kind: JointKind, ports: readonly string[]): JointBranchSpec[] {
  const shape = SHAPE[kind];
  const out: JointBranchSpec[] = [];
  XYZ.forEach((a, i) => out.push({ name: `f${a}`, ports: [{ id: 'b', sign: -1, coord: i }, { id: 'f', sign: 1, coord: i }] }));
  shape.lambdas.forEach((name) => out.push({ name, ports: [] }));
  if (shape.torque) {
    XYZ.forEach((a, i) => out.push({
      name: `t${a}`,
      ports: shape.bTorque
        ? [{ id: 'f', sign: 1, coord: 3 + i }]
        : [{ id: 'b', sign: -1, coord: 3 + i }, { id: 'f', sign: 1, coord: 3 + i }],
    }));
  }
  if (shape.bTorque) XYZ.forEach((a, i) => out.push({ name: `tb${a}`, ports: [{ id: 'b', sign: 1, coord: 3 + i }] }));
  for (const name of JOINT_SIGNAL_PORTS[kind]) {
    if (ports.includes(name)) out.push({ name: `signal_${name}`, ports: [{ id: name, sign: 1 }] });
  }
  return out;
}

/** Multiplier branches (seeded away from zero before the first solve so the constraint Jacobian is not degenerate). */
export const isJointMultiplierName = (variable: string): boolean => /_branch_lambda\d*$/.test(variable);

// ── equation ────────────────────────────────────────────────────────────────────────────────────
export interface JointEvaluation {
  /** residual rows aligned with jointBranchSpecs */
  residuals: number[];
  /** the measured quantities (by signal port id), at the current iterate */
  measurements: Record<string, number>;
}

export interface JointInputs {
  across: any[];
  dAcross: any[];
  branch: number[];
  params: Record<string, any>;
  ports: string[];
  nodeId: string;
  /** step size of the backward difference that produced dAcross; undefined/0 selects the instantaneous rate */
  dt?: number;
}

interface Pose { P: Vector3; R: Mat3 }
const poseOf = (f: number[]): Pose => ({ P: pos(f), R: eulerToRotationMatrix(f[3], f[4], f[5]) });
const stepBack = (f: number[], df: number[], dt: number): number[] => f.map((v, i) => v - dt * (df[i] ?? 0));

/** Angle about unit axis `a` (B-local) between two orientations, principal value, from R_rel = R_B^T R_F. */
function angleAbout(Rrel: Mat3, t1: Vector3, t2: Vector3): number {
  const image = mulMV(Rrel, t1);
  return Math.atan2(dot(t2, image), dot(t1, image));
}

/**
 * Universal-joint kinematics: B-local axis1 and F-local axis2 are kept perpendicular (constraint a.b = 0, a = R_B axis1,
 * b = R_F axis2). angle1 is the rotation of b about a, angle2 the rotation of a about b (signed principal values).
 * Rates are the discrete derivative over `dt` when known (exact for the backward difference), else the spatial rate.
 */
export function universalKinematics(
  Bf: number[], Ff: number[], dBf: number[], dFf: number[],
  axes: { axis1: Vector3; axis2: Vector3 }, dt = 0,
) {
  const B = poseOf(Bf), F = poseOf(Ff);
  const a = mulMV(B.R, axes.axis1), b = mulMV(F.R, axes.axis2);
  const n = cross(a, b);
  const localN = cross(axes.axis1, axes.axis2);
  const angles = (Bp: Pose, Fp: Pose) => {
    const a1 = mulMV(Bp.R, axes.axis1), b2 = mulMV(Fp.R, axes.axis2);
    return {
      angle1: Math.atan2(dot(b2, mulMV(Bp.R, localN)), dot(b2, mulMV(Bp.R, axes.axis2))),
      angle2: Math.atan2(dot(a1, mulMV(Fp.R, localN)), dot(a1, mulMV(Fp.R, axes.axis1))),
    };
  };
  const now = angles(B, F);
  const c = dot(a, b);
  let w1: number, w2: number;
  if (dt > 0) {
    const before = angles(poseOf(stepBack(Bf, dBf, dt)), poseOf(stepBack(Ff, dFf, dt)));
    w1 = wrapPi(now.angle1 - before.angle1) / dt;
    w2 = wrapPi(now.angle2 - before.angle2) / dt;
  } else {
    const relativeW = sub(frameAngularVelocity(euler(Ff), euler(dFf)), frameAngularVelocity(euler(Bf), euler(dBf)));
    const denominator = Math.max(1e-12, 1 - c * c);
    const wa = dot(relativeW, a), wb = dot(relativeW, b);
    w1 = (wa - c * wb) / denominator;
    w2 = (wb - c * wa) / denominator;
  }
  return { a, b, n, constraint: c, angle1: now.angle1, angle2: now.angle2, w1, w2 };
}

export function evaluateJoint(kind: JointKind, input: JointInputs): JointEvaluation {
  const cfg = jointConfiguration(kind, input.params, input.nodeId);
  const bi = input.ports.indexOf('b'), fi = input.ports.indexOf('f');
  const Bf = frame(input.across[bi]), Ff = frame(input.across[fi]);
  const dBf = frame(input.dAcross[bi]), dFf = frame(input.dAcross[fi]);
  const B = poseOf(Bf), F = poseOf(Ff);
  const dt = input.dt !== undefined && Number.isFinite(input.dt) && input.dt > 0 ? input.dt : 0;
  const prev = dt
    ? { B: poseOf(stepBack(Bf, dBf, dt)), F: poseOf(stepBack(Ff, dFf, dt)) }
    : null;
  const shape = SHAPE[kind];
  const br = input.branch;
  const d = sub(F.P, B.P);
  const residuals: number[] = [];
  const m: Record<string, number> = {};

  // wrench exerted by the joint on F (world components), assembled from the multipliers of the active constraints
  let force: Vector3 = [br[0], br[1], br[2]];
  let torque: Vector3 = [0, 0, 0];
  let constraintForce: Vector3 = [br[0], br[1], br[2]];
  let constraintTorque: Vector3 = [0, 0, 0];
  const lambdaBase = 3;
  const torqueBase = lambdaBase + shape.lambdas.length;
  if (shape.torque) torque = [br[torqueBase], br[torqueBase + 1], br[torqueBase + 2]];
  const rows: number[] = [];

  switch (kind) {
    case 'spherical': {
      rows.push(d[0], d[1], d[2]);
      const rot = computeRelativeAngleAxis(euler(Bf) as Vector3, euler(Ff) as Vector3);
      m.rx = rot.angle * rot.axis[0];
      m.ry = rot.angle * rot.axis[1];
      m.rz = rot.angle * rot.axis[2];
      break;
    }
    case 'weld': {
      const pW0 = mulMV(B.R, cfg.offset);
      const dErr = sub(d, pW0);
      rows.push(dErr[0], dErr[1], dErr[2]);
      // world-frame rotation error E = R_F R0^T R_B^T = exp(rho_hat); rho = sin(theta) n is smooth and has unit gradient
      const E = mulMM(mulMM(F.R, transposeM(cfg.rotation)), transposeM(B.R));
      const rho = skewVee(E);
      m.pos_err = norm(dErr);
      m.rot_err = Math.atan2(norm(rho), (trace(E) - 1) / 2);
      // [fx fy fz] rows come first, then the torque rows (rho), then the B-side torque balance
      rows.push(rho[0], rho[1], rho[2]);
      break;
    }
    case 'prismatic': {
      const a = cfg.axis;
      const [c1, c2] = perpendicularBasis(a);
      const c1W = mulMV(B.R, c1), c2W = mulMV(B.R, c2), aW = mulMV(B.R, a);
      const l1 = br[lambdaBase], l2 = br[lambdaBase + 1];
      const slide = dot(aW, d);
      let rate: number;
      if (prev) rate = (slide - dot(mulMV(prev.B.R, a), sub(prev.F.P, prev.B.P))) / dt;
      else {
        const wB = frameAngularVelocity(euler(Bf), euler(dBf));
        rate = dot(aW, sub(pos(dFf), pos(dBf))) + dot(d, cross(wB, aW));
      }
      constraintForce = add(scale(c1W, l1), scale(c2W, l2));
      const damper = scale(aW, -cfg.damping * rate);
      force = add(constraintForce, damper);
      // force rows: f - (sum lambda c_W) - damper ; multiplier rows: c_W . d ; torque rows: rho ; B torque rows below
      const E = mulMM(F.R, transposeM(B.R));
      const rho = skewVee(E);
      rows.push(br[0] - force[0], br[1] - force[1], br[2] - force[2], dot(c1W, d), dot(c2W, d), rho[0], rho[1], rho[2]);
      m.x = slide;
      m.v = rate;
      break;
    }
    case 'revolute': {
      const a = cfg.axis;
      const [t1, t2] = perpendicularBasis(a);
      const t1W = mulMV(B.R, t1), t2W = mulMV(B.R, t2);
      const aB = mulMV(B.R, a), aF = mulMV(F.R, a);
      rows.push(d[0], d[1], d[2], dot(t1W, aF), dot(t2W, aF));
      const Rrel = mulMM(transposeM(B.R), F.R);
      const q = angleAbout(Rrel, t1, t2);
      let w: number;
      if (prev) {
        const dR = mulMM(mulMM(transposeM(B.R), F.R), transposeM(mulMM(transposeM(prev.B.R), prev.F.R)));
        w = Math.atan2(dot(a, skewVee(dR)), (trace(dR) - 1) / 2) / dt;
      } else {
        const wRel = sub(frameAngularVelocity(euler(Ff), euler(dFf)), frameAngularVelocity(euler(Bf), euler(dBf)));
        w = dot(wRel, aB);
      }
      constraintTorque = add(scale(cross(aF, t1W), br[lambdaBase]), scale(cross(aF, t2W), br[lambdaBase + 1]));
      torque = add(constraintTorque, scale(aB, -cfg.damping * w));
      rows.push(br[torqueBase] - torque[0], br[torqueBase + 1] - torque[1], br[torqueBase + 2] - torque[2]);
      m.q = q;
      m.w = w;
      break;
    }
    case 'universal': {
      const k = universalKinematics(Bf, Ff, dBf, dFf, cfg, dt);
      constraintTorque = scale(k.n as Vector3, br[lambdaBase]);
      torque = [0, 1, 2].map(
        (i) => constraintTorque[i] - cfg.damping * (k.w1 * k.a[i] + k.w2 * k.b[i]),
      ) as Vector3;
      rows.push(d[0], d[1], d[2], k.constraint, br[torqueBase] - torque[0], br[torqueBase + 1] - torque[1], br[torqueBase + 2] - torque[2]);
      m.angle1 = k.angle1;
      m.angle2 = k.angle2;
      m.w1 = k.w1;
      m.w2 = k.w2;
      break;
    }
  }

  residuals.push(...rows);
  if (shape.bTorque) {
    // moment balance of the massless joint about B's origin: t_B = -t_F - d x f_F  =>  branch tb + t + d x f = 0
    const lever = cross(d, [br[0], br[1], br[2]]);
    const tbBase = torqueBase + 3;
    residuals.push(
      br[tbBase] + br[torqueBase] + lever[0],
      br[tbBase + 1] + br[torqueBase + 1] + lever[1],
      br[tbBase + 2] + br[torqueBase + 2] + lever[2],
    );
  }

  // measurements that are plain functions of the branch variables
  m.fx = br[0]; m.fy = br[1]; m.fz = br[2];
  m.f_reac = norm(constraintForce);
  m.tx = torque[0]; m.ty = torque[1]; m.tz = torque[2];
  if (kind === 'universal') m.t_reac = br[lambdaBase];
  else m.t_reac = norm(kind === 'weld' || kind === 'prismatic' ? torque : constraintTorque);
  if (shape.bTorque) {
    const tbBase = torqueBase + 3;
    m.tbx = br[tbBase]; m.tby = br[tbBase + 1]; m.tbz = br[tbBase + 2];
  }

  return { residuals, measurements: m };
}

/** Residual rows of a joint equation factory: kinematic/force rows followed by one `branch - measurement` row per signal. */
export function jointResiduals(kind: JointKind, input: JointInputs): number[] {
  const { residuals, measurements } = evaluateJoint(kind, input);
  const out = [...residuals];
  let next = residuals.length;
  for (const name of JOINT_SIGNAL_PORTS[kind]) {
    if (!input.ports.includes(name)) continue;
    out.push(input.branch[next++] - measurements[name]);
  }
  return out;
}

/** Pose error vector of a weld at the given frames: [dx dy dz] (m) and the world rotation vector sin(theta) n (rad). */
export function weldPoseError(cfg: JointConfig, B: number[], F: number[]): { position: Vector3; rotation: Vector3 } {
  const Bp = poseOf(B), Fp = poseOf(F);
  const position = sub(sub(pos(F), pos(B)), mulMV(Bp.R, cfg.offset));
  const E = mulMM(mulMM(Fp.R, transposeM(cfg.rotation)), transposeM(Bp.R));
  return { position, rotation: skewVee(E) };
}

/** Reference pose of F given B (used to seed the initial guess): translation B + R_B p0 and orientation R_B R0 (weld) or R_B. */
export function jointReferencePose(cfg: JointConfig, B: number[]): number[] {
  if (cfg.kind !== 'weld') return [...B];
  const Bp = poseOf(B);
  const shift = mulMV(Bp.R, cfg.offset);
  const R = mulMM(Bp.R, cfg.rotation);
  return [B[0] + shift[0], B[1] + shift[1], B[2] + shift[2], ...rotationMatrixToEuler(R)];
}

/** Reference pose of B given F (inverse of jointReferencePose), used when only the follower side is anchored. */
export function jointReferenceBase(cfg: JointConfig, F: number[]): number[] {
  if (cfg.kind !== 'weld') return [...F];
  const Fp = poseOf(F);
  const RB = mulMM(Fp.R, transposeM(cfg.rotation));
  const shift = mulMV(RB, cfg.offset);
  return [F[0] - shift[0], F[1] - shift[1], F[2] - shift[2], ...rotationMatrixToEuler(RB)];
}
/** Inverse of eulerToRotationMatrix for R = Rz Ry Rx, ry in [-pi/2, pi/2]. */
export function rotationMatrixToEuler(R: Mat3): Vector3 {
  const sy = -R[2][0];
  const cy = Math.hypot(R[0][0], R[1][0]);
  if (cy > 1e-9) return [Math.atan2(R[2][1], R[2][2]), Math.atan2(sy, cy), Math.atan2(R[1][0], R[0][0])];
  // gimbal lock: attribute the whole rotation to rz
  return [0, Math.atan2(sy, cy), Math.atan2(-R[0][1], R[1][1])];
}

// ── scalar <-> Frame interfaces (WP-13b) ────────────────────────────────────────────────────────
/**
 * The Rotational / Translational Multibody Interface blocks are the ONLY scalar <-> Frame bridges. They use the joint
 * conventions above: the axis is a B-local unit vector (normalized at load, a zero / malformed vector is the
 * INVALID_JOINT_PARAMETER diagnostic), the world axis is R_B axis, the through wrench acts on F (+) and B (-) with explicit
 * Frame coordinates (jointBranchSpecs), and the relative rate is the discrete derivative over the solver step.
 */
export const INTERFACE_SIGNAL_PORT: Record<string, string> = { rot_multibody_interface: 'w', trans_multibody_interface: 'v' };

export function interfaceAxis(params: Record<string, any> | undefined, nodeId: string, label: string): Vector3 {
  const v = readVector(params?.axis, [0, 0, 1]);
  if (!v || !v.every(Number.isFinite) || Math.hypot(v[0], v[1], v[2]) < 1e-12) {
    throw new MultibodyConstraintDiagnosticError(
      'INVALID_JOINT_PARAMETER', nodeId, ['b', 'f'], `${label} "${nodeId}": axis must contain three finite numbers and must be nonzero.`,
    );
  }
  return unit(v as Vector3);
}

export interface InterfaceKinematics {
  /** unit axis in world coordinates, R_B axis */
  axisWorld: Vector3;
  /** F - B origin offset in world coordinates (lever arm of a force on F about B's origin) */
  offset: Vector3;
  /** rotation rate of F relative to B about the axis (rad/s) or slide rate of F along it (m/s), per `kind` */
  rate: number;
}

export function interfaceKinematics(
  kind: 'rotation' | 'translation', Bf: number[], Ff: number[], dBf: number[], dFf: number[], axis: Vector3, dt?: number,
): InterfaceKinematics {
  const B = poseOf(Bf), F = poseOf(Ff);
  const step = dt !== undefined && Number.isFinite(dt) && dt > 0 ? dt : 0;
  const aW = mulMV(B.R, axis);
  const d = sub(F.P, B.P);
  const prev = step ? { B: poseOf(stepBack(Bf, dBf, step)), F: poseOf(stepBack(Ff, dFf, step)) } : null;
  let rate: number;
  if (kind === 'rotation') {
    if (prev) {
      const dR = mulMM(mulMM(transposeM(B.R), F.R), transposeM(mulMM(transposeM(prev.B.R), prev.F.R)));
      rate = Math.atan2(dot(axis, skewVee(dR)), (trace(dR) - 1) / 2) / step;
    } else {
      rate = dot(sub(frameAngularVelocity(euler(Ff), euler(dFf)), frameAngularVelocity(euler(Bf), euler(dBf))), aW);
    }
  } else if (prev) {
    rate = (dot(aW, d) - dot(mulMV(prev.B.R, axis), sub(prev.F.P, prev.B.P))) / step;
  } else {
    const wB = frameAngularVelocity(euler(Bf), euler(dBf));
    rate = dot(aW, sub(pos(dFf), pos(dBf))) + dot(d, cross(wB, aW));
  }
  return { axisWorld: aW, offset: d, rate };
}

/** Branch layout of an interface: scalar through (R -> C), wrench components on F/B, then the signal branch when wired. */
export function interfaceBranchSpecs(kind: 'rotation' | 'translation', ports: readonly string[]): JointBranchSpec[] {
  const out: JointBranchSpec[] = [{ name: kind === 'rotation' ? 'torque' : 'force', ports: [{ id: 'r', sign: -1 }, { id: 'c', sign: 1 }] }];
  const wrench = kind === 'rotation' ? 'tx ty tz' : 'fx fy fz';
  const base = kind === 'rotation' ? 3 : 0;
  wrench.split(' ').forEach((name, i) => out.push({ name, ports: [{ id: 'b', sign: -1, coord: base + i }, { id: 'f', sign: 1, coord: base + i }] }));
  if (kind === 'translation') XYZ.forEach((a, i) => out.push({ name: `tb${a}`, ports: [{ id: 'b', sign: 1, coord: 3 + i }] }));
  const signal = kind === 'rotation' ? 'w' : 'v';
  if (ports.includes(signal)) out.push({ name: `signal_${signal}`, ports: [{ id: signal, sign: 1 }] });
  return out;
}

/** Residual rows of an interface equation factory, aligned with interfaceBranchSpecs. */
export function interfaceResiduals(
  kind: 'rotation' | 'translation', input: Pick<JointInputs, 'across' | 'dAcross' | 'branch' | 'params' | 'ports' | 'nodeId' | 'dt'>,
): number[] {
  const label = kind === 'rotation' ? 'Rotational Multibody Interface' : 'Translational Multibody Interface';
  const axis = interfaceAxis(input.params, input.nodeId, label);
  const idx = (id: string) => input.ports.indexOf(id);
  const Bf = frame(input.across[idx('b')]), Ff = frame(input.across[idx('f')]);
  const dBf = frame(input.dAcross[idx('b')]), dFf = frame(input.dAcross[idx('f')]);
  const k = interfaceKinematics(kind, Bf, Ff, dBf, dFf, axis, input.dt);
  const br = input.branch;
  const network = input.across[idx('r')] - input.across[idx('c')];
  // kinematics: the network port pair follows the relative motion of the Frames; statics: the through variable of the
  // network is the magnitude of the wrench applied along the world axis
  const rows: number[] = [network - k.rate];
  for (let i = 0; i < 3; i++) rows.push(br[1 + i] - br[0] * k.axisWorld[i]);
  if (kind === 'translation') {
    const lever = cross(k.offset, [br[1], br[2], br[3]]);
    for (let i = 0; i < 3; i++) rows.push(br[4 + i] + lever[i]);
  }
  if (input.ports.includes(kind === 'rotation' ? 'w' : 'v')) rows.push(br[rows.length] - network);
  return rows;
}
