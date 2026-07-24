import { Hono } from "hono";
import { createEscrow, EscrowConfig, EscrowState, EscrowArtifact } from "@hardkas/escrow";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import crypto from "node:crypto";
import util from "node:util";
import { exec } from "node:child_process";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";

const execAsync = util.promisify(exec);

export type EscrowDomainState =
  | "CREATED"
  | "FUNDED"
  | "PARTIALLY_SIGNED"
  | "READY_TO_RELEASE"
  | "RELEASED";

type ResolutionBranch = "mutualRelease" | "refundBuyer" | "releaseToSeller";

const resolutionPolicy = {
  mutualRelease: { requiredSigners: ["buyer", "seller"], recipient: "buyer", amountKey: "refundAmount" },
  refundBuyer: { requiredSigners: ["buyer", "arbiter"], recipient: "buyer", amountKey: "refundAmount" },
  releaseToSeller: { requiredSigners: ["seller", "arbiter"], recipient: "seller", amountKey: "releaseAmount" }
};

export interface EscrowRecord {
  id: string;
  config: EscrowConfig;
  state: EscrowDomainState;
  artifact: EscrowArtifact;
  p2shState: EscrowState;

  funding: {
    status: "none" | "broadcast" | "confirmed" | "failed" | "verification_timeout";
    transactionId?: string;
    outputIndex?: number;
    amountSompi?: string;
    utxoEntry?: any;
  };

  preparedRelease?: {
    branch: string;
    unsignedTransaction: any;
    signingPayload: string;
    expectedOutputsHash: string;
    policyHash: string;
  };

  signatures: {
    buyer?: string;
    seller?: string;
    arbiter?: string;
  };

  release?: {
    transactionId: string;
    fundingOutpoint: string;
    expectedOutputsHash: string;
    actualOutputsHash: string;
    feeSompi: string;
    status: "broadcast" | "confirmed" | "failed" | "verification_timeout";
  };
}

const memoryStore = new Map<string, EscrowRecord>();

export const escrowRoutes = new Hono();

async function calcSignature(req: any) {
    const rootDir = process.cwd();
    const rustToolDir = path.join(rootDir, "examples", "builder-labs", "bl-002-escrow-multisig", "tools", "calc-signature");
    const tmpFile = path.join(rustToolDir, `req-${Date.now()}.json`);
    await fs.writeFile(tmpFile, JSON.stringify(req));

    try {
        const cmd = `cargo run --release --manifest-path ${path.join(rustToolDir, "Cargo.toml")} -- "${tmpFile}"`;
        const { stdout } = await execAsync(cmd);
        const jsonLine = stdout.split('\n').filter(l => l.trim().startsWith('{')).pop();
        if (!jsonLine) throw new Error("Could not parse calc-signature output");
        const res = JSON.parse(jsonLine);
        return res.signature_hex;
    } finally {
        await fs.unlink(tmpFile).catch(() => {});
    }
}

async function buildUnlock(artifactPath: string, entrypoint: string, args: string[]) {
    const rootDir = process.cwd();
    const rustToolDir = path.join(rootDir, "examples", "builder-labs", "bl-002-escrow-multisig", "tools", "silver-bridge");
    const cmd = `cargo run --release --manifest-path ${path.join(rustToolDir, "Cargo.toml")} -- ${artifactPath} ${entrypoint} ${args.join(" ")}`;

    try {
        const { stdout } = await execAsync(cmd, { env: { ...process.env, RUSTFLAGS: "-C link-arg=/FORCE:MULTIPLE" } });
        const jsonLine = stdout.split('\n').filter(l => l.trim().startsWith('{')).pop();
        if (!jsonLine) throw new Error("Failed to parse silver-bridge output");
        const parsed = JSON.parse(jsonLine);
        if (parsed.error) throw new Error(`SilverBridge Error: ${parsed.error}`);
        return parsed.unlocking_script_hex;
    } catch (e: any) {
        if (e.stdout) {
             const jsonLine = e.stdout.split('\n').filter((l: string) => l.trim().startsWith('{')).pop();
             if (jsonLine) {
                 const parsed = JSON.parse(jsonLine);
                 if (parsed.error) throw new Error(`SilverBridge Error: ${parsed.error}`);
             }
        }
        throw new Error(`Failed to execute silver-bridge: ${e.message}`);
    }
}

