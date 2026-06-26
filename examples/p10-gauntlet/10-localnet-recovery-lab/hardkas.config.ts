import { defineHardkasConfig } from "@hardkas/sdk";

export default defineHardkasConfig({
  project: "10-localnet-recovery-lab",
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
