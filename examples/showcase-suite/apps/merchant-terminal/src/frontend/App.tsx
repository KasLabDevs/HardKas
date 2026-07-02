import React, { useEffect, useState } from 'react';
import { Layout, Card, CardHeader, CardBody, Button, GauntletVisualizer } from '@showcase/shared-ui';

export function App() {
  const [invoices, setInvoices] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/invoices').then(r => r.json()).then(setInvoices).catch(console.error);
  }, []);

  const createInvoice = async () => {
    const res = await fetch('/api/invoices/create', { method: 'POST' });
    const newInvoice = await res.json();
    setInvoices(prev => [...prev, newInvoice]);
  };

  return (
    <Layout title="Merchant Terminal">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Point of Sale" subtitle="Create new payment requests" />
          <CardBody>
            <div className="flex flex-col items-center justify-center space-y-6 py-8">
              <div className="text-6xl font-bold text-white">100.00 KAS</div>
              <Button variant="primary" className="w-full text-lg py-4" onClick={createInvoice}>
                Generate Invoice
              </Button>
            </div>
          </CardBody>
        </Card>
        
        <Card>
          <CardHeader title="Recent Invoices" subtitle="Live payment reconciliation status" />
          <CardBody>
            <div className="space-y-3">
              {invoices.length === 0 ? <p>No invoices.</p> : invoices.map(inv => (
                <div key={inv.id} className="p-3 bg-gray-900 rounded-lg border border-gray-800 flex justify-between items-center">
                  <div>
                    <div className="font-mono text-sm text-gray-300">{inv.id}</div>
                    <div className="text-xs text-gray-500">{new Date(Number(inv.createdAt)).toLocaleString()}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-white">{Number(inv.amountSompi) / 100000000} KAS</div>
                    <div className={`text-xs font-bold uppercase ${inv.status === 'paid' ? 'text-emerald-400' : 'text-yellow-400'}`}>
                      {inv.status}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
      <div className="mt-8">
        <GauntletVisualizer />
      </div>
    </Layout>
  );
}