escrowRoutes.post("/", async (c) => {
  try {
    const config: EscrowConfig = await c.req.json();
    const workDir = path.join(os.tmpdir(), `hardkas-escrow-${crypto.randomBytes(4).toString("hex")}`);
    await fs.mkdir(workDir, { recursive: true });

    const rootDir = process.cwd();
    const silvercPath = path.join(rootDir, ".hardkas", "bin", "silverc.exe");
    const escrowSilPath = path.join(rootDir, "examples", "builder-labs", "bl-002-escrow-multisig", "escrow.sil");

    const result = await createEscrow(config, silvercPath, workDir, escrowSilPath);
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});

    const id = crypto.randomUUID();
    memoryStore.set(id, {
      id,
      config,
      state: "CREATED",
      artifact: result.artifact,
      p2shState: result.state,
      funding: { status: "none" },
      signatures: {}
    });

    return c.json({ ok: true, data: { id, p2shAddress: result.state.lockingScriptHex, status: "CREATED" } });
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500);
  }
});

escrowRoutes.get("/:id", (c) => {
  const id = c.req.param("id");
  const record = memoryStore.get(id);
  if (!record) return c.json({ ok: false, error: "Not found" }, 404);
  return c.json({ ok: true, data: { ...record, artifact: undefined } });
});

escrowRoutes.post("/:id/fund", async (c) => {
  try {
    const id = c.req.param("id");
    const record = memoryStore.get(id);
    if (!record) return c.json({ ok: false, error: "Not found" }, 404);

    const kaspa = await import("kaspa-wasm");
    const rpc = new JsonWrpcKaspaClient({ rpcUrl: "ws://127.0.0.1:18210" });
    const { listDevAccountsSync } = await import("@hardkas/accounts");
    const accounts = listDevAccountsSync(process.cwd());
    const buyerAccount = accounts.find((a: any) => a.publicKey === record.config.buyer.publicKeyHex) || accounts[0];

    if (!buyerAccount) throw new Error("No dev accounts found to fund the escrow");

    const totalAmount = BigInt(record.config.refundAmount) + BigInt(record.config.releaseAmount);

    const utxosRes = await rpc.getUtxosByAddresses([buyerAccount.address]);
    if (!utxosRes.entries || utxosRes.entries.length === 0) {
       throw new Error("Buyer account has no UTXOs.");
    }

    let balance = 0n;
    const selected = [];
    for (const entry of utxosRes.entries) {
      selected.push(entry);
      balance += BigInt(entry.utxoEntry.amount);
      if (balance >= totalAmount + 50000n) break;
    }

    if (balance < totalAmount + 50000n) throw new Error(`Insufficient funds.`);

    const tx = new kaspa.Transaction({
      version: 0,
      inputs: selected.map(u => ({
        previousOutpoint: { transactionId: u.outpoint.transactionId, index: u.outpoint.index },
        signatureScript: "",
        sequence: 0,
        sigOpCount: 1
      })),
      outputs: [
        {
          amount: totalAmount,
          scriptPublicKey: { version: 0, scriptPublicKey: record.p2shState.lockingScriptHex }
        }
      ],
      lockTime: 0n,
      subnetworkId: "0000000000000000000000000000000000000000",
      gas: 0n,
      payload: ""
    });

    if (balance > totalAmount + 50000n) {
      const addr = new kaspa.Address(buyerAccount.address);
      const script = kaspa.payToAddrScript(addr);
      tx.outputs.push({
        amount: balance - totalAmount - 50000n,
        scriptPublicKey: { version: 0, scriptPublicKey: script.toHex() }
      });
    }

    const signable = kaspa.SignableTransaction.fromTransaction(tx, selected.map(u => new kaspa.UtxoEntry({
        amount: u.utxoEntry.amount,
        scriptPublicKey: { version: 0, scriptPublicKey: u.utxoEntry.scriptPublicKey.scriptPublicKey },
        blockDaaScore: u.utxoEntry.blockDaaScore,
        isCoinbase: u.utxoEntry.isCoinbase
    })));

    const privKey = new kaspa.PrivateKey(buyerAccount.privateKey);
    const signedTx = signable.sign([privKey]);
    const submitRes = await rpc.submitTransaction(signedTx.toRpcTransaction(), { allowOrphan: false });

    record.funding.status = "broadcast";
    record.funding.transactionId = submitRes.transactionId;
    memoryStore.set(id, record);

    const startTime = Date.now();
    let utxoConfirmed = false;

    const p2shAddrObj = kaspa.Address.fromScriptPublicKey({ version: 0, scriptPublicKey: record.p2shState.lockingScriptHex }, kaspa.NetworkType.Simnet);
    const p2shAddrStr = p2shAddrObj.toString();

    while (Date.now() - startTime < 30000) {
      const checkRes = await rpc.getUtxosByAddresses([p2shAddrStr]);
      if (checkRes.entries && checkRes.entries.length > 0) {
        const found = checkRes.entries.find((e: any) => e.outpoint.transactionId === submitRes.transactionId);
        if (found) {
          record.funding.status = "confirmed";
          record.funding.outputIndex = found.outpoint.index;
          record.funding.amountSompi = found.utxoEntry.amount.toString();
          record.funding.utxoEntry = found.utxoEntry;
          record.state = "FUNDED";
          utxoConfirmed = true;
          break;
        }
      }
      await new Promise(r => setTimeout(r, 2000));
    }

    if (!utxoConfirmed) {
      record.funding.status = "verification_timeout";
    }

    memoryStore.set(id, record);
    await rpc.close();

    return c.json({ ok: true, data: { txId: submitRes.transactionId, status: record.funding.status } });
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500);
  }
});

