import React, { useState } from 'react';

interface FaucetPanelProps {
  onFaucet: (address: string, amount: number) => Promise<void>;
  isRunning: boolean;
}

export const FaucetPanel: React.FC<FaucetPanelProps> = ({ onFaucet, isRunning }) => {
  const [address, setAddress] = useState<string>('');
  const [amount, setAmount] = useState<number>(1000);
  const [funding, setFunding] = useState<boolean>(false);

  const handleFund = async () => {
    setFunding(true);
    await onFaucet(address, amount);
    setFunding(false);
  };

  const presetAccounts = [
    { label: 'dev-0', address: 'kaspa:simnet:qp0l70zd...' },
    { label: 'dev-1', address: 'kaspa:simnet:qqx7w...' },
  ];

  return (
    <div className="card">
      <h2 className="card-title">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
        Dev Faucet
      </h2>
      
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
        Airdrop KAS directly to any address from the localnet treasury.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {presetAccounts.map(acc => (
          <button 
            key={acc.label}
            className="btn" 
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
            onClick={() => setAddress(acc.address)}
          >
            Use {acc.label}
          </button>
        ))}
      </div>

      <div className="input-group">
        <label className="input-label">Destination Address</label>
        <input 
          type="text" 
          className="input-field" 
          placeholder="kaspa:simnet:..."
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          disabled={!isRunning || funding}
        />
      </div>

      <div className="input-group">
        <label className="input-label">Amount (KAS)</label>
        <input 
          type="number" 
          className="input-field" 
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          disabled={!isRunning || funding}
        />
      </div>

      <button 
        className="btn btn-primary" 
        style={{ width: '100%', marginTop: '0.5rem' }}
        onClick={handleFund}
        disabled={!isRunning || !address || funding}
      >
        {funding ? 'Funding...' : 'Airdrop KAS'}
      </button>
    </div>
  );
};
