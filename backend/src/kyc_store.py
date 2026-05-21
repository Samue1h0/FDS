import hashlib
from cryptography.fernet import Fernet, InvalidToken


class KYCStore:
    def __init__(self, db_conn, encryption_key: bytes):
        self.conn   = db_conn
        self.cipher = Fernet(encryption_key) if encryption_key else None

    def _encrypt(self, value: str) -> str | None:
        if not value or not self.cipher:
            return None
        return self.cipher.encrypt(str(value).encode()).decode()

    def _decrypt(self, value: str) -> str | None:
        if not value or not self.cipher:
            return None
        try:
            return self.cipher.decrypt(value.encode()).decode()
        except (InvalidToken, Exception):
            return None

    def _hash_ic(self, ic_number: str) -> str:
        return hashlib.sha256(str(ic_number).encode()).hexdigest()

    def upsert(self, record: dict):
        ic_number = str(record.get("ic_number", "")).strip()
        with self.conn.cursor() as cur:
            cur.execute("""
                INSERT INTO kyc_profiles (
                    customer_ref, ic_hash, ic_number_enc,
                    name, date_of_birth, gender, phone_number,
                    street_address, city, state, country,
                    nationality, marital_status, employment_status,
                    job_title, income_range
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (customer_ref) DO UPDATE SET
                    name              = EXCLUDED.name,
                    date_of_birth     = EXCLUDED.date_of_birth,
                    gender            = EXCLUDED.gender,
                    phone_number      = EXCLUDED.phone_number,
                    street_address    = EXCLUDED.street_address,
                    city              = EXCLUDED.city,
                    state             = EXCLUDED.state,
                    country           = EXCLUDED.country,
                    nationality       = EXCLUDED.nationality,
                    marital_status    = EXCLUDED.marital_status,
                    employment_status = EXCLUDED.employment_status,
                    job_title         = EXCLUDED.job_title,
                    income_range      = EXCLUDED.income_range
            """, (
                record.get("customer_ref"),
                self._hash_ic(ic_number),
                self._encrypt(ic_number),
                record.get("name"),
                record.get("date_of_birth"),
                record.get("gender"),
                record.get("phone_number"),
                record.get("street_address"),
                record.get("city"),
                record.get("state"),
                record.get("country"),
                record.get("nationality"),
                record.get("marital_status"),
                record.get("employment_status"),
                record.get("job_title"),
                record.get("income_range"),
            ))
        self.conn.commit()

    def get_by_customer_ref(self, customer_ref: str) -> dict | None:
        with self.conn.cursor() as cur:
            cur.execute("""
                SELECT customer_ref, ic_hash, ic_number_enc,
                       name, date_of_birth, gender, phone_number,
                       street_address, city, state, country,
                       nationality, marital_status, employment_status,
                       job_title, income_range, created_at
                FROM kyc_profiles
                WHERE customer_ref = %s
            """, (customer_ref,))
            row = cur.fetchone()

        if not row:
            return None

        return {
            "customer_ref":      row[0],
            "ic_hash":           row[1],
            "ic_number":         self._decrypt(row[2]),
            "name":              row[3],
            "date_of_birth":     str(row[4]) if row[4] else None,
            "gender":            row[5],
            "phone_number":      row[6],
            "street_address":    row[7],
            "city":              row[8],
            "state":             row[9],
            "country":           row[10],
            "nationality":       row[11],
            "marital_status":    row[12],
            "employment_status": row[13],
            "job_title":         row[14],
            "income_range":      row[15],
            "created_at":        str(row[16]) if row[16] else None,
        }

    def close(self):
        self.conn.close()
