import { describe, it, expect, vi } from "vitest";
import { Command } from "commander";

// PAPERCUTS-1 · `kaspa doctor`, `kaspa wallet balance` and `kaspa wallet send` defaulted --rpc-url to a literal copy of
// the canonical localnet endpoint instead of the one definition (`nodeRpcUrl()` in @hardkas/core), so a change of the
// canonical node would leave them pointing at the old one. The canonical value is replaced here by a sentinel.

vi.mock("@hardkas/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@hardkas/core")>()),
  nodeRpcUrl: () => "ws://canonical.test:4242"
}));

import { registerKaspaCommands } from "../src/commands/kaspa.js";

function rpcUrlDefault(...names: string[]): unknown {
  const p = new Command();
  registerKaspaCommands(p);
  let cmd: Command | undefined = p;
  for (const n of names) cmd = cmd?.commands.find((c) => c.name() === n);
  const opt = cmd?.options.find((o) => o.long === "--rpc-url");
  return opt?.defaultValue;
}

describe("kaspa commands · the default node endpoint is the canonical one", () => {
  it.each([[["kaspa", "doctor"]], [["kaspa", "wallet", "balance"]], [["kaspa", "wallet", "send"]]])("%j", (names) => {
    expect(rpcUrlDefault(...names)).toBe("ws://canonical.test:4242");
  });
});
