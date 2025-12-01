import logging
from telegram import Update, KeyboardButton, ReplyKeyboardMarkup, WebAppInfo
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes

# 👉 ԱՅՍՏԵՂ ԵՍ ԴՆԵՍ ՔՈ ԲՈՏԻ TOKEN-Ը
BOT_TOKEN = "8419124438:AAEjbuv8DtIb8GdmuBP5SKGtWs48qFEl1hc"

# 👉 ԱՅՍՏԵՂ ԴՆԵՍ ՔՈ GitHub Pages WebApp հղումը
# օրինակ՝ "https://vorn-studio.github.io/casino-bot/webapp/"
WEBAPP_URL = "https://github.com/VORN-studio/0059bot.git"

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user

    # WebApp կոճակ
    webapp_button = KeyboardButton(
        text="🎰 Բացել Casino WebApp",
        web_app=WebAppInfo(url=WEBAPP_URL)
    )

    keyboard = [[webapp_button]]
    reply_markup = ReplyKeyboardMarkup(
        keyboard,
        resize_keyboard=True
    )

    text = (
        f"Բարև, {user.first_name}!\n\n"
        "Սա քո կազինո բոտն է․ բացի WebApp-ը և ներսում\n"
        "կտեսնես քո ID-ն, բալանսը, ռեֆերալները, wallet connect և այլն։"
    )

    await update.message.reply_text(text, reply_markup=reply_markup)


def main():
    app = ApplicationBuilder().token(BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", start))

    app.run_polling()


if __name__ == "__main__":
    main()
