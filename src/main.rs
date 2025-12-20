use tokio_cron_scheduler::{JobScheduler, Job};
use rand::Rng;
use chrono::{DateTime, Utc, Duration, NaiveDateTime};
use std::env;
use image::{DynamicImage, ImageFormat};
use std::io::Cursor;
use base64::{Engine as _, engine::general_purpose};
use dotenv::dotenv;
use std::time::{SystemTime, Duration as StdDuration};
use std::thread;
use std::sync::Arc;
use tokio::sync::Mutex;
use actix_web::{
    web, App, HttpServer, HttpResponse, Result as ActixResult,
    middleware::Logger,
};
use actix_files as fs;
use actix_cors::Cors;
use actix_multipart::Multipart;
use socketio::{SocketIo, Socket};
use tokio;
use sqlx::{PgPool, postgres::PgPoolOptions, Row};
use teloxide::{
    prelude::*,
    types::{
        InlineKeyboardMarkup,
        InlineKeyboardButton,
        WebAppInfo,
    },
};
use log::{info, error, warn, debug};
use env_logger;

use std::path::PathBuf;
use std::fs;

let log_dir = PathBuf::from("logs");
fs::create_dir_all(&log_dir).ok();

let log_file = log_dir.join("domino.log");

env_logger::Builder::from_env(
    env_logger::Env::default().default_filter_or("info")
)
.format_timestamp_secs()
.init();

struct PrintToLogger {
    prefix: String,
}

impl PrintToLogger {
    fn new(prefix: &str) -> Self {
        PrintToLogger {
            prefix: prefix.to_string(),
        }
    }

    fn write(&self, message: &str) {
        let msg = message.trim_end();
        if !msg.is_empty() {
            log::info!("{}{}", self.prefix, msg);
        }
    }

    fn flush(&self) {
        // required for file-like interface
    }
}

// Rust-ում stdout/stderr redirect-ը տարբեր է
// Logging-ը ավտոմատ է env_logger-ով
// Այս տողերը skip անում ենք, քանի որ Rust-ում print! և eprintln! 
// ուղղակի console են գնում, log::info!() և log::error!() logging են անում

let bot_token = env::var("BOT_TOKEN")
    .expect("BOT_TOKEN env var is missing")
    .trim()
    .to_string();

let base_url = env::var("BASE_URL")
    .unwrap_or_else(|_| "https://domino-play.online".to_string())
    .trim()
    .to_string();

let database_url = env::var("DATABASE_URL")
    .expect("DATABASE_URL env var is missing (PostgreSQL connection string)")
    .trim()
    .to_string();

const ADMIN_IDS: [i64; 1] = [5274439601];

let base_dir = std::env::current_dir().unwrap();
let webapp_dir = base_dir.join("webapp");

const DOMIT_PRICE_USD: f64 = 1.0;

let portal_dir = webapp_dir.join("portal");
let tasks_dir = webapp_dir.join("tasks");
let games_dir = webapp_dir.join("games");

static mut BOT_READY: bool = false;

use std::collections::HashMap;
let online_users: Arc<Mutex<HashMap<i64, DateTime<Utc>>>> = Arc::new(Mutex::new(HashMap::new()));

let app_web = HttpServer::new(|| {
    App::new()
        .wrap(Cors::permissive())
        .service(fs::Files::new("/static", "webapp/static"))
});

let socketio = SocketIo::builder()
    .build();

socketio.on("join_chart", |socket: Socket| async move {
    socket.join("chart_viewers").ok();
    log::info!("👤 User joined chart_viewers room");
});

socketio.on("leave_chart", |socket: Socket| async move {
    socket.leave("chart_viewers").ok();
    log::info!("👋 User left chart_viewers room");
});

async fn index() -> ActixResult<HttpResponse> {
    Ok(HttpResponse::Ok()
        .body("✅ Domino backend is online. Go to /app for WebApp."))
}

async fn app_page() -> ActixResult<fs::NamedFile> {
    let webapp_dir = PathBuf::from("webapp");
    let file = fs::NamedFile::open(webapp_dir.join("index.html"))?;
    Ok(file)
}

async fn serve_webapp(path: web::Path<String>) -> ActixResult<fs::NamedFile> {
    let filename = path.into_inner();
    let webapp_dir = PathBuf::from("webapp");
    let file_path = webapp_dir.join(&filename);
    
    let mut file = fs::NamedFile::open(file_path)?;
    
    if filename.ends_with(".mp4") {
        file = file
            .set_content_type("video/mp4".parse().unwrap())
            .use_etag(false)
            .use_last_modified(true);
    } else if filename.ends_with(".png") || filename.ends_with(".jpg") || 
              filename.ends_with(".jpeg") || filename.ends_with(".gif") || 
              filename.ends_with(".webp") || filename.ends_with(".ico") {
        file = file.use_etag(true).use_last_modified(true);
    } else if filename.ends_with(".css") || filename.ends_with(".js") {
        file = file.use_etag(false);
    }
    
    Ok(file)
}

#[derive(serde::Serialize)]
struct PartnerUser {
    user_id: i64,
    username: String,
    avatar: String,
    last_text: String,
    last_time: i64,
    unread: i64,
    can_reply: bool,
}

async fn api_message_partners(
    query: web::Query<std::collections::HashMap<String, String>>,
    pool: web::Data<PgPool>,
) -> ActixResult<HttpResponse> {
    let uid = query.get("uid")
        .and_then(|s| s.parse::<i64>().ok())
        .ok_or_else(|| actix_web::error::ErrorBadRequest("no uid"))?;

    // 1) բոլոր partner id-ները
    let partner_ids: Vec<i64> = sqlx::query_scalar(
        "SELECT DISTINCT
            CASE
                WHEN sender = $1 THEN receiver
                ELSE sender
            END AS partner_id
        FROM dom_messages
        WHERE sender = $1 OR receiver = $1
        ORDER BY partner_id"
    )
    .bind(uid)
    .fetch_all(pool.get_ref())
    .await
    .unwrap_or_default();

    if partner_ids.is_empty() {
        return Ok(HttpResponse::Ok().json(serde_json::json!({"ok": true, "users": []})));
    }

    // 2) partner users info
    let rows = sqlx::query(
        "SELECT user_id, username, avatar
        FROM dom_users
        WHERE user_id = ANY($1)"
    )
    .bind(&partner_ids)
    .fetch_all(pool.get_ref())
    .await
    .unwrap_or_default();

    let mut users = Vec::new();
    for row in rows {
        let partner_id: i64 = row.get(0);
        let username: Option<String> = row.get(1);
        let avatar: Option<String> = row.get(2);

        let avatar_url = avatar.unwrap_or_else(|| "/portal/default.png".to_string());
        let username = username.unwrap_or_else(|| format!("User {}", partner_id));

        // --- last message preview ---
        let lm = sqlx::query(
            "SELECT id, sender, text, created_at
            FROM dom_messages
            WHERE (sender=$1 AND receiver=$2) OR (sender=$2 AND receiver=$1)
            ORDER BY id DESC
            LIMIT 1"
        )
        .bind(uid)
        .bind(partner_id)
        .fetch_optional(pool.get_ref())
        .await
        .unwrap_or(None);

        let (last_text, last_time) = if let Some(msg) = lm {
            let text: String = msg.get(2);
            let time: i64 = msg.get(3);
            (text, time)
        } else {
            (String::new(), 0)
        };

        // --- last seen ---
        let seen_id: i64 = sqlx::query_scalar(
            "SELECT COALESCE(last_seen_msg_id, 0)
            FROM dom_dm_last_seen
            WHERE user_id=$1 AND partner_id=$2"
        )
        .bind(uid)
        .bind(partner_id)
        .fetch_optional(pool.get_ref())
        .await
        .unwrap_or(None)
        .unwrap_or(0);

        // --- unread ---
        let unread: i64 = sqlx::query_scalar(
            "SELECT COUNT(*)
            FROM dom_messages
            WHERE sender=$1 AND receiver=$2 AND id > $3"
        )
        .bind(partner_id)
        .bind(uid)
        .bind(seen_id)
        .fetch_one(pool.get_ref())
        .await
        .unwrap_or(0);

        // --- can reply? ---
        let can_reply = sqlx::query_scalar::<_, i64>(
            "SELECT 1 FROM dom_follows WHERE follower=$1 AND target=$2"
        )
        .bind(uid)
        .bind(partner_id)
        .fetch_optional(pool.get_ref())
        .await
        .unwrap_or(None)
        .is_some();

        users.push(PartnerUser {
            user_id: partner_id,
            username,
            avatar: avatar_url,
            last_text,
            last_time,
            unread,
            can_reply,
        });
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({"ok": true, "users": users})))
}

#[derive(serde::Serialize)]
struct GlobalMessage {
    id: i64,
    user_id: i64,
    username: String,
    avatar: String,
    status_level: i32,
    message: String,
    created_at: i64,
    highlighted: bool,
}

async fn api_global_messages(pool: web::Data<PgPool>) -> ActixResult<HttpResponse> {
    let rows = sqlx::query(
        "SELECT DISTINCT ON (g.id)
            g.id,
            g.user_id,
            u.username,
            u.avatar,
            COALESCE(pl.tier, 0) AS status_level,
            g.message,
            g.created_at,
            g.highlighted
        FROM dom_global_chat g
        LEFT JOIN dom_users u ON u.user_id = g.user_id
        LEFT JOIN dom_user_miners m ON m.user_id = u.user_id
        LEFT JOIN dom_mining_plans pl ON pl.id = m.plan_id
        ORDER BY g.id DESC
        LIMIT 30"
    )
    .fetch_all(pool.get_ref())
    .await
    .unwrap_or_default();

    let mut messages: Vec<GlobalMessage> = rows.iter().map(|r| {
        let avatar: Option<String> = r.get(3);
        let avatar_url = avatar.unwrap_or_else(|| "/portal/default.png".to_string());
        let username: Option<String> = r.get(2);
        let user_id: i64 = r.get(1);
        let highlighted: Option<bool> = r.try_get(7).ok();

        GlobalMessage {
            id: r.get(0),
            user_id,
            username: username.unwrap_or_else(|| format!("User {}", user_id)),
            avatar: avatar_url,
            status_level: r.get::<i32, _>(4),
            message: r.get(5),
            created_at: r.get(6),
            highlighted: highlighted.unwrap_or(false),
        }
    }).collect();

    messages.reverse();

    Ok(HttpResponse::Ok().json(serde_json::json!({"ok": true, "messages": messages})))
}

#[derive(serde::Serialize)]
struct HotUser {
    user_id: i64,
    username: String,
    avatar: String,
    status_level: i32,
}

async fn api_global_hot_user(pool: web::Data<PgPool>) -> ActixResult<HttpResponse> {
    let rows = sqlx::query(
        "SELECT 
            o.user_id,
            u.username,
            u.avatar,
            (SELECT COALESCE(MAX(pl.tier), 0)
             FROM dom_user_miners m
             JOIN dom_mining_plans pl ON pl.id = m.plan_id
             WHERE m.user_id = u.user_id) AS status_level
        FROM dom_global_chat_online o
        LEFT JOIN dom_users u ON u.user_id = o.user_id"
    )
    .fetch_all(pool.get_ref())
    .await
    .unwrap_or_default();

    if rows.is_empty() {
        return Ok(HttpResponse::Ok().json(serde_json::json!({"ok": true, "hot_user": null})));
    }

    // Filter only status 6+ users
    let eligible: Vec<_> = rows.iter()
        .filter(|r| r.get::<i32, _>(3) >= 6)
        .collect();

    if eligible.is_empty() {
        return Ok(HttpResponse::Ok().json(serde_json::json!({"ok": true, "hot_user": null})));
    }

    // Find highest status
    let max_status = eligible.iter()
        .map(|r| r.get::<i32, _>(3))
        .max()
        .unwrap();

    // Get all users with max status
    let top_users: Vec<_> = eligible.iter()
        .filter(|r| r.get::<i32, _>(3) == max_status)
        .collect();

    // Random choice if multiple
    use rand::seq::SliceRandom;
    let mut rng = rand::thread_rng();
    let chosen = top_users.choose(&mut rng).unwrap();

    let avatar: Option<String> = chosen.get(2);
    let avatar_url = avatar.unwrap_or_else(|| "/portal/default.png".to_string());
    let username: Option<String> = chosen.get(1);
    let user_id: i64 = chosen.get(0);

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "hot_user": HotUser {
            user_id,
            username: username.unwrap_or_else(|| format!("User {}", user_id)),
            avatar: avatar_url,
            status_level: chosen.get(3),
        }
    })))
}

async fn api_global_ping(
    body: web::Json<serde_json::Value>,
    pool: web::Data<PgPool>,
) -> ActixResult<HttpResponse> {
    let user_id = body.get("user_id")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);

    if user_id == 0 {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({"ok": false})));
    }

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    sqlx::query(
        "INSERT INTO dom_global_chat_online (user_id, last_ping)
        VALUES ($1, $2)
        ON CONFLICT (user_id) DO UPDATE SET last_ping = $2"
    )
    .bind(user_id)
    .bind(now)
    .execute(pool.get_ref())
    .await
    .ok();

    // Clean offline users (>15 seconds)
    sqlx::query(
        "DELETE FROM dom_global_chat_online
        WHERE last_ping < $1"
    )
    .bind(now - 15)
    .execute(pool.get_ref())
    .await
    .ok();

    Ok(HttpResponse::Ok().json(serde_json::json!({"ok": true})))
}

async fn api_global_offline(
    body: web::Json<serde_json::Value>,
    pool: web::Data<PgPool>,
) -> ActixResult<HttpResponse> {
    let user_id = body.get("user_id")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);

    if user_id == 0 {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({"ok": false})));
    }

    sqlx::query(
        "DELETE FROM dom_global_chat_online
        WHERE user_id = $1"
    )
    .bind(user_id)
    .execute(pool.get_ref())
    .await
    .ok();

    Ok(HttpResponse::Ok().json(serde_json::json!({"ok": true})))
}

async fn api_global_send(
    body: web::Json<serde_json::Value>,
    pool: web::Data<PgPool>,
    socketio: web::Data<SocketIo>,
) -> ActixResult<HttpResponse> {
    let user_id = body.get("user_id")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let message = body.get("message")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();

    if user_id == 0 || message.is_empty() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "ok": false,
            "error": "bad_params"
        })));
    }

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    // Get user status
    let status_level: i32 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(pl.tier), 0)
        FROM dom_user_miners m
        JOIN dom_mining_plans pl ON pl.id = m.plan_id
        WHERE m.user_id = $1"
    )
    .bind(user_id)
    .fetch_one(pool.get_ref())
    .await
    .unwrap_or(0);

    // ✅ CHECK LENGTH LIMIT
    let max_length = if status_level >= 5 { 500 } else { 200 };
    if message.len() > max_length {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "ok": false,
            "error": "too_long",
            "max_length": max_length
        })));
    }

    // ✅ CHECK COOLDOWN (Status 0-4 only)
    if status_level < 5 {
        let last_time: Option<i64> = sqlx::query_scalar(
            "SELECT last_message_at FROM dom_global_chat_cooldowns
            WHERE user_id = $1"
        )
        .bind(user_id)
        .fetch_optional(pool.get_ref())
        .await
        .unwrap_or(None);

        if let Some(last_time) = last_time {
            let elapsed = now - last_time;

            if elapsed < 10 {
                return Ok(HttpResponse::TooManyRequests().json(serde_json::json!({
                    "ok": false,
                    "error": "cooldown",
                    "wait": 10 - elapsed
                })));
            }
        }

        // Update cooldown
        sqlx::query(
            "INSERT INTO dom_global_chat_cooldowns (user_id, last_message_at)
            VALUES ($1, $2)
            ON CONFLICT (user_id) DO UPDATE SET last_message_at = $2"
        )
        .bind(user_id)
        .bind(now)
        .execute(pool.get_ref())
        .await
        .ok();
    }

    // ✅ Check if highlight is requested
    let mut highlight = body.get("highlight")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    // Only Status 7+ can highlight
    if highlight && status_level < 7 {
        highlight = false;
    }

    // Insert message
    let msg_id: i64 = sqlx::query_scalar(
        "INSERT INTO dom_global_chat (user_id, message, created_at, highlighted)
        VALUES ($1, $2, $3, $4)
        RETURNING id"
    )
    .bind(user_id)
    .bind(&message)
    .bind(now)
    .bind(highlight)
    .fetch_one(pool.get_ref())
    .await
    .unwrap();

    // Get user info
    let user_row = sqlx::query(
        "SELECT username, avatar
        FROM dom_users WHERE user_id = $1"
    )
    .bind(user_id)
    .fetch_optional(pool.get_ref())
    .await
    .unwrap_or(None);

    let (username, avatar) = if let Some(u) = user_row {
        let uname: Option<String> = u.get(0);
        let ava: Option<String> = u.get(1);
        (
            uname.unwrap_or_else(|| format!("User {}", user_id)),
            ava.unwrap_or_else(|| "/portal/default.png".to_string())
        )
    } else {
        (format!("User {}", user_id), "/portal/default.png".to_string())
    };

    // Clean old messages (keep last 30)
    sqlx::query(
        "DELETE FROM dom_global_chat
        WHERE id NOT IN (
            SELECT id FROM dom_global_chat
            ORDER BY id DESC
            LIMIT 30
        )"
    )
    .execute(pool.get_ref())
    .await
    .ok();

    // Broadcast to all
    socketio.to("global").emit("global_new", serde_json::json!({
        "id": msg_id,
        "user_id": user_id,
        "username": username,
        "avatar": avatar,
        "status_level": status_level,
        "message": message,
        "time": now,
        "highlighted": highlight
    })).ok();

    Ok(HttpResponse::Ok().json(serde_json::json!({"ok": true, "id": msg_id})))
}

async fn delete_chat_message(
    body: web::Json<serde_json::Value>,
    pool: web::Data<PgPool>,
) -> ActixResult<HttpResponse> {
    let message_id = body.get("message_id")
        .and_then(|v| v.as_i64());
    let user_id = body.get("user_id")
        .and_then(|v| v.as_i64());

    if message_id.is_none() || user_id.is_none() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Missing parameters"
        })));
    }

    let message_id = message_id.unwrap();
    let user_id = user_id.unwrap();

    let result = sqlx::query(
        "DELETE FROM dom_global_chat 
        WHERE id = $1 AND user_id = $2"
    )
    .bind(message_id)
    .bind(user_id)
    .execute(pool.get_ref())
    .await;

    match result {
        Ok(r) => {
            if r.rows_affected() == 0 {
                Ok(HttpResponse::NotFound().json(serde_json::json!({
                    "error": "Not found or unauthorized"
                })))
            } else {
                log::info!("User {} deleted global message {}", user_id, message_id);
                Ok(HttpResponse::Ok().json(serde_json::json!({"success": true})))
            }
        }
        Err(e) => {
            log::error!("Delete chat message error: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": e.to_string()
            })))
        }
    }
}

async fn delete_dm_message(
    body: web::Json<serde_json::Value>,
    pool: web::Data<PgPool>,
) -> ActixResult<HttpResponse> {
    let message_id = body.get("message_id")
        .and_then(|v| v.as_i64());
    let user_id = body.get("user_id")
        .and_then(|v| v.as_i64());

    if message_id.is_none() || user_id.is_none() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Missing parameters"
        })));
    }

    let message_id = message_id.unwrap();
    let user_id = user_id.unwrap();

    let result = sqlx::query(
        "DELETE FROM dom_messages
        WHERE id = $1 AND sender = $2"
    )
    .bind(message_id)
    .bind(user_id)
    .execute(pool.get_ref())
    .await;

    match result {
        Ok(r) => {
            if r.rows_affected() == 0 {
                Ok(HttpResponse::NotFound().json(serde_json::json!({
                    "error": "Not found or unauthorized"
                })))
            } else {
                log::info!("User {} deleted DM {}", user_id, message_id);
                Ok(HttpResponse::Ok().json(serde_json::json!({"success": true})))
            }
        }
        Err(e) => {
            log::error!("Delete DM error: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": e.to_string()
            })))
        }
    }
}

async fn api_message_react(
    body: web::Json<serde_json::Value>,
    pool: web::Data<PgPool>,
    socketio: web::Data<SocketIo>,
) -> ActixResult<HttpResponse> {
    let message_id = body.get("message_id")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let chat_type = body.get("chat_type")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let user_id = body.get("user_id")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let emoji = body.get("emoji")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();

    if message_id == 0 || user_id == 0 || emoji.is_empty() || 
       (chat_type != "global" && chat_type != "dm") {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({"ok": false})));
    }

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    // Toggle reaction (եթե կա՝ հեռացնի, եթե չկա՝ ավելացնի)
    let existing: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM dom_message_reactions
        WHERE message_id=$1 AND chat_type=$2 AND user_id=$3 AND emoji=$4"
    )
    .bind(message_id)
    .bind(chat_type)
    .bind(user_id)
    .bind(emoji)
    .fetch_optional(pool.get_ref())
    .await
    .unwrap_or(None);

    let action = if existing.is_some() {
        // Remove reaction
        sqlx::query(
            "DELETE FROM dom_message_reactions
            WHERE message_id=$1 AND chat_type=$2 AND user_id=$3 AND emoji=$4"
        )
        .bind(message_id)
        .bind(chat_type)
        .bind(user_id)
        .bind(emoji)
        .execute(pool.get_ref())
        .await
        .ok();
        "removed"
    } else {
        // ✅ First, remove any other reaction from this user
        sqlx::query(
            "DELETE FROM dom_message_reactions
            WHERE message_id=$1 AND chat_type=$2 AND user_id=$3"
        )
        .bind(message_id)
        .bind(chat_type)
        .bind(user_id)
        .execute(pool.get_ref())
        .await
        .ok();

        // Then add new reaction
        sqlx::query(
            "INSERT INTO dom_message_reactions (message_id, chat_type, user_id, emoji, created_at)
            VALUES ($1, $2, $3, $4, $5)"
        )
        .bind(message_id)
        .bind(chat_type)
        .bind(user_id)
        .bind(emoji)
        .bind(now)
        .execute(pool.get_ref())
        .await
        .ok();
        "added"
    };

    // Get total reactions for this message
    let reaction_rows = sqlx::query(
        "SELECT emoji, COUNT(*) as count
        FROM dom_message_reactions
        WHERE message_id=$1 AND chat_type=$2
        GROUP BY emoji"
    )
    .bind(message_id)
    .bind(chat_type)
    .fetch_all(pool.get_ref())
    .await
    .unwrap_or_default();

    let mut reactions = serde_json::Map::new();
    for row in reaction_rows {
        let emoji: String = row.get(0);
        let count: i64 = row.get(1);
        reactions.insert(emoji, serde_json::json!(count));
    }

    if chat_type == "global" {
        // Get fire count
        let fire_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM dom_fire_reactions 
            WHERE message_id=$1"
        )
        .bind(message_id)
        .fetch_one(pool.get_ref())
        .await
        .unwrap_or(0);

        socketio.to("global").emit("message_reaction", serde_json::json!({
            "message_id": message_id,
            "chat_type": chat_type,
            "reactions": reactions,
            "fire_count": fire_count
        })).ok();
    } else {
        // DM - send to both users
        let msg_row = sqlx::query(
            "SELECT sender, receiver FROM dom_messages WHERE id=$1"
        )
        .bind(message_id)
        .fetch_optional(pool.get_ref())
        .await
        .unwrap_or(None);

        if let Some(msg) = msg_row {
            let sender_id: i64 = msg.get(0);
            let receiver_id: i64 = msg.get(1);

            // Get fire count
            let fire_count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM dom_fire_reactions 
                WHERE message_id=$1"
            )
            .bind(message_id)
            .fetch_one(pool.get_ref())
            .await
            .unwrap_or(0);

            let event_data = serde_json::json!({
                "message_id": message_id,
                "chat_type": chat_type,
                "reactions": reactions,
                "fire_count": fire_count
            });

            socketio.to(format!("user_{}", sender_id))
                .emit("message_reaction", event_data.clone()).ok();

            socketio.to(format!("user_{}", receiver_id))
                .emit("message_reaction", event_data).ok();
        }
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "action": action,
        "reactions": reactions
    })))
}

async fn api_message_reactions(
    query: web::Query<std::collections::HashMap<String, String>>,
    pool: web::Data<PgPool>,
) -> ActixResult<HttpResponse> {
    let message_id = query.get("message_id")
        .and_then(|s| s.parse::<i64>().ok());
    let chat_type = query.get("chat_type")
        .map(|s| s.as_str())
        .unwrap_or("");

    if message_id.is_none() || (chat_type != "global" && chat_type != "dm") {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({"ok": false})));
    }

    let message_id = message_id.unwrap();

    let reaction_rows = sqlx::query(
        "SELECT emoji, COUNT(*) as count
        FROM dom_message_reactions
        WHERE message_id=$1 AND chat_type=$2
        GROUP BY emoji"
    )
    .bind(message_id)
    .bind(chat_type)
    .fetch_all(pool.get_ref())
    .await
    .unwrap_or_default();

    let mut reactions = serde_json::Map::new();
    for row in reaction_rows {
        let emoji: String = row.get(0);
        let count: i64 = row.get(1);
        reactions.insert(emoji, serde_json::json!(count));
    }

    // Get fire count from dom_fire_reactions
    let fire_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM dom_fire_reactions
        WHERE message_id=$1 AND chat_type=$2"
    )
    .bind(message_id)
    .bind(chat_type)
    .fetch_one(pool.get_ref())
    .await
    .unwrap_or(0);

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "reactions": reactions,
        "fire_count": fire_count
    })))
}

async fn api_fire_add(
    body: web::Json<serde_json::Value>,
    pool: web::Data<PgPool>,
    socketio: web::Data<SocketIo>,
) -> ActixResult<HttpResponse> {
    let message_id = body.get("message_id")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let chat_type = body.get("chat_type")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let giver_id = body.get("giver_id")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let receiver_id = body.get("receiver_id")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);

    if message_id == 0 || giver_id == 0 || receiver_id == 0 {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "ok": false,
            "error": "missing_params"
        })));
    }

    if chat_type != "global" && chat_type != "dm" {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "ok": false,
            "error": "invalid_chat_type"
        })));
    }

    // Can't fire yourself
    if giver_id == receiver_id {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "ok": false,
            "error": "cannot_fire_yourself"
        })));
    }

    const FIRE_PRICE: f64 = 0.20;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    // Check giver balance
    let balance: Option<f64> = sqlx::query_scalar(
        "SELECT balance_usd FROM dom_users WHERE user_id = $1"
    )
    .bind(giver_id)
    .fetch_optional(pool.get_ref())
    .await
    .unwrap_or(None);

    if balance.is_none() {
        return Ok(HttpResponse::NotFound().json(serde_json::json!({
            "ok": false,
            "error": "user_not_found"
        })));
    }

    let balance = balance.unwrap();

    if balance < FIRE_PRICE {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "ok": false,
            "error": "insufficient_balance"
        })));
    }

    // Deduct from giver
    sqlx::query(
        "UPDATE dom_users 
        SET balance_usd = balance_usd - $1,
            fires_given = fires_given + 1
        WHERE user_id = $2"
    )
    .bind(FIRE_PRICE)
    .bind(giver_id)
    .execute(pool.get_ref())
    .await
    .ok();

    // Add 0.10 to receiver
    sqlx::query(
        "UPDATE dom_users 
        SET balance_usd = balance_usd + 0.10,
            fires_received = fires_received + 1
        WHERE user_id = $1"
    )
    .bind(receiver_id)
    .execute(pool.get_ref())
    .await
    .ok();

    // Add 0.10 to burn account
    sqlx::query(
        "UPDATE dom_burn_account 
        SET total_burned = total_burned + 0.10,
            last_updated = $1"
    )
    .bind(now)
    .execute(pool.get_ref())
    .await
    .ok();

    // Record fire reaction
    sqlx::query(
        "INSERT INTO dom_fire_reactions 
        (message_id, chat_type, giver_user_id, receiver_user_id, amount, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)"
    )
    .bind(message_id)
    .bind(chat_type)
    .bind(giver_id)
    .bind(receiver_id)
    .bind(FIRE_PRICE)
    .bind(now)
    .execute(pool.get_ref())
    .await
    .ok();

    // Get total fires for this message
    let fire_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM dom_fire_reactions
        WHERE message_id = $1 AND chat_type = $2"
    )
    .bind(message_id)
    .bind(chat_type)
    .fetch_one(pool.get_ref())
    .await
    .unwrap_or(0);

    // Broadcast fire update via socket
    let fire_update = serde_json::json!({
        "message_id": message_id,
        "chat_type": chat_type,
        "fire_count": fire_count
    });

    if chat_type == "global" {
        socketio.to("global").emit("fire_update", fire_update).ok();
    } else {
        socketio.to(format!("user_{}", giver_id))
            .emit("fire_update", fire_update.clone()).ok();
        socketio.to(format!("user_{}", receiver_id))
            .emit("fire_update", fire_update).ok();
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "fire_count": fire_count,
        "new_balance": balance - FIRE_PRICE
    })))
}

async fn api_fire_count(
    query: web::Query<std::collections::HashMap<String, String>>,
    pool: web::Data<PgPool>,
) -> ActixResult<HttpResponse> {
    let message_id = query.get("message_id")
        .and_then(|s| s.parse::<i64>().ok());
    let chat_type = query.get("chat_type")
        .map(|s| s.as_str())
        .unwrap_or("");

    if message_id.is_none() || (chat_type != "global" && chat_type != "dm") {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({"ok": false})));
    }

    let message_id = message_id.unwrap();

    let fire_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM dom_fire_reactions
        WHERE message_id = $1 AND chat_type = $2"
    )
    .bind(message_id)
    .bind(chat_type)
    .fetch_one(pool.get_ref())
    .await
    .unwrap_or(0);

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "fire_count": fire_count
    })))
}

#[derive(serde::Serialize)]
struct Post {
    id: i64,
    user_id: i64,
    username: String,
    avatar: String,
    status_level: i32,
    text: String,
    media_url: Option<String>,
    likes: i32,
    created_at: i64,
}

