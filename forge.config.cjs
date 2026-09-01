const path = require('path');
const fs = require('fs');

module.exports = {
  packagerConfig: {
    executableName: 'ADIA',
    asar: true,
    // ASAR integrity checking: embeds file hashes into the package for tamper detection
    asarIntegrity: true,
    icon: path.resolve(__dirname, 'icon.ico'),
    extraResource: [
      path.resolve(__dirname, 'toolchains'),
    ],
    win32metadata: {
      CompanyName: 'ADIA Team',
      FileDescription: 'ADIA Engineering Suite',
      ProductName: 'ADIA',
      InternalName: 'ADIA',
    },
    // Anti-Extraction Rule: Exclude all raw source code, build scripts, docs, and scratch directories
    // Only compiled V8 bytecode (dist-electron/) and minified web application (dist/) are shipped in app.asar
    ignore: (filePath) => {
      if (!filePath) return false;
      // Always include dist, dist-electron, package.json, icon files, and node_modules
      if (
        filePath.startsWith('/dist') ||
        filePath.startsWith('/dist-electron') ||
        filePath.startsWith('/node_modules') ||
        filePath === '/package.json' ||
        filePath.endsWith('.png') ||
        filePath.endsWith('.ico')
      ) {
        return false;
      }
      // Exclude raw source code, scripts, docs, test specs, and scratch artifacts
      const excludePrefixes = [
        '/src', '/scripts', '/docs', '/.agents', '/.superpowers',
        '/scratch', '/hil_build', '/toolchains', '/avr-gcc'
      ];
      if (excludePrefixes.some((p) => filePath.startsWith(p))) return true;
      if (filePath.endsWith('.ts') || filePath.endsWith('.md') || filePath.endsWith('.m') || filePath.endsWith('.slx') || filePath.endsWith('.txt') || filePath.endsWith('.cjs')) return true;
      if (filePath.startsWith('/.') && filePath !== '/.kilo') return true;
      return false;
    },
  },
  rebuildConfig: {},
  hooks: {
    postPackage: async (forgeConfig, options) => {
      if (process.platform !== 'win32' || !options || !options.outputPaths) return;
      const rceditPath = path.resolve(__dirname, 'node_modules/electron-winstaller/vendor/rcedit.exe');
      const iconPath = path.resolve(__dirname, 'icon.ico');
      for (const outDir of options.outputPaths) {
        const targetExe = path.resolve(outDir, 'ADIA.exe');
        if (fs.existsSync(rceditPath) && fs.existsSync(targetExe) && fs.existsSync(iconPath)) {
          const { execFileSync } = require('child_process');
          try {
            execFileSync(rceditPath, [targetExe, '--set-icon', iconPath]);
            console.log(`[Forge Hook] Successfully injected custom icon into: ${targetExe}`);
          } catch (e) {
            console.warn('[Forge Hook] rcedit postPackage warning:', e.message);
          }
        }
      }
    },
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        name: 'adia',
        setupExe: 'ADIA Setup.exe',
        exe: 'ADIA.exe',
        setupIcon: path.resolve(__dirname, 'icon.ico'),
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32'],
    },
    {
      name: '@electron-forge/maker-deb',
      platforms: ['linux'],
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      platforms: ['linux'],
      config: {},
    },
  ],
};
