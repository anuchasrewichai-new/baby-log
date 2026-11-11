import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGas } from './gas-stub.js';

const DAY = 86400000;
const IMG = Buffer.from('fake-jpeg-bytes-1234567890').toString('base64');
function setup() { const g = loadGas(); const key = g.ctx.setup(); return { ...g, key }; }
const rec = (id, color, ts, extra = {}) => ({ id, type: 'poop', ts, color, consistency: 'soft', updatedAt: ts, ...extra });

test('setup สร้างโฟลเดอร์รูป แผ่นงาน Photos และตั้งเวลาล้างรูปรายวัน', () => {
  const { ss, drive, ctx } = setup();
  assert.ok(ss.getSheetByName('Photos'));
  assert.equal(drive.folders.size, 2, 'โฟลเดอร์รูป + โฟลเดอร์สำรอง');
  assert.ok(drive.triggers.some((t) => t.getHandlerFunction() === 'dailyCleanup'));
  ctx.setup();
  assert.equal(drive.triggers.length, 2, 'เรียก setup ซ้ำไม่สร้าง trigger ซ้ำ');
  assert.equal(drive.folders.size, 2, 'ไม่สร้างโฟลเดอร์ซ้ำ');
});

test('อัปโหลดรูป แล้วอีกเครื่องดึงรูปได้ตรงกัน และอัปโหลดซ้ำไม่สร้างไฟล์ซ้ำ', () => {
  const { post, key, drive } = setup();
  const up = post({ key, action: 'uploadPhoto', photoId: 'p1', recordId: 'r1', data: 'data:image/jpeg;base64,' + IMG, mime: 'image/jpeg', ts: Date.now(), color: 's06' });
  assert.equal(up.ok, true);
  const again = post({ key, action: 'uploadPhoto', photoId: 'p1', recordId: 'r1', data: IMG, ts: Date.now() });
  assert.equal(again.duplicate, true);
  assert.equal(drive.files.size, 1);
  const got = post({ key, action: 'getPhoto', photoId: 'p1' });
  assert.equal(got.data, IMG);
  assert.equal(got.mime, 'image/jpeg');
});

test('ปฏิเสธรูปที่ใหญ่เกิน และไม่มีรหัส', () => {
  const { post, key } = setup();
  assert.equal(post({ action: 'uploadPhoto', photoId: 'p1', data: IMG }).error, 'unauthorized');
  assert.equal(post({ key, action: 'uploadPhoto', photoId: 'p1', data: 'A'.repeat(2200000) }).error, 'photo_too_large');
  assert.equal(post({ key, action: 'uploadPhoto', photoId: 'bad id', data: IMG }).error, 'bad_photo_id');
});

test('ล้างรูป: ลบเฉพาะรูปปกติที่เก่ากว่ากำหนด รูปที่ถูกเตือนเก็บไว้เสมอ', () => {
  const { post, key, drive } = setup();
  const now = Date.now(), old = now - 40 * DAY;
  post({ key, action: 'sync', since: 0, push: [
    rec('rOld', 's06', old), rec('rPale', 's02', old), rec('rBlood', 's10', old), rec('rWatery', 's06', old, { consistency: 'watery' }), rec('rNew', 's06', now - DAY)
  ] });
  const up = (pid, rid, ts, keep = false) => post({ key, action: 'uploadPhoto', photoId: pid, recordId: rid, data: IMG, ts, keep });
  up('pOld', 'rOld', old); up('pPale', 'rPale', old); up('pBlood', 'rBlood', old); up('pWatery', 'rWatery', old); up('pNew', 'rNew', now - DAY);
  up('pFlag', 'rUnknown', old, true);
  const res = post({ key, action: 'cleanupPhotos', days: 30 });
  assert.equal(res.trashed, 1, 'ลบแค่รูปปกติที่เก่า');
  assert.equal(res.kept, 4, 'สีซีด เลือด ถ่ายเป็นน้ำ และรูปที่แอปติดธงไว้ ถูกเก็บ');
  const trashed = [...drive.files.values()].filter((f) => f.trashed);
  assert.equal(trashed.length, 1);
  assert.equal(post({ key, action: 'getPhoto', photoId: 'pOld' }).error, 'photo_deleted');
  assert.ok(post({ key, action: 'getPhoto', photoId: 'pPale' }).data);
  const st = post({ key, action: 'photoStats' });
  assert.equal(st.count, 5); assert.equal(st.keep, 4);
  assert.equal(st.driveLimit, 15e9);
});

test('ตั้งค่า "ไม่ลบ" (0 วัน) และค่าจากหน้าตั้งค่า', () => {
  const { post, key, ctx } = setup();
  const old = Date.now() - 100 * DAY;
  post({ key, action: 'sync', since: 0, push: [rec('r1', 's06', old)], settings: { photoRetentionDays: '0', updatedAt: Date.now() } });
  post({ key, action: 'uploadPhoto', photoId: 'p1', recordId: 'r1', data: IMG, ts: old });
  assert.equal(ctx.dailyCleanup().trashed, 0);
  post({ key, action: 'sync', since: 0, push: [], settings: { photoRetentionDays: '90', updatedAt: Date.now() + 1 } });
  assert.equal(ctx.dailyCleanup().trashed, 1);
});

test('ลบรูปเดี่ยว', () => {
  const { post, key, drive } = setup();
  post({ key, action: 'uploadPhoto', photoId: 'p1', recordId: 'r1', data: IMG, ts: Date.now() });
  assert.equal(post({ key, action: 'deletePhoto', photoId: 'p1' }).ok, true);
  assert.equal([...drive.files.values()][0].trashed, true);
});
