"""ทดสอบ Phase 3 (อุณหภูมิ ตัวเหลือง การนอน แจ้งเตือน): python3 tests/e2e_health.py [base_url]"""
import json, sys, os, time
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765'
OUT = '/tmp/shots3'; os.makedirs(OUT, exist_ok=True)
errors = []
SPY = """
// Chromium แบบ headless ไม่แสดงการแจ้งเตือนจริง → จำลองว่าได้รับอนุญาต และจดชื่อเรื่องที่แจ้งไว้ตรวจ
window.__notes = [];
Object.defineProperty(Notification, 'permission', { get: () => 'granted' });
Notification.requestPermission = () => Promise.resolve('granted');
ServiceWorkerRegistration.prototype.showNotification = function (t, o) { window.__notes.push(t); return Promise.resolve(); };
"""
def shot(page, name, full=False): page.wait_for_timeout(400); page.screenshot(path=f'{OUT}/{name}.png', full_page=full)
def notes(page): return page.evaluate('window.__notes')

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, timezone_id='Asia/Bangkok')
    ctx.grant_permissions(['notifications'], origin=BASE)
    ctx.add_init_script(SPY)
    page = ctx.new_page()
    page.on('console', lambda m: m.type == 'error' and errors.append(m.text)); page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE + '/'); page.wait_for_selector('form[data-form="onboard"]')
    page.fill('input[name=babyName]', 'น้องสุขภาพ'); page.fill('input[name=birthDate]', '2026-11-03'); page.fill('input[name=birthWeightKg]', '3.3')
    page.click('button[type=submit]'); page.wait_for_selector('.quick-3'); shot(page, '01-home')

    # เปิดการแจ้งเตือน
    page.goto(BASE + '/#/settings'); page.wait_for_selector('#notify')
    page.check('input[data-act=notify-toggle]'); page.wait_for_timeout(500)
    page.click('[data-act=notify-test]'); page.wait_for_timeout(800)
    print('test notification:', notes(page)); assert any('ทดสอบ' in n for n in notes(page))
    page.locator('#notify').scroll_into_view_if_needed(); shot(page, '02-settings-notify')

    # อุณหภูมิ 38.2 → ด่วน + แจ้งเตือน
    page.goto(BASE + '/#/log/temp'); page.wait_for_selector('input[data-bind=tempC]')
    shot(page, '03-temp-normal')
    for _ in range(14): page.click('[data-act=tmp][data-v="0.1"]')
    assert '38.2' in page.input_value('input[data-bind=tempC]'), page.input_value('input[data-bind=tempC]')
    shot(page, '04-temp-fever'); assert 'พบแพทย์ทันที' in page.inner_text('.result')
    page.click('[data-act=save]'); page.wait_for_selector('.quick-3'); page.wait_for_timeout(800)
    print('alerts:', page.inner_text('.alert >> nth=0').replace('\n', ' ')); print('notes:', notes(page))
    assert any('ไข้' in n for n in notes(page))
    shot(page, '05-home-fever')

    # ตัวเหลือง: แตะท้อง (ระดับ 3)
    page.goto(BASE + '/#/log/jaundice'); page.wait_for_selector('.body-map')
    page.click('.zbtn[data-v="3"]'); shot(page, '06-jaundice-3')
    assert 'ควรปรึกษาแพทย์' in page.inner_text('.result')
    page.click('.zbtn[data-v="1"]'); page.click('[data-act=save]'); page.wait_for_selector('.quick-3')

    # การนอน
    page.goto(BASE + '/#/log/sleep'); page.wait_for_selector('[data-act=sleep-start]'); shot(page, '07-sleep-start')
    page.click('[data-act=sleep-start]'); page.wait_for_selector('.banner-sleep'); page.wait_for_timeout(1200); shot(page, '08-home-sleeping')
    page.click('.banner-sleep'); page.wait_for_selector('[data-act=sleep-stop]'); shot(page, '09-sleep-running')
    page.click('[data-act=sleep-stop]'); page.wait_for_selector('.quick-3')
    assert 'บันทึกการนอน' in page.inner_text('#toast')
    # บันทึกการนอนย้อนหลัง 5 ชม. → เฝ้าระวัง
    page.goto(BASE + '/#/log/sleep'); page.click('details.manual summary')
    now = time.localtime()
    page.fill('details.manual input[data-bind=ts]', time.strftime('%Y-%m-%dT', now) + '01:00')
    page.fill('details.manual input[data-bind=endTs]', time.strftime('%Y-%m-%dT', now) + '06:10'); page.wait_for_timeout(900)
    page.click('details.manual [data-act=save]'); page.wait_for_selector('.quick-3')

    # ถึงเวลาให้นม: นำเข้ามื้อนมเมื่อ 3.5 ชม.ก่อน
    seed = {'app': 'baby-log', 'records': [
        {'id': 'f-old', 'type': 'feed', 'ts': int(time.time() * 1000) - int(3.5 * 3600000), 'method': 'breast', 'durL': 10, 'updatedAt': 1},
        {'id': 'p-old', 'type': 'pee', 'ts': int(time.time() * 1000) - int(6.5 * 3600000), 'color': 'u2', 'updatedAt': 1}]}
    json.dump(seed, open('/tmp/seed3.json', 'w'))
    page.goto(BASE + '/#/settings'); page.set_input_files('input[data-act=import]', '/tmp/seed3.json'); page.wait_for_timeout(600)
    page.goto(BASE + '/#/'); page.wait_for_selector('.alert'); page.wait_for_timeout(800)
    titles = page.locator('.alert b').all_inner_texts(); print('alerts on home:', titles)
    assert any('ให้นม' in t for t in titles) and any('ไม่มีฉี่' in t for t in titles)
    shot(page, '10-home-alerts', full=True)
    n_before = len(notes(page))
    page.reload(); page.wait_for_selector('.alert'); page.wait_for_timeout(800)
    assert len(notes(page)) == 0, 'หลังรีโหลดไม่แจ้งซ้ำ'   # spy ถูกรีเซ็ตเมื่อรีโหลด → ต้องไม่มีการแจ้งใหม่
    page.click('.alert:has-text("ให้นม") [data-act=alert-dismiss]'); page.wait_for_timeout(300)
    assert not any('ถึงเวลาให้นม' in t for t in page.locator('.alert b').all_inner_texts())

    page.goto(BASE + '/#/dash'); page.wait_for_selector('.chart'); shot(page, '11-dash', full=True)
    page.goto(BASE + '/#/history'); page.wait_for_selector('.row'); shot(page, '12-history')

    ctx3 = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, color_scheme='dark', timezone_id='Asia/Bangkok')
    p3 = ctx3.new_page(); p3.goto(BASE + '/'); p3.wait_for_selector('form[data-form="onboard"]')
    p3.fill('input[name=birthDate]', '2026-11-03'); p3.click('button[type=submit]'); p3.wait_for_selector('.quick-3')
    p3.goto(BASE + '/#/log/jaundice'); p3.click('.zbtn[data-v="2"]'); shot(p3, '13-dark-jaundice')
    b.close()
print('ERRORS:', errors or 'none')
