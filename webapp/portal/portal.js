// -----------------------------
//   URL params
// -----------------------------
const urlParams = new URLSearchParams(window.location.search);
const profileId = urlParams.get("uid") || "";
const viewerFromUrl = urlParams.get("viewer") || "";
const viewerId = viewerFromUrl || profileId;
const isOwner = viewerId && profileId && String(viewerId) === String(profileId);
const CURRENT_UID = viewerId;

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

    const backBtn = document.getElementById("back-btn");
    if (backBtn) {
        backBtn.addEventListener("click", () => {
            const backUid = viewerId || profileId || "";
            window.location.href = `/app?uid=${backUid}`;
        });
    }

    document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {

        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-page").forEach(p => p.classList.remove("active"));

        btn.classList.add("active");
        const tabId = btn.dataset.tab;
        document.getElementById(tabId).classList.add("active");

        if (tabId === "chat") {
            document.getElementById("global-chat").style.display = "flex";
            loadGlobalChat();
        } else {
            document.getElementById("global-chat").style.display = "none";
        }

        if (tabId === "messages") {
            document.getElementById("dm-chat").style.display = "none";
            loadDMList(); // ← ֆոլոու արած մարդկանց ցուցակը
        }else {
            document.getElementById("dm-chat").style.display = "none";
        }
    });
});

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

    initAvatarUpload();
});

async function loadDMList() {
    const res = await fetch(`/api/follows/list?uid=${viewerId}`);
    const data = await res.json();
    if (!data.ok) return;

    const box = document.getElementById("pm-list");
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
            }

            else if (user.avatar && user.avatar !== "") {
                avatarUrl = user.avatar;
            }

            profileAvatar.src = avatarUrl;
        }

        setUsername(user.username || "");

    } catch (e) {
        console.error("loadProfile error:", e);
    }
}

async function loadGlobalChat() {
    const res = await fetch(`/api/global/history`);
    const data = await res.json();

    if (!data.ok) return;

    const box = document.getElementById("global-messages");
    box.innerHTML = "";

    data.messages.forEach(msg => {
        const div = document.createElement("div");
        div.innerHTML = `<b>${msg.sender}</b>: ${msg.text}`;
        div.style.marginBottom = "6px";
        box.appendChild(div);
    });

    box.scrollTop = box.scrollHeight;
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
}

document.getElementById("global-send").onclick = sendGlobalMessage;

document.getElementById("global-input").addEventListener("keypress", function(e){
    if (e.key === "Enter") sendGlobalMessage();
});

let CURRENT_DM_TARGET = null;

async function openDM(targetId) {
    CURRENT_DM_TARGET = targetId;

    document.getElementById("dm-chat").style.display = "flex";
    document.getElementById("global-chat").style.display = "none";

    loadDM();
}

async function loadDM() {
    if (!CURRENT_DM_TARGET) return;

    const res = await fetch(`/api/message/history?u1=${CURRENT_UID}&u2=${CURRENT_DM_TARGET}`);
    const data = await res.json();

    if (!data.ok) return;

    const box = document.getElementById("dm-messages");
    box.innerHTML = "";

    data.messages.forEach(m => {
        const div = document.createElement("div");
        div.innerHTML = `<b>${m.sender == CURRENT_UID ? "You" : m.sender}</b>: ${m.text}`;
        div.style.marginBottom = "6px";
        box.appendChild(div);
    });

    box.scrollTop = box.scrollHeight;
}

async function sendDM() {
    const input = document.getElementById("dm-input");
    const text = input.value.trim();
    if (text === "") return;

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
    loadDM();
}

document.getElementById("dm-send").onclick = sendDM;

document.getElementById("dm-input").addEventListener("keypress", function(e){
    if (e.key === "Enter") sendDM();
});

async function checkUsername() {
    if (!profileId) return;

    try {
        const res = await fetch(`/api/user/${profileId}`);
        const data = await res.json();
        if (!data.ok || !data.user) return;

        const savedName = data.user.username;
        const teleName = telegramUser?.username || null;

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
    if (!viewerId) return; // username-ը պահում ենք OWNER-ի համար
    await fetch(`/api/set_username`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: viewerId, username: name })
    });
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
            } else {
                alert("Չստացվեց follow անել");
            }
        } catch (e) {
            console.error(e);
        }
    });
}
