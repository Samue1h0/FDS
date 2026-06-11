"""
IoT bridge: Arduino (RFID + LCD) <--USB serial--> fraud pipeline.

One RFID tap == one transaction injected into the SAME Kafka pipeline the
dashboard/demo uses. Nothing here is a special-case fraud path:

  Arduino sends   "TAP:<UID>"  over serial (one card tap)
        -> bridge maps UID -> a real KYC cardholder (with spending history)
        -> bridge reads the scenario the /shop page armed (GET /api/iot/cart),
           or falls back to the default dramatic scenario if nothing's armed
        -> builds a txn message (exact field names the pipeline expects)
        -> produces to Kafka topic "raw-transactions"
        -> kafka_fraud_consumer scores it, saves it, freezes-on-fraud,
           and pushes the live SSE that lights up the dashboard
        -> bridge polls GET /api/transactions?search=<id> for the verdict
        -> bridge sends "RESULT:<APPROVED|FROZEN>:<score>:<amount>" back to the
           Arduino (LCD shows SUCCESSFUL/REJECTED + RM amount; LED green/red)

Usage (run inside WSL, where Kafka/API live):
  python3 iot_bridge.py --port /dev/ttyACM0     # live: listen for taps
  python3 iot_bridge.py --watch                 # tail new IoT txns (no HW)
  python3 iot_bridge.py --simulate 04A3F2B1:B   # fire one tap (no HW)

The cardholders below are the demo "victims" — they already have baseline
history in KYC_Data.csv, so an out-of-ordinary tap actually reads as unusual.
Edit CARD_MAP so each physical card's UID points at the identity you want.
"""

import os
import sys
import json
import time
import argparse
import urllib.request
from datetime import datetime

from confluent_kafka import Producer

BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP", "localhost:9092")
TOPIC             = "raw-transactions"
API_BASE          = os.getenv("FASTAPI_URL", "http://localhost:8000")
BAUD              = int(os.getenv("IOT_BAUD", "9600"))
VERDICT_TIMEOUT   = 8.0      # seconds to wait for the consumer to score
POLL_INTERVAL     = 0.3

# ── Cardholder identities (must exist in backend KYC_Data.csv) ───────────────
# Self-contained copies of the demo victims so this folder doesn't import from
# backend/src. The IC Number is what the pipeline matches against KYC history.
def _who(name, ic, card, expiry):
    return {"Cardholder Name": name, "IC Number": ic,
            "Card Number": card, "Card Expiration Date": expiry}

MARCUS = _who("Marcus Pillai",   "981122-03-9653", "5234567890123456", "30-Sep")
DANIEL = _who("Daniel Abdullah", "720604-08-9079", "4587654321098765", "31-Mar")
SARAH  = _who("Sarah Ismail",    "861124-06-8252", "5566778899001122", "30-Nov")
YING   = _who("Ying Yap",        "040206-01-4318", "4111222233334444", "31-Aug")
TAN    = _who("Tan Cheong",      "010216-09-5735", "5599887766554433", "30-Jun")
RAJ    = _who("Raj Singh",       "001209-09-2839", "5500110022003300", "31-May")
ZHEN   = _who("Zhen Sim",        "860522-06-2393", "4400550066007700", "30-Apr")
ARJUN  = _who("Arjun Yusof",     "830117-07-8028", "5102030405060708", "30-Oct")

IP_MY       = "110.6.33.141"
IP_FOREIGN  = "203.0.113.42"
DEV_MOBILE  = "Mobile (Android - Chrome)"
DEV_DESKTOP = "Desktop (Chrome)"

# ── UID -> cardholder ────────────────────────────────────────────────────────
# Replace the example UIDs with what your reader prints for each physical card.
# (Run --port, tap a card, read the "unknown UID" line in the log to learn it.)
CARD_MAP = {
    "04A3F2B1": MARCUS,
    "04B1C2D3": DANIEL,
    "04C4E5F6": SARAH,
}
# Used when a tapped card isn't in CARD_MAP yet — keeps the demo alive and the
# log tells you the UID to add. Set to None to instead reject unknown cards.
DEFAULT_PROFILE = MARCUS

# ── Scenarios (which button the participant pressed) ─────────────────────────
# "A" = an ordinary local purchase (baseline, should be APPROVED)
# "B" = the out-of-ordinary one (high value, foreign) -> high_value rule + ML
SCENARIOS = {
    "A": dict(amount=42.00,   merchant="Tesco",       mcc="5411",
              mode="In-Person", location="Kuala Lumpur",
              ip=IP_MY,      device=DEV_MOBILE,  is_fraud=0),
    "B": dict(amount=9500.00, merchant="LuxuryWatch", mcc="5944",
              mode="Online",    location="Dubai, UAE",
              ip=IP_FOREIGN, device=DEV_DESKTOP, is_fraud=1),
}
DEFAULT_SCENARIO = "B"


