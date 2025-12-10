const urlParams = new URLSearchParams(window.location.search);
const uid = urlParams.get("uid");
const tg = window.Telegram.WebApp;
const telegramUser = tg.initDataUnsafe?.user || null;

/* LOAD PROFILE DATA */
async function loadProfile() {
    const res = await fetch(`/api/user/${uid}`);
    const data = await res.json();

    document.getElementById("username").innerText = data.username;
    document.getElementById("profile-name").innerText = data.username;
}

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

    let savedName = data.username;
    let teleName = telegramUser?.username || null;

    // 1) Եթե DB already has username → օգտագործում ենք
    if (savedName && savedName.trim() !== "") {
        setUsername(savedName);
        return;
    }

    // 2) Եթե Telegram username կա → պահպանում ենք DB-ում
    if (teleName && teleName.trim() !== "") {
        await saveUsername(teleName);
        setUsername(teleName);
        return;
    }

    // 3) Եթե username չկա → բացում ենք popup (միայն առաջին անգամ)
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