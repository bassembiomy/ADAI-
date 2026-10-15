const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const localTmp = path.resolve(path.parse(__dirname).root, 'tmp');
if (!fs.existsSync(localTmp)) {
  fs.mkdirSync(localTmp, { recursive: true });
}
process.env.TEMP = localTmp;
process.env.TMP = localTmp;

// Redirect SquirrelTemp in LocalAppData to project tmp directory via NTFS junction
// to prevent disk-space exhaustion on C: when unpacking/repacking multi-gigabyte toolchain payloads.
// Opt-in only: the junction is machine-wide (lives outside this project) and dangles if the
// project tmp directory is later deleted, so it only runs on Windows when explicitly requested.
if (process.platform === 'win32' && process.env.ADIA_REDIRECT_SQUIRREL_TEMP === '1') {
  if (!process.env.LOCALAPPDATA) {
    console.warn('[Forge SquirrelTemp] LOCALAPPDATA is not set; skipping SquirrelTemp redirection.');
  } else {
    const squirrelTempDir = path.join(process.env.LOCALAPPDATA, 'SquirrelTemp');
    const redirectedSquirrelTemp = path.join(localTmp, 'SquirrelTemp');
    if (!fs.existsSync(redirectedSquirrelTemp)) {
      fs.mkdirSync(redirectedSquirrelTemp, { recursive: true });
    }
    if (!fs.existsSync(squirrelTempDir)) {
      try {
        execFileSync('cmd', ['/c', 'mklink', '/J', squirrelTempDir, redirectedSquirrelTemp], { stdio: 'ignore', windowsHide: true });
      } catch (e) {
        console.warn('[Forge SquirrelTemp] Failed to create junction:', e.message);
      }
    }
  }
}

module.exports = {
  packagerConfig: {
    executableName: 'ADIA',
    asar: true,
    // ASAR integrity checking: embeds file hashes into the package for tamper detection
    asarIntegrity: true,
    icon: path.resolve(__dirname, 'icon.ico'),
    extraResource: [
      path.resolve(__dirname, 'toolchains'),
      path.resolve(__dirname, 'target-packs'),
      path.resolve(__dirname, 'icon.ico'),
    ],
    fileAssociations: [
      {
        ext: 'adia',
        name: 'ADIA Project',
        description: 'ADIA Project File',
        icon: path.resolve(__dirname, 'icon.ico'),
        role: 'Editor',
      },
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
        '/scratch', '/hil_build', '/toolchains', '/target-packs', '/avr-gcc'
      ];
      if (excludePrefixes.some((p) => filePath.startsWith(p))) return true;
      if (filePath.endsWith('.ts') || filePath.endsWith('.md') || filePath.endsWith('.m') || filePath.endsWith('.slx') || filePath.endsWith('.txt') || filePath.endsWith('.cjs')) return true;
      if (filePath.startsWith('/.') && filePath !== '/.kilo') return true;
      return false;
    },
  },
  rebuildConfig: {},
  hooks: {
    prePackage: async () => {
      const toolchainsDir = path.resolve(__dirname, 'toolchains');
      if (fs.existsSync(toolchainsDir)) {
        const strayZips = fs.readdirSync(toolchainsDir).filter(f => f.endsWith('.zip') || f.endsWith('.tar.gz'));
        for (const f of strayZips) {
          try {
            fs.unlinkSync(path.join(toolchainsDir, f));
            console.log('[Forge PrePackage] Purged stray archive from toolchains: ' + f);
          } catch {}
        }
      }
    },
    postPackage: async (forgeConfig, options) => {
      if (!options || !Array.isArray(options.outputPaths)) return;
      const rceditPath = path.resolve(__dirname, 'node_modules/electron-winstaller/vendor/rcedit.exe');
      const iconPath = path.resolve(__dirname, 'icon.ico');
      for (const rawOutDir of options.outputPaths) {
        if (typeof rawOutDir !== 'string' || !rawOutDir.trim()) continue;
        const baseName = path.basename(rawOutDir);
        if (!baseName || baseName === '.' || baseName === '..') continue;
        const targetExe = path.join(rawOutDir, 'ADIA.exe');
        const packagedResources = path.join(rawOutDir, 'resources');
        execFileSync(process.execPath, [
          path.resolve(__dirname, 'scripts/verify_bundled_hil_toolchains.cjs'),
          '--resources-path', packagedResources,
        ], { stdio: 'inherit' });
        execFileSync(process.execPath, [
          path.resolve(__dirname, 'scripts/verify_hil_flash_tools.cjs'),
          '--resources-path', packagedResources,
        ], { stdio: 'inherit' });
        if (process.platform === 'win32' && fs.existsSync(rceditPath) && fs.existsSync(targetExe) && fs.existsSync(iconPath)) {
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
        noDelta: true,
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
