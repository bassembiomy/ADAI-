// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { IbdConnectorEndpoint } from './IbdConnectorEndpoint';

describe('IbdConnectorEndpoint Component', () => {
  afterEach(cleanup);
  it('renders semantic hit target with data attributes and responds to clicks', () => {
    const handleClick = vi.fn();
    const handleHover = vi.fn();

    render(
      <svg>
        <IbdConnectorEndpoint
          usageId="pu-1"
          definitionId="port-motor-ctrl"
          ownerOccurrenceId="leftMotor"
          name="ctrl"
          direction="in"
          x={100}
          y={150}
          onClick={handleClick}
          onHover={handleHover}
        />
      </svg>
    );

    const endpoint = screen.getByTestId('ibd-connector-endpoint');
    expect(endpoint.getAttribute('data-definition-id')).toBe('port-motor-ctrl');
    expect(endpoint.getAttribute('data-occurrence-id')).toBe('leftMotor');
    expect(endpoint.getAttribute('data-usage-id')).toBe('pu-1');

    fireEvent.click(endpoint);
    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(handleClick).toHaveBeenCalledWith({
      usageId: 'pu-1',
      definitionId: 'port-motor-ctrl',
      ownerOccurrenceId: 'leftMotor',
    }, expect.anything());

    fireEvent.mouseEnter(endpoint);
    expect(handleHover).toHaveBeenCalledWith({
      usageId: 'pu-1',
      definitionId: 'port-motor-ctrl',
      ownerOccurrenceId: 'leftMotor',
    });

    fireEvent.mouseLeave(endpoint);
    expect(handleHover).toHaveBeenCalledWith(null);
  });

  it('renders boundary endpoint with boundary occurrence identifier', () => {
    render(
      <svg>
        <IbdConnectorEndpoint
          definitionId="port-veh-bus"
          ownerOccurrenceId={null}
          isBoundary={true}
          name="bus"
          x={50}
          y={50}
        />
      </svg>
    );

    const endpoint = screen.getByTestId('ibd-connector-endpoint');
    expect(endpoint.getAttribute('data-occurrence-id')).toBe('boundary');
    expect(endpoint.getAttribute('data-definition-id')).toBe('port-veh-bus');
  });

  it('resolves port/preview presentation through style tokens, never SVG presentation attributes', () => {
    // Browsers do not resolve var() in SVG presentation attributes, so the
    // semantic tokens must reach the DOM via the style prop (jsdom string
    // check suffices short of a browser).
    const { container, rerender } = render(
      <svg>
        <IbdConnectorEndpoint definitionId="port-a" x={10} y={10} isSelected={true} />
      </svg>,
    );
    const selectedRect = container.querySelector('rect[width="12"]');
    expect(selectedRect).toBeTruthy();
    expect(selectedRect!.getAttribute('stroke')).toBeNull();
    expect(selectedRect!.getAttribute('fill')).toBeNull();
    expect(selectedRect!.getAttribute('style') ?? '').toContain('--sysml-sem-selection');

    rerender(
      <svg>
        <IbdConnectorEndpoint definitionId="port-b" x={10} y={10} isConnecting={true} isValidTarget={false} />
      </svg>,
    );
    const invalidRect = container.querySelector('rect[width="12"]');
    expect(invalidRect!.getAttribute('stroke')).toBeNull();
    expect(invalidRect!.getAttribute('style') ?? '').toContain('--sysml-sem-error');

    rerender(
      <svg>
        <IbdConnectorEndpoint definitionId="port-c" x={10} y={10} isBoundary={true} />
      </svg>,
    );
    const boundaryRect = container.querySelector('rect[width="12"]');
    expect(boundaryRect!.getAttribute('stroke')).toBeNull();
    expect(boundaryRect!.getAttribute('style') ?? '').toContain('--sysml-sem-proxy-port');
  });

  it('resolves the default symbol from the supplied port kind, falling back to the boundary heuristic only when absent', () => {
    // Finding 5a: an explicit kind wins over the boundary heuristic;
    // unknown kinds fall back to the standard-port role (never a silent
    // proxy promotion), and omitting the kind preserves legacy visuals.
    const cases: Array<{ portKind?: unknown; isBoundary?: boolean; token: string }> = [
      { portKind: 'full', token: '--sysml-sem-full-port' },
      { portKind: 'fullPort', token: '--sysml-sem-full-port' },
      { portKind: 'flow', token: '--sysml-sem-flow-port' },
      { portKind: 'flowPort', token: '--sysml-sem-flow-port' },
      { portKind: 'proxy', token: '--sysml-sem-proxy-port' },
      { portKind: 'proxyPort', token: '--sysml-sem-proxy-port' },
      { portKind: 'standard', token: '--sysml-sem-standard-port' },
      { portKind: 'standardPort', token: '--sysml-sem-standard-port' },
      { portKind: 'umlPort', token: '--sysml-sem-standard-port' },
      { portKind: 'mystery-kind', token: '--sysml-sem-standard-port' },
      // Supplied kind wins even on a boundary endpoint.
      { portKind: 'flow', isBoundary: true, token: '--sysml-sem-flow-port' },
      { portKind: 'full', isBoundary: true, token: '--sysml-sem-full-port' },
      { portKind: 'standard', isBoundary: true, token: '--sysml-sem-standard-port' },
      // Absent kind keeps the legacy boundary heuristic.
      { isBoundary: true, token: '--sysml-sem-proxy-port' },
      { isBoundary: false, token: '--sysml-sem-standard-port' },
      { token: '--sysml-sem-standard-port' },
    ];
    for (const { portKind, isBoundary, token } of cases) {
      const { container, unmount } = render(
        <svg>
          <IbdConnectorEndpoint definitionId="port-kind" x={10} y={10} portKind={portKind} isBoundary={isBoundary} />
        </svg>,
      );
      const rect = container.querySelector('rect[width="12"]');
      expect(rect!.getAttribute('stroke')).toBeNull();
      expect(rect!.getAttribute('fill')).toBeNull();
      expect(rect!.getAttribute('style') ?? '').toContain(token);
      unmount();
    }
  });

  it('renders a valid stored color override and falls back to the role token when absent or invalid', () => {
    // Finding 6a: rendered style equals the override when valid, the role
    // token when absent/invalid. Presentation only.
    const { container, rerender } = render(
      <svg>
        <IbdConnectorEndpoint definitionId="port-o" x={10} y={10} portKind="full" overrideColor="#123456" />
      </svg>,
    );
    const overridden = container.querySelector('rect[width="12"]');
    // Note: jsdom serializes the hex override as rgb(); either form proves
    // the rendered style equals the override rather than the role token.
    expect(overridden!.getAttribute('style') ?? '').toMatch(/#123456|rgb\(18,\s*52,\s*86\)/);
    expect(overridden!.getAttribute('style') ?? '').not.toContain('--sysml-sem-full-port');

    rerender(
      <svg>
        <IbdConnectorEndpoint definitionId="port-o" x={10} y={10} portKind="full" />
      </svg>,
    );
    const defaulted = container.querySelector('rect[width="12"]');
    expect(defaulted!.getAttribute('style') ?? '').toContain('--sysml-sem-full-port');

    rerender(
      <svg>
        <IbdConnectorEndpoint definitionId="port-o" x={10} y={10} portKind="full" overrideColor="not a color;;;" />
      </svg>,
    );
    const invalid = container.querySelector('rect[width="12"]');
    expect(invalid!.getAttribute('style') ?? '').toContain('--sysml-sem-full-port');
    expect(invalid!.getAttribute('style') ?? '').not.toContain('not a color');
  });
});
