import { Hardkas, formatSompi, parseKasToSompi } from "@hardkas/sdk";
import { 
  createInitialLocalnetState, 
  createLocalnetSnapshot, 
  restoreLocalnetSnapshot,
  getAccountBalanceSompi,
  applySimulatedPayment,
  LocalnetState
} from "@hardkas/localnet";

/**
 * Example 05: Snapshot & Restore
 * 
 * Demonstrates deterministic local state management using snapshots 
 * and restore flows within the HardKAS infrastructure.
 */
async function main() {
  console.log("╔══════════════════════════════╗");
  console.log("║         HardKAS              ║");
  console.log("║    Snapshot & Restore Demo   ║");
  console.log("╚══════════════════════════════╝\n");

  // 1. Initialize Hardkas SDK and Initial State
  const hardkas = await Hardkas.create();
  
  console.log("# Initializing Local State");
  let state: LocalnetState = createInitialLocalnetState({
    accounts: 2,
    initialBalanceSompi: parseKasToSompi("1000")
  });
  
  const alice = "alice";
  const bob = "bob";

  const logBalances = (s: LocalnetState, label: string) => {
    const aliceBal = getAccountBalanceSompi(s, alice);
    const bobBal = getAccountBalanceSompi(s, bob);
    console.log(`[${label.padEnd(15)}]`);
    console.log(`  Alice: ${formatSompi(aliceBal)}`);
    console.log(`  Bob:   ${formatSompi(bobBal)}`);
    console.log(`  DAA:   ${s.daaScore}\n`);
  };

  logBalances(state, "Initial State");

  // 2. Create Snapshot
  console.log("# Creating Snapshot: snapshot-before-transfer");
  state = createLocalnetSnapshot(state, "snapshot-before-transfer");
  const snapshotId = state.snapshots![0].id;
  console.log(`✓ Snapshot saved (ID: ${snapshotId})\n`);

  // 3. Simulate State Mutation (Transfer)
  const transferAmount = parseKasToSompi("250");
  console.log(`# Simulating Transfer: Alice -> Bob (${formatSompi(transferAmount)})`);
  
  const result = applySimulatedPayment(state, {
    from: alice,
    to: bob,
    amountSompi: transferAmount,
    feeRateSompiPerMass: 1n
  });
  
  state = result.state;
  console.log(`✓ Transfer successful (TxID: ${result.receipt.txId})`);
  console.log(`  Fee: ${formatSompi(BigInt(result.receipt.feeSompi))}\n`);

  logBalances(state, "Modified State");

  // 4. Restore Snapshot
  console.log("# Restoring Snapshot: snapshot-before-transfer");
  state = restoreLocalnetSnapshot(state, "snapshot-before-transfer");
  console.log("✓ State restored successfully\n");

  logBalances(state, "Restored State");

  // 5. Final Verification
  console.log("# Verification");
  const aliceBal = getAccountBalanceSompi(state, alice);
  const initialBal = parseKasToSompi("1000");

  if (aliceBal === initialBal) {
    console.log("✓ Balance verification: MATCH");
  } else {
    console.error("✗ Balance verification: MISMATCH");
    process.exit(1);
  }

  if (state.daaScore === "0") {
    console.log("✓ DAA Score verification: MATCH");
  } else {
    console.error("✗ DAA Score verification: MISMATCH");
    process.exit(1);
  }

  console.log("\nSnapshot restore successful. Deterministic recovery verified.");
}

main().catch(err => {
  console.error("\n✖ Example failed");
  console.error(err);
  process.exit(1);
});
