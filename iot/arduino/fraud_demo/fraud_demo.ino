/*
 * Fraud-detection IoT demo terminal
 * ---------------------------------
 * Reads an RFID card, lets the user pick a scenario with two buttons, sends one
 * line over USB serial to iot_bridge.py, then shows the verdict on the LCD.
 *
 * Serial protocol (must match backend/src/iot_bridge.py):
 *   Arduino -> PC :  TAP:<UID>:<SCENARIO>        e.g.  TAP:04A3F2B1:B
 *   PC -> Arduino :  RESULT:<STATE>:<SCORE>       e.g.  RESULT:FROZEN:0.79
 *                    STATE in {APPROVED, FROZEN, UNKNOWN, TIMEOUT}
 *
 * Hardware (Arduino Uno):
 *   MFRC522 RFID : SDA/SS=10  SCK=13  MOSI=11  MISO=12  RST=9   (SPI, 3.3V!)
 *   LCD 16x2 I2C : SDA=A4  SCL=A5   (addr 0x27)
 *   Button A     : D2 -> GND  (normal purchase,  scenario "A")
 *   Button B     : D3 -> GND  (out-of-ordinary,  scenario "B")
 *   Buzzer       : D8 (optional)
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
#define BTN_A     2
#define BTN_B     3
#define BUZZER    8

MFRC522 rfid(SS_PIN, RST_PIN);
LiquidCrystal_I2C lcd(0x27, 16, 2);

const unsigned long VERDICT_TIMEOUT_MS = 9000;

void lcdShow(const char* l1, const char* l2) {
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print(l1);
  lcd.setCursor(0, 1); lcd.print(l2);
}

void beep(int ms, int times) {
  for (int i = 0; i < times; i++) {
    tone(BUZZER, 2000); delay(ms); noTone(BUZZER); delay(80);
  }
}

void setup() {
  Serial.begin(9600);
  SPI.begin();
  rfid.PCD_Init();
  lcd.init();
  lcd.backlight();
  pinMode(BTN_A, INPUT_PULLUP);
  pinMode(BTN_B, INPUT_PULLUP);
  pinMode(BUZZER, OUTPUT);
  lcdShow("Fraud Demo", "Tap a card...");
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

// Scenario = whichever button is held at tap time; default "B" (the dramatic
// out-of-ordinary one) so a bare tap still demonstrates a freeze.
char pickScenario() {
  if (digitalRead(BTN_A) == LOW) return 'A';
  if (digitalRead(BTN_B) == LOW) return 'B';
  return 'B';
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
  lcdShow("No response", "Check bridge PC");
  beep(400, 1);
}

void showVerdict(String line) {
  // line = RESULT:<STATE>:<SCORE>
  int p1 = line.indexOf(':');
  int p2 = line.indexOf(':', p1 + 1);
  String state = line.substring(p1 + 1, p2);
  String score = line.substring(p2 + 1);

  if (state == "FROZEN") {
    lcdShow("** FRAUD **", ("FROZEN s=" + score).c_str());
    beep(250, 3);
  } else if (state == "APPROVED") {
    lcdShow("Approved :)", ("score=" + score).c_str());
    beep(120, 1);
  } else if (state == "UNKNOWN") {
    lcdShow("Unknown card", "Map its UID");
    beep(400, 2);
  } else {
    lcdShow("Timeout", "Pipeline down?");
    beep(400, 1);
  }
  delay(3500);
  lcdShow("Fraud Demo", "Tap a card...");
}

void loop() {
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) return;

  String uid = readUID();
  char scn = pickScenario();

  Serial.print("TAP:");
  Serial.print(uid);
  Serial.print(":");
  Serial.println(scn);

  lcdShow("Processing...", (uid + " [" + scn + "]").c_str());
  waitForVerdict();

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
  delay(800);  // debounce: ignore the same card sitting on the reader
}
