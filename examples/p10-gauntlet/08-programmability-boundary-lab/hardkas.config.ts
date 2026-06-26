import { defineHardkasConfig } from "@hardkas/sdk";

export default defineHardkasConfig({
  project: "08-programmability-boundary-lab",
  network: {
    default: "simulated",
    allowPublic: false
  },
  networks: {
    simulated: {
      kind: "simulated"
    }
  }
});
