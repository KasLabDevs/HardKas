import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { fundTestAccount, getHardkasFixtureKey, mineBlocks, startIsolatedSimnet, stopIsolatedSimnet, waitForUtxo, type IsolatedSimnetSession } from "@hardkas/testing";
import { kcc20TransferWitness, kccHex, loadManagedKaspaWasmSync, silverSigFromInputSignature } from "@hardkas/core";
import { buildV1WasmTransaction } from "@hardkas/accounts";
import { Hardkas } from "@hardkas/sdk";
import { cliDist } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 600_000, hookTimeout: 900_000 });

// -----------------------------------------------------------------------------
// R3-A3 · KCC-20 tokens on a real rusty-kaspad v2.1.0 (the isolated simnet harness's own container), through
// `hardkas kcc20 deploy | transfer | balance` (the built CLI, each command its own process) and the SDK they run on
// (sdk.kcc20, the v1 engine of sdk.covenants). The token program is the linked reference implementation
// (argent-lang/kcc20-reference @ 27f8403f, KCC20.sil) compiled by `hardkas silver compile` (the pinned silverc).
//
// - deploy: one genesis, the initial holder's token output bound to the covenant id the engine computed;
// - transfer to two holders (bob, carol) with the change back to the sender, then a transfer whose inputs are a leader
//   and a delegator (transfer_delegator), each accepted, mined, its outputs listed with the covenant id;
// - a transfer the KCC-20 rules reject: refused locally before anything is signed (CLI: five outputs, max 3; SDK:
//   amounts not conserved, before any key is read), and the same non-conserving shape, built by the engine without the
//   KCC-20 check, refused by the node (the program ran and returned false), the input left unspent;
// - balances read back from the node.
// Needs HARDKAS_TEST_KCC20_REFERENCE (the reference checkout; never fetched): without it the suite FAILS
// (KCC20_REFERENCE_MISSING); HARDKAS_TEST_SKIP_KCC20_REFERENCE=1 skips it explicitly. Docker (the harness), HARDKAS_HOME
// with silverc and kaspa-wasm, and the built CLI (packages/cli/dist).
// -----------------------------------------------------------------------------

const REF = process.env.HARDKAS_TEST_KCC20_REFERENCE ?? "";
const SKIP_REF = process.env.HARDKAS_TEST_SKIP_KCC20_REFERENCE === "1";
const SIL_SHA256 = "9c61d62a1b90ad541bbf5c48ec53faaff1826cbc6f26bd42fa429df5c295316c";
const ENV = { alice: "HK_R3_KCC_ALICE_KEY", bob: "HK_R3_KCC_BOB_KEY", carol: "HK_R3_KCC_CAROL_KEY" } as const;

let session: IsolatedSimnetSession;
let parent = "";
let ws = "";
let k: any;
const keys: Record<string, string> = {};
const addr: Record<string, string> = {};
const xonly: Record<string, string> = {};
const trace: any[] = [];

interface Run {
  code: number | null;
  stdout: string;
  stderr: string;
  json: any;
}

const jsonDocs = (s: string) =>
  s
    .trim()
    .split(/\r?\n(?=\{)/)
    .map((chunk) => {
      try {
        return JSON.parse(chunk);
      } catch {
        return undefined;
      }
    })
    .filter((d) => d !== undefined);

function hk(args: string[], cwd = ws): Promise<Run> {
  return new Promise((resolve) => {
    const env = { ...process.env, NO_COLOR: "1", [ENV.alice]: keys.alice!, [ENV.bob]: keys.bob!, [ENV.carol]: keys.carol! };
    const child = spawn(process.execPath, [cliDist, ...args], { cwd, env, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => {
      const docs = jsonDocs(stdout);
      const run = { code, stdout, stderr, json: docs[docs.length - 1] };
      trace.push({ args, code, json: run.json, stderr: stderr.slice(0, 1500) });
      resolve(run);
    });
    child.stdin.end();
  });
}

const brief = (r: Run) => `exit ${r.code}\n${r.stdout.slice(0, 4000)}\n${r.stderr.slice(0, 2000)}`;
const errorCode = (r: Run) => (r.json?.ok === false ? r.json.code : r.json?.error?.code ?? r.json?.code);
const op = (s: string) => ({ transactionId: s.split(":")[0]!, index: Number(s.split(":")[1]) });
/** JSON with every bigint as its decimal digits. */
const big = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x), 2);

