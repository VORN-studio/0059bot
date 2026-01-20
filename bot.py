from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import random
from datetime import datetime, timedelta
import os
from PIL import Image
import io
from PIL import Image
from io import BytesIO
import base64
import hashlib
import hmac
from dotenv import load_dotenv
import requests
load_dotenv()
import time
import sys
import threading
from typing import Optional
from flask import Flask, jsonify, send_from_directory, request, redirect, render_template_string
from werkzeug.utils import secure_filename
import subprocess
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room, leave_room
import asyncio
import psycopg2
from psycopg2 import pool
import redis
import json
from functools import wraps
from contextlib import contextmanager
from collections import defaultdict
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
from pyrogram import Client
from pyrogram.types import Message
from pyrogram.errors import FloodWait, ChannelPrivate, UserBannedInChannel

import logging
from logging.handlers import RotatingFileHandler
import re

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
# --- Redirect all print() too loggeer ---
class _PrintToLogger:
    def __init__(self, _logger, level=logging.INFO, prefix=""):
        self.logger = _logger
        self.level = level
        self.prefix = prefix

    def write(self, message):
        
        msg = (message or "").rstrip()
        if msg:
            self.logger.log(self.level, f"{self.prefix}{msg}")

    def flush(self):
        # required for file-like interface
        pass

# Redirect stdout/stderr (captures print() from anywhere in the process)
sys.stdout = _PrintToLogger(logger, logging.INFO, prefix="")
sys.stderr = _PrintToLogger(logger, logging.INFO, prefix="STDERR: ")



BOT_TOKEN = "8178463310:AAGGa-vu-yns3DEoOhX2uknveiB6fFSTGJA"
CPX_APP_ID = "30681" # TODO: Enter your CPX App ID
CPX_SECURE_HASH = "O9etSikE3jCe4hnoU2OvawUPdxkkNgXV" # TODO: Enter your CPX Secure Hash
BASE_URL = "https://domino-play.online"
FAKE_HISTORY = {}
EXEIO_API_URL = "https://exe.io/api"
EXEIO_API_KEY = "dc6e9d1f2d6a8a2be6ceda101464bd97051025a7"
DATABASE_URL = "postgresql://domino_user:NaReK150503%23@localhost:5432/domino"
ADMIN_IDS = {8022643557} 
ADMIN_SECRET = os.getenv("ADMIN_SECRET", "").strip()
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEBAPP_DIR = os.path.join(BASE_DIR, "webapp")
DOMIT_PRICE_USD = 1  
PORTAL_DIR = os.path.join(WEBAPP_DIR, "portal")
TASKS_DIR = os.path.join(WEBAPP_DIR, "tasks")
GAMES_DIR = os.path.join(WEBAPP_DIR, "games")
BOT_READY = False
ONLINE_USERS = {}
REMATCH_REQUESTS = {}
MONETAG_SMARTLINK = os.getenv("MONETAG_SMARTLINK", "").strip()

# Pyrogram client for page verification
PYROGRAM_API_ID = "26610160"
PYROGRAM_API_HASH = "4856b698d1a95d1d3cbd5b673987e647"
pyrogram_client = None
pyrogram_loop = None
pyrogram_queue = None
pyrogram_results = {}

print(f"🔍 Pyrogram config check:")
print(f"   API_ID: {'✅ Set' if PYROGRAM_API_ID else '❌ Missing'}")
print(f"   API_HASH: {'✅ Set' if PYROGRAM_API_HASH else '❌ Missing'}")

# We'll create the client in the thread where it will be used

# Redis client for caching
try:
    redis_client = redis.Redis(
        host='localhost', 
        port=6379, 
        db=0, 
        decode_responses=True,
        socket_connect_timeout=5,
        socket_timeout=5,
        retry_on_timeout=True
    )
    redis_client.ping()  # Test connection
    REDIS_AVAILABLE = True
    logger.info("Redis connected successfully")
except:
    REDIS_AVAILABLE = False
    redis_client = None
    logger.warning("Redis not available, running without cache")

# Rate limiting storage
rate_limits = defaultdict(list)

def cache_result(expire_time=300):
    """Cache decorator for expensive operations"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            if not REDIS_AVAILABLE:
                return func(*args, **kwargs)
            
            cache_key = f"{func.__name__}:{hash(str(args) + str(kwargs))}"
            try:
                cached = redis_client.get(cache_key)
                if cached:
                    return json.loads(cached)
            except:
                pass
            
            result = func(*args, **kwargs)
            try:
                redis_client.setex(cache_key, expire_time, json.dumps(result))
            except:
                pass
            return result
        return wrapper
    return decorator

def check_rate_limit(user_id, limit=100, window=60):
    """Check if user exceeds rate limit"""
    now = time.time()
    user_requests = rate_limits[user_id]
    
    # Remove old requests
    user_requests[:] = [req_time for req_time in user_requests if now - req_time < window]
    
    if len(user_requests) >= limit:
        return False
    
    user_requests.append(now)
    return True

@contextmanager
def get_db_connection():
    """Context manager for database connections"""
    conn = db()
    try:
        yield conn
    finally:
        release_db(conn)
if not MONETAG_SMARTLINK:
    MONETAG_SMARTLINK = "https://otieu.com/4/10388580"
MONETAG_SMARTLINKS = {
    "US": os.getenv("MONETAG_SMARTLINK_US", "").strip(),
    "GB": os.getenv("MONETAG_SMARTLINK_GB", "").strip(),
    "DE": os.getenv("MONETAG_SMARTLINK_DE", "").strip(),
    "FR": os.getenv("MONETAG_SMARTLINK_FR", "").strip(),
    "CA": os.getenv("MONETAG_SMARTLINK_CA", "").strip(),
    "AU": os.getenv("MONETAG_SMARTLINK_AU", "").strip(),
}
RICHADS_MAINSTREAM_URL = os.getenv("RICHADS_MAINSTREAM_URL", "").strip()
if not RICHADS_MAINSTREAM_URL:
    RICHADS_MAINSTREAM_URL = "https://11745.xml.4armn.com/direct-link?pubid=995911&siteid=[SITE_ID]"
RICHADS_SITE_ID = os.getenv("RICHADS_SITE_ID", "5159").strip()
FORCED_GEO = (os.getenv("FORCED_GEO", "US") or "US").strip().upper()

def _client_ip():
    xff = request.headers.get("X-Forwarded-For", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.remote_addr or ""

def _ip_country(ip: str) -> Optional[str]:
    try:
        if not ip:
            return None
        r = requests.get(f"https://ipinfo.io/{ip}/json", timeout=2)
        if r.status_code == 200:
            js = r.json()
            c = js.get("country")
            if c:
                return str(c).upper()
    except Exception:
        pass
    return None

app_web = Flask(__name__, static_folder="webapp/static", static_url_path="/static")
CORS(app_web)

socketio = SocketIO(
    app_web,
    cors_allowed_origins="*",
    async_mode="gevent",
    logger=False,
    engineio_logger=False,
    ping_timeout=60,
    ping_interval=25,
    max_http_buffer_size=1000000,
    transports=['polling', 'websocket']
)

def ensure_balance_precision():
    conn = db(); c = conn.cursor()
    try:
        c.execute("""
            SELECT data_type, numeric_scale
            FROM information_schema.columns
            WHERE table_name='dom_users' AND column_name='balance_usd'
        """)
        row = c.fetchone()
        scale = int(row[1] or 0) if row else 0
        if scale < 4:
            c.execute("ALTER TABLE dom_users ALTER COLUMN balance_usd TYPE NUMERIC(12,6)")
            conn.commit()
    except Exception:
        try: conn.rollback()
        except Exception: pass
    finally:
        release_db(conn)

def ensure_leaderboard_tables():
    """Create leaderboard tables if they don't exist"""
    conn = db()
    c = conn.cursor()
    try:
        # Create leaderboard status table
        c.execute("""
            CREATE TABLE IF NOT EXISTS leaderboard_status (
                id SERIAL PRIMARY KEY,
                is_enabled BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Create leaderboard entries table
        c.execute("""
            CREATE TABLE IF NOT EXISTS leaderboard_entries (
                id SERIAL PRIMARY KEY,
                telegram_id BIGINT UNIQUE NOT NULL,
                referral_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Insert default status if empty
        c.execute("SELECT COUNT(*) FROM leaderboard_status")
        if c.fetchone()[0] == 0:
            c.execute("INSERT INTO leaderboard_status (is_enabled) VALUES (FALSE)")
        
        conn.commit()
        logger.info("✅ Leaderboard tables ensured")
    except Exception as e:
        try: conn.rollback()
        except Exception: pass
        logger.error(f"❌ Error creating leaderboard tables: {e}")
    finally:
        release_db(conn)


@socketio.on('join_chart')
def handle_join_chart():
    """Пользователь присоединяется к комнате с диаграммами."""
    join_room('chart_viewers')
    logger.info("👤 User joined chart_viewers room")

@socketio.on('leave_chart')
def handle_leave_chart():
    """Пользователь выходит из штурманской комнаты"""
    leave_room('chart_viewers')
    logger.info("👋 User left chart_viewers room")

@app_web.route("/")
def index():
    return "✅ Domino backend is online. Go to /app for WebApp.", 200
@app_web.route("/app")
def webapp_index():
    """Main webapp entry point - direct access without page verification"""
    return send_from_directory(WEBAPP_DIR, "index.html")

@app_web.route("/api/required-pages")
def api_required_pages():
    """API endpoint to get list of required pages"""
    try:
        conn = db()
        c = conn.cursor()
        c.execute("SELECT page_link, page_name FROM telegram_pages ORDER BY id")
        pages = c.fetchall()
        release_db(conn)
        
        pages_list = [{"name": page_name, "link": page_link} for page_link, page_name in pages]
        
        return jsonify({
            "ok": True,
            "pages": pages_list
        })
    except Exception as e:
        print(f"Error getting required pages: {e}")
        return jsonify({
            "ok": False,
            "error": str(e)
        }), 500

@app_web.route("/webapp/<path:filename>")
def serve_webapp(filename):
    """
    Обслуживание статических файлов для /webapp/...
    например, /webapp/app.js, /webapp/style.css, /webapp/assets/...
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
    """Последние 30 сообщений глобального чата"""
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

@app_web.route("/api/leaderboard")
def api_leaderboard():
    """Get leaderboard data"""
    conn = db()
    c = conn.cursor()
    
    try:
        # Check if leaderboard is enabled
        c.execute("SELECT is_enabled FROM leaderboard_status LIMIT 1")
        status_row = c.fetchone()
        
        if not status_row or not status_row[0]:
            return jsonify({"ok": True, "enabled": False, "leaderboard": []})
        
        # Get top 10 users by referral count (combine manual entries and real referrals)
        c.execute("""
            WITH all_referrals AS (
                -- Manual entries from leaderboard
                SELECT 
                    telegram_id,
                    referral_count
                FROM leaderboard_entries
                
                UNION ALL
                
                -- Real referrals from referral earnings table
                SELECT 
                    inviter_id as telegram_id,
                    COUNT(DISTINCT referred_id) as referral_count
                FROM dom_referral_earnings
                GROUP BY inviter_id
            )
            SELECT 
                COALESCE(du.username, 'User' || ar.telegram_id) as username,
                ar.telegram_id,
                SUM(ar.referral_count) as referral_count
            FROM all_referrals ar
            LEFT JOIN dom_users du ON du.user_id = ar.telegram_id
            GROUP BY ar.telegram_id, du.username
            HAVING SUM(ar.referral_count) > 0
            ORDER BY referral_count DESC
            LIMIT 10
        """)
        
        entries = c.fetchall()
        leaderboard = []
        
        medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"]
        
        for i, (username, telegram_id, referral_count) in enumerate(entries):
            leaderboard.append({
                "position": i + 1,
                "medal": medals[i] if i < len(medals) else f"{i+1}",
                "username": username,
                "telegram_id": telegram_id,
                "referral_count": referral_count
            })
        
        return jsonify({
            "ok": True, 
            "enabled": True, 
            "leaderboard": leaderboard
        })
        
    except Exception as e:
        logger.error(f"Error getting leaderboard: {e}")
        return jsonify({"ok": False, "error": str(e)})
    finally:
        release_db(conn)

@app_web.route("/api/global/hot-user")
def api_global_hot_user():
    """Пользователь с наивысшим статусом "ОНЛАЙН" в глобальном чате."""
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
    """Пользователь отправляет уведомление в глобальном чате, подтверждая свое присутствие в сети."""
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
    """Пользователь покидает глобальный чат"""
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
    """Отправить электронное письмо в глобальный чат"""
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
        "highlighted": highlight
    }, room="global")
    try:
        add_intellect_event(user_id, "global_msg", meta={"message_id": msg_id})
    except Exception:
        logger.exception("intellect_event global_msg failed")
    
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
    """Отреагируйте на электронное письмо смайликом."""
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
    
    c.execute("""
        SELECT id FROM dom_message_reactions
        WHERE message_id=%s AND chat_type=%s AND user_id=%s AND emoji=%s
    """, (message_id, chat_type, user_id, emoji))
    
    existing = c.fetchone()

    if existing:
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
    """Получайте отзывы по электронной почте"""
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
    
    try:
        add_intellect_event(giver_id, "fire_given", meta={"message_id": message_id, "chat_type": chat_type})
        add_intellect_event(receiver_id, "fire_received", meta={"message_id": message_id, "chat_type": chat_type})
    except Exception:
        logger.exception("intellect_event fire failed")

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

    try:
        add_intellect_event(sender, "dm_msg", meta={"receiver_id": receiver, "message_id": message_id})
    except Exception:
        logger.exception("intellect_event dm_msg failed")

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

# ===================== DUELS API =====================

 

@app_web.route('/api/duels/pay-bot', methods=['POST'])
def api_duels_pay_bot():
    """Pay 2 DOMIT for bot game access - burns to admin fund"""
    try:
        data = request.json
        user_id = data.get('user_id')

        # Use apply_burn_transaction to burn 2 DOMIT
        apply_burn_transaction(
            from_user=user_id,
            total_amount=0.05,
            transfers=[],
            burn_amount=0.05,
            reason="bot_game_entry"
        )

        # Get new balance
        conn = db()
        c = conn.cursor()
        c.execute("SELECT balance_usd FROM dom_users WHERE user_id=%s", (user_id,))
        row = c.fetchone()
        new_balance = float(row[0]) if row else 0.0
        release_db(conn)

        return jsonify({"success": True, "new_balance": new_balance})
    
    except ValueError as e:
        if str(e) == "low_balance":
            return jsonify({"success": False, "message": "Недостаточный баланс"}), 400
        return jsonify({"success": False, "message": str(e)}), 400
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app_web.route('/api/duels/create-table', methods=['POST'])
def api_duels_create_table():
    """Create PvP table"""
    try:
        data = request.json
        user_id = data.get('user_id')
        bet = float(data.get('bet', 0))
        game_type = data.get('game_type', 'tictactoe')
        color = (data.get('color') or 'w') if game_type == 'chess' else None
        difficulty = (data.get('difficulty') or None) if game_type == 'sudoku' else None

        if bet <= 0:
            return jsonify({"success": False, "message": "Сумма должна быть больше 0."}), 400

        # Use apply_burn_transaction to lock bet amount (no burn, just lock)
        apply_burn_transaction(
            from_user=user_id,
            total_amount=bet,
            transfers=[],
            burn_amount=0.0,
            reason="pvp_table_bet"
        )

        # Get username
        conn = db()
        c = conn.cursor()
        c.execute("SELECT username, balance_usd FROM dom_users WHERE user_id=%s", (user_id,))
        row = c.fetchone()
        username = row[0] if row else "User"
        new_balance = float(row[1]) if row else 0.0

        # Initial game state
        import json
        now = int(time.time())
        if game_type == 'chess':
            initial_state = json.dumps({
                'type': 'chess',
                'creator_color': color or 'w',
                'turn': 'w',
                'last_move': None
            })
        elif game_type == 'sudoku':
            diff = str(difficulty or 'medium').lower()
            if diff not in ('easy','medium','hard'):
                diff = 'medium'
            sol = sudoku_generate_full_solution()
            puz_grid, sol_grid = sudoku_generate_puzzle(sol, diff)
            initial_state = json.dumps({
                'type': 'sudoku',
                'difficulty': diff,
                'grid': puz_grid,
                'solution': sol_grid
            })
        else:
            initial_state = json.dumps({
                'board': [''] * 9,
                'turn': 'X',
                'rounds': {'x': 0, 'o': 0, 'current': 1}
            })

        # Create table with BIGINT timestamp and initial state
        c.execute("""
            INSERT INTO dom_duels_tables 
            (game_type, creator_id, creator_username, bet, status, game_state, created_at)
            VALUES (%s, %s, %s, %s, 'waiting', %s, %s)
            RETURNING id
        """, (game_type, user_id, username, bet, initial_state, now))

        table_id = c.fetchone()[0]
        conn.commit()
        release_db(conn)

        return jsonify({
            "success": True,
            "table_id": table_id,
            "new_balance": new_balance,
            "creator_color": color if game_type == 'chess' else None
        })
    
    except ValueError as e:
        if str(e) == "low_balance":
            return jsonify({"success": False, "message": "Недостаточный баланс"}), 400
        return jsonify({"success": False, "message": str(e)}), 400
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500



@app_web.route('/api/duels/join-table', methods=['POST'])
def api_duels_join_table():
    logger.info(f"🎯 JOIN-TABLE REQUEST: {request.json}")
    """Join PvP table"""
    try:
        data = request.json
        user_id = data.get('user_id')
        table_id = data.get('table_id')
        if not table_id or str(table_id).lower() == 'null':
            return jsonify({"success": False, "message": "Invalid table ID"}), 400

        conn = db()
        c = conn.cursor()

        # Get table info
        c.execute("""
            SELECT creator_id, bet, status, creator_username, game_type, game_state
            FROM dom_duels_tables
            WHERE id=%s
        """, (table_id,))
        table_row = c.fetchone()

        if not table_row:
            release_db(conn)
            return jsonify({"success": False, "message": "Таблица не найдена"}), 400

        creator_id, bet, status, creator_username, game_type, game_state = table_row

        if status != 'waiting':
            release_db(conn)
            return jsonify({"success": False, "message": "Столик уже занят."}), 400

        if int(creator_id) == int(user_id):
            release_db(conn)
            return jsonify({"success": True, "is_owner": True})

        # Register opponent and start the game (do NOT override existing game_state)
        c.execute("""
            UPDATE dom_duels_tables
            SET opponent_id=%s, status='playing',
                opponent_username=(SELECT username FROM dom_users WHERE user_id=%s)
            WHERE id=%s AND status='waiting'
        """, (user_id, user_id, table_id))
        conn.commit()

        if int(creator_id) == int(user_id):
            release_db(conn)
            return jsonify({"success": True, "is_owner": True, "new_balance": 0}) 

        release_db(conn)

        # Deduct bet using apply_burn_transaction
        apply_burn_transaction(
            from_user=user_id,
            total_amount=bet,
            transfers=[],
            burn_amount=0.0,
            reason="pvp_join_bet"
        )

        # Get username and new balance
        conn = db()
        c = conn.cursor()
        c.execute("SELECT username, balance_usd FROM dom_users WHERE user_id=%s", (user_id,))
        row = c.fetchone()
        username = row[0] if row else "User"
        new_balance = float(row[1]) if row else 0.0

        # Update table - game starts, preserve rounds state
        now = int(time.time())
        c.execute("""
            UPDATE dom_duels_tables
            SET opponent_id=%s, 
                opponent_username=%s, 
                status='playing',
                started_at=%s
            WHERE id=%s
        """, (user_id, username, now, table_id))

        conn.commit()
        release_db(conn)

        # Emit to creator and duels_room via SocketIO
        payload = {
            'table_id': table_id,
            'opponent_id': user_id,
            'opponent_username': username
        }
        socketio.emit('table_joined', payload, room=f'user_{creator_id}')
        socketio.emit('table_joined', payload, room='duels_room')

        # Compute colors for chess
        resp = {
            "success": True,
            "new_balance": new_balance,
            "creator_username": creator_username
        }
        try:
            if game_type == 'chess':
                import json
                st = json.loads(game_state) if isinstance(game_state, str) else (game_state or {})
                creator_color = st.get('creator_color', 'w')
                joiner_color = 'b' if creator_color == 'w' else 'w'
                resp["creator_color"] = creator_color
                resp["color"] = joiner_color
        except Exception:
            pass

        return jsonify(resp)
    
    except ValueError as e:
        if str(e) == "low_balance":
            return jsonify({"success": False, "message": "Недостаточный баланс"}), 400
        return jsonify({"success": False, "message": str(e)}), 400
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@app_web.route('/api/duels/get-tables', methods=['POST'])
def api_duels_get_tables():
    """Get list of waiting tables"""
    try:
        data = request.json
        game_type = data.get('game_type', 'tictactoe')

        conn = db()
        c = conn.cursor()
        c.execute("""
            SELECT id, creator_username, bet, created_at 
            FROM dom_duels_tables 
            WHERE status='waiting' AND game_type=%s
            ORDER BY created_at DESC
            LIMIT 20
        """, (game_type,))

        tables = []
        for row in c.fetchall():
            tables.append({
                'id': row[0],
                'creator': row[1],
                'bet': float(row[2]),
                'created_at': row[3]
            })

        release_db(conn)
        return jsonify({"success": True, "tables": tables})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@app_web.route('/api/duels/make-move', methods=['POST'])
def api_duels_make_move():
    try:
        data = request.json
        table_id = data.get('table_id')
        user_id = data.get('user_id')
        move = data.get('move') or {}

        conn = db()
        c = conn.cursor()
        c.execute(
            """
            SELECT game_state, creator_id, opponent_id, status, bet, game_type
            FROM dom_duels_tables 
            WHERE id=%s
            """,
            (table_id,),
        )
        row = c.fetchone()

        if not row:
            release_db(conn)
            return jsonify({"success": False, "message": "Таблица не найдена"}), 400

        game_state, creator_id, opponent_id, status, bet, game_type = row

        if status != 'playing':
            release_db(conn)
            return jsonify({"success": False, "message": "Игра ещё не началась или не закончилась."}), 400

        import json, random
        state = json.loads(game_state) if isinstance(game_state, str) else (game_state or {})

        if game_type == 'chess':
            creator_color = state.get('creator_color', 'w')
            my_color = creator_color if int(user_id) == int(creator_id) else ('b' if creator_color == 'w' else 'w')
            turn = state.get('turn', 'w')
            if turn != my_color:
                release_db(conn)
                return jsonify({"success": False, "message": "Ваша очередь переезжать ещё не настала."}), 400

            last_move = move
            result = data.get('result')
            next_turn = 'b' if my_color == 'w' else 'w'
            new_state = {**state, 'last_move': last_move, 'turn': next_turn}

            now = int(time.time())
            if result == 'mate':
                winner_id = int(user_id)
                c.execute(
                    """
                    UPDATE dom_duels_tables
                    SET game_state=%s, status='finished', winner_id=%s, finished_at=%s
                    WHERE id=%s
                    """,
                    (json.dumps(new_state), winner_id, now, table_id),
                )
                c.execute("""
                    UPDATE dom_users
                    SET total_games = COALESCE(total_games,0) + 1
                    WHERE user_id IN (%s, %s)
                """, (creator_id, opponent_id))
                c.execute("""
                    UPDATE dom_users
                    SET total_wins = COALESCE(total_wins,0) + 1
                    WHERE user_id=%s
                """, (winner_id,))
                prize = float(bet) * 1.75
                c.execute("""
                    UPDATE dom_users 
                    SET balance_usd = balance_usd + %s 
                    WHERE user_id=%s
                """, (prize, winner_id))
                burn_amount = float(bet) * 0.25
                loser_id = opponent_id if int(winner_id) == int(creator_id) else creator_id
                c.execute("""
                    INSERT INTO dom_burn_ledger (user_id, amount, reason, created_at)
                    VALUES (%s, %s, %s, %s)
                """, (loser_id, burn_amount, 'pvp_chess_mate_burn', now))
                c.execute("""
                    UPDATE dom_burn_account
                    SET total_burned = total_burned + %s,
                        last_updated = %s
                    WHERE id = 1
                """, (burn_amount, now))
                conn.commit()
                release_db(conn)
                socketio.emit('game_over', {'table_id': table_id, 'winner_id': winner_id, 'prize': prize}, room=f'user_{creator_id}')
                socketio.emit('game_over', {'table_id': table_id, 'winner_id': winner_id, 'prize': prize}, room=f'user_{opponent_id}')
                try:
                    add_intellect_event(creator_id, "pvp_played", meta={"table_id": table_id, "bet": float(bet)})
                    add_intellect_event(opponent_id, "pvp_played", meta={"table_id": table_id, "bet": float(bet)})
                    add_intellect_event(winner_id, "pvp_win", meta={"table_id": table_id, "bet": float(bet)})
                except Exception:
                    logger.exception("intellect_event pvp_win failed")
                return jsonify({"success": True, "game_state": new_state, "winner": winner_id, "prize": prize})
            elif result == 'stalemate':
                c.execute(
                    """
                    UPDATE dom_duels_tables
                    SET game_state=%s, status='finished', finished_at=%s
                    WHERE id=%s
                    """,
                    (json.dumps(new_state), now, table_id),
                )
                c.execute("""
                    UPDATE dom_users
                    SET total_games = COALESCE(total_games,0) + 1
                    WHERE user_id IN (%s, %s)
                """, (creator_id, opponent_id))
                c.execute("""
                    UPDATE dom_users 
                    SET balance_usd = balance_usd + %s 
                    WHERE user_id IN (%s, %s)
                """, (float(bet), creator_id, opponent_id))
                conn.commit()
                release_db(conn)
                socketio.emit('game_over', {'table_id': table_id, 'winner_id': None, 'draw': True}, room=f'user_{creator_id}')
                socketio.emit('game_over', {'table_id': table_id, 'winner_id': None, 'draw': True}, room=f'user_{opponent_id}')
                try:
                    add_intellect_event(creator_id, "pvp_played", meta={"table_id": table_id, "bet": float(bet)})
                    add_intellect_event(opponent_id, "pvp_played", meta={"table_id": table_id, "bet": float(bet)})
                    add_intellect_event(creator_id, "pvp_draw", meta={"table_id": table_id})
                    add_intellect_event(opponent_id, "pvp_draw", meta={"table_id": table_id})
                except Exception:
                    logger.exception("intellect_event pvp_draw failed")
                return jsonify({"success": True, "game_state": new_state, "draw": True})
            else:
                c.execute(
                    """
                    UPDATE dom_duels_tables
                    SET game_state=%s
                    WHERE id=%s
                    """,
                    (json.dumps(new_state), table_id),
                )
                conn.commit()
                release_db(conn)
                opponent = opponent_id if int(user_id) == int(creator_id) else creator_id
                socketio.emit('opponent_move', {'table_id': table_id, 'from': move.get('from'), 'to': move.get('to'), 'game_state': new_state}, room=f'user_{opponent}')
                return jsonify({"success": True, "game_state": new_state})

        # tic-tac-toe logic (default)
        board = state.get('board', [''] * 9)
        turn = state.get('turn', 'X')
        player_symbol = 'X' if int(user_id) == int(creator_id) else 'O'

        if turn != player_symbol:
            release_db(conn)
            return jsonify({"success": False, "message": "Ваша очередь переезжать ещё не настала."}), 400

        index = move.get('index')
        if index is None or index < 0 or index > 8:
            release_db(conn)
            return jsonify({"success": False, "message": "Неправильный ход"}), 400

        if board[index] != '':
            release_db(conn)
            return jsonify({"success": False, "message": "Этот блок занят."}), 400

        board[index] = player_symbol

        winner_symbol = check_winner(board)
        is_draw_now = not winner_symbol and '' not in board

        rounds = state.get('rounds', {'x': 0, 'o': 0, 'current': 1})
        game_finished = False
        final_winner_id = None

        if winner_symbol or is_draw_now:
            if winner_symbol == 'X':
                rounds['x'] += 1
            elif winner_symbol == 'O':
                rounds['o'] += 1

            if rounds['current'] < 3:
                rounds['current'] += 1
                board = [''] * 9
                next_turn = random.choice(['X', 'O'])
            else:
                game_finished = True
                if rounds['x'] > rounds['o']:
                    final_winner_id = creator_id
                elif rounds['o'] > rounds['x']:
                    final_winner_id = opponent_id
                else:
                    final_winner_id = None
                next_turn = state.get('turn', 'X')
        else:
            next_turn = 'O' if turn == 'X' else 'X'

        new_state = {'board': board, 'turn': next_turn, 'rounds': rounds}

        if game_finished:
            now = int(time.time())
            if final_winner_id is not None:
                c.execute(
                    """
                    UPDATE dom_duels_tables
                    SET game_state=%s, status='finished', winner_id=%s, finished_at=%s
                    WHERE id=%s
                    """,
                    (json.dumps(new_state), final_winner_id, now, table_id),
                )
                c.execute(
                    """
                    UPDATE dom_users
                    SET total_games = COALESCE(total_games,0) + 1
                    WHERE user_id IN (%s, %s)
                    """,
                    (creator_id, opponent_id),
                )
                c.execute(
                    """
                    UPDATE dom_users
                    SET total_wins = COALESCE(total_wins,0) + 1
                    WHERE user_id=%s
                    """,
                    (final_winner_id,),
                )
                prize = float(bet) * 1.75
                c.execute(
                    """
                    UPDATE dom_users 
                    SET balance_usd = balance_usd + %s 
                    WHERE user_id=%s
                    """,
                    (prize, final_winner_id),
                )
                burn_amount = float(bet) * 0.25
                loser_id = opponent_id if int(final_winner_id) == int(creator_id) else creator_id
                c.execute(
                    """
                    INSERT INTO dom_burn_ledger (user_id, amount, reason, created_at)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (loser_id, burn_amount, 'pvp_loss_burn', now),
                )
                c.execute(
                    """
                    UPDATE dom_burn_account
                    SET total_burned = total_burned + %s,
                        last_updated = %s
                    WHERE id = 1
                    """,
                    (burn_amount, now),
                )
                conn.commit()
                release_db(conn)
                socketio.emit(
                    'game_over',
                    {'table_id': table_id, 'winner_id': final_winner_id, 'prize': prize},
                    room=f'user_{creator_id}',
                )
                socketio.emit(
                    'game_over',
                    {'table_id': table_id, 'winner_id': final_winner_id, 'prize': prize},
                    room=f'user_{opponent_id}',
                )
                try:
                    add_intellect_event(creator_id, "pvp_played", meta={"table_id": table_id, "bet": float(bet)})
                    add_intellect_event(opponent_id, "pvp_played", meta={"table_id": table_id, "bet": float(bet)})
                    add_intellect_event(final_winner_id, "pvp_win", meta={"table_id": table_id, "bet": float(bet)})
                except Exception:
                    logger.exception("intellect_event pvp_win failed")
                return jsonify({"success": True, "game_state": new_state, "winner": player_symbol if int(final_winner_id) == int(user_id) else ('X' if int(final_winner_id) == int(creator_id) else 'O'), "prize": prize})
            else:
                c.execute(
                    """
                    UPDATE dom_duels_tables
                    SET game_state=%s, status='finished', finished_at=%s
                    WHERE id=%s
                    """,
                    (json.dumps(new_state), now, table_id),
                )
                c.execute(
                    """
                    UPDATE dom_users
                    SET total_games = COALESCE(total_games,0) + 1
                    WHERE user_id IN (%s, %s)
                    """,
                    (creator_id, opponent_id),
                )
                c.execute(
                    """
                    UPDATE dom_users 
                    SET balance_usd = balance_usd + %s 
                    WHERE user_id IN (%s, %s)
                    """,
                    (float(bet), creator_id, opponent_id),
                )
                conn.commit()
                release_db(conn)
                socketio.emit('game_over', {'table_id': table_id, 'winner_id': None, 'draw': True}, room=f'user_{creator_id}')
                socketio.emit('game_over', {'table_id': table_id, 'winner_id': None, 'draw': True}, room=f'user_{opponent_id}')
                try:
                    add_intellect_event(creator_id, "pvp_played", meta={"table_id": table_id, "bet": float(bet)})
                    add_intellect_event(opponent_id, "pvp_played", meta={"table_id": table_id, "bet": float(bet)})
                    add_intellect_event(creator_id, "pvp_draw", meta={"table_id": table_id})
                    add_intellect_event(opponent_id, "pvp_draw", meta={"table_id": table_id})
                except Exception:
                    logger.exception("intellect_event pvp_draw failed")
                return jsonify({"success": True, "game_state": new_state, "draw": True})
        else:
            c.execute(
                """
                UPDATE dom_duels_tables
                SET game_state=%s
                WHERE id=%s
                """,
                (json.dumps(new_state), table_id),
            )
            conn.commit()
            release_db(conn)
            opponent = opponent_id if int(user_id) == int(creator_id) else creator_id
            socketio.emit('opponent_move', {'table_id': table_id, 'move': move, 'game_state': new_state}, room=f'user_{opponent}')
            return jsonify({"success": True, "game_state": new_state})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@app_web.route('/api/duels/get-table-state', methods=['POST'])
def api_duels_get_table_state():
    """Get current table state"""
    try:
        data = request.json
        table_id = data.get('table_id')

        conn = db()
        c = conn.cursor()
        c.execute("""
            SELECT game_state, status, creator_id, opponent_id, 
                   creator_username, opponent_username, winner_id, bet, game_type
            FROM dom_duels_tables 
            WHERE id=%s
        """, (table_id,))
        row = c.fetchone()

        if not row:
            release_db(conn)
            return jsonify({"success": False, "message": "Таблица не найдена"}), 400

        import json
        game_state = json.loads(row[0]) if isinstance(row[0], str) else row[0]
        game_type = row[8]
        color = None
        try:
            if game_type == 'chess' and isinstance(game_state, dict):
                color = game_state.get('creator_color', 'w')
        except Exception:
            color = None
        
        release_db(conn)
        
        return jsonify({
            "success": True,
            "game_state": game_state,
            "status": row[1],
            "creator_id": row[2],
            "opponent_id": row[3],
            "creator_username": row[4],
            "opponent_username": row[5],
            "winner_id": row[6],
            "bet": float(row[7]),
            "game_type": game_type,
            "creator_color": color,
            "color": color
        })
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


def check_winner(board):
    """Check tic-tac-toe winner"""
    lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],  # rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8],  # cols
        [0, 4, 8], [2, 4, 6]              # diagonals
    ]
    
    for line in lines:
        if board[line[0]] and board[line[0]] == board[line[1]] == board[line[2]]:
            return board[line[0]]
    
    return None

