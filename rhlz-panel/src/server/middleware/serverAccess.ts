import { Request, Response, NextFunction } from "express";
import { readJSON } from "../services/db.js";

export interface ServerRecord {
  id: string;
  name?: string;
  owner?: string;
  subUsers?: Array<{ userId: string; permissions?: string[] }>;
  [key: string]: any;
}

/**
 * Server-scope check shared by the HTTP middleware and the socket.io layer.
 * Grants access to:
 *  - admin / owner roles
 *  - the server's owner
 *  - users explicitly listed in the server's subUsers
 */
export function canAccessServer(user: any, server: ServerRecord | null | undefined): boolean {
  if (!user || !server) return false;
  if (user.role === "admin" || user.role === "owner") return true;
  if (server.owner === user.id) return true;
  if (Array.isArray(server.subUsers)) {
    return server.subUsers.some((su) => su && su.userId === user.id);
  }
  return false;
}

/**
 * Guard for every /api/servers/:id/* route:
 *  - the server must exist (404 otherwise),
 *  - the caller must be admin/owner, the server owner, or a listed sub-user
 *    (403 otherwise),
 *  - server ids are panel-generated UUIDs; anything else is treated as 404.
 * Attaches the resolved server record to req.server so controllers don't
 * re-read it.
 */
export const requireServerAccess = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;

    if (!id || !/^[A-Za-z0-9-]{1,64}$/.test(id)) {
      return res.status(404).json({ error: "Server not found" });
    }

    const servers = (await readJSON("servers.json")) || [];
    const server = servers.find((s: any) => s.id === id);
    if (!server) {
      return res.status(404).json({ error: "Server not found" });
    }

    if (!canAccessServer(user, server)) {
      return res.status(403).json({ error: "Forbidden: you do not have access to this server" });
    }

    (req as any).server = server;
    next();
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
};
