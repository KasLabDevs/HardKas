import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import {
  Hardkas,
  applyEscrowFundingFinding,
  applyEscrowReleaseFinding,
  checkEscrowRelease,
  escrowAddressRefusal,
  escrowFundingAmount,
  escrowFundingRefusal,
  escrowRefusalBody,
  escrowRefusalError,
  escrowSignCheck,
  prepareEscrowRelease,
  type EscrowRecord
} from "../src/index.js";

// -----------------------------------------------------------------------------
// ESCROW-LIFECYCLE-1 · the escrow lifecycle's rules (moved from the dev server's routes into @hardkas/sdk, which both
// the routes and sdk.escrow call) on seeded records, and sdk.escrow's own guards: mainnet refused before anything is
// read (no connection: a counting loopback server stands where the node would be), never the simulator, records of
// this workspace only, of its network only. No node, no silverc (the compiled lifecycle is escrow-lifecycle.silverc).
// -----------------------------------------------------------------------------

const H = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const LOCK = "aa20" + H("rules p2sh") + "87";
const made: string[] = [];
let decoy: { port: number; connections: number; close(): Promise<void> };

function seed(overrides: Partial<EscrowRecord> = {}): EscrowRecord {
  return {
    id: crypto.randomUUID(),
    config: {
      buyer: { publicKeyHex: "11".repeat(32) },
      seller: { publicKeyHex: "22".repeat(32) },
      arbiter: { publicKeyHex: "33".repeat(32) },
      buyerDestinationSpk: "20" + "44".repeat(32) + "ac",
      sellerDestinationSpk: "20" + "55".repeat(32) + "ac",
      refundAmount: "100000000",
      releaseAmount: "100000000"
    },
    state: "CREATED",
    artifact: { schema_version: 1, contracts: {} } as any,
    p2shState: { lockingScriptHex: LOCK, redeemScriptHex: "aabbccdd75", address: "kaspasim:rules" },
    provenance: {} as any,
    funding: { status: "none" },
    signatures: {},
    ...overrides
  } as EscrowRecord;
}

const funded = (amount: string, extra: Partial<EscrowRecord> = {}): EscrowRecord =>
  seed({
    state: "FUNDED",
    funding: {
      status: "confirmed",
      transactionId: H("rules funding"),
      outputIndex: 0,
      amountSompi: amount,
      utxoEntry: { amount, scriptPublicKey: { version: 0, scriptPublicKey: LOCK }, blockDaaScore: "1", isCoinbase: false }
    },
    ...extra
  });

function workspace(network: string, cfg: Record<string, unknown>): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-escrow-rules-"));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify({ execution: { default: "t", targets: { t: { mode: "rpc", domain: "kaspa-l1", network } } }, ...cfg })};\n`);
  return ws;
}

async function outcome(p: Promise<unknown>): Promise<{ ok: boolean; code?: string; message?: string }> {
  try {
    await p;
    return { ok: true };
  } catch (e: any) {
    return { ok: false, code: e?.code, message: String(e?.message ?? e) };
  }
}

