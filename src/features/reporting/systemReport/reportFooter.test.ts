import { describe, it, expect } from 'vitest';
import { cssString, printFooterCss } from './reportStyles';
import { SYSTEM_REPORT_CSS } from './reportStyles';

describe('print footer', () => {
  it('escapes model-supplied text for a CSS string', () => {
    expect(cssString('a"b\\c\nd</style>')).toBe('"a\\"b\\\\c d\\3c /style>"');
  });
  it('renders the footer in @bottom-left of both page types and no fixed-position fallback', () => {
    const css = printFooterCss('DOC-1 · Proj');
    expect(css).toContain('@page { @bottom-left { content:"DOC-1 · Proj"');
    expect(css).toContain('@page wide { @bottom-left');
    expect(SYSTEM_REPORT_CSS).not.toContain('print-footer');
    expect(SYSTEM_REPORT_CSS).not.toContain('position:fixed');
  });
});
