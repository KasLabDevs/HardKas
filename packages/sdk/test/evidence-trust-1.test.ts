import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hardkas } from "../src/index.js";
import { calculateContentHash, CURRENT_HASH_VERSION } from "@hardkas/artifacts";

// EVIDENCE-TRUST-1 (investigation, 2026-10-05) · BEFORE, SDK level.
// - Secret boundary of persistence: a real send records the RPC locator raw in the txSubmission (`rpcUrl`), so a
//   credential carried by the URL (`?token=…`, `user:password@`) is written into the workspace's evidence.
// - Immutability: signing the same plan again rewrites the stored signed artifact (same identity, new createdAt).

/** The same re-issue as wave1-3-producers: a synthetic authorization is never broadcast, so the real-send branch is
 * exercised with the artifact re-issued as a non-synthetic signed (hex payload), re-sealed under v5. */
function asBroadcastable(signed: any): any {
  const s: any = structuredClone(signed);
  delete s.authorization;
  s.signedTransaction = { format: "hex", payload: "deadbeef" };
  s.txId = "f".repeat(64);
  delete s.contentHash;
  s.lineage = { ...s.lineage, artifactId: "" };
  s.contentHash = calculateContentHash(s, CURRENT_HASH_VERSION);
  s.lineage.artifactId = s.contentHash;
  s.signedId = `signed-${s.contentHash.slice(0, 16)}`;
  return s;
}

const filesUnder = (dir: string): string[] => {
  const out: string[] = [];
  const walk = (d: string) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(dir);
  return out;
};

/** Every file of the workspace that contains `needle`, as workspace-relative paths. */
const filesContaining = (ws: string, needle: string) =>
  filesUnder(ws)
    .filter((p) => fs.readFileSync(p).includes(needle))
    .map((p) => path.relative(ws, p).replace(/\\/g, "/"));

describe("EVIDENCE-TRUST-1 · SDK", () => {
  let ws: string;
  let sdk: Hardkas;

  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-et1-sdk-"));
    sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(ws, { recursive: true, force: true });
  });

  const realSend = async (rpcUrl: string) => {
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
    await sdk.artifacts.write(plan);
    const signed: any = asBroadcastable(await sdk.tx.sign(plan, "alice"));
    await sdk.artifacts.write(signed);
    vi.spyOn(sdk.rpc, "submitTransaction").mockResolvedValue({ transactionId: "b".repeat(64) } as any);
    const sent: any = await sdk.tx.send(signed, rpcUrl);
    expect(sent.submitted, "precondition: the real-send branch ran").toBe(true);
    expect(fs.existsSync(sent.receiptPath), "precondition: a submission was persisted").toBe(true);
    return sent;
  };

  describe("a credential inside the RPC URL never reaches the workspace's evidence", () => {
    it("control: a URL without credentials is recorded as given", async () => {
      const sent = await realSend("http://127.0.0.1:16110/");
      expect(JSON.parse(fs.readFileSync(sent.receiptPath, "utf8")).rpcUrl).toBe("http://127.0.0.1:16110/");
    });

    it("a `?token=` value is written to no file of the workspace", async () => {
      await realSend("http://127.0.0.1:16110/?token=ET1SECRETTOKEN");
      const files = filesContaining(ws, "ET1SECRETTOKEN");
      expect(files, files.join(", ")).toEqual([]);
    });

    it("a password in the URL's userinfo is written to no file of the workspace", async () => {
      await realSend("http://operator:ET1HUNTER2@127.0.0.1:16110/");
      const files = filesContaining(ws, "ET1HUNTER2");
      expect(files, files.join(", ")).toEqual([]);
    });

    it("the submission the SDK returns does not carry the token either", async () => {
      const sent = await realSend("http://127.0.0.1:16110/?token=ET1SECRETTOKEN");
      expect(JSON.stringify(sent.submission)).not.toContain("ET1SECRETTOKEN");
    });

    it("a submit that fails with the RPC layer's own message does not record the token in the authenticated submit result", async () => {
      // The message format of kaspa-rpc/src/upstream/session.ts:155 (`Connection to Kaspa RPC at ${this.url} was lost`),
      // where this.url = toWrpcUrl(url) keeps the userinfo and the query string.
      const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
      await sdk.artifacts.write(plan);
      const signed: any = asBroadcastable(await sdk.tx.sign(plan, "alice"));
      await sdk.artifacts.write(signed);
      vi.spyOn(sdk.rpc, "submitTransaction").mockRejectedValue(
        new Error("Connection to Kaspa RPC at ws://127.0.0.1:16110/?token=ET1SECRETTOKEN was lost: socket closed")
      );
      const sent: any = await sdk.tx.send(signed, "http://127.0.0.1:16110/?token=ET1SECRETTOKEN");
      expect(sent.submitted, "precondition: a rejected submit").toBe(false);
      const stored = JSON.parse(fs.readFileSync(sent.receiptPath, "utf8"));
      expect(stored.submitResult.error, "precondition: the node's answer is recorded").toContain("was lost");
      // submitResult is authenticated: a credential recorded there cannot be removed later without breaking the identity.
      expect(calculateContentHash({ ...stored, submitResult: { accepted: false } }, CURRENT_HASH_VERSION)).not.toBe(stored.contentHash);
      expect(JSON.stringify(stored.submitResult)).not.toContain("ET1SECRETTOKEN");
    });
  });

  describe("a stored artifact is never rewritten", () => {
    it("signing the same plan again leaves the stored signed artifact's bytes as they were", async () => {
      const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
      await sdk.artifacts.write(plan);
      const first: any = await sdk.tx.sign(plan, "alice");
      const at = filesUnder(path.join(ws, ".hardkas", "artifacts", "signed")).find((p) => p.includes(first.contentHash));
      expect(at, "precondition: the signed artifact is stored under its identity").toBeTruthy();
      const bytes = fs.readFileSync(at!, "utf8");
      await new Promise((r) => setTimeout(r, 1100));
      const again: any = await sdk.tx.sign(plan, "alice");
      expect(again.contentHash, "precondition: same identity").toBe(first.contentHash);
      expect(fs.readFileSync(at!, "utf8")).toBe(bytes);
    });
  });
});
