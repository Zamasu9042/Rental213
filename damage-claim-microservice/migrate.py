"""
Run once to set up or update damage_claims.db.
Usage: python migrate.py
"""
import sqlite3
import os

DB_PATH = os.getenv("DB_PATH", "damage_claims.db")


def migrate():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("PRAGMA table_info(claims)")
    existing = [row[1] for row in cursor.fetchall()]

    # Add any missing columns
    additions = [
        ("rental_id",          "ALTER TABLE claims ADD COLUMN rental_id INTEGER"),
        ("damage_type",        "ALTER TABLE claims ADD COLUMN damage_type VARCHAR"),
        ("confidence",         "ALTER TABLE claims ADD COLUMN confidence FLOAT"),
    ]
    for col, sql in additions:
        if col not in existing:
            print(f"Adding column: {col}")
            cursor.execute(sql)
            conn.commit()

    print("Migration complete.")
    conn.close()


if __name__ == "__main__":
    migrate()
