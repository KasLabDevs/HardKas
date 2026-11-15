import { HardkasError, assertMainnetTransactionsDisabled, declaredNetworkIdOf, loadManagedKaspaWasmSync, silverP2shLock } from "@hardkas/core";
import { buildV1WasmTransaction, createWorkspaceV1Facts, v1NodeUtxoOf, v1SignedArtifact, type V1EngineFacts } from "@hardkas/accounts";
import type { TxPlanArtifact, ZkVerificationFact } from "@hardkas/artifacts";
import type { Hardkas } from "../index.js";
import type { HardkasTx } from "../tx.js";
import type { R0Groth16LocalVerificationResult } from "./risc0-groth16.js";
import {
  buildR0Groth16Transaction,
  verifyR0Groth16Scripts,
  type R0Groth16ScriptsResult,
  type R0Groth16TxResult,
  type ToccataFeePolicyOptions
} from "./toccata.js";

/*
 * ZK-SEND-1 · a RISC Zero Groth16 lock spent through HardKAS's send machinery. The Testnet-10 runs of 13-nov sent the
 * builder's transaction with the raw RPC client because nothing else could send it: no step turned the spend into a
 * signed artifact bound to its plan, and sdk.tx.send's v1 check (preflightV1Send -> validateV1Transition) refused every
 * p2sh input without a SilverScript contract (V1_P2SH_UNLOCK_UNAVAILABLE), the plan said storage mass "0" (the check
 * recomputes the node's value) and called a bound change output "change" (change goes only to the funder, here the P2SH).
 * Now: the plan states the node's storage mass and declares its outputs as payments; the signed artifact is the plan's
 * transaction with the lock's signature script (the v1 engine's own artifact, v1SignedArtifact); and the send check is
 * given the lock's unlock (the EXPERIMENTAL V1EngineFacts.p2shUnlock, set only here), which it checks against the input's
 * P2SH script itself. Everything else is sdk.tx.send's: one submission per txId, the node's identity and network, a
 * synced node, the v1 preflight (inputs unspent and unchanged, not pending, fee floor and masses by the node's rules),
 * the fee limit, the records.
 */

export interface ZkSpendParams {
  /** The lock: a successful buildR0Groth16Scripts result. Checked again here (verifyR0Groth16Scripts), never trusted. */
  readonly scripts: R0Groth16ScriptsResult;
  /** The lock's UTXO. Without `amountSompi` the amount is read from the node (this instance's client). */
  readonly utxo: { readonly transactionId: string; readonly index: number; readonly amountSompi?: bigint | undefined };
  /** proof-only: where the UTXO (minus the fee) goes. proof-and-output-bound: optional, it must be the bound payout. */
  readonly destinationAddress?: string | undefined;
  readonly feeSompi?: bigint | undefined;
  readonly feeOptions?: ToccataFeePolicyOptions | undefined;
  readonly computeBudget?: number | undefined;
  /** A verifyR0Groth16ReceiptLocal result for this receipt (sets the fact's verifiedOffChain). */
  readonly localVerification?: R0Groth16LocalVerificationResult | undefined;
  /** The endpoint to send to: it must be this instance's client's (sdk.tx.send, ENDPOINT-AUTHORITY-1). */
  readonly url?: string | undefined;
  /** sdk.tx.send's explicit escape for a controlled local network (simnet/devnet only). */
  readonly allowUnsyncedNode?: boolean | undefined;
}

export interface ZkSpendResult {
  readonly txId: string;
  readonly networkId: "simnet" | "testnet-10";
  /** The builder's result (fee, masses, warnings, the fact). */
  readonly built: R0Groth16TxResult;
  readonly plan: TxPlanArtifact;
  readonly planPath?: string | undefined;
  readonly signed: Record<string, any>;
  readonly signedPath?: string | undefined;
  readonly zkFact?: ZkVerificationFact | undefined;
  readonly zkFactPath?: string | undefined;
  /** sdk.tx.send's result: the submission record, `submitted`, `alreadySubmitted`, `rejection`. */
  readonly send: Awaited<ReturnType<HardkasTx["send"]>>;
}

const spendError = (code: string, message: string, metadata?: Record<string, unknown>) =>
  new HardkasError(code, `${message} Nothing was sent.`, metadata ? { metadata } : undefined);

const spkHexOf = (spk: { version: number | bigint; script: string }) => Number(spk.version).toString(16).padStart(4, "0") + String(spk.script).toLowerCase();

/**
 * The lock is one HardKAS builds and verify-scripts accepts: the pinned RISC Zero verifier, a redeem script byte-identical
 * to HardKAS's for the parameters it carries (and, for an output-bound lock, the outputs it says it binds), a signature
 * script that ends with that redeem script, and a P2SH script that is the hash of it. ZK_SPEND_LOCK_REFUSED otherwise.
 */
