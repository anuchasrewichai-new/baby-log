/**
 * แอปบันทึกลูกน้อย — AI ช่วยประเมิน (Phase 5)
 * --------------------------------------------------------------
 * ตั้งค่า: Apps Script → ⚙️ การตั้งค่าโปรเจ็กต์ → คุณสมบัติของสคริปต์ (Script Properties)
 *   GEMINI_API_KEY      = คีย์จาก https://aistudio.google.com/apikey   (แนะนำ มีโควตาฟรี)
 *   ANTHROPIC_API_KEY   = (ทางเลือก) คีย์ Claude API ถ้าต้องการใช้ Claude แทน
 *   AI_PROVIDER         = gemini | claude      (ไม่ใส่ = gemini ถ้ามีคีย์)
 *   AI_DAILY_LIMIT      = จำนวนครั้งต่อวัน (ไม่ใส่ = 30)
 *   AI_MODEL            = (ทางเลือก) ชื่อโมเดลที่ต้องการบังคับใช้
 *
 * กติกาความปลอดภัย (บังคับในโค้ด ไม่ขึ้นกับ AI):
 *   1) AI ไม่เคยลดระดับคำเตือนของเกณฑ์ในแอป — แอปแสดงระดับที่รุนแรงกว่าเสมอ
 *   2) ถ้า AI ให้โอกาสกลุ่มสีซีด (ภาพ 1–3) รวม ≥ 15% → เตือนพบแพทย์ แม้ AI ไม่แน่ใจ
 *   3) แสงไม่พอ/ไม่ใช่ผ้าอ้อม/ความมั่นใจ < 60% → บอกให้ถ่ายใหม่ ไม่เดา
 *   4) AI แค่เสนอสี ผู้ใช้เป็นคนเลือกเอง
 *   5) ห้ามวินิจฉัยโรคหรือแนะนำยา · ทุกคำตอบมีคำเตือนว่าไม่ใช่การวินิจฉัย
 *   6) คำถามที่เข้าข่ายอาการอันตราย → ตอบให้ไปโรงพยาบาลทันทีเท่านั้น โดยไม่เรียก AI
 *   ไม่ส่งชื่อลูกไปยังผู้ให้บริการ AI
 */

var AI_DEFAULT_LIMIT = 30;
// เรียงตามความเสถียร (ทดสอบ 11 พ.ย. 2569: รุ่นใหม่สุดมักถูกใช้หนาแน่น ตอบ 503 หรือค้างหลายนาที)
var GEMINI_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-flash-latest'];
var MODEL_COOLDOWN_MS = 60 * 60 * 1000;
var CLAUDE_MODELS = ['claude-haiku-5-5', 'claude-sonnet-5-5'];
var STOOL_IDS = ['s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08', 's09', 's10', 's11'];
var URINE_IDS = ['u1', 'u2', 'u3', 'u4', 'u5'];
var PALE_IDS = ['s01', 's02', 's03'];
var PALE_ALERT = 0.15;
var MIN_CONFIDENCE = 0.6;
var AI_DISCLAIMER = 'AI ช่วยคัดกรองเท่านั้น ไม่ใช่การวินิจฉัยทางการแพทย์';
var DANGER_WORDS = ['ชัก', 'หายใจลำบาก', 'หายใจเร็ว', 'หอบ', 'ตัวเขียว', 'ปากเขียว', 'ริมฝีปากเขียว', 'ปลุกไม่ตื่น', 'ปลุกยาก', 'ซึมมาก',
  'ไม่ดูดนม', 'ไม่ยอมกินนม', 'อาเจียนพุ่ง', 'อาเจียนสีเขียว', 'อ้วกสีเขียว', 'กระหม่อมบุ๋ม', 'ไม่หายใจ', 'หยุดหายใจ', 'ตัวอ่อนปวกเปียก', 'ตกจาก', 'หัวฟาด'];
var DANGER_ANSWER = 'อาการนี้อาจเป็นภาวะฉุกเฉิน — พาลูกไปโรงพยาบาลทันที หรือโทร 1669 ไม่ต้องรอดูอาการ';

