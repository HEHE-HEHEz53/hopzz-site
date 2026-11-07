# hopzz.top 个人站 —— 总览

你的服务器和网站已经**搭好并且正在运行**了。这份文档告诉你它长什么样、怎么用、怎么改。

---

## 1. 现在能访问什么

| 地址 | 内容 |
| --- | --- |
| **https://hopzz.top** | 你的个人主页（不是 `http://`，已自动跳转） |
| **https://www.hopzz.top** | 同上，www 也能访问 |
| **https://f.hopzz.top** | 📦 **鲸鱼娘网盘** —— 密码保护的快速上传 / 网盘（见 `files/README.md`） |
| **https://yun.hopzz.top** | 🔗 **HEHE网盘** —— 网盘分享出来的链接落地页（`/gx/<后缀>`，要共享码） |
| **https://ai.hopzz.top** | 📱 **手机聊天页** —— 在手机上跟 DSH 对话（要密码，见 `chat/README.md`） |
| **https://hopzz.top/api/docs** | 后端接口的交互式文档（可以在网页上直接点"Try it out"测试） |
| **https://hopzz.top/api/status** | 服务器实时负载的 JSON |
| **https://hopzz.top/api/telemetry/latest** | 最新一条硬件温湿度 |

> 打开 https://hopzz.top 就能看到：首屏介绍、关于我、技能、作品、**实时数据**（服务器 CPU/内存/磁盘 + 室内温湿度）、联系方式。右上角可以切换深色/浅色主题。

---

## 2. 这套东西是怎么搭起来的

```
     你的浏览器
         │  HTTPS (443)
         ▼
   ┌──────────────┐
   │    Nginx     │  ← 负责 HTTPS、静态网页、限流缓存
   └──────┬───────┘
          │  /api/ 开头的请求转发到本机 8000 端口
          ▼
   ┌──────────────┐
   │   FastAPI    │  ← 后端：服务器状态 + 硬件数据
   └──────┬───────┘
          │
          ▼
   ┌──────────────┐
   │    SQLite    │  ← 一个文件，存温湿度历史
   └──────────────┘

   ESP32（以后买） ──HTTPS POST──> /api/telemetry ──> SQLite ──> 网页实时显示
```

**技术栈都不重**，1.9G 内存的机器跑起来毫无压力（目前内存占用约 20%，磁盘 7%）。

| 组件 | 版本 | 作用 |
| --- | --- | --- |
| Debian | 12 (bookworm) | 操作系统 |
| Nginx | 1.22.1 | 网站服务器，处理 HTTPS |
| Python | 3.11 | 运行后端 |
| FastAPI | 0.115.6 | 后端框架 |
| Uvicorn | 0.34.0 | 跑 FastAPI 的进程 |
| SQLite | 3.x | 存数据，零配置 |
| Let's Encrypt | — | 免费 HTTPS 证书，自动续期 |

---

## 3. 文件都在哪

**服务器上：**

| 路径 | 内容 |
| --- | --- |
| `/var/www/hopzz.top/` | 网页文件（`index.html`、`assets/style.css`、`assets/app.js`、`favicon.svg`） |
| `/opt/hopzz-api/app/main.py` | 后端全部代码（一个文件） |
| `/opt/hopzz-api/.env` | **设备令牌**（硬件的密码），只有 root 能读 |
| `/opt/hopzz-api/data/hopzz.db` | 数据库文件 |
| `/etc/nginx/sites-available/hopzz.top.conf` | Nginx 站点配置 |
| `/etc/systemd/system/hopzz-api.service` | 后端开机自启配置 |
| `/root/install.log` | 这次部署的完整日志 |

**你电脑上（源文件，改这个）：**

| 路径 | 内容 |
| --- | --- |
| `D:\DSH\work\deploy\site\` | 网页源文件 |
| `D:\DSH\work\deploy\api\` | 后端源文件 |
| `D:\DSH\work\deploy.ps1` | **一键发布脚本** |
| `D:\DSH\work\hw\` | 硬件教程（选型 / 接线 / 代码） |
| `D:\DSH\work\docs\` | 使用手册（就是你在看的这些） |

> **重要概念**：服务器上的是"发布出去的版本"，你电脑上的 `deploy\` 是"源码"。
> 改内容请改**电脑上的源码**，然后跑 `deploy.ps1` 发布。这样你永远有一份完整的备份。

---

## 4. 我马上想试试，怎么做

### 4.1 打开网站看看
浏览器访问 **https://hopzz.top** ，然后：
- 点右上角 🌙/☀️ 按钮，看深色/浅色切换
- 往下滚，看"实时数据"两块的动效
- 按 F12 打开开发者工具 → Console，应该是干净的（没有红色报错）

### 4.2 看看服务器的实时状态
浏览器直接打开：**https://hopzz.top/api/status**

会返回类似这样的东西（每次刷新都变）：
```json
{"hostname":"ser562561000699","uptime_seconds":3991.84,"cpu_count":2,
 "load1":0.25,"cpu_percent":12.6,"mem_percent":19.7,"disk_percent":7.3}