async fn api_get_single_post(
    path: web::Path<i64>,
    pool: web::Data<PgPool>,
) -> ActixResult<HttpResponse> {
    let post_id = path.into_inner();

    let row = sqlx::query(
        "SELECT p.id, p.user_id, u.username, u.avatar,
               (SELECT COALESCE(MAX(pl.tier),0)
                FROM dom_user_miners m
                JOIN dom_mining_plans pl ON pl.id = m.plan_id
                WHERE m.user_id = u.user_id) AS status_level,
               p.text, p.media_url, p.likes, p.created_at
        FROM dom_posts p
        JOIN dom_users u ON u.user_id = p.user_id
        WHERE p.id = $1"
    )
    .bind(post_id)
    .fetch_optional(pool.get_ref())
    .await
    .unwrap_or(None);

    if row.is_none() {
        return Ok(HttpResponse::NotFound().json(serde_json::json!({
            "ok": false,
            "error": "post_not_found"
        })));
    }

    let row = row.unwrap();
    let username: Option<String> = row.get(2);
    let avatar: Option<String> = row.get(3);
    let user_id: i64 = row.get(1);
    
    let avatar_url = avatar.unwrap_or_else(|| "/portal/default.png".to_string());

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "post": Post {
            id: row.get(0),
            user_id,
            username: username.unwrap_or_else(|| format!("User {}", user_id)),
            avatar: avatar_url,
            status_level: row.get(4),
            text: row.get(5),
            media_url: row.get(6),
            likes: row.get(7),
            created_at: row.get(8),
        }
    })))
}

async fn api_message_send(
    body: web::Json<serde_json::Value>,
    pool: web::Data<PgPool>,
    socketio: web::Data<SocketIo>,
) -> ActixResult<HttpResponse> {
    let sender = body.get("sender")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let receiver = body.get("receiver")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let text = body.get("text")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let reply_to = body.get("reply_to")
        .and_then(|v| v.as_i64());

    if sender == 0 || receiver == 0 || text.is_empty() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "ok": false,
            "error": "bad_params"
        })));
    }

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    // ✅ sender-ը կարող է գրել միայն նրան, ում follow է անում
    let follows = sqlx::query_scalar::<_, i64>(
        "SELECT 1 FROM dom_follows WHERE follower=$1 AND target=$2"
    )
    .bind(sender)
    .bind(receiver)
    .fetch_optional(pool.get_ref())
    .await
    .unwrap_or(None);

    if follows.is_none() {
        return Ok(HttpResponse::Ok().json(serde_json::json!({
            "ok": false,
            "error": "need_follow"
        })));
    }

    let mut reply_text: Option<String> = None;

    if let Some(reply_id) = reply_to {
        reply_text = sqlx::query_scalar(
            "SELECT text FROM dom_messages WHERE id=$1"
        )
        .bind(reply_id)
        .fetch_optional(pool.get_ref())
        .await
        .unwrap_or(None);
    }

    let message_id: i64 = sqlx::query_scalar(
        "INSERT INTO dom_messages (sender, receiver, text, reply_to, created_at)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id"
    )
    .bind(sender)
    .bind(receiver)
    .bind(&text)
    .bind(reply_to)
    .bind(now)
    .fetch_one(pool.get_ref())
    .await
    .unwrap();

    let room = format!("dm_{}_{}", sender.min(receiver), sender.max(receiver));

    socketio.to(room).emit("dm_new", serde_json::json!({
        "id": message_id,
        "sender": sender,
        "receiver": receiver,
        "text": text,
        "time": now,
        "reply_to": reply_to,
        "reply_to_text": reply_text
    })).ok();

    // ✅ Notify receiver (inbox badge), even if DM room not open
    let text_preview = if text.len() > 120 {
        &text[..120]
    } else {
        &text
    };

    socketio.to(format!("user_{}", receiver))
        .emit("dm_notify", serde_json::json!({
            "partner_id": sender,
            "sender": sender,
            "text": text_preview,
            "time": now
        })).ok();

    Ok(HttpResponse::Ok().json(serde_json::json!({"ok": true})))
}

async fn api_forward_global(
    body: web::Json<serde_json::Value>,
    pool: web::Data<PgPool>,
    socketio: web::Data<SocketIo>,
) -> ActixResult<HttpResponse> {
    let user_id = body.get("user_id")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let message_id = body.get("message_id")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let target_user_id = body.get("target_user_id")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);

    if user_id == 0 || message_id == 0 || target_user_id == 0 {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "ok": false,
            "error": "bad_params"
        })));
    }

    // Get original message
    let row = sqlx::query(
        "SELECT g.message, g.user_id, u.username 
        FROM dom_global_chat g
        LEFT JOIN dom_users u ON u.user_id = g.user_id
        WHERE g.id = $1"
    )
    .bind(message_id)
    .fetch_optional(pool.get_ref())
    .await
    .unwrap_or(None);

    if row.is_none() {
        return Ok(HttpResponse::NotFound().json(serde_json::json!({
            "ok": false,
            "error": "message_not_found"
        })));
    }

    let row = row.unwrap();
    let original_text: String = row.get(0);
    let original_sender: i64 = row.get(1);
    let original_username: Option<String> = row.get(2);
    let original_username = original_username.unwrap_or_else(|| format!("User {}", original_sender));

    // Check if original sender allows forwarding
    let allow_forward: Option<i32> = sqlx::query_scalar(
        "SELECT allow_forward FROM dom_users WHERE user_id = $1"
    )
    .bind(original_sender)
    .fetch_optional(pool.get_ref())
    .await
    .unwrap_or(None);

    if let Some(allow) = allow_forward {
        if allow == 0 {
            return Ok(HttpResponse::Forbidden().json(serde_json::json!({
                "ok": false,
                "error": "forwarding_disabled"
            })));
        }
    }

    // Check if user follows target
    let follows = sqlx::query_scalar::<_, i64>(
        "SELECT 1 FROM dom_follows WHERE follower=$1 AND target=$2"
    )
    .bind(user_id)
    .bind(target_user_id)
    .fetch_optional(pool.get_ref())
    .await
    .unwrap_or(None);

    if follows.is_none() {
        return Ok(HttpResponse::Forbidden().json(serde_json::json!({
            "ok": false,
            "error": "need_follow"
        })));
    }

    // Create forwarded message
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    let forward_text = format!("📩 Forwarded from @{}:\n\n{}", original_username, original_text);

    let new_msg_id: i64 = sqlx::query_scalar(
        "INSERT INTO dom_messages (sender, receiver, text, created_at)
        VALUES ($1, $2, $3, $4)
        RETURNING id"
    )
    .bind(user_id)
    .bind(target_user_id)
    .bind(&forward_text)
    .bind(now)
    .fetch_one(pool.get_ref())
    .await
    .unwrap();

    // Send realtime notification
    let room = format!("dm_{}_{}", user_id.min(target_user_id), user_id.max(target_user_id));
    socketio.to(room).emit("dm_new", serde_json::json!({
        "id": new_msg_id,
        "sender": user_id,
        "receiver": target_user_id,
        "text": forward_text,
        "time": now
    })).ok();

    let text_preview = if forward_text.len() > 120 {
        &forward_text[..120]
    } else {
        &forward_text
    };

    socketio.to(format!("user_{}", target_user_id))
        .emit("dm_notify", serde_json::json!({
            "partner_id": user_id,
            "sender": user_id,
            "text": text_preview,
            "time": now
        })).ok();

    Ok(HttpResponse::Ok().json(serde_json::json!({"ok": true})))
}

async fn api_forward_dm(
    body: web::Json<serde_json::Value>,
    pool: web::Data<PgPool>,
    socketio: web::Data<SocketIo>,
) -> ActixResult<HttpResponse> {
    let user_id = body.get("user_id")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let message_id = body.get("message_id")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let target_user_id = body.get("target_user_id")
        .and_then(|v| v.as_i64());
    let to_global = body.get("to_global")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if user_id == 0 || message_id == 0 {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "ok": false,
            "error": "bad_params"
        })));
    }

    if !to_global && target_user_id.is_none() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "ok": false,
            "error": "no_target"
        })));
    }

    // Get original message
    let row = sqlx::query(
        "SELECT m.text, m.sender, u.username 
        FROM dom_messages m
        LEFT JOIN dom_users u ON u.user_id = m.sender
        WHERE m.id = $1"
    )
    .bind(message_id)
    .fetch_optional(pool.get_ref())
    .await
    .unwrap_or(None);

    if row.is_none() {
        return Ok(HttpResponse::NotFound().json(serde_json::json!({
            "ok": false,
            "error": "message_not_found"
        })));
    }

    let row = row.unwrap();
    let original_text: String = row.get(0);
    let original_sender: i64 = row.get(1);
    let original_username: Option<String> = row.get(2);
    let original_username = original_username.unwrap_or_else(|| format!("User {}", original_sender));

    // Check if original sender allows forwarding
    let allow_forward: Option<i32> = sqlx::query_scalar(
        "SELECT allow_forward FROM dom_users WHERE user_id = $1"
    )
    .bind(original_sender)
    .fetch_optional(pool.get_ref())
    .await
    .unwrap_or(None);

    if let Some(allow) = allow_forward {
        if allow == 0 {
            return Ok(HttpResponse::Forbidden().json(serde_json::json!({
                "ok": false,
                "error": "forwarding_disabled"
            })));
        }
    }

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    let forward_text = format!("📩 Forwarded from @{}:\n\n{}", original_username, original_text);

    if to_global {
        // Forward to Global Chat
        let new_msg_id: i64 = sqlx::query_scalar(
            "INSERT INTO dom_global_chat (user_id, message, created_at)
            VALUES ($1, $2, $3)
            RETURNING id"
        )
        .bind(user_id)
        .bind(&forward_text)
        .bind(now)
        .fetch_one(pool.get_ref())
        .await
        .unwrap();

        // Get user info for realtime
        let user_row = sqlx::query(
            "SELECT username, avatar,
                   (SELECT COALESCE(MAX(pl.tier),0)
                    FROM dom_user_miners m
                    JOIN dom_mining_plans pl ON pl.id = m.plan_id
                    WHERE m.user_id = $1) AS status_level
            FROM dom_users WHERE user_id = $1"
        )
        .bind(user_id)
        .fetch_optional(pool.get_ref())
        .await
        .unwrap_or(None);

        let (username, avatar, status_level) = if let Some(u) = user_row {
            let uname: Option<String> = u.get(0);
            let ava: Option<String> = u.get(1);
            let status: i32 = u.get(2);
            (
                uname.unwrap_or_else(|| format!("User {}", user_id)),
                ava.unwrap_or_else(|| "/portal/default.png".to_string()),
                status
            )
        } else {
            (format!("User {}", user_id), "/portal/default.png".to_string(), 0)
        };

        socketio.to("global").emit("global_new", serde_json::json!({
            "id": new_msg_id,
            "user_id": user_id,
            "username": username,
            "avatar": avatar,
            "status_level": status_level,
            "message": forward_text,
            "time": now,
            "highlighted": false
        })).ok();

    } else {
        // Forward to DM
        let target_user_id = target_user_id.unwrap();

        // Check if user follows target
        let follows = sqlx::query_scalar::<_, i64>(
            "SELECT 1 FROM dom_follows WHERE follower=$1 AND target=$2"
        )
        .bind(user_id)
        .bind(target_user_id)
        .fetch_optional(pool.get_ref())
        .await
        .unwrap_or(None);

        if follows.is_none() {
            return Ok(HttpResponse::Forbidden().json(serde_json::json!({
                "ok": false,
                "error": "need_follow"
            })));
        }

        let new_msg_id: i64 = sqlx::query_scalar(
            "INSERT INTO dom_messages (sender, receiver, text, created_at)
            VALUES ($1, $2, $3, $4)
            RETURNING id"
        )
        .bind(user_id)
        .bind(target_user_id)
        .bind(&forward_text)
        .bind(now)
        .fetch_one(pool.get_ref())
        .await
        .unwrap();

        let room = format!("dm_{}_{}", user_id.min(target_user_id), user_id.max(target_user_id));
        socketio.to(room).emit("dm_new", serde_json::json!({
            "id": new_msg_id,
            "sender": user_id,
            "receiver": target_user_id,
            "text": forward_text,
            "time": now
        })).ok();

        let text_preview = if forward_text.len() > 120 {
            &forward_text[..120]
        } else {
            &forward_text
        };

        socketio.to(format!("user_{}", target_user_id))
            .emit("dm_notify", serde_json::json!({
                "partner_id": user_id,
                "sender": user_id,
                "text": text_preview,
                "time": now
            })).ok();
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({"ok": true})))
}

#[derive(serde::Serialize)]
struct MessageHistory {
    id: i64,
    sender: i64,
    username: String,
    avatar: String,
    status_level: i32,
    receiver: i64,
    receiver_username: String,
    receiver_avatar: String,
    receiver_status_level: i32,
    text: String,
    reply_to: Option<i64>,
    reply_to_text: Option<String>,
    time: i64,
}

async fn api_message_history(
    query: web::Query<std::collections::HashMap<String, String>>,
    pool: web::Data<PgPool>,
) -> ActixResult<HttpResponse> {
    let u1 = query.get("u1")
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(0);
    let u2 = query.get("u2")
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(0);

    if u1 == 0 || u2 == 0 {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "ok": false,
            "error": "bad_params"
        })));
    }

    let rows = sqlx::query(
        "SELECT
            m.id,
            m.sender,
            su.username,
            su.avatar,
            (SELECT COALESCE(MAX(pl.tier),0)
                FROM dom_user_miners mm
                JOIN dom_mining_plans pl ON pl.id = mm.plan_id
                WHERE mm.user_id = su.user_id) AS sender_status,
            m.receiver,
            ru.username,
            ru.avatar,
            (SELECT COALESCE(MAX(pl.tier),0)
                FROM dom_user_miners mm
                JOIN dom_mining_plans pl ON pl.id = mm.plan_id
                WHERE mm.user_id = ru.user_id) AS receiver_status,
            m.text,
            m.reply_to,
            rm.text AS reply_to_text,
            m.created_at
        FROM dom_messages m
        LEFT JOIN dom_users su ON su.user_id = m.sender
        LEFT JOIN dom_users ru ON ru.user_id = m.receiver
        LEFT JOIN dom_messages rm ON rm.id = m.reply_to
        WHERE (m.sender=$1 AND m.receiver=$2)
           OR (m.sender=$2 AND m.receiver=$1)
        ORDER BY m.id DESC
        LIMIT 50"
    )
    .bind(u1)
    .bind(u2)
    .fetch_all(pool.get_ref())
    .await
    .unwrap_or_default();

    let mut messages: Vec<MessageHistory> = rows.iter().map(|r| {
        let sender: i64 = r.get(1);
        let sender_username: Option<String> = r.get(2);
        let sender_avatar: Option<String> = r.get(3);
        
        let receiver: i64 = r.get(5);
        let receiver_username: Option<String> = r.get(6);
        let receiver_avatar: Option<String> = r.get(7);

        MessageHistory {
            id: r.get(0),
            sender,
            username: sender_username.unwrap_or_else(|| format!("User {}", sender)),
            avatar: sender_avatar.unwrap_or_else(|| "/portal/default.png".to_string()),
            status_level: r.get(4),
            receiver,
            receiver_username: receiver_username.unwrap_or_else(|| format!("User {}", receiver)),
            receiver_avatar: receiver_avatar.unwrap_or_else(|| "/portal/default.png".to_string()),
            receiver_status_level: r.get(8),
            text: r.get::<Option<String>, _>(9).unwrap_or_default(),
            reply_to: r.get(10),
            reply_to_text: r.get(11),
            time: r.get(12),
        }
    }).collect();

    messages.reverse();

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "messages": messages
    })))
}

async fn api_wallet_connect(
    body: web::Json<serde_json::Value>,
    pool: web::Data<PgPool>,
) -> ActixResult<HttpResponse> {
    let user_id = body.get("user_id")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let wallet = body.get("wallet")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();

    if user_id == 0 || wallet.is_empty() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "ok": false,
            "error": "bad_params"
        })));
    }

    sqlx::query(
        "UPDATE dom_users
        SET wallet_address = $1
        WHERE user_id = $2"
    )
    .bind(&wallet)
    .bind(user_id)
    .execute(pool.get_ref())
    .await
    .ok();

    let user = get_user_stats(user_id, pool.get_ref()).await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "user": user
    })))
}

#[derive(serde::Serialize)]
struct GlobalHistoryMessage {
    sender: i64,
    username: String,
    status_level: i32,
    text: String,
    time: i64,
}

async fn api_global_history(pool: web::Data<PgPool>) -> ActixResult<HttpResponse> {
    let rows = sqlx::query(
        "SELECT 
            g.user_id,
            u.username,
            (SELECT COALESCE(MAX(pl.tier),0)
                FROM dom_user_miners m
                JOIN dom_mining_plans pl ON pl.id = m.plan_id
                WHERE m.user_id = u.user_id) AS status_level,
            g.message,
            g.created_at
        FROM dom_global_chat g
        LEFT JOIN dom_users u ON u.user_id = g.user_id
        ORDER BY g.id DESC
        LIMIT 30"
    )
    .fetch_all(pool.get_ref())
    .await
    .unwrap_or_default();

    let mut messages: Vec<GlobalHistoryMessage> = rows.iter().map(|r| {
        let sender: i64 = r.get(0);
        let username: Option<String> = r.get(1);

        GlobalHistoryMessage {
            sender,
            username: username.unwrap_or_else(|| format!("User {}", sender)),
            status_level: r.get(2),
            text: r.get(3),
            time: r.get(4),
        }
    }).collect();

    messages.reverse();

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "messages": messages
    })))
}

#[derive(serde::Serialize)]
struct FollowUser {
    user_id: i64,
    username: String,
    avatar: String,
}

async fn api_follows_list(
    query: web::Query<std::collections::HashMap<String, String>>,
    pool: web::Data<PgPool>,
) -> ActixResult<HttpResponse> {
    let uid = query.get("uid")
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(0);

    if uid == 0 {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({"ok": false})));
    }

    let rows = sqlx::query(
        "SELECT u.user_id, u.username, u.avatar
        FROM dom_follows f
        JOIN dom_users u ON u.user_id = f.target
        WHERE f.follower = $1"
    )
    .bind(uid)
    .fetch_all(pool.get_ref())
    .await
    .unwrap_or_default();

    let users: Vec<FollowUser> = rows.iter().map(|r| {
        let user_id: i64 = r.get(0);
        let username: Option<String> = r.get(1);
        let avatar: Option<String> = r.get(2);

        FollowUser {
            user_id,
            username: username.unwrap_or_else(|| format!("User {}", user_id)),
            avatar: avatar.unwrap_or_else(|| "/portal/default.png".to_string()),
        }
    }).collect();

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "list": users
    })))
}

use actix_multipart::Multipart;
use futures_util::StreamExt;
use std::io::Write;
use tokio::process::Command;

async fn upload_post_media(
    mut payload: Multipart,
) -> ActixResult<HttpResponse> {
    let mut uid = String::from("0");
    let mut file_data: Option<Vec<u8>> = None;
    let mut filename = String::new();

    // Parse multipart form data
    while let Some(item) = payload.next().await {
        let mut field = item.map_err(|_| actix_web::error::ErrorBadRequest("Invalid field"))?;
        let content_disposition = field.content_disposition();
        let field_name = content_disposition.get_name().unwrap_or("");

        if field_name == "uid" {
            let mut bytes = Vec::new();
            while let Some(chunk) = field.next().await {
                let data = chunk.map_err(|_| actix_web::error::ErrorBadRequest("Read error"))?;
                bytes.extend_from_slice(&data);
            }
            uid = String::from_utf8_lossy(&bytes).to_string();
        } else if field_name == "file" {
            filename = content_disposition
                .get_filename()
                .unwrap_or("upload.dat")
                .to_string();
            
            let mut bytes = Vec::new();
            while let Some(chunk) = field.next().await {
                let data = chunk.map_err(|_| actix_web::error::ErrorBadRequest("Read error"))?;
                bytes.extend_from_slice(&data);
            }
            file_data = Some(bytes);
        }
    }

    if file_data.is_none() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "ok": false,
            "error": "No file provided"
        })));
    }

    let file_bytes = file_data.unwrap();
    let ext = std::path::Path::new(&filename)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{}", e.to_lowercase()))
        .unwrap_or_else(|| ".dat".to_string());

    // Generate unique filename
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let unique_name = format!("post_{}_{}{}", uid, timestamp, ext);

    // Save paths
    let upload_dir = std::path::PathBuf::from("webapp/static/media/posts");
    tokio::fs::create_dir_all(&upload_dir).await.ok();

    let temp_path = upload_dir.join(format!("temp_{}", unique_name));
    let final_path = upload_dir.join(&unique_name);

    // Save uploaded file temporarily
    let mut temp_file = std::fs::File::create(&temp_path)
        .map_err(|_| actix_web::error::ErrorInternalServerError("File create error"))?;
    temp_file.write_all(&file_bytes)
        .map_err(|_| actix_web::error::ErrorInternalServerError("File write error"))?;
    drop(temp_file);

    // Compress video with FFmpeg
    let video_exts = [".mp4", ".mov", ".avi", ".mkv", ".webm"];
    if video_exts.contains(&ext.as_str()) {
        log::info!("🎬 Compressing video: {}", filename);
        
        let result = Command::new("ffmpeg")
            .args(&[
                "-i", temp_path.to_str().unwrap(),
                "-vf", "scale=-2:480",
                "-b:v", "500k",
                "-c:a", "aac",
                "-b:a", "96k",
                "-y",
                final_path.to_str().unwrap(),
            ])
            .output()
            .await;

        match result {
            Ok(output) if output.status.success() => {
                tokio::fs::remove_file(&temp_path).await.ok();
                log::info!("✅ Video compressed: {}", unique_name);
            }
            _ => {
                log::error!("❌ FFmpeg failed, using original");
                tokio::fs::rename(&temp_path, &final_path).await.ok();
            }
        }
    } else {
        // For images, just rename
        tokio::fs::rename(&temp_path, &final_path).await.ok();
    }

    let url = format!("/static/media/posts/{}", unique_name);
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "url": url
    })))
}

use image::{ImageFormat, ImageReader, DynamicImage};
use std::io::Cursor;
use base64::{Engine as _, engine::general_purpose};

async fn upload_avatar(
    mut payload: Multipart,
    pool: web::Data<PgPool>,
) -> ActixResult<HttpResponse> {
    let mut uid: Option<i64> = None;
    let mut file_data: Option<Vec<u8>> = None;

    // Parse multipart form data
    while let Some(item) = payload.next().await {
        let mut field = item.map_err(|_| actix_web::error::ErrorBadRequest("Invalid field"))?;
        let content_disposition = field.content_disposition();
        let field_name = content_disposition.get_name().unwrap_or("");

        if field_name == "uid" {
            let mut bytes = Vec::new();
            while let Some(chunk) = field.next().await {
                let data = chunk.map_err(|_| actix_web::error::ErrorBadRequest("Read error"))?;
                bytes.extend_from_slice(&data);
            }
            uid = String::from_utf8_lossy(&bytes).parse::<i64>().ok();
        } else if field_name == "avatar" {
            let mut bytes = Vec::new();
            while let Some(chunk) = field.next().await {
                let data = chunk.map_err(|_| actix_web::error::ErrorBadRequest("Read error"))?;
                bytes.extend_from_slice(&data);
            }
            file_data = Some(bytes);
        }
    }

    if uid.is_none() || file_data.is_none() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "ok": false,
            "error": "missing"
        })));
    }

    let uid = uid.unwrap();
    let file_bytes = file_data.unwrap();

    // Process image
    let result: Result<String, Box<dyn std::error::Error>> = tokio::task::spawn_blocking(move || {
        // Read image
        let img = ImageReader::new(Cursor::new(&file_bytes))
            .with_guessed_format()?
            .decode()?;

        // Convert to RGB
        let img = match img {
            DynamicImage::ImageRgb8(_) => img,
            _ => DynamicImage::ImageRgb8(img.to_rgb8()),
        };

        // Resize to 100x100 (thumbnail preserves aspect ratio)
        let img = img.thumbnail(100, 100);

        // Convert to WebP
        let mut buffer = Vec::new();
        img.write_to(&mut Cursor::new(&mut buffer), ImageFormat::WebP)?;

        // Convert to base64
        let b64 = general_purpose::STANDARD.encode(&buffer);
        let avatar_data = format!("data:image/webp;base64,{}", b64);

        Ok(avatar_data)
    }).await.map_err(|_| actix_web::error::ErrorInternalServerError("Task error"))??;

    match result {
        Ok(avatar_data) => {
            // Save to database
            sqlx::query(
                "UPDATE dom_users
                SET avatar = $1 
                WHERE user_id = $2"
            )
            .bind(&avatar_data)
            .bind(uid)
            .execute(pool.get_ref())
            .await
            .ok();

            Ok(HttpResponse::Ok().json(serde_json::json!({"ok": true})))
        }
        Err(e) => {
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "ok": false,
                "error": e.to_string()
            })))
        }
    }
}

#[derive(serde::Serialize)]
struct SearchUser {
    user_id: i64,
    status_level: i32,
    username: String,
    avatar: String,
    is_following: bool,
}

async fn api_search_users(
    query: web::Query<std::collections::HashMap<String, String>>,
    pool: web::Data<PgPool>,
) -> ActixResult<HttpResponse> {
    let q = query.get("q")
        .map(|s| s.trim().to_lowercase())
        .unwrap_or_default();
    let viewer = query.get("viewer")
        .and_then(|s| s.parse::<i64>().ok());

    let rows = if q.is_empty() {
        sqlx::query(
            "SELECT
                u.user_id,
                u.username,
                u.avatar,
                (
                    SELECT COALESCE(MAX(pl.tier),0)
                    FROM dom_user_miners m
                    JOIN dom_mining_plans pl ON pl.id = m.plan_id
                    WHERE m.user_id = u.user_id
                ) AS status_level
            FROM dom_users u"
        )
        .fetch_all(pool.get_ref())
        .await
        .unwrap_or_default()
    } else {
        let search_pattern = format!("%{}%", q);
        sqlx::query(
            "SELECT 
                u.user_id, 
                u.username, 
                u.avatar,
                (
                    SELECT COALESCE(MAX(pl.tier),0)
                    FROM dom_user_miners m
                    JOIN dom_mining_plans pl ON pl.id = m.plan_id
                    WHERE m.user_id = u.user_id
                ) AS status_level
            FROM dom_users u
            WHERE LOWER(u.username) LIKE $1
            ORDER BY u.user_id DESC
            LIMIT 50"
        )
        .bind(&search_pattern)
        .fetch_all(pool.get_ref())
        .await
        .unwrap_or_default()
    };

    let mut users: Vec<SearchUser> = Vec::new();

    for u in rows {
        let user_id: i64 = u.get(0);

        if let Some(v) = viewer {
            if user_id == v {
                continue;
            }
        }

        let username: Option<String> = u.get(1);
        let avatar: Option<String> = u.get(2);
        let status_level: i32 = u.get(3);

        // Check if viewer follows this user
        let mut is_following = false;
        if let Some(v) = viewer {
            let result = sqlx::query(
                "SELECT 1 FROM dom_follows 
                WHERE follower = $1 AND target = $2"
            )
            .bind(v)
            .bind(user_id)
            .fetch_optional(pool.get_ref())
            .await
            .unwrap_or(None);

            is_following = result.is_some();
        }

        users.push(SearchUser {
            user_id,
            status_level,
            username: username.unwrap_or_default(),
            avatar: avatar.unwrap_or_else(|| "/portal/default.png".to_string()),
            is_following,
        });
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "users": users
    })))
}

// Socket.IO event handler for "join"
async fn handle_socket_join(
    socket: SocketRef,
    Data(data): Data<serde_json::Value>,
) {
    if let Some(room) = data.get("room").and_then(|v| v.as_str()) {
        let _ = socket.join(room);
    }
}

// Socket.IO event handler for "connect"
async fn handle_socket_connect(socket: SocketRef) {
    log::info!("🟢 Socket connected | sid={}", socket.id);
}

// Socket.IO event handler for "disconnect"
async fn handle_socket_disconnect(
    socket: SocketRef,
    online_users: web::Data<Arc<Mutex<HashMap<i64, String>>>>,
) {
    log::info!("🔴 Socket disconnected | sid={}", socket.id);
    
    let mut offline_uid: Option<i64> = None;
    
    {
        let mut users = online_users.lock().unwrap();
        let sid = socket.id.to_string();
        
        for (uid, user_sid) in users.clone().iter() {
            if user_sid == &sid {
                offline_uid = Some(*uid);
                users.remove(uid);
                break;
            }
        }
    }
    
    if let Some(uid) = offline_uid {
        let _ = socket.broadcast().emit("user_offline", serde_json::json!({
            "user_id": uid
        }));
    }
}

// Socket.IO event handler for "join_user"
async fn handle_socket_join_user(
    socket: SocketRef,
    Data(data): Data<serde_json::Value>,
    online_users: web::Data<Arc<Mutex<HashMap<i64, String>>>>,
) {
    // data can be dict {"uid":123} OR just "123"/123
    let uid_val = if data.is_object() {
        data.get("uid")
            .or_else(|| data.get("user_id"))
            .and_then(|v| v.as_i64())
    } else {
        data.as_i64()
            .or_else(|| data.as_str().and_then(|s| s.parse::<i64>().ok()))
    };

    let uid = uid_val.unwrap_or(0);

    if uid > 0 {
        let room = format!("user_{}", uid);
        let _ = socket.join(&room);
        
        {
            let mut users = online_users.lock().unwrap();
            users.insert(uid, socket.id.to_string());
        }
        
        log::info!("👤 joined user_{}", uid);
        
        let _ = socket.broadcast().emit("user_online", serde_json::json!({
            "user_id": uid
        }));
    }
}

// Socket.IO event handler for "join_global"
async fn handle_socket_join_global(socket: SocketRef) {
    let _ = socket.join("global");
    log::info!("🌍 joined global | sid={}", socket.id);
}

// Socket.IO event handler for "join_feed"
async fn handle_socket_join_feed(socket: SocketRef) {
    let _ = socket.join("feed");
    log::info!("📰 joined feed");
}

