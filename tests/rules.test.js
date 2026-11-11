import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../js/rules.js';

const S = { babyName: 'ทดสอบ', birthDate: '2026-11-03', birthWeightKg: 3.35, feedingType: 'breast', gestationWeeks: 39, feedIntervalH: 3, peeAlertH: 6 };
const at = (date, hh = 10, mm = 0) => new Date(`${date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`).getTime();
let n = 0;
const rec = (type, date, hh, extra = {}) => ({ id: 'r' + (++n), type, ts: at(date, hh), ...extra });
function fullDay(date, { pee = 6, poop = 3, feeds = 9, color = 's06', urine = 'u2' } = {}) {
  const out = [];
  for (let i = 0; i < pee; i++) out.push(rec('pee', date, 1 + i * 3, { color: urine }));
  for (let i = 0; i < poop; i++) out.push(rec('poop', date, 2 + i * 4, { color, consistency: 'soft' }));
  for (let i = 0; i < feeds; i++) out.push(rec('feed', date, i * 2.5 | 0, { method: 'breast', durL: 10, durR: 8 }));
  return out;
}
const day = (sum, date) => sum.days.find((d) => d.date === date);

test('วันที่ของชีวิต: วันเกิดคือวันที่ 1', () => {
  assert.equal(R.dayOfLife('2026-11-03', '2026-11-03'), 1);
  assert.equal(R.dayOfLife('2026-11-03', '2026-11-11'), 9);
  assert.equal(R.dayOfLife('2026-11-03', '2026-11-02'), null);
  assert.equal(R.dayOfLife('', '2026-11-02'), null);
});

test('จำนวนฉี่/อึขั้นต่ำตามอายุ', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 9].map(R.expectedWet), [1, 2, 3, 4, 5, 6, 6]);
  assert.deepEqual([1, 2, 3, 10, 43].map((d) => R.expectedStool(d, 'breast')), [1, 2, 3, 3, 0]);
  assert.equal(R.expectedStool(10, 'formula'), 1);
});

test('ปริมาณนม: สัปดาห์แรกตามตาราง หลังจากนั้น 150–180 มล./กก.', () => {
  const g3 = R.feedGuide(3, 3.2, 'formula');
  assert.deepEqual([g3.perFeedMin, g3.perFeedMax], [22, 27]);
  const g9 = R.feedGuide(9, 3.2, 'formula');
  assert.deepEqual([g9.dailyMin, g9.dailyMax, g9.perFeedMin, g9.perFeedMax], [480, 576, 60, 72]);
  const big = R.feedGuide(60, 7, 'formula');
  assert.equal(big.dailyMax, 960, 'ไม่เกิน 960 มล./วัน');
});

test('สีซีดทั้ง 3 แบบ = พบแพทย์โดยเร็ว (ระดับ 3) ทุกอายุ', () => {
  for (const color of ['s01', 's02', 's03']) for (const dol of [1, 5, 30]) {
    assert.equal(R.evaluateStool({ color }, dol).level, 3, `${color} วันที่ ${dol}`);
  }
});

test('ขี้เทา: ปกติ ≤4, เฝ้าระวัง 5–6, พบแพทย์ ≥7', () => {
  assert.equal(R.evaluateStool({ color: 's04' }, 3).level, 0);
  assert.equal(R.evaluateStool({ color: 's04' }, 5).level, 1);
  assert.equal(R.evaluateStool({ color: 's04' }, 7).level, 2);
});

test('สีปกติ, เลือด, ดำ', () => {
  for (const c of ['s05', 's06', 's07', 's08', 's09']) assert.equal(R.evaluateStool({ color: c, consistency: 'soft' }, 9).level, 0, c);
  assert.equal(R.evaluateStool({ color: 's10' }, 9).level, 2);
  assert.equal(R.evaluateStool({ color: 's11' }, 9).level, 2);
  assert.equal(R.evaluateStool({ color: 's11' }, 2).level, 1);
});

