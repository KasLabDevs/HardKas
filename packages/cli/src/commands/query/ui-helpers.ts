import pc from "picocolors";
import { 
  QueryResult, 
  ArtifactQueryItem, 
  ArtifactInspectResult, 
  ArtifactDiffResult, 
  LineageChainResult, 
  LineageTransition, 
  LineageOrphan, 
  ReplaySummaryResult, 
  ReplayDivergence, 
  ReplayInvariantsResult, 
  DagConflict, 
  DagDisplacement, 
  DagTxHistory, 
  DagSinkPath, 
  DagAnomaly,
  ExplainChain,
  ReasoningStep
} from "@hardkas/query";

export function printArtifactList(result: QueryResult<ArtifactQueryItem>): void {
  console.log(pc.bold(`\n  Artifacts: ${pc.cyan(result.total)} found (showing ${result.items.length})\n`));
  for (const item of result.items) {
    const hash = item.contentHash ? pc.dim(item.contentHash.slice(0, 12) + "...") : pc.red("no-hash");
    const from = item.from?.address ? pc.dim(` from:${item.from.address.slice(0, 10)}...`) : "";
    console.log(`  ${pc.white(item.schema.padEnd(24))} ${pc.dim(item.networkId.padEnd(10))} ${pc.dim(item.mode.padEnd(12))} ${hash}${from}`);
  }
  console.log(`\n  ${pc.dim("queryHash:")} ${pc.magenta(result.queryHash.slice(0, 16) + "...")}`);
  console.log(`  ${pc.green(result.annotations.executionMs + "ms")} | ${pc.blue((result.annotations.filesScanned ?? 0) + " files scanned")}\n`);
  if (result.explain) printExplainChains(result.explain as unknown as ExplainChain[]);
}

export function printInspectResult(result: QueryResult<ArtifactInspectResult>): void {
  const item = result.items[0];
  if (!item) { console.log(pc.red("  No artifact found.")); return; }
  console.log(pc.bold(pc.magenta(`\n  ═══ Artifact Inspection ═══\n`)));
  console.log(`  ${pc.dim("Schema:")}     ${pc.white(item.item.schema)}`);
  console.log(`  ${pc.dim("Network:")}    ${pc.cyan(item.item.networkId)}`);
  console.log(`  ${pc.dim("Mode:")}       ${pc.blue(item.item.mode)}`);
  console.log(`  ${pc.dim("Created:")}    ${pc.white(item.item.createdAt)}`);
  console.log(`  ${pc.dim("Hash:")}       ${pc.magenta(item.item.contentHash || "none")}`);
  console.log(`  ${pc.dim("Integrity:")}  ${item.integrity.ok ? pc.green("✓ VALID") : pc.red("✗ INVALID")}`);
  console.log(`  ${pc.dim("Lineage:")}    ${pc.italic(item.lineageStatus)}`);
  console.log(`  ${pc.dim("Staleness:")}  ${pc.yellow(item.staleness.classification)} (${item.staleness.ageHours}h)`);
  if (item.economics) {
    console.log(`  ${pc.dim("Economics:")}  ${item.economics.ok ? pc.green("✓") : pc.red("✗")} mass=${item.economics.massReported} fee=${item.economics.feeReported}`);
  }
  if (item.integrity.errors.length > 0) { 
    console.log(pc.red(`\n  Issues:`)); 
    for (const err of item.integrity.errors) console.log(`    ✗ ${err}`); 
  }
  console.log("");
  if (result.explain) printExplainChains(result.explain as unknown as ExplainChain[]);
}

