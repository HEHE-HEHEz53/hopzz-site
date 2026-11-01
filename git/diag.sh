#!/bin/bash
echo "=== nginx 错误日志 ==="
tail -n 20 /var/log/nginx/error.log 2>/dev/null || echo "(无)"
echo
echo "=== 直接打 refs ==="
curl -sS -o /dev/null -w 'HTTP %{http_code}\n' 'https://git.hopzz.top/hopzz-site.git/info/refs?service=git-upload-pack' || true
echo
echo "=== 仓库权限 ==="
ls -ld /srv/git /srv/git/hopzz-site.git
ls -l /srv/git/hopzz-site.git | head -8
echo
echo "=== fcgiwrap 状态 ==="
systemctl is-active fcgiwrap
ls -l /var/run/fcgiwrap.socket
echo
echo "=== nginx worker 用户 ==="
ps -o user= -C nginx | sort -u || true
echo
echo "=== 试试本地 fastcgi 是否工作 ==="
curl -sS -o /dev/null -w 'http 首页 HTTP %{http_code}\n' http://127.0.0.1/ -H 'Host: git.hopzz.top' || true
