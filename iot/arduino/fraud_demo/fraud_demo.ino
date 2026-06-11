/*
 * Fraud-detection IoT demo terminal
 * ---------------------------------
 * Reads an RFID card and sends ONE line over USB serial to iot_bridge.py, then
 * shows the verdict on the LCD + RGB LED + buzzer. The "what you're buying"
 * scenario (incl. amount) is chosen on the /shop web page; the bridge fires the
 * real transaction and sends the verdict (with the amount) back here.
 *
 * Serial protocol (must match iot/iot_bridge.py):
 *   Arduino -> PC :  TAP:<UID>                         e.g.  TAP:04A3F2B1
 *   PC -> Arduino :  RESULT:<STATE>:<SCORE>:<AMOUNT>    e.g.  RESULT:FROZEN:0.79:9500
 *                    STATE in {APPROVED, FROZEN, UNKNOWN, TIMEOUT}
 *
 * Hardware (Arduino Uno):
 *   I2C LCD 16x2 : SDA=A4  SCL=A5   (addr 0x27),  VCC=5V  GND=GND
 *   MFRC522 RFID : SDA/SS=10  SCK=13  MOSI=11  MISO=12  RST=9  3.3V (SPI, 3.3V!)
 *   RGB LED      : R=6  G=5  B=3   common cathode (common leg -> GND)
 *   Passive buzz : (+)=4   (-)=GND   (tone() for two distinct sounds)
 *
 * NOTE: tone() uses Timer2 (shared with PWM on pins 3 & 11). We drive the RGB
 * with digitalWrite (full on/off colours), which is unaffected by tone(), so
 * the buzzer and LED never fight over the timer.
 *
 * Libraries (Library Manager): "MFRC522" by GithubCommunity,
 *   "LiquidCrystal I2C" by Frank de Brabander.
 */

#include <SPI.h>
#include <MFRC522.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

#define RST_PIN   9
#define SS_PIN    10
#define LED_R     6
#define LED_G     5
#define LED_B     3
#define BUZZER    4

MFRC522 rfid(SS_PIN, RST_PIN);
LiquidCrystal_I2C lcd(0x27, 16, 2);

const unsigned long VERDICT_TIMEOUT_MS = 9000;

void setColor(bool r, bool g, bool b) {
  digitalWrite(LED_R, r ? HIGH : LOW);
  digitalWrite(LED_G, g ? HIGH : LOW);
  digitalWrite(LED_B, b ? HIGH : LOW);
}

void lcdShow(const char* l1, const char* l2) {
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print(l1);
  lcd.setCursor(0, 1); lcd.print(l2);
}

// One frequency for durMs, then a short gap (tone() is non-blocking).
void note(int freq, int durMs, int gapMs) {
  tone(BUZZER, freq, durMs);
  delay(durMs + gapMs);
}

// Short blip the instant a card is read, so the user knows the tap registered.
void beepDetected() {
  note(1568, 70, 0);   // quick G6 blip
  noTone(BUZZER);
}

// "dee-doo" payment-accepted chime (passive buzzer).
void chimeApproved() {
  note(2349, 140, 30);  // dee (D7)
  note(1760, 200, 0);   // doo (A6)
  noTone(BUZZER);
}

// Harsh repeated low buzz = rejected / frozen.
void chimeRejected() {
  for (int i = 0; i < 3; i++) note(440, 180, 90);  // A4 x3
  noTone(BUZZER);
}

// Return to the idle "ready" state: blue LED, prompt on the LCD.
void goIdle() {
  setColor(false, false, true);   // blue = ready
  lcdShow("Fraud Demo", "Tap a card...");
}

void setup() {
  Serial.begin(9600);
  SPI.begin();
  rfid.PCD_Init();
  lcd.init();
  lcd.backlight();
  pinMode(LED_R, OUTPUT);
  pinMode(LED_G, OUTPUT);
  pinMode(LED_B, OUTPUT);
  pinMode(BUZZER, OUTPUT);
  goIdle();
  Serial.println("READY");
}

// Read the card UID as uppercase hex with no separators (e.g. 04A3F2B1),
// matching the keys in iot_bridge.py CARD_MAP.
String readUID() {
  String uid = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(rfid.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();
  return uid;
}

void showVerdict(String line) {
  // line = RESULT:<STATE>:<SCORE>:<AMOUNT>
  int p1 = line.indexOf(':');
  int p2 = line.indexOf(':', p1 + 1);
  int p3 = line.indexOf(':', p2 + 1);
  String state  = line.substring(p1 + 1, p2);
  String amount = (p3 > 0) ? line.substring(p3 + 1) : "";
  String amtLine = amount.length() ? ("RM" + amount) : "";

  if (state == "APPROVED") {
    setColor(false, true, false);             // green
    lcdShow("SUCCESSFUL", amtLine.c_str());
    chimeApproved();
  } else if (state == "FROZEN") {
    setColor(true, false, false);             // red
    lcdShow("REJECTED", amtLine.c_str());
    chimeRejected();
  } else if (state == "NOITEM") {
    setColor(false, false, true);             // blue (not a fraud — just nothing picked)
    lcdShow("Pick an item", "on the screen");
    note(294, 130, 70); note(294, 130, 0);    // low double "nope"
    noTone(BUZZER);
  } else if (state == "UNKNOWN") {
    setColor(true, false, false);             // red
    lcdShow("Unknown card", "Map its UID");
    note(440, 400, 0); noTone(BUZZER);
  } else {                                    // TIMEOUT / anything else
    setColor(true, false, false);             // red
    lcdShow("Timeout", "Pipeline down?");
    note(440, 400, 0); noTone(BUZZER);
  }
  delay(3500);
  goIdle();
}

void waitForVerdict() {
  unsigned long start = millis();
  String line = "";
  while (millis() - start < VERDICT_TIMEOUT_MS) {
    while (Serial.available()) {
      char c = Serial.read();
      if (c == '\n') {
        if (line.startsWith("RESULT:")) { showVerdict(line); return; }
        line = "";
      } else if (c != '\r') {
        line += c;
      }
    }
  }
  setColor(true, false, false);
  lcdShow("No response", "Check bridge PC");
  note(440, 400, 0); noTone(BUZZER);
  delay(2000);
  goIdle();
}

void loop() {
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) return;

  String uid = readUID();
  beepDetected();                        // immediate "card read" feedback

  Serial.print("TAP:");
  Serial.println(uid);

  setColor(false, false, true);          // blue while we wait
  lcdShow("Processing...", uid.c_str());
  waitForVerdict();

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
  delay(800);  // debounce: ignore the same card sitting on the reader
}
