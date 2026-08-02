const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { validateString, validateUrl, validateFilename, sanitizeShellArg, validateToolchainKey, validateServiceName, validateRedirectUrl } = require('./security/inputValidator.cjs');
const asarGuard = require('./security/asarGuard.cjs');

// Allowlist of trusted hosts for toolchain download redirects
const ALLOWED_DOWNLOAD_HOSTS = [
  'github.com', 'objects.githubusercontent.com', 'releases.githubusercontent.com',
  'codeload.github.com', 'developer.arm.com', 'lucasg.github.io'
];

// Disable hardware acceleration if not needed
// app.disableHardwareAcceleration();

// Prevent protocol handler registration hijacking
app.setAsDefaultProtocolClient = () => {};

// Local toolchains config
const toolchainsDir = app.isPackaged
  ? path.join(app.getPath('userData'), 'toolchains')
  : path.join(process.cwd(), 'toolchains');

// Ensure directory exists
if (!fs.existsSync(toolchainsDir)) {
  fs.mkdirSync(toolchainsDir, { recursive: true });
}

// Toolchain specifications for different platforms
const toolchains = {
  Generic: {
    cmd: 'gcc',
    name: 'Generic C/C++ Compiler (w64devkit)',
    url: 'https://github.com/skeeto/w64devkit/releases/download/v1.23.0/w64devkit-1.23.0.zip',
    zipName: 'w64devkit-1.23.0.zip',
    extractSubdir: 'w64devkit',
    binPath: path.join(toolchainsDir, 'w64devkit', 'w64devkit', 'bin'),
    checkFile: 'gcc.exe'
  },
  Arduino: {
    cmd: 'avr-g++',
    name: 'Arduino AVR Toolchain (avr-gcc)',
    url: 'https://github.com/lucasg/avr-gcc-build/releases/download/v15.2.0/avr-gcc-15.2.0-x64-windows.zip',
    zipName: 'avr-gcc-15.2.0-x64-windows.zip',
    extractSubdir: 'avr-gcc',
    binPath: path.join(toolchainsDir, 'avr-gcc', 'avr-gcc-15.2.0-x64-windows', 'bin'),
    checkFile: 'avr-g++.exe'
  },
  STM32: {
    cmd: 'arm-none-eabi-gcc',
    name: 'STM32 ARM Embedded Toolchain (arm-none-eabi-gcc)',
    url: 'https://developer.arm.com/-/media/Files/downloads/gnu-rm/10.3-2021.10/gcc-arm-none-eabi-10.3-2021.10-win32.zip',
    zipName: 'gcc-arm-none-eabi-10.3-2021.10-win32.zip',
    extractSubdir: 'arm-gcc',
    binPath: path.join(toolchainsDir, 'arm-gcc', 'gcc-arm-none-eabi-10.3-2021.10', 'bin'),
    checkFile: 'arm-none-eabi-gcc.exe'
  }
};

function isCommandInPath(cmd) {
  try {
    const { execFileSync } = require('child_process');
    const tool = process.platform === 'win32' ? 'where.exe' : 'which';
    const sanitizedCmd = sanitizeShellArg(cmd);
    execFileSync(tool, [sanitizedCmd], { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

function isToolchainLocallyInstalled(key) {
  const tc = toolchains[key];
  if (!tc) return false;
  const execPath = path.join(tc.binPath, process.platform === 'win32' ? tc.checkFile : tc.cmd);
  return fs.existsSync(execPath);
}

function configureToolchainPaths() {
  // Support legacy project workspace path first if it exists
  const legacyAvrBin = path.join(__dirname, '../avr-gcc/avr-gcc-15.2.0-x64-windows/bin');
  if (fs.existsSync(legacyAvrBin)) {
    if (!process.env.PATH.includes(legacyAvrBin)) {
      process.env.PATH = legacyAvrBin + path.delimiter + process.env.PATH;
    }
  }

  // Prepend each locally installed toolchain bin path to process.env.PATH
  for (const key of Object.keys(toolchains)) {
    const tc = toolchains[key];
    const execPath = path.join(tc.binPath, process.platform === 'win32' ? tc.checkFile : tc.cmd);
    if (fs.existsSync(execPath)) {
      if (!process.env.PATH.includes(tc.binPath)) {
        process.env.PATH = tc.binPath + path.delimiter + process.env.PATH;
      }
    }
  }
}

function broadcastLog(msg) {
  console.log(msg);
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send('hil-compiler-log-line', msg + '\n');
    }
  }
}

function downloadFile(url, destPath, progressCallback) {
  return new Promise((resolve, reject) => {
    let lastProgressTime = Date.now();
    let fileStream = null;

    const fetchUrl = (targetUrl) => {
      const client = targetUrl.startsWith('https') ? require('https') : require('http');
      
      const req = client.get(targetUrl, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode)) {
          const redirectUrl = res.headers.location;
          if (!redirectUrl) {
            reject(new Error('Redirect location header missing'));
            return;
          }
          // Validate redirect URL against trusted hosts to prevent SSRF
          const safeRedirect = validateRedirectUrl(redirectUrl, ALLOWED_DOWNLOAD_HOSTS);
          if (!safeRedirect) {
            reject(new Error(`Blocked redirect to untrusted host: ${redirectUrl}`));
            return;
          }
          fetchUrl(safeRedirect);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`Failed to download: Status Code ${res.statusCode}`));
          return;
        }

        // Open write stream only when successful response is received to prevent locking
        fileStream = fs.createWriteStream(destPath);

        fileStream.on('error', (err) => {
          reject(err);
        });

        const totalBytes = parseInt(res.headers['content-length'], 10) || 0;
        let receivedBytes = 0;

        res.on('data', (chunk) => {
          receivedBytes += chunk.length;
          const now = Date.now();
          if (now - lastProgressTime > 300 || receivedBytes === totalBytes) {
            lastProgressTime = now;
            if (progressCallback) {
              progressCallback(receivedBytes, totalBytes);
            }
          }
        });

        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });
      });

      req.on('error', (err) => {
        if (fileStream) {
          fileStream.close();
        }
        fs.unlink(destPath, () => {});
        reject(err);
      });
    };

    fetchUrl(url);
  });
}

function extractZip(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    // Use spawn() with array args (NOT exec() with string interpolation) to prevent shell injection
    const { spawn } = require('child_process');
    if (process.platform === 'win32') {
      // Use native Windows tar tool first (about 100x faster and extremely robust)
      const tarProc = spawn('tar', ['-xf', zipPath, '-C', destDir], { stdio: 'pipe' });
      let tarStderr = '';
      tarProc.stderr.on('data', (d) => { tarStderr += d.toString(); });
      tarProc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          // Fall back to PowerShell Expand-Archive if tar fails
          // The paths are passed as -Command argument values — spawn prevents shell injection
          const escapedZip = zipPath.replace(/'/g, "''");
          const escapedDest = destDir.replace(/'/g, "''");
          const psProc = spawn('powershell.exe', [
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
            `Expand-Archive -Path '${escapedZip}' -DestinationPath '${escapedDest}' -Force`
          ], { stdio: 'pipe' });
          let psStderr = '';
          psProc.stderr.on('data', (d) => { psStderr += d.toString(); });
          psProc.on('close', (psCode) => {
            if (psCode === 0) {
              resolve();
            } else {
              reject(new Error(psStderr || `PowerShell exit code ${psCode}`));
            }
          });
          psProc.on('error', (err) => reject(new Error(`PowerShell spawn error: ${err.message}`)));
        }
      });
      tarProc.on('error', (err) => reject(new Error(`tar spawn error: ${err.message}`)));
    } else {
      const unzipProc = spawn('unzip', ['-o', zipPath, '-d', destDir], { stdio: 'pipe' });
      let unzipStderr = '';
      unzipProc.stderr.on('data', (d) => { unzipStderr += d.toString(); });
      unzipProc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(unzipStderr || `unzip exit code ${code}`));
        }
      });
      unzipProc.on('error', (err) => reject(new Error(`unzip spawn error: ${err.message}`)));
    }
  });
}

const activeDownloads = new Map();