test('ปัสสาวะ', () => {
  assert.equal(R.evaluateUrine({ color: 'u4' }, 2).level, 0, 'ผลึกส้มอิฐวันที่ 2 ปกติ');
  assert.equal(R.evaluateUrine({ color: 'u4' }, 5).level, 1);
  assert.equal(R.evaluateUrine({ color: 'u3' }, 5).level, 1);
  assert.equal(R.evaluateUrine({ color: 'u5' }, 1).level, 2);
});

test('อุณหภูมิ', () => {
  assert.equal(R.evaluateTemp({ tempC: 38.0 }, 10).level, 3);
  assert.equal(R.evaluateTemp({ tempC: 38.2 }, 120).level, 2);
  assert.equal(R.evaluateTemp({ tempC: 37.7 }, 10).level, 1);
  assert.equal(R.evaluateTemp({ tempC: 36.8 }, 10).level, 0);
  assert.equal(R.evaluateTemp({ tempC: 36.2 }, 10).level, 1);
  assert.equal(R.evaluateTemp({ tempC: 35.8 }, 10).level, 2);
});

test('ตัวเหลือง', () => {
  assert.equal(R.evaluateJaundice({ ts: at('2026-11-03', 20), zone: 1 }, '2026-11-03', 39).level, 3, 'ภายในวันแรก');
  assert.equal(R.evaluateJaundice({ ts: at('2026-11-06'), zone: 2 }, '2026-11-03', 39).level, 1);
  assert.equal(R.evaluateJaundice({ ts: at('2026-11-06'), zone: 3 }, '2026-11-03', 39).level, 2);
  assert.equal(R.evaluateJaundice({ ts: at('2026-11-06'), zone: 4 }, '2026-11-03', 39).level, 3);
  assert.equal(R.evaluateJaundice({ ts: at('2026-11-20'), zone: 1 }, '2026-11-03', 39).level, 2, 'เกิน 14 วัน');
  assert.equal(R.evaluateJaundice({ ts: at('2026-11-20'), zone: 1 }, '2026-11-03', 35).level, 1, 'ก่อนกำหนด ใช้ 21 วัน');
  assert.equal(R.evaluateJaundice({ ts: at('2026-11-06'), zone: 1 }, '2026-11-03', 39, true).level, 3, 'ร่วมกับอึซีด');
  assert.equal(R.evaluateJaundice({ ts: at('2026-11-06'), zone: 0 }, '2026-11-03', 39).level, 0);
});

test('วันที่ครบเกณฑ์ = ปกติ', () => {
  const recs = fullDay('2026-11-10');
  const s = R.summarize(recs, S, at('2026-11-11', 9), 7);
  assert.equal(day(s, '2026-11-10').level, 0);
  assert.equal(day(s, '2026-11-09').level, null, 'วันไม่มีบันทึก');
});

test('ฉี่น้อยวันที่ 9 (3 ครั้ง) = ควรปรึกษาแพทย์', () => {
  const recs = fullDay('2026-11-11', { pee: 3 });
  const s = R.summarize(recs, S, at('2026-11-12', 9), 7);
  assert.equal(day(s, '2026-11-11').level, 2);
});

test('ฉี่ 5 ครั้งวันที่ 9 = เฝ้าระวัง', () => {
  const s = R.summarize(fullDay('2026-11-11', { pee: 5 }), S, at('2026-11-12', 9), 7);
  assert.equal(day(s, '2026-11-11').level, 1);
});

test('วันนี้ยังไม่ครบวัน: ไม่เตือนเรื่องจำนวน แต่เตือนสีซีดทันที', () => {
  const recs = [rec('pee', '2026-11-11', 8, { color: 'u2' }), rec('feed', '2026-11-11', 8, { method: 'breast' })];
  let s = R.summarize(recs, S, at('2026-11-11', 9), 7);
  assert.equal(day(s, '2026-11-11').level, 0);
  recs.push(rec('poop', '2026-11-11', 9, { color: 's02' }));
  s = R.summarize(recs, S, at('2026-11-11', 9, 30), 7);
  assert.equal(day(s, '2026-11-11').level, 3);
  assert.equal(s.overall.level, 3);
});

