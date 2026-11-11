// charts.js — กราฟ SVG แบบเบา ไม่ต้องพึ่งไลบรารี (ใช้ออฟไลน์ได้)

const W = 340;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function frame(h, inner, label) {
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(label)}" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;
}

/**
 * กราฟแท่ง: values[] (null = ไม่มีข้อมูล), mins[] เส้นเกณฑ์ขั้นต่ำต่อวัน (ไม่บังคับ), hline ค่าคงที่ (ไม่บังคับ)
 * stacks: ถ้ามี จะวาดแบบซ้อน [{v, color}] ต่อวัน
 */
export function bars({ labels, values, stacks, mins, hline, color = 'var(--accent)', partialLast = true, label = '' }) {
  const H = 150, top = 16, bottom = 22, left = 4, right = 4;
  const n = labels.length;
  const totals = stacks ? stacks.map((s) => s.reduce((a, x) => a + x.v, 0)) : values.map((v) => v || 0);
  const maxV = Math.max(1, ...totals, ...(mins || []).map((m) => m || 0), hline || 0) * 1.15;
  const plotH = H - top - bottom;
  const slot = (W - left - right) / n;
  const bw = Math.min(30, slot * 0.62);
  const y = (v) => top + plotH - (v / maxV) * plotH;
  let g = `<line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" class="axis"/>`;
  if (hline) g += `<line x1="0" x2="${W}" y1="${y(hline)}" y2="${y(hline)}" class="hline"/>`;
  for (let i = 0; i < n; i++) {
    const cx = left + slot * i + slot / 2, x = cx - bw / 2;
    const partial = partialLast && i === n - 1;
    if (stacks) {
      let acc = 0;
      for (const seg of stacks[i]) {
        if (!seg.v) continue;
        const y1 = y(acc + seg.v), y0 = y(acc);
        g += `<rect x="${x}" y="${y1}" width="${bw}" height="${Math.max(0, y0 - y1 - 1)}" rx="3" fill="${seg.color}" ${partial ? 'opacity=".55"' : ''}/>`;
        acc += seg.v;
      }
    } else if (values[i]) {
      g += `<rect x="${x}" y="${y(values[i])}" width="${bw}" height="${y(0) - y(values[i])}" rx="4" fill="${color}" ${partial ? 'opacity=".5"' : ''}/>`;
    }
    if (totals[i]) g += `<text x="${cx}" y="${y(totals[i]) - 4}" class="val">${totals[i]}</text>`;
    if (mins && mins[i]) g += `<line x1="${x - 4}" x2="${x + bw + 4}" y1="${y(mins[i])}" y2="${y(mins[i])}" class="minline"/>`;
    g += `<text x="${cx}" y="${H - 6}" class="lbl">${esc(labels[i])}</text>`;
  }
  return frame(H, g, label);
}

/** กราฟน้ำหนัก พร้อมแถบสี 0–7% / 7–10% / >10% จากน้ำหนักแรกเกิด */
export function weight({ points, birthKg, label = '' }) {
  const H = 160, top = 14, bottom = 22, left = 34, right = 10;
  if (!points.length || !birthKg) return '';
  const kgs = points.map((p) => p.kg).concat([birthKg, birthKg * 0.88]);
  const lo = Math.min(...kgs) - 0.05, hi = Math.max(...kgs) + 0.05;
  const xs = points.map((p) => p.day);
  const dMin = 1, dMax = Math.max(7, ...xs);
  const plotW = W - left - right, plotH = H - top - bottom;
  const X = (d) => left + ((d - dMin) / (dMax - dMin)) * plotW;
  const Y = (kg) => top + ((hi - kg) / (hi - lo)) * plotH;
  const b7 = birthKg * 0.93, b10 = birthKg * 0.9;
  let g = '';
  g += `<rect x="${left}" y="${top}" width="${plotW}" height="${Math.max(0, Y(b7) - top)}" class="band-ok"/>`;
  g += `<rect x="${left}" y="${Y(b7)}" width="${plotW}" height="${Math.max(0, Y(b10) - Y(b7))}" class="band-watch"/>`;
  g += `<rect x="${left}" y="${Y(b10)}" width="${plotW}" height="${Math.max(0, top + plotH - Y(b10))}" class="band-doc"/>`;
  g += `<line x1="${left}" x2="${W - right}" y1="${Y(birthKg)}" y2="${Y(birthKg)}" class="hline"/>`;
  g += `<text x="${left - 4}" y="${Y(birthKg) + 4}" class="ylbl">${birthKg.toFixed(2)}</text>`;
  g += `<text x="${left - 4}" y="${Y(b7) + 4}" class="ylbl">−7%</text>`;
  g += `<text x="${left - 4}" y="${Y(b10) + 4}" class="ylbl">−10%</text>`;
  const pts = [{ day: 1, kg: birthKg }, ...points].sort((a, b) => a.day - b.day);
  g += `<polyline points="${pts.map((p) => `${X(p.day)},${Y(p.kg)}`).join(' ')}" class="wline"/>`;
  pts.forEach((p) => { g += `<circle cx="${X(p.day)}" cy="${Y(p.kg)}" r="4" class="wdot"/>`; });
  const ticks = [1, Math.round(dMax / 2), dMax].filter((v, i, a) => a.indexOf(v) === i);
  ticks.forEach((d, i) => { const anchor = i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle'; g += `<text x="${X(d)}" y="${H - 6}" class="lbl" style="text-anchor:${anchor}">วันที่ ${d}</text>`; });
  return frame(H, g, label);
}

/** อุณหภูมิสูงสุดต่อวัน: จุด + แถบ ปกติ/สูง/ไข้ */
export function temps({ labels, values, label = '' }) {
  const H = 150, top = 12, bottom = 22, left = 30, right = 6;
  const lo = 35.5, hi = 39.5, plotH = H - top - bottom, n = labels.length;
  const slot = (W - left - right) / n;
  const Y = (t) => top + ((hi - Math.max(lo, Math.min(hi, t))) / (hi - lo)) * plotH;
  let g = `<rect x="${left}" y="${Y(39.5)}" width="${W - left - right}" height="${Y(38) - Y(39.5)}" class="band-doc"/>`;
  g += `<rect x="${left}" y="${Y(38)}" width="${W - left - right}" height="${Y(37.5) - Y(38)}" class="band-watch"/>`;
  g += `<rect x="${left}" y="${Y(37.5)}" width="${W - left - right}" height="${Y(36.5) - Y(37.5)}" class="band-ok"/>`;
  g += `<line x1="${left}" x2="${W - right}" y1="${Y(38)}" y2="${Y(38)}" class="hline"/>`;
  [36.5, 37.5, 38].forEach((t) => { g += `<text x="${left - 4}" y="${Y(t) + 4}" class="ylbl">${t.toFixed(1)}</text>`; });
  const pts = [];
  for (let i = 0; i < n; i++) {
    const cx = left + slot * i + slot / 2;
    if (values[i] !== null && values[i] !== undefined) {
      pts.push(`${cx},${Y(values[i])}`);
      g += `<circle cx="${cx}" cy="${Y(values[i])}" r="5" class="${values[i] >= 38 ? 'tdot-hot' : 'wdot'}"/><text x="${cx}" y="${Y(values[i]) - 9}" class="val">${values[i].toFixed(1)}</text>`;
    }
    g += `<text x="${cx}" y="${H - 6}" class="lbl">${esc(labels[i])}</text>`;
  }
  if (pts.length > 1) g = g.replace('<line', `<polyline points="${pts.join(' ')}" class="wline" style="stroke-width:1.5;opacity:.5"/><line`);
  return frame(H, g, label);
}
