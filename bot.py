import logging
import asyncio
from threading import Thread
from flask import Flask
from telegram import Update, KeyboardButton, ReplyKeyboardMarkup, WebAppInfo
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes

BOT_TOKEN = "8419124438:AAEjbuv8DtIb8GdmuBP5SKGtWs48qFEl1hc"
WEBAPP_URL = "https://vorn-studio.github.io/0059bot/webapp/"

# ---------------------------
# 1) Flask Server (Render)
# ---------------------------
app_web = Flask(__name__)

@app_web.route("/")
def home():
    return "Domino backend running"


# ---------------------------
# 2) Telegram Bot Logic
# ---------------------------
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user

    btn = KeyboardButton(
        text="🎰 Բացել Domino WebApp",
        web_app=WebAppInfo(url=WEBAPP_URL)
    )

    markup = ReplyKeyboardMarkup([[btn]], resize_keyboard=True)

    await update.message.reply_text(
        f"Բարև {user.first_name}! 👋\nՍեղմիր կոճակը՝ բացելու WebApp-ը 👇",
        reply_markup=markup
    )


async def run_bot_async():
    app_bot = ApplicationBuilder().token(BOT_TOKEN).build()
    app_bot.add_handler(CommandHandler("start", start))

    await app_bot.run_polling()


def run_bot():
    asyncio.run(run_bot_async())  # >>> ԱՅՍՏԵՂ Է ԼՈՒԾՈՒՄ Thread-ի սխալը <<<


# ---------------------------
# 3) Run Flask + Bot together
# ---------------------------
if __name__ == "__main__":
    Thread(target=run_bot, daemon=True).start()

    import os
    port = int(os.environ.get("PORT", 10000))
    app_web.run(host="0.0.0.0", port=port)
