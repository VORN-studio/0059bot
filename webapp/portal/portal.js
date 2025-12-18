const LOG = {
    info: (...a) => console.log("ℹ️ [PORTAL]", ...a),
    warn: (...a) => console.warn("⚠️ [PORTAL]", ...a),
    error: (...a) => console.error("❌ [PORTAL]", ...a),
    socket: (...a) => console.log("🔌 [SOCKET]", ...a),
    event: (...a) => console.log("📨 [EVENT]", ...a),
    ui: (...a) => console.log("🖥️ [UI]", ...a),
};

function getUrlParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
}

const socket = io({
    transports: ["websocket"],
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
});

const TG = window.Telegram?.WebApp;
TG?.ready?.();

const telegramUser = TG?.initDataUnsafe?.user || null;



socket.on("global_new", (msg) => {
    LOG.event("🌍 global_new RAW:", msg);

    const chatPage = document.getElementById("social");
    if (!chatPage || !chatPage.classList.contains("active")) {
        LOG.warn("Global chat not active → skip render");
        return;
    }

    const box = document.getElementById("global-messages");
    if (!box) {
        LOG.error("❌ global-messages element not found");
        return;
    }

    const fixedMsg = {
        sender: msg.user_id ?? msg.sender,
        text: msg.message ?? msg.text,
        username: msg.username || ("User " + (msg.user_id ?? msg.sender)),
        status_level: msg.status_level || 0,
        avatar: msg.avatar || "",
        created_at: msg.time || Date.now() / 1000,
        highlighted: msg.highlighted || false  // ✅ Add highlighted
    };

    LOG.event("✅ normalized global msg:", fixedMsg);

    const isMe = String(fixedMsg.sender) === String(CURRENT_UID);
    const wrapper = document.createElement("div");
    wrapper.innerHTML = renderChatMessage(fixedMsg, isMe, false);

    box.appendChild(wrapper);
    box.scrollTop = box.scrollHeight;

    box.scrollTop = box.scrollHeight;

    LOG.ui("🖥️ Global message rendered");

    // ✅ Update hot user when new high-status user sends message
    if (fixedMsg.status_level >= 6) {
        loadHotUser();
    }

    LOG.ui("🖥️ Global message rendered");
});

socket.on("dm_new", (msg) => {
    if (
        !CURRENT_DM_TARGET ||
        !(
            String(msg.sender) === String(CURRENT_DM_TARGET) ||
            String(msg.receiver) === String(CURRENT_DM_TARGET)
        )
    ) return;

    const box = document.getElementById("dm-messages");
    if (!box) return;

    const isMe = String(msg.sender) === String(CURRENT_UID);
    const wrapper = document.createElement("div");
    wrapper.innerHTML = renderChatMessage(msg, isMe, true);

    box.appendChild(wrapper);
    box.scrollTop = box.scrollHeight;
});


socket.on("fire_update", (data) => {
    LOG.event("🔥 FIRE UPDATE:", data);
    updateFireCounter(data.message_id, data.fire_count);
});

socket.on("dm_notify", (d) => {
    LOG.event("🔔 DM NOTIFY:", d);

    const dotSocial = document.getElementById("notify-social");
    const dotMessages = document.getElementById("notify-messages");

    if (dotSocial) dotSocial.classList.remove("hidden");
    if (dotMessages) dotMessages.classList.remove("hidden");

    loadDMList();
});



socket.on("post_new", () => {
    if (!SINGLE_POST_MODE && CURRENT_TAB === "feed") {
        loadFeed();
    }
});

socket.on("comment_new", (data) => {
    if (CURRENT_COMMENT_POST === data.post_id) {
        openComments(data.post_id);
    }
});

socket.on("post_deleted", (data) => {
  // data = { post_id: 123 }
  removePostFromUI(data.post_id);
});


socket.on("post_like", (data) => {
    const span = document.querySelector(
        `.like-btn[data-id="${data.post_id}"] .like-count`
    );
    if (span) span.innerText = data.likes;
});


const urlParams = new URLSearchParams(window.location.search);
const OPEN_POST_ID = urlParams.get("open_post");
function applySinglePostUI() {
    const title = document.querySelector("#feed h3");
    if (title) title.innerText = "Գրառում";

    const creator = document.getElementById("post-creator");
    if (creator) creator.style.display = "none";

    const sw = document.getElementById("feed-switch");
    if (sw) sw.style.display = "none";

    // disable switch buttons just in case
    document.querySelectorAll(".feed-switch-btn").forEach(b => {
        b.disabled = true;
        b.style.opacity = "0.4";
        b.style.pointerEvents = "none";
    });
}

// 🔒 ՄԻԱՑՆՈՒՄ ԵՆՔ ՄԻԱՆԳԱՄԻՑ
let SINGLE_POST_MODE = !!OPEN_POST_ID;
document.addEventListener("DOMContentLoaded", () => {
    const backBtn = document.getElementById("back-to-feed");

    if (backBtn && SINGLE_POST_MODE) {
        backBtn.style.display = "block";

        backBtn.onclick = () => {
            const uid = viewerId || "";
            window.location.href =
                `/portal/portal.html?uid=${uid}&viewer=${uid}`;
        };
    }
});

const profileId = getUrlParam("uid") || "";
const viewerId =
    (telegramUser && telegramUser.id) ||
    getUrlParam("viewer") ||
    0;

const CURRENT_UID = viewerId;
const isOwner =
    viewerId &&
    profileId &&
    String(viewerId) === String(profileId);

let hotUserInterval = null;
let REPLY_TO = null;
let REPLY_TO_USERNAME = null;
let CURRENT_TAB = "feed";
let CURRENT_DM_TARGET = null;
let CONFIRM_ACTION = null;
let CURRENT_USER_STATUS = 0;
let typingTimeouts = {};
let typingUsers = new Set();
socket.on("global_trim", (data) => {
  const keep = data.keep || 30;

  console.log("🧹 [UI] Trimming global chat to", keep);

  const messages = document.querySelectorAll(".global-message");

  if (messages.length <= keep) return;

  const toRemove = messages.length - keep;

  for (let i = 0; i < toRemove; i++) {
    messages[i].remove();
  }
});


socket.on("connect", () => {
    console.log("🟢 Realtime connected");

    if (viewerId) {
        socket.emit("join_user", { uid: viewerId });
    }

    socket.emit("join_global");
    socket.emit("join_feed");

    if (SINGLE_POST_MODE && OPEN_POST_ID) {
        socket.emit("join_post", { post_id: OPEN_POST_ID });
    }
});

socket.on("disconnect", () => {
    console.log("🔴 Socket disconnected");
    pingOffline();
});
// ✅ Mark offline when user closes/leaves page
window.addEventListener("beforeunload", () => {
    pingOffline();
});

socket.on("user_typing_global", (data) => {
    showTypingIndicator(data.username, "global");
});

socket.on("user_typing_dm", (data) => {
    if (CURRENT_DM_TARGET && String(data.sender) === String(CURRENT_DM_TARGET)) {
        showTypingIndicator(data.username, "dm");
    }
});

socket.on("message_reaction", (data) => {
    updateMessageReactions(data.message_id, data.chat_type, data.reactions, data.fire_count || 0);
});

socket.on("user_online", (data) => {
    console.log("🟢 User online:", data.user_id);
    updateUserOnlineStatus(data.user_id, true);
});

socket.on("user_offline", (data) => {
    console.log("🔴 User offline:", data.user_id);
    updateUserOnlineStatus(data.user_id, false);
});


function openInfo(title, text) {
    const modal = document.getElementById("confirm-modal");
    const titleEl = document.getElementById("confirm-title");
    const textEl = document.getElementById("confirm-text");
    const okBtn = document.getElementById("confirm-ok");
    const cancelBtn = document.getElementById("confirm-cancel");

    if (!modal) return;

    titleEl.innerText = title;
    textEl.innerText = text;

    // INFO ռեժիմ → Cancel-ը թաքցնում ենք
    if (cancelBtn) cancelBtn.style.display = "none";

    if (okBtn) {
        okBtn.innerText = "OK";
        okBtn.style.background = "#3a8bff";
        okBtn.onclick = closeConfirm;
    }

    CONFIRM_ACTION = null;
    modal.classList.remove("hidden");
}


function openConfirm(title, text, onConfirm) {
    const modal = document.getElementById("confirm-modal");
    const titleEl = document.getElementById("confirm-title");
    const textEl = document.getElementById("confirm-text");
    const cancelBtn = document.getElementById("confirm-cancel");
    const okBtn = document.getElementById("confirm-ok");

    if (!modal) return;

    titleEl.innerText = title;
    textEl.innerText = text;

    if (cancelBtn) cancelBtn.style.display = "block";
    if (okBtn) {
        okBtn.innerText = "Delete";
        okBtn.style.background = "#e11d48";
    }

    CONFIRM_ACTION = onConfirm;
    modal.classList.remove("hidden");
}


function closeConfirm() {
    const modal = document.getElementById("confirm-modal");
    if (modal) modal.classList.add("hidden");
    CONFIRM_ACTION = null;
}


    document.addEventListener("DOMContentLoaded", () => {
        loadViewerPanel();
        checkUsername();
        loadProfile();

        if (SINGLE_POST_MODE) {
            applySinglePostUI();

            // Feed tab-ը ուղղակի դարձնենք active (click չանենք)
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-page").forEach(p => p.classList.remove("active"));

            const feedBtn = document.querySelector('[data-tab="feed"]');
            const feedPage = document.getElementById("feed");
            if (feedBtn) feedBtn.classList.add("active");
            if (feedPage) feedPage.classList.add("active");

            loadSinglePost(OPEN_POST_ID);
            socket.emit("join_post", { post_id: OPEN_POST_ID });
        } else {
            initFeed();
        }


        setTimeout(() => {
            loadFollowStats();
            loadUsers("");
        }, 300);

        initSettingsPanel();
        initFollowButton();
        initAvatarUpload();
        initTabs();
        initChatEvents();
        initSubTabs();



    const search = document.getElementById("user-search");
    if (search) {
        search.addEventListener("input", () => {
            loadUsers(search.value);
        });
    }

    const backBtn = document.getElementById("back-btn");
    if (backBtn) {
        backBtn.onclick = () => {
            if (window.history.length > 1) {
                history.back();
            } else {
                window.location.href =
                    `/portal/portal.html?uid=${viewerId}&viewer=${viewerId}`;
            }
        };

    }



});

function initTabs() {
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            closeDM();
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-page").forEach(p => p.classList.remove("active"));

            btn.classList.add("active");
            const tabId = btn.dataset.tab;

            CURRENT_TAB = tabId;

            const page = document.getElementById(tabId);
            if (page) page.classList.add("active");

            const globalBox = document.getElementById("global-chat");
            const dmBox = document.getElementById("dm-chat");

                if (tabId === "social") {
                    // Don't auto-start, sub-tabs will handle it
                } else {
                    stopHotUserRefresh();
                    // Offline tracking removed - user stays online
                }

        });
    });
}



