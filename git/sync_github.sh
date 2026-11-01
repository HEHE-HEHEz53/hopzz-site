#!/bin/bash
# 把自建仓库镜像同步到 GitHub
# 用法：bash /root/sync_github.sh
set -euo pipefail

TOKEN_FILE=/root/.gh_token
REPO="HEHE-HEHEz53/hopzz-site"
SRC="https://git.hopzz.top/hopzz-site.git"
WORK=/tmp/ghpush.git

[ -f "$TOKEN_FILE" ] || { echo "缺少 $TOKEN_FILE"; exit 1; }
TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"
[ -n "$TOKEN" ] || { echo "令牌为空"; exit 1; }

echo "1) 从自建仓库拉取镜像…"
rm -rf "$WORK"
git clone --quiet --mirror "$SRC" "$WORK"

echo "2) 推送到 GitHub…"
git -C "$WORK" push --quiet --mirror \
  "https://HEHE-HEHEz53:${TOKEN}@github.com/${REPO}.git"

echo "3) 清理"
rm -rf "$WORK"

echo
echo "完成：https://github.com/${REPO}"
