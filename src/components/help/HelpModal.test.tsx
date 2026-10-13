// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HelpModal } from './HelpModal';

vi.mock('../../help/blockReference', () => ({ getBlockHelpGaps: () => ({paletteOnly: [], instructional: []}), getBlockHelpReferences: () => [
  { id: 'xbridges:same', typeId: 'same', name: 'Control Same', source: 'X-Bridges', category: 'Control', icon: 'plus', availability: 'available', description: 'Multiplies the input.', behavior: 'Apply the gain.', connection: 'Connect output to input.', embedded: { eligible: true, description: 'Eligible after validation.' }, example: 'Connect a constant to gain.', inputs: [], outputs: [], ports: [], parameters: [] },
  { id: 'vlab:same', typeId: 'same', name: 'Physical Same', source: 'V-Lab', category: 'Electrical', icon: 'resistor', availability: 'available', description: 'Physical component.', behavior: 'Conserves energy.', connection: 'Wire conserving terminals.', example: 'Connect to ground.', inputs: [], outputs: [], ports: [], parameters: [] },
  { id: 'xbridges:COSEC', typeId: 'COSEC', name: 'Cosecant', source: 'X-Bridges', category: 'Math', icon: 'trending-up', availability: 'palette-only', description: 'Unavailable palette item.', behavior: 'Not executable.', connection: 'No registered factory ports.', example: 'Choose an available equivalent.', inputs: [], outputs: [], ports: [], parameters: [] },
] }));

const topics = {
  'getting-started': { title: 'Getting Started', category: 'Basics', description: 'Introduction', content: 'Open your model.', sections: [{ id: 'save', title: 'Save', body: 'Save your project.' }], related: ['sequence-diagrams'] },
  'sequence-diagrams': { title: 'Sequence Diagrams', category: 'SysML', description: 'Messages', content: 'Model an interaction.', sections: [{ id: 'guards', title: 'Guards', body: 'The operand selects an alternative.' }] },
};
afterEach(cleanup);

describe('HelpModal navigation', () => {
  it('browses element references without losing search and returns to documentation', () => {
    const references = { ...topics, 'sysml-element-Block': { title: 'SysML: Block', category: 'SysML Elements', description: 'Reusable classifier', content: 'Define Controller features.', sections: [{ id: 'example', title: 'Worked example', body: 'Controller owns a sensor part.' }] } };
    render(<HelpModal isOpen onClose={() => {}} topics={references} />);
    fireEvent.click(screen.getByRole('button', { name: 'Element reference' }));
    fireEvent.click(screen.getByRole('button', { name: 'SysML: Block' }));
    expect(screen.getByRole('heading', { name: 'SysML: Block', level: 1 })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Element reference' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Documentation' }));
    expect(screen.getByRole('button', { name: 'Documentation' }).getAttribute('aria-pressed')).toBe('true');
  });
  it('offers symbol, connection, deployment and parameter sections on a selected block', () => {
    render(<HelpModal isOpen onClose={() => {}} topics={topics} />);
    fireEvent.click(screen.getByRole('button', { name: 'Block reference' }));
    fireEvent.click(screen.getByRole('button', { name: /Control Same/ }));
    for (const title of ['Symbol', 'Connection', 'Deployment', 'Parameters']) {
      expect(within(screen.getByRole('navigation', { name: 'On this page' })).getByRole('button', { name: title })).toBeTruthy();
      expect(document.getElementById(`help-section-block-${title.toLowerCase()}`)).toBeTruthy();
    }
    expect(screen.getByRole('figure', { name: 'Symbol for Control Same' })).toBeTruthy();
    expect(screen.getByText('Eligible after validation.')).toBeTruthy();
  });
  it('opens F1 qualified V-Lab and X-Bridges nodes on their exact pages', () => {
    const view = render(<HelpModal isOpen onClose={() => {}} topics={topics} initialTopic="vlab:same" />);
    expect(screen.getByRole('heading', { name: 'Physical Same', level: 1 })).toBeTruthy();
    view.rerender(<HelpModal isOpen onClose={() => {}} topics={topics} initialTopic="xbridges:same" />);
    expect(screen.getByRole('heading', { name: 'Control Same', level: 1 })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Getting Started', level: 1 })).toBeNull();
  });
  it('takes search results for qualified block topics to the live symbol reference', () => {
    const searchableTopics = { ...topics, 'xbridges:same': { title: 'X-Bridges: Control Same', category: 'Component References', description: 'Multiplies the input.', content: 'Control Same gain' } };
    render(<HelpModal isOpen onClose={() => {}} topics={searchableTopics} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search Help' }), { target: { value: 'Control Same' } });
    fireEvent.click(screen.getByRole('button', { name: /X-Bridges: Control Same/ }));
    expect(screen.getByRole('heading', { name: 'Control Same', level: 1 })).toBeTruthy();
    expect(screen.getByRole('figure', { name: 'Symbol for Control Same' })).toBeTruthy();
  });
  it('warns explicitly when a palette glyph cannot be inserted', () => {
    render(<HelpModal isOpen onClose={() => {}} topics={topics} initialTopic="xbridges:COSEC" />);
    expect(screen.getByRole('heading', { name: 'Cosecant', level: 1 })).toBeTruthy();
    expect(screen.getByText(/not available for normal insertion/i)).toBeTruthy();
    expect(screen.getByText('No registered factory ports.')).toBeTruthy();
  });
  it('searches chapter content and opens the matching section', () => {
    render(<HelpModal isOpen onClose={() => {}} topics={topics} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search Help' }), { target: { value: 'operand' } });
    fireEvent.click(screen.getByRole('button', { name: /Sequence Diagrams › Guards/ }));
    expect(screen.getByRole('heading', { name: 'Sequence Diagrams', level: 1 })).toBeTruthy();
    expect(document.getElementById('help-section-guards')).toBeTruthy();
  });
  it('shows an explicit empty search state', () => {
    render(<HelpModal isOpen onClose={() => {}} topics={topics} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search Help' }), { target: { value: 'does-not-exist' } });
    expect(screen.getByText('No Help results. Try a module, command, property or block name.')).toBeTruthy();
  });
  it('provides a table of contents, previous/next and related topics', () => {
    render(<HelpModal isOpen onClose={() => {}} topics={topics} />);
    expect(within(screen.getByRole('navigation', { name: 'On this page' })).getByRole('button', { name: 'Save' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Next: Sequence Diagrams/ }));
    expect(screen.getByRole('button', { name: /Previous: Getting Started/ })).toBeTruthy();
  });
  it('selects block references by qualified source identity', () => {
    render(<HelpModal isOpen onClose={() => {}} topics={topics} />);
    fireEvent.click(screen.getByRole('button', { name: 'Block reference' }));
    fireEvent.click(screen.getByRole('button', { name: /Physical Same/ }));
    expect(screen.getByRole('heading', { name: 'Physical Same', level: 1 })).toBeTruthy();
    expect(screen.getByText('Conserves energy.')).toBeTruthy();
    expect(screen.queryByText('Apply the gain.')).toBeNull();
  });
  it('routes initial contextual Help and supports closing with Escape', () => {
    const onClose = vi.fn();
    render(<HelpModal isOpen onClose={onClose} topics={topics} initialTopic="sequence-diagrams" initialSection="guards" />);
    expect(screen.getByRole('heading', { name: 'Sequence Diagrams', level: 1 })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
