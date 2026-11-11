// db.js — เก็บข้อมูลในเครื่องด้วย IndexedDB (ใช้หน่วยความจำแทนถ้าเบราว์เซอร์ไม่รองรับ)

const DB_NAME = 'baby-log';
const DB_VER = 2;
let dbp = null;
const mem = { records: new Map(), kv: new Map(), photos: new Map() };
let useMem = false;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { useMem = true; resolve(null); };
      req.onblocked = () => { useMem = true; resolve(null); };
    } catch (e) { useMem = true; resolve(null); }
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    if (!db || useMem) { resolve(fn(null)); return; }
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    const r = fn(s);
    if (r && 'onsuccess' in r) r.onsuccess = () => { result = r.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const db = {
  async allRecords() {
    const v = await tx('records', 'readonly', (s) => (s ? s.getAll() : null));
    return useMem ? [...mem.records.values()] : v || [];
  },
  async getRecord(id) {
    const v = await tx('records', 'readonly', (s) => (s ? s.get(id) : null));
    return useMem ? mem.records.get(id) : v;
  },
  async putRecord(rec) {
    if (useMem) { mem.records.set(rec.id, rec); return; }
    await tx('records', 'readwrite', (s) => (s ? s.put(rec) : mem.records.set(rec.id, rec)));
  },
  async putMany(recs) {
    if (!recs.length) return;
    if (useMem) { recs.forEach((r) => mem.records.set(r.id, r)); return; }
    await tx('records', 'readwrite', (s) => { if (!s) recs.forEach((r) => mem.records.set(r.id, r)); else recs.forEach((r) => s.put(r)); });
  },
  async get(key, dflt = null) {
    const v = await tx('kv', 'readonly', (s) => (s ? s.get(key) : null));
    const out = useMem ? mem.kv.get(key) : v;
    return out === undefined || out === null ? dflt : out;
  },
  async set(key, val) {
    if (useMem) { mem.kv.set(key, val); return; }
    await tx('kv', 'readwrite', (s) => (s ? s.put(val, key) : mem.kv.set(key, val)));
  },
  async getPhoto(id) {
    const v = await tx('photos', 'readonly', (s) => (s ? s.get(id) : null));
    return useMem ? mem.photos.get(id) : v;
  },
  async putPhoto(p) {
    if (useMem) { mem.photos.set(p.id, p); return; }
    await tx('photos', 'readwrite', (s) => (s ? s.put(p) : mem.photos.set(p.id, p)));
  },
  async deletePhoto(id) {
    if (useMem) { mem.photos.delete(id); return; }
    await tx('photos', 'readwrite', (s) => s && s.delete(id));
  },
  async allPhotos() {
    const v = await tx('photos', 'readonly', (s) => (s ? s.getAll() : null));
    return useMem ? [...mem.photos.values()] : v || [];
  },
  async clearAll() {
    if (useMem) { mem.records.clear(); mem.kv.clear(); mem.photos.clear(); return; }
    await tx('records', 'readwrite', (s) => s && s.clear());
    await tx('kv', 'readwrite', (s) => s && s.clear());
    await tx('photos', 'readwrite', (s) => s && s.clear());
  },
  isMemoryOnly() { return useMem; },
  async persist() {
    try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) { /* ignore */ }
    return false;
  }
};

export function uid() {
  const a = new Uint8Array(12);
  (self.crypto || window.crypto).getRandomValues(a);
  return Date.now().toString(36) + '-' + Array.from(a, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 14);
}
