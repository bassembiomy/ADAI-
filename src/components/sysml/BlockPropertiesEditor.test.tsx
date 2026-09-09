import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BlockPropertiesEditor } from './BlockPropertiesEditor';

describe('BlockPropertiesEditor', () => {
  it('renders typed property semantics and accessible controls', () => {
    const html = renderToStaticMarkup(<BlockPropertiesEditor properties={[{ id: 'p', name: 'speed', type: 'Velocity', typeId: 'Velocity', kind: 'flow', multiplicity: '0..*', ordered: true, unique: false }]} typeOptions={[{ id: 'Velocity', name: 'Velocity', stereotype: 'valueType' }]} inheritedProperties={[]} onChange={() => {}} />);
    expect(html).toContain('Property kind');
    expect(html).toContain('Multiplicity');
    expect(html).toContain('Redefines');
    expect(html).toContain('Subsets');
    expect(html).toContain('ordered');
    expect(html).toContain('nonunique');
  });
});
