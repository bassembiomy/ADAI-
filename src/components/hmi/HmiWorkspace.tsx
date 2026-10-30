import React, { useEffect, useRef, useState } from 'react';
import type { HmiComponent, HmiComponentType } from '../../types/sysml_types';
import type { VariableDef } from '../../types/sm_types';
import { MomentaryButton, type HmiInput, type HmiInputResult } from './interaction';
import './hmi.css';
import { NumericEntry } from './NumericEntry';
import { HMI_CATALOG, createHmiComponent, getHmiDefinition } from '../../features/hmi/hmiCatalog';
import { parseHmiVariableValue, type HmiRuntimeSnapshot } from '../../features/hmi/hmiModel';
import { HMI_GLYPHS, HMI_ICON_IDS, isHmiIconId, type HmiIconId } from '../../features/hmi/hmiGlyphs';
import { Bulb, CharacterLcd, DialGauge, DotMatrixDisplay, HMI_PALETTE_ICONS, HmiIcon, LcdReadout, LedBar, SegmentDisplay, SegmentLcd, resolveLcdTheme } from './HmiGlyphs';

export type HmiRuntime = HmiRuntimeSnapshot;
export interface HmiWorkspaceProps { variables: VariableDef[]; components: HmiComponent[]; setComponents: React.Dispatch<React.SetStateAction<HmiComponent[]>>; onInput: (command: HmiInput) => HmiInputResult; onClose: () => void; runtime: HmiRuntime; externalOwnedVariableIds: Iterable<string>; onSimulationCommand: (command: 'start'|'pause'|'resume'|'step'|'reset') => void }
const groups = Object.fromEntries(['Inputs','Displays','Layout'].map(category => [category,HMI_CATALOG.filter(c=>c.category===category).map(c=>c.type)]));
const inputTypes = new Set<string>(groups.Inputs);
const title = (s: string) => s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const readOnly = (v: VariableDef | undefined) => Boolean(v && ((v as VariableDef & {readOnly?: boolean; writable?: boolean}).readOnly || (v as VariableDef & {writable?: boolean}).writable === false));
const legacyModes = ['Air Fry','Steam','Oven','Rapid Steam','Broil','Reheat','Warm','Ferment','Defrost','Slow Cook','Dehydrate','Duo Cook'];

function Buzzer({ active, soundType }: {active: boolean; soundType?: OscillatorType}) {
  useEffect(() => {
    if (!active || !window.AudioContext) return;
    const ctx = new AudioContext(); const oscillator = ctx.createOscillator(); const gain = ctx.createGain();
    oscillator.type = soundType || 'square'; oscillator.frequency.value = 1000; gain.gain.value = .06;
    oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start();
    void ctx.resume().catch(() => {});
    return () => { oscillator.stop(); void ctx.close(); };
  }, [active, soundType]);
  return <output aria-label="Buzzer status">{active ? '🔊 Sounding' : '🔇 Silent'}</output>;
}

