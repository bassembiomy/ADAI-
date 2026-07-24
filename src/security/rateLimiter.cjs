// src/security/rateLimiter.cjs
// Token bucket rate limiter for IPC handlers
// Supports per-channel AND per-sender-ID tracking to prevent multi-window bypass

const buckets = new Map();

// Configure limits per channel type
// Default limits: 60 requests/minute (1 req/sec) for standard, 10/minute for auth
const limits = {
  // Auth channels
  '3dx-oauth-start':    { max: 10, interval: 60000 },
  '3dx-refresh-token':  { max: 10, interval: 60000 },
  '3dx-save-credentials': { max: 10, interval: 60000 },
  '3dx-logout':         { max: 10, interval: 60000 },
  // API Key channels
  'store-api-key':      { max: 20, interval: 60000 },
  'load-api-key':       { max: 60, interval: 60000 },
  'openai-chat-completion': { max: 30, interval: 60000 },
  // Sync / Upload channels
  '3dx-upload-document':   { max: 60, interval: 60000 },
  '3dx-download-document': { max: 60, interval: 60000 },
  // Browse / Read channels
  '3dx-get-workspaces':    { max: 40, interval: 60000 },
  '3dx-search-documents':  { max: 40, interval: 60000 },
  '3dx-navigate':          { max: 60, interval: 60000 },
  '3dx-browser-state':     { max: 120, interval: 60000 },
  // HIL channels
  'hil-run-compile': { max: 10, interval: 60000 },
  'hil-run-flash':   { max: 5,  interval: 60000 },
  'hil-run-erase':   { max: 5,  interval: 60000 },
  'hil-save-build-files': { max: 30, interval: 60000 },
};

/**
 * Check rate limit for a given channel.
 * Optionally pass a senderId to scope limits per-sender (prevents multi-window bypass).
 *
 * @param {string} channel - The IPC channel name.
 * @param {number|null} [senderId=null] - The webContents ID of the sender (event.sender.id).
 * @returns {{ allowed: boolean, retryAfterMs?: number }}
 */
function checkRateLimit(channel, senderId = null) {
  const limit = limits[channel] || { max: 60, interval: 60000 };
  const now = Date.now();

  // Use a composite key when senderId is provided for per-sender tracking
  const bucketKey = senderId != null ? `${channel}::${senderId}` : channel;

  if (!buckets.has(bucketKey)) {
    buckets.set(bucketKey, {
      tokens: limit.max,
      lastRefill: now,
    });
  }

  const bucket = buckets.get(bucketKey);

  // Refill tokens based on time elapsed
  const timePassed = now - bucket.lastRefill;
  const tokensToAdd = Math.floor(timePassed * (limit.max / limit.interval));

  if (tokensToAdd > 0) {
    bucket.tokens = Math.min(limit.max, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }

  // Consume 1 token
  if (bucket.tokens > 0) {
    bucket.tokens--;
    return { allowed: true };
  }

  // Calculate time until next token available
  const msPerToken = limit.interval / limit.max;
  const retryAfterMs = Math.ceil(msPerToken - timePassed % msPerToken);
  return { allowed: false, retryAfterMs };
}

/**
 * Reset rate limit bucket for a channel (and optionally a specific sender).
 * Useful for testing or after explicit logout/reset flows.
 * @param {string} channel
 * @param {number|null} [senderId=null]
 */
function resetRateLimit(channel, senderId = null) {
  const bucketKey = senderId != null ? `${channel}::${senderId}` : channel;
  buckets.delete(bucketKey);
}

module.exports = {
  checkRateLimit,
  resetRateLimit,
};
