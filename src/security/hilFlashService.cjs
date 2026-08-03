'use strict';

const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { evaluateFlashRequest } = require('./hilFlashPolicy.cjs');
const { getFlashRecipe } = require('./hilFlashRecipes.cjs');

class HilFlashService {
  constructor() {
    this.confirmations = new Map(); // token -> { token, expiresAt, buildId, probeId }
  }

  issueFlashConfirmation(buildId, probeId) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 60_000; // 60s TTL
    const record = { token, expiresAt, buildId, probeId };
    this.confirmations.set(token, record);
    return record;
  }

  validateConfirmationToken(token, buildId, probeId) {
    if (!token || !this.confirmations.has(token)) {
      return { valid: false, code: 'INVALID_CONFIRMATION_TOKEN', message: 'Confirmation token is invalid or missing' };
    }

    const record = this.confirmations.get(token);
    // Single-use: delete immediately upon retrieval
    this.confirmations.delete(token);

    if (Date.now() > record.expiresAt) {
      return { valid: false, code: 'EXPIRED_CONFIRMATION_TOKEN', message: 'Confirmation token has expired' };
    }

    if (record.buildId !== buildId) {
      return { valid: false, code: 'BUILD_MISMATCH', message: 'Confirmation token does not match buildId' };
    }

    if (record.probeId !== probeId) {
      return { valid: false, code: 'DEVICE_MISMATCH', message: 'Confirmation token does not match probeId' };
    }

    return { valid: true };
  }

  async flash(request, verifiedBuild, opts = {}) {
    const policyResult = evaluateFlashRequest(request, verifiedBuild);
    if (!policyResult.allowed) {
      return policyResult;
    }

    // Validate confirmation token
    const tokenResult = this.validateConfirmationToken(request.confirmationToken, request.buildId, request.probeId);
    if (!tokenResult.valid) {
      return Object.freeze({ allowed: false, code: tokenResult.code, error: tokenResult.message });
    }

    // Check probe match
    const availableProbes = opts.probes || [];
    if (availableProbes.length > 1) {
      return Object.freeze({ allowed: false, code: 'AMBIGUOUS_PROBE', error: 'Multiple probes detected' });
    }
    const probe = availableProbes.find(p => p.probeId === request.probeId);
    if (!probe) {
      return Object.freeze({ allowed: false, code: 'DEVICE_MISMATCH', error: 'Specified probe was not detected' });
    }

    const recipe = getFlashRecipe(request.targetSelection.targetId, {
      programmerId: request.programmerId,
      artifactPath: verifiedBuild?.artifacts?.elfPath || 'firmware.elf',
    });

    let spawnResult = { exitCode: 0, stdout: '', stderr: '' };
    if (opts.mockSpawn) {
      spawnResult = await opts.mockSpawn(recipe.executable, recipe.args, { shell: false });
    } else {
      spawnResult = await new Promise((resolve) => {
        const child = spawn(recipe.executable, recipe.args, { shell: false });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', chunk => { stdout += chunk.toString(); });
        child.stderr.on('data', chunk => { stderr += chunk.toString(); });
        child.on('close', code => resolve({ exitCode: code, stdout, stderr }));
        child.on('error', err => resolve({ exitCode: 1, stdout, stderr: err.message }));
      });
    }

    if (spawnResult.exitCode !== 0) {
      return Object.freeze({ allowed: false, code: 'FLASH_FAILED', error: spawnResult.stderr || 'Flash process failed' });
    }

    const readbackHash = opts.readbackHash || request.artifactHash;
    if (readbackHash !== request.artifactHash) {
      return Object.freeze({ allowed: false, code: 'READBACK_MISMATCH', error: 'Firmware readback hash mismatch' });
    }

    return Object.freeze({
      allowed: true,
      status: 'FLASH_VERIFIED',
      probeId: request.probeId,
      artifactHash: request.artifactHash,
      programmerVersion: '1.0.0',
      timestamp: Date.now(),
      logs: Object.freeze({
        stdout: spawnResult.stdout.slice(0, 4096),
        stderr: spawnResult.stderr.slice(0, 4096),
      }),
    });
  }
}

module.exports = { HilFlashService };
