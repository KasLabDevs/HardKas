// Run with: hardkas run scripts/transfer.ts
// or:       pnpm transfer

const h = (globalThis as any).hardkas;

const [alice, bob] = h.accountNames();

console.log(`\nAccounts:`);
console.log(`  Alice: ${h.balanceOf(alice)} sompi`);
console.log(`  Bob:   ${h.balanceOf(bob)} sompi`);

console.log(`\nSending 10 KAS from ${alice} to ${bob}...`);
const result = h.send({
  from: alice,
  to: bob,
  amountSompi: 10_000_000_000n
});

console.log(`  Status: ${result.receipt.status}`);
console.log(`  TxId:   ${result.receipt.txId}`);

console.log(`\nBalances after:`);
console.log(`  Alice: ${h.balanceOf(alice)} sompi`);
console.log(`  Bob:   ${h.balanceOf(bob)} sompi`);
