import { Hono } from "hono";
import {
  createEscrow,
  escrowResolution,
  escrowSigners,
  type EscrowBranch,
  type EscrowConfig,
  type EscrowState,
  type EscrowArtifact,
  type EscrowCompileProvenance
} from "@hardkas/escrow";
import crypto from "node:crypto";
import { JsonWrpcKaspaClient, type OfficialRpcFactory } from "@hardkas/kaspa-rpc";
import { nodeRpcUrl } from "@hardkas/core";
import { AtomicJournalEscrowStore } from "../store/atomic-journal.js";

export type EscrowDomainState =
  | "CREATED"
  | "FUNDED"
  | "PARTIALLY_SIGNED"
  | "READY_TO_RELEASE"
  | "RELEASED";

type ResolutionBranch = EscrowBranch;

// Who receives what per branch. The arbiter branches are fixed by the contract;
// mutualRelease leaves the destination to the signers and this app pays the buyer.
const resolutionPolicy: Record<string, { requiredSigners: string[]; recipient: string; amountKey: string }> = {
  mutualRelease: { requiredSigners: ["buyer", "seller"], recipient: "buyer", amountKey: "refundAmount" },
  refundBuyer: { requiredSigners: ["buyer", "arbiter"], recipient: "buyer", amountKey: "refundAmount" },
  releaseToSeller: { requiredSigners: ["seller", "arbiter"], recipient: "seller", amountKey: "releaseAmount" }
};

// CANONICAL-RPC-URL: the canonical localnet endpoint comes from @hardkas/core, never a copy.
const RPC_URL = nodeRpcUrl();
const NETWORK_ID = "simnet";

export interface EscrowRecord {
  id: string;
  config: EscrowConfig;
  state: EscrowDomainState;
  artifact: EscrowArtifact;
  p2shState: EscrowState;
  provenance: EscrowCompileProvenance;

  funding: {
    /**
     * "broadcast" = accepted by the node mempool; "confirmed" only after observing it in the chain;
     * "verification_timeout" = sent, outcome not known yet (ESCROW-SAFETY-2: never funded again before reconcile).
     */
    status: "none" | "broadcast" | "confirmed" | "failed" | "verification_timeout";
    transactionId?: string | undefined;
    outputIndex?: number | undefined;
    amountSompi?: string | undefined;
    feeSompi?: string | undefined;
    utxoEntry?: any;
    /** ESCROW-SAFETY-2: the chain block the node's virtual chain ended at before it was sent (where reconcile looks from). */
    observeFrom?: string | undefined;
  };

  preparedRelease?: {
    branch: string;
    /** hardkas.silver.spendDraft.v1: the one transaction every signer signs. */
    draft: any;
    args: { kind: "signer"; signer: string }[];
    expectedOutputsHash: string;
    policyHash: string;
  };

  /** 65-byte sig values (hex), by role. */
  signatures: {
    buyer?: string;
    seller?: string;
    arbiter?: string;
  };

  release?: {
    transactionId: string;
    fundingOutpoint: string;
    expectedOutputsHash: string;
    actualOutputsHash: string;
    /** Undefined when it cannot be derived from recorded amounts. */
    feeSompi?: string | undefined;
    status: "broadcast" | "confirmed" | "failed" | "verification_timeout";
    /** ESCROW-SAFETY-2: the chain block the node's virtual chain ended at before it was sent. */
    observeFrom?: string | undefined;
  } | undefined;
}

/** Persistent, atomic journal-backed store; compatible with Map<string, EscrowRecord>. */
export const memoryStore = new AtomicJournalEscrowStore();
export const escrowStore = memoryStore;

export const escrowRoutes = new Hono();

const outputsHash = (outputs: unknown) => crypto.createHash("sha256").update(JSON.stringify(outputs)).digest("hex");

/*
 * ESCROW-SAFETY-2 · the protections HardKAS's own sends have, reused here:
 *  - the node must say it serves simnet before anything is sent (NODE-NETWORK-IDENTITY-1), and a submission is accepted
 *    only under the txId it was built with (EXPECTED-TXID-1);
 *  - a submission whose outcome is unknown (the request may have left) is recorded with its txId and never followed by
 *    another funding or another release before reconcile has looked (ESCROW-BROADCAST-SAFETY-1's rule);
 *  - the funding leaves out outpoints the node's mempool is already spending (AUD-19);
 *  - every required signature is verified (BIP340, SIGHASH_ALL) before the release is sent (the draft engine's check);
 *  - "confirmed" is what the SDK's observer sees: the node has no transaction lookup by id (no getTransaction), so the
 *    acceptance is read from its virtual chain, from the chain block recorded before the send.
 */

