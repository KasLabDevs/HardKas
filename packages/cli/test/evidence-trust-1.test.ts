import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Hardkas } from "@hardkas/sdk";
import { calculateContentHash, CURRENT_HASH_VERSION } from "@hardkas/artifacts";
import { cliDist, childEnv } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

// EVIDENCE-TRUST-1 (investigation, 2026-10-05) · BEFORE, real processes on the built CLI.
// - Immutability: a second `tx sign` of the same plan rewrites the stored signed artifact (same identity, new
//   createdAt), and it overwrites a stored copy that was tampered with.
// - Lineage truth: `artifact explain` verifies without the workspace and reports the receipt's parent as missing from
//   the workspace although it is in the store; `query artifacts inspect` repeats that claim.
// - Comparison truth: `query artifacts diff` leaves `lineage` (authenticated under hash version 5), `contentHash` and
//   `artifactId` out, so two artifacts with different identities are "identical"; it prints differing values raw,
//   tokens inside an rpcUrl included.
// - Presentation: the free-text mask turns the content hash in the explained file's name into "[REDACTED]".

const cli = (args: string[], cwd: string) => {
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, env: childEnv(), encoding: "utf8", timeout: 120_000 });
  return { status: r.status, stdout: r.stdout ?? "", all: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
};

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

const store = (ws: string) => path.join(ws, ".hardkas", "artifacts");
const storedSigned = (ws: string) => filesUnder(path.join(store(ws), "signed")).filter((p) => p.endsWith(".json"));
const storedReceipts = (ws: string) =>
  filesUnder(path.join(store(ws), "receipts")).filter((p) => path.basename(p).startsWith("txReceipt-"));

const sealed = (body: any) => {
  const a: any = structuredClone(body);
  delete a.contentHash;
  a.lineage = { ...(a.lineage ?? {}), artifactId: "" };
  a.contentHash = calculateContentHash(a, CURRENT_HASH_VERSION);
  a.lineage.artifactId = a.contentHash;
  return a;
};

async function newWorkspace(parent: string, name: string): Promise<string> {
  const ws = path.join(parent, name);
  fs.mkdirSync(ws, { recursive: true });
  await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
  return ws;
}

