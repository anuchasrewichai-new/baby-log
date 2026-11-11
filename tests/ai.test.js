import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGas } from './gas-stub.js';

const IMG = Buffer.from('jpeg').toString('base64');
const gem = (obj) => ({ body: { candidates: [{ content: { parts: [{ text: 'thinking…', thought: true }, { text: JSON.stringify(obj) }] } }] } });
function setup(keys = { GEMINI_API_KEY: 'k-test' }) {
  const g = loadGas(); const key = g.ctx.setup();
  Object.entries(keys).forEach(([k, v]) => g.props[k] = v);
  return { ...g, key };
}
const photoRes = (scores, extra = {}) => ({ is_diaper: true, image_quality: 'good', scores, consistency: 'soft', reason_th: 'สีเหลืองมีเม็ด', ...extra });

test('ยังไม่ใส่ API key → แจ้งว่ายังไม่ได้ตั้งค่า', () => {
  const { post, key } = setup({});
  assert.equal(post({ key, action: 'aiStatus' }).enabled, false);
  assert.equal(post({ key, action: 'aiPhoto', data: IMG }).error, 'ai_not_configured');
});

test('อ่านสีปกติ มั่นใจสูง → ok และแนะนำสีอันดับแรก · ส่ง JSON schema และรูปถูกต้อง', () => {
  const { post, key, ai } = setup();
  ai.handler = () => gem(photoRes([{ id: 's06', p: 0.82 }, { id: 's07', p: 0.11 }, { id: 's03', p: 0.04 }, { id: 'zz', p: 0.5 }]));
  const r = post({ key, action: 'aiPhoto', kind: 'poop', data: 'data:image/jpeg;base64,' + IMG, dol: 9 });
  assert.equal(r.verdict, 'ok'); assert.equal(r.top.id, 's06');
  assert.ok(r.paleProb < 0.15);
  const body = ai.calls[0].body;
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.ok(body.generationConfig.responseJsonSchema.properties.scores);
  assert.equal(body.contents[0].parts[1].inline_data.data, IMG);
  assert.equal(ai.calls[0].opts.headers['x-goog-api-key'], 'k-test');
  assert.ok(!('temperature' in body.generationConfig));
});

test('กติกา: กลุ่มสีซีดรวม ≥15% → เตือนพบแพทย์ แม้สีอันดับแรกเป็นเหลือง', () => {
  const { post, key, ai } = setup();
  ai.handler = () => gem(photoRes([{ id: 's06', p: 0.8 }, { id: 's03', p: 0.1 }, { id: 's02', p: 0.06 }, { id: 's07', p: 0.04 }]));
  const r = post({ key, action: 'aiPhoto', kind: 'poop', data: IMG });
  assert.equal(r.verdict, 'pale_alert'); assert.equal(r.paleProb, 0.16);
});

test('กติกา: สีซีดชนะแม้รูปไม่ชัด / รูปไม่ชัดอย่างเดียว → ถ่ายใหม่ / มั่นใจต่ำ → ไม่แน่ใจ', () => {
  const { post, key, ai } = setup();
  ai.handler = () => gem(photoRes([{ id: 's02', p: 0.5 }, { id: 's06', p: 0.5 }], { image_quality: 'poor' }));
  assert.equal(post({ key, action: 'aiPhoto', data: IMG }).verdict, 'pale_alert');
  ai.handler = () => gem(photoRes([{ id: 's06', p: 0.9 }], { image_quality: 'poor' }));
  assert.equal(post({ key, action: 'aiPhoto', data: IMG }).verdict, 'retake');
  ai.handler = () => gem(photoRes([{ id: 's06', p: 0.9 }], { is_diaper: false }));
  assert.equal(post({ key, action: 'aiPhoto', data: IMG }).verdict, 'retake');
  ai.handler = () => gem(photoRes([{ id: 's06', p: 0.5 }, { id: 's07', p: 0.5 }]));
  assert.equal(post({ key, action: 'aiPhoto', data: IMG }).verdict, 'uncertain');
});

