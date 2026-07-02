import React, { useEffect, useState } from 'react';
import { Layout, Card, CardHeader, CardBody, Button, GauntletVisualizer } from '@showcase/shared-ui';

export function App() {
  const [health, setHealth] = useState<any>(null);
  const [wallet, setWallet] = useState<any>(null);

  useEffect(() => {
    fetch('/api/health').then(r => r.json()).then(setHealth).catch(console.error);
    fetch('/api/wallet').then(r => r.json()).then(setWallet).catch(console.error);
  }, []);

  return (
    <Layout title="Mission Control">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Node Daemon Status" subtitle="Sync daemon lifecycle and RPC connectivity" />
          <CardBody>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-gray-900 rounded-lg border border-gray-800">
                <span className="text-gray-400">Network</span>
                <span className="text-emerald-400 font-mono">{health?.network || '...'}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-900 rounded-lg border border-gray-800">
                <span className="text-gray-400">Daemon Running</span>
                <span className="text-emerald-400 font-mono">{health?.daemon ? 'YES' : 'NO'}</span>
              </div>
            </div>
            <div className="mt-6 flex space-x-3">
              <Button variant="primary">Start Miner</Button>
              <Button variant="secondary">View Logs</Button>
            </div>
          </CardBody>
        </Card>
        
        <Card>
          <CardHeader title="Treasury Wallet" subtitle="Localnet Funding & UTXOs" />
          <CardBody>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-gray-900 rounded-lg border border-gray-800">
                <span className="text-gray-400">Balance</span>
                <span className="text-emerald-400 font-mono text-xl">{wallet ? (Number(wallet.totalSompi) / 100000000).toFixed(2) : '...'} KAS</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-gray-900 rounded-lg border border-gray-800">
                <span className="text-gray-400">UTXO Count</span>
                <span className="text-gray-200 font-mono">{wallet?.utxoCount || 0}</span>
              </div>
            </div>
            <div className="mt-6">
              <Button variant="primary" className="w-full">Send Funding Transaction</Button>
            </div>
          </CardBody>
        </Card>
      </div>
      <div className="mt-6">
        <GauntletVisualizer />
      </div>
    </Layout>
  );
}
