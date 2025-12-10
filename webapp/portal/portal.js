// portal.js

// -----------------------------
//   URL / Telegram user
// -----------------------------
const urlParams = new URLSearchParams(window.location.search);

// ում պրոֆիլն ենք նայում (profile)
const profileId = urlParams.get("uid") || "";

// Telegram WebApp user (viewer)
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
const telegramUser = tg?.initDataUnsafe?.user || null;

// ով է դիտողը (viewer) — եթե Telegram-ից է, վերցնում ենք իրեն,
// եթե բացել են ուղղակի browser-ով, viewer-ը նույնն է, ինչ profile-ը
const viewerId = telegramUser?.id ? String(telegramUser.id) : profileId;

// արդյո՞ք սա իմ սեփական պրոֆիլն է
const isOwner = viewerId && profileId && String(viewerId) === String(profileId);

document.addEventListener("DOMContentLoaded", () => {

    document.addEventListener("DOMContentLoaded", () => {

    // ======== LOAD VIEWER PANEL (TOP BAR) ========
    loadViewerPanel();

    // ======== USER PROFILE (profileId) ========
    checkUsername();
    loadProfile();
    loadFollowStats();
    loadUsers("");
});



    // ===============================
    //        LOAD USER PROFILE
    // ===============================
    async function loadProfile() {
        if (!profileId) return;

        const res = await fetch(`/api/user/${profileId}`);
        const data = await res.json();

        if (!data.ok || !data.user) return;

        const user = data.user;

        // avatar in profile card
        const profileAvatar = document.getElementById("profile-avatar");
        if (user.avatar && profileAvatar) {
            profileAvatar.src = user.avatar;
        }

        setUsername(user.username || "");

        // ---- FOLLOW BUTTON visibility ----
        const followBtn = document.getElementById("follow-btn");
        if (followBtn) {
            if (!profileId || isOwner) {
                // իմ սեփական պրոֆիլն է կամ uid չկա → follow կոճակ պետք չի
                followBtn.style.display = "none";
            } else {
                followBtn.style.display = "inline-block";
            }
        }
    }

    // ===============================
    //        SEARCH USERS
    // ===============================
    const search = document.getElementById("user-search");
    if (search) {
        search.addEventListener("input", () => {
            loadUsers(search.value);
        });
    }

    // ===============================
    //        USERNAME LOGIC
    // ===============================
    async function checkUsername() {
        if (!profileId) return;

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
    }


    function setUsername(name) {
        const u1 = document.getElementById("username");
        const u2 = document.getElementById("profile-name");
        if (u1) u1.innerText = name;
        if (u2) u2.innerText = name;
    }

    async function saveUsername(name) {
        // username-ը պահպանվում է ՄԻԱՅՆ viewer-ի համար
        if (!viewerId) return;
        await fetch(`/api/set_username`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uid: viewerId, username: name })
        });
    }

    function showUsernamePopup() {
        if (!isOwner) return; // ապահովության համար

        const popup = document.getElementById("username-popup");
        const input = document.getElementById("username-input");
        const btn = document.getElementById("username-save");

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
    const avatarInput = document.getElementById("avatar-input");
    const avatarTop = document.getElementById("user-avatar");
    const avatarProfile = document.getElementById("profile-avatar");

    // settings → change avatar click
    const changeAvatarBtn = document.getElementById("change-avatar-open");
    if (changeAvatarBtn) {
        changeAvatarBtn.addEventListener("click", () => {
            if (!isOwner) return; // այլոց avatar-ը չենք թողնում փոխել
            avatarInput.click();
            document.getElementById("settings-panel").classList.add("hidden");
        });
    }

    // file selected
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
            formData.append("uid", viewerId); // avatar-ը պահում ենք OWNER-ի համար

            await fetch("/api/upload_avatar", {
                method: "POST",
                body: formData
            });
        });
    }

    // ===============================
    //      SETTINGS PANEL LOGIC
    // ===============================
    const settingsBtn = document.getElementById("settings-btn");
    const settingsPanel = document.getElementById("settings-panel");
    const settingsClose = document.getElementById("settings-close");
    const changeUsernameBtn = document.getElementById("change-username-open");

    if (settingsBtn) {
        if (!isOwner) {
            // եթե օտար պրոֆիլ է → settings չենք ցույց տալիս
            settingsBtn.style.display = "none";
        } else {
            settingsBtn.onclick = () => {
                settingsPanel.classList.remove("hidden");
            };
        }
    }

    if (settingsClose) {
        settingsClose.onclick = () => {
            settingsPanel.classList.add("hidden");
        };
    }

    if (changeUsernameBtn) {
        changeUsernameBtn.addEventListener("click", () => {
            if (!isOwner) return;
            showUsernamePopup();
            settingsPanel.classList.add("hidden");
        });
    }

    // ===============================
    //            TABS
    // ===============================
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-page").forEach(p => p.classList.remove("active"));

            btn.classList.add("active");
            const tabId = btn.dataset.tab;
            document.getElementById(tabId).classList.add("active");
        });
    });

    // ===============================
    //         BACK BUTTON
    // ===============================
    const backBtn = document.getElementById("back-btn");
    if (backBtn) {
        backBtn.addEventListener("click", () => {
            // վերադառնում ենք app մեր user-ի uid-ով, ոչ թե profile-ի
            const backUid = viewerId || profileId || "";
            window.location.href = `/app?uid=${backUid}`;
        });
    }

    // ===============================
    //       FOLLOW BUTTON LOGIC
    // ===============================
    const followBtn = document.getElementById("follow-btn");
    if (followBtn) {
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
                    await loadFollowStats(); // թարմացնենք counters-ը
                } else {
                    alert("Չստացվեց follow անել");
                }
            } catch (e) {
                console.error(e);
            }
        });
    }

    // ===============================
    //        STARTUP CALLS
    // ===============================
    checkUsername();
    loadProfile();
    loadFollowStats();
    loadUsers("");
});