var STOOL_DESC = {
  s01: 'ขาว/เทา ซีดเหมือนชอล์ก', s02: 'สีดินเหนียว/ครีมซีด เนื้อด้าน', s03: 'เหลืองซีดมาก เกือบขาว',
  s04: 'ขี้เทา ดำอมเขียว เหนียวมันเงา', s05: 'ช่วงเปลี่ยนผ่าน เขียวเข้มปนน้ำตาล', s06: 'เหลืองมัสตาร์ด มีเม็ดเล็ก ๆ',
  s07: 'เขียว', s08: 'น้ำตาล/แทน ข้นคล้ายเนยถั่ว', s09: 'ส้ม', s10: 'มีเลือดปน/แดง', s11: 'ดำด้าน (ไม่ใช่ขี้เทา)'
};
var URINE_DESC = { u1: 'ใส/เหลืองอ่อนมาก', u2: 'เหลือง', u3: 'เหลืองเข้ม', u4: 'ผลึก/ผงสีส้มอิฐหรือส้มชมพู', u5: 'แดง/ชมพู' };

/* ======================= ตั้งค่าและโควตา ======================= */

function aiConfig_() {
  var p = PropertiesService.getScriptProperties();
  var gem = p.getProperty('GEMINI_API_KEY') || '', cla = p.getProperty('ANTHROPIC_API_KEY') || '';
  var provider = (p.getProperty('AI_PROVIDER') || '').toLowerCase();
  if (provider !== 'gemini' && provider !== 'claude') provider = gem ? 'gemini' : cla ? 'claude' : 'gemini';
  var key = provider === 'claude' ? cla : gem;
  return {
    provider: provider, key: key, model: p.getProperty('AI_MODEL') || '',
    limit: Number(p.getProperty('AI_DAILY_LIMIT')) || AI_DEFAULT_LIMIT
  };
}

function aiUsage_(consume) {
  var p = PropertiesService.getScriptProperties();
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var u = {};
  try { u = JSON.parse(p.getProperty('AI_USAGE') || '{}'); } catch (e) { u = {}; }
  if (u.date !== today) u = { date: today, n: 0 };
  if (consume) { u.n++; p.setProperty('AI_USAGE', JSON.stringify(u)); }
  return u.n;
}

function aiStatus_() {
  var c = aiConfig_();
  return { ok: true, enabled: !!c.key, provider: c.provider, usedToday: aiUsage_(false), limit: c.limit };
}

function aiGuard_() {
  var c = aiConfig_();
  if (!c.key) return { error: 'ai_not_configured' };
  if (aiUsage_(false) >= c.limit) return { error: 'ai_quota', limit: c.limit };
  return { config: c };
}

/* ======================= เรียกผู้ให้บริการ ======================= */

/** เรียก AI แล้วคืน object JSON ตาม schema · parts: [{text}] หรือ [{image:{mime,data}}] */
function aiCall_(config, system, parts, schema) {
  var res = config.provider === 'claude' ? callClaude_(config, system, parts, schema) : callGemini_(config, system, parts, schema);
  aiUsage_(true);
  return res;
}

