#!/bin/bash
set -uo pipefail
echo "=== studio 健康 ==="
curl -s http://127.0.0.1:8103/api/health; echo

echo
echo "=== 造一个「已发布」项目验证主站作品列表 ==="
D=/srv/files/工作站/p-verify-works
mkdir -p "$D/assets"
cat > "$D/project.json" <<'JSON'
{
  "id": "p-verify-works",
  "name": "验证作品",
  "type": "music",
  "summary": "这是用来验证作品列表的临时项目",
  "tags": ["测试", "电子"],
  "modules": ["meta"],
  "fields": {},
  "sections": [],
  "createdAt": "2026-11-08T00:00:00Z",
  "updatedAt": "2026-11-08T09:00:00Z",
  "share": {"slug": "verify-works", "mode": "view", "enabled": true},
  "publish": {"enabled": true, "at": "2026-11-08T09:00:00Z", "slug": "verify-works"}
}
JSON
chown -R www-data:www-data "$D"
chmod -R a+rX "$D"

echo "  /api/works 返回:"
curl -s http://127.0.0.1:8000/api/works | python3 -m json.tool 2>/dev/null | head -22

echo
echo "=== 公开分享页（view 模式）==="
curl -s -o /dev/null -w "  /ll/verify-works  %{http_code}\n" http://127.0.0.1:8103/ll/verify-works
curl -s http://127.0.0.1:8103/ll/verify-works/api/info | head -c 160; echo

echo
echo "=== 主站页面标记 ==="
for k in payLayer worksGrid 作品 Sponsor; do
  printf '  %-12s %s\n' "$k" "$(grep -c "$k" /var/www/hopzz.top/index.html)"
done
printf '  app.js 含 openHopzzPay: %s\n' "$(grep -c openHopzzPay /var/www/hopzz.top/assets/app.js)"

echo
echo "=== 清理临时项目 ==="
rm -rf "$D"
echo "  已删除"
curl -s http://127.0.0.1:8000/api/works; echo
