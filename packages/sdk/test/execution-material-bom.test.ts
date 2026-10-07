import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { storeEntryFor } from "@hardkas/artifacts";
import { Hardkas } from "../src/index.js";

vi.setConfig({ testTimeout: 60_000 });

// PAPERCUTS-1 · before a simulated execution commits, the SDK reads back the executed artifact and its plan from their
// store paths (SIMULATOR-DURABLE-EXECUTION-1). That read parsed the raw text, so a copy that starts with a UTF-8 BOM (a
// file put there by hand, or by a tool that writes one) made the execution fail with a JSON SyntaxError. A BOM is not
// content: the copy is checked as the artifact it holds.

describe("simulated execution · a stored copy with a BOM is the same artifact", () => {
  let ws: string;
  let sdk: Hardkas;

  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-exec-bom-"));
    sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
  });

  afterEach(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("a plan stored with a BOM is accepted as its identity and the execution commits", async () => {
    const plan = await sdk.tx.plan({ from: "kaspa:sim_alice", to: "kaspa:sim_bob", amount: "1" });
    await sdk.artifacts.write(plan);
    const at = path.join(ws, ".hardkas", "artifacts", storeEntryFor(plan).rel);
    fs.writeFileSync(at, "﻿" + fs.readFileSync(at, "utf-8"));
    const signed = await sdk.tx.sign(plan, "kaspa:sim_alice", { persist: false });
    const receipt: any = await sdk.tx.simulate(signed);
    expect(receipt?.status ?? receipt?.receipt?.status, JSON.stringify(receipt)?.slice(0, 300)).toBeDefined();
    expect(fs.readFileSync(at, "utf-8").startsWith("﻿"), "the stored copy is left as it was").toBe(true);
  });
});
