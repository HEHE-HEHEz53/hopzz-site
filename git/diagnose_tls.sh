#!/bin/bash
echo "=== 1. 各站点证书链校验（curl 严格验证） ==="
for d in hopzz.top www.hopzz.top ai.hopzz.top chat.hopzz.top f.hopzz.top git.hopzz.top; do
  out=$(curl -sS -o /dev/null -w '%{http_code}' "https://$d/" 2>&1)
  verify=$(curl -sS -o /dev/null -w '%{ssl_verify_result}' "https://$d/" 2>/dev/null)
  printf '%-16s HTTP %s  证书校验码 %s（0 = 通过）\n' "$d" "$out" "$verify"
done

echo
echo "=== 2. 响应头里有没有 HSTS / 混合内容线索 ==="
for d in hopzz.top ai.hopzz.top f.hopzz.top; do
  echo "--- $d ---"
  curl -sI "https://$d/" | grep -Ei 'strict-transport|content-security|server:|HTTP/' | head -4
done

echo
echo "=== 3. 页面里有没有 http:// 明文资源（混合内容）==="
for d in hopzz.top ai.hopzz.top f.hopzz.top; do
  n=$(curl -s "https://$d/" | grep -o 'http://[^"'"'"' ]*' | grep -v 'www.w3.org' | head -5)
  printf '%-14s %s\n' "$d" "${n:-无}"
done

echo
echo "=== 4. JS / CSS 里有没有 http:// ==="
for u in https://hopzz.top/assets/app.js https://hopzz.top/assets/style.css \
         https://ai.hopzz.top/app.js https://ai.hopzz.top/app.css \
         https://f.hopzz.top/app.js https://f.hopzz.top/app.css; do
  n=$(curl -s "$u" | grep -o 'http://[^"'"'"' )]*' | grep -v 'w3.org' | head -3)
  printf '%-42s %s\n' "$u" "${n:-无}"
done

echo
echo "=== 5. 用 IP 直接访问会怎样（证书不匹配？）==="
curl -sS -o /dev/null -w 'https://IP  HTTP %{http_code}\n' https://64.83.20.24/ 2>&1 | head -2
curl -sI http://64.83.20.24/ | head -3

echo
echo "=== 6. 各域名当前用的证书（CN/SAN）==="
for d in hopzz.top ai.hopzz.top f.hopzz.top; do
  echo -n "$d -> "
  echo | openssl s_client -connect "$d:443" -servername "$d" 2>/dev/null \
    | openssl x509 -noout -subject -dates 2>/dev/null | tr '\n' ' '
  echo
done