function initChatEvents() {
    const globalSend = document.getElementById("global-send");
    if (globalSend) {
        globalSend.addEventListener("click", sendGlobalMessage);
    }

    const globalInput = document.getElementById("global-input");
    if (globalInput) {
        globalInput.addEventListener("keypress", e => {
            if (e.key === "Enter") {
                e.preventDefault();
                sendGlobalMessage();
            }
        });
        
        let globalTypingTimeout = null;
        globalInput.addEventListener("input", () => {
            updateCharCounter();
            
            // Send typing indicator
            socket.emit("typing_global", { user_id: CURRENT_UID });
            
            // Clear previous timeout
            if (globalTypingTimeout) clearTimeout(globalTypingTimeout);
            
            // Stop typing after 2 seconds
            globalTypingTimeout = setTimeout(() => {
                socket.emit("stop_typing_global", { user_id: CURRENT_UID });
            }, 2000);
        });
    }

    const dmSend = document.getElementById("dm-send");
    if (dmSend) {
        dmSend.addEventListener("click", sendDM);
    }

    const dmInput = document.getElementById("dm-input");
    if (dmInput) {
        dmInput.addEventListener("keypress", e => {
            if (e.key === "Enter") sendDM();
        });
        
        let dmTypingTimeout = null;
        dmInput.addEventListener("input", () => {
            if (!CURRENT_DM_TARGET) return;
            
            // Send typing indicator
            socket.emit("typing_dm", { 
                sender: CURRENT_UID,
                receiver: CURRENT_DM_TARGET
            });
            
            // Clear previous timeout
            if (dmTypingTimeout) clearTimeout(dmTypingTimeout);
            
            // Stop typing after 2 seconds
            dmTypingTimeout = setTimeout(() => {
                socket.emit("stop_typing_dm", { 
                    sender: CURRENT_UID,
                    receiver: CURRENT_DM_TARGET
                });
            }, 2000);
        });
    }

    // ✅ FULLSCREEN BUTTONS
    const globalFullscreen = document.getElementById("global-fullscreen");
    if (globalFullscreen) {
        globalFullscreen.addEventListener("click", toggleGlobalFullscreen);
    }

    const dmFullscreen = document.getElementById("dm-fullscreen");
    if (dmFullscreen) {
        dmFullscreen.addEventListener("click", toggleDMFullscreen);
    }

    // ✅ ESC KEY SUPPORT
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            const globalChat = document.getElementById("global-chat");
            const dmChat = document.getElementById("dm-chat");
            
            if (globalChat && globalChat.classList.contains("fullscreen")) {
                toggleGlobalFullscreen();
            }
            
            if (dmChat && dmChat.classList.contains("fullscreen")) {
                toggleDMFullscreen();
            }
        }
    });
}

// ✅ ՆՈՐ ՖՈՒՆԿՑԻԱ - Sub-tab switching
function initSubTabs() {
    document.querySelectorAll(".sub-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".sub-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".sub-page").forEach(p => p.classList.remove("active"));

            btn.classList.add("active");
            const subId = btn.dataset.sub;

            const subPage = document.getElementById(subId);
            if (subPage) subPage.classList.add("active");

            // ✅ Hot User tracking միայն Global Chat-ի համար
            if (subId === "chat") {
                loadGlobalChat();
                startHotUserRefresh();
                pingOnline();
            } else {
                stopHotUserRefresh();
                // Offline tracking removed - user stays online
            }
        });
    });
}

async function loadDMList() {
    if (!viewerId) return;

    const res = await fetch(`/api/message/partners?uid=${viewerId}`);
    const data = await res.json();
    if (!data.ok) return;

    const box = document.getElementById("pm-list");
    if (!box) return;

    box.innerHTML = "";

    data.users.forEach(u => {
        const div = document.createElement("div");
        div.className = "dm-user-row";
        div.style.cssText = `
            display:flex;
            align-items:center;
            padding:10px;
            background:#1115;
            border-radius:10px;
            margin-bottom:8px;
            cursor:pointer;
        `;

        div.innerHTML = `
            <img src="${u.avatar}" style="width:40px;height:40px;border-radius:50%;margin-right:10px;">
            <div style="font-size:16px;">${u.username}</div>
        `;

        div.onclick = () => openDM(u.user_id);
        box.appendChild(div);
    });
}

async function loadProfile() {
    if (!profileId) return;

    try {
        const res = await fetch(`/api/user/${profileId}`);
        const data = await res.json();

        if (!data.ok || !data.user) return;

        const user = data.user;

        const profileAvatar = document.getElementById("profile-avatar");
        if (profileAvatar) {
            let avatarUrl = "/portal/default.png";

            if (user.avatar_data && user.avatar_data !== "") {
                avatarUrl = user.avatar_data;
            } else if (user.avatar && user.avatar !== "") {
                avatarUrl = user.avatar;
            }

            profileAvatar.src = avatarUrl;
        }

                setUsername(user.username || "");

        decorateUsername(user.status_level || 0, user.status_name || "None");
        CURRENT_USER_STATUS = user.status_level || 0;
        updateCharCounter();

        
        
        // ✅ Show highlight checkbox for Status 7+
        const highlightCheckbox = document.getElementById("highlight-checkbox");
        const highlightLabel = document.getElementById("highlight-label");

        
        // ✅ Online status indicator
        const profileStatus = document.getElementById("profile-status");
        if (profileStatus) {
            if (user.is_online) {
                profileStatus.textContent = "🟢 Օնլայն";
                profileStatus.style.color = "#22c55e";
            } else {
                profileStatus.textContent = "⚫ Օֆլայն";
                profileStatus.style.color = "#6b7280";
            }
        }

        if (CURRENT_USER_STATUS >= 7) {
            if (highlightCheckbox) highlightCheckbox.style.display = "inline-block";
            if (highlightLabel) highlightLabel.style.display = "inline-block";
        } else {
            if (highlightCheckbox) highlightCheckbox.style.display = "none";
            if (highlightLabel) highlightLabel.style.display = "none";
        }
        
    } catch (e) {
        console.error("loadProfile error:", e);
    }
}

async function loadGlobalChat() {
    const box = document.getElementById("global-messages");
    if (!box) return;

    try {
        const res = await fetch("/api/global/messages");
        const data = await res.json();

        if (!data.ok || !data.messages) return;

        box.innerHTML = "";

        const messages = data.messages;
        let lastDate = null;

        messages.forEach(m => {
            const msgDate = new Date(m.created_at * 1000);
            const dateKey = msgDate.toLocaleDateString('hy-AM');

            if (dateKey !== lastDate) {
                lastDate = dateKey;

                const today = new Date().toLocaleDateString('hy-AM');
                const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('hy-AM');

                let label = dateKey;
                if (dateKey === today) label = "Այսօր";
                else if (dateKey === yesterday) label = "Երեկ";

                box.innerHTML += `<div class="chat-date-separator">${label}</div>`;
            }

            const isMe = String(m.user_id) === String(CURRENT_UID);
            box.innerHTML += renderChatMessage(m, isMe, false);
            
            // ✅ Load reactions for this message
            if (m.id) {
                loadMessageReactions(m.id, 'global');
            }
        });

        box.scrollTop = box.scrollHeight;
        loadHotUser();
        box.scrollTop = box.scrollHeight;
    } catch (e) {
        console.error("❌ loadGlobalChat error:", e);
    }
}


async function sendGlobalMessage() {
    const input = document.getElementById("global-input");
    if (!input) return;

    const text = input.value.trim();
if (!text || !viewerId) return;

    // ✅ Get highlight checkbox
    const highlightCheckbox = document.getElementById("highlight-checkbox");
    const highlight = highlightCheckbox ? highlightCheckbox.checked : false;

    try {
        const res = await fetch("/api/global/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            
            body: JSON.stringify({
                user_id: viewerId,
                message: text,
                highlight: highlight
            })  
        });

        const data = await res.json();
        
        if (!data.ok) {
            if (data.error === "cooldown") {
                openInfo("⏱️ Cooldown", `Please wait ${data.wait} seconds before sending another message.`);
            } else if (data.error === "too_long") {
                openInfo("📏 Too Long", `Message too long! Max ${data.max_length} characters.`);
            } else {
                console.error("❌ Failed to send:", data.error);
            }
            return;
        }

        // Success - clear input
        input.value = "";
        if (highlightCheckbox) highlightCheckbox.checked = false;
    } catch (e) {
        console.error("❌ sendGlobalMessage error:", e);
    }
}


async function openDM(targetId) {
    if (CURRENT_DM_TARGET) {
        socket.emit("leave_dm", {
            u1: CURRENT_UID,
            u2: CURRENT_DM_TARGET
        });
    }

    // 🔴 JOIN DM ROOM (realtime)
    socket.emit("join_dm", { u1: CURRENT_UID, u2: targetId });

    // Social tab ակտիվ
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelector('[data-tab="social"]').classList.add("active");

    document.querySelectorAll(".tab-page").forEach(p => p.classList.remove("active"));
    document.getElementById("social").classList.add("active");

    // Social → Messages sub-tab
    document.querySelectorAll(".sub-btn").forEach(b => b.classList.remove("active"));
    document.querySelector('[data-sub="messages"]').classList.add("active");

    document.querySelectorAll(".sub-page").forEach(p => p.classList.remove("active"));
    document.getElementById("messages").classList.add("active");

    if (!targetId) return;
    CURRENT_DM_TARGET = targetId;
    // 🔹 Բեռնում ենք DM header user info (avatar + username + status)
    try {
        const res = await fetch(`/api/user/${targetId}`);
        const data = await res.json();

        if (data.ok && data.user) {
            const u = data.user;

            const avatarEl = document.getElementById("dm-avatar");
            const nameEl = document.getElementById("dm-username");

            if (avatarEl) {
                avatarEl.src =
                    (u.avatar_data && u.avatar_data !== "")
                        ? u.avatar_data
                        : (u.avatar && u.avatar !== "")
                            ? u.avatar
                            : "/portal/default.png";
            }

            if (nameEl) {
                nameEl.innerHTML = renderUsernameLabel(
                    u.user_id,
                    u.username,
                    u.status_level
                );
            }
        }
    } catch (e) {
        console.error("DM header load error:", e);
    }

    const dmBox = document.getElementById("dm-chat");
    const globalBox = document.getElementById("global-chat");

    if (dmBox) dmBox.style.display = "flex";
    if (globalBox) globalBox.style.display = "none";

    await loadDM();

    // ✅ MARK DM AS SEEN
    fetch("/api/message/seen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            uid: CURRENT_UID,
            partner: targetId
        })
    });

    const dotSocial = document.getElementById("notify-social");
    const dotMessages = document.getElementById("notify-messages");

    if (dotSocial) dotSocial.classList.add("hidden");
    if (dotMessages) dotMessages.classList.add("hidden");


    if (window.DM_SHARE_TEXT) {
        const textToSend = window.DM_SHARE_TEXT;

        window.DM_SHARE_TEXT = null;
        SHARE_POST_ID = null; // ✅ ԱՅՍՏԵՂ Է ՃԻՇՏ ՊԱՀԸ

        setTimeout(async () => {
            await fetch(`/api/message/send`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    sender: CURRENT_UID,
                    receiver: CURRENT_DM_TARGET,
                    text: textToSend
                })
            });

            closeShareModal();
            await loadDM();
        }, 300);
    }



}

async function loadDM() {
    if (!CURRENT_DM_TARGET || !CURRENT_UID) return;

    try {
        const res = await fetch(`/api/message/history?u1=${CURRENT_UID}&u2=${CURRENT_DM_TARGET}`);
        const data = await res.json();

        if (!data.ok) return;

        const box = document.getElementById("dm-messages");
        if (!box) return;

        box.innerHTML = "";

        let lastDate = null;

        data.messages.forEach(m => {
            const msgDate = new Date(m.time * 1000);
            const dateKey = msgDate.toLocaleDateString('hy-AM');

            if (dateKey !== lastDate) {
                lastDate = dateKey;

                const today = new Date().toLocaleDateString('hy-AM');
                const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('hy-AM');

                let label = dateKey;
                if (dateKey === today) label = "Այսօր";
                else if (dateKey === yesterday) label = "Երեկ";

                box.innerHTML += `<div class="chat-date-separator">${label}</div>`;
            }

            const isMe = String(m.sender) === String(CURRENT_UID);
            box.innerHTML += renderChatMessage(m, isMe, true);
            
            // ✅ Load reactions for this message
            if (m.id) {
                loadMessageReactions(m.id, 'dm');
            }
        });

        box.scrollTop = box.scrollHeight;
        
        // 🔧 FIX: attach post link clicks in DM
        box.querySelectorAll(".portal-post-link").forEach(el => {
            el.onclick = () => {
                const postId = el.dataset.post;
                if (!postId) return;

                const uid = viewerId || "";
                window.location.href =
                    `/portal/portal.html?uid=${uid}&viewer=${uid}&open_post=${postId}`;
            };
        });

    } catch (e) {
        console.error("loadDM error:", e);
    }
}

