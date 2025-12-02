# bot.py — DOMINO (Telegram Bot + Flask WebApp)
# Python 3.10+ | pip install flask flask-cors python-telegram-bot==20.3 psycopg2-binary requests

import os
import time
import threading
from typing import Optional

from flask import Flask, jsonify, send_from_directory, request
from flask_cors import CORS

import asyncio
import psycopg2
from psycopg2 import pool

from telegram import (
    Update,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    WebAppInfo,
)
from telegram.ext import (
    ApplicationBuilder,
    CommandHandler,
    CallbackQueryHandler,
    MessageHandler,
    ContextTypes,
    filters,
)

# =========================
# CONFIG
# =========================

BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()
if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN env var is missing")

PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "").strip()
if not PUBLIC_BASE_URL:
    # քո տրամադրած հղումը
    PUBLIC_BASE_URL = "https://domino-backend-iavj.onrender.com"

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL env var is missing (PostgreSQL connection string)")

ADMIN_IDS = {5274439601}  # փոխես, եթե պետք լինի

# =========================
# Flask Web Server
# =========================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEBAPP_DIR = os.path.join(BASE_DIR, "webapp")  # այստեղ պիտի լինի index.html, app.js, style.css, assets/

app_web = Flask(__name__, static_folder=None)
CORS(app_web)


@app_web.route("/")
def index():
    return "✅ Domino backend is online. Go to /app for WebApp.", 200


@app_web.route("/app")
def app_page():
    """
    Սերվում ենք WebApp–ի հիմնական էջը.
    Telegram WebApp–ի URL-ը կլինի՝
    https://domino-backend-iavj.onrender.com/app?uid=XXXX
    """
    return send_from_directory(WEBAPP_DIR, "index.html")


@app_web.route("/webapp/<path:filename>")
def serve_webapp(filename):
    """
    Static ֆայլերի սերվինգ՝ /webapp/... համար
    օրինակ՝ /webapp/app.js, /webapp/style.css, /webapp/assets/...
    """
    resp = send_from_directory(WEBAPP_DIR, filename)
    if filename.endswith(".mp4"):
        resp.headers["Cache-Control"] = "public, max-age=86400"
        resp.headers["Accept-Ranges"] = "bytes"
        resp.headers["Content-Type"] = "video/mp4"
    elif filename.endswith((".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico")):
        resp.headers["Cache-Control"] = "public, max-age=86400"
    elif filename.endswith((".css", ".js")):
        resp.headers["Cache-Control"] = "no-cache"
    return resp


@app_web.route("/favicon.ico")
def favicon():
    # եթե favicon չունես, կարող ես հեռացնել
    assets_dir = os.path.join(WEBAPP_DIR, "assets")
    return send_from_directory(assets_dir, "favicon.ico")


# =========================
# PostgreSQL Connection Pool
# =========================

_db_pool: Optional[pool.SimpleConnectionPool] = None


def db():
    """
    PostgreSQL connection pool — նույն գաղափարը, ինչ VORN-ում
    """
    global _db_pool
    if _db_pool is None:
        _db_pool = pool.SimpleConnectionPool(
            minconn=1,
            maxconn=8,
            dsn=DATABASE_URL,
            sslmode="require",
        )
        print("🧩 PostgreSQL pool initialized (Domino).")
    try:
        conn = _db_pool.getconn()
    except Exception as e:
        print("⚠️ Pool exhausted, temporary direct connection:", e)
        conn = psycopg2.connect(DATABASE_URL, sslmode="require")

    conn.autocommit = True
    return conn


def release_db(conn):
    global _db_pool
    try:
        if _db_pool:
            _db_pool.putconn(conn)
        else:
            conn.close()
    except Exception as e:
        print("⚠️ release_db error:", e)


alters = [
    "ALTER TABLE dom_users ADD COLUMN IF NOT EXISTS ton_balance NUMERIC(20,6) DEFAULT 0",
    "ALTER TABLE dom_users ADD COLUMN IF NOT EXISTS usd_balance NUMERIC(20,2) DEFAULT 0",
    "ALTER TABLE dom_users ADD COLUMN IF NOT EXISTS last_rate NUMERIC(20,6) DEFAULT 0"
]

