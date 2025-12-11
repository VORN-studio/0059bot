// -----------------------------
//   URL params
// -----------------------------
const urlParams = new URLSearchParams(window.location.search);
const profileId = urlParams.get("uid") || "";
const viewerFromUrl = urlParams.get("viewer") || "";
const viewerId = viewerFromUrl || profileId;
const isOwner = viewerId && profileId && String(viewerId) === String(profileId);

// քո ID-ն այս պորտալում
const CURRENT_UID = viewerId;

// Current active tab (feed | users | messages | chat)
let CURRENT_TAB = "feed";

// DM՝ ում հետ ենք հիմա խոսում
let CURRENT_DM_TARGET = null;

// ===============================
//      STARTUP
// ===============================
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
});

// ===============================
//      TABS LOGIC
// ===============================
function initTabs() {
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {

            // reset UI
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-page").forEach(p => p.classList.remove("active"));

            btn.classList.add("active");
            const tabId = btn.dataset.tab;

            // 🔥 ԱՅՍ ՏՈՂԸ ՊԱՐՏԱԴԻՐ Է
            CURRENT_TAB = tabId;

            const page = document.getElementById(tabId);
            if (page) page.classList.add("active");

            const globalBox = document.getElementById("global-chat");
            const dmBox = document.getElementById("dm-chat");

            // ========= GLOBAL CHAT =========
            if (tabId === "chat") {
                if (globalBox) globalBox.style.display = "flex";
                if (dmBox) dmBox.style.display = "none";

                loadGlobalChat();
                startGlobalRefresh();   // ← ԱՅՍԸ ԱՐԴԵՆ ԿԱՄԱՎՈՐ ԱՇԽԱՏՈՒՄ Է
            } else {
                if (globalBox) globalBox.style.display = "none";
                stopGlobalRefresh();
            }

            // ========= DM LIST =========
            if (tabId === "messages") {
                if (dmBox) dmBox.style.display = "none";
                loadDMList();
            } else {
                if (dmBox) dmBox.style.display = "none";
            }

            // ========= STOP DM REFRESH =========
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
    if (window.GLOBAL_REFRESH_INTERVAL) return; // prevent double refresh

    window.GLOBAL_REFRESH_INTERVAL = setInterval(() => {
        loadGlobalChat();
    }, 2000); // update every 2 sec
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

    loadGlobalChat();   // ← անմիջապես ցուցադրում ենք
    startGlobalRefresh();  // ← ապահովում ենք auto refresh
}


function stopGlobalRefresh() {
    if (window.GLOBAL_REFRESH_INTERVAL) {
        clearInterval(window.GLOBAL_REFRESH_INTERVAL);
        window.GLOBAL_REFRESH_INTERVAL = null;
    }
}


// ===============================
//      CHAT EVENTS
// ===============================
function initChatEvents() {
    // GLOBAL CHAT
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

    // DM CHAT
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

// ===============================
//        DM LIST
// ===============================
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

// ===============================
//        LOAD PROFILE
// ===============================
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

        // 🔥 Ավելացնում ենք status-ի դեկոր
        decorateUsername(user.status_level || 0, user.status_name || "None");
    } catch (e) {
        console.error("loadProfile error:", e);
    }
}


// ===============================
//        GLOBAL CHAT
// ===============================
async function loadGlobalChat() {
    // եթե Global Chat tab-ում չենք, անիմաստ է ամեն անգամ թարմացնել
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

// ===============================
//        DM CHAT
// ===============================
async function openDM(targetId) {
    if (!targetId) return;
    CURRENT_DM_TARGET = targetId;

    const dmBox = document.getElementById("dm-chat");
    const globalBox = document.getElementById("global-chat");

    if (dmBox) dmBox.style.display = "flex";
    if (globalBox) globalBox.style.display = "none";

    await loadDM();

    // =============================
    //  🔥 Auto-refresh every 2 sec
    // =============================
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

// ===============================
//        USERNAME LOGIC
// ===============================
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

// ===============================
//        STATUS DECORATION
// ===============================
function decorateUsername(level, name) {
    const el = document.getElementById("profile-name");
    if (!el) return;

    // մաքրում ենք հների classes-ը
    for (let i = 0; i <= 10; i++) {
        el.classList.remove(`status-${i}`);
    }

    const lvl = Number(level) || 0;
    el.classList.add(`status-${lvl}`);

    // ցանկության դեպքում՝ title tooltip
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

// ===============================
//          AVATAR LOGIC
// ===============================
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

// ===============================
//      SETTINGS PANEL LOGIC
// ===============================
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

// ===============================
//        LOAD USERS LIST
// ===============================
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

// ===============================
//      VIEWER TOP PANEL
// ===============================
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

// ===============================
//      FOLLOW STATS + BUTTON
// ===============================
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

        // 👉 եթե արդեն Following է, երկրորդ անգամ չի սարքում request
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
                // եթե սերվերը ասում է արդեն follow արած ես
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

