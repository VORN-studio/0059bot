# Pyrogram API հավատարման տվյալների ավելացում

## Խնդիր
Ձեր .env ֆայլում բացակայում են PYROGRAM_API_ID և PYROGRAM_API_HASH։

## Ինչպես ստանալ API հավատարման տվյալներ

1. **Այցելեք** https://my.telegram.org
2. **Մուտք գործեք** ձեր Telegram հաշվով
3. **Գնացեք** "API development tools"
4. **Սեղմեք** "Create new application"
5. **Լրացրեք դաշտերը։**
   - App title: Domino Bot
   - Short name: domino-bot
   - Platform: Desktop
   - Description: Telegram bot for Domino game
6. **Ստացեք API հավատարման տվյալները։**

## Ինչպես ավելացնել .env ֆայլում

Բացեք .env ֆայլը և ավելացրեք այդ տողերը՝

```
PYROGRAM_API_ID=12345678
PYROGRAM_API_HASH=abcdef1234567890abcdef1234567890
```

**Նշումներ․**
- PYROGRAM_API_ID-ն պետք է լինի թիվ (օրինակ՝ 12345678)
- PYROGRAM_API_HASH-ը պետք է լինի 32 նիշանի տող
- Փոխարինեք 12345678 և abcdef... ձեր իրական տվյալներով

## Ստուգում

Ավելացնելուց հետո ստուգեք՝

```bash
python test_pyrogram.py
```

Եթե ամեն իրավ է, կտեսնեք՝
```
🎉 Pyrogram configuration is correct!
Page verification should work properly.
```

## Վերամեկնարկ

```bash
python bot.py
```

Պետք է տեսնել՝
```
🔍 Pyrogram config check:
   API_ID: ✅ Set
   API_HASH: ✅ Set
✅ Pyrogram client configured successfully
```
