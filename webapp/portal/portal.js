const urlParams = new URLSearchParams(window.location.search);
const uid = urlParams.get("uid");

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

    if (data.username && data.username.trim() !== "") {
        // username exists → continue normal flow
        document.getElementById("username").innerText = data.username;
        document.getElementById("profile-name").innerText = data.username;
        return;
    }

    // No username → show popup
    document.getElementById("username-popup").classList.remove("hidden");

    document.getElementById("username-save").addEventListener("click", async () => {
        const newName = document.getElementById("username-input").value.trim();

        if (newName.length < 3) {
            alert("Username-ը պետք է լինի նվազագույնը 3 սիմվոլ։");
            return;
        }

        // save username to DB
        await fetch(`/api/set_username`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uid: uid, username: newName })
        });

        document.getElementById("username-popup").classList.add("hidden");
        document.getElementById("username").innerText = newName;
        document.getElementById("profile-name").innerText = newName;
    });
}



document.getElementById("back-btn").addEventListener("click", () => {
    if (!uid) return;

    // գլխավոր WebApp էջ
    window.location.href = `/app?uid=${uid}`;
});

checkUsername();
loadProfile();