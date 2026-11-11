// sync.js — ซิงก์กับ Google Apps Script (ส่งรายการที่แก้ไข + ดึงรายการใหม่จากเครื่องอื่น)
import { db, uid } from './db.js';

let running = null;
let listeners = [];
let state = { status: 'idle', lastAt: null, error: null, pending: 0 };

export function onSyncChange(fn) { listeners.push(fn); }
function emit(patch) { state = { ...state, ...patch }; listeners.forEach((f) => f(state)); }
export function syncState() { return state; }

export async function getConfig() {
  return db.get('syncConfig', { url: '', key: '' });
}
export async function setConfig(cfg) {
  await db.set('syncConfig', { url: (cfg.url || '').trim(), key: (cfg.key || '').trim() });
}
export async function deviceId() {
  let id = await db.get('deviceId');
  if (!id) { id = 'd-' + uid().slice(0, 12); await db.set('deviceId', id); }
  return id;
}

async function call(cfg, body, timeoutMs = 25000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      // text/plain เพื่อเลี่ยง CORS preflight ซึ่ง Apps Script ไม่รองรับ
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...body, key: cfg.key }),
      redirect: 'follow',
      signal: ctrl.signal
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('เซิร์ฟเวอร์ไม่ได้ตอบเป็น JSON — ตรวจว่า URL เป็นของ Web app และตั้งค่า Who has access: Anyone'); }
    if (!data.ok) throw new Error(data.error === 'unauthorized' ? 'รหัสครอบครัวไม่ถูกต้อง' : 'เซิร์ฟเวอร์ตอบผิดพลาด: ' + (data.detail || data.error));
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('เชื่อมต่อนานเกินไป ลองใหม่อีกครั้ง');
    if (e instanceof TypeError) throw new Error('เชื่อมต่อไม่ได้ (ออฟไลน์หรือ URL ไม่ถูกต้อง)');
    throw e;
  } finally { clearTimeout(t); }
}

/** เรียก API ด้วยค่าที่ตั้งไว้ (ใช้กับรูปถ่าย) */
export async function api(action, body = {}, timeoutMs = 45000) {
  const cfg = await getConfig();
  if (!cfg.url || !cfg.key) throw new Error('ยังไม่ได้ตั้งค่าซิงก์');
  return call(cfg, { ...body, action }, timeoutMs);
}

let photoHook = null;
/** ให้ photos.js ลงทะเบียนงานที่ต้องทำต่อหลังซิงก์ข้อมูล (อัปโหลดรูปในคิว) */
export function setPhotoHook(fn) { photoHook = fn; }

export async function testConnection(cfg) {
  return call(cfg, { action: 'ping' }, 15000);
}

export async function countPending() {
  const recs = await db.allRecords();
  const s = await db.get('settings');
  const photos = await db.allPhotos();
  const mode = s && s.photoMode === 'local' ? 'local' : 'drive';
  const pendingPhotos = mode === 'drive' ? photos.filter((p) => !p.uploaded && p.blob).length : 0;
  return recs.filter((r) => r._dirty).length + (s && s._dirty ? 1 : 0) + pendingPhotos;
}

/** ซิงก์ทั้งหมด คืนค่า true ถ้ามีข้อมูลเปลี่ยนในเครื่อง */
export function syncNow() {
  if (running) return running;
  running = (async () => {
    const cfg = await getConfig();
    const pending = await countPending();
    if (!cfg.url || !cfg.key) { emit({ status: 'off', pending }); return false; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { emit({ status: 'offline', pending }); return false; }
    emit({ status: 'syncing', pending, error: null });
    try {
      const all = await db.allRecords();
      const dirty = all.filter((r) => r._dirty);
      const settings = await db.get('settings');
      const since = await db.get('syncCursor', 0);
      const device = await deviceId();
      const strip = ({ _dirty, ...rest }) => rest;
      let changed = false;
      // ส่งเป็นชุดละไม่เกิน 400 รายการ
      const batches = [];
      for (let i = 0; i < dirty.length; i += 400) batches.push(dirty.slice(i, i + 400));
      if (!batches.length) batches.push([]);
      let cursor = since;
      for (let b = 0; b < batches.length; b++) {
        const res = await call(cfg, {
          action: 'sync', device, since: cursor,
          push: batches[b].map(strip),
          settings: b === 0 && settings && settings._dirty ? strip(settings) : null
        });
        // ล้างสถานะรอส่งเฉพาะรายการที่ไม่ได้ถูกแก้ซ้ำระหว่างส่ง
        const sentAt = new Map(batches[b].map((r) => [r.id, r.updatedAt]));
        const toPut = [];
        for (const id of res.accepted || []) {
          const cur = await db.getRecord(id);
          if (cur && cur._dirty && cur.updatedAt === sentAt.get(id)) toPut.push({ ...cur, _dirty: 0 });
        }
        for (const r of res.records || []) {
          const cur = await db.getRecord(r.id);
          if (!cur || (!cur._dirty && r.updatedAt !== cur.updatedAt) || (cur._dirty && r.updatedAt > cur.updatedAt)) {
            const { seq, ...clean } = r;
            toPut.push({ ...clean, _dirty: 0 });
            changed = true;
          }
        }
        await db.putMany(toPut);
        if (res.settings) {
          const local = await db.get('settings');
          if (!local || (!local._dirty && res.settings.updatedAt !== local.updatedAt) || res.settings.updatedAt >= (local.updatedAt || 0)) {
            await db.set('settings', { ...res.settings, _dirty: 0 });
            changed = true;
          }
        }
        cursor = res.seq;
        await db.set('syncCursor', cursor);
      }
      if (photoHook) { try { await photoHook(); } catch (e) { console.warn('photo upload', e); } }
      const now = Date.now();
      await db.set('lastSyncAt', now);
      emit({ status: 'ok', lastAt: now, pending: await countPending(), error: null });
      return changed;
    } catch (e) {
      emit({ status: 'error', error: e.message, pending: await countPending() });
      return false;
    }
  })().finally(() => { running = null; });
  return running;
}