async function sendDM() {
    // ❌ Չի կարելի գրել եթե ֆոլով չկա
    const res = await fetch(`/api/is_following/${CURRENT_UID}/${CURRENT_DM_TARGET}`);
    const data = await res.json();

    if (!data.ok || !data.is_following) {
        openInfo(
            "Չի կարելի գրել",
            "Դու պետք է ֆոլով լինես, որպեսզի կարողանաս գրել այս օգտատիրոջը"
        );
        return;
    }

    const input = document.getElementById("dm-input");
    if (!input) return;

    let text = input.value.trim();

    if (!text && window.DM_SHARE_TEXT) {
        text = window.DM_SHARE_TEXT;
        window.DM_SHARE_TEXT = null;
    }

    if (text === "" || !CURRENT_UID || !CURRENT_DM_TARGET) return;

    try {
        await fetch(`/api/message/send`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                sender: CURRENT_UID,
                receiver: CURRENT_DM_TARGET,
                text,
                reply_to: REPLY_TO
            })

        });

        input.value = "";
        REPLY_TO = null;
        input.placeholder = "";

        await loadDM();
    } catch (e) {
        console.error("sendDM error:", e);
    }
}

async function checkUsername() {
    if (!profileId) return;

    try {
        const res = await fetch(`/api/user/${profileId}`);
        const data = await res.json();
        if (!data.ok || !data.user) return;

        const savedName = data.user.username;
        const teleName = typeof telegramUser !== "undefined" ? (telegramUser?.username || null) : null;

        if (savedName && savedName.trim() !== "") {
            setUsername(savedName);
            return;
        }

        if (isOwner) {
            if (teleName && teleName.trim() !== "") {
                await saveUsername(teleName);
                setUsername(teleName);
                return;
            }
            showUsernamePopup();
        } else {
            setUsername("");
        }
    } catch (e) {
        console.error("checkUsername error:", e);
    }
}

function setUsername(name) {
    const profileName = document.getElementById("profile-name");
    if (profileName) profileName.innerText = name;
}

async function saveUsername(name) {
    if (!viewerId) return;
    await fetch(`/api/set_username`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: viewerId, username: name })
    });
}

function decorateUsername(level, name) {
    const el = document.getElementById("profile-name");
    if (!el) return;

    for (let i = 0; i <= 10; i++) {
        el.classList.remove(`status-${i}`);
    }

    const lvl = Number(level) || 0;
    el.classList.add(`status-${lvl}`);

    if (name) {
        el.title = `Status: ${name}`;
    }
}

function showUsernamePopup() {
    if (!isOwner) return;

    const popup = document.getElementById("username-popup");
    const input = document.getElementById("username-input");
    const btn = document.getElementById("username-save");

    if (!popup || !input || !btn) return;

    popup.classList.remove("hidden");

    btn.onclick = async () => {
        let name = input.value.trim();
        if (name.length < 3) {
            alert("Username-ը պետք է >= 3 սիմվոլ լինի");
            return;
        }

        await saveUsername(name);
        setUsername(name);
        popup.classList.add("hidden");
    };
}

function initAvatarUpload() {
    const avatarInput = document.getElementById("avatar-input");
    const avatarTop = document.getElementById("user-avatar");
    const avatarProfile = document.getElementById("profile-avatar");
    const changeAvatarBtn = document.getElementById("change-avatar-open");

    if (changeAvatarBtn && avatarInput) {
        changeAvatarBtn.addEventListener("click", () => {
            if (!isOwner) return;
            avatarInput.click();
            const panel = document.getElementById("settings-panel");
            if (panel) panel.classList.add("hidden");
        });
    }

    if (avatarInput) {
        avatarInput.addEventListener("change", async function () {
            if (!isOwner) {
                alert("Դու չես կարող փոխել այս պրոֆիլի avatar-ը");
                return;
            }

            const file = this.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                if (avatarTop) avatarTop.src = e.target.result;
                if (avatarProfile) avatarProfile.src = e.target.result;
            };
            reader.readAsDataURL(file);

            const formData = new FormData();
            formData.append("avatar", file);
            formData.append("uid", viewerId);

            await fetch("/api/upload_avatar", {
                method: "POST",
                body: formData
            });
        });
    }
}

function initSettingsPanel() {
    const settingsBtn = document.getElementById("settings-btn");
    const settingsPanel = document.getElementById("settings-panel");
    const settingsClose = document.getElementById("settings-close");
    const changeUsernameBtn = document.getElementById("change-username-open");

    if (settingsBtn && settingsPanel) {
        if (!isOwner) {
            settingsBtn.style.display = "none";
        } else {
            settingsBtn.onclick = () => {
                settingsPanel.classList.remove("hidden");
            };
        }
    }

    if (settingsClose && settingsPanel) {
        settingsClose.onclick = () => {
            settingsPanel.classList.add("hidden");
        };
    }

    if (changeUsernameBtn && settingsPanel) {
        changeUsernameBtn.addEventListener("click", () => {
            if (!isOwner) return;
            showUsernamePopup();
            settingsPanel.classList.add("hidden");
        });
    }

        // ✅ Allow Forward Toggle
    const forwardToggle = document.getElementById("allow-forward-toggle");
    if (forwardToggle) {
        // Load current setting
        fetch(`/api/user/${CURRENT_UID}`)
            .then(r => r.json())
            .then(d => {
                if (d.ok && d.user) {
                    const allow = d.user.allow_forward !== undefined ? d.user.allow_forward : 1;
                    forwardToggle.checked = (allow === 1);
                }
            });
        
        // Save on change
        forwardToggle.addEventListener("change", () => {
            const allow = forwardToggle.checked ? 1 : 0;
            
            fetch("/api/settings/toggle-forward", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    user_id: CURRENT_UID,
                    allow: allow
                })
            })
            .then(r => r.json())
            .then(d => {
                if (d.ok) {
                    LOG.info("✅ Forward setting saved:", allow);
                } else {
                    LOG.error("❌ Failed to save forward setting");
                    forwardToggle.checked = !forwardToggle.checked;
                }
            });
        });
    }

}

async function loadUsers(search = "") {
    try {
        const q = encodeURIComponent(search);
        const res = await fetch(`/api/search_users?q=${q}&viewer=${viewerId}`);
        const data = await res.json();

        if (!data.ok) return;

        const box = document.getElementById("users-list");
        if (!box) return;

        box.innerHTML = "";

                data.users.forEach(u => {
            const div = document.createElement("div");
            div.className = "user-row";
            div.style.cssText = `
                display:flex;
                align-items:center;
                padding:10px;
                background:#1115;
                border-radius:10px;
                margin-bottom:8px;
            `;

            const avatarUrl = u.avatar && u.avatar !== "" ? u.avatar : "/portal/default.png";

            // Check if viewer follows this user
            const isFollowing = u.is_following === true || u.is_following === 1;

            const buttons = isFollowing 
                ? `
                    <button class="dm-button" data-id="${u.user_id}"
                        style="padding:6px 12px;border-radius:8px;background:#34c759;color:white;margin-right:8px;">
                        💬 Գրել
                    </button>
                    <button class="profile-button" data-id="${u.user_id}"
                        style="padding:6px 12px;border-radius:8px;background:#3478f6;color:white;">
                        Բացել
                    </button>
                `
                : `
                    <button class="profile-button" data-id="${u.user_id}"
                        style="padding:6px 12px;border-radius:8px;background:#3478f6;color:white;">
                        Բացել
                    </button>
                `;

            div.innerHTML = `
                <img src="${avatarUrl}" style="width:40px;height:40px;border-radius:50%;margin-right:10px;">
                <div style="flex-grow:1;font-size:16px;">
                    ${renderUsernameLabel(u.user_id, u.username, u.status_level)}
                </div>
                ${buttons}
            `;

            // DM button click handler
            const dmBtn = div.querySelector(".dm-button");
            if (dmBtn) {
                dmBtn.onclick = (e) => {
                    e.stopPropagation();
                    openDM(u.user_id);
                };
            }

            // Profile button click handler
            const profileBtn = div.querySelector(".profile-button");
            if (profileBtn) {
                profileBtn.onclick = (e) => {
                    e.stopPropagation();
                    window.location.href = `/portal/portal.html?uid=${u.user_id}&viewer=${viewerId}`;
                };
            }

            box.appendChild(div);
        });
    } catch (e) {
        console.error("loadUsers error:", e);
    }
}

function loadViewerPanel() {
    const topAvatar = document.getElementById("user-avatar");
    const topUsername = document.getElementById("username");

    if (topAvatar) {
        topAvatar.style.cursor = "pointer";
        topAvatar.onclick = () => {
            window.location.href = `/portal/portal.html?uid=${viewerId}&viewer=${viewerId}`;
        };
    }

    if (!topAvatar || !topUsername) return;

    if (!viewerId) {
        topAvatar.src = "/portal/default.png";
        topUsername.innerText = "Unknown";
        return;
    }

    fetch(`/api/user/${viewerId}`)
        .then(r => r.json())
        .then(d => {
            if (!d.ok || !d.user) {
                topAvatar.src = "/portal/default.png";
                topUsername.innerText = "Unknown";
                return;
            }

            const user = d.user;

            if (user.avatar_data && user.avatar_data !== "") {
                topAvatar.src = user.avatar_data;
            } else if (user.avatar && user.avatar !== "") {
                topAvatar.src = user.avatar;
            } else {
                topAvatar.src = "/portal/default.png";
            }

            topUsername.innerText = user.username || "Unknown";
        })
        .catch(() => {
            topAvatar.src = "/portal/default.png";
            topUsername.innerText = "Unknown";
        });
}

async function loadFollowStats() {
    if (!profileId) return;

    try {
        const res = await fetch(`/api/follow_stats/${profileId}`);
        const data = await res.json();
        if (!data.ok) return;

        const followersSpan = document.getElementById("followers-count");
        const followingSpan = document.getElementById("following-count");

        // Load Domino Stars count
        const starsSpan = document.getElementById("profile-domino-stars");
        if (starsSpan) {
            // Get fire reactions received count from backend
            fetch(`/api/user/domino-stars?uid=${profileId}`)
                .then(r => r.json())
                .then(d => {
                    if (d.ok) {
                        starsSpan.textContent = d.count || 0;
                    }
                })
                .catch(e => console.error("Failed to load domino stars:", e));
        }

        if (followersSpan) {
            followersSpan.innerText = data.followers + " Followers";
        }
        if (followingSpan) {
            followingSpan.innerText = data.following + " Following";
        }

        const followBtn = document.getElementById("follow-btn");
        if (followBtn) {
            if (!viewerId || isOwner) {
                // ✅ Թաքցնել follow կոճակը եթե դու ինքդ քեզ ես նայում
                followBtn.style.display = "none";
            } else {
                followBtn.style.display = "block";
                const sRes = await fetch(`/api/is_following/${viewerId}/${profileId}`);
                const sData = await sRes.json();
                if (sData.ok) {
                    followBtn.innerText = sData.is_following ? "Following" : "Follow";
                }
            }
        }
    } catch (e) {
        console.error("loadFollowStats error:", e);
    }
}

function initFollowButton() {
    const followBtn = document.getElementById("follow-btn");
    if (!followBtn) return;

    followBtn.addEventListener("click", async () => {
        if (!viewerId || !profileId || isOwner) return;

        if (followBtn.innerText === "Following") return;

        followBtn.disabled = true;

        try {
            const res = await fetch("/api/follow", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    follower: viewerId,
                    target: profileId
                })
            });
            const data = await res.json();

            if (data.ok) {
                followBtn.innerText = "Following";
                await loadFollowStats();
            } else if (data.error === "low_balance") {
                alert("Բալանսը բավարար չէ follow անելու համար");
            } else if (data.already) {
                followBtn.innerText = "Following";
                await loadFollowStats();
            } else {
                alert("Չստացվեց follow անել");
            }
        } catch (e) {
            console.error(e);
        } finally {
            followBtn.disabled = false;
        }
    });
}

