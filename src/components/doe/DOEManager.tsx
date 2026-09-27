import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { fitRSM, fitGMDH, fitTaguchi } from '../../engine/doe/statistics';
import { createXBridgesDOEBlock, createVLabDOEBlock } from '../../engine/doe/integration';
import { PlotlyPlots, PlotType } from './PlotlyPlots';
import type { DOEModelResult, DOEDiagnostic } from '../../engine/doe/types';
import { getSharedDOEWorkerClient } from '../../services/doeWorkerClient';

export interface DOEManagerProps {
  initialData?: {
    headers?: string[];
    data?: number[][];
    activeModel?: 'RSM' | 'GMDH' | 'Taguchi';
    results?: DOEModelResult | null;
  };
  headers?: string[];
  setHeaders?: React.Dispatch<React.SetStateAction<string[]>>;
  data?: number[][];
  setData?: React.Dispatch<React.SetStateAction<number[][]>>;
  activeModel?: 'RSM' | 'GMDH' | 'Taguchi';
  setActiveModel?: React.Dispatch<React.SetStateAction<'RSM' | 'GMDH' | 'Taguchi'>>;
  results?: DOEModelResult | null;
  setResults?: React.Dispatch<React.SetStateAction<DOEModelResult | null>>;
  plotFactors?: { x: number; y: number };
  setPlotFactors?: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  holdValues?: number[];
  setHoldValues?: React.Dispatch<React.SetStateAction<number[]>>;
  plotType?: PlotType;
  setPlotType?: React.Dispatch<React.SetStateAction<PlotType>>;
  calculateRSM?: () => void;
  calculateGMDH?: () => void;
  calculateTaguchi?: () => void;
  handleExportToXBridges?: () => void;
  handleExportToVLab?: () => void;
  onExportToXBridges?: (block: any) => void;
  onExportToVLab?: (block: any) => void;
  addError?: (type: 'error' | 'warning' | 'info', message: string) => void;
  onClose?: () => void;
}

const DEFAULT_HEADERS = ['Factor A', 'Factor B', 'Yield'];
const DEFAULT_DATA: number[][] = [
  [-1, -1, 12.5],
  [1, -1, 15.8],
  [-1, 1, 14.2],
  [1, 1, 22.4],
  [0, 0, 18.1],
  [0, 0, 18.3],
  [0, 0, 18.0],
  [-1.414, 0, 11.2],
  [1.414, 0, 19.5],
  [0, -1.414, 13.1],
  [0, 1.414, 21.0]
];