/** ESCROW-SAFETY-2 · the node client of these routes. Exported so tests can hand a stand-in official client; not part of the HTTP surface. */
export const escrowNode: { rpcFactory?: OfficialRpcFactory | undefined } = {};
function nodeClient(timeoutMs?: number): JsonWrpcKaspaClient {
  return new JsonWrpcKaspaClient({
    rpcUrl: RPC_URL,
    expectedNetworkId: NETWORK_ID,
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(escrowNode.rpcFactory ? { rpcFactory: escrowNode.rpcFactory } : {})
  });
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The chain block the node's virtual chain ends at now (undefined when it does not say). */
async function sinkOf(rpc: JsonWrpcKaspaClient): Promise<string | undefined> {
  try {
    const sink = (await rpc.getBlockDagInfo()).sink;
    return typeof sink === "string" && /^[0-9a-f]{64}$/.test(sink) ? sink : undefined;
  } catch {
    return undefined;
  }
}

type SubmitOutcome =
  | { outcome: "accepted"; txId: string }
  | { outcome: "not-sent"; message: string }
  | { outcome: "rejected"; message: string }
  | { outcome: "unknown"; message: string };

/**
 * One submission under its expected txId, and what it established: not sent (nothing reached the node), the node's own
 * refusal (final), or an unknown outcome (the node may hold the transaction).
 */
async function submitOnce(rpc: JsonWrpcKaspaClient, rpcTransaction: any, expectedTxId: string): Promise<SubmitOutcome> {
  const { acceptedTxIdOf, isNodeNetworkIdentityError, isRpcRequestNotSentError } = await import("@hardkas/kaspa-rpc");
  const { submitOutcomeOf } = await import("@hardkas/artifacts");
  let res: unknown;
  try {
    res = await rpc.submitTransaction(rpcTransaction, { allowOrphan: false, expectedTxId } as any);
  } catch (e) {
    const message = messageOf(e);
    if (isRpcRequestNotSentError(e) || isNodeNetworkIdentityError(e)) return { outcome: "not-sent", message };
    if (submitOutcomeOf({ accepted: false, error: message }) === "rejected") return { outcome: "rejected", message };
    return { outcome: "unknown", message };
  }
  try {
    return { outcome: "accepted", txId: acceptedTxIdOf(res, expectedTxId) };
  } catch (e) {
    return { outcome: "unknown", message: messageOf(e) };
  }
}

/** Findings of the SDK's observer that mean a chain block of this node accepted the transaction. */
const CHAIN_ACCEPTED = new Set(["chain_accepted", "finality_reached"]);

/** One look at the node about `txId` (the SDK's observer: its mempool, then its virtual chain from `since`). */
async function observeOnce(rpc: JsonWrpcKaspaClient, txId: string, since: string | undefined): Promise<{ finding: string; error?: string }> {
  try {
    const { observeTxOnce, rpcObserverFor } = await import("@hardkas/sdk");
    const { deriveObserverId } = await import("@hardkas/artifacts");
    const { systemRuntimeContext } = await import("@hardkas/core");
    const look = await observeTxOnce(
      rpcObserverFor(rpc),
      { txId, observerId: deriveObserverId({ kind: "rpc", target: NETWORK_ID, locator: RPC_URL }), ...(since ? { since } : {}), networkId: NETWORK_ID as any, mode: "rpc" as any },
      systemRuntimeContext
    );
    return { finding: look.finding.type };
  } catch (e) {
    return { finding: "unobservable", error: messageOf(e) };
  }
}

/**
 * Whether every signer the branch requires signed this spend: each signature valid (BIP340, SIGHASH_ALL) for the
 * finalized transaction, as the client sends it, and the recorded funding output, by the key the escrow names for that
 * role. The reason it is not, otherwise.
 */
async function invalidReleaseSignature(record: EscrowRecord, requiredSigners: readonly string[], finalized: { rpcTransaction: any; txId: string }): Promise<string | undefined> {
  const { officialTransactionWithUtxos } = await import("@hardkas/kaspa-rpc");
  const { kaspaSighashInputsFromWasm, verifyKaspaInputSignature } = await import("@hardkas/core");
  const input = record.preparedRelease!.draft.input;
  const script = { version: Number(input.scriptPublicKey.version), script: String(input.scriptPublicKey.script).toLowerCase() };
  const amount = BigInt(input.amountSompi);
  let tx: ReturnType<typeof kaspaSighashInputsFromWasm>["tx"];
  try {
    const built = officialTransactionWithUtxos(finalized.rpcTransaction, [{ amount, scriptPublicKey: script.version.toString(16).padStart(4, "0") + script.script }]);
    if (built.id !== String(finalized.txId).toLowerCase()) return `the finalized spend rebuilds to ${built.id}, not ${finalized.txId}`;
    tx = kaspaSighashInputsFromWasm(built.serialized).tx;
  } catch (e) {
    return `the finalized spend cannot be rebuilt to check its signatures (${messageOf(e)})`;
  }
  for (const role of requiredSigners) {
    const signature = String((record.signatures as Record<string, string | undefined>)[role] ?? "").toLowerCase();
    const publicKey = String((record.config as any)[role]?.publicKeyHex ?? "").toLowerCase();
    if (!verifyKaspaInputSignature({ tx, inputIndex: 0, utxo: { amount, scriptPublicKey: script }, publicKey, signature })) {
      return `the ${role}'s signature is not valid for this spend (BIP340, SIGHASH_ALL) by the ${role}'s key`;
    }
  }
  return undefined;
}

/** A node UTXO entry as the SilverScript spend builders take it. */
function toContractUtxo(entry: any) {
  const u = entry.utxoEntry ?? entry;
  const spk = u.scriptPublicKey;
  const scriptPublicKey =
    spk && typeof spk === "object"
      ? { version: Number(spk.version ?? 0), script: String(spk.scriptPublicKey ?? spk.script ?? "") }
      : { version: parseInt(String(spk).slice(0, 4), 16) || 0, script: String(spk).slice(4) };
  return {
    outpoint: { transactionId: entry.outpoint.transactionId, index: Number(entry.outpoint.index) },
    amountSompi: BigInt(u.amount),
    scriptPublicKey,
    blockDaaScore: BigInt(u.blockDaaScore ?? 0),
    isCoinbase: !!u.isCoinbase
  };
}

/** The local dev account whose x-only Schnorr key (as the v1 escrow takes it) is `xOnlyHex`. */
async function findDevAccount(xOnlyHex: string) {
  const { listDevAccountsSync, getOrCreateDevAccount, loadKaspaWasm } = await import("@hardkas/accounts");
  const k = await loadKaspaWasm();
  const accounts = listDevAccountsSync(process.cwd());
  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    if (!acc) continue;
    const full = await getOrCreateDevAccount(process.cwd(), i, acc.name);
    const xOnly = String(new k.PrivateKey(full.privateKey).toPublicKey().toXOnlyPublicKey().toString());
    if (xOnly === String(xOnlyHex).toLowerCase()) return full;
  }
  return null;
}

