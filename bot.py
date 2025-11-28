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
    Վերադարձնում է users.id
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
    Եթե այսօր VIP tasks չկան՝ ստեղծում ենք 3 հատ, որոնց ընդհանուր գումարը 5% ա ակտիվ դեպոզիտի.
    Վերադարձնում է tasks list.
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

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    user_id = ensure_user(user)

    text = (
        f"👋 Բարի գալուստ <b>Main Money</b> բոտ, {user.first_name}!\n\n"
        "Այստեղ դու կարող ես գումար աշխատել՝ կատարելով առաջադրանքներ,\n"
        "իսկ VIP ներդրումներով՝ ամեն օր ստանալ մինչև 5% քեշբեք առաջադրանքներով։\n\n"
        "Ընտրիր մենյուից՝"
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
            "Ընտրիր համապատասխան կոճակը մենյուից։", reply_markup=main_menu_kb()
        )


async def handle_earn_tasks(update: Update, context: ContextTypes.DEFAULT_TYPE, user_row):
    user_id = user_row["id"]
    total_dep = get_total_active_deposit(user_id)
    if total_dep <= 0:
        await update.message.reply_text(
            "Այս պահին չունես ակտիվ VIP ներդրում։\n"
            "⭐ VIP Zone բաժնում կարող ես տեսնել ներդրման պայմանները։",
            reply_markup=main_menu_kb(),
        )
        return

    # ստեղծում կամ բերում ենք այսօրվա VIP tasks
    tasks = get_or_create_today_vip_tasks(user_id)
    if not tasks:
        await update.message.reply_text(
            "Այս պահին առաջադրանքներ չկան։ Փորձիր քիչ անց։",
            reply_markup=main_menu_kb(),
        )
        return

    lines = ["📋 Քո આજօրվա VIP առաջադրանքները:\n"]
    buttons = []
    for row in tasks:
        status = "✅ Կատարված" if row["status"] == "completed" else "⏳ Սպասում"
        lines.append(
            f"{row['slot']}) {row['reward']:.4f} USDT – {status}"
        )
        if row["status"] == "pending":
            buttons.append(
                [
                    InlineKeyboardButton(
                        f"✅ Նշել {row['slot']} կատարված",
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
        "VIP-ում դու դնում ես գումար (օրինակ՝ 1000 USDT), և ամեն օր ստանում ես\n"
        "3 առաջադրանք, որոնց ամեն մեկը տալիս է 5%-ի 1/3 մասը։\n\n"
        f"Քո ընդհանուր ակտիվ դեպոզիտը՝ <b>{total_dep:.2f} USDT</b>\n\n"
        "Ներդրումները technical առումով ավելացնում է ադմինը։\n"
        "Քո ներդրման չափից կախված բոտը ավտոմատ ստեղծում է օրական առաջադրանքներ։"
    )
    await update.message.reply_text(text, parse_mode="HTML", reply_markup=main_menu_kb())


async def handle_balance(update: Update, context: ContextTypes.DEFAULT_TYPE, user_row):
    user_id = user_row["id"]
    bal = float(user_row["balance"] or 0)
    ton_wallet = user_row["ton_wallet"] or "չի կցված"
    total_dep = get_total_active_deposit(user_id)

    text = (
        "💼 <b>Քո ֆինանսական պանել</b>\n\n"
        f"Բալանս՝ <b>{bal:.4f} USDT</b>\n"
        f"Ակտիվ VIP դեպոզիտ՝ <b>{total_dep:.2f} USDT</b>\n"
        f"TON քաշիլոք՝ <b>{ton_wallet}</b>\n\n"
        "Կանխիկացման համար անհրաժեշտ մինիմումը՝ <b>10 USDT</b>։"
    )

    buttons = []
    if bal >= 10 and user_row["ton_wallet"]:
        buttons.append(
            [InlineKeyboardButton("💸 Ուղարկել կանխիկացման հայտ", callback_data="withdraw_req")]
        )

    kb = InlineKeyboardMarkup(buttons) if buttons else None
    await update.message.reply_text(text, parse_mode="HTML", reply_markup=kb or main_menu_kb())


async def handle_connect_wallet(update: Update, context: ContextTypes.DEFAULT_TYPE, user_row):
    text = (
        "🔗 <b>Connect TON wallet</b>\n\n"
        "1) Սեղմիր ստորև գտնվող կոճակը՝ բացելու համար Telegram Wallet-ը (TON)\n"
        "2) Քշիլոքում տես՝ քո TON հասցեն\n"
        "3) Պատճենիր հասցեն ու ուղարկիր ինձ այստեղ որպես մեկ տող\n\n"
        "Օրինակ՝ <code>UQDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx</code>\n\n"
        "Քո վերջին պահված հասցեն՝ "
        f"<b>{user_row['ton_wallet'] or 'չկա'}</b>"
    )
    kb = InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton(
                    "💼 Բացել Telegram Wallet", url="https://t.me/wallet"
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
        "👤 <b>Քո պրոֆիլը</b>\n\n"
        f"ID՝ <code>{user_row['tg_id']}</code>\n"
        f"Username՝ @{user_row['username'] or '—'}\n"
        f"Անուն՝ {user_row['first_name']}\n"
        f"Բալանս՝ <b>{float(user_row['balance'] or 0):.4f} USDT</b>\n"
        f"Ակտիվ դեպոզիտ՝ <b>{total_dep:.2f} USDT</b>\n"
        f"TON քաշիլոք՝ <code>{user_row['ton_wallet'] or 'չկա'}</code>\n"
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
        await query.edit_message_text("Առաջադրանքը չի գտնվել։")
        return

    if row["status"] == "completed":
        conn.close()
        await query.edit_message_text("Այս առաջադրանքը արդեն կատարված է։")
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
        f"✅ Առաջադրանքը նշվեց կատարված։ Քեզ ավելացվել է {row['reward']:.4f} USDT։"
    )


async def process_withdraw_request(query, context, user_row):
    user_id = user_row["id"]
    bal = float(user_row["balance"] or 0)
    if not user_row["ton_wallet"]:
        await query.edit_message_text("Դեռ TON քաշիլոք չես կցել։ Նախ կցիր քաշիլոքը։")
        return
    if bal < 10:
        await query.edit_message_text(
            f"Կանխիկացման համար պետք է առնվազն 10 USDT։ Քո բալանսը՝ {bal:.4f} USDT։"
        )
        return

    amount = bal  # ամբողջ բալանսը
    wid, err = create_withdrawal(user_id, amount)
    if err == "no_wallet":
        await query.edit_message_text("Դեռ TON քաշիլոք չես կցել։")
        return
    if err == "not_enough_balance":
        await query.edit_message_text("Բալանսը բավարար չէ։")
        return

    # ահազանգում ենք ադմինին
    user = get_user_internal(user_id)
    msg = (
        f"💸 <b>Նոր կանխիկացման հայտ</b>\n\n"
        f"Withdraw ID: <code>{wid}</code>\n"
        f"User tg_id: <code>{user['tg_id']}</code>\n"
        f"Username: @{user['username'] or '—'}\n"
        f"Amount: <b>{amount:.4f} USDT</b>\n"
        f"TON wallet: <code>{user['ton_wallet']}</code>\n\n"
        f"Հրամաններ՝\n"
        f"/approve_withdraw {wid} – նշել որպես approved\n"
        f"/reject_withdraw {wid} – նշել որպես rejected\n"
    )
    try:
        await context.bot.send_message(ADMIN_ID, msg, parse_mode="HTML")
    except Exception as e:
        log.error(f"Error notifying admin: {e}")

    await query.edit_message_text(
        "✅ Քո կանխիկացման հայտը ուղարկվեց ադմինին։\n"
        "Ադմինը կստուգի և կուղարկի գումարը քո TON քաշիլոքին։"
    )


# ===================== ADMIN COMMANDS =====================

def admin_only(func):
    async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE):
        user = update.effective_user
        if user.id != ADMIN_ID:
            await update.message.reply_text("Դու ադմին չես։")
            return
        return await func(update, context)

    return wrapper


async def handle_admin(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    if user.id != ADMIN_ID:
        await update.message.reply_text("Դու ադմին չես։")
        return
    await update.message.reply_text(admin_menu_text(), parse_mode="HTML")


@admin_only
async def add_balance_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    args = context.args
    if len(args) != 2:
        await update.message.reply_text("Օգտագործում՝ /add_balance <tg_id> <amount>")
        return
    tg_id = int(args[0])
    amount = float(args[1])

    u = get_user_by_tg_id(tg_id)
    if not u:
        await update.message.reply_text("Օգտատերը չի գտնվել։")
        return
    update_balance(u["id"], amount)
    await update.message.reply_text(
        f"Օգտատերի @{u['username'] or u['tg_id']} բալանսին ավելացվեց {amount} USDT։"
    )


@admin_only
async def sub_balance_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    args = context.args
    if len(args) != 2:
        await update.message.reply_text("Օգտագործում՝ /sub_balance <tg_id> <amount>")
        return
    tg_id = int(args[0])
    amount = float(args[1])

    u = get_user_by_tg_id(tg_id)
    if not u:
        await update.message.reply_text("Օգտատերը չի գտնվել։")
        return
    update_balance(u["id"], -amount)
    await update.message.reply_text(
        f"Օգտատերի @{u['username'] or u['tg_id']} բալանսից հանվեց {amount} USDT։"
    )


@admin_only
async def add_deposit_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    args = context.args
    if len(args) != 2:
        await update.message.reply_text("Օգտագործում՝ /add_deposit <tg_id> <amount>")
        return
    tg_id = int(args[0])
    amount = float(args[1])

    u = get_user_by_tg_id(tg_id)
    if not u:
        await update.message.reply_text("Օգտատերը չի գտնվել։")
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
        f"Ավելացվեց {amount} USDT VIP դեպոզիտ օգտատերի @{u['username'] or u['tg_id']} համար։"
    )


@admin_only
async def broadcast_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text("Օգտագործում՝ /broadcast <text>")
        return
    text = update.message.text.partition(" ")[2].strip()
    if not text:
        await update.message.reply_text("Տեքստը դատարկ է։")
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

    await update.message.reply_text(f"Ուղարկվեց {sent} օգտատերի։")


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
        await update.message.reply_text("Pending կանխիկացումներ չկան։")
        return

    lines = ["💸 Pending withdraw requests:\n"]
    for r in rows:
        dt = datetime.fromtimestamp(r["created_at"]).strftime("%Y-%m-%d %H:%M")
        lines.append(
            f"ID {r['id']}: {r['amount']:.4f} USDT | @{r['username'] or r['tg_id']} | {dt}\n"
            f"Wallet: {r['ton_wallet']}"
        )
    await update.message.reply_text("\n\n".join(lines))


@admin_only
async def approve_withdraw_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    args = context.args
    if len(args) != 1:
        await update.message.reply_text("Օգտագործում՝ /approve_withdraw <id>")
        return
    wid = int(args[0])

    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM withdrawals WHERE id = ?", (wid,))
    row = c.fetchone()
    if not row:
        conn.close()
        await update.message.reply_text("Քաշվող հայտը չի գտնվել։")
        return

    if row["status"] != "pending":
        conn.close()
        await update.message.reply_text("Այս հայտը pending վիճակում չէ։")
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
            f"✅ Քո {row['amount']:.4f} USDT կանխիկացման հայտը հաստատվել է։ Գումարը ուղարկվել է քո TON քաշիլոքին։",
        )
    except Exception:
        pass

    await update.message.reply_text("Հայտը նշվեց approved։")


