import { Hardkas } from "@hardkas/sdk";

export async function main() {
  const hardkas = await Hardkas.create({ network: "simulated", autoBootstrap: true });
  return hardkas.zk.corpus.verify("fixtures/toccata-v2/zk");
}

console.log(JSON.stringify(await main(), null, 2));
