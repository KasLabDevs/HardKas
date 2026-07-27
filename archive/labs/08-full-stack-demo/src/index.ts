import { buildServer } from './api/server.js';

async function start() {
    const server = await buildServer();
    try {
        await server.listen({ port: 3008 });
        console.log('Full Stack Demo listening on http://localhost:3008');
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
}

start();
