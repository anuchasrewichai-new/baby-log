"""ทดสอบ Phase 5 (AI) กับ AI จำลอง: python3 tests/e2e_ai.py [base_url]"""
import json, sys, os, urllib.request
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765'
OUT = '/tmp/shots5'; os.makedirs(OUT, exist_ok=True)
KEY = urllib.request.urlopen(BASE + '/__key').read().decode()
mode = lambda m: urllib.request.urlopen(BASE + '/__aimode?m=' + m).read()
calls = lambda: json.loads(urllib.request.urlopen(BASE + '/__aicalls').read())
rows = lambda: json.loads(urllib.request.urlopen(BASE + '/__sheet').read())
errors = []
mode('normal')

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, timezone_id='Asia/Bangkok')
    page = ctx.new_page()
    page.on('console', lambda m: m.type == 'error' and errors.append(m.text)); page.on('pageerror', lambda e: errors.append(str(e)))
    shot = lambda n, full=False: (page.wait_for_timeout(350), page.screenshot(path=f'{OUT}/{n}.png', full_page=full))
    page.goto(BASE + '/'); page.wait_for_selector('form[data-form="onboard"]')
    page.fill('input[name=babyName]', 'น้องลับเฉพาะ'); page.fill('input[name=birthDate]', '2026-11-03'); page.fill('input[name=birthWeightKg]', '3.35')
    page.click('button[type=submit]'); page.wait_for_selector('.quick-3')
    page.goto(BASE + '/#/settings'); page.wait_for_timeout(700); page.set_input_files('input[data-act=import]', '/tmp/seed4.json'); page.wait_for_timeout(500)
    page.fill('input[name=url]', BASE + '/api'); page.fill('input[name=key]', KEY); page.click('form[data-form=sync] button[type=submit]'); page.wait_for_timeout(3000)

    # เปิด AI → ต้องขอความยินยอมก่อน
    page.click('input[data-act=ai-toggle]'); page.wait_for_selector('.consent')
    page.locator('#ai').scroll_into_view_if_needed(); shot('01-consent')
    page.click('[data-act=ai-consent]'); page.wait_for_selector('#ai >> text=ใช้วันนี้', timeout=8000)
    print('ai status:', page.inner_text('#ai').replace('\n', ' | ')[:160])

    # อ่านสีจากรูป (ปกติ)
    page.goto(BASE + '/#/log/poop'); page.set_input_files('.photo-btn input[data-act=photo-input]', '/tmp/phone-photo.jpg'); page.wait_for_selector('[data-act=ai-photo]')
    page.click('[data-act=ai-photo]'); page.wait_for_selector('.ai-card .ai-bars')
    print('ai photo:', page.inner_text('.ai-card .ai-title')); assert '84%' in page.inner_text('.ai-card .ai-title')
    page.click('[data-act=ai-use][data-v=s06]'); page.wait_for_timeout(300)
    page.locator('.ai-card').scroll_into_view_if_needed(); shot('02-ai-photo-ok')
    page.click('[data-act=save]'); page.wait_for_selector('.quick-3')

    # กติกาสีซีด 15%: AI บอกเหลือง 78% แต่ซีดรวม 18% → แอปเตือนระดับ 3 แม้เลือกสีเหลือง
    mode('pale')
    page.goto(BASE + '/#/log/poop'); page.set_input_files('.photo-btn input[data-act=photo-input]', '/tmp/phone-photo.jpg'); page.wait_for_selector('[data-act=ai-photo]')
    page.click('[data-act=ai-photo]'); page.wait_for_selector('.ai-card.lv-3')
    page.click('[data-act=ai-use][data-v=s06]'); page.wait_for_timeout(300)
    res = page.inner_text('.result'); print('result with yellow chosen:', res.replace('\n', ' ')[:140]); assert 'AI พบโอกาสเป็นสีซีด 18%' in res
    page.locator('.ai-card').scroll_into_view_if_needed(); shot('03-ai-photo-pale')
    page.click('[data-act=save]'); page.wait_for_selector('.quick-3'); page.wait_for_timeout(3000)
    shot('04-home-after-pale')
    assert 'พบแพทย์โดยเร็ว' in page.inner_text('.status')
    r = [x for x in rows()[1:] if len(x) > 22 and x[22] not in ('', None)]; print('synced aiPale rows:', [(x[6], x[22]) for x in r]); assert any(abs(float(x[22]) - 0.18) < 0.001 for x in r)

    # รูปไม่ชัด
    mode('poor')
    page.goto(BASE + '/#/log/pee'); page.set_input_files('.photo-btn input[data-act=photo-input]', '/tmp/phone-photo.jpg'); page.wait_for_selector('[data-act=ai-photo]')
    page.click('[data-act=ai-photo]'); page.wait_for_selector('.ai-card .ai-title'); print('poor:', page.inner_text('.ai-card .ai-title')); assert 'ถ่ายใหม่' in page.inner_text('.ai-card .ai-title')
    mode('normal')

    # สรุปแนวโน้ม (โหลดเองวันละครั้ง)
    page.goto(BASE + '/#/dash'); page.wait_for_selector('#ai-trend .ai-text', timeout=8000); shot('05-dash-trend')
    n1 = len(calls()); page.goto(BASE + '/#/'); page.goto(BASE + '/#/dash'); page.wait_for_timeout(800); assert len(calls()) == n1, 'ไม่เรียกซ้ำในวันเดียวกัน'

    # รายงาน
    page.goto(BASE + '/#/report'); page.click('[data-act=ai-report]'); page.wait_for_timeout(2500); print('toolbar:', page.inner_text('.rp-toolbar').replace('\n',' | ')); page.wait_for_selector('.rp-ai')
    page.click('[data-act=ai-report-questions]'); page.wait_for_timeout(300)
    assert 'เจาะ' in page.input_value('textarea[data-bind-notes]') or 'ตรวจเลือด' in page.input_value('textarea[data-bind-notes]')
    page.locator('.rp-ai').scroll_into_view_if_needed(); shot('06-report-ai')

    # ถาม-ตอบ
    page.goto(BASE + '/#/ask'); page.wait_for_selector('.askbar'); shot('07-ask-empty')
    page.click('[data-act=ask-chip] >> nth=0'); page.wait_for_selector('.bubble.ai >> text=นมแม่พบได้บ่อย'); page.wait_for_timeout(300)
    n2 = len(calls())
    page.fill('.askbar input', 'ลูกหายใจเร็ว ปากเขียวนิดหน่อย ต้องทำยังไง'); page.click('.askbar button'); page.wait_for_selector('.bubble.urgent')
    assert len(calls()) == n2, 'คำถามอันตรายต้องไม่เรียก AI'
    page.fill('.askbar input', 'ลูกมีไข้ 38.3 องศา'); page.click('.askbar button'); page.wait_for_timeout(400)
    page.wait_for_timeout(800); print('bubbles:', [t.replace(chr(10),' ')[:50] for t in page.locator('.bubble').all_inner_texts()])
    assert page.locator('.bubble.urgent').count() == 2
    shot('08-ask-chat', True)

    # ความเป็นส่วนตัว: ไม่มีชื่อลูกในคำขอ AI ใด ๆ
    allc = calls(); print('ai calls:', len(allc), 'with image:', sum(c['hasImage'] for c in allc))
    assert not any('ลับเฉพาะ' in c['text'] for c in allc)
    b.close()
print('ERRORS:', errors or 'none')