export function printDiffResult(result: QueryResult<ArtifactDiffResult>): void {
  const diff = result.items[0];
  if (!diff) return;
  console.log(pc.bold(pc.magenta(`\n  ═══ Artifact Diff ═══\n`)));
  console.log(`  ${pc.dim("Left:")}   ${pc.white(diff.leftSchema)} ${pc.dim("(" + diff.leftPath + ")")}`);
  console.log(`  ${pc.dim("Right:")}  ${pc.white(diff.rightSchema)} ${pc.dim("(" + diff.rightPath + ")")}`);
  if (diff.identical) { 
    console.log(pc.green(`\n  ✓ Artifacts are identical.\n`)); 
    return; 
  }
  console.log(pc.bold(`\n  ${pc.cyan(diff.entries.length)} difference(s):\n`));
  for (const entry of diff.entries) {
    const marker = entry.kind === "added" ? pc.green("+") : entry.kind === "removed" ? pc.red("-") : pc.yellow("~");
    console.log(`  ${marker} ${pc.bold(entry.field)}: ${pc.dim(entry.left ?? "(absent)")} → ${pc.white(entry.right ?? "(absent)")} ${pc.dim("[" + entry.kind + "]")}`);
  }
  console.log("");
}

export function printLineageChain(result: QueryResult<LineageChainResult>): void {
  const chain = result.items[0];
  if (!chain) return;
  console.log(pc.bold(pc.magenta(`\n  ═══ Lineage Chain (${chain.direction}) ═══\n`)));
  console.log(`  ${pc.dim("Anchor:")}   ${pc.white(chain.anchor)}`);
  console.log(`  ${pc.dim("Complete:")} ${chain.complete ? pc.green("✓ yes") : pc.red("✗ no (missing ancestors)")}`);
  console.log(`  ${pc.dim("Nodes:")}    ${pc.cyan(chain.nodes.length)}\n`);
  for (let i = 0; i < chain.nodes.length; i++) {
    const node = chain.nodes[i];
    if (!node) continue;
    const prefix = i === chain.nodes.length - 1 ? pc.dim("  └─") : pc.dim("  ├─");
    const hash = pc.dim(node.contentHash.slice(0, 12) + "...");
    console.log(`${prefix} ${pc.white(node.schema.padEnd(20))} ${hash} ${pc.blue(node.networkId)}/${pc.dim(node.mode)}`);
  }
  console.log("");
  if (result.explain) printExplainChains(result.explain as unknown as ExplainChain[]);
}

export function printTransitions(result: QueryResult<LineageTransition>): void {
  console.log(pc.bold(pc.magenta(`\n  ═══ Lineage Transitions: ${pc.cyan(result.total)} ═══\n`)));
  for (const t of result.items) {
    const marker = t.valid ? pc.green("✓") : pc.red("✗");
    console.log(`  ${marker} ${pc.white(t.from.schema.padEnd(20))} → ${pc.white(t.to.schema.padEnd(20))} ${pc.dim("[" + t.rule + "]")}`);
  }
  console.log("");
  if (result.explain) printExplainChains(result.explain as unknown as ExplainChain[]);
}

export function printOrphans(result: QueryResult<LineageOrphan>): void {
  if (result.total === 0) { 
    console.log(pc.green("\n  ✓ No orphaned artifacts found.\n")); 
    return; 
  }
  console.log(pc.bold(pc.red(`\n  ═══ Orphaned Artifacts: ${pc.white(result.total)} ═══\n`)));
  for (const o of result.items) {
    console.log(`  ${pc.red("✗")} ${pc.white(o.node.schema)} ${pc.dim("[" + o.node.contentHash.slice(0, 12) + "...]")}`);
    console.log(`    ${pc.dim("Missing parent:")} ${pc.yellow(o.missingParentId.slice(0, 16) + "...")}`);
    console.log(`    ${pc.dim("Reason:")}         ${pc.italic(o.reason)}\n`);
  }
  if (result.explain) printExplainChains(result.explain as unknown as ExplainChain[]);
}