beforeAll(async () => {
  const server = net.createServer((s) => {
    decoy.connections++;
    s.destroy();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  decoy = {
    port: (server.address() as net.AddressInfo).port,
    connections: 0,
    close: () => new Promise<void>((r) => server.close(() => r()))
  };
});
afterAll(async () => {
  await decoy?.close();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

describe("ESCROW-LIFECYCLE-1 · the shared rules", () => {
  it("R-1 the funding amount: a legacy v1 pays its two amounts; v2 its principal or allocations plus the fee budget (default 2,000,000 sompi)", () => {
    expect(escrowFundingAmount(seed().config)).toBe(200_000_000n);
    expect(escrowFundingAmount({ ...seed().config, principal: "10000000" })).toBe(12_000_000n);
    expect(escrowFundingAmount({ ...seed().config, principal: "10000000", feeBudgetSompi: "500000" })).toBe(10_500_000n);
    expect(escrowFundingAmount({ ...seed().config, mode: "split", buyerAmount: "60000000", sellerAmount: "40000000" })).toBe(102_000_000n);
  });

  it("R-2 one funding per escrow: an unknown outcome and a funding already made are refused with the routes' 409 bodies (no code field)", () => {
    expect(escrowFundingRefusal(seed())).toBeUndefined();
    const unknown = escrowFundingRefusal(seed({ funding: { status: "verification_timeout", transactionId: H("u") } }))!;
    expect({ status: unknown.status, code: unknown.code }).toEqual({ status: 409, code: "ESCROW_FUNDING_OUTCOME_UNKNOWN" });
    expect(escrowRefusalBody(unknown)).toEqual({ ok: false, error: unknown.error });
    const done = escrowFundingRefusal(seed({ funding: { status: "broadcast", transactionId: H("b") } }))!;
    expect(done.code).toBe("ESCROW_ALREADY_FUNDED");
    // as the SDK throws it: the code on the error, the text once (never "CODE: CODE: …")
    expect(escrowRefusalError(done).code).toBe("ESCROW_ALREADY_FUNDED");
    expect(escrowRefusalError(done).message).toMatch(/^this escrow already has a funding/);
  });

  it("R-3 an active escrow at the same address is refused (409); a released one is not", () => {
    const active = seed();
    expect(escrowAddressRefusal([active], "kaspasim:rules")?.code).toBe("ESCROW_ADDRESS_ALREADY_ACTIVE");
    expect(escrowAddressRefusal([{ ...active, state: "RELEASED" }], "kaspasim:rules")).toBeUndefined();
  });

  it("R-4 prepare: not funded (400), no recorded funding UTXO (409), a fee above the ceiling, a fee of zero (ESCROW_FEE_BELOW_MINIMUM, with its code field)", () => {
    const notFunded = prepareEscrowRelease(seed(), { branch: "refundBuyer" });
    expect(notFunded).toMatchObject({ ok: false, status: 400, error: "Not funded" });
    expect(prepareEscrowRelease(undefined, { branch: "refundBuyer" })).toMatchObject({ ok: false, status: 400, error: "Not funded" });
    const noUtxo = prepareEscrowRelease(seed({ state: "FUNDED", funding: { status: "confirmed", transactionId: H("x") } }), { branch: "refundBuyer" });
    expect(noUtxo).toMatchObject({ ok: false, status: 409, code: "ESCROW_FUNDING_UTXO_UNKNOWN" });
    // legacy v1 refundBuyer pays 1 KAS; a 2 KAS funding leaves 1 KAS of fee, above the default 2,500,000-sompi ceiling
    const excessive = prepareEscrowRelease(funded("200000000"), { branch: "refundBuyer" });
    expect(excessive).toMatchObject({ ok: false, status: 400, code: "ESCROW_FEE_EXCESSIVE_REFUSED" });
    expect(escrowRefusalBody(excessive as any).code).toBeUndefined();
    const zero = prepareEscrowRelease(funded("100000000"), { branch: "refundBuyer" });
    expect(zero).toMatchObject({ ok: false, status: 400, code: "ESCROW_FEE_BELOW_MINIMUM" });
    expect(escrowRefusalBody(zero as any)).toMatchObject({ ok: false, code: "ESCROW_FEE_BELOW_MINIMUM" });
  });

  it("R-5 sign: not prepared, a role the branch does not require, no funding UTXO to sign against", () => {
    expect(escrowSignCheck(seed(), "buyer")).toMatchObject({ ok: false, status: 400, error: "Not prepared" });
    const prepared = funded("200000000", { preparedRelease: { branch: "mutualRelease", draft: {}, args: [], expectedOutputsHash: "", policyHash: "" } });
    expect(escrowSignCheck(prepared, "arbiter")).toMatchObject({ ok: false, status: 400, code: "ESCROW_ROLE_NOT_REQUIRED" });
    expect(escrowSignCheck(prepared, "buyer")).toMatchObject({ ok: true, publicKeyHex: "11".repeat(32) });
    const noUtxo = { ...prepared, funding: { ...prepared.funding, utxoEntry: undefined } };
    expect(escrowSignCheck(noUtxo, "buyer")).toMatchObject({ ok: false, status: 409, code: "ESCROW_FUNDING_UTXO_UNKNOWN" });
  });

  it("R-6 release: unknown (404), released (409), a release sent and unreconciled (409, never sent again), not ready (400)", () => {
    expect(checkEscrowRelease(undefined, "x")).toMatchObject({ ok: false, status: 404 });
    expect(checkEscrowRelease(seed({ state: "RELEASED" }), "x")).toMatchObject({ ok: false, status: 409, code: "ESCROW_ALREADY_RELEASED" });
    const pending = seed({
      state: "READY_TO_RELEASE",
      release: { transactionId: H("r"), fundingOutpoint: "", expectedOutputsHash: "", actualOutputsHash: "", status: "verification_timeout" }
    });
    expect(checkEscrowRelease(pending, "x")).toMatchObject({ ok: false, status: 409, code: "ESCROW_RELEASE_PENDING" });
    expect(checkEscrowRelease(seed({ state: "PARTIALLY_SIGNED" }), "x")).toMatchObject({ ok: false, status: 400, error: "Not ready" });
  });

  it("R-7 what a look moves a record to: mempool → broadcast (an unknown outcome only), chain → confirmed; never back", () => {
    const r = seed({ funding: { status: "verification_timeout", transactionId: H("f") } });
    applyEscrowFundingFinding(r, "mempool_entry");
    expect({ funding: r.funding.status, state: r.state }).toEqual({ funding: "broadcast", state: "FUNDED" });
    applyEscrowFundingFinding(r, "chain_accepted");
    expect(r.funding.status).toBe("confirmed");
    applyEscrowFundingFinding(r, "not_found");
    expect(r.funding.status).toBe("confirmed");
    const s = seed({ state: "READY_TO_RELEASE", release: { transactionId: H("r"), fundingOutpoint: "", expectedOutputsHash: "", actualOutputsHash: "", status: "broadcast" } });
    applyEscrowReleaseFinding(s, "finality_reached");
    expect({ release: s.release!.status, state: s.state }).toEqual({ release: "confirmed", state: "RELEASED" });
  });
});

describe("ESCROW-LIFECYCLE-1 · sdk.escrow guards", () => {
  it("G-1 a mainnet instance: every operation MAINNET_CONNECTION_DISABLED before anything is read or written; no connection", async () => {
    const ws = workspace("mainnet", { network: { allowPublic: true }, experimental: true, networks: { mainnet: { kind: "kaspa-rpc", network: "mainnet", rpcUrl: `ws://127.0.0.1:${decoy.port}` } } });
    const sdk = await Hardkas.open({ cwd: ws, network: "mainnet", policy: { allowPublic: true } });
    try {
      const id = crypto.randomUUID();
      const request: any = { schema: "hardkas.escrow.releaseRequest.v1", networkId: "mainnet" };
      for (const [what, p] of [
        ["create", sdk.escrow.create(seed().config)],
        ["fund", sdk.escrow.fund(id, { account: "alice" })],
        ["prepare", sdk.escrow.prepare(id, { branch: "mutualRelease" })],
        ["sign", sdk.escrow.sign(id, { role: "buyer", account: "alice" })],
        ["signRequest", sdk.escrow.signRequest(request, { role: "buyer", account: "alice" })],
        ["addSignatures", sdk.escrow.addSignatures(id, request)],
        ["release", sdk.escrow.release(id)],
        ["reconcile", sdk.escrow.reconcile(id)],
        ["status", sdk.escrow.status(id)]
      ] as const) {
        const r = await outcome(p);
        expect({ what, code: r.code }, r.message).toEqual({ what, code: "MAINNET_CONNECTION_DISABLED" });
      }
      expect(fs.existsSync(path.join(ws, ".hardkas", "escrows"))).toBe(false);
      expect(decoy.connections).toBe(0);
    } finally {
      await sdk.close();
    }
  });

  it("G-2 the simulator is no escrow network (ESCROW_NETWORK_NOT_SUPPORTED); an id that is not a record of this workspace is ESCROW_NOT_FOUND", async () => {
    const sim = fs.mkdtempSync(path.join(os.tmpdir(), "hk-escrow-rules-sim-"));
    made.push(sim);
    fs.writeFileSync(path.join(sim, "hardkas.config.ts"), 'export default { execution: { default: "simulator", targets: { simulator: { mode: "simulator", domain: "kaspa-l1", network: "simulated" } } } };\n');
    const s = await Hardkas.open({ cwd: sim, autoBootstrap: true });
    try {
      expect((await outcome(s.escrow.create(seed().config))).code).toBe("ESCROW_NETWORK_NOT_SUPPORTED");
    } finally {
      await s.close();
    }
    const ws = workspace("simnet", { networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: `ws://127.0.0.1:${decoy.port}` } } });
    const sdk = await Hardkas.open({ cwd: ws, network: "simnet" });
    try {
      expect((await outcome(sdk.escrow.status(crypto.randomUUID()))).code).toBe("ESCROW_NOT_FOUND");
      expect((await outcome(sdk.escrow.status("../../etc/passwd"))).code).toBe("ESCROW_NOT_FOUND");
      expect((await outcome(sdk.escrow.prepare(crypto.randomUUID(), { branch: "mutualRelease" }))).code).toBe("ESCROW_NOT_FOUND");
      expect(decoy.connections).toBe(0);
    } finally {
      await sdk.close();
    }
  });

  it("G-3 a record of another network is not signed, sent or prepared here (ESCROW_NETWORK_MISMATCH); its funding is refused before any account is resolved", async () => {
    const ws = workspace("simnet", { networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: `ws://127.0.0.1:${decoy.port}` } } });
    const record = { schema: "hardkas.escrow.record.v1", ...funded("200000000"), networkId: "devnet" };
    fs.mkdirSync(path.join(ws, ".hardkas", "escrows"), { recursive: true });
    fs.writeFileSync(path.join(ws, ".hardkas", "escrows", `${record.id}.json`), JSON.stringify(record));
    const sdk = await Hardkas.open({ cwd: ws, network: "simnet" });
    try {
      for (const p of [sdk.escrow.fund(record.id, { account: "nobody" }), sdk.escrow.prepare(record.id, { branch: "refundBuyer" }), sdk.escrow.sign(record.id, { role: "buyer", account: "nobody" }), sdk.escrow.release(record.id)]) {
        const r = await outcome(p);
        expect(r.code, r.message).toBe("ESCROW_NETWORK_MISMATCH");
      }
      expect((await sdk.escrow.status(record.id)).networkId).toBe("devnet");
      expect(decoy.connections).toBe(0);
    } finally {
      await sdk.close();
    }
  });
});
