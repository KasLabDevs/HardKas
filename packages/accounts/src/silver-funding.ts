import { assertMainnetTransactionsDisabled, loadManagedKaspaWasmSync } from "@hardkas/core";
import { calculateUpstreamStorageMass, measureBuiltTransactionNodeMass } from "@hardkas/tx-builder";
import { parseWasmTxToRpc } from "./internal/wasm-rpc-serialization.js";
import type { SilverContractUtxo } from "./silver-spend.js";

/**
 * Funding a script (P2SH) output from a key's P2PK outputs, as a v0
 * transaction: the script output first, the change back to the key's address.
 * Inputs are taken in the given order until they cover the value and the fee;
 * the committed storage mass and the signatures come from the SDK.
 *
 * G3 · the fee is the node's relay floor (100 sompi/g of compute mass) and the
 * masses must be within the node's limits (tx-builder
 * measureBuiltTransactionNodeMass); the SDK's fee charged the storage mass, and
 * its 100,000 g limit refused small script outputs the node relays.
 *
 * G7-l · a transaction above the storage-mass limit because of a small output is
 * refused naming that output, as the payment planner refuses it (generator-plan
 * `refusal`): CHANGE_BELOW_STANDARD_OUTPUT when the change is the smaller one,
 * OUTPUT_BELOW_STANDARD_AMOUNT when the script output is. Like the payment
 * planner, the remainder is never paid to the miner and no further output is
 * taken to grow it.
 */

/** A P2PK Schnorr unlock at its final length (OP_DATA_65 + signature + SIGHASH_ALL), for the node's mass. */
const P2PK_SIGNATURE_PLACEHOLDER = "41" + "00".repeat(65);

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
  // CA-TX-05 / HK-12: this constructor signs; the product's mainnet policy decides first (MAINNET_SIGNING_DISABLED)
  assertMainnetTransactionsDisabled("sign", [request?.networkId], "buildScriptFunding");
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
    // The node's masses of the final shape: each P2PK input with a placeholder unlock of the signed length.
    let fee = 0n;
    for (let round = 0; round < 8; round++) {
      if (total < request.valueSompi + fee) break;
      const { tx: placed, change } = make(selected, fee, selected.map(() => P2PK_SIGNATURE_PLACEHOLDER));
      const measured = measureBuiltTransactionNodeMass(placed, {
        inputs: selected.map((s) => ({ amountSompi: s.amountSompi, scriptBytes: own.script.length / 2, covenantId: false })),
        outputs: [
          { amountSompi: request.valueSompi, scriptBytes: lock.script.length / 2, covenantId: false },
          ...(change > 0n ? [{ amountSompi: change, scriptBytes: own.script.length / 2, covenantId: false }] : [])
        ]
      });
      if (!measured.relayable) {
        if (measured.exceeded?.mass === "storage") {
          // before the fee is known (fee 0) the change is the whole remainder: price the fee first, then judge the change
          // it really leaves (or, if the remainder cannot pay it, take the next output)
          if (fee === 0n && change > 0n) {
            fee = measured.minimumFeeSompi;
            continue;
          }
          // G7-l: the payment planner's rule — the smaller output is what broke the limit
          if (change > 0n && change <= request.valueSompi) {
            throw fundingError(
              "CHANGE_BELOW_STANDARD_OUTPUT",
              `the change this funding leaves (${change} sompi) is too small for a standard output: ${measured.exceededText}. ` +
                "Fund a slightly different amount, or from outputs that leave no change or a larger one. Nothing was signed."
            );
          }
          throw fundingError(
            "OUTPUT_BELOW_STANDARD_AMOUNT",
            `the script output of ${request.valueSompi} sompi is too small for a standard output from these outputs: ${measured.exceededText}. ` +
              "Fund a larger amount. Nothing was signed."
          );
        }
        throw fundingError("TX_MASS_ABOVE_STANDARD_LIMIT", `${measured.exceededText}. Nothing was signed.`);
      }
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
