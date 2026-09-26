import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { FactoryIOGateway } from './FactoryIOGateway';

describe('FactoryIOGateway component', () => {
  it('returns null when isOpen is false', () => {
    const html = renderToStaticMarkup(
      <FactoryIOGateway
        isOpen={false}
        onClose={() => {}}
        variables={[]}
        mapping={[]}
        setMapping={() => {}}
        isEnabled={false}
        setIsEnabled={() => {}}
        status="disconnected"
      />
    );
    expect(html).toBe('');
  });

  it('renders correctly in disabled state with Offline indicator', () => {
    const html = renderToStaticMarkup(
      <FactoryIOGateway
        isOpen={true}
        onClose={() => {}}
        variables={[]}
        mapping={[]}
        setMapping={() => {}}
        isEnabled={false}
        setIsEnabled={() => {}}
        status="disconnected"
      />
    );

    expect(html).toContain('Factory I/O Gateway');
    expect(html).toContain('Offline');
    expect(html).toContain('Enable Real-Time Synchronization');
    // Disabled toggle switch styling
    expect(html).toContain('bg-gray-700');
    expect(html).toContain('translate-x-1');
  });

  it('renders correctly in enabled state with active styling', () => {
    const html = renderToStaticMarkup(
      <FactoryIOGateway
        isOpen={true}
        onClose={() => {}}
        variables={[]}
        mapping={[]}
        setMapping={() => {}}
        isEnabled={true}
        setIsEnabled={() => {}}
        status="connected"
      />
    );

    expect(html).toContain('Factory I/O Gateway');
    expect(html).toContain('Live Link Active');
    // Enabled toggle switch styling
    expect(html).toContain('bg-indigo-600');
    expect(html).toContain('translate-x-6');
  });
});