def _build_message(profile: dict, scn: dict, txn_id: str) -> dict:
    """Assemble a raw-transaction message matching the pipeline's schema."""
    return {
        "Transaction ID": txn_id,
        # Must match the scorer's enrichment parser (fraud_scorer
        # ._build_enriched_row uses format="%d/%m/%Y %H:%M"); any other
        # format coerces to NaT and the txn is REJECTED.
        "Date & Time":    datetime.now().strftime("%d/%m/%Y %H:%M"),
        "Amount (MYR)":   float(scn["amount"]),
        "Merchant Name":  scn["merchant"],
        "Merchant Category Code (MCC)": scn["mcc"],
        "Mode":           scn["mode"],
        "Location":       scn["location"],
        "IP Address":     scn["ip"],
        "Device Information": scn["device"],
        "is_fraud":       scn["is_fraud"],   # intended label; the model still decides
        "is_demo":        True,              # so /internal/reset-demo-data wipes IoT taps
        **profile,
    }


def _api_get(path: str):
    with urllib.request.urlopen(f"{API_BASE}{path}", timeout=2) as r:
        return json.loads(r.read().decode())


def _api_delete(path: str):
    req = urllib.request.Request(f"{API_BASE}{path}", method="DELETE")
    with urllib.request.urlopen(req, timeout=2) as r:
        return json.loads(r.read().decode())


def _fetch_cart():
    """Read the scenario the /shop page armed (or None if nothing's armed)."""
    try:
        return _api_get("/api/iot/cart").get("cart")
    except Exception as e:
        print(f"  cart fetch error: {e}", file=sys.stderr)
        return None


def _clear_cart():
    try:
        _api_delete("/api/iot/cart")
    except Exception:
        pass


def _scn_from_cart(cart: dict) -> dict:
    """Turn the page's semantic cart into the scorer-shaped scenario dict.
    foreign -> foreign IP + cross-location; online -> Online mode + desktop."""
    foreign = bool(cart.get("foreign"))
    online  = bool(cart.get("online"))
    return dict(
        amount=float(cart["amount"]),
        merchant=cart.get("merchant", "Unknown"),
        mcc=str(cart.get("mcc", "5999")),
        mode="Online" if online else "In-Person",
        location=cart.get("location", "Kuala Lumpur"),
        ip=IP_FOREIGN if foreign else IP_MY,
        device=DEV_DESKTOP if online else DEV_MOBILE,
        is_fraud=1 if foreign else 0,   # intended label only; the model decides
    )


def _poll_verdict(txn_id: str):
    """Poll the private-record list (saved synchronously by the consumer) for
    this txn's verdict. Returns (label, score, frozen) or None on timeout."""
    deadline = time.time() + VERDICT_TIMEOUT
    while time.time() < deadline:
        try:
            data = _api_get(f"/api/transactions?search={txn_id}&limit=1")
            for t in data.get("transactions", []):
                if t.get("transaction_id") == txn_id and t.get("predicted_label") not in (None, "", "pending"):
                    return t["predicted_label"], t.get("fraud_score", 0.0), t.get("card_frozen", False)
        except Exception as e:
            print(f"  poll error: {e}", file=sys.stderr)
        time.sleep(POLL_INTERVAL)
    return None


def _handle_tap(producer: Producer, ser, uid: str, scn: dict):
    profile = CARD_MAP.get(uid.upper())
    if profile is None:
        if DEFAULT_PROFILE is None:
            print(f"[tap] UNKNOWN card {uid} — rejected (add it to CARD_MAP)")
            _send(ser, f"RESULT:UNKNOWN:0:{scn['amount']:.0f}")
            return
        print(f"[tap] UNKNOWN card {uid} — falling back to default profile "
              f"({DEFAULT_PROFILE['Cardholder Name']}); add it to CARD_MAP")
        profile = DEFAULT_PROFILE

    txn_id = f"IOT{int(time.time() * 1000)}"
    message = _build_message(profile, scn, txn_id)
    print(f"[tap] {uid} -> {profile['Cardholder Name']} | "
          f"RM{scn['amount']:.2f} @ {scn['location']} | {txn_id}")

    producer.produce(TOPIC, key=txn_id, value=json.dumps(message))
    producer.flush(5)

    verdict = _poll_verdict(txn_id)
    if verdict is None:
        print("  no verdict (timeout) — is the fraud consumer running?")
        _send(ser, f"RESULT:TIMEOUT:0:{scn['amount']:.0f}")
        return

    label, score, frozen = verdict
    # Realistic behaviour: a frozen card declines EVERYTHING, so once a fraud has
    # frozen this victim's card every later tap reads FROZEN until the operator
    # resets the demo (Reset button on /shop -> /internal/reset-demo-data, which
    # wipes demo taps and unfreezes the card to start a fresh run).
    state = "FROZEN" if (label == "FRAUD" or frozen) else "APPROVED"
    print(f"  verdict: {label} score={score:.3f} card_frozen={frozen} -> {state}")
    _send(ser, f"RESULT:{state}:{score:.2f}:{scn['amount']:.0f}")


