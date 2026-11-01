/*
 * 01_blink.ino
 * ------------------------------------------------------------
 * 作用：让 ESP32 开发板上的板载 LED 每秒闪一次。
 *
 * 这是整个教程的第一步，用来验证：
 *   1. USB 线能传数据（不是只能充电的线）；
 *   2. 电脑装好了 USB 转串口驱动，能看到 COM 口；
 *   3. Arduino IDE 选对了板子型号和端口；
 *   4. 代码能编译、能上传、板子能运行。
 *
 * 接线：不需要任何杜邦线，只插 USB。
 *
 * 注意：
 *   - 多数 ESP32 DevKit V1 的板载 LED 接在 GPIO2，高电平点亮。
 *   - 少数板子是低电平点亮；如果灯不亮但上传成功，
 *     把下面的 LED_ON / LED_OFF 对调。
 *   - 如果你的板子 LED 不在 GPIO2，查商品页或原理图，
 *     把 LED_PIN 改成实际引脚。
 * ------------------------------------------------------------
 */

// ==================== 用户可以改的常量 ====================

#define LED_PIN 2                  // 板载 LED 连接的 GPIO 编号
#define LED_ON HIGH                // 点亮电平：高电平点亮就写 HIGH
#define LED_OFF LOW                // 熄灭电平：高电平点亮就写 LOW
#define BLINK_INTERVAL_MS 1000UL   // 亮/灭各持续多久，单位毫秒

// ==========================================================

void setup() {
  // 打开串口，波特率 115200。
  // 打开 Arduino IDE 的“串口监视器”时，也要选 115200，
  // 两边不一致就会看到乱码。
  Serial.begin(115200);

  // 等一小会儿，让串口稳定，也方便你看到板子刚启动时的输出。
  delay(300);

  Serial.println();
  Serial.println("=================================");
  Serial.println("ESP32 blink start");
  Serial.print("LED pin: GPIO");
  Serial.println(LED_PIN);
  Serial.println("=================================");

  // 把 LED_PIN 设成“输出”模式。
  // 只有设成 OUTPUT，digitalWrite 才能真正改变引脚电压。
  pinMode(LED_PIN, OUTPUT);

  // 上电先保证 LED 是灭的，避免看起来像“卡住了”。
  digitalWrite(LED_PIN, LED_OFF);
}

void loop() {
  // 点亮 LED
  digitalWrite(LED_PIN, LED_ON);
  Serial.println("LED ON");
  delay(BLINK_INTERVAL_MS);

  // 熄灭 LED
  digitalWrite(LED_PIN, LED_OFF);
  Serial.println("LED OFF");
  delay(BLINK_INTERVAL_MS);

  // loop() 会被 Arduino 框架自动反复调用，
  // 所以上面这段会一直循环：亮 1 秒、灭 1 秒。
}
