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

var API_VERSION = '1.3.0';
var SHEETS = { LOGS: 'Logs', SETTINGS: 'Settings', CONFIG: 'Config', PHOTOS: 'Photos' };
var PHOTO_COLS = ['PhotoID', 'DriveFileID', 'RecordID', 'Ts', 'Time', 'Bytes', 'Keep', 'CreatedAt', 'Trashed'];
var PHOTO_FOLDER_NAME = 'Baby Log Photos';
var MAX_PHOTO_BYTES = 1500000;
var LOG_COLS = ['ID', 'Seq', 'Type', 'Ts', 'Time', 'EndTs', 'Color', 'Consistency', 'Amount', 'Method',
                'DurL', 'DurR', 'TempC', 'TempSite', 'Zone', 'PhotoID', 'Note', 'UpdatedAt', 'Deleted', 'Device', 'BabyID', 'Side', 'AiPale'];
var TYPES = ['pee', 'poop', 'feed', 'weight', 'temp', 'jaundice', 'sleep'];
var SETTING_KEYS = ['babyName', 'birthDate', 'birthWeightKg', 'gestationWeeks', 'feedingType', 'feedIntervalH', 'peeAlertH', 'photoRetentionDays', 'photoMode'];
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
  photoFolder_();
  installDailyCleanup();
  backupFolder_();
  installWeeklyBackup();
  Logger.log('ติดตั้งเสร็จ รหัสครอบครัว: ' + key);
  return key;
}

/** ตั้งเวลาล้างรูปเก่าอัตโนมัติทุกวัน ตี 3 (เรียกจาก setup แล้ว) */
function installDailyCleanup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyCleanup') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyCleanup').timeBased().everyDays(1).atHour(3).create();
}

function dailyCleanup() {
  return cleanupPhotos_(null);
}

/* ======================= สำรองข้อมูลอัตโนมัติ (Phase 6) ======================= */
var BACKUP_FOLDER_NAME = 'Baby Log Backups';
var BACKUP_KEEP = 8;

/** ตั้งเวลาสำรอง Google Sheet ทุกวันอาทิตย์ ตี 2 (เรียกจาก setup แล้ว) */
function installWeeklyBackup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'weeklyBackup') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('weeklyBackup').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(2).create();
}

function backupFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('BACKUP_FOLDER_ID');
  if (id) { try { var f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* สร้างใหม่ */ } }
  var folder = DriveApp.createFolder(BACKUP_FOLDER_NAME);
  folder.setDescription('สำเนา Google Sheet ของแอปบันทึกลูกน้อย (เก็บ ' + BACKUP_KEEP + ' ชุดล่าสุด)');
  props.setProperty('BACKUP_FOLDER_ID', folder.getId());
  return folder;
}

/** คัดลอกไฟล์ Sheet ทั้งไฟล์ไปโฟลเดอร์สำรอง และลบสำเนาเก่าที่เกิน 8 ชุด (ไปถังขยะ) · เรียกเองได้ทุกเมื่อ */
function weeklyBackup() {
  var ss = ss_();
  var folder = backupFolder_();
  var name = 'Baby Log Backup ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HHmm');
  var copy = DriveApp.getFileById(ss.getId()).makeCopy(name, folder);
  var props = PropertiesService.getScriptProperties();
  var list = [];
  try { list = JSON.parse(props.getProperty('BACKUP_IDS') || '[]'); } catch (e) { list = []; }
  list.push(copy.getId());
  while (list.length > BACKUP_KEEP) {
    var old = list.shift();
    try { DriveApp.getFileById(old).setTrashed(true); } catch (e) { /* ลบไปแล้ว */ }
  }
  props.setProperty('BACKUP_IDS', JSON.stringify(list));
  props.setProperty('LAST_BACKUP_AT', String(Date.now()));
  return { ok: true, fileId: copy.getId(), name: name, kept: list.length };
}