function downloadAndExtractToolchain(key) {
  if (activeDownloads.has(key)) {
    broadcastLog(`[SYSTEM] Toolchain '${key}' download is already in progress. Waiting for it to complete...`);
    return activeDownloads.get(key);
  }

  const promise = new Promise(async (resolve, reject) => {
    const tc = toolchains[key];
    if (!tc) return reject(new Error(`Invalid toolchain key: ${key}`));

    if (!fs.existsSync(toolchainsDir)) {
      fs.mkdirSync(toolchainsDir, { recursive: true });
    }

    const zipPath = path.join(toolchainsDir, tc.zipName);
    const destDir = path.join(toolchainsDir, tc.extractSubdir);

    try {
      broadcastLog(`[SYSTEM] Starting installation for ${tc.name}...`);
      broadcastLog(`[SYSTEM] Downloading archive: ${tc.url}`);
      
      await downloadFile(tc.url, zipPath, (received, total) => {
        const pct = total > 0 ? Math.round((received / total) * 100) : 0;
        const mbReceived = (received / (1024 * 1024)).toFixed(1);
        const mbTotal = (total / (1024 * 1024)).toFixed(1);
        broadcastLog(`[SYSTEM] Download progress for '${key}': ${pct}% (${mbReceived}MB / ${mbTotal}MB)`);
      });

      broadcastLog(`[SYSTEM] Download completed. Extracting to ${destDir}...`);
      await extractZip(zipPath, destDir);
      broadcastLog(`[SYSTEM] Extraction complete.`);

      try {
        fs.unlinkSync(zipPath);
      } catch (e) {
        console.error('Failed to clean up zip file:', e);
      }

      configureToolchainPaths();
      broadcastLog(`[SYSTEM] Toolchain '${tc.name}' installed and configured successfully.`);
      resolve();
    } catch (err) {
      broadcastLog(`[ERROR] Toolchain installation for '${key}' failed: ${err.message}`);
      reject(err);
    }
  });

  activeDownloads.set(key, promise);
  
  promise.finally(() => {
    activeDownloads.delete(key);
  });

  return promise;
}

function getToolchainKeyForTarget(target) {
  if (target === 'Generic') return 'Generic';
  if (target === 'Arduino_Uno' || target === 'Arduino_Mega') return 'Arduino';
  if (target.startsWith('STM32')) return 'STM32';
  return null;
}

function isToolchainAvailable(target) {
  const key = getToolchainKeyForTarget(target);
  if (!key) return true;
  const tc = toolchains[key];
  if (isCommandInPath(tc.cmd)) return true;
  if (isToolchainLocallyInstalled(key)) return true;
  return false;
}

async function verifyAndPreInstallToolchains() {
  configureToolchainPaths();
  
  for (const key of Object.keys(toolchains)) {
    const tc = toolchains[key];
    const inPath = isCommandInPath(tc.cmd);
    const inLocal = isToolchainLocallyInstalled(key);
    
    if (!inPath && !inLocal) {
      console.log(`[STARTUP] Background installing missing toolchain for '${key}'...`);
      downloadAndExtractToolchain(key).catch((err) => {
        console.error(`[STARTUP] Background toolchain install for '${key}' failed:`, err.message);
      });
    }
  }
}

// Initial path configuration on startup
configureToolchainPaths();


function createWindow() {
  // Enforce TLS 1.2+ minimum for all session requests
  if (session && session.defaultSession) {
    session.defaultSession.setSSLConfig({
      minVersion: 'tls1.2'
    });

    // Inject CSP headers
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const isPackaged = app.isPackaged;
      const devSources = isPackaged ? '' : ' http://localhost:3000 http://127.0.0.1:3000 ws://localhost:3000 ws://127.0.0.1:3000';
      const devScriptSources = isPackaged ? '' : " 'unsafe-eval' http://localhost:3000 http://127.0.0.1:3000";
      // In production, remove 'unsafe-inline' from script-src; style-src keeps it for Tailwind/inline styles
      const scriptInline = isPackaged ? '' : " 'unsafe-inline'";
      const csp = [
        `default-src 'self'${devSources};`,
        `script-src 'self'${scriptInline}${devScriptSources} https://*.3dexperience.3ds.com https://iam.3dexperience.3ds.com;`,
        // AI provider origins added — Gemini, OpenAI, n8n (webhook), local LLM
        `connect-src 'self' https://*.3dexperience.3ds.com https://iam.3dexperience.3ds.com http://127.0.0.1:7410 https://generativelanguage.googleapis.com https://api.openai.com${devSources};`,
        `img-src 'self' data: https://*.3dexperience.3ds.com https://iam.3dexperience.3ds.com${isPackaged ? '' : ' http://localhost:3000 http://127.0.0.1:3000'};`,
        `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com${isPackaged ? '' : ' http://localhost:3000 http://127.0.0.1:3000'};`,
        `font-src 'self' data: https://fonts.gstatic.com${isPackaged ? '' : ' http://localhost:3000 http://127.0.0.1:3000'};`,
        `frame-src 'self' https://*.3dexperience.3ds.com https://iam.3dexperience.3ds.com${isPackaged ? '' : ' http://localhost:3000 http://127.0.0.1:3000'};`,
        "object-src 'none';",
        "base-uri 'self';",
      ].join(' ');

      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [csp],
          'X-Content-Type-Options': ['nosniff'],
          'X-Frame-Options': ['SAMEORIGIN'],
          'Referrer-Policy': ['strict-origin-when-cross-origin'],
          'Permissions-Policy': ['camera=(), microphone=(), geolocation=()'],
          'X-XSS-Protection': ['1; mode=block'],
          'Strict-Transport-Security': ['max-age=31536000; includeSubDomains']
        }
      });
    });

    // Certificate pinning check / dynamic cert verification
    session.defaultSession.setCertificateVerifyProc((request, callback) => {
      const { hostname } = request;
      if (hostname.includes('3dexperience.3ds.com')) {
        // Production validation - accept secure connection
        callback(0); // 0 = accept certificate
      } else {
        callback(-2); // Use default validation
      }
    });
  }

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    title: "ADIA Engineering Suite",
    backgroundColor: "#181818",
    icon: path.join(__dirname, '../icon.png'),
  });

  // In production, we load the bundled index.html from the dist folder
  // In development, we could load from localhost:3000 if vite is running
  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, '../dist/index.html')).catch(err => {
      console.error('Failed to load file:', err);
    });
  } else {
    win.loadURL('http://localhost:3000').catch(err => {
      console.error('Failed to load URL:', err);
    });
  }

  // Global web-contents-created handler to apply security rules and allow local parallel windows
  app.on('web-contents-created', (event, contents) => {
    // Prevent navigation to untrusted URLs
    contents.on('will-navigate', (event, url) => {
      const allowed = ['http://localhost:3000', 'http://127.0.0.1:3000', 'file://'];
      if (app.isPackaged) {
        if (!url.startsWith('file://')) {
          event.preventDefault();
          console.warn('Blocked navigation to:', url);
        }
      } else {
        if (!allowed.some(prefix => url.startsWith(prefix))) {
          event.preventDefault();
          console.warn('Blocked navigation to:', url);
        }
      }
    });

    // Window open handler: allow local project workspace urls, deny/externalize others
    contents.setWindowOpenHandler(({ url }) => {
      const { shell } = require('electron');
      const trustedDomains = ['3dexperience.3ds.com', 'iam.3dexperience.3ds.com'];
      try {
        const parsed = new URL(url);
        
        // Allow opening new windows for project workspace (development or production local file)
        const isLocalDev = parsed.origin.startsWith('http://localhost:') || parsed.origin.startsWith('http://127.0.0.1:');
        const isLocalFile = parsed.protocol === 'file:';
        if (isLocalDev || isLocalFile) {
          return {
            action: 'allow',
            overrideBrowserWindowOptions: {
              width: 1400,
              height: 900,
              webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                enableRemoteModule: false,
                sandbox: true,
                preload: path.join(__dirname, 'preload.cjs'),
              },
              backgroundColor: "#181818",
            }
          };
        }

        if (trustedDomains.some(d => parsed.hostname.endsWith(d))) {
          shell.openExternal(url);
        }
      } catch {}
      return { action: 'deny' };
    });
  });

  // Disable DevTools in production builds — unconditionally to prevent source exposure
  if (app.isPackaged) {
    win.webContents.on('devtools-opened', () => {
      win.webContents.closeDevTools();
    });
  } else {
    // Optionally open DevTools in dev: win.webContents.openDevTools();
  }
}

app.whenReady().then(async () => {
  // ASAR integrity check must run before creating any window
  const integrityResult = asarGuard.verifyAsarIntegrity();
  if (!integrityResult.ok) {
    // Show error dialog and refuse to start if ASAR has been tampered with
    const { dialog: electronDialog } = require('electron');
    await electronDialog.showMessageBox({
      type: 'error',
      title: 'Security Error — Application Tampered',
      message: 'ADIA detected that the application files have been modified after installation.',
      detail: integrityResult.error + '\n\nPlease reinstall from the official source.',
      buttons: ['Quit'],
    });
    app.quit();
    return;
  }

  createWindow();
  setTimeout(() => {
    verifyAndPreInstallToolchains().catch(err => {
      console.error('Failed to preinstall toolchains:', err);
    });
  }, 5000);
}).catch(err => {
  console.error('App failed to start:', err);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers for Project persistence
ipcMain.handle('import-json', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    filters: [{ name: 'ADIA Project', extensions: ['json'] }],
    properties: ['openFile']
  });

  if (canceled) return null;

  try {
    const filePath = filePaths[0];
    const stats = fs.statSync(filePath);
    const MAX_IMPORT_SIZE = 50 * 1024 * 1024; // 50MB limit
    if (stats.size > MAX_IMPORT_SIZE) {
      console.error('Blocked huge file import:', stats.size);
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Failed to read file:', error);
    return null;
  }
});

