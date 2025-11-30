import logging
import threading
import sqlite3

from flask import Flask, request, jsonify, render_template
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes

# ===============================
# CONFIG
# ===============================
BOT_TOKEN = "8001785392:AAFlfF-SkcJJqG52GCsWT7calY9YLe1aqGw"
WEBAPP_URL = "https://vorn-studio.github.io/0059bot/"  # կփոխենք ավելի ուշ

# ===============================
# FLASK APP INITIALIZATION
# ===============================
app = Flask(__name__)

@app.route("/")
def home():
    return render_template("index.html")

# ===============================
# DATABASE INITIALIZATION
# ===============================
def init_db():
    conn = sqlite3.connect("database.db")
    c = conn.cursor()

    # users table (հիմնական)
    c.execute("""
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            first_name TEXT,
            username TEXT,
            balance REAL DEFAULT 0
        )
    """)

    conn.commit()
    conn.close()

# ===============================
# TELEGRAM BOT: /start
# ===============================
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user

    # User registration
    conn = sqlite3.connect("database.db")
    c = conn.cursor()
    c.execute("INSERT OR IGNORE INTO users(user_id, first_name, username) VALUES (?,?,?)",
              (user.id, user.first_name, user.username))
    conn.commit()
    conn.close()

    # WebApp button
    keyboard = [
        [
            InlineKeyboardButton(
                "Open App 💠",
                web_app=WebAppInfo(url=WEBAPP_URL)
            )
        ]
    ]

    await update.message.reply_text(
        "Welcome! Press the button to open the app:",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )

# ===============================
# BOT + FLASK RUNNER
# ===============================
def run_flask():
    app.run(host="0.0.0.0", port=5000)

async def run_bot():
    application = ApplicationBuilder().token(BOT_TOKEN).build()
    application.add_handler(CommandHandler("start", start))

    await application.run_polling()

# ===============================
# MAIN ENTRY
# ===============================
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    init_db()

    threading.Thread(target=run_flask).start()

    import asyncio
    asyncio.run(run_bot())
