#!/usr/bin/env bash
# รันทดสอบทั้งหมด: unit + e2e ทุก phase + เสิร์ฟใต้ /baby-log/ (แบบ GitHub Pages)
set -u
cd "$(dirname "$0")/.."
export TZ=Asia/Bangkok
fail=0
echo "== unit"; node --test tests/*.test.js 2>&1 | grep -E "^# (pass|fail)" || fail=1
node --test tests/*.test.js >/dev/null 2>&1 || fail=1
[ -f /tmp/phone-photo.jpg ] || python3 -c "from PIL import Image; Image.open('img/stool-06-mustard.jpg').resize((4000,3000)).save('/tmp/phone-photo.jpg', quality=92)"
run() { # $1 test, $2 port, $3 base path
  pkill -f "dev-server.js $2" 2>/dev/null; sleep 0.3
  BASE_PATH="$3" AI_MODE="" node tests/dev-server.js "$2" >/tmp/dev-$2.log 2>&1 &
  sleep 1
  out=$(timeout 200 python3 "tests/$1.py" "http://localhost:$2$3" 2>&1)
  if echo "$out" | grep -q "ERRORS: none"; then echo "✓ $1 ${3:-/}"; else echo "✗ $1 ${3:-/}"; echo "$out" | tail -5; fail=1; fi
  pkill -f "dev-server.js $2" 2>/dev/null
}
for t in e2e e2e_photos e2e_health e2e_report e2e_ai; do run "$t" 8765 ""; done
run e2e 8766 /baby-log
run e2e_photos 8766 /baby-log
[ $fail = 0 ] && echo "ALL PASSED" || { echo "SOME FAILED"; exit 1; }