escrowRoutes.post("/", async (c) => {
  try {
    const config: EscrowConfig = await c.req.json();
    const result = await createEscrow(config, { networkId: NETWORK_ID });

    // Anti-replay / uniqueness guard: check for existing active escrow at same address
    const duplicate = Array.from(memoryStore.values()).find(
      (r) => r.p2shState.address === result.state.address && r.state !== "RELEASED"
    );
    if (duplicate) {
      return c.json(
        {
          ok: false,
          error: `ESCROW_ADDRESS_ALREADY_ACTIVE: active escrow ${duplicate.id} already exists for address ${result.state.address}. Escrow nonce ensures uniqueness; do not reuse parameters without nonce.`
        },
        409
      );
    }

    const id = crypto.randomUUID();
    memoryStore.set(id, {
      id,
      config: result.effectiveConfig ?? config,
      state: "CREATED",
      artifact: result.artifact,
      p2shState: result.state,
      provenance: result.provenance,
      funding: { status: "none" },
      signatures: {}
    });

    return c.json({ ok: true, data: { id, p2shAddress: result.state.address, status: "CREATED", provenance: result.provenance } });
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500);
  }
});

escrowRoutes.get("/:id", (c) => {
  const id = c.req.param("id");
  const record = memoryStore.get(id);
  if (!record) return c.json({ ok: false, error: "Not found" }, 404);
  return c.json({ ok: true, data: { ...record, artifact: undefined } });
});

