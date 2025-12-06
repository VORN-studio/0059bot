function closeTasks() {
    window.location.href = "../index.html";
}

function hideAll() {
    document.querySelectorAll(".screen").forEach(s => {
        s.style.display = "none";
    });
}

function openCategory(cat) {
    hideAll();
    document.getElementById("screen-" + cat).style.display = "block";
}

const API_BASE = "https://domino-backend-iavj.onrender.com";

async function loadBalance() {
    const uid = new URLSearchParams(window.location.search).get("uid");

    if (!uid) {
        document.getElementById("tasks-balance").textContent = "—";
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/api/user/${uid}`);
        const data = await res.json();

        if (data.ok && data.user) {
            document.getElementById("tasks-balance").textContent =
                data.user.balance_usd.toFixed(2) + " $";
        }
    } catch {
        document.getElementById("tasks-balance").textContent = "—";
    }
}

async function addReward(amount) {
    const uid = new URLSearchParams(window.location.search).get("uid");

    const res = await fetch(`${API_BASE}/api/task_reward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            user_id: uid,
            amount: amount
        })
    });

    const data = await res.json();

    if (data.ok) {
        // update balance display
        document.getElementById("tasks-balance").textContent =
            data.new_balance.toFixed(2) + " $";
    }
}

addReward(0.25);
loadBalance();
// default
hideAll();
