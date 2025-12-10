// -----------------------------
//   URL params
// -----------------------------
const urlParams = new URLSearchParams(window.location.search);

// ում պրոֆիլն ենք նայում
const profileId = urlParams.get("uid") || "";

// ով է դիտողը (viewer) — հաստատ URL-ով ենք պահում
const viewerFromUrl = urlParams.get("viewer") || "";

// եթե viewer չկա URL-ում, fallback → profileId
const viewerId = viewerFromUrl || profileId;

// արդյո՞ք սա իմ սեփական պրոֆիլն է
const isOwner = viewerId && profileId && String(viewerId) === String(profileId);


// ===============================
//   STARTUP
// ===============================
document.addEventListener("DOMContentLoaded", () => {
    // վերևի panel — ՄԻԱՅՆ viewer-ի մասին
    loadViewerPanel();

    // պրոֆիլ, որին մտել ենք (profileId)
    checkUsername();
    loadProfile();
    loadFollowStats();
    loadUsers("");

    // search input listener
    const search = document.getElementById("user-search");
    if (search) {
        search.addEventListener("input", () => {
            loadUsers(search.value);
        });
    }

    // settings panel
    initSettingsPanel();

    // follow կոճակ
    initFollowButton();

    // back կոճակ
    const backBtn = document.getElementById("back-btn");
    if (backBtn) {
        backBtn.addEventListener("click", () => {
            const backUid = viewerId || profileId || "";
            window.location.href = `/app?uid=${backUid}`;
        });
    }

    // tabs
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-page").forEach(p => p.classList.remove("active"));

            btn.classList.add("active");
            const tabId = btn.dataset.tab;
            document.getElementById(tabId).classList.add("active");
        });
    });

    // avatar upload
    initAvatarUpload();
});

// ===============================
//        LOAD USER PROFILE
// ===============================
async function loadProfile() {
    if (!profileId) return;

    try {
        const res = await fetch(`/api/user/${profileId}`);
        const data = await res.json();

        if (!data.ok || !data.user) return;

        const user = data.user;

        // avatar in profile card (մեծ կլոր նկարը)
        const profileAvatar = document.getElementById("profile-avatar");
        if (profileAvatar) {
            const avatarUrl = user.avatar && user.avatar !== ""
                ? user.avatar
                : "/portal/default.png";
            profileAvatar.src = avatarUrl;
        }

        // profile name (մեծ անունը)
        setUsername(user.username || "");
    } catch (e) {
        console.error("loadProfile error:", e);
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
        const teleName = telegramUser?.username || null;

        // եթե բազայում արդեն անուն կա → ուղղակի ցույց ենք տալիս
        if (savedName && savedName.trim() !== "") {
            setUsername(savedName);
            return;
        }

        // եթե սա իմ սեփական պրոֆիլն է
        if (isOwner) {
            // եթե Telegram username ունեմ → ավտոմատ օգտագործում ենք
            if (teleName && teleName.trim() !== "") {
                await saveUsername(teleName);
                setUsername(teleName);
                return;
            }
            // այլապես բացում ենք popup, որ ինքդ գրես
            showUsernamePopup();
        } else {
            // օտար պրոֆիլ է, անուն չունի → պարզապես թողնում ենք դատարկ
            setUsername("");
        }
    } catch (e) {
        console.error("checkUsername error:", e);
    }
}

// ❗ Այստեղ ԱԼԵՎԵՍ ՉԵՆՔ ԴԻՊՉՈՒՄ ՎԵՐԵՎԻ USERNAME-ին
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
    if (!topAvatar || !topUsername) return;

    // Viewer-ը վերցնում ենք տվյալների բազայից viewerId-ով
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
            topAvatar.src = user.avatar || "/portal/default.png";
            topUsername.innerText = user.username || "Unknown";
        })
        .catch(() => {
            topAvatar.src = "/portal/default.png";
            topUsername.innerText = "Unknown";
        });
}


// ===============================
//      FOLLOW STATS + STATE
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

// ===============================
//       FOLLOW BUTTON INIT
// ===============================
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
