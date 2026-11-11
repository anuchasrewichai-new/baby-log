// photos.js — ถ่ายรูป ย่อรูป เก็บในเครื่อง อัปโหลดเข้า Drive และล้างรูปเก่า
import { db, uid } from './db.js';
import * as Sync from './sync.js';
import * as R from './rules.js';

const MAX_SIDE = 1024;
const LOCAL_CACHE_DAYS = 14;      // รูปที่อัปโหลดแล้ว เก็บสำเนาในเครื่องไว้กี่วัน (เปิดดูภายหลังจะดึงจาก Drive)
const UPLOADS_PER_SYNC = 6;
const urlCache = new Map();       // photoId → objectURL

/** ย่อรูปให้ด้านยาวไม่เกิน 1024 px แบบ JPEG (~100–200 KB) และหมุนตามข้อมูลกล้อง */
export async function compress(file) {
  let src, w, h;
  try {
    src = await createImageBitmap(file, { imageOrientation: 'from-image' });
    w = src.width; h = src.height;
  } catch (e) {
    src = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('เปิดรูปนี้ไม่ได้'));
      img.src = URL.createObjectURL(file);
    });
    w = src.naturalWidth; h = src.naturalHeight;
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const cw = Math.round(w * scale), ch = Math.round(h * scale);
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(src, 0, 0, cw, ch);
  if (src.close) src.close();
  const toBlob = (q) => new Promise((r) => canvas.toBlob(r, 'image/jpeg', q));
  let blob = await toBlob(0.78);
  if (blob && blob.size > 260000) blob = await toBlob(0.62);
  if (!blob) throw new Error('ย่อรูปไม่สำเร็จ');
  return { blob, width: cw, height: ch };
}

export function newPhotoId() { return 'p' + uid().replace(/[^A-Za-z0-9_-]/g, ''); }

export async function savePhoto({ id, recordId, blob, ts, keep }) {
  await db.putPhoto({ id, recordId, blob, mime: 'image/jpeg', ts, bytes: blob.size, keep: keep ? 1 : 0, uploaded: 0, createdAt: Date.now() });
}

/** คืน objectURL ของรูป ถ้าไม่มีในเครื่องจะดึงจาก Drive (ต้องออนไลน์และตั้งค่าซิงก์) */
export async function photoUrl(id, { fetchRemote = true } = {}) {
  if (!id) return null;
  if (urlCache.has(id)) return urlCache.get(id);
  let p = await db.getPhoto(id);
  if ((!p || !p.blob) && fetchRemote) {
    try {
      const res = await Sync.api('getPhoto', { photoId: id });
      const bin = atob(res.data);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const blob = new Blob([arr], { type: res.mime || 'image/jpeg' });
      p = { ...(p || {}), id, blob, mime: blob.type, bytes: blob.size, uploaded: 1, ts: p ? p.ts : Date.now(), cachedAt: Date.now() };
      await db.putPhoto(p);
    } catch (e) {
      return null;
    }
  }
  if (!p || !p.blob) return null;
  const url = URL.createObjectURL(p.blob);
  urlCache.set(id, url);
  return url;
}

export function cachedUrl(id) { return urlCache.get(id) || null; }

