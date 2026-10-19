import type { HmiComponent } from '../../types/sysml_types';
import type { JunctionData, Layer, StateData, TransitionData, VariableDef } from '../../types/sm_types';
import { STATE_MACHINE_RUNTIME_BUNDLE } from '../../generated/stateMachineRuntimeBundle';
import { migrateStateMachineModel } from '../../utils/stateMachine/smModelMigration';
import { serializeInlineScriptJson } from '../../utils/stateMachine/smInlineScriptSerialization';
import { normalizeHmiComponents } from '../hmi/hmiModel';
import { getPortableHmiScript, renderHmiWidgetSvg, renderPortableHmiMarkup, resolveHmiReportComponents } from '../hmi/hmiReport';
import { getPortableHmiInputQueueScript } from '../hmi/hmiInputQueue';
import { escapeHtml, wrapFigure } from './reportDiagramModel';
import type { DiagramRect } from './reportDiagramModel';

const HMI_FIGURE_PADDING = 20;
const HMI_PROTOTYPE_PADDING = 20;
/** Portrait print content box width in CSS px (180mm). */
const HMI_PORTRAIT_CONTENT_WIDTH = 680;

/** Bounds of every widget in report coordinates; widgets truncate their texts to their own box, so nothing sticks out. */
export function computeHmiDesignBounds(components: readonly HmiComponent[]): DiagramRect {
  const positioned = resolveHmiReportComponents([...components]);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  positioned.forEach(c => {
    // Mirror the size renderHmiWidgetSvg uses for the widget frame.
    const w = Math.max(40, Number(c.width) || 140);
    const h = Math.max(40, Number(c.height) || 90);
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x + w);
    maxY = Math.max(maxY, c.y + h);
  });
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 100, height: 100 };
  return {
    x: minX - HMI_FIGURE_PADDING,
    y: minY - HMI_FIGURE_PADDING,
    width: Math.max(1, maxX - minX + 2 * HMI_FIGURE_PADDING),
    height: Math.max(1, maxY - minY + 2 * HMI_FIGURE_PADDING),
  };
}

/** Static picture of the configured HMI components plus a list of what each one is bound to. */
export function renderHmiDesignSection(components: HmiComponent[], variables: VariableDef[], activeStateIds: string[], states: readonly { id: string; name: string }[] = []): string {
  if (components.length === 0) return '';
  const positioned = resolveHmiReportComponents(components);
  const values = Object.fromEntries(variables.map(v => [v.id, v.currentValue]));
  const variableNames = Object.fromEntries(variables.filter(v => v.name).map(v => [v.id, v.name]));
  const stateNames = Object.fromEntries(states.filter(st => st.name).map(st => [st.id, st.name]));
  const widgets = positioned
    .map(c => `<g transform="translate(${c.x}, ${c.y})">${renderHmiWidgetSvg(c, values, { activeStateIds, variableNames, stateNames })}</g>`)
    .join('');
  const svgInner = `<g style="color:var(--text-primary,#182231);font-family:sans-serif">${widgets}</g>`;
  let html = `<div class="hmi-design" style="max-width:100%;overflow-wrap:anywhere">`;
  html += wrapFigure(svgInner, `HMI layout (${components.length} component${components.length === 1 ? '' : 's'})`, computeHmiDesignBounds(components));
  const variableName = (id: string | null | undefined): string => (id ? variableNames[id] || id : '');
  const boundNames = (c: HmiComponent): string => {
    const ids = [c.variableId, ...(c.variableIds ?? []), c.pressVariableId, c.cursorVariableId].filter((id, i, all): id is string => !!id && all.indexOf(id) === i);
    return ids.length ? ids.map(variableName).join(', ') : 'Unbound';
  };
  const rows = components.map(c => {
    const stateName = c.stateId ? stateNames[c.stateId] || c.stateId : '';
    return `<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(String(c.type))}</td><td>${escapeHtml(boundNames(c))}</td><td>${stateName ? escapeHtml(stateName) : '&mdash;'}</td></tr>`;
  }).join('');
  html += `<table class="data hmi-components"><thead><tr><th>Component</th><th>Type</th><th>Bound variable</th><th>State binding</th></tr></thead><tbody>${rows}</tbody></table>`;
  html += `</div>`;
  return html;
}

export interface HmiPrototypeInput {
  hmiComponents: HmiComponent[];
  variables: VariableDef[];
  states: StateData[];
  junctions: JunctionData[];
  transitions: TransitionData[];
  layers: Layer[];
  tickMs: number;
  safetyMode: boolean;
}