```

### 4.3 在网页上测接口（最直观）
打开 **https://hopzz.top/api/docs** ，你会看到所有接口的列表。点开任意一个 → 点 **Try it out** → 点 **Execute**，就能看到真实返回。

> 例如点开 `GET /api/status` 再 Execute，就是 4.2 那段 JSON。

---

## 5. 接下来读什么

| 想看什么 | 读哪个文件 |
| --- | --- |
| **在手机上跟 DSH 对话** | `chat/README.md` |
| 怎么改主页上的文字/作品/联系方式 | `docs/01-改内容.md` |
| 日常命令：看日志、重启、备份 | `docs/02-日常运维.md` |
| 服务器安全和密码问题 | `docs/03-安全建议.md` |
| 全部命令速查 | `docs/04-速查表.md` |
| **硬件怎么买、怎么接线、怎么写代码** | `hw/README.md`（从这里开始） |

---

## 6. 一句话总结现状

- ✅ 网站已上线，HTTPS 证书有效期到 **2027-01-30**，到期前自动续期
- ✅ 后端接口已跑通，4 项安全校验（令牌错误 / 缺令牌 / 空数据）全部正确拒绝
- ✅ 防火墙只开放 22/80/443，fail2ban 已自动封掉一个暴力破解 IP
- ✅ ****鲸鱼娘在线** `https://ai.hopzz.top` 已上线**：密码登录，手机上能看到电脑里**真实的项目、会话、历史记录**，以及模型/模式/权限/插件；可以往真实会话发消息
- ⏳ 硬件还没买，温湿度那一块现在显示"还没有硬件上报数据"，接上就是真的了

---

## 7. 鲸鱼娘在线（手机版 DSH Harness）

```
手机浏览器 → ai.hopzz.top（中继，不存内容）→ 你电脑上的 DSH 插件（主动外连）
```

**不是另一套对话，是同一份数据**：插件直接读你电脑上 DSH Harness 的会话存储，手机上看到的项目、会话、历史都是真的。

**为什么不需要公网 IP**：连接方向是「你电脑主动连出去」，跟浏览器上网一样，路由器不用做任何设置，也不用开隧道。

**功能**：
- 📁 **真实会话列表**，按**项目（工作区）**分组，标题/时间/运行中蓝点
- 💬 点进去看**真实历史**（工具调用显示成小标签）
- ✍️ 发消息就是往那个真实会话发（走 `sessionController.prompt()`）
- ➕ **新建会话**：选项目后在电脑上真的建一个 DSH 会话
- ℹ️ **信息面板**：当前模型、模式（preset）、权限档位、已装插件（bundle）、项目列表
- 🔑 登录后能改密码（右上角 ⚙）
- 🔒 密码错 5 次锁 15 分钟；急着用执行 `bash /root/unlock.sh`

- 登录密码 / 详细用法：见 `chat/README.md`
- 插件源码：`D:\DSH\work\plugin\dsh-web-relay\`
- 它是 DSH 的一个 **bundle 插件**（`@local/dsh-web-relay` 2.0.3），用 `plugin_manager` 安装，随 DSH 启动自动运行

> **不需要绑定 GitHub。** 之前提到 GitHub 只是因为你 profile 里有个主题包托管在 GitHub 上、当时网络连不上，跟这个页面没有任何关系。
---

## 8. 代码仓库

| 用途 | 地址 |
| --- | --- |
| **主仓库（GitHub，公开）** | https://github.com/HEHE-HEHEz53/hopzz-site |
| 自建镜像（自己服务器，公开可克隆） | https://git.hopzz.top/hopzz-site.git |

**为什么有两个**：你本机网络访问 GitHub 不稳定，所以 GitHub 是「对外的主仓库」，
自建的是「随时能连的镜像」。本地写代码 → 推自建 → 脚本一键同步到 GitHub。

### 日常流程

```
# 1. 本地提交
git add -A
git commit -m "改了什么"

# 2. 推到自建仓库
git push vps main

# 3. 同步到 GitHub（在服务器上跑一次）
ssh -F D:\DSH\work\.ssh\config vps "bash /root/sync_github.sh"
```

### 令牌

GitHub 推送用的 token 存在服务器 /root/.gh_token（权限 600，只有 root 能读）。
7 天后过期，过期后重新生成一个并覆盖这个文件即可：

`ash
printf %s "新的token" > /root/.gh_token && chmod 600 /root/.gh_token
`

不想留就把文件删掉，随时可以撤销 token。