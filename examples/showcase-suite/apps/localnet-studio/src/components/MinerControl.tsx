import React, { useState } from 'react';

interface MinerControlProps {
  onMine: (blocks: number) => Promise<void>;
  isRunning: boolean;
}

export const MinerControl: React.FC<MinerControlProps> = ({ onMine, isRunning }) => {
  const [blocks, setBlocks] = useState<number>(1);
  const [mining, setMining] = useState<boolean>(false);

  const handleMine = async () => {
    setMining(true);
    await onMine(blocks);
    setMining(false);
  };

  return (
    <div className="card">
      <h2 className="card-title">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
        Miner Control
      </h2>
      
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        Force rusty-kaspad to mine blocks on demand to test transactions and state transitions instantly.
      </p>

      <div className="input-group">
        <label className="input-label">Blocks to mine</label>
        <input 
          type="number" 
          className="input-field" 
          value={blocks} 
          onChange={(e) => setBlocks(Number(e.target.value))}
          min="1" 
          max="1000"
          disabled={!isRunning || mining}
        />
      </div>

      <button 
        className="btn btn-primary" 
        style={{ width: '100%', marginTop: '0.5rem' }}
        onClick={handleMine}
        disabled={!isRunning || mining}
      >
        {mining ? 'Mining...' : `Mine ${blocks} Block${blocks > 1 ? 's' : ''}`}
      </button>
    </div>
  );
};
