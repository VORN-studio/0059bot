#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
MainMoney Deposit Platform (WebApp-only)
---------------------------------------

Պահանջվող փաթեթներ՝
    pip install python-telegram-bot==20.7 Flask==3.0.0

Բոտի ֆունկցիոնալը.
- /start – գրանցում է user-ին + տալիս WebApp կոճակ
- Չատում այլ user-ական մենյու չկա, ամեն ինչ WebApp-ում է
- SQLite DB
- Դեպոզիտ պլաններ + օրական տոկոս
- Դեպոզիտների ստեղծում WebApp-ից
- Օրական շահույթի հաշվարկ (bootstrap-ի ընթացքում)
- Withdraw հայտեր WebApp-ից
- TON wallet կցում/անջատում WebApp-ից
- Referrals (`/start ref_123` ձևաչափով)
- Admin հրամաններ plans, withdraws, broadcast, coins balance

WebApp-ը կապվում է Flask API-ին՝ /api/... ուղիներով:
"""

import os
import time
import json
import threading
import sqlite3
import logging
from datetime import datetime

from flask import Flask, request, jsonify

from telegram import (
    Update,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    WebAppInfo,
)
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

# ======== CONFIG ========

BOT_TOKEN = os.getenv("BOT_TOKEN", "8001785392:AAFlfF-SkcJJqG52GCsWT7calY9YLe1aqGw")  # <-- ԴԻՐ ՔՈ TOKEN-ը
ADMIN_ID = int(os.getenv("ADMIN_ID", "5274439601"))             # <-- ԴԻՐ ՔՈ TG ID-Ն

# Սա պիտի լինի ՔՈ API URL-ը, որտեղ կաշխատի bot.py / Flask–ը
# օրինակ Render–ում՝  https://mainmoney-xxxx.onrender.com
API_BASE_URL = os.getenv("API_BASE_URL", "https://vorn-studio.github.io/0059bot/")

# Սա WebApp–ի URL-ն է, որտեղ կդնես index.html–դ (օր. GitHub Pages)
WEBAPP_URL = os.getenv("WEBAPP_URL", "https://vorn-studio.github.io/0059bot/")

DB_PATH = "mainmoney_deposits.db"

MIN_WITHDRAW = 10.0        # մինիմալ withdraw (TON կամ միավոր)
DEFAULT_DAILY_PERCENT = 3.0
PLATFORM_MAIN_WALLET = "UQXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"  # քո TON հասցե (դեպոզիտի համար ուղարկելու)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
log = logging.getLogger("MainMoneyBot")

# ======== DB HELPERS ========

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    c = conn.cursor()

    c.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tg_id INTEGER UNIQUE,
            username TEXT,
            first_name TEXT,
            joined_at INTEGER,
            ton_wallet TEXT,
            invited_by INTEGER,
            balance REAL DEFAULT 0,
            total_profit REAL DEFAULT 0,
            total_withdrawn REAL DEFAULT 0
        );
        """
    )

    c.execute(
        """
        CREATE TABLE IF NOT EXISTS referrals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            inviter_tg_id INTEGER,
            invited_tg_id INTEGER,
            created_at INTEGER
        );
        """
    )

    c.execute(
        """
        CREATE TABLE IF NOT EXISTS plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            min_amount REAL,
            max_amount REAL,
            daily_percent REAL,
            duration_days INTEGER,
            active INTEGER DEFAULT 1,
            created_at INTEGER
        );
        """
    )

    c.execute(
        """
        CREATE TABLE IF NOT EXISTS deposits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            plan_id INTEGER,
            amount REAL,
            daily_percent REAL,
            duration_days INTEGER,
            created_at INTEGER,
            last_profit_at INTEGER,
            status TEXT, -- active / finished / pending / cancelled
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(plan_id) REFERENCES plans(id)
        );
        """
    )

    c.execute(
        """
        CREATE TABLE IF NOT EXISTS withdrawals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            amount REAL,
            ton_wallet TEXT,
            status TEXT, -- pending / approved / rejected
            created_at INTEGER,
            processed_at INTEGER,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        """
    )

    conn.commit()
    conn.close()


