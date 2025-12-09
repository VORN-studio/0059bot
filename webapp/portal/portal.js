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

/* INIT */
loadProfile();
