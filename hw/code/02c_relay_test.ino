/*
 * 02c_relay_test.ino
 * ------------------------------------------------------------
 * 作用：测试继电器模块，每 3 秒“吸合 -> 断开”循环一次。
 *
 * 接线（控制端）：
 *   继电器 VCC -> ESP32 3V3（仅限 3.3V 模块；5V 模块接 5V/VIN）
 *   继电器 GND -> ESP32 GND
 *   继电器 IN  -> ESP32 GPIO26
 *
 * 负载端（只接低压！）：
 *   5V 电源正极 -> 继电器 COM
 *   继电器 NO   -> 负载正极
 *   负载负极    -> 5V 电源负极
 *   5V 电源负极 和 ESP32 GND 连在一起（共地）
 *
 * 注意：
 *   - 不要用 GPIO 直接驱动裸继电器线圈，必须用带驱动的模块。
 *   - 不要接 220V 市电！本代码只用于 5V/12V 低压负载。
 *   - 低电平触发模块：IN=LOW 吸合；高电平触发模块：IN=HIGH 吸合。
 *     下面用 RELAY_ACTIVE_LOW 选择。
 * ------------------------------------------------------------
 */

// ==================== 用户可以改的常量 ====================

#define RELAY_PIN 26           // 继电器 IN 接 GPIO26
#define RELAY_ACTIVE_LOW 1     // 1 = 低电平触发；0 = 高电平触发
#define ON_TIME_MS 3000UL      // 吸合持续时间
#define OFF_TIME_MS 3000UL     // 断开持续时间

// ==========================================================

// 让继电器吸合。
void relayOn() {
  if (RELAY_ACTIVE_LOW) {
    digitalWrite(RELAY_PIN, LOW);
  } else {
    digitalWrite(RELAY_PIN, HIGH);
  }
}

// 让继电器断开。
void relayOff() {
  if (RELAY_ACTIVE_LOW) {
    digitalWrite(RELAY_PIN, HIGH);
  } else {
    digitalWrite(RELAY_PIN, LOW);
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);

  Serial.println();
  Serial.println("=================================");
  Serial.println("Relay test start");
  Serial.print("IN pin: GPIO");
  Serial.println(RELAY_PIN);
  Serial.print("Trigger: ");
  Serial.println(RELAY_ACTIVE_LOW ? "LOW active" : "HIGH active");
  Serial.println("=================================");

  // 先把引脚设成输出，再确保继电器处于“断开”状态。
  pinMode(RELAY_PIN, OUTPUT);
  relayOff();
}

void loop() {
  Serial.println("继电器吸合");
  relayOn();
  delay(ON_TIME_MS);

  Serial.println("继电器断开");
  relayOff();
  delay(OFF_TIME_MS);
}
