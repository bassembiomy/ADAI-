// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { StateMachineCanvasContextMenu } from './StateMachineCanvasContextMenu';

describe('StateMachineCanvasContextMenu', () => {
  afterEach(() => {
    cleanup();
  });
  it('renders strictly State, Junction, and X-Bridges State items', () => {
    render(
      <StateMachineCanvasContextMenu
        x={100}
        y={150}
        worldX={200}
        worldY={300}
        onAddState={vi.fn()}
        onAddJunction={vi.fn()}
        onAddXBridgesState={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole('menuitem', { name: /^state/i })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /junction/i })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /x-bridges/i })).toBeTruthy();
    // Ensure no unsupported pseudostates are rendered
    expect(screen.queryByRole('menuitem', { name: /initial/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /choice/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /fork/i })).toBeNull();
  });

  it('calls onAddState and onClose when State is selected', () => {
    const onAddState = vi.fn();
    const onClose = vi.fn();

    render(
      <StateMachineCanvasContextMenu
        x={100}
        y={150}
        worldX={250}
        worldY={350}
        onAddState={onAddState}
        onAddJunction={vi.fn()}
        onAddXBridgesState={vi.fn()}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole('menuitem', { name: /state$/i }));
    expect(onAddState).toHaveBeenCalledWith(250, 350);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onAddJunction and onClose when Junction is selected', () => {
    const onAddJunction = vi.fn();
    const onClose = vi.fn();

    render(
      <StateMachineCanvasContextMenu
        x={100}
        y={150}
        worldX={250}
        worldY={350}
        onAddState={vi.fn()}
        onAddJunction={onAddJunction}
        onAddXBridgesState={vi.fn()}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole('menuitem', { name: /junction/i }));
    expect(onAddJunction).toHaveBeenCalledWith(250, 350);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onAddXBridgesState and onClose when X-Bridges State is selected', () => {
    const onAddXBridgesState = vi.fn();
    const onClose = vi.fn();

    render(
      <StateMachineCanvasContextMenu
        x={100}
        y={150}
        worldX={250}
        worldY={350}
        onAddState={vi.fn()}
        onAddJunction={vi.fn()}
        onAddXBridgesState={onAddXBridgesState}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole('menuitem', { name: /x-bridges/i }));
    expect(onAddXBridgesState).toHaveBeenCalledWith(250, 350);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();

    render(
      <StateMachineCanvasContextMenu
        x={100}
        y={150}
        worldX={250}
        worldY={350}
        onAddState={vi.fn()}
        onAddJunction={vi.fn()}
        onAddXBridgesState={vi.fn()}
        onClose={onClose}
      />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
