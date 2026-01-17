#!/usr/bin/env python3

# Test script for withdrawal ticker functionality

import time
import random

# Initialize test data
FAKE_HISTORY = {}
AUTO_FAKE_STATUS = {}

def mask_username(username):
    """Mask username with asterisks"""
    if not username or username.length <= 4:
        return username
    first_two = username.substring(0, 2)
    last_two = username.substring(username.length - 2)
    middle_stars = '*' * (username.length - 4)
    return first_two + middle_stars + last_two

def test_mask_username():
    """Test username masking"""
    test_cases = [
        "narek0059",
        "alex1234",
        "john_doe",
        "user",
        "ab"
    ]
    
    print("Testing username masking:")
    for username in test_cases:
        masked = mask_username(username)
        print(f"  {username} -> {masked}")

def test_fake_data_generation():
    """Test fake withdrawal data generation"""
    print("\nTesting fake data generation:")
    
    # Add some test data
    admin_id = 5274439601
    FAKE_HISTORY[admin_id] = []
    
    # Generate sample withdrawals
    for i in range(5):
        amount = random.uniform(50, 500)
        amount = round(amount, 2)
        
        first_names = ["alex", "john", "mike", "david", "sarah", "emma", "lisa", "tom", "james", "mary"]
        last_names = ["son", "kov", "yan", "sky", "fox", "wolf", "star", "moon", "ice", "fire"]
        numbers = random.randint(100, 9999)
        username = f"{random.choice(first_names)}{random.choice(last_names)}{numbers}"
        
        FAKE_HISTORY[admin_id].append({
            "type": "withdraw",
            "user": username,
            "amount": amount,
            "time": int(time.time()) - random.randint(0, 86400)
        })
    
    print(f"Generated {len(FAKE_HISTORY[admin_id])} fake withdrawals:")
    for item in FAKE_HISTORY[admin_id]:
        print(f"  💰 {item['user']} - {item['amount']} DOMIT")

def test_auto_fake_status():
    """Test auto fake status management"""
    print("\nTesting auto fake status:")
    
    admin_id = 5274439601
    AUTO_FAKE_STATUS[admin_id] = {
        "active": True,
        "min_amount": 50,
        "max_amount": 500,
        "interval": 30,
        "last_generated": 0
    }
    
    print(f"Auto fake status for admin {admin_id}:")
    status = AUTO_FAKE_STATUS[admin_id]
    print(f"  Active: {status['active']}")
    print(f"  Amount range: {status['min_amount']}-{status['max_amount']} DOMIT")
    print(f"  Interval: {status['interval']} minutes")

if __name__ == "__main__":
    print("🧪 Testing Withdrawal Ticker Functionality")
    print("=" * 50)
    
    test_mask_username()
    test_fake_data_generation()
    test_auto_fake_status()
    
    print("\n✅ All tests completed!")
