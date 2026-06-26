import { defineHardkasConfig } from "@hardkas/sdk";

export default defineHardkasConfig({
  project: "09-security-boundary-lab",
  network: {
    default: "mainnet", // This should be blocked if allowPublic is false or if not configured properly
    allowPublic: false
  },
  networks: {
    mainnet: {
      kind: "public"
    }
  }
});
