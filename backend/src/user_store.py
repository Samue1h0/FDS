import hashlib
import os
import binascii


def hash_password(password: str) -> str:
    salt = os.urandom(32)
    key  = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100000)
    return binascii.hexlify(salt).decode() + ":" + binascii.hexlify(key).decode()


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, key_hex = stored.split(":")
        salt = binascii.unhexlify(salt_hex)
        key  = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100000)
        return binascii.hexlify(key).decode() == key_hex
    except Exception:
        return False


class UserStore:
    def __init__(self, conn):
        self.conn = conn

    def get_by_username(self, username: str) -> dict | None:
        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT user_id, username, password_hash, role
                FROM users
                WHERE username = %s AND is_active = TRUE
                """,
                (username,),
            )
            row = cur.fetchone()
        if not row:
            return None
        return {
            "user_id":       row[0],
            "username":      row[1],
            "password_hash": row[2],
            "role":          row[3],
        }

    def get_by_email(self, email: str) -> dict | None:
        """Look up an active user by email (case-insensitive). Used by Google SSO:
        a Google login is only accepted if its verified email matches a row here."""
        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT user_id, username, role
                FROM users
                WHERE LOWER(email) = LOWER(%s) AND is_active = TRUE
                """,
                (email,),
            )
            row = cur.fetchone()
        if not row:
            return None
        return {
            "user_id":  row[0],
            "username": row[1],
            "role":     row[2],
        }

    def update_password(self, username: str, new_password: str) -> bool:
        with self.conn.cursor() as cur:
            cur.execute(
                "UPDATE users SET password_hash = %s WHERE username = %s AND is_active = TRUE",
                (hash_password(new_password), username),
            )
            updated = cur.rowcount
        self.conn.commit()
        return updated > 0
