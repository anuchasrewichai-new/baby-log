"""ทดสอบ Phase 4 (รายงานแพทย์): python3 tests/e2e_report.py [base_url]"""
import json, sys, os
from datetime import datetime, timedelta
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__))

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765'
OUT = '/tmp/shots4'; os.makedirs(OUT, exist_ok=True)
errors = []
ts = lambda dt: int(dt.timestamp() * 1000)

def seed():
    recs = []; n = 0
    plan = {'2026-11-05': (3, [('s05', 3)], 10, 36.9, 1), '2026-11-06': (4, [('s05', 2), ('s06', 2)], 11, 37.0, 2),
            '2026-11-07': (5, [('s06', 4)], 10, 36.8, 2), '2026-11-08': (6, [('s06', 4), ('s07', 1)], 9, 37.1, 1),
            '2026-11-09': (7, [('s06', 5)], 10, 36.9, 1), '2026-11-10': (7, [('s06', 4)], 9, 36.8, 1)}
    for d, (pee, poops, feeds, t, jz) in plan.items():
        base = datetime.fromisoformat(d + 'T00:30:00')
        for i in range(pee): n += 1; recs.append({'id': f's{n}', 'type': 'pee', 'ts': ts(base + timedelta(hours=1 + i * 3.2)), 'color': 'u2', 'updatedAt': 1})
        k = 0
        for c, cnt in poops:
            for i in range(cnt): n += 1; k += 1; recs.append({'id': f's{n}', 'type': 'poop', 'ts': ts(base + timedelta(hours=2 + k * 4.1)), 'color': c, 'consistency': 'soft', 'updatedAt': 1})
        for i in range(feeds): n += 1; recs.append({'id': f's{n}', 'type': 'feed', 'ts': ts(base + timedelta(hours=i * 2.4)), 'method': 'breast', 'durL': 10, 'durR': 8, 'updatedAt': 1})
        n += 1; recs.append({'id': f's{n}', 'type': 'temp', 'ts': ts(base + timedelta(hours=9)), 'tempC': t, 'tempSite': 'axilla', 'updatedAt': 1})
        n += 1; recs.append({'id': f's{n}', 'type': 'jaundice', 'ts': ts(base + timedelta(hours=10)), 'zone': jz, 'updatedAt': 1})
        n += 1; recs.append({'id': f's{n}', 'type': 'sleep', 'ts': ts(base + timedelta(hours=12)), 'endTs': ts(base + timedelta(hours=15)), 'updatedAt': 1})
    for d, kg in [('2026-11-05', 3.15), ('2026-11-07', 3.12), ('2026-11-09', 3.18)]:
        n += 1; recs.append({'id': f's{n}', 'type': 'weight', 'ts': ts(datetime.fromisoformat(d + 'T09:00:00')), 'amount': kg, 'updatedAt': 1})
    json.dump({'app': 'baby-log', 'records': recs}, open('/tmp/seed4.json', 'w'))

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, timezone_id='Asia/Bangkok')
    ctx.add_init_script("window.__shared=null; navigator.share = (d) => { window.__shared = d; return Promise.resolve(); };")
    page = ctx.new_page()
    page.on('console', lambda m: m.type == 'error' and errors.append(m.text)); page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE + '/'); page.wait_for_selector('form[data-form="onboard"]')
    page.fill('input[name=babyName]', 'น้องข้าวหอม'); page.fill('input[name=birthDate]', '2026-11-03')
    page.fill('input[name=birthWeightKg]', '3.35'); page.fill('input[name=gestationWeeks]', '39')
    page.click('button[type=submit]'); page.wait_for_selector('.quick-3')
    seed(); page.goto(BASE + '/#/settings'); page.wait_for_timeout(800); page.set_input_files('input[data-act=import]', '/tmp/seed4.json'); page.wait_for_timeout(600)
    # วันนี้: อึปกติพร้อมรูป + อึสีซีดพร้อมรูป (เพื่อดูรูปที่ถูกเตือนในรายงาน)
    for color, img in [('s06', '/tmp/phone-photo.jpg'), ('s02', 'img/stool-02-clay.jpg')]:
        page.goto(BASE + '/#/log/poop'); page.set_input_files('.photo-btn input[data-act=photo-input]', img); page.wait_for_selector('.compare img')
        page.click(f'[data-act=pick-color][data-v={color}]'); page.click('[data-act=save]'); page.wait_for_selector('.quick-3')

    page.goto(BASE + '/#/report'); page.wait_for_selector('#report'); page.wait_for_timeout(800)
    rows = page.locator('.rp-table tbody tr').count(); print('table rows:', rows); assert rows == 7
    page.fill('textarea[data-bind-notes]', 'ตัวเหลืองระดับ 1 ที่ยังเหลือ ต้องเจาะเลือดซ้ำไหม\nควรนัดชั่งน้ำหนักครั้งถัดไปเมื่อไร')
    page.wait_for_timeout(600)
    print('findings:', page.locator('.rp-find li').all_inner_texts()[:3])
    assert page.locator('.rp-photos figure').count() == 2 and page.locator('.rp-photos .rp-flag').count() == 1
    shot = lambda n, full=False: (page.wait_for_timeout(300), page.screenshot(path=f'{OUT}/{n}.png', full_page=full))
    shot('01-report-top'); shot('02-report-full', True)
    page.click('[data-act=rep-share]'); page.wait_for_timeout(300)
    shared = page.evaluate('window.__shared'); print('share text:\n' + shared['text'][:400])
    page.click('[data-act=rep-range][data-v="14"]'); page.wait_for_selector('.rp-table'); print('14-day rows:', page.locator('.rp-table tbody tr').count())
    page.click('[data-act=rep-range][data-v="7"]'); page.wait_for_timeout(500)
    # PDF จริงจากโหมดพิมพ์ของ Chrome
    page.evaluate('document.body.classList.add("on-report")')
    page.emulate_media(media='print')
    page.pdf(path=f'{OUT}/รายงานตัวอย่าง.pdf', format='A4', print_background=True, prefer_css_page_size=True)
    page.emulate_media(media='screen')
    # โหมดมืด: กระดาษรายงานยังเป็นสีขาว
    ctx2 = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, color_scheme='dark', timezone_id='Asia/Bangkok')
    p2 = ctx2.new_page(); p2.goto(BASE + '/'); p2.wait_for_selector('form[data-form="onboard"]'); p2.fill('input[name=birthDate]', '2026-11-03'); p2.click('button[type=submit]')
    p2.goto(BASE + '/#/report'); p2.wait_for_selector('#report'); p2.wait_for_timeout(400); p2.screenshot(path=f'{OUT}/03-dark.png')
    b.close()
print('ERRORS:', errors or 'none')
