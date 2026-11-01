/*
 * 02_read_sensor.ino
 * ------------------------------------------------------------
 * 作用：读取 DHT22 温湿度传感器，每 2 秒从串口打印一次。
 *
 * 接线：
 *   DHT22 VCC  -> ESP32 3V3   （红线）
 *   DHT22 DATA -> ESP32 GPIO4 （黄线）
 *   DHT22 GND  -> ESP32 GND   （黑线）
 *
 * 库：
 *   Arduino IDE -> 工具 -> 管理库，搜索并安装：
 *     1. "DHT sensor library"（作者 Adafruit）
 *     2. "Adafruit Unified Sensor"（依赖库，会一起提示安装）
 *
 * 注意：
 *   - DHT22 两次读数之间至少隔 2 秒，读太快会返回 NaN。
 *   - 裸的 4 针 DHT22 要在 DATA 和 3.3V 之间加 4.7k～10k 上拉电阻；
 *     带小 PCB 的 3 针模块通常已经自带。
 *   - 如果串口一直打印 NaN，先检查接线和上拉，不要先怀疑代码。
 * ------------------------------------------------------------
 */

#include <DHT.h>   // 引入 DHT 传感器库

// ==================== 用户可以改的常量 ====================

#define DHT_PIN 4              // DHT22 的 DATA 接在 GPIO4
#define DHT_TYPE DHT22         // 传感器型号：DHT22（不是 DHT11）
#define READ_INTERVAL_MS 2000UL // 读取间隔，DHT22 至少 2000 毫秒

// ==========================================================

// 创建一个 DHT 对象。
// 参数 1：数据脚编号；参数 2：传感器型号。
DHT dht(DHT_PIN, DHT_TYPE);

void setup() {
  // 串口波特率必须和“串口监视器”右下角选的一致（115200）。
  Serial.begin(115200);
  delay(300);

  Serial.println();
  Serial.println("=================================");
  Serial.println("DHT22 temperature & humidity");
  Serial.print("DATA pin: GPIO");
  Serial.println(DHT_PIN);
  Serial.println("=================================");

  // 初始化传感器。DHT 库会在这里配置引脚和内部状态。
  dht.begin();

  // 传感器刚上电需要一点时间稳定，等 2 秒再开始读。
  delay(2000);
}

void loop() {
  // 先等够采样间隔。DHT22 不能连续快速读。
  delay(READ_INTERVAL_MS);

  // readHumidity() 返回相对湿度，单位 %RH。
  float humidity = dht.readHumidity();

  // readTemperature() 默认返回摄氏度。
  // 如果写 readTemperature(true)，返回的是华氏度。
  float temperature = dht.readTemperature();

  // isnan() 判断“是不是一个有效数字”（NaN = Not a Number）。
  // 只要有一个读失败，就打印提示并跳过本次，避免打印出垃圾值。
  if (isnan(humidity) || isnan(temperature)) {
    Serial.println("读取失败：返回 NaN，请检查接线、上拉电阻和传感器型号");
    return;   // 直接结束本次 loop，下一次再试
  }

  // 打印温度，保留 1 位小数。
  Serial.print("温度: ");
  Serial.print(temperature, 1);
  Serial.print(" °C   ");

  // 打印湿度，保留 1 位小数。
  Serial.print("湿度: ");
  Serial.print(humidity, 1);
  Serial.println(" %RH");

  // 你也可以在这里加判断，例如温度超过 30°C 就打印警告：
  // if (temperature > 30.0) {
  //   Serial.println("警告：温度偏高");
  // }
}
