// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { PortToolMenu } from './PortToolMenu';

describe('PortToolMenu', () => {
  afterEach(() => {
    cleanup();
  });
  it('exposes Standard UML Port, Proxy Port, Full Port, and Legacy Flow Port options', () => {
    const onSelect = vi.fn();
    const onClear = vi.fn();

    render(
      <PortToolMenu
        activePortTool={null}
        onSelectPortTool={onSelect}
        onClearPortTool={onClear}
      />,
    );

    // Open the port tool menu
    const mainBtn = screen.getByRole('button', { name: /port/i });
    fireEvent.click(mainBtn);

    expect(screen.getByRole('menuitem', { name: /Standard UML Port/i })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Proxy Port/i })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Full Port/i })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Legacy Flow Port/i })).toBeTruthy();

    // Selecting Proxy Port
    fireEvent.click(screen.getByRole('menuitem', { name: /Proxy Port/i }));
    expect(onSelect).toHaveBeenCalledWith('proxyPort');
  });

  it('clears active port tool on Escape key press', () => {
    const onSelect = vi.fn();
    const onClear = vi.fn();

    render(
      <PortToolMenu
        activePortTool="proxyPort"
        onSelectPortTool={onSelect}
        onClearPortTool={onClear}
      />,
    );

    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(onClear).toHaveBeenCalled();
  });
});
