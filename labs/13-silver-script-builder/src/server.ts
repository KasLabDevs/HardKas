import Fastify from 'fastify';
import { SilverToolkit } from '@hardkas/toolkit';

const fastify = Fastify({ logger: true });
const silver = SilverToolkit.open();
const fakeStorage = new Map<string, any>();

// POST /scripts/template/:name
fastify.post('/scripts/template/:name', async (request, reply) => {
    const { name } = request.params as { name: string };
    
    try {
        const template = silver.template(name);
        return { 
            name: template.name, 
            parameters: template.parameters() 
        };
    } catch (e: any) {
        return reply.status(404).send({ error: e.message });
    }
});

// POST /scripts/compile
fastify.post('/scripts/compile', async (request, reply) => {
    const { source } = request.body as { source: string };
    
    // Using SilverToolkit (which returns the claims securely!)
    const build = await silver.build(source);
    return build;
});

// POST /scripts/validate
// Note: Validation is subsumed by simulate/build in this first mock phase
fastify.post('/scripts/validate', async (request, reply) => {
    const { source } = request.body as { source: string };
    const build = await silver.build(source);
    return { valid: true, sizeBytes: build.bytecode.length / 2, claims: build.claims };
});

// POST /scripts/simulate
fastify.post('/scripts/simulate', async (request, reply) => {
    const { source, args } = request.body as { source: string, args: string[] };
    
    const build = await silver.build(source);
    const simulation = await silver.simulate(build, args);
    return simulation;
});

// POST /scripts/spend-plan
fastify.post('/scripts/spend-plan', async (request, reply) => {
    const { source } = request.body as { source: string };
    const build = await silver.build(source);
    
    return { 
        plan: { estimatedMass: 2500, requiredFee: 2500000 },
        claims: build.claims 
    };
});

// POST /scripts/artifact
fastify.post('/scripts/artifact', async (request, reply) => {
    const { name, source } = request.body as any;
    
    const build = await silver.build(source);
    const artifact = await silver.artifact(build, name);
    fakeStorage.set(artifact.id, artifact);

    return { artifact };
});

// POST /scripts/evidence
fastify.post('/scripts/evidence', async (request, reply) => {
    const { source, args } = request.body as any;
    
    const build = await silver.build(source);
    const simulation = await silver.simulate(build, args);
    const evidence = await silver.evidence(build, simulation);
    
    return evidence;
});

// GET /scripts/:id
fastify.get('/scripts/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const artifact = fakeStorage.get(id);
    if (!artifact) return reply.status(404).send({ error: "Not found" });
    return { artifact };
});

fastify.listen({ port: 3000 }, (err, address) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log(`Server listening at ${address}`);
});
