// rules.js — เกณฑ์ประเมินทั้งหมดของแอป (ไม่มีการเรียกเครือข่าย ใช้ได้ทั้งในเบราว์เซอร์และ Node)
// หมายเหตุ: เป็นแนวทางทั่วไปเพื่อช่วยสังเกต ไม่ใช่การวินิจฉัยทางการแพทย์

export const LEVEL = { NONE: null, OK: 0, WATCH: 1, DOCTOR: 2, URGENT: 3 };
export const LEVEL_LABEL = { 0: 'ปกติ', 1: 'เฝ้าระวัง', 2: 'ควรปรึกษาแพทย์', 3: 'พบแพทย์โดยเร็ว' };

export const STOOL_COLORS = [
  { id: 's04', label: 'ขี้เทา ดำอมเขียว', short: 'ขี้เทา', hex: '#2A3020', img: 'stool-04-meconium.jpg' },
  { id: 's05', label: 'เปลี่ยนผ่าน เขียวน้ำตาล', short: 'เปลี่ยนผ่าน', hex: '#5E5A2C', img: 'stool-05-transitional.jpg' },
  { id: 's06', label: 'เหลืองมัสตาร์ด มีเม็ด', short: 'เหลือง', hex: '#D69E24', img: 'stool-06-mustard.jpg' },
  { id: 's07', label: 'เขียว', short: 'เขียว', hex: '#6C802C', img: 'stool-07-green.jpg' },
  { id: 's08', label: 'น้ำตาล / แทน', short: 'น้ำตาล', hex: '#96683A', img: 'stool-08-brown.jpg' },
  { id: 's09', label: 'ส้ม', short: 'ส้ม', hex: '#DE7E26', img: 'stool-09-orange.jpg' },
  { id: 's03', label: 'เหลืองซีดมาก', short: 'เหลืองซีด', hex: '#ECE09E', img: 'stool-03-paleyellow.jpg', pale: true },
  { id: 's02', label: 'สีดินเหนียว / ครีม', short: 'ดินเหนียว', hex: '#CDBC96', img: 'stool-02-clay.jpg', pale: true },
  { id: 's01', label: 'ขาว / เทา', short: 'ขาว/เทา', hex: '#E2E1D8', img: 'stool-01-white.jpg', pale: true },
  { id: 's10', label: 'มีเลือดปน / แดง', short: 'มีเลือด', hex: '#B3261E', img: 'stool-10-blood.jpg' },
  { id: 's11', label: 'ดำ (ไม่ใช่ขี้เทา)', short: 'ดำ', hex: '#1E1A18', img: 'stool-11-black.jpg' }
];
export const CONSISTENCY = [
  { id: 'soft', label: 'เหลว/ครีม' },
  { id: 'thick', label: 'ข้น' },
  { id: 'watery', label: 'เป็นน้ำ', img: 'cons-watery.jpg' },
  { id: 'mucus', label: 'มีมูก', img: 'cons-mucus.jpg' },
  { id: 'hard', label: 'แข็งเป็นเม็ด', img: 'cons-hard.jpg' }
];
export const URINE_COLORS = [
  { id: 'u1', label: 'ใส / เหลืองอ่อน', img: 'urine-01-clear.jpg' },
  { id: 'u2', label: 'เหลือง', img: 'urine-02-yellow.jpg' },
  { id: 'u3', label: 'เหลืองเข้ม', img: 'urine-03-dark.jpg' },
  { id: 'u4', label: 'ผลึกส้มอิฐ', img: 'urine-04-urate.jpg' },
  { id: 'u5', label: 'แดง / ชมพู', img: 'urine-05-red.jpg' }
];
export const FEED_METHODS = { breast: 'เข้าเต้า', expressed: 'นมแม่ปั๊ม', formula: 'นมผสม' };
export const JAUNDICE_ZONES = ['ไม่เหลือง', 'หน้า/ศีรษะ', 'ถึงหน้าอก', 'ท้องใต้สะดือ/ต้นขา', 'แขน ขา', 'ฝ่ามือ ฝ่าเท้า'];
export const TEMP_SITES = { axilla: 'รักแร้', rectal: 'ทวารหนัก', ear: 'หู' };

