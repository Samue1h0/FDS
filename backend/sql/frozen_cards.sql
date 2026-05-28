-- One row per card that has been auto-frozen after a FRAUD decision.
-- Keyed by card_hash (sha256 of the full card number, same hashing as ic_hash)
-- so duplicate fraud transactions on the same card don't double-freeze it.
-- frozen_at is the timestamp of the FIRST fraud transaction on the card.
CREATE TABLE frozen_cards (
    card_hash       VARCHAR(64) PRIMARY KEY,
    customer_ref    VARCHAR(50),
    cardholder_name VARCHAR(255),
    card_last4      VARCHAR(8),
    frozen_at       TIMESTAMP,
    trigger_txn_id  VARCHAR(255),
    trigger_reasons TEXT,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- Summary/list queries group and sort by customer and freeze time.
CREATE INDEX idx_frozen_customer_ref ON frozen_cards(customer_ref);
CREATE INDEX idx_frozen_frozen_at    ON frozen_cards(frozen_at DESC);
