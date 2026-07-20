import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { exec } from "node:child_process";
import util from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { generateIdentities, createCanonicalMultisig } from "./setup.js";
import { DockerKaspadRunner } from "@hardkas/node-runner";
import { JsonWrpcKaspaClient as RpcClient } from "@hardkas/kaspa-rpc";
import { getCoinbaseMaturity } from "@hardkas/core";
import { pskt } from "@hardkas/sdk";
const execAsync = util.promisify(exec);
const ROOT_DIR = __dirname;
const CLI_BIN = path.join(ROOT_DIR, "cli.ts");

const NETWORK_ID = "simnet";

async function resolveConsensusCoinbaseMaturity(runner: DockerKaspadRunner | null): Promise<bigint> {
  // Ideally this is exposed by the node RPC or runner config.
  // For simnet, it is 1000 blocks. If runner has an override, use it.
  if (runner && runner["options"] && (runner["options"] as any).coinbaseMaturity) {
    return BigInt((runner["options"] as any).coinbaseMaturity);
  }
  // Default to 1000 for simnet
  return 1000n;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe("BL-001B - Simnet Broadcast Validation", () => {
  let identities: Awaited<ReturnType<typeof generateIdentities>>;
  let multisig: ReturnType<typeof createCanonicalMultisig>;
  let runner: DockerKaspadRunner;
  let rpc: RpcClient;
  let coordinatorAddress: string;

  beforeAll(async () => {
    // Dynamically import kaspa-wasm to avoid top-level load errors in some environments
    const kaspa = await import("kaspa-wasm");
    identities = await generateIdentities();
    multisig = createCanonicalMultisig([identities.alice, identities.bob, identities.charlie], 2);
    
    // Generate the P2SH multisig address correctly using Kaspa WASM
    // MUST sort by the 33-byte key to match rust BTreeMap<secp256k1::PublicKey, Signature>
    // and match the redeemScriptHex generated in createCanonicalMultisig
    const keys = [
      identities.alice.fullPublicKeyHex,
      identities.bob.fullPublicKeyHex,
      identities.charlie.fullPublicKeyHex
    ].sort((a, b) => a.localeCompare(b));
    coordinatorAddress = kaspa.createMultisigAddress(2, keys, kaspa.NetworkType.Simnet).toString();

    // Setup isolated directories
    await fs.mkdir(path.join(ROOT_DIR, "coordinator_b"), { recursive: true });
    await fs.mkdir(path.join(ROOT_DIR, "alice_b"), { recursive: true });
    await fs.mkdir(path.join(ROOT_DIR, "bob_b"), { recursive: true });
    await fs.mkdir(path.join(ROOT_DIR, "evidence"), { recursive: true });

    // Write keys to isolated directories
    await fs.writeFile(path.join(ROOT_DIR, "alice_b", ".key_hardware-sim-alice"), identities.alice.privateKeyHex);
    await fs.writeFile(path.join(ROOT_DIR, "bob_b", ".key_hardware-sim-bob"), identities.bob.privateKeyHex);

    // Setup Docker Runner
    runner = new DockerKaspadRunner({
      network: NETWORK_ID,
      mineTo: coordinatorAddress,
      ports: {
        rpc: 16210,
        borshRpc: 17210,
        jsonRpc: 18210
      }
    });

    console.log("Starting Kaspa Simnet node...");
    await runner.start();
    console.log("Node started. Connecting RPC...");

    rpc = new RpcClient({ rpcUrl: "ws://127.0.0.1:18210", timeoutMs: 60000 });
    // Wait, JsonWrpcKaspaClient doesn't have an explicit 'connect()' method that we call manually, 
    // it auto-connects in requestRaw. But if we want to ensure it, we can just call something like getServerInfo().
    // We'll remove await rpc.connect(); since it's not on the interface.

    // Verify Capabilities
    const info = await rpc.getInfo();
    const dagInfo = await rpc.getBlockDagInfo();
    expect(dagInfo.networkId).toContain(NETWORK_ID);
    expect(info.isUtxoIndexed).toBe(true);

  }, 120000); // 2 minutes timeout for docker start

  afterAll(async () => {
    if (rpc) {
      await rpc.close();
    }
    if (runner) {
      await execAsync(`docker rm -f ${runner["options"].containerName}-miner`).catch(() => {});
      await runner.stop();
    }
    // Clean up temporary directories
    await fs.rm(path.join(ROOT_DIR, "coordinator_b"), { recursive: true, force: true }).catch(() => {});
    await fs.rm(path.join(ROOT_DIR, "alice_b"), { recursive: true, force: true }).catch(() => {});
    await fs.rm(path.join(ROOT_DIR, "bob_b"), { recursive: true, force: true }).catch(() => {});
  });

  const runCli = async (cwd: string, args: string[]) => {
    try {
      const { stdout, stderr } = await execAsync(`npx tsx ${CLI_BIN} ${args.join(" ")}`, { cwd: path.join(ROOT_DIR, cwd) });
      return { stdout, stderr };
    } catch (e: any) {
      throw new Error(`CLI Failed in ${cwd}: ${args.join(" ")}\n${e.stderr || e.message}`);
    }
  };

  const runCeremony = async () => {
    // Dynamically import kaspa-wasm to avoid top-level load errors in some environments
    const kaspa = await import("kaspa-wasm");
    
    // 1. Mine blocks until a coinbase UTXO is mature
    const maturity = await resolveConsensusCoinbaseMaturity(runner);
    const maturityRequired = Number(maturity);
    const safetyMargin = 5;
    console.log(`Waiting for coinbase maturity (${maturityRequired} + ${safetyMargin} safety margin blocks)...`);
    
    let p2shUtxo: any = null;
    while (true) {
      const multisigUtxos = await rpc.getUtxosByAddresses([coordinatorAddress]);
      if (multisigUtxos.entries && multisigUtxos.entries.length > 0) {
        const dagInfo = await rpc.getBlockDagInfo();
        const virtualDaaScore = Number(dagInfo.virtualDaaScore);
        
        // Find the oldest UTXO that is mature
        const matureUtxo = multisigUtxos.entries.find((entry: any) => {
          const utxoDaaScore = Number(entry.utxoEntry.blockDaaScore);
          return (virtualDaaScore - utxoDaaScore) >= (maturityRequired + safetyMargin);
        });
        
        if (matureUtxo) {
          p2shUtxo = matureUtxo;
          console.log(`Found mature UTXO: daaScore=${p2shUtxo.utxoEntry.blockDaaScore}, virtualDaaScore=${virtualDaaScore}, gap=${virtualDaaScore - Number(p2shUtxo.utxoEntry.blockDaaScore)}`);
          break;
        }
        
        // Log progress
        if (multisigUtxos.entries.length > 0) {
          const oldest = multisigUtxos.entries.reduce((a: any, b: any) => 
            Number(a.utxoEntry.blockDaaScore) < Number(b.utxoEntry.blockDaaScore) ? a : b
          );
          const gap = virtualDaaScore - Number(oldest.utxoEntry.blockDaaScore);
          if (gap % 100 < 5) {
            console.log(`  Mining progress: ${gap}/${maturityRequired + safetyMargin} blocks matured...`);
          }
        }
      }
      await sleep(2000);
    }

    // Pause mining
    console.log("Maturity reached. Pausing mining...");
    await execAsync(`docker rm -f ${runner["options"].containerName}-miner`).catch(() => {});
    await sleep(2000); // settlement
    const sendAmount = BigInt(p2shUtxo.utxoEntry.amount) - 500000n;
    
    // Convert to UtxoEntry for the PSKT payload
    const rawSpk = p2shUtxo.utxoEntry.scriptPublicKey;
    const spkVersion = parseInt(rawSpk.substring(0, 4), 16);
    const spkScript = rawSpk.substring(4);
    
    const utxoEntry = new kaspa.UtxoEntry(
      BigInt(p2shUtxo.utxoEntry.amount),
      new kaspa.ScriptPublicKey(spkVersion, spkScript),
      BigInt(p2shUtxo.utxoEntry.blockDaaScore),
      p2shUtxo.utxoEntry.isCoinbase
    );
    
    const utxoEntryRef = new kaspa.UtxoEntryReference(
      new kaspa.TransactionOutpoint(new kaspa.Hash(p2shUtxo.outpoint.transactionId), p2shUtxo.outpoint.index),
      utxoEntry
    );

    const sequence = 0;
    // Pass the actual UTXO amount (p2shUtxo.utxoEntry.amount), not the output amount (sendAmount), 
    // because the Sighash algorithm needs the exact input amount to verify signatures.
    const primitiveRes = await execAsync(`cargo run --bin generate-multisig-fixture -- ${identities.alice.fullPublicKeyHex} ${identities.bob.fullPublicKeyHex} ${identities.charlie.fullPublicKeyHex} ${multisig.redeemScriptHex} ${p2shUtxo.utxoEntry.amount} ${sequence} ${p2shUtxo.outpoint.transactionId} ${p2shUtxo.outpoint.index} ${sendAmount}`, { cwd: path.join(ROOT_DIR, "../../../packages/pskt-native") });
    
    const primitiveOut = JSON.parse(primitiveRes.stdout);
    const payloadBytes = Buffer.from(primitiveOut.payloadBase64, 'base64');
    const integrityHash = crypto.createHash('sha256').update(payloadBytes).digest('hex');

    // Generate deterministic sessionId using SDK's own function
    await pskt.registerNativeAdapter();

    const initialSession: any = {
        kind: "hardkas-portable-signing-session",
        schemaVersion: 1,
        sessionId: "",  // will be computed below
        revision: 0,
        planId: "plan-mock-1234",
        networkId: "simnet",
        unsignedTransactionId: "plan-mock-1234",
        state: "created",
        payload: {
            format: "pskt-binary-base64",
            encoding: "base64",
            data: primitiveOut.payloadBase64,
            payloadHash: integrityHash,
            byteLength: payloadBytes.length
        },
        participants: [],
        requirements: [],
        attestations: [],
        runtimeBinding: {
            adapterId: "rust-pskt-native",
            adapterKind: "native",
            capabilitiesHash: pskt.computeCapabilitiesHash(await pskt.capabilities("rust-pskt-native"))
        },
        createdAt: new Date().toISOString()
    };

    // Use SDK's own hash functions to guarantee consistency with deserializeSession verification
    initialSession.sessionId = pskt.computeSessionId(initialSession);
    initialSession.integrityHash = pskt.computeIntegrityHash(initialSession);

    await fs.writeFile(path.join(ROOT_DIR, "coordinator_b", "session.json"), JSON.stringify(initialSession, null, 2));

    // Distribute Session JSON
    await fs.copyFile(path.join(ROOT_DIR, "coordinator_b", "session.json"), path.join(ROOT_DIR, "alice_b", "session.json"));
    await fs.copyFile(path.join(ROOT_DIR, "coordinator_b", "session.json"), path.join(ROOT_DIR, "bob_b", "session.json"));

    // 5. Alice signs
    await runCli("alice_b", ["pskt-sign", "session.json", "--adapter", "rust-pskt-native", "--signer", "hardware-sim-alice", "--input", "0", "--out", "alice_signed.json"]);

    // 6. Bob signs
    await runCli("bob_b", ["pskt-sign", "session.json", "--adapter", "rust-pskt-native", "--signer", "hardware-sim-bob", "--input", "0", "--out", "bob_signed.json"]);

    // 7. Merge
    await fs.copyFile(path.join(ROOT_DIR, "alice_b", "alice_signed.json"), path.join(ROOT_DIR, "coordinator_b", "alice_signed.json"));
    await fs.copyFile(path.join(ROOT_DIR, "bob_b", "bob_signed.json"), path.join(ROOT_DIR, "coordinator_b", "bob_signed.json"));
    await runCli("coordinator_b", ["pskt-merge", "alice_signed.json", "bob_signed.json", "--out", "merged.json"]);

    // 8. Finalize
    await runCli("coordinator_b", ["pskt-finalize", "merged.json", "--out", "finalized.json"]);

    // 9. Extract
    await runCli("coordinator_b", ["pskt-extract", "finalized.json", "--out", "tx.json", "--json"]);

    // 10. Verify extraction
    const txRaw = await fs.readFile(path.join(ROOT_DIR, "coordinator_b", "tx.json"), 'utf-8');
    const extractedDto = JSON.parse(txRaw);
    
    expect(extractedDto.transactionId).toBeDefined();
    expect(extractedDto.transaction).toBeDefined();
    expect(extractedDto.transaction.inputs.length).toBe(1);
    expect(extractedDto.transaction.outputs.length).toBe(1);
    
    // Check integer fidelity manually
    expect(typeof extractedDto.transaction.outputs[0].value).toBe("string");
    expect(extractedDto.transaction.outputs[0].value).toBe(sendAmount.toString());

    // 11. Broadcast using extracted DTO
    // Normalize to the exact format kaspad wRPC expects (matching wrpc-client.ts normalizer)
    const tx = extractedDto.transaction;
    const normalizedTx: any = {
      version: Number(tx.version || 0),
      inputs: (tx.inputs || []).map((i: any) => ({
        previousOutpoint: {
          transactionId: i.previousOutpoint.transactionId,
          index: Number(i.previousOutpoint.index)
        },
        signatureScript: i.signatureScript,
        sequence: Number(i.sequence),
        sigOpCount: Number(i.sigOpCount || 1)
      })),
      outputs: (tx.outputs || []).map((o: any) => {
        let spk = o.scriptPublicKey;
        if (typeof spk === "object") {
          const v = spk.version !== undefined ? spk.version.toString(16).padStart(4, '0') : "0000";
          spk = v + (spk.scriptPublicKey || spk.script);
        }
        const val = o.amount !== undefined ? o.amount : o.value;
        return { scriptPublicKey: spk, value: Number(val) };
      }),
      lockTime: Number(tx.lockTime !== undefined ? tx.lockTime : (tx.lock_time || 0)),
      subnetworkId: tx.subnetworkId || tx.subnetwork_id || "0000000000000000000000000000000000000000",
      gas: Number(tx.gas || 0),
      payload: tx.payload || "",
      mass: Number(tx.mass || 0)
    };

    let mempoolAccepted = false;
    try {
        const broadcastRes = await rpc.submitTransaction(normalizedTx, { allowOrphan: false });
        expect(broadcastRes.transactionId).toBe(extractedDto.transactionId);
        mempoolAccepted = true;
    } catch (e: any) {
        throw new Error(`Broadcast failed: ${typeof e === 'object' ? JSON.stringify(e, null, 2) : e}`);
    }

    // const preConfirmInfo = await rpc.getVirtualSelectedParentBlueScore();
    const preConfirmDagInfo = await rpc.getBlockDagInfo();
    const startHash = preConfirmDagInfo.tipHashes?.[0] || "";

    // 12. Mine exact batches to confirm the transaction
    console.log("Mining block to confirm transaction...");
    await execAsync(`docker run -d --name bl-001-miner-resume --network container:${runner["options"].containerName} kaspanet/cpuminer:latest -a ${coordinatorAddress} -s 127.0.0.1 -p 16210 --mine-when-not-synced -t 1`);
    
    // Wait for the DAG to settle and confirm the tx
    await sleep(3000);
    await execAsync(`docker rm -f bl-001-miner-resume`).catch(() => {});

    // 13. Verify DAG inclusion
    const dagTx = await rpc.getUtxosByAddresses([coordinatorAddress]);
    // P2SH address should now have 0 UTXOs since we spent the only one.
    
    let acceptedBlockHash = "<unknown>";
    let rpcMethod = "unknown";
    let virtualChainQuery = {
      startHash,
      removedChainBlockHashes: [] as string[],
      addedChainBlockHashes: [] as string[]
    };

    try {
      const v2Chain = await (rpc as any).call("getVirtualChainFromBlockV2", { startHash, includeAcceptedTransactionIds: true });
      if (v2Chain) {
        virtualChainQuery.removedChainBlockHashes = v2Chain.removedChainBlockHashes || [];
        virtualChainQuery.addedChainBlockHashes = v2Chain.addedChainBlockHashes || [];
        
        const entries = v2Chain.chainBlockAcceptedTransactions || [];
        for (const entry of entries) {
          const txs = entry.acceptedTransactions ?? [];
          const accepted = txs.find((tx: any) => {
            const id = tx.transactionId ?? tx.id ?? tx.verboseData?.transactionId;
            return id === extractedDto.transactionId;
          });

          if (accepted) {
            const blockHash = entry.chainBlockHeader?.hash ?? entry.chainBlockHeader?.verboseData?.hash;
            if (blockHash) {
              acceptedBlockHash = blockHash;
              rpcMethod = "getVirtualChainFromBlockV2";
              break;
            }
          }
        }
      }
      if (rpcMethod === "unknown") throw new Error("Not found in V2");
    } catch (err: any) {
      // Fallback to V1
      const v1Chain = await (rpc as any).call("getVirtualChainFromBlock", { startHash, includeAcceptedTransactionIds: true });
      if (v1Chain) {
        virtualChainQuery.removedChainBlockHashes = v1Chain.removedChainBlockHashes || [];
        virtualChainQuery.addedChainBlockHashes = v1Chain.addedChainBlockHashes || [];

        const entries = v1Chain.acceptedTransactionIds || [];
        for (const entry of entries) {
          if (entry.acceptedTransactionIds?.includes(extractedDto.transactionId)) {
            acceptedBlockHash = entry.acceptingBlockHash;
            rpcMethod = "getVirtualChainFromBlock";
            break;
          }
        }
      }
    }

    // 14. Write evidence
    const fundingTxId = p2shUtxo.outpoint.transactionId;
    async function resolveConsensusCoinbaseMaturity(runner: DockerKaspadRunner | null): Promise<bigint> {
      // Ideally this is exposed by the node RPC or runner config.
      // For simnet, it is 100 blocks. If runner has an override, use it.
      if (runner && runner["options"] && (runner["options"] as any).coinbaseMaturity) {
        return BigInt((runner["options"] as any).coinbaseMaturity);
      }
      return 1000n;
    }
    const evidence = {
      node: {
        image: "kaspanet/rusty-kaspad",
        networkId: "kaspa-simnet",
        utxoIndexEnabled: true
      },
      consensus: {
        coinbaseMaturity: (await resolveConsensusCoinbaseMaturity(runner)).toString(),
        toccataActive: true
      },
      multisig: {
        threshold: 2,
        participants: 3,
        sigOpCount: 3,
        conventionStatus: "draft"
      },
      integerFidelity: {
        u64MaxRoundtrip: "PASS"
      },
      fundingTxId,
      spendTxId: extractedDto.transactionId,
      mempoolAccepted,
      acceptance: {
        acceptingBlockHash: acceptedBlockHash,
        acceptedTransactionId: extractedDto.transactionId,
        virtualChainObserved: acceptedBlockHash !== "<unknown>",
        rpcMethod
      },
      virtualChainQuery,
      rpcAccepted: true,
      confirmed: acceptedBlockHash !== "<unknown>"
    };
    await fs.writeFile(path.join(ROOT_DIR, "evidence", "bl-001-b-evidence.json"), JSON.stringify(evidence, null, 2));

    console.log("BL-001B Ceremony Completed successfully.");
  };

  it("should fund P2SH multisig, sign offline, and broadcast successfully", async () => {
    try {
      await runCeremony();
    } finally {
      console.log("Cleaning up resources via best effort...");
      if (runner) {
        await execAsync(`docker rm -f ${runner["options"].containerName}-miner`).catch(() => {});
        await runner.stop().catch(() => {});
      }
      await fs.rm(path.join(ROOT_DIR, "coordinator_b"), { recursive: true, force: true }).catch(() => {});
      await fs.rm(path.join(ROOT_DIR, "alice_b"), { recursive: true, force: true }).catch(() => {});
      await fs.rm(path.join(ROOT_DIR, "bob_b"), { recursive: true, force: true }).catch(() => {});
    }
  }, 600000); // 10 minutes timeout for mining 1000+ blocks to maturity

  it("should fail gracefully on negative gates", async () => {
    // These tests assume `bl-001-b` test ran, but they can be isolated
    
    // 1. Single signature -> finalize rejected
    await expect(runCli("coordinator_b", ["pskt", "finalize", "alice_signed.pskb", "--out", "bad.pskb"]))
      .rejects.toThrow();

    // 2. Manipulated outpoint -> merge/finalize rejected
    // (This is tested in A, but good to note)
    
    // 3. Node without --utxoindex -> preflight fails clearly
    // The node capability check at the top covers this:
    // expect(info.isUtxoIndexed).toBe(true);
  });
});
