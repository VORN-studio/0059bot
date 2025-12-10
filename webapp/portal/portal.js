// portal.js

// 🔹 UID from URL
const urlParams = new URLSearchParams(window.location.search);
const uid = urlParams.get("uid") || "";

// 🔹 Safe Telegram object (որ local browser-ում չընկնի)
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
const telegramUser = tg?.initDataUnsafe?.user || null;

document.addEventListener("DOMContentLoaded", () => {
    // ---------- AVATAR + USERNAME LOADING ----------
    async function loadProfile() {
        if (!uid) return;

        const res = await fetch(`/api/user/${uid}`);
        const data = await res.json();

        if (!data.ok || !data.user) return;

        const user = data.user;

        // avatar DB-ից
        if (user.avatar) {
            const img = document.getElementById("user-avatar");
            if (img) img.src = user.avatar;
        }

        setUsername(user.username || "");
    }

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
        if (u1) u1.innerText = name || "";
        if (u2) u2.innerText = name || "";
    }

    async function saveUsername(name) {
        if (!uid) return;
        await fetch(`/api/set_username`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uid: uid, username: name })
        });
    }

    function showUsernamePopup() {
        const popup = document.getElementById("username-popup");
        const input = document.getElementById("username-input");
        const btnSave = document.getElementById("username-save");

        if (!popup || !input || !btnSave) return;

        popup.classList.remove("hidden");

        btnSave.onclick = async () => {
            let newName = input.value.trim();
            if (newName.length < 3) {
                alert("Username-ը պետք է >= 3 սիմվոլ լինի");
                return;
            }

            await saveUsername(newName);
            setUsername(newName);
            popup.classList.add("hidden");
        };
    }

    // ---------- AVATAR UPLOAD ----------
    const changeBtn = document.getElementById("change-avatar-btn");
    const avatarInput = document.getElementById("avatar-input");
    const avatarImg = document.getElementById("user-avatar");

    if (changeBtn && avatarInput) {
        changeBtn.addEventListener("click", () => {
            avatarInput.click();
        });

        avatarInput.addEventListener("change", async function () {
            const file = this.files[0];
            if (!file) return;

            // preview
            if (avatarImg) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    avatarImg.src = e.target.result;
                };
                reader.readAsDataURL(file);
            }

            const formData = new FormData();
            formData.append("avatar", file);
            formData.append("uid", uid);

            await fetch("/api/upload_avatar", {
                method: "POST",
                body: formData
            });
        });
    }
        // SETTINGS OPEN/CLOSE
    document.getElementById("settings-btn").onclick = () => {
        document.getElementById("settings-panel").classList.remove("hidden");
    };

    document.getElementById("settings-close").onclick = () => {
        document.getElementById("settings-panel").classList.add("hidden");
    };

    // OPEN AVATAR PICKER
    document.getElementById("change-avatar-open").onclick = () => {
        document.getElementById("avatar-input").click();
        document.getElementById("settings-panel").classList.add("hidden");
    };

    // ---------- TABS ----------
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-page").forEach(p => p.classList.remove("active"));

            btn.classList.add("active");
            const tabId = btn.dataset.tab;
            if (tabId) {
                const page = document.getElementById(tabId);
                if (page) page.classList.add("active");
            }
        });
    });

    // ---------- BACK BUTTON ----------
    const backBtn = document.getElementById("back-btn");
    if (backBtn && uid) {
        backBtn.addEventListener("click", () => {
            window.location.href = `/app?uid=${uid}`;
        });
    }

    // ---------- START ----------
    checkUsername();
    loadProfile();
});
