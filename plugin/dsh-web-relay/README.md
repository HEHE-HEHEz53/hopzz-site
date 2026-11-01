# 鲸鱼娘在线（@local/dsh-web-relay）

把 DSH 接到 `ai.hopzz.top` 的手机网页。插件在电脑上**主动外连**，家里不需要公网 IP。

当前版本：**2.4.0**（带设置面板）

---

## 1. 设置面板在哪

DSH → **设置** → 左侧列表里找到 **「鲸鱼娘在线」**（和「账户」「通用」「模型」「插件」并列）。

> 2.3.0 之前没有面板，只能改配置文件。现在有了。

面板分四块：

### ① 连接状态
顶部一行：绿点=已连接 / 红点=未连接，右边显示插件版本，下面显示当前地址和配置来源（连接字符串 / 参数 / 默认值）。

### ② 连接方式（两种，随便选一种）
- **用连接字符串**：在手机网页（`ai.hopzz.top`）→ ⚙ 设置 → 连接参数 → 复制「连接字符串」，粘进来。形如 `whale1.eyJ2IjoxLCJ1cmwi...`
- **用参数**：分别填「服务器地址」（`wss://ai.hopzz.top/agent-ws`）和「插件令牌」（64 位十六进制）

填完点 **保存并重连**。旁边的 **测试连接** 会临时连一次服务器，8 秒内告诉你通不通（不改配置）。

### ③ 部署 WebUI
点 **一键部署**：插件会用下面的 SSH 配置，把仓库里的 `chat/` 目录传到服务器，并执行 `install_chat.sh`。

执行过程会实时打在下面的日志框里，失败时能直接看到错在哪一步（SSH 连不上 / 上传失败 / 安装脚本报错）。

### ④ 常规设置
| 项 | 说明 |
| --- | --- |
| 断线重连 | 最大重连间隔（毫秒，默认 30000） |
| SSH 配置 | 部署用的 ssh config 路径，默认 `D:\DSH\work\.ssh\config` |
| SSH 主机 | config 里的 Host 别名，默认 `vps` |

---

## 2. 设置存在哪

面板里保存的内容写到**插件目录下的 `settings.json`**：

```
D:\DSH\work\plugin\dsh-web-relay\settings.json
```

优先级：`settings.json` > 插件 Config（`cordis.patch.yml`）> 内置默认值。

删掉这个文件就回到 `cordis.patch.yml` 里的配置。

---

## 3. 数据接口（面板用的，也可以自己 curl）

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/web-relay/api/status` | 连接状态 + 当前配置 |
| POST | `/web-relay/api/settings` | 保存连接配置并重连 |
| POST | `/web-relay/api/test` | 测试连接（不改配置） |
| POST | `/web-relay/api/deploy` | 一键部署 |
| POST | `/web-relay/api/general` | 保存常规设置 |

这些路由挂在 DSH 自己的 Web 服务上（`127.0.0.1:8689`），所以只有本机能访问。

---

## 4. 手动配置（面板出问题时）

编辑 `cordis.patch.yml`（模板见 `cordis.patch.yml.example`）：

```yaml
- insert:
    - id: web-relay
      name: '@local/dsh-web-relay'
      config:
        connectString: 'whale1.xxxxx'    # 优先
        serverUrl: 'wss://ai.hopzz.top/agent-ws'
        agentToken: '...'
        maxReconnectMs: 30000
```

改完重启 DSH 生效。

---

## 5. 排错

| 现象 | 检查 |
| --- | --- |
| 设置里找不到「鲸鱼娘在线」 | 插件没启用，或版本低于 2.4.0 |
| 面板显示「读取插件设置失败」 | 看插件目录下的 `boot.json`，里面记录了接口注册结果和错误 |
| 测试连接失败 | 地址要以 `wss://` 开头、令牌是 64 位十六进制；服务器 `systemctl status hopzz-chat` |
| 一键部署报「连不上服务器」 | 检查「常规设置」里的 SSH 配置路径和主机别名 |
| 保存后不生效 | 看 `settings.json` 有没有写出来；确认没有别的 `cordis.patch.yml` 覆盖 |
---

## 6. 已验证（2.4.0）

在真机上实测通过（127.0.0.1:8379）：

| 检查 | 结果 |
| --- | --- |
| GET /web-relay/api/status | 200，返回 connected: true |
| POST /web-relay/api/test | {"ok":true,"message":"连接正常"} |
| POST /web-relay/api/settings（连接字符串） | 保存成功，source 变为 connectString，仍然保持连接 |
| settings.json | 已生成（**不入库**，含令牌） |
| oot.json | 记录了路由注册结果，用于排错（**不入库**） |