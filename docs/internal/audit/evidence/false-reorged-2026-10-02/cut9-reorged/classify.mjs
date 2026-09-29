// Classifies a REORGED record run with the criterion fixed in REORGED-DESIGN.md before measuring.
// Authority: the independent recorder's samples (the node, asked directly). HardKAS's emitted states
// and its persisted observations are what is judged, never the judge.
// usage: node classify.mjs <recordDir>
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.argv[2]);
const run = JSON.parse(fs.readFileSync(path.join(dir, "run.json"), "utf8"));
const results = [];
const tsOf = (x) => (typeof x === "number" ? x : Date.parse(x));

for (const t of run.txs) {
  if (!t.file) {
    results.push({ index: t.index, skipped: "send failed", detail: t.failedSend });
    continue;
  }
  const tx = JSON.parse(fs.readFileSync(path.join(dir, t.file), "utf8"));
  const samples = tx.samples.filter((s) => !s.error);
  // Observations carry ISO times; every sample has its own ISO time too (sample `at` counts from the
  // script's start, which is not run.startedAt, so ISO is compared with ISO).
  const sampleAtIso = (iso) => {
    const t = Date.parse(iso);
    return samples.find((s) => Date.parse(s.iso) >= t) ?? samples[samples.length - 1];
  };
  const sampleAt = (ms) => samples.find((s) => s.at >= ms) ?? samples[samples.length - 1];
  const after = (ms) => samples.filter((s) => s.at >= ms);

  // HardKAS: what it emitted, in order.
  const emitted = [];
  for (const s of tx.hardkas.wait.states) if (s.state) emitted.push({ at: s.at, from: "tx wait", state: s.state });
  // Classifier v2: the timeout message reads "…waiting for <txId> to be CONFIRMED; last derived state:
  // REORGED…"; v1 took the first state word (the target, CONFIRMED). The emitted state is the last one.
  const exitState = /last derived state: ([A-Z_]+)/.exec(tx.hardkas.wait.stderrTail ?? "")?.[1] ?? null;
  if (tx.hardkas.wait.code !== 0) emitted.push({ at: tx.hardkas.wait.endedAt, from: "tx wait exit", state: exitState ?? "(no state in error)", exit: tx.hardkas.wait.code });
  for (const l of tx.hardkas.statusLooks) emitted.push({ at: l.at, from: "tx status", state: l.state });
  const sequence = [];
  for (const e of emitted) if (sequence.length === 0 || sequence[sequence.length - 1].state !== e.state) sequence.push(e);

  // Truth: acceptance and outputs over time.
  const accEvents = tx.events.filter((e) => e.kind === "accepting");
  const firstAccepted = samples.find((s) => s.accepting);
  const changes = accEvents.filter((e) => e.from && e.to && e.from !== e.to).map((e) => ({ at: e.at, from: e.from, to: e.to, fromPrevious: e.fromPrevious, prevHeader: e.prevHeader, header: e.header }));
  const lost = accEvents.filter((e) => e.from && !e.to).map((e) => ({ at: e.at, from: e.from, fromPrevious: e.fromPrevious }));
  const mempoolGapsBeforeAcceptance = tx.events.filter((e) => e.kind === "mempool" && e.from === "present" && e.to === "absent" && !e.accepting).length;

  // Every REORGED HardKAS emitted, judged by the recorder.
  const claims = emitted.filter((e) => e.state === "REORGED").map((e) => {
    const atT = sampleAt(e.at);
    const later = after(e.at);
    const acceptedAtT = !!atT?.accepting;
    const outputsAtT = (atT?.outputs ?? 0) > 0;
    const laterAccepted = later.some((s) => s.accepting);
    const laterOutputs = later.some((s) => (s.outputs ?? 0) > 0);
    const verdict = acceptedAtT || outputsAtT || laterAccepted || laterOutputs ? "FALSE_REORGED" : "TRUE_REORGED";
    return { at: e.at, from: e.from, verdict, truthAtT: { accepting: atT?.accepting ?? null, outputs: atT?.outputs ?? null, mempool: atT?.mempool ?? null, daa: atT?.daa ?? null }, laterAccepted, laterOutputs };
  });

  // Mechanisms, from HardKAS's own persisted observations.
  const obs = tx.hardkas.observations;
  const removals = obs.filter((o) => o.finding?.type === "chain_removed").map((o) => {
    const A = o.finding.acceptingBlockHash;
    const truthThen = sampleAtIso(o.observedAt);
    const change = changes.find((c) => c.from === A) ?? null;
    const m1 = !!(truthThen?.accepting && truthThen.accepting !== A) || !!(change?.fromPrevious?.prevInRemoved && change?.fromPrevious?.reAcceptedIn);
    return { observedAt: o.observedAt, removedBlock: A, truthAcceptingThen: truthThen?.accepting ?? null, truthOutputsThen: truthThen?.outputs ?? null, nodeAnswerFromA: change?.fromPrevious ?? null, newAcceptingBlock: change?.to ?? truthThen?.accepting ?? null, M1: m1 };
  });
  const afterRemoval = removals.length ? obs.filter((o) => o.observedAt > removals[0].observedAt && o.finding?.type !== "chain_removed") : [];
  const reAccepting = removals[0]?.newAcceptingBlock ?? null;
  const reHeader = changes.find((c) => c.to === reAccepting)?.header ?? null;
  const scans = afterRemoval.map((o) => {
    const cursor = o.finding?.scannedFrom ?? null;
    const ch = cursor ? tx.cursorHeaders?.[cursor] : null;
    const cursorBlue = ch?.blueScore ? BigInt(ch.blueScore) : null;
    const reBlue = reHeader?.blueScore ? BigInt(reHeader.blueScore) : null;
    return {
      observedAt: o.observedAt,
      finding: o.finding?.type,
      cursor,
      cursorBlueScore: ch?.blueScore ?? null,
      reAcceptingBlueScore: reHeader?.blueScore ?? null,
      cursorAtOrAfterReAcceptance: cursorBlue !== null && reBlue !== null ? cursorBlue >= reBlue : null
    };
  });
  const m2 = scans.length > 0 && scans.every((s) => s.finding !== "chain_accepted" && s.finding !== "finality_reached") && scans.some((s) => s.cursorAtOrAfterReAcceptance === true);

  results.push({
    index: tx.index,
    txId: tx.txId,
    hardkasSequence: sequence.map((e) => `${e.state}@${(e.at / 1000).toFixed(1)}s(${e.from})`),
    hardkasRecovered: claims.length > 0 ? sequence.slice(sequence.findIndex((e) => e.state === "REORGED")).some((e) => ["ACCEPTED", "CONFIRMED", "FINALIZED"].includes(e.state)) : null,
    truth: {
      firstAcceptedAt: firstAccepted ? firstAccepted.at : null,
      acceptingBlockChanges: changes.length,
      acceptanceLost: lost.length,
      final: tx.finalTruth,
      mempoolGapsBeforeAcceptance
    },
    reorgedClaims: claims,
    removals,
    scansAfterRemoval: scans,
    mechanisms: { M1: removals.some((r) => r.M1), M2: m2 }
  });
}

