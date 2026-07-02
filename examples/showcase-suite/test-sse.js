const http = require('http');

const req = http.request('http://localhost:4001/api/gauntlet/stream', {
  method: 'GET',
  headers: {
    'Accept': 'text/event-stream'
  }
}, (res) => {
  console.log('Connected to SSE stream...');
  res.on('data', (chunk) => {
    console.log('SSE EVENT:', chunk.toString());
  });
});

req.end();

setTimeout(() => {
    console.log('Triggering gauntlet start...');
    const startReq = http.request('http://localhost:4001/api/gauntlet/start', { method: 'POST' }, (res) => {
        res.on('data', () => {});
    });
    startReq.end();
}, 1000);

// Close after 15 seconds
setTimeout(() => {
    console.log('Closing client.');
    process.exit(0);
}, 15000);
