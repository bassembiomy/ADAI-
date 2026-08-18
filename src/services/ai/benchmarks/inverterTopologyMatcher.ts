import { XBridgeDomainModel } from '../adapters/xbridgeDomainModel';

export interface TopologyMatchResult {
  isComplete: boolean;
  dcSourceId?: string;
  sineId?: string;
  pwmId?: string;
  bridgeId?: string;
  filterId?: string;
  loadId?: string;
  scopeId?: string;
  errors: string[];
}

export class InverterTopologyMatcher {
  public static match(model: XBridgeDomainModel): TopologyMatchResult {
    const errors: string[] = [];
    const dc = Array.from(model.components.values()).find(c => c.type === 'DC_VOLTAGE_SOURCE');
    const sine = Array.from(model.components.values()).find(c => c.type === 'WAVEFORM_GENERATOR');
    const pwm = Array.from(model.components.values()).find(c => c.type === 'SPWM_GENERATOR');
    const bridge = Array.from(model.components.values()).find(c => c.type === 'FULL_H_BRIDGE');
    const filter = Array.from(model.components.values()).find(c => c.type === 'LC_FILTER');
    const load = Array.from(model.components.values()).find(c => c.type === 'RESISTIVE_LOAD');
    const scope = Array.from(model.components.values()).find(c => c.type === 'VOLTAGE_SENSOR_SCOPE');

    if (!dc || !sine || !pwm || !bridge || !filter || !load || !scope) {
      errors.push('Missing one or more required inverter components in domain graph.');
      return { isComplete: false, errors };
    }

    const hasConn = (sId: string, sPort: string, tId: string, tPort: string) =>
      model.connections.some(c => c.sourceBlockId === sId && c.sourcePortId === sPort && c.targetBlockId === tId && c.targetPortId === tPort);

    if (!hasConn(sine.id, 'out_signal', pwm.id, 'in_modulation')) errors.push('Missing Sine to PWM modulation connection.');
    if (!hasConn(pwm.id, 'out_pwm', bridge.id, 'gate_pwm')) errors.push('Missing PWM to H-Bridge gate connection.');
    if (!hasConn(dc.id, 'pos', bridge.id, 'dc_pos') || !hasConn(dc.id, 'neg', bridge.id, 'dc_neg')) errors.push('Missing DC Bus to H-Bridge supply rails.');
    if (!hasConn(bridge.id, 'ac_pos', filter.id, 'in_pos') || !hasConn(bridge.id, 'ac_neg', filter.id, 'in_neg')) errors.push('Missing H-Bridge AC output to LC Filter inputs.');
    if (!hasConn(filter.id, 'out_pos', load.id, 'pos') || !hasConn(filter.id, 'out_neg', load.id, 'neg')) errors.push('Missing LC Filter output to Load (including negative return path).');
    if (!hasConn(load.id, 'pos', scope.id, 'probe_pos') || !hasConn(load.id, 'neg', scope.id, 'probe_neg')) errors.push('Missing dual Voltage Scope probes across Load terminals.');

    return {
      isComplete: errors.length === 0,
      dcSourceId: dc.id,
      sineId: sine.id,
      pwmId: pwm.id,
      bridgeId: bridge.id,
      filterId: filter.id,
      loadId: load.id,
      scopeId: scope.id,
      errors
    };
  }
}
