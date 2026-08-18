/**
 * RHLZ — Server-Side Request Forgery guard for user-supplied download URLs
 * (plugin/mod installers).
 *
 * Blocks:
 *  - non-http(s) protocols,
 *  - literal IPs in loopback / private / link-local / CGNAT / reserved ranges,
 *  - hostnames that resolve (A/AAAA) to any blocked address.
 *
 * Residual risk (documented): classic resolve-then-connect TOCTOU / DNS
 * rebinding is not fully closed without pinning the resolved IP at the HTTP
 * layer; that is tracked in the ledger for the PERFORMANCE track.
 */
import dns from "dns/promises";
import net from "net";

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map((n) => parseInt(n, 10));
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isBlockedIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  const inRange = (start: string, end: string) => {
    const s = ipv4ToInt(start);
    const e = ipv4ToInt(end);
    return n >= s && n <= e;
  };
  return (
    inRange("0.0.0.0", "0.255.255.255") || // "this" network
    inRange("10.0.0.0", "10.255.255.255") || // private
    inRange("100.64.0.0", "100.127.255.255") || // CGNAT
    inRange("127.0.0.0", "127.255.255.255") || // loopback
    inRange("169.254.0.0", "169.254.255.255") || // link-local
    inRange("172.16.0.0", "172.31.255.255") || // private
    inRange("192.168.0.0", "192.168.255.255") || // private
    inRange("224.0.0.0", "239.255.255.255") || // multicast
    inRange("240.0.0.0", "255.255.255.255") // reserved
  );
}

function isBlockedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true; // loopback / unspecified
  // Link-local fe80::/10 (first hextet 0xfe80-0xfebf) and ULA fc00::/7
  // (first hextet 0xfc00-0xfdff) are identified from the first hextet alone,
  // which is robust against "::" compression.
  const firstHextet = lower.split(":")[0];
  const n = parseInt(firstHextet, 16);
  if (Number.isNaN(n)) return true; // unparseable -> block
  if ((n & 0xffc0) === 0xfe80) return true; // fe80::/10
  if ((n & 0xfe00) === 0xfc00) return true; // fc00::/7
  return false;
}

function isBlockedIp(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) return isBlockedIpv4(ip);
  if (kind === 6) return isBlockedIpv6(ip);
  return true;
}

export type SsrfResult = { ok: true; url: string } | { ok: false; error: string };

export async function assertSafeDownloadUrl(raw: string): Promise<SsrfResult> {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) {
    return { ok: false, error: "Invalid URL" };
  }
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, error: "Invalid URL" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, error: "Download URL must use http(s)" };
  }
  const host = u.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  if (net.isIP(host)) {
    return isBlockedIp(host)
      ? { ok: false, error: "Download URL host is blocked (loopback/private/link-local)" }
      : { ok: true, url: raw };
  }
  try {
    const addrs = await dns.lookup(host, { all: true });
    for (const { address } of addrs) {
      if (isBlockedIp(address)) {
        return { ok: false, error: "Download URL resolves to a blocked address (loopback/private/link-local)" };
      }
    }
  } catch {
    // Resolution failure: the HTTP request would fail anyway; let axios surface it.
  }
  return { ok: true, url: raw };
}