escrowRoutes.post("/:id/fund", async (c) => {
  try {
    const id = c.req.param("id");
    const record = memoryStore.get(id);
    if (!record) return c.json({ ok: false, error: "Not found" }, 404);
    // ESCROW-SAFETY-2: an escrow is funded once; a funding whose outcome is unknown is reconciled, never followed by another
    if (record.funding.status !== "none") {
      return c.json(
        {
          ok: false,
          error:
            record.funding.status === "verification_timeout"
              ? `ESCROW_FUNDING_OUTCOME_UNKNOWN: funding ${record.funding.transactionId} was sent and its outcome is not known; reconcile it before funding again. Nothing was sent.`
              : `ESCROW_ALREADY_FUNDED: this escrow already has a funding (${record.funding.transactionId}, ${record.funding.status}). Nothing was sent.`
        },
        409
      );
    }

    const buyerAccount = await findDevAccount(record.config.buyer.publicKeyHex);
    if (!buyerAccount) {
      return c.json({ ok: false, error: "ESCROW_BUYER_ACCOUNT_NOT_FOUND: no local account matches the buyer public key" }, 400);
    }

    let totalAmount: bigint;
    const isLegacy = record.config.version === "v1" || (!record.config.version && !record.config.principal && !record.config.mode && !record.config.feeBudgetSompi);
    if (isLegacy) {
      totalAmount = BigInt(record.config.refundAmount ?? 0) + BigInt(record.config.releaseAmount ?? 0);
    } else if (record.config.mode === "split" || (record.config.buyerAmount !== undefined && record.config.sellerAmount !== undefined)) {
      const bAmt = BigInt(record.config.buyerAmount ?? record.config.refundAmount ?? 0);
      const sAmt = BigInt(record.config.sellerAmount ?? record.config.releaseAmount ?? 0);
      const feeBudget = BigInt(record.config.feeBudgetSompi ?? 2_000_000n);
      totalAmount = bAmt + sAmt + feeBudget;
    } else {
      const principal = BigInt(record.config.principal ?? (record.config.refundAmount !== undefined ? record.config.refundAmount : record.config.releaseAmount) ?? 0);
      const feeBudget = BigInt(record.config.feeBudgetSompi ?? 2_000_000n);
      totalAmount = principal + feeBudget;
    }

    const fundingEntry = {
      amount: totalAmount.toString(),
      scriptPublicKey: { version: 0, scriptPublicKey: record.p2shState.lockingScriptHex },
      // Not observed yet; the signature hash does not cover it.
      blockDaaScore: "0",
      isCoinbase: false
    };
    const rpc = nodeClient();
    let funded: { txId: string; feeSompi: bigint; observeFrom?: string | undefined };
    try {
      const utxosRes = await rpc.getUtxosByAddresses([buyerAccount.address]);
      if (!utxosRes.entries || utxosRes.entries.length === 0) throw new Error("Buyer account has no UTXOs.");
      // COVENANT-UTXO-PAYMENT-FILTER-1: funding an escrow never spends a covenant's UTXO (that would end the covenant)
      const { isCovenantUtxo, observePendingSpends } = await import("@hardkas/tx-builder");
      const ordinaryEntries = utxosRes.entries.filter((e: any) => !isCovenantUtxo(e));
      if (ordinaryEntries.length === 0) {
        throw new Error(`Buyer account has no UTXOs a funding may spend (${utxosRes.entries.length} covenant UTXO(s) left out).`);
      }
      // ESCROW-SAFETY-2 (AUD-19): what a transaction in the node's mempool already spends is never chosen again (no
      // mempool evidence, no funding)
      const pending = new Set([...(await observePendingSpends(rpc as any, buyerAccount.address)).outpoints].map((o) => o.toLowerCase()));
      const unspentEntries = ordinaryEntries.filter((e: any) => !pending.has(`${String(e.outpoint.transactionId).toLowerCase()}:${Number(e.outpoint.index)}`));
      if (unspentEntries.length === 0) {
        throw new Error(`Buyer account has no UTXOs a funding may spend (${ordinaryEntries.length} being spent by transactions in the node's mempool).`);
      }
      const rawUtxos = unspentEntries.map(toContractUtxo);
      // Filter immature coinbase UTXOs via upstream network params (M10-D2).
      const dag = await rpc.getBlockDagInfo();
      if (dag.virtualDaaScore === undefined) {
        throw new Error("ESCROW_FUND_VIRTUAL_DAA_MISSING: node did not report virtualDaaScore; cannot enforce coinbase maturity.");
      }
      const virtualDaaScore = BigInt(dag.virtualDaaScore);
      const { filterMatureUtxos } = await import("@hardkas/tx-builder");
      const { mature } = filterMatureUtxos<any>({
        networkId: NETWORK_ID,
        virtualDaaScore,
        utxos: rawUtxos,
        readEntry: (u: any) => ({ blockDaaScore: BigInt(u.blockDaaScore ?? 0), isCoinbase: Boolean(u.isCoinbase) })
      });
      if (mature.length === 0) throw new Error("Buyer account has no MATURE UTXOs.");
      const utxos = mature.sort((a: any, b: any) => (a.blockDaaScore < b.blockDaaScore ? -1 : a.blockDaaScore > b.blockDaaScore ? 1 : 0));

      // Fee, storage mass and signatures from the SDK.
      const { buildScriptFunding } = await import("@hardkas/accounts");
      const built = buildScriptFunding({
        utxos,
        privateKey: buyerAccount.privateKey,
        lockingScript: { version: 0, script: record.p2shState.lockingScriptHex },
        valueSompi: totalAmount,
        networkId: NETWORK_ID
      });
      const observeFrom = await sinkOf(rpc);

      // Write-ahead intent before network transmission
      record.funding = {
        status: "verification_timeout",
        transactionId: built.txId,
        outputIndex: 0,
        amountSompi: totalAmount.toString(),
        feeSompi: built.feeSompi.toString(),
        utxoEntry: fundingEntry,
        ...(observeFrom ? { observeFrom } : {})
      };
      memoryStore.set(id, record);

      const sent = await submitOnce(rpc, built.rpcTransaction, built.txId);
      if (sent.outcome === "unknown") {
        return c.json(
          {
            ok: false,
            error: `ESCROW_FUNDING_OUTCOME_UNKNOWN: ${sent.message}. The node may hold funding ${built.txId}; it was not sent again. Reconcile it before anything else.`,
            data: { txId: built.txId, status: record.funding.status }
          },
          504
        );
      }
      if (sent.outcome === "rejected" || sent.outcome === "not-sent") {
        record.funding = { status: "none" };
        memoryStore.set(id, record);
        throw new Error(`${sent.outcome === "not-sent" ? "nothing was sent" : "the node refused it"}: ${sent.message}`);
      }
      funded = { txId: sent.txId, feeSompi: built.feeSompi, observeFrom };
    } catch (rpcErr: any) {
      if (record.funding.status !== "verification_timeout") {
        record.funding = { status: "none" };
        memoryStore.set(id, record);
      }
      return c.json({ ok: false, error: `ESCROW_FUNDING_FAILED: ${rpcErr?.message || String(rpcErr)}` }, 502);
    } finally {
      await rpc.close().catch(() => {});
    }

    record.funding.status = "broadcast";
    record.funding.transactionId = funded.txId;
    record.funding.outputIndex = 0;
    record.funding.amountSompi = totalAmount.toString();
    record.funding.feeSompi = funded.feeSompi.toString();
    record.funding.utxoEntry = fundingEntry;
    if (funded.observeFrom) record.funding.observeFrom = funded.observeFrom;
    record.state = "FUNDED";
    memoryStore.set(id, record);

    return c.json({ ok: true, data: { txId: funded.txId, status: record.funding.status } });
  } catch (err: any) {
    console.error("Fund error:", err);
    return c.json({ ok: false, error: err.message }, 500);
  }
});

