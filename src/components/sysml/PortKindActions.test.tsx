// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { semanticPresentationToken } from '../../engine/sysml/semanticPresentationStyles';
import { PortKindActions } from './PortKindActions';

describe('PortKindActions', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders four named actions: Standard, Flow, Proxy, and Full', () => {
    const onAddPort = vi.fn();
    render(<PortKindActions onAddPort={onAddPort} />);

    expect(screen.getByRole('button', { name: /standard/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /flow/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /proxy/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /full/i })).toBeTruthy();
  });

  it('calls onAddPort with the matching kind when clicked', () => {
    const onAddPort = vi.fn();
    render(<PortKindActions onAddPort={onAddPort} />);

    fireEvent.click(screen.getByRole('button', { name: /standard/i }));
    expect(onAddPort).toHaveBeenCalledWith('standard');

    fireEvent.click(screen.getByRole('button', { name: /flow/i }));
    expect(onAddPort).toHaveBeenCalledWith('flow');

    fireEvent.click(screen.getByRole('button', { name: /proxy/i }));
    expect(onAddPort).toHaveBeenCalledWith('proxy');

    fireEvent.click(screen.getByRole('button', { name: /full/i }));
    expect(onAddPort).toHaveBeenCalledWith('full');

    expect(onAddPort).toHaveBeenCalledTimes(4);
  });

  it('uses the shared semantic presentation palette for each port kind', () => {
    render(<PortKindActions onAddPort={vi.fn()} />);

    const palette = [
      ['Standard', 'standardPort'],
      ['Flow', 'flowPort'],
      ['Proxy', 'proxyPort'],
      ['Full', 'fullPort'],
    ] as const;
    for (const [label, role] of palette) {
      const button = screen.getByRole('button', { name: label });
      expect(button.style.color).toBe(semanticPresentationToken(role));
      expect(button.style.borderColor).toBe(semanticPresentationToken(role));
    }
  });
});
