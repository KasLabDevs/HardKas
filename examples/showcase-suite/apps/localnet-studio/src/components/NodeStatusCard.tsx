import React from 'react';

interface NodeStatusCardProps {
  isRunning: boolean;
  blueScore: number;
  onStart: () => void;
  onStop: () => void;
  loading: boolean;
}

export const NodeStatusCard: React.FC<NodeStatusCardProps> = ({ isRunning, blueScore, onStart, onStop, loading }) => {
  return (
    <div className="card">
      <h2 className="card-title">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>
        Node Status
      </h2>
      
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div className="status-badge">
          <div className={`status-dot ${isRunning ? 'online' : 'offline'}`}></div>
          {isRunning ? 'Simnet Online' : 'Simnet Offline'}
        </div>
        
        <div>
          {!isRunning ? (
            <button className="btn btn-success" onClick={onStart} disabled={loading}>
              {loading ? 'Starting...' : 'Start Simnet'}
            </button>
          ) : (
            <button className="btn btn-danger" onClick={onStop} disabled={loading}>
              {loading ? 'Stopping...' : 'Stop Simnet'}
            </button>
          )}
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric-box">
          <div className="metric-label">Network</div>
          <div className="metric-value">Simnet</div>
        </div>
        <div className="metric-box">
          <div className="metric-label">Blue Score</div>
          <div className="metric-value">{blueScore.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
};
