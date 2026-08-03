'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { evaluateBuildRequest } = require('./hilBuildPolicy.cjs');
const { getBuildRecipe } = require('./hilBuildRecipes.cjs');
const { inspectElf } = require('./elfInspector.cjs');

class HilBuildServiceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'HilBuildServiceError';
    this.code = code;
  }
}

class HilBuildService {
  constructor(opts = {}) {
    this.activeBuilds = new Set();
    this.mockSpawn = opts.mockSpawn || null;
  }

  async build(request, savedWorkspace, opts = {}) {
    const evaluation = evaluateBuildRequest(request, savedWorkspace);
    if (!evaluation.allowed) {
      throw new HilBuildServiceError(evaluation.code, evaluation.error);
    }

    const buildKey = `${request.buildId}:${request.targetSelection.targetId}`;
    if (this.activeBuilds.has(buildKey)) {
      throw new HilBuildServiceError('CONCURRENT_BUILD', 'A build for this ID is already in progress');
    }

    this.activeBuilds.add(buildKey);

    try {
      const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adia-build-'));

      // Copy source files from savedWorkspace if workspace directory exists
      if (savedWorkspace && savedWorkspace.dir && fs.existsSync(savedWorkspace.dir)) {
        for (const fileName of evaluation.sourceFiles) {
          const srcFile = path.join(savedWorkspace.dir, fileName);
          if (fs.existsSync(srcFile)) {
            fs.copyFileSync(srcFile, path.join(buildDir, fileName));
          }
        }
      }

      const recipe = getBuildRecipe(request.targetSelection.targetId, {
        sources: evaluation.sourceFiles,
        linkerScript: opts.linkerScript,
        startupFile: opts.startupFile,
      });

      // Execute build command with shell: false
      let spawnResult = { exitCode: 0, stdout: '', stderr: '' };
      if (this.mockSpawn) {
        spawnResult = await this.mockSpawn(recipe.executable, recipe.args, { cwd: buildDir, shell: false });
      } else if (opts.skipSpawnForTest) {
        spawnResult = { exitCode: 0, stdout: 'Build successful', stderr: '' };
      } else {
        spawnResult = await new Promise((resolve) => {
          const child = spawn(recipe.executable, recipe.args, { cwd: buildDir, shell: false });
          let stdout = '';
          let stderr = '';
          child.stdout.on('data', chunk => { stdout += chunk.toString(); });
          child.stderr.on('data', chunk => { stderr += chunk.toString(); });
          child.on('close', code => resolve({ exitCode: code, stdout, stderr }));
          child.on('error', err => resolve({ exitCode: 1, stdout, stderr: err.message }));
        });
      }

      const elfPath = path.join(buildDir, 'firmware.elf');
      const inspection = await inspectElf(elfPath, opts.pack || {
        memoryRegions: [
          { name: 'FLASH', start: 0x08000000, size: 1048576 },
          { name: 'RAM', start: 0x20000000, size: 131072 },
        ],
      }, opts);

      const status = (spawnResult.exitCode === 0 && inspection.valid)
        ? 'LINKED_IMAGE_VERIFIED'
        : 'BUILD_FAILED';

      const buildRecord = Object.freeze({
        buildId: request.buildId,
        targetSelection: Object.freeze({ ...request.targetSelection }),
        recipeId: recipe.recipeId,
        sourceManifestHash: request.sourceManifestHash,
        status,
        buildDir,
        artifacts: Object.freeze({
          elfPath,
          hashes: inspection.hashes,
        }),
        memory: inspection.memory,
        logs: Object.freeze({
          stdout: spawnResult.stdout.slice(0, 4096),
          stderr: spawnResult.stderr.slice(0, 4096),
        }),
        timestamp: Date.now(),
      });

      return buildRecord;
    } finally {
      this.activeBuilds.delete(buildKey);
    }
  }
}

module.exports = { HilBuildService, HilBuildServiceError };