function initFeed() {
    if (SINGLE_POST_MODE) {
        return; // ⛔ ոչ մի feed logic single post-ի ժամանակ
    }

    const feedPage = document.getElementById("feed");
    const feedList = document.getElementById("feed-list");
    if (feedList) {
        feedList.innerHTML = "<div style='padding:12px;opacity:0.6'>Loading feed...</div>";
    }
    if (!feedPage || !feedList) return;

    const postBtn = document.getElementById("post-send");
    if (postBtn) {
        postBtn.onclick = createPost;
    } else {
        console.warn("post-send button not found");
    }

    const mediaBtn = document.getElementById("media-btn");
    const mediaInput = document.getElementById("post-media");

    if (mediaBtn && mediaInput) {
        mediaBtn.onclick = () => mediaInput.click();

        mediaInput.onchange = () => {
            if (mediaInput.files && mediaInput.files.length > 0) {
                mediaBtn.classList.add("selected");
                mediaBtn.innerText = "📎 Ընտրված է";
            } else {
                mediaBtn.classList.remove("selected");
                mediaBtn.innerText = "📎 Media";
            }
        };
    }


    if (!SINGLE_POST_MODE) {
        loadFeed();
    }
}

async function loadSinglePost(postId) {
    const feedList = document.getElementById("feed-list");
    if (!feedList) return;

    feedList.innerHTML = "<div style='opacity:0.7;padding:8px;'>Բեռնվում է...</div>";

    try {
        const res = await fetch(`/api/post/${postId}`);
        const data = await res.json();

        if (!data.ok || !data.post) {
            feedList.innerHTML = "<div style='opacity:0.7;padding:8px;'>Գրառումը չի գտնվել</div>";
            return;
        }

        feedList.innerHTML = "";

        const card = renderPostCard(data.post);
        feedList.appendChild(card);

    } catch (e) {
        console.error("loadSinglePost error:", e);
        feedList.innerHTML = "<div style='opacity:0.7;padding:8px;'>Սխալ</div>";
    }
}


async function createPost() {
    const textArea = document.getElementById("post-text");
    const fileInput = document.getElementById("post-media");

    const text = (textArea.value || "").trim();
    if (text === "" && (!fileInput.files || fileInput.files.length === 0)) {
        openInfo(
            "Չի ստացվում",
            "Գրառումը չի կարող լինել լիովին դատարկ 🙂"
        );
    const mediaBtn = document.getElementById("media-btn");
        if (mediaBtn) {
            mediaBtn.classList.remove("selected");
            mediaBtn.innerText = "📎 Media";
        }

        return;
    }


    let mediaUrl = "";

    if (fileInput.files && fileInput.files.length > 0) {
        const formData = new FormData();
        formData.append("file", fileInput.files[0]);
        formData.append("uid", viewerId);

        const up = await fetch("/api/upload_post_media", {
            method: "POST",
            body: formData
        });

        const upData = await up.json();

        if (!upData.ok) {
            alert("Չհաջողվեց բեռնել ֆայլը");
            return;
        }

        mediaUrl = upData.url;
    }

    const res = await fetch("/api/post/create", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            user_id: viewerId,
            text,
            media_url: mediaUrl
        })
    });

    const data = await res.json();

    if (!data.ok) {
        alert("Չհաջողվեց հրապարակել");
        return;
    }

    textArea.value = "";
    fileInput.value = "";

    loadFeed();
}

document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".feed-switch-btn").forEach(btn => {
        btn.addEventListener("click", () => {

            // 🔁 Եթե single post-ից ենք → reload feed mode
            if (SINGLE_POST_MODE) {
                const uid = viewerId || "";
                window.location.href = `/portal/portal.html?uid=${uid}&viewer=${uid}`;
                return;
            }


            document.querySelectorAll(".feed-switch-btn")
                .forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            const mode = btn.dataset.feed;
            if (mode === "recommended") loadFeed();
            else loadMyPosts();
        });
    });
});

async function loadMyPosts() {
    const feedList = document.getElementById("feed-list");
    feedList.innerHTML = "Բեռնվում է...";

    const res = await fetch(`/api/posts/user/${viewerId}`);
    const data = await res.json();
    if (!data.ok) {
        feedList.innerHTML = "Չստացվեց բեռնել";
        return;
    }

    feedList.innerHTML = "";
    data.posts.forEach(p => feedList.appendChild(renderPostCard(p)));
}

async function loadFeed() {
    // 🔒 Եթե բացվել է կոնկրետ post, feed-ը չբեռնենք
    if (SINGLE_POST_MODE) {
        return;
    }

    const feedList = document.getElementById("feed-list");
    if (!feedList) return;

    feedList.innerHTML = "<div style='opacity:0.7;padding:8px;'>Բեռնվում է...</div>";

    let url = "/api/posts/feed";
    if (viewerId) url += "?uid=" + encodeURIComponent(viewerId);

    try {
        const res = await fetch(url);
        const data = await res.json();
        if (!data.ok) {
            feedList.innerHTML = "<div style='opacity:0.7;padding:8px;'>Սխալ feed բեռնելիս</div>";
            return;
        }

        const posts = data.posts || [];
        if (posts.length === 0) {
            feedList.innerHTML = "<div style='opacity:0.7;padding:8px;'>Դեռ գրառումներ չկան։ Գրի՛ր առաջինը 🙂</div>";
            return;
        }

        feedList.innerHTML = "";
        posts.forEach(p => {
            const card = renderPostCard(p);
            feedList.appendChild(card);
        });
    } catch (e) {
        console.error("loadFeed error:", e);
        feedList.innerHTML = "<div style='opacity:0.7;padding:8px;'>Սխալ feed բեռնելիս</div>";
    }
}

function renderPostCard(post) {
    let mediaUrl = "";
    if (post.media_url && post.media_url !== "") {
        mediaUrl = post.media_url;

        if (mediaUrl.startsWith("/uploads/")) {
            mediaUrl = window.location.origin + mediaUrl;
        }
    }

    const div = document.createElement("div");
    div.className = "post-card";
    div.dataset.postId = String(post.id);
    div.style.cssText = `
        background:#000a;
        border-radius:12px;
        padding:10px;
        margin-bottom:10px;
        border:1px solid #222;
    `;

    const created = new Date(post.created_at * 1000);
    const timeStr = created.toLocaleString();
    const isMine = String(post.user_id) === String(viewerId);

    let mediaHtml = "";
    if (mediaUrl) {
        if (mediaUrl.endsWith(".mp4")) {
            mediaHtml = `
                <video controls style="width:100%; border-radius:12px; margin-bottom:10px;">
                    <source src="${mediaUrl}">
                </video>
            `;
        } else {
            mediaHtml = `
                <img src="${mediaUrl}"
                    style="width:100%; border-radius:12px; margin-bottom:10px;" />
            `;
        }
    }

    div.innerHTML = `
        <div style="display:flex;align-items:center;margin-bottom:6px;">
            <img src="${post.avatar}"
                style="width:32px;height:32px;border-radius:50%;margin-right:8px;cursor:pointer;"
                onclick="window.location.href='/portal/portal.html?uid=${post.user_id}&viewer=${viewerId}'">

            <div style="flex-grow:1;">
                <div style="font-size:14px;font-weight:bold;">
                    ${renderUsernameLabel(post.user_id, post.username, post.status_level)}
                    ${isMine ? '<span style="font-size:11px;opacity:0.7;"> (դու)</span>' : ""}
                </div>
                <div style="font-size:11px;opacity:0.6;">${timeStr}</div>
            </div>
        </div>

        <div style="font-size:14px;white-space:pre-wrap;margin-bottom:8px;">
            ${escapeHtml(post.text || "")}
        </div>

        ${mediaHtml}

        <div style="display:flex;align-items:center;gap:10px;margin-top:6px;">

            ${isMine ? `
            <button class="delete-post-btn" data-id="${post.id}"
                style="padding:4px 10px;border-radius:999px;border:none;
                    background:#922;color:#fff;font-size:13px;cursor:pointer;">
                🗑️ Delete
            </button>
            ` : ""}

            <!-- LIKE -->
            <button class="like-btn" data-id="${post.id}"
                style="padding:4px 10px;border-radius:999px;border:none;
                    background:${post.liked ? "#22c55e33" : "#222"};
                    color:#fff;font-size:13px;cursor:pointer;">
                ❤️ <span class="like-count">${post.likes}</span>
            </button>

            <!-- COMMENTS -->
            <button class="comment-btn" data-id="${post.id}"
                style="padding:4px 10px;border-radius:999px;border:none;
                    background:#222;color:#fff;font-size:13px;cursor:pointer;">
                💬 Comments
            </button>

            <!-- SHARE -->
            <button class="share-btn" data-id="${post.id}"
                style="padding:4px 10px;border-radius:999px;border:none;
                    background:#222;color:#fff;font-size:13px;cursor:pointer;">
            🔄 Share
            </button>

        </div>
    `;

    const delBtn = div.querySelector(".delete-post-btn");
    if (delBtn) {
        delBtn.onclick = () => deletePost(post.id);
    }

    const commentBtn = div.querySelector(".comment-btn");
    if (commentBtn) {
        commentBtn.addEventListener("click", () => openComments(post.id));
    }

    const shareBtn = div.querySelector(".share-btn");
    if (shareBtn) {
        shareBtn.addEventListener("click", () => sharePost(post.id));
    }

    const likeBtn = div.querySelector(".like-btn");
    likeBtn.addEventListener("click", async () => {
        await likePost(post.id, likeBtn);
    });

    return div;
}

function renderUsernameLabel(userId, username, statusLevel) {
  const lvl = Number(statusLevel) || 0;
  const safeName = escapeHtml(username || ("User " + userId));
  const href = `/portal/portal.html?uid=${userId}&viewer=${viewerId}`;
  return `<span class="status-${lvl}" style="cursor:pointer;" onclick="window.location.href='${href}'">${safeName}</span>`;
}


async function likePost(postId, btn) {
    if (!viewerId) {
        alert("Չի իմացվում քո ID-ն, like անել չի ստացվի");
        return;
    }
    if (!btn) return;

    if (btn.dataset.clicked === "1") return;

    try {
        const res = await fetch("/api/post/like", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                user_id: viewerId,
                post_id: postId
            })
        });
        const data = await res.json();
        if (!data.ok && !data.already) {
            console.error("likePost failed", data);
            return;
        }

        const countSpan = btn.querySelector(".like-count");
        if (countSpan) {
            let current = parseInt(countSpan.innerText || "0", 10);
            if (!data.already) {
                current += 1;
            }
            countSpan.innerText = String(current);
        }

        btn.style.background = "#22c55e33";
        btn.dataset.clicked = "1";
    } catch (e) {
        console.error("likePost error:", e);
    }
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function renderComment(c, isReply) {
    const div = document.createElement("div");
    div.style.cssText = `
        padding:6px;
        margin-bottom:8px;
        border-bottom:1px solid #222;
        ${isReply ? "opacity:0.9;" : ""}
    `;

    let deleteBtn = "";
    if (
        String(c.user_id) === String(viewerId) ||
        String(c.post_owner_id) === String(viewerId)
    ) {
        deleteBtn = `<span class="delete-comment" data-id="${c.id}"
            style="float:right;color:red;cursor:pointer;">Delete</span>`;
    }

    div.innerHTML = `
        <b>${renderUsernameLabel(c.user_id, c.username, c.status_level)}</b>
        ${deleteBtn}

        <span class="comment-like-btn" data-id="${c.id}"
            style="float:right;margin-right:10px;color:#4af;cursor:pointer;">
            👍 ${c.likes || 0}
        </span>

        <span class="comment-reply-btn"
            data-id="${c.id}"
            data-username="${c.username}"
            style="float:right;margin-right:10px;color:#7af;cursor:pointer;">
            Reply
        </span>

        <div style="clear:both"></div>

        <div style="font-size:13px;margin-top:4px;">
            ${escapeHtml(c.text)}
        </div>

        <div style="font-size:11px;opacity:0.5;">
            ${new Date(c.created_at * 1000).toLocaleString()}
        </div>
    `;

    return div;
}

