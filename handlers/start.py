from telegram import Update
from telegram.ext import ContextTypes
from database import db
import time

async def start_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    conn = db(); cur = conn.cursor()

    cur.execute("SELECT * FROM users WHERE id=%s", (user.id,))
    existing = cur.fetchone()

    if not existing:
        cur.execute("""
            INSERT INTO users (id, username, first_name, balance, created_at)
            VALUES (%s, %s, %s, %s, %s)
        """, (user.id, user.username, user.first_name, 0, int(time.time())))
        conn.commit()

    conn.close()

    await update.message.reply_text(
        "Բարի գալուստ, {}!\n\nԸնտրիր մենյու👇".format(user.first_name),
        reply_markup=menu_keyboard()
    )


from telegram import InlineKeyboardButton, InlineKeyboardMarkup

def menu_keyboard():
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("💰 Բալանս", callback_data="balance")],
        [InlineKeyboardButton("📝 Տասկեր", callback_data="tasks")],
        [InlineKeyboardButton("🎰 Կազինո", callback_data="casino")],
        [InlineKeyboardButton("🎮 Խաղեր", callback_data="games")],
        [InlineKeyboardButton("👛 Վալետ", callback_data="wallet")],
    ])
