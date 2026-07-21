import Fastify from 'fastify';
import { WalletService } from './domain/WalletService.js';

const fastify = Fastify({ logger: true });
const walletService = new WalletService();

fastify.post('/wallets', async (request, reply) => {
    const wallet = await walletService.createWallet();
    return reply.code(201).send(wallet);
});

fastify.post('/wallets/:id/address', async (request, reply) => {
    const { id } = request.params as { id: string };
    const address = await walletService.generateAddress(id);
    return reply.code(201).send(address);
});

fastify.get('/wallets/:id/balance', async (request, reply) => {
    const { id } = request.params as { id: string };
    const balance = await walletService.getBalance(id);
    return reply.send({ balance });
});

fastify.get('/wallets/:id/utxos', async (request, reply) => {
    const { id } = request.params as { id: string };
    const utxos = await walletService.getUtxos(id);
    return reply.send({ utxos });
});

fastify.get('/wallets/:id/history', async (request, reply) => {
    const { id } = request.params as { id: string };
    const history = await walletService.getHistory(id);
    return reply.send({ history });
});

fastify.post('/wallets/:id/send', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { to, amount } = request.body as { to: string, amount: number };
    const result = await walletService.send(id, to, amount);
    return reply.send(result);
});

fastify.post('/wallets/:id/sign', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { txId } = request.body as { txId: string };
    const result = await walletService.sign(id, txId);
    return reply.send(result);
});

fastify.post('/wallets/:id/estimate-fee', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { to, amount } = request.body as { to: string, amount: number };
    const fee = await walletService.estimateFee(id, to, amount);
    return reply.send({ fee });
});

const start = async () => {
    try {
        await fastify.listen({ port: 3000 });
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
