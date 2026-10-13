'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { evaluateBuildRequest } = require('./hilBuildPolicy.cjs');
class HilBuildServiceError extends Error {
  constructor(code, message) { super(message); this.name = 'HilBuildServiceError'; this.code = code; }
}
function verifyWorkspaceSources(workspace) {
  const dir = workspace.buildDir;
  if (!dir || !fs.existsSync(dir)) throw new HilBuildServiceError('NO_SAVED_WORKSPACE', 'Saved project directory is missing');
  const canonical = [...workspace.files].sort((a,b) => a.localeCompare(b)).map(name => {
    const file = path.resolve(dir,name);
    if (path.dirname(file) !== path.resolve(dir) || !fs.existsSync(file) || !fs.lstatSync(file).isFile()) throw new HilBuildServiceError('STALE_SOURCE_MANIFEST', 'Saved source is missing or unsafe: '+name);
    const content = fs.readFileSync(file,'utf8');
    return `${name}\0${content.length}\0${content}`;
  }).join('\0');
  const hash = 'sha256:'+crypto.createHash('sha256').update(canonical,'utf8').digest('hex');
  if (hash !== workspace.sourceManifestHash) throw new HilBuildServiceError('STALE_SOURCE_MANIFEST','Saved sources changed; save and rebuild the project');
}
class HilBuildService {
  constructor(opts = {}) { this.activeBuilds = new Set(); this.productionBuilder = opts.buildProductionProject; this.hostBuilder = opts.buildHostSimulation; }
  async build(request, savedWorkspace, opts = {}) {
    const evaluation = evaluateBuildRequest(request,savedWorkspace);
    if (!evaluation.allowed) throw new HilBuildServiceError(evaluation.code,evaluation.error);
    const buildKey = path.resolve(savedWorkspace.buildDir || '.');
    if (this.activeBuilds.has(buildKey)) throw new HilBuildServiceError('CONCURRENT_BUILD','A build for this project is already in progress');
    verifyWorkspaceSources(savedWorkspace);
    this.activeBuilds.add(buildKey);
    try {
      const host = request.targetSelection.targetId === 'generic-host';
      const builder = host ? this.hostBuilder || require('./hilRuntime.cjs').buildHostSimulation : this.productionBuilder || require('./hilRuntime.cjs').buildProductionProject;
      const result = await builder({targetId:request.targetSelection.targetId,projectDir:savedWorkspace.buildDir,files:[...savedWorkspace.files],onLog:opts.onLog,resourcesPath:opts.resourcesPath,repoRoot:opts.repoRoot,cacheDir:opts.cacheDir});
      verifyWorkspaceSources(savedWorkspace);
      const inspection = result.inspection;
      const verified = result.success && inspection?.valid && inspection.evidence === 'tool-output';
      const status = host ? verified && result.hostSimulationVerified && result.exePath ? 'HOST_SIMULATION_VERIFIED' : 'BUILD_FAILED' : verified && result.elfPath && result.flashImages?.length ? 'LINKED_IMAGE_VERIFIED' : 'BUILD_FAILED';
      return Object.freeze({buildId:request.buildId,targetSelection:Object.freeze({...request.targetSelection}),recipeId:evaluation.recipeId,sourceManifestHash:request.sourceManifestHash,status,buildDir:savedWorkspace.buildDir,flashBlocked:status !== 'LINKED_IMAGE_VERIFIED' || savedWorkspace.flashBlocked,artifactHash:inspection?.hashes?.elf || null,artifacts:Object.freeze({exePath:result.exePath || null,elfPath:result.elfPath || null,hexPath:result.hexPath || null,binPath:result.binPath || null,flashImages:Object.freeze((result.flashImages || []).map(image => Object.freeze({...image}))),hashes:inspection?.hashes || null}),memory:inspection?.memory || null,inspection,logs:result.logs || [],code:result.code,error:result.error,timestamp:Date.now()});
    } finally { this.activeBuilds.delete(buildKey); }
  }
}
module.exports = {HilBuildService,HilBuildServiceError,verifyWorkspaceSources};
