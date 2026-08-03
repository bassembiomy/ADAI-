'use strict';

async function detectProbes(targetSelection, opts = {}) {
  if (opts.mockProbes) {
    return opts.mockProbes.filter(p => !targetSelection || p.programmerId);
  }
  return [];
}

module.exports = { detectProbes };
