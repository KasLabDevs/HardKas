import { defineHardkasConfig } from "@hardkas/config";

export default defineHardkasConfig({
  execution: {
    default: "simulator",
    targets: {
      simulator: { mode: "simulator", domain: "kaspa-l1", network: "simulated" }
    }
  }
});