def sudoku_generate_full_solution():
    g = [[0 for _ in range(9)] for _ in range(9)]
    nums = list(range(1, 10))
    import random
    def is_valid(r, c, n):
        for i in range(9):
            if g[r][i] == n or g[i][c] == n:
                return False
        br = (r // 3) * 3
        bc = (c // 3) * 3
        for rr in range(3):
            for cc in range(3):
                if g[br + rr][bc + cc] == n:
                    return False
        return True
    def backtrack(pos=0):
        if pos == 81:
            return True
        r = pos // 9
        c = pos % 9
        order = nums[:]
        random.shuffle(order)
        for n in order:
            if is_valid(r, c, n):
                g[r][c] = n
                if backtrack(pos + 1):
                    return True
                g[r][c] = 0
        return False
    backtrack(0)
    return g

def sudoku_count_solutions(grid_in, limit=2):
    g = [row[:] for row in grid_in]
    def is_valid(r, c, n):
        for i in range(9):
            if g[r][i] == n or g[i][c] == n:
                return False
        br = (r // 3) * 3
        bc = (c // 3) * 3
        for rr in range(3):
            for cc in range(3):
                if g[br + rr][bc + cc] == n:
                    return False
        return True
    solutions = 0
    def backtrack():
        nonlocal solutions
        r = -1
        c = -1
        for i in range(9):
            for j in range(9):
                if g[i][j] == 0:
                    r = i
                    c = j
                    break
            if r != -1:
                break
        if r == -1:
            solutions += 1
            return solutions < limit
        for n in range(1, 10):
            if is_valid(r, c, n):
                g[r][c] = n
                if not backtrack():
                    g[r][c] = 0
                    return False
                g[r][c] = 0
        return True
    backtrack()
    return solutions

def sudoku_generate_puzzle(solution_grid, difficulty='medium'):
    sol = [row[:] for row in solution_grid]
    puzzle = [row[:] for row in solution_grid]
    target = 40 if difficulty == 'easy' else (28 if difficulty == 'hard' else 34)
    cells = [(r, c) for r in range(9) for c in range(9)]
    import random
    random.shuffle(cells)
    removed = 0
    for r, c in cells:
        if 81 - removed <= target:
            break
        keep = puzzle[r][c]
        puzzle[r][c] = 0
        if sudoku_count_solutions(puzzle, 2) != 1:
            puzzle[r][c] = keep
        else:
            removed += 1
    return puzzle, sol


@app_web.route('/api/duels/forfeit', methods=['POST'])
def api_duels_forfeit():
    try:
        data = request.json
        table_id = data.get('table_id')
        user_id = data.get('user_id')

        conn = db()
        c = conn.cursor()
        c.execute(
            """
            SELECT game_state, creator_id, opponent_id, status, bet, game_type
            FROM dom_duels_tables
            WHERE id=%s
            """,
            (table_id,),
        )
        row = c.fetchone()

        if not row:
            release_db(conn)
            return jsonify({"success": False, "message": "Плата не найдена."}), 400

        game_state, creator_id, opponent_id, status, bet, game_type = row

        if status != 'playing':
            release_db(conn)
            return jsonify({"success": False, "message": "Игра не находится в активной фазе."}), 400

        import json
        state = json.loads(game_state) if isinstance(game_state, str) else (game_state or {})
        if game_type == 'chess':
            creator_color = state.get('creator_color', 'w')
            my_color = creator_color if int(user_id) == int(creator_id) else ('b' if creator_color == 'w' else 'w')
            turn = state.get('turn', 'w')
            if turn != my_color:
                release_db(conn)
                return jsonify({"success": False, "message": "Ваша очередь переезжать ещё не настала."}), 400
            winner_id = opponent_id if int(user_id) == int(creator_id) else creator_id
        else:
            turn = state.get('turn', 'X')
            player_symbol = 'X' if int(user_id) == int(creator_id) else 'O'
            if turn != player_symbol:
                release_db(conn)
                return jsonify({"success": False, "message": "Ваша очередь переезжать ещё не настала."}), 400
            winner_id = opponent_id if int(user_id) == int(creator_id) else creator_id
        now = int(time.time())

        c.execute(
            """
            UPDATE dom_duels_tables
            SET status='finished', winner_id=%s, finished_at=%s
            WHERE id=%s
            """,
            (winner_id, now, table_id),
        )
        c.execute(
            """
            UPDATE dom_users
            SET total_games = COALESCE(total_games,0) + 1
            WHERE user_id IN (%s, %s)
            """,
            (creator_id, opponent_id),
        )
        c.execute(
            """
            UPDATE dom_users
            SET total_wins = COALESCE(total_wins,0) + 1
            WHERE user_id=%s
            """,
            (winner_id,),
        )
        prize = float(bet) * 1.75
        c.execute(
            """
            UPDATE dom_users
            SET balance_usd = balance_usd + %s
            WHERE user_id=%s
            """,
            (prize, winner_id),
        )
        burn_amount = float(bet) * 0.25
        loser_id = int(user_id)
        c.execute(
            """
            INSERT INTO dom_burn_ledger (user_id, amount, reason, created_at)
            VALUES (%s, %s, %s, %s)
            """,
            (loser_id, burn_amount, 'pvp_timeout_loss', now),
        )
        c.execute(
            """
            UPDATE dom_burn_account
            SET total_burned = total_burned + %s,
                last_updated = %s
            WHERE id = 1
            """,
            (burn_amount, now),
        )
        conn.commit()
        release_db(conn)

        socketio.emit('game_over', {'table_id': table_id, 'winner_id': winner_id, 'prize': prize}, room=f'user_{creator_id}')
        socketio.emit('game_over', {'table_id': table_id, 'winner_id': winner_id, 'prize': prize}, room=f'user_{opponent_id}')
        try:
            add_intellect_event(creator_id, "pvp_played", meta={"table_id": table_id, "bet": float(bet)})
            add_intellect_event(opponent_id, "pvp_played", meta={"table_id": table_id, "bet": float(bet)})
            add_intellect_event(winner_id, "pvp_win", meta={"table_id": table_id, "bet": float(bet)})
        except Exception:
            logger.exception("intellect_event pvp_timeout failed")

        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


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


duels_players = set()


@socketio.on("join_duels")
def handle_join_duels(data):
    user_id = data.get("user_id")
    if user_id:
        join_room("duels_room")
        duels_players.add(user_id)
        logger.info(f"🎮 User {user_id} joined duels_room. Total: {len(duels_players)}")
        
        emit("update_online_count", {"count": len(duels_players)}, room="duels_room")

def _current_user_id():
    for uid, sid in ONLINE_USERS.items():
        if sid == request.sid:
            return uid
    return None

@socketio.on("join_table")
def on_join_table(data):
    try:
        table_id = int(data.get("table_id", 0))
    except Exception:
        table_id = 0
    if table_id:
        join_room(f"table_{table_id}")

@socketio.on("sudoku_mistake")
def on_sudoku_mistake(data):
    try:
        table_id = int(data.get("table_id", 0))
        mistakes = int(data.get("mistakes", 0))
    except Exception:
        table_id = 0
        mistakes = 0
    uid = _current_user_id()
    if table_id and uid:
        emit("sudoku_mistake", {"table_id": table_id, "user_id": uid, "mistakes": mistakes}, room=f"table_{table_id}")

@socketio.on("sudoku_over")
def on_sudoku_over(data):
    try:
        table_id = int(data.get("table_id", 0))
    except Exception:
        table_id = 0
    result = (data.get("result") or "").strip()
    uid = _current_user_id()
    if not table_id or not uid or result not in ("win", "lose"):
        return
    conn = db(); c = conn.cursor()
    c.execute("""
        SELECT creator_id, opponent_id, status, bet
        FROM dom_duels_tables
        WHERE id=%s
    """, (table_id,))
    row = c.fetchone()
    if not row:
        release_db(conn); return
    creator_id, opponent_id, status, bet = row
    if status != 'playing' or not opponent_id:
        release_db(conn); return
    winner_id = uid if result == 'win' else (opponent_id if int(uid) == int(creator_id) else creator_id)
    now = int(time.time())
    c.execute("""
        UPDATE dom_duels_tables
        SET status='finished', winner_id=%s, finished_at=%s
        WHERE id=%s AND status='playing'
    """, (winner_id, now, table_id))
    c.execute("""
        UPDATE dom_users
        SET total_games = COALESCE(total_games,0) + 1
        WHERE user_id IN (%s, %s)
    """, (creator_id, opponent_id))
    c.execute("""
        UPDATE dom_users
        SET total_wins = COALESCE(total_wins,0) + 1
        WHERE user_id=%s
    """, (winner_id,))
    prize = float(bet) * 1.75
    c.execute("""
        UPDATE dom_users
        SET balance_usd = balance_usd + %s
        WHERE user_id=%s
    """, (prize, winner_id))
    burn_amount = float(bet) * 0.25
    loser_id = opponent_id if int(winner_id) == int(creator_id) else creator_id
    c.execute("""
        INSERT INTO dom_burn_ledger (user_id, amount, reason, created_at)
        VALUES (%s, %s, %s, %s)
    """, (loser_id, burn_amount, 'pvp_sudoku_loss_burn', now))
    c.execute("""
        UPDATE dom_burn_account
        SET total_burned = total_burned + %s,
            last_updated = %s
        WHERE id = 1
    """, (burn_amount, now))
    conn.commit(); release_db(conn)
    emit("sudoku_over", {"table_id": table_id, "result": result}, room=f"table_{table_id}")
    socketio.emit('game_over', {'table_id': table_id, 'winner_id': winner_id, 'prize': prize}, room=f'user_{creator_id}')
    socketio.emit('game_over', {'table_id': table_id, 'winner_id': winner_id, 'prize': prize}, room=f'user_{opponent_id}')

@socketio.on("sudoku_progress")
def on_sudoku_progress(data):
    try:
        table_id = int(data.get("table_id", 0))
        percent = int(data.get("percent", 0))
    except Exception:
        table_id = 0
        percent = 0
    uid = _current_user_id()
    if table_id and uid:
        emit("sudoku_progress", {"table_id": table_id, "user_id": uid, "percent": percent}, room=f"table_{table_id}")

@socketio.on("leave_duels")
def handle_leave_duels(data):
    user_id = data.get("user_id")
    if user_id in duels_players:
        duels_players.remove(user_id)
        leave_room("duels_room")
        logger.info(f"🏃 User {user_id} left duels_room. Total: {len(duels_players)}")
        emit("update_online_count", {"count": len(duels_players)}, room="duels_room")

@socketio.on("join_global")
def on_join_global():
    join_room("global")
    logger.info(f"🌍 joined global | sid={request.sid}")

@socketio.on("join_feed")
def on_join_feed():
    join_room("feed")
    logger.info("📰 joined feed")

@socketio.on("rematch_request")
def on_rematch_request(data):
    try:
        table_id = int(data.get("table_id", 0))
        user_id = int(data.get("user_id", 0))
        if table_id == 0 or user_id == 0:
            return

        conn = db(); c = conn.cursor()
        c.execute("""
            SELECT game_type, creator_id, creator_username, opponent_id, opponent_username, bet, status, game_state
            FROM dom_duels_tables
            WHERE id=%s
        """, (table_id,))
        row = c.fetchone()
        if not row:
            release_db(conn); return

        game_type, creator_id, creator_username, opponent_id, opponent_username, bet, status, game_state = row
        release_db(conn)
        if status != 'finished' or not opponent_id:
            return

        req = REMATCH_REQUESTS.get(table_id, set())
        req.add(user_id)
        REMATCH_REQUESTS[table_id] = req

        if creator_id in req and opponent_id in req:
            import json, time
            st = json.loads(game_state) if isinstance(game_state, str) else (game_state or {})
            creator_color = st.get('creator_color', 'w') if game_type == 'chess' else None
            sudoku_diff = st.get('difficulty', 'medium') if game_type == 'sudoku' else None

            conn2 = db(); c2 = conn2.cursor()
            now = int(time.time())
            if game_type == 'chess':
                initial_state = json.dumps({
                    'type': 'chess',
                    'creator_color': creator_color or 'w',
                    'turn': 'w',
                    'last_move': None
                })
            elif game_type == 'sudoku':
                diff = str(sudoku_diff or 'medium').lower()
                if diff not in ('easy','medium','hard'):
                    diff = 'medium'
                solg = sudoku_generate_full_solution()
                puz, sol = sudoku_generate_puzzle(solg, diff)
                initial_state = json.dumps({
                    'type': 'sudoku',
                    'difficulty': diff,
                    'grid': puz,
                    'solution': sol
                })
            else:
                initial_state = json.dumps({
                    'board': [''] * 9,
                    'turn': 'X',
                    'rounds': {'x': 0, 'o': 0, 'current': 1}
                })

            c2.execute("""
                INSERT INTO dom_duels_tables (game_type, creator_id, creator_username, bet, status, game_state, created_at)
                VALUES (%s, %s, %s, %s, 'waiting', %s, %s)
                RETURNING id
            """, (game_type, creator_id, creator_username, bet, initial_state, now))
            new_table_id = c2.fetchone()[0]

            # Join opponent automatically (simulate join)
            c2.execute("""
                UPDATE dom_duels_tables
                SET opponent_id=%s, opponent_username=%s, status='playing', started_at=%s
                WHERE id=%s
            """, (opponent_id, opponent_username, now, new_table_id))
            conn2.commit(); release_db(conn2)

            try:
                apply_burn_transaction(from_user=creator_id, total_amount=float(bet), transfers=[], burn_amount=0.0, reason="pvp_rematch_creator")
                apply_burn_transaction(from_user=opponent_id, total_amount=float(bet), transfers=[], burn_amount=0.0, reason="pvp_rematch_opponent")
            except Exception:
                logger.exception("rematch burn failed")

            payload = { 'table_id': new_table_id, 'creator_id': creator_id, 'opponent_id': opponent_id, 'creator_color': creator_color }
            socketio.emit('rematch_ready', payload, room=f'user_{creator_id}')
            socketio.emit('rematch_ready', payload, room=f'user_{opponent_id}')
            REMATCH_REQUESTS.pop(table_id, None)
    except Exception:
        logger.exception("rematch_request error")

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
    """Пользователь пишет в глобальном чате"""
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
    """Пользователь пишет в личные сообщения."""
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

@app_web.route('/duels/bot-game')
def duels_bot_game():
    duels_dir = os.path.join(WEBAPP_DIR, "portal", "duels")
    game = request.args.get('game', 'tictactoe')
    game_file = os.path.join(duels_dir, game, f"{game}.html")
    
    if os.path.exists(game_file):
        return send_from_directory(os.path.join(duels_dir, game), f"{game}.html")
    else:
        return "Game not found", 404
    
@app_web.route('/duels/<game>/<path:filename>')
def duels_game_assets(game, filename):
    duels_dir = os.path.join(WEBAPP_DIR, "portal", "duels")
    return send_from_directory(os.path.join(duels_dir, game), filename)    

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
            ORDER BY timestamp DESC
            LIMIT 1440
        """)
        
        rows = c.fetchall()
        candles = []

        from datetime import datetime
        for row in rows:
            unix_time = int(row[0])  

            candles.append({
                'time': unix_time,
                'open': float(row[1]),
                'high': float(row[2]),
                'low': float(row[3]),
                'close': float(row[4])
            })

        # Reverse to get ascending order (oldest first)
        candles.reverse()
        
        release_db(conn_obj)
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

    FOLLOW_PRICE = 0.5
    PAY_TARGET = 0.2
    BURN_AMOUNT = 0.3

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

    try:
        add_intellect_event(follower, "follow_made", meta={"target": target})
    except Exception:
        logger.exception("intellect_event follow failed")
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
    
    # Get media_url before delete
    c.execute("SELECT media_url FROM dom_posts WHERE id=%s AND user_id=%s", (pid, uid))
    row = c.fetchone()
    
    if row and row[0]:
        media_url = row[0]
        # Delete file if not base64
        if not media_url.startswith("data:"):
            file_path = f"webapp{media_url}"
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                    logger.info(f"Deleted file: {file_path}")
                except Exception as e:
                    logger.error(f"File delete error: {e}")
    
    # Delete from DB
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

    if not ADMIN_SECRET or secret != ADMIN_SECRET:
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

    return jsonify({"ok": True, "message": f"Added {amount} TON to {target}"})

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
    Мы проверяем, подписался ли подписчик на целевую аудиторию или нет.
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
    Создает новую запись для портала Domino.
    Тело: { "user_id": ..., "text": optional, "media_url": optional }
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

    try:
        add_intellect_event(user_id, "post_created", meta={"post_id": pid})
    except Exception:
        logger.exception("intellect_event post_created failed")
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

    try:
        add_intellect_event(int(user_id), "comment_created", meta={"post_id": post_id})
    except Exception:
        logger.exception("intellect_event comment_created failed")

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
    Основная лента с постами от разных пользователей.
    Запрос: ?uid=VIEWER_ID (необходим для отображения статуса «нравится»)
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
    Возвращает собственные публикации пользователя.
    Необязательный параметр viewer=? для статуса «нравится».
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
        pid, uid, username, avatar, status_level, text, media_url, likes, created_at = r
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
    Пользователю понравился пост.
    Текст: { "user_id": ..., "post_id": ... }
    В настоящее время можно поставить лайк только один раз, дизлайк невозможен.
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
    import subprocess
    import uuid
    
    uid = request.form.get("uid")
    file = request.files.get("file")

    if not uid or not file:
        return jsonify({"ok": False, "error": "missing"}), 400

    # Create media folder
    media_folder = "webapp/static/media/posts"
    os.makedirs(media_folder, exist_ok=True)

    # Generate unique filename
    ext = os.path.splitext(file.filename)[1].lower()
    unique_name = f"{uuid.uuid4().hex}{ext}"
    temp_path = os.path.join(media_folder, f"temp_{unique_name}")
    final_path = os.path.join(media_folder, unique_name)

    # Save uploaded file
    file.save(temp_path)

    # Compress if video
    if ext in [".mp4", ".mov", ".avi", ".webm"]:
        try:
            # Compress: 480p, 500kbps (smaller size)
            subprocess.run([
                "ffmpeg", "-i", temp_path,
                "-vf", "scale=-2:480",
                "-c:v", "libx264", "-b:v", "500k",
                "-c:a", "aac", "-b:a", "96k",
                "-preset", "faster",
                "-y", final_path
            ], check=True, capture_output=True, timeout=60)
            
            # Delete temp file
            os.remove(temp_path)
            logger.info(f"Compressed video: {unique_name}")
        except Exception as e:
            logger.error(f"FFmpeg error: {e}")
            # Fallback: use original
            if os.path.exists(temp_path):
                os.rename(temp_path, final_path)
    else:
        # Not video, just rename
        os.rename(temp_path, final_path)

    # Return URL
    url = f"/webapp/static/media/posts/{unique_name}"
    return jsonify({"ok": True, "url": url})


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
    SAFE PostgreSQL pooled connection getter with validation
    """
    global _db_pool

    if _db_pool is None:
        _db_pool = pool.SimpleConnectionPool(
            minconn=50,
            maxconn=1000,
            dsn=DATABASE_URL
        )
        logger.info("PostgreSQL pool initialized (1000 connections)")

    try:
        conn = _db_pool.getconn()
        # Validate connection is alive
        if conn.closed:
            logger.debug("Got closed connection from pool, retrying")
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

ensure_balance_precision()

def update_daily_tasks_and_bonuses(cursor, user_id):
    """Update daily tasks count and check for bonus eligibility"""
    from datetime import date
    
    today = date.today()
    
    # Reset daily count if it's a new day
    cursor.execute("SELECT last_daily_reset FROM dom_users WHERE user_id=%s", (user_id,))
    last_reset = cursor.fetchone()
    
    if not last_reset or last_reset[0] != today:
        cursor.execute("""
            UPDATE dom_users 
            SET daily_tasks_completed = 0, 
                daily_bonus_level = 1, 
                last_daily_reset = %s,
                has_2x_multiplier = FALSE
            WHERE user_id=%s
        """, (today, user_id))
        print(f"🔄 Daily reset for user {user_id} on {today}")
    
    # Increment daily tasks count
    cursor.execute("""
        UPDATE dom_users 
        SET daily_tasks_completed = daily_tasks_completed + 1 
        WHERE user_id=%s
    """, (user_id,))
    
    # Get current daily tasks count
    cursor.execute("SELECT daily_tasks_completed FROM dom_users WHERE user_id=%s", (user_id,))
    daily_count = cursor.fetchone()[0]
    
    print(f"📊 User {user_id} daily tasks count: {daily_count}")
    
    # Check for bonuses and update level
    bonus_given = None
    new_level = None
    
    if daily_count == 10:
        bonus_given = 0.25
        new_level = 2
    elif daily_count == 30:
        bonus_given = 0.50
        new_level = 3
    elif daily_count == 100:
        bonus_given = 1.00
        new_level = 4
    elif daily_count == 200:
        bonus_given = 1.50
        new_level = 5
        # Activate 2x multiplier for 2 hours
        cursor.execute("""
            UPDATE dom_users 
            SET has_2x_multiplier = TRUE 
            WHERE user_id=%s
        """, (user_id,))
    
    if bonus_given:
        cursor.execute("""
            UPDATE dom_users 
            SET balance_usd = COALESCE(balance_usd,0) + %s,
                daily_bonus_level = %s
            WHERE user_id=%s
        """, (bonus_given, new_level, user_id))
        
        print(f"🎉 Daily bonus: uid={user_id} completed {daily_count} tasks, bonus={bonus_given} TON, level={new_level}")
    else:
        print(f"ℹ️ No bonus for user {user_id} at {daily_count} tasks")
    
    return bonus_given, new_level



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
    "ALTER TABLE dom_users ADD COLUMN IF NOT EXISTS total_wins INTEGER DEFAULT 0",
    "ALTER TABLE dom_users ADD COLUMN IF NOT EXISTS referral_earnings NUMERIC(18,6) DEFAULT 0",
    "ALTER TABLE dom_users ADD COLUMN IF NOT EXISTS daily_tasks_completed INTEGER DEFAULT 0",
    "ALTER TABLE dom_users ADD COLUMN IF NOT EXISTS daily_bonus_level INTEGER DEFAULT 1",
    "ALTER TABLE dom_users ADD COLUMN IF NOT EXISTS last_daily_reset DATE DEFAULT CURRENT_DATE",
    "ALTER TABLE dom_users ADD COLUMN IF NOT EXISTS has_2x_multiplier BOOLEAN DEFAULT FALSE"
]

def init_db():
    """
    Creates base tables and applies ALTER patches safely.
    """
    logger.info("🛠️ init_db() — Domino")

    conn = db()
    c = conn.cursor()

    c.execute("""
        CREATE TABLE IF NOT EXISTS dom_daily_bonuses (
            id SERIAL PRIMARY KEY,
            user_id BIGINT,
            amount NUMERIC(10,6) NOT NULL,
            date DATE NOT NULL,
            created_at BIGINT NOT NULL,
            UNIQUE(user_id, date)
        )
    """)

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

    c.execute("""
        CREATE TABLE IF NOT EXISTS dom_users_micro (
            user_id BIGINT PRIMARY KEY,
            pending_micro_usd NUMERIC(18,6) DEFAULT 0
        )
    """)

    # Referral earnings table
    c.execute("""
        CREATE TABLE IF NOT EXISTS dom_referral_earnings (
            id SERIAL PRIMARY KEY,
            inviter_id BIGINT,
            referred_id BIGINT,
            amount NUMERIC(10,6),
            type VARCHAR(20),
            created_at BIGINT
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

    # Telegram pages for verification
    c.execute("""
        CREATE TABLE IF NOT EXISTS telegram_pages (
            id SERIAL PRIMARY KEY,
            page_link TEXT NOT NULL UNIQUE,
            page_name TEXT NOT NULL,
            created_at BIGINT NOT NULL
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS duels_tables (
            table_id TEXT PRIMARY KEY,
            game_type TEXT NOT NULL,
            creator_id TEXT NOT NULL,
            creator_name TEXT,
            opponent_id TEXT,
            opponent_name TEXT,
            bet REAL NOT NULL,
            status TEXT DEFAULT 'waiting',
            winner_id TEXT,
            board_state TEXT,
            current_turn TEXT,
            created_at TEXT,
            finished_at TEXT
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

    
    # Duels PvP Tables
    c.execute("""
        CREATE TABLE IF NOT EXISTS dom_duels_tables (
            id SERIAL PRIMARY KEY,
            game_type TEXT NOT NULL,
            creator_id BIGINT NOT NULL,
            creator_username TEXT,
            bet NUMERIC(10,2) NOT NULL,
            status TEXT DEFAULT 'waiting',
            opponent_id BIGINT,
            opponent_username TEXT,
            game_state JSONB,
            winner_id BIGINT,
            created_at BIGINT NOT NULL,
            started_at BIGINT,
            finished_at BIGINT
        )
    """)

    c.execute("""
        CREATE INDEX IF NOT EXISTS idx_duels_status 
        ON dom_duels_tables(status, game_type)
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
        CREATE TABLE IF NOT EXISTS dom_promocodes (
            code TEXT PRIMARY KEY,
            amount_usd NUMERIC(18,6) NOT NULL,
            max_uses INTEGER DEFAULT NULL,
            used_count INTEGER DEFAULT 0,
            expires_at TIMESTAMP NULL,
            created_at BIGINT NOT NULL,
            created_by BIGINT
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS dom_promocode_claims (
            id SERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL,
            code TEXT NOT NULL,
            amount_usd NUMERIC(18,6) NOT NULL,
            claimed_at BIGINT NOT NULL,
            UNIQUE(user_id, code)
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
            timestamp BIGINT NOT NULL,
            open REAL NOT NULL,
            high REAL NOT NULL,
            low REAL NOT NULL,
            close REAL NOT NULL,
            volume INTEGER DEFAULT 0
        )
    """)

        # Create index for fast timestamp queries (critical for millions of users)
    c.execute("""
        CREATE INDEX IF NOT EXISTS idx_domit_timestamp 
        ON domit_price_history(timestamp DESC)
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

        # === MIGRATION: timestamp TEXT → BIGINT ===
    try:
        c.execute("""
            ALTER TABLE domit_price_history 
            ALTER COLUMN timestamp TYPE BIGINT 
            USING timestamp::BIGINT;
        """)
        conn.commit()
        print("✅ Migration: timestamp column changed to BIGINT")
    except Exception as e:
        print(f"⚠️ Migration skipped (already BIGINT or error): {e}")
        conn.rollback()

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

    c.execute(
        """
        CREATE TABLE IF NOT EXISTS dom_intellect_events (
            id SERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL,
            event_type TEXT NOT NULL,
            value NUMERIC(10,6) NOT NULL,
            meta JSONB,
            created_at BIGINT NOT NULL
        )
        """
    )

    c.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_intellect_events_user_time
        ON dom_intellect_events(user_id, created_at)
        """
    )

    c.execute(
        """
        CREATE TABLE IF NOT EXISTS dom_intellect_daily (
            user_id BIGINT NOT NULL,
            day BIGINT NOT NULL,
            score NUMERIC(10,6) NOT NULL,
            breakdown JSONB,
            PRIMARY KEY(user_id, day)
        )
        """
    )

    conn.commit()
    release_db(conn)
    logger.info("✅ Domino tables ready with applied patches!")

def realtime_emit(event: str, data: dict, room: str = None):
    try:
        # Convert Decimal objects to float for JSON serialization
        def convert_decimals(obj):
            if isinstance(obj, dict):
                return {k: convert_decimals(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [convert_decimals(item) for item in obj]
            elif hasattr(obj, '__class__') and obj.__class__.__name__ == 'Decimal':
                return float(obj)
            else:
                return obj
        
        converted_data = convert_decimals(data)
        
        if room:
            socketio.emit(event, converted_data, room=room)
        else:
            socketio.emit(event, converted_data)
    except Exception:
        logger.exception("Realtime emit failed")

def add_intellect_event(user_id: int, event_type: str, base_value: float = 0.0, meta: dict = None):
    now = int(time.time())
    meta = meta or {}

    weights = {
        "pvp_win": 0.0500,
        "pvp_draw": 0.0100,
        "pvp_played": 0.0050,
        "global_msg": 0.0020,
        "dm_msg": 0.0015,
        "follow_made": 0.0200,
        "fire_given": 0.0010,
        "fire_received": 0.0020,
        "post_created": 0.0030,
        "comment_created": 0.0020,
        "mining_buy": 0.0500,
        "deposit_made": 0.0200,
    }

    categories = {
        "pvp_win": "gameplay",
        "pvp_draw": "gameplay",
        "pvp_played": "gameplay",
        "global_msg": "social",
        "dm_msg": "social",
        "follow_made": "social",
        "fire_given": "social",
        "fire_received": "social",
        "post_created": "social",
        "comment_created": "social",
        "mining_buy": "economy",
        "deposit_made": "economy",
    }

    base = base_value if base_value > 0 else float(weights.get(event_type, 0.0))
    if base <= 0:
        return 0.0

    conn = db(); c = conn.cursor()

    if event_type == "dm_msg":
        recv = int(meta.get("receiver_id") or 0)
        if recv:
            c.execute("SELECT 1 FROM dom_follows WHERE follower=%s AND target=%s", (user_id, recv))
            if not c.fetchone():
                base = 0.0001

    since = now - 48 * 3600
    c.execute(
        """
        SELECT DISTINCT event_type FROM dom_intellect_events
        WHERE user_id=%s AND created_at >= %s
        """,
        (user_id, since)
    )
    seen = [r[0] for r in c.fetchall()]
    seen_cats = set(categories.get(t, "other") for t in seen)
    multiplier = 1.25 if len(seen_cats) >= 2 else 1.0

    day_start = now - (now % 86400)
    c.execute(
        "SELECT COALESCE(SUM(value),0) FROM dom_intellect_events WHERE user_id=%s AND created_at >= %s",
        (user_id, day_start)
    )
    used_today = float(c.fetchone()[0] or 0.0)
    cap = 0.50
    remain = max(0.0, cap - used_today)
    final_value = min(base * multiplier, remain)

    try:
        import json as _json
        c.execute(
            """
            INSERT INTO dom_intellect_events (user_id, event_type, value, meta, created_at)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (user_id, event_type, final_value, _json.dumps(meta), now)
        )
        conn.commit()
    finally:
        release_db(conn)

    return final_value

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

            socketio.emit("global_trim", {
                "keep": limit
            }, room="global")

    except Exception:
        logger.exception("❌ trim_global_chat failed")



def ensure_user(user_id: int, username: Optional[str], inviter_id: Optional[int] = None):
    """
    Регистрирует/обновляет данные пользователей в Domino.
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
        # Update username and potentially set inviter_id if it was empty
        current_inviter_id = row[1]
        if not current_inviter_id and inviter_id and inviter_id != user_id:
            c.execute("UPDATE dom_users SET username=%s, inviter_id=%s WHERE user_id=%s", 
                    (username, inviter_id, user_id))
        else:
            c.execute("UPDATE dom_users SET username=%s WHERE user_id=%s", (username, user_id))

    conn.commit()
    release_db(conn)
    
    # Award signup bonus to inviter if this is a new referral
    if inviter_id and (row is None or (row[1] is None and inviter_id != user_id)):
        award_signup_bonus(inviter_id, user_id)

def award_signup_bonus(inviter_id: int, referred_id: int):
    """
    Начисляет бонус за регистрацию реферала
    """
    try:
        # Get inviter's referral tier
        active_refs = count_active_referrals(inviter_id)
        bonus = 0.25 if active_refs >= 6 else 0.10  # Gold tier gets 0.25, Bronze gets 0.10
        
        conn = db()
        c = conn.cursor()
        
        # Add to inviter's balance
        c.execute("""
            UPDATE dom_users 
            SET balance_usd = COALESCE(balance_usd,0) + %s,
                referral_earnings = COALESCE(referral_earnings,0) + %s
            WHERE user_id = %s
        """, (bonus, bonus, inviter_id))
        
        # Log the referral earning
        now = int(time.time())
        c.execute("""
            INSERT INTO dom_referral_earnings (inviter_id, referred_id, amount, type, created_at)
            VALUES (%s, %s, %s, 'signup', %s)
        """, (inviter_id, referred_id, bonus, now))
        
        conn.commit()
        release_db(conn)
        
        print(f"✅ Referral signup bonus: inviter={inviter_id} got {bonus} TON for referring {referred_id}")
        
    except Exception as e:
        logger.error(f"Error awarding signup bonus: {e}")

def count_active_referrals(user_id: int) -> int:
    """
    Подсчитывает количество активных рефералов (все приглашенные считаются активными)
    """
    conn = db()
    c = conn.cursor()
    c.execute("""
        SELECT COUNT(*)
        FROM dom_users
        WHERE inviter_id=%s
    """, (user_id,))
    count = c.fetchone()[0] or 0
    release_db(conn)
    return count

def get_referral_tier(user_id: int) -> str:
    """
    Проверяет реферальный уровень пользователя
    """
    active_refs = count_active_referrals(user_id)
    return 'gold' if active_refs >= 6 else 'bronze'

def award_deposit_bonus(referred_id: int, deposit_amount: float):
    """
    Начисляет вознаграждение от депозита реферала
    """
    try:
        conn = db()
        c = conn.cursor()
        
        # Get inviter
        c.execute("SELECT inviter_id FROM dom_users WHERE user_id=%s", (referred_id,))
        inviter_row = c.fetchone()
        if not inviter_row or not inviter_row[0]:
            release_db(conn)
            return
            
        inviter_id = inviter_row[0]
        
        # Get commission rate based on tier
        tier = get_referral_tier(inviter_id)
        commission_rate = 0.15 if tier == 'gold' else 0.10  # Gold gets 15%, Bronze gets 10%
        bonus = deposit_amount * commission_rate
        
        # Add to inviter's balance
        c.execute("""
            UPDATE dom_users 
            SET balance_usd = COALESCE(balance_usd,0) + %s,
                referral_earnings = COALESCE(referral_earnings,0) + %s
            WHERE user_id = %s
        """, (bonus, bonus, inviter_id))
        
        # Log the referral earning
        now = int(time.time())
        c.execute("""
            INSERT INTO dom_referral_earnings (inviter_id, referred_id, amount, type, created_at)
            VALUES (%s, %s, %s, 'deposit', %s)
        """, (inviter_id, referred_id, bonus, now))
        
        conn.commit()
        release_db(conn)
        
        print(f"✅ Referral deposit bonus: inviter={inviter_id} got {bonus} TON from {referred_id} deposit")
        
    except Exception as e:
        logger.error(f"Error awarding deposit bonus: {e}")

def award_mining_commission(referred_id: int, mining_amount: float):
    """
    Начисляет вознаграждение за майнинг реферала
    """
    try:
        conn = db()
        c = conn.cursor()
        
        # Get inviter
        c.execute("SELECT inviter_id FROM dom_users WHERE user_id=%s", (referred_id,))
        inviter_row = c.fetchone()
        if not inviter_row or not inviter_row[0]:
            release_db(conn)
            return
            
        inviter_id = inviter_row[0]
        
        # Get commission rate based on tier
        tier = get_referral_tier(inviter_id)
        commission_rate = 0.08 if tier == 'gold' else 0.05  # Gold gets 8%, Bronze gets 5%
        bonus = mining_amount * commission_rate
        
        # Add to inviter's balance
        c.execute("""
            UPDATE dom_users 
            SET balance_usd = COALESCE(balance_usd,0) + %s,
                referral_earnings = COALESCE(referral_earnings,0) + %s
            WHERE user_id = %s
        """, (bonus, bonus, inviter_id))
        
        # Log the referral earning
        now = int(time.time())
        c.execute("""
            INSERT INTO dom_referral_earnings (inviter_id, referred_id, amount, type, created_at)
            VALUES (%s, %s, %s, 'mining', %s)
        """, (inviter_id, referred_id, bonus, now))
        
        conn.commit()
        release_db(conn)
        
        print(f"✅ Referral mining commission: inviter={inviter_id} got {bonus} TON from {referred_id} mining")
        
    except Exception as e:
        logger.error(f"Error awarding mining commission: {e}")

def get_user_stats(user_id: int):
    """
    Мы возвращаем пользователю баланс в долларах США, баланс в тоннах (рассчитанный), реферальный статус и т.д.
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
               COALESCE(total_wins,0),
               COALESCE(daily_tasks_completed,0),
               COALESCE(daily_bonus_level,1),
               COALESCE(last_daily_reset,CURRENT_DATE),
               COALESCE(has_2x_multiplier,FALSE)
        FROM dom_users
        WHERE user_id=%s
    """, (user_id,))

    row = c.fetchone()
    if not row:
        release_db(conn)
        return None

    (username, avatar, avatar_data, balance_usd, total_dep, total_wd, ton_balance, last_rate, total_games, total_wins, daily_tasks_completed, daily_bonus_level, last_daily_reset, has_2x_multiplier) = row

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

    now_ts = int(time.time())
    c.execute(
        """
        SELECT COALESCE(MAX(finished_at), 0)
        FROM dom_duels_tables
        WHERE status='finished' AND (creator_id=%s OR opponent_id=%s)
        """,
        (user_id, user_id)
    )
    last_duel = int(c.fetchone()[0] or 0)
    days_inactive = ((now_ts - last_duel) // 86400) if last_duel else 999

    c.execute(
        """
        SELECT COUNT(*)
        FROM dom_fire_reactions
        WHERE receiver_user_id = %s
        """,
        (user_id,)
    )
    stars_count = int(c.fetchone()[0] or 0)

    win_rate = (float(total_wins) / float(total_games)) if (total_games and total_games > 0) else 0.0
    win_rate_score = win_rate * 4.0

    games_volume_score = min((float(total_games) / 50.0), 1.0) * 2.0

    status_score = float(status_level) * 0.2

    stars_score = min((stars_count ** 0.5), 4.0) * 0.5

    ref_score = min(float(active_refs), 20.0) * 0.1

    team_dep_score = min(float(team_dep) / 500.0, 1.0) * 1.0

    base_score = win_rate_score + games_volume_score + status_score + stars_score + ref_score + team_dep_score

    inactivity_penalty = float(days_inactive) * 0.25
    calculated = max(0.0, base_score - inactivity_penalty)

    c.execute("SELECT COUNT(*) FROM dom_fire_reactions WHERE receiver_user_id=%s", (user_id,))
    fires_received = int(c.fetchone()[0] or 0)
    income_fires = fires_received * 0.10

    c.execute("SELECT COUNT(*) FROM dom_fire_reactions WHERE giver_user_id=%s", (user_id,))
    fires_given = int(c.fetchone()[0] or 0)
    cost_fires = fires_given * 0.20

    c.execute("SELECT COUNT(*) FROM dom_follows WHERE target=%s", (user_id,))
    follows_received = int(c.fetchone()[0] or 0)
    income_follows = follows_received * 2.0

    c.execute("SELECT COUNT(*) FROM dom_follows WHERE follower=%s", (user_id,))
    follows_made = int(c.fetchone()[0] or 0)
    cost_follows = follows_made * 5.0

    c.execute("""
        SELECT COALESCE(SUM(bet),0)
        FROM dom_duels_tables
        WHERE status='finished' AND winner_id=%s
    """, (user_id,))
    sum_wins_bet = float(c.fetchone()[0] or 0.0)
    income_duels = sum_wins_bet * 1.75

    c.execute("SELECT COALESCE(SUM(price_usd),0) FROM dom_user_miners WHERE user_id=%s", (user_id,))
    cost_mining_buys = float(c.fetchone()[0] or 0.0)

    c.execute("SELECT id, reward_per_second_usd, started_at, ends_at FROM dom_user_miners WHERE user_id=%s", (user_id,))
    miners_rows = c.fetchall() or []
    mining_generated = 0.0
    for _id, rps, started, ends in miners_rows:
        try:
            rpsf = float(rps or 0.0)
            start_ts = int(started or 0)
            end_ts = int(ends or 0)
            if start_ts > 0:
                effective_end = min(now_ts, end_ts) if end_ts else now_ts
                duration = max(0, effective_end - start_ts)
                mining_generated += rpsf * float(duration)
        except Exception:
            pass

    c.execute("SELECT COALESCE(SUM(amount),0) FROM dom_burn_ledger WHERE user_id=%s AND reason='pvp_loss_burn'", (user_id,))
    cost_pvp_burn = float(c.fetchone()[0] or 0.0)

    total_earned = income_fires + income_follows + income_duels + mining_generated
    total_spent = cost_fires + cost_follows + cost_mining_buys + cost_pvp_burn
    net_for_progress = max(0.0, total_earned - 0.5 * total_spent)
    target_total = 100000.0
    intellect_score = round(min(10.0, net_for_progress / (target_total / 10.0)), 1)

    # Pending micro-rewards (for sub-cent accruals)
    try:
        c.execute("SELECT COALESCE(pending_micro_usd,0) FROM dom_users_micro WHERE user_id=%s", (user_id,))
        pending_micro = float((c.fetchone() or [0])[0] or 0.0)
    except Exception:
        pending_micro = 0.0

    release_db(conn)

    return {
        "user_id": user_id,
        "username": username,
        "avatar": avatar,
        "avatar_data": avatar_data,
        "balance_usd": float(balance_usd),
        "pending_micro_usd": float(pending_micro),
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
        "daily_tasks_completed": int(daily_tasks_completed),
        "daily_bonus_level": int(daily_bonus_level),
        "last_daily_reset": str(last_daily_reset),
        "has_2x_multiplier": bool(has_2x_multiplier),
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
    - total_amount вычитается из from_user
    - transfers → [(user_id, amount), ...]
    - Сумма сжигания → поступает в административный фонд + в реестр сжигания
    """

    if total_amount <= 0:
        raise ValueError("total_amount must be > 0")

    transfers = transfers or []
    now = int(time.time())

    conn = db()
    c = conn.cursor()

    c.execute("SELECT balance_usd FROM dom_users WHERE user_id=%s", (from_user,))
    row = c.fetchone()
    if not row or float(row[0]) < total_amount:
        release_db(conn)
        raise ValueError("low_balance")

    c.execute("""
        UPDATE dom_users
        SET balance_usd = balance_usd - %s
        WHERE user_id=%s
    """, (total_amount, from_user))

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
    Простой вариант:
    - добавить balance_usd + total_deposit_usd одновременно
    - записать в dom_deposits
    """
    now = int(time.time())
    conn = db()
    c = conn.cursor()
    
    try:
        # Lock user row to prevent race conditions
        c.execute("SELECT balance_usd FROM dom_users WHERE user_id = %s FOR UPDATE", (user_id,))

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
    finally:
        release_db(conn)
    
    # Award referral bonus for deposit
    award_deposit_bonus(user_id, amount)

def redeem_promocode(user_id: int, code: str):
    now = int(time.time())
    code = (code or "").strip()
    if not code:
        return {"ok": False, "error": "empty_code", "message": "Промокод пуст."}

    conn = db(); c = conn.cursor()
    try:
        c.execute("SELECT amount_usd, max_uses, used_count, expires_at FROM dom_promocodes WHERE code=%s FOR UPDATE", (code,))
        row = c.fetchone()
        if not row:
            release_db(conn)
            return {"ok": False, "error": "invalid_code", "message": "Промокод не найден."}

        amount_usd, max_uses, used_count, expires_at = row

        c.execute("SELECT 1 FROM dom_promocode_claims WHERE user_id=%s AND code=%s", (user_id, code))
        if c.fetchone():
            release_db(conn)
            return {"ok": False, "error": "already_redeemed", "message": "Промокод уже активирован."}

        if max_uses is not None and used_count is not None and int(used_count) >= int(max_uses):
            release_db(conn)
            return {"ok": False, "error": "limit_reached", "message": "Лимит использования промокода исчерпан."}

        c.execute("UPDATE dom_users SET balance_usd = COALESCE(balance_usd,0) + %s WHERE user_id=%s RETURNING balance_usd", (amount_usd, user_id))
        new_balance = float(c.fetchone()[0] or 0.0)

        c.execute("""
            INSERT INTO dom_promocode_claims (user_id, code, amount_usd, claimed_at)
            VALUES (%s, %s, %s, %s)
        """, (user_id, code, float(amount_usd), now))

        c.execute("UPDATE dom_promocodes SET used_count = COALESCE(used_count,0) + 1 WHERE code=%s RETURNING used_count, max_uses", (code,))
        upd = c.fetchone()
        new_used = int(upd[0]) if upd and upd[0] is not None else 0
        mu = int(upd[1]) if upd and upd[1] is not None else None

        if mu is not None and new_used >= mu:
            c.execute("DELETE FROM dom_promocodes WHERE code=%s", (code,))

        conn.commit(); release_db(conn)
        return {"ok": True, "amount": float(amount_usd), "new_balance_usd": new_balance}
    except Exception:
        logger.exception("redeem_promocode failed")
        try:
            conn.rollback()
        except Exception:
            pass
        release_db(conn)
        return {"ok": False, "error": "server_error", "message": "Ошибка сервера."}

def get_mining_plans():
    """
    Возвращает все планы майнинга, рассчитанные в долларах США/час.
    В интерфейсе можно отобразить DOMIT как то же число, просто переименованное.
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
    Возвращает всех майнеров, доступных пользователю.
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
    Вычисляет невостребованное вознаграждение для конкретного майнера (на данный момент или до ends_at).
    Возвращает (reward_usd, new_last_claim_at)
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
    Собирает ожидающие вознаграждения всех майнеров пользователя,
    обновляет last_claim_ats и добавляет сумму в balance_usd.
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

    # Award referral commission for mining
    if total_reward > 0:
        award_mining_commission(user_id, total_reward)

    new_balance = float(row[0]) if row else 0.0
    return total_reward, len(miners), new_balance

def create_withdraw_request(user_id: int, amount: float):
    """
    Создает ожидающий запрос на вывод средств + уменьшает balance_usd,
    увеличивает total_withdraw_usd.
    """
    now = int(time.time())
    conn = db()
    c = conn.cursor()

    try:
        c.execute("SELECT balance_usd FROM dom_users WHERE user_id = %s FOR UPDATE", (user_id,))
        row = c.fetchone()
        current_balance = float(row[0]) if row else 0.0

        if current_balance < amount:
            conn.rollback()
            raise ValueError("Insufficient balance")

        c.execute("SELECT wallet_address FROM dom_users WHERE user_id=%s", (user_id,))
        wallet_row = c.fetchone()
        wallet_address = wallet_row[0] if wallet_row and wallet_row[0] else None

        c.execute(
            """
            INSERT INTO dom_withdrawals (user_id, amount_usd, status, created_at, wallet_address)
            VALUES (%s, %s, 'pending', %s, %s)
            """,
            (user_id, amount, now, wallet_address)
        )

        c.execute(
            """
            UPDATE dom_users
            SET balance_usd = balance_usd - %s,
                total_withdraw_usd = COALESCE(total_withdraw_usd,0) + %s
            WHERE user_id=%s
            """,
            (amount, amount, user_id)
        )

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
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
    """Возвращает количество полученных пользователем Domino Stars."""
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

    Текущая ПРОСТАЯ версия:
    - Автоматически записывает депозит как "auto_credited"
    - Баланс и total_deposit_usd увеличиваются немедленно
    """
    data = request.get_json(force=True, silent=True) or {}
    user_id = int(data.get("user_id", 0))
    amount_ton = float(data.get("amount", 0))

    if not user_id or amount_ton <= 0:
        return jsonify({"ok": False, "error": "bad_params"}), 400

    # Deposit is allowed regardless of pending withdraws

    stats = get_user_stats(user_id)
    if not stats:
        return jsonify({"ok": False, "error": "user_not_found"}), 404

    # Get current DOMIT/TON rate from chart (same as withdrawal)
    conn = db()
    c = conn.cursor()
    c.execute("""
        SELECT close FROM domit_price_history 
        ORDER BY timestamp DESC LIMIT 1
    """)
    price_row = c.fetchone()
    release_db(conn)
    
    ton_rate = float(price_row[0]) if price_row else 1.0
    
    # Fallback to TON API if chart data unavailable
    if ton_rate <= 0:
        try:
            ton_rate = fetch_ton_rate() or 0.0
        except Exception:
            ton_rate = 0.0
        if ton_rate <= 0:
            ton_rate = float(DOMIT_PRICE_USD)  # fallback 1 TON ≈ 1 DOMIT (USD)

    amount_usd = round(amount_ton * ton_rate, 6)
    
    # Log collection wallet info for admin
    collection_wallet = "UQCsVJcWwc0lyyOsb6XYo8F1dotNmJKVPmctRQojSm3kSP7g"
    logger.info(f"📥 DEPOSIT: User {user_id} deposited {amount_ton} TON (${amount_usd})")
    logger.info(f"💰 COLLECTION WALLET: {collection_wallet}")
    logger.info(f"⚠️  IMPORTANT: Real TON deposits must be sent to: {collection_wallet}")
    
    apply_deposit(user_id, amount_usd)
    new_stats = get_user_stats(user_id)
    try:
        add_intellect_event(user_id, "deposit_made", meta={"amount_ton": amount_ton, "amount_usd": amount_usd, "collection_wallet": collection_wallet})
    except Exception:
        logger.exception("intellect_event deposit_made failed")

    return jsonify({
        "ok": True,
        "message": "Депозит зарегистрирован ✅ TON добавлен на ваш счет",
        "user": new_stats,
        "ton_rate": ton_rate,
        "credited_domit": amount_usd,
        "collection_wallet": collection_wallet,
        "note": "Для реального пополнения отправляйте TON на указанный кошелек"
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

@app_web.route("/api/daily_bonus", methods=["POST"])
def api_daily_bonus():
    """
    Выдача ежедневного бонуса 0.01 TON
    """
    data = request.get_json(force=True, silent=True) or {}
    user_id = int(data.get("user_id", 0))
    
    if not user_id:
        return jsonify({"ok": False, "error": "bad_params"}), 400
    
    # Проверяем, получал ли пользователь бонус сегодня
    today = datetime.now().strftime("%Y-%m-%d")
    conn = db()
    c = conn.cursor()
    
    c.execute("""
        SELECT id FROM dom_daily_bonuses 
        WHERE user_id = %s AND date = %s
    """, (user_id, today))
    
    if c.fetchone():
        release_db(conn)
        return jsonify({"ok": False, "message": "Бонус уже получен сегодня"}), 200
    
    # Начисляем бонус
    bonus_amount = 0.50  # 0.50 DOMIT = 1 цент при 1 DOMIT = 1 USD
    
    try:
        # Записываем бонус
        c.execute("""
            INSERT INTO dom_daily_bonuses (user_id, amount, date, created_at)
            VALUES (%s, %s, %s, %s)
        """, (user_id, bonus_amount, today, int(time.time())))
        
        # Обновляем баланс
        c.execute("""
            UPDATE dom_users 
            SET balance_usd = balance_usd + %s
            WHERE user_id = %s
        """, (bonus_amount, user_id))
        
        conn.commit()
        release_db(conn)
        
        return jsonify({
            "ok": True, 
            "message": "Ежедневный бонус получен",
            "amount": bonus_amount
        })
        
    except Exception as e:
        conn.rollback()
        release_db(conn)
        logger.error(f"Daily bonus error: {e}")
        return jsonify({"ok": False, "message": "Ошибка сервера"}), 500

@app_web.route("/api/referral_stats", methods=["GET"])
def api_referral_stats():
    """
    Возвращает реферальную статистику
    """
    user_id = request.args.get("user_id", type=int)
    if not user_id:
        return jsonify({"ok": False, "error": "user_id_required"}), 400
    
    try:
        conn = db()
        c = conn.cursor()
        
        # Get referral counts
        c.execute("SELECT COUNT(*) FROM dom_users WHERE inviter_id=%s", (user_id,))
        total_refs = c.fetchone()[0] or 0
        
        c.execute("""
            SELECT COUNT(*)
            FROM dom_users
            WHERE inviter_id=%s
        """, (user_id,))
        active_refs = c.fetchone()[0] or 0
        
        c.execute("""
            SELECT COALESCE(SUM(total_deposit_usd),0)
            FROM dom_users
            WHERE inviter_id=%s
        """, (user_id,))
        team_deposits = float(c.fetchone()[0] or 0.0)
        
        # Get referral earnings
        c.execute("SELECT COALESCE(referral_earnings,0) FROM dom_users WHERE user_id=%s", (user_id,))
        referral_earnings = float(c.fetchone()[0] or 0.0)
        
        # Get tier info
        tier = 'gold' if active_refs >= 6 else 'bronze'
        tier_data = {
            'bronze': {'name': '🥉 Bronze', 'color': '#CD7F32', 'next_needed': 6},
            'gold': {'name': '🥇 Gold', 'color': '#FFD700', 'next_needed': 0}
        }
        
        # Get benefits for current tier
        benefits = {
            'bronze': ['⛏ 5% с майнинга', '💳 10% с депозита', '🎁 0.10 TON за регистрацию'],
            'gold': ['⛏ 8% с майнинга', '💳 15% с депозита', '🎁 0.25 TON за регистрацию']
        }
        
        release_db(conn)
        
        return jsonify({
            "ok": True,
            "total_refs": total_refs,
            "active_refs": active_refs,
            "team_deposits": round(team_deposits, 2),
            "referral_earnings": round(referral_earnings, 6),
            "tier": tier,
            "tier_info": tier_data[tier],
            "benefits": benefits[tier],
            "progress": min(100, (active_refs / 6) * 100) if tier == 'bronze' else 100
        })
        
    except Exception as e:
        logger.error(f"Referral stats error: {e}")
        return jsonify({"ok": False, "message": "Ошибка сервера"}), 500

@app_web.route("/api/referral_earnings", methods=["GET"])
def api_referral_earnings():
    """
    Возвращает историю реферальных доходов
    """
    user_id = request.args.get("user_id", type=int)
    if not user_id:
        return jsonify({"ok": False, "error": "user_id_required"}), 400
    
    try:
        conn = db()
        c = conn.cursor()
        
        c.execute("""
            SELECT amount, type, created_at, referred_id
            FROM dom_referral_earnings
            WHERE inviter_id=%s
            ORDER BY created_at DESC
            LIMIT 50
        """, (user_id,))
        
        earnings = []
        for row in c.fetchall():
            earnings.append({
                "amount": float(row[0]),
                "type": row[1],
                "created_at": row[2],
                "referred_id": row[3]
            })
        
        release_db(conn)
        
        return jsonify({
            "ok": True,
            "earnings": earnings
        })
        
    except Exception as e:
        logger.error(f"Referral earnings error: {e}")
        return jsonify({"ok": False, "message": "Ошибка сервера"}), 500

@app_web.route("/api/withdraw_request", methods=["POST"])
def api_withdraw_request():
    """
    Body: { "user_id": ..., "amount": ... }

    Указанные вами правила:
    - сумма > 0
    - сумма <= баланс в TON
    - не менее 7 приглашенных друзей
    - баланс пользователя должен быть не менее 200 TON
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
            "message": "У вас достаточно средств на счету для снятия наличных?"
        }), 200

    if ref_count < 7:
        return jsonify({
            "ok": False,
            "error": "not_enough_refs",
            "message": "Для вывода средств необходимо пригласить не менее 7 друзей."
        }), 200

    if balance < 2000.0:
        return jsonify({
            "ok": False,
            "error": "not_enough_balance",
            "message": "Для вывода средств необходимо иметь не менее 200 TON на балансе."
        }), 200

    create_withdraw_request(user_id, amount)
    new_stats = get_user_stats(user_id)

    return jsonify({
        "ok": True,
        "message": "Ваш запрос на вывод средств получен ✅ Деньги будут переведены в течение 24 часов.",
        "user": new_stats
    })

@app_web.route("/api/promocode/redeem", methods=["POST"])
def api_promocode_redeem():
    data = request.get_json(force=True, silent=True) or {}
    user_id = int(data.get("user_id", 0))
    code = (data.get("code") or "").strip()
    if not user_id or not code:
        return jsonify({"ok": False, "error": "bad_request", "message": "Неверные данные."}), 400

    res = redeem_promocode(user_id, code)
    if not res.get("ok"):
        return jsonify(res)

    user = get_user_stats(user_id)
    return jsonify({"ok": True, "amount": res.get("amount", 0.0), "user": user})

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

@app_web.route("/postback/lospollos", methods=["GET", "POST"])
def lospollos_postback():
    """
    Endpoint for Los Pollos Global Postback.
    URL to set in Los Pollos: https://domino-play.online/postback/lospollos?user_id={u}&amount={sum}&tx={clickid}
    """
    try:
        # Los Pollos sends data via query parameters
        user_id_raw = request.args.get("user_id") or request.args.get("u")
        amount_raw = request.args.get("amount") or request.args.get("sum") or "0"
        tx_id = request.args.get("tx") or request.args.get("clickid") or f"lp_{int(time.time())}_{random.randint(100,999)}"
        
        print(f"🔔 Los Pollos Postback: user={user_id_raw} amount={amount_raw} tx={tx_id}")

        if not user_id_raw:
            return "MISSING_USER_ID", 400
            
        try:
            user_id = int(user_id_raw)
        except:
            return "BAD_USER_ID", 400
            
        amount = float(amount_raw)
        
        # User gets 50%
        user_reward = amount * 0.5
        
        if amount <= 0:
            return "OK_NO_REWARD", 200

        conn = db()
        c = conn.cursor()

        # Check for duplicate transaction
        c.execute("SELECT 1 FROM conversions WHERE conversion_id=%s", (tx_id,))
        if c.fetchone():
            release_db(conn)
            return "DUPLICATE", 200

        # Credit the user (50%)
        c.execute("UPDATE dom_users SET balance_usd = COALESCE(balance_usd,0) + %s WHERE user_id = %s", (user_reward, user_id))
        
        # Log conversion (logging FULL amount as payout reference)
        now = int(time.time())
        c.execute("""
            INSERT INTO conversions (conversion_id, user_id, offer_id, payout, status, created_at)
            VALUES (%s, %s, 'LOSPOLLOS', %s, 'credited', %s)
        """, (tx_id, user_id, amount, now))
        
        conn.commit()
        release_db(conn)
        
        print(f"✅ Los Pollos Credited: uid={user_id} full=${amount} user_get=${user_reward}")
        
        # Notify user via socket if online (optional)
        try:
            socketio.emit('balance_update', {'user_id': user_id, 'new_balance': user_reward}, room=f"user_{user_id}")
        except:
            pass

        return "OK", 200

    except Exception as e:
        print(f"❌ Los Pollos Error: {e}")
        return "ERROR", 500


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
        
        # Update daily tasks and check for bonuses
        update_daily_tasks_and_bonuses(c, user_id)

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
            
            # Update daily tasks and check for bonuses
            update_daily_tasks_and_bonuses(c, user_id)
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

    Мы ожидаем, что параметр s1 в отслеживающей ссылке MyLead будет равен идентификатору пользователя Telegram.
    Обратная связь отправляется в следующем формате:

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
        
        # Update daily tasks and check for bonuses
        update_daily_tasks_and_bonuses(c, user_id)

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

@app_web.route("/api/monetag/link")
def api_monetag_link():
    uid = request.args.get("uid", type=int)
    task_id = request.args.get("task_id", type=int) or 0
    ip = _client_ip()
    cc = FORCED_GEO or (_ip_country(ip) or "")
    
    # Select SmartLink based on Country
    geo_url = None
    if cc and MONETAG_SMARTLINKS.get(cc):
        geo_url = MONETAG_SMARTLINKS.get(cc)
    
    # Fallback to generic or US if available, but better to match user geo
    url = (geo_url or MONETAG_SMARTLINK) or ""
    
    if not url:
        return jsonify({"ok": False, "error": "not_configured"}), 200
        
    try:
        import urllib.parse
        parsed = urllib.parse.urlparse(url)
        q = urllib.parse.parse_qs(parsed.query)
        q.setdefault("s1", [str(uid or 0)])
        q.setdefault("s2", [str(task_id or 0)])
        new_query = urllib.parse.urlencode({k: v[0] for k, v in q.items()})
        final = urllib.parse.urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, new_query, parsed.fragment))
        return jsonify({"ok": True, "url": final})
    except Exception:
        return jsonify({"ok": False, "error": "bad_url"}), 200

@app_web.route("/api/richads/link")
def api_richads_link():
    uid = request.args.get("uid", type=int)
    task_id = request.args.get("task_id", type=int) or 0
    url = (RICHADS_MAINSTREAM_URL or "").replace("[SITE_ID]", RICHADS_SITE_ID)
    if not url:
        return jsonify({"ok": False, "error": "not_configured"}), 200
    try:
        import urllib.parse
        p = urllib.parse.urlparse(url)
        q = urllib.parse.parse_qs(p.query)
        v_uid = str(uid or 0)
        v_tid = str(task_id or 0)
        q.setdefault("sub1", [v_uid])
        q.setdefault("sub2", [v_tid])
        q.setdefault("subid", [v_uid])
        q.setdefault("aff_sub", [v_uid])
        q.setdefault("aff_sub2", [v_tid])
        new_q = urllib.parse.urlencode({k: v[0] for k, v in q.items()})
        final = urllib.parse.urlunparse((p.scheme, p.netloc, p.path, p.params, new_q, p.fragment))
        return jsonify({"ok": True, "url": final})
    except Exception:
        return jsonify({"ok": False, "error": "bad_url"}), 200

@app_web.route("/api/ad/monetag_reward", methods=["POST"])
def api_ad_monetag_reward():
    data = request.get_json(force=True, silent=True) or {}
    uid = int(data.get("uid") or 0)
    if uid <= 0:
        return jsonify({"ok": False, "error": "bad_uid"}), 200

    ip = _client_ip()
    country = _ip_country(ip) or "UNKNOWN"

    tier1 = ["US", "GB", "CA", "AU", "DE", "CH", "NO", "SE", "DK", "NZ"]
    tier2 = ["FR", "IT", "ES", "NL", "BE", "AT", "FI", "IE", "SG", "JP", "KR", "AE", "RU"]

    if country in tier1:
        reward = 0.009
    elif country in tier2:
        reward = 0.007
    else:
        reward = 0.005

    conn = db(); c = conn.cursor()
    try:
        c.execute(
            """
            INSERT INTO dom_users_micro (user_id, pending_micro_usd)
            VALUES (%s, %s)
            ON CONFLICT (user_id)
            DO UPDATE SET pending_micro_usd = COALESCE(dom_users_micro.pending_micro_usd, 0) + EXCLUDED.pending_micro_usd
            RETURNING pending_micro_usd
            """,
            (uid, reward)
        )
        row = c.fetchone()
        
        # Update daily tasks count for Monetag task completion
        update_daily_tasks_and_bonuses(c, uid)
        
        conn.commit()
        pending = float(row[0]) if row else 0.0
    except Exception:
        try: conn.rollback()
        except Exception: pass
        pending = 0.0
    finally:
        release_db(conn)

    print(f"💰 Monetag Reward (pending): uid={uid} ip={ip} country={country} reward={reward}")
    return jsonify({
        "ok": True,
        "reward": reward,
        "credited_usd": 0.0,
        "pending_micro": pending,
        "country": country,
        "is_tier1": (country in tier1)
    }), 200

@app_web.route("/api/ad/richads_reward", methods=["POST"])
def api_ad_richads_reward():
    data = request.get_json(force=True, silent=True) or {}
    uid = int(data.get("uid") or 0)
    if uid <= 0:
        return jsonify({"ok": False, "error": "bad_uid"}), 200
    ip = _client_ip()
    country = _ip_country(ip) or "UNKNOWN"
    tier1 = ["US", "GB", "CA", "AU", "DE", "CH", "NO", "SE", "DK", "NZ"]
    tier2 = ["FR", "IT", "ES", "NL", "BE", "AT", "FI", "IE", "SG", "JP", "KR", "AE", "RU"]
    if country in tier1:
        reward = 0.005
    elif country in tier2:
        reward = 0.002
    else:
        reward = 0.001
    conn = db(); c = conn.cursor()
    try:
        c.execute(
            """
            INSERT INTO dom_users_micro (user_id, pending_micro_usd)
            VALUES (%s, %s)
            ON CONFLICT (user_id)
            DO UPDATE SET pending_micro_usd = COALESCE(dom_users_micro.pending_micro_usd, 0) + EXCLUDED.pending_micro_usd
            RETURNING pending_micro_usd
            """,
            (uid, reward)
        )
        row = c.fetchone()
        
        # Update daily tasks count for RichAds task completion
        update_daily_tasks_and_bonuses(c, uid)
        
        conn.commit()
        pending = float(row[0]) if row else 0.0
    except Exception:
        try: conn.rollback()
        except Exception: pass
        pending = 0.0
    finally:
        release_db(conn)
    print(f"💰 RichAds Reward (pending): uid={uid} ip={ip} country={country} reward={reward}")
    return jsonify({
        "ok": True,
        "reward": reward,
        "credited_usd": 0.0,
        "pending_micro": pending,
        "country": country,
        "is_tier1": (country in tier1)
    }), 200

# ================= RICHADS POSTBACK (CONFIRMED CONVERSIONS) =================
@app_web.route("/api/postback/richads", methods=["GET", "POST"])
def api_postback_richads():
    try:
        data = request.args if request.method == "GET" else request.form

        # Flexible field mapping
        status = str(data.get("status") or "1").strip()  # '1' credit, '2' chargeback
        txid = data.get("tx") or data.get("tid") or data.get("clickid") or data.get("transaction_id") or ""

        # Revenue amount from RichAds/tracker
        amount_str = (
            data.get("revenue") or data.get("amount") or data.get("sum") or data.get("payout") or data.get("amount_usd") or data.get("profit") or ""
        )

        # User identification via subIDs
        uid_str = (
            data.get("sub1") or data.get("subid") or data.get("aff_sub") or data.get("u1") or data.get("uid") or ""
        )

        if not amount_str or not uid_str:
            return jsonify({"ok": False, "error": "missing_params"}), 400

        uid = int(float(uid_str))  # tolerate string/float values
        amount = float(amount_str)
        credited = amount * 0.5

        conn = db(); c = conn.cursor()

        # De-duplication by status marker
        status_key = f"richads_{txid or int(time.time())}"
        c.execute("SELECT 1 FROM dom_deposits WHERE status = %s AND user_id = %s", (status_key, uid))
        if c.fetchone():
            release_db(conn)
            return "OK", 200

        now = int(time.time())
        if status == "2":  # chargeback
            c.execute(
                """
                INSERT INTO dom_deposits (user_id, amount_usd, status, created_at)
                VALUES (%s, %s, %s, %s)
                """,
                (uid, -credited, f"richads_cb_{txid or now}", now)
            )
            c.execute(
                """
                UPDATE dom_users
                   SET balance_usd = GREATEST(COALESCE(balance_usd, 0) - %s, 0),
                       total_deposit_usd = GREATEST(COALESCE(total_deposit_usd, 0) - %s, 0)
                 WHERE user_id = %s
                """,
                (credited, credited, uid)
            )
        else:  # credit
            c.execute(
                """
                INSERT INTO dom_deposits (user_id, amount_usd, status, created_at)
                VALUES (%s, %s, %s, %s)
                """,
                (uid, credited, status_key, now)
            )
            c.execute(
                """
                UPDATE dom_users
                   SET balance_usd = COALESCE(balance_usd, 0) + %s,
                       total_deposit_usd = COALESCE(total_deposit_usd, 0) + %s
                 WHERE user_id = %s
                """,
                (credited, credited, uid)
            )

            # Optional: decrease pending micro by credited amount (cap at 0)
            try:
                c.execute(
                    """
                    UPDATE dom_users_micro
                       SET pending_micro_usd = GREATEST(COALESCE(pending_micro_usd, 0) - %s, 0)
                     WHERE user_id = %s
                    """,
                    (credited, uid)
                )
            except Exception:
                pass

        conn.commit(); release_db(conn)

        try:
            realtime_emit("balance_update", {
                "user_id": uid,
                "amount": credited if status != "2" else -credited,
                "source": "richads"
            }, room=f"user_{uid}")
        except Exception as e:
            logger.error(f"Socket emit error: {e}")

        return "OK", 200
    except Exception as e:
        logger.exception("RichAds Postback Error")
        return "Error", 500

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

    try:
        add_intellect_event(user_id, "mining_buy", meta={"plan_id": pid, "tier": tier, "price": price_usd})
    except Exception:
        logger.exception("intellect_event mining_buy failed")

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

    c.execute("SELECT reward FROM dom_tasks WHERE id=%s", (task_id,))
    row = c.fetchone()
    reward = float(row[0] or 0) if row else 0.0

    c.execute("""
        CREATE TABLE IF NOT EXISTS dom_task_awards (
            user_id BIGINT,
            task_id BIGINT,
            awarded_at BIGINT,
            PRIMARY KEY(user_id, task_id)
        )
    """
    )

    c.execute("""
        SELECT 1 FROM dom_task_completions
        WHERE user_id=%s AND task_id=%s
    """, (user_id, task_id))
    already_completed = bool(c.fetchone())
    if not already_completed:
        c.execute("""
            INSERT INTO dom_task_completions (user_id, task_id, completed_at)
            VALUES (%s, %s, %s)
        """, (user_id, task_id, now))
        
        # Always update daily tasks count when a task is completed, regardless of reward
        update_daily_tasks_and_bonuses(c, user_id)

    awarded_now = False
    if reward > 0:
        c.execute("SELECT 1 FROM dom_task_awards WHERE user_id=%s AND task_id=%s", (user_id, task_id))
        already_awarded = bool(c.fetchone())
        if not already_awarded:
            # Apply 2x multiplier if user has it
            final_reward = reward
            c.execute("SELECT has_2x_multiplier FROM dom_users WHERE user_id=%s", (user_id,))
            has_2x = c.fetchone()
            if has_2x and has_2x[0]:
                final_reward = reward * 2
            
            c.execute("UPDATE dom_users SET balance_usd = COALESCE(balance_usd,0) + %s WHERE user_id=%s", (final_reward, user_id))
            c.execute("INSERT INTO dom_task_awards (user_id, task_id, awarded_at) VALUES (%s, %s, %s)", (user_id, task_id, now))
            awarded_now = True

    try:
        print(f"🟢 task_complete uid={user_id} task_id={task_id} reward={reward}")
    except Exception:
        pass
    conn.commit()
    release_db(conn)
    return jsonify({"ok": True, "reward": reward, "already_completed": already_completed, "awarded": awarded_now})

import requests
import time

TON_RATE_URL = "https://tonapi.io/v2/rates?tokens=TON&currencies=USD"

from flask import request

def fetch_ton_rate():
    try:
        print("🌐 Calling tonapi.io ...")
        # Added sleep to avoid immediate retry spam in logs if called frequently
        r = requests.get(TON_RATE_URL, timeout=10)
        
        if r.status_code == 429:
             print("⚠️ TON API rate limit reached (429). Skipping update.")
             return None

        print("📦 API status:", r.status_code)
        # print("📦 API raw body:", r.text) # Reduced log spam

        data = r.json()
        if "rates" not in data or "TON" not in data["rates"]:
             print("⚠️ Unexpected TON API response format.")
             return None
             
        rate = float(data["rates"]["TON"]["prices"]["USD"])
        print("📊 Parsed rate:", rate)
        return rate

    except Exception as e:
        print("🔥 ERROR in fetch_ton_rate():", e)
        return None

def exeio_shorten(target_url: str) -> Optional[str]:
    if not EXEIO_API_KEY:
        print("❌ EXEIO_API_KEY is missing! Cannot shorten link.")
        return None
    try:
        import urllib.parse
        # Ensure we use the correct API URL for exe.io
        api_url = EXEIO_API_URL
        if "exe.io" in api_url and "api" not in api_url:
             api_url = api_url.rstrip("/") + "/api"
             
        req = f"{api_url}?api={EXEIO_API_KEY}&url={urllib.parse.quote_plus(target_url)}&format=json"
        print(f"🌐 Requesting exe.io: {req.replace(EXEIO_API_KEY, 'HIDDEN_KEY')}")
        
        resp = requests.get(req, timeout=15)
        print(f"EXEIO shorten status={resp.status_code} body={resp.text[:300]}")
        
        if resp.status_code != 200:
            print(f"❌ exe.io returned non-200 status: {resp.status_code}")
            return None

        short = None
        try:
            js = resp.json()
            if isinstance(js, dict):
                # Check for error in JSON
                if js.get("status") == "error":
                    print(f"❌ exe.io API Error: {js.get('message')}")
                    return None
                    
                for k in ("shortenedUrl", "shortened_url", "shortenUrl", "result_url", "short", "short_url", "url"):
                    v = js.get(k)
                    if v:
                        short = str(v)
                        break
        except Exception as e:
            print(f"❌ JSON parse error: {e}")
            pass
            
        if not short:
            # Fallback for plain text response
            txt = (resp.text or "").strip()
            if txt.startswith("http"):
                short = txt
                
        return short
    except Exception as e:
        print(f"🔥 exeio_shorten exception: {e}")
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

async def check_webapp_access(user_id: int) -> bool:
    """Check if user has access to webapp (follows all required pages)"""
    if not pyrogram_client:
        return True  # Allow access if Pyrogram not available
    
    try:
        has_access, _ = await check_user_page_membership(user_id)
        return has_access
    except Exception as e:
        logger.error(f"Error checking webapp access: {e}")
        return True  # Allow access if verification fails

async def send_webapp_access_denied_with_pages(user_id: int, context: ContextTypes.DEFAULT_TYPE, missing_pages: list):
    """Send message when user doesn't have access to webapp with missing pages info"""
    try:
        if not missing_pages:
            await send_webapp_access_denied(user_id, context)
            return
            
        # Create message with missing pages
        pages_text = "\n".join([f"📄 {page['name']}: {page['link']}" for page in missing_pages])
        
        message = f"""❌ **Доступ ограничен**

Вы должны подписаться на следующие страницы:

{pages_text}

📱 **Инструкции:**
1. Перейдите по каждой ссылке
2. Подпишитесь на страницу (Join/Subscribe)
3. Вернитесь и нажмите /start

После подписки вы сможете использовать приложение DOMINO 🎲"""
        
        await context.bot.send_message(
            chat_id=user_id,
            text=message,
            parse_mode='Markdown',
            disable_web_page_preview=True
        )
    except Exception as e:
        logger.error(f"Error sending webapp access denied with pages: {e}")

async def send_webapp_access_denied(user_id: int, context: ContextTypes.DEFAULT_TYPE):
    """Send message when user doesn't have access to webapp"""
    try:
        conn = db()
        c = conn.cursor()
        c.execute("SELECT page_link, page_name FROM telegram_pages ORDER BY id")
        pages = c.fetchall()
        release_db(conn)
        
        if pages:
            message = "🚫 **Доступ к WebApp запрещен**\n\n"
            message += "Для открытия приложения необходимо подписаться на следующие страницы:\n\n"
            
            for page_link, page_name in pages:
                message += f"📄 [{page_name}]({page_link})\n"
            
            message += "\nПосле подписки попробуйте снова: /start"
            
            await context.bot.send_message(
                chat_id=user_id,
                text=message,
                parse_mode='Markdown',
                disable_web_page_preview=True
            )
    except Exception as e:
        logger.error(f"Error sending webapp access denied: {e}")

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

    # TEMPORARILY DISABLED: Check if user wants to open webapp with verification
    # This allows instant bot access without page verification
    # To re-enable: uncomment the block below
    """
    if "&verify=1" in text:
        # Check page membership before sending webapp button
        if not pyrogram_client:
            print("⚠️ Page verification disabled - Pyrogram client not available")
            has_access = True
            missing_pages = []
        else:
            has_access, missing_pages = await check_user_page_membership(user.id)
        
        if not has_access:
            # Send message with missing pages info
            await send_webapp_access_denied_with_pages(user.id, context, missing_pages)
            return
    """
    
    # Send welcome message with image instead of button
    welcome_text = """
       🎁 МЕГА-РОЗЫГРЫШ: 499 TON 🎁 Победители будут определены на основе:

        Вашей личной активности в игре.

        Активности ваших рефералов.

        📅 Итоги конкурса: 20.02.2026 в 20:00.

        Чем больше играете вы и ваша команда, тем выше шанс забрать главный приз! Не упусти свой момент!

        👉 Чтобы начать, нажми на кнопку «DOOMINO» рядом с чатом.
        """

    try:
        with open('logo.png', 'rb') as photo:
            # Create inline keyboard with DOOMINO button
            keyboard = [[InlineKeyboardButton("DOOMINO", web_app=WebAppInfo(url="https://domino-play.online/app"))]]
            reply_markup = InlineKeyboardMarkup(keyboard)
            
            await context.bot.send_photo(
                chat_id=user.id,
                photo=photo,
                caption=welcome_text,
                reply_markup=reply_markup
            )
    except Exception as e:
        print(f"Error sending photo: {e}")
        # Fallback to text message if photo fails
        await context.bot.send_message(
            chat_id=user.id,
            text=welcome_text
        )

    try:
        if update.message:
            await context.bot.pin_chat_message(chat_id=user.id, message_id=update.message.message_id)
    except Exception:
        pass

# ═══════════════════════════════════════════════════════════
# DOMIT AUTO PRICE UPDATER
# ═══════════════════════════════════════════════════════════

scheduler = BackgroundScheduler()
from decimal import Decimal

def create_new_candle():
    """Создавайте новую 1-минутную свечу (каждую минуту)."""
    conn = None
    cur = None
    try:
        # Retry logic for connection
        for attempt in range(3):
            try:
                conn = db()
                if not conn.closed:
                    break
                release_db(conn)
                conn = None
            except Exception as e:
                logger.warning(f"Connection attempt {attempt+1} failed: {e}")
                if attempt == 2:
                    raise
        
        if conn is None or conn.closed:
            logger.error("Failed to get valid connection after 3 attempts")
            return
            
        cur = conn.cursor()
        
        cur.execute("SELECT min_price, max_price FROM domit_config WHERE id = 1")
        row = cur.fetchone()
        if not row:
            print("⚠️ domit_config non")
            cur.close()
            release_db(conn)
            return
        
        min_price, max_price = float(row[0]), float(row[1])
        
        cur.execute("""
            SELECT close FROM domit_price_history 
            ORDER BY timestamp DESC LIMIT 1
        """)
        last_row = cur.fetchone()
        last_close = float(last_row[0]) if last_row else (min_price + max_price) / 2
        
        open_price = last_close
        close_price = last_close  
        high_price = open_price
        low_price = open_price
        volume = 0
        
        now = int(datetime.now().timestamp())
        cur.execute("""
            INSERT INTO domit_price_history (timestamp, open, high, low, close, volume)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (now, open_price, high_price, low_price, close_price, volume))
        
        conn.commit()
        logger.info(f"🕐 New candle created at {now}, open={open_price:.4f}")
        
        try:
            socketio.emit('new_candle', {
                'time': now,
                'open': open_price,
                'high': high_price,
                'low': low_price,
                'close': close_price
            }, room='chart_viewers')
        except Exception as e:
            logger.warning(f"Socket emit failed: {e}")
        
    except Exception as e:
        logger.error(f"❌ Error creating candle: {e}")
    finally:
        if cur:
            try:
                cur.close()
            except Exception as e:
                logger.warning(f"Cursor close warning: {e}")
        if conn:
            try:
                release_db(conn)
            except Exception as e:
                logger.warning(f"Connection release warning: {e}")


def update_current_candle():
    """Обновлять текущую свечу (каждые 5 секунд)"""
    conn = None
    cur = None
    try:
        # Retry logic for connection
        for attempt in range(3):
            try:
                conn = db()
                if not conn.closed:
                    break
                release_db(conn)
                conn = None
            except Exception as e:
                logger.warning(f"Connection attempt {attempt+1} failed: {e}")
                if attempt == 2:
                    raise
        
        if conn is None or conn.closed:
            logger.error("Failed to get valid connection after 3 attempts")
            return
            
        cur = conn.cursor()
        
        cur.execute("SELECT min_price, max_price FROM domit_config WHERE id = 1")
        row = cur.fetchone()
        if not row:
            cur.close()
            release_db(conn)
            return
        
        min_price, max_price = float(row[0]), float(row[1])
        
        cur.execute("""
            SELECT timestamp, open, high, low, close FROM domit_price_history 
            ORDER BY timestamp DESC LIMIT 1
        """)
        candle = cur.fetchone()
        if not candle:
            cur.close()
            release_db(conn)
            return
        
        timestamp, open_price, old_high, old_low, old_close = candle
        open_price = float(open_price)
        old_high = float(old_high)
        old_low = float(old_low)
        old_close = float(old_close)
        
        volatility = 0.02
        price_change = random.uniform(-volatility, volatility)
        new_close = old_close * (1 + price_change)
        new_close = max(min_price, min(max_price, new_close))
        
        new_high = max(old_high, new_close)
        new_low = min(old_low, new_close)
        
        cur.execute("""
            UPDATE domit_price_history 
            SET high = %s, low = %s, close = %s, volume = volume + %s
            WHERE timestamp = %s
                """, (new_high, new_low, new_close, random.randint(100, 500), timestamp))

        conn.commit()
        logger.info(f"📊 DOMIT updated: {new_close:.4f} TON (H:{new_high:.4f} L:{new_low:.4f})")

        try:
            socketio.emit('domit_update', {
                'time': timestamp,
                'open': open_price,
                'high': new_high,
                'low': new_low,
                'close': new_close
            }, room='chart_viewers')
        except Exception as e:
            logger.warning(f"Socket emit failed: {e}")  
        
    except Exception as e:
        logger.error(f"❌ Error updating candle: {e}")
    finally:
        if cur:
            try:
                cur.close()
            except Exception as e:
                logger.warning(f"Cursor close warning: {e}")
        if conn:
            try:
                release_db(conn)
            except Exception as e:
                logger.warning(f"Connection release warning: {e}")


# exe.io stats polling
def exeio_poll_stats():
    if not EXEIO_API_KEY:
        return
    try:
        pass
    except Exception:
        pass

# Scheduler jobs
scheduler.add_job(
    create_new_candle,
    CronTrigger(minute='*'),  
    id='domit_candle_create',
    replace_existing=True
)

scheduler.add_job(
    update_current_candle,
    'interval',
    seconds=5,  
    id='domit_candle_update',
    replace_existing=True
)

scheduler.add_job(
    exeio_poll_stats,
    'interval',
    minutes=5,
    id='exeio_poll',
    replace_existing=True
)

def auto_transfer_pending():
    """
    Automatically transfer pending micro balance to main balance when it reaches 0.001000
    """
    try:
        conn = db()
        c = conn.cursor()
        
        # Find users with pending balance >= 0.001000
        c.execute("""
            SELECT user_id, pending_micro_usd 
            FROM dom_users_micro 
            WHERE pending_micro_usd >= 0.001000
        """)
        
        users_to_transfer = c.fetchall()
        
        for user_id, pending_amount in users_to_transfer:
            # Transfer to main balance
            c.execute("""
                UPDATE dom_users
                   SET balance_usd = COALESCE(balance_usd, 0) + %s,
                       total_deposit_usd = COALESCE(total_deposit_usd, 0) + %s
                 WHERE user_id = %s
            """, (pending_amount, pending_amount, user_id))
            
            # Reset pending balance
            c.execute("""
                UPDATE dom_users_micro
                   SET pending_micro_usd = 0
                 WHERE user_id = %s
            """, (user_id,))
            
            # Send real-time update
            try:
                realtime_emit("balance_update", {
                    "user_id": user_id,
                    "amount": pending_amount,
                    "source": "auto_pending_transfer"
                }, room=f"user_{user_id}")
            except Exception:
                pass
            
            print(f"✅ Auto transfer: uid={user_id} amount={pending_amount:.6f} USD")
        
        conn.commit()
        release_db(conn)
        
        if users_to_transfer:
            print(f"🔄 Auto transferred {len(users_to_transfer)} users pending balances")
            
    except Exception as e:
        print(f"❌ Auto transfer error: {e}")
        try:
            conn.rollback()
            release_db(conn)
        except Exception:
            pass

def reset_daily_bonuses():
    """Reset daily bonus counters at midnight"""
    from datetime import date
    today = date.today()
    
    conn = db()
    c = conn.cursor()
    
    try:
        c.execute("""
            UPDATE dom_users 
            SET daily_tasks_completed = 0, 
                daily_bonus_level = 1, 
                last_daily_reset = %s,
                has_2x_multiplier = FALSE
            WHERE last_daily_reset != %s
        """, (today, today))
        
        conn.commit()
        logger.info(f"🔄 Daily bonuses reset for {today}")
    except Exception as e:
        logger.error(f"Error resetting daily bonuses: {e}")
        conn.rollback()
    finally:
        release_db(conn)

scheduler.add_job(
    auto_transfer_pending,
    'interval',
    seconds=10,  # Check every 10 seconds
    id='auto_pending_transfer',
    replace_existing=True
)

# Add daily reset job at midnight
scheduler.add_job(
    reset_daily_bonuses,
    CronTrigger(hour=0, minute=0),
    id='daily_bonus_reset',
    replace_existing=True
)

async def block_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    Чтобы чат оставался чистым, мы удаляем все текстовые сообщения.
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
        await update.message.reply_text("Мы не можем найти вашу информацию в базе данных.")
        return

    msg = (
        f"💳 Ваша ситуация\n\n"
        f"Balance: {stats['balance_usd']:.2f}$\n"
        f"Total deposit: {stats['total_deposit_usd']:.2f}$\n"
        f"Total withdraw: {stats['total_withdraw_usd']:.2f}$\n\n"
        f"Referrals: {stats['ref_count']} (active: {stats['active_refs']})\n"
        f"Team deposit: {stats['team_deposit_usd']:.2f}$"
    )
    await update.message.reply_text(msg)

async def burn_stats(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_user.id not in ADMIN_IDS:
        await update.message.reply_text("❌ Вы не являетесь администратором.")
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
        f"🔥 Burn ситуация\n\n"
        f"💰 Общий burned: {total_burned:.2f} USD\n"
        f"📅 Сегодня: {today_burn:.2f} USD\n"
        f"🌟 Domino Stars: {total_fires}\n"
        f"⏰ Обновлять: {last_update_str}"
    )    



async def burn_reward(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_user.id not in ADMIN_IDS:
        await update.message.reply_text("❌ Вы не являетесь администратором")
        return

    if len(context.args) != 2:
        await update.message.reply_text("Использование՝ /burn_reward user_id amount")
        return

    target = int(context.args[0])
    amount = float(context.args[1])

    conn = db(); c = conn.cursor()

    c.execute("SELECT balance FROM dom_admin_fund WHERE id=1")
    fund = float(c.fetchone()[0])

    if fund < amount:
        release_db(conn)
        await update.message.reply_text("❌ В Burn фонде недостаточно средств.")
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
        f"🎁 {amount} TON передано пользователю {target}-из фонда Burn"
    )

async def reset_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_user.id not in ADMIN_IDS:
        await update.message.reply_text("❌ Только для администраторов")
        return

    await update.message.reply_text("🔄 Начинаю полный RESET…")

    conn = None
    try:
        conn = db(); c = conn.cursor()

        # Zero user balances (columns may vary between deployments)
        c.execute("UPDATE dom_users SET balance_usd=0, total_deposit_usd=0, total_withdraw_usd=0")
        try:
            c.execute("SELECT 1 FROM information_schema.columns WHERE table_name='dom_users' AND column_name='pending_micro_usd'")
            if c.fetchone():
                c.execute("UPDATE dom_users SET pending_micro_usd=0")
        except Exception:
            pass

        # Burn account reset
        c.execute("UPDATE dom_burn_account SET total_burned=0, last_updated=%s WHERE id=1", (int(time.time()),))
        c.execute("TRUNCATE TABLE dom_burn_ledger RESTART IDENTITY")

        # Portal data
        c.execute("TRUNCATE TABLE dom_posts RESTART IDENTITY")
        c.execute("TRUNCATE TABLE dom_comments RESTART IDENTITY")
        c.execute("TRUNCATE TABLE dom_post_likes RESTART IDENTITY")
        c.execute("TRUNCATE TABLE dom_comment_likes RESTART IDENTITY")

        # Social/chat
        c.execute("TRUNCATE TABLE dom_global_chat RESTART IDENTITY")
        c.execute("TRUNCATE TABLE dom_messages RESTART IDENTITY")
        c.execute("TRUNCATE TABLE dom_message_reactions RESTART IDENTITY")
        c.execute("TRUNCATE TABLE dom_fire_reactions RESTART IDENTITY")
        c.execute("TRUNCATE TABLE dom_dm_last_seen RESTART IDENTITY")

        # Tasks/conversions
        c.execute("TRUNCATE TABLE dom_task_attempts RESTART IDENTITY")
        c.execute("TRUNCATE TABLE dom_task_completions RESTART IDENTITY")
        c.execute("TRUNCATE TABLE dom_task_awards RESTART IDENTITY")
        c.execute("TRUNCATE TABLE conversions RESTART IDENTITY")
        c.execute("TRUNCATE TABLE dom_click_events RESTART IDENTITY")

        # Duels
        c.execute("TRUNCATE TABLE dom_duels_tables RESTART IDENTITY")

        # Mining user activations
        c.execute("TRUNCATE TABLE dom_user_miners RESTART IDENTITY")

        # Financial history
        c.execute("TRUNCATE TABLE dom_deposits RESTART IDENTITY")
        c.execute("TRUNCATE TABLE dom_withdrawals RESTART IDENTITY")

        # Social follows
        c.execute("TRUNCATE TABLE dom_follows RESTART IDENTITY")

        conn.commit()
        release_db(conn)
        await update.message.reply_text("✅ RESET завершён. Всё начато с нуля.")
    except Exception as e:
        try:
            if conn:
                conn.rollback()
                release_db(conn)
        except Exception:
            pass
        await update.message.reply_text(f"❌ Ошибка при RESET: {e}")

async def audience_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_user.id not in ADMIN_IDS:
        await update.message.reply_text("❌ Только для администраторов")
        return

    now = int(time.time())
    day_ago = now - 86400
    week_ago = now - 7*86400

    conn = db(); c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM dom_users")
    total_users = int(c.fetchone()[0] or 0)

    c.execute("SELECT COUNT(*) FROM dom_global_chat_online WHERE last_ping >= %s", (now - 15,))
    online_now = int(c.fetchone()[0] or 0)

    try:
        c.execute("SELECT COUNT(DISTINCT user_id) FROM dom_click_events WHERE created_at >= %s", (day_ago,))
        active_24h = int(c.fetchone()[0] or 0)
    except Exception:
        active_24h = 0

    try:
        c.execute("SELECT COUNT(DISTINCT user_id) FROM dom_click_events WHERE created_at >= %s", (week_ago,))
        active_7d = int(c.fetchone()[0] or 0)
    except Exception:
        active_7d = 0

    release_db(conn)

    msg = (
        "📈 Audience\n\n"
        f"Всего пользователей: {total_users}\n"
        f"Онлайн сейчас: {online_now}\n"
        f"Активны за 24ч: {active_24h}\n"
        f"Активны за 7д: {active_7d}"
    )
    await update.message.reply_text(msg)

async def init_domit_data(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Admin command: Generate initial 24h DOMIT price data"""
    user_id = update.effective_user.id
    if user_id not in ADMIN_IDS:
        await update.message.reply_text("❌ Вы не являетесь администратором.")
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
            
            c.execute(
                """
                INSERT INTO domit_price_history (timestamp, open, high, low, close, volume)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    int(time.timestamp()),
                    round(open_price, 4),
                    round(high_price, 4),
                    round(low_price, 4),
                    round(close_price, 4),
                    random.randint(1000, 5000),
                ),
            )
            
            current_price = close_price
        
        conn_obj.commit()
        release_db(conn_obj)
        
        await update.message.reply_text("✅ Созданы данные графика TON.!\n📊 288 candles (24 час)")
    
    except Exception as e:
        logger.error(f"❌ Error in init_domit_data: {e}")
        await update.message.reply_text(f"❌ Неправильный: {e}")


async def set_domit_range(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Admin: /set_domit_range 0.50 1.50"""
    user_id = update.effective_user.id
    if user_id not in ADMIN_IDS:
        await update.message.reply_text("❌ Вы не являетесь администратором.")
        return
    
    try:
        if len(context.args) < 2:
            await update.message.reply_text("Использование՝ /set_domit_range 0.50 1.50")
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
        await update.message.reply_text(f"❌ Неправильный: {e}")

async def admin_add(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if user_id not in ADMIN_IDS:
        await update.message.reply_text("❌ Вы не являетесь администратором.։")
        return

    if len(context.args) < 2:
        await update.message.reply_text("Использование՝ /admin_add user_id amount")
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

    await update.message.reply_text(f"✔ {amount}TON пользователь добавил {target} в счет։")

async def add_promo_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    admin_id = update.effective_user.id
    if admin_id not in ADMIN_IDS:
        await update.message.reply_text("❌ Только для администраторов")
        return
    txt = (update.message.text or "").strip()
    m = re.findall(r'"([^"]+)"', txt)
    if len(m) < 3:
        await update.message.reply_text("Использование: /add_promo \"КОД\" \"СУММА_TON\" \"MAX_USES\"")
        return
    code = m[0].strip()
    try:
        amount = float(m[1].strip())
    except Exception:
        await update.message.reply_text("Сумма должна быть числом")
        return
    try:
        max_uses = int(float(m[2].strip()))
    except Exception:
        await update.message.reply_text("MAX_USES должно быть числом")
        return

    now = int(time.time())
    conn = db(); c = conn.cursor()
    try:
        c.execute("SELECT 1 FROM dom_promocodes WHERE code=%s", (code,))
        exists = c.fetchone()
        if exists:
            c.execute("UPDATE dom_promocodes SET amount_usd=%s, max_uses=%s, created_by=%s WHERE code=%s", (amount, max_uses, admin_id, code))
        else:
            c.execute("""
                INSERT INTO dom_promocodes (code, amount_usd, max_uses, created_at, created_by)
                VALUES (%s, %s, %s, %s, %s)
            """, (code, amount, max_uses, now, admin_id))
        conn.commit()
        await update.message.reply_text(f"✅ Промокод добавлен: {code} → {amount} TON, MAX={max_uses}")
    except Exception as e:
        logger.exception("add_promo_cmd failed")
        try:
            conn.rollback()
        except Exception:
            pass
        await update.message.reply_text("❌ Ошибка сервера")
    finally:
        release_db(conn)

async def del_promo_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    admin_id = update.effective_user.id
    if admin_id not in ADMIN_IDS:
        await update.message.reply_text("❌ Только для администраторов")
        return
    txt = (update.message.text or "").strip()
    m = re.findall(r'"([^"]+)"', txt)
    if len(m) < 1:
        await update.message.reply_text("Использование: /del_promo \"КОД\"")
        return
    code = m[0].strip()
    conn = db(); c = conn.cursor()
    try:
        c.execute("SELECT 1 FROM dom_promocodes WHERE code=%s", (code,))
        exists = c.fetchone()
        if not exists:
            release_db(conn)
            await update.message.reply_text("❌ Промокод не найден")
            return
        c.execute("DELETE FROM dom_promocodes WHERE code=%s", (code,))
        conn.commit()
        await update.message.reply_text(f"✅ Промокод удален: {code}")
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        await update.message.reply_text("❌ Ошибка сервера")
    finally:
        release_db(conn)

async def list_promos_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    admin_id = update.effective_user.id
    if admin_id not in ADMIN_IDS:
        await update.message.reply_text("❌ Только для администраторов")
        return
    conn = db(); c = conn.cursor()
    try:
        c.execute("SELECT code, amount_usd, used_count, max_uses, created_at, created_by FROM dom_promocodes ORDER BY created_at DESC")
        rows = c.fetchall()
        release_db(conn)
        if not rows:
            await update.message.reply_text("ℹ️ Активных промокодов нет")
            return
        lines = ["📋 Промокоды:"]
        for (code, amount_usd, used_count, max_uses, created_at, created_by) in rows:
            amount = float(amount_usd or 0.0)
            uc = int(used_count or 0)
            mu = "∞" if max_uses is None else str(int(max_uses))
            lines.append(f"• {code} → {amount:.2f} TON | {uc}/{mu}")
        await update.message.reply_text("\n".join(lines))
    except Exception:
        await update.message.reply_text("❌ Ошибка сервера")

async def admin_withdrawals(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Показать все ожидающие запросы на вывод средств"""
    user_id = update.effective_user.id
    if user_id not in ADMIN_IDS:
        await update.message.reply_text("❌ Вы не являетесь администратором.")
        return

    conn = db()
    c = conn.cursor()
    
    c.execute("""
        SELECT w.id, w.user_id, w.amount_usd, w.created_at, u.username, 
               COALESCE(w.wallet_address, u.wallet_address) as wallet_address
        FROM dom_withdrawals w
        LEFT JOIN dom_users u ON w.user_id = u.user_id
        WHERE w.status = 'pending'
        ORDER BY w.created_at ASC
    """)
    
    rows = c.fetchall()
    release_db(conn)
    
    if not rows:
        await update.message.reply_text("✅ В настоящее время нет ожидающих обработки запросов на снятие наличных.")
        return
    
    from datetime import datetime
    
    msg = "📋 Ожидаются выводы средств:\n\n"
    for row in rows:
        withdraw_id, uid, amount_usd, created_at, username, wallet = row
        amount_usd = float(amount_usd)
        
        # Calculate DOMIT/TON rate at request time
        c2 = db()
        cur = c2.cursor()
        cur.execute("""
            SELECT close FROM domit_price_history 
            WHERE timestamp <= %s 
            ORDER BY timestamp DESC LIMIT 1
        """, (created_at,))
        price_row = cur.fetchone()
        release_db(c2)
        
        ton_price = float(price_row[0]) if price_row else 0.0001
        ton_amount = amount_usd / ton_price if ton_price > 0 else 0
        
        date_str = datetime.fromtimestamp(created_at).strftime("%Y-%m-%d %H:%M")
        username_str = f"@{username}" if username else "Аноним"
        wallet_str = wallet if wallet else "❌ Без кошелька"
        
        msg += f"🆔 ID: {withdraw_id}\n"
        msg += f"👤 User: {username_str} ({uid})\n"
        msg += f"💰 Деньги: {amount_usd:.2f} TON (~{ton_amount:.4f} TON)\n"
        msg += f"💳 Wallet: {wallet_str}\n"
        msg += f"📅 Время: {date_str}\n"
        msg += f"━━━━━━━━━━━━━━━━\n\n"
    
    msg += "\n📌 Для подтверждения՝ /admin_approve <ID>\n"
    msg += "📌 Отказаться՝ /admin_reject <ID>"
    
    await update.message.reply_text(msg)


async def admin_approve(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Подтвердите запрос на вывод средств."""
    user_id = update.effective_user.id
    if user_id not in ADMIN_IDS:
        await update.message.reply_text("❌ Вы не являетесь администратором.")
        return
    
    if len(context.args) < 1:
        await update.message.reply_text("Использование՝ /admin_approve <withdraw_id>")
        return
    
    withdraw_id = int(context.args[0])
    now = int(time.time())
    
    conn = db()
    c = conn.cursor()
    
    try:
        # Get withdraw details
        c.execute("""
            SELECT user_id, amount_usd, status 
            FROM dom_withdrawals 
            WHERE id = %s
        """, (withdraw_id,))
        
        row = c.fetchone()
        if not row:
            await update.message.reply_text(f"❌ Withdraw ID {withdraw_id} не найдено։")
            release_db(conn)
            return
        
        target_user_id, amount_usd, status = row
        
        if status != 'pending':
            await update.message.reply_text(f"❌ Уже сняты средства {status} ")
            release_db(conn)
            return
        
        # Update status to approved
        c.execute("""
            UPDATE dom_withdrawals 
            SET status = 'approved', processed_at = %s 
            WHERE id = %s
        """, (now, withdraw_id))
        
        conn.commit()
        release_db(conn)
        
        await update.message.reply_text(
            f"✅ Withdraw #{withdraw_id} одобренный։\n"
            f"👤 User: {target_user_id}\n"
            f"💰 Деньги: {float(amount_usd):.2f} TON"
        )
        
        # Send notification to user
        try:
            await context.bot.send_message(
                chat_id=target_user_id,
                text=f"✅ Ваш запрос на вывод средств одобрен.։\n💰 Деньги переведены на ваш электронный кошелек."
            )
        except Exception as e:
            logger.warning(f"Could not notify user {target_user_id}: {e}")
    
    except Exception as e:
        logger.error(f"Error approving withdraw: {e}")
        await update.message.reply_text(f"❌ Неправильный՝ {e}")
        if conn:
            release_db(conn)


async def admin_reject(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Отклоните запрос на вывод средств и верните деньги."""
    user_id = update.effective_user.id
    if user_id not in ADMIN_IDS:
        await update.message.reply_text("❌ Вы не являетесь администратором.")
        return
    
    if len(context.args) < 1:
        await update.message.reply_text("Использование՝ /admin_reject <withdraw_id>")
        return
    
    withdraw_id = int(context.args[0])
    now = int(time.time())
    
    conn = db()
    c = conn.cursor()
    
    try:
        # Get withdraw details
        c.execute("""
            SELECT user_id, amount_usd, status 
            FROM dom_withdrawals 
            WHERE id = %s FOR UPDATE
        """, (withdraw_id,))
        
        row = c.fetchone()
        if not row:
            await update.message.reply_text(f"❌ Withdraw ID {withdraw_id} не найдено։")
            release_db(conn)
            return
        
        target_user_id, amount_usd, status = row
        
        if status != 'pending':
            await update.message.reply_text(f"❌ Уже вывели средства {status} ")
            release_db(conn)
            return
        
        # Return money to user balance
        c.execute("""
            UPDATE dom_users 
            SET balance_usd = COALESCE(balance_usd, 0) + %s,
                total_withdraw_usd = COALESCE(total_withdraw_usd, 0) - %s
            WHERE user_id = %s
        """, (amount_usd, amount_usd, target_user_id))
        
        # Update status to rejected
        c.execute("""
            UPDATE dom_withdrawals 
            SET status = 'rejected', processed_at = %s 
            WHERE id = %s
        """, (now, withdraw_id))
        
        conn.commit()
        release_db(conn)
        
        await update.message.reply_text(
            f"❌ Withdraw #{withdraw_id} отклоненный։\n"
            f"👤 User: {target_user_id}\n"
            f"💰 Количество ({float(amount_usd):.2f} TON) вернулось к balance։"
        )
        
        # Send notification to user
        try:
            await context.bot.send_message(
                chat_id=target_user_id,
                text=f"❌ Ваш запрос на вывод средств отклонен։\n💰 Деньги возвращены на ваш баланс."
            )
        except Exception as e:
            logger.warning(f"Could not notify user {target_user_id}: {e}")
    
    except Exception as e:
        logger.error(f"Error rejecting withdraw: {e}")
        await update.message.reply_text(f"❌ Неправильный՝ {e}")
        if conn:
            release_db(conn)

async def fake_add_withdraw(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Admin: /fake_add_withdraw [User] [Amount]"""
    admin_id = update.effective_user.id
    if admin_id not in ADMIN_IDS: return
    
    import random
    if context.args:
        user = context.args[0]
        try: amount = float(context.args[1])
        except: amount = random.randint(50, 500)
    else:
        user = f"User{random.randint(1000,9999)}"
        amount = random.randint(50, 500)
    
    if admin_id not in FAKE_HISTORY:
        FAKE_HISTORY[admin_id] = []

    FAKE_HISTORY[admin_id].insert(0, {
        "type": "withdraw",
        "user": user,
        "amount": amount,
        "time": int(time.time())
    })
    # Keep max 20
    if len(FAKE_HISTORY[admin_id]) > 20: FAKE_HISTORY[admin_id].pop()
    
    await update.message.reply_text(f"✅ Fake Withdraw Added: {user} - {amount} TON (Visible only to you)")

async def fake_add_deposit(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Admin: /fake_add_deposit [User] [Amount]"""
    admin_id = update.effective_user.id
    if admin_id not in ADMIN_IDS: return
    
    import random
    if context.args:
        user = context.args[0]
        try: amount = float(context.args[1])
        except: amount = random.randint(50, 500)
    else:
        user = f"User{random.randint(1000,9999)}"
        amount = random.randint(50, 500)
    
    if admin_id not in FAKE_HISTORY:
        FAKE_HISTORY[admin_id] = []

    FAKE_HISTORY[admin_id].insert(0, {
        "type": "deposit",
        "user": user,
        "amount": amount,
        "time": int(time.time())
    })
    if len(FAKE_HISTORY[admin_id]) > 20: FAKE_HISTORY[admin_id].pop()
    
    await update.message.reply_text(f"✅ Fake Deposit Added: {user} - {amount} TON (Visible only to you)")

async def fake_reset(update: Update, context: ContextTypes.DEFAULT_TYPE):
    admin_id = update.effective_user.id
    if admin_id not in ADMIN_IDS: return
    if admin_id in FAKE_HISTORY:
        FAKE_HISTORY[admin_id].clear()
    await update.message.reply_text("✅ Your Fake History Cleared")

# Auto fake withdrawals system
AUTO_FAKE_STATUS = {}  # {admin_id: {"active": bool, "min_amount": float, "max_amount": float, "interval": int}}

async def auto_fake_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Start auto fake withdrawals: /auto_fake_start [min_amount] [max_amount] [interval_minutes]"""
    admin_id = update.effective_user.id
    if admin_id not in ADMIN_IDS:
        await update.message.reply_text("❌ Только для администраторов")
        return
    
    try:
        min_amount = float(context.args[0]) if len(context.args) > 0 else 50
        max_amount = float(context.args[1]) if len(context.args) > 1 else 500
        interval = int(context.args[2]) if len(context.args) > 2 else 30
        
        AUTO_FAKE_STATUS[admin_id] = {
            "active": True,
            "min_amount": min_amount,
            "max_amount": max_amount,
            "interval": interval,
            "last_generated": 0
        }
        
        await update.message.reply_text(
            f"✅ Auto fake withdrawals started\n"
            f"💰 Amount: {min_amount}-{max_amount} TON\n"
            f"⏰ Interval: {interval} minutes"
        )
    except (ValueError, IndexError):
        await update.message.reply_text(
            "❌ Usage: /auto_fake_start [min_amount] [max_amount] [interval_minutes]\n"
            "Example: /auto_fake_start 50 500 30"
        )

async def auto_fake_stop(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Stop auto fake withdrawals"""
    admin_id = update.effective_user.id
    if admin_id not in ADMIN_IDS:
        await update.message.reply_text("❌ Только для администраторов")
        return
    
    if admin_id in AUTO_FAKE_STATUS:
        AUTO_FAKE_STATUS[admin_id]["active"] = False
        await update.message.reply_text("✅ Auto fake withdrawals stopped")
    else:
        await update.message.reply_text("❌ Auto fake withdrawals not active")

async def auto_fake_status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Show auto fake withdrawals status"""
    admin_id = update.effective_user.id
    if admin_id not in ADMIN_IDS:
        await update.message.reply_text("❌ Только для администраторов")
        return
    
    if admin_id in AUTO_FAKE_STATUS and AUTO_FAKE_STATUS[admin_id]["active"]:
        status = AUTO_FAKE_STATUS[admin_id]
        await update.message.reply_text(
            f"📊 Auto Fake Status: ✅ Active\n"
            f"💰 Amount: {status['min_amount']}-{status['max_amount']} TON\n"
            f"⏰ Interval: {status['interval']} minutes"
        )
    else:
        await update.message.reply_text("📊 Auto Fake Status: ❌ Inactive")

def generate_auto_fake_withdrawals():
    """Generate automatic fake withdrawals for active admins"""
    import time
    current_time = int(time.time())
    
    for admin_id, status in AUTO_FAKE_STATUS.items():
        if not status["active"]:
            continue
            
        # Check if it's time to generate new withdrawal
        time_since_last = current_time - status["last_generated"]
        interval_seconds = status["interval"] * 60
        
        if time_since_last >= interval_seconds:
            # Generate random withdrawal
            import random
            amount = random.uniform(status["min_amount"], status["max_amount"])
            amount = round(amount, 2)
            
             # Generate realistic Telegram-like username with ID
            first_digit = random.choice('123456789')
            other_digits = ''.join([random.choice('0123456789') for _ in range(9)])
            telegram_id = first_digit + other_digits
            
            formats = [
                f"ID{telegram_id[-4:]}",
                f"ID{telegram_id[-5:]}{random.randint(1,99)}",
                f"ID_{telegram_id[-6:]}",
                f"ID{telegram_id[-3:]}{random.randint(1,9)}"
            ]
            username = random.choice(formats)
            
            # Add to fake history
            if admin_id not in FAKE_HISTORY:
                FAKE_HISTORY[admin_id] = []
            
            FAKE_HISTORY[admin_id].insert(0, {
                "type": "withdraw",
                "user": username,
                "amount": amount,
                "time": current_time
            })
            
            # Keep max 20 items
            if len(FAKE_HISTORY[admin_id]) > 20:
                FAKE_HISTORY[admin_id].pop()
            
            # Update last generated time
            status["last_generated"] = current_time
            
            logger.info(f"🤖 Auto fake withdrawal generated: {username} - {amount} TON")

def auto_fake_withdrawal_worker():
    """Background worker to generate auto fake withdrawals"""
    while True:
        try:
            generate_auto_fake_withdrawals()
            time.sleep(60)  # Check every minute
        except Exception as e:
            logger.error(f"Error in auto fake withdrawal worker: {e}")
            time.sleep(60)

async def admin_test_withdraw(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """ТЕСТ: Создание запроса на вывод средств БЕЗ проверок"""
    user_id = update.effective_user.id
    if user_id not in ADMIN_IDS:
        await update.message.reply_text("❌ Вы не являетесь администратором.")
        return
    
    if len(context.args) < 2:
        await update.message.reply_text("Использование՝ /admin_test_withdraw <user_id> <amount>")
        return
    
    target_user_id = int(context.args[0])
    amount = float(context.args[1])
    
    conn = db()
    c = conn.cursor()
    
    try:
        # Check balance
        c.execute("SELECT balance_usd FROM dom_users WHERE user_id = %s FOR UPDATE", (target_user_id,))
        row = c.fetchone()
        current_balance = float(row[0]) if row else 0.0
        
        if current_balance < amount:
            await update.message.reply_text(f"❌ User {target_user_id}-имеет только {current_balance:.2f} TON")
            release_db(conn)
            return
        
        # Check pending withdrawals
        c.execute("""
            SELECT COUNT(*) FROM dom_withdrawals 
            WHERE user_id = %s AND status = 'pending'
        """, (target_user_id,))
        pending_count = c.fetchone()[0]
        
        if pending_count > 0:
            await update.message.reply_text(f"❌ User {target_user_id}-Уже есть ожидающий рассмотрения запрос на вывод средств.")
            release_db(conn)
            return
        
        # Create withdraw (skip validation)
        now = int(time.time())
        
        # Get user's wallet address
        c.execute("SELECT wallet_address FROM dom_users WHERE user_id=%s", (target_user_id,))
        wallet_row = c.fetchone()
        wallet_address = wallet_row[0] if wallet_row and wallet_row[0] else None

        c.execute("""
            INSERT INTO dom_withdrawals (user_id, amount_usd, status, created_at, wallet_address)
            VALUES (%s, %s, 'pending', %s, %s)
        """, (target_user_id, amount, now, wallet_address))
        
        c.execute("""
            UPDATE dom_users
               SET balance_usd = balance_usd - %s,
                   total_withdraw_usd = COALESCE(total_withdraw_usd,0) + %s
             WHERE user_id=%s
        """, (amount, amount, target_user_id))
        
        conn.commit()
        release_db(conn)
        
        await update.message.reply_text(
            f"✅ TEST withdraw созданный։\n"
            f"👤 User: {target_user_id}\n"
            f"💰 Деньги: {amount:.2f} TON\n\n"
            f"Использовать /admin_withdrawals чтобы увидеть"
        )
    
    except Exception as e:
        logger.error(f"Error in test withdraw: {e}")
        await update.message.reply_text(f"❌ Неправильный՝ {e}")
        if conn:
            release_db(conn)

# ═══════════════════════════════════════════════════════════
# TELEGRAM PAGES VERIFICATION SYSTEM
# ═══════════════════════════════════════════════════════════

def normalize_page_link(link: str) -> str:
    """Normalize page link to standard format"""
    link = link.strip()
    if link.startswith('@'):
        return f"https://t.me/{link[1:]}"
    elif link.startswith('https://t.me/'):
        return link
    else:
        return f"https://t.me/{link}"

def extract_page_name(link: str) -> str:
    """Extract page name from link"""
    if link.startswith('@'):
        return link[1:]
    elif link.startswith('https://t.me/'):
        return link.replace('https://t.me/', '')
    else:
        return link

async def check_user_page_membership(user_id: int) -> tuple[bool, list]:
    """Check if user is member of all required pages. Returns (has_access, missing_pages)"""
    # TEMPORARILY DISABLED FOR TESTING
    logger.info(f"Page verification temporarily disabled for user {user_id}")
    return True, []
    
    if not pyrogram_client:
        logger.warning("Pyrogram client not available, skipping page verification")
        return True, []
    
    missing_pages = []
    
    try:
        # Get all required pages
        conn = db()
        c = conn.cursor()
        c.execute("SELECT page_link, page_name FROM telegram_pages")
        pages = c.fetchall()
        release_db(conn)
        
        if not pages:
            return True, []  # No pages required
        
        # Check each page
        for page_link, page_name in pages:
            page_username = page_link.replace('https://t.me/', '')
            
            try:
                # Use pyrogram queue to avoid loop issues
                import queue
                import time
                import random
                
                request_id = f"check_{user_id}_{int(time.time())}_{random.randint(1000, 9999)}"
                
                # Clear old results for this user
                keys_to_remove = [key for key in pyrogram_results.keys() if key.startswith(f"check_{user_id}_")]
                for key in keys_to_remove:
                    pyrogram_results.pop(key, None)
                
                # Send request to pyrogram thread
                request_data = {
                    'type': 'check_membership',
                    'user_id': user_id,
                    'page_username': page_username,
                    'request_id': request_id
                }
                
                pyrogram_queue.put(request_data)
                logger.info(f"Sent membership check request for {page_username} (user: {user_id})")
                
                # Wait for result
                timeout = 15
                start_time = time.time()
                
                while request_id not in pyrogram_results:
                    if time.time() - start_time > timeout:
                        logger.error(f"Timeout checking membership for {page_username}")
                        missing_pages.append({
                            'link': page_link,
                            'name': page_name,
                            'username': page_username
                        })
                        break
                    await asyncio.sleep(0.1)
                else:
                    result = pyrogram_results.pop(request_id)
                    logger.info(f"Received membership result for {page_username}: {result}")
                    
                    if not result.get('is_member', False):
                        logger.info(f"User {user_id} is not member of {page_username}")
                        missing_pages.append({
                            'link': page_link,
                            'name': page_name,
                            'username': page_username
                        })
                    else:
                        logger.info(f"✅ User {user_id} IS member of {page_username}")
                        
            except Exception as e:
                logger.error(f"Error with pyrogram queue: {e}")
                missing_pages.append({
                    'link': page_link,
                    'name': page_name,
                    'username': page_username
                })
        
        return (len(missing_pages) == 0), missing_pages
        
    except Exception as e:
        logger.error(f"Error in check_user_page_membership: {e}")
        return True, []  # Allow access if verification fails

async def send_access_denied_message(user_id: int):
    """Send access denied message to user"""
    try:
        conn = db()
        c = conn.cursor()
        c.execute("SELECT page_link, page_name FROM telegram_pages")
        pages = c.fetchall()
        release_db(conn)
        
        message = "🚫 **Доступ к приложению ограничен**\n\n"
        message += "Для доступа к приложению необходимо подписаться на все каналы.\n\n"
        
        for page_link, page_name in pages:
            message += f"📄 [{page_name}]({page_link})\n"
        
        message += "\nВы не можете открыть приложение."
        
        await application.bot.send_message(
            chat_id=user_id,
            text=message,
            parse_mode="Markdown",
            disable_web_page_preview=True
        )
    except Exception as e:
        logger.error(f"Error sending access denied: {e}")

async def addpage_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Add a Telegram page for verification"""
    user_id = update.effective_user.id
    if user_id not in ADMIN_IDS:
        await update.message.reply_text("❌ Вы не являетесь администратором.")
        return
    
    if not pyrogram_client:
        # Check if we have the credentials but client is still starting
        if PYROGRAM_API_ID and PYROGRAM_API_HASH:
            await update.message.reply_text("⏳ Pyrogram client еще запускается... Пожалуйста, подождите несколько секунд и попробуйте снова.")
        else:
            await update.message.reply_text("❌ Pyrogram client не настроен. Проверьте API credentials.")
        return
    
    if len(context.args) < 1:
        await update.message.reply_text("Использование: /addpage <link>\nПример: /addpage @mypage или /addpage https://t.me/mypage")
        return
    
    page_link = context.args[0]
    normalized_link = normalize_page_link(page_link)
    page_name = extract_page_name(page_link)
    
    try:
        conn = db()
        c = conn.cursor()
        
        # Check if page already exists
        c.execute("SELECT id FROM telegram_pages WHERE page_link = %s", (normalized_link,))
        if c.fetchone():
            await update.message.reply_text(f"❌ Страница уже существует: {normalized_link}")
            release_db(conn)
            return
        
        # Add page
        now = int(time.time())
        c.execute("""
            INSERT INTO telegram_pages (page_link, page_name, created_at)
            VALUES (%s, %s, %s)
        """, (normalized_link, page_name, now))
        
        conn.commit()
        release_db(conn)
        
        await update.message.reply_text(f"✅ Страница добавлена: {page_name}\n🔗 Ссылка: {normalized_link}")
        
    except Exception as e:
        logger.error(f"Error in addpage_cmd: {e}")
        await update.message.reply_text(f"❌ Ошибка: {e}")

async def listpage_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """List all Telegram pages"""
    user_id = update.effective_user.id
    if user_id not in ADMIN_IDS:
        await update.message.reply_text("❌ Вы не являетесь администратором.")
        return
    
    try:
        conn = db()
        c = conn.cursor()
        c.execute("SELECT id, page_link, page_name, created_at FROM telegram_pages ORDER BY id")
        pages = c.fetchall()
        release_db(conn)
        
        if not pages:
            status = "✅ Активен" if pyrogram_client else "❌ Неактивен (настройте Pyrogram)"
            await update.message.reply_text(f"📋 Список страниц пуст\n\nСтатус проверки: {status}")
            return
        
        message = f"📋 **Список страниц для проверки:**\n\n"
        message += f"🔧 Статус Pyrogram: {'✅ Активен' if pyrogram_client else '❌ Неактивен'}\n\n"
        
        for page in pages:
            page_id, page_link, page_name, created_at = page
            created_date = datetime.fromtimestamp(created_at).strftime('%Y-%m-%d %H:%M')
            message += f"🔹 **ID:** {page_id}\n"
            message += f"📝 **Название:** {page_name}\n"
            message += f"🔗 **Ссылка:** {page_link}\n"
            message += f"📅 **Добавлена:** {created_date}\n\n"
        
        await update.message.reply_text(message, parse_mode='Markdown')
        
    except Exception as e:
        logger.error(f"Error in listpage_cmd: {e}")
        await update.message.reply_text(f"❌ Ошибка: {e}")

async def delpage_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Delete a Telegram page"""
    user_id = update.effective_user.id
    if user_id not in ADMIN_IDS:
        await update.message.reply_text("❌ Вы не являетесь администратором.")
        return
    
    if not pyrogram_client:
        # Check if we have the credentials but client is still starting
        if PYROGRAM_API_ID and PYROGRAM_API_HASH:
            await update.message.reply_text("⏳ Pyrogram client еще запускается... Пожалуйста, подождите несколько секунд и попробуйте снова.")
        else:
            await update.message.reply_text("❌ Pyrogram client не настроен. Проверьте API credentials.")
        return
    
    if len(context.args) < 1:
        await update.message.reply_text("Использование: /delpage <id>")
        return
    
    try:
        page_id = int(context.args[0])
        
        conn = db()
        c = conn.cursor()
        
        # Check if page exists
        c.execute("SELECT page_name FROM telegram_pages WHERE id = %s", (page_id,))
        page = c.fetchone()
        if not page:
            await update.message.reply_text(f"❌ Страница с ID {page_id} не найдена")
            release_db(conn)
            return
        
        page_name = page[0]
        
        # Delete page
        c.execute("DELETE FROM telegram_pages WHERE id = %s", (page_id,))
        conn.commit()
        release_db(conn)
        
        await update.message.reply_text(f"✅ Страница удалена: {page_name}")
        
    except ValueError:
        await update.message.reply_text("❌ Неверный формат ID. Используйте: /delpage <число>")
    except Exception as e:
        logger.error(f"Error in delpage_cmd: {e}")
        await update.message.reply_text(f"❌ Ошибка: {e}")


async def leaderboard_on_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Enable leaderboard"""
    user_id = update.effective_user.id
    if user_id not in ADMIN_IDS:
        await update.message.reply_text("❌ Только для администраторов")
        return
    
    try:
        conn = db()
        c = conn.cursor()
        c.execute("UPDATE leaderboard_status SET is_enabled = TRUE, updated_at = CURRENT_TIMESTAMP")
        conn.commit()
        release_db(conn)
        
        await update.message.reply_text("✅ Лидерборд включен и теперь отображается в приложении")
        logger.info(f"🏆 Leaderboard enabled by admin {user_id}")
        
    except Exception as e:
        logger.error(f"Error enabling leaderboard: {e}")
        await update.message.reply_text(f"❌ Ошибка: {e}")

async def leaderboard_off_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Disable leaderboard"""
    user_id = update.effective_user.id
    if user_id not in ADMIN_IDS:
        await update.message.reply_text("❌ Только для администраторов")
        return
    
    try:
        conn = db()
        c = conn.cursor()
        c.execute("UPDATE leaderboard_status SET is_enabled = FALSE, updated_at = CURRENT_TIMESTAMP")
        conn.commit()
        release_db(conn)
        
        await update.message.reply_text("✅ Лидерборд выключен и скрыт из приложения")
        logger.info(f"🏆 Leaderboard disabled by admin {user_id}")
        
    except Exception as e:
        logger.error(f"Error disabling leaderboard: {e}")
        await update.message.reply_text(f"❌ Ошибка: {e}")

async def add_lead_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Add user to leaderboard with referral count"""
    user_id = update.effective_user.id
    if user_id not in ADMIN_IDS:
        await update.message.reply_text("❌ Только для администраторов")
        return
    
    if len(context.args) < 2:
        await update.message.reply_text("Использование: /addlead <telegram_id> <referral_count>")
        return
    
    try:
        target_id = int(context.args[0])
        referral_count = int(context.args[1])
        
        if referral_count < 0:
            await update.message.reply_text("❌ Количество рефералов не может быть отрицательным")
            return
        
        conn = db()
        c = conn.cursor()
        
        # Check if user exists in dom_users
        c.execute("SELECT username FROM dom_users WHERE user_id = %s", (target_id,))
        user_row = c.fetchone()
        
        if not user_row:
            # Auto-create user if not exists
            c.execute("""
                INSERT INTO dom_users (user_id, username, created_at)
                VALUES (%s, %s, CURRENT_TIMESTAMP)
                ON CONFLICT (user_id) DO NOTHING
            """, (target_id, f"User{target_id}"))
            
            # Get username again
            c.execute("SELECT username FROM dom_users WHERE user_id = %s", (target_id,))
            user_row = c.fetchone()
            
            if not user_row:
                await update.message.reply_text(f"❌ Ошибка при создании пользователя с ID {target_id}")
                release_db(conn)
                return
        
        # Insert or update leaderboard entry
        c.execute("""
            INSERT INTO leaderboard_entries (telegram_id, referral_count)
            VALUES (%s, %s)
            ON CONFLICT (telegram_id) 
            DO UPDATE SET 
                referral_count = %s,
                updated_at = CURRENT_TIMESTAMP
        """, (target_id, referral_count, referral_count))
        
        conn.commit()
        release_db(conn)
        
        username = user_row[0] or f"User {target_id}"
        await update.message.reply_text(f"✅ Пользователь {username} (ID: {target_id}) добавлен в лидерборд с {referral_count} рефералами")
        logger.info(f"🏆 Admin {user_id} added user {target_id} with {referral_count} referrals to leaderboard")
        
    except ValueError:
        await update.message.reply_text("❌ Неверный формат. Используйте: /addlead <telegram_id> <referral_count>")
    except Exception as e:
        logger.error(f"Error adding to leaderboard: {e}")
        await update.message.reply_text(f"❌ Ошибка: {e}")

async def del_lead_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Delete user from leaderboard"""
    user_id = update.effective_user.id
    if user_id not in ADMIN_IDS:
        await update.message.reply_text("❌ Только для администраторов")
        return
    
    if len(context.args) < 1:
        await update.message.reply_text("Использование: /dellead <telegram_id>")
        return
    
    try:
        target_id = int(context.args[0])
        
        conn = db()
        c = conn.cursor()
        
        # Delete from leaderboard
        c.execute("DELETE FROM leaderboard_entries WHERE telegram_id = %s", (target_id,))
        deleted = c.rowcount
        
        conn.commit()
        release_db(conn)
        
        if deleted > 0:
            await update.message.reply_text(f"✅ Пользователь с ID {target_id} удален из лидерборда")
            logger.info(f"🏆 Admin {user_id} deleted user {target_id} from leaderboard")
        else:
            await update.message.reply_text(f"❌ Пользователь с ID {target_id} не найден в лидерборде")
        
    except ValueError:
        await update.message.reply_text("❌ Неверный формат ID. Используйте: /dellead <telegram_id>")
    except Exception as e:
        logger.error(f"Error deleting from leaderboard: {e}")
        await update.message.reply_text(f"❌ Ошибка: {e}")

async def list_lead_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """List all manually added leaderboard entries"""
    user_id = update.effective_user.id
    if user_id not in ADMIN_IDS:
        await update.message.reply_text("❌ Только для администраторов")
        return
    
    try:
        conn = db()
        c = conn.cursor()
        
        c.execute("""
            SELECT le.telegram_id, le.referral_count, du.username, le.created_at, le.updated_at
            FROM leaderboard_entries le
            LEFT JOIN dom_users du ON du.user_id = le.telegram_id
            ORDER BY le.referral_count DESC
        """)
        
        entries = c.fetchall()
        release_db(conn)
        
        if not entries:
            await update.message.reply_text("📋 В лидерборде нет добавленных пользователей")
            return
        
        message = "📋 **Добавленные пользователи в лидерборде:**\n\n"
        
        for i, (telegram_id, referral_count, username, created_at, updated_at) in enumerate(entries, 1):
            display_name = username or f"User {telegram_id}"
            created_date = datetime.fromtimestamp(created_at).strftime('%Y-%m-%d %H:%M')
            updated_date = datetime.fromtimestamp(updated_at).strftime('%Y-%m-%d %H:%M')
            
            message += f"👤 **{i}.** {display_name}\n"
            message += f"🆔 **ID:** {telegram_id}\n"
            message += f"👥 **Рефералы:** {referral_count}\n"
            message += f"📅 **Добавлен:** {created_date}\n"
            message += f"🔄 **Обновлен:** {updated_date}\n\n"
        
        await update.message.reply_text(message, parse_mode='Markdown')
        
    except Exception as e:
        logger.error(f"Error listing leaderboard: {e}")
        await update.message.reply_text(f"❌ Ошибка: {e}")

async def start_bot_webhook():
    global application
    print("🤖 Initializing Domino Telegram bot (Webhook Mode)...")

    backoff = 5
    while True:
        try:
            application = ApplicationBuilder().token(BOT_TOKEN).build()
            application.add_handler(CommandHandler("start", start_cmd))
            application.add_handler(CommandHandler("stats", stats_cmd))
            application.add_handler(CallbackQueryHandler(btn_handler))
            application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, block_text))
            application.add_handler(CommandHandler("admin_add", admin_add))
            application.add_handler(CommandHandler("admin_withdrawals", admin_withdrawals))
            application.add_handler(CommandHandler("admin_approve", admin_approve))
            application.add_handler(CommandHandler("admin_reject", admin_reject))
            application.add_handler(CommandHandler("task_add_video", task_add_video))
            application.add_handler(CommandHandler("task_add_follow", task_add_follow))
            application.add_handler(CommandHandler("task_add_invite", task_add_invite))
            application.add_handler(CommandHandler("task_add_game", task_add_game))
            application.add_handler(CommandHandler("task_add_special", task_add_special))
            application.add_handler(CommandHandler("task_list", task_list))
            application.add_handler(CommandHandler("task_delete", task_delete))
            application.add_handler(CommandHandler("task_toggle", task_toggle))
            application.add_handler(CommandHandler("task_shorten", task_shorten))
            application.add_handler(CommandHandler("burn_stats", burn_stats))
            application.add_handler(CommandHandler("burn_reward", burn_reward))
            application.add_handler(CommandHandler("audience", audience_cmd))
            application.add_handler(CommandHandler("reset", reset_cmd))
            application.add_handler(CommandHandler("migrate_posts", migrate_posts_cmd))
            application.add_handler(CommandHandler("init_domit_data", init_domit_data))
            application.add_handler(CommandHandler("set_domit_range", set_domit_range))
            application.add_handler(CommandHandler("admin_test_withdraw", admin_test_withdraw))
            application.add_handler(CommandHandler("fake_add_withdraw", fake_add_withdraw))
            application.add_handler(CommandHandler("fake_add_deposit", fake_add_deposit))
            application.add_handler(CommandHandler("fake_reset", fake_reset))
            application.add_handler(CommandHandler("auto_fake_start", auto_fake_start))
            application.add_handler(CommandHandler("auto_fake_stop", auto_fake_stop))
            application.add_handler(CommandHandler("auto_fake_status", auto_fake_status))
            application.add_handler(CommandHandler("add_promo", add_promo_cmd))
            application.add_handler(CommandHandler("del_promo", del_promo_cmd))
            application.add_handler(CommandHandler("list_promos", list_promos_cmd))
            application.add_handler(CommandHandler("addpage", addpage_cmd))
            application.add_handler(CommandHandler("listpage", listpage_cmd))
            application.add_handler(CommandHandler("delpage", delpage_cmd))
            application.add_handler(CommandHandler("leadbordon", leaderboard_on_cmd))
            application.add_handler(CommandHandler("leadbordoff", leaderboard_off_cmd))
            application.add_handler(CommandHandler("addlead", add_lead_cmd))
            application.add_handler(CommandHandler("dellead", del_lead_cmd))
            application.add_handler(CommandHandler("listlead", list_lead_cmd))

            await application.initialize()
            await application.start()

            port = int(os.environ.get("PORT", "10000"))
            webhook_override = os.getenv("WEBHOOK_URL", "").strip()
            webhook_url = webhook_override or f"{BASE_URL}/webhook"

            set_ok = False
            for attempt in range(1, 6):
                try:
                    await application.bot.delete_webhook(drop_pending_updates=True)
                    await application.bot.set_webhook(url=webhook_url)
                    set_ok = True
                    break
                except Exception as e:
                    print(f"⚠️ Webhook set failed (attempt {attempt}/5): {e}")
                    if "temporary failure in name resolution" in str(e) or "failed to resolve host" in str(e):
                        print(f"🔍 DNS resolution failed for {webhook_url}, retrying in 15 seconds...")
                        try:
                            await asyncio.sleep(15)
                        except Exception:
                            pass
                    elif "unexpected keyword argument" in str(e):
                        print(f"⚠️ Bot API version incompatibility. Using default timeout.")
                        try:
                            await asyncio.sleep(5)
                        except Exception:
                            pass
                    else:
                        try:
                            await asyncio.sleep(10)
                        except Exception:
                            pass

            if set_ok:
                global BOT_READY
                BOT_READY = True
                print("🟢 BOT_READY = True")
                print(f"✅ Webhook set to {webhook_url}")
                return
            else:
                print(f"❌ Failed to set webhook to {webhook_url}. Set WEBHOOK_URL or BASE_URL to a public HTTPS domain.")
                return
        except Exception as e:
            print(f"⚠️ Bot init failed: {e}")
            try:
                await asyncio.sleep(backoff)
            except Exception:
                pass
            backoff = min(backoff * 2, 60)

async def migrate_posts_cmd(update: Update, context):
    """Admin command to migrate posts media"""
    if update.effective_user.id not in ADMIN_IDS:  
        await update.message.reply_text("❌ Только для администраторов")
        return
    
    await update.message.reply_text("🔄 Я начинаю migration...")
    
    try:
        migrate_posts_to_files()
        await update.message.reply_text("✅ Migration законченный!")
    except Exception as e:
        await update.message.reply_text(f"❌ Ошибка. {e}")
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
        await update.message.reply_text("❌ Вы не являетесь администратором.")
        return

    conn = db(); c = conn.cursor()
    c.execute("SELECT id, title, category, reward, is_active FROM dom_tasks ORDER BY id DESC")
    rows = c.fetchall()
    release_db(conn)

    if not rows:
        await update.message.reply_text("📭 No Task")
        return

    msg = "📋 **Task**\n\n"
    for r in rows:
        msg += f"ID: {r[0]} | {r[1]} | {r[2]} | 💰 {r[3]}$ | {'🟢 ON' if r[4] else '🔴 OFF'}\n"

    await update.message.reply_text(msg)

async def task_delete(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if user_id not in ADMIN_IDS:
        await update.message.reply_text("❌ Вы не являетесь администратором.")
        return

    if len(context.args) != 1:
        await update.message.reply_text("Использование՝ /task_delete ID")
        return

    task_id = int(context.args[0])

    conn = db(); c = conn.cursor()
    c.execute("DELETE FROM dom_tasks WHERE id=%s", (task_id,))
    conn.commit()
    release_db(conn)

    await update.message.reply_text(f"🗑 Задание удалено. (ID={task_id})")

async def task_toggle(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if user_id not in ADMIN_IDS:
        await update.message.reply_text("❌ Вы не являетесь администратором.")
        return

    if len(context.args) != 1:
        await update.message.reply_text("Использование՝ /task_toggle ID")
        return

    task_id = int(context.args[0])

    conn = db(); c = conn.cursor()
    c.execute("UPDATE dom_tasks SET is_active = NOT is_active WHERE id=%s RETURNING is_active", (task_id,))
    row = c.fetchone()
    conn.commit()
    release_db(conn)

    if not row:
        await update.message.reply_text("❌ Задача отсутствует.")
        return

    state = "🟢 Подключено" if row[0] else "🔴 Выключенный"
    await update.message.reply_text(f"ID {task_id} → {state}")

async def add_task_with_category(update: Update, context: ContextTypes.DEFAULT_TYPE, category: str):
    user_id = update.effective_user.id
    if user_id not in ADMIN_IDS:
        await update.message.reply_text("❌ Вы не являетесь администратором.։")
        return

    text = " ".join(context.args)
    if "|" not in text:
        await update.message.reply_text(
            "Использование՝\n"
            f"/task_add_{category} Title | Description | URL | Reward"
        )
        return

    try:
        title, desc, url, reward = [x.strip() for x in text.split("|")]
        reward = float(reward)
    except:
        await update.message.reply_text("❌ Неверный формат.")
        return

    import urllib.parse

    parsed = urllib.parse.urlparse(url)

    if parsed.netloc and 'exe.io' in parsed.netloc:
        await update.message.reply_text(
            "❌ Вставьте конечный URL-адрес веб-сайта, а не короткую ссылку exe.io..\n"
            "✅ Наша система автоматически генерирует короткую ссылку для каждого пользователя, чтобы обеспечить надлежащее отслеживание производительности.։"
        )
        return
    else:
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

    await update.message.reply_text(f"✔ Добавлена ​​задача `{category}` в отделе.")


async def task_shorten(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if user_id not in ADMIN_IDS:
        await update.message.reply_text("❌ Вы не являетесь администратором.")
        return
    if len(context.args) != 1:
        await update.message.reply_text("Использование՝ /task_shorten ID")
        return
    task_id = int(context.args[0])
    conn = db(); c = conn.cursor()
    c.execute("SELECT id, url FROM dom_tasks WHERE id=%s", (task_id,))
    row = c.fetchone()
    if not row:
        release_db(conn)
        await update.message.reply_text("❌ Задача отсутствует.")
        return
    old_url = row[1]
    release_db(conn)
    import urllib.parse
    parsed = urllib.parse.urlparse(old_url or "")
    if parsed.netloc and 'exe.io' in parsed.netloc:
        await update.message.reply_text("⚠️ Эта задача сохраняет ссылку на файл exe.io. Рекомендуется сохранять конечную ссылку на веб-сайт, чтобы избежать двойного сокращения.։")
        return
    u_b64 = base64.urlsafe_b64encode((old_url or "").encode()).decode()
    success_url = f"{BASE_URL}/exeio/complete?uid={{user_id}}&task_id={{task_id}}&u={u_b64}"
    short = exeio_shorten(success_url)
    if not short:
        await update.message.reply_text("❌ exe.io не вернул короткую ссылку։")
        return
    await update.message.reply_text(f"🔗 Preview короткая ссылка՝ {short}\nℹ️ Мы не сохраняем короткую ссылку в базе данных, чтобы избежать двойных ссылок.։")


@app_web.route("/webhook", methods=["POST"])
def telegram_webhook():
    """
    Маршрут Flask, который получает обновления из Telegram и передает их в приложение PTB.
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


@app_web.route("/api/fake_history", methods=["GET"])
def api_fake_history():
    uid = request.args.get("uid", type=int)
    # If uid is provided and exists in FAKE_HISTORY, return that user's history.
    # Otherwise, return empty list (or global history if we wanted that, but user asked for specific).
    # Since only admins can add history, we assume the uid passed is the admin viewing it.
    
    user_history = []
    if uid and uid in FAKE_HISTORY:
        user_history = FAKE_HISTORY[uid]
        
    return jsonify({"ok": True, "history": user_history})


@app_web.route("/api/withdrawal_ticker", methods=["GET"])
def api_withdrawal_ticker():
    """Get last 24 hours of withdrawals (real + fake) for ticker display"""
    try:
        import time
        twenty_four_hours_ago = int(time.time()) - (24 * 60 * 60)
        
        withdrawals = []
        
        # Get real withdrawals from last 24 hours
        conn = db()
        c = conn.cursor()
        c.execute("""
            SELECT w.amount_usd, u.username, w.created_at
            FROM dom_withdrawals w
            LEFT JOIN dom_users u ON w.user_id = u.user_id
            WHERE w.created_at >= %s
            ORDER BY w.created_at DESC
            LIMIT 20
        """, (twenty_four_hours_ago,))
        
        real_withdrawals = c.fetchall()
        release_db(conn)
        
        # Add real withdrawals
        for amount, username, created_at in real_withdrawals:
            if username:
                withdrawals.append({
                    "username": username,
                    "amount": float(amount),
                    "type": "real",
                    "timestamp": created_at
                })
        
        # Add fake withdrawals from all admins
        for admin_id, admin_history in FAKE_HISTORY.items():
            for item in admin_history:
                if item["type"] == "withdraw" and item["time"] >= twenty_four_hours_ago:
                    withdrawals.append({
                        "username": item["user"],
                        "amount": float(item["amount"]),
                        "type": "fake",
                        "timestamp": item["time"]
                    })
        
        # Sort by timestamp (newest first) and limit to 20 items
        withdrawals.sort(key=lambda x: x["timestamp"], reverse=True)
        withdrawals = withdrawals[:20]
        
        return jsonify({
            "ok": True,
            "withdrawals": withdrawals
        })
        
    except Exception as e:
        logger.exception("Error in withdrawal_ticker API")
        return jsonify({"ok": False, "error": str(e)}), 500


@app_web.route("/api/get_user_data", methods=["POST"])
def api_get_user_data():
    data = request.get_json()
    telegram_id = data.get("telegram_id")
    if not telegram_id:
        return jsonify({"error": "Missing telegram_id"}), 400

    conn = db()
    c = conn.cursor()
    c.execute("""
        SELECT telegram_id, username, status_level, ton_balance, usd_balance, 
               avatar_data, fires_received, fires_given, total_games, total_wins
        FROM dom_users
        WHERE telegram_id = %s
    """, (telegram_id,))
    row = c.fetchone()
    c.close()
    db(conn)

    if not row:
        return jsonify({"error": "User not found"}), 404

    total_games = row[8] or 0
    total_wins = row[9] or 0
    
    intellect_score = round((total_wins / total_games * 10), 1) if total_games > 0 else 0.0
    
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

@app_web.route("/api/exeio/test")
def api_exeio_test():
    uid = request.args.get("uid", type=int) or 123
    task_id = request.args.get("task_id", type=int) or 1
    base_target = request.args.get("target", "https://example.com")
    import urllib.parse
    params = "s1={user_id}&s2={task_id}&subid1={user_id}&subid2={task_id}"
    parsed = urllib.parse.urlparse(base_target)
    if parsed.query:
        final_url = base_target + "&" + params
    else:
        final_url = base_target + "?" + params
    u_b64 = base64.urlsafe_b64encode(final_url.encode()).decode()
    success_url = f"{BASE_URL}/exeio/complete?uid={uid}&task_id={task_id}&u={u_b64}"
    short = exeio_shorten(success_url)
    return jsonify({"ok": True, "api_url": EXEIO_API_URL, "short": short, "success_url": success_url})

@app_web.route("/safe_go", methods=["GET"])
def safe_go() -> str:
    primary = request.args.get("direct") or request.args.get("short") or request.args.get("url")
    if primary:
        return redirect(primary)
    return jsonify({"ok": False, "error": "no_target"}), 400
    target_short = request.args.get("short", "")
    target_direct = request.args.get("direct", "")
    target_legacy = request.args.get("url", "")
    display_target = target_short or target_direct or target_legacy
    uid = request.args.get("uid", "")
    task_id = request.args.get("task_id", "")
    try:
        import json
        safe_js_short = json.dumps(target_short)
        safe_js_direct = json.dumps(target_direct)
    except Exception:
        safe_js_short = '""'
        safe_js_direct = '""'
    try:
        import json
        safe_js_uid = json.dumps(uid)
        safe_js_tid = json.dumps(task_id)
    except Exception:
        safe_js_uid = '""'
        safe_js_tid = '""'
    return f"""
    <html>
    <head>
        <title>Start Task</title>
        <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
        <meta http-equiv=\"Cache-Control\" content=\"no-cache, no-store, must-revalidate\" />
        <meta http-equiv=\"Pragma\" content=\"no-cache\" />
        <meta http-equiv=\"Expires\" content=\"0\" />
        <meta name=\"referrer\" content=\"strict-origin-when-cross-origin\">
        <link rel="stylesheet" href="/webapp/tasks/safe_go.css">
    <style>
        body {{
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #e0e0e0;
            font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            min-height: 100vh;
        }}
        .task-card {{
            background: rgba(255,255,255,0.04);
            border: 1px solid rgba(255,255,255,0.1);
            padding: 20px;
            border-radius: 22px;
            backdrop-filter: blur(12px);
            margin-bottom: 20px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            position: relative;
            overflow: hidden;
        }}
        .task-card::before {{
            content: "";
            position: absolute;
            top: 0; left: 0; width: 4px; height: 100%;
            background: linear-gradient(to bottom, transparent, rgba(0, 255, 240, 0.8), transparent);
            opacity: 0.6;
        }}
        h2 {{
            font-size: 24px;
            margin-bottom: 5px;
            background: linear-gradient(90deg, #fff, #a5f3fc);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }}
        h3 {{
            margin: 0 0 15px 0;
            font-size: 18px;
            font-weight: 700;
            background: linear-gradient(90deg, #dff2ff, #8fd8ff, #78b0ff);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            text-shadow: 0 0 15px rgba(0, 210, 255, 0.4);
            letter-spacing: 0.5px;
        }}
        .ubtn {{
            background: radial-gradient(circle at 30% 0%, rgba(255,255,255,0.1), rgba(20,35,75,0.6));
            color: #fff;
            padding: 14px;
            border: 1px solid rgba(170, 200, 255, 0.3);
            border-radius: 14px;
            cursor: pointer;
            font-size: 14px;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            transition: all 0.2s ease;
            text-align: center;
            font-weight: 500;
        }}
        .ubtn:hover {{
            transform: translateY(-3px);
            border-color: rgba(180, 255, 255, 0.8);
            box-shadow: 0 8px 20px rgba(0, 255, 255, 0.25);
            background: radial-gradient(circle at 50% 0%, rgba(0, 240, 255, 0.2), rgba(12, 28, 64, 0.8));
        }}
        .ubtn:active {{
            transform: scale(0.96);
        }}
        .tutorial-scroll {{
            display: flex;
            gap: 15px;
            overflow-x: auto;
            padding-bottom: 10px;
            scrollbar-width: thin;
        }}
        .tutorial-carousel {{
            width: 100%;
            overflow: hidden;
            border: 1px solid rgba(255,255,255,0.12);
            border-radius: 16px;
            background: rgba(255,255,255,0.03);
            padding: 12px;
        }}
        .tutorial-track {{
            display: flex;
            width: 100%;
            transition: transform 0.35s ease;
        }}
        .tutorial-slide {{
            flex: 0 0 100%;
        }}
        .tutorial-image {{
            width: 100%;
            height: 260px;
            object-fit: cover;
            display: block;
            border-radius: 14px;
        }}
        .tutorial-caption {{
            margin-top: 10px;
            padding: 10px 12px;
            font-size: 13px;
            color: #a9bfd3;
            background: rgba(255,255,255,0.04);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 12px;
            line-height: 1.5;
        }}
        .tutorial-controls {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 12px;
            gap: 10px;
        }}
        .tutorial-controls .ubtn {{
            width: 100%;
            padding: 12px;
        }}
        select {{
            background: rgba(0,0,0,0.3) !important;
            border: 1px solid rgba(255,255,255,0.2) !important;
            color: #fff !important;
        }}
    </style>
    </head>
    <body>
        <div style="max-width:480px; width:100%;">
            
            <!-- Header -->
            <div style="text-align:center; margin-bottom:25px;">
                <h2 style="margin:0;">Task Instructions</h2>
                <p style="margin:5px 0 0; color:#8899ac; font-size:14px;">Follow the steps below to complete the task.</p>
            </div>

            <div class="task-card">
                <h3>How to complete:</h3>
                <div id="t-carousel" class="t-carousel">
                    <div id="t-track" class="t-track">
                        <div class="t-slide">
                            <img class="t-image" src="/webapp/tasks/slide/1.jpg" alt="">
                            <div class="t-caption">Шаг 1. Нажмите “Continue”.<br>⚠️ Внимание: при некоторых нажатиях может открываться реклама. Это нормально. Закройте рекламу и нажимайте кнопку снова, пока не перейдёте к следующему шагу.</div>
                        </div>
                        <div class="t-slide">
                            <img class="t-image" src="/webapp/tasks/slide/2.jpg" alt="">
                            <div class="t-caption">Шаг 2. Нажмите “I am not a robot”.<br>⚠️ При случайных нажатиях может открываться реклама. Закройте её и повторите действие, пока не откроется следующий шаг.</div>
                        </div>
                        <div class="t-slide">
                            <img class="t-image" src="/webapp/tasks/slide/3.jpg" alt="">
                            <div class="t-caption">Шаг 3. Пройдите верификацию.<br>⚠️ Появление рекламы — это нормально. Вернитесь назад и продолжайте процесс до открытия следующей страницы.</div>
                        </div>
                        <div class="t-slide">
                            <img class="t-image" src="/webapp/tasks/slide/4.jpg" alt="">
                            <div class="t-caption">Шаг 4. Дождитесь окончания таймера.</div>
                        </div>
                        <div class="t-slide">
                            <img class="t-image" src="/webapp/tasks/slide/5.jpg" alt="">
                            <div class="t-caption">Шаг 5. Нажмите “Get Link”.<br>⚠️ Если откроется реклама, закройте её и снова нажмите кнопку.</div>
                        </div>
                        <div class="t-slide">
                            <img class="t-image" src="/webapp/tasks/slide/6.jpg" alt="">
                            <div class="t-caption">Шаг 6. Нажмите “Open / Открыть”.<br>⚠️ Убедитесь, что открылась именно страница задания, ради которого вы начали процесс. Если откроется реклама — закройте её, перейдите на страницу задания и выполните его согласно условиям.</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Browser Selection Section -->
            <div id="universal-box" class="task-card">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                    <h3 style="margin:0;">Choose Browser</h3>
                    <select id="browser-filter" style="padding:6px 12px; border-radius:8px; outline:none; font-size:12px;">
                        <option value="auto">Auto (Device)</option>
                        <option value="android">Android</option>
                        <option value="ios">iOS</option>
                        <option value="desktop">Desktop</option>
                    </select>
                </div>
                
                <p style="margin:0 0 15px; font-size:13px; color:#ff8a80; background:rgba(255,0,0,0.1); padding:8px; border-radius:8px; text-align:center;">
                    ⚠ Chrome & Safari are not supported.
                </p>

                <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(100px, 1fr)); gap:12px;">
                    <button data-b="system" class="ubtn" style="display:none;">System</button>
                    <button data-b="firefox" class="ubtn">Firefox</button>
                    <button data-b="opera" class="ubtn">Opera</button>
                    <button data-b="operamini" class="ubtn">Opera Mini</button>
                    <button data-b="samsung" class="ubtn">Samsung</button>
                    <button data-b="brave" class="ubtn">Brave</button>
                    <button data-b="yandex" class="ubtn">Yandex</button>
                </div>
            </div>

            <div style="text-align:center; margin-top:20px;">
                 <p style="font-size:12px; color:#556677;">Target: {display_target[:30]}...</p>
                 <a id="manual-link" href="{display_target}" style="display:none; color:#4af; font-size:12px; text-decoration:underline;">Direct Link (Fallback)</a>
            </div>

        </div>
        <div id="iframe-wrap" style="position:fixed; inset:0; background:#000; display:none; z-index:9999;">
            <iframe id="inner-frame" src="about:blank" style="width:100%; height:100%; border:0;" allow="autoplay; fullscreen; clipboard-read; clipboard-write"></iframe>
        </div>
        <script>
            (function(){{
                var shortU = {safe_js_short};
                var directU = {safe_js_direct};
                var uid = {safe_js_uid};
                var tid = {safe_js_tid};
                var isAndroid = /Android/i.test(navigator.userAgent);
                var isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
                var isDesktop = !isAndroid && !isIOS;
                var inTelegram = !!(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe);
                var frameWrap = document.getElementById('iframe-wrap');
                var innerFrame = document.getElementById('inner-frame');
                function sendLog(evt, ok, info){{
                    try {{
                        var payload = {{ url: (shortU||directU)||'', user_id: uid, task_id: tid, evt: evt||'', ok: !!ok, info: info||'', ts: Date.now(), platform: (isAndroid?'android':(isIOS?'ios':'desktop')), in_telegram: inTelegram }};
                        var js = JSON.stringify(payload);
                        if (navigator.sendBeacon) {{
                            var blob = new Blob([js], {{ type: 'application/json' }});
                            navigator.sendBeacon('/api/track_click', blob);
                        }} else {{
                            fetch('/api/track_click', {{ method: 'POST', headers: {{ 'Content-Type': 'application/json' }}, body: js }});
                        }}
                    }} catch(_e){{}}
                }}
                function getIntent(u, pkg){{
                    try {{
                        var url = new URL(u);
                        var scheme = url.protocol.replace(':','') || 'https';
                        var path = url.pathname + (url.search || '');
                        var base = 'intent://' + url.host + path + '#Intent;scheme=' + scheme + ';action=android.intent.action.VIEW';
                        if (pkg) base += ';package=' + pkg;
                        var store = '';
                        if (pkg === 'org.mozilla.firefox') store = 'https://play.google.com/store/apps/details?id=org.mozilla.firefox';
                        else if (pkg === 'com.opera.browser') store = 'https://play.google.com/store/apps/details?id=com.opera.browser';
                        else if (pkg === 'com.opera.mini.native') store = 'https://play.google.com/store/apps/details?id=com.opera.mini.native';
                        else if (pkg === 'com.sec.android.app.sbrowser') store = 'https://play.google.com/store/apps/details?id=com.sec.android.app.sbrowser';
                        else if (pkg === 'com.brave.browser') store = 'https://play.google.com/store/apps/details?id=com.brave.browser';
                        else if (pkg === 'com.yandex.browser') store = 'https://play.google.com/store/apps/details?id=com.yandex.browser';
                        var fallback = store || u;
                        base += ';S.browser_fallback_url=' + encodeURIComponent(fallback);
                        base += ';end';
                        return base;
                    }} catch(e){{
                        return '';
                    }}
                }}
                function stillVisible(){{ try {{ return document.visibilityState !== 'hidden'; }} catch(e){{ return true; }} }}
                function launchIntent(u, pkg){{
                    var link = getIntent(u, pkg);
                    if (!link) return false;
                    try {{
                        var a = document.createElement('a');
                        a.href = link; a.rel = 'noopener'; a.target = '_self';
                        document.body.appendChild(a); a.click(); document.body.removeChild(a);
                        return true;
                    }} catch(e){{
                        try {{ window.location.href = link; return true; }} catch(_e){{}}
                    }}
                    return false;
                }}
                function tryLaunchSequence(u){{
                    var pkgs = ['com.sec.android.app.sbrowser','org.mozilla.firefox','com.opera.browser','com.opera.mini.native','com.yandex.browser','com.brave.browser'];
                    for (var i=0; i<pkgs.length; i++) {{ if (launchIntent(u, pkgs[i])) return true; }}
                    if (launchIntent(u, '')) return true;
                    return false;
                }}
                function openViaForm(u){{
                    try {{
                        var f = document.createElement('form');
                        f.style.display = 'none';
                        f.method = 'GET';
                        f.action = u;
                        f.target = '_blank';
                        document.body.appendChild(f);
                        f.submit();
                        document.body.removeChild(f);
                        return true;
                    }} catch(e){{ return false; }}
                }}
                function openBlankThenNavigate(u){{
                    try {{
                        var w = window.open('about:blank', '_blank', 'noopener');
                        if (w) {{
                            try {{ w.opener = null; }} catch(_o){{}}
                            try {{ w.location.href = u; return true; }} catch(_l){{}}
                        }}
                    }} catch(e){{}}
                    return false;
                }}
                function openIOS(u, scheme, store){{
                    try {{
                        var a = document.createElement('a');
                        a.href = scheme + u; a.rel = 'noopener'; a.target = '_self';
                        document.body.appendChild(a); a.click(); document.body.removeChild(a);
                        if (store) setTimeout(function(){{ try {{ window.location.href = store; }} catch(_s){{}} }}, 800);
                        return true;
                    }} catch(e){{
                        if (store) try {{ window.location.href = store; }} catch(_e){{}}
                        return false;
                    }}
                }}
                
                // Removed legacy btn.addEventListener logic
                
                var browsers = {{
                    firefox: {{ modes: ['android', 'ios', 'desktop'], pkg: 'org.mozilla.firefox', ios: 'firefox', ios_scheme: 'firefox://open-url?url=', ios_store: 'https://apps.apple.com/app/mozilla-firefox/id989804926', url: 'https://www.mozilla.org/firefox/new/' }},
                    opera: {{ modes: ['android', 'desktop'], pkg: 'com.opera.browser', ios: null, url: 'https://www.opera.com/' }},
                    operamini: {{ modes: ['android'], pkg: 'com.opera.mini.native', ios: null, url: 'https://www.opera.com/mobile/mini' }},
                    samsung: {{ modes: ['android'], pkg: 'com.sec.android.app.sbrowser', ios: null, url: 'https://www.samsung.com/app/samsung-internet/' }},
                    brave: {{ modes: ['android', 'ios', 'desktop'], pkg: 'com.brave.browser', ios: 'brave', ios_scheme: 'brave://open-url?url=', ios_store: 'https://apps.apple.com/app/brave-private-web-browser/id1052879175', url: 'https://brave.com/download/' }},
                    yandex: {{ modes: ['android', 'ios', 'desktop'], pkg: 'com.yandex.browser', ios: 'yandex', ios_scheme: 'yandexbrowser://open-url?url=', ios_store: 'https://apps.apple.com/app/yandex-browser/id596305201', url: 'https://browser.yandex.com/' }},
                    system: {{ modes: ['android'], pkg: '', ios: null, url: null }}
                }};

                var filterSelect = document.getElementById('browser-filter');
                var ubtns = document.querySelectorAll('.ubtn');
                
                function updateVisibility() {{
                    var mode = filterSelect ? filterSelect.value : 'auto';
                    if (mode === 'auto') {{
                        if (isAndroid) mode = 'android';
                        else if (isIOS) mode = 'ios';
                        else mode = 'desktop';
                    }}
                    ubtns.forEach(function(b){{
                        var key = b.getAttribute('data-b');
                        var cfg = browsers[key];
                        if (!cfg) return;
                        var show = false;
                        if (cfg.modes && cfg.modes.indexOf(mode) !== -1) show = true;
                        if (key === 'system' && mode !== 'android') show = false;
                        b.style.display = show ? 'inline-block' : 'none';
                    }});
                }}
                
                if (filterSelect) filterSelect.addEventListener('change', function() {{
                    try {{ localStorage.setItem('selectedFilter', filterSelect.value); }} catch(e){{}}
                    updateVisibility();
                }});
                updateVisibility();

                ubtns.forEach(function(b){{
                    var key = b.getAttribute('data-b');
                    b.addEventListener('click', function(){{
                        var cfg = browsers[key];
                        if (!cfg) return;
                        var primary = shortU || directU;
                        sendLog('ubtn_click', true, key);

                        if (isAndroid) {{
                            var pkg = cfg.pkg;
                            launchIntent(primary, pkg);
                            setTimeout(function(){{
                                if (stillVisible()) {{
                                    var store = 'https://play.google.com/store/apps/details?id=' + (pkg || 'org.mozilla.firefox');
                                    if (inTelegram && window.Telegram && window.Telegram.WebApp) {{
                                        try {{ window.Telegram.WebApp.openLink(store, {{ try_instant_view: false }}); }} catch(e){{}}
                                    }}
                                    try {{ window.location.href = store; }} catch(e){{}}
                                }}
                            }}, 500);
                        }} else if (isIOS) {{
                            if (cfg.ios) openIOS(primary, cfg.ios_scheme, cfg.ios_store);
                            else if (cfg.url) window.location.href = cfg.url;
                            else window.location.href = primary;
                        }} else {{
                            // Desktop
                            if (cfg.url) window.open(cfg.url, '_blank');
                            else window.open(primary, '_blank');
                        }}
                    }});
                }});
                var ml = document.getElementById('manual-link');
                if (ml) {{
                    ml.addEventListener('click', function(ev){{
                        ev.preventDefault();
                        sendLog('manual_link_click', true, '')
                        var primary = shortU || directU;
                        var inTelegram = !!(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe);
                        var launched = false;
                        if (!inTelegram) {{
                            var pkgs = ['com.sec.android.app.sbrowser','org.mozilla.firefox','com.opera.browser','com.opera.mini.native','com.yandex.browser'];
                            for (var i=0; i<pkgs.length; i++) {{ if (launchIntent(primary, pkgs[i])) {{ launched = true; break; }} }}
                            if (!launched) {{ launchIntent(primary, ''); }}
                            sendLog('manual_launch_intent', launched, '')
                        }}
                        if (!launched) {{
                            try {{ window.Telegram.WebApp.openLink(primary, {{ try_instant_view: false }}); launched = true; }} catch(_tgM) {{}}
                            sendLog('manual_openLink', launched, '')
                        }}
                        if (!launched && frameWrap && innerFrame) {{
                            try {{ innerFrame.src = primary; frameWrap.style.display = 'block'; sendLog('manual_iframe_fallback', true, ''); }} catch(_mf) {{}}
                        }}
                    }});
                }}

                var tTrack = document.getElementById('tutorial-track');
                var tCaption = document.getElementById('tutorial-caption');
                var tPrev = document.getElementById('tutorial-prev');
                var tNext = document.getElementById('tutorial-next');
                var tIdx = 0;
                var tCaptions = [
                    "Шаг 1. Нажмите “Continue”.\n⚠️ Внимание: при некоторых нажатиях может открываться реклама. Это нормально. Закройте рекламу и нажимайте кнопку снова, пока не перейдёте к следующему шагу.",
                    "Шаг 2. Нажмите “I am not a robot”.\n⚠️ При случайных нажатиях может открываться реклама. Закройте её и повторите действие, пока не откроется следующий шаг.",
                    "Шаг 3. Пройдите верификацию.\n⚠️ Появление рекламы — это нормально. Вернитесь назад и продолжайте процесс до открытия следующей страницы.",
                    "Шаг 4. Дождитесь окончания таймера.",
                    "Шаг 5. Нажмите “Get Link”.\n⚠️ Если откроется реклама, закройте её и снова нажмите кнопку.",
                    "Шаг 6. Нажмите “Open / Открыть”.\n⚠️ Убедитесь, что открылась именно страница задания, ради которого вы начали процесс. Если откроется реклама — закройте её, перейдите на страницу задания и выполните его согласно условиям."
                ];
                function tRender(){{
                    if (tTrack) tTrack.style.transform = 'translateX(' + (-tIdx*100) + '%)';
                    if (tCaption) tCaption.innerHTML = (tCaptions[tIdx]||'').replace(/\n/g,'<br>');
                }}
                if (tPrev) tPrev.addEventListener('click', function(){{ if (tIdx>0) tIdx--; tRender(); }});
                if (tNext) tNext.addEventListener('click', function(){{ if (tIdx<5) tIdx++; tRender(); }});
                var tStartX = 0;
                if (tTrack) {{
                    tTrack.addEventListener('touchstart', function(e){{ if (e.touches && e.touches[0]) tStartX = e.touches[0].clientX; }});
                    tTrack.addEventListener('touchend', function(e){{ var x = (e.changedTouches&&e.changedTouches[0])?e.changedTouches[0].clientX:0; var dx = x - tStartX; if (dx < -30 && tIdx < 5) tIdx++; else if (dx > 30 && tIdx > 0) tIdx--; tRender(); }});
                }}
                tRender();

                // --- Elite layered carousel with finger swipe ---
                var tc = document.getElementById('t-carousel');
                var tt = document.getElementById('t-track');
                var slides = tt ? Array.from(tt.querySelectorAll('.t-slide')) : [];
                var idx = 0;
                var gapPx = 18;
                var peekPx = 0;
                function setActive(){{
                    slides.forEach(function(s,i){{
                        s.classList.remove('is-active','is-next','is-prev','is-far');
                        if (i === idx) s.classList.add('is-active');
                        else if (i === idx+1) s.classList.add('is-next');
                        else if (i === idx-1) s.classList.add('is-prev');
                        else s.classList.add('is-far');
                    }});
                }}
                function layout(){{
                    if (!tc || !tt) return;
                    var W = tc.clientWidth;
                    peekPx = Math.max(260, Math.floor(W*0.86));
                    slides.forEach(function(s){{ s.style.flex = '0 0 ' + peekPx + 'px'; }});
                    tt.style.gap = gapPx + 'px';
                    render();
                }}
                function render(){{
                    if (!tt) return;
                    var offset = -(idx * (peekPx + gapPx));
                    tt.style.transform = 'translateX(' + offset + 'px)';
                    setActive();
                }}
                var startX = 0, dragging = false, baseOffset = 0;
                function onDown(x){{ dragging = true; startX = x; baseOffset = -(idx * (peekPx + gapPx)); tt && (tt.style.transition = 'none'); }}
                function onMove(x){{ if (!dragging || !tt) return; var dx = x - startX; tt.style.transform = 'translateX(' + (baseOffset + dx) + 'px)'; }}
                function onUp(x){{ if (!dragging || !tt) return; dragging = false; tt.style.transition = ''; var dx = x - startX; var t = (peekPx * 0.18);
                    if (dx < -t && idx < slides.length-1) idx++; else if (dx > t && idx > 0) idx--; render(); }}
                if (tt){{
                    tt.addEventListener('touchstart', function(e){{ if (e.touches && e.touches[0]) onDown(e.touches[0].clientX); }}, {{passive:true}});
                    tt.addEventListener('touchmove', function(e){{ if (e.touches && e.touches[0]) onMove(e.touches[0].clientX); }}, {{passive:true}});
                    tt.addEventListener('touchend', function(e){{ var x = (e.changedTouches&&e.changedTouches[0])?e.changedTouches[0].clientX:startX; onUp(x); }});
                    tt.addEventListener('mousedown', function(e){{ onDown(e.clientX); }});
                    window.addEventListener('mousemove', function(e){{ onMove(e.clientX); }});
                    window.addEventListener('mouseup', function(e){{ onUp(e.clientX); }});
                    window.addEventListener('resize', layout);
                    layout();
                }}
                var left = document.getElementById('t-left');
                var right = document.getElementById('t-right');
                if (left) left.addEventListener('click', function(){{ if (idx>0) {{ idx--; render(); }} }});
                if (right) right.addEventListener('click', function(){{ if (idx<slides.length-1) {{ idx++; render(); }} }});
            }})();
        </script>
    </body>
    </html>
    """

@app_web.route("/api/task/generate_link", methods=["POST"])
def api_task_generate_link():
    """
    Generate a unique short link for the user to perform a task.
    """
    data = request.get_json(force=True, silent=True) or {}
    user_id = int(data.get("user_id", 0))
    task_id = int(data.get("task_id", 0))

    if not user_id or not task_id:
        return jsonify({"ok": False, "error": "missing_params"}), 400

    conn = db(); c = conn.cursor()
    c.execute("SELECT url FROM dom_tasks WHERE id=%s", (task_id,))
    row = c.fetchone()
    
    # create attempt and get id
    now = int(time.time())
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
        VALUES (%s, %s, %s) RETURNING id
    """, (user_id, task_id, now))
    attempt_id = c.fetchone()[0]
    release_db(conn)

    if not row:
        return jsonify({"ok": False, "error": "task_not_found"}), 404
    
    # We use the stored URL as the final destination
    final_dest = row[0]

    # Auto-append user_id for tracking (Los Pollos etc)
    if final_dest and "http" in final_dest:
         sep = "&" if "?" in final_dest else "?"
         final_dest += f"{sep}s1={user_id}&user_id={user_id}"

    # Prevent double-shortening: tasks must store FINAL URL, not exe.io short links
    try:
        import urllib.parse
        parsed = urllib.parse.urlparse(final_dest or "")
        if parsed.netloc and 'exe.io' in parsed.netloc:
            return jsonify({"ok": False, "error": "task_url_is_shortened"}), 400
    except Exception:
        pass
    
    # If the stored URL is already an exe.io link (legacy), we can't easily track it
    # unless we know the destination. But assuming the admin puts the REAL target in DB now.
    
    # Construct callback URL
    import urllib.parse
    u_b64 = base64.urlsafe_b64encode(final_dest.encode()).decode()
    callback_url = f"{BASE_URL}/exeio/complete?uid={user_id}&task_id={task_id}&attempt_id={attempt_id}&u={u_b64}"
    
    short_url = None

    # Always return both: exe.io short and direct callback
    try:
        print(f"🟢 generate_link uid={user_id} task_id={task_id} attempt_id={attempt_id} short_url={bool(short_url)}")
    except Exception:
        pass
    return jsonify({"ok": True, "short_url": short_url, "direct_url": callback_url, "attempt_id": attempt_id})

@app_web.route("/exeio/complete")
def exeio_complete():
    uid = request.args.get("uid", type=int)
    task_id = request.args.get("task_id", type=int)
    attempt_id = request.args.get("attempt_id", type=int)
    u_b64 = request.args.get("u", "")
    dest = ""
    try:
        pad = "=" * ((4 - len(u_b64) % 4) % 4)
        dest = base64.urlsafe_b64decode((u_b64 + pad).encode()).decode()
    except Exception:
        dest = "https://google.com"

    now = int(time.time())
    if uid and task_id:
        ref = request.headers.get('Referer', '')
        from_exe = ('exe.io' in (ref or '') or 'exe-links.com' in (ref or ''))
        conn = db(); c = conn.cursor()
        
        # 1. Ensure task exists and get reward
        c.execute("SELECT reward FROM dom_tasks WHERE id=%s", (task_id,))
        t_row = c.fetchone()
        
        if t_row:
            reward = float(t_row[0] or 0)
            
            # 2. Check if already completed
            c.execute("SELECT 1 FROM dom_task_completions WHERE user_id=%s AND task_id=%s", (uid, task_id))
            already_done = c.fetchone()
            
            # Ensure completion record exists
            c.execute(
                """
                INSERT INTO dom_task_completions (user_id, task_id, completed_at)
                VALUES (%s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                (uid, task_id, now)
            )
            # Idempotent award via dom_task_awards
            c.execute(
                """
                CREATE TABLE IF NOT EXISTS dom_task_awards (
                    user_id BIGINT,
                    task_id BIGINT,
                    awarded_at BIGINT,
                    PRIMARY KEY(user_id, task_id)
                )
                """
            )
            if reward > 0:
                c.execute("SELECT 1 FROM dom_task_awards WHERE user_id=%s AND task_id=%s", (uid, task_id))
                already_awarded = bool(c.fetchone())
                if not already_awarded:
                    # Apply 2x multiplier if user has it
                    final_reward = reward
                    c.execute("SELECT has_2x_multiplier FROM dom_users WHERE user_id=%s", (uid,))
                    has_2x = c.fetchone()
                    if has_2x and has_2x[0]:
                        final_reward = reward * 2
                    
                    c.execute("UPDATE dom_users SET balance_usd = COALESCE(balance_usd,0) + %s WHERE user_id=%s", (final_reward, uid))
                    c.execute("INSERT INTO dom_task_awards (user_id, task_id, awarded_at) VALUES (%s, %s, %s)", (uid, task_id, now))
                    
                    # Update daily tasks and check for bonuses
                    update_daily_tasks_and_bonuses(c, uid)
                    
                    conn.commit()
                    print(f"✅ Awarded: uid={uid} task_id={task_id} reward={final_reward} ref={ref} from_exe={from_exe} attempt_id={attempt_id}")
                else:
                    conn.commit()
                    print(f"ℹ️ Already awarded earlier: uid={uid} task_id={task_id} ref={ref} attempt_id={attempt_id}")
            
        release_db(conn)

    if dest:
        try:
            dest_final = (
                dest
                .replace("{user_id}", str(uid or ""))
                .replace("{task_id}", str(task_id or ""))
                .replace("{attempt_id}", str(attempt_id or ""))
            )
        except Exception:
            dest_final = dest
        try:
            import urllib.parse
            u = urllib.parse.urlsplit(dest_final or dest)
            q = urllib.parse.parse_qsl(u.query, keep_blank_values=True)
            changed = False
            new_q = []
            for k, v in q:
                if k.lower() == 'cid' and (not v or v.lower() in ('cid','{attempt_id}','attempt_id')):
                    new_q.append((k, str(attempt_id or "")))
                    changed = True
                else:
                    new_q.append((k, v))
            if changed:
                dest_final = urllib.parse.urlunsplit((u.scheme, u.netloc, u.path, urllib.parse.urlencode(new_q), u.fragment))
            if (u.path or '').endswith('/webapp/tasks/safe_go.html') or (u.path or '').endswith('/safe_go'):
                direct = None
                for key in ('direct','short','url'):
                    for k, v in q:
                        if k == key and v:
                            direct = v
                            break
                    if direct:
                        break
                if direct:
                    dest_final = direct
        except Exception:
            pass
        return redirect(dest_final)
    
    return "✅ Task Completed! You can close this window."

@app_web.route("/api/task/status")
def api_task_status():
    uid = request.args.get("uid", type=int)
    task_id = request.args.get("task_id", type=int)
    if not uid or not task_id:
        return jsonify({"ok": False, "error": "bad_params"}), 400
    conn = db(); c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS dom_task_attempts (
            id SERIAL PRIMARY KEY,
            user_id BIGINT,
            task_id BIGINT,
            created_at BIGINT
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS dom_task_completions (
            user_id BIGINT,
            task_id BIGINT,
            completed_at BIGINT
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS dom_task_awards (
            user_id BIGINT,
            task_id BIGINT,
            awarded_at BIGINT,
            PRIMARY KEY(user_id, task_id)
        )
    """)
    c.execute("SELECT COUNT(*) FROM dom_task_attempts WHERE user_id=%s AND task_id=%s", (uid, task_id))
    attempts = int(c.fetchone()[0] or 0)
    c.execute("SELECT 1 FROM dom_task_completions WHERE user_id=%s AND task_id=%s", (uid, task_id))
    completed = bool(c.fetchone())
    c.execute("SELECT 1 FROM dom_task_awards WHERE user_id=%s AND task_id=%s", (uid, task_id))
    awarded = bool(c.fetchone())
    c.execute("SELECT reward FROM dom_tasks WHERE id=%s", (task_id,))
    r = c.fetchone()
    reward = float(r[0] or 0) if r else 0.0
    c.execute("SELECT balance_usd FROM dom_users WHERE user_id=%s", (uid,))
    ub = c.fetchone()
    balance = float(ub[0] or 0) if ub else 0.0
    try:
        conn.commit()
    except Exception:
        pass
    release_db(conn)
    return jsonify({"ok": True, "user_id": uid, "task_id": task_id, "attempts": attempts, "completed": completed, "awarded": awarded, "reward": reward, "balance_usd": balance})

@app_web.route('/api/track_click', methods=['POST'])
def api_track_click():
    data = request.get_json(silent=True) or {}
    url = data.get('url', '')
    user_id = int(data.get('user_id') or 0)
    task_id = int(data.get('task_id') or 0)
    evt = str(data.get('evt') or '')
    ok = bool(data.get('ok'))
    info = str(data.get('info') or '')
    platform = str(data.get('platform') or '')
    in_tg = bool(data.get('in_telegram'))
    ts = int(data.get('ts') or int(time.time()))
    ua = request.headers.get('User-Agent', '')
    ref = request.headers.get('Referer', '')
    conn = db(); c = conn.cursor()
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS dom_click_events (
            id SERIAL PRIMARY KEY,
            user_id BIGINT,
            task_id BIGINT,
            url TEXT,
            evt TEXT,
            ok BOOLEAN,
            info TEXT,
            ua TEXT,
            referer TEXT,
            platform TEXT,
            in_telegram BOOLEAN,
            ts BIGINT,
            created_at BIGINT
        )
        """
    )
    now = int(time.time())
    c.execute(
        """
        INSERT INTO dom_click_events (user_id, task_id, url, evt, ok, info, ua, referer, platform, in_telegram, ts, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (user_id, task_id, url, evt, ok, info, ua, ref, platform, in_tg, ts, now)
    )
    conn.commit()
    release_db(conn)
    print(f"🟦 CLICK evt={evt} ok={ok} uid={user_id} tid={task_id} platform={platform} tg={in_tg} url={url} ref={ref}")
    return jsonify({"ok": True})

def migrate_posts_to_files():
    """Migrate posts media from base64 to file system"""
    print("🔍 Starting posts media migration...")
    
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
    
    cursor.close()
    conn.close()
    
    print("🎉 Migration complete!")

# ================= CPX RESEARCH INTEGRATION =================

@app_web.route("/api/postback/cpx", methods=["GET", "POST"])
def api_postback_cpx():
    """
    Endpoint for CPX Research postbacks.
    CPX calls this URL when a user completes a survey.
    URL: https://domino-play.online/api/postback/cpx
    """
    try:
        # CPX sends parameters in query string (GET) or body (POST)
        data = request.args if request.method == "GET" else request.form
        
        status = data.get("status")
        trans_id = data.get("trans_id")
        user_id = data.get("user_id") or data.get("ext_user_id")
        
        # We prefer amount_usd if available, otherwise amount_local
        amount_usd = data.get("amount_usd")
        amount_local = data.get("amount_local")
        
        req_hash = data.get("hash")
        
        # 1. Validation
        if not all([status, trans_id, user_id, req_hash]):
            return "Missing parameters", 400
            
        # Determine amount
        if amount_usd:
            amount = float(amount_usd)
        elif amount_local:
            amount = float(amount_local)
        else:
            return "Missing amount", 400
            
        # 2. Verify Hash: MD5(trans_id + "-" + CPX_SECURE_HASH)
        if CPX_SECURE_HASH == "YOUR_SECURE_HASH":
            logger.warning("CPX Postback: Secure Hash not set. Skipping verification.")
        else:
            calc_str = f"{trans_id}-{CPX_SECURE_HASH}"
            calc_hash = hashlib.md5(calc_str.encode()).hexdigest()
            if calc_hash != req_hash:
                logger.error(f"CPX Postback: Hash mismatch. Req: {req_hash}, Calc: {calc_hash}")
                return "Invalid Hash", 403

        # 3. Process Logic
        uid = int(user_id)
        amt = float(amount)
        
        conn = db()
        c = conn.cursor()
        
        # Check if transaction already processed
        c.execute("SELECT 1 FROM dom_deposits WHERE status = 'cpx_' || %s", (trans_id,))
        if c.fetchone():
            release_db(conn)
            return "OK", 200 # Already processed
            
        if status == '1': # Credit
            now = int(time.time())
            credited = amt * 0.5
            c.execute("""
                INSERT INTO dom_deposits (user_id, amount_usd, status, created_at)
                VALUES (%s, %s, %s, %s)
            """, (uid, credited, f"cpx_{trans_id}", now))
            
            # Update user balance
            c.execute("""
                UPDATE dom_users 
                SET balance_usd = COALESCE(balance_usd, 0) + %s,
                    total_deposit_usd = COALESCE(total_deposit_usd, 0) + %s
                WHERE user_id = %s
            """, (credited, credited, uid))
            
            conn.commit()
            
            try:
                realtime_emit("balance_update", {
                    "user_id": uid,
                    "amount": credited,
                    "source": "cpx"
                }, room=f"user_{uid}")
            except Exception as e:
                logger.error(f"Socket emit error: {e}")
                
        elif status == '2': # Chargeback
            now = int(time.time())
            credited = amt * 0.5
            c.execute("""
                INSERT INTO dom_deposits (user_id, amount_usd, status, created_at)
                VALUES (%s, %s, %s, %s)
            """, (uid, -credited, f"cpx_cb_{trans_id}", now))
            
            c.execute("""
                UPDATE dom_users 
                SET balance_usd = GREATEST(COALESCE(balance_usd, 0) - %s, 0),
                    total_deposit_usd = GREATEST(COALESCE(total_deposit_usd, 0) - %s, 0)
                WHERE user_id = %s
            """, (credited, credited, uid))
            conn.commit()
            
        release_db(conn)
        
        return "OK", 200
        
    except Exception as e:
        logger.exception("CPX Postback Error")
        return "Error", 500


# Portal settings API
@app_web.route("/api/portal_status", methods=["GET"])
def get_portal_status():
    """Get portal enabled/disabled status"""
    try:
        conn = db()
        c = conn.cursor()
        
        # Create portal_settings table if not exists
        c.execute("""
            CREATE TABLE IF NOT EXISTS dom_portal_settings (
                key TEXT PRIMARY KEY,
                value TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Get portal status
        c.execute("SELECT value FROM dom_portal_settings WHERE key = 'portal_enabled'")
        result = c.fetchone()
        
        if result:
            portal_enabled = result[0] == 'true'
        else:
            # Default to enabled
            portal_enabled = True
            c.execute("""
                INSERT INTO dom_portal_settings (key, value) 
                VALUES ('portal_enabled', 'true')
            """)
            conn.commit()
        
        release_db(conn)
        
        return jsonify({
            "ok": True,
            "portal_enabled": portal_enabled
        })
        
    except Exception as e:
        logger.exception("Portal status error")
        return jsonify({"ok": False, "error": str(e)}), 500


@app_web.route("/api/portal_toggle", methods=["POST"])
def toggle_portal():
    """Toggle portal enabled/disabled status"""
    try:
        data = request.get_json()
        if not data or "enabled" not in data:
            return jsonify({"ok": False, "error": "enabled parameter required"}), 400
        
        enabled = data["enabled"]
        if not isinstance(enabled, bool):
            return jsonify({"ok": False, "error": "enabled must be boolean"}), 400
        
        conn = db()
        c = conn.cursor()
        
        # Create portal_settings table if not exists
        c.execute("""
            CREATE TABLE IF NOT EXISTS dom_portal_settings (
                key TEXT PRIMARY KEY,
                value TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Update portal status
        c.execute("""
            INSERT INTO dom_portal_settings (key, value, updated_at) 
            VALUES ('portal_enabled', %s, CURRENT_TIMESTAMP)
            ON CONFLICT (key) DO UPDATE SET 
                value = EXCLUDED.value,
                updated_at = CURRENT_TIMESTAMP
        """, (str(enabled).lower(),))
        
        conn.commit()
        release_db(conn)
        
        logger.info(f"Portal status toggled to: {enabled}")
        
        return jsonify({
            "ok": True,
            "portal_enabled": enabled,
            "message": f"Portal {'enabled' if enabled else 'disabled'} successfully"
        })
        
    except Exception as e:
        logger.exception("Portal toggle error")
        return jsonify({"ok": False, "error": str(e)}), 500


if __name__ == "__main__":
    print("✅ Domino bot script loaded.")
    try:
        init_db()
        ensure_leaderboard_tables()
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
        
    def run_bot():
        """
        Telegram-бот работает в отдельном потоке со своим собственным циклом событий, по той же самой схеме, что и в VORN.
        """
        global bot_loop
        try:
            print("🤖 Starting Domino Telegram bot thread ...")
            
            # Start pyrogram client if available
            if PYROGRAM_API_ID and PYROGRAM_API_HASH:
                print("🔍 Starting Pyrogram client for page verification...")
                
                async def start_pyrogram():
                    global pyrogram_client
                    try:
                        # Validate API_ID
                        api_id = int(PYROGRAM_API_ID)
                        if api_id <= 0:
                            raise ValueError("API_ID must be a positive integer")
                        
                        # Create client for bot (not user account)
                        pyrogram_client = Client(
                            "domino_page_checker",
                            api_id=api_id,
                            api_hash=PYROGRAM_API_HASH,
                            bot_token=BOT_TOKEN,  # Use bot token instead of phone
                            sleep_threshold=60,  # Add sleep threshold for flood protection
                            no_updates=True,      # Don't receive updates to reduce load
                        )
                        
                        # Start the client with retry logic for flood wait
                        max_retries = 3
                        for attempt in range(max_retries):
                            try:
                                await pyrogram_client.start()
                                print("✅ Pyrogram client started successfully")
                                return True
                            except FloodWait as e:
                                if attempt < max_retries - 1:
                                    wait_time = e.value + 5  # Add extra buffer
                                    print(f"⏳ Flood wait detected, waiting {wait_time} seconds... (attempt {attempt + 1}/{max_retries})")
                                    await asyncio.sleep(wait_time)
                                else:
                                    raise
                            
                    except Exception as e:
                        print(f"❌ Failed to start Pyrogram client: {e}")
                        logger.error(f"Failed to start Pyrogram client: {e}")
                        pyrogram_client = None
                        return False
                
                # Run pyrogram in its own thread with event loop
                def run_pyrogram_thread():
                    global pyrogram_queue, pyrogram_loop
                    import queue
                    
                    print("🔄 Initializing pyrogram thread...")
                    # Create queue for inter-thread communication
                    pyrogram_queue = queue.Queue()
                    print(f"✅ Queue created: {pyrogram_queue}")
                    
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    pyrogram_loop = loop
                    print(f"✅ Event loop created: {loop}")
                    
                    async def handle_queue_requests():
                        """Handle requests from other threads"""
                        while True:
                            try:
                                # Wait for request with timeout
                                request_data = pyrogram_queue.get(timeout=0.1)
                                request_id = request_data.get('request_id')
                                logger.info(f"Pyrogram thread received request: {request_data}")
                                
                                if request_data['type'] == 'check_membership':
                                    try:
                                        member = await pyrogram_client.get_chat_member(
                                            request_data['page_username'], 
                                            request_data['user_id']
                                        )
                                        
                                        # Convert status to string for comparison
                                        status_str = str(member.status).upper()
                                        logger.info(f"Status string: {status_str}")
                                        logger.info(f"Raw status type: {type(member.status)}")
                                        logger.info(f"Raw status value: {member.status}")
                                        
                                        # Check if user has valid membership status (not left or banned)
                                        invalid_statuses = ['LEFT', 'BANNED', 'KICKED', 'RESTRICTED']
                                        is_invalid = status_str in invalid_statuses
                                        is_member = not is_invalid
                                        
                                        logger.info(f"Invalid statuses: {invalid_statuses}")
                                        logger.info(f"Is {status_str} in invalid_statuses? {is_invalid}")
                                        logger.info(f"Final is_member: {is_member}")
                                        
                                        pyrogram_results[request_id] = {
                                            'is_member': is_member,
                                            'status': status_str
                                        }
                                        logger.info(f"Pyrogram check completed for {request_data['page_username']}: {status_str} (is_member: {is_member})")
                                    except ChannelPrivate:
                                        pyrogram_results[request_id] = {
                                            'is_member': False,
                                            'error': 'ChannelPrivate'
                                        }
                                        logger.warning(f"Channel {request_data['page_username']} is private")
                                    except UserBannedInChannel:
                                        pyrogram_results[request_id] = {
                                            'is_member': False,
                                            'error': 'UserBannedInChannel'
                                        }
                                        logger.info(f"User {request_data['user_id']} banned in {request_data['page_username']}")
                                    except Exception as e:
                                        # Check if it's USER_NOT_PARTICIPANT (user not following)
                                        if "USER_NOT_PARTICIPANT" in str(e) or "not a member" in str(e):
                                            pyrogram_results[request_id] = {
                                                'is_member': False,
                                                'error': 'USER_NOT_PARTICIPANT'
                                            }
                                            logger.info(f"User {request_data['user_id']} is not member of {request_data['page_username']}")
                                        else:
                                            pyrogram_results[request_id] = {
                                                'is_member': False,
                                                'error': str(e)
                                            }
                                            logger.error(f"Error checking {request_data['page_username']}: {e}")
                                
                            except queue.Empty:
                                # No request in queue, continue loop
                                continue
                            except Exception as e:
                                logger.error(f"Error handling queue request: {e}")
                                continue
                    
                    async def start_pyrogram_with_queue():
                        print("🔄 Starting pyrogram with queue handler...")
                        success = await start_pyrogram()
                        if not success:
                            print("❌ Pyrogram client failed to start, queue handler not started")
                            return
                        
                        print("✅ Pyrogram client started, starting queue handler...")
                        # Start queue handler after pyrogram is ready
                        task = asyncio.create_task(handle_queue_requests())
                        print("✅ Queue handler started")
                        # Keep the task alive
                        await task
                    
                    loop.run_until_complete(start_pyrogram_with_queue())
                
                import threading
                pyrogram_thread = threading.Thread(target=run_pyrogram_thread, daemon=True)
                pyrogram_thread.start()
            
            bot_loop = asyncio.new_event_loop()
            asyncio.set_event_loop(bot_loop)
            bot_loop.run_until_complete(start_bot_webhook())
            bot_loop.run_forever()
        except Exception as e:
            print("🔥 Telegram bot failed:", e)

    # === START TELEGRAM BOT FIRST ===
    bot_thread = threading.Thread(target=run_bot, daemon=True)
    bot_thread.start()

    print("⏳ Waiting for Telegram bot to be ready...")
    while bot_loop is None:
        time.sleep(0.2)

    print("✅ Telegram bot event loop is ready.")

    # ✅ START BACKGROUND THREADS BEFORE FLASK (IMPORTANT!)
    threading.Thread(target=ton_rate_updater, daemon=True).start()
    threading.Thread(target=auto_fake_withdrawal_worker, daemon=True).start()

    run_flask()
    print("🚀 Domino Flask + Telegram bot started.")

    