export const DANGER_SIGNS = [
  'ไข้ 38 °C ขึ้นไป ในทารกอายุต่ำกว่า 3 เดือน',
  'ซึม ปลุกยาก หรือไม่ยอมดูดนม',
  'ตัวเหลืองภายใน 24 ชม.แรก หรือเหลืองลามถึงแขนขา ฝ่ามือฝ่าเท้า',
  'หายใจเร็ว หอบ ชายโครงบุ๋ม หรือตัว/ริมฝีปากเขียว',
  'อาเจียนพุ่ง หรืออาเจียนเป็นสีเขียว',
  'ไม่มีปัสสาวะนานเกิน 6–8 ชม. กระหม่อมบุ๋ม ปากแห้ง',
  'อุจจาระสีซีด ขาว หรือสีดินเหนียว',
  'สะดือบวมแดง มีหนอง หรือมีกลิ่นเหม็น',
  'ชัก หรือตัวอ่อนปวกเปียก'
];

const DAY_MS = 86400000;
const pad = (n) => String(n).padStart(2, '0');

/** วันที่ตามเวลาเครื่อง รูปแบบ YYYY-MM-DD */
export function localDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function dayDiff(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY_MS);
}
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
/** วันที่ของชีวิต: วันเกิด = วันที่ 1 */
export function dayOfLife(birthDate, dateStr) {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const n = dayDiff(birthDate, dateStr) + 1;
  return n >= 1 ? n : null;
}

/* ---------------- จำนวนที่คาดหวัง ---------------- */
export function expectedWet(dol) { return dol ? Math.min(dol, 6) : null; }
export function expectedStool(dol, feedingType) {
  if (!dol) return null;
  if (dol > 42) return 0;
  if (feedingType === 'formula') return 1;
  return dol <= 2 ? dol : 3;
}

/* ---------------- ปริมาณนม ---------------- */
const WEEK1 = { 1: [5, 7], 2: [10, 15], 3: [22, 27], 4: [30, 45], 5: [30, 45], 6: [45, 60], 7: [45, 60] };
export function feedGuide(dol, weightKg, feedingType) {
  const g = { feedsMin: 8, feedsMax: 12, perFeedMin: null, perFeedMax: null, dailyMin: null, dailyMax: null, basis: '' };
  if (!dol) return g;
  if (dol <= 7) {
    [g.perFeedMin, g.perFeedMax] = WEEK1[dol];
    g.dailyMin = g.perFeedMin * 8; g.dailyMax = g.perFeedMax * 10;
    g.basis = `สัปดาห์แรก กระเพาะยังเล็ก (วันที่ ${dol})`;
  } else if (weightKg > 0) {
    g.dailyMin = Math.round(Math.min(150 * weightKg, 960));
    g.dailyMax = Math.round(Math.min(180 * weightKg, 960));
    g.perFeedMin = Math.round(g.dailyMin / 8); g.perFeedMax = Math.round(g.dailyMax / 8);
    g.basis = `150–180 มล./กก./วัน × ${weightKg} กก. (แบ่ง 8 มื้อ)`;
  } else {
    const t = dol <= 30 ? [60, 90] : dol <= 60 ? [90, 120] : [120, 180];
    [g.perFeedMin, g.perFeedMax] = t;
    g.dailyMin = t[0] * 7; g.dailyMax = Math.min(t[1] * 8, 960);
    g.basis = 'ประมาณตามอายุ (ใส่น้ำหนักเพื่อคำนวณแม่นขึ้น)';
  }
  if (feedingType === 'breast') g.basis += ' · ใช้อ้างอิงเมื่อให้นมแม่ทางขวด';
  return g;
}