// Socket.IO event handler for "join_post"
async fn handle_socket_join_post(
    socket: SocketRef,
    Data(data): Data<serde_json::Value>,
) {
    let post_id = data.get("post_id")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    
    if post_id > 0 {
        let room = format!("post_{}", post_id);
        let _ = socket.join(&room);
        log::info!("💬 joined post_{}", post_id);
    }
}

// Socket.IO event handler for "join_dm"
async fn handle_socket_join_dm(
    socket: SocketRef,
    Data(data): Data<serde_json::Value>,
) {
    let u1 = data.get("u1")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let u2 = data.get("u2")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    
    if u1 > 0 && u2 > 0 {
        let room = format!("dm_{}_{}", u1.min(u2), u1.max(u2));
        let _ = socket.join(&room);
        log::info!("✉️ joined {}", room);
    }
}

// Socket.IO event handler for "typing_global"
async fn handle_socket_typing_global(
    socket: SocketRef,
    Data(data): Data<serde_json::Value>,
    pool: web::Data<PgPool>,
) {
    let user_id = data.get("user_id")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    
    if user_id == 0 {
        return;
    }
    
    // Get username
    let row = sqlx::query("SELECT username FROM dom_users WHERE user_id = $1")
        .bind(user_id)
        .fetch_optional(pool.get_ref())
        .await
        .unwrap_or(None);
    
    let username = if let Some(r) = row {
        let un: Option<String> = r.get(0);
        un.unwrap_or_else(|| format!("User {}", user_id))
    } else {
        format!("User {}", user_id)
    };
    
    // Broadcast to all in global chat (except sender)
    let _ = socket.to("global").emit("user_typing_global", serde_json::json!({
        "user_id": user_id,
        "username": username
    }));
}

// Socket.IO event handler for "typing_dm"
async fn handle_socket_typing_dm(
    socket: SocketRef,
    Data(data): Data<serde_json::Value>,
    pool: web::Data<PgPool>,
) {
    let sender = data.get("sender")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let receiver = data.get("receiver")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    
    if sender == 0 || receiver == 0 {
        return;
    }
    
    // Get username
    let row = sqlx::query("SELECT username FROM dom_users WHERE user_id = $1")
        .bind(sender)
        .fetch_optional(pool.get_ref())
        .await
        .unwrap_or(None);
    
    let username = if let Some(r) = row {
        let un: Option<String> = r.get(0);
        un.unwrap_or_else(|| format!("User {}", sender))
    } else {
        format!("User {}", sender)
    };
    
    // Send only to receiver
    let room = format!("user_{}", receiver);
    let _ = socket.to(&room).emit("user_typing_dm", serde_json::json!({
        "sender": sender,
        "username": username
    }));
}

async fn serve_games(path: web::Path<String>) -> ActixResult<NamedFile> {
    let filename = path.into_inner();
    let games_dir = std::path::PathBuf::from("webapp/games");
    let file_path = games_dir.join(&filename);
    
    NamedFile::open(file_path)
        .map_err(|_| actix_web::error::ErrorNotFound("File not found"))
}

async fn serve_favicon() -> ActixResult<NamedFile> {
    let assets_dir = std::path::PathBuf::from("webapp/assets");
    let file_path = assets_dir.join("favicon.ico");
    
    NamedFile::open(file_path)
        .map_err(|_| actix_web::error::ErrorNotFound("Favicon not found"))
}

async fn serve_webapp_tasks(path: web::Path<String>) -> ActixResult<NamedFile> {
    let filename = path.into_inner();
    let tasks_dir = std::path::PathBuf::from("webapp/tasks");
    let file_path = tasks_dir.join(&filename);
    
    NamedFile::open(file_path)
        .map_err(|_| actix_web::error::ErrorNotFound("File not found"))
}

async fn serve_portal_page() -> ActixResult<NamedFile> {
    let portal_dir = std::path::PathBuf::from("webapp/portal");
    let file_path = portal_dir.join("portal.html");
    
    NamedFile::open(file_path)
        .map_err(|_| actix_web::error::ErrorNotFound("Portal page not found"))
}

async fn serve_portal(path: web::Path<String>) -> ActixResult<NamedFile> {
    let filename = path.into_inner();
    let portal_dir = std::path::PathBuf::from("webapp/portal");
    let file_path = portal_dir.join(&filename);
    
    NamedFile::open(file_path)
        .map_err(|_| actix_web::error::ErrorNotFound("File not found"))
}

async fn serve_uploads(path: web::Path<String>) -> ActixResult<NamedFile> {
    let filename = path.into_inner();
    let uploads_dir = std::path::PathBuf::from("webapp/uploads");
    let file_path = uploads_dir.join(&filename);
    
    NamedFile::open(file_path)
        .map_err(|_| actix_web::error::ErrorNotFound("File not found"))
}

#[derive(serde::Deserialize)]
struct SetUsernameRequest {
    uid: Option<i64>,
    username: Option<String>,
}

async fn api_set_username(
    body: web::Json<SetUsernameRequest>,
    pool: web::Data<PgPool>,
) -> ActixResult<HttpResponse> {
    let uid = body.uid.unwrap_or(0);
    let username = body.username.as_ref().map(|s| s.as_str()).unwrap_or("");

    if uid == 0 || username.is_empty() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "ok": false,
            "error": "Missing data"
        })));
    }

    sqlx::query("UPDATE dom_users SET username=$1 WHERE user_id=$2")
        .bind(username)
        .bind(uid)
        .execute(pool.get_ref())
        .await
        .ok();

    Ok(HttpResponse::Ok().json(serde_json::json!({"ok": true})))
}

#[derive(serde::Serialize)]
struct Candle {
    time: i64,
    open: f64,
    high: f64,
    low: f64,
    close: f64,
}

async fn api_get_domit_prices(
    pool: web::Data<PgPool>,
) -> ActixResult<HttpResponse> {
    match sqlx::query(
        "SELECT timestamp, open, high, low, close
        FROM domit_price_history
        ORDER BY timestamp DESC
        LIMIT 1440"
    )
    .fetch_all(pool.get_ref())
    .await
    {
        Ok(rows) => {
            let mut candles: Vec<Candle> = Vec::new();

            for row in rows {
                let unix_time: i64 = row.get(0);
                let open: f64 = row.get::<sqlx::types::Decimal, _>(1).to_string().parse().unwrap_or(0.0);
                let high: f64 = row.get::<sqlx::types::Decimal, _>(2).to_string().parse().unwrap_or(0.0);
                let low: f64 = row.get::<sqlx::types::Decimal, _>(3).to_string().parse().unwrap_or(0.0);
                let close: f64 = row.get::<sqlx::types::Decimal, _>(4).to_string().parse().unwrap_or(0.0);

                candles.push(Candle {
                    time: unix_time,
                    open,
                    high,
                    low,
                    close,
                });
            }

            // Reverse to get ascending order (oldest first)
            candles.reverse();

            Ok(HttpResponse::Ok().json(serde_json::json!({"candles": candles})))
        }
        Err(e) => {
            log::error!("❌ Error in api_get_domit_prices: {}", e);
            Ok(HttpResponse::Ok().json(serde_json::json!({"candles": []})))
        }
    }
}

#[derive(serde::Deserialize)]
struct ToggleForwardRequest {
    user_id: Option<i64>,
    allow: Option<i32>,
}

async fn api_toggle_forward(
    body: web::Json<ToggleForwardRequest>,
    pool: web::Data<PgPool>,
) -> ActixResult<HttpResponse> {
    let user_id = body.user_id.unwrap_or(0);
    let allow = body.allow.unwrap_or(1);
    
    if user_id == 0 {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "ok": false,
            "error": "no user_id"
        })));
    }
    
    sqlx::query(
        "UPDATE dom_users 
        SET allow_forward = $1 
        WHERE user_id = $2"
    )
    .bind(allow)
    .bind(user_id)
    .execute(pool.get_ref())
    .await
    .ok();
    
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "allow_forward": allow
    })))
}

#[derive(serde::Deserialize)]
struct FollowRequest {
    follower: i64,
    target: i64,
}

async fn api_follow(
    body: web::Json<FollowRequest>,
    pool: web::Data<PgPool>,
    sio: web::Data<SocketIoLayer>,
) -> ActixResult<HttpResponse> {
    let follower = body.follower;
    let target = body.target;

    if follower == target {
        return Ok(HttpResponse::Ok().json(serde_json::json!({
            "ok": false,
            "error": "cannot_follow_self"
        })));
    }

    // Check if already following
    let already = sqlx::query(
        "SELECT 1 FROM dom_follows
        WHERE follower = $1 AND target = $2"
    )
    .bind(follower)
    .bind(target)
    .fetch_optional(pool.get_ref())
    .await
    .unwrap_or(None);

    if already.is_some() {
        return Ok(HttpResponse::Ok().json(serde_json::json!({
            "ok": true,
            "already": true
        })));
    }

    // Get follower balance
    let row = sqlx::query("SELECT balance_usd FROM dom_users WHERE user_id=$1")
        .bind(follower)
        .fetch_optional(pool.get_ref())
        .await
        .unwrap_or(None);

    if row.is_none() {
        return Ok(HttpResponse::NotFound().json(serde_json::json!({
            "ok": false,
            "error": "user_not_found"
        })));
    }

    let balance: f64 = row.unwrap().get::<sqlx::types::Decimal, _>(0).to_string().parse().unwrap_or(0.0);

    let follow_price = 5.0;
    let pay_target = 2.0;
    let burn_amount = 3.0;

    // Apply burn transaction
    match apply_burn_transaction(
        pool.get_ref(),
        follower,
        follow_price,
        vec![(target, pay_target)],
        burn_amount,
        "follow"
    ).await {
        Ok(_) => {},
        Err(_) => {
            return Ok(HttpResponse::Ok().json(serde_json::json!({
                "ok": false,
                "error": "low_balance"
            })));
        }
    }

    // Insert follow relationship
    sqlx::query(
        "INSERT INTO dom_follows (follower, target)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING"
    )
    .bind(follower)
    .bind(target)
    .execute(pool.get_ref())
    .await
    .ok();

    // Emit real-time event
    let room = format!("user_{}", target);
    if let Some(sio_ref) = sio.io() {
        let _ = sio_ref.to(&room).emit("follow_new", serde_json::json!({
            "follower": follower,
            "target": target
        }));
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({"ok": true})))
}

#[derive(serde::Deserialize)]
struct DeleteCommentRequest {
    comment_id: Option<i64>,
    user_id: Option<i64>,
}

async fn api_comment_delete(
    body: web::Json<DeleteCommentRequest>,
    pool: web::Data<PgPool>,
) -> ActixResult<HttpResponse> {
    let cid = body.comment_id.unwrap_or(0);
    let uid = body.user_id.unwrap_or(0);

    if cid == 0 || uid == 0 {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({"ok": false})));
    }

    sqlx::query(
        "DELETE FROM dom_comments 
        WHERE id=$1 AND (user_id=$2 OR post_id IN(
            SELECT id FROM dom_posts WHERE user_id=$3
        ))"
    )
    .bind(cid)
    .bind(uid)
    .bind(uid)
    .execute(pool.get_ref())
    .await
    .ok();

    Ok(HttpResponse::Ok().json(serde_json::json!({"ok": true})))
}

#[derive(serde::Deserialize)]
struct DeletePostRequest {
    post_id: Option<i64>,
    user_id: Option<i64>,
}

async fn api_post_delete(
    body: web::Json<DeletePostRequest>,
    pool: web::Data<PgPool>,
) -> ActixResult<HttpResponse> {
    let pid = body.post_id.unwrap_or(0);
    let uid = body.user_id.unwrap_or(0);

    // Get media_url before delete
    let row = sqlx::query("SELECT media_url FROM dom_posts WHERE id=$1 AND user_id=$2")
        .bind(pid)
        .bind(uid)
        .fetch_optional(pool.get_ref())
        .await
        .unwrap_or(None);
    
    if let Some(r) = row {
        let media_url: Option<String> = r.get(0);
        
        if let Some(url) = media_url {
            // Delete file if not base64
            if !url.starts_with("data:") {
                let file_path = format!("webapp{}", url);
                
                if std::path::Path::new(&file_path).exists() {
                    match std::fs::remove_file(&file_path) {
                        Ok(_) => log::info!("Deleted file: {}", file_path),
                        Err(e) => log::error!("File delete error: {}", e),
                    }
                }
            }
        }
    }
    
    // Delete from DB
    sqlx::query("DELETE FROM dom_posts WHERE id=$1 AND user_id=$2")
        .bind(pid)
        .bind(uid)
        .execute(pool.get_ref())
        .await
        .ok();

    Ok(HttpResponse::Ok().json(serde_json::json!({"ok": true})))
}

#[derive(serde::Deserialize)]
struct AdminGiveRequest {
    secret: Option<String>,
    target: Option<i64>,
    amount: Option<f64>,
}

async fn api_admin_give(
    body: web::Json<AdminGiveRequest>,
    pool: web::Data<PgPool>,
) -> ActixResult<HttpResponse> {
    let secret = body.secret.as_ref().map(|s| s.as_str()).unwrap_or("");
    let target = body.target.unwrap_or(0);
    let amount = body.amount.unwrap_or(0.0);

    let admin_secret = "super059key";

    if secret != admin_secret {
        return Ok(HttpResponse::Forbidden().json(serde_json::json!({
            "ok": false,
            "error": "forbidden"
        })));
    }

    if target == 0 || amount <= 0.0 {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "ok": false,
            "error": "bad_params"
        })));
    }

    sqlx::query(
        "UPDATE dom_users
        SET balance_usd = balance_usd + $1
        WHERE user_id=$2"
    )
    .bind(amount)
    .bind(target)
    .execute(pool.get_ref())
    .await
    .ok();

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "message": format!("Added {} DOMIT to {}", amount, target)
    })))
}

async fn api_follow_stats(
    path: web::Path<i64>,
    pool: web::Data<PgPool>,
) -> ActixResult<HttpResponse> {
    let user_id = path.into_inner();

    let followers_row = sqlx::query("SELECT COUNT(*) FROM dom_follows WHERE target=$1")
        .bind(user_id)
        .fetch_one(pool.get_ref())
        .await
        .ok();
    let followers: i64 = followers_row.map(|r| r.get(0)).unwrap_or(0);

    let following_row = sqlx::query("SELECT COUNT(*) FROM dom_follows WHERE follower=$1")
        .bind(user_id)
        .fetch_one(pool.get_ref())
        .await
        .ok();
    let following: i64 = following_row.map(|r| r.get(0)).unwrap_or(0);

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "followers": followers,
        "following": following
    })))
}

async fn api_is_following(
    path: web::Path<(i64, i64)>,
    pool: web::Data<PgPool>,
) -> ActixResult<HttpResponse> {
    let (follower, target) = path.into_inner();

    if follower == 0 || target == 0 {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "ok": false,
            "error": "bad_params"
        })));
    }

    let row = sqlx::query(
        "SELECT 1 FROM dom_follows
        WHERE follower = $1 AND target = $2"
    )
    .bind(follower)
    .bind(target)
    .fetch_optional(pool.get_ref())
    .await
    .unwrap_or(None);

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "self": follower == target,
        "is_following": row.is_some()
    })))
}

#[derive(serde::Deserialize)]
struct CreatePostRequest {
    user_id: Option<i64>,
    text: Option<String>,
    media_url: Option<String>,
}

async fn api_post_create(
    body: web::Json<CreatePostRequest>,
    pool: web::Data<PgPool>,
    sio: web::Data<SocketIoLayer>,
) -> ActixResult<HttpResponse> {
    let user_id = body.user_id.unwrap_or(0);
    let text = body.text.as_ref().map(|s| s.trim()).unwrap_or("").to_string();
    let media_url = body.media_url.as_ref().map(|s| s.trim()).unwrap_or("").to_string();

    if user_id == 0 || (text.is_empty() && media_url.is_empty()) {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "ok": false,
            "error": "bad_params"
        })));
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let row = sqlx::query(
        "INSERT INTO dom_posts (user_id, text, media_url, created_at)
        VALUES ($1, $2, $3, $4)
        RETURNING id"
    )
    .bind(user_id)
    .bind(&text)
    .bind(&media_url)
    .bind(now)
    .fetch_one(pool.get_ref())
    .await;

    match row {
        Ok(r) => {
            let pid: i64 = r.get(0);

            // Emit real-time event
            if let Some(sio_ref) = sio.io() {
                let _ = sio_ref.to("feed").emit("post_new", serde_json::json!({
                    "post_id": pid,
                    "user_id": user_id
                }));
            }

            Ok(HttpResponse::Ok().json(serde_json::json!({
                "ok": true,
                "post_id": pid
            })))
        }
        Err(_) => {
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "ok": false,
                "error": "db_error"
            })))
        }
    }
}

#[derive(serde::Serialize)]
struct CommentItem {
    id: i64,
    user_id: i64,
    text: String,
    status_level: i32,
    created_at: i64,
    username: String,
    post_owner_id: i64,
    likes: i32,
    parent_id: Option<i64>,
}

#[derive(serde::Deserialize)]
struct CommentListQuery {
    post_id: Option<i64>,
}

async fn api_comment_list(
    query: web::Query<CommentListQuery>,
    pool: web::Data<PgPool>,
) -> ActixResult<HttpResponse> {
    let post_id = query.post_id.unwrap_or(0);
    
    if post_id == 0 {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "ok": false,
            "error": "missing post_id"
        })));
    }

    let rows = sqlx::query(
        "SELECT 
            c.id,
            c.user_id,
            c.text,
            c.created_at,
            u.username,
            p.user_id AS post_owner_id,
            c.likes,
            c.parent_id,
            (SELECT COALESCE(MAX(pl.tier),0)
            FROM dom_user_miners m
            JOIN dom_mining_plans pl ON pl.id = m.plan_id
            WHERE m.user_id = u.user_id) AS status_level
        FROM dom_comments c
        JOIN dom_users u ON u.user_id = c.user_id
        JOIN dom_posts p ON p.id = c.post_id
        WHERE c.post_id = $1
        ORDER BY c.id ASC"
    )
    .bind(post_id)
    .fetch_all(pool.get_ref())
    .await
    .unwrap_or_default();

    let comments: Vec<CommentItem> = rows.iter().map(|r| {
        let user_id: i64 = r.get(1);
        let username_opt: Option<String> = r.get(4);
        let username = username_opt.unwrap_or_else(|| format!("User {}", user_id));
        let status_level_opt: Option<i32> = r.get(8);
        let status_level = status_level_opt.unwrap_or(0);

        CommentItem {
            id: r.get(0),
            user_id,
            text: r.get(2),
            status_level,
            created_at: r.get(3),
            username,
            post_owner_id: r.get(5),
            likes: r.get::<Option<i32>, _>(6).unwrap_or(0),
            parent_id: r.get(7),
        }
    }).collect();

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "comments": comments
    })))
}

#[derive(serde::Deserialize)]
struct CreateCommentRequest {
    user_id: Option<i64>,
    post_id: Option<i64>,
    text: Option<String>,
    reply_to: Option<i64>,
}

async fn api_comment_create(
    body: web::Json<CreateCommentRequest>,
    pool: web::Data<PgPool>,
    sio: web::Data<SocketIoLayer>,
) -> ActixResult<HttpResponse> {
    let user_id = body.user_id.unwrap_or(0);
    let post_id = body.post_id.unwrap_or(0);
    let text = body.text.as_ref().map(|s| s.trim()).unwrap_or("").to_string();
    let parent_id = body.reply_to;

    if user_id == 0 || post_id == 0 || text.is_empty() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "ok": false,
            "error": "missing data"
        })));
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    sqlx::query(
        "INSERT INTO dom_comments (post_id, user_id, text, created_at, parent_id)
        VALUES ($1, $2, $3, $4, $5)"
    )
    .bind(post_id)
    .bind(user_id)
    .bind(&text)
    .bind(now)
    .bind(parent_id)
    .execute(pool.get_ref())
    .await
    .ok();

    // Emit real-time event
    let room = format!("post_{}", post_id);
    if let Some(sio_ref) = sio.io() {
        let _ = sio_ref.to(&room).emit("comment_new", serde_json::json!({
            "post_id": post_id
        }));
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({"ok": true})))
}

#[derive(serde::Deserialize)]
struct MessageSeenRequest {
    uid: Option<i64>,
    partner: Option<i64>,
}

async fn api_message_seen(
    body: web::Json<MessageSeenRequest>,
    pool: web::Data<PgPool>,
) -> ActixResult<HttpResponse> {
    let uid = body.uid.unwrap_or(0);
    let partner = body.partner.unwrap_or(0);

    if uid == 0 || partner == 0 {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "ok": false,
            "error": "bad_params"
        })));
    }

    // Get last message id in conversation
    let row = sqlx::query(
        "SELECT COALESCE(MAX(id), 0)
        FROM dom_messages
        WHERE (sender=$1 AND receiver=$2) OR (sender=$3 AND receiver=$4)"
    )
    .bind(uid)
    .bind(partner)
    .bind(partner)
    .bind(uid)
    .fetch_one(pool.get_ref())
    .await
    .ok();

    let last_id: i64 = row.map(|r| r.get(0)).unwrap_or(0);

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    sqlx::query(
        "INSERT INTO dom_dm_last_seen (user_id, partner_id, last_seen_msg_id, updated_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id, partner_id)
        DO UPDATE SET last_seen_msg_id=EXCLUDED.last_seen_msg_id, updated_at=EXCLUDED.updated_at"
    )
    .bind(uid)
    .bind(partner)
    .bind(last_id)
    .bind(now)
    .execute(pool.get_ref())
    .await
    .ok();

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "last_seen": last_id
    })))
}

#[derive(serde::Serialize)]
struct FeedPost {
    id: i64,
    user_id: i64,
    username: String,
    avatar: String,
    text: String,
    status_level: i32,
    media_url: String,
    likes: i32,
    created_at: i64,
    liked: bool,
}

#[derive(serde::Deserialize)]
struct PostsFeedQuery {
    uid: Option<String>,
}

async fn api_posts_feed(
    query: web::Query<PostsFeedQuery>,
    pool: web::Data<PgPool>,
) -> ActixResult<HttpResponse> {
    let viewer_id: i64 = query.uid.as_ref()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    let rows = sqlx::query(
        "SELECT p.id, p.user_id, u.username, u.avatar,
            (SELECT COALESCE(MAX(pl.tier),0)
                FROM dom_user_miners m
                JOIN dom_mining_plans pl ON pl.id = m.plan_id
                WHERE m.user_id = u.user_id) AS status_level,
            p.text, p.media_url, p.likes, p.created_at
        FROM dom_posts p
        JOIN dom_users u ON u.user_id = p.user_id
        ORDER BY p.created_at DESC
        LIMIT 50"
    )
    .fetch_all(pool.get_ref())
    .await
    .unwrap_or_default();

    let mut liked_map = std::collections::HashMap::new();
    if viewer_id != 0 {
        let liked_rows = sqlx::query("SELECT post_id FROM dom_post_likes WHERE user_id = $1")
            .bind(viewer_id)
            .fetch_all(pool.get_ref())
            .await
            .unwrap_or_default();

        for r in liked_rows {
            let post_id: i64 = r.get(0);
            liked_map.insert(post_id, true);
        }
    }

    let posts: Vec<FeedPost> = rows.iter().map(|r| {
        let pid: i64 = r.get(0);
        let uid: i64 = r.get(1);
        let username: Option<String> = r.get(2);
        let avatar: Option<String> = r.get(3);
        let status_level: Option<i32> = r.get(4);
        let text: String = r.get(5);
        let media_url: String = r.get(6);
        let likes: Option<i32> = r.get(7);
        let created_at: i64 = r.get(8);

        FeedPost {
            id: pid,
            user_id: uid,
            username: username.unwrap_or_default(),
            avatar: avatar.unwrap_or_else(|| "/portal/default.png".to_string()),
            text,
            status_level: status_level.unwrap_or(0),
            media_url,
            likes: likes.unwrap_or(0),
            created_at,
            liked: *liked_map.get(&pid).unwrap_or(&false),
        }
    }).collect();

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "posts": posts
    })))
}

#[derive(serde::Deserialize)]
struct PostsUserQuery {
    viewer: Option<String>,
}

async fn api_posts_user(
    path: web::Path<i64>,
    query: web::Query<PostsUserQuery>,
    pool: web::Data<PgPool>,
) -> ActixResult<HttpResponse> {
    let user_id = path.into_inner();
    let viewer_id: i64 = query.viewer.as_ref()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    let rows = sqlx::query(
        "SELECT p.id, p.user_id, u.username, u.avatar,
            (SELECT COALESCE(MAX(pl.tier),0)
                FROM dom_user_miners m
                JOIN dom_mining_plans pl ON pl.id = m.plan_id
                WHERE m.user_id = u.user_id) AS status_level,
            p.text, p.media_url, p.likes, p.created_at
        FROM dom_posts p
        JOIN dom_users u ON u.user_id = p.user_id
        WHERE p.user_id = $1
        ORDER BY p.created_at DESC
        LIMIT 50"
    )
    .bind(user_id)
    .fetch_all(pool.get_ref())
    .await
    .unwrap_or_default();

    let mut liked_map = std::collections::HashMap::new();
    if viewer_id != 0 {
        let liked_rows = sqlx::query("SELECT post_id FROM dom_post_likes WHERE user_id = $1")
            .bind(viewer_id)
            .fetch_all(pool.get_ref())
            .await
            .unwrap_or_default();

        for r in liked_rows {
            let post_id: i64 = r.get(0);
            liked_map.insert(post_id, true);
        }
    }

    let posts: Vec<FeedPost> = rows.iter().map(|r| {
        let pid: i64 = r.get(0);
        let uid: i64 = r.get(1);
        let username: Option<String> = r.get(2);
        let avatar: Option<String> = r.get(3);
        let status_level: Option<i32> = r.get(4);
        let text: String = r.get(5);
        let media_url: String = r.get(6);
        let likes: Option<i32> = r.get(7);
        let created_at: i64 = r.get(8);

        FeedPost {
            id: pid,
            user_id: uid,
            username: username.unwrap_or_default(),
            avatar: avatar.unwrap_or_else(|| "/portal/default.png".to_string()),
            text,
            status_level: status_level.unwrap_or(0),
            media_url,
            likes: likes.unwrap_or(0),
            created_at,
            liked: *liked_map.get(&pid).unwrap_or(&false),
        }
    }).collect();

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "posts": posts
    })))
}

#[derive(serde::Deserialize)]
struct PostLikeRequest {
    user_id: Option<i64>,
    post_id: Option<i64>,
}

async fn api_post_like(
    body: web::Json<PostLikeRequest>,
    pool: web::Data<PgPool>,
    sio: web::Data<SocketIoLayer>,
) -> ActixResult<HttpResponse> {
    let user_id = body.user_id.unwrap_or(0);
    let post_id = body.post_id.unwrap_or(0);

    if user_id == 0 || post_id == 0 {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "ok": false,
            "error": "bad_params"
        })));
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    // Check if already liked
    let already = sqlx::query("SELECT 1 FROM dom_post_likes WHERE user_id=$1 AND post_id=$2")
        .bind(user_id)
        .bind(post_id)
        .fetch_optional(pool.get_ref())
        .await
        .unwrap_or(None);

    if already.is_some() {
        return Ok(HttpResponse::Ok().json(serde_json::json!({
            "ok": true,
            "already": true
        })));
    }

    // Insert like
    sqlx::query(
        "INSERT INTO dom_post_likes (user_id, post_id, created_at)
        VALUES ($1, $2, $3)
        ON CONFLICT DO NOTHING"
    )
    .bind(user_id)
    .bind(post_id)
    .bind(now)
    .execute(pool.get_ref())
    .await
    .ok();

    // Increment like count
    sqlx::query("UPDATE dom_posts SET likes = likes + 1 WHERE id = $1")
        .bind(post_id)
        .execute(pool.get_ref())
        .await
        .ok();

    // Emit real-time event
    let room = format!("post_{}", post_id);
    if let Some(sio_ref) = sio.io() {
        let _ = sio_ref.to(&room).emit("post_like", serde_json::json!({
            "post_id": post_id
        }));
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({"ok": true})))
}

#[derive(serde::Deserialize)]
struct CommentLikeRequest {
    comment_id: Option<i64>,
    user_id: Option<i64>,
}

async fn api_comment_like(
    body: web::Json<CommentLikeRequest>,
    pool: web::Data<PgPool>,
) -> ActixResult<HttpResponse> {
    let cid = body.comment_id.unwrap_or(0);
    let uid = body.user_id.unwrap_or(0);

    if cid == 0 || uid == 0 {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "ok": false,
            "error": "missing_params"
        })));
    }

    // Create table if not exists
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS dom_comment_likes (
            id SERIAL PRIMARY KEY,
            user_id BIGINT,
            comment_id BIGINT,
            created_at BIGINT DEFAULT 0,
            UNIQUE(user_id, comment_id)
        )"
    )
    .execute(pool.get_ref())
    .await
    .ok();

    // Check if already liked
    let already = sqlx::query(
        "SELECT 1 FROM dom_comment_likes WHERE user_id=$1 AND comment_id=$2"
    )
    .bind(uid)
    .bind(cid)
    .fetch_optional(pool.get_ref())
    .await
    .unwrap_or(None);

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    if already.is_some() {
        // UNLIKE
        sqlx::query("DELETE FROM dom_comment_likes WHERE user_id=$1 AND comment_id=$2")
            .bind(uid)
            .bind(cid)
            .execute(pool.get_ref())
            .await
            .ok();

        let row = sqlx::query(
            "UPDATE dom_comments
               SET likes = GREATEST(COALESCE(likes,0) - 1, 0)
             WHERE id = $1
         RETURNING likes"
        )
        .bind(cid)
        .fetch_optional(pool.get_ref())
        .await
        .unwrap_or(None);

        let likes: i32 = row.map(|r| r.get(0)).unwrap_or(0);

        return Ok(HttpResponse::Ok().json(serde_json::json!({
            "ok": true,
            "liked": false,
            "likes": likes
        })));
    }

    // LIKE
    sqlx::query(
        "INSERT INTO dom_comment_likes (user_id, comment_id, created_at) VALUES ($1, $2, $3)"
    )
    .bind(uid)
    .bind(cid)
    .bind(now)
    .execute(pool.get_ref())
    .await
    .ok();

    let row = sqlx::query(
        "UPDATE dom_comments
           SET likes = COALESCE(likes,0) + 1
         WHERE id = $1
     RETURNING likes"
    )
    .bind(cid)
    .fetch_optional(pool.get_ref())
    .await
    .unwrap_or(None);

    let likes: i32 = row.map(|r| r.get(0)).unwrap_or(0);

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "liked": true,
        "likes": likes
    })))
}

