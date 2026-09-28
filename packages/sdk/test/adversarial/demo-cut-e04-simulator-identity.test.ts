import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Hardkas } from "../../src/index.js";
import {
  loadOrCreateLocalnetState,
  getAddressBalanceSompi,
  getAccountBalanceSompi,
  resolveAccountAddressFromState,
  fundAddress
} from "@hardkas/localnet";

// Demo-cut step 2 · E04 — ONE identity per simulator account.
//   The account layer names a simulator account `kaspa:sim_<name>`; the simulator
//   state records it under the address it was seeded with. Inputs were resolved
//   through the state's account (alias → state address) but outputs and change were
//   written with the plan's literal alias, so after `alice → bob 25` the state held
//   bob's 25 KAS under `kaspa:sim_bob` and every read by name missed it
//   (alice 0 KAS, bob 1000 KAS). The state now normalises every spelling of an
//   account — its name, `kaspa:sim_<name>`, the recorded address — to ONE address,
//   on writes (outputs, change, faucet) exactly as on reads.

const KAS = 100_000_000n;

describe("Demo-cut · E04 · the simulator keeps one identity per account", () => {
  let ws: string;
  let sdk: Hardkas;

  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-dc-e04-"));
    sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
  });

  afterEach(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  const state = () => loadOrCreateLocalnetState({ cwd: ws });
  const spellings = async (name: string) => {
    const s = await state();
    return [name, `kaspa:sim_${name}`, resolveAccountAddressFromState(s, name)];
  };
  const balances = async (name: string) => {
    const s = await state();
    return (await spellings(name)).map((id) => getAddressBalanceSompi(s, id));
  };

  it("every spelling of an account resolves to the address the state records for it", async () => {
    const s = await state();
    const bob = s.accounts!.find((a) => a.name === "bob")!;
    expect(resolveAccountAddressFromState(s, "bob")).toBe(bob.address);
    expect(resolveAccountAddressFromState(s, "kaspa:sim_bob")).toBe(bob.address);
    expect(resolveAccountAddressFromState(s, bob.address)).toBe(bob.address);
    // Unknown identities stay what they are (an external recipient is not an account).
    expect(resolveAccountAddressFromState(s, "kaspa:sim_nobody")).toBe("kaspa:sim_nobody");
    expect(resolveAccountAddressFromState(s, "stranger")).toBe("stranger");
  });

  it("plan → sign → simulate alice → bob 25 KAS: every spelling of both accounts sees the same, correct balance", async () => {
    const aliceBefore = await balances("alice");
    const bobBefore = await balances("bob");
    expect(new Set(aliceBefore).size).toBe(1);
    expect(new Set(bobBefore).size).toBe(1);

    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "25" });
    expect(plan.to.address).toBe("kaspa:sim_bob"); // the plan stays in the account namespace
    const signed = await sdk.tx.sign(plan, "alice");
    const { receipt } = await sdk.tx.simulate(signed);
    const fee = BigInt((receipt as any).feeSompi);

    const aliceAfter = await balances("alice");
    const bobAfter = await balances("bob");
    expect(new Set(aliceAfter).size).toBe(1);
    expect(new Set(bobAfter).size).toBe(1);
    expect(bobAfter[0]! - bobBefore[0]!).toBe(25n * KAS);
    expect(aliceBefore[0]! - aliceAfter[0]!).toBe(25n * KAS + fee);

    // Nothing was written under the alias: the state holds one address per account.
    const s = await state();
    expect(s.utxos.filter((u) => u.address.startsWith("kaspa:sim_alice") || u.address.startsWith("kaspa:sim_bob"))).toEqual([]);
  });

  it("the SDK balance API agrees for the name and the synthetic identity after a send", async () => {
    const before = await sdk.accounts.balance("kaspa:sim_bob");
    const plan = await sdk.tx.plan({ from: "alice", to: "kaspa:sim_bob", amount: "10" });
    await sdk.tx.simulate(await sdk.tx.sign(plan, "alice"));
    const afterAlias = await sdk.accounts.balance("kaspa:sim_bob");
    const afterName = await sdk.accounts.balance("bob");
    expect(afterAlias.sompi - before.sompi).toBe(10n * KAS);
    expect(afterName.sompi).toBe(afterAlias.sompi);
  });

  it("a second send spends the change of the first (the change landed on the sender's one identity)", async () => {
    const p1 = await sdk.tx.plan({ from: "alice", to: "bob", amount: "990" });
    await sdk.tx.simulate(await sdk.tx.sign(p1, "alice"));
    // alice now holds only the change of p1: spending it again must find it.
    const p2 = await sdk.tx.plan({ from: "alice", to: "carol", amount: "5" });
    const { receipt } = await sdk.tx.simulate(await sdk.tx.sign(p2, "alice"));
    expect(receipt.txId).toBe(`synthetic-${p2.contentHash}`);
  });

  it("the faucet funds the account's one identity whatever spelling it is given", async () => {
    const s = await state();
    const before = getAccountBalanceSompi(s, "dave");
    const next = fundAddress(s, { address: "kaspa:sim_dave", amountSompi: 7n * KAS });
    expect(getAccountBalanceSompi(next, "dave") - before).toBe(7n * KAS);
    expect(next.utxos.some((u) => u.address === "kaspa:sim_dave")).toBe(false);
  });

  it("a receipt produced after the fix replays: re-execution writes to the same identity", async () => {
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "3" });
    const { receipt } = await sdk.tx.simulate(await sdk.tx.sign(plan, "alice"));
    const result: any = await sdk.replay.verify((receipt as any).contentHash);
    expect(result.passed, JSON.stringify(result.report?.errors ?? result.error)).toBe(true);
  });
});
