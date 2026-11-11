// app.js — หน้าจอและการทำงานของแอปบันทึกลูกน้อย
import * as R from './rules.js';
import { db, uid } from './db.js';
import * as Sync from './sync.js';
import * as C from './charts.js';
import * as P from './photos.js';

export const APP_VERSION = '1.2.0';
const $app = document.getElementById('app');
const $toast = document.getElementById('toast');

const DEFAULT_SETTINGS = { babyName: '', birthDate: '', birthWeightKg: '', gestationWeeks: '', feedingType: 'breast', feedIntervalH: 3, peeAlertH: 6, photoRetentionDays: 30, photoMode: 'drive', updatedAt: 0 };
const S = {
  records: [], settings: { ...DEFAULT_SETTINGS }, sum: null, range: 7,
  draft: {}, draftKey: '', confirmDel: false, syncCfg: { url: '', key: '' }, sync: Sync.syncState(),
  feedTimer: null, sleepTimer: null, alerts: [], notify: { enabled: false, sound: true }, installEvt: null, swWaiting: null, histLimit: 14, confirmReset: false
};

/* ===================== ตัวช่วย ===================== */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const hm = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const dateTh = (ds) => { const [y, m, d] = ds.split('-').map(Number); return `${d} ${TH_MON[m - 1]}`; };
const dateThFull = (ds) => { const [y, m, d] = ds.split('-').map(Number); return `${d} ${TH_MON[m - 1]} ${y + 543}`; };
const toLocalInput = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fromLocalInput = (v) => { const t = new Date(v).getTime(); return isFinite(t) ? t : Date.now(); };
function ago(ms) {
  if (ms < 0) ms = 0;
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'เมื่อสักครู่';
  if (m < 60) return `${m} นาที`;
  const h = Math.floor(m / 60);
  return `${h} ชม.${m % 60 ? ` ${m % 60} น.` : ''}`;
}
const durText = (ms) => { const m = Math.round(ms / 60000); return m < 60 ? `${m} นาที` : `${Math.floor(m / 60)} ชม.${m % 60 ? ` ${m % 60} น.` : ''}`; };
const hmmss = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`; };
const mmss = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };
const lvClass = (lv) => (lv === null || lv === undefined ? 'lv-none' : `lv-${lv}`);
const lvText = (lv) => (lv === null || lv === undefined ? 'ไม่มีข้อมูล' : R.LEVEL_LABEL[lv]);
const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : null; };
const stoolMeta = (id) => R.STOOL_COLORS.find((c) => c.id === id);
const urineMeta = (id) => R.URINE_COLORS.find((c) => c.id === id);
const consMeta = (id) => R.CONSISTENCY.find((c) => c.id === id);

const ICON = {
  back: '<path d="M15 18l-6-6 6-6"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  drop: '<path d="M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z"/>',
  diaper: '<path d="M3 7h18v3a9 9 0 0 1-18 0z"/><path d="M9 13c1 1.2 5 1.2 6 0"/>',
  bottle: '<path d="M9 2h6M10 2v3l-2 3v12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V8l-2-3V2M8 12h8"/>',
  scale: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 9a4 4 0 0 1 8 0M12 9l1.5-2"/>',
  pencil: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  chart: '<path d="M3 3v18h18M7 15l4-4 3 3 5-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  alert: '<path d="M12 3l10 18H2zM12 10v5M12 18v.01"/>',
  play: '<path d="M8 5l11 7-11 7z"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.9-3M4 5v4h4M4 13a8 8 0 0 0 14.9 3M20 19v-4h-4"/>',
  cloudOff: '<path d="M3 3l18 18M8 8a5 5 0 0 0-1 9.9h10M18.5 13.9A4 4 0 0 0 15 8h-.5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  camera: '<path d="M4 7h3l2-3h6l2 3h3v13H4z"/><circle cx="12" cy="13" r="4"/>',
  thermo: '<path d="M14 14.76V4a2 2 0 0 0-4 0v10.76a4 4 0 1 0 4 0z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>'
};
const icon = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;

/* ===================== ข้อมูล ===================== */
function normSettings(s) {
  const o = { ...DEFAULT_SETTINGS, ...(s || {}) };
  o.feedIntervalH = num(o.feedIntervalH) || 3;
  o.peeAlertH = num(o.peeAlertH) || 6;
  o.photoRetentionDays = o.photoRetentionDays === '' || o.photoRetentionDays === null || o.photoRetentionDays === undefined ? 30 : Number(o.photoRetentionDays);
  o.photoMode = o.photoMode === 'local' ? 'local' : 'drive';
  return o;
}
function recompute() { S.sum = R.summarize(S.records, S.settings, Date.now(), S.range); }
const live = () => S.records.filter((r) => !r.deleted);

async function saveRecord(rec) {
  rec.updatedAt = Date.now();
  rec._dirty = 1;
  rec.babyId = rec.babyId || 'b1';
  await db.putRecord(rec);
  S.sync = { ...S.sync, pending: await Sync.countPending(), status: navigator.onLine === false ? 'offline' : S.sync.status };
  const i = S.records.findIndex((r) => r.id === rec.id);
  if (i >= 0) S.records[i] = rec; else S.records.push(rec);
  recompute();
  scheduleSync();
  setTimeout(checkAlerts, 50);
}
async function saveSettings(patch) {
  S.settings = normSettings({ ...S.settings, ...patch, updatedAt: Date.now() });
  await db.set('settings', { ...S.settings, _dirty: 1 });
  recompute();
  scheduleSync();
}

let syncTimer = null;
function scheduleSync(delay = 1500) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(runSync, delay);
}
async function runSync() {
  const changed = await Sync.syncNow();
  if (changed) {
    S.records = await db.allRecords();
    S.settings = normSettings(await db.get('settings'));
    recompute();
    render();
    checkAlerts();
  }
}

/* ===================== แจ้งเตือน (Phase 3) ===================== */
const ALERT_LINK = { feed: '#/log/feed', feed2: '#/log/feed', pee: '#/log/pee', pee8: '#/danger', fever: '#/danger', retemp: '#/log/temp', sleep: '#/log/sleep', test: '#/' };
let audioCtx = null;
function unlockAudio() {
  try { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) { /* ไม่มีเสียง */ }
}
function chime(level) {
  if (!audioCtx) return;
  const notes = level >= 2 ? [880, 660, 880, 660] : [660, 880];
  notes.forEach((f, i) => {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = audioCtx.currentTime + i * 0.28;
    o.frequency.value = f; o.type = 'sine';
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + 0.26);
  });
}
async function fireAlert(a, force = false) {
  const fired = await db.get('alertsFired', []);
  if (!force && fired.includes(a.key)) return false;
  if (!force) { fired.push(a.key); await db.set('alertsFired', fired.slice(-200)); }
  if (S.notify.sound) { chime(a.level); try { navigator.vibrate && navigator.vibrate(a.level >= 2 ? [300, 150, 300, 150, 300] : [200, 100, 200]); } catch (e) { /* ignore */ } }
  const name = S.settings.babyName ? ` (${S.settings.babyName})` : '';
  if (S.notify.enabled && 'Notification' in window && Notification.permission === 'granted') {
    const opts = { body: a.body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: a.key.split(':')[0], renotify: true, requireInteraction: a.level >= 2, data: { url: './' + (ALERT_LINK[a.key.split(':')[0]] || '#/') } };
    try {
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
      if (reg && reg.showNotification) await reg.showNotification(a.title + name, opts);
      else new Notification(a.title + name, opts);
    } catch (e) { /* แสดงในแอปอย่างเดียว */ }
  }
  if (force) toast(a.title);
  return true;
}
async function dismissAlert(key) {
  const d = await db.get('alertsDismissed', []);
  if (!d.includes(key)) d.push(key);
  await db.set('alertsDismissed', d.slice(-200));
  S.dismissed = d;
  S.alerts = S.alerts.filter((x) => x.key !== key);
}
async function checkAlerts() {
  const list = R.activeAlerts(S.records, S.settings, Date.now(), { feedTimer: S.feedTimer, sleepTimer: S.sleepTimer });
  const dismissed = S.dismissed || (S.dismissed = await db.get('alertsDismissed', []));
  const visible = list.filter((a) => !dismissed.includes(a.key));
  const changed = visible.map((a) => a.key).join() !== (S.alerts || []).map((a) => a.key).join();
  S.alerts = visible;
  for (const a of visible) await fireAlert(a);
  if (changed && route().parts[0] !== 'log' && route().parts[0] !== 'settings') { const y = window.scrollY; render(); window.scrollTo(0, y); }
}
function alertBanners() {
  if (!S.alerts || !S.alerts.length) return '';
  return S.alerts.map((a) => `<div class="alert ${lvClass(a.level === 0 ? 1 : a.level)}" role="alert">
      <a class="alert-main" href="${ALERT_LINK[a.key.split(':')[0]] || '#/'}">${icon('bell')}<span><b>${esc(a.title)}</b><span class="small">${esc(a.body)}</span></span></a>
      <button type="button" class="alert-x" data-act="alert-dismiss" data-v="${esc(a.key)}" aria-label="รับทราบ">รับทราบ</button></div>`).join('');
}

/* ===================== Toast ===================== */
let toastTimer = null;
function toast(msg, action) {
  $toast.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button" data-act="toast-action">${esc(action.label)}</button>` : ''}`;
  $toast.classList.add('show');
  S.toastAction = action ? action.fn : null;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.remove('show'), action ? 6000 : 2500);
}

/* ===================== Router ===================== */
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, q] = h.split('?');
  const params = new URLSearchParams(q || '');
  return { parts: path.split('/').filter(Boolean), params };
}
function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

function render() {
  const { parts, params } = route();
  const v = parts[0] || '';
  let html;
  if (!S.settings.birthDate && !S.onboardSkipped && v !== 'settings') html = viewOnboard();
  else if (v === 'log') html = viewLog(parts[1], params.get('id'));
  else if (v === 'dash') html = viewDash();
  else if (v === 'history') html = viewHistory();
  else if (v === 'settings') html = viewSettings();
  else if (v === 'danger') html = viewDanger();
  else html = viewHome();
  if (S.viewer) html += `<div class="viewer" role="dialog" aria-label="ดูรูป"><img src="${S.viewer}" alt="รูปผ้าอ้อมที่ถ่าย"><button type="button" class="viewer-close" data-act="viewer-close" aria-label="ปิด">${icon('close')}</button></div>`;
  $app.innerHTML = html;
  tick();
  const h1 = $app.querySelector('h1');
  if (h1 && S.lastView !== location.hash) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); window.scrollTo(0, 0); }
  S.lastView = location.hash;
}

/* ===================== ส่วนประกอบร่วม ===================== */
function nav(active) {
  const item = (hash, ic, label, key) => `<a href="${hash}" class="nav-item ${active === key ? 'on' : ''}" ${active === key ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></a>`;
  return `<nav class="nav" aria-label="เมนูหลัก">${item('#/', 'pencil', 'บันทึก', 'home')}${item('#/dash', 'chart', 'แดชบอร์ด', 'dash')}${item('#/history', 'clock', 'ประวัติ', 'history')}${item('#/settings', 'gear', 'ตั้งค่า', 'settings')}</nav>`;
}
function topbar(title, back = '#/') {
  return `<header class="topbar"><a class="icon-btn" href="${back}" aria-label="กลับ">${icon('back')}</a><h1>${esc(title)}</h1></header>`;
}
function syncChip() {
  const st = S.sync;
  if (!S.syncCfg.url) return `<a class="chip chip-muted" href="#/settings#sync">${icon('cloudOff', 's')}เก็บในเครื่อง</a>`;
  if (st.status === 'syncing') return `<span class="chip chip-muted">${icon('sync', 's spin')}กำลังซิงก์</span>`;
  if (st.status === 'error') return `<button type="button" class="chip chip-warn" data-act="sync" title="${esc(st.error)}">${icon('alert', 's')}ซิงก์ไม่สำเร็จ</button>`;
  if (st.status === 'offline') return `<span class="chip chip-muted">${icon('cloudOff', 's')}ออฟไลน์${st.pending ? ` · รอส่ง ${st.pending}` : ''}</span>`;
  if (st.pending || !st.lastAt) return `<button type="button" class="chip chip-muted" data-act="sync">${icon('sync', 's')}${st.pending ? `รอส่ง ${st.pending}` : 'ซิงก์'}</button>`;
  return `<button type="button" class="chip chip-ok" data-act="sync">${icon('check', 's')}ซิงก์แล้ว</button>`;
}
function msgList(msgs, max = 99) {
  const xs = msgs.filter((m) => m.level !== null).slice(0, max);
  if (!xs.length) return '';
  return `<ul class="msgs">${xs.map((m) => `<li class="${lvClass(m.level)}"><span class="dot"></span>${esc(m.text)}</li>`).join('')}</ul>`;
}
function ageText() {
  const d = S.sum.dolToday;
  if (!d) return '';
  const days = d - 1;
  if (days < 1) return 'เกิดวันนี้';
  if (days < 60) return `อายุ ${days} วัน`;
  return `อายุ ${Math.floor(days / 30.4)} เดือน ${Math.round(days % 30.4)} วัน`;
}
function recordLine(r) {
  let img = '', title = '', sub = hm(r.ts), lv = null;
  const dol = R.dayOfLife(S.settings.birthDate, R.localDate(r.ts));
  if (r.type === 'poop') {
    const m = stoolMeta(r.color); img = m ? `img/${m.img}` : '';
    title = `อึ · ${m ? m.short : 'ไม่ระบุสี'}${r.consistency && consMeta(r.consistency) ? ` · ${consMeta(r.consistency).label}` : ''}`;
    lv = R.evaluateStool(r, dol).level;
  } else if (r.type === 'pee') {
    const m = urineMeta(r.color); img = m ? `img/${m.img}` : '';
    title = `ฉี่ · ${m ? m.label : 'ไม่ระบุสี'}`; lv = R.evaluateUrine(r, dol).level;
  } else if (r.type === 'feed') {
    title = r.method === 'breast'
      ? `นม · เข้าเต้า${r.durL ? ` ซ้าย ${r.durL}` : ''}${r.durR ? ` ขวา ${r.durR}` : ''}${r.durL || r.durR ? ' นาที' : ''}`
      : `นม · ${R.FEED_METHODS[r.method] || 'ขวด'} ${r.amount || 0} มล.`;
  } else if (r.type === 'weight') title = `น้ำหนัก ${Number(r.amount).toFixed(2)} กก.`;
  else if (r.type === 'temp') { title = `อุณหภูมิ ${Number(r.tempC).toFixed(1)} °C${r.tempSite && R.TEMP_SITES[r.tempSite] ? ' · ' + R.TEMP_SITES[r.tempSite] : ''}`; lv = R.evaluateTemp(r, dol ? dol - 1 : null).level; }
  else if (r.type === 'jaundice') { title = `ตัวเหลือง · ${R.JAUNDICE_ZONES[Number(r.zone) || 0]}`; lv = R.evaluateJaundice(r, S.settings.birthDate, num(S.settings.gestationWeeks)).level; }
  else if (r.type === 'sleep') { title = `นอน ${r.endTs ? durText(r.endTs - r.ts) : ''}`; sub = `${hm(r.ts)}–${r.endTs ? hm(r.endTs) : ''}`; }
  else title = r.type;
  const ic = { feed: 'bottle', weight: 'scale', temp: 'thermo', jaundice: 'sun', sleep: 'moon' }[r.type] || 'scale';
  const thumb = img ? `<img src="${img}" alt="" class="thumb">` : `<span class="thumb thumb-ic thumb-${r.type}">${icon(ic, 's')}</span>`;
  const chip = lv !== null && lv !== undefined ? `<span class="lvchip ${lvClass(lv)}">${lvText(lv)}</span>` : '';
  return `<a class="row" href="#/log/${r.type}?id=${encodeURIComponent(r.id)}">${thumb}<span class="row-main"><span class="row-title">${esc(title)}</span><span class="row-sub">${sub}${r.photoId ? ' · มีรูป' : ''}${r.note ? ' · ' + esc(r.note) : ''}${r._dirty && S.syncCfg.url ? ' · รอซิงก์' : ''}</span></span>${chip}</a>`;
}

/* ===================== หน้าเริ่มต้นใช้งาน ===================== */
function viewOnboard() {
  const d = S.draft;
  return `<main class="page onboard">
    <div class="hero"><img src="icons/icon-192.png" alt="" width="72" height="72"><h1>ยินดีต้อนรับ</h1><p>บันทึกฉี่ อึ และการให้นมของลูก แล้วแอปจะช่วยดูว่าปกติหรือควรพบแพทย์</p></div>
    <form class="card form" data-form="onboard">
      ${settingsFields(d)}
      <button class="btn btn-primary" type="submit">เริ่มใช้งาน</button>
    </form>
    <p class="center small"><a href="#/settings" data-act="onboard-skip">มีรหัสครอบครัวจากอีกเครื่องแล้ว? เชื่อมต่อก่อน</a></p>
    <p class="center small"><button type="button" class="link" data-act="onboard-skip">ข้ามไปก่อน</button></p>
    <p class="disclaimer">แอปนี้ช่วยสังเกตตามแนวทางทั่วไป ไม่ใช่การวินิจฉัยทางการแพทย์ หากกังวลให้ปรึกษาแพทย์เสมอ</p>
  </main>`;
}
function settingsFields(d) {
  const v = (k) => esc(d[k] ?? S.settings[k] ?? '');
  const ft = d.feedingType ?? S.settings.feedingType;
  return `
    <label class="field"><span>ชื่อเล่นลูก</span><input name="babyName" value="${v('babyName')}" maxlength="40" autocomplete="off" placeholder="เช่น น้องข้าวหอม"></label>
    <label class="field"><span>วันเกิด</span><input name="birthDate" type="date" value="${v('birthDate')}" required></label>
    <div class="field-row">
      <label class="field"><span>น้ำหนักแรกเกิด (กก.)</span><input name="birthWeightKg" type="number" inputmode="decimal" step="0.01" min="0.5" max="6" value="${v('birthWeightKg')}" placeholder="3.20"></label>
      <label class="field"><span>อายุครรภ์ (สัปดาห์)</span><input name="gestationWeeks" type="number" inputmode="numeric" min="22" max="44" value="${v('gestationWeeks')}" placeholder="39"></label>
    </div>
    <fieldset class="field"><legend>การให้นม</legend><div class="seg">
      ${Object.entries({ breast: 'นมแม่', mixed: 'นมแม่ + นมผสม', formula: 'นมผสม' }).map(([k, l]) => `<label class="seg-opt"><input type="radio" name="feedingType" value="${k}" ${ft === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}
    </div></fieldset>`;
}

/* ===================== หน้าหลัก ===================== */
function viewHome() {
  const s = S.sum, o = s.overall, today = s.days.find((d) => d.isToday) || { wet: 0, stool: 0, feeds: 0 };
  const name = S.settings.babyName || 'ลูกน้อย';
  const ftLabel = { breast: 'นมแม่', mixed: 'นมแม่ + นมผสม', formula: 'นมผสม' }[S.settings.feedingType] || '';
  const status = o.level === null
    ? `<section class="status lv-none"><div class="status-title">ยังไม่มีบันทึก</div><div class="status-sub">เริ่มจากปุ่มด้านล่างได้เลย</div></section>`
    : `<a class="status ${lvClass(o.level)}" href="#/dash"><div class="status-badge">${icon(o.level === 0 ? 'check' : 'alert')}</div><div><div class="status-title">ภาพรวม: ${lvText(o.level)}</div>${o.msgs.filter((m) => m.level > 0).length ? msgList(o.msgs.filter((m) => m.level > 0), 3) : '<div class="status-sub">ไม่พบสิ่งผิดปกติ</div>'}</div></a>`;
  const timer = S.feedTimer && feedTimerRunning(S.feedTimer)
    ? `<a class="banner" href="#/log/feed">${icon('bottle')}<span>กำลังให้นม · <b data-tick="feed-total"></b> · แตะเพื่อจบมื้อ</span></a>` : '';
  const lastW = s.weight.latest;
  const recent = live().sort((a, b) => b.ts - a.ts).slice(0, 6);
  const today2 = s.days.find((d) => d.isToday) || {};
  const lastT = live().filter((r) => r.type === 'temp').sort((a, b) => b.ts - a.ts)[0];
  const lastJ = live().filter((r) => r.type === 'jaundice').sort((a, b) => b.ts - a.ts)[0];
  return `<main class="page">
    <header class="home-head"><div><div class="muted small">${esc(ageText())}${ftLabel ? ' · ' + ftLabel : ''}</div><h1>${esc(name)}</h1></div>${syncChip()}</header>
    ${S.swWaiting ? `<button type="button" class="banner banner-info" data-act="sw-update">มีเวอร์ชันใหม่ แตะเพื่ออัปเดต</button>` : ''}
    ${alertBanners()}
    ${status}${timer}
    ${S.sleepTimer ? `<a class="banner banner-sleep" href="#/log/sleep">${icon('moon')}<span>ลูกกำลังนอน · <b data-tick="sleep-run"></b> · แตะเมื่อตื่น</span></a>` : ''}
    <section class="grid2">
      <div class="card tile"><div class="muted small">นมมื้อล่าสุด</div><div class="big" data-tick="feed-ago">—</div><div class="bar"><div data-tick="feed-bar"></div></div><div class="small" data-tick="feed-next"></div></div>
      <div class="card tile"><div class="muted small">ฉี่ล่าสุด</div><div class="big" data-tick="pee-ago">—</div><div class="bar"><div data-tick="pee-bar" class="bar-ok"></div></div><div class="small muted">เตือนถ้าเกิน ${S.settings.peeAlertH} ชม.</div></div>
    </section>
    <h2 class="sec">บันทึกด่วน</h2>
    <section class="quick quick-3">
      <a class="qbtn" href="#/log/pee"><span class="qic qic-pee">${icon('drop')}</span><span class="qlabel">ฉี่</span><span class="qsub">วันนี้ ${today.wet}${s.dolToday ? ' / ' + R.expectedWet(s.dolToday) : ''}</span></a>
      <a class="qbtn" href="#/log/poop"><span class="qic qic-poop">${icon('diaper')}</span><span class="qlabel">อึ</span><span class="qsub">วันนี้ ${today.stool}${s.dolToday && R.expectedStool(s.dolToday, S.settings.feedingType) ? ' / ' + R.expectedStool(s.dolToday, S.settings.feedingType) : ''}</span></a>
      <a class="qbtn" href="#/log/feed"><span class="qic qic-feed">${icon('bottle')}</span><span class="qlabel">นม</span><span class="qsub">วันนี้ ${today.feeds} มื้อ</span></a>
      <a class="qbtn" href="#/log/temp"><span class="qic qic-temp">${icon('thermo')}</span><span class="qlabel">อุณหภูมิ</span><span class="qsub">${lastT ? Number(lastT.tempC).toFixed(1) + ' °C' : 'ยังไม่มี'}</span></a>
      <a class="qbtn" href="#/log/jaundice"><span class="qic qic-pee">${icon('sun')}</span><span class="qlabel">ตัวเหลือง</span><span class="qsub">${lastJ ? 'ระดับ ' + (Number(lastJ.zone) || 0) : 'ยังไม่มี'}</span></a>
      <a class="qbtn" href="#/log/sleep"><span class="qic qic-weight">${icon('moon')}</span><span class="qlabel">นอน</span><span class="qsub" data-tick="sleep-sub">${today2.sleepMin ? durText(today2.sleepMin * 60000) : 'วันนี้ —'}</span></a>
    </section>
    <a class="qrow" href="#/log/weight"><span class="qic qic-weight">${icon('scale')}</span><span class="qlabel">น้ำหนัก</span><span class="qsub">${lastW ? Number(lastW.amount).toFixed(2) + ' กก.' + (s.weight.lossPct !== null ? ` (${s.weight.lossPct > 0 ? '−' : '+'}${Math.abs(s.weight.lossPct)}%)` : '') : 'ยังไม่มีบันทึก'}</span></a>
    <h2 class="sec">ล่าสุด</h2>
    <section class="card list">${recent.length ? recent.map(recordLine).join('') : '<p class="empty">ยังไม่มีบันทึก</p>'}</section>
    <a class="danger-link" href="#/danger">${icon('alert')}อาการอันตรายที่ต้องไปโรงพยาบาลทันที</a>
  </main>${nav('home')}`;
}

/* ===================== หน้าบันทึก ===================== */
function loadDraft(type, id) {
  const key = `${type}:${id || 'new'}`;
  if (S.draftKey === key) return S.draft;
  S.draftKey = key; S.confirmDel = false;
  const rec = id ? S.records.find((r) => r.id === id) : null;
  if (rec) {
    S.draft = { ...rec };
    if (rec.photoId && !P.cachedUrl(rec.photoId)) {
      S.photoLoading = true;
      P.photoUrl(rec.photoId, { fetchRemote: !!S.syncCfg.url }).then(() => { S.photoLoading = false; if (S.draftKey === key) render(); });
    }
  }
  else {
    const base = { type, ts: Date.now(), note: '' };
    if (type === 'poop') Object.assign(base, { color: '', consistency: 'soft' });
    if (type === 'pee') Object.assign(base, { color: 'u2' });
    if (type === 'feed') {
      const lastF = live().filter((r) => r.type === 'feed').sort((a, b) => b.ts - a.ts)[0];
      Object.assign(base, { method: lastF && lastF.method ? lastF.method : (S.settings.feedingType === 'formula' ? 'formula' : 'breast'), amount: lastF && lastF.amount ? lastF.amount : '', durL: '', durR: '' });
    }
    if (type === 'weight') { const lw = S.sum.weight.latest; Object.assign(base, { amount: lw ? lw.amount : S.settings.birthWeightKg || '' }); }
    const lastOf = (t) => live().filter((r) => r.type === t).sort((a, b) => b.ts - a.ts)[0];
    if (type === 'temp') { const lt = lastOf('temp'); Object.assign(base, { tempC: lt ? Number(lt.tempC) : 36.8, tempSite: lt && lt.tempSite ? lt.tempSite : 'axilla' }); }
    if (type === 'jaundice') { const lj = lastOf('jaundice'); Object.assign(base, { zone: lj ? Number(lj.zone) || 0 : 0 }); }
    if (type === 'sleep') Object.assign(base, { ts: Date.now() - 2 * 3600000, endTs: Date.now() });
    S.draft = base;
  }
  return S.draft;
}

function viewLog(type, id) {
  if (!['pee', 'poop', 'feed', 'weight', 'temp', 'jaundice', 'sleep'].includes(type)) return viewHome();
  const d = loadDraft(type, id);
  const titles = { pee: 'บันทึกฉี่', poop: 'บันทึกอึ', feed: 'บันทึกนม', weight: 'บันทึกน้ำหนัก', temp: 'บันทึกอุณหภูมิ', jaundice: 'บันทึกตัวเหลือง', sleep: 'บันทึกการนอน' };
  const editing = !!id;
  const time = `<label class="timefield">${icon('clock', 's')}<span class="sr">เวลา</span><input type="datetime-local" name="ts" value="${toLocalInput(d.ts)}" data-bind="ts"></label>`;
  let body = '';
  if (type === 'poop') body = poopBody(d);
  if (type === 'pee') body = peeBody(d);
  if (type === 'feed') body = feedBody(d, editing);
  if (type === 'weight') body = weightBody(d);
  if (type === 'temp') body = tempBody(d);
  if (type === 'jaundice') body = jaundiceBody(d);
  if (type === 'sleep') return sleepView(d, editing, titles);
  const del = editing ? `<button type="button" class="btn btn-danger-outline" data-act="delete">${icon('trash', 's')}${S.confirmDel ? 'แตะอีกครั้งเพื่อยืนยันลบ' : 'ลบรายการนี้'}</button>` : '';
  return `<main class="page page-form">
    ${topbar(editing ? 'แก้ไข' + titles[type].replace('บันทึก', '') : titles[type], editing ? '#/history' : '#/')}
    <div class="row-between pad">${time}</div>
    ${body}
    <div class="pad"><label class="field"><span>หมายเหตุ (ไม่บังคับ)</span><input name="note" value="${esc(d.note)}" maxlength="200" data-bind="note" placeholder="เช่น หลังอาบน้ำ"></label></div>
    <div class="pad">${del}</div>
  </main>
  <footer class="savebar"><button type="button" class="btn btn-primary btn-block" data-act="save" ${type === 'poop' && !d.color ? 'disabled' : ''}>${type === 'feed' && !editing && S.feedTimer && feedTimerRunning(S.feedTimer) ? 'จบมื้อและบันทึก' : 'บันทึก'}</button></footer>`;
}

function poopBody(d) {
  const dol = R.dayOfLife(S.settings.birthDate, R.localDate(d.ts));
  const badge = (c) => {
    const ev = R.evaluateStool({ color: c.id }, dol);
    const t = c.id === 's04' && ev.level === 0 ? 'ปกติวันที่ 1–4' : c.pale ? 'พบแพทย์ใน 24 ชม.' : lvText(ev.level);
    return `<span class="badge ${lvClass(ev.level)}">${t}</span>`;
  };
  const cards = R.STOOL_COLORS.map((c) => `<button type="button" class="swatch ${d.color === c.id ? 'on ' + lvClass(R.evaluateStool({ color: c.id }, dol).level) : ''}" data-act="pick-color" data-v="${c.id}" aria-pressed="${d.color === c.id}">
      <img src="img/${c.img}" alt="" loading="lazy"><span class="sw-label">${esc(c.label)}</span>${badge(c)}</button>`).join('');
  const ev = d.color ? R.evaluateStool(d, dol) : null;
  const result = ev ? `<section class="result ${lvClass(ev.level)}"><div class="result-title">${esc(stoolMeta(d.color).label)} — ${d.color === 's04' && ev.level === 0 ? 'ปกติในช่วงวันแรก' : lvText(ev.level)}</div>${ev.msgs.length ? msgList(ev.msgs) : `<div class="small">${stoolNormalText(d.color)}</div>`}</section>` : '';
  const cons = R.CONSISTENCY.map((c) => `<button type="button" class="pill ${d.consistency === c.id ? 'on' : ''}" data-act="pick-cons" data-v="${c.id}" aria-pressed="${d.consistency === c.id}">${c.label}</button>`).join('');
  return `${photoPanel(d, stoolMeta(d.color))}<p class="hint pad">แตะภาพที่ใกล้เคียงที่สุด · ดูในแสงธรรมชาติ ถ้าก้ำกึ่งกับภาพสีซีด ให้เลือกสีซีดไว้ก่อน</p>
    <section class="swatches" aria-label="สีอุจจาระ">${cards}</section>
    ${result}
    <h2 class="sec pad">ลักษณะ</h2><div class="pills pad">${cons}</div>`;
}
function photoInput(label, cls) {
  return `<label class="${cls}">${label}<input type="file" accept="image/*" capture="environment" data-act="photo-input" hidden></label>`;
}
function photoPanel(d, ref) {
  if (!d.photoId) return `<div class="pad">${photoInput(`${icon('camera')}ถ่ายรูปผ้าอ้อมเพื่อเทียบสี (ไม่บังคับ)`, 'btn btn-block photo-btn')}</div>`;
  const url = P.cachedUrl(d.photoId);
  const ph = S.photoLoading ? 'กำลังโหลดรูป…' : S.syncCfg.url ? 'โหลดรูปไม่ได้ (ออฟไลน์?)' : 'ไม่พบรูปในเครื่องนี้';
  return `<section class="compare" aria-label="เทียบรูปจริงกับภาพตัวอย่าง">
    <figure><button type="button" class="cmp-img" data-act="photo-view" ${url ? '' : 'disabled'}>${url ? `<img src="${url}" alt="รูปผ้าอ้อมที่ถ่าย">` : `<span class="cmp-ph">${ph}</span>`}</button><figcaption>รูปจริง · แตะเพื่อขยาย</figcaption></figure>
    <figure><div class="cmp-img">${ref ? `<img src="img/${ref.img}" alt="">` : '<span class="cmp-ph">แตะเลือกภาพด้านล่าง</span>'}</div><figcaption>${ref ? 'ตัวอย่าง: ' + esc(ref.short || ref.label) : 'ภาพตัวอย่าง'}</figcaption></figure>
    <div class="cmp-actions">${photoInput('ถ่ายใหม่', 'link')}<button type="button" class="link" data-act="photo-remove">ลบรูป</button></div>
    <p class="cmp-note">สีบนจออาจเพี้ยนตามแสง ถ้าก้ำกึ่งกับภาพสีซีด ให้ถือว่าผิดปกติไว้ก่อนและส่งรูปให้แพทย์ดู</p>
  </section>`;
}
function stoolNormalText(id) {
  return {
    s04: 'ขี้เทาพบได้ใน 1–3 วันแรก ควรเปลี่ยนสีภายในวันที่ 4–5',
    s05: 'พบในวันที่ 3–5 เมื่อได้นมมากขึ้น เป็นสัญญาณที่ดี',
    s06: 'ลักษณะปกติของเด็กกินนมแม่ เม็ดเล็ก ๆ คือไขมันนม',
    s07: 'พบได้ปกติเป็นครั้งคราว',
    s08: 'พบบ่อยในเด็กกินนมผสม ปกติ',
    s09: 'อยู่ในช่วงปกติ'
  }[id] || '';
}
function peeBody(d) {
  const dol = R.dayOfLife(S.settings.birthDate, R.localDate(d.ts));
  const cards = R.URINE_COLORS.map((c) => {
    const lv = R.evaluateUrine({ color: c.id }, dol).level;
    return `<button type="button" class="swatch ${d.color === c.id ? 'on ' + lvClass(lv) : ''}" data-act="pick-color" data-v="${c.id}" aria-pressed="${d.color === c.id}"><img src="img/${c.img}" alt="" loading="lazy"><span class="sw-label">${esc(c.label)}</span><span class="badge ${lvClass(lv)}">${lvText(lv)}</span></button>`;
  }).join('');
  const ev = R.evaluateUrine(d, dol);
  return `${photoPanel(d, urineMeta(d.color))}<p class="hint pad">เลือกสีคราบบนผ้าอ้อม (ไม่แน่ใจ เลือก "เหลือง" ได้)</p>
    <section class="swatches" aria-label="สีปัสสาวะ">${cards}</section>
    ${ev.msgs.length ? `<section class="result ${lvClass(ev.level)}">${msgList(ev.msgs)}</section>` : ''}`;
}

/* ---------- ให้นม ---------- */
function feedTimerRunning(t) { return !!(t && (t.L.runFrom || t.R.runFrom)); }
function sideMs(t, side) { const x = t[side]; return x.acc + (x.runFrom ? Date.now() - x.runFrom : 0); }
async function setFeedTimer(t) { S.feedTimer = t; await db.set('feedTimer', t); }

function feedBody(d, editing) {
  const g = S.sum.guideToday;
  const seg = Object.entries(R.FEED_METHODS).map(([k, l]) => `<button type="button" class="seg-btn ${d.method === k ? 'on' : ''}" data-act="pick-method" data-v="${k}" aria-pressed="${d.method === k}">${l}</button>`).join('');
  let main = '';
  if (d.method === 'breast') {
    if (editing) {
      main = `<div class="pad"><div class="field-row"><label class="field"><span>ซ้าย (นาที)</span><input type="number" inputmode="numeric" min="0" max="120" value="${esc(d.durL ?? '')}" data-bind="durL"></label><label class="field"><span>ขวา (นาที)</span><input type="number" inputmode="numeric" min="0" max="120" value="${esc(d.durR ?? '')}" data-bind="durR"></label></div></div>`;
    } else {
      const t = S.feedTimer;
      const lastBreast = live().filter((r) => r.type === 'feed' && r.method === 'breast').sort((a, b) => b.ts - a.ts)[0];
      const suggest = lastBreast && lastBreast.side ? (lastBreast.side === 'L' ? 'R' : 'L') : null;
      const sideBtn = (sd, label) => {
        const on = t && t[sd].runFrom;
        return `<button type="button" class="timer ${on ? 'run' : ''}" data-act="timer" data-v="${sd}" aria-pressed="${!!on}"><span class="t-side">${label}${suggest === sd && !t ? ' · ควรเริ่มข้างนี้' : ''}</span><span class="t-time" data-tick="side-${sd}">0:00</span><span class="t-hint">${icon(on ? 'pause' : 'play', 's')}${on ? 'แตะเพื่อหยุด' : 'แตะเพื่อเริ่ม'}</span></button>`;
      };
      main = `<div class="timers pad">${sideBtn('L', 'ซ้าย')}${sideBtn('R', 'ขวา')}</div>
        ${t ? `<p class="center small muted">เริ่มมื้อ ${hm(t.startTs)} · <button type="button" class="link" data-act="timer-reset">เริ่มนับใหม่</button></p>` : `<p class="center small muted">${lastBreast && lastBreast.side ? `มื้อก่อนจบที่ข้าง${lastBreast.side === 'L' ? 'ซ้าย' : 'ขวา'}` : 'กดข้างที่เริ่มให้นม แอปจะจับเวลาให้ ปิดแอปได้ เวลายังเดินต่อ'}</p>`}
        <details class="pad manual"><summary>ลืมจับเวลา? ใส่นาทีเอง</summary><div class="field-row"><label class="field"><span>ซ้าย (นาที)</span><input type="number" inputmode="numeric" min="0" max="120" value="${esc(d.durL ?? '')}" data-bind="durL"></label><label class="field"><span>ขวา (นาที)</span><input type="number" inputmode="numeric" min="0" max="120" value="${esc(d.durR ?? '')}" data-bind="durR"></label></div></details>`;
    }
  } else {
    const presets = [...new Set([g.perFeedMin, g.perFeedMax, 30, 60, 90, 120].filter((x) => x))].sort((a, b) => a - b).slice(0, 6);
    main = `<div class="amount pad"><button type="button" class="round" data-act="amt" data-v="-10" aria-label="ลด 10 มล.">−</button>
      <label class="amt-val"><input type="number" inputmode="numeric" min="0" max="400" value="${esc(d.amount ?? '')}" data-bind="amount" aria-label="ปริมาณ มล." placeholder="0"><span>มล.</span></label>
      <button type="button" class="round" data-act="amt" data-v="10" aria-label="เพิ่ม 10 มล.">+</button></div>
      <div class="pills pad center">${presets.map((p) => `<button type="button" class="pill ${Number(d.amount) === p ? 'on' : ''}" data-act="amt-set" data-v="${p}">${p}</button>`).join('')}</div>`;
  }
  const guide = g.perFeedMin ? `<section class="card pad-in guide">
      <div class="guide-title">แนวทางวันนี้${S.sum.dolToday ? ` (วันที่ ${S.sum.dolToday})` : ''}</div>
      <div class="grid2"><div class="mini"><div class="muted small">ความถี่</div><div class="b">8–12 มื้อ/วัน</div><div class="muted small">ทุก 2–3 ชม.</div></div>
      <div class="mini"><div class="muted small">ถ้าให้ขวด</div><div class="b">${g.perFeedMin}–${g.perFeedMax} มล./มื้อ</div><div class="muted small">${g.dailyMin}–${g.dailyMax} มล./วัน</div></div></div>
      <div class="muted small">${esc(g.basis)}</div></section>` : `<section class="card pad-in small muted">ใส่วันเกิดและน้ำหนักในหน้าตั้งค่า เพื่อดูปริมาณนมที่เหมาะสม</section>`;
  return `<div class="seg seg-btns pad" role="group" aria-label="วิธีให้นม">${seg}</div>${main}<div class="pad">${guide}</div>`;
}

function weightBody(d) {
  const bw = num(S.settings.birthWeightKg);
  const w = num(d.amount);
  const pct = bw && w ? Math.round(((bw - w) / bw) * 1000) / 10 : null;
  return `<div class="amount pad"><button type="button" class="round" data-act="wt" data-v="-0.01" aria-label="ลด 10 กรัม">−</button>
    <label class="amt-val"><input type="number" inputmode="decimal" step="0.005" min="0.5" max="20" value="${esc(d.amount ?? '')}" data-bind="amount" aria-label="น้ำหนัก กก."><span>กก.</span></label>
    <button type="button" class="round" data-act="wt" data-v="0.01" aria-label="เพิ่ม 10 กรัม">+</button></div>
    ${pct !== null ? `<p class="center ${pct > 10 ? 'txt-2' : pct >= 7 ? 'txt-1' : 'muted'}">${pct >= 0 ? `ลดลง ${pct}%` : `เพิ่มขึ้น ${Math.abs(pct)}%`} จากแรกเกิด (${bw} กก.)</p>` : `<p class="center muted small">ใส่น้ำหนักแรกเกิดในหน้าตั้งค่า เพื่อดู % ที่เปลี่ยนไป</p>`}
    <p class="hint pad">ชั่งด้วยเครื่องชั่งเดิมทุกครั้ง ตอนไม่ใส่ผ้าอ้อม จะเทียบกันได้แม่นที่สุด</p>`;
}

/* ---------- อุณหภูมิ ---------- */
function tempBody(d) {
  const t = num(d.tempC) ?? 36.8;
  const dol = R.dayOfLife(S.settings.birthDate, R.localDate(d.ts));
  const ev = R.evaluateTemp({ tempC: t }, dol ? dol - 1 : null);
  const pos = Math.max(0, Math.min(100, ((t - 35.5) / (39 - 35.5)) * 100));
  const sites = Object.entries(R.TEMP_SITES).map(([k, l]) => `<button type="button" class="pill ${d.tempSite === k ? 'on' : ''}" data-act="pick-site" data-v="${k}" aria-pressed="${d.tempSite === k}">${l}</button>`).join('');
  return `<div class="pills pad center">${sites}</div>
    <div class="amount pad"><button type="button" class="round" data-act="tmp" data-v="-0.1" aria-label="ลด 0.1 องศา">−</button>
      <label class="amt-val"><input type="number" inputmode="decimal" step="0.1" min="30" max="43" value="${t.toFixed(1)}" data-bind="tempC" aria-label="อุณหภูมิ องศาเซลเซียส"><span>°C</span></label>
      <button type="button" class="round" data-act="tmp" data-v="0.1" aria-label="เพิ่ม 0.1 องศา">+</button></div>
    <div class="pad"><div class="tscale" aria-hidden="true"><i style="flex:5" class="ts-cold"></i><i style="flex:5" class="ts-watch"></i><i style="flex:10" class="ts-ok"></i><i style="flex:4" class="ts-watch"></i><i style="flex:11" class="ts-hot"></i><b style="left:${pos}%"></b></div>
    <div class="tscale-lbl small muted"><span style="left:${((36 - 35.5) / 3.5) * 100}%">36.0</span><span style="left:${((36.5 - 35.5) / 3.5) * 100}%">36.5</span><span style="left:${((37.5 - 35.5) / 3.5) * 100}%">37.5</span><span style="left:${((38 - 35.5) / 3.5) * 100}%">38.0</span></div></div>
    <section class="result ${lvClass(ev.level)}"><div class="result-title">${ev.level === 0 ? 'ปกติ (36.5–37.5 °C)' : lvText(ev.level)}</div>${msgList(ev.msgs)}</section>
    <p class="hint pad">วัดรักแร้: หนีบปรอทให้แนบผิว 1–3 นาทีตามชนิดปรอท · ทารกต่ำกว่า 3 เดือน ถ้าถึง 38.0 °C ให้ไปโรงพยาบาลทันที ไม่ต้องรอดูอาการ</p>`;
}

/* ---------- ตัวเหลือง ---------- */
function jaundiceBody(d) {
  const z = Number(d.zone) || 0;
  const fill = (n) => (z >= n && z > 0 ? 'jz-on' : 'jz-off');
  const part = (n, shape) => shape.replace('class="Z"', `class="jz ${fill(n)}" data-act="pick-zone" data-v="${n}"`);
  const svg = `<svg viewBox="0 0 120 210" class="body-map" role="img" aria-label="แผนภาพร่างกาย แตะบริเวณที่เหลืองลามไปถึง ตอนนี้ระดับ ${z}">
    ${part(4, '<rect class="Z" x="14" y="62" width="18" height="56" rx="9"/>')}${part(4, '<rect class="Z" x="88" y="62" width="18" height="56" rx="9"/>')}
    ${part(4, '<rect class="Z" x="40" y="152" width="18" height="34" rx="8"/>')}${part(4, '<rect class="Z" x="62" y="152" width="18" height="34" rx="8"/>')}
    ${part(3, '<rect class="Z" x="38" y="92" width="44" height="30" rx="8"/>')}${part(3, '<rect class="Z" x="40" y="120" width="18" height="34" rx="8"/>')}${part(3, '<rect class="Z" x="62" y="120" width="18" height="34" rx="8"/>')}
    ${part(2, '<rect class="Z" x="36" y="56" width="48" height="38" rx="12"/>')}
    ${part(1, '<circle class="Z" cx="60" cy="30" r="24"/>')}
    ${part(5, '<circle class="Z" cx="23" cy="124" r="8"/>')}${part(5, '<circle class="Z" cx="97" cy="124" r="8"/>')}
    ${part(5, '<ellipse class="Z" cx="49" cy="194" rx="11" ry="7"/>')}${part(5, '<ellipse class="Z" cx="71" cy="194" rx="11" ry="7"/>')}
  </svg>`;
  const ev = R.evaluateJaundice({ ...d, zone: z }, S.settings.birthDate, num(S.settings.gestationWeeks),
    live().some((r) => r.type === 'poop' && ['s01', 's02', 's03'].includes(r.color) && Date.now() - r.ts < 3 * 86400000));
  const lv = (n) => R.evaluateJaundice({ ts: d.ts, zone: n }, S.settings.birthDate, num(S.settings.gestationWeeks)).level;
  const list = R.JAUNDICE_ZONES.map((l, n) => `<button type="button" class="zbtn ${z === n ? 'on ' + lvClass(lv(n)) : ''}" data-act="pick-zone" data-v="${n}" aria-pressed="${z === n}"><b>${n}</b> ${l}</button>`).join('');
  return `<p class="hint pad">ในแสงธรรมชาติ ใช้นิ้วกดผิวเบา ๆ แล้วปล่อย ดูว่าผิวตรงนั้นยังเหลืองไหม ไล่จากหัวลงมาเท้า แล้วแตะส่วนที่ต่ำที่สุดที่ยังเหลือง</p>
    <div class="jaundice pad">${svg}<div class="zlist">${list}</div></div>
    ${z > 0 || ev.msgs.length ? `<section class="result ${lvClass(ev.level)}"><div class="result-title">ระดับ ${z} — ${lvText(ev.level)}</div>${msgList(ev.msgs)}</section>` : `<section class="result lv-0"><div class="result-title">ไม่เหลือง</div></section>`}
    <p class="hint pad">การดูด้วยตาเป็นการคัดกรองเบื้องต้นเท่านั้น ค่าที่แม่นยำต้องเจาะเลือดหรือใช้เครื่องวัดที่โรงพยาบาล</p>`;
}

/* ---------- การนอน ---------- */
function sleepView(d, editing, titles) {
  const t = S.sleepTimer;
  const top = topbar(editing ? 'แก้ไขการนอน' : titles.sleep, editing ? '#/history' : '#/');
  const manual = `<div class="pad"><div class="field-row">
      <label class="field"><span>เริ่มนอน</span><input type="datetime-local" value="${toLocalInput(d.ts)}" data-bind="ts"></label>
      <label class="field"><span>ตื่น</span><input type="datetime-local" value="${toLocalInput(d.endTs || Date.now())}" data-bind="endTs"></label></div>
      ${d.endTs > d.ts ? `<p class="small muted center">รวม ${durText(d.endTs - d.ts)}</p>` : '<p class="small txt-2 center">เวลาตื่นต้องหลังเวลาเริ่มนอน</p>'}</div>`;
  if (editing) {
    return `<main class="page page-form">${top}${manual}
      <div class="pad"><label class="field"><span>หมายเหตุ (ไม่บังคับ)</span><input value="${esc(d.note)}" maxlength="200" data-bind="note"></label></div>
      <div class="pad"><button type="button" class="btn btn-danger-outline" data-act="delete">${icon('trash', 's')}${S.confirmDel ? 'แตะอีกครั้งเพื่อยืนยันลบ' : 'ลบรายการนี้'}</button></div></main>
      <footer class="savebar"><button type="button" class="btn btn-primary btn-block" data-act="save">บันทึก</button></footer>`;
  }
  const dol = S.sum.dolToday;
  const big = t
    ? `<button type="button" class="sleep-btn run" data-act="sleep-stop"><span class="t-side">กำลังนอน ตั้งแต่ ${hm(t.startTs)}</span><span class="t-time" data-tick="sleep-big">0:00:00</span><span class="t-hint">${icon('check', 's')}แตะเมื่อลูกตื่น</span></button>`
    : `<button type="button" class="sleep-btn" data-act="sleep-start"><span class="t-time">${icon('moon')}</span><span class="t-side">แตะเมื่อลูกเริ่มนอน</span><span class="t-hint">แอปจะนับเวลาให้ ปิดแอปได้</span></button>`;
  return `<main class="page page-form">${top}
    <div class="pad">${big}</div>
    ${t ? `<p class="center small"><button type="button" class="link" data-act="sleep-cancel">ยกเลิก (กดผิด)</button></p>` : ''}
    <section class="card pad-in pad-m small muted">ทารก 0–3 เดือนนอนรวมประมาณ 14–17 ชม./วัน${R.needsWakeForFeeds(dol, null) ? ' · ช่วงนี้ถ้านอนเกิน 4 ชม. ควรปลุกให้นม แอปจะเตือนให้' : ''}</section>
    ${t ? '' : `<details class="pad manual" ${d._manual ? 'open' : ''}><summary>ลืมกด? บันทึกย้อนหลัง</summary>${manual.replace('<div class="pad">', '<div>')}<button type="button" class="btn btn-primary btn-block" data-act="save">บันทึกย้อนหลัง</button></details>`}
  </main>`;
}

/* ===================== แดชบอร์ด ===================== */
function viewDash() {
  const s = S.sum, o = s.overall;
  const days = s.days;
  const labels = days.map((d) => (d.isToday ? 'วันนี้' : d.dol ? `ว.${d.dol}` : dateTh(d.date).split(' ')[0]));
  const today = days.find((d) => d.isToday) || {};
  const stoolStacks = days.map((d) => R.STOOL_COLORS.map((c) => ({ v: d.colors[c.id] || 0, color: c.hex })).concat([{ v: d.colors.x || 0, color: '#999' }]));
  const usedColors = R.STOOL_COLORS.filter((c) => days.some((d) => d.colors[c.id]));
  const hasBottle = days.some((d) => d.bottleMl > 0);
  const wPts = live().filter((r) => r.type === 'weight').map((r) => ({ day: R.dayOfLife(S.settings.birthDate, R.localDate(r.ts)), kg: Number(r.amount) })).filter((p) => p.day);
  const tile = (label, v, sub) => `<div class="card tile tile-sm"><div class="muted small">${label}</div><div class="big">${v}${sub ? `<span class="muted small"> ${sub}</span>` : ''}</div></div>`;
  return `<main class="page">
    <header class="home-head"><h1>แดชบอร์ด</h1><div class="seg seg-btns seg-sm" role="group" aria-label="ช่วงเวลา">
      <button type="button" class="seg-btn ${S.range === 7 ? 'on' : ''}" data-act="range" data-v="7" aria-pressed="${S.range === 7}">7 วัน</button>
      <button type="button" class="seg-btn ${S.range === 14 ? 'on' : ''}" data-act="range" data-v="14" aria-pressed="${S.range === 14}">14 วัน</button></div></header>
    <section class="status ${lvClass(o.level)}"><div><div class="status-title">ภาพรวม: ${lvText(o.level)}</div>${msgList(o.msgs) || '<div class="status-sub">ไม่พบสิ่งผิดปกติในช่วงนี้</div>'}</div></section>
    <section class="grid4">
      ${tile('ฉี่วันนี้', today.wet ?? 0, today.expWet ? `/${today.expWet}` : '')}
      ${tile('อึวันนี้', today.stool ?? 0, today.expStool ? `/${today.expStool}` : '')}
      ${tile('นม', today.feeds ?? 0, 'มื้อ')}
      ${tile('น้ำหนัก', s.weight.lossPct !== null ? `${s.weight.lossPct > 0 ? '−' : '+'}${Math.abs(s.weight.lossPct)}` : '—', s.weight.lossPct !== null ? '%' : '')}
    </section>
    <section class="card chart-card"><div class="chart-head"><h2>ฉี่ต่อวัน</h2><span class="legend"><i class="lg-min"></i>ขั้นต่ำตามอายุ</span></div>
      ${C.bars({ labels, values: days.map((d) => d.wet), mins: days.map((d) => d.expWet), color: 'var(--pee)', label: 'จำนวนฉี่ต่อวัน' })}</section>
    <section class="card chart-card"><div class="chart-head"><h2>อึต่อวัน แยกสี</h2><span class="legend"><i class="lg-min"></i>ขั้นต่ำ</span></div>
      ${C.bars({ labels, stacks: stoolStacks, mins: days.map((d) => d.expStool || null), label: 'จำนวนอึต่อวันแยกสี' })}
      <div class="legend-row">${usedColors.map((c) => `<span><i style="background:${c.hex}"></i>${c.short}</span>`).join('') || '<span class="muted">ยังไม่มีข้อมูล</span>'}</div></section>
    <section class="card chart-card"><div class="chart-head"><h2>มื้อนมต่อวัน</h2><span class="legend"><i class="lg-h"></i>8 มื้อ</span></div>
      ${C.bars({ labels, values: days.map((d) => d.feeds), hline: S.sum.dolToday && S.sum.dolToday <= 28 ? 8 : null, label: 'จำนวนมื้อนมต่อวัน' })}</section>
    ${hasBottle ? `<section class="card chart-card"><div class="chart-head"><h2>นมขวดรวม (มล.)</h2><span class="legend"><i class="lg-min"></i>ขั้นต่ำตามแนวทาง</span></div>
      ${C.bars({ labels, values: days.map((d) => d.bottleMl), mins: days.map((d) => (S.settings.feedingType === 'formula' ? d.guide.dailyMin : null)), color: 'var(--accent)', label: 'ปริมาณนมขวดต่อวัน' })}</section>` : ''}
    ${wPts.length && num(S.settings.birthWeightKg) ? `<section class="card chart-card"><div class="chart-head"><h2>น้ำหนัก (กก.)</h2></div>${C.weight({ points: wPts, birthKg: num(S.settings.birthWeightKg), label: 'น้ำหนักเทียบแรกเกิด' })}</section>` : ''}
    ${days.some((d) => d.maxTemp !== null) ? `<section class="card chart-card"><div class="chart-head"><h2>อุณหภูมิสูงสุดต่อวัน (°C)</h2><span class="legend"><i class="lg-h"></i>38.0</span></div>
      ${C.temps({ labels, values: days.map((d) => d.maxTemp), label: 'อุณหภูมิสูงสุดต่อวัน' })}</section>` : ''}
    ${days.some((d) => d.sleepMin) ? `<section class="card chart-card"><div class="chart-head"><h2>นอนรวมต่อวัน (ชม.)</h2><span class="legend"><i class="lg-h"></i>14 ชม.</span></div>
      ${C.bars({ labels, values: days.map((d) => (d.sleepMin ? Math.round(d.sleepMin / 6) / 10 : null)), hline: 14, color: '#7A73C9', label: 'ชั่วโมงนอนต่อวัน' })}
      <p class="small muted">นับเฉพาะช่วงที่บันทึก ถ้าไม่ได้บันทึกทุกครั้ง ตัวเลขจะต่ำกว่าจริง</p></section>` : ''}
    <h2 class="sec">สรุปรายวัน</h2>
    <section class="card list">${[...days].reverse().map((d) => `<details class="day"><summary><span class="day-date">${d.isToday ? 'วันนี้' : dateTh(d.date)}${d.dol ? ` <span class="muted small">วันที่ ${d.dol}</span>` : ''}</span><span class="day-nums">ฉี่ ${d.wet} · อึ ${d.stool} · นม ${d.feeds}</span><span class="lvchip ${lvClass(d.isToday && d.level === 0 ? null : d.level)}">${d.isToday ? (d.level > 0 ? lvText(d.level) : 'ยังไม่ครบวัน') : lvText(d.level)}</span></summary>${msgList(d.msgs) || '<p class="small muted">ครบเกณฑ์</p>'}${d.bottleMl ? `<p class="small muted">นมขวด ${d.bottleMl} มล.</p>` : ''}${d.breastMin ? `<p class="small muted">เข้าเต้ารวม ${d.breastMin} นาที</p>` : ''}${d.maxTemp !== null ? `<p class="small muted">อุณหภูมิสูงสุด ${d.maxTemp.toFixed(1)} °C</p>` : ''}${d.maxZone !== null ? `<p class="small muted">ตัวเหลืองสูงสุด ระดับ ${d.maxZone}</p>` : ''}${d.sleepMin ? `<p class="small muted">นอนรวม ${durText(d.sleepMin * 60000)}</p>` : ''}</details>`).join('')}</section>
    <p class="disclaimer">ประเมินตามแนวทางทั่วไป ไม่ใช่การวินิจฉัย · วันนี้ยังไม่ครบ 24 ชม. จึงประเมินเฉพาะสีและลักษณะ</p>
  </main>${nav('dash')}`;
}

/* ===================== ประวัติ ===================== */
function viewHistory() {
  const recs = live().sort((a, b) => b.ts - a.ts);
  const groups = new Map();
  for (const r of recs) { const d = R.localDate(r.ts); if (!groups.has(d)) groups.set(d, []); groups.get(d).push(r); }
  const keys = [...groups.keys()];
  const shown = keys.slice(0, S.histLimit);
  return `<main class="page"><header class="home-head"><h1>ประวัติ</h1><span class="muted small">${recs.length} รายการ</span></header>
    ${shown.length ? shown.map((d) => `<h2 class="sec">${d === S.sum.today ? 'วันนี้' : dateThFull(d)}${R.dayOfLife(S.settings.birthDate, d) ? ` <span class="muted small">· วันที่ ${R.dayOfLife(S.settings.birthDate, d)}</span>` : ''}</h2><section class="card list">${groups.get(d).map(recordLine).join('')}</section>`).join('') : '<p class="empty">ยังไม่มีบันทึก</p>'}
    ${keys.length > shown.length ? `<button type="button" class="btn btn-block" data-act="more">แสดงเพิ่ม</button>` : ''}
    <p class="small muted center">แตะรายการเพื่อแก้ไขหรือลบ</p>
  </main>${nav('history')}`;
}

/* ===================== ตั้งค่า ===================== */
function viewSettings() {
  const cfg = S.syncCfg, st = S.sync;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  return `<main class="page"><header class="home-head"><h1>ตั้งค่า</h1></header>
    <form class="card form" data-form="settings"><h2 class="card-title">ข้อมูลลูก</h2>${settingsFields(S.draft)}
      <div class="field-row">
        <label class="field"><span>เตือนมื้อนมทุก (ชม.)</span><input name="feedIntervalH" type="number" inputmode="decimal" min="1.5" max="5" step="0.5" value="${esc(S.settings.feedIntervalH)}"></label>
        <label class="field"><span>เตือนไม่มีฉี่เกิน (ชม.)</span><input name="peeAlertH" type="number" inputmode="numeric" min="4" max="8" value="${esc(S.settings.peeAlertH)}"></label>
      </div>
      <button class="btn btn-primary" type="submit">บันทึกการตั้งค่า</button></form>

    <section class="card form" id="sync"><h2 class="card-title">ซิงก์กับ Google Sheet</h2>
      <p class="small muted">ใส่ URL ของ Web app และรหัสครอบครัวจากแผ่นงาน Config เพื่อสำรองข้อมูลและใช้ร่วมกับคู่สมรส ถ้าไม่ใส่ ข้อมูลจะอยู่ในเครื่องนี้เท่านั้น</p>
      <form data-form="sync" class="form">
        <label class="field"><span>Web app URL</span><input name="url" type="url" inputmode="url" value="${esc(cfg.url)}" placeholder="https://script.google.com/macros/s/.../exec" autocomplete="off" spellcheck="false"></label>
        <label class="field"><span>รหัสครอบครัว</span><input name="key" value="${esc(cfg.key)}" autocomplete="off" spellcheck="false" placeholder="32 ตัวอักษร"></label>
        <div class="btn-row"><button class="btn btn-primary" type="submit">เชื่อมต่อและซิงก์</button>${cfg.url ? '<button type="button" class="btn" data-act="sync">ซิงก์ตอนนี้</button>' : ''}</div>
      </form>
      <p class="small ${st.status === 'error' ? 'txt-2' : 'muted'}">${st.status === 'error' ? esc(st.error) : st.lastAt ? `ซิงก์ล่าสุด ${hm(st.lastAt)} · รอส่ง ${st.pending} รายการ` : cfg.url ? 'ยังไม่เคยซิงก์' : 'ยังไม่ได้ตั้งค่า'}</p>
    </section>

    <section class="card form" id="notify"><h2 class="card-title">การแจ้งเตือน</h2>
      <label class="toggle"><span>แจ้งเตือนบนหน้าจอ<span class="small muted">ถึงเวลาให้นม · ไม่มีฉี่นาน · วัดไข้ซ้ำ · นอนนาน · มีไข้</span></span><input type="checkbox" data-act="notify-toggle" ${S.notify.enabled ? 'checked' : ''}></label>
      <label class="toggle"><span>เสียงและสั่น</span><input type="checkbox" data-act="notify-sound" ${S.notify.sound ? 'checked' : ''}></label>
      <button type="button" class="btn" data-act="notify-test">${icon('bell', 's')}ทดสอบแจ้งเตือน</button>
      <p class="small muted">เตือนได้แน่นอนเมื่อแอปเปิดอยู่หรือเพิ่งพับไว้ ถ้าปิดแอปหรือล็อกจอนาน มือถืออาจไม่เตือน — ช่วงกลางคืนแนะนำให้เปิดแอปค้างไว้ หรือตั้งนาฬิกาปลุกสำรอง · ตั้งค่าแยกกันในแต่ละเครื่อง</p>
    </section>

    ${photoSettings()}

    <section class="card form"><h2 class="card-title">ติดตั้งเป็นแอป</h2>
      ${standalone ? '<p class="small">ติดตั้งแล้ว ✓</p>' : S.installEvt ? '<button type="button" class="btn btn-primary" data-act="install">ติดตั้งลงหน้าจอหลัก</button>' : isIOS ? '<p class="small">ใน Safari กดปุ่ม <b>แชร์</b> (สี่เหลี่ยมมีลูกศรขึ้น) แล้วเลือก <b>เพิ่มไปยังหน้าจอโฮม</b></p>' : '<p class="small">เปิดเมนูของเบราว์เซอร์ (⋮) แล้วเลือก <b>ติดตั้งแอป</b> หรือ <b>เพิ่มลงในหน้าจอหลัก</b></p>'}
    </section>

    <section class="card form"><h2 class="card-title">สำรองข้อมูล</h2>
      <div class="btn-row"><button type="button" class="btn" data-act="export">ดาวน์โหลดไฟล์สำรอง</button><label class="btn">นำเข้าไฟล์สำรอง<input type="file" accept="application/json,.json" data-act="import" hidden></label></div>
      <p class="small muted">ไฟล์ .json เก็บข้อมูลทั้งหมดในเครื่องนี้ ใช้ย้ายเครื่องได้แม้ไม่ได้ตั้งค่าซิงก์</p>
      <button type="button" class="btn btn-danger-outline" data-act="reset">${S.confirmReset ? 'แตะอีกครั้งเพื่อลบข้อมูลในเครื่องนี้ทั้งหมด' : 'ลบข้อมูลในเครื่องนี้'}</button>
    </section>

    <a class="danger-link" href="#/danger">${icon('alert')}อาการอันตรายที่ต้องไปโรงพยาบาลทันที</a>
    <p class="disclaimer">แอปบันทึกลูกน้อย v${APP_VERSION} · ประเมินตามแนวทางทั่วไป ไม่ใช่การวินิจฉัยทางการแพทย์ หากกังวลให้ปรึกษาแพทย์เสมอ</p>
  </main>${nav('settings')}`;
}

function viewDanger() {
  return `<main class="page">${topbar('อาการอันตราย', '#/')}
    <section class="result lv-3"><div class="result-title">ถ้ามีข้อใดข้อหนึ่ง ไปโรงพยาบาลทันที หรือโทร 1669</div>
    <ul class="msgs">${R.DANGER_SIGNS.map((t) => `<li class="lv-3"><span class="dot"></span>${esc(t)}</li>`).join('')}</ul></section>
    <p class="disclaimer">รายการนี้ไม่ครอบคลุมทุกกรณี ถ้ารู้สึกว่าลูกผิดปกติ ให้เชื่อสัญชาตญาณและปรึกษาแพทย์</p>
  </main>`;
}

/* ===================== ตัวจับเวลา (อัปเดตทุกวินาที ไม่วาดใหม่ทั้งหน้า) ===================== */
function tick() {
  const now = Date.now();
  const set = (k, v, prop = 'textContent') => $app.querySelectorAll(`[data-tick="${k}"]`).forEach((el) => { el[prop] = v; });
  const s = S.sum;
  if (!s) return;
  const lf = s.lastFeed, iv = S.settings.feedIntervalH * 3600000;
  const feeding = feedTimerRunning(S.feedTimer);
  set('feed-ago', feeding ? 'กำลังให้นม' : lf ? ago(now - lf.ts) : '—');
  $app.querySelectorAll('[data-tick="feed-bar"]').forEach((el) => {
    const p = feeding ? 0 : lf ? Math.min(1, (now - lf.ts) / iv) : 0;
    el.style.width = `${p * 100}%`; el.className = p >= 1 ? 'bar-warn' : 'bar-accent';
  });
  $app.querySelectorAll('[data-tick="feed-next"]').forEach((el) => {
    if (feeding) { el.textContent = `จับเวลาอยู่ ${mmss(sideMs(S.feedTimer, 'L') + sideMs(S.feedTimer, 'R'))}`; el.className = 'small txt-accent'; return; }
    if (!lf) { el.textContent = 'ยังไม่มีบันทึก'; el.className = 'small muted'; return; }
    const left = lf.ts + iv - now;
    el.textContent = left > 0 ? `มื้อถัดไปอีก ${ago(left)}` : `ถึงเวลาให้นมแล้ว (เลยมา ${ago(-left)})`;
    el.className = left > 0 ? 'small txt-accent' : 'small txt-1 b';
  });
  const lp = s.lastPee, pa = S.settings.peeAlertH * 3600000;
  set('pee-ago', lp ? ago(now - lp.ts) : '—');
  $app.querySelectorAll('[data-tick="pee-bar"]').forEach((el) => {
    const p = lp ? Math.min(1, (now - lp.ts) / pa) : 0;
    el.style.width = `${p * 100}%`; el.className = p >= 1 ? 'bar-warn' : 'bar-ok';
  });
  if (S.sleepTimer) {
    const el = now - S.sleepTimer.startTs;
    set('sleep-run', durText(el)); set('sleep-big', hmmss(el)); set('sleep-sub', `กำลังนอน ${durText(el)}`);
  }
  const t = S.feedTimer;
  if (t) {
    set('side-L', mmss(sideMs(t, 'L'))); set('side-R', mmss(sideMs(t, 'R')));
    set('feed-total', mmss(sideMs(t, 'L') + sideMs(t, 'R')));
  }
}

/* ===================== การกระทำ ===================== */
const actions = {
  async sync() { await runSync(); render(); },
  'toast-action'() { if (S.toastAction) S.toastAction(); $toast.classList.remove('show'); },
  'onboard-skip'(el, ev) { S.onboardSkipped = true; if (el.tagName === 'BUTTON') { ev.preventDefault(); go('#/'); } },
  'pick-color'(el) { S.draft.color = el.dataset.v; render(); },
  'pick-cons'(el) { S.draft.consistency = el.dataset.v; render(); },
  'pick-method'(el) { S.draft.method = el.dataset.v; render(); },
  amt(el) { S.draft.amount = Math.max(0, (num(S.draft.amount) || 0) + Number(el.dataset.v)); render(); },
  'amt-set'(el) { S.draft.amount = Number(el.dataset.v); render(); },
  wt(el) { S.draft.amount = Math.max(0, Math.round(((num(S.draft.amount) || 3) + Number(el.dataset.v)) * 1000) / 1000); render(); },
  range(el) { S.range = Number(el.dataset.v); recompute(); render(); },
  more() { S.histLimit += 14; render(); },
  async timer(el) {
    const side = el.dataset.v, now = Date.now();
    let t = S.feedTimer ? JSON.parse(JSON.stringify(S.feedTimer)) : { startTs: now, L: { acc: 0, runFrom: null }, R: { acc: 0, runFrom: null }, lastSide: null };
    const other = side === 'L' ? 'R' : 'L';
    if (t[side].runFrom) { t[side].acc += now - t[side].runFrom; t[side].runFrom = null; }
    else {
      if (t[other].runFrom) { t[other].acc += now - t[other].runFrom; t[other].runFrom = null; }
      t[side].runFrom = now; t.lastSide = side;
    }
    await setFeedTimer(t);
    if (!S.draftKey.endsWith(':new') || !S.draftKey.startsWith('feed')) loadDraft('feed');
    S.draft.ts = t.startTs;
    render();
  },
  async 'timer-reset'() { await setFeedTimer(null); render(); },
  async save() { await saveDraft(); },
  async delete() {
    if (!S.confirmDel) { S.confirmDel = true; render(); return; }
    const rec = S.records.find((r) => r.id === S.draft.id);
    if (rec) await saveRecord({ ...rec, deleted: true });
    S.draftKey = ''; toast('ลบแล้ว', { label: 'เลิกทำ', fn: async () => { await saveRecord({ ...rec, deleted: false }); render(); } });
    go('#/history');
  },
  async export() {
    const data = { app: 'baby-log', version: APP_VERSION, exportedAt: new Date().toISOString(), settings: S.settings, records: S.records.map(({ _dirty, ...r }) => r) };
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `baby-log-${R.localDate(Date.now())}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  },
  async reset() {
    if (!S.confirmReset) { S.confirmReset = true; render(); return; }
    await db.clearAll(); S.records = []; S.settings = normSettings(null); S.syncCfg = { url: '', key: '' }; S.confirmReset = false; S.draft = {};
    recompute(); toast('ลบข้อมูลในเครื่องแล้ว'); go('#/');
  },
  async install() { if (S.installEvt) { S.installEvt.prompt(); await S.installEvt.userChoice; S.installEvt = null; render(); } },
  'sw-update'() { if (S.swWaiting) S.swWaiting.postMessage('skipWaiting'); },
  'pick-site'(el) { S.draft.tempSite = el.dataset.v; render(); },
  tmp(el) { S.draft.tempC = Math.round(((num(S.draft.tempC) ?? 36.8) + Number(el.dataset.v)) * 10) / 10; render(); },
  'pick-zone'(el) { S.draft.zone = Number(el.dataset.v); render(); },
  async 'sleep-start'() { S.sleepTimer = { startTs: Date.now() }; await db.set('sleepTimer', S.sleepTimer); toast('เริ่มนับเวลานอนแล้ว'); go('#/'); },
  async 'sleep-cancel'() { S.sleepTimer = null; await db.set('sleepTimer', null); render(); },
  async 'sleep-stop'() {
    const t = S.sleepTimer; if (!t) return;
    const rec = { id: uid(), type: 'sleep', ts: t.startTs, endTs: Date.now(), note: '' };
    S.sleepTimer = null; await db.set('sleepTimer', null);
    await saveRecord(rec);
    toast(`บันทึกการนอน ${durText(rec.endTs - rec.ts)}`, { label: 'เลิกทำ', fn: async () => { await saveRecord({ ...rec, deleted: true }); S.sleepTimer = t; await db.set('sleepTimer', t); render(); } });
    S.draftKey = ''; go('#/');
  },
  async 'notify-toggle'() {
    if (!S.notify.enabled) {
      if (!('Notification' in window)) { toast('เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน (จะเตือนในแอปแทน)'); S.notify.enabled = true; }
      else {
        const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
        if (perm !== 'granted') { toast('ไม่ได้รับอนุญาต — เปิดได้ที่ การตั้งค่าเว็บไซต์ของเบราว์เซอร์'); }
        S.notify.enabled = perm === 'granted';
      }
    } else S.notify.enabled = false;
    await db.set('notifyPrefs', S.notify); render();
  },
  async 'notify-sound'() { S.notify.sound = !S.notify.sound; await db.set('notifyPrefs', S.notify); render(); },
  async 'notify-test'() { unlockAudio(); await fireAlert({ key: 'test:' + Date.now(), level: 0, title: 'ทดสอบแจ้งเตือน', body: 'ถ้าเห็นข้อความนี้ การแจ้งเตือนใช้ได้แล้ว' }, true); },
  async 'alert-dismiss'(el) { await dismissAlert(el.dataset.v); render(); },
  'photo-view'() { const u = P.cachedUrl(S.draft.photoId); if (u) { S.viewer = u; render(); } },
  'viewer-close'() { S.viewer = null; render(); },
  'photo-remove'() {
    if (S.draft.newPhoto && S.draft.newPhoto.id === S.draft.photoId) S.draft.newPhoto = null;
    else if (S.draft.photoId) S.draft.removedPhotoId = S.draft.photoId;
    S.draft.photoId = ''; render();
  },
  async 'photo-cleanup'() {
    try {
      let msg;
      if (S.syncCfg.url && S.settings.photoMode !== 'local') {
        const res = await Sync.api('cleanupPhotos', { days: S.settings.photoRetentionDays });
        msg = res.days ? `ย้าย ${res.trashed} รูปเข้าถังขยะ Drive · เก็บรูปที่ถูกเตือน ${res.kept} รูป` : 'ตั้งไว้ "ไม่ลบรูป"';
      }
      const loc = await P.pruneLocal(S.settings, S.records, { force: true });
      toast(msg || `ล้างรูปในเครื่อง ${loc.removed} รูป`);
      await loadPhotoInfo();
    } catch (e) { toast(e.message); }
  }
};

async function loadPhotoInfo() {
  // อัปเดตเฉพาะการ์ดรูป ไม่วาดทั้งหน้าใหม่ (กันฟอร์มอื่นที่กำลังกรอก/เลือกไฟล์หาย)
  const patch = () => { const el = document.getElementById('photos'); if (el && route().parts[0] === 'settings') el.outerHTML = photoSettings(); };
  S.photoInfo = { local: await P.localStats(), remote: null, loading: !!S.syncCfg.url };
  patch();
  if (!S.syncCfg.url) return;
  try { S.photoInfo.remote = await Sync.api('photoStats', {}, 20000); } catch (e) { S.photoInfo.error = e.message; }
  S.photoInfo.loading = false;
  patch();
}
const mb = (b) => (b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : (b / 1e6).toFixed(b < 1e7 ? 1 : 0) + ' MB');
function photoSettings() {
  const st = S.settings, info = S.photoInfo || { local: { count: 0, bytes: 0, pending: 0 } };
  const r = info.remote;
  const usage = r && r.driveLimit ? `<div class="bar bar-lg"><div class="bar-accent" style="width:${Math.max(1, (r.bytes / r.driveLimit) * 100)}%"></div><div class="bar-other" style="width:${((r.driveUsed - r.bytes) / r.driveLimit) * 100}%"></div></div>
      <div class="row-between small muted"><span>แอปนี้ ${mb(r.bytes)} · อื่น ๆ ใน Google ${mb(Math.max(0, r.driveUsed - r.bytes))}</span><span>จาก ${mb(r.driveLimit)}</span></div>` : '';
  return `<section class="card form" id="photos"><h2 class="card-title">รูปถ่ายและพื้นที่</h2>
    ${S.syncCfg.url ? (r ? `<div class="row-between"><span>รูปใน Google Drive</span><b>${r.count} รูป · ${mb(r.bytes)}</b></div>${usage}<div class="row-between small"><span>รูปที่ถูกเตือน (เก็บไว้เสมอ)</span><b>${r.keep} รูป</b></div>` : `<p class="small muted">${info.loading ? 'กำลังดูข้อมูลใน Drive…' : esc(info.error || '')}</p>`) : '<p class="small muted">ยังไม่ได้ตั้งค่าซิงก์ รูปจะเก็บในเครื่องนี้เท่านั้น</p>'}
    <div class="row-between small"><span>ในเครื่องนี้</span><span>${info.local.count} รูป · ${mb(info.local.bytes)}${info.local.pending && S.syncCfg.url && st.photoMode !== 'local' ? ` · รออัปโหลด ${info.local.pending}` : ''}</span></div>
    <form data-form="photoprefs" class="form form-flat">
      <label class="field"><span>เก็บรูปที่</span><select name="photoMode">
        <option value="drive" ${st.photoMode !== 'local' ? 'selected' : ''}>Google Drive + ในเครื่อง</option>
        <option value="local" ${st.photoMode === 'local' ? 'selected' : ''}>ในเครื่องนี้เท่านั้น</option></select></label>
      <label class="field"><span>ลบรูปที่ผลปกติ เมื่อเก่ากว่า</span><select name="photoRetentionDays">
        ${[[7, '7 วัน'], [30, '30 วัน'], [90, '90 วัน'], [0, 'ไม่ลบ']].map(([v, l]) => `<option value="${v}" ${Number(st.photoRetentionDays) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </form>
    <p class="small muted">รูปที่สีหรือลักษณะผิดปกติ (ถูกเตือน) จะ<b>ไม่ถูกลบอัตโนมัติ</b> · รูปที่ลบใน Drive ไปอยู่ในถังขยะ กู้คืนได้ภายใน 30 วัน${st.photoMode === 'local' ? ' · โหมดในเครื่อง: ถ้าล้างแอปหรือเปลี่ยนเครื่อง รูปจะหาย และอีกเครื่องจะไม่เห็นรูป' : ''}</p>
    <div class="btn-row"><button type="button" class="btn" data-act="photo-cleanup">ล้างรูปเก่าตอนนี้</button>${r && r.folderUrl ? `<a class="btn" href="${esc(r.folderUrl)}" target="_blank" rel="noopener">เปิดโฟลเดอร์ใน Drive</a>` : ''}</div>
  </section>`;
}

async function saveDraft() {
  const d = S.draft, { parts, params } = route();
  const type = parts[1], id = params.get('id');
  if (type === 'poop' && !d.color) { toast('เลือกสีก่อนบันทึก'); return; }
  const rec = id ? { ...S.records.find((r) => r.id === id), ...d } : { ...d, id: uid(), type };
  rec.ts = Number(rec.ts) || Date.now();
  if (rec.ts > Date.now() + 5 * 60000) { toast('เวลาอยู่ในอนาคต ตรวจอีกครั้ง'); return; }
  if (type === 'feed') {
    if (rec.method === 'breast') {
      const t = S.feedTimer;
      if (!id && t && (sideMs(t, 'L') + sideMs(t, 'R') > 0)) {
        rec.durL = Math.round(sideMs(t, 'L') / 60000); rec.durR = Math.round(sideMs(t, 'R') / 60000);
        rec.side = t.lastSide || ''; rec.ts = t.startTs;
        await setFeedTimer(null);
      } else { rec.durL = num(rec.durL); rec.durR = num(rec.durR); }
      rec.amount = null;
    } else {
      rec.amount = num(rec.amount);
      if (!rec.amount) { toast('ใส่ปริมาณนม (มล.)'); return; }
      rec.durL = null; rec.durR = null;
    }
  }
  if (type === 'weight') {
    rec.amount = num(rec.amount);
    if (!rec.amount || rec.amount < 0.5 || rec.amount > 20) { toast('น้ำหนักไม่ถูกต้อง'); return; }
  }
  if (type === 'temp') {
    rec.tempC = num(rec.tempC);
    if (!rec.tempC || rec.tempC < 30 || rec.tempC > 43) { toast('อุณหภูมิไม่ถูกต้อง (30–43 °C)'); return; }
    rec.tempC = Math.round(rec.tempC * 10) / 10;
  }
  if (type === 'jaundice') rec.zone = Math.max(0, Math.min(5, Number(rec.zone) || 0));
  if (type === 'sleep') {
    rec.endTs = Number(rec.endTs);
    if (!(rec.endTs > rec.ts)) { toast('เวลาตื่นต้องหลังเวลาเริ่มนอน'); return; }
    if (rec.endTs > Date.now() + 5 * 60000) { toast('เวลาตื่นอยู่ในอนาคต'); return; }
  }
  rec.note = String(rec.note || '').slice(0, 200);
  const newPhoto = rec.newPhoto, removed = rec.removedPhotoId;
  delete rec.newPhoto; delete rec.removedPhotoId; delete rec._manual;
  if (newPhoto && rec.photoId === newPhoto.id) {
    await P.savePhoto({ id: newPhoto.id, recordId: rec.id, blob: newPhoto.blob, ts: rec.ts, keep: P.shouldKeep(rec, S.settings.birthDate) });
  }
  if (removed && removed !== rec.photoId) await P.removePhoto(removed);
  if (!rec.photoId) rec.photoId = '';
  await saveRecord(rec);
  S.draftKey = '';
  const dolRec = R.dayOfLife(S.settings.birthDate, R.localDate(rec.ts));
  const lv = type === 'poop' ? R.evaluateStool(rec, dolRec).level : type === 'temp' ? R.evaluateTemp(rec, dolRec ? dolRec - 1 : null).level : type === 'jaundice' ? R.evaluateJaundice(rec, S.settings.birthDate, num(S.settings.gestationWeeks)).level : 0;
  if (!id) toast(lv >= 2 ? 'บันทึกแล้ว — ดูคำแนะนำในหน้าหลัก' : 'บันทึกแล้ว', { label: 'เลิกทำ', fn: async () => { await saveRecord({ ...rec, deleted: true }); render(); } });
  else toast('แก้ไขแล้ว');
  go(id ? '#/history' : '#/');
}

function readForm(form) {
  const o = {};
  new FormData(form).forEach((v, k) => { o[k] = String(v).trim(); });
  return o;
}

/* ===================== ผูกเหตุการณ์ ===================== */
document.addEventListener('pointerdown', unlockAudio, { once: true });
document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.tagName === 'INPUT') return;
  const fn = actions[el.dataset.act];
  if (fn) { if (el.tagName !== 'A') ev.preventDefault(); await fn(el, ev); }
});
document.addEventListener('input', (ev) => {
  const el = ev.target;
  if (el.dataset && el.dataset.bind) {
    const k = el.dataset.bind;
    S.draft[k] = k === 'ts' || k === 'endTs' ? fromLocalInput(el.value) : el.value;
    if (k === 'ts' || k === 'endTs') S.draft._manual = true;
    if (k === 'ts' || k === 'endTs' || k === 'tempC' || (k === 'amount' && route().parts[1] === 'weight')) { clearTimeout(S.reTimer); S.reTimer = setTimeout(() => { const pos = el.selectionStart; render(); const n = $app.querySelector(`[data-bind="${k}"]`); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { /* ignore */ } } }, 600); }
  }
  if (el.form && el.form.dataset.form && el.name) S.draft[el.name] = el.value;
});
document.addEventListener('change', async (ev) => {
  const el = ev.target;
  if (el.dataset.act === 'photo-input' && el.files && el.files[0]) {
    try {
      toast('กำลังย่อรูป…');
      const { blob } = await P.compress(el.files[0]);
      const id = P.newPhotoId();
      if (S.draft.photoId && !(S.draft.newPhoto && S.draft.newPhoto.id === S.draft.photoId)) S.draft.removedPhotoId = S.draft.photoId;
      S.draft.newPhoto = { id, blob }; S.draft.photoId = id;
      P.tempUrl(id, blob);
      toast(`ได้รูปแล้ว (${Math.round(blob.size / 1024)} KB) · เลือกภาพตัวอย่างที่ใกล้ที่สุด`);
      render();
    } catch (e) { toast(e.message || 'เปิดรูปไม่ได้'); }
    return;
  }
  if (el.type === 'checkbox' && (el.dataset.act === 'notify-toggle' || el.dataset.act === 'notify-sound')) { unlockAudio(); await actions[el.dataset.act](el, ev); return; }
  if (el.form && el.form.dataset.form === 'photoprefs') {
    await saveSettings({ [el.name]: el.name === 'photoRetentionDays' ? Number(el.value) : el.value });
    toast('บันทึกแล้ว');
    loadPhotoInfo();
    return;
  }
  if (el.dataset.act === 'import' && el.files && el.files[0]) {
    try {
      const data = JSON.parse(await el.files[0].text());
      if (data.app !== 'baby-log' || !Array.isArray(data.records)) throw new Error();
      const existing = new Map(S.records.map((r) => [r.id, r]));
      const incoming = data.records.filter((r) => r && r.id && r.type && (!existing.has(r.id) || (r.updatedAt || 0) > (existing.get(r.id).updatedAt || 0))).map((r) => ({ ...r, _dirty: 1 }));
      await db.putMany(incoming);
      if (!S.settings.birthDate && data.settings) await saveSettings(data.settings);
      S.records = await db.allRecords(); recompute(); scheduleSync();
      toast(`นำเข้า ${incoming.length} รายการ`); render(); checkAlerts();
    } catch (e) { toast('ไฟล์ไม่ถูกต้อง'); }
  }
});
document.addEventListener('submit', async (ev) => {
  const form = ev.target; ev.preventDefault();
  const f = readForm(form);
  if (form.dataset.form === 'onboard' || form.dataset.form === 'settings') {
    if (f.birthDate && f.birthDate > R.localDate(Date.now())) { toast('วันเกิดอยู่ในอนาคต'); return; }
    await saveSettings({
      babyName: f.babyName, birthDate: f.birthDate, birthWeightKg: num(f.birthWeightKg) ?? '', gestationWeeks: num(f.gestationWeeks) ?? '',
      feedingType: f.feedingType || 'breast',
      ...(form.dataset.form === 'settings' ? { feedIntervalH: num(f.feedIntervalH) || 3, peeAlertH: num(f.peeAlertH) || 6 } : {})
    });
    S.draft = {}; S.draftKey = '';
    toast('บันทึกการตั้งค่าแล้ว');
    go('#/');
  } else if (form.dataset.form === 'sync') {
    const cfg = { url: f.url, key: f.key };
    if (!/^https:\/\/script\.google(usercontent)?\.com\/.+/.test(cfg.url) && !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(cfg.url)) { toast('URL ต้องขึ้นต้นด้วย https://script.google.com/'); return; }
    try {
      toast('กำลังเชื่อมต่อ…');
      await Sync.testConnection(cfg);
      await Sync.setConfig(cfg); S.syncCfg = await Sync.getConfig();
      await db.set('syncCursor', 0);
      // ส่งข้อมูลเดิมในเครื่องขึ้นทั้งหมดในครั้งแรก
      const all = await db.allRecords(); await db.putMany(all.map((r) => ({ ...r, _dirty: 1 })));
      const st = await db.get('settings'); if (st && st.birthDate) await db.set('settings', { ...st, _dirty: 1 });
      await runSync();
      toast(S.sync.status === 'ok' ? 'เชื่อมต่อและซิงก์สำเร็จ' : S.sync.error || 'ซิงก์ไม่สำเร็จ');
      S.records = await db.allRecords(); S.settings = normSettings(await db.get('settings')); recompute(); render();
    } catch (e) { toast(e.message); }
  }
});

window.addEventListener('hashchange', () => { S.viewer = null; setTimeout(checkAlerts, 0); if (route().parts[0] === 'settings') loadPhotoInfo(); if (!route().parts[0] || route().parts[0] !== 'log') S.draftKey = ''; if (route().parts[0] === 'settings') S.draft = {}; S.confirmReset = false; render(); });
window.addEventListener('online', () => scheduleSync(300));
window.addEventListener('offline', () => { S.sync = { ...S.sync, status: 'offline' }; render(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { recompute(); if (route().parts[0] !== 'log') render(); scheduleSync(500); } });
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.installEvt = e; });
Sync.onSyncChange((st) => {
  S.sync = st;
  const chip = $app.querySelector('.home-head .chip');
  if (chip) chip.outerHTML = syncChip();
});