async fn api_upload_post_media(
    mut payload: actix_multipart::Multipart,
) -> ActixResult<HttpResponse> {
    use tokio::io::AsyncWriteExt;
    use std::process::Stdio;

    let mut uid: Option<String> = None;
    let mut file_data: Option<Vec<u8>> = None;
    let mut filename: Option<String> = None;

    // Parse multipart form data
    while let Ok(Some(mut field)) = payload.try_next().await {
        let content_disposition = field.content_disposition();
        let field_name = content_disposition.get_name().unwrap_or("");

        if field_name == "uid" {
            let mut bytes = Vec::new();
            while let Some(chunk) = field.next().await {
                if let Ok(data) = chunk {
                    bytes.extend_from_slice(&data);
                }
            }
            uid = Some(String::from_utf8_lossy(&bytes).to_string());
        } else if field_name == "file" {
            filename = content_disposition.get_filename().map(|s| s.to_string());
            let mut bytes = Vec::new();
            while let Some(chunk) = field.next().await {
                if let Ok(data) = chunk {
                    bytes.extend_from_slice(&data);
                }
            }
            file_data = Some(bytes);
        }
    }

    if uid.is_none() || file_data.is_none() || filename.is_none() {
        return Ok(HttpResponse::BadRequest().json(serde_json::json!({
            "ok": false,
            "error": "missing"
        })));
    }

    let file_bytes = file_data.unwrap();
    let original_filename = filename.unwrap();

    // Create media folder
    let media_folder = "webapp/static/media/posts";
    std::fs::create_dir_all(media_folder).ok();

    // Generate unique filename
    let ext = std::path::Path::new(&original_filename)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    
    let unique_name = format!("{}.{}", uuid::Uuid::new_v4().to_string().replace("-", ""), ext);
    let temp_path = format!("{}/temp_{}", media_folder, unique_name);
    let final_path = format!("{}/{}", media_folder, unique_name);

    // Save uploaded file
    let mut temp_file = tokio::fs::File::create(&temp_path).await
        .map_err(|_| actix_web::error::ErrorInternalServerError("File write error"))?;
    temp_file.write_all(&file_bytes).await
        .map_err(|_| actix_web::error::ErrorInternalServerError("File write error"))?;
    drop(temp_file);

    // Compress if video
    if ext == "mp4" || ext == "mov" || ext == "avi" || ext == "webm" {
        match tokio::process::Command::new("ffmpeg")
            .args(&[
                "-i", &temp_path,
                "-vf", "scale=-2:480",
                "-c:v", "libx264", "-b:v", "500k",
                "-c:a", "aac", "-b:a", "96k",
                "-preset", "faster",
                "-y", &final_path
            ])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .await
        {
            Ok(status) if status.success() => {
                // Delete temp file
                tokio::fs::remove_file(&temp_path).await.ok();
                log::info!("Compressed video: {}", unique_name);
            }
            _ => {
                // Fallback: use original
                log::error!("FFmpeg error, using original file");
                if tokio::fs::metadata(&temp_path).await.is_ok() {
                    tokio::fs::rename(&temp_path, &final_path).await.ok();
                }
            }
        }
    } else {
        // Not video, just rename
        tokio::fs::rename(&temp_path, &final_path).await.ok();
    }

    // Return URL
    let url = format!("/static/media/posts/{}", unique_name);
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "url": url
    })))
}

async fn admaven_verify() -> ActixResult<HttpResponse> {
    let html = r#"
    <html>
    <head>
        <meta name="admaven-placement" content="BdjwGqdYE">
    </head>
    <body>OK</body>
    </html>
    "#;

    Ok(HttpResponse::Ok()
        .content_type("text/html")
        .body(html))
}

// Database pool is already handled by sqlx::PgPool in main.rs
// No need to translate db() function - sqlx handles pooling automatically
// The pool is created once in main() and shared via web::Data<PgPool>

// No need to translate release_db() function
// sqlx::PgPool automatically handles connection pooling and release
// Connections are returned to the pool when they go out of scope
// The pool cleanup happens automatically via RAII (Resource Acquisition Is Initialization)

async fn run_db_migrations(pool: &PgPool) {
    let alters = [
        "ALTER TABLE dom_users ADD COLUMN IF NOT EXISTS ton_balance NUMERIC(20,6) DEFAULT 0",
        "ALTER TABLE dom_users ADD COLUMN IF NOT EXISTS usd_balance NUMERIC(20,2) DEFAULT 0",
        "ALTER TABLE dom_users ADD COLUMN IF NOT EXISTS last_rate NUMERIC(20,6) DEFAULT 0",
        "ALTER TABLE dom_users ADD COLUMN IF NOT EXISTS avatar TEXT",
        "ALTER TABLE dom_users ADD COLUMN IF NOT EXISTS fires_received INT DEFAULT 0",
        "ALTER TABLE dom_users ADD COLUMN IF NOT EXISTS fires_given INT DEFAULT 0",
        "ALTER TABLE dom_users ADD COLUMN IF NOT EXISTS avatar_data TEXT",
        "ALTER TABLE dom_users ADD COLUMN IF NOT EXISTS allow_forward INTEGER DEFAULT 1",
        "ALTER TABLE dom_users ADD COLUMN IF NOT EXISTS total_games INTEGER DEFAULT 0",
        "ALTER TABLE dom_users ADD COLUMN IF NOT EXISTS total_wins INTEGER DEFAULT 0",
    ];

    for alter in alters.iter() {
        sqlx::query(alter)
            .execute(pool)
            .await
            .ok();
    }

    log::info!("✅ Database migrations completed");
}

async fn init_db(pool: &PgPool) {
    log::info!("🛠️ init_db() — Domino");

    // Create base users table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS dom_users (
            user_id BIGINT PRIMARY KEY,
            username TEXT,
            wallet_address TEXT,
            balance_usd NUMERIC(18,2) DEFAULT 0,
            total_deposit_usd NUMERIC(18,2) DEFAULT 0,
            total_withdraw_usd NUMERIC(18,2) DEFAULT 0,
            inviter_id BIGINT,
            created_at BIGINT
        )"
    )
    .execute(pool)
    .await
    .ok();

    // Apply ALTER patches
    run_db_migrations(pool).await;

    // Deposits table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS dom_deposits (
            id SERIAL PRIMARY KEY,
            user_id BIGINT,
            amount_usd NUMERIC(18,2),
            status TEXT DEFAULT 'auto_credited',
            created_at BIGINT,
            processed_at BIGINT
        )"
    )
    .execute(pool)
    .await
    .ok();

    // Global chat cooldowns table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS dom_global_chat_cooldowns (
            user_id BIGINT PRIMARY KEY,
            last_message_at BIGINT NOT NULL
        )"
    )
    .execute(pool)
    .await
    .ok();

    // Global chat table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS dom_global_chat (
            id SERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL,
            message TEXT NOT NULL,
            created_at BIGINT NOT NULL
        )"
    )
    .execute(pool)
    .await
    .ok();

    // Add highlight column to global chat
    sqlx::query(
        "ALTER TABLE dom_global_chat 
        ADD COLUMN IF NOT EXISTS highlighted BOOLEAN DEFAULT FALSE"
    )
    .execute(pool)
    .await
    .ok();

    // Global chat online users
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS dom_global_chat_online (
            user_id BIGINT PRIMARY KEY,
            last_ping BIGINT NOT NULL
        )"
    )
    .execute(pool)
    .await
    .ok();

    // Fire Reactions Table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS dom_fire_reactions (
            id SERIAL PRIMARY KEY,
            message_id INT NOT NULL,
            chat_type VARCHAR(10) NOT NULL,
            giver_user_id BIGINT NOT NULL,
            receiver_user_id BIGINT NOT NULL,
            amount NUMERIC(5,2) DEFAULT 0.20,
            created_at INT NOT NULL
        )"
    )
    .execute(pool)
    .await
    .ok();

    // Burn Account Tracking
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS dom_burn_account (
            id SERIAL PRIMARY KEY,
            total_burned NUMERIC(10,2) DEFAULT 0,
            last_updated BIGINT
        )"
    )
    .execute(pool)
    .await
    .ok();

    // Initialize burn account if empty
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM dom_burn_account")
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    if count == 0 {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        sqlx::query("INSERT INTO dom_burn_account (total_burned, last_updated) VALUES (0, $1)")
            .bind(now)
            .execute(pool)
            .await
            .ok();
    }

    // DM last seen table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS dom_dm_last_seen (
            user_id BIGINT,
            partner_id BIGINT,
            last_seen_msg_id BIGINT DEFAULT 0,
            updated_at BIGINT DEFAULT 0,
            PRIMARY KEY (user_id, partner_id)
        )"
    )
    .execute(pool)
    .await
    .ok();

    // Message reactions table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS dom_message_reactions (
            id SERIAL PRIMARY KEY,
            message_id INT NOT NULL,
            chat_type VARCHAR(10) NOT NULL,
            user_id BIGINT NOT NULL,
            emoji VARCHAR(10) NOT NULL,
            created_at INT NOT NULL,
            UNIQUE(message_id, chat_type, user_id, emoji)
        )"
    )
    .execute(pool)
    .await
    .ok();

    // Comments table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS dom_comments (
            id SERIAL PRIMARY KEY,
            post_id BIGINT,
            user_id BIGINT,
            text TEXT,
            created_at BIGINT,
            likes INT DEFAULT 0
        )"
    )
    .execute(pool)
    .await
    .ok();

    // Comment likes table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS dom_comment_likes (
            id SERIAL PRIMARY KEY,
            user_id BIGINT,
            comment_id BIGINT,
            created_at BIGINT DEFAULT 0,
            UNIQUE(user_id, comment_id)
        )"
    )
    .execute(pool)
    .await
    .ok();

    // Admin fund table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS dom_admin_fund (
            id INT PRIMARY KEY DEFAULT 1,
            balance NUMERIC(18,2) DEFAULT 0
        )"
    )
    .execute(pool)
    .await
    .ok();

    sqlx::query(
        "INSERT INTO dom_admin_fund (id, balance)
        VALUES (1, 0)
        ON CONFLICT DO NOTHING"
    )
    .execute(pool)
    .await
    .ok();

    // Burn ledger table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS dom_burn_ledger (
            id SERIAL PRIMARY KEY,
            user_id BIGINT,
            amount NUMERIC(18,2),
            reason TEXT,
            created_at BIGINT
        )"
    )
    .execute(pool)
    .await
    .ok();

    // Add columns to comments
    sqlx::query("ALTER TABLE dom_comments ADD COLUMN IF NOT EXISTS likes INT DEFAULT 0")
        .execute(pool)
        .await
        .ok();

    sqlx::query("ALTER TABLE dom_comments ADD COLUMN IF NOT EXISTS parent_id BIGINT DEFAULT NULL")
        .execute(pool)
        .await
        .ok();

    // Withdrawals table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS dom_withdrawals (
            id SERIAL PRIMARY KEY,
            user_id BIGINT,
            amount_usd NUMERIC(18,2),
            status TEXT DEFAULT 'pending',
            created_at BIGINT,
            processed_at BIGINT
        )"
    )
    .execute(pool)
    .await
    .ok();

    // Conversions table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS conversions (
            id SERIAL PRIMARY KEY,
            conversion_id TEXT UNIQUE,
            user_id BIGINT,
            offer_id TEXT,
            payout NUMERIC(18, 4),
            status TEXT,
            created_at BIGINT
        )"
    )
    .execute(pool)
    .await
    .ok();

    // Tasks table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS dom_tasks (
            id SERIAL PRIMARY KEY,
            title TEXT,
            description TEXT,
            url TEXT,
            reward NUMERIC(10,2),
            category TEXT,
            is_active BOOLEAN DEFAULT TRUE,
            created_at BIGINT
        )"
    )
    .execute(pool)
    .await
    .ok();

    // Task completions table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS dom_task_completions (
            id SERIAL PRIMARY KEY,
            user_id BIGINT,
            task_id BIGINT,
            completed_at BIGINT,
            UNIQUE(user_id, task_id)
        )"
    )
    .execute(pool)
    .await
    .ok();

    // Mining plans table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS dom_mining_plans (
            id SERIAL PRIMARY KEY,
            tier INT,
            name TEXT,
            price_usd NUMERIC(18,2),
            duration_hours INT,
            return_mult NUMERIC(10,4),
            created_at BIGINT
        )"
    )
    .execute(pool)
    .await
    .ok();

    // User miners table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS dom_user_miners (
            id SERIAL PRIMARY KEY,
            user_id BIGINT,
            plan_id INT REFERENCES dom_mining_plans(id),
            price_usd NUMERIC(18,2),
            duration_hours INT,
            return_mult NUMERIC(10,4),
            reward_per_second_usd NUMERIC(18,10),
            started_at BIGINT,
            last_claim_at BIGINT,
            ends_at BIGINT
        )"
    )
    .execute(pool)
    .await
    .ok();

    // Messages table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS dom_messages (
            id SERIAL PRIMARY KEY,
            sender BIGINT,
            receiver BIGINT,
            text TEXT,
            reply_to BIGINT DEFAULT NULL,
            created_at BIGINT
        )"
    )
    .execute(pool)
    .await
    .ok();

    sqlx::query("ALTER TABLE dom_messages ADD COLUMN IF NOT EXISTS reply_to BIGINT")
        .execute(pool)
        .await
        .ok();

    // Follows table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS dom_follows (
            id SERIAL PRIMARY KEY,
            follower BIGINT,
            target BIGINT,
            UNIQUE(follower, target)
        )"
    )
    .execute(pool)
    .await
    .ok();

    // Posts table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS dom_posts (
            id SERIAL PRIMARY KEY,
            user_id BIGINT,
            text TEXT,
            media_url TEXT,
            likes INT DEFAULT 0,
            created_at BIGINT
        )"
    )
    .execute(pool)
    .await
    .ok();

    // Post likes table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS dom_post_likes (
            id SERIAL PRIMARY KEY,
            user_id BIGINT,
            post_id INT,
            created_at BIGINT,
            UNIQUE(user_id, post_id)
        )"
    )
    .execute(pool)
    .await
    .ok();

    // DOMIT price history table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS domit_price_history (
            id SERIAL PRIMARY KEY,
            timestamp BIGINT NOT NULL,
            open REAL NOT NULL,
            high REAL NOT NULL,
            low REAL NOT NULL,
            close REAL NOT NULL,
            volume INTEGER DEFAULT 0
        )"
    )
    .execute(pool)
    .await
    .ok();

    // Create index for fast timestamp queries
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_domit_timestamp 
        ON domit_price_history(timestamp DESC)"
    )
    .execute(pool)
    .await
    .ok();

    // DOMIT config table
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS domit_config (
            id INTEGER PRIMARY KEY,
            min_price NUMERIC(10,4) DEFAULT 0.5000,
            max_price NUMERIC(10,4) DEFAULT 1.5000,
            current_price NUMERIC(10,4) DEFAULT 1.0000,
            trend TEXT DEFAULT 'sideways',
            volatility TEXT DEFAULT 'medium',
            last_update TIMESTAMP
        )"
    )
    .execute(pool)
    .await
    .ok();

    // Migration: timestamp TEXT → BIGINT (skip if already migrated)
    sqlx::query(
        "ALTER TABLE domit_price_history 
        ALTER COLUMN timestamp TYPE BIGINT 
        USING timestamp::BIGINT"
    )
    .execute(pool)
    .await
    .ok();

    // Insert default DOMIT config
    sqlx::query(
        "INSERT INTO domit_config (id, current_price, last_update) 
        VALUES (1, 1.0000, NOW())
        ON CONFLICT (id) DO NOTHING"
    )
    .execute(pool)
    .await
    .ok();

    // Initialize mining plans if empty
    let plan_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM dom_mining_plans")
        .fetch_one(pool)
        .await
        .unwrap_or(0);

    if plan_count == 0 {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let plans = [
            (1, "Initiate", 25),
            (2, "Apprentice", 50),
            (3, "Associate", 100),
            (4, "Adept", 250),
            (5, "Knight", 500),
            (6, "Vanguard", 1000),
            (7, "Ascendant", 2500),
            (8, "Sovereign", 5000),
            (9, "Imperial", 7500),
            (10, "Ethereal", 10000),
        ];

        let duration_hours = 60 * 24;
        let return_mult = 1.5;

        for (tier, name, price) in plans.iter() {
            sqlx::query(
                "INSERT INTO dom_mining_plans (tier, name, price_usd, duration_hours, return_mult, created_at)
                VALUES ($1, $2, $3, $4, $5, $6)"
            )
            .bind(tier)
            .bind(name)
            .bind(price)
            .bind(duration_hours)
            .bind(return_mult)
            .bind(now)
            .execute(pool)
            .await
            .ok();
        }

        log::info!("💎 Mining plans initialized (10 tiers).");
    }

    // Update mining plan names
    let name_map = [
        (1, "Initiate"),
        (2, "Apprentice"),
        (3, "Associate"),
        (4, "Adept"),
        (5, "Knight"),
        (6, "Vanguard"),
        (7, "Ascendant"),
        (8, "Sovereign"),
        (9, "Imperial"),
        (10, "Ethereal"),
    ];

    for (tier, name) in name_map.iter() {
        sqlx::query("UPDATE dom_mining_plans SET name = $1 WHERE tier = $2")
            .bind(name)
            .bind(tier)
            .execute(pool)
            .await
            .ok();
    }

    log::info!("✅ Domino tables ready with applied patches!");
}

// No need to translate realtime_emit() as a separate function
// Socket.IO emissions are already handled inline in each route using:
// if let Some(sio_ref) = sio.io() {
//     let _ = sio_ref.to(&room).emit(event, data);
// }
// or
// let _ = sio_ref.emit(event, data); // for broadcast without room

async fn trim_global_chat(pool: &PgPool, sio: &SocketIoLayer, limit: i32) {
    match sqlx::query(
        "DELETE FROM dom_global_chat
        WHERE id NOT IN (
            SELECT id FROM dom_global_chat
            ORDER BY id DESC
            LIMIT $1
        )"
    )
    .bind(limit)
    .execute(pool)
    .await
    {
        Ok(result) => {
            let deleted = result.rows_affected();
            
            if deleted > 0 {
                log::info!("🧹 Global chat trimmed, removed {} old messages", deleted);

                // Emit real-time event to frontend
                if let Some(sio_ref) = sio.io() {
                    let _ = sio_ref.to("global").emit("global_trim", serde_json::json!({
                        "keep": limit
                    }));
                }
            }
        }
        Err(e) => {
            log::error!("❌ trim_global_chat failed: {}", e);
        }
    }
}

async fn ensure_user(
    pool: &PgPool,
    user_id: i64,
    username: Option<String>,
    inviter_id: Option<i64>,
) {
    let mut inviter = inviter_id;
    if inviter == Some(user_id) {
        inviter = None;
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let row = sqlx::query("SELECT user_id, inviter_id FROM dom_users WHERE user_id=$1")
        .bind(user_id)
        .fetch_optional(pool)
        .await
        .unwrap_or(None);

    if row.is_none() {
        sqlx::query(
            "INSERT INTO dom_users (user_id, username, inviter_id, created_at)
            VALUES ($1, $2, $3, $4)"
        )
        .bind(user_id)
        .bind(&username)
        .bind(inviter)
        .bind(now)
        .execute(pool)
        .await
        .ok();
    } else {
        sqlx::query("UPDATE dom_users SET username=$1 WHERE user_id=$2")
            .bind(&username)
            .bind(user_id)
            .execute(pool)
            .await
            .ok();
    }
}

#[derive(serde::Serialize)]
struct UserStats {
    user_id: i64,
    username: Option<String>,
    avatar: Option<String>,
    avatar_data: Option<String>,
    balance_usd: f64,
    ton_balance: f64,
    total_deposit_usd: f64,
    total_withdraw_usd: f64,
    ref_count: i64,
    active_refs: i64,
    team_deposit_usd: f64,
    status_level: i32,
    status_name: String,
    intellect_score: f64,
    total_games: i32,
    total_wins: i32,
}

async fn get_user_stats(pool: &PgPool, user_id: i64) -> Option<UserStats> {
    let row = sqlx::query(
        "SELECT username,
               avatar,
               avatar_data,
               COALESCE(balance_usd,0),
               COALESCE(total_deposit_usd,0),
               COALESCE(total_withdraw_usd,0),
               COALESCE(ton_balance,0),
               COALESCE(last_rate,0),
               COALESCE(total_games,0),
               COALESCE(total_wins,0)
        FROM dom_users
        WHERE user_id=$1"
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .unwrap_or(None)?;

    let username: Option<String> = row.get(0);
    let avatar: Option<String> = row.get(1);
    let avatar_data: Option<String> = row.get(2);
    let balance_usd: rust_decimal::Decimal = row.get(3);
    let total_dep: rust_decimal::Decimal = row.get(4);
    let total_wd: rust_decimal::Decimal = row.get(5);
    let _ton_balance_db: rust_decimal::Decimal = row.get(6);
    let last_rate: rust_decimal::Decimal = row.get(7);
    let total_games: i32 = row.get(8);
    let total_wins: i32 = row.get(9);

    // Get status level
    let status_row = sqlx::query(
        "SELECT COALESCE(MAX(p.tier), 0)
        FROM dom_user_miners m
        JOIN dom_mining_plans p ON m.plan_id = p.id
        WHERE m.user_id = $1"
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .unwrap_or(None);

    let status_level: i32 = status_row.map(|r| r.get(0)).unwrap_or(0);

    let name_map: std::collections::HashMap<i32, &str> = [
        (1, "Initiate"),
        (2, "Apprentice"),
        (3, "Associate"),
        (4, "Adept"),
        (5, "Knight"),
        (6, "Vanguard"),
        (7, "Ascendant"),
        (8, "Sovereign"),
        (9, "Imperial"),
        (10, "Ethereal"),
    ]
    .iter()
    .cloned()
    .collect();

    let status_name = name_map.get(&status_level).unwrap_or(&"None").to_string();

    // Calculate TON balance
    let ton_balance = if last_rate > rust_decimal::Decimal::ZERO {
        balance_usd / last_rate
    } else {
        rust_decimal::Decimal::ZERO
    };

    // Get referral count
    let ref_count_row = sqlx::query("SELECT COUNT(*) FROM dom_users WHERE inviter_id=$1")
        .bind(user_id)
        .fetch_one(pool)
        .await
        .ok();
    let ref_count: i64 = ref_count_row.map(|r| r.get(0)).unwrap_or(0);

    // Get active referrals
    let active_refs_row = sqlx::query(
        "SELECT COUNT(*)
        FROM dom_users
        WHERE inviter_id=$1 AND total_deposit_usd > 0"
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .ok();
    let active_refs: i64 = active_refs_row.map(|r| r.get(0)).unwrap_or(0);

    // Get team deposits
    let team_dep_row = sqlx::query(
        "SELECT COALESCE(SUM(total_deposit_usd),0)
        FROM dom_users
        WHERE inviter_id=$1"
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .ok();
    let team_dep: rust_decimal::Decimal = team_dep_row.map(|r| r.get(0)).unwrap_or(rust_decimal::Decimal::ZERO);

    // Calculate intellect score
    let intellect_score = if total_games > 0 {
        ((total_wins as f64 / total_games as f64) * 10.0 * 10.0).round() / 10.0
    } else {
        0.0
    };

    Some(UserStats {
        user_id,
        username,
        avatar,
        avatar_data,
        balance_usd: balance_usd.to_string().parse().unwrap_or(0.0),
        ton_balance: ton_balance.to_string().parse().unwrap_or(0.0),
        total_deposit_usd: total_dep.to_string().parse().unwrap_or(0.0),
        total_withdraw_usd: total_wd.to_string().parse().unwrap_or(0.0),
        ref_count,
        active_refs,
        team_deposit_usd: team_dep.to_string().parse().unwrap_or(0.0),
        status_level,
        status_name,
        intellect_score,
        total_games,
        total_wins,
    })
}

async fn apply_burn_transaction(
    pool: &PgPool,
    from_user: i64,
    total_amount: f64,
    transfers: Vec<(i64, f64)>,
    burn_amount: f64,
    reason: &str,
) -> Result<(), String> {
    if total_amount <= 0.0 {
        return Err("total_amount must be > 0".to_string());
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    // Check balance
    let row = sqlx::query("SELECT balance_usd FROM dom_users WHERE user_id=$1")
        .bind(from_user)
        .fetch_optional(pool)
        .await
        .unwrap_or(None);

    match row {
        Some(r) => {
            let balance: rust_decimal::Decimal = r.get(0);
            let balance_f64: f64 = balance.to_string().parse().unwrap_or(0.0);
            if balance_f64 < total_amount {
                return Err("low_balance".to_string());
            }
        }
        None => {
            return Err("low_balance".to_string());
        }
    }

    // Deduct total amount
    sqlx::query(
        "UPDATE dom_users
        SET balance_usd = balance_usd - $1
        WHERE user_id=$2"
    )
    .bind(total_amount)
    .bind(from_user)
    .execute(pool)
    .await
    .ok();

    // Apply transfers
    for (uid, amt) in transfers {
        sqlx::query(
            "UPDATE dom_users
            SET balance_usd = balance_usd + $1
            WHERE user_id=$2"
        )
        .bind(amt)
        .bind(uid)
        .execute(pool)
        .await
        .ok();
    }

    // Apply burn
    if burn_amount > 0.0 {
        sqlx::query(
            "INSERT INTO dom_burn_ledger (user_id, amount, reason, created_at)
            VALUES ($1, $2, $3, $4)"
        )
        .bind(from_user)
        .bind(burn_amount)
        .bind(reason)
        .bind(now)
        .execute(pool)
        .await
        .ok();

        sqlx::query(
            "UPDATE dom_burn_account
            SET total_burned = total_burned + $1,
                last_updated = $2
            WHERE id = 1"
        )
        .bind(burn_amount)
        .bind(now)
        .execute(pool)
        .await
        .ok();
    }

    Ok(())
}

async fn apply_deposit(pool: &PgPool, user_id: i64, amount: f64) -> Result<(), sqlx::Error> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    // Start transaction
    let mut tx = pool.begin().await?;

    // Lock user row to prevent race conditions
    sqlx::query("SELECT balance_usd FROM dom_users WHERE user_id = $1 FOR UPDATE")
        .bind(user_id)
        .fetch_optional(&mut *tx)
        .await?;

    // Insert deposit record
    sqlx::query(
        "INSERT INTO dom_deposits (user_id, amount_usd, status, created_at)
        VALUES ($1, $2, 'auto_credited', $3)"
    )
    .bind(user_id)
    .bind(amount)
    .bind(now)
    .execute(&mut *tx)
    .await?;

    // Update user balances
    sqlx::query(
        "UPDATE dom_users
           SET balance_usd = COALESCE(balance_usd,0) + $1,
               total_deposit_usd = COALESCE(total_deposit_usd,0) + $2
         WHERE user_id=$3"
    )
    .bind(amount)
    .bind(amount)
    .bind(user_id)
    .execute(&mut *tx)
    .await?;

    // Commit transaction
    tx.commit().await?;

    Ok(())
}

#[derive(serde::Serialize)]
struct MiningPlan {
    id: i32,
    tier: i32,
    name: String,
    price_usd: f64,
    duration_hours: i32,
    return_mult: f64,
    total_return_usd: f64,
    usd_per_hour: f64,
    domit_per_hour: f64,
}

async fn get_mining_plans(pool: &PgPool) -> Vec<MiningPlan> {
    let rows = sqlx::query(
        "SELECT id, tier, name, price_usd, duration_hours, return_mult
        FROM dom_mining_plans
        ORDER BY tier ASC"
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let mut plans = Vec::new();

    for row in rows {
        let pid: i32 = row.get(0);
        let tier: i32 = row.get(1);
        let name: String = row.get(2);
        let price_usd: rust_decimal::Decimal = row.get(3);
        let duration_hours: i32 = row.get(4);
        let return_mult: rust_decimal::Decimal = row.get(5);

        let price_usd_f64: f64 = price_usd.to_string().parse().unwrap_or(0.0);
        let return_mult_f64: f64 = return_mult.to_string().parse().unwrap_or(0.0);

        let total_return_usd = price_usd_f64 * return_mult_f64;
        let usd_per_hour = if duration_hours > 0 {
            total_return_usd / duration_hours as f64
        } else {
            0.0
        };

        plans.push(MiningPlan {
            id: pid,
            tier,
            name,
            price_usd: price_usd_f64,
            duration_hours,
            return_mult: return_mult_f64,
            total_return_usd,
            usd_per_hour,
            domit_per_hour: usd_per_hour,
        });
    }

    plans
}

#[derive(serde::Serialize)]
struct UserMiner {
    id: i32,
    plan_id: i32,
    tier: i32,
    name: String,
    price_usd: f64,
    duration_hours: i32,
    return_mult: f64,
    reward_per_second_usd: f64,
    started_at: i64,
    last_claim_at: Option<i64>,
    ends_at: i64,
}

async fn get_user_miners(pool: &PgPool, user_id: i64) -> Vec<UserMiner> {
    let rows = sqlx::query(
        "SELECT m.id, m.plan_id, p.tier, p.name,
               m.price_usd, m.duration_hours, m.return_mult,
               m.reward_per_second_usd, m.started_at, m.last_claim_at, m.ends_at
        FROM dom_user_miners m
        JOIN dom_mining_plans p ON m.plan_id = p.id
        WHERE m.user_id = $1
        ORDER BY m.id ASC"
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let mut miners = Vec::new();

    for r in rows {
        let mid: i32 = r.get(0);
        let plan_id: i32 = r.get(1);
        let tier: i32 = r.get(2);
        let name: String = r.get(3);
        let price_usd: rust_decimal::Decimal = r.get(4);
        let duration_hours: i32 = r.get(5);
        let return_mult: rust_decimal::Decimal = r.get(6);
        let rps: rust_decimal::Decimal = r.get(7);
        let started_at: i64 = r.get(8);
        let last_claim_at: Option<i64> = r.get(9);
        let ends_at: i64 = r.get(10);

        miners.push(UserMiner {
            id: mid,
            plan_id,
            tier,
            name,
            price_usd: price_usd.to_string().parse().unwrap_or(0.0),
            duration_hours,
            return_mult: return_mult.to_string().parse().unwrap_or(0.0),
            reward_per_second_usd: rps.to_string().parse().unwrap_or(0.0),
            started_at,
            last_claim_at,
            ends_at,
        });
    }

    miners
}

fn calc_miner_pending(miner: &UserMiner, now: i64) -> (f64, i64) {
    let started = miner.started_at;
    let ends_at = miner.ends_at;
    let last_claim = miner.last_claim_at.unwrap_or(started);
    let rps = miner.reward_per_second_usd;

    if last_claim >= ends_at {
        return (0.0, last_claim);
    }

    let effective_to = now.min(ends_at);
    let dt = (effective_to - last_claim).max(0);
    let reward = dt as f64 * rps;
    let new_last = effective_to;

    (reward, new_last)
}

async fn claim_user_mining_rewards(pool: &PgPool, user_id: i64) -> (f64, usize, f64) {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let miners = get_user_miners(pool, user_id).await;
    if miners.is_empty() {
        return (0.0, 0, 0.0);
    }

    let mut total_reward = 0.0;
    let mut updated_ids = Vec::new();

    for m in &miners {
        let (reward, new_last) = calc_miner_pending(m, now);
        if reward > 0.0 {
            total_reward += reward;
            updated_ids.push((m.id, new_last));
        }
    }

    if total_reward <= 0.0 {
        let stats = get_user_stats(pool, user_id).await;
        let new_balance = stats.map(|s| s.balance_usd).unwrap_or(0.0);
        return (0.0, miners.len(), new_balance);
    }

    // Update last_claim_at for all miners
    for (mid, new_last) in updated_ids {
        sqlx::query(
            "UPDATE dom_user_miners
               SET last_claim_at = $1
             WHERE id = $2"
        )
        .bind(new_last)
        .bind(mid)
        .execute(pool)
        .await
        .ok();
    }

    // Update user balance
    let row = sqlx::query(
        "UPDATE dom_users
           SET balance_usd = COALESCE(balance_usd,0) + $1
         WHERE user_id = $2
        RETURNING balance_usd"
    )
    .bind(total_reward)
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .unwrap_or(None);

    let new_balance = row
        .map(|r| {
            let bal: rust_decimal::Decimal = r.get(0);
            bal.to_string().parse().unwrap_or(0.0)
        })
        .unwrap_or(0.0);

    (total_reward, miners.len(), new_balance)
}

async fn create_withdraw_request(
    pool: &PgPool,
    user_id: i64,
    amount: f64,
) -> Result<(), String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    // Start transaction
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    // Check current balance first (with row lock)
    let row = sqlx::query("SELECT balance_usd FROM dom_users WHERE user_id = $1 FOR UPDATE")
        .bind(user_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    let current_balance: f64 = row
        .map(|r| {
            let bal: rust_decimal::Decimal = r.get(0);
            bal.to_string().parse().unwrap_or(0.0)
        })
        .unwrap_or(0.0);

    if current_balance < amount {
        tx.rollback().await.ok();
        return Err(format!(
            "Insufficient balance: {} < {}",
            current_balance, amount
        ));
    }

    // Get user's wallet address
    let wallet_row = sqlx::query("SELECT wallet_address FROM dom_users WHERE user_id=$1")
        .bind(user_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    let wallet_address: Option<String> = wallet_row.and_then(|r| r.get(0));

    // Insert withdrawal request
    sqlx::query(
        "INSERT INTO dom_withdrawals (user_id, amount_usd, status, created_at, wallet_address)
        VALUES ($1, $2, 'pending', $3, $4)"
    )
    .bind(user_id)
    .bind(amount)
    .bind(now)
    .bind(&wallet_address)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Update user balances
    sqlx::query(
        "UPDATE dom_users
           SET balance_usd = balance_usd - $1,
               total_withdraw_usd = COALESCE(total_withdraw_usd,0) + $2
         WHERE user_id=$3"
    )
    .bind(amount)
    .bind(amount)
    .bind(user_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Commit transaction
    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(())
}

async fn api_user(
    Path(user_id): Path<i64>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let stats = get_user_stats(&state.pool, user_id).await;
    
    match stats {
        None => {
            Json(serde_json::json!({
                "ok": false,
                "error": "user_not_found"
            }))
            .into_response()
        }
        Some(mut stats_data) => {
            // Serialize to JSON value for manipulation
            let mut user_json = serde_json::to_value(&stats_data).unwrap();
            
            // Set avatar priority: avatar_data > avatar > default
            if let Some(avatar_data) = stats_data.avatar_data.as_ref() {
                user_json["avatar"] = serde_json::json!(avatar_data);
            } else if let Some(avatar) = stats_data.avatar.as_ref() {
                user_json["avatar"] = serde_json::json!(avatar);
            } else {
                user_json["avatar"] = serde_json::json!("/portal/default.png");
            }
            
            // Add online status
            let is_online = state.online_users.lock().unwrap().contains_key(&user_id);
            user_json["is_online"] = serde_json::json!(is_online);
            
            Json(serde_json::json!({
                "ok": true,
                "user": user_json
            }))
            .into_response()
        }
    }
}

#[derive(serde::Deserialize)]
struct DominoStarsQuery {
    uid: Option<i64>,
}

async fn api_user_domino_stars(
    Query(params): Query<DominoStarsQuery>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let uid = match params.uid {
        Some(id) => id,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "no uid"
                }))
            ).into_response();
        }
    };

    let row = sqlx::query(
        "SELECT COUNT(*)
        FROM dom_fire_reactions
        WHERE receiver_user_id = $1"
    )
    .bind(uid)
    .fetch_one(&state.pool)
    .await;

    let count: i64 = row
        .map(|r| r.get(0))
        .unwrap_or(0);

    Json(serde_json::json!({
        "ok": true,
        "count": count
    }))
    .into_response()
}

#[derive(serde::Deserialize)]
struct DepositRequest {
    user_id: Option<i64>,
    amount: Option<f64>,
}

async fn api_deposit(
    State(state): State<AppState>,
    Json(data): Json<DepositRequest>,
) -> impl IntoResponse {
    let user_id = match data.user_id {
        Some(id) if id > 0 => id,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "bad_params"
                }))
            ).into_response();
        }
    };

    let amount = match data.amount {
        Some(amt) if amt > 0.0 => amt,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "bad_params"
                }))
            ).into_response();
        }
    };

    // Check if user already has a pending withdraw
    let pending_row = sqlx::query(
        "SELECT COUNT(*) FROM dom_withdrawals 
        WHERE user_id = $1 AND status = 'pending'"
    )
    .bind(user_id)
    .fetch_one(&state.pool)
    .await;

    let pending_count: i64 = pending_row.map(|r| r.get(0)).unwrap_or(0);

    if pending_count > 0 {
        return Json(serde_json::json!({
            "ok": false,
            "error": "pending_withdraw_exists",
            "message": "Դուք արդեն ունեք սպասման փուլում գտնվող կանխիկացման հայտ։ Խնդրում ենք սպասել նախորդ հայտի հաստատմանը։"
        }))
        .into_response();
    }

    // Check if user exists
    let stats = get_user_stats(&state.pool, user_id).await;
    if stats.is_none() {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({
                "ok": false,
                "error": "user_not_found"
            }))
        ).into_response();
    }

    // Apply deposit
    if let Err(e) = apply_deposit(&state.pool, user_id, amount).await {
        log::error!("Failed to apply deposit: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "ok": false,
                "error": "deposit_failed"
            }))
        ).into_response();
    }

    // Get updated stats
    let new_stats = get_user_stats(&state.pool, user_id).await;

    Json(serde_json::json!({
        "ok": true,
        "message": "Դեպոզիտի հարցումը գրանցվեց ✅ Գումարը հաշվվել է ձեր բալանսի վրա։",
        "user": new_stats
    }))
    .into_response()
}