let CURRENT_COMMENT_POST = null;

async function openComments(postId) {
    CURRENT_COMMENT_POST = postId;

    const drawer = document.getElementById("comment-drawer");
    const list = document.getElementById("comment-list");
    const header = document.getElementById("comment-count");

    if (!drawer || !list || !header) return;

    drawer.classList.remove("hidden");
    list.innerHTML = "Loading...";

    const res = await fetch(`/api/comment/list?post_id=${postId}`);
    const data = await res.json();

    if (!data.ok) {
        list.innerHTML = "Error loading comments";
        return;
    }

    header.innerText = `Comments (${data.comments.length})`;
    list.innerHTML = "";

    const map = {};
    data.comments.forEach(c => {
        c.children = [];
        map[c.id] = c;
    });

    const roots = [];

    data.comments.forEach(c => {
        if (c.parent_id && map[c.parent_id]) {
            map[c.parent_id].children.push(c);
        } else {
            roots.push(c);
        }
    });


    function renderThread(comment, level = 0) {
        const div = renderComment(comment, level > 0);
        div.style.marginLeft = level * 18 + "px";
        list.appendChild(div);

        if (comment.children && comment.children.length > 0) {
            const toggle = document.createElement("div");
            toggle.style.cssText = `
                margin-left:${level * 18 + 18}px;
                font-size:12px;
                color:#7af;
                cursor:pointer;
                margin-bottom:4px;
            `;

            toggle.innerText = `Show ${comment.children.length} replies`;

            const repliesBox = document.createElement("div");
            repliesBox.style.display = "none";

            let opened = false;

            toggle.onclick = () => {
                opened = !opened;

                if (opened) {
                    toggle.innerText = "Hide replies";
                    repliesBox.style.display = "block";

                    if (!repliesBox.hasChildNodes()) {
                        comment.children.forEach(ch => {
                            const childDiv = renderThread(ch, level + 1);
                            repliesBox.appendChild(childDiv);
                        });
                    }
                } else {
                    toggle.innerText = `Show ${comment.children.length} replies`;
                    repliesBox.style.display = "none";
                }
            };

            list.appendChild(toggle);
            list.appendChild(repliesBox);
        }
        return div;
    }

    roots.forEach(c => renderThread(c));

        list.onclick = (e) => {
            const likeBtn = e.target.closest(".comment-like-btn");
            const replyBtn = e.target.closest(".comment-reply-btn");
            const deleteBtn = e.target.closest(".delete-comment");

            // 👍 LIKE
            if (likeBtn) {
                likeComment(likeBtn.dataset.id);
                return;
            }

            // 💬 REPLY
            if (replyBtn) {
                REPLY_TO = replyBtn.dataset.id;
                REPLY_TO_USERNAME = replyBtn.dataset.username;

                const input = document.getElementById("comment-input");
                if (input) {
                    input.placeholder = `Reply to ${REPLY_TO_USERNAME}...`;
                    input.focus();
                }
                return;
            }

            // 🗑 DELETE
            if (deleteBtn) {
                deleteComment(deleteBtn.dataset.id);
                return;
            }
        };

}

document.addEventListener("DOMContentLoaded", () => {
    const closeBtn = document.getElementById("comment-close");
    if (closeBtn) {
        closeBtn.onclick = () => {
            const drawer = document.getElementById("comment-drawer");
            if (drawer) drawer.classList.add("hidden");
        };
    }

    const sendBtn = document.getElementById("comment-send");
    if (sendBtn) {
        sendBtn.onclick = async () => {
            const input = document.getElementById("comment-input");
            if (!input) return;

            const text = input.value.trim();
            if (!text) return;

            await fetch(`/api/comment/create`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    post_id: CURRENT_COMMENT_POST,
                    user_id: viewerId,
                    text,
                    reply_to: REPLY_TO
                })
            });

            REPLY_TO = null;
            REPLY_TO_USERNAME = null;
            input.placeholder = "Write a comment...";
            input.value = "";

            openComments(CURRENT_COMMENT_POST);
        };
    }
});


async function deletePost(postId) {
  openConfirm(
    "Ջնջել գրառումը",
    "Վստա՞հ ես, որ ուզում ես ջնջել այս գրառումը։ Այս գործողությունը չի կարող հետ վերադարձվել։",
    async () => {

      // 1) UI-ից ՀԵՆՑ ՀԻՄԱ remove (optimistic)
      removePostFromUI(postId);

      // 2) server delete
      const res = await fetch("/api/post/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_id: postId, user_id: viewerId })
      });

      const data = await res.json();

      // 3) Եթե server-ը ասեց ok չէ → վերադարձնենք (fallback reload)
      if (!data.ok) {
        loadFeed();
        openInfo("Չստացվեց", "Server-ը չջնջեց, նորից փորձիր");
        return;
      }

      // 4) (optional) server-ը թող socket-ով broadcast անի՝ մյուսներին էլ ջնջվի
      // դու սրա համար client-ում արդեն socket.on() կավելացնես ՔԱՅԼ 3-ում
    }
  );
}


let SHARE_POST_ID = null;

function renderMessageText(text) {
    if (!text) return "";

    // Share post format
    if (text.includes("DOMINO_POST:")) {
        const postId = text.split("DOMINO_POST:")[1].trim();

        return `
            <span class="portal-post-link"
                data-post="${postId}"
                style="color:#4da3ff;cursor:pointer;text-decoration:underline;">
                🔗 Բացել գրառումը
            </span>
        `;
    }

    return escapeHtml(text);
}

function renderChatMessage(msg, isMe = false, isDM = false) {
    const align = isMe ? "right" : "left";
    const bgColor = isMe ? "#1e3a8a" : "#1f2937";
    const statusClass = `status-${msg.status_level || 0}`;
    const username = msg.username || `User ${msg.sender}`;
    const avatar = msg.avatar || "/portal/default.png";
    const messageId = msg.id || msg.sender + '_' + Date.now();
    const chatType = isDM ? "dm" : "global";
    const userStatus = msg.status_level || 0;  // ← ԱՅՍ ԱՎԵԼԱՑՐՈՒ
    const senderId = msg.sender || msg.user_id || 0;

    let replyHtml = "";
    if (msg.reply_to && msg.reply_to_text) {
        replyHtml = `<div style="background:rgba(58,139,255,0.2);border-left:3px solid #3a8bff;padding:6px 10px;margin-bottom:6px;border-radius:6px;font-size:12px;opacity:0.8;">${msg.reply_to_text.slice(0, 60)}${msg.reply_to_text.length > 60 ? '...' : ''}</div>`;
    }

    const msgText = (msg.text || msg.message || '').replace(/"/g, '&quot;');
    const escapedText = msgText.replace(/`/g, '\\`').replace(/\$/g, '\\$');
    const tierReactions = getTierReactions(messageId, chatType);
    const highlightClass = msg.highlighted ? 'highlighted-message' : '';

    return `
    <div class="chat-message-wrapper ${msg.highlighted ? 'highlighted-message' : ''}" 
         data-msg-id="${messageId}" 
         data-chat-type="${chatType}" 
         data-msg-text="${msgText}" 
         data-sender="${msg.sender || ''}" 
         data-username="${username.replace(/"/g, '&quot;')}"
         data-is-me="${isMe}"
         data-user-status="${userStatus}"
         onclick="handleMessageClick('${messageId}', '${chatType}', '${username.replace(/'/g, "\\'")}', \`${escapedText}\`, ${isMe}, ${isDM})">

        <div style="text-align:${align};">
            <div style="display:inline-block;max-width:70%;background:${bgColor};padding:10px 14px;border-radius:14px;text-align:left;position:relative;">
                ${!isMe ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;"><img src="${avatar}" style="width:24px;height:24px;border-radius:50%;"><span class="${statusClass}" style="font-weight:bold;font-size:13px;">${username}</span></div>` : ''}
                ${replyHtml}
                <div style="color:#fff;font-size:14px;word-wrap:break-word;">${msg.text || msg.message || ""}</div>
                <div style="color:rgba(255,255,255,0.5);font-size:11px;margin-top:4px;text-align:right;">${formatMessageTime(msg.time || msg.created_at)}</div>
            </div>
        </div>

        <div style="text-align:${align};margin-top:4px;">
            <div class="inline-message-menu" id="inline-menu-${messageId}" style="display:none;">
                <div class="inline-reactions">
                    ${tierReactions}
                </div>
                <div class="inline-actions">
                    ${!isMe ? `<div class="inline-action domino-star-btn domino-star-button" onclick="event.stopPropagation();sendDominoStar('${messageId}', '${chatType}', ${senderId});closeAllInlineMenus();"><span class="domino-star-icon domino-star-animated"> 👾 </span> Domino Star <span style="font-size:11px;opacity:0.7;">(0.20 USD)</span></div>` : ''}
                    ${isDM ? `<div class="inline-action" onclick="event.stopPropagation();setReply('${messageId}', \`${escapedText}\`, '${username.replace(/'/g, "\\'")}');closeAllInlineMenus();"><span style="font-size:18px;">↩️</span> Reply</div>` : ''}
                    <div class="inline-action" onclick="event.stopPropagation();copyMessage(\`${escapedText}\`);closeAllInlineMenus();"><span style="font-size:18px;">📋</span> Copy</div>
                                        <div class="inline-action" onclick="event.stopPropagation();openForwardModal('${messageId}', '${chatType}');closeAllInlineMenus();"><span style="font-size:18px;">📩</span> Forward</div>
                    ${isMe ? `<div class="inline-action danger" onclick="event.stopPropagation();deleteMessage('${messageId}', '${chatType}');closeAllInlineMenus();"><span style="font-size:18px;">🗑️</span> Delete</div>` : ''}
                </div>
            </div>
        </div>

        <div style="text-align:${align};">
            <div class="message-reactions" id="reactions-${messageId}" style="display:none;justify-content:${isMe ? 'flex-end' : 'flex-start'};"></div>
            <div class="fire-counter" id="fire-counter-${messageId}" style="display:none;text-align:${align};margin-top:4px;">
                <span class="fire-badge"><span class="domino-star-icon-small domino-star-animated"> 👾 </span> <span id="fire-count-${messageId}">0</span></span>
            </div>
        </div>
    </div>`;
}


function sharePost(postId) {
    SHARE_POST_ID = postId;
    const modal = document.getElementById("share-modal");
    if (modal) modal.classList.remove("hidden");
}

function closeShareModal() {
    const modal = document.getElementById("share-modal");
    if (modal) modal.classList.add("hidden");
}



async function deleteComment(commentId) {
    await fetch(`/api/comment/delete`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            comment_id: commentId,
            user_id: viewerId
        })
    });

    openComments(CURRENT_COMMENT_POST);
}


async function likeComment(commentId) {
    try {
        const res = await fetch("/api/comment/like", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                comment_id: commentId,
                user_id: viewerId
            })
        });

        const data = await res.json();
        if (!data.ok) return;

        // 🔥 գտնում ենք հենց սեղմված 👍 span-ը
        const btn = document.querySelector(
            `.comment-like-btn[data-id="${commentId}"]`
        );

        if (btn) {
            btn.innerHTML = `👍 ${data.likes}`;
            btn.style.color = data.liked ? "#22c55e" : "#4af";
        }

    } catch (e) {
        console.error("likeComment error:", e);
    }
}


document.addEventListener("DOMContentLoaded", () => {
    const okBtn = document.getElementById("confirm-ok");
    const cancelBtn = document.getElementById("confirm-cancel");

    if (okBtn) {
        okBtn.onclick = async () => {
            if (CONFIRM_ACTION) await CONFIRM_ACTION();
            closeConfirm();
        };
    }

    if (cancelBtn) {
        cancelBtn.onclick = closeConfirm;
    }
});

document.addEventListener("DOMContentLoaded", () => {

    const tgBtn = document.getElementById("share-telegram");
    const globalBtn = document.getElementById("share-global");
    const copyBtn = document.getElementById("share-copy");
    const dmBtn = document.getElementById("share-dm");

    if (dmBtn) {
        dmBtn.onclick = openDMShare;
    }




    function getSharePayload() {
        return `DOMINO_POST:${SHARE_POST_ID}`;
    }

    function getShareLink() {
        // Deep link դեպի քո bot-ը, որը կբացի հենց տվյալ post-ը
        return `https://t.me/doominobot?startapp=post_${SHARE_POST_ID}`;
    }

    if (copyBtn) {
        copyBtn.onclick = async () => {
            await navigator.clipboard.writeText(getShareLink());
            openInfo("Պատրաստ է", "Հղումը պատճենվեց 🙂");
            closeShareModal();
        };
    }

    if (globalBtn) {
        globalBtn.onclick = () => {
            socket.emit("global_send", {
                user_id: viewerId,
                message: `📢 Նոր գրառում\n${getSharePayload()}`
            });

            openInfo("Տարածվեց", "Գրառումը ուղարկվեց Global Chat");
            closeShareModal();
        };
    }



});

