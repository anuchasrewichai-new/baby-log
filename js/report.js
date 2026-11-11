// report.js — รายงานสรุปสำหรับแพทย์ (พิมพ์ / บันทึกเป็น PDF จากหน้าจอ)
import * as R from './rules.js';
import * as C from './charts.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const dTh = (ds) => { const [, m, d] = ds.split('-').map(Number); return `${d} ${TH_MON[m - 1]}`; };
const dThFull = (ds) => { const [y, m, d] = ds.split('-').map(Number); return `${d} ${TH_MON[m - 1]} ${y + 543}`; };
const hm = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const lvClass = (lv) => (lv === null || lv === undefined ? 'lv-none' : `lv-${lv}`);
const lvText = (lv) => (lv === null || lv === undefined ? '—' : R.LEVEL_LABEL[lv]);
const FT = { breast: 'นมแม่', mixed: 'นมแม่ + นมผสม', formula: 'นมผสม' };
function whenText(dates) {
  // รวมวันที่ติดกันเป็นช่วง เช่น "5, 8–10 พ.ย."
  const ds = [...new Set(dates)].sort();
  const hasToday = ds.includes('today');
  const real = ds.filter((d) => d !== 'today');
  const runs = [];
  for (const d of real) {
    const last = runs[runs.length - 1];
    const prev = last && last[last.length - 1];
    if (prev && (Date.parse(d) - Date.parse(prev)) / 86400000 === 1) last.push(d); else runs.push([d]);
  }
  const day = (d) => Number(d.split('-')[2]);
  const mon = (d) => TH_MON[Number(d.split('-')[1]) - 1];
  const parts = runs.map((r, i) => {
    const sameMonthNext = i < runs.length - 1 && mon(runs[i + 1][0]) === mon(r[r.length - 1]);
    const end = r[r.length - 1];
    const txt = r.length > 1 ? `${day(r[0])}${mon(r[0]) !== mon(end) ? ' ' + mon(r[0]) : ''}–${day(end)}` : `${day(end)}`;
    return sameMonthNext ? txt : `${txt} ${mon(end)}`;
  });
  if (hasToday) parts.push('วันนี้');
  return parts.join(', ');
}
const hrs = (min) => (min ? `${Math.round(min / 6) / 10} ชม.` : '—');

/** ข้อมูลสรุปของรายงาน (ใช้ทั้งหน้าจอและข้อความแชร์) */
export function reportData(records, settings, now, nDays) {
  const sum = R.summarize(records, settings, now, nDays);
  const live = records.filter((r) => !r.deleted);
  const from = sum.days[0] ? sum.days[0].date : R.localDate(now);
  const to = sum.today;
  const inRange = (r) => { const d = R.localDate(r.ts); return d >= from && d <= to; };
  const done = sum.days.filter((d) => !d.isToday && d.level !== null);
  const worst = Math.max(-1, ...sum.days.map((d) => (d.level === null ? -1 : d.level)));
  const findings = [];
  for (const d of sum.days) for (const m of d.msgs) if (m.level > 0) findings.push({ date: d.date, isToday: d.isToday, level: m.level, text: m.text });
  for (const m of sum.weight.msgs) findings.push({ date: sum.weight.latest ? R.localDate(sum.weight.latest.ts) : to, level: m.level, text: 'น้ำหนัก: ' + m.text });
  // รวมข้อความเดียวกันหลายวันเป็นบรรทัดเดียว เช่น "5–9 พ.ย. (4 วัน)"
  const grouped = new Map();
  for (const f of findings) {
    const g = grouped.get(f.text) || { ...f, dates: [] };
    g.level = Math.max(g.level, f.level); g.dates.push(f.isToday ? 'today' : f.date);
    grouped.set(f.text, g);
  }
  findings.length = 0;
  for (const g of grouped.values()) findings.push(g);
  findings.sort((a, b) => b.level - a.level || (a.dates[0] < b.dates[0] ? -1 : 1));
  const temps = live.filter((r) => r.type === 'temp' && inRange(r));
  const maxT = temps.sort((a, b) => b.tempC - a.tempC)[0] || null;
  const js = live.filter((r) => r.type === 'jaundice' && inRange(r));
  const maxJ = js.sort((a, b) => b.zone - a.zone || b.ts - a.ts)[0] || null;
  const photos = live.filter((r) => r.photoId && inRange(r)).map((r) => {
    const dol = R.dayOfLife(settings.birthDate, R.localDate(r.ts));
    const lv = r.type === 'poop' ? R.evaluateStool(r, dol).level : r.type === 'pee' ? R.evaluateUrine(r, dol).level : 0;
    return { rec: r, lv };
  }).sort((a, b) => b.lv - a.lv || b.rec.ts - a.rec.ts).slice(0, 8).sort((a, b) => a.rec.ts - b.rec.ts);
  return { sum, from, to, done, worst: worst < 0 ? null : worst, findings, maxT, maxJ, photos };
}