export function printReplayList(result: QueryResult<ReplaySummaryResult>): void {
  console.log(pc.bold(pc.magenta(`\n  ═══ Replay History: ${pc.cyan(result.total)} receipt(s) ═══\n`)));
  for (const r of result.items) {
    const trace = r.hasTrace ? pc.green(`trace:${r.traceEventCount}ev`) : pc.dim("no-trace");
    const status = r.status === "accepted" ? pc.green(r.status) : pc.yellow(r.status);
    console.log(`  ${pc.white(r.txId.slice(0, 20).padEnd(22))} ${status.padEnd(10)} ${pc.cyan(r.amountSompi.padEnd(12))} ${pc.dim("fee:")}${r.feeSompi} ${trace}`);
  }
  console.log("");
}

export function printReplaySummary(result: QueryResult<ReplaySummaryResult>): void {
  const s = result.items[0];
  if (!s) return;
  console.log(pc.bold(pc.magenta(`\n  ═══ Replay Summary: ${pc.white(s.txId)} ═══\n`)));
  console.log(`  ${pc.dim("Status:")}     ${s.status === "accepted" ? pc.green(s.status) : pc.yellow(s.status)}`);
  console.log(`  ${pc.dim("From:")}       ${pc.white(s.from)}`);
  console.log(`  ${pc.dim("To:")}         ${pc.white(s.to)}`);
  console.log(`  ${pc.dim("Amount:")}     ${pc.cyan(s.amountSompi)} sompi`);
  console.log(`  ${pc.dim("Fee:")}        ${pc.cyan(s.feeSompi)} sompi`);
  console.log(`  ${pc.dim("DAA Score:")}  ${pc.white(s.daaScore)}`);
  console.log(`  ${pc.dim("UTXOs:")}      ${pc.green(s.spentUtxoCount + " spent")}, ${pc.green(s.createdUtxoCount + " created")}`);
  console.log(`  ${pc.dim("Trace:")}      ${s.hasTrace ? pc.green(`yes (${s.traceEventCount} events)`) : pc.dim("none")}`);
  if (s.preStateHash) console.log(`  ${pc.dim("Pre-state:")}  ${pc.dim(s.preStateHash.slice(0, 16) + "...")}`);
  if (s.postStateHash) console.log(`  ${pc.dim("Post-state:")} ${pc.dim(s.postStateHash.slice(0, 16) + "...")}`);
  console.log("");
}

export function printDivergences(result: QueryResult<ReplayDivergence>): void {
  if (result.total === 0) { 
    console.log(pc.green("\n  ✓ No replay divergences detected.\n")); 
    return; 
  }
  console.log(pc.bold(pc.red(`\n  ═══ Replay Divergences: ${pc.white(result.total)} ═══\n`)));
  for (const d of result.items) {
    console.log(`  ${pc.red("✗")} ${pc.bold("[" + d.kind + "]")} tx:${pc.dim(d.txId.slice(0, 16) + "...")}`);
    console.log(`    ${pc.dim("Field:")}    ${pc.white(d.field)}`);
    console.log(`    ${pc.dim("Expected:")} ${pc.green(d.expected.slice(0, 60))}`);
    console.log(`    ${pc.dim("Actual:")}   ${pc.red(d.actual.slice(0, 60))}\n`);
  }
  if (result.explain) printExplainChains(result.explain as unknown as ExplainChain[]);
}

