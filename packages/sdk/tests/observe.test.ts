import { test, expect, beforeAll, afterAll } from "vitest";
import { Hardkas } from "../src/index.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-observe-"));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("address() localnet -> mempool empty / utxo snapshot valid", async () => {
  const hk = await Hardkas.create({
    network: "simulated",
    autoBootstrap: true,
    cwd: tmpDir
  });

  const address = (await hk.accounts.resolve("alice")).address;
  const snapshot = await hk.observe.address({ address, target: "simulated" });
  
  expect(snapshot.address).toBe(address);
  expect(snapshot.mempool.incoming.length).toBe(0);
  expect(snapshot.utxos.length).toBeGreaterThan(0); // Alice has genesis UTXOs in simulator
  expect(snapshot.execution.mode).toBe("simulator");
}, 20000);

test("send payment -> watchAddress emits change", async () => {
  const hk = await Hardkas.create({
    network: "simulated",
    autoBootstrap: true,
    cwd: tmpDir
  });

  const toAccount = await hk.accounts.resolve("bob");
  const address = toAccount.address;

  // We don't await this immediately, we start it
  const watchIter = hk.observe.watchAddress({
    address,
    target: "simulated",
    pollIntervalMs: 200,
    artifactPolicy: "changes"
  });

  const plan = await hk.tx.plan({
    from: "alice",
    to: "bob",
    amount: 10,
    network: "simulated"
  });
  const signed = await hk.tx.sign(plan, "alice");
  
  // Wait for the first state (empty)
  const firstState = await watchIter.next();
  expect(firstState.value?.totals.acceptedUtxoSompi).toBe(0n);

  // Send
  await hk.tx.send(signed);

  // Wait for the second state (changed)
  const secondState = await watchIter.next();
  expect(secondState.value?.totals.acceptedUtxoSompi).toBe(1000000000n); // 10 KAS

  watchIter.return?.();
}, 20000);

test("same state next poll -> no duplicate artifact", async () => {
  const hk = await Hardkas.create({
    network: "simulated",
    autoBootstrap: true,
    cwd: tmpDir
  });

  const toAccount = await hk.accounts.resolve("charlie");
  const address = toAccount.address;

  let yields = 0;
  
  const ac = new AbortController();
  
  const watchLoop = async () => {
    for await (const state of hk.observe.watchAddress({
      address,
      target: "simulated",
      pollIntervalMs: 50,
      artifactPolicy: "changes",
      signal: ac.signal
    })) {
      yields++;
    }
  };

  const p = watchLoop();
  
  await new Promise(resolve => setTimeout(resolve, 300));
  ac.abort();
  try { await p; } catch (e) {}

  // Since policy is "changes", it should only yield the first initial state, and then block until change (which never happens) or abort
  expect(yields).toBe(1);
}, 20000);

test("abort signal -> iterator closes cleanly", async () => {
  const hk = await Hardkas.create({
    network: "simulated",
    autoBootstrap: true,
    cwd: tmpDir
  });

  const address = (await hk.accounts.resolve("alice")).address;
  const ac = new AbortController();
  
  const iter = hk.observe.watchAddress({ address, target: "simulated", signal: ac.signal });
  
  const p1 = iter.next();
  ac.abort();
  const res = await p1;
  expect(res.done).toBe(true);
});

test("timeout -> typed OBSERVATION_TIMEOUT", async () => {
  const hk = await Hardkas.create({
    network: "simulated",
    autoBootstrap: true,
    cwd: tmpDir
  });

  const address = (await hk.accounts.resolve("alice")).address;

  await expect(hk.observe.waitForAddress({
    address,
    target: "simulated",
    timeoutMs: 100,
    predicate: (s) => s.totals.mempoolIncomingSompi > 0n // Will never happen
  })).rejects.toThrowError(/Timeout/);
});

test("synthetic address + localnet target -> Execution Contract mismatch", async () => {
  const hk = await Hardkas.create({
    network: "simulated",
    autoBootstrap: true,
    cwd: tmpDir
  });

  const address = "kaspa:synthetic_123456789";

  try {
     await hk.observe.address({ address, target: "simnet" });
     expect.fail("Should have thrown");
  } catch (e: any) {
     expect(e.code).toBe("EXECUTION_CONTRACT_MISMATCH");
  }
});

test("unknown target -> explicit error", async () => {
  const hk = await Hardkas.create({
    network: "simulated",
    autoBootstrap: true,
    cwd: tmpDir
  });

  try {
     await hk.observe.address({ address: "kaspa:qrsxyz", target: "foobar" });
     expect.fail("Should have thrown");
  } catch (e: any) {
     expect(e.code).toBe("OBSERVATION_UNKNOWN_TARGET");
  }
});