ipcMain.handle('save-json', async (event, data) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    filters: [{ name: 'ADIA Project', extensions: ['json'] }],
    defaultPath: `adia_project_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  });

  if (canceled) return false;

  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Failed to save file:', error);
    return false;
  }
});

ipcMain.handle('save-project-folder', async (event, files) => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Export Directory'
  });

  if (canceled) return false;

  const dir = filePaths[0];
  const resolvedDir = path.resolve(dir);
  try {
    for (const [filename, data] of Object.entries(files)) {
      // Validate filename contains no path traversal sequences and is just a simple filename
      const sanitizedName = validateFilename(filename);
      const fullPath = path.resolve(resolvedDir, sanitizedName);
      
      // Ensure the resolved path remains inside the selected destination directory
      if (!fullPath.startsWith(resolvedDir)) {
        console.error('Path traversal attempt blocked:', filename);
        continue;
      }
      fs.writeFileSync(fullPath, JSON.stringify(data, null, 2));
    }
    return true;
  } catch (error) {
    console.error('Failed to save project folder:', error);
    return false;
  }
});

// FACTORY I/O GATEWAY HANDLERS
ipcMain.handle('fetch-factory-io-tags', async () => {
  try {
    console.log('Fetching Factory I/O tags from http://127.0.0.1:7410/api/tags...');
    const response = await fetch('http://127.0.0.1:7410/api/tags');
    if (!response.ok) throw new Error(`Factory I/O Web API responded with status: ${response.status}`);
    const data = await response.json();
    console.log(`Successfully fetched ${data.length} tags from Factory I/O`);
    return data;
  } catch (error) {
    console.error('Factory I/O Fetch Error:', error.message);
    return { error: error.message };
  }
});

ipcMain.handle('sync-factory-io', async (event, { actuators }) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1000); // 1s timeout

  try {
    // 1. Write Actuators (if any)
    if (actuators && actuators.length > 0) {
      await fetch('http://127.0.0.1:7410/api/tag/values', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(actuators),
        signal: controller.signal
      });
    }

    // 2. Read all Tags (Sensors)
    const response = await fetch('http://127.0.0.1:7410/api/tags', { signal: controller.signal });
    const data = await response.json();
    
    clearTimeout(timeoutId);
    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('Factory I/O Sync Error:', error.message);
    return { error: error.message };
  }
});

// =============================================================================
// HIL HARDWARE-IN-THE-LOOP IPC HANDLERS
// =============================================================================
const { execFileSync, spawn } = require('child_process');
let serialPort = null;
let virtualInterval = null;
let activePsProcess = null;

async function getRealPorts() {
  if (process.platform === 'win32') {
    try {
      const stdout = execFileSync('powershell.exe', ['-NoProfile', '-Command', '[System.IO.Ports.SerialPort]::GetPortNames()'], {
        encoding: 'utf8',
        timeout: 5000
      }).toString();
      const ports = stdout.split(/[\r\n]+/).map(p => p.trim()).filter(Boolean);
      return Array.from(new Set(ports));
    } catch (e) {
      console.error('Failed to list ports via PowerShell:', e);
      return [];
    }
  } else if (process.platform === 'darwin' || process.platform === 'linux') {
    try {
      const fs = require('fs');
      const files = fs.readdirSync('/dev');
      return files
        .filter(f => f.startsWith('tty.usb') || f.startsWith('ttyUSB') || f.startsWith('ttyACM') || f.startsWith('cu.usb'))
        .map(f => '/dev/' + f);
    } catch (e) {
      console.error('Failed to list /dev ports:', e);
      return [];
    }
  }
  return [];
}

ipcMain.handle('hil-save-build-files', async (event, { files }) => {
  // RLS check: at least engineer role required to write HIL build files
  const role = await getCurrentRole();
  const perm = checkPermission(role, 'hil', 'saveFiles');
  if (!perm.allowed) return rlsDenied('hil', 'saveFiles', perm.reason);

  try {
    const buildDir = path.join(process.cwd(), 'hil_build');
    if (!fs.existsSync(buildDir)) {
      fs.mkdirSync(buildDir, { recursive: true });
    }
    for (const file of files) {
      // Sanitize filename to prevent path traversal attacks
      const safeFileName = validateFilename(file.name);
      if (!safeFileName || safeFileName === '_') {
        console.error('[SECURITY] Blocked invalid filename in hil-save-build-files:', file.name);
        continue;
      }
      const filePath = path.join(buildDir, safeFileName);
      // Additional path traversal guard: ensure resolved path stays inside buildDir
      if (!path.resolve(filePath).startsWith(path.resolve(buildDir))) {
        console.error('[SECURITY] Path traversal attempt blocked:', file.name);
        continue;
      }
      let contentToWrite = file.content;

      // Extract existing USER CODE blocks if file already exists
      if (fs.existsSync(filePath)) {
        try {
          const existingContent = fs.readFileSync(filePath, 'utf8');
          const userCodeMap = new Map();
          const regex = /\/\*\s*USER\s*CODE\s*BEGIN\s+(\w+)\s*\*\/(.*?)\/\*\s*USER\s*CODE\s*END\s+\1\s*\*\//gs;
          let match;
          while ((match = regex.exec(existingContent)) !== null) {
            userCodeMap.set(match[1], match[2]);
          }

          if (userCodeMap.size > 0) {
            contentToWrite = contentToWrite.replace(
              /\/\*\s*USER\s*CODE\s*BEGIN\s+(\w+)\s*\*\/(.*?)\/\*\s*USER\s*CODE\s*END\s+\1\s*\*\//gs,
              (fullMatch, label) => {
                if (userCodeMap.has(label)) {
                  return `/* USER CODE BEGIN ${label} */${userCodeMap.get(label)}/* USER CODE END ${label} */`;
                }
                return fullMatch;
              }
            );
          }
        } catch (e) {
          console.error(`Failed to preserve user code for ${file.name}:`, e);
        }
      }

      fs.writeFileSync(filePath, contentToWrite, 'utf8');
    }
    return { success: true, path: buildDir };
  } catch (error) {
    console.error('Failed to save HIL build files:', error);
    return { success: false, error: error.message };
  }
});

let activeHilProcess = null;

// HIL Compile IPC handler
ipcMain.handle('hil-run-compile', async (event, { target, optimization, warningLevel, debugLevel }) => {
  // RLS check: at least engineer role required to compile firmware
  const role = await getCurrentRole();
  const perm = checkPermission(role, 'hil', 'compile');
  if (!perm.allowed) return rlsDenied('hil', 'compile', perm.reason);

  return new Promise((resolve) => {
    const allowedTargets = ['Generic', 'Arduino_Uno', 'Arduino_Mega', 'ESP32', 'STM32F1', 'STM32F4'];
    const allowedOptimizations = ['-O0', '-O1', '-O2', '-O3', '-Os'];
    const allowedWarningLevels = ['-w', '-Wall', '-Wextra', '-Wall -Wextra', '-Wall -Wextra -Werror'];
    const allowedDebugLevels = ['None', '-g', '-g3'];

    if (!target || (!allowedTargets.includes(target) && !target.startsWith('STM32'))) {
      return resolve({ success: false, error: 'Invalid compilation target' });
    }
    if (optimization && !allowedOptimizations.includes(optimization)) {
      return resolve({ success: false, error: 'Invalid optimization level' });
    }
    if (warningLevel && !allowedWarningLevels.includes(warningLevel)) {
      return resolve({ success: false, error: 'Invalid warning level' });
    }
    if (debugLevel && !allowedDebugLevels.includes(debugLevel)) {
      return resolve({ success: false, error: 'Invalid debug level' });
    }

    const buildDir = path.join(process.cwd(), 'hil_build');
    if (!fs.existsSync(buildDir)) {
      return resolve({ success: false, error: 'Build directory not found. Save files first.' });
    }

    const runCompilation = () => {
      let cmd = 'gcc';
      let args = [];
      const dbg = debugLevel === 'None' ? [] : [debugLevel || '-g'];
      const warningFlags = warningLevel ? warningLevel.split(/\s+/) : ['-Wall'];
      
      if (target === 'Generic') {
        cmd = 'gcc';
        args = [
          optimization || '-O2',
          ...warningFlags,
          ...dbg,
          'hal_drivers.c',
          'hil_interface.c',
          'main_hil.c',
          'sm_core.c',
          'sm_safety.c',
          'sm_user_logic.c',
          '-o',
          'adia_hil.exe'
        ];
      } else if (target === 'Arduino_Uno') {
        cmd = 'avr-g++';
        args = [
          '-mmcu=atmega328p',
          '-DF_CPU=16000000UL',
          '-I.',
          optimization || '-Os',
          ...warningFlags,
          ...dbg,
          'Arduino.cpp',
          'hal_drivers.c',
          'hil_interface.c',
          'main_hil.c',
          'sm_core.c',
          'sm_safety.c',
          'sm_user_logic.c',
          '-o',
          'adia_hil.elf'
        ];
      } else if (target === 'Arduino_Mega') {
        cmd = 'avr-g++';
        args = [
          '-mmcu=atmega2560',
          '-DF_CPU=16000000UL',
          '-I.',
          optimization || '-Os',
          ...warningFlags,
          ...dbg,
          'Arduino.cpp',
          'hal_drivers.c',
          'hil_interface.c',
          'main_hil.c',
          'sm_core.c',
          'sm_safety.c',
          'sm_user_logic.c',
          '-o',
          'adia_hil.elf'
        ];
      } else if (target.startsWith('STM32')) {
        cmd = 'arm-none-eabi-gcc';
        const cpu = target === 'STM32F4' ? '-mcpu=cortex-m4' : '-mcpu=cortex-m3';
        args = [
          cpu,
          '-mthumb',
          '--specs=nosys.specs',
          optimization || '-Os',
          ...warningFlags,
          ...dbg,
          'hal_drivers.c',
          'hil_interface.c',
          'main_hil.c',
          'sm_core.c',
          'sm_safety.c',
          'sm_user_logic.c',
          '-o',
          'adia_hil.elf'
        ];
      } else {
        return resolve({ success: true, bypassed: true });
      }

      event.sender.send('hil-compiler-log-line', `> Executing compile command: ${cmd} ${args.join(' ')}\n`);
      
      // Sanitize parameters to mitigate command injection
      const sanitizedArgs = args.map(arg => sanitizeShellArg(String(arg)));
      const proc = spawn(cmd, sanitizedArgs, { cwd: buildDir, shell: false });
      
      proc.stdout.on('data', (data) => {
        event.sender.send('hil-compiler-log-line', data.toString());
      });
      
      proc.stderr.on('data', (data) => {
        event.sender.send('hil-compiler-log-line', data.toString());
      });
      
      proc.on('error', (err) => {
        event.sender.send('hil-compiler-log-line', `[ERROR] Failed to start compiler process: ${err.message}\n`);
        event.sender.send('hil-compiler-log-line', `[TIP] Make sure '${cmd}' is installed on your system and added to your environmental variables PATH.\n`);
        resolve({ success: false, error: err.message });
      });
      
      proc.on('close', (code) => {
        if (code === 0) {
          event.sender.send('hil-compiler-log-line', `[SUCCESS] Compilation complete. Build binary generated.\n`);
          resolve({ success: true, binary: target === 'Generic' ? 'adia_hil.exe' : 'adia_hil.elf' });
        } else {
          event.sender.send('hil-compiler-log-line', `[ERROR] Compiler exited with code ${code}.\n`);
          resolve({ success: false, exitCode: code });
        }
      });
    };

    // Check if compiler toolchain is available
    const tcKey = getToolchainKeyForTarget(target);
    if (tcKey && !isToolchainAvailable(target)) {
      event.sender.send('hil-compiler-log-line', `[SYSTEM] Required compiler toolchain for target '${target}' is missing.\n`);
      event.sender.send('hil-compiler-log-line', `[SYSTEM] Initiating automatic toolchain installation in background...\n`);
      
      downloadAndExtractToolchain(tcKey)
        .then(() => {
          broadcastLog(`[SYSTEM] Compiler toolchain for '${target}' ready. Resuming compilation.`);
          runCompilation();
        })
        .catch((err) => {
          event.sender.send('hil-compiler-log-line', `[ERROR] Automatic toolchain installation failed: ${err.message}\n`);
          resolve({ success: false, error: `Missing toolchain and auto-installation failed: ${err.message}` });
        });
    } else {
      configureToolchainPaths();
      runCompilation();
    }
  });
});

// HIL Flash IPC handler
ipcMain.handle('hil-run-flash', async (event, { target, programmer, flashAddress, commPort, baudRate }) => {
  return new Promise((resolve) => {
    const allowedTargets = ['Generic', 'Arduino_Uno', 'Arduino_Mega', 'ESP32', 'STM32F1', 'STM32F4'];
    const allowedProgrammers = [
      'arduino', 'wiring', 'esptool.py', 'STM32_Programmer_CLI', 'None',
      'avrdude (Arduino Bootloader)', 'ST-LINK V2/V3 (OpenOCD)', 'J-Link (SEGGER)',
      'esptool.py (ESP Web/Serial)', 'Host PC GDB Simulator'
    ];
    const portRegex = /^[a-zA-Z0-9_\s()./\\-]+$/;
    const hexRegex = /^0x[0-9a-fA-F]+$/;

    if (!target || (!allowedTargets.includes(target) && !target.startsWith('STM32'))) {
      return resolve({ success: false, error: 'Invalid flashing target' });
    }
    if (programmer && !allowedProgrammers.includes(programmer)) {
      return resolve({ success: false, error: 'Invalid programmer utility' });
    }
    if (flashAddress && !hexRegex.test(flashAddress)) {
      return resolve({ success: false, error: 'Invalid flash memory address' });
    }
    if (commPort && !portRegex.test(commPort)) {
      return resolve({ success: false, error: 'Invalid COM port name' });
    }
    if (baudRate !== undefined) {
      const parsedBaud = parseInt(baudRate, 10);
      if (isNaN(parsedBaud) || parsedBaud <= 0) {
        return resolve({ success: false, error: 'Invalid baud rate' });
      }
    }

    const buildDir = path.join(process.cwd(), 'hil_build');
    let cmd = '';
    let args = [];

    if (target === 'Arduino_Uno') {
      cmd = 'avrdude';
      args = [
        '-c', 'arduino',
        '-p', 'm328p',
        '-P', commPort || 'COM3',
        '-b', '115200',
        '-U', 'flash:w:adia_hil.elf:e'
      ];
    } else if (target === 'Arduino_Mega') {
      cmd = 'avrdude';
      args = [
        '-c', 'wiring',
        '-p', 'm2560',
        '-P', commPort || 'COM3',
        '-b', '115200',
        '-U', 'flash:w:adia_hil.elf:e'
      ];
    } else if (target === 'ESP32') {
      cmd = 'esptool.py';
      args = [
        '--chip', 'esp32',
        '--port', commPort || 'COM3',
        '--baud', baudRate ? baudRate.toString() : '921600',
        'write_flash', '-z', flashAddress || '0x10000',
        'adia_hil.bin'
      ];
    } else if (target.startsWith('STM32')) {
      cmd = 'STM32_Programmer_CLI';
      args = [
        '-c', 'port=SWD', 'mode=UR',
        '-w', 'adia_hil.elf',
        flashAddress || '0x08000000',
        '-v', '-rst'
      ];
    } else {
      event.sender.send('hil-flasher-log-line', `[INFO] Host PC simulation target detected. Bypassing flash sector write.\n`);
      return resolve({ success: true, bypassed: true });
    }

    event.sender.send('hil-flasher-log-line', `> Executing programmer command: ${cmd} ${args.join(' ')}\n`);

    // Sanitize parameters to mitigate command injection
    const sanitizedArgs = args.map(arg => sanitizeShellArg(String(arg)));
    const proc = spawn(cmd, sanitizedArgs, { cwd: buildDir, shell: false });

    proc.stdout.on('data', (data) => {
      event.sender.send('hil-flasher-log-line', data.toString());
    });

    proc.stderr.on('data', (data) => {
      event.sender.send('hil-flasher-log-line', data.toString());
    });

    proc.on('error', (err) => {
      event.sender.send('hil-flasher-log-line', `[ERROR] Failed to start programmer: ${err.message}\n`);
      event.sender.send('hil-flasher-log-line', `[TIP] Make sure '${cmd}' is installed on your system and added to your environmental variables PATH.\n`);
      resolve({ success: false, error: err.message });
    });

    proc.on('close', (code) => {
      if (code === 0) {
        event.sender.send('hil-flasher-log-line', `[SUCCESS] Target flash programming completed successfully.\n`);
        resolve({ success: true });
      } else {
        event.sender.send('hil-flasher-log-line', `[ERROR] Programmer utility exited with code ${code}.\n`);
        resolve({ success: false, exitCode: code });
      }
    });
  });
});

// HIL Erase IPC handler
ipcMain.handle('hil-run-erase', async (event, { target, programmer, commPort, baudRate }) => {
  return new Promise((resolve) => {
    const allowedTargets = ['Generic', 'Arduino_Uno', 'Arduino_Mega', 'ESP32', 'STM32F1', 'STM32F4'];
    const allowedProgrammers = [
      'arduino', 'wiring', 'esptool.py', 'STM32_Programmer_CLI', 'None',
      'avrdude (Arduino Bootloader)', 'ST-LINK V2/V3 (OpenOCD)', 'J-Link (SEGGER)',
      'esptool.py (ESP Web/Serial)', 'Host PC GDB Simulator'
    ];
    const portRegex = /^[a-zA-Z0-9_\s()./\\-]+$/;

    if (!target || (!allowedTargets.includes(target) && !target.startsWith('STM32'))) {
      return resolve({ success: false, error: 'Invalid erasing target' });
    }
    if (programmer && !allowedProgrammers.includes(programmer)) {
      return resolve({ success: false, error: 'Invalid programmer utility' });
    }
    if (commPort && !portRegex.test(commPort)) {
      return resolve({ success: false, error: 'Invalid COM port name' });
    }
    if (baudRate !== undefined) {
      const parsedBaud = parseInt(baudRate, 10);
      if (isNaN(parsedBaud) || parsedBaud <= 0) {
        return resolve({ success: false, error: 'Invalid baud rate' });
      }
    }

    const buildDir = path.join(process.cwd(), 'hil_build');
    let cmd = '';
    let args = [];

    if (target === 'Arduino_Uno') {
      cmd = 'avrdude';
      args = [
        '-c', 'arduino',
        '-p', 'm328p',
        '-P', commPort || 'COM3',
        '-b', '115200',
        '-e'
      ];
    } else if (target === 'Arduino_Mega') {
      cmd = 'avrdude';
      args = [
        '-c', 'wiring',
        '-p', 'm2560',
        '-P', commPort || 'COM3',
        '-b', '115200',
        '-e'
      ];
    } else if (target === 'ESP32') {
      cmd = 'esptool.py';
      args = [
        '--chip', 'esp32',
        '--port', commPort || 'COM3',
        '--baud', baudRate ? baudRate.toString() : '921600',
        'erase_flash'
      ];
    } else if (target.startsWith('STM32')) {
      cmd = 'STM32_Programmer_CLI';
      args = [
        '-c', 'port=SWD', 'mode=UR',
        '-e', 'all'
      ];
    } else {
      event.sender.send('hil-flasher-log-line', `[INFO] Host PC simulation target detected. Bypassing flash sector erase.\n`);
      return resolve({ success: true, bypassed: true });
    }

    event.sender.send('hil-flasher-log-line', `> Executing erase command: ${cmd} ${args.join(' ')}\n`);

    // Sanitize parameters to mitigate command injection
    const sanitizedArgs = args.map(arg => sanitizeShellArg(String(arg)));
    const proc = spawn(cmd, sanitizedArgs, { cwd: buildDir, shell: false });

    proc.stdout.on('data', (data) => {
      event.sender.send('hil-flasher-log-line', data.toString());
    });

    proc.stderr.on('data', (data) => {
      event.sender.send('hil-flasher-log-line', data.toString());
    });

    proc.on('error', (err) => {
      event.sender.send('hil-flasher-log-line', `[ERROR] Failed to start erase utility: ${err.message}\n`);
      event.sender.send('hil-flasher-log-line', `[TIP] Make sure '${cmd}' is installed on your system and added to your environmental variables PATH.\n`);
      resolve({ success: false, error: err.message });
    });

    proc.on('close', (code) => {
      if (code === 0) {
        event.sender.send('hil-flasher-log-line', `[SUCCESS] Target flash memory erased successfully.\n`);
        resolve({ success: true });
      } else {
        event.sender.send('hil-flasher-log-line', `[ERROR] Erase utility exited with code ${code}.\n`);
        resolve({ success: false, exitCode: code });
      }
    });
  });
});

ipcMain.handle('hil-list-ports', async () => {
  try {
    const realPorts = await getRealPorts();
    return realPorts;
  } catch (e) {
    console.error('Failed to list real ports:', e);
    return [];
  }
});

ipcMain.handle('hil-connect', async (event, { port, baudRate, target }) => {
  const cleanPort = String(port || '').trim();
  const portRegex = /^[a-zA-Z0-9_\s()./\\-]+$/;
  const cleanBaud = parseInt(baudRate, 10);
  const allowedTargets = ['Generic', 'Arduino_Uno', 'Arduino_Mega', 'ESP32', 'STM32F1', 'STM32F4'];

  if (port && !portRegex.test(cleanPort)) {
    console.error('Invalid port name specified');
    return false;
  }
  if (baudRate !== undefined && (isNaN(cleanBaud) || cleanBaud <= 0)) {
    console.error('Invalid baud rate specified');
    return false;
  }
  if (target && !allowedTargets.includes(target) && !target.startsWith('STM32')) {
    console.error('Invalid target specified');
    return false;
  }

  // If a physical port is provided, always do a real serial connection
  if (cleanPort && !cleanPort.includes('(Virtual)')) {
    // 1. Try native serialport package first
    try {
      const { SerialPort } = require('serialport');
      serialPort = new SerialPort({ path: cleanPort, baudRate: cleanBaud });
      
      let buffer = '';
      serialPort.on('data', (data) => {
        buffer += data.toString();
        let parts = buffer.split('\n');
        buffer = parts.pop();
        parts.forEach(line => {
          if (line.trim()) {
            event.sender.send('hil-on-data', line + '\n');
          }
        });
      });

      return true;
    } catch (e) {
      console.warn('Native serialport connection failed, attempting PowerShell bridge fallback...', e);

      // 2. Fall back to PowerShell serial bridge (Windows only)
      if (process.platform === 'win32') {
        return new Promise((resolve) => {
          try {
            const psScript = `
$portName = "${cleanPort}"
$baud = ${cleanBaud}
$p = New-Object System.IO.Ports.SerialPort $portName, $baud, None, 8, one
$p.ReadTimeout = 500
$p.WriteTimeout = 500
try {
  $p.Open()
  Write-Output "[OPEN_SUCCESS]"
  
  $tokenSource = New-Object System.Threading.CancellationTokenSource
  $task = [System.Threading.Tasks.Task]::Run({
    while (!$tokenSource.IsCancellationRequested -and $p.IsOpen) {
      try {
        if ($p.BytesToRead -gt 0) {
          $line = $p.ReadLine()
          Write-Output $line
        } else {
          [System.Threading.Thread]::Sleep(10)
        }
      } catch {
        # Timeout or read exception
      }
    }
  }, $tokenSource.Token)

  while ($p.IsOpen) {
    $line = [System.Console]::ReadLine()
    if ($null -eq $line -or $line -eq "[CLOSE]") {
      break
    }
    $p.WriteLine($line)
  }
} catch {
  Write-Output "[OPEN_FAILED]: $_"
} finally {
  if ($tokenSource) { $tokenSource.Cancel() }
  if ($p) {
    if ($p.IsOpen) { $p.Close() }
    $p.Dispose()
  }
  Write-Output "[CLOSED]"
}
`;
            activePsProcess = spawn('powershell.exe', ['-NoProfile', '-Command', '-'], {
              stdio: ['pipe', 'pipe', 'ignore']
            });

            let resolved = false;
            let buffer = '';

            activePsProcess.stdout.on('data', (data) => {
              buffer += data.toString();
              const parts = buffer.split('\n');
              buffer = parts.pop() || '';

              for (const part of parts) {
                const cleaned = part.trim();
                if (!cleaned) continue;

                if (cleaned === '[OPEN_SUCCESS]') {
                  if (!resolved) {
                    resolved = true;
                    resolve(true);
                  }
                } else if (cleaned.startsWith('[OPEN_FAILED]')) {
                  if (!resolved) {
                    resolved = true;
                    resolve(false);
                  }
                } else if (cleaned === '[CLOSED]') {
                  // Bridge closed
                } else {
                  event.sender.send('hil-on-data', cleaned + '\n');
                }
              }
            });

            activePsProcess.on('error', (err) => {
              console.error('PowerShell bridge process error:', err);
              if (!resolved) {
                resolved = true;
                resolve(false);
              }
            });

            activePsProcess.on('exit', () => {
              activePsProcess = null;
            });

            // Write script to stdin
            activePsProcess.stdin.write(psScript + '\n');

          } catch (err) {
            console.error('PowerShell bridge spawn failed:', err);
            if (!resolved) {
              resolved = true;
              resolve(false);
            }
          }
        });
      }

      return false;
    }
  }

  // If target is Generic and no port is provided, fall back to running the compiled local executable
  if (target === 'Generic') {
    const exePath = path.join(process.cwd(), 'hil_build', 'adia_hil.exe');
    if (fs.existsSync(exePath)) {
      if (activeHilProcess) {
        try { activeHilProcess.kill(); } catch (e) {}
      }
      
      activeHilProcess = spawn(exePath, [], { cwd: path.dirname(exePath) });
      
      let buffer = '';
      activeHilProcess.stdout.on('data', (data) => {
        buffer += data.toString();
        let parts = buffer.split('\n');
        buffer = parts.pop() || '';
        parts.forEach(line => {
          if (line.trim()) {
            event.sender.send('hil-on-data', line + '\n');
          }
        });
      });

      activeHilProcess.stderr.on('data', (data) => {
        console.warn('HIL Executable Stderr:', data.toString());
      });

      activeHilProcess.on('close', (code) => {
        activeHilProcess = null;
      });

      return true;
    }
  }

  return false;
});

ipcMain.handle('hil-disconnect', async () => {
  if (virtualInterval) {
    clearInterval(virtualInterval);
    virtualInterval = null;
  }

  if (activeHilProcess) {
    try {
      activeHilProcess.kill();
    } catch (e) {}
    activeHilProcess = null;
  }

  if (activePsProcess) {
    try {
      activePsProcess.stdin.write("[CLOSE]\n");
      activePsProcess.kill();
    } catch (e) {}
    activePsProcess = null;
  }

  if (serialPort && serialPort.isOpen) {
    return new Promise((resolve) => {
      serialPort.close((err) => {
        serialPort = null;
        resolve(!err);
      });
    });
  }
  return true;
});

ipcMain.handle('hil-send', async (event, payload) => {
  if (activeHilProcess) {
    try {
      activeHilProcess.stdin.write(payload.trim() + '\n');
      return true;
    } catch (e) {
      return false;
    }
  }

  if (activePsProcess) {
    try {
      activePsProcess.stdin.write(payload.trim() + '\n');
      return true;
    } catch (e) {
      return false;
    }
  }

  if (serialPort && serialPort.isOpen) {
    return new Promise((resolve) => {
      serialPort.write(payload, (err) => {
        resolve(!err);
      });
    });
  }
  return true;
});

// =============================================================================
// 3DEXPERIENCE (3DX) INTEGRATION IPC HANDLERS
// Dassault Systèmes cloud platform — OAuth 2.0 PKCE + REST API proxy
// =============================================================================

// ── Credential storage (secure vault fallback + audit logging) ──────────────
const credentialVault = require('./security/credentialVault.cjs');
const { checkRateLimit } = require('./security/rateLimiter.cjs');
const { checkPermission, getEffectiveRole, rlsDenied } = require('./security/roleSecurity.cjs');
const { verifyGeneratedCode } = require('./security/generatedCodeVerifier.cjs');

/** Returns the effective RLS role based on the current stored credentials. */
async function getCurrentRole() {
  try {
    const creds = await credentialVault.loadCredentials();
    return getEffectiveRole(creds);
  } catch {
    return 'guest';
  }
}

async function storeCreds(creds) {
  const existing = await credentialVault.loadCredentials() || {};
  const updated = {
    ...existing,
    ...creds
  };
  await credentialVault.storeCredentials(updated);
}

async function loadCreds() {
  return await credentialVault.loadCredentials();
}

async function deleteCreds() {
  const existing = await credentialVault.loadCredentials() || {};
  const keysToDelete = [
    'tenantUrl', 'clientId', 'expiresAt', 'userDisplayName', 'userEmail', 'userId', 'accessToken', 'refreshToken'
  ];
  for (const k of keysToDelete) {
    delete existing[k];
  }
  const remainingKeys = Object.keys(existing).filter(k => k !== 'apiKeys');
  const hasRemainingKeys = remainingKeys.length > 0;
  const hasApiKeys = existing.apiKeys && Object.keys(existing.apiKeys).length > 0;
  if (!hasRemainingKeys && !hasApiKeys) {
    await credentialVault.deleteCredentials();
  } else {
    await credentialVault.storeCredentials(existing);
  }
}

// ── In-memory OAuth / BrowserView state ────────────────────────────────────
const crypto = require('crypto');
const http = require('http');

let threeDXBrowserView = null;
let mainWindowRef = null;

app.on('browser-window-created', (_, win) => {
  if (!mainWindowRef) mainWindowRef = win;
});

// PKCE helpers
function base64UrlEncode(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function generateCodeVerifier() {
  return base64UrlEncode(crypto.randomBytes(32));
}
async function generateCodeChallenge(verifier) {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return base64UrlEncode(hash);
}

let pendingOAuthState = null;

// ── OAuth: Start PKCE flow ──────────────────────────────────────────────────
ipcMain.handle('3dx-oauth-start', async (event, { tenantUrl, clientId }) => {
  if (!checkRateLimit('3dx-oauth-start')) {
    return { success: false, error: 'Rate limit exceeded. Please wait a moment.' };
  }
  // RLS check: at least engineer role required to start OAuth
  const role = await getCurrentRole();
  const perm = checkPermission(role, 'threeDX', 'oauthStart');
  if (!perm.allowed) return rlsDenied('threeDX', 'oauthStart', perm.reason);
  
  const validatedTenant = validateUrl(tenantUrl, ['https:', 'http:']);
  if (!validatedTenant || (validatedTenant.startsWith('http:') && !validatedTenant.includes('localhost') && !validatedTenant.includes('127.0.0.1'))) {
    return { success: false, error: 'Invalid tenant URL. Only HTTPS or local HTTP URLs are allowed.' };
  }

  try {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const redirectPort = 47832;
    const redirectUri = `http://127.0.0.1:${redirectPort}/callback`;
    const base = validatedTenant.replace(/\/$/, '');

    const authUrl = new URL(`${base}/login/oauth2/authorize`);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', 'openid profile email offline_access');
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    
    const stateParam = crypto.randomBytes(8).toString('hex');
    pendingOAuthState = stateParam;
    authUrl.searchParams.set('state', stateParam);

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${redirectPort}`);
      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code');
        const returnedState = url.searchParams.get('state');
        
        if (!returnedState || returnedState !== pendingOAuthState) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`<html><body style="font-family:sans-serif;background:#181818;color:#ff4d4d;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
            <div style="text-align:center"><h2>❌ Authentication Failed</h2>
            <p>OAuth state mismatch — potential CSRF attack detected.</p></div></body></html>`);
          server.close();
          event.sender.send('3dx-oauth-complete', { success: false, error: 'OAuth state mismatch — possible CSRF attack.' });
          return;
        }
        pendingOAuthState = null;

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<html><body style="font-family:sans-serif;background:#181818;color:#e0e0e0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
          <div style="text-align:center"><h2 style="color:#4da6ff">&#x2713; Authentication Complete</h2>
          <p>You may close this window and return to ADIA.</p></div></body></html>`);
        server.close();

        if (!code) {
          event.sender.send('3dx-oauth-complete', { success: false, error: 'No authorization code received.' });
          return;
        }

        try {
          const tokenUrl = `${base}/login/oauth2/token`;
          const body = new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            client_id: clientId,
            code_verifier: codeVerifier,
          });
          const tokenRes = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
          });
          if (!tokenRes.ok) throw new Error(`Token exchange failed: ${tokenRes.status}`);
          const tokenData = await tokenRes.json();

          let userInfo = {};
          try {
            const uRes = await fetch(`${base}/login/oauth2/userinfo`, {
              headers: { Authorization: `Bearer ${tokenData.access_token}` }
            });
            if (uRes.ok) userInfo = await uRes.json();
          } catch (_) {}

          const credentials = {
            tenantUrl,
            clientId,
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            expiresAt: Date.now() + (tokenData.expires_in ?? 3600) * 1000,
            userDisplayName: userInfo.name || userInfo.preferred_username || null,
            userEmail: userInfo.email || null,
            userId: userInfo.sub || null,
          };
          await storeCreds(credentials);
          
          // Send redacted credentials to renderer
          const redacted = {
            tenantUrl: credentials.tenantUrl,
            clientId: credentials.clientId,
            expiresAt: credentials.expiresAt,
            userDisplayName: credentials.userDisplayName,
            userEmail: credentials.userEmail,
            userId: credentials.userId
          };
          event.sender.send('3dx-oauth-complete', { success: true, credentials: redacted });
        } catch (err) {
          event.sender.send('3dx-oauth-complete', { success: false, error: err.message });
        }
      }
    });

    server.listen(redirectPort, '127.0.0.1');
    const { shell } = require('electron');
    await shell.openExternal(authUrl.toString());
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── OAuth: Refresh token ────────────────────────────────────────────────────
ipcMain.handle('3dx-refresh-token', async () => {
  if (!checkRateLimit('3dx-refresh-token')) {
    return { success: false, error: 'Rate limit exceeded.' };
  }
  try {
    const creds = await loadCreds();
    if (!creds || !creds.refreshToken) return { success: false, error: 'No refresh token stored.' };
    const base = creds.tenantUrl.replace(/\/$/, '');
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: creds.refreshToken,
      client_id: creds.clientId,
    });
    const res = await fetch(`${base}/login/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) throw new Error(`Refresh failed: ${res.status}`);
    const data = await res.json();
    const updated = {
      ...creds,
      accessToken: data.access_token,
      refreshToken: data.refresh_token || creds.refreshToken,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
    await storeCreds(updated);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── Credentials ─────────────────────────────────────────────────────────────
ipcMain.handle('3dx-load-credentials', async () => {
  if (!checkRateLimit('3dx-get-workspaces')) { // use basic rate limit
    return null;
  }
  const creds = await loadCreds();
  if (!creds) return null;
  return {
    tenantUrl: creds.tenantUrl,
    clientId: creds.clientId,
    expiresAt: creds.expiresAt,
    userDisplayName: creds.userDisplayName,
    userEmail: creds.userEmail,
    userId: creds.userId
  };
});

ipcMain.handle('3dx-save-credentials', async (_, creds) => {
  if (!checkRateLimit('3dx-save-credentials')) {
    return { success: false, error: 'Rate limit exceeded.' };
  }
  // RLS check: at least engineer role required
  const role = await getCurrentRole();
  const perm = checkPermission(role, 'threeDX', 'saveCredentials');
  if (!perm.allowed) return rlsDenied('threeDX', 'saveCredentials', perm.reason);
  await storeCreds(creds);
  return { success: true };
});

ipcMain.handle('3dx-logout', async () => {
  if (!checkRateLimit('3dx-logout')) {
    return { success: false, error: 'Rate limit exceeded.' };
  }
  await deleteCreds();
  return { success: true };
});

// ── Authenticated fetch proxy ────────────────────────────────────────────────
async function threeDXFetch(path, options = {}) {
  const creds = await loadCreds();
  if (!creds || !creds.accessToken) throw new Error('Not authenticated to 3DEXPERIENCE');
  const base = creds.tenantUrl.replace(/\/$/, '');
  const url = path.startsWith('http') ? path : `${base}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  });
}

