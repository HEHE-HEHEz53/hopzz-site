# code 目录怎么用（很重要）

这里放了 5 个 `.ino` 源文件：

| 文件 | 用途 |
|---|---|
| `01_blink.ino` | 板载 LED 闪烁，验证环境 |
| `02_read_sensor.ino` | 读 DHT22 温湿度 |
| `02b_read_sht30.ino` | 可选：读 SHT30 |
| `02c_relay_test.ino` | 可选：测试继电器 |
| `03_post_to_server.ino` | 连 WiFi，POST 到 hopzz.top |

## 不要直接打开整个 `code` 文件夹

Arduino IDE 的规则是：**一个文件夹就是一个 Sketch（项目），文件夹里所有 `.ino` 会被当成同一个程序一起编译。**

这个 `code` 文件夹里有 5 个都带 `setup()` 和 `loop()` 的文件。如果你直接双击其中一个，或者用“文件 → 打开”打开整个文件夹，IDE 会把 5 个文件拼在一起，然后报：

```text
multiple definition of `setup()'
multiple definition of `loop()'
```

这不是代码写错了，是打开方式不对。

## 正确用法：一次只用一个

### 方法 A：新建 Sketch，粘贴（推荐新手）

1. 打开 Arduino IDE。
2. `文件 → 新建 Sketch`（File → New Sketch）。
3. `文件 → 另存为`，文件名写成 `01_blink`（不要写中文）。
4. 把 `01_blink.ino` 里的内容**全选、复制、粘贴**到新 Sketch 里。
5. 点“验证/上传”。

下一个实验重复一遍，另存为 `02_read_sensor`，粘贴 `02_read_sensor.ino` 的内容。

### 方法 B：复制单个文件到独立文件夹

1. 在桌面新建一个文件夹，名字叫 `01_blink`。
2. 把 `01_blink.ino` 复制进去。
3. 用 Arduino IDE 打开这个文件夹里的 `01_blink.ino`。
4. 文件夹名和 `.ino` 文件名一致，Arduino 就不会把别的实验混进来。

**不要**把 5 个 `.ino` 都放在同一个文件夹里打开。

## 每个文件开头的常量

每个 `.ino` 顶部都有 `#define`，比如：

```cpp
#define WIFI_SSID "把你的WiFi名称填在这里"
#define WIFI_PASSWORD "把你的WiFi密码填在这里"
#define DEVICE_TOKEN "把服务器给你的设备令牌填在这里"
```

这些是**你要改的地方**。改完再上传。

## 编译顺序建议

```text
01_blink.ino          → 灯闪了，环境就通了
02_read_sensor.ino    → 串口能看到温湿度，传感器就通了
02c_relay_test.ino    → 继电器会“嗒嗒”响，执行器就通了（可选）
03_post_to_server.ino → 串口显示“上报成功”，服务器就通了
```

`02b_read_sht30.ino` 是给买了 SHT30 的进阶用户准备的，用 DHT22 的话不用它。
