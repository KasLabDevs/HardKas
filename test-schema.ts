import { Hardkas } from "./packages/sdk/dist/index.js";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

async function main() {
  console.log("\n[1] Starting localnet...");
  execSync("node packages/cli/dist/index.js localnet start --detached", { stdio: "inherit" });
  await new Promise((r) => setTimeout(r, 5000));

  console.log("\n[2] Checking localnet status...");
  execSync("node packages/cli/dist/index.js localnet status", { stdio: "inherit" });

  console.log("\n[3] Funding accounts...");
  execSync("node packages/cli/dist/index.js accounts fund alice --amount 500", { stdio: "inherit" });
  execSync("node packages/cli/dist/index.js accounts fund bob --amount 500", { stdio: "inherit" });


  const canonicalPath = path.resolve("./packages/artifacts/dist/canonical.js");
  const { calculateContentHash } = await import("file://" + canonicalPath.replace(/\\/g, '/'));
  const artifactsDir = path.join(process.cwd(), ".hardkas", "artifacts");
  if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });
  const dummyProfile = {
    schema: "hardkas.networkProfile.v1",
    version: "1.0.0-alpha",
    artifactId: "simnet",
    networkId: "simnet",
    rpcUrl: "ws://127.0.0.1:18210",
    description: "Simnet dummy profile",
    kind: "kaspa-node"
  };
  dummyProfile.contentHash = calculateContentHash(dummyProfile, 1);
  fs.writeFileSync(path.join(artifactsDir, "simnet.json"), JSON.stringify(dummyProfile));

  const sdk = await Hardkas.open({ cwd: process.cwd() });

  const plan = await sdk.tx.plan({
    from: "alice",
    to: "kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw",
    amount: 10,
    networkProfile: "simnet"
  });

  console.log("Plan Schema:", plan.schema || (plan as any).metadata?.schema);

  try {
    const signed = await sdk.tx.sign(plan, "alice");
    console.log("Sign Success Schema:", signed.schema || (signed as any).metadata?.schema);
  } catch (e) {
    console.error("Sign Failed:", e.message);
  }
}
main().catch(console.error);
