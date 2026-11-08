#!/bin/bash
DB=/opt/hopzz-api/data/hopzz.db
echo "=== 已创建的购买入口里 purchase_url 长什么样 ==="
python3 - <<'PY'
import sqlite3, os
db = '/opt/hopzz-api/data/hopzz.db'
c = sqlite3.connect(db)
c.row_factory = sqlite3.Row
try:
    rows = c.execute("SELECT * FROM sponsor_purchase ORDER BY rowid DESC LIMIT 3").fetchall()
except Exception as e:
    print('  查询失败:', e); rows = []
for r in rows:
    d = dict(r)
    print("  status=", d.get('status'), "| url=", (d.get('purchase_url') or '')[:120])
PY

echo
echo "=== 直接用数据库里的 URL 请求二维码接口 ==="
URL=$(python3 - <<'PY'
import sqlite3
c = sqlite3.connect('/opt/hopzz-api/data/hopzz.db')
row = c.execute("SELECT purchase_url FROM sponsor_purchase WHERE purchase_url IS NOT NULL AND purchase_url<>'' ORDER BY rowid DESC LIMIT 1").fetchone()
print(row[0] if row else '')
PY
)
echo "  URL: ${URL:0:120}"
if [ -n "$URL" ]; then
  ENC=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1], safe=''))" "$URL")
  code=$(curl -s -o /tmp/q1.png -w '%{http_code}' "http://127.0.0.1:8000/api/sponsor/qr?data=$ENC")
  echo "  HTTP $code  大小 $(stat -c %s /tmp/q1.png 2>/dev/null || echo 0)"
  head -c 200 /tmp/q1.png | strings | head -3
fi

echo
echo "=== https 测试 ==="
code2=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:8000/api/sponsor/qr?data=https%3A%2F%2Fexample.com%2Fpay")
echo "  https 示例: $code2"
echo
echo "=== http 测试 ==="
code3=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:8000/api/sponsor/qr?data=http%3A%2F%2Fexample.com%2Fpay")
echo "  http 示例: $code3"
