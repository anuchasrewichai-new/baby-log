"""ทดสอบ Phase 2 (รูปถ่าย): python3 tests/e2e_photos.py [base_url]"""
import json, sys, os, urllib.request
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765'
OUT = '/tmp/shots2'; os.makedirs(OUT, exist_ok=True)
KEY = urllib.request.urlopen(BASE + '/__key').read().decode()
PHOTO = '/tmp/phone-photo.jpg'
errors = []
def J(path): return json.loads(urllib.request.urlopen(BASE + path).read())
def shot(page, name, full=False): page.wait_for_timeout(400); page.screenshot(path=f'{OUT}/{name}.png', full_page=full)
def hook(page, tag):
    page.on('console', lambda m: m.type == 'error' and errors.append(f'[{tag}] {m.text}'))
    page.on('pageerror', lambda e: errors.append(f'[{tag}] {e}'))
def connect(page):
    page.goto(BASE + '/#/settings'); page.wait_for_selector('input[name=url]')
    page.fill('input[name=url]', BASE + '/api'); page.fill('input[name=key]', KEY)
    page.click('form[data-form=sync] button[type=submit]'); page.wait_for_timeout(2500)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, timezone_id='Asia/Bangkok')
    page = ctx.new_page(); hook(page, 'A')
    page.goto(BASE + '/'); page.wait_for_selector('form[data-form="onboard"]')
    page.fill('input[name=babyName]', 'น้องรูป'); page.fill('input[name=birthDate]', '2026-11-03'); page.fill('input[name=birthWeightKg]', '3.3')
    page.click('button[type=submit]'); page.wait_for_selector('.quick')
    connect(page)

    # ถ่ายรูปผ้าอ้อม (ไฟล์ 4000x3000 จากกล้อง)
    page.goto(BASE + '/#/log/poop'); page.wait_for_selector('.photo-btn'); shot(page, '01-poop-nophoto')
    page.set_input_files('.photo-btn input[data-act=photo-input]', PHOTO)
    page.wait_for_selector('.compare img'); toast = page.inner_text('#toast'); print('toast:', toast)
    kb = int(toast.split('(')[1].split(' KB')[0]); assert kb < 300, kb
    shot(page, '02-compare-empty')
    page.click('[data-act=pick-color][data-v=s06]'); shot(page, '03-compare-s06')
    page.mouse.wheel(0, 500); page.wait_for_timeout(300); shot(page, '04-compare-sticky')
    page.click('[data-act=photo-view]'); page.wait_for_selector('.viewer img'); shot(page, '05-viewer')
    page.click('[data-act=viewer-close]')
    page.click('[data-act=save]'); page.wait_for_selector('.quick'); page.wait_for_timeout(3500)
    ph = J('/__photos'); print('drive files after save:', len(ph['files']), ph['files'][:1])
    assert len(ph['files']) == 1 and ph['files'][0]['bytes'] < 300000
    page.goto(BASE + '/#/history'); page.wait_for_selector('.row'); assert 'มีรูป' in page.inner_text('.list')

    # สีซีด + รูป → ต้องติดธงเก็บไว้
    page.goto(BASE + '/#/log/poop'); page.set_input_files('.photo-btn input[data-act=photo-input]', PHOTO); page.wait_for_selector('.compare img')
    page.click('[data-act=pick-color][data-v=s02]'); page.click('[data-act=save]'); page.wait_for_selector('.quick'); page.wait_for_timeout(3500)
    rows = J('/__photos')['rows']; print('photo rows:', [(r[0][:6], r[6]) for r in rows[1:]])
    assert rows[2][6] is True, 'รูปสีซีดต้องถูกติดธงเก็บไว้'

    # ออฟไลน์: ถ่ายรูปแล้วบันทึก → ออนไลน์แล้วอัปโหลดเอง
    ctx.set_offline(True)
    page.goto(BASE + '/#/log/pee'); page.wait_for_selector('.photo-btn'); page.set_input_files('.photo-btn input[data-act=photo-input]', PHOTO); page.wait_for_selector('.compare img')
    page.click('[data-act=save]'); page.wait_for_selector('.quick'); print('offline chip:', page.inner_text('.home-head .chip'))
    ctx.set_offline(False); page.evaluate('window.dispatchEvent(new Event("online"))'); page.wait_for_timeout(4000)
    print('files after online:', len(J('/__photos')['files'])); assert len(J('/__photos')['files']) == 3

    # แก้ไข: ลบรูปออกจากรายการ
    page.goto(BASE + '/#/history'); page.click('.row >> nth=0'); page.wait_for_selector('.compare'); shot(page, '06-edit-with-photo')
    page.click('[data-act=photo-remove]'); page.click('[data-act=save]'); page.wait_for_timeout(3500)
    trashed = [f for f in J('/__photos')['files'] if f['trashed']]; print('trashed after remove:', len(trashed)); assert len(trashed) == 1

    # ตั้งค่า: พื้นที่รูป
    page.goto(BASE + '/#/settings'); page.wait_for_selector('#photos'); page.wait_for_timeout(1500)
    page.locator('#photos').scroll_into_view_if_needed(); shot(page, '07-settings-photos')
    print('photos card:', page.inner_text('#photos').replace('\n', ' | ')[:260])
    page.select_option('select[name=photoRetentionDays]', '7'); page.wait_for_timeout(800)

    # เครื่องที่สอง เปิดดูรูปจาก Drive
    ctx2 = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, timezone_id='Asia/Bangkok')
    p2 = ctx2.new_page(); hook(p2, 'B'); connect(p2)
    p2.goto(BASE + '/#/history'); p2.wait_for_selector('.row')
    p2.click('.row:has-text("มีรูป") >> nth=0'); p2.wait_for_selector('.compare img', timeout=8000); shot(p2, '08-deviceB-photo')
    b.close()
print('ERRORS:', errors or 'none')
