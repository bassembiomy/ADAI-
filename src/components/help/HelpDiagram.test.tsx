import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HelpDiagram } from './HelpDiagram';

describe('structured Help diagrams', () => {
  it('draws vertically aligned distinct actors as a generalization rather than a self loop', () => {
    const html=renderToStaticMarkup(<HelpDiagram diagram={{kind:'usecase',nodes:[{id:'general',label:'General',role:'actor',x:80,y:100},{id:'special',label:'Special',role:'actor',x:80,y:310}],edges:[{from:'special',to:'general',notation:'generalization'}]}}/>);
    const edge=html.match(/data-notation="generalization"[^>]*>(.*?)<\/g>/s)?.[1];
    expect(edge).toContain('<line');
    expect(edge).not.toContain('<path');
    expect(edge).toContain('-generalization');
  });
  it('draws replies with dashed open arrows and associations without directed arrowheads', () => {
    const reply = renderToStaticMarkup(<HelpDiagram diagram={{kind:'sequence',nodes:[{id:'a',label:'Caller'},{id:'b',label:'Receiver'}],edges:[{from:'b',to:'a',label:'result',notation:'reply'}]}} />);
    expect(reply).toContain('data-notation="reply"');
    expect(reply).toContain('stroke-dasharray="6 4"');
    expect(reply).toMatch(/marker-end="url\(#[^"]+-open\)"/);
    const usecase = renderToStaticMarkup(<HelpDiagram diagram={{kind:'usecase',subject:'System',nodes:[{id:'actor',label:'Customer',role:'actor',x:80,y:140},{id:'goal',label:'Checkout',role:'usecase',x:280,y:140}],edges:[{from:'actor',to:'goal',notation:'association'}]}} />);
    expect(usecase).toContain('System');
    expect(usecase).toContain('<circle');
    expect(usecase).toContain('<ellipse');
    expect(usecase).not.toContain('marker-end=');
  });
  it('renders labeled sequence participants, ordered arrows and an accessible description', () => {
    const html = renderToStaticMarkup(<HelpDiagram diagram={{ kind: 'sequence', caption: 'Read a record', nodes: [{ id: 'u', label: 'User' }, { id: 'c', label: 'Controller' }], edges: [{ from: 'u', to: 'c', label: 'request()' }, { from: 'c', to: 'c', label: 'validate()' }] }} />);
    expect(html).toContain('role="img"');
    expect(html).toContain('Read a record');
    expect(html).toContain('User');
    expect(html).toContain('request()');
    expect(html).toContain('validate()');
    expect(html).toContain('stroke-dasharray');
  });
  it('renders flow endpoints and rejects dangling diagram edges without crashing', () => {
    const html = renderToStaticMarkup(<HelpDiagram diagram={{ kind: 'flow', nodes: [{ id: 'model', label: 'Model' }, { id: 'repo', label: 'Repository' }], edges: [{ from: 'model', to: 'repo', label: 'command' }, { from: 'unknown', to: 'repo' }] }} />);
    expect(html).toContain('Repository');
    expect(html).toContain('command');
    expect(html).not.toContain('NaN');
  });
});
