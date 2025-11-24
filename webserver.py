from flask import Flask, send_from_directory, request, jsonify
import sqlite3
import time
import os

app = Flask(__name__)

DB_PATH = "database.db"
COMMISSION_PERCENT = 2.0   # 1% կոմիսիա դուրսբերման համար

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    # Օգտատերեր
    c.execute("""
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            balance_usdt REAL DEFAULT 0,
            wallet_address TEXT,
            wallet_network TEXT,
            status TEXT DEFAULT 'active',   -- active / banned
            created_at INTEGER,
            updated_at INTEGER
        )
    """)

    # Վաստակման իրադարձություններ (log)
    c.execute("""
        CREATE TABLE IF NOT EXISTS earn_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            source TEXT,          -- earn / offerwall / game / referral / deposit / admin_gift
            amount REAL,
            created_at INTEGER
        )
    """)

    # Դուրսբերումների հայտեր
    c.execute("""
        CREATE TABLE IF NOT EXISTS withdraw_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            amount REAL,          -- որքան ենք հանում user-ի հաշվից
            receive_amount REAL,  -- որքան է նա ստանալու իր դրամապանակին (կոմիսիայից հետո)
            commission REAL,      -- % թվով, օրինակ 1.0
            to_address TEXT,
            network TEXT,
            status TEXT,          -- pending / paid / rejected
            created_at INTEGER,
            processed_at INTEGER
        )
    """)

    # Դեպոզիտների աղյուսակ
    c.execute("""
        CREATE TABLE IF NOT EXISTS deposits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            tx_hash TEXT,
            amount REAL,
            status TEXT,          -- pending / confirmed
            created_at INTEGER,
            confirmed_at INTEGER
        )
    """)

    conn.commit()
    conn.close()

def init_wallets():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS wallets (
            user_id INTEGER PRIMARY KEY,
            network TEXT,
            address TEXT,
            updated_at INTEGER
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS withdraws (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            amount REAL,
            created_at INTEGER
        )
    """)
    conn.commit()
    conn.close()

@app.route("/api/set_wallet", methods=["POST"])
def api_set_wallet():
    data = request.get_json(force=True, silent=True) or {}
    user_id = int(data.get("user_id"))
    network = data.get("network")
    address = data.get("address")

    if not user_id or not network or not address:
        return jsonify({"ok": False, "error": "missing_fields"})

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        INSERT INTO wallets (user_id, network, address, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
        network=?, address=?, updated_at=?
    """, (user_id, network, address, int(time.time()), network, address, int(time.time())))
    conn.commit()
    conn.close()

    return jsonify({"ok": True})

@app.route("/api/get_wallet", methods=["GET"])
def api_get_wallet():
    user_id = request.args.get("user_id", type=int)
    if not user_id:
        return jsonify({"ok": False, "error": "missing user_id"})

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT network, address FROM wallets WHERE user_id=?", (user_id,))
    row = c.fetchone()
    conn.close()

    if not row:
        return jsonify({"ok": True, "address": None, "network": None})

    return jsonify({"ok": True, "address": row[1], "network": row[0]})


@app.route("/api/request_withdraw", methods=["POST"])
def api_request_withdraw():
    data = request.get_json(force=True, silent=True) or {}

    user_id = int(data.get("user_id"))
    amount = float(data.get("amount"))

    # check wallet
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT address FROM wallets WHERE user_id=?", (user_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        return jsonify({"ok": False, "error": "wallet_not_set"})

    # check balance
    c.execute("SELECT balance_usdt FROM users WHERE user_id=?", (user_id,))
    bal = c.fetchone()[0]
    if bal < amount:
        conn.close()
        return jsonify({"ok": False, "error": "not_enough_balance"})

    # insert withdraw
    c.execute("INSERT INTO withdraws (user_id, amount, created_at) VALUES (?, ?, ?)",
              (user_id, amount, int(time.time())))
    conn.commit()
    conn.close()

    return jsonify({"ok": True})


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
    now = int(time.time())
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT 1 FROM users WHERE user_id=?", (user_id,))
    row = c.fetchone()
    if row is None:
        c.execute(
            """
            INSERT INTO users (user_id, balance_usdt, wallet_address, wallet_network,
                               status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, 0.0, None, None, "active", now, now)
        )
    else:
        c.execute("UPDATE users SET updated_at=? WHERE user_id=?", (now, user_id))
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

# ---------- Wallet helpers ----------

def set_wallet(user_id: int, network: str, address: str):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        """
        UPDATE users
        SET wallet_network=?, wallet_address=?, updated_at=?
        WHERE user_id=?
        """,
        (network, address, int(time.time()), user_id)
    )
    conn.commit()
    conn.close()

def get_wallet(user_id: int):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        "SELECT wallet_network, wallet_address FROM users WHERE user_id=?",
        (user_id,)
    )
    row = c.fetchone()
    conn.close()
    if not row:
        return None, None
    return row[0], row[1]

# ---------- Withdraw helpers ----------

def create_withdraw_request(user_id: int, amount: float):
    """
    Ստեղծում է դուրսբերման հայտ՝ balance_usdt-ից հանելով գումարը,
    հաշվում է կոմիսիան և վերադարձնում նոր բալանսը ու հայտի id-ն:
    """
    if amount <= 0:
        return False, "amount must be positive", None

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    # ստուգենք բալանսը
    c.execute("SELECT balance_usdt, wallet_address, wallet_network FROM users WHERE user_id=?", (user_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        return False, "user_not_found", None

    balance, addr, network = row
    if addr is None or network is None:
        conn.close()
        return False, "wallet_not_set", None

    if balance < amount:
        conn.close()
        return False, "not_enough_balance", None

    # հաշվենք receive_amount-ը (կոմիսիայի հանելով)
    commission_amount = amount * (COMMISSION_PERCENT / 100.0)
    receive_amount = amount - commission_amount
    now = int(time.time())

    # հանենք user-ի բալանսից
    new_balance = balance - amount
    c.execute(
        "UPDATE users SET balance_usdt=?, updated_at=? WHERE user_id=?",
        (new_balance, now, user_id)
    )

    # ստեղծենք հայտը
    c.execute(
        """
        INSERT INTO withdraw_requests
        (user_id, amount, receive_amount, commission, to_address, network,
         status, created_at, processed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (user_id, amount, receive_amount, COMMISSION_PERCENT,
         addr, network, "pending", now, None)
    )
    request_id = c.lastrowid

    conn.commit()
    conn.close()

    return True, {"balance": new_balance, "request_id": request_id}, None


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

@app.route("/api/request_withdraw", methods=["POST"])
def api_request_withdraw():
    data = request.get_json(force=True, silent=True) or {}
    user_id = data.get("user_id")
    amount = data.get("amount")

    try:
        user_id = int(user_id)
        amount = float(amount)
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "bad_user_id_or_amount"})

    ensure_user(user_id)
    ok, payload, err = create_withdraw_request(user_id, amount)
    if not ok:
        return jsonify({"ok": False, "error": payload})  # payload-ը εδώ սխալի կոդն է

    return jsonify({
        "ok": True,
        "balance": payload["balance"],
        "request_id": payload["request_id"],
        "commission_percent": COMMISSION_PERCENT
    })


@app.route("/")
def index():
    return send_from_directory("webapp", "index.html")

@app.route("/<path:path>")
def static_files(path):
    return send_from_directory("webapp", path)

if __name__ == "__main__":
    init_db()
    init_wallets()   # ← Ահա սա է կարևոր
    app.run(host="0.0.0.0", port=10000, debug=True)
