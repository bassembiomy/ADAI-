// src/types/threeDX_types.ts
// ============================================================================
// 3DEXPERIENCE (3DX) Integration — Shared Type Definitions
// ============================================================================

// ---------------------------------------------------------------------------
// Credentials & Auth
// ---------------------------------------------------------------------------

/** OAuth 2.0 / 3DX tenant configuration stored securely via keytar */
export interface ThreeDXCredentials {
  tenantUrl: string;         // e.g. "https://eu1-ds-iam.3dexperience.3ds.com"
  clientId: string;          // App-registered OAuth client ID
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;        // Unix ms timestamp
  userDisplayName?: string;
  userEmail?: string;
  userId?: string;
}

export type ThreeDXConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'token_expired';

// ---------------------------------------------------------------------------
// Workspace / Collaborative Spaces
// ---------------------------------------------------------------------------

/** A 3DEXPERIENCE collaborative space (Collaborative Industry Innovator, etc.) */
export interface ThreeDXWorkspace {
  id: string;
  title: string;
  type: string;
  description?: string;
  ownerId?: string;
  ownerName?: string;
  lastModified?: string;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/** A document retrieved from the 3DX document service */
export interface ThreeDXDocument {
  id: string;
  title: string;
  fileType: string;          // e.g. "json", "pdf", "c", "zip"
  mimeType: string;
  size: number;              // bytes
  modified: string;          // ISO 8601 date string
  created: string;
  downloadUrl: string;
  workspaceId: string;
  description?: string;
  authorName?: string;
}

/** Payload for uploading a document to 3DX */
export interface ThreeDXUploadPayload {
  fileName: string;
  content: string;           // base64-encoded or plain text
  encoding: 'base64' | 'utf8';
  mimeType: string;
  targetWorkspaceId: string;
  title?: string;
  description?: string;
}

export interface ThreeDXUploadResult {
  success: boolean;
  documentId?: string;
  documentUrl?: string;
  error?: string;
}

export interface ThreeDXDownloadResult {
  success: boolean;
  fileName?: string;
  content?: string;          // base64 or utf8 string
  encoding?: 'base64' | 'utf8';
  mimeType?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface ThreeDXSearchQuery {
  query?: string;
  workspaceId?: string;
  fileType?: string;
  limit?: number;
  offset?: number;
}

export interface ThreeDXSearchResult {
  total: number;
  documents: ThreeDXDocument[];
}

// ---------------------------------------------------------------------------
// Navigation (BrowserView)
// ---------------------------------------------------------------------------

export interface ThreeDXBrowserState {
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  title?: string;
}

// ---------------------------------------------------------------------------
// ADIA Export Payload (what ADIA can push to 3DX)
// ---------------------------------------------------------------------------

export type AdiaExportType =
  | 'project_json'
  | 'bdd_diagram'
  | 'ibd_diagram'
  | 'requirements'
  | 'state_machine'
  | 'code_generation'
  | 'xbridges_model'
  | 'vlab_model'
  | 'hil_c_code'
  | 'pdf_report';

export interface AdiaExportItem {
  type: AdiaExportType;
  fileName: string;
  label: string;               // Human-readable e.g. "ADIA Project JSON"
  content: string;
  mimeType: string;
  encoding: 'utf8' | 'base64';
  available: boolean;
}
