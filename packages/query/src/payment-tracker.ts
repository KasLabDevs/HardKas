/**
 * PaymentTracker — Builder Lab 02, Friction #04
 *
 * A stateless utility to detect payments by querying UTXOs.
 * It reuses WalletQuery as the underlying query engine.
 */

import type { WalletQuery } from "./wallet-query.js";

export interface PaymentCheckRequest {
    readonly address: string;
    readonly expectedAmountSompi: bigint;
    readonly requiredConfirmations: number;
    readonly queryEngine: WalletQuery;
    /**
     * G6 (notes cross-check): the node's virtual DAA score, read by the caller (`getBlockDagInfo().virtualDaaScore`) at
     * the time of the check. With it, the depth of every counted UTXO that carries its `blockDaaScore` is derived
     * (`virtualDaaScore − blockDaaScore`); without it, and without a provider that sets `confirmations`, the depth is
     * unknown (`depthKnown: false`) and the payment is never reported "confirmed" above 0 required confirmations.
     */
    readonly virtualDaaScore?: bigint | number | string;
}

/**
 * `mempool`: the amount was found but its depth is below `requiredConfirmations`, or not known (`depthKnown: false`):
 * a UTXO the node lists is already accepted into its UTXO set, so read `depthKnown` before treating it as unaccepted.
 */
export type PaymentStatus = "not_found" | "partially_paid" | "mempool" | "confirmed";

/**
 * Where `confirmations` comes from: `provider` (every counted UTXO carried `confirmations`), `daa-depth` (at least one
 * depth is `virtualDaaScore − blockDaaScore`, the reference wallet's maturity unit, not the node's blue-score confirmation
 * count) or `unknown` (nothing counted, or a counted UTXO's depth could not be derived).
 */
export type PaymentConfirmationSource = "provider" | "daa-depth" | "unknown";

export interface PaymentCheckOutpoint {
    readonly transactionId: string;
    readonly outputIndex: number;
    readonly amountSompi: bigint;
}

export interface PaymentCheckResult {
    readonly status: PaymentStatus;
    /** Plain KAS found at the address: covenant-bound UTXOs are not counted (see `covenantBoundSompi`). */
    readonly amountFoundSompi: bigint;
    readonly confirmations: number;
    /** The transaction that paid most of `amountFoundSompi` (ties: the smallest id). Every paying transaction is in `txIds`. */
    readonly txId?: string;
    readonly model: "stateless-utxo-check-v1";
    /** G6: every transaction whose outputs were counted, without repeats, in the order found. */
    readonly txIds: readonly string[];
    /** G6: every UTXO counted in `amountFoundSompi`. */
    readonly outpoints: readonly PaymentCheckOutpoint[];
    /** G6: KAS at the address held by covenant-bound UTXOs (KIP-20 `covenantId`): not plain KAS, never counted as payment. */
    readonly covenantBoundSompi: bigint;
    readonly covenantUtxoCount: number;
    /** G6: false when the depth of a counted UTXO could not be derived (see `virtualDaaScore`). */
    readonly depthKnown: boolean;
    readonly confirmationSource: PaymentConfirmationSource;
}

const COVENANT_ID_FIELDS = ["covenantId", "covenant_id"] as const;

/**
 * The covenant id a UTXO carries, in the shapes HardKAS handles (its own UTXOs, the node's `utxoEntry`, kaspa-wasm's
 * `entry`). The same rule as @hardkas/tx-builder's `covenantIdOf` (covenant-utxos.ts), kept inline because
 * @hardkas/query does not depend on the transaction builder.
 */
function covenantIdOf(utxo: unknown): string | undefined {
    if (utxo === null || typeof utxo !== "object") return undefined;
    const u = utxo as Record<string, any>;
    for (const holder of [u, u.utxoEntry, u.entry]) {
        if (holder === null || typeof holder !== "object") continue;
        for (const name of COVENANT_ID_FIELDS) {
            const value = holder[name];
            if (value === undefined || value === null) continue;
            const text = String(value).trim();
            if (text !== "") return text;
        }
    }
    return undefined;
}