/* ---------------- ตัวช่วยสะสมข้อความ ---------------- */
function collector() {
  const out = { level: 0, msgs: [] }; const seen = new Set();
  out.add = (level, text) => {
    if (seen.has(text)) return;
    seen.add(text); out.level = Math.max(out.level, level); out.msgs.push({ level, text });
  };
  return out;
}
const clean = (c) => ({ level: c.level, msgs: c.msgs.sort((a, b) => b.level - a.level) });

/* ---------------- รายการเดี่ยว ---------------- */
export function evaluateStool(rec, dol) {
  const c = collector();
  switch (rec.color) {
    case 's01': case 's02': case 's03':
      c.add(3, 'อุจจาระสีซีด/ขาว/เทา/สีดินเหนียว อาจเป็นสัญญาณโรคท่อน้ำดีตีบตัน — พบแพทย์ภายใน 24 ชม. นำรูปหรือผ้าอ้อมไปด้วย'); break;
    case 's10':
      c.add(2, 'อุจจาระมีเลือดปนหรือสีแดง ควรพบแพทย์ (บางครั้งเป็นเลือดจากหัวนมแม่ที่แตก แต่ต้องให้แพทย์ประเมิน)'); break;
    case 's11':
      if (dol && dol <= 3) c.add(1, 'อุจจาระสีดำ: ถ้าเหนียวดำอมเขียวในช่วง 1–3 วันแรก คือขี้เทาซึ่งปกติ (เลือกภาพขี้เทาแทน)');
      else c.add(2, 'อุจจาระสีดำหลังพ้นช่วงขี้เทา อาจมีเลือดออกในทางเดินอาหาร (ยกเว้นได้ยาธาตุเหล็ก) ควรพบแพทย์');
      break;
    case 's04':
      if (dol >= 7) c.add(2, `ยังถ่ายขี้เทาในวันที่ ${dol} อาจได้รับนมไม่พอ ควรพบแพทย์`);
      else if (dol >= 5) c.add(1, `ยังถ่ายขี้เทาในวันที่ ${dol} อาจได้รับนมไม่พอ ควรปรึกษาพยาบาลนมแม่/แพทย์`);
      break;
  }
  if (Number(rec.aiPale) >= 0.15) c.add(3, `AI พบโอกาสเป็นสีซีด ${Math.round(rec.aiPale * 100)}% — พบแพทย์ภายใน 24 ชม. และนำรูปไปให้แพทย์ดู`);
  if (rec.consistency === 'hard') c.add(1, 'อุจจาระแข็งเป็นเม็ด อาจท้องผูก ถ้าเบ่งแล้วร้องมากหรือไม่ถ่ายหลายวัน ควรปรึกษาแพทย์');
  if (rec.consistency === 'mucus') c.add(1, 'อุจจาระมีมูก สังเกตว่ามีไข้ ซึม ถ่ายบ่อยขึ้น หรือมีเลือดปนหรือไม่');
  if (rec.consistency === 'watery') c.add(1, 'ถ่ายเป็นน้ำ: เฝ้าระวังภาวะขาดน้ำ ถ้าถ่ายบ่อยขึ้น ฉี่น้อยลง ซึม หรือมีไข้ ควรพบแพทย์');
  return clean(c);
}

export function evaluateUrine(rec, dol) {
  const c = collector();
  if (rec.color === 'u5') c.add(2, 'ปัสสาวะสีแดง/ชมพู ควรพบแพทย์ (เด็กหญิงสัปดาห์แรกอาจมีเลือดจากช่องคลอดเล็กน้อยจากฮอร์โมนแม่ แต่ควรให้แพทย์ประเมิน)');
  if (rec.color === 'u3' && dol > 3) c.add(1, 'ปัสสาวะสีเข้ม อาจได้นมไม่พอ ลองให้นมถี่ขึ้น');
  if (rec.color === 'u4' && dol > 3) c.add(1, 'พบผลึกสีส้มอิฐหลังวันที่ 3 อาจบ่งว่าได้นมไม่พอ');
  return clean(c);
}