export function HmiWidget({comp, variables, runtime, editMode, owned, onInput, onSimulationCommand}: {
  comp: HmiComponent; variables: VariableDef[]; runtime: HmiRuntime; editMode: boolean; owned: Set<string>;
  onInput: HmiWorkspaceProps['onInput']; onSimulationCommand: HmiWorkspaceProps['onSimulationCommand'];
}) {
  const [error, setError] = useState('');
  const [stagedValue, setStagedValue] = useState<number | boolean>();
  const variable = variables.find(v => v.id === comp.variableId);
  useEffect(() => { setStagedValue(undefined); }, [comp.type, comp.variableId, variable?.currentValue, runtime.resetVersion]);
  const value = inputTypes.has(comp.type) && stagedValue !== undefined ? stagedValue : variable?.currentValue ?? 0;
  const min = comp.min ?? 0, max = comp.max ?? 100, step = comp.step ?? 1;
  const invalid = !Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step) || step <= 0 ? 'Set finite bounds and a positive step.' : !variable ? 'Bind a variable to enable input.' : readOnly(variable) || comp.writable === false ? 'This binding is read only.' : owned.has(variable.id) ? 'External I/O owns this variable.' : max <= min && variable.type !== 'bool' ? 'Maximum must exceed minimum.' : '';
  const disabled = editMode || Boolean(invalid);
  const send = (next: number | boolean | string, mode: HmiInput['mode'] = 'set', id = comp.variableId): HmiInputResult => {
    const target = variables.find(v => v.id === id);
    if ((editMode && mode !== 'release') || !target || owned.has(target.id) || readOnly(target) || (comp.writable === false && mode !== 'release')) return {accepted: false, error: 'Binding is unavailable or read only.'};
    const parsed = parseHmiVariableValue(target, next);
    if (!parsed.accepted) { setError(parsed.error); return parsed; }
    if (mode !== 'release' && ['input','slider','vertical-slider','knob','rotary','encoder'].includes(comp.type) && !comp.variableIds?.length && !comp.encoderValues?.length && typeof parsed.value === 'number' && (parsed.value < min || parsed.value > max)) { const error = 'Input is outside component bounds.'; setError(error); return {accepted:false,error}; }
    const result = onInput({sourceId: comp.id, variableId: target.id, value: next, mode, ...(mode === 'pulse' ? {releaseValue: comp.inactiveValue ?? (target.type === 'bool' ? false : 0)} : {})});
    if (result.accepted && target.id === comp.variableId) setStagedValue(parsed.value);
    setError(result.accepted ? '' : result.error || 'Input rejected.'); return result;
  };
  const booleanValue = variable?.type === 'bool';
  const press = comp.activeValue ?? (booleanValue ? true : 1), release = comp.inactiveValue ?? (booleanValue ? false : 0);
  const fraction = Math.max(0, Math.min(1, (Number(value) - min) / (max - min || 1)));
  const parsedActive = variable ? parseHmiVariableValue(variable, press) : undefined;
  const active = comp.activeValue === undefined ? Boolean(value) : value === (parsedActive?.accepted ? parsedActive.value : comp.activeValue);
  const formatted = typeof value === 'number' ? value.toFixed(Math.max(0, Math.min(12, comp.precision ?? 0))) : String(value);
  const display = `${formatted}${comp.unit ? ` ${comp.unit}` : ''}`;
  const opts: NonNullable<HmiComponent["options"]> = (comp.options?.length ? comp.options : [{label: 'Off', value: false}, {label: 'On', value: true}]).map(option => {
    const parsed = variable ? parseHmiVariableValue(variable, option.value) : undefined;
    return parsed?.accepted ? {...option, value: parsed.value} : option;
  });
  const getValue = (id?: string | null) => variables.find(v => v.id === id)?.currentValue;
  const valueText = !variable ? '' : typeof value === 'number' ? value.toFixed(Math.max(0, Math.min(12, comp.precision ?? 0))) : String(Number(value));
  const textTemplate = typeof comp.text === 'string' && comp.text.includes('{value}');
  const segmentText = textTemplate ? String(comp.text).split('{value}').join(valueText) : variable ? valueText : comp.text ?? '';
  const numericSegments = !textTemplate && Boolean(variable);
  const iconId = comp.icon && comp.icon !== 'none' ? comp.icon : undefined;
  const inlineIcon = iconId ? <HmiIcon id={iconId} size={16} className="hmi-inline-icon" /> : null;
  const range = (vertical = false) => <label className={vertical ? 'hmi-vertical-range' : ''}><input data-help-topic="hmi_dashboard" aria-label={comp.name} disabled={disabled} type="range" min={min} max={max} step={step} value={Number(value)} onChange={e => send(Number(e.target.value))}/><output>{display}</output></label>;
  let widget: React.ReactNode;
  switch (comp.type) {
    case 'button': widget = <MomentaryButton data-help-topic="hmi_dashboard" label={comp.name} disabled={disabled} resetVersion={runtime.resetVersion} send={mode => send(mode === 'press' ? press : release, mode)}>{inlineIcon}{comp.text || comp.name}</MomentaryButton>; break;
    case 'pulse-button': widget = <button data-help-topic="hmi_dashboard" disabled={disabled} onClick={() => send(press, 'pulse')}>{comp.text || 'Pulse'}</button>; break;
    case 'simulation-command': widget = <button data-help-topic="hmi_dashboard" disabled={editMode} onClick={() => onSimulationCommand(comp.command || 'step')}>{title(comp.command || 'step')}</button>; break;
    case 'toggle': case 'checkbox': case 'rocker-switch': case 'slide-switch': case 'latching-button': widget = <label className={`hmi-switch hmi-${comp.type}`}><input data-help-topic="hmi_dashboard" type="checkbox" aria-label={comp.name} disabled={disabled} checked={active} onChange={e => send(e.target.checked ? press : release)}/><span>{comp.type === 'latching-button' && inlineIcon}{comp.text || (active ? 'On' : 'Off')}</span></label>; break;
    case 'slider': widget = range(); break;
    case 'vertical-slider': widget = range(true); break;
    case 'input': widget = <NumericEntry data-help-topic="hmi_dashboard" booleanInput={variable?.type==='bool'} value={variable?.currentValue ?? 0} disabled={disabled} min={min} max={max} step={step} label={comp.name} send={v=>send(v)} resetVersion={runtime.resetVersion}/>; break;
    case 'combo-box': widget = <select data-help-topic="hmi_dashboard" disabled={disabled} aria-label={comp.name} value={opts.findIndex(o => o.value === value)} onChange={e => send(opts[Number(e.target.value)].value)}>{opts.map((o,i) => <option key={i} value={i}>{o.label}</option>)}</select>; break;
    case 'radio-group': widget = <fieldset disabled={disabled}><legend>{comp.name}</legend>{opts.map((o,i) => <label key={i}><input data-help-topic="hmi_dashboard" type="radio" name={comp.id} checked={value === o.value} onChange={() => send(o.value)}/>{o.label}</label>)}</fieldset>; break;
    case 'knob': case 'rotary': case 'hybrid-rotary': case 'encoder': {
      if (comp.type === 'rotary' && comp.variableIds?.length) {
        const ids = comp.variableIds;
        const blocked = editMode || comp.writable === false || ids.some(id => { const v = variables.find(v=>v.id===id); return !v || owned.has(id) || readOnly(v); });
        const index = Math.max(0, ids.findIndex(id=>Boolean(getValue(id))));
        const choose = (next:number) => ids.forEach((id,i)=> { const v=variables.find(v=>v.id===id); send(v?.type==='bool' ? i===next : i===next ? 1 : 0,'set',id); });
        widget = <div className="hmi-modes">{ids.map((id,i)=><button data-help-topic="hmi_dashboard" key={i} disabled={blocked} aria-pressed={i===index} onClick={()=>choose(i)}>{variables.find(v=>v.id===id)?.name || 'Unbound position'}</button>)}</div>; break;
      }
      const discrete = comp.type === 'hybrid-rotary' ? comp.hybridValues : comp.encoderValues;
      const rotate = (dir: number) => { if (discrete?.length) { const index = discrete.findIndex(v => String(v) === String(value)); send(discrete[(Math.max(0,index) + dir + discrete.length) % discrete.length]); } else send(Math.max(min,Math.min(max,Number(value) + dir*step))); };
      const pressVar = variables.find(v => v.id === comp.pressVariableId);
      widget = <div className="hmi-knob"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="40"/><path d="M50 50 L50 18" transform={`rotate(${-135 + fraction*270} 50 50)`}/></svg><div><button data-help-topic="hmi_dashboard" aria-label={`Decrease ${comp.name}`} disabled={disabled} onClick={() => rotate(-1)}>−</button><output>{display}</output><button data-help-topic="hmi_dashboard" aria-label={`Increase ${comp.name}`} disabled={disabled} onClick={() => rotate(1)}>+</button></div>{comp.type === 'knob' && range()}{comp.type === 'encoder' && <MomentaryButton data-help-topic="hmi_dashboard" label={`Press ${comp.name}`} disabled={editMode || !pressVar || owned.has(pressVar.id) || readOnly(pressVar) || comp.writable === false} resetVersion={runtime.resetVersion} send={mode => send(mode === 'press' ? (pressVar?.type === 'bool' ? true : 1) : (pressVar?.type === 'bool' ? false : 0), mode, comp.pressVariableId)} >Press</MomentaryButton>}</div>; break;
    }
    case 'mode-selector': if(comp.options?.length) { widget=<div className="hmi-modes">{comp.options.map((o,i)=><button data-help-topic="hmi_dashboard" key={i} disabled={disabled} aria-pressed={value===o.value} onClick={()=>send(o.value)}>{o.label}</button>)}</div>; break; } widget = <div className="hmi-modes">{(comp.oledModeNames?.split(',') || legacyModes).map((name,i) => <button data-help-topic="hmi_dashboard" key={i} disabled={disabled} aria-pressed={Number(value) === i} data-cursor={Number(getValue(comp.cursorVariableId)) === i} onClick={() => send(i)}>{name}</button>)}</div>; break;
    case 'mode-icon': widget = <button data-help-topic="hmi_dashboard" disabled={disabled} aria-pressed={String(value) === (comp.targetValue ?? '1')} aria-label={comp.iconEmoji ? undefined : comp.name} onClick={() => send(comp.targetValue ?? '1')}>{comp.iconEmoji || <HmiIcon id={iconId ?? 'gear'} size={28} />}</button>; break;
    case 'lamp': case 'led': widget = <output className={`hmi-lamp ${comp.type}`} data-active={Boolean(value)} aria-label={`${comp.name}: ${display}`}><Bulb active={Boolean(value)} shape={comp.type} icon={comp.iconEmoji ? undefined : iconId} emoji={comp.iconEmoji}/></output>; break;
    case 'icon-indicator': widget = <output className="hmi-icon-indicator" data-active={Boolean(value)} aria-label={`${comp.name}: ${display}`}><HmiIcon id={iconId ?? 'power'} size={64}/></output>; break;
    case 'buzzer': widget = <Buzzer active={!editMode && Boolean(value)} soundType={comp.soundType}/>; break;
    case 'seven-segment': case 'fourteen-segment': case 'sixteen-segment': widget = <SegmentDisplay text={segmentText} style={comp.type === 'seven-segment' ? '7' : comp.type === 'fourteen-segment' ? '14' : '16'} digits={comp.digitCount} numeric={numericSegments} themeId={comp.lcdTheme} skew={comp.segmentSkew === true}/>; break;
    case 'dot-matrix': widget = <DotMatrixDisplay text={segmentText} digits={comp.digitCount ?? 8} numeric={numericSegments} themeId={comp.lcdTheme}/>; break;
    case 'character-lcd': widget = <CharacterLcd lines={comp.lcdLines ?? ['{name}', '{value}']} rows={comp.lcdRows ?? 2} columns={comp.lcdColumns ?? 16} tokens={{name: comp.name, value: valueText, unit: comp.unit ?? ''}} themeId={comp.lcdTheme}/>; break;
    case 'segment-lcd': widget = <SegmentLcd text={segmentText} digits={comp.digitCount ?? 4} numeric={numericSegments} themeId={comp.lcdTheme} skew={comp.segmentSkew === true} annunciators={(comp.annunciators ?? []).map(a => ({...a, on: Boolean(getValue(a.variableId))}))}/>; break;
    case 'led-bar': widget = <LedBar fraction={variable ? fraction : 0} segments={comp.barSegments ?? 10} themeId={comp.lcdTheme} vertical={comp.height > comp.width * 1.3}/>; break;
    case 'lcd': widget = <LcdReadout text={display} themeId={comp.lcdTheme}/>; break;
    case 'gauge': case 'half-gauge': case 'quarter-gauge': widget = <DialGauge kind={comp.type} fraction={fraction} display={display} min={min} max={max}/>; break;
    case 'linear-gauge': case 'vertical-gauge': case 'progress-bar': case 'thermometer': case 'tank-level': widget = <div className={`hmi-level hmi-${comp.type}`}><div role="meter" aria-label={comp.name} aria-valuemin={min} aria-valuemax={max} aria-valuenow={Number(value)} className="hmi-level-track"><div style={['vertical-gauge','thermometer','tank-level'].includes(comp.type) ? {height: `${fraction*100}%`, width:'100%'} : {width:`${fraction*100}%`, height:'100%'}}/></div><output>{display}</output></div>; break;
    case 'active-state-indicator': widget = <output data-active={runtime.activeStateIds.includes(comp.stateId || '')}>{runtime.activeStateIds.includes(comp.stateId || '') ? '● Active' : '○ Inactive'} · {runtime.states.find(s => s.id === comp.stateId)?.name || 'Select state'}</output>; break;
    case 'alarm-list': { const ids = comp.variableIds?.length ? comp.variableIds : comp.variableId ? [comp.variableId] : []; const alarms = variables.filter(v => ids.includes(v.id) && Number(v.currentValue) >= (comp.alarmThreshold ?? 1)); widget = <ul aria-label="Committed alarms">{alarms.length ? alarms.map(v => <li key={v.id}>{v.name}: {String(v.currentValue)}</li>) : <li>No active alarms</li>}</ul>; break; }
    case 'dashboard-scope': case 'xy-plot': {
      const ids = comp.variableIds?.length ? comp.variableIds : comp.variableId ? [comp.variableId] : [];
      const samples = runtime.samples.slice(-300); const points = (id: string) => samples.map(s => [s.time, Number(s.values[id])]).filter(p => p.every(Number.isFinite));
      const series = comp.type === 'xy-plot' ? [samples.map(s => [Number(s.values[ids[0]]), Number(s.values[ids[1]])]).filter(p => p.every(Number.isFinite))] : ids.map(points);
      const flat = series.flat(); const xs = flat.map(p=>p[0]), ys=flat.map(p=>p[1]); const xmin=Math.min(...xs), xmax=Math.max(...xs), ymin=Math.min(...ys), ymax=Math.max(...ys);
      widget = <div className="hmi-plot"><svg viewBox="0 0 300 140" role="img" aria-label={`${comp.type === 'xy-plot' ? 'XY' : 'Time'} plot of committed samples`}><path className="hmi-axis" d="M25 5 V115 H295"/>{series.map((s,i) => <polyline key={i} className={`hmi-trace hmi-trace-${i%3}`} points={s.map(p=>`${25+(p[0]-xmin)/(xmax-xmin || 1)*270},${115-(p[1]-ymin)/(ymax-ymin || 1)*105}`).join(' ')}/>)}<text x="25" y="135">{flat.length ? `${xmin.toFixed(2)} → ${xmax.toFixed(2)}` : 'No committed samples'}</text></svg><small>{ids.map(id=>variables.find(v=>v.id===id)?.name || id).join(' · ')}</small></div>; break;
    }
    case 'multi-state-image': { const option = opts.find(o => o.value === value); widget = <figure>{(option?.imageUrl || comp.imageUrl) && <img src={option?.imageUrl || comp.imageUrl} alt={option?.label || comp.name}/>}<figcaption>{option?.label || display}</figcaption></figure>; break; }
    case 'oled': { const indicators = comp.oledIndicatorEmojis?.length ? comp.oledIndicatorEmojis.map((emoji,i) => ({emoji,id:comp.oledIndicatorVarIds?.[i],label:comp.oledIndicatorLabels?.[i]})) : [{emoji:'💧',id:comp.oledSteamVarId,label:'Steam'},{emoji:'🔥',id:comp.oledHeatVarId,label:'Heat'},{emoji:'🌀',id:comp.oledFanVarId,label:'Fan'},{emoji:'💡',id:comp.oledLightVarId,label:'Light'},{emoji:'⚡',id:comp.oledDuoVarId,label:'Duo'}]; const modes = comp.oledModeNames?.split(',') || legacyModes; widget = <div className="hmi-oled" {...(comp.lcdTheme && resolveLcdTheme(comp.lcdTheme, 'cyan-oled').id === comp.lcdTheme ? {'data-lcd-theme': comp.lcdTheme, style: {background: HMI_GLYPHS.lcdThemes[comp.lcdTheme].background, color: HMI_GLYPHS.lcdThemes[comp.lcdTheme].on}} : {})}><strong>{comp.oledTitle || comp.name}</strong><span>{modes[Number(getValue(comp.oledModeVarId))] || String(getValue(comp.oledModeVarId) ?? 'Ready')}</span><output>{String(getValue(comp.oledTempVarId) ?? 0)} °C</output><span>{String(getValue(comp.oledTimeVarId) ?? 0)} · {String(getValue(comp.oledStateVarId) ?? '')}</span><progress max={100} value={Number(getValue(comp.oledProgressVarId) ?? 0)}/><div>{indicators.map((o,i)=><span key={i} title={o.label} style={{opacity: getValue(o.id) ? 1 : .25}}>{isHmiIconId(o.emoji) ? <HmiIcon id={o.emoji} size={18}/> : o.emoji}</span>)}</div></div>; break; }
    case 'label': widget = <p>{comp.text || comp.name}</p>; break;
    case 'image': widget = comp.imageUrl ? <img className="hmi-image" src={comp.imageUrl} alt={comp.text || comp.name}/> : <p>Set an image URL in properties.</p>; break;
    case 'panel': widget = <div className="hmi-panel-label">{comp.text || comp.name}</div>; break;
    case 'tabs': widget = null; break;
    default: widget = <p role="alert">Unsupported component: {String(comp.type)}</p>;
  }
  const indicatorColor = {orange:'var(--focus-ring)',green:'var(--status-success)',red:'var(--status-danger)',blue:'var(--hmi-blue)',yellow:'var(--status-warning)',grey:'var(--text-muted)'}[comp.color || 'green'];
  return <div className="hmi-widget" style={{'--hmi-indicator-color': indicatorColor} as React.CSSProperties} data-help-topic={`hmi-component-${comp.type}`} data-widget-type={comp.type} data-help-feature={`hmi-component-${comp.type}`}>{widget}{(error || (!editMode && inputTypes.has(comp.type) && comp.type !== 'simulation-command' && invalid)) && <small role="alert">{error || invalid}</small>}</div>;
}