function backupStatus_() {
  var p = PropertiesService.getScriptProperties();
  var list = [];
  try { list = JSON.parse(p.getProperty('BACKUP_IDS') || '[]'); } catch (e) { list = []; }
  var url = null;
  try { url = backupFolder_().getUrl(); } catch (e) { /* ไม่มีสิทธิ์ Drive */ }
  return { ok: true, lastAt: Number(p.getProperty('LAST_BACKUP_AT')) || null, count: list.length, folderUrl: url };
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
  } else if (String(logs.getRange(1, LOG_COLS.length).getValues()[0][0]) !== LOG_COLS[LOG_COLS.length - 1]) {
    logs.getRange(1, 1, 1, LOG_COLS.length).setValues([LOG_COLS]).setFontWeight('bold');   // เพิ่มหัวคอลัมน์ใหม่ เมื่ออัปเดตเวอร์ชัน
  }
  var st = sheet_(SHEETS.SETTINGS);
  if (st.getLastRow() === 0) {
    st.getRange(1, 1, 1, 2).setValues([['Key', 'Value']]).setFontWeight('bold');
    st.setFrozenRows(1);
  }
  sheet_(SHEETS.CONFIG);
  var ph = sheet_(SHEETS.PHOTOS);
  if (ph.getLastRow() === 0) {
    ph.getRange(1, 1, 1, PHOTO_COLS.length).setValues([PHOTO_COLS]).setFontWeight('bold');
    ph.setFrozenRows(1);
  }
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
      case 'uploadPhoto': return json_(uploadPhoto_(req));
      case 'getPhoto': return json_(getPhoto_(req));
      case 'deletePhoto': return json_(deletePhoto_(req));
      case 'photoStats': return json_(photoStats_());
      case 'cleanupPhotos': return json_(cleanupPhotos_(req.days));
      case 'backupStatus': return json_(backupStatus_());
      case 'backupNow': return json_(weeklyBackup());
      case 'aiStatus': return json_(aiStatus_());
      case 'aiPhoto': return json_(aiPhoto_(req));
      case 'aiText': return json_(aiText_(req));
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
    side: cleanStr_(r.side, 2),
    aiPale: numOrBlank_(r.aiPale)
  };
}

function toRow_(r, seq) {
  return [r.id, seq, r.type, r.ts, new Date(r.ts), r.endTs, r.color, r.consistency, r.amount, r.method,
          r.durL, r.durR, r.tempC, r.tempSite, r.zone, r.photoId, r.note, r.updatedAt, r.deleted, r.device, r.babyId, r.side, r.aiPale];
}

function fromRow_(row) {
  var n = function (v) { return v === '' || v === null ? null : Number(v); };
  return {
    id: String(row[0]), seq: Number(row[1]), type: row[2], ts: Number(row[3]), endTs: n(row[5]),
    color: row[6] || '', consistency: row[7] || '', amount: n(row[8]), method: row[9] || '',
    durL: n(row[10]), durR: n(row[11]), tempC: n(row[12]), tempSite: row[13] || '', zone: n(row[14]),
    photoId: row[15] || '', note: row[16] || '', updatedAt: Number(row[17]),
    deleted: row[18] === true || row[18] === 'TRUE', device: row[19] || '', babyId: row[20] || 'b1', side: row[21] || '', aiPale: n(row[22])
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


/* ======================= รูปถ่าย (Phase 2) ======================= */

function photoFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('PHOTO_FOLDER_ID');
  if (id) {
    try { var f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* สร้างใหม่ */ }
  }
  var folder = DriveApp.createFolder(PHOTO_FOLDER_NAME);
  folder.setDescription('รูปผ้าอ้อมจากแอปบันทึกลูกน้อย · ไม่ได้แชร์ให้ใคร');
  props.setProperty('PHOTO_FOLDER_ID', folder.getId());
  return folder;
}

function photoRows_() {
  var sh = sheet_(SHEETS.PHOTOS);
  var last = sh.getLastRow();
  return { sh: sh, rows: last > 1 ? sh.getRange(2, 1, last - 1, PHOTO_COLS.length).getValues() : [] };
}

/** สีหรือลักษณะที่ต้องเก็บรูปไว้เสมอ (เผื่อแพทย์ต้องดู) — เกณฑ์แบบกว้างกว่าในแอป เพื่อไม่ลบรูปสำคัญ */
var KEEP_COLORS = ['s01', 's02', 's03', 's04', 's10', 's11', 'u3', 'u4', 'u5'];
var KEEP_CONSISTENCY = ['watery', 'mucus', 'hard'];

function recordKeepMap_() {
  var sh = sheet_(SHEETS.LOGS);
  var last = sh.getLastRow();
  var map = {};
  if (last < 2) return map;
  sh.getRange(2, 1, last - 1, LOG_COLS.length).getValues().forEach(function (r) {
    var keep = KEEP_COLORS.indexOf(String(r[6])) >= 0 || KEEP_CONSISTENCY.indexOf(String(r[7])) >= 0 || Number(r[22]) >= 0.15;
    map[String(r[0])] = { keep: keep, deleted: r[18] === true || r[18] === 'TRUE' };
  });
  return map;
}

function uploadPhoto_(req) {
  var id = cleanStr_(req.photoId, 64);
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) return { ok: false, error: 'bad_photo_id' };
  var mime = req.mime === 'image/png' ? 'image/png' : 'image/jpeg';
  var b64 = String(req.data || '').replace(/^data:[^,]+,/, '');
  if (!b64 || b64.length > MAX_PHOTO_BYTES * 1.4) return { ok: false, error: 'photo_too_large' };
  var bytes = Utilities.base64Decode(b64);
  var ts = Number(req.ts) || Date.now();
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var p = photoRows_();
    for (var i = 0; i < p.rows.length; i++) {
      if (String(p.rows[i][0]) === id && !p.rows[i][8]) return { ok: true, photoId: id, driveId: String(p.rows[i][1]), duplicate: true };
    }
    var name = Utilities.formatDate(new Date(ts), Session.getScriptTimeZone(), 'yyyy-MM-dd_HHmm') + '_' + cleanStr_(req.color, 8) + '_' + id + (mime === 'image/png' ? '.png' : '.jpg');
    var file = photoFolder_().createFile(Utilities.newBlob(bytes, mime, name));
    file.setDescription('record:' + cleanStr_(req.recordId, 64));
    p.sh.getRange(p.sh.getLastRow() + 1, 1, 1, PHOTO_COLS.length).setValues([[
      id, file.getId(), cleanStr_(req.recordId, 64), ts, new Date(ts), bytes.length, req.keep ? true : false, new Date(), false
    ]]);
    return { ok: true, photoId: id, driveId: file.getId() };
  } finally {
    lock.releaseLock();
  }
}

