import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getSilContract, loadManagedKaspaWasmSync, parseSilAbiArtifact, silContractBytecodeHex, silverP2shLock } from "@hardkas/core";
import { finalizeSilverSpend, prepareSilverSpend, readV1CompileRecord } from "@hardkas/accounts";
import { getHardkasFixtureKey, mineBlocks, startIsolatedSimnet, stopIsolatedSimnet, waitForTransaction, waitForUtxo, type IsolatedSimnetSession } from "../../testing/src/index.js";
import { Hardkas, completeWalletPayment, connectBrowserWallet, prepareWalletPayment, silverSpendSignatureFromWallet, silverSpendWalletRequest } from "../src/index.js";

vi.setConfig({ testTimeout: 600_000, hookTimeout: 900_000 });

// -----------------------------------------------------------------------------
// R3-C · a browser wallet signs, HardKAS builds, verifies, assembles, sends and records — end to end against a real
// rusty-kaspad v2.1.0 (the isolated simnet harness's own node; never the machine's localnet). The "wallet" is a fake
// window.kasware (the notes' shapes) whose signPskt signs for real with a test key (carol, a fixture key) using the SDK's
// own deserializer and input signer over the JSON HardKAS handed it — the way a wallet built on the SDK would:
//   1. a P2PK payment from the wallet's address: prepareWalletPayment → the browser signer (connect, network and account
//      checks, ONE-object signPskt, structural check) → completeWalletPayment (every signature verified against the
//      address's key over HardKAS's own signature hash, signed through sdk.tx.sign) → sdk.tx.send (preflight) → accepted
//      and mined; the same request signed by another key is refused before anything is sent;
//   2. a contract spend (TransferWithTimeout.transfer, the recipient's `sig` slot is the wallet's): a v1 engine draft,
//      walletDraftRequest (autoFinalized: false) → the wallet's bare `41 <sig> 01` → fillDraftFromWallet → finalizeDraft
//      (HardKAS assembles signature, dispatch tag, redeem script) → covenants.send → accepted and mined.
// The live extensions are NOT tested here: their behaviour stays UNVERIFIED until the owner runs the probe page.
// -----------------------------------------------------------------------------

const repoRoot = path.resolve(__dirname, "../../..");
const cliDist = path.join(repoRoot, "packages", "cli", "dist", "index.js");
const TIMEOUT_SRC = path.join(repoRoot, "fixtures", "toccata-v2", "silver", "p2sh-transfer-with-timeout", "contract.sil");
const KEY_ENV = "HK_R3C_ALICE_KEY";
const KAS = 100_000_000n;

let session: IsolatedSimnetSession;
let k: any;
let sdk: Hardkas;
let parent = "";
let ws = "";
let ALICE = "";
let BOB = "";
let CAROL = "";
const KEY_OF: Record<string, string> = {};
/** The TransferWithTimeout(alice, carol, 20) compile record the contract tests share. */
let REF: any;
const keys = {
  publicKeyOf: (a: string) => (KEY_OF[a] ? String(new k.PrivateKey(KEY_OF[a]).toPublicKey().toXOnlyPublicKey().toString()).toLowerCase() : undefined),
  privateKeyOf: async (a: string) => {
    if (!KEY_OF[a]) throw new Error(`no key for ${a}`);
    return KEY_OF[a]!;
  }
};
const xonlyBytes = (name: string) => Array.from(Buffer.from(keys.publicKeyOf(name)!, "hex"));

/** A fake window.kasware on simnet whose signPskt signs with `key` (the SDK's deserializer and input signer). */
function fakeKasware(address: string, key: string, mutate?: (tx: any) => void) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const provider = {
    requestAccounts: async () => (calls.push({ method: "requestAccounts", args: [] }), [address]),
    getAccounts: async () => (calls.push({ method: "getAccounts", args: [] }), [address]),
    getNetwork: async () => (calls.push({ method: "getNetwork", args: [] }), "kaspa_simnet"),
    on: () => undefined,
    removeListener: () => undefined,
    async signPskt(...args: unknown[]) {
      calls.push({ method: "signPskt", args });
      const [arg, second] = args as [any, any];
      if (args.length > 1 || second !== undefined || !Array.isArray(arg?.options?.signInputs)) throw new TypeError("Cannot read properties of undefined (reading 'length')");
      const tx = k.Transaction.deserializeFromSafeJSON(arg.txJsonString);
      const out = JSON.parse(arg.txJsonString);
      for (const { index, sighashType } of arg.options.signInputs) {
        if (sighashType !== 1) throw new Error("only SIGHASH_ALL");
        out.inputs[index].signatureScript = String(k.createInputSignature(tx, index, new k.PrivateKey(key), k.SighashType.All));
      }
      mutate?.(out);
      return JSON.stringify(out);
    }
  };
  return { window: { kasware: provider }, calls };
}

