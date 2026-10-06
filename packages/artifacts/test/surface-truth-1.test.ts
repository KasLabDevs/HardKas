import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { saveIgraTxReceiptArtifact } from "../src/igra-io.js";
import { ARTIFACT_SCHEMAS, HARDKAS_VERSION } from "../src/constants.js";

// SURFACE-TRUTH-1 (investigation, 2026-10-06, base 7e7cf630f) · BEFORE on the public Igra receipt writer
// (`@hardkas/artifacts` exports it): the L1 writers persist `rpcUrl` through `redactUrlCredentials` (EVIDENCE-TRUST-1,
// the URL secret boundary), this one writes the URL as given, credentials included.

describe("SURFACE-TRUTH-1 · BEFORE · Igra receipts and the URL secret boundary", () => {
  const dirs: string[] = [];
  const save = async (rpcUrl: string) => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "hk-st1-igra-"));
    dirs.push(cwd);
    const file = await saveIgraTxReceiptArtifact(
      {
        schema: ARTIFACT_SCHEMAS.IGRA_TX_RECEIPT,
        hardkasVersion: HARDKAS_VERSION,
        networkId: "igra",
        mode: "l2-rpc",
        createdAt: "2026-10-06T00:00:00.000Z",
        txHash: "0x" + "a".repeat(64),
        l2Network: "igra",
        chainId: 19416,
        rpcUrl,
        status: "submitted"
      } as any,
      { cwd }
    );
    return fs.readFileSync(file, "utf8");
  };

  afterAll(() => {
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  });

  it("control: a public RPC URL is kept as written", async () => {
    expect(await save("http://127.0.0.1:8545/rpc")).toContain("http://127.0.0.1:8545/rpc");
  });

  it("the persisted receipt carries no URL credentials (userinfo, secret query parameters)", async () => {
    const written = await save("http://dev:s3cret-pass@127.0.0.1:8545/rpc?token=t0ken-value&chain=igra");
    expect({ password: written.includes("s3cret-pass"), token: written.includes("t0ken-value") }).toEqual({ password: false, token: false });
  });
});