def init_db():
    """
    Creates base tables and applies ALTER patches safely.
    """
    print("🛠️ init_db() — Domino")

    conn = db()
    c = conn.cursor()

    # ---------- BASE TABLE ----------
    c.execute("""
        CREATE TABLE IF NOT EXISTS dom_users (
            user_id BIGINT PRIMARY KEY,
            username TEXT,
            wallet_address TEXT,
            balance_usd NUMERIC(18,2) DEFAULT 0,
            total_deposit_usd NUMERIC(18,2) DEFAULT 0,
            total_withdraw_usd NUMERIC(18,2) DEFAULT 0,
            inviter_id BIGINT,
            created_at BIGINT
        )
    """)

    # ---------- APPLY ALTER PATCHES ----------
    for sql in alters:
        try:
            c.execute(sql)
            print("Applied:", sql)
        except Exception as e:
            print("Skip alter:", sql, "Reason:", e)

    # ---------- DEPOSITS ----------
    c.execute("""
        CREATE TABLE IF NOT EXISTS dom_deposits (
            id SERIAL PRIMARY KEY,
            user_id BIGINT,
            amount_usd NUMERIC(18,2),
            status TEXT DEFAULT 'auto_credited',
            created_at BIGINT,
            processed_at BIGINT
        )
    """)

    # ---------- WITHDRAWALS ----------
    c.execute("""
        CREATE TABLE IF NOT EXISTS dom_withdrawals (
            id SERIAL PRIMARY KEY,
            user_id BIGINT,
            amount_usd NUMERIC(18,2),
            status TEXT DEFAULT 'pending',
            created_at BIGINT,
            processed_at BIGINT
        )
    """)

    conn.commit()
    release_db(conn)
    print("✅ Domino tables ready with applied patches!")


# =========================
# DB Helpers
# =========================

def ensure_user(user_id: int, username: Optional[str], inviter_id: Optional[int] = None):
    """
    Գրանցում/թարմացնում է օգտատիրոջ տվյալները Domino-ում։
    """
    if inviter_id == user_id:
        inviter_id = None

    now = int(time.time())
    conn = db()
    c = conn.cursor()
    c.execute("SELECT user_id, inviter_id FROM dom_users WHERE user_id=%s", (user_id,))
    row = c.fetchone()
    if row is None:
        c.execute("""
            INSERT INTO dom_users (user_id, username, inviter_id, created_at)
            VALUES (%s, %s, %s, %s)
        """, (user_id, username, inviter_id, now))
    else:
        c.execute("UPDATE dom_users SET username=%s WHERE user_id=%s", (username, user_id))

    conn.commit()
    release_db(conn)


def get_user_stats(user_id: int):
    """
    Վերադարձնում ենք օգտատիրոջ USD balance-ը, TON balance-ը (հաշվարկված),
    ռեֆերալների վիճակը և այլն։
    """
    conn = db()
    c = conn.cursor()

    # Գլխավոր user row
    c.execute("""
        SELECT username,
               COALESCE(balance_usd,0),
               COALESCE(total_deposit_usd,0),
               COALESCE(total_withdraw_usd,0),
               COALESCE(ton_balance,0),
               COALESCE(last_rate,0)
        FROM dom_users
        WHERE user_id=%s
    """, (user_id,))

    row = c.fetchone()
    if not row:
        release_db(conn)
        return None

    username, balance_usd, total_dep, total_wd, ton_balance, last_rate = row

    # հաշվում ենք TON-ը USD-ից
    if last_rate and last_rate > 0:
        ton_balance = balance_usd / last_rate
    else:
        ton_balance = 0

    # referrals count
    c.execute("SELECT COUNT(*) FROM dom_users WHERE inviter_id=%s", (user_id,))
    ref_count = c.fetchone()[0] or 0

    # active refs
    c.execute("""
        SELECT COUNT(*)
        FROM dom_users
        WHERE inviter_id=%s AND total_deposit_usd > 0
    """, (user_id,))
    active_refs = c.fetchone()[0] or 0

    # team deposits
    c.execute("""
        SELECT COALESCE(SUM(total_deposit_usd),0)
        FROM dom_users
        WHERE inviter_id=%s
    """, (user_id,))
    team_dep = c.fetchone()[0] or 0

    release_db(conn)

    return {
        "user_id": user_id,
        "username": username,
        "balance_usd": float(balance_usd),
        "ton_balance": float(ton_balance),
        "total_deposit_usd": float(total_dep),
        "total_withdraw_usd": float(total_wd),
        "ref_count": int(ref_count),
        "active_refs": int(active_refs),
        "team_deposit_usd": float(team_dep),
    }



