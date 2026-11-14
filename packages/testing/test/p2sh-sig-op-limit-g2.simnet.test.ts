import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  compileSilverScript,
  encodeSilverEntryArgs,
  getSilContract,
  loadManagedKaspaWasmSync,
  silContractBytecodeHex,
  silverP2shAddress,
  silverP2shLock,
  silverSigFromInputSignature,
  silverUnlockScript,
  type SilAbiArtifact
} from "@hardkas/core";
import { buildScriptFunding, buildSilverSweep, parseWasmTxToRpc } from "@hardkas/accounts";
import { calculateUpstreamStorageMass, countScriptSigOps } from "@hardkas/tx-builder";
import { classifyNodeRejection } from "@hardkas/artifacts";
import { getHardkasFixtureKey } from "../src/fixture-signer.js";
import {
  fundTestAccount,
  mineBlocks,
  startIsolatedSimnet,
  stopIsolatedSimnet,
  waitForUtxo,
  type IsolatedSimnetSession,
  type SimnetOnChainUtxo
} from "../src/isolated-simnet.js";

/*
 * G2 (kaspa-agent-notes cross-check) · on a real rusty-kaspad v2.1.0 (simnet): the mempool refuses a P2SH input whose
 * redeem script counts more than 15 signature operations, counted statically over the WHOLE redeem script (every entry,
 * every inlined helper call site), whatever entry the spend runs. Each contract has a `cheap` entry (one checkSig) and a
 * `heavy` one; every spend below goes through `cheap`, which runs one signature check and declares sigOpCount 1.
 *  - 16 static (1 + 15): the spend is refused, the node's text names 16 and 15; the coin stays locked;
 *  - 15 static (1 + 14): the spend is accepted and confirmed (the limit is "more than 15");
 *  - 17 static (1 + a helper of 2 checkSig called 8 times): refused, naming 17 (silverc inlines helpers);
 *  - transaction v1: the same 16-op coin spent by a v1 transaction (compute budget, sigOpCount 0) is refused with the same
 *    text, and a 15-op coin spent the same way is accepted (v1 inputs are subject to the rule too);
 *  - HardKAS's static counter (tx-builder countScriptSigOps) gives the node's numbers for these redeem scripts.
 * G7 d · the node's storage-mass refusal text, captured from a v0 payment with a tiny output.
 */

const KAS = 100_000_000n;
const VALUE = 2n * KAS;
const V1_FEE = 10_000_000n;
const V1_BUDGET = 50;
const ZERO_SUBNET = "0000000000000000000000000000000000000000";
const CHECK = "        require(checkSig(s, owner));";

const twoEntries = (name: string, heavyChecks: number) => `pragma silverscript ^0.1.0;

contract ${name}(pubkey owner) {
    entry cheap(sig s) {
${CHECK}
    }

    entry heavy(sig s) {
${Array.from({ length: heavyChecks }, () => CHECK).join("\n")}
    }
}
`;

const inlinedHelpers = `pragma silverscript ^0.1.0;

contract Inlined17(pubkey owner) {
    function two(sig s) {
${CHECK}
${CHECK}
    }

    entry cheap(sig s) {
${CHECK}
    }

    entry heavy(sig s) {
${Array.from({ length: 8 }, () => "        two(s);").join("\n")}
    }
}
`;

let k: any;
let session: IsolatedSimnetSession;
let alice: { key: string; xonly: string; address: string };
let coin: SimnetOnChainUtxo;
const compiled: Record<string, { artifact: SilAbiArtifact; bytecode: string; address: string }> = {};

type Submitted = { accepted: boolean; reason: string; txId?: string };
const submit = async (rpcTx: unknown, expectedTxId?: string): Promise<Submitted> => {
  try {
    const res: any = await session.rpc.submitTransaction(rpcTx as any, { allowOrphan: false, ...(expectedTxId ? { expectedTxId } : {}) });
    return { accepted: res?.accepted !== false, reason: String(res?.error ?? ""), ...(res?.transactionId ? { txId: String(res.transactionId) } : {}) };
  } catch (e: any) {
    return { accepted: false, reason: String(e?.message ?? e) };
  }
};

const evidence = (label: string, data: Record<string, unknown>) =>
  console.log(`[G2-SIMNET] ${label} ${JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`);

/** Funds a P2SH output of `name` with VALUE from alice's coin (v0, the product's buildScriptFunding); the change is the next coin. */
async function deploy(name: string): Promise<SimnetOnChainUtxo> {
  const c = compiled[name]!;
  const f = buildScriptFunding({ utxos: [coin], privateKey: alice.key, lockingScript: silverP2shLock(c.bytecode), valueSompi: VALUE, networkId: "simnet" });
  const r = await submit(f.rpcTransaction, f.txId);
  expect(r.accepted, `${name} funding: ${r.reason}`).toBe(true);
  await mineBlocks(session, 1);
  const utxo = await waitForUtxo(session, c.address, { transactionId: f.txId, index: 0 });
  coin = await waitForUtxo(session, alice.address, { transactionId: f.txId, index: 1 });
  return utxo;
}

