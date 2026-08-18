import { XBridgeDomainModel } from '../adapters/xbridgeDomainModel';
import { InverterTopologyMatcher } from './inverterTopologyMatcher';
import { DimensionalEngine } from '../validation/dimensionalEngine';

export interface InverterSimParams {
  vDc: number;
  modulationIndex: number;
  fFundamental: number;
  fCarrier: number;
  inductanceL: number;
  capacitanceC: number;
  loadResistanceR: number;
  tStop: number;
  dt: number;
}

export interface InverterSimResult {
  vRms: number;
  zeroCrossingFrequency: number;
  lowOrderThdPercent: number;
}

export class InverterSimulator {
  public static lowerFromDomainModel(model: XBridgeDomainModel): InverterSimParams {
    const match = InverterTopologyMatcher.match(model);
    if (!match.isComplete) {
      throw new Error(`Cannot lower incomplete topology: ${match.errors.join('; ')}`);
    }

    const dcComp = model.components.get(match.dcSourceId!)!;
    const sineComp = model.components.get(match.sineId!)!;
    const pwmComp = model.components.get(match.pwmId!)!;
    const fltComp = model.components.get(match.filterId!)!;
    const ldComp = model.components.get(match.loadId!)!;

    const vDc = DimensionalEngine.normalize(dcComp.parameters.nominalVoltage as any).normalizedValue;
    const fFund = DimensionalEngine.normalize(sineComp.parameters.frequency as any).normalizedValue;
    const fCarr = DimensionalEngine.normalize(pwmComp.parameters.carrierFrequency as any).normalizedValue;
    const mIdx = DimensionalEngine.normalize(pwmComp.parameters.modulationIndex as any).normalizedValue;
    const L = DimensionalEngine.normalize(fltComp.parameters.inductance as any).normalizedValue;
    const C = DimensionalEngine.normalize(fltComp.parameters.capacitance as any).normalizedValue;
    const R = DimensionalEngine.normalize(ldComp.parameters.resistance as any).normalizedValue;

    return {
      vDc,
      modulationIndex: mIdx,
      fFundamental: fFund,
      fCarrier: fCarr,
      inductanceL: L,
      capacitanceC: C,
      loadResistanceR: R,
      tStop: 0.3,
      dt: 1e-6
    };
  }

  public static simulate(p: InverterSimParams): InverterSimResult {
    let iL = 0;
    let vC = 0;
    const timePoints: number[] = [];
    const vOutPoints: number[] = [];

    const steps = Math.floor(p.tStop / p.dt);
    for (let step = 0; step < steps; step++) {
      const t = step * p.dt;
      const vRef = p.modulationIndex * Math.sin(2 * Math.PI * p.fFundamental * t);
      const triangle = (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * p.fCarrier * t));
      const vBridge = vRef >= triangle ? p.vDc : -p.vDc;

      const diL = (vBridge - vC) / p.inductanceL;
      const iLoad = vC / p.loadResistanceR;
      const dvC = (iL - iLoad) / p.capacitanceC;

      iL += diL * p.dt;
      vC += dvC * p.dt;

      timePoints.push(t);
      vOutPoints.push(vC);
    }

    const startIdx = Math.floor(0.1 / p.dt);
    const windowV = vOutPoints.slice(startIdx);
    const windowT = timePoints.slice(startIdx);

    const sumSq = windowV.reduce((acc, v) => acc + v * v, 0);
    const vRms = Math.sqrt(sumSq / windowV.length);

    // Hysteresis Zero-Crossing Frequency Measurement
    const hysteresis = 5.0; // 5V hysteresis band
    let zeroCrossings = 0;
    let state = windowV[0] >= 0 ? 1 : -1;

    for (let i = 1; i < windowV.length; i++) {
      if (state === -1 && windowV[i] > hysteresis) {
        state = 1;
        zeroCrossings++;
      } else if (state === 1 && windowV[i] < -hysteresis) {
        state = -1;
      }
    }
    const totalTimeWindow = windowT[windowT.length - 1] - windowT[0];
    const zeroCrossingFrequency = zeroCrossings / totalTimeWindow;

    // DFT for Low-Order Harmonics up to 50th order
    const N = windowV.length;
    const kFundamental = Math.round(p.fFundamental * totalTimeWindow);
    let realFund = 0, imagFund = 0;

    for (let n = 0; n < N; n++) {
      const angle = (2 * Math.PI * kFundamental * n) / N;
      realFund += windowV[n] * Math.cos(angle);
      imagFund -= windowV[n] * Math.sin(angle);
    }
    const fundMag = (2 / N) * Math.sqrt(realFund * realFund + imagFund * imagFund);

    let harmonicPowerSum = 0;
    for (let h = 2; h <= 50; h++) {
      const kH = Math.round(h * p.fFundamental * totalTimeWindow);
      if (kH >= N / 2) break;
      let rH = 0, iH = 0;
      for (let n = 0; n < N; n++) {
        const angle = (2 * Math.PI * kH * n) / N;
        rH += windowV[n] * Math.cos(angle);
        iH -= windowV[n] * Math.sin(angle);
      }
      const magH = (2 / N) * Math.sqrt(rH * rH + iH * iH);
      harmonicPowerSum += magH * magH;
    }

    const lowOrderThdPercent = (Math.sqrt(harmonicPowerSum) / fundMag) * 100;

    return {
      vRms,
      zeroCrossingFrequency,
      lowOrderThdPercent
    };
  }
}
