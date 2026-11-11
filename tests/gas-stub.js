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
  getSheetByName(n) { return this.sheets[n] || null; }
  insertSheet(n) { return (this.sheets[n] = new Sheet(n)); }
}

export function loadGas() {
  const ss = new Spreadsheet();
  const props = {};
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { getUuid: () => crypto.randomUUID() },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }) },
    Logger: { log() {} },
    Date, JSON, Math, Number, String, Object, Array, isFinite
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(here, '../apps-script/Code.gs'), 'utf8'), ctx);
  const post = (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).text);
  return { ctx, ss, props, post };
}
