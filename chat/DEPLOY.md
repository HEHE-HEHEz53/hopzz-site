# 部署「鲸鱼娘在线」（手机版 DSH Harness）

从零到能用的完整步骤。全部命令都可以直接复制。

---

## 0. 你需要的东西

- 一台能上公网的 Linux 服务器（Debian 12 验证过），root 权限
- 一个域名，能把 `ai.你的域名` 解析到这台服务器
- 电脑上装着 DSH（桌面版）

下面用 `ai.hopzz.top` 举例，换成你自己的域名即可。

---

## 1. 服务器：装基础环境

```bash
apt update
apt -y install nginx python3 python3-venv python3-pip rsync certbot
```

确认端口 80 / 443 是通的（云厂商安全组也要放行）。

---

## 2. 服务器：放代码

把仓库里的 `chat/` 目录传上去：

```bash
# 在你本地
scp -r chat root@<服务器IP>:/root/chat-deploy
```

或者直接在服务器上克隆仓库：

```bash
git clone https://github.com/HEHE-HEHEz53/hopzz-site.git /root/hopzz-site
ln -sfn /root/hopzz-site/chat /root/chat-deploy
```

---

## 3. 服务器：一键部署

```bash
bash /root/chat-deploy/install_chat.sh
```

这个脚本会做这些事（幂等，可以重复跑）：

1. 把服务装到 `/opt/hopzz-chat`
2. 生成 `AGENT_TOKEN`、`COOKIE_SECRET`（只生成一次，之后保留）
3. 建 Python venv，装 fastapi / uvicorn
4. 装 systemd 服务 `hopzz-chat`（127.0.0.1:8100）
5. 申请 Let's Encrypt 证书（`ai.hopzz.top`）
6. 装 nginx 站点并重载
7. 自检首页 / 接口

> 域名要换：改 `install_chat.sh` 顶部的 `DOMAIN`，同时改 `nginx/ai.hopzz.top.conf` 里的
> `server_name` 和证书路径。

**如果 `CHAT_PASSWORD` 没设置**，网站第一次打开会让你**自己设一个密码**（推荐）。
**如果 .env 里带了 `CHAT_PASSWORD`**，就用那个作为初始密码。

---

## 4. 电脑：装插件

插件在仓库的 `plugin/dsh-web-relay`。

### 4.1 装到 DSH

在 DSH 里用插件管理器安装（`plugin_manager install_bundle`），目标填插件的绝对路径，例如：

```
D:\DSH\work\plugin\dsh-web-relay
```

### 4.2 配置连接

打开网站 → 输密码 → **⚙ 设置 → 连接参数**，你会看到：

| 项 | 例子 | 用途 |
| --- | --- | --- |
| 服务器地址 | `wss://ai.hopzz.top/agent-ws` | 填到插件 `serverUrl` |
| 插件令牌 | `763bf...dc5` | 填到插件 `agentToken` |
| 连接字符串 | `whale1.eyJ2IjoxLCJ1cmwi...` | **一整串**，填到插件 `connectString` 即可，不用再填前两项 |

任选一种：

- **方式一**：把「连接字符串」整个粘到插件的 `connectString`
- **方式二**：分别填 `serverUrl` 和 `agentToken`

### 4.3 配置写在哪

两处任选：

- DSH 的插件设置界面（如果能渲染 Config 表单）
- 或者直接改 profile 的 `cordis.patch.yml`（模板见 `plugin/dsh-web-relay/cordis.patch.yml.example`）

```yaml
- insert:
    - id: web-relay
      name: '@local/dsh-web-relay'
      config:
        connectString: 'whale1.xxxxx'
        serverUrl: 'wss://ai.hopzz.top/agent-ws'
        agentToken: ''
        maxReconnectMs: 30000
```

### 4.4 验证连上了

电脑端：

```bash
# 插件日志里应该出现
[web-relay@2.2.0] 已连接 wss://ai.hopzz.top/agent-ws （配置来源：connectString）
```

服务器端：

```bash
journalctl -u hopzz-chat --since "-10 min" | grep "插件已连接"
# 期望：[relay] 插件已连接，版本 2.2.0
```

网页上顶栏的圆点变绿 = 通了。

---

## 5. 首次使用

1. 打开 `https://ai.hopzz.top`
2. **第一次会让你设置密码**（就是你在第 4.2 步用的那个）
3. 进去之后左侧是按项目分组的**真实会话列表**
4. ⚙ 设置里能看到连接参数和改密码

---

## 6. 常见问题

### 插件连不上

按顺序查：

```bash
# 1. 服务活着吗
systemctl status hopzz-chat --no-pager

# 2. 令牌对吗（和网页设置里对比）
grep AGENT_TOKEN= /opt/hopzz-chat/.env

# 3. 有没有连进来
journalctl -u hopzz-chat --since "-10 min" | grep agent-ws

# 4. 证书对吗
curl -sI https://ai.hopzz.top/ | head -1
```

连接字符串解析失败会在插件日志里打印「连接字符串格式不对，应以 whale1. 开头」。

### 忘了密码

数据库里存的是哈希，找不回来。清掉重设：

```bash
bash /root/reset_chat_password.sh     # 清空密码，下次打开会重新让你设置
```

### 想换域名

改三处：`install_chat.sh` 的 `DOMAIN`、`nginx/ai.hopzz.top.conf` 的 `server_name` 与证书路径、插件的 `connectString`（重新从网页复制一次）。
