import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// Minimal, deterministic help content so the test does not depend on the
// (parallel, partially filled) content files.
vi.mock('../../help', () => {
  const block = {
    id: 'GAIN', summary: 'Multiplies the input by a constant.', description: 'Scales the signal.',
    shape: 'A triangle with the input on the left.', ports: [{ id: 'in', description: 'Input signal.' }],
    params: [{ key: 'gain', description: 'Scale factor.', range: 'any real' }],
    algorithm: 'y = K * u', usage: ['Drag the block onto the canvas.', 'Set the gain.'],
    characteristics: { directFeedthrough: true, sampleTime: 'Inherited', states: 'none', zeroCrossing: false, dataTypes: 'double', codeGeneration: 'Embedded C99' },
    simulationExecution: 'Evaluated in sorted order.', embeddedExecution: 'Emitted as a multiplication.',
    seeAlso: ['Sum'],
  };
  const items = {
    'statemachine.state': {
      id: 'statemachine.state', module: 'statemachine', name: 'State', shape: 'Rounded rectangle.', shapeSketch: '(  State  )',
      summary: 'A mode of the system.', description: 'Holds entry and exit actions.', usage: ['Click Add State.'],
      connections: ['Connects through transitions.'], semantics: 'Exactly one state is active.',
    },
  };
  return {
    CONCEPT_TOPICS: {
      'test-concept': {
        title: 'Zebra Concept', category: 'Foundations', description: 'A concept topic.', content: 'Body text.',
        sections: [{ title: 'Flow', body: 'See diagram.', diagram: '[A] --> [B]' }],
      },
    },
    ITEM_HELP: items,
    ITEM_MODULE_LABELS: { statemachine: 'State Machine' },
    getBlockHelp: (source: string, id: string) => (source === 'X-Bridges' && id === 'GAIN' ? block : undefined),
  };
});

import { HelpModal } from './HelpModal';

const render = (props: Partial<React.ComponentProps<typeof HelpModal>> = {}) =>
  renderToStaticMarkup(<HelpModal isOpen onClose={() => {}} {...props} />);

describe('HelpModal', () => {
  it('opens a concept topic and shows its diagram', () => {
    const html = render({ initialTopic: 'test-concept' });
    expect(html).toContain('Zebra Concept');
    expect(html).toContain('Diagram');
    expect(html).toContain('[A] --&gt; [B]');
  });

  it('shows a MATLAB-style block page in the Block Reference', () => {
    const html = render({ initialView: 'blocks', initialBlockKey: 'X-Bridges|GAIN' });
    for (const heading of ['Description', 'Shape', 'Ports', 'Parameters', 'Algorithm', 'Block Characteristics', 'Usage', 'Simulation Execution', 'Embedded / Code Generation']) {
      expect(html).toContain(heading);
    }
    expect(html).toContain('y = K * u');
    expect(html).toContain('Multiplies the input by a constant.');
  });

  it('falls back to the generic page when no help entry exists', () => {
    const html = render({ initialView: 'blocks', initialBlockKey: 'X-Bridges|Sum' });
    expect(html).toContain('How to Use');
  });

  it('lists diagram items grouped by module and shows a detail page', () => {
    const list = render({ initialView: 'items' });
    expect(list).toContain('Diagram Items');
    expect(list).toContain('State Machine');
    expect(list).toContain('>State<');
    const detail = render({ initialView: 'items', initialItemId: 'statemachine.state' });
    expect(detail).toContain('Exactly one state is active.');
    expect(detail).toContain('(  State  )');
  });

  it('filters the topic list with the search box text', () => {
    const hit = render({ initialSearch: 'zebra' });
    expect(hit).toContain('Zebra Concept');
    expect(hit).not.toContain('Getting Started</button>');
    const miss = render({ initialSearch: 'qqqqnotfoundqqqq' });
    expect(miss).toContain('No topics match your search.');
  });
});