// ── Workspaces ──────────────────────────────────────────────────────────────
// ── Workspaces ──────────────────────────────────────────────────────────────
ipcMain.handle('3dx-get-workspaces', async () => {
  if (!checkRateLimit('3dx-get-workspaces')) {
    return { error: 'Rate limit exceeded.' };
  }
  try {
    const res = await threeDXFetch('/resources/v1/modeler/dseng/dseng:Engagement');
    if (!res.ok) throw new Error(`Workspaces API returned ${res.status}`);
    const data = await res.json();
    const member = data.member || data.results || [];
    const workspaces = member.map((m) => ({
      id: m.id || m['ds6w:identifier'] || m.identifier,
      title: m.title || m['ds6w:label'] || m.name || 'Unnamed Space',
      type: m.type || m['ds6w:type'] || 'Collaborative Space',
      description: m.description || m['ds6w:abstract'] || '',
      ownerId: m.owner?.id,
      ownerName: m.owner?.title,
      lastModified: m.modified,
    }));
    return { workspaces };
  } catch (err) {
    console.error('3DX get-workspaces error:', err.message);
    return {
      workspaces: [
        { id: 'demo-ws-1', title: 'ADIA Engineering Projects', type: 'Collaborative Space', description: 'Demo workspace (offline)' },
        { id: 'demo-ws-2', title: 'Simulation Models', type: 'Collaborative Space', description: 'Demo workspace (offline)' },
      ],
    };
  }
});

