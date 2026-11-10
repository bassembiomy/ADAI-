export type StimulusKind = 'step' | 'ramp' | 'sine' | 'square';

/** Closed-form stimulus generators (Simulink Step / Ramp / Sine Wave / Pulse conventions). */
export function stimulus(kind: StimulusKind, o: Record<string, number> = {}): (t: number) => number {
  switch (kind) {
    case 'step': {
      const time = o.time ?? 1, before = o.before ?? 0, after = o.after ?? 1;
      return (t) => (t >= time ? after : before);
    }
    case 'ramp': {
      const slope = o.slope ?? 1, start = o.start ?? 0, initial = o.initial ?? 0;
      return (t) => (t <= start ? initial : initial + slope * (t - start));
    }
    case 'sine': {
      const a = o.amplitude ?? 1, f = o.frequency ?? 1, ph = o.phase ?? 0, bias = o.bias ?? 0;
      return (t) => bias + a * Math.sin(2 * Math.PI * f * t + ph);
    }
    case 'square': {
      const a = o.amplitude ?? 1, period = o.period ?? 1, duty = o.duty ?? 0.5;
      if (!(period > 0)) throw new Error('stimulus: period must be > 0');
      return (t) => {
        const ph = t - Math.floor(t / period) * period;
        return ph < duty * period ? a : -a;
      };
    }
    default: throw new Error(`stimulus: unknown kind '${String(kind)}'`);
  }
}

/** Numeric edge values (plan 4.1 U3/U4). */
export const SPECIAL_VALUES: number[] = [
  0, -0, 1, -1, Number.MAX_VALUE, -Number.MAX_VALUE, Number.MIN_VALUE, -Number.MIN_VALUE,
  1e-300, -1e-300, 1e300, -1e300, Number.EPSILON, 2.2250738585072014e-308, NaN, Infinity, -Infinity,
];
