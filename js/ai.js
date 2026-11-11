// ai.js — AI ช่วยประเมิน (เรียกผ่าน Apps Script เท่านั้น ไม่มี API key อยู่ในมือถือ)
import { db } from './db.js';
import * as Sync from './sync.js';
import * as R from './rules.js';

export const DISCLAIMER = 'AI ช่วยคัดกรองเท่านั้น ไม่ใช่การวินิจฉัยทางการแพทย์';
export const PALE_ALERT = 0.15;
const DANGER_WORDS = ['ชัก', 'หายใจลำบาก', 'หายใจเร็ว', 'หอบ', 'ตัวเขียว', 'ปากเขียว', 'ริมฝีปากเขียว', 'ปลุกไม่ตื่น', 'ปลุกยาก', 'ซึมมาก',
  'ไม่ดูดนม', 'ไม่ยอมกินนม', 'อาเจียนพุ่ง', 'อาเจียนสีเขียว', 'อ้วกสีเขียว', 'กระหม่อมบุ๋ม', 'ไม่หายใจ', 'หยุดหายใจ', 'ตัวอ่อนปวกเปียก', 'ตกจาก', 'หัวฟาด'];
export const DANGER_ANSWER = 'อาการนี้อาจเป็นภาวะฉุกเฉิน — พาลูกไปโรงพยาบาลทันที หรือโทร 1669 ไม่ต้องรอดูอาการ';

/** ตรวจคำอันตรายในเครื่องก่อน (ตอบได้แม้ออฟไลน์ ไม่ต้องรอ AI) */
export function dangerCheck(text) {
  const t = String(text || '');
  if (DANGER_WORDS.some((w) => t.includes(w))) return true;
  const m = t.match(/(3[89]|4[0-2])(?:[.,]\d)?\s*(?:°|องศา|c\b|C\b)/);
  return !!(m && (t.includes('ไข้') || t.includes('อุณหภูมิ') || t.includes('ตัวร้อน')));
}

const ERR = {
  ai_not_configured: 'ยังไม่ได้ใส่ API key ใน Apps Script (ดูวิธีใน README หัวข้อ Phase 5)',
  ai_quota: 'ใช้ AI ครบโควตาของวันนี้แล้ว (ปรับได้ที่ AI_DAILY_LIMIT)',
  photo_too_large: 'รูปใหญ่เกินไป'
};
function errMsg(res) { return res.message || ERR[res.error] || 'เรียก AI ไม่สำเร็จ'; }

export async function prefs() { return db.get('aiPrefs', { enabled: false, consent: false }); }
export async function setPrefs(p) { await db.set('aiPrefs', p); }

export async function status() {
  try { return await Sync.api('aiStatus', {}, 15000); } catch (e) { return { ok: false, message: e.message }; }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(String(fr.result)); fr.onerror = () => reject(fr.error); fr.readAsDataURL(blob); });
}

export async function analyzePhoto(blob, kind, dol) {
  const res = await Sync.api('aiPhoto', { data: await blobToBase64(blob), mime: blob.type || 'image/jpeg', kind, dol }, 90000);
  if (!res.ok) throw new Error(errMsg(res));
  return res;
}

/** ข้อมูลที่ส่งให้ AI: ตัวเลขรายวัน + คำเตือนของแอป · ไม่มีชื่อลูก */
export function buildContext(records, settings, now = Date.now(), nDays = 7) {
  const s = R.summarize(records, settings, now, nDays);
  const colorName = (id) => (R.STOOL_COLORS.find((c) => c.id === id) || {}).short || id;
  return {
    ageDays: s.dolToday ? s.dolToday - 1 : null,
    gestationWeeks: settings.gestationWeeks || null,
    feedingType: settings.feedingType,
    birthWeightKg: settings.birthWeightKg || null,
    latestWeightKg: s.weight.latest ? Number(s.weight.latest.amount) : null,
    weightChangePct: s.weight.lossPct !== null ? -s.weight.lossPct : null,
    days: s.days.map((d) => ({
      date: d.date, dayOfLife: d.dol, partialDay: d.isToday,
      pee: d.wet, peeMin: d.expWet, poop: d.stool, poopMin: d.expStool,
      poopColors: Object.fromEntries(Object.entries(d.colors).map(([k, v]) => [colorName(k), v])),
      feeds: d.feeds, bottleMl: d.bottleMl, breastMin: d.breastMin,
      maxTempC: d.maxTemp, jaundiceZone: d.maxZone, sleepHours: d.sleepMin ? Math.round(d.sleepMin / 6) / 10 : null,
      level: d.level, msgs: d.msgs.filter((m) => m.level > 0).map((m) => ({ level: m.level, text: m.text }))
    })),
    alerts: s.overall.msgs.filter((m) => m.level > 0).map((m) => ({ level: m.level, text: m.text }))
  };
}

async function text(task, body, timeout = 60000) {
  const res = await Sync.api('aiText', { task, ...body }, timeout);
  if (!res.ok) throw new Error(errMsg(res));
  return res;
}

export async function trend(records, settings, { force = false } = {}) {
  const today = R.localDate(Date.now());
  const cached = await db.get('aiTrend');
  if (!force && cached && cached.date === today) return cached;
  const res = await text('trend', { context: buildContext(records, settings) });
  const out = { date: today, at: Date.now(), res };
  await db.set('aiTrend', out);
  return out;
}
export async function cachedTrend() { return db.get('aiTrend'); }

export async function reportSummary(records, settings, nDays) {
  const res = await text('report', { context: buildContext(records, settings, Date.now(), nDays) });
  const out = { at: Date.now(), nDays, res };
  await db.set('aiReport', out);
  return out;
}
export async function cachedReport() { return db.get('aiReport'); }

export async function ask(question, history, records, settings) {
  if (dangerCheck(question)) return { ok: true, urgent: true, answer: DANGER_ANSWER, local: true };
  return text('ask', { question, history, context: buildContext(records, settings) });
}