escrowRoutes.post("/:id/reconcile", async (c) => {
  try {
    const id = c.req.param("id");
    const record = memoryStore.get(id);
    if (!record) return c.json({ ok: false, error: "Not found" }, 404);

    const looks: Record<string, { finding: string; error?: string }> = {};
    const fundingPending = record.funding.transactionId !== undefined && (record.funding.status === "verification_timeout" || record.funding.status === "broadcast");
    const releasePending = record.release !== undefined && (record.release.status === "verification_timeout" || record.release.status === "broadcast");
    if (fundingPending || releasePending) {
      const rpc = nodeClient();
      try {
        if (fundingPending) {
          const look = await observeOnce(rpc, record.funding.transactionId!, record.funding.observeFrom);
          looks.funding = look;
          if (CHAIN_ACCEPTED.has(look.finding)) {
            record.funding.status = "confirmed";
          } else if (look.finding === "mempool_entry" && record.funding.status === "verification_timeout") {
            record.funding.status = "broadcast";
          }
          if (record.state === "CREATED" && (record.funding.status === "confirmed" || record.funding.status === "broadcast")) {
            record.state = "FUNDED";
          }
        }
        if (releasePending) {
          const release = record.release!;
          const look = await observeOnce(rpc, release.transactionId, release.observeFrom);
          looks.release = look;
          if (CHAIN_ACCEPTED.has(look.finding)) {
            release.status = "confirmed";
            record.state = "RELEASED";
          } else if (look.finding === "mempool_entry" && release.status === "verification_timeout") {
            release.status = "broadcast";
          }
        }
      } finally {
        await rpc.close().catch(() => {});
      }
    }

    memoryStore.set(id, record);

    return c.json({ ok: true, data: record, observations: looks });
  } catch (err: any) {
    console.error("Reconcile error:", err);
    return c.json({ ok: false, error: err?.message || String(err) }, 500);
  }
});

