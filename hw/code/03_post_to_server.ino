/*
 * 03_post_to_server.ino
 * ------------------------------------------------------------
 * 作用：
 *   1. 连接家里的 2.4GHz WiFi；
 *   2. 读取 DHT22 温湿度；
 *   3. 按 API 契约 POST 到 https://hopzz.top/api/telemetry；
 *   4. 失败时自动重试（网络错误、5xx 等）；
 *   5. 每 30 秒上报一次。
 *
 * API 契约（服务端按这个实现，设备端不要改字段名）：
 *   POST https://hopzz.top/api/telemetry
 *   Header: Content-Type: application/json
 *   Header: X-Device-Token: <设备令牌>
 *   Body:   {"device_id":"esp32-01","temperature":26.5,"humidity":58.2}
 *   成功:   200 + {"ok":true}
 *   令牌错: 401
 *   字段缺失: 422
 *
 * 接线：
 *   DHT22 VCC  -> 3V3
 *   DHT22 DATA -> GPIO4
 *   DHT22 GND  -> GND
 *
 * 库：
 *   "DHT sensor library"（Adafruit）+ "Adafruit Unified Sensor"
 *   WiFi / HTTPS 库是 ESP32 开发板包自带的，不用额外装。
 *
 * 重要：
 *   下面的 WiFi 名称、密码、设备令牌必须改成你自己的。
 *   设备令牌由服务端生成，不是 WiFi 密码，也不要发到公开群里。
 * ------------------------------------------------------------
 */

#include <WiFi.h>              // ESP32 的 WiFi 库
#include <WiFiClientSecure.h>  // 支持 HTTPS 的 WiFi 客户端
#include <HTTPClient.h>        // 发 HTTP/HTTPS 请求
#include <DHT.h>               // DHT 温湿度传感器库
#include <stdio.h>             // snprintf

// ==================== 用户可以改的常量 ====================

// --- WiFi ---
// 只能连 2.4GHz 的 WiFi，ESP32 不支持 5GHz。
#define WIFI_SSID "把你的WiFi名称填在这里"
#define WIFI_PASSWORD "把你的WiFi密码填在这里"

// --- 设备身份 ---
// device_id 要和服务器登记的保持一致；本教程固定用 esp32-01。
#define DEVICE_ID "esp32-01"

// 设备令牌：由服务端生成，填在引号里。
// 例如：#define DEVICE_TOKEN "3f9c2a7e-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
#define DEVICE_TOKEN "把服务器给你的设备令牌填在这里"

// --- 服务器 ---
// 用域名，不要写 IP：HTTPS 证书是按域名校验的。
#define SERVER_HOST "hopzz.top"
#define TELEMETRY_PORT 443
#define TELEMETRY_PATH "/api/telemetry"

// --- 传感器 ---
#define DHT_PIN 4
#define DHT_TYPE DHT22

// --- 时间参数 ---
#define REPORT_INTERVAL_MS 30000UL      // 每 30 秒上报一次
#define WIFI_CONNECT_TIMEOUT_MS 20000UL // 单次连 WiFi 最多等 20 秒
#define HTTP_TIMEOUT_MS 10000           // 单次 HTTPS 请求最多等 10 秒
#define MAX_POST_RETRIES 3              // 一次上报最多尝试 3 次

// ==========================================================

DHT dht(DHT_PIN, DHT_TYPE);

// 上一次成功触发上报的时间（毫秒）。
unsigned long lastReportMs = 0;

// 连接 WiFi。已连接就直接返回 true；没连接就尝试连接。
bool connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return true;
  }

  Serial.print("正在连接 WiFi: ");
  Serial.println(WIFI_SSID);

  // station 模式：ESP32 作为客户端去连路由器。
  WiFi.mode(WIFI_STA);

  // 断线后让 ESP32 自动尝试重连。
  WiFi.setAutoReconnect(true);

  // 不把 WiFi 信息写进 flash，避免反复写坏 flash。
  WiFi.persistent(false);

  // 关掉 WiFi 省电模式，降低“发请求要等很久”的概率。
  WiFi.setSleep(false);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startMs = millis();
  while (WiFi.status() != WL_CONNECTED &&
         (millis() - startMs) < WIFI_CONNECT_TIMEOUT_MS) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi 已连接，IP: ");
    Serial.println(WiFi.localIP());
    return true;
  }

  Serial.println("WiFi 连接超时，稍后重试");
  return false;
}

// 读一次温湿度。成功返回 true，并把结果写进引用参数。
bool readSensor(float &temperature, float &humidity) {
  humidity = dht.readHumidity();
  temperature = dht.readTemperature();  // 默认摄氏度

  if (isnan(temperature) || isnan(humidity)) {
    return false;
  }
  return true;
}

