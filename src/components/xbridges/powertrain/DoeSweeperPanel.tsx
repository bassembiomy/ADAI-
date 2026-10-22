// Results table and calibration export of the DoE Sweeper block (X-Bridges properties panel).
import React, { useMemo, useState } from 'react';
import type { XBlock } from '../../../engine/xbridges/types';
import { doeSweeperPointCount, doeSweeperResults } from '../../../engine/xbridges/powertrain/blocks/doeSweeper';
import {
  bestRowIndices, calibrationMapsFromResults, doeModuleTable, mappedEngineTablesFromResults,
} from '../../../engine/xbridges/powertrain/calibrationExport';
import { baseSoiMap, fullLoadFuelLimit, injectionDurationMap, smokeLimiterMap, toCalibrationMap2D } from '../../../engine/xbridges/powertrain/mrPldMaps';

export interface DoeAvailableBlock { id: string; type: string; label?: string; params: Record<string, any> }

interface Props {
  block: XBlock;
  availableBlocks?: DoeAvailableBlock[];
  onUpdate: (blockId: string, data: Partial<XBlock>) => void;
  onExportDoeData?: (headers: string[], data: number[][]) => void;
}

const RESPONSES = ['T_brake', 'BSFC', 'P_max', 'T_exh', 'NOx'];
const ENGINE_TYPES = ['PT_MAPPED_SI_ENGINE', 'PT_MAPPED_CI_ENGINE'];
const MAP_KINDS: [string, string][] = [
  ['baseSoi', '1. Base SOI (speed x fuel)'], ['fullLoadFuel', '7. Full-load fuel limit (speed)'], ['fullLoadTorque', '7. Full-load torque (speed)'],
  ['smoke', '6. Smoke limiter (speed x boost)'], ['injectionDuration', '3. Injection duration (speed x fuel)'],
];
const SMOKE_BOOST_BP = [1, 1.5, 2, 2.5, 3];
const INJ_Q_FRACTIONS = [0.25, 0.5, 0.75, 1];
const fmt = (v: number | undefined): string => (v === undefined ? '' : Number.isInteger(v) ? String(v) : Number(v.toPrecision(5)).toString());
const selectCls = 'w-full text-xs px-2 py-1.5 border border-[#333] bg-[#0a0a0a] text-[#e0e0e0] rounded outline-none focus:border-[#c9a86c]';
const buttonCls = 'w-full p-2 bg-[#c9a86c] text-white rounded font-bold text-xs hover:bg-[#b8975a] transition-all disabled:opacity-40';

