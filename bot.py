import os
import sqlite3
import logging
from threading import Thread
from flask import Flask, request, jsonify, send_from_directory
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, ContextTypes

# --------------------------
# CONFIG
# --------------------------
TOKEN = "8001785392:AAFlfF-SkcJJqG52GCsWT7calY9YLe1aqGw"
WEBAPP_URL = "https://vorn-studio.github.io/0059bot/"   # CHANGE THIS
DB_PATH = "bot.db"

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("0059bot")

# --------------------------
# DATABASE
# --------------------------
def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = db()
    c = conn.cursor()

    c.execute("""
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            balance REAL DEFAULT 0,
            wallet_address TEXT,
            wallet_network TEXT
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS withdraw_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            amount REAL,
            status TEXT DEFAULT 'pending',
            created_at INTEGER DEFAULT (strftime('%s','now'))
        )
    """)

    conn.commit()
    conn.close()

def ensure_user(user_id):
    conn = db()
    c = conn.cursor()
    c.execute("INSERT OR IGNORE INTO users (user_id) VALUES (?)", (user_id,))
    conn.commit()
    conn.close()


# --------------------------
# FLASK SERVER (WEBAPP + API)
# --------------------------
app_web = Flask(__name__, static_folder=".", static_url_path="")

@app_web.route("/")
def root():
    return send_from_directory(".", "index.html")

@app_web.route("/<path:p>")
def static_files(p):
    return send_from_directory(".", p)

# -------- API: Get Balance
@app_web.get("/api/get_balance")
def api_get_balance():
    user_id = request.args.get("user_id", type=int)
    ensure_user(user_id)
    conn = db()
    c = conn.cursor()
    c.execute("SELECT balance FROM users WHERE user_id=?", (user_id,))
    row = c.fetchone()
    balance = row["balance"] if row else 0
    conn.close()
    return jsonify({"ok": True, "balance": balance})


# -------- API: Add Earning
@app_web.post("/api/add_earn")
def api_add_earn():
    data = request.get_json(force=True) or {}
    user_id = int(data.get("user_id"))
    amount = float(data.get("amount"))

    ensure_user(user_id)

    conn = db()
    c = conn.cursor()
    c.execute("UPDATE users SET balance = balance + ? WHERE user_id=?", (amount, user_id))
    conn.commit()

    c.execute("SELECT balance FROM users WHERE user_id=?", (user_id,))
    balance = c.fetchone()["balance"]
    conn.close()

    return jsonify({"ok": True, "balance": balance})


# -------- API: Get Wallet
@app_web.get("/api/get_wallet")
def api_get_wallet():
    user_id = request.args.get("user_id", type=int)
    ensure_user(user_id)
    conn = db()
    c = conn.cursor()
    c.execute("SELECT wallet_network, wallet_address, balance FROM users WHERE user_id=?", (user_id,))
    row = c.fetchone()
    conn.close()

    return jsonify({
        "ok": True,
        "network": row["wallet_network"],
        "address": row["wallet_address"],
        "balance": row["balance"],
    })


# -------- API: Save Wallet
@app_web.post("/api/set_wallet")
def api_set_wallet():
    data = request.get_json(force=True)
    user_id = int(data["user_id"])
    network = data["network"]
    address = data["address"].strip()

    ensure_user(user_id)

    conn = db()
    c = conn.cursor()
    c.execute(
        "UPDATE users SET wallet_network=?, wallet_address=? WHERE user_id=?",
        (network, address, user_id),
    )
    conn.commit()
    conn.close()

    return jsonify({"ok": True})


# -------- API: Withdraw Request
@app_web.post("/api/request_withdraw")
def api_request_withdraw():
    data = request.get_json(force=True)
    user_id = int(data["user_id"])
    amount = float(data["amount"])

    conn = db()
    c = conn.cursor()

    c.execute("SELECT balance, wallet_address FROM users WHERE user_id=?", (user_id,))
    row = c.fetchone()

    if row["wallet_address"] is None:
        return jsonify({"ok": False, "error": "wallet_not_set"})

    if float(row["balance"]) < amount:
        return jsonify({"ok": False, "error": "not_enough_balance"})

    c.execute("UPDATE users SET balance = balance - ? WHERE user_id=?", (amount, user_id))
    c.execute(
        "INSERT INTO withdraw_requests (user_id, amount) VALUES (?, ?)",
        (user_id, amount),
    )
    conn.commit()
    conn.close()

    return jsonify({"ok": True})


# --------------------------
# TELEGRAM BOT
# --------------------------
async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    kb = [[InlineKeyboardButton("Open App 🌐", web_app=WebAppInfo(url=WEBAPP_URL))]]
    await update.message.reply_text("Welcome to 0059Bot!", reply_markup=InlineKeyboardMarkup(kb))


def run_flask():
    app_web.run(host="0.0.0.0", port=10000)


def main():
    init_db()

    Thread(target=run_flask, daemon=True).start()

    app = Application.builder().token(TOKEN).build()
    app.add_handler(CommandHandler("start", start))

    app.run_polling()


if __name__ == "__main__":
    main()
