import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGas } from './gas-stub.js';

test('setup ตั้งเวลาสำรองรายสัปดาห์ และสำรองเก็บแค่ 8 ชุดล่าสุด', () => {
  const g = loadGas(); const key = g.ctx.setup();
  const fns = g.drive.triggers.map((t) => t.getHandlerFunction()).sort();
  assert.deepEqual(fns, ['dailyCleanup', 'weeklyBackup']);
  g.ctx.setup();
  assert.equal(g.drive.triggers.length, 2, 'เรียก setup ซ้ำไม่ซ้อน trigger');
  for (let i = 0; i < 10; i++) g.ctx.weeklyBackup();
  const copies = [...g.drive.files.values()].filter((f) => f.blob.mime === 'sheet');
  assert.equal(copies.length, 10);
  assert.equal(copies.filter((f) => !f.trashed).length, 8);
  assert.ok(copies.slice(0, 2).every((f) => f.trashed), 'ลบชุดเก่าที่สุดก่อน');
  const st = g.post({ key, action: 'backupStatus' });
  assert.equal(st.count, 8); assert.ok(st.lastAt); assert.ok(st.folderUrl);
  assert.equal(g.post({ key, action: 'backupNow' }).ok, true);
});