/** The product's v0 spend through `cheap` (one signature argument: sigOpCount 1, as `silver spend` declares it). */
function v0Cheap(name: string, utxo: SimnetOnChainUtxo) {
  return buildSilverSweep({
    artifact: compiled[name]!.artifact,
    entry: "cheap",
    args: [{ kind: "signature", privateKey: alice.key }],
    utxo,
    to: alice.address,
    networkId: "simnet",
    sigOpCount: 1
  });
}

/** A v1 spend through `cheap`, assembled here: compute budget V1_BUDGET, sigOpCount 0, one output to alice. */
function v1Cheap(name: string, utxo: SimnetOnChainUtxo): { rpcTransaction: unknown; txId: string } {
  const { artifact, bytecode } = compiled[name]!;
  const lock = silverP2shLock(bytecode);
  const out = utxo.amountSompi - V1_FEE;
  const make = (signatureScript: string) => {
    const tx = new k.Transaction({
      version: 1,
      inputs: [
        {
          previousOutpoint: utxo.outpoint,
          signatureScript,
          sequence: 0n,
          sigOpCount: 0,
          computeBudget: V1_BUDGET,
          utxo: {
            outpoint: utxo.outpoint,
            amount: utxo.amountSompi,
            scriptPublicKey: new k.ScriptPublicKey(lock.version, lock.script),
            blockDaaScore: utxo.blockDaaScore,
            isCoinbase: false
          }
        }
      ],
      outputs: [{ value: out, scriptPublicKey: k.payToAddressScript(new k.Address(alice.address)) }],
      lockTime: 0n,
      subnetworkId: ZERO_SUBNET,
      gas: 0n,
      payload: ""
    });
    // plain cells (P2SH 35 bytes, P2PK 34 bytes): plurality 1, the amounts-only storage mass is the node's
    tx.storageMass = calculateUpstreamStorageMass([utxo.amountSompi], [out], "simnet");
    tx.finalize();
    return tx;
  };
  const sig = silverSigFromInputSignature(String(k.createInputSignature(make(""), 0, new k.PrivateKey(alice.key), k.SighashType.All)));
  const signed = make(silverUnlockScript(bytecode, encodeSilverEntryArgs({ artifact, entry: "cheap", args: [{ kind: "bytes", value: sig }] })));
  return { rpcTransaction: parseWasmTxToRpc(signed.serializeToObject()), txId: String(signed.id) };
}

const sigOpRefusal = (n: number) => new RegExp(`transaction input #0 has ${n} signature operations which is more than the allowed max amount of 15`);

beforeAll(async () => {
  k = loadManagedKaspaWasmSync();
  session = await startIsolatedSimnet({ minerFixture: "alice" });
  const key = getHardkasFixtureKey("alice");
  const pk = new k.PrivateKey(key);
  alice = { key, xonly: String(pk.toPublicKey().toXOnlyPublicKey().toString()), address: String(pk.toPublicKey().toAddress("simnet").toString()) };
  const sources: Record<string, string> = { Heavy16: twoEntries("Heavy16", 15), Heavy15: twoEntries("Heavy15", 14), Inlined17: inlinedHelpers };
  for (const [name, source] of Object.entries(sources)) {
    const { artifact } = await compileSilverScript({ source, constructorArgs: [{ kind: "bytes", value: Buffer.from(alice.xonly, "hex") }] });
    const bytecode = silContractBytecodeHex(getSilContract(artifact).contract);
    compiled[name] = { artifact, bytecode, address: silverP2shAddress(bytecode, "simnet") };
  }
  coin = await fundTestAccount(session, "alice", 50n * KAS);
}, 300_000);

afterAll(async () => {
  if (session) await stopIsolatedSimnet(session);
}, 60_000);

