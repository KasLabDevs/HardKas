// Why did most transactions with accepting-block churn still reach CONFIRMED? For each tx: the
// accepting blocks HardKAS itself recorded (chain_accepted / finality_reached / chain_removed), and
// whether the recorder saw a block HardKAS held as accepting replaced WHILE HardKAS was still looking.
// usage: node exposure.mjs <recordDir>
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.argv[2]);
const run = JSON.parse(fs.readFileSync(path.join(dir, "run.json"), "utf8"));
const rows = [];
for (const t of run.txs.filter((x) => x.file)) {
  const tx = JSON.parse(fs.readFileSync(path.join(dir, t.file), "utf8"));
  const obs = tx.hardkas.observations;
  const lastLook = obs.length ? Date.parse(obs[obs.length - 1].observedAt) : 0;
  const firstAcceptedLook = obs.find((o) => o.finding?.type === "chain_accepted" || o.finding?.type === "finality_reached");
  const heldBlocks = [...new Set(obs.filter((o) => o.finding?.type === "chain_accepted" || o.finding?.type === "finality_reached").map((o) => o.finding.acceptingBlockHash))];
  const truthChanges = tx.events.filter((e) => e.kind === "accepting" && e.from && e.to && e.from !== e.to);
  const truthChain = tx.events.filter((e) => e.kind === "accepting").map((e) => e.to);
  const replacedWhileHeld = truthChanges.filter((c) => heldBlocks.includes(c.from) && Date.parse(c.iso) <= lastLook);
  const changesBeforeFirstHardkasAcceptance = firstAcceptedLook ? truthChanges.filter((c) => Date.parse(c.iso) < Date.parse(firstAcceptedLook.observedAt)).length : null;
  rows.push({
    index: tx.index,
    hardkasHeld: heldBlocks.map((h) => h.slice(0, 8)),
    truthAcceptingSequence: truthChain.map((h) => (h ? h.slice(0, 8) : null)),
    truthChanges: truthChanges.length,
    changesBeforeFirstHardkasAcceptance,
    hardkasHeldTheFinalBlock: heldBlocks.includes(tx.finalTruth.accepting),
    replacedWhileHeld: replacedWhileHeld.length,
    removalsRecordedByHardkas: obs.filter((o) => o.finding?.type === "chain_removed").length
  });
}
console.log(JSON.stringify(rows, null, 2));
