from telegram import Update
from telegram.ext import ContextTypes
import handlers.balance as balance
import handlers.tasks as tasks
import handlers.games as games
import handlers.casino as casino
import handlers.wallet as wallet

async def menu_router(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    data = query.data

    if data == "balance":
        await balance.show_balance(update, context)

    elif data == "tasks":
        await tasks.show_tasks(update, context)

    elif data == "games":
        await games.show_games(update, context)

    elif data == "casino":
        await casino.show_casino(update, context)

    elif data == "wallet":
        await wallet.show_wallet(update, context)
