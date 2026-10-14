// TASK-EVIDENCE-UNBOUND-1 (read-only): every artifact of a workspace store with its identity, its parent link and what
// references a given txId. node lineage-map.mjs <workspace> [txId]
import fs from "node:fs";
import path from "node:path";
const [ws, txId] = process.argv.slice(2);
const root = path.join(ws, ".hardkas", "artifacts");
const rows = [];
for (const rel of fs.readdirSync(root, { recursive: true })) {
  const p = path.join(root, String(rel));
  if (!String(rel).endsWith(".json") || !fs.statSync(p).isFile()) continue;
  let a;
  try {
    a = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    continue;
  }
  const text = JSON.stringify(a);
  if (txId && !text.includes(txId) && !String(a.schema).includes("scenarioResult")) continue;
  rows.push({
    file: String(rel),
    schema: a.schema,
    hashVersion: a.hashVersion,
    contentHash: a.contentHash?.slice(0, 12),
    parent: a.lineage?.parentArtifactId?.slice(0, 12) ?? null,
    root: a.lineage?.rootArtifactId?.slice(0, 12) ?? null,
    workflowId: (a.workflowId ?? a.lineage?.workflowId ?? null)?.slice?.(0, 16) ?? null,
    refs: Object.entries({
      planArtifactId: a.authorization?.planArtifactId ?? a.planArtifactId,
      signedArtifactId: a.signedArtifactId ?? a.submission?.signedArtifactId,
      submissionArtifactId: a.submissionArtifactId
    })
      .filter(([, v]) => typeof v === "string")
      .map(([k, v]) => `${k}=${v.slice(0, 12)}`)
      .join(" "),
    artifactsGenerated: Array.isArray(a.artifactsGenerated) ? a.artifactsGenerated.length : undefined,
    mode: a.mode ?? a.execution?.mode
  });
}
for (const r of rows) console.log(JSON.stringify(r));
