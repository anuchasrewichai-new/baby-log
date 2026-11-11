// เซิร์ฟเวอร์ทดสอบ: เสิร์ฟ PWA + จำลอง Apps Script ที่ /api (ใช้ Code.gs จริงผ่าน gas-stub)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGas } from './gas-stub.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const gas = loadGas();
const key = gas.ctx.setup();
const port = Number(process.argv[2] || 8765);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api') {
    if (req.method === 'GET') { res.end(gas.ctx.doGet().text); return; }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const out = gas.ctx.doPost({ postData: { contents: body } }).text;
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(out);
    });
    return;
  }
  if (url.pathname === '/__key') { res.end(key); return; }
  if (url.pathname === '/__sheet') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(gas.ss.getSheetByName('Logs').data)); return; }
  let p = path.join(root, decodeURIComponent(url.pathname));
  if (!p.startsWith(root)) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(port, () => console.log(`http://localhost:${port}  key=${key}`));