def _send(ser, line: str):
    if ser is not None:
        ser.write((line + "\n").encode())


def _open_serial(port: str):
    import serial  # local import so --watch/--simulate work without a port
    ser = serial.Serial(port, BAUD, timeout=1)
    time.sleep(2)  # Arduino resets when the port opens; let it boot
    ser.reset_input_buffer()
    return ser


def run_watch():
    """Tail new IoT transactions as they hit the backend (no hardware needed).
    Handy as a second terminal while you scan cards."""
    try:
        sys.stdout.reconfigure(line_buffering=True)  # print live even when piped
    except Exception:
        pass
    print(f"[watch] polling {API_BASE} for new IOT* transactions... (Ctrl-C to quit)\n")
    print(f"  {'time':8} {'txn id':17} {'cardholder':16} {'amount':>10}  {'verdict':9} {'score':>5}  where")
    seen = set()
    # Prime with whatever already exists so we only print genuinely new taps.
    try:
        for t in _api_get("/api/transactions?search=IOT&limit=100").get("transactions", []):
            seen.add(t["transaction_id"])
    except Exception:
        pass
    while True:
        try:
            data = _api_get("/api/transactions?search=IOT&limit=20")
            # API returns newest-first; print oldest-first among the new ones.
            for t in reversed(data.get("transactions", [])):
                tid = t["transaction_id"]
                if tid in seen:
                    continue
                seen.add(tid)
                frozen = t.get("card_frozen")
                verdict = "FROZEN" if (t.get("predicted_label") == "FRAUD" or frozen) else "APPROVED"
                mark = "🔴" if verdict == "FROZEN" else "🟢"
                print(f"  {datetime.now():%H:%M:%S} {tid:17} "
                      f"{(t.get('cardholder_name') or t.get('customer_ref') or '')[:16]:16} "
                      f"RM{t.get('amount_myr', 0):>8.2f}  {mark}{verdict:8} "
                      f"{t.get('fraud_score', 0):>5.2f}  {t.get('location', '')}")
        except Exception as e:
            print(f"  watch error: {e}", file=sys.stderr)
        time.sleep(1.0)


def main():
    ap = argparse.ArgumentParser(description="RFID/Arduino -> fraud pipeline bridge")
    ap.add_argument("--port", default=os.getenv("IOT_SERIAL_PORT", "/dev/ttyACM0"),
                    help="serial port (e.g. /dev/ttyACM0, or COM7 on Windows Python)")
    ap.add_argument("--watch", action="store_true",
                    help="tail new IoT transactions as they hit the backend (no hardware)")
    ap.add_argument("--simulate", metavar="UID:SCN",
                    help="fire one synthetic tap and exit (no hardware needed)")
    args = ap.parse_args()

    if args.watch:
        try:
            run_watch()
        except KeyboardInterrupt:
            print("\n[watch] stopped.")
        return

    producer = Producer({"bootstrap.servers": BOOTSTRAP_SERVERS})

    if args.simulate:
        # --simulate UID:SCN still uses the built-in A/B scenarios (no shop page).
        uid, _, scn = args.simulate.partition(":")
        scn_dict = dict(SCENARIOS.get((scn or DEFAULT_SCENARIO).upper(), SCENARIOS[DEFAULT_SCENARIO]))
        _handle_tap(producer, None, uid, scn_dict)
        return

    ser = _open_serial(args.port)
    print(f"[bridge] listening on {args.port} @ {BAUD} | Kafka {BOOTSTRAP_SERVERS} | API {API_BASE}")
    print("[bridge] waiting for taps... (Ctrl-C to quit)")
    try:
        while True:
            raw = ser.readline().decode(errors="ignore").strip()
            if not raw:
                continue
            if not raw.startswith("TAP:"):
                print(f"  (arduino) {raw}")  # debug/status lines from the sketch
                continue
            parts = raw.split(":")            # TAP:<UID>  (scenario now comes from the shop page)
            uid = parts[1] if len(parts) > 1 else ""
            if not uid:
                continue
            # A purchase MUST be chosen on the /shop page first. With no armed
            # cart we refuse the tap — nothing is produced — and tell the
            # terminal to prompt the user to pick something on screen.
            cart = _fetch_cart()
            if not cart:
                print("[tap] no armed cart — refused (pick an item on /shop first)")
                _send(ser, "RESULT:NOITEM:0:0")
                continue
            scn = _scn_from_cart(cart)
            print(f"[tap] armed cart: {cart.get('label')} RM{scn['amount']:.2f} @ {scn['location']}")
            _handle_tap(producer, ser, uid, scn)
            _clear_cart()   # consume so the next bare tap doesn't replay it
    except KeyboardInterrupt:
        print("\n[bridge] stopped.")
    finally:
        ser.close()


if __name__ == "__main__":
    main()
