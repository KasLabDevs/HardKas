import { checkArtifactIdentity } from "@hardkas/artifacts";

/**
 * REPLAY-TRUST-2 (RT-I5, D-RT4) · the replay status the dashboard derives from stored replay reports. A stored report is
 * a recorded claim, never an authority (only a fresh `hardkas replay verify` is):
 * - it counts only when it verifies as the identity it claims (a report edited afterwards does not);
 * - it speaks for a receipt only when it names that receipt as the one it verified (its lineage parent); of those, the
 *   latest decides;
 * - a report decided on the masked comparison (no `receiptComparison: "raw"`, EVIDENCE-DIFF-REDACTION-1 D4), or one that
 *   names no receipt (made before reports did), is LEGACY: re-verify. It is never a PASS.
 * PASS and FAIL come only from the report's own booleans, all three present.
 */
export type ReplayStatus = "PASS" | "FAIL" | "LEGACY";

interface StoredReport {
  payload: any;
}

export interface ReplayStatusResult<R extends StoredReport> {
  status?: ReplayStatus;
  /** The report the status comes from. */
  report?: R;
}

const createdAtOf = (r: StoredReport) => String(r.payload?.createdAt ?? "");
const latest = <R extends StoredReport>(reports: R[]): R | undefined =>
  [...reports].sort((a, b) => createdAtOf(b).localeCompare(createdAtOf(a)))[0];
const verifying = <R extends StoredReport>(reports: R[]): R[] => reports.filter((r) => checkArtifactIdentity(r.payload).ok);
const verdictOf = (payload: any): ReplayStatus =>
  payload?.receiptComparison !== "raw"
    ? "LEGACY"
    : payload.planOk === true && payload.receiptOk === true && payload.invariantsOk === true
      ? "PASS"
      : "FAIL";

/** The status of one receipt (`receiptId`: its verified identity; `txId`: what a report without a receipt names). */
export function replayStatusOf<R extends StoredReport>(
  reports: R[],
  receiptId: string | undefined,
  txId: string | undefined
): ReplayStatusResult<R> {
  const candidates = verifying(reports);
  const bound = latest(candidates.filter((r) => receiptId !== undefined && r.payload?.lineage?.parentArtifactId === receiptId));
  if (bound) return { status: verdictOf(bound.payload), report: bound };
  const unbound = latest(candidates.filter((r) => txId !== undefined && r.payload?.txId === txId && !r.payload?.lineage?.parentArtifactId));
  if (unbound) return { status: "LEGACY", report: unbound };
  return {};
}

/** The workspace's status: each verified receipt's latest report, plus the reports that name no receipt. */
export function overallReplayStatus<R extends StoredReport>(reports: R[]): ReplayStatus | "NONE" {
  const candidates = verifying(reports);
  const byReceipt = new Map<string, R[]>();
  for (const r of candidates) {
    const parent = r.payload?.lineage?.parentArtifactId;
    if (typeof parent === "string" && parent) byReceipt.set(parent, [...(byReceipt.get(parent) ?? []), r]);
  }
  const verdicts = [...byReceipt.values()].map((rs) => verdictOf(latest(rs)!.payload));
  // a report naming no receipt counts unless a report bound to a receipt speaks for the same transaction
  const boundTxIds = new Set([...byReceipt.values()].flat().map((r) => r.payload?.txId));
  if (candidates.some((r) => !r.payload?.lineage?.parentArtifactId && !boundTxIds.has(r.payload?.txId))) verdicts.push("LEGACY");
  if (verdicts.includes("FAIL")) return "FAIL";
  if (verdicts.includes("LEGACY")) return "LEGACY";
  return verdicts.includes("PASS") ? "PASS" : "NONE";
}
