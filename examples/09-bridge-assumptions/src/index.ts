import { Hardkas, writeArtifact } from "@hardkas/sdk";
import { 
  getL2BridgeAssumptions, 
  listL2BridgeAssumptions,
  L2BridgeAssumptions
} from "@hardkas/l2";
import fs from "node:fs";
import path from "node:path";

/**
 * Example 09: Bridge Assumptions
 * 
 * Demonstrates bridge security phase awareness and risk modeling 
 * without automating bridge operations.
 */
async function main() {
  console.log("╔══════════════════════════════╗");
  console.log("║         HardKAS              ║");
  console.log("║    Bridge Assumptions Demo   ║");
  console.log("╚══════════════════════════════╝\n");

  const hardkas = await Hardkas.create();
  const artifactsDir = path.join(process.cwd(), "artifacts");
  if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir);

  // 1. List Available Bridge Assumptions
  console.log("# Known L2 Bridge Profiles");
  const allAssumptions = listL2BridgeAssumptions();
  allAssumptions.forEach(a => {
    console.log(`- ${a.l2Network.toUpperCase()} (Phase: ${a.bridgePhase}, Risk: ${a.riskProfile})`);
  });
  console.log("");

  // 2. Deep Dive into Igra Bridge
  console.log("# Igra Bridge Security Model");
  console.log("----------------------------");
  const igra = getL2BridgeAssumptions("igra");

  if (igra) {
    console.log(`Phase:           ${igra.bridgePhase}`);
    console.log(`Trustless Exit:  ${igra.trustlessExit ? "ENABLED" : "DISABLED"}`);
    console.log(`Risk Profile:    ${igra.riskProfile.toUpperCase()}`);
    console.log(`Custody:         ${igra.custodyModel}`);
    console.log(`Exit Mechanism:  ${igra.exitModel}\n`);

    console.log("Security Phases:");
    console.log("1. pre-zk  -> Multisig/Trusted (Current)");
    console.log("2. mpc     -> Threshold Committee (Upcoming)");
    console.log("3. zk      -> Validity Proofs (Target State)\n");

    console.log("Architectural Guardrails:");
    igra.notes.forEach(note => {
      console.log(`✓ ${note}`);
    });
    console.log("");

    // 3. Generate Artifact
    console.log("# Generating Safety Artifact");
    const artifactPath = path.join(artifactsDir, "bridge-assumptions.json");
    await writeArtifact(artifactPath, igra);
    console.log(`✓ Artifact saved: ${path.relative(process.cwd(), artifactPath)}\n`);

    // 4. Verification Logic (Developer Tooling Style)
    console.log("# Automated Safety Check");
    if (igra.bridgePhase !== "zk" && igra.trustlessExit) {
      console.error("✗ CRITICAL: Trustless exit claimed in non-ZK phase.");
      process.exit(1);
    } else {
      console.log("✓ Safety invariant preserved: No trustless exit before ZK phase.");
    }
  } else {
    console.error("✗ Igra bridge assumptions not found.");
  }

  console.log("\n# Summary");
  console.log("Bridge security modeling completed. No bridge transactions executed.");
}

main().catch(err => {
  console.error("\n✖ Example failed");
  console.error(err);
  process.exit(1);
});
