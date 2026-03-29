import sqlite3
import os

DB_PATH = os.getenv("DB_PATH", "damage_claims.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn