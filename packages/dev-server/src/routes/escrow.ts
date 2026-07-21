import { Hono } from "hono";
import { createEscrow, EscrowConfig } from "@hardkas/escrow";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import crypto from "node:crypto";

export const escrowRoutes = new Hono();

escrowRoutes.post("/compile", async (c) => {
  try {
    const config: EscrowConfig = await c.req.json();
    
    const workDir = path.join(os.tmpdir(), `hardkas-escrow-${crypto.randomBytes(4).toString("hex")}`);
    await fs.mkdir(workDir, { recursive: true });
    
    const rootDir = process.cwd();
    const silvercPath = path.join(rootDir, ".hardkas", "bin", "silverc.exe");
    const escrowSilPath = path.join(rootDir, "examples", "builder-labs", "bl-002-escrow-multisig", "escrow.sil");
    
    const result = await createEscrow(config, silvercPath, workDir, escrowSilPath);
    
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    
    return c.json({ ok: true, data: result });
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500);
  }
});
