module.exports = {
  packagerConfig: {
    asar: true,
    // ASAR integrity checking: embeds file hashes into the package for tamper detection
    asarIntegrity: true,
    icon: './icon.png',
    // Exclude sensitive runtime-generated files from the packaged ASAR
    // These should never ship with the distribution
    ignore: [
      /^\/\.env$/,
      /^\/\.env\..*/,
      /^\/scratch\//,
      /^\/hil_build\//,
      /^\/src\/security\/.*\.test\.cjs$/,
      /adia_vault\.bin$/,
      /audit\.log/,
    ],
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
