/**
 * แอปบันทึกลูกน้อย — Google Apps Script API (Phase 1: ซิงก์ข้อมูล)
 * -----------------------------------------------------------------
 * วิธีติดตั้ง (ดู README.md ประกอบ):
 *   1) เปิด Google Sheet ใหม่ → ส่วนขยาย → Apps Script → วางไฟล์นี้
 *   2) เลือกฟังก์ชัน setup แล้วกด "เรียกใช้" (อนุญาตสิทธิ์ครั้งแรก)
 *   3) Deploy → New deployment → Web app
 *        Execute as: Me   ·   Who has access: Anyone
 *   4) นำ URL ของ Web app + "รหัสครอบครัว" (อยู่ในแผ่นงาน Config) ไปใส่ในแอป
 *
 * ความปลอดภัย: ทุกคำขอต้องมีรหัสครอบครัวที่ตรงกัน ไม่เช่นนั้นจะถูกปฏิเสธ
 * ข้อมูลอยู่ใน Google Sheet ของคุณเท่านั้น
 */

var API_VERSION = '1.0.0';
var SHEETS = { LOGS: 'Logs', SETTINGS: 'Settings', CONFIG: 'Config' };
var LOG_COLS = ['ID', 'Seq', 'Type', 'Ts', 'Time', 'EndTs', 'Color', 'Consistency', 'Amount', 'Method',
                'DurL', 'DurR', 'TempC', 'TempSite', 'Zone', 'PhotoID', 'Note', 'UpdatedAt', 'Deleted', 'Device', 'BabyID', 'Side'];
var TYPES = ['pee', 'poop', 'feed', 'weight', 'temp', 'jaundice', 'sleep'];
var SETTING_KEYS = ['babyName', 'birthDate', 'birthWeightKg', 'gestationWeeks', 'feedingType', 'feedIntervalH', 'peeAlertH'];
var MAX_PUSH = 500;

/* ======================= ติดตั้ง ======================= */

/** เรียกครั้งเดียวจากหน้า Apps Script: สร้างแผ่นงานและรหัสครอบครัว */
function setup() {
  ensureSheets_();
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('FAMILY_KEY');
  if (!key) { key = newKey_(); props.setProperty('FAMILY_KEY', key); }
  if (!props.getProperty('SEQ')) props.setProperty('SEQ', '0');
  writeConfigSheet_(key);
  Logger.log('ติดตั้งเสร็จ รหัสครอบครัว: ' + key);
  return key;
}

/** สร้างรหัสครอบครัวใหม่ (อุปกรณ์เดิมต้องใส่รหัสใหม่) */
function resetFamilyKey() {
  var key = newKey_();
  PropertiesService.getScriptProperties().setProperty('FAMILY_KEY', key);
  writeConfigSheet_(key);
  Logger.log('รหัสครอบครัวใหม่: ' + key);
  return key;
}

function newKey_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 32);
}

function writeConfigSheet_(key) {
  var sh = sheet_(SHEETS.CONFIG);
  sh.getRange(1, 1, 4, 2).setValues([
    ['รายการ', 'ค่า'],
    ['รหัสครอบครัว (ใส่ในแอป)', key],
    ['เวอร์ชัน API', API_VERSION],
    ['หมายเหตุ', 'อย่าแชร์รหัสนี้กับคนนอกครอบครัว · เปลี่ยนรหัสได้โดยเรียกฟังก์ชัน resetFamilyKey']
  ]);
  sh.getRange(1, 1, 1, 2).setFontWeight('bold');
}

function ensureSheets_() {
  var logs = sheet_(SHEETS.LOGS);
  if (logs.getLastRow() === 0) {
    logs.getRange(1, 1, 1, LOG_COLS.length).setValues([LOG_COLS]).setFontWeight('bold');
    logs.setFrozenRows(1);
  }
  var st = sheet_(SHEETS.SETTINGS);
  if (st.getLastRow() === 0) {
    st.getRange(1, 1, 1, 2).setValues([['Key', 'Value']]).setFontWeight('bold');
    st.setFrozenRows(1);
  }
  sheet_(SHEETS.CONFIG);
}