escrowRoutes.post("/:id/release/prepare", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({})) as any;
    const branch = body?.branch as ResolutionBranch;
    const mutualSplit = body?.mutualSplit as { buyerSompi: bigint; sellerSompi: bigint } | undefined;

    const record = memoryStore.get(id);
    if (!record || !["FUNDED", "PARTIALLY_SIGNED", "READY_TO_RELEASE"].includes(record.state)) return c.json({ ok: false, error: "Not funded" }, 400);

    const fundingUtxo = record.funding.utxoEntry;
    if (!fundingUtxo || record.funding.transactionId === undefined || record.funding.outputIndex === undefined) {
      return c.json({ ok: false, error: "ESCROW_FUNDING_UTXO_UNKNOWN: no recorded funding UTXO to spend" }, 409);
    }

    const mode = record.config.mode ?? (record.config.buyerAmount !== undefined && record.config.sellerAmount !== undefined ? "split" : "full");
    const isLegacy = record.config.version === "v1" || (!record.config.version && !record.config.principal && !record.config.mode && !record.config.feeBudgetSompi);

    const legPolicy = isLegacy ? resolutionPolicy[branch as ResolutionBranch] : undefined;
    let policy: any;
    if (legPolicy) {
      policy = legPolicy;
    } else {
      let signers: readonly string[];
      try {
        signers = escrowSigners(branch as any, mode);
      } catch {
        return c.json({ ok: false, error: "Invalid branch" }, 400);
      }
      policy = { requiredSigners: [...signers] };
    }

    let resolution: ReturnType<typeof escrowResolution>;
    try {
      resolution = escrowResolution(
        record.config,
        branch,
        mutualSplit ? { mutualSplit: { buyerSompi: BigInt(mutualSplit.buyerSompi), sellerSompi: BigInt(mutualSplit.sellerSompi) } } : undefined
      );
    } catch (e: any) {
      return c.json({ ok: false, error: e?.message || "Invalid branch" }, 400);
    }

    let outputs: any[];
    if (resolution.requiredOutputs && resolution.requiredOutputs.length > 0) {
      outputs = resolution.requiredOutputs.map((o) => ({
        amountSompi: o.amountSompi,
        scriptPublicKey: o.scriptPublicKey
      }));
    } else {
      const targetSpk = (policy.recipient === "buyer" ? record.config.buyerDestinationSpk : record.config.sellerDestinationSpk) ?? "";
      const rawAmount = policy.amountKey === "refundAmount" ? record.config.refundAmount : record.config.releaseAmount;
      const amount = BigInt(rawAmount ?? 0);
      outputs = [{ amountSompi: amount, scriptPublicKey: { version: 0 as const, script: targetSpk } }];
    }

    // Safety checks on fee: inputs - outputs = miner fee
    const fundingAmountSompi = BigInt(record.funding.amountSompi ?? fundingUtxo.amount ?? fundingUtxo.amountSompi ?? 0);
    const totalOutputsSompi = outputs.reduce((sum, out) => sum + BigInt(out.amountSompi ?? out.valueSompi ?? 0), 0n);
    const effectiveFeeSompi = fundingAmountSompi - totalOutputsSompi;

    // Reject excessive fee: any fee exceeding the explicitly authorized feeBudgetSompi
    // (or default safe ceiling of 2,500,000 sompi / 0.025 KAS if unconfigured) is strictly refused.
    // This prevents silent fund inflation or user fund leakage into miner fees.
    const authorizedFeeCeilingSompi = record.config.feeBudgetSompi
      ? BigInt(record.config.feeBudgetSompi)
      : 2_500_000n;

    if (effectiveFeeSompi > authorizedFeeCeilingSompi) {
      return c.json(
        {
          ok: false,
          error: `ESCROW_FEE_EXCESSIVE_REFUSED: effective release fee (${effectiveFeeSompi} sompi) exceeds authorized fee budget of ${authorizedFeeCeilingSompi} sompi (${record.config.feeBudgetSompi ? "explicitly budgeted" : "default safe limit"}). Outputs sum ${totalOutputsSompi} sompi from ${fundingAmountSompi} sompi funding.`
        },
        400
      );
    }
    if (effectiveFeeSompi < 10_000n) {
      return c.json(
        {
          ok: false,
          error: `ESCROW_FEE_BELOW_MINIMUM: effective release fee (${effectiveFeeSompi} sompi) is below minimum network relay fee (10000 sompi). Outputs sum ${totalOutputsSompi} sompi from ${fundingAmountSompi} sompi funding.`
        },
        400
      );
    }

    const contractName = record.provenance?.contractName || (isLegacy ? "Escrow" : (mode === "split" ? "EscrowSplit" : "EscrowFull"));
    const { prepareSilverSpend } = await import("@hardkas/accounts");
    let draft: any;
    try {
      draft = prepareSilverSpend({
        artifact: record.artifact,
        contractName,
        entry: branch,
        args: resolution.args,
        sigOpCount: mode === "split" ? 4 : undefined,
        utxo: toContractUtxo({ outpoint: { transactionId: record.funding.transactionId, index: record.funding.outputIndex }, utxoEntry: fundingUtxo }),
        outputs,
        networkId: NETWORK_ID
      });
    } catch (e: any) {
      return c.json({ ok: false, error: `ESCROW_PREPARE_FAILED: ${e?.message || String(e)}` }, 400);
    }

    record.preparedRelease = {
      branch,
      draft,
      args: resolution.args.map((a) => ({ kind: "signer", signer: a.signer })),
      expectedOutputsHash: outputsHash(draft.outputs),
      policyHash: outputsHash(policy)
    };
    record.state = "PARTIALLY_SIGNED";
    record.signatures = {};
    memoryStore.set(id, record);

    return c.json({ ok: true, data: record.preparedRelease });
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500);
  }
});

