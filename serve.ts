// Tiny static server for local screenshot work: node serve.ts, then open
// http://localhost:8081/?state=canyon (states: title, canyon, dogfight, boss).

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'game');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' };

createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  const file = join(root, path === '/' ? 'index.html' : path);
  if (!existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(8081, () => console.log('skyward-fury on http://localhost:8081'));
