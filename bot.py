from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
import random
from datetime import datetime, timedelta
import os
from PIL import Image
import io
from PIL import Image
from io import BytesIO
import base64
from dotenv import load_dotenv
import eventlet
eventlet.monkey_patch()
load_dotenv()
import time
import sys
import threading
from typing import Optional
from flask import Flask, jsonify, send_from_directory, request
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room, leave_room
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

import logging
from logging.handlers import RotatingFileHandler

LOG_DIR = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(LOG_DIR, exist_ok=True)

LOG_FILE = os.path.join(LOG_DIR, "domino.log")

logger = logging.getLogger("DOMINO")
logger.setLevel(logging.INFO)
logger.propagate = False

formatter = logging.Formatter(
    "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
)

file_handler = RotatingFileHandler(
    LOG_FILE,
    maxBytes=5 * 1024 * 1024,
    backupCount=5
)
file_handler.setFormatter(formatter)
file_handler.setLevel(logging.INFO)

console_handler = logging.StreamHandler()
console_handler.setFormatter(formatter)
console_handler.setLevel(logging.INFO)

logger.addHandler(file_handler)
logger.addHandler(console_handler)
# --- Redirect all print() to logger ---
class _PrintToLogger:
    def __init__(self, _logger, level=logging.INFO, prefix=""):
        self.logger = _logger
        self.level = level
        self.prefix = prefix

    def write(self, message):
        # print() հաճախ գրում է "\n" առանձին, սրանք անտեսում ենք
        msg = (message or "").rstrip()
        if msg:
            self.logger.log(self.level, f"{self.prefix}{msg}")

    def flush(self):
        # required for file-like interface
        pass

# Redirect stdout/stderr (captures print() from anywhere in the process)
sys.stdout = _PrintToLogger(logger, logging.INFO, prefix="")
sys.stderr = _PrintToLogger(logger, logging.ERROR, prefix="STDERR: ")



BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()
if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN env var is missing")

BASE_URL = os.getenv("BASE_URL", "https://domino-play.online").strip()

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL env var is missing (PostgreSQL connection string)")
ADMIN_IDS = {5274439601} 
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEBAPP_DIR = os.path.join(BASE_DIR, "webapp")
DOMIT_PRICE_USD = 1  # DOMIT հիմա նույնն է, ինչ $ (միայն տեքստով տարբերս)
PORTAL_DIR = os.path.join(WEBAPP_DIR, "portal")
TASKS_DIR = os.path.join(WEBAPP_DIR, "tasks")
GAMES_DIR = os.path.join(WEBAPP_DIR, "games")
BOT_READY = False
ONLINE_USERS = {}

app_web = Flask(__name__, static_folder=None)
CORS(app_web)

socketio = SocketIO(
    app_web,
    cors_allowed_origins="*",
    async_mode="eventlet"
)


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

@app_web.route("/api/message/partners")
def api_message_partners():
    uid = request.args.get("uid", type=int)
    if not uid:
        return jsonify({"ok": False, "error": "no uid"}), 400

    conn = db()
    c = conn.cursor()

    # 1) բոլոր partner id-ները
    c.execute("""
        SELECT DISTINCT
            CASE
                WHEN sender = %s THEN receiver
                ELSE sender
            END AS partner_id
        FROM dom_messages
        WHERE sender = %s OR receiver = %s
        ORDER BY partner_id
    """, (uid, uid, uid))

    partner_ids = [row[0] for row in c.fetchall()]
    if not partner_ids:
        release_db(conn)
        return jsonify({"ok": True, "users": []})

    # 2) partner users info
    c.execute("""
        SELECT user_id, username, avatar
        FROM dom_users
        WHERE user_id = ANY(%s)
    """, (partner_ids,))
    rows = c.fetchall()

    users = []
    for u in rows:
        partner_id = int(u[0])

        avatar_url = u[2] or "/portal/default.png"
        username = u[1] or f"User {partner_id}"

        # --- last message preview (այստեղ partner_id արդեն կա) ---
        c.execute("""
            SELECT id, sender, text, created_at
            FROM dom_messages
            WHERE (sender=%s AND receiver=%s) OR (sender=%s AND receiver=%s)
            ORDER BY id DESC
            LIMIT 1
        """, (uid, partner_id, partner_id, uid))
        lm = c.fetchone()
        last_text = lm[2] if lm else ""
        last_time = int(lm[3]) if lm else 0

        # --- last seen ---
        c.execute("""
            SELECT COALESCE(last_seen_msg_id, 0)
            FROM dom_dm_last_seen
            WHERE user_id=%s AND partner_id=%s
        """, (uid, partner_id))
        seen_row = c.fetchone()
        seen_id = int(seen_row[0]) if seen_row else 0

        # --- unread ---
        c.execute("""
            SELECT COUNT(*)
            FROM dom_messages
            WHERE sender=%s AND receiver=%s AND id > %s
        """, (partner_id, uid, seen_id))
        unread = int(c.fetchone()[0] or 0)

        # --- can reply? (uid follows partner) ---
        c.execute("SELECT 1 FROM dom_follows WHERE follower=%s AND target=%s", (uid, partner_id))
        can_reply = bool(c.fetchone())

        users.append({
            "user_id": partner_id,
            "username": username,
            "avatar": avatar_url,
            "last_text": last_text,
            "last_time": last_time,
            "unread": unread,
            "can_reply": can_reply
        })

    release_db(conn)
    return jsonify({"ok": True, "users": users})

# ========== GLOBAL CHAT API ==========

@app_web.route("/api/global/messages")
def api_global_messages():
    """Վերջին 30 global chat նամակները"""
    conn = db()
    c = conn.cursor()
    
    c.execute("""
        SELECT DISTINCT ON (g.id)
            g.id,
            g.user_id,
            u.username,
            u.avatar,
            COALESCE(pl.tier, 0) AS status_level,
            g.message,
            g.created_at,
            g.highlighted
        FROM dom_global_chat g
        LEFT JOIN dom_users u ON u.user_id = g.user_id
        LEFT JOIN dom_user_miners m ON m.user_id = u.user_id
        LEFT JOIN dom_mining_plans pl ON pl.id = m.plan_id
        ORDER BY g.id DESC
        LIMIT 30
    """)
    rows = c.fetchall()
    release_db(conn)
    
    messages = []
    for r in rows:
        avatar_url = r[3] or "/portal/default.png"

        messages.append({
            "id": r[0],
            "user_id": r[1],
            "username": r[2] or f"User {r[1]}",
            "avatar": avatar_url,
            "status_level": int(r[4] or 0),
            "message": r[5],
            "created_at": int(r[6]),
            "highlighted": bool(r[7] if len(r) > 7 else False)
        })
    
    messages.reverse()  # oldest first
    return jsonify({"ok": True, "messages": messages})

@app_web.route("/api/global/hot-user")
def api_global_hot_user():
    """Global chat-ում ներկա ONLINE ամենա բարձր status ունեցող user-ը"""
    conn = db()
    c = conn.cursor()
    
    # Get online users (pinged in last 15 seconds)
    c.execute("""
        SELECT 
            o.user_id,
            u.username,
            u.avatar,
            (SELECT COALESCE(MAX(pl.tier), 0)
             FROM dom_user_miners m
             JOIN dom_mining_plans pl ON pl.id = m.plan_id
             WHERE m.user_id = u.user_id) AS status_level
        FROM dom_global_chat_online o
        LEFT JOIN dom_users u ON u.user_id = o.user_id
    """)
    
    rows = c.fetchall()
    release_db(conn)
    
    if not rows:
        return jsonify({"ok": True, "hot_user": None})
    
    # Filter only status 6+ users
    eligible = [r for r in rows if int(r[3] or 0) >= 6]
    
    if not eligible:
        return jsonify({"ok": True, "hot_user": None})
    
    # Find highest status
    max_status = max(int(r[3] or 0) for r in eligible)
    
    # Get all users with max status
    top_users = [r for r in eligible if int(r[3] or 0) == max_status]
    
    # Random choice if multiple
    import random
    chosen = random.choice(top_users)
    
    avatar_url = chosen[2] or "/portal/default.png"
    
    return jsonify({
        "ok": True,
        "hot_user": {
            "user_id": chosen[0],
            "username": chosen[1] or f"User {chosen[0]}",
            "avatar": avatar_url,
            "status_level": int(chosen[3] or 0)
        }
    })

@app_web.route("/api/global/ping", methods=["POST"])
def api_global_ping():
    """User-ը ping է անում որ ցույց տա որ online է global chat-ում"""
    data = request.get_json(force=True, silent=True) or {}
    user_id = int(data.get("user_id", 0))
    
    if user_id == 0:
        return jsonify({"ok": False}), 400
    
    now = int(time.time())
    conn = db()
    c = conn.cursor()
    
    c.execute("""
        INSERT INTO dom_global_chat_online (user_id, last_ping)
        VALUES (%s, %s)
        ON CONFLICT (user_id) DO UPDATE SET last_ping = %s
    """, (user_id, now, now))
    
    # Clean offline users (>15 seconds)
    c.execute("""
        DELETE FROM dom_global_chat_online
        WHERE last_ping < %s
    """, (now - 15,))
    
    conn.commit()
    release_db(conn)
    
    return jsonify({"ok": True})

@app_web.route("/api/global/offline", methods=["POST"])
def api_global_offline():
    """User-ը հեռանում է global chat-ից"""
    data = request.get_json(force=True, silent=True) or {}
    user_id = int(data.get("user_id", 0))
    
    if user_id == 0:
        return jsonify({"ok": False}), 400
    
    conn = db()
    c = conn.cursor()
    
    c.execute("""
        DELETE FROM dom_global_chat_online
        WHERE user_id = %s
    """, (user_id,))
    
    conn.commit()
    release_db(conn)
    
    return jsonify({"ok": True})

@app_web.route("/api/global/send", methods=["POST"])
def api_global_send():
    """Global chat նամակ ուղարկել"""
    data = request.get_json(force=True, silent=True) or {}
    user_id = int(data.get("user_id", 0))
    message = data.get("message", "").strip()
    
    if user_id == 0 or message == "":
        return jsonify({"ok": False, "error": "bad_params"}), 400
    
    now = int(time.time())
    conn = db()
    c = conn.cursor()
    
    # Get user status
    c.execute("""
        SELECT COALESCE(MAX(pl.tier), 0)
        FROM dom_user_miners m
        JOIN dom_mining_plans pl ON pl.id = m.plan_id
        WHERE m.user_id = %s
    """, (user_id,))
    
    status_level = int(c.fetchone()[0] or 0)
    
    # ✅ CHECK LENGTH LIMIT
    max_length = 500 if status_level >= 5 else 200
    if len(message) > max_length:
        release_db(conn)
        return jsonify({
            "ok": False,
            "error": "too_long",
            "max_length": max_length
        }), 400
    
    # ✅ CHECK COOLDOWN (Status 0-4 only)
    if status_level < 5:
        c.execute("""
            SELECT last_message_at FROM dom_global_chat_cooldowns
            WHERE user_id = %s
        """, (user_id,))
        
        row = c.fetchone()
        if row:
            last_time = int(row[0])
            elapsed = now - last_time
            
            if elapsed < 10:  # 10 second cooldown
                release_db(conn)
                return jsonify({
                    "ok": False,
                    "error": "cooldown",
                    "wait": 10 - elapsed
                }), 429
        
        # Update cooldown
        c.execute("""
            INSERT INTO dom_global_chat_cooldowns (user_id, last_message_at)
            VALUES (%s, %s)
            ON CONFLICT (user_id) DO UPDATE SET last_message_at = %s
        """, (user_id, now, now))
        conn.commit()
    
    # Insert message
    # ✅ Check if highlight is requested
    highlight = data.get("highlight", False)

    # Only Status 7+ can highlight
    if highlight and status_level < 7:
        highlight = False

    # Insert message
    c.execute("""
        INSERT INTO dom_global_chat (user_id, message, created_at, highlighted)
        VALUES (%s, %s, %s, %s)
        RETURNING id
    """, (user_id, message, now, highlight))
    
    msg_id = c.fetchone()[0]
    
    # Get user info
    c.execute("""
        SELECT username, avatar
        FROM dom_users WHERE user_id = %s
    """, (user_id,))
    
    u = c.fetchone()
    username = u[0] if u else f"User {user_id}"
    avatar = (u[1] or "/portal/default.png") if u else "/portal/default.png"
    
    conn.commit()
    
    # Clean old messages (keep last 30)
    c.execute("""
        DELETE FROM dom_global_chat
        WHERE id NOT IN (
            SELECT id FROM dom_global_chat
            ORDER BY id DESC
            LIMIT 30
        )
    """)
    
    conn.commit()
    release_db(conn)
    
    # Broadcast to all
    realtime_emit("global_new", {
        "id": msg_id,
        "user_id": user_id,
        "username": username,
        "avatar": avatar,
        "status_level": status_level,
        "message": message,
        "time": now,
        "highlighted": highlight,
        "id": msg_id
    }, room="global")
    
    return jsonify({"ok": True, "id": msg_id})

# ==================== DELETE GLOBAL CHAT MESSAGE ====================
@app_web.route("/api/chat/delete", methods=["POST"])
def delete_chat_message():
    try:
        data = request.json
        message_id = data.get("message_id")
        user_id = data.get("user_id")
        
        if not message_id or not user_id:
            return jsonify({"error": "Missing parameters"}), 400
        
        conn = db()
        c = conn.cursor()
        
        c.execute("""
            DELETE FROM dom_global_chat 
            WHERE id = %s AND user_id = %s
        """, (message_id, user_id))
        conn.commit()
        
        deleted = c.rowcount > 0
        release_db(conn)
        
        if not deleted:
            return jsonify({"error": "Not found or unauthorized"}), 404
        
        logger.info(f"User {user_id} deleted global message {message_id}")
        return jsonify({"success": True}), 200
        
    except Exception as e:
        logger.error(f"Delete chat message error: {e}")
        return jsonify({"error": str(e)}), 500


# ==================== DELETE DM MESSAGE ====================
@app_web.route("/api/dm/delete", methods=["POST"])
def delete_dm_message():
    try:
        data = request.json
        message_id = data.get("message_id")
        user_id = data.get("user_id")
        
        if not message_id or not user_id:
            return jsonify({"error": "Missing parameters"}), 400
        
        conn = db()
        c = conn.cursor()
        
        c.execute("""
            DELETE FROM dom_messages
            WHERE id = %s AND sender = %s 
        """, (message_id, user_id))
        conn.commit()
        
        deleted = c.rowcount > 0
        release_db(conn)
        
        if not deleted:
            return jsonify({"error": "Not found or unauthorized"}), 404
        
        logger.info(f"User {user_id} deleted DM {message_id}")
        return jsonify({"success": True}), 200
        
    except Exception as e:
        logger.error(f"Delete DM error: {e}")
        return jsonify({"error": str(e)}), 500