escrowRoutes.post("/:id/reconcile", async (c) => {
  try {
    const id = c.req.param("id");
    const record = memoryStore.get(id);
    if (!record) return c.json({ ok: false, error: "Not found" }, 404);

    const rpc = new JsonWrpcKaspaClient({ rpcUrl: "ws://127.0.0.1:18210" });

    // Check funding reconciliation
    if (record.funding.status === "verification_timeout" && record.funding.transactionId) {
       const kaspa = await import("kaspa-wasm");
       const p2shAddrObj = kaspa.Address.fromScriptPublicKey({ version: 0, scriptPublicKey: record.p2shState.lockingScriptHex }, kaspa.NetworkType.Simnet);
       const p2shAddrStr = p2shAddrObj.toString();
       const checkRes = await rpc.getUtxosByAddresses([p2shAddrStr]);
       const found = checkRes.entries?.find((e: any) => e.outpoint.transactionId === record.funding.transactionId);
       if (found) {
          record.funding.status = "confirmed";
          record.funding.outputIndex = found.outpoint.index;
          record.funding.amountSompi = found.utxoEntry.amount.toString();
          record.funding.utxoEntry = found.utxoEntry;
          record.state = "FUNDED";
       }
    }

    // Check release reconciliation
    if (record.release && record.release.status === "verification_timeout") {
       try {
           const txData = await rpc.getTransactionByHash(record.release.transactionId);
           if (txData && txData.transaction) {
               record.release.status = "confirmed";
               record.state = "RELEASED";
           }
       } catch (e: any) {
           // not found yet
       }
    }

    memoryStore.set(id, record);
    await rpc.close();

    return c.json({ ok: true, data: record });
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500);
  }
});

