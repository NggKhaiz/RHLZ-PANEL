import { test } from "node:test";
import assert from "node:assert";
import AdmZip from "adm-zip";
import fs from "fs-extra";
import path from "node:path";
import { extractArchive, assertSafeArchiveMembers } from "../src/server/utils/extract.js";

const TMP = path.join(process.cwd(), ".data", "test-tmp");

async function craftZip(p: string, entries: Array<{ name: string; data: string; symlink?: boolean }>) {
  await fs.ensureDir(TMP);
  const { execSync } = await import("node:child_process");
  const pyFile = path.join(TMP, "craft.py");
  const lines = [
    "import zipfile",
    `z = zipfile.ZipFile(${JSON.stringify(p)}, 'w')`,
    ...entries.map((e) => {
      const attr = e.symlink ? "0xA000 * 65536 | 0o777" : "0o100644 * 65536";
      return `info = zipfile.ZipInfo(${JSON.stringify(e.name)}); info.external_attr = ${attr}; z.writestr(info, ${JSON.stringify(e.data)});`;
    }),
    "z.close()",
  ];
  await fs.writeFile(pyFile, lines.join("\n"));
  execSync(`python3 ${JSON.stringify(pyFile)}`);
}

test("extract: traversal entry rejected", async () => {
  const p = path.join(TMP, "t.zip");
  await craftZip(p, [{ name: "../evil.txt", data: "x" }]);
  await assert.rejects(() => extractArchive(p, path.join(TMP, "d")), /Blocked unsafe archive entry/);
});

test("extract: symlink entry rejected (GHSA-jmr9-qjv8-65gv)", async () => {
  const p = path.join(TMP, "s.zip");
  await craftZip(p, [{ name: "evil-link", data: "/etc/passwd", symlink: true }]);
  await assert.rejects(() => extractArchive(p, path.join(TMP, "d2")), /Blocked unsafe archive entry/);
});

test("extract: benign zip extracts", async () => {
  await fs.ensureDir(TMP);
  const zip = new AdmZip();
  zip.addFile("world/level.dat", Buffer.from("data"));
  const p = path.join(TMP, "ok.zip");
  zip.writeZip(p);
  const r = await extractArchive(p, path.join(TMP, "d3"));
  assert.strictEqual(r.success, true);
  assert.ok(await fs.pathExists(path.join(TMP, "d3", "world", "level.dat")));
});

test("assertSafeArchiveMembers: rejects traversal", async () => {
  const p = path.join(TMP, "m.zip");
  await craftZip(p, [{ name: "../../x", data: "x" }]);
  await assert.rejects(() => assertSafeArchiveMembers(p));
});

test.after(async () => { await fs.remove(TMP).catch(() => {}); });
