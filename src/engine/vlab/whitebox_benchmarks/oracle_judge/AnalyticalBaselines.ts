export class AnalyticalBaselines {
  static rcCharging(time: number[], Vs: number, R: number, C: number): number[] {
    const tau = R * C;
    return time.map((t) => Vs * (1 - Math.exp(-t / tau)));
  }

  static rlStep(time: number[], Vs: number, R: number, L: number): number[] {
    const tau = L / R;
    const Iss = Vs / R;
    return time.map((t) => Iss * (1 - Math.exp(-t / tau)));
  }

  static massSpringDamper(time: number[], F0: number, m: number, k: number, b: number): number[] {
    const wn = Math.sqrt(k / m);
    const zeta = b / (2 * Math.sqrt(k * m));
    const xss = F0 / k;

    if (zeta < 1.0) {
      // Underdamped
      const wd = wn * Math.sqrt(1 - zeta * zeta);
      return time.map((t) => {
        const decay = Math.exp(-zeta * wn * t);
        const osc = Math.cos(wd * t) + (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(wd * t);
        return xss * (1 - decay * osc);
      });
    } else {
      // Overdamped / Critically damped
      const s1 = -wn * (zeta - Math.sqrt(zeta * zeta - 1));
      const s2 = -wn * (zeta + Math.sqrt(zeta * zeta - 1));
      return time.map((t) => xss * (1 - (s2 * Math.exp(s1 * t) - s1 * Math.exp(s2 * t)) / (s2 - s1)));
    }
  }

  static thermalConduction(time: number[], T_hot: number, T_init: number, Rth: number, Cth: number): number[] {
    const tau = Rth * Cth;
    return time.map((t) => T_hot - (T_hot - T_init) * Math.exp(-t / tau));
  }

  static orificeFlow(dP: number, Cd: number, A: number, rho: number): number {
    return Cd * A * Math.sqrt(2 * rho * Math.abs(dP)) * Math.sign(dP);
  }

  static dcMotorSpeed(
    time: number[],
    Va: number,
    Ra: number,
    La: number,
    Kt: number,
    Ke: number,
    J: number,
    b: number
  ): number[] {
    const denom = Ra * b + Kt * Ke;
    const w_ss = (Kt * Va) / denom;
    const tau_m = (J * Ra) / denom;
    return time.map((t) => w_ss * (1 - Math.exp(-t / tau_m)));
  }
}
