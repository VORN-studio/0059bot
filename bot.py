import os
import sqlite3
import logging
import time
from datetime import datetime, date

from telegram import (
    Update,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    ReplyKeyboardMarkup,
    KeyboardButton,
)
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    CallbackQueryHandler,
    filters,
)

# ===================== CONFIG =====================

BOT_TOKEN = os.getenv("BOT_TOKEN", "8001785392:AAFlfF-SkcJJqG52GCsWT7calY9YLe1aqGw")  # ԴԻՆԵՍ ՔՈ TOKEN-Ը
ADMIN_ID = int(os.getenv("ADMIN_ID", "5274439601"))  # ԴԻՆԵՍ ՔՈ TELEGRAM ID-Ն

DB_PATH = "main_money.db"

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("MainMoneyBot")


# ===================== DB HELPERS =====================

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
            created_at INTEGER,
            balance REAL DEFAULT 0,
            ton_wallet TEXT
        );
        """
    )

    # deposits
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS deposits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            active INTEGER DEFAULT 1,
            created_at INTEGER,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        """
    )

    # vip daily tasks (generated per user per day)
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS vip_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            task_date TEXT NOT NULL,
            slot INTEGER NOT NULL,          -- 1, 2, 3
            reward REAL NOT NULL,
            status TEXT DEFAULT 'pending',  -- pending/completed
            completed_at INTEGER,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        """
    )

    # withdrawals
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS withdrawals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            ton_wallet TEXT,
            status TEXT DEFAULT 'pending',  -- pending/approved/rejected
            created_at INTEGER,
            processed_at INTEGER,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        """
    )

    conn.commit()
    conn.close()