export function reportHtml({ records, settings, now = Date.now(), nDays = 7, notes = '', photoUrl = () => '' }) {
  const rd = reportData(records, settings, now, nDays);
  const s = rd.sum, days = s.days;
  const name = settings.babyName || 'ลูก';
  const age = s.dolToday ? `อายุ ${s.dolToday - 1} วัน (วันที่ ${s.dolToday} ของชีวิต)` : '';
  const bw = Number(settings.birthWeightKg) || null, lw = s.weight.latest;
  const labels = days.map((d) => (d.dol ? `ว.${d.dol}` : dTh(d.date)));
  const stoolStacks = days.map((d) => R.STOOL_COLORS.map((c) => ({ v: d.colors[c.id] || 0, color: c.hex })));
  const wPts = records.filter((r) => !r.deleted && r.type === 'weight').map((r) => ({ day: R.dayOfLife(settings.birthDate, R.localDate(r.ts)), kg: Number(r.amount) })).filter((p) => p.day);
  const dots = (d) => R.STOOL_COLORS.filter((c) => d.colors[c.id]).map((c) => `<i class="rp-dot" style="background:${c.hex}" title="${esc(c.short)}"></i>`).join('');
  const feedTxt = (d) => [d.feeds ? `${d.feeds} มื้อ` : '', d.bottleMl ? `${d.bottleMl} มล.` : '', d.breastMin ? `เต้า ${d.breastMin} น.` : ''].filter(Boolean).join(' · ') || '—';
  const tile = (label, value, sub, cls = '') => `<div class="rp-tile ${cls}"><div class="rp-tl">${label}</div><div class="rp-tv">${value}</div>${sub ? `<div class="rp-ts">${sub}</div>` : ''}</div>`;
  const usedColors = R.STOOL_COLORS.filter((c) => days.some((d) => d.colors[c.id]));

  return `<article class="report" id="report">
  <header class="rp-head">
    <div><h1 class="rp-title">สรุปการขับถ่าย การให้นม และสุขภาพ</h1>
      <div class="rp-sub">ช่วง ${dThFull(rd.from)} – ${dThFull(rd.to)} (${days.length} วัน) · พิมพ์เมื่อ ${dThFull(R.localDate(now))} ${hm(now)}</div></div>
    <div class="rp-baby"><b>${esc(name)}</b>${settings.birthDate ? ` · เกิด ${dThFull(settings.birthDate)}` : ''}<br>${esc(age)}<br>
      ${settings.gestationWeeks ? `อายุครรภ์ ${esc(settings.gestationWeeks)} สัปดาห์ · ` : ''}${FT[settings.feedingType] || ''}</div>
  </header>

  <section class="rp-tiles">
    ${tile('ผลประเมินในช่วงนี้', lvText(rd.worst), rd.worst > 0 ? `${rd.findings.length} เรื่องที่ควรดู` : 'ไม่พบสิ่งผิดปกติ', lvClass(rd.worst))}
    ${tile('น้ำหนัก แรกเกิด → ล่าสุด', bw && lw ? `${bw.toFixed(2)} → ${Number(lw.amount).toFixed(2)} กก.` : bw ? `${bw.toFixed(2)} กก.` : '—', lw && s.weight.lossPct !== null ? `${s.weight.lossPct > 0 ? '−' : '+'}${Math.abs(s.weight.lossPct)}% (${dTh(R.localDate(lw.ts))})` : 'ยังไม่มีการชั่ง')}
    ${tile('อุณหภูมิสูงสุด', rd.maxT ? `${Number(rd.maxT.tempC).toFixed(1)} °C` : '—', rd.maxT ? `${R.TEMP_SITES[rd.maxT.tempSite] || ''} · ${dTh(R.localDate(rd.maxT.ts))} ${hm(rd.maxT.ts)}` : 'ไม่ได้วัด')}
    ${tile('ตัวเหลืองสูงสุด', rd.maxJ ? `ระดับ ${rd.maxJ.zone}` : '—', rd.maxJ ? `${R.JAUNDICE_ZONES[rd.maxJ.zone]} · ${dTh(R.localDate(rd.maxJ.ts))}` : 'ไม่ได้บันทึก')}
  </section>

  ${rd.findings.length ? `<section class="rp-sec"><h2>เรื่องที่ควรแจ้งแพทย์</h2><ul class="rp-find">${rd.findings.slice(0, 14).map((f) => `<li class="${lvClass(f.level)}"><span class="rp-lv">${lvText(f.level)}</span><span>${whenText(f.dates)} · ${esc(f.text)}</span></li>`).join('')}</ul></section>` : ''}

  <section class="rp-sec rp-notes"><h2>คำถาม/ข้อสังเกตของผู้ปกครอง</h2>
    <textarea class="rp-notes-input no-print" data-bind-notes rows="3" placeholder="พิมพ์สิ่งที่อยากถามแพทย์ เช่น ตัวเหลืองที่เหลือต้องเจาะเลือดซ้ำไหม (จะพิมพ์ลงรายงาน)">${esc(notes)}</textarea>
    <div class="rp-notes-print print-only">${notes ? esc(notes).replace(/\n/g, '<br>') : '<span class="rp-muted">—</span>'}</div>
  </section>

  <section class="rp-sec"><h2>ตารางรายวัน</h2>
    <table class="rp-table"><thead><tr><th>วันที่</th><th>ฉี่ (ขั้นต่ำ)</th><th>อึ / สี</th><th>นม</th><th>ไข้สูงสุด</th><th>เหลือง</th><th>นอน</th><th>ผล</th></tr></thead>
    <tbody>${days.map((d) => `<tr>
      <td><b>${dTh(d.date)}</b>${d.dol ? `<br><span class="rp-muted">วันที่ ${d.dol}</span>` : ''}</td>
      <td>${d.wet}${d.expWet ? ` <span class="rp-muted">(${d.expWet})</span>` : ''}</td>
      <td>${d.stool} ${dots(d)}</td>
      <td>${feedTxt(d)}</td>
      <td>${d.maxTemp !== null ? d.maxTemp.toFixed(1) : '—'}</td>
      <td>${d.maxZone !== null ? d.maxZone : '—'}</td>
      <td>${hrs(d.sleepMin)}</td>
      <td class="${lvClass(d.isToday && d.level === 0 ? null : d.level)} rp-res">${d.isToday ? (d.level > 0 ? lvText(d.level) : 'ยังไม่ครบวัน') : lvText(d.level)}</td></tr>`).join('')}</tbody></table>
    <div class="rp-legend">${usedColors.map((c) => `<span><i class="rp-dot" style="background:${c.hex}"></i>${esc(c.short)}</span>`).join('')}<span class="rp-muted">· ตัวเลขในวงเล็บ = จำนวนขั้นต่ำตามอายุ · นอนนับเฉพาะที่บันทึก</span></div>
  </section>

  <section class="rp-sec rp-charts">
    <figure><figcaption>ฉี่ต่อวัน (เส้นดำ = ขั้นต่ำ)</figcaption>${C.bars({ labels, values: days.map((d) => d.wet), mins: days.map((d) => d.expWet), color: '#E9C46A', label: 'ฉี่ต่อวัน' })}</figure>
    <figure><figcaption>อึต่อวัน แยกสี</figcaption>${C.bars({ labels, stacks: stoolStacks, mins: days.map((d) => d.expStool || null), label: 'อึต่อวัน' })}</figure>
    <figure><figcaption>มื้อนมต่อวัน (เส้นประ = 8 มื้อ)</figcaption>${C.bars({ labels, values: days.map((d) => d.feeds), hline: 8, color: '#2F6F73', label: 'มื้อนมต่อวัน' })}</figure>
    ${wPts.length && bw ? `<figure><figcaption>น้ำหนัก (กก.)</figcaption>${C.weight({ points: wPts, birthKg: bw, label: 'น้ำหนัก' })}</figure>` : ''}
    ${days.some((d) => d.maxTemp !== null) ? `<figure><figcaption>อุณหภูมิสูงสุด (°C)</figcaption>${C.temps({ labels, values: days.map((d) => d.maxTemp), label: 'อุณหภูมิ' })}</figure>` : ''}
  </section>

  ${rd.photos.length ? `<section class="rp-sec rp-photos-sec"><h2>รูปผ้าอ้อม${rd.photos.some((p) => p.lv > 0) ? ' (รูปที่ถูกเตือนอยู่ในกรอบสี)' : ''}</h2><div class="rp-photos">${rd.photos.map(({ rec, lv }) => {
    const meta = rec.type === 'poop' ? R.STOOL_COLORS.find((c) => c.id === rec.color) : R.URINE_COLORS.find((c) => c.id === rec.color);
    const url = photoUrl(rec.photoId);
    return `<figure class="${lv > 0 ? 'rp-flag ' + lvClass(lv) : ''}"><div class="rp-ph" data-photo="${esc(rec.photoId)}">${url ? `<img src="${url}" alt="">` : '<span>กำลังโหลดรูป…</span>'}</div>
      <figcaption>${dTh(R.localDate(rec.ts))} ${hm(rec.ts)} · ${rec.type === 'poop' ? 'อึ' : 'ฉี่'} ${esc(meta ? meta.short || meta.label : '')}${lv > 0 ? ` · <b>${lvText(lv)}</b>` : ''}</figcaption></figure>`;
  }).join('')}</div></section>` : ''}

  <footer class="rp-foot">
    <div><b>อาการที่ต้องไปโรงพยาบาลทันที:</b> ${R.DANGER_SIGNS.map(esc).join(' · ')}</div>
    <div class="rp-muted">ข้อมูลบันทึกโดยผู้ปกครองผ่านแอปบันทึกลูกน้อย · เกณฑ์ประเมินเป็นแนวทางทั่วไป ไม่ใช่การวินิจฉัยทางการแพทย์ · รูปถ่ายอาจมีสีเพี้ยนจากแสงและกล้อง</div>
  </footer>
</article>`;
}