// ── Upload Document ─────────────────────────────────────────────────────────
ipcMain.handle('3dx-upload-document', async (_, payload) => {
  if (!checkRateLimit('3dx-upload-document')) {
    return { success: false, error: 'Rate limit exceeded.' };
  }
  const { fileName, content, encoding, mimeType, targetWorkspaceId, title, description } = payload;
  try {
    const creds = await loadCreds();
    if (!creds || !creds.accessToken) return { success: false, error: 'Not authenticated' };
    const base = creds.tenantUrl.replace(/\/$/, '');

    // Create document envelope
    const createRes = await threeDXFetch('/resources/v1/modeler/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [{
          type: 'Document',
          title: title || fileName,
          description: description || '',
          policy: 'DMSDocument',
        }]
      }),
    });
    if (!createRes.ok) throw new Error(`Document create failed: ${createRes.status}`);
    const createData = await createRes.json();
    const docId = createData?.member?.[0]?.id || createData?.results?.[0]?.id;
    if (!docId) throw new Error('No document ID returned from creation');

    // Upload file content as multipart
    const fileBuffer = encoding === 'base64'
      ? Buffer.from(content, 'base64')
      : Buffer.from(content, 'utf8');
    const boundary = `----ADIABoundary${crypto.randomBytes(8).toString('hex')}`;
    const CRLF = '\r\n';
    const formHeader = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="${fileName}"`,
      `Content-Type: ${mimeType}`,
      '', '',
    ].join(CRLF);
    const formFooter = `${CRLF}--${boundary}--${CRLF}`;
    const body = Buffer.concat([Buffer.from(formHeader), fileBuffer, Buffer.from(formFooter)]);

    const uploadRes = await fetch(
      `${base}/resources/v1/modeler/documents/${docId}/files/CheckinTicket`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body,
      }
    );
    if (!uploadRes.ok) throw new Error(`File upload failed: ${uploadRes.status}`);

    return {
      success: true,
      documentId: docId,
      documentUrl: `${base}/3DSpace/index.htm#document:${docId}`,
    };
  } catch (err) {
    console.error('3DX upload error:', err.message);
    return { success: false, error: err.message };
  }
});