document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".sub-btn").forEach(btn => {
        btn.addEventListener("click", () => {

            // ակտիվ sub կոճակ
            document.querySelectorAll(".sub-btn")
                .forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            const sub = btn.dataset.sub;

            // sub էջեր
            document.querySelectorAll(".sub-page")
                .forEach(p => p.classList.remove("active"));

            const page = document.getElementById(sub);
            if (page) page.classList.add("active");

            // 🔹 կապում ենք հին լոգիկան
            if (sub === "users") {
                loadUsers("");
            }

            if (sub === "messages") {
                loadDMList();
            }

            if (sub === "chat") {
                CURRENT_TAB = "social";
                loadGlobalChat();
                
            } else {
            
            }

        });
    });
});

document.addEventListener("DOMContentLoaded", () => {
    const closeBtn = document.getElementById("dm-close");
    if (closeBtn) {
        closeBtn.onclick = closeDM;
    }
});

function closeDM() {
    const dmBox = document.getElementById("dm-chat");
    const globalBox = document.getElementById("global-chat");

    if (dmBox) dmBox.style.display = "none";
    if (globalBox) globalBox.style.display = "flex";

    CURRENT_DM_TARGET = null;
    CURRENT_TAB = "social";

    loadGlobalChat();
}


async function openDMShare() {
    const popup = document.getElementById("dm-share-popup");
    const list = document.getElementById("dm-share-list");

    if (!popup || !list) return;

    list.innerHTML = "Բեռնվում է...";

    // Բերում ենք DM ունեցած օգտատերերին
    const res = await fetch(`/api/message/partners?uid=${viewerId}`);
    const data = await res.json();

    if (!data.ok || !data.users || data.users.length === 0) {
        list.innerHTML = "Դեռ DM չունես";
        popup.classList.remove("hidden");
        return;
    }

    list.innerHTML = "";

    data.users.forEach(u => {
        const row = document.createElement("div");
        row.style.cssText = `
            display:flex;
            align-items:center;
            gap:10px;
            padding:8px;
            border-radius:10px;
            background:#1115;
            margin-bottom:6px;
        `;

        row.innerHTML = `
            <input type="checkbox" data-id="${u.user_id}">
            <img src="${u.avatar || '/portal/default.png'}"
                style="width:32px;height:32px;border-radius:50%;">
            <span>${u.username}</span>
        `;

        list.appendChild(row);
    });

    popup.classList.remove("hidden");
}

function closeDMShare() {
    const popup = document.getElementById("dm-share-popup");
    if (popup) popup.classList.add("hidden");
}

document.addEventListener("DOMContentLoaded", () => {
    const sendBtn = document.getElementById("dm-share-send");

    if (!sendBtn) return;

    sendBtn.onclick = async () => {
        const checked = document.querySelectorAll(
            "#dm-share-list input:checked"
        );

        if (checked.length === 0) {
            openInfo("Սխալ", "Ընտրիր գոնե մեկ օգտատիրոջ");
            return;
        }

        const payload = `DOMINO_POST:${SHARE_POST_ID}`;

        for (const cb of checked) {
            await fetch(`/api/message/send`, {
                method: "POST",
                headers: {"Content-Type":"application/json"},
                body: JSON.stringify({
                    sender: viewerId,
                    receiver: cb.dataset.id,
                    text: payload
                })
            });
        }

        closeDMShare();
        closeShareModal();

        openInfo("Պատրաստ է", "Գրառումը ուղարկվեց DM-ով");
    };
});

function removePostFromUI(postId) {
  const el = document.querySelector(`.post-card[data-post-id="${postId}"]`);
  if (el) el.remove();
}

function startReply(el) {
    const mid = el.dataset.mid;
    const text = el.dataset.text;

    if (!mid || !text) return;

    REPLY_TO = mid;

    const input =
        document.getElementById("dm-input") ||
        document.getElementById("global-input");

    if (input) {
        input.placeholder = "Reply: " + text.slice(0, 30);
        input.focus();
    }
}



function cancelReply() {
    REPLY_TO = null;
    const box = document.getElementById("reply-box");
    if (box) box.style.display = "none";
}

// ========== SWIPE + LONG PRESS MENU ==========
document.addEventListener("DOMContentLoaded", () => {
    let startX = 0;
    let currentWrapper = null;
    let longPressTimer = null;
    let isLongPress = false;

    // Touch start
    document.addEventListener("touchstart", (e) => {
        const wrapper = e.target.closest(".chat-message-wrapper");
        if (!wrapper) return;
        
        currentWrapper = wrapper;
        startX = e.touches[0].clientX;
        isLongPress = false;

        // Long press detection (500ms)
        longPressTimer = setTimeout(() => {
            isLongPress = true;
            showContextMenu(wrapper);
        }, 500);
    });

    // Touch move
    document.addEventListener("touchmove", (e) => {
        clearTimeout(longPressTimer);
        
        if (!currentWrapper) return;
        
        const deltaX = e.touches[0].clientX - startX;
        
        // Swipe RIGHT → ցույց տալ ժամը
        if (deltaX > 50) {
            currentWrapper.classList.add("swiped");
        } else {
            currentWrapper.classList.remove("swiped");
        }
    });

    // Touch end
    document.addEventListener("touchend", () => {
        clearTimeout(longPressTimer);
        
        if (!currentWrapper || isLongPress) {
            currentWrapper = null;
            return;
        }

        setTimeout(() => {
            if (currentWrapper) {
                currentWrapper.classList.remove("swiped");
            }
            currentWrapper = null;
        }, 2000);
    });
});

// ========== CONTEXT MENU FUNCTIONS ==========
function showContextMenu(wrapper) {
    const menu = document.getElementById("message-context-menu");
    if (!menu) return;

    const canReply = wrapper.dataset.canReply === "true";
    const msgId = wrapper.dataset.msgId;
    const msgText = wrapper.dataset.msgText;
    const username = wrapper.dataset.username;

    // Reply button visibility
    const replyBtn = document.getElementById("ctx-reply");
    if (replyBtn) {
        replyBtn.style.display = canReply ? "block" : "none";
        replyBtn.onclick = () => {
            if (msgId && msgText) {
                setReply(msgId, msgText, username);
            }
            closeContextMenu();
        };
    }

    // Copy button
    const copyBtn = document.getElementById("ctx-copy");
    if (copyBtn) {
        copyBtn.onclick = () => {
            copyToClipboard(msgText || "");
            closeContextMenu();
        };
    }

    // Cancel button
    const cancelBtn = document.getElementById("ctx-cancel");
    if (cancelBtn) {
        cancelBtn.onclick = closeContextMenu;
    }

    menu.classList.remove("hidden");
}

function closeContextMenu() {
    const menu = document.getElementById("message-context-menu");
    if (menu) menu.classList.add("hidden");
}

function copyToClipboard(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            console.log("✅ Copied to clipboard");
        });
    } else {
        // Fallback
        const temp = document.createElement("textarea");
        temp.value = text;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand("copy");
        document.body.removeChild(temp);
    }
}

function setReply(msgId, text, username) {
    REPLY_TO = msgId;
    REPLY_TO_USERNAME = username;
    
    const box = document.getElementById("reply-box");
    const replyText = document.getElementById("reply-text");
    
    if (box && replyText) {
        replyText.innerText = `↩️ ${username}: ${text.slice(0, 50)}${text.length > 50 ? '...' : ''}`;
        box.style.display = "block";
    }
}

function cancelReply() {
    REPLY_TO = null;
    REPLY_TO_USERNAME = null;
    
    const box = document.getElementById("reply-box");
    if (box) box.style.display = "none";
}

function updateCharCounter() {
    const input = document.getElementById("global-input");
    const counter = document.getElementById("global-char-count");
    
    if (!input || !counter) return;
    
    const length = input.value.length;
    
    // Get user status (պետք է global variable լինի)
    const maxLength = CURRENT_USER_STATUS >= 5 ? 500 : 200;
    
    counter.innerText = `${length}/${maxLength}`;
    
    // Change color if approaching limit
    if (length > maxLength * 0.9) {
        counter.style.color = "#ef4444"; // red
    } else if (length > maxLength * 0.7) {
        counter.style.color = "#f59e0b"; // orange
    } else {
        counter.style.color = "#888"; // gray
    }
    
    // Prevent typing beyond limit
    if (length > maxLength) {
        input.value = input.value.slice(0, maxLength);
        counter.innerText = `${maxLength}/${maxLength}`;
    }
}

async function loadHotUser() {
    try {
        const res = await fetch("/api/global/hot-user");
        const data = await res.json();
        
        console.log("🔥 Hot user data:", data);
        
        const banner = document.getElementById("hot-user-banner");
        const avatar = document.getElementById("hot-user-avatar");
        const name = document.getElementById("hot-user-name");
        
        if (!banner || !avatar || !name) {
            console.error("❌ Hot user elements not found");
            return;
        }
        
        if (data.ok && data.hot_user) {
            const user = data.hot_user;
            
            avatar.src = user.avatar;
            name.innerText = user.username;
            name.className = `status-${user.status_level}`;
            
            banner.style.display = "flex";
            console.log("✅ Hot user displayed:", user.username);
        } else {
            banner.style.display = "none";
            console.log("ℹ️ No hot user found");
        }
        
    } catch (e) {
        console.error("❌ loadHotUser error:", e);
    }
}

function startHotUserRefresh() {
    if (hotUserInterval) {
        clearInterval(hotUserInterval);
    }
    
    loadHotUser(); // Initial load
    
    // Ping every 10 seconds
    hotUserInterval = setInterval(() => {
        pingOnline();
        loadHotUser();
    }, 10000);
    
    console.log("🔄 Hot user refresh started");
}

async function pingOnline() {
    if (!viewerId) return;
    
    try {
        await fetch("/api/global/ping", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: viewerId })
        });
    } catch (e) {
        console.error("❌ Ping error:", e);
    }
}

async function pingOffline() {
    if (!viewerId) return;
    
    try {
        await fetch("/api/global/offline", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: viewerId })
        });
        console.log("📴 Marked offline");
    } catch (e) {
        console.error("❌ Offline ping error:", e);
    }
}

function stopHotUserRefresh() {
    if (hotUserInterval) {
        clearInterval(hotUserInterval);
        hotUserInterval = null;
        console.log("⏹️ Hot user refresh stopped");
    }
}

