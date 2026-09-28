// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
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
});
