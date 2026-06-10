const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
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

  win.webContents.openDevTools();

  // win.webContents.openDevTools();
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
    const content = fs.readFileSync(filePaths[0], 'utf8');
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
  try {
    for (const [filename, data] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, filename), JSON.stringify(data, null, 2));
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

ipcMain.handle('hil-list-ports', async () => {
  try {
    const realPorts = await getRealPorts();
    const virtualPorts = ['COM1 (Virtual)', 'COM3 (Virtual)', '/dev/ttyUSB0 (Virtual)'];
    return [...realPorts, ...virtualPorts];
  } catch (e) {
    return ['COM1 (Virtual)', 'COM3 (Virtual)', '/dev/ttyUSB0 (Virtual)'];
  }
});

ipcMain.handle('hil-connect', async (event, { port, baudRate }) => {
  if (port.includes('(Virtual)')) {
    if (virtualInterval) clearInterval(virtualInterval);
    let t = 0;
    virtualInterval = setInterval(() => {
      t += 0.1;
      // Simulate multiple channels telemetry output
      const values = `ch_1=${(Math.sin(t) > 0 ? 1 : 0).toFixed(4)};ch_2=${Math.round((Math.sin(t)+1)*2047)};ch_3=${Math.round((Math.cos(t)+1)*127)}\n`;
      event.sender.send('hil-on-data', values);
    }, 200);
    return true;
  }

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
});

ipcMain.handle('hil-disconnect', async () => {
  if (virtualInterval) {
    clearInterval(virtualInterval);
    virtualInterval = null;
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
