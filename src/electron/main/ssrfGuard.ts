import dns from 'dns';
import net from 'net';

export class SsrfGuard {
  public static async resolveIpAddresses(hostname: string): Promise<string[]> {
    try {
      const records = await dns.promises.lookup(hostname, { all: true });
      return records.map(r => r.address);
    } catch {
      return [];
    }
  }

  public static isPrivateIp(ip: string): boolean {
    const ipType = net.isIP(ip);
    if (!ipType) return true; // Invalid format treated as unsafe

    if (ipType === 4) {
      const parts = ip.split('.').map(Number);
      if (parts[0] === 127) return true; // Loopback 127.0.0.0/8
      if (parts[0] === 10) return true;  // Private 10.0.0.0/8
      if (parts[0] === 192 && parts[1] === 168) return true; // Private 192.168.0.0/16
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // Private 172.16.0.0/12
      if (parts[0] === 169 && parts[1] === 254) return true; // Link-local 169.254.0.0/16
      if (parts[0] === 0) return true; // 0.0.0.0/8
    } else if (ipType === 6) {
      const norm = ip.toLowerCase();
      if (norm === '::1' || norm === '::') return true;
      if (norm.startsWith('fc') || norm.startsWith('fd')) return true; // Unique local fc00::/7
      if (norm.startsWith('fe80:')) return true; // Link-local fe80::/10
      if (norm.startsWith('::ffff:')) {
        const v4Part = norm.replace('::ffff:', '');
        return this.isPrivateIp(v4Part);
      }
    }

    return false;
  }

  public static async isSafeUrl(urlString: string): Promise<{ isAllowed: boolean; reason?: string; resolvedIp?: string }> {
    try {
      const url = new URL(urlString);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        return { isAllowed: false, reason: 'INVALID_PROTOCOL' };
      }

      const ips = await this.resolveIpAddresses(url.hostname);
      if (ips.length === 0) {
        return { isAllowed: false, reason: 'DNS_RESOLUTION_FAILED' };
      }

      for (const ip of ips) {
        if (this.isPrivateIp(ip)) {
          return { isAllowed: false, reason: `SSRF_LOOPBACK_OR_PRIVATE_IP: Resolved to ${ip}` };
        }
      }

      return { isAllowed: true, resolvedIp: ips[0] };
    } catch (err: any) {
      return { isAllowed: false, reason: err.message };
    }
  }
}