function toBigIntOrUndefined(value: unknown): bigint | undefined {
    if (value === undefined || value === null || value === "") return undefined;
    try {
        return BigInt(value as any);
    } catch {
        return undefined;
    }
}

export async function checkPaymentStatus(request: PaymentCheckRequest): Promise<PaymentCheckResult> {
    if (request.expectedAmountSompi <= 0n) {
        throw new Error("PAYMENT_TRACKER_INVALID_AMOUNT: Expected amount must be strictly positive.");
    }

    const queryRes = await request.queryEngine.getUtxos([request.address]);

    // Handle degraded query results securely
    if (!queryRes.ok) {
        throw new Error("PAYMENT_TRACKER_QUERY_FAILED: Could not retrieve UTXOs. " + queryRes.error);
    }

    const addressUtxos = queryRes.utxos[request.address] || [];
    const virtualDaaScore = toBigIntOrUndefined(request.virtualDaaScore);

    let amountFoundSompi = 0n;
    let covenantBoundSompi = 0n;
    let covenantUtxoCount = 0;
    let minConfirmations = Number.MAX_SAFE_INTEGER;
    let depthKnown = true;
    let usedProvider = false;
    let usedDaa = false;
    const outpoints: PaymentCheckOutpoint[] = [];
    const paidByTx = new Map<string, bigint>();

    for (const utxo of addressUtxos) {
        const amount = BigInt(utxo.amountSompi);
        // G6: a coin with a covenant id belongs to a covenant (KIP-20); it is not plain KAS and pays no invoice
        if (covenantIdOf(utxo) !== undefined) {
            covenantBoundSompi += amount;
            covenantUtxoCount++;
            continue;
        }
        amountFoundSompi += amount;
        outpoints.push({ transactionId: utxo.transactionId, outputIndex: utxo.outputIndex, amountSompi: amount });
        paidByTx.set(utxo.transactionId, (paidByTx.get(utxo.transactionId) ?? 0n) + amount);

        // A provider that knows the depth sets `confirmations`; otherwise it is derived from the UTXO's blockDaaScore and
        // the virtual DAA score the caller read. blockDaaScore alone is an absolute counter, not a depth.
        let confs: number | undefined;
        const explicit = (utxo as any).confirmations;
        if (typeof explicit === "number" && Number.isFinite(explicit)) {
            confs = explicit;
            usedProvider = true;
        } else {
            const blockDaaScore = toBigIntOrUndefined((utxo as any).blockDaaScore);
            if (virtualDaaScore !== undefined && blockDaaScore !== undefined) {
                const depth = virtualDaaScore - blockDaaScore;
                confs = depth > 0n ? Number(depth) : 0;
                usedDaa = true;
            }
        }
        if (confs === undefined) {
            depthKnown = false;
            confs = 0;
        }
        if (confs < minConfirmations) {
            minConfirmations = confs;
        }
    }

    if (outpoints.length === 0) {
        minConfirmations = 0;
    }

    let status: PaymentStatus = "not_found";

    if (amountFoundSompi === 0n) {
        status = "not_found";
    } else if (amountFoundSompi < request.expectedAmountSompi) {
        status = "partially_paid";
    } else {
        if (minConfirmations >= request.requiredConfirmations) {
            status = "confirmed";
        } else {
            status = "mempool";
        }
    }

    // The paying transaction: the one that contributed most (a single payment is the common case); all are in txIds
    let txId: string | undefined = undefined;
    let best = -1n;
    for (const [id, sum] of paidByTx) {
        if (sum > best || (sum === best && txId !== undefined && id < txId)) {
            best = sum;
            txId = id;
        }
    }

    const confirmationSource: PaymentConfirmationSource =
        outpoints.length === 0 || !depthKnown ? "unknown" : usedDaa ? "daa-depth" : "provider";

    return {
        status,
        amountFoundSompi,
        confirmations: minConfirmations === Number.MAX_SAFE_INTEGER ? 0 : minConfirmations,
        model: "stateless-utxo-check-v1",
        ...(txId ? { txId } : {}),
        txIds: [...paidByTx.keys()],
        outpoints,
        covenantBoundSompi,
        covenantUtxoCount,
        depthKnown: outpoints.length === 0 ? false : depthKnown,
        confirmationSource
    };
}
