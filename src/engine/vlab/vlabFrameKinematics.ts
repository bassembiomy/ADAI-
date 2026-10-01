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
  const dx = rB[0] - rA[0];
  const dy = rB[1] - rA[1];
  const dz = rB[2] - rA[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
