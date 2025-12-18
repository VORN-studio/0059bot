import time
import psycopg2
from psycopg2 import pool
import os
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

print("🔥 Testing database performance...")

# Test 1: Direct connection
start = time.time()
conn = psycopg2.connect(DATABASE_URL)
conn_time = time.time() - start
print(f"✅ Direct connection: {conn_time:.4f}s")
conn.close()

# Test 2: Pool initialization
start = time.time()
_pool = pool.SimpleConnectionPool(minconn=1, maxconn=20, dsn=DATABASE_URL)
pool_time = time.time() - start
print(f"✅ Pool initialization: {pool_time:.4f}s")

# Test 3: Get connection from pool
start = time.time()
conn = _pool.getconn()
getconn_time = time.time() - start
print(f"✅ Get connection from pool: {getconn_time:.4f}s")

# Test 4: Query execution
c = conn.cursor()
start = time.time()
c.execute("""
    SELECT DISTINCT ON (g.id)
        g.id, g.user_id, u.username, u.avatar, u.avatar_data,
        COALESCE(pl.tier, 0) AS status_level,
        g.message, g.created_at, g.highlighted
    FROM dom_global_chat g
    LEFT JOIN dom_users u ON u.user_id = g.user_id
    LEFT JOIN dom_user_miners m ON m.user_id = u.user_id
    LEFT JOIN dom_mining_plans pl ON pl.id = m.plan_id
    ORDER BY g.id DESC
    LIMIT 30
""")
rows = c.fetchall()
query_time = time.time() - start
print(f"✅ Query execution: {query_time:.4f}s")
print(f"✅ Rows fetched: {len(rows)}")

# Test 5: Data processing
start = time.time()
messages = []
for r in rows:
    avatar_url = r[4] or r[3] or "/portal/default.png"
    messages.append({
        "id": r[0],
        "user_id": r[1],
        "username": r[2] or f"User {r[1]}",
        "avatar": avatar_url,
        "status_level": int(r[5] or 0),
        "message": r[6],
        "created_at": int(r[7]),
        "highlighted": bool(r[8] if len(r) > 8 else False)
    })
processing_time = time.time() - start
print(f"✅ Data processing: {processing_time:.4f}s")

_pool.putconn(conn)

print(f"\n🎯 TOTAL TIME: {conn_time + query_time + processing_time:.4f}s")
print(f"   - Connection: {conn_time:.4f}s")
print(f"   - Query: {query_time:.4f}s")
print(f"   - Processing: {processing_time:.4f}s")