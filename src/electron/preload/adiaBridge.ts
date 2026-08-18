import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('adia', {
  searchWeb: (request: { query: string; maxResults?: number }) => ipcRenderer.invoke('search-web-provider', request)
});