escrowRoutes.post("/:id/release/prepare", async (c) => {
  try {
    const id = c.req.param("id");
    const { branch } = await c.req.json() as { branch: ResolutionBranch };
    const record = memoryStore.get(id);
    if (!record || record.state !== "FUNDED") return c.json({ ok: false, error: "Not funded" }, 400);

    const policy = resolutionPolicy[branch];
    if (!policy) return c.json({ ok: false, error: "Invalid branch" }, 400);

    const targetSpk = policy.recipient === "buyer" ? record.config.buyerDestinationSpk : record.config.sellerDestinationSpk;
    const amountStr = policy.amountKey === "refundAmount" ? record.config.refundAmount : record.config.releaseAmount;

    const tx = {
        version: 0,
        inputs: [{
            previousOutpoint: { transactionId: record.funding.transactionId!, index: record.funding.outputIndex! },
            signatureScript: "",
            sequence: 0,
            sigOpCount: policy.requiredSigners.length
        }],
        outputs: [{
            amount: Number(amountStr),
            scriptPublicKey: { version: 0, scriptPublicKey: targetSpk }
        }],
        lockTime: 0,
        subnetworkId: "0000000000000000000000000000000000000000",
        gas: 0,
        payload: ""
    };

    const expectedOutputsHash = crypto.createHash("sha256").update(JSON.stringify(tx.outputs)).digest("hex");
    const policyHash = crypto.createHash("sha256").update(JSON.stringify(policy)).digest("hex");
    const signingPayload = crypto.createHash("sha256").update(JSON.stringify(tx)).digest("hex").slice(0, 16);

    record.preparedRelease = {
      branch,
      unsignedTransaction: tx,
      signingPayload,
      expectedOutputsHash,
      policyHash
    };
    record.state = "PARTIALLY_SIGNED";
    record.signatures = {};

    memoryStore.set(id, record);

    return c.json({ ok: true, data: record.preparedRelease });
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500);
  }
});

escrowRoutes.post("/:id/sign", async (c) => {
  try {
    const id = c.req.param("id");
    const { role } = await c.req.json();

    const record = memoryStore.get(id);
    if (!record || !record.preparedRelease) return c.json({ ok: false, error: "Not prepared" }, 400);

    const policy = resolutionPolicy[record.preparedRelease.branch as ResolutionBranch];
    if (!policy.requiredSigners.includes(role)) {
       return c.json({ ok: false, error: `Role ${role} is not required for branch ${record.preparedRelease.branch}` }, 400);
    }

    const { listDevAccountsSync } = await import("@hardkas/accounts");
    const accounts = listDevAccountsSync(process.cwd());
    const pkHex = (record.config as any)[role].publicKeyHex;
    const account = accounts.find((a: any) => a.publicKey === pkHex);

    if (!account) throw new Error(`Dev account for ${role} not found`);

    const req = {
        privateKeyHex: account.privateKey,
        utxo: {
            amount: Number(record.funding.utxoEntry.amount),
            scriptPublicKeyHex: record.funding.utxoEntry.scriptPublicKey.scriptPublicKey,
            blockDaaScore: Number(record.funding.utxoEntry.blockDaaScore),
            isCoinbase: record.funding.utxoEntry.isCoinbase
        },
        tx: {
            version: record.preparedRelease.unsignedTransaction.version,
            inputs: record.preparedRelease.unsignedTransaction.inputs.map((i: any) => ({
                txid: i.previousOutpoint.transactionId,
                index: i.previousOutpoint.index,
                sequence: i.sequence,
                sigOpCount: i.sigOpCount
            })),
            outputs: record.preparedRelease.unsignedTransaction.outputs.map((o: any) => ({
                amount: o.amount,
                scriptPublicKeyHex: o.scriptPublicKey.scriptPublicKey
            })),
            lockTime: record.preparedRelease.unsignedTransaction.lockTime,
            subnetworkId: record.preparedRelease.unsignedTransaction.subnetworkId,
            gas: record.preparedRelease.unsignedTransaction.gas,
            payload: record.preparedRelease.unsignedTransaction.payload
        },
        inputIndex: 0
    };

    const sigHex = await calcSignature(req);

    (record.signatures as any)[role] = sigHex;

    const allSigned = policy.requiredSigners.every(r => !!(record.signatures as any)[r]);
    if (allSigned) {
       record.state = "READY_TO_RELEASE";
    }

    memoryStore.set(id, record);

    return c.json({ ok: true });
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500);
  }
});

