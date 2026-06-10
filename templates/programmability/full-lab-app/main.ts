import { Hardkas } from "@hardkas/sdk";

export async function main() {
  const hardkas = await Hardkas.create({ network: "simulated", autoBootstrap: true });
  const capabilities = await hardkas.programmability.capabilities();
  const corpus = await hardkas.programmability.corpus.verify({
    path: "fixtures/toccata-v2"
  });
  const plan = hardkas.programmability.app.plan({ kind: "full-lab" });
  return { capabilities, corpus, plan };
}

console.log(JSON.stringify(await main(), null, 2));