#[derive(serde::Deserialize)]
struct CrashDepositRequest {
    user_id: Option<i64>,
    amount: Option<f64>,
}

async fn api_crash_deposit(
    State(state): State<AppState>,
    Json(data): Json<CrashDepositRequest>,
) -> impl IntoResponse {
    let user_id = match data.user_id {
        Some(id) if id > 0 => id,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "bad_params"
                }))
            ).into_response();
        }
    };

    let amount = match data.amount {
        Some(amt) if amt > 0.0 => amt,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "bad_params"
                }))
            ).into_response();
        }
    };

    let stats = get_user_stats(&state.pool, user_id).await;
    let stats = match stats {
        Some(s) => s,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "user_not_found"
                }))
            ).into_response();
        }
    };

    if amount > stats.balance_usd {
        return Json(serde_json::json!({
            "ok": false,
            "error": "low_balance"
        }))
        .into_response();
    }

    let row = sqlx::query(
        "UPDATE dom_users
        SET balance_usd = balance_usd - $1
        WHERE user_id = $2
        RETURNING balance_usd"
    )
    .bind(amount)
    .bind(user_id)
    .fetch_optional(&state.pool)
    .await;

    let new_main: f64 = row
        .and_then(|r| r)
        .map(|r| {
            let bal: rust_decimal::Decimal = r.get(0);
            bal.to_string().parse().unwrap_or(0.0)
        })
        .unwrap_or(stats.balance_usd - amount);

    Json(serde_json::json!({
        "ok": true,
        "new_main": new_main
    }))
    .into_response()
}

#[derive(serde::Deserialize)]
struct CrashClaimRequest {
    user_id: Option<i64>,
    win: Option<f64>,
}

async fn api_crash_claim(
    State(state): State<AppState>,
    Json(data): Json<CrashClaimRequest>,
) -> impl IntoResponse {
    let user_id = match data.user_id {
        Some(id) if id > 0 => id,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "bad_params"
                }))
            ).into_response();
        }
    };

    let win = match data.win {
        Some(w) if w > 0.0 => w,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "bad_params"
                }))
            ).into_response();
        }
    };

    let row = sqlx::query(
        "UPDATE dom_users
        SET balance_usd = COALESCE(balance_usd,0) + $1
        WHERE user_id = $2
        RETURNING balance_usd"
    )
    .bind(win)
    .bind(user_id)
    .fetch_optional(&state.pool)
    .await;

    let new_balance: f64 = row
        .and_then(|r| r)
        .map(|r| {
            let bal: rust_decimal::Decimal = r.get(0);
            bal.to_string().parse().unwrap_or(0.0)
        })
        .unwrap_or(0.0);

    Json(serde_json::json!({
        "ok": true,
        "new_balance": new_balance
    }))
    .into_response()
}

#[derive(serde::Deserialize)]
struct CrashLoseRequest {
    user_id: Option<i64>,
    amount: Option<f64>,
}

async fn api_crash_lose(
    Json(data): Json<CrashLoseRequest>,
) -> impl IntoResponse {
    let user_id = match data.user_id {
        Some(id) if id > 0 => id,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "bad_params"
                }))
            ).into_response();
        }
    };

    let amount = match data.amount {
        Some(amt) if amt > 0.0 => amt,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "bad_params"
                }))
            ).into_response();
        }
    };

    Json(serde_json::json!({
        "ok": true
    }))
    .into_response()
}

#[derive(serde::Deserialize)]
struct CrashWithdrawRequest {
    user_id: Option<i64>,
    amount: Option<f64>,
}

async fn api_crash_withdraw(
    State(state): State<AppState>,
    Json(data): Json<CrashWithdrawRequest>,
) -> impl IntoResponse {
    let user_id = match data.user_id {
        Some(id) if id > 0 => id,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "bad_params"
                }))
            ).into_response();
        }
    };

    let amount = match data.amount {
        Some(amt) if amt > 0.0 => amt,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "bad_params"
                }))
            ).into_response();
        }
    };

    sqlx::query(
        "UPDATE dom_users
        SET balance_usd = balance_usd + $1
        WHERE user_id = $2"
    )
    .bind(amount)
    .bind(user_id)
    .execute(&state.pool)
    .await
    .ok();

    Json(serde_json::json!({
        "ok": true
    }))
    .into_response()
}

#[derive(serde::Deserialize)]
struct WithdrawRequestData {
    user_id: Option<i64>,
    amount: Option<f64>,
}

async fn api_withdraw_request(
    State(state): State<AppState>,
    Json(data): Json<WithdrawRequestData>,
) -> impl IntoResponse {
    let user_id = match data.user_id {
        Some(id) if id > 0 => id,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "bad_params"
                }))
            ).into_response();
        }
    };

    let amount = match data.amount {
        Some(amt) if amt > 0.0 => amt,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "bad_params"
                }))
            ).into_response();
        }
    };

    let stats = get_user_stats(&state.pool, user_id).await;
    let stats = match stats {
        Some(s) => s,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "user_not_found"
                }))
            ).into_response();
        }
    };

    let balance = stats.balance_usd;
    let ref_count = stats.ref_count;
    let team_dep = stats.team_deposit_usd;

    if amount > balance {
        return Json(serde_json::json!({
            "ok": false,
            "error": "not_enough_balance",
            "message": "Ունեք բավարար բալանս կանխիկացման համար չէ։"
        }))
        .into_response();
    }

    if ref_count < 10 {
        return Json(serde_json::json!({
            "ok": false,
            "error": "not_enough_refs",
            "message": "Կանխիկացնելու համար պետք է ունենաք առնվազն 10 հրավիրված ընկեր։"
        }))
        .into_response();
    }

    if team_dep < 200.0 {
        return Json(serde_json::json!({
            "ok": false,
            "error": "not_enough_team_deposit",
            "message": "Կանխիկացնելու համար ձեր հրավիրվածների ընդհանուր դեպոզիտը պետք է լինի առնվազն 200$։"
        }))
        .into_response();
    }

    if let Err(e) = create_withdraw_request(&state.pool, user_id, amount).await {
        log::error!("Failed to create withdraw request: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "ok": false,
                "error": "withdraw_failed",
                "message": e
            }))
        ).into_response();
    }

    let new_stats = get_user_stats(&state.pool, user_id).await;

    Json(serde_json::json!({
        "ok": true,
        "message": "Ձեր կանխիկացման հայտը ստացվել է ✅ Գումարը կփոխանցվի մինչև 24 ժամվա ընթացքում։",
        "user": new_stats
    }))
    .into_response()
}

#[derive(serde::Deserialize)]
struct DiceDepositRequest {
    user_id: Option<i64>,
    amount: Option<f64>,
}

async fn api_dice_deposit(
    State(state): State<AppState>,
    Json(data): Json<DiceDepositRequest>,
) -> impl IntoResponse {
    let user_id = match data.user_id {
        Some(id) if id > 0 => id,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "bad_params"
                }))
            ).into_response();
        }
    };

    let amount = match data.amount {
        Some(amt) if amt > 0.0 => amt,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "bad_params"
                }))
            ).into_response();
        }
    };

    let stats = get_user_stats(&state.pool, user_id).await;
    let stats = match stats {
        Some(s) => s,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "user_not_found"
                }))
            ).into_response();
        }
    };

    if amount > stats.balance_usd {
        return Json(serde_json::json!({
            "ok": false,
            "error": "low_balance"
        }))
        .into_response();
    }

    sqlx::query(
        "UPDATE dom_users
        SET balance_usd = balance_usd - $1
        WHERE user_id = $2"
    )
    .bind(amount)
    .bind(user_id)
    .execute(&state.pool)
    .await
    .ok();

    Json(serde_json::json!({
        "ok": true,
        "new_main": stats.balance_usd - amount
    }))
    .into_response()
}

#[derive(serde::Deserialize)]
struct DiceWithdrawRequest {
    user_id: Option<i64>,
    amount: Option<f64>,
}

async fn api_dice_withdraw(
    State(state): State<AppState>,
    Json(data): Json<DiceWithdrawRequest>,
) -> impl IntoResponse {
    let user_id = match data.user_id {
        Some(id) if id > 0 => id,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "bad_params"
                }))
            ).into_response();
        }
    };

    let amount = match data.amount {
        Some(amt) if amt > 0.0 => amt,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "bad_params"
                }))
            ).into_response();
        }
    };

    sqlx::query(
        "UPDATE dom_users
        SET balance_usd = balance_usd + $1
        WHERE user_id = $2"
    )
    .bind(amount)
    .bind(user_id)
    .execute(&state.pool)
    .await
    .ok();

    Json(serde_json::json!({
        "ok": true
    }))
    .into_response()
}

#[derive(serde::Deserialize)]
struct SlotsDepositRequest {
    user_id: i64,
    amount: Option<f64>,
}

async fn api_slots_deposit(
    State(state): State<AppState>,
    Json(data): Json<SlotsDepositRequest>,
) -> impl IntoResponse {
    let amount = match data.amount {
        Some(amt) if amt > 0.0 => amt,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "bad_amount"
                }))
            ).into_response();
        }
    };

    let row = sqlx::query("SELECT balance_usd FROM dom_users WHERE user_id=$1")
        .bind(data.user_id)
        .fetch_optional(&state.pool)
        .await
        .unwrap_or(None);

    let main_balance: f64 = match row {
        Some(r) => {
            let bal: rust_decimal::Decimal = r.get(0);
            bal.to_string().parse().unwrap_or(0.0)
        }
        None => {
            return Json(serde_json::json!({
                "ok": false,
                "error": "no_user"
            }))
            .into_response();
        }
    };

    if main_balance < amount {
        return Json(serde_json::json!({
            "ok": false,
            "error": "not_enough"
        }))
        .into_response();
    }

    let new_main = main_balance - amount;

    sqlx::query("UPDATE dom_users SET balance_usd=$1 WHERE user_id=$2")
        .bind(new_main)
        .bind(data.user_id)
        .execute(&state.pool)
        .await
        .ok();

    Json(serde_json::json!({
        "ok": true,
        "new_main": new_main
    }))
    .into_response()
}

#[derive(serde::Deserialize)]
struct SlotsWithdrawRequest {
    user_id: i64,
    amount: Option<f64>,
}

async fn api_slots_withdraw(
    State(state): State<AppState>,
    Json(data): Json<SlotsWithdrawRequest>,
) -> impl IntoResponse {
    let amount = match data.amount {
        Some(amt) if amt > 0.0 => amt,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "bad_amount"
                }))
            ).into_response();
        }
    };

    let row = sqlx::query("SELECT balance_usd FROM dom_users WHERE user_id=$1")
        .bind(data.user_id)
        .fetch_optional(&state.pool)
        .await
        .unwrap_or(None);

    let main_balance: f64 = match row {
        Some(r) => {
            let bal: rust_decimal::Decimal = r.get(0);
            bal.to_string().parse().unwrap_or(0.0)
        }
        None => {
            return Json(serde_json::json!({
                "ok": false,
                "error": "no_user"
            }))
            .into_response();
        }
    };

    let new_main = main_balance + amount;

    sqlx::query("UPDATE dom_users SET balance_usd=$1 WHERE user_id=$2")
        .bind(new_main)
        .bind(data.user_id)
        .execute(&state.pool)
        .await
        .ok();

    Json(serde_json::json!({
        "ok": true,
        "new_main": new_main
    }))
    .into_response()
}

#[derive(serde::Deserialize)]
struct TaskRewardRequest {
    user_id: Option<i64>,
    amount: Option<f64>,
}

async fn api_task_reward(
    State(state): State<AppState>,
    Json(data): Json<TaskRewardRequest>,
) -> impl IntoResponse {
    let user_id = match data.user_id {
        Some(id) if id > 0 => id,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "bad_params"
                }))
            ).into_response();
        }
    };

    let amount = match data.amount {
        Some(amt) if amt > 0.0 => amt,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "bad_params"
                }))
            ).into_response();
        }
    };

    let row = sqlx::query("SELECT balance_usd FROM dom_users WHERE user_id=$1")
        .bind(user_id)
        .fetch_optional(&state.pool)
        .await
        .unwrap_or(None);

    let current_balance: f64 = match row {
        Some(r) => {
            let bal: rust_decimal::Decimal = r.get(0);
            bal.to_string().parse().unwrap_or(0.0)
        }
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "user_not_found"
                }))
            ).into_response();
        }
    };

    let new_balance = current_balance + amount;

    sqlx::query("UPDATE dom_users SET balance_usd=$1 WHERE user_id=$2")
        .bind(new_balance)
        .bind(user_id)
        .execute(&state.pool)
        .await
        .ok();

    Json(serde_json::json!({
        "ok": true,
        "new_balance": new_balance
    }))
    .into_response()
}

async fn timewall_postback(
    State(state): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    println!("🔔 TimeWall POSTBACK: {:?}", params);

    let user_id_raw = params.get("s1").or_else(|| params.get("user_id"));
    let task_id_raw = params.get("s2");
    let tx_id = params.get("tx").or_else(|| params.get("transactionID"));
    let amount_raw = params.get("amount").or_else(|| params.get("currencyAmount"));
    let revenue_raw = params.get("revenue").or_else(|| params.get("income"));

    if user_id_raw.is_none() || tx_id.is_none() || amount_raw.is_none() {
        return (StatusCode::BAD_REQUEST, "Missing params").into_response();
    }

    let user_id: i64 = match user_id_raw.unwrap().parse() {
        Ok(id) => id,
        Err(_) => return (StatusCode::BAD_REQUEST, "Bad user_id").into_response(),
    };

    let task_id: Option<i32> = task_id_raw.and_then(|t| t.parse().ok());

    let amount: f64 = amount_raw.unwrap().parse().unwrap_or(0.0);
    let revenue: f64 = revenue_raw
        .and_then(|r| r.parse().ok())
        .unwrap_or(0.0);

    if amount <= 0.0 {
        return (StatusCode::OK, "No amount").into_response();
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let tx_id_str = tx_id.unwrap().clone();

    // Check if already processed
    let existing = sqlx::query("SELECT 1 FROM conversions WHERE conversion_id=$1")
        .bind(&tx_id_str)
        .fetch_optional(&state.pool)
        .await
        .unwrap_or(None);

    if existing.is_some() {
        return (StatusCode::OK, "Already processed").into_response();
    }

    // Update user balance
    sqlx::query(
        "UPDATE dom_users
        SET balance_usd = COALESCE(balance_usd,0) + $1
        WHERE user_id = $2"
    )
    .bind(amount)
    .bind(user_id)
    .execute(&state.pool)
    .await
    .ok();

    // Insert task completion if task_id exists
    if let Some(tid) = task_id {
        sqlx::query(
            "INSERT INTO dom_task_completions (user_id, task_id, completed_at)
            VALUES ($1, $2, $3)
            ON CONFLICT DO NOTHING"
        )
        .bind(user_id)
        .bind(tid)
        .bind(now)
        .execute(&state.pool)
        .await
        .ok();
    }

    // Insert conversion record
    sqlx::query(
        "INSERT INTO conversions (conversion_id, user_id, offer_id, payout, status, created_at)
        VALUES ($1, $2, 'TIMEWALL', $3, 'credited', $4)"
    )
    .bind(&tx_id_str)
    .bind(user_id)
    .bind(revenue)
    .bind(now)
    .execute(&state.pool)
    .await
    .ok();

    (StatusCode::OK, "OK").into_response()
}

async fn ogads_postback(
    State(state): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    println!("🔔 OGADS POSTBACK: {:?}", params);

    let user_id_raw = params.get("s1");
    let task_id_raw = params.get("s2");
    let payout_raw = params.get("payout");
    let tx_id = params.get("transaction_id");

    if user_id_raw.is_none() || payout_raw.is_none() || tx_id.is_none() {
        return (StatusCode::BAD_REQUEST, "Missing params").into_response();
    }

    let user_id: i64 = match user_id_raw.unwrap().parse() {
        Ok(id) => id,
        Err(_) => return (StatusCode::BAD_REQUEST, "Bad user_id").into_response(),
    };

    let payout: f64 = payout_raw.unwrap().parse().unwrap_or(0.0);

    if payout <= 0.0 {
        return (StatusCode::OK, "No payout").into_response();
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let tx_id_str = tx_id.unwrap().clone();

    // Check if already processed
    let existing = sqlx::query("SELECT 1 FROM conversions WHERE conversion_id=$1")
        .bind(&tx_id_str)
        .fetch_optional(&state.pool)
        .await
        .unwrap_or(None);

    if existing.is_some() {
        return (StatusCode::OK, "Already processed").into_response();
    }

    // Calculate user reward (30% of payout)
    let user_reward = payout * 0.30;

    // Update user balance
    sqlx::query(
        "UPDATE dom_users
        SET balance_usd = COALESCE(balance_usd,0) + $1
        WHERE user_id=$2"
    )
    .bind(user_reward)
    .bind(user_id)
    .execute(&state.pool)
    .await
    .ok();

    // Insert conversion record
    sqlx::query(
        "INSERT INTO conversions (conversion_id, user_id, offer_id, payout, status, created_at)
        VALUES ($1, $2, 'OGADS', $3, 'approved', $4)"
    )
    .bind(&tx_id_str)
    .bind(user_id)
    .bind(payout)
    .bind(now)
    .execute(&state.pool)
    .await
    .ok();

    // Insert task completion if task_id exists
    if let Some(tid_raw) = task_id_raw {
        if let Ok(task_id) = tid_raw.parse::<i32>() {
            sqlx::query(
                "INSERT INTO dom_task_completions (user_id, task_id, completed_at)
                VALUES ($1, $2, $3)
                ON CONFLICT DO NOTHING"
            )
            .bind(user_id)
            .bind(task_id)
            .bind(now)
            .execute(&state.pool)
            .await
            .ok();
        }
    }

    (StatusCode::OK, "OK").into_response()
}

async fn timewall_page(Path(user_id): Path<i64>) -> impl IntoResponse {
    let timewall_link = format!(
        "https://timewall.io/users/login?oid=799afa670a03c54a&uid={}",
        user_id
    );

    let html = format!(
        r#"
    <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>TimeWall</title>
        </head>
        <body style="margin:0; padding:0; overflow:hidden;">
            <iframe src="{}" style="width:100%; height:100%; border:none;"></iframe>
        </body>
    </html>
    "#,
        timewall_link
    );

    Html(html)
}

async fn mylead_postback(
    State(state): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    match serde_json::to_string(&params) {
        Ok(json) => println!("🔔 MyLead POSTBACK: {}", json),
        Err(e) => println!("🔔 MyLead POSTBACK: failed to print - {}", e),
    }

    /*
    MyLead → Domino Postback

    Ակնկալում ենք, որ MyLead-ի tracking link-ի մեջ s1 պարամետրը հավասար է Telegram user_id-ին:
    Postback-ն ուղարկվում է примерно այս տեսքով:

    https://domino-backend-iavj.onrender.com/mylead/postback
        ?s1={sub1}
        &status={status}
        &payout={payout}
        &offer_id={program_id}
        &transaction_id={transaction_id}
    */

    let user_id_raw = params.get("subid1").or_else(|| params.get("s1"));
    let task_id_raw = params.get("subid2").or_else(|| params.get("s2"));
    let status = params.get("status").map(|s| s.to_lowercase());
    let payout_raw = params.get("payout");
    let offer_id = params.get("offer_id");
    let conversion_id = params.get("transaction_id");

    if user_id_raw.is_none() || status.is_none() || conversion_id.is_none() {
        return (StatusCode::BAD_REQUEST, "Missing parameters").into_response();
    }

    let user_id: i64 = match user_id_raw.unwrap().parse() {
        Ok(id) => id,
        Err(_) => return (StatusCode::BAD_REQUEST, "Bad user_id").into_response(),
    };

    let payout: f64 = payout_raw
        .and_then(|p| p.parse().ok())
        .unwrap_or(0.0);

    let task_id: Option<i32> = task_id_raw.and_then(|t| t.parse().ok());

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let conversion_id_str = conversion_id.unwrap().clone();
    let status_str = status.unwrap();

    // Check if already processed
    let existing = sqlx::query("SELECT 1 FROM conversions WHERE conversion_id = $1")
        .bind(&conversion_id_str)
        .fetch_optional(&state.pool)
        .await
        .unwrap_or(None);

    if existing.is_some() {
        return (StatusCode::OK, "Already processed").into_response();
    }

    // If approved and payout > 0, update user balance and total_deposit_usd
    if status_str == "approved" && payout > 0.0 {
        sqlx::query(
            "UPDATE dom_users
               SET balance_usd       = COALESCE(balance_usd,0) + $1,
                   total_deposit_usd = COALESCE(total_deposit_usd,0) + $2
             WHERE user_id = $3"
        )
        .bind(payout)
        .bind(payout)
        .bind(user_id)
        .execute(&state.pool)
        .await
        .ok();
    }

    // Insert conversion record
    sqlx::query(
        "INSERT INTO conversions (conversion_id, user_id, offer_id, payout, status, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)"
    )
    .bind(&conversion_id_str)
    .bind(user_id)
    .bind(offer_id.unwrap_or(&String::new()))
    .bind(payout)
    .bind(&status_str)
    .bind(now)
    .execute(&state.pool)
    .await
    .ok();

    // If approved, payout > 0, and task_id exists, insert task completion
    if status_str == "approved" && payout > 0.0 {
        if let Some(tid) = task_id {
            sqlx::query(
                "INSERT INTO dom_task_completions (user_id, task_id, completed_at)
                VALUES ($1, $2, $3)
                ON CONFLICT DO NOTHING"
            )
            .bind(user_id)
            .bind(tid)
            .bind(now)
            .execute(&state.pool)
            .await
            .ok();
        }
    }

    (StatusCode::OK, "OK").into_response()
}

async fn api_tasks(
    Path(user_id): Path<i64>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let rows = sqlx::query(
        "SELECT id, title, description, url, reward, category, is_active
        FROM dom_tasks
        WHERE is_active = TRUE
        ORDER BY id DESC"
    )
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default();

    let tasks: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            let reward: rust_decimal::Decimal = r.get(4);
            serde_json::json!({
                "id": r.get::<i32, _>(0),
                "title": r.get::<String, _>(1),
                "description": r.get::<String, _>(2),
                "url": r.get::<String, _>(3),
                "reward": reward.to_string().parse::<f64>().unwrap_or(0.0),
                "category": r.get::<String, _>(5),
                "is_active": r.get::<bool, _>(6)
            })
        })
        .collect();

    Json(serde_json::json!({
        "ok": true,
        "tasks": tasks
    }))
}

