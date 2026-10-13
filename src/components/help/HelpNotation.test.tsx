import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HelpNotation } from './HelpNotation';
import { behaviorNotation, diagramNotation, relationshipNotation } from '../../help/notationReference';

describe('Help notation preview', () => {
  it('draws distinct live-style activity shapes, not generic boxes', () => {
    const html = renderToStaticMarkup(<HelpNotation items={[
      { label: 'Initial', meaning: 'Starts flow', ...behaviorNotation['activity:initial'] },
      { label: 'Decision', meaning: 'Guards choice', ...behaviorNotation['activity:decision'] },
      { label: 'Activity Final', meaning: 'Ends all', ...behaviorNotation['activity:activityFinal'] },
    ]} />);
    expect(html).toContain('Initial: Filled circle');
    expect(html).toContain('<circle');
    expect(html).toContain('M60 12 85 33 60 54 35 33Z');
    expect(html).toContain('Shape:');
    expect(html).toContain('Connect:');
  });
  it('distinguishes directed relationships and the non-canvas Model Browser entry', () => {
    const html = renderToStaticMarkup(<HelpNotation items={[
      { label: 'Composition', meaning: 'Whole part', ...relationshipNotation.Composition },
      { label: 'Include', meaning: 'Reused goal', ...relationshipNotation.Include },
      { label: 'Actor', meaning: 'Role', ...diagramNotation['use-case-diagrams'].Actor },
    ]} />);
    expect(html).toContain('marker-start=');
    expect(html).toContain('stroke-dasharray="6 4"');
    expect(html).toContain('marker-end=');
    expect(html).toContain('Actor: Stick figure');
  });
});
