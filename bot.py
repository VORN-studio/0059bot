#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
MainMoney Earn Platform Bot
===========================

⚠ Demo-level, but already quite powerful:
- User registration + referrals (/start ref_USERID)
- SQLite database
- Internal coins balance + TON wallet field
- Tasks system (admin adds tasks, users complete, earn coins)
- Withdraw requests (coins → TON, manually processed by admin)
- WebApp integration via Telegram WebApp.sendData
- Admin commands: add tasks, edit balances, list withdraws, approve/reject, broadcast

You must:
- Install python-telegram-bot v20+:
    pip install python-telegram-bot==20.7

- Run:  python bot.py
"""

import os
import time
import json
import sqlite3
import logging
from datetime import datetime

from telegram import (
    Update,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    ReplyKeyboardMarkup,
    WebAppInfo,
)
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    ContextTypes,
    filters,
)

# =============== CONFIG ===============

BOT_TOKEN = os.getenv("BOT_TOKEN", "8001785392:AAFlfF-SkcJJqG52GCsWT7calY9YLe1aqGw")
ADMIN_ID = int(os.getenv("ADMIN_ID", "5274439601"))  # քո Telegram ID-ն
WEBAPP_URL = os.getenv(
    "WEBAPP_URL", "https://vorn-studio.github.io/0059bot/"
)  # փոխիր քո WebApp-ի URL-ով

DB_PATH = "mainmoney.db"
MIN_WITHDRAW_COINS = 100  # մինիմալ coins withdraw
TASK_REWARD_DEFAULT = 20  # default coins per task


logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s", level=logging.INFO
)
log = logging.getLogger("MainMoneyBot")


# =============== DB HELPERS ===============

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    c = conn.cursor()

    # users
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tg_id INTEGER UNIQUE,
            username TEXT,
            first_name TEXT,
            joined_at INTEGER,
            coins INTEGER DEFAULT 0,
            ton_wallet TEXT,
            invited_by INTEGER,
            total_earned INTEGER DEFAULT 0,
            total_spent INTEGER DEFAULT 0
        );
        """
    )

    # referrals
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

    # tasks
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            description TEXT,
            url TEXT,
            reward INTEGER,
            active INTEGER DEFAULT 1,
            created_at INTEGER
        );
        """
    )

    # task completions
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS task_completions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            task_id INTEGER,
            status TEXT, -- pending/approved/rejected/auto
            reward INTEGER,
            created_at INTEGER,
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(task_id) REFERENCES tasks(id)
        );
        """
    )

    # withdrawals
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS withdrawals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            amount_coins INTEGER,
            ton_wallet TEXT,
            status TEXT, -- pending/approved/rejected
            created_at INTEGER,
            processed_at INTEGER,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        """
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


def add_coins(user_id: int, delta: int):
    conn = get_db()
    c = conn.cursor()
    c.execute(
        "UPDATE users SET coins = coins + ?, total_earned = total_earned + ? WHERE id = ?",
        (delta, max(delta, 0), user_id),
    )
    conn.commit()
    conn.close()


def spend_coins(user_id: int, delta: int):
    conn = get_db()
    c = conn.cursor()
    c.execute(
        "UPDATE users SET coins = coins - ?, total_spent = total_spent + ? WHERE id = ?",
        (delta, delta, user_id),
    )
    conn.commit()
    conn.close()


def get_user_referrals(tg_id: int):
    conn = get_db()
    c = conn.cursor()
    c.execute(
        "SELECT * FROM referrals WHERE inviter_tg_id = ? ORDER BY created_at DESC",
        (tg_id,),
    )
    rows = c.fetchall()
    conn.close()
    return rows


def get_active_tasks():
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM tasks WHERE active = 1 ORDER BY id DESC")
    rows = c.fetchall()
    conn.close()
    return rows


def user_has_completed_task(user_id: int, task_id: int):
    conn = get_db()
    c = conn.cursor()
    c.execute(
        "SELECT * FROM task_completions WHERE user_id = ? AND task_id = ? AND status IN ('pending', 'approved', 'auto')",
        (user_id, task_id),
    )
    row = c.fetchone()
    conn.close()
    return bool(row)


def create_task_completion(user_id: int, task_id: int, reward: int):
    conn = get_db()
    c = conn.cursor()
    c.execute(
        """
        INSERT INTO task_completions (user_id, task_id, status, reward, created_at)
        VALUES (?, ?, 'auto', ?, ?)
        """,
        (user_id, task_id, reward, int(time.time())),
    )
    conn.commit()
    conn.close()


def create_withdraw(user_row, amount_coins: int):
    user_id = user_row["id"]
    coins = int(user_row["coins"] or 0)
    wallet = user_row["ton_wallet"]

    if not wallet:
        return None, "no_wallet"
    if amount_coins < MIN_WITHDRAW_COINS:
        return None, "too_small"
    if coins < amount_coins:
        return None, "not_enough"

    conn = get_db()
    c = conn.cursor()
    c.execute(
        "UPDATE users SET coins = coins - ? WHERE id = ?",
        (amount_coins, user_id),
    )
    now = int(time.time())
    c.execute(
        """
        INSERT INTO withdrawals (user_id, amount_coins, ton_wallet, status, created_at)
        VALUES (?, ?, ?, 'pending', ?)
        """,
        (user_id, amount_coins, wallet, now),
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


# =============== KEYBOARDS ===============

def main_menu_kb():
    return ReplyKeyboardMarkup(
        [
            ["📊 Account", "🎯 Tasks"],
            ["💸 Withdraw", "💼 Wallet"],
            ["👥 Partners", "🏪 Shop"],
        ],
        resize_keyboard=True,
    )


def webapp_button_kb():
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


# =============== USER HANDLERS ===============

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    text = update.message.text or ""

    inviter = None
    parts = text.split()
    if len(parts) > 1 and parts[1].startswith("ref_"):
        try:
            inviter_id = int(parts[1].split("_", 1)[1])
            if inviter_id != user.id:
                inviter = inviter_id
        except Exception:
            inviter = None

    user_row = ensure_user(user, inviter_tg_id=inviter)

    msg = (
        "👋 Բարի գալուստ <b>MainMoney Earn Platform</b>-ի demo տարբերակ։\n\n"
        "Աստեղ դու կարող ես կատարել առաջադրանքներ, հրավիրել մարդկանց, հավաքել coins, "
        "և հետագայում դրանք փոխարկել TON-ի (admin-ի կողմից հաստատումով).\n\n"
        "📱 Ունենք նաև WebApp ինտերֆեյս՝ ավելի հարմար կառավարման համար։"
    )

    await update.message.reply_text(
        msg, parse_mode="HTML", reply_markup=main_menu_kb()
    )
    await update.message.reply_text(
        "Սեղմիր ներքևի կոճակը WebApp-ը բացելու համար 👇",
        reply_markup=webapp_button_kb(),
    )


async def text_router(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    text = (update.message.text or "").strip()
    user_row = get_user_by_tg_id(user.id)
    if not user_row:
        user_row = ensure_user(user)

    # states
    if context.user_data.get("awaiting_wallet"):
        await handle_wallet_input(update, context, user_row)
        return

    if context.user_data.get("awaiting_withdraw"):
        await handle_withdraw_amount_input(update, context, user_row)
        return

    # menu buttons
    if text == "📊 Account":
        await handle_account(update, context, user_row)
    elif text == "🎯 Tasks":
        await handle_tasks(update, context, user_row)
    elif text == "💼 Wallet":
        await handle_wallet(update, context, user_row)
    elif text == "💸 Withdraw":
        await handle_withdraw(update, context, user_row)
    elif text == "👥 Partners":
        await handle_partners(update, context, user_row)
    elif text == "🏪 Shop":
        await handle_shop(update, context, user_row)
    elif text.startswith("/admin"):
        await admin_help(update, context)
    else:
        await update.message.reply_text(
            "Օգտագործիր մենյուի կոճակները կամ /admin (admin-ի համար)", reply_markup=main_menu_kb()
        )


async def handle_account(update: Update, context, user_row):
    coins = int(user_row["coins"] or 0)
    total_earned = int(user_row["total_earned"] or 0)
    total_spent = int(user_row["total_spent"] or 0)
    wallet = user_row["ton_wallet"] or "not linked"

    text = (
        "📊 <b>Քո հաշիվը</b>\n\n"
        f"💰 Coins balance: <b>{coins}</b>\n"
        f"📈 Total earned: <b>{total_earned}</b>\n"
        f"💸 Total spent: <b>{total_spent}</b>\n"
        f"🔗 TON wallet: <code>{wallet}</code>\n\n"
        "WebApp-ում կարող ես ավելի հարմար տեսնել ամեն բան։"
    )
    await update.message.reply_text(text, parse_mode="HTML", reply_markup=main_menu_kb())


async def handle_tasks(update: Update, context, user_row):
    tasks = get_active_tasks()
    if not tasks:
        await update.message.reply_text(
            "Այս պահին ակտիվ tasks չկան։", reply_markup=main_menu_kb()
        )
        return

    lines = ["🎯 <b>Ակտիվ tasks</b>\n"]
    for t in tasks:
        already = user_has_completed_task(user_row["id"], t["id"])
        status = "✅ Done" if already else "🕒 Available"
        lines.append(
            f"#{t['id']} {status}\n"
            f"<b>{t['title']}</b> (+{t['reward']} coins)\n"
            f"{t['description']}\n"
            f"{t['url']}\n"
        )

    lines.append("\nՏասկը ավարտելուց հետո վերադարձիր բոտ և սեղմիր /done_TASKID օրինակ՝ /done_3")
    await update.message.reply_text(
        "\n".join(lines), parse_mode="HTML", reply_markup=main_menu_kb()
    )


async def handle_wallet(update: Update, context, user_row):
    wallet = user_row["ton_wallet"] or "not linked"
    text = (
        "💼 <b>TON wallet</b>\n\n"
        f"Ընթացիկ: <code>{wallet}</code>\n\n"
        "Եթե ուզում ես փոխել կամ նշել նորը, ուղարկի՛ր քո TON հասցեն մեկ տողով։"
    )
    await update.message.reply_text(text, parse_mode="HTML")
    context.user_data["awaiting_wallet"] = True


async def handle_wallet_input(update: Update, context, user_row):
    context.user_data["awaiting_wallet"] = False
    wallet = (update.message.text or "").strip()
    if len(wallet) < 16:
        await update.message.reply_text("❌ Սա վալիդ TON հասցե չի թվում, փորձիր նորից։")
        return

    conn = get_db()
    c = conn.cursor()
    c.execute(
        "UPDATE users SET ton_wallet = ? WHERE id = ?",
        (wallet, user_row["id"]),
    )
    conn.commit()
    conn.close()

    await update.message.reply_text(
        f"✅ Wallet-ը պահպանված է.\n<code>{wallet}</code>",
        parse_mode="HTML",
        reply_markup=main_menu_kb(),
    )


async def handle_withdraw(update: Update, context, user_row):
    coins = int(user_row["coins"] or 0)
    if coins < MIN_WITHDRAW_COINS:
        await update.message.reply_text(
            f"❌ Քեզ մոտ քիչ coins կան.\nԲալանս: {coins}\nՄինիմում withdraw: {MIN_WITHDRAW_COINS}",
            reply_markup=main_menu_kb(),
        )
        return

    if not user_row["ton_wallet"]:
        await update.message.reply_text(
            "❌ TON wallet չես կցել։ Սկզբում Wallet բաժնում ավելացրու։",
            reply_markup=main_menu_kb(),
        )
        return

    await update.message.reply_text(
        f"💸 Քո բալանսը՝ {coins} coins.\n\nԳրիր, թե քանի coins ես ուզում հանել։",
        reply_markup=main_menu_kb(),
    )
    context.user_data["awaiting_withdraw"] = True


async def handle_withdraw_amount_input(update: Update, context, user_row):
    context.user_data["awaiting_withdraw"] = False
    text = (update.message.text or "").strip()

    try:
        amount = int(float(text))
    except ValueError:
        await update.message.reply_text("❌ Գրի թիվ (coins-ի քանակը).")
        return

    wid, err = create_withdraw(user_row, amount)
    if err == "no_wallet":
        await update.message.reply_text("❌ Wallet չունես։ Սկզբում կցիր TON wallet։")
        return
    if err == "too_small":
        await update.message.reply_text(
            f"❌ Մինիմալ withdraw-ը {MIN_WITHDRAW_COINS} coins է։"
        )
        return
    if err == "not_enough":
        await update.message.reply_text("❌ Բալանսը բավարար չէ։")
        return

    # notify admin
    try:
        msg = (
            "💸 <b>New withdraw request</b>\n\n"
            f"ID: <code>{wid}</code>\n"
            f"User: <code>{user_row['tg_id']}</code> @{user_row['username'] or '—'}\n"
            f"Amount: <b>{amount} coins</b>\n"
            f"Wallet: <code>{user_row['ton_wallet']}</code>\n\n"
            f"/approve_withdraw {wid}\n/reject_withdraw {wid}"
        )
        await update.get_bot().send_message(ADMIN_ID, msg, parse_mode="HTML")
    except Exception as e:
        log.error(f"Failed to notify admin: {e}")

    await update.message.reply_text(
        "✅ Քո withdraw հայտը ուղարկվել է admin-ին.\n⏳ Պատասխանը կստանաս 24 ժամվա ընթացքում։",
        reply_markup=main_menu_kb(),
    )


async def handle_partners(update: Update, context, user_row):
    refs = get_user_referrals(user_row["tg_id"])
    count = len(refs)
    lines = []
    lines.append("👥 <b>Partners</b>\n")
    lines.append(f"Ընդամենը հրավիրված․ <b>{count}</b>\n")

    if refs:
        lines.append("Վերջին ռեֆերալները՝")
        for r in refs[:20]:
            dt = datetime.fromtimestamp(r["created_at"]).strftime("%Y-%m-%d %H:%M")
            lines.append(f"• user_id={r['invited_tg_id']} — {dt}")
    else:
        lines.append("Դեռ չունես ռեֆերալներ։")

    bot_me = await update.get_bot().get_me()
    ref_link = f"https://t.me/{bot_me.username}?start=ref_{user_row['tg_id']}"
    lines.append("")
    lines.append("Քո referral հղումը՝")
    lines.append(f"<code>{ref_link}</code>")

    await update.message.reply_text(
        "\n".join(lines), parse_mode="HTML", reply_markup=main_menu_kb()
    )


async def handle_shop(update: Update, context, user_row):
    text = (
        "🏪 <b>Shop (demo)</b>\n\n"
        "Աստեղ հետո կարող ենք ավելացնել premium features, boosts, advertising slots և այլն։\n\n"
        "Հիմա պարզապես demo է, որը ցույց է տալիս, որ այդ բաժինը կա։"
    )
    await update.message.reply_text(text, parse_mode="HTML", reply_markup=main_menu_kb())


# =============== COMMAND: /done_TASKID for task auto-complete demo ===============

async def done_task_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    user_row = get_user_by_tg_id(user.id)
    if not user_row:
        user_row = ensure_user(user)

    text = update.message.text or ""
    if not text.startswith("/done_"):
        return

    try:
        task_id = int(text.split("_", 1)[1])
    except Exception:
        await update.message.reply_text("❌ Սխալ task ID։ Օրինակ՝ /done_3")
        return

    tasks = get_active_tasks()
    task_map = {t["id"]: t for t in tasks}
    if task_id not in task_map:
        await update.message.reply_text("❌ Այդ ID-ով ակտիվ task չկա։")
        return

    if user_has_completed_task(user_row["id"], task_id):
        await update.message.reply_text("✅ Այս task-ը արդեն գրանցված է որպես complete։")
        return

    task = task_map[task_id]
    reward = int(task["reward"] or TASK_REWARD_DEFAULT)

    create_task_completion(user_row["id"], task_id, reward)
    add_coins(user_row["id"], reward)

    await update.message.reply_text(
        f"✅ Task #{task_id} ավարտված է և քեզ ավելացվեց {reward} coins։",
        reply_markup=main_menu_kb(),
    )


# =============== WEBAPP DATA HANDLER ===============

async def webapp_data_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    Handles WebApp.sendData(JSON).
    """
    try:
        msg = update.effective_message
        if not msg or not msg.web_app_data:
            return

        data_raw = msg.web_app_data.data
        data = json.loads(data_raw)

        action = data.get("action")
        user = update.effective_user
        user_row = get_user_by_tg_id(user.id) or ensure_user(user)

        if action == "set_wallet":
            wallet = data.get("wallet", "").strip()
            if len(wallet) < 16:
                await msg.reply_text("❌ Invalid TON wallet from WebApp.")
                return

            conn = get_db()
            c = conn.cursor()
            c.execute(
                "UPDATE users SET ton_wallet = ? WHERE id = ?",
                (wallet, user_row["id"]),
            )
            conn.commit()
            conn.close()

            await msg.reply_text(
                f"✅ TON wallet saved from WebApp:\n<code>{wallet}</code>",
                parse_mode="HTML",
            )
            return

        if action == "disconnect_wallet":
            conn = get_db()
            c = conn.cursor()
            c.execute(
                "UPDATE users SET ton_wallet = NULL WHERE id = ?",
                (user_row["id"],),
            )
            conn.commit()
            conn.close()

            await msg.reply_text("🔌 TON wallet disconnected from WebApp.")
            return

        if action == "withdraw":
            amount = int(float(data.get("amount", 0)))
            wid, err = create_withdraw(user_row, amount)
            if err == "no_wallet":
                await msg.reply_text("❌ No TON wallet. Set it first.")
                return
            if err == "too_small":
                await msg.reply_text(
                    f"❌ Too small. Min withdraw is {MIN_WITHDRAW_COINS} coins."
                )
                return
            if err == "not_enough":
                await msg.reply_text("❌ Not enough coins.")
                return

            # notify admin
            try:
                notif = (
                    "💸 <b>New withdraw from WebApp</b>\n\n"
                    f"ID: <code>{wid}</code>\n"
                    f"User: <code>{user_row['tg_id']}</code> @{user_row['username'] or '—'}\n"
                    f"Amount: <b>{amount} coins</b>\n"
                    f"Wallet: <code>{user_row['ton_wallet']}</code>\n\n"
                    f"/approve_withdraw {wid}\n/reject_withdraw {wid}"
                )
                await context.bot.send_message(ADMIN_ID, notif, parse_mode="HTML")
            except Exception as e:
                log.error(f"Admin notify error: {e}")

            await msg.reply_text(
                "✅ Withdraw request created from WebApp.\n⏳ Wait for admin approval."
            )
            return

    except Exception as e:
        log.error(f"webapp_data_handler error: {e}")


