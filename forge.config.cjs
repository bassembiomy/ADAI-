module.exports = {
  packagerConfig: {
    asar: true,
    icon: './icon.png',
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
