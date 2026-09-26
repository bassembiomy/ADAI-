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
});