// ===============================
//        LOAD USERS LIST
// ===============================
async function loadUsers(search = "") {
    const res = await fetch(`/api/search_users?q=${search}&viewer=${viewerId}`);
    const data = await res.json();

    if (!data.ok) return;

    const box = document.getElementById("users-list");
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

        div.innerHTML = `
            <img src="${u.avatar}" style="width:40px;height:40px;border-radius:50%;margin-right:10px;">
            <div style="flex-grow:1;font-size:16px;">${u.username}</div>
            <button data-id="${u.user_id}"
                style="padding:6px 12px;border-radius:8px;background:#3478f6;color:white;">
                Բացել
            </button>
        `;

        div.querySelector("button").onclick = () => {
            window.location.href = `/portal/portal.html?uid=${u.user_id}`;
        };

        box.appendChild(div);
    });
}


function loadViewerPanel() {
    const topAvatar = document.getElementById("user-avatar");
    const topUsername = document.getElementById("username");

    // Եթե Telegram-ից է բացվել WebApp-ը
    if (telegramUser) {
        if (telegramUser.photo_url) {
            topAvatar.src = telegramUser.photo_url;
        } else {
            topAvatar.src = "/portal/default.png";
        }

        topUsername.innerText = telegramUser.username || "Unknown";
        return;
    }

    // Եթե Telegram WebApp-ում չենք, վերցնում ենք viewerId-ից տվյալները
    fetch(`/api/user/${viewerId}`)
        .then(r => r.json())
        .then(d => {
            if (!d.ok) return;
            const user = d.user;

            topAvatar.src = user.avatar || "/portal/default.png";
            topUsername.innerText = user.username || "Unknown";
        });
}



// ===============================
//      FOLLOW STATS + STATE
// ===============================
async function loadFollowStats() {
    if (!profileId) return;

    try {
        // followers/following counters
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

        // եթե viewer կա և սա իր սեփական պրոֆիլը չի → ստուգենք follow state-ը
        const followBtn = document.getElementById("follow-btn");
        if (followBtn && viewerId && !isOwner) {
            const sRes = await fetch(`/api/is_following/${viewerId}/${profileId}`);
            const sData = await sRes.json();
            if (sData.ok) {
                followBtn.innerText = sData.is_following ? "Following" : "Follow";
            }
        }
    } catch (e) {
        console.error(e);
    }
}
