#!/bin/bash
curl -s https://hopzz.top/ -o /tmp/final.html
echo "字节: $(wc -c < /tmp/final.html)"
echo
echo "=== 关键句 ==="
grep -o '还在学写代码[^<]*' /tmp/final.html | head -1
echo "---"
grep -o '所以这个站不是我写的[^<]*' /tmp/final.html | head -1
echo "---"
grep -o '最近想做的[^<]*' /tmp/final.html | head -1
echo
echo "=== 页脚 ==="
grep -o 'HEHEz53 · [^<]*' /tmp/final.html | head -1
grep -o 'foot__domain">[^<]*' /tmp/final.html | head -1
echo
echo "=== 不该再出现 ==="
printf '  自己一行一行        %s\n' "$(grep -c '自己一行一行' /tmp/final.html)"
printf '  接了传感器          %s\n' "$(grep -c '接了.*传感器' /tmp/final.html)"
