import { Request, Response } from "express";
import { runCode, normalizeLang, SANDBOX_LANGS } from "../services/runSandbox.js";
import { audit } from "../services/audit.js";

/** POST /api/run — execute guest source in the jailed sandbox. */
export const runGuestCode = async (req: Request, res: Response) => {
  try {
    const { lang, code } = req.body;
    if (typeof code !== "string" || code.length === 0) {
      return res.status(400).json({ error: "code is required" });
    }
    if (code.length > 256 * 1024) {
      return res.status(400).json({ error: "code is too large (max 256 KB)" });
    }
    if (!normalizeLang(lang)) {
      return res.status(400).json({
        error: `Unsupported language: ${lang}`,
        supported: SANDBOX_LANGS,
      });
    }

    const result = await runCode({
      lang: String(lang),
      code,
      timeoutMs: Number(req.body.timeoutMs) || undefined,
      memoryMB: Number(req.body.memoryMB) || undefined,
    });

    if (!result.ok && result.stderr.startsWith("Runtime not installed")) {
      return res.status(501).json({
        error: result.stderr,
        hint: "Install the host toolchain for this language, or use the Docker runtime.",
      });
    }
    if (!result.ok && result.stderr.startsWith("Blocked:")) {
      void audit("sandbox.blocked", { by: (req as any).user?.id, lang: String(lang) });
      return res.status(400).json({ error: result.stderr });
    }
    if (!result.ok && result.stderr.startsWith("Unsupported language")) {
      return res.status(400).json({ error: result.stderr });
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Sandbox execution failed" });
  }
};