export function printInvariants(result: QueryResult<ReplayInvariantsResult>): void {
  const inv = result.items[0];
  if (!inv) return;
  const allOk = inv.planIntegrity && inv.receiptReproducible && inv.stateTransitionValid && inv.utxoConservation;
  console.log(pc.bold(pc.magenta(`\n  ═══ Replay Invariants: ${pc.white(inv.txId.slice(0, 16) + "...")} ═══\n`)));
  
  const fmt = (ok: boolean) => ok ? pc.green("✓ PASS") : pc.red("✗ FAIL");
  
  console.log(`  ${pc.dim("Plan integrity:")}       ${fmt(inv.planIntegrity)}`);
  console.log(`  ${pc.dim("Receipt reproducible:")} ${fmt(inv.receiptReproducible)}`);
  console.log(`  ${pc.dim("State transition:")}     ${fmt(inv.stateTransitionValid)}`);
  console.log(`  ${pc.dim("UTXO conservation:")}    ${fmt(inv.utxoConservation)}`);
  console.log(pc.bold(`\n  Overall:              ${allOk ? pc.bgGreen(pc.black(" ✓ ALL PASS ")) : pc.bgRed(pc.white(" ✗ VIOLATIONS FOUND "))}`));
  
  if (inv.issues.length > 0) { 
    console.log(pc.red(`\n  Issues:`)); 
    for (const i of inv.issues) console.log(`    ✗ ${i}`); 
  }
  console.log("");
  if (result.explain) printExplainChains(result.explain as unknown as ExplainChain[]);
}

export function printDagConflicts(result: QueryResult<DagConflict>): void {
  console.log(pc.dim("\n  ⚠ DAG model: deterministic-light-model (NOT GHOSTDAG)\n"));
  if (result.total === 0) { 
    console.log(pc.green("  ✓ No conflicts detected.\n")); 
    return; 
  }
  console.log(pc.bold(pc.magenta(`  ═══ DAG Conflicts: ${pc.white(result.total)} ═══\n`)));
  for (const c of result.items) {
    console.log(`  ${pc.red("CONFLICT")}: outpoint ${pc.yellow(c.outpoint)}`);
    console.log(`    ${pc.dim("├─")} ${pc.green("WINNER")}: ${pc.white(c.winnerTxId.slice(0, 24) + "...")}`);
    for (const l of c.loserTxIds) {
      console.log(`    ${pc.dim("└─")} ${pc.red("LOSER")}:  ${pc.dim(l.slice(0, 24) + "...")}`);
    }
    console.log("");
  }
  if (result.explain) printExplainChains(result.explain as unknown as ExplainChain[]);
}

export function printDagDisplaced(result: QueryResult<DagDisplacement>): void {
  console.log(pc.dim("\n  ⚠ DAG model: deterministic-light-model (NOT GHOSTDAG)\n"));
  if (result.total === 0) { 
    console.log(pc.green("  ✓ No displaced transactions.\n")); 
    return; 
  }
  console.log(pc.bold(pc.red(`  ═══ Displaced Transactions: ${pc.white(result.total)} ═══\n`)));
  for (const d of result.items) {
    const status = d.currentlyAccepted ? pc.green("re-accepted") : pc.red("displaced");
    console.log(`  ${pc.red("✗")} ${pc.white(d.txId.slice(0, 24) + "...")} ${pc.bold("[" + status + "]")}`);
    console.log(`    ${pc.dim(d.reason)}\n`);
  }
  if (result.explain) printExplainChains(result.explain as unknown as ExplainChain[]);
}

export function printDagHistory(result: QueryResult<DagTxHistory>): void {
  console.log(pc.dim("\n  ⚠ DAG model: deterministic-light-model (NOT GHOSTDAG)\n"));
  if (result.total === 0) { 
    console.log(pc.red("  ✗ Transaction not found in DAG.\n")); 
    return; 
  }
  console.log(pc.bold(pc.magenta(`  ═══ DAG Tx History ═══\n`)));
  for (const e of result.items) {
    const status = e.accepted ? pc.green("ACCEPTED") : e.displaced ? pc.red("DISPLACED") : pc.dim("UNKNOWN");
    const sinkPath = e.inSinkPath ? pc.blue("IN sink path") : pc.dim("NOT in sink path");
    console.log(`  ${status.padEnd(10)} ${pc.dim("block:")}${pc.white(e.blockId.slice(0, 12) + "...")} ${pc.dim("daa:")}${e.daaScore} ${sinkPath}`);
  }
  console.log("");
  if (result.explain) printExplainChains(result.explain as unknown as ExplainChain[]);
}