function ss_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SS_ID');
  if (id) return SpreadsheetApp.openById(id);
  ss = SpreadsheetApp.create('Baby Log Data');
  props.setProperty('SS_ID', ss.getId());
  return ss;
}

function sheet_(name) {
  var ss = ss_();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

/* ======================= HTTP ======================= */

function doGet() {
  return json_({ ok: true, app: 'baby-log', version: API_VERSION, message: 'API พร้อมใช้งาน — ใช้ผ่านแอปเท่านั้น' });
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'bad_json' });
  }
  if (!checkKey_(req.key)) return json_({ ok: false, error: 'unauthorized' });
  try {
    switch (req.action) {
      case 'ping': return json_({ ok: true, version: API_VERSION, serverTime: Date.now() });
      case 'sync': return json_(sync_(req));
      default: return json_({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    return json_({ ok: false, error: 'server_error', detail: String(err && err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function checkKey_(key) {
  var real = PropertiesService.getScriptProperties().getProperty('FAMILY_KEY');
  if (!real || typeof key !== 'string' || key.length !== real.length) return false;
  var diff = 0;
  for (var i = 0; i < real.length; i++) diff |= real.charCodeAt(i) ^ key.charCodeAt(i);
  return diff === 0;
}

/* ======================= Sync ======================= */

/**
 * req: { since: number, device: string, push: [record], settings: {..., updatedAt} | null }
 * ผล: { ok, seq, records: [record ที่ Seq > since], settings, accepted: [id] }
 * กติกาชนกัน: เวลาแก้ไข (updatedAt) ใหม่กว่าชนะ
 */
function sync_(req) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    ensureSheets_();
    var sh = sheet_(SHEETS.LOGS);
    var props = PropertiesService.getScriptProperties();
    var seq = Number(props.getProperty('SEQ') || 0);
    var device = cleanStr_(req.device, 40);

    var last = sh.getLastRow();
    var rows = last > 1 ? sh.getRange(2, 1, last - 1, LOG_COLS.length).getValues() : [];
    var index = {};
    for (var i = 0; i < rows.length; i++) index[String(rows[i][0])] = i;

    var push = Array.isArray(req.push) ? req.push.slice(0, MAX_PUSH) : [];
    var accepted = [], appended = [], changed = {};
    push.forEach(function (raw) {
      var r = sanitize_(raw, device);
      if (!r) return;
      accepted.push(r.id);
      var at = index[r.id];
      if (at === undefined) {
        seq++; appended.push(toRow_(r, seq)); index[r.id] = rows.length + appended.length - 1;
      } else if (at >= rows.length) {
        var k = at - rows.length;   // ซ้ำกันในชุดเดียวกัน
        if (Number(r.updatedAt) > Number(appended[k][17] || 0)) { seq++; appended[k] = toRow_(r, seq); }
      } else {
        var cur = rows[at];
        if (Number(r.updatedAt) > Number(cur[17] || 0)) { seq++; rows[at] = toRow_(r, seq); changed[at] = true; }
      }
    });

    Object.keys(changed).forEach(function (k) {
      var idx = Number(k);
      sh.getRange(idx + 2, 1, 1, LOG_COLS.length).setValues([rows[idx]]);
    });
    if (appended.length) {
      sh.getRange(sh.getLastRow() + 1, 1, appended.length, LOG_COLS.length).setValues(appended);
      rows = rows.concat(appended);
    }
    props.setProperty('SEQ', String(seq));

    var settings = syncSettings_(req.settings);
    var since = Number(req.since) || 0;
    var out = [];
    for (var j = 0; j < rows.length; j++) if (Number(rows[j][1]) > since) out.push(fromRow_(rows[j]));
    return { ok: true, seq: seq, records: out, settings: settings, accepted: accepted };
  } finally {
    lock.releaseLock();
  }
}

function syncSettings_(incoming) {
  var sh = sheet_(SHEETS.SETTINGS);
  var last = sh.getLastRow();
  var cur = {};
  if (last > 1) sh.getRange(2, 1, last - 1, 2).getValues().forEach(function (r) { if (r[0]) cur[r[0]] = r[1]; });
  var curAt = Number(cur.updatedAt || 0);
  if (incoming && Number(incoming.updatedAt) > curAt) {
    var next = { updatedAt: Number(incoming.updatedAt) };
    SETTING_KEYS.forEach(function (k) { next[k] = cleanStr_(incoming[k], 80); });
    var vals = SETTING_KEYS.concat(['updatedAt']).map(function (k) { return [k, String(next[k] == null ? '' : next[k])]; });
    if (last > 1) sh.getRange(2, 1, last - 1, 2).clearContent();
    var range = sh.getRange(2, 1, vals.length, 2);
    range.setNumberFormat('@');
    range.setValues(vals);
    cur = next;
  }
  if (!cur.updatedAt) return null;
  var res = { updatedAt: Number(cur.updatedAt) };
  SETTING_KEYS.forEach(function (k) { res[k] = cur[k] == null ? '' : String(cur[k]); });
  return res;
}

/* ======================= แปลงข้อมูล ======================= */

function sanitize_(r, device) {
  if (!r || typeof r !== 'object') return null;
  var id = cleanStr_(r.id, 64);
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) return null;
  if (TYPES.indexOf(r.type) < 0) return null;
  var ts = Number(r.ts);
  if (!isFinite(ts) || ts < 1.5e12 || ts > 4e12) return null;
  return {
    id: id, type: r.type, ts: ts,
    endTs: numOrBlank_(r.endTs),
    color: cleanStr_(r.color, 8), consistency: cleanStr_(r.consistency, 12),
    amount: numOrBlank_(r.amount), method: cleanStr_(r.method, 12),
    durL: numOrBlank_(r.durL), durR: numOrBlank_(r.durR),
    tempC: numOrBlank_(r.tempC), tempSite: cleanStr_(r.tempSite, 12),
    zone: numOrBlank_(r.zone), photoId: cleanStr_(r.photoId, 80),
    note: cleanStr_(r.note, 500),
    updatedAt: Number(r.updatedAt) || Date.now(),
    deleted: r.deleted ? true : false,
    device: device || cleanStr_(r.device, 40),
    babyId: cleanStr_(r.babyId, 20) || 'b1',
    side: cleanStr_(r.side, 2)
  };
}

function toRow_(r, seq) {
  return [r.id, seq, r.type, r.ts, new Date(r.ts), r.endTs, r.color, r.consistency, r.amount, r.method,
          r.durL, r.durR, r.tempC, r.tempSite, r.zone, r.photoId, r.note, r.updatedAt, r.deleted, r.device, r.babyId, r.side];
}

function fromRow_(row) {
  var n = function (v) { return v === '' || v === null ? null : Number(v); };
  return {
    id: String(row[0]), seq: Number(row[1]), type: row[2], ts: Number(row[3]), endTs: n(row[5]),
    color: row[6] || '', consistency: row[7] || '', amount: n(row[8]), method: row[9] || '',
    durL: n(row[10]), durR: n(row[11]), tempC: n(row[12]), tempSite: row[13] || '', zone: n(row[14]),
    photoId: row[15] || '', note: row[16] || '', updatedAt: Number(row[17]),
    deleted: row[18] === true || row[18] === 'TRUE', device: row[19] || '', babyId: row[20] || 'b1', side: row[21] || ''
  };
}

function cleanStr_(v, max) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[\u0000-\u001f]/g, ' ').slice(0, max);
}

function numOrBlank_(v) {
  if (v === null || v === undefined || v === '') return '';
  var n = Number(v);
  return isFinite(n) ? n : '';
}
