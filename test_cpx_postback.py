import hashlib
import time
import requests

# Ձեր տվյալները
CPX_SECURE_HASH = "O9etSikE3jCe4hnoU2OvawUPdxkkNgXV"
BASE_URL = "https://domino-play.online"

def test_postback():
    print("--- CPX Postback Test ---")
    
    # 1. Գեներացնենք թեստային տվյալներ
    trans_id = f"test_{int(time.time())}"
    user_id = "5274439601" # Ձեր ID-ն (նկարից վերցված)
    amount_usd = "0.10"
    status = "1" # 1 = Completed/Credited
    
    # 2. Հաշվարկենք MD5 hash-ը (ճիշտ այնպես, ինչպես CPX-ն է անում)
    # Formula: md5(trans_id + "-" + secure_hash)
    to_hash = f"{trans_id}-{CPX_SECURE_HASH}"
    calc_hash = hashlib.md5(to_hash.encode()).hexdigest()
    
    print(f"Transaction ID: {trans_id}")
    print(f"Secure Hash: {CPX_SECURE_HASH}")
    print(f"Calculated Hash: {calc_hash}")
    
    # 3. Ստեղծենք հղումը
    url = f"{BASE_URL}/api/postback/cpx?status={status}&trans_id={trans_id}&user_id={user_id}&amount_usd={amount_usd}&hash={calc_hash}"
    
    print("\n[Քայլ 1] Ստուգեք այս հղումը (կարող եք սեղմել):")
    print(url)
    
    # 4. Ուղարկենք հարցումը (ավտոմատ)
    print("\n[Քայլ 2] Փորձում ենք ուղարկել հարցումը...")
    try:
        response = requests.get(url)
        print(f"Status Code: {response.status_code}")
        print(f"Response Text: {response.text}")
        
        if response.status_code == 200 and response.text == "OK":
            print("\n✅ ԹԵՍՏԸ ՀԱՋՈՂՎԵՑ: Ձեր բոտը ճիշտ ընդունեց Postback-ը:")
            print(f"Ստուգեք բոտի մեջ, {user_id} օգտատիրոջ հաշվին պետք է ավելանար $0.10:")
        else:
            print("\n❌ ՍԽԱԼ: Բոտը չընդունեց հարցումը:")
    except Exception as e:
        print(f"\n❌ Չհաջողվեց միանալ սերվերին: {e}")

if __name__ == "__main__":
    test_postback()
