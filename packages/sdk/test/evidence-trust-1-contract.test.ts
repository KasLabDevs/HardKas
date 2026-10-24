import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hardkas } from "../src/index.js";
import { calculateContentHash, CURRENT_HASH_VERSION } from "@hardkas/artifacts";
import { sendAsRpc } from "./helpers/rpc-instance.js";
import { reissueAsBroadcastable, planOfSigned, nodeNamesReceived } from "./helpers/official-signed-payload.js";


// EVIDENCE-TRUST-1 · D2 on the SDK: what a producer returns is exactly what the store holds. Signing a plan again keeps
// the stored signed artifact and returns it; `artifacts.write` reports the stored copy and whether it wrote.

// EXPECTED-TXID-1: the payload is the transaction the plan authorizes, under its official kaspa-wasm id.
function asBroadcastable(signed: any, plan: any): any {
  return reissueAsBroadcastable(signed, plan);
}

describe("EVIDENCE-TRUST-1 · SDK contract (D2)", () => {
  let ws: string;
  let sdk: Hardkas;

  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-et1-sdkc-"));
    sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("signing the same plan again returns the stored signed artifact, exactly as stored", async () => {
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
    await sdk.artifacts.write(plan);
    const first: any = await sdk.tx.sign(plan, "alice");
    await new Promise((r) => setTimeout(r, 1100));
    const again: any = await sdk.tx.sign(plan, "alice");
    expect(again.contentHash).toBe(first.contentHash);
    expect(again.createdAt).toBe(first.createdAt);
    const stored = fs
      .readdirSync(path.join(ws, ".hardkas", "artifacts", "signed"))
      .map((f) => JSON.parse(fs.readFileSync(path.join(ws, ".hardkas", "artifacts", "signed", f), "utf8")));
    expect(stored).toEqual([again]);
  });

  it("artifacts.write reports the stored copy and whether it wrote", async () => {
    const plan: any = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
    const first = await sdk.artifacts.write(plan);
    expect(first.written).toBe(true);
    const later = { ...structuredClone(first.artifact), createdAt: "2030-01-01T00:00:00.000Z" };
    const second = await sdk.artifacts.write(later);
    expect(second.written).toBe(false);
    expect(second.artifact.createdAt).toBe(plan.createdAt);
    expect(second.absolutePath).toBe(first.absolutePath);
  });

  it("a real send returns the submission exactly as stored, its locator without credentials", async () => {
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
    await sdk.artifacts.write(plan);
    const signed: any = asBroadcastable(await sdk.tx.sign(plan, "alice"), plan);
    await sdk.artifacts.write(signed);
    vi.spyOn(sdk.rpc, "submitTransaction").mockResolvedValue({ transactionId: signed.txId } as any);
    const sent: any = await sendAsRpc(sdk, signed, "https://op:ET1PASS@node.example:17110/?token=ET1TOKEN&network=testnet-10");
    const stored = JSON.parse(fs.readFileSync(sent.receiptPath, "utf8"));
    const asStored = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)));
    expect(asStored(sent.submission)).toEqual(stored);
    expect(stored.rpcUrl).toBe("https://node.example:17110/?token=REDACTED&network=testnet-10");
  });
});
