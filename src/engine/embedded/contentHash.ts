/**
 * Browser-compatible content hash for file fingerprinting.
 * Uses a fast deterministic hash (FNV-1a inspired) that works in both
 * browser and Electron without requiring node:crypto.
 *
 * This replaces `createHash('sha256')` from `node:crypto` which crashes
 * the Vite dev server because Node.js built-in modules are unavailable
 * in the browser context.
 */
export function contentHash(content: string): `sha256:${string}` {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < content.length; i++) {
    const ch = content.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hash = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(16, '0');
  return `sha256:${hash}`;
}