// 发一次 POST。返回值是 HTTP 状态码；
// 本地失败（连不上、TLS 握手失败等）会返回 HTTPClient 的负数错误码。
int postTelemetry(float temperature, float humidity) {
  // 按契约拼 JSON。数字不要加引号，device_id 要是字符串。
  char payload[160];
  int len = snprintf(payload, sizeof(payload),
                     "{\"device_id\":\"%s\",\"temperature\":%.1f,\"humidity\":%.1f}",
                     DEVICE_ID, temperature, humidity);

  if (len < 0 || len >= (int)sizeof(payload)) {
    Serial.println("JSON 拼装失败：缓冲区太小");
    return -1;
  }

  Serial.print("POST 内容: ");
  Serial.println(payload);

  WiFiClientSecure client;

  // 【仅测试用】不校验服务器证书。
  // 好处：ESP32 刚上电时间不对（1970 年）也能跑通 HTTPS。
  // 坏处：不验证服务器身份，理论上可能被中间人攻击。
  // 生产环境必须改成 setCACert(...)，见 04-连上服务器.md。
  client.setInsecure();

  HTTPClient https;

  // 建立 HTTPS 请求。参数：客户端、主机、端口、路径、是否 HTTPS。
  // 最后一个 true 很重要：告诉 HTTPClient 这是 https，而不是 http。
  if (!https.begin(client, SERVER_HOST, TELEMETRY_PORT, TELEMETRY_PATH, true)) {
    Serial.println("HTTPS begin 失败");
    return -2;
  }

  https.setTimeout(HTTP_TIMEOUT_MS);
  https.setConnectTimeout(HTTP_TIMEOUT_MS);

  // 契约要求的两个请求头，一个都不能少。
  https.addHeader("Content-Type", "application/json");
  https.addHeader("X-Device-Token", DEVICE_TOKEN);

  // 发请求。String(payload) 把 C 字符串转成 String 传给库。
  int statusCode = https.POST(String(payload));

  // 把服务器返回的响应体读出来，方便排查。
  String response = https.getString();

  // 请求结束，释放连接。
  https.end();

  Serial.print("HTTP 状态码: ");
  Serial.println(statusCode);
  if (response.length() > 0) {
    Serial.print("服务器响应: ");
    Serial.println(response);
  }

  return statusCode;
}

// 带重试的上报。
// 200 -> 成功；401/422 -> 配置或数据错误，重试也没用，直接放弃；
// 其他（网络错误、5xx、429 等）-> 退避后重试。
bool sendWithRetry(float temperature, float humidity) {
  for (int attempt = 1; attempt <= MAX_POST_RETRIES; attempt++) {
    // 每次尝试前确认 WiFi 还连着；断了就重连。
    if (WiFi.status() != WL_CONNECTED) {
      connectWiFi();
    }
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("WiFi 未连接，本次跳过");
      return false;
    }

    int statusCode = postTelemetry(temperature, humidity);

    if (statusCode == 200) {
      Serial.println("上报成功");
      return true;
    }

    if (statusCode == 401) {
      Serial.println("401：设备令牌不对，检查 DEVICE_TOKEN 是否和服务端一致");
      return false;
    }

    if (statusCode == 422) {
      Serial.println("422：字段缺失或格式不对，检查 JSON 字段名和类型");
      return false;
    }

    // 其他 4xx（400/403/404/405 等）是配置/路径/权限问题，重试也不会好。
    // 408（请求超时）和 429（限流）例外，它们值得退避后再试。
    if (statusCode >= 400 && statusCode < 500 &&
        statusCode != 408 && statusCode != 429) {
      Serial.print("客户端错误，不重试，状态码: ");
      Serial.println(statusCode);
      return false;
    }

    // 3xx 重定向：当前代码不跟随重定向，说明 URL 或服务端配置有问题。
    if (statusCode >= 300 && statusCode < 400) {
      Serial.println("收到重定向，检查 URL 是否少了/多了 www 或路径");
      return false;
    }

    Serial.print("第 ");
    Serial.print(attempt);
    Serial.print(" 次上报失败，状态码: ");
    Serial.println(statusCode);

    // 还有下一次机会就等一会儿再试：1 秒、2 秒、4 秒。
    if (attempt < MAX_POST_RETRIES) {
      unsigned long backoffMs = 1000UL * (1UL << (attempt - 1));
      Serial.print("等待 ");
      Serial.print(backoffMs);
      Serial.println(" ms 后重试");
      delay(backoffMs);
    }
  }

  Serial.println("上报失败：重试次数已用完");
  return false;
}

// 判断“现在该不该上报”。
// 第一次调用返回 true，让设备上电后立刻报一次，不用干等 30 秒。
bool timeToReport() {
  static bool firstRun = true;
  unsigned long now = millis();

  if (firstRun || (now - lastReportMs >= REPORT_INTERVAL_MS)) {
    firstRun = false;
    lastReportMs = now;
    return true;
  }
  return false;
}

void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println();
  Serial.println("=================================");
  Serial.println("ESP32 telemetry start");
  Serial.print("Device ID: ");
  Serial.println(DEVICE_ID);
  Serial.print("Server: https://");
  Serial.print(SERVER_HOST);
  Serial.println(TELEMETRY_PATH);
  Serial.println("=================================");

  // 初始化 DHT22。
  dht.begin();

  // DHT22 上电后需要约 2 秒稳定，先等一下再读，避免第一次读成 NaN。
  delay(2000);

  // 先把 WiFi 连上；连不上也不死等，loop 里还会重试。
  connectWiFi();
}

void loop() {
  // 没到上报时间就歇着，避免 loop 转得太快。
  if (!timeToReport()) {
    delay(100);
    return;
  }

  // 到点了：先保证 WiFi 通。
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi 仍未连接，等下一轮");
    return;
  }

  // 读传感器。读失败就跳过这一轮，不让 NaN 进 JSON。
  float temperature = 0.0;
  float humidity = 0.0;
  if (!readSensor(temperature, humidity)) {
    Serial.println("传感器读取失败（NaN），检查 DHT22 接线后重试");
    return;
  }

  Serial.print("温度: ");
  Serial.print(temperature, 1);
  Serial.print(" °C，湿度: ");
  Serial.print(humidity, 1);
  Serial.println(" %RH");

  // 上报，失败会自动重试。
  sendWithRetry(temperature, humidity);
}
