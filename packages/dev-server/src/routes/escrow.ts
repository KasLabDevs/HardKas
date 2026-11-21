import { Hono } from "hono";
import { createEscrow, type EscrowConfig } from "@hardkas/sdk";
import crypto from "node:crypto";
import { JsonWrpcKaspaClient, type OfficialRpcFactory } from "@hardkas/kaspa-rpc";
import { nodeRpcUrl } from "@hardkas/core";
import {
  ESCROW_CHAIN_ACCEPTED,
  applyEscrowFundingFinding,
  applyEscrowPreparedRelease,
  applyEscrowReleaseFinding,
  checkEscrowRelease,
  escrowAddressRefusal,
  escrowFundingCheck,
  escrowFundingRefusal,
  escrowRefusalBody,
  escrowSignCheck,
  escrowSignatureOf,
  newEscrowRecord,
  prepareEscrowRelease,
  recordEscrowSignature,
  toEscrowContractUtxo,
  type EscrowRefusal
} from "@hardkas/sdk";
import { AtomicJournalEscrowStore } from "../store/atomic-journal.js";
import { autoSignRefusal, serverAllowsDevAutoSign } from "./dev-autosign.js";

/*
 * ESCROW-LIFECYCLE-1 · the rules of the escrow lifecycle (what a funding pays and the G3 check of its releases, one
 * funding per escrow, a release's fee ceiling and the node's floor, who signs which branch, the policy and outputs
 * hashes, BIP340 verification of every signature before a release is sent, what a node's answer moves a record to) live
 * in @hardkas/sdk (escrow.ts), shared with `sdk.escrow` and `hardkas escrow`. These routes call them and keep what is
 * theirs: the HTTP surface (same status codes and bodies: escrowRefusalBody), this journal, the canonical localnet
 * client, the dev-account signer lookup and the server's autosign decision.
 */

export type { EscrowDomainState, EscrowRecord } from "@hardkas/sdk";

// CANONICAL-RPC-URL: the canonical localnet endpoint comes from @hardkas/core, never a copy.
const RPC_URL = nodeRpcUrl();
const NETWORK_ID = "simnet";

/** Persistent, atomic journal-backed store; compatible with Map<string, EscrowRecord>. */
export const memoryStore = new AtomicJournalEscrowStore();
export const escrowStore = memoryStore;

export const escrowRoutes = new Hono();

/** A shared-rule refusal as these routes always answered it. */
const refused = (c: any, r: EscrowRefusal) => c.json(escrowRefusalBody(r), r.status);

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

/**
 * Pre-release round · evasion route (f) of step 4: `POST /:id/fund` (the buyer's dev account signs the funding) and
 * `POST /:id/sign` (a role's dev account signs the spend) sign with THIS server's own accounts for an HTTP client, so
 * they take the same server decision as the dApp routes (TX-06 / P38, dev-autosign.ts): off by default, opened only by
 * `HARDKAS_DEV_SERVER_AUTOSIGN=1` in the server's environment, and then only on a local simnet. These routes always
 * reach the canonical localnet (`RPC_URL`, loopback) as simnet, so the decision is asked for that network with no
 * workspace config: a config cannot move the node they use. The refusal comes first, before the escrow record, any
 * account or key is read and before the node is contacted. Undefined when the server may sign.
 */
function escrowAutoSignRefusal(): { code: string; message: string } | undefined {
  return serverAllowsDevAutoSign(NETWORK_ID, process.env) ? undefined : autoSignRefusal(NETWORK_ID);
}

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
    const duplicate = escrowAddressRefusal(memoryStore.values(), result.state.address);
    if (duplicate) return refused(c, duplicate);

    const id = crypto.randomUUID();
    memoryStore.set(id, newEscrowRecord(id, result, config));

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
    // the server's own decision on signing for a client (TX-06 / P38), before anything is read, signed or sent
    const autosign = escrowAutoSignRefusal();
    if (autosign) return c.json({ ok: false, code: autosign.code, error: `${autosign.code}: ${autosign.message}` }, 403);
    const id = c.req.param("id");
    const record = memoryStore.get(id);
    if (!record) return c.json({ ok: false, error: "Not found" }, 404);
    // ESCROW-SAFETY-2: an escrow is funded once; a funding whose outcome is unknown is reconciled, never followed by another
    const already = escrowFundingRefusal(record);
    if (already) return refused(c, already);

    const buyerAccount = await findDevAccount(record.config.buyer.publicKeyHex);
    if (!buyerAccount) {
      return c.json({ ok: false, error: "ESCROW_BUYER_ACCOUNT_NOT_FOUND: no local account matches the buyer public key" }, 400);
    }

    // The funding amount (the principal or the two allocations, plus the fee budget), and G3: an escrow whose releases
    // could not pay the node's minimum relay fee is never funded (nothing read, signed or sent)
    const releases = escrowFundingCheck(record, NETWORK_ID);
    const totalAmount = releases.totalAmount;
    if (releases.refusal) return refused(c, releases.refusal);

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
      const rawUtxos = unspentEntries.map(toEscrowContractUtxo);
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

    return c.json({ ok: true, data: { txId: funded.txId, status: record.funding.status, ...(releases.warnings.length > 0 ? { warnings: releases.warnings } : {}) } });
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
          applyEscrowFundingFinding(record, look.finding);
        }
        if (releasePending) {
          const look = await observeOnce(rpc, record.release!.transactionId, record.release!.observeFrom);
          looks.release = look;
          applyEscrowReleaseFinding(record, look.finding);
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
    const branch = body?.branch;
    const mutualSplit = body?.mutualSplit as { buyerSompi: bigint; sellerSompi: bigint } | undefined;

    const record = memoryStore.get(id);
    const prepared = prepareEscrowRelease(record, { branch, mutualSplit }, NETWORK_ID);
    if (!prepared.ok) return refused(c, prepared);

    applyEscrowPreparedRelease(record!, prepared.preparedRelease);
    memoryStore.set(id, record!);

    return c.json({ ok: true, data: record!.preparedRelease });
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500);
  }
});

