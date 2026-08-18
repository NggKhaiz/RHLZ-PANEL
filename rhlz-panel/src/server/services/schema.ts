/**
 * RHLZ — flat-JSON data schema maintenance.
 *
 * The persistence layer is a set of JSON files in .data/ (users.json,
 * servers.json, api_keys.json, settings.json, ...). This module backfills
 * missing OPTIONAL fields with safe defaults so records written by older
 * versions keep working. It is strictly additive and never destructive:
 * existing values are never overwritten, and no file is rewritten unless a
 * change is actually applied.
 */
import fs from "fs-extra";
import path from "path";
import { readJSON, writeJSON } from "./db.js";

function applyBackfill<T extends Record<string, any>>(rows: T[], fill: (row: T, idx: number) => boolean): boolean {
  let changed = false;
  rows.forEach((row, i) => {
    if (row && typeof row === "object" && fill(row, i)) changed = true;
  });
  return changed;
}

const nowIso = () => new Date().toISOString();

/** Backfills users.json with safe defaults for legacy rows. */
async function backfillUsers(): Promise<string[]> {
  const users: any[] = (await readJSON("users.json")) || [];
  if (!Array.isArray(users) || users.length === 0) return [];
  const changed = applyBackfill(users, (u) => {
    let c = false;
    if (u.passwordVersion === undefined) { u.passwordVersion = 0; c = true; }
    if (u.role === undefined) { u.role = "user"; c = true; }
    if (u.createdAt === undefined) { u.createdAt = nowIso(); c = true; }
    return c;
  });
  if (changed) await writeJSON("users.json", users);
  return changed ? ["users.json"] : [];
}

/** Backfills servers.json with safe defaults for legacy rows. */
async function backfillServers(): Promise<string[]> {
  const servers: any[] = (await readJSON("servers.json")) || [];
  if (!Array.isArray(servers) || servers.length === 0) return [];
  const changed = applyBackfill(servers, (s) => {
    let c = false;
    if (s.status === undefined) { s.status = "offline"; c = true; }
    if (s.suspended === undefined) { s.suspended = false; c = true; }
    if (s.createdAt === undefined) { s.createdAt = nowIso(); c = true; }
    if (s.subUsers === undefined) { s.subUsers = []; c = true; }
    return c;
  });
  if (changed) await writeJSON("servers.json", servers);
  return changed ? ["servers.json"] : [];
}

/**
 * Backfills .data JSON files with safe defaults. Returns the list of files
 * that were rewritten. Runs once at boot (after integrity verification).
 */
export async function ensureDataSchema(): Promise<string[]> {
  const touched: string[] = [];
  try {
    touched.push(...(await backfillUsers()));
  } catch (e) {
    console.error("[RHLZ] users backfill failed:", (e as Error).message);
  }
  try {
    touched.push(...(await backfillServers()));
  } catch (e) {
    console.error("[RHLZ] servers backfill failed:", (e as Error).message);
  }
  return touched;
}
