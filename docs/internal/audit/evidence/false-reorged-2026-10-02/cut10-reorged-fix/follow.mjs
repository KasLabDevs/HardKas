// AFTER the fix: when the accepting chain block changes while HardKAS holds it, does HardKAS follow the
// transaction? Reads a record dir written by cut9-reorged/reorged-record.mjs (unchanged harness).
// Authority stays the independent recorder (the node, asked directly); HardKAS's persisted observations
// are what is judged. Complements classify.mjs (REORGED verdicts) and exposure.mjs (replacedWhileHeld).
// usage: node follow.mjs <recordDir>
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.argv[2]);
const run = JSON.parse(fs.readFileSync(path.join(dir, "run.json"), "utf8"));
const short = (h) => (h ? h.slice(0, 8) : null);
const rows = [];
for (const t of run.txs.filter((x) => x.file)) {
  const tx = JSON.parse(fs.readFileSync(path.join(dir, t.file), "utf8"));
  const samples = tx.samples.filter((s) => !s.error);
  const truthAt = (iso) => {
    const ms = Date.parse(iso);
    let last = null;
    for (const s of samples) {
      if (Date.parse(s.iso) > ms) break;
      last = s;
    }
    return last;
  };
  const truthSeq = tx.events.filter((e) => e.kind === "accepting").map((e) => ({ iso: e.iso, block: e.to }));
  const truthOrder = truthSeq.map((e) => e.block);
  const truthChanges = tx.events.filter((e) => e.kind === "accepting" && e.from && e.to && e.from !== e.to);
  const obs = tx.hardkas.observations;
  const lastLook = obs.length ? obs[obs.length - 1].observedAt : null;

  // What HardKAS held, look by look.
  let held = null;
  const heldTimeline = [];
  const links = [];
  for (const o of obs) {
    const f = o.finding ?? {};
    if (f.type === "chain_accepted" || f.type === "finality_reached") {
      if (f.type === "chain_accepted" && f.removedAcceptingBlockHash) {
        const i = truthOrder.indexOf(f.removedAcceptingBlockHash);
        const j = truthOrder.lastIndexOf(f.acceptingBlockHash);
        links.push({
          observedAt: o.observedAt,
          removed: short(f.removedAcceptingBlockHash),
          accepting: short(f.acceptingBlockHash),
          linkMatchesHeld: f.removedAcceptingBlockHash === held,
          // The recorder saw the removed block accepting first and the new block accepting later.
          consistentWithTruth: i >= 0 && j > i
        });
      }
      if (f.acceptingBlockHash !== held) heldTimeline.push({ observedAt: o.observedAt, block: short(f.acceptingBlockHash), via: f.type, link: short(f.removedAcceptingBlockHash) });
      held = f.acceptingBlockHash;
    } else if (f.type === "chain_removed") {
      heldTimeline.push({ observedAt: o.observedAt, block: null, via: "chain_removed", removed: short(f.acceptingBlockHash) });
      held = null;
    }
  }

  // Every change the recorder saw of a block HardKAS was holding, while HardKAS was still looking: did
  // HardKAS move to a later block of the truth sequence without recording a removal?
  const replacedWhileHeld = [];
  for (const c of truthChanges) {
    if (!lastLook || Date.parse(c.iso) > Date.parse(lastLook)) continue;
    const before = obs.filter((o) => o.observedAt <= c.iso);
    const heldThen = [...before].reverse().find((o) => ["chain_accepted", "finality_reached", "chain_removed"].includes(o.finding?.type));
    const heldBlock = heldThen && heldThen.finding.type !== "chain_removed" ? heldThen.finding.acceptingBlockHash : null;
    if (heldBlock !== c.from) continue;
    const later = obs.filter((o) => o.observedAt > c.iso);
    const firstMove = later.find((o) => ["chain_accepted", "finality_reached", "chain_removed"].includes(o.finding?.type) && o.finding.acceptingBlockHash !== c.from);
    replacedWhileHeld.push({
      at: c.iso,
      from: short(c.from),
      to: short(c.to),
      hardkasNext: firstMove ? { observedAt: firstMove.observedAt, type: firstMove.finding.type, block: short(firstMove.finding.acceptingBlockHash), link: short(firstMove.finding.removedAcceptingBlockHash) } : null,
      followed: !!firstMove && firstMove.finding.type !== "chain_removed" && truthOrder.indexOf(firstMove.finding.acceptingBlockHash) > truthOrder.indexOf(c.from),
      removalRecorded: later.some((o) => o.finding?.type === "chain_removed")
    });
  }

  const lastHeldTruth = lastLook ? truthAt(lastLook) : null;
  const lastHeld = [...obs].reverse().find((o) => ["chain_accepted", "finality_reached", "chain_removed"].includes(o.finding?.type));
  rows.push({
    index: tx.index,
    txId: tx.txId,
    truthAcceptingSequence: truthOrder.map(short),
    truthChanges: truthChanges.length,
    hardkasHeldTimeline: heldTimeline,
    links,
    removalsRecordedByHardkas: obs.filter((o) => o.finding?.type === "chain_removed").length,
    replacedWhileHeld,
    atLastLook: {
      hardkasHeld: lastHeld && lastHeld.finding.type !== "chain_removed" ? short(lastHeld.finding.acceptingBlockHash) : null,
      truthAccepting: short(lastHeldTruth?.accepting ?? null),
      agree: !!lastHeld && lastHeld.finding.type !== "chain_removed" && lastHeld.finding.acceptingBlockHash === (lastHeldTruth?.accepting ?? null)
    },
    hardkasLastState: t.lastState
  });
}
const all = rows.flatMap((r) => r.replacedWhileHeld);
const summary = {
  txs: rows.length,
  txsWithTruthChurn: rows.filter((r) => r.truthChanges > 0).length,
  replacedWhileHeld: all.length,
  followed: all.filter((x) => x.followed).length,
  notFollowed: all.filter((x) => !x.followed).length,
  linksRecorded: rows.reduce((n, r) => n + r.links.length, 0),
  linksConsistentWithTruth: rows.reduce((n, r) => n + r.links.filter((l) => l.consistentWithTruth).length, 0),
  linksMatchingHeldBlock: rows.reduce((n, r) => n + r.links.filter((l) => l.linkMatchesHeld).length, 0),
  removalsRecordedByHardkas: rows.reduce((n, r) => n + r.removalsRecordedByHardkas, 0),
  lastLookAgreesWithTruth: rows.filter((r) => r.atLastLook.agree).length,
  lastStates: rows.reduce((m, r) => ((m[r.hardkasLastState] = (m[r.hardkasLastState] ?? 0) + 1), m), {})
};
console.log(JSON.stringify({ summary, rows }, null, 2));
