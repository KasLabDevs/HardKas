import { Hardkas } from './packages/sdk/dist/index.js';
import fs from 'fs/promises';
import path from 'path';

async function testWindowsTraversal() {
  const hk = await Hardkas.open({ cwd: process.cwd() });
  
  const maliciousArtifact = {
    schema: 'hardkas.txPlan.v1',
    // Using Windows backslashes
    artifactId: '..\\..\\..\\..\\..\\..\\windows-marker',
  };

  console.log('Attempting to write malicious artifact with backslashes...');
  try {
    const result = await hk.artifacts.write(maliciousArtifact as any);
    console.log('Write successful! Path returned:', result.absolutePath);
    
    // Check if it exists outside
    const markerPath = path.join(process.cwd(), 'windows-marker.json');
    const exists = await fs.access(markerPath).then(() => true).catch(() => false);
    console.log('Marker exists at workspace root?', exists);
  } catch (err) {
    console.error('Write failed:', err.message);
  }
}

testWindowsTraversal();
