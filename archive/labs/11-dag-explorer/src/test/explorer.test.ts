import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fastify, injectFixture, createSyntheticDag } from '../index.js';

describe('Lab 11: DAG Explorer', () => {
  beforeAll(async () => {
    const blocks = await createSyntheticDag();
    await injectFixture(blocks);
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  it('should list all blocks with their manual blue scores', async () => {
    const response = await fastify.inject({ method: 'GET', url: '/blocks' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.length).toBe(8); // genesis, A, B, C, D, E, F, G

    const genesis = body.find((b: any) => b.hash === 'genesis');
    expect(genesis.blueScore).toBe(0);

    const blockA = body.find((b: any) => b.hash === 'block-A');
    expect(blockA.blueScore).toBe(1);

    const blockF = body.find((b: any) => b.hash === 'block-F');
    // F parents are C and E. C parent is A (parent genesis). C score = 2.
    // E parent is B (parent genesis). E score = 2.
    // F score = max(2, 2) + 1 = 3.
    expect(blockF.blueScore).toBe(3);
  });

  it('should identify orphan block', async () => {
    const response = await fastify.inject({ method: 'GET', url: '/blocks/block-G' });
    const body = JSON.parse(response.body);
    expect(body.isOrphan).toBe(true);
    expect(body.confirmations).toBe(0);
  });

  it('should resolve children of a block (Friction: full table scan)', async () => {
    const response = await fastify.inject({ method: 'GET', url: '/blocks/genesis/children' });
    const body = JSON.parse(response.body);
    expect(body.length).toBe(2);
    expect(body.map((c: any) => c.hash)).toContain('block-A');
    expect(body.map((c: any) => c.hash)).toContain('block-B');
  });

  it('should trace a transaction in a merged block', async () => {
    const response = await fastify.inject({ method: 'GET', url: '/blocks/tx-merged-1/trace' });
    const body = JSON.parse(response.body);
    expect(body.status).toBe("accepted");
    expect(body.foundIn).toEqual(["block-F"]);
  });

  it('should detect a transaction conflict across parallel branches', async () => {
    const response = await fastify.inject({ method: 'GET', url: '/blocks/tx-conflict-1/trace' });
    const body = JSON.parse(response.body);
    expect(body.status).toBe("conflict");
    expect(body.foundIn).toContain("block-D");
    expect(body.foundIn).toContain("block-E");
  });
});
