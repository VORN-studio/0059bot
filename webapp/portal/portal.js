// portal.js

// 🔹 UID from URL
const urlParams = new URLSearchParams(window.location.search);
const uid = urlParams.get("uid") || "";

// 🔹 Safe Telegram object
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
const telegramUser = tg?.initDataUnsafe?.user || null;

document.addEventListener("DOMContentLoaded", () => {

    // ===============================
    //        LOAD USER PROFILE
    // ===============================
    async function loadProfile() {
        if (!uid) return;

        const res = await fetch(`/api/user/${uid}`);
        const data = await res.json();

        if (!data.ok || !data.user) return;

        const user = data.user;

        // avatar in top bar
        const topAvatar = document.getElementById("user-avatar");
        if (user.avatar && topAvatar) {
            topAvatar.src = user.avatar;
        }

        // avatar in profile card
        const profileAvatar = document.getElementById("profile-avatar");
        if (user.avatar && profileAvatar) {
            profileAvatar.src = user.avatar;
        }

        setUsername(user.username || "");
    }

    // ===============================
    //        USERNAME LOGIC
    // ===============================
    async function checkUsername() {
        if (!uid) return;

        const res = await fetch(`/api/user/${uid}`);
        const data = await res.json();
        if (!data.ok || !data.user) return;

        const savedName = data.user.username;
        const teleName = telegramUser?.username || null;

        if (savedName && savedName.trim() !== "") {
            setUsername(savedName);
            return;
        }

        if (teleName && teleName.trim() !== "") {
            await saveUsername(teleName);
            setUsername(teleName);
            return;
        }

        showUsernamePopup();
    }

    function setUsername(name) {
        const u1 = document.getElementById("username");
        const u2 = document.getElementById("profile-name");
        if (u1) u1.innerText = name;
        if (u2) u2.innerText = name;
    }

    async function saveUsername(name) {
        if (!uid) return;
        await fetch(`/api/set_username`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uid, username: name })
        });
    }

    function showUsernamePopup() {
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
            avatarInput.click();
            document.getElementById("settings-panel").classList.add("hidden");
        });
    }

    // file selected
    avatarInput.addEventListener("change", async function () {
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
        formData.append("uid", uid);

        await fetch("/api/upload_avatar", {
            method: "POST",
            body: formData
        });
    });

    // ===============================
    //      SETTINGS PANEL LOGIC
    // ===============================
    document.getElementById("settings-btn").onclick = () => {
        document.getElementById("settings-panel").classList.remove("hidden");
    };

    document.getElementById("settings-close").onclick = () => {
        document.getElementById("settings-panel").classList.add("hidden");
    };

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
            window.location.href = `/app?uid=${uid}`;
        });
    }

    // ===============================
    //            START
    // ===============================
    checkUsername();
    loadProfile();
});
