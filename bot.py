import os
import sqlite3
import logging
from threading import Thread

from flask import Flask, request, jsonify, send_from_directory
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, ContextTypes

# ==========================
# CONFIG
# ==========================
TOKEN = "8001785392:AAFlfF-SkcJJqG52GCsWT7calY9YLe1aqGw"        # ← ԴУՔ ԴՆԵՍ ՔՈ TOKEN-Ը
WEBAPP_URL = "https://vorn-studio.github.io/0059bot/"  # ← ԴՆԵՍ ՔՈ WEBAPP LINK-Ը
DB_PATH = os.path.join(os.path.dirname(__file__), "bot.db")

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("0059bot")


# ==========================
# DB HELPERS
# ==========================
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            balance REAL DEFAULT 0,
            wallet_network TEXT,
            wallet_address TEXT
        );
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS withdraw_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at INTEGER DEFAULT (strftime('%s','now'))
        );
    """)
    conn.commit()
    conn.close()


def ensure_user(user_id: int):
    if not user_id:
        return
    conn = get_db()
    c = conn.cursor()
    c.execute("INSERT OR IGNORE INTO users (user_id) VALUES (?)", (user_id,))
    conn.commit()
    conn.close()


# ==========================
# FLASK (WEBAPP + API)
# ==========================
app_web = Flask(__name__, static_folder=".", static_url_path="")


@app_web.route("/")
def index():
    return send_from_directory(".", "index.html")


@app_web.route("/<path:path>")
def static_files(path):
    return send_from_directory(".", path)


@app_web.get("/api/get_balance")
def api_get_balance():
    user_id = request.args.get("user_id", type=int)
    if not user_id:
        return jsonify({"ok": False, "error": "missing_user_id"}), 400

    ensure_user(user_id)
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT balance FROM users WHERE user_id = ?", (user_id,))
    row = c.fetchone()
    conn.close()

    balance = float(row["balance"]) if row else 0.0
    return jsonify({"ok": True, "balance": balance})


@app_web.post("/api/add_earn")
def api_add_earn():
    data = request.get_json(force=True, silent=True) or {}
    try:
        user_id = int(data.get("user_id", 0))
        amount = float(data.get("amount", 0))
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "bad_types"}), 400

    if not user_id or amount <= 0:
        return jsonify({"ok": False, "error": "missing_or_bad_values"}), 400

    ensure_user(user_id)
    conn = get_db()
    c = conn.cursor()
    c.execute("UPDATE users SET balance = balance + ? WHERE user_id = ?", (amount, user_id))
    conn.commit()
    c.execute("SELECT balance FROM users WHERE user_id = ?", (user_id,))
    row = c.fetchone()
    conn.close()

    balance = float(row["balance"]) if row else 0.0
    return jsonify({"ok": True, "balance": balance})


@app_web.get("/api/get_wallet")
def api_get_wallet():
    user_id = request.args.get("user_id", type=int)
    if not user_id:
        return jsonify({"ok": False, "error": "missing_user_id"}), 400

    ensure_user(user_id)
    conn = get_db()
    c = conn.cursor()
    c.execute(
        "SELECT wallet_network, wallet_address, balance FROM users WHERE user_id = ?",
        (user_id,),
    )
    row = c.fetchone()
    conn.close()

    if not row:
        return jsonify({"ok": True, "network": None, "address": None, "balance": 0.0})

    return jsonify({
        "ok": True,
        "network": row["wallet_network"],
        "address": row["wallet_address"],
        "balance": float(row["balance"]),
    })


@app_web.post("/api/set_wallet")
def api_set_wallet():
    data = request.get_json(force=True, silent=True) or {}
    try:
        user_id = int(data.get("user_id", 0))
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "bad_user_id"}), 400

    network = (data.get("network") or "").strip()
    address = (data.get("address") or "").strip()

    if not user_id or not network or not address:
        return jsonify({"ok": False, "error": "missing_fields"}), 400

    ensure_user(user_id)
    conn = get_db()
    c = conn.cursor()
    c.execute(
        "UPDATE users SET wallet_network = ?, wallet_address = ? WHERE user_id = ?",
        (network, address, user_id),
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app_web.post("/api/request_withdraw")
def api_request_withdraw():
    data = request.get_json(force=True, silent=True) or {}
    try:
        user_id = int(data.get("user_id", 0))
        amount = float(data.get("amount", 0))
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "bad_types"}), 400

    if not user_id or amount <= 0:
        return jsonify({"ok": False, "error": "bad_values"}), 400

    ensure_user(user_id)
    conn = get_db()
    c = conn.cursor()
    c.execute(
        "SELECT balance, wallet_network, wallet_address FROM users WHERE user_id = ?",
        (user_id,),
    )
    row = c.fetchone()

    if not row:
        conn.close()
        return jsonify({"ok": False, "error": "no_user"}), 400

    balance = float(row["balance"])
    wallet_address = row["wallet_address"]

    if not wallet_address:
        conn.close()
        return jsonify({"ok": False, "error": "wallet_not_set"}), 400

    if balance < amount:
        conn.close()
        return jsonify({"ok": False, "error": "not_enough_balance"}), 400

    c.execute("UPDATE users SET balance = balance - ? WHERE user_id = ?", (amount, user_id))
    c.execute(
        "INSERT INTO withdraw_requests (user_id, amount, status) VALUES (?, ?, 'pending')",
        (user_id, amount),
    )
    conn.commit()
    conn.close()

    return jsonify({"ok": True})


# ==========================
# TELEGRAM BOT
# ==========================
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [
        [InlineKeyboardButton("Open 0059Bot 🌐", web_app=WebAppInfo(url=WEBAPP_URL))]
    ]
    await update.message.reply_text(
        "Բարի գալուստ 0059Bot Mini App 👋",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )


async def balance_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    ensure_user(user_id)
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT balance FROM users WHERE user_id = ?", (user_id,))
    row = c.fetchone()
    conn.close()
    bal = float(row["balance"]) if row else 0.0
    await update.message.reply_text(f"Քո բալանսը՝ {bal:.2f} USDT")


def run_flask():
    log.info("Starting Flask server on 0.0.0.0:10000")
    app_web.run(host="0.0.0.0", port=10000)


def main():
    init_db()

    # Run Flask in background thread
    t = Thread(target=run_flask, daemon=True)
    t.start()

    # Telegram Bot
    application = Application.builder().token(TOKEN).build()
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("balance", balance_cmd))

    log.info("Starting Telegram bot polling...")
    application.run_polling()


if __name__ == "__main__":
    main()
