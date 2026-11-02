import path from "node:path";
import { fileURLToPath } from "node:url";
import { rootHygiene } from "./vitest-root-hygiene.js";

// REMED-CLOSE · the guard every test level runs first (canonical, silverc, silver-runner, simnet, localnet, e2e): a run
// that leaves anything in the repository root's .hardkas fails, naming what it touched (scripts/vitest-root-hygiene.ts).
const hygiene = rootHygiene(path.join(fileURLToPath(new URL("..", import.meta.url)), ".hardkas"));

export function setup(): void {
  hygiene.setup();
}

export function teardown(): void {
  hygiene.teardown();
}
