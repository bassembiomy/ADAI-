// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useContextualHelp } from './helpContext';

vi.mock('./helpFeatures', () => ({ findHelpFeature: ({ featureId }: { featureId?: string }) => featureId === 'sequence:message' ? { topicId: 'sequence-diagrams', sectionId: 'messages' } : undefined }));
function Harness({ open }: { open: (topic: string, section?: string) => void }) {
  useContextualHelp('sequence', open);
  return <><button data-help-feature="sequence:message">Synchronous Call</button><button>Unregistered control</button></>;
}
afterEach(cleanup);
describe('contextual F1 Help', () => {
  it('opens the focused feature section without invoking its action', () => {
    const open = vi.fn(); const { getByText } = render(<Harness open={open} />);
    getByText('Synchronous Call').focus(); fireEvent.keyDown(window, { key: 'F1' });
    expect(open).toHaveBeenCalledWith('sequence-diagrams', 'messages');
  });
  it('falls back to the current workspace when a control has no exact mapping', () => {
    const open = vi.fn(); const { getByText } = render(<Harness open={open} />);
    getByText('Unregistered control').focus(); fireEvent.keyDown(window, { key: 'F1' });
    expect(open).toHaveBeenCalledWith('sequence-diagrams', undefined);
  });
  it('does not change the model or consume other keyboard shortcuts', () => {
    const open = vi.fn(); render(<Harness open={open} />); fireEvent.keyDown(window, { key: 'Delete' });
    expect(open).not.toHaveBeenCalled();
  });
});
