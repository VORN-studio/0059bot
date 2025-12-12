const urlParams = new URLSearchParams(window.location.search);
const profileId = urlParams.get("uid") || "";
const viewerFromUrl = urlParams.get("viewer") || "";
const viewerId = viewerFromUrl || profileId;
const isOwner = viewerId && profileId && String(viewerId) === String(profileId);
let REPLY_TO = null;
let REPLY_TO_USERNAME = null;
const CURRENT_UID = viewerId;
let CURRENT_TAB = "feed";
let CURRENT_DM_TARGET = null;

let CONFIRM_ACTION = null;

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
    loadFollowStats();
    loadUsers("");

    const search = document.getElementById("user-search");
    if (search) {
        search.addEventListener("input", () => {
            loadUsers(search.value);
        });
    }

    initSettingsPanel();
    initFollowButton();
    initAvatarUpload();
    initTabs();
    initChatEvents();

    const backBtn = document.getElementById("back-btn");
    if (backBtn) {
        backBtn.addEventListener("click", () => {
            const backUid = viewerId || profileId || "";
            window.location.href = `/app?uid=${backUid}`;
        });
    }

    initFeed();
});

function initTabs() {
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {

            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-page").forEach(p => p.classList.remove("active"));

            btn.classList.add("active");
            const tabId = btn.dataset.tab;

            CURRENT_TAB = tabId;

            const page = document.getElementById(tabId);
            if (page) page.classList.add("active");

            const globalBox = document.getElementById("global-chat");
            const dmBox = document.getElementById("dm-chat");

            if (tabId === "chat") {
                if (globalBox) globalBox.style.display = "flex";
                if (dmBox) dmBox.style.display = "none";

                loadGlobalChat();
                startGlobalRefresh();
            } else {
                if (globalBox) globalBox.style.display = "none";
                stopGlobalRefresh();
            }

            if (tabId === "messages") {
                if (dmBox) dmBox.style.display = "none";
                loadDMList();
            } else {
                if (dmBox) dmBox.style.display = "none";
            }

            if (tabId !== "messages") {
                if (window.DM_REFRESH_INTERVAL) {
                    clearInterval(window.DM_REFRESH_INTERVAL);
                    window.DM_REFRESH_INTERVAL = null;
                }
            }
        });
    });
}

function startGlobalRefresh() {
    if (window.GLOBAL_REFRESH_INTERVAL) return; 

    window.GLOBAL_REFRESH_INTERVAL = setInterval(() => {
        loadGlobalChat();
    }, 2000); 
}

async function sendGlobalMessage() {
    const input = document.getElementById("global-input");
    const text = input.value.trim();
    if (text === "") return;

    await fetch(`/api/global/send`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            sender: CURRENT_UID,
            text
        })
    });

    input.value = "";

    loadGlobalChat(); 
    startGlobalRefresh(); 
}

function stopGlobalRefresh() {
    if (window.GLOBAL_REFRESH_INTERVAL) {
        clearInterval(window.GLOBAL_REFRESH_INTERVAL);
        window.GLOBAL_REFRESH_INTERVAL = null;
    }
}

function initChatEvents() {
    const globalSend = document.getElementById("global-send");
    if (globalSend) {
        globalSend.addEventListener("click", sendGlobalMessage);
    }

    const globalInput = document.getElementById("global-input");
    if (globalInput) {
        globalInput.addEventListener("keypress", e => {
            if (e.key === "Enter") sendGlobalMessage();
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
    }
}

async function loadDMList() {
    if (!viewerId) return;

    const res = await fetch(`/api/follows/list?uid=${viewerId}`);
    const data = await res.json();
    if (!data.ok) return;

    const box = document.getElementById("pm-list");
    if (!box) return;

    box.innerHTML = "";

    data.list.forEach(u => {
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
    } catch (e) {
        console.error("loadProfile error:", e);
    }
}

async function loadGlobalChat() {
    if (CURRENT_TAB !== "chat") return;

    try {
        const res = await fetch(`/api/global/history`);
        const data = await res.json();

        if (!data.ok) return;

        const box = document.getElementById("global-messages");
        if (!box) return;

        box.innerHTML = "";

        data.messages.forEach(msg => {
            const div = document.createElement("div");
            const who = (String(msg.sender) === String(CURRENT_UID)) ? "You" : msg.sender;
            div.innerHTML = `<b>${who}</b>: ${msg.text}`;
            div.style.marginBottom = "6px";
            box.appendChild(div);
        });

        box.scrollTop = box.scrollHeight;
    } catch (e) {
        console.error("loadGlobalChat error:", e);
    }
}

async function sendGlobalMessage() {
    const input = document.getElementById("global-input");
    if (!input) return;

    const text = input.value.trim();
    if (text === "" || !CURRENT_UID) return;

    try {
        await fetch(`/api/global/send`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                sender: CURRENT_UID,
                text
            })
        });

        input.value = "";
        await loadGlobalChat();
    } catch (e) {
        console.error("sendGlobalMessage error:", e);
    }
}