export function evaluateTemp(rec, ageDays) {
  const c = collector(); const t = Number(rec.tempC);
  if (!isFinite(t)) return clean(c);
  if (t >= 38.0) {
    if (ageDays == null || ageDays < 90) c.add(3, `ไข้ ${t.toFixed(1)} °C ในทารกอายุต่ำกว่า 3 เดือน — พบแพทย์ทันที`);
    else c.add(2, `ไข้ ${t.toFixed(1)} °C ควรปรึกษาแพทย์`);
  } else if (t >= 37.6) c.add(1, `${t.toFixed(1)} °C ค่อนข้างสูง ถอดเสื้อผ้าที่หนาออก แล้ววัดซ้ำใน 15–30 นาที`);
  else if (t < 36.0) c.add(2, `${t.toFixed(1)} °C ตัวเย็นเกินไป ห่มให้อบอุ่นและควรพบแพทย์`);
  else if (t < 36.5) c.add(1, `${t.toFixed(1)} °C ต่ำเล็กน้อย ห่มผ้าให้อบอุ่นแล้ววัดซ้ำ`);
  return clean(c);
}

export function evaluateJaundice(rec, birthDate, gestationWeeks, recentPale) {
  const c = collector(); const z = Number(rec.zone) || 0;
  if (z <= 0) return clean(c);
  const dol = dayOfLife(birthDate, localDate(rec.ts));
  if (dol === 1) c.add(3, 'ตัวเหลืองภายใน 24 ชม.แรกหลังคลอด — พบแพทย์โดยเร็ว');
  if (z >= 4) c.add(3, `ตัวเหลืองลามถึง${JAUNDICE_ZONES[z]} — พบแพทย์โดยเร็ว`);
  else if (z === 3) c.add(2, 'ตัวเหลืองลามถึงท้องใต้สะดือ/ต้นขา ควรพบแพทย์ภายในวันนี้');
  else c.add(1, `ตัวเหลืองระดับ${JAUNDICE_ZONES[z]} เฝ้าดู ถ้าลามลงมาเรื่อย ๆ ให้ปรึกษาแพทย์`);
  const limit = gestationWeeks && gestationWeeks < 37 ? 21 : 14;
  if (dol && dol > limit) c.add(2, `ยังตัวเหลืองหลัง ${limit} วัน ควรพบแพทย์`);
  if (recentPale) c.add(3, 'ตัวเหลืองร่วมกับอุจจาระสีซีด — พบแพทย์โดยเร็ว');
  return clean(c);
}

/** ช่วงที่ควรปลุกให้นม: 2 สัปดาห์แรก หรือยังไม่กลับถึงน้ำหนักแรกเกิด (ไม่เกิน 4 สัปดาห์) */
export function needsWakeForFeeds(dol, weightRegained) {
  if (!dol) return false;
  return dol <= 14 || (dol <= 28 && weightRegained === false);
}
export function evaluateSleep(rec, dol, weightRegained) {
  const c = collector();
  if (!(rec.endTs > rec.ts)) return clean(c);
  const h = (rec.endTs - rec.ts) / 3600000;
  if (h > 4 && needsWakeForFeeds(dol, weightRegained)) c.add(1, `นอนต่อเนื่อง ${h.toFixed(1)} ชม. ช่วงแรกเกิดควรปลุกให้นมทุก 3–4 ชม.`);
  return clean(c);
}

