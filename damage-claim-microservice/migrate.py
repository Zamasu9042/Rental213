"""
Run this once to migrate your damage_claims.db to support the new REST endpoints.
Usage: python migrate.py
"""
import sqlite3
import os

DB_PATH = os.getenv("DB_PATH", "damage_claims.db")

def migrate():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Check if rental_id column already exists
    cursor.execute("PRAGMA table_info(claims)")
    columns = [row[1] for row in cursor.fetchall()]

    if "rental_id" not in columns:
        print("Adding rental_id column to claims table...")
        cursor.execute("ALTER TABLE claims ADD COLUMN rental_id INTEGER")
        conn.commit()
        print("Done.")
    else:
        print("rental_id already exists — no migration needed.")

    # Also add damage_type and confidence columns if missing (for top-finding storage)
    for col, col_type in [("damage_type", "VARCHAR"), ("confidence", "FLOAT")]:
        if col not in columns:
            print(f"Adding {col} column...")
            cursor.execute(f"ALTER TABLE claims ADD COLUMN {col} {col_type}")
            conn.commit()
            print(f"{col} added.")

    conn.close()
    print("Migration complete.")

if __name__ == "__main__":
    migrate()
