"""
Curated 9-scene demo deck (~80 transactions) that exercises every fraud rule
plus the auto-freeze + post-freeze-attempt flow.

Each entry stores only RELATIVE timing via `offset_seconds` — the producer
computes real timestamps at runtime as `T0 + offset_seconds`, where
T0 = MAX(timestamp) of non-demo data in the DB (or now() if empty).
This keeps demo runs reproducible: rerun = wipe rows where is_demo=true,
recompute T0, replay — demo always lands in the same window.

Story beats:
  Scene 1  — Quiet morning (15 legit, baseline)
  Scene 2  — High-value attack on Marcus → freeze + post-freeze retries
  Scene 3  — Normal traffic resumes (10 legit)
  Scene 4  — Impossible travel on Daniel KL→Tokyo (5 txns, freeze mid-scene)
  Scene 5  — Normal traffic (8 legit)
  Scene 6  — Smurfing on Sarah (8 small txns, freeze on 5th)
  Scene 7  — ML-only catches (no rule fires; just model)
  Scene 8  — Income mismatch + student + retiree frauds (12 mixed)
  Scene 9  — Wind-down (10 legit)
"""

# ── Demo "victims" (must exist in KYC_Data.csv) ──────────────────────────────
MARCUS = {
    "Cardholder Name":      "Marcus Pillai",
    "IC Number":            "981122-03-9653",
    "Card Number":          "5234567890123456",
    "Card Expiration Date": "30-Sep",
}
DANIEL = {
    "Cardholder Name":      "Daniel Abdullah",
    "IC Number":            "720604-08-9079",
    "Card Number":          "4587654321098765",
    "Card Expiration Date": "31-Mar",
}
SARAH = {
    "Cardholder Name":      "Sarah Ismail",
    "IC Number":            "861124-06-8252",
    "Card Number":          "5566778899001122",
    "Card Expiration Date": "30-Nov",
}
YING = {
    "Cardholder Name":      "Ying Yap",
    "IC Number":            "040206-01-4318",
    "Card Number":          "4111222233334444",
    "Card Expiration Date": "31-Aug",
}
TAN = {  # Low-income, not yet frozen — used in scene 8 income-mismatch
    "Cardholder Name":      "Tan Cheong",
    "IC Number":            "010216-09-5735",
    "Card Number":          "5599887766554433",
    "Card Expiration Date": "30-Jun",
}
RAJ = {  # Retired, no income
    "Cardholder Name":      "Raj Singh",
    "IC Number":            "001209-09-2839",
    "Card Number":          "5500110022003300",
    "Card Expiration Date": "31-May",
}
ZHEN = {  # Unemployed
    "Cardholder Name":      "Zhen Sim",
    "IC Number":            "860522-06-2393",
    "Card Number":          "4400550066007700",
    "Card Expiration Date": "30-Apr",
}
ARJUN = {  # Retiree, used for normal traffic
    "Cardholder Name":      "Arjun Yusof",
    "IC Number":            "830117-07-8028",
    "Card Number":          "5102030405060708",
    "Card Expiration Date": "30-Oct",
}

# Common device/IP placeholders
DEV_MOBILE  = "Mobile (Android - Chrome)"
DEV_IOS     = "Mobile (iOS - Safari)"
DEV_DESKTOP = "Desktop (Chrome)"
DEV_EDGE    = "Desktop (Edge)"
IP_MY       = "110.6.33.141"
IP_FOREIGN  = "203.0.113.42"


def _row(offset, victim, amount, merchant, mcc, mode, location, ip, device, is_fraud):
    """Helper to build a deck row."""
    return {
        "offset_seconds": offset,
        "Amount (MYR)":   amount,
        "Merchant Name":  merchant,
        "Merchant Category Code (MCC)": mcc,
        "Mode":           mode,
        "Location":       location,
        "IP Address":     ip,
        "Device Information": device,
        "is_fraud":       is_fraud,
        **victim,
    }


