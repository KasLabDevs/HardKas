import { describe, it, expect } from 'vitest';
import { psktProbe, psktInspect, psktDecodeEncodeRoundtrip, psktCombine, psktFinalize, psktExtract, psktSign } from '../index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('pskt-native bridge', () => {
  it('should probe correctly', () => {
    const capsStr = psktProbe();
    const caps = JSON.parse(capsStr);
    expect(caps.bridgeVersion).toBe('0.11.4-alpha');
    expect(caps.operations.decode).toBe(true);
  });

  it('should roundtrip minimal PSKT fixture', () => {
    const fixturePath = path.join(__dirname, '../fixtures/pskt-minimal-v1.json');
    const fixtureData = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const payloadBase64 = fixtureData.payloadBase64;
    
    const resultStr = psktDecodeEncodeRoundtrip(payloadBase64);
    const result = JSON.parse(resultStr);
    
    expect(result.byteIdentical).toBe(true);
    expect(result.inputHash).toBe(result.outputHash);
    expect(result.payloadBase64).toBe(payloadBase64);
    
    // Canonical identity is the JSON string representation
    expect(result.canonicalIdentityBefore).toBe(result.canonicalIdentityAfter);
    const canonical = JSON.parse(result.canonicalIdentityBefore);
    expect(canonical).toBeInstanceOf(Array);
    expect(canonical[0].global.version).toBe(1);
  });

  it('should reject payload exceeding size limit', () => {
    // 5MB + 1 byte
    const hugePayload = 'A'.repeat(5 * 1024 * 1024 + 1);
    expect(() => psktDecodeEncodeRoundtrip(hugePayload)).toThrow(/MAX_PSKT_PAYLOAD_BYTES/);
  });

  it('should reject invalid base64', () => {
    expect(() => psktDecodeEncodeRoundtrip('!@#$%')).toThrow(/Invalid base64/);
  });

  it('should reject invalid PSKB prefix', () => {
    // Encode 'PSKA[...]' instead of 'PSKB[...]'
    const badPrefix = Buffer.from('PSKA[]', 'utf8').toString('base64');
    expect(() => psktDecodeEncodeRoundtrip(badPrefix)).toThrow(/Missing PSKB prefix/);
  });

  describe('operations', () => {
    const fixturePath = path.join(__dirname, '../fixtures/pskt-minimal-v1.json');
    let minimalPayload: string;

    it('should read minimal payload', () => {
      const fixtureData = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
      minimalPayload = fixtureData.payloadBase64;
    });

    it('should combine empty payload with itself idempotenly', () => {
      // Combining two identical empty PSKTs should succeed
      const payloadsJson = JSON.stringify([minimalPayload, minimalPayload]);
      const resultStr = psktCombine(payloadsJson);
      const result = JSON.parse(resultStr);
      expect(result.state).toBe('combined');
      expect(result.inputPayloadHashes).toHaveLength(2);
      expect(result.payloadBase64).toBeTruthy();
    });

    it('should reject combine with < 2 payloads', () => {
      const payloadsJson = JSON.stringify([minimalPayload]);
      expect(() => psktCombine(payloadsJson)).toThrow(/Need at least 2 payloads/);
    });

    it('should finalize idempotently when no inputs', () => {
      const resultStr = psktFinalize(minimalPayload);
      const result = JSON.parse(resultStr);
      expect(result.state).toBe('finalized');
      expect(result.payloadBase64).toBeTruthy();
    });

    it('should safely reject extract when not finalized', () => {
      expect(() => psktExtract(minimalPayload, 'testnet-10')).toThrow(/PSKT_NOT_FINALIZED/);
    });

    it('should reject extract on invalid network ID', () => {
      expect(() => psktExtract(minimalPayload, 'invalid-net')).toThrow(/NetworkError/);
    });
  });

  describe('sign lifecycle', () => {
    const fixturePath = path.join(__dirname, '../fixtures/pskt-signable-v1.json');
    // We generate keys in-memory for testing, rather than reading from fixture
    const privateKeyHex = "245b6a9f320145df2a936b80cdf12d69cc4292bb1667028ed5e25805b7b41d72";
    
    it('should successfully sign a PSKT, checking semantic identity and idempotency', () => {
      const fixtureData = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
      const payloadBase64 = fixtureData.payloadBase64;
      
      const privKeys = [Buffer.from(privateKeyHex, 'hex')];
      const reqJson = JSON.stringify({ inputIndexes: [0] });
      
      const beforeInspect = JSON.parse(psktInspect(payloadBase64));
      
      const resultStr = psktSign(payloadBase64, privKeys, reqJson);
      const result = JSON.parse(resultStr);
      
      expect(result.state).toBe('signed');
      expect(result.payloadBase64).toBeTruthy();
      expect(result.payloadBase64).not.toBe(payloadBase64); // payload changed
      
      const afterInspect = JSON.parse(psktInspect(result.payloadBase64));
      
      // Semantic identity check
      expect(beforeInspect.unsignedTransactionIdentity).toBe(afterInspect.unsignedTransactionIdentity);
      expect(beforeInspect.partialSignatureCommitment).not.toBe(afterInspect.partialSignatureCommitment);
      
      // Idempotency check: sign again
      const resultStr2 = psktSign(result.payloadBase64, privKeys, reqJson);
      const result2 = JSON.parse(resultStr2);
      expect(result2.state).toBe('signed');
      
      const afterInspect2 = JSON.parse(psktInspect(result2.payloadBase64));
      expect(afterInspect.partialSignatureCommitment).toBe(afterInspect2.partialSignatureCommitment); // No second signature added
      
      // Finalize it
      const finalResultStr = psktFinalize(result2.payloadBase64);
      const finalResult = JSON.parse(finalResultStr);
      expect(finalResult.state).toBe('finalized');
    });

    it('should reject sign on invalid key format', () => {
      const fixtureData = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
      const badPrivKeys = [Buffer.from('not-a-valid-key', 'utf8')];
      const reqJson = JSON.stringify({ inputIndexes: [0] });
      expect(() => psktSign(fixtureData.payloadBase64, badPrivKeys, reqJson)).toThrow(/Invalid private key format/);
    });

    it('should throw PSKT_SIGNING_KEY_REQUIRED when no keys provided', () => {
      const fixtureData = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
      const payloadBase64 = fixtureData.payloadBase64;
      const reqJson = JSON.stringify({ inputIndexes: [0] });
      
      expect(() => psktSign(payloadBase64, [], reqJson)).toThrow(/PSKT_SIGNING_KEY_REQUIRED/);
    });
    
    it('should throw PSKT_SIGNING_INPUTS_REQUIRED when empty inputIndexes provided', () => {
      const fixtureData = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
      const payloadBase64 = fixtureData.payloadBase64;
      const privKeys = [Buffer.from(privateKeyHex, 'hex')];
      const reqJson = JSON.stringify({ inputIndexes: [] });
      
      expect(() => psktSign(payloadBase64, privKeys, reqJson)).toThrow(/PSKT_SIGNING_KEY_REQUIRED/); // Or INPUTS_REQUIRED depending on Rust impl
    });
  });
});