export function tempUrl(id, blob) {
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

/** ลบรูป: ลบในเครื่องทันที และเข้าคิวลบใน Drive */
export async function removePhoto(id) {
  if (!id) return;
  const p = await db.getPhoto(id);
  await db.deletePhoto(id);
  if (urlCache.has(id)) { URL.revokeObjectURL(urlCache.get(id)); urlCache.delete(id); }
  if (p && p.uploaded) {
    const q = await db.get('photoDeleteQueue', []);
    if (!q.includes(id)) q.push(id);
    await db.set('photoDeleteQueue', q);
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

/** เรียกหลังซิงก์ข้อมูลทุกครั้ง: อัปโหลดรูปในคิว และส่งคำขอลบ */
export async function uploadQueue() {
  const settings = (await db.get('settings')) || {};
  if (settings.photoMode === 'local') return;
  const q = await db.get('photoDeleteQueue', []);
  for (const id of [...q]) {
    await Sync.api('deletePhoto', { photoId: id });
    q.splice(q.indexOf(id), 1);
    await db.set('photoDeleteQueue', q);
  }
  const all = await db.allPhotos();
  const records = new Map((await db.allRecords()).map((r) => [r.id, r]));
  const pending = all.filter((p) => !p.uploaded && p.blob).sort((a, b) => a.ts - b.ts).slice(0, UPLOADS_PER_SYNC);
  for (const p of pending) {
    const rec = records.get(p.recordId);
    const res = await Sync.api('uploadPhoto', {
      photoId: p.id, recordId: p.recordId, data: await blobToBase64(p.blob), mime: p.mime || 'image/jpeg',
      ts: p.ts, color: rec ? rec.color : '', keep: p.keep ? true : false
    }, 90000);
    await db.putPhoto({ ...p, uploaded: 1, driveId: res.driveId, uploadedAt: Date.now() });
  }
}

/** รูปนี้ต้องเก็บไว้เสมอไหม (สี/ลักษณะผิดปกติ) — ใช้เกณฑ์เดียวกับฝั่ง Drive */
const KEEP = new Set(['s01', 's02', 's03', 's04', 's10', 's11', 'u3', 'u4', 'u5', 'watery', 'mucus', 'hard']);
export function shouldKeep(rec, birthDate) {
  if (!rec || rec.deleted) return false;
  if (KEEP.has(rec.color) || KEEP.has(rec.consistency)) return true;
  const dol = R.dayOfLife(birthDate, R.localDate(rec.ts));
  const lv = rec.type === 'poop' ? R.evaluateStool(rec, dol).level : rec.type === 'pee' ? R.evaluateUrine(rec, dol).level : 0;
  return lv >= 1;
}

/**
 * ดูแลพื้นที่ในเครื่อง
 * - โหมด Drive: รูปที่อัปโหลดแล้ว และเก่ากว่า 14 วัน → ลบสำเนาในเครื่อง (ยังเปิดดูได้จาก Drive)
 * - โหมดในเครื่อง: ใช้กติกาเดียวกับ Drive (ลบรูปปกติที่เก่ากว่าที่ตั้งไว้ เก็บรูปที่ถูกเตือนเสมอ)
 * - รูปที่ไม่มีรายการบันทึกแล้ว (รายการถูกลบ) และเก่ากว่า 2 วัน → ลบ
 */
export async function pruneLocal(settings, records, { force = false } = {}) {
  const now = Date.now();
  if (!force) {
    const last = await db.get('lastPruneAt', 0);
    if (now - last < 6 * 3600000) return { removed: 0 };
  }
  const recs = new Map(records.map((r) => [r.id, r]));
  const days = Number(settings.photoRetentionDays);
  const keepDays = settings.photoRetentionDays === '' || settings.photoRetentionDays === undefined ? 30 : days;
  let removed = 0;
  for (const p of await db.allPhotos()) {
    const rec = recs.get(p.recordId);
    const age = now - (p.ts || p.createdAt || now);
    const orphan = (!rec || rec.deleted || rec.photoId !== p.id) && age > 2 * 86400000 && p.uploaded;
    if (orphan) { await db.deletePhoto(p.id); removed++; continue; }
    if (!p.blob) continue;
    if (settings.photoMode === 'local') {
      if (keepDays > 0 && age > keepDays * 86400000 && !shouldKeep(rec, settings.birthDate) && !p.keep) { await db.deletePhoto(p.id); removed++; }
    } else if (p.uploaded && age > LOCAL_CACHE_DAYS * 86400000 && (!p.cachedAt || now - p.cachedAt > 86400000)) {
      await db.putPhoto({ ...p, blob: null }); removed++;
    }
  }
  await db.set('lastPruneAt', now);
  return { removed };
}

export async function localStats() {
  const all = await db.allPhotos();
  const withBlob = all.filter((p) => p.blob);
  return { count: withBlob.length, bytes: withBlob.reduce((a, p) => a + (p.bytes || p.blob.size || 0), 0), pending: all.filter((p) => !p.uploaded && p.blob).length };
}

Sync.setPhotoHook(uploadQueue);