/* ---------------- รายวัน ---------------- */
export function aggregateDay(recs) {
  const a = { total: 0, wet: 0, stool: 0, feeds: 0, bottleMl: 0, breastMin: 0, sleepMin: 0, pees: [], poops: [], colors: {}, temps: [], jaundice: [], sleeps: [], maxTemp: null, maxZone: null };
  for (const r of recs) {
    if (r.deleted) continue;
    if (['pee', 'poop', 'feed'].includes(r.type)) a.total++;
    if (r.type === 'pee') { a.wet++; a.pees.push(r); }
    else if (r.type === 'poop') { a.stool++; a.poops.push(r); a.colors[r.color || 'x'] = (a.colors[r.color || 'x'] || 0) + 1; }
    else if (r.type === 'feed') {
      a.feeds++;
      if (r.method !== 'breast' && r.amount > 0) a.bottleMl += Number(r.amount);
      if (r.method === 'breast') a.breastMin += (Number(r.durL) || 0) + (Number(r.durR) || 0);
    } else if (r.type === 'temp') { a.temps.push(r); if (a.maxTemp === null || Number(r.tempC) > a.maxTemp) a.maxTemp = Number(r.tempC); }
    else if (r.type === 'jaundice') { a.jaundice.push(r); if (a.maxZone === null || Number(r.zone) > a.maxZone) a.maxZone = Number(r.zone); }
    else if (r.type === 'sleep' && r.endTs > r.ts) { a.sleeps.push(r); a.sleepMin += (r.endTs - r.ts) / 60000; }
  }
  a.other = a.temps.length + a.jaundice.length + a.sleeps.length;
  a.bottleMl = Math.round(a.bottleMl); a.breastMin = Math.round(a.breastMin); a.sleepMin = Math.round(a.sleepMin);
  return a;
}

/**
 * ประเมินหนึ่งวัน
 * partial = วันนี้ (ยังไม่ครบ 24 ชม.) → ไม่ประเมินจำนวน ประเมินแค่สี/ลักษณะ
 */
export function evaluateDay(a, dol, settings, guide, partial, ctx = {}) {
  const c = collector();
  const ft = settings.feedingType || 'breast';
  if (a.total === 0 && !a.other) return { level: null, msgs: [{ level: null, text: 'ไม่มีบันทึก' }] };

  const ageDays = dol ? dol - 1 : null;
  for (const t of a.temps || []) evaluateTemp(t, ageDays).msgs.forEach((m) => c.add(m.level, 'อุณหภูมิ: ' + m.text));
  for (const j of a.jaundice || []) evaluateJaundice(j, settings.birthDate, Number(settings.gestationWeeks) || null, !!ctx.recentPale).msgs.forEach((m) => c.add(m.level, 'ตัวเหลือง: ' + m.text));
  for (const sl of a.sleeps || []) evaluateSleep(sl, dol, ctx.weightRegained).msgs.forEach((m) => c.add(m.level, m.text));
  if (a.total === 0) return clean(c);

  for (const p of a.poops) evaluateStool(p, dol).msgs.forEach((m) => c.add(m.level, m.text));
  for (const p of a.pees) evaluateUrine(p, dol).msgs.forEach((m) => c.add(m.level, m.text));
  const watery = a.poops.filter((p) => p.consistency === 'watery').length;
  if (watery >= 6) c.add(2, `ถ่ายเป็นน้ำ ${watery} ครั้งในวันเดียว เสี่ยงขาดน้ำ ควรพบแพทย์`);

  if (partial || !dol) return clean(c);

  const expW = expectedWet(dol);
  if (a.wet === 0 && dol >= 2) c.add(3, 'ไม่มีบันทึกปัสสาวะทั้งวัน (ถ้าบันทึกครบ) เสี่ยงขาดน้ำรุนแรง — พบแพทย์โดยเร็ว');
  else if (a.wet < expW) {
    if (dol >= 5 && a.wet < 4) c.add(2, `ปัสสาวะ ${a.wet} ครั้ง (ควรอย่างน้อย ${expW}) น้อยเกินไป อาจขาดน้ำ/ได้นมไม่พอ ควรปรึกษาแพทย์`);
    else c.add(1, `ปัสสาวะ ${a.wet} ครั้ง (ควรอย่างน้อย ${expW}) ให้นมถี่ขึ้นและสังเกตต่อ`);
  }
  const expS = expectedStool(dol, ft);
  if (a.stool < expS) c.add(1, `อุจจาระ ${a.stool} ครั้ง (วัยนี้มักถ่ายอย่างน้อย ${expS}) อาจได้นมไม่พอ ดูประกอบกับปัสสาวะและน้ำหนัก`);

  if (dol <= 28 && a.feeds > 0 && a.feeds < 8) c.add(1, `ให้นม ${a.feeds} มื้อ (ทารกแรกเกิดควรได้ 8–12 มื้อ/วัน)`);
  if (ft !== 'breast' && guide && guide.dailyMin && a.bottleMl > 0) {
    if (ft === 'formula' && a.bottleMl < guide.dailyMin * 0.8) c.add(1, `นมขวดรวม ${a.bottleMl} มล. ต่ำกว่าแนวทาง (${guide.dailyMin}–${guide.dailyMax} มล.)`);
    if (a.bottleMl > guide.dailyMax * 1.25) c.add(1, `นมขวดรวม ${a.bottleMl} มล. สูงกว่าแนวทาง อาจให้มากเกินไป สังเกตอาการแหวะ/ท้องอืด`);
  }
  return clean(c);
}