/** ข้อความสั้นสำหรับแชร์ทาง LINE */
export function shareText({ records, settings, now = Date.now(), nDays = 7, notes = '' }) {
  const rd = reportData(records, settings, now, nDays);
  const s = rd.sum;
  const lines = [`สรุป${settings.babyName ? ' ' + settings.babyName : ''}${s.dolToday ? ` (อายุ ${s.dolToday - 1} วัน)` : ''}`, `ช่วง ${dTh(rd.from)}–${dTh(rd.to)} · ผลประเมิน: ${lvText(rd.worst)}`];
  if (s.weight.latest && s.weight.lossPct !== null) lines.push(`น้ำหนักล่าสุด ${Number(s.weight.latest.amount).toFixed(2)} กก. (${s.weight.lossPct > 0 ? '−' : '+'}${Math.abs(s.weight.lossPct)}% จากแรกเกิด)`);
  lines.push('', 'วันที่ | ฉี่ | อึ | นม');
  for (const d of s.days) lines.push(`${dTh(d.date)}${d.dol ? ` (ว.${d.dol})` : ''} | ${d.wet} | ${d.stool} | ${d.feeds} มื้อ${d.maxTemp !== null ? ` | ${d.maxTemp.toFixed(1)}°C` : ''}`);
  if (rd.findings.length) { lines.push('', 'เรื่องที่ควรดู:'); rd.findings.slice(0, 6).forEach((f) => lines.push(`- ${whenText(f.dates)} ${f.text}`)); }
  if (notes) lines.push('', 'คำถามผู้ปกครอง: ' + notes);
  lines.push('', '(จากแอปบันทึกลูกน้อย · ไม่ใช่การวินิจฉัยทางการแพทย์)');
  return lines.join('\n');
}