# ── Scene 1: Quiet morning — 15 legit baseline ───────────────────────────────
SCENE_1 = [
    _row(    0, MARCUS, 12.50, "Starbucks",     "5814", "In-Person", "Kuala Lumpur", IP_MY, DEV_MOBILE, 0),
    _row( 1200, DANIEL, 8.90,  "7-Eleven",      "5411", "In-Person", "Petaling Jaya", IP_MY, DEV_MOBILE, 0),
    _row( 2400, SARAH,  45.00, "Tesco",         "5411", "In-Person", "Ipoh", IP_MY, DEV_MOBILE, 0),
    _row( 3600, ARJUN,  120.30,"Shell Petrol",  "5541", "In-Person", "Kuala Lumpur", IP_MY, DEV_IOS, 0),
    _row( 5400, YING,   18.50, "McDonald's",    "5814", "In-Person", "Petaling Jaya", IP_MY, DEV_MOBILE, 0),
    _row( 7200, MARCUS, 240.00,"Lazada",        "5942", "Online",    "Kuala Lumpur", IP_MY, DEV_DESKTOP, 0),
    _row( 9000, ZHEN,   32.80, "Grab",          "4121", "In-Person", "Petaling Jaya", IP_MY, DEV_MOBILE, 0),
    _row(10800, DANIEL, 178.40,"Watsons",       "5912", "In-Person", "Pasir Mas", IP_MY, DEV_MOBILE, 0),
    _row(12600, SARAH,  22.10, "KFC",           "5814", "In-Person", "Ipoh", IP_MY, DEV_IOS, 0),
    _row(14400, MARCUS, 65.00, "Touch n Go",    "4111", "In-Person", "Kuala Lumpur", IP_MY, DEV_MOBILE, 0),
    _row(16200, ARJUN,  88.20, "Tesco",         "5411", "In-Person", "Kuala Lumpur", IP_MY, DEV_MOBILE, 0),
    _row(18000, YING,   24.50, "Old Town",      "5814", "In-Person", "Petaling Jaya", IP_MY, DEV_MOBILE, 0),
    _row(19800, DANIEL, 410.00,"Senheng",       "5732", "In-Person", "Pasir Mas", IP_MY, DEV_IOS, 0),
    _row(21600, MARCUS, 28.00, "Boost Juice",   "5814", "In-Person", "Kuala Lumpur", IP_MY, DEV_MOBILE, 0),
    _row(23400, ZHEN,   15.20, "Grab",          "4121", "In-Person", "Petaling Jaya", IP_MY, DEV_MOBILE, 0),
]

# ── Scene 2: High-value attack on Marcus (3 frauds, freeze on 1st) ───────────
# Marcus's avg spend is ~RM 100 (legit history) — RM 9500 = high_value rule fires.
SCENE_2 = [
    _row(54000, MARCUS, 9500.00, "LuxuryWatch",    "5944", "Online", "Dubai, UAE", IP_FOREIGN, DEV_DESKTOP, 1),  # FRAUD → freezes card
    _row(54180, MARCUS, 4200.00, "LuxuryWatch",    "5944", "Online", "Dubai, UAE", IP_FOREIGN, DEV_DESKTOP, 1),  # post-freeze retry
    _row(54420, MARCUS, 6800.00, "OnlineCasino",   "7995", "Online", "Macau",      IP_FOREIGN, DEV_DESKTOP, 1),  # post-freeze retry
]

# ── Scene 3: Normal traffic resumes (10 legit) ───────────────────────────────
SCENE_3 = [
    _row(57600, DANIEL, 52.00, "Petronas",     "5541", "In-Person", "Pasir Mas", IP_MY, DEV_MOBILE, 0),
    _row(61200, SARAH,  18.50, "Maybank ATM",  "6011", "In-Person", "Ipoh", IP_MY, DEV_MOBILE, 0),
    _row(64800, YING,   12.00, "Starbucks",    "5814", "In-Person", "Petaling Jaya", IP_MY, DEV_MOBILE, 0),
    _row(72000, ARJUN,  165.30,"AEON",         "5411", "In-Person", "Kuala Lumpur", IP_MY, DEV_IOS, 0),
    _row(75600, ZHEN,   24.80, "7-Eleven",     "5411", "In-Person", "Petaling Jaya", IP_MY, DEV_MOBILE, 0),
    _row(79200, DANIEL, 95.00, "Domino's Pizza","5814","Online",    "Pasir Mas", IP_MY, DEV_DESKTOP, 0),
    _row(82800, SARAH,  42.00, "Shopee",       "5942", "Online",    "Ipoh", IP_MY, DEV_MOBILE, 0),
    _row(86400, YING,   16.50, "Tealive",      "5814", "In-Person", "Petaling Jaya", IP_MY, DEV_MOBILE, 0),
    _row(93600, ARJUN,  78.00, "Shell Petrol", "5541", "In-Person", "Kuala Lumpur", IP_MY, DEV_IOS, 0),
    _row(100800,DANIEL, 320.00,"Harvey Norman","5722", "In-Person", "Pasir Mas", IP_MY, DEV_IOS, 0),
]