export function assertSpendableZkLock(scripts: R0Groth16ScriptsResult): void {
  if (!scripts || scripts.ok !== true || typeof scripts.redeemScript !== "string" || typeof scripts.sigScript !== "string" || scripts.redeemScript === "") {
    throw spendError("ZK_SPEND_LOCK_REFUSED", "The lock is not a successful buildR0Groth16Scripts result.");
  }
  const policy = scripts.bindingMode === "proof-and-output-bound" ? scripts.bindingPolicy : undefined;
  const check = verifyR0Groth16Scripts({
    redeemScript: scripts.redeemScript,
    sigScript: scripts.sigScript,
    imageId: scripts.imageId,
    journalHash: scripts.journalHash,
    expectedBindingMode: scripts.bindingMode,
    ...(policy
      ? {
          expectedPayoutAddress: policy.payout.address,
          expectedPayoutAmount: policy.payout.amountSompi,
          ...(policy.change ? { expectedChangeAddress: policy.change.address, expectedChangeAmount: policy.change.amountSompi } : {})
        }
      : {})
  });
  if (!check.ok || !check.redeemScriptCanonical || !check.verifyingKeyPinned || !check.controlRootPinned || !check.controlIdPinned || !check.redeemScriptEmbedded) {
    throw spendError(
      "ZK_SPEND_LOCK_REFUSED",
      `The lock is not one HardKAS spends: verify-scripts refuses it (${check.issues.map((i) => i.code).join(", ") || "not canonical over the pinned verifier"}).`,
      { issues: check.issues.map((i) => i.code) }
    );
  }
  if (spkHexOf(silverP2shLock(scripts.redeemScript.toLowerCase())) !== spkHexOf(scripts.p2shScriptPublicKey)) {
    throw spendError("ZK_SPEND_LOCK_REFUSED", "The lock's P2SH script is not the hash of its redeem script.");
  }
}

/**
 * EXPERIMENTAL · the send check's facts for a ZK spend: the workspace's contract facts, plus the lock's unlock for its p2sh
 * input (V1EngineFacts.p2shUnlock). Only the input that spends this lock gets it; the validator checks its redeem script
 * hashes to the input's script, and that the signed script is exactly it.
 */
export function zkSpendV1Facts(workspaceRoot: string, scripts: R0Groth16ScriptsResult): V1EngineFacts {
  const lockSpk = spkHexOf(scripts.p2shScriptPublicKey);
  const unlock = scripts.sigScript.toLowerCase();
  return {
    ...createWorkspaceV1Facts({ workspaceRoot }),
    p2shUnlock: ({ plan, inputIndex }) => {
      const input = (plan?.inputs ?? [])[inputIndex];
      if (input?.kind !== "p2sh" || input?.contract !== undefined || String(input?.scriptPublicKey ?? "").toLowerCase() !== lockSpk) {
        throw Object.assign(new Error(`ZK_SPEND_UNLOCK_UNAVAILABLE: input ${inputIndex} does not spend this ZK lock; this spend supplies no unlock for it`), {
          code: "ZK_SPEND_UNLOCK_UNAVAILABLE"
        });
      }
      return { unlockScript: unlock };
    }
  };
}

/**
 * ZK-SEND-1 · plans, records and sends the spend of a RISC Zero Groth16 lock through sdk.tx.send. In order, before anything
 * is read from a node: mainnet refused (MAINNET_BROADCAST_DISABLED, any spelling, any alias that declares it); a simulator
 * instance refused (ZK_SPEND_NODE_REQUIRED: no simulator runs the precompile); only simnet and testnet-10
 * (ZK_SPEND_NETWORK_UNSUPPORTED), testnet-10 only behind the payments' opt-in (experimental: true and
 * network.allowPublic: true; PUBLIC_NETWORK_BLOCKED); the lock checked (assertSpendableZkLock). Then the UTXO's amount
 * (from the node when not given), the builder (any issue is ZK_SPEND_BUILD_REFUSED with its codes), the plan, the signed
 * artifact and the ZK fact written to the store, and the one send. A rejection by the node is the send's recorded result
 * (`send.rejection`), never retried.
 */