test('ไม่มีฉี่ 8 ชม. ขณะยังบันทึกอย่างอื่นอยู่ = ระดับ 2', () => {
  const recs = [rec('pee', '2026-11-11', 1, { color: 'u2' }), rec('feed', '2026-11-11', 8, { method: 'breast' })];
  const s = R.summarize(recs, S, at('2026-11-11', 9, 30), 7);
  assert.equal(s.overall.level, 2);
});

test('ไม่ส่งเสียงเตือนฉี่ เมื่อแอปไม่ได้ใช้นาน (ข้อมูลเก่า)', () => {
  const recs = [rec('pee', '2026-11-05', 1, { color: 'u2' })];
  const s = R.summarize(recs, S, at('2026-11-11', 9), 7);
  assert.ok(!s.overall.msgs.some((m) => m.text.includes('ไม่มีบันทึกปัสสาวะมา')));
});

test('น้ำหนักลดเกิน 10% = ระดับ 2, 7–10% = ระดับ 1, ยังไม่คืนน้ำหนักวันที่ 14 = ระดับ 1', () => {
  assert.equal(R.evaluateWeight(S, [{ ts: at('2026-11-06'), amount: 2.98, type: 'weight' }]).level, 2);
  assert.equal(R.evaluateWeight(S, [{ ts: at('2026-11-06'), amount: 3.1, type: 'weight' }]).level, 1);
  assert.equal(R.evaluateWeight(S, [{ ts: at('2026-11-06'), amount: 3.2, type: 'weight' }]).level, 0);
  assert.equal(R.evaluateWeight(S, [{ ts: at('2026-11-17'), amount: 3.3, type: 'weight' }]).level, 1);
});

test('นมผสมน้อยกว่าแนวทาง = เฝ้าระวัง', () => {
  const F = { ...S, feedingType: 'formula' };
  const recs = fullDay('2026-11-11', { poop: 1 }).filter((r) => r.type !== 'feed');
  for (let i = 0; i < 8; i++) recs.push(rec('feed', '2026-11-11', i * 3, { method: 'formula', amount: 40 }));
  recs.push(rec('weight', '2026-11-11', 9, { amount: 3.2 }));
  const s = R.summarize(recs, F, at('2026-11-12', 9), 7);
  const d = day(s, '2026-11-11');
  assert.equal(d.bottleMl, 320);
  assert.equal(d.level, 1);
  assert.ok(d.msgs.some((m) => m.text.includes('ต่ำกว่าแนวทาง')));
});

test('รายการที่ถูกลบไม่ถูกนับ', () => {
  const recs = fullDay('2026-11-10');
  recs.push(rec('poop', '2026-11-10', 22, { color: 's01', deleted: true }));
  const s = R.summarize(recs, S, at('2026-11-11', 9), 7);
  assert.equal(day(s, '2026-11-10').level, 0);
});

test('เวลามื้อนมถัดไป', () => {
  const recs = [rec('feed', '2026-11-11', 8, { method: 'breast' })];
  const s = R.summarize(recs, S, at('2026-11-11', 9), 7);
  assert.equal(s.nextFeedAt, at('2026-11-11', 11));
});

/* ---------- Phase 3 ---------- */
test('การนอน: นอนเกิน 4 ชม. ใน 2 สัปดาห์แรก = เฝ้าระวัง', () => {
  const r = { ts: at('2026-11-10', 1), endTs: at('2026-11-10', 6) };
  assert.equal(R.evaluateSleep(r, 8, null).level, 1);
  assert.equal(R.evaluateSleep(r, 20, true).level, 0, 'อายุ 20 วัน น้ำหนักคืนแล้ว');
  assert.equal(R.evaluateSleep(r, 20, false).level, 1, 'อายุ 20 วัน ยังไม่คืนน้ำหนัก');
  assert.equal(R.evaluateSleep({ ts: at('2026-11-10', 1), endTs: at('2026-11-10', 4) }, 8, null).level, 0);
});