export function printSinkPath(result: QueryResult<DagSinkPath>): void {
  console.log(pc.dim("\n  ⚠ DAG model: deterministic-light-model (NOT GHOSTDAG)\n"));
  const sp = result.items[0];
  if (!sp) { 
    console.log(pc.red("  No sink path available.\n")); 
    return; 
  }
  console.log(pc.bold(pc.magenta(`  ═══ Sink Path (depth: ${pc.cyan(sp.depth)}) ═══\n`)));
  console.log(`  ${pc.dim("Sink:")} ${pc.white(sp.sink)}\n`);
  for (let i = 0; i < sp.nodes.length; i++) {
    const n = sp.nodes[i];
    if (!n) continue;
    const prefix = i === sp.nodes.length - 1 ? pc.dim("  └─") : pc.dim("  ├─");
    const genesis = n.isGenesis ? pc.green(" [GENESIS]") : "";
    console.log(`${prefix} ${pc.white(n.blockId.slice(0, 16) + "...")} ${pc.dim("daa:")}${n.daaScore} ${pc.dim("txs:")}${n.acceptedTxCount}${genesis}`);
  }
  console.log("");
}

export function printDagAnomalies(result: QueryResult<DagAnomaly>): void {
  console.log(pc.dim("\n  ⚠ DAG model: deterministic-light-model (NOT GHOSTDAG)\n"));
  if (result.total === 0) { 
    console.log(pc.green("  ✓ No DAG anomalies detected.\n")); 
    return; 
  }
  console.log(pc.bold(pc.red(`  ═══ DAG Anomalies: ${pc.white(result.total)} ═══\n`)));
  for (const a of result.items) {
    console.log(`  ${pc.red("✗")} ${pc.bold("[" + a.kind + "]")} ${pc.white(a.description)}\n`);
  }
  if (result.explain) printExplainChains(result.explain as unknown as ExplainChain[]);
}

export function printRpcHealthTimeline(result: QueryResult<any>): void {
  console.log(pc.bold(pc.magenta(`\n  ═══ RPC Health Timeline: ${pc.cyan(result.total)} events ═══\n`)));
  for (const e of result.items) {
    const state = e.state === "up" ? pc.green(e.state) : pc.red(e.state);
    console.log(`  ${pc.dim("[" + e.ts + "]")} ${pc.white(e.endpoint)} — ${state} ${pc.dim("(score: ")}${pc.bold(e.score)}${pc.dim(")")} ${pc.cyan(e.latencyMs + "ms")}`);
    for (const issue of e.issues) {
      console.log(`    ${pc.yellow("⚠")} ${pc.dim(issue)}`);
    }
  }
  console.log("");
}

export function printRpcDegradations(result: QueryResult<any>): void {
  if (result.total === 0) { 
    console.log(pc.green("\n  ✓ No RPC degradations detected in the queried window.\n")); 
    return; 
  }
  console.log(pc.bold(pc.red(`\n  ═══ RPC Degradation Periods: ${pc.white(result.total)} ═══\n`)));
  for (const d of result.items) {
    console.log(`  ${pc.red("✗")} ${pc.white(d.startTs)} to ${pc.white(d.endTs)} ${pc.dim("(" + d.durationMs + "ms)")}`);
    console.log(`    ${pc.dim("Endpoint:")}    ${pc.white(d.endpoint)}`);
    console.log(`    ${pc.dim("Worst State:")} ${pc.red(d.worstState)} ${pc.dim("(lowest score: ")}${pc.bold(d.lowestScore)}${pc.dim(")")}`);
    console.log(`    ${pc.dim("Events:")}      ${pc.cyan(d.eventCount)}\n`);
  }
}

