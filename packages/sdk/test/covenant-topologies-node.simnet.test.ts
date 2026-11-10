import { vi } from "vitest";
import { KASPAD_REFERENCE_IMAGE } from "@hardkas/core";
import { fundTestAccount, mineBlocks, startIsolatedSimnet, stopIsolatedSimnet, waitForUtxo } from "../../testing/src/index.js";
import { defineCovenantTopologyScenarios } from "./helpers/covenant-topologies-scenarios.js";

vi.setConfig({ testTimeout: 600_000, hookTimeout: 900_000 });

// -----------------------------------------------------------------------------
// INT9-C1 · covenant topologies other than 1:1 against a real rusty-kaspad v2.1.0 (simnet level). Until now only 1:1
// auth-bound transitions had node evidence; 1:N, N:M and termination passed the engine's own checks (F1.4) only.
//
// The scenarios (C1 1:N, C2 N:M, C3 termination, C4 KCC-20 N:M signed) are helpers/covenant-topologies-scenarios.ts, shared
// with the devnet run (covenant-topologies-node-devnet.simnet.test.ts); this file gives them the harness's simnet node:
// the funder is the miner fixture "alice", a transaction is confirmed by mining one block at a time over wRPC.
//
// Evidence: a JSON written to HARDKAS_TEST_COVENANT_TOPOLOGIES_EVIDENCE (or the OS temp directory) with the node, its
// image, every txid and every verdict. Needs Docker (the harness's own kaspad), HARDKAS_HOME with silverc and kaspa-wasm,
// and the built CLI (packages/cli/dist) for `silver compile`.
// -----------------------------------------------------------------------------

defineCovenantTopologyScenarios({
  networkId: "simnet",
  titleSuffix: "",
  evidenceEnv: "HARDKAS_TEST_COVENANT_TOPOLOGIES_EVIDENCE",
  evidenceFilePrefix: "covenant-topologies-node",
  async start() {
    const session = await startIsolatedSimnet({ minerFixture: "alice" });
    return {
      rpc: session.rpc,
      rpcUrl: session.rpcUrl,
      containerName: session.containerName,
      image: process.env.HARDKAS_KASPAD_IMAGE ?? KASPAD_REFERENCE_IMAGE,
      funderAddress: session.minerAddress,
      funderPrivateKey: session.minerPrivateKey,
      async fund() {
        await fundTestAccount(session, session.minerAddress, 1_000_000_000n);
        await mineBlocks(session, 20);
      },
      /** Mines until `outpoint` is listed at `address` (the transaction was accepted into a block and indexed). */
      async confirm(address, outpoint) {
        for (let round = 0; round < 6; round++) {
          await mineBlocks(session, 1);
          try {
            return await waitForUtxo(session, address, outpoint, 5_000);
          } catch {
            /* not yet in a block */
          }
        }
        throw new Error(`NOT_CONFIRMED: ${outpoint.transactionId}:${outpoint.index} at ${address}`);
      },
      stop: () => stopIsolatedSimnet(session)
    };
  }
});
