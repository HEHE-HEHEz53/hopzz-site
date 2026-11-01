#!/bin/bash
echo "=== 服务器上的包 ==="
ls -l /var/www/hopzz.top/dl/
echo
echo "=== HTTPS 下载测试 ==="
cd /tmp
rm -f probe.tgz
code=$(curl -s -o probe.tgz -w '%{http_code}' https://hopzz.top/dl/dsh-web-relay-2.5.0.tgz)
echo "HTTP $code  大小 $(stat -c %s probe.tgz 2>/dev/null || echo 0) 字节"
echo
echo "=== 解包确认内容 ==="
tar -tzf probe.tgz 2>/dev/null | head -12
echo
echo "=== 包内是否含令牌 ==="
mkdir -p /tmp/pkgx && rm -rf /tmp/pkgx/* && tar -xzf probe.tgz -C /tmp/pkgx 2>/dev/null
if grep -rq '763bf0673f959943' /tmp/pkgx 2>/dev/null; then echo "!!! 有令牌"; else echo "OK 无令牌"; fi
echo
echo "=== nginx 对 .tgz 的响应头 ==="
curl -sI https://hopzz.top/dl/dsh-web-relay-2.5.0.tgz | head -6
