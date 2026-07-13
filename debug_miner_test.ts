import { exec } from 'child_process';
import { Hardkas } from './packages/sdk/src/index.ts';
async function run() {
  const sdk = await Hardkas.open({ network: 'simnet', cwd: process.cwd() });
  await sdk.node.reset();
  await sdk.node.start();
  const wallet1 = sdk.wallet.open('devWallet1');
  await wallet1.create();
  const addr = await wallet1.receive();
  console.log('Mining to:', addr);
  exec('docker run -d --name test_miner_no_rm --network container:hardkas-kaspad-simnet kaspanet/cpuminer:latest -a ' + addr + ' -s 127.0.0.1 -p 16210 --mine-when-not-synced -t 1');
  for (let i=0; i<30; i++) {
    await new Promise(r => setTimeout(r, 10000));
    const dag = await sdk.rpc.getBlockDagInfo();
    const utxos = await sdk.rpc.getUtxosByAddress(addr);
    console.log('Score:', dag.virtualDaaScore, 'UTXOs:', utxos.length);
  }
}
run().catch(console.error);
