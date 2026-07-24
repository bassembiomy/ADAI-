module.exports = {
  packagerConfig: {
    asar: true,
    // ASAR integrity checking: embeds file hashes into the package for tamper detection
    asarIntegrity: true,
    icon: './icon.png',
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
    // Code signing configuration placeholders for enterprise server builds
    ...(process.env.ADIA_SIGN_CERT ? {
      win32metadata: {
        CompanyName: 'Your Company Name',
        FileDescription: 'ADIA Engineering Suite',
        ProductName: 'ADIA',
      },
    } : {}),
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'adia',
        // setupIcon: './icon.png'
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
};
