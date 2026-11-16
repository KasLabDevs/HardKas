import { describe, it, expect, beforeAll } from "vitest";
import { compileSilverScript, getSilContract, loadManagedKaspaWasmSync, silContractBytecodeHex, silverP2shLock, type SilAbiArtifact } from "@hardkas/core";
import { MAX_TX_IN_SEQUENCE_NUM } from "@hardkas/tx-builder";
import { buildSilverSweep, finalizeSilverSpend, prepareSilverSpend, signSilverSpend, type SilverDraftArg } from "../src/silver-spend.js";

// -----------------------------------------------------------------------------
// CLTV · SilverScript v0 spends with an absolute lock time (silverc level: compiled with the pinned silverc). Without a
// lock time a sweep and a draft are exactly as before (lock time 0, no `lockTime` field, same txid); with one it is
// written into the transaction (id and sighash cover it), checked (LOCK_TIME_INVALID) and never voided by a maximum
// sequence (LOCK_TIME_VOID_SEQUENCE). The node's verdict on `require(tx.daa >= x)`: cltv-ecdsa-node.simnet S-1.
// -----------------------------------------------------------------------------

const SOURCE = `pragma silverscript ^0.1.0;

contract Locked(pubkey owner, int unlockDaa) {
    entry claim(sig ownerSig) {
        require(tx.daa >= unlockDaa);
        require(checkSig(ownerSig, owner));
    }
}
`;
const KEY = "5d".repeat(32);

const codeOf = (f: () => unknown): string | undefined => {
  try {
    f();
    return undefined;
  } catch (e: any) {
    return e?.code;
  }
};

describe("CLTV · SilverScript spends with a lock time", () => {
  let artifact: SilAbiArtifact;
  let utxo: any;
  let to: string;

  beforeAll(async () => {
    const k = loadManagedKaspaWasmSync();
    const owner = new k.PrivateKey(KEY);
    ({ artifact } = await compileSilverScript({
      source: SOURCE,
      constructorArgs: [{ kind: "bytes", value: Buffer.from(String(owner.toPublicKey().toXOnlyPublicKey().toString()), "hex") }, { kind: "int", value: 500n }]
    }));
    utxo = { outpoint: { transactionId: "cd".repeat(32), index: 0 }, amountSompi: 1_000_000_000n, scriptPublicKey: silverP2shLock(silContractBytecodeHex(getSilContract(artifact).contract)), blockDaaScore: 10n, isCoinbase: false };
    to = String(owner.toKeypair().toAddress("simnet").toString());
  });

  const sweep = (extra: Record<string, unknown> = {}) =>
    buildSilverSweep({ artifact, entry: "claim", args: [{ kind: "signature", privateKey: KEY }], utxo, to, networkId: "simnet", ...extra } as any);

  it("SL-1 buildSilverSweep: no lock time is the transaction as before; a DAA lock is written and changes the id; a time lock too", () => {
    const plain = sweep();
    expect(plain.rpcTransaction.lockTime).toBe(0);
    expect("lockTime" in plain).toBe(false);
    const locked = sweep({ lockTime: { daaScore: 500n } });
    expect(locked.rpcTransaction.lockTime).toBe(500);
    expect(locked.lockTime).toBe(500n);
    expect(locked.txId).not.toBe(plain.txId);
    expect(locked.feeSompi).toBe(plain.feeSompi);
    const timed = sweep({ lockTime: { timestampMs: "1767225600000" } });
    expect(timed.rpcTransaction.lockTime).toBe(1_767_225_600_000);
  });

  it("SL-2 refused before signing: a bare lock time, a wrong kind, a lock with the maximum sequence", () => {
    expect(codeOf(() => sweep({ lockTime: 500 }))).toBe("LOCK_TIME_INVALID");
    expect(codeOf(() => sweep({ lockTime: { daaScore: 600_000_000_000n } }))).toBe("LOCK_TIME_INVALID");
    expect(codeOf(() => sweep({ lockTime: { daaScore: 500n }, sequence: MAX_TX_IN_SEQUENCE_NUM }))).toBe("LOCK_TIME_VOID_SEQUENCE");
  });

  it("SL-3 drafts: without a lock time no field (the draft as before); with one the draft carries it and every signer signs that transaction", () => {
    const args: SilverDraftArg[] = [{ kind: "signer", signer: "owner" }];
    const base = { artifact, entry: "claim", args, utxo, outputs: [{ amountSompi: 999_000_000n, address: to }], networkId: "simnet" };
    const plain = prepareSilverSpend(base);
    expect("lockTime" in plain).toBe(false);
    const draft = prepareSilverSpend({ ...base, lockTime: { daaScore: 500n } });
    expect(draft.lockTime).toBe("500");
    expect(draft.unsignedTxId).not.toBe(plain.unsignedTxId);
    const done = finalizeSilverSpend(draft, artifact, args, { owner: signSilverSpend(draft, KEY) });
    expect(done.txId).toBe(draft.unsignedTxId);
    expect(done.rpcTransaction.lockTime).toBe(500);
    expect(codeOf(() => signSilverSpend({ ...draft, lockTime: "501" }, KEY))).toBe("SILVER_SPEND_DRAFT_INVALID");
  });
});
