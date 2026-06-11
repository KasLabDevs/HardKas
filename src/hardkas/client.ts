import { createHardkasClient } from "@hardkas/sdk";

// Local development facade targeting the HardKAS Dev Server
export const client = createHardkasClient({
  baseUrl: "http://localhost:7420",
  network: "simulated"
});
