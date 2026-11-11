"""ทดสอบแอปในเบราว์เซอร์จำลองขนาดมือถือ: python3 tests/e2e.py [base_url]"""
import json, sys, time, os, random, urllib.request
from datetime import datetime, timedelta
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765'
OUT = '/tmp/shots'; os.makedirs(OUT, exist_ok=True)
KEY = urllib.request.urlopen(BASE + '/__key').read().decode()
errors = []

def ts(dt): return int(dt.timestamp() * 1000)

def seed():
    """ข้อมูลตัวอย่าง วันที่ 3–8 ของชีวิต (เกิด 2026-11-03)"""
    random.seed(4)
    recs = []; n = 0
    plan = {  # date: (pee, [(color, count)], feeds)
        '2026-11-05': (3, [('s05', 3)], 10), '2026-11-06': (4, [('s05', 2), ('s06', 2)], 11),
        '2026-11-07': (5, [('s06', 4)], 10), '2026-11-08': (6, [('s06', 4), ('s07', 1)], 9),
        '2026-11-09': (7, [('s06', 5)], 10), '2026-11-10': (7, [('s06', 4)], 9),
    }
    for d, (pee, poops, feeds) in plan.items():
        base = datetime.fromisoformat(d + 'T00:30:00')
        for i in range(pee):
            n += 1; recs.append({'id': f'seed-{n}', 'type': 'pee', 'ts': ts(base + timedelta(hours=1 + i * 3.2)), 'color': 'u2', 'updatedAt': 1})
        k = 0
        for c, cnt in poops:
            for i in range(cnt):
                n += 1; k += 1; recs.append({'id': f'seed-{n}', 'type': 'poop', 'ts': ts(base + timedelta(hours=2 + k * 4.1)), 'color': c, 'consistency': 'soft', 'updatedAt': 1})
        for i in range(feeds):
            n += 1; recs.append({'id': f'seed-{n}', 'type': 'feed', 'ts': ts(base + timedelta(hours=i * 2.4)), 'method': 'breast', 'durL': 10, 'durR': 8, 'side': 'R', 'updatedAt': 1})
    for d, kg in [('2026-11-05', 3.15), ('2026-11-07', 3.12), ('2026-11-09', 3.18)]:
        n += 1; recs.append({'id': f'seed-{n}', 'type': 'weight', 'ts': ts(datetime.fromisoformat(d + 'T09:00:00')), 'amount': kg, 'updatedAt': 1})
    p = '/tmp/seed.json'; json.dump({'app': 'baby-log', 'records': recs}, open(p, 'w')); return p, len(recs)

def shot(page, name, full=False):
    page.wait_for_timeout(350); page.screenshot(path=f'{OUT}/{name}.png', full_page=full)