@app_web.route("/api/message/react", methods=["POST"])
def api_message_react():
    """Նամակի վրա emoji react անել"""
    data = request.get_json(force=True, silent=True) or {}
    message_id = int(data.get("message_id", 0))
    chat_type = data.get("chat_type", "")  # "global" or "dm"
    user_id = int(data.get("user_id", 0))
    emoji = data.get("emoji", "").strip()
    
    if message_id == 0 or user_id == 0 or emoji == "" or chat_type not in ["global", "dm"]:
        return jsonify({"ok": False}), 400
    
    now = int(time.time())
    conn = db()
    c = conn.cursor()
    
    # Toggle reaction (եթե կա՝ հեռացնի, եթե չկա՝ ավելացնի)
    c.execute("""
        SELECT id FROM dom_message_reactions
        WHERE message_id=%s AND chat_type=%s AND user_id=%s AND emoji=%s
    """, (message_id, chat_type, user_id, emoji))
    
    existing = c.fetchone()

    if existing:
        # Remove reaction
        c.execute("""
            DELETE FROM dom_message_reactions
            WHERE message_id=%s AND chat_type=%s AND user_id=%s AND emoji=%s
        """, (message_id, chat_type, user_id, emoji))
        action = "removed"
    else:
        # ✅ First, remove any other reaction from this user
        c.execute("""
            DELETE FROM dom_message_reactions
            WHERE message_id=%s AND chat_type=%s AND user_id=%s
        """, (message_id, chat_type, user_id))
        
        # Then add new reaction
        c.execute("""
            INSERT INTO dom_message_reactions (message_id, chat_type, user_id, emoji, created_at)
            VALUES (%s, %s, %s, %s, %s)
        """, (message_id, chat_type, user_id, emoji, now))
        action = "added"
    
    conn.commit()
    
    # Get total reactions for this message
    c.execute("""
        SELECT emoji, COUNT(*) as count
        FROM dom_message_reactions
        WHERE message_id=%s AND chat_type=%s
        GROUP BY emoji
    """, (message_id, chat_type))
    
    reactions = {}
    for row in c.fetchall():
        reactions[row[0]] = int(row[1])
    
    release_db(conn)
    
    if chat_type == "global":
        # Get fire count
        conn_fire = db()
        c_fire = conn_fire.cursor()
        c_fire.execute("""
            SELECT COUNT(*) FROM dom_fire_reactions 
            WHERE message_id=%s
        """, (message_id,))
        fire_count = c_fire.fetchone()[0]
        release_db(conn_fire)
        
        socketio.emit("message_reaction", {
            "message_id": message_id,
            "chat_type": chat_type,
            "reactions": reactions,
            "fire_count": fire_count
        }, room="global")
    else:
        # DM - send to both users
        conn2 = db()
        c2 = conn2.cursor()
        c2.execute("SELECT sender, receiver FROM dom_messages WHERE id=%s", (message_id,))
        msg_row = c2.fetchone()
        release_db(conn2)
        
        if msg_row:
            sender_id = int(msg_row[0])
            receiver_id = int(msg_row[1])
            
            # Get fire count
            conn_fire = db()
            c_fire = conn_fire.cursor()
            c_fire.execute("""
                SELECT COUNT(*) FROM dom_fire_reactions 
                WHERE message_id=%s
            """, (message_id,))
            fire_count = c_fire.fetchone()[0]
            release_db(conn_fire)
            
            socketio.emit("message_reaction", {
                "message_id": message_id,
                "chat_type": chat_type,
                "reactions": reactions,
                "fire_count": fire_count
            }, room=f"user_{sender_id}")
            
            socketio.emit("message_reaction", {
                "message_id": message_id,
                "chat_type": chat_type,
                "reactions": reactions,
                "fire_count": fire_count
            }, room=f"user_{receiver_id}")
    
    return jsonify({"ok": True, "action": action, "reactions": reactions})


@app_web.route("/api/message/reactions")
def api_message_reactions():
    """Նամակի reactions-ները ստանալ"""
    message_id = request.args.get("message_id", type=int)
    chat_type = request.args.get("chat_type", "")
    
    if not message_id or chat_type not in ["global", "dm"]:
        return jsonify({"ok": False}), 400
    
    conn = db()
    c = conn.cursor()
    
    c.execute("""
        SELECT emoji, COUNT(*) as count
        FROM dom_message_reactions
        WHERE message_id=%s AND chat_type=%s
        GROUP BY emoji
    """, (message_id, chat_type))
    
    reactions = {}
    for row in c.fetchall():
        reactions[row[0]] = int(row[1])
    
    # Get fire count from dom_fire_reactions
    c.execute("""
        SELECT COUNT(*) FROM dom_fire_reactions
        WHERE message_id=%s AND chat_type=%s
    """, (message_id, chat_type))
    
    fire_count = int(c.fetchone()[0] or 0)
    
    release_db(conn)
    
    return jsonify({
        "ok": True, 
        "reactions": reactions,
        "fire_count": fire_count
    })


@app_web.route("/api/fire/add", methods=["POST"])
def api_fire_add():
    """Add Domino Star reaction (paid, 0.20 coin)"""
    data = request.get_json(force=True, silent=True) or {}
    message_id = int(data.get("message_id", 0))
    chat_type = data.get("chat_type", "")
    giver_id = int(data.get("giver_id", 0))
    receiver_id = int(data.get("receiver_id", 0))
    
    if message_id == 0 or giver_id == 0 or receiver_id == 0:
        return jsonify({"ok": False, "error": "missing_params"}), 400
    
    if chat_type not in ["global", "dm"]:
        return jsonify({"ok": False, "error": "invalid_chat_type"}), 400
    
    # Can't fire yourself
    if giver_id == receiver_id:
        return jsonify({"ok": False, "error": "cannot_fire_yourself"}), 400
    
    FIRE_PRICE = 0.20
    now = int(time.time())
    
    conn = db()
    c = conn.cursor()
    
    # Check giver balance
    c.execute("SELECT balance_usd FROM dom_users WHERE user_id = %s", (giver_id,))
    row = c.fetchone()
    
    if not row:
        release_db(conn)
        return jsonify({"ok": False, "error": "user_not_found"}), 404
    
    balance = float(row[0] or 0)
    
    if balance < FIRE_PRICE:
        release_db(conn)
        return jsonify({"ok": False, "error": "insufficient_balance"}), 400
    
    # Deduct from giver
    c.execute("""
        UPDATE dom_users 
        SET balance_usd = balance_usd - %s,
            fires_given = fires_given + 1
        WHERE user_id = %s
    """, (FIRE_PRICE, giver_id))
    
    # Add 0.10 to receiver
    c.execute("""
        UPDATE dom_users 
        SET balance_usd = balance_usd + 0.10,
            fires_received = fires_received + 1
        WHERE user_id = %s
    """, (receiver_id,))
    
    # Add 0.10 to burn account
    c.execute("""
        UPDATE dom_burn_account 
        SET total_burned = total_burned + 0.10,
            last_updated = %s
    """, (now,))
    
    # Record fire reaction
    c.execute("""
        INSERT INTO dom_fire_reactions 
        (message_id, chat_type, giver_user_id, receiver_user_id, amount, created_at)
        VALUES (%s, %s, %s, %s, %s, %s)
    """, (message_id, chat_type, giver_id, receiver_id, FIRE_PRICE, now))
    
    conn.commit()
    
    # Get total fires for this message
    c.execute("""
        SELECT COUNT(*) FROM dom_fire_reactions
        WHERE message_id = %s AND chat_type = %s
    """, (message_id, chat_type))
    
    fire_count = int(c.fetchone()[0] or 0)
    
    release_db(conn)
    
    # Broadcast fire update via socket
    if chat_type == "global":
        socketio.emit("fire_update", {
            "message_id": message_id,
            "chat_type": chat_type,
            "fire_count": fire_count
        }, room="global")
    else:
        socketio.emit("fire_update", {
            "message_id": message_id,
            "chat_type": chat_type,
            "fire_count": fire_count
        }, room=f"user_{giver_id}")
        socketio.emit("fire_update", {
            "message_id": message_id,
            "chat_type": chat_type,
            "fire_count": fire_count
        }, room=f"user_{receiver_id}")
    
    return jsonify({
        "ok": True,
        "fire_count": fire_count,
        "new_balance": balance - FIRE_PRICE
    })


@app_web.route("/api/fire/count")
def api_fire_count():
    """Get fire count for a message"""
    message_id = request.args.get("message_id", type=int)
    chat_type = request.args.get("chat_type", "")
    
    if not message_id or chat_type not in ["global", "dm"]:
        return jsonify({"ok": False}), 400
    
    conn = db()
    c = conn.cursor()
    
    c.execute("""
        SELECT COUNT(*) FROM dom_fire_reactions
        WHERE message_id = %s AND chat_type = %s
    """, (message_id, chat_type))
    
    fire_count = int(c.fetchone()[0] or 0)
    
    release_db(conn)
    
    return jsonify({"ok": True, "fire_count": fire_count})

@app_web.route("/api/post/<int:post_id>")
def api_get_single_post(post_id):
    conn = db(); c = conn.cursor()

    c.execute("""
        SELECT p.id, p.user_id, u.username, u.avatar,
               (SELECT COALESCE(MAX(pl.tier),0)
                FROM dom_user_miners m
                JOIN dom_mining_plans pl ON pl.id = m.plan_id
                WHERE m.user_id = u.user_id) AS status_level,
               p.text, p.media_url, p.likes, p.created_at
        FROM dom_posts p
        JOIN dom_users u ON u.user_id = p.user_id
        WHERE p.id = %s
    """, (post_id,))

    row = c.fetchone()
    release_db(conn)

    if not row:
        return jsonify({"ok": False, "error": "post_not_found"}), 404

    avatar_url = row[4] or row[3] or "/portal/default.png"

    return jsonify({
        "ok": True,
        "post": {
            "id": row[0],
            "user_id": row[1],
            "username": row[2],
            "avatar": avatar_url,
            "status_level": int(row[5] or 0),
            "text": row[6],
            "media_url": row[7],
            "likes": int(row[8] or 0),
            "created_at": int(row[9]),
        }
    })



@app_web.route("/api/message/send", methods=["POST"])
def api_message_send():
    data = request.get_json(force=True, silent=True) or {}
    sender = int(data.get("sender", 0))
    receiver = int(data.get("receiver", 0))
    text = data.get("text", "").strip()
    reply_to = data.get("reply_to")

    if sender == 0 or receiver == 0 or text == "":
        return jsonify({"ok": False, "error": "bad_params"}), 400

    now = int(time.time())
    conn = db(); c = conn.cursor()
    # ✅ sender-ը կարող է գրել միայն նրան, ում follow է անում
    c.execute("SELECT 1 FROM dom_follows WHERE follower=%s AND target=%s", (sender, receiver))
    if not c.fetchone():
        release_db(conn)
        return jsonify({"ok": False, "error": "need_follow"}), 200

    reply_text = None

    if reply_to:
        c.execute("SELECT text FROM dom_messages WHERE id=%s", (reply_to,))
        r = c.fetchone()
        if r:
            reply_text = r[0]

    c.execute("""
        INSERT INTO dom_messages (sender, receiver, text, reply_to, created_at)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id
    """, (sender, receiver, text, reply_to, now))

    message_id = c.fetchone()[0]
    conn.commit()


    room = f"dm_{min(sender, receiver)}_{max(sender, receiver)}"

    

    realtime_emit(
        "dm_new",
        {
            "id": message_id,
            "sender": sender,
            "receiver": receiver,
            "text": text,
            "time": now,
            "reply_to": reply_to,
            "reply_to_text": reply_text
        },
        room=room
    )



        # ✅ Notify receiver (inbox badge), even if DM room not open
    realtime_emit(
        "dm_notify",
        {
            "partner_id": sender,
            "sender": sender,
            "text": text[:120],
            "time": now
        },
        room=f"user_{receiver}"
    )


    release_db(conn)

    return jsonify({"ok": True})

@app_web.route("/api/chat/forward", methods=["POST"])
def api_forward_global():
    """Forward message from Global Chat to DM"""
    data = request.get_json(force=True, silent=True) or {}
    user_id = int(data.get("user_id", 0))
    message_id = int(data.get("message_id", 0))
    target_user_id = int(data.get("target_user_id", 0))
    
    if user_id == 0 or message_id == 0 or target_user_id == 0:
        return jsonify({"ok": False, "error": "bad_params"}), 400
    
    conn = db()
    c = conn.cursor()
    
    # Get original message
    c.execute("""
        SELECT g.message, g.user_id, u.username 
        FROM dom_global_chat g
        LEFT JOIN dom_users u ON u.user_id = g.user_id
        WHERE g.id = %s
    """, (message_id,))
    
    row = c.fetchone()
    if not row:
        release_db(conn)
        return jsonify({"ok": False, "error": "message_not_found"}), 404
    
    original_text, original_sender, original_username = row
    original_username = original_username or f"User {original_sender}"
    
    # Check if original sender allows forwarding
    c.execute("SELECT allow_forward FROM dom_users WHERE user_id = %s", (original_sender,))
    allow_row = c.fetchone()
    if allow_row and int(allow_row[0] or 1) == 0:
        release_db(conn)
        return jsonify({"ok": False, "error": "forwarding_disabled"}), 403
    
    # Check if user follows target
    c.execute("SELECT 1 FROM dom_follows WHERE follower=%s AND target=%s", (user_id, target_user_id))
    if not c.fetchone():
        release_db(conn)
        return jsonify({"ok": False, "error": "need_follow"}), 403
    
    # Create forwarded message
    now = int(time.time())
    forward_text = f"📩 Forwarded from @{original_username}:\n\n{original_text}"
    
    c.execute("""
        INSERT INTO dom_messages (sender, receiver, text, created_at)
        VALUES (%s, %s, %s, %s)
        RETURNING id
    """, (user_id, target_user_id, forward_text, now))
    
    new_msg_id = c.fetchone()[0]
    conn.commit()
    
    # Send realtime notification
    room = f"dm_{min(user_id, target_user_id)}_{max(user_id, target_user_id)}"
    realtime_emit("dm_new", {
        "id": new_msg_id,
        "sender": user_id,
        "receiver": target_user_id,
        "text": forward_text,
        "time": now
    }, room=room)
    
    realtime_emit("dm_notify", {
        "partner_id": user_id,
        "sender": user_id,
        "text": forward_text[:120],
        "time": now
    }, room=f"user_{target_user_id}")
    
    release_db(conn)
    return jsonify({"ok": True})


@app_web.route("/api/dm/forward", methods=["POST"])
def api_forward_dm():
    """Forward message from DM to another DM or Global Chat"""
    data = request.get_json(force=True, silent=True) or {}
    user_id = int(data.get("user_id", 0))
    message_id = int(data.get("message_id", 0))
    target_user_id = data.get("target_user_id")  # None if forwarding to global
    to_global = data.get("to_global", False)
    
    if user_id == 0 or message_id == 0:
        return jsonify({"ok": False, "error": "bad_params"}), 400
    
    if not to_global and not target_user_id:
        return jsonify({"ok": False, "error": "no_target"}), 400
    
    conn = db()
    c = conn.cursor()
    
    # Get original message
    c.execute("""
        SELECT m.text, m.sender, u.username 
        FROM dom_messages m
        LEFT JOIN dom_users u ON u.user_id = m.sender
        WHERE m.id = %s
    """, (message_id,))
    
    row = c.fetchone()
    if not row:
        release_db(conn)
        return jsonify({"ok": False, "error": "message_not_found"}), 404
    
    original_text, original_sender, original_username = row
    original_username = original_username or f"User {original_sender}"
    
    # Check if original sender allows forwarding
    c.execute("SELECT allow_forward FROM dom_users WHERE user_id = %s", (original_sender,))
    allow_row = c.fetchone()
    if allow_row and int(allow_row[0] or 1) == 0:
        release_db(conn)
        return jsonify({"ok": False, "error": "forwarding_disabled"}), 403
    
    now = int(time.time())
    forward_text = f"📩 Forwarded from @{original_username}:\n\n{original_text}"
    
    if to_global:
        # Forward to Global Chat
        c.execute("""
            INSERT INTO dom_global_chat (user_id, message, created_at)
            VALUES (%s, %s, %s)
            RETURNING id
        """, (user_id, forward_text, now))
        
        new_msg_id = c.fetchone()[0]
        conn.commit()
        
        # Get user info for realtime
        c.execute("""
            SELECT username, avatar,
                   (SELECT COALESCE(MAX(pl.tier),0)
                    FROM dom_user_miners m
                    JOIN dom_mining_plans pl ON pl.id = m.plan_id
                    WHERE m.user_id = %s) AS status_level
            FROM dom_users WHERE user_id = %s
        """, (user_id, user_id))
        
        user_row = c.fetchone()
        username = user_row[0] if user_row else f"User {user_id}"
        avatar = (user_row[1] or "/portal/default.png") if user_row else "/portal/default.png"
        status_level = int(user_row[2]) if user_row else 0
        
        realtime_emit("global_new", {
            "id": new_msg_id,
            "user_id": user_id,
            "username": username,
            "avatar": avatar,
            "status_level": status_level,
            "message": forward_text,
            "time": now,
            "highlighted": False
        }, room="global")
        
    else:
        # Forward to DM
        target_user_id = int(target_user_id)
        
        # Check if user follows target
        c.execute("SELECT 1 FROM dom_follows WHERE follower=%s AND target=%s", (user_id, target_user_id))
        if not c.fetchone():
            release_db(conn)
            return jsonify({"ok": False, "error": "need_follow"}), 403
        
        c.execute("""
            INSERT INTO dom_messages (sender, receiver, text, created_at)
            VALUES (%s, %s, %s, %s)
            RETURNING id
        """, (user_id, target_user_id, forward_text, now))
        
        new_msg_id = c.fetchone()[0]
        conn.commit()
        
        room = f"dm_{min(user_id, target_user_id)}_{max(user_id, target_user_id)}"
        realtime_emit("dm_new", {
            "id": new_msg_id,
            "sender": user_id,
            "receiver": target_user_id,
            "text": forward_text,
            "time": now
        }, room=room)
        
        realtime_emit("dm_notify", {
            "partner_id": user_id,
            "sender": user_id,
            "text": forward_text[:120],
            "time": now
        }, room=f"user_{target_user_id}")
    
    release_db(conn)
    return jsonify({"ok": True})

