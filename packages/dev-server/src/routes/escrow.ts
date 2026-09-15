import { Hono } from "hono";
import {
  createEscrow,
  escrowResolution,
  type EscrowBranch,
  type EscrowConfig,
  type EscrowState,
  type EscrowArtifact,
  type EscrowCompileProvenance
} from "@hardkas/escrow";
import crypto from "node:crypto";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";

export type EscrowDomainState =
  | "CREATED"
  | "FUNDED"
  | "PARTIALLY_SIGNED"
  | "READY_TO_RELEASE"
  | "RELEASED";

type ResolutionBranch = EscrowBranch;

// Who receives what per branch. The arbiter branches are fixed by the contract;
// mutualRelease leaves the destination to the signers and this app pays the buyer.
const resolutionPolicy = {
  mutualRelease: { requiredSigners: ["buyer", "seller"], recipient: "buyer", amountKey: "refundAmount" },
  refundBuyer: { requiredSigners: ["buyer", "arbiter"], recipient: "buyer", amountKey: "refundAmount" },
  releaseToSeller: { requiredSigners: ["seller", "arbiter"], recipient: "seller", amountKey: "releaseAmount" }
};

const RPC_URL = "ws://127.0.0.1:18210";
const NETWORK_ID = "simnet";

export interface EscrowRecord {
  id: string;
  config: EscrowConfig;
  state: EscrowDomainState;
  artifact: EscrowArtifact;
  p2shState: EscrowState;
  provenance: EscrowCompileProvenance;

  funding: {
    /** "broadcast" = accepted by the node mempool; "confirmed" only after observing it in the chain. */
    status: "none" | "broadcast" | "confirmed" | "failed" | "verification_timeout";
    transactionId?: string | undefined;
    outputIndex?: number | undefined;
    amountSompi?: string | undefined;
    feeSompi?: string | undefined;
    utxoEntry?: any;
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
  } | undefined;
}

/** Exported so tests can seed records; not part of the HTTP surface. */
export const memoryStore = new Map<string, EscrowRecord>();

export const escrowRoutes = new Hono();

const outputsHash = (outputs: unknown) => crypto.createHash("sha256").update(JSON.stringify(outputs)).digest("hex");

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

    const id = crypto.randomUUID();
    memoryStore.set(id, {
      id,
      config,
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

    const buyerAccount = await findDevAccount(record.config.buyer.publicKeyHex);
    if (!buyerAccount) {
      return c.json({ ok: false, error: "ESCROW_BUYER_ACCOUNT_NOT_FOUND: no local account matches the buyer public key" }, 400);
    }

    const totalAmount = BigInt(record.config.refundAmount) + BigInt(record.config.releaseAmount);
    const rpc = new JsonWrpcKaspaClient({ rpcUrl: RPC_URL });
    let funded: { txId: string; feeSompi: bigint };
    try {
      const utxosRes = await rpc.getUtxosByAddresses([buyerAccount.address]);
      if (!utxosRes.entries || utxosRes.entries.length === 0) throw new Error("Buyer account has no UTXOs.");
      const rawUtxos = utxosRes.entries.map(toContractUtxo);
      // Filter immature coinbase UTXOs via upstream network params (M10-D2).
      // Without this, a buyer whose only UTXOs are unmatured coinbases would
      // get a node rejection at submitTransaction.
      const dag = await rpc.getBlockDagInfo();
      const virtualDaaScore = BigInt(dag.virtualDaaScore);
      const { filterMatureUtxos } = await import("@hardkas/tx-builder");
      const { mature } = filterMatureUtxos<any>({
        networkId: NETWORK_ID,
        virtualDaaScore,
        utxos: rawUtxos,
        readEntry: (u: any) => ({ blockDaaScore: BigInt(u.blockDaaScore ?? 0), isCoinbase: Boolean(u.isCoinbase) })
      });
      if (mature.length === 0) throw new Error("Buyer account has no MATURE UTXOs.");
      // Oldest (most mature) first.
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
      const submitRes = await rpc.submitTransaction(built.rpcTransaction, { allowOrphan: false });
      if (!submitRes.transactionId) throw new Error("node returned no transaction id");
      funded = { txId: submitRes.transactionId, feeSompi: built.feeSompi };
    } catch (rpcErr: any) {
      // Fail closed: the escrow stays unfunded and nothing is persisted.
      return c.json({ ok: false, error: `ESCROW_FUNDING_FAILED: ${rpcErr?.message || String(rpcErr)}` }, 502);
    } finally {
      await rpc.close().catch(() => {});
    }

    // The node accepted the funding tx into its mempool; it has not been observed in a block.
    record.funding.status = "broadcast";
    record.funding.transactionId = funded.txId;
    record.funding.outputIndex = 0;
    record.funding.amountSompi = totalAmount.toString();
    record.funding.feeSompi = funded.feeSompi.toString();
    record.funding.utxoEntry = {
      amount: totalAmount.toString(),
      scriptPublicKey: { version: 0, scriptPublicKey: record.p2shState.lockingScriptHex },
      // Not observed yet; the signature hash does not cover it.
      blockDaaScore: "0",
      isCoinbase: false
    };
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

    if (record.funding.status === "verification_timeout" || (record.release && record.release.status === "verification_timeout")) {
        try {
            const rpc = new JsonWrpcKaspaClient({ rpcUrl: RPC_URL });

            // Check funding reconciliation
            if (record.funding.status === "verification_timeout" && record.funding.transactionId) {
               try {
                   const txData = await (rpc as any).getTransaction(record.funding.transactionId);
                   if (txData && txData.transaction) {
                      const foundOut = txData.transaction.outputs.findIndex((o: any) => o.scriptPublicKey.scriptPublicKey === record.p2shState.lockingScriptHex);
                      if (foundOut !== -1) {
                        record.funding.status = "confirmed";
                        record.funding.outputIndex = foundOut;
                        record.funding.amountSompi = txData.transaction.outputs[foundOut].amount.toString();
                        record.funding.utxoEntry = {
                          amount: txData.transaction.outputs[foundOut].amount.toString(),
                          scriptPublicKey: txData.transaction.outputs[foundOut].scriptPublicKey,
                          blockDaaScore: "0",
                          isCoinbase: false
                        };
                        record.state = "FUNDED";
                      }
                   }
               } catch (e: any) {}
            }

            // Check release reconciliation
            if (record.release && record.release.status === "verification_timeout") {
               try {
                   const txData = await (rpc as any).getTransaction(record.release.transactionId);
                   if (txData && txData.transaction) {
                       record.release.status = "confirmed";
                       record.state = "RELEASED";
                   }
               } catch (e: any) {
                   // not found yet
               }
            }
            await rpc.close().catch(() => {});
        } catch (e: any) {}
    }

    memoryStore.set(id, record);

    return c.json({ ok: true, data: record });
  } catch (err: any) {
    console.error("Reconcile error:", err);
    return c.json({ ok: false, error: err?.message || String(err) }, 500);
  }
});