async function confirm(address: string, outpoint: { transactionId: string; index: number }) {
  for (let round = 0; round < 8; round++) {
    await mineBlocks(session, 1);
    try {
      return await waitForUtxo(session, address, outpoint, 5_000);
    } catch {
      /* not yet in a block */
    }
  }
  throw new Error(`NOT_CONFIRMED: ${outpoint.transactionId}:${outpoint.index} at ${address}`);
}

const unspent = async (address: string, outpoint: string) => (await session.rpc.getUtxosByAddress(address)).some((u: any) => `${String(u.outpoint.transactionId).toLowerCase()}:${u.outpoint.index}` === outpoint);

let record = "";
let recordRef: { contentHash: string; artifactSha256: string; path: string };
const ZERO32 = new Array(32).fill(0);
const ZERO_CTOR = [
  { kind: "bytes", value: ZERO32 },
  { kind: "int", value: 0 },
  { kind: "bytes", value: ZERO32 },
  { kind: "byte", value: 0 },
  { kind: "byte", value: 0 },
  { kind: "bytes", value: ZERO32 },
  { kind: "bytes", value: ZERO32 }
];

describe.skipIf(SKIP_REF)("R3-A3 · `hardkas kcc20 deploy | transfer | balance` with the reference KCC-20 program on a real rusty-kaspad (simnet harness)", () => {
  beforeAll(async () => {
    if (REF === "") {
      throw new Error(
        "KCC20_REFERENCE_MISSING: set HARDKAS_TEST_KCC20_REFERENCE to a checkout of argent-lang/kcc20-reference @ 27f8403f " +
          "(or HARDKAS_TEST_SKIP_KCC20_REFERENCE=1 to skip this suite explicitly)"
      );
    }
    const sil = fs.readFileSync(path.join(REF, "fixtures", "public-mint", "sil", "KCC20.sil"));
    const crlf = sil.includes("\r\n") ? " (its line endings were converted to CRLF: check the reference out with core.autocrlf=false)" : "";
    expect(createHash("sha256").update(sil).digest("hex"), `KCC20.sil is the pinned reference file${crlf}`).toBe(SIL_SHA256);
    k = loadManagedKaspaWasmSync();
    session = await startIsolatedSimnet({ minerFixture: "alice" });
    expect(session.containerName).not.toBe("hardkas-kaspad-toccata-v2");
    keys.alice = session.minerPrivateKey;
    keys.bob = getHardkasFixtureKey("bob");
    keys.carol = getHardkasFixtureKey("carol");
    for (const n of ["alice", "bob", "carol"]) {
      const p = new k.PrivateKey(keys[n]!);
      addr[n] = String(p.toPublicKey().toAddress("simnet").toString());
      xonly[n] = String(p.toPublicKey().toXOnlyPublicKey().toString()).toLowerCase();
    }
    expect(addr.alice).toBe(session.minerAddress);
    await fundTestAccount(session, session.minerAddress, 1_000_000_000n);
    await mineBlocks(session, 20);
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-r3-kcc20-cli-"));
    const init = await hk(["init", "app", "--network", "simnet", "--skip-toolchain", "--json"], parent);
    expect(init.code, brief(init)).toBe(0);
    ws = path.join(parent, "app");
    const accounts = Object.fromEntries(["alice", "bob", "carol"].map((n) => [n, { kind: "kaspa", network: "simnet", address: addr[n], privateKeyEnv: ENV[n as keyof typeof ENV] }]));
    const config = {
      execution: { default: "node", targets: { node: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
      networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: session.rpcUrl } },
      accounts
    };
    fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(config, null, 2)};\n`);
    fs.writeFileSync(path.join(ws, "KCC20.sil"), sil);
    fs.writeFileSync(path.join(ws, "zero.args.json"), JSON.stringify(ZERO_CTOR));
    const c = await hk(["silver", "compile", "KCC20.sil", "--args", "zero.args.json", "--network", "simnet", "--json"]);
    expect(c.code, brief(c)).toBe(0);
    record = String(c.json.recordPath);
    recordRef = { contentHash: String(c.json.contentHash), artifactSha256: String(c.json.provenance.artifactSha256), path: path.relative(ws, record).replace(/\\/g, "/") };
  }, 900_000);

  afterAll(async () => {
    const file = process.env.HARDKAS_TEST_R3_KCC20_CLI_TRACE || path.join(os.tmpdir(), `kcc20-token-cli-${Date.now()}.json`);
    try {
      fs.writeFileSync(file, big({ rpcUrl: session?.rpcUrl, containerName: session?.containerName, trace }));
      console.log(`[kcc20-token-cli] trace written to ${file}`);
    } catch {
      /* the trace is a diagnostic */
    }
    if (session) await stopIsolatedSimnet(session);
    if (parent) fs.rmSync(parent, { recursive: true, force: true });
  }, 120_000);

  let covenantId = "";
  it("K1 deploy: alice's 1000 tokens in one token output of the reference program; accepted, mined, the node indexes the covenant id the engine bound", async () => {
    const d = await hk(["kcc20", "deploy", record, "--from", "alice", "--holder", "alice=1000", "--constructor-args", "zero.args.json", "--json"]);
    expect(d.code, brief(d)).toBe(0);
    expect(d.json.schema).toBe("hardkas.kcc20Deploy.v1");
    covenantId = String(d.json.covenantId);
    expect(covenantId).toMatch(/^[0-9a-f]{64}$/);
    expect(d.json.outputs.map((o: any) => [o.state.owner, o.state.amount])).toEqual([[xonly.alice, "1000"]]);
    const u = await confirm(d.json.outputs[0].address, op(d.json.outputs[0].outpoint));
    expect(u.covenantId).toBe(covenantId);
    const b = await hk(["kcc20", "balance", "alice", "--covenant", covenantId, "--json"]);
    expect(b.code, brief(b)).toBe(0);
    expect([b.json.amount, b.json.outputs.length]).toEqual(["1000", 1]);
  });

  let bob600 = "";
  let bob600Address = "";
  it("K2 transfer to two holders: alice 1000 -> bob 600 + carol 300 (+ alice 100 change); accepted, mined, three outputs of the covenant; balances read back from the node", async () => {
    const t = await hk(["kcc20", "transfer", "--covenant", covenantId, "--from", "alice", "--to", "bob=600", "--to", "carol=300", "--json"]);
    expect(t.code, brief(t)).toBe(0);
    expect(t.json.schema).toBe("hardkas.kcc20Transfer.v1");
    expect(t.json.verdict.verdict).toBe("STRUCTURALLY_VALID");
    expect(t.json.inputs.map((i: any) => i.role)).toEqual(["leader"]);
    expect(t.json.outputs.map((o: any) => [o.state.owner, o.state.amount])).toEqual([[xonly.bob, "600"], [xonly.carol, "300"], [xonly.alice, "100"]]);
    for (const o of t.json.outputs) expect((await confirm(o.address, op(o.outpoint))).covenantId).toBe(covenantId);
    bob600 = t.json.outputs[0].outpoint;
    bob600Address = t.json.outputs[0].address;
    for (const [who, amount] of [["alice", "100"], ["bob", "600"], ["carol", "300"]]) {
      const b = await hk(["kcc20", "balance", who!, "--covenant", covenantId, "--json"]);
      expect(b.code, brief(b)).toBe(0);
      expect(b.json.amount, who).toBe(amount);
    }
    const all = await hk(["kcc20", "balance", "--covenant", covenantId, "--json"]);
    expect(all.code, brief(all)).toBe(0);
    expect(all.json.totalSupply).toBe("1000");
    expect(all.json.holders.length).toBe(3);
  });

  it("K3 a leader and a delegator: carol 300 -> bob 50 (+ carol 250); then bob's 600 + 50 (transfer + transfer_delegator) -> carol 640 + bob 10; accepted and mined", async () => {
    const t1 = await hk(["kcc20", "transfer", "--covenant", covenantId, "--from", "carol", "--to", "bob=50", "--json"]);
    expect(t1.code, brief(t1)).toBe(0);
    for (const o of t1.json.outputs) await confirm(o.address, op(o.outpoint));
    const t2 = await hk(["kcc20", "transfer", "--covenant", covenantId, "--from", "bob", "--to", "carol=640", "--json"]);
    expect(t2.code, brief(t2)).toBe(0);
    expect(t2.json.inputs.map((i: any) => [i.role, i.state.amount])).toEqual([["leader", "600"], ["delegator", "50"]]);
    expect(t2.json.outputs.map((o: any) => [o.state.owner, o.state.amount])).toEqual([[xonly.carol, "640"], [xonly.bob, "10"]]);
    for (const o of t2.json.outputs) expect((await confirm(o.address, op(o.outpoint))).covenantId).toBe(covenantId);
    expect(await unspent(bob600Address, bob600), "bob's 600 was spent by the transfer").toBe(false);
    const carol = await hk(["kcc20", "balance", "carol", "--covenant", covenantId, "--json"]);
    expect(carol.json.amount).toBe("890");
  });

  it("K4 a transfer the KCC-20 rules reject (five outputs; max_token_outputs 3): refused by the CLI before anything is signed, KCC20_TRANSFER_REJECTED, nothing sent", async () => {
    const before = await hk(["kcc20", "balance", "carol", "--covenant", covenantId, "--json"]);
    const r = await hk(["kcc20", "transfer", "--covenant", covenantId, "--from", "carol", "--to", "alice=1", "--to", "alice=1", "--to", "bob=1", "--to", "bob=1", "--json"]);
    expect(r.code, brief(r)).toBe(1);
    expect(errorCode(r), brief(r)).toBe("KCC20_TRANSFER_REJECTED");
    expect(JSON.stringify(r.json)).toMatch(/max_token_outputs/);
    for (const o of before.json.outputs) expect(await unspent(o.address, o.outpoint)).toBe(true);
  });

  it("K5 not conserved (carol's 640 -> bob 600): the SDK refuses it before any key is read; the same shape built by the engine without the KCC-20 check is refused by the node, its input left unspent", async () => {
    const sdk = await Hardkas.open({ cwd: ws, network: "simnet" });
    try {
      const read: string[] = [];
      const resolver = {
        publicKeyOf: (a: string) => (xonly[a] ? xonly[a] : undefined),
        privateKeyOf: async (a: string) => {
          read.push(a);
          return keys[a]!;
        }
      };
      const held = await sdk.kcc20.balance(covenantId, xonly.carol!);
      const carol640 = held.holdings.find((h) => h.state.amount === 640n)!;
      expect(carol640, big(held.holdings)).toBeDefined();
      const refused = await sdk.kcc20.planTransfer({ covenantId, inputs: [{ outpoint: op(carol640.outpoint), signer: "carol" }], to: [{ owner: xonly.bob!, amount: 600n }] }, { keys: resolver }).then(
        () => undefined,
        (e: any) => e
      );
      expect(refused?.code, String(refused?.message ?? refused)).toBe("KCC20_TRANSFER_REJECTED");
      expect(refused.metadata?.rule ?? refused.details?.rule ?? String(refused.message)).toMatch(/conservation/);
      expect(read, "no key was read for a transfer the KCC-20 rules reject").toEqual([]);

      // the same shape through the engine, the KCC-20 check left out (test code): the program on the node is the judge
      const facts = sdk.kcc20.facts();
      const ref = { compileRecord: recordRef, contract: "KCC20", constructorArgs: ZERO_CTOR.map((a) => (a.kind === "int" ? { kind: "int", value: String(a.value) } : a)) as any };
      const base = await facts.contract(ref as any);
      const template = { kind: "bytes", value: Array.from(Buffer.from(base.templateHash, "hex")) };
      const bytes = (hex: string) => ({ kind: "bytes", value: Array.from(Buffer.from(hex, "hex")) });
      const kccState = (owner: string, amount: bigint) => ({
        amount: { kind: "int", value: amount.toString() },
        owner: bytes(owner),
        owner_scheme: { kind: "byte", value: 0 },
        borrow_scheme: { kind: "byte", value: 0 },
        borrow_guard: bytes("00".repeat(32)),
        extension_commitment: bytes("00".repeat(32))
      });
      const programState = (owner: string, amount: bigint) => ({ gen__kcc20_template: template, ...kccState(owner, amount) });
      const optionsOf = (witness: Uint8Array, computeBudget: number | "estimate", feeSompi?: bigint) => ({
        covenantId,
        inputs: [
          {
            outpoint: op(carol640.outpoint),
            contract: { ...ref, entry: "transfer", policy: "transfer", args: [{ kind: "array", value: [{ kind: "object", value: kccState(xonly.bob!, 600n) }] }, { kind: "bytes", value: Array.from(witness) }], state: programState(xonly.carol!, 640n) },
            computeBudget
          }
        ],
        continuations: [{ amountSompi: "rest" as const, state: programState(xonly.bob!, 600n) }],
        ...(feeSompi !== undefined ? { feeSompi } : {})
      });
      const placeholder = kcc20TransferWitness({ scheme: 0x00, signature: "00".repeat(65) });
      const draft = await sdk.covenants.planTransition(optionsOf(placeholder, "estimate") as any, { facts, keys: resolver });
      const unsigned = buildV1WasmTransaction(k, draft);
      const signature = kccHex(silverSigFromInputSignature(String(k.createInputSignature(unsigned, 0, new k.PrivateKey(keys.carol!), k.SighashType.All))));
      const plan = await sdk.covenants.planTransition(optionsOf(kcc20TransferWitness({ scheme: 0x00, signature }), Number(draft.inputs[0].computeBudget), BigInt(draft.estimatedFeeSompi)) as any, { facts, keys: resolver });
      expect(String(buildV1WasmTransaction(k, plan).id)).toBe(String(unsigned.id));
      const signed = await sdk.covenants.sign(plan, { facts, keys: resolver });
      const sent: any = await sdk.covenants.send(signed.signed, { facts }).catch((e: any) => ({ thrown: { code: e?.code, message: String(e?.message ?? e) } }));
      const text = big(sent);
      trace.push({ case: "K5 node", sent });
      expect(sent?.rejection !== undefined || sent?.submitted === false || sent?.thrown !== undefined, text.slice(0, 2000)).toBe(true);
      expect(text, "the program ran and returned false (not a fee, mass or budget)").toMatch(/script ran, but verification failed/);
      await mineBlocks(session, 2);
      expect(await unspent(carol640.address, carol640.outpoint)).toBe(true);
    } finally {
      await sdk.close();
    }
  });

  it("K6 the supply is conserved across every accepted transfer: 1000 in all, read back from the node", async () => {
    const all = await hk(["kcc20", "balance", "--covenant", covenantId, "--json"]);
    expect(all.code, brief(all)).toBe(0);
    expect(all.json.totalSupply).toBe("1000");
    const by = Object.fromEntries(all.json.holders.map((h: any) => [h.owner, h.amount]));
    expect(by).toEqual({ [xonly.alice!]: "100", [xonly.bob!]: "10", [xonly.carol!]: "890" });
  });
});
