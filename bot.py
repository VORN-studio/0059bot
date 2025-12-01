import logging
import asyncio
from flask import Flask
from telegram import Update, KeyboardButton, ReplyKeyboardMarkup, WebAppInfo
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes

BOT_TOKEN = "8419124438:AAEjbuv8DtIb8GdmuBP5SKGtWs48qFEl1hc"
WEBAPP_URL = "https://vorn-studio.github.io/0059bot/webapp/"

# ---------------------------
# Flask Web Server
# ---------------------------
app_web = Flask(__name__)

@app_web.route("/")
def home():
    return "Domino backend running"


# ---------------------------
# Telegram Bot Logic
# ---------------------------
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user

    keyboard = [[KeyboardButton(
        text="🎰 Բացել Domino WebApp",
        web_app=WebAppInfo(url=WEBAPP_URL)
    )]]

    markup = ReplyKeyboardMarkup(keyboard, resize_keyboard=True)

    await update.message.reply_text(
        f"Բարև {user.first_name}! Բացիր կազինոն 👇",
        reply_markup=markup
    )


async def run_bot():
    app_bot = ApplicationBuilder().token(BOT_TOKEN).build()
    app_bot.add_handler(CommandHandler("start", start))

    print("🤖 Telegram bot started (polling)…")
    await app_bot.run_polling()


# ---------------------------
# Run Flask + Bot Together (NO THREADS)
# ---------------------------
async def main():
    # Start Telegram bot (async background task)
    asyncio.create_task(run_bot())

    # Start Flask server (sync)
    import os
    port = int(os.environ.get("PORT", 10000))
    
    # Run Flask inside executor so asyncio keeps working
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, lambda: app_web.run(
        host="0.0.0.0",
        port=port
    ))


if __name__ == "__main__":
    asyncio.run(main())
