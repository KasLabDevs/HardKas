import fs from 'node:fs';
import path from 'node:path';

const html = fs.readFileSync('site/index.html', 'utf8');
const match = html.match(/src="data:image\/png;base64,([^"]+)"/);

if (match) {
  const base64Data = match[1];
  const buffer = Buffer.from(base64Data, 'base64');
  const targetDir = path.resolve('apps/docs/static/img');
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, 'logo.png'), buffer);
  console.log('Saved apps/docs/static/img/logo.png, bytes:', buffer.length);
} else {
  console.error('Logo not found in site/index.html');
  process.exit(1);
}
