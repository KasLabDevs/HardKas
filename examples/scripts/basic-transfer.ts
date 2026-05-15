// Run with: hardkas run examples/scripts/basic-transfer.ts

const h = (globalThis as any).hardkas;

if (!h) {
  console.error("HardKAS harness not injected. Run with --harness (default).");
  process.exit(1);
}

console.log("═══════════════════════════════════════════════════════════");
console.log(" HardKAS Script: Basic Transfer");
console.log("═══════════════════════════════════════════════════════════");

const names = h.accountNames();
console.log("Accounts:", names.join(", "));
console.log("Alice balance:", h.balanceOf("alice"), "sompi");

console.log("\nSending 10 KAS from Alice to Bob...");
const result = h.send({ from: "alice", to: "bob", amountSompi: 10_000_000_000n });

console.log("Transfer status:", result.receipt.status);
console.log("TxId:", result.receipt.txId);

console.log("\nFinal Balances:");
console.log("Alice after:", h.balanceOf("alice"), "sompi");
console.log("Bob after:", h.balanceOf("bob"), "sompi");
console.log("═══════════════════════════════════════════════════════════");
