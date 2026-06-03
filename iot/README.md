# IoT demo terminal

Physical front-end for the fraud pipeline: tap an RFID card on an Arduino, a
transaction is injected into the **same Kafka pipeline** the dashboard uses,
and the verdict (`APPROVED` / `FROZEN`) comes back to the LCD — while the
dashboard lights up live via SSE. No special fraud path; the IoT tap is a real
transaction.

```
[RFID card] --tap--> [Arduino Uno] --USB serial--> [iot_bridge.py]
                                                        |-> Kafka raw-transactions
                                                        |-> consumer scores + freezes
                                                        |-> poll API for verdict
                                                        '-> RESULT back to LCD
```

## Files
- `iot_bridge.py` — laptop-side bridge (serial ⇄ Kafka ⇄ API). Self-contained.
- `arduino/fraud_demo/fraud_demo.ino` — the Arduino sketch (reader + LCD + buttons).

## Prereqs
Backend stack must be running (Kafka, `kafka_fraud_consumer`, FastAPI on :8000).
Python deps: `pip install pyserial confluent-kafka`.

## Run (inside WSL)
```bash
python3 iot_bridge.py --port /dev/ttyACM0   # live: listen for card taps
python3 iot_bridge.py --watch               # tail new IoT txns (2nd terminal, no HW)
python3 iot_bridge.py --simulate 04A3F2B1:B # fire one tap with no hardware
```

## Connecting the Arduino (COM7 → WSL via usbipd)
WSL2 does **not** map Windows COM ports to `/dev/ttySx`. Flash first, then attach:
1. Flash `fraud_demo.ino` from the **Windows** Arduino IDE (Board = Uno, Port = COM7).
2. Windows admin PowerShell: `usbipd list` then `usbipd attach --wsl --busid <BUSID>`.
3. In WSL: `ls /dev/ttyACM*` → expect `/dev/ttyACM0`.
   (Permission denied? `sudo usermod -aG dialout $USER`, then `wsl --shutdown` and reopen.)

## Cards & scenarios
- **Card = who** (cardholder identity). One card is enough to test.
- **Button = what** — A = normal local purchase (→ APPROVED), B = out-of-ordinary
  high-value foreign txn (→ FRAUD + freeze). No button held defaults to B.

The first tap of an unmapped card logs its real UID; paste it into `CARD_MAP`
at the top of `iot_bridge.py` to give it a proper identity.

## Wiring (Arduino Uno)
| Part | Pins |
|------|------|
| MFRC522 RFID | SDA/SS=10, SCK=13, MOSI=11, MISO=12, RST=9 (3.3V!) |
| LCD 16x2 I2C | SDA=A4, SCL=A5 (addr 0x27) |
| Button A / B | D2 / D3 → GND |
| Buzzer | D8 |
