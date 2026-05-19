const h = (globalThis as any).hardkas;

console.log("\nAccount Balances:");
for (const name of h.accountNames()) {
  console.log(`  ${name}: ${h.balanceOf(name)} sompi`);
}
