import { Hardkas } from "./packages/sdk/dist/index.js";
import { execSync } from "node:child_process";

async function main() {
  const sdk = await Hardkas.open({ cwd: process.cwd() });

  try {
    console.log("Funding alice...");
    execSync("npx hardkas accounts fund alice --amount 100", { stdio: "pipe" });
  } catch (e) {
    console.log("Funding failed (might already be funded or localnet not running)", e.message);
  }

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