/** รายชื่อรุ่น Gemini ที่คีย์นี้ใช้ได้จริง (ถามจาก API) เรียงจากใหม่ไปเก่า · รุ่น flash ปกติก่อน lite */
function geminiModels_(key) {
  try {
    var r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
      muteHttpExceptions: true, headers: { 'x-goog-api-key': key } });
    if (r.getResponseCode() !== 200) return [];
    var list = (JSON.parse(r.getContentText()).models || []).filter(function (m) {
      var n = String(m.name || '');
      return (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0 &&
        /gemini-[\d.]+-flash/.test(n) && !/image|tts|audio|live|embed|thinking|exp/.test(n);
    }).map(function (m) { return String(m.name).replace(/^models\//, ''); });
    function score(n) {
      var v = Number((n.match(/gemini-([\d.]+)/) || [0, 0])[1]) || 0;
      return v * 100 - (/lite/.test(n) ? 10 : 0) - (/preview/.test(n) ? 5 : 0) - (/-\d{3,}$/.test(n) ? 1 : 0);
    }
    return list.sort(function (a, b) { return score(b) - score(a); }).slice(0, 4);
  } catch (e) { return []; }
}

/** รุ่นที่เพิ่งตอบ 5xx (ไม่ว่าง) จะถูกข้ามชั่วคราว 1 ชม. */
function modelCooling_(p, m) { return Number(p.getProperty('AI_COOL_' + m) || 0) > Date.now(); }
function coolModel_(p, m) { p.setProperty('AI_COOL_' + m, String(Date.now() + MODEL_COOLDOWN_MS)); }

function geminiOrder_(config, p) {
  if (config.model) return [config.model];
  var ok = p.getProperty('AI_MODEL_OK');
  var list = uniq_([ok].concat(GEMINI_MODELS));
  if (!ok) {
    // ยังไม่เคยสำเร็จ: เช็กกับรายชื่อรุ่นจริงของคีย์นี้ ตัดรุ่นที่ไม่มี และเพิ่มรุ่นอื่นต่อท้าย
    var avail = geminiModels_(config.key);
    if (avail.length) list = list.filter(function (m) { return avail.indexOf(m) >= 0 || m === 'gemini-flash-latest'; }).concat(avail);
    list = uniq_(list);
  }
  var fresh = list.filter(function (m) { return !modelCooling_(p, m); });
  return fresh.length ? fresh : list;
}

function callGemini_(config, system, parts, schema) {
  var p = PropertiesService.getScriptProperties();
  var models = geminiOrder_(config, p);
  var body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: parts.map(function (x) {
      return x.image ? { inline_data: { mime_type: x.image.mime, data: x.image.data } } : { text: x.text };
    }) }],
    // จำกัดความยาวคำตอบ กัน AI วนซ้ำจนคำขอค้าง
    generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema, maxOutputTokens: 4096 }
  };
  var lastErr = '';
  for (var i = 0; i < models.length && i < 3; i++) {
    var m = models[i];
    var r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(m) + ':generateContent', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-goog-api-key': config.key }, payload: JSON.stringify(body)
    });
    var code = r.getResponseCode(), txt = r.getContentText();
    if (code === 404 || (code === 400 && /not found|is not supported|unknown model|not available/i.test(txt))) {
      lastErr = 'model ' + m + ' unavailable';
      if (m === p.getProperty('AI_MODEL_OK')) p.deleteProperty('AI_MODEL_OK');
      continue;
    }
    if (code >= 500) {
      // รุ่นนี้ไม่ว่าง → พักไว้ แล้วลองรุ่นถัดไป
      lastErr = m + ' ' + code + ': ' + errText_(txt);
      coolModel_(p, m);
      if (m === p.getProperty('AI_MODEL_OK')) p.deleteProperty('AI_MODEL_OK');
      continue;
    }
    if (code === 429) throw new Error('ai_rate_limited');
    if (code === 401 || code === 403 || (code === 400 && /API key/i.test(txt))) throw new Error('ai_bad_key');
    if (code >= 300) throw new Error('ai_http_' + code + ' ' + m + ': ' + errText_(txt));
    var data = JSON.parse(txt);
    var cand = data.candidates && data.candidates[0];
    if (!cand || !cand.content || !cand.content.parts) throw new Error('ai_blocked');
    var out = cand.content.parts.filter(function (pt) { return pt.text && !pt.thought; }).map(function (pt) { return pt.text; }).join('');
    p.setProperty('AI_MODEL_OK', m);
    return { json: parseJson_(out), model: m };
  }
  throw new Error(/ 5\d\d: /.test(lastErr) ? 'ai_busy' : 'ai_no_model: ' + lastErr);
}

function errText_(txt) {
  try { return String(JSON.parse(txt).error.message).slice(0, 120); } catch (e) { return String(txt).slice(0, 120); }
}