export const DOEManager: React.FC<DOEManagerProps> = (props) => {
  // Uncontrolled fallbacks
  const [internalHeaders, setInternalHeaders] = useState<string[]>(
    props.initialData?.headers || DEFAULT_HEADERS
  );
  const [internalData, setInternalData] = useState<number[][]>(
    props.initialData?.data || DEFAULT_DATA
  );
  const [internalActiveModel, setInternalActiveModel] = useState<'RSM' | 'GMDH' | 'Taguchi'>(
    props.initialData?.activeModel || 'RSM'
  );
  const [internalResults, setInternalResults] = useState<DOEModelResult | null>(
    props.initialData?.results || null
  );
  const [internalPlotFactors, setInternalPlotFactors] = useState<{ x: number; y: number }>({ x: 0, y: 1 });
  const [internalHoldValues, setInternalHoldValues] = useState<number[]>([]);
  const [internalPlotType, setInternalPlotType] = useState<PlotType>('surface');

  // Resolved state
  const headers = props.headers ?? internalHeaders;
  const setHeaders = props.setHeaders ?? setInternalHeaders;

  const data = props.data ?? internalData;
  const setData = props.setData ?? setInternalData;

  const activeModel = props.activeModel ?? internalActiveModel;
  const setActiveModel = props.setActiveModel ?? setInternalActiveModel;

  const results = props.results !== undefined ? props.results : internalResults;
  const setResults = props.setResults ?? setInternalResults;

  const plotFactors = props.plotFactors ?? internalPlotFactors;
  const setPlotFactors = props.setPlotFactors ?? setInternalPlotFactors;

  const holdValues = props.holdValues ?? internalHoldValues;
  const setHoldValues = props.setHoldValues ?? setInternalHoldValues;

  const plotType = props.plotType ?? internalPlotType;
  const setPlotType = props.setPlotType ?? setInternalPlotType;

  const numFactors = Math.max(1, headers.length - 1);

  // Synchronize hold values when factors change
  useEffect(() => {
    if (data.length > 0 && holdValues.length !== numFactors) {
      const means = new Array(numFactors).fill(0);
      for (let i = 0; i < numFactors; i++) {
        const vals = data.map((r) => r[i] || 0);
        means[i] = vals.reduce((a, b) => a + b, 0) / vals.length;
      }
      setHoldValues(means);
    }
  }, [numFactors, data, holdValues.length, setHoldValues]);

  // Factor management
  const handleAddFactor = useCallback(() => {
    const factorIdx = headers.length; // before response
    const factorName = `Factor ${String.fromCharCode(65 + factorIdx - 1)}`;
    const newHeaders = [...headers.slice(0, -1), factorName, headers[headers.length - 1]];
    const newData = data.map((row) => {
      const responseVal = row[row.length - 1];
      const factorVals = row.slice(0, -1);
      return [...factorVals, 0, responseVal];
    });
    setHeaders(newHeaders);
    setData(newData);
    setResults(null);
  }, [headers, data, setHeaders, setData, setResults]);

  const handleRemoveFactor = useCallback((colIdx: number) => {
    if (headers.length <= 2) {
      props.addError?.('warning', 'A design must have at least one factor and one response.');
      return;
    }
    const newHeaders = headers.filter((_, idx) => idx !== colIdx);
    const newData = data.map((row) => row.filter((_, idx) => idx !== colIdx));
    setHeaders(newHeaders);
    setData(newData);
    setResults(null);
  }, [headers, data, setHeaders, setData, setResults, props]);

  // Run management
  const handleAddRun = useCallback(() => {
    const newRow = new Array(headers.length).fill(0);
    setData([...data, newRow]);
    setResults(null);
  }, [headers.length, data, setData, setResults]);

  const handleRemoveRun = useCallback((rowIdx: number) => {
    if (data.length <= 1) {
      props.addError?.('warning', 'At least one run is required.');
      return;
    }
    const newData = data.filter((_, idx) => idx !== rowIdx);
    setData(newData);
    setResults(null);
  }, [data, setData, setResults, props]);

  const handleCellChange = useCallback((rowIdx: number, colIdx: number, val: number) => {
    const newData = data.map((row, r) =>
      r === rowIdx ? row.map((cell, c) => (c === colIdx ? val : cell)) : row
    );
    setData(newData);
  }, [data, setData]);

  const [isSolving, setIsSolving] = useState(false);

  // Solve execution
  const handleSolve = useCallback(async () => {
    const client = getSharedDOEWorkerClient();
    if (activeModel === 'RSM') {
      if (props.calculateRSM) {
        props.calculateRSM();
      } else {
        setIsSolving(true);
        try {
          const res = await client.fitRSM({ headers, data });
          setResults(res);
          if (res.diagnostics.some((d) => d.severity === 'error')) {
            props.addError?.('error', res.diagnostics.find((d) => d.severity === 'error')?.message || 'RSM solve failed');
          }
        } catch (err: any) {
          props.addError?.('error', err?.message || 'RSM solve failed');
        } finally {
          setIsSolving(false);
        }
      }
    } else if (activeModel === 'GMDH') {
      if (props.calculateGMDH) {
        props.calculateGMDH();
      } else {
        setIsSolving(true);
        try {
          const res = await client.fitGMDH({ headers, data });
          setResults(res);
        } catch (err: any) {
          props.addError?.('error', err?.message || 'GMDH solve failed');
        } finally {
          setIsSolving(false);
        }
      }
    } else if (activeModel === 'Taguchi') {
      if (props.calculateTaguchi) {
        props.calculateTaguchi();
      } else {
        setIsSolving(true);
        try {
          const res = await client.fitTaguchi({ headers, data });
          setResults(res);
        } catch (err: any) {
          props.addError?.('error', err?.message || 'Taguchi solve failed');
        } finally {
          setIsSolving(false);
        }
      }
    }
  }, [activeModel, data, headers, props, setResults]);

  // Export handlers
  const handleExportXBridges = useCallback(() => {
    if (props.handleExportToXBridges) {
      props.handleExportToXBridges();
      return;
    }
    if (!results) return;
    const blockRes = createXBridgesDOEBlock(results);
    if ('success' in blockRes && blockRes.success === false) {
      props.addError?.('error', 'Cannot export invalid DOE model to X-Bridges.');
      return;
    }
    props.onExportToXBridges?.(blockRes);
    props.addError?.('info', `DOE block exported to X-Bridges.`);
  }, [results, props]);

  const handleExportVLab = useCallback(() => {
    if (props.handleExportToVLab) {
      props.handleExportToVLab();
      return;
    }
    if (!results) return;
    const blockRes = createVLabDOEBlock(results);
    if ('success' in blockRes && blockRes.success === false) {
      props.addError?.('error', 'Cannot export invalid DOE model to V-Lab.');
      return;
    }
    props.onExportToVLab?.(blockRes);
    props.addError?.('info', `DOE block exported to V-Lab.`);
  }, [results, props]);

  const hasExportableModel = Boolean(results?.deployment || results?.equation);

  return (
    <div data-testid="doe-manager" className="doe-workspace flex flex-col h-full w-full bg-[var(--surface-canvas)] text-[var(--text-primary)] font-sans">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-default)] bg-[var(--surface-panel)]">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
              DOE Module Suite
            </h2>
            <p className="text-xs text-gray-400">Response Surface, GMDH Neural & Taguchi Robust Design</p>
          </div>

          {/* Model Tabs */}
          <div className="flex bg-[var(--surface-sunken)] rounded-lg p-1 border border-[var(--border-default)] ml-4">
            {(['RSM', 'GMDH', 'Taguchi'] as const).map((m) => (
              <button
                key={m}
                data-testid={`tab-${m.toLowerCase()}`}
                onClick={() => setActiveModel(m)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  activeModel === m
                    ? 'bg-purple-600 text-white shadow'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            data-testid="add-factor-btn"
            onClick={handleAddFactor}
            className="px-3 py-1.5 text-xs bg-[var(--surface-panel)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-default)] rounded-lg font-medium"
          >
            + Add Factor
          </button>
          <button
            data-testid="add-run-btn"
            onClick={handleAddRun}
            className="px-3 py-1.5 text-xs bg-[var(--surface-panel)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-default)] rounded-lg font-medium"
          >
            + Add Run
          </button>
          <button
            data-testid="solve-btn"
            disabled={isSolving}
            onClick={handleSolve}
            className={`px-4 py-1.5 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold shadow-lg shadow-purple-900/30 transition-all ${
              isSolving ? 'opacity-70 cursor-wait' : ''
            }`}
          >
            {isSolving ? 'Solving...' : 'Analyze / Solve'}
          </button>
          <button
            data-testid="export-xbridges-btn"
            disabled={!hasExportableModel}
            onClick={handleExportXBridges}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium border transition-all ${
              hasExportableModel
                ? 'bg-cyan-900/30 border-cyan-700 text-cyan-200 hover:bg-cyan-900/50'
                : 'bg-[var(--surface-panel)] border-[var(--border-subtle)] text-[var(--text-muted)] cursor-not-allowed'
            }`}
          >
            Export to X-Bridges
          </button>
          <button
            data-testid="export-vlab-btn"
            disabled={!hasExportableModel}
            onClick={handleExportVLab}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium border transition-all ${
              hasExportableModel
                ? 'bg-amber-900/30 border-amber-700 text-amber-200 hover:bg-amber-900/50'
                : 'bg-[var(--surface-panel)] border-[var(--border-subtle)] text-[var(--text-muted)] cursor-not-allowed'
            }`}
          >
            Export to V-Lab
          </button>
          {props.onClose && (
            <button
              onClick={props.onClose}
              className="ml-2 p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Diagnostics Alerts */}
      {results?.diagnostics && results.diagnostics.length > 0 && (
        <div data-testid="doe-diagnostics" className="px-6 py-2 bg-[var(--surface-panel)] border-b border-[var(--border-default)] flex flex-wrap gap-2 items-center">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Diagnostics:</span>
          {results.diagnostics.map((diag: DOEDiagnostic, idx: number) => {
            const colorClass =
              diag.severity === 'error'
                ? 'bg-red-950/80 text-red-300 border-red-800'
                : diag.severity === 'warning'
                ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                : 'bg-blue-950/80 text-blue-300 border-blue-800';
            return (
              <span
                key={idx}
                data-testid={`diagnostic-badge-${diag.code}`}
                className={`text-xs px-2.5 py-1 rounded-md border ${colorClass} flex items-center gap-1.5`}
              >
                <span className="font-mono font-bold uppercase text-[10px]">{diag.code}:</span>
                <span>{diag.message}</span>
              </span>
            );
          })}
        </div>
      )}

      {/* Content Body: Table & Charts */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 p-6 overflow-hidden">
        {/* Left Column: Experimental Matrix */}
        <div className="lg:col-span-6 flex flex-col doe-panel ui-card bg-[var(--surface-panel)] border border-[var(--border-default)] rounded-xl overflow-hidden shadow-xl">
          <div className="px-4 py-3 bg-[var(--surface-raised)] border-b border-[var(--border-default)] flex items-center justify-between">
            <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">
              Design Matrix ({data.length} Runs × {numFactors} Factors)
            </span>
            <span className="text-[11px] text-gray-400">Response: <span className="text-amber-400 font-semibold">{headers[headers.length - 1]}</span></span>
          </div>

          <div className="flex-1 overflow-auto p-2">
            <table data-testid="doe-matrix-table" className="engineering-table w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[var(--border-default)] text-[var(--text-secondary)] bg-[var(--table-header-bg)]">
                  <th className="p-2 w-12 text-center text-[var(--text-muted)]">#</th>
                  {headers.map((h, colIdx) => (
                    <th key={colIdx} className="p-2 font-semibold">
                      <div className="flex items-center justify-between gap-1">
                        <span className={colIdx === headers.length - 1 ? 'text-amber-400' : 'text-[var(--text-primary)]'}>
                          {h}
                        </span>
                        {colIdx < headers.length - 1 && headers.length > 2 && (
                          <button
                            data-testid={`remove-factor-${colIdx}`}
                            onClick={() => handleRemoveFactor(colIdx)}
                            className="text-[var(--text-muted)] hover:text-red-400 text-[10px] px-1 rounded"
                            title="Remove factor"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                  <th className="p-2 w-10 text-center"></th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, rowIdx) => (
                  <tr key={rowIdx} className="border-b border-[var(--border-subtle)] hover:bg-[var(--table-row-hover)] transition-colors">
                    <td className="p-2 text-center text-[var(--text-muted)] font-mono text-[11px]">{rowIdx + 1}</td>
                    {row.map((val, colIdx) => (
                      <td key={colIdx} className="p-1">
                        <input
                          data-testid={`cell-${rowIdx}-${colIdx}`}
                          type="number"
                          value={val}
                          onChange={(e) => handleCellChange(rowIdx, colIdx, parseFloat(e.target.value) || 0)}
                          className={`w-full bg-[var(--surface-sunken)] border border-[var(--border-subtle)] rounded px-2 py-1 text-xs font-mono focus:border-purple-500 focus:outline-none ${
                            colIdx === row.length - 1 ? 'text-amber-400' : 'text-[var(--text-primary)]'
                          }`}
                        />
                      </td>
                    ))}
                    <td className="p-1 text-center">
                      {data.length > 1 && (
                        <button
                          data-testid={`remove-run-${rowIdx}`}
                          onClick={() => handleRemoveRun(rowIdx)}
                          className="text-[var(--text-muted)] hover:text-red-400 text-xs px-1"
                          title="Remove run"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Results & Visualization */}
        <div className="lg:col-span-6 flex flex-col doe-panel ui-card bg-[var(--surface-panel)] border border-[var(--border-default)] rounded-xl overflow-hidden shadow-xl">
          {/* Header Controls for Plot Type */}
          <div className="px-4 py-3 bg-[var(--surface-raised)] border-b border-[var(--border-default)] flex items-center justify-between">
            <span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Model Analysis & Graphs</span>
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-[var(--text-muted)]">View:</label>
              <select
                data-testid="plot-type-select"
                value={plotType}
                onChange={(e) => setPlotType(e.target.value as PlotType)}
                className="bg-[var(--surface-sunken)] border border-[var(--border-default)] text-[var(--text-primary)] text-xs rounded px-2 py-1 focus:outline-none"
              >
                <option value="surface">3D Response Surface</option>
                <option value="contour">2D Contour Plot</option>
                <option value="pareto">Pareto Chart</option>
                <option value="residuals">Residuals Plot</option>
                <option value="pred_vs_act">Predicted vs Actual</option>
                <option value="taguchi_main_mean">Taguchi Main Effects (Mean)</option>
                <option value="taguchi_main_sn">Taguchi Main Effects (SNR)</option>
                <option value="taguchi_delta">Taguchi Delta Rank</option>
              </select>
            </div>
          </div>

          {/* Model Statistics & Equation Summary */}
          {results ? (
            <div data-testid="doe-results-summary" className="p-4 border-b border-[var(--border-default)] bg-[var(--surface-raised)]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-purple-400">
                  {results.modelType} Model Equation:
                </span>
                <span className="text-[11px] font-mono text-[var(--text-secondary)]">
                  R²: <strong className="text-[var(--text-primary)]">{(results.rSquared ?? 0).toFixed(4)}</strong> |
                  Adj R²: <strong className="text-[var(--text-primary)]">{(results.adjustedRSquared ?? 0).toFixed(4)}</strong> |
                  RMSE: <strong className="text-[var(--text-primary)]">{(results.rmse ?? 0).toFixed(4)}</strong>
                </span>
              </div>
              <div data-testid="model-equation" className="p-2.5 bg-[var(--surface-sunken)] border border-[var(--border-subtle)] rounded-lg font-mono text-xs text-amber-400 overflow-x-auto">
                {results.equation || 'No algebraic equation available.'}
              </div>
            </div>
          ) : (
            <div data-testid="no-results-placeholder" className="p-4 text-center text-[var(--text-muted)] text-xs italic bg-[var(--surface-panel)] border-b border-[var(--border-default)]">
              No model calculated. Click "Analyze / Solve" to fit the {activeModel} model.
            </div>
          )}

          {/* Plotly Canvas Area */}
          <div data-testid="plotly-container" className="flex-1 p-2 flex items-center justify-center min-h-[300px] overflow-hidden">
            {results ? (
              <PlotlyPlots
                type={plotType}
                data={data}
                results={results}
                factors={plotFactors}
                headers={headers}
                holdValues={holdValues}
                modelType={activeModel}
              />
            ) : (
              <div className="text-gray-600 text-xs italic">
                Awaiting model calculation to render charts...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