export function printRpcCorrelation(result: QueryResult<any>): void {
  const c = result.items[0];
  if (!c) return;
  console.log(pc.bold(pc.magenta(`\n  ═══ RPC Submission Correlation: ${pc.white(c.txId.slice(0, 16) + "...")} ═══\n`)));
  console.log(`  ${pc.dim("Submitted At:")} ${pc.white(c.submittedAt)}`);
  console.log(`  ${pc.dim("Endpoint:")}     ${pc.cyan(c.endpoint)}`);
  
  const assessColor = c.assessment === "optimal" ? pc.green : c.assessment === "degraded" ? pc.yellow : pc.red;
  console.log(`  ${pc.dim("Assessment:")}   ${assessColor(c.assessment.toUpperCase())}`);
  console.log(`  ${pc.dim("State:")}        ${pc.white(c.stateAtSubmission)} ${pc.dim("(score: ")}${pc.bold(c.scoreAtSubmission)}${pc.dim(", ")}${pc.cyan(c.latencyAtSubmission + "ms")}${pc.dim(")")}`);
  
  if (c.nearbyErrors.length > 0) {
    console.log(pc.red(`\n  Nearby Errors (±30s):`));
    for (const e of c.nearbyErrors) {
      console.log(`    ${pc.dim("[" + e.ts + "]")} ${pc.red(e.error)}`);
    }
  }
  console.log("");
  if (result.explain) printExplainChains(result.explain as unknown as ExplainChain[]);
}

export function printCorrelationBundle(result: QueryResult<any>): void {
  const b = result.items[0];
  if (!b) return;
  console.log(pc.bold(pc.magenta(`\n  ═══ Operational Trace: ${pc.white(b.txId)} ═══\n`)));
  
  // Domains summary
  const domains = [];
  if (b.lineage) {
    const status = b.lineage.complete ? pc.green("complete") : pc.red("broken");
    domains.push(`${pc.white("Lineage")} (${status})`);
  }
  if (b.dag) {
    const status = b.dag.accepted ? pc.green("accepted") : pc.red("displaced");
    domains.push(`${pc.white("DAG")} (${status})`);
  }
  if (b.rpc) {
    const status = b.rpc.assessment === "optimal" ? pc.green(b.rpc.assessment) : pc.yellow(b.rpc.assessment);
    domains.push(`${pc.white("RPC")} (${status})`);
  }
  if (b.replay) {
    const status = b.replay.invariantsOk ? pc.green("pass") : pc.red("fail");
    domains.push(`${pc.white("Replay")} (${status})`);
  }
  console.log(`  ${pc.dim("Domains:")} ${domains.join(pc.dim(" | "))}\n`);

  // Merged timeline
  console.log(pc.bold(`  ─── Execution Timeline ───\n`));
  for (const t of b.timeline) {
    const ts = t.ts ? pc.dim("[" + t.ts + "]") : pc.dim("  (simulated)       ");
    const domain = pc.bold(pc.blue(t.domain.padEnd(8)));
    console.log(`  ${ts} ${domain} ${pc.white(t.summary)}`);
  }
  console.log("");
  
  if (result.explain) printExplainChains(result.explain as unknown as ExplainChain[]);
}

export function printExplainChains(chains: ExplainChain[]): void {
  console.log(pc.bold(pc.dim("  ─── Reasoning Chain ───\n")));
  for (const chain of chains) {
    console.log(`  ${pc.magenta("Q:")} ${pc.bold(pc.white(chain.question))}`);
    for (const step of chain.steps) {
      console.log(`    ${pc.dim(step.order + ".")} ${pc.white(step.assertion)}`);
      if (step.rule) console.log(`       ${pc.dim("Rule:")} ${pc.italic(pc.cyan(step.rule))}`);
    }
    console.log(`  ${pc.magenta("→")} ${pc.bold(pc.green(chain.conclusion))}`);
    console.log(`  ${pc.dim("[model:")} ${pc.blue(chain.model)}${pc.dim(", confidence:")} ${pc.yellow(chain.confidence)}${pc.dim("]")}\n`);
  }
}
