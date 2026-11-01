#!/bin/bash
set -euo pipefail
REPO=/srv/git/hopzz-site.git

echo "=== 1. 允许 root 在这个仓库上操作 ==="
git config --global --add safe.directory "$REPO" || true
git config --global --get-all safe.directory || true

echo "=== 2. 归属交给 www-data（nginx 读）==="
chown -R www-data:www-data /srv/git
chmod -R g+rX,o+rX /srv/git

echo "=== 3. 推送后自动修权限 ==="
cat > "$REPO/hooks/post-receive" <<'EOF'
#!/bin/sh
# 每次推送后把仓库交还给 www-data，保证匿名 clone 能读
chown -R www-data:www-data /srv/git/hopzz-site.git 2>/dev/null || true
chmod -R g+rX,o+rX /srv/git/hopzz-site.git 2>/dev/null || true
EOF
chmod +x "$REPO/hooks/post-receive"
chown www-data:www-data "$REPO/hooks/post-receive"

echo "=== 4. 检查 ==="
git --git-dir="$REPO" config --get http.receivepack || echo "(receivepack 未设置，默认拒绝匿名推送)"
ls -ld "$REPO"