setInterval(tick, 1000);
setInterval(() => { if (route().parts[0] !== 'log' && !document.hidden) { recompute(); const y = window.scrollY; render(); window.scrollTo(0, y); } }, 60000);
setInterval(() => { if (!document.hidden) scheduleSync(0); }, 120000);

/* ===================== เริ่มทำงาน ===================== */
async function init() {
  S.records = await db.allRecords();
  S.settings = normSettings(await db.get('settings'));
  S.syncCfg = await Sync.getConfig();
  S.feedTimer = await db.get('feedTimer');
  S.sleepTimer = await db.get('sleepTimer');
  S.notify = await db.get('notifyPrefs', { enabled: false, sound: true });
  if (S.notify.enabled && 'Notification' in window && Notification.permission !== 'granted') S.notify.enabled = false;
  S.sync = { ...S.sync, pending: await Sync.countPending(), lastAt: await db.get('lastSyncAt') };
  if (S.settings.birthDate) S.onboardSkipped = true;
  recompute();
  render();
  db.persist();
  P.pruneLocal(S.settings, S.records).catch(() => {});
  checkAlerts();
  setInterval(checkAlerts, 30000);
  if (route().parts[0] === 'settings') loadPhotoInfo();
  scheduleSync(800);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      const watch = (w) => w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) { S.swWaiting = w; render(); } });
      if (reg.waiting && navigator.serviceWorker.controller) { S.swWaiting = reg.waiting; render(); }
      reg.addEventListener('updatefound', () => watch(reg.installing));
      // โหลดหน้าใหม่เฉพาะตอนอัปเดตเวอร์ชัน (ไม่ใช่ตอนติดตั้งครั้งแรก ซึ่งจะทำให้ฟอร์มที่กำลังกรอกหาย)
      const hadController = !!navigator.serviceWorker.controller;
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
    } catch (e) { /* ไม่มี SW ก็ใช้งานได้ */ }
  }
}
init();
