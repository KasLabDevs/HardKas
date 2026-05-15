// SAFETY_LEVEL: SIMULATION_ONLY
//
// Auto-registers HardKAS matchers with vitest.
// Import this file in vitest.config.ts or at the top of test files:
//   import "@hardkas/testing/setup";

import { expect } from "vitest";
import { hardKasMatchers } from "./matchers.js";

expect.extend(hardKasMatchers);
