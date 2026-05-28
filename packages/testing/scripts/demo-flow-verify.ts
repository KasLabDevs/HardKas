import fs from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");

async function runDemoFlow() {
  console.log("🔥 INITIALIZING HARDKAS DEMO FLOW VERIFIER 🔥");

  const sandboxTmp = path.join(ROOT_DIR, `.sandbox-demo-verify-${randomUUID().slice(0, 8)}`);
  const cliPath = path.join(ROOT_DIR, "packages/cli/dist/index.js");

  try {
    console.log(`\n📦 Creating temporary sandbox at: ${sandboxTmp}`);
    await fs.mkdir(sandboxTmp, { recursive: true });
    await fs.writeFile(path.join(sandboxTmp, ".hardkas-sandbox-target"), "DO NOT REMOVE");

    console.log("\n🚀 Running transfer recipe...");
    await execa("node", [cliPath, "sandbox", "--with-node", "--recipe", "transfer"], { cwd: sandboxTmp, stdio: "inherit" });

    console.log("\n🔍 Running hardkas dev last (discovery)...");
    const lastResult = await execa("node", [cliPath, "dev", "last", "--workspace", sandboxTmp, "--json"], { cwd: sandboxTmp });
    const lastJson = JSON.parse(lastResult.stdout);
    if (!lastJson.id) {
      throw new Error("Could not discover latest artifact!");
    }
    console.log(`✅ Discovered latest artifact: ${lastJson.id}`);

    console.log(`\n🕵️ Running hardkas why ${lastJson.id}...`);
    await execa("node", [cliPath, "why", lastJson.id, "--workspace", sandboxTmp], { cwd: sandboxTmp, stdio: "inherit" });

    console.log("\n⏪ Running hardkas dev last --replay...");
    await execa("node", [cliPath, "dev", "last", "--replay", "--workspace", sandboxTmp], { cwd: sandboxTmp, stdio: "inherit" });

    console.log("\n🔧 Running projection-rebuild recipe...");
    await execa("node", [cliPath, "sandbox", "--with-node", "--recipe", "projection-rebuild"], { cwd: sandboxTmp, stdio: "inherit" });

    console.log("\n✨ DEMO FLOW VERIFIED SUCCESSFULLY. The Wow Moment is ready.");
  } catch (error: any) {
    console.error(`\n❌ DEMO FLOW FAILED: ${error.message}`);
    process.exit(1);
  } finally {
    console.log(`\n🧹 Cleaning up sandbox at: ${sandboxTmp}`);
    await fs.rm(sandboxTmp, { recursive: true, force: true }).catch(() => {});
  }
}

runDemoFlow().catch(console.error);
