# 更新记录

## 5.0.0（2026-11-07）

### 修复

- **Windows 上无法部署 WebUI**：原来用 `existsSync('plink')` 判断工具是否存在，裸命令名永远返回 false，
  导致 Windows 掉进 OpenSSH 分支；而 Windows 自带 ssh 不支持 `SSH_ASKPASS`，密码登录必然失败。
  现在用 `findTool()` 依次在「插件自带 → 设置里的路径 → PATH」中查找 `plink.exe` / `pscp.exe`。
- 找不到 PuTTY 时不再静默失败，而是返回明确的三种解决办法。

### 安全

- **命令注入**：部署地址会拼进远端 shell 命令（`bash install_chat.sh <addr>`）。新增
  `isValidDeployAddr()` 白名单，只允许域名 / IPv4 / `[IPv6]` + 可选端口，拒绝引号、空格、`;`、`&` 等。
- **本地接口越权**：`/web-relay/api/*` 新增 Host 校验（仅 `127.0.0.1` / `localhost` / `[::1]`）
  与 `Sec-Fetch-Site` 校验，阻止同机其它进程或跨站页面读取令牌、触发部署。
- `settings.json` 在 POSIX 系统上写入后 `chmod 600`（内含明文 SSH 密码与连接串）。

### 说明

- 版本号从 2.x 直接跳到 5.0.0，表示这是一次包含破坏性安全加固的里程碑版本。
- 插件仍然零外部依赖（仅 node 内置模块）。

## 2.9.9（2026-11-02）

- 测试连接改为分步诊断（HTTP 可达性 + WebSocket 握手 / close code）。

## 2.9.8

- 修复 HTTP 部署下 `Secure` cookie 被浏览器丢弃导致的「刚登录就过期」。

## 2.9.7

- 设置面板显示密码保存状态，并提供「清除已保存密码」。
- 安装脚本自动重建缺 pip 的 venv。

## 2.9.6

- 清空设置面板全部灰色占位提示。

## 2.9.5

- 安装脚本自动补 `python3-venv`；纯 IP 地址自动按 `IP:8888` 处理。

## 2.9.3

- 目标为本机时直接本地执行安装脚本，不再需要 SSH 密码。

## 2.9.2

- 修复 Linux/macOS 上误用 Windows 版 plink 导致 spawn 失败。

## 2.9.1

- 移除无用的 peerDependencies，插件变为零依赖。

## 2.9.0 及更早

- 设置面板、一键部署、插件安装/卸载、源码自动下载、跨平台适配等历次迭代。
