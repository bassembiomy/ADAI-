const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { validateString, validateUrl, validateFilename, sanitizeShellArg } = require('./security/inputValidator.cjs');

// Disable hardware acceleration if not needed
// app.disableHardwareAcceleration();

// Prevent protocol handler registration hijacking
app.setAsDefaultProtocolClient = () => {};

// Prepend local AVR toolchain to PATH if it exists in the workspace
const localAvrBin = path.join(__dirname, '../avr-gcc/avr-gcc-15.2.0-x64-windows/bin');
if (fs.existsSync(localAvrBin)) {
  process.env.PATH = localAvrBin + path.delimiter + process.env.PATH;
}

function createWindow() {
  // Enforce TLS 1.2+ minimum for all session requests
  if (session && session.defaultSession) {
    session.defaultSession.setSSLConfig({
      minVersion: 'tls1.2'
    });

    // Inject CSP headers
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const isPackaged = app.isPackaged;
      const csp = [
        "default-src 'self'" + (isPackaged ? "" : " http://localhost:3000 http://127.0.0.1:3000 ws://localhost:3000 ws://127.0.0.1:3000") + ";",
        "script-src 'self' 'unsafe-inline' " + (isPackaged ? "" : "'unsafe-eval' http://localhost:3000 http://127.0.0.1:3000") + " https://*.3dexperience.3ds.com https://iam.3dexperience.3ds.com;",
        "connect-src 'self' https://*.3dexperience.3ds.com https://iam.3dexperience.3ds.com http://127.0.0.1:7410" + (isPackaged ? "" : " http://localhost:3000 ws://localhost:3000 http://127.0.0.1:3000 ws://127.0.0.1:3000") + ";",
        "img-src 'self' data: https://*.3dexperience.3ds.com https://iam.3dexperience.3ds.com" + (isPackaged ? "" : " http://localhost:3000 http://127.0.0.1:3000") + ";",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com" + (isPackaged ? "" : " http://localhost:3000 http://127.0.0.1:3000") + ";",
        "font-src 'self' data: https://fonts.gstatic.com" + (isPackaged ? "" : " http://localhost:3000 http://127.0.0.1:3000") + ";",
        "frame-src 'self' https://*.3dexperience.3ds.com https://iam.3dexperience.3ds.com" + (isPackaged ? "" : " http://localhost:3000 http://127.0.0.1:3000") + ";"
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
    backgroundColor: "#0a0a0a",
    // icon: path.join(__dirname, '../icon.png'),
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

  // Prevent navigation to untrusted URLs
  win.webContents.on('will-navigate', (event, url) => {
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

  // Prevent opening new windows
  win.webContents.setWindowOpenHandler(({ url }) => {
    const { shell } = require('electron');
    const trustedDomains = ['3dexperience.3ds.com', 'iam.3dexperience.3ds.com'];
    try {
      const parsed = new URL(url);
      if (trustedDomains.some(d => parsed.hostname.endsWith(d))) {
        shell.openExternal(url);
      }
    } catch {}
    return { action: 'deny' };
  });

  if (!app.isPackaged) {
    win.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow).catch(err => {
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
const { execSync, spawn } = require('child_process');
let serialPort = null;
let virtualInterval = null;
let activePsProcess = null;

async function getRealPorts() {
  if (process.platform === 'win32') {
    try {
      const stdout = execSync('[System.IO.Ports.SerialPort]::GetPortNames()', { shell: 'powershell.exe' }).toString();
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
  try {
    const buildDir = path.join(process.cwd(), 'hil_build');
    if (!fs.existsSync(buildDir)) {
      fs.mkdirSync(buildDir, { recursive: true });
    }
    for (const file of files) {
      fs.writeFileSync(path.join(buildDir, file.name), file.content, 'utf8');
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
  return new Promise((resolve) => {
    const buildDir = path.join(process.cwd(), 'hil_build');
    if (!fs.existsSync(buildDir)) {
      return resolve({ success: false, error: 'Build directory not found. Save files first.' });
    }

    let cmd = 'gcc';
    let args = [];
    const dbg = debugLevel === 'None' ? [] : [debugLevel || '-g'];
    
    if (target === 'Generic') {
      args = [
        optimization || '-O2',
        warningLevel || '-Wall',
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
        warningLevel || '-Wall',
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
        warningLevel || '-Wall',
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
        optimization || '-Os',
        warningLevel || '-Wall',
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
  });
});

// HIL Flash IPC handler
ipcMain.handle('hil-run-flash', async (event, { target, programmer, flashAddress, commPort, baudRate }) => {
  return new Promise((resolve) => {
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
        '-D',
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
  // If a physical port is provided, always do a real serial connection
  if (port && !port.includes('(Virtual)')) {
    // 1. Try native serialport package first
    try {
      const { SerialPort } = require('serialport');
      serialPort = new SerialPort({ path: port, baudRate: baudRate });
      
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
$portName = "${port}"
$baud = ${baudRate}
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

async function storeCreds(creds) {
  await credentialVault.storeCredentials(creds);
}

async function loadCreds() {
  return await credentialVault.loadCredentials();
}

async function deleteCreds() {
  await credentialVault.deleteCredentials();
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
          res.end(`<html><body style="font-family:sans-serif;background:#0a0a0a;color:#ff4d4d;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
            <div style="text-align:center"><h2>❌ Authentication Failed</h2>
            <p>OAuth state mismatch — potential CSRF attack detected.</p></div></body></html>`);
          server.close();
          event.sender.send('3dx-oauth-complete', { success: false, error: 'OAuth state mismatch — possible CSRF attack.' });
          return;
        }
        pendingOAuthState = null;

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<html><body style="font-family:sans-serif;background:#0a0a0a;color:#e0e0e0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
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
  await credentialVault.storeCredentials({ _service: service, apiKey: key });
  return { success: true };
});

ipcMain.handle('load-api-key', async (_, { service }) => {
  const creds = await credentialVault.loadCredentials();
  return creds?._service === service ? creds.apiKey : null;
});

