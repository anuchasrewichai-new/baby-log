// จำลองบริการ Google Apps Script ที่ Code.gs ใช้ เพื่อทดสอบบนเครื่อง
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

class Range {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) { const v = (this.sheet.data[this.r - 1 + i] || [])[this.c - 1 + j]; row.push(v === undefined ? '' : v); }
      out.push(row);
    }
    return out;
  }
  setValues(vals) {
    if (vals.length !== this.nr || vals.some((r) => r.length !== this.nc)) throw new Error('size mismatch');
    vals.forEach((row, i) => row.forEach((v, j) => {
      const rr = this.r - 1 + i; while (this.sheet.data.length <= rr) this.sheet.data.push([]);
      // Sheets เก็บ Date เป็นวันเวลา, ค่าอื่นตามเดิม (แปลงตัวเลขในรูปแบบข้อความเป็นข้อความ)
      this.sheet.data[rr][this.c - 1 + j] = this.sheet.textFmt && typeof v !== 'object' ? String(v) : v;
    }));
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  clearContent() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) if (this.sheet.data[this.r - 1 + i]) this.sheet.data[this.r - 1 + i][this.c - 1 + j] = ''; return this; }
  setFontWeight() { return this; }
  setNumberFormat(f) { this.sheet.textFmt = f === '@'; return this; }
}
class Sheet {
  constructor(name) { this.name = name; this.data = []; }
  getLastRow() { let n = this.data.length; while (n > 0 && (this.data[n - 1] || []).every((v) => v === '' || v === undefined)) n--; return n; }
  getRange(r, c, nr = 1, nc = 1) { return new Range(this, r, c, nr, nc); }
  setFrozenRows() {}
}
class Spreadsheet {
  constructor() { this.sheets = {}; }
  getId() { return 'ss-main'; }
  getSheetByName(n) { return this.sheets[n] || null; }
  insertSheet(n) { return (this.sheets[n] = new Sheet(n)); }
}

export function loadGas() {
  const ss = new Spreadsheet();
  const drive = makeDrive();
  const ai = { calls: [], handler: () => ({ code: 500, body: 'no mock' }) };
  const props = {};
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      base64Decode: (b) => Array.from(Buffer.from(b, 'base64')),
      base64Encode: (bytes) => Buffer.from(bytes).toString('base64'),
      newBlob: (bytes, mime, name) => ({ bytes, mime, name }),
      formatDate: (d, tz, f) => d.toISOString().slice(0, 16).replace('T', '_').replace(':', '')
    },
    Session: { getScriptTimeZone: () => 'Asia/Bangkok' },
    UrlFetchApp: { fetch: (url, opts) => { ai.calls.push({ url, opts, body: JSON.parse(opts.payload) }); const r = ai.handler(url, JSON.parse(opts.payload), opts); return { getResponseCode: () => r.code || 200, getContentText: () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)) }; } },
    DriveApp: drive.api,
    ScriptApp: {
      getProjectTriggers: () => drive.triggers,
      deleteTrigger: (t) => { drive.triggers = drive.triggers.filter((x) => x !== t); },
      WeekDay: { SUNDAY: 'SUNDAY' },
      newTrigger: (fn) => { const b = { timeBased: () => b, everyDays: () => b, onWeekDay: () => b, atHour: () => b, create: () => { const t = { getHandlerFunction: () => fn }; drive.triggers.push(t); return t; } }; return b; }
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }) },
    Logger: { log() {} },
    Date, JSON, Math, Number, String, Object, Array, isFinite
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(here, '../apps-script/Code.gs'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(here, '../apps-script/Ai.gs'), 'utf8'), ctx);
  const post = (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).text);
  return { ctx, ss, props, post, drive, ai };
}

function makeDrive() {
  const files = new Map(); const folders = new Map(); let n = 0;
  const drive = { files, folders, triggers: [], used: 4.9e9, limit: 15e9 };
  const mkFile = (blob) => {
    const id = 'f' + (++n);
    const f = { id, blob, trashed: false, desc: '', getId: () => id, setDescription(d) { f.desc = d; return f; }, setTrashed(t) { f.trashed = t; return f; }, isTrashed: () => f.trashed,
      getBlob: () => ({ getBytes: () => blob.bytes, getContentType: () => blob.mime }) };
    files.set(id, f); return f;
  };
  drive.api = {
    createFolder: (name) => { const id = 'folder' + (++n); const fo = { id, name, trashed: false, getId: () => id, setDescription() { return fo; }, isTrashed: () => fo.trashed, getUrl: () => 'https://drive.google.com/drive/folders/' + id, createFile: (blob) => mkFile(blob) }; folders.set(id, fo); return fo; },
    getFolderById: (id) => { if (!folders.has(id)) throw new Error('no folder'); return folders.get(id); },
    getFileById: (id) => {
      if (id === 'ss-main') return { makeCopy: (name, folder) => { const f = mkFile({ bytes: [], mime: 'sheet', name }); f.folder = folder.id; return f; } };
      if (!files.has(id)) throw new Error('no file'); return files.get(id);
    },
    getStorageUsed: () => drive.used, getStorageLimit: () => drive.limit
  };
  return drive;
}
