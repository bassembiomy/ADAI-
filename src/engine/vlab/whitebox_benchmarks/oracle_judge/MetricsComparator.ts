import { ToleranceProfile } from './ToleranceProfiles';

export interface JudgmentVerdict {
  passed: boolean;
  nrmsePercent: number;
  steadyStateErrorPercent: number;
  tauSim?: number;
  tauRef?: number;
  tauErrorPercent?: number;
  diagnostics: string[];
}

export class MetricsComparator {
  static calculateNRMSE(ySim: number[], yRef: number[]): number {
    if (ySim.length !== yRef.length || ySim.length === 0) return 100;
    let sumSq = 0;
    let minRef = Infinity;
    let maxRef = -Infinity;

    for (let i = 0; i < yRef.length; i++) {
      const err = ySim[i] - yRef[i];
      sumSq += err * err;
      if (yRef[i] < minRef) minRef = yRef[i];
      if (yRef[i] > maxRef) maxRef = yRef[i];
    }
    const rmse = Math.sqrt(sumSq / yRef.length);
    const range = maxRef - minRef;
    if (Math.abs(range) < 1e-9) {
      return rmse < 1e-7 ? 0 : 100;
    }
    return (rmse / range) * 100;
  }

  static calculateTimeConstant(time: number[], signal: number[], finalValue: number): number {
    const target = (1 - Math.exp(-1)) * finalValue; // 63.2%
    for (let i = 0; i < signal.length - 1; i++) {
      if ((signal[i] <= target && signal[i + 1] >= target) || (signal[i] >= target && signal[i + 1] <= target)) {
        const t0 = time[i];
        const t1 = time[i + 1];
        const v0 = signal[i];
        const v1 = signal[i + 1];
        if (Math.abs(v1 - v0) < 1e-12) return t0;
        return t0 + (target - v0) * ((t1 - t0) / (v1 - v0));
      }
    }
    return time[time.length - 1];
  }

  static judgeTrajectory(
    time: number[],
    ySim: number[],
    yRef: number[],
    profile: ToleranceProfile,
    refTau?: number
  ): JudgmentVerdict {
    const diagnostics: string[] = [];
    const nrmsePercent = this.calculateNRMSE(ySim, yRef);

    const simFinal = ySim[ySim.length - 1] ?? 0;
    const refFinal = yRef[yRef.length - 1] ?? 0;
    const ssDenom = Math.abs(refFinal) > 1e-9 ? Math.abs(refFinal) : 1.0;
    const steadyStateErrorPercent = (Math.abs(simFinal - refFinal) / ssDenom) * 100;

    let tauSim: number | undefined;
    let tauErrorPercent: number | undefined;

    if (refTau && refTau > 0) {
      tauSim = this.calculateTimeConstant(time, ySim, refFinal);
      tauErrorPercent = (Math.abs(tauSim - refTau) / refTau) * 100;
      if (tauErrorPercent > profile.maxTauErrorPercent) {
        diagnostics.push(`Tau error ${tauErrorPercent.toFixed(2)}% exceeds limit ${profile.maxTauErrorPercent}%`);
      }
    }

    if (nrmsePercent > profile.maxNrmsePercent) {
      diagnostics.push(`NRMSE ${nrmsePercent.toFixed(2)}% exceeds limit ${profile.maxNrmsePercent}%`);
    }
    if (steadyStateErrorPercent > profile.maxSteadyStateErrorPercent) {
      diagnostics.push(`Steady state error ${steadyStateErrorPercent.toFixed(2)}% exceeds limit ${profile.maxSteadyStateErrorPercent}%`);
    }

    return {
      passed: diagnostics.length === 0,
      nrmsePercent,
      steadyStateErrorPercent,
      tauSim,
      tauRef: refTau,
      tauErrorPercent,
      diagnostics,
    };
  }
}
