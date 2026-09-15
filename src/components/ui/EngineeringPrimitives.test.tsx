import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EngineeringButton, EngineeringInput } from './EngineeringPrimitives';

describe('engineering primitives', () => {
  it('exposes semantic control and focus classes', () => {
    const btnHtml = renderToStaticMarkup(<EngineeringButton>Run</EngineeringButton>);
    const inputHtml = renderToStaticMarkup(<EngineeringInput aria-label="Clock" />);
    expect(btnHtml).toContain('ui-control');
    expect(inputHtml).toContain('ui-focus-ring');
  });
});