// =============================
// FULLSCREEN CHAT FUNCTIONS
// =============================

function toggleGlobalFullscreen() {
    const chatBox = document.getElementById("global-chat");
    const btn = document.getElementById("global-fullscreen");
    
    if (!chatBox || !btn) return;
    
    if (chatBox.classList.contains("fullscreen")) {
        // Exit fullscreen
        chatBox.classList.remove("fullscreen");
        btn.innerText = "⛶";
        
        // Scroll to bottom
        const messages = document.getElementById("global-messages");
        if (messages) messages.scrollTop = messages.scrollHeight;
    } else {
        // Enter fullscreen
        chatBox.classList.add("fullscreen");
        btn.innerText = "✕";
        
        // Scroll to bottom
        const messages = document.getElementById("global-messages");
        if (messages) messages.scrollTop = messages.scrollHeight;
    }
}

function toggleDMFullscreen() {
    const chatBox = document.getElementById("dm-chat");
    const btn = document.getElementById("dm-fullscreen");
    
    if (!chatBox || !btn) return;
    
    if (chatBox.classList.contains("fullscreen")) {
        // Exit fullscreen
        chatBox.classList.remove("fullscreen");
        btn.innerText = "⛶";
        
        // Scroll to bottom
        const messages = document.getElementById("dm-messages");
        if (messages) messages.scrollTop = messages.scrollHeight;
    } else {
        // Enter fullscreen
        chatBox.classList.add("fullscreen");
        btn.innerText = "✕";
        
        // Scroll to bottom
        const messages = document.getElementById("dm-messages");
        if (messages) messages.scrollTop = messages.scrollHeight;
    }
}

// =============================
// TYPING INDICATOR
// =============================

function showTypingIndicator(username, chatType) {
    const boxId = chatType === "global" ? "global-messages" : "dm-messages";
    const box = document.getElementById(boxId);
    
    if (!box) return;
    
    // Remove existing typing indicator
    const existing = box.querySelector(".typing-indicator");
    if (existing) existing.remove();
    
    // Create new typing indicator
    const indicator = document.createElement("div");
    indicator.className = "typing-indicator";
    indicator.innerHTML = `
        <div style="
            padding: 8px 12px;
            background: rgba(255,255,255,0.05);
            border-radius: 8px;
            margin: 6px 0;
            font-size: 13px;
            color: #9ca3af;
            font-style: italic;
        ">
            ${username} գրում է<span class="typing-dots">...</span>
        </div>
    `;
    
    box.appendChild(indicator);
    box.scrollTop = box.scrollHeight;
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
        indicator.remove();
    }, 3000);
}

// =============================
// MESSAGE REACTIONS
// =============================

function toggleReactionPicker(messageId, chatType) {
    const picker = document.getElementById(`picker-${messageId}`);
    
    if (!picker) return;
    
    // Close all other pickers
    document.querySelectorAll('.reaction-picker').forEach(p => {
        if (p.id !== `picker-${messageId}`) {
            p.style.display = 'none';
        }
    });
    
    // Toggle this picker
    picker.style.display = picker.style.display === 'none' ? 'flex' : 'none';
}

async function addReaction(messageId, chatType, emoji) {
    // Close picker
    const picker = document.getElementById(`picker-${messageId}`);
    if (picker) picker.style.display = 'none';
    
    try {
        const res = await fetch('/api/message/react', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message_id: parseInt(messageId),
                chat_type: chatType,
                user_id: CURRENT_UID,
                emoji: emoji
            })
        });
        
        const data = await res.json();
        
        if (data.ok) {
            // Reactions will be updated via socket
            LOG.info(`Reaction ${data.action}:`, emoji);
        }
    } catch (err) {
        LOG.error('Failed to add reaction:', err);
    }
}

// =============================
// LOAD MESSAGE REACTIONS
// =============================

async function loadMessageReactions(messageId, chatType) {
    try {
        const res = await fetch(`/api/message/reactions?message_id=${messageId}&chat_type=${chatType}`);
        const data = await res.json();

        if (data.ok) {
            updateMessageReactions(messageId, chatType, data.reactions || {}, data.fire_count || 0);
        }
    } catch (err) {
        LOG.error('Failed to load reactions:', err);
    }
}

function updateMessageReactions(messageId, chatType, reactions, fireCount = 0) {
    const container = document.getElementById(`reactions-${messageId}`);
    
    if (!container) return;
    
    // Clear existing reactions
    container.innerHTML = '';
    
    // If no reactions, hide container
    if (!reactions || Object.keys(reactions).length === 0) {
        container.style.display = 'none';
    } else {
        // Show container
        container.style.display = 'flex';
        
        // Add each normal reaction
        for (const [emoji, count] of Object.entries(reactions)) {
            const item = document.createElement('div');
            item.className = 'reaction-item';
            item.innerHTML = `
                <span class="reaction-emoji">${emoji}</span>
                <span class="reaction-count">${count}</span>
            `;
            
            // Click to toggle reaction
            item.onclick = () => addReaction(messageId, chatType, emoji);
            
            container.appendChild(item);
        }
    }
    
    // Update fire counter (separate element)
    const fireCounter = document.getElementById(`fire-counter-${messageId}`);
    const fireCountSpan = document.getElementById(`fire-count-${messageId}`);
    
    if (fireCounter && fireCountSpan) {
        fireCountSpan.textContent = fireCount;
        fireCounter.style.display = fireCount > 0 ? 'block' : 'none';
    }
}

// Close reaction pickers when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.react-trigger') && !e.target.closest('.reaction-picker')) {
        document.querySelectorAll('.reaction-picker').forEach(p => {
            p.style.display = 'none';
        });
    }
});

// MESSAGE MENU
let CURRENT_MENU_MESSAGE = null;



// INLINE MESSAGE MENU
function toggleInlineMenu(messageId, chatType, username, text, isMe, isDM) {
    const menu = document.getElementById(`inline-menu-${messageId}`);
    
    // ✅ Եթե այս menu-ն արդեն բաց է, փակել
    if (menu && window.getComputedStyle(menu).display !== 'none') {
        menu.style.display = 'none';
        return;
    }
    
    closeAllInlineMenus();
    
    if (!menu) return;
    
    // Regenerate reactions based on CURRENT USER's status
    const reactionsContainer = menu.querySelector('.inline-reactions');
    if (reactionsContainer) {
        const basicReactions = ['❤️', '👍', '😂', '🔥', '⭐'];
        const tier5Reactions = ['💯', '🎉', '😍', '👏', '🚀'];
        const tier7Reactions = ['💎', '⚡', '🌟', '🎯', '🔱'];
        
        const myStatus = CURRENT_USER_STATUS || 0;
        
        let allReactions = [...basicReactions];
        
        if (myStatus >= 5) {
            allReactions = [...allReactions, ...tier5Reactions];
        }
        
        if (myStatus >= 7) {
            allReactions = [...allReactions, ...tier7Reactions];
        }
        
        // Show first 5 + "more" button
        const displayReactions = allReactions.slice(0, 5);
        const hasMore = allReactions.length > 5;
        
        let html = displayReactions.map(emoji => 
            `<span class="inline-emoji" onclick="event.stopPropagation();quickReaction('${messageId}','${chatType}','${emoji}');">${emoji}</span>`
        ).join('');
        
        if (hasMore) {
            html += `<span class="inline-emoji more-reactions-btn" onclick="event.stopPropagation();showAllReactions('${messageId}','${chatType}');">➕</span>`;
        }
        
        reactionsContainer.innerHTML = html;
        
        // Add hidden reactions container
        if (hasMore) {
            const hiddenReactions = allReactions.slice(5);
            let hiddenHtml = `<div class="hidden-reactions" id="hidden-reactions-${messageId}" style="display:none;">`;
            hiddenHtml += hiddenReactions.map(emoji => 
                `<span class="inline-emoji" onclick="event.stopPropagation();quickReaction('${messageId}','${chatType}','${emoji}');">${emoji}</span>`
            ).join('');
            hiddenHtml += `</div>`;
            
            reactionsContainer.insertAdjacentHTML('afterend', hiddenHtml);
        }
    }
    
    menu.style.display = 'block';
}

function closeAllInlineMenus() {
    document.querySelectorAll('.inline-message-menu').forEach(m => m.style.display = 'none');
    
    // ✅ Remove all hidden-reactions to prevent duplication
    document.querySelectorAll('.hidden-reactions').forEach(hr => hr.remove());
}

// ==================== CLOSE MENU ON CLICK OUTSIDE ====================
document.addEventListener('click', (e) => {
    // Check if any inline menu is open
    const openMenus = document.querySelectorAll('.inline-message-menu[style*="display: flex"], .inline-message-menu[style*="display:flex"]');
    
    if (openMenus.length === 0) return; // No menus open
    
    // Check if click is inside any menu or on a message wrapper
    const clickedInsideMenu = e.target.closest('.inline-message-menu');
    const clickedOnMessage = e.target.closest('.message-wrapper');
    
    // If clicked outside menu (but not on another message to toggle), close all menus
    if (!clickedInsideMenu && !clickedOnMessage) {
        closeAllInlineMenus();
    }
});

// Close menus when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.chat-message-wrapper')) {
        closeAllInlineMenus();
    }
});


document.addEventListener('DOMContentLoaded', () => {
    const menu = document.getElementById('message-menu');
    const closeBtn = document.getElementById('message-menu-close');
    if (menu) menu.addEventListener('click', (e) => { if (e.target === menu) closeMessageMenu(); });
    if (closeBtn) closeBtn.addEventListener('click', closeMessageMenu);
});

let lastTapTime = 0;
let longPressTimer = null;

function handleMessageClick(messageId, chatType, username, text, isMe, isDM) {
    const now = Date.now();
    
    // DOUBLE TAP = Quick ❤️ reaction
    if (now - lastTapTime < 300) {
        quickReaction(messageId, chatType, '❤️');
        lastTapTime = 0;
        return;
    }
    
    lastTapTime = now;
    toggleInlineMenu(messageId, chatType, username, text, isMe, isDM);
}

function quickReaction(messageId, chatType, emoji) {
    // Haptic feedback
    if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
    }
    
    addReaction(messageId, chatType, emoji);
    closeAllInlineMenus();
}

function copyMessage(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('📋 Copied!');
        if (window.Telegram && window.Telegram.WebApp) {
            window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        }
    });
}

