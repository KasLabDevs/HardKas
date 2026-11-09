import { describe, it, expect, beforeAll } from "vitest";
import { createKaspaSimulator, SOMPI_PER_KAS } from "../src/simulator-node.js";
import { signInputForAccount } from "../src/crypto/accounts.js";
import type { KaspaRpcTransaction } from "../src/types.js";
import { kaspaCovenantId } from "@hardkas/core";
import { validateTransactionScripts } from "../src/ledger/script-engine.js";

// Above the relay fee floor of the simulator mempool (100 sompi/gram on a ~2 000-gram v1 transaction).
const FEE = 1_000_000n;

describe("Toccata Consensus & Silverscript: Transaction v1, Compute Budgets, and Covenants", () => {
  let sim: ReturnType<typeof createKaspaSimulator>;

  beforeAll(() => {
    sim = createKaspaSimulator({
      networkId: "simnet",
      automine: false,
      bootstrapDevAccounts: true
    });
  });

  it("Transaction v1: accepts valid P2PK transaction with certified computeBudget = 10", async () => {
    const alice = sim.accounts.alice;
    const bob = sim.accounts.bob;

    const utxos = sim.ledger.getUtxosByAddress(alice.address);
    const utxo = utxos[0]!;

    const tx: KaspaRpcTransaction = {
      version: 1,
      inputs: [
        {
          previousOutpoint: { transactionId: utxo.transactionId, index: utxo.index },
          signatureScript: "",
          sequence: 0n,
          sigOpCount: 0,
          computeBudget: 10 // budget 10 -> allows 10 * 10,000 + 9,999 = 109,999 units >= 100,000 required
        } as any
      ],
      outputs: [
        {
          amount: 50n * SOMPI_PER_KAS,
          scriptPublicKey: { version: 0, scriptPublicKey: bob.scriptPublicKey }
        },
        {
          amount: utxo.amountSompi - 50n * SOMPI_PER_KAS - FEE,
          scriptPublicKey: { version: 0, scriptPublicKey: alice.scriptPublicKey }
        }
      ],
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: ""
    };

    signInputForAccount(alice, tx, 0, utxo);

    const res = await sim.rpc.submitTransaction(tx);
    expect(res.transactionId).toBeDefined();

    // Clean up mempool
    sim.mine(1);
  });

  it("Transaction v1: strictly rejects input with insufficient computeBudget = 9 (99,999 units < 100,000 required)", async () => {
    const alice = sim.accounts.alice;
    const bob = sim.accounts.bob;

    const utxos = sim.ledger.getUtxosByAddress(alice.address);
    const utxo = utxos[0]!;

    const tx: KaspaRpcTransaction = {
      version: 1,
      inputs: [
        {
          previousOutpoint: { transactionId: utxo.transactionId, index: utxo.index },
          signatureScript: "",
          sequence: 0n,
          sigOpCount: 0,
          computeBudget: 9 // budget 9 -> allows 99,999 units < 100,000 required!
        } as any
      ],
      outputs: [
        {
          amount: 50n * SOMPI_PER_KAS,
          scriptPublicKey: { version: 0, scriptPublicKey: bob.scriptPublicKey }
        },
        {
          amount: utxo.amountSompi - 50n * SOMPI_PER_KAS - FEE,
          scriptPublicKey: { version: 0, scriptPublicKey: alice.scriptPublicKey }
        }
      ],
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: ""
    };

    signInputForAccount(alice, tx, 0, utxo);

    // rusty-kaspad v2.1.0: ExceededCommittedScriptUnits (opcodes charge 100 000 script units per signature check)
    await expect(sim.rpc.submitTransaction(tx)).rejects.toThrow(/script units exceeded the amount committed in the input: used=100000, limit=99999/i);
  });

  it("Transaction v1: rejects a genesis whose covenant id was not derived from its outpoint and outputs (WrongGenesisCovenantId)", async () => {
    const bob = sim.accounts.bob;
    const carol = sim.accounts.carol;
    const utxo = sim.ledger.getUtxosByAddress(bob.address)[0]!;
    // The id the previous version of this test asserted as valid: rusty-kaspad rejects any id that is not
    // covenant_id(outpoint, authorized outputs) (X1 vector E, a5f40dfe…).
    const forgedId = "c6ba323da0a2c82abe3a4a61155e4daebdec0a1b681311a0ba21029ddc3b19fd";
    const tx: KaspaRpcTransaction = {
      version: 1,
      inputs: [{ previousOutpoint: { transactionId: utxo.transactionId, index: utxo.index }, signatureScript: "", sequence: 0n, sigOpCount: 0, computeBudget: 10 }],
      outputs: [
        { amount: 20n * SOMPI_PER_KAS, scriptPublicKey: { version: 0, scriptPublicKey: carol.scriptPublicKey }, covenant: { authorizingInput: 0, covenantId: forgedId } },
        { amount: utxo.amountSompi - 20n * SOMPI_PER_KAS - FEE, scriptPublicKey: { version: 0, scriptPublicKey: bob.scriptPublicKey } }
      ],
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: ""
    };
    signInputForAccount(bob, tx, 0, utxo);
    await expect(sim.rpc.submitTransaction(tx)).rejects.toThrow(
      new RegExp(`covenants error: input #0 and outputs with covenant id ${forgedId} do not correspond to the expected genesis hashing`)
    );
  });

  it("Transaction v1: validates covenant output binding and preserves covenantId", async () => {
    const bob = sim.accounts.bob;
    const carol = sim.accounts.carol;

    const utxos = sim.ledger.getUtxosByAddress(bob.address);
    const utxo = utxos[0]!;

    // covenant_id(outpoint, [ (0, value, spk) ]): what populateGenesisCovenants binds and the node checks.
    const validCovenantId = kaspaCovenantId({ transactionId: utxo.transactionId, index: utxo.index }, [
      { index: 0, value: 20n * SOMPI_PER_KAS, scriptPublicKey: { version: 0, script: carol.scriptPublicKey } }
    ]);

    const tx: KaspaRpcTransaction = {
      version: 1,
      inputs: [
        {
          previousOutpoint: { transactionId: utxo.transactionId, index: utxo.index },
          signatureScript: "",
          sequence: 0n,
          sigOpCount: 0,
          computeBudget: 10
        } as any
      ],
      outputs: [
        {
          amount: 20n * SOMPI_PER_KAS,
          scriptPublicKey: { version: 0, scriptPublicKey: carol.scriptPublicKey },
          covenant: {
            authorizingInput: 0,
            covenantId: validCovenantId
          }
        } as any,
        {
          amount: utxo.amountSompi - 20n * SOMPI_PER_KAS - FEE,
          scriptPublicKey: { version: 0, scriptPublicKey: bob.scriptPublicKey }
        }
      ],
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: ""
    };

    signInputForAccount(bob, tx, 0, utxo);

    const res = await sim.rpc.submitTransaction(tx);
    expect(res.transactionId).toBeDefined();
    sim.mine(1);

    // The new UTXO carries the covenant id (UtxoEntry.covenant_id).
    const created = sim.ledger.getUtxo(res.transactionId, 0);
    expect(created?.covenantId).toBe(validCovenantId);

    // X1 vector E2 (db2e874b…): another input claiming the existing id is a genesis with a wrong id, so it is rejected
    // and nothing is indexed under that covenant.
    const dave = sim.accounts.dave;
    const daveUtxo = sim.ledger.getUtxosByAddress(dave.address)[0]!;
    const forge: KaspaRpcTransaction = {
      version: 1,
      inputs: [{ previousOutpoint: { transactionId: daveUtxo.transactionId, index: daveUtxo.index }, signatureScript: "", sequence: 0n, sigOpCount: 0, computeBudget: 10 }],
      outputs: [
        { amount: 20n * SOMPI_PER_KAS, scriptPublicKey: { version: 0, scriptPublicKey: carol.scriptPublicKey }, covenant: { authorizingInput: 0, covenantId: validCovenantId } },
        { amount: daveUtxo.amountSompi - 20n * SOMPI_PER_KAS - FEE, scriptPublicKey: { version: 0, scriptPublicKey: dave.scriptPublicKey } }
      ],
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: ""
    };
    signInputForAccount(dave, forge, 0, daveUtxo);
    await expect(sim.rpc.submitTransaction(forge)).rejects.toThrow(/do not correspond to the expected genesis hashing/);
    sim.mine(1);
    const withId = sim.ledger.getAllUtxos().filter((u) => u.covenantId === validCovenantId);
    expect(withId.map((u) => `${u.transactionId}:${u.index}`)).toEqual([`${res.transactionId}:0`]);
  });

  it("Transaction v1: rejects covenant binding when authorizingInput is out of bounds", async () => {
    const carol = sim.accounts.carol;
    const dave = sim.accounts.dave;

    const utxos = sim.ledger.getUtxosByAddress(carol.address);
    const utxo = utxos[0]!;

    const validCovenantId = "c6ba323da0a2c82abe3a4a61155e4daebdec0a1b681311a0ba21029ddc3b19fd";

    const tx: KaspaRpcTransaction = {
      version: 1,
      inputs: [
        {
          previousOutpoint: { transactionId: utxo.transactionId, index: utxo.index },
          signatureScript: "",
          sequence: 0n,
          sigOpCount: 0,
          computeBudget: 10
        } as any
      ],
      outputs: [
        {
          amount: 10n * SOMPI_PER_KAS,
          scriptPublicKey: { version: 0, scriptPublicKey: dave.scriptPublicKey },
          covenant: {
            authorizingInput: 5, // OUT OF BOUNDS: tx only has 1 input (index 0)
            covenantId: validCovenantId
          }
        } as any,
        {
          amount: utxo.amountSompi - 10n * SOMPI_PER_KAS - FEE,
          scriptPublicKey: { version: 0, scriptPublicKey: carol.scriptPublicKey }
        }
      ],
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: ""
    };

    signInputForAccount(carol, tx, 0, utxo);

    // CovenantsError::AuthInputOutOfBounds (covenants.rs:120-122)
    await expect(sim.rpc.submitTransaction(tx)).rejects.toThrow(/covenants error: output #0 covenant authorizing input index 5 is out of bounds/i);
  });

  it("Transaction v1: rejects covenant binding when covenantId is not 32-byte hex", async () => {
    const dave = sim.accounts.dave;
    const erin = sim.accounts.erin;

    const utxos = sim.ledger.getUtxosByAddress(dave.address);
    const utxo = utxos[0]!;

    const tx: KaspaRpcTransaction = {
      version: 1,
      inputs: [
        {
          previousOutpoint: { transactionId: utxo.transactionId, index: utxo.index },
          signatureScript: "",
          sequence: 0n,
          sigOpCount: 0,
          computeBudget: 10
        } as any
      ],
      outputs: [
        {
          amount: 10n * SOMPI_PER_KAS,
          scriptPublicKey: { version: 0, scriptPublicKey: erin.scriptPublicKey },
          covenant: {
            authorizingInput: 0,
            covenantId: "invalid-covenant-id" // NOT 32-byte hex!
          }
        } as any,
        {
          amount: utxo.amountSompi - 10n * SOMPI_PER_KAS - FEE,
          scriptPublicKey: { version: 0, scriptPublicKey: dave.scriptPublicKey }
        }
      ],
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: ""
    };

    // Not signed: a binding that is not 32-byte hex cannot be hashed by the sighash, and the transaction is refused on its
    // wire form before any script runs: by the mempool's txid computation (kaspa-wasm cannot even build it) or, when the
    // validator sees it, by the binding check.
    await expect(sim.rpc.submitTransaction(tx)).rejects.toThrow(/SIMULATOR_TXID_INVALID_TRANSACTION|covenantId must be 32-byte hex string/i);
    const direct = validateTransactionScripts(tx, [utxo], sim.dag.getVirtualDaaScore());
    expect(direct.code).toBe("TX_INVALID_COVENANT_BINDING");
    expect(direct.error).toMatch(/covenantId must be 32-byte hex string/i);
  });

  it("Consensus Parity: rejects covenants on transaction version 0 (rusty-kaspad wire parity)", async () => {
    const alice = sim.accounts.alice;
    const bob = sim.accounts.bob;
    const utxos = sim.ledger.getUtxosByAddress(alice.address);
    const utxo = utxos[0]!;

    const tx: KaspaRpcTransaction = {
      version: 0,
      inputs: [
        {
          previousOutpoint: { transactionId: utxo.transactionId, index: utxo.index },
          signatureScript: "",
          sequence: 0n,
          sigOpCount: 1
        }
      ],
      outputs: [
        {
          amount: 50n * SOMPI_PER_KAS,
          scriptPublicKey: { version: 0, scriptPublicKey: bob.scriptPublicKey },
          covenant: {
            authorizingInput: 0,
            covenantId: "00".repeat(32)
          }
        } as any,
        {
          amount: utxo.amountSompi - 50n * SOMPI_PER_KAS - FEE,
          scriptPublicKey: { version: 0, scriptPublicKey: alice.scriptPublicKey }
        }
      ],
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: ""
    };

    signInputForAccount(alice, tx, 0, utxo);
    await expect(sim.rpc.submitTransaction(tx)).rejects.toThrow(/has covenant field but transaction version is 0/i);
  });

  it("Consensus Parity: rejects transaction version 1 with sigOpCount > 0 (rusty-kaspad wire parity)", async () => {
    const alice = sim.accounts.alice;
    const bob = sim.accounts.bob;
    const utxos = sim.ledger.getUtxosByAddress(alice.address);
    const utxo = utxos[0]!;

    const tx: KaspaRpcTransaction = {
      version: 1,
      inputs: [
        {
          previousOutpoint: { transactionId: utxo.transactionId, index: utxo.index },
          signatureScript: "",
          sequence: 0n,
          sigOpCount: 1, // Invalid for v1: must be 0 (compute metering replaces sigOps)
          computeBudget: 10
        } as any
      ],
      outputs: [
        {
          amount: 50n * SOMPI_PER_KAS,
          scriptPublicKey: { version: 0, scriptPublicKey: bob.scriptPublicKey }
        },
        {
          amount: utxo.amountSompi - 50n * SOMPI_PER_KAS - FEE,
          scriptPublicKey: { version: 0, scriptPublicKey: alice.scriptPublicKey }
        }
      ],
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: ""
    };

    signInputForAccount(alice, tx, 0, utxo);
    await expect(sim.rpc.submitTransaction(tx)).rejects.toThrow(/sig_op_count is inconsistent with transaction version 1/i);
  });
});