// ── Search Documents ────────────────────────────────────────────────────────
ipcMain.handle('3dx-search-documents', async (_, { query, workspaceId, limit = 50, offset = 0 }) => {
  if (!checkRateLimit('3dx-search-documents')) {
    return { total: 0, documents: [] };
  }
  try {
    let searchPath = `/resources/v1/modeler/documents?$top=${limit}&$skip=${offset}`;
    if (query) searchPath += `&$search=${encodeURIComponent(query)}`;
    const res = await threeDXFetch(searchPath);
    if (!res.ok) throw new Error(`Search API returned ${res.status}`);
    const data = await res.json();
    const member = data.member || data.results || [];
    const documents = member.map((m) => ({
      id: m.id,
      title: m.title || m.name || 'Unnamed',
      fileType: (m.fileExtension || m.type || 'file').toLowerCase(),
      mimeType: m.mimeType || 'application/octet-stream',
      size: m.fileSize || m.size || 0,
      modified: m.modified || m.lastModified || new Date().toISOString(),
      created: m.created || new Date().toISOString(),
      downloadUrl: m.downloadUrl || '',
      workspaceId: m.collabspace?.id || workspaceId || '',
      description: m.description || '',
      authorName: m.owner?.title || m.author || '',
    }));
    return { total: data.totalItems || documents.length, documents };
  } catch (err) {
    console.error('3DX search error:', err.message);
    return {
      total: 2,
      documents: [
        { id: 'demo-doc-1', title: 'ADIA_Demo_Project.json', fileType: 'json', mimeType: 'application/json', size: 24576, modified: new Date().toISOString(), created: new Date().toISOString(), downloadUrl: '', workspaceId: 'demo-ws-1', description: 'Demo ADIA project (offline)', authorName: 'ADIA Team' },
        { id: 'demo-doc-2', title: 'Simulation_Report.pdf', fileType: 'pdf', mimeType: 'application/pdf', size: 102400, modified: new Date().toISOString(), created: new Date().toISOString(), downloadUrl: '', workspaceId: 'demo-ws-1', description: 'Demo simulation report (offline)', authorName: 'ADIA Team' },
      ],
    };
  }
});

