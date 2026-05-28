CREATE TABLE private_transactions (
    id                   SERIAL PRIMARY KEY,
    transaction_id       VARCHAR(255) UNIQUE NOT NULL,
    cardholder_name      VARCHAR(255),
    ic_number_enc        TEXT NOT NULL,
    card_number_enc      TEXT NOT NULL,
    card_expiration_date VARCHAR(20),
    customer_ref         VARCHAR(50),
    timestamp            TIMESTAMP,
    amount_myr           NUMERIC(12, 2),
    merchant_name        VARCHAR(255),
    mcc                  VARCHAR(20),
    mode                 VARCHAR(50),
    location             VARCHAR(255),
    ic_hash              VARCHAR(64),
    card_hash            VARCHAR(64),
    masked_card_number   VARCHAR(20),
    fraud_score          NUMERIC(6, 4),
    predicted_label      VARCHAR(10),
    ml_prediction        SMALLINT,
    rule_flag            SMALLINT,
    risk_reasons         TEXT,
    ground_truth_label   SMALLINT,
    reviewed_by          VARCHAR(100),
    reviewed_at          TIMESTAMP,
    notes                TEXT,
    is_demo              BOOLEAN DEFAULT FALSE NOT NULL,
    created_at           TIMESTAMP DEFAULT NOW()
);

-- Fast cross-reference from blockchain transaction_id
CREATE INDEX idx_private_txn_id ON private_transactions(transaction_id);

-- Customer lookup for PDPA deletion requests
CREATE INDEX idx_private_customer_ref ON private_transactions(customer_ref);

-- Speeds up retraining queries like "get all reviewed fraud cases"
CREATE INDEX idx_private_ground_truth ON private_transactions(ground_truth_label)
    WHERE ground_truth_label IS NOT NULL;

-- Dashboard read-model indexes
CREATE INDEX idx_private_predicted_label ON private_transactions(predicted_label);
CREATE INDEX idx_private_timestamp       ON private_transactions(timestamp DESC);

-- Join key for frozen-card lookups (see frozen_cards.sql)
CREATE INDEX idx_private_card_hash ON private_transactions(card_hash);

-- ── Migration for existing databases ──────────────────────────────────────────
-- Run these ALTER statements if the table already exists:
--
-- ALTER TABLE private_transactions
--   ADD COLUMN IF NOT EXISTS mcc                VARCHAR(20),
--   ADD COLUMN IF NOT EXISTS mode               VARCHAR(50),
--   ADD COLUMN IF NOT EXISTS location           VARCHAR(255),
--   ADD COLUMN IF NOT EXISTS ic_hash            VARCHAR(64),
--   ADD COLUMN IF NOT EXISTS masked_card_number VARCHAR(20),
--   ADD COLUMN IF NOT EXISTS fraud_score        NUMERIC(6,4),
--   ADD COLUMN IF NOT EXISTS predicted_label    VARCHAR(10),
--   ADD COLUMN IF NOT EXISTS ml_prediction      SMALLINT,
--   ADD COLUMN IF NOT EXISTS rule_flag          SMALLINT,
--   ADD COLUMN IF NOT EXISTS risk_reasons       TEXT,
--   ADD COLUMN IF NOT EXISTS is_demo            BOOLEAN DEFAULT FALSE NOT NULL,
--   ADD COLUMN IF NOT EXISTS card_hash          VARCHAR(64);
--
-- CREATE INDEX IF NOT EXISTS idx_private_predicted_label ON private_transactions(predicted_label);
-- CREATE INDEX IF NOT EXISTS idx_private_timestamp       ON private_transactions(timestamp DESC);
-- CREATE INDEX IF NOT EXISTS idx_private_is_demo         ON private_transactions(is_demo) WHERE is_demo = TRUE;
-- CREATE INDEX IF NOT EXISTS idx_private_card_hash       ON private_transactions(card_hash);
--
-- After adding card_hash to an existing DB, run `python -m src.backfill_frozen_cards`
-- to populate card_hash on historical rows and build the frozen_cards table.