@admin_only
async def reject_withdraw_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    args = context.args
    if len(args) != 1:
        await update.message.reply_text("Օգտագործում՝ /reject_withdraw <id>")
        return
    wid = int(args[0])

    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM withdrawals WHERE id = ?", (wid,))
    row = c.fetchone()
    if not row:
        conn.close()
        await update.message.reply_text("Քաշվող հայտը չի գտնվել։")
        return

    if row["status"] != "pending":
        conn.close()
        await update.message.reply_text("Այս հայտը pending վիճակում չէ։")
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
            f"❌ Քո {row['amount']:.4f} USDT կանխիկացման հայտը մերժվել է։ Մանրամասների համար գրիր ադմինին։",
        )
    except Exception:
        pass

    await update.message.reply_text("Հայտը նշվեց rejected։")


# ===================== TEXT CATCH (wallet input) =====================

async def text_catch(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """
    Սա այն վայրն է, որտեղ լսում ենք՝ օգտատերը TON քաշիլոք է ուղարկում,
    թե պարզապես սեղմում է մենյուի կոճակները։
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
            f"✅ Քո TON քաշիլոքը պահպանվեց՝\n<code>{wallet}</code>",
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

    # callbacks
    app.add_handler(CallbackQueryHandler(callback_handler))

    # text handler (ALL)
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, text_catch))

    log.info("Main Money bot started...")
    app.run_polling()


if __name__ == "__main__":
    main()
