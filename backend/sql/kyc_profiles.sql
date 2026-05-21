CREATE TABLE IF NOT EXISTS kyc_profiles (
    customer_ref       VARCHAR(12)  PRIMARY KEY,
    ic_hash            VARCHAR(64)  UNIQUE NOT NULL,
    ic_number_enc      TEXT         NOT NULL,
    name               VARCHAR(255),
    date_of_birth      DATE,
    gender             VARCHAR(20),
    phone_number       VARCHAR(50),
    street_address     TEXT,
    city               VARCHAR(100),
    state              VARCHAR(100),
    country            VARCHAR(100),
    nationality        VARCHAR(100),
    marital_status     VARCHAR(50),
    employment_status  VARCHAR(50),
    job_title          VARCHAR(100),
    income_range       VARCHAR(100),
    created_at         TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kyc_ic_hash ON kyc_profiles(ic_hash);