async function openDM(targetId) {
    if (!targetId) return;
    CURRENT_DM_TARGET = targetId;

    const dmBox = document.getElementById("dm-chat");
    const globalBox = document.getElementById("global-chat");

    if (dmBox) dmBox.style.display = "flex";
    if (globalBox) globalBox.style.display = "none";

    await loadDM();

    if (window.DM_REFRESH_INTERVAL) clearInterval(window.DM_REFRESH_INTERVAL);

    window.DM_REFRESH_INTERVAL = setInterval(() => {
        if (CURRENT_DM_TARGET) loadDM();
    }, 2000);
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

        data.messages.forEach(m => {
            const div = document.createElement("div");
            const who = (String(m.sender) === String(CURRENT_UID)) ? "You" : m.sender;
            div.innerHTML = `<b>${who}</b>: ${m.text}`;
            div.style.marginBottom = "6px";
            box.appendChild(div);
        });

        box.scrollTop = box.scrollHeight;
    } catch (e) {
        console.error("loadDM error:", e);
    }
}

async function sendDM() {
    const input = document.getElementById("dm-input");
    if (!input) return;

    const text = input.value.trim();
    if (text === "" || !CURRENT_UID || !CURRENT_DM_TARGET) return;

    try {
        await fetch(`/api/message/send`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                sender: CURRENT_UID,
                receiver: CURRENT_DM_TARGET,
                text
            })
        });

        input.value = "";
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

            div.innerHTML = `
                <img src="${avatarUrl}" style="width:40px;height:40px;border-radius:50%;margin-right:10px;">
                <div style="flex-grow:1;font-size:16px;">${u.username}</div>
                <button data-id="${u.user_id}"
                    style="padding:6px 12px;border-radius:8px;background:#3478f6;color:white;">
                    Բացել
                </button>
            `;

            div.querySelector("button").onclick = () => {
                window.location.href = `/portal/portal.html?uid=${u.user_id}&viewer=${viewerId}`;
            };

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

        if (followersSpan) {
            followersSpan.innerText = data.followers + " Followers";
        }
        if (followingSpan) {
            followingSpan.innerText = data.following + " Following";
        }

        const followBtn = document.getElementById("follow-btn");
        if (followBtn && viewerId && !isOwner) {
            const sRes = await fetch(`/api/is_following/${viewerId}/${profileId}`);
            const sData = await sRes.json();
            if (sData.ok) {
                followBtn.innerText = sData.is_following ? "Following" : "Follow";
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
    const feedPage = document.getElementById("feed");
    const feedList = document.getElementById("feed-list");
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


    loadFeed();
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
                    ${post.username || "User " + post.user_id}
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
        <b>${c.username}</b>
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

    list.querySelectorAll(".comment-like-btn").forEach(btn => {
        btn.addEventListener("click", () => likeComment(btn.dataset.id));
    });

    list.querySelectorAll(".comment-reply-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            REPLY_TO = btn.dataset.id;
            REPLY_TO_USERNAME = btn.dataset.username;

            const input = document.getElementById("comment-input");
            if (input) {
                input.placeholder = `Reply to ${REPLY_TO_USERNAME}...`;
                input.focus();
            }
        });
    });

    list.querySelectorAll(".delete-comment").forEach(btn => {
        btn.addEventListener("click", () => deleteComment(btn.dataset.id));
    });
    roots.forEach(c => renderThread(c));
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

async function deletePost(postId) {
    openConfirm(
        "Ջնջել գրառումը",
        "Վստա՞հ ես, որ ուզում ես ջնջել այս գրառումը։ Այս գործողությունը չի կարող հետ վերադարձվել։",
        async () => {
            await fetch("/api/post/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    post_id: postId,
                    user_id: viewerId
                })
            });

            loadFeed();
        }
    );
}


async function likeComment(commentId) {
    await fetch("/api/comment/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            comment_id: commentId,
            user_id: viewerId
        })
    });

    openComments(CURRENT_COMMENT_POST);
}

let SHARE_POST_ID = null;

function sharePost(postId) {
    SHARE_POST_ID = postId;
    const modal = document.getElementById("share-modal");
    if (modal) modal.classList.remove("hidden");
}

function closeShareModal() {
    const modal = document.getElementById("share-modal");
    if (modal) modal.classList.add("hidden");
    SHARE_POST_ID = null;
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
    await fetch("/api/comment/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            comment_id: commentId,
            user_id: viewerId
        })
    });

    openComments(CURRENT_COMMENT_POST);
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

    function getShareLink() {
        return `https://domino-backend-iavj.onrender.com/portal/portal.html?post=${SHARE_POST_ID}`;
    }

    if (tgBtn) {
        tgBtn.onclick = () => {
            if (window.Telegram && Telegram.WebApp) {
                Telegram.WebApp.openTelegramLink(
                    `https://t.me/share/url?url=${encodeURIComponent(getShareLink())}`
                );
            }
            closeShareModal();
        };
    }

    if (copyBtn) {
        copyBtn.onclick = async () => {
            await navigator.clipboard.writeText(getShareLink());
            openInfo("Պատրաստ է", "Հղումը պատճենվեց 🙂");
            closeShareModal();
        };
    }

    if (globalBtn) {
        globalBtn.onclick = async () => {
            await fetch("/api/global/send", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    sender: viewerId,
                    text: `📢 Նոր գրառում՝ ${getShareLink()}`
                })
            });

            openInfo("Տարածվեց", "Գրառումը ուղարկվեց Global Chat");
            closeShareModal();
        };
    }

});