escrowRoutes.post("/:id/sign", async (c) => {
  try {
    const id = c.req.param("id");
    const { role } = await c.req.json();

    const record = memoryStore.get(id);
    if (!record || !record.preparedRelease) return c.json({ ok: false, error: "Not prepared" }, 400);

    const mode = record.config.mode ?? (record.config.buyerAmount !== undefined && record.config.sellerAmount !== undefined ? "split" : "full");
    const isLegacy = record.config.version === "v1" || (!record.config.version && !record.config.principal && !record.config.mode && !record.config.feeBudgetSompi);
    let policy: { requiredSigners: readonly string[] };
    const legPolicy = isLegacy ? resolutionPolicy[record.preparedRelease.branch as ResolutionBranch] : undefined;
    if (legPolicy) {
      policy = legPolicy;
    } else {
      policy = { requiredSigners: escrowSigners(record.preparedRelease.branch as any, mode) };
    }

    if (!policy.requiredSigners.includes(role)) {
      return c.json({ ok: false, error: `Role ${role} is not required for branch ${record.preparedRelease.branch}` }, 400);
    }

    const fundingUtxo = record.funding.utxoEntry;
    const fundingSpkHex = fundingUtxo?.scriptPublicKey?.scriptPublicKey || fundingUtxo?.scriptPublicKey?.script;
    if (!fundingUtxo || fundingUtxo.amount === undefined || !fundingSpkHex) {
      return c.json({ ok: false, error: "ESCROW_FUNDING_UTXO_UNKNOWN: no recorded funding UTXO to sign against" }, 409);
    }

    const pkHex = (record.config as any)[role]?.publicKeyHex;
    const account = await findDevAccount(pkHex);
    if (!account) {
      return c.json({ ok: false, error: `ESCROW_SIGNER_NOT_FOUND: no local account matches the ${role} public key` }, 400);
    }

    const { signSilverSpend } = await import("@hardkas/accounts");
    let sig: string;
    try {
      sig = signSilverSpend(record.preparedRelease.draft, account.privateKey);
    } catch (e: any) {
      return c.json({ ok: false, error: `ESCROW_SIGNER_FAILED: ${e?.message || String(e)}` }, 400);
    }
    (record.signatures as any)[role] = sig;

    const allSigned = policy.requiredSigners.every((r) => !!(record.signatures as any)[r]);
    if (allSigned) {
      record.state = "READY_TO_RELEASE";
    }

    memoryStore.set(id, record);

    return c.json({ ok: true });
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500);
  }
});