const sent = results.filter((r) => !r.skipped);
const withClaims = sent.filter((r) => r.reorgedClaims.length > 0);
const summary = {
  transfers: run.txs.length,
  sent: sent.length,
  sendFailures: results.filter((r) => r.skipped).length,
  txsWithAcceptingBlockChanges: sent.filter((r) => r.truth.acceptingBlockChanges > 0).length,
  txsThatLostAcceptance: sent.filter((r) => r.truth.acceptanceLost > 0).length,
  txsWithReorgedClaims: withClaims.length,
  falseReorgedTxs: withClaims.filter((r) => r.reorgedClaims.some((c) => c.verdict === "FALSE_REORGED")).length,
  trueReorgedTxs: withClaims.filter((r) => r.reorgedClaims.every((c) => c.verdict === "TRUE_REORGED")).length,
  M1: withClaims.filter((r) => r.mechanisms.M1).length,
  M2: withClaims.filter((r) => r.mechanisms.M2).length,
  recoveredAfterReorged: withClaims.filter((r) => r.hardkasRecovered).length,
  finalTruthAccepted: sent.filter((r) => r.truth.final?.accepting).length,
  finalTruthOutputsPresent: sent.filter((r) => (r.truth.final?.outputs ?? 0) > 0).length,
  mempoolGapsBeforeAcceptance: sent.reduce((n, r) => n + r.truth.mempoolGapsBeforeAcceptance, 0),
  errors: run.errors?.length ?? 0
};
console.log(JSON.stringify({ summary, results }, null, 2));
