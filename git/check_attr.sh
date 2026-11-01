#!/bin/bash
echo "=== hopzz.top 页脚与署名 ==="
curl -s https://hopzz.top/ -o /tmp/attr.html
echo "字节: $(wc -c < /tmp/attr.html)"
echo
echo "-- 页脚两行 --"
grep -o '<p>©.\{0,120\}' /tmp/attr.html | head -2
grep -o '<p class="foot__domain">.\{0,80\}' /tmp/attr.html | head -2
echo
echo "-- 关于里那句 --"
grep -o '站是 DeepSeek.\{0,80\}' /tmp/attr.html | head -2
echo
echo "-- 关键词计数 --"
for k in "DeepSeek（鲸鱼娘）" "鲸鱼娘吃完白饭后做的网站" "HEHEz53" "Hopzz"; do
  printf '  %-26s %s\n' "$k" "$(grep -c "$k" /tmp/attr.html)"
done
echo
echo "=== ai.hopzz.top 登录页署名 ==="
curl -s https://ai.hopzz.top/ -o /tmp/ai.html
grep -o '由 DeepSeek（鲸鱼娘）搭建' /tmp/ai.html | head -2
grep -o '鲸鱼娘在线' /tmp/ai.html | head -1
