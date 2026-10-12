import React, { useEffect, useState, useRef } from 'react';
import type { HmiInputResult } from './interaction';
export function NumericEntry({value,disabled,min,max,step,label,send,resetVersion,booleanInput=false}:{value:number|boolean;disabled:boolean;min:number;max:number;step:number;label:string;send:(v:string)=>HmiInputResult;resetVersion:number;booleanInput?:boolean}) {
  const lastCommitted=useRef<string>();
  const [draft,setDraft]=useState(String(value)); const [staged,setStaged]=useState(false);
  useEffect(()=>{setDraft(String(value));setStaged(false);lastCommitted.current=undefined;},[value,resetVersion]);
  const commit=()=>{if(draft===String(value) || lastCommitted.current===draft)return;const result=send(draft);setStaged(result.accepted);if(result.accepted)lastCommitted.current=draft;};
  return <label><input data-help-topic="hmi_dashboard" aria-label={label} type={booleanInput?'text':'number'} min={min} max={max} step={step} disabled={disabled} value={draft} onChange={e=>{setDraft(e.target.value);setStaged(false);lastCommitted.current=undefined;}} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){commit();e.currentTarget.blur();}}}/>{staged&&<small role="status">Staged for next tick</small>}</label>;
}