const plan = (ws: string) => {
  const r = cli(["tx", "plan", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated", "--out", "plan.json", "--json"], ws);
  expect(r.status, r.all).toBe(0);
};

const sign = (ws: string, extra: string[] = []) => {
  const r = cli(["tx", "sign", "plan.json", ...extra, "--json"], ws);
  expect(r.status, r.all).toBe(0);
  return r;
};

describe("EVIDENCE-TRUST-1 · CLI", () => {
  let parent: string;
  let pay: string; // a workspace with one simulated payment: plan → signed → receipt
  let receipt: string;
  let signed: string;

  beforeAll(async () => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-et1-cli-"));
    pay = await newWorkspace(parent, "pay");
    plan(pay);
    sign(pay, ["--out", "signed.json"]);
    const send = cli(["tx", "send", "signed.json", "--network", "simulated", "--json"], pay);
    expect(send.status, send.all).toBe(0);
    [receipt] = storedReceipts(pay);
    [signed] = storedSigned(pay);
    expect(receipt, "a stored receipt").toBeTruthy();
    expect(signed, "a stored signed artifact").toBeTruthy();
    expect(JSON.parse(fs.readFileSync(receipt!, "utf8")).lineage.parentArtifactId).toBe(JSON.parse(fs.readFileSync(signed!, "utf8")).contentHash);
  });

  afterAll(() => {
    fs.rmSync(parent, { recursive: true, force: true });
  });

  describe("a stored artifact is never rewritten", () => {
    it("a second `tx sign` of the same plan leaves the stored signed artifact's bytes as they were", async () => {
      const ws = await newWorkspace(parent, "resign");
      plan(ws);
      sign(ws);
      const [at] = storedSigned(ws);
      const bytes = fs.readFileSync(at!, "utf8");
      await new Promise((r) => setTimeout(r, 1100));
      sign(ws);
      expect(storedSigned(ws)).toEqual([at]);
      expect(fs.readFileSync(at!, "utf8")).toBe(bytes);
    });

    it("a stored signed artifact that was tampered with is not overwritten by the next `tx sign`", async () => {
      const ws = await newWorkspace(parent, "tamper");
      plan(ws);
      sign(ws);
      const [at] = storedSigned(ws);
      const tampered = JSON.parse(fs.readFileSync(at!, "utf8"));
      tampered.amountSompi = "999999999"; // contentHash unchanged: it no longer verifies
      const tamperedBytes = JSON.stringify(tampered, null, 2) + "\n";
      fs.writeFileSync(at!, tamperedBytes);
      cli(["tx", "sign", "plan.json", "--json"], ws); // refusing or not is a decision; the evidence must stay
      expect(fs.readFileSync(at!, "utf8")).toBe(tamperedBytes);
    });
  });

  describe("lineage claims match the workspace", () => {
    it("`artifact explain` of a receipt whose parent is in the store reports no PARENT_MISSING", () => {
      const r = cli(["artifact", "explain", receipt], pay);
      const lines = r.all.split(/\r?\n/).filter((l) => /PARENT_MISSING|STATUS:|SECURITY/.test(l)).map((l) => l.trim());
      expect(r.all, `exit ${r.status} · ${lines.join(" | ")}`).not.toMatch(/PARENT_MISSING/);
    });

    it("control: `artifact explain` reports PARENT_MISSING when the parent is really absent", () => {
      const ws = path.join(parent, "no-parent");
      fs.cpSync(pay, ws, { recursive: true });
      fs.rmSync(path.join(ws, path.relative(pay, signed)));
      fs.rmSync(path.join(ws, "signed.json"));
      const r = cli(["artifact", "explain", path.join(ws, path.relative(pay, receipt))], ws);
      expect(r.all).toMatch(/PARENT_MISSING/);
      expect(r.status).not.toBe(0);
    });

    it("`query artifacts inspect` of that receipt does not say its parent is missing from the workspace", () => {
      const r = cli(["query", "artifacts", "inspect", receipt, "--json"], pay);
      expect(r.status, r.all).toBe(0);
      const integrity = JSON.parse(r.stdout).result.items[0].integrity;
      const claims = (integrity.errors as string[]).filter((m) => /not found in workspace/i.test(m));
      expect(claims, `integrity.ok ${integrity.ok} · ${claims.join(" | ")}`).toEqual([]);
    });
  });

  describe("`query artifacts diff` decides on the identity", () => {
    let dir: string;
    let s1: any;
    const write = (name: string, a: unknown) => {
      const p = path.join(dir, name);
      fs.writeFileSync(p, JSON.stringify(a, null, 2) + "\n");
      return p;
    };
    const diffJson = (a: string, b: string) => {
      const r = cli(["query", "artifacts", "diff", a, b, "--json"], pay);
      expect(r.status, r.all).toBe(0);
      return JSON.parse(r.stdout).result.items[0];
    };

    beforeAll(() => {
      dir = path.join(parent, "cmp");
      fs.mkdirSync(dir, { recursive: true });
      s1 = JSON.parse(fs.readFileSync(signed, "utf8"));
    });

    it("control: an artifact and its exact copy are identical", () => {
      expect(diffJson(write("s1.json", s1), write("s1-copy.json", s1)).identical).toBe(true);
    });

    it("control: a different amount is a difference", () => {
      const s3 = sealed({ ...s1, amountSompi: "200000000" });
      expect(diffJson(write("s1.json", s1), write("s3.json", s3)).identical).toBe(false);
    });

    it("two artifacts whose lineage differs (so do their content hashes) are not identical", () => {
      const s2 = sealed({ ...s1, lineage: { ...s1.lineage, parentArtifactId: "c".repeat(64) } });
      expect(s2.contentHash, "precondition: lineage is inside the identity").not.toBe(s1.contentHash);
      const d = diffJson(write("s1.json", s1), write("s2.json", s2));
      expect(d.identical, `entries ${JSON.stringify(d.entries)}`).toBe(false);
      expect(JSON.stringify(d.entries)).toContain("lineage");
    });

    it("the human output does not call two different identities identical", () => {
      const s2 = sealed({ ...s1, lineage: { ...s1.lineage, parentArtifactId: "c".repeat(64) } });
      const r = cli(["query", "artifacts", "diff", write("s1.json", s1), write("s2.json", s2)], pay);
      expect(r.all).not.toMatch(/Artifacts are identical/);
    });

    it("a token inside a differing rpcUrl is never printed", () => {
      const submission = (token: string) => ({
        schema: "hardkas.txSubmission.v1",
        hashVersion: CURRENT_HASH_VERSION,
        networkId: "simnet",
        txId: "d".repeat(64),
        signedArtifactId: s1.contentHash,
        submitResult: { accepted: true, transactionId: "d".repeat(64) },
        rpcUrl: `http://127.0.0.1:16110/?token=${token}`,
        lineage: { ...s1.lineage, parentArtifactId: s1.contentHash, sequence: 3 }
      });
      const a = write("sub-a.json", sealed(submission("ET1TOKENAAAA")));
      const b = write("sub-b.json", sealed(submission("ET1TOKENBBBB")));
      const json = cli(["query", "artifacts", "diff", a, b, "--json"], pay);
      const human = cli(["query", "artifacts", "diff", a, b], pay);
      for (const [what, out] of [["--json", json.all], ["human", human.all]] as const) {
        const shown = out.split(/\r?\n/).filter((l) => /ET1TOKEN/.test(l)).map((l) => l.trim());
        expect(out, `${what}: ${shown.join(" | ")}`).not.toContain("ET1TOKENAAAA");
        expect(out, `${what}: ${shown.join(" | ")}`).not.toContain("ET1TOKENBBBB");
      }
    });
  });

  describe("a credential inside an RPC URL is never printed", () => {
    // Port 9 (discard) is closed: the commands fail fast without reaching any node (never the canonical localnet).
    const tokenUrl = "ws://127.0.0.1:9/?token=ET1URLTOKEN";
    const userUrl = "ws://operator:ET1URLPASS@127.0.0.1:9/";
    it.each([
      ["rpc info --json, ?token=", ["rpc", "info", "--url", tokenUrl, "--json"], "ET1URLTOKEN"],
      ["rpc info, user:password@", ["rpc", "info", "--url", userUrl], "ET1URLPASS"],
      ["rpc doctor, ?token=", ["rpc", "doctor", "--endpoints", tokenUrl], "ET1URLTOKEN"],
      ["tx plan --json, ?token=", ["tx", "plan", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simnet", "--url", tokenUrl, "--json"], "ET1URLTOKEN"]
    ])("%s", (_what, args, secret) => {
      const r = cli(args as string[], pay);
      expect(r.all, "control: the endpoint is still named").toContain("127.0.0.1:9");
      const shown = r.all.split(/\r?\n/).filter((l) => l.includes(secret as string)).map((l) => l.trim().slice(0, 160));
      expect(shown, shown.join(" | ")).toEqual([]);
    });
  });

  describe("a private key is never printed by a listing", () => {
    it("`kaspa wallet list --json` does not print a plaintext account's private key", async () => {
      const ws = await newWorkspace(parent, "wallet-list");
      const gen = cli(["accounts", "real", "generate", "--name", "leaky", "--network", "simnet", "--unsafe-plaintext", "--yes", "--json"], ws);
      expect(gen.status, gen.all).toBe(0);
      // the plaintext keys the store now holds (to look for them in the listing)
      const keys: string[] = [];
      const collect = (v: any) => {
        if (Array.isArray(v)) v.forEach(collect);
        else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) k === "privateKey" && typeof x === "string" ? keys.push(x) : collect(x);
      };
      for (const f of filesUnder(path.join(ws, ".hardkas")).filter((p) => p.endsWith(".json"))) {
        try { collect(JSON.parse(fs.readFileSync(f, "utf8"))); } catch {}
      }
      expect(keys.length, "precondition: a plaintext account exists").toBeGreaterThan(0);
      const r = cli(["kaspa", "wallet", "list", "--json"], ws);
      expect(r.status, r.all).toBe(0);
      const listed: any[] = JSON.parse(r.stdout);
      expect(listed.some((a) => String(a.name).startsWith("leaky")), "control: the account is listed").toBe(true);
      expect(listed.filter((a) => "privateKey" in a).map((a) => a.name)).toEqual([]);
      for (const k of keys) expect(r.all.includes(k), "a stored private key appears in the output").toBe(false);
    });
  });

  describe("presentation keeps public identities", () => {
    it("`artifact explain` names the file it explains (its content hash is not shown as [REDACTED])", () => {
      const r = cli(["artifact", "explain", receipt], pay);
      const header = r.all.split(/\r?\n/).find((l) => /Operational Audit/.test(l))?.trim();
      expect(r.all, `header: ${header}`).toContain(path.basename(receipt));
    });
  });
});