describe("G2 · the mempool's 15-signature-operation limit per P2SH input, on a real rusty-kaspad", () => {
  let heavy16: SimnetOnChainUtxo;

  it("G2-0 HardKAS's static counter: 16, 15 and 17 (the helper's two checks counted at each of its 8 call sites)", () => {
    expect(countScriptSigOps(compiled.Heavy16!.bytecode)).toBe(16);
    expect(countScriptSigOps(compiled.Heavy15!.bytecode)).toBe(15);
    expect(countScriptSigOps(compiled.Inlined17!.bytecode)).toBe(17);
  });

  it("G2-1 v0, 16 static: a spend that runs ONE check is refused by the node (16 > 15); the funded coin stays at the address", async () => {
    heavy16 = await deploy("Heavy16");
    const spend = v0Cheap("Heavy16", heavy16);
    const r = await submit(spend.rpcTransaction, spend.txId);
    evidence("v0-16", { txId: spend.txId, accepted: r.accepted, reason: r.reason, class: classifyNodeRejection(r.reason).code });
    expect(r.accepted, r.reason).toBe(false);
    expect(r.reason).toMatch(sigOpRefusal(16));
    expect(classifyNodeRejection(r.reason).code).toBe("SCRIPT_POLICY_REJECTED");
    const still = (await session.rpc.getUtxosByAddress(compiled.Heavy16!.address)).some((u: any) => String(u.outpoint?.transactionId).toLowerCase() === heavy16.outpoint.transactionId);
    expect(still).toBe(true);
  });

  it("G2-2 v0, 15 static: the same spend is accepted and confirmed (the limit is 'more than 15')", async () => {
    const utxo = await deploy("Heavy15");
    const spend = v0Cheap("Heavy15", utxo);
    const r = await submit(spend.rpcTransaction, spend.txId);
    evidence("v0-15", { txId: spend.txId, accepted: r.accepted, reason: r.reason });
    expect(r.accepted, r.reason).toBe(true);
    await mineBlocks(session, 1);
    await waitForUtxo(session, alice.address, { transactionId: spend.txId, index: 0 });
  });

  it("G2-3 v0, a helper inlined at 8 call sites (17 static): refused, naming 17", async () => {
    const utxo = await deploy("Inlined17");
    const spend = v0Cheap("Inlined17", utxo);
    const r = await submit(spend.rpcTransaction, spend.txId);
    evidence("v0-17-inlined", { txId: spend.txId, accepted: r.accepted, reason: r.reason });
    expect(r.accepted, r.reason).toBe(false);
    expect(r.reason).toMatch(sigOpRefusal(17));
  });

  it("G2-4 v1: the 16-op coin spent by a v1 transaction is refused with the same rule; a 15-op coin spent the same way is accepted", async () => {
    const refused = v1Cheap("Heavy16", heavy16);
    const r16 = await submit(refused.rpcTransaction, refused.txId);
    evidence("v1-16", { txId: refused.txId, accepted: r16.accepted, reason: r16.reason });
    expect(r16.accepted, r16.reason).toBe(false);
    expect(r16.reason).toMatch(sigOpRefusal(16));

    const utxo = await deploy("Heavy15");
    const ok = v1Cheap("Heavy15", utxo);
    const r15 = await submit(ok.rpcTransaction, ok.txId);
    evidence("v1-15", { txId: ok.txId, accepted: r15.accepted, reason: r15.reason });
    expect(r15.accepted, r15.reason).toBe(true);
  });
});

describe("G7 d · the node's storage-mass refusal text", () => {
  it("a v0 payment with a 0.001 KAS output (storage mass ~10^7 g) is refused; the text names the mass and the limit", async () => {
    const bob = String(new k.PrivateKey(getHardkasFixtureKey("bob")).toPublicKey().toAddress("simnet").toString());
    const tiny = 100_000n;
    const fee = 1_000_000n;
    const change = coin.amountSompi - tiny - fee;
    const make = (sigScript: string) => {
      const tx = new k.Transaction({
        version: 0,
        inputs: [
          {
            previousOutpoint: coin.outpoint,
            signatureScript: sigScript,
            sequence: 0n,
            sigOpCount: 1,
            utxo: {
              outpoint: coin.outpoint,
              amount: coin.amountSompi,
              scriptPublicKey: new k.ScriptPublicKey(coin.scriptPublicKey.version, coin.scriptPublicKey.script),
              blockDaaScore: coin.blockDaaScore,
              isCoinbase: coin.isCoinbase
            }
          }
        ],
        outputs: [
          { value: tiny, scriptPublicKey: k.payToAddressScript(new k.Address(bob)) },
          { value: change, scriptPublicKey: k.payToAddressScript(new k.Address(alice.address)) }
        ],
        lockTime: 0n,
        subnetworkId: ZERO_SUBNET,
        gas: 0n,
        payload: ""
      });
      tx.storageMass = calculateUpstreamStorageMass([coin.amountSompi], [tiny, change], "simnet");
      tx.finalize();
      return tx;
    };
    const sig = String(k.createInputSignature(make(""), 0, new k.PrivateKey(alice.key), k.SighashType.All));
    const signed = make(sig);
    const r = await submit(parseWasmTxToRpc(signed.serializeToObject()), String(signed.id));
    evidence("storage-mass", { txId: String(signed.id), accepted: r.accepted, reason: r.reason, class: classifyNodeRejection(r.reason).code });
    expect(r.accepted, r.reason).toBe(false);
    expect(r.reason).toMatch(/transaction storage mass of \d+ is larger than max allowed size of \d+/);
    expect(classifyNodeRejection(r.reason).code).toBe("STORAGE_MASS_ABOVE_LIMIT");
  });
});
