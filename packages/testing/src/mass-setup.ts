import { enableMassTracking } from "./harness.js";

if (process.env.HARDKAS_MASS_TRACKING === "1") {
  enableMassTracking();
}
