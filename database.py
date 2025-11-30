import os
import psycopg2
from psycopg2.extras import RealDictCursor

DB_URL = os.getenv("DB_URL")

def db():
    return psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)


def init_db():
    conn = db()
    cur = conn.cursor()

    cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id BIGINT PRIMARY KEY,
        username TEXT,
        first_name TEXT,
        balance BIGINT DEFAULT 0,
        wallet TEXT,
        referrer BIGINT,
        created_at BIGINT,
        last_active BIGINT
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS referrals (
        id SERIAL PRIMARY KEY,
        user_id BIGINT,
        invited_id BIGINT,
        created_at BIGINT
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title TEXT,
        description TEXT,
        reward BIGINT,
        url TEXT,
        vip_only BOOLEAN DEFAULT FALSE,
        created_at BIGINT
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS task_attempts (
        id SERIAL PRIMARY KEY,
        user_id BIGINT,
        task_id BIGINT,
        status TEXT DEFAULT 'pending',
        created_at BIGINT
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        text TEXT,
        created_at BIGINT
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS user_messages (
        id SERIAL PRIMARY KEY,
        user_id BIGINT,
        message_id BIGINT,
        seen BOOLEAN DEFAULT FALSE
    );
    """)

    conn.commit()
    conn.close()