escrowRoutes.post("/:id/release", async (c) => {
  try {
    const id = c.req.param("id");
    const record = memoryStore.get(id);
    if (!record) return c.json({ ok: false, error: "Not found" }, 404);

    if (record.state === "RELEASED") {
      return c.json(
        {
          ok: false,
          error: `ESCROW_ALREADY_RELEASED: escrow ${id} is already released (txid: ${record.release?.transactionId ?? "unknown"}, status: ${record.release?.status ?? "confirmed"}). Nothing was sent.`
        },
        409
      );
    }

    // ESCROW-SAFETY-2: a release already sent is reconciled, never sent again
    if (record.release && record.release.status !== "failed") {
      return c.json(
        { ok: false, error: `ESCROW_RELEASE_PENDING: release ${record.release.transactionId} was already sent (${record.release.status}); reconcile it instead of sending it again. Nothing was sent.` },
        409
      );
    }

    if (record.state !== "READY_TO_RELEASE") return c.json({ ok: false, error: "Not ready" }, 400);

    const prepared = record.preparedRelease!;
    const mode = record.config.mode ?? (record.config.buyerAmount !== undefined && record.config.sellerAmount !== undefined ? "split" : "full");
    const isLegacy = record.config.version === "v1" || (!record.config.version && !record.config.principal && !record.config.mode && !record.config.feeBudgetSompi);
    let policy: any;
    const legPolicy = isLegacy ? resolutionPolicy[prepared.branch as ResolutionBranch] : undefined;
    if (legPolicy) {
      policy = legPolicy;
    } else {
      policy = { requiredSigners: [...escrowSigners(prepared.branch as any, mode)] };
    }

    if (outputsHash(policy) !== prepared.policyHash) {
      return c.json({ ok: false, error: "Policy hash mismatch. The node configuration changed since preparation." }, 400);
    }

    let finalized: { rpcTransaction: any; txId: string };
    try {
      const { finalizeSilverSpend } = await import("@hardkas/accounts");
      finalized = finalizeSilverSpend(prepared.draft, record.artifact, prepared.args, record.signatures as Record<string, string>);
    } catch (e: any) {
      return c.json({ ok: false, error: `ESCROW_UNLOCK_FAILED: ${e?.message || String(e)}` }, 400);
    }

    const actualOutputsHash = outputsHash(prepared.draft.outputs);
    if (actualOutputsHash !== prepared.expectedOutputsHash) {
      throw new Error("Outputs were mutated before broadcast!");
    }

    // ESCROW-SAFETY-2: every required signature verified before anything is sent
    const invalid = await invalidReleaseSignature(record, policy.requiredSigners, finalized);
    if (invalid) return c.json({ ok: false, error: `ESCROW_SIGNATURE_INVALID: ${invalid}. Nothing was sent.` }, 400);

    let submitTxId: string;
    let isConfirmed = false;
    let observeFrom: string | undefined;

    const rpc = nodeClient(3000);
    try {
      observeFrom = await sinkOf(rpc);

      // Write-ahead pre-commit BEFORE submitOnce
      record.release = {
        transactionId: finalized.txId,
        fundingOutpoint: `${record.funding.transactionId}:${record.funding.outputIndex}`,
        expectedOutputsHash: prepared.expectedOutputsHash,
        actualOutputsHash,
        feeSompi: prepared.draft.feeSompi,
        status: "verification_timeout",
        ...(observeFrom ? { observeFrom } : {})
      };
      memoryStore.set(id, record);

      const sent = await submitOnce(rpc, finalized.rpcTransaction, finalized.txId);
      if (sent.outcome === "not-sent" || sent.outcome === "rejected") {
        delete record.release;
        memoryStore.set(id, record);
        return c.json({ ok: false, error: `ESCROW_RELEASE_FAILED: ${sent.outcome === "not-sent" ? "nothing was sent" : "the node refused it"}: ${sent.message}` }, 502);
      }
      if (sent.outcome === "unknown") {
        return c.json(
          {
            ok: false,
            error: `ESCROW_RELEASE_OUTCOME_UNKNOWN: ${sent.message}. The node may hold release ${finalized.txId}; it was not sent again. Reconcile it.`,
            data: { spendTxId: finalized.txId, status: "verification_timeout" }
          },
          504
        );
      }
      submitTxId = sent.txId;
      const startTime = Date.now();
      while (Date.now() - startTime < 10000) {
        if (CHAIN_ACCEPTED.has((await observeOnce(rpc, submitTxId, observeFrom)).finding)) {
          isConfirmed = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    } finally {
      await rpc.close().catch(() => {});
    }

    record.release = {
      transactionId: submitTxId,
      fundingOutpoint: `${record.funding.transactionId}:${record.funding.outputIndex}`,
      expectedOutputsHash: prepared.expectedOutputsHash,
      actualOutputsHash,
      feeSompi: prepared.draft.feeSompi,
      status: isConfirmed ? "confirmed" : "verification_timeout",
      ...(observeFrom ? { observeFrom } : {})
    };

    record.state = isConfirmed ? "RELEASED" : record.state;
    memoryStore.set(id, record);

    return c.json({ ok: true, data: { spendTxId: submitTxId, status: record.release.status } });
  } catch (err: any) {
    console.error("Release error:", err);
    return c.json({ ok: false, error: err?.message || String(err) }, 500);
  }
});
