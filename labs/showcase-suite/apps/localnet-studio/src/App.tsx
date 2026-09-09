import { useState, useEffect } from 'react';
import { NodeStatusCard } from './components/NodeStatusCard';
import { MinerControl } from './components/MinerControl';
import { FaucetPanel } from './components/FaucetPanel';
import { TerminalView } from './components/TerminalView';

const API_BASE = 'http://localhost:4016/api';

type Log = { time: string, message: string, type: 'info' | 'warn' | 'error' | 'success' };

function App() {
  const [isRunning, setIsRunning] = useState(false);
  const [blueScore, setBlueScore] = useState(0);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<Log[]>([]);
  
  const addLog = (message: string, type: Log['type'] = 'info') => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { time, message, type }]);
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/status`);
      const data = await res.json();
      if (data.isRunning !== isRunning) {
        setIsRunning(data.isRunning);
      }
      if (data.blueScore) setBlueScore(data.blueScore);
    } catch (e) {
      // Backend might be offline
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleStart = async () => {
    setLoading(true);
    addLog('Starting Localnet Simnet Container...', 'info');
    try {
      const res = await fetch(`${API_BASE}/start`, { method: 'POST' });
      if (res.ok) {
        setIsRunning(true);
        addLog('Simnet Node Started Successfully', 'success');
      } else {
        const err = await res.json();
        addLog(`Failed to start: ${err.error}`, 'error');
      }
    } catch (e: any) {
      addLog(`Error: ${e.message}`, 'error');
    } finally {
      setLoading(false);
      fetchStatus();
    }
  };

  const handleStop = async () => {
    setLoading(true);
    addLog('Stopping Localnet Simnet Container...', 'warn');
    try {
      const res = await fetch(`${API_BASE}/stop`, { method: 'POST' });
      if (res.ok) {
        setIsRunning(false);
        setBlueScore(0);
        addLog('Simnet Node Stopped Successfully', 'success');
      }
    } catch (e: any) {
      addLog(`Error: ${e.message}`, 'error');
    } finally {
      setLoading(false);
      fetchStatus();
    }
  };

  const handleMine = async (blocks: number) => {
    addLog(`Requested mining ${blocks} block(s)...`, 'info');
    try {
      const res = await fetch(`${API_BASE}/mine`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks })
      });
      if (res.ok) {
        addLog(`Successfully mined ${blocks} block(s)`, 'success');
        fetchStatus(); // Immediately fetch score
      } else {
        const err = await res.json();
        addLog(`Mining failed: ${err.error}`, 'error');
      }
    } catch (e: any) {
      addLog(`Error: ${e.message}`, 'error');
    }
  };

  const handleFaucet = async (address: string, amount: number) => {
    addLog(`Airdropping ${amount} KAS to ${address.substring(0, 15)}...`, 'info');
    try {
      const res = await fetch(`${API_BASE}/faucet`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, amount })
      });
      if (res.ok) {
        const data = await res.json();
        addLog(`Airdrop successful! TxId: ${data.txId}`, 'success');
      } else {
        const err = await res.json();
        addLog(`Airdrop failed: ${err.error}`, 'error');
      }
    } catch (e: any) {
      addLog(`Error: ${e.message}`, 'error');
    }
  };

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
          HardKAS Localnet Studio
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Demonstrating <strong>@hardkas/localnet</strong>
        </div>
      </header>

      <main className="main-content">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <NodeStatusCard 
            isRunning={isRunning} 
            blueScore={blueScore} 
            onStart={handleStart} 
            onStop={handleStop} 
            loading={loading} 
          />
          <TerminalView logs={logs} />
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <MinerControl onMine={handleMine} isRunning={isRunning} />
          <FaucetPanel onFaucet={handleFaucet} isRunning={isRunning} />
        </div>
      </main>
    </div>
  );
}

export default App;
