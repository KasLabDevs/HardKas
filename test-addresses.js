import { ensureDevAccounts, getOrCreateDevAccount } from "./packages/accounts/dist/index.js";
import fs from "node:fs";

async function run() {
  const tmpDir = fs.mkdtempSync("hardkas-test-dev-");
  await ensureDevAccounts(tmpDir);
  const alice = JSON.parse(fs.readFileSync(`${tmpDir}/.hardkas/dev-accounts/alice.json`, "utf-8"));
  console.log("Alice from dev-accounts:", alice.metadata.address);
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
run();
