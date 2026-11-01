#!/bin/bash
echo "=== hopzz.top 线上检查 ==="
curl -s https://hopzz.top/ -o /tmp/h.html
echo "字节:        $(wc -c < /tmp/h.html)"
echo "Hopzz:       $(grep -c 'Hopzz' /tmp/h.html)"
echo "HEHE:        $(grep -c 'HEHE' /tmp/h.html)"
echo "HEHEz53:     $(grep -c 'HEHEz53' /tmp/h.html)"
echo "白饭页脚:     $(grep -c '鲸鱼娘吃完白饭后做的网站' /tmp/h.html)"
echo "固定背景:     $(grep -c 'background-attachment: fixed' /tmp/h.html)"
echo "GitHub链接:   $(grep -c 'github.com/HEHE-HEHEz53/hopzz-site' /tmp/h.html)"
echo
echo "=== 页面标题 ==="
grep -o '<title>[^<]*</title>' /tmp/h.html
echo
echo "=== ai.hopzz.top ==="
printf '页面 %s  接口 %s\n' \
  "$(curl -s -o /dev/null -w '%{http_code}' https://ai.hopzz.top/)" \
  "$(curl -s -o /dev/null -w '%{http_code}' https://ai.hopzz.top/api/me)"
echo
echo "=== git.hopzz.top ==="
printf '首页 %s  仓库 %s\n' \
  "$(curl -s -o /dev/null -w '%{http_code}' https://git.hopzz.top/)" \
  "$(curl -s -o /dev/null -w '%{http_code}' 'https://git.hopzz.top/hopzz-site.git/info/refs?service=git-upload-pack')"
echo
echo "=== GitHub 最新提交 ==="
TOKEN=$(tr -d '[:space:]' < /root/.gh_token)
git ls-remote "https://HEHE-HEHEz53:${TOKEN}@github.com/HEHE-HEHEz53/hopzz-site.git" 2>/dev/null | head -2
echo
echo "=== 服务状态 ==="
for s in nginx hopzz-api hopzz-chat fcgiwrap; do
  printf '%-12s %s\n' "$s" "$(systemctl is-active $s 2>/dev/null || echo '-')"
done