async function deleteMessage(messageId, chatType) {
    if (!confirm('Delete this message?')) return;
    
    try {
        const endpoint = chatType === 'dm' ? '/api/dm/delete' : '/api/chat/delete';
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message_id: messageId,
                user_id: viewerId
            })
        });
        
        if (res.ok) {
            // Remove from DOM
            const wrapper = document.querySelector(`[data-msg-id="${messageId}"]`);
            if (wrapper) {
                wrapper.style.animation = 'fadeOut 0.3s ease';
                setTimeout(() => wrapper.remove(), 300);
            }
            
            showToast('🗑️ Message deleted');
            
            if (window.Telegram && window.Telegram.WebApp) {
                window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
            }
        }
    } catch (err) {
        console.error('Delete failed:', err);
        showToast('❌ Failed to delete');
    }
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 100px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 12px 24px;
        border-radius: 24px;
        font-size: 14px;
        font-weight: 500;
        z-index: 10000;
        animation: toastPop 2s ease;
        backdrop-filter: blur(10px);
    `;
    
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
}


// ========== TIER-BASED REACTIONS ==========

function getTierReactions(messageId, chatType) {
    const basicReactions = ['❤️', '👍', '😂', '🔥', '⭐'];
    const tier5Reactions = ['💯', '🎉', '😍', '👏', '🚀'];
    const tier7Reactions = ['💎', '⚡', '🌟', '🎯', '🔱'];
    
    // Use CURRENT_USER_STATUS instead of message sender's status
    const myStatus = CURRENT_USER_STATUS || 0;
    
    let allReactions = [...basicReactions];
    
    if (myStatus >= 5) {
        allReactions = [...allReactions, ...tier5Reactions];
    }
    
    if (myStatus >= 7) {
        allReactions = [...allReactions, ...tier7Reactions];
    }
    
    // Show first 5 + "more" button
    const displayReactions = allReactions.slice(0, 5);
    const hasMore = allReactions.length > 5;
    
    let html = displayReactions.map(emoji => 
        `<span class="inline-emoji" onclick="event.stopPropagation();quickReaction('${messageId}','${chatType}','${emoji}');">${emoji}</span>`
    ).join('');
    
    if (hasMore) {
        html += `<span class="inline-emoji more-reactions-btn" onclick="event.stopPropagation();showAllReactions('${messageId}','${chatType}');">➕</span>`;
    }
    
    // Hidden reactions container
    if (hasMore) {
        const hiddenReactions = allReactions.slice(5);
        html += `<div class="hidden-reactions" id="hidden-reactions-${messageId}" style="display:none;">`;
        html += hiddenReactions.map(emoji => 
            `<span class="inline-emoji" onclick="event.stopPropagation();quickReaction('${messageId}','${chatType}','${emoji}');">${emoji}</span>`
        ).join('');
        html += `</div>`;
    }
    
    return html;
}


function showAllReactions(messageId, chatType) {
    const hiddenContainer = document.getElementById(`hidden-reactions-${messageId}`);
    const moreBtn = event.target;
    
    if (hiddenContainer) {
        if (hiddenContainer.style.display === 'none') {
            hiddenContainer.style.display = 'flex';
            moreBtn.textContent = '➖';
        } else {
            hiddenContainer.style.display = 'none';
            moreBtn.textContent = '➕';
        }
    }
}


// ========== FORMAT MESSAGE TIME ==========

function formatMessageTime(timestamp) {
    if (!timestamp) return '';
    
    const date = new Date(timestamp * 1000);
    const now = new Date();
    
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    // Մինչև 1 րոպե
    if (diffMins < 1) return 'հենց նոր';
    
    // Մինչև 60 րոպե
    if (diffMins < 60) return `${diffMins} րոպե առաջ`;
    
    // Մինչև 24 ժամ
    if (diffHours < 24) return `${diffHours} ժամ առաջ`;
    
    // Ավելի քան 24 ժամ - ցույց տալ ժամը
    const hours = date.getHours().toString().padStart(2, '0');
    const mins = date.getMinutes().toString().padStart(2, '0');
    
    if (diffDays === 0) {
        return `${hours}:${mins}`;
    } else if (diffDays === 1) {
        return `Երեկ ${hours}:${mins}`;
    } else if (diffDays < 7) {
        const days = ['Կիր', 'Երկ', 'Երք', 'Չոր', 'Հինգ', 'Ուրբ', 'Շաբ'];
        return `${days[date.getDay()]} ${hours}:${mins}`;
    } else {
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        return `${day}.${month} ${hours}:${mins}`;
    }
}


// ========== DOMINO STAR REACTION ==========

let PENDING_DOMINO_STAR = null;
async function sendDominoStar(messageId, chatType, receiverId) {
    if (!CURRENT_UID) {
        showToast("❌ Please log in first");
        return;
    }
    if (!receiverId || receiverId == CURRENT_UID) {
        showToast("❌ Cannot send Domino Star to yourself");
        return;
    }
    // Store pending data
    PENDING_DOMINO_STAR = {
        messageId,
        chatType,
        receiverId
    };
    // Load user balance
    try {
        const res = await fetch(`/api/user/${CURRENT_UID}`);
        const data = await res.json();
        
        const balanceSpan = document.getElementById('domino-star-user-balance');
        if (balanceSpan && data.ok && data.user) {
            balanceSpan.textContent = (data.user.balance_usd || 0).toFixed(2);
        }
    } catch (e) {
        console.error("Failed to load balance:", e);
    }
    // Show modal
    const modal = document.getElementById('domino-star-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeDominoStarModal() {
    const modal = document.getElementById('domino-star-modal');
    if (modal) modal.classList.add('hidden');
    PENDING_DOMINO_STAR = null;
}

async function confirmDominoStar() {
    if (!PENDING_DOMINO_STAR) return;
    const { messageId, chatType, receiverId } = PENDING_DOMINO_STAR;
    // Close modal first
    closeDominoStarModal();
    try {
        const res = await fetch("/api/fire/add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message_id: messageId,
                chat_type: chatType,
                giver_id: CURRENT_UID,
                receiver_id: receiverId
            })
        });
        const data = await res.json();
        if (!data.ok) {
            if (data.error === "insufficient_balance") {
                showToast("❌ Insufficient balance");
            } else if (data.error === "cannot_fire_yourself") {
                showToast("❌ Cannot send to yourself");
            } else {
                showToast("❌ Failed to send Domino Star");
            }
            return;
        }
        updateFireCounter(messageId, data.fire_count);
        showToast(`✨ Domino Star sent! New balance: ${data.new_balance.toFixed(2)} USD`);
        triggerDominoStarAnimation(messageId);
    } catch (e) {
        console.error("sendDominoStar error:", e);
        showToast("❌ Network error");
    }
}

function updateFireCounter(messageId, count) {
    const counter = document.getElementById(`fire-counter-${messageId}`);
    const countSpan = document.getElementById(`fire-count-${messageId}`);
    
    if (counter && countSpan) {
        countSpan.textContent = count;
        counter.style.display = count > 0 ? 'block' : 'none';
    }
}

function triggerDominoStarAnimation(messageId) {
    const wrapper = document.querySelector(`[data-msg-id="${messageId}"]`);
    if (!wrapper) return;
    
    wrapper.classList.add('domino-star-flash');
    
    setTimeout(() => {
        wrapper.classList.remove('domino-star-flash');
    }, 1000);
}

let currentForwardMessageId = null;
let currentForwardChatType = null; 

// Open forward modal from inline menu
function openForwardModal(messageId, chatType) {
    currentForwardMessageId = messageId;
    currentForwardChatType = chatType;

    // Set exclude user ID for DM forward
    if (chatType === "dm" && CURRENT_DM_TARGET) {
        window.currentForwardExcludeUserId = CURRENT_DM_TARGET;
        console.log("🔒 Excluding current DM partner:", CURRENT_DM_TARGET);
    } else {
        window.currentForwardExcludeUserId = null;
    }

    const forwardModal = document.getElementById("forward-modal");
    if (!forwardModal) return;

    loadForwardTargets();
    forwardModal.classList.remove("hidden");
}

function loadForwardTargets() {
    const forwardTargetList = document.getElementById("forward-target-list");
    if (!forwardTargetList) return;

    forwardTargetList.innerHTML = '<div style="text-align:center;color:#999;">Loading...</div>';

    fetch(`/api/message/partners?uid=${CURRENT_UID}`)
        .then(r => r.json())
        .then(d => {
            if (!d.ok || !d.users || d.users.length === 0) {
                forwardTargetList.innerHTML = '<div style="text-align:center;color:#999;">No contacts found</div>';
                return;
            }

            forwardTargetList.innerHTML = "";

            // Add Global Chat option if forwarding from DM
            if (currentForwardChatType === "dm") {
                const globalDiv = document.createElement("div");
                globalDiv.className = "forward-target-item";
                globalDiv.innerHTML = `
                    <span style="font-size:24px;">🌍</span>
                    <span style="color:white;flex:1;">Global Chat</span>
                    <span style="color:#999;font-size:12px;">➜</span>
                `;
                globalDiv.onclick = () => sendForwardMessage(null, true);
                forwardTargetList.appendChild(globalDiv);
            }

            d.users.forEach(p => {
                // Skip current DM partner when forwarding from DM
                if (window.currentForwardExcludeUserId && p.user_id == window.currentForwardExcludeUserId) {
                    return;
                }
                
                const div = document.createElement("div");
                div.className = "forward-target-item";
                div.innerHTML = `
                    <img src="${p.avatar || '/portal/default.png'}" 
                         style="width:40px;height:40px;border-radius:50%;object-fit:cover;">
                    <span style="color:white;flex:1;">@${p.username || 'User ' + p.user_id}</span>
                    <span style="color:#999;font-size:12px;">➜</span>
                `;
                div.onclick = () => sendForwardMessage(p.user_id, false);
                forwardTargetList.appendChild(div);
            });
        });
}

// Send forward message
function sendForwardMessage(targetUserId, toGlobal) {
    const forwardModal = document.getElementById("forward-modal");
    if (!forwardModal) return;

    const payload = {
        user_id: CURRENT_UID,
        message_id: currentForwardMessageId,
        target_user_id: targetUserId,
        to_global: toGlobal
    };

    const endpoint = currentForwardChatType === "global" ? "/api/global/forward" : "/api/dm/forward";

    console.log("🚀 Forward payload:", payload);
    console.log("📍 Endpoint:", endpoint);

    fetch(endpoint, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(payload)
    })
    .then(r => r.json())
    .then(d => {
        if (d.ok) {
            console.log("✅ Message forwarded successfully");
            forwardModal.classList.add("hidden");
            currentForwardMessageId = null;
            currentForwardChatType = null;
            window.currentForwardExcludeUserId = null;
        } else {
            console.error("❌ Forward failed:", d.error);
            alert("Forward failed: " + (d.error || "Unknown error"));
        }
    })
    .catch(err => {
        console.error("❌ Forward error:", err);
        alert("Network error");
    });
}


// Initialize forward modal cancel button
document.addEventListener("DOMContentLoaded", () => {
    const forwardCancel = document.getElementById("forward-cancel");
    const forwardModal = document.getElementById("forward-modal");
    
    if (forwardCancel && forwardModal) {
        forwardCancel.addEventListener("click", () => {
            console.log("🔴 Cancel clicked");
            forwardModal.classList.add("hidden");
            currentForwardMessageId = null;
            currentForwardChatType = null;
            window.currentForwardExcludeUserId = null;
        });
    }
});

// Forward message
function forwardMessageTo(targetUserId) {
    const endpoint = currentForwardChatType === "global"
        ? "/api/chat/forward"
        : "/api/dm/forward";

    const payload = {
        user_id: CURRENT_UID,
        message_id: currentForwardMessageId,
        target_user_id: targetUserId,
        to_global: (targetUserId === "global")
    };

    console.log("🚀 Forward payload:", payload);
    console.log("📍 Endpoint:", endpoint);

    fetch(endpoint, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(payload)
    })
    .then(r => r.json())
    .then(d => {
        if (d.ok) {
            LOG.info("✅ Message forwarded successfully");
            document.getElementById("forward-modal").classList.add("hidden");
            showToast("📩 Message forwarded!");
        } else if (d.error === "forwarding_disabled") {
            showToast("❌ User disabled forwarding");
        } else if (d.error === "need_follow") {
            showToast("❌ You need to follow this user first");
        } else {
            showToast("❌ Failed to forward message");
        }
    })
    .catch(err => {
        LOG.error("Forward error:", err);
        showToast("❌ Network error");
    });
}

// Toast notification helper
function showToast(message) {
    const toast = document.createElement("div");
    toast.textContent = message;
    toast.style.cssText = `
        position:fixed;top:20px;left:50%;transform:translateX(-50%);
        background:rgba(0,0,0,0.9);color:white;padding:12px 24px;
        border-radius:8px;z-index:10000;font-size:14px;
        box-shadow:0 4px 12px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
   
});


// ✅ Update user online status dynamically
function updateUserOnlineStatus(userId, isOnline) {
    if (String(userId) === String(profileId)) {
        const profileStatus = document.getElementById("profile-status");
        if (profileStatus) {
            if (isOnline) {
                profileStatus.textContent = "🟢 Օնլայն";
                profileStatus.style.color = "#22c55e";
            } else {
                profileStatus.textContent = "⚫ Օֆլայն";
                profileStatus.style.color = "#6b7280";
            }
        }
    }
}