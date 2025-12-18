import time
import requests

BASE = "http://localhost:10000"

def test_api(name, url):
    start = time.time()
    try:
        r = requests.get(f"{BASE}{url}", timeout=30)
        elapsed = time.time() - start
        print(f"✅ {name}: {elapsed:.2f}s - Status: {r.status_code}")
    except Exception as e:
        elapsed = time.time() - start
        print(f"❌ {name}: {elapsed:.2f}s - Error: {e}")

print("🔥 Testing Portal APIs...")
test_api("Message Partners", "/api/message/partners?uid=1234567890")
test_api("Global Messages", "/api/global/messages")
test_api("User Profile", "/api/user/1234567890")
test_api("Feed Posts", "/api/feed/posts?uid=1234567890")
test_api("DM List", "/api/dm/list?uid=1234567890")
print("✅ Test complete")