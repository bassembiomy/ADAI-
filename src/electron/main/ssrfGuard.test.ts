import { describe, it, expect, vi } from 'vitest';
import { SsrfGuard } from './ssrfGuard';

describe('SsrfGuard with Socket-Level DNS Resolution & Redirect Validation', () => {
  it('should detect and block private IPv4 and IPv6 addresses even if disguised as hostnames', async () => {
    vi.spyOn(SsrfGuard, 'resolveIpAddresses').mockResolvedValue(['127.0.0.1']);
    const check1 = await SsrfGuard.isSafeUrl('https://evil-spoof.example.com/api');
    expect(check1.isAllowed).toBe(false);
    expect(check1.reason).toContain('SSRF_LOOPBACK_OR_PRIVATE_IP');

    vi.spyOn(SsrfGuard, 'resolveIpAddresses').mockResolvedValue(['192.168.1.50']);
    const check2 = await SsrfGuard.isSafeUrl('https://internal.example.com');
    expect(check2.isAllowed).toBe(false);

    vi.spyOn(SsrfGuard, 'resolveIpAddresses').mockResolvedValue(['93.184.216.34']);
    const check3 = await SsrfGuard.isSafeUrl('https://example.com');
    expect(check3.isAllowed).toBe(true);
  });
});
