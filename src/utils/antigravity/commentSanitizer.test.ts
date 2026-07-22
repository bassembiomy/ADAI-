import { describe, it, expect } from 'vitest';
import { sanitizeComments } from './commentSanitizer';

describe('commentSanitizer - COMMENT_SHIELD Protocol', () => {
  it('should convert single-slash block comment attempts to valid block comments', () => {
    const rawC = `
      / MISRA C:2012 Rule 15.7 /
      void SM_Init(ADIA_Instance_t* instance) {
          instance->current_state = 0U;
      }
    `;
    const result = sanitizeComments(rawC);
    expect(result).toContain('/* MISRA C:2012 Rule 15.7 */');
    expect(result).not.toContain('/ MISRA C:2012 Rule 15.7 /');
  });

  it('should auto-close unclosed block comments before code blocks', () => {
    const rawC = `
      /* Initialization logic
      void SM_Init(ADIA_Instance_t* instance) {
          instance->current_state = 0U;
      }
    `;
    const result = sanitizeComments(rawC);
    expect(result).toContain('/* Initialization logic */');
  });

  it('should leave valid block comments unchanged', () => {
    const rawC = `
      /* Standard MISRA comment */
      void SM_Init(ADIA_Instance_t* instance);
    `;
    const result = sanitizeComments(rawC);
    expect(result).toContain('/* Standard MISRA comment */');
  });
});
