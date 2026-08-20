import catalogJson from "../../software.json";

export type SoftwareFamily = "minecraft" | "proxy" | "bedrock" | "game" | "app";

export interface SoftwareType {
  id: string;
  family: SoftwareFamily;
  name: string;
  description: string;
  defaultPort: number;
  defaultImage: string;
  defaultStartup: string;
  features: {
    worlds: boolean;
    plugins: boolean;
    mods: boolean;
    properties: boolean;
    rcon: boolean;
    eula: boolean;
  };
}

export const SOFTWARE_TYPES: SoftwareType[] = (catalogJson as { types: SoftwareType[] }).types;

const byId = new Map(SOFTWARE_TYPES.map((t) => [t.id.toLowerCase(), t]));

export function getSoftware(id: string | undefined): SoftwareType | undefined {
  if (!id) return undefined;
  return byId.get(String(id).toLowerCase());
}

export function isKnownSoftware(id: string | undefined): boolean {
  return !!getSoftware(id);
}

export function isMcFamily(id: string | undefined): boolean {
  const t = getSoftware(id);
  return t?.family === "minecraft" || t?.family === "proxy" || t?.family === "bedrock";
}