def apply_deposit(user_id: int, amount: float):
    """
    Պարզ տարբերակ՝
    - միանգամից գումարում ենք balance_usd + total_deposit_usd
    - գրանցում ենք dom_deposits-ում
    """
    now = int(time.time())
    conn = db()
    c = conn.cursor()

    c.execute("""
        INSERT INTO dom_deposits (user_id, amount_usd, status, created_at)
        VALUES (%s, %s, 'auto_credited', %s)
    """, (user_id, amount, now))

    c.execute("""
        UPDATE dom_users
           SET balance_usd = COALESCE(balance_usd,0) + %s,
               total_deposit_usd = COALESCE(total_deposit_usd,0) + %s
         WHERE user_id=%s
    """, (amount, amount, user_id))

    conn.commit()
    release_db(conn)


def create_withdraw_request(user_id: int, amount: float):
    """
    Ստեղծում է pending withdraw request + նվազեցնում balance_usd,
    ավելացնում total_withdraw_usd։
    """
    now = int(time.time())
    conn = db()
    c = conn.cursor()

    c.execute("""
        INSERT INTO dom_withdrawals (user_id, amount_usd, status, created_at)
        VALUES (%s, %s, 'pending', %s)
    """, (user_id, amount, now))

    c.execute("""
        UPDATE dom_users
           SET balance_usd = COALESCE(balance_usd,0) - %s,
               total_withdraw_usd = COALESCE(total_withdraw_usd,0) + %s
         WHERE user_id=%s
    """, (amount, amount, user_id))

    conn.commit()
    release_db(conn)


# =========================
# JSON API for WebApp
# =========================

@app_web.route("/api/user/<int:user_id>")
def api_user(user_id):
    stats = get_user_stats(user_id)
    if not stats:
        return jsonify({"ok": False, "error": "user_not_found"}), 404

    return jsonify({"ok": True, "user": stats})


@app_web.route("/api/deposit", methods=["POST"])
def api_deposit():
    """
    Body: { "user_id": ..., "amount": ... }

    Այս պահին՝ SIMPLE տարբերակ:
    - Մեկենա գրանցում ենք դեպոզիտը որպես "auto_credited"
    - Բալանսն ու total_deposit_usd-ը անմիջապես աճում են
    """
    data = request.get_json(force=True, silent=True) or {}
    user_id = int(data.get("user_id", 0))
    amount = float(data.get("amount", 0))

    if not user_id or amount <= 0:
        return jsonify({"ok": False, "error": "bad_params"}), 400

    stats = get_user_stats(user_id)
    if not stats:
        return jsonify({"ok": False, "error": "user_not_found"}), 404

    apply_deposit(user_id, amount)
    new_stats = get_user_stats(user_id)

    return jsonify({
        "ok": True,
        "message": "Դեպոզիտի հարցումը գրանցվեց ✅ Գումարը հաշվվել է ձեր բալանսի վրա։",
        "user": new_stats
    })


@app_web.route("/api/withdraw_request", methods=["POST"])
def api_withdraw_request():
    """
    Body: { "user_id": ..., "amount": ... }

    Կանոններ, որոնք դու ասել ես.
    - amount > 0
    - amount <= balance_usd
    - ունի առնվազն 10 հրավիրված ընկեր
    - թիմի ընդհանուր դեպոզիտը (ընկերների) >= 200$
    """
    data = request.get_json(force=True, silent=True) or {}
    user_id = int(data.get("user_id", 0))
    amount = float(data.get("amount", 0))

    if not user_id or amount <= 0:
        return jsonify({"ok": False, "error": "bad_params"}), 400

    stats = get_user_stats(user_id)
    if not stats:
        return jsonify({"ok": False, "error": "user_not_found"}), 404

    balance = stats["balance_usd"]
    ref_count = stats["ref_count"]
    active_refs = stats["active_refs"]
    team_dep = stats["team_deposit_usd"]

    # 1) գումարը չի կարող գերազանցել բալանսը
    if amount > balance:
        return jsonify({
            "ok": False,
            "error": "not_enough_balance",
            "message": "Ունեք բավարար բալանս կանխիկացման համար չէ։"
        }), 200

    # 2) ընդհանուր հրավիրվածները < 10
    if ref_count < 10:
        return jsonify({
            "ok": False,
            "error": "not_enough_refs",
            "message": "Կանխիկացնելու համար պետք է ունենաք առնվազն 10 հրավիրված ընկեր։"
        }), 200

    # 3) թիմի դեպոզիտը < 200$
    if team_dep < 200.0:
        return jsonify({
            "ok": False,
            "error": "not_enough_team_deposit",
            "message": "Կանխիկացնելու համար ձեր հրավիրվածների ընդհանուր դեպոզիտը պետք է լինի առնվազն 200$։"
        }), 200

    # ամեն ինչ OK → գրանցում ենք հայտը
    create_withdraw_request(user_id, amount)
    new_stats = get_user_stats(user_id)

    return jsonify({
        "ok": True,
        "message": "Ձեր կանխիկացման հայտը ստացվել է ✅ Գումարը կփոխանցվի մինչև 24 ժամվա ընթացքում։",
        "user": new_stats
    })


