const urlParams = new URLSearchParams(window.location.search);
const uid = urlParams.get("uid");
const tg = window.Telegram.WebApp;
const telegramUser = tg.initDataUnsafe?.user || null;

/* LOAD PROFILE DATA */
async function loadProfile() {
    const res = await fetch(`/api/user/${uid}`);
    const data = await res.json();
    if (user.avatar) {
        document.getElementById("user-avatar").src = user.avatar;
    }

    if (!data.ok || !data.user) return;

    const user = data.user;

    document.getElementById("username").innerText = user.username || "";
    document.getElementById("profile-name").innerText = user.username || "";
}

document.getElementById("change-avatar-btn").addEventListener("click", () => {
    document.getElementById("avatar-input").click();
});

document.getElementById("avatar-input").addEventListener("change", async function () {
    const file = this.files[0];
    if (!file) return;

    // preview immediately
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById("user-avatar").src = e.target.result;
    };
    reader.readAsDataURL(file);

    // upload to backend
    const formData = new FormData();
    formData.append("avatar", file);
    formData.append("uid", uid);

    await fetch("/api/upload_avatar", {
        method: "POST",
        body: formData
    });
});


/* TAB SWITCHING */
document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-page").forEach(p => p.classList.remove("active"));

        btn.classList.add("active");
        document.getElementById(btn.dataset.tab).classList.add("active");
    });
});

async function checkUsername() {
    const res = await fetch(`/api/user/${uid}`);
    const data = await res.json();

    if (!data.ok || !data.user) return;

    const savedName = data.user.username;
    const teleName = telegramUser?.username || null;

    // If saved in DB → use it
    if (savedName && savedName.trim() !== "") {
        setUsername(savedName);
        return;
    }

    // If Telegram username exists → save to DB
    if (teleName && teleName.trim() !== "") {
        await saveUsername(teleName);
        setUsername(teleName);
        return;
    }

    // Show popup only once if both are missing
    showUsernamePopup();
}



function setUsername(name) {
    document.getElementById("username").innerText = name;
    document.getElementById("profile-name").innerText = name;
}

async function saveUsername(name) {
    await fetch(`/api/set_username`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: uid, username: name })
    });
}

function showUsernamePopup() {
    document.getElementById("username-popup").classList.remove("hidden");

    document.getElementById("username-save").onclick = async () => {
        let newName = document.getElementById("username-input").value.trim();
        if (newName.length < 3) return alert("Username-ը պետք է >= 3 սիմվոլ լինի");

        await saveUsername(newName);
        setUsername(newName);
        document.getElementById("username-popup").classList.add("hidden");
    };
}


document.getElementById("back-btn").addEventListener("click", () => {
    if (!uid) return;

    // գլխավոր WebApp էջ
    window.location.href = `/app?uid=${uid}`;
});

checkUsername();
loadProfile();