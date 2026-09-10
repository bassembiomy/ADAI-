import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { HELP_DATA } from '../../HelpData';

describe('Software Architecture Help topic', () => {
  it('registers the approved topic in the normal Help data registry', () => {
    expect(HELP_DATA['software-architecture']).toMatchObject({ title: 'Software Architecture Explorer', category: 'System' });
    expect(HELP_DATA['software-architecture'].sections?.length).toBeGreaterThan(0);
  });

  it('keeps the explorer integration callback-shaped for Help navigation', async () => {
    const { SoftwareArchitectureExplorer } = await import('./SoftwareArchitectureExplorer');
    const element = React.createElement(SoftwareArchitectureExplorer, { onClose: vi.fn() });
    expect(element.props.onClose).toBeDefined();
  });
});
