/**
 * Recomputes content hashes for RISC0 fixture files after version bump
 * and updates risc0/manifest.json accordingly.
 *
 * Run: node scripts/_recompute_fixture_hashes.mjs
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

// ---- Minimal canonical hash implementation (mirrors packages/artifacts/src/canonical.ts) ----

const V4_EXCLUSIONS = new Set([
  "contentHash", "artifactId", "planId", "signedId", "hashVersion",
  "filePath", "file_path", "workspacePath", "debug", "logs", "uiHints", "cache", "lastViewedAt",
  "createdAt", "events", "status", "submittedAt", "confirmedAt", "dagContext", "executionId",
  "deployedAt", "tracePath", "receiptPath", "sourceSignedId", "signatureMetadata",
  "rpcHost", "rpcUrl", "latencyMs", "indexedAt", "file_mtime_ms", "hardkasVersion"
]);

const PATH_KEYS = new Set([
  "file_path", "sandboxSnapshotPath", "receiptPath", "tracePath",
  "outputPath", "artifactPath", "workspacePath", "relativePath", "absolutePath"
]);

function canonicalStringify(obj, keyName, isRoot = true) {
  if (obj === null || typeof obj !== "object") {
    if (typeof obj === "bigint") return JSON.stringify(`n:${obj.toString()}`);
    if (typeof obj === "string") {
      let s = obj.normalize("NFC").replace(/\r\n/g, "\n");
      if (keyName && PATH_KEYS.has(keyName)) s = s.replace(/\\/g, "/");
      return JSON.stringify(s);
    }
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(item => canonicalStringify(item, keyName, false)).join(",") + "]";
  }
  const sortedKeys = Object.keys(obj)
    .filter(k => !V4_EXCLUSIONS.has(k) && obj[k] !== undefined)
    .sort();
  const result = sortedKeys
    .map(k => JSON.stringify(k) + ":" + canonicalStringify(obj[k], k, false))
    .join(",");
  return "{" + result + "}";
}

function calculateContentHash(obj) {
  return createHash("sha256").update(canonicalStringify(obj)).digest("hex");
}

// ---- Main ----

const risc0Dir = path.join(repoRoot, "fixtures", "toccata-v2", "zk", "risc0");
const manifestPath = path.join(risc0Dir, "manifest.json");

// Read current fixture files
const receiptPath = path.join(risc0Dir, "receipt.json");
const journalPath = path.join(risc0Dir, "journal.json");
const imageIdPath = path.join(risc0Dir, "image-id.json");
const verifyReportPath = path.join(risc0Dir, "verify-report.json");

const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
const imageId = JSON.parse(fs.readFileSync(imageIdPath, "utf8"));
const verifyReport = JSON.parse(fs.readFileSync(verifyReportPath, "utf8"));

const receiptHash = calculateContentHash(receipt);
const journalHash = calculateContentHash(journal);
const imageIdHash = calculateContentHash(imageId);
const verifyReportHash = calculateContentHash(verifyReport);

console.log("Computed hashes:");
console.log(`  receipt:     ${receiptHash}`);
console.log(`  journal:     ${journalHash}`);
console.log(`  imageId:     ${imageIdHash}`);
console.log(`  verifyReport: ${verifyReportHash}`);

// Check what's currently stored
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
console.log("\nCurrently stored:");
console.log(`  receipt:     ${manifest.contentHashes.receipt}`);
console.log(`  journal:     ${manifest.contentHashes.journal}`);
console.log(`  imageId:     ${manifest.contentHashes.imageId}`);
console.log(`  verifyReport: ${manifest.contentHashes.verifyReport}`);

console.log("\nDelta:");
const changed = [];
if (manifest.contentHashes.receipt !== receiptHash)   { console.log(`  receipt:     CHANGED`); changed.push("receipt"); }
if (manifest.contentHashes.journal !== journalHash)   { console.log(`  journal:     CHANGED`); changed.push("journal"); }
if (manifest.contentHashes.imageId !== imageIdHash)   { console.log(`  imageId:     CHANGED`); changed.push("imageId"); }
if (manifest.contentHashes.verifyReport !== verifyReportHash) { console.log(`  verifyReport: CHANGED`); changed.push("verifyReport"); }
if (changed.length === 0) console.log("  (none)");

// Update manifest
manifest.contentHashes.receipt = receiptHash;
manifest.contentHashes.journal = journalHash;
manifest.contentHashes.imageId = imageIdHash;
manifest.contentHashes.verifyReport = verifyReportHash;

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`\nUpdated ${manifestPath}`);

// Also update verify-report.json receiptHash for internal consistency
if (verifyReport.receiptHash !== undefined) {
  verifyReport.receiptHash = receiptHash;
  fs.writeFileSync(verifyReportPath, JSON.stringify(verifyReport, null, 2) + "\n");
  console.log(`Updated verify-report.json receiptHash to ${receiptHash}`);
}

console.log("\nDone. Now re-run SDK tests.");
