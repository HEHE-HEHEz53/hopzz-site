/*
 * 02b_read_sht30.ino
 * ------------------------------------------------------------
 * 作用：读取 SHT30 温湿度传感器（I2C 接口），每 2 秒从串口打印一次。
 *       这是进阶档的传感器，入门档用 DHT22 的话不需要这个文件。
 *
 * 接线：
 *   SHT30 VCC -> ESP32 3V3   （红线）
 *   SHT30 GND -> ESP32 GND   （黑线）
 *   SHT30 SDA -> ESP32 GPIO21（绿线）
 *   SHT30 SCL -> ESP32 GPIO22（蓝线）
 *
 * 库：
 *   Arduino IDE -> 工具 -> 管理库，搜索并安装：
 *     "Adafruit SHT31"（作者 Adafruit）
 *   安装时如果提示依赖 "Adafruit BusIO"，一起装。
 *   这个库同时支持 SHT30 / SHT31 / SHT35。
 *
 * 注意：
 *   - 模块供电用 3.3V，不要用 5V 接 I2C 上拉。
 *   - 常见 I2C 地址是 0x44；如果读不到，试 0x45。
 *   - 模块一般自带 I2C 上拉电阻，不用再加。
 * ------------------------------------------------------------
 */

#include <Wire.h>              // ESP32 的 I2C 库
#include <Adafruit_SHT31.h>    // Adafruit SHT31 库

// ==================== 用户可以改的常量 ====================

#define I2C_SDA 21              // I2C 数据线接 GPIO21
#define I2C_SCL 22              // I2C 时钟线接 GPIO22
#define SHT30_ADDR 0x44         // SHT30 的 I2C 地址，常见 0x44 或 0x45
#define READ_INTERVAL_MS 2000UL // 读取间隔，2 秒

// ==========================================================

// 创建 SHT30 对象。
Adafruit_SHT31 sht30;

void setup() {
  Serial.begin(115200);
  delay(300);

  Serial.println();
  Serial.println("=================================");
  Serial.println("SHT30 temperature & humidity");
  Serial.println("=================================");

  // 初始化 I2C 总线，指定 SDA/SCL 引脚。
  // 同一组 I2C 上的 OLED、BH1750 也会共用这两根线。
  Wire.begin(I2C_SDA, I2C_SCL);

  // 初始化传感器。返回 false 说明没找到设备。
  if (!sht30.begin(SHT30_ADDR)) {
    Serial.println("没有找到 SHT30，请检查：");
    Serial.println("  1. VCC 是否接 3.3V，GND 是否共地");
    Serial.println("  2. SDA 是否接 GPIO21，SCL 是否接 GPIO22");
    Serial.println("  3. 地址是否是 0x44 或 0x45");
    while (true) {
      delay(1000);   // 停在错误状态，方便你排查
    }
  }

  Serial.println("SHT30 初始化成功");
}

void loop() {
  delay(READ_INTERVAL_MS);

  // 读温度（摄氏度）和湿度（%RH）。
  // 读失败时库会返回 NAN。
  float temperature = sht30.readTemperature();
  float humidity = sht30.readHumidity();

  if (isnan(temperature) || isnan(humidity)) {
    Serial.println("读取失败：返回 NaN，请检查 I2C 接线");
    return;
  }

  Serial.print("温度: ");
  Serial.print(temperature, 1);
  Serial.print(" °C   ");

  Serial.print("湿度: ");
  Serial.print(humidity, 1);
  Serial.println(" %RH");
}
