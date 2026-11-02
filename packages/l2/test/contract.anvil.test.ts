import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { EvmJsonRpcClient } from "../src/evm-rpc-client.js";
import { EvmLocalAccountSigner } from "../src/tx-pipeline.js";
import {
  deployContract,
  readContract,
  writeContract,
  getContractEvents
} from "../src/contract.js";
import {
  startLocalEvmNode,
  type LocalEvmNodeHandle,
  ANVIL_TEST_ACCOUNTS,
  sweepDanglingAnvilNodes
} from "./harness/local-evm-node.js";

// Real compiled Counter contract artifact (Osaka/Cancun EVM baseline)
const COUNTER_ABI = [
  {
    type: "function",
    name: "increment",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "number",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "setNumber",
    inputs: [{ name: "newNumber", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "event",
    name: "NumberChanged",
    inputs: [
      {
        name: "newNumber",
        type: "uint256",
        indexed: true,
        internalType: "uint256"
      }
    ],
    anonymous: false
  }
] as const;

const COUNTER_BYTECODE =
  "0x6080604052348015600e575f5ffd5b5061023c8061001c5f395ff3fe608060405234801561000f575f5ffd5b506004361061003f575f3560e01c80633fb5c1cb146100435780638381f58a1461005f578063d09de08a1461007d575b5f5ffd5b61005d6004803603810190610058919061013f565b610087565b005b6100676100bd565b6040516100749190610179565b60405180910390f35b6100856100c2565b005b805f81905550807f2fd81fd19d3c5c4b396dd13f451dafc8bcac1b3094c49c5fa90e68456323f0e360405160405180910390a250565b5f5481565b5f5f8154809291906100d3906101bf565b91905055505f547f2fd81fd19d3c5c4b396dd13f451dafc8bcac1b3094c49c5fa90e68456323f0e360405160405180910390a2565b5f5ffd5b5f819050919050565b61011e8161010c565b8114610128575f5ffd5b50565b5f8135905061013981610115565b92915050565b5f6020828403121561015457610153610108565b5b5f6101618482850161012b565b91505092915050565b6101738161010c565b82525050565b5f60208201905061018c5f83018461016a565b92915050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52601160045260245ffd5b5f6101c98261010c565b91507fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff82036101fb576101fa610192565b5b60018201905091905056fea2646970667358221220d32ba4e4ba48602691c4115dbe4575f975485539dca4f4cca0596eed0d21404964736f6c63430008250033";

describe("Phase 4: EVM Contracts, ABI and Events (Live Anvil Node)", () => {
  let node: LocalEvmNodeHandle;
  let client: EvmJsonRpcClient;
  let deployerSigner: EvmLocalAccountSigner;
  let contractAddress: `0x${string}`;

  beforeAll(async () => {
    sweepDanglingAnvilNodes();
    node = await startLocalEvmNode({ startupTimeoutMs: 15000 });
    client = new EvmJsonRpcClient({ profile: "local",
      url: node.rpcUrl,
      target: node.target,
      timeoutMs: 5000
    });
    deployerSigner = new EvmLocalAccountSigner(ANVIL_TEST_ACCOUNTS[0]!.privateKey, { profile: "local" });
  }, 20000);

  afterAll(async () => {
    if (node) {
      await node.stop();
    }
    sweepDanglingAnvilNodes();
  });

  it("deploys a real EVM contract and returns the created address", async () => {
    const deployment = await deployContract(client, deployerSigner, {
      bytecode: COUNTER_BYTECODE,
      abi: COUNTER_ABI
    });

    expect(deployment.contractAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(deployment.receipt.status).toBe("success");
    expect(deployment.txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);

    contractAddress = deployment.contractAddress;
  });

  it("reads initial contract state via eth_call (readContract)", async () => {
    const currentNumber = await readContract<bigint>(client, {
      address: contractAddress,
      abi: COUNTER_ABI,
      functionName: "number"
    });

    expect(currentNumber).toBe(0n);
  });

  it("executes state-modifying writeContract (setNumber) and verifies state update", async () => {
    const { receipt, txHash } = await writeContract(client, deployerSigner, {
      address: contractAddress,
      abi: COUNTER_ABI,
      functionName: "setNumber",
      args: [42n]
    });

    expect(receipt.status).toBe("success");
    expect(txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);

    // Verify state changed
    const updatedNumber = await readContract<bigint>(client, {
      address: contractAddress,
      abi: COUNTER_ABI,
      functionName: "number"
    });
    expect(updatedNumber).toBe(42n);
  });

  it("executes parameter-less writeContract (increment)", async () => {
    const { receipt } = await writeContract(client, deployerSigner, {
      address: contractAddress,
      abi: COUNTER_ABI,
      functionName: "increment"
    });

    expect(receipt.status).toBe("success");

    const finalNumber = await readContract<bigint>(client, {
      address: contractAddress,
      abi: COUNTER_ABI,
      functionName: "number"
    });
    expect(finalNumber).toBe(43n);
  });

  it("queries and decodes contract events with deduplication (getContractEvents)", async () => {
    const events = await getContractEvents(client, {
      address: contractAddress,
      abi: COUNTER_ABI,
      eventName: "NumberChanged"
    });

    // Should have captured 2 events: setNumber(42) and increment() -> 43
    expect(events.length).toBe(2);

    expect(events[0]!.eventName).toBe("NumberChanged");
    expect(events[0]!.args.newNumber).toBe(42n);

    expect(events[1]!.eventName).toBe("NumberChanged");
    expect(events[1]!.args.newNumber).toBe(43n);

    // Verify deduplication and addresses
    for (const evt of events) {
      expect(evt.address.toLowerCase()).toBe(contractAddress.toLowerCase());
      expect(evt.blockNumber).toBeDefined();
      expect(evt.transactionHash).toBeDefined();
    }

    // Verify composite key safety: both events have the same in-block logIndex (0),
    // yet both are preserved because their transactionHash and blockNumber differ.
    expect(events[0]!.logIndex).toBe(0);
    expect(events[1]!.logIndex).toBe(0);
    expect(events[0]!.transactionHash).not.toBe(events[1]!.transactionHash);
    expect(events[0]!.blockNumber).not.toBe(events[1]!.blockNumber);
  });

  it("filters out reorg-invalidated logs where removed: true", async () => {
    // Inject a simulated getLogs response containing a reorg-orphaned log marked removed: true
    const originalGetLogs = client.getLogs.bind(client);
    vi.spyOn(client, "getLogs").mockImplementationOnce(async (opts) => {
      const liveLogs = await originalGetLogs(opts);
      const orphanedLog = {
        ...liveLogs[0]!,
        blockHash: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
        removed: true
      };
      return [...liveLogs, orphanedLog];
    });

    const events = await getContractEvents(client, {
      address: contractAddress,
      abi: COUNTER_ABI,
      eventName: "NumberChanged"
    });

    // The removed: true entry must be discarded
    expect(events.length).toBe(2);
    expect(events.some((e) => (e.raw as any).removed === true)).toBe(false);
  });
});
