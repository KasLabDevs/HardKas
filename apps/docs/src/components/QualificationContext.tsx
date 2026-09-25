import React from 'react';
import { qualificationData } from '../../docs-data/qualification';

export default function QualificationContext({ capabilityId }: { capabilityId: string }) {
  const data = qualificationData[capabilityId];
  if (!data) {
    return <div style={{ color: 'red', border: '1px solid red', padding: '10px' }}>Unknown capability: {capabilityId}</div>;
  }

  return (
    <div style={{ border: '1px solid var(--ifm-color-emphasis-300)', padding: '1rem', borderRadius: '4px', marginBottom: '2rem', backgroundColor: 'var(--ifm-color-emphasis-100)' }}>
      <h4 style={{ marginTop: 0 }}>Qualification Context: {data.name}</h4>
      <p style={{ margin: '0 0 0.5rem 0' }}><strong>HardKAS Version:</strong> {data.hardkasVersion}</p>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div>
          <strong>Environments:</strong>
          <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
            <li>Simulator: {data.environments.simulator}</li>
            <li>Localnet: {data.environments.localnet}</li>
            <li>Testnet: {data.environments.testnet}</li>
          </ul>
        </div>
        <div>
          <strong>Planner:</strong> {data.plannerAuthority}<br />
          <strong>Maturity:</strong> {data.maturity}<br />
          <strong>Evidence Level:</strong> {data.evidenceLevel}<br />
          {data.artifactsProduced.length > 0 && (
            <><strong>Produces:</strong> {data.artifactsProduced.join(', ')}<br /></>
          )}
        </div>
      </div>
      
      {data.knownLimitations.length > 0 && (
        <div style={{ marginTop: '0.5rem', color: '#856404', backgroundColor: '#fff3cd', padding: '0.5rem', borderRadius: '4px' }}>
          <strong>Limitations:</strong> {data.knownLimitations.join(' ')}
        </div>
      )}
    </div>
  );
}
