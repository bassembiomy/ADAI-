// src/services/threeDXService.ts
// ============================================================================
// 3DEXPERIENCE Integration Service
// Renderer-side IPC bridge + token management + API helpers
// ============================================================================

import type {
  ThreeDXCredentials,
  ThreeDXConnectionStatus,
  ThreeDXWorkspace,
  ThreeDXDocument,
  ThreeDXUploadPayload,
  ThreeDXUploadResult,
  ThreeDXDownloadResult,
  ThreeDXSearchQuery,
  ThreeDXSearchResult,
  ThreeDXBrowserState,
} from '../types/threeDX_types';

// ---------------------------------------------------------------------------
// IPC bridge helper
// ---------------------------------------------------------------------------

function getIpc() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const electron = (window as any).require?.('electron');
    return electron?.ipcRenderer ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Auth / OAuth
// ---------------------------------------------------------------------------

/** Starts the OAuth 2.0 PKCE flow. Opens system browser for login. */
export async function startOAuthFlow(
  tenantUrl: string,
  clientId: string
): Promise<{ success: boolean; error?: string }> {
  const ipc = getIpc();
  if (!ipc) return { success: false, error: 'Not running in Electron context.' };
  return ipc.invoke('3dx-oauth-start', { tenantUrl, clientId });
}

/** Refreshes the OAuth access token using stored refresh token. */
export async function refreshOAuthToken(): Promise<{ success: boolean; error?: string }> {
  const ipc = getIpc();
  if (!ipc) return { success: false, error: 'Not running in Electron context.' };
  return ipc.invoke('3dx-refresh-token');
}

/** Loads stored credentials from secure OS keychain. */
export async function loadStoredCredentials(): Promise<ThreeDXCredentials | null> {
  const ipc = getIpc();
  if (!ipc) return null;
  return ipc.invoke('3dx-load-credentials');
}

/** Saves credentials to secure OS keychain. */
export async function saveCredentials(
  creds: ThreeDXCredentials
): Promise<{ success: boolean; error?: string }> {
  const ipc = getIpc();
  if (!ipc) return { success: false, error: 'Not running in Electron context.' };
  return ipc.invoke('3dx-save-credentials', creds);
}

/** Clears all stored 3DX credentials (logout). */
export async function logout(): Promise<void> {
  const ipc = getIpc();
  if (!ipc) return;
  await ipc.invoke('3dx-logout');
}

/** Checks if the current token is valid (not expired). */
export function isTokenValid(creds: ThreeDXCredentials): boolean {
  if (!creds.accessToken || !creds.expiresAt) return false;
  // Allow 60s buffer before actual expiry
  return Date.now() < creds.expiresAt - 60_000;
}

/** Returns human-readable connection status. */
export function getConnectionStatus(creds: ThreeDXCredentials | null): ThreeDXConnectionStatus {
  if (!creds || !creds.accessToken) return 'disconnected';
  if (!isTokenValid(creds)) return 'token_expired';
  return 'connected';
}

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

/** Lists all accessible 3DX collaborative spaces for the current user. */
export async function listWorkspaces(): Promise<ThreeDXWorkspace[]> {
  const ipc = getIpc();
  if (!ipc) return [];
  const result = await ipc.invoke('3dx-get-workspaces');
  return result?.workspaces ?? [];
}

// ---------------------------------------------------------------------------
// Documents — Upload
// ---------------------------------------------------------------------------

/**
 * Uploads a document to a 3DEXPERIENCE workspace.
 * Content should be a UTF-8 string or base64-encoded binary.
 */
export async function uploadDocument(
  payload: ThreeDXUploadPayload
): Promise<ThreeDXUploadResult> {
  const ipc = getIpc();
  if (!ipc) return { success: false, error: 'Not running in Electron context.' };
  return ipc.invoke('3dx-upload-document', payload);
}

// ---------------------------------------------------------------------------
// Documents — Search & Download
// ---------------------------------------------------------------------------

