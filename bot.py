import logging
from telegram.ext import Application, CommandHandler, MessageHandler, CallbackQueryHandler, filters
from config import BOT_TOKEN
from database import init_db
import handlers.start as start
import handlers.menu as menu

logging.basicConfig(level=logging.INFO)

def main():
    init_db()

    app = Application.builder().token(BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", start.start_cmd))
    app.add_handler(CallbackQueryHandler(menu.menu_router))

    app.run_polling()

if __name__ == "__main__":
    main()
