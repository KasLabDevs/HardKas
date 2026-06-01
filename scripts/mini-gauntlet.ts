"// scripts/mini-gauntlet.ts
// Post-fix verification: 5 apps that previously FAILED should now SUCCEED.
// Uses npx hardkas from npm (same as Phase 5-B).

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = path.resolve(".");
const APPS_DIR = path.join(ROOT, "generated-apps");
const HARDKAS_BIN = "npx hardkas";

interface CmdResult {
  cmd: string; exit: number; stdout: string; stderr: string; ms: number;
}

function run(cmd: string, cwd: string): CmdResult {
  const start = Date.now();
  let stdout = "", stderr = "", exit = 0;
  try {
    stdout = execSync(cmd, {
      cwd, timeout: 90000, encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, HARDKAS_EXPERIMENTAL: "1", FORCE_COLOR: "0" },
      shell: "powershell.exe"
    }) || "";
  } catch (e: any) {
    exit = e.status ?? 1; stdout = e.stdout || ""; stderr = e.stderr || "";
  }
  return { cmd, exit, stdout, stderr, ms: Date.now() - start };
}

interface AppDef {
  id: string; name: string;
  steps: string[];
}

const APPS: AppDef[] = [
  {
    id: "FIN-01", name: "Payroll Batch",
    steps: [
      `${HARDKAS_BIN} init . --force`,
      `node -e "const fs=require('fs'); fs.writeFileSync('batch.json', JSON.stringify([{from:'alice',to:'bob',amount:'10'},{from:'alice',to:'bob',amount:'20'},{from:'alice',to:'bob',amount:'5'}],null,2))"`,
      `${HARDKAS_BIN} tx batch --file batch.json --network simulated --json`,
      `${HARDKAS_BIN} doctor --json`,
      `${HARDKAS_BIN} replay verify --json`,
    ]
  },
  {
    id: "FIN-02", name: "Escrow Plan-Sign-Send",
    steps: [
      `${HARDKAS_BIN} init . --force`,
      `${HARDKAS_BIN} tx plan --from alice --to bob --amount 100 --network simulated --json`,
      `${HARDKAS_BIN} doctor --json`,
      `${HARDKAS_BIN} replay verify --json`,
    ]
  },
  {
    id: "DOC-01", name: "Document Notarization",
    steps: [\
<truncated 4923 bytes>