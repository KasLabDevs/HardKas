import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Hardkas } from "@hardkas/sdk";
import { calculateContentHash, CURRENT_HASH_VERSION } from "@hardkas/artifacts";
import { cliDist, childEnv } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

// EVIDENCE-TRUST-1 · the contract chosen after the BEFORE, on the built CLI:
// - D1/D2: signing the same plan again returns (and prints) the stored copy; a stored copy that was changed makes the
//   write fail with ARTIFACT_IDENTITY_CONFLICT;
// - D3: `artifact lineage` walks the chain in the workspace store and says LINEAGE_INCOMPLETE when it cannot;
//   `artifact explain` says what looking the parent up found;
// - D4: `query artifacts diff` reports every raw difference with `authenticated`, plus `sameIdentity`;
// - D9: `config show --json` / `config networks` reveal no secret written into the configuration.

const cli = (args: string[], cwd: string) => {
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, env: childEnv(), encoding: "utf8", timeout: 120_000 });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", all: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
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

const planIn = (ws: string) => {
  const r = cli(["tx", "plan", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated", "--out", "plan.json", "--json"], ws);
  expect(r.status, r.all).toBe(0);
};

describe("EVIDENCE-TRUST-1 · CLI contract", () => {
  let parent: string;
  beforeAll(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-et1-clic-"));
  });
  afterAll(() => {
    fs.rmSync(parent, { recursive: true, force: true });
  });

  it("D2 · a second `tx sign` prints the stored signed artifact (the first createdAt), byte-identical to the store", async () => {
    const ws = await newWorkspace(parent, "resign");
    planIn(ws);
    const first = cli(["tx", "sign", "plan.json", "--json"], ws);
    expect(first.status, first.all).toBe(0);
    await new Promise((r) => setTimeout(r, 1100));
    const second = cli(["tx", "sign", "plan.json", "--out", "again.json", "--json"], ws);
    expect(second.status, second.all).toBe(0);
    const a = JSON.parse(first.stdout);
    const b = JSON.parse(second.stdout);
    expect(b.contentHash).toBe(a.contentHash);
    expect(b.createdAt).toBe(a.createdAt);
    const [stored] = filesUnder(path.join(ws, ".hardkas", "artifacts", "signed"));
    expect(JSON.parse(fs.readFileSync(stored!, "utf8"))).toEqual(b);
    expect(JSON.parse(fs.readFileSync(path.join(ws, "again.json"), "utf8")).createdAt).toBe(a.createdAt);
  });

  it("D1 · signing over a stored copy that was changed fails with ARTIFACT_IDENTITY_CONFLICT and leaves it as it is", async () => {
    const ws = await newWorkspace(parent, "tamper");
    planIn(ws);
    expect(cli(["tx", "sign", "plan.json", "--json"], ws).status).toBe(0);
    const [stored] = filesUnder(path.join(ws, ".hardkas", "artifacts", "signed"));
    const tampered = { ...JSON.parse(fs.readFileSync(stored!, "utf8")), amountSompi: "999999999" };
    fs.writeFileSync(stored!, JSON.stringify(tampered, null, 2) + "\n");
    const before = fs.readFileSync(stored!);
    const r = cli(["tx", "sign", "plan.json", "--json"], ws);
    expect(r.status, r.all).not.toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: false, code: "ARTIFACT_IDENTITY_CONFLICT" });
    expect(fs.readFileSync(stored!).equals(before)).toBe(true);
  });

  describe("lineage and diff over one simulated payment", () => {
    let ws: string;
    let receipt: string;
    let signedPath: string;
    beforeAll(async () => {
      ws = await newWorkspace(parent, "pay");
      planIn(ws);
      expect(cli(["tx", "sign", "plan.json", "--out", "signed.json", "--json"], ws).status).toBe(0);
      expect(cli(["tx", "send", "signed.json", "--network", "simulated", "--json"], ws).status).toBe(0);
      receipt = filesUnder(path.join(ws, ".hardkas", "artifacts", "receipts")).find((p) => path.basename(p).startsWith("txReceipt-"))!;
      [signedPath] = filesUnder(path.join(ws, ".hardkas", "artifacts", "signed"));
    });

    it("D3 · `artifact lineage` resolves receipt → signed → plan and only then says Operational Provenance Complete", () => {
      const r = cli(["artifact", "lineage", receipt, "--json"], ws);
      expect(r.status, r.all).toBe(0);
      const env = JSON.parse(r.stdout);
      expect(env.result.complete).toBe(true);
      expect(env.result.chain.map((c: any) => [c.role, c.status])).toEqual([
        ["root", "resolved"],
        ["parent", "resolved"],
        ["here", "here"]
      ]);
      expect(cli(["artifact", "lineage", receipt], ws).all).toContain("Operational Provenance Complete");
    });

    it("D3 · with the parent gone, `artifact lineage` is LINEAGE_INCOMPLETE (exit 1) and never claims completeness", () => {
      const copy = path.join(parent, "pay-no-parent");
      fs.cpSync(ws, copy, { recursive: true });
      fs.rmSync(path.join(copy, path.relative(ws, signedPath)));
      const target = path.join(copy, path.relative(ws, receipt));
      const r = cli(["artifact", "lineage", target, "--json"], copy);
      expect(r.status, r.all).toBe(1);
      const env = JSON.parse(r.stdout);
      expect(env).toMatchObject({ ok: false, code: "LINEAGE_INCOMPLETE" });
      expect(env.result.complete).toBe(false);
      expect(env.result.chain[0]).toMatchObject({ role: "parent", status: "missing" });
      const human = cli(["artifact", "lineage", target], copy);
      expect(human.all).not.toContain("Operational Provenance Complete");
      expect(human.all).toContain("MISSING");
    });

    it("D3 · `artifact explain` says the parent was resolved in the workspace store", () => {
      const r = cli(["artifact", "explain", receipt], ws);
      expect(r.status, r.all).toBe(0);
      expect(r.all).toMatch(/Parent:\s+resolved/);
    });

    it("D4 · a lineage-only difference: not identical, not the same identity, the entry is authenticated", () => {
      const s1 = JSON.parse(fs.readFileSync(signedPath, "utf8"));
      const s2 = sealed({ ...s1, lineage: { ...s1.lineage, parentArtifactId: "c".repeat(64) } });
      fs.writeFileSync(path.join(ws, "s1.json"), JSON.stringify(s1));
      fs.writeFileSync(path.join(ws, "s2.json"), JSON.stringify(s2));
      const d = JSON.parse(cli(["query", "artifacts", "diff", "s1.json", "s2.json", "--json"], ws).stdout).result.items[0];
      expect(d.identical).toBe(false);
      expect(d.sameIdentity).toBe(false);
      expect(d.leftIdentity).toBe(s1.contentHash);
      expect(d.rightIdentity).toBe(s2.contentHash);
      const entry = d.entries.find((e: any) => e.field === "lineage.parentArtifactId");
      expect(entry).toMatchObject({ kind: "value-change", authenticated: true });
    });

    it("D4 · a createdAt-only difference: not identical but the same identity; the entry is not authenticated", () => {
      const s1 = JSON.parse(fs.readFileSync(signedPath, "utf8"));
      const s3 = { ...s1, createdAt: "2030-01-01T00:00:00.000Z" };
      fs.writeFileSync(path.join(ws, "s1.json"), JSON.stringify(s1));
      fs.writeFileSync(path.join(ws, "s3.json"), JSON.stringify(s3));
      const d = JSON.parse(cli(["query", "artifacts", "diff", "s1.json", "s3.json", "--json"], ws).stdout).result.items[0];
      expect(d.identical).toBe(false);
      expect(d.sameIdentity).toBe(true);
      expect(d.entries).toEqual([
        expect.objectContaining({ field: "createdAt", kind: "value-change", authenticated: false })
      ]);
      const human = cli(["query", "artifacts", "diff", "s1.json", "s3.json"], ws).all;
      expect(human).toContain("Identity: same");
      expect(human).toContain("not authenticated");
    });
  });

  it("D9 · `config show --json` and `config networks` reveal no secret written into the configuration", async () => {
    const ws = await newWorkspace(parent, "config");
    fs.writeFileSync(
      path.join(ws, "hardkas.config.ts"),
      [
        "export default {",
        "  networks: {",
        '    provider: { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: "wss://op:ET1CFGPASS@node.example:17110/?apiKey=ET1CFGKEY&network=testnet-10" }',
        "  },",
        "  accounts: {",
        '    inline: { kind: "kaspa-private-key", privateKeyEnv: "INLINE_KEY", privateKey: "ET1CFGPRIVATE" }',
        "  }",
        "};",
        ""
      ].join("\n")
    );
    const show = cli(["config", "show", "--json"], ws);
    expect(show.status, show.all).toBe(0);
    for (const secret of ["ET1CFGPASS", "ET1CFGKEY", "ET1CFGPRIVATE"]) expect(show.all, secret).not.toContain(secret);
    const result = JSON.parse(show.stdout).result;
    expect(result.config.accounts.inline.privateKey).toBe("[REDACTED]");
    expect(result.config.accounts.inline.privateKeyEnv).toBe("INLINE_KEY");
    expect(result.config.networks.provider.rpcUrl).toBe("wss://node.example:17110/?apiKey=REDACTED&network=testnet-10");
    const networks = cli(["config", "networks"], ws);
    expect(networks.status, networks.all).toBe(0);
    for (const secret of ["ET1CFGPASS", "ET1CFGKEY"]) expect(networks.all, secret).not.toContain(secret);
    expect(networks.all).toContain("node.example:17110");
  });
});
