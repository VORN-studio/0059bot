# Main Money Telegram Bot

Main Money — Telegram բոտ, որը թույլ է տալիս օգտատերերին  
գումար աշխատել առաջադրանքներ կատարելով,  
իսկ VIP ներդրումների միջոցով ամեն օր ստանալ մինչև **5% վերադարձ**  
առաջադրանքների տեսքով։

## Ֆունկցիոնալ

### 👤 Օգտատեր
- `/start` — գրանցում է օգտատիրոջը բազայում
- Գլխավոր մենյու՝ Reply Keyboard-ով
- TON քաշիլոք կապում է Telegram Wallet-ի միջոցով
- Earn tasks — օրական մինչև 3 առաջադրանք
- VIP Zone — ներդրումից կախված 5% քեշբեք օրական
- Balance — բալանս, դեպոզիտ, TON քաշիլոք
- Withdraw — մին. 10 USDT, հայտը գնում է ադմինին

### 🛠 Ադմին
- `/admin` — Admin Panel
- `/add_balance <tg_id> <amount>`
- `/sub_balance <tg_id> <amount>`
- `/add_deposit <tg_id> <amount>`
- `/broadcast <text>`
- `/list_withdraws`
- `/approve_withdraw <id>`
- `/reject_withdraw <id>`

## Տեղական запуск (Local Run)

```bash
python -m venv venv
source venv/bin/activate   # Windows → venv\Scripts\activate
pip install -r requirements.txt