export function evaluateWeight(settings, weights) {
  const c = collector();
  const birthW = Number(settings.birthWeightKg);
  const ws = weights.filter((w) => !w.deleted && w.amount > 0).sort((a, b) => a.ts - b.ts);
  const latest = ws[ws.length - 1];
  const res = { lossPct: null, latest: latest || null, level: 0, msgs: [] };
  if (!birthW || !latest) return res;
  const pct = Math.round(((birthW - latest.amount) / birthW) * 1000) / 10;
  res.lossPct = pct;
  const dol = dayOfLife(settings.birthDate, localDate(latest.ts));
  if (pct > 10) c.add(2, `น้ำหนักลดลง ${pct}% จากแรกเกิด (เกิน 10%) ควรพบแพทย์`);
  else if (pct >= 7) c.add(1, `น้ำหนักลดลง ${pct}% จากแรกเกิด (7–10%) ควรประเมินการให้นมกับพยาบาล/แพทย์`);
  if (dol && dol >= 14 && latest.amount < birthW) c.add(1, `อายุ ${dol} วันแล้วยังไม่กลับถึงน้ำหนักแรกเกิด ควรปรึกษาแพทย์`);
  const r = clean(c);
  return { ...res, level: r.level, msgs: r.msgs };
}

export function weightOn(settings, weights, dateStr) {
  let w = Number(settings.birthWeightKg) || null;
  for (const x of weights.filter((x) => !x.deleted).sort((a, b) => a.ts - b.ts)) if (localDate(x.ts) <= dateStr) w = Number(x.amount);
  return w;
}

