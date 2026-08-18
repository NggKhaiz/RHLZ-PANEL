/**
 * RHLZ — cryptocurrency-mining heuristic scan for downloaded artifacts
 * (plugins/mods). Scans jar bytes for known miner signatures and rejects the
 * artifact when a strong signal is found. False-positive-aware: only well-known
 * miner strings are matched, matched on plain text within the binary.
 */
import fs from "fs-extra";

const SIGNATURES: Array<{ label: string; needles: string[] }> = [
  { label: "xmrig", needles: ["XMRig", "xmrig", "donate.v2.xmrig.com"] },
  { label: "coinhive", needles: ["coinhive", "CryptoNight", "cryptonight", "cnheavy", "cn-lite"] },
  { label: "minergate", needles: ["minergate", "NiceHash", "nicehash"] },
  { label: "generic-miner", needles: ["stratum+tcp://", "stratum+ssl://", "getwork", "minerd", "cpuminer"] },
];

export type MinerScanResult = { blocked: boolean; label?: string };

export async function scanForMinerSignatures(filePath: string): Promise<MinerScanResult> {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size === 0) return { blocked: false };
    // Cap the scan at 32 MB; larger jars are scanned in the first chunk only.
    const size = Math.min(stat.size, 32 * 1024 * 1024);
    const fd = await fs.open(filePath, "r");
    try {
      const buf = Buffer.alloc(size);
      await fs.read(fd, buf, 0, size, 0);
      const haystack = buf.toString("latin1");
      for (const sig of SIGNATURES) {
        if (sig.needles.some((n) => haystack.includes(n))) {
          return { blocked: true, label: sig.label };
        }
      }
    } finally {
      await fs.close(fd);
    }
  } catch {
    // Scan failures never block installs (best-effort defense).
  }
  return { blocked: false };
}