async fn api_mining_plans(
    State(state): State<AppState>,
) -> impl IntoResponse {
    let plans = get_mining_plans(&state.pool).await;

    Json(serde_json::json!({
        "ok": true,
        "plans": plans
    }))
}

#[derive(serde::Deserialize)]
struct MiningBuyRequest {
    user_id: Option<i64>,
    plan_id: Option<i32>,
}

async fn api_mining_buy(
    State(state): State<AppState>,
    Json(data): Json<MiningBuyRequest>,
) -> impl IntoResponse {
    let user_id = match data.user_id {
        Some(id) if id > 0 => id,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "bad_params"
                }))
            ).into_response();
        }
    };

    let plan_id = match data.plan_id {
        Some(id) if id > 0 => id,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "bad_params"
                }))
            ).into_response();
        }
    };

    let stats = get_user_stats(&state.pool, user_id).await;
    let stats = match stats {
        Some(s) => s,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "user_not_found"
                }))
            ).into_response();
        }
    };

    // Get plan details
    let plan_row = sqlx::query(
        "SELECT id, tier, name, price_usd, duration_hours, return_mult
        FROM dom_mining_plans
        WHERE id = $1"
    )
    .bind(plan_id)
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);

    let plan_row = match plan_row {
        Some(r) => r,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "plan_not_found"
                }))
            ).into_response();
        }
    };

    let pid: i32 = plan_row.get(0);
    let price_usd: f64 = plan_row.get::<rust_decimal::Decimal, _>(3)
        .to_string()
        .parse()
        .unwrap_or(0.0);
    let duration_hours: i32 = plan_row.get(4);
    let return_mult: f64 = plan_row.get::<rust_decimal::Decimal, _>(5)
        .to_string()
        .parse()
        .unwrap_or(0.0);

    if stats.balance_usd < price_usd {
        return Json(serde_json::json!({
            "ok": false,
            "error": "low_balance"
        }))
        .into_response();
    }

    let total_return_usd = price_usd * return_mult;
    let duration_sec = duration_hours * 3600;
    let reward_per_second = total_return_usd / (duration_sec as f64);

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    let ends_at = now + (duration_sec as i64);

    // Update user balance
    sqlx::query(
        "UPDATE dom_users
           SET balance_usd = COALESCE(balance_usd,0) - $1
         WHERE user_id = $2"
    )
    .bind(price_usd)
    .bind(user_id)
    .execute(&state.pool)
    .await
    .ok();

    // Insert new miner
    let miner_row = sqlx::query(
        "INSERT INTO dom_user_miners (
            user_id, plan_id, price_usd, duration_hours,
            return_mult, reward_per_second_usd,
            started_at, last_claim_at, ends_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8)
        RETURNING id"
    )
    .bind(user_id)
    .bind(pid)
    .bind(price_usd)
    .bind(duration_hours)
    .bind(return_mult)
    .bind(reward_per_second)
    .bind(now)
    .bind(ends_at)
    .fetch_one(&state.pool)
    .await;

    let miner_id: i32 = miner_row.map(|r| r.get(0)).unwrap_or(0);

    let new_stats = get_user_stats(&state.pool, user_id).await;

    Json(serde_json::json!({
        "ok": true,
        "message": "Mining package purchased successfully ✅",
        "miner_id": miner_id,
        "user": new_stats
    }))
    .into_response()
}

#[derive(serde::Deserialize)]
struct MiningClaimRequest {
    user_id: Option<i64>,
}

async fn api_mining_claim(
    State(state): State<AppState>,
    Json(data): Json<MiningClaimRequest>,
) -> impl IntoResponse {
    let user_id = match data.user_id {
        Some(id) if id > 0 => id,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "bad_params"
                }))
            ).into_response();
        }
    };

    let (reward_usd, miners_count, new_balance) = 
        claim_user_mining_rewards(&state.pool, user_id).await;

    let user = get_user_stats(&state.pool, user_id).await;

    Json(serde_json::json!({
        "ok": true,
        "claimed_usd": reward_usd,
        "miners_count": miners_count,
        "new_balance_usd": new_balance,
        "user": user
    }))
    .into_response()
}

async fn api_mining_state(
    Path(user_id): Path<i64>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    let stats = get_user_stats(&state.pool, user_id).await;
    let stats = match stats {
        Some(s) => s,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "user_not_found"
                }))
            ).into_response();
        }
    };

    let plans = get_mining_plans(&state.pool).await;
    let miners = get_user_miners(&state.pool, user_id).await;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let mut total_pending = 0.0;
    let mut miners_view: Vec<serde_json::Value> = Vec::new();

    for m in &miners {
        let (reward, _) = calc_miner_pending(m, now);
        total_pending += reward;

        let mut miner_json = serde_json::to_value(m).unwrap_or(serde_json::json!({}));
        if let Some(obj) = miner_json.as_object_mut() {
            obj.insert("pending_usd".to_string(), serde_json::json!(reward));
            obj.insert("pending_domit".to_string(), serde_json::json!(reward));
        }
        miners_view.push(miner_json);
    }

    let state_obj = if !miners_view.is_empty() {
        let first = &miners[0];
        let speed_per_hour = first.reward_per_second_usd * 3600.0;
        serde_json::json!({
            "tier": first.tier,
            "speed": (speed_per_hour * 100.0).round() / 100.0,
            "earned": total_pending,
        })
    } else {
        serde_json::Value::Null
    };

    Json(serde_json::json!({
        "ok": true,
        "user": stats,
        "plans": plans,
        "miners": miners_view,
        "total_pending_usd": total_pending,
        "total_pending_domit": total_pending,
        "state": state_obj
    }))
    .into_response()
}

async fn app_mining() -> impl IntoResponse {
    match tokio::fs::read_to_string("webapp/mining/index.html").await {
        Ok(content) => Html(content).into_response(),
        Err(_) => (StatusCode::NOT_FOUND, "File not found").into_response(),
    }
}

#[derive(serde::Deserialize)]
struct TaskCompleteRequest {
    user_id: Option<i64>,
    task_id: Option<i32>,
}

async fn api_task_complete(
    State(state): State<AppState>,
    Json(data): Json<TaskCompleteRequest>,
) -> impl IntoResponse {
    let user_id = match data.user_id {
        Some(id) if id > 0 => id,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "bad_params"
                }))
            ).into_response();
        }
    };

    let task_id = match data.task_id {
        Some(id) if id > 0 => id,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "bad_params"
                }))
            ).into_response();
        }
    };

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    // Check if already completed
    let existing = sqlx::query(
        "SELECT 1 FROM dom_task_completions
        WHERE user_id=$1 AND task_id=$2"
    )
    .bind(user_id)
    .bind(task_id)
    .fetch_optional(&state.pool)
    .await
    .unwrap_or(None);

    if existing.is_some() {
        return Json(serde_json::json!({
            "ok": false,
            "error": "already_completed"
        }))
        .into_response();
    }

    // Insert task completion
    sqlx::query(
        "INSERT INTO dom_task_completions (user_id, task_id, completed_at)
        VALUES ($1, $2, $3)"
    )
    .bind(user_id)
    .bind(task_id)
    .bind(now)
    .execute(&state.pool)
    .await
    .ok();

    Json(serde_json::json!({
        "ok": true
    }))
    .into_response()
}

use reqwest;

const TON_RATE_URL: &str = "https://tonapi.io/v2/rates?tokens=TON&currencies=USD";

async fn fetch_ton_rate() -> Option<f64> {
    match reqwest::Client::new()
        .get(TON_RATE_URL)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
    {
        Ok(response) => {
            println!("🌐 Calling tonapi.io ...");
            println!("📦 API status: {}", response.status());

            match response.text().await {
                Ok(text) => {
                    println!("📦 API raw body: {}", text);

                    match serde_json::from_str::<serde_json::Value>(&text) {
                        Ok(data) => {
                            if let Some(rate) = data
                                .get("rates")
                                .and_then(|r| r.get("TON"))
                                .and_then(|t| t.get("prices"))
                                .and_then(|p| p.get("USD"))
                                .and_then(|u| u.as_f64())
                            {
                                println!("📊 Parsed rate: {}", rate);
                                Some(rate)
                            } else {
                                println!("🔥 ERROR: Could not parse rate from JSON");
                                None
                            }
                        }
                        Err(e) => {
                            println!("🔥 ERROR parsing JSON: {}", e);
                            None
                        }
                    }
                }
                Err(e) => {
                    println!("🔥 ERROR reading response text: {}", e);
                    None
                }
            }
        }
        Err(e) => {
            println!("🔥 ERROR in fetch_ton_rate(): {}", e);
            None
        }
    }
}

async fn ton_rate_updater(pool: sqlx::PgPool) {
    println!("🔄 TON updater thread started");

    loop {
        match fetch_ton_rate().await {
            Some(rate) if rate > 0.0 => {
                println!("📥 fetch_ton_rate() returned: {}", rate);

                match sqlx::query("UPDATE dom_users SET last_rate=$1")
                    .bind(rate)
                    .execute(&pool)
                    .await
                {
                    Ok(_) => println!("💹 last_rate updated in DB: {}", rate),
                    Err(e) => println!("🔥 Error updating last_rate: {}", e),
                }
            }
            Some(rate) => {
                println!("⚠️ Invalid TON rate: {}, skipping DB update", rate);
            }
            None => {
                println!("⚠️ Failed to fetch TON rate, skipping DB update");
            }
        }

        tokio::time::sleep(tokio::time::Duration::from_secs(300)).await;
    }
}

fn parse_start_payload(text: Option<&str>) -> (Option<String>, Option<i64>) {
    /*
    /start ref_123 -> ("ref", 123)
    /start post_55 -> ("post", 55)
    */
    let text = match text {
        Some(t) => t,
        None => return (None, None),
    };

    let parts: Vec<&str> = text.trim().split_whitespace().collect();
    if parts.len() < 2 {
        return (None, None);
    }

    let payload = parts[1].trim();

    if payload.starts_with("ref_") {
        if let Ok(id) = payload.replacen("ref_", "", 1).parse::<i64>() {
            return (Some("ref".to_string()), Some(id));
        }
    }

    if payload.starts_with("post_") {
        if let Ok(id) = payload.replacen("post_", "", 1).parse::<i64>() {
            return (Some("post".to_string()), Some(id));
        }
    }

    (None, None)
}

fn parse_startapp_payload(text: Option<&str>) -> Option<i64> {
    let text = text?;
    
    let parts: Vec<&str> = text.trim().split_whitespace().collect();
    if parts.len() < 2 {
        return None;
    }

    let payload = parts[1];
    
    if payload.starts_with("post_") {
        payload.replacen("post_", "", 1).parse::<i64>().ok()
    } else {
        None
    }
}

async fn start_cmd(bot: Bot, msg: Message, pool: sqlx::PgPool) -> ResponseResult<()> {
    let user = match msg.from() {
        Some(u) => u,
        None => return Ok(()),
    };

    let text = msg.text().unwrap_or("");
    println!("✅ /start received from {} text: {}", user.id, text);

    let (ptype, pvalue) = parse_start_payload(Some(text));
    let mut inviter_id: Option<i64> = None;
    let mut open_post_id: Option<i64> = None;

    if let Some(ref pt) = ptype {
        if pt == "ref" {
            inviter_id = pvalue;
        } else if pt == "post" {
            open_post_id = pvalue;
        }
    }

    if inviter_id == Some(user.id.0 as i64) {
        inviter_id = None;
    }

    ensure_user(
        &pool,
        user.id.0 as i64,
        user.username.as_deref(),
        inviter_id,
    )
    .await;

    let mut wa_url = format!("{}/app?uid={}", BASE_URL, user.id);
    if let Some(post_id) = open_post_id {
        wa_url = format!("{}&open_post={}", wa_url, post_id);
    }

    let keyboard = InlineKeyboardMarkup::new(vec![vec![
        InlineKeyboardButton::web_app(
            "🎲 OPEN DOMINO APP",
            teloxide::types::WebAppInfo { url: wa_url.parse().unwrap() },
        ),
    ]]);

    bot.send_message(user.id, "🎰 Բարի գալուստ Domino Casino.\nՍեղմիր կոճակին՝ բացելու համար WebApp-ը 👇")
        .reply_markup(keyboard)
        .await?;

    // Optional: pin message (ignore errors)
    let _ = bot.pin_chat_message(user.id, msg.id).await;

    Ok(())
}

// ═══════════════════════════════════════════════════════════
// DOMIT AUTO PRICE UPDATER
// ═══════════════════════════════════════════════════════════

use tokio_cron_scheduler::{Job, JobScheduler};

async fn create_new_candle(
    pool: sqlx::PgPool,
    socketio: Arc<SocketIoLayer>,
) -> Result<(), Box<dyn std::error::Error>> {
    // Ստեղծել նոր 1-րոպեանոց candle (ամեն րոպե)
    
    // Retry logic for connection (sqlx handles this automatically via pool)
    
    // Վերցնել config
    let config_row = sqlx::query(
        "SELECT min_price, max_price FROM domit_config WHERE id = 1"
    )
    .fetch_optional(&pool)
    .await?;

    let (min_price, max_price) = match config_row {
        Some(row) => {
            let min: rust_decimal::Decimal = row.get(0);
            let max: rust_decimal::Decimal = row.get(1);
            (
                min.to_string().parse::<f64>().unwrap_or(0.0),
                max.to_string().parse::<f64>().unwrap_or(1.0),
            )
        }
        None => {
            println!("⚠️ domit_config չկա");
            return Ok(());
        }
    };

    // Վերցնել վերջին candle-ի close
    let last_row = sqlx::query(
        "SELECT close FROM domit_price_history 
        ORDER BY timestamp DESC LIMIT 1"
    )
    .fetch_optional(&pool)
    .await?;

    let last_close = match last_row {
        Some(row) => {
            let close: rust_decimal::Decimal = row.get(0);
            close.to_string().parse::<f64>().unwrap_or((min_price + max_price) / 2.0)
        }
        None => (min_price + max_price) / 2.0,
    };

    // Նոր candle-ը սկսվում է վերջինի close-ից
    let open_price = last_close;
    let close_price = last_close; // Առայժմ նույնն է
    let high_price = open_price;
    let low_price = open_price;
    let volume = 0;

    // Insert նոր candle
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    sqlx::query(
        "INSERT INTO domit_price_history (timestamp, open, high, low, close, volume)
        VALUES ($1, $2, $3, $4, $5, $6)"
    )
    .bind(now)
    .bind(open_price)
    .bind(high_price)
    .bind(low_price)
    .bind(close_price)
    .bind(volume)
    .execute(&pool)
    .await?;

    println!("🕐 New candle created at {}, open={:.4}", now, open_price);

    // Socket.IO emit
    match socketio.emit_to(
        "chart_viewers",
        "new_candle",
        serde_json::json!({
            "time": now,
            "open": open_price,
            "high": high_price,
            "low": low_price,
            "close": close_price
        }),
    ).await {
        Ok(_) => {},
        Err(e) => println!("Socket emit failed: {}", e),
    }

    Ok(())
}

async fn start_candle_scheduler(pool: sqlx::PgPool, socketio: Arc<SocketIoLayer>) {
    let scheduler = JobScheduler::new().await.unwrap();

    // Run every minute
    let pool_clone = pool.clone();
    let socketio_clone = socketio.clone();
    
    scheduler
        .add(
            Job::new_async("0 * * * * *", move |_uuid, _lock| {
                let pool = pool_clone.clone();
                let socketio = socketio_clone.clone();
                Box::pin(async move {
                    if let Err(e) = create_new_candle(pool, socketio).await {
                        eprintln!("❌ Error creating candle: {}", e);
                    }
                })
            })
            .unwrap(),
        )
        .await
        .unwrap();

    scheduler.start().await.unwrap();
    
    println!("📊 DOMIT candle scheduler started (every 1 minute)");
}

async fn update_current_candle(
    pool: sqlx::PgPool,
    socketio: Arc<SocketIoLayer>,
) -> Result<(), Box<dyn std::error::Error>> {
    // Թարմացնել ընթացիկ candle-ը (ամեն 5 վրկ)
    
    // Վերցնել config
    let config_row = sqlx::query(
        "SELECT min_price, max_price FROM domit_config WHERE id = 1"
    )
    .fetch_optional(&pool)
    .await?;

    let (min_price, max_price) = match config_row {
        Some(row) => {
            let min: rust_decimal::Decimal = row.get(0);
            let max: rust_decimal::Decimal = row.get(1);
            (
                min.to_string().parse::<f64>().unwrap_or(0.0),
                max.to_string().parse::<f64>().unwrap_or(1.0),
            )
        }
        None => return Ok(()),
    };

    // Վերցնել վերջին candle-ը
    let candle = sqlx::query(
        "SELECT timestamp, open, high, low, close FROM domit_price_history 
        ORDER BY timestamp DESC LIMIT 1"
    )
    .fetch_optional(&pool)
    .await?;

    let candle = match candle {
        Some(c) => c,
        None => return Ok(()),
    };

    let timestamp: i64 = candle.get(0);
    let open_price: f64 = candle.get::<rust_decimal::Decimal, _>(1)
        .to_string()
        .parse()
        .unwrap_or(0.0);
    let old_high: f64 = candle.get::<rust_decimal::Decimal, _>(2)
        .to_string()
        .parse()
        .unwrap_or(0.0);
    let old_low: f64 = candle.get::<rust_decimal::Decimal, _>(3)
        .to_string()
        .parse()
        .unwrap_or(0.0);
    let old_close: f64 = candle.get::<rust_decimal::Decimal, _>(4)
        .to_string()
        .parse()
        .unwrap_or(0.0);

    // Ստեղծել նոր close (±2% random շարժում)
    let volatility = 0.02;
    let price_change = rand::thread_rng().gen_range(-volatility..=volatility);
    let mut new_close = old_close * (1.0 + price_change);
    new_close = new_close.max(min_price).min(max_price);

    // Թարմացնել high/low
    let new_high = old_high.max(new_close);
    let new_low = old_low.min(new_close);

    // Random volume increase
    let volume_add = rand::thread_rng().gen_range(100..=500);

    // Update վերջին candle-ը
    sqlx::query(
        "UPDATE domit_price_history 
        SET high = $1, low = $2, close = $3, volume = volume + $4
        WHERE timestamp = $5"
    )
    .bind(new_high)
    .bind(new_low)
    .bind(new_close)
    .bind(volume_add)
    .bind(timestamp)
    .execute(&pool)
    .await?;

    println!(
        "📊 DOMIT updated: {:.4} TON (H:{:.4} L:{:.4})",
        new_close, new_high, new_low
    );

    // Socket.IO emit - ✅ Միայն chart viewers-ին
    match socketio.emit_to(
        "chart_viewers",
        "domit_update",
        serde_json::json!({
            "time": timestamp,
            "open": open_price,
            "high": new_high,
            "low": new_low,
            "close": new_close
        }),
    ).await {
        Ok(_) => {},
        Err(e) => println!("Socket emit failed: {}", e),
    }

    Ok(())
}

async fn start_candle_updater(pool: sqlx::PgPool, socketio: Arc<SocketIoLayer>) {
    println!("📊 DOMIT candle updater started (every 5 seconds)");
    
    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
        
        if let Err(e) = update_current_candle(pool.clone(), socketio.clone()).await {
            eprintln!("❌ Error updating candle: {}", e);
        }
    }
}

async fn block_text(bot: Bot, msg: Message) -> ResponseResult<()> {
    // Որ չատը մաքուր մնա՝ ջնջում ենք ցանկացած տեքստային մեսիջ
    let _ = bot.delete_message(msg.chat.id, msg.id).await;
    Ok(())
}

async fn btn_handler(bot: Bot, q: CallbackQuery) -> ResponseResult<()> {
    bot.answer_callback_query(q.id).text("OK").await?;
    Ok(())
}

async fn stats_cmd(bot: Bot, msg: Message, pool: sqlx::PgPool) -> ResponseResult<()> {
    let user_id = msg.from().map(|u| u.id.0 as i64).unwrap_or(0);
    
    let stats = get_user_stats(&pool, user_id).await;
    
    let stats = match stats {
        Some(s) => s,
        None => {
            bot.send_message(msg.chat.id, "Չենք գտնում ձեր տվյալները բազայում։")
                .await?;
            return Ok(());
        }
    };

    let message = format!(
        "💳 Ձեր վիճակը\n\n\
        Balance: {:.2}$\n\
        Total deposit: {:.2}$\n\
        Total withdraw: {:.2}$\n\n\
        Referrals: {} (active: {})\n\
        Team deposit: {:.2}$",
        stats.balance_usd,
        stats.total_deposit_usd,
        stats.total_withdraw_usd,
        stats.ref_count,
        stats.active_refs,
        stats.team_deposit_usd
    );

    bot.send_message(msg.chat.id, message).await?;
    
    Ok(())
}

