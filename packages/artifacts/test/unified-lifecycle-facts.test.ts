import { describe, expect, it } from "vitest";
import {
  createCovenantTransitionFactArtifact,
  checkCovenantTransitionFactIdentity,
  createZkVerificationFactArtifact,
  checkZkVerificationFactIdentity,
  deriveCovenantStatus,
  deriveZkOperationStatus,
  HardkasSchemas,
  type DerivedTxStatus
} from "../src/index.js";

describe("Unified Lifecycle: Specialized Facts and Pure Status Derivation", () => {
  const dummyTxStatus = (status: DerivedTxStatus["status"]): DerivedTxStatus => ({
    txId: "aa".repeat(32),
    status,
    policy: {
      policyId: "hardkas.policy.v1",
      policyVersion: 1,
      origin: "hardkas-product-default",
      minConfirmations: 10,
      confirmationUnit: "blue-score"
    },
    perObserver: [],
    observers: [],
    evidence: { observationArtifactIds: [], ignored: [] },
    reasons: [`Derived state ${status}`],
    isFinal: status === "FINALIZED" || status === "REJECTED_BY_NODE"
  });

  describe("CovenantTransitionFact", () => {
    const validParams = {
      networkId: "simnet",
      covenantId: "11".repeat(32),
      contractName: "Counter",
      artifactSha256: "22".repeat(32),
      entrypoint: "bump",
      previousState: { count: 10 },
      nextState: { count: 11 },
      spentOutpoint: { transactionId: "33".repeat(32), index: 0 },
      successorOutpoint: { transactionId: "44".repeat(32), index: 0 },
      successorAmountSompi: "99000000",
      planArtifactId: "55".repeat(32),
      txId: "44".repeat(32),
      validation: {
        structuralPassed: true,
        scriptVmPassed: true,
        vmStatus: "PASS"
      }
    };

    it("creates a sealed CovenantTransitionFact with verified identity", () => {
      const fact = createCovenantTransitionFactArtifact(validParams);
      expect(fact.schema).toBe(HardkasSchemas.CovenantTransitionFactV1);
      expect(fact.covenantId).toBe("11".repeat(32));
      expect(fact.contentHash).toBeDefined();

      const check = checkCovenantTransitionFactIdentity(fact);
      expect(check.ok).toBe(true);
      expect(check.artifactId).toBe(fact.contentHash);
    });

    it("detects tampering when content is modified", () => {
      const fact = createCovenantTransitionFactArtifact(validParams);
      const tampered = { ...fact, entrypoint: "malicious_entry" };
      const check = checkCovenantTransitionFactIdentity(tampered);
      expect(check.ok).toBe(false);
    });

    it("derives PROPOSED status when no txStatus is provided", () => {
      const fact = createCovenantTransitionFactArtifact(validParams);
      const status = deriveCovenantStatus({ transitionFact: fact });
      expect(status.kind).toBe("PROPOSED");
      expect(status.activeOutpoint).toBe(`${"33".repeat(32)}:0`);
      expect(status.currentState).toEqual({ count: 10 });
      expect(status.isFinal).toBe(false);
    });

    it("derives MEMPOOL_PENDING when transaction is in mempool", () => {
      const fact = createCovenantTransitionFactArtifact(validParams);
      const status = deriveCovenantStatus({
        transitionFact: fact,
        txStatus: dummyTxStatus("MEMPOOL_ACCEPTED")
      });
      expect(status.kind).toBe("MEMPOOL_PENDING");
      expect(status.isFinal).toBe(false);
    });

    it("derives TRANSITION_CONFIRMED and advances state when transaction is confirmed", () => {
      const fact = createCovenantTransitionFactArtifact(validParams);
      const status = deriveCovenantStatus({
        transitionFact: fact,
        txStatus: dummyTxStatus("CONFIRMED")
      });
      expect(status.kind).toBe("TRANSITION_CONFIRMED");
      expect(status.activeOutpoint).toBe(`${"44".repeat(32)}:0`);
      expect(status.currentState).toEqual({ count: 11 });
    });

    it("derives TRANSITION_REJECTED when transaction is rejected by node", () => {
      const fact = createCovenantTransitionFactArtifact(validParams);
      const status = deriveCovenantStatus({
        transitionFact: fact,
        txStatus: dummyTxStatus("REJECTED_BY_NODE")
      });
      expect(status.kind).toBe("TRANSITION_REJECTED");
      expect(status.currentState).toEqual({ count: 10 });
      expect(status.isFinal).toBe(true);
    });

    it("derives TRANSITION_REORGED and restores previous state when transaction is reorged", () => {
      const fact = createCovenantTransitionFactArtifact(validParams);
      const status = deriveCovenantStatus({
        transitionFact: fact,
        txStatus: dummyTxStatus("REORGED")
      });
      expect(status.kind).toBe("TRANSITION_REORGED");
      expect(status.currentState).toEqual({ count: 10 });
      expect(status.isFinal).toBe(false);
    });

    it("derives TERMINATED when covenant concludes without successor", () => {
      const fact = createCovenantTransitionFactArtifact({
        ...validParams,
        nextState: undefined,
        successorOutpoint: undefined
      });
      const status = deriveCovenantStatus({
        transitionFact: fact,
        txStatus: dummyTxStatus("FINALIZED"),
        isTerminated: true
      });
      expect(status.kind).toBe("TERMINATED");
      expect(status.isFinal).toBe(true);
    });
  });

  describe("ZkVerificationFact", () => {
    const validParams = {
      networkId: "simnet",
      imageId: "66".repeat(32),
      journalHash: "77".repeat(32),
      proofSha256: "88".repeat(32),
      verifiedOffChain: true,
      spendUtxo: {
        transactionId: "99".repeat(32),
        index: 0,
        amountSompi: "200000000"
      },
      p2shAddress: "kaspatest:pr0zk...",
      redeemScriptHash: "aa".repeat(16),
      planArtifactId: "bb".repeat(32),
      txId: "cc".repeat(32),
      payoutAddress: "kaspatest:qpminer...",
      payoutSompi: "180000000",
      computeBudget: 50000,
      feeSompi: "20000000"
    };

    it("creates a sealed ZkVerificationFact with verified identity", () => {
      const fact = createZkVerificationFactArtifact(validParams);
      expect(fact.schema).toBe(HardkasSchemas.ZkVerificationFactV1);
      expect(fact.imageId).toBe("66".repeat(32));
      expect(fact.contentHash).toBeDefined();

      const check = checkZkVerificationFactIdentity(fact);
      expect(check.ok).toBe(true);
      expect(check.artifactId).toBe(fact.contentHash);
    });

    it("derives PROOF_VERIFICATION_FAILED when math verification was false", () => {
      const fact = createZkVerificationFactArtifact({
        ...validParams,
        verifiedOffChain: false
      });
      const status = deriveZkOperationStatus({ zkFact: fact });
      expect(status.kind).toBe("PROOF_VERIFICATION_FAILED");
      expect(status.isFinal).toBe(true);
    });

    it("derives PROOF_VERIFIED_OFFCHAIN when verified offchain but not yet observed", () => {
      const fact = createZkVerificationFactArtifact(validParams);
      const status = deriveZkOperationStatus({ zkFact: fact });
      expect(status.kind).toBe("PROOF_VERIFIED_OFFCHAIN");
      expect(status.isFinal).toBe(false);
    });

    it("derives TX_SUBMITTED when transaction is in mempool", () => {
      const fact = createZkVerificationFactArtifact(validParams);
      const status = deriveZkOperationStatus({
        zkFact: fact,
        txStatus: dummyTxStatus("MEMPOOL_ACCEPTED")
      });
      expect(status.kind).toBe("TX_SUBMITTED");
      expect(status.isFinal).toBe(false);
    });

    it("derives SETTLED when transaction is confirmed by consensus", () => {
      const fact = createZkVerificationFactArtifact(validParams);
      const status = deriveZkOperationStatus({
        zkFact: fact,
        txStatus: dummyTxStatus("CONFIRMED")
      });
      expect(status.kind).toBe("SETTLED");
      expect(status.payoutAddress).toBe(validParams.payoutAddress);
      expect(status.payoutSompi).toBe(validParams.payoutSompi);
    });

    it("derives TX_REJECTED when node consensus rejects the ZK spend", () => {
      const fact = createZkVerificationFactArtifact(validParams);
      const status = deriveZkOperationStatus({
        zkFact: fact,
        txStatus: dummyTxStatus("REJECTED_BY_NODE")
      });
      expect(status.kind).toBe("TX_REJECTED");
      expect(status.isFinal).toBe(true);
    });

    it("derives TX_REORGED when transaction was reorged out of DAG", () => {
      const fact = createZkVerificationFactArtifact(validParams);
      const status = deriveZkOperationStatus({
        zkFact: fact,
        txStatus: dummyTxStatus("REORGED")
      });
      expect(status.kind).toBe("TX_REORGED");
      expect(status.isFinal).toBe(false);
    });
  });
});
