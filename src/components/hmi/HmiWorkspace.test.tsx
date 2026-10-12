// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HmiWidget, HmiWorkspace, type HmiRuntime } from './HmiWorkspace';
import { createHmiComponent, HMI_CATALOG } from '../../features/hmi/hmiCatalog';
import { MomentaryButton, type HmiInput } from './interaction';
import { NumericEntry } from './NumericEntry';
import type { VariableDef } from '../../types/sm_types';

afterEach(cleanup);
const runtime: HmiRuntime = {running:false,time:2,activeStateIds:['s'],states:[{id:'s',name:'Running'}],samples:[{time:1,values:{v:0}},{time:2,values:{v:1}}],resetVersion:0};
const variables: VariableDef[] = [{id:'v',name:'Input',type:'bool',initialValue:'false',currentValue:false,visibleInScope:true}];
describe('HMI controls',()=>{
  it('accumulates paused knob changes and lets a staged switch toggle back before a tick',()=>{
    const input=vi.fn((_c:HmiInput)=>({accepted:true}));
    const base={variables:[{...variables[0],type:'int' as const,currentValue:0}],runtime,editMode:false,owned:new Set<string>(),onInput:input,onSimulationCommand:vi.fn()};
    const view=render(<HmiWidget {...base} comp={{...createHmiComponent('knob','c'),variableId:'v'}}/>);
    const up=screen.getByRole('button',{name:'Increase Knob'});fireEvent.click(up);fireEvent.click(up);
    expect(input.mock.calls.map(c=>c[0].value)).toEqual([1,2]);
    view.rerender(<HmiWidget {...base} variables={variables} comp={{...createHmiComponent('toggle','c'),variableId:'v'}}/>);
    fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('checkbox'));
    expect(input.mock.calls.slice(-2).map(c=>c[0].value)).toEqual([true,false]);
  });
  it('releases the original binding callback when rebound while held',()=>{
    const original=vi.fn((_mode:string)=>({accepted:true})), replacement=vi.fn((_mode:string)=>({accepted:true}));
    const view=render(<MomentaryButton disabled={false} resetVersion={0} send={original} label="Hold">Hold</MomentaryButton>);
    fireEvent.keyDown(screen.getByRole('button'),{key:'Enter'});
    view.rerender(<MomentaryButton disabled={false} resetVersion={0} send={replacement} label="Hold">Hold</MomentaryButton>);
    fireEvent.keyUp(screen.getByRole('button'),{key:'Enter'});
    expect(original.mock.calls.map(c=>c[0])).toEqual(['press','release']);expect(replacement).not.toHaveBeenCalled();
  });
  it('releases discrete numeric buttons even when inactive value is below the display range',()=>{
    const input=vi.fn((_c:HmiInput)=>({accepted:true}));
    render(<HmiWidget comp={{...createHmiComponent('button','c'),variableId:'v',min:10,max:100,activeValue:20,inactiveValue:0}} variables={[{...variables[0],type:'int',currentValue:0}]} runtime={runtime} editMode={false} owned={new Set()} onInput={input} onSimulationCommand={vi.fn()}/>);
    const button=screen.getByRole('button');fireEvent.keyDown(button,{key:'Enter'});fireEvent.keyUp(button,{key:'Enter'});
    expect(input.mock.calls.map(c=>[c[0].mode,c[0].value])).toEqual([['press',20],['release',0]]);
  });
  it('uses configured pulse inactive values and exact active switch values',()=>{
    const input=vi.fn((_c:HmiInput)=>({accepted:true}));const numeric=[{...variables[0],type:'int' as const,currentValue:5}];
    const base={variables:numeric,runtime,editMode:false,owned:new Set<string>(),onInput:input,onSimulationCommand:vi.fn()};
    const view=render(<HmiWidget {...base} comp={{...createHmiComponent('pulse-button','c'),variableId:'v',activeValue:10,inactiveValue:5}}/>);
    fireEvent.click(screen.getByRole('button'));expect(input).toHaveBeenCalledWith(expect.objectContaining({value:10,releaseValue:5}));
    view.rerender(<HmiWidget {...base} comp={{...createHmiComponent('rocker-switch','c'),variableId:'v',activeValue:10,inactiveValue:5}}/>);
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);fireEvent.click(screen.getByRole('checkbox'));expect(input.mock.calls.at(-1)?.[0].value).toBe(10);
  });
  it('commits Boolean text once and supports labeled mode options',()=>{
    const input=vi.fn((_c:HmiInput)=>({accepted:true})); const base={variables,runtime,editMode:false,owned:new Set<string>(),onInput:input,onSimulationCommand:vi.fn()};
    const view=render(<HmiWidget {...base} comp={{...createHmiComponent('input','c'),variableId:'v'}}/>);
    const entry=screen.getByRole('textbox');fireEvent.change(entry,{target:{value:'true'}});fireEvent.keyDown(entry,{key:'Enter'});fireEvent.blur(entry);expect(input).toHaveBeenCalledTimes(1);expect(input.mock.calls[0][0].value).toBe('true');
    view.rerender(<HmiWidget {...base} comp={{...createHmiComponent('mode-selector','c'),variableId:'v',options:[{label:'Disabled',value:false},{label:'Enabled',value:true}]}}/>);
    fireEvent.click(screen.getByRole('button',{name:'Enabled'}));expect(input.mock.calls.at(-1)?.[0].value).toBe(true);
  });
  it('allows numeric drafts while paused and commits on Enter, then clears on reset',()=>{
    const send=vi.fn((_value: string)=>({accepted:true}));
    const view=render(<NumericEntry value={0} disabled={false} min={0} max={100} step={1} label="Numeric input" send={send} resetVersion={0}/>);
    const input=screen.getByRole('spinbutton');fireEvent.change(input,{target:{value:'25'}});expect(send).not.toHaveBeenCalled();
    fireEvent.keyDown(input,{key:'Enter'});expect(send).toHaveBeenCalledWith('25');expect(screen.getByRole('status').textContent).toContain('Staged');
    view.rerender(<NumericEntry value={0} disabled={false} min={0} max={100} step={1} label="Numeric input" send={send} resetVersion={1}/>);
    expect((input as HTMLInputElement).value).toBe('0');expect(screen.queryByRole('status')).toBeNull();
  });
  it('draws actual seven segment glyphs and quarter gauge arc',()=>{
    const base={variables:[{...variables[0],type:'float' as const,currentValue:12}],runtime,editMode:false,owned:new Set<string>(),onInput:vi.fn(),onSimulationCommand:vi.fn()};
    const view=render(<HmiWidget {...base} comp={{...createHmiComponent('seven-segment','c'),variableId:'v'}}/>);
    expect(view.container.querySelectorAll('svg path').length).toBeGreaterThan(0);
    view.rerender(<HmiWidget {...base} comp={{...createHmiComponent('quarter-gauge','c'),variableId:'v'}}/>);
    expect(view.container.querySelector('.hmi-gauge-arc')?.getAttribute('d')).toBe('M60 14 A40 40 0 0 1 100 54');
  });
  it('chooses configured images from the committed option value',()=>{
    render(<HmiWidget comp={{...createHmiComponent('multi-state-image','c'),variableId:'v',options:[{label:'Off',value:false,imageUrl:'off.png'},{label:'On',value:true,imageUrl:'on.png'}]}} variables={variables} runtime={runtime} editMode={false} owned={new Set()} onInput={vi.fn()} onSimulationCommand={vi.fn()}/>);
    expect(screen.getByRole('img').getAttribute('src')).toBe('off.png');
  });
  it('holds rapid pointer and keyboard presses and releases on cancellation, blur and unmount',()=>{
    const send=vi.fn((_mode: 'press' | 'release')=>({accepted:true}));
    const view=render(<MomentaryButton disabled={false} resetVersion={0} send={send} label="Hold">Hold</MomentaryButton>);
    const b=screen.getByRole('button');
    fireEvent.keyDown(b,{key:' '});fireEvent.keyDown(b,{key:' ',repeat:true});fireEvent.keyUp(b,{key:' '});
    expect(send.mock.calls.map(c=>c[0])).toEqual(['press','release']);
    fireEvent.keyDown(b,{key:'Enter'});fireEvent.pointerCancel(b);fireEvent.blur(b);
    expect(send.mock.calls.map(c=>c[0])).toEqual(['press','release','press','release']);
    fireEvent.keyDown(b,{key:'Enter'});view.unmount();
    expect(send.mock.calls.map(c=>c[0]).slice(-2)).toEqual(['press','release']);
  });
  it('releases a held button when changing to edit and clears holds on reset without stale release',()=>{
    const onInput=vi.fn((_command: HmiInput)=>({accepted:true})); const comp={...createHmiComponent('button','c'),variableId:'v'};
    const base={comp,variables,runtime,owned:new Set<string>(),onInput,onSimulationCommand:vi.fn()};
    const view=render(<HmiWidget {...base} editMode={false}/>);
    fireEvent.keyDown(screen.getByRole('button'),{key:'Enter'});
    view.rerender(<HmiWidget {...base} editMode={true}/>);
    expect(onInput.mock.calls.map(c=>c[0].mode)).toEqual(['press','release']);
    view.rerender(<HmiWidget {...base} editMode={false}/>);fireEvent.keyDown(screen.getByRole('button'),{key:'Enter'});
    view.rerender(<HmiWidget {...base} runtime={{...runtime,resetVersion:1}} editMode={false}/>);view.unmount();
    expect(onInput.mock.calls.map(c=>c[0].mode)).toEqual(['press','release','press']);
  });
  it('suppresses edit mode, external owned and explicitly read only writes',()=>{
    const input=vi.fn(()=>({accepted:true})); const c={...createHmiComponent('pulse-button','c'),variableId:'v'};
    const base={comp:c,variables,runtime,onInput:input,onSimulationCommand:vi.fn()};
    const view=render(<HmiWidget {...base} editMode={true} owned={new Set()}/>);fireEvent.click(screen.getByRole('button'));expect(input).not.toHaveBeenCalled();
    view.rerender(<HmiWidget {...base} editMode={false} owned={new Set(['v'])}/>);fireEvent.click(screen.getByRole('button'));expect(input).not.toHaveBeenCalled();
    view.rerender(<HmiWidget {...base} comp={{...c,writable:false}} editMode={false} owned={new Set()}/>);fireEvent.click(screen.getByRole('button'));expect(input).not.toHaveBeenCalled();
  });
  it('sends Boolean pulse commands and exposes queue rejection',()=>{
    const input=vi.fn(()=>({accepted:false,error:'Queue rejected'}));
    render(<HmiWidget comp={{...createHmiComponent('pulse-button','c'),variableId:'v'}} variables={variables} runtime={runtime} editMode={false} owned={new Set()} onInput={input} onSimulationCommand={vi.fn()}/>);
    fireEvent.click(screen.getByRole('button'));expect(input).toHaveBeenCalledWith({sourceId:'c',variableId:'v',value:true,mode:'pulse',releaseValue:false});expect(screen.getByRole('alert').textContent).toContain('Queue rejected');
  });
  it('renders every catalog component without unsupported fallback',()=>{
    const components=HMI_CATALOG.map((c,i)=>({...createHmiComponent(c.type,`c${i}`),variableId:'v',stateId:'s',variableIds:['v','v']}));
    const view=render(<HmiWorkspace variables={variables} components={components} setComponents={vi.fn()} onInput={()=>({accepted:true})} onClose={vi.fn()} runtime={runtime} externalOwnedVariableIds={[]} onSimulationCommand={vi.fn()}/>);
    expect(view.container.querySelectorAll('.hmi-component').length).toBe(42);expect(view.container.textContent).not.toContain('Unsupported component');
  });
  it('state indicators use committed active IDs and plots use committed samples',()=>{
    const view=render(<HmiWidget comp={{...createHmiComponent('active-state-indicator','c'),stateId:'s'}} variables={variables} runtime={runtime} editMode={false} owned={new Set()} onInput={vi.fn()} onSimulationCommand={vi.fn()}/>);
    expect(view.container.textContent).toContain('Active');
    view.rerender(<HmiWidget comp={{...createHmiComponent('dashboard-scope','c'),variableIds:['v']}} variables={variables} runtime={runtime} editMode={false} owned={new Set()} onInput={vi.fn()} onSimulationCommand={vi.fn()}/>);
    expect(view.container.querySelector('polyline')?.getAttribute('points')).toBe('25,115 295,10');
  });
});