escrowRoutes.post("/:id/sign", async (c) => {
  try {
    // the server's own decision on signing for a client (TX-06 / P38), before anything is read or signed
    const autosign = escrowAutoSignRefusal();
    if (autosign) return c.json({ ok: false, code: autosign.code, error: `${autosign.code}: ${autosign.message}` }, 403);
    const id = c.req.param("id");
    const { role } = await c.req.json();

    const record = memoryStore.get(id);
    const check = escrowSignCheck(record, role);
    if (!check.ok) return refused(c, check);

    const account = await findDevAccount(check.publicKeyHex);
    if (!account) {
      return c.json({ ok: false, error: `ESCROW_SIGNER_NOT_FOUND: no local account matches the ${role} public key` }, 400);
    }

    const signed = escrowSignatureOf(record!, account.privateKey);
    if (!signed.ok) return refused(c, signed);
    recordEscrowSignature(record!, role, signed.signature, check.policy);

    memoryStore.set(id, record!);

    return c.json({ ok: true });
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500);
  }
});

escrowRoutes.post("/:id/release", async (c) => {
  try {
    const id = c.req.param("id");
    const record = memoryStore.get(id);
    // not released, nothing sent and unreconciled, ready, the policy unchanged, the outputs prepared, every signature valid
    const ready = checkEscrowRelease(record, id);
    if (!ready.ok) return refused(c, ready);
    const { prepared, finalized, actualOutputsHash } = ready;

    let submitTxId: string;
    let isConfirmed = false;
    let observeFrom: string | undefined;

    const rpc = nodeClient(3000);
    try {
      observeFrom = await sinkOf(rpc);

      // Write-ahead pre-commit BEFORE submitOnce
      record!.release = {
        transactionId: finalized.txId,
        fundingOutpoint: `${record!.funding.transactionId}:${record!.funding.outputIndex}`,
        expectedOutputsHash: prepared.expectedOutputsHash,
        actualOutputsHash,
        feeSompi: prepared.draft.feeSompi,
        status: "verification_timeout",
        ...(observeFrom ? { observeFrom } : {})
      };
      memoryStore.set(id, record!);

      const sent = await submitOnce(rpc, finalized.rpcTransaction, finalized.txId);
      if (sent.outcome === "not-sent" || sent.outcome === "rejected") {
        delete record!.release;
        memoryStore.set(id, record!);
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
        if (ESCROW_CHAIN_ACCEPTED.has((await observeOnce(rpc, submitTxId, observeFrom)).finding)) {
          isConfirmed = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    } finally {
      await rpc.close().catch(() => {});
    }

    record!.release = {
      transactionId: submitTxId,
      fundingOutpoint: `${record!.funding.transactionId}:${record!.funding.outputIndex}`,
      expectedOutputsHash: prepared.expectedOutputsHash,
      actualOutputsHash,
      feeSompi: prepared.draft.feeSompi,
      status: isConfirmed ? "confirmed" : "verification_timeout",
      ...(observeFrom ? { observeFrom } : {})
    };

    record!.state = isConfirmed ? "RELEASED" : record!.state;
    memoryStore.set(id, record!);

    return c.json({ ok: true, data: { spendTxId: submitTxId, status: record!.release.status } });
  } catch (err: any) {
    console.error("Release error:", err);
    return c.json({ ok: false, error: err?.message || String(err) }, 500);
  }
});
