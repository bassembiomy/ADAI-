/**
 * Stable ids for simulation things that requirements can link to (WP-01).
 * States and junctions are NOT sim targets: they keep their raw ids.
 * Every variable segment is encodeURIComponent-encoded; `$param` / `$var` are reserved literal segments
 * that cannot collide with an encoded id because `$` encodes to %24.
 */
export type SimTarget =
  | { domain: 'sm'; kind: 'transition' | 'variable'; id: string }
  | { domain: 'xb' | 'vlab'; canvas: string; kind: 'block'; blockId: string }
  | { domain: 'xb' | 'vlab'; canvas: string; kind: 'port'; blockId: string; portId: string }
  | { domain: 'xb' | 'vlab'; canvas: string; kind: 'param'; blockId: string; name: string }
  | { domain: 'vlab'; canvas: string; kind: 'solverVariable'; name: string };

const PREFIX = 'sim:';

const enc = (segment: string): string => {
  if (typeof segment !== 'string' || segment.length === 0) throw new Error('Sim target segment must be a non-empty string');
  return encodeURIComponent(segment);
};

export function formatSimTarget(target: SimTarget): string {
  if (target.domain === 'sm') {
    return `${PREFIX}sm/${target.kind === 'transition' ? 'transition' : 'var'}/${enc(target.id)}`;
  }
  const base = `${PREFIX}${target.domain}/${enc(target.canvas)}`;
  switch (target.kind) {
    case 'block': return `${base}/${enc(target.blockId)}`;
    case 'port': return `${base}/${enc(target.blockId)}/${enc(target.portId)}`;
    case 'param': return `${base}/${enc(target.blockId)}/$param/${enc(target.name)}`;
    case 'solverVariable': return `${base}/$var/${enc(target.name)}`;
  }
}

const dec = (segment: string): string | null => {
  if (segment.length === 0) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
};

export function parseSimTarget(id: string): SimTarget | null {
  if (typeof id !== 'string' || !id.startsWith(PREFIX)) return null;
  const parts = id.slice(PREFIX.length).split('/');
  const [domain, ...rest] = parts;
  if (domain === 'sm') {
    if (rest.length !== 2) return null;
    const value = dec(rest[1]);
    if (value === null) return null;
    if (rest[0] === 'transition') return { domain: 'sm', kind: 'transition', id: value };
    if (rest[0] === 'var') return { domain: 'sm', kind: 'variable', id: value };
    return null;
  }
  if (domain !== 'xb' && domain !== 'vlab') return null;
  if (rest.length < 2 || rest.length > 4) return null;
  const canvas = dec(rest[0]);
  if (canvas === null) return null;
  if (rest.length === 2) {
    if (rest[1] === '$var') return null;
    const blockId = dec(rest[1]);
    return blockId === null ? null : { domain, canvas, kind: 'block', blockId };
  }
  if (rest.length === 3) {
    if (rest[1] === '$var') {
      const name = dec(rest[2]);
      return domain === 'vlab' && name !== null ? { domain, canvas, kind: 'solverVariable', name } : null;
    }
    if (rest[1] === '$param') return null;
    const blockId = dec(rest[1]);
    const portId = dec(rest[2]);
    return blockId === null || portId === null ? null : { domain, canvas, kind: 'port', blockId, portId };
  }
  if (rest[2] !== '$param') return null;
  const blockId = dec(rest[1]);
  const name = dec(rest[3]);
  return blockId === null || name === null ? null : { domain, canvas, kind: 'param', blockId, name };
}

export function isSimTargetId(id: string): boolean {
  return parseSimTarget(id) !== null;
}
