const { contextBridge, ipcRenderer } = require('electron');

const ALLOWED_INVOKE_CHANNELS = [
  'import-json', 'save-json', 'save-project-folder',
  'fetch-factory-io-tags', 'sync-factory-io',
  'hil-save-build-files', 'hil-run-compile', 'hil-run-flash', 'hil-run-erase',
  'hil-list-ports', 'hil-connect', 'hil-disconnect', 'hil-send',
  '3dx-oauth-start', '3dx-refresh-token', '3dx-load-credentials',
  '3dx-save-credentials', '3dx-logout', '3dx-get-workspaces',
  '3dx-upload-document', '3dx-search-documents', '3dx-download-document',
  '3dx-navigate', '3dx-browser-close', '3dx-browser-state',
  '3dx-browser-back', '3dx-browser-forward', '3dx-browser-reload',
  '3dx-dashboard-open', '3dx-dashboard-close',
  'store-api-key', 'load-api-key', 'openai-chat-completion',
  'sm-verify-generated-c',
];

const ALLOWED_ON_CHANNELS = [
  '3dx-oauth-complete', '3dx-browser-state-update',
  'hil-on-data', 'hil-compiler-log-line', 'hil-flasher-log-line',
];

// Polyfill window.require('electron') for backwards compatibility with the existing codebase
contextBridge.exposeInMainWorld('require', (moduleName) => {
  if (moduleName === 'electron') {
    return {
      ipcRenderer: {
        send: (channel, ...args) => {
          if (!ALLOWED_INVOKE_CHANNELS.includes(channel)) {
            console.error(`IPC send blocked: "${channel}" not in allowlist`);
            return;
          }
          ipcRenderer.send(channel, ...args);
        },
        invoke: (channel, ...args) => {
          if (!ALLOWED_INVOKE_CHANNELS.includes(channel)) {
            console.error(`IPC invoke blocked: "${channel}" not in allowlist`);
            return Promise.reject(new Error(`Channel "${channel}" not allowed`));
          }
          return ipcRenderer.invoke(channel, ...args);
        },
        on: (channel, func) => {
          if (!ALLOWED_ON_CHANNELS.includes(channel)) {
            console.error(`IPC on blocked: "${channel}" not in allowlist`);
            return () => {};
          }
          const subscription = (event, ...args) => func(event, ...args);
          ipcRenderer.on(channel, subscription);
          return () => ipcRenderer.removeListener(channel, subscription);
        },
        once: (channel, func) => {
          if (!ALLOWED_ON_CHANNELS.includes(channel)) {
            console.error(`IPC once blocked: "${channel}" not in allowlist`);
            return () => {};
          }
          const subscription = (event, ...args) => func(event, ...args);
          ipcRenderer.once(channel, subscription);
          return () => ipcRenderer.removeListener(channel, subscription);
        },
        removeListener: (channel, func) => ipcRenderer.removeListener(channel, func),
        removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
      }
    };
  }
  throw new Error(`Require for module "${moduleName}" is not allowed in sandbox.`);
});
