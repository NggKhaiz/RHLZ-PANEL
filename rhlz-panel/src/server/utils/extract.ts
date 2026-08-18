import fs from "fs-extra";
import path from "path";
import extractZip from "extract-zip";
import AdmZip from "adm-zip";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Rejects archives whose member names would escape the destination directory
 * (zip-slip): ".." segments, absolute paths, or Windows drive-letter paths.
 * Scans .zip/.jar members with AdmZip (pure JS, reads the central directory)
 * and lists .tar/.tar.gz/.tgz members via `tar -t`. If an archive cannot be
 * scanned (e.g. corrupted), we log and let the normal fallback chain decide -
 * the later methods still fail closed on unreadable archives.
 */
export async function assertSafeArchiveMembers(targetPath: string): Promise<void> {
  const lower = targetPath.toLowerCase();
  const hasUnsafeSegment = (name: string): boolean => {
    const normalized = (name || "").replace(/\\/g, "/");
    if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) return true;
    return normalized.split("/").some((seg) => seg === "..");
  };
  // Unix file type bits live in the top 16 bits of the external attributes;
  // 0xA000 is a symbolic link. Symlinks can escape the destination even when
  // their name looks safe (GHSA-jmr9-qjv8-65gv).
  const isSymlink = (entry: any): boolean => {
    const mode = ((entry?.attr ?? 0) >>> 16) & 0xf000;
    return mode === 0xa000;
  };

  if (lower.endsWith(".zip") || lower.endsWith(".jar")) {
    try {
      const zip = new AdmZip(targetPath);
      for (const entry of zip.getEntries()) {
        if (hasUnsafeSegment(entry.entryName || "") || isSymlink(entry)) {
          throw new Error(`Blocked unsafe archive entry: ${entry.entryName}`);
        }
      }
    } catch (err: any) {
      if (err?.message?.startsWith("Blocked unsafe archive entry")) throw err;
      console.warn("Could not pre-scan zip members; continuing with fallback chain:", err?.message);
    }
    return;
  }

  if (lower.endsWith(".tar") || lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) {
    const flag = lower.endsWith(".tar") ? "-tf" : "-tzf";
    const { stdout } = await execAsync(`tar ${flag} ${JSON.stringify(targetPath)}`);
    for (const line of stdout.split("\n")) {
      if (line && hasUnsafeSegment(line)) {
        throw new Error(`Blocked unsafe archive entry: ${line}`);
      }
    }
  }
}

/**
 * Post-extraction defense-in-depth: walks destDir and removes any symbolic
 * link whose resolved target escapes destDir (covers methods where the
 * pre-scan could not inspect members, e.g. system `unzip`).
 */
async function assertExtractedInside(destDir: string): Promise<void> {
  const root = path.resolve(destDir);
  const walk = async (dir: string): Promise<void> => {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isSymbolicLink()) {
        try {
          const target = await fs.readlink(full);
          const resolved = path.resolve(path.dirname(full), target);
          const rel = path.relative(root, resolved);
          if (rel.startsWith("..") || path.isAbsolute(rel)) {
            await fs.remove(full);
          }
        } catch {
          await fs.remove(full).catch(() => {});
        }
      }
    }
  };
  await walk(root);
}

/**
 * Robustly extracts zip/tar/tgz/gz/jar archives using multiple fallback strategies:
 * 1. Tar command for .tar / .tar.gz / .tgz
 * 2. System `unzip -o -q` command
 * 3. Python `python3 -m zipfile -e` command
 * 4. AdmZip JS library
 * 5. extract-zip (yauzl) fallback
 */
export async function extractArchive(targetPath: string, destDir: string): Promise<{ success: boolean; method: string }> {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Archive file does not exist: ${path.basename(targetPath)}`);
  }

  const stat = await fs.stat(targetPath);
  if (stat.isDirectory()) {
    throw new Error(`'${path.basename(targetPath)}' is a directory folder, not a zip archive file.`);
  }

  if (stat.size === 0) {
    throw new Error(`'${path.basename(targetPath)}' is an empty file (0 bytes).`);
  }

  // Zip-slip guard: reject archives whose members escape destDir before any
  // extraction method runs.
  await assertSafeArchiveMembers(targetPath);

  await fs.ensureDir(destDir);
  const lowerPath = targetPath.toLowerCase();

  // 1. Tar / Tar.Gz / Tgz archives
  if (lowerPath.endsWith(".tar.gz") || lowerPath.endsWith(".tgz") || lowerPath.endsWith(".tar")) {
    try {
      const flag = lowerPath.endsWith(".tar") ? "-xf" : "-xzf";
      await execAsync(`tar ${flag} ${JSON.stringify(targetPath)} -C ${JSON.stringify(destDir)}`);
      await assertExtractedInside(destDir);
      return { success: true, method: "tar" };
    } catch (tarErr: any) {
      console.error("tar command failed:", tarErr?.message);
      throw new Error(`Failed to extract tar archive: ${tarErr?.message || tarErr}`);
    }
  }

  let lastError: Error | null = null;

  // 2. System `unzip` command
  try {
    await execAsync(`unzip -o -q ${JSON.stringify(targetPath)} -d ${JSON.stringify(destDir)}`);
    await assertExtractedInside(destDir);
    return { success: true, method: "system-unzip" };
  } catch (unzipCmdErr: any) {
    console.warn("System unzip command failed, trying Python zipfile...", unzipCmdErr?.message);
    lastError = unzipCmdErr;
  }

  // 3. Python 3 `zipfile` module
  try {
    await execAsync(`python3 -m zipfile -e ${JSON.stringify(targetPath)} ${JSON.stringify(destDir)}`);
    await assertExtractedInside(destDir);
    return { success: true, method: "python-zipfile" };
  } catch (pyErr: any) {
    console.warn("Python zipfile failed, trying AdmZip...", pyErr?.message);
    lastError = pyErr;
  }

  // 4. AdmZip (Pure JS, handles most zip variants)
  try {
    const zip = new AdmZip(targetPath);
    zip.extractAllTo(destDir, true);
    await assertExtractedInside(destDir);
    return { success: true, method: "adm-zip" };
  } catch (admZipErr: any) {
    console.warn("AdmZip failed, trying extract-zip...", admZipErr?.message);
    lastError = admZipErr;
  }

  // 5. extract-zip (Yauzl based)
  try {
    await extractZip(targetPath, { dir: path.resolve(destDir) });
    await assertExtractedInside(destDir);
    return { success: true, method: "extract-zip" };
  } catch (extractZipErr: any) {
    console.error("extract-zip failed:", extractZipErr?.message);
    lastError = extractZipErr;
  }

  throw new Error(`Failed to extract archive '${path.basename(targetPath)}': ${lastError?.message || "Unsupported archive or corrupted file."}`);
}