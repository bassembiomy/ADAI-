import { describe, expect, it } from 'vitest';
import { serializeInlineScriptJson } from './smInlineScriptSerialization';

describe('serializeInlineScriptJson', () => {
  it('neutralizes classic-script termination and JavaScript separators', () => {
    const attack = '</script><script>window.__ADIA_XSS__ = true;</script>'
      + '\u2028line-separator\u2029paragraph-separator<&>';
    const payload = {
      attack,
      nested: [{ [attack]: attack }],
    };

    const serialized = serializeInlineScriptJson(payload);

    expect(serialized).not.toContain('</script');
    expect(serialized).not.toContain('<');
    expect(serialized).not.toContain('>');
    expect(serialized).not.toContain('&');
    expect(serialized).not.toContain('\u2028');
    expect(serialized).not.toContain('\u2029');
    expect(serialized).toContain('\\u003c/script\\u003e');
    expect(serialized).toContain('\\u2028');
    expect(serialized).toContain('\\u2029');
    expect(JSON.parse(serialized)).toEqual(payload);
  });
});