export async function spendR0Groth16Lock(sdk: Hardkas, params: ZkSpendParams): Promise<ZkSpendResult> {
  const network = String(sdk.network);
  const config: any = sdk.config?.config;
  const declared = declaredNetworkIdOf(config, network) ?? network;
  assertMainnetTransactionsDisabled("broadcast", [network, declared, (sdk.execution as any)?.network], "zk.toccata.spend");
  if ((sdk.execution as any)?.mode === "simulator") {
    throw spendError("ZK_SPEND_NODE_REQUIRED", `This instance runs the simulator (network ${network}), which cannot run the Groth16 precompile: a ZK spend goes to a Kaspa node.`);
  }
  if ((network !== "simnet" && network !== "testnet-10") || declared !== network) {
    throw spendError("ZK_SPEND_NETWORK_UNSUPPORTED", `A ZK spend runs on simnet or testnet-10; this instance runs ${network} (declared ${declared}).`);
  }
  const networkId = network as "simnet" | "testnet-10";
  if (networkId === "testnet-10" && !((sdk as any).policy?.allowPublic === true && config?.experimental === true)) {
    throw new HardkasError(
      "PUBLIC_NETWORK_BLOCKED",
      "testnet-10 needs the same opt-in as payments there: experimental: true and network.allowPublic: true in hardkas.config.ts. Nothing was sent."
    );
  }
  assertSpendableZkLock(params.scripts);
  const scripts = params.scripts;
  const policy = scripts.bindingMode === "proof-and-output-bound" ? scripts.bindingPolicy : undefined;
  const destinationAddress = String(params.destinationAddress ?? policy?.payout.address ?? "").trim();
  if (!destinationAddress) throw spendError("ZK_SPEND_DESTINATION_REQUIRED", "A proof-only lock is spent to a destination address: give one.");

  if (typeof params.utxo?.transactionId !== "string" || !/^[0-9a-f]{64}$/i.test(params.utxo.transactionId) || !Number.isInteger(params.utxo.index) || params.utxo.index < 0) {
    throw spendError("ZK_SPEND_UTXO_INVALID", "The UTXO is a 64-hex transaction id and a non-negative output index.");
  }
  const transactionId = params.utxo.transactionId.toLowerCase();
  let amountSompi = params.utxo.amountSompi;
  if (amountSompi === undefined) {
    const p2sh = networkId === "testnet-10" ? scripts.p2shAddresses.testnet10 : scripts.p2shAddresses.simnet;
    if (!p2sh) throw spendError("ZK_P2SH_ADDRESS_UNAVAILABLE", `The lock carries no P2SH address for ${networkId}.`);
    const key = `${transactionId}:${params.utxo.index}`;
    const listed = ((await (sdk.rpc as any).getUtxosByAddress(p2sh)) ?? []).map((u: any) => v1NodeUtxoOf(u)).find((n: any) => n?.key === key);
    if (!listed) throw spendError("ZK_SPEND_UTXO_NOT_FOUND", `${key} is not an unspent output of the lock ${p2sh} at the node.`);
    if (listed.utxo.covenantId !== undefined) throw spendError("ZK_SPEND_UTXO_NOT_FOUND", `${key} belongs to covenant ${listed.utxo.covenantId}, not to this lock.`);
    amountSompi = BigInt(listed.utxo.amountSompi);
  }
  if (typeof amountSompi !== "bigint" || amountSompi <= 0n) throw spendError("ZK_SPEND_UTXO_INVALID", "The UTXO's amount is a positive number of sompi.");

  const built = buildR0Groth16Transaction({
    scripts,
    utxo: { transactionId, index: params.utxo.index, amountSompi },
    destinationAddress,
    networkId,
    ...(params.feeSompi !== undefined ? { feeSompi: params.feeSompi } : {}),
    ...(params.feeOptions !== undefined ? { feeOptions: params.feeOptions } : {}),
    ...(params.computeBudget !== undefined ? { computeBudget: params.computeBudget } : {}),
    ...(params.localVerification !== undefined ? { localVerification: params.localVerification } : {})
  });
  if (!built.ok || !built.planArtifact) {
    throw spendError("ZK_SPEND_BUILD_REFUSED", `The spend was not built: ${built.issues.map((i) => `${i.code}: ${i.message}`).join("; ")}.`, {
      issues: built.issues.map((i) => i.code)
    });
  }
  const plan = built.planArtifact;
  const k: any = loadManagedKaspaWasmSync();
  const tx = buildV1WasmTransaction(k, plan as any, [scripts.sigScript.toLowerCase()]);
  if (String(tx.id) !== built.transactionId) {
    throw spendError("ZK_SPEND_TXID_MISMATCH", `The plan's transaction is ${String(tx.id)}, the builder's ${built.transactionId}.`);
  }
  const { signed } = v1SignedArtifact(plan as any, tx);

  const planWrite = await sdk.artifacts.write(plan as any);
  const signedWrite = await sdk.artifacts.write(signed as any);
  const factWrite = built.zkFact ? await sdk.artifacts.write(built.zkFact as any) : undefined;

  const send = await sdk.tx.send(signed as any, {
    ...(params.url !== undefined ? { url: params.url } : {}),
    ...(params.allowUnsyncedNode !== undefined ? { allowUnsyncedNode: params.allowUnsyncedNode } : {}),
    v1Facts: zkSpendV1Facts(sdk.workspace.root, scripts)
  });
  return {
    txId: String(send.txId ?? built.transactionId),
    networkId,
    built,
    plan,
    ...(planWrite?.absolutePath ? { planPath: planWrite.absolutePath } : {}),
    signed,
    ...(signedWrite?.absolutePath ? { signedPath: signedWrite.absolutePath } : {}),
    ...(built.zkFact ? { zkFact: built.zkFact } : {}),
    ...(factWrite?.absolutePath ? { zkFactPath: factWrite.absolutePath } : {}),
    send
  };
}