@app_web.route("/api/message/history")
def api_message_history():
    u1 = int(request.args.get("u1", 0))
    u2 = int(request.args.get("u2", 0))

    if u1 == 0 or u2 == 0:
        return jsonify({"ok": False, "error": "bad_params"}), 400

    conn = db(); c = conn.cursor()

    c.execute("""
        SELECT
            m.id,

            m.sender,
            su.username,
            su.avatar,
            (SELECT COALESCE(MAX(pl.tier),0)
                FROM dom_user_miners mm
                JOIN dom_mining_plans pl ON pl.id = mm.plan_id
                WHERE mm.user_id = su.user_id) AS sender_status,

            m.receiver,
            ru.username,
            ru.avatar,
            (SELECT COALESCE(MAX(pl.tier),0)
                FROM dom_user_miners mm
                JOIN dom_mining_plans pl ON pl.id = mm.plan_id
                WHERE mm.user_id = ru.user_id) AS receiver_status,

            m.text,
            m.reply_to,
            rm.text AS reply_to_text,
            m.created_at
        FROM dom_messages m
        LEFT JOIN dom_users su ON su.user_id = m.sender
        LEFT JOIN dom_users ru ON ru.user_id = m.receiver
        LEFT JOIN dom_messages rm ON rm.id = m.reply_to
        WHERE (m.sender=%s AND m.receiver=%s)
           OR (m.sender=%s AND m.receiver=%s)
        ORDER BY m.id DESC
        LIMIT 50
    """, (u1, u2, u2, u1))

    rows = c.fetchall()
    release_db(conn)

    messages = []

    for r in rows:
        sender_avatar = r[3] or "/portal/default.png"
        receiver_avatar = r[7] or "/portal/default.png"

        messages.append({
            "id": r[0],
            "sender": r[1],
            "username": r[2] or f"User {r[1]}",
            "avatar": sender_avatar,
            "status_level": int(r[4] or 0),
            "receiver": r[5],
            "receiver_username": r[6] or f"User {r[5]}",
            "receiver_avatar": receiver_avatar,
            "receiver_status_level": int(r[8] or 0),
            "text": r[9] or "",
            "reply_to": r[10],
            "reply_to_text": r[11],
            "time": r[12],
        })

    messages.reverse()
    return jsonify({"ok": True, "messages": messages})


@app_web.route("/api/wallet_connect", methods=["POST"])
def api_wallet_connect():
    data = request.get_json(force=True, silent=True) or {}
    user_id = int(data.get("user_id", 0))
    wallet = (data.get("wallet") or "").strip()

    if not user_id or not wallet:
        return jsonify({"ok": False, "error": "bad_params"}), 400

    conn = db(); c = conn.cursor()
    c.execute("""
        UPDATE dom_users
        SET wallet_address = %s
        WHERE user_id = %s
    """, (wallet, user_id))
    conn.commit()
    release_db(conn)

    user = get_user_stats(user_id)
    return jsonify({"ok": True, "user": user})




@app_web.route("/api/global/history")
def api_global_history():
    conn = db(); c = conn.cursor()
    c.execute("""
        SELECT 
            g.user_id,
            u.username,
            (SELECT COALESCE(MAX(pl.tier),0)
                FROM dom_user_miners m
                JOIN dom_mining_plans pl ON pl.id = m.plan_id
                WHERE m.user_id = u.user_id) AS status_level,
            g.message,
            g.created_at
        FROM dom_global_chat g
        LEFT JOIN dom_users u ON u.user_id = g.user_id
        ORDER BY g.id DESC
        LIMIT 30
    """)
    rows = c.fetchall()
    release_db(conn)

    messages = []
    for r in rows:
        messages.append({
            "sender": r[0],
            "username": r[1] or f"User {r[0]}",
            "status_level": int(r[2] or 0),
            "text": r[3],
            "time": r[4],
        })

    messages.reverse()
    return jsonify({"ok": True, "messages": messages})



@app_web.route("/api/follows/list")
def api_follows_list():
    uid = int(request.args.get("uid", 0))
    if uid == 0:
        return jsonify({"ok": False}), 400

    conn = db(); c = conn.cursor()
    c.execute("""
        SELECT u.user_id, u.username, u.avatar
        FROM dom_follows f
        JOIN dom_users u ON u.user_id = f.target
        WHERE f.follower = %s
    """, (uid,))
    rows = c.fetchall()
    release_db(conn)

    users = []
    for r in rows:
        avatar = r[3] if r[3] else (r[2] or "/portal/default.png")
        users.append({
            "user_id": r[0],
            "username": r[1],
            "avatar": avatar
        })

    return jsonify({"ok": True, "list": users})


@app_web.route("/api/upload_avatar", methods=["POST"])
def upload_avatar():
    uid = request.form.get("uid")
    file = request.files.get("avatar")

    if not uid or not file:
        return jsonify({"ok": False, "error": "missing"}), 400

    try:
        # Read image
        img = Image.open(file.stream)
        
        # Convert to RGB if necessary (PNG with transparency)
        if img.mode in ('RGBA', 'LA', 'P'):
            background = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
            img = background
        
        # Resize to 100x100
        img.thumbnail((100, 100), Image.Resampling.LANCZOS)
        
        # Convert to WebP
        buffer = io.BytesIO()
        img.save(buffer, format="WEBP", quality=85)
        buffer.seek(0)
        
        # Convert to base64
        b64 = base64.b64encode(buffer.read()).decode("utf-8")
        avatar_data = f"data:image/webp;base64,{b64}"
        
        # Save to database
        conn = db()
        c = conn.cursor()
        c.execute("""
            UPDATE dom_users
            SET avatar = %s 
            WHERE user_id = %s
        """, (avatar_data, uid))
        conn.commit()
        release_db(conn)
        
        return jsonify({"ok": True})
        
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@app_web.route("/api/search_users")
def api_search_users():
    q = request.args.get("q", "").strip().lower()
    viewer = request.args.get("viewer")

    conn = db(); c = conn.cursor()

    if q == "":
        c.execute("""
            SELECT
                u.user_id,
                u.username,
                u.avatar,
                (
                    SELECT COALESCE(MAX(pl.tier),0)
                    FROM dom_user_miners m
                    JOIN dom_mining_plans pl ON pl.id = m.plan_id
                    WHERE m.user_id = u.user_id
                ) AS status_level
            FROM dom_users u
        """)
    else:
        c.execute("""
            SELECT 
                u.user_id, 
                u.username, 
                u.avatar,
                (
                    SELECT COALESCE(MAX(pl.tier),0)
                    FROM dom_user_miners m
                    JOIN dom_mining_plans pl ON pl.id = m.plan_id
                    WHERE m.user_id = u.user_id
                ) AS status_level
            FROM dom_users u
            WHERE LOWER(u.username) LIKE %s
            ORDER BY u.user_id DESC
            LIMIT 50
        """, (f"%{q}%",))

    rows = c.fetchall()

    users = []
    for u in rows:
        if viewer and str(u[0]) == str(viewer):
            continue

        status_level = 0
        if len(u) > 3:
            status_level = int(u[3] or 0)

        # Check if viewer follows this user
        is_following = False
        if viewer:
            c.execute("""
                SELECT 1 FROM dom_follows 
                WHERE follower = %s AND target = %s
            """, (viewer, u[0]))
            is_following = c.fetchone() is not None

        users.append({
            "user_id": u[0],
            "status_level": status_level,
            "username": u[1] or "",
            "avatar": u[2] or "/portal/default.png",
            "is_following": is_following
        })

    release_db(conn)
    return jsonify({"ok": True, "users": users})

@socketio.on("join")
def on_join(data):
    room = data.get("room")
    if room:
        join_room(room)

@socketio.on("connect")
def on_connect():
    logger.info(f"🟢 Socket connected | sid={request.sid}")

@socketio.on("disconnect")
def on_disconnect():
    logger.info(f"🔴 Socket disconnected | sid={request.sid}")
    
    offline_uid = None
    for uid, sid in list(ONLINE_USERS.items()):
        if sid == request.sid:
            offline_uid = uid
            del ONLINE_USERS[uid]
            break
    
    if offline_uid:
        emit("user_offline", {"user_id": offline_uid}, broadcast=True)

@socketio.on("join_user")
def on_join_user(data):
    # data can be dict {"uid":123} OR just "123"/123
    uid_val = None
    if isinstance(data, dict):
        uid_val = data.get("uid") or data.get("user_id")
    else:
        uid_val = data

    try:
        uid = int(uid_val or 0)
    except Exception:
        uid = 0

    if uid:
        join_room(f"user_{uid}")
        ONLINE_USERS[uid] = request.sid
        logger.info(f"👤 joined user_{uid}")
        
        emit("user_online", {"user_id": uid}, broadcast=True)



@socketio.on("join_global")
def on_join_global():
    join_room("global")
    logger.info(f"🌍 joined global | sid={request.sid}")

@socketio.on("join_feed")
def on_join_feed():
    join_room("feed")
    logger.info("📰 joined feed")

@socketio.on("join_post")
def on_join_post(data):
    post_id = int(data.get("post_id", 0))
    if post_id:
        join_room(f"post_{post_id}")
        logger.info(f"💬 joined post_{post_id}")

@socketio.on("join_dm")
def on_join_dm(data):
    u1 = int(data.get("u1", 0))
    u2 = int(data.get("u2", 0))
    if u1 and u2:
        room = f"dm_{min(u1,u2)}_{max(u1,u2)}"
        join_room(room)
        logger.info(f"✉️ joined {room}")

@socketio.on("typing_global")
def handle_typing_global(data):
    """User-ը գրում է global chat-ում"""
    user_id = int(data.get("user_id", 0))
    
    if user_id == 0:
        return
    
    conn = db()
    c = conn.cursor()
    
    # Get username
    c.execute("SELECT username FROM dom_users WHERE user_id = %s", (user_id,))
    row = c.fetchone()
    username = row[0] if row else f"User {user_id}"
    
    release_db(conn)
    
    # Broadcast to all in global chat (except sender)
    emit("user_typing_global", {
        "user_id": user_id,
        "username": username
    }, room="global", skip_sid=request.sid, broadcast=True)


@socketio.on("typing_dm")
def handle_typing_dm(data):
    """User-ը գրում է DM-ում"""
    sender = int(data.get("sender", 0))
    receiver = int(data.get("receiver", 0))
    
    if sender == 0 or receiver == 0:
        return
    
    conn = db()
    c = conn.cursor()
    
    # Get username
    c.execute("SELECT username FROM dom_users WHERE user_id = %s", (sender,))
    row = c.fetchone()
    username = row[0] if row else f"User {sender}"
    
    release_db(conn)
    
    # Send only to receiver
    emit("user_typing_dm", {
        "sender": sender,
        "username": username
    }, room=f"user_{receiver}", broadcast=True)

@app_web.route("/webapp/games/<path:filename>")
def serve_games(filename):
    games_dir = os.path.join(WEBAPP_DIR, "games")
    return send_from_directory(games_dir, filename)

@app_web.route("/favicon.ico")
def favicon():
    assets_dir = os.path.join(WEBAPP_DIR, "assets")
    return send_from_directory(assets_dir, "favicon.ico")

@app_web.route('/webapp/tasks/<path:filename>')
def webapp_tasks(filename):
    return send_from_directory(TASKS_DIR, filename)

@app_web.route("/portal")
@app_web.route("/portal/")
def portal_page():
    return send_from_directory(PORTAL_DIR, "portal.html")

@app_web.route("/portal/<path:filename>")
def serve_portal(filename):
    return send_from_directory(PORTAL_DIR, filename)

UPLOADS_DIR = os.path.join(WEBAPP_DIR, "uploads")

@app_web.route("/uploads/<path:filename>")
def serve_uploads(filename):
    return send_from_directory(UPLOADS_DIR, filename)

@app_web.route("/api/set_username", methods=["POST"])
def api_set_username():
    data = request.get_json()
    uid = data.get("uid")
    username = data.get("username")

    if not uid or not username:
        return jsonify({"ok": False, "error": "Missing data"}), 400

    conn = db()
    c = conn.cursor()
    c.execute("UPDATE dom_users SET username=%s WHERE user_id=%s", (username, uid))
    conn.commit()
    release_db(conn)

    return jsonify({"ok": True})

@app_web.route("/api/get_domit_prices")
def api_get_domit_prices():
    """Get DOMIT/TON price history for chart"""
    try:
        conn_obj = db()
        c = conn_obj.cursor()
        
        c.execute("""
            SELECT timestamp, open, high, low, close
            FROM domit_price_history
            ORDER BY timestamp ASC
            LIMIT 288
        """)
        
        rows = c.fetchall()
        candles = []
        
        from datetime import datetime
        for row in rows:
            dt = datetime.strptime(row[0], '%Y-%m-%d %H:%M:%S')
            unix_time = int(dt.timestamp())
            
            candles.append({
                'time': unix_time,
                'open': float(row[1]),
                'high': float(row[2]),
                'low': float(row[3]),
                'close': float(row[4])
            })
        
        conn_obj.close()
        return jsonify({'candles': candles})
    
    except Exception as e:
        logger.error(f"❌ Error in api_get_domit_prices: {e}")
        return jsonify({'candles': []})

@app_web.route("/api/settings/toggle-forward", methods=["POST"])
def api_toggle_forward():
    """Toggle allow_forward setting"""
    data = request.get_json(force=True, silent=True) or {}
    user_id = int(data.get("user_id", 0))
    allow = int(data.get("allow", 1))
    
    if user_id == 0:
        return jsonify({"ok": False, "error": "no user_id"}), 400
    
    conn = db()
    c = conn.cursor()
    
    c.execute("""
        UPDATE dom_users 
        SET allow_forward = %s 
        WHERE user_id = %s
    """, (allow, user_id))
    
    conn.commit()
    release_db(conn)
    
    return jsonify({"ok": True, "allow_forward": allow})

@app_web.route("/api/follow", methods=["POST"])
def api_follow():
    data = request.get_json()
    follower = int(data.get("follower"))
    target = int(data.get("target"))

    ADMIN_ID = 5274439601

    if follower == target:
        return jsonify({"ok": False, "error": "cannot_follow_self"}), 200

    conn = db(); c = conn.cursor()

    c.execute("""
        SELECT 1 FROM dom_follows
        WHERE follower = %s AND target = %s
    """, (follower, target))
    already = c.fetchone()
    if already:
        release_db(conn)
        return jsonify({"ok": True, "already": True}), 200
    
    c.execute("SELECT balance_usd FROM dom_users WHERE user_id=%s", (follower,))
    row = c.fetchone()
    if not row:
        release_db(conn)
        return jsonify({"ok": False, "error": "user_not_found"}), 404

    balance = float(row[0])

    FOLLOW_PRICE = 5.0
    PAY_TARGET = 2.0
    BURN_AMOUNT = 3.0

    try:
        apply_burn_transaction(
            from_user=follower,
            total_amount=FOLLOW_PRICE,
            transfers=[(target, PAY_TARGET)],
            burn_amount=BURN_AMOUNT,
            reason="follow"
        )
    except ValueError:
        release_db(conn)
        return jsonify({"ok": False, "error": "low_balance"}), 200


    c.execute("""
        INSERT INTO dom_follows (follower, target)
        VALUES (%s, %s)
        ON CONFLICT DO NOTHING
    """, (follower, target))

    conn.commit()
    realtime_emit(
        "follow_new",
        {
            "follower": follower,
            "target": target
        },
        room=f"user_{target}"
    )

    release_db(conn)

    return jsonify({"ok": True}), 200

@app_web.route("/api/comment/delete", methods=["POST"])
def api_comment_delete():
    data = request.get_json()
    cid = data.get("comment_id")
    uid = data.get("user_id")

    if not cid or not uid:
        return jsonify({"ok": False}), 400

    conn = db(); c = conn.cursor()

    c.execute("""
        DELETE FROM dom_comments 
        WHERE id=%s AND (user_id=%s OR post_id IN(
            SELECT id FROM dom_posts WHERE user_id=%s
        ))
    """, (cid, uid, uid))

    conn.commit()
    release_db(conn)
    return jsonify({"ok": True})

