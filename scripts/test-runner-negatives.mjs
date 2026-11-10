// scripts/test-runner-negatives.mjs
// Negative tests of the merchant compatibility evidence checker.
//
// CA-EV-06 / HK-07 (audit 6-nov-2026): this script used to build a "valid" base model whose PASS rows were written by
// hand (no operation executed) and then mutate it; the semantic checker of the battery now refuses such a model by
// design, so the old approach could only pass by trusting fabricated evidence. The negative cases (fabricated PASS,
// literal verdicts, edited or foreign output, zero duration, legacy statuses, missing checks, duplicated transactions,
// evidence on NOT_EXECUTED rows) are covered against a REAL run by
// scripts/run-merchant-compatibility-battery-selftest.mjs, which this script now runs.
// Usage: node scripts/test-runner-negatives.mjs [--keep]   (exit code: the self-test's)
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const selftest = path.join(here, "run-merchant-compatibility-battery-selftest.mjs");
const r = spawnSync(process.execPath, [selftest, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(r.status ?? 1);