escrowRoutes.post("/:id/release", async (c) => {
  try {
    const id = c.req.param("id");
    const record = memoryStore.get(id);
    if (!record || record.state !== "READY_TO_RELEASE") return c.json({ ok: false, error: "Not ready" }, 400);

    const policy = resolutionPolicy[record.preparedRelease!.branch as ResolutionBranch];
    const currentPolicyHash = crypto.createHash("sha256").update(JSON.stringify(policy)).digest("hex");
    if (currentPolicyHash !== record.preparedRelease!.policyHash) {
       return c.json({ ok: false, error: "Policy hash mismatch. The node configuration changed since preparation." }, 400);
    }

    const workDir = path.join(os.tmpdir(), `hardkas-escrow-${crypto.randomBytes(4).toString("hex")}`);
    await fs.mkdir(workDir, { recursive: true });
    const artifactPath = path.join(workDir, "escrow.json");
    await fs.writeFile(artifactPath, JSON.stringify(record.artifact));

    const unlockArgs = policy.requiredSigners.map(r => (record.signatures as any)[r]!);
    const unlockHex = await buildUnlock(
      artifactPath,
      record.preparedRelease!.branch,
      unlockArgs
    );

    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});

    const scriptBytes = Buffer.from(record.p2shState.redeemScriptHex, "hex");
    let prefix = "";
    if (scriptBytes.length < 76) {
        prefix = scriptBytes.length.toString(16).padStart(2, '0');
    } else if (scriptBytes.length <= 255) {
        prefix = "4c" + scriptBytes.length.toString(16).padStart(2, '0');
    } else {
        const buf = Buffer.alloc(2);
        buf.writeUInt16LE(scriptBytes.length, 0);
        prefix = "4d" + buf.toString("hex");
    }
    const redeemScriptPushData = prefix + record.p2shState.redeemScriptHex;

    const tx = record.preparedRelease!.unsignedTransaction;
    tx.inputs[0].signatureScript = unlockHex + redeemScriptPushData;

    const rpc = new JsonWrpcKaspaClient({ rpcUrl: "ws://127.0.0.1:18210" });
    const submitRes = await rpc.submitTransaction(tx, { allowOrphan: false });

    const actualOutputsHash = crypto.createHash("sha256").update(JSON.stringify(tx.outputs)).digest("hex");
    if (actualOutputsHash !== record.preparedRelease!.expectedOutputsHash) {
       // Should never happen, but enforces architectural invariant
       throw new Error("Outputs were mutated before broadcast!");
    }

    const inputAmount = BigInt(record.funding.amountSompi!);
    const outputAmount = tx.outputs.reduce((acc: bigint, o: any) => acc + BigInt(o.amount), 0n);
    const feeSompi = inputAmount - outputAmount;

    record.release = {
       transactionId: submitRes.transactionId,
       fundingOutpoint: `${record.funding.transactionId}:${record.funding.outputIndex}`,
       expectedOutputsHash: record.preparedRelease!.expectedOutputsHash,
       actualOutputsHash,
       feeSompi: feeSompi.toString(),
       status: "broadcast"
    };

    const startTime = Date.now();
    let isConfirmed = false;

    // To verify the tx is in DAG, we use getTransactionByHash.
    // If not found, it throws or returns undefined.
    while (Date.now() - startTime < 30000) {
      try {
          const txData = await rpc.getTransactionByHash(submitRes.transactionId);
          if (txData && txData.transaction) {
              isConfirmed = true;
              break;
          }
      } catch (e: any) {
          // tx not accepted in DAG yet (needs block)
      }
      await new Promise(r => setTimeout(r, 2000));
    }

    await rpc.close();

    if (!isConfirmed) {
      record.release.status = "verification_timeout";
    } else {
      record.release.status = "confirmed";
      record.state = "RELEASED";
    }
    memoryStore.set(id, record);

    return c.json({ ok: true, data: { spendTxId: submitRes.transactionId, status: record.release.status } });
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500);
  }
});