async fn burn_stats(bot: Bot, msg: Message, pool: sqlx::PgPool) -> ResponseResult<()> {
    let user_id = msg.from().map(|u| u.id.0 as i64).unwrap_or(0);
    
    // Check if admin
    if !ADMIN_IDS.contains(&user_id) {
        bot.send_message(msg.chat.id, "❌ admin չես").await?;
        return Ok(());
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    let today_start = now - 86400;

    // Get total burned from unified account
    let burn_account = sqlx::query(
        "SELECT total_burned, last_updated FROM dom_burn_account WHERE id = 1"
    )
    .fetch_optional(&pool)
    .await
    .unwrap_or(None);

    let (total_burned, last_updated) = match burn_account {
        Some(row) => {
            let burned: Option<rust_decimal::Decimal> = row.get(0);
            let updated: Option<i64> = row.get(1);
            (
                burned.map(|b| b.to_string().parse::<f64>().unwrap_or(0.0)).unwrap_or(0.0),
                updated.unwrap_or(0),
            )
        }
        None => (0.0, 0),
    };

    // Get today's burns from ledger
    let today_burn_row = sqlx::query(
        "SELECT COALESCE(SUM(amount),0) FROM dom_burn_ledger WHERE created_at >= $1"
    )
    .bind(today_start)
    .fetch_one(&pool)
    .await;

    let today_burn: f64 = match today_burn_row {
        Ok(row) => {
            let sum: rust_decimal::Decimal = row.get(0);
            sum.to_string().parse().unwrap_or(0.0)
        }
        Err(_) => 0.0,
    };

    // Get total Domino Stars sent
    let total_fires_row = sqlx::query("SELECT COUNT(*) FROM dom_fire_reactions")
        .fetch_one(&pool)
        .await;

    let total_fires: i64 = match total_fires_row {
        Ok(row) => row.get::<Option<i64>, _>(0).unwrap_or(0),
        Err(_) => 0,
    };

    // Format last updated
    let last_update_str = if last_updated > 0 {
        use chrono::{DateTime, Utc};
        let dt = DateTime::<Utc>::from_timestamp(last_updated, 0)
            .unwrap_or_default();
        dt.format("%Y-%m-%d %H:%M:%S").to_string()
    } else {
        "Never".to_string()
    };

    let message = format!(
        "🔥 Burn վիճակ\n\n\
        💰 Ընդհանուր burned: {:.2} USD\n\
        📅 Այսօր: {:.2} USD\n\
        🌟 Domino Stars: {}\n\
        ⏰ Թարմացում: {}",
        total_burned, today_burn, total_fires, last_update_str
    );

    bot.send_message(msg.chat.id, message).await?;
    
    Ok(())
}

async fn burn_reward(
    bot: Bot,
    msg: Message,
    pool: sqlx::PgPool,
    args: Vec<String>,
) -> ResponseResult<()> {
    let user_id = msg.from().map(|u| u.id.0 as i64).unwrap_or(0);
    
    // Check if admin
    if !ADMIN_IDS.contains(&user_id) {
        bot.send_message(msg.chat.id, "❌ admin չես").await?;
        return Ok(());
    }

    // Validate args
    if args.len() != 2 {
        bot.send_message(msg.chat.id, "Օգտագործում՝ /burn_reward user_id amount")
            .await?;
        return Ok(());
    }

    let target = match args[0].parse::<i64>() {
        Ok(id) => id,
        Err(_) => {
            bot.send_message(msg.chat.id, "❌ Սխալ user_id ֆորմատ")
                .await?;
            return Ok(());
        }
    };

    let amount = match args[1].parse::<f64>() {
        Ok(a) => a,
        Err(_) => {
            bot.send_message(msg.chat.id, "❌ Սխալ amount ֆորմատ")
                .await?;
            return Ok(());
        }
    };

    // Get admin fund balance
    let fund_row = sqlx::query("SELECT balance FROM dom_admin_fund WHERE id=1")
        .fetch_optional(&pool)
        .await
        .unwrap_or(None);

    let fund = match fund_row {
        Some(row) => {
            let balance: rust_decimal::Decimal = row.get(0);
            balance.to_string().parse::<f64>().unwrap_or(0.0)
        }
        None => {
            bot.send_message(msg.chat.id, "❌ Admin fund չի գտնվել")
                .await?;
            return Ok(());
        }
    };

    if fund < amount {
        bot.send_message(msg.chat.id, "❌ Burn ֆոնդում բավարար գումար չկա")
            .await?;
        return Ok(());
    }

    // Deduct from admin fund
    sqlx::query(
        "UPDATE dom_admin_fund
        SET balance = balance - $1
        WHERE id = 1"
    )
    .bind(amount)
    .execute(&pool)
    .await
    .ok();

    // Add to user balance
    sqlx::query(
        "UPDATE dom_users
        SET balance_usd = balance_usd + $1
        WHERE user_id = $2"
    )
    .bind(amount)
    .bind(target)
    .execute(&pool)
    .await
    .ok();

    let message = format!(
        "🎁 {} DOMIT փոխանցվեց օգտատեր {}-ին burn ֆոնդից",
        amount, target
    );

    bot.send_message(msg.chat.id, message).await?;
    
    Ok(())
}

async fn init_domit_data(bot: Bot, msg: Message, pool: sqlx::PgPool) -> ResponseResult<()> {
    // Admin command: Generate initial 24h DOMIT price data
    let user_id = msg.from().map(|u| u.id.0 as i64).unwrap_or(0);
    
    if !ADMIN_IDS.contains(&user_id) {
        bot.send_message(msg.chat.id, "❌ Դու admin չես։").await?;
        return Ok(());
    }
    
    match generate_initial_domit_data(&pool).await {
        Ok(_) => {
            bot.send_message(
                msg.chat.id,
                "✅ DOMIT գրաֆիկի տվյալները ստեղծվեցին!\n📊 288 candles (24 ժամ)"
            )
            .await?;
        }
        Err(e) => {
            eprintln!("❌ Error in init_domit_data: {}", e);
            bot.send_message(msg.chat.id, format!("❌ Սխալ: {}", e))
                .await?;
        }
    }
    
    Ok(())
}

async fn generate_initial_domit_data(pool: &sqlx::PgPool) -> Result<(), Box<dyn std::error::Error>> {
    use chrono::{Duration, Utc};
    use rand::Rng;
    
    // Clear old data
    sqlx::query("DELETE FROM domit_price_history")
        .execute(pool)
        .await?;
    
    // Generate 24 hours of candles
    let base_time = Utc::now() - Duration::hours(24);
    let mut current_price = 1.00;
    let mut rng = rand::thread_rng();
    
    for i in 0..288 {  // 288 × 5min = 24h
        let time = base_time + Duration::minutes(i * 5);
        
        let open_price = current_price;
        let change = rng.gen_range(-0.02..=0.02);
        let close_price = (open_price + change).max(0.50).min(1.50);
        let high_price = open_price.max(close_price) + rng.gen_range(0.0..=0.01);
        let low_price = open_price.min(close_price) - rng.gen_range(0.0..=0.01);
        let volume = rng.gen_range(1000..=5000);
        
        let timestamp = time.timestamp();
        
        sqlx::query(
            "INSERT INTO domit_price_history (timestamp, open, high, low, close, volume)
            VALUES ($1, $2, $3, $4, $5, $6)"
        )
        .bind(timestamp)
        .bind((open_price * 10000.0).round() / 10000.0)
        .bind((high_price * 10000.0).round() / 10000.0)
        .bind((low_price * 10000.0).round() / 10000.0)
        .bind((close_price * 10000.0).round() / 10000.0)
        .bind(volume)
        .execute(pool)
        .await?;
        
        current_price = close_price;
    }
    
    Ok(())
}

async fn set_domit_range(
    bot: Bot,
    msg: Message,
    pool: sqlx::PgPool,
    args: Vec<String>,
) -> ResponseResult<()> {
    // Admin: /set_domit_range 0.50 1.50
    let user_id = msg.from().map(|u| u.id.0 as i64).unwrap_or(0);
    
    if !ADMIN_IDS.contains(&user_id) {
        bot.send_message(msg.chat.id, "❌ Դու admin չես։").await?;
        return Ok(());
    }
    
    if args.len() < 2 {
        bot.send_message(msg.chat.id, "Օգտագործում՝ /set_domit_range 0.50 1.50")
            .await?;
        return Ok(());
    }
    
    let min_price = match args[0].parse::<f64>() {
        Ok(p) => p,
        Err(_) => {
            bot.send_message(msg.chat.id, "❌ Սխալ min_price ֆորմատ")
                .await?;
            return Ok(());
        }
    };
    
    let max_price = match args[1].parse::<f64>() {
        Ok(p) => p,
        Err(_) => {
            bot.send_message(msg.chat.id, "❌ Սխալ max_price ֆորմատ")
                .await?;
            return Ok(());
        }
    };
    
    match sqlx::query(
        "UPDATE domit_config 
        SET min_price = $1, max_price = $2
        WHERE id = 1"
    )
    .bind(min_price)
    .bind(max_price)
    .execute(&pool)
    .await
    {
        Ok(_) => {
            let message = format!("✅ DOMIT range: {} - {} TON", min_price, max_price);
            bot.send_message(msg.chat.id, message).await?;
        }
        Err(e) => {
            eprintln!("❌ Error in set_domit_range: {}", e);
            bot.send_message(msg.chat.id, format!("❌ Սխալ: {}", e))
                .await?;
        }
    }
    
    Ok(())
}

async fn admin_add(
    bot: Bot,
    msg: Message,
    pool: sqlx::PgPool,
    args: Vec<String>,
) -> ResponseResult<()> {
    let user_id = msg.from().map(|u| u.id.0 as i64).unwrap_or(0);
    
    if !ADMIN_IDS.contains(&user_id) {
        bot.send_message(msg.chat.id, "❌ Դու admin չես։").await?;
        return Ok(());
    }

    if args.len() < 2 {
        bot.send_message(msg.chat.id, "Օգտագործում՝ /admin_add user_id amount")
            .await?;
        return Ok(());
    }

    let target = match args[0].parse::<i64>() {
        Ok(id) => id,
        Err(_) => {
            bot.send_message(msg.chat.id, "❌ Սխալ user_id ֆորմատ")
                .await?;
            return Ok(());
        }
    };

    let amount = match args[1].parse::<f64>() {
        Ok(a) => a,
        Err(_) => {
            bot.send_message(msg.chat.id, "❌ Սխալ amount ֆորմատ")
                .await?;
            return Ok(());
        }
    };

    sqlx::query(
        "UPDATE dom_users
        SET balance_usd = COALESCE(balance_usd,0) + $1
        WHERE user_id=$2"
    )
    .bind(amount)
    .bind(target)
    .execute(&pool)
    .await
    .ok();

    let message = format!("✔ {}$ ավելացվեց օգտատեր {}-ի հաշվին։", amount, target);
    bot.send_message(msg.chat.id, message).await?;
    
    Ok(())
}

async fn admin_withdrawals(bot: Bot, msg: Message, pool: sqlx::PgPool) -> ResponseResult<()> {
    // Ցույց տալ բոլոր pending withdraw հայտերը
    let user_id = msg.from().map(|u| u.id.0 as i64).unwrap_or(0);
    
    if !ADMIN_IDS.contains(&user_id) {
        bot.send_message(msg.chat.id, "❌ Դու admin չես։").await?;
        return Ok(());
    }

    let rows = sqlx::query(
        "SELECT w.id, w.user_id, w.amount_usd, w.created_at, u.username, 
               COALESCE(w.wallet_address, u.wallet_address) as wallet_address
        FROM dom_withdrawals w
        LEFT JOIN dom_users u ON w.user_id = u.user_id
        WHERE w.status = 'pending'
        ORDER BY w.created_at ASC"
    )
    .fetch_all(&pool)
    .await
    .unwrap_or_default();
    
    if rows.is_empty() {
        bot.send_message(msg.chat.id, "✅ Չկան pending կանխիկացման հայտեր։")
            .await?;
        return Ok(());
    }
    
    use chrono::{DateTime, Utc};
    
    let mut message = "📋 PENDING ԿԱՆԽԻԿԱՑՈՒՄՆԵՐ:\n\n".to_string();
    
    for row in rows {
        let withdraw_id: i32 = row.get(0);
        let uid: i64 = row.get(1);
        let amount_usd: rust_decimal::Decimal = row.get(2);
        let amount_usd_f64 = amount_usd.to_string().parse::<f64>().unwrap_or(0.0);
        let created_at: i64 = row.get(3);
        let username: Option<String> = row.get(4);
        let wallet: Option<String> = row.get(5);
        
        // Calculate DOMIT/TON rate at request time
        let price_row = sqlx::query(
            "SELECT close FROM domit_price_history 
            WHERE timestamp <= $1 
            ORDER BY timestamp DESC LIMIT 1"
        )
        .bind(created_at)
        .fetch_optional(&pool)
        .await
        .unwrap_or(None);
        
        let ton_price = match price_row {
            Some(r) => {
                let close: f64 = r.get(0);
                close
            }
            None => 0.0001,
        };
        
        let ton_amount = if ton_price > 0.0 {
            amount_usd_f64 / ton_price
        } else {
            0.0
        };
        
        let date_str = DateTime::<Utc>::from_timestamp(created_at, 0)
            .unwrap_or_default()
            .format("%Y-%m-%d %H:%M")
            .to_string();
        
        let username_str = username
            .map(|u| format!("@{}", u))
            .unwrap_or_else(|| "Անանուն".to_string());
        
        let wallet_str = wallet.unwrap_or_else(|| "❌ Չկա wallet".to_string());
        
        message.push_str(&format!(
            "🆔 ID: {}\n\
            👤 User: {} ({})\n\
            💰 Գումար: {:.2} DOMIT (~{:.4} TON)\n\
            💳 Wallet: {}\n\
            📅 Ժամանակ: {}\n\
            ━━━━━━━━━━━━━━━━\n\n",
            withdraw_id, username_str, uid, amount_usd_f64, ton_amount, wallet_str, date_str
        ));
    }
    
    message.push_str("\n📌 Հաստատելու համար՝ /admin_approve <ID>\n");
    message.push_str("📌 Մերժելու համար՝ /admin_reject <ID>");
    
    bot.send_message(msg.chat.id, message).await?;
    
    Ok(())
}

async fn admin_approve(
    bot: Bot,
    msg: Message,
    pool: sqlx::PgPool,
    args: Vec<String>,
) -> ResponseResult<()> {
    // Հաստատել withdraw հայտը
    let user_id = msg.from().map(|u| u.id.0 as i64).unwrap_or(0);
    
    if !ADMIN_IDS.contains(&user_id) {
        bot.send_message(msg.chat.id, "❌ Դու admin չես։").await?;
        return Ok(());
    }
    
    if args.is_empty() {
        bot.send_message(msg.chat.id, "Օգտագործում՝ /admin_approve <withdraw_id>")
            .await?;
        return Ok(());
    }
    
    let withdraw_id = match args[0].parse::<i32>() {
        Ok(id) => id,
        Err(_) => {
            bot.send_message(msg.chat.id, "❌ Սխալ withdraw_id ֆորմատ")
                .await?;
            return Ok(());
        }
    };
    
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    
    // Get withdraw details
    let withdraw_row = sqlx::query(
        "SELECT user_id, amount_usd, status 
        FROM dom_withdrawals 
        WHERE id = $1"
    )
    .bind(withdraw_id)
    .fetch_optional(&pool)
    .await;
    
    match withdraw_row {
        Ok(Some(row)) => {
            let target_user_id: i64 = row.get(0);
            let amount_usd: rust_decimal::Decimal = row.get(1);
            let status: String = row.get(2);
            
            if status != "pending" {
                bot.send_message(msg.chat.id, format!("❌ Withdraw-ը արդեն {} է։", status))
                    .await?;
                return Ok(());
            }
            
            // Update status to approved
            match sqlx::query(
                "UPDATE dom_withdrawals 
                SET status = 'approved', processed_at = $1 
                WHERE id = $2"
            )
            .bind(now)
            .bind(withdraw_id)
            .execute(&pool)
            .await
            {
                Ok(_) => {
                    let amount_f64 = amount_usd.to_string().parse::<f64>().unwrap_or(0.0);
                    
                    bot.send_message(
                        msg.chat.id,
                        format!(
                            "✅ Withdraw #{} հաստատվեց։\n\
                            👤 User: {}\n\
                            💰 Գումար: {:.2} DOMIT",
                            withdraw_id, target_user_id, amount_f64
                        )
                    )
                    .await?;
                    
                    // Send notification to user
                    let notification = bot.send_message(
                        teloxide::types::ChatId(target_user_id),
                        "✅ Ձեր կանխիկացման հայտը հաստատվել է։\n💰 Գումարը փոխանցվել է ձեր wallet-ին։"
                    )
                    .await;
                    
                    if let Err(e) = notification {
                        eprintln!("Could not notify user {}: {}", target_user_id, e);
                    }
                }
                Err(e) => {
                    eprintln!("Error approving withdraw: {}", e);
                    bot.send_message(msg.chat.id, format!("❌ Սխալ՝ {}", e))
                        .await?;
                }
            }
        }
        Ok(None) => {
            bot.send_message(msg.chat.id, format!("❌ Withdraw ID {} չի գտնվել։", withdraw_id))
                .await?;
        }
        Err(e) => {
            eprintln!("Error fetching withdraw: {}", e);
            bot.send_message(msg.chat.id, format!("❌ Սխալ՝ {}", e))
                .await?;
        }
    }
    
    Ok(())
}

async fn admin_reject(
    bot: Bot,
    msg: Message,
    pool: sqlx::PgPool,
    args: Vec<String>,
) -> ResponseResult<()> {
    // Մերժել withdraw հայտը և վերադարձնել գումարը
    let user_id = msg.from().map(|u| u.id.0 as i64).unwrap_or(0);
    
    if !ADMIN_IDS.contains(&user_id) {
        bot.send_message(msg.chat.id, "❌ Դու admin չես։").await?;
        return Ok(());
    }
    
    if args.is_empty() {
        bot.send_message(msg.chat.id, "Օգտագործում՝ /admin_reject <withdraw_id>")
            .await?;
        return Ok(());
    }
    
    let withdraw_id = match args[0].parse::<i32>() {
        Ok(id) => id,
        Err(_) => {
            bot.send_message(msg.chat.id, "❌ Սխալ withdraw_id ֆորմատ")
                .await?;
            return Ok(());
        }
    };
    
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    
    // Start transaction
    let mut tx = match pool.begin().await {
        Ok(t) => t,
        Err(e) => {
            bot.send_message(msg.chat.id, format!("❌ Սխալ՝ {}", e))
                .await?;
            return Ok(());
        }
    };
    
    // Get withdraw details with row lock
    let withdraw_row = sqlx::query(
        "SELECT user_id, amount_usd, status 
        FROM dom_withdrawals 
        WHERE id = $1 FOR UPDATE"
    )
    .bind(withdraw_id)
    .fetch_optional(&mut *tx)
    .await;
    
    match withdraw_row {
        Ok(Some(row)) => {
            let target_user_id: i64 = row.get(0);
            let amount_usd: rust_decimal::Decimal = row.get(1);
            let status: String = row.get(2);
            
            if status != "pending" {
                tx.rollback().await.ok();
                bot.send_message(msg.chat.id, format!("❌ Withdraw-ը արդեն {} է։", status))
                    .await?;
                return Ok(());
            }
            
            // Return money to user balance
            let update_user = sqlx::query(
                "UPDATE dom_users 
                SET balance_usd = COALESCE(balance_usd, 0) + $1,
                    total_withdraw_usd = COALESCE(total_withdraw_usd, 0) - $1
                WHERE user_id = $2"
            )
            .bind(amount_usd)
            .bind(target_user_id)
            .execute(&mut *tx)
            .await;
            
            if update_user.is_err() {
                tx.rollback().await.ok();
                bot.send_message(msg.chat.id, "❌ Սխալ balance թարմացման ժամանակ")
                    .await?;
                return Ok(());
            }
            
            // Update status to rejected
            let update_withdraw = sqlx::query(
                "UPDATE dom_withdrawals 
                SET status = 'rejected', processed_at = $1 
                WHERE id = $2"
            )
            .bind(now)
            .bind(withdraw_id)
            .execute(&mut *tx)
            .await;
            
            if update_withdraw.is_err() {
                tx.rollback().await.ok();
                bot.send_message(msg.chat.id, "❌ Սխալ withdraw թարմացման ժամանակ")
                    .await?;
                return Ok(());
            }
            
            // Commit transaction
            if tx.commit().await.is_err() {
                bot.send_message(msg.chat.id, "❌ Սխալ commit-ի ժամանակ")
                    .await?;
                return Ok(());
            }
            
            let amount_f64 = amount_usd.to_string().parse::<f64>().unwrap_or(0.0);
            
            bot.send_message(
                msg.chat.id,
                format!(
                    "❌ Withdraw #{} մերժվեց։\n\
                    👤 User: {}\n\
                    💰 Գումարը ({:.2} DOMIT) վերադարձվեց balance-ին։",
                    withdraw_id, target_user_id, amount_f64
                )
            )
            .await?;
            
            // Send notification to user
            let notification = bot.send_message(
                teloxide::types::ChatId(target_user_id),
                "❌ Ձեր կանխիկացման հայտը մերժվել է։\n💰 Գումարը վերադարձվել է ձեր balance-ին։"
            )
            .await;
            
            if let Err(e) = notification {
                eprintln!("Could not notify user {}: {}", target_user_id, e);
            }
        }
        Ok(None) => {
            tx.rollback().await.ok();
            bot.send_message(msg.chat.id, format!("❌ Withdraw ID {} չի գտնվել։", withdraw_id))
                .await?;
        }
        Err(e) => {
            tx.rollback().await.ok();
            eprintln!("Error fetching withdraw: {}", e);
            bot.send_message(msg.chat.id, format!("❌ Սխալ՝ {}", e))
                .await?;
        }
    }
    
    Ok(())
}

async fn admin_test_withdraw(
    bot: Bot,
    msg: Message,
    pool: sqlx::PgPool,
    args: Vec<String>,
) -> ResponseResult<()> {
    // TEST: Ստեղծել withdraw request ԱՌԱՆՑ validations-ի
    let user_id = msg.from().map(|u| u.id.0 as i64).unwrap_or(0);
    
    if !ADMIN_IDS.contains(&user_id) {
        bot.send_message(msg.chat.id, "❌ Դու admin չես։").await?;
        return Ok(());
    }
    
    if args.len() < 2 {
        bot.send_message(msg.chat.id, "Օգտագործում՝ /admin_test_withdraw <user_id> <amount>")
            .await?;
        return Ok(());
    }
    
    let target_user_id = match args[0].parse::<i64>() {
        Ok(id) => id,
        Err(_) => {
            bot.send_message(msg.chat.id, "❌ Սխալ user_id ֆորմատ")
                .await?;
            return Ok(());
        }
    };
    
    let amount = match args[1].parse::<f64>() {
        Ok(a) => a,
        Err(_) => {
            bot.send_message(msg.chat.id, "❌ Սխալ amount ֆորմատ")
                .await?;
            return Ok(());
        }
    };
    
    // Start transaction
    let mut tx = match pool.begin().await {
        Ok(t) => t,
        Err(e) => {
            bot.send_message(msg.chat.id, format!("❌ Սխալ՝ {}", e))
                .await?;
            return Ok(());
        }
    };
    
    // Check balance
    let balance_row = sqlx::query(
        "SELECT balance_usd FROM dom_users WHERE user_id = $1 FOR UPDATE"
    )
    .bind(target_user_id)
    .fetch_optional(&mut *tx)
    .await;
    
    let current_balance = match balance_row {
        Ok(Some(row)) => {
            let bal: rust_decimal::Decimal = row.get(0);
            bal.to_string().parse::<f64>().unwrap_or(0.0)
        }
        Ok(None) => {
            tx.rollback().await.ok();
            bot.send_message(msg.chat.id, format!("❌ User {} չի գտնվել", target_user_id))
                .await?;
            return Ok(());
        }
        Err(e) => {
            tx.rollback().await.ok();
            bot.send_message(msg.chat.id, format!("❌ Սխալ՝ {}", e))
                .await?;
            return Ok(());
        }
    };
    
    if current_balance < amount {
        tx.rollback().await.ok();
        bot.send_message(
            msg.chat.id,
            format!("❌ User {}-ը ունի միայն {:.2} DOMIT", target_user_id, current_balance)
        )
        .await?;
        return Ok(());
    }
    
    // Check pending withdrawals
    let pending_row = sqlx::query(
        "SELECT COUNT(*) FROM dom_withdrawals 
        WHERE user_id = $1 AND status = 'pending'"
    )
    .bind(target_user_id)
    .fetch_one(&mut *tx)
    .await;
    
    match pending_row {
        Ok(row) => {
            let pending_count: i64 = row.get(0);
            if pending_count > 0 {
                tx.rollback().await.ok();
                bot.send_message(
                    msg.chat.id,
                    format!("❌ User {}-ը արդեն ունի pending withdraw հայտ։", target_user_id)
                )
                .await?;
                return Ok(());
            }
        }
        Err(e) => {
            tx.rollback().await.ok();
            bot.send_message(msg.chat.id, format!("❌ Սխալ՝ {}", e))
                .await?;
            return Ok(());
        }
    }
    
    // Get user's wallet address
    let wallet_row = sqlx::query("SELECT wallet_address FROM dom_users WHERE user_id=$1")
        .bind(target_user_id)
        .fetch_optional(&mut *tx)
        .await
        .unwrap_or(None);
    
    let wallet_address: Option<String> = wallet_row
        .and_then(|r| r.get::<Option<String>, _>(0))
        .filter(|s| !s.is_empty());
    
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    
    // Create withdraw (skip validation)
    let insert_result = sqlx::query(
        "INSERT INTO dom_withdrawals (user_id, amount_usd, status, created_at, wallet_address)
        VALUES ($1, $2, 'pending', $3, $4)"
    )
    .bind(target_user_id)
    .bind(amount)
    .bind(now)
    .bind(wallet_address)
    .execute(&mut *tx)
    .await;
    
    if insert_result.is_err() {
        tx.rollback().await.ok();
        bot.send_message(msg.chat.id, "❌ Սխալ withdraw-ի ստեղծման ժամանակ")
            .await?;
        return Ok(());
    }
    
    // Update user balance
    let update_result = sqlx::query(
        "UPDATE dom_users
           SET balance_usd = balance_usd - $1,
               total_withdraw_usd = COALESCE(total_withdraw_usd,0) + $1
         WHERE user_id=$2"
    )
    .bind(amount)
    .bind(target_user_id)
    .execute(&mut *tx)
    .await;
    
    if update_result.is_err() {
        tx.rollback().await.ok();
        bot.send_message(msg.chat.id, "❌ Սխալ balance-ի թարմացման ժամանակ")
            .await?;
        return Ok(());
    }
    
    // Commit transaction
    if tx.commit().await.is_err() {
        bot.send_message(msg.chat.id, "❌ Սխալ commit-ի ժամանակ")
            .await?;
        return Ok(());
    }
    
    bot.send_message(
        msg.chat.id,
        format!(
            "✅ TEST withdraw ստեղծվեց։\n\
            👤 User: {}\n\
            💰 Գումար: {:.2} DOMIT\n\n\
            Օգտագործիր /admin_withdrawals տեսնելու համար",
            target_user_id, amount
        )
    )
    .await?;
    
    Ok(())
}

use teloxide::prelude::*;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

// Global bot ready flag
static BOT_READY: AtomicBool = AtomicBool::new(false);

async fn start_bot_webhook(pool: sqlx::PgPool) -> Result<(), Box<dyn std::error::Error>> {
    // Կարգավորում ենք Telegram–ը Webhook mode-ում,
    // նույն լոգիկան, ինչ VORN բոտում։
    
    println!("🤖 Initializing Domino Telegram bot (Webhook Mode)...");

    let bot_token = std::env::var("BOT_TOKEN")
        .expect("BOT_TOKEN must be set");
    let base_url = std::env::var("BASE_URL")
        .expect("BASE_URL must be set");
    
    let bot = Bot::new(bot_token);
    
    // Delete existing webhook and set new one
    let webhook_url = format!("{}/webhook", base_url);
    bot.delete_webhook()
        .drop_pending_updates(true)
        .await?;
    
    bot.set_webhook(&webhook_url).await?;
    
    println!("✅ Webhook set to {}", webhook_url);
    
    // Set bot ready flag
    BOT_READY.store(true, Ordering::SeqCst);
    println!("🟢 BOT_READY = True");
    
    // Create dispatcher with all handlers
    let handler = dptree::entry()
        .branch(
            Update::filter_message()
                .branch(
                    dptree::entry()
                        .filter_command::<Command>()
                        .endpoint(command_handler)
                )
                .branch(
                    Message::filter_text()
                        .endpoint(block_text)
                )
        )
        .branch(
            Update::filter_callback_query()
                .endpoint(btn_handler)
        );

    let pool_arc = Arc::new(pool);
    
    Dispatcher::builder(bot, handler)
        .dependencies(dptree::deps![pool_arc])
        .enable_ctrlc_handler()
        .build()
        .dispatch()
        .await;
    
    Ok(())
}

#[derive(BotCommands, Clone)]
#[command(rename_rule = "lowercase", description = "Domino Bot Commands")]
enum Command {
    #[command(description = "Start the bot")]
    Start,
    #[command(description = "View your stats")]
    Stats,
    #[command(description = "Add balance (admin)")]
    AdminAdd,
    #[command(description = "View withdrawals (admin)")]
    AdminWithdrawals,
    #[command(description = "Approve withdrawal (admin)")]
    AdminApprove,
    #[command(description = "Reject withdrawal (admin)")]
    AdminReject,
    #[command(description = "Test withdraw (admin)")]
    AdminTestWithdraw,
    #[command(description = "Add video task (admin)")]
    TaskAddVideo,
    #[command(description = "Add follow task (admin)")]
    TaskAddFollow,
    #[command(description = "Add invite task (admin)")]
    TaskAddInvite,
    #[command(description = "Add game task (admin)")]
    TaskAddGame,
    #[command(description = "Add special task (admin)")]
    TaskAddSpecial,
    #[command(description = "List tasks (admin)")]
    TaskList,
    #[command(description = "Delete task (admin)")]
    TaskDelete,
    #[command(description = "Toggle task (admin)")]
    TaskToggle,
    #[command(description = "Burn stats (admin)")]
    BurnStats,
    #[command(description = "Burn reward (admin)")]
    BurnReward,
    #[command(description = "Migrate posts (admin)")]
    MigratePosts,
    #[command(description = "Init DOMIT data (admin)")]
    InitDomitData,
    #[command(description = "Set DOMIT range (admin)")]
    SetDomitRange,
}

async fn command_handler(
    bot: Bot,
    msg: Message,
    cmd: Command,
    pool: Arc<sqlx::PgPool>,
) -> ResponseResult<()> {
    let args: Vec<String> = msg.text()
        .and_then(|text| {
            let parts: Vec<&str> = text.split_whitespace().collect();
            if parts.len() > 1 {
                Some(parts[1..].iter().map(|s| s.to_string()).collect())
            } else {
                None
            }
        })
        .unwrap_or_default();

    match cmd {
        Command::Start => start_cmd(bot, msg, pool.as_ref().clone()).await,
        Command::Stats => stats_cmd(bot, msg, pool.as_ref().clone()).await,
        Command::AdminAdd => admin_add(bot, msg, pool.as_ref().clone(), args).await,
        Command::AdminWithdrawals => admin_withdrawals(bot, msg, pool.as_ref().clone()).await,
        Command::AdminApprove => admin_approve(bot, msg, pool.as_ref().clone(), args).await,
        Command::AdminReject => admin_reject(bot, msg, pool.as_ref().clone(), args).await,
        Command::AdminTestWithdraw => admin_test_withdraw(bot, msg, pool.as_ref().clone(), args).await,
        Command::BurnStats => burn_stats(bot, msg, pool.as_ref().clone()).await,
        Command::BurnReward => burn_reward(bot, msg, pool.as_ref().clone(), args).await,
        Command::InitDomitData => init_domit_data(bot, msg, pool.as_ref().clone()).await,
        Command::SetDomitRange => set_domit_range(bot, msg, pool.as_ref().clone(), args).await,
        // Task commands - to be implemented
        _ => {
            bot.send_message(msg.chat.id, "⚠️ Այս հրամանը դեռ իմպլեմենտացված չէ։")
                .await?;
            Ok(())
        }
    }
}

async fn migrate_posts_cmd(bot: Bot, msg: Message, pool: sqlx::PgPool) -> ResponseResult<()> {
    // Admin command to migrate posts media
    let user_id = msg.from().map(|u| u.id.0 as i64).unwrap_or(0);
    
    if !ADMIN_IDS.contains(&user_id) {
        bot.send_message(msg.chat.id, "❌ Միայն ադմինի համար").await?;
        return Ok(());
    }
    
    bot.send_message(msg.chat.id, "🔄 Սկսում եմ migration...").await?;
    
    match migrate_posts_to_files(&pool).await {
        Ok(_) => {
            bot.send_message(msg.chat.id, "✅ Migration ավարտված!").await?;
        }
        Err(e) => {
            eprintln!("Migration error: {}", e);
            bot.send_message(msg.chat.id, format!("❌ Սխալ: {}", e)).await?;
        }
    }
    
    Ok(())
}

async fn migrate_posts_to_files(pool: &sqlx::PgPool) -> Result<(), Box<dyn std::error::Error>> {
    // Implementation of migrate_posts_to_files logic
    // This would contain the actual migration logic from your Python version
    // For now, returning Ok as placeholder
    
    // Example structure:
    // 1. Fetch all posts with media URLs
    // 2. Download media files
    // 3. Save to local file system
    // 4. Update database with new file paths
    
    println!("Starting posts migration...");
    
    // Add your migration logic here
    
    println!("Posts migration completed!");
    Ok(())
}

async fn task_add_video(bot: Bot, msg: Message, pool: sqlx::PgPool, args: Vec<String>) -> ResponseResult<()> {
    add_task_with_category(bot, msg, pool, args, "video").await
}

async fn task_add_follow(bot: Bot, msg: Message, pool: sqlx::PgPool, args: Vec<String>) -> ResponseResult<()> {
    add_task_with_category(bot, msg, pool, args, "follow").await
}

async fn task_add_invite(bot: Bot, msg: Message, pool: sqlx::PgPool, args: Vec<String>) -> ResponseResult<()> {
    add_task_with_category(bot, msg, pool, args, "invite").await
}

async fn task_add_game(bot: Bot, msg: Message, pool: sqlx::PgPool, args: Vec<String>) -> ResponseResult<()> {
    add_task_with_category(bot, msg, pool, args, "game").await
}

async fn task_add_special(bot: Bot, msg: Message, pool: sqlx::PgPool, args: Vec<String>) -> ResponseResult<()> {
    add_task_with_category(bot, msg, pool, args, "special").await
}

async fn task_list(bot: Bot, msg: Message, pool: sqlx::PgPool) -> ResponseResult<()> {
    let user_id = msg.from().map(|u| u.id.0 as i64).unwrap_or(0);
    
    if !ADMIN_IDS.contains(&user_id) {
        bot.send_message(msg.chat.id, "❌ Դու admin չես։").await?;
        return Ok(());
    }

    let rows = sqlx::query(
        "SELECT id, title, category, reward, is_active FROM dom_tasks ORDER BY id DESC"
    )
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    if rows.is_empty() {
        bot.send_message(msg.chat.id, "📭 Տասկեր չկան։").await?;
        return Ok(());
    }

    let mut message = "📋 **Տասկեր**\n\n".to_string();
    
    for row in rows {
        let id: i32 = row.get(0);
        let title: String = row.get(1);
        let category: String = row.get(2);
        let reward: rust_decimal::Decimal = row.get(3);
        let is_active: bool = row.get(4);
        
        let reward_f64 = reward.to_string().parse::<f64>().unwrap_or(0.0);
        let status = if is_active { "🟢 ON" } else { "🔴 OFF" };
        
        message.push_str(&format!(
            "ID: {} | {} | {} | 💰 {}$ | {}\n",
            id, title, category, reward_f64, status
        ));
    }

    bot.send_message(msg.chat.id, message)
        .parse_mode(teloxide::types::ParseMode::Markdown)
        .await?;
    
    Ok(())
}

async fn add_task_with_category(
    bot: Bot,
    msg: Message,
    pool: sqlx::PgPool,
    args: Vec<String>,
    category: &str,
) -> ResponseResult<()> {
    let user_id = msg.from().map(|u| u.id.0 as i64).unwrap_or(0);
    
    if !ADMIN_IDS.contains(&user_id) {
        bot.send_message(msg.chat.id, "❌ Դու admin չես։").await?;
        return Ok(());
    }

    if args.len() < 3 {
        bot.send_message(
            msg.chat.id,
            format!("Օգտագործում՝ /task_add_{} <title> <reward> <url>", category)
        )
        .await?;
        return Ok(());
    }

    let title = &args[0];
    let reward = match args[1].parse::<f64>() {
        Ok(r) => r,
        Err(_) => {
            bot.send_message(msg.chat.id, "❌ Սխալ reward ֆորմատ")
                .await?;
            return Ok(());
        }
    };
    let url = &args[2];

    let result = sqlx::query(
        "INSERT INTO dom_tasks (title, category, reward, url, is_active)
        VALUES ($1, $2, $3, $4, true)"
    )
    .bind(title)
    .bind(category)
    .bind(reward)
    .bind(url)
    .execute(&pool)
    .await;

    match result {
        Ok(_) => {
            bot.send_message(
                msg.chat.id,
                format!("✅ {} տասկը ավելացվեց՝ {} ({}$)", category, title, reward)
            )
            .await?;
        }
        Err(e) => {
            eprintln!("Error adding task: {}", e);
            bot.send_message(msg.chat.id, format!("❌ Սխալ՝ {}", e))
                .await?;
        }
    }

    Ok(())
}

async fn task_delete(
    bot: Bot,
    msg: Message,
    pool: sqlx::PgPool,
    args: Vec<String>,
) -> ResponseResult<()> {
    let user_id = msg.from().map(|u| u.id.0 as i64).unwrap_or(0);
    
    if !ADMIN_IDS.contains(&user_id) {
        bot.send_message(msg.chat.id, "❌ Դու admin չես։").await?;
        return Ok(());
    }

    if args.len() != 1 {
        bot.send_message(msg.chat.id, "Օգտագործում՝ /task_delete ID")
            .await?;
        return Ok(());
    }

    let task_id = match args[0].parse::<i32>() {
        Ok(id) => id,
        Err(_) => {
            bot.send_message(msg.chat.id, "❌ Սխալ ID ֆորմատ")
                .await?;
            return Ok(());
        }
    };

    sqlx::query("DELETE FROM dom_tasks WHERE id=$1")
        .bind(task_id)
        .execute(&pool)
        .await
        .ok();

    bot.send_message(msg.chat.id, format!("🗑 Տասկը ջնջված է (ID={})", task_id))
        .await?;

    Ok(())
}

async fn task_toggle(
    bot: Bot,
    msg: Message,
    pool: sqlx::PgPool,
    args: Vec<String>,
) -> ResponseResult<()> {
    let user_id = msg.from().map(|u| u.id.0 as i64).unwrap_or(0);
    
    if !ADMIN_IDS.contains(&user_id) {
        bot.send_message(msg.chat.id, "❌ admin չես").await?;
        return Ok(());
    }

    if args.len() != 1 {
        bot.send_message(msg.chat.id, "Օգտագործում՝ /task_toggle ID")
            .await?;
        return Ok(());
    }

    let task_id = match args[0].parse::<i32>() {
        Ok(id) => id,
        Err(_) => {
            bot.send_message(msg.chat.id, "❌ Սխալ ID ֆորմատ")
                .await?;
            return Ok(());
        }
    };

    let result = sqlx::query(
        "UPDATE dom_tasks SET is_active = NOT is_active WHERE id=$1 RETURNING is_active"
    )
    .bind(task_id)
    .fetch_optional(&pool)
    .await;

    match result {
        Ok(Some(row)) => {
            let is_active: bool = row.get(0);
            let state = if is_active { "🟢 Միացված" } else { "🔴 Անջատված" };
            
            bot.send_message(msg.chat.id, format!("ID {} → {}", task_id, state))
                .await?;
        }
        Ok(None) => {
            bot.send_message(msg.chat.id, "❌ Տասկը չկա").await?;
        }
        Err(e) => {
            eprintln!("Error toggling task: {}", e);
            bot.send_message(msg.chat.id, format!("❌ Սխալ՝ {}", e))
                .await?;
        }
    }

    Ok(())
}

async fn add_task_with_category(
    bot: Bot,
    msg: Message,
    pool: sqlx::PgPool,
    args: Vec<String>,
    category: &str,
) -> ResponseResult<()> {
    let user_id = msg.from().map(|u| u.id.0 as i64).unwrap_or(0);
    
    if !ADMIN_IDS.contains(&user_id) {
        bot.send_message(msg.chat.id, "❌ Դու admin չես։").await?;
        return Ok(());
    }

    let text = args.join(" ");
    
    if !text.contains('|') {
        bot.send_message(
            msg.chat.id,
            format!(
                "Օգտագործում՝\n/task_add_{} Title | Description | URL | Reward",
                category
            )
        )
        .await?;
        return Ok(());
    }

    let parts: Vec<&str> = text.split('|').map(|s| s.trim()).collect();
    
    if parts.len() != 4 {
        bot.send_message(msg.chat.id, "❌ Սխալ ձևաչափ։").await?;
        return Ok(());
    }

    let title = parts[0];
    let desc = parts[1];
    let url = parts[2];
    let reward = match parts[3].parse::<f64>() {
        Ok(r) => r,
        Err(_) => {
            bot.send_message(msg.chat.id, "❌ Սխալ ձևաչափ։").await?;
            return Ok(());
        }
    };

    // Parse URL and add tracking parameters
    use url::Url;
    
    let final_url = match Url::parse(url) {
        Ok(mut parsed_url) => {
            let params = "s1={user_id}&s2={task_id}&subid1={user_id}&subid2={task_id}";
            
            if parsed_url.query().is_some() {
                parsed_url.set_query(Some(&format!("{}&{}", parsed_url.query().unwrap(), params)));
            } else {
                parsed_url.set_query(Some(params));
            }
            
            parsed_url.to_string()
        }
        Err(_) => {
            // If URL parsing fails, just append params
            let params = "s1={user_id}&s2={task_id}&subid1={user_id}&subid2={task_id}";
            if url.contains('?') {
                format!("{}&{}", url, params)
            } else {
                format!("{}?{}", url, params)
            }
        }
    };

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let result = sqlx::query(
        "INSERT INTO dom_tasks (title, description, url, reward, category, is_active, created_at)
        VALUES ($1, $2, $3, $4, $5, TRUE, $6)"
    )
    .bind(title)
    .bind(desc)
    .bind(final_url)
    .bind(reward)
    .bind(category)
    .bind(now)
    .execute(&pool)
    .await;

    match result {
        Ok(_) => {
            bot.send_message(
                msg.chat.id,
                format!("✔ Տասկը ավելացվեց `{}` բաժնում։", category)
            )
            .await?;
        }
        Err(e) => {
            eprintln!("Error adding task: {}", e);
            bot.send_message(msg.chat.id, format!("❌ Սխալ՝ {}", e))
                .await?;
        }
    }

    Ok(())
}

use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    Json,
    routing::post,
    Router,
};
use serde_json::json;
use teloxide::types::Update;

