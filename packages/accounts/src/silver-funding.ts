import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { calculateUpstreamStorageMass, measureBuiltTransactionMass } from "@hardkas/tx-builder";
import { parseWasmTxToRpc } from "./internal/wasm-rpc-serialization.js";
import type { SilverContractUtxo } from "./silver-spend.js";

/**
 * Funding a script (P2SH) output from a key's P2PK outputs, as a v0
 * transaction: the script output first, the change back to the key's address.
 * Inputs are taken in the given order until they cover the value and the fee;
 * the fee, storage mass and signatures come from the SDK.
 */

function fundingError(code: string, message: string): Error {
  const err = new Error(`${code}: ${message}`);
  (err as any).code = code;
  return err;
}

export interface ScriptFundingRequest {
  /** Candidate P2PK outputs of the key, in spending order. */
  readonly utxos: readonly SilverContractUtxo[];
  readonly privateKey: string;
  readonly lockingScript: { readonly version: number; readonly script: string };
  readonly valueSompi: bigint;
  readonly networkId: string;
}

export interface ScriptFundingResult {
  readonly rpcTransaction: any;
  readonly txId: string;
  readonly outputIndex: 0;
  readonly feeSompi: bigint;
  readonly changeSompi: bigint;
  readonly spent: readonly { readonly transactionId: string; readonly index: number }[];
}

export function buildScriptFunding(request: ScriptFundingRequest): ScriptFundingResult {
  const k = loadManagedKaspaWasmSync();
  const key = new k.PrivateKey(request.privateKey);
  const address = key.toKeypair().toAddress(request.networkId);
  const p2pk = k.payToAddressScript(address);
  const own = { version: Number(p2pk.version), script: String(p2pk.script) };
  const lock = request.lockingScript;

  const make = (inputs: readonly SilverContractUtxo[], fee: bigint, signatureScripts?: readonly string[]) => {
    const total = inputs.reduce((s, u) => s + u.amountSompi, 0n);
    const change = total - request.valueSompi - fee;
    const outputs: any[] = [{ value: request.valueSompi, scriptPublicKey: new k.ScriptPublicKey(lock.version, lock.script) }];
    if (change > 0n) outputs.push({ value: change, scriptPublicKey: new k.ScriptPublicKey(own.version, own.script) });
    const tx = new k.Transaction({
      version: 0,
      inputs: inputs.map((u, i) => ({
        previousOutpoint: u.outpoint,
        signatureScript: signatureScripts?.[i] ?? "",
        sequence: 0n,
        sigOpCount: 1,
        utxo: {
          outpoint: u.outpoint,
          amount: u.amountSompi,
          scriptPublicKey: new k.ScriptPublicKey(own.version, own.script),
          blockDaaScore: u.blockDaaScore,
          isCoinbase: u.isCoinbase
        }
      })),
      outputs,
      lockTime: 0n,
      subnetworkId: "0000000000000000000000000000000000000000",
      gas: 0n,
      payload: ""
    });
    tx.storageMass = calculateUpstreamStorageMass(
      inputs.map((u) => u.amountSompi),
      change > 0n ? [request.valueSompi, change] : [request.valueSompi],
      request.networkId
    );
    return { tx, change };
  };

  for (const u of request.utxos) {
    if (Number(u.scriptPublicKey.version) !== own.version || String(u.scriptPublicKey.script).toLowerCase() !== own.script) {
      throw fundingError("FUNDING_KEY_MISMATCH", `${u.outpoint.transactionId}:${u.outpoint.index} is not a P2PK output of the funding key`);
    }
  }

  const selected: SilverContractUtxo[] = [];
  for (const u of request.utxos) {
    selected.push(u);
    const total = selected.reduce((s, x) => s + x.amountSompi, 0n);
    if (total <= request.valueSompi) continue;
    // Unsigned P2PK inputs: the SDK prices each with one expected signature.
    let fee = 0n;
    for (let round = 0; round < 8; round++) {
      if (total < request.valueSompi + fee) break;
      const measured = measureBuiltTransactionMass(make(selected, fee).tx, request.networkId);
      if (!measured.standard) throw fundingError("TX_MASS_ABOVE_STANDARD_LIMIT", `mass ${measured.mass} exceeds the maximum standard mass`);
      if (measured.minimumFeeSompi <= fee) {
        const unsigned = make(selected, fee).tx;
        const signatures = selected.map((_, i) => String(k.createInputSignature(unsigned, i, key, k.SighashType.All)));
        const { tx, change } = make(selected, fee, signatures);
        return {
          rpcTransaction: parseWasmTxToRpc(tx.serializeToObject()),
          txId: String(tx.id),
          outputIndex: 0,
          feeSompi: fee,
          changeSompi: change,
          spent: selected.map((s) => s.outpoint)
        };
      }
      fee = measured.minimumFeeSompi;
    }
  }
  throw fundingError("FUNDING_INSUFFICIENT", `the given outputs cannot cover ${request.valueSompi} sompi plus the fee`);
}