async function confirm(address: string, outpoint: { transactionId: string; index: number }) {
  for (let round = 0; round < 8; round++) {
    await mineBlocks(session, 1, BOB);
    try {
      return await waitForUtxo(session, address, outpoint, 5_000);
    } catch {
      /* not in a block yet */
    }
  }
  throw new Error(`NOT_CONFIRMED: ${outpoint.transactionId}:${outpoint.index} at ${address}`);
}

const utxosAt = async (address: string) => (await session.rpc.getUtxosByAddress(address)) as any[];
const sum = (us: any[]) => us.reduce((s, u) => s + BigInt(u.amountSompi), 0n);

beforeAll(async () => {
  session = await startIsolatedSimnet({ minerFixture: "alice" });
  expect(session.containerName).not.toBe("hardkas-kaspad-toccata-v2");
  k = loadManagedKaspaWasmSync();
  ALICE = session.minerAddress;
  KEY_OF.alice = session.minerPrivateKey;
  KEY_OF.bob = getHardkasFixtureKey("bob");
  KEY_OF.carol = getHardkasFixtureKey("carol");
  BOB = String(new k.PrivateKey(KEY_OF.bob).toPublicKey().toAddress("simnet").toString());
  CAROL = String(new k.PrivateKey(KEY_OF.carol).toPublicKey().toAddress("simnet").toString());
  KEY_OF[ALICE] = KEY_OF.alice;
  process.env[KEY_ENV] = session.minerPrivateKey;
  // alice (contract funder) and carol (the wallet) get coinbases; they mature under bob's blocks (simnet coinbase
  // maturity 1000 DAA + HardKAS's 10-DAA margin), which carry the node's current time so the node says it is synced
  await mineBlocks(session, 3, ALICE);
  await mineBlocks(session, 3, CAROL);
  await mineBlocks(session, 1020, BOB);

  parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-r3c-wallet-"));
  const init = spawnSync(process.execPath, [cliDist, "init", "app", "--network", "simnet", "--skip-toolchain", "--json"], { cwd: parent, encoding: "utf8", env: process.env, timeout: 180_000 });
  expect(init.status, `${init.stdout}\n${init.stderr}`).toBe(0);
  ws = path.join(parent, "app");
  const config = {
    execution: { default: "node", targets: { node: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
    networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: session.rpcUrl } },
    accounts: { alice: { kind: "kaspa", network: "simnet", address: ALICE, privateKeyEnv: KEY_ENV } }
  };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(config, null, 2)};\n`);
  sdk = await Hardkas.open({ cwd: ws, network: "simnet" });
});

afterAll(async () => {
  delete process.env[KEY_ENV];
  await sdk?.close?.();
  if (session) await stopIsolatedSimnet(session);
  if (parent) fs.rmSync(parent, { recursive: true, force: true });
});

describe("R3-C · a P2PK payment signed by a browser wallet (fake window.kasware, real key, real node)", () => {
  it("planned by HardKAS, signed by the wallet (one-object signPskt), verified, signed through sdk.tx.sign, sent with the preflight, accepted and mined", async () => {
    const carolBefore = sum(await utxosAt(CAROL));
    expect(carolBefore).toBeGreaterThan(2n * KAS);
    const { plan, request } = await prepareWalletPayment(sdk, { address: CAROL, to: BOB, amount: "1" });
    expect(request.signInputs.length).toBe((plan as any).inputs.length);
    expect(request.autoFinalized).toBe(true);

    // another key over the same request: refused before anything is signed or sent
    const thief = fakeKasware(CAROL, KEY_OF.bob!);
    const thiefSession = await connectBrowserWallet("kasware", { networkId: "simnet", window: thief.window });
    const forged = await thiefSession.signTransaction(request);
    await expect(completeWalletPayment(sdk, { plan, request, returned: forged.returned })).rejects.toMatchObject({ code: "WALLET_SIGNATURE_INVALID" });

    const wallet = fakeKasware(CAROL, KEY_OF.carol!);
    const s = await connectBrowserWallet("kasware", { networkId: "simnet", window: wallet.window });
    const signedByWallet = await s.signTransaction(request);
    const sign = wallet.calls.filter((c) => c.method === "signPskt");
    expect(sign).toHaveLength(1);
    expect(sign[0]!.args).toHaveLength(1);
    const { signed, txId } = await completeWalletPayment(sdk, { plan, request, returned: signedByWallet.returned });
    expect(txId).toBe(request.txId);
    const sent: any = await sdk.tx.send(signed, { preflight: true });
    expect(sent.submitted, JSON.stringify(sent).slice(0, 600)).toBe(true);
    await mineBlocks(session, 1, BOB);
    const got = await waitForTransaction(session, BOB, txId, 60_000);
    expect(got.map((u) => BigInt(u.amountSompi))).toContain(1n * KAS);
    const fee = BigInt((plan as any).estimatedFeeSompi);
    expect(carolBefore - sum(await utxosAt(CAROL))).toBe(1n * KAS + fee);
  });
});

describe("R3-C · a contract input signed by a browser wallet: the v1 engine's draft, HardKAS assembles the unlock", () => {
  it("TransferWithTimeout.transfer: the recipient's slot is the wallet's; the bare 41 <sig> 01 fills it; finalized, sent, accepted and mined", async () => {
    fs.copyFileSync(TIMEOUT_SRC, path.join(ws, "timeout.sil"));
    fs.writeFileSync(path.join(ws, "timeout.args.json"), JSON.stringify([{ kind: "bytes", value: xonlyBytes("alice") }, { kind: "bytes", value: xonlyBytes("carol") }, { kind: "int", value: 20 }]));
    const c = spawnSync(process.execPath, [cliDist, "silver", "compile", "timeout.sil", "--args", "timeout.args.json", "--network", "simnet", "--json"], { cwd: ws, encoding: "utf8", env: process.env, timeout: 180_000 });
    expect(c.status, `${c.stdout}\n${c.stderr}`).toBe(0);
    const rec = JSON.parse(c.stdout.trim());
    const ref = { contentHash: rec.contentHash, artifactSha256: rec.provenance.artifactSha256, path: path.relative(ws, rec.recordPath).replace(/\\/g, "/") };
    REF = ref;
    const contract = { compileRecord: ref, contract: "TransferWithTimeout", constructorArgs: [{ kind: "bytes", value: xonlyBytes("alice") }, { kind: "bytes", value: xonlyBytes("carol") }, { kind: "int", value: "20" }] };

    const deployPlan: any = await sdk.covenants.planContractDeploy({ contract: contract as any, amountSompi: 2n * KAS, funder: ALICE });
    const deployed = await sdk.covenants.sign(deployPlan, { keys });
    const deploySent: any = await sdk.covenants.send(deployed.signed);
    expect(deploySent?.rejection, JSON.stringify(deploySent).slice(0, 600)).toBeUndefined();
    const index = deployPlan.outputs.findIndex((o: any) => o.role === "payment");
    const utxo = await confirm(deployPlan.outputs[index].address, { transactionId: deployed.txId, index });

    const plan: any = await sdk.covenants.planContractSpend({
      outpoint: utxo.outpoint,
      contract: { ...contract, entry: "transfer", args: [{ kind: "signer", signer: "carol" }] } as any,
      payments: [],
      sweepTo: CAROL,
      computeBudget: "estimate"
    });
    const draft = await sdk.covenants.prepareDraft(plan, { keys });
    expect(draft.slots.map((s) => [s.input, s.kind, s.signer])).toEqual([[0, "contract", "carol"]]);
    const request = await sdk.covenants.walletDraftRequest(draft, plan, CAROL);
    expect([request.purpose, request.autoFinalized, request.signInputs]).toEqual(["contract", false, [{ index: 0, sighashType: 1 }]]);

    const wallet = fakeKasware(CAROL, KEY_OF.carol!);
    const s = await connectBrowserWallet("kasware", { networkId: "simnet", window: wallet.window });
    const back = await s.signTransaction(request);
    expect((wallet.calls.find((x) => x.method === "signPskt")!.args[0] as any).options.autoFinalized).toBe(false);
    // a signature by another key fills nothing
    const thief = await (await connectBrowserWallet("kasware", { networkId: "simnet", window: fakeKasware(CAROL, KEY_OF.bob!).window })).signTransaction(request);
    expect(() => sdk.covenants.fillDraftFromWallet(draft, plan, request, thief.returned)).toThrow(expect.objectContaining({ code: "WALLET_SIGNATURE_INVALID" }));

    const filled = sdk.covenants.fillDraftFromWallet(draft, plan, request, back.returned);
    expect(filled.slots[0]!.signature).toBe(back.check.signatures[0]);
    const { signed, txId } = await sdk.covenants.finalizeDraft(filled, plan);
    expect(txId).toBe(draft.txId);
    const sent: any = await sdk.covenants.send(signed);
    expect(sent?.rejection, JSON.stringify(sent).slice(0, 600)).toBeUndefined();
    const swept = await confirm(CAROL, { transactionId: txId, index: 0 });
    expect(BigInt(swept.amountSompi)).toBe(2n * KAS - BigInt(plan.estimatedFeeSompi));
  });
});

describe("R3-C · a v0 SilverScript spend whose sig argument the browser wallet provides (prepareSilverSpend draft)", () => {
  it("TransferWithTimeout.transfer (v0): the wallet signs the draft's own transaction, HardKAS checks it and finalizeSilverSpend assembles; accepted and mined; a tampered or foreign signature is refused by HardKAS, and the node refuses the foreign one", async () => {
    expect(REF, "the contract test compiled the record first").toBeDefined();
    const record = readV1CompileRecord(ws, REF);
    const artifact = parseSilAbiArtifact(JSON.parse(record.artifactJson));
    const lock = silverP2shLock(silContractBytecodeHex(getSilContract(artifact, "TransferWithTimeout").contract));
    const p2sh = String(k.addressFromScriptPublicKey(new k.ScriptPublicKey(lock.version, lock.script), "simnet"));
    // fund the contract with a plain v0 payment from alice (the payment planner, signer and send)
    const fund: any = await sdk.tx.plan({ from: "alice", to: p2sh, amount: "2" });
    const fundSigned: any = await sdk.tx.sign(fund, { account: "alice" });
    const fundSent: any = await sdk.tx.send(fundSigned);
    expect(fundSent.submitted, JSON.stringify(fundSent).slice(0, 600)).toBe(true);
    const fundOut = (fund.outputs as any[]).findIndex((o: any) => o.address === p2sh);
    const u = await confirm(p2sh, { transactionId: String(fundSigned.txId), index: fundOut });

    const args = [{ kind: "signer", signer: "carol" }] as const;
    const fee = 2_000_000n;
    const draft = prepareSilverSpend({
      artifact,
      contractName: "TransferWithTimeout",
      entry: "transfer",
      args: args as any,
      utxo: { outpoint: u.outpoint, amountSompi: BigInt(u.amountSompi), scriptPublicKey: { version: Number(u.scriptPublicKey.version), script: String(u.scriptPublicKey.script) }, blockDaaScore: BigInt(u.blockDaaScore), isCoinbase: Boolean(u.isCoinbase) },
      outputs: [{ amountSompi: 2n * KAS - fee, address: CAROL }],
      networkId: "simnet"
    });
    const request = silverSpendWalletRequest(draft, CAROL);
    expect([request.autoFinalized, request.signInputs]).toEqual([false, [{ index: 0, sighashType: 1 }]]);
    const submit = async (rpcTx: unknown, txId: string) => {
      try {
        const r: any = await session.rpc.submitTransaction(rpcTx as any, { allowOrphan: false, expectedTxId: txId } as any);
        return { accepted: r?.accepted !== false, reason: r?.error ? String(r.error) : undefined };
      } catch (e: any) {
        return { accepted: false, reason: String(e?.message ?? e).slice(0, 400) };
      }
    };

    // tampered: the wallet returns another output value → refused by HardKAS before any unlock exists
    const tampered = await (await connectBrowserWallet("kasware", { networkId: "simnet", window: fakeKasware(CAROL, KEY_OF.carol!, (tx) => (tx.outputs[0].value = "1")).window })).signTransaction(request).catch((e) => e);
    expect(tampered?.code).toBe("WALLET_SIGNED_TRANSACTION_CHANGED");
    // foreign key: refused by HardKAS; forced past HardKAS's check, the node refuses it too
    const foreign = await (await connectBrowserWallet("kasware", { networkId: "simnet", window: fakeKasware(CAROL, KEY_OF.bob!).window })).signTransaction(request);
    expect(() => silverSpendSignatureFromWallet(draft, request, foreign.returned)).toThrow(expect.objectContaining({ code: "WALLET_SIGNATURE_INVALID" }));
    const forced = finalizeSilverSpend(draft, artifact, args as any, { carol: foreign.check.signatures[0]! });
    const nodeOnForeign = await submit(forced.rpcTransaction, forced.txId);
    expect(nodeOnForeign.accepted, "the node refuses the foreign signature").toBe(false);

    // the wallet's own signature: checked, assembled, accepted, mined
    const wallet = fakeKasware(CAROL, KEY_OF.carol!);
    const back = await (await connectBrowserWallet("kasware", { networkId: "simnet", window: wallet.window })).signTransaction(request);
    const sig = silverSpendSignatureFromWallet(draft, request, back.returned);
    const final = finalizeSilverSpend(draft, artifact, args as any, { carol: sig });
    expect(final.txId).toBe(draft.unsignedTxId);
    const nodeOnWallet = await submit(final.rpcTransaction, final.txId);
    expect(nodeOnWallet.accepted, nodeOnWallet.reason).toBe(true);
    const paid = await confirm(CAROL, { transactionId: final.txId, index: 0 });
    expect(BigInt(paid.amountSompi)).toBe(2n * KAS - fee);
  });
});