/* ---------------- สรุปทั้งหมดสำหรับหน้าแอป ---------------- */
export function summarize(records, settings, now = Date.now(), nDays = 7) {
  const live = records.filter((r) => !r.deleted);
  const today = localDate(now);
  const birth = /^\d{4}-\d{2}-\d{2}$/.test(settings.birthDate || '') ? settings.birthDate : null;
  const weights = live.filter((r) => r.type === 'weight');
  const byDay = new Map();
  for (const r of live) { const d = localDate(r.ts); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(r); }

  const days = [];
  for (let i = nDays - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    if (birth && d < birth) continue;
    const a = aggregateDay(byDay.get(d) || []);
    const dol = dayOfLife(birth, d);
    const guide = feedGuide(dol, weightOn(settings, weights, d), settings.feedingType);
    const dayEnd = new Date(d + 'T23:59:59').getTime();
    const recentPale = live.some((r) => r.type === 'poop' && ['s01', 's02', 's03'].includes(r.color) && r.ts <= dayEnd && dayEnd - r.ts < 3 * DAY_MS);
    const wNow = weightOn(settings, weights, d), bw = Number(settings.birthWeightKg);
    const ev = evaluateDay(a, dol, settings, guide, d === today, { recentPale, weightRegained: bw && wNow ? wNow >= bw : null });
    days.push({ date: d, dol, isToday: d === today, ...a, expWet: expectedWet(dol), expStool: expectedStool(dol, settings.feedingType), guide, level: ev.level, msgs: ev.msgs });
  }

  const overall = collector();
  const todayRow = days.find((x) => x.isToday);
  const done = days.filter((x) => !x.isToday && x.level !== null);
  const lastDone = done[done.length - 1];
  const push = (prefix, ev) => ev && ev.level !== null && ev.msgs.forEach((m) => m.level > 0 && overall.add(m.level, prefix + m.text));
  push('วันนี้: ', todayRow);
  if (lastDone) push(lastDone.date === addDays(today, -1) ? 'เมื่อวาน: ' : `${lastDone.date}: `, lastDone);
  const wEval = evaluateWeight(settings, weights);
  push('น้ำหนัก: ', wEval);

  const dolToday = dayOfLife(birth, today);
  const ageDays = dolToday ? dolToday - 1 : null;
  const since = (type) => { const xs = live.filter((r) => r.type === type).sort((a, b) => b.ts - a.ts); return xs[0] || null; };
  const lastPee = since('pee'), lastFeed = since('feed'), lastAny = live.filter((r) => ['pee', 'poop', 'feed'].includes(r.type)).sort((a, b) => b.ts - a.ts)[0];
  const peeHours = lastPee ? (now - lastPee.ts) / 3600000 : null;
  const activeRecently = lastAny && now - lastAny.ts < 12 * 3600000;
  const peeAlertH = Number(settings.peeAlertH) || 6;
  if (dolToday >= 2 && activeRecently && peeHours !== null) {
    if (peeHours >= 8) overall.add(2, `ไม่มีบันทึกปัสสาวะมา ${Math.floor(peeHours)} ชม. ถ้าไม่ได้ลืมบันทึก ควรให้นมทันทีและปรึกษาแพทย์`);
    else if (peeHours >= peeAlertH) overall.add(1, `ไม่มีบันทึกปัสสาวะมา ${Math.floor(peeHours)} ชม. ลองให้นมและสังเกต`);
  }
  // อุณหภูมิ ตัวเหลือง และการนอน ถูกประเมินในสรุปรายวัน (วันนี้/เมื่อวาน) แล้ว
  if (!birth) overall.msgs.unshift({ level: 0, text: 'ใส่วันเกิดในหน้า "ตั้งค่า" เพื่อให้ประเมินตามอายุได้' });

  const intervalH = Number(settings.feedIntervalH) || 3;
  const res = clean(overall);
  if (!live.length) res.level = null;
  return {
    today, dolToday, days, overall: res, weight: wEval,
    guideToday: feedGuide(dolToday, weightOn(settings, weights, today), settings.feedingType),
    lastPee, lastFeed, peeHours,
    nextFeedAt: lastFeed ? lastFeed.ts + intervalH * 3600000 : null
  };
}

/* ---------------- แจ้งเตือนในแอป (Phase 3) ---------------- */
/**
 * คืนรายการเตือนที่ควรแสดงตอนนี้ แต่ละรายการมี key ไม่ซ้ำ (ใช้กันแจ้งซ้ำ)
 * timers: { feedTimer, sleepTimer } จากเครื่อง
 */