@app_web.route("/api/post/delete", methods=["POST"])
def api_post_delete():
    data = request.get_json()
    pid = data.get("post_id")
    uid = data.get("user_id")

    conn = db(); c = conn.cursor()
    c.execute("DELETE FROM dom_posts WHERE id=%s AND user_id=%s", (pid, uid))
    conn.commit()
    release_db(conn)
    return jsonify({"ok": True})

@app_web.route("/api/admin/give", methods=["POST"])
def api_admin_give():
    data = request.get_json()
    secret = data.get("secret")
    target = int(data.get("target", 0))
    amount = float(data.get("amount", 0))

    ADMIN_SECRET = "super059key"

    if secret != ADMIN_SECRET:
        return jsonify({"ok": False, "error": "forbidden"}), 403

    if target == 0 or amount <= 0:
        return jsonify({"ok": False, "error": "bad_params"}), 400

    conn = db(); c = conn.cursor()
    c.execute("""
        UPDATE dom_users
        SET balance_usd = balance_usd + %s
        WHERE user_id=%s
    """, (amount, target))
    conn.commit()
    release_db(conn)

    return jsonify({"ok": True, "message": f"Added {amount} DOMIT to {target}"})

@app_web.route("/api/follow_stats/<int:user_id>")
def api_follow_stats(user_id):
    conn = db(); c = conn.cursor()

    c.execute("SELECT COUNT(*) FROM dom_follows WHERE target=%s", (user_id,))
    followers = c.fetchone()[0]

    c.execute("SELECT COUNT(*) FROM dom_follows WHERE follower=%s", (user_id,))
    following = c.fetchone()[0]

    release_db(conn)

    return jsonify({"ok": True, "followers": followers, "following": following})

@app_web.route("/api/is_following/<int:follower>/<int:target>")
def api_is_following(follower, target):
    """
    Ստուգում ենք՝ follower-ը follow արե՞լ է target-ին, թե ոչ։
    """
    if follower == 0 or target == 0:
        return jsonify({"ok": False, "error": "bad_params"}), 400

    conn = db(); c = conn.cursor()
    c.execute("""
        SELECT 1 FROM dom_follows
        WHERE follower = %s AND target = %s
    """, (follower, target))
    row = c.fetchone()
    release_db(conn)

    return jsonify({
        "ok": True,
        "self": (follower == target),
        "is_following": bool(row)
    })

@app_web.route("/api/post/create", methods=["POST"])
def api_post_create():
    """
    Ստեղծում է նոր post Domino Portal–ի համար։
    Body: { "user_id": ..., "text": optional, "media_url": optional }
    """
    data = request.get_json(force=True, silent=True) or {}
    user_id = int(data.get("user_id", 0))
    text = (data.get("text") or "").strip()
    media_url = (data.get("media_url") or "").strip()

    if not user_id or (text == "" and media_url == ""):
        return jsonify({"ok": False, "error": "bad_params"}), 400

    now = int(time.time())
    conn = db(); c = conn.cursor()

    c.execute("""
        INSERT INTO dom_posts (user_id, text, media_url, created_at)
        VALUES (%s, %s, %s, %s)
        RETURNING id
    """, (user_id, text, media_url, now))
    pid = c.fetchone()[0]

    conn.commit()
    realtime_emit(
        "post_new",
        {
            "post_id": pid,
            "user_id": user_id
        },
        room="feed"
    )

    release_db(conn)

    return jsonify({"ok": True, "post_id": pid})

@app_web.route("/api/comment/list")
def api_comment_list():
    post_id = request.args.get("post_id", type=int)
    if not post_id:
        return jsonify({"ok": False, "error": "missing post_id"}), 400

    conn = db(); c = conn.cursor()
    c.execute("""
        SELECT 
            c.id,
            c.user_id,
            c.text,
            c.created_at,
            u.username,
            p.user_id AS post_owner_id,
            c.likes,
            c.parent_id,
            (SELECT COALESCE(MAX(pl.tier),0)
            FROM dom_user_miners m
            JOIN dom_mining_plans pl ON pl.id = m.plan_id
            WHERE m.user_id = u.user_id) AS status_level
        FROM dom_comments c
        JOIN dom_users u ON u.user_id = c.user_id
        JOIN dom_posts p ON p.id = c.post_id
        WHERE c.post_id = %s
        ORDER BY c.id ASC
    """, (post_id,))


    rows = c.fetchall()
    release_db(conn)

    comments = [{
        "id": r[0],
        "user_id": r[1],
        "text": r[2],
        "status_level": int(r[8] or 0),
        "created_at": r[3],
        "username": r[4] or ("User " + str(r[1])),
        "post_owner_id": r[5],
        "likes": r[6] or 0,
        "parent_id": r[7]
    } for r in rows]

    return jsonify({"ok": True, "comments": comments})

@app_web.route("/api/comment/create", methods=["POST"])
def api_comment_create():
    data = request.get_json(force=True, silent=True) or {}
    user_id = data.get("user_id")
    post_id = data.get("post_id")
    text = (data.get("text") or "").strip()
    parent_id = data.get("reply_to") or None

    if not user_id or not post_id or not text:
        return jsonify({"ok": False, "error": "missing data"}), 400

    now = int(time.time())

    conn = db(); c = conn.cursor()
    c.execute("""
        INSERT INTO dom_comments (post_id, user_id, text, created_at, parent_id)
        VALUES (%s, %s, %s, %s, %s)
    """, (post_id, user_id, text, now, parent_id))

    conn.commit()
    realtime_emit(
        "comment_new",
        {
            "post_id": post_id
        },
        room=f"post_{post_id}"
    )

    release_db(conn)

    return jsonify({"ok": True})

@app_web.route("/api/message/seen", methods=["POST"])
def api_message_seen():
    data = request.get_json(force=True, silent=True) or {}
    uid = int(data.get("uid", 0))
    partner = int(data.get("partner", 0))

    if not uid or not partner:
        return jsonify({"ok": False, "error": "bad_params"}), 400

    conn = db(); c = conn.cursor()

    # գտնում ենք conversation-ի վերջին msg id-ն
    c.execute("""
        SELECT COALESCE(MAX(id), 0)
        FROM dom_messages
        WHERE (sender=%s AND receiver=%s) OR (sender=%s AND receiver=%s)
    """, (uid, partner, partner, uid))
    last_id = int(c.fetchone()[0] or 0)

    now = int(time.time())
    c.execute("""
        INSERT INTO dom_dm_last_seen (user_id, partner_id, last_seen_msg_id, updated_at)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (user_id, partner_id)
        DO UPDATE SET last_seen_msg_id=EXCLUDED.last_seen_msg_id, updated_at=EXCLUDED.updated_at
    """, (uid, partner, last_id, now))

    conn.commit()
    release_db(conn)
    return jsonify({"ok": True, "last_seen": last_id})


@app_web.route("/api/posts/feed")
def api_posts_feed():
    """
    Հիմնական feed՝ խառը օգտատերերի post–երով։
    Query: ?uid=VIEWER_ID  (պետք ա like-ի ստատուսը ցույց տալու համար)
    """
    viewer_raw = request.args.get("uid", "0")
    try:
        viewer_id = int(viewer_raw)
    except Exception:
        viewer_id = 0

    conn = db(); c = conn.cursor()
    c.execute("""
        SELECT p.id, p.user_id, u.username, u.avatar,
            (SELECT COALESCE(MAX(pl.tier),0)
                FROM dom_user_miners m
                JOIN dom_mining_plans pl ON pl.id = m.plan_id
                WHERE m.user_id = u.user_id) AS status_level,
            p.text, p.media_url, p.likes, p.created_at
        FROM dom_posts p
        JOIN dom_users u ON u.user_id = p.user_id
        ORDER BY p.created_at DESC
        LIMIT 50
    """)

    rows = c.fetchall()

    liked_map = {}
    if viewer_id:
        c.execute("""
            SELECT post_id
            FROM dom_post_likes
            WHERE user_id = %s
        """, (viewer_id,))
        liked_rows = c.fetchall()
        liked_map = {r[0]: True for r in liked_rows}

    release_db(conn)

    posts = []
    for r in rows:
        pid, uid, username, avatar, status_level, text, media_url, likes, created_at = r

        posts.append({
            "id": pid,
            "user_id": uid,
            "username": username or "",
            "avatar": avatar or "/portal/default.png",
            "text": text,
            "status_level": int(status_level or 0),
            "media_url": media_url,
            "likes": int(likes or 0),
            "created_at": int(created_at),
            "liked": bool(liked_map.get(pid, False))
        })

    return jsonify({"ok": True, "posts": posts})

@app_web.route("/api/posts/user/<int:user_id>")
def api_posts_user(user_id):
    """
    Վերադարձնում է user-ի սեփական post–երը։
    Optional viewer=? param like-ի ստատուսի համար։
    """
    viewer_raw = request.args.get("viewer", "0")
    try:
        viewer_id = int(viewer_raw)
    except Exception:
        viewer_id = 0

    conn = db(); c = conn.cursor()
    c.execute("""
        SELECT p.id, p.user_id, u.username, u.avatar,
            (SELECT COALESCE(MAX(pl.tier),0)
                FROM dom_user_miners m
                JOIN dom_mining_plans pl ON pl.id = m.plan_id
                WHERE m.user_id = u.user_id) AS status_level,
            p.text, p.media_url, p.likes, p.created_at
        FROM dom_posts p
        JOIN dom_users u ON u.user_id = p.user_id
        WHERE p.user_id = %s
        ORDER BY p.created_at DESC
        LIMIT 50
    """, (user_id,))

    rows = c.fetchall()

    liked_map = {}
    if viewer_id:
        c.execute("""
            SELECT post_id
            FROM dom_post_likes
            WHERE user_id = %s
        """, (viewer_id,))
        liked_rows = c.fetchall()
        liked_map = {r[0]: True for r in liked_rows}

    release_db(conn)

    posts = []
    for r in rows:
        pid, uid, username, avatar, avatar_data, status_level, text, media_url, likes, created_at = r
        if avatar_data:
            avatar_url = avatar_data
        else:
            avatar_url = avatar or "/portal/default.png"

        posts.append({
            "id": pid,
            "user_id": uid,
            "username": username or "",
            "avatar": avatar_url,
            "status_level": int(status_level or 0),
            "text": text,
            "media_url": media_url,
            "likes": int(likes or 0),
            "created_at": int(created_at),
            "liked": bool(liked_map.get(pid, False))
        })

    return jsonify({"ok": True, "posts": posts})

@app_web.route("/api/post/like", methods=["POST"])
def api_post_like():
    """
    Օգտատերը լայքում է post-ը:
    Body: { "user_id": ..., "post_id": ... }
    Առայժմ՝ միայն 1 անգամ կարելի է like անել, unlike չկա։
    """
    data = request.get_json(force=True, silent=True) or {}
    user_id = int(data.get("user_id", 0))
    post_id = int(data.get("post_id", 0))

    if not user_id or not post_id:
        return jsonify({"ok": False, "error": "bad_params"}), 400

    now = int(time.time())
    conn = db(); c = conn.cursor()

    c.execute("SELECT 1 FROM dom_post_likes WHERE user_id=%s AND post_id=%s",
              (user_id, post_id))
    if c.fetchone():
        release_db(conn)
        return jsonify({"ok": True, "already": True}), 200

    c.execute("""
        INSERT INTO dom_post_likes (user_id, post_id, created_at)
        VALUES (%s, %s, %s)
        ON CONFLICT DO NOTHING
    """, (user_id, post_id, now))

    c.execute("""
        UPDATE dom_posts
        SET likes = likes + 1
        WHERE id = %s
    """, (post_id,))

    conn.commit()
    realtime_emit(
        "post_like",
        {
            "post_id": post_id
        },
        room=f"post_{post_id}"
    )

    release_db(conn)

    return jsonify({"ok": True}), 200

@app_web.route("/api/comment/like", methods=["POST"])
def api_comment_like():
    data = request.get_json(force=True, silent=True) or {}
    cid = int(data.get("comment_id", 0))
    uid = int(data.get("user_id", 0))

    if cid == 0 or uid == 0:
        return jsonify({"ok": False, "error": "missing_params"}), 400

    conn = db(); c = conn.cursor()

    # table-ը ավելի ճիշտ է init_db-ում ստեղծել, բայց թող այստեղ էլ լինի՝ ապահով
    c.execute("""
        CREATE TABLE IF NOT EXISTS dom_comment_likes (
            id SERIAL PRIMARY KEY,
            user_id BIGINT,
            comment_id BIGINT,
            created_at BIGINT DEFAULT 0,
            UNIQUE(user_id, comment_id)
        )
    """)

    # already liked?
    c.execute(
        "SELECT 1 FROM dom_comment_likes WHERE user_id=%s AND comment_id=%s",
        (uid, cid)
    )
    already = c.fetchone() is not None

    now = int(time.time())

    if already:
        # UNLIKE
        c.execute(
            "DELETE FROM dom_comment_likes WHERE user_id=%s AND comment_id=%s",
            (uid, cid)
        )
        c.execute("""
            UPDATE dom_comments
               SET likes = GREATEST(COALESCE(likes,0) - 1, 0)
             WHERE id = %s
         RETURNING likes
        """, (cid,))
        row = c.fetchone()
        conn.commit()
        release_db(conn)
        return jsonify({"ok": True, "liked": False, "likes": int(row[0] if row else 0)}), 200

    # LIKE
    c.execute(
        "INSERT INTO dom_comment_likes (user_id, comment_id, created_at) VALUES (%s, %s, %s)",
        (uid, cid, now)
    )
    c.execute("""
        UPDATE dom_comments
           SET likes = COALESCE(likes,0) + 1
         WHERE id = %s
     RETURNING likes
    """, (cid,))
    row = c.fetchone()

    conn.commit()
    release_db(conn)

    return jsonify({"ok": True, "liked": True, "likes": int(row[0] if row else 0)}), 200


@app_web.route("/api/upload_post_media", methods=["POST"])
def api_upload_post_media():
    uid = request.form.get("uid")
    file = request.files.get("file")

    if not uid or not file:
        return jsonify({"ok": False, "error": "missing"}), 400

    
    raw = file.read()
    b64 = base64.b64encode(raw).decode("utf-8")
    content_type = file.mimetype

    media_data = f"data:{content_type};base64,{b64}"

    return jsonify({
        "ok": True,
        "url": media_data
    })


@app_web.route("/admaven-verify")
def admaven_verify():
    return """
    <html>
    <head>
        <meta name="admaven-placement" content="BdjwGqdYE">
    </head>
    <body>OK</body>
    </html>
    """

_db_pool: Optional[pool.SimpleConnectionPool] = None

def db():
    """
    SAFE PostgreSQL pooled connection getter
    """
    global _db_pool

    if _db_pool is None:
        _db_pool = pool.SimpleConnectionPool(
            minconn=1,
            maxconn=20,
            dsn=DATABASE_URL
        )
        logger.info("PostgreSQL pool initialized (20 connections)")

    try:
        conn = _db_pool.getconn()
        conn.autocommit = False
        return conn
    except pool.PoolError:
        logger.warning("DB pool exhausted, creating direct connection")
        conn = psycopg2.connect(DATABASE_URL)
        conn.autocommit = False
        return conn



def release_db(conn):
    """
    Safely return connection to pool
    """
    global _db_pool

    if conn is None:
        return

    try:
        if _db_pool:
            try:
                _db_pool.putconn(conn)
            except Exception:
                conn.close()
        else:
            conn.close()
    except Exception:
        logger.exception("release_db error")



alters = [
    "ALTER TABLE dom_users ADD COLUMN IF NOT EXISTS ton_balance NUMERIC(20,6) DEFAULT 0",
    "ALTER TABLE dom_users ADD COLUMN IF NOT EXISTS usd_balance NUMERIC(20,2) DEFAULT 0",
    "ALTER TABLE dom_users ADD COLUMN IF NOT EXISTS last_rate NUMERIC(20,6) DEFAULT 0",
    "ALTER TABLE dom_users ADD COLUMN IF NOT EXISTS avatar TEXT",
    "ALTER TABLE dom_users ADD COLUMN IF NOT EXISTS fires_received INT DEFAULT 0",
    "ALTER TABLE dom_users ADD COLUMN IF NOT EXISTS fires_given INT DEFAULT 0",
    "ALTER TABLE dom_users ADD COLUMN IF NOT EXISTS avatar_data TEXT",
    "ALTER TABLE dom_users ADD COLUMN IF NOT EXISTS allow_forward INTEGER DEFAULT 1",
    "ALTER TABLE dom_users ADD COLUMN IF NOT EXISTS total_games INTEGER DEFAULT 0",
    "ALTER TABLE dom_users ADD COLUMN IF NOT EXISTS total_wins INTEGER DEFAULT 0"    
]