# ── Scene 4: Impossible travel on Daniel (5 txns) ────────────────────────────
SCENE_4 = [
    _row(108000, DANIEL, 80.00,  "Starbucks",      "5814", "In-Person", "Pasir Mas",     IP_MY,      DEV_MOBILE, 0),  # legit, sets last-loc
    _row(108300, DANIEL, 350.00, "Tokyo Sushi",    "5814", "In-Person", "Tokyo, Japan",  IP_FOREIGN, DEV_MOBILE, 1),  # cross-location FRAUD
    _row(108480, DANIEL, 420.00, "DutyFreeShop",   "5309", "In-Person", "Tokyo, Japan",  IP_FOREIGN, DEV_MOBILE, 1),
    _row(108600, DANIEL, 680.00, "ElectronicsJP",  "5732", "In-Person", "Tokyo, Japan",  IP_FOREIGN, DEV_MOBILE, 1),  # freezes here
    _row(108900, DANIEL, 200.00, "Watsons",        "5912", "In-Person", "Pasir Mas",     IP_MY,      DEV_MOBILE, 1),  # post-freeze attempt
]

# ── Scene 5: Normal traffic (8 legit) ────────────────────────────────────────
SCENE_5 = [
    _row(115200, ARJUN,  92.00, "Tesco",         "5411", "In-Person", "Kuala Lumpur", IP_MY, DEV_IOS, 0),
    _row(122400, ZHEN,   28.00, "Grab",          "4121", "In-Person", "Petaling Jaya", IP_MY, DEV_MOBILE, 0),
    _row(129600, YING,   14.50, "Tealive",       "5814", "In-Person", "Petaling Jaya", IP_MY, DEV_MOBILE, 0),
    _row(136800, MARCUS, 38.00, "Boost Juice",   "5814", "In-Person", "Kuala Lumpur", IP_MY, DEV_MOBILE, 0),  # card frozen → still inserted as FRAUD by ML/rules
    _row(144000, TAN,    55.00, "AEON",          "5411", "In-Person", "Kuala Lumpur", IP_MY, DEV_MOBILE, 0),
    _row(151200, ARJUN,  104.20,"Shell Petrol",  "5541", "In-Person", "Kuala Lumpur", IP_MY, DEV_IOS, 0),
    _row(158400, RAJ,    66.00, "Tesco",         "5411", "In-Person", "Kuala Lumpur", IP_MY, DEV_IOS, 0),
    _row(165600, ZHEN,   19.00, "7-Eleven",      "5411", "In-Person", "Petaling Jaya", IP_MY, DEV_MOBILE, 0),
]

# ── Scene 6: Smurfing burst on Sarah (8 small txns within 1h, freeze on 5th) ─
# Rule: ≥3 txns < RM10 within a 15-min window → "Repeated small transactions"
SCENE_6 = [
    _row(172800, SARAH, 4.50, "ConvenienceStore", "5411", "In-Person", "Ipoh", IP_MY, DEV_MOBILE, 0),  # txn 1, looks normal
    _row(172920, SARAH, 6.00, "ConvenienceStore", "5411", "In-Person", "Ipoh", IP_MY, DEV_MOBILE, 0),  # txn 2
    _row(173040, SARAH, 5.50, "ConvenienceStore", "5411", "In-Person", "Ipoh", IP_MY, DEV_MOBILE, 1),  # txn 3 → rule fires
    _row(173160, SARAH, 7.00, "ConvenienceStore", "5411", "In-Person", "Ipoh", IP_MY, DEV_MOBILE, 1),
    _row(173280, SARAH, 8.50, "ConvenienceStore", "5411", "In-Person", "Ipoh", IP_MY, DEV_MOBILE, 1),  # freezes here (5th)
    _row(173400, SARAH, 9.00, "ConvenienceStore", "5411", "In-Person", "Ipoh", IP_MY, DEV_MOBILE, 1),  # post-freeze
    _row(173520, SARAH, 6.50, "ConvenienceStore", "5411", "In-Person", "Ipoh", IP_MY, DEV_MOBILE, 1),  # post-freeze
    _row(173640, SARAH, 7.50, "ConvenienceStore", "5411", "In-Person", "Ipoh", IP_MY, DEV_MOBILE, 1),  # post-freeze
]

