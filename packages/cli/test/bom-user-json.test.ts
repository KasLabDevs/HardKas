import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Hardkas } from "@hardkas/sdk";
import { cliDist, childEnv } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 180_000 });

// PAPERCUTS-1 · JSON files a user gives the CLI were rejected when they started with a UTF-8 BOM (what Notepad and
// PowerShell 5 write): about 75 reads parsed the raw text and only 5 stripped the BOM. A BOM is not content; the files
// below are read as the JSON they hold. Real processes on the built CLI, in a simulated workspace.

const BOM = "﻿";

const cli = (args: string[], cwd: string) => {
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, env: childEnv(), encoding: "utf8", timeout: 120_000 });
  return { status: r.status, stdout: r.stdout ?? "", all: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
};

describe("user JSON files with a BOM", () => {
  let ws: string;

  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-bom-json-"));
    await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
  });

  afterEach(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("tx batch reads a batch file that starts with a BOM", () => {
    fs.writeFileSync(path.join(ws, "batch.json"), BOM + JSON.stringify([{ from: "alice", to: "bob", amount: "1" }]));
    const r = cli(["tx", "batch", "--file", "batch.json", "--network", "simulated", "--json"], ws);
    expect(r.status, r.all).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ successCount: 1, failCount: 0 });
  });

  it("artifact verify reads an artifact file that starts with a BOM", () => {
    const planned = cli(["tx", "plan", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated", "--out", "plan.json", "--json"], ws);
    expect(planned.status, planned.all).toBe(0);
    const file = path.join(ws, "plan.json");
    fs.writeFileSync(file, BOM + fs.readFileSync(file, "utf-8"));
    const r = cli(["artifact", "verify", "plan.json", "--json"], ws);
    expect(r.status, r.all).toBe(0);
    expect(JSON.parse(r.stdout).ok, r.all).toBe(true);
  });
});
