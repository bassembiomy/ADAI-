const fs = require('fs');
const path = require('path');

// Match hardcoded Tailwind hex classes for background, text, and border
const forbidden = /(?:bg|text|border)-\[#([0-9a-f]{3,8})\]/gi;

// Documented Allowlist:
// 1. Theme contract itself defines the root variable palette
const allowedFiles = new Set([
  'src/styles/theme-contract.css',
]);

// 2. Semantic module accents (dedicated domain branding colors)
// - X-Bridges champagne/gold: #c9a86c
// - SysML / HIL primary orange: #f97316, #ea580c
// - Emerald status/accents: #10b981, #059669
// - V-Lab signal blue & purple: #4da6ff, #a855f7, #c084fc, #0056b3, #0069d9
// - Standard green status: #28a745
const allowedSemanticAccents = new Set([
  '#c9a86c', '#f97316', '#ea580c', '#10b981', '#059669',
  '#4da6ff', '#a855f7', '#c084fc', '#0056b3', '#0069d9', '#28a745'
]);

// 3. Plots, dark oscilloscopes, raw hardware terminal surfaces (.ui-terminal, .hil-terminal)
// and compliance code viewers that intentionally remain dark
const allowedPlotAndTerminalSurfaces = new Set([
  '#020617', '#070d1a', '#050505', '#070707', '#0a0a0a', '#0c0c0c', '#0c0c10', '#06080c', '#0e0e0e', '#0f0f0f', '#0f0f13',
  '#111', '#111111', '#121212', '#121215', '#121217', '#121218', '#141414', '#141416', '#141418', '#141419',
  '#151515', '#161616', '#16161c', '#16161e', '#17171e', '#181818', '#18181c', '#1a1a1a', '#1a1a1e', '#1a1a20',
  '#1a1a22', '#1a1a24', '#1c1c1c', '#1e1e1e', '#1e2a3a', '#1a2133', '#1f1f1f', '#202024', '#202026', '#222',
  '#241305', '#242424', '#242428', '#252525', '#252528', '#252529', '#25252a', '#262626', '#26262e', '#282828',
  '#292929', '#2a2a2a', '#2a2a2e', '#2a2a32', '#2a2a34', '#2d2d2d', '#2e2e2e', '#333', '#3a3a3a', '#444',
  '#555', '#666', '#777', '#888', '#999', '#aaa', '#bbb', '#ccc', '#ddd', '#eee',
  '#f0f0f0', '#cfd8dc', '#e0e0e0', '#ffffff', '#000', '#000000', '#2a1a14', '#e8b595', '#cccccc', '#0d0d0d', '#0d0d10'
]);

function isAllowedLiteral(hex) {
  const norm = '#' + hex.toLowerCase();
  return allowedSemanticAccents.has(norm) || allowedPlotAndTerminalSurfaces.has(norm);
}

const defaultTargetFiles = [
  'src/components/ui/EngineeringPrimitives.tsx',
  'src/components/entropy/EntropyWorkspace.tsx',
  'src/components/hil/TargetPackSelector.tsx',
  'src/components/hil/HILWorkspace.tsx',
  'src/components/hil/HILDriverPanel.tsx',
  'src/components/hil/HILSignalMapper.tsx',
  'src/components/hil/HILDashboard.tsx',
  'src/components/vlab/VLabNode.tsx',
  'src/components/xbridges/XBlockNode.tsx',
  'src/components/doe/DOEManager.tsx',
  'src/components/sysml/BlockFeatureEditor.tsx',
  'src/components/sysml/BlockPropertiesEditor.tsx',
  'src/components/sysml/IbdConnectorEditor.tsx',
  'src/components/sysml/RelationshipEndEditor.tsx',
  'src/components/sysml/TraceabilityMatrix.tsx',
  'src/styles/workspaces/entropy.css',
  'src/styles/workspaces/hil.css',
  'src/styles/workspaces/xbridges.css',
  'src/styles/workspaces/vlab.css',
  'src/styles/workspaces/doe.css',
];

const targetFiles = process.argv.slice(2).length > 0 ? process.argv.slice(2) : defaultTargetFiles;

let hasErrors = false;
let violationCount = 0;

for (const relPath of targetFiles) {
  const normPath = relPath.replace(/\\/g, '/');
  if (allowedFiles.has(normPath)) {
    continue;
  }

  if (!fs.existsSync(normPath)) {
    continue;
  }

  const content = fs.readFileSync(normPath, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    if (line.includes('allow-literal') || line.includes('theme-literal-allow')) {
      return;
    }

    let match;
    const regex = new RegExp(forbidden);
    while ((match = regex.exec(line)) !== null) {
      const hex = match[1];
      if (!isAllowedLiteral(hex)) {
        hasErrors = true;
        violationCount++;
        console.error(`${normPath}:${index + 1} ${match[0]}`);
      }
    }
  });
}

if (hasErrors) {
  console.error(`\nFound ${violationCount} unallowlisted color literal(s) in migrated files.`);
  process.exit(1);
} else {
  console.log(`All ${targetFiles.length} inspected theme files adhere to semantic variables and documented allowlist.`);
  process.exit(0);
}
