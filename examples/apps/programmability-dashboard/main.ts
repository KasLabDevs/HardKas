import { Hardkas } from "@hardkas/sdk";

const hardkas = await Hardkas.create({ network: "simulated", autoBootstrap: true });
const capabilities = await hardkas.programmability.capabilities();
const corpus = await hardkas.programmability.corpus.verify({
  path: "fixtures/toccata-v2"
});

console.log(
  JSON.stringify(
    {
      app: "programmability-dashboard",
      capabilities: capabilities.status,
      corpus: corpus.status,
      claims: capabilities.claims
    },
    null,
    2
  )
);