def ensure_default_plans():
    """Ստեղծենք մի քանի պլան, եթե չկան."""
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT COUNT(*) as cnt FROM plans")
    cnt = c.fetchone()["cnt"]
    if cnt == 0:
        now = int(time.time())
        plans = [
            ("Starter", 10, 200, 2.0, 30),
            ("Pro", 200, 1000, 2.5, 45),
            ("VIP", 1000, 999999, 3.0, 60),
        ]
        for name, mn, mx, pct, dur in plans:
            c.execute(
                """
                INSERT INTO plans (name, min_amount, max_amount, daily_percent, duration_days, active, created_at)
                VALUES (?, ?, ?, ?, ?, 1, ?)
                """,
                (name, mn, mx, pct, dur, now),
            )
        conn.commit()
    conn.close()


def ensure_user(tg_user, inviter_tg_id=None):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM users WHERE tg_id = ?", (tg_user.id,))
    row = c.fetchone()
    if row:
        conn.close()
        return row

    c.execute(
        """
        INSERT INTO users (tg_id, username, first_name, joined_at, invited_by)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            tg_user.id,
            tg_user.username,
            tg_user.first_name,
            int(time.time()),
            inviter_tg_id,
        ),
    )
    conn.commit()

    if inviter_tg_id:
        c.execute(
            """
            INSERT INTO referrals (inviter_tg_id, invited_tg_id, created_at)
            VALUES (?, ?, ?)
            """,
            (inviter_tg_id, tg_user.id, int(time.time())),
        )
        conn.commit()

    c.execute("SELECT * FROM users WHERE tg_id = ?", (tg_user.id,))
    row = c.fetchone()
    conn.close()
    return row


def get_user_by_tg_id(tg_id: int):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM users WHERE tg_id = ?", (tg_id,))
    row = c.fetchone()
    conn.close()
    return row


def accrue_profit_for_user(user_row):
    """Հաշվում է տվյալ user-ի active deposits-ի շահույթը (օրական տոկոսով) և ավելացնում balance-ին."""
    user_id = user_row["id"]
    now = int(time.time())
    conn = get_db()
    c = conn.cursor()
    c.execute(
        "SELECT * FROM deposits WHERE user_id = ? AND status = 'active'",
        (user_id,),
    )
    rows = c.fetchall()
    if not rows:
        conn.close()
        return 0.0

    total_added = 0.0
    for dep in rows:
        last = dep["last_profit_at"] or dep["created_at"]
        delta_sec = max(0, now - last)
        if delta_sec < 60:
            continue
        days = delta_sec / 86400.0
        daily_percent = float(dep["daily_percent"] or DEFAULT_DAILY_PERCENT)
        amount = float(dep["amount"])
        profit = amount * (daily_percent / 100.0) * days
        if profit <= 0:
            continue

        total_added += profit
        c.execute(
            "UPDATE deposits SET last_profit_at = ? WHERE id = ?",
            (now, dep["id"]),
        )

    if total_added > 0:
        c.execute(
            "UPDATE users SET balance = balance + ?, total_profit = total_profit + ? WHERE id = ?",
            (total_added, total_added, user_id),
        )

    conn.commit()
    conn.close()
    return total_added


def get_user_deposits(user_id: int):
    conn = get_db()
    c = conn.cursor()
    c.execute(
        """
        SELECT d.*, p.name as plan_name
        FROM deposits d
        LEFT JOIN plans p ON p.id = d.plan_id
        WHERE d.user_id = ?
        ORDER BY d.created_at DESC
        """,
        (user_id,),
    )
    rows = c.fetchall()
    conn.close()
    return rows


def get_active_plans():
    conn = get_db()
    c = conn.cursor()
    c.execute(
        "SELECT * FROM plans WHERE active = 1 ORDER BY min_amount ASC"
    )
    rows = c.fetchall()
    conn.close()
    return rows


def create_deposit(user_row, plan_id: int, amount: float):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM plans WHERE id = ? AND active = 1", (plan_id,))
    plan = c.fetchone()
    if not plan:
        conn.close()
        return None, "no_plan"

    mn = float(plan["min_amount"])
    mx = float(plan["max_amount"])
    if amount < mn:
        conn.close()
        return None, "too_small"
    if amount > mx:
        conn.close()
        return None, "too_large"

    now = int(time.time())
    c.execute(
        """
        INSERT INTO deposits (user_id, plan_id, amount, daily_percent, duration_days,
                              created_at, last_profit_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
        """,
        (
            user_row["id"],
            plan_id,
            amount,
            float(plan["daily_percent"]),
            int(plan["duration_days"]),
            now,
            now,
        ),
    )
    dep_id = c.lastrowid
    conn.commit()
    conn.close()
    return dep_id, None


def create_withdraw(user_row, amount: float):
    user_id = user_row["id"]
    wallet = user_row["ton_wallet"]
    if not wallet:
        return None, "no_wallet"

    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT balance FROM users WHERE id = ?", (user_id,))
    bal = float(c.fetchone()["balance"] or 0)

    if amount < MIN_WITHDRAW:
        conn.close()
        return None, "too_small"
    if bal < amount:
        conn.close()
        return None, "not_enough"

    now = int(time.time())
    c.execute(
        "UPDATE users SET balance = balance - ?, total_withdrawn = total_withdrawn + ? WHERE id = ?",
        (amount, amount, user_id),
    )
    c.execute(
        """
        INSERT INTO withdrawals (user_id, amount, ton_wallet, status, created_at)
        VALUES (?, ?, ?, 'pending', ?)
        """,
        (user_id, amount, wallet, now),
    )
    wid = c.lastrowid
    conn.commit()
    conn.close()
    return wid, None


def list_pending_withdraws():
    conn = get_db()
    c = conn.cursor()
    c.execute(
        """
        SELECT w.*, u.tg_id, u.username
        FROM withdrawals w
        JOIN users u ON u.id = w.user_id
        WHERE w.status = 'pending'
        ORDER BY w.created_at DESC
        """
    )
    rows = c.fetchall()
    conn.close()
    return rows


def set_withdraw_status(wid: int, status: str):
    conn = get_db()
    c = conn.cursor()
    c.execute(
        "UPDATE withdrawals SET status = ?, processed_at = ? WHERE id = ?",
        (status, int(time.time()), wid),
    )
    conn.commit()
    conn.close()


def get_referral_count(tg_id: int):
    conn = get_db()
    c = conn.cursor()
    c.execute(
        "SELECT COUNT(*) as cnt FROM referrals WHERE inviter_tg_id = ?",
        (tg_id,),
    )
    cnt = c.fetchone()["cnt"] or 0
    conn.close()
    return cnt


# ======== FLASK HTTP API ========

http_app = Flask(__name__)


def json_user_state(user_row):
    """Վերադարձնում է user-ի state-ը JSON dict-ով WebApp-ի համար."""
    accrue_profit_for_user(user_row)

    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM users WHERE id = ?", (user_row["id"],))
    u = c.fetchone()
    conn.close()

    deposits = get_user_deposits(user_row["id"])
    dep_list = []
    for d in deposits:
        dep_list.append(
            {
                "id": d["id"],
                "plan_name": d["plan_name"],
                "amount": float(d["amount"]),
                "daily_percent": float(d["daily_percent"]),
                "duration_days": int(d["duration_days"]),
                "status": d["status"],
                "created_at": d["created_at"],
            }
        )

    plans = get_active_plans()
    plan_list = []
    for p in plans:
        plan_list.append(
            {
                "id": p["id"],
                "name": p["name"],
                "min_amount": float(p["min_amount"]),
                "max_amount": float(p["max_amount"]),
                "daily_percent": float(p["daily_percent"]),
                "duration_days": int(p["duration_days"]),
            }
        )

    ref_cnt = get_referral_count(user_row["tg_id"])

    return {
        "user": {
            "tg_id": user_row["tg_id"],
            "username": user_row["username"],
            "first_name": user_row["first_name"],
        },
        "balance": float(u["balance"] or 0),
        "ton_wallet": u["ton_wallet"],
        "total_profit": float(u["total_profit"] or 0),
        "total_withdrawn": float(u["total_withdrawn"] or 0),
        "deposits": dep_list,
        "plans": plan_list,
        "referrals": {
            "count": ref_cnt,
        },
        "platform_wallet": PLATFORM_MAIN_WALLET,
        "min_withdraw": MIN_WITHDRAW,
    }


@http_app.route("/api/bootstrap", methods=["POST"])
def api_bootstrap():
    data = request.get_json(force=True, silent=True) or {}
    tg_id = int(data.get("tg_id", 0) or 0)
    username = data.get("username")
    first_name = data.get("first_name")

    if not tg_id:
        return jsonify({"ok": False, "error": "no tg_id"}), 400

    # ensure user exists (no inviter here անցած է /start–ից)
    # ստեղծենք "fake" user object նմանատիպ կառուցվածքով
    class FakeUser:
        id = tg_id
        username = username
        first_name = first_name

    user_row = ensure_user(FakeUser)

    return jsonify({"ok": True, "state": json_user_state(user_row)})


@http_app.route("/api/set_wallet", methods=["POST"])
def api_set_wallet():
    data = request.get_json(force=True, silent=True) or {}
    tg_id = int(data.get("tg_id", 0) or 0)
    wallet = (data.get("wallet") or "").strip()

    if not tg_id or len(wallet) < 10:
        return jsonify({"ok": False, "error": "invalid data"}), 400

    user_row = get_user_by_tg_id(tg_id)
    if not user_row:
        return jsonify({"ok": False, "error": "no user"}), 400

    conn = get_db()
    c = conn.cursor()
    c.execute("UPDATE users SET ton_wallet = ? WHERE id = ?", (wallet, user_row["id"]))
    conn.commit()
    conn.close()

    return jsonify({"ok": True, "message": "Wallet saved"})


@http_app.route("/api/disconnect_wallet", methods=["POST"])
def api_disconnect_wallet():
    data = request.get_json(force=True, silent=True) or {}
    tg_id = int(data.get("tg_id", 0) or 0)
    if not tg_id:
        return jsonify({"ok": False, "error": "no tg_id"}), 400

    user_row = get_user_by_tg_id(tg_id)
    if not user_row:
        return jsonify({"ok": False, "error": "no user"}), 400

    conn = get_db()
    c = conn.cursor()
    c.execute("UPDATE users SET ton_wallet = NULL WHERE id = ?", (user_row["id"],))
    conn.commit()
    conn.close()

    return jsonify({"ok": True, "message": "Wallet disconnected"})


@http_app.route("/api/create_deposit", methods=["POST"])
def api_create_deposit():
    data = request.get_json(force=True, silent=True) or {}
    tg_id = int(data.get("tg_id", 0) or 0)
    plan_id = int(data.get("plan_id", 0) or 0)
    amount = float(data.get("amount", 0) or 0)

    if not tg_id or not plan_id or amount <= 0:
        return jsonify({"ok": False, "error": "invalid data"}), 400

    user_row = get_user_by_tg_id(tg_id)
    if not user_row:
        return jsonify({"ok": False, "error": "no user"}), 400

    dep_id, err = create_deposit(user_row, plan_id, amount)
    if err == "no_plan":
        return jsonify({"ok": False, "error": "plan not found"}), 400
    if err == "too_small":
        return jsonify({"ok": False, "error": "too small"}), 400
    if err == "too_large":
        return jsonify({"ok": False, "error": "too large"}), 400

    # NOTE: money transfer to PLATFORM_MAIN_WALLET must be done manually by user
    return jsonify(
        {
            "ok": True,
            "deposit_id": dep_id,
            "platform_wallet": PLATFORM_MAIN_WALLET,
        }
    )


@http_app.route("/api/create_withdraw", methods=["POST"])
def api_create_withdraw():
    data = request.get_json(force=True, silent=True) or {}
    tg_id = int(data.get("tg_id", 0) or 0)
    amount = float(data.get("amount", 0) or 0)

    if not tg_id or amount <= 0:
        return jsonify({"ok": False, "error": "invalid data"}), 400

    user_row = get_user_by_tg_id(tg_id)
    if not user_row:
        return jsonify({"ok": False, "error": "no user"}), 400

    wid, err = create_withdraw(user_row, amount)
    if err == "no_wallet":
        return jsonify({"ok": False, "error": "no_wallet"}), 400
    if err == "too_small":
        return jsonify({"ok": False, "error": "too_small"}), 400
    if err == "not_enough":
        return jsonify({"ok": False, "error": "not_enough"}), 400

    return jsonify({"ok": True, "withdraw_id": wid})


@http_app.route("/api/state", methods=["POST"])
def api_state():
    data = request.get_json(force=True, silent=True) or {}
    tg_id = int(data.get("tg_id", 0) or 0)
    if not tg_id:
        return jsonify({"ok": False, "error": "no tg_id"}), 400

    user_row = get_user_by_tg_id(tg_id)
    if not user_row:
        return jsonify({"ok": False, "error": "no user"}), 400

    return jsonify({"ok": True, "state": json_user_state(user_row)})


# ======== TELEGRAM BOT PART ========

def main_menu_webapp_kb():
    return InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton(
                    "🌐 Open MainMoney App",
                    web_app=WebAppInfo(url=WEBAPP_URL),
                )
            ]
        ]
    )


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    text = update.message.text or ""
    inviter = None

    # referrals: /start ref_123456
    parts = text.split()
    if len(parts) > 1 and parts[1].startswith("ref_"):
        try:
            ref_id = int(parts[1].split("_", 1)[1])
            if ref_id != user.id:
                inviter = ref_id
        except Exception:
            inviter = None

    ensure_user(user, inviter_tg_id=inviter)

    msg = (
        "👋 Բարի գալուստ <b>MainMoney Deposit Platform</b>-ի WebApp տարբերակ։\n\n"
        "Ամբողջ կառավարման ինտերֆեյսը բջջայինում է՝ ներքևի կոճակով։\n"
        "Չատում այլ մենյու չկա, ամեն բան անում ես ներսում։"
    )
    await update.message.reply_text(msg, parse_mode="HTML")
    await update.message.reply_text(
        "Սեղմիր այստեղ՝ բացելու համար 👇", reply_markup=main_menu_webapp_kb()
    )


async def admin_help(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_user.id != ADMIN_ID:
        return

    text = (
        "🛠 <b>Admin panel</b>\n\n"
        "/admin – սա մենյուն\n"
        "/plans – ցուցադրել plans\n"
        "/add_plan name|min|max|percent|days\n"
        "/list_withdraws – pending withdraws\n"
        "/approve_withdraw id\n"
        "/reject_withdraw id\n"
        "/broadcast խոսք\n"
    )
    await update.message.reply_text(text, parse_mode="HTML")


def admin_only(func):
    async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE):
        if update.effective_user.id != ADMIN_ID:
            return
        return await func(update, context)

    return wrapper


@admin_only
async def plans_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    plans = get_active_plans()
    if not plans:
        await update.message.reply_text("No active plans.")
        return

    lines = ["📦 Active plans:\n"]
    for p in plans:
        lines.append(
            f"#{p['id']} {p['name']} – {p['daily_percent']}% / day, "
            f"{p['min_amount']}–{p['max_amount']} TON, {p['duration_days']} days"
        )
    await update.message.reply_text("\n".join(lines))


@admin_only
async def add_plan_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    # /add_plan name|min|max|percent|days
    text = update.message.text.partition(" ")[2].strip()
    parts = [p.strip() for p in text.split("|")]
    if len(parts) != 5:
        await update.message.reply_text("Format: /add_plan name|min|max|percent|days")
        return
    name, mn_s, mx_s, pct_s, days_s = parts
    mn = float(mn_s)
    mx = float(mx_s)
    pct = float(pct_s)
    days = int(days_s)
    now = int(time.time())

    conn = get_db()
    c = conn.cursor()
    c.execute(
        """
        INSERT INTO plans (name, min_amount, max_amount, daily_percent, duration_days, active, created_at)
        VALUES (?, ?, ?, ?, ?, 1, ?)
        """,
        (name, mn, mx, pct, days, now),
    )
    conn.commit()
    conn.close()

    await update.message.reply_text("✅ Plan added.")


@admin_only
async def list_withdraws_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    rows = list_pending_withdraws()
    if not rows:
        await update.message.reply_text("No pending withdraws.")
        return

    lines = ["💸 Pending withdraws:\n"]
    for r in rows:
        dt = datetime.fromtimestamp(r["created_at"]).strftime("%Y-%m-%d %H:%M")
        uname = r["username"] or r["tg_id"]
        lines.append(
            f"ID {r['id']}: {r['amount']} TON | @{uname} | {dt}\nWallet: {r['ton_wallet']}"
        )

    await update.message.reply_text("\n\n".join(lines))


@admin_only
async def approve_withdraw_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if len(context.args) != 1:
        await update.message.reply_text("Usage: /approve_withdraw id")
        return
    wid = int(context.args[0])
    set_withdraw_status(wid, "approved")
    await update.message.reply_text("✅ Withdraw approved (remember to pay manually).")


@admin_only
async def reject_withdraw_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if len(context.args) != 1:
        await update.message.reply_text("Usage: /reject_withdraw id")
        return
    wid = int(context.args[0])
    set_withdraw_status(wid, "rejected")
    await update.message.reply_text("✅ Withdraw rejected.")


@admin_only
async def broadcast_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = update.message.text.partition(" ")[2].strip()
    if not text:
        await update.message.reply_text("Usage: /broadcast some text")
        return

    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT tg_id FROM users")
    rows = c.fetchall()
    conn.close()

    sent = 0
    for r in rows:
        try:
            await context.bot.send_message(r["tg_id"], text)
            sent += 1
        except Exception:
            pass

    await update.message.reply_text(f"✅ Broadcast sent to {sent} users.")


async def dummy_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    # User text in chat – ուղղակի հուշում, որ ամեն բան WebApp-ում է
    await update.message.reply_text(
        "Այս բոտը աշխատում է WebApp-ի միջոցով.\nՕգտագործիր /start և բացիր WebApp կոճակը։"
    )


# ======== START EVERYTHING ========

def run_flask():
    port = int(os.getenv("PORT", "8000"))
    log.info(f"Starting Flask API on port {port}")
    http_app.run(host="0.0.0.0", port=port, debug=False)


def main():
    init_db()
    ensure_default_plans()

    # Flask HTTP server առանձին թելով
    t = threading.Thread(target=run_flask, daemon=True)
    t.start()

    app = Application.builder().token(BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("admin", admin_help))
    app.add_handler(CommandHandler("plans", plans_cmd))
    app.add_handler(CommandHandler("add_plan", add_plan_cmd))
    app.add_handler(CommandHandler("list_withdraws", list_withdraws_cmd))
    app.add_handler(CommandHandler("approve_withdraw", approve_withdraw_cmd))
    app.add_handler(CommandHandler("reject_withdraw", reject_withdraw_cmd))
    app.add_handler(CommandHandler("broadcast", broadcast_cmd))

    # any other text → reminder that everything is in WebApp
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, dummy_text))

    log.info("Telegram bot started...")
    app.run_polling()


if __name__ == "__main__":
    main()