/** Searches/lists documents in a 3DX workspace. */
export async function searchDocuments(
  query: ThreeDXSearchQuery
): Promise<ThreeDXSearchResult> {
  const ipc = getIpc();
  if (!ipc) return { total: 0, documents: [] };
  const result = await ipc.invoke('3dx-search-documents', query);
  return result ?? { total: 0, documents: [] };
}

/** Downloads a document from 3DEXPERIENCE by document ID. */
export async function downloadDocument(
  documentId: string
): Promise<ThreeDXDownloadResult> {
  const ipc = getIpc();
  if (!ipc) return { success: false, error: 'Not running in Electron context.' };
  return ipc.invoke('3dx-download-document', { documentId });
}

// ---------------------------------------------------------------------------
// BrowserView Control
// ---------------------------------------------------------------------------

/** Opens/shows the embedded 3DX BrowserView and navigates to the given URL. */
export async function navigateBrowserView(url: string): Promise<void> {
  const ipc = getIpc();
  if (!ipc) return;
  await ipc.invoke('3dx-navigate', { url });
}

/** Hides/destroys the embedded BrowserView. */
export async function closeBrowserView(): Promise<void> {
  const ipc = getIpc();
  if (!ipc) return;
  await ipc.invoke('3dx-browser-close');
}

/** Gets current state of the embedded BrowserView. */
export async function getBrowserState(): Promise<ThreeDXBrowserState | null> {
  const ipc = getIpc();
  if (!ipc) return null;
  return ipc.invoke('3dx-browser-state');
}

/** Navigate back in the embedded BrowserView. */
export async function browserGoBack(): Promise<void> {
  const ipc = getIpc();
  if (!ipc) return;
  await ipc.invoke('3dx-browser-back');
}

/** Navigate forward in the embedded BrowserView. */
export async function browserGoForward(): Promise<void> {
  const ipc = getIpc();
  if (!ipc) return;
  await ipc.invoke('3dx-browser-forward');
}

/** Reload the embedded BrowserView. */
export async function browserReload(): Promise<void> {
  const ipc = getIpc();
  if (!ipc) return;
  await ipc.invoke('3dx-browser-reload');
}

/**
 * Registers a listener for BrowserView URL/navigation state changes.
 * Returns an unsubscribe function.
 */
export function onBrowserStateChange(
  callback: (state: ThreeDXBrowserState) => void
): () => void {
  const ipc = getIpc();
  if (!ipc) return () => {};
  const handler = (_event: unknown, state: ThreeDXBrowserState) => callback(state);
  ipc.on('3dx-browser-state-update', handler);
  return () => ipc.removeListener('3dx-browser-state-update', handler);
}

/**
 * Registers a listener for OAuth callback completion events.
 * Returns an unsubscribe function.
 */
export function onOAuthComplete(
  callback: (result: { success: boolean; credentials?: ThreeDXCredentials; error?: string }) => void
): () => void {
  const ipc = getIpc();
  if (!ipc) return () => {};
  const handler = (
    _event: unknown,
    result: { success: boolean; credentials?: ThreeDXCredentials; error?: string }
  ) => callback(result);
  ipc.on('3dx-oauth-complete', handler);
  return () => ipc.removeListener('3dx-oauth-complete', handler);
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Converts a plain JSON object to a UTF-8 base64 string for upload. */
export function jsonToBase64(obj: unknown): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(obj, null, 2))));
}

/** Decodes a base64 UTF-8 string back to a parsed JSON object. */
export function base64ToJson<T = unknown>(b64: string): T {
  return JSON.parse(decodeURIComponent(escape(atob(b64)))) as T;
}

/** Formats bytes into human-readable size string. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Returns the 3DEXPERIENCE platform default URL for a given tenant base. */
export function buildPlatformUrl(tenantUrl: string): string {
  // Strip trailing slash and append the 3DX compass landing page path
  const base = tenantUrl.replace(/\/$/, '');
  return `${base}/`;
}
