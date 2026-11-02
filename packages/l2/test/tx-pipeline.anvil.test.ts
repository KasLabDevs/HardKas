import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { parseEther } from "viem";
import { EvmJsonRpcClient } from "../src/evm-rpc-client.js";
import {
  prepareEvmTransaction,
  sendAndConfirmTransaction,
  EvmLocalAccountSigner,
  EvmTransactionRevertedError
} from "../src/tx-pipeline.js";
import {
  startLocalEvmNode,
  type LocalEvmNodeHandle,
  ANVIL_CHAIN_ID,
  ANVIL_TEST_ACCOUNTS,
  sweepDanglingAnvilNodes
} from "./harness/local-evm-node.js";

describe("Phase 2: EVM Transaction Pipeline (Live Anvil Node)", () => {
  let node: LocalEvmNodeHandle;
  let client: EvmJsonRpcClient;

  beforeAll(async () => {
    sweepDanglingAnvilNodes();
    node = await startLocalEvmNode({ startupTimeoutMs: 15000 });
    client = new EvmJsonRpcClient({ profile: "local",
      url: node.rpcUrl,
      target: node.target,
      timeoutMs: 5000
    });
  }, 20000);

  afterAll(async () => {
    if (node) {
      await node.stop();
    }
    sweepDanglingAnvilNodes();
  });

  it("builds, signs, and executes an EIP-1559 transfer", async () => {
    const sender = ANVIL_TEST_ACCOUNTS[0]!;
    const recipient = ANVIL_TEST_ACCOUNTS[1]!;
    const signer = new EvmLocalAccountSigner(sender.privateKey, { profile: "local" });

    const initialRecipientBalance = await client.getBalanceWei(recipient.address);
    const transferAmount = parseEther("2.5");

    // 1. Prepare EIP-1559 transaction
    const prepared = await prepareEvmTransaction(
      client,
      signer.getAddress(),
      {
        to: recipient.address,
        value: transferAmount,
        type: "eip1559"
      }
    );

    expect(prepared.type).toBe("eip1559");
    expect(prepared.chainId).toBe(ANVIL_CHAIN_ID);
    expect(prepared.maxFeePerGas).toBeDefined();
    expect(prepared.maxPriorityFeePerGas).toBeDefined();
    expect(prepared.gasLimit >= 21000n).toBe(true);

    // 2. Sign
    const { rawTransaction, txHash } = await signer.signTransaction(prepared);
    expect(txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    expect(rawTransaction.startsWith("0x02")).toBe(true); // EIP-1559 envelope prefix

    // 3. Send & Confirm
    const receipt = await sendAndConfirmTransaction(client, rawTransaction);
    expect(receipt.status).toBe("success");
    expect(receipt.txHash.toLowerCase()).toBe(txHash.toLowerCase());
    expect(receipt.from?.toLowerCase()).toBe(sender.address.toLowerCase());
    expect(receipt.to?.toLowerCase()).toBe(recipient.address.toLowerCase());

    // 4. Verify balance update
    const finalRecipientBalance = await client.getBalanceWei(recipient.address);
    expect(finalRecipientBalance - initialRecipientBalance).toBe(transferAmount);
  });

  it("builds, signs, and executes a Legacy transaction", async () => {
    const sender = ANVIL_TEST_ACCOUNTS[1]!;
    const recipient = ANVIL_TEST_ACCOUNTS[2]!;
    const signer = new EvmLocalAccountSigner(sender.privateKey, { profile: "local" });

    const initialRecipientBalance = await client.getBalanceWei(recipient.address);
    const transferAmount = parseEther("1");

    const prepared = await prepareEvmTransaction(
      client,
      signer.getAddress(),
      {
        to: recipient.address,
        value: transferAmount,
        type: "legacy"
      }
    );

    expect(prepared.type).toBe("legacy");
    expect(prepared.gasPrice).toBeDefined();

    const { rawTransaction, txHash } = await signer.signTransaction(prepared);
    // Legacy transactions start with RLP (typically 0xf8)
    expect(rawTransaction.startsWith("0xf8")).toBe(true);

    const receipt = await sendAndConfirmTransaction(client, rawTransaction);
    expect(receipt.status).toBe("success");
    expect(receipt.txHash.toLowerCase()).toBe(txHash.toLowerCase());

    const finalRecipientBalance = await client.getBalanceWei(recipient.address);
    expect(finalRecipientBalance - initialRecipientBalance).toBe(transferAmount);
  });

  it("handles automatic consecutive nonces correctly", async () => {
    const sender = ANVIL_TEST_ACCOUNTS[2]!;
    const recipient = ANVIL_TEST_ACCOUNTS[4]!;
    const signer = new EvmLocalAccountSigner(sender.privateKey, { profile: "local" });

    // Send first transaction
    const tx1 = await prepareEvmTransaction(client, signer.getAddress(), {
      to: recipient.address,
      value: parseEther("0.1")
    });
    const signed1 = await signer.signTransaction(tx1);
    const receipt1 = await sendAndConfirmTransaction(client, signed1.rawTransaction);
    expect(receipt1.status).toBe("success");

    // Send second transaction immediately - nonce should automatically advance
    const tx2 = await prepareEvmTransaction(client, signer.getAddress(), {
      to: recipient.address,
      value: parseEther("0.2")
    });
    expect(tx2.nonce).toBe(tx1.nonce + 1);

    const signed2 = await signer.signTransaction(tx2);
    const receipt2 = await sendAndConfirmTransaction(client, signed2.rawTransaction);
    expect(receipt2.status).toBe("success");
  });

  it("rejects signing when signer address does not match prepared transaction from", async () => {
    const senderA = ANVIL_TEST_ACCOUNTS[0]!;
    const senderB = ANVIL_TEST_ACCOUNTS[1]!;
    const signerB = new EvmLocalAccountSigner(senderB.privateKey, { profile: "local" });

    // Prepared for sender A
    const preparedForA = await prepareEvmTransaction(client, senderA.address, {
      to: senderB.address,
      value: parseEther("0.1")
    });

    // Attempting to sign with signer B must reject
    await expect(signerB.signTransaction(preparedForA)).rejects.toThrow(
      /Signer address.*does not match prepared transaction from/
    );
  });

  it("validates private key format on signer instantiation", () => {
    expect(() => new EvmLocalAccountSigner("invalid-pk", { profile: "local" })).toThrow(
      /Invalid EVM private key/
    );
    expect(() => new EvmLocalAccountSigner("0x1234", { profile: "local" })).toThrow(
      /Invalid EVM private key/
    );
  });
});