function callClaude_(config, system, parts, schema) {
  var models = config.model ? [config.model] : CLAUDE_MODELS;
  var content = parts.map(function (x) {
    return x.image ? { type: 'image', source: { type: 'base64', media_type: x.image.mime, data: x.image.data } } : { type: 'text', text: x.text };
  });
  content.push({ type: 'text', text: 'ตอบเป็น JSON อย่างเดียว ไม่มีข้อความอื่น ตาม JSON Schema นี้:\n' + JSON.stringify(schema) });
  for (var i = 0; i < models.length; i++) {
    var r = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-api-key': config.key, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({ model: models[i], max_tokens: 1200, system: system, messages: [{ role: 'user', content: content }] })
    });
    var code = r.getResponseCode(), txt = r.getContentText();
    if (code === 404) continue;
    if (code === 429) throw new Error('ai_rate_limited');
    if (code === 401 || code === 403) throw new Error('ai_bad_key');
    if (code >= 300) throw new Error('ai_http_' + code);
    var data = JSON.parse(txt);
    var out = (data.content || []).filter(function (c) { return c.type === 'text'; }).map(function (c) { return c.text; }).join('');
    return { json: parseJson_(out), model: models[i] };
  }
  throw new Error('ai_no_model');
}

function parseJson_(s) {
  s = String(s || '').trim();
  try { return JSON.parse(s); } catch (e) { /* ลองตัดส่วนเกิน */ }
  var a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(s.slice(a, b + 1));
  throw new Error('ai_bad_json');
}

function uniq_(xs) { var o = []; xs.forEach(function (x) { if (x && o.indexOf(x) < 0) o.push(x); }); return o; }

function aiError_(e) {
  var m = String(e && e.message || e);
  var map = {
    ai_rate_limited: 'AI ถูกเรียกถี่เกินไป ลองใหม่ในอีกสักครู่',
    ai_bad_key: 'API key ไม่ถูกต้อง ตรวจ GEMINI_API_KEY ใน Script Properties',
    ai_blocked: 'AI ไม่ตอบคำขอนี้ ลองถ่ายรูปใหม่หรือถามใหม่',
    ai_bad_json: 'AI ตอบผิดรูปแบบ ลองใหม่อีกครั้ง',
    ai_busy: 'บริการ AI ไม่ว่างชั่วคราว ลองใหม่ในอีกสักครู่'
  };
  for (var k in map) if (m.indexOf(k) === 0) return { ok: false, error: k, message: map[k] };
  return { ok: false, error: 'ai_failed', message: 'เรียก AI ไม่สำเร็จ (' + m.slice(0, 160) + ')' };
}

/* ======================= อ่านสีจากรูป ======================= */

function aiPhoto_(req) {
  var g = aiGuard_();
  if (g.error) return { ok: false, error: g.error, limit: g.limit };
  var kind = req.kind === 'pee' ? 'pee' : 'poop';
  var ids = kind === 'pee' ? URINE_IDS : STOOL_IDS;
  var desc = kind === 'pee' ? URINE_DESC : STOOL_DESC;
  var b64 = String(req.data || '').replace(/^data:[^,]+,/, '');
  if (!b64 || b64.length > 2000000) return { ok: false, error: 'photo_too_large' };
  var schema = {
    type: 'object',
    properties: {
      is_diaper: { type: 'boolean', description: 'รูปนี้เป็นผ้าอ้อมที่มีอุจจาระ/ปัสสาวะของทารกหรือไม่' },
      image_quality: { type: 'string', enum: ['good', 'fair', 'poor'], description: 'แสงและความคมพอให้ดูสีได้หรือไม่' },
      quality_issue: { type: 'string', description: 'ปัญหาของรูป ภาษาไทยสั้น ๆ หรือว่าง' },
      scores: { type: 'array', description: 'ความน่าจะเป็นของทุกตัวเลือก รวมกันประมาณ 1', items: { type: 'object', properties: { id: { type: 'string', enum: ids }, p: { type: 'number' } }, required: ['id', 'p'] } },
      consistency: { type: 'string', enum: ['soft', 'thick', 'watery', 'mucus', 'hard', 'unknown'] },
      reason_th: { type: 'string', description: 'เหตุผลสั้น ๆ ภาษาไทย ไม่เกิน 2 ประโยค ไม่วินิจฉัยโรค' }
    },
    required: ['is_diaper', 'image_quality', 'scores', 'consistency', 'reason_th']
  };
  var options = ids.map(function (id) { return id + ' = ' + desc[id]; }).join('\n');
  var system = 'คุณช่วยผู้ปกครองเทียบสี' + (kind === 'pee' ? 'คราบปัสสาวะ' : 'อุจจาระ') + 'ของทารกในผ้าอ้อมกับบัตรเทียบสี ' +
    'ให้คะแนนความน่าจะเป็นของทุกตัวเลือกอย่างระมัดระวัง ถ้าแสงสีเหลือง/มืด/เบลอ ให้ลด image_quality ' +
    'ห้ามวินิจฉัยโรค ห้ามแนะนำยา ' + (kind === 'poop' ? 'ถ้าสีอาจเป็นกลุ่มซีด (s01–s03) แม้เพียงเล็กน้อย ให้ใส่คะแนนกลุ่มนั้นตามจริง ห้ามกดให้ต่ำ ' : '') +
    'ตอบเป็น JSON ตาม schema';
  var prompt = 'ตัวเลือก:\n' + options + (req.dol ? '\nอายุทารก: วันที่ ' + Number(req.dol) + ' ของชีวิต' : '');
  try {
    var r = aiCall_(g.config, system, [{ text: prompt }, { image: { mime: req.mime === 'image/png' ? 'image/png' : 'image/jpeg', data: b64 } }], schema);
    return interpretPhoto_(r.json, kind, r.model);
  } catch (e) { return aiError_(e); }
}

