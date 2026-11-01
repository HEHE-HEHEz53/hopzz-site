# 鲸鱼娘网盘（f.hopzz.top）

## 一句话

**https://f.hopzz.top** —— 输密码 → 两个大按钮 → 快速上传 / 进入网盘。

---

## 1. 三个界面

### 密码页
输入密码进入。连错 5 次锁 10 分钟（网页有倒计时）。

### 两个大选项
- **⚡ 快速上传** —— 点了直接选文件，选完立刻开始传，全部落到「快速上传」文件夹。紧急情况下最少的点击。
- **📁 进入网盘** —— 进入文件管理。

### 快速上传
- 拖拽或点击选文件，**选完就传**，不用再确认
- 每个文件一条进度条；失败可以单独重试
- 全部完成后可以「继续上传」或「去网盘」

### 网盘
- 面包屑导航，文件夹优先排序
- 上传文件 / 新建文件夹 / 下载 / 移动 / 删除
- 删除有二次确认
- **⚙ 设置（改密码）只在这里出现**

---

## 2. 密码

**当前密码**：`PWtgFvXaV6844`

服务器上查看：

```bash
grep FILE_PASSWORD= /opt/hopzz-files/.env
```

### 改密码：只能在网盘模式里

这是服务端强制的，不只是藏按钮：

- 点「进入网盘」时，服务端会发一个额外的凭证 cookie
- 改密码接口 `POST /api/password` **必须带这个凭证**
- 没进过网盘直接调 → `403 只有进入网盘后才能修改密码`

在网页里操作：进入网盘 → 右上角 **⚙ 设置** → 原密码 + 新密码（≥6 位）+ 确认。

改完所有设备旧登录态失效，当前浏览器自动续上。

---

## 3. 文件存在哪

| 项 | 位置 |
| --- | --- |
| 根目录 | `/srv/files` |
| 快速上传目标 | `/srv/files/快速上传` |
| 密码哈希/锁定状态 | `/opt/hopzz-files/data/files.db` |
| 后端代码 | `/opt/hopzz-files/server/app.py` |
| 前端 | `/opt/hopzz-files/static/` |

磁盘是服务器那块 40G（当前用了约 3G）。

```bash
# 看占用
du -sh /srv/files
df -h /

# 直接看文件
ls -la /srv/files
ls -la "/srv/files/快速上传"
```

**同名文件不会覆盖**：自动改名成 `文件 (1).txt`、`文件 (2).txt`。

---

## 4. 接口（前端用到的）

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/api/me` | 是否已登录 |
| POST | `/api/login` | 登录 |
| POST | `/api/logout` | 退出（清两个 cookie） |
| POST | `/api/enter-netdisk` | 进入网盘模式（发改密码所需凭证） |
| POST | `/api/password` | 改密码（必须在网盘模式） |
| GET | `/api/list?path=/` | 列目录 |
| GET | `/api/folders` | 所有文件夹（移动对话框用） |
| POST | `/api/mkdir` | 新建文件夹 |
| POST | `/api/move` | 移动 |
| DELETE | `/api/entry?path=` | 删除 |
| GET | `/api/download?path=` | 下载 |
| POST | `/api/upload?path=` | 上传（`files` 字段，可多选） |
| POST | `/api/quick-upload` | 快速上传到「快速上传」目录 |

---

## 5. 运维

```bash
systemctl status hopzz-files --no-pager
journalctl -u hopzz-files -n 50 --no-pager
systemctl restart hopzz-files
nginx -t && systemctl reload nginx
```

**大文件上传**：nginx 里 `client_max_body_size 0`（不限大小）、`proxy_request_buffering off`（不落盘缓冲，直接流给后端），所以传几个 G 的文件也不会占用额外磁盘。

**自检**：`python3 /root/files-deploy/test_files.py`（需要先 `set -a; . /opt/hopzz-files/.env; set +a`）

---

## 6. 安全说明

- 密码 PBKDF2-SHA256（20 万次迭代）哈希存储
- 会话是 HMAC 签名的 HttpOnly cookie，30 天有效
- 路径做了穿越防护（`../` 会被拒绝）
- 服务以 `www-data` 运行，systemd 限制只能写 `/srv/files` 和 `/opt/hopzz-files/data`
- **这个网盘里是你的真实文件**，密码别用弱口令