# =========================
# Telegram Bot (Webhook Mode)
# =========================

import requests
import time

TON_RATE_URL = "https://tonapi.io/v2/rates?tokens=toncoin&currencies=usd"


def fetch_ton_rate():
    """
    Fetch current TON → USD rate from tonapi.io
    Returns float or None if failed.
    """
    try:
        r = requests.get(TON_RATE_URL, timeout=5)
        data = r.json()
        return float(data["rates"]["ton"]["prices"]["USD"])
    except Exception as e:
        print("⚠️ TON rate fetch failed:", e)
        return None

def ton_rate_updater():
    print("🔄 TON updater thread started")
    while True:
        try:
            rate = fetch_ton_rate()
            print("Fetched TON rate:", rate)

            if rate:
                conn = db()
                c = conn.cursor()
                c.execute("UPDATE dom_users SET last_rate = %s", (rate,))
                conn.commit()
                release_db(conn)
                print("💹 Updated last_rate in DB →", rate)
            else:
                print("❌ Could not fetch TON rate")

        except Exception as e:
            print("⚠️ TON updater error:", e)

        time.sleep(30)


application = None  # global PTB application
bot_loop = None     # main asyncio loop bot-ի համար


def parse_start_payload(text: Optional[str]) -> Optional[int]:
    """
    /start ref_123456789 → 123456789
    """
    if not text:
        return None
    parts = text.strip().split(maxsplit=1)
    if len(parts) < 2:
        return None
    payload = parts[1]
    if payload.startswith("ref_"):
        try:
            return int(payload.replace("ref_", "", 1))
        except Exception:
            return None
    return None


async def start_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    if not user:
        return

    text = update.message.text if update.message else ""
    inviter_id = parse_start_payload(text)

    if inviter_id == user.id:
        inviter_id = None

    ensure_user(user.id, user.username, inviter_id)

    base = (PUBLIC_BASE_URL or "").rstrip("/")
    wa_url = f"https://vorn-studio.github.io/0059bot/webapp/?uid={user.id}"

    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton(text="🎲 OPEN DOMINO APP", web_app=WebAppInfo(url=wa_url))]
    ])

    await context.bot.send_message(
        chat_id=user.id,
        text="🎰 Բարի գալուստ Domino Casino.\nՍեղմիր կոճակին՝ բացելու համար WebApp-ը 👇",
        reply_markup=keyboard
    )

    try:
        if update.message:
            await context.bot.pin_chat_message(chat_id=user.id, message_id=update.message.message_id)
    except Exception:
        pass


