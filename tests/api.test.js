import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGas } from './gas-stub.js';

const T0 = Date.parse('2026-11-11T08:00:00+07:00');
const rec = (id, extra = {}) => ({ id, type: 'pee', ts: T0, color: 'u2', updatedAt: T0, ...extra });

function setupGas() {
  const g = loadGas();
  const key = g.ctx.setup();
  return { ...g, key };
}

test('setup สร้างแผ่นงานและรหัสครอบครัว 32 ตัว', () => {
  const { ss, key } = setupGas();
  assert.equal(key.length, 32);
  assert.ok(ss.getSheetByName('Logs') && ss.getSheetByName('Settings') && ss.getSheetByName('Config'));
  assert.equal(ss.getSheetByName('Config').data[1][1], key);
});

test('ไม่มีรหัส/รหัสผิด ถูกปฏิเสธ', () => {
  const { post, key } = setupGas();
  assert.equal(post({ action: 'ping' }).error, 'unauthorized');
  assert.equal(post({ action: 'ping', key: key.replace(/./, (c) => (c === 'a' ? 'b' : 'a')) }).error, 'unauthorized');
  assert.equal(post({ action: 'ping', key }).ok, true);
});

test('ซิงก์: ส่งขึ้น แล้วอีกเครื่องดึงลงได้ครบ', () => {
  const { post, key } = setupGas();
  const a = post({ key, action: 'sync', since: 0, device: 'A', push: [rec('a1'), rec('a2', { type: 'poop', color: 's06' })] });
  assert.equal(a.ok, true);
  assert.deepEqual(a.accepted, ['a1', 'a2']);
  assert.equal(a.seq, 2);
  const b = post({ key, action: 'sync', since: 0, device: 'B', push: [] });
  assert.equal(b.records.length, 2);
  assert.equal(b.records.find((r) => r.id === 'a2').color, 's06');
  assert.equal(b.records[0].ts, T0);
  const c = post({ key, action: 'sync', since: b.seq, device: 'B', push: [] });
  assert.equal(c.records.length, 0, 'ไม่ส่งซ้ำเมื่อใช้ since');
});

test('แก้ไขชนกัน: เวลาแก้ไขใหม่กว่าชนะ และการลบซิงก์ได้', () => {
  const { post, key } = setupGas();
  post({ key, action: 'sync', since: 0, push: [rec('x1', { note: 'แรก', updatedAt: T0 + 10 })] });
  post({ key, action: 'sync', since: 0, push: [rec('x1', { note: 'เก่ากว่า', updatedAt: T0 + 5 })] });
  let r = post({ key, action: 'sync', since: 0, push: [] }).records.find((x) => x.id === 'x1');
  assert.equal(r.note, 'แรก');
  post({ key, action: 'sync', since: 0, push: [rec('x1', { deleted: true, updatedAt: T0 + 20 })] });
  r = post({ key, action: 'sync', since: 0, push: [] }).records.find((x) => x.id === 'x1');
  assert.equal(r.deleted, true);
});

test('ข้อมูลไม่ถูกต้องถูกทิ้ง ไม่ทำให้ทั้งชุดล้ม', () => {
  const { post, key } = setupGas();
  const res = post({ key, action: 'sync', since: 0, push: [rec('ok1'), { id: 'bad id!', type: 'pee', ts: T0 }, { id: 'b2', type: 'hack', ts: T0 }, { id: 'b3', type: 'pee', ts: 5 }, rec('ok1', { updatedAt: T0 + 1 })] });
  assert.deepEqual(res.accepted, ['ok1', 'ok1']);
  assert.equal(res.records.length, 1);
});

test('ตั้งค่าซิงก์ได้ ค่าที่ใหม่กว่าชนะ', () => {
  const { post, key } = setupGas();
  post({ key, action: 'sync', since: 0, push: [], settings: { babyName: 'น้องเอ', birthDate: '2026-11-03', updatedAt: T0 } });
  let s = post({ key, action: 'sync', since: 0, push: [], settings: { babyName: 'เก่า', updatedAt: T0 - 1 } }).settings;
  assert.equal(s.babyName, 'น้องเอ');
  assert.equal(s.birthDate, '2026-11-03');
  s = post({ key, action: 'sync', since: 0, push: [], settings: { babyName: 'น้องบี', birthDate: '2026-11-03', updatedAt: T0 + 1 } }).settings;
  assert.equal(s.babyName, 'น้องบี');
});
