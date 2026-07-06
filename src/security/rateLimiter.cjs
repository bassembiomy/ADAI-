// src/security/rateLimiter.cjs
// Simple in-memory token bucket rate limiter for IPC handlers

const buckets = new Map();

// Configure limits per channel type
// Default limits: 60 requests/minute (1 req/sec) for standard, 10 requests/minute for auth
const limits = {
  // Auth channels
  '3dx-oauth-start': { max: 10, interval: 60000 },
  '3dx-refresh-token': { max: 10, interval: 60000 },
  '3dx-save-credentials': { max: 10, interval: 60000 },
  '3dx-logout': { max: 10, interval: 60000 },
  // Sync / Upload channels
  '3dx-upload-document': { max: 60, interval: 60000 },
  '3dx-download-document': { max: 60, interval: 60000 },
  // Browse / Read channels
  '3dx-get-workspaces': { max: 40, interval: 60000 },
  '3dx-search-documents': { max: 40, interval: 60000 },
  '3dx-navigate': { max: 60, interval: 60000 },
  '3dx-browser-state': { max: 120, interval: 60000 },
};

function checkRateLimit(channel) {
  const limit = limits[channel] || { max: 60, interval: 60000 };
  const now = Date.now();

  if (!buckets.has(channel)) {
    buckets.set(channel, {
      tokens: limit.max,
      lastRefill: now
    });
  }

  const bucket = buckets.get(channel);
  
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
    return true; // Allowed
  }

  return false; // Throttled
}

module.exports = {
  checkRateLimit
};