export function activeAlerts(records, settings, now = Date.now(), timers = {}) {
  const out = [];
  const live = records.filter((r) => !r.deleted);
  const birth = settings.birthDate;
  const dol = dayOfLife(birth, localDate(now));
  const latest = (type) => live.filter((r) => r.type === type).sort((a, b) => b.ts - a.ts)[0] || null;
  const feeding = timers.feedTimer && (timers.feedTimer.L.runFrom || timers.feedTimer.R.runFrom);
  const sleepingSince = timers.sleepTimer && timers.sleepTimer.startTs;

  const lf = latest('feed');
  const iv = (Number(settings.feedIntervalH) || 3) * 3600000;
  if (lf && !feeding) {
    const due = lf.ts + iv;
    const sleepNote = sleepingSince ? ' (ลูกกำลังนอน — ช่วงแรกเกิดควรปลุกให้นม)' : '';
    if (now >= due + 30 * 60000) out.push({ key: 'feed2:' + lf.id, level: 1, title: 'เลยเวลาให้นมมา 30 นาทีแล้ว', body: `มื้อล่าสุด ${hhmm(lf.ts)}${sleepNote}` });
    else if (now >= due) out.push({ key: 'feed:' + lf.id, level: 0, title: 'ถึงเวลาให้นม', body: `มื้อล่าสุดเมื่อ ${hhmm(lf.ts)} (ครบ ${settings.feedIntervalH || 3} ชม.)${sleepNote}` });
  }

  const lp = latest('pee');
  const lastAny = live.filter((r) => ['pee', 'poop', 'feed'].includes(r.type)).sort((a, b) => b.ts - a.ts)[0];
  const active = lastAny && now - lastAny.ts < 12 * 3600000;
  const alertH = Number(settings.peeAlertH) || 6;
  if (lp && dol >= 2 && active) {
    const h = (now - lp.ts) / 3600000;
    if (h >= 8) out.push({ key: 'pee8:' + lp.id, level: 2, title: `ไม่มีฉี่มา ${Math.floor(h)} ชม.`, body: 'ถ้าไม่ได้ลืมบันทึก ให้นมทันที และปรึกษาแพทย์' });
    else if (h >= alertH) out.push({ key: 'pee:' + lp.id, level: 1, title: `ไม่มีฉี่มา ${Math.floor(h)} ชม.`, body: 'ลองให้นม แล้วสังเกตผ้าอ้อม' });
  }

  const lt = latest('temp');
  if (lt && now - lt.ts < 3 * 3600000) {
    const ev = evaluateTemp(lt, dol ? dol - 1 : null);
    if (ev.level >= 2) out.push({ key: 'fever:' + lt.id, level: ev.level, title: ev.level === 3 ? 'มีไข้ — พบแพทย์ทันที' : 'อุณหภูมิผิดปกติ', body: ev.msgs[0].text });
    else if (ev.level === 1) {
      const newer = live.some((r) => r.type === 'temp' && r.ts > lt.ts);
      if (!newer && now - lt.ts >= 20 * 60000) out.push({ key: 'retemp:' + lt.id, level: 1, title: 'ถึงเวลาวัดไข้ซ้ำ', body: `ครั้งก่อน ${Number(lt.tempC).toFixed(1)} °C เมื่อ ${hhmm(lt.ts)}` });
    }
  }

  if (sleepingSince) {
    const h = (now - sleepingSince) / 3600000;
    const bw = Number(settings.birthWeightKg);
    const lw = live.filter((r) => r.type === 'weight').sort((a, b) => b.ts - a.ts)[0];
    const regained = bw && lw ? Number(lw.amount) >= bw : null;
    if (h >= 4 && needsWakeForFeeds(dol, regained)) out.push({ key: 'sleep:' + sleepingSince, level: 1, title: `ลูกนอนมา ${Math.floor(h)} ชม.`, body: 'ช่วงแรกเกิดควรปลุกให้นมทุก 3–4 ชม.' });
  }
  return out.sort((a, b) => b.level - a.level);
}
function hhmm(ts) { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
