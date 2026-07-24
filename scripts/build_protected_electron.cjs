// scripts/build_protected_electron.js
// ============================================================================
// ADIA Anti-Extraction Build Script
// ============================================================================
// 1. Bundles main process & security modules with esbuild
// 2. Obfuscates bundled JavaScript (control flow flattening + string array encryption)
// 3. Compiles obfuscated JS to native V8 bytecode (.jsc) via bytenode
// 4. Deletes intermediate plain JS bundles
// 5. Generates the index.cjs bytecode loader and obfuscates preload.cjs
// ============================================================================

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const JavaScriptObfuscator = require('javascript-obfuscator');
const bytenode = require('bytenode');

const ROOT_DIR = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'src');
const DIST_ELECTRON_DIR = path.join(ROOT_DIR, 'dist-electron');

async function buildProtectedElectron() {
  console.log('🔒 [Anti-Extraction] Starting protected Electron build...');

  // Ensure output directory exists
  if (!fs.existsSync(DIST_ELECTRON_DIR)) {
    fs.mkdirSync(DIST_ELECTRON_DIR, { recursive: true });
  }

  // Step 1: Bundle main process and security modules into a single file
  console.log('📦 [1/5] Bundling main process with esbuild...');
  const bundlePath = path.join(DIST_ELECTRON_DIR, 'main_bundled.js');

  await esbuild.build({
    entryPoints: [path.join(SRC_DIR, 'main.cjs')],
    bundle: true,
    outfile: bundlePath,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    // Mark built-in and native binaries as external so they are loaded at runtime
    external: [
      'electron',
      'serialport',
      'keytar',
      'fsevents',
    ],
    sourcemap: false,
    minify: true,
  });

  // Step 2: Apply heavy JavaScript obfuscation
  console.log('🌀 [2/5] Obfuscating main process JavaScript bundle...');
  const rawBundleCode = fs.readFileSync(bundlePath, 'utf8');

  const obfuscatedResult = JavaScriptObfuscator.obfuscate(rawBundleCode, {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: false,
    debugProtection: false,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: true,
    renameGlobals: false,
    selfDefending: false,
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 5,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayCallsTransformThreshold: 0.75,
    stringArrayEncoding: ['base64', 'rc4'],
    stringArrayIndexesType: ['hexadecimal-number'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersCount: 2,
    stringArrayWrappersChainedCalls: true,
    stringArrayWrappersParametersMaxCount: 4,
    stringArrayWrappersType: 'function',
    stringArrayThreshold: 0.8,
    transformObjectKeys: true,
    unicodeEscapeSequence: false
  });

  const obfuscatedPath = path.join(DIST_ELECTRON_DIR, 'main_obfuscated.js');
  fs.writeFileSync(obfuscatedPath, obfuscatedResult.getObfuscatedCode(), 'utf8');
  fs.unlinkSync(bundlePath); // Remove unobfuscated intermediate bundle

  // Step 3: Compile obfuscated JavaScript to V8 Bytecode (.jsc)
  console.log('⚡ [3/5] Compiling to V8 Bytecode (.jsc) with bytenode...');
  const jscPath = path.join(DIST_ELECTRON_DIR, 'main.jsc');

  await bytenode.compileFile({
    filename: obfuscatedPath,
    output: jscPath,
    compileAsModule: true,
  });

  fs.unlinkSync(obfuscatedPath); // Remove plain obfuscated JS — only binary bytecode remains!

  // Step 4: Create tiny ignition loader index.cjs
  console.log('🔑 [4/5] Creating V8 bytecode ignition loader (index.cjs)...');
  const loaderCode = `// ADIA V8 Bytecode Launcher
'use strict';
const bytenode = require('bytenode');
const path = require('path');
require(path.join(__dirname, 'main.jsc'));
`;
  fs.writeFileSync(path.join(DIST_ELECTRON_DIR, 'index.cjs'), loaderCode, 'utf8');

  // Step 5: Obfuscate preload.cjs
  console.log('🛡️  [5/5] Obfuscating preload.cjs...');
  const rawPreloadCode = fs.readFileSync(path.join(SRC_DIR, 'preload.cjs'), 'utf8');
  const obfuscatedPreload = JavaScriptObfuscator.obfuscate(rawPreloadCode, {
    compact: true,
    controlFlowFlattening: true,
    identifierNamesGenerator: 'hexadecimal',
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.8,
  });

  fs.writeFileSync(path.join(DIST_ELECTRON_DIR, 'preload.cjs'), obfuscatedPreload.getObfuscatedCode(), 'utf8');

  console.log('✅ [Anti-Extraction] Protected Electron build complete!');
  console.log(`   Bytecode binary: ${jscPath}`);
  console.log(`   Ignition loader: ${path.join(DIST_ELECTRON_DIR, 'index.cjs')}`);
  console.log(`   Protected preload: ${path.join(DIST_ELECTRON_DIR, 'preload.cjs')}`);
}

buildProtectedElectron().catch((err) => {
  console.error('❌ Build protected electron failed:', err);
  process.exit(1);
});