# =============== ADMIN PART ===============

def admin_only(func):
    async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE):
        if update.effective_user.id != ADMIN_ID:
            await update.message.reply_text("❌ Դու admin չես։")
            return
        return await func(update, context)

    return wrapper


async def admin_help(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_user.id != ADMIN_ID:
        await update.message.reply_text("❌ Դու admin չես։")
        return

    text = (
        "🛠 <b>Admin panel</b>\n\n"
        "/admin – այս մենյուն\n"
        "/add_task title | description | url | reward\n"
        "/list_tasks – tasks list\n"
        "/set_coins tg_id amount – set user coins\n"
        "/add_coins tg_id amount – add coins\n"
        "/list_withdraws – pending withdraws\n"
        "/approve_withdraw id\n"
        "/reject_withdraw id\n"
        "/broadcast text\n"
    )
    await update.message.reply_text(text, parse_mode="HTML")


@admin_only
async def add_task_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    # format: /add_task title | description | url | reward
    text = update.message.text.partition(" ")[2].strip()
    parts = [p.strip() for p in text.split("|")]
    if len(parts) != 4:
        await update.message.reply_text("Օգտագործիր՝ /add_task title | description | url | reward")
        return

    title, description, url, reward_s = parts
    try:
        reward = int(reward_s)
    except ValueError:
        await update.message.reply_text("Reward-ը թիվ պիտի լինի։")
        return

    conn = get_db()
    c = conn.cursor()
    c.execute(
        """
        INSERT INTO tasks (title, description, url, reward, active, created_at)
        VALUES (?, ?, ?, ?, 1, ?)
        """,
        (title, description, url, reward, int(time.time())),
    )
    conn.commit()
    conn.close()

    await update.message.reply_text("✅ Task added.")


@admin_only
async def list_tasks_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    tasks = get_active_tasks()
    if not tasks:
        await update.message.reply_text("No active tasks.")
        return

    lines = ["🎯 Active tasks:"]
    for t in tasks:
        lines.append(
            f"#{t['id']} {t['title']} (+{t['reward']} coins)\n{t['url']}"
        )
    await update.message.reply_text("\n\n".join(lines))


@admin_only
async def set_coins_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if len(context.args) != 2:
        await update.message.reply_text("Օգտագործիր՝ /set_coins tg_id amount")
        return
    tg_id = int(context.args[0])
    amount = int(context.args[1])

    u = get_user_by_tg_id(tg_id)
    if not u:
        await update.message.reply_text("User not found.")
        return

    conn = get_db()
    c = conn.cursor()
    c.execute("UPDATE users SET coins = ? WHERE id = ?", (amount, u["id"]))
    conn.commit()
    conn.close()

    await update.message.reply_text("✅ Coins set.")


@admin_only
async def add_coins_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if len(context.args) != 2:
        await update.message.reply_text("Օգտագործիր՝ /add_coins tg_id amount")
        return
    tg_id = int(context.args[0])
    amount = int(context.args[1])

    u = get_user_by_tg_id(tg_id)
    if not u:
        await update.message.reply_text("User not found.")
        return

    add_coins(u["id"], amount)
    await update.message.reply_text("✅ Coins added.")


@admin_only
async def list_withdraws_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    rows = list_pending_withdraws()
    if not rows:
        await update.message.reply_text("No pending withdraws.")
        return

    lines = ["💸 Pending withdraws:"]
    for r in rows:
        dt = datetime.fromtimestamp(r["created_at"]).strftime("%Y-%m-%d %H:%M")
        uname = r["username"] or r["tg_id"]
        lines.append(
            f"ID {r['id']}: {r['amount_coins']} coins | @{uname} | {dt}\nWallet: {r['ton_wallet']}"
        )

    await update.message.reply_text("\n\n".join(lines))


@admin_only
async def approve_withdraw_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if len(context.args) != 1:
        await update.message.reply_text("Օգտագործիր՝ /approve_withdraw id")
        return

    wid = int(context.args[0])
    set_withdraw_status(wid, "approved")
    await update.message.reply_text("✅ Withdraw approved (remember to pay manually on TON).")


@admin_only
async def reject_withdraw_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if len(context.args) != 1:
        await update.message.reply_text("Օգտագործիր՝ /reject_withdraw id")
        return

    wid = int(context.args[0])
    set_withdraw_status(wid, "rejected")
    await update.message.reply_text("✅ Withdraw rejected.")


@admin_only
async def broadcast_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = update.message.text.partition(" ")[2].strip()
    if not text:
        await update.message.reply_text("Օգտագործիր՝ /broadcast text")
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


async def webapp_data_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        msg = update.effective_message
        raw = msg.web_app_data.data
        data = json.loads(raw)

        action = data.get("action")
        user = update.effective_user
        user_row = get_user_by_tg_id(user.id) or ensure_user(user)

        if action == "set_wallet":
            wallet = data.get("wallet", "").strip()

            if len(wallet) < 10:
                await msg.reply_text("❌ Invalid TON wallet")
                return

            conn = get_db()
            c = conn.cursor()
            c.execute(
                "UPDATE users SET ton_wallet = ? WHERE id = ?",
                (wallet, user_row["id"]),
            )
            conn.commit()
            conn.close()

            await msg.reply_text(f"✅ TON wallet saved:\n<code>{wallet}</code>", parse_mode="HTML")
            return

        if action == "disconnect_wallet":
            conn = get_db()
            c = conn.cursor()
            c.execute(
                "UPDATE users SET ton_wallet = NULL WHERE id = ?",
                (user_row["id"],),
            )
            conn.commit()
            conn.close()

            await msg.reply_text("🔌 TON wallet disconnected.")
            return

        if action == "withdraw":
            amount = int(float(data.get("amount", 0)))
            wid, err = create_withdraw(user_row, amount)

            if err == "no_wallet":
                await msg.reply_text("❌ You must set wallet first.")
                return
            if err == "too_small":
                await msg.reply_text("❌ Amount too small.")
                return
            if err == "not_enough":
                await msg.reply_text("❌ Not enough coins.")
                return

            await msg.reply_text("✅ Withdraw request sent.")
            return

    except Exception as e:
        print("WEBAPP ERROR:", e)


# =============== MAIN ===============

def main():
    init_db()
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(MessageHandler(filters.StatusUpdate.WEB_APP_DATA, webapp_data_handler))

    # commands
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("admin", admin_help))
    app.add_handler(CommandHandler("add_task", add_task_cmd))
    app.add_handler(CommandHandler("list_tasks", list_tasks_cmd))
    app.add_handler(CommandHandler("set_coins", set_coins_cmd))
    app.add_handler(CommandHandler("add_coins", add_coins_cmd))
    app.add_handler(CommandHandler("list_withdraws", list_withdraws_cmd))
    app.add_handler(CommandHandler("approve_withdraw", approve_withdraw_cmd))
    app.add_handler(CommandHandler("reject_withdraw", reject_withdraw_cmd))
    app.add_handler(CommandHandler("broadcast", broadcast_cmd))
    app.add_handler(CommandHandler("done", done_task_handler))  # /done_3 captured via text handler

    # message handlers
    app.add_handler(
        MessageHandler(filters.StatusUpdate.WEB_APP_DATA, webapp_data_handler)
    )
    app.add_handler(MessageHandler(filters.Regex(r"^/done_\d+"), done_task_handler))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, text_router))

    log.info("MainMoney bot started...")
    app.run_polling()


if __name__ == "__main__":
    main()
