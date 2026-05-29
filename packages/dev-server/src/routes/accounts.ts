import { Hono } from "hono";
import { loadHardkasConfig } from "@hardkas/config";
import { listHardkasAccounts } from "@hardkas/accounts";
import { formatSompi } from "@hardkas/core";

export const accountsRoutes = new Hono();

accountsRoutes.get("/", async (c) => {
  const { config } = await loadHardkasConfig();

  try {
    const rawAccounts = listHardkasAccounts(config);

    const { loadLocalnetState } = await import("@hardkas/localnet");
    const path = await import("path");
    const fs = await import("fs");
    let localState = null;
    let warning: string | undefined;

    try {
      const rootDir = process.env.HARDKAS_ROOT || process.cwd();
      const statePath = path.join(rootDir, ".hardkas", "localnet.json");
      if (fs.existsSync(statePath)) {
        localState = await loadLocalnetState(statePath);
      }
    } catch (e: any) {
      // P3: Dev-server strictness. If state file exists but fails to load (corrupted/locked),
      // we must not fallback or invent state.
      throw new Error(
        `Failed to read authoritative state from localnet.json: ${e.message}`
      );
    }

    if (!localState) {
      warning =
        "Localnet state not found. Run 'hardkas accounts fund <alias> --amount 1000' or execute a transaction to initialize it.";
    }

    const result = rawAccounts.map((acc) => {
      let balanceSompiStr = "0";

      if (acc.kind === "simulated" && localState?.utxos) {
        // Derive simulated balance by summing unspent UTXOs for this address
        const unspentUtxos = localState.utxos.filter(
          (u: any) => u.address === acc.address && !u.spent
        );
        const sumSompi = unspentUtxos.reduce(
          (sum: bigint, u: any) => sum + BigInt(u.amountSompi || 0),
          0n
        );
        balanceSompiStr = sumSompi.toString();
      }

      const balanceKasStr = formatSompi(BigInt(balanceSompiStr)).replace(" KAS", "");

      return {
        alias: acc.name,
        name: acc.name,
        address: acc.address,
        balanceSompi: balanceSompiStr,
        balanceKas: balanceKasStr,
        type: acc.kind,
        network: "simulated",
        state: localState ? "initialized" : "uninitialized",
        privateKeyEnv: "privateKeyEnv" in acc ? (acc as any).privateKeyEnv : undefined,
        walletId: "walletId" in acc ? (acc as any).walletId : undefined
      };
    });

    const response: any = {
      accounts: result,
      provenance: {
        authority: "filesystem state read",
        derivedFrom: "localnet.json",
        originalPath: ".hardkas/localnet.json",
        integrity: localState ? "verified" : "unknown",
        replayScope: "local-only",
        consensusValidated: false
      }
    };
    if (warning) {
      response.warning = warning;
    }

    return c.json(response);
  } catch (e: any) {
    console.error("Failed to list accounts:", e);
    return c.json({ error: e.message }, 500);
  }
});
