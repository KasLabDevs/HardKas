import type { NodeSetReading, TxAcrossNodes, UtxoComparison } from "@hardkas/sdk";

/*
 * MULTINODE-READ-1 · `hardkas rpc compare`: several nodes read side by side through the SDK's read-only node set. Every
 * endpoint gets its own client; nothing is ever sent to any of them. A section that cannot be compared (fewer than two
 * nodes of the expected network answered) says why, typed; the others are still reported.
 */

export interface RpcCompareInput {
  readonly endpoints: readonly string[];
  readonly network: string;
  readonly addresses?: readonly string[] | undefined;
  readonly txId?: string | undefined;
  readonly since?: string | undefined;
  readonly lagThresholdDaa?: bigint | undefined;
}

export interface RpcCompareResult {
  readonly set: NodeSetReading;
  readonly utxos?: UtxoComparison | undefined;
  readonly tx?: Omit<TxAcrossNodes, "observations"> | undefined;
  /** Sections that could not be compared: their typed code and why. */
  readonly errors: ReadonlyArray<{ readonly section: "utxos" | "tx"; readonly code: string; readonly message: string }>;
  readonly disagreements: number;
}

export async function runRpcCompare(input: RpcCompareInput): Promise<RpcCompareResult> {
  const { HardkasCliError, HardkasExitCode } = await import("../cli-errors.js");
  if (input.endpoints.length < 2) {
    throw new HardkasCliError("MULTINODE_INSUFFICIENT_NODES", "rpc compare reads two or more endpoints (--endpoints a b …). Nothing was contacted.", { exitCode: HardkasExitCode.USAGE_ERROR });
  }
  const { JsonWrpcKaspaClient, sameRpcEndpoint } = await import("@hardkas/kaspa-rpc");
  for (let i = 0; i < input.endpoints.length; i++) {
    for (let j = i + 1; j < input.endpoints.length; j++) {
      if (sameRpcEndpoint(input.endpoints[i]!, input.endpoints[j]!)) {
        throw new HardkasCliError("MULTINODE_ENDPOINTS_NOT_UNIQUE", `Endpoints ${i + 1} and ${j + 1} are the same node: a node is never compared with itself. Nothing was contacted.`, {
          exitCode: HardkasExitCode.USAGE_ERROR
        });
      }
    }
  }
  const { readNodeSet, compareUtxosAcrossNodes, observeTxAcrossNodes } = await import("@hardkas/sdk");
  const nodes: Array<{ label: string; client: InstanceType<typeof JsonWrpcKaspaClient> }> = [];
  const errors: Array<{ section: "utxos" | "tx"; code: string; message: string }> = [];
  const section = async <T>(name: "utxos" | "tx", run: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await run();
    } catch (e: any) {
      errors.push({ section: name, code: typeof e?.code === "string" ? e.code : "MULTINODE_READ_FAILED", message: String(e?.message ?? e) });
      return undefined;
    }
  };
  try {
    // RESOURCE-LIFECYCLE-1: every client is created here and released in this function's finally
    for (const [i, url] of input.endpoints.entries()) nodes.push({ label: `node${i + 1}`, client: new JsonWrpcKaspaClient({ rpcUrl: url, timeoutMs: 15_000 }) });
    const set = await readNodeSet(nodes, { expectedNetwork: input.network, ...(input.lagThresholdDaa !== undefined ? { lagThresholdDaa: input.lagThresholdDaa } : {}) });
    const utxos = input.addresses && input.addresses.length > 0 ? await section("utxos", () => compareUtxosAcrossNodes(nodes, set, input.addresses!)) : undefined;
    const looked = input.txId ? await section("tx", () => observeTxAcrossNodes(nodes, set, input.txId!, input.since ? { since: input.since } : {})) : undefined;
    const tx = looked ? (({ observations: _sealed, ...rest }) => rest)(looked) : undefined;
    const duplicateNodes = set.nodes.filter((n) => n.standing === "duplicate");
    if (duplicateNodes.length > 0) {
      errors.push({
        section: "utxos",
        code: "MULTINODE_P2PID_COLLISION",
        message: `P2PID collision detected across distinct endpoints: ${duplicateNodes.map((n) => `${n.label} (${n.reasons?.join("; ")})`).join(", ")}`
      });
    }
    return { set, utxos, tx, errors, disagreements: (utxos?.disagreements.length ?? 0) + (tx?.disagreements.length ?? 0) + (duplicateNodes.length > 0 ? 1 : 0) };
  } finally {
    for (const n of nodes) await n.client.close().catch(() => {});
  }
}

/** The human report. */
export function formatRpcCompare(r: RpcCompareResult): string {
  const lines: string[] = [];
  lines.push(`Node set (read-only) · network ${r.set.expectedNetwork} · lag threshold ${r.set.lagThresholdDaa} DAA`);
  for (const n of r.set.nodes) {
    const net = n.network?.server ?? "?";
    const daa = n.virtualDaaScore !== undefined ? `DAA ${n.virtualDaaScore}` : "DAA ?";
    const lag = n.lagDaa !== undefined ? ` lag ${n.lagDaa}` : "";
    lines.push(`  ${n.label.padEnd(6)} ${String(n.endpoint ?? "").padEnd(28)} ${n.standing.padEnd(13)} ${net.padEnd(10)} ${daa}${lag}${n.reasons.length ? ` — ${n.reasons.join("; ")}` : ""}`);
  }
  if (r.set.reference) lines.push(`  reference: ${r.set.reference.label} (DAA ${r.set.reference.virtualDaaScore})`);
  if (r.utxos) {
    lines.push("");
    lines.push(`UTXOs of ${r.utxos.addresses.join(", ")}: ${r.utxos.agreed.length} agreed, ${r.utxos.lag.length} lag, ${r.utxos.disagreements.length} disagreement(s)`);
    for (const [label, a] of Object.entries(r.utxos.nodes)) {
      lines.push("error" in a ? `  ${label}: not compared (${a.error})` : `  ${label}: ${a.listed} UTXO(s), ${a.totalSompi} sompi, read between DAA ${a.daaBefore} and ${a.daaAfter}`);
    }
    for (const l of r.utxos.lag) lines.push(`  [lag] ${l.subject}: ${l.explanation}`);
    for (const d of r.utxos.disagreements) lines.push(`  [${d.code}] ${d.subject}: ${d.detail}`);
  }
  if (r.tx) {
    lines.push("");
    lines.push(`Transaction ${r.tx.txId}: accepted by ${r.tx.acceptedBy.length ? r.tx.acceptedBy.join(", ") : "no node"}`);
    for (const [label, a] of Object.entries(r.tx.nodes)) {
      lines.push(
        "error" in a
          ? `  ${label}: not looked at (${a.error})`
          : `  ${label}: ${a.finding.type}${(a.finding as any).acceptingBlockHash ? ` in ${(a.finding as any).acceptingBlockHash}` : ""} (at DAA ${a.point.virtualDaaScore})`
      );
    }
    for (const l of r.tx.lag) lines.push(`  [lag] ${l.explanation}`);
    for (const d of r.tx.disagreements) lines.push(`  [${d.code}] ${d.detail}`);
  }
  for (const e of r.errors) lines.push(`\n${e.section}: not compared — ${e.code}: ${e.message}`);
  lines.push("");
  lines.push(`Scope: ${r.set.scope}. ${r.set.guarantee}.`);
  return lines.join("\n");
}