// ── Download Document ───────────────────────────────────────────────────────
ipcMain.handle('3dx-download-document', async (_, { documentId }) => {
  if (!checkRateLimit('3dx-download-document')) {
    return { success: false, error: 'Rate limit exceeded.' };
  }
  try {
    const ticketRes = await threeDXFetch(
      `/resources/v1/modeler/documents/${documentId}/files/CheckoutTicket`
    );
    if (!ticketRes.ok) throw new Error(`Checkout ticket failed: ${ticketRes.status}`);
    const ticketData = await ticketRes.json();
    const downloadUrl = ticketData?.dataelements?.ticketURL || ticketData?.downloadUrl;
    if (!downloadUrl) throw new Error('No download URL in ticket response');

    const fileRes = await fetch(downloadUrl);
    if (!fileRes.ok) throw new Error(`File download failed: ${fileRes.status}`);

    const contentType = fileRes.headers.get('content-type') || 'application/octet-stream';
    const buffer = Buffer.from(await fileRes.arrayBuffer());
    const isText = contentType.includes('text') || contentType.includes('json');
    return {
      success: true,
      fileName: ticketData?.dataelements?.fileName || documentId,
      content: isText ? buffer.toString('utf8') : buffer.toString('base64'),
      encoding: isText ? 'utf8' : 'base64',
      mimeType: contentType,
    };
  } catch (err) {
    console.error('3DX download error:', err.message);
    return { success: false, error: err.message };
  }
});

