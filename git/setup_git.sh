#!/bin/bash
# 在服务器上建一个自建 git 仓库：git.hopzz.top/hopzz-site.git
# 公开只读克隆，推送走 SSH（root）
set -euo pipefail

DOMAIN="git.hopzz.top"
SRC="/root/git-deploy"
ACME="/var/www/certbot"

step() { echo; echo "========== $* =========="; }

step "1. 装依赖 fcgiwrap"
export DEBIAN_FRONTEND=noninteractive
apt-get -y install fcgiwrap git >/dev/null
systemctl enable --now fcgiwrap >/dev/null 2>&1 || true
systemctl is-active fcgiwrap || true
ls -l /var/run/fcgiwrap.socket || echo "socket 还没出现"

step "2. 建裸仓库"
mkdir -p /srv/git /srv/git-www
if [ ! -d /srv/git/hopzz-site.git ]; then
  git init --bare --initial-branch=main /srv/git/hopzz-site.git >/dev/null
  echo "已创建 /srv/git/hopzz-site.git"
else
  echo "仓库已存在"
fi
# 允许匿名 clone/fetch；禁止匿名 push
git --git-dir=/srv/git/hopzz-site.git config http.receivepack false
git --git-dir=/srv/git/hopzz-site.git config --bool core.bare true
git --git-dir=/srv/git/hopzz-site.git config advice.detachedHead false
rsync -a "$SRC/www/" /srv/git-www/
chown -R www-data:www-data /srv/git /srv/git-www
chmod -R g+rX,o+rX /srv/git

step "3. 申请 $DOMAIN 证书"
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  certbot certonly --webroot -w "$ACME" -d "$DOMAIN" \
    --non-interactive --agree-tos --register-unsafely-without-email --keep-until-expiring
fi
[ -d "/etc/letsencrypt/live/$DOMAIN" ] || { echo "证书没拿到"; exit 1; }

step "4. 装 nginx 站点"
install -m 644 "$SRC/nginx/git.hopzz.top.conf" /etc/nginx/sites-available/git.hopzz.top.conf
ln -sf /etc/nginx/sites-available/git.hopzz.top.conf /etc/nginx/sites-enabled/git.hopzz.top.conf
nginx -t
systemctl reload nginx

step "5. 验证"
printf '首页        %s\n' "$(curl -s -o /dev/null -w '%{http_code}' https://$DOMAIN/)"
printf 'refs 发现   %s\n' "$(curl -s -o /dev/null -w '%{http_code}' 'https://$DOMAIN/hopzz-site.git/info/refs?service=git-upload-pack')"
echo
echo "克隆地址: https://$DOMAIN/hopzz-site.git"
echo "推送地址: vps:/srv/git/hopzz-site.git"