# ── Scene 7: ML-only catches (no rule fires; model flags suspicious patterns)
# These are odd-shape txns: foreign+online+moderate amount, unusual MCC for the customer.
# Rules don't fire because amounts are below thresholds and no velocity violation.
SCENE_7 = [
    _row(190800, ARJUN, 1850.00, "CryptoExchange", "5999", "Online", "Singapore",      IP_FOREIGN, DEV_DESKTOP, 1),
    _row(194400, TAN,   480.00,  "OnlineGambling", "7995", "Online", "Manila",         IP_FOREIGN, DEV_DESKTOP, 1),
    _row(198000, ZHEN,  680.00,  "VPNService",     "5816", "Online", "Hong Kong",      IP_FOREIGN, DEV_DESKTOP, 1),
    _row(205200, ARJUN, 2200.00, "GiftCardSeller", "5947", "Online", "Bangkok",        IP_FOREIGN, DEV_EDGE,    1),
    _row(212400, TAN,   920.00,  "DigitalGoods",   "5816", "Online", "Ho Chi Minh",    IP_FOREIGN, DEV_DESKTOP, 1),
]

# ── Scene 8: Income mismatch + student + retiree frauds (12 mixed) ───────────
SCENE_8 = [
    # legit warm-up
    _row(216000, YING,  22.00,    "Tealive",       "5814", "In-Person", "Petaling Jaya", IP_MY, DEV_MOBILE, 0),
    _row(219600, ARJUN, 88.00,    "Tesco",         "5411", "In-Person", "Kuala Lumpur", IP_MY, DEV_IOS, 0),
    # Student high-spend: Ying (Student) > RM 3000 → rule fires + ML
    _row(223200, YING,  3500.00,  "LuxuryBoutique","5651", "In-Person", "Kuala Lumpur", IP_MY, DEV_IOS, 1),  # freezes Ying
    _row(225000, YING,  4200.00,  "LuxuryBoutique","5651", "In-Person", "Kuala Lumpur", IP_MY, DEV_IOS, 1),  # post-freeze
    # Income mismatch: Tan (RM 1000-2000) → RM 9500 way over 1.2*2000=2400
    _row(228600, TAN,   9500.00,  "ElectronicsKL", "5732", "Online",    "Kuala Lumpur", IP_MY, DEV_DESKTOP, 1),  # freezes Tan
    _row(230400, TAN,   3200.00,  "ElectronicsKL", "5732", "Online",    "Kuala Lumpur", IP_MY, DEV_DESKTOP, 1),  # post-freeze
    # Retiree unknown income: Raj (Retired, no income) → > RM 10000
    _row(234000, RAJ,   15000.00, "JewelryStore",  "5944", "In-Person", "Kuala Lumpur", IP_MY, DEV_IOS, 1),  # freezes Raj
    _row(235800, RAJ,   8500.00,  "JewelryStore",  "5944", "In-Person", "Kuala Lumpur", IP_MY, DEV_IOS, 1),  # post-freeze
    # Unemployed unknown income: Zhen → > RM 5000
    _row(239400, ZHEN,  6800.00,  "OnlineCasino",  "7995", "Online",    "Manila",       IP_FOREIGN, DEV_DESKTOP, 1),  # freezes Zhen
    # legit cool-down
    _row(243000, ARJUN, 142.00,   "AEON",          "5411", "In-Person", "Kuala Lumpur", IP_MY, DEV_IOS, 0),
    _row(246600, YING,  15.00,    "Starbucks",     "5814", "In-Person", "Petaling Jaya", IP_MY, DEV_MOBILE, 0),  # post-freeze attempt
    _row(250200, ARJUN, 56.00,    "Shell Petrol",  "5541", "In-Person", "Kuala Lumpur", IP_MY, DEV_IOS, 0),
]