function getPhoto_(req) {
  var id = cleanStr_(req.photoId, 64);
  var p = photoRows_();
  for (var i = 0; i < p.rows.length; i++) {
    if (String(p.rows[i][0]) === id) {
      if (p.rows[i][8]) return { ok: false, error: 'photo_deleted' };
      var blob = DriveApp.getFileById(String(p.rows[i][1])).getBlob();
      return { ok: true, photoId: id, mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
    }
  }
  return { ok: false, error: 'photo_not_found' };
}

function deletePhoto_(req) {
  var id = cleanStr_(req.photoId, 64);
  var p = photoRows_();
  for (var i = 0; i < p.rows.length; i++) {
    if (String(p.rows[i][0]) === id && !p.rows[i][8]) {
      try { DriveApp.getFileById(String(p.rows[i][1])).setTrashed(true); } catch (e) { /* ลบไปแล้ว */ }
      p.sh.getRange(i + 2, 9).setValue(true);
      return { ok: true };
    }
  }
  return { ok: true, missing: true };
}

/** ย้ายรูปที่ "ปกติ" และเก่ากว่า N วันไปถังขยะ Drive (กู้คืนได้ 30 วัน) · days ว่าง = ใช้ค่าจากตั้งค่า · 0 = ไม่ลบ */
function cleanupPhotos_(days) {
  var d = days === undefined || days === null || days === '' ? null : Number(days);
  if (d === null) {
    var st = syncSettings_(null);
    d = st && st.photoRetentionDays !== '' ? Number(st.photoRetentionDays) : 30;
  }
  if (!(d > 0)) return { ok: true, trashed: 0, kept: 0, days: 0 };
  var cutoff = Date.now() - d * 86400000;
  var keepMap = recordKeepMap_();
  var p = photoRows_();
  var trashed = 0, kept = 0, freed = 0;
  for (var i = 0; i < p.rows.length; i++) {
    var r = p.rows[i];
    if (r[8]) continue;
    var rec = keepMap[String(r[2])];
    var keep = r[6] === true || r[6] === 'TRUE' || (rec && rec.keep && !rec.deleted);
    if (Number(r[3]) >= cutoff) continue;
    if (keep) { kept++; continue; }
    try { DriveApp.getFileById(String(r[1])).setTrashed(true); } catch (e) { /* ไม่มีไฟล์แล้ว */ }
    p.sh.getRange(i + 2, 9).setValue(true);
    trashed++; freed += Number(r[5]) || 0;
  }
  return { ok: true, trashed: trashed, kept: kept, freedBytes: freed, days: d };
}

function photoStats_() {
  var p = photoRows_();
  var keepMap = recordKeepMap_();
  var count = 0, bytes = 0, keep = 0;
  p.rows.forEach(function (r) {
    if (r[8]) return;
    count++; bytes += Number(r[5]) || 0;
    var rec = keepMap[String(r[2])];
    if (r[6] === true || r[6] === 'TRUE' || (rec && rec.keep && !rec.deleted)) keep++;
  });
  var used = null, limit = null;
  try { used = DriveApp.getStorageUsed(); limit = DriveApp.getStorageLimit(); } catch (e) { /* ไม่มีสิทธิ์อ่านโควตา */ }
  return { ok: true, count: count, bytes: bytes, keep: keep, driveUsed: used, driveLimit: limit, folderUrl: photoFolder_().getUrl() };
}
