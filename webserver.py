from flask import Flask, send_from_directory, request, jsonify
import sqlite3
import time
import os

app = Flask(__name__)

DB_PATH = "database.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            balance_usdt REAL DEFAULT 0,
            updated_at INTEGER
        )
    """)
    conn.commit()
    conn.close()

def get_balance(user_id: int) -> float:
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT balance_usdt FROM users WHERE user_id=?", (user_id,))
    row = c.fetchone()
    conn.close()
    if row is None:
        return 0.0
    return float(row[0])

def ensure_user(user_id: int):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT 1 FROM users WHERE user_id=?", (user_id,))
    row = c.fetchone()
    if row is None:
        c.execute(
            "INSERT INTO users (user_id, balance_usdt, updated_at) VALUES (?, ?, ?)",
            (user_id, 0.0, int(time.time()))
        )
    conn.commit()
    conn.close()

def add_earn(user_id: int, amount: float) -> float:
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        UPDATE users
        SET balance_usdt = balance_usdt + ?, updated_at=?
        WHERE user_id=?
    """, (amount, int(time.time()), user_id))
    conn.commit()
    c.execute("SELECT balance_usdt FROM users WHERE user_id=?", (user_id,))
    row = c.fetchone()
    conn.close()
    return float(row[0] if row else 0.0)

@app.route("/api/get_balance", methods=["GET"])
def api_get_balance():
    user_id = request.args.get("user_id", type=int)
    if not user_id:
        return jsonify({"ok": False, "error": "missing user_id"})
    ensure_user(user_id)
    bal = get_balance(user_id)
    return jsonify({"ok": True, "balance": bal})

@app.route("/api/add_earn", methods=["POST"])
def api_add_earn():
    data = request.get_json(force=True, silent=True) or {}
    user_id = data.get("user_id")
    amount = data.get("amount", 0)
    try:
        user_id = int(user_id)
        amount = float(amount)
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "bad user_id or amount"})

    ensure_user(user_id)
    new_bal = add_earn(user_id, amount)
    return jsonify({"ok": True, "balance": new_bal})

@app.route("/")
def index():
    return send_from_directory("webapp", "index.html")

@app.route("/<path:path>")
def static_files(path):
    return send_from_directory("webapp", path)

if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=10000, debug=True)
