import path from "path";

const SERVER_ID_RE = /^[A-Za-z0-9-]{1,64}$/;

export type ResolvedPath =
  | { ok: true; path: string }
  | { ok: false; error: string };

/**
 * Joins path parts with "/" WITHOUT normalizing them. Unlike path.join /
 * path.posix.join this never clamps ".." segments, so validation downstream
 * sees the raw input exactly as the client sent it.
 */
export function relJoin(...parts: string[]): string {
  return parts.filter((p) => typeof p === "string" && p.length > 0).join("/");
}

/**
 * Resolves a client-supplied path to an absolute path guaranteed to live
 * inside the given server's data directory. Rejects ".." / "." traversal,
 * absolute paths, and Windows drive-letter paths outright. This is the ONLY
 * approved way to turn client file paths into filesystem paths for server
 * file operations.
 */
export function resolveServerPath(serverId: string, userPath: unknown): ResolvedPath {
  if (typeof userPath !== "string" || !SERVER_ID_RE.test(serverId)) {
    return { ok: false, error: "Invalid path" };
  }
  const serverBase = path.resolve(process.cwd(), ".data", "servers", serverId);
  const clean = userPath.trim();

  // "" / "/" / "." all mean the server root.
  if (clean === "" || clean === "/" || clean === ".") {
    return { ok: true, path: serverBase };
  }

  // Normalize separators and split into segments. Any ".." or drive-letter
  // segment is an immediate rejection - never clamp, never resolve.
  const normalized = clean.replace(/\\/g, "/");
  const segments = normalized.split("/").filter((s) => s !== "" && s !== ".");
  // Reject ".." segments, including percent-encoded variants (defense in
  // depth for any layer that skips URL-decoding).
  const isTraversal = (seg: string): boolean => {
    if (seg === "..") return true;
    try {
      return decodeURIComponent(seg) === "..";
    } catch {
      return false;
    }
  };
  if (segments.some(isTraversal) || /^[a-zA-Z]:/.test(segments[0] || "")) {
    return { ok: false, error: "Invalid path: access outside the server directory is forbidden" };
  }

  const target = path.resolve(serverBase, ...segments);
  const relCheck = path.relative(serverBase, target);
  if (relCheck.startsWith("..") || path.isAbsolute(relCheck)) {
    return { ok: false, error: "Invalid path: access outside the server directory is forbidden" };
  }
  return { ok: true, path: target };
}

/** Same containment guarantee for the per-server backups directory. */
export function resolveBackupPath(serverId: string, filename: unknown): ResolvedPath {
  if (typeof filename !== "string" || !SERVER_ID_RE.test(serverId)) {
    return { ok: false, error: "Invalid path" };
  }
  const base = path.resolve(process.cwd(), ".data", "backups", serverId);
  const target = path.resolve(base, filename);
  const rel = path.relative(base, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return { ok: false, error: "Invalid path" };
  }
  return { ok: true, path: target };
}

export const SERVER_ID_PATTERN = SERVER_ID_RE;