escrowRoutes.post("/:id/release/prepare", async (c) => {
  try {
    const id = c.req.param("id");
    const { branch } = await c.req.json() as { branch: ResolutionBranch };
    const record = memoryStore.get(id);
    if (!record || !["FUNDED", "PARTIALLY_SIGNED", "READY_TO_RELEASE"].includes(record.state)) return c.json({ ok: false, error: "Not funded" }, 400);

    const policy = resolutionPolicy[branch];
    if (!policy) return c.json({ ok: false, error: "Invalid branch" }, 400);
    const fundingUtxo = record.funding.utxoEntry;
    if (!fundingUtxo || record.funding.transactionId === undefined || record.funding.outputIndex === undefined) {
      return c.json({ ok: false, error: "ESCROW_FUNDING_UTXO_UNKNOWN: no recorded funding UTXO to spend" }, 409);
    }

    const resolution = escrowResolution(record.config, branch);
    const targetSpk = policy.recipient === "buyer" ? record.config.buyerDestinationSpk : record.config.sellerDestinationSpk;
    const amount = BigInt(policy.amountKey === "refundAmount" ? record.config.refundAmount : record.config.releaseAmount);
    const outputs = resolution.requiredOutputs ?? [{ amountSompi: amount, scriptPublicKey: { version: 0 as const, script: targetSpk } }];

    const { prepareSilverSpend } = await import("@hardkas/accounts");
    let draft;
    try {
      draft = prepareSilverSpend({
        artifact: record.artifact,
        contractName: "Escrow",
        entry: branch,
        args: resolution.args,
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

    const policy = resolutionPolicy[record.preparedRelease.branch as ResolutionBranch];
    if (!policy.requiredSigners.includes(role)) {
       return c.json({ ok: false, error: `Role ${role} is not required for branch ${record.preparedRelease.branch}` }, 400);
    }

    // The signer must sign over the real funding UTXO; never over synthesized data.
    const fundingUtxo = record.funding.utxoEntry;
    const fundingSpkHex = fundingUtxo?.scriptPublicKey?.scriptPublicKey || fundingUtxo?.scriptPublicKey?.script;
    if (!fundingUtxo || fundingUtxo.amount === undefined || !fundingSpkHex) {
       return c.json({ ok: false, error: "ESCROW_FUNDING_UTXO_UNKNOWN: no recorded funding UTXO to sign against" }, 409);
    }

    const pkHex = (record.config as any)[role].publicKeyHex;
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

    const allSigned = policy.requiredSigners.every(r => !!(record.signatures as any)[r]);
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
    if (!record || record.state !== "READY_TO_RELEASE") return c.json({ ok: false, error: "Not ready" }, 400);

    const prepared = record.preparedRelease!;
    const policy = resolutionPolicy[prepared.branch as ResolutionBranch];
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

    let submitTxId: string;
    let isConfirmed = false;

    const rpc = new JsonWrpcKaspaClient({ rpcUrl: RPC_URL, timeoutMs: 3000 });
    try {
        try {
            const submitRes = await rpc.submitTransaction(finalized.rpcTransaction, { allowOrphan: false });
            if (!submitRes.transactionId) throw new Error("node returned no transaction id");
            submitTxId = submitRes.transactionId;
        } catch (submitErr: any) {
            // Fail closed: nothing is persisted and the escrow is not released.
            return c.json({ ok: false, error: `ESCROW_RELEASE_FAILED: ${submitErr?.message || String(submitErr)}` }, 502);
        }
        const startTime = Date.now();
        while (Date.now() - startTime < 10000) {
          try {
              const txData = await (rpc as any).getTransaction(submitTxId);
              if (txData && txData.transaction) {
                  isConfirmed = true;
                  break;
              }
          } catch (e: any) {}
          await new Promise(r => setTimeout(r, 1000));
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
       status: isConfirmed ? "confirmed" : "verification_timeout"
    };

    record.state = isConfirmed ? "RELEASED" : record.state;
    memoryStore.set(id, record);

    return c.json({ ok: true, data: { spendTxId: submitTxId, status: record.release.status } });
  } catch (err: any) {
    console.error("Release error:", err);
    return c.json({ ok: false, error: err?.message || String(err) }, 500);
  }
});