def hook(page, tag):
    page.on('console', lambda m: m.type == 'error' and errors.append(f'[{tag}] {m.text}'))
    page.on('pageerror', lambda e: errors.append(f'[{tag}] {e}'))

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, locale='th-TH', timezone_id='Asia/Bangkok')
    page = ctx.new_page(); hook(page, 'A')
    page.goto(BASE + '/'); page.wait_for_selector('form[data-form="onboard"]'); shot(page, '01-onboard')
    page.fill('input[name=babyName]', 'น้องข้าวหอม'); page.fill('input[name=birthDate]', '2026-11-03')
    page.fill('input[name=birthWeightKg]', '3.35'); page.fill('input[name=gestationWeeks]', '39')
    page.click('button[type=submit]'); page.wait_for_selector('.quick'); shot(page, '02-home-empty')

    # นำเข้าข้อมูลตัวอย่าง
    path, cnt = seed()
    page.goto(BASE + '/#/settings'); page.wait_for_selector('input[data-act=import]', state='attached')
    page.set_input_files('input[data-act=import]', path); page.wait_for_timeout(500)
    assert f'นำเข้า {cnt}' in page.inner_text('#toast'), page.inner_text('#toast')

    # บันทึกอึ: ลองสีซีดก่อน แล้วเปลี่ยนเป็นเหลือง
    page.goto(BASE + '/#/log/poop'); page.wait_for_selector('.swatch')
    page.click('[data-act=pick-color][data-v=s02]'); shot(page, '03-poop-pale', full=True)
    assert 'พบแพทย์ภายใน 24 ชม.' in page.inner_text('.result')
    page.click('[data-act=pick-color][data-v=s06]'); shot(page, '04-poop-normal', full=True)
    page.click('[data-act=save]'); page.wait_for_selector('.quick')

    # ฉี่
    page.goto(BASE + '/#/log/pee'); page.wait_for_selector('.swatch'); shot(page, '05-pee')
    page.click('[data-act=save]'); page.wait_for_selector('.quick')

    # นม: จับเวลาข้างซ้าย
    page.goto(BASE + '/#/log/feed'); page.wait_for_selector('.timer')
    page.click('[data-act=timer][data-v=L]'); page.wait_for_timeout(2200); shot(page, '06-feed-timer')
    assert page.inner_text('[data-tick=side-L]') in ('0:01', '0:02', '0:03'), page.inner_text('[data-tick=side-L]')
    page.goto(BASE + '/#/'); page.wait_for_selector('.banner'); shot(page, '07-home-feeding')
    page.goto(BASE + '/#/log/feed'); page.wait_for_selector('.timer'); page.click('[data-act=save]'); page.wait_for_selector('.quick')
    # นมขวด
    page.goto(BASE + '/#/log/feed'); page.click('[data-act=pick-method][data-v=formula]'); page.click('[data-act=amt-set][data-v="60"]'); shot(page, '08-feed-bottle')
    page.click('[data-act=save]'); page.wait_for_selector('.quick')
    # น้ำหนัก
    page.goto(BASE + '/#/log/weight'); page.fill('input[data-bind=amount]', '3.2'); page.wait_for_timeout(900); shot(page, '09-weight')
    page.click('[data-act=save]'); page.wait_for_selector('.quick')
    shot(page, '10-home', full=True)

    page.goto(BASE + '/#/dash'); page.wait_for_selector('.chart'); shot(page, '11-dash', full=True)
    page.goto(BASE + '/#/history'); page.wait_for_selector('.row'); shot(page, '12-history', full=True)

    # แก้ไขและลบ (พร้อมเลิกทำ)
    page.click('.row >> nth=0'); page.wait_for_selector('[data-act=delete]'); shot(page, '13-edit')
    page.click('[data-act=delete]'); page.wait_for_selector('text=แตะอีกครั้งเพื่อยืนยันลบ'); page.click('[data-act=delete]')
    page.wait_for_selector('#toast.show >> text=ลบแล้ว')

    # ซิงก์
    page.goto(BASE + '/#/settings'); page.fill('input[name=url]', BASE + '/api'); page.fill('input[name=key]', KEY)
    page.click('form[data-form=sync] button[type=submit]'); page.wait_for_timeout(2500); shot(page, '14-settings', full=True)
    rows = json.loads(urllib.request.urlopen(BASE + '/__sheet').read())
    print('rows in sheet:', len(rows) - 1)
    assert len(rows) - 1 >= cnt + 5

    # เครื่องที่สอง: ดึงข้อมูลลง
    ctx2 = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, timezone_id='Asia/Bangkok')
    p2 = ctx2.new_page(); hook(p2, 'B')
    p2.goto(BASE + '/#/settings'); p2.wait_for_selector('input[name=url]')
    p2.fill('input[name=url]', BASE + '/api'); p2.fill('input[name=key]', KEY)
    p2.click('form[data-form=sync] button[type=submit]'); p2.wait_for_timeout(2500)
    p2.goto(BASE + '/#/'); p2.wait_for_selector('.quick')
    name2 = p2.inner_text('h1'); print('device B name:', name2)
    assert 'ข้าวหอม' in name2
    # B บันทึกฉี่ → A เห็นหลังซิงก์
    p2.goto(BASE + '/#/log/pee'); p2.click('[data-act=save]'); p2.wait_for_timeout(2500)
    page.goto(BASE + '/#/'); page.click('.home-head .chip'); page.wait_for_timeout(1500)
    print('A recent first row:', page.inner_text('.list .row >> nth=0').replace('\n', ' '))

    # ออฟไลน์: เปิดแอปใหม่ได้จากแคช
    page.wait_for_timeout(1000)
    ctx.set_offline(True); page.reload(); page.wait_for_selector('.quick', timeout=8000); shot(page, '15-offline')
    page.goto(BASE + '/#/log/pee'); page.click('[data-act=save]'); page.wait_for_selector('.quick')
    chip = page.inner_text('.home-head .chip'); print('offline chip:', chip)
    ctx.set_offline(False); page.evaluate('window.dispatchEvent(new Event("online"))'); page.wait_for_timeout(2500)
    print('online chip:', page.inner_text('.home-head .chip'))

    # โหมดมืด
    ctx3 = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, color_scheme='dark', timezone_id='Asia/Bangkok')
    p3 = ctx3.new_page(); hook(p3, 'C')
    p3.goto(BASE + '/#/settings'); p3.fill('input[name=url]', BASE + '/api'); p3.fill('input[name=key]', KEY)
    p3.click('form[data-form=sync] button[type=submit]'); p3.wait_for_timeout(2500)
    p3.goto(BASE + '/#/'); p3.wait_for_selector('.quick'); shot(p3, '16-dark-home')
    p3.goto(BASE + '/#/log/poop'); p3.wait_for_selector('.swatch'); shot(p3, '17-dark-poop')
    b.close()

print('ERRORS:', errors if errors else 'none')
