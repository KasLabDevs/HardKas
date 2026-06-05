import { UI } from "../ui.js";
import { DockerKaspadRunner } from "@hardkas/node-runner";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
import { execa } from "execa";
import { HardkasFixtureSigner } from "@hardkas/accounts";

export async function runDoctorNode(opts: { json?: boolean }) {
  if (opts.json) UI.setJsonMode(true);
  
  if (!opts.json) {
    UI.box("HardKAS Doctor", "Real Node Diagnostics (Phase 9)");
  }

  // 1. Node check
  const runner = new DockerKaspadRunner();
  const status = await runner.status();

  if (status.running) {
    UI.logHuman(`  ✅ Node: READY (${status.containerName})`);
  } else {
    UI.logHuman(`  ❌ Node: NOT RUNNING`);
    process.exit(1);
  }

  // 2. RPC check
  if (status.rpcReady) {
    UI.logHuman(`  ✅ RPC: READY (127.0.0.1:18210)`);
  } else {
    UI.logHuman(`  ❌ RPC: NOT READY`);
    process.exit(1);
  }

  // 3. Signer check
  try {
    const signer = new HardkasFixtureSigner("simnet");
    await signer.getAddress();
    UI.logHuman(`  ✅ Signer: kaspa-wasm READY`);
  } catch (err: any) {
    UI.logHuman(`  ❌ Signer: UNAVAILABLE (${err.message})`);
  }

  // 4. Mining check (CHAIN_ADVANCING)
  let client: JsonWrpcKaspaClient | null = null;
  try {
    client = new JsonWrpcKaspaClient({ rpcUrl: "ws://127.0.0.1:18210" });
    const info1 = await client.getBlockDagInfo();
    const score1 = info1.virtualDaaScore || 0n;
    
    await new Promise(r => setTimeout(r, 2000));
    
    const info2 = await client.getBlockDagInfo();
    const score2 = info2.virtualDaaScore || 0n;
    
    if (score2 > score1) {
      UI.logHuman(`  ✅ Miner: CHAIN_ADVANCING (DAA Score: ${score1} -> ${score2})`);
    } else {
      UI.logHuman(`  ❌ Miner: INACTIVE (DAA Score stalled at ${score1})`);
    }
  } catch (err: any) {
    UI.logHuman(`  ❌ Miner: UNAVAILABLE (${err.message})`);
  } finally {
    if (client) await client.close();
  }

  // 5. Fixture balance check
  try {
    const signer = new HardkasFixtureSigner("simnet");
    const address = await signer.getAddress();
    const client = new JsonWrpcKaspaClient({ rpcUrl: "ws://127.0.0.1:18210" });
    const utxos = await client.getUtxosByAddress(address);
    const balanceRes = await client.getBalanceByAddress(address);
    const balance = balanceRes?.balanceSompi || 0n;

    if (balance > 0n) {
      UI.logHuman(`  ✅ Fixture balance: > 0 (${Number(balance)/100000000} KAS, ${utxos.length} UTXOs)`);
    } else {
      UI.logHuman(`  ❌ Fixture balance: 0 KAS`);
    }
    await client.close();
  } catch (err: any) {
    UI.logHuman(`  ❌ Fixture balance: ERROR (${err.message})`);
  }
}
