#!/bin/bash
echo "=== 自建仓库的分支 ==="
git --git-dir=/srv/git/hopzz-site.git branch -a
git --git-dir=/srv/git/hopzz-site.git log --oneline -3
echo
echo "=== GitHub 上的 refs ==="
TOKEN=$(tr -d '[:space:]' < /root/.gh_token)
git ls-remote "https://HEHE-HEHEz53:${TOKEN}@github.com/HEHE-HEHEz53/hopzz-site.git" 2>&1 | head -5 || echo "(没有 refs)"
echo
echo "=== 手动镜像推送（显示输出）==="
rm -rf /tmp/ghpush.git
git clone --mirror https://git.hopzz.top/hopzz-site.git /tmp/ghpush.git 2>&1 | tail -3
echo "--- 镜像里的分支 ---"
git -C /tmp/ghpush.git branch -a | head -5
git -C /tmp/ghpush.git log --oneline -3
echo "--- 推送 ---"
git -C /tmp/ghpush.git push --mirror "https://HEHE-HEHEz53:${TOKEN}@github.com/HEHE-HEHEz53/hopzz-site.git" 2>&1 | tail -10
echo "EXIT=$?"
