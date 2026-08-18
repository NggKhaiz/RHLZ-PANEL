import fs from "fs-extra";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".data");

/**
 * Per-file write queues. Writes to the same JSON file are serialized so a
 * slow/large write can never interleave with another write to the same file.
 */
const writeQueues = new Map<string, Promise<unknown>>();

function enqueueWrite(filename: string, task: () => Promise<void>): Promise<void> {
  const prev = writeQueues.get(filename) || Promise.resolve();
  // Run regardless of the previous task's outcome so one failure doesn't
  // wedge the queue for that file.
  const next = prev.then(task, task);
  writeQueues.set(
    filename,
    next.catch(() => {})
  );
  return next;
}

/**
 * Reads and parses a JSON file from .data/. Returns null when the file is
 * missing or unparseable (callers already treat null as "empty collection").
 */
export const readJSON = async (filename: string): Promise<any | null> => {
  const filePath = path.join(DATA_DIR, filename);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
};

/**
 * Atomically writes a JSON file:
 *  1. write to a unique temp file,
 *  2. rename over the target (atomic on POSIX),
 *  3. best-effort rolling `.bak` copy for crash recovery.
 * All writes to the same file are serialized via the per-file queue.
 */
export const writeJSON = async (filename: string, data: any): Promise<void> => {
  const filePath = path.join(DATA_DIR, filename);
  await fs.ensureDir(path.dirname(filePath));

  await enqueueWrite(filename, async () => {
    const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(tmpPath, filePath);
    try {
      await fs.copy(filePath, `${filePath}.bak`, { overwrite: true });
    } catch (err) {
      // The .bak is best-effort; the primary file is already safely in place.
    }
  });
};

/**
 * Transaction-style update: serializes the whole read-modify-write cycle for
 * a file, so concurrent updates cannot lose each other's changes.
 *
 *   await updateJSON("servers.json", (servers) => { servers.push(x); return servers; });
 *
 * `mutator` may return undefined to leave the collection unchanged, or the
 * new value to persist. Returns the persisted value, or null when the file
 * does not exist and mutator received [].
 */
export const updateJSON = async (
  filename: string,
  mutator: (current: any) => any
): Promise<any> => {
  const filePath = path.join(DATA_DIR, filename);
  await fs.ensureDir(path.dirname(filePath));

  return enqueueWrite(filename, async () => {
    let current: any = null;
    try {
      current = JSON.parse(await fs.readFile(filePath, "utf8"));
    } catch (err) {
      current = null;
    }
    const seed = current === null ? [] : current;
    const next = mutator(seed);
    if (next === undefined) return seed;

    const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
    await fs.writeFile(tmpPath, JSON.stringify(next, null, 2), "utf8");
    await fs.rename(tmpPath, filePath);
    try {
      await fs.copy(filePath, `${filePath}.bak`, { overwrite: true });
    } catch (err) {
      // best-effort
    }
    return next;
  });
};
