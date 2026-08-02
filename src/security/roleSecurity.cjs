// src/security/roleSecurity.cjs
// ============================================================================
// Role-Level Security (RLS) for ADIA Engineering Suite
// ============================================================================
// Provides a permission layer at the IPC boundary. Roles are derived from
// the current credential/session state. Future: extend to support Supabase
// or SQLite-backed role storage for multi-user scenarios.
//
// Roles (ordered by privilege):
//   guest     — unauthenticated / no credentials
//   engineer  — has stored credentials, may not have valid 3DX token
//   admin     — has a valid active 3DX access token
//
// Modules:
//   ai        — AI provider integrations (Gemini, OpenAI, local LLM, n8n)
//   hil       — Hardware-In-the-Loop compile, flash, erase, serial
//   threeDX   — 3DEXPERIENCE OAuth, workspace, document operations
//   project   — Project import/export, save to folder
//   settings  — API key storage, toolchain management
//   audit     — Audit log access
// ============================================================================

'use strict';

const ROLES = Object.freeze({
  GUEST: 'guest',
  ENGINEER: 'engineer',
  ADMIN: 'admin',
});

// ─── Permission Matrix ────────────────────────────────────────────────────────
// Format: permissions[module][action] = minimumRoleRequired
// Roles are hierarchical: admin > engineer > guest
// checkPermission() resolves if the user's effective role is >= the required role.

const PERMISSIONS = {
  ai: {
    use: ROLES.ENGINEER,        // Send prompts to AI providers
    storeKey: ROLES.ENGINEER,   // Store API keys in vault
    loadKey: ROLES.ENGINEER,    // Load API keys from vault
  },
  hil: {
    saveFiles: ROLES.ENGINEER,  // Write HIL build files
    compile: ROLES.ENGINEER,    // Compile HIL firmware
    flash: ROLES.ENGINEER,      // Flash to hardware
    erase: ROLES.ENGINEER,      // Erase hardware flash
    connect: ROLES.ENGINEER,    // Open serial port
    send: ROLES.ENGINEER,       // Send serial data
  },
  threeDX: {
    oauthStart: ROLES.ENGINEER, // Start OAuth flow
    refresh: ROLES.ENGINEER,    // Refresh token
    saveCredentials: ROLES.ENGINEER,
    loadCredentials: ROLES.ENGINEER,
    logout: ROLES.ENGINEER,
    listWorkspaces: ROLES.ENGINEER,
    upload: ROLES.ENGINEER,
    download: ROLES.ENGINEER,
    search: ROLES.ENGINEER,
    navigate: ROLES.ENGINEER,
  },
  project: {
    import: ROLES.ENGINEER,     // Import JSON project
    save: ROLES.ENGINEER,       // Save project to file
    exportFolder: ROLES.ENGINEER,
  },
  codegen: {
    verify: ROLES.ENGINEER,     // Compile and smoke test generated C in isolated sandbox
  },
  settings: {
    installToolchain: ROLES.ENGINEER,
    factoryIO: ROLES.ENGINEER,
  },
  audit: {
    view: ROLES.ADMIN,          // View audit log — admin only
  },
};

// ─── Role Ordering ────────────────────────────────────────────────────────────
const ROLE_LEVEL = {
  [ROLES.GUEST]: 0,
  [ROLES.ENGINEER]: 1,
  [ROLES.ADMIN]: 2,
};

/**
 * Returns true if the given role meets or exceeds the required role.
 * @param {string} userRole - The effective role of the current user.
 * @param {string} requiredRole - The minimum role required.
 * @returns {boolean}
 */
function roleAtLeast(userRole, requiredRole) {
  const userLevel = ROLE_LEVEL[userRole] ?? 0;
  const requiredLevel = ROLE_LEVEL[requiredRole] ?? 99;
  return userLevel >= requiredLevel;
}

/**
 * Check if a role has permission to perform an action on a module.
 * @param {string} role - The effective role ('guest' | 'engineer' | 'admin').
 * @param {string} module - The module name (e.g. 'hil', 'ai', 'threeDX').
 * @param {string} action - The action name (e.g. 'compile', 'flash', 'use').
 * @returns {{ allowed: boolean, reason?: string }}
 */
function checkPermission(role, module, action) {
  const modulePerms = PERMISSIONS[module];
  if (!modulePerms) {
    return { allowed: false, reason: `Unknown module: "${module}"` };
  }
  const requiredRole = modulePerms[action];
  if (requiredRole === undefined) {
    return { allowed: false, reason: `Unknown action: "${module}.${action}"` };
  }
  if (!roleAtLeast(role, requiredRole)) {
    return {
      allowed: false,
      reason: `Role "${role}" cannot perform "${module}.${action}" — requires "${requiredRole}"`
    };
  }
  return { allowed: true };
}

/**
 * Derives the effective role from the current credentials/session state.
 * Priority: admin (valid 3DX token) > engineer (stored creds) > guest
 *
 * Future extension: accept a Supabase/SQLite session object to derive
 * roles from database-backed user records.
 *
 * @param {object|null} credentials - The loaded credentials object (from credentialVault).
 * @returns {'guest'|'engineer'|'admin'}
 */
function getEffectiveRole(credentials) {
  if (!credentials) return ROLES.GUEST;

  // Has any stored credentials at all -> at least engineer
  const hasStoredCreds = !!(
    credentials.userEmail ||
    credentials.userId ||
    credentials.tenantUrl ||
    (credentials.apiKeys && Object.keys(credentials.apiKeys).length > 0)
  );

  if (!hasStoredCreds) return ROLES.GUEST;

  // Check for a valid (non-expired) 3DX access token -> admin
  if (credentials.accessToken && credentials.expiresAt) {
    const SIXTY_SECONDS = 60_000;
    const isTokenValid = Date.now() < (credentials.expiresAt - SIXTY_SECONDS);
    if (isTokenValid) return ROLES.ADMIN;
  }

  return ROLES.ENGINEER;
}

/**
 * Creates a standardized RLS-denied IPC response.
 * @param {string} module
 * @param {string} action
 * @param {string} reason
 * @returns {{ error: string, code: 'RLS_DENIED' }}
 */
function rlsDenied(module, action, reason) {
  return {
    error: `Permission denied: ${reason}`,
    code: 'RLS_DENIED',
    module,
    action,
  };
}

module.exports = {
  ROLES,
  PERMISSIONS,
  checkPermission,
  getEffectiveRole,
  rlsDenied,
};
