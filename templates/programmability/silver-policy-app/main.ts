import { Hardkas } from "@hardkas/sdk";

// The SilverScript golden corpus: every case recompiled by the managed silverc
// v1.0.0 and checked against evidence from the verified rusty-kaspad node.
export async function main() {
  const hardkas = await Hardkas.create({ network: "simulated", autoBootstrap: true });
  return hardkas.experimental.silver.verifyCorpus("fixtures/toccata-v2/silver");
}

console.log(JSON.stringify(await main(), null, 2));