export function HmiWorkspace(props: HmiWorkspaceProps) {
  const {components, setComponents, runtime} = props;
  const [editMode, setEditMode] = useState(true); const [selected, setSelected] = useState<string>(); const [search,setSearch]=useState(''); const [activeTabs,setActiveTabs]=useState<Record<string,string>>({});
  const drag = useRef<{id:string;x:number;y:number;cx:number;cy:number} | null>(null);
  const owned = new Set(props.externalOwnedVariableIds); const chosen = components.find(c=>c.id===selected);
  const update = (patch: Partial<HmiComponent>) => { for (const key of ['x','y','width','height'] as const) { if (patch[key] !== undefined) { if (!Number.isFinite(patch[key])) return; patch[key] = Math.max(key === 'width' || key === 'height' ? 40 : 0, patch[key]!); } } setComponents(list=>list.map(c=>c.id===selected ? {...c,...patch} : c)); };
  const add = (type: string) => { const id = crypto.randomUUID(); setComponents(list=>[...list,{...createHmiComponent(type as HmiComponentType,id),x:30+list.length%5*20,y:30+list.length%5*20}]); setSelected(id); };
  const activeTab = (c:HmiComponent) => c.tabs?.some(t=>t.id===activeTabs[c.id]) ? activeTabs[c.id] : c.tabs?.[0]?.id;
  const canParent = (candidate:HmiComponent) => { const seen=new Set<string>(); let p:HmiComponent|undefined=candidate; while(p) { if(p.id===chosen?.id || seen.has(p.id)) return false; seen.add(p.id); p=components.find(c=>c.id===p?.parentId); } return true; };
  const visible = (c: HmiComponent, seen = new Set<string>()): boolean => { if (!c.parentId) return true; if (seen.has(c.id)) return false; seen.add(c.id); const p=components.find(p=>p.id===c.parentId); return Boolean(p && visible(p,seen) && (p.type !== 'tabs' || activeTab(p) === c.tabId)); };
  const position = (c:HmiComponent, seen = new Set<string>()): {x:number;y:number} => { if (!c.parentId || seen.has(c.id)) return {x:c.x,y:c.y}; seen.add(c.id); const p=components.find(p=>p.id===c.parentId); const base=p?position(p,seen):{x:0,y:0}; return {x:base.x+c.x,y:base.y+c.y}; };
  const binding = (key: keyof HmiComponent, label:string) => <label key={key}>{label}<select data-help-topic="hmi_dashboard" value={String(chosen?.[key] || '')} onChange={e=>update({[key]:e.target.value || null})}><option value="">Unbound</option>{props.variables.map(v=><option key={v.id} value={v.id}>{v.name} ({v.type}){owned.has(v.id) ? ' · External' : ''}</option>)}</select></label>;
  const iconTypes = ['lamp','led','mode-icon','icon-indicator','button','latching-button'];
  const themeTypes = ['lcd','seven-segment','fourteen-segment','sixteen-segment','dot-matrix','character-lcd','segment-lcd','led-bar','oled'];
  const skewTypes = ['seven-segment','fourteen-segment','sixteen-segment','segment-lcd'];
  const digitTypes = ['seven-segment','fourteen-segment','sixteen-segment','dot-matrix','segment-lcd'];
  const intField = (key: 'digitCount'|'lcdRows'|'lcdColumns'|'barSegments', label: string, low: number, high: number) => chosen && <IntField data-help-topic="hmi_dashboard" key={key} label={label} low={low} high={high} value={chosen[key]} onCommit={next=>update({[key]: next})}/>;
  const annunciators = chosen?.annunciators ?? [];
  const setAnnunciator = (index: number, patch: Partial<NonNullable<HmiComponent['annunciators']>[number]>) => update({annunciators: annunciators.map((a, i) => i === index ? {...a, ...patch} : a)});
  const displayProperties = chosen && <>
    {iconTypes.includes(chosen.type) && <IconPicker data-help-topic="hmi_dashboard" value={chosen.icon} onChange={icon => update({icon})}/>}
    {themeTypes.includes(chosen.type) && <label>LCD theme<select data-help-topic="hmi_dashboard" value={chosen.lcdTheme ?? ''} onChange={e=>update({lcdTheme: (e.target.value || undefined) as HmiComponent['lcdTheme']})}>{chosen.type === 'oled' && <option value="">Default</option>}{(Object.keys(HMI_GLYPHS.lcdThemes) as (keyof typeof HMI_GLYPHS.lcdThemes)[]).map(id=><option key={id} value={id}>{HMI_GLYPHS.lcdThemes[id].label}</option>)}</select></label>}
    {digitTypes.includes(chosen.type) && intField('digitCount', 'Digit count', 1, 16)}
    {skewTypes.includes(chosen.type) && <label>Italic segments<input data-help-topic="hmi_dashboard" type="checkbox" checked={chosen.segmentSkew === true} onChange={e=>update({segmentSkew: e.target.checked ? true : undefined})}/></label>}
    {chosen.type === 'character-lcd' && <>{intField('lcdRows', 'Rows', 1, 4)}{intField('lcdColumns', 'Columns', 8, 40)}<JsonProperty data-help-topic="hmi_dashboard" label="LCD lines" value={chosen.lcdLines || []} onChange={v=>update({lcdLines:v})}/></>}
    {chosen.type === 'led-bar' && intField('barSegments', 'Bar segments', 4, 40)}
    {chosen.type === 'segment-lcd' && <fieldset className="hmi-annunciators"><legend>Annunciators</legend>
      {annunciators.map((a, i) => <div key={i} className="hmi-annunciator-row">
        <label>{`Annunciator ${i + 1} icon`}<select data-help-topic="hmi_dashboard" value={a.icon} onChange={e=>setAnnunciator(i, {icon: e.target.value as HmiIconId})}>{HMI_ICON_IDS.map(id=><option key={id} value={id}>{HMI_GLYPHS.icons[id].label}</option>)}</select></label>
        <label>{`Annunciator ${i + 1} variable`}<select data-help-topic="hmi_dashboard" value={a.variableId ?? ''} onChange={e=>setAnnunciator(i, {variableId: e.target.value || null})}><option value="">Unbound</option>{props.variables.map(v=><option key={v.id} value={v.id}>{v.name} ({v.type})</option>)}</select></label>
        <label>{`Annunciator ${i + 1} label`}<input data-help-topic="hmi_dashboard" value={a.label ?? ''} onChange={e=>setAnnunciator(i, {label: e.target.value || undefined})}/></label>
        <button data-help-topic="hmi_dashboard" aria-label={`Remove annunciator ${i + 1}`} onClick={()=>update({annunciators: annunciators.filter((_, index) => index !== i)})}>Remove</button>
      </div>)}
      <button data-help-topic="hmi_dashboard" disabled={annunciators.length >= 12} onClick={()=>update({annunciators: [...annunciators, {icon: 'power', variableId: null}]})}>Add annunciator</button>
    </fieldset>}
  </>;
  return <div className="hmi-workspace" data-help-topic="hmi_dashboard"><header><strong>HMI Dashboard</strong><button data-help-topic="hmi_dashboard" onClick={()=>setEditMode(v=>!v)}>{editMode?'Run controls':'Edit layout'}</button><span>{runtime.running?'Running':'Paused'} · {runtime.time.toFixed(3)} s</span>{(['start','pause','resume','step','reset'] as const).map(command=><button data-help-topic="hmi_dashboard" key={command} onClick={()=>props.onSimulationCommand(command)}>{title(command)}</button>)}<button data-help-topic="hmi_dashboard" onClick={props.onClose}>Close</button></header><div className="hmi-body">
    {editMode && <aside className="hmi-palette"><input data-help-topic="hmi_dashboard" aria-label="Search components" placeholder="Search components" value={search} onChange={e=>setSearch(e.target.value)}/>{Object.entries(groups).map(([group,types])=><section key={group}><h3>{group}</h3>{types.filter(t=>title(t).toLowerCase().includes(search.toLowerCase())).map(t=><button data-help-topic="hmi_dashboard" key={t} onClick={()=>add(t)}><HmiIcon id={HMI_PALETTE_ICONS[t as HmiComponentType]} size={16} className="hmi-palette-icon"/><span>{title(t)}</span></button>)}</section>)}</aside>}
    <main data-help-topic="hmi_dashboard" className="hmi-canvas" aria-label="HMI canvas" onPointerMove={e=>{if(!drag.current)return;const d=drag.current;setComponents(list=>list.map(c=>c.id===d.id?{...c,x:Math.max(0,d.x+e.clientX-d.cx),y:Math.max(0,d.y+e.clientY-d.cy)}:c));}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>{components.filter(c=>visible(c)).sort((a,b)=>Number(!['panel','tabs'].includes(a.type))-Number(!['panel','tabs'].includes(b.type))).map(c=>{const p=position(c);return <section data-help-topic="hmi_dashboard" key={c.id} className={`hmi-component ${selected===c.id?'hmi-selected':''} hmi-component-${c.type}`} style={{left:p.x,top:p.y,width:c.width,height:c.height}} onClick={()=>{if(editMode)setSelected(c.id);}}><div data-help-topic="hmi_dashboard" className="hmi-component-title" onPointerDown={e=>{if(!editMode)return;setSelected(c.id);e.currentTarget.setPointerCapture?.(e.pointerId);drag.current={id:c.id,x:c.x,y:c.y,cx:e.clientX,cy:e.clientY};}}>{c.name}</div>{c.type==='tabs' ? <div role="tablist">{c.tabs?.map(t=><button data-help-topic="hmi_dashboard" key={t.id} role="tab" aria-selected={activeTab(c)===t.id} onClick={()=>setActiveTabs(v=>({...v,[c.id]:t.id}))}>{t.label}</button>)}</div> : <HmiWidget {...props} comp={c} editMode={editMode} owned={owned}/>}</section>;})}</main>
    {editMode && <aside className="hmi-properties"><h3>Properties</h3>{chosen ? <><label>Name<input data-help-topic="hmi_dashboard" value={chosen.name} onChange={e=>update({name:e.target.value})}/></label>{getHmiDefinition(chosen.type)?.role !== 'layout' && chosen.type !== 'simulation-command' && binding('variableId','Variable')}{(['x','y','width','height','min','max','step','precision','alarmThreshold','activeValue','inactiveValue'] as const).map(key=><label key={key}>{title(key)}<input data-help-topic="hmi_dashboard" type="number" value={typeof chosen[key] === 'boolean' ? String(Number(chosen[key])) : chosen[key] ?? ''} onChange={e=>update({[key]:e.target.value === '' ? undefined : Number(e.target.value)})}/></label>)}{(['unit','text','imageUrl','iconEmoji','targetValue','oledTitle','oledModeNames'] as const).map(key=><label key={key}>{title(key)}<input data-help-topic="hmi_dashboard" value={chosen[key] ?? ''} onChange={e=>update({[key]:e.target.value})}/></label>)}{['button','lamp','led','toggle','rocker-switch','slide-switch','latching-button','mode-icon'].includes(chosen.type) && <label>Color<select data-help-topic="hmi_dashboard" value={chosen.color || 'green'} onChange={e=>update({color:e.target.value as HmiComponent['color']})}>{['orange','green','red','blue','yellow','grey'].map(color=><option key={color}>{color}</option>)}</select></label>}{displayProperties}{inputTypes.has(chosen.type) && chosen.type !== 'simulation-command' && <label>Writable<input data-help-topic="hmi_dashboard" type="checkbox" checked={chosen.writable !== false} onChange={e=>update({writable:e.target.checked})}/></label>}{chosen.type === 'active-state-indicator' && <label>State<select data-help-topic="hmi_dashboard" value={chosen.stateId || ''} onChange={e=>update({stateId:e.target.value})}><option value="">Select state</option>{runtime.states.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}{chosen.type === 'simulation-command' && <label>Simulation command<select data-help-topic="hmi_dashboard" value={chosen.command || 'step'} onChange={e=>update({command:e.target.value as HmiComponent['command']})}>{['start','pause','resume','step','reset'].map(s=><option key={s}>{s}</option>)}</select></label>}<label>Layout parent<select data-help-topic="hmi_dashboard" value={chosen.parentId || ''} onChange={e=>update({parentId:e.target.value || undefined,tabId:components.find(c=>c.id===e.target.value)?.tabs?.[0]?.id})}><option value="">Canvas</option>{components.filter(c=>c.id!==chosen.id && ['panel','tabs'].includes(c.type) && canParent(c)).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Tab<select data-help-topic="hmi_dashboard" value={chosen.tabId||''} onChange={e=>update({tabId:e.target.value})}><option value="">Select tab</option>{components.find(c=>c.id===chosen.parentId)?.tabs?.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label><label>Trace / XY variables<select data-help-topic="hmi_dashboard" multiple value={chosen.variableIds||[]} onChange={e=>update({variableIds:Array.from(e.target.selectedOptions,o=>o.value)})}>{props.variables.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label><JsonProperty data-help-topic="hmi_dashboard" label="Options [{label,value,imageUrl?}]" value={chosen.options || []} onChange={v=>update({options:v})}/>{chosen.type === 'tabs' && <JsonProperty data-help-topic="hmi_dashboard" label="Tabs [{id,label}]" value={chosen.tabs || []} onChange={v=>update({tabs:v})}/>}<label>Discrete values (comma separated)<input data-help-topic="hmi_dashboard" value={(chosen.type==='encoder'?chosen.encoderValues:chosen.hybridValues)?.join(',')||''} onChange={e=>update({[chosen.type==='encoder'?'encoderValues':'hybridValues']:e.target.value.split(',').map(s=>s.trim())})}/></label><label>Sound<select data-help-topic="hmi_dashboard" value={chosen.soundType||'square'} onChange={e=>update({soundType:e.target.value as HmiComponent['soundType']})}>{['sine','square','sawtooth','triangle'].map(s=><option key={s}>{s}</option>)}</select></label><details><summary>Legacy advanced bindings</summary>{(['pressVariableId','cursorVariableId','oledModeVarId','oledTempVarId','oledTimeVarId','oledStateVarId','oledSteamVarId','oledHeatVarId','oledFanVarId','oledLightVarId','oledDuoVarId','oledProgressVarId'] as const).map(k=>binding(k,title(k)))}<JsonProperty data-help-topic="hmi_dashboard" label="OLED indicator emojis" value={chosen.oledIndicatorEmojis||[]} onChange={v=>update({oledIndicatorEmojis:v})}/><JsonProperty data-help-topic="hmi_dashboard" label="OLED indicator variable IDs" value={chosen.oledIndicatorVarIds||[]} onChange={v=>update({oledIndicatorVarIds:v})}/><JsonProperty data-help-topic="hmi_dashboard" label="OLED indicator labels" value={chosen.oledIndicatorLabels||[]} onChange={v=>update({oledIndicatorLabels:v})}/></details><div className="hmi-align">{['Left','Top'].map(axis=><button data-help-topic="hmi_dashboard" key={axis} onClick={()=>update(axis==='Left'?{x:0}:{y:0})}>Align {axis}</button>)}</div><button data-help-topic="hmi_dashboard" onClick={()=>{setComponents(list=>list.filter(c=>c.id!==chosen.id).map(c=>c.parentId===chosen.id?{...c,...position(c),parentId:undefined,tabId:undefined}:c));setSelected(undefined);}}>Delete component</button></> : <p>Select a component.</p>}</aside>}
  </div></div>;
}
function JsonProperty<T>({label,value,onChange}:{label:string;value:T;onChange:(v:T)=>void}) { const [text,setText]=useState(JSON.stringify(value)); const [error,setError]=useState(''); useEffect(()=>setText(JSON.stringify(value)),[JSON.stringify(value)]); return <label>{label}<textarea data-help-topic="hmi_dashboard" value={text} onChange={e=>setText(e.target.value)} onBlur={()=>{try {const parsed=JSON.parse(text);if(!Array.isArray(parsed))throw new Error('Use a JSON array.'); if (label.startsWith('Options') && parsed.some(o=>!o || typeof o.label!=='string' || !(typeof o.value==='boolean' || typeof o.value==='number' && Number.isFinite(o.value)))) throw new Error('Invalid option'); if (label.startsWith('Tabs') && parsed.some(t=>!t || typeof t.id!=='string' || typeof t.label!=='string')) throw new Error('Invalid tab'); if (label === 'LCD lines' && (parsed.length > 4 || parsed.some(v=>typeof v!=='string'))) throw new Error('Invalid lines'); if (label.startsWith('OLED') && parsed.some(v=>typeof v!=='string' && !(label.includes('variable IDs') && v===null))) throw new Error('Invalid indicator'); onChange(parsed as T);setError('');}catch{setError('Invalid JSON array.');}}}/>{error&&<small role="alert">{error}</small>}</label>; }
function IntField({label, value, low, high, onCommit}: {label: string; value: number | undefined; low: number; high: number; onCommit: (value: number | undefined) => void}) {
  const [draft, setDraft] = useState(value === undefined ? '' : String(value));
  useEffect(() => setDraft(value === undefined ? '' : String(value)), [value]);
  const next = Number(draft);
  const invalid = draft !== '' && !(Number.isInteger(next) && next >= low && next <= high);
  return <label>{label}<input data-help-topic="hmi_dashboard" type="number" min={low} max={high} step={1} aria-invalid={invalid || undefined} value={draft} onChange={e=>{ setDraft(e.target.value); const parsed = Number(e.target.value); if (e.target.value === '') onCommit(undefined); else if (Number.isInteger(parsed) && parsed >= low && parsed <= high) onCommit(parsed); }} onBlur={()=>setDraft(value === undefined ? '' : String(value))}/>{invalid && <small role="alert">{`Enter a whole number from ${low} to ${high}.`}</small>}</label>;
}
function IconPicker({value, onChange}: {value: HmiComponent['icon']; onChange: (icon: HmiIconId | 'none') => void}) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const ids = HMI_ICON_IDS.filter(id => !needle || id.includes(needle) || HMI_GLYPHS.icons[id].label.toLowerCase().includes(needle) || HMI_GLYPHS.icons[id].category.includes(needle));
  return <div role="group" aria-label="Icon" className="hmi-icon-picker">
    <input data-help-topic="hmi_dashboard" type="search" aria-label="Search icons" placeholder="Search icons" value={query} onChange={e=>setQuery(e.target.value)}/>
    <div className="hmi-icon-grid">
      <button data-help-topic="hmi_dashboard" type="button" aria-label="No icon" aria-pressed={!value || value === 'none'} onClick={()=>onChange('none')}>∅</button>
      {ids.map(id => <button data-help-topic="hmi_dashboard" type="button" key={id} title={HMI_GLYPHS.icons[id].label} aria-label={HMI_GLYPHS.icons[id].label} aria-pressed={value === id} onClick={()=>onChange(id)}><HmiIcon id={id} size={20}/></button>)}
    </div>
  </div>;
}
export default HmiWorkspace;