def ensure_user(tg_user) -> int:
    """
    Returns է users.id
    """
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT id FROM users WHERE tg_id = ?", (tg_user.id,))
    row = c.fetchone()
    if row:
        user_id = row["id"]
    else:
        c.execute(
            """
            INSERT INTO users (tg_id, username, first_name, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (
                tg_user.id,
                tg_user.username,
                tg_user.first_name,
                int(time.time()),
            ),
        )
        conn.commit()
        user_id = c.lastrowid
    conn.close()
    return user_id


def get_user_by_tg_id(tg_id):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM users WHERE tg_id = ?", (tg_id,))
    row = c.fetchone()
    conn.close()
    return row


def get_user_internal(user_id):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    row = c.fetchone()
    conn.close()
    return row


def update_balance(user_id: int, delta: float):
    conn = get_db()
    c = conn.cursor()
    c.execute("UPDATE users SET balance = balance + ? WHERE id = ?", (delta, user_id))
    conn.commit()
    conn.close()


def get_total_active_deposit(user_id: int) -> float:
    conn = get_db()
    c = conn.cursor()
    c.execute(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM deposits WHERE user_id = ? AND active = 1",
        (user_id,),
    )
    row = c.fetchone()
    conn.close()
    return float(row["total"] or 0)


def get_today_str() -> str:
    return date.today().isoformat()


def get_or_create_today_vip_tasks(user_id: int):
    """
    If there are no VIP tasks today, we create 3, the total amount of which is 5% of the active deposit.
    Returns a list of tasks.
    """
    conn = get_db()
    c = conn.cursor()
    today = get_today_str()

    c.execute(
        "SELECT * FROM vip_tasks WHERE user_id = ? AND task_date = ? ORDER BY slot",
        (user_id, today),
    )
    rows = c.fetchall()
    if rows:
        conn.close()
        return rows

    # no tasks yet → generate
    total_dep = get_total_active_deposit(user_id)
    if total_dep <= 0:
        conn.close()
        return []

    daily_total = total_dep * 0.05  # 5%
    per_task = round(daily_total / 3, 4)

    tasks = []
    for slot in (1, 2, 3):
        c.execute(
            """
            INSERT INTO vip_tasks (user_id, task_date, slot, reward)
            VALUES (?, ?, ?, ?)
            """,
            (user_id, today, slot, per_task),
        )
        conn.commit()
        task_id = c.lastrowid
        tasks.append(
            {
                "id": task_id,
                "user_id": user_id,
                "task_date": today,
                "slot": slot,
                "reward": per_task,
                "status": "pending",
                "completed_at": None,
            }
        )

    conn.close()
    return tasks


def get_user_vip_tasks_for_today(user_id: int):
    conn = get_db()
    c = conn.cursor()
    today = get_today_str()
    c.execute(
        "SELECT * FROM vip_tasks WHERE user_id = ? AND task_date = ? ORDER BY slot",
        (user_id, today),
    )
    rows = c.fetchall()
    conn.close()
    return rows


def set_ton_wallet(user_id: int, wallet: str):
    conn = get_db()
    c = conn.cursor()
    c.execute("UPDATE users SET ton_wallet = ? WHERE id = ?", (wallet, user_id))
    conn.commit()
    conn.close()


def create_withdrawal(user_id: int, amount: float):
    user = get_user_internal(user_id)
    if not user or not user["ton_wallet"]:
        return None, "no_wallet"

    conn = get_db()
    c = conn.cursor()
    # check balance
    c.execute("SELECT balance FROM users WHERE id = ?", (user_id,))
    row = c.fetchone()
    bal = float(row["balance"] or 0)
    if bal < amount:
        conn.close()
        return None, "not_enough_balance"

    # deduct
    c.execute("UPDATE users SET balance = balance - ? WHERE id = ?", (amount, user_id))
    # insert withdraw
    c.execute(
        """
        INSERT INTO withdrawals (user_id, amount, ton_wallet, status, created_at)
        VALUES (?, ?, ?, 'pending', ?)
        """,
        (user_id, amount, user["ton_wallet"], int(time.time())),
    )
    conn.commit()
    w_id = c.lastrowid
    conn.close()
    return w_id, None


# ===================== KEYBOARDS =====================

def main_menu_kb():
    return ReplyKeyboardMarkup(
        [
            ["💰 Earn tasks", "⭐ VIP zone"],
            ["💼 Balance & Withdraw"],
            ["🔗 Connect TON wallet", "👤 Profile"],
        ],
        resize_keyboard=True,
    )


def admin_menu_text():
    return (
        "🛠 <b>Main Money Admin Panel</b>\n\n"
        "Հասանելի հրամաններ՝\n"
        "/add_balance <tg_id> <amount> – Ավելացնել բալանս\n"
        "/sub_balance <tg_id> <amount> – Հանել բալանս\n"
        "/add_deposit <tg_id> <amount> – Ավելացնել VIP դեպոզիտ\n"
        "/broadcast <text> – Ուղարկել հաղորդագրություն բոլոր օգտատերերին\n"
        "/list_withdraws – Ցուցադրել pending կանխիկացումները\n"
        "/approve_withdraw <id> – Նշել որպես approved\n"
        "/reject_withdraw <id> – Նշել որպես rejected\n"
    )


# ===================== HANDLERS =====================

from telegram.ext import CallbackQueryHandler, MessageHandler, filters, Application, CommandHandler, ContextTypes, CallbackQueryHandler, PreCheckoutQueryHandler

async def webapp_data_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        raw = update.effective_message.web_app_data.data
        data = json.loads(raw)

        if data.get("action") == "open_withdraw":
            await withdraw_cmd(update, context)
            return


        if data.get("action") == "save_wallet":
            wallet = data.get("address")
            user = update.effective_user
            user_row = get_user_by_tg_id(user.id)
        elif data.get("action") == "vip_payment":
            ton_amount = float(data.get("ton"))
            user = update.effective_user
            user_row = get_user_by_tg_id(user.id)
            if not user_row:
                ensure_user(user)
                user_row = get_user_by_tg_id(user.id)

                # Ավելացնում ենք deposit աղյուսակ
            conn = get_db()
            c = conn.cursor()
            c.execute(
                "INSERT INTO deposits (user_id, amount, active, created_at) VALUES (?, ?, 1, ?)",
                (user_row["id"], ton_amount, int(time.time()))
            )
            conn.commit()
            conn.close()

            await update.message.reply_text(
                f"💎 VIP deposit added!\nYou invested {ton_amount} TON.",
                parse_mode="HTML"
            )

            if not user_row:
                ensure_user(user)
                user_row = get_user_by_tg_id(user.id)

            set_ton_wallet(user_row["id"], wallet)

            await update.message.reply_text(
                f"🔗 TON Wallet connected successfully!\n<code>{wallet}</code>",
                parse_mode="HTML"
            )
    except Exception as e:
        print("WebApp data error:", e)

async def withdraw_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "💸 Withdraw Menu\nChoose how much to withdraw…",
        reply_markup=main_menu_kb()
    )

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    user_id = ensure_user(user)

    text = (
        f"👋 Welcome! <b>Main Money</b> bot, {user.first_name}!\n\n"
        "Here you can earn money by completing tasks.,\n"
        "and with VIP investments, get up to 5% cashback every day with tasks.\n\n"
        "Select from the menu՝"
    )
    await update.message.reply_text(text, reply_markup=main_menu_kb(), parse_mode="HTML")


async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    chat_id = update.effective_chat.id
    text = (update.message.text or "").strip()
    user_row = get_user_by_tg_id(user.id)
    if not user_row:
        ensure_user(user)
        user_row = get_user_by_tg_id(user.id)

    if text == "💰 Earn tasks":
        await handle_earn_tasks(update, context, user_row)
    elif text == "⭐ VIP zone":
        await handle_vip_zone(update, context, user_row)
    elif text == "💼 Balance & Withdraw":
        await handle_balance(update, context, user_row)
    elif text == "🔗 Connect TON wallet":
        await handle_connect_wallet(update, context, user_row)
    elif text == "👤 Profile":
        await handle_profile(update, context, user_row)
    elif text.startswith("/admin"):
        await handle_admin(update, context)
    else:
        await update.message.reply_text(
            "Select the appropriate button from the menu.", reply_markup=main_menu_kb()
        )


async def handle_earn_tasks(update: Update, context: ContextTypes.DEFAULT_TYPE, user_row):
    user_id = user_row["id"]
    total_dep = get_total_active_deposit(user_id)
    if total_dep <= 0:
        await update.message.reply_text(
            "You currently have no active VIP investments.\n"
            "⭐ You can see the investment conditions in the VIP Zone section.",
            reply_markup=main_menu_kb(),
        )
        return

    # ստեղծում կամ բերում ենք այսօրվա VIP tasks
    tasks = get_or_create_today_vip_tasks(user_id)
    if not tasks:
        await update.message.reply_text(
            "There are no tasks at this time. Please try again later.",
            reply_markup=main_menu_kb(),
        )
        return

    lines = ["📋 Your VIP tasks for today?\n"]
    buttons = []
    for row in tasks:
        status = "✅ Done" if row["status"] == "completed" else "⏳ Waiting"
        lines.append(
            f"{row['slot']}) {row['reward']:.4f} TON – {status}"
        )
        if row["status"] == "pending":
            buttons.append(
                [
                    InlineKeyboardButton(
                        f"✅ Mark {row['slot']} Done",
                        callback_data=f"vip_done:{row['id']}",
                    )
                ]
            )

    kb = InlineKeyboardMarkup(buttons) if buttons else None
    await update.message.reply_text(
        "\n".join(lines),
        reply_markup=kb or main_menu_kb(),
    )


async def handle_vip_zone(update: Update, context: ContextTypes.DEFAULT_TYPE, user_row):
    user_id = user_row["id"]
    total_dep = get_total_active_deposit(user_id)

    text = (
        "⭐ <b>VIP Zone</b>\n\n"
        "In VIP, you deposit money (for example, 1000 TON), and every day you receive\n"
        "3 tasks, each worth 1/3 of 5%.\n\n"
        f"Your total active deposit: <b>{total_dep:.2f} TON</b>\n\n"
        "The admin adds technical inputs.\n"
        "Depending on the size of your investment, the bot automatically creates daily tasks."
    )
    await update.message.reply_text(text, parse_mode="HTML", reply_markup=main_menu_kb())


async def handle_balance(update: Update, context: ContextTypes.DEFAULT_TYPE, user_row):
    user_id = user_row["id"]
    bal = float(user_row["balance"] or 0)
    ton_wallet = user_row["ton_wallet"] or "not attached"
    total_dep = get_total_active_deposit(user_id)

    text = (
        "💼 <b>Your financial dashboard</b>\n\n"
        f"Balance՝ <b>{bal:.4f} TON</b>\n"
        f"Active VIP deposit՝ <b>{total_dep:.2f} TON</b>\n"
        f"TON wallet՝ <b>{ton_wallet}</b>\n\n"
        "Minimum required for cashout՝ <b>10 TON</b>։"
    )

    buttons = []
    if bal >= 10 and user_row["ton_wallet"]:
        buttons.append(
            [InlineKeyboardButton("💸 Send a cash withdrawal request", callback_data="withdraw_req")]
        )

    kb = InlineKeyboardMarkup(buttons) if buttons else None
    await update.message.reply_text(text, parse_mode="HTML", reply_markup=kb or main_menu_kb())


async def handle_connect_wallet(update: Update, context: ContextTypes.DEFAULT_TYPE, user_row):
    text = (
        "🔗 <b>Connect TON wallet</b>\n\n"
        "1) Click the button below to open Telegram Wallet. (TON)\n"
        "2) See your TON address in your wallet.\n"
        "3) Copy the address and send it to me here as a single line.\n\n"
        "For example:՝ <code>UQDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx</code>\n\n"
        "Your last saved address՝ "
        f"<b>{user_row['ton_wallet'] or 'there is none'}</b>"
    )
    kb = InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton(
                    "💼 Open Telegram Wallet", url="https://t.me/wallet"
                )
            ]
        ]
    )
    await update.message.reply_text(text, parse_mode="HTML", reply_markup=kb)

    # Պահում ենք state, որ հաջորդ տեքստը դիտարկենք որպես քաշիլոք
    context.user_data["awaiting_wallet"] = True


async def handle_profile(update: Update, context: ContextTypes.DEFAULT_TYPE, user_row):
    total_dep = get_total_active_deposit(user_row["id"])
    text = (
        "👤 <b>Your profile</b>\n\n"
        f"ID՝ <code>{user_row['tg_id']}</code>\n"
        f"Username՝ @{user_row['username'] or '—'}\n"
        f"Name:՝ {user_row['first_name']}\n"
        f"Balance՝ <b>{float(user_row['balance'] or 0):.4f} TON</b>\n"
        f"Active deposit՝ <b>{total_dep:.2f} TON</b>\n"
        f"TON Wallet՝ <code>{user_row['ton_wallet'] or 'there is none'}</code>\n"
    )
    await update.message.reply_text(text, parse_mode="HTML", reply_markup=main_menu_kb())


# ===================== CALLBACKS =====================

async def callback_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    data = query.data or ""

    user = query.from_user
    user_row = get_user_by_tg_id(user.id)
    if not user_row:
        ensure_user(user)
        user_row = get_user_by_tg_id(user.id)

    if data.startswith("vip_done:"):
        task_id = int(data.split(":")[1])
        await complete_vip_task(query, context, user_row, task_id)
    elif data == "withdraw_req":
        await process_withdraw_request(query, context, user_row)


async def complete_vip_task(query, context, user_row, task_id: int):
    user_id = user_row["id"]

    conn = get_db()
    c = conn.cursor()
    c.execute(
        "SELECT * FROM vip_tasks WHERE id = ? AND user_id = ?",
        (task_id, user_id),
    )
    row = c.fetchone()
    if not row:
        conn.close()
        await query.edit_message_text("The task was not found.")
        return

    if row["status"] == "completed":
        conn.close()
        await query.edit_message_text("This task has already been completed.")
        return

    # Mark completed
    c.execute(
        "UPDATE vip_tasks SET status = 'completed', completed_at = ? WHERE id = ?",
        (int(time.time()), task_id),
    )
    conn.commit()
    conn.close()

    # Add reward
    update_balance(user_id, float(row["reward"]))

    await query.edit_message_text(
        f"✅ The task has been marked as completed. You have been added. {row['reward']:.4f} TON։"
    )


async def process_withdraw_request(query, context, user_row):
    user_id = user_row["id"]
    bal = float(user_row["balance"] or 0)
    if not user_row["ton_wallet"]:
        await query.edit_message_text("You haven't attached a TON wallet yet. Attach a wallet first.")
        return
    if bal < 10:
        await query.edit_message_text(
            f"You need at least 10 TON to cash out. Your balance՝ {bal:.4f} TON։"
        )
        return

    amount = bal  # ամբողջ բալանսը
    wid, err = create_withdrawal(user_id, amount)
    if err == "no_wallet":
        await query.edit_message_text("You haven't attached a TON Wallet yet.")
        return
    if err == "not_enough_balance":
        await query.edit_message_text("The balance is not enough.")
        return

    # ահազանգում ենք ադմինին
    user = get_user_internal(user_id)
    msg = (
        f"💸 <b>New cashout request</b>\n\n"
        f"Withdraw ID: <code>{wid}</code>\n"
        f"User tg_id: <code>{user['tg_id']}</code>\n"
        f"Username: @{user['username'] or '—'}\n"
        f"Amount: <b>{amount:.4f} TON</b>\n"
        f"TON wallet: <code>{user['ton_wallet']}</code>\n\n"
        f"Commands:՝\n"
        f"/approve_withdraw {wid} – mark as approved\n"
        f"/reject_withdraw {wid} – mark as rejected\n"
    )
    try:
        await context.bot.send_message(ADMIN_ID, msg, parse_mode="HTML")
    except Exception as e:
        log.error(f"Error notifying admin: {e}")

    await query.edit_message_text(
        "✅ Your cashout request has been sent to the admin.\n"
        "The admin will verify and send the money to your TON wallet."
    )


# ===================== ADMIN COMMANDS =====================

def admin_only(func):
    async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE):
        user = update.effective_user
        if user.id != ADMIN_ID:
            await update.message.reply_text("You are not an admin.")
            return
        return await func(update, context)

    return wrapper


async def handle_admin(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    if user.id != ADMIN_ID:
        await update.message.reply_text("You are not an admin.")
        return
    await update.message.reply_text(admin_menu_text(), parse_mode="HTML")


@admin_only
async def add_balance_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    args = context.args
    if len(args) != 2:
        await update.message.reply_text("User՝ /add_balance <tg_id> <amount>")
        return
    tg_id = int(args[0])
    amount = float(args[1])

    u = get_user_by_tg_id(tg_id)
    if not u:
        await update.message.reply_text("User not found.")
        return
    update_balance(u["id"], amount)
    await update.message.reply_text(
        f"User @{u['username'] or u['tg_id']} added to balance {amount} TON։"
    )


@admin_only
async def sub_balance_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    args = context.args
    if len(args) != 2:
        await update.message.reply_text("Usage:՝ /sub_balance <tg_id> <amount>")
        return
    tg_id = int(args[0])
    amount = float(args[1])

    u = get_user_by_tg_id(tg_id)
    if not u:
        await update.message.reply_text("User not found.")
        return
    update_balance(u["id"], -amount)
    await update.message.reply_text(
        f"User @{u['username'] or u['tg_id']} taken off balance {amount} TON։"
    )


@admin_only
async def add_deposit_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    args = context.args
    if len(args) != 2:
        await update.message.reply_text("Usage:՝ /add_deposit <tg_id> <amount>")
        return
    tg_id = int(args[0])
    amount = float(args[1])

    u = get_user_by_tg_id(tg_id)
    if not u:
        await update.message.reply_text("User not found.")
        return

    conn = get_db()
    c = conn.cursor()
    c.execute(
        "INSERT INTO deposits (user_id, amount, active, created_at) VALUES (?, ?, 1, ?)",
        (u["id"], amount, int(time.time())),
    )
    conn.commit()
    conn.close()

    await update.message.reply_text(
        f"Added {amount} TON VIP deposit user @{u['username'] or u['tg_id']} for"
    )


@admin_only
async def broadcast_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text("Usage:՝ /broadcast <text>")
        return
    text = update.message.text.partition(" ")[2].strip()
    if not text:
        await update.message.reply_text("The text is empty.")
        return

    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT tg_id FROM users")
    rows = c.fetchall()
    conn.close()

    sent = 0
    for row in rows:
        try:
            await context.bot.send_message(row["tg_id"], text)
            sent += 1
        except Exception:
            pass

    await update.message.reply_text(f"Sent {sent} of the user.")


@admin_only
async def list_withdraws_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    conn = get_db()
    c = conn.cursor()
    c.execute(
        "SELECT w.*, u.tg_id, u.username "
        "FROM withdrawals w JOIN users u ON u.id = w.user_id "
        "WHERE w.status = 'pending' ORDER BY w.created_at DESC"
    )
    rows = c.fetchall()
    conn.close()

    if not rows:
        await update.message.reply_text("There are no pending withdrawals.")
        return

    lines = ["💸 Pending withdraw requests:\n"]
    for r in rows:
        dt = datetime.fromtimestamp(r["created_at"]).strftime("%Y-%m-%d %H:%M")
        lines.append(
            f"ID {r['id']}: {r['amount']:.4f} TON | @{r['username'] or r['tg_id']} | {dt}\n"
            f"Wallet: {r['ton_wallet']}"
        )
    await update.message.reply_text("\n\n".join(lines))


@admin_only
async def approve_withdraw_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    args = context.args
    if len(args) != 1:
        await update.message.reply_text("Usage:՝ /approve_withdraw <id>")
        return
    wid = int(args[0])

    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM withdrawals WHERE id = ?", (wid,))
    row = c.fetchone()
    if not row:
        conn.close()
        await update.message.reply_text("The pull request was not found.")
        return

    if row["status"] != "pending":
        conn.close()
        await update.message.reply_text("This application is not pending.")
        return

    c.execute(
        "UPDATE withdrawals SET status = 'approved', processed_at = ? WHERE id = ?",
        (int(time.time()), wid),
    )
    conn.commit()
    conn.close()

    # տեղեկացնում ենք օգտատերին
    u = get_user_internal(row["user_id"])
    try:
        await context.bot.send_message(
            u["tg_id"],
            f"✅ Your {row['amount']:.4f} TON withdrawal request has been approved. The funds have been sent to your TON wallet.",
        )
    except Exception:
        pass

    await update.message.reply_text("The application was marked approved.")


@admin_only
async def reject_withdraw_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    args = context.args
    if len(args) != 1:
        await update.message.reply_text("Usage:՝ /reject_withdraw <id>")
        return
    wid = int(args[0])

    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM withdrawals WHERE id = ?", (wid,))
    row = c.fetchone()
    if not row:
        conn.close()
        await update.message.reply_text("The pull request was not found.")
        return

    if row["status"] != "pending":
        conn.close()
        await update.message.reply_text("This application is not pending.")
        return

    c.execute(
        "UPDATE withdrawals SET status = 'rejected', processed_at = ? WHERE id = ?",
        (int(time.time()), wid),
    )
    conn.commit()
    conn.close()

    # optionally՝ վերադարձնել գումարը բալանսին
    # update_balance(row["user_id"], row["amount"])

    u = get_user_internal(row["user_id"])
    try:
        await context.bot.send_message(
            u["tg_id"],
            f"❌ Your {row['amount']:.4f} TON withdrawal request has been rejected. Contact the admin for details.",
        )
    except Exception:
        pass

    await update.message.reply_text("The application was marked rejected.")


# ===================== TEXT CATCH (wallet input) =====================

async def text_catch(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    This is where we hear a user sending a TON wallet,
    or simply clicking the menu buttons.
    """
    # եթե սպասում ենք քաշիլոք
    if context.user_data.get("awaiting_wallet"):
        wallet = (update.message.text or "").strip()
        user_row = get_user_by_tg_id(update.effective_user.id)
        if not user_row:
            ensure_user(update.effective_user)
            user_row = get_user_by_tg_id(update.effective_user.id)

        set_ton_wallet(user_row["id"], wallet)
        context.user_data["awaiting_wallet"] = False
        await update.message.reply_text(
            f"✅ Your TON wallet has been saved.՝\n<code>{wallet}</code>",
            parse_mode="HTML",
            reply_markup=main_menu_kb(),
        )
        return

    # Հակառակ դեպքում՝ մենյուի ընդհանուր text router (ցածր վ priorité)
    await handle_text(update, context)


# ===================== MAIN =====================

def main():
    init_db()
    app = Application.builder().token(BOT_TOKEN).build()

    # commands
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("admin", handle_admin))
    app.add_handler(CommandHandler("add_balance", add_balance_cmd))
    app.add_handler(CommandHandler("sub_balance", sub_balance_cmd))
    app.add_handler(CommandHandler("add_deposit", add_deposit_cmd))
    app.add_handler(CommandHandler("broadcast", broadcast_cmd))
    app.add_handler(CommandHandler("list_withdraws", list_withdraws_cmd))
    app.add_handler(CommandHandler("approve_withdraw", approve_withdraw_cmd))
    app.add_handler(CommandHandler("reject_withdraw", reject_withdraw_cmd))
    app.add_handler(MessageHandler(filters.StatusUpdate.WEB_APP_DATA, webapp_data_handler))
    app.add_handler(CommandHandler("withdraw", withdraw_cmd))


    # callbacks
    app.add_handler(CallbackQueryHandler(callback_handler))

    # text handler (ALL)
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, text_catch))

    log.info("Main Money bot started...")
    app.run_polling()


if __name__ == "__main__":
    main()
