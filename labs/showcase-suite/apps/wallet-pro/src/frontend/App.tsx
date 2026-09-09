import React, { useEffect, useState } from 'react';
import { Layout, Card, CardHeader, CardBody, Button, GauntletVisualizer } from '@showcase/shared-ui';

export function App() {
  const [wallets, setWallets] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/wallets').then(r => r.json()).then(setWallets).catch(console.error);
  }, []);

  return (
    <Layout title="Wallet Pro">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="My Wallets" subtitle="Manage multiple HD wallets and keys" />
          <CardBody>
            <div className="space-y-4">
              {wallets.length === 0 ? <p>Loading...</p> : wallets.map(w => (
                <div key={w.id} className="p-4 bg-gray-900 rounded-lg border border-gray-800">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-bold text-white">{w.name}</span>
                    <span className="text-emerald-400 font-mono font-bold">{w.balance} KAS</span>
                  </div>
                  <span className="text-xs text-gray-500 font-mono truncate block">{w.address}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 flex space-x-3">
              <Button variant="primary">New Wallet</Button>
              <Button variant="secondary">Import Keystore</Button>
            </div>
          </CardBody>
        </Card>
        
        <Card>
          <CardHeader title="Coin Control" subtitle="UTXO Split, Merge & Sweep" />
          <CardBody>
            <div className="flex flex-col space-y-3">
              <Button variant="secondary">Fetch UTXOs</Button>
              <Button variant="primary">Create Split Plan</Button>
              <Button variant="primary">Create Merge Plan</Button>
              <Button variant="danger">Sweep All Funds</Button>
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