/** ตีความผล AI ตามกติกาความปลอดภัย (แยกเป็นฟังก์ชันเพื่อทดสอบ) */
function interpretPhoto_(j, kind, model) {
  var ids = kind === 'pee' ? URINE_IDS : STOOL_IDS;
  var seen = {}, scores = [];
  (Array.isArray(j.scores) ? j.scores : []).forEach(function (s) {
    var id = String(s && s.id), p = Number(s && s.p);
    if (ids.indexOf(id) < 0 || seen[id] || !isFinite(p)) return;
    seen[id] = true; scores.push({ id: id, p: Math.max(0, Math.min(1, p)) });
  });
  var sum = scores.reduce(function (a, s) { return a + s.p; }, 0);
  if (sum > 0) scores.forEach(function (s) { s.p = Math.round((s.p / sum) * 1000) / 1000; });
  scores.sort(function (a, b) { return b.p - a.p; });
  var pale = kind === 'poop' ? scores.filter(function (s) { return PALE_IDS.indexOf(s.id) >= 0; }).reduce(function (a, s) { return a + s.p; }, 0) : 0;
  pale = Math.round(pale * 1000) / 1000;
  var top = scores[0] || null;
  var quality = ['good', 'fair', 'poor'].indexOf(j.image_quality) >= 0 ? j.image_quality : 'poor';
  var verdict, message;
  if (pale >= PALE_ALERT) {
    verdict = 'pale_alert';
    message = 'มีโอกาสเป็นสีซีด ' + Math.round(pale * 100) + '% — ควรพบแพทย์ภายใน 24 ชม. และนำรูปไปให้แพทย์ดู' + (quality === 'poor' || j.is_diaper === false ? ' (รูปไม่ชัด ถ่ายใหม่ในแสงธรรมชาติเพื่อยืนยันด้วย)' : '');
  } else if (j.is_diaper === false) {
    verdict = 'retake'; message = 'AI ไม่แน่ใจว่าเป็นรูปผ้าอ้อม ลองถ่ายใหม่ให้เห็นชัด ๆ';
  } else if (quality === 'poor') {
    verdict = 'retake'; message = 'แสงหรือความคมไม่พอ ' + (j.quality_issue ? '(' + String(j.quality_issue).slice(0, 80) + ') ' : '') + 'ถ่ายใหม่ใกล้หน้าต่างในแสงธรรมชาติ';
  } else if (!top || top.p < MIN_CONFIDENCE) {
    verdict = 'uncertain'; message = 'AI ไม่แน่ใจ (มั่นใจไม่ถึง 60%) ให้เทียบด้วยตาเอง หรือถ่ายใหม่';
  } else {
    verdict = 'ok'; message = 'ใกล้เคียงภาพตัวอย่างมากที่สุด ' + Math.round(top.p * 100) + '%';
  }
  return {
    ok: true, kind: kind, verdict: verdict, message: message, scores: scores.slice(0, 5), top: top,
    paleProb: pale, quality: quality, consistency: j.consistency || 'unknown',
    reason: String(j.reason_th || '').slice(0, 300), model: model, disclaimer: AI_DISCLAIMER
  };
}

