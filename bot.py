import logging
from threading import Thread
from flask import Flask
from telegram import Update, KeyboardButton, ReplyKeyboardMarkup, WebAppInfo
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes

BOT_TOKEN = "8419124438:AAEjbuv8DtIb8GdmuBP5SKGtWs48qFEl1hc"

WEBAPP_URL = "https://vorn-studio.github.io/0059bot/webapp/"

# ---------------------------
# 1) Flask Web Server (Render)
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

    webapp_button = KeyboardButton(
        text="🎰 Բացել Domino WebApp",
        web_app=WebAppInfo(url=WEBAPP_URL)
    )

    keyboard = [[webapp_button]]
    reply_markup = ReplyKeyboardMarkup(keyboard, resize_keyboard=True)

    await update.message.reply_text(
        f"Բարև, {user.first_name}!\n\nԲացիր Domino կազինոն 👇",
        reply_markup=reply_markup
    )


def run_bot():
    app_bot = ApplicationBuilder().token(BOT_TOKEN).build()
    app_bot.add_handler(CommandHandler("start", start))

    app_bot.run_polling()


# ---------------------------
# 3) Run Flask + Telegram Together
# ---------------------------
if __name__ == "__main__":
    # Start bot in background thread
    Thread(target=run_bot).start()

    # Start Flask (Render will use port $PORT)
    import os
    port = int(os.environ.get("PORT", 5000))
    app_web.run(host="0.0.0.0", port=port)