def init_db():
    """
    Creates base tables and applies ALTER patches safely.
    """
    logger.info("🛠️ init_db() — Domino")

    conn = db()
    c = conn.cursor()

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

    for sql in alters:
        try:
            c.execute(sql)
            logger.info(f"Applied ALTER: {sql}")
        except Exception as e:
            logger.warning(f"Skip ALTER: {sql} | Reason: {e}")

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

    # Global chat cooldowns table
    c.execute("""
        CREATE TABLE IF NOT EXISTS dom_global_chat_cooldowns (
            user_id BIGINT PRIMARY KEY,
            last_message_at BIGINT NOT NULL
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS dom_global_chat (
            id SERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL,
            message TEXT NOT NULL,
            created_at BIGINT NOT NULL
        )
    """)
    
    # Add highlight column to global chat
    c.execute("""
        ALTER TABLE dom_global_chat 
        ADD COLUMN IF NOT EXISTS highlighted BOOLEAN DEFAULT FALSE
    """)

    # Global chat online users
    c.execute("""
        CREATE TABLE IF NOT EXISTS dom_global_chat_online (
            user_id BIGINT PRIMARY KEY,
            last_ping BIGINT NOT NULL
        )
    """)

        # Fire Reactions Table (unlimited per user)
    c.execute("""
        CREATE TABLE IF NOT EXISTS dom_fire_reactions (
            id SERIAL PRIMARY KEY,
            message_id INT NOT NULL,
            chat_type VARCHAR(10) NOT NULL,
            giver_user_id BIGINT NOT NULL,
            receiver_user_id BIGINT NOT NULL,
            amount NUMERIC(5,2) DEFAULT 0.20,
            created_at INT NOT NULL
        )
    """)

    # Burn Account Tracking
    c.execute("""
        CREATE TABLE IF NOT EXISTS dom_burn_account (
            id SERIAL PRIMARY KEY,
            total_burned NUMERIC(10,2) DEFAULT 0,
            last_updated BIGINT
        )
    """)
    
    # Initialize burn account if empty
    c.execute("SELECT COUNT(*) FROM dom_burn_account")
    if c.fetchone()[0] == 0:
        c.execute("INSERT INTO dom_burn_account (total_burned, last_updated) VALUES (0, %s)", (int(time.time()),))

    c.execute("""
        CREATE TABLE IF NOT EXISTS dom_dm_last_seen (
            user_id BIGINT,
            partner_id BIGINT,
            last_seen_msg_id BIGINT DEFAULT 0,
            updated_at BIGINT DEFAULT 0,
            PRIMARY KEY (user_id, partner_id)
        )
    """)
    
    c.execute("""
        CREATE TABLE IF NOT EXISTS dom_message_reactions (
            id SERIAL PRIMARY KEY,
            message_id INT NOT NULL,
            chat_type VARCHAR(10) NOT NULL,
            user_id BIGINT NOT NULL,
            emoji VARCHAR(10) NOT NULL,
            created_at INT NOT NULL,
            UNIQUE(message_id, chat_type, user_id, emoji)
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS dom_comments (
            id SERIAL PRIMARY KEY,
            post_id BIGINT,
            user_id BIGINT,
            text TEXT,
            created_at BIGINT,
            likes INT DEFAULT 0
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS dom_comment_likes (
            id SERIAL PRIMARY KEY,
            user_id BIGINT,
            comment_id BIGINT,
            created_at BIGINT DEFAULT 0,
            UNIQUE(user_id, comment_id)
        )
    """)


    c.execute("""
        CREATE TABLE IF NOT EXISTS dom_admin_fund (
            id INT PRIMARY KEY DEFAULT 1,
            balance NUMERIC(18,2) DEFAULT 0
        );
        INSERT INTO dom_admin_fund (id, balance)
        VALUES (1, 0)
        ON CONFLICT DO NOTHING;
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS dom_burn_ledger (
            id SERIAL PRIMARY KEY,
            user_id BIGINT,
            amount NUMERIC(18,2),
            reason TEXT,
            created_at BIGINT
        )
    """)

    c.execute("ALTER TABLE dom_comments ADD COLUMN IF NOT EXISTS likes INT DEFAULT 0")
    c.execute("ALTER TABLE dom_comments ADD COLUMN IF NOT EXISTS parent_id BIGINT DEFAULT NULL")

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

    c.execute("""
        CREATE TABLE IF NOT EXISTS conversions (
            id SERIAL PRIMARY KEY,
            conversion_id TEXT UNIQUE,
            user_id BIGINT,
            offer_id TEXT,
            payout NUMERIC(18, 4),
            status TEXT,
            created_at BIGINT
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS dom_tasks (
            id SERIAL PRIMARY KEY,
            title TEXT,
            description TEXT,
            url TEXT,
            reward NUMERIC(10,2),
            category TEXT,
            is_active BOOLEAN DEFAULT TRUE,
            created_at BIGINT
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS dom_global_chat (
            id SERIAL PRIMARY KEY,
            user_id BIGINT,
            message TEXT,
            created_at BIGINT
        )
    """)


    c.execute("""
        CREATE TABLE IF NOT EXISTS dom_task_completions (
            id SERIAL PRIMARY KEY,
            user_id BIGINT,
            task_id BIGINT,
            completed_at BIGINT,
            UNIQUE(user_id, task_id)
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS dom_mining_plans (
            id SERIAL PRIMARY KEY,
            tier INT,
            name TEXT,
            price_usd NUMERIC(18,2),
            duration_hours INT,
            return_mult NUMERIC(10,4),
            created_at BIGINT
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS dom_user_miners (
            id SERIAL PRIMARY KEY,
            user_id BIGINT,
            plan_id INT REFERENCES dom_mining_plans(id),
            price_usd NUMERIC(18,2),
            duration_hours INT,
            return_mult NUMERIC(10,4),
            reward_per_second_usd NUMERIC(18,10),
            started_at BIGINT,
            last_claim_at BIGINT,
            ends_at BIGINT
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS dom_messages (
            id SERIAL PRIMARY KEY,
            sender BIGINT,
            receiver BIGINT,
            text TEXT,
            reply_to BIGINT DEFAULT NULL,
            created_at BIGINT
        )

    """)

    c.execute("ALTER TABLE dom_messages ADD COLUMN IF NOT EXISTS reply_to BIGINT")

    c.execute("""
        CREATE TABLE IF NOT EXISTS dom_follows (
            id SERIAL PRIMARY KEY,
            follower BIGINT,
            target BIGINT,
            UNIQUE(follower, target)
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS dom_posts (
            id SERIAL PRIMARY KEY,
            user_id BIGINT,
            text TEXT,
            media_url TEXT,
            likes INT DEFAULT 0,
            created_at BIGINT
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS dom_post_likes (
            id SERIAL PRIMARY KEY,
            user_id BIGINT,
            post_id INT,
            created_at BIGINT,
            UNIQUE(user_id, post_id)
        )
    """)

        # DOMIT/TON Trading System Tables
    c.execute("""
        CREATE TABLE IF NOT EXISTS domit_price_history (
            id SERIAL PRIMARY KEY,
            timestamp TEXT NOT NULL,
            open REAL NOT NULL,
            high REAL NOT NULL,
            low REAL NOT NULL,
            close REAL NOT NULL,
            volume INTEGER DEFAULT 0
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS domit_config (
            id INTEGER PRIMARY KEY,
            min_price NUMERIC(10,4) DEFAULT 0.5000,
            max_price NUMERIC(10,4) DEFAULT 1.5000,
            current_price NUMERIC(10,4) DEFAULT 1.0000,
            trend TEXT DEFAULT 'sideways',
            volatility TEXT DEFAULT 'medium',
            last_update TIMESTAMP
        )
    """)

    # Insert default DOMIT config
    c.execute("""
        INSERT INTO domit_config (id, current_price, last_update) 
        VALUES (1, 1.0000, NOW())
        ON CONFLICT (id) DO NOTHING
    """)

    c.execute("SELECT COUNT(*) FROM dom_mining_plans")
    count = c.fetchone()[0] or 0
    if count == 0:
        now = int(time.time())
        plans = [
            (1, "Initiate", 25),
            (2, "Apprentice", 50),
            (3, "Associate", 100),
            (4, "Adept", 250),
            (5, "Knight", 500),
            (6, "Vanguard", 1000),
            (7, "Ascendant", 2500),
            (8, "Sovereign", 5000),
            (9, "Imperial", 7500),
            (10, "Ethereal", 10000),
        ]
        duration_hours = 60 * 24   
        return_mult = 1.5       

        for tier, name, price in plans:
            c.execute("""
                INSERT INTO dom_mining_plans (tier, name, price_usd, duration_hours, return_mult, created_at)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (tier, name, price, duration_hours, return_mult, now))
        logger.info("💎 Mining plans initialized (10 tiers).")

    name_map = {
        1: "Initiate",
        2: "Apprentice",
        3: "Associate",
        4: "Adept",
        5: "Knight",
        6: "Vanguard",
        7: "Ascendant",
        8: "Sovereign",
        9: "Imperial",
        10: "Ethereal",
    }
    for tier, name in name_map.items():
        c.execute(
            "UPDATE dom_mining_plans SET name = %s WHERE tier = %s",
            (name, tier)
        )

    conn.commit()
    release_db(conn)
    logger.info("✅ Domino tables ready with applied patches!")

def realtime_emit(event: str, data: dict, room: str = None):
    try:
        if room:
            socketio.emit(event, data, room=room)
        else:
            socketio.emit(event, data)
    except Exception:
        logger.exception("Realtime emit failed")

def trim_global_chat(limit: int = 30):
    try:
        conn = db()
        c = conn.cursor()

        c.execute("""
            DELETE FROM dom_global_chat
            WHERE id NOT IN (
                SELECT id FROM dom_global_chat
                ORDER BY id DESC
                LIMIT %s
            )
        """, (limit,))

        deleted = c.rowcount
        conn.commit()
        release_db(conn)

        if deleted > 0:
            logger.info(f"🧹 Global chat trimmed, removed {deleted} old messages")

            # 🔥 realtime ասում ենք frontend-ին
            socketio.emit("global_trim", {
                "keep": limit
            }, room="global")

    except Exception:
        logger.exception("❌ trim_global_chat failed")



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

    c.execute("""
        SELECT username,
               avatar,
               avatar_data,
               COALESCE(balance_usd,0),
               COALESCE(total_deposit_usd,0),
               COALESCE(total_withdraw_usd,0),
               COALESCE(ton_balance,0),
               COALESCE(last_rate,0),
               COALESCE(total_games,0),
               COALESCE(total_wins,0)
        FROM dom_users
        WHERE user_id=%s
    """, (user_id,))

    row = c.fetchone()
    if not row:
        release_db(conn)
        return None

    (username, avatar, avatar_data, balance_usd, total_dep, total_wd, ton_balance, last_rate, total_games, total_wins) = row

    c.execute("""
        SELECT COALESCE(MAX(p.tier), 0)
        FROM dom_user_miners m
        JOIN dom_mining_plans p ON m.plan_id = p.id
        WHERE m.user_id = %s
    """, (user_id,))
    status_row = c.fetchone()
    status_level = int(status_row[0] or 0)

    name_map = {
        1: "Initiate",
        2: "Apprentice",
        3: "Associate",
        4: "Adept",
        5: "Knight",
        6: "Vanguard",
        7: "Ascendant",
        8: "Sovereign",
        9: "Imperial",
        10: "Ethereal",
    }
    status_name = name_map.get(status_level, "None")

    if last_rate and last_rate > 0:
        ton_balance = balance_usd / last_rate
    else:
        ton_balance = 0

    c.execute("SELECT COUNT(*) FROM dom_users WHERE inviter_id=%s", (user_id,))
    ref_count = c.fetchone()[0] or 0

    c.execute("""
        SELECT COUNT(*)
        FROM dom_users
        WHERE inviter_id=%s AND total_deposit_usd > 0
    """, (user_id,))
    active_refs = c.fetchone()[0] or 0

    c.execute("""
        SELECT COALESCE(SUM(total_deposit_usd),0)
        FROM dom_users
        WHERE inviter_id=%s
    """, (user_id,))
    team_dep = c.fetchone()[0] or 0

    if total_games > 0:
        intellect_score = round((total_wins / total_games) * 10, 1)
    else:
        intellect_score = 0.0

    release_db(conn)

    return {
        "user_id": user_id,
        "username": username,
        "avatar": avatar,
        "avatar_data": avatar_data,
        "balance_usd": float(balance_usd),
        "ton_balance": float(ton_balance),
        "total_deposit_usd": float(total_dep),
        "total_withdraw_usd": float(total_wd),
        "ref_count": int(ref_count),
        "active_refs": int(active_refs),
        "team_deposit_usd": float(team_dep),
        "status_level": int(status_level),
        "status_name": status_name,
        "intellect_score": float(intellect_score),
        "total_games": int(total_games),
        "total_wins": int(total_wins),
    }


def apply_burn_transaction(
    from_user: int,
    total_amount: float,
    transfers: list = None,
    burn_amount: float = 0.0,
    reason: str = ""
):
    """
    Universal balance operation:
    - total_amount հանվում է from_user-ից
    - transfers → [(user_id, amount), ...]
    - burn_amount → գնում է admin fund + burn ledger
    """

    if total_amount <= 0:
        raise ValueError("total_amount must be > 0")

    transfers = transfers or []
    now = int(time.time())

    conn = db()
    c = conn.cursor()

    # ստուգում ենք բալանսը
    c.execute("SELECT balance_usd FROM dom_users WHERE user_id=%s", (from_user,))
    row = c.fetchone()
    if not row or float(row[0]) < total_amount:
        release_db(conn)
        raise ValueError("low_balance")

    # հանում ենք ամբողջ գումարը
    c.execute("""
        UPDATE dom_users
        SET balance_usd = balance_usd - %s
        WHERE user_id=%s
    """, (total_amount, from_user))

    # փոխանցումներ
    for uid, amt in transfers:
        c.execute("""
            UPDATE dom_users
            SET balance_usd = balance_usd + %s
            WHERE user_id=%s
        """, (amt, uid))

    # burn
    if burn_amount > 0:
        c.execute("""
            INSERT INTO dom_burn_ledger (user_id, amount, reason, created_at)
            VALUES (%s, %s, %s, %s)
        """, (from_user, burn_amount, reason, now))

        c.execute("""
            UPDATE dom_burn_account
            SET total_burned = total_burned + %s,
                last_updated = %s
            WHERE id = 1
        """, (burn_amount, now))

    conn.commit()
    release_db(conn)


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

def get_mining_plans():
    """
    Վերադարձնում է բոլոր mining plan-ները, հաշված ՄԵԿԱՅՆ USD/hr-ով։
    DOMIT-ը frontend-ում կարող ես ցույց տալ որպես նույն թիվը, պարզապես անվանափոխված։
    """
    conn = db(); c = conn.cursor()
    c.execute("""
        SELECT id, tier, name, price_usd, duration_hours, return_mult
        FROM dom_mining_plans
        ORDER BY tier ASC
    """)
    rows = c.fetchall()
    release_db(conn)

    plans = []
    for row in rows:
        pid, tier, name, price_usd, duration_hours, return_mult = row
        price_usd = float(price_usd)
        duration_hours = int(duration_hours)
        return_mult = float(return_mult)
        total_return_usd = price_usd * return_mult     
        usd_per_hour = total_return_usd / duration_hours  

        plans.append({
            "id": pid,
            "tier": tier,
            "name": name,
            "price_usd": price_usd,
            "duration_hours": duration_hours,
            "return_mult": return_mult,
            "total_return_usd": total_return_usd,
            "usd_per_hour": usd_per_hour,
            "domit_per_hour": usd_per_hour,
        })
    return plans

def get_user_miners(user_id: int):
    """
    Վերադարձնում է օգտատիրոջ բոլոր miners-ները։
    """
    conn = db(); c = conn.cursor()
    c.execute("""
        SELECT m.id, m.plan_id, p.tier, p.name,
               m.price_usd, m.duration_hours, m.return_mult,
               m.reward_per_second_usd, m.started_at, m.last_claim_at, m.ends_at
        FROM dom_user_miners m
        JOIN dom_mining_plans p ON m.plan_id = p.id
        WHERE m.user_id = %s
        ORDER BY m.id ASC
    """, (user_id,))
    rows = c.fetchall()
    release_db(conn)

    miners = []
    for r in rows:
        (mid, plan_id, tier, name,
         price_usd, duration_hours, return_mult,
         rps, started_at, last_claim_at, ends_at) = r

        miners.append({
            "id": mid,
            "plan_id": plan_id,
            "tier": tier,
            "name": name,
            "price_usd": float(price_usd),
            "duration_hours": int(duration_hours),
            "return_mult": float(return_mult),
            "reward_per_second_usd": float(rps),
            "started_at": int(started_at),
            "last_claim_at": int(last_claim_at) if last_claim_at else None,
            "ends_at": int(ends_at),
        })
    return miners

def calc_miner_pending(miner: dict, now: int):
    """
    Հաշվում է կոնկրետ miner-ի չվերցված reward-ը (մինչև now կամ մինչև ends_at)։
    Վերադարձնում է (reward_usd, new_last_claim_at)
    """
    started = miner["started_at"]
    ends_at = miner["ends_at"]
    last_claim = miner["last_claim_at"] or started
    rps = miner["reward_per_second_usd"]

    if last_claim >= ends_at:
        return 0.0, last_claim

    effective_to = min(now, ends_at)
    dt = max(0, effective_to - last_claim)
    reward = dt * rps
    new_last = effective_to
    return reward, new_last

def claim_user_mining_rewards(user_id: int):
    """
    Հավաքում է օգտատիրոջ բոլոր miners-ների pending reward-ը,
    թարմացնում է last_claim_at-երը և գումարը ավելացնում balance_usd-ի վրա։
    """
    now = int(time.time())
    miners = get_user_miners(user_id)
    if not miners:
        return 0.0, 0, 0.0  

    total_reward = 0.0
    updated_ids = []

    for m in miners:
        reward, new_last = calc_miner_pending(m, now)
        if reward > 0:
            total_reward += reward
            updated_ids.append((m["id"], new_last))

    if total_reward <= 0:
        stats = get_user_stats(user_id)
        new_balance = stats["balance_usd"] if stats else 0.0
        return 0.0, len(miners), new_balance

    conn = db(); c = conn.cursor()

    for mid, new_last in updated_ids:
        c.execute("""
            UPDATE dom_user_miners
               SET last_claim_at = %s
             WHERE id = %s
        """, (new_last, mid))

    c.execute("""
        UPDATE dom_users
           SET balance_usd = COALESCE(balance_usd,0) + %s
         WHERE user_id = %s
        RETURNING balance_usd
    """, (total_reward, user_id))
    row = c.fetchone()
    conn.commit()
    release_db(conn)

    new_balance = float(row[0]) if row else 0.0
    return total_reward, len(miners), new_balance

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

@app_web.route("/api/user/<int:user_id>")
def api_user(user_id):
    stats = get_user_stats(user_id)
    if not stats:
        return jsonify({"ok": False, "error": "user_not_found"}), 404

    if stats.get("avatar_data"):
        stats["avatar"] = stats["avatar_data"]
    elif stats.get("avatar"):
        stats["avatar"] = stats["avatar"]
    else:
        stats["avatar"] = "/portal/default.png"

    # Add online status
    stats["is_online"] = user_id in ONLINE_USERS

    return jsonify({"ok": True, "user": stats})

@app_web.route("/api/user/domino-stars")
def api_user_domino_stars():
    """Վերադարձնում է user-ի ստացած Domino Stars քանակը"""
    uid = request.args.get("uid", type=int)
    if not uid:
        return jsonify({"ok": False, "error": "no uid"}), 400
    
    conn = db()
    c = conn.cursor()
    
    c.execute("""
        SELECT COUNT(*)
        FROM dom_fire_reactions
        WHERE receiver_user_id = %s
    """, (uid,))
    
    count = int(c.fetchone()[0] or 0)
    release_db(conn)
    
    return jsonify({"ok": True, "count": count})

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

@app_web.route("/api/crash/deposit", methods=["POST"])
def api_crash_deposit():
    data = request.get_json(force=True, silent=True) or {}

    user_id = int(data.get("user_id", 0))
    amount = float(data.get("amount", 0))

    if user_id == 0 or amount <= 0:
        return jsonify({"ok": False, "error": "bad_params"}), 400

    stats = get_user_stats(user_id)
    if not stats:
        return jsonify({"ok": False, "error": "user_not_found"}), 404

    if amount > stats["balance_usd"]:
        return jsonify({"ok": False, "error": "low_balance"}), 200

    conn = db()
    c = conn.cursor()
    c.execute("""
        UPDATE dom_users
        SET balance_usd = balance_usd - %s
        WHERE user_id = %s
        RETURNING balance_usd
    """, (amount, user_id))

    new_main = float(c.fetchone()[0])

    conn.commit()
    release_db(conn)

    return jsonify({"ok": True, "new_main": stats["balance_usd"] - amount})

@app_web.route("/api/crash/claim", methods=["POST"])
def api_crash_claim():
    data = request.get_json(force=True, silent=True) or {}
    user_id = int(data.get("user_id", 0))
    win = float(data.get("win", 0))

    if user_id == 0 or win <= 0:
        return jsonify({"ok": False, "error": "bad_params"}), 400

    conn = db(); c = conn.cursor()
    c.execute("""
        UPDATE dom_users
        SET balance_usd = COALESCE(balance_usd,0) + %s
        WHERE user_id = %s
        RETURNING balance_usd
    """, (win, user_id))
    row = c.fetchone()
    conn.commit()
    release_db(conn)

    new_balance = float(row[0]) if row else 0.0
    return jsonify({"ok": True, "new_balance": new_balance})


@app_web.route("/api/crash/lose", methods=["POST"])
def api_crash_lose():
    data = request.get_json(force=True, silent=True) or {}
    user_id = int(data.get("user_id", 0))
    amount = float(data.get("amount", 0))

    if user_id == 0 or amount <= 0:
        return jsonify({"ok": False, "error": "bad_params"}), 400

    return jsonify({"ok": True})

@app_web.route("/api/crash/withdraw", methods=["POST"])
def api_crash_withdraw():
    data = request.get_json(force=True, silent=True) or {}
    user_id = int(data.get("user_id", 0))
    amount = float(data.get("amount", 0))

    if user_id == 0 or amount <= 0:
        return jsonify({"ok": False, "error": "bad_params"}), 400

    conn = db()
    c = conn.cursor()
    c.execute("""
        UPDATE dom_users
        SET balance_usd = balance_usd + %s
        WHERE user_id = %s
    """, (amount, user_id))
    conn.commit()
    release_db(conn)

    return jsonify({"ok": True})

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

    if amount > balance:
        return jsonify({
            "ok": False,
            "error": "not_enough_balance",
            "message": "Ունեք բավարար բալանս կանխիկացման համար չէ։"
        }), 200

    if ref_count < 10:
        return jsonify({
            "ok": False,
            "error": "not_enough_refs",
            "message": "Կանխիկացնելու համար պետք է ունենաք առնվազն 10 հրավիրված ընկեր։"
        }), 200

    if team_dep < 200.0:
        return jsonify({
            "ok": False,
            "error": "not_enough_team_deposit",
            "message": "Կանխիկացնելու համար ձեր հրավիրվածների ընդհանուր դեպոզիտը պետք է լինի առնվազն 200$։"
        }), 200

    create_withdraw_request(user_id, amount)
    new_stats = get_user_stats(user_id)

    return jsonify({
        "ok": True,
        "message": "Ձեր կանխիկացման հայտը ստացվել է ✅ Գումարը կփոխանցվի մինչև 24 ժամվա ընթացքում։",
        "user": new_stats
    })

@app_web.route("/api/dice/deposit", methods=["POST"])
def api_dice_deposit():
    data = request.get_json(force=True, silent=True) or {}

    user_id = int(data.get("user_id", 0))
    amount = float(data.get("amount", 0))

    if user_id == 0 or amount <= 0:
        return jsonify({"ok": False, "error": "bad_params"}), 400

    stats = get_user_stats(user_id)
    if not stats:
        return jsonify({"ok": False, "error": "user_not_found"}), 404

    if amount > stats["balance_usd"]:
        return jsonify({"ok": False, "error": "low_balance"}), 200

    conn = db()
    c = conn.cursor()
    c.execute(
        """
        UPDATE dom_users
        SET balance_usd = balance_usd - %s
        WHERE user_id = %s
        """,
        (amount, user_id),
    )
    conn.commit()
    release_db(conn)

    return jsonify({"ok": True, "new_main": stats["balance_usd"] - amount})

@app_web.route("/api/dice/withdraw", methods=["POST"])
def api_dice_withdraw():
    data = request.get_json(force=True, silent=True) or {}
    user_id = int(data.get("user_id", 0))
    amount = float(data.get("amount", 0))

    if user_id == 0 or amount <= 0:
        return jsonify({"ok": False, "error": "bad_params"}), 400

    conn = db()
    c = conn.cursor()
    c.execute(
        """
        UPDATE dom_users
        SET balance_usd = balance_usd + %s
        WHERE user_id = %s
        """,
        (amount, user_id),
    )
    conn.commit()
    release_db(conn)

    return jsonify({"ok": True})

@app_web.route("/api/slots/deposit", methods=["POST"])
def api_slots_deposit():
    data = request.get_json(force=True)
    user_id = int(data.get("user_id"))
    amount = float(data.get("amount", 0))

    if amount <= 0:
        return jsonify({"ok": False, "error": "bad_amount"}), 400

    conn = db(); c = conn.cursor()

    c.execute("SELECT balance_usd FROM dom_users WHERE user_id=%s", (user_id,))
    row = c.fetchone()
    if not row:
        return jsonify({"ok": False, "error": "no_user"})

    main_balance = float(row[0])
    if main_balance < amount:
        return jsonify({"ok": False, "error": "not_enough"})

    new_main = main_balance - amount

    c.execute("UPDATE dom_users SET balance_usd=%s WHERE user_id=%s",
              (new_main, user_id))

    conn.commit()
    release_db(conn)

    return jsonify({
        "ok": True,
        "new_main": new_main
    })

@app_web.route("/api/slots/withdraw", methods=["POST"])
def api_slots_withdraw():
    data = request.get_json(force=True)
    user_id = int(data.get("user_id"))
    amount = float(data.get("amount", 0))

    if amount <= 0:
        return jsonify({"ok": False, "error": "bad_amount"}), 400

    conn = db(); c = conn.cursor()

    c.execute("SELECT balance_usd FROM dom_users WHERE user_id=%s", (user_id,))
    row = c.fetchone()
    if not row:
        return jsonify({"ok": False, "error": "no_user"})

    main_balance = float(row[0])
    new_main = main_balance + amount

    c.execute("UPDATE dom_users SET balance_usd=%s WHERE user_id=%s",
              (new_main, user_id))

    conn.commit()
    release_db(conn)

    return jsonify({
        "ok": True,
        "new_main": new_main
    })

@app_web.route("/api/task_reward", methods=["POST"])
def api_task_reward():
    data = request.get_json(force=True, silent=True) or {}

    user_id = int(data.get("user_id", 0))
    amount = float(data.get("amount", 0))

    if user_id == 0 or amount <= 0:
        return jsonify({"ok": False, "error": "bad_params"}), 400

    conn = db()
    c = conn.cursor()

    c.execute("SELECT balance_usd FROM dom_users WHERE user_id=%s", (user_id,))
    row = c.fetchone()
    if not row:
        return jsonify({"ok": False, "error": "user_not_found"}), 404

    new_balance = float(row[0]) + amount

    c.execute(
        "UPDATE dom_users SET balance_usd=%s WHERE user_id=%s",
        (new_balance, user_id)
    )

    conn.commit()
    release_db(conn)

    return jsonify({
        "ok": True,
        "new_balance": new_balance
    })

@app_web.route("/timewall/postback", methods=["GET", "POST"])
def timewall_postback():
    print("🔔 TimeWall POSTBACK:", dict(request.args))

    user_id_raw = request.args.get("s1") or request.args.get("user_id")
    task_id_raw = request.args.get("s2")
    tx_id       = request.args.get("tx") or request.args.get("transactionID")
    amount_raw  = request.args.get("amount") or request.args.get("currencyAmount")
    revenue_raw = request.args.get("revenue") or request.args.get("income")

    if not user_id_raw or not tx_id or not amount_raw:
        return "Missing params", 400

    try:
        user_id = int(user_id_raw)
    except:
        return "Bad user_id", 400

    try:
        task_id = int(task_id_raw)
    except:
        task_id = None

    amount = float(amount_raw)
    revenue = float(revenue_raw or 0)

    if amount <= 0:
        return "No amount", 200

    now = int(time.time())
    conn = db(); c = conn.cursor()

    c.execute("SELECT 1 FROM conversions WHERE conversion_id=%s", (tx_id,))
    if c.fetchone():
        release_db(conn)
        return "Already processed", 200

    c.execute("""
        UPDATE dom_users
        SET balance_usd = COALESCE(balance_usd,0) + %s
        WHERE user_id = %s
    """, (amount, user_id))

    if task_id:
        c.execute("""
            INSERT INTO dom_task_completions (user_id, task_id, completed_at)
            VALUES (%s, %s, %s)
            ON CONFLICT DO NOTHING
        """, (user_id, task_id, now))

    c.execute("""
        INSERT INTO conversions (conversion_id, user_id, offer_id, payout, status, created_at)
        VALUES (%s, %s, 'TIMEWALL', %s, 'credited', %s)
    """, (tx_id, user_id, revenue, now))

    conn.commit()
    release_db(conn)

    return "OK", 200

@app_web.route("/ogads/postback", methods=["GET", "POST"])
def ogads_postback():
    try:
        print("🔔 OGADS POSTBACK:", dict(request.args))
    except:
        pass

    user_id_raw = request.args.get("s1")
    task_id_raw = request.args.get("s2")
    payout_raw = request.args.get("payout")
    tx_id = request.args.get("transaction_id")

    if not user_id_raw or not payout_raw or not tx_id:
        return "Missing params", 400

    try:
        user_id = int(user_id_raw)
    except:
        return "Bad user_id", 400

    try:
        payout = float(payout_raw)
    except:
        payout = 0.0

    if payout <= 0:
        return "No payout", 200

    now = int(time.time())
    conn = db(); c = conn.cursor()

    c.execute("SELECT 1 FROM conversions WHERE conversion_id=%s", (tx_id,))
    if c.fetchone():
        release_db(conn)
        return "Already processed", 200

    user_reward = payout * 0.30  

    c.execute("""
        UPDATE dom_users
        SET balance_usd = COALESCE(balance_usd,0) + %s
        WHERE user_id=%s
    """, (user_reward, user_id))

    c.execute("""
        INSERT INTO conversions (conversion_id, user_id, offer_id, payout, status, created_at)
        VALUES (%s, %s, 'OGADS', %s, 'approved', %s)
    """, (tx_id, user_id, payout, now))

    if task_id_raw:
        try:
            task_id = int(task_id_raw)
            c.execute("""
                INSERT INTO dom_task_completions (user_id, task_id, completed_at)
                VALUES (%s, %s, %s)
                ON CONFLICT DO NOTHING
            """, (user_id, task_id, now))
        except:
            pass

    conn.commit()
    release_db(conn)

    return "OK", 200

@app_web.route("/timewall/<int:user_id>")
def timewall_page(user_id):
    timewall_link = f"https://timewall.io/users/login?oid=799afa670a03c54a&uid={user_id}"
    return f"""
    <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>TimeWall</title>
        </head>
        <body style="margin:0; padding:0; overflow:hidden;">
            <iframe src="{timewall_link}" style="width:100%; height:100%; border:none;"></iframe>
        </body>
    </html>
    """

@app_web.route("/mylead/postback", methods=["GET", "POST"])
def mylead_postback():
    try:
        print("🔔 MyLead POSTBACK:", dict(request.args))
    except Exception as e:
        print("🔔 MyLead POSTBACK: failed to print", e)
    """
    MyLead → Domino Postback

    Ակնկալում ենք, որ MyLead-ի tracking link-ի մեջ s1 պարամետրը հավասար է Telegram user_id-ին:
    Postback-ն ուղարկվում է примерно այս տեսքով.

    https://domino-backend-iavj.onrender.com/mylead/postback
        ?s1={sub1}
        &status={status}
        &payout={payout}
        &offer_id={program_id}
        &transaction_id={transaction_id}
    """

    task_id_raw = request.args.get("subid2") or request.args.get("s2")
    task_id = None
    if task_id_raw:
        try:
            task_id = int(task_id_raw)
        except Exception:
            task_id = None

    user_id_raw = request.args.get("subid1") or request.args.get("s1")
    task_id_raw = request.args.get("subid2") or request.args.get("s2")
    status = (request.args.get("status") or "").lower()
    payout_raw = request.args.get("payout")
    offer_id = request.args.get("offer_id")
    conversion_id = request.args.get("transaction_id")

    if not user_id_raw or not status or not conversion_id:
        return "Missing parameters", 400

    try:
        user_id = int(user_id_raw)
    except Exception:
        return "Bad user_id", 400

    try:
        payout = float(payout_raw or 0)
    except Exception:
        payout = 0.0

    now = int(time.time())

    conn = db(); c = conn.cursor()

    c.execute("SELECT 1 FROM conversions WHERE conversion_id = %s", (conversion_id,))
    if c.fetchone():
        release_db(conn)
        return "Already processed", 200

    if status == "approved" and payout > 0:
        c.execute("""
            UPDATE dom_users
               SET balance_usd       = COALESCE(balance_usd,0) + %s,
                   total_deposit_usd = COALESCE(total_deposit_usd,0) + %s
             WHERE user_id = %s
        """, (payout, payout, user_id))

    c.execute("""
        INSERT INTO conversions (conversion_id, user_id, offer_id, payout, status, created_at)
        VALUES (%s, %s, %s, %s, %s, %s)
    """, (conversion_id, user_id, offer_id, payout, status, now))

    if status == "approved" and payout > 0 and task_id:
        c.execute("""
            INSERT INTO dom_task_completions (user_id, task_id, completed_at)
            VALUES (%s, %s, %s)
            ON CONFLICT DO NOTHING
        """, (user_id, task_id, now))

    conn.commit()
    release_db(conn)

    return "OK", 200

@app_web.route("/api/tasks/<int:user_id>")
def api_tasks(user_id):
    conn = db(); c = conn.cursor()
    c.execute("""
        SELECT id, title, description, url, reward, category, is_active
        FROM dom_tasks
        WHERE is_active = TRUE
        ORDER BY id DESC
    """)
    rows = c.fetchall()
    release_db(conn)

    tasks = []
    for r in rows:
        tasks.append({
            "id": r[0],
            "title": r[1],
            "description": r[2],
            "url": r[3],
            "reward": float(r[4]),
            "category": r[5],
            "is_active": r[6]
        })

    return jsonify({"ok": True, "tasks": tasks})

@app_web.route("/api/mining/plans", methods=["GET"])
def api_mining_plans():
    plans = get_mining_plans()
    return jsonify({"ok": True, "plans": plans})

@app_web.route("/api/mining/buy", methods=["POST"])
def api_mining_buy():
    data = request.get_json(force=True, silent=True) or {}
    user_id = int(data.get("user_id", 0))
    plan_id = int(data.get("plan_id", 0))

    if not user_id or not plan_id:
        return jsonify({"ok": False, "error": "bad_params"}), 400

    stats = get_user_stats(user_id)
    if not stats:
        return jsonify({"ok": False, "error": "user_not_found"}), 404

    conn = db(); c = conn.cursor()
    c.execute("""
        SELECT id, tier, name, price_usd, duration_hours, return_mult
        FROM dom_mining_plans
        WHERE id = %s
    """, (plan_id,))
    row = c.fetchone()
    if not row:
        release_db(conn)
        return jsonify({"ok": False, "error": "plan_not_found"}), 404

    pid, tier, name, price_usd, duration_hours, return_mult = row
    price_usd = float(price_usd)
    duration_hours = int(duration_hours)
    return_mult = float(return_mult)

    if stats["balance_usd"] < price_usd:
        release_db(conn)
        return jsonify({"ok": False, "error": "low_balance"}), 200

    total_return_usd = price_usd * return_mult
    duration_sec = duration_hours * 3600
    reward_per_second = total_return_usd / duration_sec

    now = int(time.time())
    ends_at = now + duration_sec

    c.execute("""
        UPDATE dom_users
           SET balance_usd = COALESCE(balance_usd,0) - %s
         WHERE user_id = %s
    """, (price_usd, user_id))

    c.execute("""
        INSERT INTO dom_user_miners (
            user_id, plan_id, price_usd, duration_hours,
            return_mult, reward_per_second_usd,
            started_at, last_claim_at, ends_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, NULL, %s)
        RETURNING id
    """, (user_id, pid, price_usd, duration_hours, return_mult,
          reward_per_second, now, ends_at))
    miner_id = c.fetchone()[0]
    conn.commit()
    release_db(conn)

    new_stats = get_user_stats(user_id)

    return jsonify({
        "ok": True,
        "message": "Mining package purchased successfully ✅",
        "miner_id": miner_id,
        "user": new_stats
    })

@app_web.route("/api/mining/claim", methods=["POST"])
def api_mining_claim():
    data = request.get_json(force=True, silent=True) or {}
    user_id = int(data.get("user_id", 0))

    if not user_id:
        return jsonify({"ok": False, "error": "bad_params"}), 400

    reward_usd, miners_count, new_balance = claim_user_mining_rewards(user_id)
    user = get_user_stats(user_id)

    return jsonify({
        "ok": True,
        "claimed_usd": reward_usd,
        "miners_count": miners_count,
        "new_balance_usd": new_balance,
        "user": user
    })

@app_web.route("/api/mining/state/<int:user_id>")
def api_mining_state(user_id):
    stats = get_user_stats(user_id)
    if not stats:
        return jsonify({"ok": False, "error": "user_not_found"}), 404

    plans = get_mining_plans()
    miners = get_user_miners(user_id)

    now = int(time.time())
    total_pending = 0.0
    miners_view = []

    for m in miners:
        reward, _ = calc_miner_pending(m, now) 
        total_pending += reward
        miners_view.append({
            **m,
            "pending_usd": reward,
            "pending_domit": reward,
        })

    state = None
    if miners_view:
        first = miners_view[0]
        speed_per_hour = first["reward_per_second_usd"] * 3600.0
        state = {
            "tier": first["tier"],
            "speed": round(speed_per_hour, 2),
            "earned": total_pending,
        }

    return jsonify({
        "ok": True,
        "user": stats,
        "plans": plans,
        "miners": miners_view,
        "total_pending_usd": total_pending,
        "total_pending_domit": total_pending,
        "state": state
    })

@app_web.route("/app/mining")
def app_mining():
    return send_from_directory("webapp/mining", "index.html")

@app_web.route("/api/task_complete", methods=["POST"])
def api_task_complete():
    data = request.get_json(force=True, silent=True) or {}
    user_id = int(data.get("user_id", 0))
    task_id = int(data.get("task_id", 0))

    if not user_id or not task_id:
        return jsonify({"ok": False, "error": "bad_params"}), 400

    now = int(time.time())
    conn = db(); c = conn.cursor()

    c.execute("""
        SELECT 1 FROM dom_task_completions
        WHERE user_id=%s AND task_id=%s
    """, (user_id, task_id))
    if c.fetchone():
        release_db(conn)
        return jsonify({"ok": False, "error": "already_completed"}), 200

    c.execute("""
        INSERT INTO dom_task_completions (user_id, task_id, completed_at)
        VALUES (%s, %s, %s)
    """, (user_id, task_id, now))

    conn.commit()
    release_db(conn)
    return jsonify({"ok": True})

import requests
import time

TON_RATE_URL = "https://tonapi.io/v2/rates?tokens=TON&currencies=USD"

from flask import request

def fetch_ton_rate():
    try:
        print("🌐 Calling tonapi.io ...")
        r = requests.get(TON_RATE_URL, timeout=10)

        print("📦 API status:", r.status_code)
        print("📦 API raw body:", r.text)

        data = r.json()
        rate = float(data["rates"]["TON"]["prices"]["USD"])
        print("📊 Parsed rate:", rate)
        return rate

    except Exception as e:
        print("🔥 ERROR in fetch_ton_rate():", e)
        return None

def ton_rate_updater():
    print("🔄 TON updater thread started")

    while True:
        try:
            print("➡️ Fetching TON rate ...")
            rate = fetch_ton_rate()
            print("📥 fetch_ton_rate() returned:", rate)

            if rate is None or rate <= 0:
                print("⚠️ Invalid TON rate, skipping DB update")
                time.sleep(300)
                continue

            conn = None
            try:
                conn = db()
                c = conn.cursor()
                c.execute("UPDATE dom_users SET last_rate=%s", (rate,))
                conn.commit()

            finally:
                release_db(conn)
            print("💹 last_rate updated in DB:", rate)

        except Exception as e:
            print("🔥 TON updater crashed:", e)

        time.sleep(300)

application = None  
bot_loop = None     

def parse_start_payload(text: Optional[str]):
    """
    /start ref_123 -> ("ref", 123)
    /start post_55 -> ("post", 55)
    """
    if not text:
        return (None, None)

    parts = text.strip().split(maxsplit=1)
    if len(parts) < 2:
        return (None, None)

    payload = parts[1].strip()

    if payload.startswith("ref_"):
        try:
            return ("ref", int(payload.replace("ref_", "", 1)))
        except Exception:
            return (None, None)

    if payload.startswith("post_"):
        try:
            return ("post", int(payload.replace("post_", "", 1)))
        except Exception:
            return (None, None)

    return (None, None)


def parse_startapp_payload(text: str):
    if not text:
        return None
    parts = text.strip().split(maxsplit=1)
    if len(parts) < 2:
        return None
    payload = parts[1]
    if payload.startswith("post_"):
        try:
            return int(payload.replace("post_", "", 1))
        except:
            return None
    return None

async def start_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    if not user:
        return

    text = update.message.text if update.message else ""
    print("✅ /start received from", user.id, "text:", text)

    ptype, pvalue = parse_start_payload(text)
    inviter_id = None
    open_post_id = None

    if ptype == "ref":
        inviter_id = pvalue
    elif ptype == "post":
        open_post_id = pvalue

    if inviter_id == user.id:
        inviter_id = None

    ensure_user(user.id, user.username, inviter_id)

    wa_url = f"{BASE_URL}/app?uid={user.id}"
    if open_post_id:
        wa_url += f"&open_post={open_post_id}"

    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton(text="🎲 OPEN DOMINO APP", web_app=WebAppInfo(url=wa_url))]
    ])

    await context.bot.send_message(
        chat_id=user.id,
        text="🎰 Բարի գալուստ Domino Casino.\nՍեղմիր կոճակին՝ բացելու համար WebApp-ը 👇",
        reply_markup=keyboard
    )

    # (սա կարող ես թողնել կամ հանել, բայց սխալ չի)
    try:
        if update.message:
            await context.bot.pin_chat_message(chat_id=user.id, message_id=update.message.message_id)
    except Exception:
        pass

# ═══════════════════════════════════════════════════════════
# DOMIT AUTO PRICE UPDATER
# ═══════════════════════════════════════════════════════════

scheduler = AsyncIOScheduler()

async def update_domit_price():
    """Ավտոմատ DOMIT գնի թարմացում յուրաքանչյուր 1 րոպե"""
    conn = None
    try:
        conn = db()
        cur = conn.cursor()
        
        # Վերցնել config
        cur.execute("SELECT min_price, max_price FROM domit_config WHERE id = 1")
        row = cur.fetchone()
        if not row:
            print("⚠️ domit_config չկա, skip")
            cur.close()
            release_db(conn)
            return
        
        min_price, max_price = row
        
        # Վերցնել վերջին candle-ը
        cur.execute("""
            SELECT close FROM domit_price_history 
            ORDER BY timestamp DESC LIMIT 1
        """)
        last_row = cur.fetchone()
        last_close = last_row[0] if last_row else (min_price + max_price) / 2
        
        # Ստեղծել նոր candle (ռանդոմ շարժում ±2%)
        volatility = 0.02
        price_change = random.uniform(-volatility, volatility)
        new_close = last_close * (1 + price_change)
        
        # Սահմանափակել սահմաններում
        new_close = max(min_price, min(max_price, new_close))
        
        # Ստեղծել OHLC
        high_offset = random.uniform(0, 0.01)
        low_offset = random.uniform(0, 0.01)
        
        open_price = last_close
        high_price = max(open_price, new_close) * (1 + high_offset)
        low_price = min(open_price, new_close) * (1 - low_offset)
        close_price = new_close
        volume = random.randint(1000, 5000)
        
        # Insert նոր candle
        now = int(datetime.now().timestamp())
        cur.execute("""
            INSERT INTO domit_price_history (timestamp, open, high, low, close, volume)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (now, open_price, high_price, low_price, close_price, volume))
        
        # Ջնջել 24 ժամից հին candle-ները
        cutoff = now - (24 * 3600)
        cur.execute("DELETE FROM domit_price_history WHERE timestamp < %s", (cutoff,))
        
        conn.commit()
        cur.close()
        release_db(conn)
        print(f"📊 DOMIT price updated: {close_price:.4f} TON")
        
    except Exception as e:
        print(f"❌ Error updating DOMIT price: {e}")
        if conn:
            try:
                cur.close()
            except:
                pass
            release_db(conn)

