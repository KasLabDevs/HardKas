import Fastify from 'fastify';
import { createSyntheticDag } from './fixture.js';
import { IndexerToolkit } from '@hardkas/toolkit';

const fastify = Fastify({ logger: true });

// Instantiate the IndexerToolkit which now exposes .dag
const indexer = IndexerToolkit.open();

// GET /blocks is defined below using cachedBlocks

// GET /blocks/:hash
fastify.get('/blocks/:hash', async (request: any, reply) => {
  const hash = request.params.hash;
  try {
    const block = await indexer.dag.block(hash);
    const resolvedParents = await indexer.dag.parents(hash);
    return {
      ...block,
      blueScore: await indexer.dag.blueScore(hash),
      confirmations: await indexer.dag.confirmations(hash),
      isOrphan: block.parents.length > 0 && resolvedParents.length < block.parents.length
    };
  } catch(e) {
    return reply.status(404).send({ error: "Block not found" });
  }
});

// GET /blocks/:hash/parents
fastify.get('/blocks/:hash/parents', async (request: any, reply) => {
  const hash = request.params.hash;
  try {
    const parents = await indexer.dag.parents(hash);
    return Promise.all(parents.map(async p => ({
      hash: p.hash,
      blueScore: await indexer.dag.blueScore(p.hash)
    })));
  } catch (e: any) {
    return reply.status(404).send({ error: e.message });
  }
});

// GET /blocks/:hash/children
fastify.get('/blocks/:hash/children', async (request: any, reply) => {
  const hash = request.params.hash;
  try {
    const children = await indexer.dag.children(hash);
    return Promise.all(children.map(async c => ({
      hash: c.hash,
      blueScore: await indexer.dag.blueScore(c.hash)
    })));
  } catch(e) {
    return reply.status(404).send({ error: "Block not found" });
  }
});

// GET /blocks/:txId/trace
fastify.get('/blocks/:txId/trace', async (request: any, reply) => {
  const txId = request.params.txId;
  return indexer.dag.trace(txId);
});

// GET /statistics
fastify.get('/statistics', async (request, reply) => {
  return indexer.dag.statistics();
});

export let cachedBlocks: any[] = [];

fastify.get('/blocks', async (request, reply) => {
  return Promise.all(cachedBlocks.map(async b => {
    const resolvedParents = await indexer.dag.parents(b.hash);
    return {
      hash: b.hash,
      blueScore: await indexer.dag.blueScore(b.hash),
      isOrphan: b.parents.length > 0 && resolvedParents.length < b.parents.length
    };
  }));
});

export const injectFixture = async (blocks: any[]) => {
  cachedBlocks = blocks;
  await indexer.dag.ingestBlocks(blocks);
};

const start = async () => {
  try {
    fastify.log.info("Loading synthetic DAG into Toolkit...");
    const blocks = await createSyntheticDag();
    await injectFixture(blocks);


    await fastify.listen({ port: 3000 });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

if (process.argv[1] && process.argv[1].endsWith('index.ts')) {
  start();
}

export { fastify, indexer, createSyntheticDag };