test('ปัสสาวะไม่มีเกณฑ์สีซีด', () => {
  const { post, key, ai } = setup();
  ai.handler = () => gem(photoRes([{ id: 'u2', p: 0.9 }, { id: 's02', p: 0.1 }]));
  const r = post({ key, action: 'aiPhoto', kind: 'pee', data: IMG });
  assert.equal(r.verdict, 'ok'); assert.equal(r.top.id, 'u2'); assert.equal(r.paleProb, 0);
});

test('โมเดลแรกไม่มี (404) → ลองตัวถัดไป และจำตัวที่ใช้ได้', () => {
  const { post, key, ai, props } = setup();
  ai.handler = (url) => (url.includes('gemini-3.8-flash') ? { code: 404, body: '{"error":{"message":"not found"}}' } : gem(photoRes([{ id: 's06', p: 1 }])));
  assert.equal(post({ key, action: 'aiPhoto', data: IMG }).model, 'gemini-3.6-flash');
  assert.equal(props.AI_MODEL_OK, 'gemini-3.6-flash');
});

test('key ผิด / โควตาหมด', () => {
  const { post, key, ai, props } = setup();
  ai.handler = () => ({ code: 403, body: '{}' });
  assert.equal(post({ key, action: 'aiPhoto', data: IMG }).error, 'ai_bad_key');
  props.AI_DAILY_LIMIT = '2';
  ai.handler = () => gem(photoRes([{ id: 's06', p: 1 }]));
  assert.equal(post({ key, action: 'aiPhoto', data: IMG }).ok, true);
  assert.equal(post({ key, action: 'aiPhoto', data: IMG }).ok, true);
  const r = post({ key, action: 'aiPhoto', data: IMG });
  assert.equal(r.error, 'ai_quota', 'ครั้งที่ 3 เกินโควตา 2 ครั้ง (ครั้งที่ key ผิดไม่นับ)');
  assert.equal(post({ key, action: 'aiStatus' }).usedToday, 2);
});

test('ถาม-ตอบ: คำถามมีอาการอันตราย → ตอบให้ไปโรงพยาบาลทันที โดยไม่เรียก AI', () => {
  const { post, key, ai } = setup();
  const r = post({ key, action: 'aiText', task: 'ask', question: 'ลูกหายใจเร็วและตัวเขียวนิดหน่อย ทำยังไงดี', context: {} });
  assert.equal(r.urgent, true); assert.match(r.answer, /1669/); assert.equal(ai.calls.length, 0);
});

test('สรุปแนวโน้ม: ไม่ส่งชื่อลูก และถ้าระบบมีคำเตือนระดับ ≥2 ต้องแนะนำพบแพทย์เสมอ', () => {
  const { post, key, ai } = setup();
  ai.handler = () => gem({ summary_th: 'ทุกอย่างดี', watch_points: [], suggest_doctor: false });
  const r = post({ key, action: 'aiText', task: 'trend', context: { babyName: 'น้องลับ', days: [{ date: '2026-11-10', msgs: [{ level: 2, text: 'ฉี่น้อย' }] }] } });
  assert.equal(r.suggestDoctor, true); assert.ok(r.forcedNote);
  assert.ok(!JSON.stringify(ai.calls[0].body).includes('น้องลับ'));
});

test('ผู้ให้บริการ Claude', () => {
  const { post, key, ai } = setup({ ANTHROPIC_API_KEY: 'sk-ant', AI_PROVIDER: 'claude' });
  ai.handler = () => ({ body: { content: [{ type: 'text', text: 'นี่คือผล: ' + JSON.stringify(photoRes([{ id: 's06', p: 0.9 }, { id: 's07', p: 0.1 }])) }] } });
  const r = post({ key, action: 'aiPhoto', data: IMG });
  assert.equal(r.verdict, 'ok'); assert.ok(ai.calls[0].url.includes('anthropic.com'));
  assert.equal(ai.calls[0].opts.headers['x-api-key'], 'sk-ant');
  assert.ok(ai.calls[0].body.messages[0].content.some((c) => c.type === 'image' && c.source.data === IMG));
});