test('สรุปรายวันรวมไข้และตัวเหลือง แม้วันนั้นบันทึกแค่อุณหภูมิ', () => {
  const recs = [rec('temp', '2026-11-11', 8, { tempC: 38.3, tempSite: 'axilla' })];
  const s = R.summarize(recs, S, at('2026-11-11', 9), 7);
  assert.equal(day(s, '2026-11-11').level, 3);
  assert.equal(day(s, '2026-11-11').maxTemp, 38.3);
  const recs2 = [...fullDay('2026-11-10'), rec('jaundice', '2026-11-10', 9, { zone: 3 })];
  const s2 = R.summarize(recs2, S, at('2026-11-11', 9), 7);
  assert.equal(day(s2, '2026-11-10').level, 2);
  assert.equal(day(s2, '2026-11-10').maxZone, 3);
});

test('แจ้งเตือน: ถึงเวลาให้นม / เลย 30 นาที / ไม่เตือนขณะกำลังให้นม', () => {
  const recs = [rec('feed', '2026-11-11', 6, { method: 'breast' })];
  assert.equal(R.activeAlerts(recs, S, at('2026-11-11', 8, 59)).length, 0);
  let a = R.activeAlerts(recs, S, at('2026-11-11', 9, 5));
  assert.equal(a[0].key.startsWith('feed:'), true);
  a = R.activeAlerts(recs, S, at('2026-11-11', 9, 31));
  assert.equal(a[0].key.startsWith('feed2:'), true);
  const feedTimer = { L: { acc: 0, runFrom: at('2026-11-11', 9) }, R: { acc: 0, runFrom: null } };
  assert.equal(R.activeAlerts(recs, S, at('2026-11-11', 9, 31), { feedTimer }).length, 0);
});

test('แจ้งเตือน: ไม่มีฉี่ 6 และ 8 ชม.', () => {
  const recs = [rec('pee', '2026-11-11', 1, { color: 'u2' }), rec('feed', '2026-11-11', 7, { method: 'breast' })];
  const k = (h, m = 0) => R.activeAlerts(recs, S, at('2026-11-11', h, m)).map((x) => x.key.split(':')[0]);
  assert.deepEqual(k(6, 30), []);
  assert.ok(k(7, 5).includes('pee'));
  assert.ok(k(9, 5).includes('pee8'));
});

test('แจ้งเตือน: ไข้ทันที / วัดซ้ำหลัง 20 นาทีเมื่อค่ากึ่งสูง / นอนนาน', () => {
  const fever = [rec('temp', '2026-11-11', 9, { tempC: 38.1 })];
  assert.equal(R.activeAlerts(fever, S, at('2026-11-11', 9, 1))[0].level, 3);
  const warm = [rec('temp', '2026-11-11', 9, { tempC: 37.7 })];
  assert.equal(R.activeAlerts(warm, S, at('2026-11-11', 9, 10)).length, 0);
  assert.equal(R.activeAlerts(warm, S, at('2026-11-11', 9, 25))[0].key.startsWith('retemp:'), true);
  const sleepTimer = { startTs: at('2026-11-11', 4) };
  assert.ok(R.activeAlerts([], S, at('2026-11-11', 8, 30), { sleepTimer }).some((x) => x.key.startsWith('sleep:')));
});

test('Phase 5: ผล AI สีซีด ≥15% ทำให้รายการอึสีเหลืองกลายเป็นระดับ 3 (เลือกระดับที่รุนแรงกว่า)', () => {
  assert.equal(R.evaluateStool({ color: 's06', aiPale: 0.16 }, 9).level, 3);
  assert.equal(R.evaluateStool({ color: 's06', aiPale: 0.1 }, 9).level, 0);
});
