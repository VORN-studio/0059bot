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

BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()
if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN env var is missing")

PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "").strip()
if not PUBLIC_BASE_URL:
    PUBLIC_BASE_URL = "https://domino-backend-iavj.onrender.com"

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL env var is missing (PostgreSQL connection string)")

ADMIN_IDS = {5274439601} 
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEBAPP_DIR = os.path.join(BASE_DIR, "webapp")
DOMIT_PRICE_USD = 1  # DOMIT հիմա նույնն է, ինչ $ (միայն տեքստով տարբեր)
PORTAL_DIR = os.path.join(WEBAPP_DIR, "portal")
TASKS_DIR = os.path.join(WEBAPP_DIR, "tasks")
GAMES_DIR = os.path.join(WEBAPP_DIR, "games")


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

@app_web.route("/webapp/uploads/<path:filename>")
def serve_uploads(filename):
    return send_from_directory(os.path.join(WEBAPP_DIR, "uploads"), filename)


@app_web.route("/api/message/send", methods=["POST"])
def api_message_send():
    data = request.get_json(force=True, silent=True) or {}
    sender = int(data.get("sender", 0))
    receiver = int(data.get("receiver", 0))
    text = data.get("text", "").strip()

    if sender == 0 or receiver == 0 or text == "":
        return jsonify({"ok": False, "error": "bad_params"}), 400

    now = int(time.time())
    conn = db(); c = conn.cursor()
    c.execute("""
        INSERT INTO dom_messages (sender, receiver, text, created_at)
        VALUES (%s, %s, %s, %s)
    """, (sender, receiver, text, now))
    conn.commit()
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
        SELECT sender, receiver, text, created_at
        FROM dom_messages
        WHERE (sender=%s AND receiver=%s) OR (sender=%s AND receiver=%s)
        ORDER BY id DESC
        LIMIT 50
    """, (u1, u2, u2, u1))

    rows = c.fetchall()
    release_db(conn)

    messages = []
    for r in rows:
        messages.append({
            "sender": r[0],
            "receiver": r[1],
            "text": r[2],
            "time": r[3]
        })

    messages.reverse()  # նամակները cronological կարգով

    return jsonify({"ok": True, "messages": messages})

@app_web.route("/api/global/send", methods=["POST"])
def api_global_send():
    data = request.get_json(force=True, silent=True) or {}
    sender = int(data.get("sender", 0))
    text = data.get("text", "").strip()

    if sender == 0 or text == "":
        return jsonify({"ok": False, "error": "bad_params"}), 400

    now = int(time.time())
    conn = db(); c = conn.cursor()
    c.execute("""
        INSERT INTO dom_global_chat (sender, text, created_at)
        VALUES (%s, %s, %s)
    """, (sender, text, now))
    conn.commit()
    release_db(conn)

    return jsonify({"ok": True})

@app_web.route("/api/global/history")
def api_global_history():
    conn = db(); c = conn.cursor()
    c.execute("""
        SELECT sender, text, created_at
        FROM dom_global_chat
        ORDER BY id DESC
        LIMIT 100
    """)

    rows = c.fetchall()
    release_db(conn)

    messages = []
    for r in rows:
        messages.append({
            "sender": r[0],
            "text": r[1],
            "time": r[2]
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
        SELECT u.user_id, u.username, u.avatar, u.avatar_data
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

    # file type extract (png, jpg, jpeg)
    content_type = file.mimetype  # e.g. "image/png", "image/jpeg"

    # read file and convert to base64
    import base64
    raw = file.read()
    b64 = base64.b64encode(raw).decode("utf-8")

    # full "data:image/xxx;base64,...."
    avatar_data = f"data:{content_type};base64,{b64}"

    # save into database
    conn = db(); 
    c = conn.cursor()
    c.execute("""
        UPDATE dom_users
        SET avatar_data = %s
        WHERE user_id = %s
    """, (avatar_data, uid))
    conn.commit()
    conn.close()

    return jsonify({"ok": True})



@app_web.route("/api/search_users")
def api_search_users():
    q = request.args.get("q", "").strip().lower()

    conn = db(); c = conn.cursor()

    if q == "":
        c.execute("""
            SELECT user_id, username, avatar
            FROM dom_users
            ORDER BY user_id DESC
            LIMIT 50
        """)
    else:
        c.execute("""
            SELECT user_id, username, avatar
            FROM dom_users
            WHERE LOWER(username) LIKE %s
            ORDER BY user_id DESC
            LIMIT 50
        """, (f"%{q}%",))

    rows = c.fetchall()
    release_db(conn)

    viewer = request.args.get("viewer")

    users = []
    for u in rows:
        if viewer and str(u[0]) == str(viewer):
            continue   # skip own profile

        users.append({
            "user_id": u[0],
            "username": u[1] or "",
            "avatar": u[2] or "/portal/default.png"
        })

    return jsonify({"ok": True, "users": users})


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

@app_web.route("/portal/<path:filename>")
def serve_portal(filename):
    return send_from_directory(PORTAL_DIR, filename)


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
    conn.close()

    return jsonify({"ok": True})

@app_web.route("/api/follow", methods=["POST"])
def api_follow():
    data = request.get_json()
    follower = int(data.get("follower"))
    target = int(data.get("target"))

    ADMIN_ID = 5274439601

    if follower == target:
        return jsonify({"ok": False, "error": "cannot_follow_self"}), 200

    conn = db(); c = conn.cursor()

    # 👉 ՍՏԵՂԵՑ՝ ՍԿԶԲՈՒՄ ստուգում ենք՝ արդյո՞ք արդեն follow արած է
    c.execute("""
        SELECT 1 FROM dom_follows
        WHERE follower = %s AND target = %s
    """, (follower, target))
    already = c.fetchone()
    if already:
        # արդեն follow արած է, գումար չենք հանում, ուղղակի OK ենք տալիս
        release_db(conn)
        return jsonify({"ok": True, "already": True}), 200

    # --- check follower balance ---
    c.execute("SELECT balance_usd FROM dom_users WHERE user_id=%s", (follower,))
    row = c.fetchone()
    if not row:
        release_db(conn)
        return jsonify({"ok": False, "error": "user_not_found"}), 404

    balance = float(row[0])

    FOLLOW_PRICE = 5.0
    PAY_TARGET = 3.0
    PAY_ADMIN  = 2.0

    if balance < FOLLOW_PRICE:
        release_db(conn)
        return jsonify({"ok": False, "error": "low_balance"}), 200

    # --- subtract exactly 5 DOMIT ---
    c.execute("""
        UPDATE dom_users
        SET balance_usd = balance_usd - %s
        WHERE user_id=%s
    """, (FOLLOW_PRICE, follower))

    # --- add 3 DOMIT to target ---
    c.execute("""
        UPDATE dom_users
        SET balance_usd = balance_usd + %s
        WHERE user_id=%s
    """, (PAY_TARGET, target))

    # --- add 2 DOMIT to admin ---
    c.execute("""
        UPDATE dom_users
        SET balance_usd = balance_usd + %s
        WHERE user_id=%s
    """, (PAY_ADMIN, ADMIN_ID))

    # --- register follow ---
    c.execute("""
        INSERT INTO dom_follows (follower, target)
        VALUES (%s, %s)
        ON CONFLICT DO NOTHING
    """, (follower, target))

    conn.commit()
    release_db(conn)

    return jsonify({"ok": True}), 200



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
    Body: { "user_id": ..., "text": "...", "media_url": optional }
    """
    data = request.get_json(force=True, silent=True) or {}
    user_id = int(data.get("user_id", 0))
    text = (data.get("text") or "").strip()
    media_url = (data.get("media_url") or "").strip()

    if not user_id or text == "":
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
    release_db(conn)

    return jsonify({"ok": True, "post_id": pid})

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
        SELECT p.id, p.user_id, u.username, u.avatar, u.avatar_data,
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
        pid, uid, username, avatar, avatar_data, text, media_url, likes, created_at = r
        if avatar_data:
            avatar_url = avatar_data
        else:
            avatar_url = avatar or "/portal/default.png"

        posts.append({
            "id": pid,
            "user_id": uid,
            "username": username or "",
            "avatar": avatar_url,
            "text": text,
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
        SELECT p.id, p.user_id, u.username, u.avatar, u.avatar_data,
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
        pid, uid, username, avatar, avatar_data, text, media_url, likes, created_at = r
        if avatar_data:
            avatar_url = avatar_data
        else:
            avatar_url = avatar or "/portal/default.png"

        posts.append({
            "id": pid,
            "user_id": uid,
            "username": username or "",
            "avatar": avatar_url,
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
    release_db(conn)

    return jsonify({"ok": True}), 200


@app_web.route("/api/upload_post_media", methods=["POST"])
def api_upload_post_media():
    from werkzeug.utils import secure_filename
    import base64, time

    uid = request.form.get("uid")
    file = request.files.get("file")

    if not uid or not file:
        return jsonify({"ok": False, "error": "missing"}), 400

    ext = file.filename.rsplit(".", 1)[-1].lower()
    safe_name = secure_filename(f"{uid}_{int(time.time())}.{ext}")

    save_path = os.path.join(WEBAPP_DIR, "uploads")
    os.makedirs(save_path, exist_ok=True)

    full = os.path.join(save_path, safe_name)
    file.save(full)

    url = f"/webapp/uploads/{safe_name}"

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
    "ALTER TABLE dom_users ADD COLUMN IF NOT EXISTS last_rate NUMERIC(20,6) DEFAULT 0",
    "ALTER TABLE dom_users ADD COLUMN IF NOT EXISTS avatar TEXT",
    "ALTER TABLE dom_users ADD COLUMN IF NOT EXISTS avatar_data TEXT"
    
]

def init_db():
    """
    Creates base tables and applies ALTER patches safely.
    """
    print("🛠️ init_db() — Domino")

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
            print("Applied:", sql)
        except Exception as e:
            print("Skip alter:", sql, "Reason:", e)

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
            sender BIGINT,
            text TEXT,
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

        # --- DOMINO MINING TABLES ---

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
            created_at BIGINT
        )
    """)

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


    # Եթե պլանների աղյուսակը դատարկ է → լցնում ենք մեր 10 tier-երը
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
        duration_hours = 60 * 24   # 60 օր = 1440 ժամ
        return_mult = 1.5          # 1.5x

        for tier, name, price in plans:
            c.execute("""
                INSERT INTO dom_mining_plans (tier, name, price_usd, duration_hours, return_mult, created_at)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (tier, name, price, duration_hours, return_mult, now))
        print("💎 Mining plans initialized (10 tiers).")

        # --- ALWAYS update plan names by tier (rename existing rows as well) ---
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
    print("✅ Domino tables ready with applied patches!")

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
               COALESCE(last_rate,0)
        FROM dom_users
        WHERE user_id=%s
    """, (user_id,))

    row = c.fetchone()
    if not row:
        release_db(conn)
        return None

    (username, avatar, avatar_data, balance_usd, total_dep, total_wd, ton_balance, last_rate) = row

        # --- STATUS from mining plans (max tier) ---
    c.execute("""
        SELECT COALESCE(MAX(p.tier), 0)
        FROM dom_user_miners m
        JOIN dom_mining_plans p ON m.plan_id = p.id
        WHERE m.user_id = %s
    """, (user_id,))
    status_row = c.fetchone()
    status_level = int(status_row[0] or 0)

    # ցանկութամբ — անուն ըստ tier
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
        # 🔥 STATUS FIELDS
        "status_level": int(status_level),
        "status_name": status_name,
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

        total_return_usd = price_usd * return_mult      # ընդհանուր վերադարձ USD-ով
        usd_per_hour = total_return_usd / duration_hours  # USD / ժամ

        plans.append({
            "id": pid,
            "tier": tier,
            "name": name,
            "price_usd": price_usd,
            "duration_hours": duration_hours,
            "return_mult": return_mult,
            "total_return_usd": total_return_usd,
            "usd_per_hour": usd_per_hour,
            # Եթե mining.js-ում դեռ օգտագործում ես plan.domit_per_hour,
            # կարող ես պահել որպես նույն թիվը.
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
        return 0.0, 0, 0.0  # reward, miners_count, new_balance

    total_reward = 0.0
    updated_ids = []

    for m in miners:
        reward, new_last = calc_miner_pending(m, now)
        if reward > 0:
            total_reward += reward
            updated_ids.append((m["id"], new_last))

    if total_reward <= 0:
        # ոչինչ չկուտակվեց
        stats = get_user_stats(user_id)
        new_balance = stats["balance_usd"] if stats else 0.0
        return 0.0, len(miners), new_balance

    conn = db(); c = conn.cursor()

    # Թարմացնում ենք last_claim_at-երը
    for mid, new_last in updated_ids:
        c.execute("""
            UPDATE dom_user_miners
               SET last_claim_at = %s
             WHERE id = %s
        """, (new_last, mid))

    # Ավելացնում ենք օգուտը օգտատիրոջ USD balance-ի վրա
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
    else:
        stats["avatar"] = "/portal/default.png"

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
    """, (amount, user_id))
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

    return jsonify({"ok": True})

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
    conn.close()

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
    conn.close()

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

    # ստուգում ենք օգտատերը կա՞
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

    # հանում ենք գումարը հիմնական բալանսից
    c.execute("""
        UPDATE dom_users
           SET balance_usd = COALESCE(balance_usd,0) - %s
         WHERE user_id = %s
    """, (price_usd, user_id))

    # գրանցում ենք miner-ը
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
        # մայնինգից վերցրած գումարը՝ ՄԻԱՅՆ USD
        "claimed_usd": reward_usd,
        # եթե front-ում դեռ սպասում ես այս դաշտին, կարող ես թողնել 1:1 նույն թիվը
        # "claimed_domit": reward_usd,
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
        reward, _ = calc_miner_pending(m, now)  # reward = USD
        total_pending += reward
        miners_view.append({
            **m,
            "pending_usd": reward,
            # frontend-ը հիմա էլի կարող է օգտագործել pending_domit,
            # բայց այստեղ դա նույնն է, ինչ pending_usd (1 = 1)
            "pending_domit": reward,
        })

    state = None
    if miners_view:
        first = miners_view[0]
        # reward_per_second_usd → ուղիղ USD/վրկ, ուրեմն * 3600 = USD/ժամ
        speed_per_hour = first["reward_per_second_usd"] * 3600.0
        state = {
            "tier": first["tier"],
            # speed – էլի USD/ժամ, եթե ուզում ես՝ frontend-ում կարող ես գրիլ "DOMIT/ժամ"
            "speed": round(speed_per_hour, 2),
            # ընդհանուր կուտակված USD, 1:1 նույնը կարող ես DOMIT համարել
            "earned": total_pending,
        }

    return jsonify({
        "ok": True,
        "user": stats,
        "plans": plans,
        "miners": miners_view,
        "total_pending_usd": total_pending,
        # եթե front-ում դեռ սպասում ես total_pending_domit դաշտին → պահում ենք նույն թիվը
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

import requests

def keep_alive():
    print("🟢 Keep-alive thread started")
    url = f"{PUBLIC_BASE_URL}/"
    while True:
        try:
            r = requests.get(url, timeout=10)
            print("🔄 Keep-alive ping:", r.status_code)
        except Exception as e:
            print("❌ Keep-alive error:", e)

        time.sleep(240)  

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
                time.sleep(15)
                continue

            conn = db()
            c = conn.cursor()
            c.execute("""
                UPDATE dom_users
                SET last_rate = %s
            """, (rate,))
            conn.commit()
            release_db(conn)
            print("💹 last_rate updated in DB:", rate)

        except Exception as e:
            print("🔥 TON updater crashed:", e)

        time.sleep(15)

application = None  
bot_loop = None     

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
    wa_url = f"{PUBLIC_BASE_URL}/app?uid={user.id}"

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

    await application.initialize()

    port = int(os.environ.get("PORT", "10000"))
    webhook_url = f"{PUBLIC_BASE_URL}/webhook"

    await application.bot.delete_webhook(drop_pending_updates=True)
    await application.bot.set_webhook(url=webhook_url)

    print(f"✅ Webhook set to {webhook_url}")

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
        print("🔥 Webhook error:", e)
        return jsonify({"ok": False, "error": str(e)}), 500

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
            bot_loop.run_until_complete(start_bot_webhook())
            bot_loop.run_forever()
        except Exception as e:
            print("🔥 Telegram bot failed:", e)

    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()

    bot_thread = threading.Thread(target=run_bot, daemon=True)
    bot_thread.start()

    ton_thread = threading.Thread(target=ton_rate_updater, daemon=True)
    ton_thread.start()

    keepalive_thread = threading.Thread(target=keep_alive, daemon=True)
    keepalive_thread.start()

    print("🚀 Domino Flask + Telegram bot started.")

    while True:
        time.sleep(60)
