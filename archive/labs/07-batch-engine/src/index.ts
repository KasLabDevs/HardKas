import { buildServer } from './api/server.js';

async function start() {
    const server = await buildServer();
    try {
        await server.listen({ port: 3007 });
        console.log('Batch Engine listening on http://localhost:3007');
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
}

start();
