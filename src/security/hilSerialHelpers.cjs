// src/security/hilSerialHelpers.cjs
// Pure helpers for the HIL serial IPC handlers in main.cjs.

'use strict';

const HIL_MAX_PAYLOAD = 256;
const HIL_MAX_LINE = 4096;

/**
 * Validate and normalise an outgoing HIL command.
 * Returns the single-line command (no CR/LF) or null when it must be rejected.
 */
function normalizeHilPayload(payload, maxLen = HIL_MAX_PAYLOAD) {
  if (typeof payload !== 'string') return null;
  const text = payload.replace(/\r/g, '').trim();
  if (text.length === 0 || text.length > maxLen) return null;
  // Single line only; no control characters (NUL etc.).
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(text)) return null;
  return text;
}

/**
 * Incremental newline splitter with a bounded buffer. Lines longer than
 * maxLen are dropped entirely (up to and including the next newline).
 */
function createLineSplitter(maxLen = HIL_MAX_LINE) {
  let buffer = '';
  let discarding = false;
  return {
    push(chunk) {
      const lines = [];
      const parts = String(chunk).split('\n');
      for (let i = 0; i < parts.length; i++) {
        const isLast = i === parts.length - 1;
        let part = parts[i];
        if (discarding) {
          if (!isLast) discarding = false;
          continue;
        }
        buffer += part;
        if (buffer.length > maxLen) {
          buffer = '';
          discarding = isLast;
          continue;
        }
        if (!isLast) {
          const line = buffer.replace(/\r$/, '');
          buffer = '';
          if (line.trim()) lines.push(line);
        }
      }
      return lines;
    },
  };
}

module.exports = { normalizeHilPayload, createLineSplitter, HIL_MAX_PAYLOAD, HIL_MAX_LINE };
