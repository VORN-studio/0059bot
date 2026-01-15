#!/usr/bin/env python3
"""
Test script to verify Pyrogram configuration
"""

import os
from dotenv import load_dotenv
from pyrogram import Client
from pyrogram.errors import Exception as PyrogramException

# Load environment variables
load_dotenv()

# Get configuration
BOT_TOKEN = "8419124438:AAEjbuv8DtIb8GdmuBP5SKGtWs48qFEl1hc"
PYROGRAM_API_ID = os.getenv("PYROGRAM_API_ID", "").strip()
PYROGRAM_API_HASH = os.getenv("PYROGRAM_API_HASH", "").strip()

print("🔍 Pyrogram Configuration Test")
print("=" * 40)

# Check environment variables
print(f"BOT_TOKEN: {'✅ Set' if BOT_TOKEN else '❌ Missing'}")
print(f"PYROGRAM_API_ID: {'✅ Set' if PYROGRAM_API_ID else '❌ Missing'}")
print(f"PYROGRAM_API_HASH: {'✅ Set' if PYROGRAM_API_HASH else '❌ Missing'}")

if not PYROGRAM_API_ID or not PYROGRAM_API_HASH:
    print("\n❌ Missing required environment variables!")
    print("Please add these to your .env file:")
    print("PYROGRAM_API_ID=your_api_id_here")
    print("PYROGRAM_API_HASH=your_api_hash_here")
    print("\nGet these from: https://my.telegram.org")
    exit(1)

try:
    api_id = int(PYROGRAM_API_ID)
    if api_id <= 0:
        raise ValueError("API_ID must be positive")
    print(f"✅ API_ID format is valid: {api_id}")
except ValueError as e:
    print(f"❌ Invalid API_ID: {e}")
    exit(1)

print("\n🔍 Testing Pyrogram client connection...")

try:
    app = Client(
        "test_session",
        api_id=api_id,
        api_hash=PYROGRAM_API_HASH,
        bot_token=BOT_TOKEN,
        in_memory=True
    )
    
    print("✅ Client created successfully")
    
    # Test connection
    import asyncio
    
    async def test_connection():
        try:
            await app.start()
            print("✅ Connected to Telegram successfully")
            
            # Get bot info
            bot_info = await app.get_me()
            print(f"✅ Bot info: @{bot_info.username} ({bot_info.first_name})")
            
            await app.stop()
            print("✅ Disconnected successfully")
            return True
            
        except PyrogramException as e:
            print(f"❌ Pyrogram error: {e}")
            return False
        except Exception as e:
            print(f"❌ Connection error: {e}")
            return False
    
    result = asyncio.run(test_connection())
    
    if result:
        print("\n🎉 Pyrogram configuration is correct!")
        print("Page verification should work properly.")
    else:
        print("\n❌ Pyrogram configuration failed!")
        print("Please check your API credentials.")
        
except Exception as e:
    print(f"❌ Failed to create client: {e}")
    exit(1)