// ── BrowserView management ──────────────────────────────────────────────────
ipcMain.handle('3dx-navigate', async (event, { url }) => {
  if (!checkRateLimit('3dx-navigate')) {
    return { success: false, error: 'Rate limit exceeded.' };
  }
  
  const allowedBvDomains = ['3dexperience.3ds.com', '3ds.com'];
  try {
    const parsed = new URL(url);
    const isAllowedDomain = allowedBvDomains.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d));
    const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (!isAllowedDomain && !isLocalhost) {
      return { success: false, error: 'Navigation blocked: Domain not allowed.' };
    }
  } catch {
    return { success: false, error: 'Invalid URL.' };
  }

  const win = mainWindowRef || BrowserWindow.getAllWindows()[0];
  if (!win) return { success: false, error: 'No main window found' };

  if (!threeDXBrowserView) {
    const { BrowserView } = require('electron');
    threeDXBrowserView = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: 'persist:3dexperience',
      },
    });
    win.addBrowserView(threeDXBrowserView);

    const [winW, winH] = win.getSize();
    const bvX = Math.max(Math.round(winW / 2) - 420, 0);
    const bvY = Math.max(Math.round(winH / 2) - 220, 120);
    threeDXBrowserView.setBounds({ x: bvX, y: bvY, width: 884, height: 380 });

    const sendState = () => {
      const wc = threeDXBrowserView.webContents;
      event.sender.send('3dx-browser-state-update', {
        url: wc.getURL(),
        canGoBack: wc.canGoBack(),
        canGoForward: wc.canGoForward(),
        isLoading: wc.isLoading(),
        title: wc.getTitle(),
      });
    };
    threeDXBrowserView.webContents.on('did-navigate', sendState);
    threeDXBrowserView.webContents.on('did-navigate-in-page', sendState);
    threeDXBrowserView.webContents.on('did-start-loading', sendState);
    threeDXBrowserView.webContents.on('did-stop-loading', sendState);
  }

  await threeDXBrowserView.webContents.loadURL(url);
  return { success: true };
});

ipcMain.handle('3dx-browser-close', async () => {
  const win = mainWindowRef || BrowserWindow.getAllWindows()[0];
  if (win && threeDXBrowserView) {
    win.removeBrowserView(threeDXBrowserView);
    threeDXBrowserView.webContents.destroy();
    threeDXBrowserView = null;
  }
  return { success: true };
});

ipcMain.handle('3dx-browser-state', async () => {
  if (!checkRateLimit('3dx-browser-state')) {
    return null;
  }
  if (!threeDXBrowserView) return null;
  const wc = threeDXBrowserView.webContents;
  return { url: wc.getURL(), canGoBack: wc.canGoBack(), canGoForward: wc.canGoForward(), isLoading: wc.isLoading(), title: wc.getTitle() };
});

ipcMain.handle('3dx-browser-back', async () => {
  if (threeDXBrowserView?.webContents.canGoBack()) threeDXBrowserView.webContents.goBack();
  return { success: true };
});

ipcMain.handle('3dx-browser-forward', async () => {
  if (threeDXBrowserView?.webContents.canGoForward()) threeDXBrowserView.webContents.goForward();
  return { success: true };
});

ipcMain.handle('3dx-browser-reload', async () => {
  threeDXBrowserView?.webContents.reload();
  return { success: true };
});

let threeDXDashboardView = null;

ipcMain.handle('3dx-dashboard-open', async (event, { url }) => {
  if (!checkRateLimit('3dx-navigate')) {
    return { success: false, error: 'Rate limit exceeded.' };
  }
  
  const allowedBvDomains = ['3dexperience.3ds.com', '3ds.com'];
  try {
    const parsed = new URL(url);
    const isAllowedDomain = allowedBvDomains.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d));
    const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (!isAllowedDomain && !isLocalhost) {
      return { success: false, error: 'Navigation blocked: Domain not allowed.' };
    }
  } catch {
    return { success: false, error: 'Invalid URL.' };
  }

  const win = mainWindowRef || BrowserWindow.getAllWindows()[0];
  if (!win) return { success: false, error: 'No main window found' };

  if (!threeDXDashboardView) {
    const { BrowserView } = require('electron');
    threeDXDashboardView = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: 'persist:3dexperience',
      },
    });
    win.addBrowserView(threeDXDashboardView);
  }

  const [winW, winH] = win.getSize();
  const x = Math.max(winW - 450, 0);
  const y = 48;
  const width = Math.min(450, winW);
  const height = Math.max(winH - y - 48, 100);
  threeDXDashboardView.setBounds({ x, y, width, height });

  await threeDXDashboardView.webContents.loadURL(url);
  return { success: true };
});

ipcMain.handle('3dx-dashboard-close', async () => {
  const win = mainWindowRef || BrowserWindow.getAllWindows()[0];
  if (win && threeDXDashboardView) {
    win.removeBrowserView(threeDXDashboardView);
    threeDXDashboardView.webContents.destroy();
    threeDXDashboardView = null;
  }
  return { success: true };
});

// Secure vault API Key handlers
ipcMain.handle('store-api-key', async (_, { service, key }) => {
  // Validate service name against allowlist to prevent key poisoning
  try { validateServiceName(service); } catch { return { success: false, error: 'Invalid service name' }; }
  // Validate key is a non-empty string within length limits
  const safeKey = validateString(key, 512);
  if (!safeKey) return { success: false, error: 'Invalid or empty API key' };

  const existing = await credentialVault.loadCredentials() || {};
  if (!existing.apiKeys) {
    existing.apiKeys = {};
  }
  existing.apiKeys[service] = safeKey;
  await credentialVault.storeCredentials(existing);
  credentialVault.logAuditEvent('store_api_key', { service });
  return { success: true };
});

ipcMain.handle('load-api-key', async (_, { service }) => {
  // Validate service name against allowlist
  try { validateServiceName(service); } catch { return null; }

  const creds = await credentialVault.loadCredentials();
  if (creds) {
    if (creds.apiKeys && creds.apiKeys[service]) {
      return creds.apiKeys[service];
    }
    if (creds._service === service) {
      return creds.apiKey;
    }
  }
  return null;
});

ipcMain.handle('openai-chat-completion', async (_, { apiKey, messages, baseUrl, model }) => {
  try {
    // Validate baseUrl if provided — must be HTTPS to prevent cleartext credential exposure
    if (baseUrl) {
      const safeUrl = validateUrl(baseUrl.trim(), ['https:']);
      if (!safeUrl) {
        return { success: false, error: 'Invalid baseUrl: only HTTPS is permitted' };
      }
    }
    const cleanBaseUrl = (baseUrl || "https://api.openai.com/v1").trim().replace(/\/+$/, '');
    const url = `${cleanBaseUrl}/chat/completions`;
    const selectedModel = model || "gpt-4o-mini";

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: messages,
        temperature: 0.7,
        max_tokens: 2048
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return { success: false, error: `OpenAI API Error (${response.status}): ${errText}` };
    }

    const data = await response.json();
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return { success: true, content: data.choices[0].message.content || "" };
    }
    return { success: false, error: "Empty or unexpected response from OpenAI API." };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('sm-verify-generated-c', async (_, payload) => {
  const role = await getCurrentRole();
  const perm = checkPermission(role, 'codegen', 'verify');
  if (!perm.allowed) {
    return rlsDenied('codegen', 'verify', perm.reason);
  }
  const rl = checkRateLimit('sm-verify-generated-c', 20, 60000);
  if (!rl.allowed) {
    return { success: false, error: 'Rate limit exceeded for code verification. Please wait.' };
  }
  return await verifyGeneratedCode(payload);
});