# Scheduler job - յուրաքանչյուր 1 րոպե
scheduler.add_job(
    update_domit_price,
    CronTrigger(minute='*'),  # Յուրաքանչյուր րոպե
    id='domit_price_update',
    replace_existing=True
)

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

async def burn_stats(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_user.id not in ADMIN_IDS:
        await update.message.reply_text("❌ admin չես")
        return

    conn = db()
    c = conn.cursor()

    now = int(time.time())
    today_start = now - 86400

    # Get total burned from unified account
    c.execute("SELECT total_burned, last_updated FROM dom_burn_account WHERE id = 1")
    row = c.fetchone()
    total_burned = float(row[0] or 0) if row else 0.0
    last_updated = int(row[1] or 0) if row else 0

    # Get today's burns from ledger
    c.execute(
        "SELECT COALESCE(SUM(amount),0) FROM dom_burn_ledger WHERE created_at >= %s",
        (today_start,)
    )
    today_burn = float(c.fetchone()[0])

    # Get total Domino Stars sent
    c.execute("SELECT COUNT(*) FROM dom_fire_reactions")
    total_fires = int(c.fetchone()[0] or 0)

    release_db(conn)

    # Format last updated
    from datetime import datetime
    if last_updated > 0:
        dt = datetime.fromtimestamp(last_updated)
        last_update_str = dt.strftime("%Y-%m-%d %H:%M:%S")
    else:
        last_update_str = "Never"

    await update.message.reply_text(
        f"🔥 Burn վիճակ\n\n"
        f"💰 Ընդհանուր burned: {total_burned:.2f} USD\n"
        f"📅 Այսօր: {today_burn:.2f} USD\n"
        f"🌟 Domino Stars: {total_fires}\n"
        f"⏰ Թարմացում: {last_update_str}"
    )    



async def burn_reward(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_user.id not in ADMIN_IDS:
        await update.message.reply_text("❌ admin չես")
        return

    if len(context.args) != 2:
        await update.message.reply_text("Օգտագործում՝ /burn_reward user_id amount")
        return

    target = int(context.args[0])
    amount = float(context.args[1])

    conn = db(); c = conn.cursor()

    c.execute("SELECT balance FROM dom_admin_fund WHERE id=1")
    fund = float(c.fetchone()[0])

    if fund < amount:
        release_db(conn)
        await update.message.reply_text("❌ Burn ֆոնդում բավարար գումար չկա")
        return

    c.execute("""
        UPDATE dom_admin_fund
        SET balance = balance - %s
        WHERE id = 1
    """, (amount,))

    c.execute("""
        UPDATE dom_users
        SET balance_usd = balance_usd + %s
        WHERE user_id = %s
    """, (amount, target))

    conn.commit()
    release_db(conn)

    await update.message.reply_text(
        f"🎁 {amount} DOMIT փոխանցվեց օգտատեր {target}-ին burn ֆոնդից"
    )

async def init_domit_data(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Admin command: Generate initial 24h DOMIT price data"""
    user_id = update.effective_user.id
    if user_id not in ADMIN_IDS:
        await update.message.reply_text("❌ Դու admin չես։")
        return
    
    try:
        import random
        from datetime import datetime, timedelta
        
        conn_obj = db()
        c = conn_obj.cursor()
        
        # Clear old data
        c.execute("DELETE FROM domit_price_history")
        
        # Generate 24 hours of candles
        base_time = datetime.now() - timedelta(hours=24)
        current_price = 1.00
        
        for i in range(288):  # 288 × 5min = 24h
            time = base_time + timedelta(minutes=i*5)
            
            open_price = current_price
            change = random.uniform(-0.02, 0.02)
            close_price = max(0.50, min(1.50, open_price + change))
            high_price = max(open_price, close_price) + random.uniform(0, 0.01)
            low_price = min(open_price, close_price) - random.uniform(0, 0.01)
            
            c.execute("""
                INSERT INTO domit_price_history (timestamp, open, high, low, close, volume)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (
                time.strftime('%Y-%m-%d %H:%M:%S'),
                round(open_price, 4),
                round(high_price, 4),
                round(low_price, 4),
                round(close_price, 4),
                random.randint(1000, 5000)
            ))
            
            current_price = close_price
        
        conn_obj.commit()
        release_db(conn_obj)
        
        await update.message.reply_text("✅ DOMIT գրաֆիկի տվյալները ստեղծվեցին!\n📊 288 candles (24 ժամ)")
    
    except Exception as e:
        logger.error(f"❌ Error in init_domit_data: {e}")
        await update.message.reply_text(f"❌ Սխալ: {e}")


async def set_domit_range(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Admin: /set_domit_range 0.50 1.50"""
    user_id = update.effective_user.id
    if user_id not in ADMIN_IDS:
        await update.message.reply_text("❌ Դու admin չես։")
        return
    
    try:
        if len(context.args) < 2:
            await update.message.reply_text("Օգտագործում՝ /set_domit_range 0.50 1.50")
            return
        
        min_price = float(context.args[0])
        max_price = float(context.args[1])
        
        conn_obj = db()
        c = conn_obj.cursor()
        c.execute("""
            UPDATE domit_config 
            SET min_price = %s, max_price = %s
            WHERE id = 1
        """, (min_price, max_price))
        conn_obj.commit()
        release_db(conn_obj)
        
        await update.message.reply_text(f"✅ DOMIT range: {min_price} - {max_price} TON")
    
    except Exception as e:
        logger.error(f"❌ Error in set_domit_range: {e}")
        await update.message.reply_text(f"❌ Սխալ: {e}")

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
    Կարգավորում ենք Telegram–ը Webhook mode-ում,
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
    application.add_handler(CommandHandler("task_add_video", task_add_video))
    application.add_handler(CommandHandler("task_add_follow", task_add_follow))
    application.add_handler(CommandHandler("task_add_invite", task_add_invite))
    application.add_handler(CommandHandler("task_add_game", task_add_game))
    application.add_handler(CommandHandler("task_add_special", task_add_special))
    application.add_handler(CommandHandler("task_list", task_list))
    application.add_handler(CommandHandler("task_delete", task_delete))
    application.add_handler(CommandHandler("task_toggle", task_toggle))
    application.add_handler(CommandHandler("burn_stats", burn_stats))
    application.add_handler(CommandHandler("burn_reward", burn_reward))
    application.add_handler(CommandHandler("migrate_posts", migrate_posts_cmd))
    application.add_handler(CommandHandler("init_domit_data", init_domit_data))
    application.add_handler(CommandHandler("set_domit_range", set_domit_range))
    await application.initialize()
    await application.start()

    port = int(os.environ.get("PORT", "10000"))
    webhook_url = f"{BASE_URL}/webhook"
    await application.bot.delete_webhook(drop_pending_updates=True)
    await application.bot.set_webhook(url=webhook_url)
    global BOT_READY
    BOT_READY = True
    print("🟢 BOT_READY = True")

    print(f"✅ Webhook set to {webhook_url}")

async def migrate_posts_cmd(update: Update, context):
    """Admin command to migrate posts media"""
    if update.effective_user.id not in ADMIN_IDS:  # ← ՓՈԽԻՐ ԱՅՍ
        await update.message.reply_text("❌ Միայն ադմինի համար")
        return
    
    await update.message.reply_text("🔄 Սկսում եմ migration...")
    
    try:
        migrate_posts_to_files()
        await update.message.reply_text("✅ Migration ավարտված!")
    except Exception as e:
        await update.message.reply_text(f"❌ Սխալ: {e}")
        print(f"Migration error: {e}")

async def task_add_video(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await add_task_with_category(update, context, "video")

async def task_add_follow(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await add_task_with_category(update, context, "follow")

async def task_add_invite(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await add_task_with_category(update, context, "invite")

async def task_add_game(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await add_task_with_category(update, context, "game")

async def task_add_special(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await add_task_with_category(update, context, "special")

async def task_list(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if user_id not in ADMIN_IDS:
        await update.message.reply_text("❌ Դու admin չես։")
        return

    conn = db(); c = conn.cursor()
    c.execute("SELECT id, title, category, reward, is_active FROM dom_tasks ORDER BY id DESC")
    rows = c.fetchall()
    release_db(conn)

    if not rows:
        await update.message.reply_text("📭 Տասկեր չկան։")
        return

    msg = "📋 **Տասկեր**\n\n"
    for r in rows:
        msg += f"ID: {r[0]} | {r[1]} | {r[2]} | 💰 {r[3]}$ | {'🟢 ON' if r[4] else '🔴 OFF'}\n"

    await update.message.reply_text(msg)

async def task_delete(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if user_id not in ADMIN_IDS:
        await update.message.reply_text("❌ Դու admin չես։")
        return

    if len(context.args) != 1:
        await update.message.reply_text("Օգտագործում՝ /task_delete ID")
        return

    task_id = int(context.args[0])

    conn = db(); c = conn.cursor()
    c.execute("DELETE FROM dom_tasks WHERE id=%s", (task_id,))
    conn.commit()
    release_db(conn)

    await update.message.reply_text(f"🗑 Տասկը ջնջված է (ID={task_id})")

async def task_toggle(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if user_id not in ADMIN_IDS:
        await update.message.reply_text("❌ admin չես")
        return

    if len(context.args) != 1:
        await update.message.reply_text("Օգտագործում՝ /task_toggle ID")
        return

    task_id = int(context.args[0])

    conn = db(); c = conn.cursor()
    c.execute("UPDATE dom_tasks SET is_active = NOT is_active WHERE id=%s RETURNING is_active", (task_id,))
    row = c.fetchone()
    conn.commit()
    release_db(conn)

    if not row:
        await update.message.reply_text("❌ Տասկը չկա")
        return

    state = "🟢 Միացված" if row[0] else "🔴 Անջատված"
    await update.message.reply_text(f"ID {task_id} → {state}")

async def add_task_with_category(update: Update, context: ContextTypes.DEFAULT_TYPE, category: str):
    user_id = update.effective_user.id
    if user_id not in ADMIN_IDS:
        await update.message.reply_text("❌ Դու admin չես։")
        return

    text = " ".join(context.args)
    if "|" not in text:
        await update.message.reply_text(
            "Օգտագործում՝\n"
            f"/task_add_{category} Title | Description | URL | Reward"
        )
        return

    try:
        title, desc, url, reward = [x.strip() for x in text.split("|")]
        reward = float(reward)
    except:
        await update.message.reply_text("❌ Սխալ ձևաչափ։")
        return

    import urllib.parse

    parsed = urllib.parse.urlparse(url)

    params = "s1={user_id}&s2={task_id}&subid1={user_id}&subid2={task_id}"

    if parsed.query:
        final_url = url + "&" + params
    else:
        final_url = url + "?" + params

    now = int(time.time())
    conn = db(); c = conn.cursor()
    c.execute("""
        INSERT INTO dom_tasks (title, description, url, reward, category, is_active, created_at)
        VALUES (%s, %s, %s, %s, %s, TRUE, %s)
    """, (title, desc, final_url, reward, category, now))
    conn.commit()
    release_db(conn)

    await update.message.reply_text(f"✔ Տասկը ավելացվեց `{category}` բաժնում։")



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
        asyncio.run_coroutine_threadsafe(application.process_update(upd), bot_loop)
        return jsonify({"ok": True}), 200
    except Exception as e:
        logger.exception("Webhook error")
        return jsonify({"ok": False, "error": str(e)}), 500



@app_web.route("/api/get_user_data", methods=["POST"])
def api_get_user_data():
    data = request.get_json()
    telegram_id = data.get("telegram_id")
    if not telegram_id:
        return jsonify({"error": "Missing telegram_id"}), 400

    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT telegram_id, username, status_level, ton_balance, usd_balance, 
               avatar_data, fires_received, fires_given, total_games, total_wins
        FROM dom_users
        WHERE telegram_id = %s
    """, (telegram_id,))
    row = cur.fetchone()
    cur.close()
    put_db(conn)

    if not row:
        return jsonify({"error": "User not found"}), 404

    total_games = row[8] or 0
    total_wins = row[9] or 0
    
    # 🧠 Intellect Score հաշվարկ
    intellect_score = round((total_wins / total_games * 10), 1) if total_games > 0 else 0.0
    
    # Progress bar (10 սիմվոլ)
    filled = int(intellect_score)  # 0-10
    progress_bar = "━" * filled + "░" * (10 - filled)

    return jsonify({
        "telegram_id": row[0],
        "username": row[1],
        "status_level": row[2],
        "ton_balance": float(row[3]),
        "usd_balance": float(row[4]),
        "avatar_data": row[5],
        "fires_received": row[6],
        "fires_given": row[7],
        "total_games": total_games,
        "total_wins": total_wins,
        "intellect_score": intellect_score,
        "intellect_bar": progress_bar
    })

@app_web.route("/api/game/bet", methods=["POST"])
def api_game_bet():
    data = request.get_json(force=True, silent=True) or {}

    user_id = int(data.get("user_id", 0))
    amount = float(data.get("amount", 0))
    game = data.get("game", "")
    choice = data.get("choice")  

    if user_id == 0 or amount <= 0 or not game:
        return jsonify({"ok": False, "error": "bad_params"}), 400

    stats = get_user_stats(user_id)
    if not stats:
        return jsonify({"ok": False, "error": "not_found"}), 404

    if amount > stats["balance_usd"]:
        return jsonify({"ok": False, "error": "low_balance"}), 200

    import random

    if game == "crash":
        result_multiplier = float(choice)
        win = True
        payout = amount * result_multiplier

    elif game == "dice":
        result = random.randint(1, 6)
        win = (result == int(choice))
        payout = amount * 6 if win else 0

    elif game == "coinflip":
        result = random.choice(["heads", "tails"])
        win = (result == choice)
        payout = amount * 2 if win else 0

    else:
        return jsonify({"ok": False, "error": "unknown_game"}), 400

    conn = db()
    c = conn.cursor()

    new_balance = stats["balance_usd"] - amount + payout

    c.execute("""
        UPDATE dom_users
        SET balance_usd=%s
        WHERE user_id=%s
    """, (new_balance, user_id))

    conn.commit()
    release_db(conn)

    return jsonify({
        "ok": True,
        "win": win,
        "payout": payout,
        "new_balance": new_balance
    })

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

@app_web.route("/api/task_attempt_create", methods=["POST"])
def api_task_attempt_create():
    """
    When user clicks 'Perform' → we register attempt.
    MyLead will later confirm via postback.
    """
    data = request.get_json(force=True, silent=True) or {}
    user_id = int(data.get("user_id", 0))
    task_id = int(data.get("task_id", 0))

    if not user_id or not task_id:
        return jsonify({"ok": False, "error": "missing_params"}), 400

    now = int(time.time())
    conn = db(); c = conn.cursor()

    c.execute("SELECT id FROM dom_tasks WHERE id=%s", (task_id,))
    if not c.fetchone():
        return jsonify({"ok": False, "error": "task_not_found"}), 404

    c.execute("""
        CREATE TABLE IF NOT EXISTS dom_task_attempts (
            id SERIAL PRIMARY KEY,
            user_id BIGINT,
            task_id BIGINT,
            created_at BIGINT
        )
    """)

    c.execute("""
        INSERT INTO dom_task_attempts (user_id, task_id, created_at)
        VALUES (%s, %s, %s)
    """, (user_id, task_id, now))

    conn.commit()
    release_db(conn)

    return jsonify({"ok": True})

def migrate_posts_to_files():
    """Migrate posts media from base64 to file system"""
    print("🔍 Starting posts media migration...")
    
    # ← ՍՏԵՂԾԻՐ ՆՈՐ CONNECTION
    conn = psycopg2.connect(DATABASE_URL)
    cursor = conn.cursor()
    
    MEDIA_DIR = "webapp/static/media/posts"
    os.makedirs(MEDIA_DIR, exist_ok=True)
    
    # Get posts with base64 media
    cursor.execute("""
        SELECT id, user_id, media_url
        FROM dom_posts
        WHERE media_url LIKE 'data:%'
        ORDER BY id
    """)
    
    posts = cursor.fetchall()
    print(f"✅ Found {len(posts)} posts with base64 media\n")
    
    for post_id, user_id, media_url in posts:
        print(f"📦 Processing post {post_id}...")
        
        if ";base64," not in media_url:
            print(f"⚠️  Skipping: invalid format")
            continue
        
        header, b64_data = media_url.split(";base64,", 1)
        content_type = header.replace("data:", "")
        
        try:
            file_bytes = base64.b64decode(b64_data)
        except Exception as e:
            print(f"❌ Decode error: {e}")
            continue
        
        if "image" in content_type:
            try:
                img = Image.open(BytesIO(file_bytes))
                img.thumbnail((800, 800), Image.Resampling.LANCZOS)
                
                filename = f"post_{post_id}.webp"
                filepath = os.path.join(MEDIA_DIR, filename)
                img.save(filepath, "WEBP", quality=85)
                
                file_url = f"/static/media/posts/{filename}"
                old_size = len(file_bytes)
                new_size = os.path.getsize(filepath)
                print(f"   ✅ Image: {old_size} → {new_size} bytes")
                
            except Exception as e:
                print(f"   ❌ Image error: {e}")
                continue
        
        elif "video" in content_type:
            ext = content_type.split("/")[1].split(";")[0]
            filename = f"post_{post_id}.{ext}"
            filepath = os.path.join(MEDIA_DIR, filename)
            
            with open(filepath, "wb") as f:
                f.write(file_bytes)
            
            file_url = f"/static/media/posts/{filename}"
            print(f"   ✅ Video: {len(file_bytes)} bytes")
        
        else:
            print(f"   ⚠️  Unknown type: {content_type}")
            continue
        
        cursor.execute("""
            UPDATE dom_posts
            SET media_url = %s
            WHERE id = %s
        """, (file_url, post_id))
        conn.commit()
        
        print(f"   ✅ Updated DB: {file_url}\n")
    
    # ← ՓԱԿԻՐ CONNECTION-Ը
    cursor.close()
    conn.close()
    
    print("🎉 Migration complete!")

if __name__ == "__main__":
    print("✅ Domino bot script loaded.")
    try:
        init_db()
    except Exception as e:
        print("⚠️ init_db failed:", e)

    port = int(os.environ.get("PORT", "10000"))

    def run_flask():
        # Start DOMIT price scheduler
        scheduler.start()
        print("✅ DOMIT price scheduler started")
        
        try:
            print(f"🌍 Flask + SocketIO starting on port {port} ...")
            socketio.run(
                app_web,
                host="0.0.0.0",
                port=port,
                use_reloader=False,
                allow_unsafe_werkzeug=True
            )
        except Exception:
            logger.exception("Flask failed")
            socketio.run(
                app_web,
                host="0.0.0.0",
                port=port,
                use_reloader=False,
                allow_unsafe_werkzeug=True
            )
        except Exception:
            logger.exception("Flask failed")



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
            bot_loop.run_until_complete(start_bot_webhook())
            bot_loop.run_forever()
        except Exception as e:
            print("🔥 Telegram bot failed:", e)

    # === START TELEGRAM BOT FIRST ===
    bot_thread = threading.Thread(target=run_bot, daemon=True)
    bot_thread.start()

    # ⏳ սպասում ենք մինչև bot_loop պատրաստ լինի
    print("⏳ Waiting for Telegram bot to be ready...")
    while bot_loop is None:
        time.sleep(0.2)

    print("✅ Telegram bot event loop is ready.")

    # ✅ START BACKGROUND THREADS BEFORE FLASK (IMPORTANT!)
    threading.Thread(target=ton_rate_updater, daemon=True).start()

    run_flask()
    print("🚀 Domino Flask + Telegram bot started.")

    