async def block_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    Որ չատը մաքուր մնա՝ ջնջում ենք ցանկացած տեքստային մեսիջ
    """
    try:
        await update.message.delete()
    except Exception:
        pass


async def btn_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer("OK")


async def stats_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    stats = get_user_stats(user_id)
    if not stats:
        await update.message.reply_text("Չենք գտնում ձեր տվյալները բազայում։")
        return

    msg = (
        f"💳 Ձեր վիճակը\n\n"
        f"Balance: {stats['balance_usd']:.2f}$\n"
        f"Total deposit: {stats['total_deposit_usd']:.2f}$\n"
        f"Total withdraw: {stats['total_withdraw_usd']:.2f}$\n\n"
        f"Referrals: {stats['ref_count']} (active: {stats['active_refs']})\n"
        f"Team deposit: {stats['team_deposit_usd']:.2f}$"
    )
    await update.message.reply_text(msg)

async def admin_add(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if user_id not in ADMIN_IDS:
        await update.message.reply_text("❌ Դու admin չես։")
        return

    if len(context.args) < 2:
        await update.message.reply_text("Օգտագործում՝ /admin_add user_id amount")
        return

    target = int(context.args[0])
    amount = float(context.args[1])

    conn = db()
    c = conn.cursor()
    c.execute("""
        UPDATE dom_users
        SET balance_usd = COALESCE(balance_usd,0) + %s
        WHERE user_id=%s
    """, (amount, target))
    conn.commit()
    release_db(conn)

    await update.message.reply_text(f"✔ {amount}$ ավելացվեց օգտատեր {target}-ի հաշվին։")


async def start_bot_webhook():
    """
    Kարգավորում ենք Telegram–ը Webhook mode-ում,
    նույն լոգիկան, ինչ VORN բոտում։
    """
    global application
    print("🤖 Initializing Domino Telegram bot (Webhook Mode)...")

    application = ApplicationBuilder().token(BOT_TOKEN).build()

    application.add_handler(CommandHandler("start", start_cmd))
    application.add_handler(CommandHandler("stats", stats_cmd))
    application.add_handler(CallbackQueryHandler(btn_handler))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, block_text))
    application.add_handler(CommandHandler("admin_add", admin_add))

    # initialize
    await application.initialize()

    # Set webhook
    port = int(os.environ.get("PORT", "10000"))
    webhook_url = f"{PUBLIC_BASE_URL}/webhook"

    await application.bot.delete_webhook(drop_pending_updates=True)
    await application.bot.set_webhook(url=webhook_url)

    print(f"✅ Webhook set to {webhook_url}")


@app_web.route("/webhook", methods=["POST"])
def telegram_webhook():
    """
    Flask route, որը ստանում է Telegram–ի update-ները
    և փոխանցում է PTB application-ին։
    """
    global application, bot_loop

    if application is None or bot_loop is None:
        print("❌ application or bot_loop is None — bot not ready")
        return jsonify({"ok": False, "error": "bot_not_ready"}), 503

    update_data = request.get_json(force=True, silent=True)
    if not update_data:
        print("⚠️ Empty update")
        return jsonify({"ok": False, "error": "empty_update"}), 400

    try:
        upd = Update.de_json(update_data, application.bot)
        # Async–ով ուղարկում ենք հիմնական loop–ին
        asyncio.run_coroutine_threadsafe(application.process_update(upd), bot_loop)
        return jsonify({"ok": True}), 200
    except Exception as e:
        print("🔥 Webhook error:", e)
        return jsonify({"ok": False, "error": str(e)}), 500


@app_web.route("/api/ton_rate")
def api_ton_rate():
    """
    Returns REAL-TIME TON→USD price directly from tonapi.io
    (ignores DB, always fresh)
    """
    try:
        rate = fetch_ton_rate()
        if rate is None:
            return jsonify({"ok": False, "ton_usd": 0}), 200

        return jsonify({"ok": True, "ton_usd": rate}), 200

    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500



# =========================
# MAIN ENTRYPOINT (Render)
# =========================

if __name__ == "__main__":
    print("✅ Domino bot script loaded.")
    try:
        init_db()
    except Exception as e:
        print("⚠️ init_db failed:", e)

    port = int(os.environ.get("PORT", "10000"))

    def run_flask():
        try:
            print(f"🌍 Flask (Domino) starting on port {port} ...")
            app_web.run(host="0.0.0.0", port=port, threaded=True, use_reloader=False)
        except Exception as e:
            print("🔥 Flask failed:", e)

    def run_bot():
        """
        Telegram bot-ը աշխատում է առանձին thread-ում՝ իր event loop-ով,
        ճիշտ նույն գաղափարը ինչ՝ VORN–ում։
        """
        global bot_loop
        try:
            print("🤖 Starting Domino Telegram bot thread ...")
            bot_loop = asyncio.new_event_loop()
            asyncio.set_event_loop(bot_loop)
            # նախ webhook–ի կարգավորում
            bot_loop.run_until_complete(start_bot_webhook())
            # հետո loop–ը թողնում ենք աշխատի անվերջ
            bot_loop.run_forever()
        except Exception as e:
            print("🔥 Telegram bot failed:", e)

    # Flask-ը որպես հիմնական սերվեր
    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()

    # Telegram bot-ը
    bot_thread = threading.Thread(target=run_bot, daemon=True)
    bot_thread.start()

    # TON live rate updater
    ton_thread = threading.Thread(target=ton_rate_updater, daemon=True)
    ton_thread.start()


    print("🚀 Domino Flask + Telegram bot started.")

    # պահում ենք main process–ը կենդանի
    while True:
        time.sleep(60)
