import { Hardkas } from "@hardkas/sdk";

const hardkas = await Hardkas.create({ network: "simulated", autoBootstrap: true });
const plan = hardkas.programmability.app.plan({ kind: "full-lab" });

console.log(JSON.stringify({
  app: "ai-programmability-agent",
  plan: plan.status,
  sdkSurfaces: plan.sdkSurfaces,
  nonClaims: plan.nonClaims
}, null, 2));
