#!/usr/bin/env node
// Verifies a fixture corpus with `hardkas artifact verify ... --strict --json` (the CLI from source).
//
// L-04 / M-03 (2026-11-07): `pnpm check:artifacts` failed by the calendar alone. The corpus in
// packages/artifacts/test/fixtures/valid is static, and strict verification refuses an artifact older than 30 days
// (STALE_ARTIFACT); 39 days after the fixtures were written the gate was red with no product defect. Staleness is a
// property of a live artifact, not of a fixture, so this gate verifies the corpus with HARDKAS_TEST_IGNORE_STALENESS=1:
// hashes, schemas, lineage and every other strict rule still apply. The staleness rule itself is tested with an
// injected clock (packages/artifacts/test/hardening.test.ts, packages/sdk/test/adversarial/wave2-d-send-fee.test.ts
// STALE-CLOCK-1), so it stays covered without making this gate depend on the date.
//
// `artifact:corruption` used to run `pnpm hardkas artifact verify ../artifacts/...`, whose non-zero exit was the
// expected outcome, so the script "failed" when it worked. With --reject every file of the corpus is verified on its
// own and must be refused; a refusal without a typed code (UNKNOWN_ERROR) is listed, since it is still a refusal.
//
// Usage: node scripts/check-artifact-fixtures.mjs <dir>            the corpus verifies (recursive, strict)
//        node scripts/check-artifact-fixtures.mjs <dir> --reject   every file of the corpus is refused
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "packages", "cli", "src", "index.ts");
const args = process.argv.slice(2);
const expectReject = args.includes("--reject");
const dir = args.find((a) => !a.startsWith("--"));
if (!dir) {
  console.error("usage: node scripts/check-artifact-fixtures.mjs <dir> [--reject]");
  process.exit(2);
}
const absDir = path.resolve(ROOT, dir);
if (!fs.existsSync(absDir)) {
  console.error(`check-artifact-fixtures: ${dir} does not exist`);
  process.exit(2);
}

function verify(target, recursive) {
  const r = spawnSync(
    process.execPath,
    ["--import", "tsx", CLI, "artifact", "verify", target, ...(recursive ? ["--recursive"] : []), "--strict", "--json"],
    { cwd: ROOT, encoding: "utf8", env: { ...process.env, HARDKAS_TEST_IGNORE_STALENESS: "1", NO_COLOR: "1" } }
  );
  let doc;
  try {
    doc = JSON.parse(String(r.stdout ?? "").trim());
  } catch {
    doc = undefined;
  }
  return { status: r.status, doc, stdout: String(r.stdout ?? ""), stderr: String(r.stderr ?? "") };
}
const errorCodes = (issues) => [...new Set((issues ?? []).filter((i) => i?.severity === "error").map((i) => i.code))];

if (!expectReject) {
  const r = verify(absDir, true);
  if (!r.doc) {
    console.error(`check-artifact-fixtures: the CLI did not print one JSON document (exit ${r.status})`);
    console.error(r.stdout.slice(0, 2000));
    console.error(r.stderr.slice(0, 2000));
    process.exit(1);
  }
  const result = r.doc.result ?? {};
  const rows = Array.isArray(result.results) ? result.results : [];
  const scanned = Number(result.scanned ?? rows.length);
  const failed = Number(result.failCount ?? rows.filter((x) => x?.result?.ok === false).length);
  for (const row of rows) {
    const codes = errorCodes(row?.result?.issues);
    console.log(`  ${row?.result?.ok === false ? "REFUSED " : "VERIFIED"}  ${path.basename(String(row?.path ?? row?.file ?? "?"))}${codes.length ? `  [${codes.join(", ")}]` : ""}`);
  }
  console.log(`check-artifact-fixtures: ${dir}: scanned ${scanned}, refused ${failed}, CLI exit ${r.status}`);
  if (scanned < 1) {
    console.error("check-artifact-fixtures: FAIL - the corpus is empty, the gate would pass with nothing verified");
    process.exit(1);
  }
  if (r.status !== 0 || r.doc.ok !== true || failed !== 0) {
    console.error("check-artifact-fixtures: FAIL - a fixture of the corpus does not verify under --strict");
    process.exit(1);
  }
  console.log("check-artifact-fixtures: PASS");
  process.exit(0);
}

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".json")) files.push(p);
  }
})(absDir);
files.sort();
if (files.length < 1) {
  console.error("check-artifact-fixtures: FAIL - the corpus is empty, the gate would pass with nothing refused");
  process.exit(1);
}
const accepted = [];
const untyped = [];
for (const file of files) {
  const r = verify(file, false);
  const refused = r.status !== 0 && r.doc?.ok === false;
  const rowIssues = (r.doc?.result?.results ?? []).flatMap((x) => x?.result?.issues ?? []);
  const codes = errorCodes(r.doc?.result?.issues ?? rowIssues);
  const code = codes.length ? codes.join(", ") : String(r.doc?.code ?? r.doc?.error?.code ?? "no code");
  if (!refused) accepted.push(file);
  if (code === "UNKNOWN_ERROR" || code === "no code") untyped.push(file);
  console.log(`  ${refused ? "REFUSED " : "ACCEPTED"}  ${path.relative(absDir, file)}  [${code}]`);
}
console.log(`check-artifact-fixtures: ${dir}: ${files.length} files, refused ${files.length - accepted.length}, untyped refusals ${untyped.length}`);
if (accepted.length > 0) {
  console.error(`check-artifact-fixtures: FAIL - a corrupted fixture was accepted: ${accepted.map((f) => path.relative(absDir, f)).join(", ")}`);
  process.exit(1);
}
console.log("check-artifact-fixtures: PASS");
