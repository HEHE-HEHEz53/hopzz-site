#!/bin/bash
# 服务器安全加固：防火墙 + 防暴力破解
# 原则：先放行 SSH 再开防火墙，避免把自己关在门外。
set -euo pipefail

echo "===== 1. 当前状态 ====="
ufw status verbose 2>/dev/null || echo "ufw 未安装"
systemctl is-active fail2ban 2>/dev/null || echo "fail2ban 未安装"

echo "===== 2. 安装 ufw + fail2ban ====="
export DEBIAN_FRONTEND=noninteractive
apt-get -y install ufw fail2ban >/dev/null

echo "===== 3. 防火墙规则（先放行，再启用）====="
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    comment 'SSH'
ufw allow 80/tcp    comment 'HTTP'
ufw allow 443/tcp   comment 'HTTPS'
ufw --force enable
ufw status verbose

echo "===== 4. fail2ban 配置（SSH 防爆破）====="
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
# 5 分钟内失败 5 次 -> 封禁 1 小时
bantime  = 1h
findtime = 5m
maxretry = 5
backend  = systemd

[sshd]
enabled = true
port    = 22
EOF
systemctl enable fail2ban >/dev/null
systemctl restart fail2ban
sleep 2
systemctl is-active fail2ban && fail2ban-client status sshd || {
  echo "!! fail2ban 启动异常，日志："
  journalctl -u fail2ban -n 20 --no-pager
}

echo "===== 5. 确认 SSH 仍然可用 ====="
ss -tlnp | grep -E ':22\b' || echo "警告：22 端口没在监听"

echo "===== 完成 ====="
echo "防火墙已启用：只放行 22(SSH) / 80(HTTP) / 443(HTTPS)"
echo "fail2ban 已启用：SSH 连续失败 5 次封禁 1 小时"
