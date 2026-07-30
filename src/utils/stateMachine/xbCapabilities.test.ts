import { describe, expect, it } from 'vitest';
import { getXBBlockCapability } from './xbCapabilities';

describe('getXBBlockCapability', () => {
  it('marks deterministic arithmetic as codegen capable', () => {
    expect(getXBBlockCapability('GAIN')).toMatchObject({
      codegen: true,
      directFeedthrough: true,
      shapes: ['scalar', 'vector', 'matrix'],
    });
  });

  it('rejects host-only visualization and learning blocks', () => {
    expect(getXBBlockCapability('Scope')?.codegen).toBe(false);
    expect(getXBBlockCapability('LMS_ADAPTIVE_FILTER')?.codegen).toBe(false);
  });

  it('does not assume unknown block types are codegen capable', () => {
    expect(getXBBlockCapability('UNKNOWN_BLOCK')).toBeNull();
  });

  it.each(['constructor', 'toString'])('treats inherited name %s as unknown', (type) => {
    expect(getXBBlockCapability(type)).toBeNull();
  });
});
