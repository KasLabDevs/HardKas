import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getSilContract, loadManagedKaspaWasmSync, silContractBytecodeHex, silverP2shAddress } from "@hardkas/core";
import { calculateUpstreamStorageMass } from "@hardkas/tx-builder";
import { buildCovenantGenesis } from "@hardkas/accounts";
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
 * L1-04 / SC-03 · on a real rusty-kaspad v2.1.0 (simnet): the storage mass HardKAS commits for a covenant genesis is the
 * node's own. The mempool does not check the committed field (TxValidationFlags::SkipMassCheck): it computes the
 * contextual mass itself and keeps that value, which a block then has to commit exactly (check_mass_commitment,
 * WrongMass). So the genesis is sent with the old amounts-only value (plurality 1 everywhere) and the node is asked which
 * mass it holds: it must be the value buildCovenantGenesis now commits (the covenant output has utxo_plurality 2), not
 * the one sent. The sighash does not cover the field, so the signature stays valid.
 */

const FIXTURES = path.resolve(__dirname, "../../accounts/test/fixtures/silver-genesis-txid-1");
const KAS = 100_000_000n;
const VALUE = 10n * KAS;
const FEE = 1_000_000n;

let k: any;
let session: IsolatedSimnetSession;
let alice: { key: string; address: string };
let funding: SimnetOnChainUtxo;

beforeAll(async () => {
  k = loadManagedKaspaWasmSync();
  session = await startIsolatedSimnet({ minerFixture: "alice" });
  const key = getHardkasFixtureKey("alice");
  alice = { key, address: String(new k.PrivateKey(key).toPublicKey().toAddress("simnet").toString()) };
  funding = await fundTestAccount(session, "alice", VALUE + FEE + 10_000_000n);
});

afterAll(async () => {
  if (session) await stopIsolatedSimnet(session);
});

const massOf = (tx: any): bigint | undefined => {
  const v = tx?.storageMass ?? tx?.storage_mass ?? tx?.mass;
  return v === undefined || v === null ? undefined : BigInt(v);
};

describe("L1-04 / SC-03 · the committed covenant storage mass is the node's", () => {
  it("the node holds the plurality-aware mass buildCovenantGenesis commits, whatever value the transaction carried", async () => {
    const artifact = JSON.parse(fs.readFileSync(path.join(FIXTURES, "counter-covenant-10.artifact.json"), "utf8"));
    const g = buildCovenantGenesis({
      artifact,
      contractName: "CounterCovenant",
      valueSompi: VALUE,
      funding: [{ ...funding, privateKey: alice.key, computeBudget: 10 }],
      changeAddress: alice.address,
      networkId: "simnet",
      feeSompi: FEE
    });
    const amountsOnly = BigInt(calculateUpstreamStorageMass([funding.amountSompi], [VALUE, g.changeSompi], "simnet"));
    expect(g.storageMass).not.toBe(amountsOnly);

    // Send the genesis with the OLD committed value; signature unchanged (the sighash does not cover the mass)
    const sent = { ...(g.rpcTransaction as any), storageMass: Number(amountsOnly) };
    const res: any = await session.rpc.submitTransaction(sent, { allowOrphan: false });
    expect(res?.accepted, String(res?.error ?? "")).not.toBe(false);
    const txId = String(res?.transactionId ?? g.txId).toLowerCase();

    const raw: any = await session.rpc.call("getMempoolEntryRequest", { transactionId: txId, includeOrphanPool: false, filterTransactionPool: false });
    const entryTx = (raw?.mempoolEntry ?? raw?.entry)?.transaction;
    const held = massOf(entryTx);
    console.log(`[L1-04] txId=${txId} (built ${g.txId}) sent=${amountsOnly} committedByHardkas=${g.storageMass} heldByNode=${String(held)}`);
    expect(held).toBe(g.storageMass);
    expect(held).not.toBe(amountsOnly);

    // and it confirms: the block template commits the node's value, which the block check requires
    await mineBlocks(session, 1);
    const { contract } = getSilContract(artifact, "CounterCovenant");
    const utxo = await waitForUtxo(session, silverP2shAddress(silContractBytecodeHex(contract), "simnet"), { transactionId: txId, index: 0 });
    expect(utxo.covenantId).toBe(g.covenantId.toLowerCase());
  });
});
