import { Hardkas } from "./packages/sdk/dist/index.js";
import { resetLocalnetState } from "./packages/localnet/dist/index.js";

async function main() {
  console.log("=== P72 Reality Adapter Verification ===\n");
  const cwd = process.cwd();

  // Reset localnet
  await resetLocalnetState({ cwd, initialBalanceSompi: 100_000_000_000n });
  const hardkas = await Hardkas.open({ cwd, network: "simulated", autoBootstrap: true });

  console.log("[1] Toccata Capability Detector");
  const toccataCaps = await hardkas.toccata.capabilities();
  console.log("Toccata status:", toccataCaps.status);
  
  console.log("\n[2] Covenant Artifact Builder");
  try {
    const covenant = await hardkas.toccata.buildCovenant({
      scriptHash: "0000000000000000000000000000000000000000000000000000000000000000"
    });
    console.log("Built covenant artifact:", covenant.schema);
  } catch (e) {
    console.log("Covenant blocked as expected:", e.message);
  }

  console.log("\n[3] SilverScript Dependency Probe");
  try {
    await hardkas.silver.compile({ file: "dummy.ss" });
  } catch (e) {
    console.log("SilverScript blocked as expected:", e.message.substring(0, 80) + "...");
  }

  console.log("\n[4] vProgs Dependency Probe");
  const vprogRes = await hardkas.vprogs.inspect("dummy.vprog");
  console.log("vProgs inspect status:", vprogRes.status);
  if (vprogRes.issues?.length > 0) {
    console.log("vProgs block reason:", vprogRes.issues[0].code, "-", vprogRes.issues[0].message);
  }

  console.log("\n[5] Igra Read-Only Probe");
  const igraMissing = await hardkas.igra.probe();
  console.log("Igra without URL status:", igraMissing.status, "-", igraMissing.error);
  
  // Try with a dummy URL to simulate a real check that fails
  const igraFail = await hardkas.igra.probe("http://localhost:9999");
  console.log("Igra with bad URL status:", igraFail.status, "-", igraFail.error);

  console.log("\n=== Verification Complete ===");
}

main().catch(err => {
  console.error("Verification failed:", err);
  process.exit(1);
});
