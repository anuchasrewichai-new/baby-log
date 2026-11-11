// เซิร์ฟเวอร์ทดสอบ: เสิร์ฟ PWA + จำลอง Apps Script ที่ /api (ใช้ Code.gs จริงผ่าน gas-stub)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGas } from './gas-stub.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const gas = loadGas();
const key = gas.ctx.setup();
// AI จำลอง: /__aimode?m=normal|pale|poor  (ไม่เรียก Gemini จริง)
let aiMode = process.env.AI_MODE || '';
if (aiMode) gas.props.GEMINI_API_KEY = 'mock-key';
const gem = (o) => ({ body: { candidates: [{ content: { parts: [{ text: JSON.stringify(o) }] } }] } });
gas.ai.handler = (url, body) => {
  const sys = body.systemInstruction.parts[0].text;
  if (sys.includes('เทียบสี')) {
    const pee = sys.includes('ปัสสาวะ');
    if (aiMode === 'pale') return gem({ is_diaper: true, image_quality: 'fair', scores: [{ id: 's06', p: 0.78 }, { id: 's03', p: 0.12 }, { id: 's02', p: 0.06 }, { id: 's07', p: 0.04 }], consistency: 'soft', reason_th: 'สีเหลืองค่อนข้างอ่อน บางส่วนดูซีด' });
    if (aiMode === 'poor') return gem({ is_diaper: true, image_quality: 'poor', quality_issue: 'แสงไฟสีเหลือง', scores: [{ id: 's06', p: 0.7 }, { id: 's09', p: 0.3 }], consistency: 'unknown', reason_th: 'แสงไม่พอ' });
    return gem({ is_diaper: true, image_quality: 'good', scores: pee ? [{ id: 'u2', p: 0.85 }, { id: 'u1', p: 0.15 }] : [{ id: 's06', p: 0.84 }, { id: 's07', p: 0.1 }, { id: 's03', p: 0.04 }, { id: 's09', p: 0.02 }], consistency: 'soft', reason_th: pee ? 'คราบสีเหลืองอ่อน' : 'สีเหลืองมัสตาร์ด มีเม็ดเล็ก ๆ ลักษณะของนมแม่' });
  }
  const prompt = body.contents[0].parts[0].text;
  if (prompt.includes('สรุปแนวโน้ม')) return gem({ summary_th: 'ฉี่เพิ่มขึ้นจาก 3 เป็น 7 ครั้งต่อวันตามอายุ มื้อนมคงที่ 9–11 มื้อ สีอึเปลี่ยนจากเขียวน้ำตาลเป็นเหลืองตั้งแต่วันที่ 4 ซึ่งเป็นไปตามช่วงอายุ', watch_points: ['ตัวเหลืองระดับ 1–2 ยังอยู่ สังเกตว่าไม่ลามลง'], suggest_doctor: false });
  if (prompt.includes('รายงานให้แพทย์')) return gem({ summary_th: 'ทารกอายุ 8 วัน กินนมแม่ 9–11 มื้อต่อวัน ปัสสาวะและอุจจาระถึงเกณฑ์ทุกวันที่ครบ 24 ชม. น้ำหนักต่ำสุดลดลง 6.9% ในวันที่ 5 แล้วเพิ่มขึ้นเป็น 3.18 กก. ไม่มีไข้ ตัวเหลืองระดับ 1–2', questions_for_doctor: ['ตัวเหลืองระดับ 1 ที่ยังเหลือต้องตรวจเลือดซ้ำไหม', 'ควรนัดชั่งน้ำหนักครั้งถัดไปเมื่อไร'], suggest_doctor: false });
  return gem({ answer_th: 'อึสีเขียวในเด็กกินนมแม่พบได้บ่อยและมักไม่อันตราย จากข้อมูล 7 วันที่บันทึก ลูกฉี่และอึถึงเกณฑ์ ถ้าเขียวร่วมกับมีฟองบ่อย ๆ อาจได้นมส่วนต้นมาก ลองให้ดูดเต้าเดิมให้นานขึ้นก่อนเปลี่ยนข้าง', urgent: false });
};
const port = Number(process.argv[2] || 8765);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

// BASE_PATH=/baby-log จำลองการเสิร์ฟใต้โฟลเดอร์ย่อยแบบ GitHub Pages (ไฟล์นอกโฟลเดอร์ย่อย = 404)
const BASE_PATH = process.env.BASE_PATH || '';
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (BASE_PATH) {
    if (!url.pathname.startsWith(BASE_PATH + '/') && url.pathname !== BASE_PATH) { res.writeHead(404); res.end('outside base path: ' + url.pathname); return; }
    url.pathname = url.pathname.slice(BASE_PATH.length) || '/';
  }
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
  if (url.pathname === '/__aimode') { aiMode = url.searchParams.get('m') || ''; gas.props.GEMINI_API_KEY = aiMode ? 'mock-key' : ''; res.end('ok'); return; }
  if (url.pathname === '/__aicalls') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(gas.ai.calls.map((c) => ({ url: c.url, hasImage: JSON.stringify(c.body).includes('inline_data'), text: JSON.stringify(c.body).slice(0, 4000) })))); return; }
  if (url.pathname === '/__photos') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ rows: gas.ss.getSheetByName('Photos').data, files: [...gas.drive.files.values()].map((f) => ({ id: f.id, trashed: f.trashed, bytes: f.blob.bytes.length, name: f.blob.name })) })); return; }
  if (url.pathname === '/__sheet') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(gas.ss.getSheetByName('Logs').data)); return; }
  let p = path.join(root, decodeURIComponent(url.pathname));
  if (!p.startsWith(root)) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(port, () => console.log(`http://localhost:${port}  key=${key}`));