export const DoeSweeperPanel: React.FC<Props> = ({ block, availableBlocks = [], onUpdate, onExportDoeData }) => {
  const rows = useMemo(() => doeSweeperResults(block.state), [block.state]);
  const factors = useMemo(
    () => (typeof block.params.factors === 'string' ? block.params.factors : '').split(',').map((s: string) => s.trim()).filter((s: string) => s !== ''),
    [block.params.factors],
  );
  const objective: string = typeof block.params.objective === 'string' ? block.params.objective : 'BSFC';
  const total = useMemo(() => doeSweeperPointCount(block.params), [block.params]);
  const complete = rows.length > 0 && rows.length >= total;
  const grid = rows.some(r => r.op !== undefined);
  const best = useMemo(() => bestRowIndices(rows, objective), [rows, objective]);
  const maxTorque = rows.reduce((m, r) => (r.responses.T_brake !== undefined && r.responses.T_brake > m ? r.responses.T_brake : m), 0);

  const [ecuId, setEcuId] = useState('');
  const [engId, setEngId] = useState('');
  const [tRef, setTRef] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [mapKind, setMapKind] = useState('baseSoi');
  const [qFull, setQFull] = useState('185');
  const [lamLimit, setLamLimit] = useState<string | null>(null);
  const [mapId, setMapId] = useState('');

  const ecus = availableBlocks.filter(b => b.type === 'PT_CALIBRATION_ECU');
  const engines = availableBlocks.filter(b => ENGINE_TYPES.includes(b.type));
  const maps = useMemo(() => {
    try { return calibrationMapsFromResults(rows, factors, { objective }); } catch { return null; }
  }, [rows, factors, objective]);

  const writeEcu = () => {
    const ecu = ecus.find(b => b.id === ecuId);
    if (!ecu) return;
    try {
      const m = calibrationMapsFromResults(rows, factors, { objective });
      const params: Record<string, any> = { ...ecu.params, mode: 'Map', speedBp: m.speedBp, loadBp: m.loadBp };
      for (const f of factors) params[`map_${f}`] = m.maps[f];
      onUpdate(ecu.id, { params });
      setMessage('');
    } catch (e) { setMessage(e instanceof Error ? e.message : String(e)); }
  };

  const calMaps = availableBlocks.filter(b => b.type === 'PT_CALIBRATION_MAP_2D');
  const lambdaDefault = Number(block.params.Lambda_min) > 0 ? Number(block.params.Lambda_min) : 1.3;

  const writeMap = () => {
    const target = calMaps.find(b => b.id === mapId);
    if (!target) return;
    try {
      const q100 = Number(qFull), lambdaMin = Number(lamLimit ?? lambdaDefault);
      if (!Number.isFinite(q100) || q100 <= 0) throw new Error('Fuel quantity at 100 % load must be a positive number');
      const qPerLoad = q100 / 100;
      let p: ReturnType<typeof toCalibrationMap2D>;
      if (mapKind === 'baseSoi') { const m = baseSoiMap(rows, { qPerLoad, objective }); p = toCalibrationMap2D({ x: m.speedBp, y: m.qBp, z: m.soi }); }
      else if (mapKind === 'fullLoadFuel') { const m = fullLoadFuelLimit(rows, { qPerLoad, objective }); p = toCalibrationMap2D({ x: m.speedBp, z: m.qMax }); }
      else if (mapKind === 'fullLoadTorque') { const m = fullLoadFuelLimit(rows, { qPerLoad, objective }); p = toCalibrationMap2D({ x: m.speedBp, z: m.torque }); }
      else if (mapKind === 'smoke') {
        const m = smokeLimiterMap(rows, { qPerLoad, lambdaMin, boostBp: SMOKE_BOOST_BP });
        p = toCalibrationMap2D({ x: m.speedBp, y: m.boostBp, z: m.qSmoke });
      } else {
        const m = injectionDurationMap(rows, { qTargets: INJ_Q_FRACTIONS.map(f => f * q100) });
        p = toCalibrationMap2D({ x: m.speedBp, y: m.qBp, z: m.et });
        if (m.clipped.length > 0) { onUpdate(target.id, { params: { ...target.params, ...p } }); setMessage(`Targets outside the measured range were clamped: ${m.clipped.map(c => `${c.q} mg at ${c.N} rpm`).join(', ')}`); return; }
      }
      onUpdate(target.id, { params: { ...target.params, ...p } });
      setMessage('');
    } catch (e) { setMessage(e instanceof Error ? e.message : String(e)); }
  };

  const writeEngine = () => {
    const eng = engines.find(b => b.id === engId);
    if (!eng) return;
    const T_ref = Number(tRef ?? maxTorque);
    if (!Number.isFinite(T_ref) || T_ref <= 0) { setMessage('Reference torque must be a positive number'); return; }
    try {
      // f_air = f_fuel * AFR: stoichiometric for the SI engine, lean for the CI engine (the export default).
      const t = mappedEngineTablesFromResults(rows, { objective, T_ref, ...(eng.type === 'PT_MAPPED_SI_ENGINE' ? { afr: 14.7 } : {}) });
      onUpdate(eng.id, { params: { ...eng.params, ...t } });
      setMessage('');
    } catch (e) { setMessage(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <section className="space-y-3">
      <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">DoE results</h3>
      {ecus.filter(b => b.params?.mode === 'Map').map(b => (
        <p key={b.id} role="alert" className="text-xs text-amber-400">
          {`${(b as any).label ?? b.id}: the Calibration ECU is in Map mode, so the sweep factors are ignored. Set its Mode to DoE override to run a new sweep.`}
        </p>
      ))}
      {rows.length === 0 ? (
        <p className="text-xs text-slate-500">Run the simulation to collect sweep results.</p>
      ) : (
        <div className="overflow-x-auto max-h-64 overflow-y-auto border border-[#333] rounded">
          <table aria-label="DoE results" className="w-full text-[10px] font-mono text-slate-300">
            <thead className="bg-[#0a0a0a] text-slate-400">
              <tr>
                <th className="px-1 py-1 text-left">#</th>
                {grid && <th className="px-1 py-1 text-right">N</th>}
                {grid && <th className="px-1 py-1 text-right">Load</th>}
                {factors.map(f => <th key={f} className="px-1 py-1 text-right">{f}</th>)}
                {RESPONSES.map(r => <th key={r} className="px-1 py-1 text-right">{r}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.index} className={r.feasible ? '' : 'text-slate-500'}>
                  <td className="px-1 py-0.5">
                    {r.index}
                    {!r.feasible && <span aria-label="infeasible" title={r.violations.join(', ')} className="ml-1 text-[#c9a86c]">x</span>}
                    {best.has(r.index) && <span aria-label="best" title="Best feasible row of the operating point" className="ml-1 text-[#c9a86c]">*</span>}
                  </td>
                  {grid && <td className="px-1 py-0.5 text-right">{fmt(r.op?.N)}</td>}
                  {grid && <td className="px-1 py-0.5 text-right">{fmt(r.op?.Load)}</td>}
                  {factors.map((f, k) => <td key={f} className="px-1 py-0.5 text-right">{fmt(r.point[k])}</td>)}
                  {RESPONSES.map(n => <td key={n} className="px-1 py-0.5 text-right">{fmt(r.responses[n])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400">{`${rows.length} of ${total} points`}</p>
      {rows.length > 0 && !complete && <p className="text-xs text-[#c9a86c]">Finish the sweep to write calibration maps</p>}

      <button type="button" className={buttonCls} disabled={rows.length === 0 || !onExportDoeData}
        onClick={() => { const d = doeModuleTable(rows, factors, RESPONSES); onExportDoeData?.(d.headers, d.data); }}>
        Send to DOE module
      </button>

      <div className="space-y-2 pt-2 border-t border-[#333]">
        <label className="block text-xs font-medium text-slate-400">Target ECU
          <select aria-label="Target ECU" className={selectCls} value={ecuId} onChange={e => setEcuId(e.target.value)}>
            <option value="" />
            {ecus.map(b => <option key={b.id} value={b.id}>{b.label ?? b.id}</option>)}
          </select>
        </label>
        {maps && maps.missing.length > 0 && (
          <p role="alert" className="text-xs text-[#c9a86c]">
            No feasible point at {maps.missing.map(m => `${m.N} rpm / ${m.Load} %`).join(', ')}; filled from the nearest operating point.
          </p>
        )}
        <button type="button" className={buttonCls} disabled={!complete || ecuId === ''} onClick={writeEcu}>Write optimum to ECU</button>
      </div>

      <div className="space-y-2 pt-2 border-t border-[#333]">
        <label className="block text-xs font-medium text-slate-400">Target engine
          <select aria-label="Target engine" className={selectCls} value={engId} onChange={e => setEngId(e.target.value)}>
            <option value="" />
            {engines.map(b => <option key={b.id} value={b.id}>{b.label ?? b.id}</option>)}
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-400">Reference torque (N*m)
          <input type="number" aria-label="Reference torque (N*m)" className={selectCls} value={tRef ?? String(maxTorque)}
            onChange={e => setTRef(e.target.value)} />
        </label>
        <button type="button" className={buttonCls} disabled={!complete || engId === ''} onClick={writeEngine}>Write maps to Mapped Engine</button>
      </div>

      <div className="space-y-2 pt-2 border-t border-[#333]">
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Calibration map</h3>
        <label className="block text-xs font-medium text-slate-400">Calibration map
          <select aria-label="Calibration map" className={selectCls} value={mapKind} onChange={e => setMapKind(e.target.value)}>
            {MAP_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-400">Fuel quantity at 100 % load (mg/stroke)
          <input type="number" aria-label="Fuel quantity at 100 % load (mg/stroke)" className={selectCls} value={qFull} onChange={e => setQFull(e.target.value)} />
        </label>
        <label className="block text-xs font-medium text-slate-400">Smoke lambda limit
          <input type="number" aria-label="Smoke lambda limit" className={selectCls} value={lamLimit ?? String(lambdaDefault)} onChange={e => setLamLimit(e.target.value)} />
        </label>
        <label className="block text-xs font-medium text-slate-400">Target map
          <select aria-label="Target map" className={selectCls} value={mapId} onChange={e => setMapId(e.target.value)}>
            <option value="" />
            {calMaps.map(b => <option key={b.id} value={b.id}>{b.label ?? b.id}</option>)}
          </select>
        </label>
        <button type="button" className={buttonCls} disabled={!complete || mapId === ''} onClick={writeMap}>Write calibration map</button>
      </div>
      {message !== '' && <p role="alert" className="text-xs text-[#c9a86c]">{message}</p>}
    </section>
  );
};
