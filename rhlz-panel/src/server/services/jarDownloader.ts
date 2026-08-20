import fs from "fs-extra";
import path from "path";
import axios from "axios";
import { pipeline } from "stream/promises";
import { assertSafeDownloadUrl } from "../utils/ssrf.js";

const DEFAULT_HEADERS = {
  "User-Agent": "RHLZPanel/3.1.0 (https://github.com/NggKhaiz/RHLZ-PANEL)",
  Accept: "*/*",
};

const pipeDownloadToFile = async (url: string, tempPath: string): Promise<boolean> => {
  const ssrf = await assertSafeDownloadUrl(url);
  if (!ssrf.ok) return false;
  try {
    const response = await axios({
      method: "GET",
      url,
      responseType: "stream",
      headers: DEFAULT_HEADERS,
      timeout: 60000,
      maxRedirects: 8,
    });
    if (response.status !== 200) return false;
    const writer = fs.createWriteStream(tempPath);
    await pipeline(response.data, writer);
    const stat = await fs.stat(tempPath);
    if (stat.size > 500 * 1024) return true;
    await fs.remove(tempPath).catch(() => {});
    return false;
  } catch {
    await fs.remove(tempPath).catch(() => {});
    return false;
  }
};

async function paperFill(project: string, version: string): Promise<string[]> {
  const urls: string[] = [];
  try {
    const paperMeta = await axios.get(
      `https://fill.papermc.io/v3/projects/${project}/versions/${version}/builds/latest`,
      { headers: DEFAULT_HEADERS, timeout: 8000 }
    );
    const dlUrl = paperMeta.data?.downloads?.["server:default"]?.url || paperMeta.data?.downloads?.application?.url;
    if (dlUrl) urls.push(dlUrl);
  } catch {}
  try {
    const buildsList = await axios.get(
      `https://fill.papermc.io/v3/projects/${project}/versions/${version}/builds`,
      { headers: DEFAULT_HEADERS, timeout: 8000 }
    );
    if (Array.isArray(buildsList.data) && buildsList.data.length > 0) {
      const latestBuild = buildsList.data[0];
      const dlUrl = latestBuild?.downloads?.["server:default"]?.url || latestBuild?.downloads?.application?.url;
      if (dlUrl) urls.push(dlUrl);
    }
  } catch {}
  return urls;
}

async function latestFillVersion(project: string): Promise<string | null> {
  try {
    const res = await axios.get(`https://fill.papermc.io/v3/projects/${project}`, {
      headers: DEFAULT_HEADERS,
      timeout: 8000,
    });
    const versions = res.data?.versions;
    if (Array.isArray(versions) && versions.length) return String(versions[versions.length - 1]);
  } catch {}
  return null;
}

export const downloadJar = async (type: string, version: string, destPath: string): Promise<void> => {
  const normType = (type || "paper").toLowerCase().trim();
  let normVersion = (version || "latest").trim();
  if (normVersion === "latest" || normVersion === "" || normVersion === "default") {
    normVersion = "1.21.1";
  }

  const tempPath = `${destPath}.tmp.${Date.now()}`;
  const urls: string[] = [];

  if (normType === "bungeecord") {
    urls.push(
      "https://ci.md-5.net/job/BungeeCord/lastSuccessfulBuild/artifact/bootstrap/target/BungeeCord.jar"
    );
  } else if (normType === "waterfall") {
    urls.push(...(await paperFill("waterfall", "latest")).concat(await paperFill("waterfall", normVersion)));
  } else if (normType === "velocity") {
    const ver = (await latestFillVersion("velocity")) || normVersion;
    urls.push(...(await paperFill("velocity", ver)));
  } else if (normType === "purpur") {
    urls.push(`https://api.purpurmc.org/v2/purpur/${normVersion}/latest/download`);
  } else if (normType === "folia") {
    urls.push(...(await paperFill("folia", normVersion)));
  } else if (normType === "quilt") {
    try {
      const meta = await axios.get(`https://meta.quiltmc.org/v3/versions/loader/${normVersion}`, {
        headers: DEFAULT_HEADERS,
        timeout: 10000,
      });
      const loader = Array.isArray(meta.data) && meta.data[0]?.loader?.version;
      if (loader) {
        urls.push(`https://meta.quiltmc.org/v3/versions/loader/${normVersion}/${loader}/profile/json`);
      }
    } catch {}
    urls.push(...(await paperFill("paper", normVersion)));
  } else if (normType === "neoforge") {
    urls.push(`https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml`);
    urls.push(...(await paperFill("paper", normVersion)));
  } else if (normType === "forge") {
    const forgePromoVer =
      normVersion === "1.20.1" ? "47.3.0" : normVersion === "1.19.2" ? "43.3.0" : "latest";
    if (forgePromoVer !== "latest") {
      urls.push(
        `https://maven.minecraftforge.net/net/minecraftforge/forge/${normVersion}-${forgePromoVer}/forge-${normVersion}-${forgePromoVer}-installer.jar`
      );
    }
  } else if (normType === "fabric") {
    try {
      const metaRes = await axios.get(`https://meta.fabricmc.net/v2/versions/loader/${normVersion}`, {
        headers: DEFAULT_HEADERS,
        timeout: 10000,
      });
      if (Array.isArray(metaRes.data) && metaRes.data.length > 0) {
        const loaderVer = metaRes.data[0].loader?.version || "0.16.10";
        urls.push(`https://meta.fabricmc.net/v2/versions/loader/${normVersion}/${loaderVer}/1.0.1/server/jar`);
      }
    } catch {
      urls.push(`https://meta.fabricmc.net/v2/versions/loader/${normVersion}/0.16.10/1.0.1/server/jar`);
    }
  } else if (normType === "vanilla") {
    try {
      const manifestRes = await axios.get("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json", {
        headers: DEFAULT_HEADERS,
        timeout: 8000,
      });
      const versionsList = manifestRes.data?.versions;
      if (Array.isArray(versionsList)) {
        const targetEntry = versionsList.find((v: any) => v.id === normVersion) || versionsList.find((v: any) => v.id === "1.21.1");
        if (targetEntry?.url) {
          const versionPackage = await axios.get(targetEntry.url, { headers: DEFAULT_HEADERS, timeout: 8000 });
          const serverUrl = versionPackage.data?.downloads?.server?.url;
          if (serverUrl) urls.push(serverUrl);
        }
      }
    } catch {}
  } else if (normType === "spigot" || normType === "bukkit") {
    urls.push(`https://download.getbukkit.org/spigot/spigot-${normVersion}.jar`);
  } else if (normType === "mohist" || normType === "arclight") {
    urls.push(...(await paperFill("paper", normVersion)));
  } else if (normType === "custom") {
    throw new Error("Custom type requires an uploaded server.jar");
  } else {
    urls.push(...(await paperFill("paper", normVersion)));
  }

  let success = false;
  let lastErr = "";
  for (const candidateUrl of urls) {
    if (!candidateUrl.startsWith("http")) continue;
    try {
      const ok = await pipeDownloadToFile(candidateUrl, tempPath);
      if (ok) {
        await fs.ensureDir(path.dirname(destPath));
        await fs.move(tempPath, destPath, { overwrite: true });
        await fs.chmod(destPath, 0o640).catch(() => {});
        success = true;
        break;
      }
    } catch (err: any) {
      lastErr = err?.message || String(err);
    }
  }

  if (!success) {
    await fs.remove(tempPath).catch(() => {});
    throw new Error(`Failed to download server JAR for ${normType} ${normVersion}. ${lastErr || "All download mirrors failed"}`);
  }
};