# ── Scene 9: Wind-down (10 legit, dashboard settles) ─────────────────────────
SCENE_9 = [
    _row(280800, ARJUN, 75.00,  "Tesco",        "5411", "In-Person", "Kuala Lumpur", IP_MY, DEV_IOS, 0),
    _row(288000, ARJUN, 110.00, "Shell Petrol", "5541", "In-Person", "Kuala Lumpur", IP_MY, DEV_IOS, 0),
    _row(295200, ARJUN, 38.50,  "Starbucks",    "5814", "In-Person", "Kuala Lumpur", IP_MY, DEV_IOS, 0),
    _row(302400, ARJUN, 88.00,  "AEON",         "5411", "In-Person", "Kuala Lumpur", IP_MY, DEV_IOS, 0),
    _row(309600, ARJUN, 220.00, "Senheng",      "5732", "In-Person", "Kuala Lumpur", IP_MY, DEV_IOS, 0),
    _row(316800, ARJUN, 28.00,  "Boost Juice",  "5814", "In-Person", "Kuala Lumpur", IP_MY, DEV_MOBILE, 0),
    _row(324000, ARJUN, 165.00, "Watsons",      "5912", "In-Person", "Kuala Lumpur", IP_MY, DEV_IOS, 0),
    _row(331200, ARJUN, 45.00,  "Tealive",      "5814", "In-Person", "Kuala Lumpur", IP_MY, DEV_MOBILE, 0),
    _row(338400, ARJUN, 130.00, "Lazada",       "5942", "Online",    "Kuala Lumpur", IP_MY, DEV_DESKTOP, 0),
    _row(345600, ARJUN, 60.00,  "Old Town",     "5814", "In-Person", "Kuala Lumpur", IP_MY, DEV_MOBILE, 0),
]


DEMO_DECK = (
    SCENE_1 + SCENE_2 + SCENE_3 + SCENE_4 + SCENE_5
    + SCENE_6 + SCENE_7 + SCENE_8 + SCENE_9
)


SCENE_LABELS = [
    (len(SCENE_1),                                          "Quiet morning"),
    (len(SCENE_1)+len(SCENE_2),                             "High-value attack"),
    (len(SCENE_1)+len(SCENE_2)+len(SCENE_3),                "Normal traffic"),
    (len(SCENE_1)+len(SCENE_2)+len(SCENE_3)+len(SCENE_4),   "Impossible travel"),
    (sum(map(len,[SCENE_1,SCENE_2,SCENE_3,SCENE_4,SCENE_5])),                       "Normal traffic"),
    (sum(map(len,[SCENE_1,SCENE_2,SCENE_3,SCENE_4,SCENE_5,SCENE_6])),               "Smurfing"),
    (sum(map(len,[SCENE_1,SCENE_2,SCENE_3,SCENE_4,SCENE_5,SCENE_6,SCENE_7])),       "ML-only catches"),
    (sum(map(len,[SCENE_1,SCENE_2,SCENE_3,SCENE_4,SCENE_5,SCENE_6,SCENE_7,SCENE_8])),"Mixed fraud"),
    (len(DEMO_DECK),                                                                "Wind-down"),
]


def deck_total() -> int:
    return len(DEMO_DECK)


def deck_duration_seconds() -> int:
    return DEMO_DECK[-1]["offset_seconds"] if DEMO_DECK else 0


if __name__ == "__main__":
    print(f"Demo deck: {deck_total()} transactions")
    print(f"Story span: {deck_duration_seconds()/3600:.1f} hours "
          f"({deck_duration_seconds()/86400:.1f} days)")
    fraud = sum(1 for r in DEMO_DECK if r["is_fraud"] == 1)
    legit = sum(1 for r in DEMO_DECK if r["is_fraud"] == 0)
    print(f"Fraud: {fraud}  Legit: {legit}")
    prev = 0
    for cutoff, label in SCENE_LABELS:
        n = cutoff - prev
        print(f"  {label:25s} {n:3d} txns")
        prev = cutoff