/* ======================= ข้อความ: สรุปแนวโน้ม / รายงาน / ถาม-ตอบ ======================= */

var TEXT_SYSTEM = 'คุณเป็นผู้ช่วยอธิบายข้อมูลบันทึกของทารกแรกเกิดให้พ่อแม่ชาวไทยเข้าใจ ใช้ภาษาไทยสุภาพ อ่านง่าย กระชับ ' +
  'กติกา: ห้ามวินิจฉัยโรค ห้ามแนะนำยาหรือขนาดยา ห้ามบอกว่าไม่ต้องไปหาหมอ ' +
  'ห้ามขัดแย้งหรือลดความรุนแรงของคำเตือนที่ระบบให้มา (field level: 0 ปกติ 1 เฝ้าระวัง 2 ควรปรึกษาแพทย์ 3 พบแพทย์โดยเร็ว) ' +
  'ถ้ามีคำเตือนระดับ 2 ขึ้นไปต้องแนะนำให้ปรึกษาแพทย์เสมอ ' +
  'ถ้าข้อมูลหรือคำถามมีอาการอันตราย (ไข้ ≥38 องศาในทารก <3 เดือน ชัก หายใจลำบาก ตัวเขียว ซึม ไม่ดูดนม อาเจียนพุ่ง/สีเขียว อุจจาระสีซีด) ให้แนะนำไปโรงพยาบาลทันที ' +
  'ใช้เฉพาะข้อมูลที่ให้มา ถ้าข้อมูลไม่พอให้บอกตรง ๆ';

function contextLevel_(ctx) {
  var lv = 0;
  try {
    (ctx.days || []).forEach(function (d) { (d.msgs || []).forEach(function (m) { lv = Math.max(lv, Number(m.level) || 0); }); });
    (ctx.alerts || []).forEach(function (m) { lv = Math.max(lv, Number(m.level) || 0); });
  } catch (e) { /* ignore */ }
  return lv;
}

function cleanContext_(ctx) {
  // ตัดข้อมูลที่ระบุตัวตน และจำกัดขนาด
  var c = JSON.parse(JSON.stringify(ctx || {}));
  delete c.babyName; delete c.name;
  var s = JSON.stringify(c);
  if (s.length > 30000) s = s.slice(0, 30000);
  return s;
}

function hasDanger_(text) {
  var t = String(text || '');
  for (var i = 0; i < DANGER_WORDS.length; i++) if (t.indexOf(DANGER_WORDS[i]) >= 0) return true;
  return false;
}