// Webhook handler route
async fn telegram_webhook(
    State(bot): State<Bot>,
    Json(update): Json<serde_json::Value>,
) -> impl IntoResponse {
    // Flask route, որը ստանում է Telegram–ի update-ները
    // և փոխանցում է PTB application-ին։
    
    if update.is_null() || !update.is_object() {
        eprintln!("⚠️ Empty update");
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"ok": false, "error": "empty_update"}))
        );
    }

    match serde_json::from_value::<Update>(update.clone()) {
        Ok(parsed_update) => {
            // Process the update
            // Note: In Rust with teloxide, the dispatcher handles updates automatically
            // This is just for webhook reception
            println!("✅ Received update: {:?}", parsed_update.id);
            
            (
                StatusCode::OK,
                Json(json!({"ok": true}))
            )
        }
        Err(e) => {
            eprintln!("❌ Webhook error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"ok": false, "error": e.to_string()}))
            )
        }
    }
}

// Create webhook router
pub fn create_webhook_router(bot: Bot) -> Router {
    Router::new()
        .route("/webhook", post(telegram_webhook))
        .with_state(bot)
}

// Alternative: Integrated webhook setup with teloxide
use teloxide::update_listeners::webhooks;

async fn setup_telegram_webhook(bot: Bot, pool: sqlx::PgPool) -> Result<(), Box<dyn std::error::Error>> {
    let webhook_url = std::env::var("BASE_URL")
        .expect("BASE_URL must be set");
    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "10000".to_string())
        .parse()
        .unwrap_or(10000);
    
    let addr = ([0, 0, 0, 0], port).into();
    
    let listener = webhooks::axum(
        bot.clone(),
        webhooks::Options::new(addr, url::Url::parse(&format!("{}/webhook", webhook_url))?)
    )
    .await?;
    
    println!("✅ Webhook set to {}/webhook", webhook_url);
    
    // Create dispatcher
    let handler = dptree::entry()
        .branch(
            Update::filter_message()
                .branch(
                    dptree::entry()
                        .filter_command::<Command>()
                        .endpoint(command_handler)
                )
                .branch(
                    Message::filter_text()
                        .endpoint(block_text)
                )
        )
        .branch(
            Update::filter_callback_query()
                .endpoint(btn_handler)
        );

    let pool_arc = Arc::new(pool);
    
    Dispatcher::builder(bot, handler)
        .dependencies(dptree::deps![pool_arc])
        .enable_ctrlc_handler()
        .build()
        .dispatch_with_listener(
            listener,
            LoggingErrorHandler::with_custom_text("An error from the update listener"),
        )
        .await;
    
    Ok(())
}

use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    Json,
    routing::post,
};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct GetUserDataRequest {
    telegram_id: i64,
}

#[derive(Serialize)]
struct GetUserDataResponse {
    telegram_id: i64,
    username: Option<String>,
    status_level: i32,
    ton_balance: f64,
    usd_balance: f64,
    avatar_data: Option<String>,
    fires_received: i32,
    fires_given: i32,
    total_games: i32,
    total_wins: i32,
    intellect_score: f64,
    intellect_bar: String,
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

async fn api_get_user_data(
    State(pool): State<sqlx::PgPool>,
    Json(payload): Json<GetUserDataRequest>,
) -> impl IntoResponse {
    let telegram_id = payload.telegram_id;

    let row = sqlx::query(
        "SELECT telegram_id, username, status_level, ton_balance, usd_balance, 
               avatar_data, fires_received, fires_given, total_games, total_wins
        FROM dom_users
        WHERE telegram_id = $1"
    )
    .bind(telegram_id)
    .fetch_optional(&pool)
    .await;

    match row {
        Ok(Some(r)) => {
            let telegram_id: i64 = r.get(0);
            let username: Option<String> = r.get(1);
            let status_level: i32 = r.get(2);
            let ton_balance: rust_decimal::Decimal = r.get(3);
            let usd_balance: rust_decimal::Decimal = r.get(4);
            let avatar_data: Option<String> = r.get(5);
            let fires_received: Option<i32> = r.get(6);
            let fires_given: Option<i32> = r.get(7);
            let total_games: Option<i32> = r.get(8);
            let total_wins: Option<i32> = r.get(9);

            let total_games = total_games.unwrap_or(0);
            let total_wins = total_wins.unwrap_or(0);

            // 🧠 Intellect Score հաշվարկ
            let intellect_score = if total_games > 0 {
                ((total_wins as f64 / total_games as f64) * 10.0 * 10.0).round() / 10.0
            } else {
                0.0
            };

            // Progress bar (10 սիմվոլ)
            let filled = intellect_score.floor() as usize;
            let filled = filled.min(10); // Cap at 10
            let progress_bar = "━".repeat(filled) + &"░".repeat(10 - filled);

            let response = GetUserDataResponse {
                telegram_id,
                username,
                status_level,
                ton_balance: ton_balance.to_string().parse().unwrap_or(0.0),
                usd_balance: usd_balance.to_string().parse().unwrap_or(0.0),
                avatar_data,
                fires_received: fires_received.unwrap_or(0),
                fires_given: fires_given.unwrap_or(0),
                total_games,
                total_wins,
                intellect_score,
                intellect_bar: progress_bar,
            };

            (StatusCode::OK, Json(response)).into_response()
        }
        Ok(None) => {
            (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: "User not found".to_string(),
                })
            ).into_response()
        }
        Err(e) => {
            eprintln!("Database error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Database error".to_string(),
                })
            ).into_response()
        }
    }
}

// Add to router
pub fn create_api_router(pool: sqlx::PgPool) -> Router {
    Router::new()
        .route("/api/get_user_data", post(api_get_user_data))
        .with_state(pool)
}

use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use rand::Rng;

#[derive(Deserialize)]
struct GameBetRequest {
    user_id: i64,
    amount: f64,
    game: String,
    choice: Option<serde_json::Value>,
}

#[derive(Serialize)]
struct GameBetResponse {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    win: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    payout: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    new_balance: Option<f64>,
}

async fn api_game_bet(
    State(pool): State<sqlx::PgPool>,
    Json(payload): Json<GameBetRequest>,
) -> impl IntoResponse {
    let user_id = payload.user_id;
    let amount = payload.amount;
    let game = payload.game;
    let choice = payload.choice;

    if user_id == 0 || amount <= 0.0 || game.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(GameBetResponse {
                ok: false,
                error: Some("bad_params".to_string()),
                win: None,
                payout: None,
                new_balance: None,
            })
        );
    }

    // Get user stats
    let user_row = sqlx::query("SELECT balance_usd FROM dom_users WHERE user_id = $1")
        .bind(user_id)
        .fetch_optional(&pool)
        .await;

    let balance_usd = match user_row {
        Ok(Some(row)) => {
            let bal: rust_decimal::Decimal = row.get(0);
            bal.to_string().parse::<f64>().unwrap_or(0.0)
        }
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(GameBetResponse {
                    ok: false,
                    error: Some("not_found".to_string()),
                    win: None,
                    payout: None,
                    new_balance: None,
                })
            );
        }
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(GameBetResponse {
                    ok: false,
                    error: Some("database_error".to_string()),
                    win: None,
                    payout: None,
                    new_balance: None,
                })
            );
        }
    };

    if amount > balance_usd {
        return (
            StatusCode::OK,
            Json(GameBetResponse {
                ok: false,
                error: Some("low_balance".to_string()),
                win: None,
                payout: None,
                new_balance: None,
            })
        );
    }

    let mut rng = rand::thread_rng();
    let (win, payout) = match game.as_str() {
        "crash" => {
            let result_multiplier = choice
                .and_then(|c| c.as_f64())
                .unwrap_or(1.0);
            let win = true;
            let payout = amount * result_multiplier;
            (win, payout)
        }
        "dice" => {
            let result = rng.gen_range(1..=6);
            let chosen = choice
                .and_then(|c| c.as_i64())
                .unwrap_or(0) as i32;
            let win = result == chosen;
            let payout = if win { amount * 6.0 } else { 0.0 };
            (win, payout)
        }
        "coinflip" => {
            let result = if rng.gen_bool(0.5) { "heads" } else { "tails" };
            let chosen = choice
                .and_then(|c| c.as_str())
                .unwrap_or("");
            let win = result == chosen;
            let payout = if win { amount * 2.0 } else { 0.0 };
            (win, payout)
        }
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(GameBetResponse {
                    ok: false,
                    error: Some("unknown_game".to_string()),
                    win: None,
                    payout: None,
                    new_balance: None,
                })
            );
        }
    };

    let new_balance = balance_usd - amount + payout;

    let update_result = sqlx::query(
        "UPDATE dom_users
        SET balance_usd=$1
        WHERE user_id=$2"
    )
    .bind(new_balance)
    .bind(user_id)
    .execute(&pool)
    .await;

    if update_result.is_err() {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(GameBetResponse {
                ok: false,
                error: Some("update_failed".to_string()),
                win: None,
                payout: None,
                new_balance: None,
            })
        );
    }

    (
        StatusCode::OK,
        Json(GameBetResponse {
            ok: true,
            error: None,
            win: Some(win),
            payout: Some(payout),
            new_balance: Some(new_balance),
        })
    )
}

// Add to router
pub fn add_game_routes(router: Router<sqlx::PgPool>) -> Router<sqlx::PgPool> {
    router.route("/api/game/bet", post(api_game_bet))
}

use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    Json,
    routing::get,
};
use serde::Serialize;

#[derive(Serialize)]
struct TonRateResponse {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    ton_usd: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

async fn api_ton_rate() -> impl IntoResponse {
    // Returns REAL-TIME TON→USD price directly from tonapi.io
    // (ignores DB, always fresh)
    
    match fetch_ton_rate().await {
        Ok(Some(rate)) => {
            (
                StatusCode::OK,
                Json(TonRateResponse {
                    ok: true,
                    ton_usd: Some(rate),
                    error: None,
                })
            )
        }
        Ok(None) => {
            (
                StatusCode::OK,
                Json(TonRateResponse {
                    ok: false,
                    ton_usd: Some(0.0),
                    error: None,
                })
            )
        }
        Err(e) => {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(TonRateResponse {
                    ok: false,
                    ton_usd: None,
                    error: Some(e.to_string()),
                })
            )
        }
    }
}

async fn fetch_ton_rate() -> Result<Option<f64>, Box<dyn std::error::Error>> {
    use reqwest;
    use serde::Deserialize;
    
    #[derive(Deserialize)]
    struct TonApiResponse {
        rates: std::collections::HashMap<String, TonApiRate>,
    }
    
    #[derive(Deserialize)]
    struct TonApiRate {
        prices: Option<f64>,
    }
    
    let client = reqwest::Client::new();
    let response = client
        .get("https://tonapi.io/v2/rates?tokens=ton&currencies=usd")
        .header("accept", "application/json")
        .send()
        .await?;
    
    if !response.status().is_success() {
        eprintln!("❌ TON rate fetch failed: {}", response.status());
        return Ok(None);
    }
    
    let data: TonApiResponse = response.json().await?;
    
    if let Some(ton_data) = data.rates.get("TON") {
        if let Some(price) = ton_data.prices {
            return Ok(Some(price));
        }
    }
    
    Ok(None)
}

// Add to router
pub fn add_ton_rate_route(router: Router) -> Router {
    router.route("/api/ton_rate", get(api_ton_rate))
}

use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    Json,
    routing::post,
};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct TaskAttemptCreateRequest {
    user_id: i64,
    task_id: i64,
}

#[derive(Serialize)]
struct TaskAttemptCreateResponse {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

async fn api_task_attempt_create(
    State(pool): State<sqlx::PgPool>,
    Json(payload): Json<TaskAttemptCreateRequest>,
) -> impl IntoResponse {
    // When user clicks 'Perform' → we register attempt.
    // MyLead will later confirm via postback.
    
    let user_id = payload.user_id;
    let task_id = payload.task_id;

    if user_id == 0 || task_id == 0 {
        return (
            StatusCode::BAD_REQUEST,
            Json(TaskAttemptCreateResponse {
                ok: false,
                error: Some("missing_params".to_string()),
            })
        );
    }

    // Check if task exists
    let task_check = sqlx::query("SELECT id FROM dom_tasks WHERE id=$1")
        .bind(task_id)
        .fetch_optional(&pool)
        .await;

    match task_check {
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(TaskAttemptCreateResponse {
                    ok: false,
                    error: Some("task_not_found".to_string()),
                })
            );
        }
        Err(e) => {
            eprintln!("Database error checking task: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(TaskAttemptCreateResponse {
                    ok: false,
                    error: Some("database_error".to_string()),
                })
            );
        }
        Ok(Some(_)) => {}
    }

    // Create table if not exists (should be done in migrations, but keeping for compatibility)
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS dom_task_attempts (
            id SERIAL PRIMARY KEY,
            user_id BIGINT,
            task_id BIGINT,
            created_at BIGINT
        )"
    )
    .execute(&pool)
    .await
    .ok();

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    // Insert attempt
    let insert_result = sqlx::query(
        "INSERT INTO dom_task_attempts (user_id, task_id, created_at)
        VALUES ($1, $2, $3)"
    )
    .bind(user_id)
    .bind(task_id)
    .bind(now)
    .execute(&pool)
    .await;

    match insert_result {
        Ok(_) => {
            (
                StatusCode::OK,
                Json(TaskAttemptCreateResponse {
                    ok: true,
                    error: None,
                })
            )
        }
        Err(e) => {
            eprintln!("Database error inserting attempt: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(TaskAttemptCreateResponse {
                    ok: false,
                    error: Some("insert_failed".to_string()),
                })
            )
        }
    }
}

// Add to router
pub fn add_task_attempt_route(router: Router<sqlx::PgPool>) -> Router<sqlx::PgPool> {
    router.route("/api/task_attempt_create", post(api_task_attempt_create))
}

use std::path::Path;
use std::fs;
use base64::{Engine as _, engine::general_purpose};
use image::ImageFormat;

async fn migrate_posts_to_files(pool: &sqlx::PgPool) -> Result<(), Box<dyn std::error::Error>> {
    // Migrate posts media from base64 to file system
    println!("🔍 Starting posts media migration...");
    
    let media_dir = "webapp/static/media/posts";
    fs::create_dir_all(media_dir)?;
    
    // Get posts with base64 media
    let posts = sqlx::query(
        "SELECT id, user_id, media_url
        FROM dom_posts
        WHERE media_url LIKE 'data:%'
        ORDER BY id"
    )
    .fetch_all(pool)
    .await?;
    
    println!("✅ Found {} posts with base64 media\n", posts.len());
    
    for post in posts {
        let post_id: i32 = post.get(0);
        let user_id: i64 = post.get(1);
        let media_url: String = post.get(2);
        
        println!("📦 Processing post {}...", post_id);
        
        if !media_url.contains(";base64,") {
            println!("⚠️  Skipping: invalid format");
            continue;
        }
        
        let parts: Vec<&str> = media_url.split(";base64,").collect();
        if parts.len() != 2 {
            println!("⚠️  Skipping: invalid base64 format");
            continue;
        }
        
        let header = parts[0];
        let b64_data = parts[1];
        let content_type = header.replace("data:", "");
        
        let file_bytes = match general_purpose::STANDARD.decode(b64_data) {
            Ok(bytes) => bytes,
            Err(e) => {
                println!("❌ Decode error: {}", e);
                continue;
            }
        };
        
        let file_url = if content_type.contains("image") {
            // Process image
            match process_image_migration(post_id, &file_bytes, media_dir) {
                Ok(url) => {
                    let old_size = file_bytes.len();
                    let new_size = fs::metadata(Path::new(media_dir).join(format!("post_{}.webp", post_id)))
                        .map(|m| m.len())
                        .unwrap_or(0);
                    println!("   ✅ Image: {} → {} bytes", old_size, new_size);
                    url
                }
                Err(e) => {
                    println!("   ❌ Image error: {}", e);
                    continue;
                }
            }
        } else if content_type.contains("video") {
            // Process video
            match process_video_migration(post_id, &file_bytes, &content_type, media_dir) {
                Ok(url) => {
                    println!("   ✅ Video: {} bytes", file_bytes.len());
                    url
                }
                Err(e) => {
                    println!("   ❌ Video error: {}", e);
                    continue;
                }
            }
        } else {
            println!("   ⚠️  Unknown type: {}", content_type);
            continue;
        };
        
        // Update database
        sqlx::query(
            "UPDATE dom_posts
            SET media_url = $1
            WHERE id = $2"
        )
        .bind(&file_url)
        .bind(post_id)
        .execute(pool)
        .await?;
        
        println!("   ✅ Updated DB: {}\n", file_url);
    }
    
    println!("🎉 Migration complete!");
    Ok(())
}

fn process_image_migration(
    post_id: i32,
    file_bytes: &[u8],
    media_dir: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    use image::io::Reader as ImageReader;
    use std::io::Cursor;
    
    let img = ImageReader::new(Cursor::new(file_bytes))
        .with_guessed_format()?
        .decode()?;
    
    // Thumbnail to 800x800
    let thumbnail = img.thumbnail(800, 800);
    
    let filename = format!("post_{}.webp", post_id);
    let filepath = Path::new(media_dir).join(&filename);
    
    thumbnail.save_with_format(&filepath, ImageFormat::WebP)?;
    
    let file_url = format!("/static/media/posts/{}", filename);
    Ok(file_url)
}

fn process_video_migration(
    post_id: i32,
    file_bytes: &[u8],
    content_type: &str,
    media_dir: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    let ext = content_type
        .split('/')
        .nth(1)
        .and_then(|s| s.split(';').next())
        .unwrap_or("mp4");
    
    let filename = format!("post_{}.{}", post_id, ext);
    let filepath = Path::new(media_dir).join(&filename);
    
    fs::write(&filepath, file_bytes)?;
    
    let file_url = format!("/static/media/posts/{}", filename);
    Ok(file_url)
}

use tokio;
use std::sync::Arc;
use axum::{Router, Server};
use socketio_server::SocketIo;
use tokio_cron_scheduler::{JobScheduler, Job};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("✅ Domino bot script loaded.");
    
    // Load environment variables
    dotenv::dotenv().ok();
    
    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set");
    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "10000".to_string())
        .parse()
        .unwrap_or(10000);
    
    // Initialize database connection pool
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(20)
        .connect(&database_url)
        .await?;
    
    println!("✅ Database connection pool created");
    
    // Initialize database schema (equivalent to init_db)
    match init_db(&pool).await {
        Ok(_) => println!("✅ Database initialized"),
        Err(e) => println!("⚠️ init_db failed: {}", e),
    }
    
    // Start DOMIT price scheduler
    let scheduler = JobScheduler::new().await?;
    
    // 1-minute candle creation job
    let pool_clone = pool.clone();
    let candle_job = Job::new_async("0 * * * * *", move |_uuid, _l| {
        let pool = pool_clone.clone();
        Box::pin(async move {
            if let Err(e) = create_new_candle(&pool).await {
                eprintln!("❌ Error creating candle: {}", e);
            }
        })
    })?;
    scheduler.add(candle_job).await?;
    
    // 5-second price update job
    let pool_clone = pool.clone();
    let update_job = Job::new_async("*/5 * * * * *", move |_uuid, _l| {
        let pool = pool_clone.clone();
        Box::pin(async move {
            if let Err(e) = update_current_candle(&pool).await {
                eprintln!("❌ Error updating candle: {}", e);
            }
        })
    })?;
    scheduler.add(update_job).await?;
    
    scheduler.start().await?;
    println!("✅ DOMIT price scheduler started");
    
    // Setup Socket.IO
    let (socket_layer, io) = SocketIo::new_layer();
    
    // Setup Socket.IO event handlers
    setup_socketio_handlers(io.clone());
    
    // Build Axum application with all routes
    let app = Router::new()
        // Add all API routes
        .merge(create_api_router(pool.clone()))
        .merge(create_webhook_router(pool.clone()))
        // Add Socket.IO layer
        .layer(socket_layer)
        // Add CORS if needed
        .layer(
            tower_http::cors::CorsLayer::new()
                .allow_origin(tower_http::cors::Any)
                .allow_methods(tower_http::cors::Any)
                .allow_headers(tower_http::cors::Any)
        );
    
    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], port));
    
    println!("🌍 Starting server on {}...", addr);
    
    // Start Telegram bot webhook in background
    let bot_pool = pool.clone();
    tokio::spawn(async move {
        if let Err(e) = setup_telegram_webhook(bot_pool).await {
            eprintln!("❌ Telegram webhook error: {}", e);
        }
    });
    
    // Start Axum server
    axum::Server::bind(&addr)
        .serve(app.into_make_service())
        .await?;
    
    Ok(())
}

async fn init_db(pool: &sqlx::PgPool) -> Result<(), sqlx::Error> {
    // Run all necessary CREATE TABLE statements
    // This is equivalent to the Python init_db() function
    
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS dom_users (
            user_id BIGINT PRIMARY KEY,
            username TEXT,
            balance_usd DECIMAL(20,8) DEFAULT 0,
            -- Add all other columns from your schema
        )"
    )
    .execute(pool)
    .await?;
    
    // Add other table creation queries...
    
    Ok(())
}

async fn setup_telegram_webhook(pool: sqlx::PgPool) -> Result<(), Box<dyn std::error::Error>> {
    // Use the start_bot_webhook function we translated earlier
    start_bot_webhook(pool).await
}

fn create_api_router(pool: sqlx::PgPool) -> Router {
    Router::new()
        .route("/api/get_user_data", axum::routing::post(api_get_user_data))
        .route("/api/game/bet", axum::routing::post(api_game_bet))
        .route("/api/ton_rate", axum::routing::get(api_ton_rate))
        .route("/api/task_attempt_create", axum::routing::post(api_task_attempt_create))
        .with_state(pool)
}

fn create_webhook_router(pool: sqlx::PgPool) -> Router {
    Router::new()
        .route("/webhook", axum::routing::post(telegram_webhook))
        .with_state(pool)
}

use tokio;
use std::sync::Arc;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("✅ Domino bot script loaded.");
    
    // Load environment variables
    dotenv::dotenv().ok();
    
    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set");
    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "10000".to_string())
        .parse()
        .unwrap_or(10000);
    
    // Initialize database connection pool
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(20)
        .connect(&database_url)
        .await?;
    
    println!("✅ Database connection pool created");
    
    // Initialize database schema
    match init_db(&pool).await {
        Ok(_) => println!("✅ Database initialized"),
        Err(e) => println!("⚠️ init_db failed: {}", e),
    }
    
    // === START TELEGRAM BOT FIRST ===
    println!("🤖 Starting Domino Telegram bot thread ...");
    
    let bot_pool = pool.clone();
    let bot_handle = tokio::spawn(async move {
        if let Err(e) = run_bot(bot_pool).await {
            eprintln!("🔥 Telegram bot failed: {}", e);
        }
    });
    
    // ⏳ Wait a bit for bot to initialize
    println!("⏳ Waiting for Telegram bot to be ready...");
    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    println!("✅ Telegram bot event loop is ready.");
    
    // ✅ START BACKGROUND TASKS BEFORE FLASK (IMPORTANT!)
    
    // Start TON rate updater background task
    let ton_pool = pool.clone();
    tokio::spawn(async move {
        ton_rate_updater(ton_pool).await;
    });
    
    // Start DOMIT price scheduler
    let scheduler = JobScheduler::new().await?;
    
    // 1-minute candle creation job
    let pool_clone = pool.clone();
    let candle_job = Job::new_async("0 * * * * *", move |_uuid, _l| {
        let pool = pool_clone.clone();
        Box::pin(async move {
            if let Err(e) = create_new_candle(&pool).await {
                eprintln!("❌ Error creating candle: {}", e);
            }
        })
    })?;
    scheduler.add(candle_job).await?;
    
    // 5-second price update job
    let pool_clone = pool.clone();
    let update_job = Job::new_async("*/5 * * * * *", move |_uuid, _l| {
        let pool = pool_clone.clone();
        Box::pin(async move {
            if let Err(e) = update_current_candle(&pool).await {
                eprintln!("❌ Error updating candle: {}", e);
            }
        })
    })?;
    scheduler.add(update_job).await?;
    
    scheduler.start().await?;
    println!("✅ DOMIT price scheduler started");
    
    // Setup Socket.IO
    let (socket_layer, io) = SocketIo::new_layer();
    setup_socketio_handlers(io.clone());
    
    // Build Axum application with all routes
    let app = Router::new()
        .merge(create_api_router(pool.clone()))
        .layer(socket_layer)
        .layer(
            tower_http::cors::CorsLayer::new()
                .allow_origin(tower_http::cors::Any)
                .allow_methods(tower_http::cors::Any)
                .allow_headers(tower_http::cors::Any)
        );
    
    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], port));
    
    println!("🌍 Flask + SocketIO starting on {} ...", addr);
    
    // Start Axum server
    println!("🚀 Domino Flask + Telegram bot started.");
    
    axum::Server::bind(&addr)
        .serve(app.into_make_service())
        .await?;
    
    Ok(())
}

async fn run_bot(pool: sqlx::PgPool) -> Result<(), Box<dyn std::error::Error>> {
    // Telegram bot-ը աշխատում է առանձին thread-ում՝ իր event loop-ով,
    // ճիշտ նույն գաղափարը ինչ՝ VORN–ում։
    
    println!("🤖 Initializing Domino Telegram bot (Webhook Mode)...");
    
    start_bot_webhook(pool).await?;
    
    Ok(())
}

async fn ton_rate_updater(pool: sqlx::PgPool) {
    // Background task to update TON rate periodically
    loop {
        match fetch_ton_rate().await {
            Ok(Some(rate)) => {
                // Optionally store in database or cache
                println!("💱 TON rate updated: ${:.4}", rate);
            }
            Ok(None) => {
                eprintln!("⚠️ Failed to fetch TON rate");
            }
            Err(e) => {
                eprintln!("❌ TON rate error: {}", e);
            }
        }
        
        // Update every 60 seconds
        tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
    }
}