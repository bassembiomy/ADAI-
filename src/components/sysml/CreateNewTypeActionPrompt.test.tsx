// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CreateNewTypeActionPrompt } from './CreateNewTypeActionPrompt';

describe('CreateNewTypeActionPrompt', () => {
  it('shows candidates and does not create until the explicit action is invoked', () => {
    const action = { actionKind: 'CreateNewType' as const, suggestedName: 'Motor', targetOwnerId: 'model' };
    const onCreate = vi.fn();
    render(<CreateNewTypeActionPrompt action={action} candidates={[{ id: 'motor', name: 'Motor', qualifiedName: 'Model::Motor', metaclass: 'Block', score: 0.9 }]} onCreate={onCreate} onDismiss={vi.fn()} />);

    expect(screen.getByText(/Model::Motor/)).toBeTruthy();
    expect(onCreate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Create New Type' }));
    expect(onCreate).toHaveBeenCalledWith(action);
  });
});