function aiText_(req) {
  var task = req.task;
  if (['trend', 'report', 'ask'].indexOf(task) < 0) return { ok: false, error: 'bad_task' };
  var question = String(req.question || '').slice(0, 500);
  if (task === 'ask' && hasDanger_(question)) {
    return { ok: true, task: task, urgent: true, answer: DANGER_ANSWER, disclaimer: AI_DISCLAIMER, model: 'rule' };
  }
  var g = aiGuard_();
  if (g.error) return { ok: false, error: g.error, limit: g.limit };
  var ctxLevel = contextLevel_(req.context || {});
  var ctx = cleanContext_(req.context);
  var schema, prompt;
  if (task === 'trend') {
    schema = { type: 'object', properties: {
      summary_th: { type: 'string', description: 'สรุปแนวโน้ม 2–4 ประโยค' },
      watch_points: { type: 'array', items: { type: 'string' }, description: 'สิ่งที่ควรสังเกตต่อ 0–3 ข้อ' },
      suggest_doctor: { type: 'boolean' } }, required: ['summary_th', 'watch_points', 'suggest_doctor'] };
    prompt = 'สรุปแนวโน้มจากข้อมูลบันทึกรายวันนี้ (ตัวเลขฉี่/อึ/นม เทียบเกณฑ์ขั้นต่ำ, สีอึ, น้ำหนัก, ไข้, ตัวเหลือง) เน้นการเปลี่ยนแปลงระหว่างวัน:\n' + ctx;
  } else if (task === 'report') {
    schema = { type: 'object', properties: {
      summary_th: { type: 'string', description: 'ย่อหน้าสรุปสำหรับแพทย์ 3–5 ประโยค เป็นข้อเท็จจริงจากข้อมูล' },
      questions_for_doctor: { type: 'array', items: { type: 'string' }, description: 'คำถามที่ผู้ปกครองอาจอยากถามแพทย์ 2–4 ข้อ' },
      suggest_doctor: { type: 'boolean' } }, required: ['summary_th', 'questions_for_doctor', 'suggest_doctor'] };
    prompt = 'เขียนสรุปเหตุการณ์สำคัญจากข้อมูลนี้สำหรับแนบรายงานให้แพทย์อ่าน (ไม่ต้องทักทาย):\n' + ctx;
  } else {
    schema = { type: 'object', properties: {
      answer_th: { type: 'string', description: 'คำตอบ 2–6 ประโยค' },
      urgent: { type: 'boolean', description: 'ควรไปพบแพทย์โดยเร็วหรือไม่' } }, required: ['answer_th', 'urgent'] };
    var hist = (Array.isArray(req.history) ? req.history : []).slice(-6).map(function (h) { return (h.role === 'ai' ? 'ผู้ช่วย: ' : 'ผู้ปกครอง: ') + String(h.text || '').slice(0, 400); }).join('\n');
    prompt = 'ข้อมูลบันทึกล่าสุดของลูก:\n' + ctx + (hist ? '\n\nบทสนทนาก่อนหน้า:\n' + hist : '') + '\n\nคำถามของผู้ปกครอง: ' + question;
  }
  try {
    var r = aiCall_(g.config, TEXT_SYSTEM, [{ text: prompt }], schema);
    var j = r.json || {};
    var out = { ok: true, task: task, model: r.model, disclaimer: AI_DISCLAIMER };
    if (task === 'ask') {
      out.answer = String(j.answer_th || '').slice(0, 1500);
      out.urgent = !!j.urgent;
      out.contextUrgent = ctxLevel >= 3;
    } else {
      out.summary = String(j.summary_th || '').slice(0, 1500);
      out.points = (j.watch_points || j.questions_for_doctor || []).slice(0, 4).map(function (x) { return String(x).slice(0, 200); });
      out.suggestDoctor = !!j.suggest_doctor || ctxLevel >= 2;
    }
    // กติกาที่ 1: ถ้าระบบมีคำเตือนระดับ ≥2 แต่ AI ไม่ได้แนะนำพบแพทย์ → เติมให้
    if (ctxLevel >= 2 && task !== 'ask' && !j.suggest_doctor) out.forcedNote = 'ระบบพบคำเตือนที่ควรปรึกษาแพทย์ในช่วงนี้ (ดูรายการคำเตือนของแอป)';
    out.contextLevel = ctxLevel;
    return out;
  } catch (e) { return aiError_(e); }
}

/* ======================= ตรวจการเชื่อมต่อ AI (กด Run ในหน้าแก้ไข) ======================= */

/** เลือกฟังก์ชัน testAi แล้วกด "เรียกใช้" · ดูผลในบันทึกการดำเนินการ · ไม่แสดงคีย์ */
function testAi() {
  var c = aiConfig_(), p = PropertiesService.getScriptProperties();
  p.deleteProperty('AI_MODEL_OK');
  p.getKeys().forEach(function (k) { if (k.indexOf('AI_COOL_') === 0) p.deleteProperty(k); });
  console.log('provider=' + c.provider + ' hasKey=' + !!c.key + ' model=' + (c.model || '(auto)'));
  if (!c.key) return;
  if (c.provider === 'gemini') console.log('models: ' + geminiOrder_(c, p).join(', '));
  var t = Date.now();
  try {
    var r = aiCall_(c, 'ตอบสั้นๆ', [{ text: 'ทักทาย 1 ประโยค' }], { type: 'object', properties: { answer_th: { type: 'string' } }, required: ['answer_th'] });
    console.log('OK ' + r.model + ' ' + (Date.now() - t) + ' ms: ' + JSON.stringify(r.json).slice(0, 120));
  } catch (e) { console.log('FAIL ' + (Date.now() - t) + ' ms: ' + e.message); }
}