/** Self-contained interactive simulator (canvas, dashboard, event log, inline runtime) scaled to fit the report width. */
export function renderHmiPrototypeSection(input: HmiPrototypeInput): string {
  const { hmiComponents, variables, states, junctions, transitions, layers, tickMs, safetyMode } = input;
  if (hmiComponents.length === 0) return '';
  let minX = 0, minY = 0, maxX = 0, maxY = 0;
  resolveHmiReportComponents(hmiComponents).forEach(c => {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x + c.width);
    maxY = Math.max(maxY, c.y + c.height);
  });

  const padding = HMI_PROTOTYPE_PADDING;
  const width = Math.max(100, maxX - minX + padding * 2);
  const height = Math.max(100, maxY - minY + padding * 2);
  // The canvas wrapper has a 1px border outside its content box.
  const naturalWidth = width + 2;
  const naturalHeight = height + 2;
  // Wider than the 680px portrait content box: print the simulator on a landscape page (see .report-wide-page).
  const wide = naturalWidth > HMI_PORTRAIT_CONTENT_WIDTH;

  const standaloneMigration = migrateStateMachineModel({
    tickMs,
    states,
    junctions,
    transitions,
    variables,
    layers,
    safetyMode,
  });

  // Serialize presentation data separately from the authoritative model.
  const serializedVariables = variables.map(v => ({
    ...v,
    id: v.id,
    name: v.name,
    type: v.type,
    defaultValue: v.initialValue,
    currentValue: v.currentValue
  }));

  const serializedStates = states.map(s => ({
    id: s.id,
    name: s.name,
    parentId: s.parentId
  }));

  const serializedHmiComponents = normalizeHmiComponents(hmiComponents);
  const componentsHtml = renderPortableHmiMarkup(serializedHmiComponents, variables);

  const prototypeHtml = `
        <div class="hmi-sim-container">
          <style>
            .hmi-sim-container {
              background: #0a0a0c;
              color: #e8e8ec;
              border: 1px solid #2a2a36;
              border-radius: 12px;
              padding: 24px;
              font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
              margin-top: 30px;
              box-shadow: 0 10px 30px rgba(0,0,0,0.5);
              box-sizing: border-box;
              width: 100%;
              max-width: 100%;
              overflow: hidden;
            }
            .hmi-sim-header {
              display: flex;
              flex-wrap: wrap;
              gap: 8px 16px;
              justify-content: space-between;
              align-items: center;
              border-bottom: 1px solid #2a2a36;
              padding-bottom: 12px;
              margin-bottom: 20px;
            }
            .hmi-sim-title {
              color: #f97316;
              font-size: 16px;
              font-weight: 700;
              margin: 0;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            .hmi-sim-subtitle {
              color: #8888a0;
              font-size: 11px;
              margin: 4px 0 0;
            }
            .sim-toolbar {
              display: flex;
              flex-wrap: wrap;
              gap: 8px;
            }
            .hmi-sim-header > div { min-width: 0; overflow-wrap: anywhere; }
            .sim-btn {
              background: #1a1a20;
              border: 1px solid #2a2a36;
              color: #e8e8ec;
              border-radius: 6px;
              padding: 6px 12px;
              cursor: pointer;
              font-size: 12px;
              font-weight: 600;
              transition: all 0.15s;
              outline: none;
            }
            .sim-btn:hover {
              background: #22222a;
              border-color: #f97316;
            }
            .sim-btn.active {
              background: rgba(249, 115, 22, 0.15);
              border-color: #f97316;
              color: #f97316;
            }
            .hmi-canvas-wrapper {
              position: relative;
              border: 1px solid #2a2a36;
              border-radius: 8px;
              background: #111115;
              margin: 0;
              box-shadow: inset 0 0 20px rgba(0,0,0,0.8);
              transform-origin: 0 0;
            }
            .hmi-canvas-fit {
              position: relative;
              width: 100%;
              margin: 0 auto 20px;
              overflow: visible;
            }
            #sim-dashboard > div { min-width: 0; }
            #sim-dashboard > div > div {
              white-space: normal !important;
              overflow: visible !important;
              text-overflow: clip !important;
              overflow-wrap: anywhere;
            }
            #sim-event-log > div { flex-wrap: wrap; overflow-wrap: anywhere; min-width: 0; }
            #sim-event-log > div > span { min-width: 0 !important; overflow-wrap: anywhere; }
            @media print {
              .hmi-sim-container { max-width: 100%; padding: 12px; box-shadow: none; break-inside: avoid; page-break-inside: avoid; }
              .hmi-canvas-fit { break-inside: avoid; page-break-inside: avoid; }
            }
            .hmi-comp-container {
              position: absolute;
              box-sizing: border-box;
            }
            .hmi-btn {
              width: 100%;
              height: 100%;
              border-radius: 6px;
              border: 1px solid #333;
              background: linear-gradient(180deg, #222230, #18181e);
              color: #e0e0e0;
              font-size: 10px;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              transition: all 0.12s;
              box-shadow: 0 2px 4px rgba(0,0,0,0.4);
              outline: none;
              user-select: none;
            }
            .hmi-btn:hover {
              background: linear-gradient(180deg, #2a2a3a, #1e1e26);
              border-color: #f97316;
            }
            .hmi-btn:active {
              transform: translateY(1px);
              box-shadow: 0 1px 2px rgba(0,0,0,0.4);
            }
            .hmi-btn.active {
              background: rgba(249, 115, 22, 0.1);
              border-color: #f97316;
              color: #f97316;
              box-shadow: 0 0 8px rgba(249, 115, 22, 0.3);
            }
            .hmi-toggle-track {
              width: 40px;
              height: 20px;
              border-radius: 10px;
              background: #333;
              position: relative;
              cursor: pointer;
              transition: background 0.2s;
            }
            .hmi-toggle-track.active {
              background: #22c55e;
            }
            .hmi-toggle-thumb {
              width: 16px;
              height: 16px;
              border-radius: 50%;
              background: white;
              position: absolute;
              top: 2px;
              left: 2px;
              transition: transform 0.2s;
              box-shadow: 0 1px 3px rgba(0,0,0,0.4);
            }
            .hmi-toggle-track.active .hmi-toggle-thumb {
              transform: translateX(20px);
            }
            .hmi-lamp-circle {
              width: 24px;
              height: 24px;
              border-radius: 50%;
              background: #111;
              border: 2px solid #555;
              transition: all 0.2s;
            }
            .hmi-lamp-circle.active {
              box-shadow: 0 0 12px var(--glow-color, #22c55e);
              background: var(--glow-color, #22c55e);
            }
            .hmi-led-circle {
              width: 10px;
              height: 10px;
              border-radius: 50%;
              background: #222;
              border: 1px solid #111;
              transition: all 0.2s;
            }
            .hmi-led-circle.active {
              background: var(--led-color, #ef4444);
              box-shadow: 0 0 8px var(--led-color, #ef4444);
              border-color: var(--led-color, #ef4444);
            }
            .hmi-knob-circle {
              width: 100%;
              height: 100%;
              border-radius: 50%;
              background: conic-gradient(from 0deg, #2a2a36, #1a1a24, #2a2a36, #1a1a24, #2a2a36);
              border: 2px solid #333340;
              box-shadow: 0 3px 8px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05);
              position: relative;
              transition: transform 0.1s;
            }
            .hmi-knob-dot {
              width: 4px;
              height: 4px;
              background: #f97316;
              border-radius: 50%;
              position: absolute;
              top: 4px;
              left: 50%;
              transform: translateX(-50%);
              box-shadow: 0 0 4px rgba(249,115,22,0.8);
            }
            .hmi-knob-inner {
              width: 45%;
              height: 45%;
              border-radius: 50%;
              background: #0d0d10;
              border: 1px solid #222230;
              position: absolute;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              display: flex;
              align-items: center;
              justify-content: center;
              color: #444;
              font-size: 8px;
            }
            .knob-lp-ring {
              position: absolute;
              inset: -3px;
              border-radius: 50%;
              border: 1.5px solid #f97316;
              opacity: 0;
              pointer-events: none;
              transition: opacity 0.2s, transform 0.2s;
              transform: scale(0.9);
            }
            .hmi-mode-card {
              border: 1px solid #222;
              background: #1a1a20;
              border-radius: 6px;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              cursor: pointer;
              transition: all 0.15s;
              padding: 4px;
              box-sizing: border-box;
            }
            .hmi-mode-card.active {
              border-color: #f97316;
              background: rgba(249, 115, 22, 0.1);
              box-shadow: 0 0 6px rgba(249, 115, 22, 0.3);
            }
            .selector-mode-card.active {
              border-color: #f97316 !important;
              background: rgba(249, 115, 22, 0.15) !important;
              box-shadow: 0 0 5px rgba(249, 115, 22, 0.3);
            }
            .selector-mode-card.cursor {
              border-color: #4db8ff !important;
              background: rgba(77, 184, 255, 0.15) !important;
              box-shadow: 0 0 5px rgba(77, 184, 255, 0.3);
            }
            @keyframes sim-spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          </style>

          <div class="hmi-sim-header">
            <div>
              <div class="hmi-sim-title">HMI INTERACTIVE SIMULATOR</div>
              <div class="hmi-sim-subtitle">Interact with components to step through the system logic in real-time.</div>
            </div>
            <div class="sim-toolbar">
              <button id="sim-btn-power" onclick="window.ADIA_SIM.toggleSimRunning()" class="sim-btn">PAUSE</button>
              <button id="sim-btn-step" onclick="window.ADIA_SIM.step()" class="sim-btn">STEP TICK</button>
              <button id="sim-btn-reset" onclick="window.ADIA_SIM.reset()" class="sim-btn">RESET</button>
            </div>
          </div>

          <div id="portable-hmi-fit" class="hmi-canvas-fit" data-natural-width="${naturalWidth}" data-natural-height="${naturalHeight}" data-wide="${wide ? 1 : 0}" style="max-width: ${naturalWidth}px; height: ${naturalHeight}px;">
            <div id="portable-hmi-canvas" class="hmi-canvas-wrapper" style="width: ${width}px; height: ${height}px;">
              ${componentsHtml}
            </div>
          </div>

          <div style="background: #111115; border: 1px solid #2a2a36; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
            <div style="font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #555568; margin-bottom: 12px; border-bottom: 1px solid #2a2a36; padding-bottom: 6px;">Live Engineering Dashboard</div>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(min(145px, 100%), 1fr)); gap: 10px;" id="sim-dashboard"></div>
          </div>

          <div style="background: #111115; border: 1px solid #2a2a36; border-radius: 8px; padding: 16px;">
            <div style="display: flex; flex-wrap: wrap; gap: 6px; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <div style="font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #555568;">Event Log</div>
              <button onclick="window.ADIA_SIM.clearLog()" style="font-size: 10px; color: #555568; cursor: pointer; border: 1px solid #2a2a36; background: none; border-radius: 4px; padding: 2px 6px;">Clear</button>
            </div>
            <div id="sim-event-log" style="max-height: 120px; overflow-y: auto; overflow-wrap: anywhere; font-family: monospace; font-size: 11px; display: flex; flex-direction: column; gap: 4px;"></div>
          </div>
        </div>

        <script>
          (function() {
            // Scale-to-fit: the canvas keeps its natural design size; a transform shrinks it to the available width.
            var fit = document.getElementById("portable-hmi-fit");
            var canvas = document.getElementById("portable-hmi-canvas");
            if (!fit || !canvas) return;
            var naturalWidth = Number(fit.getAttribute("data-natural-width")) || 1;
            var naturalHeight = Number(fit.getAttribute("data-natural-height")) || 1;
            var printing = false;
            function mmToPx(mm) {
              var probe = document.createElement("div");
              probe.style.cssText = "position:absolute;visibility:hidden;width:" + mm + "mm;height:0";
              document.body.appendChild(probe);
              var px = probe.getBoundingClientRect().width;
              document.body.removeChild(probe);
              return px || mm * 96 / 25.4;
            }
            function applyScale() {
              var available;
              if (printing) {
                // Portrait A4 content width (210mm - 2 x 15mm margin) or, for wide canvases, the landscape one (297mm - 2 x 15mm),
                // minus the container padding (2 x 12px) and border (2px).
                available = mmToPx(fit.getAttribute("data-wide") === "1" ? 267 : 180) - 26;
              } else {
                available = fit.clientWidth || naturalWidth;
              }
              var scale = Math.max(0.05, Math.min(1, available / naturalWidth));
              canvas.style.transform = scale < 1 ? "scale(" + scale + ")" : "none";
              fit.style.height = Math.ceil(naturalHeight * scale) + "px";
              fit.style.maxWidth = (printing ? Math.floor(naturalWidth * scale) : naturalWidth) + "px";
            }
            function setPrinting(value) { printing = value; applyScale(); }
            applyScale();
            window.addEventListener("resize", applyScale);
            window.addEventListener("load", applyScale);
            window.addEventListener("beforeprint", function() { setPrinting(true); });
            window.addEventListener("afterprint", function() { setPrinting(false); });
            if (window.matchMedia) {
              var printQuery = window.matchMedia("print");
              var onPrintChange = function(event) { setPrinting(!!event.matches); };
              if (printQuery.addEventListener) printQuery.addEventListener("change", onPrintChange);
              else if (printQuery.addListener) printQuery.addListener(onPrintChange);
            }
            if (typeof ResizeObserver !== "undefined" && fit.parentElement) {
              new ResizeObserver(function() { if (!printing) applyScale(); }).observe(fit.parentElement);
            }
          })();
        </script>

        <script>
          ${STATE_MACHINE_RUNTIME_BUNDLE}
          ${getPortableHmiScript()}
          (function() {
            ${getPortableHmiInputQueueScript()}
            const PROJECT_DATA = {
              model: ${serializeInlineScriptJson(standaloneMigration.model)},
              modelDiagnostics: ${serializeInlineScriptJson(standaloneMigration.diagnostics)},
              variables: ${serializeInlineScriptJson(serializedVariables)},
              states: ${serializeInlineScriptJson(serializedStates)},
              hmiComponents: ${serializeInlineScriptJson(serializedHmiComponents)},
              tickMs: ${tickMs}
            };

            let varValues = {};
            let varTypes = {};
            let activeStates = {};
            let stateTimers = {};
            let semanticRuntime = null;
            let simRunning = true;
            let simInterval = null;
            let stepCount = 0;
            let simTime = 0;
            let lpTimers = {};
            let audioCtx = null;
            const hmiInputQueue = createHmiInputQueue();
            let committedSamples = [];
            let hmiResetVersion = 0;
            const hmiVariableNames = Object.fromEntries(PROJECT_DATA.variables.filter(v => v.name).map(v => [v.id, v.name]));
            const hmiStateNames = Object.fromEntries(PROJECT_DATA.states.filter(s => s.name).map(s => [s.id, s.name]));
            function queueHmiInput(command) {
              const v = PROJECT_DATA.variables.find(v => v.id === command.variableId);
              if (!v) return { accepted: false, error: "Missing variable binding." };
              const parsed = window.ADIAStateMachineRuntime.parseHmiVariableValue(v, command.value);
              if (!parsed.accepted) return parsed;
              const component = PROJECT_DATA.hmiComponents.find(c => c.id === command.sourceId);
              if (component && command.mode !== "release" && ["input", "slider", "vertical-slider", "knob", "encoder", "hybrid-rotary"].includes(component.type)
                && !(component.encoderValues?.length || component.hybridValues?.length) && v.type !== "bool"
                && (Number(parsed.value) < (component.min ?? 0) || Number(parsed.value) > (component.max ?? 100))) {
                return { accepted: false, error: "Input is outside the configured component range." };
              }
              const released = command.releaseValue === undefined ? undefined
                : window.ADIAStateMachineRuntime.parseHmiVariableValue(v, command.releaseValue);
              if (released && !released.accepted) return released;
              const accepted = hmiInputQueue.enqueue({ ...command, value: parsed.value, releaseValue: released?.value });
              return accepted ? { accepted: true } : { accepted: false, error: "Operator input queue is full." };
            }
            const portableHmi = window.ADIA_HMI.mount(document.getElementById("portable-hmi-canvas"), PROJECT_DATA.hmiComponents, {
              onInput: queueHmiInput,
              onCommand: command => {
                if (command === "step") { simRunning = false; window.ADIA_SIM.step(); }
                else if (command === "reset") window.ADIA_SIM.reset();
                else {
                  if (command === "start") window.ADIA_SIM.reset();
                  simRunning = command !== "pause";
                  updateUi();
                }
              }
            });

            function escapeHtml(str) {
              return String(str || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;')
                .replace(/\x60/g, '&#96;');
            }

            function logEvent(event, detail = "") {
              const el = document.getElementById("sim-event-log");
              if (!el) return;
              const now = new Date();
              const ts = String(now.getMinutes()).padStart(2, "0") + ":" + String(now.getSeconds()).padStart(2, "0") + "." + String(Math.floor(now.getMilliseconds() / 100));
              const entry = document.createElement("div");
              entry.style.display = "flex";
              entry.style.gap = "8px";
              entry.style.borderBottom = "1px solid #1a1a20";
              entry.style.padding = "3px 0";

              const s1 = document.createElement("span");
              s1.style.color = "#555568";
              s1.style.minWidth = "50px";
              s1.textContent = ts;

              const s2 = document.createElement("span");
              s2.style.color = "#4db8ff";
              s2.style.minWidth = "100px";
              s2.style.fontWeight = "bold";
              s2.textContent = event;

              const s3 = document.createElement("span");
              s3.style.color = "#8888a0";
              s3.textContent = detail;

              entry.appendChild(s1);
              entry.appendChild(s2);
              entry.appendChild(s3);

              el.prepend(entry);
              while (el.children.length > 40) el.removeChild(el.lastChild);
            }

            function getVarValById(id) {
              const v = PROJECT_DATA.variables.find(x => x.id === id);
              return v ? varValues[v.name] : null;
            }

            function updateVariableById(id, value) {
              return queueHmiInput({ sourceId: "legacy-report", variableId: id, value });
            }

            function beepBuzzer() {
              try {
                if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                if (audioCtx.state === "suspended") audioCtx.resume();
                if (window.lastBeepTime && Date.now() - window.lastBeepTime < 300) return;
                window.lastBeepTime = Date.now();
                const osc = audioCtx.createOscillator();
                const gainNode = audioCtx.createGain();
                osc.connect(gainNode);
                gainNode.connect(audioCtx.destination);
                osc.type = "sine";
                osc.frequency.value = 1000;
                gainNode.gain.setValueAtTime(0.04, audioCtx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.08);
                osc.start();
                osc.stop(audioCtx.currentTime + 0.08);
              } catch (e) {}
            }

            const displayStateName = (state) => state?.name?.trim() || "State";

            function applySemanticFrame(frame) {
              const nextActiveStates = {};
              frame.activeStateIds.forEach(stateId => {
                const state = semanticRuntime.ir.states[stateId];
                const layer = semanticRuntime.ir.layers[state.layerId];
                const key = layer.decomposition === "AND"
                  ? layer.id + "_" + stateId
                  : layer.id;
                nextActiveStates[key] = stateId;
              });
              activeStates = nextActiveStates;
              stateTimers = { ...frame.stateTimersMs };
              stepCount = frame.sequence;

              PROJECT_DATA.variables.forEach(v => {
                varValues[v.name] = frame.data[v.id];
              });

              frame.actions
                .filter(action => action.startsWith("transition:"))
                .forEach(action => {
                  const transitionId = action.slice("transition:".length);
                  const transition = semanticRuntime.ir.transitions[transitionId];
                  if (!transition) {
                    logEvent("Transition", "Transition");
                    return;
                  }
                  const sourceState = PROJECT_DATA.states.find(
                    state => state.id === transition.sourceStateId
                  );
                  const destinationState = PROJECT_DATA.states.find(
                    state => state.id === transition.destinationStateId
                  );
                  logEvent(
                    "Transition",
                    displayStateName(sourceState)
                      + " → "
                      + displayStateName(destinationState)
                  );
                });
            }

            function stepSimulation() {
              if (!semanticRuntime) return;
              window.ADIAStateMachineRuntime.applyInputs(semanticRuntime, hmiInputQueue.drain());
              const elapsedMs = PROJECT_DATA.tickMs || 100;
              const frame = window.ADIAStateMachineRuntime.stepRuntime(
                semanticRuntime,
                elapsedMs
              );
              simTime += elapsedMs / 1000;
              committedSamples.push({ time: simTime, values: { ...frame.data } });
              if (committedSamples.length > 600) committedSamples.shift();
              applySemanticFrame(frame);
              updateUi();
              if (frame.error) {
                simRunning = false;
                logEvent("Runtime Error", frame.error);
              }
            }

            function updateDashboard() {
              const db = document.getElementById("sim-dashboard");
              if (!db) return;
              db.textContent = "";

              PROJECT_DATA.model.layers.forEach(layer => {
                const layerName = layer.name?.trim() || (layer.id === "root" ? "Root Region" : "Region");
                const activeStateIds = Object.entries(activeStates)
                  .filter(([key]) => key === layer.id || key.startsWith(layer.id + "_"))
                  .map(([, stateId]) => stateId);
                const stateName = activeStateIds
                  .map(stateId => displayStateName(PROJECT_DATA.states.find(s => s.id === stateId)))
                  .join(", ") || "—";
                const cell = document.createElement("div");
                cell.style.background = "#1a1a20";
                cell.style.border = "1px solid #2a2a36";
                cell.style.borderRadius = "6px";
                cell.style.padding = "6px 8px";

                const d1 = document.createElement("div");
                d1.style.fontSize = "8px";
                d1.style.color = "#555568";
                d1.style.textTransform = "uppercase";
                d1.style.overflow = "hidden";
                d1.style.textOverflow = "ellipsis";
                d1.style.whiteSpace = "nowrap";
                d1.textContent = layerName;

                const d2 = document.createElement("div");
                d2.style.fontSize = "11px";
                d2.style.fontWeight = "bold";
                d2.style.color = "#f97316";
                d2.style.marginTop = "2px";
                d2.style.overflow = "hidden";
                d2.style.textOverflow = "ellipsis";
                d2.style.whiteSpace = "nowrap";
                d2.textContent = stateName;

                cell.appendChild(d1);
                cell.appendChild(d2);
                db.appendChild(cell);
              });

              PROJECT_DATA.variables.forEach(v => {
                const val = varValues[v.name];
                let displayVal = String(val !== undefined && val !== null ? val : "");
                if (v.type === "bool") displayVal = val ? "TRUE" : "FALSE";
                const cell = document.createElement("div");
                cell.style.background = "#1a1a20";
                cell.style.border = "1px solid #2a2a36";
                cell.style.borderRadius = "6px";
                cell.style.padding = "6px 8px";

                const d1 = document.createElement("div");
                d1.style.fontSize = "8px";
                d1.style.color = "#555568";
                d1.style.textTransform = "uppercase";
                d1.style.overflow = "hidden";
                d1.style.textOverflow = "ellipsis";
                d1.style.whiteSpace = "nowrap";
                d1.textContent = v.name;

                const d2 = document.createElement("div");
                d2.style.fontSize = "11px";
                d2.style.fontWeight = "bold";
                d2.style.color = v.type === "bool" && val ? "#22c55e" : "#e8e8ec";
                d2.style.marginTop = "2px";
                d2.style.overflow = "hidden";
                d2.style.textOverflow = "ellipsis";
                d2.style.whiteSpace = "nowrap";
                d2.textContent = displayVal;

                cell.appendChild(d1);
                cell.appendChild(d2);
                db.appendChild(cell);
              });
            }

            function updateUi() {
              portableHmi.update(Object.fromEntries(PROJECT_DATA.variables.map(v => [v.id, getVarValById(v.id)])), {
                activeStateIds: Object.values(activeStates), time: simTime, samples: committedSamples, resetVersion: hmiResetVersion,
                variableNames: hmiVariableNames, stateNames: hmiStateNames
              });
              updateDashboard();
            }

            function initializeSimulation() {
              PROJECT_DATA.variables.forEach(v => {
                varTypes[v.name] = v.type;
              });

              try {
                const migrationErrors = PROJECT_DATA.modelDiagnostics.filter(
                  diagnostic => diagnostic.severity === "error"
                );
                if (migrationErrors.length > 0) {
                  throw new Error(
                    migrationErrors
                      .map(diagnostic => diagnostic.code + ": " + diagnostic.message)
                      .join("; ")
                  );
                }
                const built = window.ADIAStateMachineRuntime.buildSemanticModel(
                  PROJECT_DATA.model
                );
                if (!built.ir) {
                  throw new Error(
                    built.diagnostics
                      .map(diagnostic => diagnostic.code + ": " + diagnostic.message)
                      .join("; ")
                  );
                }
                semanticRuntime = window.ADIAStateMachineRuntime.createRuntime(
                  built.ir
                );
                applySemanticFrame(
                  window.ADIAStateMachineRuntime.initializeRuntime(
                    semanticRuntime
                  )
                );
              } catch (error) {
                simRunning = false;
                logEvent(
                  "Init Error",
                  error instanceof Error ? error.message : String(error)
                );
                updateUi();
                return;
              }

              const intervalTime = Math.max(100, PROJECT_DATA.tickMs || 100);
              simInterval = setInterval(() => {
                const container = document.getElementById("sim-event-log");
                if (!container) {
                  clearInterval(simInterval);
                  simInterval = null;
                  if (window.ADIA_SIM) delete window.ADIA_SIM;
                  return;
                }
                if (simRunning) {
                  stepSimulation();
                }
              }, intervalTime);

              updateUi();
              logEvent("System Init", "State machine initialized");
            }

            window.ADIA_SIM = {
              toggleSimRunning() {
                simRunning = !simRunning;
                const btn = document.getElementById("sim-btn-power");
                if (btn) {
                  btn.textContent = simRunning ? "PAUSE" : "RUN";
                  if (simRunning) btn.classList.remove("active");
                  else btn.classList.add("active");
                }
                logEvent(simRunning ? "Sim Resumed" : "Sim Paused");
              },
              step() {
                stepSimulation();
                logEvent("Sim Step", "Manual tick step executed");
              },
              reset() {
                if (!semanticRuntime) return;
                simRunning = false;
                hmiInputQueue.clear();
                hmiResetVersion++;
                committedSamples = [];
                simTime = 0;
                applySemanticFrame(
                  window.ADIAStateMachineRuntime.resetRuntime(semanticRuntime)
                );
                updateUi();
                logEvent("Sim Reset", "All states and variables reset to default");
              },
              clearLog() {
                const el = document.getElementById("sim-event-log");
                if (el) el.textContent = "";
              },
              toggleClick(id) {
                const c = PROJECT_DATA.hmiComponents.find(x => x.id === id);
                if (!c || !c.variableId) return;
                const currentVal = !!getVarValById(c.variableId);
                updateVariableById(c.variableId, !currentVal);
              },
              buttonPress(id, isDown) {
                const c = PROJECT_DATA.hmiComponents.find(x => x.id === id);
                if (!c) return;
                if (c.pressVariableId) {
                  updateVariableById(c.pressVariableId, isDown);
                } else if (c.variableId && isDown) {
                  const currentVal = getVarValById(c.variableId);
                  if (varTypes[c.name] === "bool") {
                    updateVariableById(c.variableId, !currentVal);
                  } else {
                    updateVariableById(c.variableId, 1);
                  }
                }
              },
              sliderChange(id, val) {
                const c = PROJECT_DATA.hmiComponents.find(x => x.id === id);
                if (!c || !c.variableId) return;
                updateVariableById(c.variableId, val);
              },
              inputChange(id, val) {
                const c = PROJECT_DATA.hmiComponents.find(x => x.id === id);
                if (!c || !c.variableId) return;
                updateVariableById(c.variableId, val);
              },
              rotateKnob(id, dir) {
                const c = PROJECT_DATA.hmiComponents.find(x => x.id === id);
                if (!c || !c.variableId) return;
                const v = PROJECT_DATA.variables.find(x => x.id === c.variableId);
                if (!v) return;
                const isHybrid = Array.isArray(c.encoderValues) && c.encoderValues.length > 0;
                const encoderValues = c.encoderValues || [];

                if (c.type === "encoder" && isHybrid) {
                  const idx = encoderValues.findIndex(x => String(x) === String(varValues[v.name]));
                  const currentIndex = idx !== -1 ? idx : 0;
                  const nextIndex = (currentIndex + dir + encoderValues.length) % encoderValues.length;
                  updateVariableById(c.variableId, encoderValues[nextIndex]);
                } else if (c.type === "hybrid-rotary") {
                  const values = c.hybridValues || [];
                  const idx = values.findIndex(x => String(x) === String(varValues[v.name]));
                  const currentIndex = idx !== -1 ? idx : 0;
                  const nextIndex = (currentIndex + dir + values.length) % values.length;
                  updateVariableById(c.variableId, values[nextIndex]);
                } else {
                  const curVal = Number(varValues[v.name]) || 0;
                  const step = v.name.toLowerCase().includes("temp") ? 5 : 1;
                  const newVal = curVal + dir * step;
                  const clampedVal = Math.max(c.min ?? 0, Math.min(c.max ?? 100, newVal));
                  updateVariableById(c.variableId, clampedVal);
                }
              },
              knobPress(id, isDown) {
                const c = PROJECT_DATA.hmiComponents.find(x => x.id === id);
                if (!c || !c.pressVariableId) return;
                const pressVarId = c.pressVariableId;
                const lpRing = document.getElementById("knob-lp-" + c.id);
                if (isDown) {
                  updateVariableById(pressVarId, true);
                  if (lpRing) {
                    lpRing.style.opacity = "1";
                    lpRing.style.transform = "scale(1.1)";
                  }
                  lpTimers[id] = setTimeout(() => {
                    logEvent("Long Press", c.name + " held for 1.5s");
                    if (lpRing) lpRing.style.borderColor = "#22c55e";
                  }, 1500);
                } else {
                  updateVariableById(pressVarId, false);
                  if (lpRing) {
                    lpRing.style.opacity = "0";
                    lpRing.style.transform = "scale(0.9)";
                    lpRing.style.borderColor = "#f97316";
                  }
                  if (lpTimers[id]) {
                    clearTimeout(lpTimers[id]);
                    delete lpTimers[id];
                  }
                }
              },
              modeIconClick(id) {
                const c = PROJECT_DATA.hmiComponents.find(x => x.id === id);
                if (!c || !c.variableId) return;
                updateVariableById(c.variableId, c.targetValue);
              },
              modeSelectorClick(id, idx) {
                const c = PROJECT_DATA.hmiComponents.find(x => x.id === id);
                if (!c || !c.variableId) return;
                updateVariableById(c.variableId, idx);
              }
            };

            initializeSimulation();
          })();
        </script>
      `;

  return wide ? `<div class="report-wide-page">${prototypeHtml}</div>` : prototypeHtml;
}
