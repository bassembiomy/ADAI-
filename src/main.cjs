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
