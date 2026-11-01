#!/bin/bash
cd /tmp
rm -rf vv && mkdir vv && cd vv
curl -sLO https://hopzz.top/dl/chat-src.tar.gz
tar -xzf chat-src.tar.gz

echo "=== 源码包里的 cookie 修复 ==="
printf '  request_is_https 出现: '; grep -c "request_is_https" chat/server/app.py
printf '  set_login_cookie(resp, request) 出现: '; grep -c "set_login_cookie(resp, request)" chat/server/app.py
printf '  app.py 语法: '; python3 -c "import ast;ast.parse(open('chat/server/app.py',encoding='utf-8').read());print('OK')"
printf '  install_chat.sh 语法: '; bash -n chat/install_chat.sh && echo OK

echo
echo "=== 线上包文件 ==="
ls -l /var/www/hopzz.top/dl/ | grep -E "2\.9\.8|latest|chat-src"

echo
echo "=== 下载状态 ==="
for u in https://hopzz.top/dl/dsh-web-relay-2.9.8.tgz https://hopzz.top/dl/chat-src.tar.gz; do
  printf '  %s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "$u")" "$u"
done
