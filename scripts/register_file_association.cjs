'use strict';
const path = require('path');
const fs = require('fs');
const { registerAdiaAssociation } = require('../src/projectFiles/windowsFileAssociation.cjs');

function resolveTargetExecutable(options = {}) {
  if (options.execPath && options.isPackaged) {
    return options.execPath;
  }
  if (typeof options.targetPath === 'string' && options.targetPath.trim() !== '' && !options.targetPath.includes('\0') && fs.existsSync(options.targetPath)) {
    return path.resolve(options.targetPath);
  }

  // Check for built package binary
  const builtApp = path.resolve(__dirname, '../out/ADIA-win32-x64/ADIA.exe');
  if (fs.existsSync(builtApp)) {
    return builtApp;
  }

  // Check for electron binary in options
  if (options.electronPath && fs.existsSync(options.electronPath)) {
    return options.electronPath;
  }

  // Check for installed electron package binary
  try {
    const electron = require('electron');
    if (typeof electron === 'string' && fs.existsSync(electron)) {
      return electron;
    }
  } catch {}

  return options.execPath || process.execPath;
}

async function main() {
  if (process.platform !== 'win32') {
    console.log('File association registration is only applicable on Windows.');
    return;
  }

  const targetExe = resolveTargetExecutable({
    execPath: process.execPath,
    isPackaged: false,
  });

  const iconPath = path.resolve(__dirname, '../icon.ico');
  const hasIcon = fs.existsSync(iconPath);

  console.log(`Registering .adia file association for executable: ${targetExe}`);
  if (hasIcon) {
    console.log(`Using application icon at: ${iconPath}`);
  }

  await registerAdiaAssociation(targetExe, hasIcon ? { iconPath } : {});
  console.log('Successfully registered .adia file association in HKCU\\Software\\Classes.');

  // Refresh Windows Explorer icon cache
  try {
    const { execFileSync } = require('child_process');
    const psScript = 'try { $code = @\'\nusing System;\nusing System.Runtime.InteropServices;\npublic class Shell { [DllImport("shell32.dll")] public static extern void SHChangeNotify(int eventId, int flags, IntPtr item1, IntPtr item2); }\n\'@; Add-Type $code; [Shell]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero); } catch {}';
    execFileSync('powershell.exe', ['-NoProfile', '-Command', psScript], { stdio: 'ignore' });
  } catch {}
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Failed to register file association:', err);
    process.exit(1);
  });
}

module.exports = {
  resolveTargetExecutable,
  main,
};
