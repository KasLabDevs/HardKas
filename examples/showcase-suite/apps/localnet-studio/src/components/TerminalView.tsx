import React from 'react';

interface TerminalViewProps {
  logs: { time: string, message: string, type: 'info' | 'warn' | 'error' | 'success' }[];
}

export const TerminalView: React.FC<TerminalViewProps> = ({ logs }) => {
  return (
    <div className="terminal-container">
      <div className="terminal-header">
        <div className="terminal-btn red"></div>
        <div className="terminal-btn yellow"></div>
        <div className="terminal-btn green"></div>
        <div style={{ marginLeft: '1rem', color: '#888', fontSize: '0.8rem' }}>rusty-kaspad logs</div>
      </div>
      <div className="terminal-body" id="terminal-body">
        {logs.map((log, i) => (
          <div key={i} className="terminal-line">
            <span className="time">[{log.time}]</span>
            <span className={log.type}>{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
